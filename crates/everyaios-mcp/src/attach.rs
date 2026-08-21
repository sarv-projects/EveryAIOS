//! MCP server attach (P6.6 #3/#5 — user-supplied stdio/npx or user-hosted
//! HTTP). This is the *attach* machinery: spawn a user-supplied MCP server
//! command (e.g. `npx @gmail/mcp-server` or a local binary), perform
//! `initialize` + `tools/list`, and reconcile the discovered tools into a
//! [`ToolCatalog`] with native precedence.
//!
//! The live provider servers (Gmail/Slack/GitHub/Linear official MCP servers)
//! remain credential/install-gated; the attach protocol itself is fully
//! exercised here against a spawned mock MCP server over loopback stdio.

use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};

use serde::Serialize;

use crate::server::{ExternalTool, ToolCatalog};

/// An attached MCP server: the child process plus its reconciled tool names.
pub struct AttachedServer {
    child: Child,
    stdin: ChildStdin,
    reader: BufReader<ChildStdout>,
    pub tools: Vec<String>,
}

/// Errors from the attach handshake.
#[derive(Debug, thiserror::Error)]
pub enum AttachError {
    #[error("spawn failed: {0}")]
    Spawn(std::io::Error),
    #[error("stdio unavailable: {0}")]
    Stdio(String),
    #[error("server closed the stream during handshake")]
    Eof,
    #[error("malformed server reply: {0}")]
    Malformed(String),
    #[error("server error reply: {0}")]
    Server(String),
    #[error("protocol mismatch: {0}")]
    Protocol(String),
}

impl AttachedServer {
    /// Spawn a user-supplied MCP server over newline-delimited stdio (the
    /// 2026-07-28 stateless transport our server speaks, doc 61). Args are
    /// passed verbatim — SEP-1024 exact-command consent happens in the UI
    /// (H3) before this is called.
    pub fn spawn(command: &str, args: &[&str]) -> Result<Self, AttachError> {
        let mut child = Command::new(command)
            .args(args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit()) // server logs stay visible for debug
            .spawn()
            .map_err(AttachError::Spawn)?;
        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| AttachError::Stdio("no stdin".into()))?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| AttachError::Stdio("no stdout".into()))?;
        Ok(Self {
            child,
            stdin,
            reader: BufReader::new(stdout),
            tools: Vec::new(),
        })
    }

    fn send(&mut self, json: &str) -> Result<(), AttachError> {
        self.stdin
            .write_all(json.as_bytes())
            .and_then(|_| self.stdin.write_all(b"\n"))
            .and_then(|_| self.stdin.flush())
            .map_err(AttachError::Spawn)
    }

    fn recv(&mut self) -> Result<serde_json::Value, AttachError> {
        let mut line = String::new();
        let n = self
            .reader
            .read_line(&mut line)
            .map_err(AttachError::Spawn)?;
        if n == 0 {
            return Err(AttachError::Eof);
        }
        serde_json::from_str(line.trim()).map_err(|e| AttachError::Malformed(e.to_string()))
    }

    /// Perform the attach handshake: `initialize` (if the server supports
    /// it), then `tools/list`, then reconcile into `catalog`. Returns the
    /// discovered tool names.
    pub fn attach(
        &mut self,
        catalog: &mut ToolCatalog,
        source_label: &str,
    ) -> Result<Vec<String>, AttachError> {
        // initialize is best-effort — minimal servers may answer only
        // tools/list. A method-not-found error is tolerated.
        let init = serde_json::json!({
            "jsonrpc": "2.0", "id": 1, "method": "initialize",
            "params": { "protocolVersion": "2026-07-28", "capabilities": {} }
        });
        self.send(&init.to_string())?;
        if let Ok(reply) = self.recv() {
            if let Some(err) = reply.get("error") {
                // tolerate unknown-method; anything else is fatal
                let code = err.get("code").and_then(serde_json::Value::as_i64);
                if code != Some(-32601) {
                    return Err(AttachError::Server(err.to_string()));
                }
            }
        }

        let list = serde_json::json!({
            "jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}
        });
        self.send(&list.to_string())?;
        let reply = self.recv()?;
        if let Some(err) = reply.get("error") {
            return Err(AttachError::Server(err.to_string()));
        }
        let result = reply
            .get("result")
            .ok_or_else(|| AttachError::Protocol("tools/list reply without result".into()))?;
        let tools = result
            .get("tools")
            .and_then(serde_json::Value::as_array)
            .ok_or_else(|| AttachError::Protocol("tools/list result without tools array".into()))?;

        let mut names = Vec::new();
        for t in tools {
            let Some(name) = t.get("name").and_then(serde_json::Value::as_str) else {
                continue;
            };
            let tool = ExternalTool {
                name: name.to_string(),
                description: t
                    .get("description")
                    .and_then(serde_json::Value::as_str)
                    .unwrap_or("")
                    .to_string(),
                input_schema: t
                    .get("inputSchema")
                    .cloned()
                    .unwrap_or(serde_json::json!({})),
                read_only: t
                    .get("readOnlyHint")
                    .and_then(serde_json::Value::as_bool)
                    .unwrap_or(false),
                open_world: t
                    .get("openWorldHint")
                    .and_then(serde_json::Value::as_bool)
                    .unwrap_or(false),
                source: source_label.to_string(),
            };
            if catalog.register(tool) {
                names.push(name.to_string());
            }
        }
        self.tools = names.clone();
        Ok(names)
    }

    /// Tear the child process down.
    pub fn shutdown(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

/// The attach request shape for the coordinator seam (serialized for the
/// JSON-RPC surface).
#[derive(Debug, Clone, Serialize)]
pub struct AttachRequest {
    pub command: String,
    pub args: Vec<String>,
    /// Human label recorded as tool provenance (e.g. "mcp:gmail").
    pub source: String,
}
