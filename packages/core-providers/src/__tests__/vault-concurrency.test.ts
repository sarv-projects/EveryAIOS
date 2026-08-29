import { webcrypto } from 'node:crypto';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { ProviderVault } from '../vault.js';
import type { KeyValueStore } from '../types.js';

function createMockStore(): KeyValueStore & { dump: () => string | null; setDelays: (r: number, w: number) => void } {
  const memory = new Map<string, string>();
  let readDelay = 0;
  let writeDelay = 0;

  return {
    async getItem(key) {
      if (readDelay > 0) await new Promise((r) => setTimeout(r, readDelay));
      return memory.get(key) ?? null;
    },
    async setItem(key, value) {
      if (writeDelay > 0) await new Promise((r) => setTimeout(r, writeDelay));
      memory.set(key, value);
    },
    async removeItem(key) {
      memory.delete(key);
    },
    dump() {
      return memory.get('byok.providers.v1') ?? null;
    },
    setDelays(r: number, w: number) {
      readDelay = r;
      writeDelay = w;
    },
  };
}

function mockFetch(): typeof fetch {
  return vi.fn(async (url: string | URL | Request) => {
    const resolved = typeof url === 'string' ? url : url.toString();
    // Handle all validation endpoints: /models (OpenAI-compatible), /messages (Anthropic),
    // /auth/key (OpenRouter), or any other provider-specific endpoint
    if (resolved.endsWith('/models') || resolved.endsWith('/messages') || resolved.endsWith('/auth/key') || resolved.endsWith('/ping')) {
      return new Response(JSON.stringify({ data: [{ id: 'model' }] }), { status: 200 });
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;
}

beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ProviderVault concurrency', () => {
  it('serializes concurrent saves via mutex', async () => {
    const store = createMockStore();
    store.setDelays(0, 10);
    const vault = new ProviderVault(store, 'device-secret-test');
    const fetchImpl = mockFetch();

    // Launch 3 concurrent saves — mutex should serialize them
    await Promise.all([
      vault.save({ id: 'nvidia-nim', apiKey: 'key-1', fetchImpl }),
      vault.save({ id: 'groq', apiKey: 'key-2', fetchImpl }),
      vault.save({ id: 'cerebras', apiKey: 'key-3', fetchImpl }),
    ]);

    const list = await vault.list();
    expect(list).toHaveLength(3);
    expect(list.map((p) => p.id).sort()).toEqual(['cerebras', 'groq', 'nvidia-nim']);

    // Each key should be retrievable
    expect(await vault.getApiKey('nvidia-nim')).toBe('key-1');
    expect(await vault.getApiKey('groq')).toBe('key-2');
    expect(await vault.getApiKey('cerebras')).toBe('key-3');
  });

  it('getApiKey is mutexed — concurrent reads during write do not corrupt', async () => {
    const store = createMockStore();
    store.setDelays(0, 20);
    const vault = new ProviderVault(store, 'device-secret-test');
    const fetchImpl = mockFetch();

    await vault.save({ id: 'nvidia-nim', apiKey: 'old-key', fetchImpl });
    expect(await vault.getApiKey('nvidia-nim')).toBe('old-key');

    // Start a save (update key) and a getApiKey concurrently
    const savePromise = vault.save({ id: 'nvidia-nim', apiKey: 'new-key', fetchImpl });
    const getKeyPromise = vault.getApiKey('nvidia-nim');

    await savePromise;
    const key = await getKeyPromise;

    expect(typeof key).toBe('string');
    expect(key!.length).toBeGreaterThan(0);
    expect(await vault.getApiKey('nvidia-nim')).toBe('new-key');
  });

  it('remove is mutexed — concurrent remove + save do not corrupt', async () => {
    const store = createMockStore();
    store.setDelays(0, 10);
    const vault = new ProviderVault(store, 'device-secret-test');
    const fetchImpl = mockFetch();

    await vault.save({ id: 'nvidia-nim', apiKey: 'key-1', fetchImpl });
    await vault.save({ id: 'groq', apiKey: 'key-2', fetchImpl });

    await Promise.all([
      vault.remove('nvidia-nim'),
      vault.save({ id: 'cerebras', apiKey: 'key-3', fetchImpl }),
    ]);

    const list = await vault.list();
    const ids = list.map((p) => p.id).sort();
    expect(ids).toEqual(['cerebras', 'groq']);
  });

  it('handles concurrent saves of anthropic provider (uses /messages endpoint)', async () => {
    const store = createMockStore();
    store.setDelays(0, 10);
    const vault = new ProviderVault(store, 'device-secret-test');
    const fetchImpl = mockFetch();

    // Anthropic validates via /messages endpoint — mock handles it
    await vault.save({ id: 'anthropic', apiKey: 'sk-ant-test-key', fetchImpl });
    expect(await vault.getApiKey('anthropic')).toBe('sk-ant-test-key');
    expect(await vault.list()).toHaveLength(1);
  });

  it('list does not return corrupted records from concurrent writes', async () => {
    const store = createMockStore();
    store.setDelays(0, 15);
    const vault = new ProviderVault(store, 'device-secret-test');
    const fetchImpl = mockFetch();

    // Rapidly save 5 providers concurrently
    const saves = ['nvidia-nim', 'groq', 'cerebras', 'openai', 'deepseek'].map((id, i) =>
      vault.save({ id, apiKey: `key-${i}`, fetchImpl }),
    );
    await Promise.all(saves);

    const list = await vault.list();
    expect(list).toHaveLength(5);

    for (const [id, key] of [['nvidia-nim', 'key-0'], ['groq', 'key-1'], ['cerebras', 'key-2'], ['openai', 'key-3'], ['deepseek', 'key-4']] as const) {
      expect(await vault.getApiKey(id)).toBe(key);
    }
  });
});
