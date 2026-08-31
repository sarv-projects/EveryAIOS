import { describe, expect, test } from 'bun:test'
import {
  bridgeCall,
  getRuntimeState,
  markRuntimeLive,
  setRuntimeState,
} from './runtime'

describe('runtime truth boundary', () => {
  test('starts in preview outside the Tauri shell', () => {
    expect(getRuntimeState().status).toBe('preview')
  })

  test('preview policy uses only the explicit preview branch', async () => {
    markRuntimeLive()
    const value = await bridgeCall({
      operation: 'test preview operation',
      live: async () => 'live',
      preview: () => 'preview',
    })
    expect(value).toBe('preview')
    expect(getRuntimeState().status).toBe('preview')
  })

  test('native policy propagates failures and marks the runtime degraded', async () => {
    const previous = (globalThis as { window?: unknown }).window
    ;(globalThis as { window?: unknown }).window = { __TAURI_INTERNALS__: {} }
    try {
      await expect(
        bridgeCall({
          operation: 'native failure',
          live: async () => {
            throw new Error('native command failed')
          },
          preview: () => 'preview',
        }),
      ).rejects.toThrow('native command failed')
      expect(getRuntimeState().status).toBe('degraded')
    } finally {
      if (previous === undefined) delete (globalThis as { window?: unknown }).window
      else (globalThis as { window?: unknown }).window = previous
      setRuntimeState('preview')
    }
  })

  test('readiness transitions preserve the canonical state vocabulary', () => {
    for (const status of [
      'booting',
      'vault-setup',
      'vault-locked',
      'sidecar-offline',
      'live',
      'degraded',
    ] as const) {
      setRuntimeState(status)
      expect(getRuntimeState().status).toBe(status)
    }
    setRuntimeState('preview')
  })
})
