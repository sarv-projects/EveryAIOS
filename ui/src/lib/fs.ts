// P11.5.3 — real-filesystem bridge (folder view / code view / diff view).
// Every call talks to `std::fs` through the Tauri commands in fs_cmds.rs;
// in a plain-browser preview the calls fall back to a small demo tree so the
// views stay explorable.

import { invoke, inTauri } from './tauri'

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
  sessionId: string
  path: string
  beforeBytes: number
}

export async function fsHome(): Promise<string> {
  if (!inTauri()) return '/'
  return invoke<string>('fs_home')
}

export async function fsListDir(path: string): Promise<FsList> {
  if (!inTauri()) return demoList(path)
  return invoke<FsList>('fs_list_dir', { path })
}

export async function fsReadFile(path: string): Promise<FsRead> {
  if (!inTauri()) {
    return { path, name: path.split('/').pop() ?? path, content: '', sizeBytes: 0, truncated: false, binary: false }
  }
  return invoke<FsRead>('fs_read_file', { path })
}

export async function fsWriteFile(path: string, content: string): Promise<{ path: string; bytes: number }> {
  return invoke('fs_write_file', { path, content })
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
  return invoke('fs_write_ticket', { path, content })
}

/** P41.3 — ticketed editor write, executor half: consumes the mandatory
 * single-use ticket, then writes. No ticket, no write — no silent autosaves
 * into the workspace. */
export async function fsWriteCommit(
  path: string,
  content: string,
  ticketId: string,
): Promise<{ path: string; bytes: number }> {
  return invoke('fs_write_commit', { path, content, ticketId })
}

export async function fsUndoList(): Promise<{ undos: FsUndo[]; count: number }> {
  if (!inTauri()) {
    return { undos: [], count: 0 }
  }
  return invoke('fs_undo_list')
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
