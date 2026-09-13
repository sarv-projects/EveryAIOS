// P58.4 — the composer intercept and Settings → Commands must read one table.
import { describe, expect, test } from 'bun:test'

import {
  INBUILT_SLASH_COMMANDS,
  SLASH_DISABLED_KEY,
  disabledSlashSet,
  enabledSlashCommands,
} from './slash-commands'

describe('P58.4 — inbuilt slash command table', () => {
  test('every advertised command is a /name with a description and a mutating flag', () => {
    expect(INBUILT_SLASH_COMMANDS.length).toBeGreaterThan(0)
    for (const c of INBUILT_SLASH_COMMANDS) {
      expect(c.cmd.startsWith('/')).toBe(true)
      expect(c.cmd).toBe(c.cmd.trim().toLowerCase())
      expect(c.desc.length).toBeGreaterThan(0)
      expect(typeof c.mutating).toBe('boolean')
    }
  })

  test('the table has no duplicate command', () => {
    const cmds = INBUILT_SLASH_COMMANDS.map((c) => c.cmd)
    expect(new Set(cmds).size).toBe(cmds.length)
  })

  test('the preference key is not the legacy free-text list', () => {
    // `commands.user` was the old "add any /word" pref; it must not be reused,
    // or an old value would silently disable nothing while looking active.
    expect(SLASH_DISABLED_KEY).toBe('commands.disabled')
  })
})

describe('P58.4 — disabled commands stop being intercepted', () => {
  test('with nothing disabled the full table is offered', () => {
    expect(enabledSlashCommands([])).toEqual(INBUILT_SLASH_COMMANDS)
  })

  test('a disabled command disappears from the offered list', () => {
    const enabled = enabledSlashCommands(['/undo'])
    expect(enabled.map((c) => c.cmd)).not.toContain('/undo')
    expect(enabled.length).toBe(INBUILT_SLASH_COMMANDS.length - 1)
  })

  test('an entry without the leading slash still matches (legacy value)', () => {
    expect(disabledSlashSet(['undo']).has('/undo')).toBe(true)
    expect(enabledSlashCommands(['undo']).map((c) => c.cmd)).not.toContain('/undo')
  })

  test('an unknown entry can never hide a real command', () => {
    const enabled = enabledSlashCommands(['/not-a-command', '   ', '/'])
    expect(enabled).toEqual(INBUILT_SLASH_COMMANDS)
  })

  test('disabling everything leaves an empty list (the palette renders nothing rather than a dead header)', () => {
    const all = INBUILT_SLASH_COMMANDS.map((c) => c.cmd)
    expect(enabledSlashCommands(all)).toEqual([])
  })

  test('mutating commands are exactly the ones the composer refuses mid-turn', () => {
    const mutating = INBUILT_SLASH_COMMANDS.filter((c) => c.mutating).map((c) => c.cmd)
    expect(mutating.sort()).toEqual(['/clear', '/compact', '/undo'])
  })
})
