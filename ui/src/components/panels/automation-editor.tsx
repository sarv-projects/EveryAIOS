'use client'

import { useState } from 'react'
import { Activity, Clock, Shield, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { SchedulerJob, SchedulerTrigger } from '@/lib/scheduler'
import { schedulerCreate, schedulerDelete } from '@/lib/scheduler'
import { useAppStore } from '@/lib/store'

interface Props {
  automation: SchedulerJob
  onClose: () => void
  onSaved?: () => void
}

function triggerExpr(t: SchedulerTrigger): string {
  if (t.type === 'cron') return t.expr
  if (t.type === 'interval') return String(t.secs)
  if (t.type === 'webhook') return t.path
  return t.filter
}

export default function AutomationEditor({ automation, onClose, onSaved }: Props) {
  const notify = useAppStore((s) => s.notify)
  const [trigger, setTrigger] = useState(automation.trigger.type)
  const [expr, setExpr] = useState(triggerExpr(automation.trigger))
  const [saving, setSaving] = useState(false)

  const successRate = Math.round(
    (automation.successes / Math.max(automation.runs, 1)) * 100,
  )

  // No scheduler-update IPC exists: saving recreates the job (delete +
  // create) with the edited trigger, preserving id/name/session/steps/policy.
  // Run history resets with the new record — said plainly in the confirm.
  const save = () => {
    void (async () => {
      let next: SchedulerTrigger
      if (trigger === 'cron') {
        if (!expr.trim() || expr.trim().split(/\s+/).length < 5) {
          notify('Cron needs five fields, e.g. “0 9 * * *”', 'error')
          return
        }
        next = { type: 'cron', expr: expr.trim() }
      } else if (trigger === 'interval') {
        const secs = Math.round(Number(expr))
        if (!Number.isFinite(secs) || secs < 60) {
          notify('Interval needs seconds ≥ 60', 'error')
          return
        }
        next = { type: 'interval', secs }
      } else if (trigger === 'webhook') {
        if (!expr.trim().startsWith('/')) {
          notify('Webhook needs a path like “/hooks/ci”', 'error')
          return
        }
        next = { type: 'webhook', path: expr.trim(), schema: [] }
      } else {
        next = { type: 'event', kind: 'schedule', filter: expr.trim() }
      }
      setSaving(true)
      try {
        await schedulerDelete(automation.id)
        await schedulerCreate({
          id: automation.id,
          name: automation.name,
          sessionId: automation.sessionId,
          trigger: next,
          steps: automation.steps,
          policy: automation.policy,
        })
        notify('Schedule recreated with the new trigger (run history reset)')
        onSaved?.()
        onClose()
      } catch (e) {
        notify(e instanceof Error ? e.message : 'Schedule save failed', 'error')
      } finally {
        setSaving(false)
      }
    })()
  }

  return (
    <div className="fade-up mt-4 rounded-lg border border-orange-500/30 bg-card shadow-inset-soft">
      <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-orange-400" />
          <h3 className="text-sm font-semibold text-foreground">
            {automation.name}
          </h3>
          <Badge variant="secondary" className="text-[9px]">
            editor
          </Badge>
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="size-6"
          onClick={onClose}
          aria-label="Close editor"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </header>

      <div className="grid gap-4 p-4 lg:grid-cols-2">
        {/* === Left: trigger form === */}
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground">
              Trigger kind
            </Label>
            <Select
              value={trigger}
              onValueChange={(v) =>
                setTrigger(v as SchedulerJob['trigger']['type'])
              }
            >
              <SelectTrigger className="h-8 w-full text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cron">Schedule (cron)</SelectItem>
                <SelectItem value="interval">Interval</SelectItem>
                <SelectItem value="webhook">Webhook</SelectItem>
                <SelectItem value="event">Event</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground">
              {trigger === 'cron'
                ? 'Cron expression'
                : trigger === 'interval'
                  ? 'Interval (seconds, ≥ 60)'
                  : trigger === 'webhook'
                    ? 'Webhook path'
                    : 'Event filter'}
            </Label>
            <Input
              value={expr}
              onChange={(e) => setExpr(e.target.value)}
              placeholder={trigger === 'cron' ? '0 9 * * *' : trigger === 'interval' ? '3600' : trigger === 'webhook' ? '/hooks/ci' : 'repo.branch == main'}
              className="h-8 font-mono text-xs"
            />
          </div>
          <p className="text-[10px] text-muted-foreground">
            Saving recreates the schedule with this trigger (same id, name, steps, and
            policy). Run history resets — the ledger keeps no per-trigger lineage.
          </p>
        </div>

        {/* === Right: live stats === */}
        <div className="space-y-3">
          <div className="rounded-md border border-border bg-background/40 p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                Runs
              </div>
              <span className="font-mono text-[10px] text-muted-foreground">
                {automation.runs} total · {automation.successes} ok · {automation.failures} failed
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Shield className="h-3 w-3 text-emerald-400" />
              <span className="font-mono text-sm font-semibold text-emerald-300">{successRate}%</span>
              <span className="text-[10px] text-muted-foreground">success rate</span>
            </div>
            {automation.nextRunAt != null && (
              <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                next run {new Date(automation.nextRunAt * 1000).toLocaleString()}
              </p>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={onClose}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-8 bg-orange-500 text-black hover:bg-orange-400"
              disabled={saving}
              onClick={save}
            >
              {saving ? 'Saving…' : 'Save automation'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
