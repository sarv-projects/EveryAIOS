// P71.2a/P71.2d — Settings renders one agent surface, and every row is external.
//
// The product contract is one primary Settings surface for agent/runtime
// management (ARCH/12): there is no "Native models" peer tab, no built-in runtime
// card, and no "EveryAIOS Native model catalog" disclosure — because EveryAIOS
// owns no model surface at all and ships no built-in agent in v1 (ADR-0005 §1).

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import type { ReactElement } from 'react'
import { installShell, mount, registerDom, removeShell, unregisterDom, waitFor, withAct, type Mounted } from '@/test/dom-harness'
import { useAppStore } from '@/lib/store'
import { AGENTS } from '@/lib/agents'

let Section: () => ReactElement
let mounted: Mounted

const EXTERNAL = AGENTS.find((a) => a.id === 'claude-code')!

beforeAll(async () => {
  registerDom()
  Section = (await import('./agents-models-section')).default
})

afterAll(() => {
  unregisterDom()
})

beforeEach(async () => {
  // Register the capability row the surface fetches on mount. Left unregistered,
  // the harness answers `{}` — which is a partial row, and must render, not throw.
  installShell({
    settings_agent_get: () => ({
      agentId: 'claude-code',
      installed: true,
      protocol: 'acp',
      authMode: 'subscription',
      nativeCapabilities: ['chat', 'tools'],
      sharedCapabilities: [],
      modelOwner: 'agent',
      configOptions: [],
      readiness: 'ready',
      location: { kind: 'path', source: 'path', executable: 'claude', version: '1.2.3' },
      sessionLoadout: [],
    }),
  })
  await withAct(() =>
    useAppStore.setState({
      selectedAgentId: 'claude-code',
      selectedModelId: '',
      selectedModelProvider: undefined,
      liveAgents: [{ ...EXTERNAL, status: 'installed', version: '1.2.3' }],
      acpConfigOptions: {},
    }),
  )
  mounted = await mount(<Section />)
})

afterEach(() => {
  // A mount that throws must surface that error, not a secondary crash here.
  mounted?.unmount()
  removeShell()
})

describe('P71.2a — Settings renders one agent surface with no built-in row', () => {
  test('the only peer tabs are Runtimes and Routing', async () => {
    await waitFor(() => mounted.container.querySelector('[role="tablist"]') !== null)

    const tabs = Array.from(mounted.container.querySelectorAll('[role="tab"]')).map(
      (t) => (t.textContent ?? '').trim(),
    )
    expect(tabs).toEqual(['Runtimes', 'Routing'])
    // Neither the old peer "Native models" tab nor a built-in runtime card
    // exists in v1.
    expect(tabs).not.toContain('Native models')
    const body = mounted.container.textContent ?? ''
    expect(body).not.toContain('EveryAIOS Native')
    expect(body).not.toContain('native-catalog-toggle')
  })

  test('a partial capability row renders instead of throwing', async () => {
    // Regression: the shell can answer with a row that predates the
    // capability fields (or a probe that failed). Rendering it must degrade,
    // not crash the whole panel.
    mounted.unmount()
    installShell({ settings_agent_get: () => ({}) })
    mounted = await mount(<Section />)

    await waitFor(() => mounted.container.querySelector('[role="tablist"]') !== null)
    expect((mounted.container.textContent ?? '').includes('Agent capabilities')).toBe(true)
  })

  test('an undiscovered machine says nothing can run, rather than offering a built-in', async () => {
    mounted.unmount()
    await withAct(() => useAppStore.setState({ liveAgents: [] }))
    mounted = await mount(<Section />)

    await waitFor(() => mounted.container.querySelector('[role="tablist"]') !== null)
    const body = mounted.container.textContent ?? ''
    // The discovery warning is explicit that an empty list is not occupancy…
    expect(body).toContain('not occupancy')
    // …and nothing is painted as an always-available runtime.
    expect(body).not.toContain('EveryAIOS Native')
    expect(body).not.toContain('always live')
  })
})
