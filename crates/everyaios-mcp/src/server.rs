//! P6.7 — the MCP server side (F6/F7, doc 34 §2, doc 61 §7).
//!
//! This is the *protocol layer*, transport-agnostic: the 2026-07-28
//! stateless Streamable HTTP shape (no `initialize`/`session`), cacheable
//! tool lists (`ttlMs`), and MRTR (multi-round-trip) continuation for
//! long-running ops that must not hold a stream open. The concrete HTTP /
//! stdio transport binds to these types; the catalog reconciliation merges
//! external MCP tools into the unified registry (dedupe by name, native
//! wins).

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;
use std::io::{BufRead, Read, Write};
use std::net::TcpStream;
use std::time::Duration;

use crate::{all_tools, ArgDef};

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
/// spec — clients cache the list and only refetch after `ttl_ms`).
#[derive(Debug, Clone, Serialize, Deserialize)]
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
    pub input_schema: serde_json::Value,
    pub read_only: bool,
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
    pub fn handle_json(&mut self, body: &str) -> String {
        let request: Value = match serde_json::from_str(body) {
            Ok(v) => v,
            Err(e) => return rpc_error(Value::Null, -32700, &e.to_string()),
        };
        let id = request.get("id").cloned().unwrap_or(Value::Null);
        let method = request.get("method").and_then(Value::as_str).unwrap_or("");
        match method {
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
            writeln!(writer, "{}", self.handle_json(&line))?;
            writer.flush()?;
        }
        Ok(())
    }

    /// Serve one HTTP request from a loopback TCP stream.
    pub fn serve_http_once(&mut self, stream: &mut TcpStream) -> std::io::Result<()> {
        stream.set_read_timeout(Some(Duration::from_secs(10)))?;
        let mut raw = Vec::new();
        let mut chunk = [0u8; 4096];
        let header_end;
        loop {
            let n = stream.read(&mut chunk)?;
            if n == 0 {
                return write_http(stream, 400, "empty request");
            }
            raw.extend_from_slice(&chunk[..n]);
            if let Some(pos) = raw.windows(4).position(|w| w == b"\r\n\r\n") {
                header_end = pos + 4;
                break;
            }
            if raw.len() > 64 * 1024 {
                return write_http(stream, 413, "headers too large");
            }
        }
        let header = String::from_utf8_lossy(&raw[..header_end]);
        let mut content_length = 0usize;
        let mut authorized = self.bearer_token.is_none();
        let mut origin_ok = true;
        for line in header.lines().skip(1) {
            let Some((key, value)) = line.split_once(':') else {
                continue;
            };
            match key.trim().to_ascii_lowercase().as_str() {
                "content-length" => content_length = value.trim().parse().unwrap_or(usize::MAX),
                "authorization" => {
                    authorized = self
                        .bearer_token
                        .as_deref()
                        .map(|token| value.trim() == format!("Bearer {token}"))
                        .unwrap_or(true);
                }
                "origin" => {
                    let origin = value.trim().to_ascii_lowercase();
                    origin_ok = origin.starts_with("http://127.0.0.1")
                        || origin.starts_with("http://localhost")
                        || origin.starts_with("tauri://localhost");
                }
                _ => {}
            }
        }
        if !authorized {
            return write_http(stream, 401, "unauthorized");
        }
        if !origin_ok {
            return write_http(stream, 403, "origin rejected");
        }
        if content_length > self.max_body_bytes {
            return write_http(stream, 413, "body too large");
        }
        while raw.len() - header_end < content_length {
            let n = stream.read(&mut chunk)?;
            if n == 0 {
                break;
            }
            raw.extend_from_slice(&chunk[..n]);
            if raw.len() - header_end > self.max_body_bytes {
                return write_http(stream, 413, "body too large");
            }
        }
        if raw.len() - header_end < content_length {
            return write_http(stream, 400, "truncated body");
        }
        let body = String::from_utf8_lossy(&raw[header_end..header_end + content_length]);
        let response = self.handle_json(&body);
        let bytes = response.as_bytes();
        write_http_bytes(stream, 200, bytes)
    }
}

fn rpc_ok<T: Serialize>(id: Value, result: T) -> Value {
    serde_json::json!({"jsonrpc":"2.0", "id": id, "result": result})
}

fn rpc_error(id: Value, code: i64, message: &str) -> String {
    serde_json::json!({"jsonrpc":"2.0", "id": id, "error":{"code":code,"message":message}})
        .to_string()
}

fn write_http(stream: &mut TcpStream, status: u16, body: &str) -> std::io::Result<()> {
    write_http_bytes(stream, status, body.as_bytes())
}

fn write_http_bytes(stream: &mut TcpStream, status: u16, body: &[u8]) -> std::io::Result<()> {
    let reason = match status {
        200 => "OK",
        400 => "Bad Request",
        401 => "Unauthorized",
        403 => "Forbidden",
        413 => "Payload Too Large",
        _ => "Error",
    };
    write!(stream, "HTTP/1.1 {status} {reason}\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n", body.len())?;
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
        // 42 native + 1 external.
        assert_eq!(resp.tools.len(), 43);
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
        assert_eq!(cat.total(), 43);
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
}
