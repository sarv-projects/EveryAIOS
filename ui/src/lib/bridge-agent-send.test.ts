// The send path may not manufacture a submitted turn before an external
// agent is proven runnable. These regressions cover the browser-preview truth
// path as well as readiness: both must leave the target chat idle and keep the
// draft recoverable instead of queueing or marking it running.

import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { sendUserMessage } from './bridge'
import { AGENTS, type AgentRuntime } from './agents'
import { resetStreamingTestState, useAppStore, type Session } from './store'

const SESSION_ID = 'send-lifecycle'

function idleSession(): Session {
  return {
    id: SESSION_ID,
    title: 'Blocked send',
    status: 'idle',
    preview: 'What would you like to do?',
    updatedAt: new Date().toISOString(),
    messages: [],
  }
}

function runtime(readiness: AgentRuntime['readiness']): AgentRuntime {
  const seed = AGENTS.find((agent) => agent.id === 'claude-code')
  if (!seed) throw new Error('missing agent fixture')
  return { ...seed, readiness, status: readiness === 'ready' ? 'installed' : 'discovered' }
}

beforeEach(() => {
  resetStreamingTestState()
  useAppStore.setState({
    sessions: [idleSession()],
    activeSessionId: SESSION_ID,
    sessionsHydrated: true,
    selectedAgentId: '',
    userDefaultChief: undefined,
    sessionChiefs: {},
    liveAgents: [],
    pendingQueue: {},
    composerValue: '',
    setupOpen: false,
    agentSendBlocker: undefined,
    lastToast: undefined,
  })
})

afterAll(() => {
  resetStreamingTestState()
  useAppStore.setState({
    selectedAgentId: '',
    userDefaultChief: undefined,
    sessionChiefs: {},
    liveAgents: [],
    composerValue: '',
  })
})

describe('agent send lifecycle', () => {
  test('no-agent send leaves the session idle and does not push or queue the message', async () => {
    await sendUserMessage('This must wait for an agent')

    const state = useAppStore.getState()
    const session = state.sessions.find((item) => item.id === SESSION_ID)
    expect(session?.status).toBe('idle')
    expect(session?.messages).toHaveLength(0)
    expect(state.pendingQueue[SESSION_ID] ?? []).toHaveLength(0)
    expect(state.setupOpen).toBe(true)
    expect(state.agentSendBlocker).toMatchObject({
      sessionId: SESSION_ID,
      code: 'unbound',
    })
    // A direct bridge caller may not have cleared the composer first; preserve
    // the blocked draft when there is no newer text to protect.
    expect(state.composerValue).toBe('This must wait for an agent')
  })

  test('a bound but unready agent is not treated as runnable', async () => {
    useAppStore.setState({
      userDefaultChief: 'claude',
      liveAgents: [runtime('auth_required')],
    })

    await sendUserMessage('Sign in first')

    const state = useAppStore.getState()
    const session = state.sessions.find((item) => item.id === SESSION_ID)
    expect(session?.status).toBe('idle')
    expect(session?.messages).toHaveLength(0)
    expect(state.pendingQueue[SESSION_ID] ?? []).toHaveLength(0)
    expect(state.agentSendBlocker).toMatchObject({
      sessionId: SESSION_ID,
      code: 'not-ready',
      agentId: 'claude',
    })
    expect(state.agentSendBlocker?.detail).toContain('sign in to continue')
  })

  test('a ready preview fixture still cannot forge a submitted browser turn', async () => {
    useAppStore.setState({
      selectedAgentId: 'claude-code',
      liveAgents: [runtime('ready')],
    })

    await sendUserMessage('Preview only')

    const state = useAppStore.getState()
    const session = state.sessions.find((item) => item.id === SESSION_ID)
    expect(session?.status).toBe('idle')
    expect(session?.messages).toHaveLength(0)
    expect(state.agentSendBlocker?.code).toBe('preview')
    expect(state.composerValue).toBe('Preview only')
  })
})
