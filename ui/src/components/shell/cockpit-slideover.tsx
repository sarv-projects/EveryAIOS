'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Activity,
  Bell,
  ChevronRight,
  Pause,
  Play,
  RotateCcw,
  Square,
  Zap,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import {
  cockpitSnapshot,
  agentStop,
  agentUndo,
  type CockpitState,
} from '@/lib/tauri'
import { interruptRespond } from '@/lib/cockpit'
import { useAppStore } from '@/lib/store'

/**
 * P3.2 + P11.2 + P11.5.4 — cockpit / ambient flight-deck slide-over.
 *
 * P11.2 multi-agent view: parallel sub-agents render as cards (status /
 * model / tool / tokens) with per-agent STOP + UNDO; circuit-break interrupt
 * cards answer through `interrupt_respond` (no dead buttons).
 *
 * P11.2 cockpit transitions: quiet mode ↔ expanded panel are animated
 * (framer-motion AnimatePresence — 180ms spring, reduced-motion aware).
 *
 * P11.5.4 takeover/resume: each agent card carries Pause (switches the
 * session's panels to editable mode + "⏸ Paused" indicator) and Resume
 * (mandatory describe-changes prompt → agent continues).
 */
export function CockpitSlideover({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [state, setState] = useState<CockpitState | null>(null)
  const pausedSessions = useAppStore((s) => s.pausedSessions)
  const setSessionPaused = useAppStore((s) => s.setSessionPaused)
  const [resumeFor, setResumeFor] = useState<string | null>(null)
  const [resumeNote, setResumeNote] = useState('')
  const pushUserMessage = useAppStore((s) => s.pushUserMessage)

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

  const agents = state?.agents ?? []
  const interrupts = state?.interrupts ?? []

  const confirmResume = () => {
    if (!resumeFor) return
    // P11.5.4 — resume continues the agent with the describe-changes note as
    // mandatory context (the agent can't see what the user edited otherwise).
    const note = resumeNote.trim() || 'Resumed after manual edits.'
    setSessionPaused(resumeFor, false)
    pushUserMessage(`(resumed) ${note}`)
    setResumeFor(null)
    setResumeNote('')
  }

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ x: 320, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 320, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 38 }}
            className="absolute right-0 top-0 z-50 flex h-full w-80 flex-col border-l border-border bg-card shadow-xl"
          >
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

            {/* Interrupts — P11.2: answers wired to interrupt_respond */}
            <AnimatePresence>
              {interrupts.length > 0 && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden border-b border-border bg-yellow-500/5"
                >
                  <div className="p-3">
                    <div className="mb-2 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-yellow-300">
                      <Bell className="h-3 w-3" /> Interrupts ({interrupts.length})
                    </div>
                    <div className="space-y-2">
                      {interrupts.map((it, i) => (
                        <div
                          key={i}
                          className="rounded-md border border-yellow-500/30 bg-yellow-500/5 p-2 text-xs"
                        >
                          <div className="mb-1 font-mono text-[10px] text-muted-foreground">
                            {it.agent_id} · {it.kind}
                          </div>
                          <div className="text-foreground">{it.prompt}</div>
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {it.options.map((opt, oi) => (
                              <Button
                                key={opt}
                                size="sm"
                                variant="ghost"
                                className="h-6 text-[10px]"
                                onClick={() => void interruptRespond(it.agent_id, oi)}
                              >
                                {opt}
                              </Button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Agent cards — P11.2 multi-agent view */}
            <div className="flex-1 overflow-auto p-3">
              <div className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Agents ({agents.length})
                {agents.length > 1 && (
                  <span className="ml-1 text-orange-400">· running in parallel</span>
                )}
              </div>
              {agents.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  No active agents.
                </div>
              ) : (
                <div className="space-y-2">
                  {agents.map((a) => {
                    const paused = !!pausedSessions[a.agent_id]
                    const statusColor = paused
                      ? 'text-yellow-300 border-yellow-500/30 bg-yellow-500/10'
                      : a.status === 'Running'
                        ? 'text-orange-300 border-orange-500/30 bg-orange-500/10'
                        : a.status === 'Waiting'
                          ? 'text-yellow-300 border-yellow-500/30 bg-yellow-500/10'
                          : a.status === 'Done'
                            ? 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10'
                            : 'text-muted-foreground border-border'
                    return (
                      <div
                        key={a.agent_id}
                        className={cn(
                          'rounded-lg border bg-muted/20 p-2.5',
                          paused ? 'border-yellow-500/40' : 'border-border'
                        )}
                      >
                        <div className="mb-1.5 flex items-center justify-between">
                          <span className="text-xs font-medium text-foreground">{a.display_name}</span>
                          <span className={cn('rounded-full border px-1.5 py-0.5 text-[9px]', statusColor)}>
                            {paused ? '⏸ Paused' : a.status}
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
                        <div className="mb-2 flex gap-3 font-mono text-[10px] text-muted-foreground">
                          <span>↑ {formatTokens(a.tokens_in)} in</span>
                          <span>↓ {formatTokens(a.tokens_out)} out</span>
                        </div>
                        {/* P11.5.4 — takeover: Pause / Resume + STOP / UNDO */}
                        <div className="flex gap-1.5">
                          {paused ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-[10px] text-emerald-300 hover:bg-emerald-500/10"
                              onClick={() => setResumeFor(a.agent_id)}
                            >
                              <Play className="mr-1 h-3 w-3" /> Resume
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-[10px] text-yellow-300 hover:bg-yellow-500/10"
                              onClick={() => setSessionPaused(a.agent_id, true)}
                            >
                              <Pause className="mr-1 h-3 w-3" /> Pause
                            </Button>
                          )}
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
                <ChevronRight className="mr-1.5 h-3 w-3" /> Collapse
              </Button>
            </footer>
          </motion.div>
        )}
      </AnimatePresence>

      {/* P11.5.4 — resume requires describing the manual changes */}
      <Dialog open={resumeFor !== null} onOpenChange={(v) => !v && setResumeFor(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Resume agent</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Describe what you changed while it was paused — the agent continues
            from here with that context.
          </p>
          <Textarea
            value={resumeNote}
            onChange={(e) => setResumeNote(e.target.value)}
            placeholder="Describe your changes…"
            className="min-h-20 text-xs"
            autoFocus
          />
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setResumeFor(null)}>
              Cancel
            </Button>
            <Button size="sm" onClick={confirmResume}>
              <Play className="mr-1 h-3 w-3" /> Resume
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return `${n}`
}
