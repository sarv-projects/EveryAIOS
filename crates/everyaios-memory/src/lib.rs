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

pub mod actr;
pub mod compaction;
pub mod fusion;
pub mod ghost;
pub mod graph;
pub mod paging;
pub mod reference;
pub mod taste;

pub use actr::{
    activation, derive_queries, forget_sweep, is_protected, keyword_hits, recall_score, recency,
    Memory, RecallWeights, DEFAULT_IMPORTANCE_FLOOR,
};
pub use compaction::{
    decide_context_action, find_safe_split, persist_decision, prune_protect, should_snip,
    sliding_window, snip_anchor, summarize_or_passthrough, CacheBreak, CompactionConfig,
    ContextAction, PersistDecision, PrefixCache,
};
pub use fusion::{
    approx_tokens, budget_tokens, cap_text, dedupe, merge_small_chunks, rrf_fuse, smart_snippets,
    ContentType, Signal,
};
pub use ghost::GhostIndex;
pub use graph::{Edge, EdgeType, GraphStore, Node, NodeKind, DEFAULT_MAX_DEPTH, DEFAULT_TOP_K};
pub use paging::{MemoryEntry, PagedMemory, Surface, CORE_BUDGET_TOKENS};
pub use reference::{bounded_preview, make_ref_handle, RefHandle, RefKind, PREVIEW_BUDGET_TOKENS};
pub use taste::{TasteRule, TasteStore};

use thiserror::Error;

#[derive(Debug, Error)]
pub enum MemoryError {
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
}
