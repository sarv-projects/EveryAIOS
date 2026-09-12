// P58.7 — DOM proof for the status bar's model label.
//
// The bar must name the exact `(provider, model-id)` pair the broker receives
// when the composer pinned a live models.dev row, and keep the curated label for
// a curated pick. `catalogPickLabel`'s rules are unit-tested in
// `src/lib/catalog-models.test.ts`; this proves the *bar actually paints it*
// only when a usable agent row backs it (the label is inside an `agent && …`
// branch, so an empty live-agent list must not surface a model claim at all).

import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test'
import type { ReactElement } from 'react'
import { installShell, mount, registerDom, unregisterDom, withAct, type Mounted } from '@/test/dom-harness'
import { useAppStore } from '@/lib/store'

let StatusBar: () => ReactElement
let mounted: Mounted

/** A usable native runtime row (the bar only paints the label for one). */
const NATIVE = {
  id: 'everyaios-native',
  name: 'EveryAIOS Native',
  mark: 'E',
  accent: 'bg-orange-500 text-black',
  status: 'installed' as const,
  capabilities: [],
}

async function setState(patch: Record<string, unknown>): Promise<void> {
  await withAct(() => useAppStore.setState(patch as never))
  await withAct(() => {})
}

beforeAll(async () => {
  registerDom()
  StatusBar = (await import('./status-bar')).StatusBar
})

afterAll(() => {
  unregisterDom()
})

afterEach(() => {
  mounted.unmount()
})

describe('P58.7 — status bar names a catalog pick by the pair the broker gets', () => {
  test('paints `provider · model-id` for a catalog pick', async () => {
    installShell()
    await setState({
      selectedAgentId: 'everyaios-native',
      selectedModelId: 'anthropic/claude-sonnet-4',
      selectedModelProvider: 'openrouter',
      liveAgents: [NATIVE],
      activeSessionId: null,
      sessions: [],
      autoRoute: false,
      // The full bar (with the agent/model block) is the devMode surface; the
      // default compact bar is a preview strip that carries no model claim.
      devMode: true,
    })
    mounted = await mount(<StatusBar />)

    expect(mounted.container.textContent ?? '').toContain('openrouter · anthropic/claude-sonnet-4')
  })

  test('keeps the curated label for a curated pick', async () => {
    installShell()
    await setState({
      selectedAgentId: 'everyaios-native',
      selectedModelId: 'claude-sonnet-4.5',
      selectedModelProvider: undefined,
      liveAgents: [NATIVE],
      activeSessionId: null,
      sessions: [],
      autoRoute: false,
      devMode: true,
    })
    mounted = await mount(<StatusBar />)

    const body = mounted.container.textContent ?? ''
    expect(body).toContain('Sonnet 4.5')
    // A curated pick is not provider-qualified: nothing may claim a provider
    // endpoint the send path would never use.
    expect(body).not.toContain('openrouter ·')
  })

  test('claims no model when no live runtime is usable', async () => {
    installShell()
    await setState({
      selectedAgentId: 'everyaios-native',
      selectedModelId: 'anthropic/claude-sonnet-4',
      selectedModelProvider: 'openrouter',
      liveAgents: [],
      activeSessionId: null,
      sessions: [],
      autoRoute: false,
      devMode: true,
    })
    mounted = await mount(<StatusBar />)

    // The model block is gated on a usable agent row: without one the bar must
    // not paint a model the runtime cannot be shown to serve.
    expect(mounted.container.textContent ?? '').not.toContain('openrouter · anthropic/claude-sonnet-4')
  })
})
