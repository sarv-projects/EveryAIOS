import type { ProviderGroup } from '@personal-ai/core-domain';

/** Minimal async key-value store used by ProviderVault. */
export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/** Static catalog entry for a BYOK provider tile. */
export interface ProviderCatalogEntry {
  id: string;
  name: string;
  group: ProviderGroup;
  groupLabel: string;
  signupUrl: string;
  baseUrl: string;
  defaultModel: string;
  description: string;
  recommended?: boolean;
  /** openai = /v1/models or chat ping; key-only = non-LLM BYOK (search, image, MCP). */
  validation?: 'openai' | 'key-only';
}

/** Persisted provider record (API key stored sealed). */
export interface StoredProviderRecord {
  id: string;
  model: string;
  isActive: boolean;
  sealedKey: string;
  connectedAt: string;
  /** User-supplied base URL override (Azure/Databricks/Snowflake/Bedrock/Vertex custom endpoints). */
  baseUrl?: string;
}

/** Provider visible to the app after loading from vault. */
export interface ConnectedProvider {
  id: string;
  name: string;
  group: ProviderGroup;
  groupLabel: string;
  baseUrl: string;
  model: string;
  isActive: boolean;
  connectedAt: string;
}

/** Runtime config for OpenAI-compatible clients. */
export interface OpenAiProviderConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  fetchImpl?: typeof fetch;
}

export interface ValidationResult {
  ok: boolean;
  error?: string;
}