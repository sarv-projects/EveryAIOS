'use client'

// P11.5.11 (H25) — generative UI (AG-UI / Anthropic Artifacts pattern, doc 50).
//
// Agent-emitted UI is rendered through a strict sandbox:
//   - `SandboxedArtifact` — srcdoc iframe with a locked CSP (no scripts, no
//     remote fetch, sandbox attr without allow-scripts). Agent HTML renders
//     here; it can never touch the app.
//   - `DescriptorRenderer` — the token-cheap path: the agent emits a small
//     JSON descriptor (`{type, data}`) instead of raw HTML, and we render a
//     LOCAL component from it. Raw HTML/Mermaid on request.
//   - `ArtifactCard` — static preview → "make live" opt-in with version
//     selector.
//   - `MermaidBlock` — inline live Mermaid render (lazy, no SSR).

import { useEffect, useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/* ==== Component-descriptor renderer (JSON schema → local UI) ==== */

export type Descriptor =
  | { type: 'mermaid'; source: string; title?: string }
  | { type: 'table'; columns: string[]; rows: (string | number)[][]; title?: string }
  | { type: 'metric'; label: string; value: string; delta?: string }
  | { type: 'chart'; kind: 'bar' | 'line'; labels: string[]; series: number[] }
  | { type: 'list'; title?: string; items: string[] }
  | { type: 'code'; language?: string; code: string }
  | { type: 'html'; html: string }
  | { type: 'note'; text: string }

export function isDescriptor(value: unknown): value is Descriptor {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return typeof v.type === 'string' && ['mermaid', 'table', 'metric', 'chart', 'list', 'code', 'html', 'note'].includes(v.type)
}

/** Render a descriptor as local UI — zero iframes, zero remote assets. */
export function DescriptorRenderer({ d, className }: { d: Descriptor; className?: string }) {
  return (
    <div className={cn('rounded-lg border border-border/70 bg-background/40 p-3', className)}>
      {d.type === 'metric' && (
        <div className="flex items-baseline gap-2">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{d.label}</span>
          <span className="font-mono text-lg font-semibold text-foreground">{d.value}</span>
          {d.delta && <span className="font-mono text-[10px] text-emerald-400">{d.delta}</span>}
        </div>
      )}
      {d.type === 'note' && (
        <p className="text-[11px] text-muted-foreground/90">{d.text}</p>
      )}
      {d.type === 'list' && (
        <div>
          {d.title && <div className="mb-1 text-[10px] font-medium text-foreground">{d.title}</div>}
          <ul className="space-y-0.5">
            {d.items.map((item, i) => (
              <li key={i} className="flex items-start gap-1.5 text-[11px] text-foreground/80">
                <span className="mt-1 size-1 shrink-0 rounded-full bg-orange-400" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {d.type === 'table' && (
        <div className="overflow-x-auto">
          {d.title && <div className="mb-1 text-[10px] font-medium text-foreground">{d.title}</div>}
          <table className="w-full border-separate border-spacing-0 text-[11px]">
            <thead>
              <tr>
                {d.columns.map((c, i) => (
                  <th key={i} className="border-b border-border px-2 py-1 text-left font-medium text-muted-foreground">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j} className="border-b border-border/40 px-2 py-1 font-mono text-[10px] text-foreground/80">
                      {String(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {d.type === 'chart' && (
        <MiniChart kind={d.kind} labels={d.labels} series={d.series} />
      )}
      {d.type === 'code' && (
        <pre className="scroll-thin max-h-64 overflow-auto rounded-md bg-black/40 p-2 font-mono text-[10px] text-emerald-100/90">
          <code>{d.code}</code>
        </pre>
      )}
      {d.type === 'mermaid' && <MermaidBlock source={d.source} title={d.title} />}
      {d.type === 'html' && <SandboxedArtifact html={d.html} />}
    </div>
  )
}

/* ==== Mini inline chart (bar/line, pure SVG) ==== */

function MiniChart({ kind, labels, series }: { kind: 'bar' | 'line'; labels: string[]; series: number[] }) {
  const max = Math.max(...series, 1)
  const w = 240
  const h = 80
  const points = series.map((v, i) => {
    const x = (i / Math.max(series.length - 1, 1)) * w
    const y = h - (v / max) * (h - 8)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-20 w-full max-w-[260px]">
        {kind === 'bar'
          ? series.map((v, i) => (
              <rect
                key={i}
                x={(i / Math.max(series.length, 1)) * w + 6}
                y={h - (v / max) * (h - 8)}
                width={w / Math.max(series.length, 1) - 12}
                height={(v / max) * (h - 8)}
                rx={2}
                fill="#f54e00"
                opacity={0.8}
              />
            ))
          : (
            <>
              <polyline points={points.join(' ')} fill="none" stroke="#f54e00" strokeWidth={1.5} />
              {series.map((v, i) => (
                <circle key={i} cx={(i / Math.max(series.length - 1, 1)) * w} cy={h - (v / max) * (h - 8)} r={2} fill="#f54e00" />
              ))}
            </>
          )}
      </svg>
      <div className="flex gap-1.5 overflow-x-auto">
        {labels.map((l, i) => (
          <span key={i} className="shrink-0 font-mono text-[9px] text-muted-foreground">{l}</span>
        ))}
      </div>
    </div>
  )
}

/* ==== Sandboxed iframe renderer (strict CSP, Artifacts pattern) ==== */

const SANDBOX_CSP = [
  "default-src 'none'",
  "style-src 'unsafe-inline'", // allow inline styles for agent markup, nothing else
  "img-src data:",
  "font-src 'none'",
  "script-src 'none'", // hard: agent HTML can never execute scripts
  "connect-src 'none'", // hard: no network from agent content
  "frame-src 'none'",
].join('; ')

export function SandboxedArtifact({ html, title }: { html: string; title?: string }) {
  const srcdoc = useMemo(
    () =>
      `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${SANDBOX_CSP}"><meta charset="utf-8"><style>body{font-family:ui-monospace,monospace;font-size:12px;color:#d6d3d1;background:#0f1115;padding:10px;margin:0}pre{white-space:pre-wrap}table{border-collapse:collapse}td,th{border:1px solid #333;padding:3px 6px}</style></head><body>${html}</body></html>`,
    [html],
  )
  return (
    <div className="overflow-hidden rounded-md border border-border/60">
      {title && (
        <div className="border-b border-border/60 bg-background/60 px-2 py-1 text-[9px] font-medium text-muted-foreground">
          {title} · sandboxed artifact
        </div>
      )}
      <iframe
        title={title ?? 'sandboxed artifact'}
        srcDoc={srcdoc}
        sandbox="" // no allow-scripts, no allow-same-origin — fully inert
        className="h-56 w-full bg-[#0f1115]"
      />
    </div>
  )
}

/* ==== Artifact card: static preview → make-live opt-in + version selector ==== */

export interface ArtifactVersion {
  id: string
  label: string
  descriptor: Descriptor
}

export function ArtifactCard({
  versions,
  initialVersion,
  makeLiveLabel = 'Make live',
}: {
  versions: ArtifactVersion[]
  initialVersion?: string
  makeLiveLabel?: string
}) {
  const [currentId, setCurrentId] = useState(initialVersion ?? versions[0]?.id ?? '')
  const [live, setLive] = useState(false)
  const current = versions.find((v) => v.id === currentId) ?? versions[0]
  if (!current) return null
  return (
    <div className="rounded-lg border border-border/70 bg-card/60">
      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-1.5">
        <span className="text-[10px] font-medium text-muted-foreground">Artifact</span>
        {versions.length > 1 && (
          <div className="flex items-center gap-1">
            {versions.map((v) => (
              <button
                key={v.id}
                onClick={() => {
                  setCurrentId(v.id)
                  setLive(false)
                }}
                className={cn(
                  'rounded border px-1.5 py-0.5 font-mono text-[9px] transition-colors',
                  v.id === currentId
                    ? 'border-orange-500/50 bg-orange-500/10 text-orange-300'
                    : 'border-border bg-background/40 text-muted-foreground hover:text-foreground',
                )}
              >
                {v.label}
              </button>
            ))}
          </div>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          {!live && (
            <Button
              size="sm"
              className="h-6 bg-orange-500 px-2 text-[10px] text-black hover:bg-orange-400"
              onClick={() => setLive(true)}
            >
              {makeLiveLabel}
            </Button>
          )}
          {live && (
            <Badge className="bg-emerald-500/15 text-[9px] text-emerald-300">
              ● live
            </Badge>
          )}
        </div>
      </div>
      <div className="p-3">
        {live ? (
          <DescriptorRenderer d={current.descriptor} />
        ) : (
          <StaticPreview d={current.descriptor} />
        )}
      </div>
    </div>
  )
}

/** Static (token-cheap) preview: text/labels only, no live render. */
function StaticPreview({ d }: { d: Descriptor }) {
  if (d.type === 'html') {
    return <p className="text-[10px] text-muted-foreground">HTML artifact — click “Make live” to render in the sandbox.</p>
  }
  if (d.type === 'mermaid') {
    return <p className="font-mono text-[10px] text-muted-foreground">Mermaid diagram — click “Make live” to render.</p>
  }
  if (d.type === 'metric') {
    return (
      <div className="flex items-baseline gap-2">
        <span className="text-[10px] uppercase text-muted-foreground">{d.label}</span>
        <span className="font-mono text-lg font-semibold text-foreground">{d.value}</span>
      </div>
    )
  }
  if (d.type === 'code') {
    return <pre className="line-clamp-3 overflow-hidden font-mono text-[10px] text-muted-foreground">{d.code}</pre>
  }
  if (d.type === 'list') {
    return <p className="text-[10px] text-muted-foreground">{d.items.length} items · “Make live” to render</p>
  }
  if (d.type === 'table') {
    return <p className="text-[10px] text-muted-foreground">{d.columns.length} columns · {d.rows.length} rows · “Make live” to render</p>
  }
  if (d.type === 'chart') {
    return <p className="text-[10px] text-muted-foreground">{d.kind} chart · {d.series.length} points · “Make live” to render</p>
  }
  return <p className="text-[10px] text-muted-foreground">{d.text}</p>
}

/* ==== Inline live Mermaid renderer ==== */

let mermaidPromise: Promise<typeof import('mermaid')> | null = null
function loadMermaid() {
  mermaidPromise ??= import('mermaid').then((m) => {
    m.default.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'strict' })
    return m
  })
  return mermaidPromise
}

/** Inline live Mermaid diagram (lazy-loaded; strict securityLevel). */
export function MermaidBlock({ source, title }: { source: string; title?: string }) {
  const [svg, setSvg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setSvg(null)
    setError(null)
    const id = `mermaid-${Math.random().toString(36).slice(2, 8)}`
    loadMermaid()
      .then(async (m) => {
        const { svg: rendered } = await m.default.render(id, source)
        if (alive) setSvg(rendered)
      })
      .catch((e: unknown) => {
        if (alive) setError(String(e))
      })
    return () => {
      alive = false
    }
  }, [source])

  if (error) {
    return (
      <div className="rounded border border-red-500/30 bg-red-500/5 p-2">
        <p className="font-mono text-[10px] text-red-300/90">Mermaid render failed</p>
        <pre className="mt-1 overflow-auto font-mono text-[9px] text-red-200/60">{source}</pre>
      </div>
    )
  }
  return (
    <div>
      {title && <div className="mb-1 text-[10px] font-medium text-muted-foreground">{title}</div>}
      {svg ? (
        <div className="overflow-x-auto rounded-md border border-border/50 bg-white/95 p-2" dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <div className="rounded border border-border/50 p-2 font-mono text-[9px] text-muted-foreground">rendering…</div>
      )}
    </div>
  )
}
