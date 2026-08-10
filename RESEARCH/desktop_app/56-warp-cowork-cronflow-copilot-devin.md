# 56 — Warp / cowork-forge / cronflow / Copilot-CLI / Devin-API deep-dive (agentic dev-environment, workflow engine, closed-source agents)

> **Repos:** `warpdotdev/warp` (64,107★, AGPL-3.0 + MIT warpui, Rust) · `sopaco/cowork-forge` (83★, MIT, Rust) · `dali-benothmen/cronflow` (125★, **no LICENSE file** — NOASSERTION, Rust) · `github/copilot-cli` (11,073★, custom license, **closed** — binary distribution wrapper) · Devin (Cognition — **fully proprietary**; API v3 + MCP server + DeepWiki patterns).
> **All live-verified 2026-08-10** (GitHub API: stars/license/lang/pushed). warp + cowork-forge + cronflow **cloned (`/tmp/repocheck2`) + key files source-read**; copilot-cli + Devin web/docs-verified (closed source → pattern-only).
> **Verdict upfront:** of the user's 7 targets, **4 were already in the corpus** (rtk, open-interpreter, cc-switch, tauri — all ⬛ source-read; only star counts drift); **3 are NEW** (warp — the major find, now open-sourced; cowork-forge — MIT, copyable; cronflow — reference-only). **Copilot + Devin are closed → we build the equivalents ourselves; their patterns are stolen, their code never.**
> **Cross-refs:** doc 46 (Aider/Devin Cloud deep-dive), doc 45 (ACP), doc 52 (surgical hierarchy), doc 55 (agent-browser ecosystem), ARCH/05 §5.10 (rtk compression), ARCH/09 (F12 harness list, I7 RepoMap, C5 embeddings), doc 41 (steal-vs-reference index), doc 27 (master ledger → section 25).

---

## 0. Live-verified table (2026-08-10)

| Repo | ⭐ | License | Lang | Pushed | In corpus? | Verdict |
|---|---|---|---|---|---|---|
| `farion1231/cc-switch` | 126,015 | MIT | Rust | 2026-08-10 | ✅ ledger ⬛ (124,938) | refresh count only |
| `rtk-ai/rtk` | 75,397 | Apache-2.0 | Rust | 2026-08-07 | ✅ ledger ⬛ (75,033) | refresh count only |
| `OpenInterpreter/open-interpreter` | 67,927 | Apache-2.0 | Rust | 2026-08-08 | ✅ ledger ⬛ (67,747) | refresh count only |
| `tauri-apps/tauri` | 110,062 | Apache-2.0 | Rust | 2026-08-09 | ✅ ledger ⬛ (109,946) — our shell | refresh count only |
| `warpdotdev/warp` | 64,107 | AGPL-3.0 (+MIT warpui) | Rust | 2026-08-10 | ❌ NEW | 🔴 **STEAL patterns** (AGPL → never link) |
| `sopaco/cowork-forge` | 83 | MIT | Rust | 2026-07-17 | ❌ NEW | 🔴 **STEAL/ADAPT** (MIT — copyable) |
| `dali-benothmen/cronflow` | 125 | NOASSERTION | Rust | 2025-11-03 | ❌ NEW | ⚪ REFERENCE only (no license, stale) |
| `github/copilot-cli` | 11,073 | custom (no derivatives) | Shell | 2026-08-07 | ❌ not in ledger | 🟢 REFERENCE (closed; we build) |
| Devin (Cognition) | — | proprietary | — | — | ✅ doc 46 covered | 🟢 REFERENCE (closed; patterns) |

---

## 1. `warpdotdev/warp` (64,107★, AGPL-3.0, Rust) ⬛ — the major new find

**What it is:** "An **agentic development environment**, born out of the terminal" — Warp went **open source in 2026** (AGPL-3.0, except the `warpui_core`/`warpui` UI crates which are MIT). **OpenAI is the founding sponsor**; the repo runs its own OSS-management workflows on **Oz** (their agent platform, GPT-powered): issue triage → spec write → implement → PR review, all driven from `agents/specs/` markdown spec files (APP-4882, CODE-1908, QUALITY-1112, REMOTE-2160…). Supports **bring-your-own CLI agent** (Claude Code, Codex, Gemini CLI) — the same harness-driving bet as our F12.

**Monorepo (60+ crates):** `ai` (the agent — the goldmine), `input_classifier`, `lsp`, `computer_use`, `isolation_platform`, `virtual_fs`, `managed_secrets`, `mcp` (uses **rmcp** — the same crate our stack chose, validates the pick), `natural_language_detection`, `voice_input`, `markdown_parser`, `ipynb_parser`, `repo_metadata`, `warp_multi_agent_api`, `graphql`, `http_server`, `local_control`…

### 1.1 The `ai` crate — `crates/ai/src/index/full_source_code_embedding/` (source-read)

A production **incremental codebase-embedding index** — the open-source Rust equivalent of Devin's DeepWiki:

- **Semantic chunker** (`chunker/semantic.rs`): tree-sitter parse → recursive `split_node` traversal (`MAX_TRAVERSAL_DEPTH: usize = 200` anti-infinite-recursion guard) → byte-bounded fragments → `coalesce_fragments`; even releases allocator memory via `malloc_trim(0)` after parsing (Linux). Naive chunker alongside.
- **Merkle-tree incremental sync** (`merkle_tree/`): `MerkleHash`/`ContentHash`/`NodeHash`, `SerializedCodebaseIndex`, `TreeUpdateResult` — re-index only what changed (file-level content hashes), not the world.
- **Search shaping** (`search_shaping.rs`): fragments registered by `(content_hash → FragmentMetadata{absolute_path, byte_range})`, re-read on demand with **char-boundary validation** (`is_char_boundary`) before slicing — no mid-UTF-8 corruption; `fail_to_read`/`fail_to_read_path` tracked.
- **`file_outline/native.rs`** — native file-outline extraction (structure without full file).
- `manager.rs`, `priority_queue.rs`, `changed_files.rs`, `snapshot.rs`, `search_shaping_tests.rs`… — a full index-management surface.

### 1.2 Other stealable crates (structure-verified)

| Crate | What it is | → ours |
|---|---|---|
| `input_classifier` | **ONNX intent classifier** (`onnx/candle.rs` + `onnx/ort.rs` dual backends) classifying terminal input before dispatch | TODO-1010 intent-before-dispatch (Copilot pattern — now open-sourced reference) |
| `lsp` | **LSP integration**: `servers/{typescript_language_server,pyright,go,clangd,rust}.rs`, `transport.rs`/`service.rs`/`manager.rs` | coding-loop diagnostics without context bloat (Copilot's `lsp-config.json` idea, readable here) |
| `isolation_platform` | docker sandbox + namespace isolation + kubernetes | I3 sandbox reference |
| `computer_use` | GUI control (recordings, click/drag annotations, video) | E9 post-v1 reference |
| `managed_secrets` | secrets vault | vault reference |
| `virtual_fs` | virtual filesystem | workspace sandbox reference |

### 1.3 Verdict — **W1–W8 steals**

| # | Steal | Source (source-read) | Lands in |
|---|---|---|---|
| W1 | **Merkle-tree incremental codebase-embedding index** (semantic+naive chunkers, content-hash sync, search shaping, char-boundary-safe reads) | `crates/ai/src/index/full_source_code_embedding/` | **I7** (RepoMap) + C5 optional embedding path + G5 |
| W2 | Native file outline | `.../file_outline/native.rs` | code-structure tools (I7-class) |
| W3 | ONNX input intent classifier (candle + ort) | `crates/input_classifier/` | TODO-1010 intent routing |
| W4 | LSP-backed diagnostics (rust/ts/pyright/clangd/go) | `crates/lsp/` | coding loop I1/I4 — context-light errors |
| W5 | Isolation platform (docker + namespace) | `crates/isolation_platform/` | I3 sandbox |
| W6 | Computer-use engine | `crates/computer_use/` | E9 post-v1 |
| W7 | Managed secrets + rmcp-based MCP (validates our rmcp pick) | `managed_secrets/`, `mcp/` | vault + F6/F7 |
| W8 | Spec-driven agent workflow (`agents/specs/*.md` → triage/spec/implement/review) | `agents/specs/` | plan-before-build (I5/ECC guardrails) + H19 |

⚠️ **AGPL-3.0 → pattern-only, never link** (same discipline as BrowserOS/Lightpanda). The MIT `warpui` UI crates are separate.

---

## 2. `sopaco/cowork-forge` (83★, **MIT**, Rust) ⬛ — copyable multi-role dev team

**What it is:** a full-role **AI development team** (Product Manager → Architect → Project Manager → Engineer) that "collaborates like humans" through **Actor-Critic self-review** with human validation at decision points, producing **artifacts** per stage. Rust workspace: `cowork-core` (engine, FFI-exportable to Python/Java/Node), `cowork-cli`, `cowork-gui` (**Tauri**!). Built on the **adk-rust** (Agent Dev Kit) framework. Skills via **agentskills.io SKILL.md** (`.agents/skills/`: codegraph, repomix-context, rtk, terrain-knowledge — same skill format we aligned I2 to in doc 55).

### 2.1 Source-read highlights

- **`config_definition/` — the stage/hook/artifact pipeline config system:** `AgentDefinition`, `StageDefinition`, `StageType`, `HookConfig`/`HookPoint`, `ArtifactConfig`, `StageRetryConfig`, `FlowDefinition`/`StageReference`, `MemoryScope`, `InheritanceConfig`/`InheritanceMode`, `IntegrationDefinition` (MCP toolsets init) — a **config-driven, data-modeled pipeline** instead of hardcoded flows.
- **`pipeline/`** — `stage_executor.rs`: config-driven execution; supports **Simple and Actor-Critic stage types**; **goto_stage escalation** (`event.actions.escalate` + `goto_stage`/`goto_reason` state-delta — an agent can signal a stage jump mid-run); per-stage artifact save tools (`save_idea`/`save_prd_doc`/`save_design_doc`/`save_plan_doc`/`save_check_report`/`save_delivery_report`); stages = idea → prd → design → plan → coding → check → delivery. `executor/{workspace,knowledge,interaction_ext}.rs`.
- **`acp/` + `agents/external_coding_agent.rs` — a working ACP harness:** `AcpClient`/`AcpTaskResult`/`AgentMessage`; drives **Codex/Claude Code/Gemini as external coding agents over ACP (stdio or WebSocket)** with streaming message channels — a reference implementation of exactly our **F12/J17** design (doc 45).
- **`instructions/`** — role prompt set (idea/prd/design/plan/project_manager/coding/check/delivery/summary/knowledge_gen) → our surgical hierarchy (brain → core → surgeon, doc 52).
- **`interaction/`** — `InteractiveBackend` trait decoupling engine from UI (CLI/GUI backends) — the same engine/UI split as our sidecar+webview.
- **`runtime_security.rs` + `runtime_analyzer.rs` + `project_runtime.rs`** — preview/run of generated projects with security checks.
- **`llm/rate_limiter.rs`** — LLM rate limiting.
- **`domain/iteration.rs`** — `Iteration { id, base_iteration_id, inheritance: InheritanceMode, current_stage, completed_stages, artifacts }` — **iteration inheritance** model for evolving sessions.

### 2.2 Verdict — **C1–C6 steals** (MIT → actually adaptable)

| # | Steal | Source | Lands in |
|---|---|---|---|
| C1 | Stage/hook/artifact pipeline config system (StageDefinition/HookPoint/ArtifactConfig/StageRetryConfig/FlowDefinition) | `config_definition/` + `pipeline/stage_executor.rs` | coding loop (I-rows) + ECC guardrails (I5) |
| C2 | ACP external-coding-agent adapter (stdio/WebSocket, streaming) | `acp/client.rs`, `agents/external_coding_agent.rs` | **F12/J17** harness bridge reference |
| C3 | Role-prompt instruction set (PRD→delivery) | `instructions/` | surgical hierarchy (doc 52) |
| C4 | Runtime security checker for generated projects | `runtime_security.rs` | sandbox guardrails (J-rows) |
| C5 | Iteration inheritance (base_iteration_id + InheritanceMode) | `domain/iteration.rs` | session/iteration state (B6) |
| C6 | Actor-Critic stage types + goto_stage escalation signals | `pipeline/` | I5/I4 loop self-review |

Small (83★) but **MIT + active (v2.5.2, pushed 2026-07-17)** and remarkably aligned with our architecture (ACP, SKILL.md, Tauri, config-driven pipeline).

---

## 3. `dali-benothmen/cronflow` (125★, **no LICENSE file**, Rust) ⚪ — workflow-engine reference

**What it is:** "code-first workflow automation engine" — Rust core (`core/src/`: `workflow_state_machine.rs` 52KB, `step_orchestrator.rs`, `dispatcher.rs`, `job.rs`, `trigger_executor.rs`, `triggers.rs`, `webhook_server.rs`, `database.rs` + `schema.sql`, `condition_evaluator.rs`, `bridge.rs`) + **napi bridge** to a TypeScript/Bun SDK. Sub-ms steps, webhook triggers with schema validation, event triggers, parallel execution, retries (**backoff + jitter + max backoff clamp**), HITL, conditional branching.

**Source-read highlights:**
- **HITL = explicit state-machine state:** `enum WorkflowExecutionState { … Paused … }` with a **transition table** (`(Running, Paused) => true`, `(Paused, Running) => true`, `(Paused, Cancelled) => true`) + `pause()` — approval pauses are first-class states, not side channels.
- Retry config: `retry_attempts`, `retry_backoff_ms`, `max_backoff_ms`, `retry_jitter`, `max_retries`.
- Webhook server + trigger executor + job queue with worker pool (min/max workers, queue size).

**Verdict:** ⚪ **REFERENCE only** — 125★, stale (last push 2025-11-03), and **no LICENSE file (GitHub reports NOASSERTION despite the README's Apache-2.0 badge) → code cannot be copied**. But the design is a clean blueprint for our **H22 automation builder / B7 scheduler**: code-first workflow DSL, HITL-pause-with-timeout as a first-class state, webhook triggers, retry-with-jitter.

---

## 4. GitHub Copilot — **closed; we build**

- **`github/copilot-cli`** (11,073★, active — pushed 2026-08-07): the public repo is a **distribution wrapper** (install scripts + prebuilt binaries from private releases) under a **custom license forbidding modification/derivative works** and allowing redistribution only unmodified inside a larger app. **Core engine closed.** → **we build our own harness; never a dependency.**
- **Architecture to steal (patterns):** agentic loop on top-tier models with `/model` switching (our BYOK); **Autopilot mode** (Shift+Tab — run a multi-step plan autonomously) and `/fleet` (parallelized subagents); **LSP integration via `~/.copilot/lsp-config.json` / `.github/lsp.json`** — precise diagnostics/go-to-def/hover without context bloat (the pattern we now source from Warp's open `lsp` crate, W4); context memory + compaction (our ARCH/05); **Agent Skills** (SKILL.md, agentskills.io — already aligned in I2, doc 55); built-in GitHub MCP + external MCP; **hybrid CLI↔IDE handoff**.
- **Already stolen in our corpus (pre-doc 56):** intent classification before dispatch (spec §4.1 / TODO-1010), Autopilot nudge (TODO-1011), ApplyPatch edit format (TODO-1012), Prompt TSX (spec §4.1); Copilot as OAuth subscription target (A4, doc 33 §7.4); Copilot as cc-switch-managed app (doc 41).
- **Gaps closed by this doc:** ① **Copilot CLI added to the F12 harness list** (we drive Codex/Claude Code/Cursor/Grok/OpenCode/Aider/Cline/Pi — Copilot is now a first-class harness); ② **LSP-backed diagnostics task** (TODO P7.1, Warp `lsp` crate as the open reference); ③ `github/copilot-cli` row in the ledger (reference, closed).

---

## 5. Devin (Cognition) — **fully proprietary; API v3 + MCP + DeepWiki patterns**

- Devin is **entirely closed** (cloud "Brain" + sandboxed Devboxes, Devin IDE/Desktop, Devin CLI with `/handoff`). Already deep-dived in **doc 46** → matrix **H19–H24** (progress panel, workspace tabs, takeover/resume, automation builder, knowledge browser, MCP marketplace) + ARCH/12 UI + spec §4.1 steals. Nothing new to add to the matrix.
- **New this round (web/docs-verified):**
  - **Devin API v3** — org/enterprise scopes, **service users + RBAC**, `create_as_user_id` session attribution → pattern for multi-user attribution in any hosted variant (N/A for our local-first single-user; reference).
  - **Devin MCP server (`mcp.devin.ai`)** — Streamable HTTP tools: session create/search, **playbook management**, **org knowledge-base management**, **scheduled runs** → reference for our H22 automation builder + H23 knowledge browser + F7 connector hub (how a vendor exposes lifecycle management over MCP).
  - **DeepWiki** — auto-indexed repo wikis; **the underlying pattern is now better sourced from Warp's open Rust `full_source_code_embedding` index (W1)** — the closed vendor's signature feature, open-sourced by Warp.
- **Verdict:** 🟢 reference; no ledger row (no public repo); doc 46 + this doc together are the complete Devin record.

---

## 6. The four already-in targets — refresh only (no re-deep-dive needed)

| Repo | Ledger (2026-08-06) | Live (2026-08-10) | Δ |
|---|---|---|---|
| `farion1231/cc-switch` | 124,938 | **126,015** | +1,077 |
| `rtk-ai/rtk` | 75,033 | **75,397** | +364 |
| `OpenInterpreter/open-interpreter` | 67,747 | **67,927** | +180 |
| `tauri-apps/tauri` | 109,946 | **110,062** | +116 |

All four are ⬛ source-read in the ledger (cc-switch docs 19/22/23/31/41/43 · rtk docs 20/23/31/46 · open-interpreter docs 01/22/23/31/45 · tauri docs 20/26/41). Star counts refreshed in ledger section rows (doc 56).

---

## 7. Spec / matrix / TODO impact (doc 56)

- **ARCH/09:** **F12 row → Copilot CLI added to the harness list**; **I7 (RepoMap) → extended with the Warp semantic-embedding incremental index (W1)** + file-outline (W2) + LSP diagnostics (W4); C5 optional-embedding path notes Warp as the open reference. **No new matrix rows** (steals map onto existing rows — same policy as doc 55).
- **DESKTOP-APP-SPEC v3.12:** changelog line; ground-truth docs 01–56 / **226 repos**; F12 row += Copilot CLI; §4.1 steals note += Copilot LSP-config + Warp index patterns.
- **TODO:** P6.8 (F12) += Copilot CLI + LSP-config; P7.1 (I1/I4) += LSP-backed diagnostics (Warp `lsp` reference); P7 RepoMap task area += Warp merkle embedding index (W1, optional C5); P6.4 (B7) += cronflow HITL/retry reference note.
- **Ledger (doc 27):** new **section 25** (warp ⬛ 64,107 · cowork-forge ⬛ 83 · cronflow ⚪ 125 · github/copilot-cli 🟪 11,073) → **222 → 226 repos**; 4 star-count refreshes (§6 table).
- **doc 41 (steal index):** warp + cowork-forge added to the STEAL/ADAPT tables; copilot-cli + cronflow to REFERENCE.
- **Not touched:** ARCH/06 (no security changes), ARCH/07 (Warp index is code-search, not memory-KG — lives in I7/C5), ARCH/08 (no browser changes).

---

## 8. Steal-coherence map — how the sources compose (no hodge-podge)

> **Rule: one row = one owner; sources feed rows, rows don't merge sources blindly.** Every steal in docs 41/55/56 lands on an existing matrix row; this map records the layering decisions so future research passes don't double-implement or contradict. New steals must be checked against this map first (and the map updated).

| Domain | Sources (repo → doc) | Matrix rows | Composition decision (layering, not merging) |
|---|---|---|---|
| **Codebase context** | Aider RepoMap (46) + **Warp `full_source_code_embedding` (56 W1/W2)** | I7 (everyaios-repomap) | **RepoMap = deterministic default** (tree-sitter tags + PageRank + budget fitting, zero embeddings); **Warp index = optional semantic layer** behind the C5 embedding gate. Different queries (context selection vs semantic search/outline) — **one crate, one ownership, two query paths** (RepoMap's SQLite tag cache + Warp's fragment/embedding store = two backing stores under one interface); not two competing indexes |
| **Diagnostics** | Aider lint/test reflection (46) + **Warp `lsp` crate (56 W4)** + rtk linter rules (ARCH/05 §5.10) | I1/I4/I10 + ARCH/05 | **Three stages, no overlap:** LSP = live diagnostics during editing (cheap, incremental) → lint/test reflection = post-edit build-level gate (retry ×3) → rtk = tool-result compression at injection (dedup warning lists). Compose in that order |
| **Model roles** | Aider architect mode (46/I9) + doc 52 surgical hierarchy + oracle/review (TODO P11.5.10) | F12, I9 | **Hierarchy = routing policy** (brain → core → surgeon tiers); **architect = two-pass mode inside the surgeon tier** (plan → edit); **oracle = heavyweight review pass after edits**. Distinct roles: architect plans-then-edits, oracle reviews-after — all compose under F12, never conflated |
| **Intent routing** | Copilot Chat intent classification (TODO-1010) + **Warp `input_classifier` ONNX (56 W3)** | B1 loop pre-dispatch | **One feature, two sources:** pattern = Copilot's prompt-based routing (default); Warp = optional ONNX ML backend over the **same dispatch interface** — not a second routing system |
| **Harness-driving** | ACP official crate (45/J17) + **cowork-forge `acp/client.rs` (56 C2)** + BrowserOS `acp-agent-runtime` (33) + opencode ACP (45) | F8/F12/J17 | **One implementation (J17: official crate);** cowork-forge = streaming/UI-decoupling reference; BrowserOS/opencode = protocol references. **F12 list = single source of truth for harnesses (9 CLIs incl. Copilot CLI); F8 installs that same set** — BrowserOS's 7-harness catalog is historical (superseded) |
| **Automation/scheduler** | cronflow (56 §3) + openworker (40) + DeerFlow run_policy (39) + BrowserOS routines (33) + Devin automation (46/H22) | B7/H22 | **One scheduler (B7);** cronflow contributes the HITL-pause-as-state + retry-jitter **patterns only** (no LICENSE — never code); the rest are design references for triggers/templates |
| **Code search / embeddings** | **Warp index (56)** + eDirStat/SeekStorm (49/20) + agentmemory/mem0 (21/23) | I7 vs G6/G7 vs C3 | **Distinct stores, no overlap:** Warp = code-fragment embeddings (I7, code context); SeekStorm/eDirStat = local corpus/disk search (G6/G7); mem0/mem0 = memory retrieval (C3). Different data, different rows |
| **Browser** | agent-browser/obscura/steel (55) + BrowserOS (33) | E-rows | Mapped in doc 55 §7 — steals land on existing E-rows; no new rows, no conflicts |
| **Vault/secrets** | **Warp `managed_secrets` (56 W7)** + Steel session vault (55) + BrowserOS OAuth (33) | E11/J8 | Warp = generic-secrets design reference only; E11 = browser storage context (Steel); J8 = key vault. Three scopes, three rows — a secrets design doc may consult Warp, never merge scopes |

**Checklist for future passes:** (1) does the new steal feed an existing row or justify a new one? (2) does it overlap any row already fed by another source (check this table)? (3) if two sources feed one row, is the layering explicit (default vs optional, stage A → stage B)? (4) update this map + the row's Source column in ARCH/09.

---

**Ledger: 222 → 226 repos.** Reading-order: docs 01–55 → **56** (this doc) → **spec v3.12** (2026-08-10 — this doc's patches applied: F12 += Copilot CLI, I7 += Warp index, F8 = F12 harness set, TODO P6.8/P7.1/P6.4/P11.5.9/P11.5.10 + coherence cross-refs, ledger section 25; no matrix rows added; steals map onto existing rows).
