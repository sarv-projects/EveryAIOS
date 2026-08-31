'use client'

import { useEffect, useState } from 'react'
import { MonitorSmartphone, RefreshCw, Eye, FileText, MousePointerClick, OctagonX, ShieldAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/lib/store'
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
  const [status, setStatus] = useState<DesktopStatus | null>(null)
  const [windows, setWindows] = useState<DesktopWindow[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [tree, setTree] = useState<string>('')
  const [shot, setShot] = useState<string | null>(null)
  const [typeText, setTypeText] = useState('')
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)

  async function refresh() {
    setLoading(true)
    try {
      const [st, wins] = await Promise.all([desktopStatus(), desktopWindows()])
      setStatus(st)
      setWindows(wins)
      if (wins.length > 0 && selected === null) setSelected(wins[0].id)
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Desktop probe failed')
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
    try {
      const r = await desktopRead(selected)
      setTree(r.tree || '(empty a11y tree)')
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Read failed')
    } finally {
      setBusy(false)
    }
  }

  async function seeWindow() {
    if (selected === null) return
    setBusy(true)
    try {
      const r = await desktopSee(selected)
      setShot(`data:image/png;base64,${r.png}`)
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Capture failed')
    } finally {
      setBusy(false)
    }
  }

  async function typeInto() {
    if (selected === null || !typeText.trim()) return
    setBusy(true)
    try {
      await desktopAct(selected, 'type', { text: typeText })
      notify(`Typed into window ${selected}`)
      setTypeText('')
    } catch (err) {
      // Fail-closed denials surface honestly.
      notify(err instanceof Error ? err.message : 'Act declined')
    } finally {
      setBusy(false)
    }
  }

  async function estop() {
    await desktopStop()
    notify('Emergency stop — desktop engine kill switch tripped')
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
              title="Emergency stop"
            >
              <OctagonX className="h-3.5 w-3.5" /> Stop
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => void refresh()} title="Rescan windows">
              <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            </Button>
          </div>
        </div>
      </header>

      <ScrollArea className="scroll-thin min-h-0 flex-1">
        <div className="space-y-4 p-4">
          {status && !status.attached && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-[11px] text-amber-300">
              <ShieldAlert className="mb-1 h-3.5 w-3.5" />
              Desktop engine not attached{status.reason ? ` — ${status.reason}` : ''}. It attaches
              lazily on first use and honest-fails on headless / no-display.
            </div>
          )}

          {caps && (
            <div className="flex flex-wrap gap-1">
              {Object.entries({
                see: caps.see, tree: caps.uia_tree, input: caps.send_input,
                ocr: caps.ocr, windows: caps.window_list, launch: caps.launch_app,
              }).map(([k, v]) => (
                <Badge key={k} variant="outline" className={cn('text-[9px]', v ? 'text-emerald-300' : 'text-muted-foreground/50')}>
                  {k}
                </Badge>
              ))}
            </div>
          )}

          <div>
            <div className="mb-2 text-xs font-medium">Windows</div>
            <div className="space-y-1">
              {windows.length === 0 ? (
                <div className="rounded-md border border-dashed border-border p-4 text-center text-[11px] text-muted-foreground">
                  No windows enumerated
                </div>
              ) : (
                windows.map((w) => (
                  <button
                    key={w.id}
                    onClick={() => { setSelected(w.id); setTree(''); setShot(null) }}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md border px-3 py-1.5 text-left',
                      selected === w.id ? 'border-orange-500/50 bg-orange-500/5' : 'border-border bg-card hover:bg-accent/40',
                    )}
                  >
                    <span className="font-mono text-[10px] text-muted-foreground">#{w.id}</span>
                    <span className="flex-1 truncate text-xs text-foreground">{w.title || '(untitled)'}</span>
                    <Badge variant="secondary" className="text-[9px]">{w.app}</Badge>
                    <span className="font-mono text-[9px] text-muted-foreground">{w.width}×{w.height}</span>
                  </button>
                ))
              )}
            </div>
          </div>

          {selected !== null && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" disabled={busy} onClick={() => void seeWindow()}>
                  <Eye className="h-3 w-3" /> See
                </Button>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => void readWindow()}>
                  <FileText className="h-3 w-3" /> Read tree
                </Button>
              </div>

              <div className="flex gap-2">
                <Input
                  value={typeText}
                  onChange={(e) => setTypeText(e.target.value)}
                  placeholder="Text to type into the focused control…"
                  className="h-8 flex-1 text-xs"
                />
                <Button size="sm" variant="default" className="bg-orange-500 text-black hover:bg-orange-400" disabled={busy || !typeText.trim()} onClick={() => void typeInto()}>
                  <MousePointerClick className="h-3 w-3" /> Type
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Acts are audited with human-gesture provenance. Risky classes (delete / payment /
                install / captcha / transmit) fail closed — they never execute silently from here.
              </p>

              {shot && (
                <div className="overflow-hidden rounded-md border border-border">
                  <img src={shot} alt="window capture" className="w-full" />
                </div>
              )}
              {tree && (
                <pre className="max-h-64 overflow-auto rounded-md border border-border bg-card p-2 font-mono text-[10px] text-foreground/90">
                  {tree}
                </pre>
              )}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
