import { describe, expect, test } from 'bun:test'
import {
  agentAuthenticationLabel,
  assertNoAgentConfigWrite,
  assertSettingsCommandDoesNotWriteAgentConfig,
  chooseAfterMutation,
  groupConnectionRecords,
  hasHostLaunchOverride,
  mutationLooksLive,
  nativeSurfaceNotReplaced,
  projectModelOwner,
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
  test('a managed label without a non-empty host launch input projects back to the agent', () => {
    const vaultOnly = acpRow({ modelOwner: 'managed' })
    expect(hasHostLaunchOverride(vaultOnly.backendBinding)).toBe(false)
    expect(projectModelOwner(vaultOnly)).toBe('agent')
    expect(nativeSurfaceNotReplaced(vaultOnly)).toBe(true)

    // Even the deprecated compatibility flag cannot turn an empty override
    // into host model management.
    const legacyVaultObservation = acpRow({
      modelOwner: 'managed',
      backendBinding: {
        ...vaultOnly.backendBinding!,
        keyPresent: true,
      },
    })
    expect(projectModelOwner(legacyVaultObservation)).toBe('agent')
    expect(nativeSurfaceNotReplaced(legacyVaultObservation)).toBe(true)
  })

  test('a real credential-free host launch input may be shown as managed', () => {
    const hostOverride = acpRow({
      modelOwner: 'managed',
      backendBinding: {
        ...acpRow().backendBinding!,
        injectedEnvNames: ['ANTHROPIC_MODEL', 'ANTHROPIC_BASE_URL'],
      },
    })
    expect(hasHostLaunchOverride(hostOverride.backendBinding)).toBe(true)
    expect(projectModelOwner(hostOverride)).toBe('managed')
    expect(nativeSurfaceNotReplaced(hostOverride)).toBe(false)
  })

  test('authentication is always presented as agent-owned, including unknown methods', () => {
    expect(agentAuthenticationLabel('subscription')).toBe('agent-owned · subscription')
    expect(agentAuthenticationLabel('api_key')).toBe('agent-owned · API key')
    expect(agentAuthenticationLabel(undefined)).toBe('agent-owned · method not verified')
  })

  test('shared capabilities still cannot replace the native surface', () => {
    expect(nativeSurfaceNotReplaced(acpRow())).toBe(true)
    expect(nativeSurfaceNotReplaced(acpRow({ modelOwner: 'native' }))).toBe(false)
    expect(
      nativeSurfaceNotReplaced(
        acpRow({
          sharedCapabilities: ['session/prompt'],
        }),
      ),
    ).toBe(false)
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
