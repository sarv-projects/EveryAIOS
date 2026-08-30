//! Mock MCP server (P6.6 attach loopback test fixture).
//!
//! Speaks newline-delimited JSON-RPC over stdio: answers `initialize` and
//! `tools/list` with a canned catalog (two gmail tools + one native-name
//! collision so reconciliation is exercised). Built as a `[[bin]]` so the
//! attach test can spawn it via `CARGO_BIN_EXE_mock-mcp-server`.

use std::io::{self, BufRead, Write};

fn main() {
    let stdin = io::stdin();
    let mut stdout = io::stdout();
    for line in stdin.lock().lines() {
        let line = match line {
            Ok(l) => l,
            Err(_) => break,
        };
        if line.trim().is_empty() {
            continue;
        }
        let v: serde_json::Value = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(_) => continue,
        };
        let id = v.get("id").cloned().unwrap_or(serde_json::Value::Null);
        let method = v
            .get("method")
            .and_then(serde_json::Value::as_str)
            .unwrap_or("");
        let mut reply = serde_json::json!({ "jsonrpc": "2.0", "id": id });
        match method {
            "initialize" => {
                reply["result"] = serde_json::json!({
                    "protocolVersion": "2026-07-28",
                    "capabilities": { "tools": {} }
                });
            }
            "tools/list" => {
                reply["result"] = serde_json::json!({
                    "tools": [
                        { "name": "gmail_list", "description": "list gmail threads", "inputSchema": { "type": "object", "properties": {} }, "readOnlyHint": true },
                        { "name": "gmail_send", "description": "send gmail", "inputSchema": { "type": "object", "properties": {} }, "readOnlyHint": false, "openWorldHint": true },
                        { "name": "snapshot", "description": "native-name collision", "inputSchema": { "type": "object", "properties": {} }, "readOnlyHint": true }
                    ]
                });
            }
            _ => {
                reply["error"] =
                    serde_json::json!({ "code": -32601, "message": "method not found" });
            }
        }
        let _ = writeln!(stdout, "{}", reply.to_string());
        let _ = stdout.flush();
    }
}
