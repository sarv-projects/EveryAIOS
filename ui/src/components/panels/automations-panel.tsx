'use client'

import { useState } from 'react'
import {
  Check,
  Clock,
  MessageSquare,
  Play,
  Plus,
  Webhook,
  X,
  Zap,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { mockAutomations, type Automation } from '@/lib/store'
import { cn } from '@/lib/utils'
import AutomationEditor from './automation-editor'

const TRIGGER_ICON: Record<
  Automation['triggerKind'],
  { icon: typeof Clock; label: string }
> = {
  schedule: { icon: Clock, label: 'Schedule' },
  webhook: { icon: Webhook, label: 'Webhook' },
  event: { icon: Zap, label: 'Event' },
  slack: { icon: MessageSquare, label: 'Slack' },
}

const TEMPLATES = [
  'CI Fixer',
  'Weekly Deps',
  'Security Scan',
  'Release Notes',
  'Slack Digest',
  'Standup Bot',
  'Invoice Batch',
  'Log Rotator',
]

function Sparkline({ data, enabled }: { data: number[]; enabled: boolean }) {
  const max = Math.max(...data, 1)
  // Render first 24 bars
  const bars = data.slice(0, 24)
  return (
    <div className="flex h-7 items-end gap-[2px]" aria-hidden>
      {bars.map((v, i) => (
        <div
          key={i}
          className={cn(
            'w-[3px] rounded-sm',
            enabled ? 'bg-orange-500/80' : 'bg-zinc-600/70',
          )}
          style={{ height: `${Math.max(8, (v / max) * 100)}%` }}
        />
      ))}
    </div>
  )
}

export default function AutomationsPanel() {
  const [automations, setAutomations] = useState(mockAutomations)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [nlInput, setNlInput] = useState('')

  const toggleEnabled = (id: string) =>
    setAutomations((prev) =>
      prev.map((a) => (a.id === id ? { ...a, enabled: !a.enabled } : a)),
    )

  const selected = automations.find((a) => a.id === selectedId) ?? null

  return (
    <div className="flex h-full w-full flex-col">
      <header className="border-b border-border px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-orange-400" />
            <h2 className="text-sm font-semibold text-foreground">Automations</h2>
            <Badge variant="secondary" className="text-[9px]">
              {automations.filter((a) => a.enabled).length} active
            </Badge>
          </div>
          <Button
            size="sm"
            className="h-8 bg-orange-500 text-black hover:bg-orange-400"
          >
            <Plus className="h-3.5 w-3.5" />
            Create automation
          </Button>
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          Scheduled tasks, webhooks &amp; event triggers that drive headless
          agent sessions
        </p>
        <Tabs defaultValue="active" className="mt-3">
          <TabsList className="h-7">
            <TabsTrigger value="active" className="text-xs">
              Active
            </TabsTrigger>
            <TabsTrigger value="templates" className="text-xs">
              Templates
            </TabsTrigger>
            <TabsTrigger value="history" className="text-xs">
              History
            </TabsTrigger>
          </TabsList>
          <TabsContent value="active" />
          <TabsContent value="templates" />
          <TabsContent value="history" />
        </Tabs>
      </header>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-3 p-4">
          <div className="grid gap-3 xl:grid-cols-2">
            {automations.map((a) => {
              const Trigger = TRIGGER_ICON[a.triggerKind]
              const Icon = Trigger.icon
              return (
                <div
                  key={a.id}
                  onClick={() => setSelectedId(a.id)}
                  className={cn(
                    'group cursor-pointer rounded-lg border bg-card p-4 transition-colors hover:border-orange-500/50',
                    selectedId === a.id
                      ? 'border-orange-500/50'
                      : 'border-border',
                    !a.enabled && 'opacity-70',
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Icon className="h-3.5 w-3.5 shrink-0 text-orange-400" />
                        <h3 className="truncate text-sm font-medium text-foreground">
                          {a.name}
                        </h3>
                      </div>
                      <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                        {a.trigger}
                      </p>
                      <p className="mt-0.5 text-xs text-foreground/70">
                        {a.action}
                      </p>
                    </div>
                    <Switch
                      checked={a.enabled}
                      onClick={(e) => e.stopPropagation()}
                      onCheckedChange={() => toggleEnabled(a.id)}
                      aria-label="Toggle automation"
                    />
                  </div>

                  <div className="mt-3">
                    <Sparkline data={a.activity} enabled={a.enabled} />
                  </div>

                  <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
                    <div className="flex items-center gap-2 font-mono">
                      <span>Runs: {a.runs}</span>
                      <span className="text-emerald-400">
                        <Check className="mr-0.5 inline h-3 w-3" />
                        {a.success}
                      </span>
                      <span className="text-red-400">
                        <X className="mr-0.5 inline h-3 w-3" />
                        {a.failed}
                      </span>
                    </div>
                    <span className="text-[10px]">
                      Last run: {a.lastRun ?? 'never'}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>

          {selected && (
            <AutomationEditor
              automation={selected}
              onClose={() => setSelectedId(null)}
            />
          )}

          {/* Templates row */}
          <div className="rounded-lg border border-border bg-card p-3">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-xs font-medium text-foreground">
                Templates
              </span>
              <span className="font-mono text-[10px] text-muted-foreground">
                {TEMPLATES.length} presets
              </span>
            </div>
            <div className="scroll-thin flex gap-2 overflow-x-auto pb-1">
              {TEMPLATES.map((t) => (
                <button
                  key={t}
                  className="flex shrink-0 items-center gap-1 rounded-md border border-border bg-background/40 px-3 py-1.5 text-xs text-foreground/80 transition-colors hover:border-orange-500/40 hover:bg-orange-500/10 hover:text-orange-300"
                >
                  <Plus className="h-3 w-3" />
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Natural-language composer */}
      <footer className="border-t border-border bg-card p-3">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-background/40 px-3 py-2 focus-within:border-orange-500/50">
          <span className="font-mono text-[10px] text-muted-foreground">
            NL
          </span>
          <input
            value={nlInput}
            onChange={(e) => setNlInput(e.target.value)}
            placeholder="Describe an automation in natural language..."
            className="min-w-0 flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          <button
            className="flex size-6 shrink-0 items-center justify-center rounded-md bg-orange-500 text-black hover:bg-orange-400"
            aria-label="Create automation from description"
          >
            <Play className="h-3 w-3" />
          </button>
        </div>
      </footer>
    </div>
  )
}
