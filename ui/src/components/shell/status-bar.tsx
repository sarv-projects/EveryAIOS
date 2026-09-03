'use client'

import * as React from 'react'
import {
  CircleDot,
  Cpu,
  Database,
  HardDrive,
  MonitorSmartphone,
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
  Bell,
} from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useAppStore } from '@/lib/store'
import * as perfLib from '@/lib/perf'
import { AGENT_MAP, MODEL_MAP, AGENTS } from '@/lib/agents'
import { CompanionChip } from './companion-chip'
import { cn } from '@/lib/utils'
import { useRuntimeState } from '@/lib/runtime'
import { inTauri } from '@/lib/tauri'


interface Stat {
  icon: React.ElementType
  label: string
  value: string
  color?: string
  tooltip: string
  /** P50.3.7/8 — optional click-through to the owning surface. */
  onClick?: () => void
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
  const browserAttached = useAppStore((s) => s.browserAttached)
  // P50.3.7 — desktop engine attachment in the dev strip (mirrors browser).
  const desktopAttached = useAppStore((s) => s.desktopAttached)
  const desktopReason = useAppStore((s) => s.desktopReason)
  const setActiveView = useAppStore((s) => s.setActiveView)
  const devMode = useAppStore((s) => s.devMode)
  const monitorBadge = useAppStore((s) => s.monitorBadge)
  const clearMonitorBadge = useAppStore((s) => s.clearMonitorBadge)
  const { usePerfSnapshot } = perfLib
  const runtime = useRuntimeState()

  const agent = AGENT_MAP[selectedAgentId]
  const model = MODEL_MAP[selectedModelId]
  // Agent health, latency, uptime, and task counts are not available from the
  // runtime contract yet. Never invent them; show unknown until a live probe
  // supplies evidence.
  const healthLatency: number | undefined = undefined
  const HealthIcon = CircleDot
  const healthCol = 'text-zinc-400'
  const runtimeValue = runtime.status === 'live'
    ? 'live'
    : runtime.status === 'preview'
      ? 'preview'
      : runtime.status

  const stats: Stat[] = [
    {
      icon: Sparkles,
      label: 'agent',
      value: active?.agent ?? (inTauri() ? '—' : 'analyst'),
      tooltip: active?.agent ? `Active agent: ${active.agent}` : 'No active session agent is available.',
    },
    {
      icon: Cpu,
      label: 'sidecar',
      value: runtimeValue,
      color: runtime.status === 'live' ? 'text-emerald-400' : 'text-amber-300',
      tooltip: runtime.detail ?? 'Coordinator readiness is reported by the native runtime probe.',
    },
    {
      icon: Database,
      label: 'core',
      value: runtime.status === 'live' ? 'available' : 'unknown',
      color: runtime.status === 'live' ? 'text-emerald-400' : 'text-muted-foreground',
      tooltip: 'Core availability is not claimed until the runtime is live.',
    },
    {
      icon: HardDrive,
      label: 'db',
      value: '—',
      tooltip: 'Database size is shown only when a live storage probe supplies it.',
    },
    {
      icon: Network,
      label: 'mcp',
      value: '—',
      tooltip: 'MCP endpoint is not attached or reported by the runtime probe.',
    },
    {
      icon: Wifi,
      label: 'browser',
      value: browserAttached ? 'attached' : 'not attached',
      color: browserAttached ? 'text-emerald-400' : 'text-muted-foreground',
      tooltip: browserAttached
        ? 'CDP session attached — the browse view drives a real browser.'
        : 'No CDP session attached — start the browser from the Browse surface.',
      onClick: () => setActiveView('browse'),
    },
    {
      icon: MonitorSmartphone,
      label: 'desktop',
      value: desktopAttached ? 'attached' : 'not attached',
      color: desktopAttached ? 'text-emerald-400' : 'text-muted-foreground',
      tooltip: desktopAttached
        ? 'Desktop engine attached — the Computer use view drives native windows.'
        : desktopReason
          ? `Desktop engine detached — ${desktopReason}`
          : 'Desktop engine detached — open the Computer use surface to probe it.',
      onClick: () => setActiveView('desktop'),
    },
    {
      icon: Zap,
      label: 'cache',
      value: liveBudget?.cacheHitRate != null
        ? `${Math.round(liveBudget.cacheHitRate * 100)}%`
        : '—',
      color: liveBudget?.cacheHitRate != null ? 'text-emerald-400' : 'text-muted-foreground',
      tooltip: liveBudget?.cacheHitRate != null
        ? `Prompt cache hit rate · ${Math.round(liveBudget.cacheHitRate * 100)}% (live)`
        : 'Prompt cache hit rate is unavailable until the live usage ledger responds.',
    },
  ]

  // P11.5.4 — per-session takeover indicator (the active session's pause).
  const pausedSessions = useAppStore((s) => s.pausedSessions)
  const activePaused = !!pausedSessions[activeId]
  // P11.4 — LCP / TTI readout (dev mode) + discreet cold-start chip (casual).
  const perf = usePerfSnapshot()

  // Casual default: hide the debug telemetry strip. Show a single discreet
  // state pill + privacy reassurance; Settings → General → "Developer Mode"
  // restores the full 12-badge telemetry (devMode).
  if (!devMode) {
    const busy = active?.status === 'running' || active?.status === 'action-required'
    const preview = runtime.status === 'preview'
    return (
      <footer className="shrink-0 h-6 border-t border-border bg-sidebar/80 backdrop-blur-xl flex items-center text-[10.5px] font-mono no-select">
        <div className="flex items-center gap-1.5 px-3">
          <span className={cn(
            'h-1.5 w-1.5 rounded-full',
            preview ? 'bg-amber-400' : activePaused ? 'bg-yellow-400' : busy ? 'bg-orange-500 live-dot' : 'bg-emerald-400'
          )} />
          <span className="text-muted-foreground">
            {preview ? 'Development preview' : activePaused ? '⏸ Paused' : busy ? 'Processing…' : runtimeValue}
          </span>
        </div>
        <div className="flex-1" />
        {perf.coldStartMs != null && perf.coldStartMs < 2000 && (
          <span className="px-3 text-muted-foreground/50" title="Cold start (P11.4)">
            boot {perf.coldStartMs}ms
          </span>
        )}
        {preview ? (
          <span className="flex items-center gap-1.5 px-3 text-muted-foreground/70">
            <AlertTriangle className="h-2.5 w-2.5 text-amber-500" />
            Plain-browser preview — not connected to the shell
          </span>
        ) : (
          <span className="flex items-center gap-1.5 px-3 text-muted-foreground/70">
            <ShieldCheck className={cn('h-2.5 w-2.5', runtime.status === 'live' ? 'text-emerald-400' : 'text-amber-400')} />
            {runtime.status === 'live' ? 'Privacy depends on selected provider' : 'Privacy status unavailable'}
          </span>
        )}
        <CompanionChip />
        <span className="pr-3 text-muted-foreground/40">EveryAIOS v3.57</span>
      </footer>
    )
  }

  return (
    <footer className="shrink-0 h-6 border-t border-border bg-sidebar/80 backdrop-blur-xl flex items-center text-[10.5px] font-mono no-select">
      {/* Left cluster — agent health monitor */}
      <div className="flex items-center gap-1.5 px-2 border-r border-border/60 h-full">
        <span className={cn(
          'h-1.5 w-1.5 rounded-full',
          agentPaused || activePaused ? 'bg-yellow-400' : 'bg-orange-500 live-dot'
        )} />
        <span className={cn(
          'text-muted-foreground',
          agentPaused || activePaused ? '' : 'text-orange-400'
        )}>
          {agentPaused || activePaused ? 'paused' : 'live'}
        </span>
        {perf.lcpMs != null && perf.ttiMs != null && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-muted-foreground/50" title="P11.4 — LCP / TTI">
                {perf.lcpMs}ms · {perf.ttiMs}ms
              </span>
            </TooltipTrigger>
            <TooltipContent>LCP (target &lt;1s) · TTI (target &lt;2s)</TooltipContent>
          </Tooltip>
        )}
        {monitorBadge.count > 0 && (
          <button
            type="button"
            onClick={() => clearMonitorBadge()}
            className="ml-1 inline-flex items-center gap-0.5 rounded-full border border-orange-500/40 bg-orange-500/15 px-1.5 py-0 text-[9px] text-orange-200"
            title={monitorBadge.last ?? 'Monitor'}
          >
            <Bell className="h-2.5 w-2.5" />
            {monitorBadge.count}
            {monitorBadge.stopped ? ' · stopped' : ''}
          </button>
        )}
        <span className="text-muted-foreground/40">·</span>
        <span className="text-muted-foreground/80">
          {active?.status === 'action-required' ? 'awaiting approval' : active?.status === 'running' ? 'regenerating chart' : active ? 'idle' : 'no active work'}
        </span>
        {/* Agent runtime health indicator */}          {agent && (

          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1.5 cursor-default">
                <span className="text-muted-foreground/30">│</span>
                <span className={cn('h-3.5 w-3.5 rounded text-[6px] font-bold flex items-center justify-center', agent.accent)}>{agent.mark}</span>
                <HealthIcon className={cn('h-2.5 w-2.5', healthCol)} />
                <span className={cn('text-[9.5px]', healthCol)}>
                  {healthLatency ?? '—'}ms
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
                <div>Status: unavailable until the selected runtime is probed</div>
                <div>Tasks: — · Error rate: —</div>
                <div>Uptime: —</div>
              </div>
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* Center — stats (devMode only) */}
      <div className="flex items-center gap-0 flex-1 overflow-x-auto scroll-thin">
        {stats.map((stat, i) => {
          const Icon = stat.icon
          const body = (
            <div className={cn(
              'flex items-center gap-1.5 px-2 h-full whitespace-nowrap',
              i < stats.length - 1 && 'border-r border-border/40',
              stat.onClick && 'cursor-pointer hover:bg-accent/50 rounded transition-colors'
            )}>
              <Icon className={cn('h-2.5 w-2.5 text-muted-foreground/70')} />
              <span className="text-muted-foreground/60">{stat.label}</span>
              <span className={cn('text-foreground/80', stat.color)}>
                {stat.value}
              </span>
            </div>
          )
          return (
            <Tooltip key={stat.label}>
              <TooltipTrigger asChild>
                {stat.onClick ? (
                  <button type="button" onClick={stat.onClick} aria-label={`Open ${stat.label} surface`} className="h-full">
                    {body}
                  </button>
                ) : body}
              </TooltipTrigger>
              <TooltipContent side="top" className="font-mono text-[11px]">
                {stat.tooltip}
              </TooltipContent>
            </Tooltip>
          )
        })}
      </div>

      {/* Right cluster — guard + version */}
      <div className="flex items-center gap-2 px-2 border-l border-border/60 h-full">
        <div className={cn('flex items-center gap-1', runtime.status === 'live' ? 'text-emerald-400' : 'text-amber-300')}>
          <ShieldCheck className="h-2.5 w-2.5" />
          <span>guard · {runtime.status === 'live' ? 'available' : 'unknown'}</span>
        </div>
        <span className="text-muted-foreground/40">·</span>
        <span className="text-muted-foreground/70">vault · {runtime.status === 'vault-locked' ? 'locked' : runtime.status === 'vault-setup' ? 'setup required' : '—'}</span>
        <span className="text-muted-foreground/40">·</span>
        <span className="text-muted-foreground/70">audit · {runtime.status === 'live' ? 'available' : '—'}</span>
        <span className="text-muted-foreground/40">·</span>
        <span className="text-muted-foreground/50">EveryAIOS v3.57</span>
      </div>
    </footer>
  )
}
