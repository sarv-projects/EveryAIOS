'use client'

import { useState } from 'react'
import { History, ChevronDown, Terminal as TerminalIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

type Line =
  | { kind: 'prompt'; text: string }
  | { kind: 'out'; text: string; tone?: 'ok' | 'info' | 'muted' }
  | { kind: 'cursor' }

const HISTORY: Line[] = [
  { kind: 'prompt', text: 'npm install' },
  { kind: 'out', text: 'added 142 packages in 3.2s', tone: 'muted' },
  { kind: 'prompt', text: 'npm test' },
  { kind: 'out', text: 'PASS src/utils.test.ts', tone: 'ok' },
  { kind: 'out', text: 'PASS src/api.test.ts', tone: 'ok' },
  { kind: 'out', text: '42 tests passed', tone: 'info' },
  { kind: 'prompt', text: 'npm run build' },
  { kind: 'out', text: '✓ Compiled successfully in 4.1s', tone: 'ok' },
  { kind: 'out', text: '✓ Generating static pages (12/12)', tone: 'ok' },
  { kind: 'out', text: '✓ Build complete', tone: 'ok' },
  { kind: 'cursor' },
]

export default function ShellView() {
  const [readOnly, setReadOnly] = useState(true)
  const [showHistory, setShowHistory] = useState(false)

  return (
    <div className="flex h-full w-full flex-col bg-zinc-950">
      <header className="flex items-center justify-between border-b border-border px-4 py-2">
        <div className="flex items-center gap-3 font-mono text-xs">
          <span className="flex items-center gap-1.5 font-medium text-foreground">
            <TerminalIcon className="h-3.5 w-3.5 text-orange-400" />
            Shell
          </span>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
          >
            <History className="h-3 w-3" />
            <span>History</span>
            <ChevronDown
              className={cn('h-3 w-3 transition-transform', showHistory && 'rotate-180')}
            />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setReadOnly(!readOnly)}
            className={cn(
              'flex items-center gap-1 rounded border px-2 py-0.5 font-mono text-[10px] transition-colors',
              readOnly
                ? 'border-border bg-zinc-900 text-muted-foreground'
                : 'border-orange-500/40 bg-orange-500/10 text-orange-300'
            )}
            title="Toggle to run commands"
          >
            {readOnly ? 'Read-only' : 'Interactive'} <ChevronDown className="h-2.5 w-2.5" />
          </button>
          <Badge
            variant="outline"
            className="gap-1 border-orange-500/40 bg-orange-500/10 text-[10px] text-orange-300"
          >
            <span className="live-dot h-1.5 w-1.5 rounded-full bg-orange-500" />
            Agent shell
          </Badge>
        </div>
      </header>

      {showHistory && (
        <div className="border-b border-border bg-zinc-900/60 px-4 py-2 font-mono text-[10px] text-muted-foreground shadow-inset-soft">
          <div className="mb-1 text-[9px] uppercase tracking-wide">Session history</div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 lg:grid-cols-3">
            <span>#1 npm install</span>
            <span>#2 npm test</span>
            <span>#3 npm run build</span>
            <span>#4 git status</span>
            <span>#5 cat .env</span>
            <span className="text-orange-300">#6 tsc --noEmit ●</span>
          </div>
        </div>
      )}

      <div className="scanline relative min-h-0 flex-1 overflow-auto font-mono text-[13px] leading-relaxed scroll-thin p-4">
        {HISTORY.map((l, i) => {
          if (l.kind === 'prompt') {
            return (
              <div key={i} className="flex gap-2">
                <span className="select-none text-emerald-400">$</span>
                <span className="text-foreground">{l.text}</span>
              </div>
            )
          }
          if (l.kind === 'out') {
            return (
              <div
                key={i}
                className={cn(
                  'whitespace-pre-wrap pl-4',
                  l.tone === 'ok' && 'text-emerald-400',
                  l.tone === 'info' && 'text-sky-300',
                  l.tone === 'muted' && 'text-muted-foreground'
                )}
              >
                {l.text}
              </div>
            )
          }
          return (
            <div key={i} className="flex gap-2">
              <span className="select-none text-emerald-400">$</span>
              <span className="caret-blink inline-block h-4 w-2 bg-orange-400 align-middle" />
            </div>
          )
        })}
      </div>

      {!readOnly && (
        <div className="border-t border-border bg-zinc-900 px-4 py-2 font-mono text-[11px] text-muted-foreground">
          <span className="text-orange-300">▸</span> Toggle active — agent will execute commands
          on submit.
        </div>
      )}
    </div>
  )
}
