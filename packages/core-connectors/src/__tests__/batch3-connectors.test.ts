/**
 * Credential-custody tests for the batch-3 connector adapters.
 *
 * Authenticated adapters must use an attached Rust transport and an opaque
 * credential handle. AviationStack remains server-proxied and must not forward
 * a user-provided key into TypeScript's request.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  setConnectorHostTransport,
  type ConnectorHostRequest,
  type ConnectorHostResponse,
} from '../connection-manager.js';
import { FinnhubAdapter } from '../adapters/finnhub-adapter.js';
import { TrelloAdapter } from '../adapters/trello-adapter.js';
import { SlackAdapter } from '../adapters/slack-adapter.js';
import { AviationstackAdapter } from '../adapters/aviationstack-adapter.js';
import { SoundcloudAdapter } from '../adapters/soundcloud-adapter.js';

const CTX = (filter: Record<string, unknown>) => ({
  userId: 'u',
  query: { text: '' },
  filter,
});

function installHost(payloads: unknown[]): ConnectorHostRequest[] {
  const requests: ConnectorHostRequest[] = [];
  let index = 0;
  setConnectorHostTransport({
    resolveCredential: async () => ({
      handle: 'vault:oauth:batch3-test:user-1',
      provider: 'batch3-test',
    }),
    request: async (req): Promise<ConnectorHostResponse> => {
      requests.push(req);
      const payload = payloads[Math.min(index, payloads.length - 1)];
      index += 1;
      return {
        ok: true,
        status: 200,
        json: async () => payload,
        text: async () => JSON.stringify(payload),
      };
    },
  });
  return requests;
}

afterEach(() => {
  setConnectorHostTransport(null);
  vi.unstubAllGlobals();
});

describe('host-mediated connector custody', () => {
  it('returns empty instead of accepting raw credentials without a host', async () => {
    const secret = 'raw-oauth-value';
    const adapters = [
      new FinnhubAdapter(),
      new TrelloAdapter(),
      new SlackAdapter(),
      new SoundcloudAdapter(),
    ];

    for (const adapter of adapters) {
      const result = await adapter.fetch(CTX({ query: 'status', token: secret, apiKey: secret }));
      expect(result.items).toEqual([]);
      expect(JSON.stringify(result)).not.toContain(secret);
    }
  });

  it('routes Finnhub through the host without an API key in the URL', async () => {
    const requests = installHost([{ c: 213.45, d: 1.95, dp: 0.92, h: 215, l: 211.1, o: 212.5, pc: 211.5, t: 1753270000 }]);
    const secret = 'raw-api-value';
    const result = await new FinnhubAdapter().fetch(CTX({ query: '$AAPL', apiKey: secret }));

    expect(result.items[0]?.title).toContain('AAPL');
    expect(result.items[0]?.metadata?.price).toBe(213.45);
    expect(requests[0]?.credential.handle).toBe('vault:oauth:batch3-test:user-1');
    expect(requests[0]?.request.url).not.toContain('token=');
    expect(JSON.stringify(requests[0])).not.toContain(secret);
  });

  it('routes Trello through the host without user or app credentials', async () => {
    const requests = installHost([[
      { id: 'c1', name: 'Ship v2', desc: 'Final QA pass', due: '2026-08-01T00:00:00Z', dueComplete: false, shortUrl: 'https://trello.com/c/1', idBoard: 'b1', labels: [{ name: 'urgent', color: 'red' }] },
    ]]);
    const secret = 'raw-trello-value';
    const result = await new TrelloAdapter().fetch(CTX({ query: '', token: secret, apiKey: secret }));

    expect(result.items[0]?.title).toBe('Ship v2');
    expect(result.items[0]?.snippet).toContain('urgent');
    expect(requests[0]?.request.url).not.toContain('token=');
    expect(requests[0]?.request.url).not.toContain('key=');
    expect(JSON.stringify(requests[0])).not.toContain(secret);
  });

  it('routes Slack through the host without an Authorization header', async () => {
    const requests = installHost([{
      ok: true,
      messages: { matches: [{ ts: '1753270000.001', text: 'deploy is live', channel: { id: 'C1', name: 'engineering' }, user: 'U1' }] },
    }]);
    const secret = 'raw-oauth-value';
    const result = await new SlackAdapter().fetch(CTX({ query: 'deploy', token: secret }));

    expect(result.items[0]?.title).toContain('engineering');
    expect(result.items[0]?.metadata?.channel).toBe('C1');
    expect(requests[0]?.request.headers).not.toHaveProperty('Authorization');
    expect(JSON.stringify(requests[0])).not.toContain(secret);
  });

  it('routes SoundCloud through the host without an OAuth header', async () => {
    const requests = installHost([[
      { id: 1, title: 'Lofi Beats', user: { username: 'goldmix', permalink_url: 'https://soundcloud.com/goldmix' }, duration: 192000, playback_count: 123456, genre: 'Lo-fi', permalink_url: 'https://soundcloud.com/goldmix/lofi-beats' },
    ]]);
    const secret = 'raw-oauth-value';
    const result = await new SoundcloudAdapter().fetch(CTX({ query: 'lofi', token: secret }));

    expect(result.items[0]?.title).toBe('Lofi Beats');
    expect(result.items[0]?.snippet).toContain('3:12');
    expect(requests[0]?.request.headers).not.toHaveProperty('Authorization');
    expect(JSON.stringify(requests[0])).not.toContain(secret);
  });
});

describe('AviationstackAdapter', () => {
  it('uses the server proxy without forwarding a user API key', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{
          flight_date: '2026-07-23',
          flight_status: 'active',
          airline: { name: 'United', iata: 'UA' },
          flight: { iata: 'UA2490', number: '2490' },
          departure: { iata: 'SFO', scheduled: '2026-07-23T08:30:00Z' },
          arrival: { iata: 'JFK', scheduled: '2026-07-23T17:05:00Z' },
        }],
      }),
    } as Response);
    vi.stubGlobal('fetch', fetchMock);
    const secret = 'raw-api-value';
    const result = await new AviationstackAdapter().fetch(CTX({ query: 'UA2490', apiKey: secret }));

    const url = fetchMock.mock.calls[0]?.[0] as string;
    expect(result.items[0]?.title).toContain('UA2490');
    expect(url).not.toContain('access_key=');
    expect(url).not.toContain(secret);
  });
});
