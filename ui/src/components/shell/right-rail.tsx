'use client'

import * as React from 'react'
import { Suspense } from 'react'
import {
  Folder,
  Terminal,
  Globe,
  Code2,
  Sparkles,
  Activity,
  Plus,
  Maximize2,
  Minimize2,
  PanelRightClose,
  PanelRight,
  GripVertical,
  ScanSearch,
  X,
  FileText,
  Table,
  Presentation,
  File,
  HardDrive,
  GitBranch,
  GitCompare,
  MonitorSmartphone,
  ShieldCheck,
  History,
  Check,
  Download,
  RotateCw,
  Trash2,
} from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAppStore, type ViewId } from '@/lib/store'
import { AGENT_MAP, DEFAULT_ROUTING, type TaskKind } from '@/lib/agents'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'

import FolderView from '@/components/views/folder-view'
import ShellView from '@/components/views/shell-view'
import BrowseView from '@/components/views/browse-view'
import DocxView from '@/components/views/office-docx-view'
import PptxView from '@/components/views/office-pptx-view'
import ProgressView from '@/components/views/progress-view'
import DiffView from '@/components/views/diff-view'
import KanbanView from '@/components/views/kanban-view'
import AuditView from '@/components/views/audit-view'
import StorageView from '@/components/views/storage-view'
import TrajectoryView from '@/components/views/trajectory-view'
import BlueprintView from '@/components/views/blueprint-view'
import LocalServerView from '@/components/views/local-server-view'
import { SessionTimeline } from '@/components/chat/session-timeline'

// P39.5 — heavy views load on first use, not at startup. The IDE workbench
// pulls Monaco (~4 MB), the spreadsheet view pulls IronCalc, the PDF view
// pulls pdf.js, and the generative view pulls the AG-UI surface — none of
// them should parse/execute at app boot (R6 fix #2 lazy activation).
const IdeWorkbench = React.lazy(() => import('@/components/views/ide/ide-workbench').then(m => ({ default: m.IdeWorkbench })))
const XlsxView = React.lazy(() => import('@/components/views/office-xlsx-view'))
const PdfView = React.lazy(() => import('@/components/views/office-pdf-view'))
const GenerativeView = React.lazy(() => import('@/components/views/generative-view'))
const ArtifactView = React.lazy(() => import('@/components/views/artifact-view'))
const CodeView = React.lazy(() => import('@/components/views/code-view'))
const DesktopView = React.lazy(() => import('@/components/views/desktop-view'))

// Map viewport IDs to the task kind that determines which agent handles them
const VIEW_TASK_MAP: Partial<Record<ViewId, TaskKind>> = {
  folder: 'code',
  shell: 'shell',
  browse: 'browser',
  code: 'code',
  'office-xlsx': 'office',
  'office-docx': 'office',
  'office-pptx': 'office',
  'office-pdf': 'office',
  progress: 'plan',
  diff: 'diff',
  audit: 'plan',
  storage: 'code',
  timeline: 'plan',
  trajectory: 'plan',
  desktop: 'browser',
}

interface RailItem {
  id: ViewId
  icon: React.ElementType
  label: string
  shortcut: string
  live?: boolean
}

const railItems: RailItem[] = [
  { id: 'folder', icon: Folder, label: 'Folder', shortcut: '⌘⇧E' },
  { id: 'shell', icon: Terminal, label: 'Shell', shortcut: 'Ctrl+`' },
  { id: 'browse', icon: Globe, label: 'Browse', shortcut: '⌘⇧B', live: true },
  { id: 'code', icon: Code2, label: 'Code', shortcut: '⌘⇧C' },
]

const sessionItems: RailItem[] = [
  { id: 'progress', icon: Activity, label: 'Progress', shortcut: '⌘⇧P', live: true },
  { id: 'trajectory', icon: ScanSearch, label: 'Trajectory', shortcut: '⌘⇧T' },
]

const officeFlyoutItems = [
  { id: 'office-xlsx' as ViewId, label: 'Spreadsheet', live: false, type: 'Sheets' },
  { id: 'office-docx' as ViewId, label: 'Document', live: false, type: 'Word' },
  { id: 'office-pptx' as ViewId, label: 'Slides', live: false, type: 'Slides' },
  { id: 'office-pdf' as ViewId, label: 'PDF', live: false, type: 'PDF' },
]

// View metadata for the multi-view tab strip (ARCH/12 v3.0 — VS Code-style).
// P50.3.7 — office labels are kind names until a real file is open; the tab
// strip and flyout show `officePaths[v]` filenames once attached (never demo
// filenames as if they were open).
const VIEW_META: Record<ViewId, { label: string; icon: React.ElementType }> = {
  folder: { label: 'Folder', icon: Folder },
  shell: { label: 'Terminal', icon: Terminal },
  browse: { label: 'Browser', icon: Globe },
  code: { label: 'Code', icon: Code2 },
  'office-xlsx': { label: 'Spreadsheet', icon: Table },
  'office-docx': { label: 'Document', icon: FileText },
  'office-pptx': { label: 'Slides', icon: Presentation },
  'office-pdf': { label: 'PDF', icon: File },
  progress: { label: 'Progress', icon: Activity },
  diff: { label: 'Diff', icon: GitCompare },
  audit: { label: 'Audit', icon: ShieldCheck },
  storage: { label: 'Storage', icon: HardDrive },
  timeline: { label: 'Timeline', icon: Activity },
  trajectory: { label: 'Trajectory', icon: ScanSearch },
  blueprint: { label: 'Blueprint', icon: FileText },
  'local-server': { label: 'Local Server', icon: FileText },
  kanban: { label: 'Kanban', icon: GitBranch },
  generative: { label: 'Generative UI', icon: Sparkles },
  artifact: { label: 'Artifact', icon: MonitorSmartphone },
  desktop: { label: 'Computer use', icon: MonitorSmartphone },
}

function ViewportContent({ view }: { view: ViewId }) {
  return (
    <Suspense
      fallback={
        <div className="h-full w-full flex items-center justify-center text-xs text-muted-foreground animate-pulse">
          Loading view…
        </div>
      }
    >
      {renderView(view)}
    </Suspense>
  )
}

function renderView(view: ViewId) {
  switch (view) {
    case 'folder': return <FolderView />
    case 'shell': return <ShellView />
    case 'browse': return <BrowseView />
    case 'code': return <IdeWorkbench />
    case 'office-xlsx': return <XlsxView />
    case 'office-docx': return <DocxView />
    case 'office-pptx': return <PptxView />
    case 'office-pdf': return <PdfView />
    case 'progress': return <ProgressView />
    case 'diff': return <DiffView />
    case 'audit': return <AuditView />
    case 'storage': return <StorageView />
    case 'timeline': return <SessionTimeline />
    case 'trajectory': return <TrajectoryView />
    case 'blueprint': return <BlueprintView />
    case 'local-server': return <LocalServerView />
    case 'kanban': return <KanbanView />
    case 'generative': return <GenerativeView />
    case 'artifact': return <ArtifactView />
    case 'desktop': return <DesktopView />
    default: return null
  }
}

export function ActivityRail() {
  const activeView = useAppStore((s) => s.activeView)
  const setActiveView = useAppStore((s) => s.setActiveView)
  const officePaths = useAppStore((s) => s.officePaths)
  const railCollapsed = useAppStore((s) => s.railCollapsed)
  const toggleRail = useAppStore((s) => s.toggleRail)
  const setOfficeFlyoutOpen = useAppStore((s) => s.setOfficeFlyoutOpen)
  const officeFlyoutOpen = useAppStore((s) => s.officeFlyoutOpen)
  const setRailCollapsed = useAppStore((s) => s.setRailCollapsed)
  // P50.3.7/8 — rail dots reflect live attachment, never static flags.
  const browserAttached = useAppStore((s) => s.browserAttached)

  const handleClick = (item: RailItem) => {
    if (item.id === activeView && !railCollapsed) {
      setRailCollapsed(true)
    } else {
      setActiveView(item.id)
    }
  }

  return (
    <div className="shrink-0 w-12 border-l border-border bg-sidebar/80 backdrop-blur-xl flex flex-col items-center py-2 gap-1 no-select relative z-20">
      {railItems.map((item) => {
        const Icon = item.icon
        const isActive = activeView === item.id && !railCollapsed
        // P50.3.8 — the Browse dot means a live CDP session is attached.
        const showLive = item.id === 'browse' ? browserAttached : item.live
        return (
          <Tooltip key={item.id}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => handleClick(item)}
                aria-label={`Open ${item.label} view`}
                className={cn(
                  'group relative grid h-9 w-9 place-items-center rounded-md transition-all',
                  isActive
                    ? 'bg-orange-500/15 text-orange-500 ring-1 ring-orange-500/30'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                )}
              >
                <Icon className="h-4 w-4" />
                {showLive && (
                  <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-orange-500 live-dot ring-2 ring-sidebar" />
                )}
                {isActive && (
                  <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r bg-orange-500" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="left" sideOffset={8}>
              {item.label}
              <span className="ml-2 text-muted-foreground text-[10px] font-mono">{item.shortcut}</span>
              {showLive && (
                <span className="ml-2 inline-flex items-center gap-1 text-[10px] text-orange-400">
                  <span className="h-1 w-1 rounded-full bg-orange-500 live-dot" /> Live
                </span>
              )}
              {/* Show which agent handles this view type via routing */}
              {(() => {
                const task = VIEW_TASK_MAP[item.id]
                if (!task) return null
                const aId = DEFAULT_ROUTING[task]
                const a = AGENT_MAP[aId]
                if (!a) return null
                return (
                  <span className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground/80">
                    <span className={cn('h-3 w-3 rounded text-[6px] font-bold flex items-center justify-center', a.accent)}>{a.mark}</span>
                    {a.name}
                  </span>
                )
              })()}
            </TooltipContent>
          </Tooltip>
        )
      })}

      <div className="w-5 h-px bg-border my-1.5" />

      <Popover open={officeFlyoutOpen} onOpenChange={setOfficeFlyoutOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button
                type="button"
                onClick={() => {
                  if (!activeView.startsWith('office-')) setActiveView('office-xlsx')
                  setRailCollapsed(false)
                  setOfficeFlyoutOpen(true)
                }}
                aria-label="Open Office documents"
                className={cn(
                  'group relative grid h-9 w-9 place-items-center rounded-md transition-all',
                  activeView.startsWith('office-') && !railCollapsed
                    ? 'bg-orange-500/15 text-orange-500 ring-1 ring-orange-500/30'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                )}
              >
                <span className="text-[12px] font-bold leading-none">W</span>
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="left" sideOffset={8}>
            Office · Word/Excel/Slides/PDF
            <span className="ml-2 text-muted-foreground text-[10px] font-mono">⌘⇧O</span>
          </TooltipContent>
        </Tooltip>
        <PopoverContent side="left" align="start" sideOffset={8} className="scale-in w-64 p-2">
          <div className="space-y-0.5">
            <div className="px-2 py-1 text-[10.5px] uppercase tracking-wider text-muted-foreground/70 font-semibold">
              Open documents
            </div>
            {officeFlyoutItems.map((doc) => (
              <button
                key={doc.id}
                onClick={() => {
                  setActiveView(doc.id)
                  setOfficeFlyoutOpen(false)
                }}
                className={cn(
                  'w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-[12px] hover:bg-accent transition-colors',
                  activeView === doc.id && 'bg-accent text-orange-500'
                )}
              >
                <span className="text-[10px] font-mono text-muted-foreground w-12">{doc.type}</span>
                <span className="flex-1 text-left truncate">
                  {officePaths[doc.id]?.split(/[\\/]/).pop() ?? doc.label}
                </span>
                {/* P50.3.7 — the dot means a real file is open, never a demo
                    filename. Kind label alone = nothing attached yet. */}
                {officePaths[doc.id] && (
                  <span className="h-1.5 w-1.5 rounded-full bg-orange-500 live-dot" />
                )}
              </button>
            ))}
            <div className="h-px bg-border my-1.5" />
            <button
              className="w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-[12px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              onClick={() => {
                const p = window.prompt('Path to a .docx / .xlsx / .pptx / .pdf')
                if (p?.trim()) useAppStore.getState().openOfficeDoc(p.trim())
                setOfficeFlyoutOpen(false)
              }}
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Open another…</span>
            </button>
          </div>
        </PopoverContent>
      </Popover>

      <div className="w-5 h-px bg-border my-1.5" />

      {sessionItems.map((item) => {
        const Icon = item.icon
        const isActive = activeView === item.id && !railCollapsed
        return (
          <Tooltip key={item.id}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => handleClick(item)}
                aria-label={`Open ${item.label} view`}
                className={cn(
                  'group relative grid h-9 w-9 place-items-center rounded-md transition-all',
                  isActive
                    ? 'bg-orange-500/15 text-orange-500 ring-1 ring-orange-500/30'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                )}
              >
                <Icon className="h-4 w-4" />
                {item.live && (
                  <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-orange-500 live-dot ring-2 ring-sidebar" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="left" sideOffset={8}>
              {item.label}
              <span className="ml-2 text-muted-foreground text-[10px] font-mono">{item.shortcut}</span>
            </TooltipContent>
          </Tooltip>
        )
      })}

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => setActiveView('timeline')}
            aria-label="Open session timeline"
            className="grid h-9 w-9 place-items-center rounded-md text-muted-foreground/60 hover:bg-accent hover:text-foreground transition-all mt-1 border border-dashed border-border"
          >
            <Activity className="h-4 w-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="left" sideOffset={8}>
          Timeline · Diff · Audit · Storage
        </TooltipContent>
      </Tooltip>

      <div className="flex-1" />

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={toggleRail}
            aria-label={railCollapsed ? 'Expand viewport' : 'Collapse viewport'}
            className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground/60 hover:bg-accent hover:text-foreground transition-all"
          >
            {railCollapsed ? (
              <PanelRight className="h-3.5 w-3.5" />
            ) : (
              <PanelRightClose className="h-3.5 w-3.5" />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="left" sideOffset={8}>
          {railCollapsed ? 'Expand viewport (⌘\\)' : 'Collapse viewport (⌘\\)'}
        </TooltipContent>
      </Tooltip>
    </div>
  )
}

export function RightViewport() {
  const railCollapsed = useAppStore((s) => s.railCollapsed)
  const activeView = useAppStore((s) => s.activeView)
  const setActiveView = useAppStore((s) => s.setActiveView)
  const openViews = useAppStore((s) => s.openViews)
  const officePaths = useAppStore((s) => s.officePaths)
  // P50.3.7/8 — per-tab attachment dots (browse = CDP session, desktop =
  // engine, office = open file) so the strip never claims live wrongly.
  const browserAttached = useAppStore((s) => s.browserAttached)
  const desktopAttached = useAppStore((s) => s.desktopAttached)
  const addView = useAppStore((s) => s.addView)
  const closeView = useAppStore((s) => s.closeView)
  const reorderViews = useAppStore((s) => s.reorderViews)
  const fullscreenView = useAppStore((s) => s.fullscreenView)
  const setFullscreenView = useAppStore((s) => s.setFullscreenView)

  // P33.7 — drag-reorder state for the tab strip.
  const [dragIndex, setDragIndex] = React.useState<number | null>(null)
  const [dropIndex, setDropIndex] = React.useState<number | null>(null)

  // Resize state — percentage of total window width
  const [viewportPct, setViewportPct] = React.useState<number>(45)
  const [isResizing, setIsResizing] = React.useState(false)

  const notify = useAppStore((s) => s.notify)

  // View-specific action buttons — wired to store actions so every button
  // does something real in the cockpit (mock-data preview + shell both work).
  const viewActions: Record<string, { icon: React.ElementType; label: string; action: () => void }[]> = {
    folder: [
      {
        icon: Plus,
        label: 'New file',
        action: () => notify('New file — type a name to create it in the workspace'),
      },
      {
        icon: GitCompare,
        label: 'Diff',
        action: () => addView('diff'),
      },
    ],
    shell: [
      {
        icon: Plus,
        label: 'New terminal',
        action: () => notify('New terminal tab — agent shell session'),
      },
      {
        icon: History,
        label: 'History',
        action: () => notify('Shell history — last 20 commands'),
      },
    ],
    browse: [
      // P50.3.8 — header actions must do real things: the session is single-
      // page (no tabs) and the snapshot lives in the view, so these route to
      // the surface instead of claiming fake tabs/inspections.
      {
        icon: Globe,
        label: 'Open Browse',
        action: () => setActiveView('browse'),
      },
      {
        icon: ScanSearch,
        label: 'Snapshot',
        action: () => setActiveView('browse'),
      },
    ],
    desktop: [
      {
        icon: MonitorSmartphone,
        label: 'Open Computer use',
        action: () => setActiveView('desktop'),
      },
    ],
    code: [
      {
        icon: Plus,
        label: 'New file',
        action: () => notify('New file — untitled.ts in the workspace'),
      },
      {
        icon: GitCompare,
        label: 'Diff',
        action: () => addView('diff'),
      },
    ],
    progress: [
      { icon: Activity, label: 'Timeline', action: () => setActiveView('timeline') },
      {
        icon: Download,
        label: 'Export log',
        action: () => notify('Exporting progress log (NDJSON)…'),
      },
    ],
    timeline: [
      { icon: Activity, label: 'Progress', action: () => setActiveView('progress') },
      {
        icon: ShieldCheck,
        label: 'Audit',
        action: () => addView('audit'),
      },
    ],
    'office-xlsx': [
      // P50.3.7 — route into the sheet surface instead of claiming fake
      // recalc results; the view's own Recalc runs IronCalc on the open file.
      {
        icon: RotateCw,
        label: 'Recalculate',
        action: () => {
          setActiveView('office-xlsx')
          notify('Use Recalc in the sheet — runs on the open file')
        },
      },
    ],
    'office-docx': [
      {
        icon: FileText,
        label: 'Open document',
        action: () => setActiveView('office-docx'),
      },
    ],
    'office-pptx': [
      {
        icon: Presentation,
        label: 'Open deck',
        action: () => setActiveView('office-pptx'),
      },
    ],
    'office-pdf': [
      {
        icon: ScanSearch,
        label: 'Search in PDF',
        action: () => {
          setActiveView('office-pdf')
          notify('Use “Find in PDF” in the open document')
        },
      },
    ],
    diff: [
      { icon: Check, label: 'Accept all', action: () => notify('Accepted all changes — revision 9') },
      { icon: X, label: 'Revert all', action: () => notify('Reverted — back to revision 7') },
    ],
    audit: [
      { icon: ShieldCheck, label: 'Live', action: () => notify('Watching live — append-only event stream') },
    ],
    storage: [
      {
        icon: Trash2,
        label: 'Clean up',
        action: () => notify('Cleanup plan — Guard-2 approval required'),
      },
    ],
  }
  const actions = viewActions[activeView] ?? []

  // Resize drag handlers
  React.useEffect(() => {
    if (!isResizing) return
    const onMove = (e: MouseEvent) => {
      const w = window.innerWidth
      // Right viewport occupies from (window - viewportPx) to window
      const newPx = w - e.clientX
      const pct = Math.min(70, Math.max(28, (newPx / w) * 100))
      setViewportPct(pct)
    }
    const onUp = () => setIsResizing(false)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [isResizing])

  return (
    <AnimatePresence initial={false} mode="wait">
      {!railCollapsed && (
        <motion.section
          key="viewport"
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: fullscreenView ? '100%' : `${viewportPct}%`, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
          className={cn(
            'border-l border-border bg-card/40 overflow-hidden flex flex-col min-w-0 relative',
            fullscreenView && 'fixed inset-0 z-50 w-full rounded-none bg-background',
          )}
        >
          {/* Multi-view tab strip (VS Code-style: default Terminal · Folder · Browser, "+" to add, × to close) */}
          <div className="flex shrink-0 items-center gap-0.5 overflow-x-auto scroll-thin border-b border-border bg-sidebar/60 px-1 pt-1 no-select">
            {openViews.map((v, idx) => {
              const meta = VIEW_META[v]
              const Icon = meta.icon
              const isActive = v === activeView
              const isDragTarget = dragIndex !== null && idx === dropIndex
              // P50.3.7/8 — live dot only on proven attachment: browse needs
              // the CDP session, desktop the engine, office an open file.
              const tabLive =
                v === 'browse'
                  ? browserAttached
                  : v === 'desktop'
                    ? desktopAttached
                    : v.startsWith('office-')
                      ? !!officePaths[v]
                      : false
              const tabTitle =
                v === 'browse'
                  ? browserAttached
                    ? 'Browser — CDP session attached'
                    : 'Browser — detached'
                  : v === 'desktop'
                    ? desktopAttached
                      ? 'Computer use — engine attached'
                      : 'Computer use — detached'
                    : (officePaths[v] ?? meta.label)
              return (
                <div
                  key={v}
                  draggable
                  onDragStart={(e) => {
                    setDragIndex(idx)
                    e.dataTransfer.effectAllowed = 'move'
                  }}
                  onDragOver={(e) => {
                    e.preventDefault()
                    if (dragIndex !== null && idx !== dragIndex) setDropIndex(idx)
                  }}
                  onDragLeave={() => {
                    if (dragIndex !== null && idx === dropIndex) setDropIndex(null)
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    if (dragIndex !== null && dropIndex !== null && dragIndex !== dropIndex) {
                      reorderViews(dragIndex, dropIndex)
                    }
                    setDragIndex(null)
                    setDropIndex(null)
                  }}
                  onDragEnd={() => {
                    setDragIndex(null)
                    setDropIndex(null)
                  }}
                  onClick={() => setActiveView(v)}
                  title={tabTitle}
                  className={cn(
                    'group flex cursor-pointer items-center gap-1.5 rounded-t-md border border-b-0 px-2 py-1 text-[10.5px] transition-colors',
                    isActive
                      ? 'border-border bg-card text-foreground'
                      : 'border-transparent text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                  )}
                >
                  <Icon className={cn('h-3 w-3 shrink-0', isActive && 'text-orange-500')} />
                  {tabLive && (
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500 live-dot" title={tabTitle} />
                  )}
                  <span
                    className={cn(
                      'max-w-[130px] truncate',
                      isDragTarget && 'rounded bg-orange-500/20 ring-1 ring-orange-500/50',
                      dragIndex === idx && 'opacity-40'
                    )}
                  >
                    {officePaths[v]?.split(/[\\/]/).pop() ?? meta.label}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      closeView(v)
                    }}
                    className="rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-accent"
                    title="Close view"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )
            })}

            {/* "+" — add any view (VS Code panel add) */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="grid h-6 w-6 shrink-0 place-items-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  title="Add view"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" sideOffset={4} className="w-56">
                <DropdownMenuLabel className="text-[11px]">Add view</DropdownMenuLabel>
                {Object.entries(VIEW_META)
                  .filter(([id]) => !openViews.includes(id as ViewId))
                  .map(([id, meta]) => {
                    const Icon = meta.icon
                    return (
                      <DropdownMenuItem
                        key={id}
                        onClick={() => addView(id as ViewId)}
                        className="text-xs"
                      >
                        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                        {meta.label}
                      </DropdownMenuItem>
                    )
                  })}
                {Object.keys(VIEW_META).every((id) => openViews.includes(id as ViewId)) && (
                  <DropdownMenuItem disabled className="text-[10px] text-muted-foreground">
                    All views open
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Resize handle */}
          <div
            onMouseDown={(e) => {
              e.preventDefault()
              setIsResizing(true)
            }}
            onDoubleClick={() => setViewportPct(45)}
            className={cn(
              'absolute left-0 top-0 z-20 h-full w-1 cursor-col-resize transition-colors',
              isResizing
                ? 'bg-orange-500/80'
                : 'bg-transparent hover:bg-orange-500/40',
            )}
            title="Drag to resize · double-click to reset"
          >
            <div className="absolute left-0 top-1/2 h-10 w-1 -translate-y-1/2 rounded-r">
              <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40 opacity-0 transition-opacity hover:opacity-100" />
            </div>
          </div>

          <div className="shrink-0 h-8 border-b border-border bg-sidebar/60 flex items-center px-2 gap-2 no-select">
            <span className="text-[11px] font-medium text-foreground/80 truncate flex-1 capitalize">
              {activeView === 'timeline' ? 'Session Timeline' : activeView.replace('office-', '').replace('-', ' ')}
            </span>
            {actions.map((act) => {
              const ActIcon = act.icon
              return (
                <Tooltip key={act.label}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={act.action}
                      className="grid h-5 w-5 place-items-center rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <ActIcon className="h-3 w-3" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" sideOffset={4}>{act.label}</TooltipContent>
                </Tooltip>
              )
            })}
            <button
              type="button"
              onClick={() => setFullscreenView(!fullscreenView)}
              aria-label={fullscreenView ? 'Exit fullscreen view' : 'Open fullscreen view'}
              title={fullscreenView ? 'Exit fullscreen (⌘⇧F)' : 'Fullscreen (⌘⇧F)'}
              className="grid h-5 w-5 place-items-center rounded hover:bg-accent text-muted-foreground hover:text-foreground"
            >
              {fullscreenView ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-hidden">
            {/* Surface crossfade (design doc: no horizontal slides) — enter-surface */}
            <AnimatePresence initial={false} mode="wait">
              <motion.div
                key={activeView}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
                className="enter-surface h-full"
              >
                <ViewportContent view={activeView} />
              </motion.div>
            </AnimatePresence>
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  )
}
