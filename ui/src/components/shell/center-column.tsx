'use client'

import * as React from 'react'
import { useAppStore } from '@/lib/store'
import ChatPanel from '@/components/chat/chat-panel'
import AutomationsPanel from '@/components/panels/automations-panel'
import MemoryPanel from '@/components/panels/memory-panel'
import GuardPanel from '@/components/panels/guard-panel'
import ConnectorsPanel from '@/components/panels/connectors-panel'
import AnalyticsPanel from '@/components/panels/analytics-panel'
import AgentBuilderPanel from '@/components/panels/agent-builder-panel'
import SettingsPanel from '@/components/panels/settings-panel'
import HomeLaunchpad, { ActivityPanel, ProjectsPanel } from '@/components/panels/home-launchpad'
import FolderView from '@/components/views/folder-view'
import { motion, AnimatePresence } from 'framer-motion'

export function CenterColumn() {
  const centerScreen = useAppStore((s) => s.centerScreen)

  return (
    <div className="flex-1 min-w-0 flex flex-col bg-background relative overflow-hidden">
      <AnimatePresence mode="wait">
        <motion.div
          key={centerScreen}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
          className="flex-1 min-h-0 flex"
        >
          {centerScreen === 'home' && <HomeLaunchpad />}
          {centerScreen === 'chat' && <ChatPanel />}
          {centerScreen === 'activity' && <ActivityPanel />}
          {centerScreen === 'projects' && <ProjectsPanel />}
          {centerScreen === 'files' && (
            <div className="flex min-h-0 flex-1 flex-col">
              <FolderView />
            </div>
          )}
          {centerScreen === 'automations' && (
            <div className="flex-1 min-h-0 overflow-y-auto scroll-thin">
              <AutomationsPanel />
            </div>
          )}
          {centerScreen === 'memory' && (
            <div className="flex-1 min-h-0 overflow-y-auto scroll-thin">
              <MemoryPanel />
            </div>
          )}
          {centerScreen === 'guard' && (
            <div className="flex-1 min-h-0 overflow-y-auto scroll-thin">
              <GuardPanel />
            </div>
          )}
          {centerScreen === 'connectors' && (
            <div className="flex-1 min-h-0 overflow-y-auto scroll-thin">
              <ConnectorsPanel />
            </div>
          )}
          {centerScreen === 'agents' && (
            <div className="flex-1 min-h-0 overflow-y-auto scroll-thin">
              <AgentBuilderPanel />
            </div>
          )}
          {centerScreen === 'analytics' && (
            <div className="flex-1 min-h-0 overflow-y-auto scroll-thin">
              <AnalyticsPanel />
            </div>
          )}
          {centerScreen === 'settings' && (
            <div className="flex-1 min-h-0 overflow-y-auto scroll-thin">
              <SettingsPanel />
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
