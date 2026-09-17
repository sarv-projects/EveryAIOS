'use client'

import * as React from 'react'
import {
  Activity,
  Brain,
  CheckCircle2,
  Code2,
  DollarSign,
  Globe,
  History,
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
import { inTauri } from '@/lib/tauri'
import { fsUndoList, type FsUndo } from '@/lib/fs'
import { deriveCheckpointTurns, snapshotsForSession } from '@/lib/checkpoints'
import { TurnCheckpoint } from './turn-checkpoint'

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
  tool_call: 'text-brand',
  file_edit: 'text-emerald-400',
  browser_nav: 'text-sky-400',
  shell_cmd: 'text-warning',
  model_switch: 'text-violet-400',
  checkpoint: 'text-emerald-400',
  cost_milestone: 'text-brand',
}

const statusRing: Record<string, string> = {
  done: 'bg-emerald-500',
  active: 'bg-brand live-dot',
  pending: 'bg-warning',
  error: 'bg-red-500',
}

type CheckpointLoad = 'loading' | 'ready' | 'empty' | 'error' | 'unavailable'

export function SessionTimeline() {
  const sessions = useAppStore((s) => s.sessions)
  const activeId = useAppStore((s) => s.activeSessionId)
  const selectedAgentId = useAppStore((s) => s.selectedAgentId)
  const session = sessions.find((s) => s.id === activeId)
  const sessionId = session?.id ?? ''
  const sessionTitle = session?.title ?? ''
  const sessionMessages = session?.messages ?? []

  // P64.7 — auto-checkpoints: one row per mutating turn (derived from the
  // real transcript) with restore backed by the shell's per-file snapshots.
  const checkpointTurns = React.useMemo(
    () => deriveCheckpointTurns(sessionMessages),
    [sessionMessages],
  )
  const [ckptState, setCkptState] = React.useState<CheckpointLoad>('loading')
  const [ckptFiles, setCkptFiles] = React.useState<FsUndo[]>([])
  const [ckptError, setCkptError] = React.useState('')
  const [ckptNonce, setCkptNonce] = React.useState(0)

  const reloadCheckpoints = React.useCallback(async () => {
    if (!sessionId) return
    if (!inTauri()) {
      setCkptState('unavailable')
      setCkptFiles([])
      return
    }
    setCkptState('loading')
    setCkptError('')
    try {
      const r = await fsUndoList()
      const mine = snapshotsForSession(r.undos ?? [], sessionId)
      setCkptFiles(mine)
      if (checkpointTurns.length === 0 && mine.length === 0) {
        setCkptState('empty')
      } else {
        setCkptState('ready')
      }
    } catch (e) {
      setCkptState('error')
      setCkptError(e instanceof Error ? e.message : 'Could not read saved checkpoints.')
    }
  }, [sessionId, checkpointTurns.length])

  React.useEffect(() => {
    setCkptFiles([])
    setCkptError('')
    setCkptState('loading')
    void reloadCheckpoints()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, ckptNonce, checkpointTurns.length])

  const events = React.useMemo(
    () => (session ? getTimelineEvents(session) : []),
    [session],
  )
  const agent = AGENT_MAP[selectedAgentId]
  // Ledger-backed totals only — never derived from seeded content.
  const totalTokens = session?.tokens ?? null
  const totalCost = session?.spent ?? null
  const doneCount = events.filter((e) => e.status === 'done').length

  // P11.4 — virtual scrolling for long timelines: only the windowed slice is
  // mounted; spacers keep the scrollbar honest (row height ~56px).
  const { visible, totalHeight, startOffset, onScroll, scrollRef } = useVirtualList({
    items: events,
    rowHeight: 56,
    overscan: 6,
  })

  if (!session) return null

  return (
    <div className="h-full w-full flex flex-col bg-card/60 backdrop-blur-sm">
      {/* Header */}
      <div className="shrink-0 px-4 py-3 border-b border-border bg-sidebar/40">
        <div className="flex items-center gap-2 mb-1">
          <Activity className="h-4 w-4 text-brand" />
          <span className="text-sm font-semibold">Session Timeline</span>
          {agent && (
            <span className={cn('ml-auto h-5 w-5 rounded text-[7px] font-bold flex items-center justify-center', agent.accent)}>{agent.mark}</span>
          )}
        </div>
        <p className="text-xs text-muted-foreground line-clamp-1">{sessionTitle}</p>
        <div className="flex items-center gap-3 mt-2 text-[11px] font-mono">
          <span className="text-muted-foreground">{events.length} events</span>
          {totalTokens != null && (
            <>
              <span className="text-muted-foreground">·</span>
              <span className="text-brand/80">{totalTokens.toLocaleString()} tokens</span>
            </>
          )}
          {totalCost != null && (
            <>
              <span className="text-muted-foreground">·</span>
              <span className="text-brand/80">${totalCost.toFixed(2)}</span>
            </>
          )}
        </div>
      </div>

      {/* P64.7 — Checkpoints: auto-saved before each mutating turn, with
          restore-to-this-step backed by the shell snapshots. Fixed min-height
          keeps CLS=0 while the snapshot list loads. */}
      <section
        aria-label="Checkpoints"
        className="shrink-0 border-b border-border bg-background/40 px-4 py-2"
      >
        <div className="mb-1.5 flex items-center gap-1.5">
          <History className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
          <h3 className="text-[11px] font-semibold text-foreground">Checkpoints</h3>
          {ckptState === 'ready' && checkpointTurns.length > 0 && (
            <span className="rounded-full border border-primary/30 bg-primary/10 px-1.5 py-px font-mono text-[9px] tabular-nums text-primary">
              {checkpointTurns.length} turn{checkpointTurns.length === 1 ? '' : 's'} · {ckptFiles.length} file{ckptFiles.length === 1 ? '' : 's'} saved
            </span>
          )}
          {ckptState === 'ready' && (
            <button
              type="button"
              onClick={() => setCkptNonce((n) => n + 1)}
              className="ml-auto rounded px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              Refresh
            </button>
          )}
        </div>
        <div className="min-h-[52px]">
          {ckptState === 'loading' && (
            <div className="space-y-1.5 py-1" aria-hidden="true">
              {/* Exact-fit skeletons: one row per known mutating turn so the
                  loaded list does not push the timeline (CLS=0). */}
              {(checkpointTurns.length > 0 ? checkpointTurns : [{ messageId: 'skeleton' }]).slice(0, 4).map((t) => (
                <div key={t.messageId} className="min-h-[44px] rounded-lg border border-border px-2.5 py-2">
                  <div className="shimmer h-2.5 rounded" style={{ width: '62%' }} />
                  <div className="shimmer mt-1.5 h-2 rounded" style={{ width: '40%' }} />
                </div>
              ))}
              <p className="sr-only" role="status">Reading saved checkpoints…</p>
            </div>
          )}
          {ckptState === 'unavailable' && (
            <p className="py-1 text-[11px] leading-relaxed text-muted-foreground" role="status">
              Checkpoints need the desktop app — open this session in Tauri to see saved copies
              and restore.
            </p>
          )}
          {ckptState === 'error' && (
            <div className="flex items-center gap-2 py-1" role="alert">
              <p className="flex-1 text-[11px] text-muted-foreground">
                Could not read checkpoints{ckptError ? ` — ${ckptError}` : ''}.
              </p>
              <button
                type="button"
                onClick={() => setCkptNonce((n) => n + 1)}
                className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                Try again
              </button>
            </div>
          )}
          {ckptState === 'empty' && (
            <p className="py-1 text-[11px] leading-relaxed text-muted-foreground" role="status">
              No checkpoints yet — a checkpoint is saved automatically before the agent changes
              files.
            </p>
          )}
          {ckptState === 'ready' && checkpointTurns.length === 0 && (
            <p className="py-1 text-[11px] leading-relaxed text-muted-foreground" role="status">
              {ckptFiles.length > 0
                ? `No file-changing turns in this transcript, but ${ckptFiles.length} saved file${ckptFiles.length === 1 ? '' : 's'} remain for this session — open the diff view to review and restore them.`
                : 'No file-changing turns yet — checkpoints appear here after the agent edits, runs shell, or updates office files.'}
            </p>
          )}
          {ckptState === 'ready' && checkpointTurns.length > 0 && (
            <ol className="max-h-56 space-y-1.5 overflow-auto scroll-thin pr-0.5">
              {checkpointTurns.map((t) => (
                <li key={t.messageId}>
                  <TurnCheckpoint
                    sessionId={session.id}
                    messageId={t.messageId}
                    timestamp={t.timestamp}
                    summary={t.summary}
                    turnIndex={t.turnIndex}
                    files={ckptFiles}
                    loadState={ckptFiles.length === 0 ? 'empty' : 'ready'}
                    onRestored={() => setCkptNonce((n) => n + 1)}
                  />
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>

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
                  isActive ? 'bg-brand/20 ring-1 ring-brand/40' : 'bg-background ring-1 ring-border'
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
                    <span className={cn('text-xs font-medium', isActive && 'text-brand')}>
                      {event.title}
                    </span>
                    {event.type === 'cost_milestone' && (
                      <Badge variant="outline" className="h-4 text-[9px] font-mono border-brand/30 text-brand">
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
                          <span className="text-brand/60">${event.meta.cost.toFixed(2)}</span>
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
              <span className="text-brand/80">${totalCost.toFixed(2)}</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
