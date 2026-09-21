import { describe, expect, it } from 'vitest';
import { ProviderVault } from '../vault.js';
import type { KeyValueStore } from '../types.js';

function createSlowStore(delayMs = 0): KeyValueStore & { dump: () => string | null } {
  const memory = new Map<string, string>();
  const wait = () => new Promise((resolve) => setTimeout(resolve, delayMs));
  return {
    async getItem(key) {
      await wait();
      return memory.get(key) ?? null;
    },
    async setItem(key, value) {
      await wait();
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
 * P69.C4 — the mutex still matters (metadata is read-modify-written), but the
 * payload is handles, never credentials: a concurrent write can race records,
 * it can never race a secret.
 */
describe('ProviderVault concurrency (handle-only)', () => {
  it('concurrent saves to different providers do not clobber each other', async () => {
    const vault = new ProviderVault(createSlowStore(1));
    await Promise.all([
      vault.save({ id: 'nvidia-nim', keyRef: 'vault:nvidia-nim:1' }),
      vault.save({ id: 'groq', keyRef: 'vault:groq:1' }),
      vault.save({ id: 'cerebras', keyRef: 'vault:cerebras:1' }),
    ]);
    const list = await vault.list();
    expect(list.map((p) => p.id).sort()).toEqual(['cerebras', 'groq', 'nvidia-nim']);
  });

  it('a save and a concurrent keyRef read serialize (last write wins, no partial JSON)', async () => {
    const store = createSlowStore(1);
    const vault = new ProviderVault(store);
    await vault.save({ id: 'nvidia-nim', keyRef: 'vault:nvidia-nim:old' });

    const [saved, read] = await Promise.all([
      vault.save({ id: 'nvidia-nim', keyRef: 'vault:nvidia-nim:new' }),
      vault.keyRef('nvidia-nim'),
    ]);
    expect(saved.id).toBe('nvidia-nim');
    expect(['vault:nvidia-nim:old', 'vault:nvidia-nim:new']).toContain(read);
    expect(await vault.keyRef('nvidia-nim')).toBe('vault:nvidia-nim:new');
  });

  it('the persisted bytes never contain key material', async () => {
    const store = createSlowStore(0);
    const vault = new ProviderVault(store);
    await vault.save({ id: 'anthropic', keyRef: 'vault:anthropic:1' });
    const dump = store.dump() ?? '';
    expect(dump).not.toMatch(/sk-ant/);
    expect(dump).not.toContain('sealedKey');
    expect(dump).toContain('keyRef');
  });
});
