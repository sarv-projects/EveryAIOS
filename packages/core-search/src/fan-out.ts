/**
 * Multi-query fan-out + local-aware search hinting (deterministic, zero LLM).
 *
 * Mirrors the ChatGPT-style pipeline step "Query Fan-out": instead of sending
 * ONE query per intent, derive several aspect queries and run them in parallel,
 * then merge + dedupe results. Cost stays free — everything here is string
 * splitting and regex, no model calls.
 *
 * Location: local-intent detection appends a locality hint ("near <city>",
 * "in <region>, <country>") when the device has shared a coarse location.
 * The raw coordinates are never placed in the query — only human-readable
 * locality strings, so no PII leaks into provider logs.
 */

export interface FanOutOptions {
  /** Max aspect queries to derive. Default 3. */
  maxAspects?: number;
  location?: {
    city?: string;
    region?: string;
    country?: string;
  };
}

/** Split tokens that usually delimit a comparison / compound query. */
const ASPECT_SPLITTERS = [
  /\bvs\.?\b|\bversus\b/i,
  /\band\b|\b&\b|\bplus\b|\b\+/i,
  /\bor\b/i,
  /,\s*|\bcompare\b|\bcompare\s+to\b/i,
];

/** Local-intent markers — queries that want nearby / location-specific results. */
const LOCAL_INTENT_MARKERS = [
  'near me',
  'nearby',
  'in my area',
  'close to me',
  'around me',
  'weather',
  'restaurant',
  'cafe',
  'coffee',
  'atm',
  'hospital',
  'pharmacy',
  'doctor',
  'dentist',
  'gym',
  'hotel',
  'gas station',
  'petrol',
  'salon',
  'barber',
  'clinic',
  'store',
  'shop',
  'supermarket',
  'market',
  'delivery',
  'takeaway',
  'pizza',
  'opening hours',
  'open now',
  'events',
  'movie',
  'cinema',
  'theatre',
  'park',
  'school',
  'college',
  'bank',
  'post office',
  'metro',
  'station',
  'airport',
  'beach',
  'temple',
  'mosque',
  'church',
  'gurudwara',
  'mandir',
];

/** True when the query looks like it wants results tied to a physical location. */
export function isLocalIntent(query: string): boolean {
  const lower = query.toLowerCase();
  return LOCAL_INTENT_MARKERS.some((marker) => lower.includes(marker));
}

/** Build the locality hint string from coarse location (never coordinates). */
export function buildLocationHint(location: FanOutOptions['location']): string | null {
  if (!location) return null;
  if (location.city) return location.city;
  if (location.region && location.country) return `${location.region}, ${location.country}`;
  if (location.region) return location.region;
  if (location.country) return location.country;
  return null;
}

/**
 * Derive aspect queries from a user query. Deterministic:
 * 1. Original query (trimmed).
 * 2. First split on comparison/compound delimiters → leading aspect.
 * 3. Second aspect (trailing side of the split) when a split was found.
 * Deduplicated, bounded by maxAspects, non-empty.
 */
export function generateAspectQueries(
  query: string,
  options: FanOutOptions = {},
): string[] {
  const trimmed = query.trim().replace(/\s+/g, ' ');
  if (!trimmed) return [];

  const maxAspects = Math.max(1, options.maxAspects ?? 3);
  const aspects: string[] = [trimmed];

  for (const splitter of ASPECT_SPLITTERS) {
    const parts = trimmed
      .split(splitter)
      .map((p) => p.trim())
      .filter((p) => p.length > 2);
    if (parts.length >= 2) {
      // Leading aspect + trailing aspect (whole remainder) — most informative.
      aspects.push(parts[0]!);
      const remainder = parts.slice(1).join(' ').trim();
      if (remainder.length > 2 && !aspects.includes(remainder)) {
        aspects.push(remainder);
      }
      break; // One split level is enough — avoids combinatorial blowup.
    }
  }

  // Local intent: append the locality hint so the locality-scoped variant is
  // GUARANTEED a slot (it's the entire point of the hint). Prioritized ABOVE
  // split aspects — never silently dropped by the maxAspects cap.
  const hintedAspect = isLocalIntent(trimmed)
    ? (() => {
        const hint = buildLocationHint(options.location);
        return hint ? `${trimmed} near ${hint}` : null;
      })()
    : null;

  const unique: string[] = [];
  for (const aspect of hintedAspect ? [hintedAspect, trimmed] : [trimmed]) {
    if (!unique.includes(aspect)) unique.push(aspect);
    if (unique.length >= maxAspects) break;
  }
  for (const aspect of aspects) {
    if (unique.includes(aspect)) continue;
    unique.push(aspect);
    if (unique.length >= maxAspects) break;
  }
  return unique.slice(0, maxAspects);
}

/** Merge + dedupe results across parallel aspect queries (by URL). */
export function mergeAndDedupe(
  batches: Array<Array<{ title: string; url: string; snippet: string; score: number; source: string }>>,
  maxResults = 12,
): Array<{ title: string; url: string; snippet: string; score: number; source: string }> {
  const seen = new Set<string>();
  const merged: Array<{ title: string; url: string; snippet: string; score: number; source: string }> = [];
  for (const batch of batches) {
    if (!batch) continue;
    for (const result of batch) {
      const key = result.url.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(result);
      if (merged.length >= maxResults) return merged;
    }
  }
  return merged;
}
