'use client'

import * as React from 'react'
import { History, Loader2, RotateCcw, ShieldAlert, ShieldCheck, TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
import { inTauri } from '@/lib/tauri'
import { fsUndoList, type FsUndo } from '@/lib/fs'
import { guardPolicy, openGuardWindow } from '@/lib/guard'
import { useAppStore } from '@/lib/store'
import {
  needsGuardApproval,
  restoreCheckpointPaths,
  restoreFullyAudited,
  shortPath,
  snapshotsForSession,
  type PreflightKind,
  type RestoreResult,
} from '@/lib/checkpoints'

type LoadState = 'loading' | 'ready' | 'empty' | 'error' | 'unavailable'

interface TurnCheckpointProps {
  sessionId: string
  messageId: string
  timestamp: string
  summary: string
  turnIndex: number
  /** Eager file list from the parent's single `fs_undo_list` (timeline). */
  files?: FsUndo[]
  /** Eager load state matching `files` (timeline). Omit for lazy mode. */
  loadState?: LoadState
  loadError?: string
  /**
   * P64.6/P64.7 — shadow-preflight evidence for this turn, when any tool
   * result carried a verdict. Rendered as an honest badge on the row.
   */
  preflight?: PreflightKind
  preflightNote?: string
  onRestored?: () => void
}

/**
 * P64.7 — one auto-checkpoint row for a mutating turn.
 *
 * The checkpoint itself is derived from the real transcript (this turn ran a
 * mutating tool). The restorable content is the shell's real per-file
 * pre-mutation snapshots (`fs_undo_*`) — one snapshot per file per session,
 * so every turn in the same session restores the same saved file set. The
 * copy says exactly that; per-step precision is never claimed.
 *
 * Truthful states: loading (fixed-height skeleton, CLS=0), empty, error with
 * retry, unavailable outside the shell. Restore is two-step confirmed,
 * reports per-file outcomes, and never claims success the shell did not
 * confirm. Guard-2: an engaged safety stop blocks restore; ticket/approval
 * failures offer the Guard window.
 */
export function TurnCheckpoint({
  sessionId,
  messageId,
  timestamp,
  summary,
  turnIndex,
  files: eagerFiles,
  loadState: eagerState,
  loadError: eagerError,
  preflight,
  preflightNote,
  onRestored,
}: TurnCheckpointProps) {
  const eager = eagerFiles !== undefined || eagerState !== undefined
  const [expanded, setExpanded] = React.useState(eager)
  const [state, setState] = React.useState<LoadState>(() =>
    eager ? (eagerState ?? 'loading') : 'loading',
  )
  const [files, setFiles] = React.useState<FsUndo[]>(() => eagerFiles ?? [])
  const [error, setError] = React.useState<string>(eagerError ?? '')
  const [confirmOpen, setConfirmOpen] = React.useState(false)
  const [restoring, setRestoring] = React.useState(false)
  const [result, setResult] = React.useState<RestoreResult | null>(null)
  const [guardNote, setGuardNote] = React.useState<string | null>(null)
  const [approvalNeeded, setApprovalNeeded] = React.useState(false)
  const confirmBtnRef = React.useRef<HTMLButtonElement>(null)
  const triggerBtnRef = React.useRef<HTMLButtonElement>(null)

  // Keep eager props in sync when the parent reloads (post-restore refresh).
  React.useEffect(() => {
    if (!eager) return
    setState(eagerState ?? 'loading')
    setFiles(eagerFiles ?? [])
    setError(eagerError ?? '')
    if ((eagerState ?? 'loading') !== 'loading') {
      setResult(null)
      setConfirmOpen(false)
      setApprovalNeeded(false)
      setGuardNote(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eagerState, eagerError, eagerFiles?.length, eagerFiles?.map((f) => f.path).join('|')])

  const load = React.useCallback(async () => {
    if (!inTauri()) {
      setState('unavailable')
      setFiles([])
      return
    }
    setState('loading')
    setError('')
    try {
      const r = await fsUndoList()
      const mine = snapshotsForSession(r.undos ?? [], sessionId)
      setFiles(mine)
      setState(mine.length === 0 ? 'empty' : 'ready')
    } catch (e) {
      setState('error')
      setError(e instanceof Error ? e.message : 'Could not read saved checkpoints.')
    }
  }, [sessionId])

  // Lazy mode loads on first expand; eager mode was fed by the parent.
  React.useEffect(() => {
    if (eager) return
    if (!expanded) return
    if (state !== 'loading') return
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, eager])

  // Focus the confirm action when the confirm panel opens; Escape closes it.
  React.useEffect(() => {
    if (!confirmOpen) return
    confirmBtnRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setConfirmOpen(false)
        triggerBtnRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [confirmOpen])

  const timeLabel = React.useMemo(() => {
    try {
      return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } catch {
      return ''
    }
  }, [timestamp])

  async function doRestore() {
    if (restoring || files.length === 0) return
    setRestoring(true)
    setResult(null)
    setGuardNote(null)
    setApprovalNeeded(false)
    // Guard-2: an engaged safety stop blocks mutating restores. Read the live
    // policy best-effort; a policy read failure does not block the restore —
    // the shell remains the enforcer and its rejection is surfaced below.
    try {
      const policy = await guardPolicy()
      if (policy?.estopPulled) {
        setGuardNote('Safety stop is on — release it in Guard before restoring files.')
        setRestoring(false)
        return
      }
    } catch {
      /* policy unreadable — let the shell decide and report honestly */
    }
    const paths = files.map((f) => f.path)
    try {
      const r = await restoreCheckpointPaths(paths)
      setResult(r)
      const failedApproval = r.failed.some((f) => needsGuardApproval(f.error))
      setApprovalNeeded(failedApproval)
      if (r.restored.length > 0) {
        // Keep the global pending-patch banner truthful after a restore.
        try {
          const fresh = await fsUndoList()
          useAppStore
            .getState()
            .setPendingPatches(
              (fresh.undos ?? []).map((u) => ({
                id: `${u.index}`,
                sessionId: u.sessionId,
                path: u.path,
                beforeBytes: u.beforeBytes,
              })),
            )
        } catch {
          /* banner refresh is best-effort; the result above is authoritative */
        }
        onRestored?.()
      }
      if (r.failed.length === 0) setConfirmOpen(false)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Restore failed.'
      setResult({ restored: [], failed: paths.map((path) => ({ path, error: msg })), receipts: [] })
      setApprovalNeeded(needsGuardApproval(msg))
    } finally {
      setRestoring(false)
    }
  }

  const shellUnavailable = state === 'unavailable'

  return (
    <div
      data-turn-checkpoint={messageId}
      className="min-h-[44px] rounded-lg border border-border bg-card/50 px-2.5 py-2"
    >
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
          <History className="h-3 w-3" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <span className="text-[11px] font-medium text-foreground">
              Checkpoint · turn {turnIndex}
            </span>
            {timeLabel && (
              <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                {timeLabel}
              </span>
            )}
            {/* P64.6/P64.7 — shadow-preflight evidence, shown only when a
                verdict actually exists. Never a pass that did not happen. */}
            {preflight === 'preflighted' && (
              <span
                title={preflightNote ?? 'Shadow preflight passed before this edit landed'}
                className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-px font-mono text-[9px] text-emerald-400"
              >
                <ShieldCheck className="h-2.5 w-2.5" aria-hidden />
                preflighted
              </span>
            )}
            {preflight === 'failed' && (
              <span
                title={preflightNote ?? 'Shadow preflight failed but the edit landed'}
                className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-rose-500/30 bg-rose-500/10 px-1.5 py-px font-mono text-[9px] text-rose-400"
              >
                <ShieldAlert className="h-2.5 w-2.5" aria-hidden />
                preflight failed
              </span>
            )}
            {preflight === 'unverified' && (
              <span
                title={preflightNote ?? 'Shadow preflight could not run — no evidence'}
                className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-border bg-muted/40 px-1.5 py-px font-mono text-[9px] text-muted-foreground"
              >
                <ShieldAlert className="h-2.5 w-2.5" aria-hidden />
                unverified
              </span>
            )}
          </div>
          <p className="truncate text-[10px] text-muted-foreground" title={summary}>
            Saved before this turn changed files — {summary}
          </p>
        </div>
        {!eager && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-controls={`ckpt-${messageId}`}
            className="shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            {expanded ? 'Hide' : 'Details'}
          </button>
        )}
      </div>

      {expanded && (
        <div id={`ckpt-${messageId}`} className="mt-1.5 border-t border-border/60 pt-1.5">
          {state === 'loading' && (
            <div className="space-y-1.5 py-1" aria-hidden="true">
              <div className="shimmer h-2.5 rounded" style={{ width: '72%' }} />
              <div className="shimmer h-2.5 rounded" style={{ width: '48%' }} />
              <p className="sr-only" role="status">
                Reading saved checkpoints…
              </p>
            </div>
          )}

          {shellUnavailable && (
            <p className="py-1 text-[11px] leading-relaxed text-muted-foreground" role="status">
              Restore needs the desktop app — open this session in Tauri to restore saved files.
            </p>
          )}

          {state === 'empty' && (
            <p className="py-1 text-[11px] leading-relaxed text-muted-foreground" role="status">
              No saved files for this step — the turn only read, or its snapshot was already
              restored.
            </p>
          )}

          {state === 'error' && (
            <div className="flex items-start gap-1.5 py-1" role="alert">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-400" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-rose-200">Could not read checkpoints.</p>
                {error && (
                  <p className="mt-0.5 break-words font-mono text-[10px] text-muted-foreground">
                    {error}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => void (eager ? onRestored?.() : load())}
                  className="mt-1 rounded border border-border px-1.5 py-0.5 text-[10px] text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                >
                  Try again
                </button>
              </div>
            </div>
          )}

          {state === 'ready' && (
            <>
              <ul className="space-y-0.5">
                {files.slice(0, 6).map((f) => (
                  <li
                    key={`${f.sessionId}-${f.path}`}
                    className="flex items-center gap-1.5 font-mono text-[10px]"
                  >
                    <span className="h-1 w-1 shrink-0 rounded-full bg-primary/70" aria-hidden />
                    <span className="truncate text-foreground/90" title={f.path}>
                      {shortPath(f.path)}
                    </span>
                    <span className="shrink-0 text-muted-foreground/70">
                      {f.beforeBytes === 0 ? 'new file' : 'saved copy kept'}
                    </span>
                  </li>
                ))}
              </ul>
              {files.length > 6 && (
                <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                  +{files.length - 6} more file{files.length - 6 === 1 ? '' : 's'}
                </p>
              )}
              <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                The shell keeps one saved copy per file for this session — restoring writes
                those copies back.
              </p>

              {!confirmOpen ? (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <button
                    ref={triggerBtnRef}
                    type="button"
                    disabled={restoring || shellUnavailable}
                    onClick={() => {
                      setResult(null)
                      setConfirmOpen(true)
                    }}
                    aria-label={`Restore to this step, ${files.length} file${files.length === 1 ? '' : 's'}`}
                    className="inline-flex h-6 items-center gap-1 rounded bg-primary px-2 text-[10px] font-medium text-primary-foreground transition-colors hover:opacity-90 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background"
                  >
                    <RotateCcw className="h-2.5 w-2.5" aria-hidden />
                    Restore to this step
                  </button>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {files.length} file{files.length === 1 ? '' : 's'}
                  </span>
                </div>
              ) : (
                <div
                  role="dialog"
                  aria-label="Confirm restore to this step"
                  className="mt-1.5 rounded-md border border-primary/30 bg-primary/5 px-2 py-1.5"
                >
                  <p className="text-[11px] font-medium text-foreground">
                    Restore {files.length} file{files.length === 1 ? '' : 's'} to the saved copy?
                  </p>
                  <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
                    Later changes to these files are lost. This cannot be undone automatically.
                  </p>
                  {guardNote && (
                    <p className="mt-1 flex items-start gap-1 text-[10px] text-warning" role="alert">
                      <ShieldAlert className="mt-px h-3 w-3 shrink-0" aria-hidden />
                      {guardNote}
                    </p>
                  )}
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <button
                      ref={confirmBtnRef}
                      type="button"
                      disabled={restoring}
                      onClick={() => void doRestore()}
                      className="inline-flex h-6 items-center gap-1 rounded bg-primary px-2 text-[10px] font-medium text-primary-foreground transition-colors hover:opacity-90 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background"
                    >
                      {restoring && <Loader2 className="h-2.5 w-2.5 animate-spin" aria-hidden />}
                      {restoring
                        ? 'Restoring…'
                        : `Restore ${files.length} file${files.length === 1 ? '' : 's'}`}
                    </button>
                    <button
                      type="button"
                      disabled={restoring}
                      onClick={() => {
                        setConfirmOpen(false)
                        triggerBtnRef.current?.focus()
                      }}
                      className="h-6 rounded px-2 text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                    >
                      Keep current files
                    </button>
                  </div>
                </div>
              )}

              {result && (
                <div
                  role="status"
                  aria-live="polite"
                  className={cn(
                    'mt-1.5 rounded-md border px-2 py-1.5 text-[10px] leading-relaxed',
                    result.failed.length === 0
                      ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-100/90'
                      : result.restored.length === 0
                        ? 'border-rose-500/30 bg-rose-500/5 text-rose-100/90'
                        : 'border-warning/30 bg-warning/5 text-warning/90',
                  )}
                >
                  {result.failed.length === 0 ? (
                    <p>
                      Restored {result.restored.length} of {result.restored.length} file
                      {result.restored.length === 1 ? '' : 's'} from the saved copy.
                    </p>
                  ) : result.restored.length === 0 ? (
                    <p>Restore did not complete — no files were changed.</p>
                  ) : (
                    <p>
                      Restored {result.restored.length} of{' '}
                      {result.restored.length + result.failed.length} files —{' '}
                      {result.failed.length} still need attention.
                    </p>
                  )}
                  {/* P64.7 — the shell audits a restore as a human-gesture
                      receipt. Show the sequence when present; a restore with
                      no receipt is reported as unverified, never as audited. */}
                  {result.restored.length > 0 && (
                    <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                      {restoreFullyAudited(result)
                        ? `Audited rollback · receipt${result.receipts.length === 1 ? '' : 's'} #${result.receipts
                            .map((r) => r.auditSeq)
                            .join(', #')}`
                        : 'Restored without an audit receipt — verify in Guard.'}
                    </p>
                  )}
                  {result.failed.length > 0 && (
                    <ul className="mt-1 space-y-0.5">
                      {result.failed.slice(0, 4).map((f) => (
                        <li key={f.path} className="break-words font-mono text-[10px]">
                          <span className="text-foreground/90">{shortPath(f.path)}</span>
                          <span className="text-muted-foreground"> — {f.error}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {approvalNeeded && (
                    <button
                      type="button"
                      onClick={() => void openGuardWindow()}
                      className="mt-1 inline-flex h-6 items-center gap-1 rounded border border-warning/40 bg-warning/10 px-2 text-[10px] text-warning transition-colors hover:bg-warning/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                    >
                      <ShieldAlert className="h-2.5 w-2.5" aria-hidden />
                      Open Guard to approve
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
