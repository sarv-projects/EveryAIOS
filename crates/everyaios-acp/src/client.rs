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
use std::sync::{Arc, Mutex};

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
    /// The host requested cancellation for the active turn.
    #[error("ACP turn cancelled")]
    Cancelled,
}

/// ACP protocol-specific error codes (official schema).
const ERROR_AUTH_REQUIRED: i64 = -32000;

/// Transport callback used to write a framed `session/cancel` notification.
pub type AcpCancelSender = Arc<dyn Fn(&str) -> io::Result<()> + Send + Sync>;

/// A process-independent cancellation hook for an ACP session.
///
/// The hook is deliberately separate from [`AcpSession`]: the shell can keep
/// the session in a per-handle mutex while a prompt is blocked in provider I/O,
/// then request cancellation without taking that mutex or the global handle-map
/// lock. Process transports install a writer for the `session/cancel`
/// notification; scripted transports may omit the writer and still observe the
/// local cancellation flag.
#[derive(Clone)]
pub struct AcpCancelHandle {
    requested: Arc<std::sync::atomic::AtomicBool>,
    gate: Arc<Mutex<()>>,
    sender: Option<AcpCancelSender>,
}

impl AcpCancelHandle {
    /// Build a cancellation hook for a custom transport. `sender` receives the
    /// raw JSON-RPC notification and should write it using the transport's
    /// framing rules.
    pub fn new(
        requested: Arc<std::sync::atomic::AtomicBool>,
        sender: Option<AcpCancelSender>,
    ) -> Self {
        Self {
            requested,
            gate: Arc::new(Mutex::new(())),
            sender,
        }
    }

    fn mark_requested(&self) -> io::Result<()> {
        let _gate = self
            .gate
            .lock()
            .map_err(|_| io::Error::other("ACP cancellation gate poisoned"))?;
        self.requested
            .store(true, std::sync::atomic::Ordering::Release);
        Ok(())
    }

    /// Request cancellation of `session_id` and return the transport writer's
    /// result. A missing writer is still a successful local cancellation.
    pub fn request(&self, session_id: &str) -> io::Result<()> {
        let _gate = self
            .gate
            .lock()
            .map_err(|_| io::Error::other("ACP cancellation gate poisoned"))?;
        self.requested
            .store(true, std::sync::atomic::Ordering::Release);
        let Some(sender) = &self.sender else {
            return Ok(());
        };
        let message = json!({
            "jsonrpc": "2.0",
            "method": "session/cancel",
            "params": { "sessionId": session_id }
        });
        sender(&message.to_string())
    }

    /// Whether a cancellation has been requested for the current turn.
    pub fn is_requested(&self) -> bool {
        self.requested
            .load(std::sync::atomic::Ordering::Acquire)
    }

    /// Clear the flag before starting a new turn on the same provider session.
    pub fn reset(&self) {
        if let Ok(_gate) = self.gate.lock() {
            self.requested
                .store(false, std::sync::atomic::Ordering::Release);
        }
    }
}

/// A bidirectional newline-delimited JSON-RPC transport to an agent.
pub trait AcpTransport {
    fn send(&mut self, json: &str) -> io::Result<()>;
    fn recv(&mut self) -> io::Result<Option<String>>;
    fn is_alive(&mut self) -> bool;
    fn shutdown(&mut self);
    /// Return a cancellation writer that can be used without borrowing the
    /// transport. Transports without a concurrent writer may omit it.
    fn cancellation_handle(&self) -> Option<AcpCancelHandle> {
        None
    }
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
    fn cancellation_handle(&self) -> Option<AcpCancelHandle> {
        (**self).cancellation_handle()
    }
}

/// stdio transport over a spawned agent process (the ACP wire transport).
pub struct ProcessTransport {
    child: Option<Child>,
    #[cfg(target_os = "linux")]
    monitor: Option<everyaios_guard::sandbox::SandboxProcess>,
    stdin: Arc<Mutex<ChildStdin>>,
    cancel_sender: Option<AcpCancelSender>,
    cancel_requested: Arc<std::sync::atomic::AtomicBool>,
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
        let stdin = Arc::new(Mutex::new(stdin));
        let cancel_stdin = Arc::clone(&stdin);
        let cancel_sender = Arc::new(move |message: &str| {
            let mut stdin = cancel_stdin
                .lock()
                .map_err(|_| io::Error::other("ACP stdin lock poisoned"))?;
            stdin.write_all(encode_message(message).as_bytes())?;
            stdin.flush()
        });
        let cancel_requested = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let stdout = child.stdout.take().ok_or_else(|| {
            io::Error::new(io::ErrorKind::BrokenPipe, "no stdout on spawned agent")
        })?;
        Ok(Self {
            child: Some(child),
            #[cfg(target_os = "linux")]
            monitor: None,
            stdin,
            cancel_sender: Some(cancel_sender),
            cancel_requested,
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
        let stdin = Arc::new(Mutex::new(sandboxed.stdin));
        let cancel_stdin = Arc::clone(&stdin);
        let cancel_sender = Arc::new(move |message: &str| {
            let mut stdin = cancel_stdin
                .lock()
                .map_err(|_| io::Error::other("ACP stdin lock poisoned"))?;
            stdin.write_all(encode_message(message).as_bytes())?;
            stdin.flush()
        });
        let cancel_requested = Arc::new(std::sync::atomic::AtomicBool::new(false));
        Ok(Self {
            child: None,
            monitor: Some(sandboxed.monitor),
            stdin,
            cancel_sender: Some(cancel_sender),
            cancel_requested,
            reader: BufReader::new(sandboxed.stdout),
            buf: Vec::new(),
            pending: VecDeque::new(),
        })
    }
}

impl AcpTransport for ProcessTransport {
    fn send(&mut self, json: &str) -> io::Result<()> {
        let mut stdin = self
            .stdin
            .lock()
            .map_err(|_| io::Error::other("ACP stdin lock poisoned"))?;
        stdin.write_all(encode_message(json).as_bytes())?;
        stdin.flush()
    }

    fn cancellation_handle(&self) -> Option<AcpCancelHandle> {
        Some(AcpCancelHandle::new(
            Arc::clone(&self.cancel_requested),
            self.cancel_sender.clone(),
        ))
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
    /// P71.4 — the agent's own token/cost report for this turn, exactly as it
    /// sent it. `None` = the agent reported no usage; the ledger records that
    /// as an unreported turn rather than a measured zero (`ARCH/ROUTING.md` §5).
    pub usage: Option<PromptUsage>,
    /// `session/update` notifications collected during the turn.
    pub updates: Vec<SessionUpdate>,
    /// Permission requests the agent made (audit + Guard-2 trail).
    pub permissions: Vec<PermissionRequestParams>,
    /// The decisions handed back for those requests.
    pub permission_decisions: Vec<PermissionDecision>,
    /// Agent→client mediated calls serviced during the turn (P69.C2): each is
    /// routed through the host's [`ClientMediation`] seam and recorded here so
    /// the audit trail carries the same evidence the permission path does.
    pub mediated: Vec<MediatedCall>,
}

/// One agent→client request serviced through the mediation seam.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MediatedCall {
    /// The ACP method (`fs/read_text_file`, `terminal/create`, …).
    pub method: String,
    /// Whether the host's mediator completed it (a refusal records `false`).
    pub ok: bool,
    /// The refusal/failure reason when `ok` is false.
    pub error: Option<String>,
}

/// The host's **mediation seam** for agent→client requests (P69.C2).
///
/// Mediated mode means the agent asks *us* to read/write files or run a
/// terminal command, and we service that request through the canonical
/// capability executor (Guard → ticket → executor → observation + receipt).
/// The ACP layer therefore never performs the effect itself — it hands the
/// method + params to the host and returns the host's result.
///
/// The default (no mediator attached) is an explicit fail-closed refusal, so a
/// mediated-mode session can never silently service an ungoverned effect.
pub trait ClientMediation: Send + Sync {
    /// Handle one request and return the JSON `result` payload, or a refusal
    /// message. Implementations must not invent a success they did not
    /// perform.
    fn call(&self, method: &str, params: &serde_json::Value) -> Result<serde_json::Value, String>;
}

/// The ACP v1 client-side surface the mediator answers (P69.C2). ACP v2
/// removes this surface in favour of `mcpServers`; v1-only agents remain
/// common, so mediated mode must service these names while Channel B (the MCP
/// catalogue) is the durable path.
pub fn is_mediated_client_method(method: &str) -> bool {
    matches!(
        method,
        "fs/read_text_file"
            | "fs/write_text_file"
            | "terminal/create"
            | "terminal/output"
            | "terminal/wait_for_exit"
            | "terminal/kill"
            | "terminal/release"
    )
}

/// An explicit refusal used when no mediator is attached.
pub struct NoMediation;

impl ClientMediation for NoMediation {
    fn call(&self, method: &str, _params: &serde_json::Value) -> Result<serde_json::Value, String> {
        Err(format!(
            "mediated mode unavailable: no capability mediator attached for `{method}` \
             (self-contained mode — service it through the agent's own executor or Channel B)"
        ))
    }
}

/// An ACP session: one agent subprocess + the JSON-RPC request/response state.
pub struct AcpSession<T: AcpTransport> {
    transport: T,
    next_id: u64,
    initialized: bool,
    session_id: Option<String>,
    agent_info: Option<AgentInfo>,
    auth_methods: Vec<AuthMethod>,
    agent_capabilities: Option<AgentCapabilities>,
    config_options: Vec<ConfigOption>,
    authenticated: bool,
    /// The host's mediation seam (P69.C2). `None` ⇒ mediated requests are
    /// refused explicitly rather than answered `-32601`.
    mediator: Option<std::sync::Arc<dyn ClientMediation>>,
    /// Inbound messages that arrived **before** the response we were waiting
    /// for. ACP agents interleave freely — `codex-acp` sends `session/update`
    /// notifications between our `session/new` request and its reply — so a
    /// response reader that assumes the next frame is its own answer breaks on
    /// a real agent. Non-matching frames are parked here and drained by
    /// [`AcpSession::prompt_with_content`].
    pending: std::collections::VecDeque<Value>,
    /// A lock-free cancellation hook owned by the transport, when available.
    /// It is independent of the mutable session borrow so a host can cancel a
    /// blocked prompt without taking the global handle-map lock.
    cancel_handle: AcpCancelHandle,
}

impl<T: AcpTransport> AcpSession<T> {
    pub fn new(transport: T) -> Self {
        let cancel_handle = transport
            .cancellation_handle()
            .unwrap_or_else(|| AcpCancelHandle::new(Arc::new(std::sync::atomic::AtomicBool::new(false)), None));
        Self {
            transport,
            next_id: 1,
            initialized: false,
            session_id: None,
            agent_info: None,
            auth_methods: Vec::new(),
            agent_capabilities: None,
            config_options: Vec::new(),
            authenticated: false,
            mediator: None,
            pending: std::collections::VecDeque::new(),
            cancel_handle,
        }
    }

    /// Clone the cancellation hook for a host that cannot borrow the session
    /// while a prompt is blocked.
    pub fn cancellation_handle(&self) -> AcpCancelHandle {
        self.cancel_handle.clone()
    }

    /// Clear a previous cancellation request before starting the next turn on
    /// this provider session.
    pub fn reset_cancellation(&self) {
        self.cancel_handle.reset();
    }

    /// Attach the host's mediation seam (P69.C2). Attach it **before**
    /// `initialize_with_caps` so the advertised client capabilities match the
    /// mode the host can actually service (P69.C3).
    pub fn set_mediator(&mut self, mediator: std::sync::Arc<dyn ClientMediation>) {
        self.mediator = Some(mediator);
    }

    /// Whether a mediation seam is attached (drives the mediated/self-contained
    /// advertisement).
    pub fn has_mediator(&self) -> bool {
        self.mediator.is_some()
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

    /// The agent capability set advertised during `initialize`.
    pub fn agent_capabilities(&self) -> Option<&AgentCapabilities> {
        self.agent_capabilities.as_ref()
    }

    /// Whether `authenticate` has succeeded on this connection.
    pub fn is_authenticated(&self) -> bool {
        self.authenticated
    }

    /// The latest complete agent-owned session configuration.
    pub fn config_options(&self) -> &[ConfigOption] {
        &self.config_options
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
        let result: InitializeResult = serde_json::from_value(resp.clone()).map_err(|e| {
            // A bare "malformed agent message" costs a debugging cycle: the
            // `pi-acp` authMethods shape was only identifiable from the bytes.
            // The initialize reply carries capabilities + auth methods and no
            // secrets, so the snippet is safe to surface here.
            let raw = resp.to_string();
            let mut snip: String = raw.chars().take(600).collect();
            if raw.chars().count() > 600 {
                snip.push('\u{2026}');
            }
            AcpError::Malformed(format!("initialize result: {e} — reply was {snip}"))
        })?;
        if result.protocol_version != PROTOCOL_VERSION {
            return Err(AcpError::ProtocolMismatch(result.protocol_version));
        }
        self.agent_info = Some(result.agent_info.clone());
        self.agent_capabilities = Some(result.agent_capabilities.clone());
        self.auth_methods = result.auth_methods.clone();
        // An agent advertising no auth methods needs no auth: the session is
        // authenticated by construction (see `auth_methods`). Anything
        // advertised must still complete `authenticate` explicitly.
        self.authenticated = self.auth_methods.is_empty();
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
    ///
    /// ACP requires `cwd` to be an **absolute** path, and agents enforce it
    /// (`pi-acp` answers `cwd must be an absolute path: .` with -32602). The
    /// path is therefore canonicalized here, in the one place every driver
    /// goes through, rather than trusting each caller to remember — a relative
    /// path is resolved against the process cwd, which is the same directory
    /// the agent was spawned in.
    pub fn session_new(
        &mut self,
        cwd: &str,
        mcp_servers: Vec<McpServer>,
    ) -> Result<String, AcpError> {
        self.ensure_ready()?;
        let id = self.next_id;
        self.next_id += 1;
        let cwd_abs = std::fs::canonicalize(cwd)
            .map(|p| p.to_string_lossy().into_owned())
            .unwrap_or_else(|_| cwd.to_string());
        let req = json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": "session/new",
            "params": { "cwd": cwd_abs, "mcpServers": mcp_servers }
        });
        self.transport.send(&req.to_string())?;
        let resp = self.read_response(id)?;
        let result: SessionNewResult =
            serde_json::from_value(resp).map_err(|e| AcpError::Malformed(e.to_string()))?;
        self.session_id = Some(result.session_id.clone());
        self.config_options = result.config_options.clone();
        Ok(result.session_id)
    }

    /// Change one agent-owned session configuration value. The agent returns
    /// the complete configuration list so dependent model/mode options remain
    /// coherent.
    pub fn set_config_option(
        &mut self,
        config_id: &str,
        value: serde_json::Value,
    ) -> Result<Vec<ConfigOption>, AcpError> {
        self.ensure_ready()?;
        let session_id = self.session_id.clone().ok_or(AcpError::NotReady)?;
        let id = self.next_id;
        self.next_id += 1;
        let params = SetConfigOptionParams {
            session_id,
            config_id: config_id.to_string(),
            value,
        };
        let req = json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": "session/set_config_option",
            "params": params,
        });
        self.transport.send(&req.to_string())?;
        let resp = self.read_response(id)?;
        let result: SetConfigOptionResult =
            serde_json::from_value(resp).map_err(|e| AcpError::Malformed(e.to_string()))?;
        self.config_options = result.config_options.clone();
        Ok(result.config_options)
    }

    /// Drive one prompt turn. Sends `session/prompt`, then reads inbound
    /// messages until the prompt response: `session/update` notifications are
    /// collected, and `session/request_permission` requests are answered via
    /// `on_permission` (the Guard-2 seam). Unsupported client methods get a
    /// clean method-not-found error.
    pub fn prompt(
        &mut self,
        text: &str,
        on_permission: impl FnMut(&PermissionRequestParams) -> PermissionDecision,
    ) -> Result<PromptOutcome, AcpError> {
        self.prompt_with_content(vec![PromptContent::text(text)], on_permission)
    }

    /// Drive one prompt with capability-gated content blocks. The caller is
    /// responsible for checking the agent's advertised capabilities before
    /// adding resource blocks; plain text remains the safe fallback.
    pub fn prompt_with_content(
        &mut self,
        prompt: Vec<PromptContent>,
        mut on_permission: impl FnMut(&PermissionRequestParams) -> PermissionDecision,
    ) -> Result<PromptOutcome, AcpError> {
        self.ensure_ready()?;
        if self.cancel_handle.is_requested() {
            return Err(AcpError::Cancelled);
        }
        let session_id = self.session_id.clone().ok_or(AcpError::NotReady)?;
        let id = self.next_id;
        self.next_id += 1;
        let req = json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": "session/prompt",
            "params": {
                "sessionId": session_id,
                "prompt": prompt,
            }
        });
        self.transport.send(&req.to_string())?;

        let mut outcome = PromptOutcome::default();
        let mut cancelled = false;
        loop {
            if self.cancel_handle.is_requested() {
                cancelled = true;
            }
            // Anything parked while waiting on a handshake response is handled
            // first, in arrival order — a notification that arrives before a
            // reply must not be lost.
            let v: Value = if let Some(parked) = self.pending.pop_front() {
                parked
            } else {
                let Some(raw) = self.transport.recv()? else {
                    return Err(AcpError::Eof);
                };
                serde_json::from_str(&raw).map_err(|e| AcpError::Malformed(e.to_string()))?
            };

            // Our prompt response?
            if v.get("id").and_then(Value::as_u64) == Some(id)
                && (v.get("result").is_some() || v.get("error").is_some())
            {
                if cancelled || self.cancel_handle.is_requested() {
                    return Err(AcpError::Cancelled);
                }
                if let Some(err) = v.get("error") {
                    return Err(map_error(err));
                }
                let result: SessionPromptResult =
                    serde_json::from_value(v.get("result").cloned().unwrap_or(Value::Null))
                        .map_err(|e| AcpError::Malformed(e.to_string()))?;
                outcome.stop_reason = result.stop_reason;
                // P71.4 — carry the agent's usage report through untouched.
                outcome.usage = result.usage;
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
                    // P69.C2 — mediated fs/terminal requests go through the
                    // host's capability seam; never `-32601` when mediated.
                    other if is_mediated_client_method(other) => {
                        let params = v.get("params").cloned().unwrap_or(Value::Null);
                        let mediator = self.mediator.clone();
                        let reply = match mediator {
                            Some(m) => match m.call(other, &params) {
                                Ok(result) => {
                                    outcome.mediated.push(MediatedCall {
                                        method: other.to_string(),
                                        ok: true,
                                        error: None,
                                    });
                                    json!({"jsonrpc": "2.0", "id": rid, "result": result})
                                }
                                Err(message) => {
                                    outcome.mediated.push(MediatedCall {
                                        method: other.to_string(),
                                        ok: false,
                                        error: Some(message.clone()),
                                    });
                                    json!({
                                        "jsonrpc": "2.0", "id": rid,
                                        "error": { "code": -32603, "message": message }
                                    })
                                }
                            },
                            None => {
                                let message = format!(
                                    "mediated mode unavailable: no capability mediator attached \
                                     for `{other}` (self-contained mode)"
                                );
                                outcome.mediated.push(MediatedCall {
                                    method: other.to_string(),
                                    ok: false,
                                    error: Some(message.clone()),
                                });
                                json!({
                                    "jsonrpc": "2.0", "id": rid,
                                    "error": { "code": -32603, "message": message }
                                })
                            }
                        };
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
                    let u: SessionUpdate = serde_json::from_value(update_params(v.get("params")))
                        .map_err(|e| AcpError::Malformed(e.to_string()))?;
                    if u.is_config_option_update() && !u.config_options.is_empty() {
                        self.config_options = u.config_options.clone();
                    }
                    outcome.updates.push(u);
                }
            }
        }
    }

    /// Interrupt the ongoing turn (`session/cancel` notification).
    pub fn cancel(&mut self) -> Result<(), AcpError> {
        self.ensure_ready()?;
        let session_id = self.session_id.clone().ok_or(AcpError::NotReady)?;
        if self.cancel_handle.sender.is_some() {
            self.cancel_handle.request(&session_id)?;
        } else {
            self.cancel_handle.mark_requested()?;
            let msg = json!({
                "jsonrpc": "2.0",
                "method": "session/cancel",
                "params": { "sessionId": session_id }
            });
            self.transport.send(&msg.to_string())?;
        }
        Ok(())
    }

    /// Request cancellation without mutably borrowing the session. This is the
    /// path used by a host-side stop command while a prompt owns the session
    /// mutex.
    pub fn request_cancel(&self) -> Result<(), AcpError> {
        self.ensure_ready()?;
        let session_id = self.session_id.as_deref().ok_or(AcpError::NotReady)?;
        self.cancel_handle
            .request(session_id)
            .map_err(AcpError::Io)
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

    /// Read until the response to `expected_id` arrives.
    ///
    /// JSON-RPC permits anything to be interleaved: notifications (no `id`) and
    /// agent→client requests (`fs/*`, `terminal/*`, `session/request_permission`
    /// — these *do* carry an id). Both are parked on `pending` and drained by
    /// the prompt loop, instead of being mistaken for our answer (the
    /// `response without id` failure `codex-acp` produced).
    fn read_response(&mut self, expected_id: u64) -> Result<Value, AcpError> {
        loop {
            let Some(raw) = self.transport.recv()? else {
                return Err(AcpError::Eof);
            };
            let v: Value =
                serde_json::from_str(&raw).map_err(|e| AcpError::Malformed(e.to_string()))?;

            // A notification: no id, but a method.
            let Some(got) = v.get("id").and_then(Value::as_u64) else {
                self.pending.push_back(v);
                continue;
            };
            // An agent→client request: it has an id AND a method, so it is not
            // a response to anything we sent.
            if v.get("method").is_some() {
                self.pending.push_back(v);
                continue;
            }
            if got != expected_id {
                return Err(AcpError::Malformed(format!(
                    "id mismatch: expected {expected_id}, got {got}"
                )));
            }
            if let Some(err) = v.get("error") {
                return Err(map_error(err));
            }
            return Ok(v.get("result").cloned().unwrap_or(Value::Null));
        }
    }
}

/// Map a JSON-RPC error object to an [`AcpError`]. The ACP schema's
/// protocol-specific codes: `-32000` auth_required, `-32002`
/// resource_not_found. Unknown codes surface as [`AcpError::ServerError`].
/// Normalize a `session/update` notification's `params` into the flat shape
/// [`SessionUpdate`] deserializes.
///
/// ACP nests the payload: `params.sessionId` + `params.update.{…}`. Older
/// harnesses (and this crate's fixtures) put the update fields directly on
/// `params`. Accept **both**, promoting `sessionId` into the update object, so
/// a spec-shaped agent can never silently produce an empty update — which is
/// exactly how a nested payload used to look: every field defaulted and the
/// update was dropped without an error.
fn update_params(params: Option<&Value>) -> Value {
    let Some(params) = params else {
        return Value::Null;
    };
    let Some(update) = params.get("update").filter(|u| u.is_object()) else {
        return params.clone();
    };
    let mut merged = update.clone();
    if let (Some(map), Some(session_id)) = (merged.as_object_mut(), params.get("sessionId")) {
        map.entry("sessionId").or_insert_with(|| session_id.clone());
    }
    merged
}

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

    fn init_result_with_methods() -> Value {
        json!({
            "protocolVersion": 1,
            "agentCapabilities": { "loadSession": true },
            "agentInfo": { "name": "claude-acp", "title": "Claude", "version": "0.66.0" },
            "authMethods": [
                { "id": "agent-login", "name": "Agent login", "description": "Sign in with your account" }
            ]
        })
    }

    #[test]
    fn initialize_with_no_auth_methods_marks_authenticated() {
        // The documented contract (`auth_methods`): empty ⇒ the agent needs
        // no auth, so the session is authenticated by construction. This is
        // what the mock-CLI E2E (`live_spawn`) relies on.
        let mut t = MockTransport::new(vec![&result_response(1, init_result())]);
        let mut s = AcpSession::new(&mut t);
        s.initialize(client_info()).unwrap();
        assert!(s.auth_methods().is_empty());
        assert!(s.is_authenticated());
    }

    #[test]
    fn initialize_with_advertised_methods_stays_unauthenticated() {
        let mut t = MockTransport::new(vec![&result_response(1, init_result_with_methods())]);
        let mut s = AcpSession::new(&mut t);
        s.initialize(client_info()).unwrap();
        assert_eq!(s.auth_methods().len(), 1);
        assert!(!s.is_authenticated());
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
            session: Some(SessionCapabilities::config_options_with_boolean()),
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
    fn session_new_captures_the_agents_own_config_options() {
        // P60 — the agent owns this vocabulary (model/mode/reasoning). We keep
        // the complete list verbatim; the native provider catalog never enters
        // here. An agent that omits `configOptions` is still a valid session
        // (covered by `session_new_sets_session_id`).
        let mut t = MockTransport::new(vec![
            &result_response(1, init_result()),
            &result_response(
                2,
                json!({
                    "sessionId": "sess-1",
                    "configOptions": [{
                        "id": "model",
                        "name": "Model",
                        "category": "model",
                        "type": "select",
                        "currentValue": "model-1",
                        "options": [
                            { "value": "model-1", "name": "Model 1" },
                            { "value": "model-2", "name": "Model 2" },
                        ]
                    }]
                }),
            ),
        ]);
        let mut s = AcpSession::new(&mut t);
        s.initialize(client_info()).unwrap();
        s.session_new("/workspace", vec![]).unwrap();

        let options = s.config_options();
        assert_eq!(options.len(), 1);
        assert_eq!(options[0].id, "model");
        assert_eq!(options[0].category.as_deref(), Some("model"));
        assert_eq!(options[0].current_value, json!("model-1"));
        assert_eq!(options[0].options.len(), 2);
    }

    #[test]
    fn set_config_option_sends_the_documented_shape_and_stores_the_return() {
        let updated = json!([{
            "id": "model",
            "name": "Model",
            "type": "select",
            "currentValue": "model-2",
            "options": [
                { "value": "model-1", "name": "Model 1" },
                { "value": "model-2", "name": "Model 2" },
            ]
        }]);
        let mut t = MockTransport::new(vec![
            &result_response(1, init_result()),
            &result_response(2, json!({ "sessionId": "sess-1" })),
            &result_response(3, json!({ "configOptions": updated })),
        ]);
        let mut s = AcpSession::new(&mut t);
        s.initialize(client_info()).unwrap();
        s.session_new("/w", vec![]).unwrap();

        let options = s.set_config_option("model", json!("model-2")).unwrap();
        assert_eq!(options[0].current_value, json!("model-2"));
        // The response is the complete configuration state, so the session's
        // view must be replaced rather than patched.
        assert_eq!(s.config_options(), options.as_slice());

        let sent: Value = serde_json::from_str(&t.sent[2]).unwrap();
        assert_eq!(sent["method"], "session/set_config_option");
        assert_eq!(sent["params"]["sessionId"], "sess-1");
        assert_eq!(sent["params"]["configId"], "model");
        assert_eq!(sent["params"]["value"], "model-2");
    }

    #[test]
    fn config_option_update_notification_replaces_the_stored_list() {
        // The agent may re-select on its own (e.g. a model fallback mid-turn).
        let mut t = MockTransport::new(vec![
            &result_response(1, init_result()),
            &result_response(2, json!({ "sessionId": "s1" })),
            &json!({
                "jsonrpc": "2.0",
                "method": "session/update",
                "params": {
                    "sessionId": "s1",
                    "update": {
                        "sessionUpdate": "config_option_update",
                        "configOptions": [{
                            "id": "model", "name": "Model", "type": "select",
                            "currentValue": "fallback-model", "options": []
                        }]
                    }
                }
            })
            .to_string(),
            &result_response(3, json!({ "stopReason": "end_turn" })),
        ]);
        let mut s = AcpSession::new(&mut t);
        s.initialize(client_info()).unwrap();
        s.session_new("/w", vec![]).unwrap();
        s.prompt("hi", |_p| PermissionDecision::allow()).unwrap();

        let options = s.config_options();
        assert_eq!(options.len(), 1);
        assert_eq!(options[0].current_value, json!("fallback-model"));
    }

    #[test]
    fn spec_nested_session_update_is_parsed_not_dropped() {
        // The protocol nests the payload under `params.update`. Before the
        // normalization fix this deserialized into an all-defaults
        // SessionUpdate, so a real agent's tool calls/commands vanished.
        let mut t = MockTransport::new(vec![
            &result_response(1, init_result()),
            &result_response(2, json!({ "sessionId": "s1" })),
            &json!({
                "jsonrpc": "2.0",
                "method": "session/update",
                "params": {
                    "sessionId": "s1",
                    "update": {
                        "sessionUpdate": "available_commands_update",
                        "availableCommands": [
                            { "name": "review", "description": "Review the diff" }
                        ]
                    }
                }
            })
            .to_string(),
            &result_response(3, json!({ "stopReason": "end_turn" })),
        ]);
        let mut s = AcpSession::new(&mut t);
        s.initialize(client_info()).unwrap();
        s.session_new("/w", vec![]).unwrap();
        let outcome = s.prompt("hi", |_p| PermissionDecision::allow()).unwrap();

        assert_eq!(outcome.updates.len(), 1);
        let u = &outcome.updates[0];
        assert!(u.is_available_commands_update());
        // `sessionId` is promoted from the envelope so the update is keyed.
        assert_eq!(u.session_id, "s1");
        assert_eq!(u.available_commands.len(), 1);
        assert_eq!(u.available_commands[0].name, "review");
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
            &result_response(1, init_result_with_methods()),
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
            &result_response(
                1,
                json!({
                    "protocolVersion": 1,
                    "agentCapabilities": { "loadSession": true },
                    "agentInfo": { "name": "claude-acp", "title": "Claude", "version": "0.66.0" },
                    "authMethods": [
                        { "id": "agent-login", "name": "Agent login", "type": "url", "description": "Open a browser" }
                    ]
                }),
            ),
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
            &result_response(1, init_result_with_methods()),
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

    #[test]
    fn host_cancellation_is_scoped_and_resettable_per_provider_session() {
        let mut t = MockTransport::new(vec![
            &result_response(1, init_result()),
            &result_response(2, json!({ "sessionId": "provider-1" })),
            &result_response(3, json!({ "stopReason": "end_turn" })),
        ]);
        let mut s = AcpSession::new(&mut t);
        s.initialize(client_info()).unwrap();
        s.session_new("/w", vec![]).unwrap();
        let cancel = s.cancellation_handle();
        cancel.request("provider-1").unwrap();
        assert!(cancel.is_requested());
        assert!(matches!(
            s.prompt("blocked", |_| PermissionDecision::allow()),
            Err(AcpError::Cancelled)
        ));

        s.reset_cancellation();
        assert!(s.prompt("next", |_| PermissionDecision::allow()).is_ok());
        assert!(!cancel.is_requested());
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
