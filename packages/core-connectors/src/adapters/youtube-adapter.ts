/**
 * YouTube connector — YouTube Data API v3, API key only (no OAuth needed).
 *
 * Free: 10,000 quota units/day.
 * - Search: 100 units/request
 * - Channel info: 1 unit/request
 * - Video details: 1 unit/request
 * = ~100 searches + 9000 detail lookups per day free.
 *
 * No OAuth required for public data (search, channel info, video metadata).
 * OAuth needed only for user-specific actions (likes, playlists, subscriptions).
 *
 * Flow:
 *   1. User taps "Connect YouTube"
 *   2. Enters API key (or pre-configured in app)
 *   3. YT_API_KEY env var set on Cloudflare worker
 *   4. fetch() includes key from context filter.apiKey
 */
import type {
  ConnectorAdapter,
  ConnectorContext,
  ConnectorFilter,
  ConnectorResult,
  MemoryFact,
  UserQuery,
} from '@personal-ai/core-domain';

const YT_API = 'https://www.googleapis.com/youtube/v3';
const CONNECTOR_NAME = 'youtube' as const;

export class YouTubeAdapter implements ConnectorAdapter {
  readonly name = CONNECTOR_NAME;
  readonly metadataSchema = {
    fields: [
      { name: 'query', type: 'string' as const, description: 'Search query' },
      { name: 'maxResults', type: 'number' as const, description: 'Max results (1-50)' },
    ],
  };

  async isAuthorized(_userId: string): Promise<boolean> {
    return true;
  }

  scoreRelevance(query: UserQuery, _memory: MemoryFact[]): number {
    const q = (query.text || '').toLowerCase();
    const terms = ['youtube', 'video', 'watch', 'channel', 'subscribe', 'tutorial', 'how to'];
    return terms.some((t) => q.includes(t)) ? 0.75 : 0.1;
  }

  buildFilter(query: UserQuery): ConnectorFilter {
    return { query: query.text || '', maxResults: 10 };
  }

  async fetch(ctx: ConnectorContext): Promise<ConnectorResult> {
    const filter = ctx.filter as { query?: string; apiKey?: string; maxResults?: number };
    const apiKey = filter.apiKey || '';
    const searchQuery = filter.query || '';
    const maxResults = Math.min(filter.maxResults ?? 10, 50);

    if (!apiKey || !searchQuery) {
      return { items: [], totalCount: 0, source: CONNECTOR_NAME };
    }

    try {
      const url = new URL(`${YT_API}/search`);
      url.searchParams.set('part', 'snippet');
      url.searchParams.set('q', searchQuery);
      url.searchParams.set('maxResults', String(maxResults));
      url.searchParams.set('type', 'video');
      url.searchParams.set('key', apiKey);

      const res = await fetch(url.toString());
      if (!res.ok) {
        // Quota exceeded or error
        return { items: [], totalCount: 0, source: CONNECTOR_NAME };
      }

      const data = (await res.json()) as {
        items?: Array<{
          id: { videoId: string };
          snippet: {
            title: string;
            description: string;
            channelTitle: string;
            publishedAt: string;
            thumbnails?: { default?: { url: string } };
          };
        }>;
      };

      const items: ConnectorResult['items'] = (data.items ?? []).map((item) => ({
        id: item.id.videoId,
        title: item.snippet.title,
        snippet: `${item.snippet.channelTitle}: ${item.snippet.description.slice(0, 200)}`,
        url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
        date: item.snippet.publishedAt,
        metadata: {
          channel: item.snippet.channelTitle,
          videoId: item.id.videoId,
          thumbnail: item.snippet.thumbnails?.default?.url,
        },
      }));

      return { items, totalCount: items.length, source: CONNECTOR_NAME };
    } catch {
      return { items: [], totalCount: 0, source: CONNECTOR_NAME };
    }
  }

  /** 
   * Token refresh is handled by the Cloudflare Worker OAuth proxy.
   * This adapter assumes a valid token is injected via filter.token.
   * @see packages/cloudflare-server/src/index.ts OAuth refresh routes
   */
}
