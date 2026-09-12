'use client'

// P56.2/P56.3/P56.4/P56.5/P56.6/P56.7 — Settings → Providers / BYOK.
//
// One honest screen per provider, built entirely over the live catalog IPC
// (`catalog_cmds.rs`). Facts the Rust side owns and this file never invents:
//   * which providers exist            → `catalog_providers`
//   * whether a key is configured      → the row's `keyConfigured` fact
//   * whether an endpoint answers       → `provider_probe` (read-only)
//   * the model table + pricing         → `catalog_provider_models`
// Nothing here ever sees a secret: a pasted key goes in as an argument and only
// a probe status comes back.

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Copy,
  ExternalLink,
  KeyRound,
  Loader2,
  Package,
  Plus,
  RefreshCw,
  Search,
  Server,
  ShieldCheck,
  Trash2,
  X,
  Zap,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/lib/store'
import { invoke } from '@/lib/tauri'
import { providerModels } from '@/lib/providers'
import {
  catalogProviderModels,
  catalogProviders,
  catalogRefresh,
  catalogSetInterval,
  configuredProviders,
  formatPerM,
  providerNimProfile,
  providerProfileRemove,
  providerProfileUpsert,
  providerProbe,
  previewCatalogRows,
  searchProviders,
  toProfilePayload,
  type CatalogModel,
  type CatalogProviderRow,
  type CatalogStatus,
  type VaultKeyRow,
} from '@/lib/providers'
import { Row, SectionShell } from './settings-shared'

const INTERVALS = [1, 2, 4, 6, 12, 24]

function fmtCount(n: number | null | undefined): string {
  if (n === null || n === undefined || n <= 0) return '—'
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n)
}

function fmtWhen(ms: number): string {
  if (!ms) return 'never'
  const mins = Math.max(0, Math.round((Date.now() - ms) / 60_000))
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 48) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

/** P56.1 — the refresh job's strip: source, counts, staleness, cadence. */
function CatalogStatusBar({
  status,
  live,
  busy,
  onRefresh,
  onInterval,
  onClear,
}: {
  status: CatalogStatus | null
  live: boolean
  busy: boolean
  onRefresh: () => void
  onInterval: (hours: number) => void
  onClear: () => void
}) {
  if (!live || !status) {
    return (
      <p className="rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1.5 text-[10px] text-amber-200/90">
        Preview mode — the live models.dev catalog needs the Tauri shell. Rows
        below are common-provider hints, never a claim about this machine.
      </p>
    )
  }
  const stale = status.stale || !status.hasSnapshot
  return (
    <div className="rounded-md border border-border/60 bg-background/30 p-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <Server className="h-3 w-3" />
          {status.source}
        </span>
        <span>
          {fmtCount(status.providers)} providers · {fmtCount(status.models)} models
        </span>
        <span>fetched {fmtWhen(status.fetchedAt)}</span>
        {stale ? (
          <Badge className="bg-amber-500/15 text-[9px] text-amber-300">
            {status.hasSnapshot ? 'stale' : 'no snapshot'}
          </Badge>
        ) : (
          <Badge className="bg-emerald-500/15 text-[9px] text-emerald-300">
            <Check className="h-2.5 w-2.5" /> current
          </Badge>
        )}
        {status.lastFailed && (
          <Badge className="bg-red-500/15 text-[9px] text-red-300">
            <AlertTriangle className="h-2.5 w-2.5" /> last refresh failed
          </Badge>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <label className="flex items-center gap-1">
            refresh
            <select
              value={status.intervalHours}
              onChange={(e) => onInterval(Number(e.target.value))}
              className="h-6 rounded border border-border bg-zinc-950 px-1 text-[10px] text-foreground"
              aria-label="Catalog refresh interval"
            >
              {INTERVALS.map((h) => (
                <option key={h} value={h}>
                  {h}h
                </option>
              ))}
            </select>
          </label>
          <Button
            size="sm"
            variant="outline"
            className="h-6 px-2 text-[10px]"
            disabled={busy}
            onClick={onRefresh}
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            Refresh
          </Button>
          {status.hasSnapshot && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[10px] text-muted-foreground"
              onClick={onClear}
              title="Drop the cached snapshot (settings are kept)"
            >
              Clear cache
            </Button>
          )}
        </div>
      </div>
      {status.lastDecision && (
        <p className="mt-1 truncate font-mono text-[9px] text-muted-foreground/70">
          {status.lastDecision}
        </p>
      )}
    </div>
  )
}

function SourceBadge({ row }: { row: CatalogProviderRow }) {
  const tone =
    row.source === 'overlay'
      ? 'bg-orange-500/15 text-orange-300'
      : row.profileSource
        ? 'bg-sky-500/15 text-sky-300'
        : row.source === 'preview'
          ? 'bg-zinc-500/15 text-zinc-400'
          : 'bg-zinc-500/10 text-muted-foreground'
  const label = row.profileSource ? `profile:${row.profileSource}` : row.source
  return (
    <Badge className={cn('font-mono text-[9px]', tone)}>{label}</Badge>
  )
}

function ProviderRowButton({
  row,
  active,
  onSelect,
}: {
  row: CatalogProviderRow
  active: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left transition-colors',
        active
          ? 'border-orange-500/50 bg-orange-500/10'
          : 'border-border/50 bg-background/30 hover:border-border hover:bg-background/60',
      )}
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded bg-white/5">
        {row.logoUrl ? (
          <img
            src={row.logoUrl}
            alt=""
            aria-hidden
            className="h-3.5 w-3.5 object-contain"
            loading="lazy"
            onError={(e) => {
              ;(e.currentTarget as HTMLImageElement).style.display = 'none'
            }}
          />
        ) : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-xs font-medium text-foreground">{row.name}</span>
          <span className="truncate font-mono text-[9px] text-muted-foreground">{row.id}</span>
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-1">
          {row.keyless ? (
            <Badge className="bg-emerald-500/15 text-[9px] text-emerald-300">keyless</Badge>
          ) : row.keyConfigured ? (
            <Badge className="bg-emerald-500/15 text-[9px] text-emerald-300">
              <KeyRound className="h-2.5 w-2.5" /> key
            </Badge>
          ) : (
            <Badge className="bg-zinc-500/15 text-[9px] text-zinc-400">no key</Badge>
          )}
          {row.verifiedAt && (
            <Badge className="bg-sky-500/15 text-[9px] text-sky-300">
              <ShieldCheck className="h-2.5 w-2.5" /> verified
            </Badge>
          )}
          {(row.env ?? []).slice(0, 1).map((e) => (
            <span key={e} className="font-mono text-[9px] text-muted-foreground/70">
              {e}
            </span>
          ))}
          {row.modelCount ? (
            <span className="font-mono text-[9px] text-muted-foreground/70">
              {fmtCount(row.modelCount)} models
            </span>
          ) : null}
          <SourceBadge row={row} />
        </span>
      </span>
      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
    </button>
  )
}

/** P56.7 — the models.dev model table (searchable, with per-1M pricing). */
function ModelTable({
  row,
  models,
  profileModels,
  live,
  busy,
}: {
  row: CatalogProviderRow
  models: CatalogModel[]
  profileModels: CatalogModel[]
  live: boolean
  busy: boolean
}) {
  const [q, setQ] = useState('')
  const setSelectedModel = useAppStore((s) => s.setSelectedModel)
  const selectedModelId = useAppStore((s) => s.selectedModelId)
  const notify = useAppStore((s) => s.notify)

  const all = useMemo(() => [...profileModels, ...models], [profileModels, models])
  const routable = useMemo(() => providerModels(row.id), [row.id])

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase()
    if (!n) return all
    return all.filter(
      (m) =>
        m.id.toLowerCase().includes(n) ||
        (m.name ?? '').toLowerCase().includes(n) ||
        (m.family ?? '').toLowerCase().includes(n),
    )
  }, [all, q])

  if (busy) {
    return (
      <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> loading the model table…
      </p>
    )
  }

  if (all.length === 0) {
    return (
      <p className="text-[10px] text-muted-foreground">
        {live
          ? `The catalog carries no model rows for ${row.name}.`
          : 'No catalog snapshot stored yet — run a refresh to load the model table.'}
      </p>
    )
  }

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <Select
          value={routable.some((m) => m.id === selectedModelId) ? selectedModelId : ''}
          onValueChange={(id) => {
            setSelectedModel(id)
            notify(`Composer now routes to ${id}`)
          }}
        >
          <SelectTrigger className="h-7 w-56 text-[10px]">
            <SelectValue placeholder="Default model (composer)" />
          </SelectTrigger>
          <SelectContent>
            {routable.length === 0 ? (
              <SelectItem value="__none" disabled>
                no routable models for this provider
              </SelectItem>
            ) : (
              routable.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.label}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
        <div className="relative min-w-[140px] flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
          <input
            className="h-7 w-full rounded border border-border bg-zinc-950 pl-7 pr-2 font-mono text-[10px]"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Search ${all.length} models…`}
            aria-label="Search models"
          />
        </div>
        <span className="font-mono text-[9px] text-muted-foreground">
          {filtered.length}/{all.length}
        </span>
      </div>

      <div className="max-h-72 overflow-auto rounded-md border border-border/50">
        <table className="w-full border-collapse text-[10px]">
          <thead className="sticky top-0 bg-background/95 backdrop-blur">
            <tr className="text-left text-[9px] uppercase tracking-wide text-muted-foreground">
              <th className="px-2 py-1 font-medium">model</th>
              <th className="px-2 py-1 font-medium">id</th>
              <th className="px-2 py-1 text-right font-medium">context</th>
              <th className="px-2 py-1 text-right font-medium">output</th>
              <th className="px-2 py-1 text-right font-medium">$/1M in</th>
              <th className="px-2 py-1 text-right font-medium">$/1M out</th>
              <th className="px-2 py-1 font-medium">flags</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((m) => (
              <tr key={m.id} className="border-t border-border/30">
                <td className="max-w-[180px] truncate px-2 py-1 text-foreground/90">
                  {m.name || m.id}
                </td>
                <td className="max-w-[220px] truncate px-2 py-1 font-mono text-muted-foreground">
                  {m.id}
                </td>
                <td className="px-2 py-1 text-right font-mono text-muted-foreground">
                  {fmtCount(m.context)}
                </td>
                <td className="px-2 py-1 text-right font-mono text-muted-foreground">
                  {fmtCount(m.output)}
                </td>
                <td className="px-2 py-1 text-right font-mono text-emerald-300/90">
                  {formatPerM(m.priceInput, m.free)}
                </td>
                <td className="px-2 py-1 text-right font-mono text-orange-300/90">
                  {formatPerM(m.priceOutput, m.free)}
                </td>
                <td className="px-2 py-1">
                  <span className="flex flex-wrap gap-1">
                    {m.reasoning && (
                      <span className="rounded bg-violet-500/15 px-1 text-[9px] text-violet-300">
                        reasoning
                      </span>
                    )}
                    {m.toolCall && (
                      <span className="rounded bg-sky-500/15 px-1 text-[9px] text-sky-300">
                        tools
                      </span>
                    )}
                    {m.images && (
                      <span className="rounded bg-emerald-500/15 px-1 text-[9px] text-emerald-300">
                        vision
                      </span>
                    )}
                    {m.fromProfile && (
                      <span className="rounded bg-orange-500/15 px-1 text-[9px] text-orange-300">
                        profile
                      </span>
                    )}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtered.length === 0 && (
        <p className="text-[10px] text-muted-foreground">
          No model matches “{q}”.
        </p>
      )}
    </div>
  )
}

/** P56.3 — the activate screen: header + key bars + probe tick + model table. */
function ActivatePanel({
  row,
  keys,
  live,
  onClose,
  onChanged,
}: {
  row: CatalogProviderRow
  keys: VaultKeyRow[]
  live: boolean
  onClose: () => void
  onChanged: () => Promise<void>
}) {
  const notify = useAppStore((s) => s.notify)
  const [baseUrl, setBaseUrl] = useState(row.baseUrl ?? '')
  const [format, setFormat] = useState(row.format ?? 'openai-compatible')
  const [keyId, setKeyId] = useState('default')
  const [secret, setSecret] = useState('')
  const [busy, setBusy] = useState(false)
  const [probe, setProbe] = useState<{
    ok: boolean
    status: number
    message: string
    models: number
    url?: string
  } | null>(null)
  const [models, setModels] = useState<CatalogModel[]>([])
  const [profileModels, setProfileModels] = useState<CatalogModel[]>([])
  const [loadingModels, setLoadingModels] = useState(true)

  const rowKeys = keys.filter((k) => k.provider === row.id)

  useEffect(() => {
    let cancelled = false
    setLoadingModels(true)
    void catalogProviderModels(row.id)
      .then((r) => {
        if (cancelled) return
        setModels(r.models)
        setProfileModels(r.profileModels)
      })
      .finally(() => {
        if (!cancelled) setLoadingModels(false)
      })
    return () => {
      cancelled = true
    }
  }, [row.id])

  /** P56.3 — probe first, persist only on a green tick. */
  const verifyAndSave = useCallback(async () => {
    setBusy(true)
    try {
      const p = await providerProbe(row.id, secret.trim() || undefined)
      setProbe(p)
      if (!p.ok) {
        notify(`${row.name}: ${p.message}`, 'error')
        return
      }
      await providerProfileUpsert({
        id: row.id,
        name: row.name,
        format,
        baseUrl: baseUrl.trim(),
        keyRequired: !row.keyless,
        verifiedAt: new Date().toISOString(),
        verifiedModels: p.models,
        sessionHeaders: row.sessionHeaders ?? false,
      })
      if (secret.trim()) {
        await invoke('vault_key_add', {
          provider: row.id,
          keyId: keyId.trim() || 'default',
          value: secret,
          baseUrl: baseUrl.trim() || null,
          format,
          verifiedAt: new Date().toISOString(),
          verifiedModels: p.models,
          sessionHeaders: row.sessionHeaders ?? false,
        })
        setSecret('')
        useAppStore.getState().setProviderKeysConfigured(true)
      }
      notify(
        `${row.name}: ${p.models} models visible${secret.trim() ? ' — key verified and stored' : ' — endpoint verified'}`,
      )
      await onChanged()
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), 'error')
    } finally {
      setBusy(false)
    }
  }, [row.id, row.name, row.keyless, row.sessionHeaders, secret, keyId, baseUrl, format, notify, onChanged])

  const removeKey = async (id: string) => {
    try {
      await invoke('vault_key_remove', { provider: row.id, keyId: id })
      notify(`Removed ${row.id}/${id}`)
      await onChanged()
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), 'error')
    }
  }

  const useNim = async () => {
    try {
      const p = (await providerNimProfile(baseUrl.trim() || undefined)) as {
        base_url?: string
      }
      if (p?.base_url) setBaseUrl(p.base_url)
      notify(`NVIDIA NIM endpoint set to ${p?.base_url ?? baseUrl}`)
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), 'error')
    }
  }

  return (
    <div className="rounded-lg border border-border/60 bg-background/40 p-3">
      {/* header — name / package / API / docs */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-sm font-semibold text-foreground">{row.name}</span>
        <Badge variant="secondary" className="font-mono text-[9px]">
          {row.id}
        </Badge>
        <SourceBadge row={row} />
        {row.keyless ? (
          <Badge className="bg-emerald-500/15 text-[9px] text-emerald-300">keyless</Badge>
        ) : row.keyConfigured ? (
          <Badge className="bg-emerald-500/15 text-[9px] text-emerald-300">
            <Check className="h-2.5 w-2.5" /> key added
          </Badge>
        ) : (
          <Badge className="bg-zinc-500/15 text-[9px] text-zinc-400">no key</Badge>
        )}
        {row.verifiedAt && (
          <Badge className="bg-sky-500/15 text-[9px] text-sky-300">
            <ShieldCheck className="h-2.5 w-2.5" /> verified {row.verifiedAt.slice(0, 10)}
          </Badge>
        )}
        <div className="ml-auto flex items-center gap-1">
          {row.npm && (
            <button
              type="button"
              className="flex items-center gap-1 rounded border border-border/60 px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground hover:text-foreground"
              onClick={() =>
                window.open(`https://www.npmjs.com/package/${row.npm}`, '_blank', 'noopener')
              }
              title="SDK package this provider's models use"
            >
              <Package className="h-2.5 w-2.5" />
              {row.npm}
            </button>
          )}
          {row.docUrl && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[10px]"
              onClick={() => window.open(row.docUrl ?? '', '_blank', 'noopener')}
            >
              <ExternalLink className="h-3 w-3" /> docs
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-[10px]"
            onClick={() => window.open(`https://models.dev/providers/${row.id}`, '_blank', 'noopener')}
          >
            <ExternalLink className="h-3 w-3" /> models.dev
          </Button>
          <Button size="sm" variant="ghost" className="h-6 px-1.5" onClick={onClose} aria-label="Close">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* endpoint facts */}
      <div className="mt-2 grid gap-1.5 font-mono text-[10px] text-muted-foreground sm:grid-cols-2">
        <div className="flex items-center gap-1.5">
          <span className="shrink-0 text-muted-foreground/70">api</span>
          <span className="truncate text-foreground/80">{row.api || row.baseUrl || '—'}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="shrink-0 text-muted-foreground/70">env</span>
          <span className="truncate text-foreground/80">
            {(row.env ?? []).join(', ') || (row.keyless ? 'none (keyless)' : '—')}
          </span>
        </div>
        {(row.aliases ?? []).length > 0 && (
          <div className="flex items-center gap-1.5 sm:col-span-2">
            <span className="shrink-0 text-muted-foreground/70">aliases</span>
            <span className="truncate text-foreground/80">{(row.aliases ?? []).join(', ')}</span>
          </div>
        )}
      </div>

      {/* endpoint override (base URL + wire format) */}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-border/40 pt-2.5">
        <Input
          className="h-7 min-w-[200px] flex-1 font-mono text-[10px]"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://api.example.com/v1 (stop at the version root)"
          aria-label="Base URL"
        />
        <Select value={format} onValueChange={setFormat}>
          <SelectTrigger className="h-7 w-44 text-[10px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="openai-compatible">OpenAI compatible</SelectItem>
            <SelectItem value="openai-responses">OpenAI responses</SelectItem>
            <SelectItem value="anthropic">Anthropic messages</SelectItem>
          </SelectContent>
        </Select>
        {row.id === 'nvidia' && (
          <Button size="sm" variant="outline" className="h-7 px-2 text-[10px]" onClick={() => void useNim()}>
            <Zap className="h-3 w-3" /> NIM localhost
          </Button>
        )}
      </div>

      {/* key bars */}
      {!row.keyless && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <input
            className="h-7 w-24 rounded border border-border bg-zinc-950 px-2 font-mono text-[10px]"
            value={keyId}
            onChange={(e) => setKeyId(e.target.value)}
            placeholder="key id"
            aria-label="Key id"
          />
          <input
            className="h-7 min-w-[180px] flex-1 rounded border border-border bg-zinc-950 px-2 font-mono text-[10px]"
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="paste the API key — probed, then stored in the vault"
            aria-label="API key value"
          />
        </div>
      )}

      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <Button
          size="sm"
          className={cn(
            'h-7',
            probe?.ok ? 'bg-emerald-600 text-white hover:bg-emerald-500' : 'bg-orange-500 text-black hover:bg-orange-400',
          )}
          disabled={busy}
          onClick={() => void verifyAndSave()}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : probe?.ok ? <Check className="h-3.5 w-3.5" /> : <KeyRound className="h-3.5 w-3.5" />}
          {row.keyless ? 'Verify endpoint' : secret.trim() ? 'Verify & store key' : 'Verify (no key)'}
        </Button>
        {probe && (
          <span
            className={cn(
              'font-mono text-[10px]',
              probe.ok ? 'text-emerald-300' : 'text-red-300',
            )}
          >
            {probe.ok ? '✓' : '✕'} {probe.status || '—'} · {probe.message}
            {probe.url ? ` · ${probe.url}` : ''}
          </span>
        )}
      </div>

      {/* stored keys */}
      {rowKeys.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {rowKeys.map((k) => (
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
              <span className="ml-auto font-mono text-[9px] text-muted-foreground">{k.status}</span>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-[10px] text-red-400 hover:bg-red-500/10"
                onClick={() => void removeKey(k.keyId)}
                aria-label={`Remove ${k.provider}/${k.keyId}`}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </li>
          ))}
        </ul>
      ) : !row.keyless ? (
        <p className="mt-2 font-mono text-[10px] text-muted-foreground">
          No key stored for {row.name}
          {(row.env ?? []).length > 0 ? ` (or set ${row.env?.[0]} in the environment)` : ''}.
        </p>
      ) : null}

      {/* model table */}
      <div className="mt-2.5 border-t border-border/40 pt-2">
        <div className="mb-1 flex items-center gap-2 text-[10px] font-medium text-foreground">
          Models
          {row.modelCount ? (
            <span className="font-mono text-[9px] text-muted-foreground">
              {row.modelCount} in catalog
            </span>
          ) : null}
        </div>
        <ModelTable
          row={row}
          models={models}
          profileModels={profileModels}
          live={live}
          busy={loadingModels}
        />
      </div>

      {row.profileSource === 'userconfig' && (
        <div className="mt-2 flex items-center gap-1.5 border-t border-border/40 pt-2">
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-[10px] text-red-400 hover:bg-red-500/10"
            onClick={async () => {
              await providerProfileRemove(row.id)
              notify(`Removed profile ${row.id}`)
              await onChanged()
            }}
          >
            <Trash2 className="h-3 w-3" /> Remove profile
          </Button>
        </div>
      )}
    </div>
  )
}

/** P56.4 — the OpenCode-shaped custom inference form. */
function CustomInferenceForm({ onSaved }: { onSaved: () => Promise<void> }) {
  const notify = useAppStore((s) => s.notify)
  const [name, setName] = useState('')
  const [id, setId] = useState('')
  const [format, setFormat] = useState('openai-compatible')
  const [baseUrl, setBaseUrl] = useState('')
  const [keyRequired, setKeyRequired] = useState(true)
  const [secret, setSecret] = useState('')
  const [headers, setHeaders] = useState('')
  const [body, setBody] = useState('')
  const [temperature, setTemperature] = useState('')
  const [models, setModels] = useState('')
  const [busy, setBusy] = useState(false)

  const save = async () => {
    const { profile, errors } = toProfilePayload({
      id,
      name,
      format,
      baseUrl,
      keyRequired,
      headers,
      body,
      temperature,
      models,
    })
    if (errors.length > 0) {
      notify(errors[0], 'error')
      return
    }
    setBusy(true)
    try {
      await providerProfileUpsert(profile)
      if (keyRequired && secret.trim()) {
        await invoke('vault_key_add', {
          provider: String(profile.id),
          keyId: 'default',
          value: secret,
          baseUrl: String(profile.baseUrl),
          format,
          sessionHeaders: false,
        })
        useAppStore.getState().setProviderKeysConfigured(true)
      }
      notify(`Saved custom provider “${profile.id}”`)
      setName('')
      setId('')
      setBaseUrl('')
      setSecret('')
      setHeaders('')
      setBody('')
      setTemperature('')
      setModels('')
      await onSaved()
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2 rounded-md border border-border/50 bg-background/20 p-3">
      <div className="flex items-center gap-1.5 text-xs font-medium">
        <Plus className="h-3.5 w-3.5 text-orange-400" />
        Custom inference provider
      </div>
      <p className="text-[10px] text-muted-foreground">
        Endpoint + shape only. The key (when required) goes to the vault; every
        other value lands in the provider profile file and is resolved by the
        broker on the next turn.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name (e.g. My Gateway)"
          className="h-8 text-xs"
        />
        <Input
          value={id}
          onChange={(e) => setId(e.target.value)}
          placeholder="id (auto from name)"
          className="h-8 font-mono text-xs"
        />
        <Input
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://api.example.com/v1"
          className="h-8 font-mono text-xs"
        />
        <Select value={format} onValueChange={setFormat}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="openai-compatible">OpenAI compatible</SelectItem>
            <SelectItem value="openai-responses">OpenAI responses</SelectItem>
            <SelectItem value="anthropic">Anthropic messages</SelectItem>
          </SelectContent>
        </Select>
        <Input
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          type="password"
          placeholder={keyRequired ? 'API key (vault)' : 'API key (optional)'}
          className="h-8 font-mono text-xs"
        />
        <Input
          value={temperature}
          onChange={(e) => setTemperature(e.target.value)}
          placeholder="temperature (optional, 0–2)"
          className="h-8 font-mono text-xs"
        />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Textarea
          value={headers}
          onChange={(e) => setHeaders(e.target.value)}
          placeholder={'Headers\nX-Team: eng\nX-Trace: on'}
          className="min-h-[72px] font-mono text-[10px]"
        />
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={'Body merge (JSON object)\n{"top_p": 0.9}'}
          className="min-h-[72px] font-mono text-[10px]"
        />
      </div>
      <Textarea
        value={models}
        onChange={(e) => setModels(e.target.value)}
        placeholder={'Models (one per line): id | name | context | output\nmy-model | My Model | 128000 | 8192'}
        className="min-h-[64px] font-mono text-[10px]"
      />
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <Switch checked={keyRequired} onCheckedChange={setKeyRequired} />
          key required
        </label>
        <Button
          size="sm"
          className="ml-auto h-7 bg-orange-500 text-black hover:bg-orange-400"
          disabled={busy}
          onClick={() => void save()}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Save provider
        </Button>
      </div>
    </div>
  )
}

export default function ProvidersSection() {
  const notify = useAppStore((s) => s.notify)
  const [rows, setRows] = useState<CatalogProviderRow[]>([])
  const [status, setStatus] = useState<CatalogStatus | null>(null)
  const [keys, setKeys] = useState<VaultKeyRow[]>([])
  const [live, setLive] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [showCustom, setShowCustom] = useState(false)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const cat = await catalogProviders()
      if (cat.live && cat.providers.length > 0) {
        setRows(cat.providers)
        setStatus(cat.status)
        setLive(true)
      } else {
        setRows(previewCatalogRows())
        setStatus(null)
        setLive(false)
      }
      const kr = await invoke<{ keys?: VaultKeyRow[] }>('vault_keys_list', {}).catch(
        (): { keys?: VaultKeyRow[] } => ({ keys: [] }),
      )
      const k = kr.keys ?? []
      setKeys(k)
      // P50.4.1 — keep the live provider-configured fact in sync with the vault.
      useAppStore.getState().setProviderKeysConfigured(k.length > 0)
    } catch {
      setRows((prev) => (prev.length > 0 ? prev : previewCatalogRows()))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const filtered = useMemo(() => searchProviders(rows, query), [rows, query])
  const mine = useMemo(() => configuredProviders(filtered), [filtered])
  const rest = useMemo(() => filtered.filter((r) => !mine.includes(r)), [filtered, mine])
  const active = activeId ? rows.find((r) => r.id === activeId) ?? null : null

  const doRefresh = async (force: boolean) => {
    setBusy(true)
    try {
      const r = await catalogRefresh(force)
      notify(r.summary)
      await reload()
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), 'error')
    } finally {
      setBusy(false)
    }
  }

  const onInterval = async (hours: number) => {
    try {
      const r = await catalogSetInterval(hours)
      notify(
        r.clamped
          ? `Refresh cadence clamped to ${r.intervalHours}h (1–24h allowed)`
          : `Refreshing every ${r.intervalHours}h`,
      )
      await reload()
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), 'error')
    }
  }

  const onClear = async () => {
    try {
      await invoke('catalog_clear', {})
      notify('Catalog snapshot cleared')
      await reload()
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), 'error')
    }
  }

  return (
    <SectionShell
      title="Providers / BYOK"
      desc="The whole models.dev catalog plus the shipped OpenCode Zen/Go/Free and NVIDIA NIM rows. Add a key or endpoint, probe it, and the broker resolves the route from the profile on the next turn. Keys live in the local SQLCipher vault — only opaque handles ever reach this screen."
      action={
        <Button
          size="sm"
          variant="outline"
          className="h-8"
          disabled={loading || busy}
          onClick={() => void reload()}
        >
          {loading ? 'Loading…' : `Reload${live ? ` (${rows.length})` : ''}`}
        </Button>
      }
    >
      <CatalogStatusBar
        status={status}
        live={live}
        busy={busy}
        onRefresh={() => void doRefresh(true)}
        onInterval={(h) => void onInterval(h)}
        onClear={() => void onClear()}
      />

      <div className="flex flex-wrap items-center gap-1.5">
        <div className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            className="h-8 w-full rounded border border-border bg-zinc-950 pl-7 pr-2 text-xs"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${rows.length || '…'} providers (id, name, alias, env, model)…`}
            aria-label="Search providers"
          />
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-8"
          onClick={() => setShowCustom((v) => !v)}
        >
          <Plus className="h-3.5 w-3.5" />
          Custom
        </Button>
      </div>

      {query && filtered.length === 0 && (
        <p className="text-[11px] text-muted-foreground">
          No provider matches “{query}” — the full list lives on{' '}
          <button
            type="button"
            className="text-orange-300 underline-offset-2 hover:underline"
            onClick={() => window.open('https://models.dev/providers/', '_blank', 'noopener')}
          >
            models.dev
          </button>
          . You can still add it as a custom provider.
        </p>
      )}

      {active && (
        <ActivatePanel
          key={active.id}
          row={active}
          keys={keys}
          live={live}
          onClose={() => setActiveId(null)}
          onChanged={reload}
        />
      )}

      {mine.length > 0 && (
        <div className="space-y-1">
          <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Configured ({mine.length})
          </div>
          {mine.map((r) => (
            <ProviderRowButton
              key={r.id}
              row={r}
              active={activeId === r.id}
              onSelect={() => setActiveId(activeId === r.id ? null : r.id)}
            />
          ))}
        </div>
      )}

      <div className="space-y-1">
        <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Catalog ({rest.length})
        </div>
        {rest.slice(0, 400).map((r) => (
          <ProviderRowButton
            key={r.id}
            row={r}
            active={activeId === r.id}
            onSelect={() => setActiveId(activeId === r.id ? null : r.id)}
          />
        ))}
        {rest.length > 400 && (
          <p className="text-[10px] text-muted-foreground">
            Showing the first 400 of {rest.length} — narrow the search to reach
            the rest.
          </p>
        )}
      </div>

      {showCustom && (
        <CustomInferenceForm
          onSaved={async () => {
            setShowCustom(false)
            await reload()
          }}
        />
      )}

      {keys.length > 0 && (
        <div className="text-[10px] text-muted-foreground">
          {keys.length} key{keys.length === 1 ? '' : 's'} in the vault
          {` — stored for: ${[...new Set(keys.map((k) => k.provider))].join(', ')}`}
        </div>
      )}

      <p className="text-[10px] text-muted-foreground/70">
        <Copy className="mr-1 inline h-3 w-3" />
        Only env-var <em>names</em> are ever copied from this screen — never a
        secret value.
      </p>
      <Row label="Remote catalog">
        <span className="font-mono text-[10px] text-muted-foreground">
          {live ? status?.source : 'preview (shell required)'}
        </span>
      </Row>
    </SectionShell>
  )
}
