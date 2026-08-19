'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Check, ChevronsUpDown, FileSpreadsheet, Loader2, ListFilter, RefreshCw, ShieldAlert, Sigma, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { OfficeOpenBar } from './office-open-bar'
import { OfficeRibbon } from './office-ribbon'
import {
  cellDisplay,
  colLetter,
  newBatch,
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
import { guardRespond } from '@/lib/guard'

const COLS = ['A', 'B', 'C', 'D', 'E', 'F']
const ROWS = 15

type Cell = { v?: string; bold?: boolean; header?: boolean; edit?: boolean; formula?: boolean }

// row index 0 = header row (1-based -> 1)
const GRID: Record<string, Cell> = {
  A1: { v: 'Quarter', header: true },
  B1: { v: 'Revenue', header: true },
  C1: { v: 'Cost', header: true },
  D1: { v: 'Profit', header: true },
  E1: { v: 'Margin', header: true },
  F1: { v: 'YoY %', header: true },
  A2: { v: 'Q1 2026' },
  B2: { v: '$1.20M' },
  C2: { v: '$0.48M' },
  D2: { v: '$0.72M' },
  E2: { v: '60%' },
  F2: { v: '+12%' },
  A3: { v: 'Q2 2026' },
  B3: { v: '$1.35M' },
  C3: { v: '$0.52M' },
  D3: { v: '$0.83M' },
  E3: { v: '61%' },
  F3: { v: '+14%' },
  A4: { v: 'Q3 2026' },
  B4: { v: '$1.80M' },
  C4: { v: '$0.61M' },
  D4: { v: '$1.19M' },
  E4: { v: '66%' },
  F4: { v: '+20%', bold: true },
  A5: { v: 'Q4 2026 (proj)' },
  B5: { v: '$2.10M' },
  C5: { v: '$0.70M' },
  D5: { v: '$1.40M' },
  E5: { v: '67%' },
  F5: { v: '+17%' },
  A6: { v: 'Total' },
  B6: { v: '$6.45M' },
  C6: { v: '$2.31M' },
  D6: { v: '$4.14M' },
  E6: { v: '64%' },
  F6: { v: '+15%' },
  // B7:B12 being edited
  B7: { edit: true },
  B8: { edit: true },
  B9: { edit: true },
  B10: { edit: true },
  B11: { edit: true },
  B12: { edit: true },
}

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
  } | null>(null)
  const [committing, setCommitting] = useState(false)

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
  } | null>(null)

  const open = async (path: string) => {
    try {
      setError(null)
      setPayload(await xlsxOpen(path, null, 0, 500))
      setRecalc(null)
      setSelected(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open workbook')
    }
  }

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

  // Seed the draft with the displayed value when a cell is selected.
  const selectCell = (r: number, c: number) => {
    setSelected({ r, c })
    const v =
      computed(r, c) ??
      (payload
        ? cellDisplay(payload.rows[r - payload.offset - 1]?.[c - 1])
        : GRID[`${colLetter(c)}${r}`]?.v ?? '')
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
        await commitEdit(address, draft, req.ticketId, false)
      } else {
        setProposal({ address, value: draft, ticketId: req.ticketId })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Edit failed')
    }
  }

  const commitEdit = async (
    address: string,
    value: string,
    ticketId: string,
    approve: boolean,
  ) => {
    if (!payload || committing) return
    setCommitting(true)
    try {
      // `ask` tickets need the human approval first (audit receipt); `allow`
      // tickets are already approved. Either way the commit consumes it.
      if (approve) await guardRespond(ticketId, 'approve')
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
        await commitBatch(batch, req.ticketId, false)
      } else {
        setBatchProposal({ summary: batch.summary, batch, ticketId: req.ticketId })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bulk edit failed')
    }
  }

  const commitBatch = async (batch: WorkbookBatch, ticketId: string, approve: boolean) => {
    if (!payload || committing) return
    setCommitting(true)
    try {
      if (approve) await guardRespond(ticketId, 'approve')
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
    ? (computed(selected.r, selected.c) ??
      (payload
        ? cellDisplay(payload.rows[selected.r - payload.offset - 1]?.[selected.c - 1])
        : GRID[selRef]?.v ?? ''))
    : ''

  return (
    <div className="flex h-full w-full flex-col bg-card">
      <header className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="h-4 w-4 text-emerald-400" />
          <span className="max-w-[240px] truncate font-mono text-xs font-medium text-foreground">
            {payload?.path ?? 'Q3-Financials.xlsx'}
          </span>
          {payload ? (
            <Badge variant="outline" className="text-[10px] text-emerald-300">
              {payload.sheet} · {payload.total_rows} rows
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="gap-1 border-orange-500/40 bg-orange-500/10 text-[10px] text-orange-300"
            >
              <span className="live-dot h-1.5 w-1.5 rounded-full bg-orange-500" />
              demo
            </Badge>
          )}
        </div>
        <Badge variant="secondary" className="text-[10px]">
          IronCalc
        </Badge>
      </header>

      {/* Full-fidelity ribbon (ARCH/12 v3.1 — "nothing held back") */}
      <OfficeRibbon app="Excel" />

      <OfficeOpenBar onOpen={open} livePath={payload?.path} />

      {error && (
        <div className="border-b border-red-500/30 bg-red-500/10 px-3 py-1.5 font-mono text-[10px] text-red-400">
          ⚠ {error}
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
            disabled={!payload}
            className="min-w-0 flex-1 bg-transparent text-foreground placeholder:text-muted-foreground/40 focus:outline-none"
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
        {recalc && (
          <Badge variant="outline" className="shrink-0 text-[9px] text-emerald-300">
            {recalc.formula_cells} formula cells · verified
          </Badge>
        )}
        <Button
          size="sm"
          variant="outline"
          disabled={!payload}
          className="h-6 gap-1 px-2 text-[10px]"
          onClick={() => setBulkOpen((v) => !v)}
        >
          <ListFilter className="h-3 w-3" />
          Bulk
        </Button>
        <Button
          size="sm"
          disabled={!payload || !selected || draft === selValue || committing}
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
            onClick={() => commitEdit(proposal.address, proposal.value, proposal.ticketId, true)}
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
              if (proposal.ticketId) void guardRespond(proposal.ticketId, 'reject')
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
            <Button size="sm" disabled={!payload || committing} className="h-6 gap-1 px-2 text-[10px]" onClick={runFill}>
              Fill
            </Button>
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              disabled={!payload || committing}
              className="h-6 gap-1 px-2 text-[10px]"
              onClick={() => setSortDesc((v) => !v)}
            >
              <ChevronsUpDown className="h-3 w-3" />
              {sortDesc ? 'Desc' : 'Asc'}
            </Button>
            <Button size="sm" variant="outline" disabled={!payload || committing} className="h-6 gap-1 px-2 text-[10px]" onClick={runSort}>
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
            <Button size="sm" variant="outline" disabled={!payload || committing} className="h-6 gap-1 px-2 text-[10px]" onClick={runShift}>
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
            onClick={() => commitBatch(batchProposal.batch, batchProposal.ticketId, true)}
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
              if (batchProposal.ticketId) void guardRespond(batchProposal.ticketId, 'reject')
              setBatchProposal(null)
            }}
          >
            <X className="h-3 w-3" />
            Reject
          </Button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto scroll-thin">
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
            {payload ? (
              payload.rows.map((row, i) => {
                const r = payload.offset + i + 1
                return (
                  <tr key={r}>
                    <td className="sticky left-0 z-10 w-8 border border-border bg-zinc-900 px-2 py-0.5 text-right text-[9px] text-muted-foreground">
                      {r}
                    </td>
                    {columns.map((c, ci) => {
                      const recalcVal = computed(r, ci + 1)
                      const isSel = selected?.r === r && selected?.c === ci + 1
                      const changed =
                        recalcVal != null && recalcVal !== cellDisplay(row[ci])
                      return (
                        <td
                          key={c}
                          onClick={() => selectCell(r, ci + 1)}
                          className={cn(
                            'min-w-[88px] cursor-cell border px-2 py-0.5 text-foreground transition-colors hover:bg-orange-500/5',
                            isSel && 'ring-1 ring-inset ring-orange-500',
                            changed && 'cell-flash bg-emerald-500/10 text-emerald-300',
                          )}
                        >
                          {recalcVal ?? cellDisplay(row[ci])}
                        </td>
                      )
                    })}
                  </tr>
                )
              })
            ) : (
              Array.from({ length: ROWS }, (_, r) => r + 1).map((r) => (
                <tr key={r}>
                  <td className="sticky left-0 z-10 w-8 border border-border bg-zinc-900 px-2 py-0.5 text-right text-[9px] text-muted-foreground">
                    {r}
                  </td>
                  {COLS.map((c) => {
                    const cell = GRID[`${c}${r}`]
                    const isSel = selected?.r === r && selected?.c === COLS.indexOf(c) + 1
                    const edit = cell?.edit
                    return (
                      <td
                        key={c}
                        onClick={() => selectCell(r, COLS.indexOf(c) + 1)}
                        className={cn(
                          'min-w-[88px] cursor-cell border px-2 py-0.5',
                          cell?.header
                            ? 'border-border bg-zinc-800 font-semibold text-foreground'
                            : edit
                              ? 'border-orange-500 bg-orange-500/5'
                              : 'border-border text-foreground',
                          isSel && 'ring-1 ring-inset ring-orange-500',
                        )}
                      >
                        {edit ? (
                          <span className="flex items-center gap-1">
                            <span className="live-dot h-1 w-1 rounded-full bg-orange-500" />
                            <span className="text-muted-foreground/40">_</span>
                          </span>
                        ) : (
                          <span
                            className={cn(
                              cell?.bold && 'font-semibold text-orange-300',
                              cell?.v?.startsWith('+') && 'text-emerald-300',
                            )}
                          >
                            {cell?.v ?? ''}
                          </span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3 border-t border-border bg-zinc-900/50 px-3 py-1.5">
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
        <div className="ml-auto flex items-center gap-1 font-mono text-[10px]">
          {['Sheet1', 'Sheet2', 'Charts'].map((s, i) => (
            <button
              key={s}
              className={cn(
                'rounded-t border border-b-0 border-border px-3 py-1',
                i === 0 ? 'bg-card text-foreground' : 'bg-zinc-900 text-muted-foreground'
              )}
            >
              {s}
            </button>
          ))}
          <button className="rounded-t border border-b-0 border-border bg-zinc-900 px-3 py-1 text-orange-300">
            +
          </button>
        </div>
      </div>
    </div>
  )
}
