//! P1.8 (A5/B5) — local model runtime execution: keyless, grammar-constrained.
//!
//! Local providers (ollama / llamafile) need no key-ring: the machine owns the
//! weights. [`Broker::with_local`] registers an endpoint; `chat_completion*`
//! routes to it and never touches `KeyRing`. Usage still lands in the ledger
//! and the session budget (tokens count; $ is 0), and the **grammar
//! constraint** (B5) rides on every local request:
//!
//! - Ollama: `format` field — `"json"` or a JSON schema. (Raw GBNF is NOT
//!   accepted by ollama — verified live on 0.21.1, HTTP 500 "invalid
//!   format" — so a GBNF request falls back to `format: "json"`, which is
//!   still a logit-layer grammar: output is guaranteed valid JSON.)
//! - llamafile (llama.cpp server): native `grammar` field (raw GBNF) on the
//!   OpenAI-compatible `/v1/chat/completions` endpoint, or
//!   `response_format` for JSON modes.
//!
//! At the logit-sampling layer the model *physically cannot* emit invalid
//! tool-call JSON (SPEC B5). When the sidecar marks a local request as a tool
//! call (`tools` present in the body) without an explicit grammar, the broker
//! defaults to JSON-mode grammar.

use std::io::{BufRead, BufReader};
use std::time::Duration;

use crate::broker::{parse_sse, BrokerError, ChatStreamEvent};
use crate::ledger::Usage;

/// The two supported local runtimes (A5, doc 34 §2 / doc 33 §7.4).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LocalRuntime {
    /// Ollama (`/api/chat`, NDJSON streaming). Detected + managed by
    /// everyaios-core; default context 4,096 is TOO LOW (doc 33 §7.4) — we
    /// force `options.num_ctx` on every call.
    Ollama,
    /// llama.cpp server / Mozilla llamafile (OpenAI-compatible
    /// `/v1/chat/completions`; native GBNF `grammar`). Zero-setup single
    /// binary (doc 34 §2).
    Llamafile,
}

/// A configured local runtime endpoint (provider name → this).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LocalEndpoint {
    pub runtime: LocalRuntime,
    pub base_url: String,
    /// Context window forced on every call (doc 33 §7.4: 15–20K minimum —
    /// below 15K the agent loops; default 16,384).
    pub num_ctx: u32,
}

impl LocalEndpoint {
    pub fn ollama(base_url: impl Into<String>) -> Self {
        Self {
            runtime: LocalRuntime::Ollama,
            base_url: base_url.into(),
            num_ctx: DEFAULT_NUM_CTX,
        }
    }

    pub fn llamafile(base_url: impl Into<String>) -> Self {
        Self {
            runtime: LocalRuntime::Llamafile,
            base_url: base_url.into(),
            num_ctx: DEFAULT_NUM_CTX,
        }
    }

    pub fn with_num_ctx(mut self, num_ctx: u32) -> Self {
        self.num_ctx = num_ctx;
        self
    }
}

/// The doc-33 §7.4 floor: Ollama's default 4,096 is too low; set 15–20K.
pub const DEFAULT_NUM_CTX: u32 = 16_384;
/// Below this the UI must warn loudly (doc 33 §7.4).
pub const MIN_WARN_NUM_CTX: u32 = 15_000;

/// Grammar constraint for local tool calls (B5) — applied at the sampling
/// layer so invalid tool-call JSON is structurally impossible.
#[derive(Debug, Clone, PartialEq)]
pub enum Grammar {
    /// No constraint (plain chat).
    None,
    /// `format: "json"` (ollama) / `response_format: {"type":"json_object"}`.
    Json,
    /// Ollama: `format: <schema>` (converted to GBNF internally); llamafile:
    /// `response_format: {"type":"json_schema", ...}`.
    JsonSchema(serde_json::Value),
    /// Raw GBNF text. Ollama: `format: <text>` passthrough; llamafile:
    /// `grammar: <text>` (native).
    Gbnf(String),
}

/// Extract the grammar for a local call: an explicit `body.grammar` wins;
/// otherwise a body carrying `tools` gets JSON-mode grammar (B5 default).
pub fn grammar_from_body(body: &serde_json::Value) -> Grammar {
    match body.get("grammar") {
        // The literal string "json" is the JSON-mode request — NOT a GBNF
        // grammar (sending `grammar: "json"` to llamafile would 400).
        Some(serde_json::Value::String(s)) if s == "json" => return Grammar::Json,
        Some(serde_json::Value::String(s)) if !s.is_empty() => {
            return Grammar::Gbnf(s.clone());
        }
        Some(serde_json::Value::Object(o)) => match o.get("type").and_then(|t| t.as_str()) {
            Some("json") => return Grammar::Json,
            Some("json_schema") => {
                if let Some(schema) = o.get("value").cloned() {
                    return Grammar::JsonSchema(schema);
                }
            }
            Some("gbnf") => {
                if let Some(v) = o.get("value").and_then(|v| v.as_str()) {
                    return Grammar::Gbnf(v.to_string());
                }
            }
            _ => {}
        },
        _ => {}
    }
    if body
        .get("tools")
        .and_then(|t| t.as_array())
        .is_some_and(|a| !a.is_empty())
    {
        return Grammar::Json;
    }
    Grammar::None
}

/// HTTP agent for local runtimes: generous timeout — a cold model load on CPU
/// can take minutes (verified: qwen3:4b takes 2min+ to first token).
fn agent() -> ureq::Agent {
    ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(600))
        .build()
}

fn map_err(err: ureq::Error) -> BrokerError {
    match err {
        ureq::Error::Status(429, _) => BrokerError::RateLimited,
        ureq::Error::Status(code, resp) => BrokerError::Http(code, read_snippet(resp)),
        ureq::Error::Transport(t) => BrokerError::Transport(t.to_string()),
    }
}

fn read_snippet(resp: ureq::Response) -> String {
    resp.into_string()
        .unwrap_or_default()
        .chars()
        .take(200)
        .collect()
}

// ---- Ollama `/api/chat` ---------------------------------------------------

/// Build the ollama `/api/chat` request body from the OpenAI-shaped wire body.
///
/// Preserves caller `options` (temperature etc.) while FORCING the num_ctx
/// floor, and forwards the common sampling fields. Deliberately does NOT
/// forward `tools`: B5's local path extracts tool calls as grammar-enforced
/// JSON text (ollama native tool mode would emit `tool_calls` instead of
/// `message.content`, breaking the stream contract).
pub(crate) fn ollama_body(
    endpoint: &LocalEndpoint,
    model: &str,
    body: &serde_json::Value,
) -> serde_json::Value {
    let mut req = serde_json::json!({
        "model": body.get("model").and_then(|m| m.as_str()).unwrap_or(model),
        "messages": body.get("messages").cloned().unwrap_or(serde_json::json!([])),
        "stream": body.get("stream").cloned().unwrap_or(serde_json::json!(true)),
    });
    // Merge caller options with the forced context floor (never drop them).
    let mut options = body
        .get("options")
        .and_then(|o| o.as_object())
        .cloned()
        .unwrap_or_default();
    options.insert("num_ctx".to_string(), serde_json::json!(endpoint.num_ctx));
    req["options"] = serde_json::Value::Object(options);
    // Forward the common sampling fields.
    for key in ["temperature", "top_p", "max_tokens", "seed"] {
        if let Some(v) = body.get(key) {
            req[key] = v.clone();
        }
    }
    match grammar_from_body(body) {
        Grammar::None => {}
        Grammar::Json => req["format"] = serde_json::json!("json"),
        Grammar::JsonSchema(schema) => req["format"] = schema,
        // Ollama (verified live on 0.21.1) does NOT accept raw GBNF in
        // `format` — it 500s with "invalid format". Its grammar API is JSON
        // mode / JSON schema only. A GBNF request (a llamafile feature)
        // falls back to JSON mode: output is STILL grammar-enforced valid
        // JSON at the logit layer, which is B5's actual guarantee.
        Grammar::Gbnf(_) => req["format"] = serde_json::json!("json"),
    }
    req
}

/// Stream one ollama `/api/chat` response (NDJSON lines). Deltas come from
/// `message.content`; the final `done:true` chunk carries `prompt_eval_count`
/// / `eval_count` which become the cache-aware [`Usage`].
pub fn ollama_chat_stream(
    base_url: &str,
    body: &serde_json::Value,
) -> Result<Vec<ChatStreamEvent>, BrokerError> {
    let resp = agent()
        .post(&format!("{base_url}/api/chat"))
        .set("Content-Type", "application/json")
        .send_json(body.clone())
        .map_err(map_err)?;
    let reader = BufReader::new(resp.into_reader());
    let mut events = Vec::new();
    for line in reader.lines().map_while(Result::ok) {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let Ok(v) = serde_json::from_str::<serde_json::Value>(trimmed) else {
            continue;
        };
        if let Some(msg) = v
            .get("message")
            .and_then(|m| m.get("content"))
            .and_then(|c| c.as_str())
        {
            events.push(ChatStreamEvent {
                delta: Some(msg.to_string()),
                finish: None,
                usage: None,
                tool_calls: Vec::new(),
            });
        }
        if v.get("done").and_then(|d| d.as_bool()).unwrap_or(false) {
            let usage = Usage {
                prompt: v
                    .get("prompt_eval_count")
                    .and_then(|c| c.as_u64())
                    .unwrap_or(0),
                output: v.get("eval_count").and_then(|c| c.as_u64()).unwrap_or(0),
                cache_read: 0,
                cache_write: 0,
            };
            if usage.total() > 0 {
                events.push(ChatStreamEvent {
                    delta: None,
                    finish: None,
                    usage: Some(usage),
                    tool_calls: Vec::new(),
                });
            }
            break;
        }
    }
    Ok(events)
}

/// Non-streaming ollama `/api/chat`: `message.content` + usage from the
/// `prompt_eval_count`/`eval_count` fields.
pub fn ollama_chat(
    base_url: &str,
    body: &serde_json::Value,
) -> Result<(serde_json::Value, Usage), BrokerError> {
    let resp = agent()
        .post(&format!("{base_url}/api/chat"))
        .set("Content-Type", "application/json")
        .send_json(body.clone())
        .map_err(map_err)?;
    let v: serde_json::Value = resp
        .into_json()
        .map_err(|e| BrokerError::Transport(e.to_string()))?;
    let usage = Usage {
        prompt: v
            .get("prompt_eval_count")
            .and_then(|c| c.as_u64())
            .unwrap_or(0),
        output: v.get("eval_count").and_then(|c| c.as_u64()).unwrap_or(0),
        cache_read: 0,
        cache_write: 0,
    };
    Ok((v, usage))
}

// ---- llamafile / llama.cpp server (`/v1/chat/completions`) -----------------

/// Build the OpenAI-compatible body for llamafile: same wire shape as cloud
/// providers plus `grammar`/`response_format` (B5). `num_ctx` is fixed at
/// spawn time for llamafile (`--ctx-size`), not per request.
pub(crate) fn llamafile_body(
    endpoint: &LocalEndpoint,
    model: &str,
    body: &serde_json::Value,
) -> serde_json::Value {
    let _ = endpoint;

    let mut req = serde_json::json!({
        "model": body.get("model").and_then(|m| m.as_str()).unwrap_or(model),
        "messages": body.get("messages").cloned().unwrap_or(serde_json::json!([])),
        "stream": body.get("stream").cloned().unwrap_or(serde_json::json!(true)),
    });
    match grammar_from_body(body) {
        Grammar::None => {}
        Grammar::Json => {
            req["response_format"] = serde_json::json!({ "type": "json_object" });
        }
        Grammar::JsonSchema(schema) => {
            req["response_format"] = serde_json::json!({
                "type": "json_schema",
                "json_schema": schema,
            });
        }
        Grammar::Gbnf(g) => req["grammar"] = serde_json::json!(g),
    }
    req
}

/// Stream one llamafile completion (OpenAI SSE — reuses the broker's parser).
pub fn llamafile_chat_stream(
    base_url: &str,
    body: &serde_json::Value,
) -> Result<Vec<ChatStreamEvent>, BrokerError> {
    let resp = agent()
        .post(&format!("{base_url}/v1/chat/completions"))
        .set("Content-Type", "application/json")
        .send_json(body.clone())
        .map_err(map_err)?;
    Ok(parse_sse(BufReader::new(resp.into_reader())))
}

/// Non-streaming llamafile completion (OpenAI shape).
pub fn llamafile_chat(
    base_url: &str,
    body: &serde_json::Value,
) -> Result<(serde_json::Value, Usage), BrokerError> {
    let resp = agent()
        .post(&format!("{base_url}/v1/chat/completions"))
        .set("Content-Type", "application/json")
        .send_json(body.clone())
        .map_err(map_err)?;
    let v: serde_json::Value = resp
        .into_json()
        .map_err(|e| BrokerError::Transport(e.to_string()))?;
    let usage = v.get("usage").and_then(Usage::from_any).unwrap_or_default();
    Ok((v, usage))
}

#[cfg(test)]
#[path = "local_tests.rs"]
mod tests;
