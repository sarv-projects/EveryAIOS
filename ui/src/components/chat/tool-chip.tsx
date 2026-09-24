'use client'

import { memo, useEffect, useState } from 'react'
import { CheckCircle2, ChevronDown, Loader2, RotateCw, ShieldAlert, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ToolCallRecord } from '@/lib/store'
import { useAppStore } from '@/lib/store'

/** The short, user-facing state of a tool call. */
export type ToolActivityStatus = 'working' | 'completed' | 'failed'

export interface ToolActivitySummary {
  sentence: string
  status: string
  duration: string
}

const TOOL_ACTIONS: Record<
  string,
  { ongoing: string; complete: string; failed: string; subject: string }
> = {
  read: {
    subject: 'your files',
    ongoing: 'Reading your files',
    complete: 'Finished reading your files',
    failed: 'I could not finish reading your files',
  },
  list: {
    subject: 'the available items',
    ongoing: 'Checking the available items',
    complete: 'Finished checking the available items',
    failed: 'I could not check the available items',
  },
  open: {
    subject: 'the requested resource',
    ongoing: 'Opening the requested resource',
    complete: 'Opened the requested resource',
    failed: 'I could not open the requested resource',
  },
  search: {
    subject: 'your files',
    ongoing: 'Searching your files',
    complete: 'Finished searching your files',
    failed: 'I could not search your files',
  },
  write: {
    subject: 'the requested resource',
    ongoing: 'Updating the requested resource',
    complete: 'Finished updating the requested resource',
    failed: 'I could not update the requested resource',
  },
  edit: {
    subject: 'the requested resource',
    ongoing: 'Updating the requested resource',
    complete: 'Finished updating the requested resource',
    failed: 'I could not update the requested resource',
  },
  update: {
    subject: 'the requested resource',
    ongoing: 'Updating the requested resource',
    complete: 'Finished updating the requested resource',
    failed: 'I could not update the requested resource',
  },
  delete: {
    subject: 'the requested resource',
    ongoing: 'Removing the requested resource',
    complete: 'Finished removing the requested resource',
    failed: 'I could not remove the requested resource',
  },
  remove: {
    subject: 'the requested resource',
    ongoing: 'Removing the requested resource',
    complete: 'Finished removing the requested resource',
    failed: 'I could not remove the requested resource',
  },
  navigate: {
    subject: 'the requested page',
    ongoing: 'Opening the requested page',
    complete: 'Opened the requested page',
    failed: 'I could not open the requested page',
  },
  click: {
    subject: 'the requested page',
    ongoing: 'Interacting with the requested page',
    complete: 'Finished interacting with the requested page',
    failed: 'I could not interact with the requested page',
  },
  type: {
    subject: 'the requested information',
    ongoing: 'Entering the requested information',
    complete: 'Finished entering the requested information',
    failed: 'I could not enter the requested information',
  },
  execute: {
    subject: 'the requested task',
    ongoing: 'Running the requested task',
    complete: 'Finished running the requested task',
    failed: 'I could not run the requested task',
  },
  run: {
    subject: 'the requested task',
    ongoing: 'Running the requested task',
    complete: 'Finished running the requested task',
    failed: 'I could not run the requested task',
  },
  connect: {
    subject: 'the requested connection',
    ongoing: 'Connecting the requested service',
    complete: 'Connected the requested service',
    failed: 'I could not connect the requested service',
  },
  query: {
    subject: 'the connected information',
    ongoing: 'Checking connected information',
    complete: 'Finished checking connected information',
    failed: 'I could not check connected information',
  },
}

function actionForTool(toolId: string): (typeof TOOL_ACTIONS)[string] {
  const normalized = toolId.toLowerCase().replace(/[^a-z0-9]+/g, ' ')
  const words = normalized.split(/\s+/).filter(Boolean)
  // Prefer the verb anywhere in the id, but never echo the id itself. Unknown
  // tools get a neutral sentence rather than leaking an implementation name.
  for (const word of words) {
    const action = TOOL_ACTIONS[word]
    if (action) return action
  }
  return {
    subject: 'the requested task',
    ongoing: 'Working on the requested task',
    complete: 'Finished the requested task',
    failed: 'I could not finish the requested task',
  }
}

/** Format a call duration without hiding short calls. */
export function formatToolDuration(start?: number, end?: number, now = Date.now()): string {
  if (start === undefined) return ''
  const base = end !== undefined && end >= start ? end : now
  const ms = Math.max(0, base - start)
  if (ms < 1000) return '<1s'
  const seconds = Math.round(ms / 1000)
  return seconds >= 60
    ? `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`
    : `${seconds}s`
}

/** A sentence-first projection of a raw tool record for the casual surface. */
export function toolActivitySummary(
  rec: Pick<ToolCallRecord, 'toolId' | 'status' | 'startedAt' | 'endedAt'>,
  now = Date.now(),
): ToolActivitySummary {
  const action = actionForTool(rec.toolId)
  const status: ToolActivityStatus =
    rec.status === 'running' ? 'working' : rec.status === 'failed' ? 'failed' : 'completed'
  const sentence =
    status === 'working'
      ? `${action.ongoing}…`
      : status === 'failed'
        ? `${action.failed}.`
        : `${action.complete}.`
  return {
    sentence,
    status: status === 'working' ? 'Working' : status === 'failed' ? 'Needs attention' : 'Done',
    duration: formatToolDuration(rec.startedAt, rec.endedAt, now),
  }
}

function riskTone(risk?: string): string {
  const r = (risk ?? '').toLowerCase()
  if (r === 'high' || r === 'destructive') return 'border-rose-500/40 bg-rose-500/10 text-rose-300'
  if (r === 'medium' || r === 'external-write') return 'border-warning/40 bg-warning/10 text-warning'
  if (r === 'low' || r === 'read') return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
  return 'border-border bg-background/40 text-muted-foreground'
}

function safeJson(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2) ?? String(value)
  } catch {
    return String(value)
  }
}

// P45.9 — memoized: tool-call rows only re-render when the record changes
// (streaming updates mutate the running call's object identity; settled calls
// keep identity, so untouched chips skip re-render entirely).
const ToolChip = memo(function ToolChip({ rec }: { rec: ToolCallRecord }) {
  const [detailsOpen, setDetailsOpen] = useState(false)
  const retry = useAppStore((s) => s.retryToolCall)
  const [, force] = useState(0)
  useEffect(() => {
    if (rec.status !== 'running' || rec.startedAt === undefined) return
    const t = setInterval(() => force((v) => v + 1), 1000)
    return () => clearInterval(t)
  }, [rec.status, rec.startedAt])
  const summary = toolActivitySummary(rec)
  const rawResult = safeJson(rec.error ?? rec.result)
  const requestId = (rec as ToolCallRecord & { requestId?: string }).requestId
  const detailsId = `tool-details-${rec.id}`

  return (
    <div
      role="listitem"
      className={cn(
        'overflow-hidden rounded-lg border bg-background/40',
        rec.status === 'failed' && 'border-rose-500/40',
        rec.status === 'running' && 'border-brand/30',
        rec.status === 'done' && 'border-border',
      )}
      data-testid="tool-activity"
      data-tool-status={rec.status}
    >
      <div className="flex min-w-0 items-center gap-2 px-2.5 py-1.5">
        {rec.status === 'running' ? (
          <Loader2
            aria-hidden
            className="h-3.5 w-3.5 shrink-0 animate-spin text-brand motion-reduce:animate-none"
          />
        ) : rec.status === 'failed' ? (
          <X aria-hidden className="h-3.5 w-3.5 shrink-0 text-rose-400" />
        ) : (
          <CheckCircle2 aria-hidden className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] leading-relaxed text-foreground" aria-live="polite">
            {summary.sentence}
          </p>
          <div className="mt-0.5 flex items-center gap-2 text-[9px] text-muted-foreground">
            <span>{summary.status}</span>
            {summary.duration && <span className="font-mono tabular-nums">{summary.duration}</span>}
          </div>
        </div>
        <button
          type="button"
          className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          onClick={() => setDetailsOpen((v) => !v)}
          aria-expanded={detailsOpen}
          aria-controls={detailsId}
          aria-label={`${detailsOpen ? 'Hide' : 'Show'} technical details for this step`}
        >
          Technical details
          <ChevronDown
            aria-hidden
            className={cn('h-3 w-3 transition-transform motion-reduce:transition-none', detailsOpen && 'rotate-180')}
          />
        </button>
      </div>
      {detailsOpen && (
        <div id={detailsId} className="space-y-2 border-t border-border/60 bg-zinc-950/40 px-2.5 py-2">
          <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-[10px]">
            <dt className="text-muted-foreground">Tool</dt>
            <dd className="break-all font-mono text-foreground">{rec.toolId}</dd>
            {rec.risk && (
              <>
                <dt className="text-muted-foreground">Risk</dt>
                <dd>
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full border px-1.5 py-0 font-mono text-[9px] uppercase tracking-wide',
                      riskTone(rec.risk),
                    )}
                  >
                    <ShieldAlert aria-hidden className="h-2.5 w-2.5" />
                    {rec.risk}
                  </span>
                </dd>
              </>
            )}
            {requestId && (
              <>
                <dt className="text-muted-foreground">Request ID</dt>
                <dd className="break-all font-mono text-foreground">{requestId}</dd>
              </>
            )}
          </dl>
          {rec.args && (
            <div>
              <p className="mb-1 text-[9px] uppercase tracking-wide text-muted-foreground">Arguments</p>
              <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-[10px] text-muted-foreground">
                {safeJson(rec.args)}
              </pre>
            </div>
          )}
          {rawResult && (
            <div>
              <p className="mb-1 text-[9px] uppercase tracking-wide text-muted-foreground">
                {rec.error ? 'Error' : 'Result'}
              </p>
              <pre
                className={cn(
                  'max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-[10px]',
                  rec.status === 'failed' ? 'text-rose-300' : 'text-emerald-300/80',
                )}
              >
                {rawResult}
              </pre>
            </div>
          )}
          {rec.status === 'failed' && (
            <button
              type="button"
              onClick={() => void retry(rec.id)}
              className="inline-flex items-center gap-1 rounded border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-[10px] text-rose-200 hover:bg-rose-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <RotateCw aria-hidden className="h-2.5 w-2.5" />
              Retry this step
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
    <div className="mt-2 flex flex-col gap-1.5" role="list" aria-label="Work activity">
      {calls.map((c) => (
        <ToolChip key={c.id} rec={c} />
      ))}
    </div>
  )
}
