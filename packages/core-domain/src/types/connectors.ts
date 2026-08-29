/** Known connector names */
export type ConnectorName =
  | 'local-files'
  | 'web-search'
  | 'memory'
  | 'google-drive'
  | 'gmail'
  | 'google-calendar'
  | 'google-tasks'
  | 'youtube'
  | 'notion'
  | 'github'
  | 'telegram'
  | 'weather'
  | 'rss'
  | 'calendar-native'
  | 'dropbox'
  | 'discord'
  | 'slack'
  | 'spotify'
  | 'wikipedia'
  | 'hacker-news'
  | 'public-holidays'
  | 'nominatim'
  | 'worldtime'
  | 'ical'
  | 'restcountries'
  | 'microsoft-mail'
  | 'microsoft-calendar'
  | 'microsoft-onedrive'
  // Mobile-useful connectors (free)
  | 'reddit'
  | 'todoist'
  | 'google-places'
  | 'coingecko'
  | 'stackexchange'
  | 'openlibrary'
  // Batch 3 (2026-07-23): high-adoption mobile connectors — finance /
  // productivity / messaging / travel / music. All free.
  | 'finnhub'
  | 'trello'
  | 'aviationstack'
  | 'soundcloud'
  // Composio managed-auth connectors
  | 'composio-gmail'
  | 'composio-google-drive'
  | 'composio-google-calendar'
  | 'composio-google-sheets'
  | 'composio-google-docs'
  | 'composio-google-tasks'
  | 'composio-outlook'
  | 'composio-onedrive'
  | 'composio-teams'
  | 'composio-instagram'
  | 'composio-facebook'
  | 'composio-linkedin'
  | 'composio-slack'
  | 'composio-reddit'
  | 'composio-discord'
  | 'composio-notion'
  | 'composio-todoist'
  | 'composio-trello'
  | 'composio-clickup'
  | 'composio-dropbox'
  | 'composio-github'
  | 'composio-gitlab'
  | 'composio-linear'
  | 'composio-canva'
  | 'composio-spotify'
  | 'composio-hubspot'
  | 'composio-salesforce'
  | 'composio-zoom'
  | 'composio-box'
  | 'composio-browserbase'
  | 'composio-zapier'
  // Native device connectors (Content Provider + Intent pattern, no AccessibilityService)
  | 'health-native'
  | 'contacts-native'
  | 'location-native';

/** Schema definition for a connector's filterable metadata fields */
export interface ConnectorMetadataSchema {
  fields: ConnectorField[];
}

/** A single metadata filter field */
export interface ConnectorField {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'date';
  description: string;
}

/** Generic filter key-value map */
export interface ConnectorFilter {
  [key: string]: unknown;
}

/** Context passed when fetching from a connector */
export interface ConnectorContext {
  userId: string;
  query: import('./router').UserQuery;
  filter: ConnectorFilter;
  signal?: AbortSignal;
}

/** Structured result from a connector query */
export interface ConnectorResult {
  items: ConnectorItem[];
  totalCount: number;
  source: ConnectorName;
}

/** A single item returned by a connector */
export interface ConnectorItem {
  id: string;
  title: string;
  snippet: string;
  url?: string;
  date?: string;
  metadata?: Record<string, unknown>;
}

/** Interface each connector adapter must implement */
export interface ConnectorAdapter {
  name: ConnectorName;
  metadataSchema: ConnectorMetadataSchema;
  isAuthorized(userId: string): Promise<boolean>;
  scoreRelevance(query: import('./router').UserQuery, memory: import('./memory').MemoryFact[]): number;
  buildFilter(query: import('./router').UserQuery): ConnectorFilter;
  fetch(ctx: ConnectorContext): Promise<ConnectorResult>;
  refreshToken?(userId: string): Promise<boolean>;
}
