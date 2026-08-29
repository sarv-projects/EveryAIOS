/**
 * Finnhub connector — live stock, forex, and crypto quotes.
 *
 * Free tier: 60 requests / minute (https://finnhub.io/pricing).
 * Used by ChatGPT, Gemini to produce hallucination-free market prices.
 *
 * Auth: API key only — set FINNHUB_API_KEY on Cloudflare Worker KV binding,
 * or include `filter.apiKey` directly. Adapter prefers filter value, falls
 * back to ctx.env.FINNHUB_API_KEY when orchestrator injects env.
 *
 * Endpoints used:
 *   /quote      — current price for a stock/ETF/crypto by symbol
 *   /search     — symbol search for ambiguous queries (e.g. "apple")
 *   /forex/rates — bulk exchange rates when caller mentions currency pair
 */
import type {
  ConnectorAdapter,
  ConnectorContext,
  ConnectorFilter,
  ConnectorResult,
  MemoryFact,
  UserQuery,
} from '@personal-ai/core-domain';

const FINNHUB_API = 'https://finnhub.io/api/v1';
const CONNECTOR_NAME = 'finnhub' as const;

export class FinnhubAdapter implements ConnectorAdapter {
  readonly name = CONNECTOR_NAME;
  readonly metadataSchema = {
    fields: [
      { name: 'query', type: 'string' as const, description: 'Ticker symbol or company name (e.g. "AAPL" or "Tesla")' },
      { name: 'apiKey', type: 'string' as const, description: 'Finnhub API key (free tier)' },
    ],
  };

  async isAuthorized(_userId: string): Promise<boolean> {
    // Token presence (filter.apiKey) enforced at fetch time; the
    // orchestrator pre-checks authorization before invoking.
    return true;
  }

  scoreRelevance(query: UserQuery, _memory: MemoryFact[]): number {
    const q = (query.text || '').toLowerCase();
    if (/\b(price|stock|ticker|share|market|cap)\b/.test(q)) return 0.85;
    if (/\$[a-z]{1,5}\b/.test(q) || /[a-z]{1,5}\b\s+(stock|price|share)/.test(q)) return 0.8;
    if (/\b(forex|exchange rate|currency pair|usd[/\s]?eur|eur[/\s]?usd)\b/.test(q)) return 0.75;
    if (/\b(buy|sell|trade|portfolio|investment|dividend)\b/.test(q)) return 0.4;
    return 0.1;
  }

  buildFilter(query: UserQuery): ConnectorFilter {
    return { query: query.text || '' };
  }

  async fetch(ctx: ConnectorContext): Promise<ConnectorResult> {
    const f = ctx.filter as { query?: string; apiKey?: string; type?: 'stock' | 'forex' | 'crypto' };
    const apiKey =
      f.apiKey ||
      ((ctx as unknown as { env?: { FINNHUB_API_KEY?: string } }).env?.FINNHUB_API_KEY) ||
      '';
    const q = (f.query || '').trim();
    if (!apiKey || !q) {
      return { items: [], totalCount: 0, source: CONNECTOR_NAME };
    }

    // Try to extract a ticker symbol: $/TICKER or ALL-CAPS 1-5 letters.
    const tickerMatch = q.match(/\$([A-Za-z]{1,5})/) || q.match(/\b([A-Z]{1,5})\b/);
    const ticker = tickerMatch?.[1]?.toUpperCase();

    // If query clearly mentions a forex pair (e.g. "USD to EUR"), prefer /forex/rates.
    const forexMatch = q.match(/([A-Za-z]{3})\s*(?:to|→|->|\/)\s*([A-Za-z]{3})/i);

    try {
      if (forexMatch) {
        const base = (forexMatch[1] ?? '').toUpperCase();
        const quote = (forexMatch[2] ?? '').toUpperCase();
        const url = `${FINNHUB_API}/forex/rates?base=${encodeURIComponent(base)}&symbol=${encodeURIComponent(
          quote.toUpperCase(),
        )}`;
        const res = await fetch(url, { headers: { 'X-Finnhub-Token': apiKey } });
        if (!res.ok) {
          return {
            items: [
              {
                id: `forex:${base}:${quote}`,
                title: `Forex ${base}/${quote}`,
                snippet: `Rate unavailable (HTTP ${res.status}). Subscribe to a paid Finnhub tier to unlock /forex/rates.`,
                metadata: { status: res.status },
              },
            ],
            totalCount: 1,
            source: CONNECTOR_NAME,
          };
        }
        const data = (await res.json()) as { quote?: number };
        if (data.quote == null) {
          return { items: [], totalCount: 0, source: CONNECTOR_NAME };
        }
        return {
          items: [
            {
              id: `forex:${base}:${quote}`,
              title: `${base}/${quote} exchange rate`,
              snippet: `1 ${base.toUpperCase()} = ${data.quote.toFixed(4)} ${quote.toUpperCase()}`,
              metadata: { base, quote, rate: data.quote, kind: 'forex' },
            },
          ],
          totalCount: 1,
          source: CONNECTOR_NAME,
        };
      }

      // Default: stock quote, possibly resolved via /search if no ticker looks right.
      let symbol = ticker;
      if (!symbol) {
        // Use /search to disambiguate company names.
        const searchRes = await fetch(
          `${FINNHUB_API}/search?q=${encodeURIComponent(q)}&token=${encodeURIComponent(apiKey)}`,
        );
        if (searchRes.ok) {
          const data = (await searchRes.json()) as { result?: Array<{ symbol: string }> };
          symbol = data.result?.[0]?.symbol;
        }
      }
      if (!symbol) {
        return { items: [], totalCount: 0, source: CONNECTOR_NAME };
      }

      const res = await fetch(`${FINNHUB_API}/quote?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(apiKey)}`);
      if (!res.ok) {
        return {
          items: [
            {
              id: `quote:${symbol}`,
              title: `${symbol} quote`,
              snippet: `Quote unavailable (HTTP ${res.status})`,
              metadata: { status: res.status },
            },
          ],
          totalCount: 1,
          source: CONNECTOR_NAME,
        };
      }
      const data = (await res.json()) as {
        c?: number; // current
        d?: number; // change
        dp?: number; // percent change
        h?: number; // high
        l?: number; // low
        o?: number; // open
        pc?: number; // previous close
        t?: number; // timestamp
      };
      if (data.c == null) {
        return { items: [], totalCount: 0, source: CONNECTOR_NAME };
      }
      const direction = (data.d ?? 0) >= 0 ? '▲' : '▼';
      const pct = (data.dp ?? 0).toFixed(2);
      const item: ConnectorResult['items'][number] = {
        id: `quote:${symbol}`,
        title: `${symbol} — $${data.c.toFixed(2)}`,
        snippet: `${direction} ${(data.d ?? 0).toFixed(2)} (${pct}%) · prev close $${(data.pc ?? 0).toFixed(2)} · day range $${(data.l ?? 0).toFixed(2)}–$${(data.h ?? 0).toFixed(2)}`,
        url: `https://finviz.com/quote.ashx?t=${symbol}`,
        metadata: {
          symbol,
          price: data.c,
          change: data.d,
          changePercent: data.dp,
          open: data.o,
          high: data.h,
          low: data.l,
          previousClose: data.pc,
          kind: 'stock',
        },
      };
      item.date = data.t
        ? new Date(data.t * 1000).toISOString()
        : new Date().toISOString();
      return {
        items: [item],
        totalCount: 1,
        source: CONNECTOR_NAME,
      };
    } catch {
      // Network error or parse failure — return empty so the orchestrator
      // surfaces a "no live data" message rather than a thrown error.
      // Flagged: this silently swallows failures; a future iteration
      // should set `metadata.error` so the caller can show a banner.
      return { items: [], totalCount: 0, source: CONNECTOR_NAME };
    }
  }

  /** 
   * Token refresh is handled by the Cloudflare Worker OAuth proxy.
   * This adapter assumes a valid token is injected via filter.token.
   * @see packages/cloudflare-server/src/index.ts OAuth refresh routes
   */
}
