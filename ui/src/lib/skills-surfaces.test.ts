import { describe, expect, test } from 'bun:test'
import { demoSkills, splitSkillSurfaces } from './skills'

describe('P65.5 installed vs marketplace', () => {
  test('unsigned discovery rows are never occupancy', () => {
    const rows = demoSkills().map((r, i) => ({ ...r, installed: i === 0 }))
    const { installed, marketplace } = splitSkillSurfaces(rows)
    expect(installed).toHaveLength(1)
    expect(installed[0]?.installed).toBe(true)
    expect(marketplace.every((r) => r.installed !== true)).toBe(true)
    expect(installed.length + marketplace.length).toBe(rows.length)
  })
})
