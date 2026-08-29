/**
 * Trello connector — Atlassian Trello free OAuth.
 *
 * Free tier: 300 requests / 10 seconds per token, 100 requests / 10 seconds
 * per API key (https://developer.atlassian.com/cloud/trello).
 * Provides board/list/card search that ChatGPT/Copilot mobile users rely on
 * for "summarise my boards" tasks.
 *
 * Auth: OAuth 1.0a (Trello-specific — requires HMAC-SHA1 signing of
 * requests). For this adapter we follow Trello's modern OAuth 1.0a client-
 * side flow with `token` (per-user) and `key` (app) instead of bearer.
 * We treat `filter.token` as the user token and `filter.apiKey` as the
 * developer API key. To keep the Worker OAuth proxy simple, Trello tokens
 * are NOT routed through OAuth_PROVIDERS — user enters a personal API
 * token from https://trello.com/app-key. This is the approach Trello
 * itself recommends for mobile/native integrations.
 *
 * NOTE: full OAuth-1.0a three-legged bridge requires request signing; the
 * Cloudflare Worker will implement that flow in a follow-up. Today the
 * adapter accepts a user token directly, matching Trello's documented
 * personal-use pattern.
 */
import type {
  ConnectorAdapter,
  ConnectorContext,
  ConnectorFilter,
  ConnectorResult,
  MemoryFact,
  UserQuery,
} from '@personal-ai/core-domain';

const TRELLO_API = 'https://api.trello.com/1';
const CONNECTOR_NAME = 'trello' as const;

export class TrelloAdapter implements ConnectorAdapter {
  readonly name = CONNECTOR_NAME;
  readonly metadataSchema = {
    fields: [
      { name: 'query', type: 'string' as const, description: 'Text to search across boards/cards' },
      { name: 'token', type: 'string' as const, description: 'Trello user token (https://trello.com/app-key)' },
      { name: 'apiKey', type: 'string' as const, description: 'Trello developer API key' },
      { name: 'boardId', type: 'string' as const, description: 'Optional board filter' },
    ],
  };

  async isAuthorized(_userId: string): Promise<boolean> {
    return true;
  }

  scoreRelevance(query: UserQuery, _memory: MemoryFact[]): number {
    const q = (query.text || '').toLowerCase();
    const terms = ['trello', 'board', 'kanban', 'list', 'card', 'todo board', 'task board', 'project board'];
    if (terms.some((t) => q.includes(t))) return 0.8;
    if (/\b(organize|organise|status|sticky)\b/.test(q)) return 0.35;
    return 0.1;
  }

  buildFilter(query: UserQuery): ConnectorFilter {
    return { query: query.text || '' };
  }

  async fetch(ctx: ConnectorContext): Promise<ConnectorResult> {
    const f = ctx.filter as {
      query?: string;
      token?: string;
      apiKey?: string;
      boardId?: string;
      limit?: number;
    };
    const apiKey = f.apiKey || '';
    if (!f.token || !apiKey) {
      return { items: [], totalCount: 0, source: CONNECTOR_NAME };
    }

    const limit = Math.min(f.limit ?? 20, 50);
    const q = (f.query || '').trim();
    const params = new URLSearchParams({ key: apiKey, token: f.token, limit: String(limit) });
    if (f.boardId) params.set('idBoards', f.boardId);

    try {
      // If the user typed a query, hit /search; otherwise enumerate the
      // user's own cards across all boards.
      let endpoint = `${TRELLO_API}/members/me/cards`;
      if (q) {
        endpoint = `${TRELLO_API}/search`;
        params.set('query', q);
        params.set('cards', 'true');
        params.set('card_fields', 'name,desc,due,dueComplete,idList,idBoard,shortUrl,labels,url');
        params.delete('limit'); // search uses its own paging model
      } else {
        params.set('fields', 'name,desc,due,dueComplete,idList,idBoard,shortUrl,labels,url');
      }

      const res = await fetch(`${endpoint}?${params.toString()}`);
      if (!res.ok) {
        return {
          items: [
            {
              id: `err:${res.status}`,
              title: 'Trello request failed',
              snippet: `HTTP ${res.status}. Verify your Trello token and key.`,
              metadata: { status: res.status },
            },
          ],
          totalCount: 1,
          source: CONNECTOR_NAME,
        };
      }

      type TrelloCard = {
        id: string;
        name: string;
        desc?: string;
        due?: string | null;
        dueComplete?: boolean;
        shortUrl?: string;
        url?: string;
        idBoard?: string;
        idList?: string;
        labels?: Array<{ name?: string; color?: string }>;
      };
      const data = (await res.json()) as TrelloCard[] | { cards?: TrelloCard[] };

      const list = Array.isArray(data) ? data : data.cards ?? [];

      const items: ConnectorResult['items'] = list.slice(0, limit).map((card) => {
        const labels = (card.labels ?? [])
          .map((l) => l.name || l.color)
          .filter(Boolean)
          .join(', ');
        const due =
          card.due && !card.dueComplete
            ? `due ${new Date(card.due).toLocaleDateString()}`
            : card.dueComplete
              ? 'done'
              : '';
        const snippet = [due, labels ? `[${labels}]` : '', card.desc?.slice(0, 120)]
          .filter(Boolean)
          .join(' · ');
        const item: ConnectorResult['items'][number] = {
          id: card.id,
          title: card.name || 'Untitled card',
          snippet: snippet || '(no description)',
          metadata: {
            boardId: card.idBoard,
            listId: card.idList,
            due: card.due,
            done: card.dueComplete,
            labels: card.labels,
          },
        };
        const cardUrl = card.shortUrl ?? card.url;
        if (cardUrl) item.url = cardUrl;
        if (card.due) item.date = card.due;
        return item;
      });

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
