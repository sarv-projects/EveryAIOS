import { useCallback, useState } from 'react'

const PREFIX = 'everyaios.settings.'

function readRaw(key: string): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(PREFIX + key)
  } catch {
    return null
  }
}

/** Persist one preference. Exported so a non-React owner (the theme
 * provider, which must apply prefs at boot rather than only while a settings
 * panel is mounted) writes the exact key + encoding `usePref` reads. */
export function writePref<T>(key: string, value: T) {
  writeRaw(key, JSON.stringify(value))
}

function writeRaw(key: string, value: string) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(PREFIX + key, value)
  } catch {
    /* storage may be unavailable */
  }
}

function parseOrUndefined<T>(raw: string | null): T | undefined {
  if (raw == null) return undefined
  try {
    return JSON.parse(raw) as T
  } catch {
    return undefined
  }
}

/** Read one appearance value from its **own literal key**.
 *
 * The appearance keys (`everyaios.theme`, `everyaios.accent`, …) are already
 * namespaced, and the pre-paint script in `index.html` reads them with plain
 * `localStorage` because it runs before any module loads. Two consequences,
 * both of which were broken:
 *
 * - going through `usePref` prefixes the key a second time
 *   (`everyaios.settings.everyaios.theme`), so the boot script looked for a key
 *   nothing ever wrote — every reload flashed the default appearance;
 * - the value is stored as **plain text**, not JSON, so the boot script needs
 *   no parser and cannot fail on a corrupt entry. A value left behind by the
 *   JSON era (`"dark"` with quotes) is still read correctly, so an existing
 *   choice survives the change.
 *
 * The settings-prefixed location is also read as a fallback, for installs that
 * saved while the double-prefix was in force. */
export function readStoredText(key: string, initial: string): string {
  if (typeof window === 'undefined') return initial
  let raw: string | null = null
  try {
    raw = window.localStorage.getItem(key)
    if (raw == null) raw = window.localStorage.getItem(PREFIX + key)
  } catch {
    return initial
  }
  if (raw == null || raw === '') return initial
  if (raw.startsWith('"')) {
    const legacy = parseOrUndefined<unknown>(raw)
    return typeof legacy === 'string' ? legacy : initial
  }
  return raw
}

/** Write one appearance value as plain text. Mirror of `readStoredText`. */
export function writeStoredText(key: string, value: string) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, value)
  } catch {
    /* storage may be unavailable */
  }
}

/** Read an appearance flag. Stored as `true`/`false` text; `1`/`0` and the
 * JSON-era booleans are accepted so a reset or migration cannot lose it. */
export function readStoredFlag(key: string, initial: boolean): boolean {
  const raw = readStoredText(key, initial ? 'true' : 'false')
  if (raw === 'true' || raw === '1' || raw === 'yes') return true
  if (raw === 'false' || raw === '0' || raw === 'no') return false
  return initial
}

/** Write an appearance flag as text. Mirror of `readStoredFlag`. */
export function writeStoredFlag(key: string, value: boolean) {
  writeStoredText(key, value ? 'true' : 'false')
}

/** Delete an appearance value so a reset cannot be undone by a reload. Removing
 * (rather than storing a sentinel) keeps "never chosen" and "chosen and reset"
 * the same state. */
export function removeStoredKey(key: string) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(key)
  } catch {
    /* storage may be unavailable */
  }
}

/** Non-hook read for producers outside React (wire handlers, bridge).
 * Mirrors `usePref` exactly: absent/unparseable ⇒ the caller's default. */
export function readPref<T>(key: string, initial: T): T {
  const parsed = parseOrUndefined<T>(readRaw(key))
  return parsed === undefined ? initial : parsed
}

export function usePref<T>(key: string, initial: T): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(() => {
    const raw = readRaw(key)
    if (raw == null) return initial
    try {
      return JSON.parse(raw) as T
    } catch {
      return initial
    }
  })
  const set = useCallback(
    (next: T) => {
      setValue(next)
      writeRaw(key, JSON.stringify(next))
    },
    [key],
  )
  return [value, set]
}

export type PermissionMode = 'sandbox' | 'ask' | 'auto' | 'full'
export type ComposerRole = 'agent' | 'experts' | 'spec'
