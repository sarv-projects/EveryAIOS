// P60 — the model surface belongs to the EveryAIOS Native agent.
//
// The product contract is one primary Settings surface for agent/runtime
// management (ARCH/12 + the 2026-09-12 model-ownership decision): "Native
// models" must not be a peer tab next to Runtimes, because outside Native that
// table governs nothing. These tests pin the layout: two tabs (Runtimes /
// Routing), and the Native catalog rendered *inside* the runtimes surface.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import type { ReactElement } from 'react'
import { click, installShell, mount, registerDom, removeShell, unregisterDom, waitFor, withAct, type Mounted } from '@/test/dom-harness'
import { useAppStore } from '@/lib/store'
import { AGENTS } from '@/lib/agents'

let Section: () => ReactElement
let mounted: Mounted

beforeAll(async () => {
  registerDom()
  Section = (await import('./agents-models-section')).default
})

afterAll(() => {
  unregisterDom()
})

beforeEach(async () => {
  installShell()
  await withAct(() =>
    useAppStore.setState({
      selectedAgentId: 'everyaios-native',
      selectedModelId: 'claude-sonnet-4.5',
      selectedModelProvider: undefined,
      liveAgents: [AGENTS.find((a) => a.id === 'everyaios-native')!],
      acpConfigOptions: {},
    }),
  )
  mounted = await mount(<Section />)
})

afterEach(() => {
  mounted.unmount()
  removeShell()
})

describe('P60 — Settings renders one agent surface', () => {
  test('the only peer tabs are Runtimes and Routing', async () => {
    await waitFor(() => mounted.container.querySelector('[role="tablist"]') !== null)

    const tabs = Array.from(mounted.container.querySelectorAll('[role="tab"]')).map(
      (t) => (t.textContent ?? '').trim(),
    )
    expect(tabs).toEqual(['Runtimes', 'Routing'])
    // The old peer "Native models" tab is gone.
    expect(tabs).not.toContain('Native models')
  })

  test('the Native model catalog is a disclosure on the Native card', async () => {
    await waitFor(() => mounted.container.querySelector('[data-testid="native-catalog-toggle"]') !== null)
    const toggle = mounted.container.querySelector<HTMLButtonElement>(
      '[data-testid="native-catalog-toggle"]',
    )
    expect(toggle).not.toBeNull()
    expect(toggle?.getAttribute('aria-expanded')).toBe('false')
    // Collapsed by default: no model table until the user asks for it.
    expect(mounted.container.querySelector('th')).toBeNull()

    if (!toggle) return
    await click(toggle)

    const ok = await waitFor(() =>
      (mounted.container.textContent ?? '').includes('the only runtime this table governs'),
    )
    expect(ok).toBe(true)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    const headers = Array.from(mounted.container.querySelectorAll('th')).map((th) =>
      (th.textContent ?? '').trim(),
    )
    expect(headers).toContain('Model')
    expect(headers).toContain('In / 1M')

    // …and it collapses again.
    await click(toggle)
    await waitFor(() => mounted.container.querySelector('th') === null)
    expect(mounted.container.querySelector('th')).toBeNull()
  })
})
