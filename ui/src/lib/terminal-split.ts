/**
 * P68.8 / P54.4 — pane-split decision for the one PTY plane.
 *
 * The Shell view already renders two xterm panes; this module is the
 * deterministic policy that view calls so a split never invents a second
 * terminal implementation, never kills a session on unsplit, and never
 * changes a tab's provenance (an agent tab stays watch-only in either pane).
 */

export type SplitDir = 'row' | 'col'

export interface SplitTab {
  id: string
  ptyId: string | null
  profileName: string
}

export type SplitDecision =
  | { kind: 'reuse'; splitDir: SplitDir; secondaryId: string }
  | { kind: 'spawn'; splitDir: SplitDir; profileName: string; keepActiveId: string }
  | { kind: 'noop'; reason: string }

export function decideSplit(input: {
  dir: SplitDir
  tabs: SplitTab[]
  activeId: string | null
  secondaryId: string | null
}): SplitDecision {
  const { dir, tabs, activeId, secondaryId } = input
  if (!activeId) return { kind: 'noop', reason: 'no-active-tab' }
  // Changing direction on an existing split keeps the same second session.
  if (secondaryId) {
    const still = tabs.some((t) => t.id === secondaryId)
    if (still) return { kind: 'reuse', splitDir: dir, secondaryId }
  }
  const other = tabs.find((t) => t.id !== activeId && t.ptyId !== null)
  if (other) return { kind: 'reuse', splitDir: dir, secondaryId: other.id }
  const current = tabs.find((t) => t.id === activeId)
  if (!current) return { kind: 'noop', reason: 'active-missing' }
  if (!current.profileName) return { kind: 'noop', reason: 'no-profile' }
  return {
    kind: 'spawn',
    splitDir: dir,
    profileName: current.profileName,
    keepActiveId: activeId,
  }
}

/** Unsplit never kills a PTY — both sessions keep running as tabs. */
export function decideUnsplit(): { splitDir: null; secondaryId: null; focusedPane: 'primary' } {
  return { splitDir: null, secondaryId: null, focusedPane: 'primary' }
}
