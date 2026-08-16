'use client'

import { useState } from 'react'
import {
  ShieldCheck,
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Eye,
  Square,
  ChevronRight,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

type Audit = {
  t: string
  actor: 'agent' | 'user' | 'system'
  action: string
  target: string
  status: 'ok' | 'warn' | 'err'
}

const ROWS: Audit[] = [
  { t: '09:15:02.142', actor: 'agent', action: 'file.open', target: 'Q3-Financials.xlsx', status: 'ok' },
  { t: '09:15:04.881', actor: 'agent', action: 'cell.update', target: 'B7:B12', status: 'ok' },
  { t: '09:15:08.221', actor: 'agent', action: 'chart.regen', target: 'Sheet1!chart1', status: 'ok' },
  { t: '09:15:12.019', actor: 'agent', action: 'browser.search', target: 'google.com', status: 'ok' },
  { t: '09:15:12.943', actor: 'system', action: 'guard.allow', target: 'browser.egress', status: 'ok' },
  { t: '09:15:14.118', actor: 'user', action: 'note.add', target: '§3.2', status: 'ok' },
  { t: '09:15:18.732', actor: 'agent', action: 'doc.write', target: 'exec-summary.docx', status: 'ok' },
  { t: '09:15:20.002', actor: 'system', action: 'guard.warn', target: 'shell.exec', status: 'warn' },
  { t: '09:15:22.841', actor: 'agent', action: 'shell.run', target: 'npm test', status: 'ok' },
  { t: '09:15:25.503', actor: 'agent', action: 'export.pdf', target: 'report.pdf', status: 'ok' },
]

const ACTOR_COLOR = {
  agent: 'bg-orange-500/15 text-orange-300',
  user: 'bg-sky-500/15 text-sky-300',
  system: 'bg-zinc-500/20 text-muted-foreground',
}

export default function AuditView() {
  const [playing, setPlaying] = useState(true)
  const [pos, setPos] = useState(72)
  const [watching, setWatching] = useState(true)

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
          {ROWS.length} rows · 23.4 KB
        </span>
      </header>

      <div className="flex min-h-0 flex-1">
        <ScrollArea className="scroll-thin min-w-0 flex-1">
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
              {ROWS.map((r, i) => (
                <tr
                  key={i}
                  className={cn(
                    'border-t border-border/50 hover:bg-accent/40',
                    i === 7 && 'bg-yellow-500/5'
                  )}
                >
                  <td className="px-3 py-1.5 text-muted-foreground">{r.t}</td>
                  <td className="px-3 py-1.5">
                    <span
                      className={cn(
                        'rounded px-1.5 py-0.5 text-[9px] uppercase',
                        ACTOR_COLOR[r.actor]
                      )}
                    >
                      {r.actor}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-foreground">{r.action}</td>
                  <td className="px-3 py-1.5 text-foreground/70">{r.target}</td>
                  <td className="px-3 py-1.5">
                    {r.status === 'ok' && (
                      <span className="inline-flex items-center gap-1 text-emerald-300">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> ok
                      </span>
                    )}
                    {r.status === 'warn' && (
                      <span className="inline-flex items-center gap-1 text-yellow-300">
                        <span className="h-1.5 w-1.5 rounded-full bg-yellow-500" /> warn
                      </span>
                    )}
                    {r.status === 'err' && (
                      <span className="inline-flex items-center gap-1 text-red-300">
                        <span className="h-1.5 w-1.5 rounded-full bg-red-500" /> err
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollArea>

        <aside className="w-56 shrink-0 border-l border-border bg-card p-3">
          <div className="mb-3 text-xs font-medium">Replay</div>
          <div className="mb-3 flex items-center justify-center gap-2">
            <button className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground">
              <SkipBack className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setPlaying(!playing)}
              className="rounded-full bg-orange-500 p-2 text-black hover:bg-orange-400"
            >
              {playing ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4" />
              )}
            </button>
            <button className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground">
              <SkipForward className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="mb-1 flex justify-between font-mono text-[9px] text-muted-foreground">
            <span>09:15:02</span>
            <span className="text-orange-300">▸ {ROWS[7].t}</span>
            <span>09:15:25</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={pos}
            onChange={(e) => setPos(Number(e.target.value))}
            className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-zinc-700 accent-orange-500"
            style={{
              background: `linear-gradient(to right, hsl(25 95% 53%) ${pos}%, hsl(240 6% 24%) ${pos}%)`,
            }}
          />

          <div className="mt-4 space-y-1 font-mono text-[10px] text-muted-foreground">
            <div className="flex items-center gap-1">
              <ChevronRight className="h-3 w-3" />
              <span>Frame 7 / 10</span>
            </div>
            <div className="flex items-center gap-1">
              <ChevronRight className="h-3 w-3" />
              <span>Speed: 1.0×</span>
            </div>
            <div className="flex items-center gap-1">
              <ChevronRight className="h-3 w-3" />
              <span>Buffered: 100%</span>
            </div>
          </div>
        </aside>
      </div>

      <footer className="flex items-center justify-between border-t border-border bg-zinc-900/60 px-4 py-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWatching(!watching)}
            className={cn(
              'flex items-center gap-1.5 rounded-md border px-3 py-1 text-xs font-medium transition-colors',
              watching
                ? 'border-orange-500 bg-orange-500/15 text-orange-300'
                : 'border-border bg-zinc-900 text-muted-foreground hover:text-foreground'
            )}
          >
            <Eye className="h-3 w-3" />
            {watching ? 'Watching live' : 'Watch live'}
          </button>
          <button className="flex items-center gap-1.5 rounded-md border border-border bg-zinc-900 px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground">
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
