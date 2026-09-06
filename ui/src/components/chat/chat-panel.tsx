'use client'

import { useEffect, useRef, useState } from 'react'
import {
  BarChart3,
  Bell,
  Check,
  ChevronRight,
  Clock,
  Copy,
  Download,
  FileSearch,
  FileText,
  Folder,
  GitBranch,
  KeyRound,
  Loader2,
  MoreHorizontal,
  Pause,
  Pencil,
  Pin,
  Play,
  RotateCw,
  Search,
  Sparkles,
  Square,
  SquareDot,
  Target,
  Trash2,
  X,
  type LucideIcon,
} from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useAppStore, streamElapsedMs, sessionTranscriptMarkdown, type ProgressStep, type Session } from '@/lib/store'
import { inTauri, invoke } from '@/lib/tauri'
import { AGENT_MAP, MODEL_MAP } from '@/lib/agents'
import {
  schedulerNudges,
  type NudgeSuggestion as SchedulerNudge,
} from '@/lib/scheduler'
import { cn } from '@/lib/utils'
import { useChatColumnClass } from '@/lib/layout'
import { motion, AnimatePresence } from 'framer-motion'
import ChatComposer from './chat-composer'
import MessageBubble from './message-bubble'
import NowDoingStrip from './now-doing-strip'
import { SessionTabs } from './session-tabs'
import { fsUndoList } from '@/lib/fs'

const EXAMPLE_PROMPTS: { label: string; icon: LucideIcon }[] = [
  { label: 'Summarize this repo', icon: FileSearch },
  { label: 'Refresh Q3 numbers', icon: RotateCw },
  { label: 'Find similar bugs', icon: GitBranch },
  { label: 'Open the deck', icon: Sparkles },
  { label: 'Draft a release note', icon: Pencil },
]

// Casual mode — consumer outcomes instead of developer jargon (P31.1 / doc-83)
const CASUAL_PROMPTS: { label: string; icon: LucideIcon }[] = [
  { label: 'Clean & balance this Excel sheet', icon: BarChart3 },
  { label: 'Compare these two PDF contracts', icon: FileText },
  { label: 'Draft an email from my notes', icon: Pencil },
  { label: 'Tidy up my download folder', icon: Folder },
]

const STATUS_META: Record<
  Session['status'],
  { label: string; cls: string; dot?: string; icon?: LucideIcon }
> = {
  running: { label: 'Running', cls: 'border-orange-500/40 bg-orange-500/10 text-orange-300', dot: 'bg-orange-500' },
  'action-required': { label: 'Action needed', cls: 'border-amber-500/40 bg-amber-500/10 text-amber-300', icon: SquareDot },
  paused: { label: 'Paused', cls: 'border-border bg-muted text-muted-foreground' },
  completed: { label: 'Done', cls: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' },
  failed: { label: 'Failed', cls: 'border-rose-500/40 bg-rose-500/10 text-rose-300' },
  scheduled: { label: 'Scheduled', cls: 'border-sky-500/40 bg-sky-500/10 text-sky-300', icon: Clock },
  reconnecting: { label: 'Reconnecting', cls: 'border-amber-500/40 bg-amber-500/10 text-amber-300', icon: RotateCw },
  idle: { label: 'Idle', cls: 'border-border bg-muted text-muted-foreground' },
}

const MENU_ITEMS: {
  icon: LucideIcon
  label: string
  shortcut?: string
  destructive?: boolean
}[] = [
  { icon: Pencil, label: 'Rename', shortcut: '⌘R' },
  { icon: Pin, label: 'Pin to top' },
  // P51.9 — session goal (finish-line): setting one adds a banner under the
  // header; achieving it is a one-click check. Persisted on the Session.
  { icon: Target, label: 'Set / clear goal' },
  { icon: GitBranch, label: 'Fork session' },
  { icon: Copy, label: 'Copy transcript' },
  { icon: Download, label: 'Export', shortcut: '⌘E' },
  { icon: RotateCw, label: 'Reopen last closed' },
  { icon: Trash2, label: 'Clear messages', destructive: true },
]

function StatusBadge({ status }: { status: Session['status'] }) {
  const m = STATUS_META[status]
  const Icon = m.icon
  return (
    <Badge variant="outline" className={cn('gap-1 text-[10px]', m.cls)}>
      {m.dot ? (
        <span className={cn('live-dot h-1.5 w-1.5 rounded-full', m.dot)} />
      ) : Icon ? (
        <Icon className="h-2.5 w-2.5" />
      ) : null}
      {m.label}
    </Badge>
  )
}

function deriveNowDoing(session: Session | undefined) {
  if (!session) return null
  const withSteps = [...session.messages]
    .reverse()
    .find((m) => m.role === 'assistant' && m.steps && m.steps.length > 0)
  if (!withSteps?.steps) return null
  const steps: ProgressStep[] = withSteps.steps
  const idx = steps.findIndex((s) => s.status === 'active')
  if (idx < 0) return null
  // Live figures: the turn clock + token counter from the streaming store.
  // Zero/idle reads mean "just started", never a hardcoded demo figure.
  const st = useAppStore.getState()
  return {
    title: steps[idx].label,
    detail: steps[idx].detail,
    stepIndex: idx + 1,
    stepTotal: steps.length,
    elapsedMs: streamElapsedMs(),
    tokensThisTurn: st.streamStats.tokensThisTurn,
  }
}

function transcriptMarkdown(session: Session): string {
  return sessionTranscriptMarkdown(session)
}

export default function ChatPanel() {
  const store = useAppStore()
  const activeSession = store.sessions.find((s) => s.id === store.activeSessionId)
  const messages = activeSession?.messages ?? []
  const isEmpty = messages.length === 0
  const { agentPaused, toggleAgentPause, notify, setComposerValue, selectedAgentId, selectedModelId, powerMode } = store
  const scopedView = useAppStore((s) => s.scopedView)
  const setScopedView = useAppStore((s) => s.setScopedView)
  // P52.15 — the closed ring (sessions deleted this run) feeds the Archive
  // flyout in the session menu: reopen any row, or purge it for good.
  const closedSessions = useAppStore((s) => s.closedSessions)
  const nowDoing = activeSession ? deriveNowDoing(activeSession) : null

  // Bugfix — Pause must actually stop the live Rust stream, not just flip the
  // UI flag. The stream id captured by `sendUserMessage` drives `chat_cancel`;
  // Rust then emits the terminal `done`/`cancelled` event that ends the turn.
  const cancelLiveStream = async (sessionId: string) => {
    const streamId = store.liveStreamId[sessionId]
    if (!streamId) return
    const { chatCancel } = await import('@/lib/tauri')
    try {
      await chatCancel(streamId)
    } catch {
      /* stream already finished — nothing to cancel */
    }
  }
  const onTogglePause = async () => {
    if (!agentPaused) {
      await cancelLiveStream(store.activeSessionId)
    }
    toggleAgentPause()
  }
  // P51.5 — Stop-all (header): cancels the live turn AND clears this
  // session's queued asks. Stopping just the live turn (leaving the queue)
  // is done per-chip (×) or by the single Stop-Stream control.
  const queueCount = store.pendingQueue[store.activeSessionId]?.length ?? 0
  const onStopAll = async () => {
    const sid = store.activeSessionId
    useAppStore.setState((s) => ({
      pendingQueue: { ...s.pendingQueue, [sid]: [] },
    }))
    await cancelLiveStream(sid)
    notify(queueCount > 0 ? `Stopped — cleared ${queueCount} queued ask(s)` : 'Stopped')
  }
  const showStrip =
    !!nowDoing &&
    (activeSession?.status === 'running' || activeSession?.status === 'action-required')

  // Session ⋯ menu: every row does its named thing. Rename prompts inline,
  // Copy/Export use the real transcript, Fork duplicates into a new session,
  // Clear empties the transcript (the session survives). No placeholder rows.
  const onMenuAction = (label: string) => {
    const st = useAppStore.getState()
    const sid = st.activeSessionId
    const sess = st.sessions.find((s) => s.id === sid)
    if (!sess) {
      notify('No active session', 'error')
      return
    }
    switch (label) {
      case 'Rename': {
        const next = window.prompt('Rename session', sess.title)
        if (next !== null) st.renameSession(sid, next)
        break
      }
      case 'Pin to top':
        st.toggleSessionPinned(sid)
        notify(sess.pinned ? 'Unpinned from top' : 'Pinned to top')
        break
      case 'Set / clear goal': {
        if (sess.goal) {
          st.setSessionGoal(sid, undefined)
          notify('Goal cleared')
          break
        }
        const next = window.prompt('What should this work finish with?', '')
        if (next !== null && next.trim()) {
          st.setSessionGoal(sid, next.trim())
          notify('Goal set — it shows as the finish-line above the chat')
        }
        break
      }
      case 'Fork session': {
        const nid = st.forkSession(sid)
        notify(nid ? 'Forked into a new session' : 'Fork failed — session not found', nid ? 'default' : 'error')
        break
      }
      case 'Copy transcript':
        void navigator.clipboard
          ?.writeText(transcriptMarkdown(sess))
          .then(() => notify('Transcript copied'))
          .catch(() => notify('Copy failed — clipboard unavailable', 'error'))
        break
      case 'Reopen last closed':
        notify(st.reopenClosedSession() ? 'Reopened the last closed session' : 'Nothing closed this run to reopen')
        break
      case 'Empty archive':
        if (window.confirm('Permanently forget every closed session from this run? Their transcripts are lost.')) {
          st.purgeAllClosed()
          notify('Archive emptied')
        }
        break
      default:
        if (label.startsWith('Reopen:')) {
          const cid = label.slice('Reopen:'.length)
          notify(
            st.reopenClosedSessionId(cid) ? 'Reopened the closed session' : 'That closed session is no longer available',
            st.closedSessions.some((c) => c.id === cid) ? 'default' : 'error',
          )
        }
        break
      case 'Export': {
        const blob = new Blob([transcriptMarkdown(sess)], { type: 'text/markdown' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${sess.title.replace(/[^\w\- ]+/g, '').trim() || 'session'}.md`
        a.click()
        URL.revokeObjectURL(url)
        notify('Transcript exported as Markdown')
        break
      }
      case 'Clear messages':
        if (window.confirm(`Clear all messages in “${sess.title}”? The session stays.`)) {
          st.clearSessionMessages(sid)
        }
        break
    }
  }

  // P52.17 — refresh the pending-patch count whenever the active session
  // changes. fsUndoList is a cheap in-memory ledger read (no disk scan); the
  // count drives the review banner above the chat.
  const pendingPatches = store.pendingPatches
  useEffect(() => {
    let alive = true
    void fsUndoList().then((r) => {
      if (alive) store.setPendingPatches(r.undos.map((u, i) => ({ id: `${i}`, sessionId: u.sessionId, path: u.path, beforeBytes: u.beforeBytes })))
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.activeSessionId])

  // ⌘F search / ⌘E export / ⌘R rename — the shortcuts printed in the menu.
  // Skipped while typing in an input, except ⌘F (focuses search) and Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return
      const el = document.activeElement
      const typing = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
      const key = e.key.toLowerCase()
      if (key === 'f') {
        e.preventDefault()
        setSearchOpen(true)
      } else if (!typing && key === 'e') {
        e.preventDefault()
        onMenuAction('Export')
      } else if (!typing && key === 'r') {
        e.preventDefault()
        onMenuAction('Rename')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSession?.id])

  // Search state
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  // P52.19 — find-in-page: cycling through matches (Enter next / Shift+Enter
  // previous) and scrolling the active match into view, instead of only
  // counting them. Reset whenever the query changes.
  const [activeMatch, setActiveMatch] = useState(0)
  useEffect(() => setActiveMatch(0), [query])

  // Auto-scroll: stick to the newest content while streaming / on session
  // switch; user scroll-up releases the stick.
  const viewportRef = useRef<HTMLDivElement>(null)
  const [stickBottom, setStickBottom] = useState(true)

  const handleViewportScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const vp = e.currentTarget
    const nearBottom = vp.scrollHeight - vp.scrollTop - vp.clientHeight < 80
    setStickBottom(nearBottom)
  }

  useEffect(() => {
    const vp = viewportRef.current
    if (vp && stickBottom) vp.scrollTop = vp.scrollHeight
  }, [messages, store.activeSessionId, stickBottom])

  const lastMsg = messages[messages.length - 1]
  const streaming =
    activeSession?.status === 'running' &&
    !!lastMsg &&
    lastMsg.role === 'assistant' &&
    lastMsg.content === ''

  // Resolve current agent + model for header badge
  const agent = AGENT_MAP[selectedAgentId]
  const model = MODEL_MAP[selectedModelId]

  // Filter messages by search query
  const filteredMessages = query.trim()
    ? messages.filter((m) =>
        m.content.toLowerCase().includes(query.toLowerCase()),
      )
    : messages

  const matchCount = query.trim() ? filteredMessages.length : 0
  const col = useChatColumnClass()

  // P52.19 — scroll the active match into view inside the message viewport.
  const activeId = filteredMessages[activeMatch]?.id
  useEffect(() => {
    if (!activeId) return
    const el = viewportRef.current?.querySelector(`[data-mid="${activeId}"]`)
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [activeId, searchOpen, query])
  const stepMatch = (dir: 1 | -1) => {
    if (matchCount === 0) return
    setActiveMatch((i) => (i + dir + matchCount) % matchCount)
  }

  return (
    <div className="flex h-full w-full min-w-0 flex-col bg-background">
      <header className="flex shrink-0 items-center gap-2 border-b border-border bg-card/40 px-3 py-2">
        {/* Agent logo — uses the selected runtime's mark + accent */}
        <Avatar className={cn('h-6 w-6 border border-orange-500/30', agent ? '' : 'bg-orange-500/15')}>
          <AvatarFallback className={cn('font-mono text-[9px] font-bold', agent?.accent ?? 'bg-orange-500/15 text-orange-400')}>
            {agent ? agent.mark : <Sparkles className="h-3.5 w-3.5" />}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h2 className="truncate text-[13px] font-semibold text-foreground">
              {activeSession?.title ?? 'New work'}
            </h2>
            {activeSession?.pinned && <Pin className="h-3 w-3 shrink-0 text-orange-400" />}
            {/* Agent + model chip in header */}
            {powerMode && agent && (
              <span className="hidden sm:inline-flex items-center gap-1 rounded-md border border-border/60 bg-background/40 px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground transition-colors hover:border-orange-500/30 hover:bg-orange-500/5">
                <span className={cn('h-3.5 w-3.5 rounded text-[7px] font-bold flex items-center justify-center', agent.accent)}>{agent.mark}</span>
                <span className="text-foreground/80">{agent.name}</span>
                <span className="text-muted-foreground/40">·</span>
                <span className="text-orange-300">{model?.label ?? '—'}</span>
              </span>
            )}
          </div>
          {activeSession?.folder && (
            <p className="truncate font-mono text-[10px] text-muted-foreground">{activeSession.folder}</p>
          )}
        </div>
        {activeSession && <StatusBadge status={activeSession.status} />}
        {/* P11.5.12 — reconnect chip: shown while the stream is interrupted
            (dropped IPC), dismissible; auto-resume replays from the last
            token (lib/resumable StreamRegistry cursor). */}
        {store.reconnect.show && (
          <button
            onClick={() => store.setReconnect({ show: false, lastToken: '', tokens: 0 })}
            className="flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 font-mono text-[10px] text-amber-300 transition-colors hover:bg-amber-500/20"
            title="Dismiss (the stream auto-resumes from the last token when the link returns)"
          >
            <RotateCw className="h-3 w-3 animate-spin" />
            <span>🔄 Reconnecting… ({store.reconnect.tokens} tokens)</span>
          </button>
        )}
        {/* Study-mode scope chip — chat answers are scoped to this document */}
        {scopedView && (
          <div className="flex items-center gap-1 rounded-md border border-orange-500/40 bg-orange-500/10 px-2 py-0.5 font-mono text-[10px] text-orange-300">
            <FileText className="h-3 w-3" />
            <span className="max-w-[140px] truncate">
              Scoped to {store.scopedDoc?.title ?? (scopedView === 'office-pdf' ? 'open document' : scopedView.replace('office-', ''))}
            </span>
            <button
              onClick={() => setScopedView(undefined)}
              className="rounded p-0.5 hover:bg-orange-500/20"
              title="Clear scope"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
        <div className="flex items-center gap-0.5">
          <Button
            size="icon"
            variant={searchOpen ? 'secondary' : 'ghost'}
            className={cn('h-7 w-7', searchOpen ? 'text-orange-300' : 'text-muted-foreground hover:text-foreground')}
            onClick={() => setSearchOpen((v) => !v)}
            title="Search in conversation (⌘F)"
          >
            <Search className="h-3.5 w-3.5" />
          </Button>
          {/* P51.5 — Stop-all: cancels the live turn AND clears queued asks.
              Only live while the agent is busy; otherwise the pause toggle
              (below) is the idle/resume control. */}
          {(activeSession?.status === 'running' || activeSession?.status === 'action-required') && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1 px-1.5 text-[10px] text-rose-300 hover:bg-rose-500/10 hover:text-rose-200"
              onClick={() => void onStopAll()}
              title={
                queueCount > 0
                  ? `Stop the current turn and clear ${queueCount} queued ask(s)`
                  : 'Stop the current turn'
              }
            >
              <Square className="h-2.5 w-2.5" />
              {queueCount > 0 ? `Stop · ${queueCount} queued` : 'Stop'}
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={() => void onTogglePause()}
            title={agentPaused ? 'Resume agent' : 'Pause agent'}
          >
            {agentPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={() => {
              store.setCenterScreen('settings')
              store.setSettingsSection('chat')
            }}
            title="Chat & auto-run settings"
          >
            <Bell className="h-3.5 w-3.5" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-foreground">
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuLabel className="font-mono text-[10px] text-muted-foreground">Session</DropdownMenuLabel>
              {MENU_ITEMS.map((item, i) => (
                <span key={item.label}>
                  {/* Separator before Fork (index 3) and Clear (last). */}
                  {(i === 3 || i === MENU_ITEMS.length - 1) && <DropdownMenuSeparator />}
                  <DropdownMenuItem
                    variant={item.destructive ? 'destructive' : 'default'}
                    onClick={() => onMenuAction(item.label)}
                  >
                    <item.icon className="h-3.5 w-3.5" />
                    {item.label}
                    {item.shortcut && <DropdownMenuShortcut>{item.shortcut}</DropdownMenuShortcut>}
                  </DropdownMenuItem>
                </span>
              ))}
              {/* P52.15 — Archive/History: every session closed this run, in
                  close order (most recent first). Reopen restores the full
                  transcript; Empty archive forgets them permanently. Durable
                  trash across restarts rides the session-trash command and is
                  not faked here. */}
              {closedSessions.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="font-mono text-[10px] text-muted-foreground">
                    Closed this run ({closedSessions.length})
                  </DropdownMenuLabel>
                  {[...closedSessions].reverse().map((c) => (
                    <DropdownMenuItem
                      key={c.id}
                      onClick={() => onMenuAction(`Reopen:${c.id}`)}
                      className="gap-1.5"
                      title="Reopen — restores the full transcript"
                    >
                      <Clock className="h-3.5 w-3.5 shrink-0" />
                      <span className="max-w-[9rem] truncate">{c.title || 'New work'}</span>
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => onMenuAction('Empty archive')}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Empty archive
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* P51.23 (UI slice) — session tabs: quick switching between recent
          sessions above the chat. Hidden while only one session exists. */}
      <SessionTabs />

      {/* P52.17 (UI slice) — Review-changes banner: surfaces this session's
          real pending file mutations (fs_undo_list) with a one-click jump to
          the diff view. Per-hunk Keep/Reject + checkpoint restore remain
          gated on the undo-restore command surface — not faked. */}
      {pendingPatches.length > 0 && (
        <button
          type="button"
          onClick={() => store.setActiveView('diff')}
          className="flex shrink-0 items-center gap-2 border-b border-emerald-500/20 bg-emerald-500/5 px-3 py-1.5 text-left transition-colors hover:bg-emerald-500/10"
          title="Review the files the agent changed this session — open the diff view"
        >
          <GitBranch className="h-3 w-3 shrink-0 text-emerald-300" />
          <span className="text-[11px] text-emerald-100/90">
            {pendingPatches.length} file change{pendingPatches.length === 1 ? '' : 's'} this session — review before they stack up
          </span>
          <ChevronRight className="h-3 w-3 shrink-0 text-emerald-300/70" />
        </button>
      )}

      {/* P51.9 — session-goal finish-line banner: the goal the user set for
          this work, with a one-click achieved check. Persists on the Session
          (vault round-trip), so it survives close/restart. */}
      {activeSession?.goal && (
        <div
          className={cn(
            'flex shrink-0 items-center gap-2 border-b border-orange-500/20 bg-orange-500/5 px-3 py-1.5',
            activeSession.goalAchieved && 'border-emerald-500/20 bg-emerald-500/5',
          )}
        >
          <button
            type="button"
            onClick={() => store.markGoalAchieved(activeSession.id, !activeSession.goalAchieved)}
            className={cn(
              'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
              activeSession.goalAchieved
                ? 'border-emerald-500/50 bg-emerald-500/20 text-emerald-300'
                : 'border-border text-transparent hover:border-orange-500/50',
            )}
            title={activeSession.goalAchieved ? 'Mark not achieved' : 'Mark achieved'}
          >
            <Check className="h-3 w-3" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground/60">
              Goal{activeSession.goalAchieved ? ' · achieved' : ''}
            </div>
            <div
              className={cn(
                'truncate text-[11px]',
                activeSession.goalAchieved
                  ? 'text-emerald-300/80 line-through decoration-emerald-400/50'
                  : 'text-orange-100/90',
              )}
            >
              {activeSession.goal}
            </div>
          </div>
          <button
            type="button"
            onClick={() => store.setSessionGoal(activeSession.id, undefined)}
            className="shrink-0 rounded p-1 text-muted-foreground/60 hover:bg-accent hover:text-foreground"
            title="Clear goal"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Search bar */}
      <AnimatePresence initial={false}>
        {searchOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
            className="shrink-0 overflow-hidden border-b border-border bg-card/30"
          >
            <div className="flex items-center gap-2 px-3 py-1.5">
              <Search className="h-3.5 w-3.5 shrink-0 text-orange-400" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && query.trim()) {
                    e.preventDefault()
                    stepMatch(e.shiftKey ? -1 : 1)
                  }
                }}
                placeholder="Search messages… (Enter next, Shift+Enter prev)"
                className="h-6 flex-1 bg-transparent font-mono text-[11px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
              />
              {query && (
                <>
                  <button
                    type="button"
                    onClick={() => stepMatch(-1)}
                    disabled={matchCount === 0}
                    className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                    title="Previous match (Shift+Enter)"
                  >
                    <ChevronRight className="h-3 w-3 rotate-180" />
                  </button>
                  <button
                    type="button"
                    onClick={() => stepMatch(1)}
                    disabled={matchCount === 0}
                    className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                    title="Next match (Enter)"
                  >
                    <ChevronRight className="h-3 w-3" />
                  </button>
                  <span className="shrink-0 rounded-md border border-orange-500/30 bg-orange-500/15 px-2 py-0.5 font-mono text-[10px] font-medium text-orange-300">
                    {matchCount === 0 ? 'no matches' : `${activeMatch + 1}/${matchCount}`}
                  </span>
                </>
              )}
              {query && (
                <button
                  type="button"
                  onClick={() => stepMatch(1)}
                  className="hidden"
                  aria-hidden
                  tabIndex={-1}
                />
              )}
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setQuery('')
                  setSearchOpen(false)
                }}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {showStrip && nowDoing && (
        <NowDoingStrip
          title={nowDoing.title}
          detail={nowDoing.detail}
          stepIndex={nowDoing.stepIndex}
          stepTotal={nowDoing.stepTotal}
          elapsedMs={nowDoing.elapsedMs}
          tokensThisTurn={nowDoing.tokensThisTurn}
        />
      )}

      {/* Empty chat → centered composer (lifted, clean). Once a conversation
          starts, the composer moves to the south (bottom-pinned) with the chat. */}
      {isEmpty ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1" />
          {/* P50.4.9 — no provider configured: explain setup instead of
              letting the first message die with a generic agent error. */}
          <NoProviderCard />
          <EmptyState onPick={(p) => setComposerValue(p)} />
          <div className={cn(col, 'pb-6 pt-2')}>
            {store.streamStats.tokensPerSec > 0 && (
              <div className="mb-1 font-mono text-[9px] text-muted-foreground">
                {store.streamStats.tokensPerSec.toFixed(1)} tok/s · ctx {store.streamStats.ctxPct}%
                {store.streamStats.activeKey ? ` · ${store.streamStats.activeKey}` : ''}
              </div>
            )}
            <ChatComposer
              centered
              budget={
                store.liveBudget
                  ? {
                      spent: store.liveBudget.spent,
                      cap: store.liveBudget.cap,
                      tokens: store.liveBudget.tokens,
                    }
                  : undefined
              }
            />
          </div>
          <div className="flex-1" />
        </div>
      ) : (
        <>
          {/* Auto-scroll: stick to the bottom while a turn streams (or on session
              switch); release the moment the user scrolls up. */}
          <div className="relative min-h-0 flex-1">
            <ScrollArea
              className="h-full scroll-thin"
              viewportRef={viewportRef}
              onScroll={handleViewportScroll}
            >
              {/* P45.6 — content-visibility: auto skips layout/paint of
                  off-screen bubbles in long transcripts. */}
              <div className={cn(col, 'flex flex-col gap-3 py-4 [content-visibility:auto] [contain-intrinsic-size:auto_240px]')}>
                {filteredMessages.length === 0 && query.trim()
                  ? (
                    <div className="flex flex-col items-center gap-2 py-12 text-center">
                      <Search className="h-6 w-6 text-muted-foreground/40" />
                      <p className="text-[11px] text-muted-foreground">
                        No messages match &ldquo;{query}&rdquo;
                      </p>
                    </div>
                  )
                  : filteredMessages.map((m, i) => (
                    <motion.div
                      key={m.id}
                      data-mid={m.id}
                      initial={{ opacity: 0, y: 10, scale: 0.995 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                      // P52.19 — ring the active match so a jump lands visibly.
                      className={cn(
                        'rounded-xl',
                        query.trim() && i === activeMatch && 'ring-2 ring-orange-500/40 ring-offset-2 ring-offset-background',
                      )}
                    >
                      <MessageBubble message={m} streaming={m.id === lastMsg?.id && streaming} />
                    </motion.div>
                  ))}
                {streaming && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    className="flex items-center gap-2 pl-1"
                  >
                    <span className="flex items-center gap-1 rounded-full border border-orange-500/25 bg-orange-500/5 px-2.5 py-1.5">
                      <span className="typing-dot bg-orange-400" />
                      <span className="typing-dot bg-orange-400 [animation-delay:0.15s]" />
                      <span className="typing-dot bg-orange-400 [animation-delay:0.3s]" />
                    </span>
                    <span className="font-mono text-[9px] text-muted-foreground/70">
                      agent thinking…
                    </span>
                  </motion.div>
                )}
                <div className="h-2" />
              </div>
            </ScrollArea>
          </div>

          <div className={cn('shrink-0 pb-3', col)}>
            <ChatComposer
              budget={
                store.liveBudget
                  ? {
                      spent: store.liveBudget.spent,
                      cap: store.liveBudget.cap,
                      tokens: store.liveBudget.tokens,
                    }
                  : undefined
              }
            />
          </div>
        </>
      )}
    </div>
  )
}

/**
 * P50.4.9 — No-provider/offline empty state. Shown when the vault has no
 * BYOK keys and no local runtime is picked: explains exactly what is
 * missing, where data would go (privacy note), and offers setup / local
 * download / re-check actions. Never a generic "agent error".
 */
function NoProviderCard() {
  const providerKeysConfigured = useAppStore((s) => s.providerKeysConfigured)
  const localRuntime = useAppStore((s) => s.localRuntime)
  const openSetup = useAppStore((s) => s.openSetup)
  const setProviderKeysConfigured = useAppStore((s) => s.setProviderKeysConfigured)
  const setSettingsSection = useAppStore((s) => s.setSettingsSection)
  const setCenterScreen = useAppStore((s) => s.setCenterScreen)
  const [checking, setChecking] = useState(false)

  if (!inTauri()) return null
  // Unknown (null) or configured → the normal empty state applies.
  if (providerKeysConfigured !== false) return null
  if (localRuntime) return null

  const recheck = async () => {
    setChecking(true)
    try {
      const r = await invoke<{ keys?: unknown[] }>('vault_keys_list')
      setProviderKeysConfigured((r?.keys?.length ?? 0) > 0)
    } catch {
      /* vault still locked — stays false/unknown */
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="fade-up mx-auto w-full max-w-md rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
      <div className="flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-amber-300" />
        <div className="text-[12px] font-semibold text-foreground">No model provider configured</div>
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
        Add a bring-your-own-key provider or use a local model — until then there is no model to
        answer with. Your key is stored encrypted in the local vault and only sent to the provider
        you choose; local models run entirely on this machine.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Button
          size="sm"
          className="h-7 bg-orange-500 text-[10px] text-white hover:bg-orange-600"
          onClick={() => openSetup()}
        >
          <KeyRound className="mr-1 h-3 w-3" />
          Set up a provider
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-[10px]"
          onClick={() => {
            setSettingsSection('local')
            setCenterScreen('settings')
          }}
        >
          <Download className="mr-1 h-3 w-3" />
          Download a local model
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-[10px] text-muted-foreground"
          disabled={checking}
          onClick={() => void recheck()}
        >
          {checking ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RotateCw className="mr-1 h-3 w-3" />}
          Check again
        </Button>
      </div>
    </div>
  )
}

function EmptyState({ onPick }: { onPick: (prompt: string) => void }) {
  const powerMode = useAppStore((s) => s.powerMode)
  const taskFolder = useAppStore((s) => s.taskFolder)
  const setTaskFolder = useAppStore((s) => s.setTaskFolder)
  const notify = useAppStore((s) => s.notify)
  const composerRole = useAppStore((s) => s.composerRole)
  const prompts = powerMode ? EXAMPLE_PROMPTS : CASUAL_PROMPTS
  // P6.4 (B7, doc 67 §3): session-open proactivity hook — nudge sentinels
  // surface 1–3 repeating-pattern schedule suggestions in the composer.
  const [nudges, setNudges] = useState<SchedulerNudge[]>([])
  useEffect(() => {
    let alive = true
    void schedulerNudges().then((s) => {
      if (alive) setNudges(s.slice(0, 3))
    })
    return () => {
      alive = false
    }
  }, [])
  return (
    <div className="fade-up flex flex-col items-center gap-4 px-4 py-12 text-center bg-radial-fade">
      <div className="flex h-12 w-12 items-center justify-center rounded-full border border-orange-500/30 bg-orange-500/10 glow-pulse">
        <Sparkles className="h-6 w-6 text-orange-400" />
      </div>
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-foreground">
          What would you like to get done?
        </h3>
        <p className="max-w-sm text-[11px] text-muted-foreground">
          Drop a file or just say it in plain language. You don’t pick a mode first.
        </p>
      </div>
      {powerMode && (
      <div className="flex flex-wrap justify-center gap-1.5">
        {['Desktop', 'Documents'].map((name) => {
          const path = name === 'Desktop' ? '~/Desktop' : '~/Documents'
          const on = taskFolder === path
          return (
            <button
              key={name}
              type="button"
              onClick={() => setTaskFolder(on ? undefined : path)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px]',
                on
                  ? 'border-orange-500/50 bg-orange-500/15 text-orange-200'
                  : 'border-border bg-card/40 text-muted-foreground hover:border-orange-500/40 hover:text-foreground',
              )}
            >
              <Folder className="h-3 w-3 text-orange-300" />
              {name}
            </button>
          )
        })}
        <button
          type="button"
          onClick={() =>
            void (async () => {
              if (!inTauri()) {
                notify('Folder picker needs the Tauri shell — type or pick Desktop / Documents for now')
                return
              }
              try {
                const { open } = await import('@tauri-apps/plugin-dialog')
                const picked = await open({ directory: true, multiple: false, title: 'Pick a workspace folder' })
                if (typeof picked === 'string') setTaskFolder(picked)
              } catch (e) {
                notify(e instanceof Error ? e.message : 'Folder picker failed', 'error')
              }
            })()
          }
          className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-border px-2.5 py-1 text-[11px] text-muted-foreground hover:border-orange-500/40 hover:text-foreground"
        >
          <Folder className="h-3 w-3" />
          Open folder
        </button>
      </div>
      )}
      {powerMode && taskFolder && (
        <div className="max-w-md rounded-md border border-border/50 bg-card/40 px-3 py-2 text-left">
          <div className="font-mono text-[10px] text-orange-300">{taskFolder}</div>
          <p className="mt-1 text-[10px] text-muted-foreground">
            Live file inventory and AGENTS.md load when a workspace is attached.
          </p>
        </div>
      )}
      {powerMode && composerRole === 'spec' && (
        <div className="grid w-full max-w-2xl gap-2 text-left sm:grid-cols-2">
          <div className="rounded-md border border-border/50 bg-card/40 p-3">
            <div className="text-[11px] font-medium">Spec Q&amp;A</div>
            <p className="mt-1 text-[10px] text-muted-foreground">
              Plan mode first. Clarifying questions land here as cards. None yet — send a goal.
            </p>
          </div>
          <div className="rounded-md border border-border/50 bg-card/40 p-3">
            <div className="text-[11px] font-medium">Spec markdown</div>
            <p className="mt-1 font-mono text-[10px] text-muted-foreground">
              # Goal{'\n'}Describe the outcome. Build/Goal chip in the composer follows Plan mode.
            </p>
          </div>
        </div>
      )}
      <div className="flex flex-wrap justify-center gap-1.5">
        {prompts.map((p) => {
          const Icon = p.icon
          return (
            <button
              key={p.label}
              type="button"
              onClick={() => onPick(p.label)}
              className="group inline-flex items-center gap-1.5 rounded-full border border-border bg-card/40 px-2.5 py-1 text-[11px] text-muted-foreground transition-all hover:border-orange-500/40 hover:text-foreground hover-lift"
            >
              <Icon className="h-3 w-3 text-orange-300 group-hover:text-orange-400" />
              {p.label}
              <ChevronRight className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
            </button>
          )
        })}
      </div>

      {/* P6.4 (B7, doc 67 §3): session-open proactivity — nudge sentinels
          surface repeating-pattern schedule suggestions (H14 nudge cards). */}
      {nudges.length > 0 && (
        <div className="fade-up mt-2 flex flex-wrap justify-center gap-1.5">
          {nudges.map((n) => (
            <button
              key={n.goal + n.cron}
              type="button"
              onClick={() => onPick(`Schedule "${n.goal}" ${n.cron}`)}
              className="group inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/5 px-2.5 py-1 text-[11px] text-amber-200/90 transition-all hover:border-amber-500/50 hover:text-amber-100 hover-lift"
              title={`Repeated ${n.observedAt.join(', ')} · confidence ${Math.round(n.confidence * 100)}%`}
            >
              <Clock className="h-3 w-3 text-amber-300 group-hover:text-amber-400" />
              Make “{n.goal}” a recurring task
              <span className="font-mono text-[10px] text-amber-300/70">
                {n.cron}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
