//! P10.1.12 — MCP server serves an external client:
//! initialize → tools/list → tools/call snapshot.
//!
//! This is the non-credential-gated companion to `external_client.rs` (which
//! drives the REAL `@modelcontextprotocol/inspector` CLI). Here a Rust test
//! acts as the external client over the real stdio transport of the
//! standalone server binary: handshake, catalog listing, and a snapshot tool
//! call. No node, no network, no credentials — runs in CI.

use std::io::{BufRead, BufReader, Write};
use std::process::{Child, Command, Stdio};

fn server_bin() -> &'static str {
    env!("CARGO_BIN_EXE_mcp-standalone-server")
}

struct ExternalClient {
    child: Child,
    reader: BufReader<std::process::ChildStdout>,
}

impl ExternalClient {
    fn connect() -> Self {
        let mut child = Command::new(server_bin())
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .expect("spawn standalone server");
        let stdout = child.stdout.take().expect("stdout");
        Self {
            child,
            reader: BufReader::new(stdout),
        }
    }

    /// Send one newline-delimited JSON-RPC request and read its response.
    fn rpc(&mut self, id: u64, method: &str, params: serde_json::Value) -> serde_json::Value {
        let req = serde_json::json!({ "jsonrpc": "2.0", "id": id, "method": method, "params": params });
        {
            // Stdin is only readable while the child lives; write and flush.
            let stdin = self.child.stdin.as_mut().expect("stdin");
            writeln!(stdin, "{req}").unwrap();
            stdin.flush().unwrap();
        }
        // Read until we get the response with our id (the server echoes all
        // responses in order, but be robust to interleaved notifications).
        loop {
            let mut line = String::new();
            self.reader.read_line(&mut line).unwrap();
            if line.trim().is_empty() {
                continue;
            }
            let v: serde_json::Value = serde_json::from_str(&line).unwrap_or_default();
            if v.get("id").and_then(serde_json::Value::as_u64) == Some(id) {
                return v;
            }
        }
    }
}

impl Drop for ExternalClient {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

#[test]
fn server_serves_external_client_snapshot_call() {
    let mut client = ExternalClient::connect();

    // Handshake: initialize with a requested protocol version.
    let init = client.rpc(
        1,
        "initialize",
        serde_json::json!({ "protocolVersion": "2026-07-28", "capabilities": {}, "clientInfo": { "name": "test-client", "version": "1" } }),
    );
    assert_eq!(init["result"]["protocolVersion"], "2026-07-28");
    assert_eq!(init["result"]["serverInfo"]["name"], "everyaios-mcp");

    // tools/list: the real native catalog is served over the wire (the tool
    // count grows as tools land — assert a healthy floor + key members, not a
    // brittle exact count).
    let list = client.rpc(2, "tools/list", serde_json::json!({}));
    let tools = list["result"]["tools"].as_array().expect("tools array");
    assert!(tools.len() >= 40, "real native catalog served to external client");
    for expected in ["snapshot", "search_web", "office_edit", "memory_retrieve"] {
        assert!(
            tools.iter().any(|t| t["name"] == expected),
            "{expected} tool present"
        );
    }

    // tools/call snapshot: the server answers through its test harness.
    let call = client.rpc(
        3,
        "tools/call",
        serde_json::json!({ "name": "snapshot", "arguments": {} }),
    );
    assert_eq!(call["result"]["structuredContent"]["tool"], "snapshot");
    assert!(
        call["result"]["structuredContent"].is_object(),
        "structuredContent carried: {}",
        call
    );
    assert_eq!(call["result"]["structuredContent"]["mode"], "standalone-test-harness");
    assert!(
        call["result"]["structuredContent"]["catalog_size"].as_u64().unwrap_or(0) >= 40,
        "catalog_size reflects the real native catalog"
    );
}
