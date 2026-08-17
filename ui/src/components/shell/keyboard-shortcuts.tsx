'use client'

import * as React from 'react'
import {
  Keyboard,
  X,
} from 'lucide-react'
import { useAppStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'

// Full shortcuts catalog
const SHORTCUTS = [
  { group: 'Navigation', items: [
    { keys: '⌘ K', action: 'Command palette' },
    { keys: '⌘ B', action: 'Toggle sidebar' },
    { keys: '⌘ .', action: 'Casual ⇄ power mode' },
    { keys: '⌘ \\', action: 'Toggle viewport' },
    { keys: '⌘ N', action: 'New session' },
    { keys: '⌘ 1–5', action: 'Switch to session 1–5' },
  ]},
  { group: 'Views', items: [
    { keys: '⌘⇧ E', action: 'Folder view' },
    { keys: 'Ctrl `', action: 'Shell view' },
    { keys: '⌘⇧ B', action: 'Browse view' },
    { keys: '⌘⇧ C', action: 'Code view' },
    { keys: '⌘⇧ O', action: 'Office view' },
    { keys: '⌘⇧ P', action: 'Progress view' },
    { keys: '⌘⇧ T', action: 'Trajectory view' },
  ]},
  { group: 'Panels', items: [
    { keys: '⌘⇧ A', action: 'Automations' },
    { keys: '⌘⇧ G', action: 'Guard' },
    { keys: '⌘⇧ M', action: 'Memory' },
  ]},
  { group: 'Agent', items: [
    { keys: '⌘⇧ 1', action: 'Switch to Claude Code' },
    { keys: '⌘⇧ 2', action: 'Switch to Codex CLI' },
    { keys: '⌘⇧ 3', action: 'Switch to Grok Build' },
    { keys: 'Esc', action: 'Pause / resume agent' },
  ]},
  { group: 'Chat', items: [
    { keys: 'Enter', action: 'Send message' },
    { keys: '⇧ Enter', action: 'New line' },
    { keys: 'Esc', action: 'Clear input' },
  ]},
]

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-[20px] items-center justify-center rounded border border-border bg-muted/60 px-1.5 text-[10px] font-mono text-foreground/80">
      {children}
    </kbd>
  )
}

export function KeyboardShortcuts() {
  const setPaletteOpen = useAppStore((s) => s.setPaletteOpen)
  const toggleSidebar = useAppStore((s) => s.toggleSidebar)
  const toggleRail = useAppStore((s) => s.toggleRail)
  const togglePowerMode = useAppStore((s) => s.togglePowerMode)
  const setActiveView = useAppStore((s) => s.setActiveView)
  const setCenterScreen = useAppStore((s) => s.setCenterScreen)
  const toggleAgentPause = useAppStore((s) => s.toggleAgentPause)
  const notify = useAppStore((s) => s.notify)
  const newSession = useAppStore((s) => s.newSession)
  const setActiveSession = useAppStore((s) => s.setActiveSession)
  const sessions = useAppStore((s) => s.sessions)
  const activeSessionId = useAppStore((s) => s.activeSessionId)

  const [overlayOpen, setOverlayOpen] = React.useState(false)

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Cmd/Ctrl + K — command palette
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setPaletteOpen(true)
        return
      }
      // Cmd/Ctrl + B — sidebar
      if ((e.metaKey || e.ctrlKey) && e.key === 'b' && !e.shiftKey) {
        e.preventDefault()
        toggleSidebar()
        return
      }
      // Cmd/Ctrl + . — casual ⇄ power mode
      if ((e.metaKey || e.ctrlKey) && e.key === '.') {
        e.preventDefault()
        togglePowerMode()
        return
      }
      // Cmd/Ctrl + \ — viewport
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault()
        toggleRail()
        return
      }
      // Cmd/Ctrl + N — new session
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault()
        newSession()
        return
      }
      // Cmd/Ctrl + / — keyboard shortcuts overlay
      if ((e.metaKey || e.ctrlKey) && e.key === '/') {
        e.preventDefault()
        setOverlayOpen((v) => !v)
        return
      }
      // Cmd/Ctrl + Shift + P — progress view
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault()
        setActiveView('progress')
        setCenterScreen('chat')
        return
      }
      // Cmd/Ctrl + Shift + E — folder
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'e') {
        e.preventDefault()
        setActiveView('folder')
        setCenterScreen('chat')
        return
      }
      // Cmd/Ctrl + Shift + B — browse
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        setActiveView('browse')
        setCenterScreen('chat')
        return
      }
      // Cmd/Ctrl + Shift + C — code
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'c') {
        e.preventDefault()
        setActiveView('code')
        setCenterScreen('chat')
        return
      }
      // Cmd/Ctrl + Shift + O — office
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'o') {
        e.preventDefault()
        setActiveView('office-xlsx')
        setCenterScreen('chat')
        return
      }
      // Cmd/Ctrl + Shift + T — trajectory
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 't') {
        e.preventDefault()
        setActiveView('trajectory')
        setCenterScreen('chat')
        return
      }
      // Ctrl + ` — shell
      if (e.ctrlKey && e.key === '`') {
        e.preventDefault()
        setActiveView('shell')
        setCenterScreen('chat')
        return
      }
      // Escape — close overlay or pause agent
      if (e.key === 'Escape') {
        if (overlayOpen) {
          e.preventDefault()
          setOverlayOpen(false)
          return
        }
        const tag = (document.activeElement?.tagName || '').toLowerCase()
        if (tag === 'body' || tag === 'html' || document.activeElement === document.body) {
          toggleAgentPause()
          notify('Agent paused')
          return
        }
      }
      // Cmd/Ctrl + J / Cmd+1..5 — cycle sessions
      if ((e.metaKey || e.ctrlKey) && /^[1-5]$/.test(e.key)) {
        const idx = Number(e.key) - 1
        if (idx < sessions.length) {
          e.preventDefault()
          setActiveSession(sessions[idx].id)
          return
        }
      }
      // Cycle center panels with Cmd+Shift+Letter
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && !e.altKey) {
        const k = e.key.toLowerCase()
        if (k === 'a') { e.preventDefault(); setCenterScreen('automations'); return }
        if (k === 'g') { e.preventDefault(); setCenterScreen('guard'); return }
        if (k === 'm') { e.preventDefault(); setCenterScreen('memory'); return }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [
    setPaletteOpen,
    toggleSidebar,
    toggleRail,
    togglePowerMode,
    setActiveView,
    setCenterScreen,
    toggleAgentPause,
    notify,
    newSession,
    setActiveSession,
    sessions,
    activeSessionId,
    overlayOpen,
  ])

  return (
    <AnimatePresence>
      {overlayOpen && (
        <motion.div
          key="shortcuts-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setOverlayOpen(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="w-full max-w-lg rounded-xl border border-border bg-card shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center gap-2 px-5 py-3 border-b border-border">
              <Keyboard className="h-4 w-4 text-orange-500" />
              <span className="text-sm font-semibold flex-1">Keyboard Shortcuts</span>
              <Kbd>⌘ /</Kbd>
              <button
                onClick={() => setOverlayOpen(false)}
                className="grid h-6 w-6 place-items-center rounded hover:bg-accent text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Shortcuts grid */}
            <div className="max-h-[420px] overflow-y-auto scroll-thin p-5 space-y-4">
              {SHORTCUTS.map((group) => (
                <div key={group.group}>
                  <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground/60 font-semibold mb-2">
                    {group.group}
                  </div>
                  <div className="space-y-1.5">
                    {group.items.map((item) => (
                      <div key={item.keys} className="flex items-center justify-between gap-4">
                        <span className="text-xs text-foreground/80">{item.action}</span>
                        <div className="flex items-center gap-0.5">
                          {item.keys.split(' ').map((part, i) => (
                            <React.Fragment key={i}>
                              {i > 0 && <span className="text-[10px] text-muted-foreground/40 mx-0.5">+</span>}
                              <Kbd>{part}</Kbd>
                            </React.Fragment>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Footer hint */}
            <div className="px-5 py-2 border-t border-border bg-sidebar/40 text-[10.5px] text-muted-foreground/50 text-center">
              Press <Kbd>⌘ /</Kbd> to toggle this overlay
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
