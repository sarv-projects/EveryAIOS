/**
 * Tests for the mobile-useful connector adapters added in the 2026-07 expansion:
 *   Spotify, Reddit, Todoist, Google Places, CoinGecko, StackExchange, OpenLibrary.
 *
 * All tests mock fetch() so they don't hit any live APIs.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SpotifyAdapter } from '../adapters/spotify-adapter.js';
import { RedditAdapter } from '../adapters/reddit-adapter.js';
import { TodoistAdapter } from '../adapters/todoist-adapter.js';
import { GooglePlacesAdapter } from '../adapters/google-places-adapter.js';
import { CoingeckoAdapter } from '../adapters/coingecko-adapter.js';
import { StackExchangeAdapter } from '../adapters/stackexchange-adapter.js';
import { OpenLibraryAdapter } from '../adapters/openlibrary-adapter.js';

const BASE_CTX = (filter: Record<string, unknown> = {}, env?: Record<string, string>) => ({
  userId: 'u',
  query: { text: '' },
  filter,
  env,
});

describe('SpotifyAdapter', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns empty when no OAuth token is provided', async () => {
    const a = new SpotifyAdapter();
    const out = await a.fetch(BASE_CTX({ query: 'lofi', type: 'track' }));
    expect(out.items).toEqual([]);
  });

  it('parses Spotify search response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        tracks: { items: [{ id: '1', name: 'Lofi Study', artists: [{ name: 'A' }], album: { name: 'Vol 1' }, duration_ms: 180000, popularity: 60, external_urls: { spotify: 'https://open.spotify.com/track/1' } }] },
        artists: { items: [] },
        albums: { items: [] },
        playlists: { items: [] },
      }),
    } as Response));
    const a = new SpotifyAdapter();
    const out = await a.fetch(BASE_CTX({ query: 'lofi', type: 'track', token: 'tk' }));
    expect(out.items[0]?.title).toBe('Lofi Study');
    expect(out.items[0]?.metadata?.artist).toBe('A');
  });
});

describe('RedditAdapter', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns empty when no OAuth token is provided', async () => {
    const a = new RedditAdapter();
    const out = await a.fetch(BASE_CTX({ query: 'iphone' }));
    expect(out.items).toEqual([]);
  });

  it('maps Reddit search response into ConnectorItems', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          children: [
            { data: { id: 'a1', title: 'Best budget phone?', subreddit: 'r/Android', score: 412, num_comments: 88, permalink: '/r/Android/comments/a1', url: '', author: 'alice' } },
          ],
        },
      }),
    } as Response));
    const a = new RedditAdapter();
    const out = await a.fetch(BASE_CTX({ query: 'best phone', token: 'tk' }));
    expect(out.items[0]?.title).toBe('Best budget phone?');
    expect(out.items[0]?.metadata?.subreddit).toBe('r/Android');
  });
});

describe('TodoistAdapter', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('parses Todoist tasks response with due + priority', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { id: 't1', content: 'Buy milk', due: { string: 'Today' }, priority: 1, project_id: 'p1' },
        { id: 't2', content: 'Pay rent', due: { string: 'Tomorrow' } },
      ],
    } as Response));
    const a = new TodoistAdapter();
    const out = await a.fetch(BASE_CTX({ filter: 'today', token: 'tk' }));
    expect(out.items).toHaveLength(2);
    expect(out.items[0]?.title).toBe('Buy milk');
    expect(out.items[0]?.metadata?.priority).toBe(1);
  });
});

describe('GooglePlacesAdapter', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns empty when no API key is provided', async () => {
    const a = new GooglePlacesAdapter();
    const out = await a.fetch(BASE_CTX({ query: 'coffee near me' }));
    expect(out.items).toEqual([]);
  });

  it('maps Places text-search response when api_key is provided', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        places: [{
          id: 'p1',
          displayName: { text: 'Blue Bottle Coffee' },
          formattedAddress: '123 Hayes St, SF',
          rating: 4.6,
          currentOpeningHours: { openNow: true },
          types: ['cafe'],
        }],
      }),
    } as Response));
    const a = new GooglePlacesAdapter();
    const out = await a.fetch(BASE_CTX({ query: 'coffee sf', api_key: 'k' }));
    expect(out.items[0]?.title).toBe('Blue Bottle Coffee');
    expect(out.items[0]?.metadata?.open).toBe(true);
  });
});

describe('CoingeckoAdapter', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('maps CoinGecko markets response into ConnectorItems', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => [{
        id: 'bitcoin',
        symbol: 'btc',
        name: 'Bitcoin',
        current_price: 67500,
        market_cap: 1_300_000_000_000,
        market_cap_rank: 1,
        price_change_percentage_24h: 1.23,
      }],
    } as Response));
    const a = new CoingeckoAdapter();
    const out = await a.fetch(BASE_CTX({ query: 'bitcoin', vs_currency: 'usd' }));
    expect(out.items[0]?.title).toBe('Bitcoin (BTC)');
    expect(out.items[0]?.metadata?.price).toBe(67500);
  });

  it('falls back to /search endpoint when /markets returns 404', async () => {
    vi.stubGlobal('fetch', vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ coins: [{ id: 'bitcoin', name: 'Bitcoin', symbol: 'btc', market_cap_rank: 1 }] }),
      } as Response));
    const a = new CoingeckoAdapter();
    const out = await a.fetch(BASE_CTX({ query: 'bitcoin' }));
    expect(out.items[0]?.title).toBe('Bitcoin (BTC)');
    expect(out.items[0]?.url).toContain('coingecko.com');
  });
});

describe('StackExchangeAdapter', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('parses StackOverflow search response without API key', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [{
          question_id: 12345,
          title: 'How to debounce a function in TypeScript',
          link: 'https://stackoverflow.com/q/12345',
          score: 312,
          answer_count: 4,
          view_count: 56000,
          is_answered: true,
          tags: ['typescript', 'lodash'],
          body: '<p>Use lodash debounce.</p>',
        }],
      }),
    } as Response));
    const a = new StackExchangeAdapter();
    const out = await a.fetch(BASE_CTX({ query: 'typescript debounce' }));
    expect(out.items[0]?.title).toContain('debounce');
    expect(out.items[0]?.metadata?.score).toBe(312);
  });

  it('extracts #tag patterns from the query into tagged param', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [] }),
    } as Response);
    vi.stubGlobal('fetch', fetchMock);
    const a = new StackExchangeAdapter();
    // buildFilter runs the #tag→tagged extraction; subsequently fetch uses the tagged param.
    const filter = a.buildFilter({ text: 'how to use refs #typescript #react' });
    await a.fetch(BASE_CTX(filter));
    const url = fetchMock.mock.calls[0]?.[0] as string;
    expect(url).toContain('tagged=typescript%3Breact'); // URL-encoded typescript;react
    expect(url).not.toContain('%23typescript'); // #typescript should NOT also be in q
  });
});

describe('OpenLibraryAdapter', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('handles ISBN lookup', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        docs: [{
          key: '/works/OL45804W',
          title: 'A Brief History of Time',
          author_name: ['Stephen Hawking'],
          first_publish_year: 1988,
          publisher: ['Bantam'],
          isbn: ['9780553380163'],
        }],
      }),
    } as Response));
    const a = new OpenLibraryAdapter();
    const out = await a.fetch(BASE_CTX({ query: '9780553380163' }));
    expect(out.items[0]?.title).toBe('A Brief History of Time');
    expect(out.items[0]?.metadata?.year).toBe(1988);
  });
});
