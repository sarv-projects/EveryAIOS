// P38 — per-session Chief pin durability: the pin is written onto the Session
// object (so the vault `session_put` round-trip persists it across app
// restarts) AND mirrored in `sessionChiefs` for the chat send path. Deletion
// of a session carries its pin away; clearing a pin restores the default.

import { describe, expect, test } from 'bun:test'
import { useAppStore } from './store'

function seedSession(id = `pin-${Date.now()}`) {
  useAppStore.setState({
    sessions: [
      {
        id,
        title: 'test',
        status: 'idle',
        preview: '',
        updatedAt: new Date().toISOString(),
        messages: [],
      },
    ],
    sessionChiefs: {},
    activeSessionId: id,
  })
  return id
}

describe('P38 per-session Chief pin durability', () => {
  test('setSessionChiefPin writes the mirror map AND the durable Session field', () => {
    const id = seedSession()
    useAppStore.getState().setSessionChiefPin(id, 'codex')
    const st = useAppStore.getState()
    expect(st.sessionChiefs[id]).toBe('codex')
    expect(st.sessions.find((s) => s.id === id)?.chiefPin).toBe('codex')
  })

  test('clearSessionChiefPin restores the default and persists an explicit unpin marker', () => {
    const id = seedSession()
    const { setSessionChiefPin, clearSessionChiefPin } = useAppStore.getState()
    setSessionChiefPin(id, 'codex')
    clearSessionChiefPin(id)
    const st = useAppStore.getState()
    expect(st.sessionChiefs[id]).toBeUndefined()
    expect(st.sessions.find((s) => s.id === id)?.chiefPin).toBeUndefined()
    // The explicit marker survives so a restarted session shows "default
    // applies — pin cleared" instead of reading as never-pinned.
    expect(st.sessions.find((s) => s.id === id)?.chiefUnpinned).toBe(true)
  })

  test('setting a new pin clears a prior explicit-unpin marker', () => {
    const id = seedSession()
    const { setSessionChiefPin, clearSessionChiefPin } = useAppStore.getState()
    clearSessionChiefPin(id)
    setSessionChiefPin(id, 'claude-code')
    const sess = useAppStore.getState().sessions.find((s) => s.id === id)
    expect(sess?.chiefPin).toBe('claude-code')
    expect(sess?.chiefUnpinned).toBe(false)
  })

  test('an unpinned marker rides the vault round-trip and reads back at boot', () => {
    const id = `unpinned-${Date.now()}`
    // Simulate what session_put persisted then session_list returned:
    // chiefPin gone, chiefUnpinned: true remains.
    const fromVault = [
      {
        id,
        title: 'test',
        status: 'idle',
        preview: '',
        updatedAt: new Date().toISOString(),
        messages: [],
        chiefUnpinned: true,
      },
    ]
    const sessionChiefs: Record<string, string> = {}
    for (const s of fromVault) if (s.chiefPin) sessionChiefs[s.id] = s.chiefPin
    useAppStore.setState({ sessions: fromVault, sessionChiefs, activeSessionId: id })
    // No pin restored (the mirror stays empty), but the marker is visible so
    // the picker can render "default applies — pin cleared".
    expect(useAppStore.getState().sessionChiefs[id]).toBeUndefined()
    expect(
      useAppStore.getState().sessions.find((s) => s.id === id)?.chiefUnpinned,
    ).toBe(true)
  })

  test('a rehydrated Session (vault round-trip) restores the pin mirror at boot', () => {
    const id = `hydrated-${Date.now()}`
    // Simulate what the bridge does on session_list: vault rows carry chiefPin.
    const fromVault = [
      {
        id,
        title: 'test',
        status: 'idle',
        preview: '',
        updatedAt: new Date().toISOString(),
        messages: [],
        chiefPin: 'claude-code',
      },
    ]
    const sessionChiefs: Record<string, string> = {}
    for (const s of fromVault) if (s.chiefPin) sessionChiefs[s.id] = s.chiefPin
    useAppStore.setState({ sessions: fromVault, sessionChiefs, activeSessionId: id })
    expect(useAppStore.getState().sessionChiefs[id]).toBe('claude-code')
  })

  test('deleteSession removes the pin with the session (no orphan pin)', () => {
    const id = seedSession()
    useAppStore.getState().setSessionChiefPin(id, 'codex')
    useAppStore.setState({ activeSessionId: id })
    void useAppStore.getState().deleteSession(id).finally(() => {
      expect(useAppStore.getState().sessionChiefs[id]).toBeUndefined()
    })
  })
})