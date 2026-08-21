'use client'

import * as React from 'react'
import {
  Activity,
  BarChart3,
  Brain,
  ChevronDown,
  ChevronRight,
  Clock,
  Cog,
  Download,
  HelpCircle,
  Plug,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  MoreHorizontal,
  Hash,
  Folder,
  Filter,
  Pin,
  Circle,
  CheckCircle2,
  AlertCircle,
  Pause,
  Timer,
  RotateCw,
  Trash2,
} from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAppStore, type SessionStatus } from '@/lib/store'
import { AGENT_MAP, AGENTS } from '@/lib/agents'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'

// Map session.agent names to agent catalog IDs for sidebar marks
const SESSION_AGENT_MAP: Record<string, string> = {
  analyst: 'everyaios-native',
  browser: 'grok-build',
  coder: 'claude-code',
}

const statusMeta: Record<
  SessionStatus,
  { color: string; ring: string; Icon: typeof Circle }
> = {
  idle: { color: 'text-zinc-500', ring: 'bg-zinc-500', Icon: Circle },
  running: { color: 'text-blue-400', ring: 'bg-blue-500', Icon: Activity },
  'action-required': { color: 'text-orange-400', ring: 'bg-orange-500', Icon: AlertCircle },
  completed: { color: 'text-emerald-400', ring: 'bg-emerald-500', Icon: CheckCircle2 },
  failed: { color: 'text-red-400', ring: 'bg-red-500', Icon: AlertCircle },
  paused: { color: 'text-zinc-400', ring: 'bg-zinc-400', Icon: Pause },
  scheduled: { color: 'text-violet-400', ring: 'bg-violet-500', Icon: Clock },
}

interface NavItemProps {
  icon: React.ElementType
  label: string
  shortcut?: string
  active?: boolean
  badge?: string
  onClick?: () => void
  collapsed?: boolean
  danger?: boolean
}

function NavItem({ icon: Icon, label, shortcut, active, badge, onClick, collapsed, danger }: NavItemProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onClick}
          className={cn(
            'group w-full flex items-center gap-2 rounded-md text-[12.5px] transition-colors relative',
            collapsed ? 'h-9 w-9 justify-center mx-auto' : 'px-2 h-8',
            active
              ? 'bg-accent text-foreground'
              : danger
                ? 'text-red-400/80 hover:bg-red-500/10 hover:text-red-400'
                : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
          )}
        >
          <Icon className={cn('h-4 w-4 shrink-0', active && 'text-orange-500')} />
          {!collapsed && <span className="flex-1 text-left truncate">{label}</span>}
          {!collapsed && badge && (
            <span className="text-[10px] font-mono text-muted-foreground/70">{badge}</span>
          )}
          {!collapsed && shortcut && (
            <kbd className="text-[10px] text-muted-foreground/40 font-mono opacity-0 group-hover:opacity-100">
              {shortcut}
            </kbd>
          )}
          {active && !collapsed && (
            <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r bg-orange-500" />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {label}
        {shortcut && <span className="ml-2 text-muted-foreground">{shortcut}</span>}
      </TooltipContent>
    </Tooltip>
  )
}

// === Power mode — full 248px nav (existing behavior) =========================

function PowerSidebar() {
  const collapsed = useAppStore((s) => s.sidebarCollapsed)
  const sessions = useAppStore((s) => s.sessions)
  const activeId = useAppStore((s) => s.activeSessionId)
  const setActiveSession = useAppStore((s) => s.setActiveSession)
  const newSession = useAppStore((s) => s.newSession)
  const deleteSession = useAppStore((s) => s.deleteSession)
  const setCenterScreen = useAppStore((s) => s.setCenterScreen)
  const centerScreen = useAppStore((s) => s.centerScreen)
  const notify = useAppStore((s) => s.notify)

  const [filterOpen, setFilterOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')

  const filteredSessions = React.useMemo(() => {
    if (!query) return sessions
    return sessions.filter((s) =>
      s.title.toLowerCase().includes(query.toLowerCase())
    )
  }, [sessions, query])

  return (
    <aside
      className={cn(
        'shrink-0 border-r border-border bg-sidebar flex flex-col transition-[width] duration-200 no-select',
        collapsed ? 'w-12' : 'w-60'
      )}
    >
      {/* Workspace selector */}
      <div className={cn('p-2 border-b border-border', collapsed && 'px-1')}>
        {collapsed ? (
          <div className="grid h-8 w-8 mx-auto place-items-center rounded-md bg-orange-500/15 ring-1 ring-orange-500/30">
            <Sparkles className="h-4 w-4 text-orange-500" />
          </div>
        ) : (
          <button className="w-full flex items-center gap-2 rounded-md px-2 h-8 hover:bg-accent transition-colors group">
            <div className="grid h-5 w-5 place-items-center rounded-md bg-orange-500/15 ring-1 ring-orange-500/30">
              <Sparkles className="h-3 w-3 text-orange-500" />
            </div>
            <span className="text-[12.5px] font-semibold truncate flex-1 text-left">
              EveryAIOS Workspace
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
        )}
      </div>

      {/* Search + new session */}
      <div className={cn('p-2 space-y-1.5 border-b border-border', collapsed && 'px-1')}>
        {collapsed ? (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <button className="grid h-8 w-8 mx-auto place-items-center rounded-md hover:bg-accent">
                  <Search className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Search (Cmd+K)</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={newSession}
                  className="grid h-8 w-8 mx-auto place-items-center rounded-md bg-orange-500/15 ring-1 ring-orange-500/30 hover:bg-orange-500/25"
                >
                  <Plus className="h-4 w-4 text-orange-500" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">New session (Cmd+N)</TooltipContent>
            </Tooltip>
          </>
        ) : (
          <>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search sessions…"
                className="w-full h-7 pl-7 pr-2 text-[12px] rounded-md bg-background/60 border border-border focus:outline-none focus:ring-1 focus:ring-orange-500/40 placeholder:text-muted-foreground/60"
              />
            </div>
            <Button
              size="sm"
              className="w-full h-7 text-[12px] bg-orange-500 hover:bg-orange-600 text-white"
              onClick={newSession}
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" /> New session
            </Button>
          </>
        )}
      </div>

      {/* Nav items */}
      <nav className="p-2 space-y-0.5 border-b border-border">
        <NavItem
          icon={Clock}
          label="Automations"
          shortcut="⌘A"
          collapsed={collapsed}
          active={centerScreen === 'automations'}
          onClick={() => setCenterScreen('automations')}
          badge="4"
        />
        <NavItem
          icon={ShieldCheck}
          label="Guard"
          shortcut="⌘G"
          collapsed={collapsed}
          active={centerScreen === 'guard'}
          onClick={() => setCenterScreen('guard')}
        />
        <NavItem
          icon={Plug}
          label="Connectors"
          collapsed={collapsed}
          active={centerScreen === 'connectors'}
          onClick={() => setCenterScreen('connectors')}
          badge="9"
        />
        <NavItem
          icon={Brain}
          label="Memory"
          shortcut="⌘M"
          collapsed={collapsed}
          active={centerScreen === 'memory'}
          onClick={() => setCenterScreen('memory')}
        />
        <NavItem
          icon={BarChart3}
          label="Analytics"
          collapsed={collapsed}
          active={centerScreen === 'analytics'}
          onClick={() => setCenterScreen('analytics')}
        />
      </nav>

      {/* Sessions list */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {!collapsed && (
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground/70 font-semibold">
              Recent
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setFilterOpen((v) => !v)}
                className="grid h-5 w-5 place-items-center rounded hover:bg-accent text-muted-foreground hover:text-foreground"
              >
                <Filter className="h-3 w-3" />
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="grid h-5 w-5 place-items-center rounded hover:bg-accent text-muted-foreground hover:text-foreground">
                    <MoreHorizontal className="h-3 w-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" sideOffset={4}>
                  <DropdownMenuLabel className="text-[11px]">Sort by</DropdownMenuLabel>
                  <DropdownMenuItem className="text-xs">Last updated</DropdownMenuItem>
                  <DropdownMenuItem className="text-xs">Date created</DropdownMenuItem>
                  <DropdownMenuItem className="text-xs">Cost (high → low)</DropdownMenuItem>
                  <DropdownMenuItem className="text-xs">Tokens used</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-xs">Group by folder</DropdownMenuItem>
                  <DropdownMenuItem className="text-xs">Show archived</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto scroll-thin px-2 pb-2 space-y-0.5">
          {filteredSessions.map((session) => {
            const meta = statusMeta[session.status]
            const Icon = meta.Icon
            const isActive = session.id === activeId && centerScreen === 'chat'
            return (
              <button
                key={session.id}
                onClick={() => setActiveSession(session.id)}
                className={cn(
                  'group w-full text-left rounded-md transition-all relative',
                  collapsed ? 'p-1.5 mx-auto' : 'p-2',
                  isActive
                    ? 'bg-accent border-glow'
                    : 'hover:bg-accent/50 hover-lift'
                )}
              >
                {isActive && !collapsed && (
                  <span className="absolute left-0 top-2 bottom-2 w-0.5 rounded-r bg-orange-500" />
                )}
                {collapsed ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="relative grid h-8 w-8 mx-auto place-items-center rounded-md">
                        <Icon className={cn('h-4 w-4', meta.color)} />
                        <span className={cn('absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full', meta.ring)} />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="right">{session.title}</TooltipContent>
                  </Tooltip>
                ) : (
                  <div className="space-y-1">
                    <div className="flex items-start gap-2">
                      <Icon className={cn('h-3.5 w-3.5 mt-0.5 shrink-0', meta.color)} />
                      <span className="text-[12px] font-medium leading-tight line-clamp-2 flex-1">
                        {session.title}
                      </span>
                      {/* Agent mark for this session */}
                      {session.agent && (() => {
                        const aId = SESSION_AGENT_MAP[session.agent] ?? session.agent
                        const a = AGENT_MAP[aId]
                        return a ? (
                          <span className={cn('shrink-0 flex h-4 w-4 items-center justify-center rounded text-[7px] font-bold', a.accent)}>{a.mark}</span>
                        ) : null
                      })()}
                      {session.pinned && (
                        <Pin className="h-3 w-3 text-orange-500/80 shrink-0" fill="currentColor" />
                      )}
                      <span
                        role="button"
                        title="Delete chat (pauses its scheduled jobs)"
                        className="ml-auto hidden shrink-0 rounded p-0.5 text-muted-foreground/50 hover:bg-rose-500/15 hover:text-rose-300 group-hover:inline-flex"
                        onClick={(e) => {
                          e.stopPropagation()
                          void deleteSession(session.id)
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground/70 line-clamp-1 pl-5">
                      {session.preview}
                    </p>
                    <div className="flex items-center gap-2 pl-5 text-[10px] text-muted-foreground/60 font-mono">
                      <span>{session.updatedAt.includes('T')
                        ? new Date(session.updatedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
                        : session.updatedAt}
                      </span>
                      {session.spent !== undefined && (
                        <>
                          <span>·</span>
                          <span className="text-orange-400/80">${session.spent.toFixed(2)}</span>
                        </>
                      )}
                      {session.tokens !== undefined && (
                        <>
                          <span>·</span>
                          <span>{Math.round(session.tokens / 1000)}K</span>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Footer */}
      <div className={cn('border-t border-border p-2 flex items-center gap-1', collapsed && 'flex-col')}>
        <NavItem
          icon={Cog}
          label="Settings"
          collapsed={collapsed}
          active={centerScreen === 'settings'}
          onClick={() => setCenterScreen('settings')}
        />
        <NavItem
          icon={Download}
          label="Downloads"
          collapsed={collapsed}
          onClick={() => notify('Downloads: 3 files')}
        />
        <NavItem
          icon={HelpCircle}
          label="Help"
          collapsed={collapsed}
          onClick={() => notify('Opening docs in browser…')}
        />
      </div>
    </aside>
  )
}

// === Casual mode — 56px rail (default) =======================================

function CasualRail() {
  const sessions = useAppStore((s) => s.sessions)
  const activeId = useAppStore((s) => s.activeSessionId)
  const setActiveSession = useAppStore((s) => s.setActiveSession)
  const newSession = useAppStore((s) => s.newSession)
  const setCenterScreen = useAppStore((s) => s.setCenterScreen)
  const togglePowerMode = useAppStore((s) => s.togglePowerMode)
  const selectedAgentId = useAppStore((s) => s.selectedAgentId)
  const setSelectedAgent = useAppStore((s) => s.setSelectedAgent)

  const agent = AGENT_MAP[selectedAgentId]

  return (
    <aside className="shrink-0 w-12 border-r border-border bg-sidebar flex flex-col no-select">
      {/* Agent switcher (compact) */}
      <div className="p-1.5 border-b border-border">
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <button className="w-9 h-9 mx-auto grid place-items-center rounded-md hover:bg-accent transition-colors">
                  <span className={cn('h-6 w-6 rounded-md text-[9px] font-bold flex items-center justify-center ring-1 ring-border', agent?.accent)}>
                    {agent?.mark ?? 'E'}
                  </span>
                </button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="right">Switch agent — {agent?.name ?? 'EveryAIOS'}</TooltipContent>
          </Tooltip>
          <DropdownMenuContent side="right" align="start" sideOffset={8} className="w-56">
            <DropdownMenuLabel className="text-[11px]">Agent</DropdownMenuLabel>
            {AGENTS.map((a) => (
              <DropdownMenuItem
                key={a.id}
                onClick={() => setSelectedAgent(a.id)}
                className={cn('text-xs', a.id === selectedAgentId && 'text-orange-500')}
              >
                <span className={cn('h-4 w-4 rounded text-[7px] font-bold flex items-center justify-center', a.accent)}>{a.mark}</span>
                <span className="flex-1">{a.name}</span>
                {a.id === selectedAgentId && <CheckCircle2 className="h-3.5 w-3.5" />}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-xs text-muted-foreground" onClick={() => setCenterScreen('settings')}>
              <Cog className="h-3.5 w-3.5 mr-1" /> Configure agents…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* New chat */}
      <div className="p-1.5 border-b border-border">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={newSession}
              className="grid h-9 w-9 mx-auto place-items-center rounded-md bg-orange-500/15 ring-1 ring-orange-500/30 hover:bg-orange-500/25"
            >
              <Plus className="h-4 w-4 text-orange-500" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">New chat (Cmd+N)</TooltipContent>
        </Tooltip>
      </div>

      {/* Recent sessions (collapsed) */}
      <div className="flex-1 overflow-y-auto scroll-thin p-1.5 space-y-1">
        {sessions.slice(0, 8).map((session) => {
          const meta = statusMeta[session.status]
          const Icon = meta.Icon
          const isActive = session.id === activeId
          return (
            <Tooltip key={session.id}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setActiveSession(session.id)}
                  className={cn(
                    'relative grid h-8 w-8 mx-auto place-items-center rounded-md transition-colors',
                    isActive ? 'bg-accent ring-1 ring-border' : 'hover:bg-accent/60'
                  )}
                >
                  <Icon className={cn('h-4 w-4', meta.color)} />
                  <span className={cn('absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full ring-2 ring-sidebar', meta.ring)} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">{session.title}</TooltipContent>
            </Tooltip>
          )
        })}
      </div>

      {/* Footer: settings + power toggle */}
      <div className="p-1.5 border-t border-border space-y-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => setCenterScreen('settings')}
              className="grid h-8 w-8 mx-auto place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              <Cog className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Settings</TooltipContent>
        </Tooltip>

        {/* Power toggle — reveals the full cockpit */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={togglePowerMode}
              className="grid h-8 w-8 mx-auto place-items-center rounded-md text-orange-500 hover:bg-orange-500/15 transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">More — advanced panels (⌘.)</TooltipContent>
        </Tooltip>
      </div>
    </aside>
  )
}

// === Progressive disclosure switch (B9/P31) ==================================

export function LeftSidebar() {
  const powerMode = useAppStore((s) => s.powerMode)
  return powerMode ? <PowerSidebar /> : <CasualRail />
}
