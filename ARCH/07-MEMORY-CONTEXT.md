# 07 — Memory & Context System

> **The user requirement, verbatim:** *"memory and context systems"* are a top priority, with token minimization. This doc merges the **built** engine (`core-memory`/`core-files`: spreading-activation 11 tests, phantom-thread 9, forgetting-to-remember 17, temporal-anticipation, knowledge-graph, conflict, correction-detector, decay — v2.0 §3) with the **2026 SOTA** (mem0 multi-signal fusion, Letta agent-managed paging, graphiti temporal KG, doc 34 §2) and the tokenmining retrieve rule (05 §5.1).

## 7.1 Five-tier model (with identity scopes)

Every memory row carries `scope(user, agent, session, project)` — **multi-scope identity** (mem0 pattern): a financial fact tagged `project:taxes` can never leak into `project:scifi-novel` (the leakage floor is structural, not prompt-level).

| Tier | Storage | Write path | Read path |
|---|---|---|---|
| Sensory | in-memory ring buffer | window/keystroke/clipboard events (permission-gated) | only when user asks / task needs |
| Working | LLM context (05 budgets) | conversation | the current window |
| Episodic | SQLite `events` table | every tool dispatch + session markers (06 §6.7) | temporal queries, "what did I do Tuesday" |
| Semantic | SQLite FTS5 + sqlite-vec + facts table | extraction pipeline (below) | multi-signal retrieval (7.3) |
| Procedural | `~/.everyaios/skills/` + workflows (Forge) | verified skill promotion | planner action list injection |

## 7.2 The seven algorithms (built, kept) — how they wire

1. **Forgetting-to-Remember (polarized retention):** `sentiment_polarity` column (−1..+1) on facts + correction-store. Normal recall filters `>= 0`; **defensive queries** ("what should I avoid?", "what went wrong before?") flip the flag and rank negatives first. Correction-detector auto-tags regressions/retries (built).
2. **Hallucination Risk Compass (risk-compass, built in core-engine):** post-generation score = retrieval-confidence × source-coverage ÷ hedging-density (length-normalized). High-risk bands → auto-flag or silent self-check loop (one cheap re-ask grounded on the retrieved blocks only).
3. **Phantom Thread (warm set):** `RwLock<Vec<Fact>>` top-5 for the current (project, session) — swapped on workspace change **with 0ms TTFT**; injection budget fixed (05 §5.1: 600 tokens). Leakage floor = scope filter at write and read.
4. **Temporal Graph Anticipation:** weekly-rhythm tracker on engagement logs → morning briefs + proactive pre-indexing ("Monday 9am: rent agreement" → open pre-warmed). Beats recency baselines >15pts (built, tested).
5. **Spreading Activation (SYNAPSE):** the Rust-native entity graph (adjacency, versioned edges; Graphiti-style temporal edges) + activation spread with per-hop decay + **lateral inhibition**; re-ranks FTS5+vector results → the agent grasps multi-hop relations vector search misses. LadybugDB is an optional/deferred backend with a compatible schema, not the canonical storage dependency.
6. **Crystallization** (05 Rule 3 / v2.0 built): workflows → deterministic loops, 0 tokens.
7. **Knowledge Graph + conflict resolution** (built): entity extraction → LLM refinement → edge writes; conflicts resolved by recency + confidence + user-pin.

## 7.3 Multi-signal retrieval (the 2026 SOTA fusion — new layer)

```
query → intent classifier (memory vs fact vs event vs document)
      → parallel signals:
          S1 FTS5/BM25 (keyword, headings 5×, trigram)
          S2 sqlite-vec (embeddings, on-device bge-micro/gte-small — built bundling)
          S3 entity graph activation (spreading activation)
          S4 temporal recency (graphiti-style edge timestamps — "last time we discussed X")
      → score fusion (weighted, mem0-style single fused score; weights learned/calibrated offline)
      → dedupe + smart snippets + budget cap (05 §5.1)
```
This is the layer mem0 showed delivering **+29.6 temporal / +23.1 multi-hop** over plain RAG (doc 34 §2) — on top of the vectorless default (FTS5-only fast path when embeddings are off).

## 7.4 Agent-managed paging (Letta pattern — for long autonomous runs)

For deep multi-hour sessions: the agent gets three memory surfaces — **core** (always in context, ≤600 tok), **archival** (Rust-native graph/SQLite, searchable; LadybugDB optional), **recall** (episodic events, queryable). The agent itself decides what to page in/out via `memory` tools (read/write/search/forget), with the context planner (05 §5.2) enforcing budgets. Memory writes are queued to **turn boundaries** to protect the prefix cache (05 §5.5).

## 7.5 Injection & integrity

- All recalled content wrapped in `<memory>`/`<user_document>` delimiters + injection scan (06 §6.5).
- Source lineage on every fact (which file/page/tool produced it, confidence, timestamp) — "why does it know this" is always answerable and deletable.
- Export (JSON/Markdown) + wipe per scope; optional E2E-encrypted sync (core-sync built) — off by default.

## 7.5.1 Ghost Context Prevention (tombstone eviction)

**Problem:** When a local file is renamed/moved/deleted, its vector chunks, FTS5 entries, and LadybugDB graph edges persist as "ghost context" — the agent retrieves non-existent code, references deleted files, or generates broken imports.

**Solution:** File-system event hooks (Rust `notify` crate) trigger **transactional tombstone writes** on rename/delete:
1. `notify` emits `Rename(old, new)` or `Remove(path)` event.
2. Memory coordinator atomically: (a) marks all FTS5 rows with `source_path = old` as tombstoned, (b) updates or removes corresponding sqlite-vec vectors, (c) removes or re-paths corresponding edges and nodes in the Rust-native graph store (LadybugDB-compatible schema; optional backend).
3. Tombstoned entries are excluded from all retrieval queries immediately; physically purged on next compaction cycle.
4. **Rename = re-path, not delete+re-index** — preserves graph edges and vector associations while updating the path reference (zero re-embedding cost).

This prevents the #1 cause of agent hallucination in file-heavy workspaces.

## 7.6 Memory module map

| Piece | Where | Status |
|---|---|---|
| 7 algos + KG + conflict + decay | `@personal-ai/core-memory` | **Built** (tested) |
| FTS5+vec hybrid + embeddings + chunking | `@personal-ai/core-files` | **Built** |
| Rust-native graph store (LadybugDB-compatible optional backend) | coordinator `memory/graph.ts` | Canonical graph surface; optional backend swap-in |
| Multi-signal fusion + paging + scopes | coordinator `memory/fusion.ts` | New (SOTA layer) |
| Warm-set + injection | coordinator + 05 budgets | New wiring |

---

## 7.7 ACT-R activation + spontaneous recall (NOOA pattern — doc 39, algorithm #32)

From `NVIDIA-NeMo/labs-OO-Agents` `nooa-memory` (source-read this pass, Apache 2.0 — pattern only, Python→TS translation):

1. **Retention decay (ACT-R-style):** `retention = f(time_since_last_access, stability)` with `stability = decay_half_life_hours × (1 + log1p(strength))` — accessed memories decay much more slowly; fully recent ≈ 1.0. Our decay (algorithm 10) gains the log-strength half-life term.
2. **Importance floor:** memories with `importance ≥ 8.0` are **never auto-forgotten** (protected type). → a hard `protect` bit in our schema.
3. **Associative recall = semantic + keyword + recency + graph** in one query (already our C3 fusion — NOOA proves the same shape).
4. **Typed relational edges:** `supports` / `contradicts` / `derived-from` on the canonical Rust-native memory graph; temporal edge versioning is backend-neutral. Contradiction edges feed our KG conflict resolution + risk compass.
5. **Spontaneous recall channel:** a pre-turn hook derives *queries from recent events* and injects matching memories as a dynamic context block — distinct from Phantom Thread (activity-aware preload of a fixed warm set). Both run: Phantom = workspace switch; spontaneous = event-driven query derivation.
6. **References re-read fresh at recall:** stored entries may point at live files/objects instead of pasted values (pass-by-reference — see 05 §5.9) — token-minimizing by construction.

**Status:** 🟡 new (algorithm #32). Wire into coordinator `memory/fusion.ts`; the Rust-native graph schema carries `relation_type` (LadybugDB remains an optional implementation backend).

---

## 7.8 Temporal Knowledge Graph Layer (Graphiti + Cognee Patterns, doc 46)

> Sources: getzep/graphiti (29.7K⭐, Apache-2.0) — temporal context graphs; topoteretes/cognee (29.9K⭐, Apache-2.0) — full-stack memory on Postgres.

### 7.8.1 Graphiti Temporal Model

Facts have **validity windows**, not just timestamps:

```
Entity: { id, name, type, properties, created_at }
Fact/Edge: { id, source, target, relation, valid_from, valid_until, confidence, episode_id }
Episode: { id, source_type, content_hash, created_at }
```

**Bi-temporal tracking:**
- **Transaction time**: when the system learned the fact
- **Valid time**: when the fact was true in the real world
- Enables queries like "what did we believe about X on date Y?" vs "what was actually true?"

**Contradiction resolution:**
- When a new fact contradicts an existing one, the old fact's `valid_until` is set
- Both facts remain in the graph (history preserved)
- Queries automatically filter by current validity unless historical view requested

**Incremental construction:**
- New episodes update the graph incrementally (no batch recomputation)
- Entity deduplication via semantic similarity + name matching
- Relationship types can be prescribed (Pydantic schemas) or learned from data

### 7.8.2 Cognee Full-Stack Pattern

Entire memory stack on a single database (Postgres or SQLite):

| Layer | Implementation |
|-------|---------------|
| Knowledge graph | Postgres with recursive CTEs (or Kuzu/Neo4j/FalkorDB optional) |
| Vector embeddings | pgvector extension (or ChromaDB/Qdrant optional) |
| Session memory | Table with session_id + TTL + fast cache layer |
| Metadata/ontology | Cognitive-science-grounded auto-generated ontology |
| Full-text search | FTS5 (SQLite) or pg_trgm (Postgres) |

**API (4 operations):**
- `remember(content, session_id?)` — ingest and index
- `recall(query, filters?)` — hybrid retrieval (graph + vector + keyword)
- `forget(entity_id | session_id | scope)` — targeted deletion
- `improve(feedback)` — refine ontology, update confidence scores

### 7.8.3 Integration with Existing 5-Tier Model

| Tier | Enhancement from doc 46 |
|------|------------------------|
| Sensory (working) | Headroom reversible compression (CCR) for live context |
| Working (session) | Context-mode FTS5+BM25 event capture (98% tool output reduction) |
| Episodic | Graphiti episodes with provenance + temporal validity |
| Semantic (KG) | Cognee auto-ontology + Graphiti temporal facts |
| Procedural | Mem0 multi-level (user/session/agent) with 92.5 LoCoMo score |

### 7.8.4 Recommended Implementation Stack

**SQLite-first (desktop, single-user):**
- sqlite-vec for embeddings
- FTS5 for keyword search
- Recursive CTEs for graph traversal
- Custom temporal tables for Graphiti-pattern facts
- Single file = portable, no server process

**Optional Postgres upgrade (power users, shared):**
- pgvector for embeddings
- pg_trgm + FTS for search
- Postgres graph queries via recursive CTEs or age extension
- Multi-user with row-level security