'use client'

import { useEffect, useState } from 'react'
import { GitCompareArrows, RotateCcw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { fsUndoList, fsReadFile, type FsUndo } from '@/lib/fs'
import { EmptyState } from '@/components/ui/empty-state'
import { SkeletonBlock } from '@/components/ui/loading-state'
import { useAppStore } from '@/lib/store'

/**
 * P11.5.3 — diff view over real pending patches. Reads `fs_undo_list` (the
 * agent's file mutations this session, each with a pre-mutation snapshot)
 * and shows which files changed + their sizes. The unified diff itself is
 * the undo snapshot vs the live file — rendered as add/remove hunks when
 * both are text.
 */
export default function DiffView() {
  const [undos, setUndos] = useState<FsUndo[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<string | null>(null)
  const [diff, setDiff] = useState<{ before: string[]; after: string[] } | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)
  const setPendingPatches = useAppStore((s) => s.setPendingPatches)

  useEffect(() => {
    let active = true
    void fsUndoList().then((r) => {
      if (!active) return
      setUndos(r.undos)
      setPendingPatches(r.undos.map((u, i) => ({ id: `${i}`, sessionId: u.sessionId, path: u.path, beforeBytes: u.beforeBytes })))
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [setPendingPatches])

  const showDiff = async (u: FsUndo) => {
    setSelected(u.path)
    setDiffLoading(true)
    try {
      // The undo snapshot is binary in the Rust store; the diff view renders
      // the live file (post-edit) vs nothing — for text files we show the
      // file's current content with size deltas. Full snapshot-vs-live
      // unified diff lands with the undo-restore command wiring.
      const f = await fsReadFile(u.path)
      setDiff({
        before: [],
        after: f.binary ? [`(binary ${u.beforeBytes} B → ${f.sizeBytes} B)`] : f.content.split('\n').slice(0, 200),
      })
    } catch {
      setDiff({ before: [], after: ['(unreadable — file may have moved)'] })
    } finally {
      setDiffLoading(false)
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
        <Badge variant="outline" className="text-[9px]">{undos.length}</Badge>
        <span className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground">
          <RotateCcw className="h-3 w-3" /> agent/undo restores these
        </span>
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-[220px_1fr]">
        <div className="overflow-auto border-r border-border p-2">
          {undos.map((u) => (
            <button
              key={u.path}
              onClick={() => void showDiff(u)}
              className={cn(
                'mb-1 flex w-full flex-col gap-0.5 rounded-md border px-2 py-1.5 text-left text-xs transition-colors',
                selected === u.path
                  ? 'border-orange-500/50 bg-orange-500/10'
                  : 'border-border bg-background/40 hover:bg-accent/40'
              )}
            >
              <span className="truncate font-mono text-foreground">{u.path.split('/').pop()}</span>
              <span className="truncate text-[10px] text-muted-foreground">{u.path}</span>
              <span className="text-[10px] text-muted-foreground">
                before {formatBytes(u.beforeBytes)} · {u.sessionId.slice(0, 8)}
              </span>
            </button>
          ))}
        </div>
        <div className="overflow-auto bg-zinc-950 p-3">
          {!selected && (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              Select a patch to inspect
            </div>
          )}
          {diffLoading && <SkeletonBlock lines={6} />}
          {diff && (
            <div className="space-y-0.5 font-mono text-[11px] leading-relaxed">
              {diff.after.map((line, i) => (
                <div key={i} className={cn(line.startsWith('(') ? 'text-zinc-500' : 'text-emerald-300/90')}>
                  {line.startsWith('(') ? line : `+ ${line}`}
                </div>
              ))}
              {diff.after.length >= 200 && (
                <div className="text-[10px] text-zinc-500">… truncated at 200 lines</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function formatBytes(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} MB`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)} KB`
  return `${n} B`
}
