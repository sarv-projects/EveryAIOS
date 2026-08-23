'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ShieldCheck,
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Eye,
  Square,
  ChevronRight,
  Search,
  Camera,
  Loader2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useDebouncedValue } from '@/lib/ux'
import { cn } from '@/lib/utils'
import {
  replaySessions,
  replayTimeline,
  replayScreenshot,
  watchEvents,
  agentStop,
  type Segment,
  type ReplayEvent,
  type Timeline,
} from '@/lib/audit'

const ACTOR_COLOR: Record<string, string> = {
  agent: 'bg-orange-500/15 text-orange-300',
  user: 'bg-sky-500/15 text-sky-300',
  system: 'bg-zinc-500/20 text-muted-foreground',
}

const STATUS_DOT: Record<string, string> = {
  ok: 'bg-emerald-500',
  warn: 'bg-yellow-500',
  err: 'bg-red-500',
}

/** Classify a replay event into an audit row (actor/action/status). */
function classify(ev: ReplayEvent) {
  const kind = ev.kind || 'event'
  const data = ev.data ?? {}
  const isGuard = kind.startsWith('guard') || data.guard === true
  const isUser = kind.startsWith('user') || data.user === true
  const actor = isGuard ? 'system' : isUser ? 'user' : 'agent'
  const action = kind.replace(/_/g, '.')
  const target =
    (data.target as string) ||
    (data.url as string) ||
    (data.path as string) ||
    (data.tool as string) ||
    '-'
  const status: 'ok' | 'warn' | 'err' =
    data.status === 'warn' || data.warn === true
      ? 'warn'
      : data.status === 'err' || data.error === true
        ? 'err'
        : 'ok'
  return { actor, action, target, status, t: fmtTs(ev.ts_ms) }
}

function fmtTs(ms: number): string {
  if (!ms) return '--:--:--.---'
  const d = new Date(ms)
  const p = (n: number, w = 2) => String(n).padStart(w, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`
}

export default function AuditView() {
  // P3.3 — searchable replay sessions.
  const [query, setQuery] = useState('')
  const [sessions, setSessions] = useState<Segment[]>([])
  const [activeDoc, setActiveDoc] = useState<string | null>(null)

  // P3.1 — scrubber + screenshot strip.
  const [timeline, setTimeline] = useState<Timeline | null>(null)
  const [pos, setPos] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [screenshot, setScreenshot] = useState<string | null>(null)
  const [shotLoading, setShotLoading] = useState(false)
  const [loadingTl, setLoadingTl] = useState(false)

  // P3.1 — watch mode (live ingest poll).
  const [watching, setWatching] = useState(true)
  const lastSeq = useRef(0)

  // Load session list.
  const loadSessions = useCallback(async (q: string) => {
    try {
      const s = await replaySessions(q)
      setSessions(s)
      if (!activeDoc && s.length > 0) {
        setActiveDoc(s[0].document_id)
      }
    } catch {
      setSessions([])
    }
  }, [activeDoc])

  useEffect(() => {
    loadSessions(query)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // P11.4 — debounced search: typing pauses 400ms before a query fires, so
  // the Rust replay index isn't hit per keystroke.
  const debouncedQuery = useDebouncedValue(query, 400)
  useEffect(() => {
    if (query === debouncedQuery) return
    loadSessions(debouncedQuery)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery])

  // Load timeline when a session is selected.
  useEffect(() => {
    if (!activeDoc) return
    setLoadingTl(true)
    replayTimeline(activeDoc)
      .then((tl) => {
        setTimeline(tl)
        setPos(0)
        lastSeq.current = tl.events.length
      })
      .catch(() => setTimeline(null))
      .finally(() => setLoadingTl(false))
  }, [activeDoc])

  // P3.1 — screenshot strip: fetch the screenshot for the current step.
  const currentStep =
    timeline && timeline.screenshot_steps.length > 0
      ? timeline.screenshot_steps[Math.min(pos, timeline.screenshot_steps.length - 1)]
      : null

  useEffect(() => {
    if (!activeDoc || currentStep == null) {
      setScreenshot(null)
      return
    }
    setShotLoading(true)
    replayScreenshot(activeDoc, currentStep)
      .then(setScreenshot)
      .catch(() => setScreenshot(null))
      .finally(() => setShotLoading(false))
  }, [activeDoc, currentStep])

  // P3.1 — watch mode: poll watch_events for new events since lastSeq.
  useEffect(() => {
    if (!watching || !activeDoc) return
    const id = setInterval(async () => {
      try {
        const evs = await watchEvents(activeDoc, lastSeq.current)
        if (evs.length > 0 && timeline) {
          setTimeline((prev) =>
            prev
              ? { ...prev, events: [...prev.events, ...evs] }
              : prev,
          )
          lastSeq.current += evs.length
        }
      } catch {
        // offline / preview — no-op.
      }
    }, 3000)
    return () => clearInterval(id)
  }, [watching, activeDoc, timeline])

  const events = timeline?.events ?? []
  const maxPos = Math.max(events.length - 1, 0)
  const currentEv = events[Math.min(pos, maxPos)]
  const rows = events.map(classify)

  return (
    <div className="flex h-full w-full flex-col">
      <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-orange-400" />
          <h2 className="text-sm font-semibold text-foreground">Audit &amp; Replay</h2>
          <Badge variant="secondary" className="text-[10px]">
            append-only · NDJSON
          </Badge>
        </div>
        <span className="font-mono text-[10px] text-muted-foreground">
          {events.length} events · {timeline?.segment?.size_bytes ?? 0} bytes
        </span>
      </header>

      {/* P3.3 — searchable replay sessions */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
        <Search className="h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') loadSessions(query)
          }}
          placeholder="Search sessions (doc id, tab id)…"
          className="h-7 max-w-xs font-mono text-xs"
          data-debounced
        />
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => loadSessions(query)}>
          Search
        </Button>
        <div className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground">
          <span className="font-mono">{sessions.length} sessions</span>
        </div>
      </div>

      {/* Session chips */}
      {sessions.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto border-b border-border px-4 py-1.5">
          {sessions.map((s) => (
            <button
              key={s.document_id}
              onClick={() => setActiveDoc(s.document_id)}
              className={cn(
                'shrink-0 rounded-md border px-2 py-0.5 font-mono text-[10px] transition-colors',
                activeDoc === s.document_id
                  ? 'border-orange-500 bg-orange-500/15 text-orange-300'
                  : 'border-border text-muted-foreground hover:text-foreground',
              )}
            >
              {s.document_id.slice(0, 12)} · {s.event_count} ev
            </button>
          ))}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* Event table */}
        <ScrollArea className="scroll-thin min-w-0 flex-1">
          {loadingTl ? (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading timeline…
            </div>
          ) : rows.length === 0 ? (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              No events in this session.
            </div>
          ) : (
            <table className="w-full font-mono text-[11px]">
              <thead className="sticky top-0 bg-zinc-900/90 backdrop-blur">
                <tr className="text-left text-[9px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-1.5 font-normal">Timestamp</th>
                  <th className="px-3 py-1.5 font-normal">Actor</th>
                  <th className="px-3 py-1.5 font-normal">Action</th>
                  <th className="px-3 py-1.5 font-normal">Target</th>
                  <th className="px-3 py-1.5 font-normal">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr
                    key={i}
                    className={cn(
                      'border-t border-border/50 hover:bg-accent/40',
                      i === pos && 'bg-orange-500/5',
                    )}
                  >
                    <td className="px-3 py-1.5 text-muted-foreground">{r.t}</td>
                    <td className="px-3 py-1.5">
                      <span
                        className={cn(
                          'rounded px-1.5 py-0.5 text-[9px] uppercase',
                          ACTOR_COLOR[r.actor] ?? ACTOR_COLOR.system,
                        )}
                      >
                        {r.actor}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-foreground">{r.action}</td>
                    <td className="px-3 py-1.5 text-foreground/70">{r.target}</td>
                    <td className="px-3 py-1.5">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1',
                          r.status === 'ok' && 'text-emerald-300',
                          r.status === 'warn' && 'text-yellow-300',
                          r.status === 'err' && 'text-red-300',
                        )}
                      >
                        <span className={cn('h-1.5 w-1.5 rounded-full', STATUS_DOT[r.status])} />
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </ScrollArea>

        {/* P3.1 — replay scrubber + screenshot strip */}
        <aside className="w-64 shrink-0 border-l border-border bg-card p-3">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-medium">Replay</span>
            <span className="font-mono text-[9px] text-muted-foreground">
              {pos + 1}/{events.length || 0}
            </span>
          </div>
          <div className="mb-3 flex items-center justify-center gap-2">
            <button
              onClick={() => setPos((p) => Math.max(0, p - 1))}
              className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <SkipBack className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setPlaying(!playing)}
              className="rounded-full bg-orange-500 p-2 text-black hover:bg-orange-400"
            >
              {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </button>
            <button
              onClick={() => setPos((p) => Math.min(maxPos, p + 1))}
              className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <SkipForward className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Scrubber slider */}
          <input
            type="range"
            min={0}
            max={maxPos}
            value={Math.min(pos, maxPos)}
            onChange={(e) => setPos(Number(e.target.value))}
            className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-zinc-700 accent-orange-500"
            style={{
              background: `linear-gradient(to right, hsl(25 95% 53%) ${(pos / Math.max(maxPos, 1)) * 100}%, hsl(240 6% 24%) ${(pos / Math.max(maxPos, 1)) * 100}%)`,
            }}
          />
          <div className="mb-3 mt-1 flex justify-between font-mono text-[9px] text-muted-foreground">
            <span>{events[0] ? fmtTs(events[0].ts_ms) : '--'}</span>
            <span className="text-orange-300">▸ {currentEv ? fmtTs(currentEv.ts_ms) : '--'}</span>
            <span>{events[maxPos] ? fmtTs(events[maxPos].ts_ms) : '--'}</span>
          </div>

          {/* P3.1 — per-step screenshot strip */}
          <div className="mb-2 flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground">
            <Camera className="h-3 w-3" /> Screenshot
          </div>
          <div className="mb-3 flex aspect-video items-center justify-center overflow-hidden rounded-md border border-border bg-zinc-900">
            {shotLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : screenshot ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={screenshot} alt={`step ${currentStep}`} className="h-full w-full object-contain" />
            ) : (
              <span className="text-[10px] text-muted-foreground">
                {currentStep != null ? 'no screenshot' : 'no steps'}
              </span>
            )}
          </div>

          {/* Screenshot step thumbnails */}
          {timeline && timeline.screenshot_steps.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {timeline.screenshot_steps.map((step) => (
                <button
                  key={step}
                  onClick={() => setPos(Math.min(step - 1, maxPos))}
                  className={cn(
                    'rounded border px-1.5 py-0.5 font-mono text-[9px] transition-colors',
                    currentStep === step
                      ? 'border-orange-500 bg-orange-500/15 text-orange-300'
                      : 'border-border text-muted-foreground hover:text-foreground',
                  )}
                >
                  {step}
                </button>
              ))}
            </div>
          )}

          <div className="mt-4 space-y-1 font-mono text-[10px] text-muted-foreground">
            <div className="flex items-center gap-1">
              <ChevronRight className="h-3 w-3" />
              <span>Speed: 1.0×</span>
            </div>
            <div className="flex items-center gap-1">
              <ChevronRight className="h-3 w-3" />
              <span>Buffered: {events.length > 0 ? '100%' : '—'}</span>
            </div>
          </div>
        </aside>
      </div>

      <footer className="flex items-center justify-between border-t border-border bg-zinc-900/60 px-4 py-2">
        <div className="flex items-center gap-2">
          {/* P3.1 — watch mode (live ingest poll) */}
          <button
            onClick={() => setWatching(!watching)}
            className={cn(
              'flex items-center gap-1.5 rounded-md border px-3 py-1 text-xs font-medium transition-colors',
              watching
                ? 'border-orange-500 bg-orange-500/15 text-orange-300'
                : 'border-border bg-zinc-900 text-muted-foreground hover:text-foreground',
            )}
          >
            <Eye className="h-3 w-3" />
            {watching ? 'Watching live' : 'Watch live'}
          </button>
          {/* P3.2 — Stop button that kills the agent loop (agent_stop). */}
          <button
            onClick={() => {
              if (activeDoc) agentStop(activeDoc)
            }}
            className="flex items-center gap-1.5 rounded-md border border-border bg-zinc-900 px-3 py-1 text-xs font-medium text-muted-foreground hover:text-red-300 hover:border-red-500/30"
          >
            <Square className="h-3 w-3" />
            Stop
          </button>
        </div>
        <span className="font-mono text-[10px] text-muted-foreground">
          Tamper-evident · SHA-256 chained
        </span>
      </footer>
    </div>
  )
}
