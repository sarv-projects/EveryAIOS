'use client'

import * as React from 'react'
import {
  Activity,
  ArrowRight,
  Brain,
  CheckCircle2,
  ChevronDown,
  Circle,
  Clock,
  Code2,
  DollarSign,
  FileText,
  Globe,
  Loader2,
  MessageSquare,
  Sparkles,
  Terminal,
  Zap,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useAppStore, type Session } from '@/lib/store'
import { AGENT_MAP, MODEL_MAP } from '@/lib/agents'
import { cn } from '@/lib/utils'

// Timeline event types for a session
interface TimelineEvent {
  id: string
  timestamp: string
  type: 'message' | 'tool_call' | 'file_edit' | 'browser_nav' | 'shell_cmd' | 'model_switch' | 'checkpoint' | 'cost_milestone'
  title: string
  detail?: string
  status?: 'done' | 'active' | 'pending' | 'error'
  meta?: {
    tokens?: number
    cost?: number
    duration?: number
  }
}

// Generate mock timeline events for a session
function getTimelineEvents(session: Session): TimelineEvent[] {
  const base = session.updatedAt
  const events: TimelineEvent[] = [
    { id: 't1', timestamp: base, type: 'message', title: 'Session started', detail: session.title, status: 'done' },
    { id: 't2', timestamp: base, type: 'model_switch', title: 'Agent initialized', detail: 'Claude Code · Sonnet 4.5', status: 'done', meta: { tokens: 2400, cost: 0.01 } },
  ]

  if (session.status === 'running' || session.status === 'action-required' || session.status === 'paused') {
    events.push(
      { id: 't3', timestamp: base, type: 'tool_call', title: 'Reading project files', detail: 'src/api/*.ts — 12 files indexed', status: 'done', meta: { tokens: 8400, cost: 0.04 } },
      { id: 't4', timestamp: base, type: 'file_edit', title: 'Edited src/api/handler.ts', detail: '+24 / -8 lines · surgical patch', status: 'done', meta: { tokens: 3200, cost: 0.02 } },
      { id: 't5', timestamp: base, type: 'shell_cmd', title: 'Ran npm run build', detail: 'Exit 0 — 2.3s', status: 'done', meta: { duration: 2300 } },
      { id: 't6', timestamp: base, type: 'browser_nav', title: 'Navigated to docs.api.com', detail: 'Extracted API schema from /v2/spec', status: 'done', meta: { tokens: 12000, cost: 0.06 } },
      { id: 't7', timestamp: base, type: 'checkpoint', title: 'Auto-checkpoint saved', detail: '4 files modified · total +86/-23', status: 'done' },
      { id: 't8', timestamp: base, type: 'cost_milestone', title: '$1.00 spent', detail: '42K input · 8K output tokens', status: 'done' },
      { id: 't9', timestamp: base, type: 'tool_call', title: 'Regenerating chart data', detail: 'IronCalc recalc · B7:B12', status: 'active', meta: { tokens: 4200, cost: 0.02 } },
    )
  }

  if (session.status === 'action-required') {
    events.push(
      { id: 't10', timestamp: base, type: 'message', title: 'Approval requested', detail: 'Paragraph rewrite in exec-summary.docx', status: 'pending', meta: { tokens: 1800, cost: 0.01 } },
    )
  }

  if (session.status === 'completed') {
    events.push(
      { id: 't3b', timestamp: base, type: 'tool_call', title: 'Processing batch', detail: '42 invoices · PDF fill + sign', status: 'done', meta: { tokens: 48000, cost: 0.24 } },
      { id: 't4b', timestamp: base, type: 'checkpoint', title: 'Batch complete', detail: '42/42 signed · 0 errors', status: 'done' },
      { id: 't5b', timestamp: base, type: 'cost_milestone', title: '$2.41 total', detail: '240K tokens across 186 turns', status: 'done' },
    )
  }

  return events
}

const typeIcon: Record<TimelineEvent['type'], React.ElementType> = {
  message: MessageSquare,
  tool_call: Zap,
  file_edit: Code2,
  browser_nav: Globe,
  shell_cmd: Terminal,
  model_switch: Brain,
  checkpoint: CheckCircle2,
  cost_milestone: DollarSign,
}

const typeAccent: Record<TimelineEvent['type'], string> = {
  message: 'text-blue-400',
  tool_call: 'text-orange-400',
  file_edit: 'text-emerald-400',
  browser_nav: 'text-sky-400',
  shell_cmd: 'text-amber-400',
  model_switch: 'text-violet-400',
  checkpoint: 'text-emerald-400',
  cost_milestone: 'text-orange-400',
}

const statusRing: Record<string, string> = {
  done: 'bg-emerald-500',
  active: 'bg-orange-500 live-dot',
  pending: 'bg-amber-500',
  error: 'bg-red-500',
}

export function SessionTimeline() {
  const sessions = useAppStore((s) => s.sessions)
  const activeId = useAppStore((s) => s.activeSessionId)
  const selectedAgentId = useAppStore((s) => s.selectedAgentId)
  const session = sessions.find((s) => s.id === activeId)

  if (!session) return null

  const events = getTimelineEvents(session)
  const agent = AGENT_MAP[selectedAgentId]
  const totalTokens = events.reduce((sum, e) => sum + (e.meta?.tokens ?? 0), 0)
  const totalCost = events.reduce((sum, e) => sum + (e.meta?.cost ?? 0), 0)

  return (
    <div className="h-full w-full flex flex-col bg-card/60 backdrop-blur-sm">
      {/* Header */}
      <div className="shrink-0 px-4 py-3 border-b border-border bg-sidebar/40">
        <div className="flex items-center gap-2 mb-1">
          <Activity className="h-4 w-4 text-orange-500" />
          <span className="text-sm font-semibold">Session Timeline</span>
          {agent && (
            <span className={cn('ml-auto h-5 w-5 rounded text-[7px] font-bold flex items-center justify-center', agent.accent)}>{agent.mark}</span>
          )}
        </div>
        <p className="text-xs text-muted-foreground line-clamp-1">{session.title}</p>
        <div className="flex items-center gap-3 mt-2 text-[11px] font-mono">
          <span className="text-muted-foreground">{events.length} events</span>
          <span className="text-muted-foreground">·</span>
          <span className="text-orange-400/80">{totalTokens.toLocaleString()} tokens</span>
          <span className="text-muted-foreground">·</span>
          <span className="text-orange-400/80">${totalCost.toFixed(2)}</span>
        </div>
      </div>

      {/* Timeline */}
      <ScrollArea className="flex-1">
        <div className="px-4 py-3">
          {events.map((event, i) => {
            const Icon = typeIcon[event.type]
            const accent = typeAccent[event.type]
            const isLast = i === events.length - 1
            const isActive = event.status === 'active'

            return (
              <div key={event.id} className="relative flex gap-3 pb-4">
                {/* Connector line */}
                {!isLast && (
                  <div className="absolute left-[11px] top-6 bottom-0 w-px bg-border/60" />
                )}

                {/* Icon node */}
                <div className={cn(
                  'relative z-10 shrink-0 h-6 w-6 rounded-full flex items-center justify-center',
                  isActive ? 'bg-orange-500/20 ring-1 ring-orange-500/40' : 'bg-background ring-1 ring-border'
                )}>
                  {isActive ? (
                    <Loader2 className={cn('h-3 w-3 animate-spin', accent)} />
                  ) : (
                    <Icon className={cn('h-3 w-3', accent)} />
                  )}
                  {event.status && event.status !== 'active' && (
                    <span className={cn('absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full ring-1 ring-background', statusRing[event.status] ?? 'bg-zinc-500')} />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 pt-0.5">
                  <div className="flex items-center gap-2">
                    <span className={cn('text-xs font-medium', isActive && 'text-orange-400')}>
                      {event.title}
                    </span>
                    {event.type === 'cost_milestone' && (
                      <Badge variant="outline" className="h-4 text-[9px] font-mono border-orange-500/30 text-orange-400">
                        cost
                      </Badge>
                    )}
                    {event.type === 'checkpoint' && (
                      <Badge variant="outline" className="h-4 text-[9px] font-mono border-emerald-500/30 text-emerald-400">
                        saved
                      </Badge>
                    )}
                  </div>
                  {event.detail && (
                    <p className="text-[11px] text-muted-foreground/70 mt-0.5 line-clamp-2 font-mono">
                      {event.detail}
                    </p>
                  )}
                  {event.meta && (
                    <div className="flex items-center gap-2 mt-1 text-[10px] font-mono text-muted-foreground/50">
                      {event.meta.tokens !== undefined && (
                        <span>{event.meta.tokens.toLocaleString()} tok</span>
                      )}
                      {event.meta.cost !== undefined && event.meta.cost > 0 && (
                        <>
                          <span>·</span>
                          <span className="text-orange-400/60">${event.meta.cost.toFixed(2)}</span>
                        </>
                      )}
                      {event.meta.duration !== undefined && (
                        <>
                          <span>·</span>
                          <span>{(event.meta.duration / 1000).toFixed(1)}s</span>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </ScrollArea>

      {/* Footer summary */}
      <div className="shrink-0 px-4 py-2 border-t border-border bg-sidebar/40 flex items-center justify-between text-[10.5px] font-mono">
        <span className="text-muted-foreground">{events.filter(e => e.status === 'done').length}/{events.length} completed</span>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">{totalTokens.toLocaleString()} tokens</span>
          <span className="text-orange-400/80">${totalCost.toFixed(2)}</span>
        </div>
      </div>
    </div>
  )
}
