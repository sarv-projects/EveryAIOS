'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { useTheme } from '@/components/theme-provider'
import { useLocale } from '@/lib/i18n'
import { usePref } from '@/lib/ui-prefs'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/lib/store'
import { Row, SectionShell } from './settings-shared'
import { GeneralExtras } from './settings-sections-studio'

// === General ===
export function GeneralSection() {
  const powerMode = useAppStore((s) => s.powerMode)
  const setPowerMode = useAppStore((s) => s.setPowerMode)
  const devMode = useAppStore((s) => s.devMode)
  const setDevMode = useAppStore((s) => s.setDevMode)

  return (
    <SectionShell title="General" desc="App behavior, mode, language and tray">
      <Row label="Mode" desc="Simple hides the technical cockpit; Pro shows the full workspace">
        <div className="flex items-center gap-2">
          <span className={cn('text-xs', !powerMode ? 'text-orange-300' : 'text-muted-foreground')}>Simple</span>
          <Switch checked={powerMode} onCheckedChange={setPowerMode} />
          <span className={cn('text-xs', powerMode ? 'text-orange-300' : 'text-muted-foreground')}>Pro</span>
        </div>
      </Row>
      <Row label="Developer Mode" desc="Show the full debug telemetry strip (sidecar, IPC, vault, audit, db)">
        <Switch checked={devMode} onCheckedChange={setDevMode} />
      </Row>
      <Row label="Language" desc="Real switcher lives in Appearance">
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs"
          onClick={() => useAppStore.getState().setSettingsSection('appearance')}
        >
          Open Appearance
        </Button>
      </Row>
      <Row label="Anonymous telemetry" desc="No telemetry sender exists in this build — nothing leaves the machine">
        <Switch checked={false} disabled title="No telemetry sender in this build" />
      </Row>
      <GeneralExtras />
    </SectionShell>
  )
}

// === Appearance ===
export function AppearanceSection() {
  // P11.3 — live appearance controls. Theme + font scale + high contrast are
  // applied to <html> and persisted; the language switcher drives the i18n
  // layer (English default; ar/he enable RTL layout automatically).
  const { theme, setTheme } = useTheme()
  const { locale, setLocale, t } = useLocale()
  const [scale, setScale] = usePref<'sm' | 'md' | 'lg'>('fontScale', 'md')
  const [highContrast, setHighContrast] = usePref<boolean>('highContrast', false)

  useEffect(() => {
    const root = document.documentElement
    root.classList.remove('font-scale-sm', 'font-scale-md', 'font-scale-lg')
    root.classList.add(`font-scale-${scale}`)
  }, [scale])

  useEffect(() => {
    document.documentElement.classList.toggle('high-contrast', highContrast)
  }, [highContrast])

  return (
    <SectionShell title="Appearance" desc="Theme, text size, contrast and language (P11.3)">
      <Row label="Theme">
        <div className="flex gap-1.5">
          {(['light', 'dark'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTheme(t)}
              className={cn(
                'rounded-md border px-3 py-1 text-xs capitalize transition-colors',
                theme === t
                  ? 'border-orange-500 bg-orange-500/15 text-orange-300'
                  : 'border-border bg-background/40 text-muted-foreground hover:text-foreground',
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </Row>
      <Row label="Text size">
        <div className="flex w-56 items-center gap-3">
          <Slider
            value={[scale === 'sm' ? 0 : scale === 'lg' ? 2 : 1]}
            min={0}
            max={2}
            step={1}
            onValueChange={(v) => setScale(v[0] === 0 ? 'sm' : v[0] === 2 ? 'lg' : 'md')}
          />
          <span className="w-16 font-mono text-xs text-orange-300">
            {scale === 'sm' ? 'Small' : scale === 'lg' ? 'Large' : 'Default'}
          </span>
        </div>
        <p className="text-[10px] text-muted-foreground">
          Scaled from the system text-size preference.
        </p>
      </Row>
      <Row label="High contrast">
        <Switch checked={highContrast} onCheckedChange={setHighContrast} />
        <p className="text-[10px] text-muted-foreground">
          WCAG 2.1 AA-boosted surfaces for low-vision users.
        </p>
      </Row>
      <Row label="Language">
        <Select value={locale} onValueChange={(v) => setLocale(v as 'en' | 'ar' | 'he')}>
          <SelectTrigger className="h-8 w-48 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="en">English</SelectItem>
            <SelectItem value="ar">العربية (RTL)</SelectItem>
            <SelectItem value="he">עברית (RTL)</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-[10px] text-muted-foreground">
          {t('settings.language')} — Arabic/Hebrew flip the layout to RTL.
        </p>
      </Row>
    </SectionShell>
  )
}
