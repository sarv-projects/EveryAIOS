'use client'

import { useEffect, useState } from 'react'
import {
  Activity,
  ChevronRight,
  Pause,
  RotateCcw,
  Square,
  Zap,
  Bell,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  cockpitSnapshot,
  agentStop,
  agentUndo,
  type CockpitState,
} from '@/lib/tauri'

/**
 * P3.2 — cockpit / ambient flight-deck slide-over (H2, doc 33 §9.5).
 *
 * Polls `cockpit_snapshot` for live action cards + token counters, and exposes
 * STOP (kills the agent loop) and UNDO (requests revert of the last action)
 * that reach the coordinator via the control channel.
 */
export function CockpitSlideover({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [state, setState] = useState<CockpitState | null>(null)

  // Poll cockpit_snapshot every 2s when open.
  useEffect(() => {
    if (!open) return
    let active = true
    const poll = async () => {
      try {
        const s = await cockpitSnapshot()
        if (active) setState(s)
      } catch {
        // offline — keep last state.
      }
    }
    void poll()
    const id = setInterval(poll, 2000)
    return () => {
      active = false
      clearInterval(id)
    }
  }, [open])

  if (!open) return null

  const agents = state?.agents ?? []
  const interrupts = state?.interrupts ?? []

  return (
    <div className="absolute right-0 top-0 z-50 flex h-full w-80 flex-col border-l border-border bg-card shadow-xl fade-up">
      <header className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-orange-400" />
          <span className="text-sm font-semibold text-foreground">Cockpit</span>
          {state?.quiet && (
            <Badge variant="secondary" className="text-[9px]">quiet</Badge>
          )}
        </div>
        <Button size="icon" variant="ghost" className="size-6" onClick={onClose}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </header>

      {/* Interrupts */}
      {interrupts.length > 0 && (
        <div className="border-b border-border bg-yellow-500/5 p-3">
          <div className="mb-2 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-yellow-300">
            <Bell className="h-3 w-3" /> Interrupts ({interrupts.length})
          </div>
          <div className="space-y-2">
            {interrupts.map((it, i) => (
              <div key={i} className="rounded-md border border-yellow-500/30 bg-yellow-500/5 p-2 text-xs">
                <div className="mb-1 font-mono text-[10px] text-muted-foreground">{it.agent_id} · {it.kind}</div>
                <div className="text-foreground">{it.prompt}</div>
                <div className="mt-1.5 flex gap-1">
                  {it.options.map((opt) => (
                    <Button key={opt} size="sm" variant="ghost" className="h-6 text-[10px]">
                      {opt}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Agent cards */}
      <div className="flex-1 overflow-auto p-3">
        <div className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Agents ({agents.length})
        </div>
        {agents.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">
            No active agents.
          </div>
        ) : (
          <div className="space-y-2">
            {agents.map((a) => {
              const statusColor =
                a.status === 'Running'
                  ? 'text-orange-300 border-orange-500/30 bg-orange-500/10'
                  : a.status === 'Waiting'
                    ? 'text-yellow-300 border-yellow-500/30 bg-yellow-500/10'
                    : a.status === 'Done'
                      ? 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10'
                      : 'text-muted-foreground border-border'
              return (
                <div key={a.agent_id} className="rounded-lg border border-border bg-muted/20 p-2.5">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-xs font-medium text-foreground">{a.display_name}</span>
                    <span className={cn('rounded-full border px-1.5 py-0.5 text-[9px]', statusColor)}>
                      {a.status}
                    </span>
                  </div>
                  <div className="mb-1 font-mono text-[10px] text-muted-foreground">
                    {a.model} · {a.agent_id}
                  </div>
                  {a.last_tool && (
                    <div className="mb-2 flex items-center gap-1 text-[11px] text-foreground/80">
                      <Zap className="h-3 w-3 text-orange-400" />
                      <span className="font-mono">{a.last_tool}</span>
                      <span className="text-muted-foreground">— {a.last_summary}</span>
                    </div>
                  )}
                  {/* Token counters */}
                  <div className="mb-2 flex gap-3 font-mono text-[10px] text-muted-foreground">
                    <span>↑ {formatTokens(a.tokens_in)} in</span>
                    <span>↓ {formatTokens(a.tokens_out)} out</span>
                  </div>
                  {/* STOP / UNDO */}
                  <div className="flex gap-1.5">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-[10px] text-red-300 hover:bg-red-500/10"
                      onClick={() => agentStop(a.agent_id)}
                    >
                      <Square className="mr-1 h-3 w-3" /> Stop
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-[10px] text-muted-foreground hover:text-foreground"
                      onClick={() => agentUndo(a.agent_id)}
                    >
                      <RotateCcw className="mr-1 h-3 w-3" /> Undo
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <footer className="border-t border-border px-3 py-2">
        <Button
          size="sm"
          variant="ghost"
          className="w-full text-xs text-muted-foreground"
          onClick={onClose}
        >
          <Pause className="mr-1.5 h-3 w-3" /> Collapse
        </Button>
      </footer>
    </div>
  )
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}
