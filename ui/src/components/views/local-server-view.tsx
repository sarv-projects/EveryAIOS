'use client'

import { useEffect, useRef, useState } from 'react'
import {
  CheckCircle2,
  Copy,
  Cpu,
  KeyRound,
  Loader2,
  Play,
  Power,
  RefreshCw,
  ServerCog,
  SlidersHorizontal,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/lib/store'
import {
  openAiServerStart,
  openAiServerStatus,
  openAiServerStop,
  type OpenAiServerStatus,
} from '@/lib/openai-server'
import {
  estimateFit,
  listDownloads,
  onModelDownloadEvent,
  registryList,
  serveModel,
  type ModelDownloadEvent,
  type RegistryEntry,
  type ServeOptions,
} from '@/lib/models-download'
import { fmtBytes } from '@/lib/attachments'

/** One served registry model's live phase (from `model-download` serve emits). */
interface ServeState {
  phase: 'starting' | 'serving' | 'served' | 'error'
  baseUrl?: string
  error?: string
}

/**
 * P52.3 — unified local server surface (partial, honest): consolidates the
 * two real runtime seams under one roof —
 *  1. OpenAI-compatible loopback server (:8080 shape, `openai_cmds.rs`) —
 *     start/stop/restart are real (restart = stop+start).
 *  2. Local runtime (:11434 shape, `model_serve`) — GGUF via llamafile
 *     (default) or the Apple-Silicon MLX sidecar `mlx_lm.server` (P52.7,
 *     real spawn that fails closed when mlx-lm is absent) — start + phase +
 *     base URL are real; stop/restart/logs/VRAM are Rust-gated
 *     (child is detached, stdout/stderr nulled) and called out below, not
 *     faked.
 *  Plus the P52.1 fit pre-check (`model_estimate_fit`) per registry model.
 */
export default function LocalServerView() {
  const notify = useAppStore((s) => s.notify)
  const [status, setStatus] = useState<OpenAiServerStatus>({ running: false })
  const [port, setPort] = useState('8081')
  const [busy, setBusy] = useState(false)
  const [restarting, setRestarting] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  // Local runtime section.
  const [models, setModels] = useState<RegistryEntry[]>([])
  const [serveMap, setServeMap] = useState<Record<string, ServeState>>({})
  const [fitMap, setFitMap] = useState<Record<string, 'fits' | 'may_be_slow' | 'wont_fit'>>({})
  // P52.4 — per-model serve options (the real llama.cpp launch flags).
  const [advOpen, setAdvOpen] = useState<string | null>(null)
  const [serveOpts, setServeOpts] = useState<Record<string, ServeOptions>>({})
  const [localError, setLocalError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const unlistenRef = useRef<(() => void) | undefined>(undefined)

  const running = status.running
  const baseUrl = status.baseUrl ?? `http://127.0.0.1:${port}/v1`
  const modelsUrl = `${baseUrl}/models`
  const chatUrl = `${baseUrl}/chat/completions`

  async function refresh() {
    try {
      setStatus(await openAiServerStatus())
    } catch (e) {
      notify(String(e))
    }
  }

  // Registry + serve phases + live serve events.
  async function loadRegistry() {
    setLoading(true)
    setLocalError(null)
    try {
      const reg = await registryList()
      setModels(reg.models)
      try {
        const dl = await listDownloads()
        const seeded: Record<string, ServeState> = {}
        for (const row of dl.active) {
          if (row.phase === 'serving' || row.phase === 'served' || row.phase === 'error') {
            seeded[row.id] = {
              phase: row.phase === 'serving' ? 'serving' : row.phase,
              baseUrl: row.phase === 'served' ? undefined : undefined,
              error: row.error ?? undefined,
            }
          }
        }
        setServeMap(seeded)
      } catch {
        // listDownloads is optional here — registry alone still works.
      }
    } catch (e) {
      setLocalError(
        e instanceof Error && /Tauri|invoke|not.*available/i.test(e.message)
          ? 'Model serving is a Tauri-shell capability — this browser preview cannot start local runtimes.'
          : e instanceof Error
            ? e.message
            : 'Failed to load the model registry.',
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
    void loadRegistry()
    let unlisten: (() => void) | undefined
    onModelDownloadEvent((ev: ModelDownloadEvent) => {
      if (ev.kind !== 'serve') return
      setServeMap((prev) => ({
        ...prev,
        [ev.id]:
          ev.phase === 'served' || ev.phase === 'error'
            ? { phase: ev.phase, baseUrl: ev.baseUrl ?? undefined, error: ev.error ?? undefined }
            : { phase: 'serving', ...(prev[ev.id] ? { baseUrl: prev[ev.id].baseUrl } : {}) },
      }))
    })
      .then((fn) => {
        unlisten = fn
        unlistenRef.current = fn
      })
      .catch(() => undefined)
    return () => {
      unlisten?.()
      unlistenRef.current = undefined
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function toggle() {
    setBusy(true)
    try {
      if (running) {
        await openAiServerStop()
        setStatus({ running: false })
      } else {
        const p = parseInt(port, 10)
        const s = await openAiServerStart(Number.isFinite(p) && p > 0 ? p : undefined)
        setStatus(s)
      }
    } catch (e) {
      notify(String(e))
    } finally {
      setBusy(false)
    }
  }

  /** P52.3 — restart = stop then start (both commands are real). */
  async function restart() {
    setRestarting(true)
    try {
      await openAiServerStop()
      setStatus({ running: false })
      const p = parseInt(port, 10)
      const s = await openAiServerStart(Number.isFinite(p) && p > 0 ? p : undefined)
      setStatus(s)
    } catch (e) {
      notify(String(e))
    } finally {
      setRestarting(false)
    }
  }

  async function serve(id: string) {
    setServeMap((prev) => ({ ...prev, [id]: { phase: 'starting' } }))
    try {
      const res = await serveModel(id, serveOpts[id])
      notify(`Serving ${id} on ${res.baseUrl} — health is verified in the background.`)
      setServeMap((prev) => ({ ...prev, [id]: { phase: 'serving' } }))
    } catch (e) {
      setServeMap((prev) => ({
        ...prev,
        [id]: { phase: 'error', error: e instanceof Error ? e.message : 'Serving failed' },
      }))
    }
  }

  /** P52.4 — patch one field of a model's serve options. */
  function setOpt(id: string, patch: Partial<ServeOptions>) {
    setServeOpts((prev) => ({ ...prev, [id]: { ...(prev[id] ?? {}), ...patch } }))
  }

  async function checkFit(id: string) {
    const m = models.find((x) => x.id === id)
    if (!m || fitMap[id]) return
    try {
      const r = await estimateFit(m.size / 1073741824, m.ctx || 16384)
      setFitMap((prev) => ({ ...prev, [id]: r.tier }))
    } catch {
      // Fit check is best-effort; the serve row still works without it.
    }
  }

  const copy = (text: string, label: string) => {
    navigator.clipboard?.writeText(text)
    setCopied(label)
    setTimeout(() => setCopied(null), 1500)
  }

  const serveBadge = (id: string) => {
    const s = serveMap[id]
    if (!s) return null
    if (s.phase === 'starting' || s.phase === 'serving') {
      return (
        <Badge variant="secondary" className="border-sky-500/30 bg-sky-500/10 text-[9px] text-sky-300">
          <Loader2 className="mr-0.5 h-2.5 w-2.5 animate-spin" /> starting
        </Badge>
      )
    }
    if (s.phase === 'served') {
      return (
        <Badge variant="secondary" className="border-emerald-500/30 bg-emerald-500/10 text-[9px] text-emerald-400">
          <CheckCircle2 className="mr-0.5 h-2.5 w-2.5" /> live{s.baseUrl ? ` · ${s.baseUrl}` : ''}
        </Badge>
      )
    }
    return (
      <Badge variant="secondary" className="border-red-500/30 bg-red-500/10 text-[9px] text-red-400">
        failed
      </Badge>
    )
  }

  return (
    <div className="fade-up flex h-full flex-col gap-4 overflow-y-auto p-4">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ServerCog className="h-4 w-4 text-orange-400" />
          <h3 className="text-sm font-semibold text-foreground">Local Servers</h3>
          <span className="rounded border border-border/60 bg-background/40 px-1.5 py-0.5 text-[9px] text-muted-foreground">
            P52.3 unified surface
          </span>
        </div>
      </header>

      {/* ------------------------------------------------------------------ */}
      {/* 1 · OpenAI-compatible loopback server (:8080 shape)                  */}
      {/* ------------------------------------------------------------------ */}
      <section className="space-y-3 rounded-lg border border-border bg-muted/10 p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-mono text-[9px]">:8080 shape</Badge>
            <span className="text-xs font-medium text-foreground">OpenAI-compatible server</span>
            <Badge
              variant="secondary"
              className={cn(
                'text-[9px]',
                running
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                  : 'border-slate-500/30 text-slate-400',
              )}
            >
              {running ? '● running' : '○ stopped'}
            </Badge>
          </div>
          <div className="flex items-center gap-1.5">
            {running && (
              <Button size="sm" variant="outline" className="h-8" disabled={restarting} onClick={() => void restart()}>
                <RefreshCw className={cn('mr-1 h-3.5 w-3.5', restarting && 'animate-spin')} /> Restart
              </Button>
            )}
            <Button
              size="sm"
              variant={running ? 'destructive' : 'default'}
              className="h-8"
              disabled={busy}
              onClick={() => void toggle()}
            >
              {running ? (
                <><Power className="mr-1 h-3.5 w-3.5" /> Stop</>
              ) : (
                <><Play className="mr-1 h-3.5 w-3.5" /> {busy ? 'Starting…' : 'Start'}</>
              )}
            </Button>
          </div>
        </div>

        {/* Port config (ignored once running — the running addr wins). */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-400">Port</label>
          <Input
            value={port}
            onChange={(e) => setPort(e.target.value.replace(/\D/g, '').slice(0, 5))}
            className="h-8 w-24 font-mono text-xs"
            disabled={running}
            placeholder="auto"
          />
          <span className="text-[10px] text-muted-foreground">blank = ephemeral port</span>
        </div>

        {/* Endpoints */}
        <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Endpoints</div>
          {[
            { label: 'Base URL', url: baseUrl },
            { label: 'Models', url: modelsUrl },
            { label: 'Chat', url: chatUrl },
          ].map((ep) => (
            <div key={ep.label} className="flex items-center gap-2">
              <span className="w-16 shrink-0 text-xs text-slate-400">{ep.label}</span>
              <code className="flex-1 truncate rounded bg-slate-900/60 px-2 py-1 font-mono text-[11px] text-orange-300">
                {ep.url}
              </code>
              <Button size="icon" variant="ghost" className="size-6" onClick={() => copy(ep.url, ep.label)}>
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          ))}
          {/* The per-process bearer token clients must send as the API key. */}
          {running && status.token && (
            <div className="flex items-center gap-2">
              <span className="w-16 shrink-0 text-xs text-slate-400">API key</span>
              <code className="flex-1 truncate rounded bg-slate-900/60 px-2 py-1 font-mono text-[11px] text-emerald-300">
                <KeyRound className="mr-1 inline h-3 w-3" />
                {status.token}
              </code>
              <Button size="icon" variant="ghost" className="size-6" onClick={() => copy(status.token!, 'API key')}>
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          )}
          {copied && <div className="text-[10px] text-emerald-400">{copied} copied to clipboard</div>}
        </div>

        {/* VS Code / Cursor integration hint */}
        <div className="rounded-lg border border-orange-500/20 bg-orange-500/5 p-3 text-xs text-slate-300">
          <div className="flex items-center gap-1.5">
            <ToggleRight className="h-3.5 w-3.5 text-orange-400" />
            <span className="font-medium">VS Code / Cursor integration</span>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
            Point any OpenAI-compatible client at the base URL above and use the API key shown when
            running. The server exposes the engine's models (BYOK + local) over loopback only — no
            external relay. Credentials stay in the vault; the server proxies through the same broker
            that resolves keys for the agent loop.
          </p>
          <div className="mt-2 flex items-center gap-1.5 font-mono text-[10px] text-slate-500">
            <ToggleLeft className="h-3 w-3" />
            <span>status: {running ? `live on ${baseUrl}` : 'stopped — start the server to expose'}</span>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* 2 · Local GGUF runtime (:11434 shape)                                */}
      {/* ------------------------------------------------------------------ */}
      <section className="space-y-3 rounded-lg border border-border bg-muted/10 p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-mono text-[9px]">:11434 shape</Badge>
            <span className="text-xs font-medium text-foreground">Local model runtime (llamafile)</span>
            <span className="text-[10px] text-muted-foreground">registry-served GGUF · health-verified in the background</span>
          </div>
        </div>

        {localError && (
          <div className="rounded border border-amber-500/30 bg-amber-500/5 px-2 py-1.5 text-[11px] text-amber-300">
            {localError}
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Loading registry…
          </div>
        ) : models.length === 0 && !localError ? (
          <div className="rounded border border-border/60 px-2 py-3 text-center text-[11px] text-muted-foreground">
            No installed models — download one in Local Models first.
          </div>
        ) : (
          <div className="space-y-1.5">
            {models.map((m) => {
              const o = serveOpts[m.id] ?? {}
              return (
                <div key={m.id} className="rounded-lg border border-border/60 bg-background/40 px-2.5 py-2">
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-mono text-[11px] text-foreground">{m.id}</span>
                        {serveBadge(m.id)}
                        {fitMap[m.id] && (
                          <Badge
                            variant="secondary"
                            className={cn(
                              'text-[9px]',
                              fitMap[m.id] === 'fits'
                                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                                : fitMap[m.id] === 'may_be_slow'
                                  ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                                  : 'border-red-500/30 bg-red-500/10 text-red-400',
                            )}
                          >
                            {fitMap[m.id] === 'fits' ? 'fits' : fitMap[m.id] === 'may_be_slow' ? 'may be slow' : "won't fit"}
                          </Badge>
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span>{fmtBytes(m.size)}</span>
                        <span>·</span>
                        <span>{m.quant}</span>
                        <span>·</span>
                        <span>ctx {o.numCtx ?? (m.ctx || 16384)}</span>
                        {serveMap[m.id]?.error && <span className="truncate text-red-400">· {serveMap[m.id].error}</span>}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[11px]"
                      disabled={serveMap[m.id]?.phase === 'starting' || serveMap[m.id]?.phase === 'serving'}
                      onClick={() => void serve(m.id)}
                    >
                      {serveMap[m.id]?.phase === 'serving' || serveMap[m.id]?.phase === 'starting' ? (
                        <><Loader2 className="mr-1 h-3 w-3 animate-spin" /> Serving</>
                      ) : serveMap[m.id]?.phase === 'served' ? (
                        <>Serve again</>
                      ) : (
                        <><Play className="mr-1 h-3 w-3" /> Serve</>
                      )}
                    </Button>
                    {!fitMap[m.id] && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-[11px] text-muted-foreground"
                        onClick={() => void checkFit(m.id)}
                        title="Dry-run fit estimate vs this machine (P52.1)"
                      >
                        <Cpu className="mr-1 h-3 w-3" /> Fit?
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      className={cn('size-6', advOpen === m.id && 'text-orange-300')}
                      onClick={() => setAdvOpen(advOpen === m.id ? null : m.id)}
                      title="P52.4 — llama.cpp launch flags (gpu layers · KV cache · ctx)"
                    >
                      <SlidersHorizontal className="h-3 w-3" />
                    </Button>
                  </div>
                  {/* P52.4 — advanced serve options (real llama.cpp flags). */}
                  {advOpen === m.id && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-border/50 pt-2">
                      <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        runtime
                        <select
                          className="h-6 rounded border border-border/60 bg-background/60 px-1 font-mono text-[10px]"
                          value={o.runtime ?? 'gguf'}
                          onChange={(e) => setOpt(m.id, { runtime: e.target.value as ServeOptions['runtime'] })}
                          title="gguf: portable llamafile (default) · mlx: Apple-Silicon sidecar (requires mlx-lm on PATH)"
                        >
                          <option value="gguf">gguf · llamafile</option>
                          <option value="mlx">mlx · mlx_lm.server</option>
                        </select>
                      </label>
                      {o.runtime === 'mlx' && (
                        <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          HF id
                          <Input
                            className="h-6 w-48 font-mono text-[10px]"
                            placeholder="mlx-community/…-4bit (defaults from registry id)"
                            value={o.modelId ?? ''}
                            onChange={(e) =>
                              setOpt(m.id, { modelId: e.target.value === '' ? undefined : e.target.value })
                            }
                            title="HF model id for the MLX sidecar — derived as mlx-community/<name>-4bit from the registry id when empty"
                          />
                        </label>
                      )}
                      <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        GPU layers
                        <Input
                          type="number"
                          min={0}
                          max={200}
                          placeholder="auto"
                          className="h-6 w-16 font-mono text-[10px]"
                          value={o.gpuLayers ?? ''}
                          onChange={(e) =>
                            setOpt(
                              m.id,
                              e.target.value === '' ? { gpuLayers: undefined } : { gpuLayers: Number(e.target.value) },
                            )
                          }
                        />
                      </label>
                      <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        KV cache
                        <select
                          className="h-6 rounded border border-border/60 bg-background/60 px-1 font-mono text-[10px]"
                          value={o.kvCache ?? 'f16'}
                          onChange={(e) => setOpt(m.id, { kvCache: e.target.value as ServeOptions['kvCache'] })}
                        >
                          <option value="f16">f16 (default)</option>
                          <option value="q8_0">q8_0 (~4× smaller)</option>
                          <option value="q4_0">q4_0</option>
                          <option value="f32">f32</option>
                        </select>
                      </label>
                      <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        ctx
                        <Input
                          type="number"
                          min={1024}
                          step={1024}
                          placeholder={String(m.ctx || 16384)}
                          className="h-6 w-20 font-mono text-[10px]"
                          value={o.numCtx ?? ''}
                          onChange={(e) =>
                            setOpt(
                              m.id,
                              e.target.value === '' ? { numCtx: undefined } : { numCtx: Number(e.target.value) },
                            )
                          }
                        />
                      </label>
                      <span className="text-[9px] text-muted-foreground">
                        {o.runtime === 'mlx'
                          ? 'llama.cpp flags (GPU layers · KV · ctx) apply to the GGUF runtime only — mlx_lm.server serves the HF id directly and must be on PATH (Apple Silicon)'
                          : 'passes through to llamafile — advanced users only'}
                      </span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Honest gated-surface note — matches the P52.3 wire-trace assessment. */}
        <div className="rounded-lg border border-slate-500/20 bg-slate-500/5 p-3 text-[11px] leading-relaxed text-slate-400">
          <span className="font-medium text-slate-300">Gated today (not faked):</span> stop/restart of a served runtime,
          server logs, and live ctx/VRAM telemetry need Rust work — the spawned child is detached and its
          stdout/stderr are nulled (<code className="font-mono text-[10px]">serve_gguf</code>), so there is no handle
          to stop or logs to show. LAN exposure with a key is also Rust-gated (loopback bind is hardcoded). The MLX
          sidecar needs <code className="font-mono text-[10px]">mlx-lm</code> on PATH and an Apple-Silicon Mac — the
          spawn fails closed with the install hint when it is missing. The
          OpenAI-compatible server above has real start/stop/restart. The :1234 (LM Studio) shape is the same
          llamafile family — served here on the configured port.
        </div>
      </section>
    </div>
  )
}