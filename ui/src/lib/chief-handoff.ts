// P53.4 — compact-before-swap handoff bundle (spec §4.2.5a §4).
// On Chief change (and the first ACP turn after inbuilt work), the new loop
// receives the LIVE compacted view — not the raw disk history:
//   - compacted transcript (last N messages; snipped tool blobs + old
//     tool-call XML stripped — only user/assistant text survives);
//   - current goal (P51.9 finish line) + pending plan (P11.5.12 draft);
//   - taste (SOUL preset) — the Chief inherits the user's voice, not bytes;
//   - open file ref (scoped study doc title — a ref, never dumped bytes).
// Bounded (~6000 chars, the shell caps again) so a huge transcript never
// floods the agent's context. Pure (unit-tested); null = nothing worth
// handing off (empty transcript and no goal/plan).

import { useAppStore } from './store'
import { SOUL_PRESETS } from './personas'

const HANDOFF_TRANSCRIPT_TURNS = 12
const HANDOFF_MAX_CHARS = 5500

function stripToolBlobs(text: string): string {
  return text
    .replace(/<tool_result[\s\S]*?<\/tool_result>/gi, '[tool result snipped]')
    .replace(/<tool_call[\s\S]*?<\/tool_call>/gi, '[tool call snipped]')
    .replace(/```(?:json|xml)[\s\S]*?```/gi, (m) => (m.length > 400 ? '[large block snipped]' : m))
    .trim()
}

export function buildChiefHandoff(sessionId: string): string | null {
  const st = useAppStore.getState()
  const sess = st.sessions.find((s) => s.id === sessionId)
  if (!sess) return null
  const parts: string[] = []
  const tail = sess.messages.slice(-HANDOFF_TRANSCRIPT_TURNS).filter((m) => m.content?.trim())
  if (tail.length > 0) {
    const lines = tail.map((m) => {
      const who = m.role === 'user' ? 'User' : m.role === 'assistant' ? 'Assistant' : 'System'
      return `${who}: ${stripToolBlobs(m.content).slice(0, 800)}`
    })
    parts.push(`## Recent transcript (compacted, last ${tail.length} messages)\n${lines.join('\n\n')}`)
  }
  if (sess.goal?.trim()) parts.push(`## Current goal\n${sess.goal.trim().slice(0, 500)}`)
  const plan = st.pendingPlan?.sessionId === sessionId ? st.pendingPlan : undefined
  if (plan && plan.tasks.length > 0) {
    parts.push(
      `## Open plan (${plan.tasks.length} tasks)\n${plan.tasks.map((t, i) => `${i + 1}. ${t.goal}`).join('\n').slice(0, 1200)}`,
    )
  }
  const soul = SOUL_PRESETS[st.soulId]
  if (soul?.trim()) parts.push(`## Taste\n${soul.trim().slice(0, 600)}`)
  if (st.scopedDoc?.title) parts.push(`## Open file (ref — read via workspace tools)\n${st.scopedDoc.title}`)
  if (parts.length === 0) return null
  const bundle = `Chief handoff — continuing work in session ${sessionId} (compacted view, not raw history):\n\n${parts.join('\n\n')}`
  return bundle.length > HANDOFF_MAX_CHARS ? `${bundle.slice(0, HANDOFF_MAX_CHARS)}\n…[truncated]` : bundle
}
