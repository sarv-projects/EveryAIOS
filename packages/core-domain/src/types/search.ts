/** A single search result entry */
export type Scope =
  | { type: 'none' }
  | { type: 'sources'; sourceIds: string[] }
  | { type: 'source_hard'; sourceId: string }
  | { type: 'project'; projectId: string };

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  content?: string;
  score: number;
  source: string;
}

/** Optional location for local-aware search (device permission-gated). */
export interface SearchLocation {
  city?: string;
  region?: string;
  country?: string;
  /** Approximate lat/lng when the device grants it. */
  latitude?: number;
  longitude?: number;
}

/** Context for determining search capabilities */
export interface SearchContext {
  hasNativeGrounding: boolean;
  hasByokSearchKey: boolean;
  query: string;
  userId: string;
  /** Optional device location — never sent as-is; only locality hints. */
  location?: SearchLocation;
}

/** Interface for a search provider in the cascade */
export interface SearchProvider {
  name: string;
  kind: 'search' | 'fetch';
  isAvailable(ctx: SearchContext): Promise<boolean>;
  search?(query: string): Promise<SearchResult[]>;
  fetch?(url: string): Promise<string>;
}
