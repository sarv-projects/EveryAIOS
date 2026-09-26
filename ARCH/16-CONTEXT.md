# 16 — Context

> **Status:** Draft P2 (early — evidence-integrated 2026-09-26). Must pass the `ARCH/00-INDEX.md` §5 checklist at freeze.
> **Core idea (DEC-007):** *Context is a platform capability; context control is an agent capability.* Core answers **“what context exists?”**; Agent X answers **“what should the model see right now?”**
> **Dependencies:** `10-KERNEL`, `17-MEMORY`, `25-FILES`, `26-CODE`, `21-WORLD-MODEL`, `29-ARTIFACTS`, `30-EVENTS`, `11-WORK` (sessions), `18-MODEL-ROUTING` (windows/tokenizers), `12-TRUST` (sensitivity/projections), `15-AGENT-X` (control side).
> **Evidence:** `ARCHIVE/v1-research/agent-harness-verification.md` §A1/§A2/§C1/§C2/§E1/§E2 · `ARCHIVE/v1-research/memory.md` §4 · product-owner brief. Key decisions: DEC-007, DEC-015, DEC-019, DEC-027, INV-08, INV-22.

## 1. The two-layer split

### 1.1 Core context infrastructure — “what exists”
One service surface that fronts the context **sources** — it never assembles prompts:

| Service | Signature (semantic) | Fronts |
|---|---|---|
| `context.search` | `(query, scopes) → ContextCandidate[]` | repo map (`26`), files (`25`), memory (`17`), artifacts (`29`), world (`21`), events (`30`) |
| `context.snapshot` | `(scope) → ContextSnapshot` | pinned + structural state at a point in time |
| `context.get` | `(id) → ContextItem` | resolve a reference to content on demand |
| `context.checkpoint` | `(scope) → ContextCheckpoint` | deterministic work-state reconstruction (`11`, `30`, `29`, git) |
| `context.projection` | `(target, policy) → ScopedSlice` | external agents / subagents (filtered, never raw substrate) |

Rules: references over copies; every source is read-only through this service (INV-08); sensitivity filtering happens here **and** is enforced again at Trust (`12`).

### 1.2 Agent context control — “what the model sees now” (owned by Agent X)
`assemble` · `estimateBudget` · `select` · `prune` · `compact` · `rebuild` · `pin` · `exclude`.
Only Agent X (and every external agent for its own turn) owns this intelligence; different agents may use different strategies (`15`).

### 1.3 Context projection for external agents (DEC-009)
A scoped slice — workspace root, relevant rules, RepoMap, relevant files, git status, recent task history, relevant artifacts, relevant test failures — never the substrate, never other projects. Contract in `32-CHANNELS`; enforcement in `12-TRUST`.

## 2. ContextItem — `DM-CTX-*` (registered in `06`)

| Field | Meaning |
|---|---|
| `id` | stable reference |
| `source` | provider of the item (`repo` · `file` · `memory` · `artifact` · `world` · `event` · `tool` · `session`) |
| `type` | `repo_map` · `file_excerpt` · `tool_result` · `memory_item` · `artifact_ref` · `world_state` · `rules` · `checkpoint` · `test_failure` · … |
| `content_ref` | reference, not inline copy, whenever possible |
| `token_cost` | measured (see §3) |
| `priority` / `relevance` / `freshness` | ranking inputs |
| `scope` | `root` · `child` · `task` · `step` · `artifact` · `workspace` · `project` · `user` |
| `pinned` | survives selection & compaction until unpinned (with a ceiling) |
| `compressible` / `reconstructable` | **reconstructable = may be dropped and rebuilt deterministically**; non-reconstructable items are never pruned blindly |
| `sensitivity` | `normal` · `sensitive` · `confidential` (ceiling enforced at injection) |

## 3. Budget discipline (DEC-027 — named terms, not magic numbers)

```
usable = model_window_resolved
       − output_reserve − reasoning_reserve − summary_output_reserve
       − tool_schema_reserve − system_reserve − safety_buffer          (buffer/reserve ≈ 20k default)
retained_recent = keep                                                (≈ 8k default)
```

- **Pre-turn feasibility check:** estimate(system + messages + tools) ≤ window − buffer, else enter the compaction path **before** sending — never discover overflow from the provider.
- **Window resolution** comes from `18-MODEL-ROUTING` (per model/provider); constants are product-visible knobs (`buffer`, `keep`, `reserve`), defaulted per model class.
- Overflow is never surfaced as an error to the user while recovery options remain (INV: recovery-first).

## 4. Pipeline

```
Retrieve (search/snapshot) → Select/Rank → Budget → Prune → Compact (if needed) → Checkpoint → Pack → MODEL
```

1. **Select/Rank (v1):** relevance · scope match · pins · recency. Interfaces are MMR-ready; MMR/rerankers are deferred (parallel to memory U6) until a measured need.
2. **Prune before compaction (cheapest first).** Old tool output is replaced by a compact representation + artifact reference; **full output stays durable** (artifact/event). Pruning is an opt-in transform that never touches log truth.
3. **Compaction is a projection boundary over a durable log** (DEC-027): the session event log is never rewritten; a checkpoint segment is rendered as historical context (`<conversation-checkpoint>` framing). Strategy chain:
   1. deterministic pruning (no LLM);
   2. **structured checkpoint** — deterministic reconstruction from Work/Events/Artifacts/Git (objective/requirements/decisions/completed/active/files/tests/artifacts/workers/blockers/next_actions);
   3. model-written summary for the **non-reconstructable residue** (why-decisions, preferences) — stored as checkpoint narrative, never as the sole state;
   4. provider-native compaction — **a path we design ourselves** when a provider actually exposes one (open item OQ-CTX-01; no verified shipping reference implements it — OpenCode summarizes with the model in both generations).
4. **Overflow recovery:** `compact-after-overflow → retry the same step`; bounded retries, then surface.
5. **Hooks:** pre-compact / post-compact extension points (plugin surface, `31`).

## 5. Cache stability (first-class)

- **Stable prefix:** system contract · agent identity · project rules · stable tool definitions.
- **Dynamic suffix:** task · retrieved context · observations · tool results.
- **Baseline + deltas:** persist the first full render; emit only deltas per turn (verified pattern, §A2/§E1).
- **Injection blocks are frozen once computed:** the memory always-on block is computed once per session and reused verbatim; re-scoring it would mutate the prefix and bust the provider KV cache.

## 6. Injection policy

- Memory recall returns **candidates** via `17-MEMORY`; the Context Controller decides inclusion under budget; injection is a **non-touching read** (no counter/salience changes).
- Recalled items carry source + freshness and are framed as *historical context to verify against live state*.
- Zero relevant hits ⇒ **zero injected tokens** (INV-22). Whole-item drop, never item truncation.
- Sensitivity ceiling: `confidential` items never enter a broader-context assembly.

## 7. Manual control & visibility

- User-facing: **focus · pin · exclude · inspect**; pins survive selection/compaction up to a ceiling.
- `/eaios:context`-style command opens the **Context Inspector**; “optimize now” invokes the controller’s decision (prune / compact / no-op) — it never forces compaction.
- Automatic compaction is a background behavior of the same controller, not a competing mechanism.
- Inspector exposes: window/usable/current, per-source breakdown, pinned, excluded, recent checkpoint age.

## 8. Subagent context

- Each child assembles its own context (DEC-029); the parent passes a **bounded snapshot** (task + inherited refs), never its transcript; `fork_context` is a per-spawn option.
- Full project rules delivered to children (escaped).
- Children return receipts; receipts (not transcripts) enter the parent’s context.

## 9. Failure modes

| Failure | Behavior |
|---|---|
| Tokenizer mismatch / estimate drift | Conservative defaults; re-measure on model switch; feasibility check uses the resolved window. |
| Overflow loop | Bounded retries → compact harder → escalate; never an infinite retry. |
| Prune target needed later | `reconstructable` flag prevents loss; non-reconstructable items are not pruned. |
| Memory recall failure | Proceed without memory; never blocks a turn. |
| Projection leakage | Denied at `12-TRUST`; projection policies are deny-by-default for out-of-scope refs. |
| Stale checkpoint | Checkpoints are versioned; `rebuild` prefers live state over stale narrative. |

## 10. Interop

**Depends on:** `10`, `11`, `12`, `17`, `18`, `21`, `25`, `26`, `29`, `30`.
**Exposes to:** `15` (assemble/control), `20` (agent-node context), `32` (projections), UI (inspector data).
**DAG check:** Context never calls agents or workflows; it serves them.

## 11. Not in v1 (deferred, with triggers)

- Vector / semantic retrieval for context search (trigger: recall@k misses on paraphrase queries — mirrors memory U1).
- MMR / cross-encoder / RRF fusion (trigger: near-duplicate flooding).
- Semantic prompt caching layer (trigger: measured cache-miss cost).
- Cross-repository context graphs (trigger: multi-repo workspaces ship).

## 12. Open questions (`OQ-CTX-*`)

1. Provider-native compaction: verify whether any provider exposes one; if yes, design the adapter path ourselves (ties OQ-AX-06).
2. Default `buffer`/`keep`/`reserve` per model class (small local models need different constants).
3. Tokenizer strategy: per-provider tokenizers vs conservative estimation (ties `18`).
4. `fork_context` default policy per worker role (ties OQ-AX-02).
5. Context Inspector scope for v1 vs v1.5 (UI tie).
6. Hook surface stability: which pre/post-compact hooks are stable plugin API vs experimental.

## 13. Evidence

`ARCHIVE/v1-research/agent-harness-verification.md`: §A1 (resolved window + feasibility), §A2/§E1 (bounded fragments + baseline/deltas), §C1–C2 (budget vocabulary, overflow recovery, checkpoint projection, durable log, pruning V1-only), §E2 (named constants), §E3 (typed stream), §E4 (log + projections). `ARCHIVE/v1-research/memory.md`: §4 (non-touching recall, budget-as-maximum, whole-item degradation). Anchors: `clone2/codex/codex-rs/core/src/session/mod.rs:4560-4587` · `clone2/opencode/packages/core/src/session/compaction.ts:12-15, 178, 232-243` · `to-llm-message.ts:152-162` · `history.ts:13-80`.
