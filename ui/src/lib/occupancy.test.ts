import { describe, expect, test } from 'bun:test'
import { DEFAULT_ROUTING } from './agents'
import { dispatchOccupancy, occupancyChief, routingTableDrivesDispatch } from './occupancy'

describe('P60.11 occupancy is the picked agent', () => {
  test('DEFAULT_ROUTING does not dispatch a view', () => {
    expect(routingTableDrivesDispatch()).toBe(false)
    const occ = occupancyChief({ selectedAgentId: 'claude-code' })
    expect(occ).toBe('claude-code')
    expect(dispatchOccupancy('shell', occ, DEFAULT_ROUTING)).toBe('claude-code')
    expect(dispatchOccupancy('browser', occ, DEFAULT_ROUTING)).toBe(occ)
  })

  test('an unbound app occupies nothing (P71.2a)', () => {
    // v1 ships no built-in engine, so there is no always-present agent to fall
    // back to: the honest answer is "nothing is bound yet".
    expect(occupancyChief({})).toBe('')
    expect(occupancyChief({ selectedAgentId: '', userDefaultChief: '' })).toBe('')
    expect(occupancyChief({ selectedAgentId: 'inbuilt' })).toBe('inbuilt')
    // (The retired spellings are filtered by the turn path's `currentBinding`;
    // occupancy reports only what the store holds.)
  })

  test('DEFAULT_ROUTING names no agent — an empty row means "the bound agent"', () => {
    for (const agent of Object.values(DEFAULT_ROUTING)) {
      expect(agent).toBe('')
    }
  })

  test('session pin wins over selected agent', () => {
    expect(
      occupancyChief({
        selectedAgentId: 'claude-code',
        sessionPin: 'codex-cli',
        userDefaultChief: 'grok-build',
      }),
    ).toBe('codex-cli')
  })

  test('the user default applies when no pin is set', () => {
    expect(
      occupancyChief({ selectedAgentId: 'claude-code', userDefaultChief: 'codex-cli' }),
    ).toBe('claude-code')
    expect(occupancyChief({ userDefaultChief: 'codex-cli' })).toBe('codex-cli')
  })
})
