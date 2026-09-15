'use client'

import { useEffect, useState } from 'react'
import {
  Boxes,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Cpu,
  Download,
  ExternalLink,
  Gauge,
  KeyRound,
  Layers,
  Loader2,
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
  getModelsForAgentLive,
  isNativeRuntime,
  isRuntimeUsable,
  modelsForUsableRuntimes,
  type AgentRuntime,
  type TaskKind,
} from '@/lib/agents'
import { acpIdFor, acpInstallCommit, acpInstallRequest } from '@/lib/acp'
import {
  agentBackendClear,
  agentBackendGet,
  agentBackendProbe,
  agentBackendProviders,
  agentBackendSet,
  channelLabel,
  type AgentBackendState,
  type AgentProviderRow,
  type ProviderProbeResult,
} from '@/lib/agent-backend'
import { refreshAgentCatalog } from '@/lib/bridge'
import { inTauri } from '@/lib/tauri'
import { cn } from '@/lib/utils'
import { Row, SectionShell } from './settings-shared'

function formatTokens(n: number): string {
  if (!n || n <= 0) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

// === P63 — per-agent model backend ==========================================

/**
 * The post-install control: point this agent at one of the user's own
 * providers.
 *
 * Nothing here writes the agent's config file. The choice is handed to the
 * shell, which injects the provider's env vars (and, when asked, the key from
 * the EveryAIOS vault) when the agent is spawned — so the override lasts one
 * child process and is undone by not injecting it. The panel therefore shows
 * the variable *names* a launch will carry, never values, and reports anything
 * the chosen agent has no variable for instead of silently dropping it.
 */
function AgentBackendPanel({ agentId }: { agentId: string }) {
  const notify = useAppStore((s) => s.notify)
  const [state, setState] = useState<AgentBackendState | null>(null)
  const [providers, setProviders] = useState<AgentProviderRow[]>([])
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [checks, setChecks] = useState<Record<string, ProviderProbeResult>>({})

  const load = async () => {
    try {
      const [s, p] = await Promise.all([
        agentBackendGet(agentId),
        agentBackendProviders(agentId),
      ])
      setState(s)
      // Providers already holding a vault key first — those are the ones the
      // user can actually switch on in one click.
      setProviders([...p].sort((a, b) => Number(b.keyInVault) - Number(a.keyInVault)))
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not read this agent\u2019s backend', 'error')
    }
  }

  useEffect(() => {
    void load()
    // Re-read when the agent id changes (the card is reused across rows).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId])

  const choose = async (row: AgentProviderRow) => {
    setBusy(true)
    try {
      const next = await agentBackendSet({
        agentId,
        provider: row.id,
        useVaultKey: row.keyInVault,
      })
      setState(next)
      notify(
        row.keyInVault
          ? `${row.name} set — its key is injected from the EveryAIOS vault at launch`
          : `${row.name} set — add a key in Settings \u2192 Providers for it to work`,
      )
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not set the provider', 'error')
    } finally {
      setBusy(false)
    }
  }

  const clear = async () => {
    setBusy(true)
    try {
      setState(await agentBackendClear(agentId))
      notify(`${agentId} returns to its own configuration`)
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not clear the binding', 'error')
    } finally {
      setBusy(false)
    }
  }

  const test = async (row: AgentProviderRow) => {
    try {
      const r = await agentBackendProbe(row.id)
      setChecks((c) => ({ ...c, [row.id]: r }))
      notify(
        r.ok
          ? `${row.name}: reachable (${r.models} models)`
          : `${row.name}: not reachable \u2014 ${r.message}`,
        r.ok ? 'default' : 'error',
      )
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Probe failed', 'error')
    }
  }

  if (!state) {
    return (
      <div className="mt-2 flex items-center gap-2 rounded-md border border-border/40 bg-background/30 px-2 py-2 text-[10px] text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> reading this agent’s backend…
      </div>
    )
  }

  const q = query.trim().toLowerCase()
  const visible = (q
    ? providers.filter(
        (p) => p.id.toLowerCase().includes(q) || p.name.toLowerCase().includes(q),
      )
    : providers
  ).slice(0, 8)

  return (
    <div
      className="mt-2 rounded-md border border-border/50 bg-background/40 p-2"
      data-testid={`agent-backend-${agentId}`}
    >
      <div className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
        <KeyRound className="h-2.5 w-2.5" />
        {channelLabel(state.channel)}
        {state.configFile && (
          <span className="ml-auto truncate normal-case text-muted-foreground/70">
            {state.configFile}
          </span>
        )}
      </div>

      {state.injectable ? (
        <>
          <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
            {state.note}
          </p>

          {state.configured && (
            <div className="mt-2 rounded border border-emerald-500/20 bg-emerald-500/5 px-2 py-1.5 text-[10px] text-emerald-100/90">
              <div className="flex items-center gap-1.5">
                <Check className="h-2.5 w-2.5 text-emerald-300" />
                <span className="font-mono">
                  {state.configured.provider}
                  {state.configured.model ? ` \u00b7 ${state.configured.model}` : ''}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto h-5 px-1 text-[9px]"
                  disabled={busy}
                  onClick={() => void clear()}
                >
                  <X className="h-2.5 w-2.5" /> clear
                </Button>
              </div>
              <div className="mt-0.5 text-emerald-100/70">
                {state.injectedEnv.length > 0
                  ? `Injected at launch: ${state.injectedEnv.join(', ')}`
                  : 'No variable can be injected for this choice.'}
              </div>
              {state.keyPresent ? (
                <div className="text-emerald-100/70">
                  Key: from the EveryAIOS vault (read in Rust at spawn)
                </div>
              ) : state.configured ? (
                <div className="text-amber-200/80">
                  No vault key for this provider \u2014 the agent will use whatever it has.
                </div>
              ) : null}
              {state.unexpressed.length > 0 && (
                <div className="text-amber-200/80">
                  Not expressible by env for this agent: {state.unexpressed.join(', ')}
                </div>
              )}
              <div className="mt-0.5 text-emerald-100/50">
                Nothing is written to this agent’s own config file.
              </div>
            </div>
          )}

          {state.refusal && (
            <div className="mt-2 text-[10px] text-amber-200/80">{state.refusal}</div>
          )}

          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search providers…"
            aria-label={`Provider for ${agentId}`}
            className="mt-2 h-7 w-full rounded border border-border bg-background px-2 font-mono text-[10px] text-foreground placeholder:text-muted-foreground/60"
          />

          <div className="mt-1.5 space-y-1">
            {visible.length === 0 && (
              <div className="px-1 text-[10px] text-muted-foreground">
                No provider matches “{query}”.
              </div>
            )}
            {visible.map((p) => {
              const check = checks[p.id]
              const active = state.configured?.provider === p.id
              return (
                <div
                  key={p.id}
                  className={cn(
                    'flex items-center gap-1.5 rounded border px-1.5 py-1 text-[10px]',
                    active
                      ? 'border-emerald-500/40 bg-emerald-500/5'
                      : 'border-border/40 bg-background/30',
                  )}
                >
                  <span className="truncate text-foreground">{p.name}</span>
                  {p.env && (
                    <span className="truncate font-mono text-[8px] text-muted-foreground/70">
                      {p.env}
                    </span>
                  )}
                  {p.keyInVault && (
                    <Badge className="bg-emerald-500/15 text-[8px] text-emerald-300">
                      vault key
                    </Badge>
                  )}
                  {p.local && (
                    <Badge className="bg-blue-500/15 text-[8px] text-blue-300">local</Badge>
                  )}
                  {check && (
                    <Badge
                      className={cn(
                        'text-[8px]',
                        check.ok
                          ? 'bg-emerald-500/15 text-emerald-300'
                          : 'bg-rose-500/15 text-rose-300',
                      )}
                    >
                      {check.ok ? `healthy \u00b7 ${check.models}` : 'unreachable'}
                    </Badge>
                  )}
                  {!check && p.verifiedAt && (
                    <Badge className="bg-emerald-500/10 text-[8px] text-emerald-300/80">
                      verified
                    </Badge>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto h-5 px-1 text-[9px]"
                    onClick={() => void test(p)}
                  >
                    <Gauge className="h-2.5 w-2.5" /> test
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-5 px-1.5 text-[9px]"
                    disabled={busy || active}
                    onClick={() => void choose(p)}
                  >
                    {active ? 'in use' : 'use'}
                  </Button>
                </div>
              )
            })}
          </div>
        </>
      ) : (
        <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
          {state.refusal ?? state.note}
          {state.channel === 'config_file' && state.configFile
            ? ` (${state.configFile})`
            : ''}
        </p>
      )}
    </div>
  )
}

// === Agent card ===============================================================

function StatusBadge({ status }: { status: AgentRuntime['status'] }) {
  const tone =
    status === 'installed'
      ? 'bg-emerald-500/15 text-emerald-300'
      : status === 'discovered'
        ? 'bg-sky-500/15 text-sky-300'
        : status === 'updating'
          ? 'bg-blue-500/15 text-blue-300'
          : status === 'disabled'
            ? 'bg-rose-500/15 text-rose-300'
            : 'bg-zinc-500/15 text-zinc-400'
  // P55.4/P66 — catalog membership is not occupancy. `discovered` means a
  // verified location exists; it does not necessarily mean the current
  // adapter can launch it (for example, WSL before the WSL adapter lands).
  const label = status === 'available' ? 'not installed' : status
  return (
    <Badge className={cn('text-[9px] capitalize', tone)}>
      <CircleDot className="h-2.5 w-2.5" />
      {label}
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

function AgentCard({
  agent,
  catalogExpanded,
  onToggleCatalog,
}: {
  agent: AgentRuntime
  /** Native only — the model catalog is a disclosure on the Native card. */
  catalogExpanded?: boolean
  onToggleCatalog?: () => void
}) {
  const selectedAgentId = useAppStore((s) => s.selectedAgentId)
  const setSelectedAgent = useAppStore((s) => s.setSelectedAgent)
  const notify = useAppStore((s) => s.notify)
  const isSelected = selectedAgentId === agent.id
  // Live-gated: stub model counts for uninstalled runtimes are never shown —
  // the list loads live only after install.
  const liveAgents = useAppStore((s) => s.liveAgents)
  const liveSource = liveAgents.length > 0 ? liveAgents : undefined
  const models = getModelsForAgentLive(agent.id, liveSource)
  const usable = isRuntimeUsable(
    liveSource?.find((a) => a.id === agent.id) ?? agent,
  )
  // P60 — ownership. Native owns EveryAIOS's model catalog; an external CLI
  // owns its own and exposes it (if at all) over ACP config options.
  const native = isNativeRuntime(agent.id)
  const acpOptions = useAppStore((s) => s.acpConfigOptions[agent.id])
  const [busyInstall, setBusyInstall] = useState(false)
  const [busyScan, setBusyScan] = useState(false)
  // P63 — the per-agent model-backend control is a disclosure, not a permanent
  // control on all 46 rows.
  const [configOpen, setConfigOpen] = useState(false)

  // Re-run discovery (ACP registry + install status + PATH probe) so the
  // row reflects what is actually on this machine right now.
  const rescan = async () => {
    setBusyScan(true)
    try {
      await refreshAgentCatalog()
      const live = useAppStore.getState().liveAgents
      const installed = live.filter((a) => a.status === 'installed').length
      notify(`Discovery re-scan: ${live.length} runtimes, ${installed} installed`)
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Discovery re-scan failed', 'error')
    } finally {
      setBusyScan(false)
    }
  }

  // F8 — real plan-before-touch install (Guard-2 ticket), same as the
  // composer picker. Registry ids, not catalog ids (claude-code → claude).
  const installAgent = async () => {
    setBusyInstall(true)
    try {
      const rid = acpIdFor(agent.id)
      const req = await acpInstallRequest(rid)
      const cmd = (req.exactCommand ?? []).join(' ')
      if (req.consentRequired && cmd) {
        const ok = window.confirm(
          `SEP-1024 exact-command consent\n\nInstall ${agent.name}?\n\n${cmd}${req.preferNative ? '\n\nPrefer verified native artifact.' : ''}`,
        )
        if (!ok) {
          notify('Install cancelled')
          return
        }
      }
      if (req.action === 'allow') {
        await acpInstallCommit(rid, req.ticketId)
        notify(`${agent.name} installed — runtimes re-scanned`)
        await rescan()
      } else {
        notify(`Approval needed — Guard-2 card #${req.ticketId.slice(0, 8)} is in the chat`)
      }
    } catch (e) {
      notify(e instanceof Error ? e.message : `Installing ${agent.name} failed`, 'error')
    } finally {
      setBusyInstall(false)
    }
  }

  return (
    <div
      className={cn(
        'rounded-lg border bg-background/40 p-3 transition-all hover-lift border-glow',
        isSelected ? 'border-sky-500/60 bg-sky-500/5 gradient-border' : 'border-border/60 hover:border-border',
      )}
    >
      <div className="flex items-start gap-2.5">
        <AgentLogo agent={agent} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[13px] font-semibold text-foreground">{agent.name}</span>
            <StatusBadge status={agent.status} />
            {isSelected && (
              <Badge className="bg-sky-500/20 text-[9px] text-sky-300">active</Badge>
            )}
          </div>
          <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
            {agent.vendor} · v{agent.version ?? '—'} · {agent.path ?? 'no path'}
          </div>
          {agent.location && (
            <div className="mt-0.5 flex flex-wrap gap-x-2 text-[9px] text-muted-foreground/70">
              <span>source: {agent.location.source.replaceAll('_', ' ')}</span>
              <span>location: {agent.location.kind}</span>
              {agent.location.kind === 'wsl' && <span>distro: {agent.location.distro}</span>}
            </div>
          )}
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
        <span>
          {native
            ? `${models.length} models`
            : usable
              ? acpOptions?.length
                ? `agent-owned · ${acpOptions.length} options`
                : 'own model config'
              : 'models on install'}
        </span>
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

      {configOpen && usable && !native && <AgentBackendPanel agentId={agent.id} />}

      <div className="mt-2.5 flex items-center gap-1">
        {usable || agent.id === 'everyaios-native' ? (
          <Button
            size="sm"
            variant={isSelected ? 'default' : 'outline'}
            className={cn(
              'h-7 px-2 text-[10px]',
              isSelected && 'bg-sky-500 text-black hover:bg-sky-400',
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
            disabled={busyInstall}
            onClick={() => void installAgent()}
          >
            {busyInstall ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
            {busyInstall ? 'installing…' : 'Install'}
          </Button>
        )}
        {onToggleCatalog && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-[10px]"
            aria-expanded={!!catalogExpanded}
            data-testid="native-catalog-toggle"
            onClick={onToggleCatalog}
          >
            {catalogExpanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            Model catalog ({models.length})
          </Button>
        )}
        {usable && !native && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-[10px]"
            aria-expanded={configOpen}
            data-testid={`agent-configure-${agent.id}`}
            onClick={() => setConfigOpen((v) => !v)}
          >
            {configOpen ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            Configure model
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-[10px]"
          disabled={busyScan}
          onClick={() => void rescan()}
        >
          <RefreshCw className={cn('h-3 w-3', busyScan && 'animate-spin')} />
          Re-scan
        </Button>
        {agent.path && agent.path.startsWith('internal://') !== true && (
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto h-7 max-w-[180px] px-2 text-[10px] text-muted-foreground"
            title="Copy the detected binary path"
            onClick={() => {
              void navigator.clipboard
                ?.writeText(agent.path ?? '')
                .then(() => notify(`Copied ${agent.path}`))
                .catch(() => notify(`Path: ${agent.path}`))
            }}
          >
            <ExternalLink className="h-3 w-3" />
            {agent.path}
          </Button>
        )}
      </div>
    </div>
  )
}

function AgentsTab() {
  const notify = useAppStore((s) => s.notify)
  const liveAgents = useAppStore((s) => s.liveAgents)
  const [busyDiscover, setBusyDiscover] = useState(false)
  // Live discovery (ACP registry + PATH probe) when the shell reported rows;
  // the shipped catalog otherwise. P55.4 — that fallback is a *candidate
  // list*, not occupancy: an empty live list in the desktop shell means
  // discovery has not reported yet, so the banner below says so instead of
  // letting the seed read as "these are on this machine".
  const catalog = liveAgents.length > 0 ? liveAgents : AGENTS
  const occupancyUnknown = inTauri() && liveAgents.length === 0
  // P60 — the Native model catalog is a disclosure on the EveryAIOS Native
  // card, not a peer Settings tab: Native is the only runtime that table
  // governs, so it lives with the runtime that owns it. Collapsed by default
  // so the runtimes surface stays the primary one.
  const [nativeOpen, setNativeOpen] = useState(false)
  const nativeRow = catalog.find((a) => isNativeRuntime(a.id))
  const otherRows = catalog.filter((a) => !isNativeRuntime(a.id))

  const discoverMore = async () => {
    setBusyDiscover(true)
    try {
      const { acpRegistryRefresh } = await import('@/lib/acp')
      const snap = await acpRegistryRefresh()
      await refreshAgentCatalog()
      const live = useAppStore.getState().liveAgents
      const installed = live.filter((a) => a.status === 'installed').length
      notify(
        snap.agentCount
          ? `ACP registry refreshed (${snap.agentCount} agents) — ${live.length} runtimes shown, ${installed} installed`
          : `Runtimes re-scanned — ${live.length} shown, ${installed} installed`,
      )
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Registry refresh failed (offline?)', 'error')
    } finally {
      setBusyDiscover(false)
    }
  }

  return (
    <SectionShell
      title="Agent runtimes"
      desc="The underlying coding-agent CLI / IDE plugin EveryAIOS can drive. Installed state is detected live — EveryAIOS-installed or auto-discovered on PATH. Each runtime ships its own model support."
      action={
        <Button
          size="sm"
          variant="outline"
          className="h-8"
          disabled={busyDiscover}
          onClick={() => void discoverMore()}
        >
          <Boxes className="h-3.5 w-3.5" />
          {busyDiscover ? 'Refreshing…' : 'Discover more'}
        </Button>
      }
    >
      {occupancyUnknown && (
        <div className="mb-3 rounded-md border border-dashed border-amber-500/40 bg-amber-500/5 px-3 py-2 text-[11px] leading-relaxed text-amber-200/90">
          Runtime inventory unavailable — the shell has not reported which agent CLIs are installed.
          The list below is the shipped catalog of installable runtimes, not occupancy; every
          external row reads <span className="font-mono">not installed</span> until discovery
          confirms it. Use <span className="text-amber-100">Discover more</span>.
        </div>
      )}
      {/* EveryAIOS Native first, full width, with its own disclosure: the
          built-in agent is the only runtime whose model surface EveryAIOS owns. */}
      {nativeRow && (
        <div>
          <AgentCard
            agent={nativeRow}
            catalogExpanded={nativeOpen}
            onToggleCatalog={() => setNativeOpen((o) => !o)}
          />
          {nativeOpen && (
            <div className="mt-2.5 rounded-lg border border-border/60 bg-background/25 p-3">
              <NativeModelCatalog />
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
        {otherRows.map((a) => (
          <AgentCard key={a.id} agent={a} />
        ))}
      </div>
    </SectionShell>
  )
}

// === EveryAIOS Native model catalog =========================================

function NativeModelCatalog() {
  const selectedModelId = useAppStore((s) => s.selectedModelId)
  const setSelectedModel = useAppStore((s) => s.setSelectedModel)
  const selectedAgentId = useAppStore((s) => s.selectedAgentId)
  const liveAgents = useAppStore((s) => s.liveAgents)
  const [compareOpen, setCompareOpen] = useState(false)
  const [compareIds, setCompareIds] = useState<string[]>([])

  // Only models reachable from installed runtimes are listed — uninstalled
  // runtimes contribute nothing (their lists load live after install).
  const liveSource = liveAgents.length > 0 ? liveAgents : AGENTS
  const visibleModels = modelsForUsableRuntimes(liveSource)
  const activeModels = getModelsForAgentLive(selectedAgentId, liveAgents.length > 0 ? liveAgents : undefined)

  const toggleCompare = (id: string) => {
    setCompareIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 3 ? [...prev, id] : prev
    )
  }

  return (
    <>
      {/* No SectionShell here: this renders inside the Native card's
          disclosure, whose trigger already names it. */}
      <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <h4 className="text-[12px] font-semibold text-foreground">
            EveryAIOS Native model catalog
          </h4>
          <p className="mt-0.5 max-w-2xl text-[11px] leading-relaxed text-muted-foreground">
            The model surface of the built-in EveryAIOS Native agent — the only runtime this
            table governs. External agents (Claude Code, OpenCode, Codex, …) own their own model,
            key, and routing configuration and expose theirs over ACP; the live models.dev catalog
            lives in Providers / BYOK and Local models. Pricing is per 1M tokens. Click to make it
            the active Native model.
          </p>
        </div>
        <div className="shrink-0 sm:ml-3">
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
        </div>
      </div>
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
            {visibleModels.length === 0 && (
              <tr>
                <td colSpan={8} className="px-2 py-4 text-center text-[11px] text-muted-foreground">
                  No installed runtime exposes models yet — install one from the
                  Runtimes tab first.
                </td>
              </tr>
            )}
            {visibleModels.map((m) => {
              const isActive = m.id === selectedModelId
              const supportedByActive = activeModels.some(
                (x) => x.id === m.id,
              )
              return (
                <tr
                  key={m.id}
                  className={cn(
                    'transition-colors',
                    isActive
                      ? 'bg-sky-500/10'
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
                          ? 'bg-sky-500 border-sky-500'
                          : 'border-border hover:border-sky-500/40'
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
                        <Badge className="bg-sky-500/20 text-[8px] text-sky-300">active</Badge>
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
                  <td className="px-2 py-1.5 text-right font-mono text-[10px] text-sky-300">
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
        <KeyRound className="h-4 w-4 text-sky-400" />
      </Row>

    {/* Model Comparison Dialog */}
    <Dialog open={compareOpen} onOpenChange={setCompareOpen}>
      <DialogContent className="max-w-2xl glass-panel">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <GitCompare className="h-4 w-4 text-sky-500" />
            Model Comparison
          </DialogTitle>
        </DialogHeader>
        {compareIds.length >= 2 && (
          <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${Math.min(compareIds.length, 3)}, 1fr)` }}>
            {compareIds.map((id) => {
              const m = visibleModels.find((x) => x.id === id) ?? MODELS.find((x) => x.id === id)
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
                      <span className="font-mono text-sky-300">{formatPrice(m.outputPrice)} / 1M</span>
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
                        <span className="text-sky-300 text-[10px]">{m.recommendedFor}</span>
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
  const liveAgents = useAppStore((s) => s.liveAgents)
  const streamStats = useAppStore((s) => s.streamStats)
  const liveBudget = useAppStore((s) => s.liveBudget)
  // Honest routing-table sources: live discovery first, static catalog
  // fallback (never a claim that a runtime is installed).
  const catalog = liveAgents.length > 0 ? liveAgents : AGENTS
  const installedCount = catalog.filter(
    (a) => a.status === 'installed' || a.status === 'updating',
  ).length

  return (
    <SectionShell
      title="Task → runtime routing"
      desc="Occupancy is the composer picker: Browse, Computer use, Office, and the right rail all run as the currently picked Chief. This table is not that path. Auto-route only affects model-tier (A7) inside the same Chief — it must not swap Claude/Codex/Grok per view."
      action={
        <div className="flex items-center gap-2 rounded-md border border-border/60 bg-background/40 px-2 py-1">
          <Route className="h-3 w-3 text-sky-400" />
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
              const agent = catalog.find((a) => a.id === routing[t]) ?? catalog[0]
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
                        {catalog.map(
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
            <Zap className="h-3 w-3 text-sky-400" />
            Tokens tracked
          </div>
          <div className="mt-1 font-mono text-lg text-foreground">
            {formatTokens(liveBudget?.tokens ?? 0)}
          </div>
          <div className="text-[9px] text-muted-foreground/70">live usage ledger</div>
        </div>
        <div className="rounded-md border border-border/60 bg-background/40 p-2">
          <div className="flex items-center gap-1.5 text-[10px] font-medium text-foreground">
            <Gauge className="h-3 w-3 text-emerald-400" />
            Active stream key
          </div>
          <div className="mt-1 truncate font-mono text-sm text-foreground">
            {streamStats.activeKey ?? '—'}
          </div>
          <div className="text-[9px] text-muted-foreground/70">per-turn stream stats</div>
        </div>
        <div className="rounded-md border border-border/60 bg-background/40 p-2">
          <div className="flex items-center gap-1.5 text-[10px] font-medium text-foreground">
            <Cpu className="h-3 w-3 text-sky-400" />
            Installed runtimes
          </div>
          <div className="mt-1 font-mono text-lg text-foreground">
            {installedCount} / {catalog.length}
          </div>
          <div className="text-[9px] text-muted-foreground/70">live discovery</div>
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
      title="Agent CLIs & Runtimes"
      desc="EveryAIOS Native is the built-in agent that owns EveryAIOS's providers, keys, and models. Everything else is an external agent CLI discovered from the ACP registry or PATH — it owns its own authentication and model configuration. Toggle auto-route to let EveryAIOS pick per task."
    >
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-8 bg-background/40">
          <TabsTrigger value="agents" className="text-[11px] data-[state=active]:bg-sky-500/15 data-[state=active]:text-sky-300">
            <Boxes className="mr-1 h-3 w-3" />
            Runtimes
          </TabsTrigger>
          <TabsTrigger value="routing" className="text-[11px] data-[state=active]:bg-sky-500/15 data-[state=active]:text-sky-300">
            <Route className="mr-1 h-3 w-3" />
            Routing
          </TabsTrigger>
        </TabsList>
        <TabsContent value="agents" className="mt-3">
          <AgentsTab />
        </TabsContent>
        <TabsContent value="routing" className="mt-3">
          <RoutingTab />
        </TabsContent>
      </Tabs>
    </SectionShell>
  )
}
