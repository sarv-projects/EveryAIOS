'use client'

// P43 (B7 v3.53) — detached-work task rail (H19 binding). Renders the live
// BackgroundTaskRecord ledger: status queued/running/lost, delivery state,
// cancel/retry, and the fenced retry generation. Push completion: the shell
// emits `task-update` on every terminal transition, so the list refreshes on
// the event (plus after every local action) — never a polling loop.

import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertTriangle,
  Check,
  CircleDot,
  Clock,
  Loader2,
  RotateCcw,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  onTaskUpdate,
  taskKindLabel,
  taskStatusLabel,
  tasksCancel,
  tasksList,
  tasksRetry,
  type TaskRecord,
  type TaskStatus,
} from '@/lib/tasks'
import { staggerStyle } from '@/lib/stagger'

const STATUS_STYLE: Record<TaskStatus, string> = {
  queued: 'bg-muted text-muted-foreground',
  running: 'bg-amber-500/15 text-amber-600',
  succeeded: 'bg-emerald-500/15 text-emerald-600',
  failed: 'bg-red-500/15 text-red-600',
  timed_out: 'bg-orange-500/15 text-orange-600',
  cancelled: 'bg-muted text-muted-foreground',
  lost: 'bg-red-500/20 text-red-700',
}

const STATUS_ICON: Record<TaskStatus, typeof Clock> = {
  queued: Clock,
  running: Loader2,
  succeeded: Check,
  failed: AlertTriangle,
  timed_out: Clock,
  cancelled: X,
  lost: AlertTriangle,
}

export default function TasksRail() {
  const [tasks, setTasks] = useState<TaskRecord[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'active' | 'terminal'>('all')
  const unlistenRef = useRef<(() => void) | null>(null)

  const refresh = useCallback(async () => {
    try {
      const all = await tasksList()
      setTasks(all)
      setError(null)
      setLoading(false)
    } catch (cause) {
      setTasks([])
      setError(cause instanceof Error ? cause.message : 'Task ledger is unavailable')
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let disposed = false
    void refresh()
    void onTaskUpdate(() => {
      if (!disposed) void refresh()
    }).then((unlisten) => {
      // Tauri resolves `listen` asynchronously. StrictMode may clean up the
      // effect before that promise settles; unsubscribe immediately instead
      // of retaining a listener that the component can no longer own.
      if (disposed) unlisten()
      else unlistenRef.current = unlisten
    })
    return () => {
      disposed = true
      unlistenRef.current?.()
      unlistenRef.current = null
    }
  }, [refresh])

  const visible = tasks.filter((t) => {
    if (filter === 'active') return t.status === 'queued' || t.status === 'running'
    if (filter === 'terminal') {
      return ['succeeded', 'failed', 'timed_out', 'cancelled', 'lost'].includes(t.status)
    }
    return true
  })

  async function cancel(id: string) {
    try {
      if (await tasksCancel(id)) void refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Task cancellation failed')
    }
  }

  async function retry(id: string) {
    try {
      if (await tasksRetry(id)) void refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Task retry failed')
    }
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <CircleDot className="h-4 w-4 text-amber-500" />
          <h3 className="text-sm font-medium">Detached tasks</h3>
          <span className="text-xs text-muted-foreground">
            {tasks.filter((t) => t.status === 'running').length} running
          </span>
        </div>
        <div className="flex gap-1">
          {(['all', 'active', 'terminal'] as const).map((f) => (
            <Button
              key={f}
              variant="ghost"
              size="sm"
              onClick={() => setFilter(f)}
              className={cn(
                'h-6 px-2 text-xs',
                filter === f && 'bg-amber-500/10 text-amber-600',
              )}
            >
              {f}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex-1 space-y-1.5 overflow-y-auto pr-1">
        <AnimatePresence initial={false}>
          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-6 text-center text-xs text-red-600">
              Task ledger unavailable: {error}
            </div>
          )}
          {loading && (
            <div className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
              Loading task ledger…
            </div>
          )}
          {!loading && !error && visible.length === 0 && (
            <div className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
              No detached tasks yet — automation jobs, subagent and ACP spawns,
              and CLI runs appear here.
            </div>
          )}
          {visible.map((t, i) => {
            const Icon = STATUS_ICON[t.status]
            const blocked =
              t.delivery && 'blocked' in t.delivery ? t.delivery.blocked : null
            return (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                style={staggerStyle(i)}
                className="rounded-lg border bg-card p-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{t.title}</div>
                    <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span className="font-mono">{t.id}</span>
                      <span>·</span>
                      <span>{taskKindLabel(t.kind)}</span>
                      {t.requester && (
                        <>
                          <span>·</span>
                          <span className="truncate">req {t.requester}</span>
                        </>
                      )}
                      {t.retry_generation > 0 && (
                        <>
                          <span>·</span>
                          <span className="text-amber-600">gen {t.retry_generation}</span>
                        </>
                      )}
                    </div>
                    {t.error && (
                      <div className="mt-1 text-[11px] text-red-600">{t.error}</div>
                    )}
                    {blocked && (
                      <div className="mt-1 text-[11px] text-orange-600">
                        delivery blocked · retry {blocked.retries} — run itself{' '}
                        {taskStatusLabel(t.status).toLowerCase()}, not failed
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Badge
                      variant="outline"
                      className={cn('gap-1', STATUS_STYLE[t.status])}
                    >
                      <Icon
                        className={cn('h-3 w-3', t.status === 'running' && 'animate-spin')}
                      />
                      {taskStatusLabel(t.status)}
                    </Badge>
                    {t.status === 'queued' || t.status === 'running' ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-1.5 text-xs"
                        title="Cancel task"
                        onClick={() => void cancel(t.id)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-1.5 text-xs"
                        title="Retry (fenced generation)"
                        onClick={() => void retry(t.id)}
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </div>
  )
}
