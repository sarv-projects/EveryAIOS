// P32.11 / WP3 — failure-recovery tests.

import { describe, expect, test } from 'bun:test'
import {
  saferMode,
  saferPrompt,
  differentlyPrompt,
  hasUndoableWork,
  TRY_SAFER_NOTE,
  TRY_DIFFERENTLY_NOTE,
} from './recovery'

describe('saferMode — one notch toward the safest setting', () => {
  test('steps down the ladder', () => {
    expect(saferMode('full')).toBe('auto')
    expect(saferMode('auto')).toBe('ask')
    expect(saferMode('ask')).toBe('sandbox')
  })

  test('offers nothing when already at the safest setting', () => {
    expect(saferMode('sandbox')).toBeNull()
  })

  test('every step is strictly safer than where it started', () => {
    const order = ['sandbox', 'ask', 'auto', 'full']
    for (let i = 1; i < order.length; i++) {
      const cur = order[i] as 'ask' | 'auto' | 'full'
      const next = saferMode(cur)!
      expect(order.indexOf(next)).toBeLessThan(order.indexOf(cur))
    }
  })
})

describe('saferPrompt / differentlyPrompt — the ask changes, not the history', () => {
  test('keeps the original ask and appends the instruction', () => {
    const p = saferPrompt('Fix the parser')
    expect(p).toContain('Fix the parser')
    expect(p).toContain(TRY_SAFER_NOTE)
    expect(differentlyPrompt('Fix the parser')).toContain(TRY_DIFFERENTLY_NOTE)
  })

  test('a missing original still produces usable guidance', () => {
    expect(saferPrompt('')).toBe(TRY_SAFER_NOTE)
    expect(differentlyPrompt('   ')).toBe(TRY_DIFFERENTLY_NOTE)
  })

  test('the two exits ask for different things', () => {
    expect(saferPrompt('x')).not.toBe(differentlyPrompt('x'))
    expect(TRY_SAFER_NOTE.toLowerCase()).toContain('tighter limits')
    expect(TRY_DIFFERENTLY_NOTE.toLowerCase()).toContain('different approach')
  })
})

describe('hasUndoableWork — Undo only when something actually ran', () => {
  test('false when the turn failed before any tool succeeded', () => {
    expect(hasUndoableWork(undefined)).toBe(false)
    expect(hasUndoableWork([])).toBe(false)
    expect(hasUndoableWork([{ status: 'failed' }])).toBe(false)
    expect(hasUndoableWork([{ status: 'running' }])).toBe(false)
  })

  test('true once a tool completed', () => {
    expect(hasUndoableWork([{ status: 'done' }])).toBe(true)
    expect(hasUndoableWork([{ status: 'failed' }, { status: 'done' }])).toBe(true)
  })
})
