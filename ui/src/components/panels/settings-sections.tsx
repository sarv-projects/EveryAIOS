'use client'

import { useCallback, useEffect, useState } from 'react'
import { Check, Copy, ExternalLink, KeyRound, Plus, Search, Trash2 } from 'lucide-react'
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
import { formatContext, formatPrice } from '@/lib/agents'
import {
  loadProviderDirectory,
  type ProviderEntry,
  type VaultKeyRow,
} from '@/lib/providers'
import { Row, SectionShell } from './settings-shared'
import { CustomProvidersBlock, GeneralExtras } from './settings-sections-studio'

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

// === Providers & BYOK ===
// Live registry dropdown (all 212 vendored models.dev providers) + per-row
// detail panel: API-key slot (vault only), provider facts, curated models,
// and the models.dev page for the full list + provider docs. No seeded rows:
// an empty vault renders empty, never fake-healthy providers.

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
  const [providers, setProviders] = useState<ProviderEntry[]>([])
  const [live, setLive] = useState(false)
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [keys, setKeys] = useState<VaultKeyRow[]>([])
  const [keyId, setKeyId] = useState('default')
  const [secret, setSecret] = useState('')

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const dir = await loadProviderDirectory()
      setProviders(dir.providers)
      setLive(dir.live)
      if (!selectedId && dir.providers.length > 0) {
        setSelectedId(dir.providers[0].id)
      }
      const { invoke } = await import('@/lib/tauri')
      const r = await invoke<{ keys?: VaultKeyRow[] }>('vault_keys_list', {})
      const rows = r.keys ?? []
      setKeys(rows)
      // P50.4.1 — keep the live provider-configured fact in sync with the
      // vault (drives the setup gate + no-provider UX).
      useAppStore.getState().setProviderKeysConfigured(rows.length > 0)
    } catch {
      /* vault locked / preview — honest empty states below */
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { void reload() }, [reload])

  const q = query.trim().toLowerCase()
  const filtered = q
    ? providers.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.id.toLowerCase().includes(q) ||
          (p.envVar ?? '').toLowerCase().includes(q),
      )
    : providers
  const selected =
    providers.find((p) => p.id === selectedId) ?? filtered[0] ?? providers[0]
  const selectedKeys = selected
    ? keys.filter((k) => k.provider === selected.id)
    : []

  const addKey = async () => {
    if (!selected || !secret.trim()) {
      notify('Paste the API key first', 'error')
      return
    }
    try {
      const { invoke } = await import('@/lib/tauri')
      await invoke('vault_key_add', {
        provider: selected.id,
        keyId: keyId.trim() || 'default',
        value: secret,
      })
      setSecret('')
      notify(`Stored ${selected.name} key in the vault`)
      await reload()
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), 'error')
    }
  }

  const copyText = (text: string, label: string) => {
    void navigator.clipboard
      ?.writeText(text)
      .then(() => notify(`Copied ${label}`))
      .catch(() => notify(`Copy unavailable — ${label}: ${text}`, 'error'))
  }

  return (
    <SectionShell
      title="Providers / BYOK"
      desc="Bring-your-own-key providers — pick a row for its key slot, facts, models, and docs link. Keys live in the local SQLCipher vault (opaque handles only in the UI)."
      action={
        <Button
          size="sm"
          variant="outline"
          className="h-8"
          disabled={loading}
          onClick={() => void reload()}
        >
          {loading ? 'Refreshing…' : `Refresh${live ? ` (${providers.length})` : ''}`}
        </Button>
      }
    >
      {!live && (
        <p className="rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1.5 text-[10px] text-amber-300">
          Live registry unreachable (preview or vault locked) — showing common
          providers. The full 212-provider directory loads inside the Tauri shell.
        </p>
      )}

      {/* Search + dropdown */}
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="relative min-w-[160px] flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            className="h-8 w-full rounded border border-border bg-zinc-950 pl-7 pr-2 text-xs"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${providers.length || '…'} providers…`}
          />
        </div>
        <select
          value={selected?.id ?? ''}
          onChange={(e) => setSelectedId(e.target.value)}
          className="h-8 min-w-[200px] flex-1 rounded border border-border bg-zinc-950 px-2 font-mono text-xs text-foreground"
          aria-label="Provider"
        >
          {filtered.map((p) => (
            <option key={p.id} value={p.id}>
              {p.keyConfigured ? '● ' : ''}
              {p.name}
            </option>
          ))}
        </select>
      </div>
      {query && filtered.length === 0 && (
        <p className="text-[11px] text-muted-foreground">
          No provider matches “{query}” — try the full list on{' '}
          <button
            type="button"
            className="text-orange-300 underline-offset-2 hover:underline"
            onClick={() => window.open('https://models.dev/providers/', '_blank')}
          >
            models.dev
          </button>
          .
        </p>
      )}

      {/* Detail panel for the selected provider */}
      {selected ? (
        <div className="rounded-lg border border-border/60 bg-background/40 p-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-semibold text-foreground">{selected.name}</span>
            <Badge variant="secondary" className="font-mono text-[9px]">
              {selected.id}
            </Badge>
            {selected.keyConfigured ? (
              <Badge className="bg-emerald-500/15 text-[9px] text-emerald-300">
                <Check className="h-2.5 w-2.5" /> key added
              </Badge>
            ) : (
              <Badge className="bg-zinc-500/15 text-[9px] text-zinc-400">no key</Badge>
            )}
            <Badge variant="outline" className="text-[9px] text-muted-foreground">
              {selected.source}
            </Badge>
            <div className="ml-auto flex items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-[10px]"
                onClick={() => window.open(selected.docUrl, '_blank')}
                title="Full model list, pricing, and provider docs on models.dev"
              >
                <ExternalLink className="h-3 w-3" />
                models.dev
              </Button>
            </div>
          </div>

          <div className="mt-2 grid gap-1 font-mono text-[10px] text-muted-foreground sm:grid-cols-2">
            <div className="flex items-center gap-1.5">
              <span className="shrink-0 text-muted-foreground/70">auth</span>
              <span className="truncate text-foreground/80">{selected.auth}</span>
              {selected.envVar && (
                <button
                  type="button"
                  className="flex shrink-0 items-center gap-0.5 text-orange-300 underline-offset-2 hover:underline"
                  onClick={() => copyText(selected.envVar ?? '', 'env var name')}
                  title="Copy the env-var name (never a secret)"
                >
                  <Copy className="h-2.5 w-2.5" />
                  {selected.envVar}
                </button>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="shrink-0 text-muted-foreground/70">endpoint</span>
              <span className="truncate text-foreground/80">
                {selected.baseUrl || 'SDK default'}
              </span>
            </div>
          </div>
          {selected.capabilities.length > 0 && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
              caps:{' '}
              {selected.capabilities.map((c) => (
                <span
                  key={c}
                  className="rounded border border-border/50 bg-background/40 px-1 py-0.5 font-mono text-[9px]"
                >
                  {c}
                </span>
              ))}
              {selected.capabilitiesVerified ? (
                <span className="text-emerald-400">✓ verified</span>
              ) : (
                <span className="text-amber-400">advertised</span>
              )}
            </div>
          )}

          {/* API-key slot (vault only) */}
          <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-border/40 pt-2.5">
            <input
              className="h-7 w-24 rounded border border-border bg-zinc-950 px-2 font-mono text-[10px]"
              value={keyId}
              onChange={(e) => setKeyId(e.target.value)}
              placeholder="key id"
              aria-label="Key id"
            />
            <input
              className="h-7 min-w-[160px] flex-1 rounded border border-border bg-zinc-950 px-2 font-mono text-[10px]"
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="sk-… (stored in the vault, never shown again)"
              aria-label="API key value"
            />
            <Button
              size="sm"
              className="h-7 bg-orange-500 text-black hover:bg-orange-400"
              onClick={() => void addKey()}
            >
              <Plus className="h-3.5 w-3.5" />
              Add key
            </Button>
          </div>

          {/* Stored keys for this provider — honest empty */}
          {selectedKeys.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {selectedKeys.map((k) => (
                <li
                  key={k.opaqueHandle}
                  className="flex items-center gap-2 rounded-md border border-border/50 bg-background/30 px-2 py-1.5"
                >
                  <KeyRound className="h-3.5 w-3.5 shrink-0 text-orange-400" />
                  <span className="font-mono text-[10px] text-foreground">
                    {k.provider} / {k.keyId}
                  </span>
                  <span className="truncate font-mono text-[9px] text-muted-foreground">
                    {k.opaqueHandle.slice(0, 12)}…
                  </span>
                  <StatusPill status={k.status === 'primary' ? 'healthy' : 'unverified'} />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto h-6 px-2 text-[10px] text-red-400 hover:bg-red-500/10"
                    onClick={async () => {
                      try {
                        const { invoke } = await import('@/lib/tauri')
                        await invoke('vault_key_remove', {
                          provider: k.provider,
                          keyId: k.keyId,
                        })
                        notify(`Removed ${k.provider}/${k.keyId}`)
                        await reload()
                      } catch (e) {
                        notify(e instanceof Error ? e.message : String(e), 'error')
                      }
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 font-mono text-[10px] text-muted-foreground">
              No key stored for {selected.name} — paste one above
              {selected.envVar ? ` (or set ${selected.envVar})` : ''}.
            </p>
          )}

          {/* Models of this provider */}
          <div className="mt-2.5 border-t border-border/40 pt-2">
            <div className="mb-1 text-[10px] font-medium text-foreground">
              Models{selected.models.length > 0 ? ` (${selected.models.length})` : ''}
            </div>
            {selected.models.length > 0 ? (
              <ul className="space-y-1">
                {selected.models.map((m) => (
                  <li
                    key={m.id}
                    className="flex items-center gap-2 rounded border border-border/40 bg-background/30 px-2 py-1 text-[11px]"
                  >
                    <span className="font-medium text-foreground">{m.label}</span>
                    <span className="font-mono text-[9px] text-muted-foreground">
                      {formatContext(m.context)}
                    </span>
                    <span className="ml-auto font-mono text-[9px] text-emerald-300">
                      {formatPrice(m.inputPrice)}/in
                    </span>
                    <span className="font-mono text-[9px] text-orange-300">
                      {formatPrice(m.outputPrice)}/out
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[10px] text-muted-foreground">
                No curated models for {selected.name} in this build — the full
                list with pricing lives on{' '}
                <button
                  type="button"
                  className="text-orange-300 underline-offset-2 hover:underline"
                  onClick={() => window.open(selected.docUrl, '_blank')}
                >
                  its models.dev page
                </button>
                .
              </p>
            )}
          </div>
        </div>
      ) : (
        <p className="rounded-md border border-dashed border-border p-4 text-center text-[11px] text-muted-foreground">
          {loading ? 'Loading the provider directory…' : 'No providers discovered yet.'}
        </p>
      )}

      {/* All stored keys across providers */}
      {keys.length > 0 && (
        <div className="mt-2 text-[10px] text-muted-foreground">
          {keys.length} key{keys.length === 1 ? '' : 's'} in the vault
          {selected && keys.some((k) => k.provider !== selected.id)
            ? ` — stored for: ${[...new Set(keys.map((k) => k.provider))].join(', ')}`
            : ''}
          .
        </div>
      )}
      <CustomProvidersBlock />
    </SectionShell>
  )
}
