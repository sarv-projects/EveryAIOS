import { describe, expect, test } from 'bun:test'
import { chiefSpendWarning } from './spend'

describe('P60.9 Chief spend warning', () => {
  test('warns above 20 percent and never aborts', () => {
    expect(chiefSpendWarning(10, 90).warnNotDelegating).toBe(false)
    expect(chiefSpendWarning(30, 70).warnNotDelegating).toBe(true)
    expect(chiefSpendWarning(0, 0).warnNotDelegating).toBe(false)
  })
})
