// P51.7/P51.21 — failed turns preserve the partial answer (never clobbered
// with a marker line) and carry a structured, layer-named error the bubble
// renders as a card with matched actions. P51.7 — TTFB is measured from turn
// start to the first content/reasoning delta and settles onto the message.

import { afterAll, describe, expect, test } from 'bun:test'
import { resetStreamingTestState, useAppStore } from './store'

function freshSession(): string {
  resetStreamingTestState()
  useAppStore.getState().markSessionsHydrated()
  useAppStore.getState().newSession()
  return useAppStore.getState().activeSessionId
}

afterAll(() => resetStreamingTestState())

function lastMessage(sessionId: string) {
  const sess = useAppStore.getState().sessions.find((s) => s.id === sessionId)
  return sess?.messages[sess.messages.length - 1]
}

describe('P51.7/P51.21 — failed-turn error cards', () => {
  test('a failed turn preserves the partial answer and attaches the error', () => {
    const sid = freshSession()
    const st = useAppStore.getState()
    st.streamStart(sid)
    st.streamAppend('Here is what I found so far', false, sid)
    st.streamFail('provider overloaded', sid, {
      layer: 'provider',
      code: 'rate_limited',
      detail: 'provider overloaded — retry in a moment',
      retryable: true,
    })
    const m = lastMessage(sid)!
    // Partial content survives; the old behavior replaced it with a ⚠ line.
    expect(m.content).toBe('Here is what I found so far')
    expect(m.error).toEqual({
      layer: 'provider',
      code: 'rate_limited',
      detail: 'provider overloaded — retry in a moment',
      retryable: true,
    })
    expect(m.endedAt).toBeGreaterThan(0)
    expect(useAppStore.getState().sessions.find((s) => s.id === sid)!.status).toBe('failed')
  })

  test('a plain streamFail defaults to a retryable agent-layer card', () => {
    const sid = freshSession()
    const st = useAppStore.getState()
    st.streamStart(sid)
    st.streamFail('could not reach the agent', sid)
    const m = lastMessage(sid)!
    expect(m.error).toEqual({
      layer: 'agent',
      detail: 'could not reach the agent',
      retryable: true,
    })
  })

  test('budget kills are layer-named budget, not retryable, and keep text', () => {
    const sid = freshSession()
    const st = useAppStore.getState()
    st.streamStart(sid)
    st.streamAppend('Started the analysis…', false, sid)
    st.streamBudgetKill('stopped: $2.10 / $2.00', sid)
    const m = lastMessage(sid)!
    expect(m.content).toBe('Started the analysis…')
    expect(m.error).toMatchObject({ layer: 'budget', retryable: false })
    expect(m.error!.code).toBe('budget_exceeded')
    expect(useAppStore.getState().sessions.find((s) => s.id === sid)!.status).toBe('failed')
  })
})

describe('P51.2 — request id on failed turns', () => {
  test('a failed turn carries the live stream id as the copyable request id', () => {
    const sid = freshSession()
    const st = useAppStore.getState()
    st.setLiveStreamId(sid, 'stream-turn-77')
    st.streamStart(sid)
    st.streamFail('boom', sid)
    expect(lastMessage(sid)!.error?.requestId).toBe('stream-turn-77')
  })

  test('an explicit request id wins over the live stream id', () => {
    const sid = freshSession()
    const st = useAppStore.getState()
    st.setLiveStreamId(sid, 'stream-turn-77')
    st.streamStart(sid)
    st.streamFail('boom', sid, {
      layer: 'tool',
      detail: 'boom',
      retryable: true,
      requestId: 'explicit-1',
    })
    expect(lastMessage(sid)!.error?.requestId).toBe('explicit-1')
  })

  test('no live stream id leaves the card without a request id (no fabricated id)', () => {
    const sid = freshSession()
    const st = useAppStore.getState()
    st.streamStart(sid)
    st.streamFail('boom', sid)
    expect(lastMessage(sid)!.error?.requestId).toBeUndefined()
  })
})

describe('P51.7 — TTFB', () => {
  test('first content delta measures ttfb from stream start to first byte', () => {
    const sid = freshSession()
    const st = useAppStore.getState()
    st.streamStart(sid)
    // No delta yet: settle must not stamp a bogus ttfb.
    st.streamFail('died before a token', sid)
    let m = lastMessage(sid)!
    expect(m.ttfbMs).toBeUndefined()

    // Fresh turn: delta lands, then finalize settles the measurement.
    st.streamStart(sid)
    st.streamAppend('first token', false, sid)
    st.streamFinalize('full answer', sid)
    m = lastMessage(sid)!
    expect(m.ttfbMs).toBeGreaterThanOrEqual(0)
    expect(m.endedAt).toBeGreaterThan(0)
  })

  test('first reasoning delta counts as the first byte (pure-thought providers)', () => {
    const sid = freshSession()
    const st = useAppStore.getState()
    st.streamStart(sid)
    st.appendReasoning('thinking…', sid)
    st.streamFinalize('conclusion', sid)
    const m = lastMessage(sid)!
    expect(m.ttfbMs).toBeGreaterThanOrEqual(0)
  })

  test('ttfb state is cleared between turns (no stale measurement)', () => {
    const sid = freshSession()
    const st = useAppStore.getState()
    st.streamStart(sid)
    st.streamAppend('a', false, sid)
    st.streamFinalize('answer one', sid)
    st.streamStart(sid)
    // Dies before any delta on the second turn: ttfb must be undefined, not
    // a leftover from the first turn.
    st.streamFail('second turn died early', sid)
    const m = lastMessage(sid)!
    expect(m.ttfbMs).toBeUndefined()
  })
})
