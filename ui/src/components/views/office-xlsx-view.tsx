'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { FileSpreadsheet, Sigma } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { OfficeOpenBar } from './office-open-bar'
import { cellDisplay, colLetter, xlsxOpen, type XlsxWindowPayload } from '@/lib/spreadsheet'

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

  const open = async (path: string) => {
    try {
      setError(null)
      setPayload(await xlsxOpen(path, null, 0, 500))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open workbook')
    }
  }

  const colCount = payload ? payload.total_cols : COLS.length
  const columns = Array.from({ length: colCount }, (_, i) => colLetter(i + 1))

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

      <OfficeOpenBar onOpen={open} livePath={payload?.path} />

      {error && (
        <div className="border-b border-red-500/30 bg-red-500/10 px-3 py-1.5 font-mono text-[10px] text-red-400">
          ⚠ {error}
        </div>
      )}

      <div className="flex items-center gap-2 border-b border-border bg-zinc-900/50 px-3 py-1.5">
        <div className="flex items-center gap-1 rounded border border-border bg-zinc-950 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
          <span className="font-medium text-orange-300">B4</span>
          <span className="text-muted-foreground/40">│</span>
        </div>
        <div className="flex flex-1 items-center gap-1.5 rounded border border-orange-500/40 bg-zinc-950 px-2 py-0.5 font-mono text-xs">
          <Sigma className="h-3 w-3 text-orange-400" />
          <span className="text-foreground">=SUM(B2:B5)</span>
          <span className="caret-blink ml-0.5 inline-block h-3.5 w-1.5 bg-orange-400 align-middle" />
        </div>
      </div>

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
                    {columns.map((c, ci) => (
                      <td key={c} className="min-w-[88px] border border-border px-2 py-0.5 text-foreground">
                        {cellDisplay(row[ci])}
                      </td>
                    ))}
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
                  const isSel = `${c}${r}` === 'B4'
                  const edit = cell?.edit
                  return (
                    <td
                      key={c}
                      className={cn(
                        'min-w-[88px] border px-2 py-0.5',
                        cell?.header
                          ? 'border-border bg-zinc-800 font-semibold text-foreground'
                          : edit
                            ? 'border-orange-500 bg-orange-500/5'
                            : 'border-border text-foreground',
                        isSel && 'ring-1 ring-inset ring-orange-500'
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
                            cell?.v?.startsWith('+') && 'text-emerald-300'
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
