'use client'

import * as React from 'react'
import {
  CheckCircle2,
  ChevronDown,
  Circle,
  Clock,
  Cog,
  FileText,
  Folder,
  HelpCircle,
  Home,
  Plus,
  Search,
  Sparkles,
  Star,
  Zap,
  AlertCircle,
  Pause,
  RefreshCw,
} from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useAppStore, type Session, type SessionStatus } from '@/lib/store'
import { staggerStyle } from '@/lib/stagger'
import { cn } from '@/lib/utils'

const statusMeta: Record<
  SessionStatus,
  { color: string; ring: string; Icon: typeof Circle; label: string }
> = {
  idle: { color: 'text-zinc-500', ring: 'bg-zinc-500', Icon: Circle, label: 'Idle' },
  running: { color: 'text-blue-400', ring: 'bg-blue-500', Icon: Circle, label: 'Running' },
  'action-required': { color: 'text-orange-400', ring: 'bg-orange-500', Icon: AlertCircle, label: 'Waiting for approval' },
  completed: { color: 'text-emerald-400', ring: 'bg-emerald-500', Icon: CheckCircle2, label: 'Completed' },
  failed: { color: 'text-red-400', ring: 'bg-red-500', Icon: AlertCircle, label: 'Failed' },
  paused: { color: 'text-zinc-400', ring: 'bg-zinc-400', Icon: Pause, label: 'Paused' },
  scheduled: { color: 'text-violet-400', ring: 'bg-violet-500', Icon: Star, label: 'Scheduled' },
  reconnecting: { color: 'text-amber-400', ring: 'bg-amber-500', Icon: RefreshCw, label: 'Reconnecting' },
}

function NavItem({
  icon: Icon,
  label,
  active,
  badge,
  collapsed,
  onClick,
}: {
  icon: React.ElementType
  label: string
  active?: boolean
  badge?: string
  collapsed?: boolean
  onClick?: () => void
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          className={cn(
            'group relative flex w-full items-center gap-2 rounded-md text-[12.5px] transition-colors',
            collapsed ? 'mx-auto h-9 w-9 justify-center' : 'h-8 px-2',
            active
              ? 'bg-accent text-foreground'
              : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
          )}
        >
          <Icon className={cn('h-4 w-4 shrink-0', active && 'text-orange-500')} />
          {!collapsed && <span className="flex-1 truncate text-left">{label}</span>}
          {!collapsed && badge && (
            <span className="font-mono text-[10px] text-muted-foreground/70">{badge}</span>
          )}
          {active && !collapsed && (
            <span className="absolute bottom-1.5 left-0 top-1.5 w-0.5 rounded-r bg-orange-500" />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

function Label({ children, collapsed }: { children: React.ReactNode; collapsed?: boolean }) {
  if (collapsed) return null
  return (
    <div className="px-2 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
      {children}
    </div>
  )
}

function WorkRow({
  session,
  collapsed,
  active,
  depth = 0,
}: {
  session: Session
  collapsed?: boolean
  active?: boolean
  depth?: number
}) {
  const setActiveSession = useAppStore((s) => s.setActiveSession)
  const meta = statusMeta[session.status]
  const Icon = session.pinned ? Star : meta.Icon
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => setActiveSession(session.id)}
          aria-label={session.title}
          className={cn(
            'relative w-full rounded-md text-left transition-colors',
            collapsed ? 'mx-auto grid h-8 w-8 place-items-center' : 'px-2 py-1.5',
            active ? 'bg-accent' : 'hover:bg-accent/50',
          )}
          style={!collapsed && depth > 0 ? { paddingLeft: depth * 14 + 8 } : undefined}
        >
          {collapsed ? (
            <>
              <Icon className={cn('h-4 w-4', meta.color)} />
              <span className={cn('absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full ring-2 ring-sidebar', meta.ring)} />
            </>
          ) : (
            <span className="flex items-start gap-2">
              {depth > 0 && (
                <span
                  aria-hidden="true"
                  className="mt-1.5 h-2 w-2 shrink-0 rounded-[2px] border border-muted-foreground/40"
                />
              )}
              <Icon className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', meta.color)} />
              <span className="min-w-0">
                <span className="block truncate text-[12.5px] text-foreground">{session.title}</span>
                <span className="block truncate text-[10.5px] text-muted-foreground">{meta.label}</span>
              </span>
            </span>
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">{session.title}</TooltipContent>
    </Tooltip>
  )
}

export function LeftSidebar() {
  const collapsed = useAppStore((s) => s.sidebarCollapsed)
  const sessions = useAppStore((s) => s.sessions)
  const activeId = useAppStore((s) => s.activeSessionId)
  const newSession = useAppStore((s) => s.newSession)
  const setCenterScreen = useAppStore((s) => s.setCenterScreen)
  const centerScreen = useAppStore((s) => s.centerScreen)
  const setPaletteOpen = useAppStore((s) => s.setPaletteOpen)
  const notify = useAppStore((s) => s.notify)
  const setSettingsSection = useAppStore((s) => s.setSettingsSection)
  const automations = sessions.filter((s) => s.status === 'scheduled').length

  const [query, setQuery] = React.useState('')
  const recent = React.useMemo(() => {
    const list = query
      ? sessions.filter((s) => s.title.toLowerCase().includes(query.toLowerCase()))
      : sessions
    return list.slice(0, 8)
  }, [sessions, query])

  return (
    <aside
      className={cn(
        'flex shrink-0 flex-col border-r border-border bg-sidebar no-select transition-[width] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
        collapsed ? 'w-12' : 'w-60',
      )}
    >
      <div className={cn('border-b border-border p-2', collapsed && 'px-1')}>
        {collapsed ? (
          <div className="mx-auto grid h-8 w-8 place-items-center rounded-md bg-orange-500/15 ring-1 ring-orange-500/30">
            <Sparkles className="h-4 w-4 text-orange-500" />
          </div>
        ) : (
          <button type="button" className="flex h-8 w-full items-center gap-2 rounded-md px-2 hover:bg-accent">
            <div className="grid h-5 w-5 place-items-center rounded-md bg-orange-500/15 ring-1 ring-orange-500/30">
              <Sparkles className="h-3 w-3 text-orange-500" />
            </div>
            <span className="flex-1 text-left text-[12.5px] font-semibold">EveryAIOS</span>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        )}
      </div>

      <div className={cn('space-y-1.5 border-b border-border p-2', collapsed && 'px-1')}>
        {collapsed ? (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" onClick={() => setPaletteOpen(true)} className="mx-auto grid h-8 w-8 place-items-center rounded-md hover:bg-accent">
                  <Search className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Search (⌘K)</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={newSession}
                  className="mx-auto grid h-8 w-8 place-items-center rounded-md bg-orange-500/15 ring-1 ring-orange-500/30 hover:bg-orange-500/25"
                >
                  <Plus className="h-4 w-4 text-orange-500" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">New work (⌘N)</TooltipContent>
            </Tooltip>
          </>
        ) : (
          <>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => setPaletteOpen(true)}
                placeholder="Search"
                className="h-7 w-full rounded-md border border-border bg-background/60 pl-7 pr-2 text-[12px] placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-orange-500/40"
              />
            </div>
            <button
              type="button"
              onClick={newSession}
              className="flex h-7 w-full items-center justify-center gap-1.5 rounded-md bg-orange-500 text-[12px] text-white hover:bg-orange-600"
            >
              <Plus className="h-3.5 w-3.5" /> New work
            </button>
          </>
        )}
      </div>

      <nav className="border-b border-border p-2">
        <Label collapsed={collapsed}>Home</Label>
        <NavItem
          icon={Home}
          label="Home"
          collapsed={collapsed}
          active={centerScreen === 'home'}
          onClick={() => setCenterScreen('home')}
        />
        <NavItem
          icon={Clock}
          label="Activity"
          collapsed={collapsed}
          active={centerScreen === 'activity'}
          onClick={() => setCenterScreen('activity')}
        />
        <Label collapsed={collapsed}>Work</Label>
        <NavItem
          icon={Folder}
          label="Projects"
          collapsed={collapsed}
          active={centerScreen === 'projects'}
          onClick={() => setCenterScreen('projects')}
        />
        <NavItem
          icon={FileText}
          label="Files"
          collapsed={collapsed}
          active={centerScreen === 'files'}
          onClick={() => setCenterScreen('files')}
        />
        <NavItem
          icon={Zap}
          label="Automations"
          collapsed={collapsed}
          badge={automations ? String(automations) : undefined}
          active={centerScreen === 'automations'}
          onClick={() => setCenterScreen('automations')}
        />
      </nav>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2">
          {!collapsed && (
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              Recent
            </span>
          )}
        </div>
        {/* P45.6 — content-visibility: auto skips layout/paint of off-screen
            session rows in long lists. */}
        <div className="scroll-thin min-h-0 flex-1 space-y-0.5 overflow-y-auto px-1 pb-2 [content-visibility:auto] [contain-intrinsic-size:auto_48px]">
          {recent
            // P11.5.1 — child sessions (forks) indent under their parent.
            .filter((s) => !s.parentId)
            .map((s, i) => (
              // P35.2 — entrance stagger on the sessions list.
              <div key={s.id} className="enter-stagger" style={staggerStyle(i)}>
                <WorkRow session={s} collapsed={collapsed} active={activeId === s.id} />
                {recent
                  .filter((c) => c.parentId === s.id)
                  .map((c) => (
                    <WorkRow key={c.id} session={c} collapsed={collapsed} active={activeId === c.id} depth={1} />
                  ))}
              </div>
            ))}
          {recent.filter((s) => !s.parentId).length === 0 &&
            recent.filter((s) => s.parentId).map((s) => (
              <WorkRow key={s.id} session={s} collapsed={collapsed} active={activeId === s.id} depth={1} />
            ))}
          {/* P50.2.1 — an empty vault renders an honest empty state, never a
              blank pane that reads as still loading. */}
          {recent.length === 0 && !collapsed && (
            <div className="px-3 py-6 text-center">
              <p className="text-[11px] text-muted-foreground">No work yet</p>
              <p className="mt-1 font-mono text-[10px] text-muted-foreground/60">
                New work above — your first message opens it
              </p>
            </div>
          )}
        </div>
      </div>

      <div className={cn('flex flex-col gap-0.5 border-t border-border p-2', collapsed && 'items-center')}>
        <NavItem
          icon={Cog}
          label="Settings"
          collapsed={collapsed}
          active={centerScreen === 'settings'}
          onClick={() => setCenterScreen('settings')}
        />
        <NavItem
          icon={HelpCircle}
          label="Help"
          collapsed={collapsed}
          onClick={() => notify('Opening docs in browser…')}
        />
        {!collapsed && (
          <button
            type="button"
            onClick={() => {
              setSettingsSection('general')
              setCenterScreen('settings')
            }}
            className="mt-1 flex items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent"
          >
            <span className="grid h-6 w-6 place-items-center rounded-full bg-zinc-700 text-[10px] font-medium">S</span>
            <span className="min-w-0 flex-1 truncate text-[12px]">Sarvesh</span>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        )}
      </div>
    </aside>
  )
}
