'use client'

// P4.7 — shared "open a real file" affordance for the office viewers. Type a
// path and the Rust office engine reads it (surgical OOXML / lopdf); until a
// real file is opened the viewer keeps its demo content.

import { useState } from 'react'
import { FolderOpen, Globe, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { inTauri } from '@/lib/tauri'
import { useAppStore } from '@/lib/store'

interface Props {
  onOpen: (path: string) => Promise<void>
  /** The currently open path (or the demo filename). */
  livePath?: string
}

const GOOGLE_DOC_HOSTS = ['docs.google.com', 'sheets.google.com', 'drive.google.com']

/** P33.6 — a Google Docs/Sheets/Drive link routes to the authenticated browser view. */
export function isGoogleDocUrl(raw: string): boolean {
  try {
    const u = new URL(raw.trim())
    return GOOGLE_DOC_HOSTS.includes(u.hostname)
  } catch {
    return false
  }
}

export function OfficeOpenBar({ onOpen, livePath }: Props) {
  const [path, setPath] = useState('')
  const [busy, setBusy] = useState(false)
  const openInBrowser = useAppStore((s) => s.openInBrowser)
  const canOpen = inTauri() && path.trim().length > 0
  const isGoogle = isGoogleDocUrl(path)

  const open = async () => {
    if (!canOpen || busy) return
    if (isGoogle) {
      // Google Docs/Sheets — normal access = authenticated browser view.
      openInBrowser(path.trim())
      setPath('')
      return
    }
    setBusy(true)
    try {
      await onOpen(path.trim())
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-1.5 border-b border-border bg-zinc-900/40 px-3 py-1.5">
      <Input
        value={path}
        onChange={(e) => setPath(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && open()}
        placeholder={
          inTauri()
            ? '/path/to/file.docx'
            : 'Open a real file (Tauri shell only) — demo shown'
        }
        disabled={!inTauri()}
        className="h-6 flex-1 rounded-md border-border bg-zinc-950 font-mono text-[10px]"
      />
      <Button
        size="sm"
        variant="outline"
        disabled={!canOpen}
        className="h-6 gap-1 px-2 text-[10px]"
        onClick={open}
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : isGoogle ? <Globe className="h-3 w-3" /> : <FolderOpen className="h-3 w-3" />}
        {isGoogle ? 'Open in browser' : 'Open'}
      </Button>
      {livePath && (
        <span className="max-w-[180px] truncate font-mono text-[9px] text-muted-foreground/60">
          {livePath}
        </span>
      )}
    </div>
  )
}
