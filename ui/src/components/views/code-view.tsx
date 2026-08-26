'use client'

import { useEffect, useRef, useState } from 'react'
import { ExternalLink, FileCode2, Save, Sparkles, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { fsReadFile } from '@/lib/fs'
import { useAppStore } from '@/lib/store'
import { SkeletonBlock } from '@/components/ui/loading-state'

interface OpenFile {
  path: string
  name: string
  content: string
  binary?: boolean
  truncated?: boolean
}

/**
 * P11.5.3 — code view over a real file. The folder view dispatches
 * `everyaios:open-file`; this editor loads the file, edits in a
 * line-numbered textarea with syntax-highlight preview (highlight.js), and
 * saves back through `fs_write_file`. "Open in Cursor" is the deep-IDE
 * escape (launches the system handler for the file). LSP hover/refs/
 * diagnostics stay a documented follow-up — the editor itself is real.
 */
export default function CodeView() {
  const [file, setFile] = useState<OpenFile | null>(null)
  const [draft, setDraft] = useState('')
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const setActiveView = useAppStore((s) => s.setActiveView)
  const setCenterScreen = useAppStore((s) => s.setCenterScreen)
  const pushUserMessage = useAppStore((s) => s.pushUserMessage)
  const setComposerValue = useAppStore((s) => s.setComposerValue)
  const ta = useRef<HTMLTextAreaElement | null>(null)
  const [selection, setSelection] = useState('')

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<OpenFile>).detail
      void fsReadFile(detail.path).then((f) => {
        setFile({ path: f.path, name: f.name, content: f.content, binary: f.binary, truncated: f.truncated })
        setDraft(f.content)
        setDirty(false)
        setSavedAt(null)
        setError(null)
      })
    }
    window.addEventListener('everyaios:open-file', handler)
    return () => window.removeEventListener('everyaios:open-file', handler)
  }, [])

  const save = async () => {
    if (!file) return
    setSaving(true)
    setError(null)
    try {
      // Bugfix 4 — the older code view must respect the same Guard-2 floor as
      // the ticketed Monaco editor: a buffer write mints a Guard-2 ticket and
      // commits only after it's approved. No unguarded fs_write_file straight
      // into the workspace.
      const { fsWriteTicket, fsWriteCommit } = await import('@/lib/fs')
      const ticket = await fsWriteTicket(file.path, draft)
      if (ticket.action === 'allow') {
        await fsWriteCommit(file.path, draft, ticket.ticketId)
        setDirty(false)
        setSavedAt(new Date().toLocaleTimeString())
      } else {
        // Card pending: park the write (the guard panel commits on approval).
        // The buffer stays dirty until the write lands.
        const st = (await import('@/lib/store')).useAppStore.getState()
        st.parkEditorWrite(ticket.ticketId, { path: file.path, content: draft })
        st.setCenterScreen('guard')
        st.notify('Guard-2 card created — approve to save')
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  const openInCursor = () => {
    // Deep-IDE escape: hand the real path to the OS handler (Cursor/VS Code).
    window.open(`vscode://file/${encodeURIComponent(file!.path)}`, '_blank')
  }

  // P11.5.3 — in-place highlight-edit (Cowork "Edit with Claude" pattern):
  // selecting text reveals an "Edit with AI" action that sends the selection
  // (with the file path as context) into the chat so the agent patches it in
  // place through its existing edit tools.
  const trackSelection = () => {
    const el = ta.current
    if (!el) return
    setSelection(el.value.slice(el.selectionStart ?? 0, el.selectionEnd ?? 0))
  }

  const editWithAi = () => {
    if (!selection.trim() || !file) return
    pushUserMessage(
      `Edit the selected text in ${file.name} (${file.path}):\n\n\`\`\`\n${selection}\n\`\`\``,
    )
    setCenterScreen('chat')
    setSelection('')
    setComposerValue('Edit the selected text: ' + selection.slice(0, 80))
  }

  if (!file) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-center">
        <FileCode2 className="h-5 w-5 text-muted-foreground/50" />
        <p className="text-xs text-muted-foreground">
          Open a text file from the folder view — it loads here for editing.
        </p>
      </div>
    )
  }

  const lineCount = draft.split('\n').length

  return (
    <div className="flex h-full w-full flex-col">
      <header className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <FileCode2 className="h-3.5 w-3.5 shrink-0 text-orange-400" />
          <span className="truncate font-mono text-xs text-foreground">{file.path}</span>
          <Badge variant="outline" className="text-[9px]">
            {lineCount} lines
          </Badge>
          {file.binary && <Badge className="text-[9px]">binary</Badge>}
          {file.truncated && <Badge className="text-[9px]">truncated &gt;2MB</Badge>}
        </div>
        <div className="flex items-center gap-1.5">
          {savedAt && <span className="font-mono text-[10px] text-emerald-400">saved {savedAt}</span>}
          {selection.trim() && (
            <button
              onClick={editWithAi}
              aria-label="Edit selection with AI"
              className="flex items-center gap-1 rounded border border-primary/50 bg-primary/10 px-2 py-1 text-[10px] font-medium text-primary hover:bg-primary/15"
            >
              <Sparkles className="h-3 w-3" /> Edit with AI ({selection.length} chars)
            </button>
          )}
          <button
            onClick={openInCursor}
            aria-label="Open in Cursor"
            className="flex items-center gap-1 rounded border border-border px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground"
          >
            <ExternalLink className="h-3 w-3" /> Open in Cursor
          </button>
          <button
            onClick={() => void save()}
            disabled={!dirty || saving}
            className={cn(
              'flex items-center gap-1 rounded border px-2 py-1 text-[10px] font-medium transition-colors',
              dirty
                ? 'border-primary/50 bg-primary/10 text-primary hover:bg-primary/15'
                : 'border-border text-muted-foreground'
            )}
          >
            <Save className="h-3 w-3" /> {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            onClick={() => setActiveView('folder' as never)}
            aria-label="Close file"
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      {error && <div className="border-b border-destructive/30 bg-destructive/5 px-3 py-1 text-xs text-destructive">{error}</div>}

      <div className="relative min-h-0 flex-1 overflow-auto bg-zinc-950">
        <textarea
          ref={ta}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value)
            setDirty(true)
          }}
          onSelect={trackSelection}
          onKeyUp={trackSelection}
          spellCheck={false}
          aria-label={`Editor for ${file.name}`}
          className="absolute inset-0 resize-none bg-transparent p-3 pl-12 font-mono text-[12px] leading-relaxed text-zinc-200 caret-orange-400 focus:outline-none"
        />
        {/* line numbers */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 w-9 select-none border-r border-zinc-800/80 bg-zinc-900/70 p-3 text-right font-mono text-[12px] leading-relaxed text-zinc-600"
        >
          {Array.from({ length: lineCount }).map((_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>
      </div>

      <footer className="border-t border-border px-3 py-1.5 font-mono text-[10px] text-muted-foreground">
        {dirty ? '● unsaved changes' : 'saved'} · syntax highlighting preview + LSP follow-up
      </footer>
    </div>
  )
}
