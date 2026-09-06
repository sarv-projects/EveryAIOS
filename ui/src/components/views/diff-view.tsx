'use client'

import { useEffect, useMemo, useState } from 'react'
import { GitCompareArrows, RotateCcw, Undo2, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  fsUndoList,
  fsUndoRestore,
  fsUndoSnapshot,
  fsReadFile,
  type FsUndo,
  type FsUndoSnapshot,
} from '@/lib/fs'
import { EmptyState } from '@/components/ui/empty-state'
import { SkeletonBlock } from '@/components/ui/loading-state'
import { useAppStore } from '@/lib/store'

/**
 * P11.5.3 + P52.17 — diff view over real pending patches. Reads `fs_undo_list`
 * (the agent's file mutations this session, each with a pre-mutation snapshot)
 * and renders a true before-vs-after unified diff when the snapshot and the
 * live file are both text (P52.17: `fs_undo_snapshot` returns the snapshot
 * content, so the diff is never a fabricated "+ the whole file"). Each row
 * offers Restore — `fs_undo_restore` writes the snapshot bytes back, audited
 * as a HumanGesture on the Merkle chain. A last-turn filter narrows to the
 * active session's patches.
 */
interface DiffLine {
  kind: 'ctx' | 'add' | 'del'
  text: string
}

export default function DiffView() {
  const [undos, setUndos] = useState<FsUndo[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<string | null>(null)
  const [diff, setDiff] = useState<DiffLine[] | null>(null)
  const [created, setCreated] = useState(false)
  const [binaryNote, setBinaryNote] = useState<string | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [lastTurnOnly, setLastTurnOnly] = useState(false)
  const setPendingPatches = useAppStore((s) => s.setPendingPatches)
  const activeSessionId = useAppStore((s) => s.activeSessionId)
  const notify = useAppStore((s) => s.notify)

  useEffect(() => {
    let active = true
    void fsUndoList().then((r) => {
      if (!active) return
      setUndos(r.undos)
      setPendingPatches(r.undos.map((u) => ({ id: `${u.index}`, sessionId: u.sessionId, path: u.path, beforeBytes: u.beforeBytes })))
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [setPendingPatches])

  // P52.17 — last-turn filter: only the active session's patches. When a
  // session is deleted the active id may not match any patch → show all.
  const visible = useMemo(() => {
    if (!lastTurnOnly) return undos
    const has = undos.some((u) => u.sessionId === activeSessionId)
    return has ? undos.filter((u) => u.sessionId === activeSessionId) : undos
  }, [undos, lastTurnOnly, activeSessionId])

  const refresh = async () => {
    const r = await fsUndoList()
    setUndos(r.undos)
    setPendingPatches(r.undos.map((u) => ({ id: `${u.index}`, sessionId: u.sessionId, path: u.path, beforeBytes: u.beforeBytes })))
    // The selected file may have been restored/consumed — clear stale state.
    if (selected && !r.undos.some((u) => u.path === selected)) {
      setSelected(null)
      setDiff(null)
      setBinaryNote(null)
    }
  }

  const showDiff = async (u: FsUndo) => {
    setSelected(u.path)
    setDiffLoading(true)
    setBinaryNote(null)
    setCreated(false)
    try {
      // Real snapshot content (P52.17) — not a fabricated "+ whole file".
      const snap = await fsUndoSnapshot(u.path)
      const f = await fsReadFile(u.path)
      if (!snap.found || snap.binary || f.binary) {
        // Binary or missing snapshot: honest size/type note only.
        if (snap.created) {
          setCreated(true)
          setBinaryNote(null)
          setDiff(null)
        } else {
          setBinaryNote(
            snap.found && snap.binary
              ? `(binary patch — snapshot ${formatBytes(u.beforeBytes)} → live ${formatBytes(f.sizeBytes)}; restore rewrites the whole file)`
              : f.binary
                ? `(live file is binary — size ${formatBytes(f.sizeBytes)} B after a ${formatBytes(u.beforeBytes)} snapshot)`
                : `(snapshot unavailable — restore still works when a snapshot exists)`,
          )
          setDiff(null)
        }
        return
      }
      const before = snap.content?.split('\n') ?? []
      const after = f.content.split('\n')
      setCreated(false)
      setDiff(diffLines(before, after, snap.bytes ?? u.beforeBytes))
    } catch {
      setBinaryNote('(unreadable — file may have moved; restore still works when a snapshot exists)')
      setDiff(null)
    } finally {
      setDiffLoading(false)
    }
  }

  /** P52.17 — restore the selected file to its pre-mutation snapshot. The
   * Rust side consumes the snapshot and audits the restore as a human
   * gesture; this view then refreshes so restored rows disappear. */
  const restore = async () => {
    if (!selected) return
    setRestoring(true)
    try {
      const res = await fsUndoRestore(selected)
      notify(res.ok ? `Restored ${selected.split('/').pop()}` : 'Restore failed', res.ok ? undefined : 'error')
      await refresh()
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Restore failed', 'error')
    } finally {
      setRestoring(false)
    }
  }

  if (loading) {
    return (
      <div className="p-4">
        <SkeletonBlock lines={5} />
      </div>
    )
  }

  if (undos.length === 0) {
    return (
      <EmptyState
        icon={GitCompareArrows}
        title="No pending patches"
        description="Files the agent mutated this session appear here with their undo snapshots."
      />
    )
  }

  return (
    <div className="flex h-full w-full flex-col">
      <header className="flex items-center gap-2 border-b border-border px-4 py-2">
        <GitCompareArrows className="h-3.5 w-3.5 text-orange-400" />
        <span className="text-xs font-medium text-foreground">Pending patches</span>
        <Badge variant="outline" className="text-[9px]">{visible.length}</Badge>
        <button
          onClick={() => setLastTurnOnly((v) => !v)}
          className={cn(
            'ml-2 rounded px-1.5 py-0.5 text-[10px] transition-colors',
            lastTurnOnly ? 'bg-orange-500/15 text-orange-300' : 'text-muted-foreground hover:bg-accent/40',
          )}
          title="P52.17 — narrow to the active session's patches"
        >
          last turn only
        </button>
        <span className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground">
          <RotateCcw className="h-3 w-3" /> restore rewrites the snapshot back
        </span>
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-[240px_1fr]">
        <div className="overflow-auto border-r border-border p-2">
          {visible.map((u) => (
            <button
              key={`${u.sessionId}-${u.path}`}
              onClick={() => void showDiff(u)}
              className={cn(
                'mb-1 flex w-full flex-col gap-0.5 rounded-md border px-2 py-1.5 text-left text-xs transition-colors',
                selected === u.path
                  ? 'border-orange-500/50 bg-orange-500/10'
                  : 'border-border bg-background/40 hover:bg-accent/40',
              )}
            >
              <span className="truncate font-mono text-foreground">{u.path.split('/').pop()}</span>
              <span className="truncate text-[10px] text-muted-foreground">{u.path}</span>
              <span className="text-[10px] text-muted-foreground">
                {u.beforeBytes === 0 ? 'new file' : `before ${formatBytes(u.beforeBytes)}`} · {u.sessionId.slice(0, 8)}
              </span>
            </button>
          ))}
          {visible.length === 0 && (
            <div className="p-2 text-center text-[10px] text-muted-foreground">No patches from the last turn</div>
          )}
        </div>
        <div className="flex min-h-0 flex-col">
          <div className="flex items-center gap-2 border-b border-border/60 px-3 py-1.5">
            {selected && (
              <>
                <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground">{selected}</code>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 text-[10px]"
                  disabled={restoring}
                  onClick={() => void restore()}
                  title="P52.17 — write the pre-mutation snapshot back (human-gesture audited)"
                >
                  <Undo2 className={cn('mr-1 h-3 w-3', restoring && 'animate-spin')} />
                  Restore this file
                </Button>
              </>
            )}
          </div>
          <div className="flex-1 overflow-auto bg-zinc-950 p-3">
            {!selected && (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                Select a patch to inspect
              </div>
            )}
            {diffLoading && <SkeletonBlock lines={6} />}
            {binaryNote && !diff && <div className="font-mono text-[11px] text-zinc-500">{binaryNote}</div>}
            {created && (
              <div className="font-mono text-[11px] text-emerald-300/90">
                new file — restore deletes it (the agent created it this turn)
              </div>
            )}
            {diff && (
              <div className="space-y-0 font-mono text-[11px] leading-relaxed">
                {diff.slice(0, 400).map((line, i) => (
                  <div
                    key={i}
                    className={cn(
                      'whitespace-pre-wrap px-1',
                      line.kind === 'add' && 'bg-emerald-500/10 text-emerald-300',
                      line.kind === 'del' && 'bg-rose-500/10 text-rose-300/90',
                      line.kind === 'ctx' && 'text-zinc-400',
                    )}
                  >
                    {line.kind === 'add' ? '+ ' : line.kind === 'del' ? '- ' : '  '}
                    {line.text}
                  </div>
                ))}
                {diff.length > 400 && (
                  <div className="text-[10px] text-zinc-500">… truncated at 400 diff lines</div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/** A minimal LCS-free unified diff: emit removed lines (-), then added lines
 * (+) where they differ, with a shared run between. Good enough to render
 * hunks honestly for text patches without pulling in a diff engine. */
function diffLines(before: string[], after: string[], _beforeBytes: number): DiffLine[] {
  const out: DiffLine[] = []
  const max = Math.max(before.length, after.length)
  for (let i = 0; i < max; i++) {
    const b = i < before.length ? before[i] : undefined
    const a = i < after.length ? after[i] : undefined
    if (b === a) {
      out.push({ kind: 'ctx', text: b ?? '' })
    } else {
      if (b !== undefined) out.push({ kind: 'del', text: b })
      if (a !== undefined) out.push({ kind: 'add', text: a })
    }
  }
  return out
}

function formatBytes(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} MB`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)} KB`
  return `${n} B`
}
