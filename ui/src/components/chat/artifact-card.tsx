'use client'

import {
  Code,
  Copy,
  Download,
  ExternalLink,
  File,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Presentation,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useAppStore, type Artifact } from '@/lib/store'
import { cn } from '@/lib/utils'

function TypeIcon({ type, className }: { type: Artifact['type']; className?: string }) {
  const cls = cn('h-3.5 w-3.5', className)
  switch (type) {
    case 'xlsx':
      return <FileSpreadsheet className={cls} />
    case 'docx':
      return <FileText className={cls} />
    case 'pptx':
      return <Presentation className={cls} />
    case 'pdf':
      return <FileText className={cls} />
    case 'code':
      return <Code className={cls} />
    case 'image':
      return <ImageIcon className={cls} />
    default:
      return <File className={cls} />
  }
}

function TypeAccent({ type }: { type: Artifact['type'] }) {
  const map: Record<Artifact['type'], string> = {
    xlsx: 'text-emerald-400',
    docx: 'text-sky-300',
    pptx: 'text-orange-400',
    pdf: 'text-rose-400',
    code: 'text-violet-300',
    markdown: 'text-amber-300',
    image: 'text-fuchsia-300',
  }
  return <span className={map[type]} />
}

function Preview({ type }: { type: Artifact['type'] }) {
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

  return (
    <Card
      onClick={() => artifact.view && setActiveView(artifact.view)}
      className="group cursor-pointer gap-0 overflow-hidden border-border bg-card/60 p-0 transition-colors hover:border-orange-500/40"
    >
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <TypeAccent type={artifact.type} />
          <TypeIcon type={artifact.type} className="h-3.5 w-3.5 text-muted-foreground" />
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
      </div>

      <div className="px-3 pt-2.5 pb-3">
        <Preview type={artifact.type} />
        <p className="mt-2 truncate font-mono text-[10px] text-muted-foreground">
          {artifact.preview}
        </p>

        <div className="mt-2.5 flex items-center gap-1 border-t border-border pt-2">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation()
              notify('Viewing source')
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
              notify('Copied to clipboard')
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
              notify('Download started')
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
              if (artifact.view) setActiveView(artifact.view)
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
