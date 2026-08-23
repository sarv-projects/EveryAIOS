// P11.5.3 — git bridge for the SCM panel (git_cmds.rs). Real `git` calls
// through Tauri; demo fallback for the plain-browser preview.

import { invoke, inTauri } from './tauri'

export interface GitStatusRow {
  code: string
  path: string
}
export interface GitStatus {
  branch: string
  rows: GitStatusRow[]
  count: number
}
export interface GitLog {
  commits: { hash: string; message: string }[]
}

export async function gitStatus(dir: string): Promise<GitStatus> {
  if (!inTauri()) {
    return { branch: 'main', rows: [], count: 0 }
  }
  return invoke<GitStatus>('git_status', { dir })
}

export async function gitLog(dir: string, n = 15): Promise<GitLog> {
  if (!inTauri()) return { commits: [] }
  return invoke<GitLog>('git_log', { dir, n })
}

export async function gitDiff(dir: string, path?: string): Promise<{ diff: string }> {
  if (!inTauri()) return { diff: '' }
  return invoke('git_diff', { dir, path })
}

export async function gitStageAll(dir: string): Promise<{ staged: boolean }> {
  return invoke('git_stage_all', { dir })
}

export async function gitCommit(dir: string, message: string): Promise<{ committed: boolean }> {
  return invoke('git_commit', { dir, message })
}

export async function gitRoot(start: string): Promise<{ root: string | null }> {
  if (!inTauri()) return { root: null }
  return invoke('git_root', { start })
}
