'use client'

// P51.5 — queue-while-generating: turns sent while the agent is busy land as
// pending chips above the composer. Each chip is inline-editable (text kept
// in the store queue) and removable; the next chip fires automatically once
// the current turn ends (store → bridge dispatcher). Nothing here invents
// state: it renders the store's pendingQueue for the active session.

import { memo, useState } from 'react'
import { ArrowUp, Clock3, Pause, Pencil, Play, X } from 'lucide-react'
import { useAppStore, type QueuedTurn } from '@/lib/store'
import { cn } from '@/lib/utils'

const Chip = memo(function Chip({ turn, first }: { turn: QueuedTurn; first: boolean }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(turn.text)

  const commitEdit = () => {
    const text = draft.trim()
    const st = useAppStore.getState()
    const sid = st.activeSessionId
    if (!text) {
      st.removeQueuedTurn(sid, turn.id)
    } else {
      st.editQueuedTurn(sid, turn.id, text)
    }
    setEditing(false)
  }

  const fireNow = () => {
    // Pull the chip out of the queue and dispatch it immediately
    // (bypassQueue so it can't re-queue behind itself).
    const st = useAppStore.getState()
    const sid = st.activeSessionId
    st.removeQueuedTurn(sid, turn.id)
    void import('@/lib/bridge').then(({ sendUserMessage }) =>
      sendUserMessage(turn.text, turn.context, { bypassQueue: true }),
    )
  }

  return (
    <div
      className={cn(
        'group/q flex items-center gap-1.5 rounded-md border px-2 py-1',
        first
          ? 'border-orange-500/30 bg-orange-500/5'
          : 'border-border bg-background/40',
      )}
    >
      {first ? (
        <Clock3 className="h-3 w-3 shrink-0 text-orange-300" />
      ) : (
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
      )}
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitEdit()
            if (e.key === 'Escape') {
              setDraft(turn.text)
              setEditing(false)
            }
          }}
          className="min-w-0 flex-1 border-none bg-transparent font-mono text-[11px] text-foreground outline-none"
          aria-label="Edit queued message"
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            setDraft(turn.text)
            setEditing(true)
          }}
          className="min-w-0 flex-1 truncate text-left font-mono text-[11px] text-muted-foreground hover:text-foreground"
          title="Click to edit"
        >
          {turn.text}
        </button>
      )}
      {!editing && (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="shrink-0 rounded p-0.5 text-muted-foreground/50 opacity-0 transition-opacity hover:text-foreground group-hover/q:opacity-100"
          title="Edit queued message"
        >
          <Pencil className="h-2.5 w-2.5" />
        </button>
      )}
      <button
        type="button"
        onClick={fireNow}
        className="shrink-0 rounded p-0.5 text-muted-foreground/50 hover:text-orange-300"
        title="Send now (skip the queue)"
      >
        <ArrowUp className="h-2.5 w-2.5" />
      </button>
      {!first && (
        <button
          type="button"
          onClick={() =>
            useAppStore
              .getState()
              .promoteQueuedTurn(useAppStore.getState().activeSessionId, turn.id)
          }
          className="shrink-0 rounded p-0.5 text-muted-foreground/50 opacity-0 transition-opacity hover:text-foreground group-hover/q:opacity-100"
          title="Move to front of the queue"
        >
          <ArrowUp className="h-2.5 w-2.5 rotate-45" />
        </button>
      )}
      <button
        type="button"
        onClick={() => useAppStore.getState().removeQueuedTurn(useAppStore.getState().activeSessionId, turn.id)}
        className="shrink-0 rounded p-0.5 text-muted-foreground/50 hover:text-foreground"
        title="Remove from queue"
      >
        <X className="h-2.5 w-2.5" />
      </button>
    </div>
  )
})

export default function PendingQueueChips() {
  const sid = useAppStore((s) => s.activeSessionId)
  const queue = useAppStore((s) => s.pendingQueue[sid] ?? [])
  const paused = useAppStore((s) => s.queuePaused[sid] ?? false)
  if (queue.length === 0) return null
  return (
    <div className="mx-3 mt-2 flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5 px-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground/60">
        <Clock3 className="h-2.5 w-2.5" />
        In queue · {queue.length}
        {paused && (
          <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1 text-[8px] text-amber-300">
            paused
          </span>
        )}
        <button
          type="button"
          onClick={() => useAppStore.getState().setQueuePaused(sid, !paused)}
          className="ml-auto flex items-center gap-0.5 rounded px-1 py-0.5 text-[9px] normal-case tracking-normal text-muted-foreground hover:bg-accent hover:text-foreground"
          title={
            paused
              ? 'Resume — the next queued ask fires when the current turn ends'
              : 'Pause — queued asks stay listed and never auto-fire until resumed'
          }
        >
          {paused ? <Play className="h-2.5 w-2.5" /> : <Pause className="h-2.5 w-2.5" />}
          {paused ? 'Resume' : 'Pause'}
        </button>
      </div>
      {queue.map((q, i) => (
        <Chip key={q.id} turn={q} first={i === 0} />
      ))}
    </div>
  )
}
