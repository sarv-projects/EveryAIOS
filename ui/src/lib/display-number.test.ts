import { describe, expect, test } from 'bun:test'
import { tokenThousandsLabel } from './display-number'

describe('token label', () => {
  test('a missing or non-finite count prints zero', () => {
    expect(tokenThousandsLabel(Number.NaN)).toBe('0K tok')
    expect(tokenThousandsLabel(undefined)).toBe('0K tok')
    expect(tokenThousandsLabel(8_400)).toBe('8K tok')
  })
})
