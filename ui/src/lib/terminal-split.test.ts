import { describe, expect, test } from 'bun:test'
import { decideSplit, decideUnsplit, type SplitTab } from './terminal-split'

function tabs(ids: Array<[string, string | null]>): SplitTab[] {
  return ids.map(([id, ptyId]) => ({ id, ptyId, profileName: 'bash' }))
}

describe('decideSplit (P68.8)', () => {
  test('reuses another live tab instead of spawning', () => {
    const got = decideSplit({
      dir: 'col',
      tabs: tabs([
        ['a', 'pty-a'],
        ['b', 'pty-b'],
      ]),
      activeId: 'a',
      secondaryId: null,
    })
    expect(got).toEqual({ kind: 'reuse', splitDir: 'col', secondaryId: 'b' })
  })

  test('spawns the active profile when only one live tab exists', () => {
    const got = decideSplit({
      dir: 'row',
      tabs: tabs([['a', 'pty-a']]),
      activeId: 'a',
      secondaryId: null,
    })
    expect(got).toEqual({
      kind: 'spawn',
      splitDir: 'row',
      profileName: 'bash',
      keepActiveId: 'a',
    })
  })

  test('changing direction on an existing split reuses the second pane', () => {
    const got = decideSplit({
      dir: 'row',
      tabs: tabs([
        ['a', 'pty-a'],
        ['b', 'pty-b'],
      ]),
      activeId: 'a',
      secondaryId: 'b',
    })
    expect(got).toEqual({ kind: 'reuse', splitDir: 'row', secondaryId: 'b' })
  })

  test('ignores a tab that has not spawned a PTY yet', () => {
    const got = decideSplit({
      dir: 'col',
      tabs: tabs([
        ['a', 'pty-a'],
        ['ghost', null],
      ]),
      activeId: 'a',
      secondaryId: null,
    })
    expect(got.kind).toBe('spawn')
  })

  test('noops without an active tab', () => {
    expect(
      decideSplit({ dir: 'col', tabs: tabs([['a', 'pty-a']]), activeId: null, secondaryId: null }).kind,
    ).toBe('noop')
  })

  test('unsplit kills nothing', () => {
    expect(decideUnsplit()).toEqual({ splitDir: null, secondaryId: null, focusedPane: 'primary' })
  })
})
