// P53.4 handoff bundle + P53.8 `@` file refs: the live compacted view the new
// Chief receives (never the raw disk history), and the `@path` splitter.

import { describe, expect, test } from 'bun:test'
import { useAppStore } from './store'
import { buildChiefHandoff } from './chief-handoff'
import { splitAtRefs } from './at-refs'

function seedHandoffSession() {
  const id = `handoff-${Date.now()}`
  useAppStore.setState({
    sessions: [
      {
        id,
        title: 'handoff test',
        status: 'idle',
        preview: '',
        updatedAt: new Date().toISOString(),
        messages: [
          { id: 'm1', role: 'user', content: 'Fix the parser', timestamp: new Date().toISOString() },
          {
            id: 'm2',
            role: 'assistant',
            content: 'Done <tool_result>giant blob that must not ride</tool_result> shipped.',
            timestamp: new Date().toISOString(),
          },
        ],
        goal: 'Ship the parser',
      },
    ],
    activeSessionId: id,
    sessionChiefs: {},
    pendingPlan: undefined,
    soulId: 'default',
    scopedDoc: undefined,
  } as Parameters<typeof useAppStore.setState>[0])
  return id
}

describe('P53.4 buildChiefHandoff — compact-before-swap bundle', () => {
  test('bundles compacted transcript + goal, strips tool blobs', () => {
    const id = seedHandoffSession()
    const bundle = buildChiefHandoff(id)
    expect(bundle).not.toBeNull()
    expect(bundle!).toContain('Fix the parser')
    expect(bundle!).toContain('Ship the parser')
    expect(bundle!).not.toContain('giant blob that must not ride')
    expect(bundle!).toContain('[tool result snipped]')
  })

  test('empty session with no goal/plan returns null (nothing to hand off)', () => {
    const id = `empty-${Date.now()}`
    useAppStore.setState({
      sessions: [{ id, title: 'empty', status: 'idle', preview: '', updatedAt: new Date().toISOString(), messages: [] }],
      activeSessionId: id,
      sessionChiefs: {},
      pendingPlan: undefined,
      soulId: 'default',
      scopedDoc: undefined,
    } as Parameters<typeof useAppStore.setState>[0])
    expect(buildChiefHandoff(id)).toBeNull()
    expect(buildChiefHandoff('no-such-session')).toBeNull()
  })
})

describe('P53.8 splitAtRefs — `@` file refs as path refs', () => {
  test('extracts @paths and leaves clean text', () => {
    const { clean, refs } = splitAtRefs('review @src/main.rs and @docs/spec.md please')
    expect(refs).toEqual(['src/main.rs', 'docs/spec.md'])
    expect(clean).not.toContain('@src/main.rs')
    expect(clean).toContain('review')
  })

  test('plain text has no refs', () => {
    const { clean, refs } = splitAtRefs('hello world')
    expect(refs).toEqual([])
    expect(clean).toBe('hello world')
  })
})
