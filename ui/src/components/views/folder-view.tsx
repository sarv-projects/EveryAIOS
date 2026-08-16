'use client'

import { useState } from 'react'
import { Folder, FolderOpen, File, FileSpreadsheet, FileText, Presentation, ChevronRight, ChevronDown, HardDrive, Copy, AlertTriangle, Filter } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

type FileNode = { name: string; type: 'file' | 'folder'; ext?: 'xlsx' | 'docx' | 'pptx' | 'pdf' | 'other'; size?: string; modified?: boolean; open?: boolean; children?: FileNode[] }

const TREE: FileNode[] = [
  { name: 'Q3-Financials.xlsx', type: 'file', ext: 'xlsx', size: '2.1 MB', modified: true },
  { name: 'exec-summary.docx', type: 'file', ext: 'docx', size: '412 KB' },
  { name: 'pitch.pptx', type: 'file', ext: 'pptx', size: '8.4 MB' },
  { name: 'invoice-8402.pdf', type: 'file', ext: 'pdf', size: '94 KB' },
  { name: 'data', type: 'folder', open: true, children: [
    { name: 'raw-events.csv', type: 'file', ext: 'other', size: '18 MB' },
    { name: 'q3-benchmarks.json', type: 'file', ext: 'other', size: '56 KB' },
  ] },
  { name: 'src', type: 'folder', children: [{ name: 'pipeline.ts', type: 'file', ext: 'other', size: '8 KB' }] },
  { name: 'out', type: 'folder', children: [] },
]

const FILTERS = ['All', 'Recent', 'Modified', 'Large', 'Duplicates'] as const

const TREEMAP_BLOCKS = [
  { label: 'XLSX', size: '2.1M', color: 'bg-emerald-600/70', span: 'col-span-2 row-span-2' },
  { label: 'PPTX', size: '8.4M', color: 'bg-orange-500/70', span: 'col-span-3 row-span-2' },
  { label: 'CSV', size: '18M', color: 'bg-sky-500/70', span: 'col-span-3 row-span-3' },
  { label: 'DOCX', size: '412K', color: 'bg-blue-500/70', span: 'col-span-2 row-span-1' },
  { label: 'PDF', size: '94K', color: 'bg-red-500/70', span: 'col-span-1 row-span-1' },
  { label: 'JSON', size: '56K', color: 'bg-yellow-500/70', span: 'col-span-1 row-span-1' },
  { label: 'TS', size: '8K', color: 'bg-purple-500/70', span: 'col-span-1 row-span-1' },
  { label: 'free', size: '12G', color: 'bg-zinc-700/40', span: 'col-span-2 row-span-2' },
]

function FileIcon({ ext }: { ext?: FileNode['ext'] }) {
  const c = 'h-4 w-4 shrink-0'
  if (ext === 'xlsx') return <FileSpreadsheet className={cn(c, 'text-emerald-400')} />
  if (ext === 'docx') return <FileText className={cn(c, 'text-blue-400')} />
  if (ext === 'pptx') return <Presentation className={cn(c, 'text-orange-400')} />
  if (ext === 'pdf') return <FileText className={cn(c, 'text-red-400')} />
  return <File className={cn(c, 'text-muted-foreground')} />
}

function TreeRow({ node, depth }: { node: FileNode; depth: number }) {
  const [open, setOpen] = useState(!!node.open)
  const isFolder = node.type === 'folder'
  return (
    <div>
      <button
        className={cn(
          'flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-xs hover:bg-accent',
          node.modified && 'bg-orange-500/10'
        )}
        style={{ paddingLeft: depth * 12 + 6 }}
        onClick={() => isFolder && setOpen(!open)}
      >
        {isFolder ? (
          open ? (
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
          )
        ) : (
          <span className="w-3" />
        )}
        {isFolder ? (
          open ? (
            <FolderOpen className="h-4 w-4 text-orange-400" />
          ) : (
            <Folder className="h-4 w-4 text-orange-400" />
          )
        ) : (
          <FileIcon ext={node.ext} />
        )}
        <span
          className={cn(
            'flex-1 truncate',
            node.modified ? 'text-orange-300' : 'text-foreground'
          )}
        >
          {node.name}
        </span>
        {node.modified && <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />}
        {node.size && (
          <span className="font-mono text-[10px] text-muted-foreground">{node.size}</span>
        )}
      </button>
      {isFolder && open && node.children && (
        <div>
          {node.children.map((c) => (
            <TreeRow key={c.name} node={c} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  )
}

export default function FolderView() {
  const [active, setActive] = useState<(typeof FILTERS)[number]>('All')

  return (
    <div className="flex h-full w-full flex-col">
      <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
          <span className="text-orange-400">~</span>
          <ChevronRight className="h-3 w-3" />
          <span>work</span>
          <ChevronRight className="h-3 w-3" />
          <span className="font-medium text-foreground">q3-report</span>
        </div>
        <Badge variant="outline" className="gap-1 text-[10px]">
          <HardDrive className="h-3 w-3" /> 64 GB used
        </Badge>
      </header>

      <div className="flex items-center gap-1 border-b border-border px-3 py-1.5">
        <Filter className="mr-1 h-3 w-3 text-muted-foreground" />
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setActive(f)}
            className={cn(
              'rounded-full px-2.5 py-0.5 text-[11px] transition-colors',
              active === f
                ? 'bg-orange-500 text-black'
                : 'bg-accent text-muted-foreground hover:text-foreground'
            )}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1">
        <ScrollArea className="scroll-thin w-1/2 border-r border-border">
          <div className="p-2">
            {TREE.map((n) => (
              <TreeRow key={n.name} node={n} depth={0} />
            ))}
          </div>
        </ScrollArea>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="border-b border-border p-3">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-medium">
              <HardDrive className="h-3.5 w-3.5 text-orange-400" />
              Storage Health
            </div>
            <div className="mb-2 flex gap-1.5">
              <span className="flex-1 rounded bg-zinc-900 px-2 py-1 text-center">
                <span className="block text-[10px] text-muted-foreground">Used</span>
                <span className="font-mono text-xs text-orange-300">64.2 GB</span>
              </span>
              <span className="flex-1 rounded bg-zinc-900 px-2 py-1 text-center">
                <span className="block text-[10px] text-muted-foreground">Free</span>
                <span className="font-mono text-xs text-emerald-300">35.8 GB</span>
              </span>
            </div>
            <div className="grid h-2 overflow-hidden rounded-full bg-zinc-800">
              <div className="h-full w-[64%] bg-gradient-to-r from-orange-500 to-orange-400" />
            </div>
          </div>

          <div className="border-b border-border p-3">
            <div className="mb-2 text-xs font-medium">Treemap</div>
            <div className="grid grid-cols-6 grid-rows-4 gap-0.5">
              {TREEMAP_BLOCKS.map((b) => (
                <div
                  key={b.label}
                  className={cn(
                    'flex flex-col items-center justify-center rounded-sm text-[9px] font-medium text-white/90',
                    b.color,
                    b.span
                  )}
                >
                  <span className="font-mono">{b.label}</span>
                  <span className="opacity-70">{b.size}</span>
                </div>
              ))}
            </div>
          </div>

          <ScrollArea className="scroll-thin min-h-0 flex-1">
            <div className="space-y-2 p-3">
              <div className="text-xs font-medium">Duplicate Groups</div>
              {[
                { name: 'pipeline.ts', copies: 3, save: '12 KB' },
                { name: 'logo.png', copies: 2, save: '4.2 MB' },
              ].map((d) => (
                <div
                  key={d.name}
                  className="flex items-center gap-2 rounded border border-border bg-zinc-900/50 px-2 py-1.5"
                >
                  <Copy className="h-3.5 w-3.5 text-yellow-400" />
                  <span className="flex-1 truncate text-xs">{d.name}</span>
                  <Badge variant="secondary" className="text-[10px]">
                    {d.copies}x
                  </Badge>
                  <Badge variant="outline" className="text-[10px] text-emerald-300">
                    -{d.save}
                  </Badge>
                </div>
              ))}
              <div className="text-xs font-medium pt-1">Large Files</div>
              {[
                { name: 'raw-events.csv', size: '18 MB' },
                { name: 'pitch.pptx', size: '8.4 MB' },
              ].map((f) => (
                <div
                  key={f.name}
                  className="flex items-center gap-2 rounded border border-border bg-zinc-900/50 px-2 py-1.5"
                >
                  <AlertTriangle className="h-3.5 w-3.5 text-orange-400" />
                  <span className="flex-1 truncate text-xs">{f.name}</span>
                  <span className="font-mono text-[10px] text-muted-foreground">{f.size}</span>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  )
}
