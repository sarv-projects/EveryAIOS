'use client'

import { useEffect, useState } from 'react'
import { HardDrive, Copy, AlertTriangle, FileSearch, GitCompare, Trash2, Battery, RefreshCw, Moon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/lib/store'
import {
  storageHealth,
  storageScan,
  storageLargeFiles,
  storageDuplicates,
  bytes,
  type StorageHealth,
  type TreemapRect,
  type LargeFile,
  type DupGroup,
} from '@/lib/storage'

/** P30.15 — dream-diary card: visible memory consolidation over the C-series. */
function DreamDiaryCard() {
  const dreamDiary = useAppStore((s) => s.dreamDiary)
  if (dreamDiary.length === 0) return null
  const [latest] = dreamDiary
  return (
    <div className="rounded-lg border border-violet-500/30 bg-violet-500/5 p-3">
      <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-violet-300">
        <Moon className="h-3.5 w-3.5" />
        Dream diary
        <span className="font-mono text-[9px] text-muted-foreground">
          {dreamDiary.length} run{dreamDiary.length === 1 ? '' : 's'}
        </span>
      </div>
      {latest && (
        <div className="text-[11px] text-foreground/90">{latest.brief}</div>
      )}
      {dreamDiary.slice(1, 4).map((e) => (
        <div key={e.id} className="mt-1 truncate text-[10px] text-muted-foreground/80">
          {e.headline}
        </div>
      ))}
    </div>
  )
}

function treemapColor(c: [number, number, number] | undefined): string {
  if (!c) return 'bg-zinc-700/70'
  const [r, g, b] = c
  return `rgb(${r}, ${g}, ${b})`
}

export default function StorageView() {
  const notify = useAppStore((s) => s.notify)
  const [health, setHealth] = useState<StorageHealth | null>(null)
  const [treemap, setTreemap] = useState<TreemapRect[]>([])
  const [deferred, setDeferred] = useState(false)
  const [large, setLarge] = useState<LargeFile[]>([])
  const [dups, setDups] = useState<DupGroup[]>([])
  const [loading, setLoading] = useState(false)

  async function refresh() {
    setLoading(true)
    try {
      const [h, scan, lf, dg] = await Promise.all([
        storageHealth(),
        storageScan(),
        storageLargeFiles(),
        storageDuplicates(),
      ])
      setHealth(h)
      setDeferred(scan.deferred)
      setTreemap(scan.treemap)
      setLarge(lf)
      setDups(dg)
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Storage scan failed')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const reclaimable = dups.reduce((sum, d) => sum + d.wastedBytes, 0)

  return (
    <div className="flex h-full w-full flex-col">
      <header className="border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <HardDrive className="h-4 w-4 text-orange-400" />
          <h2 className="text-sm font-semibold text-foreground">Storage</h2>
          <div className="flex flex-wrap gap-1">
            <Badge variant="secondary" className="text-[9px]">treemap</Badge>
            <Badge variant="secondary" className="text-[9px]">duplicate-group</Badge>
            <Badge variant="secondary" className="text-[9px]">large-file finder</Badge>
          </div>
          {health?.battery && (
            <Badge variant="outline" className="ml-auto text-[9px] text-amber-300">
              <Battery className="h-3 w-3" /> on battery — heavy scans deferred
            </Badge>
          )}
          <Button
            size="icon"
            variant="ghost"
            className="ml-auto h-7 w-7"
            onClick={() => void refresh()}
            title="Rescan"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          </Button>
        </div>
      </header>

      <ScrollArea className="scroll-thin min-h-0 flex-1">
        <div className="space-y-4 p-4">
          {/* P30.15 — visible memory consolidation: the dream diary. */}
          <DreamDiaryCard />

          {deferred && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-[11px] text-amber-300">
              <Battery className="mb-1 h-3.5 w-3.5" />
              Heavy scans are suppressed while the device is on battery (J16).
              Drive health remains live.
            </div>
          )}

          {health && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="hover-lift rounded-lg border border-border bg-card p-3">
                <div className="text-[10px] text-muted-foreground">Total</div>
                <div className="font-mono text-lg font-semibold">{bytes(health.totalBytes)}</div>
              </div>
              <div className="hover-lift rounded-lg border border-border bg-card p-3">
                <div className="text-[10px] text-muted-foreground">Used</div>
                <div className="font-mono text-lg font-semibold text-orange-300">
                  {bytes(health.usedBytes)}
                </div>
              </div>
              <div className="hover-lift rounded-lg border border-border bg-card p-3">
                <div className="text-[10px] text-muted-foreground">Free</div>
                <div className="font-mono text-lg font-semibold text-emerald-300">
                  {bytes(health.availableBytes)}
                </div>
              </div>
              <div className="hover-lift rounded-lg border border-border bg-card p-3">
                <div className="text-[10px] text-muted-foreground">Usage</div>
                <div className={cn('font-mono text-lg font-semibold', health.overThreshold ? 'text-red-400' : 'text-sky-300')}>
                  {health.usedPct.toFixed(1)}%
                </div>
              </div>
            </div>
          )}

          <div>
            <div className="mb-2 flex items-center gap-1.5 text-xs font-medium">
              <FileSearch className="h-3.5 w-3.5 text-orange-400" />
              Squarified Treemap
              {treemap.length > 0 && (
                <span className="font-mono text-[10px] text-muted-foreground">
                  {treemap.length} entries
                </span>
              )}
            </div>
            {treemap.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-4 text-center text-[11px] text-muted-foreground">
                {deferred ? 'Scan deferred while on battery' : 'No files scanned yet'}
              </div>
            ) : (
              <div className="grid grid-cols-7 grid-rows-5 gap-0.5">
                {treemap.slice(0, 35).map((b) => (
                  <div
                    key={b.id}
                    className="treemap-morph flex flex-col justify-end overflow-hidden rounded-sm p-1.5 hover:brightness-110"
                    style={{ background: treemapColor(b.color) }}
                  >
                    <div className="truncate font-mono text-[10px] text-white/90">{b.name}</div>
                    <div className="font-mono text-[9px] text-white/60">{bytes(b.size)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="mb-2 flex items-center gap-1.5 text-xs font-medium">
              <Copy className="h-3.5 w-3.5 text-yellow-400" />
              Duplicate Groups
              <Badge variant="outline" className="ml-1 text-[9px]">
                {dups.length} groups · {bytes(reclaimable)} reclaimable
              </Badge>
            </div>
            <div className="space-y-2">
              {dups.length === 0 ? (
                <div className="rounded-md border border-dashed border-border p-4 text-center text-[11px] text-muted-foreground">
                  No duplicates found
                </div>
              ) : (
                dups.map((d, gi) => (
                  <div key={gi} className="rounded-lg border border-border bg-card p-3">
                    <div className="flex items-center gap-2">
                      <Copy className="h-3.5 w-3.5 text-yellow-400" />
                      <span className="flex-1 truncate font-mono text-xs text-foreground">
                        {d.files[0]?.split('/').pop() ?? 'group'}
                      </span>
                      <Badge variant="secondary" className="text-[9px]">{d.copies} copies</Badge>
                      <Badge variant="outline" className="text-[9px] text-emerald-300">
                        −{bytes(d.wastedBytes)}
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
                ))
              )}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center gap-1.5 text-xs font-medium">
              <AlertTriangle className="h-3.5 w-3.5 text-orange-400" />
              Large File Finder
            </div>
            <div className="space-y-1">
              {large.length === 0 ? (
                <div className="rounded-md border border-dashed border-border p-4 text-center text-[11px] text-muted-foreground">
                  {deferred ? 'Scan deferred while on battery' : 'No large files'}
                </div>
              ) : (
                large.map((f) => (
                  <div
                    key={f.path}
                    className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5"
                  >
                    <AlertTriangle className="h-3 w-3 text-orange-400" />
                    <span className="flex-1 truncate font-mono text-xs text-foreground">{f.name}</span>
                    <span className="truncate font-mono text-[10px] text-muted-foreground">{f.path}</span>
                    <span className="font-mono text-[10px] text-orange-300">{bytes(f.size)}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-lg border border-orange-500/40 bg-orange-500/5 p-3">
            <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-orange-300">
              <Trash2 className="h-3.5 w-3.5" />
              Cleanup Plan · Guard-2
            </div>
            <p className="mb-3 text-[11px] text-muted-foreground">
              {dups.length > 0 ? (
                <>Plan removes <span className="text-orange-300">{dups.length} duplicate group(s)</span>, reclaiming{' '}
                  <span className="text-emerald-300">{bytes(reclaimable)}</span>. All changes are reversible via revision log.</>
              ) : (
                <>No cleanup candidates. The storage engine only ever proposes — deletion always goes through a Guard-2 ticket.</>
              )}
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="default"
                className="bg-orange-500 text-black hover:bg-orange-400"
                onClick={() => notify(`Cleanup proposals are Guard-2 ticketed — ${bytes(reclaimable)} reclaimable`)}
              >
                <GitCompare className="h-3 w-3" />
                Review diff
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => notify('Kept all files — no changes made')}
              >
                Keep all
              </Button>
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}
