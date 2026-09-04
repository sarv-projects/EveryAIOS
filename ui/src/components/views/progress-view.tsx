'use client'

import { useState } from 'react'
import {
  MessageSquare,
  Zap,
  FileDown,
  ChevronRight,
  ChevronDown,
  CheckCircle2,
  Loader2,
  Radio,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/lib/store'
import type { WorkEventEnvelope } from '@/lib/work'

type EventKind = 'message' | 'tool' | 'work'

type Ev = {
  id: string
  t: string
  icon: React.ReactNode
  kind: EventKind
  label: string
  status: 'done' | 'active'
  detail?: string
}

const FILTERS = ['All', 'Messages', 'Tools', 'Work'] as const

function fmtTime(ts: string | number): string {
  try {
    const d = new Date(typeof ts === 'number' ? ts : ts)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch {
    return String(ts)
  }
}

function summarizeWorkEvent(envelope: WorkEventEnvelope): { label: string; detail?: string } {
  const ev = envelope.event as { type?: string; kind?: string; summary?: string; message?: string } | null
  if (ev && typeof ev === 'object') {
    const label = ev.summary ?? ev.message ?? ev.type ?? ev.kind ?? 'Work event'
    return { label: `#${envelope.sequence} ${label}`, detail: JSON.stringify(envelope.event).slice(0, 300) }
  }
  return { label: `#${envelope.sequence} Work event`, detail: String(envelope.event).slice(0, 300) }
}

/** Session + gateway activity, derived live. Empty stays empty. */
function buildEvents(
  messages: { id: string; role: string; content: string; timestamp: string; toolCalls?: { id: string; toolId: string; status: string; error?: string }[]; artifacts?: { id: string; name: string }[] }[],
  work: WorkEventEnvelope[],
  running: boolean,
): Ev[] {
  const out: Ev[] = []
  for (const m of messages) {
    if (m.role === 'user') {
      const text = m.content.length > 120 ? `${m.content.slice(0, 120)}…` : m.content
      out.push({ id: `${m.id}-msg`, t: fmtTime(m.timestamp), icon: <MessageSquare className="h-3.5 w-3.5 text-blue-400" />, kind: 'message', label: text || '(empty message)', status: 'done' })
    } else if (m.role === 'assistant') {
      const tools = m.toolCalls ?? []
      const first = m.content.split('\n')[0]?.slice(0, 120) || 'Assistant turn'
      out.push({
        id: `${m.id}-msg`,
        t: fmtTime(m.timestamp),
        icon: <Zap className="h-3.5 w-3.5 text-orange-400" />,
        kind: 'message',
        label: first,
        status: 'done',
        detail: tools.length > 0 ? `${tools.length} tool call(s): ${tools.map((t) => t.toolId).slice(0, 5).join(', ')}` : undefined,
      })
      for (const t of tools) {
        out.push({
          id: `${m.id}-tool-${t.id}`,
          t: fmtTime(m.timestamp),
          icon: <Zap className="h-3.5 w-3.5 text-orange-400" />,
          kind: 'tool',
          label: t.toolId,
          status: t.status === 'running' ? 'active' : 'done',
          detail: t.error ?? undefined,
        })
      }
    }
    for (const a of m.artifacts ?? []) {
      out.push({ id: `${m.id}-art-${a.id}`, t: fmtTime(m.timestamp), icon: <FileDown className="h-3.5 w-3.5 text-emerald-400" />, kind: 'message', label: `Artifact: ${a.name}`, status: 'done' })
    }
  }
  for (const w of work) {
    const s = summarizeWorkEvent(w)
    out.push({ id: `work-${w.sequence}`, t: fmtTime(w.timestamp), icon: <Radio className="h-3.5 w-3.5 text-violet-400" />, kind: 'work', label: s.label, status: 'done', detail: s.detail })
  }
  if (running && out.length > 0) out[out.length - 1] = { ...out[out.length - 1], status: 'active' }
  return out
}

export default function ProgressView() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('All')
  const [expanded, setExpanded] = useState<string | null>(null)

  const workItems = useAppStore((s) => s.workItems)
  const workPresence = useAppStore((s) => s.workPresence)
  const workEvents = useAppStore((s) => s.workEvents)
  const session = useAppStore((s) => s.sessions.find((x) => x.id === s.activeSessionId))
  const running = session?.status === 'running'

  const events = buildEvents(session?.messages ?? [], workEvents, !!running)
  const artifacts = (session?.messages ?? []).flatMap((m) =>
    (m.artifacts ?? []).map((a) => a.name),
  )

  const kindForFilter: Record<(typeof FILTERS)[number], EventKind | null> = {
    All: null,
    Messages: 'message',
    Tools: 'tool',
    Work: 'work',
  }
  const visible =
    filter === 'All'
      ? events
      : events.filter((e) => e.kind === kindForFilter[filter])
  const doneCount = events.filter((e) => e.status === 'done').length

  return (
    <div className="flex h-full w-full flex-col">
      <header className="border-b border-border px-4 py-2.5">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Summary</h2>
          <Badge variant="outline" className="text-[10px]">
            {doneCount}/{events.length} done
          </Badge>
        </div>
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'rounded-full px-2 py-0.5 text-[10px] transition-colors',
                filter === f
                  ? 'bg-orange-500 text-black'
                  : 'bg-accent text-muted-foreground hover:text-foreground'
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </header>

      {workItems.length > 0 && (
        <div className="border-b border-border px-4 py-2">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-semibold">Live Work</span>
            <Badge variant="outline" className="text-[10px]">
              {workPresence?.state ?? 'connected'}
            </Badge>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <span className="font-mono">{workItems[0]?.workId}</span>
            <span>·</span>
            <span>{workEvents.length} events</span>
            {workPresence?.activeClients.length ? (
              <span>· {workPresence.activeClients.length} client(s)</span>
            ) : null}
          </div>
        </div>
      )}

      <ScrollArea className="scroll-thin min-h-0 flex-1">
        {visible.length === 0 ? (
          <p className="px-4 py-8 text-center text-[11px] text-muted-foreground">
            {events.length === 0
              ? 'No activity yet — send a message or start work to fill this timeline.'
              : 'Nothing in this class yet.'}
          </p>
        ) : (
        <div className="relative px-4 py-3">
          <div className="absolute bottom-4 left-[28px] top-4 w-px bg-border" />
          <div className="space-y-2.5">
            {visible.map((e) => {
              const isOpen = expanded === e.id
              return (
                <div key={e.id} className="relative pl-8">
                  <div
                    className={cn(
                      'absolute left-[22px] top-1 z-10 h-3 w-3 rounded-full border-2 border-background',
                      e.status === 'active'
                        ? 'bg-orange-500'
                        : 'bg-emerald-500'
                    )}
                  >
                    {e.status === 'active' && (
                      <span className="live-dot absolute inset-0 rounded-full bg-orange-500" />
                    )}
                  </div>
                  <div
                    className={cn(
                      'rounded-md border bg-card px-3 py-2',
                      e.status === 'active'
                        ? 'border-orange-500/40'
                        : 'border-border'
                    )}
                  >
                    <button
                      className="flex w-full items-center gap-2 text-left"
                      onClick={() => setExpanded(isOpen ? null : e.id)}
                    >
                      <span className="text-muted-foreground">{e.icon}</span>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {e.t}
                      </span>
                      <span className="flex-1 truncate text-xs text-foreground">
                        {e.label}
                      </span>
                      {e.detail ? (
                        isOpen ? (
                          <ChevronDown className="h-3 w-3 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-3 w-3 text-muted-foreground" />
                        )
                      ) : null}
                      {e.status === 'done' ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                      ) : (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-orange-500" />
                      )}
                    </button>
                    {isOpen && e.detail && (
                      <div className="mt-2 rounded bg-zinc-950/60 p-2 font-mono text-[10px] leading-relaxed text-muted-foreground shadow-inset-soft">
                        {e.detail.split('\n').map((line, i) => (
                          <div
                            key={i}
                            className={cn(
                              line.startsWith('+') && 'text-emerald-300',
                              line.startsWith('−') && 'text-red-300'
                            )}
                          >
                            {line}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
        )}
        <div className="space-y-2 border-t border-border px-4 py-3">
          <div>
            <div className="text-xs font-medium">Progress</div>
            <p className="text-[10px] text-muted-foreground">
              {events.length === 0
                ? 'Tasks and todos for this session land here as they run.'
                : `${doneCount} of ${events.length} entries complete.`}
            </p>
          </div>
          <div>
            <div className="text-xs font-medium">Artifacts</div>
            {artifacts.length === 0 ? (
              <p className="text-[10px] text-muted-foreground">No artifacts yet.</p>
            ) : (
              <ul className="mt-1 space-y-0.5">
                {artifacts.map((name, i) => (
                  <li key={`${name}-${i}`} className="truncate font-mono text-[10px] text-foreground/80">
                    {name}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}
