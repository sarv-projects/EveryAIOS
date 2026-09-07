// P51.13 — per-project thread rows: top-level sessions group under their
// taskFolder, most-recent-first; forks stay with their parent's group.

import { describe, expect, test } from 'bun:test'
import { groupSessionsByFolder } from '@/components/shell/left-sidebar'

const s = (id: string, folder: string | undefined, updatedAt: string, parentId?: string) => ({
  id,
  taskFolder: folder,
  updatedAt,
  ...(parentId ? { parentId } : {}),
})

describe('P51.13 — per-project session grouping', () => {
  test('sessions group under their taskFolder; unfoldered rows get an implicit group', () => {
    const groups = groupSessionsByFolder([
      s('a', 'webapp', '2026-09-06T10:00:00Z'),
      s('b', undefined, '2026-09-06T09:00:00Z'),
      s('c', 'webapp', '2026-09-06T08:00:00Z'),
    ])
    expect(groups.map((g) => g.folder)).toEqual(['webapp', '(no project)'])
    expect(groups[0].sessions.map((x) => x.id)).toEqual(['a', 'c']) // newest first
  })

  test('forks do not create their own group — they ride their parent group', () => {
    const groups = groupSessionsByFolder([
      s('parent', 'webapp', '2026-09-06T10:00:00Z'),
      s('fork', undefined, '2026-09-06T11:00:00Z', 'parent'),
    ])
    expect(groups.map((g) => g.folder)).toEqual(['webapp'])
    expect(groups[0].sessions.map((x) => x.id)).toEqual(['parent'])
  })

  test('folder order follows the newest session inside each folder', () => {
    const groups = groupSessionsByFolder([
      s('old', 'alpha', '2026-09-01T00:00:00Z'),
      s('new', 'beta', '2026-09-06T00:00:00Z'),
    ])
    expect(groups.map((g) => g.folder)).toEqual(['beta', 'alpha'])
  })

  test('empty input yields no groups', () => {
    expect(groupSessionsByFolder([])).toEqual([])
  })
})