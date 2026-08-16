'use client'

import { GitCompare, Check, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

type Row = { l?: number; r?: number; old?: string; new?: string; kind?: 'add' | 'del' | 'ctx' }

const ROWS: Row[] = [
  { l: 42, r: 42, old: '## Section 3.2 — Key Drivers', new: '## Section 3.2 — Key Drivers', kind: 'ctx' },
  { l: 43, r: 43, old: '', new: '', kind: 'ctx' },
  { l: 44, r: 44, old: 'Revenue improved this quarter.', new: '', kind: 'del' },
  { l: undefined, r: 45, new: 'Revenue grew 20% QoQ, reaching $1.8M driven by', kind: 'add' },
  { l: undefined, r: 46, new: 'enterprise deals across the EMEA and APAC regions.', kind: 'add' },
  { l: 45, r: 47, old: '', new: '', kind: 'ctx' },
  { l: 46, r: 48, old: 'Margin held steady.', new: 'Margin improved to 66% (from 61% in Q2).', kind: 'ctx' },
  { l: 47, r: 49, old: '', new: '', kind: 'ctx' },
  { l: 48, r: 50, old: 'Retention was good.', new: '', kind: 'del' },
  { l: undefined, r: 51, new: 'Customer retention remained above 92%.', kind: 'add' },
]

const MINIMAP = [
  { kind: 'ctx', h: 'h-2' },
  { kind: 'del', h: 'h-1.5' },
  { kind: 'add', h: 'h-2' },
  { kind: 'ctx', h: 'h-1.5' },
  { kind: 'ctx', h: 'h-2' },
  { kind: 'del', h: 'h-1.5' },
  { kind: 'add', h: 'h-1.5' },
]

export default function DiffView() {
  return (
    <div className="flex h-full w-full flex-col">
      <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <GitCompare className="h-4 w-4 text-orange-400" />
          <span className="text-sm font-semibold text-foreground">Diff</span>
          <span className="text-muted-foreground">—</span>
          <span className="font-mono text-xs text-foreground">exec-summary.docx</span>
          <Badge variant="outline" className="text-[10px]">
            §3.2
          </Badge>
        </div>
        <div className="flex items-center gap-2 font-mono text-[10px]">
          <Badge className="bg-emerald-500/20 text-[10px] text-emerald-300">+3</Badge>
          <Badge className="bg-red-500/20 text-[10px] text-red-300">−2</Badge>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1">
          <div className="grid grid-cols-2 border-b border-border bg-zinc-900/60 font-mono text-[10px] text-muted-foreground">
            <div className="border-r border-border px-3 py-1">
              <span className="text-red-300">● Old</span> (revision 7)
            </div>
            <div className="px-3 py-1">
              <span className="text-emerald-300">● New</span> (revision 8 · live)
            </div>
          </div>
          <ScrollArea className="scroll-thin min-h-0 flex-1">
            <div className="font-mono text-[12px] leading-relaxed">
              {ROWS.map((r, i) => (
                <div key={i} className="grid grid-cols-2">
                  <div
                    className={cn(
                      'flex min-h-[1.4rem] items-start gap-2 border-r border-border px-3 py-px',
                      r.kind === 'del' && 'bg-red-500/10',
                      r.kind === 'add' && 'bg-zinc-950/40 opacity-40',
                      r.kind === 'ctx' && 'bg-transparent'
                    )}
                  >
                    <span className="w-6 shrink-0 text-right text-[10px] text-muted-foreground/50">
                      {r.l ?? ''}
                    </span>
                    <span
                      className={cn(
                        'whitespace-pre-wrap text-foreground/90',
                        r.kind === 'del' && 'text-red-200/90 line-through decoration-red-500/40'
                      )}
                    >
                      {r.old}
                    </span>
                  </div>
                  <div
                    className={cn(
                      'flex min-h-[1.4rem] items-start gap-2 px-3 py-px',
                      r.kind === 'add' && 'bg-emerald-500/10',
                      r.kind === 'del' && 'bg-zinc-950/40 opacity-40',
                      r.kind === 'ctx' && 'bg-transparent'
                    )}
                  >
                    <span className="w-6 shrink-0 text-right text-[10px] text-muted-foreground/50">
                      {r.r ?? ''}
                    </span>
                    <span
                      className={cn(
                        'whitespace-pre-wrap',
                        r.kind === 'add' && 'text-emerald-100',
                        r.kind === 'ctx' && 'text-foreground/90'
                      )}
                    >
                      {r.kind === 'add' && <span className="text-emerald-500">+ </span>}
                      {r.new}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>

        <aside className="w-12 shrink-0 border-l border-border bg-zinc-900/40 p-1.5">
          <div className="mb-1 text-center font-mono text-[8px] text-muted-foreground">
            MAP
          </div>
          <div className="flex flex-col gap-0.5">
            {MINIMAP.map((m, i) => (
              <div
                key={i}
                className={cn(
                  'w-full rounded-sm',
                  m.h,
                  m.kind === 'add' && 'bg-emerald-500/60',
                  m.kind === 'del' && 'bg-red-500/60',
                  m.kind === 'ctx' && 'bg-zinc-700/60'
                )}
              />
            ))}
            <div className="mt-1 rounded border border-orange-500 bg-orange-500/10 px-0.5 py-0.5 text-center">
              <Check className="mx-auto h-2.5 w-2.5 text-emerald-400" />
            </div>
            <div className="rounded px-0.5 py-0.5 text-center">
              <X className="mx-auto h-2.5 w-2.5 text-muted-foreground" />
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
