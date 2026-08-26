//! P43 (B7 v3.53) — detached-work task ledger commands.
//!
//! Thin wrappers over the shared `everyaios-core::TaskLedger` (BackgroundTaskRecord
//! lifecycle `queued → running → terminal`, push completion, lost-state grace,
//! 7-day retention). The ledger state machine is tested in the crates; this
//! module is the shell surface the activity rail / H19 progress panel calls.
//!
//! Push completion: the ledger fires `task-update` events on every terminal
//! transition (registered at `connect_chat_relay` boot) — the UI is woken,
//! never polled.

use everyaios_core::{TaskKind, TaskLedger};
use serde_json::Value;
use tauri::State;

use crate::AppState;

/// Clone the shared task-ledger handle through the relay (single source of
/// truth — the coordinator drives the same instance over `tasks/*`).
fn svc(
    state: &State<'_, AppState>,
) -> Result<std::sync::Arc<std::sync::Mutex<TaskLedger>>, String> {
    let relay = state.chat_relay.lock().map_err(|e| e.to_string())?;
    let relay = relay
        .as_ref()
        .ok_or_else(|| "sidecar not connected — task ledger not ready".to_string())?;
    Ok(relay.tasks())
}

/// The full task list (activity rail / H19). `status` optionally filters:
/// `queued` / `running` / `terminal` / omitted = all.
#[tauri::command]
pub fn tasks_list(state: State<'_, AppState>, status: Option<String>) -> Result<Value, String> {
    let handle = svc(&state)?;
    let mut ledger = handle.lock().map_err(|e| e.to_string())?;
    let params = serde_json::json!({ "status": status });
    ledger.handle("tasks/list", &params)
}

/// One task record.
#[tauri::command]
pub fn tasks_show(state: State<'_, AppState>, id: String) -> Result<Value, String> {
    let handle = svc(&state)?;
    let mut ledger = handle.lock().map_err(|e| e.to_string())?;
    ledger.handle("tasks/show", &serde_json::json!({ "id": id }))
}

/// Cancel a queued or running task.
#[tauri::command]
pub fn tasks_cancel(state: State<'_, AppState>, id: String) -> Result<Value, String> {
    let handle = svc(&state)?;
    let mut ledger = handle.lock().map_err(|e| e.to_string())?;
    ledger.handle("tasks/cancel", &serde_json::json!({ "id": id }))
}

/// Retry a terminal task (raises a fresh record at the next fenced generation;
/// the old record stays for audit).
#[tauri::command]
pub fn tasks_retry(state: State<'_, AppState>, id: String) -> Result<Value, String> {
    let handle = svc(&state)?;
    let mut ledger = handle.lock().map_err(|e| e.to_string())?;
    ledger.handle("tasks/retry", &serde_json::json!({ "id": id }))
}

/// Raise a new task record (automation job, subagent spawn, ACP spawn, CLI
/// run — the "every detached run raises a record" entry point).
#[tauri::command]
pub fn tasks_enqueue(
    state: State<'_, AppState>,
    kind: String,
    title: String,
    requester: Option<String>,
) -> Result<Value, String> {
    let handle = svc(&state)?;
    let mut ledger = handle.lock().map_err(|e| e.to_string())?;
    let kind: TaskKind =
        serde_json::from_value(serde_json::json!(kind)).map_err(|e| format!("bad kind: {e}"))?;
    ledger.handle(
        "tasks/enqueue",
        &serde_json::json!({ "kind": kind, "title": title, "requester": requester }),
    )
}

/// Mark the task running (queued → running, stamps the start + heartbeat).
#[tauri::command]
pub fn tasks_start(state: State<'_, AppState>, id: String) -> Result<Value, String> {
    let handle = svc(&state)?;
    let mut ledger = handle.lock().map_err(|e| e.to_string())?;
    ledger.handle("tasks/start", &serde_json::json!({ "id": id }))
}

/// Report completion: `ok: true` → succeeded, `ok: false` → failed (with the
/// honest error string). Push-completion fires on this transition.
#[tauri::command]
pub fn tasks_complete(
    state: State<'_, AppState>,
    id: String,
    ok: bool,
    error: Option<String>,
) -> Result<Value, String> {
    let handle = svc(&state)?;
    let mut ledger = handle.lock().map_err(|e| e.to_string())?;
    ledger.handle(
        "tasks/complete",
        &serde_json::json!({ "id": id, "ok": ok, "error": error }),
    )
}

/// Maintenance sweep (P43.4): prune terminal records past the 7-day retention
/// and mark grace-expired running tasks lost. Returns `{ pruned, lost }`.
#[tauri::command]
pub fn tasks_sweep(state: State<'_, AppState>) -> Result<Value, String> {
    let handle = svc(&state)?;
    let mut ledger = handle.lock().map_err(|e| e.to_string())?;
    let reaped = ledger.handle("tasks/reap", &serde_json::json!({}))?;
    let pruned = ledger.handle("tasks/prune", &serde_json::json!({}))?;
    Ok(serde_json::json!({
        "lost": reaped.get("lost").cloned().unwrap_or(Value::Null),
        "pruned": pruned.get("pruned").cloned().unwrap_or(Value::Null),
    }))
}
