'use client'

import { FileCode2, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface OpenFile {
  path: string
  name: string
  content: string
  dirty?: boolean
}

export function EditorTabs({
  files,
  activePath,
  onSelect,
  onClose,
}: {
  files: OpenFile[]
  activePath: string | null
  onSelect: (path: string) => void
  onClose: (path: string) => void
}) {
  return (
    <div className="flex h-8 shrink-0 items-end overflow-x-auto border-b border-border bg-card/60 no-select">
      {files.length === 0 && (
        <div className="flex h-full items-center px-3 text-[10px] text-muted-foreground">
          Open a file from the explorer to start editing
        </div>
      )}
      {files.map((f) => {
        const active = f.path === activePath
        return (
          <div
            key={f.path}
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(f.path)}
            className={cn(
              'group flex h-full max-w-44 cursor-pointer items-center gap-1.5 border-r border-border px-2.5 text-[11px] transition-colors',
              active
                ? 'border-t-2 border-t-primary bg-background text-foreground'
                : 'text-muted-foreground hover:bg-accent/40'
            )}
          >
            <FileCode2 className={cn('h-3 w-3 shrink-0', active ? 'text-primary' : 'text-muted-foreground/60')} />
            <span className="truncate">{f.name}</span>
            <span
              role="button"
              aria-label={`Close ${f.name}`}
              onClick={(e) => {
                e.stopPropagation()
                onClose(f.path)
              }}
              className="rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-accent"
            >
              <X className="h-3 w-3" />
            </span>
            {f.dirty && !active && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
          </div>
        )
      })}
    </div>
  )
}
