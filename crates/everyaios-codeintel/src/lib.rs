//! everyaios-codeintel — code intelligence (P7.1, I11 — doc 63 §2.1).
//!
//! - `lsp` — LSP JSON-RPC framing (Content-Length headers) + the core types
//!   (hover, location, diagnostic, text-edit, code-action, inlay-hint).
//! - `semantic` — SCIP-style symbol index + `symbol_where`/`symbol_callers`/
//!   `unused_exports` queries (crux pattern).
//! - `repomap` — repo map: tag extraction, symbol graph, PageRank ranking,
//!   and budget fitting (aider `repomap.py` pattern). Tree-sitter plugs in as
//!   a `TagSource`; the lexical source is the default.
//! - `session` — the LSP session runtime: transport trait, stdio process
//!   transport (spawn + keep-alive), and the initialize/request/notify
//!   lifecycle.
//! - `scip` — SCIP protobuf ingestion: a dependency-free wire-format reader
//!   that decodes a SCIP `Document` into the `SemanticIndex`.

pub mod lsp;
pub mod lsp_config;
pub mod lsp_runner;
pub mod repo_cache;
pub mod repomap;
pub mod scip;
pub mod scip_watch;
pub mod semantic;
pub mod session;
pub mod warp;

pub use lsp::{
    decode_messages, encode_message, CodeAction, Diagnostic, FramingError, Hover, HoverContents,
    InlayHint, Location, LspRequest, LspResponse, Position, Range, TextEdit, WorkspaceEdit,
};
pub use lsp_config::{DiagnosticBatch, DiagnosticsService, LspConfig, LspServerConfig};
pub use lsp_runner::{LspRunner, LspRunnerError};
pub use repomap::{
    build_repo_map, build_repo_map_with, extract_tags, extract_tags_with, fit_budget, page_rank,
    rank_tags, CompositeTagSource, LexicalTagSource, RepoMap, Tag, TagKind, TagSource,
};
pub use scip::{
    parse_document, to_semantic_index, ScipDocument, ScipError, ScipOccurrence, ScipSymbol,
};
pub use semantic::{
    OccurrenceRole, RelationKind, Relationship, SemanticIndex, Symbol, SymbolKind, SymbolOccurrence,
};
pub use repo_cache::{map_hash, CachedRow, RepoMapCache};
pub use scip_watch::{
    build_index, find_scip_files, scan_dir, symbol_heat, ScipScanReport, ScipWatchState,
};
pub use session::{LspSession, LspSessionError, LspTransport, ProcessTransport};
pub use warp::{
    chunk_text, chunks_for, embed_sync, sync_changed, Chunk, ChunkMode, ChangedChunk, Embedder,
    FileState, WarpIndex,
};
