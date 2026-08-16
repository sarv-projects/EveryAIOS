'use client'

import { Circle, FileCode2, GitBranch, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

type Line = {
  n: number
  code: React.ReactNode
  diff?: 'add' | 'del'
}

const CODE: Line[] = [
  {
    n: 1,
    code: (
      <>
        <span className="text-purple-400">import</span>{' '}
        <span className="text-orange-300">{'{ Router }'}</span>{' '}
        <span className="text-purple-400">from</span>{' '}
        <span className="text-emerald-400">'express'</span>
      </>
    ),
  },
  {
    n: 2,
    code: (
      <>
        <span className="text-purple-400">import</span>{' '}
        <span className="text-orange-300">{'{ db }'}</span>{' '}
        <span className="text-purple-400">from</span>{' '}
        <span className="text-emerald-400">'../db'</span>
      </>
    ),
  },
  { n: 3, code: <span>&nbsp;</span> },
  {
    n: 4,
    diff: 'add',
    code: (
      <>
        <span className="text-emerald-500">+ </span>
        <span className="text-purple-400">export async function</span>{' '}
        <span className="text-sky-300">getUsers</span>
        <span className="text-foreground">()</span>
        <span className="text-foreground">{' {'}</span>
      </>
    ),
  },
  {
    n: 5,
    diff: 'add',
    code: (
      <>
        <span className="text-emerald-500">+ </span>
        <span className="text-foreground">{'  '}</span>
        <span className="text-purple-400">const</span>{' '}
        <span className="text-foreground">users = </span>
        <span className="text-purple-400">await</span>{' '}
        <span className="text-foreground">db.</span>
        <span className="text-sky-300">query</span>
        <span className="text-foreground">(</span>
      </>
    ),
  },
  {
    n: 6,
    diff: 'add',
    code: (
      <>
        <span className="text-emerald-500">+ </span>
        <span className="text-foreground">{'    '}</span>
        <span className="text-emerald-400">'SELECT * FROM users'</span>
      </>
    ),
  },
  {
    n: 7,
    diff: 'add',
    code: (
      <>
        <span className="text-emerald-500">+ </span>
        <span className="text-foreground">{'  )'}</span>
      </>
    ),
  },
  {
    n: 8,
    diff: 'add',
    code: (
      <>
        <span className="text-emerald-500">+ </span>
        <span className="text-foreground">{'  '}</span>
        <span className="text-purple-400">return</span>
        <span className="text-foreground"> users</span>
      </>
    ),
  },
  {
    n: 9,
    diff: 'add',
    code: (
      <>
        <span className="text-emerald-500">+ </span>
        <span className="text-foreground">{'}'}</span>
      </>
    ),
  },
]

export default function CodeView() {
  return (
    <div className="flex h-full w-full flex-col bg-zinc-950">
      <header className="flex items-center gap-1 border-b border-border px-2 py-1">
        <div className="flex items-center gap-1.5 rounded-t-md border border-b-0 border-border bg-zinc-900 px-3 py-1.5">
          <FileCode2 className="h-3.5 w-3.5 text-orange-400" />
          <span className="font-mono text-xs text-foreground">src/api/users.ts</span>
          <Circle className="ml-1 h-2 w-2 fill-orange-500 text-orange-500" />
        </div>
        <div className="flex items-center gap-1.5 rounded-t-md border border-b-0 border-border px-3 py-1.5 opacity-60">
          <FileCode2 className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-mono text-xs text-muted-foreground">src/db.ts</span>
        </div>
        <button className="ml-auto rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
          <X className="h-3.5 w-3.5" />
        </button>
      </header>

      <div className="flex items-center gap-2 border-b border-border bg-zinc-900/40 px-3 py-1 font-mono text-[10px] text-muted-foreground">
        <GitBranch className="h-3 w-3" />
        <span>main</span>
        <span className="text-orange-300">+5 −0</span>
        <span className="ml-auto">Refactor: extract getUsers() helper</span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto scroll-thin">
        <table className="w-full border-collapse font-mono text-[12.5px] leading-[1.55]">
          <tbody>
            {CODE.map((l) => (
              <tr
                key={l.n}
                className={cn(
                  l.diff === 'add' && 'bg-emerald-500/10',
                  l.diff === 'del' && 'bg-red-500/10'
                )}
              >
                <td className="w-10 select-none border-r border-border px-2 text-right text-[10px] text-muted-foreground/60">
                  {l.n}
                </td>
                <td className="whitespace-pre px-2 text-foreground">{l.code}</td>
              </tr>
            ))}
            <tr>
              <td className="w-10 select-none border-r border-border px-2 text-right text-[10px] text-muted-foreground/60">
                10
              </td>
              <td className="px-2">
                <span className="caret-blink inline-block h-4 w-1.5 bg-orange-400 align-middle" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <footer className="flex items-center justify-between border-t border-border bg-zinc-900/60 px-3 py-1 font-mono text-[10px] text-muted-foreground">
        <span>Ln 4, Col 1</span>
        <span className="flex items-center gap-3">
          <span>TypeScript</span>
          <span>UTF-8</span>
          <Badge
            variant="outline"
            className="gap-1 border-orange-500/40 text-[9px] text-orange-300"
          >
            <Circle className="h-1.5 w-1.5 fill-orange-500 text-orange-500" />
            Modified
          </Badge>
        </span>
      </footer>
    </div>
  )
}
