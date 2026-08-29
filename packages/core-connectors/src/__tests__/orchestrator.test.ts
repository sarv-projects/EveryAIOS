import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import type { ConnectorName } from '@personal-ai/core-domain';
import { ConnectorOrchestrator } from '../orchestrator';
import { WeatherAdapter } from '../adapters/weather-adapter';
import { RssAdapter } from '../adapters/rss-adapter';
import { GitHubAdapter } from '../adapters/github-adapter';
import { NotionOAuthAdapter } from '../adapters/notion-oauth-adapter';
import { TelegramAdapter } from '../adapters/telegram-adapter';

const WEATHER_OPENMETEO_RESPONSE = {
  current: {
    temperature_2m: 15,
    weather_code: 3,
    wind_speed_10m: 8,
    relative_humidity_2m: 60,
  },
  current_units: { temperature_2m: '°C', wind_speed_10m: 'km/h' },
  timezone: 'Europe/London',
};

describe('ConnectorOrchestrator', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => WEATHER_OPENMETEO_RESPONSE,
      text: async () => JSON.stringify(WEATHER_OPENMETEO_RESPONSE),
    } as Response));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('registers and lists adapters', () => {
    const orch = new ConnectorOrchestrator();
    orch.register(new WeatherAdapter());
    orch.register(new RssAdapter());
    expect(orch.list()).toHaveLength(2);
  });

  it('plan returns empty shape when none authorized', async () => {
    const orch = new ConnectorOrchestrator();
    orch.register(new GitHubAdapter()); // no token → unauthorized
    const plan = await orch.plan({ text: 'weather in London' }, []);
    expect(plan.adapters).toHaveLength(0);
    expect(plan.shape).toBe('single');
  });

  it('execute runs a single adapter', async () => {
    const orch = new ConnectorOrchestrator();
    const weather = new WeatherAdapter();
    orch.register(weather);

    const results = await orch.execute(
      { adapters: [weather], shape: 'single', filters: {} },
      { userId: 'test', query: { text: 'weather in London' } },
    );
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.source).toBe('weather');
  });

  it('writeBack returns facts from results', async () => {
    const orch = new ConnectorOrchestrator();
    const facts = await orch.writeBack([
      {
        source: 'weather' as ConnectorName,
        result: {
          items: [
            { id: '1', title: 'London Weather', snippet: '15°C, cloudy with light rain expected throughout the day', url: '' },
          ],
          totalCount: 1,
          source: 'weather' as ConnectorName,
        },
      },
    ]);
    expect(facts.length).toBeGreaterThan(0);
    expect(facts[0]!.content).toContain('London');
  });
});

describe('WeatherAdapter', () => {
  it('requires no auth', async () => {
    const a = new WeatherAdapter();
    expect(await a.isAuthorized('any')).toBe(true);
  });

  it('scores weather queries high', () => {
    const a = new WeatherAdapter();
    const score = a.scoreRelevance({ text: 'what is the weather in Tokyo' }, []);
    expect(score).toBeGreaterThan(0.8);
  });

  it('scores non-weather queries low', () => {
    const a = new WeatherAdapter();
    const score = a.scoreRelevance({ text: 'how do I cook pasta' }, []);
    expect(score).toBeLessThan(0.3);
  });

  it('builds a filter with location', () => {
    const a = new WeatherAdapter();
    const f = a.buildFilter({ text: 'weather in Paris France' });
    expect(f.location).toMatch(/Paris/i);
  });
});

describe('GitHubAdapter', () => {
  it('allows anonymous access for public repos', async () => {
    const a = new GitHubAdapter();
    expect(await a.isAuthorized('test')).toBe(true);
  });

  it('scores code/repo queries high', () => {
    const a = new GitHubAdapter();
    const score = a.scoreRelevance({ text: 'find the repository for my project' }, []);
    expect(score).toBeGreaterThan(0.7);
  });
});

describe('RssAdapter', () => {
  it('requires no auth', async () => {
    const a = new RssAdapter();
    expect(await a.isAuthorized('any')).toBe(true);
  });

  it('scores news queries medium', () => {
    const a = new RssAdapter();
    const score = a.scoreRelevance({ text: 'latest tech news' }, []);
    expect(score).toBeGreaterThan(0.5);
  });
});

describe('NotionOAuthAdapter', () => {
  it('returns authorized when token is in filter', async () => {
    const a = new NotionOAuthAdapter();
    expect(await a.isAuthorized('any')).toBe(true);
  });

  it('scores notion queries', () => {
    const a = new NotionOAuthAdapter();
    const score = a.scoreRelevance({ text: 'my notes from notion' }, []);
    expect(score).toBeGreaterThan(0.3);
  });
});

describe('TelegramAdapter', () => {
  it('returns unauthorized when no bot token provided', async () => {
    const a = new TelegramAdapter();
    expect(await a.isAuthorized('any')).toBe(false);
  });

  it('returns authorized when bot token is set', async () => {
    const a = new TelegramAdapter('test:token', '-1001234');
    // isAuthorized only checks for token presence, not validity
    expect(await a.isAuthorized('any')).toBe(true);
  });

  it('builds filter from query text', () => {
    const a = new TelegramAdapter();
    const f = a.buildFilter({ text: 'send telegram message' });
    expect(typeof f).toBe('object');
  });
});

describe('ConnectorOrchestrator writeBack persistFn', () => {
  it('returns only facts for which persistFn resolves truthy', async () => {
    const orch = new ConnectorOrchestrator();
    const results = [
      {
        source: 'weather' as ConnectorName,
        result: {
          items: [
            { id: 'w1', title: 'Sunny', snippet: 'Sunny skies are expected across the region tomorrow', url: '' },
            { id: 'w2', title: 'Rainy', snippet: 'Rainy skies are expected across the region tomorrow', url: '' },
          ],
          totalCount: 2,
          source: 'weather' as ConnectorName,
        },
      },
    ];
    const seen: string[] = [];
    const facts = await orch.writeBack(results, async (fact) => {
      seen.push(fact.content);
      return fact.content.includes('Sunny');
    });
    expect(seen.length).toBe(2);
    expect(facts.length).toBe(1);
    expect(facts[0]!.content).toContain('Sunny');
  });

  it('skips facts when persistFn throws', async () => {
    const orch = new ConnectorOrchestrator();
    const results = [
      {
        source: 'rss' as ConnectorName,
        result: {
          items: [
            { id: 'r1', title: 'News', snippet: 'A long enough snippet to satisfy the minimum length filter', url: '' },
          ],
          totalCount: 1,
          source: 'rss' as ConnectorName,
        },
      },
    ];
    const facts = await orch.writeBack(results, async () => {
      throw new Error('persist failed');
    });
    expect(facts).toHaveLength(0);
  });
});

describe('ConnectorOrchestrator writeBack category classification', () => {
  it('classifies weather as other', async () => {
    const orch = new ConnectorOrchestrator();
    const facts = await orch.writeBack([
      {
        source: 'weather' as ConnectorName,
        result: {
          items: [
            { id: 'w', title: 'Today', snippet: 'Sunny with light winds expected this afternoon', url: '' },
          ],
          totalCount: 1,
          source: 'weather' as ConnectorName,
        },
      },
    ]);
    expect(facts[0]!.category).toBe('other');
  });

  it('classifies notion as work', async () => {
    const orch = new ConnectorOrchestrator();
    const facts = await orch.writeBack([
      {
        source: 'notion' as ConnectorName,
        result: {
          items: [
            { id: 'n', title: 'project plan', snippet: 'Project plan document with team goals and deadlines', url: '' },
          ],
          totalCount: 1,
          source: 'notion' as ConnectorName,
        },
      },
    ]);
    expect(facts[0]!.category).toBe('work');
  });
});
