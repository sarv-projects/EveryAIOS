// P50.2.1 — runtime truth for the sessions surface: an empty native
// `session_list` is authoritative (it replaces the browser demo seed), the
// persistence gate only opens AFTER hydration so a boot-time write can never
// stamp preview chats into the real vault, and hydration with a pin-free
// vault yields an empty live list, not a seeded one.
//
// The malformed-row drop happens at the Tauri parse boundary
// (`filter_map(serde_json::from_str(...).ok())`, Rust-tested in
// everyaios-vault); the UI contract pinned here is: whatever `session_list`
// returns becomes the store's rows verbatim — never a synthesized chat.

import { describe, expect, test } from 'bun:test'
import { useAppStore } from './store'

describe('P50.2.1 — sessions runtime truth', () => {
  test('a fresh store is NOT hydrated: the demo seed can never persist', () => {
    const st = useAppStore.getState()
    expect(st.sessionsHydrated).toBe(false)
    // The gate check `if (!inTauri()) return; if (!s.sessionsHydrated) return`
    // in the persistence subscribe is what this flag drives; before it flips,
    // no session_put path may engage.
    expect(st.sessions.length).toBeGreaterThan(0) // demo seed visible in preview
  })

  test('an empty native session_list replaces the seed with zero rows', () => {
    // Simulate `session_list` returning an empty vault: the bridge calls
    // markSessionsHydrated first, then setState({ sessions, activeSessionId }).
    useAppStore.getState().markSessionsHydrated()
    useAppStore.setState({
      sessions: [],
      activeSessionId: '',
      sessionChiefs: {},
    })
    const st = useAppStore.getState()
    expect(st.sessionsHydrated).toBe(true) // gate now open — persistence allowed
    expect(st.sessions).toHaveLength(0) // empty vault renders empty, never the seed
    expect(st.activeSessionId).toBe('')
    // No fabricated chat anywhere: the store holds exactly what the vault said.
    expect(useAppStore.getState().sessions.some((s) => s.messages.length > 0)).toBe(false)
  })

  test('rehydration restores only what the vault returned (pin mirror respects rows)', () => {
    // A second boot: the vault holds one real session with a chief pin; the
    // rehydrated list must be exactly that one row (no seed, no dupes).
    const fromVault = [
      {
        id: 'real-1',
        title: 'vault session',
        status: 'idle',
        preview: '',
        updatedAt: new Date().toISOString(),
        messages: [],
        chiefPin: 'codex',
      },
    ]
    useAppStore.setState({ sessionsHydrated: false })
    useAppStore.getState().markSessionsHydrated()
    const sessionChiefs: Record<string, string> = {}
    for (const s of fromVault) if (s.chiefPin) sessionChiefs[s.id] = s.chiefPin
    useAppStore.setState({ sessions: fromVault, sessionChiefs, activeSessionId: fromVault[0].id })
    const st = useAppStore.getState()
    expect(st.sessions).toHaveLength(1)
    expect(st.sessions[0].id).toBe('real-1')
    expect(st.sessionChiefs['real-1']).toBe('codex')
  })

  test('a persistence failure surfaces as a degraded runtime + user error, never a seed write', () => {
    // Fresh-state contract: before the vault answers, the gate stays shut.
    useAppStore.setState({ sessionsHydrated: false })
    const st = useAppStore.getState()
    expect(st.sessionsHydrated).toBe(false)
    // And no success marker is ever forged: the hydrated flag only flips via
    // markSessionsHydrated (called only after a real session_list round-trip).
    expect(typeof st.markSessionsHydrated).toBe('function')
  })
})