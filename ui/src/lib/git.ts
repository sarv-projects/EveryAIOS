// P11.5.3 — git bridge for the SCM panel (git_cmds.rs). Real `git` calls
// through Tauri; demo fallback for the plain-browser preview.

import { invoke, inTauri } from './tauri'
import { nativeCall } from './runtime'

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
  return nativeCall('git status', () => invoke<GitStatus>('git_status', { dir }))
}

export async function gitLog(dir: string, n = 15): Promise<GitLog> {
  if (!inTauri()) return { commits: [] }
  return nativeCall('git log', () => invoke<GitLog>('git_log', { dir, n }))
}

export async function gitDiff(dir: string, path?: string): Promise<{ diff: string }> {
  if (!inTauri()) return { diff: '' }
  return nativeCall('git diff', () => invoke('git_diff', { dir, path }))
}

export async function gitStageAll(dir: string): Promise<{ staged: boolean }> {
  return nativeCall('git stage all', () => invoke('git_stage_all', { dir }))
}

export async function gitCommit(dir: string, message: string): Promise<{ committed: boolean }> {
  return nativeCall('git commit', () => invoke('git_commit', { dir, message }))
}

export async function gitRoot(start: string): Promise<{ root: string | null }> {
  if (!inTauri()) return { root: null }
  return nativeCall('git root', () => invoke('git_root', { start }))
}

// --- P41.2 worktrees (subagent isolation) ---------------------------------

export interface Worktree {
  path: string
  branch: string | null
}

export async function gitWorktreeList(repo: string): Promise<Worktree[]> {
  if (!inTauri()) return []
  const r = await nativeCall('git worktree list', () => invoke<{ worktrees: Worktree[] }>('git_worktree_list', { repo }))
  return r.worktrees
}

export async function gitWorktreeAdd(
  repo: string,
  name: string,
  base: string,
): Promise<{ path: string; branch: string; base: string }> {
  return nativeCall('git worktree add', () => invoke('git_worktree_add', { repo, name, base }))
}

export async function gitWorktreeMerge(
  repo: string,
  name: string,
  targetBranch: string,
  message: string,
): Promise<{ merged: boolean; mergeHead: string }> {
  return nativeCall('git worktree merge', () => invoke('git_worktree_merge', { repo, name, targetBranch, message }))
}

export async function gitWorktreeRevert(
  repo: string,
  name: string,
  commit: string,
): Promise<{ reverted: boolean }> {
  return nativeCall('git worktree revert', () => invoke('git_worktree_revert', { repo, name, commit }))
}
