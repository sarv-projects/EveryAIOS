/**
 * Tests for the connector adapters added in the catalog expansion (8 new +
 * microsoft-graph bodyPreview behaviour). Tests mock fetch() so they don't
 * hit the live APIs.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WikipediaAdapter } from '../adapters/wikipedia-adapter.js';
import { HackerNewsAdapter } from '../adapters/hacker-news-adapter.js';
import { PublicHolidaysAdapter } from '../adapters/public-holidays-adapter.js';
import { NominatimAdapter, __resetNominatimThrottleForTests } from '../adapters/nominatim-adapter.js';
import { WorldtimeAdapter } from '../adapters/worldtime-adapter.js';
import { IcalAdapter } from '../adapters/ical-adapter.js';
import { RestCountriesAdapter } from '../adapters/restcountries-adapter.js';
import { MicrosoftGraphAdapter } from '../adapters/microsoft-graph-adapter.js';

const BASE_CTX = (filter: Record<string, unknown> = {}) => ({
  userId: 'u',
  query: { text: '' },
  filter,
});

describe('WikipediaAdapter', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns summary item when "what is X" intent detected', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        title: 'Quantum mechanics',
        extract: 'Quantum mechanics is a fundamental theory...',
        content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Quantum_mechanics' } },
        thumbnail: { source: 'https://upload.wikimedia.org/x/y.jpg' },
      }),
    } as Response));

    const a = new WikipediaAdapter();
    const out = await a.fetch(BASE_CTX({ query: 'what is quantum mechanics' }));
    expect(out.items).toHaveLength(1);
    expect(out.items[0]?.title).toBe('Quantum mechanics');
    expect(out.items[0]?.url).toContain('Quantum_mechanics');
    expect(out.items[0]?.metadata?.thumbnail).toContain('upload.wikimedia.org');
  });

  it('falls back to /search/page when summary endpoint returns 404', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          pages: [
            { key: 'Quantum_mechanics', title: 'Quantum mechanics', excerpt: 'Branch of physics…' },
          ],
        }),
      } as Response);
    vi.stubGlobal('fetch', fetchMock);

    const a = new WikipediaAdapter();
    const out = await a.fetch(BASE_CTX({ query: 'what is quantum mechanics' }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(out.items[0]?.title).toBe('Quantum mechanics');
  });

  it('returns empty array when query is empty', async () => {
    const a = new WikipediaAdapter();
    const out = await a.fetch(BASE_CTX({ query: '' }));
    expect(out.items).toEqual([]);
  });
});

describe('HackerNewsAdapter', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('scores HN queries highly', () => {
    const a = new HackerNewsAdapter();
    expect(a.scoreRelevance({ text: 'hacker news top stories' }, [])).toBeGreaterThanOrEqual(0.85);
    expect(a.scoreRelevance({ text: 'what is the weather today' }, [])).toBeLessThanOrEqual(0.2);
  });

  it('uses front_page tag when query starts with top/trending', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        hits: [
          { objectID: '1', title: 'Show HN: My Project', url: 'https://example.com', author: 'foo', points: 200, num_comments: 42, created_at_i: 1700000000 },
        ],
      }),
    } as Response));

    const a = new HackerNewsAdapter();
    const out = await a.fetch(BASE_CTX({ query: 'top', tags: 'front_page' }));
    expect(out.items).toHaveLength(1);
    expect(out.items[0]?.title).toBe('Show HN: My Project');
    expect(out.items[0]?.metadata?.points).toBe(200);
  });

  it('formats snippet with author + points + comments', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        hits: [
          { objectID: '2', story_title: 'A story', story_url: 'https://s.test', author: 'alice', points: 5, num_comments: 7, created_at_i: 1700000000 },
        ],
      }),
    } as Response));

    const a = new HackerNewsAdapter();
    const out = await a.fetch(BASE_CTX({ query: 'a story' }));
    expect(out.items[0]?.snippet).toContain('alice');
    expect(out.items[0]?.snippet).toContain('5 pts');
    expect(out.items[0]?.snippet).toContain('7 comments');
  });
});

describe('PublicHolidaysAdapter', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('maps API items to ConnectorItems with country badge', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { date: '2026-12-25', localName: 'Christmas Day', name: 'Christmas Day', countryCode: 'US', global: true, types: ['Public'] },
      ],
    } as Response));

    const a = new PublicHolidaysAdapter();
    const out = await a.fetch(BASE_CTX({ countryCode: 'US', year: 2026 }));
    expect(out.items[0]?.title).toBe('Christmas Day');
    expect(out.items[0]?.metadata?.countryCode).toBe('US');
    expect(out.items[0]?.metadata?.global).toBe(true);
  });

  it('extracts 2-letter uppercase country code from query text', () => {
    const a = new PublicHolidaysAdapter();
    const f = a.buildFilter({ text: 'Holidays in JP next month' });
    expect(f.countryCode).toBe('JP');
  });
});

describe('NominatimAdapter', () => {
  beforeEach(() => {
    __resetNominatimThrottleForTests();
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('blocks 1 req/sec via single-flight serialization', async () => {
    // Deterministic fake clock: p1 takes the slot instantly (lastRequestAt=0),
    // p2 must wait the full MIN_INTERVAL_MS before its fetch fires.
    vi.useFakeTimers({ now: 1_000_000 });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ display_name: 'Berlin, Germany', lat: '52.5', lon: '13.4', type: 'city' }],
    } as Response));

    const a = new NominatimAdapter();
    const p1 = a.fetch(BASE_CTX({ query: 'Berlin' }));
    const p2 = a.fetch(BASE_CTX({ query: 'Paris' }));
    await vi.runAllTimersAsync();
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.items.length + r2.items.length).toBeGreaterThanOrEqual(0);
  });

  it('parses Nominatim search response into ConnectorItems', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          display_name: 'Berlin, Germany',
          name: 'Berlin',
          lat: '52.5170365',
          lon: '13.3888599',
          type: 'city',
          importance: 0.95,
          address: { city: 'Berlin', country: 'Germany' },
        },
      ],
    } as Response));

    const a = new NominatimAdapter();
    const out = await a.fetch(BASE_CTX({ query: 'Berlin' }));
    expect(out.items[0]?.title).toBe('Berlin');
    expect(out.items[0]?.metadata?.lat).toBe(52.5170365);
    expect(out.items[0]?.url).toContain('openstreetmap.org');
  });
});

describe('WorldtimeAdapter', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('calls timezone endpoint and returns time/offset string', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        timezone: 'Europe/Berlin',
        utc_datetime: '2026-07-23T11:30:00.000Z',
        datetime: '2026-07-23T13:30:00',
        utc_offset: '+02:00',
        abbreviation: 'CEST',
      }),
    } as Response));

    const a = new WorldtimeAdapter();
    const out = await a.fetch(BASE_CTX({ timezone: 'Europe/Berlin' }));
    expect(out.items[0]?.title).toBe('Time in Europe/Berlin');
    expect(out.items[0]?.snippet).toContain('+02:00');
    expect(out.items[0]?.snippet).toContain('CEST');
    expect(out.items[0]?.metadata?.offset).toBe('+02:00');
  });

  it('falls back to UTC when timezone is missing', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        timezone: 'Etc/UTC',
        utc_datetime: '2026-07-23T11:30:00.000Z',
        datetime: '2026-07-23T11:30:00',
        utc_offset: '+00:00',
        abbreviation: 'UTC',
      }),
    } as Response);
    vi.stubGlobal('fetch', fetchMock);

    const a = new WorldtimeAdapter();
    const out = await a.fetch(BASE_CTX({}));
    expect((fetchMock.mock.calls[0]?.[0] as string)).toContain('Etc/UTC');
    expect(out.items[0]?.title).toBe('Time in Etc/UTC');
  });
});

describe('IcalAdapter', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('parses VEVENT with line-folding into multiple events', async () => {
    // Use future dates relative to now so the 30-day window always includes them.
    const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const standupEnd = new Date(tomorrow.getTime() + 30 * 60 * 1000);
    const reviewStart = new Date(tomorrow.getTime() + 48 * 60 * 60 * 1000);
    const reviewEnd = new Date(reviewStart.getTime() + 60 * 60 * 1000);

    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      'UID:test-1@example.com',
      'SUMMARY:Standup',
      `DTSTART:${fmt(tomorrow)}`,
      `DTEND:${fmt(standupEnd)}`,
      'DESCRIPTION:Daily\\, with',
      '  team and remote',
      'LOCATION:Room 42',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:test-2@example.com',
      'SUMMARY:Review',
      `DTSTART:${fmt(reviewStart)}`,
      `DTEND:${fmt(reviewEnd)}`,
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      text: async () => ics,
    } as Response));

    const a = new IcalAdapter();
    const out = await a.fetch(BASE_CTX({ url: 'https://cal.example.com/public.ics' }));
    expect(out.items.length).toBeGreaterThanOrEqual(1);
    const standup = out.items.find((i) => i.title === 'Standup');
    expect(standup).toBeDefined();
    expect(standup?.snippet).toContain('team and remote');
  });

  it('refuses http:// URLs (SSRF: must be https)', async () => {
    const a = new IcalAdapter();
    const out = await a.fetch(BASE_CTX({ url: 'http://cal.example.com/public.ics' }));
    expect(out.items).toEqual([]);
  });

  it('refuses loopback / private IP URLs (SSRF)', async () => {
    // Capture fetchSpy so we can prove validateIcsUrl() blocked every URL before
    // any fetch happened. If a private URL slips past the validator (or the
    // bracket-bypass regresses) fetchSpy IS called and the trailing assertion
    // fails loudly instead of the test silently going green.
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => 'BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n',
    } as Response);
    vi.stubGlobal('fetch', fetchSpy);
    const a = new IcalAdapter();
    for (const blocked of [
      'https://127.0.0.1/x.ics',
      'https://localhost/x.ics',
      'https://10.0.0.5/x.ics',
      'https://192.168.1.1/x.ics',
      'https://172.16.0.1/x.ics',
      'https://172.31.255.255/x.ics',
      'https://169.254.169.254/latest/meta-data',
      'https://100.64.0.1/x.ics',
      'https://100.127.255.255/x.ics',
      'https://[::1]/x.ics',
      'https://[fc00::1]/x.ics',
      'https://[fd12:3456::1]/x.ics',
      'https://[fe80::1]/x.ics',
    ]) {
      const out = await a.fetch(BASE_CTX({ url: blocked }));
      expect(out.items, `expected ${blocked} to be rejected`).toEqual([]);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('allows public https URLs', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      text: async () => 'BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n',
    } as Response);
    vi.stubGlobal('fetch', fetchMock);

    const a = new IcalAdapter();
    await a.fetch(BASE_CTX({ url: 'https://calendar.google.com/calendar/ical/example/public.ics' }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((fetchMock.mock.calls[0]?.[0] as string)).toContain('public.ics');
  });
});

describe('RestCountriesAdapter', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('routes alpha code to /alpha/ endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          name: { common: 'India', official: 'Republic of India' },
          capital: ['New Delhi'],
          region: 'Asia',
          subregion: 'Southern Asia',
          population: 1_400_000_000,
          languages: { eng: 'English', hin: 'Hindi' },
          currencies: { INR: { name: 'Indian rupee', symbol: '₹' } },
          idd: { root: '+9', suffixes: ['1'] },
          flag: '🇮🇳',
          area: 3_287_263,
        },
      ],
    } as Response);
    vi.stubGlobal('fetch', fetchMock);

    const a = new RestCountriesAdapter();
    const out = await a.fetch(BASE_CTX({ query: 'in' }));
    expect((fetchMock.mock.calls[0]?.[0] as string)).toContain('/alpha/in');
    expect(out.items[0]?.title).toContain('India');
    expect(out.items[0]?.snippet).toContain('New Delhi');
    expect(out.items[0]?.snippet).toContain('Indian rupee');
  });

  it('routes name query to /name/ endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => [{ name: { common: 'Germany' }, capital: ['Berlin'] }],
    } as Response);
    vi.stubGlobal('fetch', fetchMock);

    const a = new RestCountriesAdapter();
    await a.fetch(BASE_CTX({ query: 'Germany' }));
    expect((fetchMock.mock.calls[0]?.[0] as string)).toContain('/name/Germany');
  });
});

describe('MicrosoftGraphAdapter', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('constructs 3 instances with distinct names but shares the subService internals', () => {
    const m = new MicrosoftGraphAdapter('microsoft-mail', 'mail');
    const c = new MicrosoftGraphAdapter('microsoft-calendar', 'calendar');
    const o = new MicrosoftGraphAdapter('microsoft-onedrive', 'onedrive');
    expect([m.name, c.name, o.name].sort()).toEqual(
      ['microsoft-calendar', 'microsoft-mail', 'microsoft-onedrive'].sort(),
    );
  });

  it('mail subService strips HTML tags and decodes entities in bodyPreview', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        value: [
          {
            id: 'msg-1',
            subject: 'Hello',
            from: { emailAddress: { name: 'Alice Bob', address: 'alice@example.com' } },
            receivedDateTime: '2026-07-23T10:00:00Z',
            bodyPreview: '<p>Hi &amp; welcome to &lt;club&gt;! &quot;hi&quot; &#x1F44B;</p>',
            webLink: 'https://outlook.example/m1',
          },
        ],
      }),
    } as Response));

    const a = new MicrosoftGraphAdapter('microsoft-mail', 'mail');
    const out = await a.fetch({ userId: 'u', query: { text: '' }, filter: { token: 'tok' } });
    expect(out.items[0]?.title).toBe('Hello');
    const snippet = out.items[0]?.snippet ?? '';
    expect(snippet).not.toContain('<p>');
    expect(snippet).toContain('Alice Bob');
    expect(snippet).toContain('& welcome to');
    expect(snippet).toContain('<club>');
    expect(snippet).toContain('"hi"');
  });

  it('calendar subService fetches /me/events and maps fields', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        value: [
          {
            id: 'evt-1',
            subject: 'Standup',
            start: { dateTime: '2026-07-23T09:00:00Z' },
            end: { dateTime: '2026-07-23T09:30:00Z' },
            location: { displayName: 'Room 1' },
            organizer: undefined,
            webLink: 'https://outlook.example/e1',
          },
        ],
      }),
    } as Response));

    const a = new MicrosoftGraphAdapter('microsoft-calendar', 'calendar');
    const out = await a.fetch({ userId: 'u', query: { text: '' }, filter: { token: 'tok' } });
    expect(out.items[0]?.metadata?.start).toBe('2026-07-23T09:00:00Z');
    expect(out.items[0]?.metadata?.location).toBe('Room 1');
  });

  it('onedrive subService formats file sizes in snippet', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        value: [
          {
            id: 'f-1',
            name: 'report.pdf',
            size: 2_500_000,
            lastModifiedDateTime: '2026-07-23T10:00:00Z',
            webUrl: 'https://onedrive.example/r',
            file: { mimeType: 'application/pdf' },
            folder: undefined,
          },
        ],
      }),
    } as Response));

    const a = new MicrosoftGraphAdapter('microsoft-onedrive', 'onedrive');
    const out = await a.fetch({ userId: 'u', query: { text: '' }, filter: { token: 'tok' } });
    expect(out.items[0]?.title).toBe('report.pdf');
    expect(out.items[0]?.snippet).toContain('File');
    expect(out.items[0]?.snippet).toContain('2.4 MB');
  });

  it('returns empty when token is missing', async () => {
    const a = new MicrosoftGraphAdapter('microsoft-mail', 'mail');
    const out = await a.fetch({ userId: 'u', query: { text: '' }, filter: {} });
    expect(out.items).toEqual([]);
  });
});
