//! P1.8 — local model picker (LM Studio-style fit badges + context floor).

use everyaios_core::{detect_hardware, LocalManager};
use tauri::State;

use crate::AppState;

#[tauri::command]
pub fn local_models() -> Result<serde_json::Value, String> {
    let cfg = everyaios_core::Config::load().unwrap_or_default();
    let mgr = LocalManager::from_config(&cfg);
    let hw = detect_hardware();
    Ok(serde_json::json!({
        "hardware": hw,
        "models": mgr.list_for_picker(),
        "ctxFloor": 15_000,
        "ctxSoft": 20_000,
    }))
}

#[tauri::command]
pub fn local_ensure(runtime: String, model: Option<String>) -> Result<serde_json::Value, String> {
    let cfg = everyaios_core::Config::load().unwrap_or_default();
    let mgr = LocalManager::from_config(&cfg);
    match runtime.as_str() {
        "ollama" => {
            mgr.ensure_ollama().map_err(|e| e.to_string())?;
            if let Some(name) = model.as_deref() {
                mgr.disqualify_unfit(name).map_err(|e| e.to_string())?;
            }
        }
        "llamafile" => {
            let bin = mgr
                .find_llamafile(&everyaios_core::default_data_dir())
                .ok_or_else(|| "no llamafile binary found".to_string())?;
            mgr.ensure_llamafile(bin, mgr.cfg.llamafile_port)
                .map_err(|e| e.to_string())?;
        }
        other => return Err(format!("unknown runtime {other}")),
    }
    Ok(serde_json::json!({ "ok": true, "runtime": runtime }))
}

#[tauri::command]
pub fn local_hardware(_state: State<'_, AppState>) -> serde_json::Value {
    serde_json::to_value(detect_hardware()).unwrap_or(serde_json::json!({}))
}
