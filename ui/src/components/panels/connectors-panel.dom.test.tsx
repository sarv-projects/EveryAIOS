import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import type { ReactElement } from 'react'
import { installShell, mount, registerDom, removeShell, tick, unregisterDom, waitFor, withAct, type Mounted } from '@/test/dom-harness'
import { useAppStore } from '@/lib/store'
import type { StoreEntry } from '@/lib/mcp'

type GroupFn = typeof import('./connectors-panel')['groupStoreEntries']
type ActionFn = typeof import('./connectors-panel')['storeActionLabel']
type Panel = () => ReactElement

let groupStoreEntries: GroupFn
let storeActionLabel: ActionFn
let ConnectorsPanel: Panel
let mounted: Mounted
let originalMatchMedia: typeof window.matchMedia

const entries: StoreEntry[] = [
  {
    id: 'ready',
    kind: 'connector',
    name: 'Ready service',
    description: 'A connected service.',
    url: 'https://private.example/ready',
    flow: 'pkce',
    vaultProvider: 'ready-provider',
    toolHint: 3,
    scopesPlain: ['Read your service'],
    canMutate: false,
    indexesIntoMemory: false,
  },
  {
    id: 'signin',
    kind: 'remote-mcp',
    name: 'Sign-in service',
    description: 'A service that needs your sign-in.',
    url: 'https://private.example/signin',
    flow: 'device-code',
    vaultProvider: 'signin-provider',
    toolHint: 4,
    scopesPlain: ['Read your service'],
    canMutate: false,
    indexesIntoMemory: false,
  },
  {
    id: 'available',
    kind: 'connector',
    name: 'Key service',
    description: 'A service that becomes available after key setup.',
    url: null,
    flow: 'api-key',
    vaultProvider: 'key-provider',
    toolHint: 0,
    scopesPlain: ['Use your key'],
    canMutate: false,
    indexesIntoMemory: false,
  },
]

beforeAll(async () => {
  registerDom()
  originalMatchMedia = window.matchMedia
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
  })
  const module = await import('./connectors-panel')
  ConnectorsPanel = module.default
  groupStoreEntries = module.groupStoreEntries
  storeActionLabel = module.storeActionLabel
})

afterAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: originalMatchMedia,
  })
  unregisterDom()
})

beforeEach(async () => {
  await withAct(() => useAppStore.setState({ powerMode: false }))
})

afterEach(async () => {
  mounted?.unmount()
  await tick()
  removeShell()
})

describe('connector grouping', () => {
  test('orders rows as Ready, Needs sign-in, and Available', () => {
    const grouped = groupStoreEntries(
      entries,
      new Set(['ready']),
      { signin: 'status check failed' },
    )
    expect(grouped.Ready.map((row) => row.entry.id)).toEqual(['ready'])
    expect(grouped['Needs sign-in'].map((row) => row.entry.id)).toEqual(['signin'])
    expect(grouped.Available.map((row) => row.entry.id)).toEqual(['available'])
    expect(grouped['Needs sign-in'][0]?.error).toBe('status check failed')
    expect(storeActionLabel(entries[0]!, true)).toBe('Reconnect')
    expect(storeActionLabel(entries[1]!, false, 'status check failed')).toBe('Reconnect')
    expect(storeActionLabel(entries[2]!, false)).toBe('Add key')
  })

  test('casual mode renders the three action groups and hides technical connection data', async () => {
    removeShell()
    mounted = await mount(<ConnectorsPanel />)
    await waitFor(() => (mounted.container.textContent ?? '').includes('Needs sign-in'))

    const body = mounted.container.textContent ?? ''
    expect(body).toContain('Ready')
    expect(body).toContain('Needs sign-in')
    expect(body).toContain('Available')
    expect(body).toContain('Grouped by what you can do next')
    expect(body).not.toContain('MCP Servers')
    expect(body).not.toContain('Tool Catalog')
    expect(body).not.toContain('model-context-protocol')
    expect(body).not.toContain('private.example')
  })

  test('a failed probe stays visible with a reconnect action', async () => {
    installShell({
      store_catalog: () => [entries[1]],
      oauth_status: () => ({ enabled: false, providers: [] }),
      oauth_accounts: () => ({ accounts: [] }),
      mcp_remote_status: () => {
        throw new Error('status check failed')
      },
      mcp_catalog: () => ({ total: 0, browser: 0, storage: 0, read_only: 0, open_world: 0, tools: [] }),
      mcp_servers: () => [],
      mcp_external_tools: () => ({ native: 0, external: 0, total: 0, agentVisible: false, tools: [] }),
      settings_connections_list: () => ({ connections: [] }),
    })
    mounted = await mount(<ConnectorsPanel />)
    await waitFor(() => (mounted.container.textContent ?? '').includes('Needs attention'))

    const body = mounted.container.textContent ?? ''
    expect(body).toContain('Connection check failed — try reconnecting.')
    expect(body).toContain('Reconnect')
    expect(body).not.toContain('status check failed')
    expect(body).not.toContain('connected')
  })
})
