# ARCH/MEMORY — four memory classes, progressive disclosure

> **Status:** Subsystem contract, derived from [`CORE.md`](CORE.md) §10. Owns durable knowledge and what
> enters a turn. Invariants it must not weaken: **I3, I4, I17**.

---

## 1. Four classes

| Class | Meaning | Persistence |
|---|---|---|
| **Context** | this turn only — **not** persistent memory | none |
| **Episodic** | what happened — **derived from the event log** | derived |
| **Knowledge** | durable facts, entities, relationships, preferences, project facts | durable |
| **Procedural** | skills, workflows, learned procedures | durable |

> **Episodic memory is a projection of the event log, not a second timeline.** Keeping a separate episodic
database duplicates the historical truth and guarantees eventual disagreement (I3, I4). The event log
records what happened; episodic recall is a *view* of it.

---

## 2. Scope is hierarchical, and memory is not the only state

```
User → Space → Project → Session → Work
```

Rules (see [SESSION.md](SESSION.md) §5 for resolution): a narrower scope filters; promotion is explicit; a
project fact never silently becomes global. **Agent-private memory sits beside the hierarchy**, never inside
it, and is never promoted automatically.

Distinguish carefully:

- **Memory** = things known outside the current turn.
- **Context** = things selected for the current turn.
- **Work state** = durable execution state (completed steps, pending approvals, artifacts, verification,
  failures, checkpoints). This is **not memory** — it comes from the Work/event system and must not be
  duplicated into the memory store.

---

## 3. Progressive disclosure: memory is data, not prompt stuffing

The anti-pattern, stated plainly: injecting all memory, or a giant memory file, on every turn.

```
Memory → relevance decision → ┬─ tiny injection (targeted, bounded)
                             └─ on-demand tool retrieval
```

> **The budget is a maximum, not a spend.** No relevant memory means **zero** injected tokens. A system
> that always spends its memory budget to justify the feature is worse than one that remembers nothing.

Indicative ceilings (tunable, and always ceilings): routine turn ≤ ~256 tokens; important task ≤ ~512;
deep research ⇒ on-demand retrieval only. The injected block is small and explicit, never
"here are 11,382 memories".

**This is the answer to "won't memory blow up token usage?":** memory costs tokens only when it is
relevant, and it is addressable when it is not. Retrieval replaces preloading.

---

## 4. The memory API

| Call | Purpose |
|---|---|
| `memory.recall` | retrieve durable knowledge by query, scope, limit |
| `memory.remember` | deliberately persist something |
| `memory.forget` | honour an explicit request, including a user's "don't remember this" |
| `context.recall` | current-task continuity: decisions and findings *inside this Work*, event history, artifacts, summaries |

**The distinction matters:** `memory.recall` answers "what do we know?"; `context.recall` answers "what was
decided earlier in this Work?". A single API conflating them will eventually answer the wrong one.

Algorithms are **not** exposed. An agent never sees ACT-R, FSRS, BM25, RRF or graph traversal — it sees
`recall`, `remember`, `forget`.

---

## 5. The write pipeline — after work, not during

```
Turn → events → candidate extraction → dedupe / conflict / provenance → write queue → persist
```

Memory writes are **derived from execution history** and happen after the turn. Never extract on every token;
never let memory write on the hot path. Each entry carries provenance: source binding, Work, project,
evidence, confidence, timestamp.

Explicit user refusal (`don't remember this`) must prevent promotion — permanently, not "unless it seems
important later".

---

## 6. What is shared and what is not

An agent discovering something genuinely useful promotes it **deliberately**:

```
agent-private finding → memory.remember(...) → shared entry (with provenance) → other agents can recall it
```

But the agent's entire hidden context does **not** become shared memory. Shared state carries findings,
facts, decisions, tool results and verification — never private chain-of-thought. This both respects the
agent's own private state (I25) and keeps transfer cheap.

---

## 7. Disable means disable

Memory may be `Disabled` · `Project only` · `Space + Project` · `Full`. When disabled: no injection, no
retrieval, no writes, no background extraction. A "disabled" memory that still runs extraction is a second
source of truth about the user's intent and burns resources to violate it.

---

## 8. Algorithms are strategies, not architecture

The research in the existing memory documents is valuable and is **kept**. What changes is status:

| Kept as architecture | Demoted to strategy (behind the API above) |
|---|---|
| the four classes · scopes · provenance · tombstones · temporal metadata · retrieval and fusion *primitives* · the store schema | ACT-R activation · FSRS review scheduling · spreading activation · temporal knowledge graph · BM25/vector/graph fusion weights · importance floors · decay curves |

> **The rule that prevents memory-architecture rot:** adding ACT-R must not create `ACTRMemorySystem`,
> `ACTRStore`, `ACTRGraph`, `ACTRContextManager` and `ACTRPlanner`. It adds a **scorer** inside one memory
> system.

---

## 9. Ownership split

| Owner | Owns |
|---|---|
| `everyaios-memory` (Rust) | persistence · schema · scopes · FTS5/BM25 · embeddings · graph · provenance · temporal metadata · tombstones · retrieval + fusion primitives |
| memory reasoning (TS, narrowed) | **only** reasoning: should this be remembered? retrieved? promoted? forgotten? is this a conflict? |

The TS side must **not** own storage. Two storage owners is the classic duplication this architecture set
out to remove.

---

## 10. Invariants this document must not weaken

| Invariant | How |
|---|---|
| I3 — one historical truth | §1; episodic is derived from the event log |
| I4 — one owner per state | §9's ownership split; §2's Work-state separation |
| I17 — bounded model context | §3's budget-as-maximum |
| I25 — provider/agent state stays private | §6 |

---

## 11. Migration notes

The existing five-tier model is replaced by the four classes above; the seven algorithms, ACT-R, FSRS and
the temporal graph are **retained as strategies** (`P69.A18`, `P69.D30`). The temporal-graph research is not
being discarded — it is being moved below the contract, where it can be replaced without touching the
architecture.

---

## 12. Bi-Temporal Knowledge Schema (MEM-1 / Graphiti Pattern)

To eliminate destructive overwrites and model hallucination caused by stale assumptions, `everyaios-memory` persists knowledge across two independent temporal axes:

```sql
CREATE TABLE facts (
    id TEXT PRIMARY KEY,
    space_id TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    attribute TEXT NOT NULL,
    value TEXT NOT NULL,
    confidence REAL NOT NULL DEFAULT 1.0,
    source_event_id TEXT NOT NULL,
    -- System Transaction Time (when the system recorded this fact)
    recorded_at INTEGER NOT NULL,
    invalidated_at INTEGER,
    -- Valid World Time (when this fact was actually true in reality)
    valid_at INTEGER NOT NULL,
    invalid_at INTEGER,
    expired_at INTEGER,
    superseded_by_fact_id TEXT REFERENCES facts(id)
);
```

- When a preference or fact changes (e.g. "User switched from PostgreSQL to SQLite"), the old record is stamped with `invalid_at` and linked via `superseded_by_fact_id` — never deleted.
- Point-in-time queries can reconstruct the exact state of knowledge at any historical timestamp.

## 13. Non-Touching Memory Channel (MEM-3 / Nooa Pattern)

Passive memory injection (preloading top-5 warm facts into model context) is strictly isolated from cognitive reinforcement equations:
- Merely injecting a fact into prompt context does **not** update its recency or access count in ACT-R / FSRS formulas.
- Cognitive reinforcement occurs only when the model explicitly cites, confirms, or queries the fact via `memory.recall` or `memory.remember`. This prevents frequently-preloaded but unused facts from monopolizing high activation scores.

## 14. Asynchronous Observer -> Reflector Pipeline (MEM-4 / Mem0 Pattern)

Memory extraction executes asynchronously after turn settlement using a two-phase architecture:
1. **Phase 1: Deterministic Observer (Rust `everyaios-memory`):** Scans completed turn events, file edits, and tool outputs using fast pattern matchers. If no state or preference indicators exist, processing halts with zero LLM overhead.
2. **Phase 2: Structured Reflector:** Gathers candidate facts and executes a lightweight extraction model with closed verbs:
   - `ADD`: Insert new atomic fact.
   - `UPDATE`: Link and supersede an existing fact ID.
   - `DELETE`: Invalidate a fact that is explicitly contradicted.
   - `NONE`: No durable knowledge discovered.

## 15. 2-Tier Progressive Retrieval (Claude-Mem / Open-Cowork Pattern)

When supplying memory to prompt context, the system provides progressive depth:
- **Tier 1 (Injected Narrative):** Top 3–5 high-relevance facts formatted as concise sentences (~150–250 tokens total).
- **Tier 2 (Timeline Outline):** A compact single-line chronological index of relevant past interactions:
  ```
  [PAST_EVENTS: 2026-09-18 Refactored auth module (mem_id: 842); 2026-09-20 Migrated to SQLCipher (mem_id: 891)]
  ```
- If the agent requires complete context on a timeline item, it executes `memory.recall(id="842")`.

## 16. Dynamic BM25 Sigmoid Normalization & UUID Integer Mapping (Mem0 Pattern)

- **Term-Length Adaptive Sigmoid:** Raw BM25 scores are normalized via `1 / (1 + exp(-k * (score - x0)))`, where `k` and `x0` adapt based on query term length. This prevents short 1-word queries from producing disproportionately high scores compared to multi-term semantic queries.
- **Sequential Integer Reference Mapping:** In LLM extraction prompts, long UUIDs are mapped to temporary integer indices (`"0"`, `"1"`, `"2"`). The LLM emits decisions over integer indices, which the parser re-maps back to UUIDs, completely eliminating transcription errors.

## 17. Monotonic Memory Write Barrier (AIOS Pattern)

To guarantee read-your-own-writes consistency within multi-step agent plans:
- Each memory write increments a monotonic per-session sequence counter.
- When an agent issues a write followed immediately by a tool or search call, the write barrier drains the queue before the next step commences.

## 18. 3-Phase Memory Dreaming (OpenClaw Pattern)

Offline background maintenance runs in three non-blocking phases during idle hours:
- **Light Dream (Hourly):** De-duplicates near-identical records and reconciles candidate fact links.
- **Deep Dream (Daily):** Computes ACT-R base-level decay, adjusts FSRS stability curves, and rolls up episodic events into summary knowledge.
- **REM Dream (Weekly):** Performs global entity clustering and semantic graph pruning.

## 19. Memory Feedback Telemetry

Every access or reference to a memory node records `lastUsedAt`, `useCount`, and `turnId`. This telemetry directly feeds the cognitive activation equations, ensuring that valuable project facts stay warm while transient trivia naturally fades.
