'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { inTauri } from '@/lib/tauri'
import { AGENTS, AGENT_MAP, CAPABILITY_LABELS } from '@/lib/agents'
import { sessionTotals, type SessionTotal } from '@/lib/spend'

const SESSIONS = [
  { title: 'Q3 report refresh', agent: 'analyst', tokens: '184K', cost: '$1.84', status: 'action-required', dur: '8m' },
  { title: 'Competitor pricing crawl', agent: 'browser', tokens: '88K', cost: '$0.92', status: 'running', dur: '4m' },
  { title: 'Refactor api/users.ts', agent: 'coder', tokens: '51K', cost: '$0.51', status: 'paused', dur: '2m' },
  { title: 'Invoice batch PDF', agent: 'analyst', tokens: '240K', cost: '$2.41', status: 'completed', dur: '14m' },
  { title: 'Standup digest', agent: 'analyst', tokens: '12K', cost: '$0.04', status: 'scheduled', dur: '—' },
  { title: 'Bug triage #4421', agent: 'coder', tokens: '67K', cost: '$0.62', status: 'completed', dur: '5m' },
  { title: 'Sales email draft', agent: 'analyst', tokens: '34K', cost: '$0.18', status: 'completed', dur: '3m' },
  { title: 'SOC2 doc review', agent: 'coder', tokens: '142K', cost: '$1.31', status: 'failed', dur: '6m' },
  { title: 'Design feedback', agent: 'analyst', tokens: '22K', cost: '$0.09', status: 'completed', dur: '2m' },
  { title: 'DNS migration', agent: 'coder', tokens: '48K', cost: '$0.38', status: 'completed', dur: '4m' },
]

const MODELS = [
  { name: 'Claude Sonnet 4.5', usage: 38, costPer1k: '$0.003' },
  { name: 'GPT-4o', usage: 26, costPer1k: '$0.005' },
  { name: 'Gemini 2.5 Pro', usage: 14, costPer1k: '$0.0013' },
  { name: 'DeepSeek V3', usage: 12, costPer1k: '$0.0004' },
  { name: 'Ollama (local)', usage: 6, costPer1k: '$0.000' },
]

const STATUS_TONE: Record<string, string> = {
  running: 'bg-emerald-500/15 text-emerald-300',
  'action-required': 'bg-orange-500/15 text-orange-300',
  completed: 'bg-zinc-500/15 text-zinc-300',
  paused: 'bg-yellow-500/15 text-yellow-300',
  failed: 'bg-red-500/15 text-red-300',
  scheduled: 'bg-sky-500/15 text-sky-300',
}

export function ChartCard({
  title,
  subtitle,
  right,
  children,
}: {
  title: string
  subtitle?: string
  right?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-xs font-medium text-foreground">{title}</div>
          {subtitle && (
            <div className="font-mono text-[10px] text-muted-foreground">
              {subtitle}
            </div>
          )}
        </div>
        {right}
      </div>
      {children}
    </section>
  )
}

export function SessionsTable() {
  const [live, setLive] = useState<SessionTotal[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    sessionTotals()
      .then((rows) => {
        if (mounted) {
          setLive(rows)
          setError(null)
          setLoading(false)
        }
      })
      .catch((cause) => {
        if (mounted) {
          setError(cause instanceof Error ? cause.message : 'Usage ledger is unavailable')
          setLive(null)
          setLoading(false)
        }
      })
    return () => {
      mounted = false
    }
  }, [])

  const rows = live ?? []
  const isLive = live !== null
  const showPreview = !inTauri() && live === null && error === null

  return (
    <ChartCard
      title="Per-session cost breakdown"
      subtitle={isLive ? 'live ledger · cost desc' : showPreview ? 'preview fixtures' : 'no live ledger data'}
      right={
        isLive ? (
          <Badge className="bg-emerald-500/15 text-[9px] text-emerald-300">live</Badge>
        ) : showPreview ? (
          <Badge className="bg-orange-500/15 text-[9px] text-orange-300">preview</Badge>
        ) : (
          <Badge variant="outline" className="text-[9px] text-muted-foreground">unavailable</Badge>
        )
      }
    >
      <Table>
        <TableHeader>
          <TableRow className="border-border hover:bg-transparent">
            <TableHead className="h-7 text-[10px] uppercase text-muted-foreground">Session</TableHead>
            <TableHead className="h-7 text-[10px] uppercase text-muted-foreground">Agent</TableHead>
            <TableHead className="h-7 text-right text-[10px] uppercase text-muted-foreground">Tokens</TableHead>
            <TableHead className="h-7 text-right text-[10px] uppercase text-muted-foreground">Cost</TableHead>
            <TableHead className="h-7 text-[10px] uppercase text-muted-foreground">Status</TableHead>
            <TableHead className="h-7 text-right text-[10px] uppercase text-muted-foreground">Dur</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
                <TableRow><TableCell colSpan={6} className="py-8 text-center text-xs text-muted-foreground">Loading usage ledger…</TableCell></TableRow>
              ) : isLive
            ? rows.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="py-8 text-center text-xs text-muted-foreground">No session usage recorded yet.</TableCell></TableRow>
              ) : rows.map((s) => (
                <TableRow key={s.session} className="border-border/50">
                  <TableCell className="py-1.5 font-mono text-xs text-foreground">{s.session}</TableCell>
                  <TableCell className="py-1.5 font-mono text-[11px] text-muted-foreground">—</TableCell>
                  <TableCell className="py-1.5 text-right font-mono text-[11px] text-foreground/70">
                    {(s.tokensIn + s.tokensOut).toLocaleString()}
                  </TableCell>
                  <TableCell className="py-1.5 text-right font-mono text-[11px] text-orange-300">
                    ${s.cost.toFixed(2)}
                  </TableCell>
                  <TableCell className="py-1.5">
                    <Badge className={cn('text-[9px]', STATUS_TONE.completed)}>ledger</Badge>
                  </TableCell>
                  <TableCell className="py-1.5 text-right font-mono text-[11px] text-muted-foreground">—</TableCell>
                </TableRow>
              ))
            : showPreview ? SESSIONS.map((s, i) => (
                <TableRow key={i} className="border-border/50">
                  <TableCell className="py-1.5 text-xs text-foreground">{s.title}</TableCell>
                  <TableCell className="py-1.5 font-mono text-[11px] text-muted-foreground">{s.agent}</TableCell>
                  <TableCell className="py-1.5 text-right font-mono text-[11px] text-foreground/70">{s.tokens}</TableCell>
                  <TableCell className="py-1.5 text-right font-mono text-[11px] text-orange-300">{s.cost}</TableCell>
                  <TableCell className="py-1.5">
                    <Badge className={cn('text-[9px]', STATUS_TONE[s.status])}>{s.status}</Badge>
                  </TableCell>
                  <TableCell className="py-1.5 text-right font-mono text-[11px] text-muted-foreground">{s.dur}</TableCell>
                </TableRow>
              )) : (
                <TableRow><TableCell colSpan={6} className="py-8 text-center text-xs text-muted-foreground">Session usage is unavailable. {error ?? ''}</TableCell></TableRow>
              )}
        </TableBody>
      </Table>
    </ChartCard>
  )
}

export function ModelLeaderboard() {
  if (inTauri()) return null
  return (
    <ChartCard title="Model leaderboard" subtitle="preview fixtures · by usage share">
      <ul className="space-y-1.5">
        {MODELS.map((m, i) => (
          <li
            key={m.name}
            className="flex items-center gap-3 rounded-md border border-border/50 bg-background/30 px-3 py-1.5"
          >
            <span className="w-5 font-mono text-xs text-muted-foreground">#{i + 1}</span>
            <span className="flex-1 truncate text-xs text-foreground">{m.name}</span>
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-zinc-800">
              <div className="h-full rounded-full bg-orange-500" style={{ width: `${m.usage}%` }} />
            </div>
            <span className="w-10 text-right font-mono text-[10px] text-muted-foreground">{m.usage}%</span>
            <span className="w-16 text-right font-mono text-[11px] text-orange-300">{m.costPer1k}</span>
          </li>
        ))}
      </ul>
    </ChartCard>
  )
}

const AGENT_STATS = [
  { id: 'claude-code', sessions: 6, tokens: '412K', cost: '$3.78', successRate: 95, avgLatency: '1.8s' },
  { id: 'everyaios-native', sessions: 4, tokens: '324K', cost: '$2.64', successRate: 100, avgLatency: '2.1s' },
  { id: 'codex-cli', sessions: 3, tokens: '196K', cost: '$1.41', successRate: 92, avgLatency: '1.5s' },
  { id: 'grok-build', sessions: 2, tokens: '158K', cost: '$0.92', successRate: 100, avgLatency: '1.2s' },
  { id: 'gemini-cli', sessions: 1, tokens: '88K', cost: '$0.45', successRate: 100, avgLatency: '2.8s' },
  { id: 'aider', sessions: 1, tokens: '67K', cost: '$0.38', successRate: 80, avgLatency: '2.4s' },
]

export function AgentBreakdown() {
  if (inTauri()) return null
  const totalCost = 8.58
  return (
    <ChartCard title="Agent cost breakdown" subtitle="per runtime · last 30 days">
      <ul className="space-y-1.5">
        {AGENT_STATS.map((s) => {
          const a = AGENT_MAP[s.id]
          if (!a) return null
          const pct = (parseFloat(s.cost.replace('$', '')) / totalCost) * 100
          return (
            <li
              key={s.id}
              className="flex items-center gap-2 rounded-md border border-border/50 bg-background/30 px-3 py-2"
            >
              <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded text-[9px] font-bold', a.accent)}>
                {a.mark}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-foreground">{a.name}</span>
                  <Badge variant="secondary" className="bg-background/60 text-[8px] font-normal text-muted-foreground">
                    {s.sessions} sessions
                  </Badge>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <div className="h-1 w-20 overflow-hidden rounded-full bg-zinc-800">
                    <div className="h-full rounded-full bg-orange-500" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="font-mono text-[10px] text-muted-foreground">{pct.toFixed(0)}%</span>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="font-mono text-[11px] text-orange-300">{s.cost}</div>
                <div className="font-mono text-[9px] text-muted-foreground">{s.tokens} tok · {s.avgLatency}</div>
                <div className={cn(
                  'mt-0.5 inline-block rounded px-1 font-mono text-[8px]',
                  s.successRate >= 95
                    ? 'bg-emerald-500/15 text-emerald-300'
                    : s.successRate >= 85
                      ? 'bg-yellow-500/15 text-yellow-300'
                      : 'bg-red-500/15 text-red-300',
                )}>
                  {s.successRate}% ok
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </ChartCard>
  )
}
