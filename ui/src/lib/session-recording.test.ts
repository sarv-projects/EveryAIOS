// P11.6.5 — opt-in session recording tests (pure logic, injected storage).

import { describe, expect, test } from 'bun:test'
import {
  MAX_RECORDED_EVENTS,
  __setRecordingStorage,
  clearRecordedEvents,
  exportRecordedEvents,
  getRecordedEvents,
  recordSessionEvent,
  sessionRecordingEnabled,
  setSessionRecording,
  type RecordingStorage,
} from './session-recording'

function memStorage(): RecordingStorage {
  const m = new Map<string, string>()
  return {
    get: (k) => m.get(k) ?? null,
    set: (k, v) => void m.set(k, v),
    remove: (k) => void m.delete(k),
  }
}

function fakeTarget(attrs: Record<string, string>, tag = 'button'): EventTarget {
  return {
    tagName: tag.toUpperCase(),
    getAttribute: (n: string) => attrs[n] ?? null,
  } as unknown as EventTarget
}

describe('session recording', () => {
  test('records nothing while disabled', () => {
    __setRecordingStorage(memStorage())
    setSessionRecording(false)
    recordSessionEvent('click', fakeTarget({ 'aria-label': 'Approve' }))
    expect(getRecordedEvents().length).toBe(0)
  })

  test('records content-free identity when enabled (aria-label, never text)', () => {
    const s = memStorage()
    __setRecordingStorage(s)
    setSessionRecording(true)
    const el = fakeTarget({ 'aria-label': 'Run now' })
    // Content-free by construction: even a text-carrying element only
    // contributes its aria-label.
    ;(el as { textContent?: string }).textContent = 'Run now'
    recordSessionEvent('click', el)
    const events = getRecordedEvents()
    expect(events.length).toBe(1)
    expect(events[0]!.target).toBe('button:Run now')
    expect(events[0]!.kind).toBe('click')
  })

  test('falls back to tag name when no identity attributes exist', () => {
    __setRecordingStorage(memStorage())
    setSessionRecording(true)
    recordSessionEvent('navigate', fakeTarget({}, 'div'))
    expect(getRecordedEvents()[0]!.target).toBe('div')
  })

  test('truncates long identity labels', () => {
    __setRecordingStorage(memStorage())
    setSessionRecording(true)
    recordSessionEvent('click', fakeTarget({ 'aria-label': 'x'.repeat(200) }))
    expect(getRecordedEvents()[0]!.target!.length).toBeLessThanOrEqual('button:'.length + 60)
  })

  test('ring-buffer keeps only the newest MAX_RECORDED_EVENTS', () => {
    __setRecordingStorage(memStorage())
    setSessionRecording(true)
    for (let i = 0; i < MAX_RECORDED_EVENTS + 5; i++) {
      recordSessionEvent('click', fakeTarget({ 'aria-label': `e${i}` }))
    }
    const events = getRecordedEvents()
    expect(events.length).toBe(MAX_RECORDED_EVENTS)
    expect(events[0]!.target).toBe(`button:e${5}`)
  })

  test('clear removes everything; disabling clears the buffer', () => {
    const s = memStorage()
    __setRecordingStorage(s)
    setSessionRecording(true)
    recordSessionEvent('click', fakeTarget({ 'aria-label': 'a' }))
    expect(getRecordedEvents().length).toBe(1)
    clearRecordedEvents()
    expect(getRecordedEvents().length).toBe(0)

    recordSessionEvent('click', fakeTarget({ 'aria-label': 'b' }))
    expect(getRecordedEvents().length).toBe(1)
    setSessionRecording(false)
    expect(getRecordedEvents().length).toBe(0)
    expect(sessionRecordingEnabled()).toBe(false)
  })

  test('export produces valid JSON with the events array', () => {
    __setRecordingStorage(memStorage())
    setSessionRecording(true)
    recordSessionEvent('click', fakeTarget({ 'aria-label': 'Export' }))
    const parsed = JSON.parse(exportRecordedEvents()) as { generatedAtMs: number; events: unknown[] }
    expect(typeof parsed.generatedAtMs).toBe('number')
    expect(parsed.events.length).toBe(1)
  })
})
