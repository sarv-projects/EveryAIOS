//! P11.5.3 — real shell view backend. `shell_spawn` launches a real
//! interactive shell (`sh -i` on unix, `cmd` on Windows) with piped stdio; a
//! reader thread streams stdout/stderr lines back as `shell-event` emits; the
//! UI's shell view writes commands via `shell_write` and receives live
//! output. This is a real process — not a mock `HISTORY` — with honest
//! limitations: no PTY (no full-screen TUI apps, no job control bells), and
//! the process is sandboxed only by the user's own OS account (Guard-2
//! command filtering remains the product-level gate, tracked separately).
//!
//! The shell is per-session: `shell_kill(session_id)` tears it down (window
//! close / session switch). Handles live in `AppState.shells`.

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, Command, Stdio};

use tauri::{AppHandle, Emitter, State};

use crate::AppState;

/// A live shell process + its stdin handle (for `shell_write`).
pub struct ShellHandle {
    child: Child,
    stdin: Option<ChildStdin>,
    pub shell: String,
}

impl ShellHandle {
    fn write(&mut self, line: &str) -> std::io::Result<()> {
        if let Some(stdin) = self.stdin.as_mut() {
            stdin.write_all(line.as_bytes())?;
            stdin.write_all(b"\n")?;
            stdin.flush()?;
        }
        Ok(())
    }

    fn kill(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

/// Spawn an interactive shell for a session. Returns the shell id (== the
/// session id) on success. Output streams as `shell-event` frames:
/// `{ id, sessionId, line, kind: "out" | "err" | "exit" }`.
#[tauri::command]
pub fn shell_spawn(
    app: AppHandle,
    state: State<'_, AppState>,
    session_id: String,
    shell: Option<String>,
) -> Result<String, String> {
    {
        let shells = state.shells.lock().map_err(|e| e.to_string())?;
        if shells.contains_key(&session_id) {
            return Ok(session_id); // already running — idempotent
        }
    }

    let shell_name = shell.unwrap_or_else(|| {
        if cfg!(windows) {
            "cmd".to_string()
        } else {
            "sh".to_string()
        }
    });

    let mut cmd = if cfg!(windows) {
        let mut c = Command::new("cmd");
        c.args(["/Q"]);
        c
    } else {
        let mut c = Command::new(&shell_name);
        c.arg("-i");
        c
    };
    cmd.stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("spawn {shell_name}: {e}"))?;
    let stdin = child.stdin.take();

    let stdout = child.stdout.take().ok_or("no stdout")?;
    let stderr = child.stderr.take().ok_or("no stderr")?;

    // Reader threads → shell-event emits. `app` is cloneable + Send.
    let emit_app = app.clone();
    let emit_id = session_id.clone();
    std::thread::spawn(move || {
        let mut lines = BufReader::new(stdout).lines();
        while let Some(Ok(line)) = lines.next() {
            let _ = emit_app.emit(
                "shell-event",
                serde_json::json!({
                    "id": emit_id,
                    "sessionId": emit_id,
                    "line": line,
                    "kind": "out",
                }),
            );
        }
    });
    let emit_app = app.clone();
    let emit_id = session_id.clone();
    std::thread::spawn(move || {
        let mut lines = BufReader::new(stderr).lines();
        while let Some(Ok(line)) = lines.next() {
            let _ = emit_app.emit(
                "shell-event",
                serde_json::json!({
                    "id": emit_id,
                    "sessionId": emit_id,
                    "line": line,
                    "kind": "err",
                }),
            );
        }
    });

    let shell_name_log = shell_name.clone();
    {
        let mut shells = state.shells.lock().map_err(|e| e.to_string())?;
        shells.insert(
            session_id.clone(),
            ShellHandle {
                child,
                stdin,
                shell: shell_name,
            },
        );
    }
    // v3.59 governance decision — human-UI path: the user's click/typing is
    // the authorization; the audit invariant still holds (same Merkle chain
    // as the agent/ticket path). See spec §4.3 / TODO P47.1.
    crate::control::record_mutation(
        &state,
        crate::control::AuthKind::HumanGesture,
        "shell.spawn",
        serde_json::json!({ "sessionId": session_id, "shell": shell_name_log }),
    );
    Ok(session_id)
}

/// Send a command line to a live shell.
#[tauri::command]
pub fn shell_write(
    state: State<'_, AppState>,
    session_id: String,
    input: String,
) -> Result<serde_json::Value, String> {
    let mut shells = state.shells.lock().map_err(|e| e.to_string())?;
    let handle = shells
        .get_mut(&session_id)
        .ok_or_else(|| "no shell running for this session".to_string())?;
    handle
        .write(&input)
        .map_err(|e| format!("write to shell: {e}"))?;
    // v3.59 governance decision — human-UI path: the user-typed command is
    // audited on the same Merkle chain as agent/ticket effects (P47.1).
    crate::control::record_mutation(
        &state,
        crate::control::AuthKind::HumanGesture,
        "shell.command",
        serde_json::json!({ "sessionId": session_id, "command": input }),
    );
    Ok(serde_json::json!({ "ok": true, "echo": input }))
}

/// Tear down a session's shell (window close / session switch).
#[tauri::command]
pub fn shell_kill(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<serde_json::Value, String> {
    let mut shells = state.shells.lock().map_err(|e| e.to_string())?;
    if let Some(mut handle) = shells.remove(&session_id) {
        handle.kill();
        Ok(serde_json::json!({ "killed": true, "sessionId": session_id }))
    } else {
        Ok(serde_json::json!({ "killed": false, "sessionId": session_id }))
    }
}

/// List live shells (session id → shell name) for the shell view status dot.
#[tauri::command]
pub fn shell_status(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let shells = state.shells.lock().map_err(|e| e.to_string())?;
    let rows: HashMap<String, String> = shells
        .iter()
        .map(|(id, h)| (id.clone(), h.shell.clone()))
        .collect();
    Ok(serde_json::json!({ "shells": rows, "count": rows.len() }))
}
