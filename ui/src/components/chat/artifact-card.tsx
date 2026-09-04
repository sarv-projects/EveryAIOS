'use client'

import { useEffect, useState } from 'react'
import {
  Check,
  Code,
  Copy,
  Download,
  ExternalLink,
  File,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Loader2,
  MonitorSmartphone,
  Presentation,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useAppStore, type Artifact } from '@/lib/store'
import { cn } from '@/lib/utils'
import { preciseFigures } from '@/lib/plain-language'

const TYPE_ACCENT: Record<Artifact['type'], string> = {
  webapp: 'text-emerald-400',
  xlsx: 'text-emerald-400',
  docx: 'text-sky-300',
  pptx: 'text-orange-400',
  pdf: 'text-rose-400',
  code: 'text-violet-300',
  markdown: 'text-amber-300',
  image: 'text-fuchsia-300',
}

function TypeIcon({ type, className }: { type: Artifact['type']; className?: string }) {
  const cls = cn('h-3.5 w-3.5', TYPE_ACCENT[type], className)
  switch (type) {
    case 'xlsx':
      return <FileSpreadsheet className={cls} />
    case 'docx':
      return <FileText className={cls} />
    case 'pptx':
      return <Presentation className={cls} />
    case 'pdf':
      return <FileText className={cls} />
    case 'webapp':
      return <MonitorSmartphone className={cls} />
    case 'code':
      return <Code className={cls} />
    case 'image':
      return <ImageIcon className={cls} />
    default:
      return <File className={cls} />
  }
}

function Preview({ artifact }: { artifact: Artifact }) {
  const type = artifact.type
  switch (type) {
    case 'xlsx':
      return (
        <div className="grid grid-cols-4 gap-px overflow-hidden rounded border border-border bg-border">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className={cn(
                'h-4 bg-card px-1 font-mono text-[8px] leading-4',
                i === 5 && 'bg-orange-500/10 text-orange-300'
              )}
            >
              {i === 5 ? '1.8M' : ''}
            </div>
          ))}
        </div>
      )
    case 'docx':
      return (
        <div className="space-y-1.5">
          <div className="h-1.5 w-1/3 rounded-full bg-muted-foreground/40" />
          <div className="h-1.5 w-full rounded-full bg-muted-foreground/25" />
          <div className="h-1.5 w-5/6 rounded-full bg-muted-foreground/25" />
          <div className="h-1.5 w-4/5 rounded-full bg-muted-foreground/25" />
        </div>
      )
    case 'pptx':
      return (
        <div className="aspect-video w-full rounded border border-border bg-zinc-900/60 p-2">
          <div className="h-1.5 w-2/3 rounded-full bg-orange-400/80" />
          <div className="mt-1 h-1 w-1/2 rounded-full bg-muted-foreground/30" />
          <div className="mt-3 flex h-8 items-end gap-1">
            {[3, 5, 7, 5, 3].map((h, i) => (
              <div
                key={i}
                className="flex-1 rounded-t bg-gradient-to-t from-orange-600/70 to-orange-400/70"
                style={{ height: `${h * 12}%` }}
              />
            ))}
          </div>
        </div>
      )
    case 'pdf':
      return (
        <div className="space-y-1 rounded border border-border bg-zinc-100 p-2">
          <div className="h-1 w-1/2 rounded-full bg-zinc-800/60" />
          <div className="h-0.5 w-full rounded-full bg-zinc-400/60" />
          <div className="h-0.5 w-11/12 rounded-full bg-zinc-400/60" />
          <div className="h-0.5 w-10/12 rounded-full bg-zinc-400/60" />
          <div className="mt-1 inline-block rounded-sm bg-yellow-200 px-2 py-0.5 font-mono text-[8px] text-zinc-900">
            $1.80M
          </div>
        </div>
      )
    case 'code':
      return (
        <div className="rounded border border-border bg-zinc-950 p-2 font-mono text-[9px] leading-tight">
          <div>
            <span className="text-violet-300">const</span>{' '}
            <span className="text-sky-300">rev</span>{' '}
            <span className="text-muted-foreground">=</span>{' '}
            <span className="text-emerald-300">1_800_000</span>
          </div>
          <div>
            <span className="text-violet-300">return</span>{' '}
            <span className="text-sky-300">rev</span>{' '}
            <span className="text-muted-foreground">*</span>{' '}
            <span className="text-emerald-300">1.2</span>
          </div>
        </div>
      )
    case 'markdown':
      return (
        <div className="space-y-1">
          <div className="h-2 w-1/2 rounded bg-foreground/70" />
          <div className="h-1 w-full rounded bg-muted-foreground/30" />
          <div className="h-1 w-3/4 rounded bg-muted-foreground/30" />
        </div>
      )
    case 'image':
      return (
        <div className="aspect-video w-full rounded bg-gradient-to-br from-fuchsia-500/40 via-orange-500/30 to-amber-500/40" />
      )
    case 'webapp':
      return (
        <div className="relative aspect-video w-full overflow-hidden rounded border border-border bg-zinc-950">
          <div className="absolute inset-x-0 top-0 flex h-4 items-center gap-1 border-b border-border/60 px-1.5">
            <span className="size-1 rounded-full bg-red-400/70" />
            <span className="size-1 rounded-full bg-amber-400/70" />
            <span className="size-1 rounded-full bg-emerald-400/70" />
          </div>
          <div className="flex h-full items-center justify-center pt-3 text-[9px] text-emerald-300/80">
            <MonitorSmartphone className="mr-1 h-3 w-3" />
            live on 127.0.0.1:{artifact.server?.port ?? '…'}
          </div>
        </div>
      )
    default:
      return null
  }
}

interface Props {
  artifact: Artifact
}

export default function ArtifactCard({ artifact }: Props) {
  const activeView = useAppStore((s) => s.activeView)
  const setActiveView = useAppStore((s) => s.setActiveView)
  const notify = useAppStore((s) => s.notify)
  const isLive = artifact.view && artifact.view === activeView

  const openArtifact = () => {
    const p = artifact.path ?? artifact.preview ?? artifact.name
    if (/\.(xlsx|xlsm|docx|pptx|pdf)$/i.test(p) || /\.(xlsx|xlsm|docx|pptx|pdf)$/i.test(artifact.name)) {
      const file = /\.(xlsx|xlsm|docx|pptx|pdf)$/i.test(p) ? p : artifact.name
      useAppStore.getState().openOfficeDoc(file)
      return
    }
    if (artifact.view) {
      setActiveView(artifact.view)
      return
    }
    notify(`No viewer for “${artifact.name}” yet — use Save to download it`, 'error')
  }

  return (
    <Card
      onClick={() => openArtifact()}
      className="group cursor-pointer gap-0 overflow-hidden border-border bg-card/60 p-0 transition-colors hover:border-orange-500/40"
    >
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <TypeIcon type={artifact.type} />
          <span className="truncate font-mono text-xs text-foreground">{artifact.name}</span>
        </div>
        {isLive && (
          <Badge
            variant="outline"
            className="gap-1 border-orange-500/40 bg-orange-500/10 text-[10px] text-orange-300"
          >
            <span className="live-dot h-1.5 w-1.5 rounded-full bg-orange-500" />
            Live
          </Badge>
        )}
        {/* P32.3 — precise numbers in outputs (competence via precision). */}
        <Badge
          variant="outline"
          className="ml-auto shrink-0 border-emerald-500/30 bg-emerald-500/5 font-mono text-[9px] text-emerald-300"
          title="Exact figures from this run's receipt"
        >
          {preciseFigures(artifact).join(' · ')}
        </Badge>
      </div>

      <div className="px-3 pt-2.5 pb-3">
        <Preview artifact={artifact} />
        <p className="mt-2 truncate font-mono text-[10px] text-muted-foreground">
          {artifact.preview}
        </p>

        {/* P15-H29 — inline artifact action checklist (bolt.diy Artifact.tsx
            pattern): auto-expands while any action is running, collapses to
            a progress line when everything is terminal. */}
        {artifact.actions && artifact.actions.length > 0 && (
          <div className="mt-2 border-t border-border pt-2">
            <ActionChecklist
              key={artifact.id}
              actions={artifact.actions}
              running={
                artifact.actions.some((a) => a.state === 'running' || a.state === 'pending')
              }
            />
          </div>
        )}

        <div className="mt-2.5 flex items-center gap-1 border-t border-border pt-2">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation()
              const src = artifact.path ?? artifact.preview
              void navigator.clipboard
                ?.writeText(src)
                .then(() => notify('Artifact reference copied'))
                .catch(() => notify('Copy failed — clipboard unavailable', 'error'))
            }}
          >
            <Code className="h-3 w-3" />
            Source
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation()
              void navigator.clipboard
                ?.writeText(artifact.preview)
                .then(() => notify('Copied to clipboard'))
                .catch(() => notify('Copy failed — clipboard unavailable', 'error'))
            }}
          >
            <Copy className="h-3 w-3" />
            Copy
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation()
              const blob = new Blob([artifact.preview], { type: 'text/plain' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = artifact.name.replace(/[^\w\-. ]+/g, '').trim() || 'artifact.txt'
              a.click()
              URL.revokeObjectURL(url)
              notify('Artifact saved')
            }}
          >
            <Download className="h-3 w-3" />
            Save
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto h-7 gap-1 px-2 text-[11px] text-orange-300 hover:text-orange-200"
            onClick={(e) => {
              e.stopPropagation()
              openArtifact()
            }}
          >
            Open
            <ExternalLink className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </Card>
  )
}

/* ---- P15-H29 inline action checklist ---- */

function ActionChecklist({
  actions,
  running,
}: {
  actions: NonNullable<Artifact['actions']>
  running: boolean
}) {
  const done = actions.filter((a) => a.state === 'complete').length
  const failed = actions.filter((a) => a.state === 'failed').length
  // Auto-expand while running; collapse to a one-line progress summary once
  // everything is terminal (bolt.diy Artifact.tsx behavior).
  const [expanded, setExpanded] = useState(running)
  useEffect(() => {
    if (running) setExpanded(true)
  }, [running])

  return (
    <div className="rounded-md border border-border/70 bg-background/40">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left"
      >
        {running ? (
          <Loader2 className="h-3 w-3 animate-spin text-orange-400" />
        ) : failed > 0 ? (
          <X className="h-3 w-3 text-rose-400" />
        ) : (
          <Check className="h-3 w-3 text-emerald-400" />
        )}
        <span className="text-[10px] font-medium text-foreground">
          Actions {done}/{actions.length}
        </span>
        {failed > 0 && (
          <span className="text-[10px] text-rose-400">{failed} failed</span>
        )}
        <span className="ml-auto font-mono text-[9px] text-muted-foreground">
          {expanded ? '−' : '+'}
        </span>
      </button>
      {expanded && (
        <ol className="space-y-0.5 border-t border-border/70 px-2.5 py-1.5">
          {actions.map((a) => (
            <li key={a.index} className="flex items-center gap-2 text-[10px]">
              <span
                className={cn(
                  'flex size-3.5 shrink-0 items-center justify-center rounded-full border',
                  a.state === 'complete' && 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400',
                  a.state === 'running' && 'border-orange-500/40 bg-orange-500/10 text-orange-300',
                  a.state === 'failed' && 'border-rose-500/40 bg-rose-500/10 text-rose-400',
                  a.state === 'aborted' && 'border-muted-foreground/40 text-muted-foreground',
                  a.state === 'pending' && 'border-muted-foreground/30 text-muted-foreground/50'
                )}
              >
                {a.state === 'complete' && <Check className="h-2 w-2" />}
                {a.state === 'running' && <Loader2 className="h-2 w-2 animate-spin" />}
                {a.state === 'failed' && <X className="h-2 w-2" />}
                {a.state === 'aborted' && <X className="h-2 w-2" />}
              </span>
              <span
                className={cn(
                  'truncate font-mono',
                  a.state === 'failed' ? 'text-rose-300/90' : 'text-foreground/80',
                  a.state === 'pending' && 'text-muted-foreground/60'
                )}
              >
                {a.label}
              </span>
              {a.state === 'failed' && a.formatted && (
                <span className="ml-auto shrink-0 font-mono text-[9px] text-rose-400/80">
                  {a.formatted}
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
