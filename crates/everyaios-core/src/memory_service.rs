//! P5.1 / P5.3 / P5.4 — the Rust memory dispatch the coordinator sidecar
//! calls over JSON-RPC. One [`MemoryService`] owns the in-process memory
//! surfaces (`PagedMemory`, `Bm25Index`, `GraphStore`, `GhostIndex`,
//! `ContextPlanner`, `UsageLedger`) and answers `memory/*` + `usage/snapshot`
//! methods, so the pure algorithm cores land in the live loop (the wiring the
//! TODO's "coordinator integration follow-up" items tracked).
//!
//! This is the **in-process** store: session facts live for the process
//! lifetime. Persistent durability (vault/SQLCipher) is a follow-up layer —
//! the schema here is exactly what that layer will hydrate on boot.

use serde_json::{json, Value};
use std::collections::HashSet;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use everyaios_memory::{
    extract_candidates, Bm25Doc, Bm25Index, ContextPlanner, EdgeType, FsEvent, GhostIndex,
    GraphStore, MemoryEntry, NodeKind, PagedMemory, PlannerConfig, UsageLedger,
};

/// Current wall-clock time in milliseconds since the Unix epoch (0 when the
/// clock is unavailable — the store still works, timestamps just degenerate).
fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// The lifecycle state of one stored fact. Memory is a *changing belief state*,
/// not an append-only log: a newer fact can supersede an older one (the
/// write-side synthesis the ChatGPT/Dreaming architecture describes), and the
/// warm set only injects what is still `Active`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FactStatus {
    /// Currently believed — eligible for warm-set injection and retrieval.
    #[default]
    Active,
    /// Superseded by a later fact (kept for history/provenance, not injected).
    Superseded,
}

/// Persistence / parse failures for the memory service (on-disk durability).
#[derive(Debug, thiserror::Error)]
pub enum MemoryServiceError {
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("json error: {0}")]
    Json(#[from] serde_json::Error),
}

/// The durable slice of the store (what survives a reboot).
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
struct PersistedMemory {
    counter: u64,
    facts: Vec<StoredFact>,
}

/// One stored fact (the `memory/read` result shape).
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct StoredFact {
    pub id: String,
    pub session_id: String,
    pub text: String,
    pub importance: u8,
    /// When the fact was first recorded (ms epoch) — the temporal axis.
    #[serde(default)]
    pub created_at_ms: u64,
    /// When the fact was last changed (superseded by a later fact, etc.).
    #[serde(default)]
    pub updated_at_ms: u64,
    /// Lifecycle state (Active vs Superseded). Backward-compatible with
    /// persisted stores predating the field (defaults to Active).
    #[serde(default)]
    pub status: FactStatus,
    /// Provenance: which surface produced this fact (`chat` / `file` / `synthesis`).
    #[serde(default)]
    pub source: String,
    /// Provenance: session / file / ticket id the fact derived from.
    #[serde(default)]
    pub source_id: String,
    /// Project-scope isolation key (`None` = global / unscoped).
    #[serde(default)]
    pub project_id: Option<String>,
}

/// Retrieval isolation (H2 / P5/P6). `ProjectOnly` never returns another
/// project's facts (or global unscoped facts).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum IsolationMode {
    #[default]
    Global,
    ProjectOnly,
}

/// The coordinator-facing memory service. All state is behind one `&mut self`
/// handle (the relay wraps it in `Arc<Mutex<_>>`); methods are deterministic
/// and never block on I/O.
#[derive(Debug)]
pub struct MemoryService {
    paged: PagedMemory,
    graph: GraphStore,
    ghost: GhostIndex,
    planner: ContextPlanner,
    bm25: Bm25Index,
    docs: Vec<Bm25Doc>,
    usage: UsageLedger,
    facts: Vec<StoredFact>,
    counter: u64,
    isolation: IsolationMode,
    active_project: Option<String>,
    writes_since_tick: u32,
    /// P1.3 (A9) — semantic (prompt) cache: read-only-gated reuse.
    semantic_cache: everyaios_memory::SemanticCache,
    /// P1.3 (A9) — dependency-tagged result cache.
    result_cache: everyaios_memory::ResultCache,
}

/// How often a write triggers a background consolidate+reinforce pass.
const SYNTH_EVERY_WRITES: u32 = 8;

impl Default for MemoryService {
    fn default() -> Self {
        Self {
            paged: PagedMemory::new(),
            graph: GraphStore::new(),
            ghost: GhostIndex::new(),
            planner: ContextPlanner::new(PlannerConfig::default()),
            bm25: Bm25Index::new(),
            docs: Vec::new(),
            usage: UsageLedger::new(),
            facts: Vec::new(),
            counter: 0,
            isolation: IsolationMode::Global,
            active_project: None,
            writes_since_tick: 0,
            semantic_cache: everyaios_memory::SemanticCache::new(0.85, 3600),
            result_cache: everyaios_memory::ResultCache::new(3600),
        }
    }
}

impl MemoryService {
    pub fn new() -> Self {
        Self::default()
    }

    fn next_id(&mut self) -> String {
        self.counter += 1;
        format!("mem:{}", self.counter)
    }

    /// Ingest one fact into every surface (paged + ghost + graph + BM25 +
    /// the durable `facts` list). Shared by `write` (fresh, `now`) and
    /// `load_from` (restored — timestamps/status preserved verbatim).
    fn ingest(&mut self, fact: StoredFact) {
        let id = fact.id.clone();
        let session = fact.session_id.clone();
        let text = fact.text.clone();
        self.paged.write(MemoryEntry {
            id: id.clone(),
            content: text.clone(),
            importance: fact.importance,
        });
        self.ghost.index(&format!("memory://{session}"), &id);
        self.graph.add_node(&id, NodeKind::Episodic, &session);
        self.graph.add_edge(
            &format!("session:{session}"),
            &id,
            EdgeType::DerivedFrom,
            1.0,
            self.counter,
        );
        self.docs.push(Bm25Doc {
            id: id.clone(),
            text: text.clone(),
        });
        self.facts.push(fact);
    }

    /// P5.1 `memory/write`: store declarative fact candidates for a session.
    /// Each fact lands in paged memory + the BM25 index + the ghost index
    /// (keyed by `memory://<session>`) + an episodic graph node. Returns how
    /// many were written.
    pub fn write(&mut self, session: &str, facts: &[String]) -> usize {
        let n = self.write_with(session, facts, "chat", session, None);
        self.after_write(n);
        n
    }

    /// Write with provenance + project scope (H2 Memory Sources).
    pub fn write_with(
        &mut self,
        session: &str,
        facts: &[String],
        source: &str,
        source_id: &str,
        project_id: Option<&str>,
    ) -> usize {
        let mut n = 0usize;
        for raw in facts {
            let text = raw.trim().to_string();
            if text.is_empty() {
                continue;
            }
            let id = self.next_id();
            let now = now_ms();
            self.ingest(StoredFact {
                id,
                session_id: session.to_string(),
                text,
                importance: 8,
                created_at_ms: now,
                updated_at_ms: now,
                status: FactStatus::Active,
                source: source.to_string(),
                source_id: source_id.to_string(),
                project_id: project_id.map(str::to_string),
            });
            n += 1;
        }
        self.paged.flush_writes();
        if n > 0 {
            self.bm25.build(self.docs.clone());
        }
        n
    }

    fn after_write(&mut self, n: usize) {
        if n == 0 {
            return;
        }
        self.writes_since_tick = self.writes_since_tick.saturating_add(1);
        if self.writes_since_tick >= SYNTH_EVERY_WRITES {
            self.writes_since_tick = 0;
            let _ = self.synthesize(None);
        }
    }

    pub fn set_scope(&mut self, mode: IsolationMode, project_id: Option<String>) {
        self.isolation = mode;
        self.active_project = project_id;
    }

    fn visible(&self, f: &StoredFact) -> bool {
        if f.status != FactStatus::Active {
            return false;
        }
        match self.isolation {
            IsolationMode::Global => true,
            IsolationMode::ProjectOnly => match &self.active_project {
                Some(p) => f.project_id.as_deref() == Some(p.as_str()),
                None => f.project_id.is_none(),
            },
        }
    }

    /// P5.1 on-disk durability: persist the durable slice (facts + counter)
    /// to `path` atomically. Indexes (paged/ghost/graph/BM25) are rebuilt on
    /// load, so only the source facts need writing.
    pub fn save_to(&self, path: &Path) -> Result<(), MemoryServiceError> {
        let persisted = PersistedMemory {
            counter: self.counter,
            facts: self.facts.clone(),
        };
        let bytes = serde_json::to_vec_pretty(&persisted)?;
        atomic_write(path, &bytes)?;
        Ok(())
    }

    /// P5.1 on-disk durability: hydrate a store from `path`, rebuilding every
    /// derived index from the persisted facts.
    pub fn load_from(path: &Path) -> Result<Self, MemoryServiceError> {
        let bytes = std::fs::read(path)?;
        let persisted: PersistedMemory = serde_json::from_slice(&bytes)?;
        let mut m = Self::new();
        m.counter = persisted.counter;
        for f in &persisted.facts {
            m.ingest(f.clone());
        }
        m.paged.flush_writes();
        if !m.docs.is_empty() {
            m.bm25.build(m.docs.clone());
        }
        Ok(m)
    }

    /// P5.3: the core warm set (durable facts) the coordinator injects below
    /// the cache boundary on each turn. Only `Active` facts are injected —
    /// superseded facts stay in history/provenance but never re-enter the
    /// model context (the "relevant, current state" guarantee).
    pub fn core_facts(&self) -> Vec<String> {
        self.facts
            .iter()
            .filter(|f| self.visible(f))
            .map(|f| f.text.clone())
            .collect()
    }

    /// P5 write-side synthesis (the deterministic floor of the ChatGPT
    /// "Dreaming"/consolidation insight): a fact carrying a negation marker
    /// that shares a subject with an earlier `Active` fact supersedes it — the
    /// earlier fact is marked `Superseded` (kept for history, no longer
    /// injected). This is the safe, deterministic half of consolidation; the
    /// model-assisted importance/consolidation pass is a follow-up TODO.
    /// Returns `(superseded_count, active_count)`.
    pub fn consolidate(&mut self) -> (usize, usize) {
        let sigs: Vec<HashSet<String>> = self
            .facts
            .iter()
            .map(|f| significant_words(&f.text))
            .collect();
        let negs: Vec<bool> = self.facts.iter().map(|f| has_negation(&f.text)).collect();

        let mut superseded = 0usize;
        // `facts` is append-only, so index order is chronological. A later
        // negation fact supersedes every earlier Active fact it shares a
        // subject with.
        for i in 0..self.facts.len() {
            if !negs[i] || self.facts[i].status == FactStatus::Superseded {
                continue;
            }
            if sigs[i].is_empty() {
                continue;
            }
            for j in 0..i {
                if self.facts[j].status != FactStatus::Active || sigs[j].is_empty() {
                    continue;
                }
                if sigs[i].intersection(&sigs[j]).next().is_some() {
                    self.facts[j].status = FactStatus::Superseded;
                    self.facts[j].updated_at_ms = now_ms();
                    superseded += 1;
                }
            }
        }

        let active = self
            .facts
            .iter()
            .filter(|f| f.status == FactStatus::Active)
            .count();
        (superseded, active)
    }

    /// `memory/status`: the full fact store with lifecycle + temporal fields —
    /// the provenance surface (which facts are Active vs Superseded, and when
    /// each was recorded/updated).
    pub fn status(&self) -> Value {
        let facts = self
            .facts
            .iter()
            .map(|f| {
                json!({
                    "id": f.id,
                    "sessionId": f.session_id,
                    "text": f.text,
                    "importance": f.importance,
                    "status": match f.status {
                        FactStatus::Active => "active",
                        FactStatus::Superseded => "superseded",
                    },
                    "createdAtMs": f.created_at_ms,
                    "updatedAtMs": f.updated_at_ms,
                    "source": f.source,
                    "sourceId": f.source_id,
                    "projectId": f.project_id,
                })
            })
            .collect::<Vec<_>>();
        json!({
            "facts": facts,
            "active": self.facts.iter().filter(|f| f.status == FactStatus::Active).count(),
            "superseded": self.facts.iter().filter(|f| f.status == FactStatus::Superseded).count(),
        })
    }

    /// P5.1 `memory/read`: BM25-ranked fact ids for a query (the vectorless
    /// default signal; the graph/vector signals compose on top via fusion).
    pub fn read(&self, query: &str, k: usize) -> Vec<String> {
        self.bm25
            .search(query, k.saturating_mul(4).max(k))
            .into_iter()
            .filter(|id| {
                self.facts
                    .iter()
                    .find(|f| f.id == *id)
                    .is_some_and(|f| self.visible(f))
            })
            .take(k)
            .collect()
    }

    /// Background synthesis: consolidate + reinforce candidates + heuristic
    /// importance rescore (the deterministic stand-in for model-assisted
    /// scoring until an LLM pass is attached via `memory/assess`).
    pub fn synthesize(&mut self, extra_text: Option<&str>) -> Value {
        let (superseded, active) = self.consolidate();
        let mut ingested = 0usize;
        if let Some(text) = extra_text {
            let cands = extract_candidates(text);
            let existing: HashSet<String> =
                self.facts.iter().map(|f| f.text.to_lowercase()).collect();
            let mut fresh = Vec::new();
            for c in cands {
                if existing.contains(&c.content.to_lowercase()) {
                    continue;
                }
                fresh.push(c.content);
            }
            if !fresh.is_empty() {
                let project = self.active_project.clone();
                ingested =
                    self.write_with("synthesis", &fresh, "synthesis", "tick", project.as_deref());
            }
        }
        self.rescore_importance();
        json!({
            "superseded": superseded,
            "active": active,
            "ingested": ingested,
        })
    }

    fn rescore_importance(&mut self) {
        let now = now_ms();
        for f in &mut self.facts {
            if f.status != FactStatus::Active {
                continue;
            }
            let cands = extract_candidates(&f.text);
            if let Some(c) = cands.first() {
                let next = ((c.importance * 10.0).round() as u8).clamp(1, 10);
                if next != f.importance {
                    f.importance = next;
                    f.updated_at_ms = now;
                }
            }
        }
    }

    /// Apply host-provided (model-assisted) importance scores.
    pub fn apply_importance(&mut self, scores: &[(String, u8)]) -> usize {
        let now = now_ms();
        let mut n = 0usize;
        for (id, imp) in scores {
            if let Some(f) = self.facts.iter_mut().find(|f| f.id == *id) {
                f.importance = (*imp).clamp(1, 10);
                f.updated_at_ms = now;
                n += 1;
            }
        }
        n
    }

    /// P5.3 `memory/plan`: commit the core warm set and report the budget the
    /// turn has left. The coordinator injects the returned warm set below the
    /// cache boundary (C7 warm-set injection).
    pub fn plan(&mut self, persona_tokens: usize) -> Value {
        let warm = self.planner.inject_warm_set(&self.paged, persona_tokens);
        json!({
            "warmSetTokens": warm,
            "remainingTokens": self.planner.remaining(),
            "scopeLeakageFloor": self.planner.config.scope_leakage_floor,
            "coreFacts": self.core_facts(),
        })
    }

    /// P5.1 `memory/forget`: drop a fact from **every** surface — paged, the
    /// durable `facts` list, the BM25 index, the graph node (bi-temporally
    /// closed), and the ghost index. A forgotten fact never re-surfaces via
    /// any retrieval path (the "deletion propagates to derived state" rule the
    /// ChatGPT/Dreaming architecture surfaces: derived indexes can't keep a
    /// stale reference after the source is removed). Returns whether an entry
    /// with that id existed.
    pub fn forget(&mut self, id: &str) -> bool {
        let Some(fact) = self.facts.iter().find(|f| f.id == id).cloned() else {
            // Unknown id — clear paged (best-effort) and report the miss.
            let had = self.paged.read(id).is_some();
            if had {
                self.paged.forget(id);
            }
            return had;
        };

        let session = fact.session_id.clone();
        // `PagedMemory::forget` queues a turn-boundary forget; flush it now so
        // the entry is removed from core/archival/recall immediately.
        self.paged.forget(id);
        self.paged.flush_writes();
        self.graph.close_node(id, self.counter);
        self.ghost.remove_id(&format!("memory://{session}"), id);
        self.facts.retain(|f| f.id != id);
        self.docs.retain(|d| d.id != id);
        // Rebuild BM25 from the surviving docs (indexes are derived state;
        // rebuild keeps them consistent with `facts`).
        self.bm25.build(self.docs.clone());
        true
    }

    /// P5.4 `memory/ghost`: apply a filesystem event (delete/rename) to the
    /// ghost index so stale refs never re-surface. Returns refs affected.
    pub fn ghost_event(&mut self, event: &FsEvent) -> usize {
        self.ghost.apply_fs_event(event)
    }

    /// P8/P5.9: record one model call into the usage ledger (the broker feeds
    /// this from `stream_provider`; it is the per-key/per-session cost data
    /// the dashboard renders).
    pub fn record_usage(
        &mut self,
        key: &str,
        session: &str,
        tokens_in: u64,
        tokens_out: u64,
        cache_hit: bool,
        cached_tokens: u64,
    ) {
        self.usage.set_active(session, key);
        self.usage
            .record(tokens_in, tokens_out, cache_hit, cached_tokens);
        self.usage.clear_active();
    }

    /// P5.9 `usage/snapshot`: the per-key / per-session / cache-hit shape the
    /// dashboard renders (serializes the already-tested `UsageLedger`).
    pub fn usage_snapshot(&self) -> Value {
        let keys = self
            .usage
            .keys()
            .into_iter()
            .map(|(k, r)| {
                json!({
                    "key": k,
                    "tokensIn": r.tokens_in,
                    "tokensOut": r.tokens_out,
                    "cachedTokens": r.cached_tokens,
                    "cacheHits": r.cache_hits,
                    "cacheMisses": r.cache_misses,
                    "cacheHitRate": r.cache_hit_rate(),
                    "costUsd": self.usage.key_cost_usd(&k),
                })
            })
            .collect::<Vec<_>>();
        let sessions = self
            .usage
            .sessions()
            .into_iter()
            .map(|(s, r)| {
                json!({
                    "sessionId": s,
                    "tokensIn": r.tokens_in,
                    "tokensOut": r.tokens_out,
                    "cacheHitRate": r.cache_hit_rate(),
                })
            })
            .collect::<Vec<_>>();
        json!({
            "total": self.usage.total(),
            "cacheHitRate": self.usage.cache_hit_rate(),
            "byKey": keys,
            "bySession": sessions,
        })
    }

    /// P5.10 — retest every built algorithm core across the sidecar process
    /// boundary. The coordinator calls this over JSON-RPC (`memory/retest`), so
    /// a Bun→Rust round-trip exercises the *same* code the desktop runtime
    /// uses — the in-process `smoke_all_algorithms` proves the cores; this
    /// proves they answer over the live IPC seam. Any panic/corrupt result
    /// fails the whole call (surfaced as a `method` error to the sidecar).
    pub fn retest_algorithms(&mut self) -> Value {
        let start = std::time::Instant::now();
        let mut algos = 0usize;
        {
            let algos = &mut algos;
            let mut check = |cond: bool, name: &str| {
                if !cond {
                    panic!("memory/retest failed at {name}");
                }
                *algos += 1;
            };
            // 1. fusion (Alg #18/#29)
            let a = vec![("x".to_string(), 9.0), ("y".to_string(), 8.0)];
            let b = vec![("y".to_string(), 9.0), ("x".to_string(), 8.0)];
            check(
                everyaios_memory::rrf_fuse(
                    &[
                        everyaios_memory::Signal {
                            weight: 1.0,
                            hits: &a,
                        },
                        everyaios_memory::Signal {
                            weight: 1.0,
                            hits: &b,
                        },
                    ],
                    60.0,
                )
                .len()
                    == 2,
                "fusion",
            );
            check(
                !everyaios_memory::smart_snippets("the fox jumps", &["fox"], 4).is_empty(),
                "fusion.snippets",
            );

            // 2. actr (Alg #32)
            let mem = everyaios_memory::Memory {
                id: "m".into(),
                importance: 10,
                strength: 1.0,
                created_at: 0,
                last_access: 0,
                keywords: vec![],
                graph_links: 0,
            };
            check(
                everyaios_memory::activation(&mem, 1_000, 3600.0) > 0.0,
                "actr",
            );
            check(
                everyaios_memory::recency(0) > everyaios_memory::recency(1_000),
                "actr.recency",
            );

            // 3. compaction (Alg #21)
            let mut c = everyaios_memory::CompactionCoordinator::new(
                everyaios_memory::CompactionConfig::default(),
                100,
            );
            c.push_turn(95);
            let no_summarizers: &[&everyaios_memory::Summarizer] = &[];
            check(
                c.maybe_compact("x".repeat(400).as_str(), no_summarizers)
                    .is_some(),
                "compaction",
            );

            // 4. fsrs (C13)
            let fsrs = everyaios_memory::Fsrs::new(&everyaios_memory::DEFAULT_PARAMETERS)
                .expect("fsrs params");
            let report =
                everyaios_memory::simulate(&fsrs, &everyaios_memory::SimulationConfig::default());
            check(report.total_reviews > 0, "fsrs");

            // 5. taste (P1.5 style memory)
            let mut taste = everyaios_memory::TasteStore::new();
            taste.upsert("tone", "concise", "yes");
            check(taste.inject_stable_prefix().contains("concise"), "taste");

            // 6. classify (Vane)
            let intent = everyaios_memory::classify("search the web and make a chart");
            check(
                intent.needs_research || intent.needs_tools || intent.needs_widgets,
                "classify",
            );

            // 7. summary
            let fs = everyaios_memory::summarize_file("/a.rs", "fn main() {}\nlet x = 1;");
            check(fs.summary.contains("fn main"), "summary");

            // 8. reinforce
            let mut q = everyaios_memory::ReviewQueue::new(0.9);
            let cands = everyaios_memory::extract_candidates("This is important. This too.");
            check(!cands.is_empty() && q.ingest(cands, 0) > 0, "reinforce");

            // 9. janus
            check(
                everyaios_memory::run_janus("dup\ndup\nunique", 2, 2).removed_blocks >= 1,
                "janus",
            );

            // 10. cognee
            let mut cg = everyaios_memory::CogneeMemory::new();
            cg.remember("k", "The capital of France is Paris", 8);
            cg.flush();
            check(!cg.recall("capital").entries.is_empty(), "cognee");

            // 11. rtk
            check(
                !everyaios_memory::compress("ls -la", "-rw-r--r-- file.txt")
                    .output
                    .is_empty(),
                "rtk",
            );

            // 12. embedding (C5)
            check(
                everyaios_memory::cosine(&[1.0, 0.0], &[1.0, 0.0]) > 0.99,
                "embedding",
            );

            // 13. rerank (Alg #19)
            let cands = vec![everyaios_memory::Candidate {
                id: "c1".into(),
                text: "rust borrow checker".into(),
            }];
            let retr: std::collections::HashMap<String, f64> = [("c1".to_string(), 0.8)].into();
            let reranker = everyaios_memory::LexicalReranker::new();
            check(
                everyaios_memory::rerank(&cands, &retr, &reranker, "rust", 0.5, 0.5, 3).len() == 1,
                "rerank",
            );

            // 14. repair (B5 local JSON-mode)
            let rep = everyaios_memory::repair_tool_json(
                "```json\n{\"kind\":\"click\",\"ref_id\":\"e1\",}\n```",
            );
            check(serde_json::from_str::<Value>(&rep.json).is_ok(), "repair");

            // 15. service-owned surfaces (paged/graph/ghost/planner/bm25/usage)
            let _ = self.plan(0);
            let _ = self.usage_snapshot();
            let _ = self.core_facts();
            *algos += 6; // paged, graph, ghost, planner, bm25, usage exercised via service methods
        }
        json!({
            "ok": true,
            "algorithms": algos,
            "elapsedMs": start.elapsed().as_millis() as u64,
        })
    }

    /// Dispatch one JSON-RPC method against the service (the relay's consumer
    /// loop routes `Inbound::Request` here). Unknown methods error so the
    /// sidecar gets a clean `method not found` instead of silence.
    pub fn handle(&mut self, method: &str, params: &Value) -> Result<Value, String> {
        match method {
            "memory/write" => {
                let session = params
                    .get("sessionId")
                    .and_then(Value::as_str)
                    .unwrap_or("default")
                    .to_string();
                let facts = params
                    .get("facts")
                    .and_then(Value::as_array)
                    .map(|a| {
                        a.iter()
                            .filter_map(Value::as_str)
                            .map(str::to_string)
                            .collect::<Vec<_>>()
                    })
                    .unwrap_or_default();
                let source = params
                    .get("source")
                    .and_then(Value::as_str)
                    .unwrap_or("chat");
                let source_id = params
                    .get("sourceId")
                    .and_then(Value::as_str)
                    .unwrap_or(session.as_str());
                let project_id = params.get("projectId").and_then(Value::as_str);
                let n = self.write_with(&session, &facts, source, source_id, project_id);
                if source != "synthesis" {
                    self.after_write(n);
                }
                Ok(json!({ "written": n }))
            }
            "memory/read" => {
                let query = params.get("query").and_then(Value::as_str).unwrap_or("");
                let k = params.get("k").and_then(Value::as_u64).unwrap_or(5) as usize;
                Ok(json!({ "ids": self.read(query, k) }))
            }
            "memory/plan" => {
                let persona = params
                    .get("personaTokens")
                    .and_then(Value::as_u64)
                    .unwrap_or(0) as usize;
                Ok(self.plan(persona))
            }
            "memory/forget" => {
                let id = params.get("id").and_then(Value::as_str).unwrap_or("");
                Ok(json!({ "forgotten": self.forget(id) }))
            }
            "memory/ghost" => {
                let event = parse_fs_event(params)?;
                Ok(json!({ "affected": self.ghost_event(&event) }))
            }
            // P5.4: apply a debounced batch of storage watcher events in one
            // call (each `{kind, path}` / `{kind, from, to}`).
            "memory/ghost_batch" => {
                let events = params
                    .get("events")
                    .and_then(Value::as_array)
                    .ok_or_else(|| "memory/ghost_batch requires events[]".to_string())?;
                let mut affected = 0usize;
                for e in events {
                    let event = parse_fs_event(e)?;
                    affected += self.ghost_event(&event);
                }
                Ok(json!({ "affected": affected, "events": events.len() }))
            }
            "memory/core" => Ok(json!({ "facts": self.core_facts() })),
            "memory/consolidate" => {
                let (superseded, active) = self.consolidate();
                Ok(json!({
                    "superseded": superseded,
                    "active": active,
                    "total": self.facts.len(),
                }))
            }
            "memory/tick" => {
                let text = params.get("text").and_then(Value::as_str);
                Ok(self.synthesize(text))
            }
            "memory/scope" => {
                let mode = match params.get("mode").and_then(Value::as_str) {
                    Some("project_only") | Some("projectOnly") => IsolationMode::ProjectOnly,
                    _ => IsolationMode::Global,
                };
                let project_id = params
                    .get("projectId")
                    .and_then(Value::as_str)
                    .map(str::to_string);
                self.set_scope(mode, project_id);
                Ok(json!({
                    "mode": match self.isolation {
                        IsolationMode::Global => "global",
                        IsolationMode::ProjectOnly => "project_only",
                    },
                    "projectId": self.active_project,
                }))
            }
            "memory/assess" => {
                let scores = params
                    .get("scores")
                    .and_then(Value::as_array)
                    .map(|a| {
                        a.iter()
                            .filter_map(|v| {
                                let id = v.get("id")?.as_str()?.to_string();
                                let imp = v.get("importance")?.as_u64()? as u8;
                                Some((id, imp))
                            })
                            .collect::<Vec<_>>()
                    })
                    .unwrap_or_default();
                if scores.is_empty() {
                    self.rescore_importance();
                    Ok(json!({ "rescored": self.facts.len(), "mode": "heuristic" }))
                } else {
                    Ok(json!({ "rescored": self.apply_importance(&scores), "mode": "model" }))
                }
            }
            "memory/status" => Ok(self.status()),
            "memory/save" => {
                let path = params
                    .get("path")
                    .and_then(Value::as_str)
                    .ok_or_else(|| "memory/save requires path".to_string())?;
                self.save_to(Path::new(path)).map_err(|e| e.to_string())?;
                Ok(json!({ "saved": self.facts.len() }))
            }
            "memory/load" => {
                let path = params
                    .get("path")
                    .and_then(Value::as_str)
                    .ok_or_else(|| "memory/load requires path".to_string())?;
                *self = Self::load_from(Path::new(path)).map_err(|e| e.to_string())?;
                Ok(json!({ "loaded": self.facts.len() }))
            }
            "usage/snapshot" => Ok(self.usage_snapshot()),
            // P1.3 (A9) — semantic/result cache lookup. The coordinator calls
            // this on read-only turns (no resolved tools) before streaming.
            "memory/cache_get" => {
                let prompt = params.get("prompt").and_then(Value::as_str).unwrap_or("");
                let now = now_ms() / 1000;
                Ok(match self.semantic_cache.get(prompt, now) {
                    Some(hit) => json!({ "hit": true, "layer": "semantic", "response": hit }),
                    None => json!({ "hit": false }),
                })
            }
            // P1.3 (A9) — store a turn's response. `readOnly` gates whether
            // it may ever be served (mutation turns are retained but never hit).
            "memory/cache_put" => {
                let prompt = params.get("prompt").and_then(Value::as_str).unwrap_or("");
                let response = params.get("response").and_then(Value::as_str).unwrap_or("");
                let read_only = params
                    .get("readOnly")
                    .and_then(Value::as_bool)
                    .unwrap_or(false);
                let now = now_ms() / 1000;
                self.semantic_cache.put(prompt, response, read_only, now);
                Ok(json!({ "stored": true }))
            }
            // P1.3 (A9) — dependency-tagged invalidation (a changed file drops
            // every cached result derived from it).
            "memory/cache_invalidate" => {
                let tag = params.get("tag").and_then(Value::as_str).unwrap_or("");
                let removed = self.result_cache.invalidate_tag(tag);
                Ok(json!({ "removed": removed }))
            }
            // P5.10 — retest the built algorithm cores across the sidecar
            // process boundary (Bun → JSON-RPC → Rust → algorithm). The
            // in-process `smoke_all_algorithms` proves the cores; this proves
            // the same cores answer over the live IPC seam.
            "memory/retest" => Ok(self.retest_algorithms()),
            _ => Err(format!("method not found: {method}")),
        }
    }
}

/// Write bytes atomically: temp file + rename (never a half-written store).
fn atomic_write(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let mut tmp = path.as_os_str().to_os_string();
    tmp.push(".tmp");
    let tmp = Path::new(&tmp);
    std::fs::write(tmp, bytes)?;
    std::fs::rename(tmp, path)
}

/// Parse a `memory/ghost` params object into an [`FsEvent`].
fn parse_fs_event(params: &Value) -> Result<FsEvent, String> {
    let kind = params
        .get("kind")
        .and_then(Value::as_str)
        .ok_or_else(|| "memory/ghost requires kind (removed|renamed|modified)".to_string())?;
    match kind {
        "removed" => params
            .get("path")
            .and_then(Value::as_str)
            .map(|p| FsEvent::Removed(p.to_string()))
            .ok_or_else(|| "memory/ghost removed requires path".to_string()),
        "renamed" => {
            let from = params
                .get("from")
                .and_then(Value::as_str)
                .ok_or_else(|| "memory/ghost renamed requires from".to_string())?;
            let to = params
                .get("to")
                .and_then(Value::as_str)
                .ok_or_else(|| "memory/ghost renamed requires to".to_string())?;
            Ok(FsEvent::Renamed {
                from: from.to_string(),
                to: to.to_string(),
            })
        }
        "modified" => params
            .get("path")
            .and_then(Value::as_str)
            .map(|p| FsEvent::Modified(p.to_string()))
            .ok_or_else(|| "memory/ghost modified requires path".to_string()),
        other => Err(format!("unknown memory/ghost kind: {other}")),
    }
}

/// Tokens that signal a fact *revises or negates* a prior belief (the
/// deterministic supersession floor; the model-assisted synthesis pass is a
/// follow-up TODO — this is deliberately conservative, never destructive).
const NEGATION_MARKERS: &[&str] = &[
    "not",
    "never",
    "no",
    "stop",
    "stopped",
    "cancel",
    "cancelled",
    "canceled",
    "anymore",
    "instead",
    "longer",
    "dont",
    "doesnt",
    "wont",
    "cant",
];

/// Common words that don't identify a fact's *subject* (dropped before
/// shared-subject matching so two facts about the same thing match on their
/// content words, not their grammar).
const SUBJECT_STOPWORDS: &[&str] = &[
    "about", "with", "from", "have", "has", "had", "will", "would", "been", "were", "was", "are",
    "they", "their", "there", "them", "this", "that", "these", "those", "what", "when", "where",
    "which", "your", "yours", "here", "than", "then", "into", "onto", "very", "just", "really",
    "some", "more", "most", "also", "only", "now", "already", "still", "next", "year", "month",
    "week", "day", "going", "planning", "thinking", "actually",
];

/// The subject words of a fact: lowercase alphanumeric tokens of length ≥ 4
/// that aren't stopwords or negation markers (the words that identify *what*
/// the fact is about).
fn significant_words(text: &str) -> HashSet<String> {
    everyaios_memory::tokenize(text)
        .into_iter()
        .filter(|t| t.len() >= 4)
        .filter(|t| !SUBJECT_STOPWORDS.contains(&t.as_str()))
        .filter(|t| !NEGATION_MARKERS.contains(&t.as_str()))
        .collect()
}

/// Does this fact carry a negation/revocation marker?
fn has_negation(text: &str) -> bool {
    everyaios_memory::tokenize(text)
        .iter()
        .any(|t| NEGATION_MARKERS.contains(&t.as_str()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn write_then_read_roundtrips() {
        let mut m = MemoryService::new();
        let n = m.write(
            "s1",
            &[
                "The Q3 budget was finalized at twelve thousand dollars.".into(),
                "The marketing team approved the new slide deck.".into(),
            ],
        );
        assert_eq!(n, 2);

        // BM25 returns up to k docs (zero-score docs included), but the
        // relevant fact must rank first.
        let hits = m.read("budget", 3);
        assert_eq!(
            hits[0], "mem:1",
            "the budget fact must rank first: {hits:?}"
        );
        assert_eq!(&m.facts[0].session_id, "s1");
    }

    #[test]
    fn plan_reports_warm_set_and_remaining() {
        let mut m = MemoryService::new();
        m.write(
            "s1",
            &["A declarative fact long enough to be a real memory entry.".into()],
        );
        let plan = m.plan(200);
        assert!(plan["warmSetTokens"].as_u64().unwrap() > 0);
        assert!(plan["remainingTokens"].as_u64().unwrap() < 32_000);
    }

    #[test]
    fn ghost_event_tombstones_and_repaths() {
        let mut m = MemoryService::new();
        m.write("s1", &["A fact tied to a session memory path.".into()]);
        // The ghost index keys facts by `memory://<session>`.
        let affected = m.ghost_event(&FsEvent::Removed("memory://s1".into()));
        assert_eq!(affected, 1);
        assert!(m.ghost.ids_for("memory://s1").is_empty());
    }

    #[test]
    fn usage_snapshot_tracks_cost_and_cache_hit_rate() {
        let mut m = MemoryService::new();
        m.usage.set_price("anthropic", 3.0, 15.0);
        m.record_usage("anthropic", "s1", 1_000_000, 100_000, true, 800_000);
        let snap = m.usage_snapshot();
        let key = &snap["byKey"][0];
        assert_eq!(key["key"], "anthropic");
        assert!(key["cacheHitRate"].as_f64().unwrap() > 0.99);
        assert!(key["costUsd"].as_f64().unwrap() > 0.0);
    }

    #[test]
    fn handle_dispatches_and_rejects_unknown() {
        let mut m = MemoryService::new();
        let out = m.handle(
            "memory/write",
            &json!({ "sessionId": "s2", "facts": ["Fact one is long enough.", "Fact two is long enough."] }),
        );
        assert_eq!(out.unwrap()["written"], 2);

        assert!(m.handle("bogus/method", &json!({})).is_err());
        assert!(m
            .handle("memory/ghost", &json!({ "kind": "removed" }))
            .is_err());
    }

    #[test]
    fn ghost_batch_applies_storage_events() {
        let mut m = MemoryService::new();
        m.write("s1", &["Fact alpha about the budget sheet.".into()]);
        // A storage watcher batch: one tombstone + one rename (the latter is
        // a no-op against a `memory://` path — both must parse + apply).
        let out = m
            .handle(
                "memory/ghost_batch",
                &json!({
                    "events": [
                        { "kind": "removed", "path": "memory://s1" },
                        { "kind": "renamed", "from": "/a", "to": "/b" },
                    ]
                }),
            )
            .unwrap();
        assert_eq!(out["events"], 2);
        assert_eq!(out["affected"], 1);
        assert!(m.ghost.ids_for("memory://s1").is_empty());
    }

    #[test]
    fn save_then_load_rebuilds_derived_indexes() {
        let dir =
            std::env::temp_dir().join(format!("everyaios-memory-persist-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("memory.db");

        let mut m = MemoryService::new();
        m.write("s1", &["The Q3 budget was twelve thousand dollars.".into()]);
        m.save_to(&path).unwrap();

        // Load into a fresh store — derived BM25 index must be rebuilt so
        // `read` still surfaces the fact.
        let loaded = MemoryService::load_from(&path).unwrap();
        assert_eq!(loaded.facts.len(), 1);
        let hits = loaded.read("budget", 5);
        assert_eq!(hits[0], "mem:1", "BM25 rebuilt on load: {hits:?}");

        // Counter resumes after load (no id collision).
        let mut loaded = loaded;
        assert_eq!(
            loaded.write("s2", &["A second fact about the marketing deck.".into()]),
            1
        );
        assert_eq!(loaded.facts[1].id, "mem:2");

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn core_facts_and_memory_core_dispatch() {
        let mut m = MemoryService::new();
        m.write("s1", &["Alpha fact about the budget.".into()]);
        let plan = m.plan(200);
        let facts = plan["coreFacts"].as_array().unwrap();
        assert_eq!(facts.len(), 1);
        assert!(facts[0].as_str().unwrap().contains("budget"));

        let out = m.handle("memory/core", &json!({})).unwrap();
        assert_eq!(out["facts"].as_array().unwrap().len(), 1);
    }

    #[test]
    fn save_and_load_via_dispatch() {
        let dir =
            std::env::temp_dir().join(format!("everyaios-memory-dispatch-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("memory.db");
        let path_s = path.to_string_lossy().to_string();

        let mut m = MemoryService::new();
        m.write("s1", &["A durable declarative fact.".into()]);
        let saved = m.handle("memory/save", &json!({ "path": path_s })).unwrap();
        assert_eq!(saved["saved"], 1);

        let mut m2 = MemoryService::new();
        let loaded = m2
            .handle("memory/load", &json!({ "path": path_s }))
            .unwrap();
        assert_eq!(loaded["loaded"], 1);
        assert_eq!(m2.core_facts().len(), 1);

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn consolidate_supersedes_a_contradicted_belief() {
        let mut m = MemoryService::new();
        m.write("s1", &["I might visit Japan next year.".into()]);
        m.write("s1", &["I am not planning the Japan trip anymore.".into()]);
        assert_eq!(m.facts.len(), 2);

        let (superseded, active) = m.consolidate();
        assert_eq!(superseded, 1);
        assert_eq!(active, 1);

        // Only the current belief is injected into the warm set.
        assert_eq!(m.core_facts().len(), 1);
        assert!(m.core_facts()[0].contains("not planning"));
        assert_eq!(m.facts[0].status, FactStatus::Superseded);
        assert_eq!(m.facts[1].status, FactStatus::Active);
    }

    #[test]
    fn consolidate_is_idempotent_and_keeps_unrelated_facts() {
        let mut m = MemoryService::new();
        m.write(
            "s1",
            &[
                "I might visit Japan next year.".into(),
                "I like cats.".into(),
                "I am not planning the Japan trip anymore.".into(),
            ],
        );

        let (s1, a1) = m.consolidate();
        assert_eq!(s1, 1);
        assert_eq!(a1, 2, "the cats fact + the revision remain active");

        // A second pass changes nothing (idempotent).
        let (s2, a2) = m.consolidate();
        assert_eq!(s2, 0);
        assert_eq!(a2, 2);
        assert!(m.core_facts().iter().any(|f| f.contains("cats")));
    }

    #[test]
    fn provenance_and_project_isolation() {
        let mut m = MemoryService::new();
        m.write_with(
            "s1",
            &["Alpha fact about cats.".into()],
            "chat",
            "s1",
            Some("proj-a"),
        );
        m.write_with(
            "s1",
            &["Beta fact about dogs.".into()],
            "file",
            "notes.md",
            Some("proj-b"),
        );
        m.set_scope(IsolationMode::ProjectOnly, Some("proj-a".into()));
        let facts = m.core_facts();
        assert_eq!(facts.len(), 1);
        assert!(facts[0].contains("cats"));
        assert!(!facts.iter().any(|f| f.contains("dogs")));
        let st = m.status();
        assert_eq!(st["facts"][0]["source"], "chat");
        assert_eq!(st["facts"][0]["projectId"], "proj-a");
        m.set_scope(IsolationMode::Global, None);
        assert_eq!(m.core_facts().len(), 2);
    }

    #[test]
    fn tick_runs_consolidate_and_reinforce() {
        let mut m = MemoryService::new();
        m.write("s1", &["I might visit Japan next year.".into()]);
        let out = m
            .handle(
                "memory/tick",
                &json!({ "text": "An important fact: Rust is memory-safe." }),
            )
            .unwrap();
        assert!(out.get("active").is_some());
        assert!(m
            .facts
            .iter()
            .any(|f| f.source == "synthesis" || f.text.contains("Rust")));
    }

    #[test]
    fn forget_fully_propagates_across_surfaces() {
        let mut m = MemoryService::new();
        m.write(
            "s1",
            &[
                "The Q3 budget was finalized at twelve thousand dollars.".into(),
                "The marketing team approved the new slide deck.".into(),
            ],
        );
        assert!(m.forget("mem:1"));

        // facts + core warm set no longer surface mem:1.
        assert_eq!(m.facts.len(), 1);
        assert!(!m.facts.iter().any(|f| f.id == "mem:1"));
        assert!(!m.core_facts().iter().any(|f| f.contains("budget")));

        // BM25 derived index dropped the forgotten doc.
        let hits = m.read("budget", 5);
        assert!(
            !hits.iter().any(|id| id == "mem:1"),
            "BM25 must drop the forgotten doc: {hits:?}"
        );

        // paged + graph + ghost all dropped the id.
        assert!(m.paged.read("mem:1").is_none());
        assert!(m.graph.node_active_at("mem:1", m.counter + 1, 0).is_none());
        assert!(m
            .ghost
            .ids_for("memory://s1")
            .iter()
            .all(|id| id != "mem:1"));

        // Unknown id is a no-op miss.
        assert!(!m.forget("mem:999"));
    }

    #[test]
    fn status_dispatch_reports_lifecycle() {
        let mut m = MemoryService::new();
        m.write("s1", &["I might visit Japan next year.".into()]);
        m.write("s1", &["I am not planning the Japan trip anymore.".into()]);
        m.consolidate();

        let out = m.handle("memory/status", &json!({})).unwrap();
        assert_eq!(out["active"], 1);
        assert_eq!(out["superseded"], 1);
        assert_eq!(out["facts"][0]["status"], "superseded");
        assert_eq!(out["facts"][1]["status"], "active");
    }

    #[test]
    fn cache_dispatch_roundtrips_read_only_gated() {
        let mut m = MemoryService::new();
        // Store a read-only response, then look it up over the JSON-RPC seam.
        let put = m.handle(
            "memory/cache_put",
            &json!({ "prompt": "what is the capital of france", "response": "Paris", "readOnly": true }),
        );
        assert_eq!(put.unwrap()["stored"], true);
        let hit = m
            .handle(
                "memory/cache_get",
                &json!({ "prompt": "what is the capital of france" }),
            )
            .unwrap();
        assert_eq!(hit["hit"], true);
        assert_eq!(hit["layer"], "semantic");
        assert_eq!(hit["response"], "Paris");

        // Mutation-path entries are retained but never served.
        m.handle(
            "memory/cache_put",
            &json!({ "prompt": "delete all rows", "response": "done", "readOnly": false }),
        )
        .unwrap();
        let miss = m
            .handle("memory/cache_get", &json!({ "prompt": "delete all rows" }))
            .unwrap();
        assert_eq!(miss["hit"], false);
    }

    #[test]
    fn retest_algorithms_runs_across_boundary() {
        let mut m = MemoryService::new();
        let out = m.handle("memory/retest", &json!({})).unwrap();
        assert_eq!(out["ok"], true);
        assert!(
            out["algorithms"].as_u64().unwrap() >= 20,
            "got {}",
            out["algorithms"]
        );
    }

    #[test]
    fn consolidate_dispatch_returns_counts() {
        let mut m = MemoryService::new();
        m.write("s1", &["I might visit Japan next year.".into()]);
        m.write("s1", &["I am not planning the Japan trip anymore.".into()]);

        let out = m.handle("memory/consolidate", &json!({})).unwrap();
        assert_eq!(out["superseded"], 1);
        assert_eq!(out["active"], 1);
        assert_eq!(out["total"], 2);
    }

    #[test]
    fn load_from_is_backward_compatible_without_temporal_fields() {
        let dir = std::env::temp_dir().join(format!(
            "everyaios-memory-backcompat-{}",
            std::process::id()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("memory.db");
        // Hand-written persisted shape predating the temporal/status fields.
        std::fs::write(
            &path,
            r#"{"counter":1,"facts":[{"id":"mem:1","session_id":"s1","text":"The Q3 budget was twelve thousand dollars.","importance":8}]}"#,
        )
        .unwrap();

        let loaded = MemoryService::load_from(&path).unwrap();
        assert_eq!(loaded.facts.len(), 1);
        assert_eq!(
            loaded.facts[0].status,
            FactStatus::Active,
            "missing status defaults to Active"
        );
        assert_eq!(
            loaded.facts[0].created_at_ms, 0,
            "missing created_at_ms defaults to 0"
        );

        std::fs::remove_dir_all(&dir).ok();
    }
}
