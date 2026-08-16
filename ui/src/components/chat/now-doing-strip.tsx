'use client'

import { Activity } from 'lucide-react'
import { useAppStore } from '@/lib/store'

interface Props {
  title: string
  detail?: string
  stepIndex?: number
  stepTotal?: number
  elapsedMs?: number
  tokensThisTurn?: number
}

export default function NowDoingStrip({
  title,
  detail,
  stepIndex,
  stepTotal,
  elapsedMs,
  tokensThisTurn,
}: Props) {
  const setActiveView = useAppStore((s) => s.setActiveView)
  const agentPaused = useAppStore((s) => s.agentPaused)

  const stepLabel =
    stepIndex && stepTotal ? `(step ${stepIndex}/${stepTotal})` : ''

  const elapsedLabel = elapsedMs
    ? `${(elapsedMs / 1000).toFixed(1)}s elapsed`
    : null
  const tokensLabel = tokensThisTurn
    ? `${Math.round(tokensThisTurn / 1000)}K tokens this turn`
    : null

  const subParts = [detail, elapsedLabel, tokensLabel].filter(Boolean) as string[]
  const sub = subParts.join(' · ')

  return (
    <button
      type="button"
      onClick={() => setActiveView('progress')}
      className="group flex w-full items-center gap-2 border-b border-border bg-zinc-950/40 px-3 py-1.5 text-left transition-colors hover:bg-zinc-900/60"
    >
      <Activity
        className="h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:text-orange-300"
        aria-hidden
      />
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {!agentPaused ? (
          <span className="live-dot h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500" />
        ) : (
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/60" />
        )}
        <span className="truncate text-[11px] font-medium text-foreground">
          {title}
        </span>
        {stepLabel && (
          <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
            {stepLabel}
          </span>
        )}
      </div>
      {sub && (
        <span className="hidden truncate font-mono text-[10px] text-muted-foreground/70 sm:inline">
          {sub}
        </span>
      )}
    </button>
  )
}
