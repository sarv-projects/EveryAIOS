import { describe, expect, it } from 'vitest';
import {
  PROVIDER_CATALOG,
  filterProvidersBySection,
  getProviderById,
  getRecommendedProviders,
  groupProvidersByLabel,
} from '../registry.js';

describe('PROVIDER_CATALOG', () => {
  it('contains core launch providers at the front of the catalog', () => {
    const ids = PROVIDER_CATALOG.map((entry) => entry.id);
    expect(ids.slice(0, 5)).toEqual([
      'nvidia-nim',
      'cerebras',
      'google-ai-studio',
      'openrouter',
      'opencode-go',
    ]);
    expect(ids.length).toBeGreaterThanOrEqual(20);
  });

  it('includes signup URLs and default base URLs', () => {
    const nvidia = getProviderById('nvidia-nim');
    expect(nvidia?.signupUrl).toContain('build.nvidia.com');
    expect(nvidia?.baseUrl).toBe('https://integrate.api.nvidia.com/v1');
    expect(nvidia?.defaultModel).toBeTruthy();
  });

  it('groups providers for tile UI', () => {
    const grouped = groupProvidersByLabel();
    const labels = grouped.map((group) => group.label);
    // Labels are user-facing per spec §4a.6 — "Free to start", "Best value (PAYG)", etc.
    expect(labels).toContain('Free to start');
    expect(labels).toContain('Multi-model access');
    expect(labels).toContain('Best value (PAYG)');
  });

  it('splits AI vs web/other provider catalogs', () => {
    const ai = filterProvidersBySection('ai');
    const web = filterProvidersBySection('web-other');
    expect(ai.some((entry) => entry.id === 'openai')).toBe(true);
    expect(ai.some((entry) => entry.id === 'exa')).toBe(false);
    expect(web.some((entry) => entry.id === 'exa')).toBe(true);
    expect(web.some((entry) => entry.id === 'fal-ai')).toBe(true);
    expect(web.some((entry) => entry.id === 'parallel-mcp')).toBe(true);
  });

  it('returns three recommended free providers for connect prompt', () => {
    const recommended = getRecommendedProviders();
    expect(recommended.map((entry) => entry.id)).toEqual([
      'nvidia-nim',
      'cerebras',
      'google-ai-studio',
    ]);
  });
});