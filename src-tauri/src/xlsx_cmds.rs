//! P4.2 — Excel Tauri commands (D2): `xlsx_open` reads a workbook via
//! calamine and returns a **windowed** slice of one sheet — the virtualized
//! 100K+ row table view pulls only the visible window (P4.2 item 9; the full
//! H5 viewer with formula bar / cell selection / chat overlay is P4.7).

use everyaios_office::xlsx::read::{self, CellValue, SheetMeta, SheetWindow};
use everyaios_office::xlsx::recalc::{self, RecalcResult};
use std::path::PathBuf;

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
