//! BYOK key-ring surface — list / add / remove keys in the SQLCipher vault.

use everyaios_vault::{KeyRing, KeySpec, KeyStatus};
use tauri::State;

use crate::AppState;

#[tauri::command]
pub fn vault_keys_list(
    state: State<'_, AppState>,
    provider: Option<String>,
) -> Result<serde_json::Value, String> {
    let vault = state.vault.lock().map_err(|e| e.to_string())?;
    let ring = KeyRing::new(&vault);
    let mut all = Vec::new();
    let providers = if let Some(p) = provider {
        vec![p]
    } else {
        // Distinct providers from a dummy empty list — KeyRing::list is per-provider.
        // Query sqlite via list of known broker providers.
        vec![
            "openai".into(),
            "anthropic".into(),
            "nvidia".into(),
            "deepseek".into(),
            "groq".into(),
            "openrouter".into(),
            "google".into(),
            "ollama".into(),
        ]
    };
    for p in providers {
        if let Ok(rows) = ring.list(&p) {
            all.extend(rows);
        }
    }
    Ok(serde_json::json!({ "keys": all }))
}

#[tauri::command]
pub fn vault_key_add(
    state: State<'_, AppState>,
    provider: String,
    key_id: String,
    value: String,
    priority: Option<u32>,
) -> Result<serde_json::Value, String> {
    if value.trim().is_empty() {
        return Err("key value required".into());
    }
    let vault = state.vault.lock().map_err(|e| e.to_string())?;
    let ring = KeyRing::new(&vault);
    let handle = ring
        .add_key(KeySpec {
            provider: provider.clone(),
            key_id: key_id.clone(),
            value: value.into_bytes(),
            status: KeyStatus::Primary,
            model_filter: Vec::new(),
            priority: priority.unwrap_or(100),
            daily_token_cap: None,
            daily_cost_cap: None,
        })
        .map_err(|e| e.to_string())?;
    Ok(serde_json::json!({
        "ok": true,
        "provider": provider,
        "keyId": key_id,
        "opaqueHandle": handle,
    }))
}

#[tauri::command]
pub fn vault_key_remove(
    state: State<'_, AppState>,
    provider: String,
    key_id: String,
) -> Result<serde_json::Value, String> {
    let vault = state.vault.lock().map_err(|e| e.to_string())?;
    let ring = KeyRing::new(&vault);
    ring.delete_key(&provider, &key_id).map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "ok": true, "provider": provider, "keyId": key_id }))
}
