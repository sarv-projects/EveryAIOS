'use client'

import { useCallback, useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Globe, Play, Square, RotateCcw, RefreshCw, ArrowRight, MousePointer2 } from 'lucide-react'
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
 * P11.5.3 — browse view over a real CDP session. Start spawns an isolated
 * headless Chrome; the address bar navigates; the snapshot pane renders the
 * real accessibility tree with `[ref=eN]` refs; clicking a ref line acts on
 * the live page (P2.3 act engine).
 */
export default function BrowseView() {
  // P50.3.8 — report the real CDP attachment state to the shared store so the
  // status bar / rail reflect the live session (never a hardcoded value).
  const setBrowserAttached = useAppStore((s) => s.setBrowserAttached)
  const clearBrowserUrl = useAppStore((s) => s.clearBrowserUrl)
  const notify = useAppStore((s) => s.notify)
  const [status, setStatus] = useState<BrowserStatus>({ attached: false })
  const [url, setUrl] = useState('https://example.com')
  const [liveUrl, setLiveUrl] = useState<string | null>(null)
  const [snapshot, setSnapshot] = useState('')
  const [tab, setTab] = useState<'snapshot' | 'read'>('snapshot')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [inputRef, setInputRef] = useState('')
  const [typeText, setTypeText] = useState('')
  const [history, setHistory] = useState<string[]>([])
  const [actBusy, setActBusy] = useState(false)
  const browserUrl = useAppStore((s) => s.browserUrl)

  // P33.6 — Google Docs/Sheets read path: a URL routed from an office surface
  // (or an artifact) lands here. When detached the user's link-click is an
  // explicit attach intent, so start the session and then navigate (with
  // loading state throughout); the routed URL is consumed so reopening the
  // same link retriggers the effect.
  useEffect(() => {
    if (!browserUrl) return
    let cancelled = false
    setUrl(browserUrl)
    setError(null)
    void (async () => {
      setLoading(true)
      try {
        const st = await browserStatus()
        if (cancelled) return
        if (!st.attached) await browserStart()
        await browserNavigate(browserUrl)
        if (cancelled) return
        setHistory((h) => [browserUrl, ...h].slice(0, 20))
        await refresh()
      } catch (e) {
        if (!cancelled) setError(`Could not open ${browserUrl} — ${String(e)}`)
      } finally {
        if (!cancelled) {
          setLoading(false)
          clearBrowserUrl()
        }
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [browserUrl])

  const refresh = useCallback(async (tabOverride?: 'snapshot' | 'read') => {
    const activeTab = tabOverride ?? tab
    setLoading(true)
    setError(null)
    try {
      const st = await browserStatus()
      setStatus(st)
      setBrowserAttached(!!st.attached)
      if (!st.attached) {
        setSnapshot('')
        setLiveUrl(null)
        return
      }
      if (activeTab === 'snapshot') {
        const snap = await browserSnapshot()
        setSnapshot(snap.text)
        setLiveUrl(snap.url ?? st.url ?? null)
        setUrl(snap.url ?? st.url ?? url)
      } else {
        const read = await browserRead()
        setSnapshot(read.text)
        setLiveUrl(read.url ?? st.url ?? null)
        setUrl(read.url ?? st.url ?? url)
      }
    } catch (e) {
      // Failure invalidates the pane: never show a stale tree under an error.
      setError(String(e))
      setSnapshot('')
      setLiveUrl(null)
      try {
        const st = await browserStatus()
        setStatus(st)
        setBrowserAttached(!!st.attached)
      } catch {
        setStatus({ attached: false })
        setBrowserAttached(false)
      }
    } finally {
      setLoading(false)
    }
  }, [tab, url, setBrowserAttached])

  const switchTab = (t: 'snapshot' | 'read') => {
    if (t === tab || loading) return
    setTab(t)
    void refresh(t)
  }

  // Probe the live session on mount (a session outlives the view); on
  // unmount re-probe instead of blindly clearing — closing the tab must not
  // claim "detached" while the Rust session is still attached.
  useEffect(() => {
    void refresh()
    return () => {
      void browserStatus()
        .then((st) => setBrowserAttached(!!st.attached))
        .catch(() => setBrowserAttached(false))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Normalize + validate an address-bar value; null = refuse with reason. */
  const validUrl = (raw: string): string | null => {
    const trimmed = raw.trim()
    if (!trimmed) {
      setError('Enter a URL first (https://…)')
      return null
    }
    try {
      const u = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`)
      if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        setError('Only http(s) URLs can be navigated to')
        return null
      }
      return u.toString()
    } catch {
      setError(`Not a valid URL: ${trimmed}`)
      return null
    }
  }

  const start = async () => {
    if (loading) return
    const target = validUrl(url) ?? 'https://example.com'
    setLoading(true)
    setError(null)
    try {
      const st = await browserStart()
      if (!st.attached) throw new Error('browser failed to attach')
      await browserNavigate(target)
      setUrl(target)
      setHistory((h) => [target, ...h].slice(0, 20))
      // Only claim attached once the session proves itself with a snapshot.
      await refresh()
    } catch (e) {
      setError(String(e))
      setStatus({ attached: false })
      setBrowserAttached(false)
    } finally {
      setLoading(false)
    }
  }

  const go = async () => {
    if (!status.attached) {
      notify('Browser is not attached — start it first')
      return
    }
    const target = validUrl(url)
    if (!target) return
    setLoading(true)
    setError(null)
    try {
      await browserNavigate(target)
      setUrl(target)
      setHistory((h) => [target, ...h].slice(0, 20))
      await refresh()
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  const stop = async () => {
    if (loading) return
    setLoading(true)
    try {
      await browserStop()
    } catch (e) {
      setError(`Stop failed — ${String(e)}`)
      return
    } finally {
      setLoading(false)
    }
    setStatus({ attached: false })
    setBrowserAttached(false)
    setSnapshot('')
    setLiveUrl(null)
    setHistory([])
    setInputRef('')
    setTypeText('')
  }

  const clickRef = async (refId: string) => {
    if (!/^e\d+$/.test(refId.trim())) {
      setError(`Bad ref “${refId}” — use the [ref=eN] value from the snapshot`)
      return
    }
    if (actBusy || loading) return
    setActBusy(true)
    setError(null)
    try {
      await browserClick(refId.trim())
      await refresh()
    } catch (e) {
      setError(String(e))
    } finally {
      setActBusy(false)
    }
  }

  const typeInto = async () => {
    if (!typeText.trim()) {
      setError('Type some text first')
      return
    }
    if (actBusy || loading) return
    setActBusy(true)
    setError(null)
    try {
      await browserType(inputRef.trim() || null, typeText)
      setTypeText('')
      await refresh()
    } catch (e) {
      setError(String(e))
    } finally {
      setActBusy(false)
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
            <button onClick={() => void go()} disabled={loading} aria-label="Navigate" className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40">
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => void refresh()} disabled={loading} aria-label="Reload" className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40">
              <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            </button>
            <button
              onClick={() => void stop()}
              disabled={loading}
              aria-label="Stop browser"
              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-rose-400 disabled:opacity-40"
            >
              <Square className="h-3.5 w-3.5" />
            </button>
          </>
        ) : (
          <button
            onClick={() => void start()}
            disabled={loading}
            className="flex items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/15 disabled:opacity-40"
          >
            <Play className="h-3 w-3" /> {loading ? 'Starting…' : 'Start browser'}
          </button>
        )}
      </header>

      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
        <div className="flex gap-0.5 rounded-md border border-border bg-muted/30 p-0.5">
          {(['snapshot', 'read'] as const).map((t) => (
            <button
              key={t}
              onClick={() => switchTab(t)}
              disabled={!status.attached || loading}
              className={cn(
                'rounded px-2 py-0.5 text-[10px] font-medium disabled:opacity-40',
                tab === t ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
              )}
            >
              {t === 'snapshot' ? 'Snapshot' : 'Markdown'}
            </button>
          ))}
        </div>
        {status.attached ? (
          <Badge variant="outline" className="gap-1 border-orange-500/40 bg-orange-500/10 text-[10px] text-orange-300">
            <span className="live-dot h-1.5 w-1.5 rounded-full bg-orange-500" /> CDP attached
          </Badge>
        ) : (
          <Badge variant="outline" className="gap-1 text-[10px] text-muted-foreground">
            detached
          </Badge>
        )}
        {liveUrl && (
          <span className="max-w-[220px] truncate font-mono text-[9px] text-muted-foreground/70" title={liveUrl}>
            {liveUrl}
          </span>
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
              onClick={() => inputRef.trim() && void clickRef(inputRef)}
              disabled={actBusy || loading || !inputRef.trim()}
              aria-label="Click ref"
              className="flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
              <MousePointer2 className="h-3 w-3" /> Click
            </button>
            <input
              value={typeText}
              onChange={(e) => setTypeText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void typeInto()}
              placeholder="type…"
              aria-label="Type text"
              className="w-24 rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] focus:outline-none"
            />
            <button
              onClick={() => void typeInto()}
              disabled={actBusy || loading || !typeText.trim()}
              aria-label="Type into page"
              className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
              Type
            </button>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto bg-zinc-950 p-3">
        <AnimatePresence>
          {error && (
            <motion.div
              key="browse-error"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mb-2 flex flex-wrap items-center gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-xs text-rose-400"
            >
              <span className="min-w-0 flex-1">{error}</span>
              <button
                onClick={() => void (status.attached ? refresh() : start())}
                disabled={loading}
                className="rounded border border-red-500/40 px-1.5 py-0.5 text-[10px] hover:bg-red-500/15 disabled:opacity-40"
              >
                Retry
              </button>
              <button
                onClick={() => setError(null)}
                aria-label="Dismiss error"
                className="rounded px-1.5 py-0.5 text-[10px] hover:bg-red-500/15"
              >
                ✕
              </button>
            </motion.div>
          )}
        </AnimatePresence>
        {loading && (
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
        {status.attached && !loading && !snapshot && !error && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <Globe className="h-5 w-5 text-muted-foreground/50" />
            <p className="text-xs text-muted-foreground">
              Attached, but the page returned an empty tree — navigate somewhere or reload.
            </p>
            <button
              onClick={() => void refresh()}
              className="rounded border border-border px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground"
            >
              Reload snapshot
            </button>
          </div>
        )}
        {status.attached && snapshot && (
          <motion.pre
            key={`${tab}-${snapshot.length}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.15 }}
            className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-zinc-300"
          >
            {snapshot.split('\n').map((line, i) => {
              const m = line.match(/\[ref=(e\d+)\]/)
              if (!m || tab !== 'snapshot') return <div key={i}>{line || ' '}</div>
              return (
                <button
                  key={i}
                  onClick={() => void clickRef(m[1])}
                  disabled={actBusy || loading}
                  title={`Click ${m[1]}`}
                  className="block w-full text-left hover:bg-orange-500/10 disabled:opacity-60"
                >
                  {line || ' '}
                </button>
              )
            })}
          </motion.pre>
        )}
      </div>
    </div>
  )
}
