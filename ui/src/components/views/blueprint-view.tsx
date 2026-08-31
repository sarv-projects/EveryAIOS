'use client'

import { useMemo, useState } from 'react'
import { useAppStore } from '@/lib/store'
import { inTauri } from '@/lib/tauri'
import {
  CheckCircle2,
  Circle,
  Clock,
  Loader2,
  Play,
  Plus,
  RotateCcw,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

/** P8.5 — a blueprint task with live execution status (H4). */
interface BlueprintTask {
  id: string
  goal: string
  status: 'pending' | 'ready' | 'running' | 'done' | 'failed' | 'blocked'
  deps: string[]
}

const DEMO_TASKS: BlueprintTask[] = [
  {
    id: 't1',
    goal: 'Read the sales CSV and confirm row count.',
    status: 'done',
    deps: [],
  },
  {
    id: 't2',
    goal: 'Open the Excel template and fill the revenue column.',
    status: 'running',
    deps: ['t1'],
  },
  {
    id: 't3',
    goal: 'Apply the signature and save as signed.pdf.',
    status: 'pending',
    deps: ['t2'],
  },
  {
    id: 't4',
    goal: 'Email the signed report to finance@acme.com.',
    status: 'pending',
    deps: ['t3'],
  },
]

const STATUS_META: Record<
  BlueprintTask['status'],
  { label: string; icon: typeof Circle; cls: string }
> = {
  pending: {
    label: 'Pending',
    icon: Circle,
    cls: 'text-slate-400 border-slate-500/30',
  },
  ready: {
    label: 'Ready',
    icon: Circle,
    cls: 'text-blue-400 border-blue-500/30',
  },
  running: {
    label: 'Running',
    icon: Loader2,
    cls: 'text-orange-400 border-orange-500/30 bg-orange-500/5',
  },
  done: {
    label: 'Done',
    icon: CheckCircle2,
    cls: 'text-emerald-400 border-emerald-500/30',
  },
  failed: {
    label: 'Failed',
    icon: RotateCcw,
    cls: 'text-red-400 border-red-500/30',
  },
  blocked: {
    label: 'Blocked',
    icon: Clock,
    cls: 'text-amber-400 border-amber-500/30',
  },
}

function isReady(task: BlueprintTask, all: BlueprintTask[]): boolean {
  return task.deps.every((dep) => all.find((t) => t.id === dep)?.status === 'done')
}

export default function BlueprintView() {
  // P11.2 — live execution status: when a real plan is pending (plan mode
  // approve → planExecute), the view renders the real task list instead of
  // the demo; statuses follow the store (running = the plan is executing).
  const pendingPlan = useAppStore((s) => s.pendingPlan)
  const liveTasks = useMemo<BlueprintTask[] | null>(() => {
    if (!pendingPlan) return null
    const firstPending = pendingPlan.tasks.find((t) => !t.dependsOn?.length)
    return pendingPlan.tasks.map((t, i) => ({
      id: t.id,
      goal: t.goal,
      status: firstPending && t.id === firstPending.id ? ('running' as const) : ('pending' as const),
      deps: t.dependsOn ?? [],
    }))
  }, [pendingPlan])

  const [tasks, setTasks] = useState<BlueprintTask[]>(() => (inTauri() ? [] : DEMO_TASKS))
  const [draft, setDraft] = useState('')
  const shown = liveTasks ?? tasks
  const nativeEmpty = inTauri() && !pendingPlan && shown.length === 0

  const addTask = () => {
    if (!draft.trim()) return
    if (inTauri()) {
      useAppStore.getState().notify('Blueprint task creation is not connected to the live task ledger yet', 'error')
      return
    }
    setTasks((prev) => [
      ...prev,
      {
        id: `t${prev.length + 1}`,
        goal: draft.trim(),
        status: 'pending',
        deps: [],
      },
    ])
    setDraft('')
  }

  const runTask = (id: string) => {
    if (inTauri()) {
      useAppStore.getState().notify('Run this plan from the composer after it has been approved', 'error')
      return
    }
    setTasks((prev) =>
      prev.map((t) =>
        t.id === id
          ? { ...t, status: 'running' }
          : t.status === 'running'
            ? { ...t, status: 'done' }
            : t,
      ),
    )
  }

  const resetAll = () => {
    if (inTauri()) return
    setTasks((prev) =>
      prev.map((t) => ({
        ...t,
        status: t.deps.length === 0 ? 'ready' : 'pending',
      })),
    )
  }

  const doneCount = shown.filter((t) => t.status === 'done').length
  const progress = Math.round((doneCount / Math.max(shown.length, 1)) * 100)

  return (
    <div className="fade-up flex h-full flex-col gap-3 p-3">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">Blueprint</h3>
          <Badge variant="secondary" className="text-[9px]">
            {doneCount}/{shown.length} done
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-700">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={resetAll}>
            <RotateCcw className="mr-1 h-3 w-3" /> Reset
          </Button>
        </div>
      </header>

      {/* Spec.md-style editor area */}
      <div className="flex-1 overflow-auto rounded-lg border border-border bg-muted/30 p-3">
        <div className="mb-2 font-mono text-[10px] text-slate-500">
          # spec.md — verify-gated blueprint tasks
        </div>
        {nativeEmpty ? (
          <div className="rounded-md border border-dashed border-border/60 px-3 py-10 text-center text-xs text-muted-foreground">
            No plan yet. Describe work in the composer to create a plan.
          </div>
        ) : (
        <div className="space-y-2">
          {shown.map((task) => {
            const meta = STATUS_META[task.status]
            const Icon = meta.icon
            const ready =
              task.status === 'pending' && isReady(task, shown)
            return (
              <div
                key={task.id}
                className={cn(
                  'flex items-start gap-2 rounded-md border p-2.5 text-xs',
                  meta.cls,
                )}
              >
                <Icon
                  className={cn(
                    'mt-0.5 h-3.5 w-3.5 shrink-0',
                    task.status === 'running' && 'animate-spin',
                  )}
                />
                <div className="flex-1">
                  <div className="text-foreground">{task.goal}</div>
                  <div className="mt-0.5 flex items-center gap-2 text-[10px] text-slate-500">
                    <span className="font-mono">{task.id}</span>
                    <span>·</span>
                    <span>{meta.label}</span>
                    {ready && (
                      <>
                        <span>·</span>
                        <span className="text-blue-400">deps satisfied</span>
                      </>
                    )}
                  </div>
                </div>
                {(ready || task.status === 'running') && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 text-[10px]"
                    onClick={() => runTask(task.id)}
                  >
                    <Play className="mr-1 h-3 w-3" />
                    {task.status === 'running' ? 'Advance' : 'Run'}
                  </Button>
                )}
              </div>
            )
          })}
        </div>
        )}
      </div>

      {/* Add task */}
      <div className="flex items-end gap-2">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a blueprint task goal…"
          className="min-h-[2.5rem] flex-1 text-xs"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) addTask()
          }}
        />          <Button size="sm" onClick={addTask} className="h-8" disabled={inTauri()} title={inTauri() ? 'Create a plan from the chat composer' : undefined}>
            <Plus className="mr-1 h-3 w-3" /> Add
          </Button>
      </div>
    </div>
  )
}
