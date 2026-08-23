'use client'

import { useEffect, useRef, useState } from 'react'
import { Terminal as TerminalIcon, Square, Play, RotateCcw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { shellSpawn, shellWrite, shellKill, onShellEvent, type ShellEvent } from '@/lib/shell'
import { useAppStore } from '@/lib/store'

type Line =
  | { kind: 'prompt'; text: string }
  | { kind: 'out'; text: string; tone?: 'ok' | 'err' | 'info' | 'muted' }
  | { kind: 'sys'; text: string }

/**
 * P11.5.3 — shell view over a real process. On mount it spawns an
 * interactive shell (sh/cmd) via `shell_spawn`; commands go through
 * `shell_write`, output streams back as `shell-event` frames. Honest
 * ceiling: piped stdio, not a PTY — no full-screen TUI apps.
 */
export default function ShellView() {
  const activeSessionId = useAppStore((s) => s.activeSessionId)
  const [lines, setLines] = useState<Line[]>([
    { kind: 'sys', text: 'EveryAIOS shell — commands run in a real process.' },
  ])
  const [input, setInput] = useState('')
  const [alive, setAlive] = useState(false)
  const [busy, setBusy] = useState(false)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const booted = useRef<string | null>(null)

  // Spawn once per session.
  useEffect(() => {
    if (booted.current === activeSessionId) return
    booted.current = activeSessionId
    setLines([{ kind: 'sys', text: 'EveryAIOS shell — commands run in a real process.' }])
    setBusy(true)
    void shellSpawn(activeSessionId).then(() => {
      setAlive(true)
      setBusy(false)
      inputRef.current?.focus()
    })
    return () => {
      void shellKill(activeSessionId)
      setAlive(false)
    }
  }, [activeSessionId])

  // Stream output frames.
  useEffect(() => {
    return onShellEvent((ev: ShellEvent) => {
      if (ev.sessionId !== activeSessionId) return
      if (ev.kind === 'exit') {
        setAlive(false)
        return
      }
      setLines((prev) => [
        ...prev,
        { kind: 'out', text: ev.line, tone: ev.kind === 'err' ? 'err' : undefined },
      ])
    })
  }, [activeSessionId])

  // Auto-scroll to bottom.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [lines])

  const submit = () => {
    const cmd = input.trim()
    if (!cmd || !alive) return
    setLines((prev) => [...prev, { kind: 'prompt', text: cmd }])
    setInput('')
    void shellWrite(activeSessionId, cmd)
  }

  return (
    <div className="flex h-full w-full flex-col bg-zinc-950">
      <header className="flex items-center justify-between border-b border-border px-4 py-2">
        <div className="flex items-center gap-3 font-mono text-xs">
          <span className="flex items-center gap-1.5 font-medium text-foreground">
            <TerminalIcon className="h-3.5 w-3.5 text-orange-400" />
            Shell
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={cn(
              'gap-1 text-[10px]',
              alive
                ? 'border-orange-500/40 bg-orange-500/10 text-orange-300'
                : 'border-border bg-zinc-900 text-muted-foreground'
            )}
          >
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                alive ? 'live-dot bg-orange-500' : 'bg-muted-foreground'
              )}
            />
            {alive ? 'Live process' : busy ? 'Starting…' : 'Stopped'}
          </Badge>
        </div>
      </header>

      <div
        ref={scrollRef}
        className="scanline relative min-h-0 flex-1 overflow-auto p-4 font-mono text-[13px] leading-relaxed scroll-thin"
      >
        {lines.map((l, i) => {
          if (l.kind === 'sys') {
            return <div key={i} className="text-[10px] text-muted-foreground">{l.text}</div>
          }
          if (l.kind === 'prompt') {
            return (
              <div key={i} className="flex gap-2">
                <span className="select-none text-emerald-400">$</span>
                <span className="text-foreground">{l.text}</span>
              </div>
            )
          }
          return (
            <div
              key={i}
              className={cn(
                'whitespace-pre-wrap pl-4',
                l.tone === 'err' && 'text-rose-400',
                l.tone === 'info' && 'text-sky-300',
                l.tone === 'muted' && 'text-muted-foreground'
              )}
            >
              {l.text}
            </div>
          )
        })}
      </div>

      <div className="flex items-center gap-2 border-t border-border bg-zinc-900 px-3 py-2 font-mono text-[12px]">
        <span className="select-none text-emerald-400">$</span>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder={alive ? 'type a command…' : 'shell stopped'}
          disabled={!alive}
          aria-label="Shell command input"
          className="min-w-0 flex-1 bg-transparent text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
        />
        {alive ? (
          <button
            onClick={submit}
            aria-label="Run command"
            className="rounded border border-border px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground"
          >
            <Play className="h-3 w-3" />
          </button>
        ) : (
          <button
            onClick={() => {
              setBusy(true)
              void shellSpawn(activeSessionId).then(() => {
                setAlive(true)
                setBusy(false)
              })
            }}
            aria-label="Restart shell"
            className="flex items-center gap-1 rounded border border-border px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="h-3 w-3" /> Restart
          </button>
        )}
        {alive && (
          <button
            onClick={() => {
              void shellKill(activeSessionId)
              setAlive(false)
            }}
            aria-label="Kill shell"
            className="rounded border border-border px-2 py-0.5 text-[10px] text-muted-foreground hover:text-rose-400"
          >
            <Square className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  )
}
