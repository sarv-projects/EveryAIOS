'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Brain,
  CheckCircle2,
  Cpu,
  Download,
  Eye,
  Gauge,
  HardDrive,
  Loader2,
  Pause,
  Play,
  Search,
  Sparkles,
  Trash2,
  Check,
  Wrench,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
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
import {
  bestPick,
  cancelDownload,
  downloadsAvailable,
  estimateFit,
  listDownloads,
  onModelDownloadEvent,
  parseGalleryYaml,
  recommendQuant,
  registryList,
  removeModel,
  serveModel,
  startDownload,
  type GalleryEntry,
  type GalleryIndex,
  type ModelDownloadRow,
  type OrphanPart,
  type RegistryEntry,
} from '@/lib/models-download'
import {
  buildCandidates,
  bytesToGib,
  DEFAULT_QUANT,
  FIT_CTX,
  FIT_CTX_LABEL,
  hostHwClass,
  tierTone,
  type FitEstimate,
} from '@/lib/model-fit'

type Tab = 'discover' | 'mine' | 'gallery' | 'hardware'
type HubSort = 'downloads' | 'likes' | 'lastModified'

/** Clearly-fake sample of the LocalAI-style index subset the native parser
 * accepts — installed-id examples only, never a real weight pin. */
const GALLERY_SAMPLE = `# index.yaml — LocalAI-style gallery subset (P52.2)
# id = gallery@model · files carry path + sha256 pins · backend_override
# merges over the default runtime · preload warms weights at startup.
version: 1
models:
  - id: netlab@example-8b
    backend_override: ollama
    preload: false
    files:
      - path: example-8b-Q4_K_M.gguf
        sha256: 0000000000000000000000000000000000000000000000000000000000000000
      - path: example-8b-Q8_0.gguf
        sha256: 1111111111111111111111111111111111111111111111111111111111111111
  - id: netlab@example-3b
    preload: true
    files:
      - path: example-3b-Q4_K_M.gguf
        sha256: 2222222222222222222222222222222222222222222222222222222222222222
`

/** Traffic light for one fit estimate (P52.1). No estimate → dim dash. */
function FitDot({ est }: { est?: FitEstimate | null }) {
  if (!est) {
    return <span className="inline-block h-1.5 w-1.5 rounded-full bg-border/60" title="Fit estimate unavailable outside the Tauri shell." />
  }
  const tone = tierTone(est.tier)
  const dot =
    tone.key === 'ok'
      ? 'bg-emerald-400'
      : tone.key === 'warn'
        ? 'bg-amber-400'
        : 'bg-red-400'
  const split = `${est.fileGb.toFixed(1)} GiB file + ${(est.kvGb * 1000).toFixed(0)} MB KV ≈ ${est.totalGb.toFixed(2)} GiB total`
  return (
    <span
      className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${dot}`}
      title={`Estimate at ${FIT_CTX_LABEL} ctx — ${split}. ${tone.hint}`}
    />
  )
}

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

function DownloadRow({
  row,
  onCancel,
  onResume,
}: {
  row: ModelDownloadRow
  onCancel: (id: string) => void
  onResume: (repo: string, filename: string) => void
}) {
  const pct =
    row.totalBytes > 0 ? Math.min(100, Math.round((row.doneBytes / row.totalBytes) * 100)) : 0
  return (
    <div className="rounded-md border border-border/60 bg-background/50 px-2 py-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 truncate font-mono text-[10px] text-foreground">
          {row.repo} · {row.filename}
        </div>
        {row.phase === 'downloading' && (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 shrink-0 px-1.5 text-[10px] text-muted-foreground hover:text-red-300"
            onClick={() => onCancel(row.id)}
          >
            <Pause className="mr-1 h-3 w-3" />
            Cancel
          </Button>
        )}
        {(row.phase === 'cancelled' || row.phase === 'error') && (
          <Button
            size="sm"
            className="h-6 shrink-0 bg-orange-500 px-2 text-[10px] text-white hover:bg-orange-600"
            onClick={() => onResume(row.repo, row.filename)}
          >
            <Play className="mr-1 h-3 w-3" />
            Resume
          </Button>
        )}
        {row.phase === 'done' && (
          <span className="flex shrink-0 items-center gap-1 font-mono text-[10px] text-emerald-300">
            <CheckCircle2 className="h-3 w-3" />
            Installed
          </span>
        )}
      </div>
      {row.phase === 'downloading' && (
        <div className="mt-1.5 flex items-center gap-2">
          <Progress value={pct} className="h-1.5" />
          <span className="shrink-0 font-mono text-[9px] text-muted-foreground">
            {pct}% · {formatBytes(row.doneBytes)} / {formatBytes(row.totalBytes)}
          </span>
        </div>
      )}
      {(row.phase === 'cancelled' || row.phase === 'error') && (
        <div className="mt-1 font-mono text-[9px] text-muted-foreground">
          {row.phase === 'cancelled'
            ? 'Paused — the partial file is kept; Resume continues from where it stopped.'
            : `Failed: ${row.error ?? 'unknown error'}`}
        </div>
      )}
    </div>
  )
}

export default function LocalModelsPanel() {
  const [tab, setTab] = useState<Tab>('discover')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<HubSort>('downloads')
  const [catalog, setCatalog] = useState<HubModel[]>([])
  const [selected, setSelected] = useState<HubModel | null>(null)
  const [files, setFiles] = useState<HubFile[]>([])
  const [picked, setPicked] = useState<string | null>(null)
  const [hw, setHw] = useState<HardwareProfile | null>(null)
  const [installed, setInstalled] = useState<LocalModelRow[]>([])
  const [registry, setRegistry] = useState<RegistryEntry[]>([])
  // P51.4 — bulk-remove selection (multi-select, space-freed shown live).
  const [selectedForRemoval, setSelectedForRemoval] = useState<Set<string>>(new Set())
  const [downloads, setDownloads] = useState<ModelDownloadRow[]>([])
  const [orphans, setOrphans] = useState<OrphanPart[]>([])
  const [recommended, setRecommended] = useState<{ quant: string; availableRamBytes: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const [hubError, setHubError] = useState<string | null>(null)
  const [nativeError, setNativeError] = useState<string | null>(null)
  const [busyFile, setBusyFile] = useState<string | null>(null)
  const [prefs, setPrefs] = useState<LocalPrefs>(getLocalPrefs)
  // P52.1 — per-quant fit traffic lights keyed by GGUF path.
  const [fitMap, setFitMap] = useState<Record<string, FitEstimate>>({})
  // P52.5 — one-click auto best-variant state.
  const [pickingBest, setPickingBest] = useState(false)
  const [autoPicked, setAutoPicked] = useState(false)
  // P52.2 — gallery index import/inspect.
  const [galleryYaml, setGalleryYaml] = useState(GALLERY_SAMPLE)
  const [gallery, setGallery] = useState<GalleryIndex | null>(null)
  const [galleryError, setGalleryError] = useState<string | null>(null)
  const [galleryBusy, setGalleryBusy] = useState(false)
  const notify = useAppStore((s) => s.notify)
  const setSelectedAgent = useAppStore((s) => s.setSelectedAgent)
  const setSelectedModel = useAppStore((s) => s.setSelectedModel)
  const setLocalRuntime = useAppStore((s) => s.setLocalRuntime)
  const canDownload = downloadsAvailable()

  const refreshNative = useCallback(async () => {
    if (!canDownload) return
    try {
      const [dl, reg] = await Promise.all([listDownloads(), registryList()])
      setDownloads(dl.active)
      setOrphans(dl.orphans)
      setRegistry(reg.models)
      setNativeError(null)
    } catch (e) {
      setNativeError(e instanceof Error ? e.message : 'Native model store unreachable')
    }
  }, [canDownload])

  useEffect(() => {
    void getHardware().then((h) => h && setHw(h))
    void listLocalModels()
      .then((r) => {
        setInstalled(r.models ?? [])
        if (r.hardware) setHw(r.hardware)
      })
      .catch(() => setInstalled([]))
    void refreshNative()
    if (!canDownload) return
    let unlisten: (() => void) | undefined
    void onModelDownloadEvent((ev) => {
      if (ev.phase === 'done' || ev.phase === 'error' || ev.phase === 'cancelled' || ev.kind === 'serve') {
        void refreshNative()
      } else {
        setDownloads((cur) => {
          const row = cur.find((r) => r.id === ev.id)
          if (!row) return cur
          return cur.map((r) =>
            r.id === ev.id
              ? { ...r, phase: ev.phase as ModelDownloadRow['phase'], doneBytes: ev.doneBytes ?? r.doneBytes, totalBytes: ev.totalBytes ?? r.totalBytes }
              : r,
          )
        })
      }
    }).then((u) => {
      unlisten = u
    })
    return () => {
      unlisten?.()
    }
  }, [canDownload, refreshNative])

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
    setPicked(null)
    setRecommended(null)
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
    if (canDownload) {
      void recommendQuant(selected.id)
        .then((r) => {
          if (!cancelled) setRecommended(r)
        })
        .catch(() => {
          /* recommendation is a hint — never blocks the panel */
        })
    }
    return () => {
      cancelled = true
    }
  }, [selected, canDownload])

  const ram = ramBytes(hw)
  const gguf = files.filter((f) => f.path.toLowerCase().endsWith('.gguf'))

  // P52.1 — per-file fit pre-check at the serving context (native, read-only;
  // silently skipped outside the shell — the lights stay dim there).
  const ggufKey = gguf.map((f) => `${f.path}:${f.size}`).join('|')
  useEffect(() => {
    if (!canDownload || !selected || gguf.length === 0) {
      setFitMap({})
      return
    }
    let cancelled = false
    void Promise.all(
      gguf.map(async (f) => {
        const est = await estimateFit(bytesToGib(f.size), FIT_CTX)
        return [f.path, est] as const
      }),
    )
      .then((rows) => {
        if (!cancelled) setFitMap(Object.fromEntries(rows))
      })
      .catch(() => {
        // Fit is a hint — never blocks the panel.
        if (!cancelled) setFitMap({})
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canDownload, selected?.id, ggufKey])

  const chosen = useMemo(() => {
    if (picked) return files.find((f) => f.path === picked) ?? null
    const q = recommended?.quant?.toLowerCase()
    if (q) {
      const match = gguf.find((f) => quantFromPath(f.path).toLowerCase() === q)
      if (match) return match
    }
    const q4 = gguf.find((f) => /Q4_K_M/i.test(f.path))
    return q4 ?? gguf[0] ?? files[0] ?? null
  }, [picked, files, gguf, recommended])

  const firstCard = catalog[0] ?? null
  const storeHint = installed.reduce((n, r) => n + (r.sizeBytes || 0), 0)
  const registryBytes = registry.reduce((n, r) => n + r.size, 0)
  const totalBytes = storeHint + registryBytes

  const savePrefs = (next: LocalPrefs) => {
    setPrefs(next)
    setLocalPrefs(next)
  }

  const download = async (repo: string, file: HubFile) => {
    if (!canDownload) {
      notify('Model downloads require the Tauri desktop shell.')
      return
    }
    setBusyFile(file.path)
    setNativeError(null)
    try {
      const res = await startDownload(repo, file.path)
      if (res.alreadyInstalled) {
        notify(`Already installed: ${res.id}`)
      } else {
        notify(res.resuming ? 'Resuming download…' : `Downloading ${file.path}…`)
      }
      await refreshNative()
    } catch (e) {
      setNativeError(e instanceof Error ? e.message : 'Download could not start')
    } finally {
      setBusyFile(null)
    }
  }

  const resume = async (repo: string, filename: string) => {
    if (!canDownload) return
    setNativeError(null)
    try {
      await startDownload(repo, filename)
      await refreshNative()
    } catch (e) {
      setNativeError(e instanceof Error ? e.message : 'Resume could not start')
    }
  }

  const cancel = async (id: string) => {
    if (!canDownload) return
    try {
      await cancelDownload(id)
      await refreshNative()
    } catch (e) {
      setNativeError(e instanceof Error ? e.message : 'Cancel failed')
    }
  }

  const remove = async (id: string) => {
    if (!canDownload) return
    try {
      await removeModel(id)
      await refreshNative()
      notify(`Removed ${id}`)
    } catch (e) {
      setNativeError(e instanceof Error ? e.message : 'Remove failed')
    }
  }

  // P51.4 — Jan A5 bulk-delete-with-space-freed: one pass over the selected
  // registry rows, honest per-row errors, selection cleared on success.
  const bulkRemove = async () => {
    if (!canDownload || selectedForRemoval.size === 0) return
    const ids = [...selectedForRemoval]
    setNativeError(null)
    let removed = 0
    let failed = 0
    for (const id of ids) {
      try {
        await removeModel(id)
        removed += 1
      } catch (e) {
        failed += 1
        setNativeError(e instanceof Error ? e.message : `Remove failed: ${id}`)
      }
    }
    await refreshNative()
    if (removed > 0) {
      setSelectedForRemoval(new Set())
      notify(`Removed ${removed} model${removed === 1 ? '' : 's'} — space freed on disk`)
    }
    if (failed > 0) notify(`Bulk remove: ${failed} failed`, 'error')
  }

  const serve = async (id: string) => {
    if (!canDownload) return
    try {
      const res = await serveModel(id)
      notify(`Serving ${id} on ${res.baseUrl} — health is verified in the background.`)
      setSelectedAgent('everyaios-native')
      setSelectedModel(id)
      setLocalRuntime('llamafile', res.port ? 16384 : undefined)
    } catch (e) {
      setNativeError(e instanceof Error ? e.message : 'Serving failed')
    }
  }

  // P52.5 — one-click best variant for novices: build candidates from the
  // repo's GGUF files and let the native picker choose for this hardware.
  const autoPick = async () => {
    if (!selected || !canDownload || gguf.length < 2) return
    setPickingBest(true)
    setAutoPicked(false)
    setNativeError(null)
    try {
      const cands = buildCandidates(selected.id, gguf)
      const best = await bestPick(hostHwClass(hw), cands)
      if (best) {
        setPicked(best.file)
        setAutoPicked(true)
        notify(`Auto-picked ${best.quant} (${best.hw}-class build) for this hardware.`)
      } else {
        notify('No downloadable build could be picked from this repo.')
      }
    } catch (e) {
      setNativeError(e instanceof Error ? e.message : 'Auto-pick failed')
    } finally {
      setPickingBest(false)
    }
  }

  // P52.2 — parse a LocalAI-style index.yaml (native parse only).
  const parseGallery = async () => {
    if (!canDownload || !galleryYaml.trim()) return
    setGalleryBusy(true)
    setGalleryError(null)
    try {
      setGallery(await parseGalleryYaml(galleryYaml))
    } catch (e) {
      setGallery(null)
      setGalleryError(e instanceof Error ? e.message : 'Gallery index could not be parsed')
    } finally {
      setGalleryBusy(false)
    }
  }

  return (
    <div className="flex h-full min-h-[520px] flex-col">
      <div className="mb-3 flex items-center gap-1 rounded-md border border-border/60 bg-background/40 p-0.5">
        {          ([
            ['discover', 'Discover'],
            ['mine', 'My models'],
            ['gallery', 'Gallery'],
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

      {!canDownload && tab !== 'hardware' && (
        <div className="mb-2 rounded border border-amber-500/30 bg-amber-500/5 px-2 py-1.5 text-[11px] text-amber-300">
          Model downloads are a Tauri-shell capability — this browser preview lists the Hub but
          cannot fetch weights.
        </div>
      )}
      {nativeError && (
        <div className="mb-2 rounded border border-red-500/30 bg-red-500/5 px-2 py-1.5 text-[11px] text-red-300">
          {nativeError}
        </div>
      )}

      {tab === 'discover' && (
        <div className="flex min-h-0 flex-1 flex-col">
          {installed.length === 0 && registry.length === 0 && firstCard && (
            <div className="mb-3 rounded-lg border border-orange-500/30 bg-orange-500/5 p-3">
              <div className="text-[12px] font-semibold text-foreground">Your first model</div>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Live from Hugging Face Hub (current Hub sort). Nothing is named in source — this
                card is whatever the Hub returns first. Downloads are verified by sha256 and
                registered as <span className="font-mono">local://hf/…</span> for the picker.
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
                  disabled={busyFile !== null}
                  onClick={() => {
                    void listHubFiles(firstCard.id)
                      .then((f) => {
                        const gg = f.find((x) => /Q4_K_M/i.test(x.path)) ?? f.find((x) => x.path.endsWith('.gguf')) ?? f[0]
                        if (gg) return download(firstCard.id, gg)
                        setNativeError('No GGUF/safetensors files listed on this repo main branch.')
                      })
                  }}
                >
                  {busyFile ? (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  ) : (
                    <Download className="mr-1 h-3 w-3" />
                  )}
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

          {(downloads.length > 0 || orphans.length > 0) && (
            <div className="mb-2 space-y-1.5">
              {downloads.map((row) => (
                <DownloadRow key={row.id} row={row} onCancel={cancel} onResume={resume} />
              ))}
              {orphans.map((o) => {
                const rel = o.rel.replace(/\.part$/, '')
                const parts = rel.split('/')
                const filename = parts.pop() ?? ''
                const repo = parts.length >= 2 ? `${parts[0]}/${parts[1]}` : rel
                return (
                  <div
                    key={o.dest}
                    className="flex items-center justify-between gap-2 rounded-md border border-dashed border-border/70 bg-background/30 px-2 py-1.5"
                  >
                    <div className="min-w-0 font-mono text-[10px] text-muted-foreground">
                      Interrupted: {rel} · {formatBytes(o.doneBytes)} downloaded
                    </div>
                    <Button
                      size="sm"
                      className="h-6 shrink-0 bg-orange-500 px-2 text-[10px] text-white hover:bg-orange-600"
                      onClick={() => resume(repo, filename)}
                    >
                      <Play className="mr-1 h-3 w-3" />
                      Resume
                    </Button>
                  </div>
                )
              })}
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
                  {recommended && (
                    <div className="mt-1 font-mono text-[10px] text-emerald-300">
                      Recommended for your hardware: <span className="font-bold">{recommended.quant}</span>
                      {' '}(fits in {formatBytes(recommended.availableRamBytes)} free RAM)
                    </div>
                  )}
                  <div className="mt-1.5 rounded-md border border-border/60 bg-background/40 p-2">
                    {chosen ? (
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 font-mono text-[10px] text-muted-foreground">
                          {quantFromPath(chosen.path)} · {formatBytes(chosen.size)} · {chosen.path}
                        </div>
                        <Button
                          size="sm"
                          className="h-7 shrink-0 bg-orange-500 px-2.5 text-[10px] text-white hover:bg-orange-600"
                          disabled={busyFile !== null}
                          onClick={() => download(selected.id, chosen)}
                        >
                          {busyFile === chosen.path ? (
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          ) : (
                            <Download className="mr-1 h-3 w-3" />
                          )}
                          Download
                        </Button>
                      </div>
                    ) : (
                      <div className="font-mono text-[10px] text-muted-foreground">
                        No GGUF listed on main yet — Hub tree empty or failed.
                      </div>
                    )}
                    {gguf.length > 1 && (
                      <div className="mt-2 space-y-1.5">
                        <div className="flex flex-wrap gap-1">
                          {gguf.slice(0, 10).map((f) => {
                            const q = quantFromPath(f.path)
                            const isDefault = q === (recommended?.quant ?? DEFAULT_QUANT)
                            return (
                              <button
                                key={f.path}
                                type="button"
                                onClick={() => {
                                  setPicked(f.path)
                                  setAutoPicked(false)
                                }}
                                className={cn(
                                  'flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[9px]',
                                  chosen?.path === f.path
                                    ? 'border-orange-500/60 bg-orange-500/10 text-orange-300'
                                    : 'border-border/50 text-muted-foreground hover:text-foreground',
                                )}
                              >
                                <FitDot est={fitMap[f.path]} />
                                <span>{q}</span>
                                {isDefault && (
                                  <span className="rounded bg-emerald-500/20 px-1 text-[8px] text-emerald-300">
                                    default
                                  </span>
                                )}
                                <span className="opacity-70">{formatBytes(f.size)}</span>
                              </button>
                            )
                          })}
                        </div>
                        {canDownload && (
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="flex items-center gap-1 font-mono text-[9px] text-muted-foreground">
                              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
                              fits
                              <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />
                              slow
                              <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-400" />
                              won't fit
                              <span className="text-border-foreground/50">— estimate at {FIT_CTX_LABEL} ctx, file + KV vs RAM (+VRAM)</span>
                            </span>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 border-orange-500/40 px-2 text-[10px] text-orange-300 hover:bg-orange-500/10"
                              disabled={busyFile !== null || pickingBest}
                              onClick={() => void autoPick()}
                              title="Let the native picker choose the best build for this machine (prefers a Q4_K_M build, CPU fallback). Download still needs your confirm."
                            >
                              {pickingBest ? (
                                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                              ) : (
                                <Sparkles className="mr-1 h-3 w-3" />
                              )}
                              Auto-pick for this hardware
                            </Button>
                            {autoPicked && chosen && (
                              <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[9px] text-emerald-300">
                                Auto-picked {quantFromPath(chosen.path)} — you can switch below.
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  {!canDownload && (
                    <div className="mt-2 text-[10px] text-amber-300">
                      The downloader needs the Tauri shell — in this preview the Hub is live but
                      fetching weights is not.
                    </div>
                  )}
                </>
              ) : (
                <div className="text-[11px] text-muted-foreground">
                  Search the Hub or wait for results. No models are hardcoded.
                </div>
              )}
            </div>
          </div>

          <div className="mt-2 font-mono text-[10px] text-muted-foreground">
            {registry.length} downloaded model{registry.length === 1 ? '' : 's'} ·{' '}
            {installed.length} runtime model{installed.length === 1 ? '' : 's'}
            {totalBytes > 0 ? ` · ${formatBytes(totalBytes)} on disk` : ''}.
          </div>
        </div>
      )}

      {tab === 'mine' && (
        <div className="space-y-2">
          {selectedForRemoval.size > 0 && (
            <div className="flex items-center justify-between gap-2 rounded-md border border-orange-500/40 bg-orange-500/10 px-3 py-2">
              <span className="text-[11px] text-orange-200">
                {selectedForRemoval.size} selected · frees{' '}
                {formatBytes(
                  registry
                    .filter((r) => selectedForRemoval.has(r.id))
                    .reduce((n, r) => n + r.size, 0),
                )}
              </span>
              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-[10px] text-muted-foreground"
                  onClick={() => setSelectedForRemoval(new Set())}
                >
                  Clear
                </Button>
                <Button
                  size="sm"
                  className="h-6 bg-red-500/90 px-2 text-[10px] text-white hover:bg-red-600"
                  onClick={() => void bulkRemove()}
                >
                  <Trash2 className="h-3 w-3" />
                  Remove selected
                </Button>
              </div>
            </div>
          )}
          {registry.length === 0 && installed.length === 0 && (
            <div className="rounded-lg border border-dashed border-border p-6 text-center text-[12px] text-muted-foreground">
              No downloaded or installed models yet.
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
          {registry.map((row) => (
            <div
              key={row.id}
              className="flex w-full items-center justify-between gap-2 rounded-md border border-border/60 bg-background/40 px-3 py-2"
            >
              <button
                type="button"
                aria-label={`Select ${row.id}`}
                onClick={() =>
                  setSelectedForRemoval((prev) => {
                    const next = new Set(prev)
                    if (next.has(row.id)) next.delete(row.id)
                    else next.add(row.id)
                    return next
                  })
                }
                className={`flex size-4 shrink-0 items-center justify-center rounded border ${
                  selectedForRemoval.has(row.id)
                    ? 'border-orange-500 bg-orange-500 text-white'
                    : 'border-border bg-background text-transparent'
                }`}
              >
                <Check className="h-3 w-3" />
              </button>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[12px] font-medium">{row.id}</span>
                  <Badge className="bg-emerald-500/20 px-1 text-[8px] text-emerald-300">
                    downloaded
                  </Badge>
                </div>
                <div className="truncate font-mono text-[10px] text-muted-foreground">
                  {row.quant} · {formatBytes(row.size)} · ctx {row.ctx.toLocaleString()} ·{' '}
                  <span className="text-emerald-300/80">local://hf/{row.id}</span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  size="sm"
                  className="h-6 bg-orange-500 px-2 text-[10px] text-white hover:bg-orange-600"
                  onClick={() => serve(row.id)}
                  title="Bind to a managed llamafile runtime (requires a llamafile binary)"
                >
                  Use
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-1.5 text-[10px] text-muted-foreground hover:text-red-300"
                  onClick={() => remove(row.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
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

      {tab === 'gallery' && (
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-0.5">
          <div className="rounded-md border border-border/60 bg-background/40 px-2.5 py-2 text-[11px] text-muted-foreground">
            LocalAI-style <span className="font-mono">index.yaml</span> gallery import — each{' '}
            <span className="font-mono">id: gallery@model</span> entry pins files with{' '}
            <span className="font-mono">sha256</span>, may set a{' '}
            <span className="font-mono">backend_override</span> and a{' '}
            <span className="font-mono">preload</span> flag. The native parser refuses half-pinned
            files, so a parsed index is structurally safe to read. This tab only parses &
            inspects — installing pinned files into a gallery dir and verifying their sha256 on
            load is the Rust gallery-dir loader seam (parser landed; loader wiring remains).
          </div>
          {!canDownload && (
            <div className="rounded border border-amber-500/30 bg-amber-500/5 px-2 py-1.5 text-[11px] text-amber-300">
              Parsing is a native command — this browser preview keeps the sample but cannot
              call it.
            </div>
          )}
          <textarea
            value={galleryYaml}
            onChange={(e) => setGalleryYaml(e.target.value)}
            spellCheck={false}
            className="h-28 w-full resize-y rounded-md border border-border/60 bg-background/40 p-2 font-mono text-[10px] text-foreground focus:border-orange-500/60 focus:outline-none"
            placeholder="Paste a LocalAI-style index.yaml…"
          />
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              className="h-7 bg-orange-500 px-2.5 text-[10px] text-white hover:bg-orange-600"
              disabled={!canDownload || galleryBusy || !galleryYaml.trim()}
              onClick={() => void parseGallery()}
            >
              {galleryBusy ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <Wrench className="mr-1 h-3 w-3" />
              )}
              Parse &amp; inspect
            </Button>
            {galleryYaml !== GALLERY_SAMPLE && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-[10px] text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setGalleryYaml(GALLERY_SAMPLE)
                  setGallery(null)
                  setGalleryError(null)
                }}
              >
                Reset sample
              </Button>
            )}
          </div>
          {galleryError && (
            <div className="rounded border border-red-500/30 bg-red-500/5 px-2 py-1.5 font-mono text-[10px] text-red-300">
              {galleryError}
            </div>
          )}
          {gallery && (
            <div className="space-y-1.5">
              <div className="font-mono text-[10px] text-muted-foreground">
                {gallery.models.length} entr{gallery.models.length === 1 ? 'y' : 'ies'} · index
                version {gallery.version} — sha pins shown are <em>declared</em>, not locally
                verified.
              </div>
              {gallery.models.map((entry: GalleryEntry) => (
                <div
                  key={entry.id}
                  className="rounded-md border border-border/60 bg-background/40 px-2.5 py-2"
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-[11px] font-medium text-foreground">
                      {entry.id}
                    </span>
                    {entry.backend_override && (
                      <Badge className="bg-sky-500/15 px-1 text-[8px] text-sky-300">
                        runtime: {entry.backend_override}
                      </Badge>
                    )}
                    {entry.preload && (
                      <Badge className="bg-amber-500/15 px-1 text-[8px] text-amber-300">
                        preload
                      </Badge>
                    )}
                    <span className="ml-auto font-mono text-[9px] text-muted-foreground">
                      {entry.files.length} pinned
                    </span>
                  </div>
                  <div className="mt-1.5 space-y-1">
                    {entry.files.map((f) => (
                      <div
                        key={f.path}
                        className="flex items-center gap-2 font-mono text-[9px] text-muted-foreground"
                      >
                        <span className="min-w-0 truncate">{f.path}</span>
                        <span
                          className="shrink-0 text-emerald-300/80"
                          title={`sha256 ${f.sha256}`}
                        >
                          sha:{f.sha256.slice(0, 12)}…
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
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
                <div className="text-[10px] text-muted-foreground">Stored in this browser only until the runtime binder lands.</div>
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
              Live RAM probes drive the hardware-fit quant recommendation in Discover; disk free is
              checked before a download starts.
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