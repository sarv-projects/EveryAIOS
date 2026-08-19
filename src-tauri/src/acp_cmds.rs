//! F12 / J17 — the **ACP harness bridge** commands (doc 45 §1, doc 57 §2).
//!
//! Thin wrappers over `everyaios-acp`:
//! - [`acp_agents`] — the launch registry (the `ollama launch` pattern): one
//!   manifest per agent with its auth-mode badge, distribution and protocol,
//!   so the picker shows "same chat bar, agent differs, default = inbuilt".
//! - [`acp_launch`] — resolve the spawn plan, spawn the agent CLI, run the
//!   `initialize` handshake + `session/new`, and store the live session. The
//!   agent's advertised `authMethods` are surfaced: if `session/new` returns
//!   `auth_required`, the launch still succeeds but reports `authRequired:
//!   true` so the UI can render "Sign in with <agent>" before prompting.
//! - [`acp_authenticate`] — drive the ACP `authenticate` flow (agent-type:
//!   the agent handles login; url-type: return the browser URL, re-call after
//!   the user completes), then retry `session/new`.
//! - [`acp_prompt`] — drive one turn; the agent's `session/request_permission`
//!   requests are answered by the shared [`everyaios_core::GuardService`]
//!   (estop → policy → profile), so an ACP agent obeys the *same* Guard-2
//!   ticket card as the inbuilt engine.
//! - [`acp_install_request`] / [`acp_install_commit`] — the F8 one-click
//!   install split into the Guard-2 halves: the request resolves the plan and
//!   mints a ticket (or auto-allows allow-listed agents); the commit consumes
//!   the ticket (`use_ticket`) and executes the download, so the download is
//!   a **renderable approval card**, not a silent write.
//! - [`acp_cancel`] / [`acp_shutdown`] / [`acp_sessions`] — turn interrupt,
//!   teardown, and live-handle listing.
//!
//! The spawn/handshake/framing logic is tested in `everyaios-acp`; this
//! module is the app-level state holder + policy seam.

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use everyaios_acp::{
    AcpSession, AuthMethod, ClientInfo, HarnessManifest, Installer, LaunchRegistry,
    PermissionDecision, Platform, PolicyVerdict, ProcessTransport, RegistryClient,
    RegistryPolicy, ToolCall, ToolKind,
};
use everyaios_core::GuardDecision;
use everyaios_guard::{DecisionPackage, Operation, RiskLevel};
use serde::Serialize;
use tauri::State;

use crate::AppState;

/// Monotonic ACP handle-id source (never reuses an id within a process).
static ACP_COUNTER: AtomicU64 = AtomicU64::new(1);

/// A live ACP agent session + the id it was launched under.
pub(crate) struct AcpHandle {
    pub agent_id: String,
    /// The workspace dir the agent session was created in (retained so
    /// [`acp_authenticate`] can retry `session/new` after login).
    pub cwd: String,
    /// True when `session/new` answered `auth_required` — the user must sign
    /// in before the handle can drive prompts.
    pub auth_required: bool,
    /// The methods the agent advertised in `initialize` (`authMethods`).
    pub auth_methods: Vec<AuthMethod>,
    pub session: AcpSession<ProcessTransport>,
}

/// One launched-session summary for the picker/harness list.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AcpHandleInfo {
    handle: String,
    agent_id: String,
    agent_name: String,
    session_id: String,
    protocol: String,
    /// True when the agent needs authentication before it will accept a
    /// session (the UI renders the "Sign in" surface from `authMethods`).
    #[serde(default)]
    auth_required: bool,
    #[serde(default)]
    auth_methods: Vec<AuthMethod>,
}

impl From<(&AcpHandle, &str)> for AcpHandleInfo {
    fn from((h, handle): (&AcpHandle, &str)) -> Self {
        AcpHandleInfo {
            handle: handle.to_string(),
            agent_id: h.agent_id.clone(),
            agent_name: h.agent_id.clone(),
            session_id: h.session.session_id().unwrap_or("").to_string(),
            protocol: "acp".to_string(),
            auth_required: h.auth_required,
            auth_methods: h.auth_methods.clone(),
        }
    }
}

/// The launch registry (the agent picker). Default = inbuilt EveryAIOS.
#[tauri::command]
pub fn acp_agents() -> Vec<HarnessManifest> {
    LaunchRegistry::builtin().agents
}

/// F8 — refresh the official ACP registry cache (`registry.json` from the
/// CDN). Returns the catalog status; the app stays on the builtin seed if the
/// network fails.
#[tauri::command]
pub fn acp_registry_refresh() -> Result<serde_json::Value, String> {
    let client = registry_client();
    let snap = client.refresh().map_err(|e| e.to_string())?;
    Ok(serde_json::json!({
        "version": snap.index.version,
        "agentCount": snap.index.agents.len(),
        "fetchedAtMs": snap.fetched_at_ms,
        "fromCache": snap.from_cache,
        "cacheDir": client.cache_dir(),
    }))
}

/// F8 — the cached registry status (no network). `null` if never cached.
#[tauri::command]
pub fn acp_registry_status() -> Result<Option<serde_json::Value>, String> {
    let client = registry_client();
    Ok(client.load_cached().map(|s| {
        serde_json::json!({
            "version": s.index.version,
            "agentCount": s.index.agents.len(),
            "fetchedAtMs": s.fetched_at_ms,
        })
    }))
}

/// F8 — the exact install plan for a registry agent on this platform, plus
/// the trust/ToS policy verdict (plan-before-touch: this is what the
/// Guard-2-ticketed installer would do).
#[tauri::command]
pub fn acp_registry_install_plan(agent_id: String) -> Result<serde_json::Value, String> {
    let client = registry_client();
    let snap = client
        .load_or_refresh()
        .ok_or_else(|| "no registry catalog available (offline and not cached)".to_string())?;
    let spec = snap
        .index
        .install_plan(&agent_id, Platform::current())
        .ok_or_else(|| format!("no install plan for this platform on {agent_id}"))?;
    let verdict = RegistryPolicy::builtin().evaluate(&agent_id, &spec.license);
    Ok(serde_json::json!({ "spec": spec, "policy": verdict.as_str() }))
}

/// The F8 registry cache dir: `<data_dir>/agents`.
fn registry_client() -> RegistryClient {
    RegistryClient::new(everyaios_core::default_data_dir().join("agents"))
}

/// The F8 install root: `<data_dir>/agents` (registry cache + installed
/// binaries + install-state pointers share the directory).
fn installer() -> Installer {
    Installer::new(everyaios_core::default_data_dir().join("agents"))
}

/// Resolve the current install plan for a registry agent (shared by the
/// install request/commit halves so the args-hash is deterministic).
fn resolve_spec(agent_id: &str) -> Result<everyaios_acp::InstallSpec, String> {
    let client = registry_client();
    let snap = client
        .load_or_refresh()
        .ok_or_else(|| "no registry catalog available (offline and not cached)".to_string())?;
    snap.index
        .get(agent_id)
        .ok_or_else(|| format!("unknown registry agent: {agent_id}"))?;
    snap.index
        .install_plan(agent_id, Platform::current())
        .ok_or_else(|| format!("no install plan for this platform on {agent_id}"))
        .map(|mut spec| {
            // Pin the extract destination so the decision card shows exactly
            // where the bytes land (`<data_dir>/agents/<id>/<version>`).
            spec.install_dir = Some(
                everyaios_core::default_data_dir()
                    .join("agents")
                    .join(agent_id)
                    .join(&spec.version),
            );
            spec
        })
}

/// F8 — **install state** for every registry agent (installed? version? kind?
/// binary path?). The picker reads this once to flip Install ↔ Launch.
#[tauri::command]
pub fn acp_install_status() -> Result<serde_json::Value, String> {
    let registry = LaunchRegistry::builtin();
    let inst = installer();
    let mut out = serde_json::Map::new();
    for m in &registry.agents {
        if m.protocol == everyaios_acp::HarnessProtocol::Inbuilt {
            continue;
        }
        match inst.installed(&m.id) {
            Some(o) => {
                out.insert(
                    m.id.clone(),
                    serde_json::json!({
                        "installed": true,
                        "version": o.version,
                        "kind": o.kind,
                        "binaryPath": o.binary_path.map(|p| p.to_string_lossy().into_owned()),
                    }),
                );
            }
            None => {
                out.insert(m.id.clone(), serde_json::json!({ "installed": false }));
            }
        }
    }
    Ok(serde_json::Value::Object(out))
}

/// F8 — the **install request** half (plan-before-touch). Resolves the
/// platform install plan, applies the trust gate (denylist refuses outright),
/// then routes through the shared Guard-2 [`GuardService`]: allow-listed /
/// open-license agents auto-allow, everything else mints a ticket whose card
/// renders the full decision package (goal, paths, download URL, sha256).
/// **Nothing is downloaded here** — [`acp_install_commit`] is the executor.
#[tauri::command]
pub fn acp_install_request(
    state: State<'_, AppState>,
    agent_id: String,
) -> Result<serde_json::Value, String> {
    let spec = resolve_spec(&agent_id)?;
    let verdict = RegistryPolicy::builtin().evaluate(&agent_id, &spec.license);
    if verdict == PolicyVerdict::Block {
        return Err(format!("agent {agent_id} is blocked by policy"));
    }

    // The decision card: exactly what the download will do.
    let mut decision = DecisionPackage::new(format!(
        "Install {} v{} (F8 registry)",
        spec.name, spec.version
    ))
    .with_risk(RiskLevel::Medium)
    .with_paths(vec![spec
        .install_dir
        .clone()
        .unwrap_or_else(|| everyaios_core::default_data_dir().join("agents").join(&agent_id))
        .to_string_lossy()
        .into_owned()]);
    decision = match &spec.kind {
        everyaios_acp::InstallKind::Npx { package, .. } => decision
            .with_script(
                vec![format!("npx -y {package}")],
                "npx",
            )
            .with_network(vec!["registry.npmjs.org".into()]),
        everyaios_acp::InstallKind::Uvx { package, .. } => decision
            .with_script(vec![format!("uvx {package}")], "uvx")
            .with_network(vec!["pypi.org".into()]),
        everyaios_acp::InstallKind::Binary { archive, sha256, .. } => {
            let host = url_host(archive);
            decision
                .with_script(
                    vec![
                        format!("download {archive}"),
                        format!("sha256 verify {sha256}"),
                        format!("extract → {}", spec.install_dir.as_ref().map(|p| p.to_string_lossy().into_owned()).unwrap_or_default()),
                    ],
                    "everyaios-installer",
                )
                .with_network(vec![host])
        }
    };

    let args_hash = install_args_hash(&agent_id, &spec.version);
    let mut guard = state
        .guard_service
        .lock()
        .map_err(|e| e.to_string())?;
    match guard.evaluate(
        "install",
        &agent_id,
        "acp.install",
        Operation::GenericWrite,
        decision,
        &args_hash,
        0,
    ) {
        GuardDecision::Allow { ticket_id } => Ok(serde_json::json!({
            "action": "allow",
            "agentId": agent_id,
            "version": spec.version,
            // Auto-allowed still carries a (pre-approved) single-use ticket —
            // the executor consumes it in `acp_install_commit` either way.
            "ticketId": ticket_id,
        })),
        GuardDecision::Ask { ticket_id } => Ok(serde_json::json!({
            "action": "ask",
            "agentId": agent_id,
            "version": spec.version,
            "ticketId": ticket_id,
        })),
        GuardDecision::Block { reason } => Err(format!("install blocked: {reason}")),
    }
}

/// F8 — the **install executor** (the "touch" half). Consumes the Guard-2
/// ticket (**mandatory** — `use_ticket` enforces approval + single-use +
/// args-hash), then executes the plan: binary agents download → sha256-verify
/// → extract; npx/uvx agents record the pin. The user's explicit click
/// satisfied an `Ask` verdict by approving the card; an auto-allowed (`allow`)
/// request carries a pre-approved ticket that is still consumed here.
#[tauri::command]
pub fn acp_install_commit(
    state: State<'_, AppState>,
    agent_id: String,
    ticket_id: String,
) -> Result<serde_json::Value, String> {
    let spec = resolve_spec(&agent_id)?;
    let args_hash = install_args_hash(&agent_id, &spec.version);
    let mut guard = state
        .guard_service
        .lock()
        .map_err(|e| e.to_string())?;
    guard
        .use_ticket(&ticket_id, &args_hash)
        .map_err(|e| format!("install ticket not consumable: {e}"))?;
    drop(guard);

    let outcome = installer().install(&spec).map_err(|e| e.to_string())?;
    Ok(serde_json::json!({
        "agentId": outcome.agent_id,
        "version": outcome.version,
        "kind": outcome.kind,
        "binaryPath": outcome.binary_path.map(|p| p.to_string_lossy().into_owned()),
        "env": outcome.env,
        // The agent's own auth (subscription OAuth / API key) is surfaced from
        // the ACP `initialize` handshake's `authMethods` on first launch.
        "auth": "surfaced at launch via ACP authMethods",
    }))
}

/// Legacy one-shot install kept for callers that already resolved the ticket
/// (or for allow-listed agents): resolves the plan, mints the ticket if
/// policy asks, and returns `{action, ticketId?}` without touching the disk —
/// the caller then invokes [`acp_install_commit`]. Mirrors
/// [`acp_install_request`] exactly.
#[tauri::command]
pub fn acp_install(
    state: State<'_, AppState>,
    agent_id: String,
) -> Result<serde_json::Value, String> {
    acp_install_request(state, agent_id)
}

/// Launch an agent by id: resolve its spawn plan, spawn the process, run the
/// ACP handshake (`initialize` → `session/new`), and keep the session alive.
///
/// The inbuilt engine (`everyaios`) has no subprocess — it routes through the
/// existing `chat_stream` path, so `acp_launch("everyaios", …)` is a no-op
/// sentinel that returns its manifest without spawning.
///
/// **Auth surfacing:** when `session/new` answers `auth_required`, the launch
/// still succeeds and reports `authRequired: true` with the agent's
/// `authMethods` — the UI renders "Sign in with <agent>" instead of failing.
#[tauri::command]
pub fn acp_launch(
    state: State<'_, AppState>,
    agent_id: String,
    cwd: String,
) -> Result<AcpHandleInfo, String> {
    let registry = LaunchRegistry::builtin();
    let manifest = registry
        .get(&agent_id)
        .cloned()
        .ok_or_else(|| format!("unknown agent id: {agent_id}"))?;

    if manifest.protocol == everyaios_acp::HarnessProtocol::Inbuilt {
        // The inbuilt engine isn't an external process; it is the default
        // chat_stream path. Report it so the UI can route accordingly.
        return Ok(AcpHandleInfo {
            handle: "inbuilt".to_string(),
            agent_id: agent_id.clone(),
            agent_name: manifest.name,
            session_id: "inbuilt".to_string(),
            protocol: "inbuilt".to_string(),
            auth_required: false,
            auth_methods: vec![],
        });
    }

    let plan = registry
        .launch_plan(&agent_id, None)
        .ok_or_else(|| format!("no launch plan for {agent_id}"))?;

    // F8: if a binary agent is installed, launch the extracted binary path
    // (not the seed's PATH command), merging the installed env.
    let installed = installer().installed(&agent_id);
    let command = installed
        .as_ref()
        .and_then(|o| o.binary_path.as_ref())
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_else(|| plan.command.clone());

    let mut env: Vec<(&str, &str)> = plan
        .env
        .iter()
        .map(|(k, v)| (k.as_str(), v.as_str()))
        .collect();
    if let Some(o) = &installed {
        for (k, v) in &o.env {
            env.push((k.as_str(), v.as_str()));
        }
    }
    let args: Vec<&str> = plan.args.iter().map(String::as_str).collect();
    let transport = ProcessTransport::spawn(&command, &args, &env)
        .map_err(|e| format!("failed to spawn {command}: {e}"))?;

    let mut session = AcpSession::new(transport);
    session
        .initialize(ClientInfo {
            name: "everyaios".to_string(),
            title: "EveryAIOS".to_string(),
            version: "0.1.0".to_string(),
        })
        .map_err(|e| format!("acp initialize failed: {e}"))?;
    let auth_methods = session.auth_methods().to_vec();

    // Try to create the session. `auth_required` is not a failure — it is a
    // signal to surface the sign-in surface (the handle stays alive so
    // `acp_authenticate` can retry after login).
    let (session_id, auth_required) = match session.session_new(&cwd, vec![]) {
        Ok(sid) => (sid, false),
        Err(everyaios_acp::AcpError::AuthRequired) => (String::new(), true),
        Err(e) => return Err(format!("acp session/new failed: {e}")),
    };

    let handle = format!("acp-{}", ACP_COUNTER.fetch_add(1, Ordering::Relaxed));
    let agent_name = manifest.name.clone();
    state
        .acp_sessions
        .lock()
        .map_err(|e| e.to_string())?
        .insert(
            handle.clone(),
            AcpHandle {
                agent_id: agent_id.clone(),
                cwd,
                auth_required,
                auth_methods: auth_methods.clone(),
                session,
            },
        );

    Ok(AcpHandleInfo {
        handle,
        agent_id,
        agent_name,
        session_id,
        protocol: "acp".to_string(),
        auth_required,
        auth_methods,
    })
}

/// Drive the ACP `authenticate` flow on a live handle, then retry
/// `session/new`. Agent-type methods return `{}` (the agent drives its own
/// login flow — prints a URL / opens its own browser). URL-type methods
/// return a `url`: the UI opens it in the system browser, the user completes
/// login, then the UI calls `acp_authenticate` again (which now succeeds and
/// creates the session). This is the "already signed in?" check — a launch
/// with `authRequired: false` means no login was needed.
#[tauri::command]
pub fn acp_authenticate(
    state: State<'_, AppState>,
    handle: String,
    method_id: String,
) -> Result<serde_json::Value, String> {
    let mut sessions = state
        .acp_sessions
        .lock()
        .map_err(|e| e.to_string())?;
    let entry = sessions
        .get_mut(&handle)
        .ok_or_else(|| format!("unknown ACP handle: {handle}"))?;

    let result = entry
        .session
        .authenticate(&method_id)
        .map_err(|e| format!("acp authenticate failed: {e}"))?;

    // url-type: hand the URL back — the user must complete login first.
    if let Some(url) = result.url {
        return Ok(serde_json::json!({ "ok": false, "url": url, "pending": true }));
    }

    // agent-type (or completed url-type): the connection is authenticated;
    // retry the session the launch couldn't create.
    let session_id = match entry.session.session_new(&entry.cwd, vec![]) {
        Ok(sid) => sid,
        Err(everyaios_acp::AcpError::AuthRequired) => {
            return Err("still auth_required after authenticate".to_string());
        }
        Err(e) => return Err(format!("acp session/new after auth failed: {e}")),
    };
    entry.auth_required = false;
    Ok(serde_json::json!({ "ok": true, "sessionId": session_id }))
}

/// Drive one ACP prompt turn. The agent's `session/request_permission`
/// requests route through the shared Guard-2 service: `Allow` auto-allows,
/// `Block` denies, and `Ask` denies the current turn while minting a ticket
/// the user can approve (then re-prompt). Never auto-allows an `Ask`.
#[tauri::command]
pub fn acp_prompt(
    state: State<'_, AppState>,
    handle: String,
    text: String,
) -> Result<serde_json::Value, String> {
    let mut sessions = state
        .acp_sessions
        .lock()
        .map_err(|e| e.to_string())?;
    let entry = sessions
        .get_mut(&handle)
        .ok_or_else(|| format!("unknown ACP handle: {handle}"))?;

    if entry.auth_required {
        return Err("agent requires sign-in — run acp_authenticate first".to_string());
    }

    let agent_id = entry.agent_id.clone();
    let session_id = entry.session.session_id().unwrap_or("acp").to_string();
    let guard = Arc::clone(&state.guard_service);

    let mut pending_tickets: Vec<String> = Vec::new();
    let outcome = entry
        .session
        .prompt(&text, |req| {
            let mut g = guard.lock().expect("guard_service poisoned");
            let (op, risk) = map_tool_call(&req.tool_call);
            let paths: Vec<String> = req
                .tool_call
                .locations
                .iter()
                .map(|l| l.uri.clone())
                .collect();
            let decision = DecisionPackage::new(req.tool_call.title.clone())
                .with_risk(risk)
                .with_paths(paths);
            let args_hash = hash_tool_args(&req.tool_call);
            match g.evaluate(
                &session_id,
                &agent_id,
                &req.tool_call.tool_call_id,
                op,
                decision,
                &args_hash,
                0,
            ) {
                GuardDecision::Allow { .. } => PermissionDecision::allow(),
                GuardDecision::Block { .. } => PermissionDecision::deny(),
                GuardDecision::Ask { ticket_id } => {
                    pending_tickets.push(ticket_id);
                    // Do not auto-allow; the ticket renders on the Guard-2
                    // card and the user can approve + re-prompt.
                    PermissionDecision::deny()
                }
            }
        })
        .map_err(|e| e.to_string())?;

    Ok(serde_json::json!({
        "handle": handle,
        "stopReason": outcome.stop_reason.as_str(),
        "updateCount": outcome.updates.len(),
        "permissionCount": outcome.permissions.len(),
        "pendingTickets": pending_tickets,
    }))
}

/// Interrupt the ongoing ACP turn (`session/cancel` notification).
#[tauri::command]
pub fn acp_cancel(state: State<'_, AppState>, handle: String) -> Result<(), String> {
    let mut sessions = state
        .acp_sessions
        .lock()
        .map_err(|e| e.to_string())?;
    let entry = sessions
        .get_mut(&handle)
        .ok_or_else(|| format!("unknown ACP handle: {handle}"))?;
    entry.session.cancel().map_err(|e| e.to_string())
}

/// Tear an ACP session down (kill + reap) and drop its handle.
#[tauri::command]
pub fn acp_shutdown(state: State<'_, AppState>, handle: String) -> Result<bool, String> {
    let mut sessions = state
        .acp_sessions
        .lock()
        .map_err(|e| e.to_string())?;
    match sessions.remove(&handle) {
        Some(mut entry) => {
            entry.session.shutdown();
            Ok(true)
        }
        None => Ok(false),
    }
}

/// Live ACP handles (the harness list in the cockpit).
#[tauri::command]
pub fn acp_sessions(state: State<'_, AppState>) -> Result<Vec<AcpHandleInfo>, String> {
    let sessions = state
        .acp_sessions
        .lock()
        .map_err(|e| e.to_string())?;
    Ok(sessions
        .iter()
        .map(|(handle, entry)| AcpHandleInfo::from((entry, handle.as_str())))
        .collect())
}

/// Map an ACP tool call onto a Guard-2 operation + risk tier so it routes
/// through the same policy engine as native tools (F9 shared taxonomy).
fn map_tool_call(tc: &ToolCall) -> (Operation, RiskLevel) {
    match tc.kind {
        Some(ToolKind::Delete) => (Operation::DeleteFiles, RiskLevel::High),
        Some(ToolKind::Execute) => (
            Operation::TerminalShell {
                destructive: false,
            },
            RiskLevel::High,
        ),
        Some(ToolKind::Edit) | Some(ToolKind::Move) => (Operation::GenericWrite, RiskLevel::Medium),
        // read / search / think / fetch / unknown → non-mutating, auto-allow.
        _ => (Operation::GenericWrite, RiskLevel::Low),
    }
}

/// A stable args fingerprint so the minted ticket is single-use on the exact
/// request (the executor compares this at `guard/use`).
fn hash_tool_args(tc: &ToolCall) -> String {
    use std::hash::{Hash, Hasher};
    let mut h = std::collections::hash_map::DefaultHasher::new();
    tc.tool_call_id.hash(&mut h);
    tc.title.hash(&mut h);
    if let Some(raw) = &tc.raw_input {
        serde_json::to_string(raw).unwrap_or_default().hash(&mut h);
    }
    format!("{:016x}", h.finish())
}

/// The install ticket's args-hash — deterministic from (agent, version) so
/// the request and commit halves always agree (single-use enforcement).
fn install_args_hash(agent_id: &str, version: &str) -> String {
    use std::hash::{Hash, Hasher};
    let mut h = std::collections::hash_map::DefaultHasher::new();
    "acp.install".hash(&mut h);
    agent_id.hash(&mut h);
    version.hash(&mut h);
    format!("{:016x}", h.finish())
}

/// The host of an archive URL (for the decision card's network scope).
fn url_host(url: &str) -> String {
    url.split('/').nth(2).unwrap_or(url).to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn delete_tool_maps_to_high_risk_delete() {
        let tc = ToolCall {
            tool_call_id: "t1".into(),
            title: "rm -rf".into(),
            kind: Some(ToolKind::Delete),
            ..Default::default()
        };
        let (op, risk) = map_tool_call(&tc);
        assert!(matches!(op, Operation::DeleteFiles));
        assert_eq!(risk, RiskLevel::High);
    }

    #[test]
    fn read_tool_maps_to_low_risk_write() {
        let tc = ToolCall {
            tool_call_id: "t2".into(),
            title: "read file".into(),
            kind: Some(ToolKind::Read),
            ..Default::default()
        };
        let (_, risk) = map_tool_call(&tc);
        assert_eq!(risk, RiskLevel::Low);
    }

    #[test]
    fn args_hash_is_stable_for_same_input() {
        let a = ToolCall {
            tool_call_id: "t1".into(),
            title: "x".into(),
            ..Default::default()
        };
        let b = a.clone();
        assert_eq!(hash_tool_args(&a), hash_tool_args(&b));
    }

    #[test]
    fn install_args_hash_is_deterministic_and_scoped() {
        assert_eq!(
            install_args_hash("devin", "3000.4.25"),
            install_args_hash("devin", "3000.4.25")
        );
        assert_ne!(
            install_args_hash("devin", "3000.4.25"),
            install_args_hash("devin", "3000.4.26")
        );
        assert_ne!(
            install_args_hash("devin", "3000.4.25"),
            install_args_hash("kiro", "3000.4.25")
        );
    }

    #[test]
    fn url_host_extracts_authority() {
        assert_eq!(
            url_host("https://static.devin.ai/cli/1.0/devin.tar.gz"),
            "static.devin.ai"
        );
        assert_eq!(url_host("https://x.ai"), "x.ai");
    }

    #[test]
    fn registry_has_inbuilt_default_and_launch_list() {
        let reg = LaunchRegistry::builtin();
        assert_eq!(reg.default_agent, "everyaios");
        assert!(reg.get("claude").is_some());
        assert!(reg.get("codex").is_some());
    }
}
