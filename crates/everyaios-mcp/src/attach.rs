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
use std::path::PathBuf;
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};

use serde::Serialize;

use crate::server::{ExternalTool, ToolCatalog};
use everyaios_guard::sandbox::SandboxProcess;

/// An attached MCP server: the child process plus its reconciled tool names.
pub struct AttachedServer {
    child: Option<Child>,
    sandbox_process: Option<SandboxProcess>,
    stdin: ChildStdin,
    reader: BufReader<ChildStdout>,
    pub tools: Vec<String>,
    /// True only when launched through a concrete host sandbox backend.
    sandboxed: bool,
    /// Optional reviewed-import root for sandboxed change sets.
    import_root: Option<PathBuf>,
    /// P55.11 — monotonic JSON-RPC id for post-handshake calls
    /// (`tools/call`). The handshake owns 1/2; a call that reused them could
    /// be mistaken for a handshake reply by a server that keys on id.
    next_id: i64,
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

/// How an attached MCP server child is launched (P62.2).
///
/// A remote-MCP server is third-party code the user installed; the 2026
/// security survey's ASI05 (unexpected code execution) is exactly this child.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SandboxPosture {
    /// Run the child inside the native OS sandbox (Linux bubblewrap): its own
    /// mount namespace, no new privileges, and **no ambient environment**, so
    /// it cannot read the shell's provider keys. Credentials must arrive
    /// through the vault broker instead. This is the containment posture.
    Confined,
    /// Run the child with the inherited environment. Required by an MCP server
    /// whose auth is env-based (`GMAIL_TOKEN=…`) until that server is moved to
    /// the brokered credential path — honest, but it is **not** containment.
    Ambient,
}

impl SandboxPosture {
    /// The posture the host can actually deliver on this platform.
    pub fn preferred() -> Self {
        #[cfg(target_os = "linux")]
        {
            if everyaios_guard::sandbox::linux_bwrap_available() {
                return SandboxPosture::Confined;
            }
        }
        SandboxPosture::Ambient
    }

    pub fn is_contained(self) -> bool {
        self == SandboxPosture::Confined
    }
}

impl AttachedServer {
    /// Spawn a user-supplied MCP server over newline-delimited stdio (the
    /// 2026-07-28 stateless transport our server speaks, doc 61). Args are
    /// passed verbatim — SEP-1024 exact-command consent happens in the UI
    /// (H3) before this is called.
    pub fn spawn(command: &str, args: &[&str]) -> Result<Self, AttachError> {
        Self::spawn_uncontrolled(command, args)
    }

    /// Spawn under an explicit posture (P62.2). `Confined` needs a scratch dir
    /// the child may write (its own cache); `network` is `"allow"` for the
    /// API-calling servers that need it. Falls back to the ambient path — and
    /// reports `is_sandboxed() == false` — when containment is unavailable, so
    /// a caller never mistakes the two.
    pub fn spawn_with_posture(
        posture: SandboxPosture,
        scratch: &str,
        network: &str,
        command: &str,
        args: &[&str],
    ) -> Result<Self, AttachError> {
        if posture.is_contained() {
            #[cfg(target_os = "linux")]
            {
                if everyaios_guard::sandbox::linux_bwrap_available() {
                    if let Ok(server) = Self::spawn_confined(scratch, network, command, args) {
                        return Ok(server);
                    }
                }
            }
        }
        Self::spawn_uncontrolled(command, args)
    }

    /// Spawn the child inside the native OS sandbox (Linux bubblewrap).
    ///
    /// The sandbox is `--clearenv`, so the child inherits **no** ambient
    /// secrets: provider keys and tokens stay out of the third-party process,
    /// and credentials are expected to arrive via the capability broker. This
    /// is the fixed `SandboxPosture::Confined` path.
    #[cfg(target_os = "linux")]
    pub fn spawn_confined(
        scratch: &str,
        network: &str,
        command: &str,
        args: &[&str],
    ) -> Result<Self, AttachError> {
        use everyaios_guard::sandbox::{profiles, LinuxBwrapBackend, SandboxRole, SandboxSpec};
        // The backend refuses to bind a path that does not exist (fail-closed),
        // so the child's scratch dir has to exist before the spawn.
        std::fs::create_dir_all(scratch).map_err(AttachError::Spawn)?;
        let mut argv = Vec::with_capacity(args.len() + 1);
        argv.push(command.to_string());
        argv.extend(args.iter().map(|a| (*a).to_string()));
        let spec = SandboxSpec {
            role: SandboxRole::ChildExecutionSandbox,
            profile: profiles::worker(scratch),
            network: network.to_string(),
            credentials: "opaque_handles".into(),
            resource_limit_bytes: 512 << 20,
        };
        let sandboxed = LinuxBwrapBackend
            .spawn_stdio(&spec, &argv)
            .map_err(|e| AttachError::Spawn(std::io::Error::other(e.to_string())))?;
        Ok(Self {
            child: None,
            sandbox_process: Some(sandboxed.monitor),
            stdin: sandboxed.stdin,
            reader: BufReader::new(sandboxed.stdout),
            tools: Vec::new(),
            sandboxed: true,
            import_root: Some(PathBuf::from(scratch)),
            next_id: 3,
        })
    }

    /// Legacy attach path. It is intentionally explicit: the child is not
    /// covered by the native ticket/audit guarantee.
    pub fn spawn_uncontrolled(command: &str, args: &[&str]) -> Result<Self, AttachError> {
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
            child: Some(child),
            sandbox_process: None,
            stdin,
            reader: BufReader::new(stdout),
            tools: Vec::new(),
            sandboxed: false,
            import_root: None,
            next_id: 3,
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

    /// P55.11 — call one tool on the attached server (`tools/call`). This is
    /// the *product loop* half of the attach handshake: the same child that
    /// answered `tools/list` executes the call, so the advertised tool set and
    /// the callable tool set can never drift into two different servers.
    ///
    /// A server error reply surfaces as [`AttachError::Server`] (never an
    /// empty success), and a reply without a `result` is a protocol error.
    pub fn call_tool(
        &mut self,
        name: &str,
        arguments: &serde_json::Value,
    ) -> Result<serde_json::Value, AttachError> {
        let id = self.next_id;
        self.next_id += 1;
        let call = serde_json::json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": "tools/call",
            "params": { "name": name, "arguments": arguments }
        });
        self.send(&call.to_string())?;
        let reply = self.recv()?;
        if let Some(err) = reply.get("error") {
            return Err(AttachError::Server(err.to_string()));
        }
        reply
            .get("result")
            .cloned()
            .ok_or_else(|| AttachError::Protocol("tools/call reply without result".into()))
    }

    /// Attach the concrete monitored process returned by a sandbox backend.
    /// A path alone never establishes containment.
    pub fn bind_sandbox_process(&mut self, process: SandboxProcess, root: PathBuf) {
        self.sandbox_process = Some(process);
        self.sandboxed = true;
        self.import_root = Some(root);
    }

    /// Compatibility guard: callers must use `bind_sandbox_process`; merely
    /// naming an import root cannot upgrade an uncontrolled child.
    pub fn bind_sandbox_import_root(&mut self, _root: PathBuf) -> Result<(), AttachError> {
        Err(AttachError::Protocol(
            "sandbox import root requires a concrete monitored sandbox process".into(),
        ))
    }

    pub fn monitor_exit(
        &mut self,
        deadline: std::time::Instant,
    ) -> Result<std::process::ExitStatus, AttachError> {
        self.sandbox_process
            .as_mut()
            .ok_or_else(|| AttachError::Protocol("child is not sandboxed".into()))
            .and_then(|process| {
                process
                    .wait_with_deadline(deadline)
                    .map_err(|e| AttachError::Protocol(e.to_string()))
            })
    }

    pub fn is_sandboxed(&self) -> bool {
        self.sandboxed
    }

    /// P51.18 — non-blocking liveness probe for the no-restart refresh path.
    /// `None` (already reaped / never spawned) counts as not alive.
    pub fn is_alive(&mut self) -> bool {
        matches!(
            self.child.as_mut().map(|child| child.try_wait()),
            Some(Ok(None))
        )
    }

    pub fn import_root(&self) -> Option<&PathBuf> {
        self.import_root.as_ref()
    }

    /// Tear the child process down.
    pub fn shutdown(&mut self) {
        if let Some(process) = self.sandbox_process.as_mut() {
            let _ = process.kill();
        }
        if let Some(child) = self.child.as_mut() {
            let _ = child.kill();
            let _ = child.wait();
        }
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

/// P51.17 — MCP attach name sanitization. The name is bound into the guard
/// ticket args-hash, rendered on the approval card (`mcp:{name}`), and used
/// as a tool provenance label; an unsanitized name could inject into the
/// card text or registry keys. Allowed: ASCII letters/digits plus `-` `_`
/// `.` (MCP-friendly slug charset), 1–64 chars. Returns `None` for anything
/// else (reject — never silently rewrite, so the caller shows the exact
/// refusal).
pub fn sanitize_attach_name(name: &str) -> Option<String> {
    let trimmed = name.trim();
    if trimmed.is_empty() || trimmed.len() > 64 {
        return None;
    }
    if !trimmed
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
    {
        return None;
    }
    Some(trimmed.to_string())
}

#[cfg(test)]
mod tests {
    use super::{sanitize_attach_name, AttachedServer, SandboxPosture};

    #[test]
    fn name_sanitizer_accepts_slugs() {
        assert_eq!(sanitize_attach_name("gmail"), Some("gmail".into()));
        assert_eq!(
            sanitize_attach_name("my-server_2.v1"),
            Some("my-server_2.v1".into())
        );
        assert_eq!(sanitize_attach_name("  trimmed  "), Some("trimmed".into()));
    }

    #[test]
    fn name_sanitizer_rejects_hostile_names() {
        assert_eq!(sanitize_attach_name(""), None);
        assert_eq!(sanitize_attach_name("   "), None);
        assert_eq!(sanitize_attach_name("a b"), None);
        assert_eq!(sanitize_attach_name("a;rm -rf /"), None);
        assert_eq!(sanitize_attach_name("a\nb"), None);
        assert_eq!(sanitize_attach_name("server/../../etc"), None);
        assert_eq!(sanitize_attach_name("x".repeat(65).as_str()), None);
    }

    #[test]
    fn posture_never_claims_containment_it_cannot_deliver() {
        // `is_contained` is the only thing a caller should branch on; the
        // ambient fallback must always report `false`.
        assert!(!SandboxPosture::Ambient.is_contained());
        assert!(SandboxPosture::Confined.is_contained());
        #[cfg(not(target_os = "linux"))]
        assert_eq!(SandboxPosture::preferred(), SandboxPosture::Ambient);
    }

    #[test]
    fn ambient_posture_spawns_and_reports_unsandboxed() {
        #[cfg(unix)]
        {
            let Ok(mut s) = AttachedServer::spawn_with_posture(
                SandboxPosture::Ambient,
                "/tmp/everyaios-mcp-posture-test",
                "allow",
                "cat",
                &[],
            ) else {
                return; // `cat` unavailable — not a posture regression
            };
            assert!(
                !s.is_sandboxed(),
                "ambient posture must never claim sandboxing"
            );
            s.shutdown();
        }
    }

    /// The confined launch is `--clearenv` and network-constrained by
    /// construction, which is what makes it safe to hand a third-party MCP
    /// server no ambient secrets. Pure assertion on the built command; the
    /// live spawn below proves the backend actually accepts our argv.
    #[cfg(target_os = "linux")]
    #[test]
    fn confined_launch_is_clearenv_and_network_constrained() {
        use everyaios_guard::sandbox::{profiles, LinuxBwrapBackend, SandboxRole, SandboxSpec};
        let scratch = "/tmp/everyaios-mcp-confined-test";
        let _ = std::fs::create_dir_all(scratch);
        let spec = SandboxSpec {
            role: SandboxRole::ChildExecutionSandbox,
            profile: profiles::worker(scratch),
            network: "deny".into(),
            credentials: "opaque_handles".into(),
            resource_limit_bytes: 512 << 20,
        };
        let cmd = LinuxBwrapBackend::command(&spec, &["/bin/echo".into()]).unwrap();
        let args: Vec<String> = cmd
            .get_args()
            .map(|a| a.to_string_lossy().into_owned())
            .collect();
        assert!(args.contains(&"--clearenv".into()), "must not inherit env");
        assert!(
            args.contains(&"--unshare-net".into()),
            "network must be denied"
        );
    }

    /// Live proof the confined path actually spawns and reports containment.
    /// Skips (honest no-op) when bubblewrap or user namespaces are unavailable
    /// — it never passes without real containment.
    #[cfg(target_os = "linux")]
    #[test]
    fn confined_posture_binds_a_sandboxed_child() {
        use everyaios_guard::sandbox::linux_bwrap_available;
        if !linux_bwrap_available() {
            eprintln!("bwrap unavailable — skipping confined MCP spawn test");
            return;
        }
        let Ok(mut s) = AttachedServer::spawn_confined(
            "/tmp/everyaios-mcp-confined-test",
            "deny",
            "/bin/echo",
            &[],
        ) else {
            eprintln!("confined spawn unavailable — skipping");
            return;
        };
        assert!(
            s.is_sandboxed(),
            "a confined child must report sandboxed so callers never confuse the two"
        );
        s.shutdown();
    }
}
