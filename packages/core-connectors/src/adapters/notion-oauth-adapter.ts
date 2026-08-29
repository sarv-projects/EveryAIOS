/**
 * Notion connector — OAuth-based access to Notion workspaces.
 *
 * Free: Internal integrations (API key in app) need no OAuth.
 * OAuth: Public integration requires user to authorize via browser.
 * Price: Notion API is free. Paid plans only for >1k collaborators.
 *
 * Flow:
 *   1. User taps "Connect Notion"
 *   2. OAuth redirect → notion.so/authorize → redirect back
 *   3. Token saved in SecureStore (key: `connector:notion:token`)
 *   4. fetch() includes token from context filter.token
 */
import type {
  ConnectorAdapter,
  ConnectorContext,
  ConnectorFilter,
  ConnectorResult,
  MemoryFact,
  UserQuery,
} from '@personal-ai/core-domain';

const NOTION_API = 'https://api.notion.com/v1';
const CONNECTOR_NAME = 'notion' as const;

export class NotionOAuthAdapter implements ConnectorAdapter {
  readonly name = CONNECTOR_NAME;
  readonly metadataSchema = {
    fields: [{ name: 'query', type: 'string' as const, description: 'Search query' }],
  };

  async isAuthorized(_userId: string): Promise<boolean> {
    return true; // Token presence checked at fetch time via context filter
  }

  scoreRelevance(query: UserQuery, _memory: MemoryFact[]): number {
    const q = (query.text || '').toLowerCase();
    const terms = ['notion', 'note', 'wiki', 'doc', 'page', 'database', 'workspace'];
    return terms.some((t) => q.includes(t)) ? 0.7 : 0.1;
  }

  buildFilter(query: UserQuery): ConnectorFilter {
    return { query: query.text || '' };
  }

  async fetch(ctx: ConnectorContext): Promise<ConnectorResult> {
    const filter = ctx.filter as { query?: string; token?: string };
    const token = filter.token || '';

    if (!token) {
      return { items: [], totalCount: 0, source: CONNECTOR_NAME };
    }

    // 1. Search pages matching query
    const searchQuery = filter.query || '';
    const results: ConnectorResult['items'] = [];

    if (searchQuery) {
      try {
        const searchRes = await fetch(`${NOTION_API}/search`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Notion-Version': '2022-06-28',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: searchQuery,
            page_size: 10,
            filter: { value: 'page', property: 'object' },
            sort: { direction: 'descending', timestamp: 'last_edited_time' },
          }),
        });

        if (!searchRes.ok) {
          return { items: [], totalCount: 0, source: CONNECTOR_NAME };
        }

        const data = (await searchRes.json()) as { results?: Array<Record<string, unknown>> };
        for (const page of data.results ?? []) {
          const title = extractTitle(page) || 'Untitled';
          const url = (page.url as string) || '';
          const lastEdited = (page.last_edited_time as string) || '';

          results.push({
            id: (page.id as string) || '',
            title,
            snippet: `${title} — ${getObjectType(page)} (last edited ${lastEdited})`,
            url,
            date: lastEdited,
            metadata: { object: page.object, type: getObjectType(page) },
          });
        }
      } catch {
        return { items: [], totalCount: 0, source: CONNECTOR_NAME };
      }
    } else {
      // Fetch recent pages (no query = browse)
      try {
        const searchRes = await fetch(`${NOTION_API}/search`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Notion-Version': '2022-06-28',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            page_size: 10,
            sort: { direction: 'descending', timestamp: 'last_edited_time' },
          }),
        });

        if (searchRes.ok) {
          const data = (await searchRes.json()) as { results?: Array<Record<string, unknown>> };
          for (const page of data.results ?? []) {
            const title = extractTitle(page) || 'Untitled';
            const url = (page.url as string) || '';

            results.push({
              id: (page.id as string) || '',
              title,
              snippet: `${title} — ${getObjectType(page)}`,
              url,
              date: (page.last_edited_time as string) || '',
            });
          }
        }
      } catch {
        return { items: [], totalCount: 0, source: CONNECTOR_NAME };
      }
    }

    return { items: results, totalCount: results.length, source: CONNECTOR_NAME };
  }

  /** 
   * Token refresh is handled by the Cloudflare Worker OAuth proxy.
   * This adapter assumes a valid token is injected via filter.token.
   * @see packages/cloudflare-server/src/index.ts OAuth refresh routes
   */
}

function extractTitle(page: Record<string, unknown>): string | null {
  const props = page.properties as Record<string, unknown> | undefined;
  if (!props) return null;
  // Title property is the first 'title' type
  for (const val of Object.values(props)) {
    const prop = val as Record<string, unknown> | undefined;
    if (prop?.type === 'title') {
      const titleArr = prop.title as Array<Record<string, unknown>> | undefined;
      if (titleArr && titleArr.length > 0) {
        return titleArr.map((t) => t.plain_text || '').join('');
      }
      return 'Untitled';
    }
  }
  return null;
}

function getObjectType(page: Record<string, unknown>): string {
  if (page.object === 'database') return 'Database';
  if (page.object === 'page') {
    const props = page.properties as Record<string, unknown> | undefined;
    if (props) return 'Page';
  }
  return 'Item';
}
