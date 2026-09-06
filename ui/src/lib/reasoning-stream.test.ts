// P52.23 — CoT (reasoning) delta-stream lifecycle. Provider reasoning arrives
// as many small wire chunks; the store coalesces them per thought block so the
// collapsible renders whole thoughts, never fragments. Also pins the turn/tool
// timing fields that power the live clocks in the message UI.

import { afterAll, describe, expect, test } from 'bun:test'
import { resetStreamingTestState, useAppStore } from './store'

function freshSession(): string {
  // Full isolation: the store is module-global across bun test files, so the
  // stream registry must be clean before each scenario.
  resetStreamingTestState()
  useAppStore.getState().markSessionsHydrated()
  useAppStore.getState().newSession()
  return useAppStore.getState().activeSessionId
}

afterAll(() => resetStreamingTestState())

/** Every test closes its streams — the stream registry is module-global
 * keyed by session, so an un-finalized turn in one test would misdirect the
 * next test's stream actions onto a stale session. */
function closeStream(sid: string) {
  useAppStore.getState().streamFinalize('(test end)', sid)
}

function lastMessage(sessionId: string) {
  const sess = useAppStore.getState().sessions.find((s) => s.id === sessionId)
  return sess?.messages[sess.messages.length - 1]
}

describe('P52.23 — reasoning delta stream', () => {
  test('reasoning deltas coalesce onto one thought block while streaming', () => {
    const sid = freshSession()
    const st = useAppStore.getState()
    st.streamStart(sid)
    // Two users racing the stream: never assert on wall-clock timing beyond
    // existence — coalescing is the contract here.
    st.appendReasoning('The file was', sid)
    st.appendReasoning(' last written at', sid)
    st.appendReasoning(' 14:02', sid)
    let m = lastMessage(sid)!
    expect(m.reasoning).toHaveLength(1)
    expect(m.reasoning![0]).toBe('The file was last written at 14:02')
    expect(m.reasoningStartedAt).toBeGreaterThan(0)
    // A settled message starts a new thought block rather than extending the
    // previous one.
    st.streamFinalize('done', sid)
    st.streamStart(sid)
    st.appendReasoning('second thought', sid)
    m = lastMessage(sid)!
    expect(m.reasoning).toHaveLength(1)
    expect(m.reasoning![0]).toBe('second thought')
    closeStream(sid)
  })

  test('reasoning without an active assistant turn is dropped (never fabricated)', () => {
    freshSession() // no stream started
    const st = useAppStore.getState()
    st.appendReasoning('orphan delta', useAppStore.getState().activeSessionId)
    // newSession created a session with zero messages; the orphan must not
    // spawn a message.
    expect(useAppStore.getState().sessions[0].messages).toHaveLength(0)
  })

  test('empty reasoning deltas are ignored', () => {
    const sid = freshSession()
    const st = useAppStore.getState()
    st.streamStart(sid)
    st.appendReasoning('', sid)
    expect(lastMessage(sid)!.reasoning ?? []).toHaveLength(0)
    closeStream(sid)
  })

  test('finalize stamps endedAt; startedAt lands at stream start', () => {
    const sid = freshSession()
    const st = useAppStore.getState()
    const before = Date.now()
    st.streamStart(sid)
    st.appendReasoning('think', sid)
    st.streamFinalize('answer', sid)
    const m = lastMessage(sid)!
    expect(m.endedAt).toBeGreaterThanOrEqual(before)
    expect(m.endedAt!).toBeGreaterThanOrEqual(m.startedAt ?? 0)
    expect(m.content).toBe('answer')
    closeStream(sid)
  })

  test('tool calls carry startedAt and settle with endedAt on result', () => {
    const sid = freshSession()
    const st = useAppStore.getState()
    st.streamStart(sid)
    st.streamToolCall('fs.read', { path: '/tmp/x' }, 'low')
    let rec = lastMessage(sid)!.toolCalls![0]!
    expect(rec.status).toBe('running')
    expect(rec.startedAt).toBeGreaterThan(0)
    expect(rec.endedAt).toBeUndefined()
    const mid = Date.now()
    st.streamToolResult('fs.read', { lines: 3 }, undefined)
    rec = lastMessage(sid)!.toolCalls![0]!
    expect(rec.status).toBe('done')
    expect(rec.endedAt!).toBeGreaterThanOrEqual(mid)
    // Failed calls settle too (no dangling running chip).
    st.streamToolCall('fs.write', { path: '/tmp/y' }, 'medium')
    st.streamToolResult('fs.write', undefined, 'denied')
    rec = lastMessage(sid)!.toolCalls![1]!
    expect(rec.status).toBe('failed')
    expect(rec.endedAt).toBeGreaterThan(0)
    closeStream(sid)
  })
})
