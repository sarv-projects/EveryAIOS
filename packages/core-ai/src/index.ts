export {
  DEFAULT_CHAT_SYSTEM_PROMPT,
  buildRagSystemPrompt,
  assertCitationInvariant,
  assembleChatPrompt,
} from './chat/system-prompt.js';
export {
  buildPersonalityPrompt,
  PERSONA_PRESETS,
  DEFAULT_PERSONA,
  CACHE_BOUNDARY,
  type PersonaId,
} from './chat/persona.js';
export {
  AGENT_CATALOG,
  getAgentById,
  getAgentByLabel,
  agentSystemBlock,
  type AgentDefinition,
  type AgentToolHint,
} from './chat/agents.js';
export { normalizeOutput } from './chat/output-normalizer.js';
export {
  buildCompressedAugmentedPrompt,
  compressChatMessages,
  compressRetrievalBlock,
  compressTextToBudget,
  contextCharBudget,
  COMPRESSION_TARGET_RATIO,
  type CompressionStats,
  type CompressibleSource,
} from './context/context-compressor.js';
export * from './artifact-maker/index.js';
export * from './router/index.js';
export * from './retrieval/performance-stack.js';
export {
  CHAT_BLOCK_CHARS,
  CHAT_CONTEXT_TOKENS,
  CHAT_MAX_OUTPUT_TOKENS,
  SLM_BLOCK_CHARS,
  SLM_CONTEXT_TOKENS,
  SLM_MAX_OUTPUT_TOKENS,
  slmInputCharBudget,
} from './router/prompt-limits.js';

export { classifyDepth } from './router/heuristic-classifier.js';
export { preRoute } from './router/pre-router.js';
export type { PreRouteDecision } from './router/pre-router.js';
export { AffinityTracker, getAffinityTracker } from './router/affinity-tracker.js';
export type { RouteClass, ThreadAffinity, AffinityDecision } from './router/affinity-tracker.js';
export { MetricsCollector, getMetricsCollector, buildRequestMetrics } from './metrics/metrics-collector.js';
export type { RequestMetrics, RouteHealth } from './metrics/metrics-collector.js';
export { isOnDeviceGenerationAvailable, getRecommendedLocalModel, formatLocalPrompt, PlaceholderRuntime } from './local/llm-runtime.js';
export type { LocalModelInfo, LocalGenerationConfig, LocalGenerationResult, LocalInferenceRuntime } from './local/llm-runtime.js';
export {
  calculateBudget,
  selectRecentTurns,
  buildOlderSummary,
  buildMemoryTier,
  buildToolResultTier,
  assembleCompactContext,
  needsCompaction,
} from './context/tiered-compaction.js';
export type { CompactContext, ContextBudget } from './context/tiered-compaction.js';
export {
  StreamSession,
  StreamCancellationToken,
  shouldContinueStreaming,
  estimateStreamCost,
} from './streaming/stream-session.js';
export type { StreamEvent, StreamSessionConfig } from './streaming/stream-session.js';