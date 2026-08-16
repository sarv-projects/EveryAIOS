'use client'

import { useState } from 'react'
import {
  Info,
  Keyboard,
  Palette,
  Settings as SettingsIcon,
  Shield,
  SlidersHorizontal,
  Boxes,
  KeyRound,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  AppearanceSection,
  GeneralSection,
  ModelsSection,
} from './settings-sections'
import {
  AboutSection,
  AdvancedSection,
  KeyboardSection,
  PrivacySection,
} from './settings-sections-extra'
import AgentsModelsSection from './agents-models-section'

type SectionId =
  | 'general'
  | 'appearance'
  | 'agents'
  | 'apikeys'
  | 'privacy'
  | 'keyboard'
  | 'advanced'
  | 'about'

const NAV: { id: SectionId; label: string; icon: typeof SettingsIcon }[] = [
  { id: 'general', label: 'General', icon: SettingsIcon },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'agents', label: 'Agents & Models', icon: Boxes },
  { id: 'apikeys', label: 'API Keys (BYOK)', icon: KeyRound },
  { id: 'privacy', label: 'Privacy', icon: Shield },
  { id: 'keyboard', label: 'Keyboard', icon: Keyboard },
  { id: 'advanced', label: 'Advanced', icon: SlidersHorizontal },
  { id: 'about', label: 'About', icon: Info },
]

export default function SettingsPanel() {
  const [section, setSection] = useState<SectionId>('agents')

  return (
    <div className="flex h-full w-full flex-col">
      <header className="border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <SettingsIcon className="h-4 w-4 text-orange-400" />
          <h2 className="text-sm font-semibold text-foreground">Settings</h2>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Section nav */}
        <aside className="w-52 shrink-0 border-r border-border bg-card p-2">
          <nav className="space-y-0.5">
            {NAV.map((n) => {
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
          </nav>
        </aside>

        {/* Active section content */}
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-4xl p-4">
            {section === 'general' && <GeneralSection />}
            {section === 'appearance' && <AppearanceSection />}
            {section === 'agents' && <AgentsModelsSection />}
            {section === 'apikeys' && <ModelsSection />}
            {section === 'privacy' && <PrivacySection />}
            {section === 'keyboard' && <KeyboardSection />}
            {section === 'advanced' && <AdvancedSection />}
            {section === 'about' && <AboutSection />}
          </div>
        </div>
      </div>
    </div>
  )
}
