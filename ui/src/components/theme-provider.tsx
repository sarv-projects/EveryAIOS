'use client'

import * as React from 'react'

type Theme = 'dark' | 'light'

interface ThemeContextValue {
  theme: Theme
  setTheme: (t: Theme) => void
  toggle: () => void
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null)

export function ThemeProvider({
  children,
  defaultTheme = 'dark',
  enableSystem = false,
}: {
  children: React.ReactNode
  defaultTheme?: Theme
  enableSystem?: boolean
}) {
  const [theme, setThemeState] = React.useState<Theme>(defaultTheme)

  React.useEffect(() => {
    const root = document.documentElement
    root.classList.remove('light', 'dark')
    root.classList.add(theme)
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
