import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

function mockFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const resolved = typeof url === 'string' ? url : url.toString();
    return handler(resolved, init);
  }) as typeof fetch;
}

beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ProviderVault', () => {
  it('saves a validated provider with a sealed key', async () => {
    const store = createMockStore();
    const vault = new ProviderVault(store, 'device-secret-test');
    const fetchImpl = mockFetch((url) => {
      if (url.endsWith('/models')) {
        return new Response(JSON.stringify({ data: [{ id: 'meta/llama3-8b-instruct' }] }), {
          status: 200,
        });
      }
      return new Response('not found', { status: 404 });
    });

    const connected = await vault.save({
      id: 'nvidia-nim',
      apiKey: 'nvapi-test-key',
      fetchImpl,
    });

    expect(connected.id).toBe('nvidia-nim');
    expect(connected.isActive).toBe(true);
    const raw = store.dump();
    expect(raw).toBeTruthy();
    expect(raw).not.toContain('nvapi-test-key');
    expect(await vault.getApiKey('nvidia-nim')).toBe('nvapi-test-key');
  });

  it('rejects invalid API keys before saving', async () => {
    const store = createMockStore();
    const vault = new ProviderVault(store, 'device-secret-test');
    const fetchImpl = mockFetch(() => new Response('unauthorized', { status: 401 }));

    await expect(
      vault.save({
        id: 'cerebras',
        apiKey: 'bad-key',
        fetchImpl,
      }),
    ).rejects.toThrow(/failed/i);

    expect(await vault.list()).toHaveLength(0);
  });

  it('lists, filters active providers, and removes entries', async () => {
    const store = createMockStore();
    const vault = new ProviderVault(store, 'device-secret-test');
    const fetchImpl = mockFetch((url) => {
      if (url.endsWith('/models')) {
        return new Response(JSON.stringify({ data: [{ id: 'model' }] }), { status: 200 });
      }
      return new Response('not found', { status: 404 });
    });

    await vault.save({ id: 'nvidia-nim', apiKey: 'key-1', fetchImpl });
    await vault.save({ id: 'groq', apiKey: 'key-2', fetchImpl });
    await vault.setActive('groq', false);

    expect(await vault.list()).toHaveLength(2);
    expect((await vault.getActive()).map((entry) => entry.id)).toEqual(['nvidia-nim']);

    await vault.remove('nvidia-nim');
    expect(await vault.list()).toEqual([
      expect.objectContaining({ id: 'groq', isActive: false }),
    ]);
  });
});