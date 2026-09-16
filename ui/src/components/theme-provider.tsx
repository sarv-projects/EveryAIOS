'use client'

import * as React from 'react'

export type Theme = 'dark' | 'light'
export type Accent = 'blue' | 'sky' | 'emerald' | 'violet' | 'amber'

interface ThemeContextValue {
  theme: Theme
  setTheme: (t: Theme) => void
  toggle: () => void
  accent: Accent
  setAccent: (a: Accent) => void
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null)

// P55.12 / P58.12 / P66.5 — one theme & accent owner. The provider is the only writer; the
// title-bar sun/moon toggle, the command palette, and Settings → Appearance
// all read/write through this context, and the choice survives a reload.
export const THEME_STORAGE_KEY = 'everyaios.theme'
export const ACCENT_STORAGE_KEY = 'everyaios.accent'

export function readStoredTheme(fallback: Theme): Theme {
  if (typeof window === 'undefined') return fallback
  try {
    const v = window.localStorage.getItem(THEME_STORAGE_KEY)
    return v === 'light' || v === 'dark' ? v : fallback
  } catch {
    return fallback
  }
}

export function readStoredAccent(fallback: Accent = 'blue'): Accent {
  if (typeof window === 'undefined') return fallback
  try {
    const v = window.localStorage.getItem(ACCENT_STORAGE_KEY)
    return v === 'blue' || v === 'sky' || v === 'emerald' || v === 'violet' || v === 'amber' ? v : fallback
  } catch {
    return fallback
  }
}

export function ThemeProvider({
  children,
  defaultTheme = 'dark',
  defaultAccent = 'blue',
  enableSystem = false,
}: {
  children: React.ReactNode
  defaultTheme?: Theme
  defaultAccent?: Accent
  enableSystem?: boolean
}) {
  const [theme, setThemeState] = React.useState<Theme>(() => readStoredTheme(defaultTheme))
  const [accent, setAccentState] = React.useState<Accent>(() => readStoredAccent(defaultAccent))

  React.useEffect(() => {
    const root = document.documentElement
    root.classList.remove('light', 'dark')
    root.classList.add(theme)
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme)
    } catch {
      /* storage may be unavailable — the class is still applied */
    }
  }, [theme])

  React.useEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-accent', accent)
    try {
      window.localStorage.setItem(ACCENT_STORAGE_KEY, accent)
    } catch {
      /* storage may be unavailable */
    }
  }, [accent])

  const setTheme = React.useCallback((t: Theme) => setThemeState(t), [])
  const setAccent = React.useCallback((a: Accent) => setAccentState(a), [])
  const toggle = React.useCallback(
    () => setThemeState((t) => (t === 'dark' ? 'light' : 'dark')),
    []
  )

  const value = React.useMemo(
    () => ({ theme, setTheme, toggle, accent, setAccent }),
    [theme, setTheme, toggle, accent, setAccent]
  )

  // enableSystem kept for API compat; we default to dark and don't auto-switch
  void enableSystem

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = React.useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
