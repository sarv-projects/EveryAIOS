/**
 * Dropbox connector — OAuth-based access to Dropbox files.
 *
 * Free: 2GB storage, Dropbox API v2 (search, list, read).
 * OAuth: Required for user-specific file access.
 * Flow:
 *   1. User taps "Connect Dropbox"
 *   2. OAuth redirect → dropbox.com/oauth/authorize → redirect back
 *   3. Token saved in SecureStore (key: `connector:dropbox:token`)
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

const DROPBOX_API = 'https://api.dropboxapi.com/2';
const CONNECTOR_NAME = 'dropbox' as const;

export class DropboxAdapter implements ConnectorAdapter {
  readonly name = CONNECTOR_NAME;
  readonly metadataSchema = {
    fields: [
      { name: 'query', type: 'string' as const, description: 'Search query for files' },
      { name: 'path', type: 'string' as const, description: 'Folder path to list (default: root)' },
    ],
  };

  async isAuthorized(_userId: string): Promise<boolean> {
    return true;
  }

  scoreRelevance(query: UserQuery, _memory: MemoryFact[]): number {
    const q = (query.text || '').toLowerCase();
    const terms = ['dropbox', 'file', 'document', 'pdf', 'photo', 'attachment'];
    return terms.some((t) => q.includes(t)) ? 0.6 : 0.1;
  }

  buildFilter(query: UserQuery): ConnectorFilter {
    return { query: query.text || '' };
  }

  async fetch(ctx: ConnectorContext): Promise<ConnectorResult> {
    const filter = ctx.filter as { query?: string; path?: string; token?: string };
    const token = filter.token || '';

    if (!token) {
      return { items: [], totalCount: 0, source: CONNECTOR_NAME };
    }

    const results: ConnectorResult['items'] = [];
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    try {
      // If search query provided, use search endpoint
      if (filter.query) {
        const res = await fetch(`${DROPBOX_API}/files/search_v2`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            query: filter.query,
            max_results: 20,
          }),
        });

        if (!res.ok) {
          return { items: [], totalCount: 0, source: CONNECTOR_NAME };
        }

        const data = (await res.json()) as {
          matches?: Array<{
            metadata: {
              metadata: {
                '.tag': string;
                name: string;
                path_lower: string;
                id: string;
                client_modified?: string;
                size?: number;
              };
            };
          }>;
        };

        for (const match of data.matches ?? []) {
          const meta = match.metadata.metadata;
          if (meta['.tag'] === 'file') {
            results.push({
              id: meta.id,
              title: meta.name,
              snippet: `${meta.name} (${formatSize(meta.size ?? 0)})`,
              url: `https://www.dropbox.com/home${meta.path_lower}`,
              ...(meta.client_modified ? { date: meta.client_modified } : {}),
              metadata: { tag: 'file', size: meta.size, path: meta.path_lower },
            });
          }
        }
      } else {
        // List folder contents
        const path = filter.path || '';
        const res = await fetch(`${DROPBOX_API}/files/list_folder`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            path,
            recursive: false,
            limit: 20,
          }),
        });

        if (res.ok) {
          const data = (await res.json()) as {
            entries?: Array<{
              '.tag': string;
              name: string;
              path_lower: string;
              id: string;
              client_modified?: string;
              size?: number;
            }>;
          };

          for (const entry of data.entries ?? []) {
            results.push({
              id: entry.id,
              title: entry.name,
              snippet: `${entry.name} (${entry['.tag'] === 'folder' ? 'folder' : formatSize(entry.size ?? 0)})`,
              url: `https://www.dropbox.com/home${entry.path_lower}`,
              ...(entry.client_modified ? { date: entry.client_modified } : {}),
              metadata: { tag: entry['.tag'], size: entry.size, path: entry.path_lower },
            });
          }
        }
      }
    } catch {
      return { items: [], totalCount: 0, source: CONNECTOR_NAME };
    }

    return { items: results, totalCount: results.length, source: CONNECTOR_NAME };
  }

  /** 
   * Token refresh is handled by the Cloudflare Worker OAuth proxy.
   * This adapter assumes a valid token is injected via filter.token.
   * @see packages/cloudflare-server/src/index.ts OAuth refresh routes
   */
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
