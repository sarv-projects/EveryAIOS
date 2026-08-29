import type { SearchContext, SearchProvider, SearchResult } from '@personal-ai/core-domain';

const EXA_API_URL = 'https://api.exa.ai/search';

export class ExaRestSearchProvider implements SearchProvider {
  name = 'Exa REST';
  kind = 'search' as const;
  private apiKey: string | null;

  constructor(apiKey?: string) {
    this.apiKey = apiKey ?? process.env.EXPO_PUBLIC_EXA_API_KEY?.trim() ?? null;
  }

  async isAvailable(_ctx: SearchContext): Promise<boolean> {
    return this.apiKey != null && this.apiKey.length > 0;
  }

  async search(query: string): Promise<SearchResult[]> {
    if (!this.apiKey) throw new Error('Exa API key not configured');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    try {
      const res = await fetch(EXA_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
        },
        body: JSON.stringify({
          query,
          numResults: 8,
          type: 'auto',
          contents: {
            highlights: true,
            text: { maxCharacters: 300 },
          },
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        console.warn(`[ExaRest] ${res.status}: ${detail.slice(0, 100)}`);
        return [];
      }

      const body = (await res.json()) as {
        results?: Array<{
          title?: string;
          url?: string;
          text?: string;
          highlights?: string[];
          score?: number;
          publishedDate?: string;
        }>;
      };

      return (body.results ?? []).map((r) => ({
        title: r.title ?? '',
        url: r.url ?? '',
        snippet: r.highlights?.[0] ?? r.text ?? '',
        score: r.score ?? 0,
        source: 'Exa',
      }));
    } finally {
      clearTimeout(timer);
    }
  }
}
