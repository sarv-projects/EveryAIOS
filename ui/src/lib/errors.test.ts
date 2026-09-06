import { describe, expect, test } from 'bun:test'
import { explainError } from './errors'

describe('P51.2 — error-card translation layer', () => {
  test('known provider codes translate to explanation + hint', () => {
    const x = explainError({ layer: 'provider', code: '429', detail: 'rate limited', retryable: true })
    expect(x.explain).toContain('Rate limited')
    expect(x.hint).toBeTruthy()
  })

  test('guard codes are per-layer and actionable', () => {
    const x = explainError({ layer: 'guard', code: 'ticket_timeout', detail: 'watch timed out', retryable: false })
    expect(x.explain).toContain('timed out')
    expect(x.hint).toBeTruthy()
  })

  test('budget kill explains the cap, never retry advice', () => {
    const x = explainError({ layer: 'budget', code: 'budget_exceeded', detail: 'cap reached', retryable: false })
    expect(x.explain).toContain('spend cap')
    expect(x.hint).toContain('cap')
  })

  test('unknown codes fall back to a layer-generic line, not raw code soup', () => {
    const x = explainError({ layer: 'tool', code: 'weird_thing', detail: 'tool exploded', retryable: true })
    expect(x.explain).toContain('tool call')
    expect(x.explain.length).toBeGreaterThan(10)
  })

  test('detail heuristics rescue unlabeled timeouts/401s', () => {
    expect(explainError({ layer: 'provider', code: undefined, detail: 'connection timed out', retryable: true }).explain).toContain('too long')
    expect(explainError({ layer: 'provider', code: undefined, detail: 'unauthorized: api key invalid', retryable: true }).explain).toContain('API key')
  })
})