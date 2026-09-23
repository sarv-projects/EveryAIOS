'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Check,
  Clock,
  Copy,
  Download,
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
  schedulerDuplicate,
  schedulerDoctor,
  schedulerEnable,
  schedulerExport,
  schedulerIncidentAck,
  schedulerIncidents,
  schedulerList,
  schedulerNotepadAppend,
  schedulerPause,
  schedulerResume,
  schedulerRunNow,
  schedulerRuns,
  type AutomationRun,
  type SchedulerIncident,
  type SchedulerJob,
  triggerLabel,
} from '@/lib/scheduler'
import { Stethoscope, NotebookPen, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { isRetiredBinding } from '@/lib/acp'
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
  { name: 'CI Fixer', desc: 'Watch for red builds and open a fixing chat', trigger: 'on ci_build_fail', runs: 142 },
  { name: 'Weekly Deps', desc: 'Scan dependencies every Monday, patch CVEs', trigger: '0 6 * * 1', runs: 12 },
  { name: 'Security Scan', desc: 'Nightly surface scan of the workspace', trigger: '0 2 * * *', runs: 89 },
  { name: 'Release Notes', desc: 'Draft release notes from merged PRs', trigger: 'on release draft', runs: 23 },
  { name: 'Slack Digest', desc: 'Summarize #support into a morning brief', trigger: '0 8 * * 1-5', runs: 64 },
  { name: 'Standup Bot', desc: 'Collect yesterday/today from git activity', trigger: '0 9 * * 1-5', runs: 118 },
  { name: 'Invoice Batch', desc: 'Fill + sign a folder of PDF invoices', trigger: '0 0 1 * *', runs: 9 },
  { name: 'Log Rotator', desc: 'Archive + trim agent logs over 30 days', trigger: 'interval 86400', runs: 31 },
]

/**
 * P71.9e — the §11 "bound agent" column: the session's pin → the user's
 * default, with retired built-in spellings resolving to nothing (`ADR-0005`).
 * Returns `null` when no agent is bound — shown as "none bound", never a
 * substitute engine.
 */
function sessionAgentLabel(sessionId: string): string | null {
  const st = useAppStore.getState()
  const isAgentBinding = (id?: string): id is string =>
    typeof id === 'string' && id.trim() !== '' && !isRetiredBinding(id.trim())
  const pin = st.sessionChiefs[sessionId]
  const userDefault = st.userDefaultChief
  if (isAgentBinding(pin)) return pin
  if (isAgentBinding(userDefault)) return userDefault
  return null
}

/**
 * P71.3d + P71.9e — the scheduler is a trigger plane and keeps **no run
 * history** itself (the ExecutionLedger owns that, `I3`; `AUTOMATION.md` §9).
 * The History tab reads that ledger back (`scheduler_runs`) and shows each
 * run's own phase — running · completed · failed · **waiting for approval** —
 * never a fabricated success.
 *
 * P71.8c — each firing's Work lives in an **automation** Session with no Chat
 * (`ADR-0006`); this panel is the surface that owns it. A run is opened by
 * creating a Chat from its Session (the §7 affordance) — the 1:1 rule then
 * holds again for that Session. Nothing here fabricates a hidden Chat per run.
 */
function LiveRuns() {
  const [runs, setRuns] = useState<AutomationRun[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let alive = true
    schedulerRuns('')
      .then((out) => {
        if (alive) {
          setRuns(out.runs)
          setError(null)
        }
      })
      .catch((cause) => alive && setError(cause instanceof Error ? cause.message : 'run history unavailable'))
    return () => {
      alive = false
    }
  }, [reload])

  /** P71.9f — ADR-0006 §7: opening a run gives its Session a Chat **on demand**.
   * This list stays the surface that owns headless work; nothing here ever
   * fabricates a hidden Chat per firing. */
  const openRun = (run: AutomationRun) => {
    useAppStore.getState().openAutomationRun({
      id: run.id,
      sessionId: run.sessionId,
      objective: run.objective,
    })
  }

  const phaseStyle = (run: AutomationRun): string => {
    if (run.waitingApproval) return 'border-warning/40 bg-warning/10 text-warning'
    switch (run.phase) {
      case 'running':
        return 'border-sky-500/40 bg-sky-500/10 text-sky-300'
      case 'completed':
        return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
      case 'failed':
      case 'cancelled':
        return 'border-rose-500/40 bg-rose-500/10 text-rose-300'
      default:
        return 'border-border bg-muted/40 text-muted-foreground'
    }
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-xs text-red-300">
          <span>{error}</span>
          <Button size="sm" variant="outline" className="h-7 shrink-0 text-[10px]" onClick={() => setReload((v) => v + 1)}>
            Retry
          </Button>
        </div>
      )}
      {!error && runs === null && (
        <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-xs text-muted-foreground">
          Loading run history…
        </div>
      )}
      {!error && runs !== null && runs.length === 0 && (
        <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-xs text-muted-foreground">
          No runs recorded yet — fire an automation (Run now or its trigger) and
          its Work appears here with the ledger's own status.
        </div>
      )}
      {(runs ?? []).map((run) => (
        <div key={run.id} className="rounded-lg border border-border bg-card px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate text-xs font-medium text-foreground">{run.objective}</span>
                <Badge variant="outline" className={cn('shrink-0 text-[9px]', phaseStyle(run))}>
                  {run.waitingApproval ? 'waiting for approval' : run.phase}
                </Badge>
              </div>
              <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                {run.id} · automation · {new Date(run.createdAtMs).toLocaleString()}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-7 shrink-0 gap-1 text-[10px]"
              title="Open this run as a chat — it continues the run's own session"
              onClick={() => openRun(run)}
            >
              <Play className="h-3 w-3" />
              Open
            </Button>
          </div>
        </div>
      ))}
      {runs !== null && runs.length > 0 && (
        <p className="text-[10px] text-muted-foreground">
          Statuses are the ExecutionLedger's own phases — never a fabricated
          success. Awaiting-approval runs surface the §11 state; full step
          detail stays behind the Work/Event surfaces.
        </p>
      )}
    </div>
  )
}

/** P51.32a/e/f — job notepad + incidents + doctor (live commands, honest states). */
function SchedulerHealth({ jobs }: { jobs: SchedulerJob[] }) {
  const [incidents, setIncidents] = useState<SchedulerIncident[] | null>(null)
  const [doctor, setDoctor] = useState<Record<string, unknown> | null>(null)
  const [notepadJob, setNotepadJob] = useState('')
  const [notepadLine, setNotepadLine] = useState('')
  const [notepadMsg, setNotepadMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let alive = true
    schedulerIncidents()
      .then((i) => alive && setIncidents(i))
      .catch((cause) => alive && setError(cause instanceof Error ? cause.message : 'incidents unavailable'))
    return () => {
      alive = false
    }
  }, [reload])

  const runDoctor = async () => {
    try {
      setDoctor(await schedulerDoctor())
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'doctor unavailable')
    }
  }

  const ack = async (id: string) => {
    try {
      if (await schedulerIncidentAck(id)) setReload((v) => v + 1)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ack failed')
    }
  }

  const appendNotepad = async () => {
    const line = notepadLine.trim()
    if (!notepadJob || !line) return
    try {
      if (await schedulerNotepadAppend(notepadJob, line)) {
        setNotepadLine('')
        setNotepadMsg('notepad line saved — carries into the next run')
        setError(null)
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'notepad append failed')
    }
  }

  const unacked = (incidents ?? []).filter((i) => !i.acked)

  return (
    <div className="space-y-3">
      {error && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-xs text-red-300">
          <span>{error}</span>
          <Button size="sm" variant="outline" className="h-7 shrink-0 text-[10px]" onClick={() => setError(null)}>
            Dismiss
          </Button>
        </div>
      )}

      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <div className="flex items-center gap-1.5">
            <Stethoscope className="h-3.5 w-3.5 text-brand" />
            <span className="text-xs font-medium">Cron health (doctor)</span>
          </div>
          <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => void runDoctor()}>
            Run doctor
          </Button>
        </div>
        <div className="px-4 py-3">
          {doctor === null ? (
            <p className="text-[11px] text-muted-foreground">
              Missed runs, dead leases, and queue depth — read-only diagnostic.
            </p>
          ) : Object.keys(doctor).length === 0 ? (
            <p className="text-[11px] text-muted-foreground">No issues reported.</p>
          ) : (
            <div className="space-y-1">
              {Object.entries(doctor).map(([k, v]) => (
                <div key={k} className="flex items-center justify-between gap-2 font-mono text-[11px]">
                  <span className="text-muted-foreground">{k}</span>
                  <span className="text-foreground">{JSON.stringify(v)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-brand" />
            <span className="text-xs font-medium">Incidents</span>
            {unacked.length > 0 && (
              <Badge variant="outline" className="border-red-500/40 bg-red-500/10 text-[9px] text-red-300">
                {unacked.length} unacked
              </Badge>
            )}
          </div>
          <Button size="sm" variant="ghost" className="h-7 text-[10px]" onClick={() => setReload((v) => v + 1)}>
            Refresh
          </Button>
        </div>
        <div className="space-y-1.5 p-3">
          {incidents === null ? (
            <p className="text-[11px] text-muted-foreground">Loading incidents…</p>
          ) : incidents.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">No incidents recorded — acknowledgements are explicit, never auto-cleared.</p>
          ) : (
            incidents.map((i) => (
              <div key={i.id} className="rounded-md border border-border/70 px-3 py-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-xs font-medium text-foreground">
                      {i.title}
                    </div>
                    <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
                      {i.jobId ? `job ${i.jobId}` : ''}{i.at ? ` · ${String(i.at)}` : ''}{i.acked ? ' · acked' : ' · unacked'}
                    </div>
                  </div>
                  {!i.acked && (
                    <Button size="sm" variant="outline" className="h-6 shrink-0 px-2 text-[10px]" onClick={() => void ack(i.id)}>
                      Ack
                    </Button>
                  )}
                </div>
                {typeof i.detail === 'string' && i.detail && (
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{i.detail}</p>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center gap-1.5 border-b border-border px-4 py-2.5">
          <NotebookPen className="h-3.5 w-3.5 text-brand" />
          <span className="text-xs font-medium">Job notepad</span>
        </div>
        <div className="space-y-2 p-3">
          <select
            value={notepadJob}
            onChange={(e) => setNotepadJob(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
          >
            <option value="">Choose a job…</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>{j.name}</option>
            ))}
          </select>
          <div className="flex gap-2">
            <input
              value={notepadLine}
              onChange={(e) => setNotepadLine(e.target.value)}
              placeholder="One durable line for the next run…"
              className="h-8 flex-1 rounded-md border border-border bg-background px-2 text-xs"
              onKeyDown={(e) => {
                if (e.key === 'Enter') void appendNotepad()
              }}
            />
            <Button size="sm" className="h-8 shrink-0 text-[10px]" onClick={() => void appendNotepad()}>
              Append
            </Button>
          </div>
          {notepadMsg && <p className="text-[10px] text-emerald-500">{notepadMsg}</p>}
          <p className="text-[10px] text-muted-foreground">
            The notepad rides the continuity bundle — context survives between runs.
          </p>
        </div>
      </div>
    </div>
  )
}

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
      paused: false,
      recentFires: [],
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
      paused: false,
      recentFires: [],
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
      .then(() => setAutomations((prev) => prev.map((a) => a.id === id ? { ...a, paused: true } : a)))
      .catch((error) => reportActionError('Pausing automation', error))
  const resumeJob = (id: string) =>
    void schedulerResume(id)
      .then(() => setAutomations((prev) => prev.map((a) => a.id === id ? { ...a, paused: false } : a)))
      .catch((error) => reportActionError('Resuming automation', error))
  const removeJob = (id: string) =>
    void schedulerDelete(id)
      .then(() => setAutomations((prev) => prev.filter((a) => a.id !== id)))
      .catch((error) => reportActionError('Deleting automation', error))
  // P71.9e — §11 duplicate: same definition, new id, starts disabled (never
  // silently armed). The list reloads so the copy appears with its real state.
  const duplicateJob = (id: string) =>
    void schedulerDuplicate(id)
      .then(() => setReload((v) => v + 1))
      .catch((error) => reportActionError('Duplicating automation', error))
  // P71.9e — §11 export: download the `*.automation.json` definition (no
  // secrets — vault credentials never ride the file).
  const exportJob = async (id: string) => {
    try {
      const body = await schedulerExport(id)
      const blob = new Blob([JSON.stringify(body, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${id}.automation.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      reportActionError('Exporting automation', error)
    }
  }

  const selected = automations.find((a) => a.id === selectedId) ?? null

  return (
    <div className="flex h-full w-full flex-col">
      <header className="border-b border-border px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-brand" />
            <h2 className="text-sm font-semibold text-foreground">Automations</h2>
            <Badge variant="secondary" className="text-[9px]">
              {automations.filter((a) => a.enabled).length} active
            </Badge>
          </div>
          <Button
            size="sm"
            className="h-8 bg-brand text-black hover:bg-brand"
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
            <TabsTrigger value="health" className="text-xs">
              Health
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
                  className="group rounded-lg border border-border bg-card p-4 transition-colors hover:border-brand/40 hover-lift"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-brand/15 text-brand">
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
                      className="h-7 gap-1 bg-brand px-2.5 text-[10px] text-white hover:bg-brand-hover"
                      onClick={() => useTemplate(t)}
                    >
                      <Plus className="h-3 w-3" />
                      Use template
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : tab === 'history' ? (
            <LiveRuns />
          ) : tab === 'health' ? (
            <SchedulerHealth jobs={automations} />
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
              // P71.3d — the schedule itself is a trigger plane: only a pause
              // flag and firing records live on the row. Run-level status
              // (running / failed / waiting for approval) is the ledger's —
              // the History tab reads it (`scheduler_runs`).
              const paused = a.paused
              return (
                <div
                  key={a.id}
                  onClick={() => setSelectedId(a.id)}
                  className={cn(
                    'group cursor-pointer rounded-lg border bg-card p-4 transition-colors hover:border-brand/50',
                    selectedId === a.id
                      ? 'border-brand/50'
                      : 'border-border',
                    !a.enabled && 'opacity-70',
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Icon className="h-3.5 w-3.5 shrink-0 text-brand" />
                        <h3 className="truncate text-sm font-medium text-foreground">
                          {a.name}
                        </h3>
                        {paused && (
                          <Badge variant="outline" className="border-warning/40 bg-warning/10 text-[9px] text-warning">
                            Paused
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                        {triggerLabel(a.trigger)}
                      </p>
                      <p className="mt-0.5 text-xs text-foreground/70">
                        {a.steps.length} step(s) · agent{' '}
                        {sessionAgentLabel(a.sessionId) ?? 'none bound'}
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
                        className="flex size-6 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:border-warning/40 hover:text-warning"
                        aria-label={paused ? 'Resume' : 'Pause'}
                        title={paused ? 'Resume' : 'Pause'}
                      >
                        <Pause className="h-3 w-3" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          duplicateJob(a.id)
                        }}
                        className="flex size-6 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:border-brand/40 hover:text-brand"
                        aria-label="Duplicate automation"
                        title="Duplicate"
                      >
                        <Copy className="h-3 w-3" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          void exportJob(a.id)
                        }}
                        className="flex size-6 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:border-sky-500/40 hover:text-sky-300"
                        aria-label="Export automation"
                        title="Export as *.automation.json"
                      >
                        <Download className="h-3 w-3" />
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
                      <span>Fires (1h): {a.recentFires.length}</span>
                    </div>
                    <span className="text-[10px]">
                      Last fired:{' '}
                      {a.lastFiredAt ? new Date(a.lastFiredAt * 1000).toLocaleString() : 'never'}
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
        <div className="flex items-center gap-2 rounded-lg border border-border bg-background/40 px-3 py-2 focus-within:border-brand/50">
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
            className="flex size-6 shrink-0 items-center justify-center rounded-md bg-brand text-black hover:bg-brand"
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
