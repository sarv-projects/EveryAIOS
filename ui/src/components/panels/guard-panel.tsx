'use client'

import { useEffect, useState } from 'react'
import {
  AlertTriangle, Check, Globe, KeyRound, OctagonX, ShieldCheck, Vault, X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/lib/store'
import { inTauri } from '@/lib/tauri'
import { staggerStyle } from '@/lib/stagger'
import {
  guardActivity,
  guardEstop,
  guardPermissionsMatrix,
  guardPolicy,
  guardTickets,
  type GuardPolicy,
  type GuardTicket,
  type MatrixCell,
  type RecentAction,
} from '@/lib/guard'

const TRUST_LEVELS = ['Read', 'Write', 'Execute', 'Autonomous']
const TRUST_SCORE = 75
const CURRENT_LEVEL = 1 // Write

// P11.5.7 — the capability×scope grid labels (rows/columns of the live
// matrix; the DECISIONS come from `guard_permissions_matrix`, not here).
const CAPABILITIES = ['read', 'write', 'execute', 'network', 'browser']
const SCOPES = ['workspace', 'home', 'shell', 'external', 'browser']

type Cell = 'allow' | 'ask' | 'block' | 'off'

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

// P11.5.7 — preview-mode fallback rows (the live bridge replaces these in the
// Tauri shell; kept so the panel stays explorable without the backend).
const demoActivityRows: RecentAction[] = [
  { action: 'ToolCompleted', target: 'fs_write_file · src/api.ts', scope: 'session demo-1', time: '09:15:02', status: 'ok' },
  { action: 'ToolCompleted', target: 'browser.read · gmail.com', scope: 'session demo-1', time: '09:14:50', status: 'ok' },
  { action: 'ToolStarted', target: 'shell.exec · npm run build', scope: 'session demo-1', time: '09:15:08', status: 'pending' },
  { action: 'PermissionGranted', target: 'write src/api.ts', scope: 'session demo-1', time: '09:15:04', status: 'ok' },
  { action: 'ToolCompleted', target: 'provider/stream · openai', scope: 'session demo-1', time: '09:14:45', status: 'ok' },
]

const ACTION_TONE = {
  ok: { icon: Check, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  warn: { icon: AlertTriangle, color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
  err: { icon: X, color: 'text-red-400', bg: 'bg-red-500/10' },
  pending: { icon: AlertTriangle, color: 'text-orange-400', bg: 'bg-orange-500/10' },
} as const

export default function GuardPanel() {
  const [tickets, setTickets] = useState<GuardTicket[]>([])
  const [policy, setPolicy] = useState<GuardPolicy | null>(null)
  // P11.5.7 — live recent-actions log + permissions matrix (demo fallback
  // in plain-browser preview so the panel stays explorable).
  const [activity, setActivity] = useState<RecentAction[]>([])
  const [matrix, setMatrix] = useState<MatrixCell[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const notify = useAppStore((s) => s.notify)

  // Live bridge (P7.5/J21 + P11.5.7): poll pending tickets + policy + the
  // activity log + permissions matrix while in the shell.
  useEffect(() => {
    let alive = true
    const refresh = async () => {
      try {
        const [t, p, a, m] = await Promise.all([
          guardTickets(),
          guardPolicy(),
          guardActivity(12),
          guardPermissionsMatrix(),
        ])
        if (!alive) return
        setTickets(t)
        setPolicy(p)
        setActivity(a)
        setMatrix(m)
        setLoadError(null)
      } catch (error) {
        if (!alive) return
        // Do not retain a previous live projection after a failed refresh:
        // stale approvals/activity are as misleading as seeded demo rows.
        setTickets([])
        setPolicy(null)
        setActivity([])
        setMatrix([])
        setLoadError(error instanceof Error ? error.message : 'Guard is unavailable')
      }
    }
    void refresh()
    const timer = setInterval(refresh, 3000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [reload])

  // F1 — the approval decision happens in the dedicated guard window, never
  // in this renderer (which also displays browser/generative-UI/plugin
  // content). The panel surfaces the tickets and opens the window; the
  // human decides there, and the guard window's own poll clears the ticket.
  const respond = async (ticketId: string, _action: 'approve' | 'reject') => {
    setBusy(ticketId)
    try {
      const { openGuardWindow } = await import('@/lib/guard')
      await openGuardWindow()
      notify('Guard-2: approval opened in the dedicated window')
    } catch {
      notify('Guard-2: could not open the approval window', 'error')
    }
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
          {/* P5.24 — honest ceiling: approvals render as an in-app webview
              card bound to a one-time nonce; there is no OS-native dialog
              in v1 (that is a follow-up, not a silent claim). */}
          <Badge variant="outline" className="text-[9px] text-muted-foreground" title="v1 approvals are in-app webview cards bound to a one-time nonce — no OS-native dialog yet">
            v1: webview + nonce
          </Badge>
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
                {tickets.map((t, ti) => (
                  // P35.2 — entrance stagger on the guard ticket rows.
                  <li
                    key={t.ticketId}
                    className="enter-stagger rounded-md border border-border bg-background/40 p-2.5"
                    style={staggerStyle(ti)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-[10px] font-medium text-foreground">
                            {t.operation}
                          </span>
                          <span className="rounded border border-red-500/30 bg-red-500/10 px-1 text-[8px] uppercase text-red-400">
                            {t.riskTier ?? t.risk}
                          </span>
                        </div>
                        <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
                          {t.paths.join(' · ')}
                        </div>
                        {t.decision?.networkDestinations && t.decision.networkDestinations.length > 0 && (
                          <div className="mt-1 font-mono text-[10px] text-amber-400/90">
                            data leaving device: {t.decision.networkDestinations.join(' · ')}
                          </div>
                        )}
                        {t.decision?.goal && (
                          <div className="mt-1 text-[10px] text-muted-foreground/80">
                            {t.decision.goal}
                          </div>
                        )}
                        {/* Web-action confirm banner (P7.5) — sensitive
                            browser mutations need an explicit Confirm & run;
                            Block rejects the same nonce-bound card. */}
                        {t.decision?.webAction && (
                          <div className="mt-2 rounded-md border border-red-500/40 bg-red-500/10 p-2">
                            <div className="flex items-center gap-1.5">
                              <Globe className="h-3 w-3 text-red-400" />
                              <span className="text-[10px] font-semibold uppercase tracking-wide text-red-400">
                                Web action · {t.decision.webAction.replace(/_/g, ' ')}
                              </span>
                            </div>
                            <p className="mt-1 text-[10px] text-muted-foreground">
                              Confirm before running this browser mutation — it
                              can submit forms, change account settings, or
                              trigger payments.
                            </p>
                            <div className="mt-1.5 flex gap-1.5">
                              <Button
                                size="sm"
                                disabled={busy === t.ticketId}
                                className="h-6 gap-1 border-red-500/50 bg-red-500/20 px-2 text-[10px] text-red-300 hover:bg-red-500/30"
                                onClick={() => respond(t.ticketId, 'approve')}
                              >
                                <Globe className="h-3 w-3" />
                                Confirm &amp; run
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={busy === t.ticketId}
                                className="h-6 gap-1 border-red-500/40 px-2 text-[10px] text-red-400 hover:bg-red-500/10"
                                onClick={() => respond(t.ticketId, 'reject')}
                              >
                                <OctagonX className="h-3 w-3" />
                                Block
                              </Button>
                            </div>
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

          {loadError && inTauri() && (
            <div className="flex items-center justify-between gap-3 rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2 text-[11px] text-red-300">
              <span>Guard data is unavailable. {loadError}</span>
              <Button size="sm" variant="outline" className="h-6 shrink-0 text-[10px]" onClick={() => setReload((value) => value + 1)}>
                Retry
              </Button>
            </div>
          )}

          {/* Trust meter: the score is a preview fixture until a live trust
              projection is exposed by the GuardService. Never show it in the
              desktop shell as if it were user data. */}
          {inTauri() ? (
            <section className="rounded-lg border border-dashed border-border bg-card p-4">
              <div className="text-xs font-medium text-foreground">Trust Level</div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Trust score is unavailable until the live GuardService publishes a scored projection.
              </p>
            </section>
          ) : (
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
                      'score-roll flex-1 rounded-md border px-3 py-2 text-center transition-colors',
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
          )}

          {/* Recent actions */}
          <section className="rounded-lg border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-medium text-foreground">Recent Actions</span>
              <span className="font-mono text-[10px] text-muted-foreground">last 24h</span>
              {!inTauri() && activity.length === 0 && (
                <Badge variant="outline" className="text-[9px] text-muted-foreground/60">
                  preview
                </Badge>
              )}
            </div>
            {activity.length === 0 && inTauri() ? (
              <div className="py-6 text-center text-xs text-muted-foreground">No Guard actions recorded yet.</div>
            ) : (
            <ul className="space-y-1.5">
              {(activity.length > 0 ? activity : demoActivityRows).map((a, i) => {
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
                          onClick={() => notify('Guard-2: allowed “npm run deploy” once')}
                        >
                          <Check className="h-3 w-3" />
                          Allow
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 border-red-500/40 px-2 text-[10px] text-red-400 hover:bg-red-500/10"
                          onClick={() => notify('Guard-2: denied — logged to audit')}
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
            )}
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
                      {CAPABILITIES.map((cap, c) => {
                        const cell = matrix.find(
                          (m) => m.capability === cap && m.scope === SCOPES[r],
                        )?.decision ?? 'off'
                        return (
                          <td key={c}>
                            <div className={cn('flex h-7 items-center justify-center rounded font-mono text-[9px] uppercase', CELL_TONE[cell])}>
                              {CELL_LABEL[cell]}
                            </div>
                          </td>
                        )
                      })}
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
              title="Key-ring"
              stats={inTauri() ? '—' : '7 keys'}
              sub={inTauri() ? 'Live key count is unavailable here' : 'preview fixture'}
              cta="Open settings"
              onCta={() => notify(inTauri() ? 'Open Settings → API keys to inspect the live vault' : 'Preview key-ring — no real credentials are present')}
            />
            <VaultCard
              icon={<Vault className="h-4 w-4 text-orange-400" />}
              title="Session Vault"
              stats={inTauri() ? '—' : '12 sessions'}
              sub={inTauri() ? 'Live session count is shown in the work list' : 'preview fixture'}
              cta="View sessions"
              onCta={() => notify(inTauri() ? 'Select a work item to view live encrypted sessions' : 'Preview session vault — no real sessions are present')}
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
  icon, title, stats, sub, cta, onCta,
}: {
  icon: React.ReactNode
  title: string
  stats: string
  sub: string
  cta: string
  onCta?: () => void
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-xs font-medium text-foreground">{title}</span>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 border-orange-500/40 text-[10px] text-orange-300 hover:bg-orange-500/10"
          onClick={onCta}
        >
          {cta}
        </Button>
      </div>
      <div className="mt-2 font-mono text-lg font-semibold text-foreground">{stats}</div>
      <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">{sub}</div>
    </div>
  )
}
