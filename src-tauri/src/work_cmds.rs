use serde_json::Value;
use tauri::State;

use crate::AppState;

fn gateway(
    state: &AppState,
) -> Result<std::sync::Arc<std::sync::Mutex<everyaios_core::WorkGateway>>, String> {
    let relay = state.chat_relay.lock().map_err(|e| e.to_string())?;
    relay
        .as_ref()
        .map(|r| r.work_gateway())
        .ok_or_else(|| "sidecar not connected — work gateway unavailable".to_string())
}

#[tauri::command]
pub fn work_list(state: State<'_, AppState>) -> Result<Value, String> {
    let gateway = gateway(&state)?;
    let gateway = gateway.lock().map_err(|e| e.to_string())?;
    serde_json::to_value(gateway.list_work()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn work_snapshot(state: State<'_, AppState>, work_id: String) -> Result<Value, String> {
    let gateway = gateway(&state)?;
    let gateway = gateway.lock().map_err(|e| e.to_string())?;
    serde_json::to_value(gateway.snapshot(&work_id)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn work_events(
    state: State<'_, AppState>,
    work_id: String,
    from_sequence: Option<u64>,
) -> Result<Value, String> {
    let gateway = gateway(&state)?;
    let gateway = gateway.lock().map_err(|e| e.to_string())?;
    serde_json::to_value(gateway.replay_from(&work_id, from_sequence.unwrap_or(0)))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn work_presence(state: State<'_, AppState>, work_id: String) -> Result<Value, String> {
    let gateway = gateway(&state)?;
    let gateway = gateway.lock().map_err(|e| e.to_string())?;
    serde_json::to_value(gateway.presence(&work_id)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn work_reviews(state: State<'_, AppState>, work_id: String) -> Result<Value, String> {
    let gateway = gateway(&state)?;
    let gateway = gateway.lock().map_err(|e| e.to_string())?;
    serde_json::to_value(gateway.reviews(&work_id)).map_err(|e| e.to_string())
}


// =============================================================================
// P49.10–12 — session-runtime lifecycle commands (PtySession / WorktreeBinding
// / AgentSession). The gateway owns the durable descriptors + event fan-out;
// the OS-level PTY spawn / git worktree ops are the shell's existing engines
// (shell_cmds / git_cmds) — these commands record + drive the runtime state
// machine and emit the WorkEvent stream every client replays.
// =============================================================================

/// P49.10 — register a spawned PTY (the caller supplies the OS pid).
#[tauri::command]
pub fn work_pty_spawn(
    state: State<'_, AppState>,
    work_id: String,
    pty_id: String,
    process_id: Option<u32>,
    rows: u16,
    cols: u16,
) -> Result<Value, String> {
    let gateway = gateway(&state)?;
    let mut g = gateway.lock().map_err(|e| e.to_string())?;
    let ev = g.spawn_pty(&work_id, &pty_id, process_id, rows, cols)?;
    serde_json::to_value(ev).map_err(|e| e.to_string())
}

/// P49.10 — resize a PTY.
#[tauri::command]
pub fn work_pty_resize(
    state: State<'_, AppState>,
    work_id: String,
    pty_id: String,
    rows: u16,
    cols: u16,
) -> Result<Value, String> {
    let gateway = gateway(&state)?;
    let mut g = gateway.lock().map_err(|e| e.to_string())?;
    let ev = g.resize_pty(&work_id, &pty_id, rows, cols)?;
    serde_json::to_value(ev).map_err(|e| e.to_string())
}

/// P49.10 — signal a PTY (SIGINT/SIGTERM/…). The shell delivers the OS signal.
#[tauri::command]
pub fn work_pty_signal(
    state: State<'_, AppState>,
    work_id: String,
    pty_id: String,
    signal: String,
) -> Result<Value, String> {
    let gateway = gateway(&state)?;
    let mut g = gateway.lock().map_err(|e| e.to_string())?;
    let ev = g.signal_pty(&work_id, &pty_id, &signal)?;
    serde_json::to_value(ev).map_err(|e| e.to_string())
}

/// P49.10 — close a PTY with an exit code.
#[tauri::command]
pub fn work_pty_close(
    state: State<'_, AppState>,
    work_id: String,
    pty_id: String,
    code: Option<i32>,
) -> Result<Value, String> {
    let gateway = gateway(&state)?;
    let mut g = gateway.lock().map_err(|e| e.to_string())?;
    let ev = g.close_pty(&work_id, &pty_id, code)?;
    serde_json::to_value(ev).map_err(|e| e.to_string())
}

/// P49.10 — snapshot the retained terminal buffer for a re-attaching client.
#[tauri::command]
pub fn work_pty_snapshot(state: State<'_, AppState>, pty_id: String) -> Result<Value, String> {
    let gateway = gateway(&state)?;
    let g = gateway.lock().map_err(|e| e.to_string())?;
    serde_json::to_value(g.snapshot_terminal(&pty_id)).map_err(|e| e.to_string())
}

/// P49.11 — create a worktree binding for a run.
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub fn work_worktree_create(
    state: State<'_, AppState>,
    work_id: String,
    run_id: String,
    worktree_id: String,
    repo_root: String,
    worktree_root: String,
    base_revision: String,
    branch: String,
    isolation_mode: Option<String>,
) -> Result<Value, String> {
    let gateway = gateway(&state)?;
    let mut g = gateway.lock().map_err(|e| e.to_string())?;
    let ev = g.create_worktree(
        &work_id,
        &run_id,
        &worktree_id,
        &repo_root,
        &worktree_root,
        &base_revision,
        &branch,
        &isolation_mode.unwrap_or_else(|| "worktree".to_string()),
    )?;
    serde_json::to_value(ev).map_err(|e| e.to_string())
}

/// P49.11 — attach a worktree to a (possibly new) run.
#[tauri::command]
pub fn work_worktree_attach(
    state: State<'_, AppState>,
    work_id: String,
    worktree_id: String,
    run_id: String,
) -> Result<Value, String> {
    let gateway = gateway(&state)?;
    let mut g = gateway.lock().map_err(|e| e.to_string())?;
    let ev = g.attach_worktree(&work_id, &worktree_id, &run_id)?;
    serde_json::to_value(ev).map_err(|e| e.to_string())
}

/// P49.11 — merge / revert / destroy a worktree (op = merge|revert|destroy).
#[tauri::command]
pub fn work_worktree_op(
    state: State<'_, AppState>,
    work_id: String,
    worktree_id: String,
    op: String,
    into: Option<String>,
) -> Result<Value, String> {
    let gateway = gateway(&state)?;
    let mut g = gateway.lock().map_err(|e| e.to_string())?;
    let ev = match op.as_str() {
        "merge" => g.merge_worktree(&work_id, &worktree_id, &into.unwrap_or_else(|| "main".into()))?,
        "revert" => g.revert_worktree(&work_id, &worktree_id)?,
        "destroy" => g.destroy_worktree(&work_id, &worktree_id)?,
        other => return Err(format!("unknown worktree op: {other}")),
    };
    serde_json::to_value(ev).map_err(|e| e.to_string())
}

/// P49.12 — spawn a subagent session (lifetime = ephemeral|persistent).
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub fn work_agent_spawn(
    state: State<'_, AppState>,
    work_id: String,
    run_id: String,
    agent_session_id: String,
    agent_id: String,
    lifetime: String,
    pty_id: Option<String>,
    worktree_id: Option<String>,
) -> Result<Value, String> {
    use everyaios_core::AgentLifetime;
    let lt = match lifetime.as_str() {
        "persistent" | "persistent_attached_session" => AgentLifetime::PersistentAttachedSession,
        _ => AgentLifetime::EphemeralChild,
    };
    let gateway = gateway(&state)?;
    let mut g = gateway.lock().map_err(|e| e.to_string())?;
    let ev = g.spawn_subagent(&work_id, &run_id, &agent_session_id, &agent_id, lt, pty_id, worktree_id)?;
    serde_json::to_value(ev).map_err(|e| e.to_string())
}

/// P49.12 — agent-session op (attach|detach|steer|checkpoint|terminate).
#[tauri::command]
pub fn work_agent_op(
    state: State<'_, AppState>,
    work_id: String,
    agent_session_id: String,
    op: String,
) -> Result<Value, String> {
    let gateway = gateway(&state)?;
    let mut g = gateway.lock().map_err(|e| e.to_string())?;
    let ev = match op.as_str() {
        "attach" => g.attach_agent_session(&work_id, &agent_session_id)?,
        "detach" => g.detach_agent_session(&work_id, &agent_session_id)?,
        "steer" => g.steer_agent_session(&work_id, &agent_session_id)?,
        "checkpoint" => g.checkpoint_agent_session(&work_id, &agent_session_id)?,
        "terminate" => g.terminate_agent_session(&work_id, &agent_session_id)?,
        other => return Err(format!("unknown agent-session op: {other}")),
    };
    serde_json::to_value(ev).map_err(|e| e.to_string())
}

/// P49.12 — list agent sessions for a work.
#[tauri::command]
pub fn work_agent_sessions(state: State<'_, AppState>, work_id: String) -> Result<Value, String> {
    let gateway = gateway(&state)?;
    let g = gateway.lock().map_err(|e| e.to_string())?;
    serde_json::to_value(g.agent_sessions_for(&work_id)).map_err(|e| e.to_string())
}
