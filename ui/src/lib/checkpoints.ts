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

/** A mutating turn derived from the real transcript (never seeded). */
export interface CheckpointTurn {
  messageId: string
  timestamp: string
  /** Short plain summary, e.g. "Edited 2 files · ran shell". */
  summary: string
  toolIds: string[]
  /** Zero-based index of the assistant message among assistant turns. */
  turnIndex: number
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
    out.push({
      messageId: m.id,
      timestamp: m.timestamp,
      summary: checkpointSummary(m),
      toolIds: [...new Set((m.toolCalls ?? []).filter(isMutatingToolCall).map((t) => t.toolId))].slice(0, 4),
      turnIndex: turn,
    })
  }
  return out
}

/** Per-file restore outcome — partial success is reported, never rounded up. */
export interface RestoreResult {
  restored: string[]
  failed: { path: string; error: string }[]
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
    return Promise.reject(new Error('Restore needs the desktop app — open this session in Tauri to restore.'))
  }
  const restored: string[] = []
  const failed: { path: string; error: string }[] = []
  for (const path of paths) {
    try {
      const res = await fsUndoRestore(path)
      if (res?.ok) restored.push(path)
      else failed.push({ path, error: 'The shell did not confirm the restore.' })
    } catch (e) {
      failed.push({ path, error: e instanceof Error ? e.message : 'Restore failed.' })
    }
  }
  return { restored, failed }
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
