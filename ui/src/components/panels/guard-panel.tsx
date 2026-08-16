'use client'

import { useEffect, useState } from 'react'
import {
  AlertTriangle, Check, KeyRound, OctagonX, ShieldCheck, Vault, X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  guardEstop,
  guardPolicy,
  guardRespond,
  guardTickets,
  type GuardPolicy,
  type GuardTicket,
} from '@/lib/guard'

const TRUST_LEVELS = ['Read', 'Write', 'Execute', 'Autonomous']
const TRUST_SCORE = 75
const CURRENT_LEVEL = 1 // Write

const ACTIONS: {
  action: string
  target: string
  scope: string
  time: string
  status: 'ok' | 'warn' | 'err' | 'pending'
}[] = [
  { action: 'Read', target: 'src/utils.ts', scope: 'workspace read', time: '09:15:02', status: 'ok' },
  { action: 'Write', target: 'src/api/handler.ts', scope: 'workspace write', time: '09:15:04', status: 'ok' },
  { action: 'Browser', target: 'gmail.com (read-only)', scope: 'browser (owned tabs)', time: '09:14:50', status: 'ok' },
  { action: 'Execute', target: 'npm run deploy', scope: 'shell (restricted)', time: '09:15:08', status: 'pending' },
  { action: 'External API', target: 'api.openai.com (gpt-4o)', scope: 'external api (with approval)', time: '09:14:45', status: 'ok' },
  { action: 'Blocked', target: 'rm -rf /', scope: 'Guard-1 regex', time: '09:15:09', status: 'err' },
  { action: 'Network', target: 'untrusted-host.io', scope: 'egress (restricted)', time: '09:14:32', status: 'warn' },
]

const CAPABILITIES = ['Read', 'Write', 'Execute', 'Network', 'Browser']
const SCOPES = ['Workspace', 'Home dir', 'Shell', 'External API', 'Browser']

// Cell states: 'allow' | 'ask' | 'block' | 'off'
type Cell = 'allow' | 'ask' | 'block' | 'off'

const MATRIX: Cell[][] = [
  ['allow', 'ask', 'allow', 'ask', 'allow'],
  ['allow', 'block', 'ask', 'ask', 'ask'],
  ['allow', 'block', 'allow', 'ask', 'block'],
  ['ask', 'block', 'block', 'ask', 'ask'],
  ['allow', 'ask', 'allow', 'ask', 'allow'],
]

const CELL_TONE: Record<Cell, string> = {
  allow: 'bg-emerald-500/70 text-emerald-50',
  ask: 'bg-orange-500/70 text-orange-50',
  block: 'bg-red-500/70 text-red-50',
  off: 'bg-zinc-700/40 text-zinc-400',
}

const CELL_LABEL: Record<Cell, string> = {
  allow: 'allow',
  ask: 'ask',
  block: 'block',
  off: 'off',
}

const ACTION_TONE = {
  ok: { icon: Check, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  warn: { icon: AlertTriangle, color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
  err: { icon: X, color: 'text-red-400', bg: 'bg-red-500/10' },
  pending: { icon: AlertTriangle, color: 'text-orange-400', bg: 'bg-orange-500/10' },
} as const

export default function GuardPanel() {
  const [tickets, setTickets] = useState<GuardTicket[]>([])
  const [policy, setPolicy] = useState<GuardPolicy | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  // Live bridge (P7.5/J21): poll pending tickets + policy while in the shell;
  // in preview the bridge returns demo data so the card stays explorable.
  useEffect(() => {
    let alive = true
    const refresh = async () => {
      try {
        const [t, p] = await Promise.all([guardTickets(), guardPolicy()])
        if (!alive) return
        setTickets(t)
        setPolicy(p)
      } catch {
        /* shell not ready */
      }
    }
    void refresh()
    const timer = setInterval(refresh, 3000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [])

  const respond = async (ticketId: string, action: 'approve' | 'reject') => {
    setBusy(ticketId)
    await guardRespond(ticketId, action)
    setTickets((ts) => ts.filter((t) => t.ticketId !== ticketId))
    setBusy(null)
  }

  return (
    <div className="flex h-full w-full flex-col">
      <header className="border-b border-border px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-orange-400" />
            <h2 className="text-sm font-semibold text-foreground">Guard</h2>
            <Badge className="bg-orange-500/15 text-[9px] text-orange-300">
              Trust Ladder
            </Badge>
          </div>
          <span className="font-mono text-[10px] text-muted-foreground">
            Guard-1 regex · Guard-2 cleanup
          </span>
        </div>
      </header>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-4 p-4">
          {/* Live pending approvals (Guard-2) */}
          {tickets.length > 0 && (
            <section className="rounded-lg border border-orange-500/40 bg-orange-500/5 p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium text-foreground">
                  Pending approvals
                </span>
                <Badge className="bg-orange-500/20 px-1.5 text-[9px] text-orange-300">
                  {tickets.length} live
                </Badge>
              </div>
              <ul className="space-y-2">
                {tickets.map((t) => (
                  <li
                    key={t.ticketId}
                    className="rounded-md border border-border bg-background/40 p-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-[10px] font-medium text-foreground">
                            {t.operation}
                          </span>
                          <span className="rounded border border-red-500/30 bg-red-500/10 px-1 text-[8px] uppercase text-red-400">
                            {t.risk}
                          </span>
                        </div>
                        <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
                          {t.paths.join(' · ')}
                        </div>
                        {t.decision?.goal && (
                          <div className="mt-1 text-[10px] text-muted-foreground/80">
                            {t.decision.goal}
                          </div>
                        )}
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button
                          size="sm"
                          disabled={busy === t.ticketId}
                          className="h-6 gap-1 bg-emerald-500 px-2 text-[10px] text-black hover:bg-emerald-400"
                          onClick={() => respond(t.ticketId, 'approve')}
                        >
                          <Check className="h-3 w-3" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy === t.ticketId}
                          className="h-6 gap-1 border-red-500/40 px-2 text-[10px] text-red-400 hover:bg-red-500/10"
                          onClick={() => respond(t.ticketId, 'reject')}
                        >
                          <X className="h-3 w-3" />
                          Reject
                        </Button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Estop + profile strip */}
          {policy && (
            <section className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-2.5">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  profile
                </span>
                <Badge className="bg-background/60 text-[9px] text-muted-foreground">
                  {policy.profile}
                </Badge>
                <span className="font-mono text-[10px] text-muted-foreground/60">
                  auto ≥ {Math.round(policy.minConfidenceForAuto * 100)}%
                </span>
              </div>
              <Button
                size="sm"
                variant={policy.estopPulled ? 'destructive' : 'outline'}
                className={cn(
                  'h-6 gap-1 px-2 text-[10px]',
                  policy.estopPulled
                    ? 'bg-red-600 text-white hover:bg-red-500'
                    : 'border-red-500/40 text-red-400 hover:bg-red-500/10',
                )}
                onClick={() => {
                  void guardEstop(!policy.estopPulled).then(() =>
                    setPolicy((p) => (p ? { ...p, estopPulled: !p.estopPulled } : p)),
                  )
                }}
              >
                <OctagonX className="h-3 w-3" />
                {policy.estopPulled ? 'Estop is pulled — reset' : 'Pull estop'}
              </Button>
            </section>
          )}

          {/* Trust meter */}
          <section className="rounded-lg border border-border bg-card p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-foreground">Trust Level</span>
              <span className="font-mono text-sm font-semibold text-orange-300">{TRUST_SCORE}/100</span>
            </div>
            <div className="flex gap-1">
              {TRUST_LEVELS.map((lvl, i) => {
                const reached = i <= CURRENT_LEVEL
                const isCurrent = i === CURRENT_LEVEL
                return (
                  <div
                    key={lvl}
                    className={cn(
                      'flex-1 rounded-md border px-3 py-2 text-center transition-colors',
                      isCurrent
                        ? 'border-orange-500 bg-orange-500/15'
                        : reached
                          ? 'border-emerald-500/40 bg-emerald-500/10'
                          : 'border-border bg-background/40',
                    )}
                  >
                    <div
                      className={cn(
                        'text-xs font-medium',
                        isCurrent ? 'text-orange-300' : reached ? 'text-emerald-300' : 'text-muted-foreground',
                      )}
                    >
                      {lvl}
                    </div>
                    {isCurrent && (
                      <div className="mt-0.5 text-[9px] uppercase tracking-wide text-orange-400">current</div>
                    )}
                  </div>
                )
              })}
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-orange-500 to-orange-400"
                style={{ width: `${TRUST_SCORE}%` }}
              />
            </div>
          </section>

          {/* Recent actions */}
          <section className="rounded-lg border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-medium text-foreground">Recent Actions</span>
              <span className="font-mono text-[10px] text-muted-foreground">last 24h</span>
            </div>
            <ul className="space-y-1.5">
              {ACTIONS.map((a, i) => {
                const tone = ACTION_TONE[a.status]
                const Icon = tone.icon
                return (
                  <li
                    key={i}
                    className="flex items-center gap-2 rounded-md border border-border/50 bg-background/30 px-2 py-1.5"
                  >
                    <span
                      className={cn(
                        'flex size-5 shrink-0 items-center justify-center rounded',
                        tone.bg,
                      )}
                    >
                      <Icon className={cn('h-3 w-3', tone.color)} />
                    </span>
                    <span className="w-20 shrink-0 font-mono text-[10px] text-muted-foreground">{a.time}</span>
                    <span className="w-20 shrink-0 text-xs font-medium text-foreground">{a.action}</span>
                    <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground/70">
                      {a.target}
                    </span>
                    <span className="hidden shrink-0 rounded border border-border bg-background/40 px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground sm:inline">
                      {a.scope}
                    </span>
                    {a.status === 'pending' && (
                      <div className="flex shrink-0 gap-1">
                        <Button
                          size="sm"
                          className="h-6 bg-emerald-500 px-2 text-[10px] text-black hover:bg-emerald-400"
                        >
                          <Check className="h-3 w-3" />
                          Allow
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 border-red-500/40 px-2 text-[10px] text-red-400 hover:bg-red-500/10"
                        >
                          <X className="h-3 w-3" />
                          Deny
                        </Button>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>

          {/* Permissions matrix */}
          <section className="rounded-lg border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-medium text-foreground">
                Permissions Matrix
              </span>
              <Legend />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-separate border-spacing-1 text-center text-[10px]">
                <thead>
                  <tr>
                    <th className="w-20" />
                    {CAPABILITIES.map((c) => (
                      <th key={c} className="px-1 py-1 font-medium text-muted-foreground">{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {SCOPES.map((scope, r) => (
                    <tr key={scope}>
                      <td className="px-1 py-1 text-right font-medium text-muted-foreground">{scope}</td>
                      {MATRIX[r].map((cell, c) => (
                        <td key={c}>
                          <div className={cn('flex h-7 items-center justify-center rounded font-mono text-[9px] uppercase', CELL_TONE[cell])}>
                            {CELL_LABEL[cell]}
                          </div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Vault status */}
          <section className="grid gap-3 sm:grid-cols-2">
            <VaultCard
              icon={<KeyRound className="h-4 w-4 text-orange-400" />}
              title="Key-ring" stats="7 keys" sub="last rotated 2d ago" cta="Rotate now"
            />
            <VaultCard
              icon={<Vault className="h-4 w-4 text-orange-400" />}
              title="Session Vault" stats="12 sessions" sub="SQLCipher · encrypted" cta="View sessions"
            />
          </section>
        </div>
      </div>
    </div>
  )
}

function Legend() {
  const items: { c: Cell; label: string }[] = [
    { c: 'allow', label: 'allowed' },
    { c: 'ask', label: 'ask' },
    { c: 'block', label: 'blocked' },
    { c: 'off', label: 'off' },
  ]
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((it) => (
        <span key={it.c} className="inline-flex items-center gap-1 text-[9px] text-muted-foreground">
          <span className={cn('inline-block size-2 rounded-sm', CELL_TONE[it.c].split(' ')[0])} />
          {it.label}
        </span>
      ))}
    </div>
  )
}

function VaultCard({
  icon, title, stats, sub, cta,
}: {
  icon: React.ReactNode
  title: string
  stats: string
  sub: string
  cta: string
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-xs font-medium text-foreground">{title}</span>
        </div>
        <Button size="sm" variant="outline" className="h-7 border-orange-500/40 text-[10px] text-orange-300 hover:bg-orange-500/10">
          {cta}
        </Button>
      </div>
      <div className="mt-2 font-mono text-lg font-semibold text-foreground">{stats}</div>
      <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">{sub}</div>
    </div>
  )
}
