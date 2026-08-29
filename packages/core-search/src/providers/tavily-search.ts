/**
 * Tavily Search Provider — AI-optimized search with content extraction.
 * Free tier: 1000 requests/month. https://tavily.com
 *
 * Returns an "answer" summary plus extracted content from web results,
 * similar to Perplexity-level search quality.
 */
import type { SearchContext, SearchProvider, SearchResult } from '@personal-ai/core-domain';

type TavilyResponse = {
  query: string;
  answer?: string;
  results: Array<{
    title: string;
    url: string;
    content: string;
    score: number;
    raw_content?: string;
  }>;
  response_time: number;
};

function getApiKey(): string | null {
  return (
    process.env.EXPO_PUBLIC_TAVILY_API_KEY?.trim() ||
    process.env.TAVILY_API_KEY?.trim() ||
    null
  );
}

export class TavilySearchProvider implements SearchProvider {
  readonly name = 'tavily';
  readonly kind = 'search' as const;
  private apiKey: string | null;

  constructor() {
    this.apiKey = getApiKey();
  }

  async isAvailable(_ctx: SearchContext): Promise<boolean> {
    return this.apiKey != null && this.apiKey.length > 0;
  }

  async search(query: string): Promise<SearchResult[]> {
    if (!this.apiKey) return [];

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    try {
      const response = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: this.apiKey,
          query,
          search_depth: 'advanced',
          include_answer: true,
          include_raw_content: false,
          max_results: 10,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        console.warn(`[Tavily] HTTP ${response.status}`);
        return [];
      }

      const data = (await response.json()) as TavilyResponse;
      const results: SearchResult[] = [];

      if (data.answer) {
        results.push({
          title: 'AI Answer',
          url: '',
          snippet: data.answer,
          score: 100,
          source: 'tavily-answer',
        });
      }

      for (const r of data.results ?? []) {
        results.push({
          title: r.title,
          url: r.url,
          snippet: r.content || r.raw_content || '',
          score: r.score * 10,
          source: 'tavily',
        });
      }

      return results;
    } catch (e) {
      console.warn('[Tavily] search failed:', e);
      return [];
    } finally {
      clearTimeout(timeout);
    }
  }
}
