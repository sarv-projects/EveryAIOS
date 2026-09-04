'use client'

import * as React from 'react'
import {
  Activity,
  Brain,
  CheckCircle2,
  Code2,
  DollarSign,
  Globe,
  Loader2,
  MessageSquare,
  Terminal,
  Zap,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { useAppStore, type Session } from '@/lib/store'
import { AGENT_MAP } from '@/lib/agents'
import { useVirtualList } from '@/lib/ux'
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

// Timeline events derived from the session's real transcript — messages,
// tool calls, plan steps, artifacts, and interrupts. No seeded content: an
// empty session renders an honest empty state, never sample work.
function getTimelineEvents(session: Session): TimelineEvent[] {
  const events: TimelineEvent[] = [
    { id: `${session.id}-start`, timestamp: session.updatedAt, type: 'message', title: 'Session started', detail: session.title, status: 'done' },
  ]

  for (const m of session.messages ?? []) {
    const snippet = m.content.length > 140 ? `${m.content.slice(0, 140)}…` : m.content
    if (m.role === 'user') {
      events.push({ id: `${m.id}-msg`, timestamp: m.timestamp, type: 'message', title: 'You', detail: snippet || undefined, status: 'done' })
    } else if (m.role === 'assistant') {
      events.push({ id: `${m.id}-msg`, timestamp: m.timestamp, type: 'message', title: 'Assistant', detail: snippet || undefined, status: 'done' })
    } else {
      events.push({ id: `${m.id}-msg`, timestamp: m.timestamp, type: 'message', title: 'System', detail: snippet || undefined, status: 'done' })
    }
    for (const t of m.toolCalls ?? []) {
      events.push({
        id: `${m.id}-tool-${t.id}`,
        timestamp: m.timestamp,
        type: 'tool_call',
        title: t.toolId,
        detail: t.error ?? t.progress ?? (t.args ? Object.keys(t.args).slice(0, 4).join(', ') : undefined),
        status: t.status === 'running' ? 'active' : t.status === 'failed' ? 'error' : 'done',
      })
    }
    for (const s of m.steps ?? []) {
      events.push({
        id: `${m.id}-step-${s.id}`,
        timestamp: s.timestamp ?? m.timestamp,
        type: stepToEventType(s.type),
        title: s.label,
        detail: s.detail ?? s.output ?? undefined,
        status: s.status === 'failed' ? 'error' : s.status,
      })
    }
    for (const a of m.artifacts ?? []) {
      events.push({ id: `${m.id}-art-${a.id}`, timestamp: m.timestamp, type: 'file_edit', title: a.name, detail: a.type, status: 'done' })
    }
    if (m.mcq) {
      events.push({ id: `${m.id}-mcq-${m.mcq.id}`, timestamp: m.timestamp, type: 'message', title: m.mcq.title, detail: m.mcq.description, status: 'pending' })
    }
  }

  // A running session's latest event is the live one.
  if (session.status === 'running' && events.length > 0) {
    events[events.length - 1] = { ...events[events.length - 1], status: 'active' }
  }
  return events
}

function stepToEventType(t: string): TimelineEvent['type'] {
  switch (t) {
    case 'shell': return 'shell_cmd'
    case 'browser': return 'browser_nav'
    case 'tool': return 'tool_call'
    case 'checkpoint':
    case 'chart':
    case 'export': return 'checkpoint'
    default: return 'file_edit'
  }
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
  // Ledger-backed totals only — never derived from seeded content.
  const totalTokens = session.tokens ?? null
  const totalCost = session.spent ?? null
  const doneCount = events.filter((e) => e.status === 'done').length

  // P11.4 — virtual scrolling for long timelines: only the windowed slice is
  // mounted; spacers keep the scrollbar honest (row height ~56px).
  const { visible, totalHeight, startOffset, onScroll, scrollRef } = useVirtualList({
    items: events,
    rowHeight: 56,
    overscan: 6,
  })

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
          {totalTokens != null && (
            <>
              <span className="text-muted-foreground">·</span>
              <span className="text-orange-400/80">{totalTokens.toLocaleString()} tokens</span>
            </>
          )}
          {totalCost != null && (
            <>
              <span className="text-muted-foreground">·</span>
              <span className="text-orange-400/80">${totalCost.toFixed(2)}</span>
            </>
          )}
        </div>
      </div>

      {/* Timeline — P11.4 virtualized scroll container */}
      <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-auto">
        {events.length <= 1 ? (
          <p className="px-4 py-6 text-center text-[11px] text-muted-foreground">
            No events yet — send the first message to start this session's timeline.
          </p>
        ) : (
        <div className="px-4 py-3" style={{ height: totalHeight, position: 'relative' }}>
          <div style={{ transform: `translateY(${startOffset}px)` }}>
          {visible.map((event, i) => {
            const Icon = typeIcon[event.type]
            const accent = typeAccent[event.type]
            const isLast = i === visible.length - 1
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
        </div>
        )}
      </div>

      {/* Footer summary */}
      <div className="shrink-0 px-4 py-2 border-t border-border bg-sidebar/40 flex items-center justify-between text-[10.5px] font-mono">
        <span className="text-muted-foreground">{doneCount}/{events.length} completed</span>
        {(totalTokens != null || totalCost != null) && (
          <div className="flex items-center gap-2">
            {totalTokens != null && (
              <span className="text-muted-foreground">{totalTokens.toLocaleString()} tokens</span>
            )}
            {totalCost != null && (
              <span className="text-orange-400/80">${totalCost.toFixed(2)}</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
