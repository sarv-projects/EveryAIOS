'use client'

import { useState } from 'react'
import {
  Folder,
  Pencil,
  BarChart3,
  Globe,
  FileText,
  Code2,
  FileDown,
  ChevronRight,
  ChevronDown,
  CheckCircle2,
  Loader2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

type EventKind = 'file' | 'edit' | 'browser' | 'shell' | 'code' | 'office' | 'export'

type Ev = {
  t: string
  icon: React.ReactNode
  kind: EventKind
  label: string
  status: 'done' | 'active'
  detail?: string
}

const FILTERS = ['All', 'File', 'Edit', 'Browser', 'Shell', 'Code', 'Office', 'Export'] as const

const EVENTS: Ev[] = [
  {
    t: '09:15:02',
    icon: <Folder className="h-3.5 w-3.5 text-orange-400" />,
    kind: 'file',
    label: 'Opened quarterly.xlsx',
    status: 'done',
  },
  {
    t: '09:15:04',
    icon: <Pencil className="h-3.5 w-3.5 text-blue-400" />,
    kind: 'edit',
    label: 'Updated B7:B12',
    status: 'done',
    detail: '6 cells · range B7:B12 · applied formula =SUM(B2:B5)',
  },
  {
    t: '09:15:08',
    icon: <BarChart3 className="h-3.5 w-3.5 text-emerald-400" />,
    kind: 'office',
    label: 'Regenerated chart',
    status: 'done',
    detail: 'Revenue trend chart · 4 series · embedded on Sheet1',
  },
  {
    t: '09:15:12',
    icon: <Globe className="h-3.5 w-3.5 text-sky-400" />,
    kind: 'browser',
    label: 'Searched Google for "Q3 industry benchmarks"',
    status: 'done',
    detail: 'Top 3 results captured · saved to /work/data/benchmarks.json',
  },
  {
    t: '09:15:15',
    icon: <FileText className="h-3.5 w-3.5 text-blue-400" />,
    kind: 'file',
    label: 'Opened report.docx',
    status: 'done',
  },
  {
    t: '09:15:18',
    icon: <Pencil className="h-3.5 w-3.5 text-blue-400" />,
    kind: 'edit',
    label: 'Wrote §3.2 paragraph',
    status: 'done',
    detail: '+Revenue grew 20% QoQ, reaching $1.8M driven by enterprise deals.\n−Revenue improved this quarter.',
  },
  {
    t: '09:15:22',
    icon: <Code2 className="h-3.5 w-3.5 text-purple-400" />,
    kind: 'shell',
    label: 'Ran `npm test`',
    status: 'done',
    detail: '42 passed ✓ · 0 failed · 3.2s',
  },
  {
    t: '09:15:25',
    icon: <FileDown className="h-3.5 w-3.5 text-red-400" />,
    kind: 'export',
    label: 'Exported report.pdf',
    status: 'active',
    detail: 'Building PDF · 2 of 8 pages rendered',
  },
]

export default function ProgressView() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('All')
  const [expanded, setExpanded] = useState<string | null>('09:15:22')

  const visible =
    filter === 'All'
      ? EVENTS
      : EVENTS.filter((e) => e.kind === filter.toLowerCase() || (filter === 'Office' && e.kind === 'office'))

  return (
    <div className="flex h-full w-full flex-col">
      <header className="border-b border-border px-4 py-2.5">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Progress</h2>
          <Badge variant="outline" className="text-[10px]">
            {EVENTS.filter((e) => e.status === 'done').length}/{EVENTS.length} done
          </Badge>
        </div>
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'rounded-full px-2 py-0.5 text-[10px] transition-colors',
                filter === f
                  ? 'bg-orange-500 text-black'
                  : 'bg-accent text-muted-foreground hover:text-foreground'
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </header>

      <ScrollArea className="scroll-thin min-h-0 flex-1">
        <div className="relative px-4 py-3">
          <div className="absolute bottom-4 left-[28px] top-4 w-px bg-border" />
          <div className="space-y-2.5">
            {visible.map((e) => {
              const isOpen = expanded === e.t
              return (
                <div key={e.t} className="relative pl-8">
                  <div
                    className={cn(
                      'absolute left-[22px] top-1 z-10 h-3 w-3 rounded-full border-2 border-background',
                      e.status === 'active'
                        ? 'bg-orange-500'
                        : 'bg-emerald-500'
                    )}
                  >
                    {e.status === 'active' && (
                      <span className="live-dot absolute inset-0 rounded-full bg-orange-500" />
                    )}
                  </div>
                  <div
                    className={cn(
                      'rounded-md border bg-card px-3 py-2',
                      e.status === 'active'
                        ? 'border-orange-500/40'
                        : 'border-border'
                    )}
                  >
                    <button
                      className="flex w-full items-center gap-2 text-left"
                      onClick={() => setExpanded(isOpen ? null : e.t)}
                    >
                      <span className="text-muted-foreground">{e.icon}</span>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {e.t}
                      </span>
                      <span className="flex-1 truncate text-xs text-foreground">
                        {e.label}
                      </span>
                      {e.detail ? (
                        isOpen ? (
                          <ChevronDown className="h-3 w-3 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-3 w-3 text-muted-foreground" />
                        )
                      ) : null}
                      {e.status === 'done' ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                      ) : (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-orange-500" />
                      )}
                    </button>
                    {isOpen && e.detail && (
                      <div className="mt-2 rounded bg-zinc-950/60 p-2 font-mono text-[10px] leading-relaxed text-muted-foreground shadow-inset-soft">
                        {e.detail.split('\n').map((line, i) => (
                          <div
                            key={i}
                            className={cn(
                              line.startsWith('+') && 'text-emerald-300',
                              line.startsWith('−') && 'text-red-300'
                            )}
                          >
                            {line}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}
