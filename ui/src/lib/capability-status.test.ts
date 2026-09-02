// P50.4.8 — the capability availability matrix must be a pure function of
// live runtime state and must never claim live for unimplemented surfaces.

import { describe, expect, test } from 'bun:test'
import {
  capabilityFor,
  capabilityMatrix,
  type CapabilityContext,
} from './capability-status'

function ctx(partial: Partial<CapabilityContext>): CapabilityContext {
  return {
    inTauri: true,
    sidecarLive: true,
    vaultUnlocked: true,
    browserAttached: false,
    desktopAttached: false,
    providerRoutesAvailable: false,
    anyConnectorConnected: false,
    anyLocalModelConfigured: false,
    ...partial,
  }
}

describe('post-v1 capabilities are never advertised as working', () => {
  test('image/wasm/remote are post-v1 even in a fully-live shell', () => {
    const live = ctx({
      inTauri: true,
      sidecarLive: true,
      vaultUnlocked: true,
      browserAttached: true,
      desktopAttached: true,
      providerRoutesAvailable: true,
      anyConnectorConnected: true,
      anyLocalModelConfigured: true,
    })
    for (const id of ['image-generation', 'wasm-sandbox', 'remote-handoff'] as const) {
      const row = capabilityFor(id, live)
      expect(row.status).toBe('post-v1')
      expect(row.reason).toContain('post-v1')
    }
  })

  test('voice is v1-planned (confirmed v1, stack not wired), never live or post-v1', () => {
    const live = ctx({
      inTauri: true,
      sidecarLive: true,
      vaultUnlocked: true,
    })
    for (const id of ['voice-input', 'voice-output'] as const) {
      const row = capabilityFor(id, live)
      expect(row.status).toBe('v1-planned')
      expect(row.reason).toContain('v1 deliverable')
      expect(row.status).not.toBe('live')
      expect(row.status).not.toBe('post-v1')
    }
  })

  test('script-eval is live but explicitly NOT containment', () => {
    const row = capabilityFor('script-eval', ctx({}))
    expect(row.status).toBe('live')
    expect(row.reason).toContain('never containment')
  })
})

describe('live surfaces derive from runtime state', () => {
  test('browser attach: live only when a CDP session is attached', () => {
    expect(capabilityFor('browser-attach', ctx({ browserAttached: true })).status).toBe('live')
    expect(capabilityFor('browser-attach', ctx({ browserAttached: false })).status).toBe('partial')
  })

  test('desktop computer use: live only when a driver is attached', () => {
    expect(capabilityFor('desktop-computer-use', ctx({ desktopAttached: true })).status).toBe('live')
    expect(capabilityFor('desktop-computer-use', ctx({ desktopAttached: false })).status).toBe('partial')
  })

  test('local models: partial until a runtime is configured', () => {
    expect(capabilityFor('local-models', ctx({ anyLocalModelConfigured: true })).status).toBe('live')
    expect(capabilityFor('local-models', ctx({ anyLocalModelConfigured: false })).status).toBe('partial')
  })

  test('provider routing: no route until the live feed decides one', () => {
    expect(capabilityFor('provider-routing', ctx({ providerRoutesAvailable: true })).status).toBe('live')
    expect(capabilityFor('provider-routing', ctx({ providerRoutesAvailable: false })).status).toBe('partial')
  })

  test('preview mode is never advertised as live for shell-backed surfaces', () => {
    expect(capabilityFor('browser-attach', ctx({ inTauri: false })).status).toBe('partial')
    expect(capabilityFor('desktop-computer-use', ctx({ inTauri: false })).status).toBe('partial')
    expect(capabilityFor('connector-attach', ctx({ inTauri: false })).status).toBe('partial')
  })
})

describe('matrix shape', () => {
  test('contains every advertised surface exactly once', () => {
    const rows = capabilityMatrix(ctx({ inTauri: false }))
    const ids = rows.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(rows.length).toBeGreaterThanOrEqual(12)
  })

  test('every row carries a reason (no silent statuses)', () => {
    for (const row of capabilityMatrix(ctx({ inTauri: false }))) {
      expect(row.reason.length).toBeGreaterThan(0)
    }
  })
})