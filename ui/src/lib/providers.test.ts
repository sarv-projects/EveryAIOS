import { describe, expect, test } from 'bun:test'
import {
  envVarFromAuth,
  modelsDevUrl,
  providerModels,
  toProviderEntry,
  type ProviderEntry,
} from './providers'
import type { ResourceCard } from './discovery'

function card(over: Partial<ResourceCard> = {}): ResourceCard {
  return {
    kind: 'provider',
    id: 'anthropic',
    name: 'Anthropic',
    version: '',
    source: 'models.dev',
    auth: 'api_key_env:ANTHROPIC_API_KEY',
    capabilities: ['tools'],
    capabilitiesVerified: false,
    governance: '',
    baseUrl: '',
    docUrl: 'https://models.dev/providers/anthropic',
    status: 'inventoried',
    ...over,
  }
}

describe('provider directory', () => {
  test('env var parses from the auth shape only', () => {
    expect(envVarFromAuth('api_key_env:OPENAI_API_KEY')).toBe('OPENAI_API_KEY')
    expect(envVarFromAuth('keyless')).toBeNull()
    expect(envVarFromAuth('aws_sdk')).toBeNull()
    expect(envVarFromAuth('oauth_device_code')).toBeNull()
  })

  test('models.dev url derives from the provider id', () => {
    expect(modelsDevUrl('nvidia')).toBe('https://models.dev/providers/nvidia')
  })

  test('entry merges card + key fact, never a secret', () => {
    const e: ProviderEntry = toProviderEntry(card(), new Set(['anthropic']))
    expect(e.keyConfigured).toBe(true)
    expect(e.envVar).toBe('ANTHROPIC_API_KEY')
    expect(e.docUrl).toBe('https://models.dev/providers/anthropic')
    expect(JSON.stringify(e)).not.toContain('sk-')
    const unkeyed = toProviderEntry(card(), new Set())
    expect(unkeyed.keyConfigured).toBe(false)
  })

  test('doc url falls back to the derived page when the card omits it', () => {
    const e = toProviderEntry(card({ docUrl: undefined }), new Set())
    expect(e.docUrl).toBe('https://models.dev/providers/anthropic')
  })

  test('curated models map per provider; unknown providers stay honest-empty', () => {
    expect(providerModels('anthropic').length).toBeGreaterThan(0)
    expect(providerModels('openai').length).toBeGreaterThan(0)
    expect(providerModels('some-aggregator-xyz')).toEqual([])
  })
})
