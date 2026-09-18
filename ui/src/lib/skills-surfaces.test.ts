import { describe, expect, test } from 'bun:test'
import { demoSkills, slashCatalog, splitSkillSurfaces, type SkillRowView } from './skills'

describe('P65.5 installed vs marketplace', () => {
  test('unsigned discovery rows are never occupancy', () => {
    const rows = demoSkills().map((r, i) => ({ ...r, installed: i === 0 }))
    const { installed, marketplace } = splitSkillSurfaces(rows)
    expect(installed).toHaveLength(1)
    expect(installed[0]?.installed).toBe(true)
    expect(marketplace.every((r) => r.installed !== true)).toBe(true)
    expect(installed.length + marketplace.length).toBe(rows.length)
  })

  test('P51.28 slash catalog is user-invocable or disable-model-invocation', () => {
    const rows: SkillRowView[] = [
      { ...demoSkills()[0]!, id: 'notes', installed: true, user_invocable: false, disable_model_invocation: false },
      { ...demoSkills()[0]!, id: 'deploy', installed: true, user_invocable: true, disable_model_invocation: true },
      { ...demoSkills()[0]!, id: 'hidden', installed: false, user_invocable: true, disable_model_invocation: false },
    ]
    expect(slashCatalog(rows)).toEqual(['deploy'])
  })
})
