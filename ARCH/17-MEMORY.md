# 17 — Memory

> **Status:** Draft P2 (early — memory evidence lane integrated 2026-09-26). Must pass the `ARCH/00-INDEX.md` §5 checklist at freeze.
> **Consumers:** `ARCH/16-CONTEXT.md` (recall), UI (Memory screen), `ARCH/32-CHANNELS.md` (external-agent projection).
> **Dependencies:** `ARCH/10-KERNEL.md`, `ARCH/30-EVENTS.md`, `ARCH/18-MODEL-ROUTING.md` (extractor call), `ARCH/12-TRUST.md` (authorization + audit).
> **Evidence:** `ARCHIVE/v1-research/memory.md` — a source-read survey (Claude Code, Codex, OpenCode, Grok Build, Hermes, mem0, Graphiti, Letta, NOOA, claude-mem, anything-llm) with `path:line`/URL citations. Decisions here become `DEC-*` entries in P1; unresolved items are `OQ-MEM-*` until then.

## 1. Purpose & responsibilities

Durable, scoped, provenance-carrying knowledge that survives sessions — deliberately **not** per-turn context.

**Owns:** the durable store (SQLite + FTS5); the write pipeline (extraction → validation → persistence); the recall primitive; lifecycle (dedup · supersede · forget · expiry); sensitivity handling at the store boundary; export/import; the audit trail of memory mutations.
**Never owns:** context assembly and budgeting (Agent X via `16-CONTEXT`); work state, checkpoints, approvals (`11-WORK`); project rules files (`AGENTS.md`-style — user/repo authored); secrets (rejected, never stored); artifacts (`29-ARTIFACTS`).

Locked rules:

| Rule | Meaning |
|---|---|
| **Memory ≠ context** (P-10) | `recall()` returns ranked **candidates**; the Context Controller decides inclusion. |
| **Budget is a maximum** | Zero relevant hits ⇒ zero injected tokens. Injection is measured on **rendered output** and degraded by dropping **whole items**, never truncating one. |
| **Non-touching read** | Injection never mutates memory state (no counter/salience bump); only explicit use may. |
| **Off the hot path** | Extraction runs after settled boundaries; a memory failure never blocks or fails a turn. |
| **Inspectable & deletable** | Every item shows scope/source/created-at; per-item delete, per-scope wipe, export. |
| **No rewrite** | The extractor may only `ADD` a new item or `SUPERSEDE` a known one; stored text is never rewritten by a model. |

Rationale (§0–§3 of the evidence): shipping systems converge on keyword-searchable durable notes + a tiny always-on index (Claude Code, Codex, Letta MemFS, Grok Build); the field's best-evidenced weakest point is stale/conflicting memory (TEPA arXiv:2608.07429; STALE arXiv:2605.06527) — hence **supersede pointer + permanent forget-with-suppression are day-1**, while vectors, graph, decay and consolidation loops are deferred behind a metric.

## 2. Concepts

### 2.1 Scopes — where an item lives, who may see it

| Scope | Keyed by | Lifetime | Written by | Typical content |
|---|---|---|---|---|
| `session` | session id | session + grace TTL (7 d) | extractor | working context, session summary |
| `task` | task/run id | task lifetime + archive | extractor + agent | task summary, decisions taken, open threads |
| `project` | project id (git root + repo identity — OQ-MEM-05) | durable | extractor + user | conventions, environment quirks, architecture decisions, gotchas |
| `user` | user id | durable | user-explicit; extractor (preferences only) | preferences, working style, profile |
| `org` | org id | durable — **schema-ready, v1 disabled** | — | shared conventions (future multi-user) |

### 2.2 Kinds — what an item is

`preference` · `fact` · `decision` · `reference` (pointer/where-to-find) · `summary` (episodic roll-up for session/task).
No `skill` kind — procedural know-how is a capability/skill concern (`31-SKILLS-PLUGINS`), not a memory item.

### 2.3 Deliberately NOT memory

- **Project rules** — `AGENTS.md`-style instructions read at session start from the repo; the extractor never writes them; it may only *propose* a diff through approval (OQ-MEM-02).
- **Work state** — steps, checkpoints, approvals, task graph belong to `11-WORK`; memory may hold a `summary` referencing them, never a second timeline (OQ-MEM-07).
- **Transcripts** — session history is the session plane's; memory stores extracted items only.

## 3. Data model — `DM-MEM-*`

One SQLite file (app data dir), WAL mode, `Core`-owned. FTS kept in sync by triggers.

```sql
CREATE TABLE memory_items (
    id             TEXT PRIMARY KEY,                 -- uuidv7
    scope          TEXT NOT NULL CHECK (scope IN ('session','task','project','user','org')),
    scope_ref      TEXT,                             -- session_id | task_id | project_id | user_id | NULL(org)
    kind           TEXT NOT NULL CHECK (kind IN ('preference','fact','decision','reference','summary')),
    content        TEXT NOT NULL,                    -- one atomic, self-contained item
    content_hash   TEXT NOT NULL,                    -- sha256(normalized content): dedup + suppression
    dedup_key      TEXT,                             -- optional stable key, e.g. 'project.build.test_cmd'
    sensitivity    TEXT NOT NULL DEFAULT 'personal'
                   CHECK (sensitivity IN ('public','personal','confidential')),
    source         TEXT NOT NULL,                    -- 'user' | 'agent:<id>' | 'extractor:<model>' | 'import'
    source_ref     TEXT,                             -- turn/event/artifact ids (provenance)
    confidence     REAL NOT NULL DEFAULT 1.0,
    pinned         INTEGER NOT NULL DEFAULT 0,       -- user-pinned: never auto-pruned
    used_count     INTEGER NOT NULL DEFAULT 0,       -- bumped only by explicit use (non-touching read)
    last_used_at   INTEGER,
    created_at     INTEGER NOT NULL,
    updated_at     INTEGER NOT NULL,
    expires_at     INTEGER,                          -- session TTL; NULL = durable
    superseded_by  TEXT REFERENCES memory_items(id)  -- contradiction pointer; NULL = current
);
CREATE INDEX idx_mem_scope   ON memory_items(scope, scope_ref, kind);
CREATE INDEX idx_mem_hash    ON memory_items(content_hash);
CREATE INDEX idx_mem_key     ON memory_items(dedup_key) WHERE dedup_key IS NOT NULL;
CREATE INDEX idx_mem_current ON memory_items(scope, scope_ref) WHERE superseded_by IS NULL;

CREATE VIRTUAL TABLE memory_fts USING fts5(
    content, content='memory_items', content_rowid='rowid', tokenize='porter unicode61');

CREATE TABLE memory_suppressions (                   -- explicit forgets survive re-extraction
    content_hash TEXT PRIMARY KEY,
    scope        TEXT NOT NULL,
    scope_ref    TEXT,
    created_at   INTEGER NOT NULL
);

CREATE TABLE memory_jobs (                           -- extraction bookkeeping (leases/retries/debounce)
    job_key      TEXT PRIMARY KEY,                   -- 'session:<id>' | 'task:<id>'
    status       TEXT NOT NULL,                      -- pending | running | done | error
    lease_until  INTEGER, retry_at INTEGER,
    retry_remaining INTEGER NOT NULL DEFAULT 3,
    last_error   TEXT, watermark INTEGER,
    created_at   INTEGER NOT NULL
);
```

Temporal columns (`valid_at`/`invalid_at`) are intentionally absent — the single `superseded_by` pointer covers explicit reversal; add them with upgrade U10.

## 4. Interfaces — `CTR-MEM-*`

| Interface | Signature (semantic) | Notes |
|---|---|---|
| `memory.recall` | `(query, scopes, token_budget, sensitivity_ceiling) → RankedItem[]` | Candidates only; caller (Context Controller) decides inclusion. |
| `memory.remember` | `(content, scope, kind, sensitivity) → id` | Synchronous, user-explicit; passes the same validate step. |
| `memory.forget` | `(id \| scope_wipe) → void` | Hard delete + suppression hash + audit; permanent. |
| `memory.inspect` | `(query \| scope) → items` | Memory UI data (provenance, pin, edit, delete). |
| `memory.export` / `memory.import` | `(format: json \| md) → file` / `(file) → result` | Import re-runs hash + secret checks; lands as `source='import'`. |

**Events emitted** (registered in `30-EVENTS`): `memory.item.added` · `memory.item.superseded` · `memory.item.forgotten` · `memory.extraction.run` (counts, model, token cost, failures).

**External-agent projection** (enforced by `12-TRUST`, surfaced by `32-CHANNELS`): filtered recall — owning project scope + the agent's own session/task + user preferences; **no** org, no other projects, no `confidential` unless a loadout grants it (v1 default: project + user only).

## 5. Write path

```
turn/task settled → (1) signal gate → (2) harvest → (3) extract (1 LLM call)
                                                            │
        (5) persist in one tx ← (4) validate deterministic ←┘
```

1. **Signal gate (no LLM).** Run only at settled boundaries: session idle (≥5 min) or task completion; debounce ≤1 run / N turns (≈10) per scope. Cheap prefilter: user correction, preference statement, explicit “remember”, decision, repeated failure, task outcome. No signal ⇒ **no model call, no write**.
2. **Harvest (bounded).** Last ≤20 turns / task result / changed-file summary; per-message truncation; include top-k existing items for the same scope so the extractor can link/supersede.
3. **Extract (one LLM call, JSON).** Closed verb set: `ADD` | `SUPERSEDE` (target id required) | `NONE`. Per item: `kind`, `scope`, `text`, optional `dedup_key`, `supersedes`. Caps: ≤3 items/run; scope may not widen without explicit user statement; relative dates resolved to absolute.
4. **Validate (deterministic).** Normalize + hash; drop duplicates (batch + store) and suppressed hashes; **secret scan → reject + log, never persist**; verify `supersedes` targets exist, are current, same-or-narrower scope; enforce caps.
5. **Persist (single transaction).** Insert items; set `superseded_by` on targets; sync FTS; emit one audit event per run; update the job row. Failure ⇒ mark error, backoff retry, never block the session.

**Explicit writes bypass extraction:** `memory.remember` is immediate; `memory.forget` hard-deletes + writes suppression + audit.

**Forbidden in v1:** rewriting/merging stored item text; cross-scope promotion; writing project-rule files; extracting from provider-session transcripts we do not own (external agent private history stays private).

## 6. Read path & injection

```
Context Controller ── memory.recall(query, scopes, tokens) ──►
  1 scope+state filter (current, unexpired, sensitivity ≤ ceiling)
  2 FTS5 BM25 candidates (top ~50)
  3 score = bm25 × kind/pin boost × recency boost
  4 dedup (hash); MMR-ready interface (v2 hook; no MMR in v1)
  5 budget fit: render, drop whole items until ≤ budget
  ◄── ranked items + provenance (id, scope, source, created_at)
```

- **Always-on block (≤128 tokens):** pinned `user` preferences + pinned project conventions; rendered once per session and reused (cache stability); recomputed only at session start, task switch, or compaction recovery.
- **Relevant block (≤256 tokens incl. always-on, tunable):** top-k items for the current query; one line per item with a source tag; wrapped with the instruction that memory is historical context and must be verified against live state.
- **On-demand:** `recall` stays available as a tool for deep retrieval; session/task summaries are the entry point for “what happened here”.
- **Abstention is a feature:** no candidate above the relevance floor ⇒ return nothing.
- **Counters:** `used_count`/`last_used_at` bump only on explicit use; if unreliable to detect in v1, defer them with U4 (they are not load-bearing).

## 7. Lifecycle

- **Dedup:** deterministic hash on normalized content; `dedup_key` for canonical facts (`project.build.test_cmd`). Near-duplicate detection is U2, not v1.
- **Update:** ADD-only body + single `superseded_by` pointer (extractor `SUPERSEDE` or user edit); superseded rows retained for audit; read paths filter them.
- **Forget:** hard delete + suppression hash (blocks re-extraction of identical content) + audit; scope wipe removes items, superseded rows and suppressions in that scope.
- **Expiry:** only `session` scope has default TTL (7 d after session end); summaries pruned by count/age per scope; pinned items never auto-pruned.
- **Sensitivity:** `public` (export/share later) · `personal` (default; leaves device only inside an active provider call) · `confidential` (project-bound; never org-shared; marked in exports). Secrets are **not a class — they are rejected** at the write path (regex + entropy scan, logged).

## 8. Failure modes & recovery

| Failure | Behavior |
|---|---|
| Extractor model call fails | Job marked error, retry with backoff; turn unaffected. |
| DB locked / corrupt | Memory disabled for the session with a surfaced warning; chat never blocked. |
| FTS desync | Integrity check rebuilds `memory_fts` from `memory_items`. |
| Secret detected post-hoc | `forget` + suppression + audit; scan corpus added to tests. |
| Stale recall served | Staleness annotation on every injected item + “prefer live state” instruction + abstention. |
| Memory disabled (per scope/user) | No injection, no retrieval, no writes, no background extraction. |

## 9. Security & privacy

- The **extractor call is a disclosure boundary** — harvested turns leave the machine if a provider model is used; default to the active session provider (no *new* disclosure) with a local-model or extractor-off option per scope (OQ-MEM-03).
- Sensitivity ceilings enforced at recall; confidential items never leave their project scope.
- External agents receive the filtered projection only (§4).
- Encryption at rest is open (plaintext SQLite vs SQLCipher; item-level for `confidential`) — OQ-MEM-04.
- All mutations are authorized through the normal trust path (`12-TRUST`) and audited.

## 10. Performance

- Recall p95 target ≤ 50 ms at 10k items (local FTS5), measured in the eval suite.
- Extraction runs off the hot path; cost visible via `memory.extraction.run` events.
- Injection budget measured on rendered output; zero-hit queries must measure zero injected tokens.

## 11. Interop

**Depends on:** kernel (`10`), events (`30`), model routing (`18`, extractor), trust (`12`, authorization/audit).
**Exposes to:** context (`16`, recall), UI (Memory screen), channels (`32`, projection), workflows (task summaries as node context, later).
**DAG check:** memory never calls context or work; it only reads its own store and emits events.

## 12. Not in v1 — upgrade triggers

| # | Deferred | Upgrade trigger |
|---|---|---|
| U0 | Memory graph / entity store | multi-hop questions fail eval |
| U1 | Vector/hybrid retrieval | recall@k misses on paraphrase queries exceed threshold |
| U2 | LLM dedup/merge/rewrite | duplicate rate > 2% after N items |
| U3 | Markdown as system of record / editable store | users demand hand-editing |
| U4 | Decay/activation math | drift sim shows stale trivia polluting top-k |
| U5 | Autonomous consolidation / dreaming | task summaries prove insufficient |
| U6 | MMR / cross-encoder / fusion | near-duplicates flood the budget |
| U7 | Org sharing / multi-user sync | team mode appears |
| U8 | Import from Claude Code / Codex memory dirs | onboarding friction proves it |
| U9 | Agent-private memory stores | bindings need isolation |
| U10 | Bi-temporal columns | point-in-time queries requested |
| U11 | FSRS/taste-profile/strategy-zoo features | specific product demand (never new subsystems) |

Sequencing if metrics force upgrades: U1, U2 → U5, U4 → U0. Nothing is built without a failing metric.

## 13. Evaluation — v1 acceptance gates

1. **Write quality (fixture):** 100-turn scripted session → keep-rate ≥ 90%, duplicate rate < 2%, secret-leak count = 0.
2. **Update/conflict suite:** ~30 scenarios → stale-return on explicit supersede = 0; re-extraction after forget = 0 (implicit conflicts are reported, not gated).
3. **Recall golden set:** 50–100 query→ids pairs → recall@5 ≥ 0.8; false-injection < 5%; abstention correct when no relevant memory.
4. **Budget honesty:** injected-token distribution vs ceiling; “no relevant memory ⇒ 0 injected tokens”.
5. **Isolation & sensitivity:** cross-project leakage = 0; external-agent view cannot see other projects/org/confidential; secret corpus never persisted.
6. **Lifecycle:** delete/wipe leaves no FTS orphans; export→import round-trips byte-identical.
7. **Ops:** recall p95 ≤ 50 ms @10k; extractor failure never affects a turn; disabled ⇒ zero activity.
8. **Drift simulation** (upgrade trigger for U4/U5): replay 30 simulated days; measure stale ratio, duplicates, injected-token waste.

## 14. Open questions (`OQ-MEM-*` → DEC in P1)

1. **Agent X native memory vs Core shared memory** — boundary decision: Core store is shared; Agent X may keep private notes, but must they be importable? Recommend: Core store is the only durable memory; Agent X consults via tools, keeps no second durable store.
2. **Rules write authority** — extractor never writes project rules; may propose a diff via approval.
3. **Extraction model** — session provider by default; local-model option for `confidential` scopes.
4. **Encryption at rest** — plaintext vs SQLCipher vs item-level for `confidential`.
5. **Project identity keying** — git remote vs path vs repo root; clone/move/worktree behavior.
6. **Org layer plumbing** — scope reserved and empty in v1; reserve `owner_id` now or migrate later.
7. **Summary ownership** — summaries produced by compaction and *referenced* by memory (recommended), or memory-owned and consumed by compaction.
8. **Cross-agent recall permissions** — final v1 default (proposal: project + user only).
9. **Counters** — instrument explicit-use counters in v1 or defer with U4.
10. **Promotion UX** — explicit-only promotion of a project item to user layer; extractor may not propose.
11. **Eval harness ownership** — fixtures/goldens location; LLM-judge gates manual/nightly, not CI-blocking.
12. **Disabled semantics granularity** — per user / per project / per agent binding.

## 15. Evidence index

Primary: `ARCHIVE/v1-research/memory.md` (full citation list). Strongest anchors: Codex pipeline `clone2/codex/codex-rs/memories/README.md:29-152`; Grok Build memory crate `clone2/grok-build/crates/codegen/xai-grok-memory/src/*`; NOOA non-touching read `clone2/nooa/packages/nooa-memory/src/nooa_memory/schema.py:315-331`; mem0 ADD-only `clone2/mem0/mem0/memory/main.py:879-1195`; claude-mem budget `clone2/claude-mem/src/services/context/ContextBudget.ts:4-40`; Claude Code memory docs `https://code.claude.com/docs/en/memory`; TEPA `https://arxiv.org/abs/2608.07429`; STALE `https://arxiv.org/abs/2605.06527`; LongMemEval `https://arxiv.org/abs/2410.10813`.
