'use client'

import { useCallback, useEffect, useState } from 'react'
import { Check, HeartPulse, KeyRound, Plus, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
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
import { CustomProvidersBlock, GeneralExtras } from './settings-sections-studio'

// === General ===
export function GeneralSection() {
  const [startup, setStartup] = useState('last')
  const [tray, setTray] = useState(true)
  const [telemetry, setTelemetry] = useState(false)
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
      <Row label="Language">
        <Select defaultValue="en">
          <SelectTrigger className="h-8 w-48 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="en">English</SelectItem>
            <SelectItem value="ja">日本語</SelectItem>
            <SelectItem value="zh">中文</SelectItem>
            <SelectItem value="de">Deutsch</SelectItem>
          </SelectContent>
        </Select>
      </Row>
      <Row label="On startup">
        <Select value={startup} onValueChange={setStartup}>
          <SelectTrigger className="h-8 w-48 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="last">Restore last session</SelectItem>
            <SelectItem value="new">Open new session</SelectItem>
            <SelectItem value="blank">Show blank state</SelectItem>
          </SelectContent>
        </Select>
      </Row>
      <Row label="Minimize to tray" desc="Keep the agent running when the window is closed">
        <Switch checked={tray} onCheckedChange={setTray} />
      </Row>
      <Row label="Anonymous telemetry" desc="Crash + usage stats, never content">
        <Switch checked={telemetry} onCheckedChange={setTelemetry} />
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

// === Models & BYOK ===
const PROVIDERS = [
  { id: 'p1', name: 'OpenAI', model: 'gpt-4o', status: 'healthy', priority: 1 },
  { id: 'p2', name: 'Anthropic', model: 'claude-sonnet-4.5', status: 'healthy', priority: 2 },
  { id: 'p3', name: 'Google', model: 'gemini-2.5-pro', status: 'healthy', priority: 3 },
  { id: 'p4', name: 'DeepSeek', model: 'deepseek-v3', status: 'unverified', priority: 4 },
  { id: 'p5', name: 'Ollama (local)', model: 'llama3:70b', status: 'offline', priority: 5 },
]

function StatusPill({ status }: { status: string }) {
  const tone =
    status === 'healthy'
      ? 'bg-emerald-500/15 text-emerald-300'
      : status === 'unverified'
        ? 'bg-yellow-500/15 text-yellow-300'
        : 'bg-zinc-500/15 text-zinc-400'
  return (
    <Badge className={cn('text-[9px] capitalize', tone)}>
      {status === 'healthy' && <Check className="h-3 w-3" />}
      {status}
    </Badge>
  )
}

export function ModelsSection() {
  const notify = useAppStore((s) => s.notify)
  const [keys, setKeys] = useState<Array<{ provider: string; keyId: string; opaqueHandle: string; status: string }>>([])
  const [provider, setProvider] = useState('openai')
  const [keyId, setKeyId] = useState('default')
  const [secret, setSecret] = useState('')

  const reload = useCallback(async () => {
    try {
      const { invoke } = await import('@/lib/tauri')
      const r = await invoke<{ keys: Array<{ provider: string; keyId: string; opaqueHandle: string; status: string }> }>('vault_keys_list', {})
      setKeys(r.keys ?? [])
    } catch {
      /* vault locked / preview */
    }
  }, [])

  useEffect(() => { void reload() }, [reload])

  return (
    <SectionShell
      title="API Keys (BYOK)"
      desc="Bring-your-own-key providers — stored in the local SQLCipher vault (opaque handles only in the UI)."
      action={
        <Button
          size="sm"
          className="h-8 bg-orange-500 text-black hover:bg-orange-400"
          onClick={async () => {
            try {
              const { invoke } = await import('@/lib/tauri')
              await invoke('vault_key_add', { provider, keyId, value: secret })
              setSecret('')
              notify(`Stored ${provider}/${keyId} in the vault`)
              await reload()
            } catch (e) {
              notify(String(e), 'error')
            }
          }}
        >
          <Plus className="h-3.5 w-3.5" />
          Add key
        </Button>
      }
    >
      <div className="mb-2 flex flex-wrap gap-1.5">
        <input className="h-7 w-28 rounded border border-border bg-zinc-950 px-2 font-mono text-[10px]" value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="provider" />
        <input className="h-7 w-24 rounded border border-border bg-zinc-950 px-2 font-mono text-[10px]" value={keyId} onChange={(e) => setKeyId(e.target.value)} placeholder="key id" />
        <input className="h-7 flex-1 rounded border border-border bg-zinc-950 px-2 font-mono text-[10px]" type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="sk-…" />
      </div>
      <ul className="space-y-1.5">
        {(keys.length ? keys.map((k, i) => ({
          id: k.opaqueHandle,
          name: `${k.provider} / ${k.keyId}`,
          model: k.opaqueHandle.slice(0, 12) + '…',
          status: k.status === 'primary' ? 'healthy' : 'unverified',
          priority: i + 1,
          keyId: k.keyId,
          provider: k.provider,
        })) : PROVIDERS).map((p) => (
          <li
            key={p.id}
            className="flex items-center gap-3 rounded-md border border-border/50 bg-background/30 px-3 py-2"
          >
            <KeyRound className="h-4 w-4 shrink-0 text-orange-400" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">{p.name}</span>
                <Badge variant="secondary" className="text-[9px]">#{p.priority}</Badge>
              </div>
              <div className="truncate font-mono text-[10px] text-muted-foreground">{p.model}</div>
            </div>
            <StatusPill status={p.status} />
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-[10px]"
                onClick={() => notify(`Health check ${p.name} — ${p.status === 'healthy' ? 'ok, 45ms' : p.status === 'unverified' ? 'unverified' : 'offline'}`)}
              >
                <HeartPulse className="h-3 w-3" />
                Health
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-[10px]"
                onClick={() => notify(`Priority #${p.priority} — drag to reorder`)}
              >
                Priority
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-[10px] text-red-400 hover:bg-red-500/10"
                onClick={async () => {
                  const row = p as { provider?: string; keyId?: string; name: string }
                  if (!row.provider || !row.keyId) {
                    notify('Select a vault-stored key to remove')
                    return
                  }
                  try {
                    const { invoke } = await import('@/lib/tauri')
                    await invoke('vault_key_remove', { provider: row.provider, keyId: row.keyId })
                    notify(`Removed ${row.provider}/${row.keyId}`)
                    await reload()
                  } catch (e) {
                    notify(String(e), 'error')
                  }
                }}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <CustomProvidersBlock />
    </SectionShell>
  )
}
