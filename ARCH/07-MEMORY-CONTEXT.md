# 07 — Memory & Context System

> **SUPERSEDED MODEL — see [`MEMORY.md`](MEMORY.md) first.** The five-tier model is replaced by **four
> classes** (Context · Episodic · Knowledge · Procedural), and episodic memory is now a *projection of the
> event log* rather than a parallel timeline. The algorithms below (ACT-R, FSRS, spreading activation, the
> temporal knowledge graph, the seven-algorithm set) are **kept as strategies behind the memory API** — they
> must not become separate architecture layers or subsystems. **Rewritten `P69.A18` (done 2026-09-20).**

---

> **The user requirement, verbatim:** *"memory and context systems"* are a top priority, with token minimization.
> **Full-Stack Module:** Module 6 — Durable Work & Cognitive **Memory** Subsystem (`crates/everyaios-memory`; four classes, with ACT-R activation, FTS5/BM25 and the graph as strategies).
> **Ownership ([`CORE.md`](CORE.md) §4, §10):** the memory **store** (FTS5/BM25, graph, vectors, provenance, tombstones) is **shared infrastructure** owned by the memory crate. Memory **reasoning** — what to remember, retrieve, forget or promote — is EveryAIOS-owned reasoning ([`MEMORY.md`](MEMORY.md) §9), never delegated to a capability or an external agent. External agents get memory APIs, not ownership of the store; their own private memory stays theirs and is never promoted automatically (I25).

## 7.0 The contract — four classes, one memory system (from [`MEMORY.md`](MEMORY.md) / [`CORE.md`](CORE.md) §10)

| Class | Meaning | Persistence |
|---|---|---|
| **Context** | this turn only — **not** persistent memory | none |
| **Episodic** | what happened — **derived from the Work/Run/Event history**, never a parallel timeline (I3, I4) | derived |
| **Knowledge** | durable facts, entities, relationships, preferences, project facts | durable |
| **Procedural** | skills, workflows, learned procedures | durable |

Scope is hierarchical — **User → Space → Project → Session → Work** — a narrower scope filters, promotion is explicit, a project fact never silently becomes global. **Agent-private memory sits beside the hierarchy**, never inside it, and is never promoted automatically (I25). Three things must not be conflated: **Memory** (known outside this turn) · **Context** (selected for this turn) · **Work state** (durable execution state from the Work/event system — never duplicated into the memory store).

Progressive disclosure: memory is durable data, not prompt stuffing. A relevance decision routes each candidate to a tiny bounded injection or to on-demand tool retrieval. **The budget is a maximum, not a spend** — no relevant memory means zero injected tokens (indicative ceilings: routine turn ≤ ~256 tokens; important task ≤ ~512; deep research ⇒ on-demand retrieval only).

| Call | Purpose |
|---|---|
| `memory.recall` | retrieve durable knowledge by query, scope, limit ("what do we know?") |
| `memory.remember` | deliberately persist something |
| `memory.forget` | honour an explicit request, including "don't remember this" (permanent) |
| `memory.maintain()` | analyze references / update graph / decay (not only store/retrieve) |
| `context.recall` | current-task continuity *inside this Work*: decisions, findings, event history, artifacts, summaries |

Algorithms are **not** exposed: an agent never sees ACT-R, FSRS, BM25, RRF or graph traversal — it sees `recall`, `remember`, `forget`. Writes are derived from execution history **after** the turn (events → candidate extraction → dedupe / conflict / provenance → write queue → persist), never on the hot path; each entry carries provenance (source binding, Work, project, evidence, confidence, timestamp). Every memory row carries `scope(user, agent, session, project)` — a project fact can never leak into another project (the leakage floor is structural, not prompt-level). Fusion work is **abortable** when the owning turn dies; a session **fork** is lineage, not one global chronological log. Memory may be `Disabled · Project only · Space + Project · Full` — when disabled there is no injection, retrieval, writes, or background extraction. Graph edges carry EXTRACTED vs INFERRED + source span. The append-only event log is the session source of truth; model history is a projection.

| Owner | Owns |
|---|---|
| `everyaios-memory` (Rust) | persistence · schema · scopes · FTS5/BM25 · embeddings · graph · provenance · temporal metadata · tombstones · retrieval + fusion primitives |
| memory reasoning (TS, narrowed) | **only** reasoning: should this be remembered? retrieved? promoted? forgotten? is this a conflict? |

## 7.1 Strategies behind the memory API (replaceable — never new subsystems)

Adding a scorer must add a **scorer inside one memory system**, never a parallel `ACTRMemorySystem` / store / graph / planner. Status of each strategy:

| Strategy | Lives in | Row |
|---|---|---|
| Multi-signal fusion (weighted RRF, dedupe, smart snippets, per-type budget caps) | `everyaios-memory::fusion` (`rrf_fuse`) — P5.1 ✅; cross-encoder rerank still open | C3 |
| Keyword signal (FTS5/BM25; headings 5×, trigram) + vectorless default fast path | `everyaios-memory::bm25` + `everyaios-storage` (FTS5) ✅ | C4 |
| Optional on-device embeddings (bge-micro/gte-small, int8/vec0) | `everyaios-storage` ✅ | C5 |
| Graph store + spreading activation (Alg #6; typed `supports`/`contradicts`/`derived-from` edges; temporal `valid_from`/`valid_to`) | `everyaios-memory::graph` (`GraphStore`, `query_depth` d=2/top-k=15) — P5.2 ✅; LadybugDB C++ FFI deferred (same schema, swap-in backend) | C6 |
| ACT-R activation (#32: retention decay with log-strength half-life, `importance ≥ 8.0` protect bit, associative recall, spontaneous pre-turn recall channel, pass-by-reference 05 §5.9) | coordinator `memory/fusion.ts` wiring | C1 |
| Temporal-KG semantics (bi-temporal validity windows, contradiction ⇒ `valid_until`, incremental episodes; `remember`/`recall`/`forget`/`improve`) | `memory-kg` / `memory-store` (SQLite-first: sqlite-vec + FTS5 + recursive CTEs + temporal tables; Postgres optional) | C11/C12 |
| Spaced-repetition reinforcement (retention-target scheduling, reschedule-on-review, simulator, due-review queue) | `everyaios-memory::fsrs` + `reinforce` — Alg **#34** (permissive fsrs-rs v6.x; FSRS-7 upstream is adopt-when-shipped) | C13 |
| Taste profile (confidence-scored rules, `observe_accept/reject/edit`, stable-prefix injection, markdown round-trip) | `everyaios-memory::taste` — P5.6 ✅ | C9 |
| Pass-by-reference context (`RefHandle` + bounded previews ≤2K tokens; query via E4 script-eval, never serialize what you can reference) | `everyaios-memory::reference` — P5.8 ✅ | C10 |
| Warm set (top-5 per project/session, swapped on workspace change, fixed injection budget 05 §5.1: 600 tokens) + agent-managed paging (core ≤600 tok · archival · recall; writes queued to turn boundaries) | coordinator + 05 budgets | C7/C2 |
| Polarized retention (sentiment −1..+1; defensive queries flip to negatives first; correction-detector auto-tags regressions) + risk compass (retrieval-confidence × source-coverage ÷ hedging-density ⇒ auto-flag or grounded self-check) + temporal anticipation (weekly-rhythm pre-indexing) + crystallization (workflows → deterministic loops, 0 tokens) + KG conflict resolution (recency + confidence + user-pin) | `@everyaios/core-memory` ✅ (spreading-activation 11 tests, phantom-thread 9, forgetting-to-remember 17, temporal-anticipation, knowledge-graph, conflict, correction-detector, decay) | C1 |
| Ghost-context prevention (file-event tombstone eviction via `notify`: tombstone FTS5/vec/graph rows on rename/delete; rename = re-path, never delete+re-index; purge on compaction) | memory coordinator | C7 |
| Sync/export/wipe (`render_markdown_export`/`render_json_export`, Obsidian `[[wiki-link]]` view mirror, per-scope `WipeScope`; E2E sync ChaCha20-Poly1305 + X25519 + version vectors + tombstones + `reconcile` + `ConflictPolicy` + live TCP transport + 8 Tauri commands + Settings → Connections) | `everyaios-core::export` / `everyaios-core::sync` — P8.9 ✅ | C8 |
| Lazy concept-graph mode (query-time concept graph, `relevance_budget` knob; indexing ≈ vector RAG) | tracked as TODO P5.12 | C6 |

Retrieval shape (one fused query, not a new layer): intent classifier (memory vs fact vs event vs document) → parallel signals (FTS5/BM25 · sqlite-vec · entity-graph activation · temporal recency) → weighted fusion (mem0-style single fused score; weights calibrated offline) → dedupe + smart snippets + budget cap — on top of the vectorless FTS5-only fast path when embeddings are off. All recalled content is wrapped in `<memory>`/`<user_document>` delimiters + injection scan (06 §6.5); source lineage (which file/page/tool, confidence, timestamp) makes "why does it know this" always answerable and deletable; export (JSON/Markdown) + wipe per scope; E2E-encrypted sync off by default.

## 7.2 History — the superseded five-tier model (non-normative, kept for traceability)

The sensory / working / episodic / semantic / procedural tier table described the same system before the contract above replaced it: episodic is now a projection of the event log (not an `events`-table timeline of its own), and the remaining tiers are the four classes in §7.0. Do not build against it; it is preserved here only so older references resolve.

## 7.3 Memory module map

| Piece | Where | Status |
|---|---|---|
| 7 algos + KG + conflict + decay | `@everyaios/core-memory` | **Built** (tested) |
| FTS5+vec hybrid + embeddings + chunking | `everyaios-memory` + `everyaios-storage` | **Built** *(former TS `core-files`, consolidated — Tier 2c)* |
| Rust-native graph store (LadybugDB-compatible optional backend) | coordinator `memory/graph.ts` | Canonical graph surface; optional backend swap-in |
| Multi-signal fusion + paging + scopes | coordinator `memory/fusion.ts` | New (strategy layer) |
| Warm-set + injection | coordinator + 05 budgets | New wiring |
