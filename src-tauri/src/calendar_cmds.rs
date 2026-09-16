//! Calendar & Calendar Event IPC commands (Open WebUI parity & scheduling).
//!
//! Exposes CRUD operations for persistent calendars and AI-scheduled events
//! stored securely in the SQLCipher vault (`ui_calendars`, `ui_calendar_events`).

use everyaios_vault::{CalendarEventRow, CalendarRow};
use serde_json::Value;
use tauri::State;

use crate::AppState;

#[tauri::command]
pub fn calendar_list(state: State<'_, AppState>) -> Result<Value, String> {
    let vault = state.vault.lock().map_err(|e| e.to_string())?;
    let calendars = vault.list_ui_calendars().map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "calendars": calendars }))
}

#[tauri::command]
pub fn calendar_put(state: State<'_, AppState>, calendar: Value) -> Result<bool, String> {
    let row: CalendarRow = serde_json::from_value(calendar).map_err(|e| format!("bad calendar: {e}"))?;
    let vault = state.vault.lock().map_err(|e| e.to_string())?;
    vault.put_ui_calendar(&row).map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
pub fn calendar_delete(state: State<'_, AppState>, id: String) -> Result<bool, String> {
    let vault = state.vault.lock().map_err(|e| e.to_string())?;
    vault.delete_ui_calendar(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn calendar_event_list(
    state: State<'_, AppState>,
    calendar_id: Option<String>,
) -> Result<Value, String> {
    let vault = state.vault.lock().map_err(|e| e.to_string())?;
    let events = vault
        .list_ui_calendar_events(calendar_id.as_deref())
        .map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "events": events }))
}

#[tauri::command]
pub fn calendar_event_put(state: State<'_, AppState>, event: Value) -> Result<bool, String> {
    let row: CalendarEventRow =
        serde_json::from_value(event).map_err(|e| format!("bad calendar event: {e}"))?;
    let vault = state.vault.lock().map_err(|e| e.to_string())?;
    vault.put_ui_calendar_event(&row).map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
pub fn calendar_event_delete(state: State<'_, AppState>, id: String) -> Result<bool, String> {
    let vault = state.vault.lock().map_err(|e| e.to_string())?;
    vault.delete_ui_calendar_event(&id).map_err(|e| e.to_string())
}
