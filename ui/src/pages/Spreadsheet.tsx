import { useCallback, useEffect, useRef, useState } from "react";
import {
  cellDisplay,
  colLetter,
  demoRow,
  xlsxOpen,
  type CellValue,
  type SheetMeta,
  type SheetWindow,
} from "../lib/spreadsheet";
import { inTauri } from "../lib/tauri";

const ROW_H = 26; // px per row
const OVERSCAN = 20;
const PAGE = 500; // rows fetched per windowed read

function DemoGrid() {
  // Client-side virtualization over a synthetic 100K-row sheet (no shell).
  const [scrollTop, setScrollTop] = useState(0);
  const [viewH, setViewH] = useState(600);
  const total = 100_000;
  const first = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
  const last = Math.min(total, Math.ceil((scrollTop + viewH) / ROW_H) + OVERSCAN);
  const rows: number[] = [];
  for (let r = first; r < last; r++) rows.push(r);
  return (
    <GridShell totalRows={total} totalCols={6} onScroll={setScrollTop} onView={setViewH} rowAt={demoRow} loaded={rows} />
  );
}

function GridShell({
  totalRows,
  totalCols,
  onScroll,
  onView,
  rowAt,
  loaded,
}: {
  totalRows: number;
  totalCols: number;
  onScroll: (top: number) => void;
  onView: (h: number) => void;
  rowAt: (row: number) => CellValue[];
  loaded: number[];
}) {
  const scroller = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => onView(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [onView]);

  const headers = [];
  for (let c = 1; c <= totalCols; c++) headers.push(colLetter(c));

  return (
    <div className="grid-viewport" ref={scroller} onScroll={(e) => onScroll(e.currentTarget.scrollTop)}>
      <div className="grid-spacer" style={{ height: totalRows * ROW_H }}>
        <table className="grid-table">
          <thead>
            <tr>
              <th className="corner" />
              {headers.map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loaded.map((r) => (
              <tr key={r} className="grid-row" style={{ height: ROW_H }}>
                <td className="rownum">{r + 1}</td>
                {rowAt(r).map((v, c) => (
                  <td key={c} title={cellDisplay(v)}>
                    {cellDisplay(v)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function Spreadsheet() {
  const [path, setPath] = useState("");
  const [sheets, setSheets] = useState<SheetMeta[]>([]);
  const [sheet, setSheet] = useState<string | null>(null);
  const [win, setWin] = useState<SheetWindow | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewH, setViewH] = useState(600);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const first = useRef(0); // first row index of the last fetched window
  const totalRows = win?.total_rows ?? 0;
  const totalCols = win?.total_cols ?? 0;

  // Fetch the window covering the visible range (P4.2 virtualization:
  // windowed calamine reads, only the visible rows cross the bridge).
  const loadWindow = useCallback(
    async (off: number) => {
      if (!inTauri()) return;
      setLoading(true);
      try {
        const res = await xlsxOpen(path, sheet, off, PAGE);
        setSheets(res.sheets);
        setSheet(res.sheet);
        setWin(res);
        first.current = res.offset;
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    },
    [path, sheet],
  );

  // Initial load + sheet switches.
  useEffect(() => {
    if (!inTauri()) return;
    if (!path.trim()) return;
    setWin(null);
    setScrollTop(0);
    void loadWindow(0);
  }, [path, sheet, loadWindow]);

  const onScroll = useCallback(
    (top: number) => {
      setScrollTop(top);
      const need = Math.floor(top / ROW_H);
      const haveFirst = first.current;
      const haveLast = haveFirst + (win?.rows.length ?? 0);
      // Page in a new window when the visible range leaves the fetched one.
      if (need < haveFirst || need + Math.ceil(viewH / ROW_H) > haveLast) {
        void loadWindow(need);
      }
    },
    [viewH, win, loadWindow],
  );

  const onOpen = () => {
    setError(null);
    void loadWindow(0);
  };

  const tauri = inTauri();

  return (
    <div className="spreadsheet">
      <header className="spreadsheet-head">
        <div>
          <h2 className="panel-title">Sheets</h2>
          <p className="muted small">
            Virtualized 100K+ row grid — calamine windowed reads (D2); the full viewer lands in P4.7.
          </p>
        </div>
        {tauri && (
          <div className="open-row">
            <input
              className="path-input mono small"
              placeholder="/path/to/workbook.xlsx"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onOpen()}
            />
            <button className="ghost" onClick={onOpen} disabled={!path.trim() || loading}>
              {loading ? "Loading…" : "Open"}
            </button>
          </div>
        )}
      </header>

      {!tauri && <p className="muted small banner">Preview mode: 100K synthetic rows (real file reads run in the Tauri shell).</p>}

      {error && <div className="error-banner small">{error}</div>}

      {sheets.length > 1 && (
        <div className="sheet-tabs">
          {sheets.map((s) => (
            <button
              key={s.name}
              className={`sheet-tab${sheet === s.name ? " active" : ""}`}
              onClick={() => setSheet(s.name)}
            >
              {s.name}
              <span className="muted"> {s.rows.toLocaleString()}r</span>
            </button>
          ))}
        </div>
      )}

      {(tauri && win) || !tauri ? (
        tauri ? (
          <WindowedGrid win={win} scrollTop={scrollTop} viewH={viewH} onScroll={onScroll} onView={setViewH} />
        ) : (
          <DemoGrid />
        )
      ) : (
        <div className="empty">
          <h3>No workbook open</h3>
          <p className="muted">Enter a path above (or open a file in the shell) to start.</p>
        </div>
      )}

      {win && (
        <div className="muted small grid-stats mono">
          {sheet} · {totalRows.toLocaleString()} rows × {totalCols} cols · viewing {Math.floor(scrollTop / ROW_H) + 1}–
          {Math.floor((scrollTop + viewH) / ROW_H)} · fetched [{first.current}, {first.current + (win.rows.length ?? 0)})
        </div>
      )}
    </div>
  );
}

function WindowedGrid({
  win,
  scrollTop,
  viewH,
  onScroll,
  onView,
}: {
  win: SheetWindow | null;
  scrollTop: number;
  viewH: number;
  onScroll: (top: number) => void;
  onView: (h: number) => void;
}) {
  if (!win) return null;
  const total = win.total_rows;
  const firstRow = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
  const lastRow = Math.min(total, Math.ceil((scrollTop + viewH) / ROW_H) + OVERSCAN);
  const loaded = [];
  for (let r = firstRow; r < lastRow; r++) loaded.push(r);
  return (
    <GridShell
      totalRows={total}
      totalCols={win.total_cols}
      onScroll={onScroll}
      onView={onView}
      loaded={loaded}
      rowAt={(r) => {
        // `win.rows` is a windowed slice starting at absolute row `win.offset`.
        const rel = r - win.offset;
        if (rel >= 0 && rel < win.rows.length) return win.rows[rel];
        return emptyRow(win.total_cols);
      }}
    />
  );
}

function emptyRow(cols: number): CellValue[] {
  const out: CellValue[] = [];
  for (let c = 0; c < cols; c++) out.push({ Empty: null });
  return out;
}
