// P57.8 — Settings → Computer use is a real policy surface, not chrome.
//
// These tests drive the component against the fake shell (the real store, real
// helpers, real `invoke` path) and assert the four things that make it honest:
// the H4 chip names a derived state with the backend's sentence, the
// interaction default is Background, the allow-list rows come from the backend
// policy, and a hard-denied app can never be added — the row shows the block
// and no Add button exists to click.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import type { ReactElement } from 'react'
import {
  click,
  installShell,
  mount,
  registerDom,
  removeShell,
  unregisterDom,
  waitFor,
  type Mounted,
} from '@/test/dom-harness'

let Section: () => ReactElement
let mounted: Mounted | null = null

beforeAll(async () => {
  registerDom()
  Section = (await import('./settings-sections-studio')).ComputerUseSection
})

afterAll(() => {
  unregisterDom()
})

function policy(allowPaths: string[], interactionDefault = 'background') {
  return {
    allowList: [],
    allowPaths,
    strict: false,
    interactionDefault,
    allowsRaisingWindows: interactionDefault === 'foreground',
  }
}

const APPS = [
  {
    name: 'Text Editor',
    path: '/usr/bin/gedit',
    source: 'desktop_entry',
    hardDenied: null,
    allowListed: false,
  },
  {
    name: 'Terminal',
    path: '/usr/bin/gnome-terminal',
    source: 'desktop_entry',
    hardDenied: 'app "gnome-terminal" is on the hard-deny list',
    allowListed: false,
  },
]

/**
 * A *stateful* fake of the P57.8 backend: writes change the state the next read
 * returns, exactly like `<data_dir>/desktop.json` does. A stateless stub would
 * hide the contract that matters — that every write persists and is re-read
 * rather than assumed in the UI.
 */
function fakeDesktop(initialPaths = ['/usr/bin/gedit']) {
  const state = {
    policy: policy(initialPaths),
    apps: APPS.map((a) => ({ ...a })),
    attached: false,
  }
  const readiness = () => ({
    state: 'driver_missing',
    detail: 'desktop engine unavailable: no display on this host',
    usable: false,
  })
  const status = () => ({
    attached: state.attached,
    ...(state.attached ? { capabilities: { background_input: true } } : { reason: 'desktop engine unavailable: no display on this host' }),
    interactionDefault: state.policy.interactionDefault,
    readiness: state.attached
      ? { state: 'ready', detail: 'input synthesis + background click path', usable: true }
      : readiness(),
  })
  const invoked = installShell({
    desktop_status: () => status(),
    desktop_attach: () => {
      state.attached = true
      return status()
    },
    desktop_policy_get: () => ({ policy: state.policy, attached: state.attached, readiness: state.attached ? status().readiness : readiness() }),
    desktop_apps: () => ({
      apps: state.apps.map((a) => ({
        ...a,
        allowListed: state.policy.allowPaths.includes(a.path),
      })),
      total: state.apps.length,
      scanned: true,
    }),
    desktop_policy_set_interaction: (args) => {
      const mode = String(args?.mode ?? 'background')
      state.policy = policy(state.policy.allowPaths, mode)
      return { appliedLive: true, policy: state.policy }
    },
    desktop_policy_allow_path: (args) => {
      const path = String(args?.path ?? '')
      state.policy = policy([...state.policy.allowPaths, path])
      return { added: path, appliedLive: true, policy: state.policy }
    },
    desktop_policy_remove_path: (args) => {
      const path = String(args?.path ?? '')
      const had = state.policy.allowPaths.includes(path)
      state.policy = policy(state.policy.allowPaths.filter((p) => p !== path))
      return { removed: had, appliedLive: true, policy: state.policy }
    },
  })
  return { invoked, state }
}

describe('P57.8 — Settings → Computer use', () => {
  test('the H4 chip names the derived state with the backend sentence', async () => {
    fakeDesktop()
    mounted = await mount(<Section />)
    const ok = await waitFor(() => mounted!.container.textContent?.includes('Readiness') ?? false)
    expect(ok).toBe(true)
    const text = mounted.container.textContent ?? ''
    expect(text).toContain('Driver missing')
    expect(text).toContain('no display on this host')
    mounted.unmount()
    mounted = null
    removeShell()
  })

  test('capability is not claimed while detached, then appears after explicit attach', async () => {
    const { invoked } = fakeDesktop()
    mounted = await mount(<Section />)
    await waitFor(() => (mounted!.container.textContent ?? '').includes('Not measured'))
    expect(mounted.container.textContent).toContain('Not measured')
    expect(mounted.container.textContent).not.toContain('Available on this host')

    const attach = Array.from(mounted.container.querySelectorAll('button')).find((b) =>
      (b.textContent ?? '').includes('Attach and measure'),
    )!
    await click(attach)
    await waitFor(() => invoked.includes('desktop_attach'))
    expect(invoked).toContain('desktop_attach')
    expect(await waitFor(() => (mounted!.container.textContent ?? '').includes('Available on this host'))).toBe(true)

    mounted.unmount()
    mounted = null
    removeShell()
  })

  test('the interaction default is Background and foreground is a persisted choice', async () => {
    const { invoked } = fakeDesktop()
    mounted = await mount(<Section />)
    await waitFor(() => (mounted!.container.textContent ?? '').includes('Default interaction'))

    const buttons = Array.from(mounted.container.querySelectorAll('button'))
    const bg = buttons.find((b) => b.textContent === 'Background')!
    const fg = buttons.find((b) => b.textContent === 'Foreground')!
    // Background is the contract, so it is the pressed option out of the box.
    expect(bg.getAttribute('aria-pressed')).toBe('true')
    expect(fg.getAttribute('aria-pressed')).toBe('false')

    await click(fg)
    await waitFor(() => invoked.includes('desktop_policy_set_interaction'))
    expect(invoked).toContain('desktop_policy_set_interaction')
    // The backend's new default is painted, not assumed locally.
    expect(await waitFor(() => fg.getAttribute('aria-pressed') === 'true')).toBe(true)
    mounted.unmount()
    mounted = null
    removeShell()
  })

  test('allow-list rows render the canonical path and Remove calls the backend', async () => {
    const { invoked } = fakeDesktop()
    mounted = await mount(<Section />)
    await waitFor(() => (mounted!.container.textContent ?? '').includes('/usr/bin/gedit'))
    const remove = mounted.container.querySelector('button[aria-label*="Remove /usr/bin/gedit"]')
    expect(remove).not.toBeNull()
    await click(remove!)
    await waitFor(() => invoked.includes('desktop_policy_remove_path'))
    expect(invoked).toContain('desktop_policy_remove_path')
    mounted.unmount()
    mounted = null
    removeShell()
  })

  test('a hard-denied app is shown as never automatable and has no Add button', async () => {
    // Nothing allow-listed yet, so the one addable row carries the only Add.
    const { invoked, state } = fakeDesktop([])
    mounted = await mount(<Section />)
    await waitFor(() => (mounted!.container.textContent ?? '').includes('Installed apps'))

    const rows = Array.from(mounted.container.querySelectorAll('li')).filter((li) =>
      (li.textContent ?? '').includes('/usr/bin/gnome-terminal'),
    )
    expect(rows.length).toBe(1)
    expect(rows[0].textContent).toContain('never automatable')
    // The only Add button belongs to the allow-listable row.
    const addButtons = Array.from(mounted.container.querySelectorAll('button')).filter(
      (b) => (b.textContent ?? '').trim() === 'Add',
    )
    expect(addButtons.length).toBe(1)
    const add = addButtons[0]
    expect(add.closest('li')?.textContent ?? '').toContain('/usr/bin/gedit')
    // Adding is a policy write, not a local toggle: the path reaches the
    // backend and the row then reads as listed from the re-read policy.
    await click(add)
    await waitFor(() => invoked.includes('desktop_policy_allow_path'))
    expect(invoked).toContain('desktop_policy_allow_path')
    expect(state.policy.allowPaths).toContain('/usr/bin/gedit')
    expect(
      await waitFor(() =>
        Array.from(mounted!.container.querySelectorAll('li')).some(
          (li) =>
            (li.textContent ?? '').includes('/usr/bin/gedit') &&
            (li.textContent ?? '').includes('listed'),
        ),
      ),
    ).toBe(true)
    mounted.unmount()
    mounted = null
    removeShell()
  })

  test('the app search is sent to the backend (one match rule, cached inventory)', async () => {
    const { invoked } = fakeDesktop()
    mounted = await mount(<Section />)
    await waitFor(() => (mounted!.container.textContent ?? '').includes('Installed apps'))
    const input = mounted.container.querySelector('input[aria-label="Search installed apps"]')!
    const setter = Object.getOwnPropertyDescriptor(
      (input as HTMLInputElement).constructor.prototype,
      'value',
    )!.set!
    const { act } = await import('react')
    await act(async () => {
      setter.call(input, 'term')
      input.dispatchEvent(new Event('input', { bubbles: true }))
      await new Promise((r) => setTimeout(r, 200))
    })
    expect(invoked.filter((c) => c === 'desktop_apps').length).toBeGreaterThan(1)
    mounted.unmount()
    mounted = null
    removeShell()
  })
})
