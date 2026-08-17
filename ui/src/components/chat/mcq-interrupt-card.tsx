'use client'

import { useState } from 'react'
import {
  Check,
  FileCode2,
  MoreHorizontal,
  Pencil,
  ShieldAlert,
  ShieldCheck,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Progress } from '@/components/ui/progress'
import { useAppStore, type MCQInterrupt } from '@/lib/store'
import { cn } from '@/lib/utils'

function DiffView({ diff }: { diff: NonNullable<MCQInterrupt['diff']> }) {
  return (
    <div className="space-y-2">
      {diff.map((d, i) => (
        <div key={i} className="overflow-hidden rounded-md border border-border">
          <div className="flex items-center gap-1.5 border-b border-border bg-zinc-900/60 px-2 py-1">
            <FileCode2 className="h-3 w-3 text-muted-foreground" />
            <span className="font-mono text-[10px] text-foreground">{d.file}</span>
          </div>
          <div className="font-mono text-[10px] leading-relaxed">
            {d.removed.map((line, j) => (
              <div
                key={`r-${j}`}
                className="border-l-2 border-rose-500/60 bg-rose-500/10 px-2 py-0.5 text-rose-300"
              >
                <span className="select-none text-rose-500/60">- </span>
                {line}
              </div>
            ))}
            {d.added.map((line, j) => (
              <div
                key={`a-${j}`}
                className="border-l-2 border-emerald-500/60 bg-emerald-500/10 px-2 py-0.5 text-emerald-300"
              >
                <span className="select-none text-emerald-500/60">+ </span>
                {line}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function McqOptions({
  options,
  selected,
  onSelect,
}: {
  options: NonNullable<MCQInterrupt['options']>
  selected: string | null
  onSelect: (v: string) => void
}) {
  return (
    <div className="space-y-1.5">
      {options.map((o) => {
        const isSel = selected === o.value
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onSelect(o.value)}
            className={cn(
              'flex w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-left transition-colors',
              isSel
                ? 'border-orange-500/60 bg-orange-500/10'
                : 'border-border bg-background/40 hover:border-orange-500/30 hover:bg-accent/40'
            )}
          >
            <span
              className={cn(
                'flex h-4 w-4 items-center justify-center rounded-full border',
                isSel ? 'border-orange-500 bg-orange-500 text-white' : 'border-muted-foreground/40'
              )}
            >
              {isSel && <Check className="h-2.5 w-2.5" />}
            </span>
            <span className="font-mono text-[11px] text-foreground">{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}

function BudgetBar({ used, cap }: { used: number; cap: number }) {
  const pct = Math.min(100, (used / cap) * 100)
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between font-mono text-[11px]">
        <span className="text-foreground">${used.toFixed(2)}</span>
        <span className="text-muted-foreground">/ ${cap.toFixed(2)} cap</span>
      </div>
      <Progress
        value={pct}
        className="h-1.5 bg-muted/40 [&>[data-slot=progress-indicator]]:bg-orange-500"
      />
      <p className="font-mono text-[10px] text-muted-foreground">
        {pct.toFixed(0)}% of session budget used
      </p>
    </div>
  )
}

export default function McqInterruptCard({ mcq }: { mcq: MCQInterrupt }) {
  const respondMcq = useAppStore((s) => s.respondMcq)
  const notify = useAppStore((s) => s.notify)
  const [selected, setSelected] = useState<string | null>(
    mcq.options?.[0]?.value ?? null
  )
  const [remember, setRemember] = useState(false)

  const showRemember = mcq.kind === 'mcq' || mcq.kind === 'permission'

  return (
    <Card className="enter-approval gap-0 overflow-hidden border-orange-500/40 bg-orange-500/5 p-0">
      {/* header */}
      <div className="flex items-start gap-2.5 border-b border-orange-500/20 px-3 py-2.5">
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-orange-500/15 text-orange-400">
          <ShieldAlert className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h4 className="truncate text-sm font-medium text-foreground">{mcq.title}</h4>
            <Badge
              variant="outline"
              className="border-orange-500/40 bg-orange-500/10 text-[9px] text-orange-300"
            >
              Action required
            </Badge>
          </div>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
            {mcq.description}
          </p>
        </div>
      </div>

      {/* body */}
      <div className="space-y-2.5 px-3 py-3">
        {mcq.kind === 'diff' && mcq.diff && <DiffView diff={mcq.diff} />}

        {mcq.kind === 'permission' && (
          <div className="flex items-center gap-2 rounded-md border border-border bg-background/40 px-2.5 py-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
            <span className="text-[11px] text-muted-foreground">
              Scope: <span className="font-mono text-foreground">workspace write</span>
            </span>
          </div>
        )}

        {mcq.kind === 'mcq' && mcq.options && (
          <McqOptions
            options={mcq.options}
            selected={selected}
            onSelect={setSelected}
          />
        )}

        {mcq.kind === 'budget' && mcq.budget && (
          <BudgetBar used={mcq.budget.used} cap={mcq.budget.cap} />
        )}

        {showRemember && (
          <label className="flex cursor-pointer items-center gap-2 text-[11px] text-muted-foreground">
            <Checkbox
              checked={remember}
              onCheckedChange={(v) => setRemember(v === true)}
            />
            Remember choice for this site
          </label>
        )}
      </div>

      {/* actions */}
      <div className="flex items-center gap-1.5 border-t border-orange-500/20 bg-zinc-950/30 px-3 py-2">
        <Button
          size="sm"
          className="h-7 gap-1.5 bg-orange-500 px-3 text-[11px] text-white hover:bg-orange-600"
          onClick={() => respondMcq(mcq.id, 'approve')}
        >
          <Check className="h-3 w-3" />
          Approve
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 gap-1.5 px-2.5 text-[11px] text-rose-300 hover:bg-rose-500/10 hover:text-rose-200"
          onClick={() => respondMcq(mcq.id, 'reject')}
        >
          <X className="h-3 w-3" />
          Reject
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto h-7 gap-1 px-2 text-[11px] text-muted-foreground"
          onClick={() => notify('More options')}
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </Button>
      </div>
    </Card>
  )
}
