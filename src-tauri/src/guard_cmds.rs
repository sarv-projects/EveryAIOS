//! P7.5 (Guard-2) / J21 — the human-in-the-loop approval-card commands. Thin
//! wrappers over the shared `everyaios-core::GuardService` (tickets + J21
//! policy + estop + profile); the ticket lifecycle + single-use enforcement +
//! policy evaluation are tested in the crates, the shell just exposes the
//! cards, receipts, policy summary and estop to the UI.

use everyaios_core::PendingGuardCard;
use tauri::State;

use crate::AppState;

/// The open cards waiting on a human decision (Guard-2 card stack). Each card
/// carries the full decision package (goal, diff, paths, script lines, env,
/// network destinations, web action) so the user can judge it at a glance.
#[tauri::command]
pub fn guard_tickets(state: State<'_, AppState>) -> Result<Vec<PendingGuardCard>, String> {
    let svc = state
        .guard_service
        .lock()
        .map_err(|e| e.to_string())?;
    Ok(svc.pending())
}

/// Record a human decision on a ticket: `approve` (records Human source +
/// audit receipt) or `reject` (revokes + audit receipt). Consumption still
/// happens via the executor's `guard/use` call, which enforces args/single-use.
#[tauri::command]
pub fn guard_respond(
    state: State<'_, AppState>,
    ticket_id: String,
    action: String,
) -> Result<bool, String> {
    let mut svc = state
        .guard_service
        .lock()
        .map_err(|e| e.to_string())?;
    match action.as_str() {
        "approve" => Ok(svc.approve(&ticket_id)),
        "reject" => Ok(svc.reject(&ticket_id)),
        other => Err(format!("unknown guard action: {other}")),
    }
}

/// The append-only approve/reject audit receipts (P7.5 — "approval/denial
/// audit logging with receipt").
#[tauri::command]
pub fn guard_receipts(
    state: State<'_, AppState>,
) -> Result<Vec<everyaios_guard::GuardReceipt>, String> {
    let svc = state
        .guard_service
        .lock()
        .map_err(|e| e.to_string())?;
    Ok(svc.receipts())
}

/// The current Guard-2 policy + profile + estop summary (Settings guard panel).
#[tauri::command]
pub fn guard_policy(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let mut svc = state
        .guard_service
        .lock()
        .map_err(|e| e.to_string())?;
    svc.handle("guard/policy", &serde_json::json!({}))
        .map_err(|e| e.to_string())
}

/// Pull (estop) or reset the global emergency stop. `estop` blocks every
/// subsequent privileged action until reset.
#[tauri::command]
pub fn guard_estop(
    state: State<'_, AppState>,
    pulled: bool,
) -> Result<bool, String> {
    let svc = state
        .guard_service
        .lock()
        .map_err(|e| e.to_string())?;
    if pulled {
        svc.estop().pull();
    } else {
        svc.estop().reset();
    }
    Ok(svc.estop().is_pulled())
}
