/**
 * Tests for the batch-3 mobile connectors (2026-07-23):
 *   Finnhub, Trello, Slack, AviationStack (proxied), SoundCloud.
 * All tests mock fetch() so they don't hit any live APIs.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FinnhubAdapter } from '../adapters/finnhub-adapter.js';
import { TrelloAdapter } from '../adapters/trello-adapter.js';
import { SlackAdapter } from '../adapters/slack-adapter.js';
import { AviationstackAdapter } from '../adapters/aviationstack-adapter.js';
import { SoundcloudAdapter } from '../adapters/soundcloud-adapter.js';

const CTX = (
  filter: Record<string, unknown>,
  env?: Record<string, string>,
) => ({
  userId: 'u',
  query: { text: '' },
  filter,
  env,
});

describe('FinnhubAdapter', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns empty when no API key is provided', async () => {
    const a = new FinnhubAdapter();
    const out = await a.fetch(CTX({ query: 'AAPL' }));
    expect(out.items).toEqual([]);
  });

  it('maps /quote response into a single ConnectorItem with price + change', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ c: 213.45, d: 1.95, dp: 0.92, h: 215.00, l: 211.10, o: 212.50, pc: 211.50, t: 1753270000 }),
    } as Response));
    const a = new FinnhubAdapter();
    const out = await a.fetch(CTX({ query: '$AAPL', apiKey: 'key' }));
    expect(out.items[0]?.title).toContain('AAPL');
    expect(out.items[0]?.title).toContain('213.45');
    expect(out.items[0]?.metadata?.price).toBe(213.45);
    expect(out.items[0]?.snippet).toContain('▲'); // positive direction
  });

  it('routes currency-pair queries to /forex/rates', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ quote: 0.9265 }),
    } as Response));
    const a = new FinnhubAdapter();
    const out = await a.fetch(CTX({ query: 'USD to EUR', apiKey: 'key' }));
    expect(out.items[0]?.title).toContain('USD/EUR');
    expect(out.items[0]?.snippet).toContain('0.9265');
  });

  it('falls back to /search when no ticker is detected', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ result: [{ symbol: 'TSLA', description: 'Tesla Inc' }] }) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ c: 250.10, d: -2.50, dp: -0.99, pc: 252.60 }) } as Response);
    vi.stubGlobal('fetch', fetchMock);
    const a = new FinnhubAdapter();
    const out = await a.fetch(CTX({ query: 'Tesla', apiKey: 'key' }));
    expect(out.items[0]?.metadata?.symbol).toBe('TSLA');
    expect(out.items[0]?.snippet).toContain('▼'); // negative direction
  });

  it('handles API errors gracefully (returns a single status item)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: false, status: 429, json: async () => ({}) } as Response));
    const a = new FinnhubAdapter();
    const out = await a.fetch(CTX({ query: 'AAPL', apiKey: 'key' }));
    expect(out.items[0]?.snippet).toContain('429');
  });
});

describe('TrelloAdapter', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns empty when token or apiKey missing', async () => {
    const a = new TrelloAdapter();
    expect((await a.fetch(CTX({ query: 'deploy' }))).items).toEqual([]);
    expect((await a.fetch(CTX({ query: 'deploy', token: 't' }))).items).toEqual([]);
  });

  it('maps members/me/cards into ConnectorItems with labels', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ([
        { id: 'c1', name: 'Ship v2', desc: 'Final QA pass', due: '2026-08-01T00:00:00Z', dueComplete: false, shortUrl: 'https://trello.com/c/1', idBoard: 'b1', labels: [{ name: 'urgent', color: 'red' }] },
        { id: 'c2', name: 'Refactor billing', desc: '', shortUrl: 'https://trello.com/c/2', idBoard: 'b1', labels: [] },
      ]),
    } as Response));
    const a = new TrelloAdapter();
    const out = await a.fetch(CTX({ token: 't', apiKey: 'k', query: '' }));
    expect(out.items[0]?.title).toBe('Ship v2');
    expect(out.items[0]?.snippet).toContain('urgent');
    expect(out.items[0]?.url).toContain('trello.com');
  });

  it('uses /search endpoint when query is provided', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ cards: [{ id: 's1', name: 'Found this', shortUrl: 'https://trello.com/c/s1', desc: 'match' }] }),
    } as Response);
    vi.stubGlobal('fetch', fetchMock);
    const a = new TrelloAdapter();
    await a.fetch(CTX({ query: 'billing', token: 't', apiKey: 'k' }));
    const url = fetchMock.mock.calls[0]?.[0] as string;
    expect(url).toContain('/search');
    expect(url).toContain('query=billing');
  });
});

describe('SlackAdapter', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns empty when no token is provided', async () => {
    const a = new SlackAdapter();
    expect((await a.fetch(CTX({ query: 'any' }))).items).toEqual([]);
  });

  it('searches messages and maps to items', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, messages: { matches: [{ ts: '1753270000.001', text: 'deploy is live', channel: { id: 'C1', name: 'engineering' }, user: 'U1' }] } }),
    } as Response));
    const a = new SlackAdapter();
    const out = await a.fetch(CTX({ query: 'deploy', token: 'tk' }));
    expect(out.items[0]?.title).toContain('engineering');
    expect(out.items[0]?.snippet).toContain('deploy is live');
    expect(out.items[0]?.metadata?.channel).toBe('C1');
  });

  it('resolves #channel queries via conversations.list + history', async () => {
    const fetchMock = vi
      .fn()
      // 1st call: conversations.list
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, channels: [{ id: 'C9', name: 'random' }] }) } as Response)
      // 2nd call: conversations.history
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, messages: [{ ts: '1753270000.001', text: 'hi room' }] }) } as Response);
    vi.stubGlobal('fetch', fetchMock);
    const a = new SlackAdapter();
    const out = await a.fetch(CTX({ query: '#random', token: 'tk' }));
    expect(out.items[0]?.title).toContain('random');
    expect(out.items[0]?.snippet).toContain('hi room');
  });

  it('reports Slack API errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: false, error: 'invalid_auth' }),
    } as Response));
    const a = new SlackAdapter();
    const out = await a.fetch(CTX({ query: 'anything', token: 'tk' }));
    expect(out.items[0]?.snippet).toContain('invalid_auth');
  });
});

describe('AviationstackAdapter', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns empty when query is empty', async () => {
    const a = new AviationstackAdapter();
    expect((await a.fetch(CTX({ query: '' }))).items).toEqual([]);
  });

  it('routes through the Worker proxy and parses flight_iata', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [{
          flight_date: '2026-07-23',
          flight_status: 'active',
          airline: { name: 'United', iata: 'UA' },
          flight: { iata: 'UA2490', number: '2490' },
          departure: { iata: 'SFO', scheduled: '2026-07-23T08:30:00Z', estimated: '2026-07-23T08:32:00Z' },
          arrival: { iata: 'JFK', scheduled: '2026-07-23T17:05:00Z' },
        }],
      }),
    } as Response));
    const a = new AviationstackAdapter();
    const out = await a.fetch(CTX({ query: 'UA2490' }));
    expect(out.items[0]?.title).toContain('UA2490');
    expect(out.items[0]?.metadata?.status).toBe('active');
    expect(out.items[0]?.snippet).toContain('SFO');
    expect(out.items[0]?.snippet).toContain('JFK');
  });

  it('returns a banner item on quota-exceeded errors from proxy', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({ error: 'RATE_LIMITED' }),
    } as Response));
    const a = new AviationstackAdapter();
    const out = await a.fetch(CTX({ query: 'UA2490' }));
    expect(out.items[0]?.snippet).toContain('429');
    expect(out.items[0]?.snippet).toContain('100 req/month');
  });
});

describe('SoundcloudAdapter', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns empty when missing token or query (no fetch call)', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    try {
      const a = new SoundcloudAdapter();
      // Token missing → empty, no fetch.
      expect((await a.fetch(CTX({ query: 'lofi' }))).items).toEqual([]);
      // Query empty (but token set) → empty, no fetch (SoundCloud 400s on /tracks?q=).
      expect((await a.fetch(CTX({ query: '', token: 'tk' }))).items).toEqual([]);
      // Regression guard: neither path should have called the global fetch.
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('maps tracks response into ConnectorItems with artist + duration', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ([
        { id: 1, title: 'Lofi Beats', user: { username: 'goldmix', permalink_url: 'https://soundcloud.com/goldmix' }, duration: 192000, playback_count: 123456, genre: 'Lo-fi', permalink_url: 'https://soundcloud.com/goldmix/lofi-beats' },
      ]),
    } as Response));
    const a = new SoundcloudAdapter();
    const out = await a.fetch(CTX({ query: 'lofi', token: 'tk' }));
    expect(out.items[0]?.title).toBe('Lofi Beats');
    expect(out.items[0]?.metadata?.artist).toBe('goldmix');
    expect(out.items[0]?.snippet).toContain('3:12'); // 192000ms = 3:12
  });
});
