'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Archive,
  Bell,
  Bookmark,
  ChevronRight,
  Clock,
  Copy,
  Download,
  FileSearch,
  GitBranch,
  MoreHorizontal,
  Pause,
  Pencil,
  Pin,
  Play,
  RotateCw,
  Search,
  Sparkles,
  SquareDot,
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
import { useAppStore, type ProgressStep, type Session } from '@/lib/store'
import { AGENT_MAP, MODEL_MAP } from '@/lib/agents'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'
import ChatComposer from './chat-composer'
import MessageBubble from './message-bubble'
import NowDoingStrip from './now-doing-strip'

const EXAMPLE_PROMPTS: { label: string; icon: LucideIcon }[] = [
  { label: 'Summarize this repo', icon: FileSearch },
  { label: 'Refresh Q3 numbers', icon: RotateCw },
  { label: 'Find similar bugs', icon: GitBranch },
  { label: 'Open the deck', icon: Sparkles },
  { label: 'Draft a release note', icon: Pencil },
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
  { icon: Bookmark, label: 'Bookmark' },
  { icon: GitBranch, label: 'Fork session' },
  { icon: Copy, label: 'Copy transcript' },
  { icon: Download, label: 'Export', shortcut: '⌘E' },
  { icon: Archive, label: 'Archive' },
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
  return {
    title: steps[idx].label,
    detail: steps[idx].detail,
    stepIndex: idx + 1,
    stepTotal: steps.length,
    elapsedMs: 1200,
    tokensThisTurn: 12_000,
  }
}

export default function ChatPanel() {
  const store = useAppStore()
  const activeSession = store.sessions.find((s) => s.id === store.activeSessionId)
  const messages = activeSession?.messages ?? []
  const { agentPaused, toggleAgentPause, notify, setComposerValue, selectedAgentId, selectedModelId } = store
  const nowDoing = activeSession ? deriveNowDoing(activeSession) : null
  const showStrip =
    !!nowDoing &&
    (activeSession?.status === 'running' || activeSession?.status === 'action-required')

  // Search state
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')

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
              {activeSession?.title ?? 'New session'}
            </h2>
            {activeSession?.pinned && <Pin className="h-3 w-3 shrink-0 text-orange-400" />}
            {/* Agent + model chip in header */}
            {agent && (
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
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={() => toggleAgentPause()}
            title={agentPaused ? 'Resume agent' : 'Pause agent'}
          >
            {agentPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={() => notify('Session settings')}
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
                  {(i === 4 || i === 7) && <DropdownMenuSeparator />}
                  <DropdownMenuItem
                    variant={item.destructive ? 'destructive' : 'default'}
                    onClick={() => notify(item.label)}
                  >
                    <item.icon className="h-3.5 w-3.5" />
                    {item.label}
                    {item.shortcut && <DropdownMenuShortcut>{item.shortcut}</DropdownMenuShortcut>}
                  </DropdownMenuItem>
                </span>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

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
                placeholder="Search messages…"
                className="h-6 flex-1 bg-transparent font-mono text-[11px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
              />
              {query && (
                <span className="shrink-0 rounded-md border border-orange-500/30 bg-orange-500/15 px-2 py-0.5 font-mono text-[10px] font-medium text-orange-300">
                  {matchCount} match{matchCount === 1 ? '' : 'es'}
                </span>
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

      {/* Auto-scroll: stick to the bottom while a turn streams (or on session
          switch); release the moment the user scrolls up. */}
      <div className="relative min-h-0 flex-1">
        <ScrollArea
          className="h-full scroll-thin"
          viewportRef={viewportRef}
          onScroll={handleViewportScroll}
        >
          <div className="mx-auto flex max-w-3xl flex-col gap-3 px-3 py-4">
            {messages.length === 0
              ? <EmptyState onPick={(p) => setComposerValue(p)} />
              : filteredMessages.length === 0 && query.trim()
                ? (
                  <div className="flex flex-col items-center gap-2 py-12 text-center">
                    <Search className="h-6 w-6 text-muted-foreground/40" />
                    <p className="text-[11px] text-muted-foreground">
                      No messages match &ldquo;{query}&rdquo;
                    </p>
                  </div>
                )
                : filteredMessages.map((m) => (
                  <motion.div
                    key={m.id}
                    initial={{ opacity: 0, y: 10, scale: 0.995 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <MessageBubble message={m} />
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

      <div className="shrink-0">
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
    </div>
  )
}

function EmptyState({ onPick }: { onPick: (prompt: string) => void }) {
  return (
    <div className="fade-up flex flex-col items-center gap-4 px-4 py-12 text-center bg-radial-fade">
      <div className="flex h-12 w-12 items-center justify-center rounded-full border border-orange-500/30 bg-orange-500/10 glow-pulse">
        <Sparkles className="h-6 w-6 text-orange-400" />
      </div>
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-foreground">What should we do next?</h3>
        <p className="max-w-sm text-[11px] text-muted-foreground">
          Ask the agent to refresh documents, run scrapers, refactor code, or run an automation. Try one of these to get going.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-1.5">
        {EXAMPLE_PROMPTS.map((p) => {
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
    </div>
  )
}
