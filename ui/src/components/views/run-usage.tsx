'use client'

// Context and token usage for the current run.
//
// Two owners, both real:
//   • `usage_snapshot` (Rust `UsageLedger`) — per-chat input/output tokens and
//     the **reporter** each figure came from, plus the honesty counter for
//     turns that finished with no report at all.
//   • nothing else. There is no per-run context-window report anywhere in the
//     current tree, so the meter renders "not reported" and prints no
//     percentage. The hardcoded 128k used elsewhere in the store is a
//     placeholder, and a placeholder rendered as a meter is a false claim (I15).
//
// A percentage appears only when a real window is supplied. The "≈" and the
// "Estimate" label keep the derivation honest even then: the ledger's input
// tokens approximate current context occupation, they do not measure it.

import { useCallback, useEffect, useState } from 'react'
import { Database, RefreshCw } from 'lucide-react'
import { inTauri } from '@/lib/tauri'
import { usageSnapshot, usageSourceLabel, type UsageSnapshot } from '@/lib/spend'
import { formatTokens, contextOccupancy } from '@/components/views/run-projection'
import { RunFact } from '@/components/views/run-section'
import { cn } from '@/lib/utils'

export interface RunUsage {
  /** Input tokens the ledger recorded for this chat. `null` = not reported. */
  inputTokens: number | null
  outputTokens: number | null
  totalTokens: number | null
  /** Who reported the figure, in plain words. */
  reportedBy: string
  /** Turns that finished with no usage report at all. */
  unreportedTurns: number
  /**
   * A real context window in tokens, when one is known. `null` today — no
   * command reports a per-run window, and inventing one is what this surface
   * refuses to do.
   */
  windowTokens: number | null
  /** True once a real read has completed (so "not reported" ≠ "still loading"). */
  read: boolean
  /** Why nothing could be read, when that is the case. */
  reason: string | null
}

const NOT_READ: RunUsage = {
  inputTokens: null,
  outputTokens: null,
  totalTokens: null,
  reportedBy: 'not reported',
  unreportedTurns: 0,
  windowTokens: null,
  read: false,
  reason: null,
}

/** Project the ledger into the panel's figures. Pure — unit-tested. */
export function projectRunUsage(
  snapshot: UsageSnapshot | null,
  chatId: string | null,
): RunUsage {
  const rows = Array.isArray(snapshot?.bySession) ? snapshot!.bySession : []
  if (!snapshot || !chatId) {
    return {
      ...NOT_READ,
      read: Boolean(snapshot),
      reason: snapshot
        ? 'no usage row for this chat — nothing has been reported for it'
        : null,
    }
  }
  const row = rows.find((r) => r?.sessionId === chatId)
  if (!row) {
    return {
      ...NOT_READ,
      read: true,
      reason: 'no usage reported for this chat yet',
    }
  }
  const input = row.tokensIn ?? 0
  const output = row.tokensOut ?? 0
  // The ledger keys its "finished with nothing reported" counter by the owner
  // that produced the turn (the agent, else the chat). Only this chat's own
  // counter is quoted — another owner's gap is not this run's gap.
  const unreported = snapshot.observations?.unreported?.[chatId] ?? 0
  return {
    inputTokens: input,
    outputTokens: output,
    totalTokens: input + output,
    reportedBy: usageSourceLabel(row.source),
    unreportedTurns: unreported,
    windowTokens: null,
    read: true,
    reason: null,
  }
}

export function RunUsageSection({ chatId }: { chatId: string | null }) {
  const [usage, setUsage] = useState<RunUsage>(NOT_READ)
  const [loading, setLoading] = useState(false)

  const read = useCallback(async () => {
    // Outside the desktop shell `usageSnapshot()` returns a demo fixture, so the
    // panel says the ledger is unreachable instead of printing invented tokens.
    if (!inTauri()) {
      setUsage({
        ...NOT_READ,
        read: true,
        reason: 'token counts come from the local usage ledger in the desktop app',
      })
      return
    }
    setLoading(true)
    try {
      setUsage(projectRunUsage(await usageSnapshot(), chatId))
    } catch {
      setUsage({
        ...NOT_READ,
        read: true,
        reason: 'the usage ledger could not be read',
      })
    } finally {
      setLoading(false)
    }
  }, [chatId])

  useEffect(() => {
    void read()
  }, [read])

  const occupancy = contextOccupancy(usage.inputTokens, usage.windowTokens)

  return (
    <div data-testid="run-usage">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground/70">
          <Database aria-hidden className="h-3 w-3" />
          Usage
        </span>
        <button
          type="button"
          onClick={() => void read()}
          disabled={loading}
          aria-label="Refresh token usage from the ledger"
          className="inline-flex h-5 items-center gap-1 rounded-md border border-border px-1.5 font-mono text-[9px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 disabled:opacity-50"
        >
          <RefreshCw aria-hidden className={cn('h-2.5 w-2.5', loading && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {usage.read && usage.reason ? (
        <p className="rounded-md border border-dashed border-border px-2 py-1.5 text-[10px] leading-relaxed text-muted-foreground">
          {usage.reason}.
        </p>
      ) : null}

      <div className="mt-1 space-y-0.5">
        <RunFact
          label="Input"
          value={usage.read && !usage.reason ? formatTokens(usage.inputTokens) : '—'}
        />
        <RunFact
          label="Output"
          value={usage.read && !usage.reason ? formatTokens(usage.outputTokens) : '—'}
        />
        <RunFact
          label="Total"
          value={usage.read && !usage.reason ? formatTokens(usage.totalTokens) : '—'}
        />
        <RunFact
          label="Source"
          value={
            <span className="text-muted-foreground">
              {usage.read && !usage.reason ? usage.reportedBy : 'not reported'}
            </span>
          }
        />
        {usage.unreportedTurns > 0 ? (
          <RunFact
            label="No report"
            tone="text-warning"
            value={`${usage.unreportedTurns} turn${usage.unreportedTurns === 1 ? '' : 's'} finished with no usage report`}
          />
        ) : null}
      </div>

      <div className="mt-2">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground/70">
            Context window
          </span>
          {occupancy ? (
            <span className="font-mono text-[10px] tabular-nums text-foreground/90">
              ≈{Math.round(occupancy.pct)}% · estimate
            </span>
          ) : null}
        </div>
        {/* Reserved-height track: the bar never appears/disappears under text,
            so the block below keeps its position (CLS = 0). */}
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted/70">
          {occupancy ? (
            <div
              className={cn(
                'h-full rounded-full transition-[width] duration-300',
                occupancy.pct >= 90
                  ? 'bg-danger'
                  : occupancy.pct >= 75
                    ? 'bg-warning'
                    : 'bg-brand',
              )}
              style={{ width: `${occupancy.pct}%` }}
            />
          ) : null}
        </div>
        {occupancy ? (
          <p className="mt-1 text-[9px] leading-relaxed text-muted-foreground">
            ≈{formatTokens(occupancy.used)} of ≈{formatTokens(occupancy.total)} — the last reported
            input count stands in for how full the window is.
          </p>
        ) : (
          <p className="mt-1 text-[9px] leading-relaxed text-muted-foreground">
            Not reported — no command returns a context window for a run, so no percentage is shown.
          </p>
        )}
      </div>
    </div>
  )
}
