// Vault completion is deliberately separated from the modal's rendering so the
// failure contract is deterministic: completion runs only after the selected
// native path returns an explicit success receipt.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { registerDom, unregisterDom } from '@/test/dom-harness'
import type { VaultSetupDependencies } from './onboarding-modal'

let completeOnboardingAfterVault: typeof import('./onboarding-modal').completeOnboardingAfterVault

beforeAll(async () => {
  registerDom()
  completeOnboardingAfterVault = (await import('./onboarding-modal')).completeOnboardingAfterVault
})

afterAll(() => {
  unregisterDom()
})

function dependencies(
  invoke: VaultSetupDependencies['invoke'],
  inShell = true,
): VaultSetupDependencies {
  return { inTauri: () => inShell, invoke }
}

describe('onboarding vault completion', () => {
  test('a rejected vault_setup never persists completion and a retry can finish', async () => {
    let attempts = 0
    let completions = 0
    const invoke = async <T,>(command: string): Promise<T> => {
      expect(command).toBe('vault_setup')
      attempts += 1
      if (attempts === 1) throw new Error('vault keyfile write denied')
      return { ok: true, needsSetup: false } as T
    }

    await expect(
      completeOnboardingAfterVault(
        { kind: 'passphrase', passphrase: 'correct horse' },
        () => { completions += 1 },
        dependencies(invoke),
      ),
    ).rejects.toThrow('vault keyfile write denied')
    expect(completions).toBe(0)

    await expect(
      completeOnboardingAfterVault(
        { kind: 'passphrase', passphrase: 'correct horse' },
        () => { completions += 1 },
        dependencies(invoke),
      ),
    ).resolves.toBe('passphrase')
    expect(completions).toBe(1)
    expect(attempts).toBe(2)
  })

  test('a successful command response without a readiness receipt still fails closed', async () => {
    let completions = 0
    const invoke = async <T,>(): Promise<T> => ({}) as T

    await expect(
      completeOnboardingAfterVault(
        { kind: 'passphrase', passphrase: 'correct horse' },
        () => { completions += 1 },
        dependencies(invoke),
      ),
    ).rejects.toThrow('did not confirm')
    expect(completions).toBe(0)
  })

  test('the device-key path finishes only after the shell proves a usable key', async () => {
    let completions = 0
    const unavailable = async <T,>(command: string): Promise<T> => {
      expect(command).toBe('vault_key_status')
      return { ok: false, needsSetup: true, mode: 'setup' } as T
    }

    await expect(
      completeOnboardingAfterVault(
        { kind: 'device-key' },
        () => { completions += 1 },
        dependencies(unavailable),
      ),
    ).rejects.toThrow('restore the device key and retry')
    expect(completions).toBe(0)

    const available = async <T,>(): Promise<T> =>
      ({ ok: true, needsSetup: false, mode: 'open' }) as T
    await expect(
      completeOnboardingAfterVault(
        { kind: 'device-key' },
        () => { completions += 1 },
        dependencies(available),
      ),
    ).resolves.toBe('device-key')
    expect(completions).toBe(1)
  })
})
