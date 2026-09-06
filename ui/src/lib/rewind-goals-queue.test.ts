// Wave 2–4 store contracts:
// - P52.22 — truncate-below rewrite (rewindToUserMessage / rewindBeforeAssistant)
//   returns the prompt to re-ask and leaves the transcript cut at the seam.
// - P52.8 — queue pause holds the queue (dequeue no-ops); promote moves a chip
//   to the head.
// - P51.9 — per-session goals set/clear/achieved.
// - P52.16 — deleteSession parks the row in closedSessions; reopen restores a
//   fresh session with the same transcript.

import { afterAll, describe, expect, test } from 'bun:test'
import { getModelsForAgent } from './agents'
import { resetStreamingTestState, useAppStore } from './store'

function freshSession(): string {
  resetStreamingTestState()
  useAppStore.getState().markSessionsHydrated()
  useAppStore.getState().newSession()
  return useAppStore.getState().activeSessionId
}

function seedTranscript(sid: string, msgs: { role: 'user' | 'assistant'; content: string }[]) {
  const st = useAppStore.getState()
  for (const m of msgs) {
    if (m.role === 'user') {
      st.pushUserMessage(m.content)
      // close the assistant turn the push opened (pushUserMessage sets running)
      if (useAppStore.getState().sessions.find((s) => s.id === sid)?.status === 'running') {
        st.streamFinalize('(auto ack)', sid)
      }
    } else {
      st.streamStart(sid)
      st.streamAppend(m.content, false, sid)
      st.streamFinalize(m.content, sid)
    }
  }
}

afterAll(() => resetStreamingTestState())

describe('P52.22 — truncate-below rewrite', () => {
  test('rewindToUserMessage returns the ask text and cuts it and everything below', () => {
    const sid = freshSession()
    seedTranscript(sid, [
      { role: 'user', content: 'ask one' },
      { role: 'assistant', content: 'answer one' },
      { role: 'user', content: 'ask two' },
      { role: 'assistant', content: 'answer two' },
    ])
    const st = useAppStore.getState()
    const sess = st.sessions.find((s) => s.id === sid)!
    const askTwo = sess.messages.find((m) => m.content === 'ask two')!
    const prompt = st.rewindToUserMessage(sid, askTwo.id)
    expect(prompt).toBe('ask two')
    const after = useAppStore.getState().sessions.find((s) => s.id === sid)!
    // ask two + answer two are gone; ask one + answer one remain.
    expect(after.messages.map((m) => m.content)).toEqual(['ask one', 'answer one'])
    expect(after.status).toBe('idle')
  })

  test('rewind is refused on a streaming session and on assistant targets', () => {
    const sid = freshSession()
    seedTranscript(sid, [
      { role: 'user', content: 'ask one' },
      { role: 'assistant', content: 'answer one' },
    ])
    const st = useAppStore.getState()
    const sess = st.sessions.find((s) => s.id === sid)!
    const assistant = sess.messages.find((m) => m.content === 'answer one')!
    // Not a user message → refused, transcript untouched.
    expect(st.rewindToUserMessage(sid, assistant.id)).toBeNull()
    expect(useAppStore.getState().sessions.find((s) => s.id === sid)!.messages).toHaveLength(2)
    // Streaming session → refused.
    st.streamStart(sid)
    const sess2 = useAppStore.getState().sessions.find((s) => s.id === sid)!
    const user = sess2.messages.find((m) => m.role === 'user')!
    expect(st.rewindToUserMessage(sid, user.id)).toBeNull()
  })

  test('rewindBeforeAssistant returns the producing prompt and cuts from it', () => {
    const sid = freshSession()
    seedTranscript(sid, [
      { role: 'user', content: 'context ask' },
      { role: 'assistant', content: 'context answer' },
      { role: 'user', content: 'real ask' },
      { role: 'assistant', content: 'to regenerate' },
    ])
    const st = useAppStore.getState()
    const sess = st.sessions.find((s) => s.id === sid)!
    const target = sess.messages.find((m) => m.content === 'to regenerate')!
    const prompt = st.rewindBeforeAssistant(sid, target.id)
    expect(prompt).toBe('real ask')
    const after = useAppStore.getState().sessions.find((s) => s.id === sid)!
    // Cut from "real ask" inclusive — history above stays intact.
    expect(after.messages.map((m) => m.content)).toEqual(['context ask', 'context answer'])
  })
})

describe('P52.8 — queue pause + promote', () => {
  test('paused queue never auto-fires until resumed', () => {
    const sid = freshSession()
    const fired: string[] = []
    useAppStore.getState().setTurnDispatcher((t) => fired.push(t.text))
    const st = useAppStore.getState()
    st.setQueuePaused(sid, true)
    st.streamStart(sid)
    st.queueTurn(sid, 'held while paused')
    st.streamFinalize('answer', sid)
    expect(fired).toHaveLength(0)
    // Chips stay visible (still queued) until the user resumes.
    expect(useAppStore.getState().pendingQueue[sid]).toHaveLength(1)
    st.setQueuePaused(sid, false)
    // Resume fires the head only on the next idle boundary — dequeue now.
    useAppStore.getState().dequeueNextTurn(sid)
    expect(fired).toEqual(['held while paused'])
  })

  test('promote moves a later chip to the head', () => {
    const sid = freshSession()
    const st = useAppStore.getState()
    st.queueTurn(sid, 'first')
    st.queueTurn(sid, 'second')
    const second = useAppStore.getState().pendingQueue[sid]![1]!
    st.promoteQueuedTurn(sid, second.id)
    const q = useAppStore.getState().pendingQueue[sid]!
    expect(q.map((x) => x.text)).toEqual(['second', 'first'])
  })
})

describe('P51.9 — session goals', () => {
  test('goal set/clear rides the session object; achieved is a one-click check', () => {
    const sid = freshSession()
    const st = useAppStore.getState()
    st.setSessionGoal(sid, 'ship the Q3 deck')
    let sess = useAppStore.getState().sessions.find((s) => s.id === sid)!
    expect(sess.goal).toBe('ship the Q3 deck')
    expect(sess.goalAchieved).toBeFalsy()
    st.markGoalAchieved(sid, true)
    sess = useAppStore.getState().sessions.find((s) => s.id === sid)!
    expect(sess.goalAchieved).toBe(true)
    st.setSessionGoal(sid, undefined)
    sess = useAppStore.getState().sessions.find((s) => s.id === sid)!
    expect(sess.goal).toBeUndefined()
    // Clearing resets the achieved marker so a new goal starts unchecked.
    st.setSessionGoal(sid, 'next goal')
    sess = useAppStore.getState().sessions.find((s) => s.id === sid)!
    expect(sess.goal).toBe('next goal')
    expect(sess.goalAchieved).toBeFalsy()
  })
})

describe('P51.3 — model variant cycle', () => {
  test('cycling pins the next available variant and turns auto-route off', () => {
    resetStreamingTestState()
    const st = useAppStore.getState()
    const models = getModelsForAgent(st.selectedAgentId).filter((m) => m.available)
    if (models.length < 2) return // nothing to cycle
    const before = st.selectedModelId
    st.setAutoRoute(true)
    const next = st.cycleModelVariant(1)
    expect(next).toBeTruthy()
    const st2 = useAppStore.getState()
    expect(st2.selectedModelId).toBe(next)
    // Pinning a variant disables auto-route so the pick reaches the send path.
    expect(st2.autoRoute).toBe(false)
    // Backward cycle returns to the previously selected variant.
    const back = st2.cycleModelVariant(-1)
    expect(back).toBe(before)
  })
})

describe('P51.25 — status-bar pill prefs', () => {
  test('toggles merge over defaults and persist through the store setter', () => {
    resetStreamingTestState()
    const st = useAppStore.getState()
    expect(st.statusBarPills.context).toBe(true)
    expect(st.statusBarPills.cache).toBe(true)
    st.setStatusBarPills({ ...st.statusBarPills, cost: false })
    const after = useAppStore.getState()
    expect(after.statusBarPills.cost).toBe(false)
    // Untouched pills keep their defaults.
    expect(after.statusBarPills.context).toBe(true)
    expect(after.statusBarPills.throughput).toBe(true)
  })
})

describe('P52.16 — reopen-closed', () => {
  test('deleteSession parks the transcript; reopen restores it as a fresh session', () => {
    const sid = freshSession()
    seedTranscript(sid, [
      { role: 'user', content: 'keep me' },
      { role: 'assistant', content: 'still here' },
    ])
    const st = useAppStore.getState()
    void st.deleteSession(sid)
    expect(useAppStore.getState().closedSessions).toHaveLength(1)
    const reopened = st.reopenClosedSession()
    expect(reopened).toBe(true)
    const st2 = useAppStore.getState()
    expect(st2.closedSessions).toHaveLength(0)
    const restored = st2.sessions.find((s) => s.id === st2.activeSessionId)!
    // New id (the old vault row is gone), same transcript.
    expect(restored.id).not.toBe(sid)
    expect(restored.messages.map((m) => m.content)).toEqual(['keep me', 'still here'])
    // Reopen with nothing closed → false.
    expect(st2.reopenClosedSession()).toBe(false)
  })

  test('closed ring is bounded to 5', () => {
    resetStreamingTestState()
    useAppStore.getState().markSessionsHydrated()
    for (let i = 0; i < 7; i++) {
      useAppStore.getState().newSession()
      const sid = useAppStore.getState().activeSessionId
      void useAppStore.getState().deleteSession(sid)
    }
    expect(useAppStore.getState().closedSessions.length).toBeLessThanOrEqual(5)
  })
})

describe('P52.15 — Archive/History (closed ring)', () => {
  test('reopenClosedSessionId restores any specific row, not just the last', () => {
    resetStreamingTestState()
    useAppStore.getState().markSessionsHydrated()
    const st = useAppStore.getState()
    // Two distinct closed sessions.
    st.newSession()
    const a = useAppStore.getState().activeSessionId
    void st.deleteSession(a)
    st.newSession()
    const b = useAppStore.getState().activeSessionId
    void st.deleteSession(b)
    expect(useAppStore.getState().closedSessions).toHaveLength(2)

    // Reopen the OLDER one first (id `a` — not the ring tail).
    const st2 = useAppStore.getState()
    expect(st2.reopenClosedSessionId(a)).toBe(true)
    const st3 = useAppStore.getState()
    expect(st3.closedSessions.map((c) => c.id)).toEqual([b])
    // Reopen activates the restored copy under a fresh id.
    const restored = st3.sessions.find((s) => s.id === st3.activeSessionId)!
    expect(restored.id).not.toBe(a)
    expect(st3.closedSessions.some((c) => c.id === restored.id)).toBe(false)
    // Unknown id → false, ring untouched.
    expect(st3.reopenClosedSessionId('nope')).toBe(false)
    expect(useAppStore.getState().closedSessions).toHaveLength(1)
  })

  test('purge removes one row; purgeAll empties the ring', () => {
    resetStreamingTestState()
    useAppStore.getState().markSessionsHydrated()
    const st = useAppStore.getState()
    st.newSession()
    const a = useAppStore.getState().activeSessionId
    void st.deleteSession(a)
    st.newSession()
    const b = useAppStore.getState().activeSessionId
    void st.deleteSession(b)

    const st2 = useAppStore.getState()
    st2.purgeClosedSession(a)
    expect(useAppStore.getState().closedSessions.map((c) => c.id)).toEqual([b])
    st2.purgeAllClosed()
    expect(useAppStore.getState().closedSessions).toHaveLength(0)
  })
})
