'use client'

// Office hold lift (P33.1 — office files as tabs): a per-file tab strip for
// every opened file of the current kind. Opening a second .xlsx/.docx/.pptx/
// .pdf adds a tab; clicking switches the active file (the view reloads it);
// × closes it and falls back to the most recent remaining file. The tab
// architecture keeps one view per kind — these are file tabs *within* that
// view (the cross-kind tab strip is the openViews system).
import { FileText, X } from 'lucide-react'
import { useAppStore, type ViewId } from '@/lib/store'
import { cn } from '@/lib/utils'

export default function OfficeFileSwitcher({
  view,
  current,
  onOpen,
}: {
  view: ViewId
  current?: string | null
  onOpen: (path: string) => void
}) {
  // Do not `?? []` in the selector — a fresh [] every time is never
  // referentially equal, so zustand re-renders forever (white screen).
  const history = useAppStore((s) => s.officeHistory[view])
  const closeOfficeDoc = useAppStore((s) => s.closeOfficeDoc)
  if (!history || history.length === 0) return null

  const fileName = (p: string) => p.split(/[\\/]/).pop() ?? p

  return (
    <div className="scroll-thin flex items-center gap-1 overflow-x-auto border-b border-border bg-zinc-900/60 px-2 py-1">
      <FileText className="h-3 w-3 shrink-0 text-muted-foreground" />
      {history.map((p) => {
        const active = p === current
        return (
          <span
            key={p}
            className={cn(
              'group flex h-6 shrink-0 items-center gap-1 rounded border px-2 font-mono text-[10px] transition-colors',
              active
                ? 'border-orange-500/50 bg-orange-500/10 text-foreground'
                : 'border-border bg-zinc-950/40 text-muted-foreground hover:border-muted-foreground/50 hover:text-foreground',
            )}
          >
            <button
              className="max-w-[140px] truncate"
              title={p}
              onClick={() => {
                if (!active) onOpen(p)
              }}
            >
              {fileName(p)}
            </button>
            <button
              aria-label={`Close ${fileName(p)}`}
              className="rounded p-0.5 text-muted-foreground/60 hover:bg-red-500/15 hover:text-red-400"
              onClick={() => {
                closeOfficeDoc(view, p)
                // Fall back to the previous file when the active tab closes.
                if (active) {
                  const remaining = history.filter((x) => x !== p)
                  const fallback = remaining[0]
                  if (fallback) onOpen(fallback)
                }
              }}
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </span>
        )
      })}
    </div>
  )
}
