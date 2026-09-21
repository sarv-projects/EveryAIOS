import { describe, expect, it } from 'vitest';
import { ProviderVault } from '../vault.js';
import type { KeyValueStore } from '../types.js';

function createMockStore(): KeyValueStore & { dump: () => string | null } {
  const memory = new Map<string, string>();
  return {
    async getItem(key) {
      return memory.get(key) ?? null;
    },
    async setItem(key, value) {
      memory.set(key, value);
    },
    async removeItem(key) {
      memory.delete(key);
    },
    dump() {
      return memory.get('byok.providers.v1') ?? null;
    },
  };
}

/**
 * P69.C4 / P69.D4 — `ProviderVault` is an availability + handle facade.
 * Credentials live only in the Rust vault; no test here (and no caller) may
 * cause TypeScript to seal, store, or read key material.
 */
describe('ProviderVault (handle-only contract)', () => {
  it('records provider metadata + an opaque keyRef', async () => {
    const store = createMockStore();
    const vault = new ProviderVault(store);
    const connected = await vault.save({
      id: 'nvidia-nim',
      keyRef: 'vault:nvidia-nim:1',
    });
    expect(connected.id).toBe('nvidia-nim');
    expect(connected.isActive).toBe(true);
    expect(await vault.hasKey('nvidia-nim')).toBe(true);
    expect(await vault.keyRef('nvidia-nim')).toBe('vault:nvidia-nim:1');
    // The persisted record carries the handle, never a secret.
    const dump = store.dump();
    expect(dump).toContain('vault:nvidia-nim:1');
    expect(dump).not.toContain('nvapi');
    expect(dump).not.toContain('apiKey');
  });

  it('refuses raw key material — the TS credential path is gone', async () => {
    const vault = new ProviderVault(createMockStore());
    await expect(
      vault.save({ id: 'nvidia-nim', apiKey: 'nvapi-secret' } as never),
    ).rejects.toThrow(/no longer accepts key material/);
  });

  it('hasKey is false when only metadata is recorded', async () => {
    const vault = new ProviderVault(createMockStore());
    await vault.save({ id: 'groq', model: undefined });
    expect(await vault.hasKey('groq')).toBe(false);
    expect(await vault.keyRef('groq')).toBeNull();
  });

  it('keeps an existing handle on a metadata-only re-save', async () => {
    const vault = new ProviderVault(createMockStore());
    await vault.save({ id: 'groq', keyRef: 'vault:groq:1' });
    await vault.save({ id: 'groq', isActive: false });
    expect(await vault.keyRef('groq')).toBe('vault:groq:1');
    expect((await vault.list()).find((p) => p.id === 'groq')?.isActive).toBe(false);
  });

  it('does not silently re-activate a deactivated provider', async () => {
    const vault = new ProviderVault(createMockStore());
    await vault.save({ id: 'groq', isActive: false });
    await vault.save({ id: 'groq', keyRef: 'vault:groq:2' });
    expect((await vault.list()).find((p) => p.id === 'groq')?.isActive).toBe(false);
    const activated = await vault.setActive('groq', true);
    expect(activated.isActive).toBe(true);
  });

  it('removes a provider record', async () => {
    const vault = new ProviderVault(createMockStore());
    await vault.save({ id: 'groq', keyRef: 'vault:groq:3' });
    await vault.remove('groq');
    expect(await vault.list()).toEqual([]);
  });

  it('unknown providers are rejected', async () => {
    const vault = new ProviderVault(createMockStore());
    await expect(vault.save({ id: 'not-a-provider' })).rejects.toThrow(/Unknown provider/);
  });
});
