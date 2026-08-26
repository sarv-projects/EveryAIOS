// P11.5.6 — memory browser bridge. `memoryRequest` is the generic `memory/*`
// JSON-RPC passthrough; `memoryRead` is the read-and-rank shortcut the panel's
// search box uses. Without the shell, the demo returns a small canned store.

import { invoke, inTauri } from './tauri'

export async function memoryRequest(
  method: string,
  params: Record<string, unknown> = {},
): Promise<unknown> {
  if (!inTauri()) return demoHandle(method, params)
  return invoke('memory_request', { method, params })
}

export async function memoryRead(
  query: string,
  k = 8,
): Promise<{ query: string; results: string[] }> {
  if (!inTauri()) {
    const results = demoMemory.filter((f) => f.toLowerCase().includes(query.toLowerCase())).slice(0, k)
    return { query, results }
  }
  return invoke('memory_read', { query, k })
}

/** One fact row from `memory/status` (the live provenance surface). */
export interface MemoryFact {
  id: string
  sessionId: string
  text: string
  importance: number
  status: 'active' | 'superseded'
  createdAtMs: number
  updatedAtMs: number
  source: string
  sourceId: string
}

export interface MemoryStatus {
  facts: MemoryFact[]
  active: number
  superseded: number
}

/**
 * P5.22 — the live fact store (`memory/status`): the panel's knowledge /
 * episodic / graph tabs render real MemoryService rows instead of mocks.
 * Demo fallback in plain-browser preview.
 */
export async function memoryFacts(): Promise<MemoryStatus> {
  if (!inTauri()) {
    const now = Date.now()
    return {
      facts: demoMemory.map((text, i) => ({
        id: `mem:demo${i}`,
        sessionId: 'demo',
        text,
        importance: 8,
        status: 'active',
        createdAtMs: now - i * 86_400_000,
        updatedAtMs: now - i * 86_400_000,
        source: 'demo',
        sourceId: 'preview',
      })),
      active: demoMemory.length,
      superseded: 0,
    }
  }
  return invoke('memory_request', { method: 'memory/status', params: {} })
}

/** One node from the live GraphStore (`memory/graph`). */
export interface GraphNode {
  id: string
  kind: string
  label: string
  recordedAtMs: number
}

export interface GraphEdge {
  src: string
  dst: string
  ty: string
  weight: number
}

export interface MemoryGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
  nodeCount: number
  edgeCount: number
}

/** One episodic record (`memory/episodes`): facts grouped by session. */
export interface MemoryEpisode {
  sessionId: string
  count: number
  latestMs: number
  preview: string[]
}

export interface MemoryEpisodes {
  episodes: MemoryEpisode[]
  total: number
}

/**
 * P5.22 — the real Knowledge-Graph surface: the GraphStore every memory
 * write feeds (Episodic nodes + session→fact DerivedFrom edges), not a
 * restyled fact list. Demo fallback in preview.
 */
export async function memoryGraph(): Promise<MemoryGraph> {
  if (!inTauri()) {
    const now = Date.now()
    return {
      nodes: demoMemory.slice(0, 6).map((text, i) => ({
        id: `mem:demo${i}`,
        kind: 'episodic',
        label: 'demo',
        recordedAtMs: now - i * 86_400_000,
      })),
      edges: demoMemory.slice(1, 6).map((_, i) => ({
        src: `mem:demo${i}`,
        dst: `mem:demo${i + 1}`,
        ty: 'derivedfrom',
        weight: 1,
      })),
      nodeCount: 6,
      edgeCount: 5,
    }
  }
  return invoke('memory_request', { method: 'memory/graph', params: {} })
}

/**
 * P5.22 — the episodic surface: active facts grouped per session (recency +
 * preview), distinct from the flat fact list. Demo fallback in preview.
 */
export async function memoryEpisodes(): Promise<MemoryEpisodes> {
  if (!inTauri()) {
    return {
      episodes: demoMemory.slice(0, 4).map((text, i) => ({
        sessionId: `demo-${i + 1}`,
        count: 1,
        latestMs: Date.now() - i * 86_400_000,
        preview: [text],
      })),
      total: 4,
    }
  }
  return invoke('memory_request', { method: 'memory/episodes', params: {} })
}

// Demo fallback (preview only — the Tauri path hits the live MemoryService).
const demoMemory = [
  'User prefers concise answers with bullet points',
  'Project Q3 uses the xlsx financial workbook in ~/work/q3-report',
  'User works best with plan-first workflow (approve before executing)',
  'The exec-summary.docx document tracks quarterly goals',
  'User dislikes unsolicited tool calls on read-only turns',
  'EveryAIOS vault keys live in the encrypted SQLCipher store',
  'User often asks for Claude-sonnet for planning, gpt-5-codex for coding',
  'The pitch.pptx deck uses the orange brand accent',
]

function demoHandle(method: string, params: Record<string, unknown>): unknown {
  if (method === 'memory/read' || method === 'memory/search') {
    const q = String((params.query as string) ?? '')
    return demoMemory.filter((f) => f.toLowerCase().includes(q.toLowerCase())).slice(0, 8)
  }
  if (method === 'memory/snapshot' || method === 'memory/status') {
    return { episodes: 47, facts: demoMemory.length, sources: 'demo' }
  }
  return { ok: true }
}
