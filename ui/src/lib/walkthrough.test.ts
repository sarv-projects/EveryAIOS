import { describe, expect, test } from 'bun:test'
import { layoutWalkthroughStops } from './walkthrough'

describe('P51.10 Changes Walkthrough layout', () => {
  test('orders stops and tags the first as key-change', () => {
    const stops = layoutWalkthroughStops([
      { seq: 0, path: 'src/a.ts', hunk: '@@ -1 +1 @@', narrative: 'Step 1: review src/a.ts' },
      { seq: 1, path: 'src/b.ts', hunk: '@@ -2 +2 @@', narrative: 'Step 2: review src/b.ts' },
    ])
    expect(stops).toHaveLength(2)
    expect(stops[0]?.title).toBe('a.ts')
    expect(stops[0]?.tag).toBe('key-change')
    expect(stops[1]?.tag).toBeUndefined()
    expect(stops[1]?.seq).toBe(1)
  })
})
