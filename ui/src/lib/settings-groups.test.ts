import { describe, expect, test } from 'bun:test'
import {
  assertNoAgentConfigWrite,
  assertSettingsCommandDoesNotWriteAgentConfig,
  chooseAfterMutation,
  groupConnectionRecords,
  mutationLooksLive,
  nativeSurfaceNotReplaced,
  SETTINGS_IPC_MATRIX,
  type AgentSettings,
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

  test('OAuth revoke and extension install stay off the agent-config write path', () => {
    const families = SETTINGS_IPC_MATRIX.map((r) => r.family).sort()
    expect(families).toEqual(['agents', 'connections', 'extensions', 'providers', 'schedules'])
    for (const row of SETTINGS_IPC_MATRIX) {
      expect(row.writesAgentConfig).toBe(false)
      expect(() => assertSettingsCommandDoesNotWriteAgentConfig(row.command)).not.toThrow()
    }
    expect(() => assertSettingsCommandDoesNotWriteAgentConfig('agent_write_config')).toThrow(
      /not on the ownership matrix/,
    )
  })
})

function acpRow(over: Partial<AgentSettings> = {}): AgentSettings {
  return {
    agentId: 'codex',
    installed: true,
    protocol: 'acp',
    authMode: 'subscription',
    nativeCapabilities: ['session/prompt', 'session/new'],
    sharedCapabilities: ['search.query'],
    modelOwner: 'agent',
    backendBinding: {
      providerId: 'codex',
      injectedEnvNames: [],
      unexpressed: [],
      writesToAgentConfig: false,
      keyPresent: false,
    },
    configOptions: [{ id: 'model', name: 'model', options: ['gpt'] }],
    readiness: 'ready',
    location: { kind: 'unavailable', reason: 'test' },
    sessionLoadout: [],
    ...over,
  }
}

describe('P65.2 native surface stays owned by the external agent', () => {
  test('ACP/MCP model and tools are not replaced by EveryAIOS occupancy', () => {
    expect(nativeSurfaceNotReplaced(acpRow())).toBe(true)
    expect(nativeSurfaceNotReplaced(acpRow({ modelOwner: 'managed' }))).toBe(false)
    expect(nativeSurfaceNotReplaced(acpRow({ modelOwner: 'native' }))).toBe(false)
    expect(
      nativeSurfaceNotReplaced(
        acpRow({
          sharedCapabilities: ['session/prompt'],
        }),
      ),
    ).toBe(false)
    expect(
      nativeSurfaceNotReplaced(
        acpRow({
          protocol: 'inbuilt',
          modelOwner: 'native',
          nativeCapabilities: ['file_ops.read'],
          sharedCapabilities: [],
        }),
      ),
    ).toBe(true)
  })
})

describe('P65.6 injected-failure rollback', () => {
  test('lastError restores the previous snapshot on every family', () => {
    const failed: SettingsMutationResult = {
      appliedLive: true,
      restartRequired: false,
      state: 'idle',
      health: 'failed',
      lastError: 'injected',
    }
    const ok: SettingsMutationResult = {
      appliedLive: true,
      restartRequired: false,
      state: 'idle',
      health: 'ready',
    }
    for (const family of ['providers', 'agents', 'connections', 'schedules', 'extensions']) {
      expect(chooseAfterMutation(`${family}:off`, `${family}:on`, failed)).toBe(`${family}:off`)
      expect(chooseAfterMutation(`${family}:off`, `${family}:on`, ok)).toBe(`${family}:on`)
    }
  })
})
