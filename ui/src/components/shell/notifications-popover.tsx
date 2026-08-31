'use client'

import { useState, useEffect } from 'react'
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Cpu,
  DollarSign,
  GitBranch,
  Info,
  ShieldAlert,
  Sparkles,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { inTauri } from '@/lib/tauri'

type NotificationKind =
  | 'info'
  | 'success'
  | 'warning'
  | 'error'
  | 'cost'
  | 'guard'
  | 'agent'
  | 'git'

interface AppNotification {
  id: string
  kind: NotificationKind
  title: string
  detail: string
  ts: number // epoch ms
  unread: boolean
  source?: string
}

const KIND_META: Record<
  NotificationKind,
  { icon: LucideIcon; tone: string; ring: string; label: string }
> = {
  info: { icon: Info, tone: 'text-sky-300', ring: 'ring-sky-500/20', label: 'Info' },
  success: { icon: CheckCircle2, tone: 'text-emerald-300', ring: 'ring-emerald-500/20', label: 'Success' },
  warning: { icon: AlertTriangle, tone: 'text-amber-300', ring: 'ring-amber-500/20', label: 'Warning' },
  error: { icon: AlertTriangle, tone: 'text-rose-300', ring: 'ring-rose-500/20', label: 'Error' },
  cost: { icon: DollarSign, tone: 'text-orange-300', ring: 'ring-orange-500/20', label: 'Cost' },
  guard: { icon: ShieldAlert, tone: 'text-violet-300', ring: 'ring-violet-500/20', label: 'Guard' },
  agent: { icon: Cpu, tone: 'text-blue-300', ring: 'ring-blue-500/20', label: 'Agent' },
  git: { icon: GitBranch, tone: 'text-emerald-300', ring: 'ring-emerald-500/20', label: 'Git' },
}

// Seeded list of notifications to demonstrate the activity feed.
const INITIAL_NOTIFICATIONS: AppNotification[] = [
  {
    id: 'n1',
    kind: 'cost',
    title: 'Daily budget 37% used',
    detail: '$1.84 / $5.00 spent today across 5 sessions',
    ts: Date.now() - 1000 * 60 * 2,
    unread: true,
    source: 'Budget',
  },
  {
    id: 'n2',
    kind: 'guard',
    title: 'Guard L2 approved shell write',
    detail: 'rm -rf node_modules/.cache allowed by trust policy',
    ts: Date.now() - 1000 * 60 * 12,
    unread: true,
    source: 'Guard',
  },
  {
    id: 'n3',
    kind: 'success',
    title: 'Q3 report regenerated',
    detail: 'Revenue chart and exec summary updated · 184K tokens',
    ts: Date.now() - 1000 * 60 * 23,
    unread: false,
    source: 'Session',
  },
  {
    id: 'n4',
    kind: 'agent',
    title: 'Auto-route picked Codex CLI',
    detail: 'Refactor api/users.ts → typed router',
    ts: Date.now() - 1000 * 60 * 47,
    unread: false,
    source: 'Routing',
  },
  {
    id: 'n5',
    kind: 'warning',
    title: 'Scraper hit rate limit',
    detail: '47 product pages crawled, 3 throttled — backing off 60s',
    ts: Date.now() - 1000 * 60 * 60 * 2,
    unread: false,
    source: 'Session',
  },
  {
    id: 'n6',
    kind: 'git',
    title: 'Branch pushed: feat/typed-router',
    detail: '4 commits · 312 insertions · pushed to origin',
    ts: Date.now() - 1000 * 60 * 60 * 4,
    unread: false,
    source: 'Git',
  },
  {
    id: 'n7',
    kind: 'info',
    title: 'Memory snapshot saved',
    detail: 'Auto-checkpoint · 2.4MB · 1,847 facts',
    ts: Date.now() - 1000 * 60 * 60 * 6,
    unread: false,
    source: 'Memory',
  },
  {
    id: 'n8',
    kind: 'error',
    title: 'Connector sync failed',
    detail: 'Notion workspace — token expired. Re-auth needed.',
    ts: Date.now() - 1000 * 60 * 60 * 9,
    unread: false,
    source: 'Connector',
  },
]

function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  return `${d}d`
}

export function NotificationsPopover() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<AppNotification[]>(() => (inTauri() ? [] : INITIAL_NOTIFICATIONS))

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('[data-notifications-popover]')) {
        setOpen(false)
      }
    }
    // Delay to avoid the same click that opened it from closing it
    const t = setTimeout(() => window.addEventListener('click', onClick), 0)
    return () => {
      clearTimeout(t)
      window.removeEventListener('click', onClick)
    }
  }, [open])

  const unreadCount = items.filter((n) => n.unread).length

  const markAllRead = () => {
    setItems((prev) => prev.map((n) => ({ ...n, unread: false })))
  }

  const markRead = (id: string) => {
    setItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, unread: false } : n)),
    )
  }

  return (
    <div className="relative" data-notifications-popover>
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          'no-drag relative h-7 w-7 transition-colors hover:bg-accent',
          open && 'bg-accent',
        )}
        onClick={() => setOpen((v) => !v)}
        title="Notifications"
      >
        <Bell className={cn('h-3.5 w-3.5', open ? 'text-orange-300' : 'text-muted-foreground')} />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1.5 flex h-3 min-w-3 items-center justify-center rounded-full bg-orange-500 px-1 font-mono text-[8px] font-bold text-white">
            {unreadCount}
          </span>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 top-9 z-50 w-96 origin-top-right rounded-lg border border-border bg-popover/95 shadow-2xl backdrop-blur-xl fade-up slide-in-right">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
            <div className="flex items-center gap-1.5">
              <Bell className="h-3.5 w-3.5 text-orange-400" />
              <span className="text-xs font-semibold text-foreground">Activity</span>
              {unreadCount > 0 && (
                <Badge className="bg-orange-500/15 px-1.5 py-0 text-[9px] text-orange-300">
                  {unreadCount} new
                </Badge>
              )}
            </div>
            <button
              onClick={markAllRead}
              disabled={unreadCount === 0}
              className="font-mono text-[10px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
            >
              Mark all read
            </button>
          </div>

          {/* Items */}
          <div className="max-h-96 overflow-y-auto scroll-thin">
            {items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <Sparkles className="h-5 w-5 text-muted-foreground/40" />
                <p className="text-[11px] text-muted-foreground">No activity yet</p>
              </div>
            ) : (
              items.map((n) => {
                const meta = KIND_META[n.kind]
                const Icon = meta.icon
                return (
                  <button
                    key={n.id}
                    onClick={() => markRead(n.id)}
                    className={cn(
                      'group flex w-full items-start gap-2.5 border-b border-border/30 px-3 py-2.5 text-left transition-colors hover:bg-accent/40',
                      n.unread && 'bg-orange-500/5',
                    )}
                  >
                    <span
                      className={cn(
                        'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md ring-1',
                        meta.ring,
                        'bg-background/40',
                      )}
                    >
                      <Icon className={cn('h-3.5 w-3.5', meta.tone)} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-[11px] font-medium text-foreground">
                          {n.title}
                        </span>
                        <span className="shrink-0 font-mono text-[9px] text-muted-foreground/80">
                          {relativeTime(n.ts)}
                        </span>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-[10px] leading-relaxed text-muted-foreground/90">
                        {n.detail}
                      </p>
                      <div className="mt-1 flex items-center gap-1.5">
                        {n.source && (
                          <span className="rounded-sm bg-background/60 px-1 py-0.5 font-mono text-[8px] uppercase tracking-wider text-muted-foreground/80">
                            {n.source}
                          </span>
                        )}
                        {n.unread && (
                          <span className="flex items-center gap-0.5 text-[9px] text-orange-300">
                            <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
                            new
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                )
              })
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-border/60 bg-background/30 px-3 py-1.5">
            <button className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground transition-colors hover:text-orange-300">
              <Zap className="h-3 w-3 text-orange-400" />
              Notification settings
            </button>
            <button className="font-mono text-[10px] text-orange-300 transition-colors hover:text-orange-200">
              View all activity →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
