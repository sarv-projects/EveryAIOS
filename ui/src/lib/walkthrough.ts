/**
 * P51.10 — Changes Walkthrough (OpenChamber: ordered stops, not a verdict).
 * Groups hunks already ordered by `execution/multirun` walkthrough().
 */

export interface WalkthroughStop {
  seq: number
  path: string
  title: string
  narrative: string
  hunk: string
  tag?: 'key-change'
}

export function layoutWalkthroughStops(
  steps: Array<{ seq?: number; path?: string; hunk?: string; narrative?: string }>,
): WalkthroughStop[] {
  return steps.map((s, i) => {
    const path = typeof s.path === 'string' && s.path ? s.path : 'unknown'
    const title = path.split('/').filter(Boolean).pop() ?? path
    const stop: WalkthroughStop = {
      seq: typeof s.seq === 'number' ? s.seq : i,
      path,
      title,
      narrative: typeof s.narrative === 'string' ? s.narrative : `Step ${i + 1}: ${title}`,
      hunk: typeof s.hunk === 'string' ? s.hunk : '',
    }
    if (i === 0) stop.tag = 'key-change'
    return stop
  })
}
