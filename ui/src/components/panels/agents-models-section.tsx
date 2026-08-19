'use client'

import { useState } from 'react'
import {
  Boxes,
  Check,
  CircleDot,
  Cpu,
  Download,
  ExternalLink,
  Gauge,
  KeyRound,
  Layers,
  RefreshCw,
  Route,
  Settings2,
  Terminal,
  Zap,
  GitCompare,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useAppStore } from '@/lib/store'
import {
  AGENTS,
  CAPABILITY_LABELS,
  MODELS,
  PROVIDER_LABELS,
  TASK_LABELS,
  formatContext,
  formatPrice,
  getModelsForAgent,
  type AgentRuntime,
  type TaskKind,
} from '@/lib/agents'
import { cn } from '@/lib/utils'
import { Row, SectionShell } from './settings-shared'

// === Agent card ===============================================================

function StatusBadge({ status }: { status: AgentRuntime['status'] }) {
  const tone =
    status === 'installed'
      ? 'bg-emerald-500/15 text-emerald-300'
      : status === 'updating'
        ? 'bg-orange-500/15 text-orange-300'
        : status === 'available'
          ? 'bg-zinc-500/15 text-zinc-400'
          : 'bg-rose-500/15 text-rose-300'
  return (
    <Badge className={cn('text-[9px] capitalize', tone)}>
      <CircleDot className="h-2.5 w-2.5" />
      {status}
    </Badge>
  )
}

function AgentLogo({ agent }: { agent: AgentRuntime }) {
  return (
    <span
      className={cn(
        'flex h-9 w-9 items-center justify-center rounded-md font-mono text-[13px] font-bold',
        agent.accent,
      )}
    >
      {agent.mark}
    </span>
  )
}

function AgentCard({ agent }: { agent: AgentRuntime }) {
  const selectedAgentId = useAppStore((s) => s.selectedAgentId)
  const setSelectedAgent = useAppStore((s) => s.setSelectedAgent)
  const notify = useAppStore((s) => s.notify)
  const isSelected = selectedAgentId === agent.id
  const models = getModelsForAgent(agent.id)

  return (
    <div
      className={cn(
        'rounded-lg border bg-background/40 p-3 transition-all hover-lift border-glow',
        isSelected ? 'border-orange-500/60 bg-orange-500/5 gradient-border' : 'border-border/60 hover:border-border',
      )}
    >
      <div className="flex items-start gap-2.5">
        <AgentLogo agent={agent} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[13px] font-semibold text-foreground">{agent.name}</span>
            <StatusBadge status={agent.status} />
            {isSelected && (
              <Badge className="bg-orange-500/20 text-[9px] text-orange-300">active</Badge>
            )}
          </div>
          <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
            {agent.vendor} · v{agent.version ?? '—'} · {agent.path ?? 'no path'}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">{agent.tagline}</p>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-1">
        {agent.capabilities.map((c) => (
          <Badge
            key={c}
            variant="secondary"
            className="bg-background/60 text-[8px] font-normal text-muted-foreground"
          >
            {CAPABILITY_LABELS[c]}
          </Badge>
        ))}
      </div>

      <div className="mt-2 flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
        <Layers className="h-3 w-3" />
        <span>{models.length} models</span>
        <span className="text-muted-foreground/30">|</span>
        <Terminal className="h-3 w-3" />
        <span className={cn(agent.headless ? 'text-emerald-300' : 'text-yellow-300')}>
          {agent.headless ? 'headless' : 'needs UI'}
        </span>
        <span className="text-muted-foreground/30">|</span>
        <Settings2 className="h-3 w-3" />
        <span
          className={cn(
            agent.sandbox === 'strict'
              ? 'text-emerald-300'
              : agent.sandbox === 'soft'
                ? 'text-yellow-300'
                : 'text-rose-300',
          )}
        >
          sandbox: {agent.sandbox}
        </span>
      </div>

      {agent.note && (
        <p className="mt-2 rounded border border-border/40 bg-background/30 px-2 py-1 text-[10px] text-muted-foreground/90">
          {agent.note}
        </p>
      )}

      <div className="mt-2.5 flex items-center gap-1">
        {agent.status === 'installed' || agent.status === 'updating' ? (
          <Button
            size="sm"
            variant={isSelected ? 'default' : 'outline'}
            className={cn(
              'h-7 px-2 text-[10px]',
              isSelected && 'bg-orange-500 text-black hover:bg-orange-400',
            )}
            onClick={() => setSelectedAgent(agent.id)}
            disabled={isSelected}
          >
            {isSelected ? (
              <>
                <Check className="h-3 w-3" />
                Selected
              </>
            ) : (
              'Use runtime'
            )}
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-[10px]"
            onClick={() => notify(`Installing ${agent.name}…`)}
          >
            <Download className="h-3 w-3" />
            Install
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-[10px]"
          onClick={() => notify(`Health check: ${agent.name}`)}
        >
          <RefreshCw className="h-3 w-3" />
          Health
        </Button>
        {agent.path && (
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto h-7 px-2 text-[10px] text-muted-foreground"
            onClick={() => notify(`Copied ${agent.path}`)}
          >
            <ExternalLink className="h-3 w-3" />
            Open
          </Button>
        )}
      </div>
    </div>
  )
}

function AgentsTab() {
  const notify = useAppStore((s) => s.notify)
  return (
    <SectionShell
      title="Agent runtimes"
      desc="The underlying coding-agent CLI / IDE plugin EveryAIOS can drive. Each runtime ships its own model support — Claude Code only drives Anthropic models, Codex CLI only OpenAI, etc."
      action={
        <Button
          size="sm"
          variant="outline"
          className="h-8"
          onClick={() => notify('Discover more — browsing the ACP registry (live in the shell)')}
        >
          <Boxes className="h-3.5 w-3.5" />
          Discover more
        </Button>
      }
    >
      <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
        {AGENTS.map((a) => (
          <AgentCard key={a.id} agent={a} />
        ))}
      </div>
    </SectionShell>
  )
}

// === Models tab ==============================================================

function ModelsTab() {
  const selectedModelId = useAppStore((s) => s.selectedModelId)
  const setSelectedModel = useAppStore((s) => s.setSelectedModel)
  const selectedAgentId = useAppStore((s) => s.selectedAgentId)
  const [compareOpen, setCompareOpen] = useState(false)
  const [compareIds, setCompareIds] = useState<string[]>([])

  const toggleCompare = (id: string) => {
    setCompareIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 3 ? [...prev, id] : prev
    )
  }

  return (
    <>
      <SectionShell
        title="Model catalog"
        desc="Every model reachable from any installed runtime. Pricing is per 1M tokens. Click to make it the active model — the active runtime must support it."
        action={
          <Button
            size="sm"
            variant="outline"
            className="h-6 px-2 text-[9px] gap-1"
            disabled={compareIds.length < 2}
            onClick={() => setCompareOpen(true)}
          >
            <GitCompare className="h-3 w-3" />
            Compare {compareIds.length > 0 ? `(${compareIds.length})` : ''}
          </Button>
        }
      >
      <div className="overflow-x-auto rounded-lg border border-border/60 scroll-thin">
        <table className="w-full min-w-[640px] text-[11px]">
          <thead className="bg-zinc-900/60 font-mono text-[9px] uppercase tracking-wider text-muted-foreground/80">
            <tr>
              <th className="px-2 py-1.5 w-6"></th>
              <th className="px-2 py-1.5 text-left">Model</th>
              <th className="px-2 py-1.5 text-left min-w-[110px]">Provider</th>
              <th className="px-2 py-1.5 text-right">Context</th>
              <th className="px-2 py-1.5 text-right">In / 1M</th>
              <th className="px-2 py-1.5 text-right">Out / 1M</th>
              <th className="px-2 py-1.5 text-left">Strengths</th>
              <th className="px-2 py-1.5 text-right"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {MODELS.map((m) => {
              const isActive = m.id === selectedModelId
              const supportedByActive = getModelsForAgent(selectedAgentId).some(
                (x) => x.id === m.id,
              )
              return (
                <tr
                  key={m.id}
                  className={cn(
                    'transition-colors',
                    isActive
                      ? 'bg-orange-500/10'
                      : compareIds.includes(m.id)
                        ? 'bg-blue-500/10'
                        : 'hover:bg-accent/30',
                  )}
                >
                  <td className="px-2 py-1.5 text-center">
                    <button
                      onClick={() => toggleCompare(m.id)}
                      className={cn(
                        'h-3.5 w-3.5 rounded border transition-colors',
                        compareIds.includes(m.id)
                          ? 'bg-orange-500 border-orange-500'
                          : 'border-border hover:border-orange-500/40'
                      )}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          'flex h-5 w-5 items-center justify-center rounded text-[9px] font-bold',
                          m.tone,
                        )}
                      >
                        {m.label.charAt(0)}
                      </span>
                      <span className="font-medium text-foreground">{m.label}</span>
                      {isActive && (
                        <Badge className="bg-orange-500/20 text-[8px] text-orange-300">active</Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-2 py-1.5 font-mono text-[10px] text-muted-foreground">
                    {PROVIDER_LABELS[m.provider]}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono text-[10px] text-muted-foreground">
                    {formatContext(m.context)}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono text-[10px] text-emerald-300">
                    {formatPrice(m.inputPrice)}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono text-[10px] text-orange-300">
                    {formatPrice(m.outputPrice)}
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex flex-wrap gap-1">
                      {m.strengths.slice(0, 3).map((s) => (
                        <span
                          key={s}
                          className="rounded border border-border/50 bg-background/40 px-1 py-0.5 font-mono text-[8px] text-muted-foreground"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <Button
                      size="sm"
                      variant={isActive ? 'ghost' : 'outline'}
                      disabled={isActive || !m.available || !supportedByActive}
                      className="h-6 px-2 text-[9px] disabled:cursor-not-allowed"
                      onClick={() => setSelectedModel(m.id)}
                      title={
                        !m.available
                          ? 'Model gated — request access from provider'
                          : !supportedByActive
                            ? 'Active runtime does not support this model'
                            : ''
                      }
                    >
                      {!m.available
                        ? 'gated'
                        : !supportedByActive
                          ? 'not in runtime'
                          : isActive
                            ? 'active'
                            : 'use'}
                    </Button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <Row
        label="API keys (BYOK)"
        desc="Per-provider keys live in the API Keys section"
      >
        <KeyRound className="h-4 w-4 text-orange-400" />
      </Row>
    </SectionShell>

    {/* Model Comparison Dialog */}
    <Dialog open={compareOpen} onOpenChange={setCompareOpen}>
      <DialogContent className="max-w-2xl glass-panel">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <GitCompare className="h-4 w-4 text-orange-500" />
            Model Comparison
          </DialogTitle>
        </DialogHeader>
        {compareIds.length >= 2 && (
          <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${Math.min(compareIds.length, 3)}, 1fr)` }}>
            {compareIds.map((id) => {
              const m = MODELS.find((x) => x.id === id)
              if (!m) return null
              return (
                <div key={m.id} className="rounded-lg border border-border/60 bg-background/40 p-3 accent-top-gradient">
                  <div className="flex items-center gap-2 mb-3">
                    <span className={cn('flex h-6 w-6 items-center justify-center rounded text-[10px] font-bold', m.tone)}>
                      {m.label.charAt(0)}
                    </span>
                    <div>
                      <div className="text-xs font-semibold">{m.label}</div>
                      <div className="text-[10px] text-muted-foreground">{PROVIDER_LABELS[m.provider]}</div>
                    </div>
                  </div>
                  <div className="space-y-2 text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Context</span>
                      <span className="font-mono">{formatContext(m.context)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Input price</span>
                      <span className="font-mono text-emerald-300">{formatPrice(m.inputPrice)} / 1M</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Output price</span>
                      <span className="font-mono text-orange-300">{formatPrice(m.outputPrice)} / 1M</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Available</span>
                      <span className={m.available ? 'text-emerald-400' : 'text-red-400'}>{m.available ? 'Yes' : 'Gated'}</span>
                    </div>
                    <div className="h-px bg-border/40" />
                    <div>
                      <div className="text-muted-foreground mb-1">Strengths</div>
                      <div className="flex flex-wrap gap-1">
                        {m.strengths.map((s) => (
                          <span key={s} className="rounded border border-border/50 bg-background/40 px-1 py-0.5 font-mono text-[8px] text-muted-foreground">{s}</span>
                        ))}
                      </div>
                    </div>
                    {m.recommendedFor && (
                      <div>
                        <div className="text-muted-foreground mb-0.5">Best for</div>
                        <span className="text-orange-300 text-[10px]">{m.recommendedFor}</span>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
    </>
  )
}

// === Routing tab =============================================================

const TASKS: TaskKind[] = [
  'code',
  'plan',
  'research',
  'browser',
  'shell',
  'office',
  'diff',
  'long-context',
]

function RoutingTab() {
  const routing = useAppStore((s) => s.routing)
  const setRouting = useAppStore((s) => s.setRouting)
  const autoRoute = useAppStore((s) => s.autoRoute)
  const setAutoRoute = useAppStore((s) => s.setAutoRoute)

  return (
    <SectionShell
      title="Task → runtime routing"
      desc="When auto-route is on, EveryAIOS picks the best runtime per turn based on the task kind. Override the table below to taste."
      action={
        <div className="flex items-center gap-2 rounded-md border border-border/60 bg-background/40 px-2 py-1">
          <Route className="h-3 w-3 text-orange-400" />
          <span className="text-[10px] font-medium text-foreground">Auto-route</span>
          <Switch checked={autoRoute} onCheckedChange={setAutoRoute} className="scale-75" />
        </div>
      }
    >
      <div className="overflow-x-auto rounded-lg border border-border/60 scroll-thin">
        <table className="w-full min-w-[520px] text-[11px]">
          <thead className="bg-zinc-900/60 font-mono text-[9px] uppercase tracking-wider text-muted-foreground/80">
            <tr>
              <th className="px-3 py-1.5 text-left">Task kind</th>
              <th className="px-3 py-1.5 text-left min-w-[180px]">Routed runtime</th>
              <th className="px-3 py-1.5 text-left">Why</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {TASKS.map((t) => {
              const agent = AGENTS.find((a) => a.id === routing[t]) ?? AGENTS[0]
              return (
                <tr key={t} className="hover:bg-accent/30">
                  <td className="px-3 py-2 font-medium text-foreground">{TASK_LABELS[t]}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          'flex h-5 w-5 items-center justify-center rounded text-[9px] font-bold',
                          agent.accent,
                        )}
                      >
                        {agent.mark}
                      </span>
                      <select
                        value={routing[t]}
                        onChange={(e) => setRouting(t, e.target.value)}
                        disabled={!autoRoute}
                        className="h-7 rounded border border-border bg-background px-1.5 font-mono text-[10px] text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {AGENTS.filter((a) => a.status === 'installed' || a.status === 'updating').map(
                          (a) => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                            </option>
                          ),
                        )}
                      </select>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-[10px] text-muted-foreground">
                    {agent.capabilities.includes(t as any) || t === 'long-context'
                      ? 'Strong match'
                      : 'Fallback'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-md border border-border/60 bg-background/40 p-2">
          <div className="flex items-center gap-1.5 text-[10px] font-medium text-foreground">
            <Zap className="h-3 w-3 text-orange-400" />
            Turns routed today
          </div>
          <div className="mt-1 font-mono text-lg text-foreground">47</div>
        </div>
        <div className="rounded-md border border-border/60 bg-background/40 p-2">
          <div className="flex items-center gap-1.5 text-[10px] font-medium text-foreground">
            <Gauge className="h-3 w-3 text-emerald-400" />
            Avg latency
          </div>
          <div className="mt-1 font-mono text-lg text-foreground">1.8s</div>
        </div>
        <div className="rounded-md border border-border/60 bg-background/40 p-2">
          <div className="flex items-center gap-1.5 text-[10px] font-medium text-foreground">
            <Cpu className="h-3 w-3 text-sky-400" />
            Distinct runtimes used
          </div>
          <div className="mt-1 font-mono text-lg text-foreground">5 / 7</div>
        </div>
      </div>
    </SectionShell>
  )
}

// === Section shell ===========================================================

export default function AgentsModelsSection() {
  const [tab, setTab] = useState('agents')
  return (
    <SectionShell
      title="Agents & Models"
      desc="Pick the underlying agent runtime (Claude Code, Codex, Grok Build, etc.) and the LLM it drives. Toggle auto-route to let EveryAIOS pick per task."
    >
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-8 bg-background/40">
          <TabsTrigger value="agents" className="text-[11px] data-[state=active]:bg-orange-500/15 data-[state=active]:text-orange-300">
            <Boxes className="mr-1 h-3 w-3" />
            Runtimes
          </TabsTrigger>
          <TabsTrigger value="models" className="text-[11px] data-[state=active]:bg-orange-500/15 data-[state=active]:text-orange-300">
            <Cpu className="mr-1 h-3 w-3" />
            Models
          </TabsTrigger>
          <TabsTrigger value="routing" className="text-[11px] data-[state=active]:bg-orange-500/15 data-[state=active]:text-orange-300">
            <Route className="mr-1 h-3 w-3" />
            Routing
          </TabsTrigger>
        </TabsList>
        <TabsContent value="agents" className="mt-3">
          <AgentsTab />
        </TabsContent>
        <TabsContent value="models" className="mt-3">
          <ModelsTab />
        </TabsContent>
        <TabsContent value="routing" className="mt-3">
          <RoutingTab />
        </TabsContent>
      </Tabs>
    </SectionShell>
  )
}
