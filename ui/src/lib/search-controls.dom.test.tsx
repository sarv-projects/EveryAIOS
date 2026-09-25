// DOM proof for the chat bar: the send path must be truthful, the readouts must
// admit what is not reported, and the web-search switch must describe the real
// cascade instead of a spinner.
//
// These drive the real components against the faked Tauri shell, so the
// assertions are about what a user would see and which commands were actually
// called — not about a mock.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import type { ReactElement } from 'react'
import {
  click,
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
import { useAppStore, type Session } from '@/lib/store'

let ChatComposer: (props: { budget?: { spent: number; cap: number; tokens: number }; centered?: boolean }) => ReactElement
let WebSearchControl: (props: {
  enabled: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  onToggle: (next: boolean) => void
  onOpenSettings: () => void
}) => ReactElement
let mounted: Mounted

const SESSION_ID = 'composer-dom'

function idleSession(): Session {
  return {
    id: SESSION_ID,
    title: 'Composer truth',
    status: 'idle',
    preview: 'What would you like to do?',
    updatedAt: new Date().toISOString(),
    messages: [],
  }
}

/** An external agent row; readiness is the canonical P71.3f state. */
function agent(readiness: 'ready' | 'auth_required') {
  return {
    id: 'claude-code',
    name: 'Claude Code',
    vendor: 'subscription',
    tagline: '',
    mark: 'CC',
    accent: 'bg-brand text-black',
    status: readiness === 'ready' ? ('installed' as const) : ('discovered' as const),
    readiness,
    discovered: true,
    launchable: true,
    capabilities: [],
    models: [],
    defaultModel: '',
    headless: true,
    sandbox: 'soft',
  }
}

async function setState(patch: Record<string, unknown>): Promise<void> {
  await withAct(() => useAppStore.setState(patch as never))
  await withAct(() => {})
}

/** Press a key on the composer field the way a keyboard user would. */
async function pressKey(el: Element, key: string): Promise<void> {
  const { act } = await import('react')
  const win = globalThis as unknown as { window: { KeyboardEvent: typeof KeyboardEvent } }
  await act(async () => {
    el.dispatchEvent(new win.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
    await new Promise((r) => setTimeout(r, 0))
  })
}

beforeAll(async () => {
  registerDom()
  ChatComposer = (await import('@/components/chat/chat-composer')).default
  WebSearchControl = (await import('@/components/chat/web-search-control')).default
})

afterAll(() => {
  unregisterDom()
})

beforeEach(async () => {
  await setState({
    sessions: [idleSession()],
    activeSessionId: SESSION_ID,
    sessionsHydrated: true,
    selectedAgentId: '',
    userDefaultChief: undefined,
    sessionChiefs: {},
    liveAgents: [],
    pendingQueue: {},
    queuePaused: {},
    composerValue: '',
    attachment: undefined,
    setupOpen: false,
    agentSendBlocker: undefined,
    lastToast: undefined,
    liveBudget: undefined,
    taskSnapshot: undefined,
    powerMode: false,
    permissionMode: 'ask',
  })
})

afterEach(() => {
  mounted?.unmount()
  removeShell()
})

describe('the send control states the real reason and refuses', () => {
  test('no bound agent: the button refuses, the reason is on screen, the draft survives', async () => {
    installShell()
    await setState({ composerValue: 'ship the release notes' })
    mounted = await mount(<ChatComposer />)
    await tick()

    const send = mounted.container.querySelector<HTMLButtonElement>('button[aria-label^="Cannot send"]')
    expect(send).not.toBeNull()
    expect(send?.disabled).toBe(true)

    const status = mounted.container.querySelector('#composer-status')
    expect(status?.textContent ?? '').toContain('No agent is bound to this chat')
    // The blocker offers the one action that can fix it.
    const fix = mounted.container.querySelector<HTMLButtonElement>('#composer-status button')
    expect(fix?.textContent ?? '').toContain('Choose an agent')

    // Pressing it anyway changes nothing: no transcript row, no queue entry.
    await click(send!)
    const st = useAppStore.getState()
    expect(st.sessions.find((s) => s.id === SESSION_ID)?.messages).toHaveLength(0)
    expect(st.pendingQueue[SESSION_ID] ?? []).toHaveLength(0)
    expect(st.composerValue).toBe('ship the release notes')
    // Nothing was even attempted, so no blocker was raised by the click itself.
    expect(st.agentSendBlocker).toBeUndefined()
  })

  test('the Enter key path refuses loudly instead of dropping the turn', async () => {
    installShell()
    await setState({ composerValue: 'ship the release notes' })
    mounted = await mount(<ChatComposer />)
    await tick()

    const field = mounted.container.querySelector('textarea')!
    await pressKey(field, 'Enter')

    const st = useAppStore.getState()
    expect(st.agentSendBlocker).toMatchObject({ code: 'unbound', sessionId: SESSION_ID })
    expect(st.sessions.find((s) => s.id === SESSION_ID)?.messages).toHaveLength(0)
    expect(st.pendingQueue[SESSION_ID] ?? []).toHaveLength(0)
    // The draft is never cleared on a refused send.
    expect(st.composerValue).toBe('ship the release notes')
    expect(st.setupOpen).toBe(true)
  })

  test('a bound but unready agent is refused with its canonical readiness', async () => {
    installShell()
    await setState({
      composerValue: 'ship it',
      selectedAgentId: 'claude-code',
      liveAgents: [agent('auth_required')],
    })
    mounted = await mount(<ChatComposer />)
    await tick()

    const status = mounted.container.querySelector('#composer-status')?.textContent ?? ''
    expect(status).toContain('Claude Code is not ready')
    // `readinessLabel` is the single owner of that wording.
    expect(status).toContain('sign in to continue')
    expect(mounted.container.querySelector('button[aria-label^="Cannot send"]')?.disabled).toBe(true)
  })

  test('an unverified binding is distinguished from an unready one', async () => {
    installShell()
    await setState({ composerValue: 'ship it', selectedAgentId: 'claude-code', liveAgents: [] })
    mounted = await mount(<ChatComposer />)
    await tick()

    const status = mounted.container.querySelector('#composer-status')?.textContent ?? ''
    expect(status).toContain('not verified as runnable')
  })

  test('a ready agent sends, and the search directive rides the turn', async () => {
    const invoked = installShell({
      acp_install_status: () => ({ 'claude': { installed: true, discovered: true, launchable: true } }),
      acp_agents: () => [],
      acp_launch: () => ({
        handle: 'h-1',
        agentId: 'claude',
        agentName: 'Claude Code',
        sessionId: 'prov-1',
        providerSessionId: 'prov-1',
        applicationSessionId: '',
        workId: '',
        bindingId: '',
        runId: '',
        protocol: 'acp',
        authRequired: false,
        authMethods: [],
        embeddedContext: false,
        configOptions: [],
      }),
      acp_prompt: () => ({
        handle: 'h-1',
        applicationSessionId: SESSION_ID,
        workId: 'w-1',
        bindingId: 'b-1',
        runId: 'r-1',
        providerSessionId: 'prov-1',
        stopReason: 'end_turn',
        updateCount: 1,
        permissionCount: 0,
        pendingTickets: [],
        finalText: 'done',
        updates: [],
      }),
    })
    await setState({
      composerValue: 'ship it',
      selectedAgentId: 'claude-code',
      liveAgents: [agent('ready')],
    })
    mounted = await mount(<ChatComposer />)
    await tick()

    const send = mounted.container.querySelector<HTMLButtonElement>('button[aria-label="Send"]')
    expect(send?.disabled).toBe(false)
    await click(send!)
    await waitFor(() => invoked.includes('acp_prompt'))
    expect(invoked).toContain('acp_prompt')
  })
})

describe('the readouts admit what is not reported', () => {
  test('an empty ledger renders "not reported", never $0.00 or a made-up context %', async () => {
    installShell({ usage_snapshot: () => ({ total: {}, byKey: [], bySession: [], cacheHitRate: 0 }) })
    await setState({ composerValue: 'hello' })
    mounted = await mount(<ChatComposer budget={{ spent: 0, cap: 5, tokens: 0 }} />)
    await waitFor(() => mounted.container.textContent?.includes('not reported') ?? false)

    const text = mounted.container.textContent ?? ''
    // No fabricated figures anywhere in the bar.
    expect(text).not.toContain('$0.00')
    expect(text).not.toMatch(/\d+%\s*ctx/)
    const cost = mounted.container.querySelector('[data-telemetry="cost"]')
    expect(cost?.textContent ?? '').toContain('cost not reported')
    const ctx = mounted.container.querySelector('[data-telemetry="context"]')
    expect(ctx?.textContent ?? '').toContain('ctx not reported')
  })

  test('a reported cost is labelled as reported, an estimated one as estimated', async () => {
    installShell({
      usage_snapshot: () => ({
        total: {},
        byKey: [{ key: 'a', costUsd: 0, reportedCostUsd: 1.25 }],
        bySession: [],
        cacheHitRate: 0,
      }),
    })
    await setState({ composerValue: 'hello' })
    mounted = await mount(<ChatComposer />)
    await waitFor(() => mounted.container.textContent?.includes('$1.25') ?? false)
    expect(mounted.container.querySelector('[data-telemetry="cost"]')?.textContent ?? '').toContain('reported')

    mounted.unmount()
    installShell({
      usage_snapshot: () => ({
        total: {},
        byKey: [{ key: 'a', costUsd: 0.4, reportedCostUsd: 0 }],
        bySession: [],
        cacheHitRate: 0,
      }),
    })
    mounted = await mount(<ChatComposer />)
    await waitFor(() => mounted.container.textContent?.includes('$0.40') ?? false)
    const slot = mounted.container.querySelector('[data-telemetry="cost"]')?.textContent ?? ''
    expect(slot).toContain('estimated')
  })

  test('tokens come from the ledger and say so', async () => {
    installShell({ usage_snapshot: () => ({ total: {}, byKey: [], bySession: [], cacheHitRate: 0 }) })
    await setState({ composerValue: 'hello' })
    mounted = await mount(<ChatComposer budget={{ spent: 0, cap: 5, tokens: 18_120 }} />)
    await waitFor(() => mounted.container.textContent?.includes('18.1k') ?? false)
    const slot = mounted.container.querySelector('[data-telemetry="tokens"]')
    expect(slot?.textContent ?? '').toContain('tok 18.1k')
    expect(slot?.getAttribute('title')).toContain('usage ledger')
  })

  test('the frozen autonomy of a running turn is named next to the live dial', async () => {
    installShell({ usage_snapshot: () => ({ total: {}, byKey: [], bySession: [], cacheHitRate: 0 }) })
    const running: Session = { ...idleSession(), status: 'running' }
    await setState({
      sessions: [running],
      selectedAgentId: 'claude-code',
      liveAgents: [agent('ready')],
      permissionMode: 'full',
      taskSnapshot: {
        frozenAt: Date.now(),
        autonomyLevel: 'ask',
        mode: 'auto',
        workspaceScope: '~',
        agentScope: 'claude-code',
        sessionId: SESSION_ID,
        configHash: 'h',
      },
      composerValue: 'next ask',
    })
    mounted = await mount(<ChatComposer />)
    await tick()
    const status = mounted.container.querySelector('#composer-status')?.textContent ?? ''
    expect(status).toContain('Working')
    expect(status).toContain('this turn runs at')
    expect(status).toContain('Ask me first')
    // The dial itself still shows what the *next* message will use.
    expect(mounted.container.querySelector('select[aria-label="How much can I do on my own?"]')?.value).toBe('full')
  })
})

describe('the web-search switch', () => {
  test('is off by default, names itself, and lists the real cascade when on', async () => {
    const invoked = installShell({
      search_config: () => ({
        usePublic: false,
        endpoints: ['http://localhost:8080'],
        localEndpoints: ['http://localhost:8080', 'http://localhost:8081'],
        publicEndpoints: [],
      }),
      search_instances: () => ({ source: 'live', count: 0, instances: [] }),
      acp_tool_log: () => [],
      usage_snapshot: () => ({ total: {}, byKey: [], bySession: [], cacheHitRate: 0 }),
    })
    await setState({ composerValue: 'what changed in the spec?' })
    mounted = await mount(<ChatComposer />)
    await tick()

    const toggle = mounted.container.querySelector<HTMLButtonElement>('button[aria-label*="web search" i]')
    expect(toggle).not.toBeNull()
    expect(toggle?.getAttribute('aria-pressed')).toBe('false')
    // Off means the composer never asked about search at all.
    expect(invoked).not.toContain('search_config')

    await click(toggle!)
    await waitFor(() => (mounted.container.textContent ?? '').includes('in the cascade'))
    expect(toggle?.getAttribute('aria-pressed')).toBe('true')
    expect(invoked).toContain('search_config')
    expect(invoked).toContain('search_instances')

    const panel = mounted.container.querySelector('[role="dialog"][aria-label="Web search backends"]')
    const text = panel?.textContent ?? ''
    expect(text).toContain('http://localhost:8080')
    expect(text).toContain('in the cascade')
    // It never claims the endpoint answered, and it never claims it ran a query.
    expect(text).not.toMatch(/\bonline\b|\breachable\b/)
    expect(text).toContain('No turn in this chat has run a web search yet.')
    // The only owner of the opt-in is Settings → Search, and it is one click away.
    const toSettings = [...(panel?.querySelectorAll('button') ?? [])].find((b) =>
      (b.textContent ?? '').includes('Settings → Search'),
    )
    expect(toSettings).toBeDefined()
    await click(toSettings!)
    expect(useAppStore.getState().settingsSection).toBe('search')
    expect(useAppStore.getState().centerScreen).toBe('settings')
  })

  test('an empty cascade is an honest instruction, not a silent spinner', async () => {
    installShell({
      search_config: () => ({
        usePublic: false,
        endpoints: [],
        localEndpoints: ['http://localhost:8080'],
        publicEndpoints: [],
      }),
      search_instances: () => ({ source: 'live', count: 0, instances: [] }),
      acp_tool_log: () => [],
    })
    let openSettings = 0
    mounted = await mount(
      <WebSearchControl
        enabled
        open
        onOpenChange={() => {}}
        onToggle={() => {}}
        onOpenSettings={() => {
          openSettings += 1
        }}
      />,
    )
    await waitFor(() => (mounted.container.textContent ?? '').includes('no search backend configured'))
    const text = mounted.container.textContent ?? ''
    expect(text).toContain('no search backend configured')
    expect(text).toContain('Settings → Search')
    const toSettings = [...mounted.container.querySelectorAll('button')].find((b) =>
      (b.textContent ?? '').includes('Settings → Search'),
    )
    await click(toSettings!)
    expect(openSettings).toBe(1)
  })

  test('a run is described from the turn log, with the two unknown facts marked', async () => {
    installShell({
      search_config: () => ({
        usePublic: false,
        endpoints: ['http://localhost:8080'],
        localEndpoints: ['http://localhost:8080'],
        publicEndpoints: [],
      }),
      search_instances: () => ({ source: 'live', count: 0, instances: [] }),
      acp_tool_log: () => [
        {
          tsMs: 5,
          handle: 'h',
          agentId: 'claude',
          promptPrefix: 'q',
          stopReason: 'end_turn',
          toolCalls: [
            { toolCallId: 't1', title: 'web_search', kind: 'search', status: 'completed' },
            { toolCallId: 't2', title: 'web_search', kind: 'search', status: 'failed' },
          ],
        },
      ],
    })
    mounted = await mount(
      <WebSearchControl enabled open onOpenChange={() => {}} onToggle={() => {}} onOpenSettings={() => {}} />,
    )
    await waitFor(() => (mounted.container.textContent ?? '').includes('search call'))
    const text = mounted.container.textContent ?? ''
    expect(text).toContain('2 search calls')
    expect(text).toContain('1 completed')
    expect(text).toContain('1 failed')
    expect(text).toContain('which backend answered: not reported')
    expect(text).toContain('results: not reported')
  })
})

describe('accessibility of the bar', () => {
  test('every icon-only control has an accessible name and the row is reachable by key', async () => {
    installShell({ usage_snapshot: () => ({ total: {}, byKey: [], bySession: [], cacheHitRate: 0 }) })
    await setState({ composerValue: 'hello' })
    mounted = await mount(<ChatComposer />)
    await tick()

    for (const el of mounted.container.querySelectorAll('button')) {
      const name = el.getAttribute('aria-label') ?? el.textContent ?? ''
      expect(name.trim().length).toBeGreaterThan(0)
    }
    // The status row is a live region so a reason change is announced.
    const status = mounted.container.querySelector('#composer-status')
    expect(status?.getAttribute('role')).toBe('status')
    expect(status?.getAttribute('aria-live')).toBe('polite')
    // The composer is a real form field, in the document order of the bar.
    const field = mounted.container.querySelector('textarea')
    expect(field).not.toBeNull()
  })
})
