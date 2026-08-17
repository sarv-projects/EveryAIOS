'use client'

import * as React from 'react'
import {
  CircleDot,
  Cpu,
  Database,
  HardDrive,
  Network,
  ShieldCheck,
  Sparkles,
  Wifi,
  Zap,
  Activity,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Loader2,
} from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useAppStore } from '@/lib/store'
import { AGENT_MAP, MODEL_MAP, AGENTS } from '@/lib/agents'
import { cn } from '@/lib/utils'

// Simulated health data for agent runtimes
const AGENT_HEALTH: Record<string, {
  status: 'healthy' | 'degraded' | 'offline'
  latency: number // ms
  uptime: number // minutes
  tasksCompleted: number
  errorRate: number // 0-1
}> = {
  'everyaios-native': { status: 'healthy', latency: 12, uptime: 347, tasksCompleted: 84, errorRate: 0.01 },
  'claude-code': { status: 'healthy', latency: 45, uptime: 347, tasksCompleted: 156, errorRate: 0.02 },
  'codex-cli': { status: 'healthy', latency: 62, uptime: 240, tasksCompleted: 98, errorRate: 0.03 },
  'grok-build': { status: 'degraded', latency: 180, uptime: 120, tasksCompleted: 42, errorRate: 0.08 },
  'gemini-cli': { status: 'healthy', latency: 38, uptime: 347, tasksCompleted: 67, errorRate: 0.01 },
  'cursor-agent': { status: 'offline', latency: 0, uptime: 0, tasksCompleted: 0, errorRate: 0 },
  'aider': { status: 'healthy', latency: 55, uptime: 180, tasksCompleted: 73, errorRate: 0.04 },
  'opencode': { status: 'degraded', latency: 210, uptime: 60, tasksCompleted: 12, errorRate: 0.12 },
}

const healthIcon = {
  healthy: CheckCircle2,
  degraded: AlertTriangle,
  offline: CircleDot,
}
const healthColor = {
  healthy: 'text-emerald-400',
  degraded: 'text-amber-400',
  offline: 'text-red-400',
}

interface Stat {
  icon: React.ElementType
  label: string
  value: string
  color?: string
  tooltip: string
}

export function StatusBar() {
  const agentPaused = useAppStore((s) => s.agentPaused)
  const sessions = useAppStore((s) => s.sessions)
  const activeId = useAppStore((s) => s.activeSessionId)
  const active = sessions.find((s) => s.id === activeId)
  const selectedAgentId = useAppStore((s) => s.selectedAgentId)
  const selectedModelId = useAppStore((s) => s.selectedModelId)
  const autoRoute = useAppStore((s) => s.autoRoute)
  const liveBudget = useAppStore((s) => s.liveBudget)
  const powerMode = useAppStore((s) => s.powerMode)

  const agent = AGENT_MAP[selectedAgentId]
  const model = MODEL_MAP[selectedModelId]
  const health = AGENT_HEALTH[selectedAgentId]
  const HealthIcon = health ? healthIcon[health.status] : CircleDot
  const healthCol = health ? healthColor[health.status] : 'text-zinc-400'

  const stats: Stat[] = [
    {
      icon: Sparkles,
      label: 'agent',
      value: active?.agent ?? 'analyst',
      tooltip: `Active agent: ${active?.agent ?? 'analyst'}`,
    },
    {
      icon: Cpu,
      label: 'sidecar',
      value: 'online',
      color: 'text-emerald-400',
      tooltip: 'TS sidecar (Bun-compiled) · 93MB RSS · 12ms IPC',
    },
    {
      icon: Database,
      label: 'core',
      value: 'rust',
      color: 'text-emerald-400',
      tooltip: 'everyaios-core binary · WAL mode · audit append-only',
    },
    {
      icon: HardDrive,
      label: 'db',
      value: '3 / 14MB',
      tooltip: '3 SQLite DBs (app · memory · vault) · 14MB total',
    },
    {
      icon: Network,
      label: 'mcp',
      value: '127.0.0.1:9200',
      tooltip: 'MCP server on loopback · token-gated',
    },
    {
      icon: Wifi,
      label: 'browser',
      value: 'chrome (system)',
      tooltip: 'System Chrome via CDP · 1 active tab · tier-2',
    },
    {
      icon: Zap,
      label: 'cache',
      value: liveBudget?.cacheHitRate != null
        ? `${Math.round(liveBudget.cacheHitRate * 100)}%`
        : '94%',
      color: 'text-emerald-400',
      tooltip: liveBudget?.cacheHitRate != null
        ? `Prompt cache hit rate · ${Math.round(liveBudget.cacheHitRate * 100)}% (live)`
        : 'Prompt cache hit rate · 94% (last 30 turns)',
    },
  ]

  return (
    <footer className="shrink-0 h-6 border-t border-border bg-sidebar/80 backdrop-blur-xl flex items-center text-[10.5px] font-mono no-select">
      {/* Left cluster — agent health monitor */}
      <div className="flex items-center gap-1.5 px-2 border-r border-border/60 h-full">
        <span className={cn(
          'h-1.5 w-1.5 rounded-full',
          agentPaused ? 'bg-zinc-500' : 'bg-orange-500 live-dot'
        )} />
        <span className={cn(
          'text-muted-foreground',
          agentPaused ? '' : 'text-orange-400'
        )}>
          {agentPaused ? 'paused' : 'live'}
        </span>
        <span className="text-muted-foreground/40">·</span>
        <span className="text-muted-foreground/80">
          {active?.status === 'action-required' ? 'awaiting approval' : active?.status === 'running' ? 'regenerating chart' : 'idle'}
        </span>
        {/* Agent runtime health indicator */}
        {agent && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1.5 cursor-default">
                <span className="text-muted-foreground/30">│</span>
                <span className={cn('h-3.5 w-3.5 rounded text-[6px] font-bold flex items-center justify-center', agent.accent)}>{agent.mark}</span>
                <HealthIcon className={cn('h-2.5 w-2.5', healthCol)} />
                <span className={cn('text-[9.5px]', healthCol)}>
                  {health?.latency ?? '—'}ms
                </span>
                {model && (
                  <span className="text-muted-foreground/50">{model.label}</span>
                )}
                {autoRoute && (
                  <span className="text-orange-400/60">auto</span>
                )}
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="font-mono text-[11px] max-w-xs">
              <div className="space-y-1">
                <div className="font-semibold">{agent.name} · {model?.label ?? '—'}</div>
                <div>Status: {health?.status ?? 'unknown'} · Latency: {health?.latency ?? '—'}ms</div>
                <div>Tasks: {health?.tasksCompleted ?? 0} completed · Error rate: {((health?.errorRate ?? 0) * 100).toFixed(1)}%</div>
                <div>Uptime: {health ? `${Math.floor(health.uptime / 60)}h ${health.uptime % 60}m` : '—'}</div>
              </div>
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* Center — stats (power mode only; casual hides status detail) */}
      {powerMode && (
        <div className="flex items-center gap-0 flex-1 overflow-x-auto scroll-thin">
          {stats.map((stat, i) => {
            const Icon = stat.icon
            return (
              <Tooltip key={stat.label}>
                <TooltipTrigger asChild>
                  <div className={cn(
                    'flex items-center gap-1.5 px-2 h-full whitespace-nowrap',
                    i < stats.length - 1 && 'border-r border-border/40'
                  )}>
                    <Icon className={cn('h-2.5 w-2.5 text-muted-foreground/70')} />
                    <span className="text-muted-foreground/60">{stat.label}</span>
                    <span className={cn('text-foreground/80', stat.color)}>
                      {stat.value}
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="font-mono text-[11px]">
                  {stat.tooltip}
                </TooltipContent>
              </Tooltip>
            )
          })}
        </div>
      )}
      {!powerMode && <div className="flex-1" />}

      {/* Right cluster — guard + version */}
      <div className="flex items-center gap-2 px-2 border-l border-border/60 h-full">
        <div className="flex items-center gap-1 text-emerald-400">
          <ShieldCheck className="h-2.5 w-2.5" />
          <span>guard · L2</span>
        </div>
        <span className="text-muted-foreground/40">·</span>
        <span className="text-muted-foreground/70">vault · 7 keys</span>
        <span className="text-muted-foreground/40">·</span>
        <span className="text-muted-foreground/70">audit · append</span>
        <span className="text-muted-foreground/40">·</span>
        <span className="text-muted-foreground/50">EveryAIOS v3.22</span>
      </div>
    </footer>
  )
}
