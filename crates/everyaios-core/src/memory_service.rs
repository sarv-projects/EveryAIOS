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
    Bm25Doc, Bm25Index, ContextPlanner, EdgeType, FsEvent, GhostIndex, GraphStore, MemoryEntry,
    NodeKind, PagedMemory, PlannerConfig, UsageLedger,
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
}

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
            });
            n += 1;
        }
        self.paged.flush_writes();
        if n > 0 {
            self.bm25.build(self.docs.clone());
        }
        n
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
            .filter(|f| f.status == FactStatus::Active)
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
        self.bm25.search(query, k)
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
        self.usage.record(tokens_in, tokens_out, cache_hit, cached_tokens);
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
                Ok(json!({ "written": self.write(&session, &facts) }))
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
    "not", "never", "no", "stop", "stopped", "cancel", "cancelled", "canceled", "anymore",
    "instead", "longer", "dont", "doesnt", "wont", "cant",
];

/// Common words that don't identify a fact's *subject* (dropped before
/// shared-subject matching so two facts about the same thing match on their
/// content words, not their grammar).
const SUBJECT_STOPWORDS: &[&str] = &[
    "about", "with", "from", "have", "has", "had", "will", "would", "been", "were", "was",
    "are", "they", "their", "there", "them", "this", "that", "these", "those", "what", "when",
    "where", "which", "your", "yours", "here", "than", "then", "into", "onto", "very", "just",
    "really", "some", "more", "most", "also", "only", "now", "already", "still", "next", "year",
    "month", "week", "day", "going", "planning", "thinking", "actually",
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
        assert_eq!(hits[0], "mem:1", "the budget fact must rank first: {hits:?}");
        assert_eq!(&m.facts[0].session_id, "s1");
    }

    #[test]
    fn plan_reports_warm_set_and_remaining() {
        let mut m = MemoryService::new();
        m.write("s1", &["A declarative fact long enough to be a real memory entry.".into()]);
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
        assert!(m.handle("memory/ghost", &json!({ "kind": "removed" })).is_err());
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
        let dir = std::env::temp_dir().join(format!("everyaios-memory-persist-{}", std::process::id()));
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
        assert_eq!(loaded.write("s2", &["A second fact about the marketing deck.".into()]), 1);
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
        let dir = std::env::temp_dir().join(format!("everyaios-memory-dispatch-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("memory.db");
        let path_s = path.to_string_lossy().to_string();

        let mut m = MemoryService::new();
        m.write("s1", &["A durable declarative fact.".into()]);
        let saved = m.handle("memory/save", &json!({ "path": path_s })).unwrap();
        assert_eq!(saved["saved"], 1);

        let mut m2 = MemoryService::new();
        let loaded = m2.handle("memory/load", &json!({ "path": path_s })).unwrap();
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
        assert!(!hits.iter().any(|id| id == "mem:1"), "BM25 must drop the forgotten doc: {hits:?}");

        // paged + graph + ghost all dropped the id.
        assert!(m.paged.read("mem:1").is_none());
        assert!(m.graph.node_active_at("mem:1", m.counter + 1, 0).is_none());
        assert!(m.ghost.ids_for("memory://s1").iter().all(|id| id != "mem:1"));

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
        let dir = std::env::temp_dir()
            .join(format!("everyaios-memory-backcompat-{}", std::process::id()));
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
        assert_eq!(loaded.facts[0].status, FactStatus::Active, "missing status defaults to Active");
        assert_eq!(loaded.facts[0].created_at_ms, 0, "missing created_at_ms defaults to 0");

        std::fs::remove_dir_all(&dir).ok();
    }
}
