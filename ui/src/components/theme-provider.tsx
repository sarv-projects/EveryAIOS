'use client'

import * as React from 'react'

type Theme = 'dark' | 'light'

interface ThemeContextValue {
  theme: Theme
  setTheme: (t: Theme) => void
  toggle: () => void
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null)

// P55.12 / P58.12 — one theme owner. The provider is the only writer; the
// title-bar sun/moon toggle, the command palette, and Settings → Appearance
// all read/write through this context, and the choice survives a reload.
// index.html applies the same key before first paint so there is no flash.
export const THEME_STORAGE_KEY = 'everyaios.theme'

export function readStoredTheme(fallback: Theme): Theme {
  if (typeof window === 'undefined') return fallback
  try {
    const v = window.localStorage.getItem(THEME_STORAGE_KEY)
    return v === 'light' || v === 'dark' ? v : fallback
  } catch {
    return fallback
  }
}

export function ThemeProvider({
  children,
  defaultTheme = 'dark',
  enableSystem = false,
}: {
  children: React.ReactNode
  defaultTheme?: Theme
  enableSystem?: boolean
}) {
  const [theme, setThemeState] = React.useState<Theme>(() => readStoredTheme(defaultTheme))

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

  const setTheme = React.useCallback((t: Theme) => setThemeState(t), [])
  const toggle = React.useCallback(
    () => setThemeState((t) => (t === 'dark' ? 'light' : 'dark')),
    []
  )

  const value = React.useMemo(
    () => ({ theme, setTheme, toggle }),
    [theme, setTheme, toggle]
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
