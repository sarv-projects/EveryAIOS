import { afterAll, describe, expect, test } from 'bun:test'
import { THEME_STORAGE_KEY, readStoredTheme } from '@/components/theme-provider'

// P55.12 / P58.12 — one theme owner that survives a reload. These cover the
// stored-value contract the provider (and the pre-paint script in index.html)
// both rely on: the key is stable and only 'light' | 'dark' is accepted.

const originalWindow = (globalThis as { window?: unknown }).window

function stubStorage(value: string | null) {
  ;(globalThis as { window?: unknown }).window = {
    localStorage: { getItem: (k: string) => (k === THEME_STORAGE_KEY ? value : null) },
  }
}

afterAll(() => {
  if (originalWindow === undefined) {
    delete (globalThis as { window?: unknown }).window
  } else {
    ;(globalThis as { window?: unknown }).window = originalWindow
  }
})

describe('theme persistence', () => {
  test('uses the shared storage key', () => {
    expect(THEME_STORAGE_KEY).toBe('everyaios.theme')
  })

  test('restores a stored theme', () => {
    stubStorage('dark')
    expect(readStoredTheme('light')).toBe('dark')
    stubStorage('light')
    expect(readStoredTheme('dark')).toBe('light')
  })

  test('falls back when the stored value is absent or unrecognised', () => {
    stubStorage(null)
    expect(readStoredTheme('light')).toBe('light')
    stubStorage('sepia')
    expect(readStoredTheme('light')).toBe('light')
  })

  test('falls back when storage is unavailable', () => {
    delete (globalThis as { window?: unknown }).window
    expect(readStoredTheme('light')).toBe('light')
  })
})
