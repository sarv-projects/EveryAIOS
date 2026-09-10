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
  SubagentsSection,
  ToolLogSection,
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

type NavItem = {
  id: SectionId
  label: string
  icon: typeof SettingsIcon
  /** P51.24 — search keywords (feature synonyms) so a settings search finds
   * the section by what the user *calls* it, not only by its label/id. */
  keywords?: string[]
}

const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: 'Workspace',
    items: [
      { id: 'general', label: 'General', icon: SettingsIcon, keywords: ['preferences', 'startup', 'defaults'] },
      { id: 'appearance', label: 'Appearance', icon: Palette, keywords: ['theme', 'dark', 'light', 'accent', 'density'] },
      { id: 'notifications', label: 'Notifications', icon: Bell, keywords: ['alerts', 'toast', 'sounds'] },
      { id: 'privacy', label: 'Privacy', icon: Shield, keywords: ['data', 'telemetry', 'vault', 'collect', 'local'] },
      { id: 'keyboard', label: 'Keyboard', icon: Keyboard, keywords: ['shortcuts', 'hotkeys', 'keybindings'] },
      { id: 'voice', label: 'Voice', icon: Mic, keywords: ['speech', 'mic', 'stt', 'tts', 'read aloud'] },
      { id: 'mobile', label: 'Mobile', icon: Smartphone, keywords: ['phone', 'remote', 'resume'] },
    ],
  },
  {
    title: 'Intelligence',
    items: [
      { id: 'agents', label: 'Agents & Models', icon: Boxes, keywords: ['agent', 'runtime', 'llm', 'model', 'claude', 'codex', 'grok', 'gemini'] },
      { id: 'discover', label: 'Discover', icon: Compass, keywords: ['model', 'install', 'registry'] },
      { id: 'local', label: 'Local models', icon: Cpu, keywords: ['ollama', 'llamafile', 'gguf', 'vram', 'gpu', 'quant'] },
      { id: 'capabilities', label: 'Capabilities', icon: ShieldQuestion, keywords: ['matrix', 'tools', 'computer use'] },
      { id: 'apikeys', label: 'Providers / BYOK', icon: KeyRound, keywords: ['key', 'api', 'provider', 'openai', 'anthropic', 'nvidia', 'token', 'billing', 'credential'] },
      { id: 'experts', label: 'Experts', icon: Users, keywords: ['persona', 'role', 'built-in'] },
      { id: 'subagents', label: 'Subagents', icon: Users, keywords: ['delegate', 'installed', 'discover', 'cli'] },
      { id: 'tool-log', label: 'Tool log', icon: Activity, keywords: ['acp', 'observability', 'metrics', 'tools'] },
      { id: 'chat', label: 'Chat & Auto-run', icon: MessageSquare, keywords: ['composer', 'autoreply', 'auto run', 'behaviors'] },
      { id: 'skills', label: 'Skills', icon: Sparkles, keywords: ['plugin', 'marketplace'] },
      { id: 'rules', label: 'Rules', icon: BookOpen, keywords: ['constraints', 'policy', 'instructions'] },
      { id: 'memory', label: 'Memory', icon: Sparkles, keywords: ['recall', 'remember', 'facts'] },
    ],
  },
  {
    title: 'Connections',
    items: [
      { id: 'mcp', label: 'MCP', icon: Plug, keywords: ['connector', 'server', 'tools'] },
      { id: 'marketplace', label: 'Marketplace', icon: Store, keywords: ['extensions', 'install', 'hub'] },
      { id: 'sync', label: 'Sync', icon: RefreshCw, keywords: ['backup', 'export', 'import', 'lan', 'peer', 'device'] },
    ],
  },
  {
    title: 'Runtime',
    items: [
      { id: 'launch', label: 'Launch CLI', icon: Terminal, keywords: ['command line', 'shell'] },
      { id: 'runtime', label: 'Session runtime', icon: Layers, keywords: ['session', 'process', 'sidecar', 'logs'] },
      { id: 'worktree', label: 'Worktree', icon: FolderTree, keywords: ['workspace', 'folder', 'project', 'repo'] },
      { id: 'resources', label: 'Resources', icon: HardDrive, keywords: ['storage', 'disk', 'index', 'scan'] },
      { id: 'cloud', label: 'Cloud env', icon: Cloud, keywords: ['environment', 'container', 'vm'] },
    ],
  },
  {
    title: 'Security',
    items: [
      { id: 'permissions', label: 'Permissions', icon: ShieldCheck, keywords: ['guard', 'allow', 'approval', 'sandbox', 'risk', 'tickets'] },
      { id: 'browser', label: 'Browser & Network', icon: Globe, keywords: ['web', 'proxy', 'cdp', 'http', 'download'] },
      { id: 'indexing', label: 'Indexing & LSP', icon: ScanSearch, keywords: ['search', 'files', 'lsp', 'language server'] },
      { id: 'hooks', label: 'Hooks', icon: Wrench, keywords: ['webhook', 'events', 'script'] },
      { id: 'commands', label: 'Commands', icon: Command, keywords: ['slash', 'shortcuts', 'palette'] },
    ],
  },
  {
    title: 'Developer',
    items: [
      { id: 'usage', label: 'Usage', icon: Gauge, keywords: ['cost', 'spend', 'tokens', 'budget', 'price', 'billing', 'ledger'] },
      { id: 'ux', label: 'UX metrics', icon: Activity, keywords: ['telemetry', 'analytics', 'interaction'] },
      { id: 'feedback', label: 'Feedback', icon: MessageSquareWarning, keywords: ['nps', 'survey', 'report'] },
      { id: 'beta', label: 'Beta', icon: Package, keywords: ['preview', 'experimental', 'flags'] },
      { id: 'advanced', label: 'Advanced', icon: SlidersHorizontal, keywords: ['debug', 'power', 'expert', 'internals'] },
      { id: 'doctor', label: 'Doctor', icon: Stethoscope, keywords: ['health', 'diagnostics', 'check', 'repair'] },
      { id: 'about', label: 'About', icon: Info, keywords: ['version', 'update', 'license', 'credits'] },
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
    case 'subagents':
      return <SubagentsSection />
    case 'tool-log':
      return <ToolLogSection />
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

  // P51.24 — settings search matches label + id + keyword synonyms (so
  // "cost" finds Usage, "key" finds Providers/BYOK, "shortcut" finds both
  // Keyboard and Commands) and tolerates typos via a subsequence match
  // ("modelz" still finds "Models"). A query that matches nothing renders an
  // explicit empty state instead of a silently blank sidebar.
  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return NAV_GROUPS
    const fuzzy = (s: string): boolean => {
      let i = 0
      for (const ch of s.toLowerCase()) {
        if (ch === needle[i]) i += 1
        if (i === needle.length) return true
      }
      return i === needle.length
    }
    return NAV_GROUPS.map((g) => ({
      ...g,
      items: g.items.filter((n) =>
        fuzzy(n.label) ||
        fuzzy(n.id) ||
        (n.keywords ?? []).some((k) => fuzzy(k)),
      ),
    })).filter((g) => g.items.length > 0)
  }, [q])
  const noResults = q.trim() !== '' && groups.length === 0

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
            {noResults && (
              <div className="px-2 py-6 text-center">
                <div className="font-mono text-[10px] text-muted-foreground">
                  No settings match “{q.trim()}”
                </div>
                <button
                  type="button"
                  onClick={() => setQ('')}
                  className="mt-1 font-mono text-[9px] text-orange-300 underline-offset-2 hover:underline"
                >
                  clear search
                </button>
              </div>
            )}
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
