// P4.2 — Excel bridge (D2): windowed sheet reads over the Rust calamine
// reader. Mirrors everyaios-office/src/xlsx/read.rs types. In a plain-browser
// preview (no shell) the page falls back to a 100K-row demo grid so the
// virtualization is explorable.

import { invoke } from "./tauri";

export type CellValue =
  | { Empty: null }
  | { Number: number }
  | { Text: string }
  | { Bool: boolean }
  | { Error: string };

export interface SheetMeta {
  name: string;
  rows: number;
  cols: number;
}

export interface SheetWindow {
  sheet: string;
  offset: number;
  total_rows: number;
  total_cols: number;
  rows: CellValue[][];
}

export interface XlsxWindowPayload extends SheetWindow {
  path: string;
  sheets: SheetMeta[];
}

/** Read one windowed slice of a sheet from a workbook path. */
export async function xlsxOpen(
  path: string,
  sheet: string | null,
  offset: number,
  limit: number,
): Promise<XlsxWindowPayload> {
  return invoke<XlsxWindowPayload>("xlsx_open", {
    path,
    sheet,
    offset,
    limit,
  });
}

export function cellDisplay(v: CellValue | undefined): string {
  if (!v) return "";
  if ("Empty" in v) return "";
  if ("Number" in v) {
    const n = v.Number as number;
    if (Number.isInteger(n) && Math.abs(n) < 1e15) return String(n);
    return String(n);
  }
  if ("Text" in v) return v.Text as string;
  if ("Bool" in v) return String(v.Bool);
  return `#${v.Error}`;
}

/** Column letter for a 1-based index (1→A, 27→AA). */
export function colLetter(idx: number): string {
  let n = idx;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

// ---------------------------------------------------------------------------
// demo fallback (plain-browser preview): 100K rows × 6 cols, virtualized
// ---------------------------------------------------------------------------

export function demoRow(row: number): CellValue[] {
  return [
    { Number: row + 1 },
    { Text: `Region ${String.fromCharCode(65 + (row % 5))}` },
    { Text: row % 7 === 0 ? "Quarterly" : "Monthly" },
    { Number: Math.round(((row * 7919) % 9973) * 10) / 10 },
    { Number: Math.round(((row * 104729) % 987654) * 100) / 100 },
    { Bool: row % 3 === 0 },
  ];
}
