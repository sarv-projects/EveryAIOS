//! ACP client session (F12/J17 — doc 45 §1). Our app plays the **Client**
//! role: it spawns an agent subprocess and drives
//! `initialize` → `session/new` → `session/prompt`, while answering the
//! agent's inbound `session/request_permission` (the Guard-2 seam) and
//! collecting `session/update` notifications for the audit trail.
//!
//! The transport is a trait so tests drive the handshake with a scripted mock;
//! the real [`ProcessTransport`] spawns the agent CLI over stdio (newline-
//! delimited JSON-RPC, stderr = free-form logs).

use crate::frame::{decode_messages, encode_message};
use crate::messages::*;
use serde_json::{json, Value};
use std::collections::VecDeque;
use std::io::{self, BufReader, Read, Write};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};

#[cfg(target_os = "linux")]
use everyaios_guard::sandbox::LinuxBwrapBackend;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AcpError {
    #[error("io error: {0}")]
    Io(#[from] io::Error),
    #[error("agent closed the stream (EOF)")]
    Eof,
    #[error("malformed agent message: {0}")]
    Malformed(String),
    #[error("agent returned an error response: {0}")]
    ServerError(String),
    #[error("session not initialized / no active session")]
    NotReady,
    #[error("protocol version mismatch: agent speaks {0}")]
    ProtocolMismatch(u64),
    /// The agent requires authentication before it will create sessions
    /// (`auth_required` error, code -32000). The client must call
    /// [`AcpSession::authenticate`] with one of the advertised methods.
    #[error("agent requires authentication (auth_required)")]
    AuthRequired,
}

/// ACP protocol-specific error codes (official schema).
const ERROR_AUTH_REQUIRED: i64 = -32000;

/// A bidirectional newline-delimited JSON-RPC transport to an agent.
pub trait AcpTransport {
    fn send(&mut self, json: &str) -> io::Result<()>;
    fn recv(&mut self) -> io::Result<Option<String>>;
    fn is_alive(&mut self) -> bool;
    fn shutdown(&mut self);
}

impl<T: AcpTransport + ?Sized> AcpTransport for &mut T {
    fn send(&mut self, json: &str) -> io::Result<()> {
        (**self).send(json)
    }
    fn recv(&mut self) -> io::Result<Option<String>> {
        (**self).recv()
    }
    fn is_alive(&mut self) -> bool {
        (**self).is_alive()
    }
    fn shutdown(&mut self) {
        (**self).shutdown();
    }
}

/// stdio transport over a spawned agent process (the ACP wire transport).
pub struct ProcessTransport {
    child: Option<Child>,
    #[cfg(target_os = "linux")]
    monitor: Option<everyaios_guard::sandbox::SandboxProcess>,
    stdin: ChildStdin,
    reader: BufReader<ChildStdout>,
    buf: Vec<u8>,
    /// Decoded messages not yet returned to the caller. `decode_messages` can
    /// yield several complete frames from one read; they must be queued, not
    /// dropped, or a fast agent's result can be lost and the caller will block
    /// forever waiting for it.
    pending: VecDeque<String>,
}

impl ProcessTransport {
    /// Spawn `command` with `args` + `env` overrides and take its stdio.
    pub fn spawn(command: &str, args: &[&str], env: &[(&str, &str)]) -> io::Result<Self> {
        let mut cmd = Command::new(command);
        cmd.args(args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null()); // ACP: stderr is free-form logs, not protocol
        for (k, v) in env {
            cmd.env(k, v);
        }
        let mut child = cmd.spawn()?;
        let stdin = child.stdin.take().ok_or_else(|| {
            io::Error::new(io::ErrorKind::BrokenPipe, "no stdin on spawned agent")
        })?;
        let stdout = child.stdout.take().ok_or_else(|| {
            io::Error::new(io::ErrorKind::BrokenPipe, "no stdout on spawned agent")
        })?;
        Ok(Self {
            child: Some(child),
            #[cfg(target_os = "linux")]
            monitor: None,
            stdin,
            reader: BufReader::new(stdout),
            buf: Vec::new(),
            pending: VecDeque::new(),
        })
    }

    /// Build a transport from stdio owned by a concrete sandbox launcher
    /// (Linux bubblewrap). The monitor is retained so shutdown/reaping stays
    /// controlled by the sandbox handle rather than an uncontrolled child
    /// constructor: `is_alive`/`shutdown` observe the sandboxed process, and
    /// the child is never reaped outside the sandbox backend.
    #[cfg(target_os = "linux")]
    pub fn spawn_sandboxed(
        spec: &everyaios_guard::sandbox::SandboxSpec,
        command: &[String],
    ) -> io::Result<Self> {
        let sandboxed = LinuxBwrapBackend
            .spawn_stdio(spec, command)
            .map_err(|e| io::Error::other(e.to_string()))?;
        Ok(Self {
            child: None,
            monitor: Some(sandboxed.monitor),
            stdin: sandboxed.stdin,
            reader: BufReader::new(sandboxed.stdout),
            buf: Vec::new(),
            pending: VecDeque::new(),
        })
    }
}

impl AcpTransport for ProcessTransport {
    fn send(&mut self, json: &str) -> io::Result<()> {
        self.stdin.write_all(encode_message(json).as_bytes())?;
        self.stdin.flush()
    }

    fn recv(&mut self) -> io::Result<Option<String>> {
        loop {
            // Serve any frames already decoded but not yet handed out (they
            // arrived together in one read chunk).
            if let Some(m) = self.pending.pop_front() {
                return Ok(Some(m));
            }
            if let Ok(msgs) = decode_messages(&mut self.buf) {
                if !msgs.is_empty() {
                    self.pending.extend(msgs);
                    if let Some(m) = self.pending.pop_front() {
                        return Ok(Some(m));
                    }
                }
            }
            let mut chunk = [0u8; 8192];
            let n = self.reader.read(&mut chunk)?;
            if n == 0 {
                // EOF: flush any partial trailing frame (best effort) before
                // signalling the stream is closed.
                if let Ok(msgs) = decode_messages(&mut self.buf) {
                    if let Some(m) = msgs.into_iter().next() {
                        return Ok(Some(m));
                    }
                }
                return Ok(None);
            }
            self.buf.extend_from_slice(&chunk[..n]);
        }
    }

    fn is_alive(&mut self) -> bool {
        #[cfg(target_os = "linux")]
        if let Some(monitor) = self.monitor.as_mut() {
            return matches!(monitor.try_wait(), Ok(None));
        }
        matches!(
            self.child.as_mut().and_then(|child| child.try_wait().ok()),
            Some(None)
        )
    }

    fn shutdown(&mut self) {
        #[cfg(target_os = "linux")]
        if let Some(monitor) = self.monitor.as_mut() {
            let _ = monitor.kill();
            return;
        }
        if let Some(child) = self.child.as_mut() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

/// The result of one driven prompt turn.
#[derive(Debug, Clone, Default)]
pub struct PromptOutcome {
    pub stop_reason: StopReason,
    /// `session/update` notifications collected during the turn.
    pub updates: Vec<SessionUpdate>,
    /// Permission requests the agent made (audit + Guard-2 trail).
    pub permissions: Vec<PermissionRequestParams>,
    /// The decisions handed back for those requests.
    pub permission_decisions: Vec<PermissionDecision>,
}

/// An ACP session: one agent subprocess + the JSON-RPC request/response state.
pub struct AcpSession<T: AcpTransport> {
    transport: T,
    next_id: u64,
    initialized: bool,
    session_id: Option<String>,
    agent_info: Option<AgentInfo>,
    auth_methods: Vec<AuthMethod>,
    authenticated: bool,
}

impl<T: AcpTransport> AcpSession<T> {
    pub fn new(transport: T) -> Self {
        Self {
            transport,
            next_id: 1,
            initialized: false,
            session_id: None,
            agent_info: None,
            auth_methods: Vec::new(),
            authenticated: false,
        }
    }

    pub fn agent_info(&self) -> Option<&AgentInfo> {
        self.agent_info.as_ref()
    }

    pub fn session_id(&self) -> Option<&str> {
        self.session_id.as_deref()
    }

    /// The authentication methods the agent advertised in `initialize`
    /// (`authMethods`). Empty ⇒ the agent needs no auth.
    pub fn auth_methods(&self) -> &[AuthMethod] {
        &self.auth_methods
    }

    /// Whether `authenticate` has succeeded on this connection.
    pub fn is_authenticated(&self) -> bool {
        self.authenticated
    }

    /// ACP handshake: `initialize` → version/capability negotiation, with the
    /// **withhold** client capability set (fs/terminal: false) — the
    /// Self-contained governance path. Withholding never forces MCP Channel B
    /// (spec §4.2.5a §3, corrected v3.46); use
    /// [`Self::initialize_with_caps`] to advertise the mediated surface.
    pub fn initialize(&mut self, client_info: ClientInfo) -> Result<InitializeResult, AcpError> {
        self.initialize_with_caps(client_info, ClientCapabilities::default())
    }

    /// ACP handshake with an explicit client capability set (P38
    /// GovernedSession): pass a capability set with `fs.readTextFile` /
    /// `writeTextFile` / `terminal` = true to advertise the **Mediated**
    /// surface (sandbox-aware agents then delegate their file/shell ops to
    /// us); pass the default (all false) to withhold.
    pub fn initialize_with_caps(
        &mut self,
        client_info: ClientInfo,
        client_capabilities: ClientCapabilities,
    ) -> Result<InitializeResult, AcpError> {
        let id = self.next_id;
        self.next_id += 1;
        let caps = serde_json::to_value(&client_capabilities)
            .map_err(|e| AcpError::Malformed(e.to_string()))?;
        let req = json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": "initialize",
            "params": {
                "protocolVersion": PROTOCOL_VERSION,
                "clientCapabilities": caps,
                "clientInfo": client_info,
            }
        });
        self.transport.send(&req.to_string())?;
        let resp = self.read_response(id)?;
        let result: InitializeResult =
            serde_json::from_value(resp).map_err(|e| AcpError::Malformed(e.to_string()))?;
        if result.protocol_version != PROTOCOL_VERSION {
            return Err(AcpError::ProtocolMismatch(result.protocol_version));
        }
        self.agent_info = Some(result.agent_info.clone());
        self.auth_methods = result.auth_methods.clone();
        self.initialized = true;
        Ok(result)
    }

    /// Authenticate with one of the methods advertised in `initialize`
    /// (`authenticate` request). `method_id` must match an advertised id.
    ///
    /// Agent-type methods return an empty result (the agent drives its own
    /// login flow — prints a URL / opens its own browser). URL-type methods
    /// return a `url` the client opens in the system browser; the caller
    /// should surface it, then call `authenticate` again once the user has
    /// completed login.
    pub fn authenticate(&mut self, method_id: &str) -> Result<AuthenticateResult, AcpError> {
        self.ensure_initialized()?;
        let id = self.next_id;
        self.next_id += 1;
        let req = json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": "authenticate",
            "params": { "methodId": method_id }
        });
        self.transport.send(&req.to_string())?;
        let resp = self.read_response(id)?;
        let result: AuthenticateResult =
            serde_json::from_value(resp).map_err(|e| AcpError::Malformed(e.to_string()))?;
        // A `url` means the user must complete login in the browser first;
        // an empty result means the flow already succeeded.
        if result.url.is_none() {
            self.authenticated = true;
        }
        Ok(result)
    }

    /// End the authenticated state (`logout` request). The agent must have
    /// advertised `agentCapabilities.auth.logout` in `initialize`; this is a
    /// best-effort call (the caller checks the capability first).
    pub fn logout(&mut self) -> Result<(), AcpError> {
        self.ensure_initialized()?;
        let id = self.next_id;
        self.next_id += 1;
        let req = json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": "logout",
            "params": {}
        });
        self.transport.send(&req.to_string())?;
        self.read_response(id)?;
        self.authenticated = false;
        Ok(())
    }

    /// Create a session in the agent's workspace (`session/new`).
    pub fn session_new(
        &mut self,
        cwd: &str,
        mcp_servers: Vec<McpServer>,
    ) -> Result<String, AcpError> {
        self.ensure_ready()?;
        let id = self.next_id;
        self.next_id += 1;
        let req = json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": "session/new",
            "params": { "cwd": cwd, "mcpServers": mcp_servers }
        });
        self.transport.send(&req.to_string())?;
        let resp = self.read_response(id)?;
        let result: SessionNewResult =
            serde_json::from_value(resp).map_err(|e| AcpError::Malformed(e.to_string()))?;
        self.session_id = Some(result.session_id.clone());
        Ok(result.session_id)
    }

    /// Drive one prompt turn. Sends `session/prompt`, then reads inbound
    /// messages until the prompt response: `session/update` notifications are
    /// collected, and `session/request_permission` requests are answered via
    /// `on_permission` (the Guard-2 seam). Unsupported client methods get a
    /// clean method-not-found error.
    pub fn prompt(
        &mut self,
        text: &str,
        mut on_permission: impl FnMut(&PermissionRequestParams) -> PermissionDecision,
    ) -> Result<PromptOutcome, AcpError> {
        self.ensure_ready()?;
        let session_id = self.session_id.clone().ok_or(AcpError::NotReady)?;
        let id = self.next_id;
        self.next_id += 1;
        let req = json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": "session/prompt",
            "params": {
                "sessionId": session_id,
                "prompt": [{ "type": "text", "text": text }],
            }
        });
        self.transport.send(&req.to_string())?;

        let mut outcome = PromptOutcome::default();
        loop {
            let Some(raw) = self.transport.recv()? else {
                return Err(AcpError::Eof);
            };
            let v: Value =
                serde_json::from_str(&raw).map_err(|e| AcpError::Malformed(e.to_string()))?;

            // Our prompt response?
            if v.get("id").and_then(Value::as_u64) == Some(id)
                && (v.get("result").is_some() || v.get("error").is_some())
            {
                if let Some(err) = v.get("error") {
                    return Err(map_error(err));
                }
                let result: SessionPromptResult =
                    serde_json::from_value(v.get("result").cloned().unwrap_or(Value::Null))
                        .map_err(|e| AcpError::Malformed(e.to_string()))?;
                outcome.stop_reason = result.stop_reason;
                return Ok(outcome);
            }

            let Some(method) = v.get("method").and_then(Value::as_str) else {
                continue; // unknown shape — skip
            };

            if let Some(rid) = v.get("id").cloned() {
                // A request from the agent (client method) → must reply.
                match method {
                    "session/request_permission" => {
                        let params: PermissionRequestParams =
                            serde_json::from_value(v.get("params").cloned().unwrap_or_default())
                                .map_err(|e| AcpError::Malformed(e.to_string()))?;
                        let decision = on_permission(&params);
                        let option_id = resolve_option(&params, &decision);
                        outcome.permissions.push(params);
                        outcome.permission_decisions.push(decision);
                        let result = PermissionResult {
                            outcome: PermissionOutcome { option_id },
                        };
                        let reply = json!({ "jsonrpc": "2.0", "id": rid, "result": result });
                        self.transport.send(&reply.to_string())?;
                    }
                    other => {
                        let reply = json!({
                            "jsonrpc": "2.0", "id": rid,
                            "error": { "code": -32601, "message": format!("method not found: {other}") }
                        });
                        self.transport.send(&reply.to_string())?;
                    }
                }
            } else {
                // Notification.
                if method == "session/update" {
                    let u: SessionUpdate =
                        serde_json::from_value(v.get("params").cloned().unwrap_or_default())
                            .map_err(|e| AcpError::Malformed(e.to_string()))?;
                    outcome.updates.push(u);
                }
            }
        }
    }

    /// Interrupt the ongoing turn (`session/cancel` notification).
    pub fn cancel(&mut self) -> Result<(), AcpError> {
        self.ensure_ready()?;
        let session_id = self.session_id.clone().ok_or(AcpError::NotReady)?;
        let msg = json!({
            "jsonrpc": "2.0",
            "method": "session/cancel",
            "params": { "sessionId": session_id }
        });
        self.transport.send(&msg.to_string())?;
        Ok(())
    }

    /// Is the underlying agent process still alive?
    pub fn is_alive(&mut self) -> bool {
        self.transport.is_alive()
    }

    /// Tear the agent down (kill + reap).
    pub fn shutdown(&mut self) {
        self.transport.shutdown();
    }

    fn ensure_ready(&self) -> Result<(), AcpError> {
        self.ensure_initialized()?;
        Ok(())
    }

    fn ensure_initialized(&self) -> Result<(), AcpError> {
        if !self.initialized {
            return Err(AcpError::NotReady);
        }
        Ok(())
    }

    fn read_response(&mut self, expected_id: u64) -> Result<Value, AcpError> {
        let Some(raw) = self.transport.recv()? else {
            return Err(AcpError::Eof);
        };
        let v: Value =
            serde_json::from_str(&raw).map_err(|e| AcpError::Malformed(e.to_string()))?;
        let got = v
            .get("id")
            .and_then(Value::as_u64)
            .ok_or_else(|| AcpError::Malformed("response without id".into()))?;
        if got != expected_id {
            return Err(AcpError::Malformed(format!(
                "id mismatch: expected {expected_id}, got {got}"
            )));
        }
        if let Some(err) = v.get("error") {
            return Err(map_error(err));
        }
        Ok(v.get("result").cloned().unwrap_or(Value::Null))
    }
}

/// Map a JSON-RPC error object to an [`AcpError`]. The ACP schema's
/// protocol-specific codes: `-32000` auth_required, `-32002`
/// resource_not_found. Unknown codes surface as [`AcpError::ServerError`].
fn map_error(err: &Value) -> AcpError {
    let code = err.get("code").and_then(Value::as_i64);
    if code == Some(ERROR_AUTH_REQUIRED) {
        return AcpError::AuthRequired;
    }
    // Some agents use the older -32001 or message-based auth_required signal;
    // treat a message containing "auth_required" as the same condition.
    if let Some(msg) = err.get("message").and_then(Value::as_str) {
        if msg.contains("auth_required") {
            return AcpError::AuthRequired;
        }
    }
    AcpError::ServerError(err.to_string())
}

/// Choose the option id that realizes a [`PermissionDecision`], synthesizing a
/// default when the decision carries no explicit option.
fn resolve_option(params: &PermissionRequestParams, decision: &PermissionDecision) -> String {
    let (wanted, allow) = match decision {
        PermissionDecision::Allow { option_id } => (option_id.as_deref(), true),
        PermissionDecision::Deny { option_id } => (option_id.as_deref(), false),
    };
    if let Some(id) = wanted {
        return id.to_string();
    }
    for opt in &params.options {
        let matches = if allow {
            matches!(
                opt.kind,
                PermissionOptionKind::AllowOnce | PermissionOptionKind::AllowAlways
            )
        } else {
            matches!(
                opt.kind,
                PermissionOptionKind::RejectOnce | PermissionOptionKind::RejectAlways
            )
        };
        if matches {
            return opt.option_id.clone();
        }
    }
    if allow {
        "allow_once".to_string()
    } else {
        "reject_once".to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::VecDeque;

    struct MockTransport {
        responses: VecDeque<String>,
        sent: Vec<String>,
        alive: bool,
    }

    impl MockTransport {
        fn new(responses: Vec<&str>) -> Self {
            Self {
                responses: responses.into_iter().map(str::to_string).collect(),
                sent: Vec::new(),
                alive: true,
            }
        }
    }

    impl AcpTransport for MockTransport {
        fn send(&mut self, json: &str) -> io::Result<()> {
            self.sent.push(json.to_string());
            Ok(())
        }
        fn recv(&mut self) -> io::Result<Option<String>> {
            Ok(self.responses.pop_front())
        }
        fn is_alive(&mut self) -> bool {
            self.alive
        }
        fn shutdown(&mut self) {
            self.alive = false;
        }
    }

    fn result_response(id: u64, result: Value) -> String {
        json!({ "jsonrpc": "2.0", "id": id, "result": result }).to_string()
    }

    fn client_info() -> ClientInfo {
        ClientInfo {
            name: "everyaios".into(),
            title: "EveryAIOS".into(),
            version: "0.1.0".into(),
        }
    }

    fn init_result() -> Value {
        json!({
            "protocolVersion": 1,
            "agentCapabilities": { "loadSession": true },
            "agentInfo": { "name": "claude-acp", "title": "Claude", "version": "0.66.0" },
            "authMethods": []
        })
    }

    #[test]
    fn initialize_negotiates_version_and_capabilities() {
        let mut t = MockTransport::new(vec![&result_response(1, init_result())]);
        let mut s = AcpSession::new(&mut t);
        let r = s.initialize(client_info()).unwrap();
        assert_eq!(r.protocol_version, 1);
        assert_eq!(s.agent_info().unwrap().name, "claude-acp");
        let first: Value = serde_json::from_str(&t.sent[0]).unwrap();
        assert_eq!(first["method"], "initialize");
        assert_eq!(first["params"]["protocolVersion"], 1);
    }

    #[test]
    fn initialize_withhold_payload_has_fs_terminal_false() {
        // P38 GovernedSession: the default (withhold) path sends fs/terminal
        // false — the Self-contained path, never a Channel-B force.
        let mut t = MockTransport::new(vec![&result_response(1, init_result())]);
        let mut s = AcpSession::new(&mut t);
        s.initialize(client_info()).unwrap();
        let first: Value = serde_json::from_str(&t.sent[0]).unwrap();
        let caps = &first["params"]["clientCapabilities"];
        assert_eq!(caps["fs"]["readTextFile"], false);
        assert_eq!(caps["fs"]["writeTextFile"], false);
        assert_eq!(caps["terminal"], false);
    }

    #[test]
    fn initialize_mediated_payload_advertises_fs_terminal() {
        // P38 GovernedSession Mediated: advertising fs/terminal true makes
        // sandbox-aware agents delegate their file/shell ops to us.
        let mut t = MockTransport::new(vec![&result_response(1, init_result())]);
        let mut s = AcpSession::new(&mut t);
        let caps = ClientCapabilities {
            fs: FsCapabilities {
                read_text_file: true,
                write_text_file: true,
            },
            terminal: true,
        };
        s.initialize_with_caps(client_info(), caps).unwrap();
        let first: Value = serde_json::from_str(&t.sent[0]).unwrap();
        let caps = &first["params"]["clientCapabilities"];
        assert_eq!(caps["fs"]["readTextFile"], true);
        assert_eq!(caps["fs"]["writeTextFile"], true);
        assert_eq!(caps["terminal"], true);
    }

    #[test]
    fn session_new_sets_session_id() {
        let mut t = MockTransport::new(vec![
            &result_response(1, init_result()),
            &result_response(2, json!({ "sessionId": "sess-1" })),
        ]);
        let mut s = AcpSession::new(&mut t);
        s.initialize(client_info()).unwrap();
        let sid = s.session_new("/workspace", vec![]).unwrap();
        assert_eq!(sid, "sess-1");
        assert_eq!(s.session_id(), Some("sess-1"));
    }

    #[test]
    fn prompt_drives_turn_and_answers_permission() {
        // Sequence after initialize+session/new (ids 1,2): prompt = id 3.
        // Inbound: a session/update notification, a request_permission (id 99),
        // then the prompt response (id 3).
        let mut t = MockTransport::new(vec![
            &result_response(1, init_result()),
            &result_response(2, json!({ "sessionId": "s1" })),
            &json!({
                "jsonrpc": "2.0",
                "method": "session/update",
                "params": { "sessionId": "s1", "sessionUpdate": "tool_call", "toolCallId": "tc1", "title": "Edit", "kind": "edit" }
            })
            .to_string(),
            &json!({
                "jsonrpc": "2.0", "id": 99, "method": "session/request_permission",
                "params": {
                    "sessionId": "s1",
                    "toolCall": { "toolCallId": "tc1", "title": "Edit a.rs", "kind": "edit" },
                    "options": [ { "optionId": "allow-once", "kind": "allow_once", "label": "Allow once" } ]
                }
            })
            .to_string(),
            &result_response(3, json!({ "stopReason": "end_turn" })),
        ]);
        let mut s = AcpSession::new(&mut t);
        s.initialize(client_info()).unwrap();
        s.session_new("/w", vec![]).unwrap();

        let outcome = s
            .prompt("fix the bug", |_p| PermissionDecision::allow())
            .unwrap();
        assert_eq!(outcome.stop_reason, StopReason::EndTurn);
        assert_eq!(outcome.updates.len(), 1);
        assert!(outcome.updates[0].is_tool_call());
        assert_eq!(outcome.permissions.len(), 1);
        assert_eq!(outcome.permission_decisions[0], PermissionDecision::allow());

        // The permission reply selected the offered allow-once option.
        let replies: Vec<Value> = t
            .sent
            .iter()
            .map(|s| serde_json::from_str(s).unwrap())
            .filter(|v: &Value| {
                v.get("method").and_then(Value::as_str).is_none()
                    && v.get("id").is_some()
                    && v.get("result").is_some()
            })
            .collect();
        let perm_reply = replies
            .iter()
            .find(|v| v["result"]["outcome"].is_object())
            .expect("permission reply present");
        assert_eq!(perm_reply["result"]["outcome"]["optionId"], "allow-once");
    }

    #[test]
    fn prompt_deny_uses_reject_option() {
        let mut t = MockTransport::new(vec![
            &result_response(1, init_result()),
            &result_response(2, json!({ "sessionId": "s1" })),
            &json!({
                "jsonrpc": "2.0", "id": 99, "method": "session/request_permission",
                "params": {
                    "sessionId": "s1",
                    "toolCall": { "toolCallId": "tc1", "title": "rm", "kind": "delete" },
                    "options": [
                        { "optionId": "allow-once", "kind": "allow_once", "label": "Allow" },
                        { "optionId": "reject-once", "kind": "reject_once", "label": "Reject" }
                    ]
                }
            })
            .to_string(),
            &result_response(3, json!({ "stopReason": "refusal" })),
        ]);
        let mut s = AcpSession::new(&mut t);
        s.initialize(client_info()).unwrap();
        s.session_new("/w", vec![]).unwrap();
        let outcome = s
            .prompt("delete it", |_p| PermissionDecision::deny())
            .unwrap();
        assert_eq!(outcome.stop_reason, StopReason::Refusal);
        let reply: Value = serde_json::from_str(&t.sent[t.sent.len() - 1]).unwrap();
        assert_eq!(reply["result"]["outcome"]["optionId"], "reject-once");
    }

    #[test]
    fn authenticate_agent_method_succeeds() {
        let mut t = MockTransport::new(vec![
            &result_response(1, init_result()),
            &result_response(2, json!({})),
        ]);
        let mut s = AcpSession::new(&mut t);
        s.initialize(client_info()).unwrap();
        assert!(!s.is_authenticated());

        let r = s.authenticate("agent-login").unwrap();
        assert!(r.url.is_none());
        assert!(s.is_authenticated());

        // The request carried the advertised method id.
        let req: Value = serde_json::from_str(&t.sent[1]).unwrap();
        assert_eq!(req["method"], "authenticate");
        assert_eq!(req["params"]["methodId"], "agent-login");
    }

    #[test]
    fn authenticate_url_method_returns_url_and_waits() {
        let mut t = MockTransport::new(vec![
            &result_response(1, init_result()),
            // url-type: first call returns the browser URL, not yet authed.
            &result_response(
                2,
                json!({ "url": "https://agent.example.com/login?code=abc" }),
            ),
            // after the user completes login, the second call returns {}.
            &result_response(3, json!({})),
        ]);
        let mut s = AcpSession::new(&mut t);
        s.initialize(client_info()).unwrap();

        let r = s.authenticate("agent-login").unwrap();
        assert_eq!(
            r.url.as_deref(),
            Some("https://agent.example.com/login?code=abc")
        );
        assert!(!s.is_authenticated(), "url flow not complete until re-auth");

        let r = s.authenticate("agent-login").unwrap();
        assert!(r.url.is_none());
        assert!(s.is_authenticated());
    }

    #[test]
    fn auth_required_error_is_detected_on_session_new() {
        // initialize ok; session/new fails with the auth_required code.
        let mut t = MockTransport::new(vec![
            &result_response(1, init_result()),
            &json!({
                "jsonrpc": "2.0", "id": 2,
                "error": { "code": -32000, "message": "Authentication required" }
            })
            .to_string(),
        ]);
        let mut s = AcpSession::new(&mut t);
        s.initialize(client_info()).unwrap();
        assert!(matches!(
            s.session_new("/w", vec![]),
            Err(AcpError::AuthRequired)
        ));
    }

    #[test]
    fn auth_required_message_fallback_detected() {
        // Older agents may use -32001 + a message mentioning auth_required.
        let mut t = MockTransport::new(vec![
            &result_response(1, init_result()),
            &json!({
                "jsonrpc": "2.0", "id": 2,
                "error": { "code": -32001, "message": "auth_required: sign in first" }
            })
            .to_string(),
        ]);
        let mut s = AcpSession::new(&mut t);
        s.initialize(client_info()).unwrap();
        assert!(matches!(
            s.session_new("/w", vec![]),
            Err(AcpError::AuthRequired)
        ));
    }

    #[test]
    fn logout_sends_request_and_clears_auth() {
        let mut t = MockTransport::new(vec![
            &result_response(1, init_result()),
            &result_response(2, json!({})),
            &result_response(3, json!({})),
        ]);
        let mut s = AcpSession::new(&mut t);
        s.initialize(client_info()).unwrap();
        s.authenticate("agent-login").unwrap();
        assert!(s.is_authenticated());

        s.logout().unwrap();
        assert!(!s.is_authenticated());
        let req: Value = serde_json::from_str(&t.sent[2]).unwrap();
        assert_eq!(req["method"], "logout");
    }

    #[test]
    fn initialize_exposes_advertised_auth_methods() {
        let mut t = MockTransport::new(vec![&result_response(
            1,
            json!({
                "protocolVersion": 1,
                "agentCapabilities": { "auth": { "logout": {} } },
                "agentInfo": { "name": "claude-acp", "title": "Claude", "version": "1" },
                "authMethods": [
                    { "id": "agent-login", "name": "Agent login", "description": "Sign in with your account" },
                    { "id": "browser", "name": "Browser login", "type": "url", "description": "Open a browser" }
                ]
            }),
        )]);
        let mut s = AcpSession::new(&mut t);
        s.initialize(client_info()).unwrap();
        let methods = s.auth_methods();
        assert_eq!(methods.len(), 2);
        assert_eq!(methods[0].id, "agent-login");
        assert_eq!(methods[1].r#type, Some(AuthMethodType::Url));
    }

    #[test]
    fn protocol_mismatch_is_surfaced() {
        let mut t = MockTransport::new(vec![&result_response(1, json!({ "protocolVersion": 2 }))]);
        let mut s = AcpSession::new(&mut t);
        assert!(matches!(
            s.initialize(client_info()),
            Err(AcpError::ProtocolMismatch(2))
        ));
    }

    #[test]
    fn prompt_before_session_fails() {
        let mut t = MockTransport::new(vec![&result_response(1, init_result())]);
        let mut s = AcpSession::new(&mut t);
        s.initialize(client_info()).unwrap();
        assert!(matches!(
            s.prompt("x", |_| PermissionDecision::allow()),
            Err(AcpError::NotReady)
        ));
    }

    #[test]
    fn cancel_sends_notification() {
        let mut t = MockTransport::new(vec![
            &result_response(1, init_result()),
            &result_response(2, json!({ "sessionId": "s1" })),
        ]);
        let mut s = AcpSession::new(&mut t);
        s.initialize(client_info()).unwrap();
        s.session_new("/w", vec![]).unwrap();
        s.cancel().unwrap();
        let last: Value = serde_json::from_str(&t.sent[t.sent.len() - 1]).unwrap();
        assert_eq!(last["method"], "session/cancel");
        assert_eq!(last["params"]["sessionId"], "s1");
    }

    /// Real process smoke test: spawn `cat` (echoes stdin) over the newline
    /// transport and verify one frame round-trips.
    #[cfg(unix)]
    #[test]
    fn process_transport_roundtrips_through_stdio() {
        let mut t = ProcessTransport::spawn("cat", &[], &[]).unwrap();
        assert!(t.is_alive());
        t.send(r#"{"jsonrpc":"2.0","id":1,"method":"ping"}"#)
            .unwrap();
        let echoed = t.recv().unwrap().expect("cat echoes");
        assert_eq!(echoed, r#"{"jsonrpc":"2.0","id":1,"method":"ping"}"#);
        t.shutdown();
        assert!(!t.is_alive());
    }

    #[test]
    fn spawn_missing_binary_errors() {
        assert!(ProcessTransport::spawn("definitely-not-a-real-agent", &[], &[]).is_err());
    }

    /// Sandboxed-process smoke test (Linux only): round-trip one frame over
    /// a bwrap-launched `/bin/cat`, with the monitor owning the child. The
    /// test skips (honest no-op) when bubblewrap or user namespaces are
    /// unavailable on the host; it never passes without real containment.
    #[cfg(all(unix, target_os = "linux"))]
    #[test]
    fn sandboxed_transport_roundtrips_through_bwrap() {
        use everyaios_guard::sandbox::linux_bwrap_available;
        use everyaios_guard::sandbox::{profiles, SandboxRole, SandboxSpec};
        if !linux_bwrap_available() {
            eprintln!("bwrap not available — skipping sandboxed transport test");
            return;
        }
        // The backend refuses to bind a nonexistent host path (fail-closed);
        // the worker profile's scratch dir must exist before spawning.
        let scratch = "/tmp/everyaios-acp-sandbox-test";
        let _ = std::fs::create_dir_all(scratch);
        let spec = SandboxSpec {
            role: SandboxRole::ChildExecutionSandbox,
            profile: profiles::worker(scratch),
            network: "deny".into(),
            credentials: "none".into(),
            resource_limit_bytes: 1 << 20,
        };
        let Ok(mut t) = ProcessTransport::spawn_sandboxed(&spec, &["/bin/cat".into()]) else {
            // bwrap present but unusable (e.g. no user namespaces in this
            // container) — fail-closed today, not a transport regression.
            eprintln!("sandboxed spawn unavailable — skipping sandboxed transport test");
            return;
        };
        assert!(t.is_alive());
        t.send(r#"{"jsonrpc":"2.0","id":1,"method":"ping"}"#)
            .unwrap();
        let echoed = t.recv().unwrap().expect("cat echoes through bwrap");
        assert_eq!(echoed, r#"{"jsonrpc":"2.0","id":1,"method":"ping"}"#);
        t.shutdown();
        assert!(!t.is_alive());
    }

    /// Regression: two frames arriving in a single read chunk must BOTH be
    /// delivered. The old `recv` kept only the first message and dropped the
    /// rest, which could hang the client waiting for a response that was
    /// already received and discarded.
    #[cfg(unix)]
    #[test]
    fn recv_queues_multiple_frames_from_one_chunk() {
        let mut t =
            ProcessTransport::spawn("sh", &["-c", "printf '{\"a\":1}\\n{\"b\":2}\\n'"], &[])
                .unwrap();
        let first = t.recv().unwrap().expect("first frame");
        let second = t.recv().unwrap().expect("second frame");
        assert_eq!(first, "{\"a\":1}");
        assert_eq!(second, "{\"b\":2}");
        // Stream is now at EOF.
        assert_eq!(t.recv().unwrap(), None);
        t.shutdown();
    }
}
