//! P6.4 (B7) — scheduled-task commands. Thin wrappers over the shared
//! `everyaios-core::SchedulerService` (job registry, cron/interval/event/
//! webhook triggers, leases, retry, battery policy, nudge sentinels). The
//! shell exposes the job list, create/delete/enable/pause/resume/run-now,
//! battery state, event fires and nudge suggestions to the UI; the durable
//! state machine is tested in the crates.

use everyaios_core::SchedulerService;
use serde_json::Value;
use tauri::State;

use crate::AppState;

/// Clone the shared scheduler service handle through the relay (single source
/// of truth — the coordinator drives the same instance over `scheduler/*`).
/// The returned `Arc` is independent of the relay guard, so commands can lock
/// it without lifetime gymnastics.
fn svc(state: &State<'_, AppState>) -> Result<std::sync::Arc<std::sync::Mutex<SchedulerService>>, String> {
    let relay = state
        .chat_relay
        .lock()
        .map_err(|e| e.to_string())?;
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
pub fn scheduler_enable(state: State<'_, AppState>, id: String, enabled: bool) -> Result<bool, String> {
    let handle = svc(&state)?;
    let mut svc = handle.lock().map_err(|e| e.to_string())?;
    svc.set_enabled(&id, enabled, now_secs()).map_err(|e| e.to_string())?;
    Ok(true)
}

/// Pause every job bound to a chat session (delete-chat cascade).
#[tauri::command]
pub fn scheduler_pause_session(state: State<'_, AppState>, session_id: String) -> Result<u32, String> {
    let handle = svc(&state)?;
    let mut svc = handle.lock().map_err(|e| e.to_string())?;
    Ok(svc.pause_session(&session_id) as u32)
}

/// HITL pause (first-class state with an optional resume deadline).
#[tauri::command]
pub fn scheduler_pause(state: State<'_, AppState>, id: String, resume_deadline: Option<u64>) -> Result<bool, String> {
    let handle = svc(&state)?;
    let mut svc = handle.lock().map_err(|e| e.to_string())?;
    svc.pause(&id, resume_deadline).map_err(|e| e.to_string())?;
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
    state.battery.store(on_battery, std::sync::atomic::Ordering::Relaxed);
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
    let kind = serde_json::from_value(serde_json::json!(kind)).map_err(|e| format!("bad kind: {e}"))?;
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
pub fn scheduler_nudge(state: State<'_, AppState>, goal: String, ts: Option<u64>) -> Result<bool, String> {
    let handle = svc(&state)?;
    let mut svc = handle.lock().map_err(|e| e.to_string())?;
    svc.record_nudge(&goal, ts.unwrap_or_else(now_secs));
    Ok(true)
}
