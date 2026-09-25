import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import type { ReactElement } from 'react'
import {
  click,
  installShell,
  mount,
  registerDom,
  removeShell,
  unregisterDom,
  waitFor,
  withAct,
  type Mounted,
} from '@/test/dom-harness'
import { useAppStore } from '@/lib/store'

let Panel: () => ReactElement
let mounted: Mounted

function inventory(runtimes: Record<string, unknown>[]) {
  return { runtimes }
}

function resetStore(): void {
  useAppStore.setState({
    selectedAgentId: '',
    liveAgents: [],
    acpHandles: {},
    acpConfigOptions: {},
  } as never)
}

beforeAll(async () => {
  registerDom()
  Panel = (await import('./local-models-panel')).default
})

afterAll(() => {
  unregisterDom()
})

beforeEach(async () => {
  resetStore()
  installShell({
    runtime_inventory_list: () => inventory([]),
    runtime_models: () => ({ models: [] }),
    local_hardware: () => null,
    model_downloads: () => ({ active: [], orphans: [] }),
    model_registry_list: () => ({ models: [] }),
  })
  await withAct(() => resetStore())
})

afterEach(() => {
  mounted?.unmount()
  removeShell()
})

describe('local models panel — runtime and handoff truth', () => {
  test('an external endpoint is Observed before a health probe, never Ready', async () => {
    installShell({
      runtime_inventory_list: () =>
        inventory([
          {
            id: 'external-runtime',
            kind: 'ollama',
            ownership: 'external',
            endpoint: 'http://127.0.0.1:11434',
            protocol: 'openai_compatible',
            version: '0.1',
          },
        ]),
      runtime_models: () => ({ models: [] }),
    })
    mounted = await mount(<Panel />)

    await waitFor(() => mounted.container.querySelector('[data-testid="runtime-external-runtime"]') !== null)
    const body = mounted.container.textContent ?? ''
    expect(body).toContain('Observed')
    expect(body).toContain('not healthy yet')
    expect(body).not.toContain('Ready')
  })

  test('Stop is rendered for Managed inventory and withheld for External inventory', async () => {
    installShell({
      runtime_inventory_list: () =>
        inventory([
          {
            id: 'external-runtime',
            kind: 'ollama',
            ownership: 'external',
            endpoint: 'http://127.0.0.1:11434',
            protocol: 'openai_compatible',
          },
          {
            id: 'managed-runtime',
            kind: 'ollama',
            ownership: 'managed',
            endpoint: 'http://127.0.0.1:11435',
            protocol: 'openai_compatible',
          },
        ]),
      runtime_models: () => ({ models: [] }),
    })
    mounted = await mount(<Panel />)

    await waitFor(() => mounted.container.querySelector('[data-testid="runtime-managed-runtime"]') !== null)
    expect(mounted.container.querySelector('[data-testid="runtime-stop-external-runtime"]')).toBeNull()
    expect(mounted.container.querySelector('[data-testid="runtime-stop-managed-runtime"]')).not.toBeNull()
  })

  test('a native_only agent gets the honest configure-inside-the-agent sentence', async () => {
    await withAct(() =>
      useAppStore.setState({
        selectedAgentId: 'native-agent',
        liveAgents: [
          {
            id: 'native-agent',
            name: 'Native Agent',
            readiness: 'ready',
          },
        ],
      } as never),
    )
    installShell({
      runtime_inventory_list: () =>
        inventory([
          {
            id: 'managed-runtime',
            kind: 'ollama',
            ownership: 'managed',
            endpoint: 'http://127.0.0.1:11435',
            protocol: 'openai_compatible',
            agentCompatibility: [
              {
                agentId: 'native-agent',
                control: 'native_only',
                usable: false,
                reason: 'The agent manages its own model.',
              },
            ],
          },
        ]),
    })
    mounted = await mount(<Panel />)

    await waitFor(() => mounted.container.querySelector('[data-testid="agent-handoff-managed-runtime"]') !== null)
    expect(mounted.container.textContent ?? '').toContain(
      'This agent manages its own model — configure it inside the agent.',
    )
  })

  test('an unknown agent control level is not turned into a model picker', async () => {
    await withAct(() =>
      useAppStore.setState({
        selectedAgentId: 'unknown-agent',
        liveAgents: [
          {
            id: 'unknown-agent',
            name: 'Unclear Agent',
            controlLevel: 'unknown',
            readiness: 'degraded',
          },
        ],
      } as never),
    )
    installShell({
      runtime_inventory_list: () =>
        inventory([
          {
            id: 'managed-runtime',
            kind: 'ollama',
            ownership: 'managed',
            endpoint: 'http://127.0.0.1:11435',
            protocol: 'openai_compatible',
          },
        ]),
    })
    mounted = await mount(<Panel />)

    await waitFor(() => mounted.container.querySelector('[data-testid="agent-handoff-managed-runtime"]') !== null)
    const handoff = mounted.container.querySelector('[data-testid="agent-handoff-managed-runtime"]')
    expect(handoff?.textContent ?? '').toContain('Model control for this agent is unknown — not offered.')
    expect(handoff?.querySelector('select')).toBeNull()
  })

  test('a downloaded artifact with no fit estimate gets a neutral dot, not a red failure', async () => {
    installShell({
      runtime_inventory_list: () => inventory([]),
      model_registry_list: () => ({
        models: [
          {
            id: 'example-artifact',
            path: '/models/example',
            sha256: 'abcdef1234567890',
            size: 1_000_000,
            ctx: 16_384,
            quant: 'Q4_K_M',
            source: 'test',
          },
        ],
      }),
      model_estimate_fit: () => ({}),
    })
    mounted = await mount(<Panel />)
    await waitFor(() => mounted.container.querySelector('[data-testid="library-empty"]') === null)

    const libraryTab = Array.from(mounted.container.querySelectorAll('button')).find(
      (button) => (button.textContent ?? '').trim() === 'Library',
    )
    expect(libraryTab).not.toBeNull()
    await click(libraryTab!)

    await waitFor(() => mounted.container.querySelector('[data-testid="library-artifact-example-artifact"]') !== null)
    const artifact = mounted.container.querySelector('[data-testid="library-artifact-example-artifact"]')
    expect(artifact?.querySelector('[data-fit="unavailable"]')).not.toBeNull()
    expect(artifact?.querySelector('.bg-red-400')).toBeNull()
  })
})
