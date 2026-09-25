import { describe, expect, test } from 'bun:test'
import { parseToolResult } from './tool-json'

describe('P45.9 tool JSON', () => {
  test('a small payload parses on the caller', async () => {
    expect(await parseToolResult('{"ok":true}')).toEqual({ ok: true })
  })
})
