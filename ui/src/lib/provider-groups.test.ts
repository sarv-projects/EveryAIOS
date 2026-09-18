import { describe, expect, test } from 'bun:test'
import { rowsByGroup } from './provider-groups'

describe('rowsByGroup (P65.1)', () => {
  const rows = [{ id: 'openai' }, { id: 'anthropic' }, { id: 'ollama' }, { id: 'custom' }]

  test('uses the settings envelope groups, never a second list', () => {
    const got = rowsByGroup(
      rows,
      { configured: ['openai'], popular: ['anthropic', 'openai'], all: ['ollama', 'custom'] },
      () => false,
    )
    expect(got.configured.map((r) => r.id)).toEqual(['openai'])
    expect(got.popular.map((r) => r.id)).toEqual(['anthropic', 'openai'])
    expect(got.catalog.map((r) => r.id)).toEqual(['ollama', 'custom'])
  })

  test('falls back to a configured predicate when the envelope has no groups', () => {
    const got = rowsByGroup(rows, null, (r) => r.id === 'ollama')
    expect(got.configured.map((r) => r.id)).toEqual(['ollama'])
    expect(got.catalog.map((r) => r.id)).toEqual(['openai', 'anthropic', 'custom'])
  })
})
