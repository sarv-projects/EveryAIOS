/** Intent categories the smart router can classify */
export type IntentCategory =
  | 'conversational'
  | 'needs-files'
  | 'needs-web'
  | 'needs-automation'
  | 'needs-connector'
  | 'needs-docs'
  | 'out-of-scope';

/** Handlers the router can dispatch to */
export type RouteHandler =
  | 'MANAGED_FREE'
  | 'MANAGED_PAID'
  | 'MANAGED_FAST'
  | 'MANAGED_SMART'
  | 'MANAGED_VISION'
  | 'BYOK'
  | 'PROMPT_BYOK'
  | 'OFFLINE'
  | 'AUTOMATION_DRAFT';

/** A user's incoming query */
export interface UserQuery {
  text: string;
  attachments?: string[];
  scope?: 'open-document' | 'all-files' | 'memory' | 'web' | 'none';
}

/** Context the router evaluates before deciding */
export interface RouteContext {
  hasByokKey: boolean;
  hasInternet: boolean;
  batteryLevel?: number;
  activeConnectors: string[];
  openDocumentId?: string;
  /** First ~250 chars of the opening user message — steers routing for the whole chat. */
  chatIntentAnchor?: string;
  tier: import('./billing').Tier;
  /** Model routing mode — Fast (Flash), Smart (V4 Pro), or user-selected BYOK */
  modelMode?: 'fast' | 'smart' | 'user_selected';
  /** Input contains images requiring vision extraction */
  hasImages?: boolean;
  /** Input contains audio requiring multimodal understanding */
  hasAudio?: boolean;
  /** Input contains video requiring multimodal understanding */
  hasVideo?: boolean;
}

/** Result of intent classification */
export interface IntentClassification {
  category: IntentCategory;
  confidence: number;
  entities?: Record<string, string>;
  subCategory?: string;
  /** Response depth: quick (1 sentence), standard (balanced), detailed (full treatment) */
  depth: 'quick' | 'standard' | 'detailed';
}

/** Which sources to query and how */
export interface RetrievalPlan {
  sources: Array<'fts5' | 'vector' | 'web' | 'connector' | 'memory' | 'docs' | 'kg'>;
  query: string;
  maxResults: number;
  connectorFilters?: Record<string, unknown>;
  scopeDocumentId?: string;
  /** Scoped memory categories (personal, books, finance, …). */
  memoryCategories?: string[];
  memorySourceId?: string;
}

/** Final routing decision */
export interface RouteDecision {
  handler: RouteHandler;
  intent: IntentClassification;
  retrievalPlan?: RetrievalPlan;
  provider?: import('./providers').ProviderConfig;
  reason: string;
}
