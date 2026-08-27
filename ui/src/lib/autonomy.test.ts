// P44.6 — per-task autonomy freeze + temporary elevation lifecycle tests.
// The frozen task snapshot (level · mode · workspace · agent → config_hash)
// must survive live chatbar changes, and any elevation must expire at task end.

import { describe, expect, test } from 'bun:test'
import { useAppStore, taskScopeHash } from './store'

/** A fresh session with one user message, so autonomy cards have a home. */
function seedSession() {
  const st = useAppStore.getState()
  const id = `t-${Date.now()}`
  useAppStore.setState({
    sessions: [
      {
        id,
        title: 'test',
        status: 'running',
        preview: '',
        updatedAt: new Date().toISOString(),
        messages: [
          { id: 'u1', role: 'user', content: 'do the thing', timestamp: new Date().toISOString() },
        ],
      },
    ],
    activeSessionId: id,
    permissionMode: 'ask',
    composerMode: 'build',
    taskFolder: '~/work/test',
    taskSnapshot: undefined,
    selectedAgentId: 'everyaios-native',
  })
  return id
}

describe('taskScopeHash', () => {
  test('is deterministic and sensitive to every scope field', () => {
    expect(taskScopeHash('ask', 'build', '~/work/test', 'everyaios-native')).toBe(
      taskScopeHash('ask', 'build', '~/work/test', 'everyaios-native'),
    )
    expect(taskScopeHash('ask', 'build', '~/work/test', 'everyaios-native')).not.toBe(
      taskScopeHash('auto', 'build', '~/work/test', 'everyaios-native'),
    )
    expect(taskScopeHash('ask', 'build', '~/work/test', 'everyaios-native')).not.toBe(
      taskScopeHash('ask', 'plan', '~/work/test', 'everyaios-native'),
    )
    expect(taskScopeHash('ask', 'build', '~/work/other', 'everyaios-native')).not.toBe(
      taskScopeHash('ask', 'build', '~/work/test', 'everyaios-native'),
    )
    expect(taskScopeHash('ask', 'build', '~/work/test', 'claude-code')).not.toBe(
      taskScopeHash('ask', 'build', '~/work/test', 'everyaios-native'),
    )
  })
})

describe('freezeTaskSnapshot', () => {
  test('freezes level + mode + workspace + agent into a stable config_hash', () => {
    const id = seedSession()
    const st = useAppStore.getState()
    st.freezeTaskSnapshot()
    const snap = useAppStore.getState().taskSnapshot
    expect(snap).toBeDefined()
    expect(snap!.autonomyLevel).toBe('ask')
    expect(snap!.mode).toBe('build')
    expect(snap!.workspaceScope).toBe('~/work/test')
    expect(snap!.agentScope).toBe('everyaios-native')
    const hash = snap!.configHash
    expect(hash).toBe(taskScopeHash('ask', 'build', '~/work/test', 'everyaios-native'))
    // Deterministic across freezes with the same inputs.
    useAppStore.getState().clearTaskSnapshot()
    useAppStore.getState().freezeTaskSnapshot()
    expect(useAppStore.getState().taskSnapshot!.configHash).toBe(hash)
    // Live chatbar change after the freeze must NOT mutate the frozen hash.
    useAppStore.getState().setPermissionMode('full')
    expect(useAppStore.getState().taskSnapshot!.autonomyLevel).toBe('ask')
    expect(useAppStore.getState().taskSnapshot!.configHash).toBe(hash)
  })

  test('uses the active session folder when set', () => {
    const id = seedSession()
    useAppStore.setState({
      sessions: useAppStore.getState().sessions.map((s) =>
        s.id === id ? { ...s, folder: '~/code/backend' } : s,
      ),
    })
    useAppStore.getState().freezeTaskSnapshot()
    expect(useAppStore.getState().taskSnapshot!.workspaceScope).toBe('~/code/backend')
  })
})

describe('autonomy escalation + elevation', () => {
  test('Do Once elevates the task, then the elevation is consumed', () => {
    const id = seedSession()
    const st = useAppStore.getState()
    st.freezeTaskSnapshot()
    // Card arrives (simulated guard limit surface).
    st.pushMcq({
      id: 'lim-1',
      title: 'Autonomy limit',
      description: 'This action needs more autonomy than the frozen level allows.',
      kind: 'autonomy',
      autonomyAction: 'file_ops.write · src/api/handler.ts',
      autonomyReason: 'Ask mode requires a Guard-2 card for workspace writes.',
      options: [
        { label: 'Do Once', value: 'do-once' },
        { label: 'Allow For This Task', value: 'allow-task' },
        { label: 'Change Level', value: 'change-level' },
      ],
    })
    expect(
      useAppStore
        .getState()
        .sessions.find((s) => s.id === id)!
        .messages.some((m) => m.mcq?.id === 'lim-1'),
    ).toBe(true)

    useAppStore.getState().respondMcq('lim-1', 'do-once')
    const snap = useAppStore.getState().taskSnapshot
    expect(snap?.elevation?.level).toBe('auto')
    expect(snap?.elevation?.oneShot).toBe(true)
    // Card is consumed + session resumes.
    const s = useAppStore.getState().sessions.find((x) => x.id === id)!
    expect(s.messages.some((m) => m.mcq?.id === 'lim-1')).toBe(false)
    expect(s.status).toBe('running')
    // One-shot elevation is consumed on first effective read.
    expect(useAppStore.getState().effectiveAutonomyLevel()).toBe('auto')
    expect(useAppStore.getState().taskSnapshot?.elevation).toBeUndefined()
    expect(useAppStore.getState().effectiveAutonomyLevel()).toBe('ask')
  })

  test('Allow For This Task stays elevated and expires at task end', () => {
    const id = seedSession()
    const st = useAppStore.getState()
    st.freezeTaskSnapshot()
    st.pushMcq({
      id: 'lim-2',
      title: 'Autonomy limit',
      description: '',
      kind: 'autonomy',
      options: [
        { label: 'Do Once', value: 'do-once' },
        { label: 'Allow For This Task', value: 'allow-task' },
        { label: 'Change Level', value: 'change-level' },
      ],
    })
    useAppStore.getState().respondMcq('lim-2', 'allow-task')
    const snap = useAppStore.getState().taskSnapshot
    expect(snap?.elevation?.oneShot).toBe(false)
    // Elevated for the rest of the task (not consumed by reads).
    expect(useAppStore.getState().effectiveAutonomyLevel()).toBe('auto')
    expect(useAppStore.getState().taskSnapshot?.elevation).toBeDefined()
    // Turn completes → the frozen scope + elevation expire together.
    useAppStore.getState().streamStart(id)
    useAppStore.getState().streamFinalize('done', id)
    expect(useAppStore.getState().taskSnapshot).toBeUndefined()
    expect(useAppStore.getState().effectiveAutonomyLevel()).toBe('ask')
  })

  test('a ticket from another session never mutates the frozen task policy', () => {
    const id = seedSession()
    const st = useAppStore.getState()
    st.freezeTaskSnapshot()
    // A Guard ticket for a DIFFERENT session must render the plain
    // permission card path — the bridge checks the snapshot's sessionId.
    const snap = useAppStore.getState().taskSnapshot!
    expect(snap.sessionId).toBe(id)
    const otherId = 'other-session'
    useAppStore.setState({
      sessions: [
        ...useAppStore.getState().sessions,
        {
          id: otherId,
          title: 'other',
          status: 'running',
          preview: '',
          updatedAt: '',
          messages: [],
        },
      ],
    })
    useAppStore.getState().pushAutonomyLimit({
      id: 'tkt-other',
      action: 'file_ops.write',
      reason: 'ask',
      sessionId: otherId,
    })
    // The card went to the OTHER session, and this task's snapshot is untouched.
    const other = useAppStore.getState().sessions.find((x) => x.id === otherId)!
    expect(other.messages.some((m) => m.mcq?.id === 'tkt-other')).toBe(true)
    expect(useAppStore.getState().taskSnapshot!.autonomyLevel).toBe('ask')
    expect(useAppStore.getState().taskSnapshot!.elevation).toBeUndefined()
  })

  test('Change Level updates the frozen level + the global chatbar level', () => {
    const id = seedSession()
    const st = useAppStore.getState()
    st.freezeTaskSnapshot()
    st.pushMcq({
      id: 'lim-3',
      title: 'Autonomy limit',
      description: '',
      kind: 'autonomy',
      options: [
        { label: 'Do Once', value: 'do-once' },
        { label: 'Allow For This Task', value: 'allow-task' },
        { label: 'Change Level to Auto', value: 'change-level' },
      ],
    })
    // Change Level — the card's target level rides in autonomyReason-free
    // `options`; the store raises to the card's stated level (auto).
    useAppStore.getState().respondMcq('lim-3', 'change-level')
    const snap = useAppStore.getState().taskSnapshot
    expect(snap?.autonomyLevel).toBe('auto')
    expect(snap?.elevation).toBeUndefined()
    expect(useAppStore.getState().permissionMode).toBe('auto')
    expect(useAppStore.getState().effectiveAutonomyLevel()).toBe('auto')
  })
})
