import { describe, expect, test } from 'bun:test'
import { SETTINGS_ACCEPTANCE, settingsAcceptanceIds } from './settings-acceptance'

describe('P65.8 settings acceptance checklist', () => {
  test('names each surface once', () => {
    const ids = settingsAcceptanceIds()
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toContain('one-registry')
    expect(SETTINGS_ACCEPTANCE.every((row) => row.label.length > 0)).toBe(true)
  })
})
