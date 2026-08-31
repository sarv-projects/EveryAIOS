import { create } from 'zustand'
import { inTauri } from './tauri'
import { runtimeError, setRuntimeState } from './runtime'
import { guardAutonomy, guardSetAutonomy } from './guard'
import { inheritContext } from './plain-language'
import {
  recordSessionCreated,
  recordToolResult,
  recordTurnCompleted,
  recordTurnFailed,
} from './ux-metrics'
import {
  AGENT_MAP,
  DEFAULT_ROUTING,
  getDefaultModelForAgent,
  type AgentRuntime,
  type TaskKind,
} from './agents'
import type { ComposerRole, PermissionMode, TaskIntent } from './ui-prefs'
import type { WorkAddress, WorkEventEnvelope, WorkPresence } from './work'

// === Types ============================================================

export type ViewId =
  | 'folder'
  | 'shell'
  | 'browse'
  | 'code'
  | 'office-xlsx'
  | 'office-docx'
  | 'office-pptx'
  | 'office-pdf'
  | 'progress'
  | 'diff'
  | 'audit'
  | 'storage'
  | 'timeline'
  | 'trajectory'
  | 'blueprint'
  | 'local-server'
  | 'kanban'
  | 'generative'
  | 'artifact'
  | 'desktop'

/** v3.57 Work Mode (WHAT) — Code/browser/Office/terminal live *inside* Build. */
export type ChatMode = 'auto' | 'plan' | 'build' | 'research'

export function normalizeChatMode(m: unknown): ChatMode {
  if (m === 'plan' || m === 'research' || m === 'build' || m === 'auto') return m
  if (m === 'code') return 'build'
  return 'auto'
}

export type SessionStatus =
  | 'idle'
  | 'running'
  | 'action-required'
  | 'completed'
  | 'failed'
  | 'paused'
  | 'scheduled'
  | 'reconnecting'

export interface ToolCallRecord {
  id: string
  toolId: string
  args?: Record<string, unknown>
  result?: unknown
  status: 'running' | 'done' | 'failed'
  risk?: string
  error?: string
  progress?: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: string
  artifacts?: Artifact[]
  steps?: ProgressStep[]
  toolCalls?: ToolCallRecord[]
  mcq?: MCQInterrupt
  reasoning?: string[]
  pinned?: boolean
}

export interface ArtifactActionUi {
  index: number
  label: string
  state: 'pending' | 'running' | 'complete' | 'aborted' | 'failed'
  formatted?: string
}

export interface ArtifactServerState {
  port: number
  url: string
  status: 'stopped' | 'serving'
  /** true when the server is a browser-preview stand-in (no Rust socket). */
  demo?: boolean
}

export interface Artifact {
  id: string
  name: string
  type: 'docx' | 'xlsx' | 'pptx' | 'pdf' | 'code' | 'markdown' | 'image' | 'webapp'
  preview: string
  view?: ViewId
  /** Absolute path when this artifact is a real office file. */
  path?: string
  /** P15-H29 — bolt.diy-style inline action checklist (auto-expands while running). */
  actions?: ArtifactActionUi[]
  /** P15-H29 — live loopback preview server for webapp artifacts. */
  server?: ArtifactServerState
}

export interface ProgressStep {
  id: string
  label: string
  status: 'done' | 'active' | 'pending' | 'failed'
  type: 'file' | 'edit' | 'chart' | 'browser' | 'shell' | 'code' | 'office' | 'export' | 'tool'
  detail?: string
  output?: string
  timestamp?: string
}

export interface MCQInterrupt {
  id: string
  title: string
  description: string
  kind: 'diff' | 'permission' | 'mcq' | 'budget' | 'plan' | 'autonomy'
  diff?: { file: string; added: string[]; removed: string[] }[]
  options?: { label: string; value: string }[]
  budget?: { used: number; cap: number }
  /** Guard-2 permission cards must echo this nonce when approving/rejecting. */
  approvalNonce?: string
  /** P11.2 — urgency level drives the card's badge + default selection. */
  urgency?: 'low' | 'medium' | 'high'
  /** P44.6 — autonomy-limit cards: the action that hit the frozen level and why. */
  autonomyAction?: string
  autonomyReason?: string
}

/** P44.6 — task-scoped autonomy elevation. `oneShot` = Do Once (consumed by
 * the next use), task-scoped = Allow For This Task (expires at task end).
 * `elevatedUntil` is the wall-clock expiry for the temporary elevation. */
export interface TaskElevation {
  level: PermissionMode
  grantedAt: number
  oneShot: boolean
  /** Task-scoped elevation end (wall-clock ms); one-shots are consumed on use. */
  elevatedUntil?: number
}

/** P44.6 — the frozen per-task autonomy snapshot. Captured at task start so a
 * live chatbar change never mutates an in-flight Work (same principle as
 * scheduled-run snapshots). `configHash` is the deterministic fingerprint of
 * autonomy + mode + workspace + agent scope (mirrors the Rust
 * `RuntimeManifest`/`execution/bind_runtime` config_hash contract). */
export interface TaskSnapshot {
  frozenAt: number
  autonomyLevel: PermissionMode
  mode: ChatMode
  workspaceScope: string
  agentScope: string
  /** The session this task belongs to — a ticket from another session never
   * mutates this task's frozen policy. */
  sessionId: string
  configHash: string
  elevation?: TaskElevation
}

export interface VerificationRecord {
  /** The plan-task id the checks belong to. */
  taskId: string
  /** The declared checks (K1). */
  checks: string[]
  /** The model's verification report (raw, bounded). */
  report: string
  /** true / false / null = ambiguous — never claimed as executed. */
  passed: boolean | null
  tsMs: number
}

export interface StreamStats {
  tokensPerSec: number
  ctxPct: number
  activeKey?: string
  tokensThisTurn: number
}

export interface Session {
  id: string
  title: string
  status: SessionStatus
  preview: string
  updatedAt: string
  pinned?: boolean
  messages: ChatMessage[]
  children?: Session[]
  parentId?: string
  agent?: string
  folder?: string
  spent?: number
  tokens?: number
  view?: ViewId
  officeDoc?: string
  railCollapsed?: boolean
}

export interface Automation {
  id: string
  name: string
  trigger: string
  triggerKind: 'schedule' | 'webhook' | 'event' | 'slack'
  action: string
  activity: number[]
  enabled: boolean
  runs: number
  success: number
  failed: number
  lastRun?: string
}

/** P11.5.3 — per-session layout snapshot (persisted per sessionId). */
export interface SessionLayout {
  view?: ViewId
  officeDoc?: string
  railCollapsed?: boolean
  splitRatio?: number
  composerMode?: ChatMode
  /** P33.7 — the open tab set (persisted + restored per session). */
  openViews?: ViewId[]
}

/** P30.15 — one dream-diary entry (visible memory consolidation). */
export interface DiaryEntry {
  id: string
  /** UNIX ms of the consolidation run. */
  atMs: number
  /** Short plain-language headline ("Consolidated 3 sessions about the Q3 plan"). */
  headline: string
  /** Facts folded into long-term memory this run. */
  foldedFacts: number
  /** Facts decayed this run (pruned as noise). */
  decayedFacts: number
  /** The morning-brief line (rendered in the storage view). */
  brief: string
}

/** P11.5.3 — a real pending patch (agent file mutation w/ undo snapshot). */
export interface PendingPatch {
  id: string
  sessionId: string
  path: string
  beforeBytes: number
  applied?: boolean
}

export interface Connector {
  id: string
  name: string
  category: 'native' | 'composio' | 'mcp' | 'zapier' | 'nango'
  status: 'connected' | 'disconnected' | 'error'
  tools: number
  type?: 'oauth' | 'apiKey' | 'stdio' | 'http'
}

export interface MemoryItem {
  id: string
  title: string
  category: string
  trigger?: string
  macro?: string
  scope: string
  enabled: boolean
  source: 'manual' | 'learned' | 'suggested'
}

export interface PermissionEntry {
  id: string
  action: string
  target: string
  status: 'approved' | 'auto' | 'pending' | 'blocked'
  timestamp: string
  scope?: string
}

// === Mock data ============================================================

const now = new Date()
const iso = (offsetMin: number) =>
  new Date(now.getTime() - offsetMin * 60_000).toISOString()

export const mockSessions: Session[] = [
  {
    id: 's1',
    title: 'Q3 report — refresh numbers + deck',
    status: 'action-required',
    preview: 'Regenerating revenue chart and exec summary',
    updatedAt: iso(2),
    pinned: true,
    folder: '~/work/q3-report',
    agent: 'analyst',
    spent: 1.84,
    tokens: 184_220,
    view: 'office-xlsx',
    officeDoc: 'Q3-Financials.xlsx',
    messages: [
      {
        id: 'm1',
        role: 'user',
        content:
          'Refresh the Q3 numbers from the new actuals spreadsheet, regenerate the revenue chart, then update the executive summary in the deck.',
        timestamp: iso(28),
      },
      {
        id: 'm2',
        role: 'assistant',
        content:
          'On it. I opened `Q3-Financials.xlsx`, mapped the new actuals to cells B7:B12 on `Sheet1`, then ran a deterministic sort + sum through IronCalc (no LLM math). The revenue chart is regenerating now, after which I will patch the executive-summary paragraph in `exec-summary.docx`.',
        timestamp: iso(26),
        steps: [
          { id: 'p1', label: 'Opened Q3-Financials.xlsx', status: 'done', type: 'file', detail: 'Sheet1' },
          { id: 'p2', label: 'Updated B7:B12 with Q3 actuals', status: 'done', type: 'edit', detail: '6 cells · surgical patch' },
          { id: 'p3', label: 'Regenerating revenue chart', status: 'active', type: 'chart', detail: 'IronCalc recalc' },
          { id: 'p4', label: 'Patch exec-summary.docx §3.2', status: 'pending', type: 'office', detail: 'block-patch' },
          { id: 'p5', label: 'Export final PDF', status: 'pending', type: 'export' },
        ],
        artifacts: [
          {
            id: 'a1',
            name: 'Q3-Financials.xlsx',
            type: 'xlsx',
            preview: 'Sheet1 · B7:B12 updated',
            view: 'office-xlsx',
          },
        ],
      },
      {
        id: 'm3',
        role: 'assistant',
        content:
          'The exec summary rewriter needs a green light — this overwrites a paragraph in `exec-summary.docx`.',
        timestamp: iso(1),
        mcq: {
          id: 'mcq1',
          title: 'Approve paragraph rewrite in exec-summary.docx',
          description:
            'Replace the §3.2 paragraph "Revenue grew 14% QoQ…" with the new numbers from the actuals sheet ($1.8M, +20% QoQ).',
          kind: 'diff',
          diff: [
            {
              file: 'exec-summary.docx §3.2',
              added: [
                'Revenue grew 20% QoQ, reaching $1.8M driven by enterprise deals.',
                'Churn rate: 2.1% (down from 3.4%).',
              ],
              removed: [
                'Revenue grew 14% QoQ, reaching $1.5M.',
                'Churn rate: 3.4%.',
              ],
            },
          ],
        },
      },
    ],
  },
  {
    id: 's2',
    title: 'Scraper — competitor pricing refresh',
    status: 'running',
    preview: 'Crawling 47 product pages on competitor site',
    updatedAt: iso(8),
    folder: '~/work/price-watch',
    agent: 'browser',
    spent: 0.92,
    tokens: 88_410,
    view: 'browse',
    messages: [
      {
        id: 's2m1',
        role: 'user',
        content: 'Refresh pricing for all 47 products on competitor.acme.com. Use my logged-in Chrome profile.',
        timestamp: iso(12),
      },
      {
        id: 's2m2',
        role: 'assistant',
        content:
          'Switched browser to **system Chrome** with your signed-in profile (vault session `acme-personal`). Tier-2 engine. Currently on page 23/47 — `everyaios-cdp` is taking accessibility-tree snapshots, extracting the price via the `[data-product-card]` locator, and writing rows to `pricing.csv`.',
        timestamp: iso(8),
        steps: [
          { id: 's2p1', label: 'Login session inherited from Chrome', status: 'done', type: 'browser' },
          { id: 's2p2', label: 'Crawling product pages (23/47)', status: 'active', type: 'browser', detail: 'Lightpanda → Chrome escalation on 2 pages' },
          { id: 's2p3', label: 'Writing to pricing.csv', status: 'pending', type: 'file' },
        ],
      },
    ],
  },
  {
    id: 's3',
    title: 'Refactor api/users.ts → typed router',
    status: 'paused',
    preview: 'User took over — switched shell to writable',
    updatedAt: iso(35),
    folder: '~/code/backend-api',
    agent: 'coder',
    spent: 0.51,
    tokens: 51_330,
    view: 'code',
    messages: [
      {
        id: 's3m1',
        role: 'user',
        content: 'Refactor src/api/users.ts to use the typed router + db.query. Add tests.',
        timestamp: iso(40),
      },
    ],
  },
  {
    id: 's4',
    title: 'Invoice batch — fill & sign PDFs',
    status: 'completed',
    preview: '42 invoices filled, 42 signatures applied',
    updatedAt: iso(140),
    folder: '~/work/invoices',
    agent: 'analyst',
    spent: 2.41,
    tokens: 240_100,
    view: 'office-pdf',
    messages: [],
  },
  {
    id: 's5',
    title: 'Daily standup digest (scheduled)',
    status: 'scheduled',
    preview: 'Next run: tomorrow 09:00 IST',
    updatedAt: iso(360),
    folder: '~/automations',
    agent: 'analyst',
    messages: [],
  },
]

export const mockAutomations: Automation[] = [
  {
    id: 'auto1',
    name: 'Daily backup',
    trigger: 'Every day at 02:00',
    triggerKind: 'schedule',
    action: 'Run session',
    activity: [3, 5, 7, 5, 3, 1, 3, 5, 7, 5, 3, 1, 3, 5, 7, 5, 3, 1, 3, 5, 7, 5, 3, 1, 3, 5, 7, 5, 3],
    enabled: true,
    runs: 28,
    success: 26,
    failed: 2,
    lastRun: 'today 02:00',
  },
  {
    id: 'auto2',
    name: 'CI failure fixer',
    trigger: 'Webhook on red build',
    triggerKind: 'webhook',
    action: 'Start session',
    activity: [3, 5, 7, 5, 3, 1, 1, 3, 5, 7, 5, 3, 1, 3, 5, 7, 5, 3, 1, 3, 5, 7, 5, 3, 1, 3, 5, 7, 5, 3],
    enabled: true,
    runs: 142,
    success: 134,
    failed: 8,
    lastRun: '12m ago',
  },
  {
    id: 'auto3',
    name: 'Weekly deps security scan',
    trigger: 'Every Monday 06:00',
    triggerKind: 'schedule',
    action: 'Run session',
    activity: [0, 0, 0, 0, 0, 0, 7, 0, 0, 0, 0, 0, 0, 7, 0, 0, 0, 0, 0, 0, 7, 0, 0, 0, 0, 0, 0, 7, 0, 0],
    enabled: true,
    runs: 12,
    success: 12,
    failed: 0,
    lastRun: 'Mon 06:00',
  },
  {
    id: 'auto4',
    name: 'Slack triage',
    trigger: '#support new message',
    triggerKind: 'slack',
    action: 'Triage & summarize',
    activity: [5, 7, 5, 3, 5, 7, 5, 3, 5, 7, 5, 3, 5, 7, 5, 3, 5, 7, 5, 3, 5, 7, 5, 3, 5, 7, 5, 3, 5],
    enabled: false,
    runs: 312,
    success: 308,
    failed: 4,
    lastRun: '4h ago',
  },
]

export const mockConnectors: Connector[] = [
  { id: 'c1', name: 'Gmail', category: 'native', status: 'connected', tools: 3, type: 'oauth' },
  { id: 'c2', name: 'Google Calendar', category: 'native', status: 'connected', tools: 5, type: 'oauth' },
  { id: 'c3', name: 'Composio (12 toolkits)', category: 'composio', status: 'connected', tools: 47, type: 'apiKey' },
  { id: 'c4', name: 'Local SearXNG', category: 'native', status: 'connected', tools: 1, type: 'http' },
  { id: 'c5', name: 'GitHub MCP', category: 'mcp', status: 'connected', tools: 18, type: 'http' },
  { id: 'c6', name: 'Filesystem MCP', category: 'mcp', status: 'connected', tools: 7, type: 'stdio' },
  { id: 'c7', name: 'Slack MCP', category: 'mcp', status: 'disconnected', tools: 14, type: 'stdio' },
  { id: 'c8', name: 'Linear', category: 'native', status: 'disconnected', tools: 9, type: 'oauth' },
  { id: 'c9', name: 'Notion', category: 'native', status: 'disconnected', tools: 11, type: 'oauth' },
]

export const mockMemory: MemoryItem[] = [
  {
    id: 'mem1',
    title: 'Use pnpm not npm',
    category: 'Coding standards',
    trigger: 'package management',
    macro: '!pnpm',
    scope: 'all projects',
    enabled: true,
    source: 'manual',
  },
  {
    id: 'mem2',
    title: 'Deploy to prod checklist',
    category: 'Deployment',
    trigger: 'deploying, production',
    macro: '!deploy',
    scope: 'backend-api project',
    enabled: true,
    source: 'learned',
  },
  {
    id: 'mem3',
    title: 'User prefers concise replies, no emojis',
    category: 'Personal prefs',
    scope: 'all projects',
    enabled: true,
    source: 'manual',
  },
  {
    id: 'mem4',
    title: 'Always run lint before commit',
    category: 'Coding standards',
    trigger: 'git commit',
    macro: '!lintcommit',
    scope: 'all projects',
    enabled: false,
    source: 'suggested',
  },
  {
    id: 'mem5',
    title: 'API responses are JSON:API spec',
    category: 'Project context',
    scope: 'backend-api project',
    enabled: true,
    source: 'manual',
  },
]

export const mockPermissions: PermissionEntry[] = [
  { id: 'pm1', action: 'Read', target: 'src/utils.ts', status: 'auto', timestamp: '09:15:02', scope: 'workspace read' },
  { id: 'pm2', action: 'Write', target: 'src/api/handler.ts', status: 'auto', timestamp: '09:15:04', scope: 'workspace write' },
  { id: 'pm3', action: 'Execute', target: 'npm run deploy', status: 'pending', timestamp: '09:15:08', scope: 'shell (restricted)' },
  { id: 'pm4', action: 'Blocked', target: 'rm -rf /', status: 'blocked', timestamp: '09:15:09', scope: 'Guard-1 regex' },
  { id: 'pm5', action: 'Browser', target: 'gmail.com (read-only)', status: 'approved', timestamp: '09:14:50', scope: 'browser (owned tabs)' },
  { id: 'pm6', action: 'External API', target: 'api.openai.com (gpt-4o)', status: 'approved', timestamp: '09:14:45', scope: 'external api (with approval)' },
]

// === Live-data bridge state (src/lib/bridge.ts) ===============================

/** Real budget from the shell (P5.9 spend snapshot). */
export interface LiveBudget {
  spent: number
  cap: number
  tokens: number
  cacheHitRate?: number
}

// The assistant message currently being streamed **(keyed by sessionId, not a
// global)**. Streaming is routed to the session the turn started on, so a chat
// switch mid-stream never lands tokens on the wrong transcript (chat-events
// carry a sessionId; see the bridge). module-level since zustand actions can't
// hold instance state.
let activeStreamMsg: Record<string, string> = {} // sessionId -> assistant msg id
let streamT0 = 0
let streamTok = 0

/** Resolve the session a stream action targets: explicit id > active session. */
function streamSessionId(sessionId?: string): string {
  return sessionId ?? useAppStore.getState().activeSessionId
}

/** True when `sessionId` has an in-flight assistant turn. */
function hasActiveStream(sessionId: string): boolean {
  return !!activeStreamMsg[sessionId]
}

function patchActiveAssistant(
  set: (partial: object | ((s: { sessions: Session[]; activeSessionId: string }) => object)) => void,
  fn: (m: ChatMessage) => ChatMessage,
  sessionId?: string,
) {
  set((s) => ({
    sessions: s.sessions.map((x) => {
      if (x.id !== streamSessionId(sessionId)) return x
      const targetId = activeStreamMsg[x.id] ?? undefined
      if (!targetId) return x
      return {
        ...x,
        messages: x.messages.map((m) => (m.id === targetId ? fn(m) : m)),
      }
    }),
  }))
}

// Progressive-disclosure preference (B9/P31) persisted to localStorage.
const POWER_MODE_KEY = 'everyaios.settings.ui.powerMode'
const readPowerMode = (): boolean => {
  if (typeof window === 'undefined') return true
  try {
    const v = window.localStorage.getItem(POWER_MODE_KEY)
    // Unset → full cockpit. Explicit '0' selects the casual layout.
    if (v === null) return true
    return v === '1'
  } catch {
    return true
  }
}
const writePowerMode = (v: boolean) => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(POWER_MODE_KEY, v ? '1' : '0')
  } catch {
    /* storage may be unavailable */
  }
}

export const SETTINGS_SECTION_IDS = [
  'general',
  'appearance',
  'notifications',
  'voice',
  'mobile',
  'agents',
  'local',
  'apikeys',
  'experts',
  'launch',
  'chat',
  'permissions',
  'browser',
  'indexing',
  'mcp',
  'marketplace',
  'skills',
  'commands',
  'hooks',
  'worktree',
  'rules',
  'memory',
  'cloud',
  'import',
  'usage',
  'ux',
  'feedback',
  'resources',
  'beta',
  'privacy',
  'sync',
  'keyboard',
  'advanced',
  'doctor',
  'discover',
  'runtime',
  'about',
] as const
export type SettingsSectionId = (typeof SETTINGS_SECTION_IDS)[number]

const PERMISSION_KEY = 'everyaios.settings.permissionMode'
const readPermission = (): PermissionMode => {
  if (typeof window === 'undefined') return 'ask'
  try {
    const v = window.localStorage.getItem(PERMISSION_KEY)
    if (v === 'sandbox' || v === 'ask' || v === 'auto' || v === 'full') return v
  } catch {
    /* ignore */
  }
  return 'ask'
}
const writePermission = (v: PermissionMode) => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(PERMISSION_KEY, v)
  } catch {
    /* ignore */
  }
}

/** P44.6 — deterministic FNV-1a fingerprint of the frozen task scope. Mirrors
 * the Rust `RuntimeManifest::compute_hash` idea (SHA-256 there; the UI mirror
 * is a stable fingerprint for display + equality checks, not the audit hash). */
export function taskScopeHash(autonomyLevel: string, mode: string, workspace: string, agent: string): string {
  const input = JSON.stringify({
    autonomy: autonomyLevel,
    mode,
    workspace,
    agent,
  })
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

// === Zustand store ============================================================

interface AppState {
  // Sessions & navigation
  sessions: Session[]
  workItems: WorkAddress[]
  workPresence?: WorkPresence
  workEvents: WorkEventEnvelope[]
  setWorkProjection: (items: WorkAddress[], presence?: WorkPresence, events?: WorkEventEnvelope[]) => void
  activeSessionId: string
  /** True once the shell has taken ownership of the sessions list (loaded via
   * `session_list` or a new session was created). Until then the list is the
   * demo seed and must never be persisted (bugfix 3). */
  sessionsHydrated: boolean
  markSessionsHydrated: () => void
  setActiveSession: (id: string) => void
  newSession: () => void
  deleteSession: (id: string) => Promise<void>
  monitorBadge: { count: number; last?: string; stopped: boolean }
  pushMonitor: (ev: { notified: boolean; stopped: boolean; current: string; jobId?: string }) => void
  clearMonitorBadge: () => void

  // Active view (right viewport)
  activeView: ViewId
  setActiveView: (v: ViewId) => void
  /** P33.6 — pending URL for the browser view (Google Docs/Sheets read path). */
  browserUrl: string | null
  /** P33.6 — route a Google Docs/Sheets link into the authenticated browser view. */
  openInBrowser: (url: string) => void
  railCollapsed: boolean
  toggleRail: () => void
  setRailCollapsed: (v: boolean) => void
  /** Full-window mode for the active cockpit lens. */
  fullscreenView: boolean
  setFullscreenView: (v: boolean) => void

  // Multi-view panel (ARCH/12 v3.0 — VS Code-style tabs). Open views are a
  // tabbed set; defaults Folder · Shell · Browser; "+" adds more; close × removes.
  openViews: ViewId[]
  addView: (v: ViewId) => void
  closeView: (v: ViewId) => void
  /** P33.7 — drag-reorder the open tab set. */
  reorderViews: (from: number, to: number) => void
  /** Real file path per office view (replaces hardcoded Q3-Financials.xlsx labels). */
  officePaths: Partial<Record<ViewId, string>>
  /** P1.7 — opened-file history per office view (most recent first). Opening
   * a second file of the same kind no longer loses the first: the view's
   * file switcher lists this history so any prior file can be re-opened. */
  officeHistory: Partial<Record<ViewId, string[]>>
  /** Switch the given office view to a previously opened file path. */
  switchOfficeDoc: (view: ViewId, path: string) => void
  /** Office hold lift (P33.1) — close one opened file of a kind; falls back
   * to the most recent remaining file when the active one closes. */
  closeOfficeDoc: (view: ViewId, path: string) => void
  /** Infer kind from extension, set path, add the view. */
  openOfficeDoc: (path: string) => void

  // PDF study mode (chat scoped to an open document)
  scopedView?: ViewId
  setScopedView: (v?: ViewId) => void
  /** P33 scoped-PDF fix — the open document's extracted text (grounding). */
  scopedDoc?: { title: string; content: string }
  setScopedDoc: (d?: { title: string; content: string }) => void
  // P15-H29 — artifact server + inline action checklist.
  artifactServer: ArtifactServerState | null
  artifactActions: ArtifactActionUi[]
  patchArtifactServer: (server: ArtifactServerState | null) => void
  setArtifactActions: (actions: ArtifactActionUi[]) => void

  // P30.12 — AIPointer quick-ask overlay (hotkey-anchored ask-box).
  aiPointerOpen: boolean
  setAiPointerOpen: (v: boolean) => void

  // P30.15 — visible memory consolidation (Dream Diary / morning brief).
  dreamDiary: DiaryEntry[]
  pushDiaryEntry: (e: DiaryEntry) => void
  clearDiary: () => void

  // Sidebar collapse
  sidebarCollapsed: boolean
  toggleSidebar: () => void

  // Progressive disclosure (B9/P31) — casual (default) vs power mode.
  // Casual = collapsed rail (agent switcher · new chat · recents · settings).
  // Power  = full 248px nav + right activity rail + advanced panels.
  powerMode: boolean
  togglePowerMode: () => void
  setPowerMode: (v: boolean) => void

  // Developer telemetry (status-bar debug strip) — off by default.
  devMode: boolean
  setDevMode: (v: boolean) => void

  // Chat composer
  composerMode: ChatMode
  setComposerMode: (m: ChatMode) => void
  composerValue: string
  setComposerValue: (v: string) => void

  // Underlying agent runtime + model selection (Claude Code / Codex / Grok Build / etc.)
  selectedAgentId: string
  setSelectedAgent: (id: string) => void
  selectedModelId: string
  setSelectedModel: (id: string) => void
  personaId: string
  setPersonaId: (id: string) => void
  soulId: string
  setSoulId: (id: string) => void
  /** P32.2 — the agent's chosen name (name-your-agent ownership moment). */
  agentName: string
  setAgentName: (name: string) => void
  /** `ollama` | `llamafile` when the picker selected a local model. */
  localRuntime?: string
  localCtxWindow?: number
  setLocalRuntime: (runtime?: string, ctx?: number) => void
  streamStats: StreamStats
  // P11.5.12 — reconnect chip state (dropped IPC stream → auto-resume).
  reconnect: { show: boolean; lastToken: string; tokens: number }
  setReconnect: (r: { show: boolean; lastToken: string; tokens: number }) => void
  noteStreamTick: (tokenCount: number) => void
  forkFromMessage: (messageId: string) => void

  // Auto-route per task kind — when true, agent selection follows routing table
  autoRoute: boolean
  setAutoRoute: (v: boolean) => void
  routing: Record<TaskKind, string>
  setRouting: (task: TaskKind, agentId: string) => void

  // Left-panel mode (which sub-screen is showing in the center for non-chat panels)
  centerScreen:
    | 'home'
    | 'chat'
    | 'activity'
    | 'projects'
    | 'files'
    | 'automations'
    | 'memory'
    | 'guard'
    | 'connectors'
    | 'analytics'
    | 'agents'
    | 'settings'
  setCenterScreen: (s: AppState['centerScreen']) => void
  settingsSection: SettingsSectionId
  setSettingsSection: (s: SettingsSectionId) => void
  permissionMode: PermissionMode
  setPermissionMode: (m: PermissionMode) => void
  /** P44.5 — reconcile the UI level with the Rust GuardService preset on boot. */
  syncAutonomyFromRust: () => Promise<void>
  // P44.6 — frozen per-task autonomy snapshot + temporary elevation.
  taskSnapshot?: TaskSnapshot
  freezeTaskSnapshot: () => void
  clearTaskSnapshot: () => void
  /** Apply an autonomy-limit card choice (Do Once / Allow For This Task /
   * Change Level) to the frozen task snapshot. Returns the resulting level. */
  respondAutonomyCard: (id: string, choice: string) => PermissionMode
  /** P44.6 — surface an autonomy-limit card (escalation) for a blocked
   * action. Callers: the bridge when a Guard ticket arrives while a task is
   * frozen at a lower autonomy level. */
  pushAutonomyLimit: (opts: {
    id: string
    action: string
    reason: string
    sessionId?: string
  }) => void
  /** Effective level for the live indicator: elevation wins while valid,
   * then the frozen level, then the global mode when idle. */
  effectiveAutonomyLevel: () => PermissionMode
  composerRole: ComposerRole
  setComposerRole: (r: ComposerRole) => void
  taskIntent: TaskIntent
  setTaskIntent: (t: TaskIntent) => void
  taskFolder?: string
  setTaskFolder: (folder?: string) => void

  // Office flyout state
  officeFlyoutOpen: boolean
  setOfficeFlyoutOpen: (v: boolean) => void

  // Command palette
  paletteOpen: boolean
  setPaletteOpen: (v: boolean) => void

  // Pause/resume
  agentPaused: boolean
  toggleAgentPause: () => void

  // Toast trigger helper (kept simple)
  lastToast?: string
  lastToastKind?: 'default' | 'error'
  notify: (msg: string, kind?: 'default' | 'error') => void
  notifyMcpError: (msg: string) => void

  // Live data (bridge) — empty until the shell answers
  liveAgents: AgentRuntime[]
  setLiveAgents: (a: AgentRuntime[]) => void
  liveBudget?: LiveBudget
  setLiveBudget: (b: LiveBudget) => void

  /** Bugfix — the live `chat_stream` id per session, so Stop/Pause can cancel
   * the real Rust stream (`chat_cancel`) instead of only flipping local state. */
  liveStreamId: Record<string, string>
  setLiveStreamId: (sessionId: string, streamId: string) => void

  // Chat streaming (bridge) — real turns through the Tauri relay
  pushUserMessage: (text: string) => void
  streamStart: (sessionId?: string) => void
  streamAppend: (text: string, done: boolean, sessionId?: string) => void
  streamFinalize: (fullText: string, sessionId?: string) => void
  streamFail: (msg: string, sessionId?: string) => void
  streamBudgetKill: (msg: string, sessionId?: string) => void
  streamStep: (label: string) => void
  streamToolCall: (toolId: string, args?: Record<string, unknown>, risk?: string) => void
  streamToolResult: (toolId: string, result?: unknown, error?: string) => void
  streamToolProgress: (toolId: string, progress: string) => void
  retryToolCall: (recordId: string) => Promise<void>

  // Guard-2 tickets (bridge) — live approval cards in the transcript
  pushMcq: (mcq: MCQInterrupt, sessionId?: string) => void
  respondMcq: (id: string, choice: string) => void

  /** Live ACP handles keyed by catalog agent id. */
  acpHandles: Record<string, string>
  setAcpHandle: (agentId: string, handle: string) => void

  pendingPlan?: { planId: string; tasks: { id: string; goal: string; dependsOn?: string[] }[] }
  setPendingPlan: (
    p: { planId: string; tasks: { id: string; goal: string; dependsOn?: string[] }[] } | undefined,
  ) => void

  // P41.3 — ticketed editor writes: ticketId → { path, content } waiting on
  // the Guard-2 approval card; the commit runs once the card is approved.
  pendingEditorWrites: Record<string, { path: string; content: string }>
  parkEditorWrite: (ticketId: string, w: { path: string; content: string }) => void
  takeEditorWrite: (ticketId: string) => { path: string; content: string } | undefined

  // P41.4 — K1 verification receipts for the editor's Diff rail.
  verifications: VerificationRecord[]
  pushVerification: (v: VerificationRecord) => void

  // P11.2 — onboarding (first launch → add key → first chat → success)
  onboardingDone: boolean
  setOnboardingDone: (v: boolean) => void

  // P11.5.3 — per-session layout persistence
  sessionLayouts: Record<string, SessionLayout>
  saveSessionLayout: (sessionId: string, partial: Partial<SessionLayout>) => void
  restoreSessionLayout: (sessionId: string) => void

  // P11.5.4 — takeover / resume (per-session pause + describe-changes draft)
  pausedSessions: Record<string, boolean>
  setSessionPaused: (sessionId: string, paused: boolean) => void

  // P11.5.3 — real pending patches (fed by fs_undo_list)
  pendingPatches: PendingPatch[]
  setPendingPatches: (patches: PendingPatch[]) => void

  // P11.5.5 — NL automation draft text
  nlAutomationDraft?: string
  setNlAutomationDraft: (v?: string) => void
}

export const useAppStore = create<AppState>((set, get) => ({
  // Tauri starts with no client-side fixtures. The shell hydrates this list
  // from the encrypted vault; only the plain-browser preview uses mock data.
  sessions: inTauri() ? [] : mockSessions,
  workItems: [],
  workEvents: [],
  setWorkProjection: (items, presence, events = []) => set({ workItems: items, workPresence: presence, workEvents: events }),
  activeSessionId: inTauri() ? '' : 's1',
  sessionsHydrated: false,
  markSessionsHydrated: () => set({ sessionsHydrated: true }),
  setActiveSession: (id) => {
    // P11.5.3 — persist the outgoing session's layout, restore the incoming.
    const st = get()
    if (st.activeSessionId !== id) {
      st.saveSessionLayout(st.activeSessionId, {
        view: st.activeView,
        railCollapsed: st.railCollapsed,
        composerMode: st.composerMode,
        officeDoc: st.sessions.find((x) => x.id === st.activeSessionId)?.officeDoc,
      })
      set({ activeSessionId: id, centerScreen: 'chat' })
      st.restoreSessionLayout(id)
    } else {
      set({ activeSessionId: id, centerScreen: 'chat' })
    }
  },
  newSession: () => {
    const id = `s-${Date.now()}`
    // P11.6.4 — local UX metric: a user-created session.
    recordSessionCreated()
    // A user-created session is a real turn target — once one exists the
    // store owns live state (bugfix 3): stop persisting the demo seed.
    if (!get().sessionsHydrated) set({ sessionsHydrated: true })
    // P32.6 — fewest-questions context inheritance: pre-fill the folder so
    // the first ask needs no setup (onboarding stays enforced).
    const inherited = inheritContext()
    const fresh: Session = {
      id,
      title: inherited.title ?? 'New work',
      status: 'idle',
      preview: 'What would you like to do?',
      updatedAt: new Date().toISOString(),
      agent: 'analyst',
      messages: [],
    }
    set((s) => ({
      sessions: [fresh, ...s.sessions],
      activeSessionId: id,
      centerScreen: 'chat',
      composerValue: '',
      ...(inherited.folder ? { taskFolder: inherited.folder } : {}),
    }))
  },
  monitorBadge: { count: 0, stopped: false },
  pushMonitor: (ev) => {
    set((s) => ({
      monitorBadge: {
        count: ev.notified ? s.monitorBadge.count + 1 : s.monitorBadge.count,
        last: ev.current,
        stopped: ev.stopped || s.monitorBadge.stopped,
      },
    }))
    if (ev.notified) {
      get().notify(
        ev.stopped ? `Monitor stopped · ${ev.current}` : `Monitor · ${ev.current}`,
      )
    }
  },
  clearMonitorBadge: () => set({ monitorBadge: { count: 0, stopped: false } }),
  deleteSession: async (id) => {
    if (inTauri()) {
      try {
        const { schedulerPauseSession, invoke } = await import('./tauri')
        await schedulerPauseSession(id)
        await invoke('session_delete', { sessionId: id })
      } catch (error) {
        get().notify(`Could not delete this work: ${error instanceof Error ? error.message : String(error)}`, 'error')
        return
      }
    }
    const st = get()
    const remaining = st.sessions.filter((x) => x.id !== id)
    const nextActive =
      st.activeSessionId === id ? (remaining[0]?.id ?? '') : st.activeSessionId
    set({
      sessions: remaining,
      activeSessionId: nextActive,
    })
  },

  activeView: 'office-xlsx',
  setActiveView: (v) => {
    set((s) => ({
      activeView: v,
      railCollapsed: false,
      powerMode: true,
      openViews: s.openViews.includes(v) ? s.openViews : [...s.openViews, v],
    }))
    // P11.5.3 — persist the layout as it changes.
    get().saveSessionLayout(get().activeSessionId, { view: v, railCollapsed: false })
  },
  browserUrl: null,
  openInBrowser: (url) => {
    set((s) => ({
      browserUrl: url,
      activeView: 'browse',
      railCollapsed: false,
      powerMode: true,
      openViews: s.openViews.includes('browse') ? s.openViews : [...s.openViews, 'browse'],
    }))
    get().saveSessionLayout(get().activeSessionId, { view: 'browse', railCollapsed: false })
  },
  railCollapsed: false,
  toggleRail: () => {
    set((s) => ({ railCollapsed: !s.railCollapsed }))
    get().saveSessionLayout(get().activeSessionId, { railCollapsed: get().railCollapsed })
  },
  setRailCollapsed: (v) => {
    set({ railCollapsed: v })
    get().saveSessionLayout(get().activeSessionId, { railCollapsed: v })
  },
  fullscreenView: false,
  setFullscreenView: (v) => set({ fullscreenView: v }),

  openViews: ['folder', 'shell', 'browse', 'office-xlsx'],
  addView: (v) => {
    set((s) => ({
      openViews: s.openViews.includes(v) ? s.openViews : [...s.openViews, v],
      activeView: v,
      railCollapsed: false,
      powerMode: true,
    }))
    // P33.7 — persist the tab set per session.
    get().saveSessionLayout(get().activeSessionId, { openViews: get().openViews })
  },
  closeView: (v) => {
    set((s) => {
      const next = s.openViews.filter((x) => x !== v)
      if (next.length === 0) return { openViews: next, railCollapsed: true, fullscreenView: false }
      const active = s.activeView === v ? next[next.length - 1] : s.activeView
      return { openViews: next, activeView: active, fullscreenView: false }
    })
    get().saveSessionLayout(get().activeSessionId, { openViews: get().openViews })
  },
  officePaths: {},
  officeHistory: {},
  switchOfficeDoc: (view, path) =>
    set((s) => ({ officePaths: { ...s.officePaths, [view]: path } })),
  // Office hold lift (P33.1 — office files as tabs): close one opened file of
  // a kind. If it was the active file, fall back to the most recent remaining
  // one (the view stays open until its last tab is closed).
  closeOfficeDoc: (view, path) =>
    set((s) => {
      const history = s.officeHistory[view] ?? []
      const next = history.filter((p) => p !== path)
      const wasActive = s.officePaths[view] === path
      const fallback = wasActive ? (next[0] ?? null) : s.officePaths[view]
      return {
        officePaths: { ...s.officePaths, [view]: fallback ?? undefined },
        officeHistory: { ...s.officeHistory, [view]: next },
      }
    }),
  openOfficeDoc: (path) => {
    const ext = path.split('.').pop()?.toLowerCase() ?? ''
    const view: ViewId | undefined =
      ext === 'xlsx' || ext === 'xlsm'
        ? 'office-xlsx'
        : ext === 'docx'
          ? 'office-docx'
          : ext === 'pptx'
            ? 'office-pptx'
            : ext === 'pdf'
              ? 'office-pdf'
              : undefined
    if (!view) return
    const label = path.split(/[\\/]/).pop() ?? path
    set((s) => {
      const history = s.officeHistory[view] ?? []
      const next = [path, ...history.filter((p) => p !== path)].slice(0, 8)
      return {
        officePaths: { ...s.officePaths, [view]: path },
        officeHistory: { ...s.officeHistory, [view]: next },
        sessions: s.sessions.map((x) =>
          x.id === s.activeSessionId ? { ...x, officeDoc: label, view } : x,
        ),
      }
    })
    get().addView(view)
  },
  reorderViews: (from, to) => {
    set((s) => {
      if (from === to || from < 0 || to < 0 || from >= s.openViews.length || to >= s.openViews.length) {
        return s
      }
      const next = [...s.openViews]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved!)
      return { openViews: next }
    })
    get().saveSessionLayout(get().activeSessionId, { openViews: get().openViews })
  },

  scopedView: undefined,
  setScopedView: (v) => set({ scopedView: v }),
  scopedDoc: undefined,
  setScopedDoc: (d) => set({ scopedDoc: d }),

  // P15-H29 — artifact server + inline action checklist.
  artifactServer: null as ArtifactServerState | null,
  artifactActions: [] as ArtifactActionUi[],
  patchArtifactServer: (server) => set({ artifactServer: server }),
  setArtifactActions: (actions) => set({ artifactActions: actions }),

  aiPointerOpen: false,
  setAiPointerOpen: (v) => set({ aiPointerOpen: v }),

  dreamDiary: [],
  pushDiaryEntry: (e) =>
    set((s) => ({ dreamDiary: [e, ...s.dreamDiary].slice(0, 30) })),
  clearDiary: () => set({ dreamDiary: [] }),

  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  powerMode: readPowerMode(),
  togglePowerMode: () =>
    set((s) => {
      const next = !s.powerMode
      writePowerMode(next)
      return { powerMode: next, fullscreenView: next ? s.fullscreenView : false }
    }),
  setPowerMode: (v) => {
    writePowerMode(v)
    set((s) => ({ powerMode: v, fullscreenView: v ? s.fullscreenView : false }))
  },

  devMode: false,
  setDevMode: (v) => set({ devMode: v }),

  composerMode: 'auto',
  setComposerMode: (m) => set({ composerMode: normalizeChatMode(m) }),
  composerValue: '',
  setComposerValue: (v) => set({ composerValue: v }),

  // Default = inbuilt EveryAIOS (not an ACP harness).
  selectedAgentId: 'everyaios-native',
  setSelectedAgent: (id) => {
    const next = AGENT_MAP[id]
    if (!next) return
    // Switching agent snaps model to its default unless current model is also supported
    const supported = next.models
    set((s) => {
      const keepModel = supported.includes(s.selectedModelId)
      return {
        selectedAgentId: id,
        selectedModelId: keepModel ? s.selectedModelId : getDefaultModelForAgent(id),
      }
    })
  },
  selectedModelId: getDefaultModelForAgent('everyaios-native'),
  setSelectedModel: (id) => set({ selectedModelId: id }),
  personaId: 'straight-shooter',
  setPersonaId: (id) => set({ personaId: id }),
  soulId: 'default',
  setSoulId: (id) => set({ soulId: id }),
  agentName: '',
  setAgentName: (name) => set({ agentName: name }),
  localRuntime: undefined,
  localCtxWindow: undefined,
  setLocalRuntime: (runtime, ctx) => set({ localRuntime: runtime, localCtxWindow: ctx }),
  streamStats: { tokensPerSec: 0, ctxPct: 0, tokensThisTurn: 0 },
  // P11.5.12 — reconnect chip state: set when the IPC stream drops, cleared
  // when the stream resumes or the user dismisses the chip.
  reconnect: { show: false, lastToken: '', tokens: 0 },
  setReconnect: (r) => set({ reconnect: r }),
  noteStreamTick: (tokenCount) => {
    const now = Date.now()
    if (streamT0 === 0) streamT0 = now
    streamTok += tokenCount
    const elapsed = Math.max(0.25, (now - streamT0) / 1000)
    set((s) => {
      const sess = s.sessions.find((x) => x.id === s.activeSessionId)
      const used = (sess?.tokens ?? 0) + streamTok
      const ctxWindow = 128_000
      return {
        streamStats: {
          tokensPerSec: streamTok / elapsed,
          tokensThisTurn: streamTok,
          ctxPct: Math.min(100, Math.round((used / ctxWindow) * 100)),
          activeKey: s.streamStats.activeKey,
        },
      }
    })
  },
  forkFromMessage: (messageId) => {
    const s = get()
    const cur = s.sessions.find((x) => x.id === s.activeSessionId)
    if (!cur) return
    const idx = cur.messages.findIndex((m) => m.id === messageId)
    if (idx < 0) return
    const id = `s-${Date.now()}`
    const forked: Session = {
      ...cur,
      id,
      parentId: cur.id,
      title: `${cur.title} ⑂`,
      status: 'idle',
      updatedAt: new Date().toISOString(),
      messages: cur.messages.slice(0, idx + 1).map((m) => ({ ...m })),
      children: undefined,
    }
    set({
      sessions: [forked, ...s.sessions],
      activeSessionId: id,
      centerScreen: 'chat',
    })
    get().notify(`Forked from message — history truncated after that turn`)
  },

  autoRoute: true,
  setAutoRoute: (v) => set({ autoRoute: v }),
  routing: { ...DEFAULT_ROUTING },
  setRouting: (task, agentId) =>
    set((s) => ({ routing: { ...s.routing, [task]: agentId } })),

  centerScreen: 'home',
  setCenterScreen: (s) => set({ centerScreen: s }),
  settingsSection: 'agents',
  setSettingsSection: (s) => set({ settingsSection: s }),
  permissionMode: readPermission(),
  setPermissionMode: (m) => {
    writePermission(m)
    set({ permissionMode: m })
    // P44.5 — push the level to the live GuardService (Rust preset is
    // authoritative). The returned level confirms what actually applied.
    if (inTauri()) {
      void guardSetAutonomy(m).then((applied) => {
        if (applied && applied !== m) {
          writePermission(applied)
          set({ permissionMode: applied })
        }
      })
    }
  },

  // P44.5 — reconcile the UI autonomy level with the Rust preset on load:
  // the applied GuardService level wins over stale localStorage.
  syncAutonomyFromRust: async () => {
    if (!inTauri()) return
    const level = await guardAutonomy()
    if (level) {
      writePermission(level)
      set({ permissionMode: level })
    }
  },

  // P44.6 — freeze the autonomy scope at task start; live chatbar changes
  // never mutate an in-flight Work (same principle as scheduled-run
  // snapshots — the config_hash is computed once and stays put).
  taskSnapshot: undefined,
  freezeTaskSnapshot: () => {
    const s = get()
    const session = s.sessions.find((x) => x.id === s.activeSessionId)
    const workspace = session?.folder ?? s.taskFolder ?? '~'
    const agent = s.selectedAgentId || 'everyaios-native'
    const configHash = taskScopeHash(s.permissionMode, s.composerMode, workspace, agent)
    set({
      taskSnapshot: {
        frozenAt: Date.now(),
        autonomyLevel: s.permissionMode,
        mode: s.composerMode,
        workspaceScope: workspace,
        agentScope: agent,
        sessionId: s.activeSessionId,
        configHash,
      },
    })
  },
  clearTaskSnapshot: () => set({ taskSnapshot: undefined }),
  respondAutonomyCard: (id, choice) => {
    const snap = get().taskSnapshot
    const base = snap?.autonomyLevel ?? get().permissionMode
    let nextLevel: PermissionMode = base
    const now = Date.now()
    if (choice === 'do-once') {
      nextLevel = 'auto'
      set({
        taskSnapshot: snap
          ? {
              ...snap,
              elevation: { level: 'auto', grantedAt: now, oneShot: true },
            }
          : undefined,
      })
    } else if (choice === 'allow-task') {
      nextLevel = 'auto'
      // Temporary elevation: expires when the task snapshot is cleared at
      // turn completion (and is wall-clock capped as a backstop).
      set({
        taskSnapshot: snap
          ? {
              ...snap,
              elevation: {
                level: 'auto',
                grantedAt: now,
                oneShot: false,
                elevatedUntil: now + 30 * 60_000,
              },
            }
          : undefined,
      })
    } else if (choice === 'change-level' && snap) {
      // Change Level — pick the level from the card options; the card sends
      // the target level as the choice value (e.g. "level:auto").
      const target = choice.startsWith('level:') ? (choice.slice(6) as PermissionMode) : 'auto'
      nextLevel = target
      set({
        permissionMode: target,
        taskSnapshot: { ...snap, autonomyLevel: target, elevation: undefined },
      })
      writePermission(target)
    }
    // Consume the card (clear it off the message, resume the session).
    set((s) => ({
      sessions: s.sessions.map((x) => ({
        ...x,
        status: x.status === 'action-required' ? 'running' : x.status,
        messages: x.messages
          .map((m) => (m.mcq?.id === id ? { ...m, mcq: undefined } : m))
          .filter((m) => m.content !== '' || m.mcq !== undefined || m.role !== 'assistant'),
      })),
    }))
    return nextLevel
  },
  pushAutonomyLimit: (opts) => {
    const snap = get().taskSnapshot
    const level = snap?.autonomyLevel ?? get().permissionMode
    get().pushMcq(
      {
        id: opts.id,
        title: 'Autonomy limit',
        description: `This action is above the frozen autonomy level (${level}) for this task.`, 
        kind: 'autonomy',
        autonomyAction: opts.action,
        autonomyReason: opts.reason,
        options: [
          { label: 'Do Once', value: 'do-once' },
          { label: 'Allow For This Task', value: 'allow-task' },
          { label: 'Change Level', value: 'change-level' },
        ],
      },
      opts.sessionId,
    )
  },
  effectiveAutonomyLevel: () => {
    const snap = get().taskSnapshot
    if (!snap) return get().permissionMode
    const el = snap.elevation
    if (el) {
      if (el.oneShot) {
        // Do Once — the elevation is consumed on first use.
        set({
          taskSnapshot: { ...snap, elevation: undefined },
        })
        return el.level
      }
      if (!el.elevatedUntil || el.elevatedUntil > Date.now()) return el.level
      // Wall-clock expiry backstop — elevation over.
      set({ taskSnapshot: { ...snap, elevation: undefined } })
    }
    return snap.autonomyLevel
  },
  composerRole: 'agent',
  setComposerRole: (r) => set({ composerRole: r }),
  taskIntent: 'work',
  setTaskIntent: (t) => set({ taskIntent: t }),
  taskFolder: undefined,
  setTaskFolder: (folder) => set({ taskFolder: folder }),

  officeFlyoutOpen: false,
  setOfficeFlyoutOpen: (v) => set({ officeFlyoutOpen: v }),

  paletteOpen: false,
  setPaletteOpen: (v) => set({ paletteOpen: v }),

  agentPaused: false,
  toggleAgentPause: () => {
    const s = get()
    const pausing = !s.agentPaused
    if (pausing && inTauri()) {
      const streamId = s.liveStreamId[s.activeSessionId]
      if (streamId) {
        void import('./tauri').then(({ chatCancel }) => {
          void chatCancel(streamId).catch(() => {})
        })
      }
    }
    set({ agentPaused: pausing })
  },

  lastToast: undefined,
  lastToastKind: 'default',
  notify: (msg, kind = 'default') => set({ lastToast: msg, lastToastKind: kind }),
  notifyMcpError: (msg) => set({ lastToast: msg, lastToastKind: 'error' }),

  liveAgents: [],
  setLiveAgents: (a) => set({ liveAgents: a }),
  liveBudget: undefined,
  setLiveBudget: (b) => set({ liveBudget: b }),

  liveStreamId: {},
  setLiveStreamId: (sessionId, streamId) =>
    set((s) => ({ liveStreamId: { ...s.liveStreamId, [sessionId]: streamId } })),

  pushUserMessage: (text) => {
    const id = `u-${Date.now()}`
    const msg: ChatMessage = {
      id,
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    }
    set((s) => ({
      composerValue: '',
      sessions: s.sessions.map((x) =>
        x.id === s.activeSessionId
          ? { ...x, status: 'running', messages: [...x.messages, msg] }
          : x,
      ),
    }))
  },
  streamStart: (sessionId?) => {
    const sid = streamSessionId(sessionId)
    if (hasActiveStream(sid)) return
    const id = `a-${Date.now()}-${sid.slice(-6)}`
    activeStreamMsg[sid] = id
    streamT0 = Date.now()
    streamTok = 0
    const msg: ChatMessage = {
      id,
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
    }
    set((s) => ({
      sessions: s.sessions.map((x) =>
        x.id === sid
          ? { ...x, status: 'running', messages: [...x.messages, msg] }
          : x,
      ),
    }))
  },
  streamAppend: (text, done, sessionId?) => {
    const sid = streamSessionId(sessionId)
    const msgId = activeStreamMsg[sid]
    if (!msgId) return
    set((s) => ({
      sessions: s.sessions.map((x) => {
        if (x.id !== sid) return x
        return {
          ...x,
          status: done ? 'completed' : 'running',
          messages: x.messages.map((m) =>
            m.id === msgId ? { ...m, content: m.content + text } : m,
          ),
        }
      }),
    }))
    if (done) {
      delete activeStreamMsg[sid]
      streamT0 = 0
      // P44.6 — the turn is over: the frozen snapshot + any temporary
      // elevation expire here (live changes never leak into the next task).
      set((s) => ({ taskSnapshot: undefined }))
    }
  },
  /** P-bugfix 1: the `done` chat-event carries the *whole* message (fullText)
   * after `batch` deltas were already appended token-by-token. Appending it
   * would duplicate the reply, so this **replaces** the streamed content with
   * the authoritative final text (and clears the in-flight cursor). */
  streamFinalize: (fullText, sessionId?) => {
    const sid = streamSessionId(sessionId)
    const msgId = activeStreamMsg[sid]
    if (!msgId) return
    set((s) => ({
      sessions: s.sessions.map((x) => {
        if (x.id !== sid) return x
        return {
          ...x,
          status: 'completed',
          messages: x.messages.map((m) =>
            m.id === msgId ? { ...m, content: fullText } : m,
          ),
        }
      }),
    }))
    delete activeStreamMsg[sid]
    streamT0 = 0
    // P44.6 — turn complete: the frozen task scope + elevation expire.
    set({ taskSnapshot: undefined })
    // P11.6.4 — local UX metric: a completed turn.
    recordTurnCompleted()
  },
  streamFail: (msg, sessionId?) => {
    const sid = streamSessionId(sessionId)
    const msgId = activeStreamMsg[sid]
    // P11.6.4 — local UX metric: a failed turn (only when one was attempted).
    if (msgId) recordTurnFailed()
    set((s) => ({
      sessions: s.sessions.map((x) => {
        if (x.id !== sid) return x
        return {
          ...x,
          status: 'failed',
          messages: msgId
            ? x.messages.map((m) =>
                m.id === msgId ? { ...m, content: `⚠ ${msg}` } : m,
              )
            : x.messages,
        }
      }),
    }))
    delete activeStreamMsg[sid]
    // P44.6 — failed turn: the frozen task scope + elevation expire.
    set({ taskSnapshot: undefined })
  },
  streamBudgetKill: (msg, sessionId?) => {
    const sid = streamSessionId(sessionId)
    const msgId = activeStreamMsg[sid]
    set((s) => ({
      sessions: s.sessions.map((x) => {
        if (x.id !== sid) return x
        return {
          ...x,
          status: 'failed',
          messages: msgId
            ? x.messages.map((m) =>
                m.id === msgId ? { ...m, content: `⛔ ${msg}` } : m,
              )
            : x.messages,
        }
      }),
    }))
    delete activeStreamMsg[sid]
    // P44.6 — budget kill ends the task: frozen scope + elevation expire.
    set({ taskSnapshot: undefined })
  },
  streamToolCall: (toolId, args, risk) => {
    if (!hasActiveStream(streamSessionId())) get().streamStart()
    const rec: ToolCallRecord = {
      id: `tc-${Date.now()}-${toolId}`,
      toolId,
      status: 'running',
      ...(args ? { args } : {}),
      ...(risk ? { risk } : {}),
    }
    patchActiveAssistant(set, (m) => ({
      ...m,
      toolCalls: [...(m.toolCalls ?? []), rec],
    }))
  },
  streamToolResult: (toolId, result, error) => {
    patchActiveAssistant(set, (m) => {
      const list = [...(m.toolCalls ?? [])]
      const idx = [...list].reverse().findIndex((t) => t.toolId === toolId && t.status === 'running')
      const real = idx === -1 ? -1 : list.length - 1 - idx
      if (real >= 0) {
        list[real] = {
          ...list[real]!,
          result,
          error,
          status: error ? 'failed' : 'done',
        }
      } else {
        list.push({
          id: `tc-${Date.now()}-${toolId}`,
          toolId,
          result,
          error,
          status: error ? 'failed' : 'done',
        })
      }
      return { ...m, toolCalls: list }
    })
    // P11.6.4 — local UX metric: first successful tool result = time-to-value.
    if (!error) recordToolResult()
  },
  streamToolProgress: (toolId, progress) => {
    patchActiveAssistant(set, (m) => {
      const list = (m.toolCalls ?? []).map((t) =>
        t.toolId === toolId && t.status === 'running' ? { ...t, progress } : t,
      )
      return { ...m, toolCalls: list }
    })
  },
  retryToolCall: async (recordId) => {
    const st = get()
    const session = st.sessions.find((x) => x.id === st.activeSessionId)
    const rec = session?.messages.flatMap((m) => m.toolCalls ?? []).find((t) => t.id === recordId)
    if (!rec) return
    patchActiveAssistant(set, (m) => ({
      ...m,
      toolCalls: (m.toolCalls ?? []).map((t) =>
        t.id === recordId
          ? { ...t, status: 'running' as const, error: undefined, progress: 'retrying…' }
          : t,
      ),
    }))
    if (!inTauri()) {
      st.notify('Preview mode — retry needs the live executor')
      return
    }
    try {
      const { chatToolRetry } = await import('./tauri')
      await chatToolRetry({
        sessionId: st.activeSessionId,
        streamId: activeStreamMsg[st.activeSessionId] ?? recordId,
        toolId: rec.toolId,
        args: rec.args ?? {},
      })
    } catch (err) {
      patchActiveAssistant(set, (m) => ({
        ...m,
        toolCalls: (m.toolCalls ?? []).map((t) =>
          t.id === recordId
            ? {
                ...t,
                status: 'failed' as const,
                error: err instanceof Error ? err.message : String(err),
              }
            : t,
        ),
      }))
    }
  },
  streamStep: (label) => {
    set((s) => {
      const session = s.sessions.find((x) => x.id === s.activeSessionId)
      if (!session) return {}
      const steps: ProgressStep[] = session.messages
        .flatMap((m) => m.steps ?? [])
        .slice(-5)
      const last = steps[steps.length - 1]
      const merged = last && last.status === 'active'
        ? steps.map((p, i) => (i === steps.length - 1 ? { ...p, label, status: 'done' as const } : p))
        : [...steps, { id: `p-${Date.now()}`, label, status: 'active' as const, type: 'tool' as const }]
      return {
        sessions: s.sessions.map((x) => {
          if (x.id !== s.activeSessionId) return x
          const lastMsg = x.messages[x.messages.length - 1]
          if (!lastMsg || lastMsg.role !== 'assistant') return x
          return {
            ...x,
            messages: x.messages.map((m, i) =>
              i === x.messages.length - 1 ? { ...m, steps: merged } : m,
            ),
          }
        }),
      }
    })
  },
  pushMcq: (mcq, sessionId) => {
    const targetId = sessionId ?? get().activeSessionId
    set((s) => {
      const target = s.sessions.find((x) => x.id === targetId)
      if (!target) return {}
      // Skip if this card is already attached to any message
      const already = target.messages.some((m) => m.mcq?.id === mcq.id)
      if (already) return {}
      const last = target.messages[target.messages.length - 1]
      if (last && last.role === 'assistant' && !last.mcq) {
        return {
          sessions: s.sessions.map((x) =>
            x.id === targetId
              ? {
                  ...x,
                  status: 'action-required',
                  messages: x.messages.map((m, i) =>
                    i === x.messages.length - 1 ? { ...m, mcq } : m,
                  ),
                }
              : x,
          ),
        }
      }
      const standalone: ChatMessage = {
        id: `mcq-${mcq.id}`,
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
        mcq,
      }
      return {
        sessions: s.sessions.map((x) =>
          x.id === targetId
            ? { ...x, status: 'action-required', messages: [...x.messages, standalone] }
            : x,
        ),
      }
    })
  },
  respondMcq: (id, choice) => {
    // P44.6 — autonomy-limit cards are resolved entirely in the UI: the
    // elevation / level change lives in the frozen task snapshot, never a
    // Guard bypass (the permission engine still evaluates every effect).
    const autonomyKind = get().sessions
      .flatMap((s) => s.messages)
      .find((m) => m.mcq?.id === id)?.mcq?.kind
    if (autonomyKind === 'autonomy') {
      get().respondAutonomyCard(id, choice)
      return
    }
    void (async () => {
      // Real shell: route by card kind — permission tickets go to Guard-2,
      // P6.3 circuit-break interrupts go to the plan executor (planRespond).
      if (!inTauri()) {
        get().notify('Preview mode — approval actions are not connected to a live executor')
        return
      }
      try {
        const kind = get().sessions
          .flatMap((s) => s.messages)
          .find((m) => m.mcq?.id === id)?.mcq?.kind
        if (kind === 'plan') {
          const pending = get().pendingPlan
          if (choice === 'approve' && pending) {
            const { planExecute } = await import('./tauri')
            await planExecute({
              sessionId: get().activeSessionId,
              planId: pending.planId,
              tasks: pending.tasks,
            })
          }
          get().setPendingPlan(undefined)
          clearMcq(id)
          return
        }
        if (kind === 'mcq') {
          const { planRespond } = await import('./tauri')
          await planRespond(id, choice)
          clearMcq(id)
          return
        }
        // F1 — approval happens in the dedicated guard window, never in the
        // main renderer. Keep the card visible until that window records the
        // decision; removing it here would falsely imply approval.
        const { openGuardWindow } = await import('./guard')
        await openGuardWindow()
        get().notify('Guard-2: approval opened in the dedicated window')
      } catch (error) {
        get().notify(`Approval action failed: ${error instanceof Error ? error.message : String(error)}`, 'error')
      }
    })()

    function clearMcq(cardId: string) {
      set((s) => ({
        sessions: s.sessions.map((x) => ({
          ...x,
          status: x.status === 'action-required' ? 'running' : x.status,
          messages: x.messages
            .map((m) => (m.mcq?.id === cardId ? { ...m, mcq: undefined } : m))
            .filter((m) => m.content !== '' || m.mcq !== undefined || m.role !== 'assistant'),
        })),
      }))
    }
  },

  acpHandles: {},
  setAcpHandle: (agentId, handle) =>
    set((s) => ({ acpHandles: { ...s.acpHandles, [agentId]: handle } })),

  pendingPlan: undefined,
  setPendingPlan: (p) => set({ pendingPlan: p }),

  pendingEditorWrites: {},
  parkEditorWrite: (ticketId, w) =>
    set((s) => ({ pendingEditorWrites: { ...s.pendingEditorWrites, [ticketId]: w } })),
  takeEditorWrite: (ticketId) => {
    const w = get().pendingEditorWrites[ticketId]
    if (!w) return undefined
    set((s) => {
      const next = { ...s.pendingEditorWrites }
      delete next[ticketId]
      return { pendingEditorWrites: next }
    })
    return w
  },

  verifications: [],
  pushVerification: (v) =>
    set((s) => ({ verifications: [...s.verifications.slice(-49), v] })),

  // P11.2 — onboarding. Persisted so the flow only shows on first launch.
  onboardingDone: (() => {
    if (typeof window === 'undefined') return true
    try {
      return window.localStorage.getItem('everyaios.settings.onboardingDone') === '1'
    } catch {
      return true
    }
  })(),
  setOnboardingDone: (v) => {
    try {
      window.localStorage.setItem('everyaios.settings.onboardingDone', v ? '1' : '0')
    } catch {
      /* storage may be unavailable */
    }
    set({ onboardingDone: v })
  },

  // P11.5.3 — per-session layout persistence. Save on session switch/view
  // change; restore on session activation (rail/view/composer back to where
  // the user left them; new sessions stay rail-collapsed until a tool needs
  // a view — the Cursor reset bug we do not copy).
  sessionLayouts: {},
  saveSessionLayout: (sessionId, partial) => {
    set((s) => {
      const next = { ...(s.sessionLayouts[sessionId] ?? {}), ...partial }
      try {
        window.localStorage.setItem(
          `everyaios.layout.${sessionId}`,
          JSON.stringify(next),
        )
      } catch {
        /* ignore */
      }
      return { sessionLayouts: { ...s.sessionLayouts, [sessionId]: next } }
    })
  },
  restoreSessionLayout: (sessionId) => {
    let saved: SessionLayout | undefined
    try {
      const raw = window.localStorage.getItem(`everyaios.layout.${sessionId}`)
      if (raw) saved = JSON.parse(raw) as SessionLayout
    } catch {
      /* ignore */
    }
    if (!saved) return
    set((s) => ({
      activeView: saved.view ?? s.activeView,
      railCollapsed: saved.railCollapsed ?? s.railCollapsed,
      composerMode: normalizeChatMode(saved.composerMode ?? s.composerMode),
      openViews: saved.openViews && saved.openViews.length > 0 ? saved.openViews : s.openViews,
      sessions: s.sessions.map((x) =>
        x.id === sessionId
          ? {
              ...x,
              view: saved.view ?? x.view,
              officeDoc: saved.officeDoc ?? x.officeDoc,
              railCollapsed: saved.railCollapsed ?? x.railCollapsed,
            }
          : x,
      ),
    }))
  },

  // P11.5.4 — per-session takeover pause. The agent loop is paused (editable
  // panels) until the user resumes with a describe-changes note.
  pausedSessions: {},
  setSessionPaused: (sessionId, paused) =>
    set((s) => ({
      pausedSessions: { ...s.pausedSessions, [sessionId]: paused },
      sessions: s.sessions.map((x) =>
        x.id === sessionId ? { ...x, status: paused ? 'paused' : 'idle' } : x,
      ),
    })),

  // P11.5.3 — real pending patches from `fs_undo_list` (diff view source).
  pendingPatches: [],
  setPendingPatches: (patches) => set({ pendingPatches: patches }),

  // P11.5.5 — NL automation draft text.
  nlAutomationDraft: undefined,
  setNlAutomationDraft: (v) => set({ nlAutomationDraft: v }),
}))

/** Vault-backed persist (Codex JSONL / Claude transcripts analog). The browser
 * preview keeps mockSessions; the shell loads via `session_list` in initBridge.
 * Persistence only engages after the shell owns the list (`sessionsHydrated`) —
 * otherwise a boot-time state write would stamp preview chats into the real vault. */
if (typeof window !== 'undefined') {
  let persistTimer: ReturnType<typeof setTimeout> | undefined
  useAppStore.subscribe((s) => {
    if (!inTauri()) return
    if (!s.sessionsHydrated) return // never persist the demo seed (bugfix 3)
    if (persistTimer) clearTimeout(persistTimer)
    persistTimer = setTimeout(() => {
      void (async () => {
        try {
          const { invoke } = await import('./tauri')
          for (const sess of s.sessions) {
            await invoke('session_put', { session: sess })
          }
        } catch (error) {
          // Persistence failure is a product state, not a recoverable no-op:
          // keep the in-memory UI intact but tell the runtime and user that
          // the latest session projection is not durable.
          setRuntimeState('degraded', `session persistence: ${runtimeError(error)}`)
          s.notify('Session changes could not be saved. Check the vault and retry.', 'error')
        }
      })()
    }, 400)
  })
}
