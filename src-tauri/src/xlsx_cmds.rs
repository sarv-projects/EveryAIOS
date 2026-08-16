//! P4.2 / D2 — Excel Tauri commands: `xlsx_open` (windowed calamine read),
//! `xlsx_recalc` (IronCalc truth engine), and the Guard-2-ticketed cell edit
//! split (`xlsx_edit_request` → decision package + ticket; `xlsx_edit_commit`
//! → `use_ticket` + surgical part-patch). A cell write is a renderable
//! approval card, never a silent mutation.

use everyaios_core::GuardDecision;
use everyaios_guard::{DecisionPackage, Operation as GuardOp, RiskLevel};
use everyaios_office::xlsx::address::parse_ref;
use everyaios_office::xlsx::dsl::{Operation as XlsxOp, Scalar, WorkbookCommandBatch};
use everyaios_office::xlsx::patch::apply_batch;
use everyaios_office::xlsx::read::{self, CellValue, SheetMeta, SheetWindow};
use everyaios_office::xlsx::recalc::{self, RecalcResult};
use std::hash::{Hash, Hasher};
use std::path::PathBuf;
use tauri::State;

use crate::AppState;

/// Metadata for one opened workbook + one windowed slice of a sheet.
#[derive(Debug, serde::Serialize)]
pub struct XlsxWindowPayload {
    pub path: String,
    pub sheets: Vec<SheetMeta>,
    pub sheet: String,
    pub offset: u32,
    pub total_rows: u32,
    pub total_cols: u32,
    pub rows: Vec<Vec<CellValue>>,
}

/// Open a workbook and return a windowed slice of one sheet. `sheet` picks
/// the tab (defaults to the first); `offset`/`limit` window rows.
#[tauri::command]
pub fn xlsx_open(
    path: String,
    sheet: Option<String>,
    offset: u32,
    limit: u32,
) -> Result<XlsxWindowPayload, String> {
    let path_buf = PathBuf::from(&path);
    let meta = read::open(&path_buf).map_err(|e| e.to_string())?;

    let sheet_name = match &sheet {
        Some(s) if meta.sheets.iter().any(|m| m.name == *s) => s.clone(),
        Some(s) => return Err(format!("sheet not found: {s}")),
        None => meta
            .sheets
            .first()
            .map(|m| m.name.clone())
            .ok_or_else(|| "workbook has no sheets".to_string())?,
    };

    let window: SheetWindow =
        read::read_window(&path_buf, &sheet_name, offset, limit).map_err(|e| e.to_string())?;

    Ok(XlsxWindowPayload {
        path: meta.path,
        sheets: meta.sheets,
        sheet: window.sheet,
        offset: window.offset,
        total_rows: window.total_rows,
        total_cols: window.total_cols,
        rows: window.rows,
    })
}

/// P4.2/D2 — run the IronCalc truth engine over a workbook and return every
/// engine-computed value. This is the "LLM never invents a number" surface:
/// the formula bar's Recalc action shows formula_cells + computed values.
#[tauri::command]
pub fn xlsx_recalc(path: String) -> Result<RecalcResult, String> {
    let bytes = std::fs::read(PathBuf::from(&path)).map_err(|e| e.to_string())?;
    recalc::recalc(&bytes).map_err(|e| e.to_string())
}

/// P4.7 — Guard-2 "plan-before-touch" for a cell edit. Nothing is written:
/// resolve the plan (goal + paths + risk), route it through the shared
/// [`everyaios_core::GuardService`], and return `allow` (commit directly) or
/// `ask` (a ticket the approval card renders). [`xlsx_edit_commit`] is the
/// executor half.
#[tauri::command]
pub fn xlsx_edit_request(
    state: State<'_, AppState>,
    path: String,
    sheet: String,
    address: String,
    value: String,
) -> Result<serde_json::Value, String> {
    // Validate the address up-front so the card never shows a bad ref.
    parse_ref(&address).map_err(|e| e.to_string())?;

    let decision = DecisionPackage::new(format!("Set {address} to {value}"))
        .with_risk(RiskLevel::Medium)
        .with_paths(vec![path.clone()]);

    let args_hash = edit_args_hash(&path, &sheet, &address, &value);
    let mut guard = state
        .guard_service
        .lock()
        .map_err(|e| e.to_string())?;
    match guard.evaluate(
        "office",
        "everyaios",
        "office.xlsx_edit",
        GuardOp::GenericWrite,
        decision,
        &args_hash,
        0,
    ) {
        GuardDecision::Allow => Ok(serde_json::json!({
            "action": "allow",
            "address": address,
            "value": value,
        })),
        GuardDecision::Ask { ticket_id } => Ok(serde_json::json!({
            "action": "ask",
            "address": address,
            "value": value,
            "ticketId": ticket_id,
        })),
        GuardDecision::Block { reason } => Err(format!("edit blocked: {reason}")),
    }
}

/// P4.7 — the executor half of a cell edit: consume the ticket (single-use +
/// args-hash match), then read → patch → write the workbook byte-preserving.
/// Formula writes go through the recalc engine (the LLM never supplies a
/// number); the patch rewrites only the changed sheet part.
#[tauri::command]
pub fn xlsx_edit_commit(
    state: State<'_, AppState>,
    path: String,
    sheet: String,
    address: String,
    value: String,
    ticket_id: Option<String>,
) -> Result<serde_json::Value, String> {
    let (_, cell) = parse_ref(&address).map_err(|e| e.to_string())?;

    if let Some(tid) = ticket_id {
        let args_hash = edit_args_hash(&path, &sheet, &address, &value);
        let mut guard = state
            .guard_service
            .lock()
            .map_err(|e| e.to_string())?;
        guard
            .use_ticket(&tid, &args_hash)
            .map_err(|e| format!("edit ticket not consumable: {e}"))?;
    }

    let bytes = std::fs::read(PathBuf::from(&path)).map_err(|e| e.to_string())?;
    let mut batch = WorkbookCommandBatch::new(0, format!("Set {address} to {value}"));
    batch.operations.push(XlsxOp::SetCell {
        address: cell,
        value: parse_scalar(&value),
    });

    let outcome = apply_batch(&bytes, &batch, &sheet).map_err(|e| e.to_string())?;
    std::fs::write(PathBuf::from(&path), &outcome.bytes).map_err(|e| e.to_string())?;

    Ok(serde_json::json!({
        "address": address,
        "sheet": sheet,
        "changedParts": outcome.changed_parts,
    }))
}

/// Parse a UI-typed value string into the DSL scalar (number/bool/text).
fn parse_scalar(value: &str) -> Scalar {
    let t = value.trim();
    if t.eq_ignore_ascii_case("true") {
        Scalar::Bool(true)
    } else if t.eq_ignore_ascii_case("false") {
        Scalar::Bool(false)
    } else if let Ok(n) = t.parse::<f64>() {
        Scalar::Number(n)
    } else {
        Scalar::Text(value.to_string())
    }
}

/// Deterministic, scope-tagged args hash for the ticket match.
fn edit_args_hash(path: &str, sheet: &str, address: &str, value: &str) -> String {
    let mut h = std::collections::hash_map::DefaultHasher::new();
    "office.xlsx_edit".hash(&mut h);
    path.hash(&mut h);
    sheet.hash(&mut h);
    address.hash(&mut h);
    value.hash(&mut h);
    format!("{:016x}", h.finish())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_scalar_types() {
        assert_eq!(parse_scalar("42"), Scalar::Number(42.0));
        assert_eq!(parse_scalar("3.5"), Scalar::Number(3.5));
        assert_eq!(parse_scalar("true"), Scalar::Bool(true));
        assert_eq!(parse_scalar("FALSE"), Scalar::Bool(false));
        assert_eq!(parse_scalar("hello"), Scalar::Text("hello".into()));
    }

    #[test]
    fn edit_args_hash_is_deterministic_and_scoped() {
        let a = edit_args_hash("/w/a.xlsx", "Sheet1", "B4", "42");
        let b = edit_args_hash("/w/a.xlsx", "Sheet1", "B4", "42");
        assert_eq!(a, b);
        // Any change in any scope field changes the hash (ticket mismatch).
        assert_ne!(a, edit_args_hash("/w/a.xlsx", "Sheet1", "B4", "43"));
        assert_ne!(a, edit_args_hash("/w/a.xlsx", "Sheet1", "B5", "42"));
        assert_ne!(a, edit_args_hash("/w/a.xlsx", "Sheet2", "B4", "42"));
        assert_ne!(a, edit_args_hash("/w/b.xlsx", "Sheet1", "B4", "42"));
    }

    #[test]
    fn edit_request_rejects_bad_address() {
        // parse_ref must fail on an empty/garbage address — the card never
        // shows a bad ref.
        assert!(parse_ref("").is_err());
        assert!(parse_ref("!!").is_err());
        assert!(parse_ref("B4").is_ok());
        assert!(parse_ref("AA12").is_ok());
    }
}
