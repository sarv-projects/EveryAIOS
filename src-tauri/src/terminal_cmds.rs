//! H36 (P54/P67) — integrated terminal: profile registry + one real PTY plane.
//!
//! **One plane.** There is exactly one PTY host (`AppState.terminal`). A human
//! tab, an agent `script.run`, and a durable task all spawn through it, and all
//! three appear in the same Shell view — the difference is *provenance*
//! (`TerminalOrigin`), which the UI renders as a read-only, labelled tab so the
//! user can watch the agent work instead of trusting an invisible pipe. The old
//! `shell_cmds.rs` piped `sh -i`/`cmd` path is gone from the product surface.
//!
//! **Authority boundary.** The renderer never sends an executable path — it
//! sends a *profile name*. This module re-runs `everyaios-core`'s detection on
//! the shell side and resolves the name against that registry, so a
//! compromised renderer cannot ask the shell to spawn an arbitrary binary or a
//! profile the user has not confirmed. Unsafe profiles (world-writable install
//! dirs) are refused until confirmed in `terminal.unsafeConfirmed`.
//!
//! **Audit.** Session lifecycle (`terminal.spawn` / `terminal.kill`) is written
//! to the same Merkle chain as every other effect. Individual keystrokes are
//! deliberately *not* audited: a PTY carries passwords (`sudo`, `ssh`,
//! `gh auth`), and the audit log is retained — writing raw input would turn the
//! ledger into a credential leak. An *agent* command is different: it is the
//! agent's own decision, so it is recorded as such.
//!
//! **Backends.** `Local` and `Wsl` spawn here. `Remote` (P54.7, H33 attach) has
//! no implementation yet and fails closed with `remote_unavailable` — never a
//! silent local fallback, which would run a command on the wrong machine.

use base64::Engine as _;
use tauri::{AppHandle, Emitter, State};

use everyaios_core::terminal::{
    detect_available_profiles, DetectedProfile, Platform, PtyFrame, SpawnOpts, TerminalBackend,
    TerminalConfig, TerminalOrigin,
};
use everyaios_core::Config;

use crate::AppState;

/// Max PTY dimension accepted from the renderer (a bogus resize would be
/// forwarded to the kernel verbatim).
const MAX_DIM: u16 = 1000;

fn profile_json(p: &DetectedProfile, confirmed: &[String], hide_unsafe: bool) -> serde_json::Value {
    serde_json::json!({
        "profileName": p.profile_name,
        "path": p.path,
        "backend": p.backend,
        "icon": p.icon,
        "source": p.source,
        "wslDistro": p.wsl_distro,
        "isUnsafePath": p.is_unsafe_path,
        "isFromPath": p.is_from_path,
        "isAutoDetected": p.is_auto_detected,
        "isDefault": p.is_default,
        "offered": p.offered(confirmed, hide_unsafe),
    })
}

fn backend_label(b: TerminalBackend) -> &'static str {
    match b {
        TerminalBackend::Local => "local",
        TerminalBackend::Wsl => "wsl",
        TerminalBackend::Remote => "remote",
    }
}

fn origin_label(o: TerminalOrigin) -> &'static str {
    match o {
        TerminalOrigin::Human => "human",
        TerminalOrigin::Agent => "agent",
        TerminalOrigin::Task => "task",
    }
}

/// Current platform key for the registry (`windows` | `linux` | `macos`).
fn platform_key() -> &'static str {
    match Platform::current() {
        Platform::Windows => "windows",
        Platform::Macos => "macos",
        Platform::Linux => "linux",
    }
}

/// Resolve a renderer-supplied profile name against the shell's own detection.
/// Refuses unknown, unsafe-unconfirmed, hidden, and `Remote` profiles.
fn resolve_profile(cfg: &Config, name: &str) -> Result<DetectedProfile, String> {
    let detected = detect_available_profiles(&cfg.terminal);
    let confirmed = cfg.terminal.unsafe_confirmed_names().to_vec();
    let profile = detected
        .into_iter()
        .find(|p| p.profile_name == name)
        .ok_or_else(|| format!("unknown terminal profile: {name}"))?;
    if !profile.offered(&confirmed, cfg.terminal.hidden_unsafe) {
        return Err(format!(
            "terminal profile {name} uses an unconfirmed unsafe install path — \
             confirm it in Settings → Terminal first"
        ));
    }
    if profile.backend == TerminalBackend::Remote {
        // P54.7 — H33 attach is not implemented; fail closed, never local.
        return Err(
            "remote terminal backend not available in this build (H33 attach pending)".into(),
        );
    }
    Ok(profile)
}

/// P54.1 — detected profiles + registry state for the Shell view's `+`
/// dropdown and Settings → Terminal. Detection runs on the shell side; the
/// renderer receives the resolved registry, never the raw config file.
#[tauri::command]
pub fn terminal_profiles() -> Result<serde_json::Value, String> {
    let cfg = Config::load().map_err(|e| e.to_string())?;
    let confirmed = cfg.terminal.unsafe_confirmed_names().to_vec();
    let hidden = cfg.terminal.hidden_unsafe;
    let detected = detect_available_profiles(&cfg.terminal);
    let profiles: Vec<serde_json::Value> = detected
        .iter()
        .map(|p| profile_json(p, &confirmed, hidden))
        .collect();
    Ok(serde_json::json!({
        "platform": platform_key(),
        "profiles": profiles,
        "defaultProfile": cfg.terminal.default_profile_name(),
        "automationProfile": cfg.terminal.automation_profile_name(),
        "useWslProfiles": cfg.terminal.use_wsl_profiles,
        "unsafeConfirmed": confirmed,
        "hostAbiVersion": TerminalBackend::HOST_ABI_VERSION,
        "shellIntegration": cfg.terminal.shell_integration,
        // P54.7 — honest capability flag for the UI (Remote ships post-v1).
        "remoteBackendAvailable": false,
    }))
}

/// Persist mutated `terminal.*` back to `everyaios.toml`.
fn save_terminal(mutate: impl FnOnce(&mut TerminalConfig)) -> Result<(), String> {
    let path = Config::config_path().map_err(|e| e.to_string())?;
    let mut cfg = Config::load().map_err(|e| e.to_string())?;
    mutate(&mut cfg.terminal);
    cfg.save(&path).map_err(|e| e.to_string())
}

/// P54.1 — Select Default Profile. Only a profile that detection actually
/// offers may become the default (no typo'd name silently becoming a default).
#[tauri::command]
pub fn terminal_set_default(name: String) -> Result<bool, String> {
    let cfg = Config::load().map_err(|e| e.to_string())?;
    let confirmed = cfg.terminal.unsafe_confirmed_names().to_vec();
    let ok = detect_available_profiles(&cfg.terminal)
        .iter()
        .any(|p| p.profile_name == name && p.offered(&confirmed, cfg.terminal.hidden_unsafe));
    if !ok {
        return Err(format!("cannot set default: profile {name} is not offered"));
    }
    save_terminal(|t| {
        *t.default_profile.platform_mut() = name;
    })?;
    Ok(true)
}

/// P54.5 — automation profile for tasks / agent `script.run`. `None` clears it
/// (falls back to the interactive default).
#[tauri::command]
pub fn terminal_set_automation(name: Option<String>) -> Result<Option<String>, String> {
    if let Some(n) = &name {
        let cfg = Config::load().map_err(|e| e.to_string())?;
        let confirmed = cfg.terminal.unsafe_confirmed_names().to_vec();
        let ok = detect_available_profiles(&cfg.terminal)
            .iter()
            .any(|p| &p.profile_name == n && p.offered(&confirmed, cfg.terminal.hidden_unsafe));
        if !ok {
            return Err(format!(
                "cannot set automation shell: profile {n} is not offered"
            ));
        }
    }
    save_terminal(|t| {
        let slot = t.automation_profile.platform_mut();
        match name {
            Some(n) => *slot = n,
            // Clearing the platform slot is the only honest "unset" in toml.
            None => t.automation_profile = Default::default(),
        }
    })?;
    let cfg = Config::load().map_err(|e| e.to_string())?;
    Ok(cfg.terminal.automation_profile_name().map(String::from))
}

/// P54.6 — confirm an unsafe install dir so its profile becomes offerable.
#[tauri::command]
pub fn terminal_confirm_unsafe(name: String) -> Result<Vec<String>, String> {
    save_terminal(|t| {
        let list = t.unsafe_confirmed.platform_mut();
        if !list.contains(&name) {
            list.push(name);
        }
    })?;
    let cfg = Config::load().map_err(|e| e.to_string())?;
    Ok(cfg.terminal.unsafe_confirmed_names().to_vec())
}

/// P67 — the `terminal.*` settings the Shell view and Settings render.
#[tauri::command]
pub fn terminal_get_shell_integration() -> Result<bool, String> {
    let cfg = Config::load().map_err(|e| e.to_string())?;
    Ok(cfg.terminal.shell_integration)
}

/// P67 — toggle OSC 633 shell integration. Off means a plain terminal with no
/// structured facts (no cwd, no exit codes, no command history for the agent).
#[tauri::command]
pub fn terminal_set_shell_integration(enabled: bool) -> Result<bool, String> {
    save_terminal(|t| t.shell_integration = enabled)?;
    let cfg = Config::load().map_err(|e| e.to_string())?;
    Ok(cfg.terminal.shell_integration)
}

/// Start the reader thread for a spawned PTY, mapping `PtyFrame`s onto the
/// `terminal-event` channel. Every spawn path funnels through here so all
/// three provenance kinds stream identically.
fn stream_frames(app: AppHandle, pty_id: String, output: everyaios_core::terminal::PtyOutput) -> Result<(), String> {
    let id = pty_id.clone();
    output
        .stream(move |frame| match frame {
            PtyFrame::Data(bytes) => {
                let data = base64::engine::general_purpose::STANDARD.encode(&bytes);
                let _ = app.emit(
                    "terminal-event",
                    serde_json::json!({ "ptyId": id, "kind": "data", "data": data }),
                );
            }
            PtyFrame::Command(rec) => {
                let _ = app.emit(
                    "terminal-event",
                    serde_json::json!({
                        "ptyId": id,
                        "kind": "command",
                        "data": "",
                        "command": {
                            "command": rec.command,
                            "cwd": rec.cwd,
                            "exitCode": rec.exit_code,
                            "output": rec.output,
                            "trusted": rec.trusted,
                            "failed": rec.failed(),
                        },
                    }),
                );
            }
            PtyFrame::Cwd(path) => {
                let _ = app.emit(
                    "terminal-event",
                    serde_json::json!({ "ptyId": id, "kind": "cwd", "data": "", "cwd": path }),
                );
            }
            PtyFrame::Exit(code) => {
                let _ = app.emit(
                    "terminal-event",
                    serde_json::json!({ "ptyId": id, "kind": "exit", "data": "", "code": code }),
                );
            }
        })
        .map_err(|e| format!("start pty reader: {e}"))
}

/// Shared spawn tail: record authority, start the reader, and return the id.
fn finish_spawn(
    app: &AppHandle,
    state: &State<'_, AppState>,
    pty_id: String,
    output: everyaios_core::terminal::PtyOutput,
    origin: TerminalOrigin,
    label: Option<&str>,
    audit_subject: serde_json::Value,
) -> Result<String, String> {
    stream_frames(app.clone(), pty_id.clone(), output)?;
    // v3.59 governance decision — the audit kind tracks who acted: a user
    // gesture for a human tab, an agent authorization for `script.run`.
    let (kind, subject) = match origin {
        TerminalOrigin::Human => (crate::control::AuthKind::HumanGesture, "terminal.spawn"),
        TerminalOrigin::Agent => (crate::control::AuthKind::AgentTicket, "terminal.agent_run"),
        TerminalOrigin::Task => {
            (crate::control::AuthKind::AutomationTicket, "terminal.task_run")
        }
    };
    let mut payload = audit_subject;
    if let Some(l) = label {
        payload["label"] = serde_json::json!(l);
    }
    payload["origin"] = serde_json::json!(origin_label(origin));
    crate::control::record_mutation(state, kind, subject, payload);
    Ok(pty_id)
}

/// P54.3 — spawn a detected profile into a real PTY (human tab).
#[tauri::command]
pub fn terminal_spawn(
    app: AppHandle,
    state: State<'_, AppState>,
    profile: String,
    cwd: Option<String>,
    rows: u16,
    cols: u16,
) -> Result<String, String> {
    let cfg = Config::load().map_err(|e| e.to_string())?;
    let resolved = resolve_profile(&cfg, &profile)?;

    // A renderer-supplied cwd is only honoured when it is an existing dir.
    let cwd = match cwd {
        Some(c) if !c.is_empty() => {
            let path = std::path::PathBuf::from(&c);
            if !path.is_dir() {
                return Err(format!("terminal cwd is not a directory: {c}"));
            }
            Some(c)
        }
        _ => None,
    };

    let rows = rows.clamp(1, MAX_DIM);
    let cols = cols.clamp(1, MAX_DIM);

    let (pty_id, output) = state
        .terminal
        .spawn_with(
            &resolved,
            cwd.as_deref(),
            rows,
            cols,
            SpawnOpts {
                origin: TerminalOrigin::Human,
                integration: cfg.terminal.shell_integration,
            },
        )
        .map_err(|e| e.to_string())?;

    finish_spawn(
        &app,
        &state,
        pty_id,
        output,
        TerminalOrigin::Human,
        None,
        serde_json::json!({
            "profileId": resolved.profile_name,
            "backend": backend_label(resolved.backend),
            "rows": rows,
            "cols": cols,
        }),
    )
}

/// P67 — run a command for the agent / a durable task in a real PTY, on the
/// *automation* profile, and let the shell report it.
///
/// This is P54.5's consumer: instead of hand-rolling `sh -c` with piped stdio,
/// the command runs in the same PTY host, is authorised, and shows up in the
/// Shell view as a labelled read-only tab — so "watch the agent work" is a real
/// property rather than a claim. The command line and exit code come from the
/// shell's own `PS0`/`PROMPT_COMMAND` reporting, not from our guessing.
///
/// Newlines are sent as separate commands on purpose: partially-applied
/// multi-line shell input is not something we can report honestly.
#[tauri::command]
pub fn terminal_run(
    app: AppHandle,
    state: State<'_, AppState>,
    command: String,
    label: Option<String>,
    origin: Option<String>,
    rows: Option<u16>,
    cols: Option<u16>,
) -> Result<String, String> {
    let trimmed = command.trim();
    if trimmed.is_empty() {
        return Err("terminal_run: command must not be empty".into());
    }
    let origin = match origin.as_deref() {
        Some("task") => TerminalOrigin::Task,
        // Anything else is treated as an agent run; the caller cannot ask for
        // a *human* session through this path (that would launder authority).
        _ => TerminalOrigin::Agent,
    };

    let cfg = Config::load().map_err(|e| e.to_string())?;

    // Prefer the automation profile; fall back to the interactive default so a
    // fresh install still works, and name which one was used in the audit.
    let profile_name = cfg
        .terminal
        .automation_profile_name()
        .map(String::from)
        .or_else(|| cfg.terminal.default_profile_name().map(String::from))
        .ok_or_else(|| {
            "terminal_run: no automation or default profile is configured".to_string()
        })?;
    let resolved = resolve_profile(&cfg, &profile_name)?;

    let rows = rows.unwrap_or(24).clamp(1, MAX_DIM);
    let cols = cols.unwrap_or(80).clamp(1, MAX_DIM);

    let (pty_id, output) = state
        .terminal
        .spawn_with(
            &resolved,
            None,
            rows,
            cols,
            SpawnOpts {
                origin,
                integration: cfg.terminal.shell_integration,
            },
        )
        .map_err(|e| e.to_string())?;

    // Send the command(s). The shell echoes them and its integration script
    // reports `E` (line) + `D` (exit) back to us.
    for line in trimmed.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        state
            .terminal
            .write(&pty_id, format!("{line}\r").as_bytes())
            .map_err(|e| format!("terminal_run: write failed: {e}"))?;
    }

    finish_spawn(
        &app,
        &state,
        pty_id,
        output,
        origin,
        label.as_deref(),
        serde_json::json!({ "profileId": resolved.profile_name, "command": trimmed }),
    )
}

/// Write raw input (keystrokes / paste) to a live PTY.
#[tauri::command]
pub fn terminal_write(
    state: State<'_, AppState>,
    pty_id: String,
    data: String,
) -> Result<bool, String> {
    state
        .terminal
        .write(&pty_id, data.as_bytes())
        .map_err(|e| e.to_string())?;
    Ok(true)
}

/// P54.3 — resize the PTY pair (SIGWINCH / ConPTY resize).
#[tauri::command]
pub fn terminal_resize(
    state: State<'_, AppState>,
    pty_id: String,
    rows: u16,
    cols: u16,
) -> Result<bool, String> {
    state
        .terminal
        .resize(&pty_id, rows.clamp(1, MAX_DIM), cols.clamp(1, MAX_DIM))
        .map_err(|e| e.to_string())?;
    Ok(true)
}

/// Kill + reap a PTY session (tab close / explicit stop).
#[tauri::command]
pub fn terminal_kill(state: State<'_, AppState>, pty_id: String) -> Result<bool, String> {
    let killed = state.terminal.kill(&pty_id).map_err(|e| e.to_string())?;
    if killed {
        crate::control::record_mutation(
            &state,
            crate::control::AuthKind::HumanGesture,
            "terminal.kill",
            serde_json::json!({ "ptyId": pty_id }),
        );
    }
    Ok(killed)
}

/// Live PTY sessions for the tab strip. Carries provenance (`origin`/`label`),
/// the integration quality, and the shell's live cwd.
#[tauri::command]
pub fn terminal_status(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let rows: Vec<serde_json::Value> = state
        .terminal
        .sessions()
        .into_iter()
        .map(|s| {
            let exit = state.terminal.exit_code(&s.pty_id).ok().flatten();
            serde_json::json!({
                "ptyId": s.pty_id,
                "profileId": s.profile_id,
                "backend": backend_label(s.backend),
                "origin": origin_label(s.origin),
                "label": s.label,
                "integration": s.integration,
                "cwd": s.cwd,
                "pid": s.pid,
                "running": exit.is_none(),
                "exitCode": exit,
            })
        })
        .collect();
    Ok(serde_json::json!({ "count": rows.len(), "ptys": rows }))
}

/// P67 — the shell's structured command history for one PTY. This is the data
/// behind exit-code decorations, the recent-command picker, and the chat
/// context (`#terminalLastCommand`). Untrusted command lines are reported with
/// `trusted: false` and the UI must not present them as fact.
#[tauri::command]
pub fn terminal_commands(
    state: State<'_, AppState>,
    pty_id: String,
    limit: Option<usize>,
) -> Result<serde_json::Value, String> {
    let tracker = state
        .terminal
        .tracker(&pty_id)
        .ok_or_else(|| format!("terminal_commands: no such pty: {pty_id}"))?;
    let t = tracker.lock().map_err(|e| e.to_string())?;
    let limit = limit.unwrap_or(50).min(200);
    let rows: Vec<serde_json::Value> = t
        .recent(limit)
        .into_iter()
        .map(|r| {
            serde_json::json!({
                "command": r.command,
                "cwd": r.cwd,
                "exitCode": r.exit_code,
                "output": r.output,
                "trusted": r.trusted,
                "failed": r.failed(),
            })
        })
        .collect();
    Ok(serde_json::json!({
        "ptyId": pty_id,
        "cwd": t.cwd(),
        "count": t.len(),
        "commands": rows,
    }))
}

/// P67 — the last-command context block, exactly as it should be shown to a
/// model: command, cwd, exit code, and output. `null` when the shell has not
/// reported a trusted command yet (never a fabricated empty block).
#[tauri::command]
pub fn terminal_last_command_context(
    state: State<'_, AppState>,
    pty_id: String,
    max_chars: Option<usize>,
) -> Result<Option<String>, String> {
    let tracker = state
        .terminal
        .tracker(&pty_id)
        .ok_or_else(|| format!("terminal_last_command_context: no such pty: {pty_id}"))?;
    let t = tracker.lock().map_err(|e| e.to_string())?;
    Ok(t.context_block(max_chars.unwrap_or(6000).min(64_000)))
}

/// P67 — recent command history as a compact block (terminal-history context,
/// e.g. "why did my last three commands fail?").
#[tauri::command]
pub fn terminal_history_context(
    state: State<'_, AppState>,
    pty_id: String,
    limit: Option<usize>,
    max_chars: Option<usize>,
) -> Result<Option<String>, String> {
    let tracker = state
        .terminal
        .tracker(&pty_id)
        .ok_or_else(|| format!("terminal_history_context: no such pty: {pty_id}"))?;
    let t = tracker.lock().map_err(|e| e.to_string())?;
    Ok(t.history_block(limit.unwrap_or(10), max_chars.unwrap_or(4000).min(64_000)))
}
