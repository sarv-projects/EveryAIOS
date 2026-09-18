import { describe, expect, test } from 'bun:test'
import {
  dagFromWire,
  layoutCuaDag,
  previewRemainingEdit,
  readyFrontier,
  userMayEditRemaining,
  type CuaDag,
} from './cua-dag'

function dag(over: Partial<CuaDag> = {}): CuaDag {
  return {
    runId: 'r1',
    workId: 'w1',
    replanSeq: 0,
    nodes: [
      { id: 'a', name: 'open', dependsOn: [], status: 'verified' },
      { id: 'b', name: 'click', dependsOn: ['a'], status: 'pending' },
      { id: 'c', name: 'type', dependsOn: ['b'], status: 'pending' },
    ],
    ...over,
  }
}

describe('P59.8 CUA DAG layout (MACU ready-frontier)', () => {
  test('ready frontier is pending whose deps are verified', () => {
    expect(readyFrontier(dag())).toEqual(['b'])
    expect(userMayEditRemaining('verified')).toBe(false)
    expect(userMayEditRemaining('pending')).toBe(true)
    expect(userMayEditRemaining('halted')).toBe(true)
  })

  test('layout places dependents to the right and draws edges', () => {
    const lay = layoutCuaDag(dag())
    const a = lay.nodes.find((n) => n.id === 'a')!
    const b = lay.nodes.find((n) => n.id === 'b')!
    const c = lay.nodes.find((n) => n.id === 'c')!
    expect(a.depth).toBe(0)
    expect(b.depth).toBe(1)
    expect(c.depth).toBe(2)
    expect(b.x).toBeGreaterThan(a.x)
    expect(c.x).toBeGreaterThan(b.x)
    expect(lay.edges).toEqual([
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
    ])
    expect(lay.readyIds).toEqual(['b'])
    expect(a.editable).toBe(false)
    expect(b.editable).toBe(true)
  })

  test('user edit of a verified node is refused; remaining bumps replanSeq', () => {
    expect(() => previewRemainingEdit(dag(), 'a', { name: 'nope' })).toThrow(/verified/)
    const next = previewRemainingEdit(dag(), 'b', { name: 'click Save' })
    expect(next.replanSeq).toBe(1)
    expect(next.nodes.find((n) => n.id === 'a')?.name).toBe('open')
    expect(next.nodes.find((n) => n.id === 'b')?.name).toBe('click Save')
  })

  test('dagFromWire reads the Rust snake_case persist shape', () => {
    const got = dagFromWire({
      run_id: 'r',
      work_id: 'w',
      replan_seq: 3,
      nodes: [
        { id: 'a', name: 'open', status: 'verified', depends_on: [] },
        { id: 'b', name: 'click', status: 'pending', depends_on: ['a'] },
      ],
    })
    expect(got?.replanSeq).toBe(3)
    expect(got?.nodes[1]?.dependsOn).toEqual(['a'])
    expect(layoutCuaDag(got!).readyIds).toEqual(['b'])
  })
})
