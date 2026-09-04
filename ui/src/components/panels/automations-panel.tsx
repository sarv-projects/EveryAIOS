'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Check,
  Clock,
  History,
  LayoutTemplate,
  Pause,
  Play,
  Plus,
  Webhook,
  X,
  Zap,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  schedulerCreate,
  schedulerDelete,
  schedulerEnable,
  schedulerList,
  schedulerPause,
  schedulerResume,
  schedulerRunNow,
  type SchedulerJob,
  triggerLabel,
} from '@/lib/scheduler'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/lib/store'
import { inTauri } from '@/lib/tauri'
import AutomationEditor from './automation-editor'
import TasksRail from './tasks-rail'

const TRIGGER_ICON: Record<
  SchedulerJob['trigger']['type'],
  { icon: typeof Clock; label: string }
> = {
  cron: { icon: Clock, label: 'Schedule' },
  interval: { icon: Clock, label: 'Interval' },
  webhook: { icon: Webhook, label: 'Webhook' },
  event: { icon: Zap, label: 'Event' },
}

const TEMPLATES = [
  { name: 'Daily Brief', desc: 'Concise morning brief on workdays', trigger: '0 8 * * 1-5', runs: 0 },
  { name: 'Weekly Review', desc: 'Progress, risks, and next steps each week', trigger: '0 17 * * 5', runs: 0 },
  { name: 'Project Monitor', desc: 'Track repo changes, issues, and updates', trigger: 'interval 3600', runs: 0 },
  { name: 'CI Fixer', desc: 'Watch for red builds and open a fixing session', trigger: 'on ci_build_fail', runs: 142 },
  { name: 'Weekly Deps', desc: 'Scan dependencies every Monday, patch CVEs', trigger: '0 6 * * 1', runs: 12 },
  { name: 'Security Scan', desc: 'Nightly surface scan of the workspace', trigger: '0 2 * * *', runs: 89 },
  { name: 'Release Notes', desc: 'Draft release notes from merged PRs', trigger: 'on release draft', runs: 23 },
  { name: 'Slack Digest', desc: 'Summarize #support into a morning brief', trigger: '0 8 * * 1-5', runs: 64 },
  { name: 'Standup Bot', desc: 'Collect yesterday/today from git activity', trigger: '0 9 * * 1-5', runs: 118 },
  { name: 'Invoice Batch', desc: 'Fill + sign a folder of PDF invoices', trigger: '0 0 1 * *', runs: 9 },
  { name: 'Log Rotator', desc: 'Archive + trim agent logs over 30 days', trigger: 'interval 86400', runs: 31 },
]

// Mock run history — what a completed/paused/failed run looks like.
const RUN_HISTORY = [
  { id: 'r1', job: 'CI Fixer', ts: 'today 09:12', result: 'success' as const, detail: 'Fixed TS build — 2 commits', cost: '$0.04', dur: '1m 12s' },
  { id: 'r2', job: 'Morning brief', ts: 'today 08:00', result: 'success' as const, detail: '12 sources · 3 highlights', cost: '$0.18', dur: '2m 04s' },
  { id: 'r3', job: 'CI Fixer', ts: 'yesterday 16:41', result: 'failed' as const, detail: 'Timeout after 3 retries', cost: '$0.11', dur: '4m 55s' },
  { id: 'r4', job: 'Weekly deps scan', ts: 'Mon 06:00', result: 'success' as const, detail: '2 CVEs found · 1 patched', cost: '$0.09', dur: '58s' },
  { id: 'r5', job: 'CI Fixer', ts: 'Mon 11:20', result: 'success' as const, detail: 'Fixed flaky e2e test', cost: '$0.06', dur: '2m 31s' },
  { id: 'r6', job: 'Morning brief', ts: 'Sun 08:00', result: 'success' as const, detail: '9 sources · 2 highlights', cost: '$0.15', dur: '1m 48s' },
  { id: 'r7', job: 'Slack triage', ts: 'Fri 17:03', result: 'success' as const, detail: 'Triage: 3 urgent · 8 later', cost: '$0.21', dur: '3m 10s' },
]

export default function AutomationsPanel() {
  const [automations, setAutomations] = useState<SchedulerJob[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [nlInput, setNlInput] = useState('')
  const [tab, setTab] = useState('active')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const notify = useAppStore((s) => s.notify)
  const activeSessionId = useAppStore((s) => s.activeSessionId)

  // H14: live job list from the Rust scheduler (fixtures exist only in
  // browser preview; native errors remain visible to the user).
  useEffect(() => {
    let alive = true
    setLoading(true)
    setLoadError(null)
    void schedulerList()
      .then((s) => {
        if (!alive) return
        setAutomations(s.jobs)
        setLoading(false)
      })
      .catch((error) => {
        if (!alive) return
        const message = error instanceof Error ? error.message : String(error)
        setAutomations([])
        setLoadError(message)
        setLoading(false)
        notify(`Automations unavailable: ${message}`, 'error')
      })
    return () => {
      alive = false
    }
  }, [notify, reload])

  // P11.5.5 — NL automation creation: describe in plain words → config.
  // Deterministic zero-LLM parser for the common patterns (daily/weekly/
  // hourly/on-event); anything else falls through to a sensible default cron
  // with an honest note (full LLM-direct generation is a follow-up seam).
  const createFromNl = async () => {
    const text = nlInput.trim()
    if (!text) return
    const trigger = parseNlTrigger(text)
    if (inTauri() && !activeSessionId) {
      notify('Create or select a work item before adding an automation', 'error')
      return
    }
    const args = {
      id: `j-nl-${Date.now()}`,
      name: text.length > 40 ? `${text.slice(0, 40)}…` : text,
      sessionId: activeSessionId,
      trigger,
      steps: [{ step: 'prompt', text }],
      policy: { suppressOnBattery: true, maxRunsPerHour: 1 },
    }
    try {
      await schedulerCreate(args)
    } catch (error) {
      notify(`Automation was not created: ${error instanceof Error ? error.message : String(error)}`, 'error')
      return
    }
    const newJob: SchedulerJob = {
      ...args,
      enabled: true,
      state: { state: 'idle' },
      checkpoint: 0,
      runs: 0,
      successes: 0,
      failures: 0,
    }
    setAutomations((prev) => [newJob, ...prev])
    setNlInput('')
    notify(`Automation created — ${triggerLabel(trigger)}`)
  }

  // P11.5.5 — template → real job (not a toast): name/trigger/desc map onto
  // an enabled SchedulerJob the Rust scheduler can adopt.
  const useTemplate = async (t: (typeof TEMPLATES)[number]) => {
    const trigger = templateTrigger(t)
    if (inTauri() && !activeSessionId) {
      notify('Create or select a work item before adding an automation', 'error')
      return
    }
    const args = {
      id: `j-tpl-${Date.now()}`,
      name: t.name,
      sessionId: activeSessionId,
      trigger,
      steps: [{ step: 'prompt', text: t.desc }],
      policy: { suppressOnBattery: true, maxRunsPerHour: 2 },
    }
    try {
      await schedulerCreate(args)
    } catch (error) {
      notify(`Automation was not created: ${error instanceof Error ? error.message : String(error)}`, 'error')
      return
    }
    const newJob: SchedulerJob = {
      ...args,
      enabled: true,
      state: { state: 'idle' },
      checkpoint: 0,
      runs: 0,
      successes: 0,
      failures: 0,
    }
    setAutomations((prev) => [newJob, ...prev])
    notify(`Created automation from “${t.name}” template — ${triggerLabel(trigger)}`)
  }

  const reportActionError = (label: string, error: unknown) =>
    notify(`${label} failed: ${error instanceof Error ? error.message : String(error)}`, 'error')

  const toggleEnabled = (id: string) => {
    const next = !automations.find((a) => a.id === id)?.enabled
    void schedulerEnable(id, next)
      .then(() => setAutomations((prev) => prev.map((a) => (a.id === id ? { ...a, enabled: next } : a))))
      .catch((error) => reportActionError('Updating automation', error))
  }

  const runNow = (id: string) => void schedulerRunNow(id).catch((error) => reportActionError('Running automation', error))
  const pauseJob = (id: string) =>
    void schedulerPause(id)
      .then(() => setAutomations((prev) => prev.map((a) => a.id === id ? { ...a, state: { state: 'paused' as const, resumeDeadline: undefined } } : a)))
      .catch((error) => reportActionError('Pausing automation', error))
  const resumeJob = (id: string) =>
    void schedulerResume(id)
      .then(() => setAutomations((prev) => prev.map((a) => a.id === id ? { ...a, state: { state: 'idle' as const } } : a)))
      .catch((error) => reportActionError('Resuming automation', error))
  const removeJob = (id: string) =>
    void schedulerDelete(id)
      .then(() => setAutomations((prev) => prev.filter((a) => a.id !== id)))
      .catch((error) => reportActionError('Deleting automation', error))

  const selected = automations.find((a) => a.id === selectedId) ?? null

  return (
    <div className="flex h-full w-full flex-col">
      <header className="border-b border-border px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-orange-400" />
            <h2 className="text-sm font-semibold text-foreground">Automations</h2>
            <Badge variant="secondary" className="text-[9px]">
              {automations.filter((a) => a.enabled).length} active
            </Badge>
          </div>
          <Button
            size="sm"
            className="h-8 bg-orange-500 text-black hover:bg-orange-400"
            onClick={() => {
              setTab('templates')
              notify('Pick a template or describe an automation below')
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            Create automation
          </Button>
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          Scheduled tasks, webhooks &amp; event triggers that drive headless
          agent sessions
        </p>
        <Tabs value={tab} onValueChange={setTab} className="mt-3">
          <TabsList className="h-7">
            <TabsTrigger value="active" className="text-xs">
              Active
            </TabsTrigger>
            <TabsTrigger value="templates" className="text-xs">
              Templates
            </TabsTrigger>
            <TabsTrigger value="history" className="text-xs">
              History
            </TabsTrigger>
            <TabsTrigger value="tasks" className="text-xs">
              Tasks
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </header>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
            className="space-y-3 p-4"
          >
          {tab === 'tasks' ? (
            <TasksRail />
          ) : tab === 'templates' ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {TEMPLATES.map((t) => (
                <div
                  key={t.name}
                  className="group rounded-lg border border-border bg-card p-4 transition-colors hover:border-orange-500/40 hover-lift"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-orange-500/15 text-orange-400">
                      <LayoutTemplate className="h-4 w-4" />
                    </div>
                    <Badge variant="secondary" className="font-mono text-[9px]">{inTauri() ? 'new' : `${t.runs} preview runs`}</Badge>
                  </div>
                  <h3 className="mt-2.5 text-sm font-medium text-foreground">{t.name}</h3>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{t.desc}</p>
                  <div className="mt-2.5 flex items-center justify-between">
                    <span className="rounded border border-border bg-background/40 px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">
                      {t.trigger}
                    </span>
                    <Button
                      size="sm"
                      className="h-7 gap-1 bg-orange-500 px-2.5 text-[10px] text-white hover:bg-orange-600"
                      onClick={() => useTemplate(t)}
                    >
                      <Plus className="h-3 w-3" />
                      Use template
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : tab === 'history' && !inTauri() ? (
            <div className="rounded-lg border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                <div className="flex items-center gap-1.5">
                  <History className="h-3.5 w-3.5 text-orange-400" />
                  <span className="text-xs font-medium text-foreground">Recent runs</span>
                </div>
                <div className="flex items-center gap-3">
                  {/* P35.1 — the spark-draw consumer: a 7-run success trend
                      sparkline over RUN_HISTORY (oldest → newest, success up). */}
                  <svg
                    viewBox="0 0 64 18"
                    className="spark-draw h-4 w-16 text-emerald-400"
                    aria-label="Success trend over the last 7 runs"
                  >
                    {RUN_HISTORY.slice()
                      .reverse()
                      .map((r, i) => {
                        const x = 4 + i * ((64 - 8) / Math.max(1, RUN_HISTORY.length - 1))
                        const y = r.result === 'success' ? 3 : 14
                        return (
                          <circle key={r.id} cx={x} cy={y} r="2" fill="currentColor" />
                        )
                      })}
                    <polyline
                      points={RUN_HISTORY.slice()
                        .reverse()
                        .map((r, i) => {
                          const x = 4 + i * ((64 - 8) / Math.max(1, RUN_HISTORY.length - 1))
                          return `${x},${r.result === 'success' ? 3 : 14}`
                        })
                        .join(' ')}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1"
                    />
                  </svg>
                  <span className="font-mono text-[10px] text-muted-foreground">last 7 days</span>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full font-mono text-[11px]">
                  <thead className="sticky top-0 bg-zinc-900/90 backdrop-blur">
                    <tr className="text-left text-[9px] uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-1.5 font-normal">When</th>
                      <th className="px-3 py-1.5 font-normal">Job</th>
                      <th className="px-3 py-1.5 font-normal">Result</th>
                      <th className="hidden px-3 py-1.5 font-normal sm:table-cell">Detail</th>
                      <th className="hidden px-3 py-1.5 font-normal md:table-cell">Cost</th>
                      <th className="hidden px-3 py-1.5 font-normal md:table-cell">Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {RUN_HISTORY.map((r) => (
                      <tr key={r.id} className="border-t border-border/50 hover:bg-accent/40">
                        <td className="px-3 py-1.5 text-muted-foreground">{r.ts}</td>
                        <td className="px-3 py-1.5 text-foreground">{r.job}</td>
                        <td className="px-3 py-1.5">
                          {r.result === 'success' ? (
                            <span className="inline-flex items-center gap-1 text-emerald-300">
                              <Check className="h-3 w-3" /> success
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-red-300">
                              <X className="h-3 w-3" /> failed
                            </span>
                          )}
                        </td>
                        <td className="hidden px-3 py-1.5 text-muted-foreground sm:table-cell">{r.detail}</td>
                        <td className="hidden px-3 py-1.5 text-orange-300/80 md:table-cell">{r.cost}</td>
                        <td className="hidden px-3 py-1.5 text-muted-foreground md:table-cell">{r.dur}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : tab === 'history' ? (
            <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-xs text-muted-foreground">
              Run history will appear here after the live scheduler records its first run.
            </div>
          ) : (
          <>
            {loading && (
              <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-xs text-muted-foreground">
                Loading automations…
              </div>
            )}
            {!loading && loadError && (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-4 text-xs text-red-300">
                <span>Automations unavailable: {loadError}</span>
                <Button size="sm" variant="outline" className="h-7 shrink-0 text-[10px]" onClick={() => setReload((value) => value + 1)}>
                  Retry
                </Button>
              </div>
            )}
            {!loading && !loadError && automations.length === 0 && (
              <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-xs text-muted-foreground">
                No automations configured yet.
              </div>
            )}
            {automations.map((a) => {
              const Trigger = TRIGGER_ICON[a.trigger.type]
              const Icon = Trigger.icon
              const paused = a.state.state === 'paused'
              const running = a.state.state === 'running'
              const failed = a.state.state === 'failed'
              return (
                <div
                  key={a.id}
                  onClick={() => setSelectedId(a.id)}
                  className={cn(
                    'group cursor-pointer rounded-lg border bg-card p-4 transition-colors hover:border-orange-500/50',
                    selectedId === a.id
                      ? 'border-orange-500/50'
                      : 'border-border',
                    !a.enabled && 'opacity-70',
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Icon className="h-3.5 w-3.5 shrink-0 text-orange-400" />
                        <h3 className="truncate text-sm font-medium text-foreground">
                          {a.name}
                        </h3>
                        {paused && (
                          <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-[9px] text-amber-300">
                            Paused
                          </Badge>
                        )}
                        {running && (
                          <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-[9px] text-emerald-300">
                            Running
                          </Badge>
                        )}
                        {failed && (
                          <Badge variant="outline" className="border-rose-500/40 bg-rose-500/10 text-[9px] text-rose-300">
                            Retrying
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                        {triggerLabel(a.trigger)}
                      </p>
                      <p className="mt-0.5 text-xs text-foreground/70">
                        {a.steps.length} step(s) · session {a.sessionId}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          runNow(a.id)
                        }}
                        className="flex size-6 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:border-emerald-500/40 hover:text-emerald-300"
                        aria-label="Run now"
                        title="Run now"
                      >
                        <Play className="h-3 w-3" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          paused ? resumeJob(a.id) : pauseJob(a.id)
                        }}
                        className="flex size-6 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:border-amber-500/40 hover:text-amber-300"
                        aria-label={paused ? 'Resume' : 'Pause'}
                        title={paused ? 'Resume' : 'Pause'}
                      >
                        <Pause className="h-3 w-3" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          removeJob(a.id)
                        }}
                        className="flex size-6 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:border-rose-500/40 hover:text-rose-300"
                        aria-label="Delete automation"
                        title="Delete"
                      >
                        <X className="h-3 w-3" />
                      </button>
                      <Switch
                        checked={a.enabled}
                        onClick={(e) => e.stopPropagation()}
                        onCheckedChange={() => toggleEnabled(a.id)}
                        aria-label="Toggle automation"
                      />
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
                    <div className="flex items-center gap-2 font-mono">
                      <span>Runs: {a.runs}</span>
                      <span className="text-emerald-400">
                        <Check className="mr-0.5 inline h-3 w-3" />
                        {a.successes}
                      </span>
                      <span className="text-red-400">
                        <X className="mr-0.5 inline h-3 w-3" />
                        {a.failures}
                      </span>
                    </div>
                    <span className="text-[10px]">
                      Last run:{' '}
                      {a.lastRunAt ? new Date(a.lastRunAt * 1000).toLocaleString() : 'never'}
                    </span>
                  </div>
                </div>
              )
            })}

          {selected && (
            <AutomationEditor
              automation={selected}
              onClose={() => setSelectedId(null)}
              onSaved={() => setReload((x) => x + 1)}
            />
          )}
          </>
          )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Natural-language composer */}
      <footer className="border-t border-border bg-card p-3">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-background/40 px-3 py-2 focus-within:border-orange-500/50">
          <span className="font-mono text-[10px] text-muted-foreground">
            NL
          </span>
          <input
            value={nlInput}
            onChange={(e) => setNlInput(e.target.value)}
            placeholder="Describe an automation in natural language..."
            className="min-w-0 flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          <button
            onClick={createFromNl}
            className="flex size-6 shrink-0 items-center justify-center rounded-md bg-orange-500 text-black hover:bg-orange-400"
            aria-label="Create automation from description"
          >
            <Play className="h-3 w-3" />
          </button>
        </div>
      </footer>
    </div>
  )
}

/** P11.5.5 — deterministic NL → trigger parser (zero-LLM common patterns). */
function parseNlTrigger(text: string): SchedulerJob['trigger'] {
  const t = text.toLowerCase()
  // on-event triggers
  if (t.includes('ci fail') || t.includes('build fail') || t.includes('red build'))
    return { type: 'event', kind: 'ci_build_fail', filter: '' }
  if (t.includes('test regression') || t.includes('test fail'))
    return { type: 'event', kind: 'test_regression', filter: '' }
  if (t.includes('webhook')) return { type: 'webhook', path: '/hook', schema: [] }
  // frequency patterns
  if (t.includes('every hour') || t.includes('hourly')) return { type: 'interval', secs: 3600 }
  if (t.includes('every 15')) return { type: 'interval', secs: 900 }
  if (t.includes('every 30')) return { type: 'interval', secs: 1800 }
  // weekly: "every monday at 9", "weekly on friday"
  const dowMap: [string, number][] = [
    ['sunday', 0], ['monday', 1], ['tuesday', 2], ['wednesday', 3],
    ['thursday', 4], ['friday', 5], ['saturday', 6],
  ]
  for (const [name, num] of dowMap) {
    if (t.includes(name)) {
      const h = extractHour(t) ?? 9
      return { type: 'cron', expr: `0 ${h} * * ${num}` }
    }
  }
  if (t.includes('weekly')) return { type: 'cron', expr: '0 9 * * 1' }
  if (t.includes('monthly') || t.includes('first of the month')) return { type: 'cron', expr: '0 8 1 * *' }
  // daily: "every morning", "daily at 8pm", "every day"
  if (t.includes('morning')) return { type: 'cron', expr: `0 ${extractHour(t) ?? 8} * * *` }
  if (t.includes('evening') || t.includes('night')) return { type: 'cron', expr: `0 ${extractHour(t) ?? 18} * * *` }
  if (t.includes('daily') || t.includes('every day')) return { type: 'cron', expr: `0 ${extractHour(t) ?? 9} * * *` }
  const h = extractHour(t)
  if (h !== null) return { type: 'cron', expr: `0 ${h} * * *` }
  // fallback: daily 9am + honest note (LLM-direct generation is follow-up)
  return { type: 'cron', expr: '0 9 * * *' }
}

function extractHour(text: string): number | null {
  // "at 9", "at 9am", "at 17:30", "at 8pm"
  const m = text.match(/at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/)
  if (!m) return null
  let h = parseInt(m[1], 10)
  const mer = m[3]
  if (mer === 'pm' && h < 12) h += 12
  if (mer === 'am' && h === 12) h = 0
  return h
}

/** P11.5.5 — template trigger strings → SchedulerTrigger. */
function templateTrigger(t: (typeof TEMPLATES)[number]): SchedulerJob['trigger'] {
  const raw = t.trigger
  if (raw.startsWith('interval')) {
    return { type: 'interval', secs: parseInt(raw.split(' ')[1] ?? '3600', 10) }
  }
  if (raw.startsWith('on ')) {
    const kind = raw.slice(3).replace(/\s+/g, '_')
    return { type: 'event', kind: kind === 'ci_build_fail' ? 'ci_build_fail' : 'repo_change', filter: '' }
  }
  return { type: 'cron', expr: raw }
}
