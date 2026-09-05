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
        // P50.2.6/P50.3.6 — enumerate the live vault key set instead of a
        // hardcoded provider list, so keys for any provider (xai, mistral,
        // togetherai, cerebras, zai, …) are visible to the gate, the
        // NoProvider card, and the routing feed. Locked/empty vault ⇒ empty.
        ring.providers_with_keys().unwrap_or_default()
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
    ring.delete_key(&provider, &key_id)
        .map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "ok": true, "provider": provider, "keyId": key_id }))
}

/// P51.1 — rotate one provider key in place (mints a new opaque handle,
/// zeroes the failure/cooldown counters). The new secret travels once over
/// the already-trusted webview→shell invoke boundary into the vault.
#[tauri::command]
pub fn vault_key_rotate(
    state: State<'_, AppState>,
    provider: String,
    key_id: String,
    value: String,
) -> Result<serde_json::Value, String> {
    if value.trim().is_empty() {
        return Err("refusing to rotate to an empty key".to_string());
    }
    let vault = state.vault.lock().map_err(|e| e.to_string())?;
    let ring = KeyRing::new(&vault);
    let handle = ring
        .rotate_key(&provider, &key_id, value.as_bytes())
        .map_err(|e| e.to_string())?;
    Ok(serde_json::json!({
        "ok": true,
        "provider": provider,
        "keyId": key_id,
        "opaqueHandle": handle,
    }))
}
