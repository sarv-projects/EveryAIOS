'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MonitorSmartphone, RefreshCw, Eye, FileText, MousePointerClick, OctagonX, ShieldAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { SkeletonBlock } from '@/components/ui/loading-state'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/lib/store'
import { inTauri } from '@/lib/tauri'
import {
  desktopStatus,
  desktopWindows,
  desktopRead,
  desktopSee,
  desktopAct,
  desktopStop,
  type DesktopStatus,
  type DesktopWindow,
} from '@/lib/desktop'

/**
 * P48.3 (E9) — desktop computer-use view. See / read / act on native windows.
 * Human-gesture path only: the user drives it directly. Every `act` is
 * Guard-2 gated + Merkle-audited on the Rust side; risky classes fail closed.
 */
export default function DesktopView() {
  const notify = useAppStore((s) => s.notify)
  const setDesktopAttached = useAppStore((s) => s.setDesktopAttached)
  const [status, setStatus] = useState<DesktopStatus | null>(null)
  const [windows, setWindows] = useState<DesktopWindow[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [tree, setTree] = useState<string>('')
  const [hasTree, setHasTree] = useState<boolean | null>(null)
  const [shot, setShot] = useState<string | null>(null)
  const [shotAt, setShotAt] = useState<number | null>(null)
  const [shotBroken, setShotBroken] = useState(false)
  const [typeText, setTypeText] = useState('')
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function refresh() {
    if (loading) return
    setLoading(true)
    setError(null)
    try {
      const st = await desktopStatus()
      setStatus(st)
      setDesktopAttached(st.attached, st.attached ? null : (st.reason ?? null))
      if (!st.attached) {
        setWindows([])
        setSelected(null)
        setTree('')
        setShot(null)
        return
      }
      const wins = await desktopWindows()
      setWindows(wins)
      // Revalidate the selection: a closed/renumbered window must not stay
      // selected forever — fall back to the first live window.
      if (wins.length === 0) {
        setSelected(null)
      } else if (selected === null || !wins.some((w) => w.id === selected)) {
        setSelected(wins[0].id)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Desktop probe failed'
      setError(msg)
      notify(msg)
      setStatus(null)
      setDesktopAttached(false, msg)
      setWindows([])
      setSelected(null)
      setTree('')
      setShot(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function readWindow() {
    if (selected === null) return
    setBusy(true)
    setError(null)
    try {
      const r = await desktopRead(selected)
      setTree(r.tree || '(empty a11y tree)')
      setHasTree(r.has_tree)
    } catch (err) {
      // Failed reads invalidate the pane: never show another window's tree.
      setTree('')
      setHasTree(null)
      const msg = err instanceof Error ? err.message : 'Read failed'
      setError(msg)
      notify(msg)
    } finally {
      setBusy(false)
    }
  }

  async function seeWindow() {
    if (selected === null) return
    setBusy(true)
    setError(null)
    try {
      const r = await desktopSee(selected)
      if (!r.png) throw new Error('Capture returned no pixels')
      setShot(`data:image/png;base64,${r.png}`)
      setShotAt(Date.now())
      setShotBroken(false)
    } catch (err) {
      setShot(null)
      setShotAt(null)
      const msg = err instanceof Error ? err.message : 'Capture failed'
      setError(msg)
      notify(msg)
    } finally {
      setBusy(false)
    }
  }

  async function typeInto() {
    if (selected === null || !typeText.trim()) return
    setBusy(true)
    setError(null)
    try {
      await desktopAct(selected, 'type', { text: typeText })
      notify(`Typed into window ${selected}`)
      setTypeText('')
    } catch (err) {
      // Fail-closed denials surface honestly.
      const msg = err instanceof Error ? err.message : 'Act declined'
      setError(msg)
      notify(msg)
    } finally {
      setBusy(false)
    }
  }

  async function selectWindow(id: number) {
    setSelected(id)
    setTree('')
    setHasTree(null)
    setShot(null)
    setShotAt(null)
    setShotBroken(false)
    setTypeText('')
    setError(null)
  }

  async function estop() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await desktopStop()
      notify('Emergency stop — desktop engine kill switch tripped')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Emergency stop failed'
      setError(msg)
      notify(msg)
      return
    } finally {
      setBusy(false)
    }
    // The kill switch invalidates everything the pane claimed as live.
    setStatus(null)
    setDesktopAttached(false, 'emergency stop tripped')
    setWindows([])
    setSelected(null)
    setTree('')
    setShot(null)
  }

  const caps = status?.capabilities

  return (
    <div className="flex h-full w-full flex-col">
      <header className="border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <MonitorSmartphone className="h-4 w-4 text-orange-400" />
          <h2 className="text-sm font-semibold text-foreground">Computer use</h2>
          {status && (
            <Badge
              variant="outline"
              className={cn('text-[9px]', status.attached ? 'text-emerald-300' : 'text-amber-300')}
            >
              {status.attached ? 'engine attached' : 'not attached'}
            </Badge>
          )}
          <Badge variant="secondary" className="text-[9px]">human-gesture only</Badge>
          <div className="ml-auto flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-[10px] text-red-400 hover:text-red-300"
              onClick={() => void estop()}
              disabled={!status?.attached || busy}
              title={status?.attached ? 'Emergency stop' : 'Engine not attached'}
            >
              <OctagonX className="h-3.5 w-3.5" /> Stop
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => void refresh()} disabled={loading} title="Rescan windows">
              <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            </Button>
          </div>
        </div>
      </header>

      <ScrollArea className="scroll-thin min-h-0 flex-1">
        <div className="space-y-4 p-4">
          <AnimatePresence>
            {error && (
              <motion.div
                key="desktop-error"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-2.5 font-mono text-[10px] text-red-400"
              >
                <span className="min-w-0 flex-1">⚠ {error}</span>
                <button
                  onClick={() => void refresh()}
                  disabled={loading}
                  className="rounded border border-red-500/40 px-1.5 py-0.5 text-[9px] hover:bg-red-500/15 disabled:opacity-40"
                >
                  Retry
                </button>
                <button
                  onClick={() => setError(null)}
                  aria-label="Dismiss error"
                  className="rounded px-1.5 py-0.5 text-[9px] hover:bg-red-500/15"
                >
                  ✕
                </button>
              </motion.div>
            )}
          </AnimatePresence>
          {status && !status.attached && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-[11px] text-amber-300">
              <ShieldAlert className="mb-1 h-3.5 w-3.5" />
              Desktop engine not attached{status.reason ? ` — ${status.reason}` : ''}. It attaches
              lazily on first use and honest-fails on headless / no-display.
              <div className="mt-2">
                <Button size="sm" variant="outline" className="h-7 text-[10px]" disabled={loading} onClick={() => void refresh()}>
                  {loading ? 'Probing…' : 'Retry attach'}
                </Button>
              </div>
            </div>
          )}

          {caps && (
            <div className="flex flex-wrap gap-1">
              {Object.entries({
                see: caps.see, occluded: caps.see_occluded, tree: caps.uia_tree,
                invoke: caps.invoke_set_value, input: caps.send_input,
                ocr: caps.ocr, windows: caps.window_list, launch: caps.launch_app,
              }).map(([k, v]) => (
                <Badge key={k} variant="outline" className={cn('text-[9px]', v ? 'text-emerald-300' : 'text-muted-foreground/50')}>
                  {k}
                </Badge>
              ))}
            </div>
          )}
          {!caps && loading && (
            <div className="flex flex-wrap gap-1">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <span key={i} className="h-5 w-14 animate-pulse rounded border border-border bg-muted/40" />
              ))}
            </div>
          )}

          <div>
            <div className="mb-2 text-xs font-medium">Windows{windows.length > 0 && <span className="ml-1 font-mono text-[10px] text-muted-foreground">{windows.length}</span>}</div>
            {loading && windows.length === 0 ? (
              <SkeletonBlock lines={3} />
            ) : windows.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-4 text-center text-[11px] text-muted-foreground">
                {status === null
                  ? 'Probe the engine to list windows — Rescan above.'
                  : status.attached
                    ? 'Engine attached, but no windows enumerated.'
                    : 'No windows enumerated — attach the engine first.'}
              </div>
            ) : (
              <div className="space-y-1">
                {windows.map((w) => (
                  <button
                    key={w.id}
                    onClick={() => void selectWindow(w.id)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md border px-3 py-1.5 text-left transition-colors',
                      selected === w.id ? 'border-orange-500/50 bg-orange-500/5' : 'border-border bg-card hover:bg-accent/40',
                    )}
                  >
                    <span className="font-mono text-[10px] text-muted-foreground">#{w.id}</span>
                    <span className="flex-1 truncate text-xs text-foreground">{w.title || '(untitled)'}</span>
                    <Badge variant="secondary" className="text-[9px]">{w.app}</Badge>
                    <span className="font-mono text-[9px] text-muted-foreground">{w.x},{w.y} · {w.width}×{w.height}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {selected !== null ? (
            <motion.div
              key={`desktop-selected-${selected}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.15 }}
              className="space-y-3"
            >
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" disabled={busy || loading || !inTauri()} title={inTauri() ? 'Capture this window' : 'See needs the desktop shell'} onClick={() => void seeWindow()}>
                  <Eye className="h-3 w-3" /> See
                </Button>
                <Button size="sm" variant="outline" disabled={busy || loading} onClick={() => void readWindow()}>
                  <FileText className="h-3 w-3" /> Read tree
                </Button>
              </div>

              <div className="flex gap-2">
                <Input
                  value={typeText}
                  onChange={(e) => setTypeText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void typeInto()}
                  placeholder={inTauri() ? 'Text to type into the focused control…' : 'Type needs the desktop shell…'}
                  disabled={!inTauri()}
                  className="h-8 flex-1 text-xs"
                />
                <Button size="sm" variant="default" className="bg-orange-500 text-black hover:bg-orange-400" disabled={busy || loading || !inTauri() || !typeText.trim()} onClick={() => void typeInto()}>
                  <MousePointerClick className="h-3 w-3" /> Type
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Acts are audited with human-gesture provenance. Risky classes (delete / payment /
                install / captcha / transmit) fail closed — they never execute silently from here.
              </p>

              {shot && !shotBroken ? (
                <motion.div
                  key={`shot-${shotAt ?? 0}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden rounded-md border border-border"
                >
                  <img
                    src={shot}
                    alt={`window ${selected} capture${shotAt ? ` — ${new Date(shotAt).toLocaleTimeString()}` : ''}`}
                    className="w-full"
                    onError={() => setShotBroken(true)}
                  />
                  {shotAt && (
                    <div className="border-t border-border bg-card px-2 py-1 font-mono text-[9px] text-muted-foreground">
                      captured {new Date(shotAt).toLocaleTimeString()}
                    </div>
                  )}
                </motion.div>
              ) : shotBroken ? (
                <div className="rounded-md border border-dashed border-border p-4 text-center text-[11px] text-muted-foreground">
                  Capture arrived but the image could not be rendered.
                  <div className="mt-2">
                    <Button size="sm" variant="outline" className="h-7 text-[10px]" disabled={busy} onClick={() => void seeWindow()}>
                      Capture again
                    </Button>
                  </div>
                </div>
              ) : null}
              {tree && (
                <motion.pre
                  key={`tree-${tree.length}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.15 }}
                  className="max-h-64 overflow-auto rounded-md border border-border bg-card p-2 font-mono text-[10px] text-foreground/90"
                >
                  {hasTree === false ? '(no a11y tree for this window)\n' : ''}{tree}
                </motion.pre>
              )}
            </motion.div>
          ) : (
            <div className="rounded-md border border-dashed border-border p-4 text-center text-[11px] text-muted-foreground">
              {windows.length > 0 ? 'Select a window above to see, read, or type.' : 'Windows you can drive will appear here.'}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
