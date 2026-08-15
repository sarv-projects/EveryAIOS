# 63 — 37-Repo Steal Ledger (harness / browser / office / user-capability clusters)

> **Pass:** user-supplied repo list (2026-08-15), all **cloned + source-read** (34 repos) or **web-level verified** (4 giants + LibreOffice core). **Ledger: unchanged at 255 repos — this pass adds 0 repos** (every repo below is either already tracked, already a dependency, or a pattern-source already mapped — no new ledger entries; see §0 verdicts).
> **Doctrine:** steal = reimplement in our own stack (Rust for crates, TS for coordinator) with source-pattern credit; never vendor/copy code. Rust rewrite of TS/JS patterns is explicitly in-scope (user directive: "rewrite in another lang, say in rust, is quite viable").
> **Cross-references:** SPEC §0 rows · ARCH/09 · TODO phases · prior ledger docs (27/46/47/48/49/50/52/54/55/56/57/58/59/60/61/62).

---

## 0. Verdicts at a glance

| Repo | Reality (verified) | Verdict → row |
|---|---|---|
| **codger** (Solen-AI-org) | Real — sub-agent spec-file workflow | **REF** → B2/P6.1 (spec-per-task = our blueprint pattern; no new row) |
| **paper** (cordiverse) | Real — Cordis agent framework | **REF** → I6/P6 (everything-is-a-plugin validates our extension ABI) |
| **deepseek-harness** | Real — plan/goal/schedule/LSP/extensions/sandbox-slot | **REF** → P6 + P5.6 (plan-file lifecycle, schedule-with-blockers) |
| **best-of-Agent-Harnesses** | Real catalog (700+ items) | **REF** — evidence-backed eval/multi-agent/memory categories |
| **Awesome-Long-Horizon-Agents** | Real survey (240+ items) | **REF** — computer-use / long-horizon taxonomy |
| **openspec** | Real — spec→plan→tasks→verify workflow | **REF** → B2/P8 (verification-gated tasks = our eval subsystem shape) |
| **OmniRoute** | Real — 339-provider, 13-factor scoring, mode packs | **STEAL** → A6/A7 (already doc 58/59 mapped; this pass re-verified the taxonomy) |
| **Vane** (ItzCrazyKns) | Real — classify→parallel research/widgets→cited answer | **STEAL-pattern** → P5.4 (intent classifier + parallel worker split) |
| **khoj** | Real — personal RAG + cron automations + MCP tools | **STEAL-pattern** → P7 automations (already B7; this adds the run-code/online-search tool shapes) |
| **univer** | Real — full TS office suite | **STEAL-pattern** → D-gaps (charts, track-changes, comments, PPT animations, PDF annotations exist there → honest gap list) |
| **ppt-master** (hugohe3) | Real — 30+ layout systems, pptxgenjs | **STEAL-pattern** → D3 (layout library for author-new-deck) |
| **guizang-ppt-skill** | Real — HTML decks + presenter mode + validator scripts | **STEAL** → D3/D7 (SPEAKER_NOTES contract + validate-presenter-mode scripts) |
| **better-harness** (QoderAI) | Real — evidence-first loop reports | **STEAL** → P8 (missing-evidence-explicit report format = eval subsystem UX) |
| **GenericAgent** (lsdefine) | Real — minimal agent loop + phase hooks | **REF** — hook taxonomy at every loop phase (agent_before/turn_before/llm_before/tool_before) |
| **crux** (pedr0v) | Real — SCIP-indexed symbol queries (66%→96% accuracy, 24% fewer tokens) | **STEAL** → coding layer (new tool cluster, see §2.1) |
| **agent-framework** (microsoft) | Real — group chat / sequential / concurrent / handoff | **REF** → P6 orchestration vocab (handoff + group-chat topologies) |
| **agent-browser** (vercel-labs) | Real — Rust CDP CLI, a11y `@eN` refs, Electron-app automation, video | **STEAL** → E-catalog (Electron-app CDP automation; slim snapshots; skills-from-CLI) |
| **obscura** (h4ckf0r0day) | Real — Tier-1 engine, already tracked (doc 55) | **CONFIRMED** → E1/E10 (re-verified; no change) |
| **deepwiki-open** (AsyncFuncAI) | Real — hierarchical repo summarization | **STEAL-pattern** → C5/P5 (tree-summarize → index summaries → answer; no-embedding path) |
| **aider** | Real — repo-map (tree-sitter), SEARCH/REPLACE + udiff, architect coder | **STEAL** → I7/P7.1 (repo-map for code context; already doc 51/56 partial; architect = sub-agent pattern) |
| **qwen-code** | Real — declarative agent frontmatter (CC-compatible), chat compression, skills manager | **STEAL** → P6.1 (agent-frontmatter schema port) |
| **codex** (openai) | Real — compaction-with-hooks lifecycle, token-budget compaction, apply-patch safety, attestation | **STEAL** → P5.6 (compaction lifecycle + fallback chain; apply-patch safety = our guard) |
| **antigravity-cli** | Real — keyboard TUI over shared agent engine | **REF** → P11.5 (TUI variant, low priority) |
| **anki** | Real — FSRS spaced-repetition scheduler (Rust) | **STEAL** → new memory capability (see §2.2 — FSRS port is directly stealable Rust) |
| **logseq** | Real — Datalog/DataScript graph queries over blocks | **STEAL-pattern** → memory-graph query layer (P5 graph) |
| **obsidian-zotero-integration** | Real — CSL citations + Zotero | **STEAL** → P7 research (cite-while-writing in office engine) |
| **siyuan** | Real — block-level refs + attrs + database views + **agent capability model w/ ToolEffects + frontend-side handlers via SSE** | **STEAL** → I6 (capability+effects schema validates our extension ABI; block model = notes capability) |
| **AFFiNE** | Real — Yjs CRDT + BlockSuite (store/history/selection extensions) | **REF** → office undo/checkpoint model (snapshotBefore analog) |
| **zed** | Real — CapabilityGranter, WIT cumulative versioning, host facades, spawn-agent continuation, symlink-safe permissions | **STEAL** → I6 (capability granter pattern) + P6 (spawn-agent continuation) |
| **neovim** | Real — LSP client (diagnostics, code actions, rename, inlay hints, watchfiles), tree-sitter | **STEAL** → coding layer (LSP tool cluster — see §2.1) |
| **chrome-devtools-mcp** | Real — slim snapshots, category flags, WebMCP, perf/network/memory tools | **STEAL** → E9/E-catalog (slim response mode; WebMCP support) |
| **lightpanda** | Real — Tier-1 engine, already tracked (doc 33/55) | **CONFIRMED** → E1 (re-verified; no change) |
| **skyvern** | Real — multi-protocol action parsing (native/CUA/Anthropic/UI-TARS), verification loop, action caching, deadline budgets | **STEAL** → E-catalog + BYOK (per-provider action-protocol adapters; verification loop → P8) |
| **nightmare** | Real but legacy (Electron scraper, archived-era) | **SKIP** — nothing to steal |
| **chromium / ladybird / serenity / brave** | Giants — multi-process, site-isolation, WebContent split (web-level) | **CONFIRMED** — we're a driver, not an engine; validates tiered-engine decision |
| **rustdesk** | Real — Rust core + NAT traversal + relay | **REF** — remote-assist capability candidate (P11.5+, not in current scope) |
| **LibreOffice core** | Real — full office round-trip oracle | **CONFIRMED** — P4.1 truth tier; not a shortcut; D-gaps below are the honest list |

---

## 1. Top structural gaps this survey confirms (already-have evidence)

| Gap | Steal source | Already have? (evidence) | Where it lands |
|---|---|---|---|
| **LSP code-intel** (symbols/refs/rename/diagnostics) | neovim `runtime/lua/vim/lsp/*` + zed LSP | ❌ **zero LSP code** (grep: no `lsp` in coordinator+core) | NEW coding-tool cluster (P7.1) |
| **SCIP symbol index** (where/callers/unused) | crux `src/{queries,semantic}.rs` | ❌ none | NEW coding-tool cluster (P7.1) |
| **Eval/verifier subsystem** (deterministic outcome checks, evidence bundles, anti-bias grading) | better-harness + skyvern verification loop + codex attestation | ❌ none (no verifier in codebase) | NEW P8 pre-work (before multi-agent) |
| **Compaction-as-lifecycle** (pre/post hooks, token-budget, model fallback) | codex `compact_token_budget.rs` + `hook_runtime.rs` | ⚠️ `everyaios-memory::compaction` algorithms ✅ (P5.7) but **no turn-loop hooks, no fallback** | P5.6 upgrade |
| **339-provider catalog + family-vs-transport split** | OmniRoute `PROVIDER_REFERENCE.md` | ⚠️ router + mode packs ✅ (coordinator/router.ts) but catalog long-tail open | A6 (P1.8) |
| **Multi-protocol action parsing** (native/CUA/Anthropic/UI-TARS) | skyvern `parse_actions.py` | ❌ only native parse | E-catalog + BYOK adapters |
| **Office "perfectness" list** (charts, track-changes/comments, PPT animations, PDF annotations) | univer packages | ❌ (P4.7 viewer + notes panel open) | D2/D4/D7/D8 |
| **Presenter mode / SPEAKER_NOTES contract** | guizang `references/presenter-mode.md` + validator scripts | ❌ | D3/D7 |
| **Repo-map (tree-sitter) for code context** | aider `repomap.py` | ❌ (FTS5 filename search ✅ only) | I7/P7.1 |
| **FSRS spaced repetition** | anki `rslib/src/scheduler/fsrs/` | ❌ none | NEW memory capability |
| **Electron-app CDP automation** (drive VS Code/Slack/Spotify) | agent-browser skills | ❌ | E-catalog |
| **Slim snapshot / compressed responses** | chrome-devtools-mcp `SlimMcpResponse.ts` + agent-browser `@eN` | ⚠️ snapshot ✅, slim toggle ❌ | E9 |
| **Cron automations + run-code/online-search tool shapes** | khoj routers | ⚠️ B7 cron ✅ planned, tool shapes ❌ | P7 |
| **Capability+effects schema, frontend-side tool handlers** | siyuan `kernel/agent/capability.go` + `kernel/mcp/tools/capability.go` | ⚠️ I6 design ✅, effects schema ❌ | I6 |
| **Datalog-style graph queries** | logseq DataScript | ⚠️ memory graph ✅, query language ❌ | P5 graph |

---

## 2. New capabilities (not in SPEC today) — proposed rows

### 2.1 Coding layer (proposal: C-rows under a new "Coding" family, or fold into existing tool catalog)

- **`C1 — LSP code-intel`** — one LSP client (neovim `client.lua`/`handlers.lua` reference) serving: hover/docs, go-to-def, references, rename (with preview), diagnostics, code actions, inlay hints, watchfiles. Guard-ticketed (read tools read-only; rename/apply = mutation). Rust (lsp-types/tower-lsp client) or sidecar TS. → maps to TODO P7.1 (which doc 56 already pointed at LSP diagnostics — this makes it concrete).
- **`C2 — SCIP symbol queries`** — `symbol_where / symbol_callers / unused_exports` over a SCIP index (crux reference, 66%→96% accuracy). Rust: read scip crate → compact text answers. → coding tool cluster.
- **`C3 — repo-map context`** — tree-sitter repo map (aider `repomap.py` reference) for cheap code-context assembly; feeds I7/prompt context, no embeddings needed.

### 2.2 Memory (proposal: fold into existing C-family rows, no new rows)

- **FSRS spaced-repetition** — port anki's Rust FSRS scheduler as a `everyaios-memory` module (retention targets, reschedule, simulator). User-facing: "reinforce what I learned" → schedules review prompts at optimal intervals. **Directly stealable Rust** — anki's fsrs is already Rust.

### 2.3 Eval subsystem (proposal: new E-series row or P8 pre-work)

- **`EV1 — Verified-completion grading`** — task manifest (goal/constraints/budget) + deterministic verifier (state checks, artifact hashes, permission-trace checks) + evidence bundle + status taxonomy (verified/partial/blocked/failed-safely/failed-unsafely/unverifiable). Sources: better-harness evidence-first reports, skyvern verification loop, codex attestation, openspec verify-gate. **Build order: before multi-agent (user directive).**

---

## 3. Office "no scope reduction" verdict

LibreOffice as truth-oracle is **not** a shortcut — it is the byte-stable conformance tier (doc 28 pattern). The honest "not perfect yet" list. ⚠️ **Correction (re-verified 2026-08-15):** univer's OSS clone (v1.0.0-beta.0) has **comments only** — charts / PPT animations / PDF are **Pro/roadmap features, absent from the OSS packages** (confirmed by clone grep + univer README: "charts, pivot tables, sparklines… chart and table model/UI plugins" listed under Pro/enterprise; slides OSS "under active development"; no PDF package at all). Doc 58's OSS/Pro split note was right; this table originally over-claimed ✓. The actual steal-sources for these gaps: **ppt-master** (native page transitions + per-element object animations + data-backed native charts, per its docs/animations.md + getting-started.md) and **LibreOffice core** (annotations/oracle).

| D-row | Capability | univer OSS has | our office crate | status | steal-source |
|---|---|---|---|---|---|
| D1 | docx block-patch | ✓ | ✓ | shipped | — |
| D2 | track-changes + comments | ✓ (comments only; no track-changes) | ❌ | **gap** | univer thread-comment + LibreOffice w:ins/w:del |
| D4 | charts | ❌ (Pro) | ❌ | **gap** | ppt-master native charts (OOXML c:chart) + LibreOffice |
| D7 | PPT animations/transitions | ❌ (Pro) | ❌ | **gap** | ppt-master (p:transition / p:anim) |
| D8 | PDF annotations (sticky notes, highlights) | ❌ (no PDF pkg) | ❌ | **gap** (P4.7 viewer + notes panel open) | LibreOffice (annotations) |
| — | presenter mode / speaker notes contract | — | ❌ | steal from guizang | guizang presenter-mode.md |
| — | CSL citation insertion | — | ❌ | steal from obsidian-zotero-integration | obsidian-zotero CSL |

Each gap is a D-series TODO item, not a spec cut.

---

## 4. Steal → code mapping (all reimplement, none vendor)

1. **agent-browser Electron-app automation** → new `electron_app` tool family in everyaios-mcp (CDP attach to any Electron app's debug port: inspect a11y tree, click/fill/read, screenshot) — reuses existing CDP stack, zero new deps. Rust.
2. **chrome-devtools-mcp slim snapshots** → `snapshot(slim: true)` mode: drop non-actionable nodes, collapse long text, cap depth — same a11y engine, new serialization. Rust.
3. **skyvern multi-protocol action parsing** → coordinator `parse_actions.ts` grows per-provider adapters behind the router (native first; CUA/Anthropic/UI-TARS when a BYOK provider needs them). TS.
4. **qwen-code agent frontmatter** → blueprint parser accepts CC-compatible `permissionMode/color/hooks/mcpServers/maxTurns` fields → AgentConfig. TS.
5. **codex compaction lifecycle** → everyaios-memory `compaction` gets `PreCompactHook/PostCompactHook` + token-budget path + fallback model chain, wired into coordinator turn loop. Rust + TS glue.
6. **crux SCIP queries** → new `everyaios-codeintel` crate (scip reader + answer renderer), tools registered in mcp catalog. Rust.
7. **neovim LSP** → `everyaios-codeintel` LSP client module or sidecar TS (lsp-types); guard-ticketed. Rust/TS decision at implementation.
8. **aider repo-map** → `everyaios-codeintel::repo_map` (tree-sitter queries per language) or coordinator reuse of `@personal-ai/core-*` if already present. Rust preferred.
9. **guiang SPEAKER_NOTES** → pptx part-editor emits `SPEAKER_NOTES` contract; UI presenter mode; validator script port. Rust + UI.
10. **anki FSRS** → `everyaios-memory::fsrs` module (port of `rslib/src/scheduler/fsrs` — same algorithm, our API). Rust.
11. **siyuan capability+effects + SSE handlers** → I6 extension manifest gains `effects` + `actionEffects` + `ownerId`; frontend-capability dispatch via existing SSE/event channel. Rust.
12. **khoj automations + tools** → B7/P7: cron scheduler + run-code tool + online-search tool shapes. TS (sidecar) + guard tickets.
13. **logseq Datalog queries** → memory graph query DSL (P5 graph). Rust.
14. **Vane classify→parallel→cite** → P5.4 intent classifier returns (needs_research, needs_tools, rewrite) → parallel workers → cited final answer. TS (sidecar) + UI citation cards.
15. **better-harness evidence-first reports** → EV1 report format: findings carry impact/expected-output/scoped-repair/acceptance-checks; missing evidence explicit. UI + coordinator.
16. **openspec verify-gate** → blueprint tasks carry `verify` blocks (checks that must pass to mark done). P6.1.
17. **zed capability granter** → I6 CapabilityGranter in everyaios-guard (per-extension capability grants, cumulative versioning). Rust.
18. **deepseek-harness plan/schedule files** → P6.1: `plan.md` + `schedule.md` with blocker edges, resume-after-reboot. TS.

---

## 5. Explicit non-steals

- **chromium/ladybird/serenity/brave** — we are a CDP driver, not an engine; multi-process/sandbox design is Chromium's own job (validates our tiered-engine choice: Chrome default + Lightpanda + Obscura).
- **nightmare** — archived-era Electron scraper; every capability superseded by agent-browser/chrome-devtools-mcp patterns.
- **rustdesk** — remote-assist is out of current scope; note as P11.5+ candidate (NAT traversal is a big build; do not fold in now).
- **OmniRoute** — already fully mapped (docs 58/59); re-verified this pass, no delta.

---

## 6. Ledger & provenance

- **Ledger: 255 repos unchanged** (0 new — all 37 already tracked, dependencies, or pattern-sources).
- This doc is the **steal-coherence record** for the 2026-08-15 pass; prior passes' coherence maps: doc 56 §8 (warp/cowork), doc 61 (land-grab), doc 62 (cost/eval).
- **Never cite as fact:** vendor-reported benchmark numbers without our own eval (doc 51/62 doctrine); all per-repo accuracy claims above are from the repos' own READMEs/benchmarks and marked as such.
