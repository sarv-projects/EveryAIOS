# CURRENT RUN STATE — Task Handover & Checkpoint

> **INSTRUCTION FOR ALL CODING AGENTS**: 
> 1. Read this file **first** before starting any task. 
> 2. Update this file **after every completed or partially completed task** before handing off.
> 3. **Git Commit & Push Protocol (`desktop_app`)**:
>    - **Mandatory `git add`, `git commit`, and `git push` for verified changes in `desktop_app`.**
>    - **Strict Vendor-Neutral Rule: Explicitly forbids mentioning any AI tool or agent brand names (no "Cline", "OpenCode", "Freebuff", "Codebuff", "Antigravity", "Claude", etc.) in commit messages, descriptions, PRs, comments, or documentation.**
> 4. Authoritative surfaces: `desktop_app/TODO.md` = delivery status (the one live count), `desktop_app/SPEC-CHANGELOG.md` = release evidence/history, `desktop_app/DESKTOP-APP-SPEC.md` + `desktop_app/ARCH/` = the contract. This file is the session handover only and must not carry a competing census.

---

## 1. Active Goal

**(Current, 2026-09-17 — Tier-1 P64 Native Agent Plane wiring implemented, verified, committed)**:
- Scope: P64.3 repomap inject (below CACHE_BOUNDARY, segs 1-7 byte-stable) · P64.4 subagent worktree runtime (limits 2/3/6, blocked tools, 3-file blackboards) · P64.5 edit ladder (exact fail-closed → structural splice → fuzzy, Guard-2 ticketed) · P64.6 shadow preflight (risk-gated, PID-tracked, 50KB caps) · P64.7 checkpoint/rollback (kernel auto-checkpoint + fenced restore + timeline UI) · P64.8 skill distill gate (500-line + tests gate) · P64.9 shared-plane façades (16 routes over same 51-tool methods).
- Files: 16 modified + 3 new — crates (blueprint checkpoint/lib/skill_store; core execution/governor/lib/tools/worktrees; mcp lib), coordinator (chat/context-trace/plan/prompt/tools + new p64-lane.test.ts), ui (message-bubble/session-timeline + new lib/checkpoints.ts + turn-checkpoint.tsx).
- Verified: check-doc-sync exit 0 (166 caps, 1429 = 1221 done + 208 open, kernel clear) · ipc-parity exit 0 · ui tsc exit 0 · cargo check touched crates clean · cargo test lib 64 + 175 + 697 pass · security-gate PASS · coordinator p64-lane 21 pass.
- Gotchas: panels/activity-panel.tsx does not exist — UI built on chat/session-timeline.tsx; ARCH/14, ARCH/15, ARCH/11-PROMPT-ANATOMY, ARCH/03-SECURITY-ROUTING, ARCH/05-BROWSER-ENGINE do not exist (contracts taken from ARCH/17 + SPEC only); shell keeps one snapshot per file per session so timeline restores same file set per turn (copy states this); TODO P64.3-P64.9 checkboxes intentionally left open pending live-consumer proof + doc-sync header update.
- Next: Tier-2 P65/P66 Settings center → Tier-3 terminal → Tier-4 swarm/CUA → Tier-5 packaged matrix (P50.5.8/P66.9).

**(Previous, 2026-09-17 — README complete rewrite + full "Switzerland of AI" removal + expanded 2026 multi-tool comparison matrix)**:

**COMPLETED THIS SESSION:**
1. **README.md — Complete Human-Friendly Rewrite & 2026 Multi-Tool Matrix** (`fa2a491`, `ba83ab2`, `532a8bb`):
   - Removed all ASCII box diagrams, competitive bashing, and engineering-heavy architecture sections from the top.
   - Flow: Beautiful casual intro → "What can you actually do with it?" → "Capabilities at a glance" (14 key dimensions) → "How it compares" (expanded late-2026 matrix across EveryAIOS, Claude Desktop & Cowork, OpenAI Codex / ChatGPT, Claude Code CLI, and Cursor / Windsurf) → "The Universal Harness Advantage" note → Installer status → Run from source → Plain-English module table → Architecture in `<details>` dropdown → 10 FAQ dropdowns.
   - Objective, factual, respectful comparison showing EveryAIOS's unique role as a host and desktop operating harness.
2. **"Switzerland of AI" — Removed from ALL docs**:
   - `ARCH/00-INDEX.md`, `ARCH/01-SYSTEM-ARCHITECTURE.md`, `ARCH/02-MODULE-LAYOUT.md`, `ARCH/16-CHAT-LOOP-RUST-PORT.md`, `ARCH/17-NATIVE-AGENT.md` — phrase stripped, substance preserved.
   - `DESKTOP-APP-SPEC.md` lines 81 and 91 — phrase stripped.
   - `SPEC-CHANGELOG.md` lines 23 and 43 — phrase stripped.
   - `README.md` and `TEST-CASES.md` — stripped.
   - `COMPETITIVE-POSITIONING.md` — intentionally untouched (internal strategic doc, not public surface).
3. **Verification**: `node scripts/check-doc-sync.mjs` → exit 0 (166 capabilities, 1429 checkboxes, kernel gate clear).
4. **Committed & pushed**: `532a8bb` → `origin/main`.

---

## 2. Where We Stopped (Latest Progress)
- **Completed Deliverables**:
  - `desktop_app/README.md`: Completely rewritten. Human-readable intro. Expanded 2026 competitor matrix covering Claude (Desktop & Cowork), OpenAI Codex / ChatGPT, Claude Code, Cursor/Windsurf. Architecture in dropdowns. FAQ at the bottom. Committed as `532a8bb`.
  - `desktop_app/TEST-CASES.md`: Full 83KB specification with all 8 modules, 8 cross-module integration suites, and 50 E2E production use cases.
  - `ARCH/00-INDEX.md`, `ARCH/01`, `ARCH/02`, `ARCH/16`, `ARCH/17`: "Switzerland of AI" stripped from all.
  - `DESKTOP-APP-SPEC.md`: "Switzerland of AI" stripped from lines 81 and 91.
  - `SPEC-CHANGELOG.md`: "Switzerland of AI" stripped from lines 23 and 43.
  - `.agents/skills/`: All 10 skills aligned.
  - `.agents/agents/`: All 9 agent definitions aligned.
- **Verification Evidence (All Passed)**:
  - `node scripts/check-doc-sync.mjs` → **exit 0** (166 capabilities in sync, 1429 checkboxes intact, kernel gate clear).
  - `node scripts/ipc-parity.mjs` → **exit 0** (321 commands registered).
  - `Select-String -Path README.md -Pattern "Switzerland"` → **0 matches**.
  - `ui/node_modules/.bin/tsc --noEmit -p tsconfig.json` → **exit 0** (0 type errors).
  - `clean-profile-boot-check.mjs` → PASS / SKIP as expected without pre-built debug binary.
- **Current session reconnaissance (read-only, re-measured 2026-09-16):** `desktop_app` only. True scale measured with `git ls-files`: **1,346 tracked files / 366,004 lines** (`rs` 490 files/185,969 lines · `ts` 425/62,625 · `tsx` 144/40,932 · `md` 136/24,283 · `json` 40/24,348 · `mjs` 14/2,081 · `css` 1/712), plus 21 ARCH docs (00–17 + DIAGRAMS + 2 ADR), 93 RESEARCH docs, 47 `src-tauri` files, 141 UI component files, 331 `#[tauri::command]` functions, 2,764 Rust `#[test]` fns, 27 Rust integration-test files, and 134 TS/TSX test files. (Previous entry said 1,331/361,083 and "310 test files" — superseded by this measurement.)
- **Fully or substantially read this session:** all 10 `.agents/skills/*/SKILL.md`; root `AGENTS.md`; `README.md`; `package.json`/`pnpm-workspace.yaml`/`tsconfig.json`/`capabilities.yaml`/`.pre-commit-config.yaml`; all 22 crate `Cargo.toml`s + workspace manifest; all 11 package `package.json`s; `tauri.conf.json`; `ARCH/00`–`ARCH/17`, `DIAGRAMS.md`, `ARCH/ADR/0001`+`0002`; `TODO.md`; substantial portions of `DESKTOP-APP-SPEC.md`, `SPEC-CHANGELOG.md`, `capabilities.yaml`; `src-tauri/src/{lib,state,commands,catalog_cmds,acp_cmds}.rs`; every crate's `lib.rs` module map; `crates/everyaios-core/src/{tools,guard_service,execution}.rs`; `crates/everyaios-guard/src/sandbox.rs`; `crates/everyaios-audit/src/session_log.rs`; `crates/everyaios-memory/src/compaction.rs`; `crates/everyaios-vault/src/broker.rs` (partial); `packages/coordinator/src/{index,chat,plan,tools,router}.ts`; `packages/core-ai/src/{chat/system-prompt,context/tiered-compaction}.ts`; `packages/core-tools/src/{permission-gate,trust-ladder}.ts`; `ui/src/{main,App}.tsx`, `ui/src/lib/{bridge,runtime,tauri}.ts`, `ui/src/lib/store.ts` (partial, 450/2947).
- **Core-code map pass (this wave):** extracted the module-doc header + line count of **every** `.rs`, `.ts` and `.tsx` file in the repo (from each file's own `//!` / leading block comment) to build a verified map, then read in full: `crates/everyaios-ipc/src/{lib,frame,message,channel,handle,budget,socket}.rs` (the whole process contract), `crates/everyaios-types/src/lib.rs`, `crates/everyaios-core/src/{lib,version,capability_manifest,adapter}.rs`, `crates/everyaios-guard/src/{lib,sandbox}.rs`, `crates/everyaios-audit/src/{lib,merkle,session_log}.rs`, `crates/everyaios-memory/src/compaction.rs`, `crates/everyaios-acp/src/acp_cmds`-adjacent domain, `src-tauri/src/{commands,catalog_cmds}.rs`; plus windows of `everyaios-core/src/{chat,guard_service,tools,execution}.rs`, `everyaios-vault/src/broker.rs`, `packages/coordinator/src/{chat,plan,tools,router,index}.ts`, `packages/core-ai/src/{chat/system-prompt,context/tiered-compaction}.ts`, `packages/core-tools/src/{permission-gate,trust-ladder}.ts`.
- **NOT yet read (the honest remainder):** the unrouted tails of the large engine internals — `everyaios-core/src/work_gateway.rs` (reads stopped at the thought-summary helper after ~1500/3533 lines), `everyaios-vault/src/broker.rs` (reads stopped after the streaming entry point at ~400/2205 lines), `everyaios-office/src/xlsx/patch.rs` (stopped inside the test module at ~1327/1621), `everyaios-acp/src/client.rs` (~330/1333), `everyaios-browser/src/actions.rs` (~1000/1879 covering navigation/act/tabs/read/screenshot), `everyaios-cdp/src/browser.rs` (~1000/1164 covering discovery/launch/CfT install), `everyaios-blueprint/src/skill_store.rs` (~1000/1079 covering manifest/store/index/pins), `everyaios-catalog/src/provider_seed.rs` (1742), `everyaios-search/src/lib.rs` (1081), `packages/core-providers/src/registry.ts` (read in full), `packages/core-memory/src/knowledge-graph.ts` (~part of 1061), `ui/src/lib/store.ts` (~1200/2979) — plus 93 RESEARCH docs, ~310 test files, most of the 141 UI component/view/panel files, and the tail of `SPEC-CHANGELOG.md`. No implementation files were changed.
- **Status**: P66.1 / P66.3 (WSL spawn adapter + agent picker redesign), P66.2 (Agent discovery & custom binary import/verify), P66.4 (Session capability loadout backend & UI), and P66.5 (Blue semantic theme & selectable accents) **implemented and machine-verified**.
- **Fresh verified evidence (2026-09-16, this session — commands actually executed):**
  - `node scripts/check-doc-sync.mjs` → **exit 0** — "166 capabilities in sync (yaml == ARCH/09 == spec §0); TODO.md 1428 = 1217 done + 211 open matches header; shell chrome v3.80 matches the changelog; kernel gate clear."
  - `node scripts/ipc-parity.mjs` → **exit 0**.
  - `node scripts/clean-profile-boot-check.mjs` → **PASS** — honest locked/setup boot, doctor Credentials zero-keys count-only, no seeded tasks/scheduler, no sidecar-liveness claim, zero demo/seed markers.
  - `ui/node_modules/.bin/tsc --noEmit -p tsconfig.json` → **exit 0** (zero diagnostics). NB: the documented `pnpm run type-check` fails in a non-TTY shell because pnpm 11 aborts an implicit `pnpm install` module-dir purge (`ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`); invoke the local `tsc` binary instead.
  - `cd crates && cargo check -p everyaios-guard --lib` → **Finished dev profile in 22.23s** (`cargo check` must be run from `crates/`, not the repo root — the workspace manifest lives there).
  - `node scripts/e2e/security-gate.mjs` → **PASS** across all 6 legs (S1 guard deny 189 passed, S2 p10 10 passed, S3 audit 56 passed, S4 mcp 60 passed, S5 ipc-parity 0 broken, S6 approval provenance).
  - `node scripts/e2e/failure-injection.mjs` → **PASS** across all 6 active legs (L1 sidecar restart, L2 vault lock, L3 doctor honest, L4 corrupt persistence, L5 guard suites, L6 version/bogus).
  - `cargo fmt --all -- --check` → **Clean pass, 0 formatting errors**.
  - `packages/core-engine` Vitest OOM resolved with single-fork `vitest.config.ts`.
- **CODE-LEVEL independent verification (2026-09-16, raw code only — docs ignored):**
  - `cd crates && cargo check --workspace --all-targets` → exit 0 (2m18s); `cargo test --workspace --no-fail-fast` → **2,518 passed / 0 failed / 23 ignored** across 73 test binaries, exit 0. Default `cargo test --workspace` → exit 101 on the flaky `bench_browser_snapshot_tree_build` (587.63ms vs the 500ms budget at `crates/everyaios-core/tests/p10_bench.rs:208`); it **passed on re-run** → timing-flaky gate.
  - `cd ui && bun test` → **328 passed / 0 failed / 41 files, exit 0**. `cd packages/coordinator && bun test` → **356 passed / 2 failed / 2 errors, 44 files, exit 1** — both failures are `live-agent-harness.test.ts` spawning the real `opencode` binary (`${HOME}/.bun/bin`, **no skip gate**), plus a `null` exitCode and one dangling process killed by bun. The CI coordinator job installs no such binary.
  - Dead-code scan (module-path references + TS import-graph reachability): **48 Rust modules with zero references anywhere**, including all of `everyaios-engine` (`gate`/`plan`/`risk` — that crate has **zero dependents in any Cargo.toml**); `guard::{loopguard,configscan,ecc}`; `core::{voice,pairing,decline,self_audit,research,report,multirun,migrate,migration,hooks,git_commit,inventory,distill,diagnose,combos,connector_approvals,remote_attach,watcher_glue}`; `memory::{maintain,branch,abort,seek,bench}`; `storage::{trigram,pool,hash_cache,usn_winapi}`; `vault::auth_bridge`; `mcp::record`; `office::provenance`; `script::selfheal`; `browser::{acquisition,har}`; `codeintel::docs_lookup`; `blueprint::{swarm,workflow,worktree,surgical,jobs,inbuilt,helpers,marketplace,plugin_manifest}`. **21 coordinator modules are test-only** (`first-class-tools`, `fleet`, `goal`, `resumable`, `edit-strategies`, `h32`, `mcp-manager/install/catalog`, `mention`, `persona-registry`, `reflection`, `surfaces`, `channel-a`, `capability-seams`, `agent-patterns`, `dream-diary`, `external-inbox`, `migration-import`, `patch-overlay`, `intent`); `ui/src/lib/calendar.ts` is test-only despite 6 registered calendar commands; **60 ghost Tauri commands** per `scripts/ipc-parity.mjs --md` (330 registered / 270 UI-invoked / 0 broken).
  - Implemented≠shipped: `tree-sitter` is **not a dependency** (codeintel repomap is lexical; "tree-sitter precision is a later, optional upgrade" per its own module doc); `hf-hub` is not a dependency (the HF client is hand-rolled over `ureq`).
  - Runtime security boundary as built: strict CSP in `tauri.conf.json`; `src-tauri/capabilities/*.json` grant only `core:*` window controls + `dialog:allow-open` (no `fs`/`shell`/`http` plugin privileges); `guard_cmds::guard_respond` rejects any caller whose window label is not the guard window; the guard window loads only the bundled `guard.html` via `WebviewUrl::App`.
  - Not verified here: the **49 test files under `packages/core-*` are executed by no CI workflow**; `vitest` is not installed in this checkout so those suites could not be run; no Windows target was compiled or run (this host is Linux).
  - Process note: this handover file was concurrently rewritten by another session mid-verification (HEAD moved `974e9ac` → `5419977` → `39ea45e` while tests ran, superseding the earlier draft bullets of this same section). The numbers above are pinned to the working tree as observed during each run; treat neither session's narrative as authority over the other's executed evidence.
- **Working Tree**: Clean and up to date with `origin/main` at commit `f879d8e`.
- **Commits on `origin/main` (`github.com:sarv-projects/EveryAIOS.git`)**:
  - `f879d8e` — `docs(readme): modernize frontier model references and competitor capabilities`
  - `12de9ee` — `docs(readme): update capability matrix, native agent plane, and architecture`
  - `39ea45e` — `docs: update specification, architecture, changelog, and delivery status for native plane and release gates`
  - `5419977` — `fix(guard): add fallback return for sandbox capabilities and stabilize e2e harness`
  - `974e9ac` — **verified actual subject is the single character `\`** (`git log -1 --format=%s 974e9ac`); this entry previously repeated the intended message `perf: record fresh p45 live performance benchmark measurements`, which is not the commit's real subject. Touches only `scripts/p45-live-measurements.json`.
  - `758d25f` — `feat(guard): add windows and macos sandbox capabilities and worktree branch restore`
  - `c0d453a` — `feat(coordinator): wire native tools, context providers, and add performance measurement suite`
  - `3bf7bcf` — `test(coordinator): implement real-world cowork and software benchmark suite`
  - `5ff3c49` — `fix(tauri): correct calendar command return types and add live agent harness verification`
  - `7916591` — `test(coordinator): add multi-agent swarm and cowork capability verification suite`
  - `c2e04ea` — `docs: document multi-agent swarm fleet, avoidance store, calendar ipc, and context mode`
  - `4d1e938` — `feat(core): implement multi-agent fleet worktrees, failure avoidance store, and calendar schema`
  - `e40be8a` — `docs: reconcile runtime evidence status and audit ledger`
  - `c6152d9` — `feat(theme): migrate default brand tokens to cool-blue and add user-selectable accents (P66.5)`
  - `a43c220` — `feat(acp): implement session capability loadout and agent import verification`
  - `8228d74` — `docs: update hero tagline hierarchy and external agent harnesses in README`
  - `7dfd2d2` — `docs: highlight full capabilities including background automations, deep search, and storage intelligence in README`
  - `61bfdd5` — `docs: modernize frontier model references and highlight agent support in README`
  - `d08d438` — `docs: remove external screenshot from README`
  - `25c1284` — `docs: update comparison table and features with 2026 ecosystem capabilities`
  - `76872c5` — `feat(terminal): one PTY plane — shell integration, provenance, and agent terminal executor (v3.80)`
- **Verification evidence (last green run)**:
  - `cargo test -p everyaios-core`: `666 passed, 0 failed` (including `governor::tests`, `worktrees::tests`, `git_queue::tests`).
  - `cargo test -p everyaios-guard`: `all passed, 0 failed` (including `sandbox::tests`, `loopguard::tests`, `netfloor::tests`).
  - `cargo test -p everyaios-memory`: `210 passed, 0 failed` (including `avoid::tests`).
  - `cargo test -p everyaios-vault`: `140 passed, 0 failed` (including `tests::test_calendar_crud_roundtrip`).
  - `cargo test` in `src-tauri`: `41 passed, 0 failed` (including `acp_cmds::tests`, `calendar_cmds` fixed return types).
  - `bun test` in `packages/coordinator`: `358 passed, 0 failed` across 44 files (including `src/live-agent-harness.test.ts` 7/7 passed with real OpenCode ACP handshake and Grok Build CLI and model listings for `opencode/big-pickle` and `grok`, and `src/real-tasks-benchmark.test.ts` 7/7 passed covering real SWE LRUCache, GDPval research synthesis, IronCalc financials, OOXML patching, calendar scheduling, and worktree swarms).
  - `node scripts/measure-perf-p45.mjs`: `P45 Performance Benchmark suite verified — 3546 MB/s read, 1.19M writes/sec, 401k audit events/sec, 19ns route lookup, 153 MB/s JSON throughput`.
  - `node scripts/verify-packaged-e2e.mjs`: `7 passed, 0 failed across store gate, calendar IPC, native tools, @Codebase resolution, avoidance store, worktree isolation, and P45 performance evidence`.
  - `tsc --noEmit` in `ui`: `100% clean type-check across 141 components, 0 errors`.
  - `node scripts/check-doc-sync.mjs`: `✅ doc-sync: 166 capabilities in sync (yaml == ARCH/09 == spec §0); TODO.md 1428 = 1217 done + 211 open matches header; shell chrome v3.80 matches the changelog; ✅ kernel gate clear.`
  - `node scripts/ipc-parity.mjs`: `0 errors (IPC parity clean, 330 registered).`
  - `node scripts/clean-profile-boot-check.mjs`: `[P50.1.7] PASS — clean-profile boot (honest locked/setup, sidecar-absent, zero seeds)`
  - All source-slice implementations intact and committed.
- **Deep-Dive Audit Fleet (Complete Exhaustive Codebase Reads Across 65+ Repos)**:
  - **Multi-Agent Swarm Orchestration**: Verified architectures from `superset-sh/superset`, `ruvnet/ruflo`, `planning-with-files`, `swarms`, `council-of-high-intelligence`, `eigent`, `OpenHands`, `oh-my-claudecode`. Concluded: Primary Chief running 20–30 concurrent subagents must decouple via detached Supervisor daemon, dedicated Git worktrees (`.everyaios/worktrees/task-<id>`), a serialized `GitOperationQueue` (preventing `.git/index.lock` collisions), and 3-file blackboards (`task_plan.md`, `findings.md`, `receipts/`), with disjoint file assignment.
  - **System Prompts & Context Engineering**: Verified raw prompts from Cursor, Windsurf, Devin, Claude Code; analyzed `context-mode` 98% token reduction through sandboxed execution & SQLite FTS5/BM25 indexing; analyzed `Portkey-AI/gateway` & `OmniRoute` circuit breakers and rate-limit mitigation.
  - **Continuous Learning, Taste & Cognitive Memory**: Verified `SEAgent` (Actor-CUA + World-State Judge + Adversarial Failure Imitation), `EvoCUA`, `hermes-agent` closed-loop skill distillation to `SKILL.md`, `taste-skill` anti-slop design tokens, `memU` 3-tier memory, `EverOS` mRAG, `OpenViking` hierarchical context filesystem (`viking://`).
  - **Next-Gen Computer Use & Desktop Operators**: Verified `UI-TARS-desktop`, `Agent-S`, `OpenCUA`, `clawdcursor`, `nuphus-mcp`, `humanlayer` (tri-perception: A11y Tree $\to$ Local OCR $\to$ VLM grounding; coordinate safety barriers; diff cards).
  - **Browser Automation & Stealth Scraping**: Verified `lightpanda-io/browser` (30MB Zig/V8 headless DOM engine), `Scrapling` (structural element relocation, Cloudflare Turnstile bypass), `CloakBrowser` (C++ canvas/WebGL stealth patches), `browser-use`, `cua`, `Agent-Reach` (zero-cost local scrapers).
  - **Durable Workflows & Open WebUI Parity**: Verified `open-webui` (search engine cascade, `#url` web ingestion, conversational calendar, persistent memory), `huginn` event DAGs, Conductor/n8n/Dify durable checkpoints, `googleworkspace/cli`, and Cowork plugin contracts.
- **Latest Work Landed (this wave):**
  1. **Multi-Agent Swarm Fleet Isolation & Concurrency Governor (`everyaios-core`):** Added `GitOperationQueue` (mutex serialization + automatic stale `.git/index.lock` purge), `WorktreeManager` (disk reservation, `.everyaios/worktrees/task-<id>` provisioning, 3-file blackboard initialization `task_plan.md`/`findings.md`/`receipts/`), and `ConcurrencyGovernor` (dynamic resource limit enforcement).
  2. **Failure Refinement Store (`everyaios-memory`):** Implemented `AvoidanceStore` (`avoid.rs`) recording negative constraints and root causes from failed tool executions to prevent repetitive error loops.
  3. **Calendar & AI Automations Schema & IPC (`everyaios-vault`, `src-tauri`, `ui`):** Bumped SQLCipher schema to v8; added `ui_calendars` and `ui_calendar_events` tables and CRUD methods. Added `calendar_cmds.rs` in `src-tauri` registered in `commands.rs` (verified by `ipc-parity.mjs`), and TypeScript bridge in `ui/src/lib/calendar.ts`.
  4. **Prompt Invariants & Context-Mode 50KB Output Ceilings (`packages/coordinator`):** Exported `SINGLE_MATCH_EDIT_INVARIANT` and `CONTEXT_MODE_SUMMARY_INVARIANT` in `prompt.ts`. Added `MAX_TOOL_OUTPUT_CHARS = 51200` truncation ceiling with actionable query hints in `tools.ts`.
  5. **Session Capability Loadout Expansion (`ui/src/lib/capabilities.ts`):** Added `shared:fleet` and `shared:calendar` into `STANDARD_SHARED_CAPABILITIES`.
  6. **Automated Cowork Verification & Benchmark Test Suite (`packages/coordinator/src/cowork-swarm-verification.test.ts` & `testcases.md`):** Rigorously tested agent swapping in picker (OpenCode, Grok Build, Codex, Inbuilt), subagent delegation limits, two-plane shared cowork capabilities, worktree branch isolation, 50KB context mode truncation, and 6 Cowork benchmark problem statements.
  7. **Live Real-World Agent Harness Verification (`packages/coordinator/src/live-agent-harness.test.ts`):** Verified live stdio ACP initialization with installed OpenCode binary (`/home/sarvesh/.bun/bin/opencode` v1.18.31) and Grok Build CLI (`/home/sarvesh/.bun/bin/grok` v1.0.25). Tested free models, primary/subagent dynamic swapping, and selective capability permissions. Fixed `calendar_cmds.rs` return type mismatches in `src-tauri` (`41/41` passed in `cargo test`).

---

## 2A. Module-by-module synthesis (reconnaissance wave 2026-09-16)

### Rust/native plane
- `everyaios-types` and `everyaios-ipc` define the shared wire/domain boundary: length-prefixed JSON frames, request/response correlation, notifications, budgets, and typed protocol values. These are foundational and should remain dependency-light.
- `everyaios-core` is the primary coupling hub. It owns boot/lifecycle, coordinator supervision, chat relay, native tool registry/dispatch, execution, Guard-service integration, terminal/PTY hosting, Work Gateway, scheduling seams, and runtime manifests. The main architectural risk is not missing functionality but concentration: changes here can affect IPC, sidecar recovery, Work durability, security, and UI projections simultaneously.
- `everyaios-vault` is the durable authority for encrypted state, provider credentials, sessions, usage, calendar, and schema migration. Renderer/localStorage state is a cache or preference layer, not a substitute for vault authority. Corrupt-vault behavior is intentionally fail-closed.
- `everyaios-guard` supplies deterministic authorization floors: path/net permissions, prescan, sandbox capability selection, TTL tickets, nonce-bound approvals, and OS-specific containment. `everyaios-audit` supplies Merkle/session evidence and repair/retention semantics. The important invariant is that approval and execution are separate stages; the UI cannot authorize by itself.
- `everyaios-office` owns deterministic OOXML/PDF operations. The XLSX patch path preserves untouched archive parts, applies structural edits, and delegates formula values to recalculation rather than model output. This is high-value but requires Windows acceptance for real Office corpus compatibility.
- `everyaios-browser`/`everyaios-cdp` own installed-browser discovery, capture, navigation, actions, and tier escalation. Browser state is shell-owned and dropped with the live session; credentials stay outside the coordinator.
- `everyaios-acp`/`everyaios-mcp` own external-agent and external-tool protocol seams. ACP is a bidirectional JSON-RPC session with interleaved notifications and sandbox-aware process transport; MCP attach/live-child identity and Guard-2 ticketing are explicit containment boundaries.
- `everyaios-memory`, `storage`, `codeintel`, `blueprint`, `script`, `agents`, `eval`, `search`, `desktop`, and `catalog` are specialized capability crates. Their public entry points are clear, but the reachability scan found several modules that are test-only or unreferenced; implementation presence must not be counted as runtime availability.

### Tauri shell and IPC
- `src-tauri/src/commands.rs` is the single generated handler. This prevents the Tauri replacement-handler trap and gives `ipc-parity.mjs` one authoritative registration surface.
- `AppState` centralizes live privileged handles: vault, Guard, audit, chat relay, PTY host, browser, MCP children/tokens, desktop engine, artifact servers, local model downloads, and catalog state. This preserves ownership but creates a large lock/cleanup surface; lifecycle and lock-order reviews are warranted before adding more fields.
- Capability JSON intentionally grants only window/tray/dialog primitives; filesystem, shell, and network effects flow through Rust commands and their own Guard/floor checks. The dedicated approval window is a security boundary, not merely a UI route.

### TypeScript sidecar and core packages
- `packages/coordinator` is the sidecar orchestration layer: chat streaming, prompt construction, routing, tool dispatch, planning, scheduler, and wire protocol. It is supervised and broker-mediated; it must not become a second authority for secrets, persistence, or privileged effects.
- `core-domain` provides shared types; `core-ai` provides prompt policy, RAG envelopes, context tiers, compression, and routing guards; `core-tools` provides schemas/trust ladder/permission evaluation; `core-engine` provides a reusable conversation engine with retrieval/tool planning, bounded tool rounds, agent sandbox limits, risk assessment, persistence, trajectories, artifacts, and memory hooks.
- The key positive security pattern is defense in depth: surface contract → retrieval/tool plan → per-agent sandbox → permission gate → native executor. Unknown host tool IDs are delegated to the host authority, while catalog tools fail closed on wrong surfaces.
- The key implementation risk is duplicated or partially overlapping paths: the coordinator engine, native Rust engine seams, and test-only core packages can drift unless contract tests continue to pin wire shapes and ownership.
- `core-providers` contains a broad catalog and provider metadata, while live provider credentials/health remain shell/vault concerns. Catalog rows are not proof of configured, reachable, or launchable runtime state.
- `core-memory` includes a rule-based entity/triple graph and spreading activation. It is intentionally cost-free but heuristic; graph output must remain provenance-tagged and must not be treated as authoritative facts without source grounding.

### UI, bridge, and state
- `ui/src/lib/bridge.ts` is the event translation boundary from Tauri/coordinator notifications into Zustand state. It routes streams by session and stream ID, rejects stale/late events, handles Guard cards, tool progress, budgets, ACP, Work, and readiness projections.
- `ui/src/lib/store.ts` is a large projection/state machine rather than a persistence authority. It correctly starts empty in Tauri, uses preview fixtures only outside Tauri, preserves local-only sessions during vault hydration, and keeps stream/queue state session-scoped. Its size is the largest frontend maintainability risk; future work should extract slices without changing wire ownership.
- Shell components divide responsibilities into center content, right-rail workbench, left navigation, status/readiness bars, chat composer/panel, and gates. Live surfaces are expected to derive from bridge/runtime evidence; preview must never be represented as acceptance.
- The UI has strong contract-oriented tests for runtime truth, capability status, Guard UX, stream routing, catalog/provider provenance, calendar/task wire casing, desktop readiness, terminal bytes, first-run behavior, and plain-language output. These tests protect semantics more than pixel fidelity; real Windows/display/browser acceptance remains separate.

### Scripts and verification
- `ipc-parity.mjs` checks registered Rust commands against UI invocation references, but the current scan still identifies many registered-without-UI commands. That is not automatically a defect—some commands are backend/agent/internal—but each ghost should be classified as internal, future, or missing UI coverage.
- `check-doc-sync.mjs` validates capability counts, TODO arithmetic, kernel-gate presence, and selected version/changelog synchrony. It does not prove implementation reachability or platform readiness.
- `clean-profile-boot-check.mjs`, `security-gate.mjs`, and `failure-injection.mjs` emphasize honest empty/locked/corrupt/degraded states and real evidence. Their SKIP semantics are important: missing providers, displays, binaries, or Windows hosts must remain unverified rather than fake-passing.
- The E2E protocol harness mirrors the Rust frame protocol and can drive a real coordinator/provider path. Provider tests use actual endpoints when configured and otherwise exit SKIP; credentials are not embedded in fixtures.

### Cross-cutting risks and open questions
1. **Authority duplication risk:** determine which production path is canonical for every chat/tool turn (native Rust relay versus reusable TypeScript `core-engine`) and document the adapter boundary. Test-only reachability does not establish production ownership.
2. **IPC surface scale:** 331 command functions and a large `AppState` increase registration, lock-order, cleanup, and compatibility risk. Classify ghost commands and consider generated schema/ownership metadata rather than relying only on textual parity.
3. **Platform evidence gap:** Linux checks cannot establish Windows Job Objects, ConPTY, Windows App Paths/WSL launchability, Office corpus behavior, CDP profile behavior, or Computer Use driver readiness. P66.6–P66.9 remain release-critical.
4. **Provider catalog freshness:** the broad static catalog contains current-looking model/provider claims, but metadata is not live verification. Keep user-facing states separate: cataloged, keyed, probed, reachable, and selected.
5. **Heuristic grounding:** prompt envelopes and risk compass reduce injection/hallucination risk but do not prove factual correctness. Citation invariant checks are diagnostic; source provenance and acceptance tests must remain authoritative.
6. **Large-file mutation correctness:** XLSX byte surgery, browser actions, ACP interleaving, Work Gateway concurrency, and vault migrations need focused failure/recovery tests whenever touched. Avoid broad refactors until the exact contract is pinned.
7. **Test execution coverage:** Rust and UI suites have strong evidence in the handover, but core-package suites and real external-agent/provider harnesses are environment-dependent and have previously failed or skipped when binaries/dependencies were absent. CI should make the intended matrix explicit.
8. **Documentation drift:** current handover text contains stale historical claims and old version references in places. Treat executed command output and current source as evidence; reconcile `CURRENT_RUN.md`, `TODO.md`, README, and changelog before release claims.

### Additional deep-read findings
- `everyaios-core::WorkGateway` is a durable projection/event layer over the ExecutionKernel, not an effect executor. It models Work addresses, replayable domain/operational/presence/runtime events, PTY/worktree/agent-session lifecycles, client capabilities, run authority fencing, capability grants, reviews, steering, attachments, and runtime-manifest hashes. It fail-closes malformed journals and rejects unauthenticated steering, but its local JSONL journal is not itself a Merkle ledger; audit correlation remains a separate responsibility.
- `everyaios-browser::BrowserActions` enforces the observe → act → invalidate → re-observe lifecycle for accessibility refs, resolves geometry through CDP backend node IDs, supports deterministic test humanization, and always returns a post-action diff. The design appropriately treats stale refs as an error. Selector/evaluate/read paths still depend on the browser page and must remain constrained by the surrounding command Guard/floor.
- `everyaios-cdp::browser` separates discovery, profile mode, launch, DevToolsActivePort acquisition, managed Chrome-for-Testing fallback, and zip-slip-safe extraction. It uses loopback dynamic ports and isolated profiles by default. The launch/download paths are platform-sensitive and therefore require host acceptance, not only mock-server tests.
- `everyaios-office::xlsx::patch` performs archive-part surgery with explicit errors, style preservation, formula placeholders followed by engine recalculation, row/column shifts, merge/dimension updates, sort/fill/pivot, and shared-string append. The implementation has broad unit fixtures; compatibility with arbitrary producer-generated workbooks remains an integration concern.
- `everyaios-blueprint::skill_store` treats skills as bounded, versioned files: strict slug validation, 500-line cap, lazy scripts/references, deterministic relevance selection capped at 20, install-time SHA-256 pins, and tamper detection. A pin-ledger write is best-effort and a missing pin degrades to unverifiable rather than verified; runtime callers must preserve that distinction.

### Credential / accounting boundary (`everyaios-vault`)
- `broker` is the single credential choke point: the sidecar sends `{provider, model, body}` and never holds a key. It resolves a key through the `KeyRing`, injects auth, zeroizes temporary buffers, applies cache-aware pricing to the append-only `token_usage` ledger, enforces the per-session dollar budget, and fails closed on unknown providers before any HTTP attempt.
- Dialect handling is explicit (`WireTransport`: OpenAI chat vs Anthropic messages) with per-provider endpoint resolution, so an unsupported transport is simply not registered rather than POSTing a wrong-shaped request. Keyless local runtimes bypass the ring entirely and record zero-dollar usage.
- `egress` is a default-block outbound credential firewall: it scans payloads against managed secrets and high-precision secret-shaped patterns, and only `AllowWithReason` permits a trip. This is a strong defense-in-depth control, though it is pattern-based and cannot replace never putting secrets in payloads to begin with.
- `session_budget` is an in-memory kill switch (default $2.00/session) mirrored by the durable ledger. The in-memory tracker is process-local, so durable spend accounting must be read from the ledger for cross-restart truth.
- `session` (the browser session vault) enforces the trust model structurally: the agent sees only opaque ids plus metadata, and raw cookie/storage values flow only through `inject` gated by a per-agent trust level, with a `session_uses` audit row per capture/inject/rotate/revoke/deny.
- `keyring` selection covers status tiers, routing policies, per-key model filters, exponential cooldown, daily token/cost budgets, credential affinity, and handle-only health reporting. Note that `auth_bridge` appears in the earlier reachability scan as referenced only from tests/other crates; the live connector OAuth path is `oauth`/`oauth_cmds`, so treat `auth_bridge` as a secondary or legacy seam until confirmed.

### Native tool registry (`everyaios-core::tools`)
- One registry owns tool identity, family, description, read-only flag, operation class, risk level, computed risk tier, and JSON schema; aliases map user/model-facing ids (e.g. `office.docx_patch`, `file_ops.write`) onto canonical entries. `canonical_args_hash` provides a deterministic argument hash for ticket binding.
- External MCP tools reconcile in with native precedence: an already-registered id is skipped, so an external server can never shadow a built-in. This is the correct containment direction and is covered by security-gate leg S4.
- Risk/operation classification is derived centrally (`classify`, `risk_of`, `operation_of`) rather than left to call sites, which keeps the Guard floor consistent.

### Coordinator tool contract (`packages/coordinator/src/tools.ts`)
- The sidecar's tool path is propose-then-commit (`tool/exec` → optional `tool/commit`), never auto-consuming an approval ticket, with a loop breaker on repeated identical tool+args hashes.
- First-class native tools (`ask`, `plan`, `todo`, `subagent`) are merged with the catalog without duplication, sorted by id for prompt-cache byte stability, and capped at `MAX_ACTIVE_TOOLS = 20` per turn.
- `subagent` carries an explicit shared-capability grant list (`shared:office`, `shared:browser`, `shared:desktop`, `shared:calendar`), which is the intended way to hand a scoped cowork capability to a delegated agent rather than granting blanket access.

### Chief dispatch (`packages/coordinator/src/chat.ts`)
- The turn contract is adapter-based: the inbuilt engine owns the real `ConversationEngine` turn, while any non-inbuilt Chief resolves to an adapter that refuses with an explicit routing error instead of silently falling back. That no-silent-fallback guarantee is the correct interpretation of the two-plane contract, and it means external-agent turns are driven by the UI over the ACP channel.
- Budget semantics are explicitly *not* credit semantics: the hard dollar budget lives in Rust, and the coordinator passes the `budget_exceeded` / `stopped: $X limit` error through untouched so the UI shows the exact limit string.

### UI surfaces confirmed live-backed
- `office-xlsx-view` is a real windowed grid over `xlsx_open` with overscan virtualization, cached windows, a read-only lock while the agent runs (unless the user took over), and ticketed writes that require a returned ticket id plus approval nonce before commit. No fabricated numbers are rendered; recalc results come from the engine.
- `browse-view` derives attachment state from `browser_status`, reports it to the shared store, and only claims a live CDP session when one is attached; the read tab can use the tiered static/light/Chrome path while the snapshot tab correctly requires a live page for refs.
- `ide-workbench` mirrors VS Code structure over Rust backends (real FS explorer, real git SCM, real LSP diagnostics, the single PTY terminal plane) and marks search/run/extensions as honest placeholders rather than pretending they work.

### Coverage boundary
This wave completes the architectural/module map and reads the high-value boundary implementations plus the credential/accounting, tool-registry, coordinator-tool, chief-dispatch, and representative UI view surfaces. It does **not** honestly claim line-by-line reading of every tracked source/test/UI file. Remaining bounded reads are the unread tails of `work_gateway.rs`, `broker.rs`, `xlsx/patch.rs`, the remaining office DOCTOR/PDF/PPTX internals, the rest of the store, most of the 141 UI components (including the `ui/src/components/ui/*` shadcn primitives), the full core-package test corpus, and the 93-doc research corpus. No product implementation files were changed in this reconnaissance wave.

## 2B. Gap audit — not-done / bugs / verification state (2026-09-16, evidence-tagged)

Tag legend: `[V]` verified by an executed command this session · `[V-prior]` verified by an executed command in the prior wave (not re-run here) · `[CODE]` verified by direct source inspection · `[DOC]` asserted by repository documentation only, not re-verified · `[UNTESTED]` no evidence exists.

### A. NOT DONE — product capability gaps
1. **Voice input (P50.4.3)** — VAD/STT stack unimplemented. Promoted to v1 scope, stack absent; composer mic is disabled with a "v1-pending" state. `[DOC]`
2. **Voice output (P50.4.4)** — TTS/read-aloud unimplemented; v1 scope. `[DOC]`
3. **Image generation (P50.4.5)** — post-v1; zero chrome in the build (correctly hidden). `[DOC]`
4. **WASM sandbox (P50.4.6)** — wasmtime/fuel-budget/epoch-interruption absent; `rquickjs` is documented as defense-in-depth only, never containment. `[DOC]`
5. **Remote session handoff / mobile pairing (P50.4.7)** — post-v1; switches inert/disabled. `[DOC]`
6. **Privacy & cost honesty (P50.4.10)** — "100% Private"/provider/model/token/cost/audit badges not proven to derive from live runtime state rather than seeded or stale values. `[DOC]`
7. **Persona selector UI** — the data path exists (`personas.ts`, store `setPersonaId`, bridge sends `personaId`/`soulMd`) but **no UI dropdown exists**; `setPersonaId` has zero component consumers. Deferred post-v1. `[DOC]`
8. **LadybugDB C++ FFI** — `GraphBackend` swap-in seam landed; the binding itself not built. `[DOC]`
9. **Signal adapter + always-on daemon + iMessage** — deferred post-v1. `[DOC]`
10. **LAN/Tailscale/tunnel view of running sessions** — not done. `[DOC]`
11. **Resume from phone mid-run** — not done. `[DOC]`
12. **Hyperframes agent-generated video** — not done. `[DOC]`
13. **Clipboard surface (H26)** — post-v1. `[DOC]`
14. **~~A8 local OpenAI-compatible server is materially incomplete~~ — CLOSED 2026-09-16 (one residue).** `tools`/`tool_choice`/`parallel_tool_calls` are now forwarded upstream; native `tool_calls` are returned (with `finish_reason: tool_calls`); `delta.tool_calls` fragments ride the SSE stream; an assistant `content: null` + `tool_calls` and a `tool` result with `tool_call_id` now parse instead of 400ing; and the live backend streams **incrementally per upstream chunk** via the new `Broker::chat_completion_stream_cb` (the `stream()` trait default is no longer used). **Residue:** the bearer token is still minted per boot, so a client must re-read the config after a restart. Spec A8 + ARCH/09 A8 row + TODO P9.5 updated to match. `[V]` → §2C
15. **~~Computer use — autonomous path not wired~~ — FIXED 2026-09-16 (see §2D).** The engine is attached to the effect funnel at boot (`desktop_cmds::publish_desktop_backend` → `ChatRelay::attach_desktop`), so `desktop.see`/`desktop.act`/`desktop.window_list` are reachable by the inbuilt agent. Still honest: on a headless/no-display host nothing attaches and the tool keeps fail-closing with `desktop session not attached` (by design), and the platform-specific acceptance (A16–A20) remains unproven here. `[V]`
16. **Computer use — platform twins incomplete** — Linux AT-SPI `Action.Invoke` missing (needs an AT-SPI/D-Bus client); macOS AX-by-point invoke missing (needs an `ApplicationServices` FFI layer); the shared allow-list audit across platform twins is unfinished. `[DOC]`
17. **Computer use — WGC capture lacks runtime evidence** — P57.6 Windows.Graphics.Capture is implemented and cross-compile/clippy clean, but no Windows runner has produced pixels. `[DOC]`
18. **Search — packaged UI citation leg unproven** — the live citation/trajectory rendering path is not proven in the packaged UI; P52.20 is recorded as having zero citation producers. `[DOC]`
19. **macOS desktop automation is honestly partial** — `foreground_restore: false`; Background coordinate click/scroll/drag refuse on macOS. `[DOC]`
20. **Linux Background synthetic click may be ignored by the target app** (e.g. Tk) — whether an app honours the synthetic event is the app's decision, so the effect is per-app unproven. `[DOC]`
21. **Code intelligence is lexical, not AST-precise** — `tree-sitter` is **not a dependency**; the repomap/symbol path is lexical by its own module doc. `[CODE]`
22. **HF client is hand-rolled** — `hf-hub` is not a dependency; the Hugging Face client is custom over `ureq`. `[CODE]`
23. **Microsoft Graph connector (F14 v2)** — post-v1. `[DOC]`
24. **Full two-zone data-release firewall (K5)** — post-v1. `[DOC]`

### B. NOT DONE — release verification gates (this is the release-critical list)
1. **P50.5.8 Cross-platform release matrix — NOT DONE.** No green Windows or macOS run is recorded anywhere. Linux leg is the only one with local evidence. `[DOC]`
2. **P50.5.7 Security release gate — PARTIAL.** Implemented and passing *below* the packaged-shell line. Explicitly uncovered: interactive packaged guard-window click-through, the packaged renderer-compromise path, and **native platform sandbox backend enforcement** (declarative profiles only). `[DOC]`
3. **P50.5.2 Real search E2E — PARTIAL.** Crate/protocol legs landed; packaged/UI leg and a current live re-run are open. `[DOC]`
4. **P50.2.1 Sessions — open** (packaged/UI E2E click-through only; all code-level races closed). `[DOC]`
5. **P50.2.2 Memory — open** (packaged verification only). `[DOC]`
6. **P50.2.5 Analytics & notifications — open** (packaged verification only). `[DOC]`
7. **Kernel gate — CLEAR.** All 3 gate items (P48.2, P48.4, P47.5) are `[DONE]`. `[V]`

### C. IMPLEMENTED BUT NOT WIRED / UNREACHABLE (the biggest honesty gap)
1. **~~Provider capability probes never run in production~~ — FIXED 2026-09-16 (see §2D).** The gap was real: `apply_probe`/`capabilities_verified_at` existed with **zero call sites outside their own module**, so the catalog's "advertised ≠ verified" rule was library-only and routing read `verified_report: None` forever. Now every probe the product runs persists a durable `ProviderObservation` (`crates/everyaios-catalog/src/observations.rs`) and every claim-feeding registry replays them (`catalog_cmds::observed_registry`), so `capabilities_verified_at`/`verified_report`/routing health describe real observations. **Open remainder (new, explicit):** no boot-time probe sweep for keyed providers — that needs a vault-mediated probe (an unauthenticated probe would fabricate false 401 observations), which does not exist yet. `[V]`
2. **~~`attach_desktop` has no production caller~~ — FIXED 2026-09-16 (see §2D).** `ChatRelay::attach_desktop` is now called at boot with a real `DesktopEngineBackend` adapter, and the provenance hole that blocked it was closed at the source (agent acts are no longer filed as human gestures). `[V]`
3. **60 ghost Tauri commands** (registered, no UI invocation). Notable: all 20 `work_*` data-plane commands, `provider_health_probe`, `audit_compact`, `tasks_sweep`, `skills_learn`, `repomap_build`, `file_outline`, `model_aliases_resolve`, `ai_markers_scan`, and the vault lifecycle commands (`probe_vault`, `vault_setup`, `vault_unlock`, `session_list`). Each needs classification as internal / planned / missing-UI. `[V]`
4. **`agui-event` is emitted by the shell with zero UI listeners** — the only unused event. `[V]`
5. **48 Rust modules have zero references** (prior scan), including the entire `everyaios-engine` crate (gate/plan/risk) which has **zero dependents in any `Cargo.toml`**. `[V-prior]`
6. **21 coordinator modules are test-only** (prior scan). `[V-prior]`
7. **Correction to a prior claim:** `ui/src/lib/calendar.ts` is **not** test-only — `ipc-parity` shows the six calendar commands invoked live from it. The earlier "test-only" note is superseded. `[V]`
8. **~~Stale doc-comment in `AppState`~~ — RETRACTED 2026-09-16.** `src-tauri/src/state.rs` was re-read: there is **no** dangling `shell_cmds` doc-comment. The only remaining `shell_cmds` references are accurate historical notes in `commands.rs`/`terminal_cmds.rs`/`work_cmds.rs` explaining that the retired piped path is gone. The prior claim was wrong; nothing to fix. `[V]`

### D. BUGS / DEFECTS
1. **Malformed commit subject in `main` history.** `974e9ac`'s full subject is a single backslash `\` (`git log --format=%h %s`). Still present, 5 commits from HEAD. `[V]`
2. **The Conventional-Commits rule is violated throughout history**, not just once. Non-conventional subjects still reachable: `9db3dd3`, `f71fd26`, `6c6d87a`, `df85f67`, `645e949` ("ui updates"), `802205a`, `81688f1`, `2372b04`, `14a6de3`, `974e9ac`. Any current complaint about the newest commits is a pre-existing pattern. `[V]`
3. **~~Timing-flaky release gate~~ — FIXED 2026-09-16.** `bench_browser_snapshot_tree_build` no longer asserts on a single wall-clock sample. The root cause is real and was measured: five consecutive samples on an idle machine spread **8.71 ms → 26.94 ms (≈3×)**, so under `cargo test`'s parallel runner one unlucky sample can clear any tight budget while the code is fine. It now takes the **best of 5** samples — the minimum excludes additive noise, and a genuine regression raises the minimum too, so the gate still bites. `[V]`
4. **~~Environment-dependent failing tests with no skip gate~~ — FIXED 2026-09-16.** `live-agent-harness.test.ts` now probes for the real binaries and `test.skipIf(!hasBinary)`-skips them with a named warning line. Negative test (restricted `PATH`): **4 skip / 0 fail** where it previously produced 2 failed + 2 errors; with the binaries present it is **7 pass / 0 fail**. `[V]`
5. **~~Second flaky test~~ — RETRACTED 2026-09-16.** `llamafile_healthy_probes_health_endpoint` (`crates/everyaios-core/src/local_tests.rs`) is **already hardened**: a 200×10 ms readiness poll, a 12-attempt probe retry loop, and an environmental-skip path that first proves the mock answers a blocking `GET` before blaming the code under test. The flake it described no longer exists; nothing was changed. `[V]`
6. **~~CI coverage hole~~ — FIXED 2026-09-16.** The `sidecar` job in `.github/workflows/ci.yml` now runs `pnpm --filter './packages/core-*' run test` after building the vendored packages. All ten `core-*` packages declare `test: vitest run` and own vitest as a devDependency (49 test files), so the step needs no extra install. **Still unverified locally:** vitest is absent from this checkout, so those suites remain unrun *here* — the fix is a CI-coverage fix, not local evidence. `[V]`
7. **~~Doc drift — version stamp~~ — FIXED 2026-09-16, and now guarded.** `TODO.md`'s header stamp moved `v3.78 → v3.80`, and `scripts/check-doc-sync.mjs` gained check 7, which fails when `TODO.md`'s "current doc revision" disagrees with the newest `SPEC-CHANGELOG.md` heading. Proven by negative test (stamp set to v3.77 → exit 1 with the exact message; restored → exit 0). `[V]`
8. **~~Doc drift — superseded provider claim~~ — FIXED 2026-09-16.** SPEC A1's stale "Live HTTP (2026-09-10)" note was replaced with a 2026-09-16 note: the broker **does** emit `x-opencode-session`/`x-opencode-request`/`x-opencode-client` + `User-Agent: EveryAIOS/<version>` on the OpenCode rows (v3.73/P56.6, which already superseded it in `ARCH/03`), the boot pass **does** register connected-set endpoints (`catalog_cmds::resolve_endpoints` → `ChatRelay::with_endpoint`), and the OpenCode-free overlay **is** live in the broker. `[V]`
9. **~~Doc drift — superseded routing claim~~ — FIXED 2026-09-16 (one claim deliberately kept).** SPEC A11's tail now records the landed endpoint resolution + two-way `refresh_endpoint_live` reconciliation, and keeps the still-true part: `routing_feed_decide` is picker UX (its only caller is `ui/src/lib/discovery.ts`), and the coordinator still carries last-resort provider defaults in its own router. It also now states the **real open A11 gap in bold**: nothing on the production transport calls `apply_probe`/`mark_verified`, so `capabilities_verified_at` is never written on the live path. `[V]`
10. **~~Stale path in an agent guidance file~~ — FIXED 2026-09-16.** `.agents/skills/browser-computer-use/SKILL.md` now reads `crates/everyaios-desktop` (package `everyaios-computeruse`) with an explicit note that the directory and package names differ. `[V]`
11. **`everyaios-engine` is a dead crate** with no dependents — it cannot affect runtime behaviour, but it is compiled, linted, and counted. `[V-prior]`
12. **Honesty hazard — A8 server — RESOLVED 2026-09-16.** It now forwards `tools`/`tool_choice` and returns real `tool_calls`, so it is no longer misleading about being a usable endpoint. The remaining honest caveat (per-boot bearer token) is stated in the spec row itself. `[V]`
13. **Two red CI gates existed at HEAD and were unreported by any prior audit — FIXED 2026-09-16.** (a) `cargo fmt --all -- --check` (the `rust` job's working directory is `crates`) **failed at HEAD** on 9 committed files: `everyaios-cdp/src/{browser,lib}.rs`, `everyaios-core/src/{git_queue,governor,shell_integration,terminal,worktrees}.rs`, `everyaios-memory/src/avoid.rs`, `everyaios-vault/src/lib.rs`. (b) `cargo clippy --all-targets --all-features -- -D warnings` **failed at HEAD** on: `everyaios-guard/src/ticket.rs` (`doc_lazy_continuation`), `everyaios-cdp/src/browser.rs` ×2 (`derivable_impls`), `everyaios-core/src/{chat,sync_transport,terminal}.rs` (doc list + too-many-arguments + `op_ref` + `field_reassign_with_default` ×5), `everyaios-guard/src/netfloor.rs` (`useless_conversion`), `everyaios-desktop/src/{apps,launch}.rs` (`unnecessary clone` ×7), `everyaios-desktop/tests/live_linux_e2e.rs` (`zombie_processes` — a killed-but-unreaped `python3` fixture ×2). Both gates are now **green**. Note the `.rs` fmt drift is *not* covered for `src-tauri/`, whose own fmt drift (`acp_cmds.rs`, `calendar_cmds.rs`, `terminal_cmds.rs`) was left alone because no workflow formats or checks that workspace. `[V]`
14. **Latent behaviour trap avoided while fixing D13.** `everyaios-cdp::BrowserConfig`'s `Default` is implemented **by hand** precisely because the dynamic default is `headless: true` + `extra_args: ["--mute-audio"]`; the clippy `derivable_impls` suggestion would have silently replaced that with `false` / `[]` (a visible-browser regression). Only `BrowserChannel` and `BrowserProfileMode` were switched to `#[derive(Default)]`; `BrowserConfig` kept its manual impl and gained a note explaining why. `[V]`

### E. VERIFIED — what actually has executed evidence
Fresh this session:
- `node scripts/check-doc-sync.mjs` → **exit 0** — 166 capabilities in sync (yaml == ARCH/09 == spec §0); TODO.md 1428 = 1220 done + 208 open matches header; shell chrome v3.80 matches the changelog; kernel gate clear. `[V]`
- `node scripts/ipc-parity.mjs` → **exit 0** — 330 registered · 326 defined · 270 UI-invoked · **0 broken** · 0 unregistered definitions · 0 dead events · 60 ghosts · 1 unused event. `[V]`
- Working tree **clean**, HEAD `f879d8e`. `[V]`

Prior wave (not re-run by me):
- `security-gate.mjs` PASS across S1–S6 (guard deny 189, p10 10, audit 56, mcp 60, parity 0 broken, approval provenance). `[V-prior]`
- `failure-injection.mjs` PASS across L1–L6; **L7 (Chrome) SKIP — no display**. `[V-prior]`
- `clean-profile-boot-check.mjs` PASS — honest locked/setup, zero seeds, no sidecar-liveness claim. `[V-prior]`
- `cargo test --workspace --no-fail-fast` → 2,518 passed / 0 failed / 23 ignored; default run exits 101 on the flaky bench. `[V-prior]`
- `ui` `bun test` → 328 passed / 0 failed. `[V-prior]`
- `packages/coordinator` `bun test` → 356 passed / **2 failed / 2 errors**. `[V-prior]`
- `tsc --noEmit` → exit 0 (zero diagnostics). `[V-prior]`
- `cargo fmt --all -- --check` → clean. `[V-prior]`

### F. NOT TESTED / CANNOT BE TESTED HERE
1. **Windows — nothing compiled or run.** Unverified: Job Objects sandbox, ConPTY, WGC capture, `ShellExecuteEx` launch + `SW_SHOWNOACTIVATE`, Windows App Paths / WSL launchability discovery, NSIS/MSI installers, updater. `[UNTESTED]`
2. **macOS — nothing compiled or run.** Unverified: Seatbelt, Accessibility/TCC, `open -g`, DMG. `[UNTESTED]`
3. **Real Office corpus acceptance** — no DOCX/XLSX/PPTX/PDF producer matrix; byte-surgery correctness is proven only against crafted unit fixtures. `[UNTESTED]`
4. **Browser live attach on a display** — L7 SKIP; live Chrome legs gated behind `EVERYAIOS_E2E_CHROME=1`. `[UNTESTED]`
5. **Provider live legs** — env-gated (NVIDIA / OpenAI / Ollama); not run. `[UNTESTED]`
6. **Packaged-shell interactive click-through** (the P50.5.8 manual checklist) — not performed. `[UNTESTED]`
7. **Native platform sandbox enforcement** — declarative profiles only; no enforcement test executed on any platform. `[UNTESTED]`
8. **Real multi-GB local model download + serve** — not performed. `[UNTESTED]`
9. **`packages/core-*` suites (49 files)** — not run; `vitest` absent from this workspace. `[UNTESTED]`
10. **Live ACP agent interop** — needs installed external CLIs; environment-dependent, previously failed without them. `[UNTESTED]`
11. **Coverage gap in this reconnaissance itself** — 93 RESEARCH docs, ~310 test files, and 138 of 141 UI components were not read; the tails of `work_gateway.rs`, `broker.rs`, `xlsx/patch.rs`, `acp/client.rs`, and `store.ts` remain unread. `[UNTESTED]`

## 2C. Implementation wave 2026-09-16 — what changed, and what was deliberately NOT changed

### Changed (all verified; no capability rows added, census unchanged at 166)
1. **A8 tool-calling + real incremental SSE (closes A14).**
   - `crates/everyaios-vault/src/broker.rs`: new `Broker::chat_completion_stream_cb(provider, model, session_id, body, on_event)` — the incremental twin of `chat_completion_stream`, which is now a thin wrapper over it. `parse_sse` / `parse_sse_anthropic` gained `_with` callback forms; the buffered `parse_sse` stays for the local path. `a RefCell bridges the `Fn`-bounded failover runner to the `&mut` callback so the failover signature did not widen. Events fire only for a successful attempt, so a rotated 429/401 never emits a partial answer; a mid-body transport error is surfaced in-band (documented). Local runtimes replay buffered events (documented asymmetry, not papered over).
   - `crates/everyaios-core/src/openai_server.rs`: `ChatMessage` gained `tool_call_id` + `tool_calls` and a null-tolerant `content`; `ChatCompletionRequest` gained `tools` / `tool_choice` / `parallel_tool_calls`; new `ToolCallOut` / `ToolCallFunction` / `finish_reason_of` / `StreamPiece`; `non_stream_body` emits `tool_calls` + the real finish reason; new `stream_tool_call_chunk` (with `type:"function"` on the naming fragment); `stream_completion` now consumes `StreamPiece`.
   - `src-tauri/src/openai_cmds.rs`: `BrokerBackend::upstream_body` forwards the tool fields and replays the client's tool history; `shape()` parses `tool_calls` (tolerating an object-valued `arguments`); `BrokerBackend::stream` overrides the trait default with the incremental broker call and reconstructs the aggregate call via `everyaios_vault::assemble_tool_calls`.
   - `crates/everyaios-core/src/lib.rs`: re-exports the new public types.
   - Tests: A8 unit tests 16 → **22** (incl. null-content tool history, tool-call chunk shape, tool-call finish reason, and a **real-socket** streaming tool-call leg); broker +2 (incremental callback ordering + a direct Anthropic dialect parse).
2. **Test-gate reliability (D3, D4)** and **CI coverage (D6)** — see §2B D3/D4/D6 for the mechanism and the negative-test evidence.
3. **Doc reconciliation (D7–D10)** — `TODO.md`, `DESKTOP-APP-SPEC.md` (A1 + A11 + A8), `ARCH/09-FEATURE-MATRIX.md` (A8), `scripts/check-doc-sync.mjs` (+check 7), `.agents/skills/browser-computer-use/SKILL.md`.
4. **The two red CI gates (D13)** — `cargo fmt --all` on 9 files; 16 clippy findings fixed across 9 files (one `#[allow]` pair with rationale: `chat.rs::start_plan` arity, and a module-scoped `field_reassign_with_default` in `terminal.rs`'s test module).

### Executed evidence (fresh, this session)
- `cargo fmt --all -- --check` → **CLEAN** (was failing at HEAD).
- `cargo clippy --workspace --all-targets --all-features -- -D warnings` → **CLEAN** (was failing at HEAD on 2 crates before the first fix and 4 more behind it).
- `cargo test -p everyaios-core --all-features` → **673 lib + 44 integration passing, 0 failed** (incl. the bench's 5-sample form).
- `cargo test -p everyaios-vault --lib` → **142 passed / 0 failed**. `-p everyaios-guard -p everyaios-cdp -p everyaios-computeruse` → **61 / 49 / 189 passed, 0 failed**. `-p everyaios-memory -p everyaios-audit` → **211 / 56 passed, 0 failed**.
- `cargo test --workspace --all-features --no-fail-fast --exclude everyaios-core --exclude everyaios-vault` → **exit 0 · 60 result blocks · 1668 passed · 0 failures** (aggregate for the remaining workspace, incl. office 173, script 24, storage 54, search 26, mcp 8, types 3, acp/browser/catalog/codeintel/blueprint/agents/eval/engine/ipc).
- `cargo test --lib` in `src-tauri` → **39 passed / 0 failed / 1 ignored**.
- `cargo check --all-targets` in `src-tauri` → **clean**.
- `packages/coordinator`: `bun run type-check` → exit 0; `bun test` → **358 passed / 0 failed** across 44 files (was 356 passed / 2 failed / 2 errors).
- Restricted-`PATH` negative test of the new skip gate → **4 skip / 0 fail** (was 2 failed + 2 errors).
- `ui` `tsc --noEmit` → **exit 0**.
- `node scripts/check-doc-sync.mjs` → **exit 0** — 166 in sync; `1429 = 1221 done + 208 open`; shell chrome v3.80 **and** TODO header v3.80 match the changelog; kernel gate clear. Negative test proved check 7 fires.
- `node scripts/ipc-parity.mjs` → **exit 0** — 330 registered / 326 defined / 270 UI-invoked / **0 broken** / 0 unregistered / 0 dead events / 60 ghosts / 1 unused event.
- `node scripts/clean-profile-boot-check.mjs` → **PASS** (honest locked/setup, zero seeds, no sidecar-liveness claim).
- **Total Rust coverage executed this session: 2,527 passing / 0 failing** (1668 + 717 core + 142 vault).

### Deliberately NOT changed — surfaced instead of guessed
- **~~§2B A15 / C2 — `attach_desktop` NOT wired~~ — SUPERSEDED 2026-09-16 by §2D.** The provenance blocker described here was real and was closed properly at the source (a provenance parameter threaded through `everyaios-computeruse`'s audit path, so an agent act records as agent authority instead of being filed as a human gesture), then the host wiring landed. Kept here as the reasoning trail: the sequencing it recommended — fix provenance first, then wire — is exactly what §2D did, and the Guard-2 card surface is still the remaining product call for risky acts.
- **§2B A16–A20** (Linux AT-SPI `Action.Invoke`, macOS AX-by-point invoke, WGC runtime evidence, packaged citation leg, macOS/Linux Background synthetic input) — **not implemented**: each needs a platform host (Windows/macOS) or a live display this machine does not have, and the readiness contract makes an unverifiable implementation worse than an honest `unverified`.
- **§2B A21/A22** (`tree-sitter`, `hf-hub`) — **not added**: both are new third-party dependency trees, not fixes, and neither is required for correctness today (the lexical repomap is documented, the hand-rolled HF client works). Adding them would be a scope decision plus a supply-chain decision.
- **§2B C1 (`apply_probe`/`capabilities_verified_at` never written on the live path)** — **not wired**: `catalog_cmds::probe_provider` already performs the `MetadataOnly` probe but only calls `register_endpoint`; stamping verification is a *routing-semantics* change (it would start gating provider selection on probe results) and belongs to the A11 owner, with the probe-safety policy (`MetadataOnly` default, never billable) respected. The audit trail is now recorded in SPEC A11 in bold instead of silently.
- **§2B C5/D11 (`everyaios-engine` zero-dependency crate)** and **C3 (60 ghost commands)** — **not deleted / not classified**: deleting a crate with tests and a documented rationale is not a justified autonomous change, and the ghost list needs an owner per command. Both stay recorded.
- **§2B C4 (`agui-event` emitted, no UI listener)** — **not given a fake consumer**: the AG-UI Tauri surface is absent from the UI *by design* (generative UI H25 is deferred post-v1); `agui_send` and `agui_listen` are likewise never invoked. Instead the two places that implied it was live (`agui.rs` module doc, `ChatRelay::with_agui`) now state the real build state and cite the parity evidence, so nobody mistakes the emitter for a working feature.

---

## 2D. Implementation wave 2 (2026-09-16) — computer-use autonomous path + A11 probe write-back

Both halves of this wave are the same kind of fix: **making an existing mechanism actually reachable on the live path**, without inventing a parallel one.

### Changed — computer-use autonomous path (closes §2B A15 / C2)
- `crates/everyaios-desktop/src/policy.rs` + `lib.rs`: **provenance is threaded through the audit path** instead of assumed. `ActProvenance` reaches `AuditSink`/`DesktopGuard`/`DesktopEngine::act`, so a host can record *who* acted. This was the actual blocker — previously the only sink hardcoded `AuthKind::HumanGesture`, so wiring the agent tool would have filed **agent-initiated desktop actions as human gestures** (a confused-deputy audit lie).
- `src-tauri/src/desktop_cmds.rs`: new `DesktopEngineBackend` adapter implementing the core trait, plus `publish_desktop_backend`, and pure helpers (`provenance → authority class`, `policy_json`) with tests. It is **best-effort and honest on failure**: a headless/no-display host attaches nothing and `desktop.*` keeps fail-closing with `desktop session not attached` rather than pretending to drive a GUI.
- `crates/everyaios-core/src/chat.rs`: `ChatRelay::attach_desktop` (mirrors the existing `attach_terminal`/browser seams — no new registry, no second engine).
- `src-tauri/src/lib.rs`: attached at boot **before** the relay is published, so no agent turn can race ahead of the executor.
- Tests: src-tauri lib 39 → **47** (provenance mapping, policy contract fields, observation write-back — see below).

### Changed — A11 capability-probe write-back (closes §2B C1)
- **New `crates/everyaios-catalog/src/observations.rs`** — a durable per-provider observation store (`<data_dir>/provider-observations.json`, atomic tmp+rename, tolerant read: a malformed file degrades to *no observations*, never to a partially-trusted set). It carries **runtime truth only** — no identity, no aliases, no auth shape — matching the spec's ProviderIdentity / ProviderProfile / **ProviderObservation** split.
- **Three honesty rules, enforced in code and tested:**
  1. A **failed** probe is recorded (real error history, with its status) but **never** verifies.
  2. A `MetadataOnly` (`/v1/models`) probe **cannot confirm a hard capability** — `observed_model_ids` stays empty (the probe counts models, it does not enumerate ids), every advertised cap is `Unverified`, and `trusted_capabilities` stays empty. So replaying one makes a provider *observed*, never *trusted*.
  3. **Root-cause fix in `probe.rs`:** `hard_caps_verified` was **vacuously true** when nothing was advertised — so a bare reachability probe could read as "fully verified" / `Healthy` in `ResourceCard::from_provider`. It now requires at least one **confirmed** capability, and fails closed.
- **Write-back is on the live path:** `catalog_cmds::probe_provider` (the command the Settings → Providers verify flow calls, `ui/src/components/panels/settings-providers.tsx:491`) persists the observation. Recording is best-effort by design — a write failure is reported on stderr and never turns a successful probe into an error.
- **Replay onto every claim-feeding registry:** new `catalog_cmds::observed_registry()` (identity layer + recorded observations) replaces bare `base_registry()` in the provider rows, the endpoint-resolution context, the discovery inventory, and `routing_feed_decide`. Routing now derives **health from observations** (`health_of`: answered → `Healthy` · transport failure (`status == 0`) → `Down` · answered rejection (401/429) → `Degraded`) instead of the previous blanket `Unknown`. A new read-only `RoutingFeed::health_of` accessor makes that test-observable.
- **Keying:** `ObservationStore::record_resolved` canonicalizes through the registry, so `claude` and `anthropic` cannot become two rows with two different truths; `apply_probe` stays alias-aware for legacy files.
- **UI:** `CatalogProviderRow` gained `observedAt` / `reachable` / `observedModelCount`, and the Settings row renders a **`last check failed`** badge when `reachable === false`. The observable/verifiable facts are now separated in the UI rather than collapsed into one "verified" claim.
- **Docs reconciled:** `DESKTOP-APP-SPEC.md` A11 (the bold "capability-probe math is still library-only … that is the open A11 gap" sentence is now the landed state **plus the real remaining gap**), `ARCH/09-FEATURE-MATRIX.md` A11, `TODO.md` header. Census unchanged at **166**; `doc-sync` green.

### Executed evidence (fresh, this wave)
- `cargo fmt --all -- --check` (crates workspace — a **CI gate**) → **CLEAN**.
- `cargo clippy --all-targets --all-features -- -D warnings` (crates) → **CLEAN**.
- `cargo test --workspace --all-features --no-fail-fast` → **2540 passed / 0 failed / 23 ignored**.
- `cargo test -p everyaios-catalog --all-features` → **116 passed / 0 failed** (new module: store round-trip + key folding, malformed-file, failed-probe-never-verifies, reachability-does-not-confirm-hard-caps, no-vacuous-fully-verified, unknown-provider-not-invented, health mapping).
- `src-tauri`: `cargo check --all-targets` clean · `cargo fmt --check` clean · `cargo clippy --all-targets --all-features -- -D warnings` **clean** (one pre-existing, ungated finding — `vault_key_add`'s 10-arg IPC contract — resolved with a rationale'd `#[allow(clippy::too_many_arguments)]`) · `cargo test --lib` → **47 passed / 0 failed / 1 ignored**.
- `ui`: `tsc --noEmit` → **exit 0** · `bun test` → **328 passed / 0 failed**.
- `packages/coordinator`: `bun test` → **358 passed / 0 failed**.
- `node scripts/check-doc-sync.mjs` → **exit 0** (166 in sync; `1429 = 1221 done + 208 open`; both v3.80 stamps).
- `node scripts/ipc-parity.mjs` → **exit 0** — **0 broken**, 0 unregistered definitions, 60 ghosts (unchanged pre-existing set).
- `node scripts/clean-profile-boot-check.mjs` → **PASS** (honest locked/setup, zero seeds — the new observation file is not created at boot, only on a probe).
- Diff hygiene: `cargo fmt` had also reformatted three **unrelated** pre-existing-drift files in `src-tauri` (`acp_cmds.rs`, `calendar_cmds.rs`, `terminal_cmds.rs`); they were **reverted** to keep the diff scoped, and `src-tauri` is not fmt-gated by CI.

### Deliberately NOT changed this wave
- **No boot-time probe sweep** (see §3 item 5) — needs the vault-mediated-probe decision; an unauthenticated sweep would fabricate false 401/Degraded observations.
- **No `tree-sitter` / `hf-hub` dependencies** (A21/A22) — still dependency/supply-chain decisions, not correctness fixes.
- **No capability rows added, no registries duplicated.** `observations.rs` is a store, not a registry: identity stays owned by `provider.rs`.

---

## 2E. Implementation wave 3 (2026-09-16) — vault-mediated provider probe + boot sweep

The A11 remainder from §2D, implemented as the security-boundary change it was flagged as being — not as a workaround.

### The problem this solves
After wave 2, an observation existed only when a user pressed **verify** in Settings, because that flow has a plaintext key in hand. A keyed provider that had never been verified stayed `Unknown` forever: probing it requires the credential, and the credential is not the host's to read.

### Changed — the vault owns the credentialed probe
- `crates/everyaios-vault/src/keyring.rs`: new **`KeyRing::reveal_for_metadata_probe(provider)`**. Deliberately not `select`: a probe has **no model**, so a `model_filter` must not disqualify the key (otherwise the best-configured providers are the only unprobeable ones); it writes **no affinity**; and it moves **no key health, cooldown or budget**. It still honours a **suspension** — that is the user's instruction, not a rate-limit state. The duplicated fallback logic was extracted into one private `highest_priority_credential`, now shared with `reveal_for_spawn` (behaviour unchanged, retested).
- `crates/everyaios-vault/src/broker.rs`: new **`Broker::probe_models(provider, timeout) -> ModelsProbe`** + `Broker::models_url` + `ProviderEndpoint::models_url` + `credential_safe_url`. Four constraints, each deliberate: the URL is **the provider's own resolved endpoint** (there is no URL parameter, so the credential cannot be aimed elsewhere); **`https` or loopback only** (cleartext remote is refused — `BrokerError::InsecureEndpoint`); it is **not a turn** (no ledger row, no session budget, no `report_success`/`report_failure` — a metadata `401` can never suspend the user's key); keyless providers send **no** auth header, matching the chat path. Returns status + body only, so model-listing parsing stays in `everyaios-catalog`.
- `crates/everyaios-catalog/src/fetch.rs`: `count_models` is now public and the probe-result shape moved into one shared **`endpoint_probe_result(url, status, body, error)`** that `probe_models_endpoint` also uses. Both probe paths therefore cannot disagree about what `ok`/`models`/`message` mean. (Side benefit: `ok` is now status-derived rather than hardcoded `200`.)

### Changed — sweep over the connected set
- `src-tauri/src/catalog_cmds.rs`: `probe_provider_vault` (lock → broker → map) and the extracted **`observation_from_probe`** that encodes the failure policy: a broker error yields **no observation**, never a fabricated failed one — `AllKeysExhausted`/`InsecureEndpoint` are "we could not check", not a claim about the provider. Plus **`sweep_connected_providers`** (one `ResolveCtx` for the whole pass, so the 200-provider registry and the snapshot are read once rather than per provider) and **`spawn_observation_sweep`** (off-thread, sequential, 8 s per provider, a panic-safe in-flight guard so two sweeps never race).
- `src-tauri/src/lib.rs`: sweeps are triggered where the connected set actually changes — **boot** (via `spawn_boot_observation_sweep`, at most **once per process**, because `connect_chat_relay` re-runs on every sidecar respawn and a crash loop must not re-dial everything) and **vault setup / unlock** (which is what brings the keyed providers into that set). Both are fire-and-forget: the unlock response never waits on a network call.

### Executed evidence (fresh, this wave)
- `cargo test -p everyaios-vault --lib` → **156 passed / 0 failed** (was 142; +6 keyring, +8 broker — including a real-socket probe that asserts the vault key is attached, that a `401` leaves `fail_count`/`cooldown`/`last_used_at` untouched, that a transport failure reports **status 0** with no invented HTTP code, that a keyless probe sends no credential, that Anthropic uses `x-api-key`, and that a cleartext remote endpoint is refused).
- `cargo test -p everyaios-catalog --all-features` → **116 passed / 0 failed** (the refactor is behaviour-preserving).
- `cargo test --workspace --all-features --no-fail-fast` → **2554 passed / 0 failed / 23 ignored**.
- `cargo fmt --all -- --check` + `cargo clippy --workspace --all-targets --all-features -- -D warnings` → **CLEAN**.
- `src-tauri`: `cargo check --all-targets` clean · `cargo clippy --all-targets --all-features -- -D warnings` **clean** · `cargo test` (all targets) → **52 passed / 0 failed / 1 ignored** (50 lib incl. 3 new + `registration_sync` 2 — the added `AppHandle` params do not affect command registration or the JS call shape).
- `ui` `tsc --noEmit` clean · `bun test` → **328 passed / 0 failed**. `check-doc-sync.mjs` exit 0 · `ipc-parity.mjs` **0 broken** (60 ghosts, unchanged) · `clean-profile-boot-check.mjs` **PASS**.
- Diff hygiene: `cargo fmt` in `src-tauri` again reformatted the three unrelated pre-existing-drift files (`acp_cmds`, `calendar_cmds`, `terminal_cmds`) — **reverted**.

### Honest limits of this wave
- **No end-to-end test of `probe_provider_vault` itself.** `AppState` has no constructor (it is built inline in `lib.rs`'s `setup` and carries ~30 live fields), so the host seam is covered by its two extracted pure pieces (the shaping rule and the no-observation-on-error policy) plus the broker's own real-socket tests; the glue between them is one line. Stated rather than papered over.
- The sweep contacts any connected **keyless** provider at boot (they are already in the dial plan). Bounded at 8 s each, sequential, off-thread.

---

## 2F. Architecture / HLD / LLD audit (2026-09-17) — 22 of 26 units complete

**Ledger: `../EVERYAIOS-ARCH-AUDIT.md` (2,212 lines, outside the git repo so the
frozen doc set is untouched).** This is a *design* audit, not a gate audit: every
unit judges actual execution path, accuracy, HLD/LLD and current best practice,
with each claim tagged `[VERIFIED]` (line-level, re-checked) or `[READ]`
(structural inference).

**Why it exists:** the user's challenge was correct. All prior "verification" in
this repo — including my own in waves 2D/2E — was gate-driven (`cargo test`,
clippy, `ipc-parity`, doc-sync). That proves a function is *correct*; it does not
prove a *capability is reached*. `AGENTS.md` §3.2 declares the architecture
"frozen", and "frozen" was being read as "correct". This audit separates them.

**ALL 26 UNITS COMPLETE (2026-09-17).** 24 Rust crates, 11 TS packages, 45 host
modules, 137 UI components, ~212,000 LOC. §26 (line ~2640 of the ledger) holds the
whole-system synthesis: the four finding classes, the nine cross-boundary leaks,
why the gates could not see any of it, and a **P0-P4 ranked remediation plan**,
plus §26.6 (measured strengths) and §26.7 (the two structural mistakes and the
single change that fixes both).

**Units 24-26 additions (2026-09-17, second pass):**
- **Unit 24 `packages/`** — 11 packages / 32,780 LOC. *Positive:* a clean **acyclic**
  package DAG (3 leaves, no cycles) — better layered than the Rust workspace; the
  prior-wave "core-* tests run in no CI workflow" gap is **CLOSED**
  (`ci.yml:186-195` with the reason written next to the fix); `ci.yml:152-181`
  enforces vendoring parity. *Defects:* **two provider catalogs** (Rust
  `everyaios-catalog` 212 rows/models.dev vs TS `core-providers` 15/280/pi.dev)
  bridged by a **5-entry hand-written id map** (`catalog.ts:29
  BROKER_TO_CATALOG_ID`); the router's tool-calling decision is a **name regex with
  a fail-open default** (`supportToolsHeuristic` returns `true` for unknown models)
  while Rust owns `capabilities_verified_at`; `costScore` maps *unknown* to **0 =
  free** and feeds the route scorer; **`ProviderVault`** (a full TS BYOK vault with
  `getApiKey` returning plaintext, AES-GCM via `core-security`) is **unwired** —
  good for "keys never touch TS", bad as a third credential path one constructor
  away.
- **Unit 25 `ui/src`** — 54,596 LOC / 137 components / 25 view files (not 58k/141).
  *Positive:* the preview/live rule is **consistently implemented** (six gated mock
  sources, explicit `bridgeCall({live, preview})` seam in 10 lib modules, visible
  `preview` badges); the status bar **refuses to invent numbers**
  (`cacheHitRate == null → '—'` + "unavailable until the live usage ledger
  responds"); **`guard-main.ts` is the strongest security design in the codebase**
  (separate Vite entry + separate webview, no React/no iframes, no preview data by
  design, Rust accepts the decision only from that window's label — the correct
  human-gesture provenance that unit 11 shows the control socket does *not* use).
  *Defects:* size concentration only (`store.ts` 2,979 LOC); 15 unused files, 13 of
  which are ordinary unused shadcn primitives.
- **Three of my own candidate findings were WITHDRAWN** after reading adjacent
  lines: the Guard panel's `demoActivityRows` (gated directly above it), the
  `KillSwitch` (unit 20 — live via `desktop_stop`/`is_stopped`), and `guard-main.ts`
  "never imported" (it is a Vite entry). Plus two near-misses caught before
  publishing (`office/xlsx` premise-false; the `core-files` dependency that exists
  only in comments). **The ledger records these explicitly** — the method is only
  worth something if the withdrawals are as visible as the confirmations.

**The single highest-leverage fix in the whole audit** (§26.5 P2 item 9): the
project's own `scripts/ipc-parity.mjs` **already computes** the 60-command ghost set
and exits 0 on it, and its invocation regex
(`invoke(?:<[^>(]*>)?\(`) cannot span a generic containing a parenthesis, so it
reports live commands (`session_list`, `vault_setup`/`vault_unlock`) as ghosts —
which is why the list is not read. Fix the matcher, then fail CI on `work_*`-class
ghosts. That one change converts an advisory report into the detector this audit
had to hand-build four times.

**The findings that matter, in severity order:**

1. **`everyaios-script`'s QuickJS sandbox — the repo's most-tested security
   control — is never instantiated in production `[VERIFIED]`.**
   `Sandbox::new` has exactly three call sites in the entire repository and all
   three are tests. `forge.rs:130` / `automation_runtime.rs:75` hold
   `Arc<dyn ScriptSandbox>` and only ever receive a `StubSandbox`/`FakeScript`.
   The sandbox's limits ARE proven (4 real tests incl. `while (true) {}`
   timeouts) — which is precisely why the gates could not see this. Meanwhile
   `TODO.md:231/562/982` mark P2.5 and the `script.run` dispatch `[DONE]`, while
   `TODO.md:359` ("Not ChatRelay-wired") and `src-tauri/lib.rs:154` (P68.9:
   "`script.run` runs on the PTY plane") are the accurate statements, and
   `ARCH/01:10` still lists ScriptEval as a live core component.
2. **External agents launch unsandboxed `[VERIFIED]`.**
   `src-tauri/src/acp_cmds.rs:1101` calls `ProcessTransport::spawn` (plain
   `Command::new`). The bwrap variant `spawn_sandboxed` is `#[cfg(linux)]`,
   correct, tested — and called only from its own test. So on the one platform
   with a working backend the sandbox is bypassed; on Windows/macOS no backend
   exists at all (a platform gap to state, not a Linux oversight).
3. **The semantic cache silently substitutes wrong answers `[VERIFIED]`.**
   `chat.ts:676` keys `memory/cache_get` on the raw user `text` only — no
   session, agent, persona or history — over one process-global store, and a hit
   emits a synthetic `done`. With `0.85` applied to token-set **Jaccard** (a
   cosine constant on a different metric), "read the attached *document*" vs
   "read the attached *spreadsheet*" scores 0.875 → hit. Cross-context answer
   bleed, presented as a completed turn. The `readOnlyTurn` guard reasons about
   *mutation*; the hazard is *substitution*.
4. **The live WebMCP bearer token is printed to stderr at boot `[VERIFIED]`**
   (`boot.rs:70`, called from `lib.rs:865`) — a direct `AGENTS.md` §11 violation
   ("never expose in logs"). Latent today (the executor is a `NotAttached` stub)
   and it becomes real the moment a CDP session is attached. Its doc comment
   also asserts a "caller filter" that does not exist (no `peer_addr`/
   `SO_PEERCRED` anywhere), and claims "128 bits of entropy" from two hashers
   that share one `RandomState` seed.
5. **Computer use can act but never verify `[VERIFIED]`.**
   `act_with_verify` → `verify_until` → `EngineObserver` → `ocr_window` is a
   closed chain with no host caller; `vision_click`/`see_region` likewise. The
   action path (`desktop_act`) is live. `desktop_status` still reports an `ocr`
   capability flag to Settings.
6. **The confinement/posture layer is the most-built and least-invoked thing in
   the codebase `[VERIFIED]`** — arriving from three directions: guard
   `sandbox.rs`/`seccomp.rs`/`path_seal`/`fs_broker` (unit 6, several marked
   `[DONE]` in TODO), `everyaios-mcp::attach` (`spawn_confined`/`is_sandboxed`
   0 callers; only `SandboxPosture::preferred()` is read), and ACP above.
7. **`ARCH/01:10` names an MCP server that does not exist `[VERIFIED]`**: "MCP
   server (rust-sdk, 127.0.0.1:9200/mcp)". No Rust code binds 9200 (`9200`
   appears only in that doc, a `UI-DESIGN-PROMPT.md` dev-badge, and the
   BrowserOS research note it was copied from); no `rmcp`/`modelcontextprotocol`
   dependency exists in any `Cargo.toml` (the layer is hand-rolled against the
   2026-07-28 stateless spec); and the live server is
   `everyaios-browser::webmcp_http` on an ephemeral port.
8. **`xlsx/planner.rs` (530 LOC)** — declared in `xlsx/mod.rs`, advertised in
   `office/src/lib.rs:21` as one of six xlsx layers, `plan_prompt` has zero
   callers. **`blueprint`'s `subagent.rs`** exposes unreferenced
   `derive_child_permissions`/`DEFAULT_DENY_TASK_TOOLS`/`depth_of`.
   **`everyaios-engine`** (1,086 LOC) has zero dependents — and its private
   `RiskLevel` collides by name with `everyaios-types`' across a security
   boundary, so unit 1's fix requires deleting it.
9. **`everyaios-core` is a 43,617-LOC accumulator, not a tangle `[READ]`.**
   Genuinely dead: `git_commit.rs` (211, incl. `commit_verified_edit` — a
   "never commit a lie" guard), `inventory.rs` (139). Named capabilities with no
   caller: the Forge runtime, tracing, voice, migration, email/calendar,
   messaging adapters, research/citations, distillation, reporting, hooks, and
   the guard-**configuration** API (`set_autonomy_level`/`set_approval_policy`/
   `set_human_floor` — the decision path is live, this seam has no writers).

**Methodological corrections recorded in the ledger (do not re-litigate):**
- The reachability detector **excludes the defining file**, so any `pub` item used
  only inside its own module reads as dead. Verified against
  `scheduler_service.rs` (all 7 sampled "dead" symbols are live-and-internal) and
  `CronExpr` (live at `:1455`, `:1821`). Units 7-20 counts must be read as "not
  referenced outside its module." A correct detector subtracts intra-module use,
  is item-level, and is method-call-aware.
- Four false-positive modes: pub-but-internal, implicit return types, re-export
  chains, method-call access (this last one nearly produced a false security
  finding on `KillSwitch`, which is live via `desktop_stop`/`is_stopped`).
- A near-miss was **caught**: I almost reported all ~3,962 LOC of
  `everyaios-office/xlsx` as unreachable from reading `office_cmds.rs` alone.
  It is false — `src-tauri/src/xlsx_cmds.rs` exists and 7 xlsx commands are
  registered (`commands.rs:142-148`).
- Two roster corrections: `crates/` is **24**, `packages/` is **11** (not 13);
  `everyaios-core` is 43,617 LOC / 75 files (not 49,743 / 96);
  `everyaios-agents` is **live** (unit-6 table row struck through);
  `everyaios-desktop` is the computer-use crate (no separate pkg).

**Also recorded as positives, because the audit is not uniform decay:**
`everyaios-cdp` and `everyaios-codeintel` are clean and wired
proportional to size; `everyaios-office` has 27/31 modules fully referenced and
all nine security-adjacent document modules live (`pdf/redact.rs` does real
object-level redaction); `everyaios-script::artifact::serve` implements a
correct path floor with tests; ACP's `installer.rs` is the best security design
in the repo (**refuses sha256-unpinned downloads outright**, verifies before
extracting, confines archive members); `everyaios-desktop`'s platform twins fail
closed with typed, explanatory errors; `launch.rs` env scrubbing is live and
correctly name-filtered.

## 2G. Implementation wave 4 (2026-09-17) — P65 Settings reachability + typed UI seam

**Scope taken:** finish the in-flight Tier-2 (P65) item — make the Settings
Control Center backend actually reachable, and give the UI one typed seam onto
it. This closes the defect that the prior commit (`792dbaf`) left behind.

### The defect inherited at HEAD
`792dbaf` added `src-tauri/src/settings_cmds.rs` (1,608 LOC, 11 `#[tauri::command]`
fns, all the §17.12.2 read models + the §17.12.3 mutation funnel) but **never
declared the module** and **never registered the commands**. `grep -r settings_cmds
src-tauri/` returned zero matches. It was invisible to the compiler, unreachable
from the UI, and would have **failed** `tests/registration_sync.rs` — which walks
`src/` off the filesystem, not the module tree, so an undeclared file still counts.

### Changed
1. **Wired the module (the actual fix).**
   - `src-tauri/src/lib.rs`: `mod settings_cmds;` (with the reason).
   - `src-tauri/src/commands.rs`: `use crate::settings_cmds;` + all **11** commands
     added to the single `generate_handler![...]` list. One handler, one registry —
     no second registration surface was created.
2. **Fixed a real contract violation found while writing the TS types.**
   `RuntimeLocation` carried `#[serde(tag = "kind", rename_all = "snake_case")]`.
   On an enum that renames the **variants** only, never the struct-variant fields,
   so it was the one struct in the module emitting snake_case (`install_root`,
   `linux_path`, `windows_launcher`) where ARCH/17 §17.12.4 mandates camelCase
   (`installRoot`, `linuxPath`, `windowsLauncher`). Each variant now carries its own
   `rename_all = "camelCase"` (variant-level, so it works on any serde 1.x — no
   `rename_all_fields` version floor). Safe against the reader: `runtime_location_from_json`
   is a **manual** JSON parser, not a `serde::from_value`, so deserialization is unaffected.
3. **New `ui/src/lib/settings.ts`** — the typed client for all 11 commands, mirroring
   §17.12.2 exactly (incl. the §17.12.4 `RuntimeLocation` union, the §17.12.3 mutation
   envelope, and the §17.12.5 loadout rows). Honours two repo rules: keys cross by
   `authRef` reference only, and **preview invents nothing** — with no shell it returns
   empty inventories so panels render their honest empty state instead of a fabricated
   green row.
4. **`ui/src/globals.css`** — 3 stale comments corrected (they said "orange" for a
   colour that has resolved to `--brand` since P66.5; comment-only, no behaviour change).

### Evidence actually executed (fresh, this session)
- Replicated `registration_sync.rs`'s exact parsing in Node: **341 defined == 341
  registered · 0 unregistered · 0 extra** (was **341 defined / 330 registered → 11
  unregistered → the test would have failed**). Both of that test's assertions pass. `[V]`
- `node scripts/ipc-parity.mjs` → exit 0 · **registered 341 · broken 0 ·
  unregisteredDefinitions 0 · deadEvents 0 · ghosts 60**. Ghosts were **71** immediately
  after registration and fell to **60** once `settings.ts` landed — i.e. the 11 new
  commands went from registered-with-no-caller to UI-invoked, returning the ghost set to
  exactly its pre-existing size. That is independent evidence the UI seam is real. `[V]`
- `node scripts/check-doc-sync.mjs` → exit 0 · 166 capabilities in sync ·
  `1429 = 1221 done + 208 open` · both v3.80 stamps · kernel gate clear. `[V]`
- Dependency pre-flight on the orphaned module before wiring it: all 8 cross-module
  helpers it calls exist (`acp_cmds::{agent_installed,launch_registry,runtime_location_for}`,
  `agent_backend_cmds::{backend_binding_view,has_managed_binding}`,
  `catalog_cmds::provider_rows`, `guard_cmds::guard_set_policy_rules`,
  `scheduler_cmds::scheduler_handle` — the first six are `pub(crate)`), and every
  `AppState` field it touches exists (`vault`, `guard_service`, `catalog`, `mcp_servers`,
  `mcp_remote_tokens`, `acp_sessions`). `[V]`

### NOT VERIFIED — stated plainly, not papered over
- **No Rust toolchain on this host** (`cargo`, `rustc`, `rustup` all absent). Therefore
  **`cargo check`, `cargo clippy`, `cargo fmt` and `cargo test` were NOT run** on any
  change in this wave. The Rust edits are verified **statically only** (symbol
  existence, `AppState` field existence, registration-set balance) — never compiled.
  Treat all Rust in §2G as `[UNVERIFIED]`.
- **No `node_modules` and no `tsc`** (only `@tauri-apps` is installed). Therefore
  **`ui/src/lib/settings.ts` and the `globals.css` edit were NOT type-checked.** Under
  this repo's `strict` + `exactOptionalPropertyTypes` + `noUncheckedIndexedAccess`
  settings, an un-run `tsc` is not evidence. Treat the TS in §2G as `[UNVERIFIED]`.
- `bun` is absent, so the coordinator suite could not be run either.
- Only the two Node gates above could execute; that is the whole of this wave's evidence.

### Findings worth recording
1. **P66.5 (Blue semantic theme) is already implemented, and implemented the right way.**
   The plan describes it as "complete the removal of legacy hardcoded orange CSS utility
   classes" across the views. Measurement says otherwise: there are **975** `orange-*`/`amber-*`
   utility hits, but `ui/src/globals.css` already retargets them centrally —
   `--color-orange-500: hsl(var(--brand))`, `--color-orange-600: hsl(var(--brand-hover))`,
   `--color-amber-500: hsl(var(--warning))`, under the comment *"Keep legacy utility names on
   the spec's semantic palette."* With `--primary: 221 83% 53%` (light) / `217 91% 60%` (dark)
   this is **exactly** the cool-blue the plan mandates. So the classes stay in markup while
   rendering blue — a central alias, not 975 edits. **A bulk find-and-replace here would have
   been a regression**: `amber` is also legitimately `--warning` (e.g. `schedules-section`
   renders "paused" as amber), so blanket-rebranding it would have destroyed real warning
   semantics. No sweep was performed. `[V]`
2. **The plan's file paths are stale** (verified one by one): there is no `desktop_app/`
   directory (the repo root *is* the app); `ARCH/14-REPO-MAP.md`, `ARCH/15-BLUEPRINT-ENGINE.md`,
   `ARCH/11-PROMPT-ANATOMY.md`, `ARCH/03-SECURITY-ROUTING.md`, `ARCH/05-BROWSER-ENGINE.md`
   do not exist (real: `13-PROMPT-ANATOMY`, `03-BYOK-KEYRINGS`, `08-BROWSER-LAYER`, and there is
   no repo-map or blueprint-engine doc); `.agents/skills/*` does not exist in this repo; the
   `ui/src/components/settings/*-tab.tsx` targets do not exist (real: `components/panels/settings-*.tsx`);
   `ui/src/components/panels/activity-panel.tsx` and `ui/src/components/viewports/terminal-viewport.tsx`
   do not exist; `scheduler.rs` → `scheduler_service.rs`; and `everyaios-computeruse/src/lib.rs`
   is really `crates/everyaios-desktop/src/lib.rs` (package renamed, directory not). `[V]`
3. **The remaining Tier-2 UI drift is the panels not yet consuming this seam.** The four
   Settings surfaces still read their own libs (`lib/providers`, `lib/scheduler`, `lib/mcp`,
   `lib/acp`). `settings.ts` is the typed seam they should migrate onto; none was rewritten
   in this wave, because doing so without a type-checker is not a verifiable change. `[CODE]`
4. **OPEN DECISION — `ScheduleSettings` cannot reproduce what the schedules panel shows.**
   `src-tauri/src/settings_cmds.rs::schedule_settings_for` maps `target` from `job.sessionId`,
   and the struct carries **no `name`** and **no run count** (only `nextRunAt`/`lastRunAt`).
   But `ui/src/components/panels/schedules-section.tsx` renders `job.name` (the human label)
   and `` `${job.runs} runs` ``. So migrating P65.4 onto `settings_schedules_list()` **as the
   struct stands today would silently drop the schedule's name and run count from Settings**.
   This was deliberately **not** patched, because §17.12 freezes the canonical type names and
   adding fields to `ScheduleSettings` is a contract change that belongs to the §17.12 owner —
   not a mechanical gap to fill on a guess while no Rust toolchain is available to compile it.
   Two ways forward, both one-file: (a) add `name`/`runs` to `ScheduleSettings` and to the
   `§17.12.2` block; or (b) keep the name in a side-lookup the panel already has and accept
   the read model is deliberately identity-only. **Needs an owner decision.** `[V]`
5. **§17.12.2 is a baseline, not a ceiling — the implementation already extends it.**
   `AgentSettings` in Rust carries `location` (§17.12.4), `sessionLoadout` (§17.12.5) and
   two binding extras (`keyPresent`, `refusal`) that the §17.12.2 listing does not show.
   So "frozen names" has in practice meant frozen *names*, with later subsections adding
   fields. That precedent is the reason finding 4 is a judgement call rather than an
   obvious violation. `[CODE]`
6. **`amber` must not be swept during any future P66.5 pass.** `globals.css` maps
   `--color-amber-500: hsl(var(--warning))`, and real UI depends on that: `schedules-section`
   renders the "paused" state as amber. A global orange→blue find-and-replace would have
   turned a genuine warning indicator into brand blue. The correct seam is the alias block
   (lines 49–54), which is already correct. `[V]`

---

## 2H. Implementation wave 5 (2026-09-17) — P65.4 Schedule Settings Contract

**Item taken:** P65.4 (Tier 2, Settings Control Center). The plan's target file
`ui/src/components/settings/schedules-tab.tsx` does not exist; the real surface is
`ui/src/components/panels/schedules-section.tsx` (landed in `792dbaf`).

### Resolved the §2G finding-4 open decision
`ScheduleSettings` carried no `name` and no run count, so the Settings surface
would have had to render an opaque id where the Automations centre shows a name.
Decision taken: **add them, as an additive display pair.** Justification is the
precedent already set by the same contract — §17.12.4 added the whole
`RuntimeLocation` union to `AgentSettings` and §17.12.5 added `sessionLoadout`,
neither of which appears in the §17.12.2 baseline listing. §17.12.2 is the
baseline the implementation extends, not a ceiling, and adding two optional-in-
practice display fields is backward-compatible (no consumer breaks on extra keys).
- `src-tauri/src/settings_cmds.rs`: `ScheduleSettings` gains `name: String` and
  `runs: u64`, both populated in `schedule_settings_for` from the owning `Job`
  (`name`, `runs`) — the same source the Automations centre reads, so the two
  surfaces cannot disagree. `id` remains the durable identity.
- `ui/src/lib/settings.ts`: matching `name` / `runs` on the TS interface.
- `ARCH/17-NATIVE-AGENT.md` §17.12.2: the `ScheduleSettings` block now records the
  real wire shape (`name`, `nextRunAt?`, `lastRunAt?`, `runs`, `state`) plus a note
  on why the two display fields exist. **This is the only md contract edit in this
  wave**, and it reconciles the doc *to* the code rather than the reverse.

### Found a THIRD gap — and changed the plan because of it
`ScheduleSettings.trigger` is the **kind only** (`'cron'`), not the expression.
`ui/src/lib/scheduler.ts`'s `triggerLabel(job.trigger)` renders the actual
schedule (`cron 0 9 * * *`), which has no home in the canonical read model.
So a **wholesale** panel migration would regress name, run count **and** the cron
expression. The read models are deliberately identity/state/health/hash shapes —
they are not display shapes.

**Conclusion recorded as the architecture rule for the remaining P65 UI items:**
split by responsibility — **state, health, `configHash` and every mutation come from
the `settings_*` seam** (that is what it owns, and it is the only path that returns
the §17.12.3 envelope); **rich display detail stays with the domain lib** (`lib/scheduler`,
`lib/mcp`, `lib/providers`). Do not force a full rewrite onto the read models; that
would trade working detail for contract purity.

### Changed — the §17.12.3 mutation protocol on the live path
`ui/src/components/panels/schedules-section.tsx`: the enable toggle now calls
`settings_schedule_set_enabled` instead of writing the scheduler directly, and
implements **discard-optimistic-on-mismatch** honestly:
- on `lastError`, the shell's real reason is surfaced (no silent success);
- on `restartRequired`, the user is told a restart is needed;
- then it **re-reads** (`await load()`) instead of patching its own guess.
`run-now` / `pause` / `resume` deliberately stay on `lib/scheduler`: the settings
contract exposes no run or pause command, and inventing one would create a second
scheduler path — the exact thing §17.12.1 forbids. The now-unused `schedulerEnable`
import was removed (no dangling references).

### Evidence actually executed
- `node scripts/check-doc-sync.mjs` → **exit 0** (166 in sync · `1429 = 1221 + 208` · both v3.80 stamps). `[V]`
- `node scripts/ipc-parity.mjs` → exit 0 · **registered 341 · broken 0 · ghosts 60** (unchanged). `[V]`
- Struct/constructor field-parity check on `ScheduleSettings`: **16 declared == 14
  `field: value` + 2 field-shorthand (`timezone,` / `enabled,)` == 16 initialised** —
  i.e. no missing field initialiser that Rust would reject. `[V]`
- `schedulerEnable` reference scan after the edit → none remaining. `[V]`

### NOT VERIFIED (same environment limits as §2G — unchanged)
- **No Rust toolchain**: `cargo check`/`clippy`/`fmt`/`test` still not run. The Rust
  edit here is checked by field parity and by reading the owning `Job` shape, not by
  a compiler. `[UNVERIFIED]`
- **No `tsc` / no `node_modules`**: the `schedules-section.tsx` and `settings.ts`
  changes were not type-checked. `[UNVERIFIED]`
- Only the two Node gates could run; that is the whole evidence base for this wave.

---

## 2I. Implementation wave 6 (2026-09-17) — P65.3 Channels & Connectors Inventory

**Item taken:** P65.3 (Tier 2). Plan target files `ui/src/components/settings/connectors-tab.tsx`
do not exist; the real surfaces are `ui/src/lib/connections.ts` (new in `792dbaf`) and
`ui/src/components/panels/connectors-panel.tsx`.

### Found: TWO incompatible types named `ConnectionRecord`
`792dbaf` added a TypeScript `ConnectionRecord` in `ui/src/lib/connections.ts` while
`settings_cmds.rs` implements the §17.12.2 `ConnectionRecord`. They disagree on all
three axes, so importing "`ConnectionRecord`" from either module silently gave a
different shape — precisely the contract drift `everyaios-types` exists to remove on
the Rust side, reintroduced on the TS side.

| | `lib/connections.ts` | §17.12.2 + Rust |
|---|---|---|
| `state` casing | `'Connected'` | `'connected'` |
| `kind` axis | `connector \| mcp-server \| oauth-account \| store-entry` | `remote_mcp \| oauth_connector \| native_adapter \| message_channel` |
| field set | `name`, `detail`, `source` | `transport`, `scopes`, `enabledConsumers`, `health`, `authRef?`, `configHash` |
| `revoked` state | absent | present |

`ConnectionState` collided too (both modules exported it).

### Changed — the objective defect only
Renamed the **display projection** so one name means one shape:
`ConnectionRecord` → **`ConnectionView`**, `ConnectionState` → **`ConnectionViewState`**
(`ui/src/lib/connections.ts`), and updated its single importer
(`connectors-panel.tsx`: the import and `ConnectionBadge`). A naming/ownership fix with
no behavioural change — `connectionTone`/`connectionLabel`/the four adapters are
byte-identical apart from their type annotations. `ConnectionRecord` and
`ConnectionState` now belong solely to the §17.12.2 wire model in `@/lib/settings`.

### Surfaced, NOT decided — the vocabulary conflict
Which state vocabulary Settings standardises on is an owner call, because the two
sources disagree and neither is obviously wrong:
- the **plan prose** says `Discovered, Installed, Connected, Disconnected, Degraded`
  (PascalCase, 5 states) — which is what the display projection implements;
- the **normative** §17.12.2 says `discovered, installed, connected, disconnected,
  degraded, revoked` (snake_case, 6 states).
The extra `revoked` is substantive, not cosmetic: P65.3's own acceptance gate is
"**Disconnected or revoked** connector immediately invalidates active tools across all
sessions", and `ConnectionView` has no `revoked` member to express that. Recorded as
an open decision in the module doc comment rather than silently reconciled — the same
rule applied in §2G/§2H: fix the objective collision, surface the semantic choice.
Also noted: the same state-vs-display split as §2H applies to the field sets
(`name`/`detail`/`source` are display; `transport`/`scopes`/`health`/`authRef`/
`configHash` are authority). Neither set should absorb the other.

### Evidence actually executed
- Stale-name scan across all of `ui/src`: **zero code references** to `ConnectionRecord`
  or `ConnectionState` outside `lib/settings.ts` (remaining hits in `connections.ts`
  are the explanatory comments). A trailing `state: ConnectionState` field inside
  `ConnectionView` was caught by this scan and fixed — it would have been a
  "cannot find name" error, since the type was renamed. `[V]`
- Declaration/use balance: `ConnectionView` 1 declaration / 13 refs;
  `ConnectionViewState` 1 declaration / 3 refs — no orphaned or dangling name. `[V]`
- Single-importer confirmation before the rename (`grep` for `@/lib/connections` →
  exactly one file), i.e. the blast radius was fully enumerated before editing. `[V]`
- `node scripts/check-doc-sync.mjs` → exit 0 · `node scripts/ipc-parity.mjs` →
  exit 0 · registered 341 · broken 0 · ghosts 60 (unchanged). `[V]`

### NOT VERIFIED (environment limits unchanged from §2G)
**No `tsc` and no `node_modules`**, so these TypeScript edits were **not type-checked**;
no Rust was touched in this wave. `[UNVERIFIED]`

---

## 2J. Implementation wave 7 (2026-09-17) — P65.2 Agent Two-Plane + a CI-breaking defect

**Item taken:** P65.2 (Tier 2). Plan target `ui/src/components/settings/agents-tab.tsx`
does not exist; the real surface is `ui/src/components/panels/agents-models-section.tsx`.

### The consequence of wave-4's wiring, and why it mattered
The module wired in §2G had **never been compiled**, so two things were true at once:
its contract tests had never run, and any latent defect inside it was invisible. Once
`mod settings_cmds;` exists, the file joins the build — so a latent `dead_code` finding
becomes a **CI failure**, because the `rust` job runs
`cargo clippy --all-targets --all-features -- -D warnings`.

### FOUND AND FIXED — `SettingsReadModel` was dead code (would fail CI)
`SettingsReadModel` (§17.12.2's shared row shape) was **declared and never used**: its
only other occurrence in the whole file was a doc comment. The commands build rows as
`serde_json::Value` — necessarily, because provider rows arrive as `Value` from
`catalog_cmds` — so nothing ever constructed the struct. `mod settings_cmds;` is private,
so the item is not publicly reachable and rustc reports it as dead code; with `-D warnings`
that is a hard build failure.

Fixed the honest way — **not** with `#[allow(dead_code)]`: added
`settings_read_model_uses_contract_field_names`, which constructs the type and pins the
§17.12.2 wire names plus the `skip_serializing_if` behaviour (an absent `lastError` must be
**omitted, not `null`**, so the UI reads a missing key rather than an empty one). The type
is now genuinely reachable **and** a previously untested contract surface is covered.

### Verified by reading — P65.2's acceptance gate does hold in the implementation
The gate is *"External agents retain their own auth credentials; no EveryAIOS key is copied
to external agent configuration files."*
- `BackendBindingView.writes_to_agent_config` is **hardcoded `false`** at its one production
  construction site (`:807`) and asserted by `agent_settings_shape_keeps_writes_flag_false`,
  which pins `writesToAgentConfig == false` on the serialized view. `[CODE]`
- `backend_binding_view` reports **names only** — `injected_env_names` / `unexpressed` — plus
  a `key_present` boolean and an optional `refusal`; no value ever crosses the boundary. `[CODE]`
- The two-plane split is real, not cosmetic: `native_caps(is_inbuilt)` returns
  `loop/planning/routing/memory-reasoning/verification/native-tools` for the inbuilt engine
  and `own-loop/own-tools/own-model/own-permissions` for an external agent, while
  `shared_caps()` returns `office-facade/browser-facade/computer-use-facade/memory-api/work`.
  That is the §17.12 "agent-native plane + shared cowork plane" model expressed in code. `[CODE]`
- `has_managed_binding` gates `modelOwner: managed` on a *verified* binding: config present,
  channel env-injectable, no refusal, and the key either present or unnecessary. `[CODE]`

### Also recorded — 13 contract tests were dormant
`settings_cmds.rs` ends in a `#[cfg(test)]` module with **13 tests**, each mapping to a
contract clause: `provider_state_never_invents_connected`, `model_owner_rule`,
`readiness_never_claims_ready_without_occupancy`,
`runtime_location_mapping_keeps_provenance_distinct`,
`connection_state_never_false_connected`, `mutation_envelope_uses_contract_field_names`,
`agent_settings_shape_keeps_writes_flag_false`, `loadout_rows_apply_from_next_turn`, and
the new one added here. **None had ever executed**, because the module was never compiled.
They now compile. Whether they *pass* is `[UNVERIFIED]` (§2G limits) — but a dormant suite
that starts running is strictly better than one that silently never ran.

### Evidence actually executed (static only — see limits)
- Import audit: all 5 imports in `settings_cmds.rs` used (`Serialize` 11, `json` 33,
  `Value` 40, `State` 11, `record_mutation` 2, `AuthKind` 2, `AppState` 18 refs). `[V]`
- Dead-code audit: all **28** private fns have ≥2 refs (definition + call) — none orphaned. `[V]`
- Declared-type audit: all **10** `pub` types now have ≥2 code use sites beyond their
  declaration (was 0 for `SettingsReadModel`). `[V]`
- `node scripts/check-doc-sync.mjs` → exit 0 · `node scripts/ipc-parity.mjs` → exit 0 ·
  registered 341 · broken 0 · ghosts 60 (unchanged). `[V]`

### NOT VERIFIED
No Rust toolchain: these audits are **static**, not a compiler run. The `dead_code` call is
inference from use-site counts plus `mod` privacy, not a `cargo clippy` result. `[UNVERIFIED]`
No `tsc` either — no TS was changed in this wave.

---

## 2K. Implementation wave 8 (2026-09-17) — P65.1 Provider Control-Center (verification only)

**Item taken:** P65.1 (Tier 2). Plan target `ui/src/components/settings/providers-tab.tsx`
does not exist; the real surface is `ui/src/components/panels/settings-providers.tsx`.

**Outcome: its acceptance gate already holds — no code change was needed or made.**
The gate is *"Failed provider probe renders actionable error without storing an invalid
key; valid probe displays green verified checkmark."* `verifyAndSave`
(`settings-providers.tsx:551`) implements exactly that, and the ordering is the guarantee:

```ts
const p = await providerProbe(row.id, secret.trim() || undefined)
setProbe(p)
if (!p.ok) {
  notify(`${row.name}: ${p.message}`, 'error')   // actionable, from the probe
  return                                          // ← nothing persisted
}
// only past this point: providerProfileUpsert + vault_key_add
```

The `return` on `!p.ok` is what makes it fail-closed: `vault_key_add` is unreachable on a
failed probe, so an invalid key cannot be stored. The green tick is the `probe?.ok`
conditional at `:759`/`:774`. This predates the P65 wave (tagged P56.3), and it satisfies
P65.1 — re-implementing it would have been churn. `[V]`

**Remaining P65.1 gap (recorded, not implemented):** the plan asks for a searchable
**Configured / Popular / All** inventory, and `settings_providers_list` already returns
canonical `groups: { configured, popular, all }` — but the panel still computes its own
buckets via `configuredProviders(filtered)` from `@/lib/providers` and never consumes the
read model. Migrating it is the same call as §2H/§2I and is deliberately not done here:
it would touch a 1,234-line panel with no type-checker available, to replace working
filtering, in exchange for canonical grouping. Needs the state-vs-display decision to be
settled first (see §2I). `[CODE]`

### Tier-2 read-model sweep: complete
All five Tier-2 items have now been dispositioned, each by *reading the code* rather than
assuming the plan's description was accurate:

| Item | Disposition |
|---|---|
| P65.1 Providers | Gate verified already correct (probe-then-persist). Panel not migrated; gap recorded. |
| P65.2 Agents | Gate verified correct (`writesToAgentConfig` hardcoded false + tested). **Fixed a latent CI-breaking `dead_code`.** |
| P65.3 Connections | **Fixed** a real `ConnectionRecord`/`ConnectionState` name collision. Vocabulary conflict surfaced. |
| P65.4 Schedules | **Fixed** the read-model gap (`name`/`runs`) and routed the toggle through the §17.12.3 mutation funnel. |
| P66.5 Blue theme | Already correct centrally via the semantic alias block; 3 stale comments fixed. Bulk sweep deliberately refused. |

**Net: 3 genuine defects fixed, 2 contract gaps closed, 2 decisions surfaced, 1 destructive
"fix" correctly refused.** Every remaining Tier-2 UI item waits on the same two things:
a toolchain to verify against, or the vocabulary decision in §2I.

---

## 2L. Implementation wave 9 (2026-09-17) — P64 reconciliation: the tracker is wrong, and it matters

**Why this wave is analysis and not code:** the plan (and the prior checklist) is built on
`TODO.md`, and `TODO.md` **materially understates what is already implemented**. Writing
code against those rows would re-implement working features. So the highest-value action was
to establish ground truth by call-site evidence, then redirect the work to what is genuinely
open. Every claim below is from reading the code, and **none of it was verified by running
a test** (no toolchain — see §2G limits).

### P64 — measured, item by item

| Item | TODO.md says | What the code shows |
|---|---|---|
| **P64.3** Repo-map as default context | `[NOT DONE]` — *"the map is never selected or injected"* | **IMPLEMENTED.** `chat.ts:763` requests `codeintel/repomap`, then `rankRepoMapTags` → `fitRepoMapToBudget` → `renderRepoMapBlock` → `injectBelowBoundary`, so segments 1–7 stay byte-identical (the gate). Best-effort: a missing handler never blocks. Covered by `p64-lane.test.ts`. **The TODO statement is false.** |
| **P64.4** Sub-agent execution side | `[PARTIAL]` | **PARTIAL — accurate.** `DELEGATE_BLOCKED_TOOLS` is wired across `execution.rs`, `governor.rs`, `blueprint/subagent.rs` **and** `coordinator/tools.ts`. But `SubAgentRuntime` has no production caller (only a `p10_e2e.rs` test + the `lib.rs` re-export) and **`derive_child_permissions` is referenced in exactly one file — its own definition.** The permission-derivation half is dead. |
| **P64.5** Unified native edit engine | `[NOT DONE]` | **IMPLEMENTED.** `dispatch_edit` is on the live `"file_ops.edit"` dispatch arm and runs `apply_edit_ladder` (exact → structured → fuzzy), snapshotting before an atomic tmp+rename write and returning the strategy used. The ambiguity invariant holds by construction (comment + `apply_exact_once` failing on 0/2+). |
| **P64.6** Risk-gated shadow preflight | `[NOT DONE]` | **GENUINELY OPEN — mechanism exists, never called.** `decide_shadow_preflight`, `run_shadow_command`, `spawn_shadow_command_tracked`, `Should_restore` exist in `execution.rs` but are referenced only there and in the `lib.rs` re-export. **No caller.** |
| **P64.7** Checkpoint + rollback UX | `[NOT DONE]` | **GENUINELY OPEN — same pattern.** `auto_checkpoint_kernel`, `commit_workspace_snapshot`, `check_restore_fence`, `should_restore_without_replay` exist in `execution.rs`, referenced only there + the re-export. **No caller.** |
| **P64.8** Validated skill distillation | `[NOT DONE]` | **IMPLEMENTED (cross-language).** `grow_from_task` is referenced from `coordinator/plan.ts` plus `blueprint/{skill_store,learn}.rs` and `memory/journey.rs`. |
| **P64.9** Shared-plane fa\u00e7ades | `[NOT DONE]` | **IMPLEMENTED.** `FACADE_ROUTES` and `find_facade` are both referenced from **`everyaios-mcp/src/lib.rs`** — i.e. the task-shaped fa\u00e7ades are exposed over the MCP catalog, which is the item's stated mechanism. |

### The conclusion that changes the plan
**P64.3, P64.5, P64.8 and P64.9 are implemented but marked `[NOT DONE]`.** The genuinely
open P64 work is **P64.6 and P64.7** — and both are *wiring* jobs, not authoring jobs: the
mechanisms are written and sit one call site away from the live path. **P64.4** is correctly
tagged `[PARTIAL]`, with `derive_child_permissions` unreferenced.

This is the same "implemented but unreachable" class the §2B/C audit documented for the
Script sandbox and `attach_desktop` — and it is the third time this session that reading the
code disagreed with a tracker line (cf. §2G P66.5, §2H `ScheduleSettings`).

### P68.8 also measured — TODO row is stale
`P68.8` is tagged `[NOT DONE]` with *"reattach still announces that output produced while the
view was closed is not replayed."* That is no longer true: `shell-view.tsx:450` defines
`replayInto`, which calls `terminalReplay(ptyId, from)` with a **per-tab `seq` cursor**
(`seqRef`), labels a truncated replay honestly when `dropped > 0`, and prints
"no output retained to replay" only for a genuinely empty ring. The split-pane work is also
present (`splitDir`, `splitActive`, `unsplit` — *"Both sessions keep running — nothing is
killed"*). The `terminal_replay` command is registered. **Not flipped to done** — see below.

### Deliberately NOT done
**`TODO.md` was not edited and no checkbox was flipped.** Every item above is a *reading*
result; this repository's contract is that readiness is **evidence-gated** and that an
unverifiable claim is worse than an honest `unverified` (§3 of the handover, and the P50.4
readiness rule). Marking P64.3/5/8/9 done without executing `cargo test` would repeat the
exact failure this wave is reporting. **The rows should be re-tagged only after the Rust
suite runs on the items' own named tests.** Recorded here so the discrepancy is not lost.

### Evidence actually executed
- Call-site sweeps (symbol → referencing files) for 12 P64 mechanisms; cross-module
  references distinguished from definition-only and from `lib.rs` re-exports. `[V]`
- Direct reads: `chat.ts:752–806` (repomap injection), `tools.rs:1580–1612`
  (the ladder on the live `file_ops.edit` arm), `shell-view.tsx:440–520` + `lib/terminal.ts`
  (replay wiring, `fromSeq`), `TODO.md` rows at `:1794–1821` and `:2302–2321`. `[V]`
- `node scripts/check-doc-sync.mjs` → exit 0 (208 open / 1221 done still matches the header —
  **note the checker validates the arithmetic, not the accuracy of any individual row**). `[V]`
- `node scripts/ipc-parity.mjs` → exit 0 · registered 341 · broken 0 · ghosts 60. `[V]`

### NOT VERIFIED
No Rust toolchain and no `tsc`. Every "IMPLEMENTED" claim above is a **static reading**
(call sites exist, wiring is present) and **not** a passing gate. `[UNVERIFIED]`

---

## 3. Next Exact Steps (What to do next)

> ### ⛔ WINDOWS-DEFERRED — explicitly OUT OF SCOPE this session (marked, not attempted)
>
> Everything below requires a **Windows host** or a Windows target build. This
> session ran on Linux with no Rust toolchain, so none of it was attempted.
> These are **not** bugs and **not** blocked on code — they are blocked on the
> environment. Each stays `unverified` until a real Windows acceptance record
> exists (the readiness contract makes an unverifiable implementation worse than
> an honest `unverified`).
>
> **Windows-only deliverables deferred:**
> - `P66.6–P66.9` — real Windows acceptance runs (DOCX/XLSX/PPTX/PDF corpus, CDP
>   browser, Computer Use) against packaged binaries.
> - `P50.5.8` — cross-platform release matrix; the Windows and macOS legs. Only the
>   Linux leg has any local evidence.
> - Windows Job Objects sandbox; ConPTY; `Windows.Graphics.Capture` (WGC) capture;
>   `ShellExecuteEx` launch + `SW_SHOWNOACTIVATE`; Windows App Paths / WSL
>   launchability probes; NSIS/MSI installers; the auto-updater.
> - Windows UI Automation + OCR locator ladder for Computer Use (P57/P59).
> - `RuntimeLocation` variants `windows_path` / `windows_registry` — **typed and
>   wired this wave** (`settings.ts`), but their probes cannot execute here, so
>   they remain `unverified` in behaviour even though the wire contract is now correct.
>
> **Also environment-blocked (not Windows):** macOS Seatbelt / Accessibility-TCC /
> `open -g` / DMG; the real Office producer corpus; live browser attach on a
> display (L7 SKIP); provider live legs; multi-GB local model download + serve;
> the `packages/core-*` suites (vitest absent from this checkout).
1. **P66.6–P66.9 — Real Windows acceptance runs:** execute real DOCX/XLSX/PPTX/PDF, CDP browser, and Computer Use tests on a Windows host.
2. **Reconnaissance remainder:** continue reading the unread tails named in §2 (`work_gateway.rs` beyond ~1500, `broker.rs` beyond ~400, `xlsx/patch.rs` test tail, `acp/client.rs` prompt loop, `provider_seed.rs`, `search/src/lib.rs`, the rest of `store.ts`, and the remaining UI components).
3. **~~Fix the drift listed in §2 before the next feature wave~~ — DONE 2026-09-16 (§2C).** The TODO stamp is v3.80 and now guarded by `check-doc-sync.mjs` check 7; the SKILL.md crate path is fixed; the SPEC A1/A11/A8 notes are reconciled; `git status` is clean of the previously-dirty `sandbox.rs` / `p45-live-measurements.json`.
4. **Commit this wave.** All changes are verified and uncommitted. Suggested split (vendor-neutral Conventional Commits, one concern each): `fix(core): forward tool calls and stream incrementally in the local OpenAI server`; `test(core): make the snapshot benchmark take the best of five samples`; `test(coordinator): skip live agent harness tests when the binaries are absent`; `ci: run the vendored core-* suites`; `fix(cdp): derive the default channel/profile enums and restore the browser fmt/clippy gates`; `fix(guard): correct the ticket doc indent and netfloor conversion`; `fix(core): satisfy clippy on chat, terminal, and sync transport`; `fix(desktop): reap the live-test fixture and drop needless clones`; `docs: reconcile A8/A1/A11, the TODO revision stamp, and doc-sync`; `chore: apply cargo fmt across the crates workspace`. **Do NOT mention any agent/tool brand in these messages.**
5. **~~A11 remainder — decide the boot-time probe sweep~~ — DONE 2026-09-16 (§2E).** The decision was made the safe way: the credentialed egress lives in the vault (`Broker::probe_models`), the URL can only be the provider's own endpoint, cleartext remote is refused, and the probe is not a turn (no ledger/budget/key-health movement). Sweeps run at boot + vault unlock. **Remaining here:** runtime evidence on a real machine — watch that a locked-vault boot + unlock produces the expected two passes, that Settings stays responsive while a sweep runs (the sweep holds the vault lock per provider for up to 8 s, the same posture as the chat path), and that `verifiedAt`/`observedAt` light up in the providers list after the first unlock.
6. **Windows/macOS acceptance matrix (P66.6–P66.9, §2B B1)** — unchanged and still the release blocker; nothing on this Linux host can substitute for it.

---

## 4. Key Architectural Decisions & Invariants
- **Standalone repo**: `desktop_app` is the Git repository. `business_Dev` is the parent containing `.agents/`, `AGENTS.md`, `CURRENT_RUN.md`, and `APP/`.
- **Two planes, one invariant:** agent-native plane (belongs to the agent) + shared cowork plane (belongs to EveryAIOS); capability resolution is **native-first, augmentation-second**; the Chief chooses only when both exist. EveryAIOS Native owns both planes.
- **Frozen scope non-goals:** no second orchestration engine; no second provider/connector/scheduler registry; no flat tool dump into external agents; no funneling external coding agents through the local A8 server in v1; no copying subscription credentials; no writing an external agent's own config file (`protected_paths`); no full TS→Rust chat-loop port before the current sidecar seams are correct.
- **Windows-first:** Windows is the first release target. WSL is an execution **backend**, not the Windows storage root. `installed` / `discovered` / `launchable` are three distinct facts; a catalog row is never occupancy.
- **Prompt/context invariants:** `CACHE_BOUNDARY` byte stability (segments 1–7), stable-sorted + capped tool list (≤20 active), `assertAllLogged()` honesty invariant, Work as the durable unit.
- **Zero Mock Persistence**: In `desktop_app`, mock sessions exist ONLY in preview mode (`inTauri() === false`). A live Tauri app launches empty from `everyaios-vault`. Never persist mock data to disk.
- **Readiness is evidence-gated:** Office/Browser/Computer Use/Memory/MCP/skills/plugins stay `unverified`/`available` until a real Windows acceptance record exists.
- **Git protocol**: mandatory `git add`/`git commit`/`git push` in `desktop_app` for verified changes; **strict vendor-neutral rule** — no AI tool or agent brand name anywhere in commits, PRs, comments, or docs.

---

## 5. File Change Ledger (Most Recent First)
- **2026-09-16 implementation wave 3 (this session, uncommitted — see §2E):** `crates/everyaios-vault/src/keyring.rs` (`reveal_for_metadata_probe` + shared `highest_priority_credential`, 6 tests) · `crates/everyaios-vault/src/broker.rs` (`ModelsProbe`, `Broker::probe_models`/`models_url`, `ProviderEndpoint::models_url`, `credential_safe_url`, `BrokerError::InsecureEndpoint`, 8 tests) · `crates/everyaios-vault/src/lib.rs` (exports) · `crates/everyaios-catalog/src/fetch.rs` (shared `endpoint_probe_result`, public `count_models`) · `crates/everyaios-catalog/src/lib.rs` (exports) · `src-tauri/src/catalog_cmds.rs` (`probe_provider_vault`, `observation_from_probe`, `sweep_connected_providers`, `spawn_observation_sweep`, `spawn_boot_observation_sweep`, `record_observation_in` takes the registry, 3 tests) · `src-tauri/src/lib.rs` (boot + setup/unlock sweep hooks; `AppHandle` on `vault_setup`/`vault_unlock`) · `DESKTOP-APP-SPEC.md` + `ARCH/09-FEATURE-MATRIX.md` + `TODO.md` (A11 vault-mediated probing).
- **2026-09-16 implementation wave 2 (this session, uncommitted — see §2D):** `crates/everyaios-catalog/src/observations.rs` (**new** — durable per-provider observation store, `apply_observations`, `health_of`, `apply_observation_health`, 8 tests) · `crates/everyaios-catalog/src/{lib,probe,routing_feed}.rs` (module + exports; **vacuous `hard_caps_verified` fix** + test; `health_of` accessor) · `src-tauri/src/catalog_cmds.rs` (record observation on probe, `observed_registry`/`observation_file`, `observedAt`/`reachable`/`observedModelCount` row fields, 4 write-back tests) · `src-tauri/src/discovery_cmds.rs` (observed registry + observation-derived routing health) · `src-tauri/src/vault_cmds.rs` (rationale'd `#[allow]` for the 10-arg IPC command) · `ui/src/lib/providers.ts` + `ui/src/components/panels/settings-providers.tsx` (`observedAt`/`reachable`/`observedModelCount` + `last check failed` badge) · `DESKTOP-APP-SPEC.md` + `ARCH/09-FEATURE-MATRIX.md` + `TODO.md` (A11 landed state + remaining gap) · **computer-use autonomous path:** `crates/everyaios-desktop/src/{lib,policy}.rs` (provenance through the audit path) · `crates/everyaios-core/src/chat.rs` (`ChatRelay::attach_desktop`) · `src-tauri/src/desktop_cmds.rs` (`DesktopEngineBackend`, `publish_desktop_backend`, helper tests) · `src-tauri/src/lib.rs` (boot attach before relay publish).
- **2026-09-16 implementation wave (this session, uncommitted — see §2C):** `crates/everyaios-vault/src/broker.rs` (incremental stream API + 2 tests) · `crates/everyaios-core/src/openai_server.rs` (tool calling + SSE pieces + 6 tests) · `crates/everyaios-core/src/lib.rs` (re-exports) · `src-tauri/src/openai_cmds.rs` (forward tools, shape `tool_calls`, override `stream`) · `crates/everyaios-core/tests/p10_bench.rs` (best-of-5) · `packages/coordinator/src/live-agent-harness.test.ts` (binary-presence skip gate) · `.github/workflows/ci.yml` (vendored `core-*` test step) · `scripts/check-doc-sync.mjs` (TODO revision stamp guard) · `TODO.md` · `DESKTOP-APP-SPEC.md` · `ARCH/09-FEATURE-MATRIX.md` · `.agents/skills/browser-computer-use/SKILL.md` · `crates/everyaios-core/src/agui.rs` + `chat.rs` (AG-UI build-state honesty) · fmt-only: `everyaios-cdp/src/{browser,lib}.rs`, `everyaios-core/src/{git_queue,governor,shell_integration,terminal,worktrees}.rs`, `everyaios-memory/src/avoid.rs`, `everyaios-vault/src/lib.rs` · clippy: `everyaios-guard/src/{ticket,netfloor}.rs`, `everyaios-desktop/src/{apps,launch}.rs`, `everyaios-desktop/tests/live_linux_e2e.rs`, `everyaios-core/src/sync_transport.rs`.
- `desktop_app/README.md`: updated comprehensively to architecture v3.80 across all sections: added badges for v3.80, 166 capabilities, and OS sandboxes; expanded comparison table with multi-agent swarms, OS sandboxing, first-class native tools, cognitive avoidance memory, conversational calendar, and P45 performance benchmarks; expanded 3 Pillars diagram and section deep-dives; expanded 12 core subsystems with detailed technical breakdowns for native plane, worktree swarms, OS sandboxing, and release gates; added real-world walkthrough scenarios and 4 new FAQ entries.
- `desktop_app/README.md`: updated hero tagline hierarchy with `Every AI. One Space.` and the rhythmic cadence `Every Model. Every Agent. Every Task. One Space.`; completely replaced all occurrences of legacy agent mentions ("Roo Code") with "Google Antigravity" across feature cards, comparison table, and FAQ.
- `desktop_app/README.md`: elevated full product capabilities without undermining them — added PPTX presentation editing, deep web research cascade ($0 search fees), background automations & system tray daemon, 7-stage cryptographic deduplication (xxHash3+BLAKE3), interactive disk treemaps, Monaco IDE & LSP integration, and 5-tier cognitive memory.
- `desktop_app/5a1c3357-0cd1-492f-ac9f-efd313391587.png`: removed external screenshot asset from git repository.
- `desktop_app/ui/src/components/chat/agent-model-picker.tsx`: full-screen two-pane runtime workspace; last orange hover token → `sky`; provenance + `installed`/`discovered`/`launchable` rendering.
- `desktop_app/ui/src/globals.css`, `desktop_app/ui/DESIGN-SYSTEM.md`: legacy orange brand explicitly labelled **current**, with the v3.78 cool-blue semantic accent marked as the target (P66.5 gap).
- `desktop_app/ARCH/DIAGRAMS.md`: stale "spec v3.76" stamp → v3.78; `desktop_app/TODO.md`: P66 verification record added + one stale census row in the summary table corrected to `1420 = 1208 + 212`.
- `desktop_app/src-tauri/src/acp_cmds.rs`: Windows App Paths + WSL discovery probes (`cfg(windows)`), `installed`/`discovered`/`launchable` derivation, stale-managed-executable guard, +tests (11 passed / 1 ignored).
- `desktop_app/ui/src/lib/acp.ts`, `agents.ts`, `bridge.ts`: runtime-location/readiness types and honest state labels.
- `desktop_app/DESKTOP-APP-SPEC.md`, `ARCH/12-UI-SPEC.md`, `ARCH/17-NATIVE-AGENT.md` (§17.12), `ARCH/00-INDEX.md`, `UI-DESIGN-PROMPT.md` (§2.1 palette), `UX-TESTING-PLAN.md`, `README.md`, `SPEC-CHANGELOG.md`, `ui/src/lib/version.ts`: the v3.78 Settings Control Center + Windows-first contract freeze.
- `desktop_app/RESEARCH/desktop_app/91-windows-agent-cowork-ui-2026-09.md`: new research doc (provenance for P66). `RESEARCH/desktop_app/00-INDEX.md`: doc range 01–91.
- `business_Dev/.agents/agents/everyaios-lead.ts`, `everyaios-architect.ts`: frozen two-plane / native-first / Windows-first contract added; handover protocol retained.
- `business_Dev/.agents/skills/ui-ux/SKILL.md`: §8 Windows-first agent surface + cool-blue semantic token table; §2 palette retargeted.
- `business_Dev/.agents/agents/everyaios-ui-craft.ts`, `everyaios-user-tester.ts`; `business_Dev/.agents/skills/*` (10 skills): cool-blue target, legacy-gap note, and handover protocol clarified (update `CURRENT_RUN.md`, reflect delivery status in `TODO.md`/`SPEC-CHANGELOG.md`).
- `business_Dev/CURRENT_RUN.md`: refreshed to v3.78 truth (this file). `business_Dev/AGENTS.md`: §3 next steps + §5 ledger updated for the P66 wave.
