//! Standalone EveryAIOS MCP server binary (P6.7 external-client E2E fixture).
//!
//! Serves the REAL 42-tool native catalog (37 browser + 5 storage) over
//! newline-delimited stdio (default) or a one-shot loopback HTTP listener
//! (`--http <port>`, optional `--bearer <token>` — the same origin/bearer/body
//! gates the production host enforces).
//!
//! `tools/call` is answered through the documented host seam: the standalone
//! binary installs a *deterministic test harness* (echoes tool + arguments)
//! because the real executor (browser/storage hosts + Guard-2) is injected by
//! the desktop app. The point of this binary is transport + catalog + protocol
//! proof with real external clients — e.g. the official MCP Inspector CLI
//! (`npx @modelcontextprotocol/inspector --cli …`) — not execution.

use everyaios_mcp::{all_tools, McpServer, ToolCallHandler};
use serde_json::Value;
use std::io;
use std::net::TcpListener;

#[derive(Default)]
struct StandaloneHandler;

impl ToolCallHandler for StandaloneHandler {
    fn call(&mut self, name: &str, arguments: &Value) -> Result<Value, String> {
        // Deterministic test harness. The production host injects the real
        // Guard-2-gated executor here (ToolService/Guard-2, P7).
        Ok(serde_json::json!({
            "tool": name,
            "mode": "standalone-test-harness",
            "echoed_arguments": arguments,
            "catalog_size": all_tools().len(),
        }))
    }
}

fn main() -> std::io::Result<()> {
    let mut args = std::env::args().skip(1);
    let mut http_port: Option<u16> = None;
    let mut bearer: Option<String> = None;
    while let Some(a) = args.next() {
        match a.as_str() {
            "--http" => http_port = args.next().and_then(|p| p.parse().ok()),
            "--bearer" => bearer = args.next(),
            other => {
                eprintln!(
                    "usage: mcp-standalone-server [--http <port>] [--bearer <token>]\nunknown flag: {other}"
                );
                std::process::exit(2);
            }
        }
    }

    let mut server = McpServer::new(StandaloneHandler);
    if let Some(token) = bearer {
        server = server.with_bearer_token(token);
    }

    match http_port {
        Some(port) => {
            let listener = TcpListener::bind(("127.0.0.1", port))?;
            // Print the ACTUAL bound port (port 0 = OS-assigned).
            let bound = listener.local_addr()?.port();
            eprintln!("everyaios-mcp standalone listening on 127.0.0.1:{bound}");
            for stream in listener.incoming() {
                let Ok(mut stream) = stream else { continue };
                // One request per connection (loopback supervision model);
                // a failed serve just ends that connection.
                let _ = server.serve_http_once(&mut stream);
            }
            Ok(())
        }
        None => {
            let stdin = io::stdin();
            let stdout = io::stdout();
            server.serve_stdio(stdin.lock(), stdout.lock())
        }
    }
}
