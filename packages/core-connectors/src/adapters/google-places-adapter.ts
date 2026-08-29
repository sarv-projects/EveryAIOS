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
 * Google Places (New) adapter — text search + nearby POI lookup.
 *
 * Uses Google Places API key (NOT OAuth — avoids CASA scope audit).
 * Free tier: $200/mo credit → ~28,000 basic-data text searches.
 *
 * Endpoints:
 *   POST https://places.googleapis.com/v1/places:searchText  (X-Goog-Api-Key header)
 *   POST https://places.googleapis.com/v1/places:searchNearby
 */
const metadataSchema: ConnectorMetadataSchema = {
  fields: [
    { name: 'query', type: 'string', description: 'Place / business name or search text' },
    { name: 'lat', type: 'number', description: 'Latitude for nearby search' },
    { name: 'lon', type: 'number', description: 'Longitude for nearby search' },
    { name: 'radius', type: 'number', description: 'Radius (m) for nearby search, default 1500' },
    { name: 'open_now', type: 'boolean', description: 'Filter to currently-open places' },
    { name: 'limit', type: 'number', description: 'Max results (default 5)' },
  ],
};

const PLACES_API = 'https://places.googleapis.com/v1';

export class GooglePlacesAdapter implements ConnectorAdapter {
  readonly name: ConnectorName = 'google-places';
  readonly metadataSchema = metadataSchema;

  async isAuthorized(_userId: string): Promise<boolean> {
    // API key model — usable if GOOGLE_PLACES_API_KEY is configured
    return true;
  }

  scoreRelevance(query: UserQuery, _memory: MemoryFact[]): number {
    const q = (query.text || '').toLowerCase();
    const terms = ['nearby', 'near me', 'restaurant', 'cafe', 'coffee', 'shop', 'store', 'gym', 'park', 'hotel', 'bar', 'atm', 'pharmacy'];
    if (terms.some((t) => q.includes(t))) return 0.7;
    if (/open (now|right now|today)/i.test(q)) return 0.85;
    if (/find\b.*\b(near|in)\b/i.test(q)) return 0.65;
    return 0.1;
  }

  buildFilter(query: UserQuery): ConnectorFilter {
    const text = query.text || '';
    const openNow = /open (now|right now)/i.test(text);
    return { query: text, open_now: openNow, limit: 5, radius: 1500 };
  }

  async fetch(ctx: ConnectorContext): Promise<ConnectorResult> {
    const f = (ctx.filter || {}) as { query?: string; lat?: number; lon?: number; radius?: number; open_now?: boolean; limit?: number; api_key?: string };
    // API key may come from orchestrator (env), mobile (filter), or Worker proxy.
    const apiKey = (f as { api_key?: string }).api_key ||
      ((ctx as unknown as { env?: { GOOGLE_PLACES_API_KEY?: string } }).env?.GOOGLE_PLACES_API_KEY) || '';
    if (!apiKey) return { items: [], totalCount: 0, source: this.name };
    const limit = Math.min(Math.max(Number(f.limit) || 5, 1), 20);
    let url: string;
    let body: Record<string, unknown>;
    if (typeof f.lat === 'number' && typeof f.lon === 'number') {
      url = `${PLACES_API}/places:searchNearby`;
      body = {
        maxResultCount: limit,
        locationRestriction: { circle: { center: { latitude: f.lat, longitude: f.lon }, radius: f.radius || 1500 } },
        ...(f.open_now ? { openNow: true } : {}),
      };
    } else {
      const text = (f.query || '').trim();
      if (!text) return { items: [], totalCount: 0, source: this.name };
      url = `${PLACES_API}/places:searchText`;
      body = { textQuery: text, maxResultCount: limit, ...(f.open_now ? { openNow: true } : {}) };
    }

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.rating,places.priceLevel,places.types,places.currentOpeningHours.openNow,places.location',
          Accept: 'application/json',
        },
        body: JSON.stringify(body),
        signal: ctx.signal ?? null,
      });
      if (!res.ok) return { items: [], totalCount: 0, source: this.name };
      const raw = (await res.json()) as { places?: Array<{
        id: string;
        displayName?: { text?: string };
        formattedAddress?: string;
        rating?: number;
        priceLevel?: string;
        types?: string[];
        currentOpeningHours?: { openNow?: boolean };
        location?: { latitude: number; longitude: number };
      }> };
      const items: ConnectorResult['items'] = (raw.places ?? []).map((p) => ({
        id: `place-${p.id}`,
        title: p.displayName?.text || 'Unknown place',
        snippet: [
          p.formattedAddress,
          p.rating ? `★ ${p.rating}` : '',
          p.priceLevel ? p.priceLevel : '',
          p.currentOpeningHours?.openNow ? 'open now' : '',
        ].filter(Boolean).join(' · ').slice(0, 280),
        url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.displayName?.text || '')}&query_place_id=${encodeURIComponent(p.id)}`,
        metadata: {
          address: p.formattedAddress,
          rating: p.rating,
          open: p.currentOpeningHours?.openNow,
          types: p.types?.join(','),
        },
      }));
      return { items, totalCount: items.length, source: this.name };
    } catch {
      return { items: [], totalCount: 0, source: this.name };
    }
  }

  /** 
   * Token refresh is handled by the Cloudflare Worker OAuth proxy.
   * This adapter assumes a valid token is injected via filter.token.
   * @see packages/cloudflare-server/src/index.ts OAuth refresh routes
   */
}
