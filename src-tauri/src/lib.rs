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
mod artifact_cmds;
mod boot;
mod browser_cmds;
mod catalog_cmds;
mod cockpit_cmds;
mod codeintel_cmds;
mod commands;
mod control;
mod desktop_cmds;
mod discovery_cmds;
mod doctor_cmds;
mod feedback_cmds;
mod fs_cmds;
mod git_cmds;
mod guard_cmds;
mod guard_window;
mod local_cmds;
mod lsp_cmds;
mod maintenance_cmds;
mod mcp_cmds;
mod memory_cmds;
mod oauth_cmds;
mod openai_cmds;
mod office_cmds;
mod replay_cmds;
mod scheduler_cmds;
mod shell_cmds;
mod skills_cmds;
mod state;
mod storage_cmds;
mod sync_cmds;
mod tasks_cmds;
mod trajectory_cmds;
mod updater_cmds;
mod vault_cmds;
mod work_cmds;

pub use state::AppState;

use everyaios_core::GuardService;
use everyaios_guard::prescan::guard as compiled_guard;
use everyaios_vault::Vault;

pub mod xlsx_cmds;
use tauri::{AppHandle, Emitter, Manager, State};

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
    *state.sidecar_activity_ms.lock().unwrap_or_else(|e| e.into_inner()) = Some(Arc::clone(&activity));
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
    if mgr.find_llamafile(&cfg.data_dir).is_some() || std::env::var("EVERYAIOS_LLAMAFILE").is_ok() {
        if let Some(ep) = mgr.endpoint_for("llamafile") {
            relay.with_local("llamafile", ep);
        }
    }
    // P43 (B7 v3.53) — push completion: every terminal transition of the
    // task ledger wakes the UI via a `task-update` event (never polling).
    {
        let h = app.clone();
        relay
            .tasks()
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .watch(Box::new(move |record: &everyaios_core::TaskRecord| {
                let _ = h.emit(
                    "task-update",
                    serde_json::to_value(record).unwrap_or_else(|_| serde_json::json!({})),
                );
            }));
    }
    relay.spawn();
    *state.chat_relay.lock().expect("chat_relay poisoned") = Some(relay);
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeStatus {
    vault: &'static str,
    sidecar: bool,
    persistence: &'static str,
}

#[tauri::command]
fn runtime_status(state: State<'_, AppState>) -> RuntimeStatus {
    let vault = if state.vault_unlocked.load(Ordering::Acquire) {
        "ready"
    } else {
        match everyaios_core::gate_mode(&everyaios_core::default_data_dir()) {
            "setup" | "wrap" => "setup",
            "unlock" => "locked",
            _ => "unknown",
        }
    };
    let persistence = state
        .boot_report
        .lock()
        .ok()
        .map(|r| if r.contains("EPHEMERAL VAULT") { "ephemeral" } else { "durable" })
        .unwrap_or("unknown");
    let sidecar = state
        .chat_relay
        .lock()
        .map(|relay| relay.is_some())
        .unwrap_or(false)
        && state
            .sidecar_activity_ms
            .lock()
            .ok()
            .and_then(|clock| clock.as_ref().cloned())
            .map(|clock| {
                let last = clock.load(Ordering::Relaxed);
                last > 0 && now_ms().saturating_sub(last) <= 30_000
            })
            .unwrap_or(false);
    RuntimeStatus { vault, sidecar, persistence }
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
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
// `chat_stream` is the IPC boundary: Tauri matches each argument BY NAME against
// the renderer's invoke (see ui/src/lib/tauri.ts). Folding the ten optionals into
// a single struct would flatten the contract and force a rename. The wide
// signature is intrinsic to a Tauri command, so suppress the lint deliberately.
#[allow(clippy::too_many_arguments)]
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
    primary_chief: Option<String>,
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
            primary_chief,
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
fn plan_respond(
    state: State<'_, AppState>,
    break_id: String,
    choice: String,
) -> Result<(), String> {
    let relay = state.chat_relay.lock().map_err(|e| e.to_string())?;
    let relay = relay
        .as_ref()
        .ok_or_else(|| "sidecar not connected".to_string())?;
    relay
        .respond_plan(&break_id, &choice)
        .map_err(|e| e.to_string())
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
fn session_totals(
    state: State<'_, AppState>,
) -> Result<Vec<everyaios_vault::SessionTotal>, String> {
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
        .retry_tool(&session_id, &stream_id, &tool_id, args, agent_id.as_deref())
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
fn vault_setup(
    state: State<'_, AppState>,
    passphrase: String,
) -> Result<serde_json::Value, String> {
    let r =
        everyaios_core::setup_vault_passphrase(&everyaios_core::default_data_dir(), &passphrase)
            .map_err(|e| e.to_string())?;
    let status = reopen_disk_vault(&state, &r.key)?;
    state.vault_unlocked.store(true, Ordering::Release);
    Ok(serde_json::json!({
        "ok": true,
        "origin": r.origin,
        "path": r.path,
        "needsSetup": false,
        "status": status,
    }))
}

#[tauri::command]
fn vault_unlock(
    state: State<'_, AppState>,
    passphrase: String,
) -> Result<serde_json::Value, String> {
    let r =
        everyaios_core::unlock_vault_passphrase(&everyaios_core::default_data_dir(), &passphrase)
            .map_err(|e| e.to_string())?;
    let status = reopen_disk_vault(&state, &r.key)?;
    state.vault_unlocked.store(true, Ordering::Release);
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
    vault
        .put_ui_session(&id, &payload)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn session_delete(state: State<'_, AppState>, session_id: String) -> Result<(), String> {
    let vault = state.vault.lock().map_err(|e| e.to_string())?;
    vault
        .delete_ui_session(&session_id)
        .map_err(|e| e.to_string())
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
        for rel in [
            "bin/coordinator",
            "bin/coordinator.exe",
            "coordinator",
            "coordinator.exe",
        ] {
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
                    let params = parsed
                        .get("params")
                        .cloned()
                        .unwrap_or(serde_json::json!({}));
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
    let mut boot_report =
        everyaios_core::boot(&args).unwrap_or_else(|e| format!("boot failed: {e}"));
    let guard = compiled_guard().clone();
    let data_dir = everyaios_core::default_data_dir();
    let resolved = everyaios_core::resolve_vault_key(&data_dir);
    // Bugfix 14 — persistence must never fail *silently* open. If the vault
    // cannot be opened on disk we fall back to an in-memory vault (chat keeps
    // working) but flag it loudly so the UI can warn that nothing will persist,
    // instead of letting the user believe their chat is durable.
    let mut vault_ephemeral = false;
    let mut vault_unlocked = false;
    let vault = match resolved {
        Ok(r) => match Vault::open(&data_dir.join("vault.db"), &r.key) {
            Ok(vault) => {
                vault_unlocked = true;
                vault
            }
            Err(e) => {
                // Keep a disposable vault only as a type-safe boot container;
                // it is locked from the UI and cannot be treated as durable.
                eprintln!("everyaios-desktop: vault open failed (persistence unavailable): {e}");
                vault_ephemeral = true;
                Vault::open_in_memory(&r.key).unwrap_or_else(|_| {
                    Vault::open_in_memory(&everyaios_core::default_vault_key())
                        .expect("in-memory vault")
                })
            }
        },
        Err(e) => {
            eprintln!("everyaios-desktop: vault key resolve failed (persistence unavailable): {e}");
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
            vault: Arc::clone(&vault),
            vault_unlocked: std::sync::atomic::AtomicBool::new(vault_unlocked),
            sidecar_activity_ms: Mutex::new(None),
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
            mcp_servers: Mutex::new(mcp_cmds::load_attached_servers()),
            mcp_live: Mutex::new(std::collections::HashMap::new()),
            mcp_remote_flows: Arc::new(Mutex::new(std::collections::HashMap::new())),
            mcp_remote_tokens: Arc::new(Mutex::new(std::collections::HashMap::new())),
            mcp_pending_calls: Mutex::new(std::collections::HashMap::new()),
            desktop: Mutex::new(desktop_cmds::DesktopSlot::default()),
            artifacts: Mutex::new(std::collections::HashMap::new()),
            openai_server: Mutex::new(Default::default()),
        })
        .invoke_handler(commands::handler())
        // P8.8: auto-updater (checks + downloads against the configured
        // endpoints; signing key is the release secret).
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            // Tray must be non-fatal: on systems without appindicator/tray
            // support the app should still start (just without a tray icon).
            if let Err(e) = boot::setup_tray(app.handle()) {
                eprintln!("everyaios-desktop: tray setup failed (continuing): {e}");
            }
            // J16: pre-spawn the coordinator + bind the unix control socket.
            pre_spawn_coordinator(app.handle().clone());
            #[cfg(unix)]
            serve_unix_control_channel(app.handle().clone());
            // P2.11 (E16): serve the WebMCP tool catalog over loopback HTTP.
            boot::spawn_webmcp_server();
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
