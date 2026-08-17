'use client'

import { HardDrive, Copy, AlertTriangle, FileSearch, GitCompare, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

const TREEMAP = [
  { label: 'raw-events.csv', size: '18 MB', color: 'bg-sky-500/80', span: 'col-span-4 row-span-3' },
  { label: 'pitch.pptx', size: '8.4 MB', color: 'bg-orange-500/70', span: 'col-span-3 row-span-2' },
  { label: 'Q3-Financials.xlsx', size: '2.1 MB', color: 'bg-emerald-600/70', span: 'col-span-2 row-span-2' },
  { label: 'logo.png', size: '4.2 MB', color: 'bg-purple-500/70', span: 'col-span-2 row-span-2' },
  { label: 'exec-summary.docx', size: '412 KB', color: 'bg-blue-500/70', span: 'col-span-2 row-span-1' },
  { label: 'invoice-8402.pdf', size: '94 KB', color: 'bg-red-500/70', span: 'col-span-1 row-span-1' },
  { label: 'pipeline.ts', size: '8 KB', color: 'bg-yellow-500/70', span: 'col-span-1 row-span-1' },
  { label: 'free', size: '35 GB', color: 'bg-zinc-800/60', span: 'col-span-3 row-span-1' },
]

const STATS = [
  { label: 'Total', value: '100 GB', tone: 'text-foreground' },
  { label: 'Used', value: '64.2 GB', tone: 'text-orange-300' },
  { label: 'Free', value: '35.8 GB', tone: 'text-emerald-300' },
  { label: 'Largest', value: '18 MB', tone: 'text-sky-300' },
]

const DUP_GROUPS = [
  { name: 'pipeline.ts', copies: 3, save: '12 KB', files: ['src/pipeline.ts', 'out/pipeline.ts', 'data/pipeline.ts'] },
  { name: 'logo.png', copies: 2, save: '4.2 MB', files: ['assets/logo.png', 'public/logo.png'] },
  { name: 'config.json', copies: 2, save: '2 KB', files: ['config.json', '.cache/config.json'] },
]

export default function StorageView() {
  return (
    <div className="flex h-full w-full flex-col">
      <header className="border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <HardDrive className="h-4 w-4 text-orange-400" />
          <h2 className="text-sm font-semibold text-foreground">Storage</h2>
          <div className="flex flex-wrap gap-1">
            <Badge variant="secondary" className="text-[9px]">
              treemap
            </Badge>
            <Badge variant="secondary" className="text-[9px]">
              duplicate-group
            </Badge>
            <Badge variant="secondary" className="text-[9px]">
              large-file finder
            </Badge>
          </div>
        </div>
      </header>

      <ScrollArea className="scroll-thin min-h-0 flex-1">
        <div className="space-y-4 p-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {STATS.map((s) => (
              <div key={s.label} className="hover-lift rounded-lg border border-border bg-card p-3">
                <div className="text-[10px] text-muted-foreground">{s.label}</div>
                <div className={cn('font-mono text-lg font-semibold', s.tone)}>{s.value}</div>
              </div>
            ))}
          </div>

          <div>
            <div className="mb-2 flex items-center gap-1.5 text-xs font-medium">
              <FileSearch className="h-3.5 w-3.5 text-orange-400" />
              Squarified Treemap
            </div>
            <div className="grid grid-cols-7 grid-rows-5 gap-0.5">
              {TREEMAP.map((b) => (
                <div
                  key={b.label}
                  className={cn(
                    'treemap-morph flex flex-col justify-end overflow-hidden rounded-sm p-1.5 hover:brightness-110',
                    b.color,
                    b.span
                  )}
                >
                  <div className="truncate font-mono text-[10px] text-white/90">{b.label}</div>
                  <div className="font-mono text-[9px] text-white/60">{b.size}</div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center gap-1.5 text-xs font-medium">
              <Copy className="h-3.5 w-3.5 text-yellow-400" />
              Duplicate Groups
              <Badge variant="outline" className="ml-1 text-[9px]">
                {DUP_GROUPS.length} groups · 4.2 MB reclaimable
              </Badge>
            </div>
            <div className="space-y-2">
              {DUP_GROUPS.map((d) => (
                <div
                  key={d.name}
                  className="rounded-lg border border-border bg-card p-3"
                >
                  <div className="flex items-center gap-2">
                    <Copy className="h-3.5 w-3.5 text-yellow-400" />
                    <span className="flex-1 font-mono text-xs text-foreground">{d.name}</span>
                    <Badge variant="secondary" className="text-[9px]">
                      {d.copies} copies
                    </Badge>
                    <Badge
                      variant="outline"
                      className="text-[9px] text-emerald-300"
                    >
                      −{d.save}
                    </Badge>
                  </div>
                  <div className="mt-2 space-y-0.5 font-mono text-[10px] text-muted-foreground">
                    {d.files.map((f, i) => (
                      <div key={f} className="flex items-center gap-1.5">
                        <span className="text-zinc-600">{i + 1}.</span>
                        <span className="truncate">{f}</span>
                        {i === d.files.length - 1 && (
                          <span className="ml-auto text-orange-300">keep</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center gap-1.5 text-xs font-medium">
              <AlertTriangle className="h-3.5 w-3.5 text-orange-400" />
              Large File Finder
            </div>
            <div className="space-y-1">
              {[
                { name: 'raw-events.csv', size: '18 MB', path: 'data/raw-events.csv' },
                { name: 'pitch.pptx', size: '8.4 MB', path: 'pitch.pptx' },
                { name: 'logo.png', size: '4.2 MB', path: 'assets/logo.png' },
              ].map((f) => (
                <div
                  key={f.path}
                  className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5"
                >
                  <AlertTriangle className="h-3 w-3 text-orange-400" />
                  <span className="flex-1 truncate font-mono text-xs text-foreground">
                    {f.name}
                  </span>
                  <span className="truncate font-mono text-[10px] text-muted-foreground">
                    {f.path}
                  </span>
                  <span className="font-mono text-[10px] text-orange-300">{f.size}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-orange-500/40 bg-orange-500/5 p-3">
            <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-orange-300">
              <Trash2 className="h-3.5 w-3.5" />
              Cleanup Plan · Guard-2
            </div>
            <p className="mb-3 text-[11px] text-muted-foreground">
              Plan removes 5 duplicate files and 1 stale cache, reclaiming{' '}
              <span className="text-emerald-300">4.21 MB</span>. All changes are reversible
              via revision log.
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="default" className="bg-orange-500 text-black hover:bg-orange-400">
                <GitCompare className="h-3 w-3" />
                Review diff
              </Button>
              <Button size="sm" variant="outline">
                Keep all
              </Button>
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}
