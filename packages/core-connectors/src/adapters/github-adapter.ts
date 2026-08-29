import type {
  ConnectorAdapter,
  ConnectorContext,
  ConnectorFilter,
  ConnectorMetadataSchema,
  ConnectorName,
  ConnectorResult,
  UserQuery,
  MemoryFact,
} from '@personal-ai/core-domain';

/**
 * GitHub connector (personal token or anonymous).
 * Day-0 per spec §12.1. Read-only search + user repos.
 */
const metadataSchema: ConnectorMetadataSchema = {
  fields: [
    { name: 'token', type: 'string', description: 'GitHub PAT (optional for public)' },
    { name: 'query', type: 'string', description: 'Search term or repo' },
  ],
};

export class GitHubAdapter implements ConnectorAdapter {
  readonly name = 'github' as ConnectorName;
  readonly metadataSchema = metadataSchema;

  private token: string | undefined;

  constructor(token?: string) {
    this.token = token;
  }

  async isAuthorized(_userId: string): Promise<boolean> {
    // Anonymous works for public data. If token given, assume valid until fetch fails.
    return true;
  }

  scoreRelevance(query: UserQuery, _memory: MemoryFact[]): number {
    const q = query.text.toLowerCase();
    const terms = ['github', 'repo', 'pr', 'issue', 'commit', 'pull request', 'code'];
    return terms.some(t => q.includes(t)) ? 0.8 : 0.2;
  }

  buildFilter(query: UserQuery): ConnectorFilter {
    return { query: (query.text || '') } as ConnectorFilter;
  }

  async fetch(ctx: ConnectorContext): Promise<ConnectorResult> {
    const filter = (ctx.filter || {}) as Record<string, string | undefined>;
    const qtext = (ctx.query as { text?: string } | undefined)?.text || '';
    const q = (filter.query || qtext || '').trim();
    const token = filter.token || this.token;

    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'personal-ai-connectors',
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    try {
      // Two paths: if looks like "owner/repo" do repo info, else search
      let url: string;
      if (/^[\w.-]+\/[\w.-]+$/.test(q)) {
        url = `https://api.github.com/repos/${q}`;
      } else {
        const searchQ = encodeURIComponent(q || 'personal-ai');
        url = `https://api.github.com/search/repositories?q=${searchQ}&per_page=5&sort=updated`;
      }

      const res = await fetch(url, { headers, signal: ctx.signal ?? null });
      if (!res.ok) {
        return { items: [], totalCount: 0, source: 'github' as ConnectorName };
      }

      const data = await res.json() as { items?: Array<Record<string, unknown>>; full_name?: string; id?: number; description?: string; html_url?: string; updated_at?: string; stargazers_count?: number; forks_count?: number; language?: string };
      const items: ConnectorResult['items'] = [];

      if (data.items) {
        // search results
        for (const r of data.items.slice(0, 5)) {
          items.push({
            id: String(r.id),
            title: String(r.full_name ?? ''),
            snippet: (String(r.description ?? '') + (r.language ? ` • ${r.language}` : '')),
            url: String(r.html_url ?? ''),
            date: String(r.updated_at ?? ''),
            metadata: { stars: Number(r.stargazers_count ?? 0), forks: Number(r.forks_count ?? 0) },
          });
        }
      } else if (data.full_name) {
        const repo = data as Record<string, unknown>;
        items.push({
          id: String(repo.id ?? ''),
          title: String(repo.full_name ?? ''),
          snippet: String(repo.description ?? ''),
          url: String(repo.html_url ?? ''),
          date: String(repo.updated_at ?? ''),
          metadata: { stars: Number(repo.stargazers_count ?? 0) },
        });
      }

      return { items, totalCount: items.length, source: 'github' as ConnectorName };
    } catch {
      return { items: [], totalCount: 0, source: 'github' as ConnectorName };
    }
  }

  /** 
   * Token refresh is handled by the Cloudflare Worker OAuth proxy.
   * This adapter assumes a valid token is injected via filter.token.
   * @see packages/cloudflare-server/src/index.ts OAuth refresh routes
   */
  async refreshToken(_userId: string): Promise<boolean> {
    return !!this.token;
  }
}
