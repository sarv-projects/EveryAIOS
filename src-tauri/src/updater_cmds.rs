//! P8.8 — auto-updater Tauri commands.
//!
//! The tauri-plugin-updater is registered at boot (`tauri.conf.json` carries
//! the minisign pubkey + endpoints; release.yml signs artifacts with the
//! release-private key). This module adds the missing trigger surface the
//! UI can call: an explicit check and a download+install+relaunch.
//!
//! Errors surface honestly ("no update", endpoint unreachable, bad
//! signature) — the UI renders them verbatim rather than guessing.

use serde_json::json;
use tauri_plugin_updater::UpdaterExt;

/// Check the configured endpoints for a pending update. Returns
/// `{ available, currentVersion?, version?, notes? }`.
#[tauri::command]
pub async fn updater_check(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let updater = app
        .updater()
        .map_err(|e| format!("updater unavailable: {e}"))?;
    let update = updater
        .check()
        .await
        .map_err(|e| format!("update check failed: {e}"))?;
    Ok(match update {
        Some(u) => json!({
            "available": true,
            "currentVersion": u.current_version,
            "version": u.version,
            "notes": u.body,
        }),
        None => json!({ "available": false }),
    })
}

/// Download + install a pending update, then relaunch. Returns
/// `{ installed: true }` on success (the process relaunches, so this
/// normally never resolves) or `{ installed: false }` when no update was
/// pending.
#[tauri::command]
pub async fn updater_install(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let updater = app
        .updater()
        .map_err(|e| format!("updater unavailable: {e}"))?;
    let update = updater
        .check()
        .await
        .map_err(|e| format!("update check failed: {e}"))?;
    let Some(update) = update else {
        return Ok(json!({ "installed": false, "reason": "no-update" }));
    };
    // Progress callbacks are intentionally silent — the command resolves
    // when install completes (or relaunches). A future UI pass can stream
    // these as events.
    update
        .download_and_install(|_chunk, _total| {}, || {})
        .await
        .map_err(|e| format!("download/install failed: {e}"))?;
    app.restart();
}
