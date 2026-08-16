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

use everyaios_memory::{
    Bm25Doc, Bm25Index, ContextPlanner, EdgeType, FsEvent, GhostIndex, GraphStore, MemoryEntry,
    NodeKind, PagedMemory, PlannerConfig, UsageLedger,
};

/// One stored fact (the `memory/read` result shape).
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct StoredFact {
    pub id: String,
    pub session_id: String,
    pub text: String,
    pub importance: u8,
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

    /// P5.1 `memory/write`: store declarative fact candidates for a session.
    /// Each fact lands in paged memory + the BM25 index + the ghost index
    /// (keyed by `memory://<session>`) + an episodic graph node. Returns how
    /// many were written.
    pub fn write(&mut self, session: &str, facts: &[String]) -> usize {
        let mut n = 0usize;
        for raw in facts {
            let text = raw.trim();
            if text.is_empty() {
                continue;
            }
            let id = self.next_id();
            self.paged.write(MemoryEntry {
                id: id.clone(),
                content: text.to_string(),
                importance: 8,
            });
            self.ghost.index(&format!("memory://{session}"), &id);
            self.graph.add_node(&id, NodeKind::Episodic, session);
            self.graph.add_edge(
                &format!("session:{session}"),
                &id,
                EdgeType::DerivedFrom,
                1.0,
                self.counter,
            );
            self.docs.push(Bm25Doc {
                id: id.clone(),
                text: text.to_string(),
            });
            self.facts.push(StoredFact {
                id,
                session_id: session.to_string(),
                text: text.to_string(),
                importance: 8,
            });
            n += 1;
        }
        self.paged.flush_writes();
        if n > 0 {
            self.bm25.build(self.docs.clone());
        }
        n
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
        })
    }

    /// P5.1 `memory/forget`: drop a fact from paged memory. Returns whether an
    /// entry with that id existed.
    pub fn forget(&mut self, id: &str) -> bool {
        let had = self.paged.read(id).is_some();
        self.paged.forget(id);
        had
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
            "usage/snapshot" => Ok(self.usage_snapshot()),
            _ => Err(format!("method not found: {method}")),
        }
    }
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
}
