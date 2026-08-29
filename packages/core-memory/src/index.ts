export { MemoryService, type RememberOptions } from './service.js';
export { MemoryConflictResolver, type EmbedVectorFn, type ConflictDetectionResult } from './conflict.js';
// Aggregate decay surface — see ./decay.ts for the doc/code-path rationale.
export {
  classifyPolarity,
  detectFrustration,
  lessonStrength,
  lessonSuppressionWeight,
  rankWithPolarity,
  tokenOverlap,
  POLARITY_SUPPRESSION,
  POLARITY_OVERLAP_FLOOR,
  type FactPolarity,
} from './forgetting-to-remember.js';
export {
  DECAY_LAMBDA,
  ARCHIVE_THRESHOLD,
  shouldRunDecay,
  computeDecayScore,
  confidenceFromCandidate,
  isArchived,
  daysSince,
  type DecayInput,
} from './decay.js';
export {
  inferMemoryCategoriesFromQuery,
  memoryCategoriesForIntent,
  allMemoryCategories,
} from './categories.js';
export {
  buildMemoryRetrievalHint,
  attachMemoryScopeToPlan,
  type MemoryRetrievalHint,
} from './router-integration.js';
export {
  preloadForActivity,
  preloadCoverage,
  preloadLift,
  scoreFact,
  topicOverlap,
  recencyBoost,
  categoryMatch,
  type PhantomActivity,
  type PhantomFact,
  type PreloadOptions,
} from './phantom-thread.js';
export {
  spreadActivation,
  lateralInhibit,
  rankByActivation,
  type ActivationEdge,
  type ActivationSeed,
  type ActivationResult,
  type SpreadOptions,
} from './spreading-activation.js';
export {
  predictNextTopics,
  scoreTopic,
  evaluateAnticipation,
  type TemporalEvent,
  type PredictOptions,
  type PredictionScore,
  type AnticipationEval,
} from './temporal-anticipation.js';
export {
  detectCorrections,
  trackCorrection,
  getCorrectionCount,
  seedCorrectionCounts,
  clearCounts,
  PROMOTION_THRESHOLD,
  type PromotionCandidate,
} from './correction-detector.js';
export {
  loadCorrectionPatterns,
  incrementCorrectionCount,
  listTrackedPatterns,
  removeTrackingRow,
  correctionConfidenceFromCount,
} from './correction-store.js';
export {
  autoPromote,
  type AutoPromoteResult,
  type OnPromoteCallback,
} from './auto-promote.js';
export {
  KnowledgeGraphService,
  extractEntitiesAndTriples,
  type KGraphDb,
  type ExtractedEntity,
  type ExtractedTriple,
  type EntityType,
  type EntityRow,
  type TripleRow,
  type GraphQueryResult,
} from './knowledge-graph.js';

// --- KG v2 (schema v19) deterministic + LLM refinement ---
export {
  extractTier1,
  extractStructure,
  extractKeyValues,
  extractGazetteer,
  extractCoOccurrence,
  extractEvents,
  extractProjectLinks,
  type Tier1Result,
  type Tier1Options,
  type KgObject,
  type KgObjectType,
  type KgEdgeType,
  type KgEvent,
  type KgRelation,
} from './kg-extraction.js';

export {
  refineTier2,
  estimateTier2Cost,
  type Tier2Input,
  type Tier2Output,
  type Tier2LlmProvider,
  type Tier2Billing,
  type Tier2Options,
} from './kg-llm-refinement.js';