//! EveryAIOS desktop shell — Tauri v2 backend (tasks P0.2).
//!
//! The shell is deliberately thin: every capability lives in the
//! `everyaios-*` crates (core, vault, guard, audit, ipc). This crate wires
//! them to the UI as Tauri commands + events, and owns the system tray.

use std::path::PathBuf;
use std::process::{ChildStdin, ChildStdout};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

mod cockpit_cmds;
mod office_cmds;
mod replay_cmds;

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
}

/// Monotonic stream-id source for `chat_stream` calls.
static STREAM_COUNTER: AtomicU64 = AtomicU64::new(1);

/// Event name the UI listens to for chat stream updates.
pub const CHAT_EVENT: &str = "chat-event";

/// Wire a live coordinator link into the chat relay and store it in state.
/// The relay's consumer loop forwards every `chat/*` notification from the
/// sidecar to the UI as a `chat-event` (P1.4: token deltas → core → Tauri
/// events → UI).
fn connect_chat_relay(
    app: &AppHandle,
    state: &AppState,
    link: everyaios_core::SidecarLink<ChildStdin, ChildStdout>,
) {
    let handle = app.clone();
    let relay = everyaios_core::ChatRelay::new(link, Arc::clone(&state.vault), move |ev| {
        // Fire-and-forget: never let a UI emit failure break the relay.
        let _ = handle.emit(CHAT_EVENT, ev);
    });
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
            agent_id: None,
            provider: provider.unwrap_or_else(|| "nvidia".into()),
            model: model.unwrap_or_else(|| "meta/llama".into()),
        })
        .map_err(|e| e.to_string())?;
    Ok(stream_id)
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

#[tauri::command]
fn chat_cancel(state: State<'_, AppState>, stream_id: String) -> Result<(), String> {
    // Abort signal: UI → Rust → sidecar (chat/cancel) → engine/provider.
    let relay = state.chat_relay.lock().map_err(|e| e.to_string())?;
    let relay = relay
        .as_ref()
        .ok_or_else(|| "sidecar not connected".to_string())?;
    relay.cancel(&stream_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn probe_vault() -> Result<String, String> {
    // Security (P0.2 stub): the path is NOT webview-controlled — it is pinned
    // to the data dir. Arbitrary path handling arrives with P1.1 key
    // management (vault path comes from config, never from the frontend).
    let path = everyaios_core::default_data_dir().join("vault.db");
    let key = everyaios_core::default_vault_key();
    let vault = everyaios_vault::Vault::open(&path, &key).map_err(|e| e.to_string())?;
    Ok(vault.status())
}

/// Locate the coordinator sidecar binary. `EVERYAIOS_COORDINATOR_BIN` wins;
/// otherwise the standard build output path is probed from the workspace.
fn locate_coordinator_bin() -> Option<PathBuf> {
    if let Ok(p) = std::env::var("EVERYAIOS_COORDINATOR_BIN") {
        let p = PathBuf::from(p);
        if p.is_file() {
            return Some(p);
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
/// on a process spawn: ~200ms perceived cold start). Non-fatal: the app runs
/// fine without the sidecar; the supervisor just isn't started.
fn pre_spawn_coordinator() {
    let Some(bin) = locate_coordinator_bin() else {
        eprintln!("everyaios-desktop: coordinator binary not found — pre-spawn skipped");
        return;
    };
    std::thread::spawn(move || {
        match everyaios_core::start_supervisor(bin) {
            Ok(mut supervisor) => {
                if let Err(e) = supervisor.wait_or_restart() {
                    eprintln!("everyaios-desktop: supervisor ended: {e}");
                }
            }
            Err(e) => eprintln!("everyaios-desktop: supervisor create failed: {e}"),
        }
    });
}

/// J16: bind the UNIX-domain socket control channel (zero port collisions —
/// no TCP port is ever allocated for local IPC). Serves a minimal framed
/// JSON-RPC responder on a background thread; the full dispatcher arrives with
/// the coordinator integration.
#[cfg(unix)]
fn serve_unix_control_channel() {
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
                let _ = server.serve_connection(stream, |payload| {
                    let parsed: serde_json::Value =
                        serde_json::from_slice(&payload).unwrap_or_default();
                    let reply = serde_json::json!({
                        "jsonrpc": "2.0",
                        "id": parsed.get("id"),
                        "result": { "transport": "unix-socket", "ok": true },
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
    let boot_report = everyaios_core::boot(&args).unwrap_or_else(|e| format!("boot failed: {e}"));
    let guard = compiled_guard().clone();
    let vault = everyaios_vault::Vault::open(
        &everyaios_core::default_data_dir().join("vault.db"),
        &everyaios_core::default_vault_key(),
    )
    .unwrap_or_else(|e| {
        // Boot already reported the failure; keep a fresh in-memory vault so
        // the shell stays responsive (nothing persists).
        eprintln!("everyaios-desktop: vault open failed (using in-memory): {e}");
        Vault::open_in_memory(&everyaios_core::default_vault_key()).expect("in-memory vault")
    });
    let vault = Arc::new(Mutex::new(vault));

    tauri::Builder::default()
        .manage(AppState {
            boot_report: Mutex::new(boot_report),
            guard,
            vault,
            chat_relay: Mutex::new(None),
            replay_dir: everyaios_core::default_data_dir(),
            cockpit: Arc::new(Mutex::new(Default::default())),
        })
        .invoke_handler(tauri::generate_handler![
            version,
            core_boot_report,
            scan_text,
            probe_vault,
            chat_stream,
            chat_cancel,
            usage_snapshot,
            replay_cmds::replay_sessions,
            replay_cmds::replay_timeline,
            replay_cmds::replay_screenshot,
            replay_cmds::watch_events,
            replay_cmds::agent_stop,
            cockpit_cmds::cockpit_snapshot,
            cockpit_cmds::cockpit_activity,
            cockpit_cmds::cockpit_tokens,
            cockpit_cmds::cockpit_quiet,
            cockpit_cmds::agent_undo,
            cockpit_cmds::interrupt_respond,
            cockpit_cmds::cockpit_upsert_agent,
            xlsx_cmds::xlsx_open,
            office_cmds::docx_open,
            office_cmds::pptx_open,
            office_cmds::pdf_open
        ])
        .setup(|app| {
            // Tray must be non-fatal: on systems without appindicator/tray
            // support the app should still start (just without a tray icon).
            if let Err(e) = setup_tray(app.handle()) {
                eprintln!("everyaios-desktop: tray setup failed (continuing): {e}");
            }
            // J16: pre-spawn the coordinator + bind the unix control socket.
            pre_spawn_coordinator();
            #[cfg(unix)]
            serve_unix_control_channel();
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running EveryAIOS");
}

/// System tray (P0.2 task 17): status icon + Show/Quit menu.
fn setup_tray(app: &tauri::AppHandle) -> tauri::Result<()> {
    use tauri::menu::{Menu, MenuItem};
    use tauri::tray::TrayIconBuilder;

    let show = MenuItem::with_id(app, "show", "Show EveryAIOS", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;

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
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;

    Ok(())
}
