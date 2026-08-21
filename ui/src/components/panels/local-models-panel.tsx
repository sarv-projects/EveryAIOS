'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Brain,
  Cpu,
  Download,
  Eye,
  Gauge,
  HardDrive,
  Loader2,
  Search,
  Wrench,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/lib/store'
import {
  cpuCores,
  formatBytes,
  formatDownloads,
  getHardware,
  getLocalPrefs,
  hubCaps,
  listHubFiles,
  listLocalModels,
  quantFromPath,
  ramBytes,
  relativeUpdated,
  searchHub,
  setLocalPrefs,
  type HardwareProfile,
  type HubFile,
  type HubModel,
  type LocalModelRow,
  type LocalPrefs,
} from '@/lib/local-models'

type Tab = 'discover' | 'mine' | 'hardware'
type HubSort = 'downloads' | 'likes' | 'lastModified'

function CapChip({
  on,
  label,
  icon,
}: {
  on: boolean
  label: string
  icon: React.ReactNode
}) {
  if (!on) return null
  return (
    <span className="inline-flex items-center gap-0.5 rounded border border-border/50 bg-background/50 px-1 py-0.5 font-mono text-[8px] text-muted-foreground">
      {icon}
      {label}
    </span>
  )
}

export default function LocalModelsPanel() {
  const [tab, setTab] = useState<Tab>('discover')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<HubSort>('downloads')
  const [catalog, setCatalog] = useState<HubModel[]>([])
  const [selected, setSelected] = useState<HubModel | null>(null)
  const [files, setFiles] = useState<HubFile[]>([])
  const [hw, setHw] = useState<HardwareProfile | null>(null)
  const [installed, setInstalled] = useState<LocalModelRow[]>([])
  const [loading, setLoading] = useState(false)
  const [hubError, setHubError] = useState<string | null>(null)
  const [prefs, setPrefs] = useState<LocalPrefs>(getLocalPrefs)
  const notify = useAppStore((s) => s.notify)
  const setSelectedAgent = useAppStore((s) => s.setSelectedAgent)
  const setSelectedModel = useAppStore((s) => s.setSelectedModel)
  const setLocalRuntime = useAppStore((s) => s.setLocalRuntime)

  useEffect(() => {
    void getHardware().then((h) => h && setHw(h))
    void listLocalModels()
      .then((r) => {
        setInstalled(r.models ?? [])
        if (r.hardware) setHw(r.hardware)
      })
      .catch(() => setInstalled([]))
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setHubError(null)
    const t = setTimeout(() => {
      void searchHub(query, sort)
        .then((rows) => {
          if (cancelled) return
          setCatalog(rows)
          setSelected((cur) => {
            if (cur && rows.some((r) => r.id === cur.id)) return cur
            return rows[0] ?? null
          })
        })
        .catch((e) => {
          if (cancelled) return
          setCatalog([])
          setSelected(null)
          setHubError(e instanceof Error ? e.message : 'Hub search failed')
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }, query ? 280 : 0)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [query, sort])

  useEffect(() => {
    if (!selected) {
      setFiles([])
      return
    }
    let cancelled = false
    void listHubFiles(selected.id)
      .then((f) => {
        if (!cancelled) setFiles(f)
      })
      .catch(() => {
        if (!cancelled) setFiles([])
      })
    return () => {
      cancelled = true
    }
  }, [selected])

  const ram = ramBytes(hw)
  const gguf = files.filter((f) => f.path.toLowerCase().endsWith('.gguf'))
  const chosen = useMemo(() => {
    const q4 = gguf.find((f) => /Q4_K_M/i.test(f.path))
    return q4 ?? gguf[0] ?? files[0] ?? null
  }, [gguf, files])

  const firstCard = catalog[0] ?? null
  const storeHint = installed.reduce((n, r) => n + (r.sizeBytes || 0), 0)

  const savePrefs = (next: LocalPrefs) => {
    setPrefs(next)
    setLocalPrefs(next)
  }

  return (
    <div className="flex h-full min-h-[520px] flex-col">
      <div className="mb-3 flex items-center gap-1 rounded-md border border-border/60 bg-background/40 p-0.5">
        {(
          [
            ['discover', 'Discover'],
            ['mine', 'My models'],
            ['hardware', 'Hardware'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              'flex-1 rounded px-2 py-1 text-[11px] font-medium',
              tab === id
                ? 'bg-orange-500/15 text-orange-300'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'discover' && (
        <div className="flex min-h-0 flex-1 flex-col">
          {installed.length === 0 && firstCard && (
            <div className="mb-3 rounded-lg border border-orange-500/30 bg-orange-500/5 p-3">
              <div className="text-[12px] font-semibold text-foreground">Your first model</div>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Live from Hugging Face Hub (current Hub sort). Nothing is named in source — this
                card is whatever the Hub returns first. Download is not wired yet (P27).
              </p>
              <div className="mt-2 flex items-center justify-between gap-2 rounded-md border border-border/50 bg-background/50 px-2 py-1.5">
                <div className="min-w-0">
                  <div className="truncate text-[11px] font-medium">{firstCard.id}</div>
                  <div className="font-mono text-[10px] text-muted-foreground">
                    ↓ {formatDownloads(firstCard.downloads)} · ★ {firstCard.likes}
                  </div>
                </div>
                <Button
                  size="sm"
                  className="h-7 shrink-0 bg-orange-500 px-2 text-[10px] text-white hover:bg-orange-600"
                  onClick={() =>
                    notify('Download is not wired — P27 HF downloader is still open.')
                  }
                >
                  <Download className="mr-1 h-3 w-3" />
                  Download
                </Button>
              </div>
            </div>
          )}

          <div className="mb-2 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search Hugging Face (GGUF) by name or author"
                className="h-8 pl-7 font-mono text-[11px]"
              />
            </div>
            {(
              [
                ['downloads', 'Most downloads'],
                ['likes', 'Most likes'],
                ['lastModified', 'Recently updated'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setSort(id)}
                className={cn(
                  'rounded-md border px-2 py-1 text-[10px]',
                  sort === id
                    ? 'border-orange-500/50 bg-orange-500/10 text-orange-300'
                    : 'border-border text-muted-foreground',
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {hubError && (
            <div className="mb-2 rounded border border-red-500/30 bg-red-500/5 px-2 py-1.5 text-[11px] text-red-300">
              {hubError}
            </div>
          )}

          <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,280px)_1fr] overflow-hidden rounded-lg border border-border/60">
            <div className="scroll-thin max-h-[560px] overflow-y-auto border-r border-border/60">
              {loading && catalog.length === 0 && (
                <div className="flex items-center gap-1.5 p-3 font-mono text-[10px] text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Hugging Face Hub…
                </div>
              )}
              {catalog.map((m) => {
                const active = selected?.id === m.id
                const caps = hubCaps(m)
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setSelected(m)}
                    className={cn(
                      'flex w-full flex-col gap-0.5 border-b border-border/40 px-2.5 py-2 text-left',
                      active ? 'bg-orange-500/10' : 'hover:bg-accent/40',
                    )}
                  >
                    <span className="truncate text-[11px] font-semibold text-foreground">{m.id}</span>
                    <div className="font-mono text-[9px] text-muted-foreground">
                      ↓ {formatDownloads(m.downloads)} · ★ {m.likes}
                      {m.lastModified ? ` · ${relativeUpdated(m.lastModified)}` : ''}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <CapChip on={caps.vision} label="Vision" icon={<Eye className="h-2 w-2" />} />
                      <CapChip on={caps.toolUse} label="Tool use" icon={<Wrench className="h-2 w-2" />} />
                      <CapChip on={caps.reasoning} label="Reasoning" icon={<Brain className="h-2 w-2" />} />
                    </div>
                  </button>
                )
              })}
            </div>

            <div className="scroll-thin max-h-[560px] overflow-y-auto p-3">
              {selected ? (
                <>
                  <div className="text-[13px] font-semibold text-foreground">{selected.id}</div>
                  <div className="mt-0.5 flex flex-wrap gap-2 font-mono text-[10px] text-muted-foreground">
                    <span>↓ {formatDownloads(selected.downloads)}</span>
                    <span>★ {selected.likes}</span>
                    {selected.lastModified && <span>{relativeUpdated(selected.lastModified)}</span>}
                    {selected.pipelineTag && <span>{selected.pipelineTag}</span>}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {hubCaps(selected).vision && (
                      <CapChip on label="Vision" icon={<Eye className="h-2.5 w-2.5" />} />
                    )}
                    {hubCaps(selected).toolUse && (
                      <CapChip on label="Tool use" icon={<Wrench className="h-2.5 w-2.5" />} />
                    )}
                    {hubCaps(selected).reasoning && (
                      <CapChip on label="Reasoning" icon={<Brain className="h-2.5 w-2.5" />} />
                    )}
                    {hubCaps(selected).gguf && (
                      <Badge className="bg-emerald-500/15 px-1 text-[8px] text-emerald-300">GGUF</Badge>
                    )}
                    {hubCaps(selected).mlx && (
                      <Badge className="bg-sky-500/15 px-1 text-[8px] text-sky-300">MLX</Badge>
                    )}
                  </div>
                  <div className="mt-3 text-[11px] font-semibold">Download options</div>
                  <div className="mt-1.5 rounded-md border border-border/60 bg-background/40 p-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 font-mono text-[10px] text-muted-foreground">
                        {chosen
                          ? `${quantFromPath(chosen.path)} · ${formatBytes(chosen.size)} · ${chosen.path}`
                          : 'No GGUF listed on main yet — Hub tree empty or failed.'}
                      </div>
                      <Button
                        size="sm"
                        className="h-7 shrink-0 bg-orange-500 px-2.5 text-[10px] text-white hover:bg-orange-600"
                        onClick={() =>
                          notify('Download is not wired — P27 HF downloader is still open.')
                        }
                      >
                        <Download className="mr-1 h-3 w-3" />
                        Download
                      </Button>
                    </div>
                    {gguf.length > 1 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {gguf.slice(0, 10).map((f) => (
                          <span
                            key={f.path}
                            className="rounded border border-border/50 px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground"
                          >
                            {quantFromPath(f.path)} · {formatBytes(f.size)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="text-[11px] text-muted-foreground">
                  Search the Hub or wait for results. No models are hardcoded.
                </div>
              )}
            </div>
          </div>

          <div className="mt-2 font-mono text-[10px] text-muted-foreground">
            You have {installed.length} local model{installed.length === 1 ? '' : 's'}
            {storeHint > 0 ? `, taking up ${formatBytes(storeHint)}` : ''}.
          </div>
        </div>
      )}

      {tab === 'mine' && (
        <div className="space-y-2">
          {installed.length === 0 && (
            <div className="rounded-lg border border-dashed border-border p-6 text-center text-[12px] text-muted-foreground">
              No installed Ollama/llamafile models on this machine.
              <div className="mt-2">
                <Button
                  size="sm"
                  className="h-7 bg-orange-500 text-[10px] text-white hover:bg-orange-600"
                  onClick={() => setTab('discover')}
                >
                  Open Discover
                </Button>
              </div>
            </div>
          )}
          {installed.map((row) => (
            <button
              key={`${row.runtime}:${row.name}`}
              type="button"
              onClick={() => {
                setSelectedAgent('everyaios-native')
                setSelectedModel(row.name)
                setLocalRuntime(row.runtime, row.contextWindow)
                notify(`Using ${row.name} (${row.runtime})`)
              }}
              className="flex w-full items-center justify-between rounded-md border border-border/60 bg-background/40 px-3 py-2 text-left hover:border-orange-500/40"
            >
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[12px] font-medium">{row.name}</span>
                  <Badge
                    className={cn(
                      'px-1 text-[8px]',
                      row.fits ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300',
                    )}
                  >
                    {row.fits ? 'fits' : 'too big'}
                  </Badge>
                  {row.warnCtx && (
                    <Badge className="bg-amber-500/20 px-1 text-[8px] text-amber-300">&lt;15K ctx</Badge>
                  )}
                </div>
                <div className="font-mono text-[10px] text-muted-foreground">
                  {row.runtime} · {formatBytes(row.sizeBytes)} · ctx {row.contextWindow.toLocaleString()}
                </div>
              </div>
              <Cpu className="h-3.5 w-3.5 text-orange-400" />
            </button>
          ))}
        </div>
      )}

      {tab === 'hardware' && (
        <div className="space-y-3">
          <div className="rounded-lg border border-border/60 bg-background/40 p-3">
            <div className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold">
              <Cpu className="h-3.5 w-3.5 text-orange-400" />
              CPU
            </div>
            <div className="font-mono text-[11px]">{cpuCores(hw) || '—'} cores</div>
          </div>
          <div className="rounded-lg border border-border/60 bg-background/40 p-3">
            <div className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold">
              <Gauge className="h-3.5 w-3.5 text-orange-400" />
              Memory
            </div>
            <div className="font-mono text-[11px]">RAM {formatBytes(ram)}</div>
            <div className="mt-1 font-mono text-[10px] text-muted-foreground">
              GPU class: {hw?.gpu ?? '—'}
            </div>
          </div>
          <div className="rounded-lg border border-border/60 bg-background/40 p-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[11px] font-medium">Offload KV cache to GPU memory</div>
                <div className="text-[10px] text-muted-foreground">Stored in this browser only until P27 wires runtime.</div>
              </div>
              <Switch
                checked={prefs.kvOffload}
                onCheckedChange={(v) => savePrefs({ ...prefs, kvOffload: v })}
              />
            </div>
          </div>
          <div className="rounded-lg border border-border/60 bg-background/40 p-3">
            <div className="mb-1 flex items-center gap-1.5 text-[12px] font-semibold">
              <HardDrive className="h-3.5 w-3.5 text-orange-400" />
              Resource monitor
            </div>
            <div className="font-mono text-[11px] text-muted-foreground">
              Live disk/VRAM probes are P27 — not in this UI-only pass.
            </div>
          </div>
          <div className="rounded-lg border border-border/60 bg-background/40 p-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[11px] font-medium">Model loading guardrails</div>
                <div className="text-[10px] text-muted-foreground">
                  UI pref only. Load still uses existing hwfit `disqualify_unfit` on ensure.
                </div>
              </div>
              <Switch
                checked={prefs.guardrails}
                onCheckedChange={(v) => savePrefs({ ...prefs, guardrails: v })}
              />
            </div>
          </div>
          <div className="rounded-lg border border-border/60 bg-background/40 p-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[11px] font-medium">Start local LLM service on login</div>
                <div className="text-[10px] text-muted-foreground">UI pref only — login spawn is P27.</div>
              </div>
              <Switch
                checked={prefs.startOnLogin}
                onCheckedChange={(v) => savePrefs({ ...prefs, startOnLogin: v })}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
