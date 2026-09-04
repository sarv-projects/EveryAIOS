'use client'

import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Activity,
  Bell,
  BookOpen,
  Boxes,
  Cloud,
  Command,
  Compass,
  Cpu,
  Download,
  FolderTree,
  Gauge,
  Globe,
  HardDrive,
  Info,
  Keyboard,
  KeyRound,
  Layers,
  MessageSquare,
  MessageSquareWarning,
  Mic,
  Package,
  Palette,
  Plug,
  ScanSearch,
  Settings as SettingsIcon,
  RefreshCw,
  Shield,
  ShieldCheck,
  ShieldQuestion,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  Stethoscope,
  Store,
  Terminal,
  Users,
  Wrench,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppStore, type SettingsSectionId } from '@/lib/store'
import { FeedbackSection } from './feedback-panel'
import { UxMetricsSection } from './usage-metrics-section'
import { Input } from '@/components/ui/input'
import {
  AppearanceSection,
  GeneralSection,
  ModelsSection,
} from './settings-sections'
import {
  AboutSection,
  AdvancedSection,
  DoctorSection,
  KeyboardSection,
  PrivacySection,
  SyncSection,
} from './settings-sections-extra'
import AgentsModelsSection from './agents-models-section'
import { DiscoverSection } from './discover-section'
import { RuntimeSessionSection } from './runtime-session-section'
import LocalModelsPanel from './local-models-panel'
import CapabilityMatrixPanel from './capability-matrix-panel'
import MemoryPanel from './memory-panel'
import {
  BetaSection,
  BrowserNetworkSection,
  ChatAutoRunSection,
  CloudEnvSection,
  CommandsSection,
  ExpertsSection,
  HooksSection,
  IndexingSection,
  LaunchCliSection,
  MarketplaceSection,
  MobileSection,
  NotificationsSection,
  ResourcesSection,
  RulesSection,
  VoiceSection,
  WorktreeSection,
} from './settings-sections-studio'
import SkillsPanel from './skills-panel'
import ConnectorsPanel from './connectors-panel'

type SectionId = SettingsSectionId

const NAV_GROUPS: { title: string; items: { id: SectionId; label: string; icon: typeof SettingsIcon }[] }[] = [
  {
    title: 'Workspace',
    items: [
      { id: 'general', label: 'General', icon: SettingsIcon },
      { id: 'appearance', label: 'Appearance', icon: Palette },
      { id: 'notifications', label: 'Notifications', icon: Bell },
      { id: 'privacy', label: 'Privacy', icon: Shield },
      { id: 'keyboard', label: 'Keyboard', icon: Keyboard },
      { id: 'voice', label: 'Voice', icon: Mic },
      { id: 'mobile', label: 'Mobile', icon: Smartphone },
    ],
  },
  {
    title: 'Intelligence',
    items: [
      { id: 'agents', label: 'Agents & Models', icon: Boxes },
      { id: 'discover', label: 'Discover', icon: Compass },
      { id: 'local', label: 'Local models', icon: Cpu },
      { id: 'capabilities', label: 'Capabilities', icon: ShieldQuestion },
      { id: 'apikeys', label: 'Providers / BYOK', icon: KeyRound },
      { id: 'experts', label: 'Experts', icon: Users },
      { id: 'chat', label: 'Chat & Auto-run', icon: MessageSquare },
      { id: 'skills', label: 'Skills', icon: Sparkles },
      { id: 'rules', label: 'Rules', icon: BookOpen },
      { id: 'memory', label: 'Memory', icon: Sparkles },
    ],
  },
  {
    title: 'Connections',
    items: [
      { id: 'mcp', label: 'MCP', icon: Plug },
      { id: 'marketplace', label: 'Marketplace', icon: Store },
      { id: 'sync', label: 'Sync', icon: RefreshCw },
    ],
  },
  {
    title: 'Runtime',
    items: [
      { id: 'launch', label: 'Launch CLI', icon: Terminal },
      { id: 'runtime', label: 'Session runtime', icon: Layers },
      { id: 'worktree', label: 'Worktree', icon: FolderTree },
      { id: 'resources', label: 'Resources', icon: HardDrive },
      { id: 'cloud', label: 'Cloud env', icon: Cloud },
    ],
  },
  {
    title: 'Security',
    items: [
      { id: 'permissions', label: 'Permissions', icon: ShieldCheck },
      { id: 'browser', label: 'Browser & Network', icon: Globe },
      { id: 'indexing', label: 'Indexing & LSP', icon: ScanSearch },
      { id: 'hooks', label: 'Hooks', icon: Wrench },
      { id: 'commands', label: 'Commands', icon: Command },
    ],
  },
  {
    title: 'Developer',
    items: [
      { id: 'usage', label: 'Usage', icon: Gauge },
      { id: 'ux', label: 'UX metrics', icon: Activity },
      { id: 'feedback', label: 'Feedback', icon: MessageSquareWarning },
      { id: 'beta', label: 'Beta', icon: Package },
      { id: 'advanced', label: 'Advanced', icon: SlidersHorizontal },
      { id: 'doctor', label: 'Doctor', icon: Stethoscope },
      { id: 'about', label: 'About', icon: Info },
    ],
  },
]

function SectionBody({ section }: { section: SectionId }) {
  switch (section) {
    case 'general':
      return <GeneralSection />
    case 'appearance':
      return <AppearanceSection />
    case 'notifications':
      return <NotificationsSection />
    case 'voice':
      return <VoiceSection />
    case 'mobile':
      return <MobileSection />
    case 'agents':
      return <AgentsModelsSection />
    case 'local':
      return <LocalModelsPanel />
    case 'capabilities':
      return <CapabilityMatrixPanel />
    case 'apikeys':
      return <ModelsSection />
    case 'experts':
      return <ExpertsSection />
    case 'launch':
      return <LaunchCliSection />
    case 'chat':
      return <ChatAutoRunSection />
    case 'permissions':
      return <ChatAutoRunSection />
    case 'browser':
      return <BrowserNetworkSection />
    case 'indexing':
      return <IndexingSection />
    case 'mcp':
      return <ConnectorsPanel />
    case 'marketplace':
      return <MarketplaceSection />
    case 'skills':
      return <SkillsPanel />
    case 'commands':
      return <CommandsSection />
    case 'hooks':
      return <HooksSection />
    case 'worktree':
      return <WorktreeSection />
    case 'rules':
      return <RulesSection />
    case 'memory':
      return <MemoryPanel />
    case 'cloud':
      return <CloudEnvSection />
    case 'usage':
      return <UxMetricsSection />
    case 'ux':
      return <UxMetricsSection />
    case 'feedback':
      return <FeedbackSection />
    case 'resources':
      return <ResourcesSection />
    case 'beta':
      return <BetaSection />
    case 'privacy':
      return <PrivacySection />
    case 'sync':
      return <SyncSection />
    case 'keyboard':
      return <KeyboardSection />
    case 'advanced':
      return <AdvancedSection />
    case 'doctor':
      return <DoctorSection />
    case 'discover':
      return <DiscoverSection />
    case 'runtime':
      return <RuntimeSessionSection />
    case 'about':
      return <AboutSection />
    default:
      return <GeneralSection />
  }
}

export default function SettingsPanel() {
  const section = useAppStore((s) => s.settingsSection)
  const setSection = useAppStore((s) => s.setSettingsSection)
  const [q, setQ] = useState('')

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return NAV_GROUPS
    return NAV_GROUPS.map((g) => ({
      ...g,
      items: g.items.filter((n) => n.label.toLowerCase().includes(needle) || n.id.includes(needle)),
    })).filter((g) => g.items.length > 0)
  }, [q])

  return (
    <div className="flex h-full w-full flex-col">
      <header className="border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <SettingsIcon className="h-4 w-4 text-orange-400" />
          <h2 className="text-sm font-semibold text-foreground">Settings</h2>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-card p-2">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ctrl+F to search"
            className="mb-2 h-7 text-[11px]"
          />
          <nav className="scroll-thin min-h-0 flex-1 space-y-3 overflow-y-auto">
            {groups.map((g) => (
              <div key={g.title}>
                <div className="px-2 pb-1 font-mono text-[9px] uppercase tracking-wider text-muted-foreground/70">
                  {g.title}
                </div>
                <div className="space-y-0.5">
                  {g.items.map((n) => {
                    const Icon = n.icon
                    const isActive = section === n.id
                    return (
                      <button
                        key={n.id}
                        onClick={() => setSection(n.id)}
                        className={cn(
                          'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs transition-colors',
                          isActive
                            ? 'bg-orange-500/15 text-orange-300'
                            : 'text-foreground/70 hover:bg-accent hover:text-foreground',
                        )}
                      >
                        <Icon className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{n.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </nav>
        </aside>

        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
          <div className={cn('mx-auto p-4', section === 'local' ? 'max-w-6xl' : 'max-w-4xl')}>
            <AnimatePresence mode="wait">
              <motion.div
                key={section}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
              >
                <SectionBody section={section} />
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  )
}
