// P51.5 — queue-while-generating store contract. Turns sent while the agent
// is busy land in a per-session FIFO (pending chips); they fire automatically
// once the current turn ends (streamFinalize/fail/budget-kill → dequeue) via
// the bridge-registered dispatcher — one-in-flight, never re-queued.

import { afterAll, describe, expect, test } from 'bun:test'
import { resetStreamingTestState, useAppStore } from './store'

function freshSession(): string {
  // The store + stream registry are module-global and bun shares one module
  // instance across test files, so each test starts from a clean slate.
  resetStreamingTestState()
  useAppStore.getState().markSessionsHydrated()
  useAppStore.getState().newSession()
  return useAppStore.getState().activeSessionId
}

afterAll(() => resetStreamingTestState())

function closeStream(sid: string) {
  const st = useAppStore.getState()
  // Only a session that is actually running has a live stream to close.
  if (st.sessions.find((s) => s.id === sid)?.status === 'running') {
    st.streamFinalize('(test end)', sid)
  }
}

describe('P51.5 — queue-while-generating', () => {
  test('queueTurn appends FIFO; edit + remove mutate in place', () => {
    const sid = freshSession()
    const st = useAppStore.getState()
    st.queueTurn(sid, 'first ask')
    st.queueTurn(sid, 'second ask')
    // Always re-read through getState(): zustand actions return a snapshot
    // of the moment the call returned; actions queue items asynchronously via
    // set(), so a cached reference can go stale mid-test.
    let q = useAppStore.getState().pendingQueue[sid]
    expect(q).toHaveLength(2)
    expect(q![0]!.text).toBe('first ask')
    const qid = q![0]!.id
    st.editQueuedTurn(sid, qid, 'first ask (edited)')
    q = useAppStore.getState().pendingQueue[sid]
    expect(q![0]!.text).toBe('first ask (edited)')
    st.removeQueuedTurn(sid, qid)
    q = useAppStore.getState().pendingQueue[sid]
    expect(q).toHaveLength(1)
    expect(q![0]!.text).toBe('second ask')
    expect(q![0]!.context).toBeUndefined()
    closeStream(sid)
  })

  test('blank queued turns are refused', () => {
    const sid = freshSession()
    useAppStore.getState().queueTurn(sid, '   ')
    expect(useAppStore.getState().pendingQueue[sid] ?? []).toHaveLength(0)
    closeStream(sid)
  })

  test('dequeue fires the head only when the session is idle', () => {
    const sid = freshSession()
    const fired: { sessionId: string; text: string; bypassQueue?: boolean }[] = []
    useAppStore.getState().setTurnDispatcher((t) => fired.push(t))
    const st = useAppStore.getState()
    // While the session runs, dequeue must NOT fire (one-in-flight).
    st.streamStart(sid)
    st.queueTurn(sid, 'queued while running')
    st.dequeueNextTurn(sid)
    expect(fired).toHaveLength(0)
    expect(useAppStore.getState().pendingQueue[sid]).toHaveLength(1)
    // Ending the turn auto-dequeues the head with bypassQueue.
    st.streamFinalize('answer one', sid)
    expect(fired).toHaveLength(1)
    expect(fired[0]!.text).toBe('queued while running')
    expect(fired[0]!.bypassQueue).toBe(true)
    expect(useAppStore.getState().pendingQueue[sid] ?? []).toHaveLength(0)
    // Queue cleared; nothing more fires on a second terminal event.
    st.streamStart(sid)
    st.streamFinalize('answer two', sid)
    expect(fired).toHaveLength(1)
  })

  test('failed and budget-killed turns also release the queue', () => {
    const sid = freshSession()
    const fired: string[] = []
    useAppStore.getState().setTurnDispatcher((t) => fired.push(t.text))
    const st = useAppStore.getState()
    st.streamStart(sid)
    st.queueTurn(sid, 'after fail')
    st.streamFail('boom', sid)
    expect(fired).toEqual(['after fail'])

    st.streamStart(sid)
    st.queueTurn(sid, 'after budget')
    st.streamBudgetKill('stopped: $2.10 / $2.00', sid)
    expect(fired).toEqual(['after fail', 'after budget'])
  })

  test('removeQueuedTurn with no queue leaves no dangling key', () => {
    const sid = freshSession()
    useAppStore.getState().removeQueuedTurn(sid, 'nope')
    expect(useAppStore.getState().pendingQueue[sid] ?? []).toHaveLength(0)
    closeStream(sid)
  })
})
