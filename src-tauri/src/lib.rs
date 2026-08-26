//! EveryAIOS desktop shell — Tauri v2 backend (tasks P0.2).
//!
//! The shell is deliberately thin: every capability lives in the
//! `everyaios-*` crates (core, vault, guard, audit, ipc). This crate wires
//! them to the UI as Tauri commands + events, and owns the system tray.

use std::path::PathBuf;
use std::process::{ChildStdin, ChildStdout};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

mod acp_cmds;
mod agent_cmds;
mod browser_cmds;
mod cockpit_cmds;
mod codeintel_cmds;
mod control;
mod fs_cmds;
mod git_cmds;
mod feedback_cmds;
mod guard_cmds;
mod guard_window;
mod lsp_cmds;
mod maintenance_cmds;
mod memory_cmds;
mod local_cmds;
mod mcp_cmds;
mod oauth_cmds;
mod office_cmds;
mod replay_cmds;
mod scheduler_cmds;
mod shell_cmds;
mod storage_cmds;
mod sync_cmds;
mod tasks_cmds;
mod trajectory_cmds;
mod updater_cmds;
mod vault_cmds;

use everyaios_core::GuardService;
use everyaios_guard::prescan::{guard as compiled_guard, Guard};
use everyaios_vault::Vault;

pub mod xlsx_cmds;
use tauri::{AppHandle, Emitter, Manager, State};

pub struct AppState {
    /// P0.2: the boot report line from `everyaios-core::boot`.
    pub boot_report: Mutex<String>,
    /// P0.2: an initialized Guard-1 scanner (stub blocklist until P7.4).
    pub guard: Guard,
    /// The encrypted vault (opened at boot; shared with the chat relay).
    pub vault: Arc<Mutex<Vault>>,
    /// P1.4: the chat relay over the coordinator link. `None` until the
    /// supervisor hands the sidecar's stdio pipes to a `SidecarLink` (the
    /// integration seam — the relay + protocol are fully built + tested).
    pub chat_relay:
        Mutex<Option<everyaios_core::ChatRelay<ChildStdin, ChildStdout>>>,
    /// P3.1: the replay store base dir (replays/ + screenshots/ + index).
    pub replay_dir: PathBuf,
    /// P3.2: the cockpit / ambient flight-deck live state (agent cards,
    /// interrupts, quiet flag) — fed by the coordinator via the feed seams,
    /// polled by the UI.
    pub cockpit: Arc<Mutex<everyaios_audit::cockpit::CockpitState>>,
    /// P7.5/J21 (Guard-2): the shared pre-flight service (tickets + policy +
    /// estop + profile) — minted by the coordinator over `guard/*`, rendered
    /// + approved/rejected by the cards here, consumed by the executor.
    pub guard_service: Arc<Mutex<GuardService>>,
    /// F12/J17 (ACP harness bridge): live ACP agent sessions keyed by handle
    /// id — spawned via `acp_launch`, driven via `acp_prompt`/`acp_cancel`.
    pub(crate) acp_sessions: Mutex<std::collections::HashMap<String, acp_cmds::AcpHandle>>,
    /// H4: Merkle chain of mutations (Excel / ACP-install / undo).
    pub audit: Mutex<everyaios_audit::merkle::MerkleChain>,
    /// Durable NDJSON audit log (best-effort; None if the file couldn't open).
    pub audit_log: Mutex<Option<everyaios_audit::AuditWriter>>,
    /// File snapshots for agent undo (xlsx + other shell mutations).
    pub file_undos: Mutex<Vec<control::FileUndo>>,
    /// J16: whether the device is on battery (heavy storage scans defer).
    pub battery: std::sync::Arc<std::sync::atomic::AtomicBool>,
    /// P11.5.3: the live CDP browser session for the browse view (None until
    /// `browser_start`). Dropping it kills the Chrome child.
    pub browser: Mutex<Option<browser_cmds::LiveBrowser>>,
    /// P11.5.3: live shell processes keyed by session id (shell view).
    pub shells: Mutex<std::collections::HashMap<String, shell_cmds::ShellHandle>>,
    /// P11.5.8: attached user-supplied MCP servers (rows for the Connectors
    /// panel) + the live child handles (dropping the map kills the child).
    pub mcp_servers: Mutex<std::collections::HashMap<String, mcp_cmds::McpServerRow>>,
    pub mcp_live: Mutex<std::collections::HashMap<String, everyaios_mcp::attach::AttachedServer>>,
}

/// Monotonic stream-id source for `chat_stream` calls.
static STREAM_COUNTER: AtomicU64 = AtomicU64::new(1);

/// Event name the UI listens to for chat stream updates.
pub const CHAT_EVENT: &str = "chat-event";

/// P11.5.11 — AG-UI live transport event (raw encoded envelope line in
/// `{ "line": … }`). Emitted for every `agui/event` notification the
/// coordinator pushes.
pub const AGUI_EVENT: &str = "agui-event";

/// P11.5.11 — send one AG-UI event from the UI into the coordinator (e.g.
/// `interrupt_resolved` answering an outstanding AG-UI interrupt). The line
/// is forwarded as an `agui/event` notification over the sidecar link.
#[tauri::command]
fn agui_send(state: State<'_, AppState>, line: String) -> Result<(), String> {
    let relay = state.chat_relay.lock().map_err(|e| e.to_string())?;
    let relay = relay
        .as_ref()
        .ok_or_else(|| "sidecar not connected — coordinator link not established".to_string())?;
    relay
        .send_agui(&line)
        .map_err(|e| format!("agui_send failed: {e}"))
}

/// P11.5.11 — ack that the UI is listening for `agui-event`. The sink is
/// attached at boot (`connect_chat_relay`); this returns once the relay is
/// live so the UI knows the AG-UI transport is ready end-to-end.
#[tauri::command]
fn agui_listen(state: State<'_, AppState>) -> Result<(), String> {
    let relay = state.chat_relay.lock().map_err(|e| e.to_string())?;
    match relay.as_ref() {
        Some(r) if r.agui().is_attached() => Ok(()),
        Some(_) => Err("agui sink not attached".to_string()),
        None => Err("sidecar not connected".to_string()),
    }
}

/// Wire a live coordinator link into the chat relay and store it in state.
/// The relay's consumer loop forwards every `chat/*` notification from the
/// sidecar to the UI as a `chat-event` (P1.4: token deltas → core → Tauri
/// events → UI). Called once per (re)spawn from the link-drain thread.
fn connect_chat_relay(
    app: &AppHandle,
    stdin: ChildStdin,
    stdout: ChildStdout,
    activity: Arc<AtomicU64>,
) {
    let handle = app.clone();
    let state = app.state::<AppState>();
    // The SidecarLink reader re-arms the supervisor's idle-watchdog clock on
    // every decoded frame (session/ready + session/heartbeat).
    let link = everyaios_core::SidecarLink::new_with_activity(stdin, stdout, Some(activity));
    // J21: the relay shares the app's Guard-2 service, and loads the user's
    // `permissions.toml` escalation policy at boot.
    let relay = everyaios_core::ChatRelay::new_with_guard(
        link,
        Arc::clone(&state.vault),
        Arc::clone(&state.guard_service),
        move |ev| {
            // Fire-and-forget: never let a UI emit failure break the relay.
            let _ = handle.emit(CHAT_EVENT, ev);
        },
    );
    // P11.5.11 — AG-UI live transport: `agui/event` notifications from the
    // coordinator reach the UI as `agui-event` emits (raw encoded line).
    {
        let h = app.clone();
        relay.with_agui(move |line| {
            let _ = h.emit(AGUI_EVENT, serde_json::json!({ "line": line }));
        });
    }
    let policy_path = everyaios_core::default_data_dir().join("permissions.toml");
    relay.with_policy(&policy_path);
    // P1.8 (A5): register keyless local endpoints so a sidecar
    // `provider/stream` for ollama/llamafile routes to the local runtime
    // (GBNF grammar constraint included — B5). Ollama always registers;
    // llamafile only when a binary is discoverable (config, env, or
    // `<data_dir>/bin/*.llamafile`).
    let cfg = everyaios_core::Config::load().unwrap_or_default();
    let mgr = everyaios_core::LocalManager::from_config(&cfg);
    if let Some(ep) = mgr.endpoint_for("ollama") {
        relay.with_local("ollama", ep);
    }
    if mgr.find_llamafile(&cfg.data_dir).is_some()
        || std::env::var("EVERYAIOS_LLAMAFILE").is_ok()
    {
        if let Some(ep) = mgr.endpoint_for("llamafile") {
            relay.with_local("llamafile", ep);
        }
    }
    // P43 (B7 v3.53) — push completion: every terminal transition of the
    // task ledger wakes the UI via a `task-update` event (never polling).
    {
        let h = app.clone();
        relay.tasks().lock().unwrap_or_else(|e| e.into_inner()).watch(Box::new(
            move |record: &everyaios_core::TaskRecord| {
                let _ = h.emit(
                    "task-update",
                    serde_json::to_value(record).unwrap_or_else(|_| serde_json::json!({})),
                );
            },
        ));
    }
    relay.spawn();
    *state.chat_relay.lock().expect("chat_relay poisoned") = Some(relay);
}

#[tauri::command]
fn version() -> String {
    everyaios_core::version::banner()
}

#[tauri::command]
fn core_boot_report(state: State<'_, AppState>) -> Result<String, String> {
    state
        .boot_report
        .lock()
        .map(|r| r.clone())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn scan_text(state: State<'_, AppState>, text: String) -> Result<bool, String> {
    // Guard-1: deterministic pre-exec scan. `true` = blocked.
    Ok(state.guard.is_blocked(&text))
}

#[tauri::command]
fn chat_stream(
    state: State<'_, AppState>,
    session_id: String,
    text: String,
    provider: Option<String>,
    model: Option<String>,
    surface: Option<String>,
    agent_id: Option<String>,
    persona_id: Option<String>,
    soul_md: Option<String>,
    user_documents: Option<Vec<everyaios_core::UserDocument>>,
) -> Result<String, String> {
    // P1.4: dispatch one turn through the coordinator's ConversationEngine.
    // The reply is the streamId; all output arrives as `chat-event` emits
    // (ttft/batch/done/error/cancelled/budgetExceeded). J11 budget refusals
    // surface as the error string "stopped: $X limit".
    let relay = state.chat_relay.lock().map_err(|e| e.to_string())?;
    let relay = relay
        .as_ref()
        .ok_or_else(|| "sidecar not connected — coordinator link not established".to_string())?;
    let stream_id = format!("st{}", STREAM_COUNTER.fetch_add(1, Ordering::Relaxed));
    relay
        .start_stream(everyaios_core::ChatStreamParams {
            session_id,
            stream_id: stream_id.clone(),
            text,
            surface,
            // F12/J17: `None` ⇒ the inbuilt engine (default). A non-None id
            // tags the turn with the selected agent for per-agent model
            // surface + prompt persona (coordinator threads it into opts).
            agent_id,
            // P1.9: `None` lets the coordinator's task→model router pick.
            provider,
            model,
            persona_id,
            soul_md,
            user_documents,
        })
        .map_err(|e| e.to_string())?;
    Ok(stream_id)
}

/// Stage-0 (P6.3): dispatch a blueprint plan to the coordinator's plan
/// executor. The reply is the streamId; all progress arrives as `chat-event`
/// emits (plan_start/step/interrupt/plan_done + the turn's ttft/batch/done).
#[tauri::command]
fn plan_execute(
    state: State<'_, AppState>,
    session_id: String,
    plan_id: String,
    tasks: serde_json::Value,
    provider: Option<String>,
    model: Option<String>,
) -> Result<String, String> {
    let relay = state.chat_relay.lock().map_err(|e| e.to_string())?;
    let relay = relay
        .as_ref()
        .ok_or_else(|| "sidecar not connected — coordinator link not established".to_string())?;
    let stream_id = format!("pl{}", STREAM_COUNTER.fetch_add(1, Ordering::Relaxed));
    relay
        .start_plan(
            &session_id,
            &plan_id,
            &stream_id,
            tasks,
            provider.as_deref(),
            model.as_deref(),
        )
        .map_err(|e| e.to_string())?;
    Ok(stream_id)
}

/// Stage-0 (P6.3): forward the user's MCQ card choice back to the coordinator's
/// plan executor (which is waiting on that circuit-break interrupt).
#[tauri::command]
fn plan_respond(state: State<'_, AppState>, break_id: String, choice: String) -> Result<(), String> {
    let relay = state.chat_relay.lock().map_err(|e| e.to_string())?;
    let relay = relay
        .as_ref()
        .ok_or_else(|| "sidecar not connected".to_string())?;
    relay.respond_plan(&break_id, &choice).map_err(|e| e.to_string())
}

#[tauri::command]
fn usage_snapshot(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    // P5.9: the token/cost dashboard data source — per-key/per-session usage,
    // cache-hit rate, and cost from the relay's in-process `MemoryService`
    // ledger. Empty (zeros) until the sidecar connects and records calls.
    let relay = state.chat_relay.lock().map_err(|e| e.to_string())?;
    let relay = relay
        .as_ref()
        .ok_or_else(|| "sidecar not connected — usage ledger not ready".to_string())?;
    let memory = relay.memory();
    let mem = memory.lock().map_err(|e| e.to_string())?;
    Ok(mem.usage_snapshot())
}

/// P5.9 — per-session cost/token breakdown (the durable `token_usage` ledger,
/// grouped by session). Feeds the analytics cost table.
#[tauri::command]
fn session_totals(state: State<'_, AppState>) -> Result<Vec<everyaios_vault::SessionTotal>, String> {
    let vault = state.vault.lock().map_err(|e| e.to_string())?;
    vault.session_totals().map_err(|e| e.to_string())
}

#[tauri::command]
fn chat_cancel(state: State<'_, AppState>, stream_id: String) -> Result<(), String> {
    // Abort signal: UI → Rust → sidecar (chat/cancel) → engine/provider.
    let relay = state.chat_relay.lock().map_err(|e| e.to_string())?;
    let relay = relay
        .as_ref()
        .ok_or_else(|| "sidecar not connected".to_string())?;
    relay.cancel(&stream_id).map_err(|e| e.to_string())
}

/// S0.5: re-run a failed tool through Guard-2 exec→commit (same ticket path).
#[tauri::command]
fn chat_tool_retry(
    state: State<'_, AppState>,
    session_id: String,
    stream_id: String,
    tool_id: String,
    args: serde_json::Value,
    agent_id: Option<String>,
) -> Result<(), String> {
    let relay = state.chat_relay.lock().map_err(|e| e.to_string())?;
    let relay = relay
        .as_ref()
        .ok_or_else(|| "sidecar not connected".to_string())?;
    relay
        .retry_tool(
            &session_id,
            &stream_id,
            &tool_id,
            args,
            agent_id.as_deref(),
        )
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn probe_vault() -> Result<String, String> {
    // Security (P0.2 stub): the path is NOT webview-controlled — it is pinned
    // to the data dir. Arbitrary path handling arrives with P1.1 key
    // management (vault path comes from config, never from the frontend).
    let path = everyaios_core::default_data_dir().join("vault.db");
    let resolved = everyaios_core::resolve_vault_key(&everyaios_core::default_data_dir())
        .map_err(|e| e.to_string())?;
    let vault = everyaios_vault::Vault::open(&path, &resolved.key).map_err(|e| e.to_string())?;
    Ok(vault.status())
}

#[tauri::command]
fn vault_key_status() -> Result<serde_json::Value, String> {
    let dir = everyaios_core::default_data_dir();
    let mode = everyaios_core::gate_mode(&dir);
    let gate = everyaios_core::needs_passphrase_gate(&dir);
    match everyaios_core::resolve_vault_key(&dir) {
        Ok(r) => Ok(serde_json::json!({
            "ok": true,
            "origin": r.origin,
            "path": r.path,
            "needsSetup": gate,
            "mode": if r.origin == everyaios_core::VaultKeyOrigin::Generated { "wrap" } else { mode },
            "locked": false,
        })),
        Err(everyaios_core::VaultKeyError::NeedsSetup) => Ok(serde_json::json!({
            "ok": false,
            "needsSetup": true,
            "mode": mode,
            "locked": mode == "unlock",
        })),
        Err(e) => Err(e.to_string()),
    }
}

fn reopen_disk_vault(state: &AppState, key: &str) -> Result<String, String> {
    let path = everyaios_core::default_data_dir().join("vault.db");
    let vault = Vault::open(&path, key).map_err(|e| e.to_string())?;
    let status = vault.status();
    *state.vault.lock().map_err(|e| e.to_string())? = vault;
    Ok(status)
}

#[tauri::command]
fn vault_setup(state: State<'_, AppState>, passphrase: String) -> Result<serde_json::Value, String> {
    let r = everyaios_core::setup_vault_passphrase(
        &everyaios_core::default_data_dir(),
        &passphrase,
    )
    .map_err(|e| e.to_string())?;
    let status = reopen_disk_vault(&state, &r.key)?;
    Ok(serde_json::json!({
        "ok": true,
        "origin": r.origin,
        "path": r.path,
        "needsSetup": false,
        "status": status,
    }))
}

#[tauri::command]
fn vault_unlock(state: State<'_, AppState>, passphrase: String) -> Result<serde_json::Value, String> {
    let r = everyaios_core::unlock_vault_passphrase(
        &everyaios_core::default_data_dir(),
        &passphrase,
    )
    .map_err(|e| e.to_string())?;
    let status = reopen_disk_vault(&state, &r.key)?;
    Ok(serde_json::json!({
        "ok": true,
        "origin": r.origin,
        "needsSetup": false,
        "status": status,
    }))
}

#[tauri::command]
fn session_list(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let vault = state.vault.lock().map_err(|e| e.to_string())?;
    let rows = vault.list_ui_sessions().map_err(|e| e.to_string())?;
    let sessions: Vec<serde_json::Value> = rows
        .into_iter()
        .filter_map(|(_, payload)| serde_json::from_str(&payload).ok())
        .collect();
    Ok(serde_json::json!({ "sessions": sessions }))
}

#[tauri::command]
fn session_put(state: State<'_, AppState>, session: serde_json::Value) -> Result<(), String> {
    let id = session
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or("session id required")?
        .to_string();
    let payload = serde_json::to_string(&session).map_err(|e| e.to_string())?;
    let vault = state.vault.lock().map_err(|e| e.to_string())?;
    vault.put_ui_session(&id, &payload).map_err(|e| e.to_string())
}

#[tauri::command]
fn session_delete(state: State<'_, AppState>, session_id: String) -> Result<(), String> {
    let vault = state.vault.lock().map_err(|e| e.to_string())?;
    vault.delete_ui_session(&session_id).map_err(|e| e.to_string())
}

/// Locate the coordinator sidecar binary. `EVERYAIOS_COORDINATOR_BIN` wins;
/// otherwise the packaged resource dir (`bin/coordinator` — P8.8 installers
/// ship the sidecar as a bundle resource) is probed, then the standard
/// workspace build output paths.
fn locate_coordinator_bin(app: &AppHandle) -> Option<PathBuf> {
    if let Ok(p) = std::env::var("EVERYAIOS_COORDINATOR_BIN") {
        let p = PathBuf::from(p);
        if p.is_file() {
            return Some(p);
        }
    }
    // Packaged app: the sidecar is a bundle resource (`bin/coordinator`).
    if let Ok(res) = app.path().resource_dir() {
        for rel in ["bin/coordinator", "bin/coordinator.exe", "coordinator", "coordinator.exe"] {
            let p = res.join(rel);
            if p.is_file() {
                return Some(p);
            }
        }
    }
    let cwd = std::env::current_dir().ok()?;
    for rel in [
        "packages/coordinator/dist/coordinator",
        "../packages/coordinator/dist/coordinator",
        "packages/coordinator/dist/coordinator.exe",
        "../packages/coordinator/dist/coordinator.exe",
    ] {
        let p = cwd.join(rel);
        if p.is_file() {
            return Some(p);
        }
    }
    None
}

/// J16: pre-spawn the coordinator sidecar at boot (hidden — the app window
/// and the sidecar warm up in parallel, so the first chat request never waits
/// on a process spawn: ~200ms perceived cold start). Two threads: one runs the
/// process lifecycle (spawn/watchdog/restart), the other drains the link
/// handoffs and (re)builds the `ChatRelay` on every (re)spawn. Non-fatal: the
/// app runs fine without the sidecar; chat simply reports "sidecar not
/// connected".
fn pre_spawn_coordinator(app: AppHandle) {
    let Some(bin) = locate_coordinator_bin(&app) else {
        eprintln!("everyaios-desktop: coordinator binary not found — pre-spawn skipped");
        return;
    };
    let (mut supervisor, link_rx) = everyaios_core::start_supervisor_with_link(bin);
    let activity = Arc::clone(&supervisor.last_activity_ms);
    // Lifecycle thread: spawn, watchdog, restart. Blocks until circuit open.
    std::thread::spawn(move || {
        if let Err(e) = supervisor.wait_or_restart() {
            eprintln!("everyaios-desktop: supervisor ended: {e}");
        }
    });
    // Link thread: rebuild the chat relay on every (re)spawn handoff.
    std::thread::spawn(move || {
        while let Ok((stdin, stdout)) = link_rx.recv() {
            connect_chat_relay(&app, stdin, stdout, Arc::clone(&activity));
        }
    });
}

/// P2.11 (E16) — spawn the WebMCP HTTP server on a loopback port so browser
/// sessions can serve MCP tools (`tools/list` + `tools/call`) to any local
/// HTTP client. The registry mirrors the 37-tool browser catalog; tool calls
/// fail honestly until a live browser session is attached (the executor is a
/// "not attached" stub — the engine itself lives in `everyaios-browser`).
fn spawn_webmcp_server() {
    use everyaios_browser::webmcp::{WebMcpExecutor, WebMcpRegistry, WebMcpResult, WebMcpTool};
    use everyaios_mcp::ArgKind;
    use serde_json::json;

    let mut registry = WebMcpRegistry::new();
    for def in everyaios_mcp::BROWSER_TOOLS {
        let mut properties = serde_json::Map::new();
        let mut required = Vec::new();
        for a in def.args {
            let ty = match a.kind {
                ArgKind::String => "string",
                ArgKind::Number => "number",
                ArgKind::Bool => "boolean",
                ArgKind::StringArray => "array",
                ArgKind::Object => "object",
            };
            let mut spec = json!({ "type": ty, "description": a.description });
            if a.kind == ArgKind::StringArray {
                spec["items"] = json!({ "type": "string" });
            }
            properties.insert(a.name.to_string(), spec);
            if a.required {
                required.push(serde_json::Value::String(a.name.to_string()));
            }
        }
        registry.register(WebMcpTool {
            name: def.name.to_string(),
            description: def.description.to_string(),
            input_schema: json!({
                "type": "object",
                "properties": properties,
                "required": required,
            }),
        });
    }

    struct NotAttached;
    impl WebMcpExecutor for NotAttached {
        fn execute(&self, tool: &WebMcpTool, _input: serde_json::Value) -> WebMcpResult {
            WebMcpResult::err(format!(
                "browser session not attached — {} is catalog-only until a CDP session is wired",
                tool.name
            ))
        }
    }

    match everyaios_browser::webmcp_http::McpHttpServer::serve(
        "127.0.0.1:0",
        registry,
        std::sync::Arc::new(NotAttached),
    ) {
        Ok(server) => match server.local_addr() {
            Ok(addr) => eprintln!("everyaios-desktop: WebMCP HTTP listening on http://{addr}/mcp (token {})", server.token()),
            Err(e) => eprintln!("everyaios-desktop: WebMCP addr lookup failed: {e}"),
        },
        Err(e) => eprintln!("everyaios-desktop: WebMCP server spawn failed (continuing): {e}"),
    }
}

/// J16: bind the UNIX-domain socket control channel and dispatch
/// `agent/stop` / `agent/undo` / `agent/interrupt-response`.
#[cfg(unix)]
fn serve_unix_control_channel(app: AppHandle) {
    let cfg = everyaios_core::Config::load().unwrap_or_default();
    let sock = cfg.resolved_socket_path();
    let server = match everyaios_ipc::UnixFrameServer::bind(&sock) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("everyaios-desktop: unix socket bind failed (continuing): {e}");
            return;
        }
    };
    std::thread::spawn(move || loop {
        match server.accept() {
            Ok(stream) => {
                let app = app.clone();
                let _ = server.serve_connection(stream, move |payload| {
                    let parsed: serde_json::Value =
                        serde_json::from_slice(&payload).unwrap_or_default();
                    let method = parsed.get("method").and_then(|m| m.as_str()).unwrap_or("");
                    let params = parsed.get("params").cloned().unwrap_or(serde_json::json!({}));
                    let result = control::dispatch(&app, method, &params);
                    let reply = serde_json::json!({
                        "jsonrpc": "2.0",
                        "id": parsed.get("id"),
                        "result": result,
                    });
                    Some(serde_json::to_vec(&reply).unwrap_or_default())
                });
            }
            Err(e) => {
                eprintln!("everyaios-desktop: unix socket accept: {e}");
                std::thread::sleep(std::time::Duration::from_millis(200));
            }
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Build the initial state exactly like the headless binary would.
    let args: Vec<String> = std::env::args().skip(1).collect();
    let mut boot_report = everyaios_core::boot(&args).unwrap_or_else(|e| format!("boot failed: {e}"));
    let guard = compiled_guard().clone();
    let data_dir = everyaios_core::default_data_dir();
    let resolved = everyaios_core::resolve_vault_key(&data_dir);
    // Bugfix 14 — persistence must never fail *silently* open. If the vault
    // cannot be opened on disk we fall back to an in-memory vault (chat keeps
    // working) but flag it loudly so the UI can warn that nothing will persist,
    // instead of letting the user believe their chat is durable.
    let mut vault_ephemeral = false;
    let vault = match resolved {
        Ok(r) => Vault::open(&data_dir.join("vault.db"), &r.key).unwrap_or_else(|e| {
            eprintln!("everyaios-desktop: vault open failed (using in-memory): {e}");
            vault_ephemeral = true;
            Vault::open_in_memory(&r.key).unwrap_or_else(|_| {
                Vault::open_in_memory(&everyaios_core::default_vault_key())
                    .expect("in-memory vault")
            })
        }),
        Err(e) => {
            eprintln!("everyaios-desktop: vault key resolve failed (using in-memory): {e}");
            vault_ephemeral = true;
            Vault::open_in_memory(&everyaios_core::default_vault_key()).expect("in-memory vault")
        }
    };
    if vault_ephemeral {
        boot_report.push_str(" | EPHEMERAL VAULT: persistence disabled (fix vault lock)");
    }
    let vault = Arc::new(Mutex::new(vault));
    let audit_log = everyaios_audit::AuditWriter::open(&data_dir.join("audit.ndjson")).ok();

    tauri::Builder::default()
        .manage(AppState {
            boot_report: Mutex::new(boot_report),
            guard,
            vault,
            chat_relay: Mutex::new(None),
            replay_dir: everyaios_core::default_data_dir(),
            cockpit: Arc::new(Mutex::new(Default::default())),
            guard_service: Arc::new(Mutex::new(GuardService::new())),
            acp_sessions: Mutex::new(std::collections::HashMap::new()),
            audit: Mutex::new(everyaios_audit::merkle::MerkleChain::new()),
            audit_log: Mutex::new(audit_log),
            file_undos: Mutex::new(Vec::new()),
            battery: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
            browser: Mutex::new(None),
            shells: Mutex::new(std::collections::HashMap::new()),
            mcp_servers: Mutex::new(std::collections::HashMap::new()),
            mcp_live: Mutex::new(std::collections::HashMap::new()),
        })
        .invoke_handler(tauri::generate_handler![
            version,
            core_boot_report,
            scan_text,
            probe_vault,
            vault_key_status,
            vault_setup,
            vault_unlock,
            session_list,
            session_put,
            session_delete,
            oauth_cmds::oauth_status,
            oauth_cmds::oauth_accounts,
            oauth_cmds::oauth_start_pkce,
            oauth_cmds::oauth_start_device,
            oauth_cmds::oauth_poll_device,
            oauth_cmds::oauth_revoke,
            local_cmds::local_models,
            local_cmds::local_ensure,
            local_cmds::local_hardware,
            chat_stream,
            agui_send,
            agui_listen,
            chat_cancel,
            chat_tool_retry,
            plan_execute,
            plan_respond,
            usage_snapshot,
            session_totals,
            replay_cmds::replay_sessions,
            replay_cmds::replay_timeline,
            replay_cmds::replay_screenshot,
            replay_cmds::watch_events,
            replay_cmds::agent_stop,
            trajectory_cmds::trajectory_sessions,
            trajectory_cmds::trajectory_snapshot,
            guard_cmds::guard_tickets,
            feedback_cmds::feedback_submit,
            guard_cmds::guard_respond,
            guard_cmds::guard_open_window,
            guard_cmds::guard_receipts,
            guard_cmds::guard_policy,
            guard_cmds::guard_estop,
            guard_cmds::guard_activity,
            guard_cmds::guard_permissions_matrix,
            cockpit_cmds::cockpit_snapshot,
            cockpit_cmds::cockpit_activity,
            cockpit_cmds::cockpit_tokens,
            cockpit_cmds::cockpit_quiet,
            cockpit_cmds::agent_undo,
            cockpit_cmds::interrupt_respond,
            cockpit_cmds::cockpit_upsert_agent,
            xlsx_cmds::xlsx_open,
            xlsx_cmds::xlsx_recalc,
            xlsx_cmds::xlsx_edit_request,
            xlsx_cmds::xlsx_edit_commit,
            xlsx_cmds::xlsx_batch_request,
            xlsx_cmds::xlsx_batch_commit,
            xlsx_cmds::xlsx_pivot,
            mcp_cmds::mcp_catalog,
            mcp_cmds::mcp_servers,
            mcp_cmds::mcp_attach,
            office_cmds::docx_open,
            office_cmds::docx_patch,
            office_cmds::docx_tracks,
            office_cmds::pptx_open,
            office_cmds::pptx_notes,
            office_cmds::pdf_open,
            office_cmds::pdf_bytes,
            office_cmds::pdf_page_op,
            office_cmds::office_open_external,
            vault_cmds::vault_keys_list,
            vault_cmds::vault_key_add,
            vault_cmds::vault_key_remove,
            acp_cmds::chief_default_get,
            acp_cmds::chief_default_set,
            agent_cmds::agent_registry_list,
            agent_cmds::agent_registry_save,
            agent_cmds::agent_registry_get,
            agent_cmds::agent_registry_remove,
            agent_cmds::agent_registry_duplicate,
            agent_cmds::agent_registry_set_disabled,
            acp_cmds::acp_agents,
            acp_cmds::acp_launch,
            acp_cmds::acp_prompt,
            acp_cmds::acp_cancel,
            acp_cmds::acp_shutdown,
            acp_cmds::acp_sessions,
            acp_cmds::acp_registry_refresh,
            acp_cmds::acp_registry_status,
            acp_cmds::acp_registry_install_plan,
            acp_cmds::acp_install_status,
            acp_cmds::acp_install_request,
            acp_cmds::acp_install_commit,
            acp_cmds::acp_install,
            acp_cmds::acp_authenticate,
            // Maintenance: audit retention sweep (ledger-growth fault line).
            maintenance_cmds::audit_compact,
            // P6.4 (B7): scheduled tasks.
            scheduler_cmds::scheduler_list,
            scheduler_cmds::scheduler_create,
            scheduler_cmds::scheduler_delete,
            scheduler_cmds::scheduler_enable,
            scheduler_cmds::scheduler_pause,
            scheduler_cmds::scheduler_pause_session,
            scheduler_cmds::scheduler_resume,
            scheduler_cmds::scheduler_run_now,
            scheduler_cmds::scheduler_battery,
            scheduler_cmds::scheduler_fire_event,
            scheduler_cmds::scheduler_fire_webhook,
            scheduler_cmds::scheduler_nudges,
            scheduler_cmds::scheduler_nudge,
            tasks_cmds::tasks_list,
            tasks_cmds::tasks_show,
            tasks_cmds::tasks_cancel,
            tasks_cmds::tasks_retry,
            tasks_cmds::tasks_enqueue,
            tasks_cmds::tasks_start,
            tasks_cmds::tasks_complete,
            tasks_cmds::tasks_sweep,
            storage_cmds::storage_health,
            storage_cmds::storage_scan,
            storage_cmds::storage_large_files,
            storage_cmds::storage_duplicates,
            storage_cmds::storage_cleanup_proposals,
            storage_cmds::storage_battery,
            // P8.9 sync: encrypted bundle export/import + live TCP transport
            // (direct ip:port — LAN + Tailscale; explicit trigger, default 47615).
            sync_cmds::sync_export_bundle,
            sync_cmds::sync_import_bundle,
            sync_cmds::sync_keypair_generate,
            sync_cmds::sync_public_key,
            sync_cmds::sync_serve_start,
            sync_cmds::sync_serve_stop,
            sync_cmds::sync_serve_status,
            sync_cmds::sync_peer_sync,
            sync_cmds::node_attach,
            sync_cmds::sync_fingerprint,
            // P8.8: auto-updater check + install/relaunch.
            updater_cmds::updater_check,
            updater_cmds::updater_install,
            // P11.5.3: real FS / shell / CDP-browser / memory views.
            fs_cmds::fs_home,
            fs_cmds::fs_list_dir,
            fs_cmds::fs_read_file,
            fs_cmds::fs_write_file,
            fs_cmds::fs_write_ticket,
            fs_cmds::fs_write_commit,
            fs_cmds::fs_undo_list,
            shell_cmds::shell_spawn,
            shell_cmds::shell_write,
            shell_cmds::shell_kill,
            shell_cmds::shell_status,
            browser_cmds::browser_start,
            browser_cmds::browser_navigate,
            browser_cmds::browser_snapshot,
            browser_cmds::browser_read,
            browser_cmds::browser_click,
            browser_cmds::browser_type,
            browser_cmds::browser_stop,
            browser_cmds::browser_status,
            memory_cmds::memory_request,
            memory_cmds::memory_read,
            // P11.5.3 IDE: git SCM + LSP diagnostics.
            git_cmds::git_status,
            git_cmds::git_log,
            git_cmds::git_diff,
            git_cmds::git_stage_all,
            git_cmds::git_commit,
            git_cmds::git_root,
            git_cmds::git_worktree_add,
            git_cmds::git_worktree_list,
            git_cmds::git_worktree_merge,
            git_cmds::git_worktree_revert,
            lsp_cmds::lsp_diagnostics,
            // P11.5.9: repo-map / file-outline / MODEL_ALIASES / ai! markers.
            codeintel_cmds::repomap_build,
            codeintel_cmds::file_outline,
            codeintel_cmds::model_aliases_resolve,
            codeintel_cmds::ai_markers_scan
        ])
        // P8.8: auto-updater (checks + downloads against the configured
        // endpoints; signing key is the release secret).
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            // Tray must be non-fatal: on systems without appindicator/tray
            // support the app should still start (just without a tray icon).
            if let Err(e) = setup_tray(app.handle()) {
                eprintln!("everyaios-desktop: tray setup failed (continuing): {e}");
            }
            // J16: pre-spawn the coordinator + bind the unix control socket.
            pre_spawn_coordinator(app.handle().clone());
            #[cfg(unix)]
            serve_unix_control_channel(app.handle().clone());
            // P2.11 (E16): serve the WebMCP tool catalog over loopback HTTP.
            spawn_webmcp_server();
            // Ledger-growth fault line: enforce ARCH/06's configurable audit
            // retention — compact the NDJSON log at most once per day
            // (writer-quiescent window; marker-gated; non-fatal).
            if let Err(e) = maintenance_cmds::run_audit_sweep_if_due(&app.state::<AppState>()) {
                eprintln!("everyaios-desktop: audit sweep failed (continuing): {e}");
            }
            // P43.4 — task-ledger maintenance at boot: reap grace-expired
            // running tasks + prune terminal records past 7-day retention.
            // (Marker-free: the ledger itself is idempotent — reap/prune
            // only touch records that match their predicates.)
            if let Err(e) = tasks_cmds::tasks_sweep(app.state::<AppState>()) {
                eprintln!("everyaios-desktop: task sweep failed (continuing): {e}");
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running EveryAIOS");
}

/// System tray (P0.2 task 17 / H11): status icon + Show/Run-automations/Quit
/// menu. Scheduled tasks execute headless via the coordinator's own due-loop;
/// the tray item just forces a manual tick (works with the window hidden).
fn setup_tray(app: &tauri::AppHandle) -> tauri::Result<()> {
    use tauri::menu::{Menu, MenuItem};
    use tauri::tray::TrayIconBuilder;

    let show = MenuItem::with_id(app, "show", "Show EveryAIOS", true, None::<&str>)?;
    let run = MenuItem::with_id(app, "run-automations", "Run automations now", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &run, &quit])?;

    let mut builder = TrayIconBuilder::with_id("main-tray");
    if let Some(icon) = app.default_window_icon().cloned() {
        builder = builder.icon(icon);
    }
    let _tray = builder
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => {
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.show();
                    let _ = win.unminimize();
                    let _ = win.set_focus();
                }
            }
            // H11: force a due-check + execution pass headless (no window).
            // The tick is fire-and-forget — the coordinator acks its own
            // executed-job list; failures surface in the sidecar log.
            "run-automations" => {
                let state = app.state::<AppState>();
                let Ok(guard) = state.chat_relay.lock() else {
                    return;
                };
                if let Some(relay) = guard.as_ref() {
                    let _ = relay.tick_scheduler();
                }
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;

    Ok(())
}
