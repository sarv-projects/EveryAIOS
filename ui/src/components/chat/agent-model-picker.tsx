'use client'

import { useEffect, useState } from 'react'
import { Check, ChevronDown, Cpu, Download, Gauge, KeyRound, Loader2, RotateCw, Route, Sparkles, Zap } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useAppStore } from '@/lib/store'
import {
  AGENTS,
  formatContext,
  formatPrice,
  getModelsForAgent,
  CAPABILITY_LABELS,
  type AgentRuntime,
} from '@/lib/agents'
import { cn } from '@/lib/utils'
import { ensureLocal, listLocalModels, type LocalModelRow } from '@/lib/local-models'

function StatusDot({ status }: { status: AgentRuntime['status'] }) {
  const tone =
    status === 'installed'
      ? 'bg-emerald-400'
      : status === 'updating'
        ? 'bg-orange-400'
        : status === 'available'
          ? 'bg-zinc-500'
          : 'bg-zinc-700'
  return <span className={cn('inline-block h-1.5 w-1.5 rounded-full', tone)} />
}

function AgentLogo({ agent, size = 'md' }: { agent: AgentRuntime; size?: 'sm' | 'md' }) {
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center rounded font-mono font-bold',
        size === 'sm' ? 'h-5 w-5 text-[9px]' : 'h-6 w-6 text-[10px]',
        agent.accent,
      )}
    >
      {agent.mark}
    </span>
  )
}

interface Props {
  /** When set, hides the popover trigger chevron (used in tight rows) */
  compact?: boolean
}

export default function AgentModelPicker({ compact }: Props) {
  const [open, setOpen] = useState(false)
  const selectedAgentId = useAppStore((s) => s.selectedAgentId)
  const selectedModelId = useAppStore((s) => s.selectedModelId)
  const setSelectedAgent = useAppStore((s) => s.setSelectedAgent)
  const setSelectedModel = useAppStore((s) => s.setSelectedModel)
  const autoRoute = useAppStore((s) => s.autoRoute)
  const setAutoRoute = useAppStore((s) => s.setAutoRoute)
  const setCenterScreen = useAppStore((s) => s.setCenterScreen)
  const notify = useAppStore((s) => s.notify)

  const liveAgents = useAppStore((s) => s.liveAgents)
  const catalog = liveAgents.length > 0 ? liveAgents : AGENTS
  const [installing, setInstalling] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [connected, setConnected] = useState<string | null>(null)
  const [localRows, setLocalRows] = useState<LocalModelRow[]>([])
  const setLocalRuntime = useAppStore((s) => s.setLocalRuntime)
  const [auth, setAuth] = useState<{
    handle: string
    methods: { id: string; name: string; type?: string; description?: string }[]
    waitingUrl?: string
  } | null>(null)

  const agent = catalog.find((a) => a.id === selectedAgentId) ?? catalog[0]
  const activeFolder = useAppStore(
    (s) => s.sessions.find((x) => x.id === s.activeSessionId)?.folder,
  )

  // F8 — plan-before-touch install: request (Guard-2 ticket or auto-allow),
  // then commit. The approved card shows in the transcript via the bridge.
  const installAgent = async (agentId: string) => {
    setInstalling(true)
    try {
      const { acpInstallRequest, acpInstallCommit } = await import('@/lib/acp')
      const req = await acpInstallRequest(agentId)
      const cmd = (req.exactCommand ?? []).join(' ')
      if (req.consentRequired && cmd) {
        const ok = window.confirm(
          `SEP-1024 exact-command consent\n\nInstall ${agentId}?\n\n${cmd}${req.preferNative ? '\n\nPrefer verified native artifact.' : ''}`,
        )
        if (!ok) {
          notify('Install cancelled')
          return
        }
      }
      if (req.action === 'allow') {
        // Auto-allowed still consumes its pre-approved single-use ticket.
        await acpInstallCommit(agentId, req.ticketId)
        notify(`${agent?.name} installed — pick it and send`)
        setOpen(false)
      } else {
        notify(`Approval needed — Guard-2 card #${req.ticketId.slice(0, 8)} is in the chat`)
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Install failed')
    } finally {
      setInstalling(false)
    }
  }

  // J17 — connect + auth: spawn the agent over ACP; if it demands sign-in,
  // surface its authMethods (url-type opens the system browser, then retry).
  const connectAgent = async (agentId: string) => {
    setConnecting(true)
    setAuth(null)
    try {
      const { acpLaunch } = await import('@/lib/acp')
      const info = await acpLaunch(agentId, activeFolder ?? '~')
      if (!info.authRequired || info.authMethods.length === 0) {
        setConnected(info.handle)
        notify(`${agent?.name} connected (${info.handle.slice(0, 8)}…)`)
        return
      }
      setAuth({ handle: info.handle, methods: info.authMethods })
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to launch agent')
    } finally {
      setConnecting(false)
    }
  }

  const signIn = async (methodId: string) => {
    if (!auth) return
    const { acpAuthenticate } = await import('@/lib/acp')
    try {
      const res = await acpAuthenticate(auth.handle, methodId)
      if (res.ok || res.sessionId) {
        setConnected(auth.handle)
        setAuth(null)
        notify('Signed in — the agent is ready')
      } else if (res.pending && res.url) {
        setAuth({ ...auth, waitingUrl: res.url })
        window.open(res.url, '_blank')
        notify('Opened the sign-in page — approve there, then retry')
      } else if (res.pending) {
        setAuth({ ...auth, waitingUrl: undefined })
        notify('Waiting for the agent-side login to complete…')
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Sign-in failed')
    }
  }
  useEffect(() => {
    if (!open) return
    void listLocalModels()
      .then((r) => setLocalRows(r.models ?? []))
      .catch(() => setLocalRows([]))
  }, [open])

  const model = getModelsForAgent(selectedAgentId).find((m) => m.id === selectedModelId)
  const models = getModelsForAgent(selectedAgentId)

  const agentList = catalog

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'group flex items-center gap-1.5 rounded-md border bg-background/40 px-1.5 py-0.5 font-mono text-[10px] transition-all duration-200 hover:border-orange-500/40 hover:bg-orange-500/5',
          open && 'border-orange-500/60 bg-orange-500/10',
          autoRoute && 'shadow-[0_0_6px_rgba(249,115,22,0.15)] glow-pulse',
        )}
      >
        <span key={selectedAgentId} className="agent-switch-pulse inline-flex">
          <AgentLogo agent={agent} size="sm" />
        </span>
        <span className="flex items-baseline gap-1">
          <span className="text-foreground">{agent.name}</span>
          <span className="text-muted-foreground/40">·</span>
          <span className="text-orange-300">{model?.label ?? '—'}</span>
        </span>
        {autoRoute && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="ml-0.5 flex items-center gap-0.5 rounded border border-orange-500/30 bg-orange-500/10 px-1 text-[8px] text-orange-300">
                <Route className="h-2 w-2" />
                auto
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-[10px]">
              Auto-route by task — best runtime picked per turn
            </TooltipContent>
          </Tooltip>
        )}
        <ChevronDown
          className={cn('h-3 w-3 text-muted-foreground transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close picker"
            className="fixed inset-0 z-20 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="scale-in absolute bottom-full left-0 z-30 mb-1.5 w-[min(680px,calc(100vw-1rem))] overflow-hidden rounded-lg border border-border bg-popover shadow-2xl">
            <div className="flex items-center justify-between border-b border-border bg-zinc-900/60 px-3 py-1.5">
              <div className="flex items-center gap-1.5">
                <Cpu className="h-3 w-3 text-orange-400" />
                <span className="text-[11px] font-semibold text-foreground">
                  {autoRoute ? 'Auto · agent runtime & model' : 'Agent runtime & model'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  setCenterScreen('settings')
                }}
                className="text-[10px] text-muted-foreground underline-offset-2 hover:text-orange-300 hover:underline"
              >
                Manage in settings
              </button>
            </div>

            <div className="grid grid-cols-[minmax(0,260px)_1fr]">
              {/* Agent column */}
              <div className="scroll-thin max-h-[360px] overflow-y-auto border-r border-border p-1.5">
                <div className="px-1 pb-1 font-mono text-[9px] uppercase tracking-wider text-muted-foreground/70">
                  Runtimes
                </div>
                {agentList.map((a) => {
                  const isActive = a.id === selectedAgentId
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => setSelectedAgent(a.id)}
                      className={cn(
                        'flex w-full items-start gap-2 rounded-md border px-2 py-1.5 text-left transition-colors',
                        isActive
                          ? 'border-orange-500/60 bg-orange-500/10'
                          : 'border-transparent hover:border-border hover:bg-accent/40',
                      )}
                    >
                      <AgentLogo agent={a} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className={cn('text-[11px] font-medium', isActive ? 'text-orange-200' : 'text-foreground')}>
                            {a.name}
                          </span>
                          <StatusDot status={a.status} />
                          {a.id === 'everyaios-native' && (
                            <Badge className="bg-orange-500/20 px-1 text-[8px] text-orange-300">orchestrator</Badge>
                          )}
                        </div>
                        <div className="truncate font-mono text-[9px] text-muted-foreground">
                          {a.vendor} · v{a.version ?? '—'}
                        </div>
                        <div className="truncate text-[10px] text-muted-foreground/80">{a.tagline}</div>
                      </div>
                      {isActive && <Check className="mt-1 h-3 w-3 shrink-0 text-orange-400" />}
                    </button>
                  )
                })}
              </div>

              {/* Model column */}
              <div className="scroll-thin max-h-[360px] overflow-y-auto p-1.5">
                <div className="mb-1 flex items-center justify-between px-1">
                  <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground/70">
                    Models for {agent.name}
                  </div>
                  <div className="font-mono text-[9px] text-muted-foreground/60">
                    {models.length} available
                  </div>
                </div>

                {/* Agent capabilities strip */}
                <div className="mb-2 flex flex-wrap gap-1 px-1">
                  {agent.capabilities.slice(0, 6).map((c) => (
                    <Badge
                      key={c}
                      variant="secondary"
                      className="bg-background/60 text-[8px] font-normal text-muted-foreground"
                    >
                      {CAPABILITY_LABELS[c]}
                    </Badge>
                  ))}
                </div>

                <div className="space-y-1">
                  {models.map((m) => {
                    const isActive = m.id === selectedModelId
                    const disabled = !m.available
                    return (
                      <button
                        key={m.id}
                        type="button"
                        disabled={disabled}
                        onClick={() => {
                          setSelectedModel(m.id)
                          setLocalRuntime(undefined)
                        }}
                        className={cn(
                          'flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40',
                          isActive
                            ? 'border-orange-500/60 bg-orange-500/10'
                            : 'border-transparent hover:border-border hover:bg-accent/40',
                        )}
                      >
                        <span className={cn('flex h-6 w-6 items-center justify-center rounded text-[9px] font-bold', m.tone)}>
                          {m.label.charAt(0)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className={cn('text-[11px] font-medium', isActive ? 'text-orange-200' : 'text-foreground')}>
                              {m.label}
                            </span>
                            {m.recommendedFor && (
                              <span className="truncate font-mono text-[9px] text-muted-foreground/60">
                                · {m.recommendedFor}
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1 font-mono text-[9px] text-muted-foreground">
                            <span className="flex items-center gap-0.5">
                              <Gauge className="h-2.5 w-2.5" />
                              {formatContext(m.context)}
                            </span>
                            <span className="text-muted-foreground/30">|</span>
                            <span className="flex items-center gap-0.5">
                              <Zap className="h-2.5 w-2.5 text-orange-400" />
                              {formatPrice(m.inputPrice)}/in · {formatPrice(m.outputPrice)}/out
                            </span>
                            {!m.available && (
                              <Badge variant="secondary" className="ml-1 bg-zinc-700 text-[7px] text-zinc-300">
                                gated
                              </Badge>
                            )}
                          </div>
                        </div>
                        {isActive && <Check className="h-3.5 w-3.5 shrink-0 text-orange-400" />}
                      </button>
                    )
                  })}
                </div>

                <div className="mt-2 border-t border-border/60 pt-2">
                    <div className="mb-1 flex items-center justify-between px-1">
                      <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground/70">
                        Local
                      </div>
                      <button
                        type="button"
                        className="font-mono text-[9px] text-orange-300 underline-offset-2 hover:underline"
                        onClick={() => {
                          setOpen(false)
                          useAppStore.getState().setSettingsSection('local')
                          setCenterScreen('settings')
                        }}
                      >
                        Discover · download · hardware
                      </button>
                    </div>
                {localRows.length > 0 && (
                  <>
                    <div className="space-y-1">
                      {localRows.map((row) => {
                        const isActive = selectedModelId === row.name && useAppStore.getState().localRuntime === row.runtime
                        return (
                          <button
                            key={`${row.runtime}:${row.name}`}
                            type="button"
                            onClick={() => {
                              setSelectedAgent('everyaios-native')
                              setSelectedModel(row.name)
                              setLocalRuntime(row.runtime, row.contextWindow)
                              void ensureLocal(row.runtime, row.name).catch((e) =>
                                notify(e instanceof Error ? e.message : 'Local load failed'),
                              )
                            }}
                            className={cn(
                              'flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left',
                              isActive
                                ? 'border-orange-500/60 bg-orange-500/10'
                                : 'border-transparent hover:border-border hover:bg-accent/40',
                              !row.fits && 'opacity-60',
                            )}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[11px] font-medium text-foreground">{row.name}</span>
                                <Badge
                                  className={cn(
                                    'px-1 text-[8px]',
                                    row.fits ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300',
                                  )}
                                >
                                  {row.fits ? 'fits' : 'too big'}
                                </Badge>
                                {row.warnCtx && (
                                  <Badge className="bg-amber-500/20 px-1 text-[8px] text-amber-300">
                                    &lt;15K ctx
                                  </Badge>
                                )}
                              </div>
                              <div className="font-mono text-[9px] text-muted-foreground">
                                {row.runtime} · {(row.sizeBytes / 1e9).toFixed(1)}GB · {formatContext(row.contextWindow)} · score {row.score.toFixed(2)}
                              </div>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </>
                )}
                    {localRows.length === 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setOpen(false)
                          useAppStore.getState().setSettingsSection('local')
                          setCenterScreen('settings')
                        }}
                        className="w-full rounded-md border border-dashed border-border/60 px-2 py-2 text-left font-mono text-[10px] text-muted-foreground hover:border-orange-500/40 hover:text-orange-300"
                      >
                        No local models yet — open Discover (search, downloads, quant, GPU offload).
                      </button>
                    )}
                </div>

                {/* Auto-route toggle */}
                <div className="mt-3 flex items-center justify-between rounded-md border border-border/60 bg-background/40 px-2 py-1.5">
                  <div className="flex items-center gap-1.5">
                    <Route className="h-3 w-3 text-orange-400" />
                    <div>
                      <div className="text-[10px] font-medium text-foreground">Auto-route by task</div>
                      <div className="text-[9px] text-muted-foreground">
                        Override per turn — code→Claude Code, research→Grok, long-context→Gemini
                      </div>
                    </div>
                  </div>
                  <Switch checked={autoRoute} onCheckedChange={setAutoRoute} className="scale-75" />
                </div>

                <div className="mt-1.5 flex items-center gap-1 px-1 font-mono text-[9px] text-muted-foreground/60">
                  <Sparkles className="h-2.5 w-2.5" />
                  Selected: {agent.name} · {model?.label ?? '—'}
                </div>

                {/* Install + connect (F8/J17) — one click, then use */}
                <div className="mt-2 space-y-1.5 border-t border-border/60 pt-2">
                  {agent.status === 'installed' || agent.id === 'everyaios-native' ? (
                    <div className="flex items-center justify-between px-1">
                      <span className="flex items-center gap-1 font-mono text-[9px] text-emerald-400">
                        <Check className="h-2.5 w-2.5" />
                        installed
                        {agent.version ? ` · v${agent.version}` : ''}
                      </span>
                      {agent.id !== 'everyaios-native' && (
                        <span className="font-mono text-[9px] text-muted-foreground/60">
                          {agent.vendor}
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <Button
                        size="sm"
                        disabled={installing}
                        className="h-6 gap-1 bg-orange-500 px-2.5 text-[10px] text-white hover:bg-orange-600"
                        onClick={() => installAgent(agent.id)}
                      >
                        {installing ? (
                          <>
                            <Loader2 className="h-3 w-3 animate-spin" />
                            installing…
                          </>
                        ) : (
                          <>
                            <Download className="h-3 w-3" />
                            Install
                          </>
                        )}
                      </Button>
                      <span className="font-mono text-[9px] text-muted-foreground/60">
                        {agent.note ?? 'Fetch from the ACP registry'}
                      </span>
                    </div>
                  )}

                  {agent.id !== 'everyaios-native' && (
                      connected ? (
                        <div className="flex items-center gap-1.5 px-1">
                          <span className="flex items-center gap-1 font-mono text-[9px] text-emerald-400">
                            <Check className="h-2.5 w-2.5" />
                            connected
                          </span>
                          <span className="font-mono text-[9px] text-muted-foreground/50">
                            {connected.slice(0, 10)}…
                          </span>
                        </div>
                      ) : auth ? (
                        <div className="space-y-1 rounded-md border border-orange-500/30 bg-orange-500/5 p-2">
                          <div className="flex items-center gap-1 font-mono text-[9px] text-orange-300">
                            <KeyRound className="h-2.5 w-2.5" />
                            {auth.waitingUrl ? 'Waiting for sign-in…' : `${agent.name} needs sign-in`}
                          </div>
                          {auth.methods.map((m) => (
                            <div key={m.id} className="flex items-center gap-1.5">
                              <Button
                                size="sm"
                                className="h-5 gap-1 px-2 text-[9px]"
                                onClick={() => signIn(m.id)}
                              >
                                Sign in with {m.name}
                              </Button>
                              {m.description && (
                                <span className="truncate font-mono text-[8px] text-muted-foreground/60">
                                  {m.description}
                                </span>
                              )}
                            </div>
                          ))}
                          {auth.waitingUrl && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-5 gap-1 px-2 text-[9px]"
                              onClick={() => signIn(auth.methods[0]?.id ?? '')}
                            >
                              <RotateCw className="h-2.5 w-2.5" />
                              I finished sign-in — retry
                            </Button>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={connecting}
                            className="h-6 gap-1 px-2.5 text-[10px]"
                            onClick={() => connectAgent(agent.id)}
                          >
                            {connecting ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <KeyRound className="h-3 w-3 text-orange-400" />
                            )}
                            {connecting ? 'connecting…' : 'Connect / sign in'}
                          </Button>
                          <span className="font-mono text-[9px] text-muted-foreground/50">
                            subscription · api key · local
                          </span>
                        </div>
                      )
                    )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
