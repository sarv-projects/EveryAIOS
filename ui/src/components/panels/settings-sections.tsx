'use client'

import { Check, Monitor, Moon, RotateCcw, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  ACCENT_PRESETS,
  DENSITY_PRESETS,
  THEME_PRESETS,
  useTheme,
} from '@/components/theme-provider'
import { useLocale } from '@/lib/i18n'
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
          <span className={cn('text-xs', !powerMode ? 'text-sky-300 font-medium' : 'text-muted-foreground')}>Simple</span>
          <Switch checked={powerMode} onCheckedChange={setPowerMode} />
          <span className={cn('text-xs', powerMode ? 'text-sky-300 font-medium' : 'text-muted-foreground')}>Pro</span>
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

/** One option in a segmented control. The tick slot is always rendered and
 * only its opacity changes, so selecting an option cannot resize the group or
 * shift the row beside it — and the choice is never signalled by colour alone. */
function Choice({
  selected,
  onClick,
  children,
}: {
  selected: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors',
        selected
          ? 'border-brand/60 bg-brand/10 font-medium text-brand'
          : 'border-border bg-background/40 text-muted-foreground hover:bg-accent/60 hover:text-foreground',
      )}
    >
      <Check
        aria-hidden
        className={cn('size-3 shrink-0 transition-opacity', selected ? 'opacity-100' : 'opacity-0')}
      />
      {children}
    </button>
  )
}

const THEME_ICONS = { light: Sun, dark: Moon, system: Monitor } as const

/** Live sample of the current appearance: real tokens on a real surface, so the
 * user judges theme + accent + density from the thing itself rather than from a
 * swatch. Decorative for assistive tech — every value it shows has a labelled
 * control above it. */
function AppearancePreview() {
  return (
    <div
      aria-hidden
      className="rounded-lg border border-border bg-surface-1 p-3 text-xs shadow-inset-soft"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-foreground">Preview</span>
        <span className="rounded-full border border-brand/40 bg-brand/10 px-2 py-0.5 text-[10px] font-medium text-brand">
          Accent
        </span>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Secondary text on the current surface, at your text size and density.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground">
          Primary
        </span>
        <span className="rounded-md border border-border px-2.5 py-1 text-[11px] text-foreground">
          Outlined
        </span>
        <span className="text-[10px] font-medium text-success">■ ok</span>
        <span className="text-[10px] font-medium text-warning">■ caution</span>
        <span className="text-[10px] font-medium text-danger">■ failed</span>
      </div>
    </div>
  )
}

export function AppearanceSection() {
  // P11.3 / P66.5 / P70 — every control here drives the one appearance owner
  // (`ThemeProvider`), which persists the choice and applies it to <html>.
  // Nothing in this panel writes the DOM itself any more: a second owner
  // applying `font-scale-*` / `high-contrast` meant the panel and the pre-paint
  // script could disagree, and the preference only held while this section
  // happened to be mounted. The language switcher still drives the i18n layer
  // (English default; ar/he flip the layout to RTL automatically).
  const {
    theme,
    mode,
    setMode,
    accent,
    setAccent,
    fontScale,
    setFontScale,
    highContrast,
    setHighContrast,
    density,
    setDensity,
    resetAppearance,
  } = useTheme()
  const { locale, setLocale, t } = useLocale()

  const isDefault =
    mode === 'system' && accent === 'blue' && fontScale === 'md' && !highContrast &&
    density === 'comfortable'

  return (
    <SectionShell
      title="Appearance"
      desc="Theme, accent, density, text size, contrast and language — saved with the app (P11.3, P66.5, P70)"
    >
      <AppearancePreview />

      <Row
        label="Theme"
        desc={
          mode === 'system'
            ? `Following the OS — currently ${theme}`
            : `Always ${theme}, on every display`
        }
      >
        <div className="flex flex-wrap gap-1.5">
          {THEME_PRESETS.map((preset) => {
            const Icon = THEME_ICONS[preset.id]
            return (
              <Choice
                key={preset.id}
                selected={mode === preset.id}
                onClick={() => setMode(preset.id)}
              >
                <Icon className="size-3" aria-hidden />
                {preset.label}
              </Choice>
            )
          })}
        </div>
      </Row>

      <Row label="Accent color" desc="Recolors buttons, focus rings, links and charts">
        <div className="flex flex-wrap gap-1.5">
          {ACCENT_PRESETS.map((preset) => (
            <Choice
              key={preset.id}
              selected={accent === preset.id}
              onClick={() => setAccent(preset.id)}
            >
              <span className={cn('size-2 rounded-full', preset.swatch)} aria-hidden />
              {preset.label}
            </Choice>
          ))}
        </div>
      </Row>

      <Row label="Density" desc="Space between rows, cards and controls">
        <div className="flex flex-wrap gap-1.5">
          {DENSITY_PRESETS.map((preset) => (
            <Choice
              key={preset.id}
              selected={density === preset.id}
              onClick={() => setDensity(preset.id)}
            >
              {preset.label}
            </Choice>
          ))}
        </div>
      </Row>

      <Row label="Text size" desc="Scales every rem-based size, not only this panel">
        <div className="flex w-56 items-center gap-3">
          <Slider
            value={[fontScale === 'sm' ? 0 : fontScale === 'lg' ? 2 : 1]}
            min={0}
            max={2}
            step={1}
            onValueChange={(v) => setFontScale(v[0] === 0 ? 'sm' : v[0] === 2 ? 'lg' : 'md')}
          />
          <span className="w-16 font-mono text-xs font-medium text-brand">
            {fontScale === 'sm' ? 'Small' : fontScale === 'lg' ? 'Large' : 'Default'}
          </span>
        </div>
      </Row>

      <Row label="High contrast" desc="Boosted surfaces and separators for low-vision use">
        <Switch
          checked={highContrast}
          onCheckedChange={setHighContrast}
          aria-label="High contrast"
        />
      </Row>

      <Row label="Language">
        <Select value={locale} onValueChange={(v) => setLocale(v as 'en' | 'ar' | 'he')}>
          <SelectTrigger className="h-8 w-48 text-xs" aria-label={t('settings.language')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="en">English</SelectItem>
            <SelectItem value="ar">العربية (RTL)</SelectItem>
            <SelectItem value="he">עברית (RTL)</SelectItem>
          </SelectContent>
        </Select>
      </Row>

      <Row label="Reset appearance" desc="Back to the shipped defaults">
        <Button
          size="sm"
          variant="outline"
          className="h-8 gap-1.5 text-xs"
          disabled={isDefault}
          onClick={resetAppearance}
        >
          <RotateCcw className="size-3" aria-hidden />
          Reset
        </Button>
      </Row>
    </SectionShell>
  )
}
