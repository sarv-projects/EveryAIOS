import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { fetchProviderPricing, formatPricingLine } from '../pricing/live-pricing.js';

vi.mock('../registry.js', () => ({
  getProviderById: vi.fn((id: string) => {
    const catalog: Record<string, { name: string; baseUrl: string; defaultModel: string; group: string; groupLabel: string; validation?: string }> = {
      openrouter: { name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api', defaultModel: 'openai/gpt-4o-mini', group: 'llm', groupLabel: 'LLM' },
      openai: { name: 'OpenAI', baseUrl: 'https://api.openai.com', defaultModel: 'gpt-4o-mini', group: 'llm', groupLabel: 'LLM' },
      anthropic: { name: 'Anthropic', baseUrl: 'https://api.anthropic.com', defaultModel: 'claude-sonnet-5', group: 'llm', groupLabel: 'LLM' },
      deepseek: { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com', defaultModel: 'deepseek-v4-flash', group: 'llm', groupLabel: 'LLM' },
      groq: { name: 'Groq', baseUrl: 'https://api.groq.com', defaultModel: 'openai/gpt-oss-120b', group: 'llm', groupLabel: 'LLM' },
      'nvidia-nim': { name: 'NVIDIA NIM', baseUrl: 'https://integrate.api.nvidia.com', defaultModel: 'meta/llama-3.1-8b-instruct', group: 'llm', groupLabel: 'LLM' },
      cerebras: { name: 'Cerebras', baseUrl: 'https://api.cerebras.ai', defaultModel: 'gpt-oss-120b', group: 'llm', groupLabel: 'LLM' },
    };
    return catalog[id] ?? null;
  }),
}));

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('not found', { status: 404 })));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fetchProviderPricing', () => {
  it('returns null for unknown provider', async () => {
    const pricing = await fetchProviderPricing('nonexistent');
    expect(pricing).toBeNull();
  });

  it('returns cached fallback for OpenAI', async () => {
    const pricing = await fetchProviderPricing('openai');
    expect(pricing).not.toBeNull();
    expect(pricing!.providerId).toBe('openai');
    expect(pricing!.source).toBe('cached');
    expect(pricing!.inputPerMillionUsd).toBe(0.15);
    expect(pricing!.outputPerMillionUsd).toBe(0.6);
  });

  it('returns cached fallback for Anthropic', async () => {
    const pricing = await fetchProviderPricing('anthropic');
    expect(pricing).not.toBeNull();
    expect(pricing!.providerId).toBe('anthropic');
    expect(pricing!.source).toBe('cached');
    expect(pricing!.inputPerMillionUsd).toBe(3);
  });

  it('returns cached fallback for DeepSeek', async () => {
    const pricing = await fetchProviderPricing('deepseek');
    expect(pricing).not.toBeNull();
    expect(pricing!.inputPerMillionUsd).toBe(0.14);
  });

  it('returns cached fallback for Groq', async () => {
    const pricing = await fetchProviderPricing('groq');
    expect(pricing).not.toBeNull();
    expect(pricing!.inputPerMillionUsd).toBe(0.15);
  });

  it('returns cached free-tier for nvidia-nim', async () => {
    const pricing = await fetchProviderPricing('nvidia-nim');
    expect(pricing).not.toBeNull();
    expect(pricing!.inputPerMillionUsd).toBe(0);
    expect(pricing!.outputPerMillionUsd).toBe(0);
  });

  it('calls fetch for OpenRouter live pricing', async () => {
    // Must run before 'fetches live pricing' to avoid cache pollution from module-level pricingCache
    const fetchSpy = vi.fn(async (url: string | URL | Request) => {
      const resolved = typeof url === 'string' ? url : url.toString();
      if (resolved.includes('openrouter.ai/api/v1/models')) {
        return new Response(
          JSON.stringify({
            data: [{
              id: 'openai/gpt-4o-mini',
              pricing: { prompt: '0.00000015', completion: '0.0000006' },
            }],
          }),
          { status: 200 },
        );
      }
      return new Response('not found', { status: 404 });
    }) as typeof fetch;
    vi.stubGlobal('fetch', fetchSpy);

    await fetchProviderPricing('openrouter');
    expect(fetchSpy).toHaveBeenCalled();
  });

  it('fetches live pricing from OpenRouter when available', async () => {
    const fetchSpy = vi.fn(async (url: string | URL | Request) => {
      const resolved = typeof url === 'string' ? url : url.toString();
      if (resolved.includes('openrouter.ai/api/v1/models')) {
        return new Response(
          JSON.stringify({
            data: [
              {
                id: 'openai/gpt-4o-mini',
                pricing: { prompt: '0.00000015', completion: '0.0000006' },
              },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response('not found', { status: 404 });
    }) as typeof fetch;
    vi.stubGlobal('fetch', fetchSpy);

    const pricing = await fetchProviderPricing('openrouter');
    expect(pricing).not.toBeNull();
    expect(pricing!.source).toBe('live');
    expect(pricing!.inputPerMillionUsd).toBe(0.15);
    expect(pricing!.outputPerMillionUsd).toBe(0.6);
  });

  it('falls back to cached when OpenRouter fetch fails', async () => {
    const fetchSpy = vi.fn(async () => new Response('error', { status: 500 })) as typeof fetch;
    vi.stubGlobal('fetch', fetchSpy);

    const pricing = await fetchProviderPricing('openai');
    expect(pricing).not.toBeNull();
    expect(pricing!.source).toBe('cached');
  });

  it('returns cached result from previous call without re-fetching', async () => {
    const pricing1 = await fetchProviderPricing('openai');
    expect(pricing1!.source).toBe('cached');

    const pricing2 = await fetchProviderPricing('openai');
    expect(pricing2!.source).toBe('cached');
    expect(pricing2!.inputPerMillionUsd).toBe(pricing1!.inputPerMillionUsd);
  });
});

describe('formatPricingLine', () => {
  it('formats free tier', () => {
    expect(formatPricingLine({
      providerId: 'nvidia-nim',
      model: 'meta/llama-3.1-8b-instruct',
      inputPerMillionUsd: 0,
      outputPerMillionUsd: 0,
      currency: 'USD',
      source: 'cached',
      fetchedAt: new Date().toISOString(),
    })).toBe('Free tier');
  });

  it('formats paid tier with both input and output', () => {
    expect(formatPricingLine({
      providerId: 'openai',
      model: 'gpt-4o-mini',
      inputPerMillionUsd: 0.15,
      outputPerMillionUsd: 0.6,
      currency: 'USD',
      source: 'cached',
      fetchedAt: new Date().toISOString(),
    })).toBe('$0.15/M in · $0.6/M out');
  });

  it('formats pricing with null output', () => {
    expect(formatPricingLine({
      providerId: 'custom',
      model: 'custom',
      inputPerMillionUsd: 1,
      outputPerMillionUsd: null,
      currency: 'USD',
      source: 'catalog',
      fetchedAt: new Date().toISOString(),
    })).toBe('$1/M in · out: n/a');
  });
});
