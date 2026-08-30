//! P6.7 — the MCP server side (F6/F7, doc 34 §2, doc 61 §7).
//!
//! This is the *protocol layer*, transport-agnostic: the 2026-07-28
//! stateless Streamable HTTP shape, cacheable tool lists (`ttlMs`), and MRTR
//! (multi-round-trip) continuation for long-running ops that must not hold a
//! stream open. `initialize` is answered as a *compat handshake* for real
//! clients (the official MCP Inspector CLI, Claude/Codex-style hosts) — no
//! session state is ever created, the server stays stateless. The concrete
//! HTTP / stdio transport binds to these types; the catalog reconciliation
//! merges external MCP tools into the unified registry (dedupe by name,
//! native wins).

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;
use std::io::{BufRead, Read, Write};
use std::net::TcpStream;
use std::time::Duration;

use crate::{all_tools, ArgDef};

/// Is this HTTP `Origin` header value bound to this machine's loopback?
/// Strips the scheme, isolates the authority, drops the `:port`, and requires
/// a literal loopback host. A prefix check would wrongly accept lookalikes
/// like `http://localhost.evil.com` or `http://127.0.0.1.nip.io` (bugfix 10).
fn origin_is_local(origin: &str) -> bool {
    let low = origin.trim().to_ascii_lowercase();
    // Accept only http/https/tauri origins; anything else (ftp, data, bare
    // text, …) is not a loopback Origin and fails closed.
    let rest = low
        .strip_prefix("http://")
        .or_else(|| low.strip_prefix("https://"))
        .or_else(|| low.strip_prefix("tauri://"));
    let Some(rest) = rest else {
        return false;
    };
    // Authority ends at the first `/`, `?` or `#`.
    let authority = rest
        .split(|c: char| c == '/' || c == '?' || c == '#')
        .next()
        .unwrap_or("");
    // Host is the authority minus any `:port`. Strip a trailing `:digits`
    // only (an unbracketed IPv6 authority like `[::1]:7000` keeps its colons).
    let host = match authority.rsplit_once(':') {
        Some((h, p)) if !p.is_empty() && p.chars().all(|c| c.is_ascii_digit()) => h,
        _ => authority,
    };
    // Drop IPv6 brackets if present.
    let host = host.trim_start_matches('[').trim_end_matches(']');
    matches!(host, "127.0.0.1" | "localhost" | "::1")
}

/// A tool definition from an *external* MCP server (F6 — consume path).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ExternalTool {
    pub name: String,
    pub description: String,
    /// JSON-Schema input schema (the MCP wire shape).
    #[serde(default)]
    pub input_schema: serde_json::Value,
    /// MCP annotation: true = never mutates.
    #[serde(default)]
    pub read_only: bool,
    /// MCP annotation: true = may reach outside the workspace.
    #[serde(default)]
    pub open_world: bool,
    /// The server that supplied it (provenance for dedupe/reconciliation).
    pub source: String,
}

/// The unified tool registry: native (37 browser + 5 storage) + external MCP
/// tools, reconciled so the agent sees one flat, deduplicated list (doc 13 §2).
#[derive(Debug, Clone, Default)]
pub struct ToolCatalog {
    /// External tools, keyed by name (reconciliation dedupes here).
    external: BTreeMap<String, ExternalTool>,
    /// Reconcile order: `name → source`; the first registration wins (native
    /// tools are always registered first and never shadowed).
    origin: BTreeMap<String, String>,
}

impl ToolCatalog {
    pub fn new() -> Self {
        Self::default()
    }

    /// Register an external MCP tool. Native tools (the built-in catalog)
    /// always win — an external server can never shadow `snapshot` etc.
    /// Returns `false` if the name collides with a native tool.
    pub fn register(&mut self, tool: ExternalTool) -> bool {
        if crate::find_tool(&tool.name).is_some() || crate::find_storage_tool(&tool.name).is_some()
        {
            return false;
        }
        self.origin
            .entry(tool.name.clone())
            .or_insert_with(|| tool.source.clone());
        self.external.entry(tool.name.clone()).or_insert(tool);
        true
    }

    /// The reconciled tool count: native (42) + successfully-registered
    /// external (deduped, no native collision).
    pub fn external_count(&self) -> usize {
        self.external.len()
    }

    pub fn external_tools(&self) -> impl Iterator<Item = &ExternalTool> {
        self.external.values()
    }

    /// Total reconciled tools the agent sees.
    pub fn total(&self) -> usize {
        all_tools().len() + self.external_count()
    }

    /// Resolve the origin of a tool name (native vs which external server).
    pub fn origin(&self, name: &str) -> Option<&str> {
        if crate::find_tool(name).is_some() || crate::find_storage_tool(name).is_some() {
            return Some("native");
        }
        self.origin.get(name).map(|s| s.as_str())
    }
}

/// The JSON-RPC `tools/list` response with a cache TTL (2026-07-28 stateless
/// spec — clients cache the list and only refetch after `ttl_ms`). Field
/// names are camelCase: the MCP wire protocol is camelCase, and real clients
/// (the Inspector CLI, Claude/Codex hosts) key on `inputSchema` /
/// `readOnlyHint` / `openWorldHint` — snake_case entries are dropped.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolListResponse {
    pub tools: Vec<ToolListEntry>,
    /// Cacheable tool list: clients may reuse until this TTL expires.
    pub ttl_ms: u64,
    /// Opaque cache key (changes when the catalog changes).
    pub etag: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolListEntry {
    pub name: String,
    pub description: String,
    #[serde(rename = "inputSchema")]
    pub input_schema: serde_json::Value,
    #[serde(rename = "readOnlyHint")]
    pub read_only: bool,
    #[serde(rename = "openWorldHint")]
    pub open_world: bool,
}

/// Render the built-in catalog + reconciled external tools as a single
/// cacheable list. `ttl_ms` is the startup-latency target (doc 61 §7.2).
pub fn tool_list(catalog: &ToolCatalog, ttl_ms: u64) -> ToolListResponse {
    let mut tools: Vec<ToolListEntry> = all_tools()
        .iter()
        .map(|t| ToolListEntry {
            name: t.name.to_string(),
            description: t.description.to_string(),
            input_schema: args_to_schema(t.args),
            read_only: t.read_only,
            open_world: t.open_world,
        })
        .collect();
    for e in catalog.external_tools() {
        tools.push(ToolListEntry {
            name: e.name.clone(),
            description: e.description.clone(),
            input_schema: e.input_schema.clone(),
            read_only: e.read_only,
            open_world: e.open_world,
        });
    }
    tools.sort_by(|a, b| a.name.cmp(&b.name));
    let etag = etag(&tools);
    ToolListResponse {
        tools,
        ttl_ms,
        etag,
    }
}

/// A stable ETag over the tool list (name + schema hash) so clients can
/// conditionally refetch. No crypto required — FNV-1a over the names.
fn etag(tools: &[ToolListEntry]) -> String {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for t in tools {
        for b in t.name.bytes() {
            h ^= b as u64;
            h = h.wrapping_mul(0x1000_0000_01b3);
        }
    }
    format!("{h:016x}")
}

/// Convert our typed [`ArgDef`]s into a JSON-Schema `input_schema`.
fn args_to_schema(args: &[ArgDef]) -> serde_json::Value {
    let mut properties = serde_json::Map::new();
    let mut required = Vec::new();
    for a in args {
        let ty = match a.kind {
            crate::ArgKind::String => "string",
            crate::ArgKind::Number => "number",
            crate::ArgKind::Bool => "boolean",
            crate::ArgKind::StringArray => "array",
            crate::ArgKind::Object => "object",
        };
        let mut prop = serde_json::Map::new();
        prop.insert("type".into(), serde_json::Value::String(ty.into()));
        prop.insert(
            "description".into(),
            serde_json::Value::String(a.description.into()),
        );
        properties.insert(a.name.into(), serde_json::Value::Object(prop));
        if a.required {
            required.push(serde_json::Value::String(a.name.into()));
        }
    }
    serde_json::json!({
        "type": "object",
        "properties": properties,
        "required": required,
        "additionalProperties": true
    })
}

/// MRTR (multi-round-trip) continuation — the 2026-07-28 stateless way to run
/// a long-lived operation (a sub-agent loop, a B1 turn) without holding a
/// stream open. The client sends a fresh stateless request carrying the
/// continuation handle; the server resumes and returns the next segment.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MrtrHandle {
    /// Opaque server-side call id.
    pub call_id: String,
    /// Monotonic segment index (resume from here).
    pub segment: u64,
}

/// The stateless request envelope (no `initialize`/`session` — 2026-07-28).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "method", rename_all = "camelCase")]
pub enum StatelessRequest {
    /// Fetch the (cacheable) tool list.
    ToolsList,
    /// Invoke a tool.
    CallTool {
        name: String,
        arguments: serde_json::Value,
        /// Optional MRTR continuation (resume an in-flight call).
        #[serde(default)]
        continuation: Option<MrtrHandle>,
    },
}

/// Host-owned execution seam for MCP `tools/call`.
///
/// The MCP transport never executes a tool by itself. The desktop host injects
/// a handler that routes calls through `ToolService`/Guard-2; tests can inject
/// a deterministic handler. This keeps the endpoint useful without creating a
/// second, bypassable executor.
pub trait ToolCallHandler {
    fn call(&mut self, name: &str, arguments: &Value) -> Result<Value, String>;
}

/// A small, dependency-free MCP server over the two supported local
/// transports: newline-delimited stdio and Streamable-HTTP-shaped loopback
/// requests. HTTP remains intentionally one-request-per-connection here; the
/// host can supervise it and add keep-alive without changing the protocol
/// handler. Origin, bearer, and body limits are enforced before dispatch.
pub struct McpServer<H> {
    pub catalog: ToolCatalog,
    handler: H,
    bearer_token: Option<String>,
    max_body_bytes: usize,
}

impl<H: ToolCallHandler> McpServer<H> {
    pub fn new(handler: H) -> Self {
        Self {
            catalog: ToolCatalog::new(),
            handler,
            bearer_token: None,
            max_body_bytes: 4 * 1024 * 1024,
        }
    }

    pub fn with_catalog(mut self, catalog: ToolCatalog) -> Self {
        self.catalog = catalog;
        self
    }

    pub fn with_bearer_token(mut self, token: impl Into<String>) -> Self {
        self.bearer_token = Some(token.into());
        self
    }

    pub fn with_max_body_bytes(mut self, max: usize) -> Self {
        self.max_body_bytes = max.max(1);
        self
    }

    /// Handle one JSON-RPC request and return one JSON-RPC response.
    ///
    /// Notifications (no `id` field — e.g. `notifications/initialized`) get
    /// an empty response: JSON-RPC notifications are never answered, and a
    /// response to one would confuse a real client's message routing.
    pub fn handle_json(&mut self, body: &str) -> String {
        let request: Value = match serde_json::from_str(body) {
            Ok(v) => v,
            Err(e) => return rpc_error(Value::Null, -32700, &e.to_string()),
        };
        if request.get("id").is_none() {
            return String::new();
        }
        let id = request.get("id").cloned().unwrap_or(Value::Null);
        let method = request.get("method").and_then(Value::as_str).unwrap_or("");
        match method {
            "initialize" => {
                // Compat handshake for real clients (the Inspector CLI,
                // Claude/Codex-style hosts). Echo the client's requested
                // protocol version (always one it supports) so negotiation
                // succeeds; no session/capability state is created.
                let requested = request
                    .get("params")
                    .and_then(|p| p.get("protocolVersion"))
                    .and_then(Value::as_str)
                    .unwrap_or("2026-07-28");
                serde_json::to_string(&rpc_ok(
                    id,
                    serde_json::json!({
                        "protocolVersion": requested,
                        "capabilities": { "tools": {} },
                        "serverInfo": {
                            "name": "everyaios-mcp",
                            "version": env!("CARGO_PKG_VERSION")
                        },
                        "instructions": "EveryAIOS native tool catalog (37 browser + 5 storage). Stateless: no session is created."
                    }),
                ))
                .unwrap_or_else(|_| rpc_error(Value::Null, -32603, "serialization failed"))
            }
            "ping" => serde_json::to_string(&rpc_ok(id, serde_json::json!({})))
                .unwrap_or_else(|_| rpc_error(Value::Null, -32603, "serialization failed")),
            "tools/list" => serde_json::to_string(&rpc_ok(id, tool_list(&self.catalog, 300_000)))
                .unwrap_or_else(|_| rpc_error(Value::Null, -32603, "serialization failed")),
            "tools/call" => {
                let params = request.get("params").cloned().unwrap_or(Value::Null);
                let name = params.get("name").and_then(Value::as_str).unwrap_or("");
                let arguments = params
                    .get("arguments")
                    .cloned()
                    .unwrap_or_else(|| serde_json::json!({}));
                let known = all_tools().iter().any(|t| t.name == name)
                    || self.catalog.origin(name).is_some();
                if !known {
                    return rpc_error(id, -32602, "unknown tool");
                }
                match self.handler.call(name, &arguments) {
                    Ok(value) => serde_json::to_string(&rpc_ok(
                        id,
                        serde_json::json!({
                            "content": [{"type": "text", "text": value.to_string()}],
                            "structuredContent": value
                        }),
                    ))
                    .unwrap_or_else(|_| rpc_error(Value::Null, -32603, "serialization failed")),
                    Err(message) => rpc_error(id, -32001, &message),
                }
            }
            _ => rpc_error(id, -32601, "method not found"),
        }
    }

    /// Serve newline-delimited JSON-RPC until EOF. This is the local MCP stdio
    /// lifecycle used by Claude/Codex-style hosts.
    pub fn serve_stdio<R: BufRead, W: Write>(
        &mut self,
        reader: R,
        mut writer: W,
    ) -> std::io::Result<()> {
        for line in reader.lines() {
            let line = line?;
            if line.trim().is_empty() {
                continue;
            }
            let response = self.handle_json(&line);
            if !response.is_empty() {
                writeln!(writer, "{response}")?;
                writer.flush()?;
            }
        }
        Ok(())
    }

    /// Serve one HTTP request from a loopback TCP stream, then close the
    /// connection. Kept for the one-shot supervision model (and tests); the
    /// keep-alive path is [`Self::serve_http_connection`].
    pub fn serve_http_once(&mut self, stream: &mut TcpStream) -> std::io::Result<()> {
        let _ = self.serve_http_connection(stream)?;
        Ok(())
    }

    /// Serve HTTP requests over one loopback connection until the peer closes
    /// it or requests `Connection: close` (P39.3). Returns the number of
    /// requests served. Keep-alive lets one agent reuse a single socket for
    /// repeated tool calls instead of paying a TCP handshake per request;
    /// each request still goes through the same origin/bearer/body gates.
    pub fn serve_http_connection(&mut self, stream: &mut TcpStream) -> std::io::Result<u32> {
        stream.set_read_timeout(Some(Duration::from_secs(10)))?;
        let mut served = 0u32;
        loop {
            let Some(req) = read_http_request(stream, self.max_body_bytes)? else {
                // Clean EOF between requests (or an error response was
                // already written) — the connection is done.
                return Ok(served);
            };
            let keep_alive = req.keep_alive;
            if !self.is_authorized(&req) {
                write_http_bytes(stream, 401, b"unauthorized", keep_alive)?;
            } else if !req.origin_ok {
                write_http_bytes(stream, 403, b"origin rejected", keep_alive)?;
            } else {
                let response = self.handle_json(&req.body);
                write_http_bytes(stream, 200, response.as_bytes(), keep_alive)?;
            }
            served += 1;
            if !keep_alive {
                return Ok(served);
            }
        }
    }

    /// The bearer check for one parsed request: no token configured on the
    /// server ⇒ everything is authorized (loopback-only deployments).
    fn is_authorized(&self, req: &HttpRequest) -> bool {
        if self.bearer_token.is_none() {
            return true;
        }
        req.authorization
            .as_deref()
            .map(|v| {
                self.bearer_token
                    .as_deref()
                    .map(|token| v == format!("Bearer {token}"))
                    .unwrap_or(false)
            })
            .unwrap_or(false)
    }
}

/// One parsed loopback HTTP request (headers + body).
struct HttpRequest {
    body: String,
    /// `Connection: keep-alive` requested by the peer.
    keep_alive: bool,
    authorization: Option<String>,
    origin_ok: bool,
}

/// Read one HTTP request (headers + content-length body) from a loopback
/// stream. Returns `Ok(None)` on a clean EOF *before any bytes* (peer closed
/// an idle keep-alive connection) or after an error response has been
/// written; `Ok(Some(req))` when a complete request was read.
fn read_http_request(
    stream: &mut TcpStream,
    max_body_bytes: usize,
) -> std::io::Result<Option<HttpRequest>> {
    let mut raw = Vec::new();
    let mut chunk = [0u8; 4096];
    let header_end;
    loop {
        let n = stream.read(&mut chunk)?;
        if n == 0 {
            if raw.is_empty() {
                return Ok(None); // clean EOF — peer closed between requests
            }
            write_http_bytes(stream, 400, b"truncated request", false)?;
            return Ok(None);
        }
        raw.extend_from_slice(&chunk[..n]);
        if let Some(pos) = raw.windows(4).position(|w| w == b"\r\n\r\n") {
            header_end = pos + 4;
            break;
        }
        if raw.len() > 64 * 1024 {
            write_http_bytes(stream, 413, b"headers too large", false)?;
            return Ok(None);
        }
    }
    let header = String::from_utf8_lossy(&raw[..header_end]);
    let mut content_length = 0usize;
    let mut keep_alive = false;
    let mut authorization = None;
    let mut origin_ok = true;
    for line in header.lines().skip(1) {
        let Some((key, value)) = line.split_once(':') else {
            continue;
        };
        match key.trim().to_ascii_lowercase().as_str() {
            "content-length" => content_length = value.trim().parse().unwrap_or(usize::MAX),
            "connection" => {
                keep_alive = value.trim().eq_ignore_ascii_case("keep-alive");
            }
            "authorization" => authorization = Some(value.trim().to_string()),
            "origin" => {
                origin_ok = origin_is_local(value.trim());
            }
            _ => {}
        }
    }
    if content_length > max_body_bytes {
        write_http_bytes(stream, 413, b"body too large", false)?;
        return Ok(None);
    }
    while raw.len() - header_end < content_length {
        let n = stream.read(&mut chunk)?;
        if n == 0 {
            break;
        }
        raw.extend_from_slice(&chunk[..n]);
        if raw.len() - header_end > max_body_bytes {
            write_http_bytes(stream, 413, b"body too large", false)?;
            return Ok(None);
        }
    }
    if raw.len() - header_end < content_length {
        write_http_bytes(stream, 400, b"truncated body", false)?;
        return Ok(None);
    }
    let body = String::from_utf8_lossy(&raw[header_end..header_end + content_length]).to_string();
    Ok(Some(HttpRequest {
        body,
        keep_alive,
        authorization,
        origin_ok,
    }))
}

fn rpc_ok<T: Serialize>(id: Value, result: T) -> Value {
    serde_json::json!({"jsonrpc":"2.0", "id": id, "result": result})
}

fn rpc_error(id: Value, code: i64, message: &str) -> String {
    serde_json::json!({"jsonrpc":"2.0", "id": id, "error":{"code":code,"message":message}})
        .to_string()
}

fn write_http_bytes(
    stream: &mut TcpStream,
    status: u16,
    body: &[u8],
    keep_alive: bool,
) -> std::io::Result<()> {
    let reason = match status {
        200 => "OK",
        400 => "Bad Request",
        401 => "Unauthorized",
        403 => "Forbidden",
        413 => "Payload Too Large",
        _ => "Error",
    };
    let connection = if keep_alive { "keep-alive" } else { "close" };
    write!(
        stream,
        "HTTP/1.1 {status} {reason}\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: {connection}\r\n\r\n",
        body.len()
    )?;
    stream.write_all(body)
}

#[cfg(test)]
mod transport_tests {
    use super::*;
    use std::io::Cursor;
    use std::net::TcpListener;
    use std::thread;

    struct Fake;
    impl ToolCallHandler for Fake {
        fn call(&mut self, name: &str, arguments: &Value) -> Result<Value, String> {
            Ok(serde_json::json!({"tool": name, "args": arguments}))
        }
    }

    #[test]
    fn stdio_lists_and_calls_native_tool() {
        let mut server = McpServer::new(Fake);
        let input = format!(
            "{}\n{}\n",
            serde_json::json!({"jsonrpc":"2.0","id":1,"method":"tools/list"}),
            serde_json::json!({"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"snapshot","arguments":{}}})
        );
        let mut output = Vec::new();
        server.serve_stdio(Cursor::new(input), &mut output).unwrap();
        let text = String::from_utf8(output).unwrap();
        assert!(text.contains("snapshot"));
        assert!(text.contains("structuredContent"));
    }

    #[test]
    fn loopback_http_requires_bearer_and_origin() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        let handle = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut server = McpServer::new(Fake).with_bearer_token("secret");
            server.serve_http_once(&mut stream).unwrap();
        });
        let mut client = TcpStream::connect(addr).unwrap();
        let body = serde_json::json!({"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"snapshot","arguments":{}}}).to_string();
        write!(client, "POST /mcp HTTP/1.1\r\nHost: localhost\r\nOrigin: http://localhost\r\nAuthorization: Bearer secret\r\nContent-Length: {}\r\n\r\n{}", body.len(), body).unwrap();
        let mut response = String::new();
        client.read_to_string(&mut response).unwrap();
        handle.join().unwrap();
        assert!(response.starts_with("HTTP/1.1 200"));
        assert!(response.contains("structuredContent"));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn ext(name: &str, src: &str) -> ExternalTool {
        ExternalTool {
            name: name.into(),
            description: "ext".into(),
            input_schema: json!({"type": "object"}),
            read_only: true,
            open_world: false,
            source: src.into(),
        }
    }

    #[test]
    fn tool_list_covers_native_and_external() {
        let mut cat = ToolCatalog::new();
        cat.register(ext("linear_search", "linear-mcp"));
        let resp = tool_list(&cat, 300_000);
        // 51 native (browser 37 + office 4 + memory 3 + search 2 + storage 5) + 1 external.
        assert_eq!(resp.tools.len(), 52);
        assert_eq!(resp.ttl_ms, 300_000);
        // Sorted; contains both.
        let names: Vec<&str> = resp.tools.iter().map(|t| t.name.as_str()).collect();
        assert!(names.windows(2).all(|w| w[0] <= w[1]), "sorted");
        assert!(names.contains(&"snapshot"));
        assert!(names.contains(&"linear_search"));
    }

    #[test]
    fn native_wins_reconciliation() {
        let mut cat = ToolCatalog::new();
        // An external server tries to shadow `snapshot` — refused.
        assert!(!cat.register(ext("snapshot", "evil-mcp")));
        assert_eq!(cat.external_count(), 0);
        assert_eq!(cat.origin("snapshot"), Some("native"));

        // A genuinely new tool registers.
        assert!(cat.register(ext("gmail_search", "gmail-mcp")));

        assert_eq!(cat.origin("gmail_search"), Some("gmail-mcp"));
        assert_eq!(cat.total(), 52);
    }

    #[test]
    fn duplicate_external_name_dedupes_first_wins() {
        let mut cat = ToolCatalog::new();
        assert!(cat.register(ext("notion_query", "notion-a")));
        // Second source for the same name is ignored (no double-register).
        cat.register(ext("notion_query", "notion-b"));
        assert_eq!(cat.external_count(), 1);
        assert_eq!(cat.origin("notion_query"), Some("notion-a"));
    }

    #[test]
    fn etag_is_stable_for_same_catalog() {
        let cat = ToolCatalog::new();
        let a = tool_list(&cat, 1);
        let b = tool_list(&cat, 1);
        assert_eq!(a.etag, b.etag);
        let mut cat2 = ToolCatalog::new();
        cat2.register(ext("x", "s"));
        let c = tool_list(&cat2, 1);
        assert_ne!(a.etag, c.etag);
    }

    #[test]
    fn input_schema_reflects_required_args() {
        let schema = args_to_schema(crate::find_tool("navigate").unwrap().args);
        assert_eq!(schema["type"], "object");
        assert!(schema["required"]
            .as_array()
            .unwrap()
            .contains(&json!("url")));
        assert_eq!(schema["properties"]["url"]["type"], "string");
    }

    #[test]
    fn mrtr_handle_serializes_roundtrip() {
        let h = MrtrHandle {
            call_id: "c-1".into(),
            segment: 3,
        };
        let json = serde_json::to_string(&h).unwrap();
        let back: MrtrHandle = serde_json::from_str(&json).unwrap();
        assert_eq!(back.call_id, "c-1");
        assert_eq!(back.segment, 3);
    }

    #[test]
    fn stateless_request_has_no_session() {
        let req = StatelessRequest::CallTool {
            name: "snapshot".into(),
            arguments: json!({}),
            continuation: Some(MrtrHandle {
                call_id: "c".into(),
                segment: 0,
            }),
        };
        let json = serde_json::to_string(&req).unwrap();
        // Stateless: no initialize/session in the wire shape.
        assert!(!json.contains("initialize"));
        assert!(!json.contains("session"));
        assert!(json.contains("callTool"));
    }

    #[test]
    fn origin_check_accepts_only_literal_loopback() {
        // Bugfix 10 — lookalikes are refused, genuine loopback passes.
        assert!(origin_is_local("http://localhost:3000"));
        assert!(origin_is_local("http://127.0.0.1:8080"));
        assert!(origin_is_local("http://[::1]:7000"));
        assert!(origin_is_local("http://localhost"));
        assert!(origin_is_local("tauri://localhost"));
        // Prefix lookalikes must fail.
        assert!(!origin_is_local("http://localhost.evil.com"));
        assert!(!origin_is_local("http://127.0.0.1.nip.io"));
        assert!(!origin_is_local("http://127.0.0.10:9000"));
        assert!(!origin_is_local("http://example.com"));
        // Unknown / malformed — fail closed.
        assert!(!origin_is_local(""));
        assert!(!origin_is_local("null"));
        assert!(!origin_is_local("ftp://localhost"));
    }
}
