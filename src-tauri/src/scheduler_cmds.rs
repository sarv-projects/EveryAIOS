//! P6.4 (B7) / P71.3d — scheduled-task commands over the **trigger plane**.
//! Thin wrappers over the shared `everyaios-core::SchedulerService` (job
//! registry, cron/interval/event/webhook/window triggers, battery/misfire/
//! admission policy, nudge sentinels). The shell exposes the job list,
//! create/delete/enable/pause/resume/run-now, battery state, event fires and
//! nudge suggestions to the UI; execution is the Work kernel's business
//! (`ARCH/AUTOMATION.md` §9) — no leases, retries or run ledger live here.

use everyaios_core::SchedulerService;
use serde_json::Value;
use std::sync::{Arc, Mutex};
use tauri::State;

use crate::AppState;

/// P65.4 — share the one scheduler handle with the Settings envelope.
/// Same source as every command above (the relay-owned service); a second
/// scheduler is never constructed here.
pub(crate) fn scheduler_handle(state: &AppState) -> Result<Arc<Mutex<SchedulerService>>, String> {
    let relay = state.chat_relay.lock().map_err(|e| e.to_string())?;
    let relay = relay
        .as_ref()
        .ok_or_else(|| "sidecar not connected — scheduler service not ready".to_string())?;
    Ok(relay.scheduler())
}

/// Clone the shared scheduler service handle through the relay (single source
/// of truth — the coordinator drives the same instance over `scheduler/*`).
/// The returned `Arc` is independent of the relay guard, so commands can lock
/// it without lifetime gymnastics.
fn svc(
    state: &State<'_, AppState>,
) -> Result<std::sync::Arc<std::sync::Mutex<SchedulerService>>, String> {
    let relay = state.chat_relay.lock().map_err(|e| e.to_string())?;
    let relay = relay
        .as_ref()
        .ok_or_else(|| "sidecar not connected — scheduler service not ready".to_string())?;
    Ok(relay.scheduler())
}

fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// The full job list + battery state (the H14 scheduled-tasks surface).
#[tauri::command]
pub fn scheduler_list(state: State<'_, AppState>) -> Result<Value, String> {
    let handle = svc(&state)?;
    let svc = handle.lock().map_err(|e| e.to_string())?;
    let jobs: Vec<Value> = svc
        .list()
        .iter()
        .map(|j| serde_json::to_value(j).unwrap_or(Value::Null))
        .collect();
    Ok(serde_json::json!({ "jobs": jobs, "onBattery": svc.on_battery() }))
}

/// Create (or replace) a scheduled job. `trigger` is the `TriggerSpec` serde
/// shape (`{"type":"cron","expr":"0 8 * * *"}`, `interval`, `event`, or
/// `webhook`); `steps` are `AutomationStep`s; `policy` is optional.
#[tauri::command]
pub fn scheduler_create(
    state: State<'_, AppState>,
    id: String,
    name: String,
    session_id: String,
    trigger: Value,
    steps: Value,
    policy: Option<Value>,
) -> Result<bool, String> {
    let handle = svc(&state)?;
    let mut svc = handle.lock().map_err(|e| e.to_string())?;
    let trigger = serde_json::from_value(trigger).map_err(|e| format!("bad trigger: {e}"))?;
    let steps = serde_json::from_value(steps).map_err(|e| format!("bad steps: {e}"))?;
    let policy = policy
        .map(|p| serde_json::from_value(p).map_err(|e| format!("bad policy: {e}")))
        .transpose()?;
    svc.upsert(id, name, session_id, trigger, steps, policy, now_secs());
    Ok(true)
}

/// Delete a job.
#[tauri::command]
pub fn scheduler_delete(state: State<'_, AppState>, id: String) -> Result<bool, String> {
    let handle = svc(&state)?;
    let mut svc = handle.lock().map_err(|e| e.to_string())?;
    Ok(svc.delete(&id))
}

/// Enable/disable a job.
#[tauri::command]
pub fn scheduler_enable(
    state: State<'_, AppState>,
    id: String,
    enabled: bool,
) -> Result<bool, String> {
    let handle = svc(&state)?;
    let mut svc = handle.lock().map_err(|e| e.to_string())?;
    svc.set_enabled(&id, enabled, now_secs())
        .map_err(|e| e.to_string())?;
    Ok(true)
}

/// Pause every job bound to a chat session (delete-chat cascade).
#[tauri::command]
pub fn scheduler_pause_session(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<u32, String> {
    let handle = svc(&state)?;
    let mut svc = handle.lock().map_err(|e| e.to_string())?;
    Ok(svc.pause_session(&session_id) as u32)
}

/// HITL pause (trigger-plane flag: stop firing; Work owns execution waits).
#[tauri::command]
pub fn scheduler_pause(
    state: State<'_, AppState>,
    id: String,
) -> Result<bool, String> {
    let handle = svc(&state)?;
    let mut svc = handle.lock().map_err(|e| e.to_string())?;
    svc.pause(&id).map_err(|e| e.to_string())?;
    Ok(true)
}

/// Resume a paused job.
#[tauri::command]
pub fn scheduler_resume(state: State<'_, AppState>, id: String) -> Result<bool, String> {
    let handle = svc(&state)?;
    let mut svc = handle.lock().map_err(|e| e.to_string())?;
    svc.resume(&id, now_secs()).map_err(|e| e.to_string())?;
    Ok(true)
}

/// Force a job into the next due pass (the UI's "Run now" button).
#[tauri::command]
pub fn scheduler_run_now(state: State<'_, AppState>, id: String) -> Result<bool, String> {
    let handle = svc(&state)?;
    let mut svc = handle.lock().map_err(|e| e.to_string())?;
    svc.handle(
        "scheduler/run_now",
        &serde_json::json!({ "id": id, "now": now_secs() }),
    )
    .map_err(|e| e.to_string())?;
    Ok(true)
}

/// Report the device battery state (battery-aware scheduling suppresses jobs
/// with `suppress_on_battery` while on battery).
#[tauri::command]
pub fn scheduler_battery(state: State<'_, AppState>, on_battery: bool) -> Result<bool, String> {
    let handle = svc(&state)?;
    let mut svc = handle.lock().map_err(|e| e.to_string())?;
    svc.set_battery(on_battery);
    // J16 — mirror to the shared AppState flag so the storage commands (heavy
    // scans) defer from the same OS power event.
    state
        .battery
        .store(on_battery, std::sync::atomic::Ordering::Relaxed);
    Ok(true)
}

/// Fire an event trigger (CI build-fail / test-regression / repo-change /
/// ticket-assign / telemetry-threshold) with scope+frequency policy.
#[tauri::command]
pub fn scheduler_fire_event(
    state: State<'_, AppState>,
    kind: String,
    payload: Value,
) -> Result<Vec<String>, String> {
    let handle = svc(&state)?;
    let mut svc = handle.lock().map_err(|e| e.to_string())?;
    let kind =
        serde_json::from_value(serde_json::json!(kind)).map_err(|e| format!("bad kind: {e}"))?;
    Ok(svc.fire_event(kind, &payload, now_secs()))
}

/// Webhook ingress (F11 loopback): validate path + required keys, queue jobs.
#[tauri::command]
pub fn scheduler_fire_webhook(
    state: State<'_, AppState>,
    path: String,
    body: Value,
    token: Option<String>,
) -> Result<Vec<String>, String> {
    let handle = svc(&state)?;
    let mut svc = handle.lock().map_err(|e| e.to_string())?;
    svc.fire_webhook(&path, &body, now_secs(), token.as_deref())
}

/// Nudge sentinels: repeating-pattern schedule suggestions (H14 nudge cards).
#[tauri::command]
pub fn scheduler_nudges(state: State<'_, AppState>) -> Result<Value, String> {
    let handle = svc(&state)?;
    let svc = handle.lock().map_err(|e| e.to_string())?;
    Ok(serde_json::to_value(svc.nudges()).unwrap_or(Value::Null))
}

/// Record a goal observation (feeds the nudge sentinels — from chat/session).
#[tauri::command]
pub fn scheduler_nudge(
    state: State<'_, AppState>,
    goal: String,
    ts: Option<u64>,
) -> Result<bool, String> {
    let handle = svc(&state)?;
    let mut svc = handle.lock().map_err(|e| e.to_string())?;
    svc.record_nudge(&goal, ts.unwrap_or_else(now_secs));
    Ok(true)
}

/// P51.32a — a job's durable notepad (the only continuity the trigger plane
/// keeps; run results live in the Event Log, `I3`).
#[tauri::command]
pub fn scheduler_notepad_get(
    state: State<'_, AppState>,
    id: String,
) -> Result<Value, String> {
    let handle = svc(&state)?;
    let svc = handle.lock().map_err(|e| e.to_string())?;
    Ok(svc
        .notepad(&id)
        .map(|n| serde_json::json!({ "notepad": n }))
        .unwrap_or(Value::Null))
}

/// P51.32a — append one line to a job's durable notepad.
#[tauri::command]
pub fn scheduler_notepad_append(
    state: State<'_, AppState>,
    id: String,
    line: String,
) -> Result<bool, String> {
    let handle = svc(&state)?;
    let mut svc = handle.lock().map_err(|e| e.to_string())?;
    Ok(svc.append_notepad(&id, &line))
}

/// P51.32e — open (unacked-first) incidents ledger.
#[tauri::command]
pub fn scheduler_incidents(state: State<'_, AppState>) -> Result<Value, String> {
    let handle = svc(&state)?;
    let svc = handle.lock().map_err(|e| e.to_string())?;
    Ok(serde_json::to_value(svc.list_incidents()).unwrap_or(Value::Null))
}

/// P51.32e — acknowledge one incident (explicit only, no auto-clear).
#[tauri::command]
pub fn scheduler_incident_ack(state: State<'_, AppState>, id: String) -> Result<bool, String> {
    let handle = svc(&state)?;
    let mut svc = handle.lock().map_err(|e| e.to_string())?;
    Ok(svc.ack_incident(&id))
}

/// P51.32f — read-only trigger-plane health (missed schedule fires, registry
/// depth). Run-level health belongs to the Work kernel / Event Log.
///
/// P71.3f — the doctor also reads **agent readiness** (`ARCH/AUTOMATION.md` §9:
/// a run-level failure is readiness + binding policy, never a global "the
/// model"): a firing whose engine is not ready is the first thing a support
/// pass needs to see, so it is a check like any other, with the states counted
/// rather than guessed.
#[tauri::command]
pub fn scheduler_doctor(state: State<'_, AppState>) -> Result<Value, String> {
    let handle = svc(&state)?;
    let svc = handle.lock().map_err(|e| e.to_string())?;
    let mut checks = svc.cron_doctor(now_secs());
    drop(svc);
    checks.push(crate::acp_cmds::agents_doctor_check(
        Arc::clone(&state.acp_sessions),
    ));
    Ok(serde_json::to_value(checks).unwrap_or(Value::Null))
}
