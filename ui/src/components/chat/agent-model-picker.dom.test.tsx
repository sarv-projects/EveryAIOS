// P58.7 — DOM proof that the agent/model picker renders the LIVE models.dev
// catalog rows (not the curated seed) and pins a provider-qualified selection.
//
// The pure mapper rules live in `src/lib/catalog-models.test.ts`. This file
// proves the *rendering* and the *pin*, which pure tests cannot: the real
// component, the real store, the real `catalogProviders`/`catalogProviderModels`
// shells, against a faked `window.__TAURI_INTERNALS__` (see `@/test/dom-harness`).
//
// The fixture is deliberately mixed — one keyed provider, one keyless provider,
// one plain provider with no key, and rows with an omitted price — because those
// are exactly the honesty edges the picker must honour.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import type { ReactElement } from 'react'
import {
  click,
  findButton,
  installShell,
  mount,
  registerDom,
  removeShell,
  tick,
  unregisterDom,
  waitFor,
  withAct,
  type Mounted,
} from '@/test/dom-harness'
import { useAppStore } from '@/lib/store'
import { AGENTS, type AgentRuntime } from '@/lib/agents'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** A catalog model row as the shell would serialise it. */
function model(row: Record<string, unknown>): Record<string, unknown> {
  return { description: '', family: '', ...row }
}

const OPENROUTER_MODELS = [
  model({
    id: 'anthropic/claude-sonnet-4',
    name: 'Claude Sonnet 4',
    context: 200_000,
    output: 64_000,
    priceInput: 3,
    priceOutput: 15,
    reasoning: true,
    toolCall: true,
    images: true,
    free: false,
  }),
  // Price omitted by the catalog → must render `—`, never `free`.
  model({
    id: 'meta-llama/llama-4-scout',
    name: 'Llama 4 Scout',
    context: 131_072,
    output: 8_192,
    priceInput: null,
    priceOutput: null,
    free: false,
  }),
]

const FREE_MODELS = [
  model({ id: 'qwen3-coder', name: 'Qwen3 Coder', context: 262_144, output: 32_768, free: true }),
]

// No key, no profile, not keyless: a Settings row, not a chat target.
const UNKEYED_MODELS = [model({ id: 'should-never-render', name: 'Unkeyed Model', free: true })]

const PROVIDERS = [
  {
    id: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    logoUrl: '',
    source: 'models.dev',
    keyConfigured: true,
    modelCount: OPENROUTER_MODELS.length,
  },
  {
    id: 'opencode-free',
    name: 'OpenCode Free',
    baseUrl: 'https://opencode.ai/zen/v1',
    logoUrl: '',
    source: 'models.dev',
    keyConfigured: false,
    keyless: true,
    modelCount: FREE_MODELS.length,
  },
  {
    id: 'unkeyed-cloud',
    name: 'Unkeyed Cloud',
    baseUrl: 'https://unkeyed.example/v1',
    logoUrl: '',
    source: 'models.dev',
    keyConfigured: false,
    modelCount: UNKEYED_MODELS.length,
  },
]

interface StubOptions {
  /** Replace the provider list (used for the no-usable-provider case). */
  providers?: unknown[]
  /** Providers are reachable but their model tables are empty. */
  noModels?: boolean
  /** Make `catalog_providers` reject, as a broken shell would. */
  failProviders?: boolean
}

function catalogHandlers(opts: StubOptions = {}): Record<string, (args?: Record<string, unknown>) => unknown> {
  const providers = opts.providers ?? PROVIDERS
  return {
    catalog_providers: () => {
      if (opts.failProviders) throw new Error('catalog_providers exploded')
      return {
        providers,
        status: {
          source: 'https://models.dev/api.json',
          fetchedAt: Date.now(),
          providers: providers.length,
          models: 3,
        },
        profiles: [],
      }
    },
    catalog_provider_models: (args) => {
      const provider = String(args?.provider ?? '')
      if (opts.noModels) {
        return { models: [], profileModels: [], count: 0, live: true, freeSubset: null }
      }
      const rows =
        provider === 'openrouter'
          ? OPENROUTER_MODELS
          : provider === 'opencode-free'
            ? FREE_MODELS
            : provider === 'unkeyed-cloud'
              ? UNKEYED_MODELS
              : []
      return {
        models: rows,
        profileModels: [],
        count: rows.length,
        live: true,
        freeSubset: provider === 'opencode-free' ? FREE_MODELS.map((m) => m.id) : null,
      }
    },
  }
}

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

let Picker: (props: { compact?: boolean }) => ReactElement | null
let mounted: Mounted
let invoked: string[]

beforeAll(async () => {
  registerDom()
  Picker = (await import('./agent-model-picker')).default
})

afterAll(() => {
  unregisterDom()
})

beforeEach(async () => {
  invoked = installShell(catalogHandlers())
  await withAct(() =>
    useAppStore.setState({
      selectedAgentId: 'everyaios-native',
      selectedModelId: 'claude-sonnet-4.5',
      selectedModelProvider: undefined,
      autoRoute: false,
      liveAgents: [],
      lastToast: undefined,
    }),
  )
  mounted = await mount(<Picker />)
})

afterEach(() => {
  mounted.unmount()
  removeShell()
})

function trigger(): HTMLButtonElement {
  return findButton(mounted.container, 'button[aria-label="Choose agent and model"]')
}

function rowButton(provider: string, id: string): HTMLButtonElement | null {
  return mounted.container.querySelector<HTMLButtonElement>(
    `button[title="Use ${provider} · ${id} for this chat"]`,
  )
}

/** Open the popover and wait for the live rows to land. */
async function openPicker(): Promise<void> {
  await click(trigger())
  const opened = await waitFor(() =>
    (mounted.container.textContent ?? '').includes('Your providers · models.dev'),
  )
  expect(opened).toBe(true)
  await waitFor(() => mounted.container.querySelector('button[title^="Use openrouter ·"]') !== null)
}

/** Re-install the shell after `beforeEach` mounted the picker (state tests). */
async function restub(opts: StubOptions): Promise<void> {
  invoked = installShell(catalogHandlers(opts))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('P58.7 — picker renders the live models.dev catalog', () => {
  test('renders real catalog rows for reachable providers, with real context and prices', async () => {
    await openPicker()

    const row = rowButton('openrouter', 'anthropic/claude-sonnet-4')
    expect(row).not.toBeNull()

    const text = row?.textContent ?? ''
    expect(text).toContain('Claude Sonnet 4')
    expect(text).toContain('openrouter')
    expect(text).toContain('anthropic/claude-sonnet-4')
    expect(text).toContain('200K ctx')
    expect(text).toContain('$3.00/in')
    expect(text).toContain('$15.00/out')
    expect(text).toContain('reasoning')
    expect(text).toContain('tools')
    expect(text).toContain('vision')

    // The keyless provider is reachable too, and is labelled free.
    const free = rowButton('opencode-free', 'qwen3-coder')
    expect(free).not.toBeNull()
    expect(free?.textContent ?? '').toContain('free')

    // It read the payload through the real shell seam, not a curated list.
    expect(invoked).toContain('catalog_providers')
    expect(invoked).toContain('catalog_provider_models:openrouter')
  })

  test('never offers a provider this machine cannot reach', async () => {
    await openPicker()

    expect(mounted.container.textContent ?? '').not.toContain('should-never-render')
    expect(rowButton('unkeyed-cloud', 'should-never-render')).toBeNull()
    // It only asked the shell about the two reachable providers.
    expect(invoked).not.toContain('catalog_provider_models:unkeyed-cloud')
    expect(invoked).toContain('catalog_provider_models:openrouter')
    expect(invoked).toContain('catalog_provider_models:opencode-free')
  })

  test('shows `—` for a price the catalog omitted, not `free`', async () => {
    await openPicker()

    const row = rowButton('openrouter', 'meta-llama/llama-4-scout')
    expect(row).not.toBeNull()
    const text = row?.textContent ?? ''
    expect(text).toContain('—/in · —/out')
    expect(text).not.toContain('free')
  })

  test('keeps the curated seed clearly labelled as not the live catalog', async () => {
    await openPicker()

    const body = mounted.container.textContent ?? ''
    expect(body).toContain('Curated seed · EveryAIOS Native')
    expect(body).toContain('not the live catalog')
  })

  test('pins the (provider, model) pair and names it in the trigger', async () => {
    await openPicker()

    const row = rowButton('openrouter', 'anthropic/claude-sonnet-4')
    expect(row).not.toBeNull()
    if (!row) return
    await click(row)

    await waitFor(() => useAppStore.getState().selectedModelProvider === 'openrouter')

    // The provider travels with the model id: the broker resolves the endpoint
    // from the catalog rather than guessing one from the id.
    expect(useAppStore.getState().selectedModelId).toBe('anthropic/claude-sonnet-4')
    expect(useAppStore.getState().selectedModelProvider).toBe('openrouter')

    // The trigger names the exact pair sent to the broker — a catalog pin must
    // never render as `—` (the bug the abandoned live-window run surfaced).
    await waitFor(() =>
      (trigger().textContent ?? '').includes('openrouter · anthropic/claude-sonnet-4'),
    )
    expect(trigger().textContent ?? '').toContain('openrouter · anthropic/claude-sonnet-4')

    // And the row now reads as the pinned one.
    await waitFor(() =>
      (rowButton('openrouter', 'anthropic/claude-sonnet-4')?.textContent ?? '').includes('sticky'),
    )
  })

  test('picking turns auto-route off so the pin is not silently ignored', async () => {
    await withAct(() => useAppStore.setState({ autoRoute: true }))
    await openPicker()

    const row = rowButton('opencode-free', 'qwen3-coder')
    expect(row).not.toBeNull()
    if (!row) return
    await click(row)

    await waitFor(() => useAppStore.getState().autoRoute === false)
    expect(useAppStore.getState().autoRoute).toBe(false)
    expect(useAppStore.getState().selectedModelProvider).toBe('opencode-free')
    await tick()
  })
})

// ---------------------------------------------------------------------------
// P55.4 / P60.14 — occupancy
// ---------------------------------------------------------------------------

/** A runtime row as the shell's merged catalog would publish it. */
function runtimeRow(id: string, installed: boolean): AgentRuntime {
  const seed = AGENTS.find((a) => a.id === id)!
  return {
    ...seed,
    status: installed ? 'installed' : 'available',
    models: [],
    defaultModel: '',
  }
}

function agentRow(id: string): HTMLButtonElement | null {
  return mounted.container.querySelector<HTMLButtonElement>(`button[data-agent-id="${id}"]`)
}

describe('P55.4 — runtime occupancy is never painted from the static seed', () => {
  test('an empty shell inventory is stated, and only Native is offered', async () => {
    // `beforeEach` installs the shell with `liveAgents: []` — discovery has
    // not reported. The curated seed must not be shown as if it had been.
    await click(trigger())

    const ok = await waitFor(() =>
      (mounted.container.textContent ?? '').includes('Runtime inventory unavailable'),
    )
    expect(ok).toBe(true)
    expect(agentRow('everyaios-native')).not.toBeNull()
    expect(agentRow('claude-code')).toBeNull()
    expect(agentRow('opencode')).toBeNull()
  })

  test('a discovered installed runtime is listed and selectable', async () => {
    await withAct(() =>
      useAppStore.setState({ liveAgents: [runtimeRow('everyaios-native', true), runtimeRow('claude-code', true)] }),
    )
    await click(trigger())

    const row = agentRow('claude-code')
    expect(row).not.toBeNull()
    expect(mounted.container.textContent ?? '').not.toContain('Runtime inventory unavailable')
    if (!row) return
    await click(row)
    expect(useAppStore.getState().selectedAgentId).toBe('claude-code')
  })

  test('a registry entry with no binary reads `not installed` and is not selectable', async () => {
    await withAct(() =>
      useAppStore.setState({ liveAgents: [runtimeRow('everyaios-native', true), runtimeRow('claude-code', false)] }),
    )
    await click(trigger())

    const row = agentRow('claude-code')
    expect(row).not.toBeNull()
    expect(row?.textContent ?? '').toContain('not installed')
    if (!row) return
    await click(row)
    // It must not become a selection the send path cannot launch.
    expect(useAppStore.getState().selectedAgentId).toBe('everyaios-native')
  })

  test('outside the shell the labelled preview fixture is kept', async () => {
    removeShell()
    await click(trigger())
    // The browser preview has no shell to ask, so the fixture stands in — but
    // it is the only place the seed is allowed to read as a runtime list.
    expect(agentRow('claude-code')).not.toBeNull()
    expect(mounted.container.textContent ?? '').not.toContain('Runtime inventory unavailable')
  })
})

describe('P58.7 — picker states are honest when the catalog is not usable', () => {
  test('states the reason when no provider is reachable', async () => {
    await restub({ providers: [] })
    await click(trigger())

    const ok = await waitFor(() =>
      (mounted.container.textContent ?? '').includes(
        'No provider is reachable yet — add a key or a custom profile in Settings → Providers.',
      ),
    )
    expect(ok).toBe(true)
    // Never a silent fallback that reads like coverage.
    expect(mounted.container.textContent ?? '').toContain('Curated seed · EveryAIOS Native')
  })

  test('says it is preview mode when there is no shell at all', async () => {
    removeShell()
    await click(trigger())

    const ok = await waitFor(() =>
      (mounted.container.textContent ?? '').includes(
        'Preview mode — the live models.dev catalog needs the desktop shell.',
      ),
    )
    expect(ok).toBe(true)
  })

  test('says the providers are reachable but carry no model rows yet', async () => {
    await restub({ noModels: true })
    await click(trigger())

    const ok = await waitFor(() =>
      (mounted.container.textContent ?? '').includes(
        'Your providers are reachable but carry no model rows yet — refresh the catalog in Settings → Providers.',
      ),
    )
    expect(ok).toBe(true)
  })

  test('names a failed shell read as a failure, never as a missing shell', async () => {
    // `catalogProviders` collapses "no shell" and "the shell call failed" into
    // `live: false`, so the picker asks the shell which one it is — telling a
    // user with a running shell that it "needs the desktop shell" is a lie they
    // cannot act on.
    await restub({ failProviders: true })
    await click(trigger())

    const ok = await waitFor(() =>
      (mounted.container.textContent ?? '').includes(
        'Live provider catalog unavailable — the shell could not read it. Showing curated rows only.',
      ),
    )
    expect(ok).toBe(true)
    expect(mounted.container.textContent ?? '').not.toContain('Preview mode')
  })
})
