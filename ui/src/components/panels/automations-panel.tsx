'use client'

import { useEffect, useState } from 'react'
import {
  Check,
  Clock,
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
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
import AutomationEditor from './automation-editor'

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
  'CI Fixer',
  'Weekly Deps',
  'Security Scan',
  'Release Notes',
  'Slack Digest',
  'Standup Bot',
  'Invoice Batch',
  'Log Rotator',
]

export default function AutomationsPanel() {
  const [automations, setAutomations] = useState<SchedulerJob[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [nlInput, setNlInput] = useState('')

  // H14: live job list from the Rust scheduler (demo fallback in preview).
  useEffect(() => {
    void schedulerList().then((s) => setAutomations(s.jobs))
  }, [])

  const toggleEnabled = (id: string) => {
    const next = !automations.find((a) => a.id === id)?.enabled
    void schedulerEnable(id, next).then(() =>
      setAutomations((prev) =>
        prev.map((a) => (a.id === id ? { ...a, enabled: next } : a)),
      ),
    )
  }

  const runNow = (id: string) => void schedulerRunNow(id)
  const pauseJob = (id: string) =>
    void schedulerPause(id).then(() =>
      setAutomations((prev) =>
        prev.map((a) =>
          a.id === id
            ? { ...a, state: { state: 'paused' as const, resumeDeadline: undefined } }
            : a,
        ),
      ),
    )
  const resumeJob = (id: string) =>
    void schedulerResume(id).then(() =>
      setAutomations((prev) =>
        prev.map((a) => (a.id === id ? { ...a, state: { state: 'idle' as const } } : a)),
      ),
    )
  const removeJob = (id: string) =>
    void schedulerDelete(id).then(() =>
      setAutomations((prev) => prev.filter((a) => a.id !== id)),
    )

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
          >
            <Plus className="h-3.5 w-3.5" />
            Create automation
          </Button>
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          Scheduled tasks, webhooks &amp; event triggers that drive headless
          agent sessions
        </p>
        <Tabs defaultValue="active" className="mt-3">
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
          </TabsList>
          <TabsContent value="active" />
          <TabsContent value="templates" />
          <TabsContent value="history" />
        </Tabs>
      </header>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-3 p-4">
          <div className="grid gap-3 xl:grid-cols-2">
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
          </div>

          {selected && (
            <AutomationEditor
              automation={selected}
              onClose={() => setSelectedId(null)}
            />
          )}

          {/* Templates row */}
          <div className="rounded-lg border border-border bg-card p-3">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-xs font-medium text-foreground">
                Templates
              </span>
              <span className="font-mono text-[10px] text-muted-foreground">
                {TEMPLATES.length} presets
              </span>
            </div>
            <div className="scroll-thin flex gap-2 overflow-x-auto pb-1">
              {TEMPLATES.map((t) => (
                <button
                  key={t}
                  className="flex shrink-0 items-center gap-1 rounded-md border border-border bg-background/40 px-3 py-1.5 text-xs text-foreground/80 transition-colors hover:border-orange-500/40 hover:bg-orange-500/10 hover:text-orange-300"
                >
                  <Plus className="h-3 w-3" />
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>
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
