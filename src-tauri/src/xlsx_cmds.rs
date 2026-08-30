//! P4.2 / D2 — Excel Tauri commands: `xlsx_open` (windowed calamine read),
//! `xlsx_recalc` (IronCalc truth engine), and the Guard-2-ticketed cell edit
//! split (`xlsx_edit_request` → decision package + ticket; `xlsx_edit_commit`
//! → `use_ticket` + surgical part-patch). A cell write is a renderable
//! approval card, never a silent mutation.

use everyaios_core::GuardDecision;
use everyaios_guard::{DecisionPackage, Operation as GuardOp, RiskLevel};
use everyaios_office::xlsx::address::{parse_range, parse_ref};
use everyaios_office::xlsx::dsl::{
    pivot_result, Operation as XlsxOp, PivotAgg, Scalar, WorkbookCommandBatch,
};
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
    let path_buf = crate::control::floor_user_file(&path)?;
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
    let path = crate::control::floor_user_file(&path)?;
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
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
    let path = crate::control::floor_user_file(&path)?
        .display()
        .to_string();

    let decision = DecisionPackage::new(format!("Set {address} to {value}"))
        .with_risk(RiskLevel::Medium)
        .with_paths(vec![path.clone()]);

    let args_hash = edit_args_hash(&path, &sheet, &address, &value);
    let mut guard = state.guard_service.lock().map_err(|e| e.to_string())?;
    let verdict = guard.evaluate(
        "office",
        "everyaios",
        "office.xlsx_edit",
        GuardOp::GenericWrite,
        decision,
        &args_hash,
        0,
    );
    match verdict {
        GuardDecision::Allow { ticket_id } => {
            let approval_nonce = guard.approval_nonce(&ticket_id).unwrap_or("").to_string();
            Ok(serde_json::json!({
                "action": "allow",
                "address": address,
                "value": value,
                "ticketId": ticket_id,
                "approvalNonce": approval_nonce,
            }))
        }
        GuardDecision::Ask { ticket_id } => {
            let approval_nonce = guard.approval_nonce(&ticket_id).unwrap_or("").to_string();
            Ok(serde_json::json!({
                "action": "ask",
                "address": address,
                "value": value,
                "ticketId": ticket_id,
                "approvalNonce": approval_nonce,
            }))
        }
        GuardDecision::Block { reason } => Err(format!("edit blocked: {reason}")),
    }
}

/// P4.7 — the executor half of a cell edit: consume the ticket (**mandatory**
/// — single-use + args-hash match; approval is a hard prerequisite), then read
/// → patch → write the workbook byte-preserving (atomic temp+rename). Formula
/// writes go through the recalc engine (the LLM never supplies a number); the
/// patch rewrites only the changed sheet part.
#[tauri::command]
pub fn xlsx_edit_commit(
    state: State<'_, AppState>,
    path: String,
    sheet: String,
    address: String,
    value: String,
    ticket_id: String,
) -> Result<serde_json::Value, String> {
    let path = crate::control::floor_user_file(&path)?
        .display()
        .to_string();
    let (_, cell) = parse_ref(&address).map_err(|e| e.to_string())?;

    // The ticket is mandatory: no ticket, no mutation. `use_ticket` enforces
    // approval + single-use + args-hash match in one call.
    let args_hash = edit_args_hash(&path, &sheet, &address, &value);
    let mut guard = state.guard_service.lock().map_err(|e| e.to_string())?;
    guard
        .use_ticket(&ticket_id, &args_hash)
        .map_err(|e| format!("edit ticket not consumable: {e}"))?;
    drop(guard);

    crate::control::snapshot_file(&*state, "office", &path);
    let bytes = std::fs::read(PathBuf::from(&path)).map_err(|e| e.to_string())?;
    let mut batch = WorkbookCommandBatch::new(0, format!("Set {address} to {value}"));
    batch.operations.push(XlsxOp::SetCell {
        address: cell,
        value: parse_scalar(&value),
    });

    let outcome = apply_batch(&bytes, &batch, &sheet).map_err(|e| e.to_string())?;
    atomic_write(&path, &outcome.bytes).map_err(|e| e.to_string())?;

    let audit_seq = crate::control::record_mutation(
        &*state,
        crate::control::AuthKind::AgentTicket,
        "office.xlsx_edit",
        serde_json::json!({
            "path": path,
            "sheet": sheet,
            "address": address,
            "ticketId": ticket_id,
        }),
    );

    Ok(serde_json::json!({
        "address": address,
        "sheet": sheet,
        "changedParts": outcome.changed_parts,
        "auditSeq": audit_seq,
    }))
}

/// P4.7 — Guard-2 plan-before-touch for a **bulk** batch (fill / sort / …).
/// The batch is the typed DSL [`WorkbookCommandBatch`] (deserialized from the
/// UI); the goal on the card is the batch's summary line.
#[tauri::command]
pub fn xlsx_batch_request(
    state: State<'_, AppState>,
    path: String,
    sheet: String,
    batch: WorkbookCommandBatch,
) -> Result<serde_json::Value, String> {
    let path = crate::control::floor_user_file(&path)?
        .display()
        .to_string();
    let decision = DecisionPackage::new(batch.summary.clone())
        .with_risk(RiskLevel::Medium)
        .with_paths(vec![path.clone()]);

    let args_hash = batch_args_hash(&sheet, &batch);
    let mut guard = state.guard_service.lock().map_err(|e| e.to_string())?;
    let verdict = guard.evaluate(
        "office",
        "everyaios",
        "office.xlsx_batch",
        GuardOp::GenericWrite,
        decision,
        &args_hash,
        0,
    );
    match verdict {
        GuardDecision::Allow { ticket_id } => {
            let approval_nonce = guard.approval_nonce(&ticket_id).unwrap_or("").to_string();
            Ok(serde_json::json!({
                "action": "allow",
                "summary": batch.summary,
                "ticketId": ticket_id,
                "approvalNonce": approval_nonce,
            }))
        }
        GuardDecision::Ask { ticket_id } => {
            let approval_nonce = guard.approval_nonce(&ticket_id).unwrap_or("").to_string();
            Ok(serde_json::json!({
                "action": "ask",
                "summary": batch.summary,
                "ticketId": ticket_id,
                "approvalNonce": approval_nonce,
            }))
        }
        GuardDecision::Block { reason } => Err(format!("batch blocked: {reason}")),
    }
}

/// P4.7 — the executor half of a bulk batch: consume the ticket (**mandatory**),
/// then apply the batch byte-preserving and write the changed part atomically.
#[tauri::command]
pub fn xlsx_batch_commit(
    state: State<'_, AppState>,
    path: String,
    sheet: String,
    batch: WorkbookCommandBatch,
    ticket_id: String,
) -> Result<serde_json::Value, String> {
    let path = crate::control::floor_user_file(&path)?
        .display()
        .to_string();
    let args_hash = batch_args_hash(&sheet, &batch);
    let mut guard = state.guard_service.lock().map_err(|e| e.to_string())?;
    guard
        .use_ticket(&ticket_id, &args_hash)
        .map_err(|e| format!("batch ticket not consumable: {e}"))?;
    drop(guard);

    crate::control::snapshot_file(&*state, "office", &path);
    let bytes = std::fs::read(PathBuf::from(&path)).map_err(|e| e.to_string())?;
    let outcome = apply_batch(&bytes, &batch, &sheet).map_err(|e| e.to_string())?;
    atomic_write(&path, &outcome.bytes).map_err(|e| e.to_string())?;

    let audit_seq = crate::control::record_mutation(
        &*state,
        crate::control::AuthKind::AgentTicket,
        "office.xlsx_batch",
        serde_json::json!({
            "path": path,
            "sheet": sheet,
            "summary": batch.summary,
            "ticketId": ticket_id,
        }),
    );

    Ok(serde_json::json!({
        "summary": batch.summary,
        "sheet": sheet,
        "changedParts": outcome.changed_parts,
        "auditSeq": audit_seq,
    }))
}

/// Write bytes atomically: temp file + rename in the same directory (never a
/// half-written workbook on crash/error).
fn atomic_write(path: &str, bytes: &[u8]) -> Result<(), std::io::Error> {
    let p = PathBuf::from(path);
    let dir = p.parent().ok_or_else(|| {
        std::io::Error::new(std::io::ErrorKind::InvalidInput, "path has no parent")
    })?;
    let file_name = p.file_name().and_then(|n| n.to_str()).ok_or_else(|| {
        std::io::Error::new(std::io::ErrorKind::InvalidInput, "path has no file name")
    })?;
    let tmp = dir.join(format!(".{file_name}.tmp-{}", std::process::id()));
    std::fs::write(&tmp, bytes)?;
    std::fs::rename(&tmp, p)
}

/// P4.7 — read-only pivot: group a source range and return the in-memory
/// summary. No write, so no Guard-2 ticket. `group_by`/`aggregate` are
/// 0-based column offsets *within* the source range.
#[tauri::command]
pub fn xlsx_pivot(
    path: String,
    sheet: String,
    source: String,
    group_by: usize,
    aggregate: usize,
    agg: String,
) -> Result<serde_json::Value, String> {
    let path = crate::control::floor_user_file(&path)?;
    let (_, range) = parse_range(&source).map_err(|e| e.to_string())?;
    let agg = match agg.as_str() {
        "sum" => PivotAgg::Sum,
        "count" => PivotAgg::Count,
        _ => PivotAgg::Avg,
    };
    let rows = read::read_range(path.as_path(), &sheet, &range).map_err(|e| e.to_string())?;
    let out = pivot_result(&rows, group_by, aggregate, agg);
    serde_json::to_value(&out).map_err(|e| e.to_string())
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

/// Deterministic, scope-tagged args hash for a bulk batch ticket: canonical
/// JSON of the batch (serde preserves field/operation order) + the target
/// sheet, so a ticket minted for one sheet can't be replayed on another.
fn batch_args_hash(sheet: &str, batch: &WorkbookCommandBatch) -> String {
    let mut h = std::collections::hash_map::DefaultHasher::new();
    "office.xlsx_batch".hash(&mut h);
    sheet.hash(&mut h);
    serde_json::to_string(batch)
        .unwrap_or_default()
        .hash(&mut h);
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

    #[test]
    fn batch_args_hash_is_deterministic_and_sheet_scoped() {
        let mut b1 = WorkbookCommandBatch::new(0, "Fill B2:B10 with 5");
        b1.operations.push(XlsxOp::FillRange {
            range: parse_range("B2:B10").unwrap().1,
            mode: everyaios_office::xlsx::dsl::FillMode::Constant,
            value: Some(Scalar::Number(5.0)),
        });
        let mut b2 = b1.clone();
        b2.operations[0] = XlsxOp::FillRange {
            range: parse_range("B2:B10").unwrap().1,
            mode: everyaios_office::xlsx::dsl::FillMode::Constant,
            value: Some(Scalar::Number(6.0)),
        };

        assert_eq!(
            batch_args_hash("Sheet1", &b1),
            batch_args_hash("Sheet1", &b1)
        );
        assert_ne!(
            batch_args_hash("Sheet1", &b1),
            batch_args_hash("Sheet2", &b1)
        );
        assert_ne!(
            batch_args_hash("Sheet1", &b1),
            batch_args_hash("Sheet1", &b2)
        );
    }
}
