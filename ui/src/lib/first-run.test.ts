// P32.10 / WP2 — first-five-minutes tests.
//
// The nudge is deliberately the most conservative thing here: it fires at most
// once, never for someone who already has work, and never before the delay has
// actually elapsed. Every case below is a way it could annoy someone if wrong.

import { describe, expect, test } from 'bun:test'
import {
  DAY_MS,
  FIRST_TASKS,
  FIRST_SEEN_KEY,
  NUDGE_SHOWN_KEY,
  markFirstSeen,
  shouldNudgeFirstTask,
  resetFirstRun,
  type FirstRunStorage,
} from './first-run'

function memStorage(seed: Record<string, string> = {}): FirstRunStorage {
  const m = new Map(Object.entries(seed))
  return {
    get: (k) => m.get(k) ?? null,
    set: (k, v) => void m.set(k, v),
  }
}

const T0 = 1_700_000_000_000

describe('FIRST_TASKS — scoped starters, not blank-canvas bait', () => {
  test('offers between 3 and 5 starters (the research range)', () => {
    expect(FIRST_TASKS.length).toBeGreaterThanOrEqual(3)
    expect(FIRST_TASKS.length).toBeLessThanOrEqual(5)
  })

  test('every starter states what will happen and carries a real prompt', () => {
    for (const t of FIRST_TASKS) {
      expect(t.id.length).toBeGreaterThan(0)
      expect(t.label.length).toBeGreaterThan(0)
      expect(t.detail.length).toBeGreaterThan(0)
      expect(t.prompt.trim().length).toBeGreaterThan(0)
    }
  })

  test('ids are unique', () => {
    expect(new Set(FIRST_TASKS.map((t) => t.id)).size).toBe(FIRST_TASKS.length)
  })

  test('the boundary is stated up front where a mutation is involved', () => {
    const tidy = FIRST_TASKS.find((t) => t.id === 'tidy-downloads')!
    expect(tidy.detail.toLowerCase()).toContain('approve')
  })

  test('every starter is achievable with no external setup (WP7)', () => {
    // A starter that needs a connector configured is not a first task.
    for (const t of FIRST_TASKS) {
      expect(t.detail.toLowerCase()).not.toContain('connect your')
      expect(t.detail.toLowerCase()).not.toContain('set up your account')
    }
    // The student path is present.
    expect(FIRST_TASKS.some((t) => t.id === 'explain')).toBe(true)
  })
})

describe('markFirstSeen — stamps once', () => {
  test('stamps on first call', () => {
    const s = memStorage()
    expect(markFirstSeen(s, T0)).toBe(T0)
    expect(s.get(FIRST_SEEN_KEY)).toBe(String(T0))
  })

  test('does not move the stamp on later calls', () => {
    const s = memStorage()
    markFirstSeen(s, T0)
    expect(markFirstSeen(s, T0 + 5 * DAY_MS)).toBe(T0)
  })
})

describe('shouldNudgeFirstTask — at most once, never to someone with work', () => {
  test('does not fire before the delay has elapsed', () => {
    const s = memStorage()
    expect(shouldNudgeFirstTask(s, T0, false)).toBe(false)
    expect(shouldNudgeFirstTask(s, T0 + DAY_MS - 1, false)).toBe(false)
  })

  test('fires once the delay has elapsed', () => {
    const s = memStorage({ [FIRST_SEEN_KEY]: String(T0) })
    expect(shouldNudgeFirstTask(s, T0 + DAY_MS, false)).toBe(true)
  })

  test('never fires twice', () => {
    const s = memStorage({ [FIRST_SEEN_KEY]: String(T0) })
    expect(shouldNudgeFirstTask(s, T0 + DAY_MS, false)).toBe(true)
    expect(shouldNudgeFirstTask(s, T0 + 2 * DAY_MS, false)).toBe(false)
    expect(shouldNudgeFirstTask(s, T0 + 30 * DAY_MS, false)).toBe(false)
    expect(s.get(NUDGE_SHOWN_KEY)).toBe(String(T0 + DAY_MS))
  })

  test('never fires for a user who already has work', () => {
    const s = memStorage({ [FIRST_SEEN_KEY]: String(T0) })
    expect(shouldNudgeFirstTask(s, T0 + 30 * DAY_MS, true)).toBe(false)
    // …and does not burn the one shot, so it stays available if they clear it.
    expect(s.get(NUDGE_SHOWN_KEY)).toBeNull()
  })

  test('a malformed stamp is treated as absent, not as epoch 1970', () => {
    const s = memStorage({ [FIRST_SEEN_KEY]: 'not-a-number' })
    expect(shouldNudgeFirstTask(s, T0, false)).toBe(false)
    expect(s.get(FIRST_SEEN_KEY)).toBe(String(T0))
  })

  test('reset clears both stamps', () => {
    const s = memStorage({ [FIRST_SEEN_KEY]: String(T0), [NUDGE_SHOWN_KEY]: String(T0) })
    resetFirstRun(s)
    expect(shouldNudgeFirstTask(s, T0 + DAY_MS, false)).toBe(false)
    expect(shouldNudgeFirstTask(s, T0 + 2 * DAY_MS, false)).toBe(true)
  })
})
