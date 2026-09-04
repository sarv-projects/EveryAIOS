// Provider directory (opencode BYOK pattern over the Rust registry).
//
// The shell already vendors all 212 models.dev providers
// (`everyaios-catalog::provider_seed`, served via `discovery_inventory` as
// provider cards). This module merges those cards with the live vault key set
// (`vault_keys_list`) so the UI can render one honest row per provider:
// configured keys unlock routes, everything else explains where the key goes.
// Secrets never appear here — only the `keyConfigured` fact plus the auth
// *shape* (env-var name) the card already carries.

import { discoveryInventory, type ResourceCard } from './discovery'
import { inTauri, invoke } from './tauri'
import { MODELS, type AgentModel, type ModelProvider } from './agents'

export interface VaultKeyRow {
  provider: string
  keyId: string
  opaqueHandle: string
  status: string
}

export interface ProviderEntry {
  id: string
  name: string
  /** Explicit endpoint ('' = SDK default / user override applies). */
  baseUrl: string
  /** models.dev provider page — full model list, pricing, docs link. */
  docUrl: string
  /** Auth shape, e.g. `api_key_env:OPENAI_API_KEY`, `keyless`, `aws_sdk`. */
  auth: string
  /** First env-var handle from the auth shape, if any. */
  envVar: string | null
  source: string
  status: string
  capabilities: string[]
  capabilitiesVerified: boolean
  /** True when the vault holds ≥1 key for this provider. */
  keyConfigured: boolean
  /** Curated models in this build for the provider (may be empty — the full
   * list lives on the models.dev page linked above). */
  models: AgentModel[]
}

/** `api_key_env:OPENAI_API_KEY` → `OPENAI_API_KEY`, else null. */
export function envVarFromAuth(auth: string): string | null {
  const m = /^api_key_env:(.+)$/.exec(auth.trim())
  return m ? m[1] : null
}

export function modelsDevUrl(providerId: string): string {
  return `https://models.dev/providers/${providerId}`
}

/** Catalog provider id → the static curated-model provider key(s). Unknown
 * providers carry no curated rows (their models live on models.dev). */
const PROVIDER_MODEL_MAP: Record<string, ModelProvider[]> = {
  anthropic: ['anthropic'],
  openai: ['openai'],
  'openai-api': ['openai'],
  xai: ['xai'],
  google: ['google'],
  'google-vertex': ['google'],
  'google-vertex-anthropic': ['google'],
  deepseek: ['deepseek'],
  mistral: ['mistral'],
  meta: ['meta'],
  qwen: ['qwen'],
  alibaba: ['qwen'],
  'alibaba-cn': ['qwen'],
  moonshotai: ['qwen'],
  'moonshotai-cn': ['qwen'],
  local: ['meta', 'qwen'],
  lmstudio: ['meta', 'qwen'],
  'ollama-cloud': ['meta', 'qwen'],
}

export function providerModels(providerId: string): AgentModel[] {
  const keys = PROVIDER_MODEL_MAP[providerId]
  if (!keys) return []
  return MODELS.filter((m) => keys.includes(m.provider))
}

export function toProviderEntry(
  card: ResourceCard,
  keyedProviders: Set<string>,
): ProviderEntry {
  return {
    id: card.id,
    name: card.name || card.id,
    baseUrl: card.baseUrl ?? '',
    docUrl: card.docUrl ?? modelsDevUrl(card.id),
    auth: card.auth,
    envVar: envVarFromAuth(card.auth),
    source: card.source,
    status: card.status,
    capabilities: card.capabilities ?? [],
    capabilitiesVerified: card.capabilitiesVerified ?? false,
    keyConfigured: keyedProviders.has(card.id),
    models: providerModels(card.id),
  }
}

/** Common providers shown when the live inventory is unreachable (preview /
 * offline). Honest by construction: `keyConfigured` is always false and the
 * source reads `preview` — never a claim about this machine. */
const COMMON_FALLBACK_IDS = [
  'anthropic',
  'openai',
  'google',
  'deepseek',
  'xai',
  'mistral',
  'openrouter',
  'nvidia',
  'togetherai',
  'groq',
  'mistral',
  'openai-api',
] as const

const COMMON_FALLBACK_NAMES: Record<string, { name: string; auth: string }> = {
  anthropic: { name: 'Anthropic', auth: 'api_key_env:ANTHROPIC_API_KEY' },
  openai: { name: 'OpenAI', auth: 'api_key_env:OPENAI_API_KEY' },
  google: { name: 'Google', auth: 'api_key_env:GOOGLE_API_KEY' },
  deepseek: { name: 'DeepSeek', auth: 'api_key_env:DEEPSEEK_API_KEY' },
  xai: { name: 'xAI', auth: 'api_key_env:XAI_API_KEY' },
  mistral: { name: 'Mistral', auth: 'api_key_env:MISTRAL_API_KEY' },
  openrouter: { name: 'OpenRouter', auth: 'api_key_env:OPENROUTER_API_KEY' },
  nvidia: { name: 'Nvidia', auth: 'api_key_env:NVIDIA_API_KEY' },
  togetherai: { name: 'Together AI', auth: 'api_key_env:TOGETHER_API_KEY' },
  groq: { name: 'Groq', auth: 'api_key_env:GROQ_API_KEY' },
  'openai-api': { name: 'OpenAI API (Responses/Codex)', auth: 'api_key_env:OPENAI_API_KEY' },
}

function fallbackEntries(): ProviderEntry[] {
  const seen = new Set<string>()
  const out: ProviderEntry[] = []
  for (const id of COMMON_FALLBACK_IDS) {
    if (seen.has(id)) continue
    seen.add(id)
    const meta = COMMON_FALLBACK_NAMES[id] ?? { name: id, auth: 'api_key_env' }
    out.push({
      id,
      name: meta.name,
      baseUrl: '',
      docUrl: modelsDevUrl(id),
      auth: meta.auth,
      envVar: envVarFromAuth(meta.auth),
      source: 'preview',
      status: 'inventoried',
      capabilities: [],
      capabilitiesVerified: false,
      keyConfigured: false,
      models: providerModels(id),
    })
  }
  return out
}

export interface ProviderDirectory {
  providers: ProviderEntry[]
  /** False in preview/offline fallback — rows are common-provider hints. */
  live: boolean
  /** Providers holding ≥1 vault key (drives the setup gate + route feed). */
  keyedIds: string[]
}

export async function loadProviderDirectory(): Promise<ProviderDirectory> {
  if (!inTauri()) return { providers: fallbackEntries(), live: false, keyedIds: [] }
  try {
    const [inv, keyed] = await Promise.all([
      discoveryInventory(),
      invoke<{ keys?: VaultKeyRow[] }>('vault_keys_list', {}).catch((): {
        keys?: VaultKeyRow[]
      } => ({ keys: [] })),
    ])
    const cards = (inv.cards ?? []).filter((c) => c.kind === 'provider')
    const keyedSet = new Set((keyed.keys ?? []).map((k) => k.provider))
    const providers = cards
      .map((c) => toProviderEntry(c, keyedSet))
      .sort((a, b) => a.name.localeCompare(b.name))
    return { providers, live: true, keyedIds: [...keyedSet] }
  } catch {
    return { providers: fallbackEntries(), live: false, keyedIds: [] }
  }
}
