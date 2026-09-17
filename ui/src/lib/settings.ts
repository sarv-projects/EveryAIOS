// P65 — Settings Control Center client (ARCH/17 §17.12).
//
// Typed wrappers over the `settings_*` Tauri commands. These are the *unified*
// read models: each inventory row is assembled from the subsystem that owns it
// (catalog/vault, acp/agent-backend, mcp/oauth, scheduler, skill store), and
// every mutation goes through the one funnel that answers the §17.12.3 envelope
// `{ appliedLive, restartRequired, state, health, lastError? }`.
//
// Two rules this module keeps:
// - **Keys stay by reference.** `authRef` is an opaque vault handle
//   (`vault:oauth:<provider>:<id>`); no raw secret ever crosses this boundary.
// - **Preview invents nothing.** With no shell attached we return empty
//   inventories, so a panel renders its honest empty state instead of a
//   fabricated green row. There is no demo data here on purpose.

import { invoke } from './tauri'
import { bridgeCall } from './runtime'

// ───────────────────────────────────────────────────────────────────────────
// Canonical read models (§17.12.2)
// ───────────────────────────────────────────────────────────────────────────

export type SettingsKind = 'provider' | 'agent' | 'connection' | 'schedule' | 'extension'

export type SettingsState =
  | 'discovered'
  | 'installed'
  | 'configured'
  | 'connected'
  | 'disconnected'
  | 'degraded'
  | 'disabled'
  | 'unavailable'

export type SettingsHealth = 'ready' | 'permission_required' | 'missing' | 'failed' | 'unknown'

/** The shared row shape every Settings inventory reuses. */
export interface SettingsReadModel {
  id: string
  kind: SettingsKind
  state: SettingsState
  health: SettingsHealth
  lastError?: string
  configHash: string
  appliedLive: boolean
  restartRequired: boolean
}

/**
 * Discriminated runtime location (§17.12.4, Windows-first). A discovery fact,
 * never a display string: a catalog row is not occupancy, and
 * `installed` / `discovered` / `launchable` stay three distinct facts.
 */
export type RuntimeLocation =
  | { kind: 'managed'; executable: string; installRoot: string; version: string }
  | { kind: 'windows_path'; executable: string; source: string }
  | { kind: 'windows_registry'; executable: string; source: string }
  | { kind: 'user_path'; executable: string; source: string }
  | { kind: 'package_manager'; manager: string; package: string; version?: string }
  | { kind: 'wsl'; distro: string; linuxPath: string; windowsLauncher: string }
  | { kind: 'unavailable'; reason: string }

/** The P63 spawn-time binding, as reported to the UI: variable NAMES only. */
export interface BackendBindingView {
  providerId: string
  injectedEnvNames: string[]
  unexpressed: string[]
  /** Always `false` — EveryAIOS never writes an external agent's own config. */
  writesToAgentConfig: boolean
  keyPresent: boolean
  refusal?: string
}

export interface AgentConfigOptionView {
  id: string
  name: string
  value?: unknown
  options?: string[]
}

/** One session capability-loadout row — a loadout, not a tool dump. */
export interface SessionLoadoutRow {
  capabilityId: string
  source: string
  nativeOrShared: 'native' | 'shared'
  enabled: boolean
  health: string
  scope: string
  requiresApproval: boolean
  /** Fixed: loadout changes apply to the next turn/run. */
  appliesFrom: string
}

export type AgentProtocol = 'inbuilt' | 'acp' | 'mcp'
export type AgentAuthMode = 'subscription' | 'api_key' | 'local_cli' | 'keyless' | 'unknown'
export type ModelOwner = 'native' | 'agent' | 'managed'
export type AgentReadiness =
  | 'ready'
  | 'sign_in_required'
  | 'api_key_required'
  | 'local_cli'
  | 'not_installed'
  | 'unavailable'
  | 'health_failed'

export interface AgentSettings {
  agentId: string
  installed: boolean
  protocol: AgentProtocol
  authMode: AgentAuthMode
  nativeCapabilities: string[]
  sharedCapabilities: string[]
  /** Authoritative: `managed` only for a verified launch-time (P63) binding. */
  modelOwner: ModelOwner
  backendBinding?: BackendBindingView
  configOptions: AgentConfigOptionView[]
  readiness: AgentReadiness
  location: RuntimeLocation
  sessionLoadout: SessionLoadoutRow[]
}

export type ConnectionKind =
  | 'remote_mcp'
  | 'oauth_connector'
  | 'native_adapter'
  | 'message_channel'

export type ConnectionState =
  | 'discovered'
  | 'installed'
  | 'connected'
  | 'disconnected'
  | 'degraded'
  | 'revoked'

export interface ConnectionRecord {
  id: string
  kind: ConnectionKind
  transport: 'stdio' | 'http' | 'oauth' | 'api_key' | 'browser_session' | 'native'
  scopes: string[]
  enabledConsumers: string[]
  state: ConnectionState
  health: string
  /** Opaque vault reference only; never a secret. */
  authRef?: string
  configHash: string
}

export type ScheduleTrigger = 'cron' | 'interval' | 'event' | 'webhook'
export type ScheduleState = 'idle' | 'running' | 'paused' | 'failed' | 'disabled'

export interface ScheduleSettings {
  id: string
  trigger: ScheduleTrigger
  /** The session/Work this schedule reawakens (frozen manifest per run). */
  target: string
  chiefAgentId: string
  capabilityScope: string[]
  autonomy: string
  budget: string
  networkPolicy: string
  timezone: string
  enabled: boolean
  configHash: string
  nextRunAt?: number
  lastRunAt?: number
  state: ScheduleState
}

export type ExtensionKind = 'skill' | 'plugin' | 'mcp' | 'acp' | 'hook' | 'tool'

export interface InstalledExtension {
  id: string
  kind: ExtensionKind
  version: string
  abiVersion?: number
  provenance: string
  digest: string
  signatureStatus: string
  capabilitiesRequested: string[]
  capabilitiesGranted: string[]
  boundAgents: string[]
  activation: 'lazy' | 'active' | 'disabled'
  health: string
}

/**
 * The §17.12.3 mutation envelope. Field order matches the contract. The UI
 * must render `state`/`health` from this reread — never its own optimistic
 * guess — and surface `lastError` when the authoritative reread disagrees.
 */
export interface SettingsMutationResult {
  appliedLive: boolean
  restartRequired: boolean
  state: string
  health: string
  lastError?: string
}

// ───────────────────────────────────────────────────────────────────────────
// Envelopes (per-command response shapes)
// ───────────────────────────────────────────────────────────────────────────

/** One provider row: the catalog row plus the P65 state/health/hash fields. */
export type ProviderSettingsRow = SettingsReadModel & {
  id: string
  name?: string
  keyConfigured?: boolean
  keyless?: boolean
  reachable?: boolean
  observedAt?: number
  observedModelCount?: number
  verifiedAt?: string
  [key: string]: unknown
}

export interface ProviderGroups {
  configured: string[]
  popular: string[]
  all: string[]
}

export interface ProvidersEnvelope {
  providers: ProviderSettingsRow[]
  groups: ProviderGroups
  defaultModel: { provider?: string; model?: string }
  status: unknown
}

export interface DefaultModelEnvelope {
  defaultModel: { provider?: string; model?: string }
}

export interface AgentsEnvelope {
  agents: AgentSettings[]
}

export interface ConnectionsEnvelope {
  connections: ConnectionRecord[]
}

export interface SchedulesEnvelope {
  schedules: ScheduleSettings[]
}

export interface ExtensionsEnvelope {
  extensions: InstalledExtension[]
}

// ───────────────────────────────────────────────────────────────────────────
// Commands
// ───────────────────────────────────────────────────────────────────────────

/** P65.1 — Configured / Popular / All provider inventory + live default model. */
export function settingsProvidersList(): Promise<ProvidersEnvelope> {
  return bridgeCall<ProvidersEnvelope>({
    operation: 'settings_providers_list',
    live: () => invoke<ProvidersEnvelope>('settings_providers_list'),
    preview: () => ({
      providers: [],
      groups: { configured: [], popular: [], all: [] },
      defaultModel: {},
      status: null,
    }),
  })
}

export function settingsDefaultModelGet(): Promise<DefaultModelEnvelope> {
  return bridgeCall<DefaultModelEnvelope>({
    operation: 'settings_default_model_get',
    live: () => invoke<DefaultModelEnvelope>('settings_default_model_get'),
    preview: () => ({ defaultModel: {} }),
  })
}

/**
 * P65.1 — persist the default model through the one mutation funnel.
 *
 * Refused by the shell when an external agent owns the model surface
 * (`modelOwner === 'agent'`): the native catalog must not override another
 * agent's own model. The refusal arrives as the envelope's `lastError`.
 */
export function settingsDefaultModelSet(
  provider: string,
  model: string,
): Promise<SettingsMutationResult> {
  return invoke<SettingsMutationResult>('settings_default_model_set', { provider, model })
}

/** P65.2 — every agent's two-plane settings (native vs shared cowork). */
export function settingsAgentsList(): Promise<AgentsEnvelope> {
  return bridgeCall<AgentsEnvelope>({
    operation: 'settings_agents_list',
    live: () => invoke<AgentsEnvelope>('settings_agents_list'),
    preview: () => ({ agents: [] }),
  })
}

/** P65.2 — one agent's detail (auth mode, readiness, runtime location). */
export function settingsAgentGet(agentId: string): Promise<AgentSettings> {
  return invoke<AgentSettings>('settings_agent_get', { agentId })
}

/** P65.2 / §17.12.5 — the session capability loadout for one agent. */
export function settingsAgentLoadout(agentId: string): Promise<SessionLoadoutRow[]> {
  return invoke<{ loadout?: SessionLoadoutRow[] }>('settings_agent_loadout', { agentId }).then(
    (r) => r.loadout ?? [],
  )
}

/** P65.3 — MCP servers, OAuth connectors and local adapters, unified. */
export function settingsConnectionsList(): Promise<ConnectionsEnvelope> {
  return bridgeCall<ConnectionsEnvelope>({
    operation: 'settings_connections_list',
    live: () => invoke<ConnectionsEnvelope>('settings_connections_list'),
    preview: () => ({ connections: [] }),
  })
}

/** P65.4 — schedules as the Settings contract sees them. */
export function settingsSchedulesList(): Promise<SchedulesEnvelope> {
  return bridgeCall<SchedulesEnvelope>({
    operation: 'settings_schedules_list',
    live: () => invoke<SchedulesEnvelope>('settings_schedules_list'),
    preview: () => ({ schedules: [] }),
  })
}

export function settingsScheduleGet(id: string): Promise<ScheduleSettings> {
  return invoke<ScheduleSettings>('settings_schedule_get', { id })
}

/**
 * P65.4 — enable/pause through the mutation funnel. Editing a schedule must
 * not mutate an in-flight run; the envelope's `appliedLive` reports whether
 * the change took effect without a restart.
 */
export function settingsScheduleSetEnabled(
  id: string,
  enabled: boolean,
): Promise<SettingsMutationResult> {
  return invoke<SettingsMutationResult>('settings_schedule_set_enabled', { id, enabled })
}

/** P65 — installed skills / plugins / MCP / ACP / hooks with their grants. */
export function settingsExtensionsList(): Promise<ExtensionsEnvelope> {
  return bridgeCall<ExtensionsEnvelope>({
    operation: 'settings_extensions_list',
    live: () => invoke<ExtensionsEnvelope>('settings_extensions_list'),
    preview: () => ({ extensions: [] }),
  })
}

// ───────────────────────────────────────────────────────────────────────────
// Presentation helpers (pure)
// ───────────────────────────────────────────────────────────────────────────

/**
 * Plain-language runtime location for the Settings row. Deliberately shows
 * provenance + exact path instead of collapsing to a boolean: "installed"
 * alone cannot distinguish a Windows App Paths hit from a WSL backend.
 */
export function runtimeLocationLabel(loc: RuntimeLocation): string {
  switch (loc.kind) {
    case 'managed':
      return `managed · ${loc.executable}${loc.version ? ` · v${loc.version}` : ''}`
    case 'windows_path':
    case 'windows_registry':
    case 'user_path':
      return `${loc.kind.replace('_', ' ')} · ${loc.executable}`
    case 'package_manager':
      return `${loc.manager} · ${loc.package}${loc.version ? `@${loc.version}` : ''}`
    case 'wsl':
      return `wsl · ${loc.distro} · ${loc.linuxPath}`
    case 'unavailable':
      return `unavailable · ${loc.reason}`
  }
}

/** True only when a location proves an on-disk executable exists. */
export function isLaunchable(loc: RuntimeLocation): boolean {
  return loc.kind !== 'unavailable' && loc.kind !== 'package_manager'
}
