import { afterEach, describe, expect, test } from 'bun:test'
import {
  agentBackendSet,
  channelLabel,
  hasLegacyVaultKeyRequest,
  type BackendChannel,
} from './agent-backend'

type CapturedRequest = Record<string, unknown> | undefined

function installShell(capture: (command: string, args?: Record<string, unknown>) => void): void {
  ;(globalThis as { window?: unknown }).window = {
    __TAURI_INTERNALS__: {
      invoke: async (command: string, args?: Record<string, unknown>) => {
        capture(command, args)
        return {}
      },
    },
  }
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window
})

// P63 — the Agent-runtimes card labels each agent's model-backend contract.
// The label is the user's only clue about whether a binding can take effect,
// so every channel must be named, and an unverified agent must never be
// painted as though it had a known contract.
describe('P63 — per-agent backend channel labels', () => {
  test('names every channel in the contract vocabulary', () => {
    const channels: BackendChannel[] = [
      'provider_env',
      'fixed_env',
      'config_file',
      'subscription',
      'unknown',
    ]
    for (const c of channels) {
      expect(channelLabel(c).length).toBeGreaterThan(0)
    }
  })

  test('an unverified agent is never labelled as configurable', () => {
    expect(channelLabel('unknown')).toBe('auth not verified')
    expect(channelLabel('unknown')).not.toContain('env')
  })

  test('subscription agents are named as agent-owned sign-in', () => {
    expect(channelLabel('subscription')).toBe('agent-owned sign-in')
    expect(channelLabel('subscription')).not.toContain('host')
  })

  test('env channels are distinguished from the config-file channel', () => {
    expect(channelLabel('provider_env')).not.toBe(channelLabel('config_file'))
    expect(channelLabel('fixed_env')).not.toBe(channelLabel('config_file'))
  })
})

describe('external-agent-owned authentication compatibility', () => {
  test('new provider overrides default useVaultKey to false', async () => {
    let command = ''
    let request: CapturedRequest
    installShell((cmd, args) => {
      command = cmd
      request = args
    })

    await agentBackendSet({ agentId: 'opencode', provider: 'anthropic' })

    expect(command).toBe('agent_backend_set')
    expect(request?.useVaultKey).toBe(false)
  })

  test('legacy true records are identifiable for a visible clear/migrate path', () => {
    expect(
      hasLegacyVaultKeyRequest({
        configured: { provider: 'anthropic', model: '', useVaultKey: true, baseUrl: null },
      }),
    ).toBe(true)
    expect(
      hasLegacyVaultKeyRequest({
        configured: { provider: 'anthropic', model: '', useVaultKey: false, baseUrl: null },
      }),
    ).toBe(false)
    expect(hasLegacyVaultKeyRequest({ configured: null })).toBe(false)
  })
})
