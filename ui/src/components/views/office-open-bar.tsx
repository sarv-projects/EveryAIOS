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

/** P50.3.7 — supported engine extensions (matches the store's openOfficeDoc). */
export const OFFICE_EXTENSIONS = ['docx', 'xlsx', 'xlsm', 'pptx', 'pdf']

/** P33.6 — a Google Docs/Sheets/Drive link routes to the authenticated browser view. */
export function isGoogleDocUrl(raw: string): boolean {
  try {
    const host = new URL(raw.trim()).hostname.toLowerCase()
    if (GOOGLE_DOC_HOSTS.includes(host)) return true
    // Country domains: docs.google.co.uk, drive.google.de, … — the TLD part
    // is one (or two, e.g. .co.uk) 2-letter labels only, so lookalike hosts
    // like docs.google.com.evil.example can never match (P33.6).
    return /^(docs|sheets|drive)\.google\.[a-z]{2}(\.[a-z]{2})?$/.test(host)
  } catch {
    return false
  }
}

/** Extension guard with an honest refusal reason (null = openable). */
export function officeExtensionError(raw: string): string | null {
  const base = raw.trim().split(/[?#]/)[0]
  const ext = base.split('.').pop()?.toLowerCase() ?? ''
  if (!ext || !OFFICE_EXTENSIONS.includes(ext)) {
    return `“${base}” is not openable here — supported: ${OFFICE_EXTENSIONS.map((e) => `.${e}`).join(' ')} (legacy .doc/.xls/.ppt convert in LibreOffice)`
  }
  return null
}

export function OfficeOpenBar({ onOpen, livePath }: Props) {
  const [path, setPath] = useState('')
  const [busy, setBusy] = useState(false)
  const [hint, setHint] = useState<string | null>(null)
  const openInBrowser = useAppStore((s) => s.openInBrowser)
  const notify = useAppStore((s) => s.notify)
  const canOpen = inTauri() && path.trim().length > 0
  const isGoogle = isGoogleDocUrl(path)

  const open = async () => {
    if (!canOpen || busy) return
    await openPath(path.trim())
  }

  const openPath = async (raw: string) => {
    if (isGoogleDocUrl(raw)) {
      // Google Docs/Sheets — normal access = authenticated browser view.
      openInBrowser(raw)
      setPath('')
      setHint(null)
      return
    }
    // P50.3.7 — refuse unsupported extensions before the engine round-trip.
    const extErr = officeExtensionError(raw)
    if (extErr) {
      setHint(extErr)
      notify(extErr)
      return
    }
    setHint(null)
    setBusy(true)
    try {
      await onOpen(raw)
    } finally {
      setBusy(false)
    }
  }

  // Native file picker (Tauri shell only): no more guessing absolute paths.
  // Falls back to the typed path when the dialog plugin is unavailable.
  const browse = async () => {
    if (!inTauri() || busy) return
    setBusy(true)
    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const picked = await open({
        multiple: false,
        directory: false,
        title: 'Open a document',
        filters: [{ name: 'Documents', extensions: [...OFFICE_EXTENSIONS] }],
      })
      if (typeof picked === 'string' && picked.length > 0) {
        setPath(picked)
        await openPath(picked)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'file dialog unavailable — type the path instead'
      setHint(msg)
      notify(msg)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col border-b border-border bg-zinc-900/40">
    <div className="flex items-center gap-1.5 px-3 py-1.5">
      <Input
        value={path}
        onChange={(e) => { setPath(e.target.value); setHint(null) }}
        onKeyDown={(e) => e.key === 'Enter' && open()}
        placeholder={
          inTauri()
            ? 'Browse… or paste an absolute path — /…/file.docx (.docx .xlsx .pptx .pdf)'
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
      {inTauri() && (
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          className="h-6 gap-1 px-2 text-[10px]"
          onClick={browse}
          title="Browse for a file"
        >
          <FolderOpen className="h-3 w-3" />
          Browse
        </Button>
      )}
      {livePath && (
        <span className="max-w-[180px] truncate font-mono text-[9px] text-muted-foreground/60">
          {livePath}
        </span>
      )}
    </div>
    {hint && (
      <div className="px-3 pb-1.5 font-mono text-[9px] text-amber-300">{hint}</div>
    )}
    </div>
  )
}
