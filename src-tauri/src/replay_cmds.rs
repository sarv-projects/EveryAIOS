//! P3.1 — replay/audit Tauri commands. Thin wrappers over the
//! `everyaios-audit` replay store + the unix control channel; all logic and
//! tests live in the crates, the shell just exposes them to the UI.

use everyaios_audit::replay::{ReplayEvent, ReplayStore, Segment, Timeline};
use tauri::State;

use crate::AppState;

/// The replay store rooted at the app's data dir.
pub fn replay_store(state: &AppState) -> ReplayStore {
    ReplayStore::new(state.replay_dir.clone())
}

/// Searchable sessions list (P3.1): segments filtered by document/tab id.
#[tauri::command]
pub fn replay_sessions(
    state: State<'_, AppState>,
    query: Option<String>,
) -> Result<Vec<Segment>, String> {
    replay_store(&state)
        .search_sessions(query.as_deref().unwrap_or(""))
        .map_err(|e| e.to_string())
}

/// Full scrubber data for one document: segment + events + screenshot steps.
#[tauri::command]
pub fn replay_timeline(
    state: State<'_, AppState>,
    document_id: String,
) -> Result<Timeline, String> {
    replay_store(&state)
        .timeline(&document_id)
        .map_err(|e| e.to_string())
}

/// A step's screenshot as a base64 `data:image/jpeg;base64,` URL (or null).
#[tauri::command]
pub fn replay_screenshot(
    state: State<'_, AppState>,
    document_id: String,
    step: u64,
) -> Result<Option<String>, String> {
    let store = replay_store(&state);
    let path = match store.screenshot_path(&document_id, step) {
        Some(p) => p,
        None => return Ok(None),
    };
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    Ok(Some(format!(
        "data:image/jpeg;base64,{}",
        base64_encode(&bytes)
    )))
}

/// Watch mode (P3.1): live tail of a document's stream since `since_seq`.
#[tauri::command]
pub fn watch_events(
    state: State<'_, AppState>,
    document_id: String,
    since_seq: u64,
) -> Result<Vec<ReplayEvent>, String> {
    replay_store(&state)
        .events_since(&document_id, since_seq)
        .map_err(|e| e.to_string())
}

/// Stop button (P3.1): JSON-RPC `agent/stop` over the unix control channel.
/// The coordinator/sidecar consumes it and kills the agent loop.
#[cfg(unix)]
#[tauri::command]
pub fn agent_stop(session_id: String) -> Result<(), String> {
    let cfg = everyaios_core::Config::load().unwrap_or_default();
    let sock = cfg.resolved_socket_path();
    let msg = serde_json::json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "agent/stop",
        "params": { "sessionId": session_id },
    });
    let payload = serde_json::to_vec(&msg).map_err(|e| e.to_string())?;
    everyaios_ipc::socket::request(&sock, &payload).map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(not(unix))]
#[tauri::command]
pub fn agent_stop(_session_id: String) -> Result<(), String> {
    Err("agent/stop requires the unix control channel".into())
}

fn base64_encode(bytes: &[u8]) -> String {
    use base64::Engine;
    base64::engine::general_purpose::STANDARD.encode(bytes)
}
