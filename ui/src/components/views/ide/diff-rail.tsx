'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, FileDiff, ShieldCheck, XCircle, HelpCircle } from 'lucide-react'
import { useAppStore, type VerificationRecord } from '@/lib/store'
import { guardReceipts, type GuardReceipt } from '@/lib/guard'
import { fsUndoList, type FsUndo } from '@/lib/fs'
import { cn } from '@/lib/utils'

/**
 * P41.4 — Receipts-in-editor: the Diff rail. Renders the three honest rails
 * inline in the IDE's bottom panel:
 * 1. Pending workspace changes (the real patch set, `fs_undo_list`).
 * 2. Guard-2 approve/reject receipts (the ticket trail, `guard_receipts`).
 * 3. K1 verification receipts (pass/fail per plan-task check + exact report,
 *    `chat/verification`) — model-reported, never claimed as executed.
 *
 * The rail owns no model (I12 "any-brain"): F12/ACP harnesses + the composer
 * compose it; this component only renders what the executor already emitted.
 */

function VerdictIcon({ passed }: { passed: boolean | null }) {
  if (passed === true) return <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-400" />
  if (passed === false) return <XCircle className="h-3 w-3 shrink-0 text-rose-400" />
  return <HelpCircle className="h-3 w-3 shrink-0 text-amber-400" />
}

function VerificationRow({ v }: { v: VerificationRecord }) {
  return (
    <div className="flex items-start gap-2 rounded border border-[#333] bg-[#252526] px-2 py-1.5">
      <VerdictIcon passed={v.passed} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 font-mono text-[10px]">
          <span className="text-[#d4d4d4]">task {v.taskId || '—'}</span>
          <span
            className={cn(
              'text-[9px]',
              v.passed === true ? 'text-emerald-400' : v.passed === false ? 'text-rose-400' : 'text-amber-400',
            )}
          >
            {v.passed === true ? 'verified' : v.passed === false ? 'failed' : 'ambiguous'}
          </span>
        </div>
        <div className="mt-0.5 flex flex-wrap gap-1">
          {v.checks.map((c, i) => (
            <span key={i} className="rounded bg-[#333] px-1 font-mono text-[9px] text-[#9d9d9d]">
              {c}
            </span>
          ))}
        </div>
        {v.report && (
          <div className="mt-1 whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-[#b5b5b5]">
            {v.report.slice(0, 400)}
          </div>
        )}
      </div>
    </div>
  )
}

export function DiffRail() {
  const verifications = useAppStore((s) => s.verifications)
  const [receipts, setReceipts] = useState<GuardReceipt[]>([])
  const [undos, setUndos] = useState<FsUndo[]>([])

  useEffect(() => {
    let alive = true
    const refresh = async () => {
      try {
        const [r, u] = await Promise.all([guardReceipts(), fsUndoList()])
        if (!alive) return
        setReceipts(r.slice(0, 20))
        setUndos(u.undos.slice(0, 20))
      } catch {
        /* rail stays empty outside Tauri */
      }
    }
    void refresh()
    const timer = setInterval(refresh, 5000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [])

  const latest = verifications.slice(-8).reverse()

  return (
    <div className="scroll-thin h-full overflow-auto p-2">
      {/* K1 verification rail */}
      <div className="mb-2 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-[#858585]">
        <CheckCircle2 className="h-3 w-3" /> K1 verification
        <span className="normal-case text-[#666]">— model-reported, never claimed as executed</span>
      </div>
      {latest.length === 0 ? (
        <div className="mb-3 rounded border border-dashed border-[#333] px-2 py-1.5 text-[10px] text-[#666]">
          No verification receipts yet — plan-executor verify checks land here.
        </div>
      ) : (
        <div className="mb-3 space-y-1.5">{latest.map((v, i) => <VerificationRow key={i} v={v} />)}</div>
      )}

      {/* Receipt trail */}
      <div className="mb-2 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-[#858585]">
        <ShieldCheck className="h-3 w-3" /> Guard-2 receipts
      </div>
      {receipts.length === 0 ? (
        <div className="mb-3 rounded border border-dashed border-[#333] px-2 py-1.5 text-[10px] text-[#666]">
          No Guard-2 receipts yet.
        </div>
      ) : (
        <div className="mb-3 space-y-1">
          {receipts.map((r) => (
            <div key={r.receiptId} className="flex items-center gap-2 rounded border border-[#333] bg-[#252526] px-2 py-1 font-mono text-[10px]">
              {r.action === 'approve' ? (
                <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-400" />
              ) : (
                <XCircle className="h-3 w-3 shrink-0 text-rose-400" />
              )}
              <span className="truncate text-[#d4d4d4]">{r.operation || r.toolId}</span>
              <span className="text-[#666]">#{r.ticketId.slice(0, 8)}</span>
              <span className="ml-auto shrink-0 text-[#666]">{r.hash.slice(0, 8)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Pending workspace changes */}
      <div className="mb-2 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-[#858585]">
        <FileDiff className="h-3 w-3" /> Pending changes
      </div>
      {undos.length === 0 ? (
        <div className="rounded border border-dashed border-[#333] px-2 py-1.5 text-[10px] text-[#666]">
          No pending workspace changes this session.
        </div>
      ) : (
        <div className="space-y-1">
          {undos.map((u, i) => (
            <div key={i} className="flex items-center gap-2 rounded border border-[#333] bg-[#252526] px-2 py-1 font-mono text-[10px]">
              <FileDiff className="h-3 w-3 shrink-0 text-orange-400" />
              <span className="truncate text-[#d4d4d4]">{u.path}</span>
              <span className="ml-auto shrink-0 text-[#666]">
                {u.beforeBytes !== undefined && u.beforeBytes !== null ? `${u.beforeBytes} B` : ''}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
