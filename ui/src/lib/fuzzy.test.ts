// P52.11 — fuzzy subsequence matcher contract.

import { describe, expect, test } from 'bun:test'
import { fuzzyRank, fuzzyScore } from './fuzzy'

describe('fuzzyScore', () => {
  test('exact substring wins over a spread-out match', () => {
    // "md" → "mode": matched at 0..1 (score 1). "method": matched at 1 and 4
    // with a gap (higher score = worse).
    expect(fuzzyScore('md', 'mode')).toBeLessThan(fuzzyScore('md', 'method'))
    expect(fuzzyScore('md', 'mode')).toBeGreaterThanOrEqual(0)
  })

  test('out-of-order letters do not match', () => {
    expect(fuzzyScore('dm', 'mode')).toBe(-1)
  })

  test('case-insensitive, and missing chars fail', () => {
    expect(fuzzyScore('MD', 'mode')).toBeGreaterThanOrEqual(0)
    expect(fuzzyScore('mxyz', 'mode')).toBe(-1)
  })

  test('blank query never matches (callers show full lists)', () => {
    expect(fuzzyScore('', 'mode')).toBe(-1)
    expect(fuzzyScore('   ', 'mode')).toBe(-1)
  })
})

describe('fuzzyRank', () => {
  const commands = [
    { cmd: '/model' },
    { cmd: '/mode' },
    { cmd: '/export' },
  ]
  test('ranks tight/earlier matches first and drops non-matches', () => {
    const out = fuzzyRank('md', commands, (c) => c.cmd)
    // '/export' has no 'md' → dropped. '/mode' and '/model' share an equally
    // tight run, but the tail penalty breaks the tie toward the shorter text.
    expect(out.map((c) => c.cmd)).toEqual(['/mode', '/model'])
    // A query that distinguishes them ranks the tighter hit first.
    const out2 = fuzzyRank('mode', commands, (c) => c.cmd)
    expect(out2.map((c) => c.cmd)).toEqual(['/mode', '/model'])
  })
  test('blank query keeps original order', () => {
    expect(fuzzyRank('', commands, (c) => c.cmd).map((c) => c.cmd)).toEqual([
      '/model',
      '/mode',
      '/export',
    ])
  })
})
