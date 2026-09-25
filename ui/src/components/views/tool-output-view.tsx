'use client'

import { useMemo, useState } from 'react'
import { Check, Copy, Database, FileTerminal, WrapText } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { useAppStore } from '@/lib/store'
import { estimateTokens } from '@/components/chat/tool-chip'
import { cn } from '@/lib/utils'

/** Max rendered lines — the note below the list always says when output was
 * longer, so a truncated render is never a silent partial view. */
const RENDER_LINE_CAP = 2000

function shortKind(toolId: string): string {
  const word =
    toolId.toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(/\s+/).find(Boolean) ?? 'task'
  return word.charAt(0).toUpperCase() + word.slice(1)
}

/**
 * The dedicated right-rail viewer for spooled tool output. A spooled blob
 * card in the chat drawer (`tool-chip.tsx`) opens the full cleaned result
 * here via `openSpooledOutput` — stats + search + line numbers over a styled
 * scrollable list. A plain scrollable render is deliberate: this surface is
 * read-only log inspection, so the editable Monaco workbench (file-bound,
 * ticketed saves) would be the wrong tool. The inline drawer expand stays as
 * the fallback when the rail is unavailable. Layout is CLS-safe: the header
 * has a reserved minimum height and the list fills the remaining flex space.
 */
export default function ToolOutputView() {
  const spooled = useAppStore((s) => s.spooledOutput)
  const notify = useAppStore((s) => s.notify)
  const [query, setQuery] = useState('')
  const [wrap, setWrap] = useState(true)
  const [copied, setCopied] = useState(false)

  const stats = useMemo(() => {
    if (!spooled) return null
    return {
      tokens: estimateTokens(spooled.text),
      lines: spooled.text.split('\n').length,
      chars: spooled.text.length,
    }
  }, [spooled])

  const rows = useMemo(() => {
    if (!spooled) return []
    const lines = spooled.text.split('\n')
    const q = query.trim().toLowerCase()
    const out: { no: number; text: string }[] = []
    for (let i = 0; i < lines.length; i++) {
      const text = lines[i] ?? ''
      if (q && !text.toLowerCase().includes(q)) continue
      out.push({ no: i + 1, text })
    }
    return out
  }, [spooled, query])

  const truncated = spooled !== null && rows.length > RENDER_LINE_CAP
  const visible = truncated ? rows.slice(0, RENDER_LINE_CAP) : rows

  if (!spooled || !stats) {
    return (
      <div className="flex h-full min-h-[240px] flex-col">
        <div className="flex min-h-[52px] shrink-0 items-center gap-2 border-b border-border px-4 py-2">
          <FileTerminal className="h-3.5 w-3.5 text-brand" />
          <span className="text-xs font-medium text-foreground">Tool output</span>
        </div>
        <EmptyState
          icon={FileTerminal}
          title="No tool output open"
          description="Results over ~2,000 tokens show a spooled card in the chat — use Inspect in Right Rail there to read the full output here."
        />
      </div>
    )
  }

  const copyAll = () => {
    navigator.clipboard?.writeText(spooled.text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
    notify('Full tool output copied')
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background" data-testid="tool-output-view">
      {/* Reserved-height header — stats + controls never shift the list. */}
      <header className="min-h-[52px] shrink-0 border-b border-border px-4 py-2">
        <div className="flex items-center gap-2">
          <FileTerminal className="h-3.5 w-3.5 shrink-0 text-brand" />
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
            {shortKind(spooled.toolId)} output
          </span>
          <span
            className={cn(
              'shrink-0 rounded-full border px-1.5 py-px font-mono text-[9px] uppercase tracking-wide',
              spooled.failed
                ? 'border-rose-500/40 bg-rose-500/10 text-rose-300'
                : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
            )}
          >
            {spooled.failed ? 'failed' : 'done'}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted-foreground">
          <Database aria-hidden className="h-3 w-3 shrink-0" />
          <span className="font-mono tabular-nums">
            ~{stats.tokens.toLocaleString()} tokens · {stats.lines.toLocaleString()} lines ·{' '}
            {stats.chars.toLocaleString()} chars
          </span>
          <span className="rounded-full border border-border px-1.5 py-px font-mono text-[9px] uppercase tracking-wide">
            spooled
          </span>
          <span className="truncate font-mono text-[9px] opacity-70" title={spooled.toolId}>
            {spooled.toolId}
          </span>
        </div>
      </header>

      {/* Toolbar: search · wrap · copy. Fixed height, no layout shift. */}
      <div className="flex h-9 shrink-0 items-center gap-1.5 border-b border-border/60 px-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setQuery('')
          }}
          placeholder="Filter lines… (Esc clears)"
          aria-label="Filter output lines"
          className="h-7 min-w-0 flex-1 rounded-md border border-border bg-background/60 px-2 font-mono text-[10px] text-foreground placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        />
        {query.trim() && (
          <span className="shrink-0 font-mono text-[9px] tabular-nums text-muted-foreground">
            {rows.length.toLocaleString()} match{rows.length === 1 ? '' : 'es'}
          </span>
        )}
        <button
          type="button"
          onClick={() => setWrap((v) => !v)}
          aria-pressed={wrap}
          title={wrap ? 'No wrap (horizontal scroll)' : 'Wrap long lines'}
          className={cn(
            'grid h-7 w-7 shrink-0 place-items-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
            wrap ? 'bg-brand/15 text-brand' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
          )}
        >
          <WrapText aria-hidden className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={copyAll}
          className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-border px-2 text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          {copied ? (
            <Check aria-hidden className="h-3 w-3 text-emerald-400" />
          ) : (
            <Copy aria-hidden className="h-3 w-3" />
          )}
          {copied ? 'Copied' : 'Copy full output'}
        </button>
      </div>

      {/* Scrollable line-numbered output. */}
      <div className="min-h-0 flex-1 overflow-auto bg-zinc-950 p-2" role="log" aria-label={`Full output of ${spooled.toolId}`}>
        {visible.length === 0 ? (
          <p className="p-3 text-center font-mono text-[10px] text-muted-foreground">
            No lines match this filter.
          </p>
        ) : (
          <div className="font-mono text-[11px] leading-relaxed">
            {visible.map((row) => (
              <div key={row.no} className="flex gap-2 px-1 hover:bg-white/[0.03]">
                <span className="w-10 shrink-0 select-none text-right tabular-nums text-zinc-600">
                  {row.no}
                </span>
                <span
                  className={cn(
                    'min-w-0 flex-1',
                    wrap ? 'whitespace-pre-wrap break-words' : 'whitespace-pre',
                    spooled.failed ? 'text-rose-300/90' : 'text-zinc-300',
                  )}
                >
                  {row.text === '' ? ' ' : row.text}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {truncated && (
        <footer className="shrink-0 border-t border-border/60 px-3 py-1 font-mono text-[9px] tabular-nums text-muted-foreground">
          Showing first {RENDER_LINE_CAP.toLocaleString()} of {rows.length.toLocaleString()} lines — refine the filter or copy the full output.
        </footer>
      )}
    </div>
  )
}
