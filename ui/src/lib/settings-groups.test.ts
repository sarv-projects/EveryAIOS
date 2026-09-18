import { describe, expect, test } from 'bun:test'
import {
  assertNoAgentConfigWrite,
  groupConnectionRecords,
  mutationLooksLive,
  type ConnectionRecord,
  type SettingsMutationResult,
} from './settings'

function row(id: string, state: ConnectionRecord['state']): ConnectionRecord {
  return {
    id,
    kind: 'remote_mcp',
    transport: 'stdio',
    scopes: [],
    enabledConsumers: state === 'connected' ? ['chief'] : [],
    state,
    health: state === 'connected' ? 'ready' : 'unknown',
    configHash: id,
  }
}

describe('P65.3 connection groups', () => {
  test('never puts a disconnected row in connected', () => {
    const g = groupConnectionRecords([
      row('a', 'connected'),
      row('b', 'disconnected'),
      row('c', 'degraded'),
    ])
    expect(g.connected.map((r) => r.id)).toEqual(['a'])
    expect(g.disconnected.map((r) => r.id)).toEqual(['b'])
    expect(g.degraded.map((r) => r.id)).toEqual(['c'])
    expect(g.connected.every((r) => r.state === 'connected')).toBe(true)
  })
})

describe('P65.6 mutation envelope', () => {
  test('lastError cannot look live-applied', () => {
    const bad: SettingsMutationResult = {
      appliedLive: true,
      restartRequired: false,
      state: 'idle',
      health: 'failed',
      lastError: 'backend refused',
    }
    expect(mutationLooksLive(bad)).toBe(false)
    expect(
      mutationLooksLive({
        appliedLive: true,
        restartRequired: false,
        state: 'idle',
        health: 'ready',
      }),
    ).toBe(true)
  })
})

describe('P65.7 ownership floor', () => {
  test('writesToAgentConfig true is refused', () => {
    expect(() =>
      assertNoAgentConfigWrite({
        providerId: 'x',
        injectedEnvNames: [],
        unexpressed: [],
        writesToAgentConfig: true,
        keyPresent: false,
      }),
    ).toThrow(/never writes/)
    expect(() =>
      assertNoAgentConfigWrite({
        providerId: 'x',
        injectedEnvNames: ['OPENAI_API_KEY'],
        unexpressed: [],
        writesToAgentConfig: false,
        keyPresent: true,
      }),
    ).not.toThrow()
  })
})
