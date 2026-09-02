'use client'

// J5 — inspect, by source, which context blocks (persona / user_document /
// memory / tool_result / blueprint) were injected into the prompt each turn.
// The deterministic answer to "why did it say that?" — no guessing.

import { useEffect, useState } from 'react'
import { RefreshCw, ScanSearch } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  TRAJECTORY_SOURCES,
  groupBySource,
  trajectorySessions,
  trajectorySnapshot,
  type ContextInjection,
  type TrajectorySource,
} from '@/lib/trajectory'

const SOURCE_TONE: Record<TrajectorySource, string> = {
  persona: 'text-sky-300 border-sky-500/30 bg-sky-500/10',
  user_document: 'text-amber-300 border-amber-500/30 bg-amber-500/10',
  memory: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10',
  tool_result: 'text-violet-300 border-violet-500/30 bg-violet-500/10',
  blueprint: 'text-orange-300 border-orange-500/30 bg-orange-500/10',
  other: 'text-zinc-300 border-zinc-500/30 bg-zinc-500/10',
}

const SOURCE_LABEL: Record<TrajectorySource, string> = {
  persona: 'Persona',
  user_document: 'User docs',
  memory: 'Memory',
  tool_result: 'Tool results',
  blueprint: 'Blueprint',
  other: 'Other',
}

function Row({ r }: { r: ContextInjection }) {
  return (
    <li className="flex items-center gap-2 rounded-md border border-border/60 bg-background/30 px-2.5 py-1.5">
      <span className="w-8 shrink-0 font-mono text-[10px] text-muted-foreground/60">
        #{r.seq}
      </span>
      <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground/80">
        {r.ref_id}
      </span>
      <span className="shrink-0 font-mono text-[10px] text-muted-foreground/60">
        {r.tokens != null ? `${(r.tokens / 1000).toFixed(1)}K` : '—'}
      </span>
      <span className="hidden shrink-0 font-mono text-[9px] text-muted-foreground/40 sm:inline">
        {new Date(r.ts_ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </span>
    </li>
  )
}

export default function TrajectoryView() {
  const [sessions, setSessions] = useState<string[]>([])
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [records, setRecords] = useState<ContextInjection[]>([])
  const [loading, setLoading] = useState(false)

  const load = async (sid?: string) => {
    setLoading(true)
    try {
      const list = await trajectorySessions()
      setSessions(list)
      const target = sid ?? list[0]
      if (target) {
        setSessionId(target)
        setRecords(await trajectorySnapshot(target))
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const grouped = groupBySource(records)
  const totalTokens = records.reduce((s, r) => s + (r.tokens ?? 0), 0)

  return (
    <div className="flex h-full w-full flex-col bg-card">
      <header className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <ScanSearch className="h-4 w-4 text-orange-400" />
          <span className="text-xs font-semibold text-foreground">Trajectory</span>
          <Badge variant="outline" className="text-[9px] text-muted-foreground">
            context injection · by source
          </Badge>
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6"
          onClick={() => load(sessionId ?? undefined)}
        >
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
        </Button>
      </header>

      {/* Session selector */}
      <div className="flex items-center gap-1 border-b border-border bg-zinc-900/40 px-3 py-1.5">
        <span className="mr-1 font-mono text-[9px] uppercase tracking-wider text-muted-foreground/60">
          session
        </span>
        {sessions.length === 0 ? (
          <span className="font-mono text-[10px] text-muted-foreground/50">
            no logged sessions yet
          </span>
        ) : (
          sessions.map((s) => (
            <button
              key={s}
              onClick={() => load(s)}
              className={cn(
                'rounded-md border px-2 py-0.5 font-mono text-[10px] transition-colors',
                s === sessionId
                  ? 'border-orange-500/50 bg-orange-500/10 text-orange-300'
                  : 'border-transparent text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              {s}
            </button>
          ))
        )}
      </div>

      {/* Summary strip */}
      <div className="flex items-center gap-3 border-b border-border px-3 py-1.5 font-mono text-[10px] text-muted-foreground">
        <span>{records.length} injection{records.length === 1 ? '' : 's'}</span>
        <span>·</span>
        <span>{(totalTokens / 1000).toFixed(1)}K tokens injected</span>
      </div>

      {/* Source-grouped list */}
      {/* P45.6 — content-visibility: auto skips offscreen timeline rows. */}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 scroll-thin [content-visibility:auto] [contain-intrinsic-size:auto_56px]">
        {TRAJECTORY_SOURCES.map((src) => {
          const items = grouped.get(src) ?? []
          if (items.length === 0) return null
          return (
            <section key={src}>
              <div className="mb-1 flex items-center gap-2 px-1">
                <span
                  className={cn(
                    'rounded border px-1.5 py-0.5 font-mono text-[9px]',
                    SOURCE_TONE[src],
                  )}
                >
                  {SOURCE_LABEL[src]}
                </span>
                <span className="font-mono text-[9px] text-muted-foreground/50">
                  {items.length} ·{' '}
                  {(items.reduce((s, r) => s + (r.tokens ?? 0), 0) / 1000).toFixed(1)}K
                </span>
              </div>
              <ul className="space-y-1">
                {items.map((r) => (
                  <Row key={r.seq} r={r} />
                ))}
              </ul>
            </section>
          )
        })}

        {records.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <ScanSearch className="h-6 w-6 text-muted-foreground/40" />
            <p className="text-[11px] text-muted-foreground">
              {loading
                ? 'Loading trajectory…'
                : 'No context-injection log for this session yet.'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
