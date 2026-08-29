//! P7.5 (Guard-2) / J21 — the human-in-the-loop approval-card commands. Thin
//! wrappers over the shared `everyaios-core::GuardService` (tickets + J21
//! policy + estop + profile); the ticket lifecycle + single-use enforcement +
//! policy evaluation are tested in the crates, the shell just exposes the
//! cards, receipts, policy summary and estop to the UI.

use everyaios_core::PendingGuardCard;
use tauri::{AppHandle, State};

use crate::guard_window::{open_guard_window, GUARD_WINDOW_LABEL};
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
/// audit receipt) or `reject` (revokes + audit receipt). The card-bound nonce
/// is mandatory; the ticket id alone is not an approval capability.
///
/// F1 — consent surface: this command only accepts calls from the dedicated
/// `guard` window (the only surface that ever renders an approval card). The
/// main webview renders untrusted content (browser views, generative UI,
/// plugin views); if it could approve, a compromised renderer could draw a
/// fake card over a real ticket. The nonce prevents forgery; the window
/// check prevents deception.
#[tauri::command]
pub fn guard_respond(
    window: tauri::WebviewWindow,
    state: State<'_, AppState>,
    ticket_id: String,
    action: String,
    approval_nonce: String,
) -> Result<bool, String> {
    if window.label() != GUARD_WINDOW_LABEL {
        return Err(format!(
            "Guard-2 approvals only from the dedicated approval window ({GUARD_WINDOW_LABEL}); main renderer cannot approve"
        ));
    }
    let mut svc = state
        .guard_service
        .lock()
        .map_err(|e| e.to_string())?;
    match action.as_str() {
        "approve" => Ok(svc.approve_with_nonce(&ticket_id, &approval_nonce)),
        "reject" => Ok(svc.reject_with_nonce(&ticket_id, &approval_nonce)),
        other => Err(format!("unknown guard action: {other}")),
    }
}

/// Bring the dedicated Guard-2 approval window to the front (F1). The main
/// UI calls this when a pending ticket is waiting; the actual approve/reject
/// happens inside that window, never in the untrusted main renderer.
#[tauri::command]
pub fn guard_open_window(app: AppHandle) -> Result<(), String> {
    open_guard_window(&app).map_err(|e| e.to_string())
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

/// P11.5.7 — one serializable recent-action row (from the J5 audit ledger).
#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentAction {
    pub action: String,
    pub target: String,
    pub scope: String,
    pub time: String,
    pub status: String, // ok | warn | err | pending
}

/// P11.5.7 — the recent-actions log over the real J5 audit store (falls back
/// to the ticket/receipt trail when no NDJSON session log exists yet). This
/// replaces the hardcoded `ACTIONS` array in guard-panel.tsx.
#[tauri::command]
pub fn guard_activity(
    state: State<'_, AppState>,
    limit: Option<usize>,
) -> Result<Vec<RecentAction>, String> {
    use everyaios_audit::session_log::{list_session_ids, EventType, SessionLog};
    let limit = limit.unwrap_or(12).min(50);
    let mut rows: Vec<RecentAction> = Vec::new();

    // 1) The append-only NDJSON session logs (J5) are the source of truth
    //    when present — newest sessions first, newest events first.
    let base = everyaios_core::default_data_dir().join("audit");
    if let Ok(mut sessions) = list_session_ids(&base) {
        sessions.sort();
        'sessions: for sess in sessions.iter().rev() {
            if let Ok(log) = SessionLog::open(&base, sess) {
                if let Ok(mut events) = log.events() {
                    events.sort_by_key(|e| std::cmp::Reverse(e.ts_ms));
                    for ev in events {
                        let target = if ev.tool.is_empty() {
                            ev.event_type.as_str().to_string()
                        } else {
                            ev.tool.clone()
                        };
                        let status = match ev.event_type {
                            EventType::ToolStarted | EventType::ToolProposed => "pending",
                            EventType::PermissionGranted => "ok",
                            _ => "ok",
                        };
                        rows.push(RecentAction {
                            action: ev.event_type.as_str().to_string(),
                            target,
                            scope: format!("session {}", ev.session),
                            time: ev.ts_ms.to_string(),
                            status: status.into(),
                        });
                        if rows.len() >= limit {
                            break 'sessions;
                        }
                    }
                }
            }
        }
    }

    // 2) Fallback: the in-memory approve/reject receipt trail (guard_receipts).
    if rows.is_empty() {
        let svc = state
            .guard_service
            .lock()
            .map_err(|e| e.to_string())?;
        use everyaios_guard::ReceiptAction;
        for r in svc.receipts().iter().rev().take(limit) {
            let approved = r.action == ReceiptAction::Approve;
            rows.push(RecentAction {
                action: format!("{:?}", r.action),
                target: r.operation.clone(),
                scope: format!("tool {}", r.tool_id),
                time: r.ts_ms.to_string(),
                status: if approved { "ok" } else { "err" }.into(),
            });
        }
    }
    Ok(rows)
}

/// P11.5.7 — one permissions-matrix cell (capability × scope decision).
#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MatrixCell {
    pub capability: String,
    pub scope: String,
    pub decision: String, // allow | ask | block | off
}

/// P11.5.7 — the live 5×5 permissions matrix from the loaded
/// `~/.everyaios/permissions.toml` (`PermissionsPolicy::evaluate` over the
/// canonical capability×scope grid). Replaces the hardcoded `MATRIX` array in
/// guard-panel.tsx.
#[tauri::command]
pub fn guard_permissions_matrix(
    state: State<'_, AppState>,
) -> Result<Vec<MatrixCell>, String> {
    use everyaios_guard::{Operation, PolicyAction};
    let svc = state
        .guard_service
        .lock()
        .map_err(|e| e.to_string())?;
    let policy = svc.policy();

    // Capabilities (rows) × scopes (columns), matching the UI's 5×5 grid.
    let capabilities = ["read", "write", "execute", "network", "browser"];
    let scopes = ["workspace", "home", "shell", "external", "browser"];
    let mut cells = Vec::with_capacity(capabilities.len() * scopes.len());
    for cap in capabilities {
        for scope in scopes {
            // Reads are read-only and auto-approved by the executor (they are
            // never policy-gated — there is no read `Operation` variant). The
            // matrix must show that truthfully as `allow`, not borrow the
            // write policy (which previously made read look like it required
            // approval when it does not).
            if cap == "read" {
                cells.push(MatrixCell {
                    capability: cap.into(),
                    scope: scope.into(),
                    decision: "allow".into(),
                });
                continue;
            }
            let op = match (cap, scope) {
                ("write", _) => Operation::GenericWrite,
                ("execute", "shell") => Operation::TerminalShell { destructive: true },
                ("execute", _) => Operation::TerminalShell { destructive: false },
                ("network", _) => Operation::ExternalNetwork { new_domain: true },
                ("browser", _) => Operation::WebAction,
                _ => Operation::GenericWrite,
            };
            let decision = match policy.evaluate(&op) {
                PolicyAction::Allow => "allow",
                PolicyAction::Ask => "ask",
                PolicyAction::Block => "block",
            };
            cells.push(MatrixCell {
                capability: cap.into(),
                scope: scope.into(),
                decision: decision.into(),
            });
        }
    }
    Ok(cells)
}
