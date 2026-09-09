'use client'

import { Plus, X } from 'lucide-react'
import { useAppStore, type Session } from '@/lib/store'
import { cn } from '@/lib/utils'

/**
 * P51.23 (UI slice) — session tab strip. Renders the most recent sessions as
 * switchable tabs above the chat: pinned first, then most-recently-updated.
 * ✕ closes a tab (the session parks in the bounded closed ring — reopen via
 * the session menu), + starts fresh work. Hidden entirely while only one
 * session exists so the chat never grows chrome it doesn't need.
 *
 * Drafts.sqlite persistence (the other half of P51.23) rides the Rust drafts
 * store and is not faked here — in-memory tabs are real, durable drafts stay
 * gated on that command surface.
 */
const MAX_TABS = 7

function tabOrder(sessions: Session[]): Session[] {
  return [...sessions].sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1
    return b.updatedAt.localeCompare(a.updatedAt)
  })
}

function statusDot(status: Session['status']): string {
  switch (status) {
    case 'running':
      return 'bg-orange-500 live-dot'
    case 'action-required':
      return 'bg-amber-400'
    case 'paused':
      return 'bg-yellow-400'
    case 'scheduled':
      return 'bg-sky-400'
    case 'failed':
      return 'bg-rose-500'
    case 'completed':
      return 'bg-emerald-400'
    case 'cancelled':
      return 'bg-zinc-400'
    case 'budget_exceeded':
      return 'bg-amber-400'
    default:
      return 'bg-zinc-500'
  }
}

export function SessionTabs() {
  const sessions = useAppStore((s) => s.sessions)
  const activeId = useAppStore((s) => s.activeSessionId)
  const setActiveSession = useAppStore((s) => s.setActiveSession)
  const deleteSession = useAppStore((s) => s.deleteSession)
  const newSession = useAppStore((s) => s.newSession)

  if (sessions.length <= 1) return null

  const ordered = tabOrder(sessions).slice(0, MAX_TABS)

  return (
    <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border bg-card/30 px-2 py-1 scroll-thin">
      {ordered.map((s) => {
        const active = s.id === activeId
        return (
          <div
            key={s.id}
            role="button"
            tabIndex={0}
            onClick={() => setActiveSession(s.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                setActiveSession(s.id)
              }
            }}
            className={cn(
              'group flex max-w-[180px] shrink-0 cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] transition-colors',
              active
                ? 'border-orange-500/50 bg-orange-500/10 text-foreground'
                : 'border-transparent text-muted-foreground hover:border-border hover:bg-accent/50 hover:text-foreground',
            )}
            title={s.folder ? `${s.title} · ${s.folder}` : s.title}
          >
            <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', statusDot(s.status))} />
            <span className="truncate">{s.title || 'New work'}</span>
            {s.pinned && <span className="text-[9px] text-orange-400" title="Pinned">★</span>}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                void deleteSession(s.id)
              }}
              className="ml-0.5 shrink-0 rounded p-0.5 text-muted-foreground/50 opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover:opacity-100"
              title="Close tab (session parks in the closed ring — Reopen last closed restores it)"
              aria-label={`Close ${s.title}`}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )
      })}
      <button
        type="button"
        onClick={() => newSession()}
        className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        title="New work (⌘N)"
      >
        <Plus className="h-3 w-3" />
        New
      </button>
    </div>
  )
}