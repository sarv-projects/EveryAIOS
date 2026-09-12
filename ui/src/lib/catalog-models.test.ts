// P58.7 — catalog-backed picker rows.
//
// The picker must offer the models a keyed provider actually serves (models.dev
// rows, real ids/context/prices) and must carry that provider into the send
// path. These tests pin the mapping rules: usability, the honest defaults for
// omitted catalog fields, profile-wins dedupe, and the status-bar label.

import { describe, expect, test } from 'bun:test'
import {
  catalogPickLabel,
  catalogPickerModels,
  flattenCatalogRows,
  toCatalogPickerModel,
  usableCatalogProviders,
  type CatalogPickerModel,
} from './catalog-models'
import type { CatalogModel, CatalogProviderRow } from './providers'

function row(over: Partial<CatalogProviderRow> = {}): CatalogProviderRow {
  return {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    logoUrl: 'https://models.dev/logos/openai.svg',
    source: 'models-dev-live',
    keyConfigured: false,
    ...over,
  }
}

function model(over: Partial<CatalogModel> = {}): CatalogModel {
  return { id: 'gpt-5-codex', name: 'GPT-5 Codex', ...over }
}

describe('P58.7 — usable providers', () => {
  test('only a keyed, profiled, or keyless provider is offered as a chat target', () => {
    const rows = [
      row({ id: 'openai', keyConfigured: true }),
      row({ id: 'custom-gw', profileSource: 'userconfig' }),
      row({ id: 'opencode-free', keyless: true }),
      row({ id: 'unkeyed-catalog-row' }),
    ]
    expect(usableCatalogProviders(rows).map((r) => r.id)).toEqual([
      'openai',
      'custom-gw',
      'opencode-free',
    ])
  })

  test('an empty catalog yields no rows (never a fabricated provider)', () => {
    expect(usableCatalogProviders([])).toEqual([])
  })
})

describe('P58.7 — picker row mapping', () => {
  test('a full catalog row maps field-for-field', () => {
    const m = toCatalogPickerModel(
      'openai',
      model({
        id: 'gpt-5-codex',
        name: 'GPT-5 Codex',
        context: 272_000,
        output: 128_000,
        priceInput: 1.25,
        priceOutput: 10,
        reasoning: true,
        toolCall: true,
        images: false,
      }),
    )
    expect(m).toEqual({
      id: 'gpt-5-codex',
      label: 'GPT-5 Codex',
      provider: 'openai',
      context: 272_000,
      output: 128_000,
      inputPrice: 1.25,
      outputPrice: 10,
      reasoning: true,
      toolCall: true,
      images: false,
      free: false,
      profile: false,
    })
  })

  test('omitted catalog fields stay honest — zero counts, absent price', () => {
    const m = toCatalogPickerModel('opencode-free', { id: 'big-pickle' })
    expect(m.label).toBe('big-pickle')
    expect(m.context).toBe(0)
    expect(m.output).toBe(0)
    // A missing cost field is *not* a zero price: the row must render `—`.
    expect(m.inputPrice).toBeNull()
    expect(m.outputPrice).toBeNull()
    expect(m.reasoning).toBe(false)
    expect(m.toolCall).toBe(false)
    expect(m.images).toBe(false)
  })

  test('a real zero price survives as zero (free tier, not unknown)', () => {
    const m = toCatalogPickerModel('opencode-free', model({ id: 'ling-free', priceInput: 0, priceOutput: 0, free: true }))
    expect(m.inputPrice).toBe(0)
    expect(m.outputPrice).toBe(0)
    expect(m.free).toBe(true)
  })

  test('free and profile provenance survive the mapping', () => {
    const m = toCatalogPickerModel('custom-gw', model({ id: 'm-1', free: true, fromProfile: true }))
    expect(m.free).toBe(true)
    expect(m.profile).toBe(true)
  })

  test('profile models come first and dedupe by id (a table, not a list)', () => {
    const rows = catalogPickerModels(
      'custom-gw',
      [model({ id: 'm-1', name: 'From catalog' }), model({ id: 'm-2' })],
      [model({ id: 'm-1', name: 'From profile', fromProfile: true })],
    )
    expect(rows.map((r) => r.id)).toEqual(['m-1', 'm-2'])
    expect(rows[0]!.label).toBe('From profile')
    expect(rows[0]!.profile).toBe(true)
  })

  test('a row without an id is skipped rather than rendered blank', () => {
    const rows = catalogPickerModels('openai', [{ id: '' }, model({ id: 'kept' })])
    expect(rows.map((r) => r.id)).toEqual(['kept'])
  })

  test('groups flatten in provider order', () => {
    const a: CatalogPickerModel[] = [toCatalogPickerModel('a', model({ id: 'a1' }))]
    const b: CatalogPickerModel[] = [toCatalogPickerModel('b', model({ id: 'b1' }))]
    expect(flattenCatalogRows([a, b]).map((r) => `${r.provider}:${r.id}`)).toEqual(['a:a1', 'b:b1'])
  })
})

describe('P58.7 — status-bar label', () => {
  test('a catalog pick is named by the exact provider · id pair sent to the broker', () => {
    expect(catalogPickLabel('anthropic', 'claude-sonnet-4-5')).toBe('anthropic · claude-sonnet-4-5')
  })

  test('a curated pick has no catalog label (the caller keeps its own)', () => {
    expect(catalogPickLabel(undefined, 'gpt-5')).toBeNull()
  })
})
