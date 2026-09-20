// P64.7 — checkpoint / rollback helpers (UI-only).
//
// The shell keeps one pre-mutation snapshot per file (`fs_undo_*`); the chat
// transcript records which turns mutated. This module derives per-turn
// checkpoints from real transcript data and restores through the existing
// Rust commands only (`fs_undo_restore`). No new Rust commands, no invented
// snapshot ids, no fake success.

import { inTauri } from './tauri'
import { fsUndoRestore, type FsUndo } from './fs'
import type { ChatMessage, ProgressStep, ToolCallRecord } from './store'

/** P64.6/P64.7 — the shadow-preflight evidence surfaced on a checkpoint row. */
export type PreflightKind = 'preflighted' | 'failed' | 'unverified'

/** A mutating turn derived from the real transcript (never seeded). */
export interface CheckpointTurn {
  messageId: string
  timestamp: string
  /** Short plain summary, e.g. "Edited 2 files · ran shell". */
  summary: string
  toolIds: string[]
  /** Zero-based index of the assistant message among assistant turns. */
  turnIndex: number
  /**
   * P64.6/P64.7 — the strongest shadow-preflight evidence among this turn's
   * edit results: `preflighted` beats `unverified`; a `failed` verdict on a
   * landed edit wins outright (the discrepancy the row must show). Undefined
   * when no tool result carried a verdict.
   */
  preflight?: PreflightKind
  preflightNote?: string
}

const MUTATING_STEP_TYPES: ReadonlySet<ProgressStep['type']> = new Set([
  'edit',
  'shell',
  'office',
  'export',
  'code',
  'file',
])

/**
 * P64.6/P64.7 — plain-English shadow-preflight note for a tool result, or
 * undefined when this edit carried no preflight evidence. Three honest
 * states, never rounded up:
 *  - `preflighted`: the shadow check ran and passed (Rust recorded a
 *    `shadow_preflight` receipt the rollback path trusts);
 *  - `failed`: the check ran and failed — but the edit landed anyway, which
 *    means a later non-gated write or retry bypassed the gate; that is a
 *    discrepancy, so the row says so and restore is the remedy;
 *  - `unverified`: the gate did not fire or the check could not run —
 *    no evidence either way, never rendered as a pass.
 * Reads only these four fields; the payload may carry extra keys safely.
 */
export function preflightOutcome(result: unknown):
  | { kind: 'preflighted' | 'failed' | 'unverified'; note: string }
  | undefined {
  if (result === null || typeof result !== 'object') return undefined
  const r = result as Record<string, unknown>
  const p = r.preflight
  if (p === null || typeof p !== 'object') return undefined
  const pf = p as Record<string, unknown>
  const verified = pf.verified === true
  const passed = pf.passed === true
  if (!verified) {
    return { kind: 'unverified', note: 'Shadow preflight could not run — no evidence' }
  }
  if (passed) return { kind: 'preflighted', note: 'Shadow preflight passed before this edit landed' }
  return {
    kind: 'failed',
    note: 'Shadow preflight failed but the edit landed — restoring is the remedy',
  }
}

/**
 * Whether a tool id performs a mutation. Matches the ids the harness sells
 * (`fs.write`, `shell`, `office.*`, `code.*`, `git.*`, `apply_patch`, …).
 * Reads (`fs.read`, `office.read`, `search`, `memory.read`) are not mutating.
 */
export function isMutatingToolId(toolId: string): boolean {
  const id = toolId.trim().toLowerCase()
  if (!id) return false
  if (id === 'fs.read' || id === 'office.read' || id === 'memory.read') return false
  if (/(^|\.)read($|[^a-z])/i.test(toolId) && !/write|edit/i.test(toolId)) {
    // Generic "*.read" tools are reads; anything mentioning write/edit wins.
    if (!/write|edit|delete|exec|apply|patch/i.test(toolId)) return false
  }
  return (
    id.startsWith('fs.write') ||
    id.startsWith('fs.delete') ||
    id.startsWith('fs.move') ||
    id.startsWith('fs.copy') ||
    id === 'shell' ||
    id.startsWith('shell') ||
    id.startsWith('office.') ||
    id.startsWith('code.') ||
    id.startsWith('git.') ||
    id.startsWith('terminal') ||
    id.startsWith('worktree') ||
    id.startsWith('pty') ||
    id === 'apply_patch' ||
    /write|edit|delete|remove|create|mkdir|move|copy|exec|apply|patch|commit|merge|save/i.test(toolId)
  )
}

/** Whether a finished tool call actually changed something. */
export function isMutatingToolCall(t: Pick<ToolCallRecord, 'toolId' | 'status'>): boolean {
  if (t.status !== 'done') return false
  return isMutatingToolId(t.toolId)
}

/** Whether a progress step represents a completed mutation. */
export function isMutatingStep(s: Pick<ProgressStep, 'type' | 'status'>): boolean {
  if (s.status !== 'done' && s.status !== 'active') return false
  return MUTATING_STEP_TYPES.has(s.type)
}

/** Whether an assistant message performed a mutation worth checkpointing. */
export function isMutatingMessage(m: Pick<ChatMessage, 'role' | 'toolCalls' | 'steps'>): boolean {
  if (m.role !== 'assistant') return false
  if ((m.toolCalls ?? []).some(isMutatingToolCall)) return true
  if ((m.steps ?? []).some(isMutatingStep)) return true
  return false
}

/** Plain summary for a checkpoint row (no invented file names). */
export function checkpointSummary(m: Pick<ChatMessage, 'toolCalls' | 'steps'>): string {
  const tools = (m.toolCalls ?? []).filter(isMutatingToolCall)
  const steps = (m.steps ?? []).filter(isMutatingStep)
  const parts: string[] = []
  if (tools.length > 0) {
    const names = [...new Set(tools.map((t) => t.toolId))].slice(0, 3)
    parts.push(`${tools.length} change${tools.length === 1 ? '' : 's'} (${names.join(', ')})`)
  }
  if (steps.length > 0 && tools.length === 0) {
    parts.push(`${steps.length} file step${steps.length === 1 ? '' : 's'}`)
  }
  return parts.join(' · ') || 'Changed files'
}

/**
 * P64.6/P64.7 — strongest shadow-preflight evidence among a turn's results,
 * ranked `failed` > `preflighted` > `unverified` (a failing verdict on a
 * landed edit is the discrepancy the checkpoint row must not hide).
 */
function strongestPreflight(
  results: unknown[],
): { kind: PreflightKind; note: string } | undefined {
  let best: { rank: number; kind: PreflightKind; note: string } | undefined
  for (const r of results) {
    const out = preflightOutcome(r)
    if (!out) continue
    const rank = out.kind === 'failed' ? 2 : out.kind === 'preflighted' ? 1 : 0
    if (best === undefined || rank > best.rank) {
      best = { rank, kind: out.kind, note: out.note }
    }
  }
  return best && { kind: best.kind, note: best.note }
}

/**
 * Derive one checkpoint per mutating assistant turn, in transcript order.
 * Pure — safe to call during render via useMemo.
 */
export function deriveCheckpointTurns(messages: ChatMessage[]): CheckpointTurn[] {
  const out: CheckpointTurn[] = []
  let turn = 0
  for (const m of messages) {
    if (m.role !== 'assistant') continue
    turn += 1
    if (!isMutatingMessage(m)) continue
    const pf = strongestPreflight((m.toolCalls ?? []).filter(isMutatingToolCall).map((t) => t.result))
    out.push({
      messageId: m.id,
      timestamp: m.timestamp,
      summary: checkpointSummary(m),
      toolIds: [...new Set((m.toolCalls ?? []).filter(isMutatingToolCall).map((t) => t.toolId))].slice(0, 4),
      turnIndex: turn,
      ...(pf ? { preflight: pf.kind, preflightNote: pf.note } : {}),
    })
  }
  return out
}

/** Per-file restore outcome — partial success is reported, never rounded up. */
export interface RestoreResult {
  restored: string[]
  failed: { path: string; error: string }[]
  /**
   * P64.7 — the shell's audit sequence for each restored file. A restore is a
   * real disk write the Rust side records as a human-gesture receipt; keeping
   * the sequence lets the UI verify the rollback was audited rather than only
   * asserting the write returned `ok`.
   */
  receipts: RestoreReceipt[]
}

/** P64.7 — one restored file's audit receipt (path → shell audit sequence). */
export interface RestoreReceipt {
  path: string
  auditSeq: number
}

/**
 * Restore every path through the existing `fs_undo_restore` command.
 * Resolves with per-file outcomes; rejects only when there is nothing to
 * attempt (empty list or no shell). Never reports success for a file the
 * shell did not confirm.
 */
export async function restoreCheckpointPaths(paths: string[]): Promise<RestoreResult> {
  if (paths.length === 0) {
    return Promise.reject(new Error('Nothing to restore — no saved files for this step.'))
  }
  if (!inTauri()) {
    return Promise.reject(new Error('Restore needs the desktop app — open this chat in Tauri to restore.'))
  }
  const restored: string[] = []
  const failed: { path: string; error: string }[] = []
  const receipts: RestoreReceipt[] = []
  for (const path of paths) {
    try {
      const res = await fsUndoRestore(path)
      if (res?.ok) {
        restored.push(path)
        receipts.push({ path, auditSeq: typeof res.auditSeq === 'number' ? res.auditSeq : 0 })
      } else {
        failed.push({ path, error: 'The shell did not confirm the restore.' })
      }
    } catch (e) {
      failed.push({ path, error: e instanceof Error ? e.message : 'Restore failed.' })
    }
  }
  return { restored, failed, receipts }
}

/**
 * P64.7 — whether every restored file carried a positive audit sequence.
 * A restore that landed but produced no audit receipt is reported honestly as
 * unverified (never rounded up to "audited"); with nothing restored this is
 * false.
 */
export function restoreFullyAudited(result: Pick<RestoreResult, 'restored' | 'receipts'>): boolean {
  if (result.restored.length === 0) return false
  return result.receipts.length === result.restored.length && result.receipts.every((r) => r.auditSeq > 0)
}

/** Whether a restore failure looks like it needs a Guard-2 decision. */
export function needsGuardApproval(message: string): boolean {
  return /ticket|approval|guard|estop|policy|denied|forbidden|unauthori[sz]ed/i.test(message)
}

/** Keep only snapshots belonging to this session, newest first by index. */
export function snapshotsForSession(undos: FsUndo[], sessionId: string): FsUndo[] {
  return undos
    .filter((u) => u.sessionId === sessionId)
    .slice()
    .sort((a, b) => b.index - a.index)
}

export function shortPath(path: string): string {
  const base = path.split('/').pop() ?? path
  return base || path
}
