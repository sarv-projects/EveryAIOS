'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Check, ChevronsUpDown, FileSpreadsheet, Loader2, ListFilter, RefreshCw, ShieldAlert, Sigma, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { inTauri } from '@/lib/tauri'
import { OfficeOpenBar } from './office-open-bar'
import OfficeFileSwitcher from './office-file-switcher'
import { OfficeRibbon } from './office-ribbon'
import { useAppStore } from '@/lib/store'
import { officeOpenExternal, isOfficeFloorError } from '@/lib/office'
import {
  cellDisplay,
  colLetter,
  demoRow,
  newBatch,
  type CellValue,
  parseRangeRef,
  scalar,
  xlsxBatchCommit,
  xlsxBatchRequest,
  xlsxEditCommit,
  xlsxEditRequest,
  xlsxOpen,
  xlsxPivot,
  xlsxRecalc,
  type PivotRow,
  type RecalcResult,
  type WorkbookBatch,
  type XlsxWindowPayload,
} from '@/lib/spreadsheet'

const COLS = ['A', 'B', 'C', 'D', 'E', 'F']

const CHART_BARS = [60, 67.5, 90, 105]

export default function OfficeXlsxView() {
  const [payload, setPayload] = useState<XlsxWindowPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<{ r: number; c: number } | null>(null)
  const [recalc, setRecalc] = useState<RecalcResult | null>(null)
  const [recalcing, setRecalcing] = useState(false)
  const [draft, setDraft] = useState('')
  const [proposal, setProposal] = useState<{
    address: string
    value: string
    ticketId: string
    approvalNonce: string
  } | null>(null)
  const [committing, setCommitting] = useState(false)
  // P50.3.7 — same attachment wiring as Word: the store owns the active
  // path/history/session label so tabs, rail, and sessions stay in sync.
  const officePath = useAppStore((s) => s.officePaths['office-xlsx'])

  // Bulk edit (range fill / sort) + read-only pivot.
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkRange, setBulkRange] = useState('')
  const [fillValue, setFillValue] = useState('')
  const [sortDesc, setSortDesc] = useState(false)
  const [pivotSource, setPivotSource] = useState('')
  const [pivotGroup, setPivotGroup] = useState('0')
  const [pivotAgg, setPivotAgg] = useState('1')
  const [pivotFn, setPivotFn] = useState<'sum' | 'count' | 'avg'>('sum')
  const [pivotRows, setPivotRows] = useState<PivotRow[] | null>(null)
  const [shiftKind, setShiftKind] = useState<'InsertRow' | 'DeleteRow' | 'InsertCol' | 'DeleteCol'>('InsertRow')
  const [shiftAt, setShiftAt] = useState('1')
  const [shiftCount, setShiftCount] = useState('1')
  const [batchProposal, setBatchProposal] = useState<{
    summary: string
    batch: WorkbookBatch
    ticketId: string
    approvalNonce: string
  } | null>(null)
  const [lastAttempted, setLastAttempted] = useState<string | null>(null)
  const running = useAppStore((s) => s.sessions.find((x) => x.id === s.activeSessionId)?.status === 'running')
  const paused = useAppStore((s) => s.pausedSessions[s.activeSessionId])
  // P1.9 — read-only while the agent is running (same lock as Word).
  const locked = running && !paused

  // P4.2 — virtualized 100K+ row grid (overscan windowing). Only the visible
  // slice (+overscan) is in the DOM; spacer rows fake the full scroll height.
  // Live mode caches fetched windows so scrolling advances the Rust window.
  const scrollRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportH, setViewportH] = useState(600)
  const rowCache = useRef<Map<number, CellValue[]>>(new Map())
  const loadedRef = useRef(0)
  const fetchingRef = useRef(false)

  const open = async (path: string, sheet: string | null = null) => {
    try {
      setError(null)
      const p = await xlsxOpen(path, sheet, 0, 500)
      rowCache.current = new Map()
      const start = p.offset + 1
      p.rows.forEach((row, i) => rowCache.current.set(start + i, row))
      loadedRef.current = p.offset + p.rows.length
      setPayload(p)
      useAppStore.getState().openOfficeDoc(path)
      setRecalc(null)
      setSelected(null)
      setScrollTop(0)
    } catch (err) {
      setLastAttempted(path)
      setError(err instanceof Error ? err.message : 'Failed to open workbook')
    }
  }

  // P50.3.7 — open the store-owned path (artifact / folder / tab-switch).
  useEffect(() => {
    if (officePath && officePath !== payload?.path) void open(officePath)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [officePath])

  // Advance the Rust window when the user scrolls near the loaded edge.
  const fetchMore = async () => {
    if (!payload || fetchingRef.current) return
    if (loadedRef.current >= payload.total_rows) return
    fetchingRef.current = true
    try {
      const p = await xlsxOpen(payload.path, payload.sheet, loadedRef.current, 500)
      const start = p.offset + 1
      p.rows.forEach((row, i) => rowCache.current.set(start + i, row))
      loadedRef.current = p.offset + p.rows.length
      // Refresh total_rows in case the backend refined it.
      setPayload((prev) => (prev ? { ...prev, total_rows: p.total_rows } : prev))
    } catch {
      /* window advance is best-effort — the visible slice still renders */
    } finally {
      fetchingRef.current = false
    }
  }

  const onScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setScrollTop(el.scrollTop)
    setViewportH(el.clientHeight)
    if (payload && el.scrollTop + el.clientHeight >= el.scrollHeight - 44) {
      void fetchMore()
    }
  }, [payload])

  const runRecalc = async () => {
    if (!payload || recalcing) return
    setRecalcing(true)
    try {
      setRecalc(await xlsxRecalc(payload.path))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Recalc failed')
    } finally {
      setRecalcing(false)
    }
  }

  // P4.2 — cells for a 0-based row (cached live window, or the 100K demo).
  const rowCells = (r: number): CellValue[] =>
    payload ? (rowCache.current.get(r + 1) ?? []) : inTauri() ? [] : demoRow(r)

  // Seed the draft with the displayed value when a cell is selected.
  const selectCell = (r: number, c: number) => {
    setSelected({ r, c })
    const v = computed(r, c) ?? cellDisplay(rowCells(r - 1)[c - 1])
    setDraft(v)
  }

  // P4.7 — propose an edit: Guard-2 plan-before-touch. `allow` carries a
  // pre-approved ticket (commit directly); `ask` renders the approval card.
  const propose = async () => {
    if (!payload || !selected) return
    const address = `${colLetter(selected.c)}${selected.r}`
    try {
      const req = await xlsxEditRequest(payload.path, payload.sheet, address, draft)
      if (req.action === 'allow') {
        await commitEdit(address, draft, req.ticketId, req.approvalNonce, false)
      } else {
        setProposal({ address, value: draft, ticketId: req.ticketId, approvalNonce: req.approvalNonce })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Edit failed')
    }
  }

  // F1 — the approval decision happens in the dedicated guard window. Open it
  // and wait for the ticket to be consumed (approved or rejected); a rejected
  // ticket makes the follow-up commit fail honestly with a revoked-ticket
  // error. The guard window's `guard_respond` is the only one Rust accepts.
  const openApproval = async (ticketId: string): Promise<void> => {
    const { openGuardWindow } = await import('@/lib/guard')
    await openGuardWindow()
    const deadline = Date.now() + 120_000
    for (;;) {
      const { guardTickets } = await import('@/lib/guard')
      const tickets = await guardTickets().catch(() => null)
      if (tickets === null) return // shell not ready — commit fails honestly
      if (!tickets.some((t) => t.ticketId === ticketId)) return
      if (Date.now() > deadline) throw new Error('Timed out waiting for the approval decision')
      await new Promise((r) => setTimeout(r, 400))
    }
  }

  const commitEdit = async (
    address: string,
    value: string,
    ticketId: string,
    approvalNonce: string,
    approve: boolean,
  ) => {
    if (!payload || committing) return
    setCommitting(true)
    try {
      // F1 — `ask` tickets are decided in the dedicated guard window (the
      // main renderer cannot approve). We open it and wait for the human's
      // decision; a rejected ticket then makes the commit fail honestly
      // (revoked-ticket error). `allow` tickets are pre-approved.
      if (approve) await openApproval(ticketId)
      await xlsxEditCommit(payload.path, payload.sheet, address, value, ticketId)
      setProposal(null)
      setDraft(value)
      // Re-read + re-verify: the changed cell flashes via the recalc diff.
      await open(payload.path)
      setRecalc(await xlsxRecalc(payload.path))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Commit failed')
    } finally {
      setCommitting(false)
    }
  }

  // P4.7 — bulk batch (fill/sort) through the same Guard-2 split.
  const proposeBatch = async (batch: WorkbookBatch) => {
    if (!payload) return
    try {
      const req = await xlsxBatchRequest(payload.path, payload.sheet, batch)
      if (req.action === 'allow') {
        await commitBatch(batch, req.ticketId, req.approvalNonce, false)
      } else {
        setBatchProposal({ summary: batch.summary, batch, ticketId: req.ticketId, approvalNonce: req.approvalNonce })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bulk edit failed')
    }
  }

  const commitBatch = async (
    batch: WorkbookBatch,
    ticketId: string,
    approvalNonce: string,
    approve: boolean,
  ) => {
    if (!payload || committing) return
    setCommitting(true)
    try {
      if (approve) await openApproval(ticketId)
      await xlsxBatchCommit(payload.path, payload.sheet, batch, ticketId)
      setBatchProposal(null)
      setPivotRows(null)
      await open(payload.path)
      setRecalc(await xlsxRecalc(payload.path))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Batch commit failed')
    } finally {
      setCommitting(false)
    }
  }

  const runFill = () => {
    const range = parseRangeRef(bulkRange)
    if (!range || fillValue === '') {
      setError('Fill needs a range (e.g. B7:B12) and a value')
      return
    }
    const batch = newBatch(`Fill ${bulkRange} with ${fillValue}`, [
      { FillRange: { range, mode: 'Constant', value: scalar(fillValue) } },
    ])
    void proposeBatch(batch)
  }

  const runSort = () => {
    const range = parseRangeRef(bulkRange)
    if (!range) {
      setError('Sort needs a range (e.g. A1:F20)')
      return
    }
    const batch = newBatch(`Sort ${bulkRange} by col ${sortDesc ? '↓' : '↑'}`, [
      { SortRange: { range, by_col: range.start.col, desc: sortDesc } },
    ])
    void proposeBatch(batch)
  }

  const runPivot = async () => {
    if (!payload || !pivotSource) return
    try {
      setError(null)
      setPivotRows(
        await xlsxPivot(
          payload.path,
          payload.sheet,
          pivotSource,
          Number(pivotGroup) || 0,
          Number(pivotAgg) || 1,
          pivotFn,
        ),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Pivot failed')
    }
  }

  // Structural shift (insert/delete row/col) — the patch layer rewrites every
  // formula on the target sheet via `shift_formula`.
  const runShift = () => {
    if (!payload) return
    const at = Number(shiftAt)
    const count = Number(shiftCount)
    if (!Number.isInteger(at) || at < 1 || !Number.isInteger(count) || count < 1) {
      setError('Shift needs a 1-based row/col index and a count ≥ 1')
      return
    }
    const batch = newBatch(`${shiftKind} at ${at} × ${count}`, [
      { Shift: { sheet: payload.sheet, kind: shiftKind, at, count } },
    ])
    void proposeBatch(batch)
  }

  const colCount = payload ? payload.total_cols : COLS.length
  const columns = Array.from({ length: colCount }, (_, i) => colLetter(i + 1))

  // IronCalc-computed value for a 1-based (row, col), else null.
  const computed = (r: number, c: number): string | null => {
    if (!recalc) return null
    for (const sheet of recalc.sheets) {
      for (const cell of sheet.cells) {
        if (cell.row === r && cell.col === c) return cellDisplay(cell.value)
      }
    }
    return null
  }

  const selRef = selected ? `${colLetter(selected.c)}${selected.r}` : 'B4'
  const selValue = selected
    ? computed(selected.r, selected.c) ?? cellDisplay(rowCells(selected.r - 1)[selected.c - 1])
    : ''

  // P4.2 — overscan window over the full row space (100K demo / live sheet).
  const ROW_HEIGHT = 22
  const OVERSCAN = 12
  const totalRows = payload ? payload.total_rows : inTauri() ? 0 : 100_000
  const startRow = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN)
  const endRow = Math.min(totalRows, Math.ceil((scrollTop + viewportH) / ROW_HEIGHT) + OVERSCAN)

  return (
    <div className="flex h-full w-full flex-col bg-card">
      <header className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="h-4 w-4 text-emerald-400" />
          <span className="max-w-[240px] truncate font-mono text-xs font-medium text-foreground">
            {payload?.path ?? (inTauri() ? 'No workbook open' : 'Q3-Financials.xlsx')}
          </span>
          {payload ? (
            <Badge variant="outline" className="text-[10px] text-emerald-300">
              {payload.sheet} · {payload.total_rows} rows
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className={cn(
                'gap-1 text-[10px]',
                inTauri()
                  ? 'border-border text-muted-foreground'
                  : 'border-orange-500/40 bg-orange-500/10 text-orange-300',
              )}
            >
              {!inTauri() && <span className="live-dot h-1.5 w-1.5 rounded-full bg-orange-500" />}
              {inTauri() ? 'no file open' : 'preview'}
            </Badge>
          )}
        </div>
        <Badge variant="secondary" className="text-[10px]">
          IronCalc
        </Badge>
      </header>

      {/* Engine-backed ribbon: every button runs a real view action */}
      <OfficeRibbon
        app="Excel"
        onAction={(action) => {
          const st = useAppStore.getState()
          switch (action) {
            case 'recalc':
              void runRecalc()
              break
            case 'batch':
            case 'pivot':
            case 'shift':
            case 'sortfill':
              if (!payload) {
                st.notify('Open a workbook first — then the bulk panel has something to edit', 'error')
                break
              }
              setBulkOpen(true)
              break
            case 'ask':
              st.setComposerValue(
                payload ? `Help with ${payload.path} (sheet ${payload.sheet}): ` : '',
              )
              st.setCenterScreen('chat')
              break
          }
        }}
      />

      <OfficeOpenBar onOpen={open} livePath={payload?.path} />
      <OfficeFileSwitcher view="office-xlsx" current={payload?.path} onOpen={open} />

      {locked && (
        <div className="border-b border-amber-500/30 bg-amber-500/10 px-3 py-1 font-mono text-[10px] text-amber-300">
          Read-only while the agent is running — pause to take over
        </div>
      )}

      {error && (
        <div className="flex flex-wrap items-center gap-2 border-b border-red-500/30 bg-red-500/10 px-3 py-1.5 font-mono text-[10px] text-red-400">
          <span>⚠ {error}</span>
          {lastAttempted && !isOfficeFloorError(error) && (
            <button
              className="rounded border border-red-500/40 bg-red-500/15 px-1.5 py-0.5 text-[9px] text-red-300 hover:bg-red-500/25"
              onClick={() =>
                officeOpenExternal(lastAttempted).catch((e) => setError(String(e)))
              }
            >
              Engine refused — open in LibreOffice instead
            </button>
          )}
        </div>
      )}

      {/* Formula bar — click a cell to select; Recalc runs the truth engine */}
      <div className="flex items-center gap-2 border-b border-border bg-zinc-900/50 px-3 py-1.5">
        <div className="flex items-center gap-1 rounded border border-border bg-zinc-950 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
          <span className="font-medium text-orange-300">{selRef}</span>
          <span className="text-muted-foreground/40">│</span>
        </div>
        <div className="flex flex-1 items-center gap-1.5 rounded border border-orange-500/40 bg-zinc-950 px-2 py-0.5 font-mono text-xs">
          <Sigma className="h-3 w-3 shrink-0 text-orange-400" />
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void propose()}
            placeholder="select a cell to edit…"
            disabled={!payload || locked}
            className="min-w-0 flex-1 bg-transparent text-foreground placeholder:text-muted-foreground/40 focus:outline-none disabled:cursor-not-allowed"
          />
          {recalc && selected && computed(selected.r, selected.c) != null && (
            <span className="shrink-0 text-[9px] text-emerald-400">✓ engine</span>
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={!payload || recalcing}
          className="h-6 gap-1 px-2 text-[10px]"
          onClick={runRecalc}
        >
          {recalcing ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
          Recalc
        </Button>
        {(() => {
          // P50.3.7 — selection stats only: no selection (or no file) shows
          // a hint, never 0.00 aggregates that imply measured data.
          if (!payload || !selected) {
            return (
              <span className="shrink-0 font-mono text-[9px] text-muted-foreground/60">
                Select a cell for Avg / Count / Sum
              </span>
            )
          }
          const nums: number[] = []
          const raw = cellDisplay(payload.rows[selected.r]?.[selected.c])
          const n = Number(raw)
          if (Number.isFinite(n) && raw !== '') nums.push(n)
          const count = nums.length
          const sum = nums.reduce((a, b) => a + b, 0)
          const avg = count ? sum / count : 0
          return (
            <span className="shrink-0 font-mono text-[9px] text-muted-foreground">
              Avg {avg.toFixed(2)} · Count {count} · Sum {sum.toFixed(2)}
            </span>
          )
        })()}
        {recalc && (
          <Badge variant="outline" className="shrink-0 text-[9px] text-emerald-300">
            {recalc.formula_cells} formula cells · verified
          </Badge>
        )}
        <Button
          size="sm"
          variant="outline"
          disabled={!payload || locked}
          className="h-6 gap-1 px-2 text-[10px]"
          onClick={() => setBulkOpen((v) => !v)}
        >
          <ListFilter className="h-3 w-3" />
          Bulk
        </Button>
        <Button
          size="sm"
          disabled={!payload || !selected || draft === selValue || committing || locked}
          className="h-6 gap-1 px-2 text-[10px]"
          onClick={() => void propose()}
        >
          {committing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          Save
        </Button>
      </div>

      {/* Guard-2 approval card for an "ask" verdict (same ticket as Cockpit) */}
      {proposal && (
        <div className="flex items-center gap-2 border-b border-orange-500/40 bg-orange-500/5 px-3 py-1.5">
          <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-orange-400" />
          <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground">
            Set <span className="text-orange-300">{proposal.address}</span> to{' '}
            <span className="text-orange-300">{proposal.value}</span>
            {' — approval ' + proposal.ticketId.slice(0, 8)}
          </span>
          <Button
            size="sm"
            disabled={committing}
            className="h-6 gap-1 bg-emerald-500 px-2 text-[10px] text-black hover:bg-emerald-400"
            onClick={() => commitEdit(proposal.address, proposal.value, proposal.ticketId, proposal.approvalNonce, true)}
          >
            <Check className="h-3 w-3" />
            Approve &amp; run
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={committing}
            className="h-6 gap-1 border-red-500/40 px-2 text-[10px] text-red-400 hover:bg-red-500/10"
            onClick={() => {
              // F1 — the human rejects in the dedicated guard window.
              if (proposal.ticketId) void openApproval(proposal.ticketId)
              setProposal(null)
            }}
          >
            <X className="h-3 w-3" />
            Reject
          </Button>
        </div>
      )}

      {/* Bulk editor: range fill / sort (Guard-2 ticketed) + read-only pivot */}
      {bulkOpen && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-zinc-900/30 px-3 py-2">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[10px] text-muted-foreground">range</span>
            <input
              value={bulkRange}
              onChange={(e) => setBulkRange(e.target.value)}
              placeholder="B7:B12"
              disabled={!payload}
              className="w-20 rounded border border-border bg-zinc-950 px-2 py-0.5 font-mono text-[11px] text-foreground placeholder:text-muted-foreground/40 focus:border-orange-500/60 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[10px] text-muted-foreground">fill</span>
            <input
              value={fillValue}
              onChange={(e) => setFillValue(e.target.value)}
              placeholder="42"
              disabled={!payload}
              className="w-16 rounded border border-border bg-zinc-950 px-2 py-0.5 font-mono text-[11px] text-foreground placeholder:text-muted-foreground/40 focus:border-orange-500/60 focus:outline-none"
            />
            <Button size="sm" disabled={!payload || committing || locked} className="h-6 gap-1 px-2 text-[10px]" onClick={runFill}>
              Fill
            </Button>
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              disabled={!payload || committing || locked}
              className="h-6 gap-1 px-2 text-[10px]"
              onClick={() => setSortDesc((v) => !v)}
            >
              <ChevronsUpDown className="h-3 w-3" />
              {sortDesc ? 'Desc' : 'Asc'}
            </Button>
            <Button size="sm" variant="outline" disabled={!payload || committing || locked} className="h-6 gap-1 px-2 text-[10px]" onClick={runSort}>
              Sort
            </Button>
          </div>

          <div className="flex items-center gap-1.5 border-l border-border pl-4">
            <span className="font-mono text-[10px] text-muted-foreground">shift</span>
            <select
              value={shiftKind}
              onChange={(e) => setShiftKind(e.target.value as typeof shiftKind)}
              disabled={!payload}
              className="rounded border border-border bg-zinc-950 px-1 py-0.5 font-mono text-[11px] text-foreground focus:outline-none"
            >
              <option value="InsertRow">insert row</option>
              <option value="DeleteRow">delete row</option>
              <option value="InsertCol">insert col</option>
              <option value="DeleteCol">delete col</option>
            </select>
            <span className="font-mono text-[10px] text-muted-foreground">at</span>
            <input
              value={shiftAt}
              onChange={(e) => setShiftAt(e.target.value)}
              disabled={!payload}
              className="w-8 rounded border border-border bg-zinc-950 px-1 py-0.5 text-center font-mono text-[11px] text-foreground focus:border-orange-500/60 focus:outline-none"
            />
            <span className="font-mono text-[10px] text-muted-foreground">×</span>
            <input
              value={shiftCount}
              onChange={(e) => setShiftCount(e.target.value)}
              disabled={!payload}
              className="w-8 rounded border border-border bg-zinc-950 px-1 py-0.5 text-center font-mono text-[11px] text-foreground focus:border-orange-500/60 focus:outline-none"
            />
            <Button size="sm" variant="outline" disabled={!payload || committing || locked} className="h-6 gap-1 px-2 text-[10px]" onClick={runShift}>
              Shift
            </Button>
          </div>

          <div className="flex items-center gap-1.5 border-l border-border pl-4">
            <span className="font-mono text-[10px] text-muted-foreground">pivot</span>
            <input
              value={pivotSource}
              onChange={(e) => setPivotSource(e.target.value)}
              placeholder="A1:D20"
              disabled={!payload}
              className="w-20 rounded border border-border bg-zinc-950 px-2 py-0.5 font-mono text-[11px] text-foreground placeholder:text-muted-foreground/40 focus:border-orange-500/60 focus:outline-none"
            />
            <span className="font-mono text-[10px] text-muted-foreground">by</span>
            <input
              value={pivotGroup}
              onChange={(e) => setPivotGroup(e.target.value)}
              disabled={!payload}
              className="w-8 rounded border border-border bg-zinc-950 px-1 py-0.5 text-center font-mono text-[11px] text-foreground focus:border-orange-500/60 focus:outline-none"
            />
            <select
              value={pivotFn}
              onChange={(e) => setPivotFn(e.target.value as 'sum' | 'count' | 'avg')}
              disabled={!payload}
              className="rounded border border-border bg-zinc-950 px-1 py-0.5 font-mono text-[11px] text-foreground focus:outline-none"
            >
              <option value="sum">sum</option>
              <option value="count">count</option>
              <option value="avg">avg</option>
            </select>
            <span className="font-mono text-[10px] text-muted-foreground">of</span>
            <input
              value={pivotAgg}
              onChange={(e) => setPivotAgg(e.target.value)}
              disabled={!payload}
              className="w-8 rounded border border-border bg-zinc-950 px-1 py-0.5 text-center font-mono text-[11px] text-foreground focus:border-orange-500/60 focus:outline-none"
            />
            <Button size="sm" variant="outline" disabled={!payload} className="h-6 gap-1 px-2 text-[10px]" onClick={() => void runPivot()}>
              Run
            </Button>
          </div>

          {pivotRows && (
            <div className="flex flex-wrap items-center gap-1.5 border-l border-border pl-4">
              {pivotRows.map((r) => (
                <span
                  key={r.key}
                  className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[10px] text-emerald-300"
                  title={`count ${r.count}`}
                >
                  {r.key}: {r.value}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Guard-2 approval card for a bulk batch "ask" verdict */}
      {batchProposal && (
        <div className="flex items-center gap-2 border-b border-orange-500/40 bg-orange-500/5 px-3 py-1.5">
          <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-orange-400" />
          <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground">
            <span className="text-orange-300">{batchProposal.summary}</span>
            {' — approval ' + batchProposal.ticketId.slice(0, 8)}
          </span>
          <Button
            size="sm"
            disabled={committing}
            className="h-6 gap-1 bg-emerald-500 px-2 text-[10px] text-black hover:bg-emerald-400"
            onClick={() => commitBatch(batchProposal.batch, batchProposal.ticketId, batchProposal.approvalNonce, true)}
          >
            <Check className="h-3 w-3" />
            Approve &amp; run
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={committing}
            className="h-6 gap-1 border-red-500/40 px-2 text-[10px] text-red-400 hover:bg-red-500/10"
            onClick={() => {
              // F1 — the human rejects in the dedicated guard window.
              if (batchProposal.ticketId) void openApproval(batchProposal.ticketId)
              setBatchProposal(null)
            }}
          >
            <X className="h-3 w-3" />
            Reject
          </Button>
        </div>
      )}

      <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-auto scroll-thin">
        <table className="border-collapse font-mono text-[11px]">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-10 w-8 border border-border bg-zinc-900 text-[9px] font-normal text-muted-foreground" />
              {columns.map((c) => (
                <th
                  key={c}
                  className="sticky top-0 z-10 min-w-[88px] border border-border bg-zinc-900 px-2 py-0.5 text-[10px] font-normal text-muted-foreground"
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!payload && inTauri() && (
              <tr>
                <td colSpan={colCount + 1} className="p-10 text-center text-xs text-muted-foreground">
                  Open a real workbook to load its rows and enable editing.
                </td>
              </tr>
            )}
            {startRow > 0 && (
              <tr style={{ height: startRow * ROW_HEIGHT }}>
                <td colSpan={colCount + 1} className="border-0 p-0" />
              </tr>
            )}
            {Array.from({ length: endRow - startRow }, (_, i) => startRow + i).map((r) => {
              const cells = rowCells(r)
              const r1 = r + 1
              return (
                <tr key={r} style={{ height: ROW_HEIGHT }}>
                  <td className="sticky left-0 z-10 w-8 border border-border bg-zinc-900 px-2 py-0.5 text-right text-[9px] text-muted-foreground">
                    {r1}
                  </td>
                  {columns.map((c, ci) => {
                    const recalcVal = computed(r1, ci + 1)
                    const isSel = selected?.r === r1 && selected?.c === ci + 1
                    const changed = recalcVal != null && recalcVal !== cellDisplay(cells[ci])
                    return (
                      <td
                        key={c}
                        onClick={() => selectCell(r1, ci + 1)}
                        className={cn(
                          'min-w-[88px] cursor-cell border px-2 py-0.5 text-foreground transition-colors hover:bg-orange-500/5',
                          isSel && 'ring-1 ring-inset ring-orange-500',
                          changed && 'cell-flash bg-emerald-500/10 text-emerald-300',
                        )}
                      >
                        {recalcVal ?? cellDisplay(cells[ci])}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
            {endRow < totalRows && (
              <tr style={{ height: (totalRows - endRow) * ROW_HEIGHT }}>
                <td colSpan={colCount + 1} className="border-0 p-0" />
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3 border-t border-border bg-zinc-900/50 px-3 py-1.5">
        {/* P50.3.7 — the projection sketch is preview-only decor; a live
            sheet shows its own sheet tabs, never invented revenue bars. */}
        {!payload && !inTauri() && (
          <>
            <div className="flex h-8 items-end gap-0.5">
              {CHART_BARS.map((h, i) => (
                <motion.div
                  key={i}
                  initial={{ height: '12%' }}
                  animate={{ height: `${h}%` }}
                  transition={{
                    duration: 0.7,
                    delay: 0.15 + i * 0.12,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                  className="w-3 origin-bottom rounded-t bg-gradient-to-t from-orange-600 to-orange-400"
                />
              ))}
            </div>
            <div className="font-mono text-[10px] text-muted-foreground">
              Revenue trend · Q1→Q4 projection
            </div>
          </>
        )}
        <div className="ml-auto flex items-center gap-1 font-mono text-[10px]">
          {(payload ? payload.sheets.map((s) => s.name) : inTauri() ? [] : ['Sheet1']).map((s) => (
            <button
              key={s}
              disabled={!payload || payload.sheet === s}
              onClick={() => payload && void open(payload.path, s)}
              title={payload ? `Open sheet ${s}` : s}
              className={cn(
                'rounded-t border border-b-0 border-border px-3 py-1 disabled:cursor-default',
                payload?.sheet === s ? 'bg-card text-foreground' : 'bg-zinc-900 text-muted-foreground hover:text-foreground'
              )}
            >
              {s}
            </button>
          ))}
          {payload && (
            <span className="ml-1 text-[9px] text-muted-foreground/60">
              {payload.sheet} · {payload.total_rows.toLocaleString()} rows
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
