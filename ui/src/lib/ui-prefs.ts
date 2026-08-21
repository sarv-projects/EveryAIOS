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

function writeRaw(key: string, value: string) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(PREFIX + key, value)
  } catch {
    /* storage may be unavailable */
  }
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
export type TaskIntent = 'work' | 'code' | 'design'
