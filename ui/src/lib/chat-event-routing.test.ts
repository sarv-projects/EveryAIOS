import { afterAll, describe, expect, test } from 'bun:test'
import { handleChatEvent } from './bridge'
import { resetStreamingTestState, useAppStore } from './store'

function freshSession(): string {
  resetStreamingTestState()
  useAppStore.getState().markSessionsHydrated()
  useAppStore.getState().newSession()
  return useAppStore.getState().activeSessionId
}

function lastMessage(sessionId: string) {
  const session = useAppStore.getState().sessions.find((s) => s.id === sessionId)
  return session?.messages[session.messages.length - 1]
}

afterAll(() => resetStreamingTestState())

describe('chat event routing', () => {
  test('routes events to their session even after the active tab changes', () => {
    const sessionA = freshSession()
    useAppStore.getState().newSession()
    const sessionB = useAppStore.getState().activeSessionId

    handleChatEvent({ type: 'ttft', sessionId: sessionA, streamId: 'stream-a' })
    useAppStore.getState().setActiveSession(sessionB)
    handleChatEvent({ type: 'batch', sessionId: sessionA, streamId: 'stream-a', text: 'answer A' })
    handleChatEvent({ type: 'done', sessionId: sessionA, streamId: 'stream-a', fullText: 'answer A', totalTokens: 1 })

    expect(lastMessage(sessionA)?.content).toBe('answer A')
    expect(lastMessage(sessionB)?.content ?? '').not.toContain('answer A')
    expect(useAppStore.getState().sessions.find((s) => s.id === sessionA)?.status).toBe('completed')
  })

  test('cancellation and budget events settle the exact stream and release live state', () => {
    const sid = freshSession()
    const st = useAppStore.getState()
    st.setLiveStreamId(sid, 'stream-cancel')
    handleChatEvent({ type: 'ttft', sessionId: sid, streamId: 'stream-cancel' })
    handleChatEvent({ type: 'batch', sessionId: sid, streamId: 'stream-cancel', text: 'partial' })
    handleChatEvent({ type: 'cancelled', sessionId: sid, streamId: 'stream-cancel' })

    expect(useAppStore.getState().sessions.find((s) => s.id === sid)?.status).toBe('cancelled')
    expect(useAppStore.getState().liveStreamId[sid]).toBeUndefined()
    expect(lastMessage(sid)?.content).toBe('partial')

    handleChatEvent({ type: 'ttft', sessionId: sid, streamId: 'stream-budget' })
    handleChatEvent({ type: 'batch', sessionId: sid, streamId: 'stream-budget', text: 'partial budget' })
    handleChatEvent({
      type: 'budgetExceeded',
      sessionId: sid,
      streamId: 'stream-budget',
      limit: 2,
      spent: 2.1,
    })

    expect(useAppStore.getState().sessions.find((s) => s.id === sid)?.status).toBe('budget_exceeded')
    expect(lastMessage(sid)?.content).toBe('partial budget')
  })

  test('rejects missing identity and fences late events from a retired stream', () => {
    const sid = freshSession()
    const before = useAppStore.getState().liveNotifications.length
    handleChatEvent({ type: 'batch', streamId: 'missing-session', text: 'must not route' })
    expect(useAppStore.getState().liveNotifications.length).toBe(before + 1)

    handleChatEvent({ type: 'ttft', sessionId: sid, streamId: 'stream-old' })
    handleChatEvent({ type: 'done', sessionId: sid, streamId: 'stream-old', fullText: 'old', totalTokens: 1 })
    handleChatEvent({ type: 'ttft', sessionId: sid, streamId: 'stream-new' })
    handleChatEvent({ type: 'batch', sessionId: sid, streamId: 'stream-old', text: 'stale' })

    expect(lastMessage(sid)?.content).toBe('')
    expect(useAppStore.getState().sessions.find((s) => s.id === sid)?.messages.map((m) => m.content)).toContain('old')
  })
})
