'use client'

import { useCallback, useEffect, useState } from 'react'
import { GitBranch, Plus, RefreshCw, History, GitCommitHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { gitStatus, gitLog, gitStageAll, gitCommit, gitRoot, type GitStatus, type GitLog } from '@/lib/git'
import { EmptyState } from '@/components/ui/empty-state'
import { SkeletonBlock } from '@/components/ui/loading-state'

/**
 * SCM panel over real `git` (git_cmds.rs): branch + porcelain status rows,
 * stage-all + commit, and the recent commit log. Non-repo dirs show the
 * empty state honestly (no invented history).
 */
export function ScmPanel({ cwd }: { cwd: string | null }) {
  const [root, setRoot] = useState<string | null>(cwd)
  const [status, setStatus] = useState<GitStatus | null>(null)
  const [log, setLog] = useState<GitLog | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [committing, setCommitting] = useState(false)

  const refresh = useCallback(async (dir: string) => {
    setLoading(true)
    try {
      const r = await gitRoot(dir)
      if (!r.root) {
        setStatus(null)
        setLog(null)
        return
      }
      setRoot(r.root)
      const [s, l] = await Promise.all([gitStatus(r.root), gitLog(r.root, 15)])
      setStatus(s)
      setLog(l)
    } catch {
      setStatus(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (cwd) void refresh(cwd)
    else if (root) void refresh(root)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cwd])

  const commit = async () => {
    if (!root || !message.trim()) return
    setCommitting(true)
    try {
      await gitStageAll(root)
      await gitCommit(root, message.trim())
      setMessage('')
      await refresh(root)
    } finally {
      setCommitting(false)
    }
  }

  if (loading && !status) {
    return <div className="p-3"><SkeletonBlock lines={5} /></div>
  }

  if (!status) {
    return (
      <EmptyState
        icon={GitBranch}
        title="No git repository"
        description="Open a folder inside a git repo to see changes, staging and history."
      />
    )
  }

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-border px-3">
        <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <GitBranch className="h-3 w-3" /> {status.branch}
        </span>
        <button
          onClick={() => root && void refresh(root)}
          aria-label="Refresh git status"
          className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <RefreshCw className="h-3 w-3" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-1.5">
        {status.count === 0 ? (
          <div className="py-6 text-center text-[11px] text-muted-foreground">No changes</div>
        ) : (
          <div className="space-y-0.5">
            {status.rows.map((r) => (
              <div key={r.path} className="flex items-center gap-2 rounded px-1.5 py-0.5 text-[11px] hover:bg-accent/40">
                <span className={cn('w-5 shrink-0 font-mono text-[10px]', r.code.trim() === '??' ? 'text-sky-400' : r.code.startsWith('M') ? 'text-amber-400' : 'text-emerald-400')}>
                  {r.code.trim()}
                </span>
                <span className="truncate text-foreground">{r.path}</span>
              </div>
            ))}
          </div>
        )}

        <div className="mt-3 flex gap-1.5 border-t border-border pt-2">
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void commit()}
            placeholder="Commit message"
            aria-label="Commit message"
            className="h-7 min-w-0 flex-1 rounded border border-border bg-background px-2 text-[11px] focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
          <button
            onClick={() => void commit()}
            disabled={committing || !message.trim()}
            aria-label="Commit"
            className="flex h-7 items-center gap-1 rounded border border-primary/50 bg-primary/10 px-2 text-[10px] font-medium text-primary disabled:opacity-40"
          >
            <GitCommitHorizontal className="h-3 w-3" /> {committing ? '…' : 'Commit'}
          </button>
        </div>

        {log && log.commits.length > 0 && (
          <div className="mt-3 space-y-0.5 border-t border-border pt-2">
            <div className="mb-1 flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
              <History className="h-2.5 w-2.5" /> Recent
            </div>
            {log.commits.map((c) => (
              <div key={c.hash} className="flex items-center gap-2 rounded px-1.5 py-0.5 font-mono text-[10px] hover:bg-accent/40">
                <span className="text-orange-400/70">{c.hash.slice(0, 7)}</span>
                <span className="truncate text-muted-foreground">{c.message}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export { Plus }
