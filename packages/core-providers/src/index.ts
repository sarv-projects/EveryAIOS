export {
  PROVIDER_CATALOG,
  AI_PROVIDER_GROUPS,
  WEB_OTHER_PROVIDER_GROUPS,
  getProviderById,
  getRecommendedProviders,
  filterProvidersBySection,
  isAiProviderGroup,
  groupProvidersByLabel,
} from './registry.js';
export { validateApiKey, streamCompletion, fetchAvailableModels } from './openai-client.js';
export {
  fetchProviderPricing,
  formatPricingLine,
  type ProviderPricing,
} from './pricing/live-pricing.js';
export { streamAnthropicCompletion, validateAnthropicApiKey, ANTHROPIC_KNOWN_MODELS } from './anthropic-client.js';
export { ProviderVault } from './vault.js';
export {
  getModelCatalog,
  setModelCatalog,
  getBundledCatalogVersion,
  getModelsForProvider,
  getModelCapabilities,
  modelSupportsReasoning,
  modelSupportsVision,
  type ModelCatalog,
  type ModelCapabilities,
  type ProviderModels,
  type ModelInputModality,
} from './capability-registry.js';
export type {
  ConnectedProvider,
  KeyValueStore,
  OpenAiProviderConfig,
  ProviderCatalogEntry,
  StoredProviderRecord,
  ValidationResult,
} from './types.js';
export type {
  ModelAdapter,
  CapabilityProfile,
  CostEstimate,
  NormalizedModelResult,
  NormalizedToolCall,
  ProviderRequest,
} from './types/model-adapter.js';