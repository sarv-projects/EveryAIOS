'use client'

// P65.4 — Settings → Schedules. A compact Settings surface over the same
// scheduler backend the Automations center drives (`lib/scheduler` — the
// shared lib, not a copy of automations-panel logic).
//
// - Lists live jobs (scheduler_list), honest loading/empty/error/unavailable.
// - Run-now triggers a visible task: the row shows "run requested" and the
//   shell toast names the job, so the run is observable in Activity.
// - Enable/pause/resume reuse the same commands; full editing stays in the
//   Automations center (deep link, no duplicated editor).

import { useCallback, useEffect, useState } from 'react'
import { CalendarClock, Loader2, Play } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/lib/store'
import { inTauri } from '@/lib/tauri'
import {
  schedulerList,
  schedulerPause,
  schedulerResume,
  schedulerRunNow,
  triggerLabel,
  type SchedulerJob,
} from '@/lib/scheduler'
import { settingsScheduleSetEnabled } from '@/lib/settings'
import { Row, SectionShell } from './settings-shared'

function stateBadge(job: SchedulerJob) {
  const s = job.state.state
  if (s === 'running') {
    return <Badge className="bg-sky-500/15 text-[9px] text-sky-300">running</Badge>
  }
  if (s === 'paused') {
    return <Badge className="bg-amber-500/15 text-[9px] text-amber-300">paused</Badge>
  }
  if (s === 'failed') {
    return <Badge className="bg-red-500/15 text-[9px] text-red-300">retrying</Badge>
  }
  return <Badge variant="secondary" className="text-[9px]">idle</Badge>
}

/** CLS=0 skeleton: exact-fit rows so the list never pushes layout on load. */
function SchedulesSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading schedules"
      className="space-y-1.5 [contain-intrinsic-size:auto_72px]"
    >
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="shimmer h-[72px] rounded-md border border-border/50"
        />
      ))}
      <span className="sr-only">Loading schedules…</span>
    </div>
  )
}

export default function SchedulesSection() {
  const notify = useAppStore((s) => s.notify)
  const setCenterScreen = useAppStore((s) => s.setCenterScreen)
  const [jobs, setJobs] = useState<SchedulerJob[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [requested, setRequested] = useState<Record<string, number>>({})

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await schedulerList()
      setJobs(res.jobs)
    } catch (e) {
      setJobs([])
      setError(e instanceof Error ? e.message : 'Schedules unavailable')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load, reload])

  const runNow = async (job: SchedulerJob) => {
    setBusyId(job.id)
    try {
      await schedulerRunNow(job.id)
      // Run-now triggers a visible task: stamp the row and name the job in
      // the toast so the run is observable (Activity → runs ledger).
      setRequested((m) => ({ ...m, [job.id]: Date.now() }))
      notify(`Run requested — “${job.name}” starts now; watch Activity for the run`)
    } catch (e) {
      notify(`Run now failed: ${e instanceof Error ? e.message : String(e)}`, 'error')
    } finally {
      setBusyId(null)
    }
  }

  const toggleEnabled = async (job: SchedulerJob) => {
    const next = !job.enabled
    setBusyId(job.id)
    try {
      // P65.4 / §17.12.3 — the enable flag goes through the one mutation
      // funnel, not a direct scheduler write. The envelope is authoritative:
      // **discard-optimistic-on-mismatch** means we re-read rather than patch
      // our own guess, and a refusal is surfaced with the shell's real reason.
      const envelope = await settingsScheduleSetEnabled(job.id, next)
      if (envelope.lastError) {
        notify(`Updating schedule failed: ${envelope.lastError}`, 'error')
      } else if (envelope.restartRequired) {
        notify(`Schedule ${next ? 'enabled' : 'disabled'} — restart required to apply`)
      }
      await load()
    } catch (e) {
      notify(`Updating schedule failed: ${e instanceof Error ? e.message : String(e)}`, 'error')
    } finally {
      setBusyId(null)
    }
  }

  const pauseOrResume = async (job: SchedulerJob) => {
    const paused = job.state.state === 'paused'
    setBusyId(job.id)
    try {
      if (paused) {
        await schedulerResume(job.id)
        setJobs((prev) => (prev ?? []).map((j) => (j.id === job.id ? { ...j, state: { state: 'idle' as const } } : j)))
      } else {
        await schedulerPause(job.id)
        setJobs((prev) => (prev ?? []).map((j) => (j.id === job.id ? { ...j, state: { state: 'paused' as const, resumeDeadline: undefined } } : j)))
      }
    } catch (e) {
      notify(`${paused ? 'Resuming' : 'Pausing'} schedule failed: ${e instanceof Error ? e.message : String(e)}`, 'error')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <SectionShell
      title="Schedules"
      desc="Cron, interval, webhook, and event jobs from the shared scheduler. Run-now starts a visible run; full editing lives in the Automations center."
      action={
        <Button
          size="sm"
          variant="outline"
          className="h-8"
          onClick={() => setCenterScreen('automations')}
        >
          <CalendarClock className="h-3.5 w-3.5" />
          Open Automations
        </Button>
      }
    >
      {!inTauri() && (
        <p className="rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1.5 text-[10px] text-amber-200/90">
          Preview mode — demo schedules below. Run-now and toggles need the desktop shell.
        </p>
      )}

      {jobs === null && !error && <SchedulesSkeleton />}

      {error && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2.5 text-xs text-red-300">
          <span>Schedules unavailable: {error}</span>
          <Button size="sm" variant="outline" className="h-7 shrink-0 text-[10px]" onClick={() => setReload((v) => v + 1)}>
            Retry
          </Button>
        </div>
      )}

      {jobs !== null && !error && jobs.length === 0 && (
        <div className="rounded-md border border-dashed border-border/60 px-3 py-6 text-center">
          <CalendarClock className="mx-auto h-4 w-4 text-muted-foreground/50" />
          <p className="mt-1 text-[11px] text-muted-foreground">
            No schedules yet — create one from the Automations center.
          </p>
          <Button size="sm" variant="outline" className="mt-2 h-7 text-[10px]" onClick={() => setCenterScreen('automations')}>
            Open Automations
          </Button>
        </div>
      )}

      {jobs !== null && jobs.length > 0 && (
        <ul className="space-y-1.5 [contain-intrinsic-size:auto_72px]">
          {jobs.map((job) => {
            const wasRequested = requested[job.id] !== undefined
            const busy = busyId === job.id
            return (
              <li
                key={job.id}
                className={cn(
                  'rounded-md border border-border/50 bg-background/30 px-3 py-2',
                  !job.enabled && 'opacity-70',
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
                    {job.name}
                  </span>
                  {stateBadge(job)}
                  {!job.enabled && (
                    <Badge variant="outline" className="text-[9px] text-muted-foreground">off</Badge>
                  )}
                  {wasRequested && (
                    <Badge className="bg-emerald-500/15 text-[9px] text-emerald-300">
                      run requested
                    </Badge>
                  )}
                </div>
                <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                  {triggerLabel(job.trigger)}
                  {typeof job.nextRunAt === 'number' ? ` · next ${new Date(job.nextRunAt * 1000).toLocaleString()}` : ''}
                  {` · ${job.runs} runs`}
                </div>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-[10px]"
                    disabled={busy}
                    onClick={() => void runNow(job)}
                    aria-label={`Run ${job.name} now`}
                  >
                    {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                    Run now
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-[10px]"
                    disabled={busy}
                    onClick={() => void pauseOrResume(job)}
                    aria-label={job.state.state === 'paused' ? `Resume ${job.name}` : `Pause ${job.name}`}
                  >
                    {job.state.state === 'paused' ? 'Resume' : 'Pause'}
                  </Button>
                  <span className="ml-auto flex items-center gap-1.5">
                    <span className="font-mono text-[9px] text-muted-foreground">
                      {job.enabled ? 'on' : 'off'}
                    </span>
                    <Switch
                      checked={job.enabled}
                      onCheckedChange={() => void toggleEnabled(job)}
                      aria-label={`Enable ${job.name}`}
                      disabled={busy}
                    />
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <Row label="Where edits live" desc="Schedules are created and edited in the Automations center; this surface only runs and toggles">
        <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => setCenterScreen('automations')}>
          Open Automations
        </Button>
      </Row>
    </SectionShell>
  )
}
