import { describe, expect, test } from 'bun:test'
import { DEFAULT_ROUTING } from './agents'
import { dispatchOccupancy, occupancyChief, routingTableDrivesDispatch } from './occupancy'

describe('P60.11 occupancy is the picked Chief', () => {
  test('DEFAULT_ROUTING does not dispatch a view', () => {
    expect(routingTableDrivesDispatch()).toBe(false)
    const occ = occupancyChief({ selectedAgentId: 'everyaios-native' })
    expect(occ).toBe('everyaios-native')
    expect(dispatchOccupancy('shell', occ, DEFAULT_ROUTING)).toBe('everyaios-native')
    expect(DEFAULT_ROUTING.shell).not.toBe('everyaios-native')
    expect(dispatchOccupancy('browser', occ, DEFAULT_ROUTING)).toBe(occ)
  })

  test('session pin wins over selected agent', () => {
    expect(
      occupancyChief({
        selectedAgentId: 'everyaios-native',
        sessionPin: 'codex-cli',
        userDefaultChief: 'inbuilt',
      }),
    ).toBe('codex-cli')
  })
})
