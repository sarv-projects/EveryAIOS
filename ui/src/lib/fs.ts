// P11.5.3 — real-filesystem bridge (folder view / code view / diff view).
// Every call talks to `std::fs` through the Tauri commands in fs_cmds.rs;
// in a plain-browser preview the calls fall back to a small demo tree so the
// views stay explorable.

import { invoke, inTauri } from './tauri'
import { nativeCall } from './runtime'

export interface FsEntry {
  name: string
  dir: boolean
  symlink: boolean
  size: number | null
  modified: string | null
}

export interface FsList {
  path: string
  parent: string | null
  entries: FsEntry[]
}

export interface FsRead {
  path: string
  name: string
  content: string
  sizeBytes: number
  truncated: boolean
  binary: boolean
}

export interface FsUndo {
  index: number
  sessionId: string
  path: string
  beforeBytes: number
}

/** P52.17 — a pending snapshot's content (text) or binary marker. */
export interface FsUndoSnapshot {
  found: boolean
  path?: string
  binary?: boolean
  bytes?: number
  /** True when the snapshot was a file creation (restore = delete). */
  created?: boolean
  content?: string | null
}

export async function fsHome(): Promise<string> {
  if (!inTauri()) return '/'
  return nativeCall('filesystem home', () => invoke<string>('fs_home'))
}

export async function fsListDir(path: string): Promise<FsList> {
  if (!inTauri()) return demoList(path)
  return nativeCall('filesystem list', () => invoke<FsList>('fs_list_dir', { path }))
}

export async function fsReadFile(path: string): Promise<FsRead> {
  if (!inTauri()) {
    return { path, name: path.split('/').pop() ?? path, content: '', sizeBytes: 0, truncated: false, binary: false }
  }
  return nativeCall('filesystem read', () => invoke<FsRead>('fs_read_file', { path }))
}

export async function fsWriteFile(path: string, content: string): Promise<{ path: string; bytes: number }> {
  return nativeCall('filesystem write', () => invoke('fs_write_file', { path, content }))
}

/** P41.3 — ticketed editor write, request half: a Guard-2 ticket (diff card)
 * for a buffer write. `action: allow` = policy auto-approved; `ask` = the
 * card awaits the human. The write happens only via `fsWriteCommit`. */
export async function fsWriteTicket(
  path: string,
  content: string,
): Promise<{
  action: 'allow' | 'ask'
  ticketId: string
  approvalNonce: string
  preview: { before: string; after: string }
}> {
  return nativeCall('filesystem write ticket', () => invoke('fs_write_ticket', { path, content }))
}

/** P41.3 — ticketed editor write, executor half: consumes the mandatory
 * single-use ticket, then writes. No ticket, no write — no silent autosaves
 * into the workspace. */
export async function fsWriteCommit(
  path: string,
  content: string,
  ticketId: string,
): Promise<{ path: string; bytes: number }> {
  return nativeCall('filesystem write commit', () => invoke('fs_write_commit', { path, content, ticketId }))
}

export async function fsUndoList(): Promise<{ undos: FsUndo[]; count: number }> {
  if (!inTauri()) {
    return { undos: [], count: 0 }
  }
  return nativeCall('filesystem undo list', () => invoke('fs_undo_list'))
}

/** P52.17 — restore one file to its pre-mutation snapshot (human-gesture
 * audited in Rust). Outside the shell this is refused — a restore is a real
 * disk write and never happens in the browser preview. */
export async function fsUndoRestore(path: string): Promise<{ ok: boolean; auditSeq: number }> {
  if (!inTauri()) {
    return Promise.reject(new Error('Restore is a shell capability'))
  }
  return nativeCall('filesystem undo restore', () => invoke('fs_undo_restore', { path }))
}

/** P52.17 — read a pending snapshot's content for a true before/after diff.
 * Returns `{found:false}` outside the shell (no preview data invented). */
export async function fsUndoSnapshot(path: string): Promise<FsUndoSnapshot> {
  if (!inTauri()) {
    return { found: false }
  }
  return nativeCall('filesystem undo snapshot', () => invoke('fs_undo_snapshot', { path }))
}

// Demo fallback — a small realistic tree (preview only; the Tauri path is real).
const DEMO: FsEntry[] = [
  { name: 'src', dir: true, symlink: false, size: null, modified: null },
  { name: 'docs', dir: true, symlink: false, size: null, modified: null },
  { name: 'Q3-Financials.xlsx', dir: false, symlink: false, size: 2_204_160, modified: null },
  { name: 'exec-summary.docx', dir: false, symlink: false, size: 421_888, modified: null },
  { name: 'pitch.pptx', dir: false, symlink: false, size: 8_808_038, modified: null },
]

function demoList(path: string): FsList {
  const parent = path === '/' ? null : path.split('/').slice(0, -1).join('/') || '/'
  return { path, parent, entries: DEMO }
}
