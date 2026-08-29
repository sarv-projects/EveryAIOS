import { getProviderById } from '../registry.js';

export type ProviderPricing = {
  providerId: string;
  model: string;
  inputPerMillionUsd: number | null;
  outputPerMillionUsd: number | null;
  currency: 'USD';
  source: 'catalog' | 'cached' | 'live';
  fetchedAt: string;
  note?: string;
};

/** Static fallback when live catalog fetch is unavailable. */
const CACHED_PRICING: Record<string, Omit<ProviderPricing, 'providerId' | 'fetchedAt' | 'source'>> = {
  openai: {
    model: 'gpt-4o-mini',
    inputPerMillionUsd: 0.15,
    outputPerMillionUsd: 0.6,
    currency: 'USD',
    note: 'Cached estimate — verify on platform.openai.com before billing.',
  },
  anthropic: {
    model: 'claude-sonnet-5',
    inputPerMillionUsd: 3,
    outputPerMillionUsd: 15,
    currency: 'USD',
    note: 'Cached estimate — verify on platform.claude.com pricing.',
  },
  deepseek: {
    model: 'deepseek-v4-flash',
    inputPerMillionUsd: 0.14,
    outputPerMillionUsd: 0.28,
    currency: 'USD',
    note: 'Official DeepSeek V4 Flash pricing (api-docs.deepseek.com).',
  },
  groq: {
    model: 'openai/gpt-oss-120b',
    inputPerMillionUsd: 0.15,
    outputPerMillionUsd: 0.6,
    currency: 'USD',
    note: 'Groq pricing for gpt-oss-120b (console.groq.com/docs/models).',
  },
  'nvidia-nim': {
    model: 'meta/llama-3.1-8b-instruct',
    inputPerMillionUsd: 0,
    outputPerMillionUsd: 0,
    currency: 'USD',
    note: 'Forever-free tier — subject to provider fair-use limits.',
  },
  cerebras: {
    model: 'gpt-oss-120b',
    inputPerMillionUsd: 0,
    outputPerMillionUsd: 0,
    currency: 'USD',
    note: 'Free trial + PAYG; production model per Cerebras catalog.',
  },
};

const pricingCache = new Map<string, ProviderPricing>();

/**
 * Fetch provider pricing from live catalog when available, else cached JSON.
 * OpenRouter exposes public model pricing — other providers use cached fallbacks.
 */
export async function fetchProviderPricing(providerId: string): Promise<ProviderPricing | null> {
  const cached = pricingCache.get(providerId);
  if (cached && Date.now() - new Date(cached.fetchedAt).getTime() < 60 * 60 * 1000) {
    return cached;
  }

  const catalog = getProviderById(providerId);
  if (!catalog) {
    return null;
  }

  if (providerId === 'openrouter') {
    const live = await fetchOpenRouterPricing(catalog.defaultModel);
    if (live) {
      pricingCache.set(providerId, live);
      return live;
    }
  }

  const fallback = CACHED_PRICING[providerId];
  const result: ProviderPricing = {
    providerId,
    model: fallback?.model ?? catalog.defaultModel,
    inputPerMillionUsd: fallback?.inputPerMillionUsd ?? null,
    outputPerMillionUsd: fallback?.outputPerMillionUsd ?? null,
    currency: 'USD',
    source: fallback ? 'cached' : 'catalog',
    fetchedAt: new Date().toISOString(),
    ...(fallback?.note ? { note: fallback.note } : {}),
  };
  pricingCache.set(providerId, result);
  return result;
}

async function fetchOpenRouterPricing(defaultModel: string): Promise<ProviderPricing | null> {
  try {
    const response = await fetch('https://openrouter.ai/api/v1/models');
    if (!response.ok) {
      return null;
    }
    const body = (await response.json()) as {
      data?: Array<{
        id: string;
        pricing?: { prompt?: string; completion?: string };
      }>;
    };
    const match =
      body.data?.find((m) => m.id === defaultModel) ??
      body.data?.find((m) => m.id.includes('free'));
    if (!match?.pricing) {
      return null;
    }
    return {
      providerId: 'openrouter',
      model: match.id,
      inputPerMillionUsd: parseUsdPerMillion(match.pricing.prompt),
      outputPerMillionUsd: parseUsdPerMillion(match.pricing.completion),
      currency: 'USD',
      source: 'live',
      fetchedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

function parseUsdPerMillion(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const perToken = Number.parseFloat(value);
  if (!Number.isFinite(perToken)) {
    return null;
  }
  return perToken * 1_000_000;
}

export function formatPricingLine(pricing: ProviderPricing): string {
  if (pricing.inputPerMillionUsd === 0 && pricing.outputPerMillionUsd === 0) {
    return 'Free tier';
  }
  const input = pricing.inputPerMillionUsd != null ? `$${pricing.inputPerMillionUsd}/M in` : 'in: n/a';
  const output =
    pricing.outputPerMillionUsd != null ? `$${pricing.outputPerMillionUsd}/M out` : 'out: n/a';
  return `${input} · ${output}`;
}