'use client'

import { memo, useEffect, useState } from 'react'
import { ChevronRight, Loader2, RotateCw, ShieldAlert, Wrench, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ToolCallRecord } from '@/lib/store'
import { useAppStore } from '@/lib/store'

function previewArgs(args?: Record<string, unknown>): string {
  if (!args) return ''
  try {
    const s = JSON.stringify(args)
    return s.length > 80 ? `${s.slice(0, 77)}…` : s
  } catch {
    return ''
  }
}

function riskTone(risk?: string): string {
  const r = (risk ?? '').toLowerCase()
  if (r === 'high' || r === 'destructive') return 'border-rose-500/40 bg-rose-500/10 text-rose-300'
  if (r === 'medium' || r === 'external-write') return 'border-amber-500/40 bg-amber-500/10 text-amber-300'
  if (r === 'low' || r === 'read') return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
  return 'border-border bg-background/40 text-muted-foreground'
}

function fmtDuration(start?: number, end?: number): string | null {
  if (!start) return null
  const base = end && end >= start ? end : Date.now()
  const ms = Math.max(0, base - start)
  if (ms < 1000) return null
  const s = Math.round(ms / 1000)
  return s >= 60 ? `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s` : `${s}s`
}

// P45.9 — memoized: tool-call rows only re-render when the record changes
// (streaming updates mutate the running call's object identity; settled calls
// keep identity, so untouched chips skip re-render entirely).
const ToolChip = memo(function ToolChip({ rec }: { rec: ToolCallRecord }) {
  const [open, setOpen] = useState(rec.status === 'failed')
  const retry = useAppStore((s) => s.retryToolCall)
  const argsPreview = previewArgs(rec.args)
  const resultText =
    rec.error ??
    (typeof rec.result === 'string' ? rec.result : rec.result != null ? JSON.stringify(rec.result, null, 2) : '')
  // Live elapsed while running (settles to the final duration once the
  // result lands — `endedAt` flips the interval off).
  const [, force] = useState(0)
  useEffect(() => {
    if (rec.status !== 'running' || !rec.startedAt) return
    const t = setInterval(() => force((v) => v + 1), 1000)
    return () => clearInterval(t)
  }, [rec.status, rec.startedAt])
  const duration = fmtDuration(rec.startedAt, rec.endedAt)

  return (
    <div
      className={cn(
        'overflow-hidden rounded-lg border bg-background/40',
        rec.status === 'failed' && 'border-rose-500/40',
        rec.status === 'running' && 'border-orange-500/30',
        rec.status === 'done' && 'border-border',
      )}
    >
      <button
        type="button"
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        {rec.status === 'running' ? (
          <Loader2 className="h-3 w-3 shrink-0 animate-spin text-orange-400" />
        ) : rec.status === 'failed' ? (
          <X className="h-3 w-3 shrink-0 text-rose-400" />
        ) : (
          <Wrench className="h-3 w-3 shrink-0 text-muted-foreground" />
        )}
        <span className="font-mono text-[11px] text-foreground">{rec.toolId}</span>
        {rec.risk && (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0 font-mono text-[9px] uppercase tracking-wide',
              riskTone(rec.risk),
            )}
          >
            <ShieldAlert className="h-2.5 w-2.5" />
            {rec.risk}
          </span>
        )}
        {argsPreview && (
          <span className="truncate font-mono text-[10px] text-muted-foreground/80">{argsPreview}</span>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-2">
          {rec.status === 'running' && (
            <span className="font-mono text-[9px] text-orange-300/80">{rec.progress ?? 'working…'}</span>
          )}
          {duration && rec.status === 'running' && (
            <span className="font-mono text-[9px] text-muted-foreground/60">{duration}</span>
          )}
          {duration && rec.status !== 'running' && !rec.error && (
            <span className="font-mono text-[9px] text-muted-foreground/60">{duration}</span>
          )}
          <ChevronRight
            className={cn('h-3 w-3 text-muted-foreground transition-transform', open && 'rotate-90')}
          />
        </span>
      </button>
      {open && (
        <div className="border-t border-border/60 bg-zinc-950/40 px-2.5 py-2">
          {rec.args && (
            <pre className="mb-1 overflow-x-auto font-mono text-[10px] text-muted-foreground">
              {JSON.stringify(rec.args, null, 2)}
            </pre>
          )}
          {resultText && (
            <pre
              className={cn(
                'max-h-40 overflow-auto font-mono text-[10px]',
                rec.status === 'failed' ? 'text-rose-300' : 'text-emerald-300/80',
              )}
            >
              {resultText}
            </pre>
          )}
          {rec.status === 'failed' && (
            <button
              type="button"
              onClick={() => void retry(rec.id)}
              className="mt-1.5 inline-flex items-center gap-1 rounded border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 font-mono text-[10px] text-rose-200 hover:bg-rose-500/20"
            >
              <RotateCw className="h-2.5 w-2.5" />
              Retry
            </button>
          )}
        </div>
      )}
    </div>
  )
})

export default function ToolChips({ calls }: { calls: ToolCallRecord[] }) {
  if (calls.length === 0) return null
  return (
    <div className="mt-2 flex flex-col gap-1.5">
      {calls.map((c) => (
        <ToolChip key={c.id} rec={c} />
      ))}
    </div>
  )
}
