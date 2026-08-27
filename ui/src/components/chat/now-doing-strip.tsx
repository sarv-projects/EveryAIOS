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

const AUTONOMY_LABEL: Record<string, { mark: string; reads: boolean; edits: boolean }> = {
  sandbox: { mark: '🛡 Sandbox', reads: true, edits: false },
  ask: { mark: '👀 Ask', reads: true, edits: false },
  auto: { mark: '⚡ Auto', reads: true, edits: true },
  full: { mark: '🚀 Maximum', reads: true, edits: true },
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
  const permissionMode = useAppStore((s) => s.permissionMode)
  const taskSnapshot = useAppStore((s) => s.taskSnapshot)
  const sessions = useAppStore((s) => s.sessions)

  // P44.6 — the live autonomy indicator. During a task it reads the FROZEN
  // snapshot (never the live chatbar) so it shows exactly what this task is
  // authorized to do; temporary elevation (task-scoped) shows a ⚡ badge that
  // disappears at task end. Read-only derivation — never consumes the
  // one-shot elevation here (that happens when the elevated action runs).
  const snap = taskSnapshot
  const level =
    snap && snap.elevation && !snap.elevation.oneShot
      ? snap.elevation.level
      : snap
        ? snap.autonomyLevel
        : permissionMode
  const info = AUTONOMY_LABEL[level] ?? AUTONOMY_LABEL.ask!
  const elevated = !!taskSnapshot?.elevation
  const activeSession = sessions.find((x) => x.id === useAppStore.getState().activeSessionId)
  const runningToolCalls = (activeSession?.messages.flatMap((m) => m.toolCalls ?? []) ?? []).filter(
    (t) => t.status === 'running',
  )
  const externalCount = runningToolCalls.filter((t) =>
    /^(search|browser|gmail|calendar|slack|drive|sheets|external|mcp)/i.test(t.toolId),
  ).length
  const scopeLabel = taskSnapshot
    ? `${info.reads ? '✓ reads' : '— reads'} · ${info.edits ? '✓ edits' : '— edits'}`
    : ''
  const autonomyMark = taskSnapshot
    ? `${info.mark}${elevated ? ' ⚡' : ''}${scopeLabel ? ` │ ${scopeLabel}` : ''}${
        externalCount > 0 ? ` · ⚠ ${externalCount} external — approval required` : ''
      }${taskSnapshot ? ` · cfg ${taskSnapshot.configHash.slice(0, 6)}` : ''}`
    : info.mark

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
        <span
          className="shrink-0 rounded border border-border bg-background/40 px-1 font-mono text-[9px] text-muted-foreground"
          title="Autonomy level for this turn (H34)"
        >
          {autonomyMark}
        </span>
      </div>
      {sub && (
        <span className="hidden truncate font-mono text-[10px] text-muted-foreground/70 sm:inline">
          {sub}
        </span>
      )}
    </motion.button>
  )
}
