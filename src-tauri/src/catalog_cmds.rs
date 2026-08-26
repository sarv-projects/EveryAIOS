//! P14.5 — model-catalog sync automation Tauri commands.
//!
//! The `everyaios-catalog` crate owns the two halves of the maintenance
//! loop (doc 66 §1.4): per-provider `SyncSpec` modules and the
//! `bun validate`-style gate (`validate_vendored` + `merge_refresh`).
//! This module is the runtime surface: the UI can (a) see the refresh plan
//! and (b) run one refresh over caller-supplied JSON. The live network
//! fetch and the vendored baseline both stay injected seams (the search /
//! registry clients use the same discipline) — the merge + gate are pure
//! and already tested.

use everyaios_catalog::{merge_refresh, refresh_plan, GateFinding, RefreshReport, Severity, SYNC_MODULES};
use serde_json::json;

/// The documented refresh plan — what one sync run would do (read-only,
/// no network). The UI shows this before asking the user to fetch.
#[tauri::command]
pub fn catalog_sync_plan() -> serde_json::Value {
    let modules: Vec<serde_json::Value> = SYNC_MODULES
        .iter()
        .map(|s| {
            json!({
                "provider": s.provider,
                "source": s.source,
                "writableFields": s.writable_fields,
            })
        })
        .collect();
    json!({
        "modules": modules,
        "plan": refresh_plan(),
    })
}

/// Run one refresh. `baselineJson` is the vendored `models.json` array the
/// app shipped with; `fetchedJson` is the live fetch output (same shape).
/// The gate runs over the *merged* candidate set — a gate error rejects the
/// whole refresh, never a partial baseline. `knownLabs` is the canonical
/// lab-model id set from the baseline (a fact, never derived from the fetch).
#[tauri::command]
pub fn catalog_sync_refresh(
    baseline_json: String,
    fetched_json: String,
    known_labs: Vec<String>,
) -> Result<serde_json::Value, String> {
    let baseline: Vec<everyaios_catalog::ModelEntry> = serde_json::from_str(&baseline_json)
        .map_err(|e| format!("catalog refresh: bad baseline JSON: {e}"))?;
    let fetched: Vec<everyaios_catalog::ModelEntry> = serde_json::from_str(&fetched_json)
        .map_err(|e| format!("catalog refresh: bad fetched JSON: {e}"))?;
    let labs: Vec<&str> = known_labs.iter().map(String::as_str).collect();
    let report: RefreshReport = merge_refresh(&baseline, &fetched, &labs);
    Ok(json!({
        "accepted": report.accepted,
        "fetchedProviders": report.fetched_providers,
        "acceptedEntries": report.accepted_entries,
        "rejectedProviders": report.rejected_providers,
        "findings": report
            .findings
            .iter()
            .map(|f: &GateFinding| json!({
                "severity": match f.severity {
                    Severity::Error => "error",
                    Severity::Warning => "warning",
                },
                "message": f.message,
            }))
            .collect::<Vec<_>>(),
    }))
}
