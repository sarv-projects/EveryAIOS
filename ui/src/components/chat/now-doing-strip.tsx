'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Activity } from 'lucide-react'
import { useAppStore } from '@/lib/store'
import { toPlainStage } from '@/lib/plain-language'

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

  // Live elapsed ticker (1s) so the banner feels like a real running job.
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 1000)
    return () => clearInterval(t)
  }, [])

  const stepLabel =
    stepIndex && stepTotal ? `(step ${stepIndex}/${stepTotal})` : ''

  const elapsedLabel = elapsedMs
    ? `${((elapsedMs + tick * 1000) / 1000).toFixed(0)}s elapsed`
    : null
  const tokensLabel = tokensThisTurn
    ? `${Math.round(tokensThisTurn / 1000)}K tokens this turn`
    : null

  // P32.1 — consumer phrasing for the headline; the technical stage/detail
  // stays behind the hover/expand layer (never the other way around).
  const plainTitle = toPlainStage(title)
  const subParts = [detail, elapsedLabel, tokensLabel].filter(Boolean) as string[]
  const sub = subParts.join(' · ')
  const technical = title !== plainTitle ? title : undefined

  return (
    <motion.button
      type="button"
      onClick={() => setActiveView('progress')}
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
      className="group flex w-full items-center gap-2 overflow-hidden border-b border-border bg-zinc-950/40 px-3 py-1.5 text-left transition-colors hover:bg-zinc-900/60"
    >
      <Activity className="breathe h-3.5 w-3.5 shrink-0 text-orange-400/80 group-hover:text-orange-300" aria-hidden />
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {!agentPaused ? (
          <span className="live-dot h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500" />
        ) : (
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/60" />
        )}
        <span
          className="truncate text-[11px] font-medium text-foreground"
          title={technical}
        >
          {plainTitle}
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
    </motion.button>
  )
}
