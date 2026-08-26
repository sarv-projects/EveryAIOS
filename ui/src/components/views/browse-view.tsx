'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Globe, Play, Square, RotateCcw, RefreshCw, ArrowLeft, ArrowRight, ScanText, MousePointer2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  browserStart,
  browserNavigate,
  browserSnapshot,
  browserRead,
  browserClick,
  browserType,
  browserStop,
  browserStatus,
  type BrowserStatus,
} from '@/lib/browser'
import { SkeletonBlock } from '@/components/ui/loading-state'
import { useAppStore } from '@/lib/store'

/**
 * P11.5.3 — browse view over a real CDP session. Start spawns a headless
 * Chrome (chrome-for-testing fallback); the address bar navigates; the
 * snapshot pane renders the real accessibility tree with `[ref=eN]` refs;
 * clicking a ref line acts on the live page (P2.3 act engine).
 */
export default function BrowseView() {
  const [status, setStatus] = useState<BrowserStatus>({ attached: false })
  const [url, setUrl] = useState('https://example.com')
  const [snapshot, setSnapshot] = useState('')
  const [tab, setTab] = useState<'snapshot' | 'read'>('snapshot')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [inputRef, setInputRef] = useState('')
  const [typeText, setTypeText] = useState('')
  const [history, setHistory] = useState<string[]>([])
  const browserUrl = useAppStore((s) => s.browserUrl)

  // P33.6 — Google Docs/Sheets read path: a URL routed from an office surface
  // (or an artifact) lands here and navigates the authenticated browser view.
  useEffect(() => {
    if (!browserUrl) return
    if (status.attached) {
      void browserNavigate(browserUrl)
        .then(() => setHistory((h) => [browserUrl, ...h].slice(0, 20)))
        .catch((e) => setError(String(e)))
      setUrl(browserUrl)
    } else {
      setUrl(browserUrl)
      setError(null)
      setStatus((s) => ({ ...s, attached: false }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [browserUrl])

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const st = await browserStatus()
      setStatus(st)
      if (!st.attached) {
        setSnapshot('')
        return
      }
      setUrl(st.url ?? url)
      if (tab === 'snapshot') {
        const snap = await browserSnapshot()
        setSnapshot(snap.text)
      } else {
        const read = await browserRead()
        setSnapshot(read.text)
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [tab, url])

  useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  const start = async () => {
    setLoading(true)
    setError(null)
    try {
      await browserStart()
      setStatus({ attached: true })
      await browserNavigate('https://example.com')
      setUrl('https://example.com')
      await refresh()
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  const go = async () => {
    if (!status.attached) return
    setLoading(true)
    try {
      await browserNavigate(url)
      setHistory((h) => [url, ...h].slice(0, 20))
      await refresh()
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  const clickRef = async (refId: string) => {
    try {
      await browserClick(refId)
      await refresh()
    } catch (e) {
      setError(String(e))
    }
  }

  return (
    <div className="flex h-full w-full flex-col">
      <header className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Globe className="h-3.5 w-3.5 shrink-0 text-orange-400" />
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && go()}
          aria-label="Address bar"
          placeholder="https://…"
          className="min-w-0 flex-1 rounded-md border border-border bg-background px-2.5 py-1 font-mono text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
        />
        {status.attached ? (
          <>
            <button onClick={() => void go()} aria-label="Navigate" className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => void refresh()} aria-label="Reload" className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => {
                void browserStop().then(() => setStatus({ attached: false }))
              }}
              aria-label="Stop browser"
              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-rose-400"
            >
              <Square className="h-3.5 w-3.5" />
            </button>
          </>
        ) : (
          <button
            onClick={() => void start()}
            className="flex items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/15"
          >
            <Play className="h-3 w-3" /> Start browser
          </button>
        )}
      </header>

      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
        <div className="flex gap-0.5 rounded-md border border-border bg-muted/30 p-0.5">
          {(['snapshot', 'read'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'rounded px-2 py-0.5 text-[10px] font-medium',
                tab === t ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
              )}
            >
              {t === 'snapshot' ? 'Snapshot' : 'Markdown'}
            </button>
          ))}
        </div>
        {status.attached && (
          <Badge variant="outline" className="gap-1 border-orange-500/40 bg-orange-500/10 text-[10px] text-orange-300">
            <span className="live-dot h-1.5 w-1.5 rounded-full bg-orange-500" /> CDP attached
          </Badge>
        )}
        {status.attached && tab === 'snapshot' && (
          <div className="ml-auto flex items-center gap-1.5">
            <input
              value={inputRef}
              onChange={(e) => setInputRef(e.target.value)}
              placeholder="ref (e.g. e1)"
              aria-label="Action ref"
              className="w-16 rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] focus:outline-none"
            />
            <button
              onClick={() => inputRef && void clickRef(inputRef)}
              aria-label="Click ref"
              className="flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground"
            >
              <MousePointer2 className="h-3 w-3" /> Click
            </button>
            <input
              value={typeText}
              onChange={(e) => setTypeText(e.target.value)}
              placeholder="type…"
              aria-label="Type text"
              className="w-24 rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] focus:outline-none"
            />
            <button
              onClick={() => {
                void browserType(inputRef || null, typeText).then(() => {
                  setTypeText('')
                  void refresh()
                })
              }}
              aria-label="Type into page"
              className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground"
            >
              Type
            </button>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto bg-zinc-950 p-3">
        {error && <div className="mb-2 text-xs text-rose-400">{error}</div>}
        {loading && !snapshot && (
          <div className="p-2"><SkeletonBlock lines={8} /></div>
        )}
        {!status.attached && !loading && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <RotateCcw className="h-5 w-5 text-muted-foreground/50" />
            <p className="text-xs text-muted-foreground">
              Start the browser to browse the live web — snapshots are the real
              accessibility tree with stable refs.
            </p>
          </div>
        )}
        {status.attached && snapshot && (
          <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-zinc-300">
            {snapshot.split('\n').map((line, i) => {
              const m = line.match(/\[ref=(e\d+)\]/)
              if (!m || tab !== 'snapshot') return <div key={i}>{line || ' '}</div>
              return (
                <button
                  key={i}
                  onClick={() => void clickRef(m[1])}
                  title={`Click ${m[1]}`}
                  className="block w-full text-left hover:bg-orange-500/10"
                >
                  {line || ' '}
                </button>
              )
            })}
          </pre>
        )}
      </div>
    </div>
  )
}
