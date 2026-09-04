'use client'

import { useState } from 'react'
import {
  Sigma,
  Table2,
  Plus,
  Trash2,
  Wand2,
  ChevronDown,
  Sparkles,
  ArrowUpDown,
  Rows3,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface RibbonTab {
  id: string
  label: string
  copilot?: boolean
}

const TABS: RibbonTab[] = [
  { id: 'file', label: 'File' },
  { id: 'home', label: 'Home' },
  { id: 'insert', label: 'Insert' },
  { id: 'pagetab', label: 'Page Layout' },
  { id: 'formulas', label: 'Formulas' },
  { id: 'data', label: 'Data' },
  { id: 'review', label: 'Review' },
  { id: 'view', label: 'View' },
  { id: 'help', label: 'Help' },
  { id: 'copilot', label: 'Copilot', copilot: true },
]

/** Engine-backed actions the host view actually implements. Rich text
 * formatting (bold/italic/fill/alignment/number formats) is NOT in the
 * surgical engine — the ribbon only exposes what runs. */
export type RibbonActionId =
  | 'recalc'
  | 'batch'
  | 'pivot'
  | 'shift'
  | 'sortfill'
  | 'ask'

interface RibbonButton {
  icon: React.ElementType
  label: string
  action: RibbonActionId
  hint?: string
}

const HOME_GROUPS: { name: string; buttons: RibbonButton[] }[] = [
  {
    name: 'Calc',
    buttons: [
      { icon: Sigma, label: 'Recalc', action: 'recalc', hint: 'Recompute with IronCalc' },
      { icon: Sigma, label: 'AutoSum', action: 'recalc', hint: 'Recompute with IronCalc' },
    ],
  },
  {
    name: 'Edit',
    buttons: [
      { icon: Wand2, label: 'Batch edit', action: 'batch', hint: 'Guard-2 range edit' },
      { icon: Table2, label: 'Pivot', action: 'pivot', hint: 'Read-only pivot' },
    ],
  },
  {
    name: 'Cells',
    buttons: [
      { icon: Rows3, label: 'Rows/cols', action: 'shift', hint: 'Insert/delete rows or columns' },
      { icon: Plus, label: 'Insert', action: 'shift', hint: 'Insert rows or columns' },
      { icon: Trash2, label: 'Delete', action: 'shift', hint: 'Delete rows or columns' },
    ],
  },
  {
    name: 'Data',
    buttons: [
      { icon: ArrowUpDown, label: 'Sort & fill', action: 'sortfill', hint: 'Bulk fill / sort' },
    ],
  },
]

/**
 * Office ribbon (ARCH/12 v3.1). Tab switching is real; every Home button
 * dispatches an engine-backed `RibbonActionId` to the host view (recalc,
 * batch edit, pivot, row/col shift, sort/fill, ask-agent). Rich-text
 * formatting is outside the surgical engine, so the ribbon does not pretend
 * to offer it. Non-Home tabs are honest about being unbuilt.
 */
export function OfficeRibbon({
  app = 'Excel',
  onAction,
}: {
  app?: 'Excel' | 'Word' | 'PowerPoint'
  onAction?: (action: RibbonActionId) => void
}) {
  const [tab, setTab] = useState('home')

  return (
    <div className="shrink-0 border-b border-border bg-zinc-900/70 select-none">
      {/* Tab strip */}
      <div className="flex items-end gap-0.5 px-1 pt-0.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'rounded-t-md border border-b-0 px-2.5 py-1 text-[10.5px] transition-colors',
              tab === t.id
                ? 'border-border bg-zinc-800 text-foreground'
                : 'border-transparent text-muted-foreground hover:bg-zinc-800/40 hover:text-foreground',
              t.copilot && 'text-orange-300',
            )}
          >
            {t.copilot && <Sparkles className="mr-1 inline h-2.5 w-2.5" />}
            {t.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1 pb-0.5 pr-1">
          <span className="rounded bg-orange-500/15 px-1.5 py-0.5 font-mono text-[9px] text-orange-300">
            {app} · ribbon
          </span>
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </div>
      </div>

      {/* Home tab groups */}
      {tab === 'home' && (
        <div className="flex items-stretch gap-1 overflow-x-auto scroll-thin px-1 py-1">
          {HOME_GROUPS.map((g) => (
            <div key={g.name} className="flex shrink-0 items-center gap-1 border-r border-border/60 pr-1.5">
              {g.buttons.map((b) => {
                const Icon = b.icon
                return (
                  <button
                    key={b.label}
                    title={b.hint ?? b.label}
                    disabled={!onAction}
                    onClick={() => onAction?.(b.action)}
                    className="group flex h-12 w-12 flex-col items-center justify-center gap-1 rounded text-muted-foreground transition-colors hover:bg-zinc-800 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Icon className="h-4 w-4" />
                    <span className="max-w-[52px] truncate text-[8px] leading-none">{b.label}</span>
                  </button>
                )
              })}
              <span className="hidden text-[8px] text-muted-foreground/50 lg:block">{g.name}</span>
            </div>
          ))}
          {/* Copilot — routes to the chat surface via the host view */}
          <button
            onClick={() => onAction?.('ask')}
            disabled={!onAction}
            className="ml-auto flex shrink-0 items-center gap-1.5 rounded-md border border-orange-500/40 bg-orange-500/15 px-2.5 py-1 text-[10px] text-orange-300 transition-colors hover:bg-orange-500/25 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Sparkles className="h-3 w-3" />
            Ask Copilot
          </button>
        </div>
      )}

      {/* Non-Home tabs are not in this build — say so plainly. */}
      {tab !== 'home' && (
        <div className="flex h-12 items-center px-3 font-mono text-[10px] text-muted-foreground">
          {TABS.find((t) => t.id === tab)?.label} tab is not available in this build — Calc, Edit,
          Cells, and Data on Home cover the engine-backed actions.
        </div>
      )}
    </div>
  )
}
