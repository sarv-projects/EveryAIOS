//! P71.2c — the host-owned automation firing path.
//!
//! `ARCH/AUTOMATION.md` §9 puts **agent execution of any kind** outside the
//! scheduler's ownership, and §6 says an agent-backed step is run by the
//! **bound agent**; §5 says the factory only compiles Work. Until `P71.2c` the
//! coordinator's trigger client executed a firing by running its own built-in
//! turn (`runChatStream` → `core-engine`), which is exactly the path
//! `ARCH/ADR/0005` retires.
//!
//! The firing therefore lives here, in the shell that already owns the three
//! authorities it needs — the trigger plane
//! ([`everyaios_core::scheduler_service`]), the Work gateway, and the ACP
//! channel:
//!
//! ```text
//! due job ──▶ Work (automation Session) ──▶ Run ──▶ bound agent (ACP prompt)
//!          ──▶ occurrence record (mark_fired) + monitor verdict
//! ```
//!
//! The sidecar executes nothing here: it keeps the loopback webhook listener
//! that marks a job due. Nothing in this module assumes an EveryAIOS-owned
//! model — a firing with no bound agent fails honestly and is filed as a
//! run-level incident, never as a silent `Running` Work.

use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use everyaios_core::execution::{ExecutionPhase, ExecutionTrigger};
use everyaios_core::scheduler_service::SchedulerService;
use everyaios_types::{SessionKind, WorkState};
use serde_json::{json, Value};
use tauri::{AppHandle, Manager, State};

use crate::AppState;

/// Stop-condition marker for monitoring jobs (`ARCH/AUTOMATION.md` §4/§11).
///
/// One owner: this module builds the directive *and* reads the marker back,
/// because it is what prompts the bound agent and sees the reply. The semantic
/// judgment stays the agent's — we only detect that it said so.
pub const MONITOR_STOP_MARKER: &str = "[MONITOR_DONE]";

/// Seconds between due checks (the cadence the sidecar's tick used).
pub const TICK_SECS: u64 = 5;

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn service(state: &AppState) -> Result<Arc<Mutex<SchedulerService>>, String> {
    crate::scheduler_cmds::scheduler_handle(state)
}

fn home_dir() -> String {
    std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_else(|_| ".".to_string())
}

/// Whether an id names a real external agent — never a retired built-in
/// spelling (ADR-0005).
fn is_agent_id(id: &str) -> bool {
    !id.is_empty() && id != "inbuilt" && id != "everyaios" && id != "everyaios-native"
}

/// The agent a firing runs under: the session's resolved binding (the sidecar
/// still owns the session pins; `P71.5b` renamed the vocabulary to
/// primary-agent), else the configured default. A retired built-in spelling
/// resolves to nothing, so the firing refuses by name rather than substituting
/// an engine.
fn bound_agent(state: &State<'_, AppState>, session_id: &str) -> Option<String> {
    let resolved = {
        let relay = state.chat_relay.lock().ok()?;
        let relay = relay.as_ref()?;
        relay
            .link()
            .request("chief/resolve_session", json!({ "sessionId": session_id }))
            .ok()
    };
    if let Some(id) = resolved
        .as_ref()
        .and_then(|out| out.get("chiefId"))
        .and_then(Value::as_str)
    {
        if is_agent_id(id) {
            return Some(id.to_string());
        }
    }
    let cfg = everyaios_core::Config::load().ok()?;
    let pinned = cfg.primary_chief.trim();
    if is_agent_id(pinned) {
        Some(pinned.to_string())
    } else {
        None
    }
}

/// Fire every due job once and return the ids that fired (the shape the tray
/// and the UI's "Run automations now" report).
pub fn fire_due(app: &AppHandle) -> Vec<String> {
    let state = app.state::<AppState>();
    let Ok(svc) = service(&state) else {
        return Vec::new();
    };
    let now = now_secs();
    let (due, jobs) = {
        let mut svc = svc.lock().unwrap_or_else(|e| e.into_inner());
        (
            svc.handle("scheduler/due", &json!({ "now": now })).ok(),
            svc.handle("scheduler/list", &json!({ "now": now })).ok(),
        )
    };
    let due: Vec<String> = due
        .and_then(|v| v.get("due").and_then(Value::as_array).cloned())
        .unwrap_or_default()
        .iter()
        .filter_map(Value::as_str)
        .map(str::to_string)
        .collect();
    if due.is_empty() {
        return Vec::new();
    }
    let jobs: Vec<Value> = jobs
        .and_then(|v| v.get("jobs").and_then(Value::as_array).cloned())
        .unwrap_or_default();

    let mut fired: Vec<String> = Vec::new();
    for id in due {
        let Some(job) = jobs
            .iter()
            .find(|j| j.get("id").and_then(Value::as_str) == Some(id.as_str()))
        else {
            continue;
        };
        if job.get("enabled").and_then(Value::as_bool) == Some(false)
            || job.get("paused").and_then(Value::as_bool) == Some(true)
        {
            continue;
        }
        // A firing that cannot run still *happened*: the occurrence is recorded
        // and the reason is filed as a run-level incident, so the trigger never
        // spins forever on a job it cannot execute.
        if let Err(reason) = fire_job(&state, job, now) {
            let _ = observe(&state, &id, &format!("run could not execute: {reason}"), false);
        }
        let _ = mark_fired(&state, &id, now);
        fired.push(id);
    }
    fired
}

/// Fire one job: create its Work + Run, run the agent-backed step through the
/// session's bound agent, then leave the Work in an honest state.
fn fire_job(state: &State<'_, AppState>, job: &Value, _now: u64) -> Result<(), String> {
    let job_id = job
        .get("id")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let name = job
        .get("name")
        .and_then(Value::as_str)
        .unwrap_or("scheduled task")
        .to_string();
    let session_id = job
        .get("sessionId")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    if job_id.is_empty() || session_id.is_empty() {
        return Err("trigger job is missing id/sessionId".to_string());
    }

    // 1. The Work. A trigger-created Work is an **automation** Session's Work
    //    with no Chat (ADR-0006 §2/§4); each firing is a **Run** of it (I9: a
    //    retried automation produces Runs of one Work, not new Works).
    let exec_id = {
        let relay = state.chat_relay.lock().map_err(|e| e.to_string())?;
        let relay = relay
            .as_ref()
            .ok_or("sidecar not connected — the firing has no Work gateway")?;
        let gateway = relay.work_gateway();
        let kernel = relay.executions();
        let mut gw = gateway.lock().unwrap_or_else(|e| e.into_inner());
        gw.create_work_in_session(
            session_id.clone(),
            None,
            Some(session_id.clone()),
            SessionKind::Automation,
            format!("automation:{job_id}:{name}"),
        )
        .map_err(|e| e.to_string())?;
        let exec = {
            let mut k = kernel.lock().unwrap_or_else(|e| e.into_inner());
            let ex = k.begin(
                ExecutionTrigger::Scheduler,
                &session_id,
                &name,
                None,
                String::new(),
                json!({ "automationId": job_id, "trigger": "scheduler" }).to_string(),
                vec![],
            );
            let _ = k.transition(&ex.id, ExecutionPhase::Running);
            ex.id
        };
        gw.bind_execution(&session_id, &exec)
            .map_err(|e| e.to_string())?;
        let _ = gw.record_execution_transition(&session_id, &exec, WorkState::Running);
        exec
    };

    // 2. The agent. A missing or unready agent is a refusal with a stated
    //    reason — never a substitute engine (ADR-0005; I23/I24).
    let agent_id = match bound_agent(state, &session_id) {
        Some(id) => id,
        None => {
            let _ = finish(state, &session_id, &exec_id, WorkState::Failed);
            return Err(
                "no agent is bound to this automation's session — install and select an agent \
                 (EveryAIOS has no built-in engine in v1)"
                    .to_string(),
            );
        }
    };
    let readiness = crate::acp_cmds::agent_readiness(&agent_id);
    if !readiness.is_ready() {
        let _ = finish(state, &session_id, &exec_id, WorkState::Failed);
        return Err(format!(
            "bound agent `{agent_id}` cannot run this automation: {}",
            readiness.summary()
        ));
    }

    // 3. The run. A live session for this agent is reused (the user's own
    //    handle); otherwise one is launched — the same ACP path the composer
    //    uses, so a firing is mediated identically.
    let handle = match live_handle(state, &agent_id) {
        Some(handle) => handle,
        None => match crate::acp_cmds::acp_launch(state.clone(), agent_id.clone(), home_dir()) {
            Ok(info) => info.handle,
            Err(e) => {
                let _ = finish(state, &session_id, &exec_id, WorkState::Failed);
                return Err(format!("could not launch `{agent_id}`: {e}"));
            }
        },
    };

    let prompt = prompt_for(&name, &session_id, &job_id, job.get("monitor").is_some());
    // P71.2c — the firing's turns are gated like any other: the agent must be
    // `Ready` and the automation Session must be inside its budget, checked at
    // the turn boundary (`acp_prompt`) now that the `start_stream` dispatch is
    // deleted. Passing the Session id is what makes the J11 refusal name the
    // right ledger.
    match crate::acp_cmds::acp_prompt(state.clone(), handle, prompt, None, None, Some(session_id.clone())) {
        Ok(out) => {
            if job.get("monitor").is_some() {
                let text = out
                    .get("finalText")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_string();
                let condition_met = text.contains(MONITOR_STOP_MARKER);
                let observation = text.replace(MONITOR_STOP_MARKER, "").trim().to_string();
                let _ = observe(state, &job_id, &observation, condition_met);
            }
            let _ = finish(state, &session_id, &exec_id, WorkState::Completed);
            Ok(())
        }
        Err(e) => {
            let _ = finish(state, &session_id, &exec_id, WorkState::Failed);
            Err(e)
        }
    }
}

/// The prompt a firing sends: the task's name plus the monitor directive, with
/// the Work/Run ids so the agent can correlate its own delegation.
fn prompt_for(name: &str, session_id: &str, job_id: &str, monitor: bool) -> String {
    let mut text = format!("Run scheduled task \"{name}\" (automation {job_id}, work {session_id}).");
    if monitor {
        text.push_str(&format!(
            "\n\nThis is a monitoring task. Report the current state you observe. If the monitored \
             end condition is now met, end your response with the exact marker {MONITOR_STOP_MARKER}."
        ));
    }
    text
}

/// A live, authenticated ACP session for this agent, when one is already open.
fn live_handle(state: &State<'_, AppState>, agent_id: &str) -> Option<String> {
    let sessions = state.acp_sessions.lock().ok()?;
    sessions
        .iter()
        .find(|(_, h)| h.agent_id == agent_id && !h.auth_required)
        .map(|(handle, _)| handle.clone())
}

/// Close the run's Work state through the typed door (`P71.3g`).
fn finish(
    state: &State<'_, AppState>,
    work_id: &str,
    execution_id: &str,
    next: WorkState,
) -> Result<(), String> {
    let relay = state.chat_relay.lock().map_err(|e| e.to_string())?;
    let relay = relay.as_ref().ok_or("sidecar not connected")?;
    let gateway = relay.work_gateway();
    let mut gw = gateway.lock().unwrap_or_else(|e| e.into_inner());
    gw.record_execution_transition(work_id, execution_id, next)
}

fn mark_fired(state: &State<'_, AppState>, id: &str, now: u64) -> Result<(), String> {
    let svc = service(state)?;
    let mut svc = svc.lock().unwrap_or_else(|e| e.into_inner());
    svc.handle("scheduler/mark_fired", &json!({ "id": id, "now": now }))
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// The monitor verdict (`scheduler/monitor`): the delta comparison and the
/// notification/stop accounting are the trigger plane's, never a second store.
fn observe(
    state: &State<'_, AppState>,
    id: &str,
    observation: &str,
    condition_met: bool,
) -> Result<(), String> {
    let svc = service(state)?;
    let mut svc = svc.lock().unwrap_or_else(|e| e.into_inner());
    svc.handle(
        "scheduler/monitor",
        &json!({ "id": id, "observation": observation, "conditionMet": condition_met }),
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// The firing loop: one due-check + execution pass per [`TICK_SECS`], started
/// with the app so a headless run (tray, window closed) still fires. A firing
/// is fire-and-forget per job — a slow agent never blocks the ticker.
pub fn spawn_loop(app: &AppHandle) {
    let app = app.clone();
    std::thread::Builder::new()
        .name("everyaios-automation-firing".to_string())
        .spawn(move || loop {
            std::thread::sleep(std::time::Duration::from_secs(TICK_SECS));
            let _ = fire_due(&app);
        })
        .ok();
}
