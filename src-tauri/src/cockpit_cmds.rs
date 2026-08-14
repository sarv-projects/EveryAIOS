//! P3.2 — cockpit / ambient flight-deck Tauri commands (H2, doc 33 §9.5).
//!
//! Thin wrappers over `everyaios_audit::cockpit`: the live in-memory state
//! lives in `AppState`, the coordinator/sidecar feeds it (the `cockpit_*`
//! feed commands are the seam), and the UI polls `cockpit_snapshot`. The
//! control-channel writes (`agent/undo`, `agent/interrupt-response`) mirror
//! the existing `agent/stop` pattern.

use everyaios_audit::cockpit::{AgentCard, CockpitState};
use tauri::{AppHandle, Manager, State};

use crate::AppState;

/// Snapshot of the whole cockpit (agent cards + open interrupts + quiet
/// flag) — the UI polls this for the flight deck.
#[tauri::command]
pub fn cockpit_snapshot(state: State<'_, AppState>) -> CockpitState {
    state.cockpit.lock().expect("cockpit poisoned").clone()
}

/// Feed seam: record a live agent action (the coordinator's tool calls land
/// here via the control channel; also used by tests/demo feeds).
#[tauri::command]
pub fn cockpit_activity(
    state: State<'_, AppState>,
    agent_id: String,
    tool: String,
    summary: String,
) -> Result<(), String> {
    let ts = now_ms();
    state
        .cockpit
        .lock()
        .expect("cockpit poisoned")
        .agent_action(ts, agent_id, tool, summary);
    Ok(())
}

/// Feed seam: update an agent's token counters.
#[tauri::command]
pub fn cockpit_tokens(
    state: State<'_, AppState>,
    agent_id: String,
    tokens_in: u64,
    tokens_out: u64,
) -> Result<(), String> {
    let ok = state
        .cockpit
        .lock()
        .expect("cockpit poisoned")
        .agent_tokens(&agent_id, tokens_in, tokens_out);
    if ok {
        Ok(())
    } else {
        Err(format!("unknown agent: {agent_id}"))
    }
}

/// Quiet mode: collapse the cockpit to a single-sentence tray status. Turns
/// the tray tooltip into the status line and hides the window (the tray's
/// Show item restores it). `status` overrides the auto-generated line.
#[tauri::command]
pub fn cockpit_quiet(
    app: AppHandle,
    state: State<'_, AppState>,
    quiet: bool,
    status: Option<String>,
) -> Result<(), String> {
    {
        let mut s = state.cockpit.lock().expect("cockpit poisoned");
        s.quiet = quiet;
    }
    let line = match status {
        Some(s) => s,
        None => state
            .cockpit
            .lock()
            .expect("cockpit poisoned")
            .quiet_status(now_ms()),
    };
    if let Some(tray) = app.tray_by_id("main-tray") {
        let tooltip = if quiet { Some(line.clone()) } else { None };
        tray.set_tooltip(tooltip).map_err(|e| e.to_string())?;
    }
    if quiet {
        if let Some(win) = app.get_webview_window("main") {
            let _ = win.hide();
        }
    }
    Ok(())
}

/// UNDO: JSON-RPC `agent/undo` over the unix control channel (revert last
/// action) + mirror into the cockpit state.
#[cfg(unix)]
#[tauri::command]
pub fn agent_undo(state: State<'_, AppState>, session_id: String) -> Result<(), String> {
    let cfg = everyaios_core::Config::load().unwrap_or_default();
    let sock = cfg.resolved_socket_path();
    let msg = serde_json::json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "agent/undo",
        "params": { "sessionId": session_id },
    });
    let payload = serde_json::to_vec(&msg).map_err(|e| e.to_string())?;
    everyaios_ipc::socket::request(&sock, &payload).map_err(|e| e.to_string())?;
    state
        .cockpit
        .lock()
        .expect("cockpit poisoned")
        .undo(&session_id);
    Ok(())
}

#[cfg(not(unix))]
#[tauri::command]
pub fn agent_undo(_state: State<'_, AppState>, _session_id: String) -> Result<(), String> {
    Err("agent/undo requires the unix control channel".into())
}

/// Answer a circuit-break MCQ interrupt card: record the choice + forward it
/// to the coordinator over the control channel (`agent/interrupt-response`).
#[cfg(unix)]
#[tauri::command]
pub fn interrupt_respond(
    state: State<'_, AppState>,
    interrupt_id: String,
    choice: usize,
) -> Result<(), String> {
    let chosen = {
        let mut s = state.cockpit.lock().expect("cockpit poisoned");
        s.respond_interrupt(&interrupt_id, choice)
            .ok_or_else(|| format!("unknown or already-answered interrupt: {interrupt_id}"))?
    };
    let cfg = everyaios_core::Config::load().unwrap_or_default();
    let sock = cfg.resolved_socket_path();
    let msg = serde_json::json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "agent/interrupt-response",
        "params": { "interruptId": interrupt_id, "choice": choice, "chosen": chosen },
    });
    let payload = serde_json::to_vec(&msg).map_err(|e| e.to_string())?;
    everyaios_ipc::socket::request(&sock, &payload).map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(not(unix))]
#[tauri::command]
pub fn interrupt_respond(
    _state: State<'_, AppState>,
    _interrupt_id: String,
    _choice: usize,
) -> Result<(), String> {
    Err("interrupt response requires the unix control channel".into())
}

/// Feed seam: upsert a full agent card (coordinator registration).
#[tauri::command]
pub fn cockpit_upsert_agent(
    state: State<'_, AppState>,
    agent_id: String,
    label: String,
    model: String,
    provider: String,
) -> Result<(), String> {
    let card = AgentCard::new(agent_id, label, model, provider, now_ms());
    state
        .cockpit
        .lock()
        .expect("cockpit poisoned")
        .upsert_agent(card);
    Ok(())
}

fn now_ms() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}
