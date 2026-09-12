// P60 — model ownership boundary.
//
// EveryAIOS Native is the only runtime that owns EveryAIOS's provider/model
// surface (models.dev + BYOK + local). Every other runtime is an external ACP
// agent that owns its own model, authentication, and routing, and may expose
// its own session vocabulary over ACP `configOptions` — never EveryAIOS's.
//
// These tests pin the two failure modes that made the old picker dishonest:
// (1) rendering a curated Native model list as if it controlled an external
// agent, and (2) letting a model selection silently not reach that agent.

import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import {
  AGENTS,
  NATIVE_AGENT_ID,
  getModelsForAgentLive,
  isNativeRuntime,
  modelsForUsableRuntimes,
  type AgentRuntime,
} from './agents'
import { useAppStore } from './store'

const NATIVE = AGENTS.find((a) => a.id === NATIVE_AGENT_ID)!
const EXTERNAL = AGENTS.find((a) => a.id === 'claude-code')!

// bun's runner shares the module registry across test files, so the store
// mutations below must not leak into other suites (which assume the default
// Native selection and an empty live catalog).
afterAll(() => {
  useAppStore.setState({
    selectedAgentId: NATIVE_AGENT_ID,
    selectedModelId: 'claude-sonnet-4.5',
    selectedModelProvider: undefined,
    liveAgents: [],
    autoRoute: false,
  })
})

/** An external runtime that discovery verified on this machine. */
function installed(a: AgentRuntime): AgentRuntime {
  return { ...a, status: 'installed', path: '/usr/local/bin/claude', version: '1.2.3' }
}

describe('P60 — Native owns the provider/model catalog', () => {
  test('only the builtin runtime is Native', () => {
    expect(isNativeRuntime(NATIVE_AGENT_ID)).toBe(true)
    expect(isNativeRuntime('claude-code')).toBe(false)
    expect(isNativeRuntime('opencode')).toBe(false)
    expect(isNativeRuntime(undefined)).toBe(false)
  })

  test('Native keeps its curated model rows while installed', () => {
    const models = getModelsForAgentLive(NATIVE_AGENT_ID, [installed(NATIVE)])
    expect(models.length).toBeGreaterThan(0)
    expect(models.map((m) => m.id)).toEqual(NATIVE.models)
  })

  test('an installed external agent exposes NO curated Native models', () => {
    // The curated ids describe providers that agent never receives; rendering
    // them would claim control EveryAIOS does not have.
    expect(getModelsForAgentLive('claude-code', [installed(EXTERNAL)])).toEqual([])
    expect(getModelsForAgentLive('opencode', [installed({ ...EXTERNAL, id: 'opencode' })])).toEqual([])
  })

  test('nothing is offered for an uninstalled external runtime', () => {
    expect(getModelsForAgentLive('claude-code', [EXTERNAL])).toEqual([])
    expect(modelsForUsableRuntimes([EXTERNAL])).toEqual([])
  })

  test('Native is always live, whatever the seed status says', () => {
    // Native ships inside EveryAIOS — a stale seed status must not hide it.
    expect(getModelsForAgentLive(NATIVE_AGENT_ID, [{ ...NATIVE, status: 'available' }])).toEqual(
      getModelsForAgentLive(NATIVE_AGENT_ID, [installed(NATIVE)]),
    )
  })

  test('the aggregate catalog surface never mixes external seeds in', () => {
    const rows = modelsForUsableRuntimes([installed(NATIVE), installed(EXTERNAL)])
    // Curated external ids (e.g. claude-opus-4.1) appear only because Native
    // also lists them — the count must equal Native's own curated set.
    expect(rows.map((m) => m.id).sort()).toEqual([...NATIVE.models].sort())
  })
})

describe('P60 — selecting an agent never smuggles a Native pin across', () => {
  beforeEach(() => {
    useAppStore.setState({
      selectedAgentId: NATIVE_AGENT_ID,
      selectedModelId: 'claude-sonnet-4.5',
      selectedModelProvider: 'anthropic',
      liveAgents: [],
    })
  })

  test('external selection leaves the Native pin untouched', () => {
    useAppStore.getState().setSelectedAgent('claude-code')
    const st = useAppStore.getState()
    expect(st.selectedAgentId).toBe('claude-code')
    // The pin is preserved (not snapped to the external agent's curated
    // default) so that returning to Native restores the exact same choice
    // and nothing is displayed as if it governed the external agent.
    expect(st.selectedModelId).toBe('claude-sonnet-4.5')
    expect(st.selectedModelProvider).toBe('anthropic')
  })

  test('returning to Native keeps the preserved pin', () => {
    const st = useAppStore.getState()
    st.setSelectedAgent('claude-code')
    st.setSelectedAgent(NATIVE_AGENT_ID)
    expect(useAppStore.getState().selectedModelId).toBe('claude-sonnet-4.5')
  })

  test('a runtime known only from live discovery is selectable', () => {
    // A freshly refreshed ACP registry row has no static seed entry; refusing
    // it would make the dynamic catalog unusable.
    useAppStore.setState({
      liveAgents: [
        {
          ...EXTERNAL,
          id: 'crow-cli',
          name: 'Crow CLI',
          status: 'installed',
          models: [],
          defaultModel: '',
        },
      ],
    })
    useAppStore.getState().setSelectedAgent('crow-cli')
    expect(useAppStore.getState().selectedAgentId).toBe('crow-cli')
  })

  test('an unknown id is still refused fail-closed', () => {
    useAppStore.getState().setSelectedAgent('no-such-agent')
    expect(useAppStore.getState().selectedAgentId).toBe(NATIVE_AGENT_ID)
  })

  test('variant cycling is a Native-only affordance', () => {
    useAppStore.setState({ selectedAgentId: 'claude-code' })
    expect(useAppStore.getState().cycleModelVariant(1)).toBeUndefined()
  })
})
