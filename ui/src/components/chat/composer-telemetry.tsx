'use client'

// The composer's telemetry strip — every figure here is either a real report or
// an explicit "not reported".
//
// The bar used to paint `$0.00` and `12% ctx` before anything had happened, and
// both numbers were fabricated at the point of painting:
//
//   * `spent` fell back to `0` and `cap` to a hard-coded `5`, so an empty ledger
//     read as "you have spent nothing" rather than "nothing was reported";
//   * the context percentage divided a token count by a **hard-coded 128,000**
//     window, because no surface reports the bound agent's real context length
//     (the agent owns its own model — ADR-0005). A plausible percentage on a
//     made-up denominator is the exact false claim I15 forbids.
//
// So: tokens come from the usage ledger (a real measurement, and only when the
// shell is live), cost comes from `costReadout()` in `spend.ts` which already
// separates *reported* from *estimated* from *unknown*, and the context window
// is stated as unreported rather than invented. Layout is a fixed-width,
// right-anchored cluster so no figure appearing or changing length moves
// anything (CLS = 0).

import { useEffect, useState } from 'react'
import { CircleDollarSign, Gauge, Hash, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/lib/store'
import { inTauri } from '@/lib/tauri'
import { costReadout, unreportedOwners, usageSnapshot } from '@/lib/spend'

export type TelemetryTone = 'ok' | 'warn' | 'muted'

export interface TelemetryReadout {
  /** Fixed-width slot content. Never wider than the slot. */
  text: string
  /** The sentence behind it: what reported this, or why nothing did. */
  title: string
  tone: TelemetryTone
}

/** The label every unreported figure wears. One owner, so no surface invents
 * its own phrasing for "the desktop has no report". */
export const NOT_REPORTED = 'not reported'

/**
 * Tokens are a *measurement* (`usage_snapshot` counts them), so they render as
 * soon as the ledger has one. Without a live shell there is no ledger, and the
 * value would be a preview fixture — which is never painted as a fact.
 */
export function tokenReadout(live: boolean, tokens: number | null | undefined): TelemetryReadout {
  if (!live) {
    return {
      text: `tok ${NOT_REPORTED}`,
      title: 'Token counts come from the usage ledger. This is a browser preview, so nothing has been measured.',
      tone: 'muted',
    }
  }
  if (typeof tokens !== 'number' || !Number.isFinite(tokens)) {
    return {
      text: `tok ${NOT_REPORTED}`,
      title: 'The usage ledger has reported no tokens yet.',
      tone: 'muted',
    }
  }
  return {
    text: `tok ${compact(tokens)}`,
    title: `${tokens.toLocaleString()} tokens measured by the usage ledger.`,
    tone: 'ok',
  }
}

/**
 * Cost keeps its provenance. `reported` is a producer's own figure, `estimated`
 * is our arithmetic over configured prices, and neither is `unknown` — which
 * must read as unknown, not as $0.00.
 */
export function costTelemetry(
  live: boolean,
  cost: { kind: 'reported' | 'estimated' | 'unknown'; usd: number | null } | null,
  unreported = 0,
): TelemetryReadout {
  if (!live) {
    return {
      text: `cost ${NOT_REPORTED}`,
      title: 'Spend comes from the usage ledger. This is a browser preview, so nothing has been measured.',
      tone: 'muted',
    }
  }
  if (!cost || cost.kind === 'unknown' || cost.usd === null) {
    return {
      text: `cost ${NOT_REPORTED}`,
      title:
        unreported > 0
          ? `${unreported} owner(s) finished turns without a usage report. No figure exists, so none is shown.`
          : 'No producer has reported spend and no price is configured. No figure exists, so none is shown.',
      tone: 'warn',
    }
  }
  const label = cost.kind === 'reported' ? 'reported' : 'estimated'
  return {
    text: `$${cost.usd.toFixed(2)} ${label}`,
    title:
      cost.kind === 'reported'
        ? `$${cost.usd.toFixed(4)} reported by the producer of the turn.`
        : `$${cost.usd.toFixed(4)} estimated from configured prices — no producer reported a figure.`,
    tone: cost.kind === 'reported' ? 'ok' : 'warn',
  }
}

/**
 * The context window is a property of the bound agent's own model, and the
 * desktop is not told what it is. So there is no percentage to show: saying
 * "12%" would mean dividing by a number we invented.
 */
export function contextTelemetry(live: boolean): TelemetryReadout {
  return {
    text: `ctx ${NOT_REPORTED}`,
    title: live
      ? 'The agent owns its model, so the desktop is not told the context window. No percentage is shown rather than dividing by a made-up window.'
      : 'The context window is owned by the agent, not the desktop.',
    tone: 'muted',
  }
}

function compact(n: number): string {
  if (n < 1000) return String(Math.round(n))
  if (n < 100_000) return (n / 1000).toFixed(1) + 'k'
  return Math.round(n / 1000) + 'k'
}

function Slot({
  icon: Icon,
  readout,
  className,
  label,
}: {
  icon: LucideIcon
  readout: TelemetryReadout
  className?: string
  label: string
}) {
  const tone =
    readout.tone === 'ok' ? 'text-emerald-400' : readout.tone === 'warn' ? 'text-warning' : 'text-muted-foreground'
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-end gap-1 truncate font-mono text-[10px] tabular-nums',
        className,
      )}
      title={readout.title}
      data-telemetry={label}
    >
      <Icon className={cn('h-3 w-3 shrink-0', tone)} aria-hidden="true" />
      <span className="truncate text-muted-foreground">{readout.text}</span>
    </span>
  )
}

interface Props {
  /** Tokens from the live usage ledger, when the panel has one. */
  tokens: number | null
}

/**
 * The footer cluster. Three fixed-width slots, right-anchored: a value changing
 * (or a figure appearing) never moves its neighbours, so the bar has no layout
 * shift while a turn runs.
 */
export default function ComposerTelemetry({ tokens }: Props) {
  const liveBudget = useAppStore((s) => s.liveBudget)
  const turnCount = useAppStore((s) => {
    const sess = s.sessions.find((x) => x.id === s.activeSessionId)
    return sess?.messages.length ?? 0
  })
  const [cost, setCost] = useState<{ kind: 'reported' | 'estimated' | 'unknown'; usd: number | null } | null>(null)
  const [unreported, setUnreported] = useState(0)
  const live = inTauri()

  // Event-driven refresh, not a polling loop: the ledger changes when a turn
  // settles, which is exactly when the figure can differ.
  useEffect(() => {
    if (!inTauri()) {
      setCost(null)
      setUnreported(0)
      return
    }
    let alive = true
    void (async () => {
      try {
        const snap = await usageSnapshot()
        if (!alive) return
        setCost(costReadout(snap))
        setUnreported(unreportedOwners(snap).length)
      } catch {
        // A rejected read is an absence, not a zero.
        if (alive) {
          setCost(null)
          setUnreported(0)
        }
      }
    })()
    return () => {
      alive = false
    }
  }, [turnCount, liveBudget])

  const tokenSlot = tokenReadout(live, tokens)
  const costSlot = costTelemetry(live, cost, unreported)
  const ctxSlot = contextTelemetry(live)

  return (
    <div className="ml-auto flex shrink-0 items-center gap-2">
      <Slot icon={Gauge} readout={ctxSlot} className="hidden w-[6.5rem] lg:flex" label="context" />
      <Slot icon={Hash} readout={tokenSlot} className="hidden w-[5.5rem] sm:flex" label="tokens" />
      <Slot icon={CircleDollarSign} readout={costSlot} className="w-[7.5rem]" label="cost" />
    </div>
  )
}
