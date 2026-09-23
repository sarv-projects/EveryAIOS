import { describe, expect, test } from 'bun:test'
import { primarySpendWarning } from './spend'

describe('P60.9 Chief spend warning', () => {
  test('warns above 20 percent and never aborts', () => {
    expect(primarySpendWarning(10, 90).warnNotDelegating).toBe(false)
    expect(primarySpendWarning(30, 70).warnNotDelegating).toBe(true)
    expect(primarySpendWarning(0, 0).warnNotDelegating).toBe(false)
  })
})
