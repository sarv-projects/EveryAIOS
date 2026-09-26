# 26 — Code (Repository Intelligence & Execution)

> **Status:** Draft P3 (early). Must pass the `ARCH/00-INDEX.md` §5 checklist at freeze.
> **Role:** the coding domain runtime — **repo understanding** (RepoGraph → RepoMap) + **code execution** (shell/tests/worktrees). This module produces structure and executes; Agent X supplies the intelligence that uses it (`15`).
> **Dependencies:** `25-FILES` (identity/watchers) · `16-CONTEXT` (budgets/levels) · `19-RUNTIME-ENVIRONMENTS` (processes/worktrees) · `12-TRUST` (exec policy) · `29-ARTIFACTS` (outputs). **Consumers:** `15` (coder profile), `34` (verification).
> **Evidence:** product-owner brief (RepoGraph/RepoMap; edit→build→test loop) · `agent-harness-verification.md` §A2/§E1 (bounded fragments + baseline), §A3 (worktree session-bound vs per-spawn — DEC-029) · repo guidance (`.agents/skills/codebase-intelligence/SKILL.md`: tree-sitter/SQLite/graph, incremental hashing, “never present inferred edges as certain”) · local `everyaios-codeintel` crate (read-only reference).

## 1. Purpose & rules

**Owns:** the RepoGraph index · the RepoMap projection · the LSP bridge · ripgrep-backed lexical search · git context · worktree provisioning + merge flow · test/build/lint execution wrappers · language detection.
**Never owns:** agent strategy (`15`) · context selection/budgeting (`16` owns the budget; `26` produces projections) · file identity (`25`) · exec policy (`12`).

1. **Structural parsing is first-class** — tree-sitter + LSP + ripgrep + git; the module picks the cheapest accurate answer per query.
2. **RepoMap is a projection under a token budget** — never the whole repository.
3. **Worktrees are per-spawn options** (DEC-029); merges are explicit review steps, never silent.
4. **Code execution walks the governed path** — capabilities + environments + exec policy; never a direct subprocess from the agent.
5. **Heuristic ≠ certain** — inferred graph edges are labeled as inferred (repo guidance).

## 2. RepoGraph (index model)

**Nodes:** File · Symbol (function/class/type/module/package) · Import · Reference · Call · Test · Config · Document · Command.
**Edges:** `imports` · `calls` · `extends/implements` · `references` · `tested_by` · `configured_by` · `generated_by` · `depends_on`.

- **Build:** incremental — file hashes; only changed files re-parse (watcher deltas from `25` W1); per-workspace SQLite store; tree-sitter grammars for syntax; LSP enrichment for precise edges where available.
- **Precision labels:** compiler/LSP-grade edges vs heuristic (tree-sitter/regex-level) edges are distinct fields; the UI/agent can tell which is which.
- **Freshness:** changed files reindex; stale edges flagged; queries prefer fresh subgraphs.
- Bounds: ignore rules (node_modules/vendor/build), size caps, and per-language module sets declared for v1.

## 3. RepoMap (projection)

- **Ranking:** dependency-graph centrality (Aider-style) + recency + task-relevance signals; deterministic given (graph, budget, task hints).
- **Budget:** from `16` §3 — the projection fits a declared token allowance; zero budget ⇒ zero map.
- **Levels:** RepoMap serves context levels 0–2 (project identity · repo map · relevant dirs/symbols); levels 3–5 are file/slice retrievals on demand (`16` §2).
- **Format:** compact, cache-friendly text — stable ordering for the stable prefix discipline (`16` §5); signatures + key refs, not bodies.
- **Injection:** fragments follow the bounded-fragment + baseline/delta pattern (verified §A2/§E1).

## 4. LSP bridge

Capabilities: `definitions` · `references` · `hover` · `diagnostics` · `symbols` · `rename` (policy-gated). Lifecycle per workspace: start/stop/health under `19`; graceful degradation to graph+search when an LSP is absent or crashed. Diagnostics are a context item type (`16` §2).

## 5. Search & retrieval

- **Lexical:** ripgrep integration — fast, bounded, path-scoped (`12`).
- **Structural:** graph queries (symbols, callers, imports, tests).
- **Semantic:** deferred (`16` §11 trigger: recall misses on paraphrase queries).
- Retrieval returns refs (`file:range`) + bounded excerpts — never whole-file dumps by default.

## 6. Git context & worktrees

- **Context:** status · diff · log (bounded) · targeted blame — feeds RepoMap ranking and context items; rendered for the UI as diffs (`32`).
- **Worktrees (DEC-029):** provisioned per-spawn when isolation is requested; branch strategy declared per task; the parent workspace holds write leases (`25` §6); merge = explicit step (review diff + tests) with receipts; abandoned worktrees are cleaned with a receipt.
- **Safety:** force-push/destructive operations are policy-gated (`12` §3); no silent rebase/reset.

## 7. Code execution

Wrappers over the capability plane: `code.run` · `code.test` · `code.build` · `code.lint` — each executes inside a declared environment (`19`) under exec policy (`12`), captures bounded output (full log → artifact, compact view → context per `16` §4), and routes long jobs to the background lane (`11`). The edit→build→test→diagnose loop is the coder profile's completion path (`15` §6).

## 8. Failure modes

| Failure | Behavior |
|---|---|
| Index corruption | Rebuild from source (incremental hashes make this bounded). |
| LSP crash/absent | Degrade to graph + ripgrep; diagnostics marked unavailable. |
| Worktree conflict | Queue / rebase / ask — never silent overwrite. |
| Flaky tests | Report with evidence; bounded retries only where declared; never a retry loop. |
| Huge repo | Incremental indexing + ignore rules + declared bounds; partial maps with freshness. |
| Generated files drift | `generated_by` edges surface provenance; edits to generated files flagged. |

## 9. Interop

**Depends on:** `10` · `12` (exec policy/paths) · `16` (budget/levels) · `19` (processes/worktrees) · `25` (identity/watchers) · `29` (artifacts).
**Exposes to:** `15` (retrieval + execution), `34` (verification: diffs/tests), UI (explorer/source view).
**DAG check:** `26` produces structure and executes declared commands; it never decides policy or assembles the model's context by itself.

## 10. Not in v1

Cross-repository graphs · remote devboxes · semantic/embedding retrieval · automatic merge automation beyond explicit review steps · SCIP ingestion beyond what the LSP bridge provides.

## 11. Open questions (`OQ-CODE-*`)

1. v1 language matrix (which tree-sitter grammars ship) and LSP set.
2. Indexing bounds + ignore defaults per stack.
3. Merge flow automation level (assist vs require explicit user merge).
4. Whether SCIP export is worth it for precise edges early.
5. RepoMap ranking weights tuning process (eval harness).

## 12. Evidence

Product-owner brief (RepoGraph/RepoMap, coding loop) · `agent-harness-verification.md` §A2/§E1 (fragments/baseline), §A3 (worktree models; DEC-029) · `.agents/skills/codebase-intelligence/SKILL.md` (tree-sitter, incremental hashing, SQLite, graph analysis; inference labeling) · local `everyaios-codeintel` (reference only) · `ARCH/16-CONTEXT.md` §2–§5 · `ARCH/25-FILES.md` §2/§6.
