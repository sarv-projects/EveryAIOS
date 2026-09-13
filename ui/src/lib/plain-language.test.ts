// P32 — casual-vs-power plain-language layer tests.
//
// The honesty invariant is the important one here: `preciseFigures` shipped a
// version that returned hardcoded sample counts while the artifact card
// rendered them under a tooltip claiming receipt provenance. These tests pin
// the corrected contract — figures come only from the run, and an unknown
// count is never rendered as a number.

import { describe, expect, test } from 'bun:test'
import {
  PLAIN_STAGE_LABELS,
  toPlainStage,
  preciseFigures,
  limitationFor,
  suggestAgentNames,
  SUGGESTED_AGENT_NAMES,
  PLAIN_AUTONOMY_ORDER,
  toPlainAutonomy,
  PLAIN_NOUNS,
  toPlainNoun,
} from './plain-language'

const TYPES = ['docx', 'xlsx', 'pptx', 'pdf', 'code', 'markdown', 'image', 'webapp'] as const

describe('preciseFigures — never invents numbers', () => {
  test('renders nothing when the run reported no figures', () => {
    for (const type of TYPES) {
      expect(preciseFigures({ type, name: 'out.x', preview: '' })).toEqual([])
    }
  })

  test('an empty figures list stays empty (never falls back to a sample)', () => {
    expect(preciseFigures({ type: 'xlsx', name: 'q3.xlsx', preview: '', figures: [] })).toEqual([])
  })

  test('returns exactly the figures the run reported, in order', () => {
    const figures = ['2 sheets', '7 cells updated']
    expect(preciseFigures({ type: 'xlsx', name: 'q3.xlsx', preview: '', figures })).toEqual(figures)
  })

  test('produces no digits of its own for any artifact type', () => {
    // The whole point: there is no counting path in this function.
    for (const type of TYPES) {
      const out = preciseFigures({ type, name: 'out.x', preview: '' })
      expect(out.join(' ')).not.toMatch(/\d/)
    }
  })
})

describe('toPlainStage — consumer phrasing for stages', () => {
  test('maps a known stage to plain language', () => {
    expect(toPlainStage('streaming_start')).toBe('Thinking…')
    expect(toPlainStage('planning')).toBe('Working out a plan…')
  })

  test('maps an unknown tool stage to "Working with <id>…"', () => {
    expect(toPlainStage('tool:office:running')).toBe('Updating your document…')
    expect(toPlainStage('tool:some-new-tool:running')).toBe('Working with some new tool…')
  })

  test('falls back to the raw label for a stage it does not know', () => {
    expect(toPlainStage('totally_unknown')).toBe('totally_unknown')
  })

  test('a settled tool stage is a sentence, not machine text (WP8)', () => {
    expect(toPlainStage('tool:search:done')).toBe('Finished with search.')
    expect(toPlainStage('tool:shell:failed')).toBe(
      'That did not work with shell — trying another way.',
    )
  })

  test('prefixed stages are described by their head (WP8)', () => {
    expect(toPlainStage('routed:openai/gpt-4o · cheap')).toBe('Choosing the best model…')
    expect(toPlainStage('cache:hit:semantic')).toBe('Reusing what I already worked out…')
    expect(toPlainStage('context:logged:12')).toBe('Keeping a record of what I used…')
    expect(toPlainStage('chief:refused:no-key')).toBe('Handing this to another agent…')
  })

  test('no raw machine punctuation reaches a learned stage', () => {
    for (const s of ['routed:a/b · why', 'cache:hit:semantic', 'context:logged:3']) {
      expect(toPlainStage(s)).not.toContain(':')
    }
  })

  test('every mapped label is consumer-facing (no engine vocabulary)', () => {
    for (const label of Object.values(PLAIN_STAGE_LABELS)) {
      expect(label).not.toMatch(/tool|exec|stage|token|LLM/i)
    }
  })
})

describe('limitationFor — plain what-happened plus an alternative', () => {
  test('budget failures name the limit and the setting', () => {
    const l = limitationFor('turn budget exceeded')
    expect(l.plain.toLowerCase()).toContain('budget')
    expect(l.alternative.toLowerCase()).toContain('settings')
  })

  test('provider/key failures point at the key or a local model', () => {
    const l = limitationFor('provider returned 401: invalid api key')
    expect(l.alternative.toLowerCase()).toContain('local model')
  })

  test('permission failures explain the go-ahead, not a stack trace', () => {
    const l = limitationFor('permission denied')
    expect(l.plain.toLowerCase()).toContain('allowed')
  })

  test('an unrecognised error still gets a plain sentence and a next step', () => {
    const l = limitationFor('ECONNRESET at 0x00')
    expect(l.plain.length).toBeGreaterThan(0)
    expect(l.alternative.length).toBeGreaterThan(0)
    expect(l.plain).not.toContain('ECONNRESET')
  })
})

describe('toPlainNoun — the casual vocabulary map', () => {
  test('maps the jargon nouns to plain words', () => {
    expect(toPlainNoun('Guard')).toBe('safety check')
    expect(toPlainNoun('Trust Ladder')).toBe('safety levels')
    expect(toPlainNoun('ACP')).toBe('external agent')
  })

  test('is case- and whitespace-insensitive', () => {
    expect(toPlainNoun('  MCP  ')).toBe('connected tools')
    expect(toPlainNoun('vault')).toBe('secure key store')
  })

  test('a word it does not know keeps its own name', () => {
    expect(toPlainNoun('foobar')).toBe('foobar')
  })

  test('no mapped noun is described by another jargon term', () => {
    for (const [term, plain] of Object.entries(PLAIN_NOUNS)) {
      expect(plain.toLowerCase()).not.toBe(term)
      for (const other of ['mcp', 'acp', 'sidecar', 'trajectory']) {
        expect(plain.toLowerCase()).not.toBe(other)
      }
    }
  })
})

describe('toPlainAutonomy — one dial in plain words', () => {
  test('every level has a label and a sentence, never a bare word', () => {
    for (const id of PLAIN_AUTONOMY_ORDER) {
      const p = toPlainAutonomy(id)
      expect(p.label.length).toBeGreaterThan(0)
      expect(p.hint.length).toBeGreaterThan(0)
    }
  })

  test('the technical value is never the user-facing label', () => {
    for (const id of PLAIN_AUTONOMY_ORDER) {
      expect(toPlainAutonomy(id).label.toLowerCase()).not.toBe(id)
    }
  })

  test('an unknown level is shown as itself, not described as something else', () => {
    expect(toPlainAutonomy('turbo')).toEqual({ emoji: '', label: 'turbo', hint: '' })
  })

  test('the order runs from most cautious to most free', () => {
    expect(PLAIN_AUTONOMY_ORDER[0]).toBe('sandbox')
    expect(PLAIN_AUTONOMY_ORDER[PLAIN_AUTONOMY_ORDER.length - 1]).toBe('full')
  })

  test('“Just do it” states its own hard stops', () => {
    expect(toPlainAutonomy('full').hint.toLowerCase()).toContain('still ask')
  })
})

describe('suggestAgentNames — the naming moment', () => {
  test('returns the requested count from the suggestion list', () => {
    const names = suggestAgentNames(4)
    expect(names).toHaveLength(4)
    for (const n of names) expect(SUGGESTED_AGENT_NAMES).toContain(n)
  })

  test('is deterministic so a first run looks the same every time', () => {
    expect(suggestAgentNames(4)).toEqual(suggestAgentNames(4))
  })

  test('clamps to the names the catalog actually holds', () => {
    const all = suggestAgentNames(999)
    expect(all.length).toBeLessThanOrEqual(SUGGESTED_AGENT_NAMES.length)
    for (const n of all) expect(SUGGESTED_AGENT_NAMES).toContain(n)
  })
})
