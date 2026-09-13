// P57.8 — the Settings → Computer use surface must name what the backend
// derived, and offer only what the backend would accept.
import { describe, expect, test } from 'bun:test'

import {
  addBlockReason,
  backgroundInputView,
  interactionCopy,
  pathTail,
  pickerOptions,
  readinessView,
  sourceLabel,
  type DesktopInstalledApp,
  type DesktopReadinessState,
} from './desktop-apps'

function app(over: Partial<DesktopInstalledApp> = {}): DesktopInstalledApp {
  return {
    name: 'Text Editor',
    path: '/usr/bin/gedit',
    source: 'desktop_entry',
    hardDenied: null,
    allowListed: false,
    ...over,
  }
}

describe('P57.8 — H4 readiness chip', () => {
  test('every derived state has a label, a glyph and the backend sentence', () => {
    const states: DesktopReadinessState[] = [
      'ready',
      'permission_required',
      'driver_missing',
      'app_unsupported',
      'policy_blocked',
    ]
    for (const state of states) {
      const v = readinessView({ state, detail: `why ${state}`, usable: state === 'ready' })
      expect(v).not.toBeNull()
      expect(v!.label.length).toBeGreaterThan(0)
      expect(v!.glyph.length).toBeGreaterThan(0)
      expect(v!.detail).toBe(`why ${state}`)
    }
  })

  test('ready is the only usable state and is never painted without a reason', () => {
    const ready = readinessView({ state: 'ready', detail: 'accessibility tree + input synthesis', usable: true })
    expect(ready!.usable).toBe(true)
    expect(ready!.label).toBe('Ready')
    const blocked = readinessView({ state: 'policy_blocked', detail: 'emergency stop engaged', usable: false })
    expect(blocked!.usable).toBe(false)
    expect(blocked!.detail).toBe('emergency stop engaged')
    // A null read renders nothing rather than a fake default state.
    expect(readinessView(null)).toBeNull()
  })

  test('an unknown state degrades to a labelled unknown, not to "ready"', () => {
    const v = readinessView({ state: 'something_new' as DesktopReadinessState, detail: 'x', usable: false })
    expect(v!.label).toBe('Unknown')
    expect(v!.usable).toBe(false)
  })
})

describe('P57.8 — background coordinate click capability', () => {
  test('does not claim a capability before the native driver is attached', () => {
    const v = backgroundInputView(false, undefined)
    expect(v.label).toBe('Not measured')
    expect(v.detail).toContain('not attached')
  })

  test('renders host capability without claiming every app will honor it', () => {
    const available = backgroundInputView(true, true)
    expect(available.label).toBe('Available on this host')
    expect(available.detail).toContain('does not guarantee')

    const unavailable = backgroundInputView(true, false)
    expect(unavailable.label).toBe('Unavailable on this host')
    expect(unavailable.detail).toContain('will refuse')
  })
})

describe('P57.8 — Add by path picker', () => {
  test('macOS picks bundle directories, Windows picks .exe files', () => {
    const mac = pickerOptions('MacIntel')
    expect(mac.directory).toBe(true)
    expect(mac.filters).toEqual([])
    expect(mac.title).toContain('.app')

    const win = pickerOptions('Win32')
    expect(win.directory).toBe(false)
    expect(win.filters[0].extensions).toContain('exe')

    const linux = pickerOptions('Linux x86_64')
    expect(linux.directory).toBe(false)
    expect(linux.filters).toEqual([])
  })
})

describe('P57.8 — allow-list rows', () => {
  test('a hard-denied app is blocked with the policy reason, never addable', () => {
    const reason = addBlockReason(app({ path: '/usr/bin/gnome-terminal', hardDenied: 'app "gnome-terminal" is on the hard-deny list' }))
    expect(reason).toContain('hard-deny')
    expect(addBlockReason(app())).toBeNull()
    expect(addBlockReason(app({ allowListed: true }))).toBe('already allow-listed')
  })

  test('paths render in full (tail-truncated) and drop the Windows verbatim prefix', () => {
    expect(pathTail('/usr/bin/gedit')).toBe('/usr/bin/gedit')
    expect(pathTail('\\\\?\\C:\\Program Files\\App\\app.exe')).toBe('C:/Program Files/App/app.exe')
    const long = `/home/someone/${'deep/'.repeat(20)}binary`
    expect(pathTail(long).startsWith('…')).toBe(true)
    expect(pathTail(long).endsWith('binary')).toBe(true)
  })

  test('row provenance is named', () => {
    expect(sourceLabel('desktop_entry')).toBe('desktop entry')
    expect(sourceLabel('app_bundle')).toBe('application bundle')
    expect(sourceLabel('start_menu')).toBe('start menu')
    expect(sourceLabel('user_path')).toBe('added by path')
  })
})

describe('P57.8 — interaction default copy', () => {
  test('background is stated as the default contract and foreground as escalation', () => {
    expect(interactionCopy('background')).toContain('default')
    expect(interactionCopy('background')).toContain('never raises')
    expect(interactionCopy('foreground')).toContain('restored')
  })
})
