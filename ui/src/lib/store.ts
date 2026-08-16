import { create } from 'zustand'
import {
  AGENT_MAP,
  DEFAULT_ROUTING,
  getDefaultModelForAgent,
  type AgentRuntime,
  type TaskKind,
} from './agents'

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

export type ChatMode = 'normal' | 'plan' | 'research' | 'quick' | 'code'

export type SessionStatus =
  | 'idle'
  | 'running'
  | 'action-required'
  | 'completed'
  | 'failed'
  | 'paused'
  | 'scheduled'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: string
  artifacts?: Artifact[]
  steps?: ProgressStep[]
  mcq?: MCQInterrupt
  reasoning?: string[]
  pinned?: boolean
}

export interface Artifact {
  id: string
  name: string
  type: 'docx' | 'xlsx' | 'pptx' | 'pdf' | 'code' | 'markdown' | 'image'
  preview: string
  view?: ViewId
}

export interface ProgressStep {
  id: string
  label: string
  status: 'done' | 'active' | 'pending'
  type: 'file' | 'edit' | 'chart' | 'browser' | 'shell' | 'code' | 'office' | 'export' | 'tool'
  detail?: string
  output?: string
  timestamp?: string
}

export interface MCQInterrupt {
  id: string
  title: string
  description: string
  kind: 'diff' | 'permission' | 'mcq' | 'budget'
  diff?: { file: string; added: string[]; removed: string[] }[]
  options?: { label: string; value: string }[]
  budget?: { used: number; cap: number }
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

// The assistant message currently being streamed (module-level, since zustand
// actions can't hold instance state).
let activeStreamMsgId: string | null = null

// === Zustand store ============================================================

interface AppState {
  // Sessions & navigation
  sessions: Session[]
  activeSessionId: string
  setActiveSession: (id: string) => void

  // Active view (right viewport)
  activeView: ViewId
  setActiveView: (v: ViewId) => void
  railCollapsed: boolean
  toggleRail: () => void
  setRailCollapsed: (v: boolean) => void

  // Sidebar collapse
  sidebarCollapsed: boolean
  toggleSidebar: () => void

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

  // Auto-route per task kind — when true, agent selection follows routing table
  autoRoute: boolean
  setAutoRoute: (v: boolean) => void
  routing: Record<TaskKind, string>
  setRouting: (task: TaskKind, agentId: string) => void

  // Left-panel mode (which sub-screen is showing in the center for non-chat panels)
  centerScreen: 'chat' | 'automations' | 'memory' | 'guard' | 'connectors' | 'analytics' | 'settings'
  setCenterScreen: (s: AppState['centerScreen']) => void

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
  notify: (msg: string) => void

  // Live data (bridge) — empty/demo values until the shell answers
  liveAgents: AgentRuntime[]
  setLiveAgents: (a: AgentRuntime[]) => void
  liveBudget?: LiveBudget
  setLiveBudget: (b: LiveBudget) => void

  // Chat streaming (bridge) — real turns through the Tauri relay
  pushUserMessage: (text: string) => void
  streamStart: () => void
  streamAppend: (text: string, done: boolean) => void
  streamFail: (msg: string) => void
  streamStep: (label: string) => void
}

export const useAppStore = create<AppState>((set, get) => ({
  sessions: mockSessions,
  activeSessionId: 's1',
  setActiveSession: (id) => set({ activeSessionId: id, centerScreen: 'chat' }),

  activeView: 'office-xlsx',
  setActiveView: (v) => set({ activeView: v, railCollapsed: false }),
  railCollapsed: false,
  toggleRail: () => set((s) => ({ railCollapsed: !s.railCollapsed })),
  setRailCollapsed: (v) => set({ railCollapsed: v }),

  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  composerMode: 'normal',
  setComposerMode: (m) => set({ composerMode: m }),
  composerValue: '',
  setComposerValue: (v) => set({ composerValue: v }),

  // Default to Claude Code driving Claude Sonnet 4.5
  selectedAgentId: 'claude-code',
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
  selectedModelId: 'claude-sonnet-4.5',
  setSelectedModel: (id) => set({ selectedModelId: id }),

  autoRoute: true,
  setAutoRoute: (v) => set({ autoRoute: v }),
  routing: { ...DEFAULT_ROUTING },
  setRouting: (task, agentId) =>
    set((s) => ({ routing: { ...s.routing, [task]: agentId } })),

  centerScreen: 'chat',
  setCenterScreen: (s) => set({ centerScreen: s }),

  officeFlyoutOpen: false,
  setOfficeFlyoutOpen: (v) => set({ officeFlyoutOpen: v }),

  paletteOpen: false,
  setPaletteOpen: (v) => set({ paletteOpen: v }),

  agentPaused: false,
  toggleAgentPause: () => set((s) => ({ agentPaused: !s.agentPaused })),

  lastToast: undefined,
  notify: (msg) => set({ lastToast: msg }),

  liveAgents: [],
  setLiveAgents: (a) => set({ liveAgents: a }),
  liveBudget: undefined,
  setLiveBudget: (b) => set({ liveBudget: b }),

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
  streamStart: () => {
    const id = `a-${Date.now()}`
    activeStreamMsgId = id
    const msg: ChatMessage = {
      id,
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
    }
    set((s) => ({
      sessions: s.sessions.map((x) =>
        x.id === s.activeSessionId
          ? { ...x, status: 'running', messages: [...x.messages, msg] }
          : x,
      ),
    }))
  },
  streamAppend: (text, done) => {
    const msgId = activeStreamMsgId
    if (!msgId) return
    set((s) => ({
      sessions: s.sessions.map((x) => {
        if (x.id !== s.activeSessionId) return x
        return {
          ...x,
          status: done ? 'completed' : 'running',
          messages: x.messages.map((m) =>
            m.id === msgId ? { ...m, content: m.content + text } : m,
          ),
        }
      }),
    }))
    if (done) activeStreamMsgId = null
  },
  streamFail: (msg) => {
    const msgId = activeStreamMsgId
    set((s) => ({
      sessions: s.sessions.map((x) => {
        if (x.id !== s.activeSessionId) return x
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
    activeStreamMsgId = null
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
}))
