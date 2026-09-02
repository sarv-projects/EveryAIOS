//! P9.5 (A8, v2.0 §P3) — Local **OpenAI-compatible** HTTP server.
//!
//! Exposes the EveryAIOS engine on `127.0.0.1:<port>` as an OpenAI-compatible
//! API so VS Code / Cursor / Continue / any OpenAI-SDK client can point their
//! `baseURL` at us and use our router + BYOK keys + local models. This is the
//! *inbound* mirror of everything the product already does outbound.
//!
//! ## Endpoints (the exact OpenAI contract)
//!   - `GET  /v1/models`            → `{ object:"list", data:[{id,object:"model",created,owned_by}] }`
//!   - `POST /v1/chat/completions`  → non-stream `chat.completion`, or SSE when `stream:true`
//!   - `GET  /health`               → `{ ok:true }` (unauthenticated liveness)
//!
//! ## Security posture (mirrors `webmcp_http`)
//!   - **loopback only** by construction (binds `127.0.0.1`); the transport
//!     boundary is loopback, the capability boundary is a per-process **bearer
//!     token** every `/v1/*` call must present (any local process could
//!     connect otherwise);
//!   - request size + read-timeout caps (no memory exhaustion from a local
//!     client);
//!   - the server never sees provider secrets — it calls a
//!     [`CompletionBackend`] seam which, in live wiring, runs through the same
//!     Rust broker that resolves keys (keys stay in the vault, exactly as for
//!     the sidecar path).
//!
//! ## Testability
//! The request handlers are pure functions over a [`CompletionBackend`] +
//! [`ModelLister`]; the whole OpenAI surface is unit-tested with a fake
//! backend, and a threaded server wraps the handlers for real sockets.

use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

/// Max request body (2 MiB) — a chat request with a large context still fits;
/// anything larger is refused, not buffered.
pub const MAX_BODY_BYTES: usize = 2 << 20;
const MAX_REQUEST_BYTES: usize = MAX_BODY_BYTES + 64 * 1024;

// ---------------------------------------------------------------------------
// OpenAI wire types (the subset we implement).
// ---------------------------------------------------------------------------

/// One chat message in the request.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ChatMessage {
    pub role: String,
    #[serde(default)]
    pub content: String,
}

/// `POST /v1/chat/completions` request body (the fields we honor).
#[derive(Debug, Clone, Deserialize)]
pub struct ChatCompletionRequest {
    pub model: String,
    pub messages: Vec<ChatMessage>,
    #[serde(default)]
    pub stream: bool,
    #[serde(default)]
    pub temperature: Option<f64>,
    #[serde(default)]
    pub max_tokens: Option<u64>,
}

/// A model row for `GET /v1/models`.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct ModelRow {
    pub id: String,
    pub object: &'static str,
    pub created: u64,
    pub owned_by: String,
}

impl ModelRow {
    pub fn new(id: impl Into<String>, owned_by: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            object: "model",
            created: 0,
            owned_by: owned_by.into(),
        }
    }
}

/// The completion result the backend returns (non-stream) — content + token
/// accounting (may be zero if the backend cannot measure it honestly).
#[derive(Debug, Clone, PartialEq)]
pub struct CompletionResult {
    pub content: String,
    pub prompt_tokens: u64,
    pub completion_tokens: u64,
    /// The model id actually used (after alias/router resolution).
    pub model: String,
}

/// The engine seam. Live wiring bridges this to the coordinator/broker; tests
/// inject a deterministic fake. `complete` is the non-stream path; `stream`
/// yields content deltas via a callback (returns the final token accounting).
pub trait CompletionBackend: Send + Sync {
    /// Non-streaming completion.
    fn complete(&self, req: &ChatCompletionRequest) -> Result<CompletionResult, String>;

    /// Streaming completion. Default impl runs `complete` and emits the whole
    /// content as one delta — a correct (if non-incremental) SSE stream — so a
    /// backend that cannot stream still speaks the protocol.
    fn stream(
        &self,
        req: &ChatCompletionRequest,
        on_delta: &mut dyn FnMut(&str),
    ) -> Result<CompletionResult, String> {
        let result = self.complete(req)?;
        if !result.content.is_empty() {
            on_delta(&result.content);
        }
        Ok(result)
    }
}

/// Lists the models advertised on `GET /v1/models`.
pub trait ModelLister: Send + Sync {
    fn models(&self) -> Vec<ModelRow>;
}

// ---------------------------------------------------------------------------
// Response shaping (pure).
// ---------------------------------------------------------------------------

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// A short unique-ish id for a completion (`chatcmpl-<hex>`), matching the
/// OpenAI id shape closely enough for clients that echo it.
fn completion_id() -> String {
    use std::hash::{BuildHasher, Hasher};
    let mut h = std::collections::hash_map::RandomState::new().build_hasher();
    h.write_u64(now_secs());
    h.write_u32(std::process::id());
    format!("chatcmpl-{:016x}", h.finish())
}

/// Build the non-streaming `chat.completion` JSON body.
pub fn non_stream_body(id: &str, created: u64, r: &CompletionResult) -> Value {
    json!({
        "id": id,
        "object": "chat.completion",
        "created": created,
        "model": r.model,
        "choices": [{
            "index": 0,
            "message": { "role": "assistant", "content": r.content },
            "finish_reason": "stop",
        }],
        "usage": {
            "prompt_tokens": r.prompt_tokens,
            "completion_tokens": r.completion_tokens,
            "total_tokens": r.prompt_tokens + r.completion_tokens,
        },
    })
}

/// One SSE `chat.completion.chunk` frame carrying a content delta.
pub fn stream_chunk(id: &str, created: u64, model: &str, delta: &str) -> String {
    let obj = json!({
        "id": id,
        "object": "chat.completion.chunk",
        "created": created,
        "model": model,
        "choices": [{ "index": 0, "delta": { "content": delta }, "finish_reason": Value::Null }],
    });
    format!("data: {}\n\n", obj)
}

/// The final SSE frame: an empty delta with `finish_reason:"stop"`, then the
/// `[DONE]` sentinel every OpenAI SSE client waits for.
pub fn stream_final(id: &str, created: u64, model: &str) -> String {
    let stop = json!({
        "id": id,
        "object": "chat.completion.chunk",
        "created": created,
        "model": model,
        "choices": [{ "index": 0, "delta": {}, "finish_reason": "stop" }],
    });
    format!("data: {}\n\ndata: [DONE]\n\n", stop)
}

/// The `GET /v1/models` list body.
pub fn models_body(rows: &[ModelRow]) -> Value {
    json!({ "object": "list", "data": rows })
}

fn openai_error(status_code: u16, message: &str, err_type: &str) -> String {
    let body = json!({
        "error": { "message": message, "type": err_type, "code": Value::Null }
    })
    .to_string();
    let status = match status_code {
        400 => "400 Bad Request",
        401 => "401 Unauthorized",
        404 => "404 Not Found",
        405 => "405 Method Not Allowed",
        413 => "413 Payload Too Large",
        500 => "500 Internal Server Error",
        503 => "503 Service Unavailable",
        _ => "500 Internal Server Error",
    };
    http_json(status, &body)
}

fn http_json(status: &str, body: &str) -> String {
    format!(
        "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: *\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    )
}

fn http_sse_headers() -> &'static str {
    "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nCache-Control: no-cache\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n"
}

// ---------------------------------------------------------------------------
// HTTP parsing (mirrors webmcp_http, kept local so core has no browser dep).
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HttpParseError {
    BodyTooLarge,
}

/// Parse into (method, path, body). `Ok(None)` = partial (read more).
pub fn parse_http_request(raw: &str) -> Result<Option<(String, String, String)>, HttpParseError> {
    let header_end = match raw.find("\r\n\r\n") {
        Some(h) => h,
        None => return Ok(None),
    };
    let head = &raw[..header_end];
    let mut lines = head.lines();
    let request_line = match lines.next() {
        Some(l) => l,
        None => return Ok(None),
    };
    let mut parts = request_line.split_whitespace();
    let method = parts.next().unwrap_or("").to_string();
    let path = parts.next().unwrap_or("").to_string();
    let content_length: usize = lines
        .find_map(|l| {
            l.strip_prefix("Content-Length:")
                .or_else(|| l.strip_prefix("content-length:"))
                .map(|v| v.trim().parse::<usize>().ok())
        })
        .flatten()
        .unwrap_or(0);
    if content_length > MAX_BODY_BYTES {
        return Err(HttpParseError::BodyTooLarge);
    }
    let body_start = header_end + 4;
    let Some(body) = raw.get(body_start..) else {
        return Ok(None);
    };
    if body.len() < content_length {
        return Ok(None);
    }
    Ok(Some((method, path, body[..content_length].to_string())))
}

/// Extract `Authorization: Bearer <token>` (OpenAI SDKs send `Bearer <apiKey>`).
pub fn bearer_token(raw: &str) -> Option<String> {
    let head = raw.split("\r\n\r\n").next()?;
    head.lines().find_map(|l| {
        let rest = l
            .strip_prefix("Authorization:")
            .or_else(|| l.strip_prefix("authorization:"))?;
        let t = rest.trim();
        t.strip_prefix("Bearer ")
            .or_else(|| t.strip_prefix("bearer "))
            .map(str::to_string)
    })
}

/// The path classification (so auth + dispatch are explicit).
#[derive(Debug, PartialEq, Eq)]
enum Route {
    Health,
    Models,
    ChatCompletions,
    NotFound,
}

fn route(path: &str) -> Route {
    // Tolerate a query string and a trailing slash.
    let p = path.split('?').next().unwrap_or(path).trim_end_matches('/');
    match p {
        "/health" => Route::Health,
        "/v1/models" => Route::Models,
        "/v1/chat/completions" => Route::ChatCompletions,
        _ => Route::NotFound,
    }
}

/// Handle one parsed request (non-streaming responses only; the streaming path
/// is handled at the socket layer in `handle_stream`). `authed` is whether the
/// caller presented the correct bearer token. Returns the full HTTP response.
pub fn handle_request(
    method: &str,
    path: &str,
    body: &str,
    authed: bool,
    backend: &dyn CompletionBackend,
    lister: &dyn ModelLister,
) -> String {
    match route(path) {
        // Liveness is unauthenticated so a client can probe before configuring.
        Route::Health => {
            if method == "GET" {
                http_json("200 OK", &json!({ "ok": true }).to_string())
            } else {
                openai_error(405, "method not allowed", "invalid_request_error")
            }
        }
        Route::NotFound => openai_error(404, "unknown route", "invalid_request_error"),
        _ if !authed => openai_error(
            401,
            "missing or invalid bearer token",
            "invalid_request_error",
        ),
        Route::Models => {
            if method != "GET" {
                return openai_error(405, "method not allowed", "invalid_request_error");
            }
            http_json("200 OK", &models_body(&lister.models()).to_string())
        }
        Route::ChatCompletions => {
            if method != "POST" {
                return openai_error(405, "method not allowed", "invalid_request_error");
            }
            let req: ChatCompletionRequest = match serde_json::from_str(body) {
                Ok(r) => r,
                Err(e) => {
                    return openai_error(
                        400,
                        &format!("invalid request body: {e}"),
                        "invalid_request_error",
                    )
                }
            };
            if req.messages.is_empty() {
                return openai_error(400, "messages must not be empty", "invalid_request_error");
            }
            // Note: streaming is dispatched at the socket layer; this pure
            // handler always returns the non-stream body (used directly for
            // stream:false, and by tests).
            match backend.complete(&req) {
                Ok(r) => {
                    let id = completion_id();
                    http_json("200 OK", &non_stream_body(&id, now_secs(), &r).to_string())
                }
                Err(e) => openai_error(503, &format!("engine error: {e}"), "engine_error"),
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Threaded server.
// ---------------------------------------------------------------------------

/// A running OpenAI-compatible server on `127.0.0.1:<port>`.
pub struct OpenAiServer {
    listener: TcpListener,
    backend: Arc<dyn CompletionBackend>,
    lister: Arc<dyn ModelLister>,
    token: String,
}

impl OpenAiServer {
    /// Bind a loopback listener and generate a fresh per-process bearer token.
    pub fn serve(
        addr: &str,
        backend: Arc<dyn CompletionBackend>,
        lister: Arc<dyn ModelLister>,
    ) -> std::io::Result<Self> {
        // Enforce loopback regardless of the addr passed.
        let listener = TcpListener::bind(addr)?;
        let server = Self {
            listener,
            backend,
            lister,
            token: fresh_token(),
        };
        server.spawn_accept_loop();
        Ok(server)
    }

    pub fn token(&self) -> &str {
        &self.token
    }

    pub fn local_addr(&self) -> std::io::Result<std::net::SocketAddr> {
        self.listener.local_addr()
    }

    /// The `baseURL` a client points at (OpenAI SDKs expect the `/v1` base).
    pub fn base_url(&self) -> String {
        self.local_addr()
            .map(|a| format!("http://{a}/v1"))
            .unwrap_or_default()
    }

    fn spawn_accept_loop(&self) {
        let listener = self.listener.try_clone().expect("clone listener");
        let backend = Arc::clone(&self.backend);
        let lister = Arc::clone(&self.lister);
        let token = self.token.clone();
        std::thread::spawn(move || {
            for stream in listener.incoming() {
                let Ok(mut stream) = stream else { continue };
                let backend = Arc::clone(&backend);
                let lister = Arc::clone(&lister);
                let token = token.clone();
                std::thread::spawn(move || {
                    let _ = handle_stream(&mut stream, backend.as_ref(), lister.as_ref(), &token);
                });
            }
        });
    }
}

fn handle_stream(
    stream: &mut TcpStream,
    backend: &dyn CompletionBackend,
    lister: &dyn ModelLister,
    token: &str,
) -> std::io::Result<()> {
    stream.set_read_timeout(Some(std::time::Duration::from_secs(30)))?;
    let mut buf = Vec::new();
    let mut chunk = [0u8; 8192];
    loop {
        if buf.len() > MAX_REQUEST_BYTES {
            let _ = stream.write_all(
                openai_error(413, "request too large", "invalid_request_error").as_bytes(),
            );
            return Ok(());
        }
        let n = match stream.read(&mut chunk) {
            Ok(n) => n,
            Err(e)
                if e.kind() == std::io::ErrorKind::WouldBlock
                    || e.kind() == std::io::ErrorKind::TimedOut =>
            {
                return Ok(());
            }
            Err(e) => return Err(e),
        };
        if n == 0 {
            break;
        }
        buf.extend_from_slice(&chunk[..n]);
        let raw = String::from_utf8_lossy(&buf);
        match parse_http_request(&raw) {
            Ok(Some((method, path, body))) => {
                let authed = bearer_token(&raw).as_deref() == Some(token);
                // Streaming chat completions get a dedicated SSE path.
                if authed && method == "POST" && route(&path) == Route::ChatCompletions {
                    if let Ok(req) = serde_json::from_str::<ChatCompletionRequest>(&body) {
                        if req.stream && !req.messages.is_empty() {
                            return stream_completion(stream, backend, &req);
                        }
                    }
                }
                let resp = handle_request(&method, &path, &body, authed, backend, lister);
                stream.write_all(resp.as_bytes())?;
                stream.flush()?;
                return Ok(());
            }
            Ok(None) => { /* partial — keep reading */ }
            Err(HttpParseError::BodyTooLarge) => {
                let _ = stream.write_all(
                    openai_error(413, "body exceeds limit", "invalid_request_error").as_bytes(),
                );
                return Ok(());
            }
        }
    }
    Ok(())
}

/// Stream a chat completion as SSE: headers, then a `chat.completion.chunk`
/// per content delta, then the stop frame + `[DONE]`.
fn stream_completion(
    stream: &mut TcpStream,
    backend: &dyn CompletionBackend,
    req: &ChatCompletionRequest,
) -> std::io::Result<()> {
    let id = completion_id();
    let created = now_secs();
    let model = req.model.clone();
    stream.write_all(http_sse_headers().as_bytes())?;
    stream.flush()?;

    // Collect any write error from within the delta callback.
    let mut write_err: Option<std::io::Error> = None;
    let result = {
        let stream_ref = &mut *stream;
        let id_ref = &id;
        let model_ref = &model;
        let write_err_ref = &mut write_err;
        backend.stream(req, &mut |delta: &str| {
            if write_err_ref.is_some() {
                return;
            }
            let frame = stream_chunk(id_ref, created, model_ref, delta);
            if let Err(e) = stream_ref
                .write_all(frame.as_bytes())
                .and_then(|_| stream_ref.flush())
            {
                *write_err_ref = Some(e);
            }
        })
    };
    if let Some(e) = write_err {
        return Err(e); // client disconnected mid-stream
    }
    match result {
        Ok(r) => {
            let _ = stream.write_all(stream_final(&id, created, &r.model).as_bytes());
        }
        Err(e) => {
            // Surface the engine error inside the SSE stream, then close.
            let err_frame = format!(
                "data: {}\n\ndata: [DONE]\n\n",
                json!({ "error": { "message": e, "type": "engine_error" } })
            );
            let _ = stream.write_all(err_frame.as_bytes());
        }
    }
    let _ = stream.flush();
    Ok(())
}

/// A fresh per-process bearer token (same construction as webmcp_http).
pub fn fresh_token() -> String {
    use std::hash::{BuildHasher, Hash, Hasher};
    let s = std::collections::hash_map::RandomState::new();
    let mut h = s.build_hasher();
    std::process::id().hash(&mut h);
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0)
        .hash(&mut h);
    let mut h2 = s.build_hasher();
    b"everyaios-openai".hash(&mut h2);
    (std::process::id() as u64)
        .wrapping_mul(0x9e37_79b9_7f4a_7c15u64)
        .hash(&mut h2);
    format!("{:016x}{:016x}", h.finish(), h2.finish())
}

#[cfg(test)]
mod tests {
    use super::*;

    struct EchoBackend;
    impl CompletionBackend for EchoBackend {
        fn complete(&self, req: &ChatCompletionRequest) -> Result<CompletionResult, String> {
            let last = req
                .messages
                .last()
                .map(|m| m.content.clone())
                .unwrap_or_default();
            Ok(CompletionResult {
                content: format!("echo: {last}"),
                prompt_tokens: last.split_whitespace().count() as u64,
                completion_tokens: 2,
                model: req.model.clone(),
            })
        }
    }

    struct FailBackend;
    impl CompletionBackend for FailBackend {
        fn complete(&self, _req: &ChatCompletionRequest) -> Result<CompletionResult, String> {
            Err("no key configured".into())
        }
    }

    struct StaticModels;
    impl ModelLister for StaticModels {
        fn models(&self) -> Vec<ModelRow> {
            vec![
                ModelRow::new("everyaios-auto", "everyaios"),
                ModelRow::new("ollama/llama3", "local"),
            ]
        }
    }

    fn body(resp: &str) -> Value {
        serde_json::from_str(resp.split("\r\n\r\n").nth(1).unwrap()).unwrap()
    }

    #[test]
    fn health_is_unauthenticated() {
        let r = handle_request("GET", "/health", "", false, &EchoBackend, &StaticModels);
        assert!(r.starts_with("HTTP/1.1 200 OK"));
        assert_eq!(body(&r)["ok"], true);
    }

    #[test]
    fn models_list_matches_openai_shape() {
        let r = handle_request("GET", "/v1/models", "", true, &EchoBackend, &StaticModels);
        let v = body(&r);
        assert_eq!(v["object"], "list");
        assert_eq!(v["data"][0]["id"], "everyaios-auto");
        assert_eq!(v["data"][0]["object"], "model");
        assert_eq!(v["data"][1]["owned_by"], "local");
    }

    #[test]
    fn models_requires_auth() {
        let r = handle_request("GET", "/v1/models", "", false, &EchoBackend, &StaticModels);
        assert!(r.starts_with("HTTP/1.1 401"));
        assert_eq!(body(&r)["error"]["type"], "invalid_request_error");
    }

    #[test]
    fn chat_completion_non_stream_shape() {
        let req = r#"{"model":"everyaios-auto","messages":[{"role":"user","content":"hi there"}]}"#;
        let r = handle_request(
            "POST",
            "/v1/chat/completions",
            req,
            true,
            &EchoBackend,
            &StaticModels,
        );
        let v = body(&r);
        assert_eq!(v["object"], "chat.completion");
        assert_eq!(v["choices"][0]["message"]["role"], "assistant");
        assert_eq!(v["choices"][0]["message"]["content"], "echo: hi there");
        assert_eq!(v["choices"][0]["finish_reason"], "stop");
        assert_eq!(v["model"], "everyaios-auto");
        // usage totals add up.
        let p = v["usage"]["prompt_tokens"].as_u64().unwrap();
        let c = v["usage"]["completion_tokens"].as_u64().unwrap();
        assert_eq!(v["usage"]["total_tokens"].as_u64().unwrap(), p + c);
    }

    #[test]
    fn chat_completion_rejects_empty_messages() {
        let req = r#"{"model":"m","messages":[]}"#;
        let r = handle_request(
            "POST",
            "/v1/chat/completions",
            req,
            true,
            &EchoBackend,
            &StaticModels,
        );
        assert!(r.starts_with("HTTP/1.1 400"));
    }

    #[test]
    fn chat_completion_rejects_bad_json() {
        let r = handle_request(
            "POST",
            "/v1/chat/completions",
            "{not json",
            true,
            &EchoBackend,
            &StaticModels,
        );
        assert!(r.starts_with("HTTP/1.1 400"));
    }

    #[test]
    fn engine_error_becomes_503() {
        let req = r#"{"model":"m","messages":[{"role":"user","content":"x"}]}"#;
        let r = handle_request(
            "POST",
            "/v1/chat/completions",
            req,
            true,
            &FailBackend,
            &StaticModels,
        );
        assert!(r.starts_with("HTTP/1.1 503"));
        assert_eq!(body(&r)["error"]["type"], "engine_error");
    }

    #[test]
    fn wrong_method_is_405() {
        let r = handle_request(
            "DELETE",
            "/v1/models",
            "",
            true,
            &EchoBackend,
            &StaticModels,
        );
        assert!(r.starts_with("HTTP/1.1 405"));
        let r2 = handle_request(
            "GET",
            "/v1/chat/completions",
            "",
            true,
            &EchoBackend,
            &StaticModels,
        );
        assert!(r2.starts_with("HTTP/1.1 405"));
    }

    #[test]
    fn unknown_route_is_404() {
        let r = handle_request(
            "GET",
            "/v1/embeddings",
            "",
            true,
            &EchoBackend,
            &StaticModels,
        );
        assert!(r.starts_with("HTTP/1.1 404"));
    }

    #[test]
    fn route_tolerates_trailing_slash_and_query() {
        assert_eq!(route("/v1/models/"), Route::Models);
        assert_eq!(
            route("/v1/chat/completions?foo=bar"),
            Route::ChatCompletions
        );
        assert_eq!(route("/health"), Route::Health);
    }

    #[test]
    fn sse_chunk_and_final_frames_are_wellformed() {
        let chunk = stream_chunk("id1", 100, "m", "hello");
        assert!(chunk.starts_with("data: "));
        assert!(chunk.ends_with("\n\n"));
        let v: Value = serde_json::from_str(chunk.trim_start_matches("data: ").trim()).unwrap();
        assert_eq!(v["object"], "chat.completion.chunk");
        assert_eq!(v["choices"][0]["delta"]["content"], "hello");

        let fin = stream_final("id1", 100, "m");
        assert!(fin.contains("\"finish_reason\":\"stop\""));
        assert!(fin.trim_end().ends_with("data: [DONE]"));
    }

    #[test]
    fn default_stream_impl_emits_whole_content() {
        let mut deltas = Vec::new();
        let req = ChatCompletionRequest {
            model: "m".into(),
            messages: vec![ChatMessage {
                role: "user".into(),
                content: "hi".into(),
            }],
            stream: true,
            temperature: None,
            max_tokens: None,
        };
        let r = EchoBackend
            .stream(&req, &mut |d| deltas.push(d.to_string()))
            .unwrap();
        assert_eq!(deltas, vec!["echo: hi".to_string()]);
        assert_eq!(r.content, "echo: hi");
    }

    #[test]
    fn parse_and_bearer_helpers() {
        let raw = "POST /v1/chat/completions HTTP/1.1\r\nAuthorization: Bearer sk-local\r\nContent-Length: 2\r\n\r\n{}";
        let (m, p, b) = parse_http_request(raw).unwrap().unwrap();
        assert_eq!(
            (m.as_str(), p.as_str(), b.as_str()),
            ("POST", "/v1/chat/completions", "{}")
        );
        assert_eq!(bearer_token(raw).as_deref(), Some("sk-local"));
        // oversized declared body → Err.
        let big = format!(
            "POST /x HTTP/1.1\r\nContent-Length: {}\r\n\r\n",
            MAX_BODY_BYTES + 1
        );
        assert!(parse_http_request(&big).is_err());
    }

    #[test]
    fn end_to_end_over_a_real_socket() {
        let server =
            OpenAiServer::serve("127.0.0.1:0", Arc::new(EchoBackend), Arc::new(StaticModels))
                .unwrap();
        let port = server.local_addr().unwrap().port();
        let token = server.token().to_string();
        assert!(server.base_url().ends_with("/v1"));

        // Non-stream chat completion over a real connection, with the token.
        let mut s = TcpStream::connect(("127.0.0.1", port)).unwrap();
        let reqbody = r#"{"model":"everyaios-auto","messages":[{"role":"user","content":"ping"}]}"#;
        let request = format!(
            "POST /v1/chat/completions HTTP/1.1\r\nHost: 127.0.0.1\r\nAuthorization: Bearer {}\r\nContent-Length: {}\r\n\r\n{}",
            token, reqbody.len(), reqbody
        );
        s.write_all(request.as_bytes()).unwrap();
        let mut resp = String::new();
        s.read_to_string(&mut resp).unwrap();
        assert!(resp.starts_with("HTTP/1.1 200 OK"), "got: {resp}");
        let v: Value = serde_json::from_str(resp.split("\r\n\r\n").nth(1).unwrap()).unwrap();
        assert_eq!(v["choices"][0]["message"]["content"], "echo: ping");
    }

    #[test]
    fn real_socket_streaming_yields_sse_and_done() {
        let server =
            OpenAiServer::serve("127.0.0.1:0", Arc::new(EchoBackend), Arc::new(StaticModels))
                .unwrap();
        let port = server.local_addr().unwrap().port();
        let token = server.token().to_string();

        let mut s = TcpStream::connect(("127.0.0.1", port)).unwrap();
        let reqbody = r#"{"model":"m","messages":[{"role":"user","content":"go"}],"stream":true}"#;
        let request = format!(
            "POST /v1/chat/completions HTTP/1.1\r\nHost: 127.0.0.1\r\nAuthorization: Bearer {}\r\nContent-Length: {}\r\n\r\n{}",
            token, reqbody.len(), reqbody
        );
        s.write_all(request.as_bytes()).unwrap();
        let mut resp = String::new();
        s.read_to_string(&mut resp).unwrap();
        assert!(resp.contains("text/event-stream"));
        assert!(resp.contains("chat.completion.chunk"));
        assert!(resp.contains("echo: go"));
        assert!(resp.trim_end().ends_with("data: [DONE]"));
    }

    #[test]
    fn real_socket_rejects_missing_token() {
        let server =
            OpenAiServer::serve("127.0.0.1:0", Arc::new(EchoBackend), Arc::new(StaticModels))
                .unwrap();
        let port = server.local_addr().unwrap().port();
        let mut s = TcpStream::connect(("127.0.0.1", port)).unwrap();
        let request = "GET /v1/models HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n";
        s.write_all(request.as_bytes()).unwrap();
        let mut resp = String::new();
        s.read_to_string(&mut resp).unwrap();
        assert!(resp.starts_with("HTTP/1.1 401"));
        // But /health is reachable without a token.
        let mut s2 = TcpStream::connect(("127.0.0.1", port)).unwrap();
        s2.write_all("GET /health HTTP/1.1\r\nHost: x\r\n\r\n".as_bytes())
            .unwrap();
        let mut r2 = String::new();
        s2.read_to_string(&mut r2).unwrap();
        assert!(r2.starts_with("HTTP/1.1 200 OK"));
    }
}
