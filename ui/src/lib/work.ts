import { invoke, inTauri } from './tauri'
import { nativeCall } from './runtime'

export interface WorkAddress {
  workId: string
  projectId?: string
  sessionId?: string
  ownerId?: string
  nodeId?: string
  currentRunId?: string
  version: number
}

export interface WorkPresence {
  workId: string
  activeClients: string[]
  activeNodes: string[]
  activeRun?: string
  currentSurface?: string
  state?: string
}

export interface WorkEventEnvelope {
  workId: string
  sequence: number
  eventId: string
  event: unknown
  timestamp: number
  traceId?: string
  causalParent?: number
}

export interface WorkSnapshot {
  address: WorkAddress
  presence: WorkPresence
  events: WorkEventEnvelope[]
  clients: unknown[]
  nodes: unknown[]
  reviews: unknown[]
}

export async function workList(): Promise<WorkAddress[]> {
  if (!inTauri()) return []
  return nativeCall('work list', () => invoke<WorkAddress[]>('work_list'))
}

export async function workSnapshot(workId: string): Promise<WorkSnapshot | null> {
  if (!inTauri()) return null
  return nativeCall('work snapshot', () => invoke<WorkSnapshot | null>('work_snapshot', { workId }))
}

export async function workEvents(workId: string, fromSequence = 0): Promise<WorkEventEnvelope[]> {
  if (!inTauri()) return []
  return nativeCall('work events', () => invoke<WorkEventEnvelope[]>('work_events', { workId, fromSequence }))
}

export async function workPresence(workId: string): Promise<WorkPresence | null> {
  if (!inTauri()) return null
  return nativeCall('work presence', () => invoke<WorkPresence | null>('work_presence', { workId }))
}

export async function workReviews(workId: string): Promise<unknown[]> {
  if (!inTauri()) return []
  return nativeCall('work reviews', () => invoke<unknown[]>('work_reviews', { workId }))
}

// --- P49.10–12 session-runtime lifecycle -----------------------------------

export interface PtySession {
  pty_id: string
  process_id?: number
  rows: number
  cols: number
  state: string
  output: string
}
export interface AgentSession {
  agentSessionId: string
  workId: string
  runId: string
  agentId: string
  lifetime: string
  ptyId?: string
  worktreeId?: string
  runtimeState: string
  lastCheckpoint: number
  attached: boolean
}

export async function workPtySpawn(workId: string, ptyId: string, rows = 24, cols = 80, processId?: number) {
  return nativeCall('work PTY spawn', () => invoke('work_pty_spawn', { workId, ptyId, processId, rows, cols }))
}
export async function workPtyResize(workId: string, ptyId: string, rows: number, cols: number) {
  return nativeCall('work PTY resize', () => invoke('work_pty_resize', { workId, ptyId, rows, cols }))
}
export async function workPtySignal(workId: string, ptyId: string, signal: string) {
  return nativeCall('work PTY signal', () => invoke('work_pty_signal', { workId, ptyId, signal }))
}
export async function workPtyClose(workId: string, ptyId: string, code?: number) {
  return nativeCall('work PTY close', () => invoke('work_pty_close', { workId, ptyId, code }))
}
export async function workPtySnapshot(ptyId: string): Promise<PtySession | null> {
  if (!inTauri()) return null
  return nativeCall('work PTY snapshot', () => invoke<PtySession | null>('work_pty_snapshot', { ptyId }))
}

export async function workWorktreeCreate(args: {
  workId: string; runId: string; worktreeId: string; repoRoot: string;
  worktreeRoot: string; baseRevision: string; branch: string; isolationMode?: string
}) {
  return nativeCall('work worktree create', () => invoke('work_worktree_create', args))
}
export async function workWorktreeAttach(workId: string, worktreeId: string, runId: string) {
  return nativeCall('work worktree attach', () => invoke('work_worktree_attach', { workId, worktreeId, runId }))
}
export async function workWorktreeOp(workId: string, worktreeId: string, op: 'merge' | 'revert' | 'destroy', into?: string) {
  return nativeCall('work worktree operation', () => invoke('work_worktree_op', { workId, worktreeId, op, into }))
}

export async function workAgentSpawn(args: {
  workId: string; runId: string; agentSessionId: string; agentId: string;
  lifetime: 'ephemeral' | 'persistent'; ptyId?: string; worktreeId?: string
}) {
  return nativeCall('work agent spawn', () => invoke('work_agent_spawn', args))
}
export async function workAgentOp(workId: string, agentSessionId: string, op: 'attach' | 'detach' | 'steer' | 'checkpoint' | 'terminate') {
  return nativeCall('work agent operation', () => invoke('work_agent_op', { workId, agentSessionId, op }))
}
export async function workAgentSessions(workId: string): Promise<AgentSession[]> {
  if (!inTauri()) return []
  return nativeCall('work agent sessions', () => invoke<AgentSession[]>('work_agent_sessions', { workId }))
}
