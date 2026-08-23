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
