'use client'

import { useEffect, useRef, useState } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import type { editor } from 'monaco-editor'
import { Save } from 'lucide-react'
// Local Monaco + workers (MIT, offline for Tauri) — must run before the
// Editor mounts or @monaco-editor/react falls back to a CDN fetch.
import '@/lib/monaco'
import { fsWriteFile } from '@/lib/fs'
import type { OpenFile } from './editor-tabs'

/**
 * P11.5.3 — Monaco editor pane (MIT — VS Code's editor component): syntax
 * highlighting, minimap, multi-cursor, find/replace, inline diff — the full
 * VS Code editing surface, bound to a real file. Dirty tracking + Save via
 * `fs_write_file`; the bottom row reports language, Ln/Col and branch-less
 * status. LSP hover/diagnostics land through `lsp_cmds` in the Problems
 * panel (separate component).
 */
export function MonacoPane({
  file,
  onDirty,
  onSaved,
}: {
  file: OpenFile
  onDirty: (path: string, dirty: boolean) => void
  onSaved: (path: string, content: string) => void
}) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [cursor, setCursor] = useState({ line: 1, col: 1 })
  const [savedFlash, setSavedFlash] = useState(false)

  const language = langFor(file.name)

  // Reset dirty when the file (tab) switches.
  useEffect(() => {
    setDirty(false)
  }, [file.path])

  const handleMount: OnMount = (ed) => {
    editorRef.current = ed
    ed.onDidChangeCursorPosition((e) =>
      setCursor({ line: e.position.lineNumber, col: e.position.column })
    )
  }

  const save = async () => {
    const content = editorRef.current?.getValue() ?? file.content
    setSaving(true)
    try {
      await fsWriteFile(file.path, content)
      setDirty(false)
      onDirty(file.path, false)
      onSaved(file.path, content)
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 1200)
    } catch {
      /* surface via status row? keep silent — the error is in the console */
    } finally {
      setSaving(false)
    }
  }

  const onChange = (value: string | undefined) => {
    const next = value !== undefined
    setDirty(next)
    onDirty(file.path, next)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative min-h-0 flex-1">
        <Editor
          path={file.path}
          defaultLanguage={language}
          value={file.content}
          theme="vs-dark"
          onChange={onChange}
          onMount={handleMount}
          options={{
            fontSize: 12.5,
            fontFamily: 'JetBrains Mono, ui-monospace, monospace',
            minimap: { enabled: true, scale: 0.8 },
            scrollBeyondLastLine: false,
            renderLineHighlight: 'all',
            tabSize: 2,
            padding: { top: 8 },
            automaticLayout: true,
            scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
          }}
        />
      </div>
      <div className="flex h-6 shrink-0 items-center gap-3 border-t border-border bg-sidebar/60 px-3 font-mono text-[10px] text-muted-foreground no-select">
        <span className="text-emerald-400/80">●</span>
        <span>{language}</span>
        <span>UTF-8</span>
        <span>Ln {cursor.line}, Col {cursor.col}</span>
        <span className="flex-1" />
        {savedFlash && <span className="text-emerald-400">saved</span>}
        {dirty && <span className="text-primary">● unsaved</span>}
        <button
          onClick={() => void save()}
          disabled={!dirty || saving}
          className={cnButton(dirty)}
          aria-label="Save file"
        >
          <Save className="h-3 w-3" />
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}

function langFor(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    rs: 'rust', py: 'python', go: 'go', json: 'json', md: 'markdown',
    html: 'html', css: 'css', scss: 'scss', sh: 'shell', yml: 'yaml', yaml: 'yaml',
    toml: 'ini', xml: 'xml', java: 'java', c: 'c', h: 'c', cpp: 'cpp', hpp: 'cpp',
  }
  return map[ext] ?? 'plaintext'
}

function cnButton(dirty: boolean): string {
  return [
    'flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] transition-colors',
    dirty
      ? 'border-primary/50 bg-primary/10 text-primary hover:bg-primary/15'
      : 'border-border text-muted-foreground',
  ].join(' ')
}
