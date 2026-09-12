// Shared DOM test harness (P58.7).
//
// Proves a React surface renders against the *real* modules with a faked shell.
// Two reasons it is a module and not inline boilerplate:
//
//  1. `@tauri-apps/api/core`'s `invoke` is a thin call to
//     `window.__TAURI_INTERNALS__.invoke`, and `src/lib/runtime.ts` treats the
//     *presence* of that global as "the shell is live". Installing a stub there
//     exercises the real `catalogProviders` / real store / real components —
//     no module mocking and no test-only code path inside the app.
//  2. DOM globals must be registered before the component modules are
//     evaluated, and removed afterwards so the pure-library test files that
//     share the process are unaffected. One place to get that right.
//
// This exists because the alternative — driving the real desktop window with
// xdotool + OCR — was abandoned: two first-run dialogs gate the composer, and
// Weston's compositor loses pointer coordinates through its scaled frame.

import { GlobalRegistrator } from '@happy-dom/global-registrator'
import type { ReactElement } from 'react'
import type { Root } from 'react-dom/client'

type AnyWindow = Window & {
  __TAURI_INTERNALS__?: Record<string, unknown>
  MouseEvent: typeof MouseEvent
}

export type ShellHandler = (args?: Record<string, unknown>) => unknown

/** Commands the picker/status bar always touch. `{}` for anything else keeps an
 * unrelated effect from rejecting for the wrong reason. */
const NEUTRAL: Record<string, ShellHandler> = {
  chief_default_get: () => ({ primaryChief: 'inbuilt', known: ['inbuilt'] }),
  local_models: () => ({ models: [], ctxFloor: 15_000, ctxSoft: 20_000 }),
  local_hardware: () => null,
  runtime_status: () => ({ vault: 'ready', sidecar: true, persistence: 'durable' }),
}

/** Register happy-dom globals. Call in `beforeAll`, before importing components. */
export function registerDom(): void {
  const g = globalThis as unknown as { document?: unknown; IS_REACT_ACT_ENVIRONMENT?: boolean }
  if (!g.document) GlobalRegistrator.register()
  g.IS_REACT_ACT_ENVIRONMENT = true
}

/** Remove happy-dom globals so other test files see a clean process. */
export function unregisterDom(): void {
  GlobalRegistrator.unregister()
}

/**
 * Install the fake shell. Returns a live log of every command the surface
 * called, so a test can assert *what was asked* (e.g. that an unreachable
 * provider was never queried), not just what was painted.
 */
export function installShell(handlers: Record<string, ShellHandler> = {}): string[] {
  const invoked: string[] = []
  const table = { ...NEUTRAL, ...handlers }
  const win = globalThis as unknown as { window: AnyWindow }
  win.window.__TAURI_INTERNALS__ = {
    invoke: async (cmd: string, args?: Record<string, unknown>) => {
      invoked.push(args?.provider ? `${cmd}:${String(args.provider)}` : cmd)
      const handler = table[cmd]
      if (handler) return handler(args)
      return {}
    },
    transformCallback: () => 0,
    unregisterCallback: () => {},
    convertFileSrc: (p: string) => p,
    metadata: {},
  }
  return invoked
}

/** Remove the fake shell (so `inTauri()` reports false). */
export function removeShell(): void {
  const win = (globalThis as unknown as { window?: AnyWindow }).window
  if (win) delete win.__TAURI_INTERNALS__
}

export interface Mounted {
  container: HTMLElement
  root: Root
  unmount: () => void
}

/** Mount an element into a fresh container appended to `document.body`. */
export async function mount(element: ReactElement): Promise<Mounted> {
  const { act } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  // Render and flush the mount-time effects (e.g. the picker's
  // `chief_default_get`) in ONE `act`. Splitting them leaves a microtask window
  // between the two calls where an effect's promise chain resolves outside
  // `act`, and React warns about every state update it schedules there.
  await act(async () => {
    root.render(element)
    await settle()
  })
  return {
    container,
    root,
    unmount: () => {
      act(() => root.unmount())
      container.remove()
    },
  }
}

/** A macrotask, so promise chains that hop several awaits have all resolved. */
function settle(ms = 0): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Let effects and their promise chains settle inside `act`. */
export async function tick(ms = 0): Promise<void> {
  const { act } = await import('react')
  await act(async () => {
    await settle(ms)
  })
}

/**
 * Poll until `pred` holds, flushing React work between attempts.
 *
 * The predicate can be satisfied by *one* of several in-flight effects (the
 * catalog read, the local-model probe, the chief default), so a final settling
 * tick drains the rest inside `act` — otherwise their state updates land after
 * the test stops waiting and React warns about each one.
 */
export async function waitFor(pred: () => boolean, tries = 60): Promise<boolean> {
  let ok = pred()
  for (let i = 0; i < tries && !ok; i += 1) {
    await tick(2)
    ok = pred()
  }
  await tick(2)
  return ok
}

/**
 * Click as the user would (a real bubbling MouseEvent at the React root) and
 * let the resulting effect chains settle — all inside one `act`, so no update
 * escapes into the microtask gap between two `act` calls.
 */
export async function click(el: Element): Promise<void> {
  const { act } = await import('react')
  const win = globalThis as unknown as { window: AnyWindow }
  await act(async () => {
    el.dispatchEvent(new win.window.MouseEvent('click', { bubbles: true, cancelable: true }))
    await settle()
  })
}

/** Apply a store update inside `act` so no update escapes React's batching. */
export async function withAct(fn: () => void): Promise<void> {
  const { act } = await import('react')
  act(() => fn())
}

export function findButton(container: HTMLElement, selector: string): HTMLButtonElement {
  const el = container.querySelector<HTMLButtonElement>(selector)
  if (!el) throw new Error(`button not found: ${selector}`)
  return el
}
