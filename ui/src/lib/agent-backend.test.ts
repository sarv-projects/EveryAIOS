import { describe, expect, test } from 'bun:test'
import { channelLabel, type BackendChannel } from './agent-backend'

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
    expect(channelLabel('unknown')).toBe('not verified')
    expect(channelLabel('unknown')).not.toContain('env')
  })

  test('subscription agents are named as self-signing, not env-injectable', () => {
    expect(channelLabel('subscription')).toBe('signs in itself')
    expect(channelLabel('subscription')).not.toContain('env')
  })

  test('env channels are distinguished from the config-file channel', () => {
    expect(channelLabel('provider_env')).not.toBe(channelLabel('config_file'))
    expect(channelLabel('fixed_env')).not.toBe(channelLabel('config_file'))
  })
})
