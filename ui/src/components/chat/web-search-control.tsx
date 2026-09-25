'use client'

// The composer's first-class "Search the web" switch.
//
// Truth contract (this is the whole point of the component):
//
//   * OFF by default — searching through a stranger's index is a decision, not
//     a default (`search_controls.ts` owns the state; this file is the surface).
//   * Turning it on does NOT run a search. The desktop has no search executor
//     in this path; the bound agent does the searching with its own tool
//     (ADR-0005). The panel says so in the same breath as the toggle.
//   * What the panel lists is the real cascade: the endpoints
//     `search_config` reports, which is the same file the live cascade reads.
//     Reachability is never claimed — the kernel health-gates endpoints at
//     query time, and the desktop has no probe of its own.
//   * "Last run" comes from the ACP tool log, the only per-turn record the
//     shell exposes. Which backend answered and how many results came back are
//     not in it, so both read "not reported" instead of a plausible number.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, ChevronDown, CircleSlash, Globe, Loader2, Settings2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/lib/store'
import { inTauri } from '@/lib/tauri'
import { acpToolLog } from '@/lib/acp'
import {
  lastSearchRun,
  readSearchConfig,
  readSearchInstances,
  searchBackends,
  searchRunLine,
  searchSummary,
  type SearchConfigRow,
  type SearchFeedRow,
  type SearchRunReport,
  type WebSearchStatus,
} from '@/lib/search-controls'

interface Props {
  enabled: boolean
  /** The panel is parent-owned so the footer's reserved slot can reopen it. */
  open: boolean
  onOpenChange: (open: boolean) => void
  onToggle: (next: boolean) => void
  /** Open the real Search settings surface (the only owner of the opt-in). */
  onOpenSettings: () => void
  /**
   * Report the one-line status up so the composer's reserved footer slot can
   * show it. The control keeps the read; nobody else talks to `search_config`.
   */
  onStatus?: (status: WebSearchStatus | null) => void
}

type LoadState = 'idle' | 'loading' | 'ready' | 'failed'

export default function WebSearchControl({
  enabled,
  open,
  onOpenChange,
  onToggle,
  onOpenSettings,
  onStatus,
}: Props) {
  const [state, setState] = useState<LoadState>('idle')
  const [cfg, setCfg] = useState<SearchConfigRow | null>(null)
  const [feed, setFeed] = useState<SearchFeedRow | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [run, setRun] = useState<SearchRunReport | null>(null)
  const [runRead, setRunRead] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const activeSessionId = useAppStore((s) => s.activeSessionId)
  // The tool log is appended when a turn settles, so the run line refreshes
  // with the transcript rather than on a timer.
  const turnCount = useAppStore((s) => {
    const sess = s.sessions.find((x) => x.id === s.activeSessionId)
    return sess?.messages.length ?? 0
  })

  const load = useCallback(async () => {
    if (!inTauri()) {
      setState('failed')
      setError('Not reported — this is a browser preview, not the desktop shell.')
      return
    }
    setState((prev) => (prev === 'ready' ? prev : 'loading'))
    try {
      const nextCfg = await readSearchConfig()
      setCfg(nextCfg)
      setError(null)
      setState('ready')
    } catch (e) {
      setCfg(null)
      setError(e instanceof Error ? e.message : 'The search configuration could not be read.')
      setState('failed')
    }
    // The feed is a network read behind a cache window; it is only pulled when
    // the panel is actually open, and a failure never blanks the config.
    try {
      setFeed(await readSearchInstances(false))
    } catch {
      setFeed(null)
    }
  }, [])

  // Load as soon as the switch is on (the user asked about search) and every
  // time the panel is opened after that.
  useEffect(() => {
    if (enabled) void load()
  }, [enabled, load])

  useEffect(() => {
    if (!open) return
    void load()
  }, [open, load])

  // The last search run: from the ACP tool log, never invented.
  useEffect(() => {
    if (!enabled && !open) return
    if (!inTauri()) {
      setRun(null)
      setRunRead(true)
      return
    }
    let alive = true
    setRunRead(false)
    void (async () => {
      try {
        const entries = await acpToolLog(activeSessionId)
        if (alive) setRun(lastSearchRun(entries))
      } catch {
        if (alive) setRun(null)
      } finally {
        if (alive) setRunRead(true)
      }
    })()
    return () => {
      alive = false
    }
  }, [activeSessionId, enabled, open, turnCount])

  // Escape closes and returns focus to the control that opened the panel.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onOpenChange(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [open, onOpenChange])

  const summary = useMemo(
    () => searchSummary(cfg, feed, state === 'failed' ? error : null),
    [cfg, feed, state, error],
  )
  const backends = useMemo(() => searchBackends(cfg, feed), [cfg, feed])
  const loading = state === 'idle' || state === 'loading'

  // One owner for the read, one owner for the wording: the footer slot renders
  // exactly what the panel shows, so the two can never disagree.
  //
  // The status is stored here (not derived during render) and published through
  // a primitive-keyed effect. Deriving it inline would hand the parent a fresh
  // object every render, whose setState re-renders this control, which derives
  // another one — a loop. `onStatus` is expected to be a stable callback.
  const [status, setStatus] = useState<WebSearchStatus | null>(null)
  useEffect(() => {
    if (!enabled) {
      setStatus(null)
      return
    }
    setStatus({
      on: true,
      head: summary.head,
      detail: summary.detail,
      tone: summary.tone,
      inCascade: summary.inCascade,
    })
  }, [enabled, summary])
  useEffect(() => {
    onStatus?.(status)
  }, [onStatus, status])

  return (
    <div className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        aria-pressed={enabled}
        aria-expanded={open}
        aria-label={enabled ? 'Web search is on — show search backends' : 'Turn on web search for the next message'}
        title={
          enabled
            ? 'Web search is on. The agent searches with its own tool; the desktop has not run a query.'
            : 'Web search is off. The agent searches with its own tool when you ask it to.'
        }
        onClick={() => {
          const next = !enabled
          onToggle(next)
          // Turning it on reveals what it will use; turning it off closes the
          // panel so the bar does not keep a details view of an inactive switch.
          onOpenChange(next ? true : false)
        }}
        className={cn(
          'flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-muted-foreground transition-colors',
          'hover:bg-accent/60 hover:text-foreground',
          enabled && 'border-brand/40 bg-brand/15 text-brand',
        )}
      >
        <Globe className="h-3.5 w-3.5" aria-hidden="true" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Web search backends"
          className="absolute bottom-full right-0 z-40 mb-1.5 w-[19rem] overflow-hidden rounded-lg border border-border bg-popover text-left shadow-xl"
        >
          <div className="flex items-center gap-1.5 border-b border-border bg-zinc-900/60 px-2.5 py-1.5">
            <Globe className="h-3 w-3 shrink-0 text-brand" aria-hidden="true" />
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Search the web
            </span>
            <button
              type="button"
              aria-label="Close the web search panel"
              onClick={() => {
                onOpenChange(false)
                triggerRef.current?.focus()
              }}
              className="ml-auto rounded p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          </div>

          <div className="scroll-thin max-h-72 overflow-y-auto px-2.5 py-2">
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {enabled
                ? 'On. Your next message asks the agent to search the web and cite what it finds. The desktop does not search anything itself.'
                : 'Off. Your next message goes to the agent as written. Turn this on to ask it to search the web first.'}
            </p>

            <div className="mt-2 flex items-center gap-1.5">
              {loading ? (
                <>
                  <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" aria-hidden="true" />
                  <span className="font-mono text-[10px] text-muted-foreground">reading the search configuration…</span>
                </>
              ) : (
                <SearchStateLine tone={summary.tone} head={summary.head} />
              )}
            </div>
            <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground/90">{summary.detail}</p>

            {backends && backends.rows.length > 0 && (
              <ul className="mt-2 space-y-1">
                {backends.rows.map((row) => (
                  <li key={row.url} className="flex items-start gap-1.5">
                    {row.state === 'in-cascade' ? (
                      <CheckCircle2 className="mt-px h-3 w-3 shrink-0 text-emerald-400" aria-hidden="true" />
                    ) : (
                      <CircleSlash className="mt-px h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-mono text-[10px] text-foreground">{row.url}</span>
                      <span className="block text-[10px] leading-snug text-muted-foreground">
                        {row.label} · {row.note}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-2 border-t border-border/70 pt-2">
              <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground/70">
                Last run
              </span>
              <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
                {!inTauri()
                  ? 'Not reported — the desktop shell is not connected.'
                  : !runRead
                    ? 'reading the turn log…'
                    : run
                      ? searchRunLine(run)
                      : 'No turn in this chat has run a web search yet.'}
              </p>
              {run && run.unsettled > 0 && (
                <p className="mt-0.5 flex items-center gap-1 text-[10px] text-warning">
                  <AlertTriangle className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
                  {run.unsettled} call{run.unsettled === 1 ? '' : 's'} had no result when the turn ended
                </p>
              )}
            </div>
          </div>

          <div className="border-t border-border bg-background/40 px-2.5 py-1.5">
            <button
              type="button"
              onClick={onOpenSettings}
              className="flex items-center gap-1.5 rounded px-1 py-0.5 font-mono text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <Settings2 className="h-3 w-3 shrink-0" aria-hidden="true" />
              Search backends live in Settings → Search
              <ChevronDown className="h-3 w-3 shrink-0 -rotate-90" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/** Status is an icon + words. Never colour alone. */
function SearchStateLine({ tone, head }: { tone: 'ok' | 'warn' | 'muted'; head: string }) {
  if (tone === 'ok') {
    return (
      <span className="flex items-center gap-1.5 font-mono text-[10px] text-emerald-400">
        <CheckCircle2 className="h-3 w-3 shrink-0" aria-hidden="true" />
        {head}
      </span>
    )
  }
  if (tone === 'warn') {
    return (
      <span className="flex items-center gap-1.5 font-mono text-[10px] text-warning">
        <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />
        {head}
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
      <CircleSlash className="h-3 w-3 shrink-0" aria-hidden="true" />
      {head}
    </span>
  )
}
