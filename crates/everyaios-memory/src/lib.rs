//! everyaios-memory — memory fusion + token economy (P5, C1–C10).
//!
//! The pure, testable algorithm cores of the memory pillar. Retrieval signals
//! (FTS5, vectors, graph) are supplied by callers; this crate owns the fusion
//! math, the ACT-R decay/recall model, the taste profile, and the compaction
//! pipeline.
//!
//! - `fusion` — weighted RRF multi-signal fusion (Alg #18), dedupe, smart
//!   snippets, per-type budget caps, chunk-min-size merging (Alg #29).
//! - `actr` — ACT-R retention decay + importance floor + associative recall +
//!   spontaneous-recall query derivation (Alg #32).
//! - `taste` — confidence-scored taste profile + stable-prefix injection +
//!   shareable markdown (Alg #31).
//! - `compaction` — snip/soft/force ratios, safe split points, sliding window,
//!   summarize-fail-open, prefix-dirty flag, PRUNE_PROTECT (Alg #21).
//! - `graph` — graph store (entity/episodic + typed edges + temporal
//!   edge-versioning + spreading activation + depth-cap query) (Alg #6/#30).
//! - `paging` — Letta-style 3-surface paging (core/archival/recall) with
//!   queued writes + overflow eviction (Alg #20).
//! - `ghost` — ghost-context prevention index (atomic tombstone + re-path).
//! - `reference` — pass-by-reference handles + bounded previews (C10).
//! - `fsrs` — FSRS-6 spaced-repetition scheduler (C13): memory-state
//!   prediction, next-interval/next-states, and a workload simulator for the
//!   "reinforce what I learned" review queue.
//! - `classify` — intent classifier (Vane pattern): memory/fact/event/
//!   document class + (needs_research, needs_tools, needs_widgets,
//!   rewrite_query) routing signals.
//! - `summary` — hierarchical repo summarization (deepwiki-open pattern):
//!   summarize-file → directory → index → answer over summaries (no
//!   embeddings).
//! - `reinforce` — FSRS-backed review queue: ingest post-session candidates
//!   and surface due review prompts at retention-target intervals.
//! - `bm25` — BM25 keyword retrieval signal (P5/C7): pure Okapi BM25 over
//!   in-memory docs, used as one of the fused retrieval signals.
//! - `planner` — context planner (C7): decides what goes in the prompt from
//!   the retrieved signals (memory, search, tools, widgets) with token
//!   budget + precedence.
//! - `janus` — Janus structural passes (doc 63 §2.1): dedup (exact +
//!   near-dup), regex collapse, and AST prune — the context-reduction
//!   pipeline before injection.
//! - `cognee` — Cognee-style entity/knowledge-graph API (memory ontology
//!   CRUD + query surface, doc 63 §2.1) — graph as a first-class memory
//!   shape alongside snippets.
//! - `rtk` — RTK-style per-command tool-output compression (P5.7): ls/ps/
//!   git/du parsers that keep only action-relevant fields, measured
//!   60–90% reduction.
//! - `usage` — usage accounting (P8): per-key/per-session token + cache
//!   hit/miss ledger with cost at configured prices (the per-key cost
//!   display + cache-hit-rate queries).

pub mod actr;
#[cfg(test)]
mod bench;
pub mod bm25;
pub mod cache;
pub mod classify;
pub mod cognee;
pub mod compaction;
pub mod embedding;
pub mod fsrs;
pub mod fusion;
pub mod ghost;
pub mod graph;
pub mod janus;
pub mod paging;
pub mod planner;
pub mod reference;
pub mod reinforce;
pub mod repair;
pub mod rerank;
pub mod rtk;
pub mod summary;
pub mod taste;
pub mod usage;

pub use actr::{
    activation, derive_queries, forget_sweep, is_protected, keyword_hits, recall_score, recency,
    Memory, RecallWeights, DEFAULT_IMPORTANCE_FLOOR,
};
pub use compaction::{
    compact_with_fallback, decide_context_action, find_safe_split, persist_decision, prune_protect,
    run_compaction_lifecycle, should_snip, sliding_window, snip_anchor, summarize_or_passthrough,
    truncate_with_marker, CacheBreak, CompactionConfig, CompactionCoordinator, CompactionEvent,
    ContextAction, FallbackStep, PersistDecision, PrefixCache, Summarizer,
};
pub use fusion::{
    approx_tokens, budget_tokens, cap_text, dedupe, merge_small_chunks, rrf_fuse, smart_snippets,
    ContentType, Signal,
};
pub use ghost::{FsEvent, GhostIndex};
pub use graph::{Edge, EdgeType, GraphStore, Node, NodeKind, DEFAULT_MAX_DEPTH, DEFAULT_TOP_K};
pub use paging::{MemoryEntry, PagedMemory, Surface, CORE_BUDGET_TOKENS};
pub use classify::{classify, plan_execution, parallel_groups, ExecutionPlan, Intent, IntentKind};
pub use fsrs::{
    simulate, Fsrs, FsrsError, ItemState, MemoryState, NextStates, Rating, SimulationConfig,
    SimulationReport, DEFAULT_PARAMETERS, FSRS5_DEFAULT_DECAY, FSRS6_DEFAULT_DECAY,
};
pub use reference::{
    bounded_preview, make_ref_handle, query_ref, RefHandle, RefKind, PREVIEW_BUDGET_TOKENS,
};
pub use reinforce::{
    extract_candidates, split_sentences, ReviewCandidate, ReviewCard, ReviewQueue,
};
pub use bm25::{
    fuse_signals, run_signals_parallel, tokenize, Bm25Doc, Bm25Index, Hit, SignalKind,
    SignalRank, SignalSource,
};
pub use cognee::{CogneeMemory, RecallResult};
pub use janus::{ast_prune, dedup, regex_collapse, run_janus, PassResult};
pub use planner::{
    BudgetResult, ContextPlanner, PlannerConfig, PlannerDecision,
};
pub use rtk::{compress, kind_for, CommandKind, CompressedOutput};
pub use usage::{UsageLedger, UsageRecord};
pub use cache::{ResultCache, SemanticCache};
pub use embedding::{
    cosine, dot, hamming, l2, quantize_binary, quantize_int8, BinaryVector, Embedder,
    EmbeddingIndex, Int8Vector,
};
pub use repair::{repair_tool_json, Repair};
pub use rerank::{rerank, Candidate, LexicalReranker, RankedHit, Reranker};
pub use graph::OPEN;
pub use summary::{
    answer_over_summaries, index_summaries, summarize_directory, summarize_file, FileSummary,
};
pub use taste::{TasteRule, TasteStore};

use thiserror::Error;

#[derive(Debug, Error)]
pub enum MemoryError {
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
}
