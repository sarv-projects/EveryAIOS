// P63 — per-agent model-backend configuration client (Agent runtimes card).
//
// The user points an external agent at one of their own providers here. The
// choice is stored by the shell; the provider *key* is read from the EveryAIOS
// vault in Rust at spawn time and injected as environment. Nothing is written
// to the agent's own config file, and no key material ever crosses this
// boundary — `agentBackendGet` returns variable *names*, never values.

import { invoke } from './tauri'
import { nativeCall } from './runtime'

/** How the agent accepts a provider binding (`everyaios_acp::BackendChannel`). */
export type BackendChannel =
  | 'provider_env'
  | 'fixed_env'
  | 'config_file'
  | 'subscription'
  | 'unknown'

export interface AgentBackendChoice {
  provider: string
  model: string
  useVaultKey: boolean
  baseUrl: string | null
}

export interface AgentBackendState {
  agentId: string
  channel: BackendChannel
  /** True only for `provider_env` / `fixed_env` — env injection works. */
  injectable: boolean
  note: string
  configFile: string | null
  configured: AgentBackendChoice | null
  /** Names of the variables a launch will carry. Never values. */
  injectedEnv: string[]
  /** Requested settings this agent has no variable for. */
  unexpressed: string[]
  keyPresent: boolean
  /** Always false today: no agent config file is written (see TODO P47.7). */
  writesToDisk: boolean
  /** Why a binding cannot be expressed, when that is the case. */
  refusal: string | null
}

export interface AgentProviderRow {
  id: string
  name: string
  /** The provider's own env var name (models.dev convention). */
  env: string | null
  baseUrl: string
  /** Loopback / localhost endpoint — a keyless local runtime. */
  local: boolean
  /** A key for this provider is already in the EveryAIOS vault. */
  keyInVault: boolean
  verifiedAt: string | null
}

export interface ProviderProbeResult {
  ok: boolean
  status: number
  message: string
  models: number
  url?: string
}

/** Human label for the channel — the card's badge. */
export function channelLabel(channel: BackendChannel): string {
  switch (channel) {
    case 'provider_env':
      return 'reads provider env'
    case 'fixed_env':
      return 'fixed env vars'
    case 'config_file':
      return 'own config file'
    case 'subscription':
      return 'signs in itself'
    default:
      return 'not verified'
  }
}

export async function agentBackendGet(agentId: string): Promise<AgentBackendState> {
  return nativeCall('agent backend state', () =>
    invoke<AgentBackendState>('agent_backend_get', { agentId }),
  )
}

export async function agentBackendProviders(agentId: string): Promise<AgentProviderRow[]> {
  const r = await nativeCall('agent backend providers', () =>
    invoke<{ providers: AgentProviderRow[] }>('agent_backend_providers', { agentId }),
  )
  return r.providers ?? []
}

export async function agentBackendSet(input: {
  agentId: string
  provider: string
  model?: string
  useVaultKey?: boolean
  baseUrl?: string | null
}): Promise<AgentBackendState> {
  return nativeCall('agent backend set', () =>
    invoke<AgentBackendState>('agent_backend_set', {
      agentId: input.agentId,
      provider: input.provider,
      model: input.model ?? null,
      useVaultKey: input.useVaultKey ?? true,
      baseUrl: input.baseUrl ?? null,
    }),
  )
}

export async function agentBackendClear(agentId: string): Promise<AgentBackendState> {
  return nativeCall('agent backend clear', () =>
    invoke<AgentBackendState>('agent_backend_clear', { agentId }),
  )
}

export async function agentBackendProbe(provider: string): Promise<ProviderProbeResult> {
  return nativeCall('agent backend probe', () =>
    invoke<ProviderProbeResult>('agent_backend_probe', { provider }),
  )
}
