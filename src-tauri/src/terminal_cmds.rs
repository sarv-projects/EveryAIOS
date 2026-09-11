//! H36 (P54) — integrated terminal: profile registry + real PTY.
//!
//! Replaces `shell_cmds.rs`'s piped `sh -i` / `cmd` ceiling for the Shell
//! view. The process is a real PTY (unix pty / Windows ConPTY), so full-screen
//! TUI apps work, resize reaches the child, and the session survives a view
//! unmount (it lives in `AppState.terminal`, not in the renderer).
//!
//! **Authority boundary.** The renderer never sends an executable path — it
//! sends a *profile name*. This module re-runs `everyaios-core`'s detection on
//! the shell side and resolves the name against that registry, so a
//! compromised renderer cannot ask the shell to spawn an arbitrary binary or a
//! profile the user has not confirmed. Unsafe profiles (world-writable install
//! dirs) are refused until confirmed in `terminal.unsafeConfirmed`.
//!
//! **Audit.** Session lifecycle (`terminal.spawn` / `terminal.kill`) is written
//! to the same Merkle chain as every other human-gesture effect. Individual
//! keystrokes are deliberately *not* audited: a PTY carries passwords
//! (`sudo`, `ssh`, `gh auth`), and an audit log is retained — writing raw input
//! would turn the ledger into a credential leak. This is stricter than
//! `shell_cmds.rs`, which has no PTY and therefore no interactive secret prompt.
//!
//! **Backends.** `Local` and `Wsl` spawn here. `Remote` (P54.7, H33 attach) has
//! no implementation yet and fails closed with `remote_unavailable` — never a
//! silent local fallback, which would run a command on the wrong machine.

use base64::Engine as _;
use tauri::{AppHandle, Emitter, State};

use everyaios_core::terminal::{
    detect_available_profiles, DetectedProfile, Platform, TerminalBackend, TerminalConfig,
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

/// P54.3 — spawn a detected profile into a real PTY. Returns the `pty_id`; raw
/// output streams as `terminal-event` frames
/// `{ ptyId, kind: "data" | "exit" | "error", data: <base64>, code? }`.
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
        .spawn_profile(&resolved, cwd.as_deref(), rows, cols)
        .map_err(|e| e.to_string())?;

    // Reader thread → raw byte frames. xterm.js owns VT interpretation; we
    // never parse the stream here (no line loss, no encoding damage).
    let data_app = app.clone();
    let data_id = pty_id.clone();
    let exit_app = app.clone();
    let exit_id = pty_id.clone();
    output
        .stream(
            move |chunk| {
                let data = base64::engine::general_purpose::STANDARD.encode(&chunk);
                let _ = data_app.emit(
                    "terminal-event",
                    serde_json::json!({
                        "ptyId": data_id,
                        "kind": "data",
                        "data": data,
                    }),
                );
            },
            move |code| {
                let _ = exit_app.emit(
                    "terminal-event",
                    serde_json::json!({
                        "ptyId": exit_id,
                        "kind": "exit",
                        "data": "",
                        "code": code,
                    }),
                );
            },
        )
        .map_err(|e| format!("start pty reader: {e}"))?;

    // v3.59 governance decision — human-UI path: opening a terminal session is
    // the user's gesture, so it is authorized + audited on the same Merkle
    // chain as agent effects. Keystrokes are intentionally not logged (see
    // module docs: a PTY carries secrets).
    crate::control::record_mutation(
        &state,
        crate::control::AuthKind::HumanGesture,
        "terminal.spawn",
        serde_json::json!({
            "ptyId": pty_id,
            "profileId": resolved.profile_name,
            "backend": backend_label(resolved.backend),
            "rows": rows,
            "cols": cols,
        }),
    );
    Ok(pty_id)
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

/// Live PTY sessions for the tab strip / backend chip. `exitCode: null` =
/// running.
#[tauri::command]
pub fn terminal_status(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let rows: Vec<serde_json::Value> = state
        .terminal
        .status()
        .into_iter()
        .map(|(pty_id, profile_id, backend)| {
            let exit = state.terminal.exit_code(&pty_id).ok().flatten();
            serde_json::json!({
                "ptyId": pty_id,
                "profileId": profile_id,
                "backend": backend_label(backend),
                "running": exit.is_none(),
                "exitCode": exit,
            })
        })
        .collect();
    Ok(serde_json::json!({ "count": rows.len(), "ptys": rows }))
}
