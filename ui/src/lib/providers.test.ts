import { describe, expect, test } from 'bun:test'
import {
  configuredProviders,
  envVarFromAuth,
  formatPerM,
  logoUrl,
  modelsDevUrl,
  parseHeaderLines,
  parseJsonObject,
  parseProfileModels,
  previewCatalogRows,
  providerModels,
  searchProviders,
  subsequenceMatch,
  toProfilePayload,
  toProviderEntry,
  type CatalogProviderRow,
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

// ---------------------------------------------------------------------------
// P56.2 — the catalog row list
// ---------------------------------------------------------------------------

function row(over: Partial<CatalogProviderRow> = {}): CatalogProviderRow {
  return {
    id: 'openai',
    name: 'OpenAI',
    aliases: [],
    env: ['OPENAI_API_KEY'],
    auth: 'api_key_env',
    transport: 'openai-chat',
    baseUrl: 'https://api.openai.com/v1',
    logoUrl: logoUrl('openai'),
    source: 'models-dev-live',
    modelIds: ['gpt-5-codex', 'gpt-5-mini'],
    modelCount: 2,
    keyConfigured: false,
    ...over,
  }
}

describe('P56.2 — provider search', () => {
  test('the logo url is the documented models.dev asset', () => {
    expect(logoUrl('nvidia')).toBe('https://models.dev/logos/nvidia.svg')
  })

  test('subsequence match: characters in order, not substrings', () => {
    expect(subsequenceMatch('opencode go', 'ocg')).toBe(true)
    expect(subsequenceMatch('gpt-5-codex', 'gpt5')).toBe(true)
    expect(subsequenceMatch('openai', 'cgb')).toBe(false)
    expect(subsequenceMatch('anything', '  ')).toBe(true)
  })

  test('search covers id, name, alias, env handle, and model ids', () => {
    const rows = [
      row(),
      row({
        id: 'nvidia',
        name: 'Nvidia',
        aliases: ['nim'],
        env: ['NVIDIA_API_KEY'],
        modelIds: ['nemotron-4'],
      }),
      row({ id: 'opencode-free', name: 'OpenCode Free', aliases: [], env: [], modelIds: ['big-pickle'] }),
    ]
    expect(searchProviders(rows, 'OPENAI_API_KEY').map((r) => r.id)).toEqual(['openai'])
    expect(searchProviders(rows, 'nim').map((r) => r.id)).toEqual(['nvidia'])
    expect(searchProviders(rows, 'gpt5codex').map((r) => r.id)).toEqual(['openai'])
    expect(searchProviders(rows, 'ocf').map((r) => r.id)).toEqual(['opencode-free'])
    expect(searchProviders(rows, '').length).toBe(3)
  })

  test('configured providers sort first and split into the “yours” group', () => {
    const rows = [
      row({ id: 'zzz', name: 'Zed' }),
      row({ id: 'aaa', name: 'Aaa', keyConfigured: true }),
      row({ id: 'mmm', name: 'Mmm', profileSource: 'userconfig' }),
    ]
    expect(searchProviders(rows, '').map((r) => r.id)).toEqual(['aaa', 'mmm', 'zzz'])
    expect(configuredProviders(rows).map((r) => r.id)).toEqual(['aaa', 'mmm'])
  })

  test('the preview rows never claim a key or a probe result', () => {
    const preview = previewCatalogRows()
    expect(preview.length).toBeGreaterThan(0)
    expect(preview.every((r) => r.source === 'preview')).toBe(true)
    expect(preview.every((r) => !r.keyConfigured && !r.verifiedAt)).toBe(true)
    expect(JSON.stringify(preview)).not.toContain('sk-')
  })

  test('price formatting is honest about free / missing / sub-dollar', () => {
    expect(formatPerM(0)).toBe('$0')
    expect(formatPerM(null)).toBe('—')
    expect(formatPerM(undefined)).toBe('—')
    expect(formatPerM(0.15)).toBe('$0.150')
    expect(formatPerM(2.5)).toBe('$2.50')
    expect(formatPerM(9, true)).toBe('free')
  })
})

// ---------------------------------------------------------------------------
// P56.4 — the custom inference form parsers
// ---------------------------------------------------------------------------

describe('P56.4 — custom inference form', () => {
  test('headers parse one per line and report a malformed line', () => {
    const ok = parseHeaderLines('# comment\nX-Team: eng\n\nX-Trace:on')
    expect(ok.headers).toEqual({ 'X-Team': 'eng', 'X-Trace': 'on' })
    expect(ok.errors).toEqual([])
    const bad = parseHeaderLines('X-Team: eng\nnope\n: empty')
    expect(bad.errors.length).toBe(2)
  })

  test('models parse as `id | name | context | output`, duplicates keep the last', () => {
    const r = parseProfileModels('m-1 | Model One | 128000 | 8192\nm-1 | Renamed | 64000 | 4096\nm-2')
    expect(r.models).toEqual([
      { id: 'm-1', name: 'Renamed', context: 64000, output: 4096, free: false },
      { id: 'm-2', name: 'm-2', context: 0, output: 0, free: false },
    ])
    expect(r.errors).toEqual([])
    expect(parseProfileModels('   ').models).toEqual([])
  })

  test('body merge must be a JSON object; empty means no merge', () => {
    expect(parseJsonObject('')).toEqual({ ok: true, value: {} })
    expect(parseJsonObject('{"top_p":0.9}')).toEqual({ ok: true, value: { top_p: 0.9 } })
    expect(parseJsonObject('[1]').ok).toBe(false)
    expect(parseJsonObject('{oops').ok).toBe(false)
  })

  test('the payload slugs the id, rejects a request path, and never carries a secret', () => {
    const base = {
      id: '',
      name: 'My Gateway',
      format: 'openai-compatible',
      baseUrl: 'https://api.example.com/v1',
      keyRequired: true,
      headers: '',
      body: '',
      temperature: '',
      models: '',
    }
    const ok = toProfilePayload(base)
    expect(ok.errors).toEqual([])
    expect(ok.profile.id).toBe('my-gateway')
    expect(ok.profile.temperature).toBeNull()

    const withPath = toProfilePayload({ ...base, baseUrl: 'https://api.example.com/v1/chat/completions' })
    expect(withPath.errors.some((e) => e.includes('version root'))).toBe(true)
    const noScheme = toProfilePayload({ ...base, baseUrl: 'api.example.com/v1' })
    expect(noScheme.errors.some((e) => e.includes('http://'))).toBe(true)
    const noName = toProfilePayload({ ...base, name: '' })
    expect(noName.errors).toContain('name required')
    const badTemp = toProfilePayload({ ...base, temperature: '5' })
    expect(badTemp.errors.some((e) => e.includes('temperature'))).toBe(true)
  })
})
