# 10 — Build Plan (phases with exit criteria)

> **Derived from [`CORE.md`](CORE.md) — the root authority; this document specializes, never restates, it.**
> **SCOPE REDUCED — delivery status lives in [`../TODO.md`](../TODO.md).** This document keeps phases and exit
> criteria; implementation detail, sequencing and status belong in the TODO, which is the single
> implementation-status surface. **Reduced `P69.A21` (done 2026-09-20).**

---

> Sequencing merges v2.0 §5 phases with the research M0–M9 and the Rust-layer reality. Each phase has an **exit criterion verifiable by a test**. P10 (testing/QA), P11 (UI/UX) and P12 (market/GTM) run **in parallel** with P0–P8. Version-level sequencing notes (kernel contracts, agent-binding wiring, terminal backends, perf queue) live in `TODO.md` — this file keeps only what phase gates what. The capability contract is the matrix (09); phases are feature-locked at kickoff. E9 (desktop computer-use) is required product surface, not a scope cut.

## P0 — Workspace & skeleton (≈2 wks)

Rust workspace + TS workspace + pnpm workspace over the in-repo vendored `@everyaios/core-*` packages, CI matrix; `everyaios-core` boots headless (config, dirs, vault init, SQLite schema v1); stdio JSON-RPC framing; ProcessSupervisor spawns the sidecar; Tauri window shows the React shell.

- **Exit:** `cargo test` green; sidecar E2E "echo" over IPC green; `--version` prints; config loads; vault opens/creates; sidecar heap safety + watchdog + pre-spawn land here.

## P1 — Chat + BYOK key-rings (≈4 wks)

ProviderAdapter (A1) + key-ring vault (A2/A3: N keys/provider, priority/weight, cooldowns, auto-failover, budgets, health UI); sidecar streaming chat + UI chat; token/cost ledger (A9); OAuth flows (A4) behind a flag.

- **Exit:** two keys under one provider auto-fail over a simulated 429 (unit + manual UI); streaming round-trip with a real BYOK key; ledger rows correct; $ budget kills the session.

## P2 — Browser layer (≈6 wks)

One `BrowserService` façade (08): CDP discovery + snapshot/diff/refs + 37-tool catalog via everyaios-mcp; tiered engine strategies (static → Lightpanda default / Obscura opt-in → full Chrome); Session Vault (E11: capture → grant → inject → revoke, agent never sees cookies; incl. session inheritance E13); challenge handler (E12: PoW local + human-in-loop default + behavioral realism; BYO behind a flag); script-eval `run` (E4: sandbox + SDK + InnerCallHook audit); session replay (E5: recorder → NDJSON → store, sticky `has_gap`); ownership isolation + tab claims; extensions (E15–E17: Electron-app CDP, slim snapshots, multi-protocol action parsing).

- **Exit:** scripted E2E (navigate → snapshot → act → diff → assert); agent cannot close a user tab; scrape runs on the lightweight tier and escalates only on need; vault round-trip with cookie-invisibility; human-in-loop handoff works; PoW auto-solved locally; every `run` primitive has an audit row; recording → replay round-trip flags a forced gap; Electron snapshot→click→read; slim ≤40% of full tokens; action parse → same browser op.

## P3 — Cockpit & audit UI (≈4 wks)

Replay & audit UI (scrubber + per-step screenshots + searchable sessions); cockpit cards (Watch/Stop, quiet mode, MCQ interrupts); distributed tracing.

- **Exit:** replay & audit UI round-trip; cockpit shows live state and stop kills the loop.

## P4 — Office engine + storage intelligence (≈5 wks) ← user-critical

docx block-patch editor; xlsx (IronCalc single calc truth engine + calamine + workbook DSL + deterministic planner); pptx part-editor; pdf (form-fill + text-swap + re-author + redact); office perfectness gaps (charts, track-changes/comments, transitions, annotations, presenter mode, citations); UI renderers; conformance oracle. Storage intelligence (D9–D11, G7): parallel walker + arena snapshots + treemap; hash dedup; large-file finder; Guard-2-gated cleanup; FTS5 filename search + watcher.

- **Exit:** round-trip tests (LibreOffice-reopen asserts byte-stable untouched parts); IronCalc golden-case recalc; pptx add/remove round-trip; pdf form-fill; every edit has snapshotBefore rollback; scan fixture → treemap + dedup report; zstd snapshot round-trip; FTS5 query <50ms.

## P5 — Memory fusion + token economy (≈5 wks)

Four-class memory (07) on the memory API: multi-signal fusion (C3), graph backend (C6), paging (C2), warm-set wiring (C7); taste profile (C9); ACT-R activation + spontaneous recall (#32); pass-by-reference context (C10); ghost-context tombstone eviction; compaction pipeline + lifecycle hooks + model-fallback chain; prefix-stability + cache-break events; efficiency projections; FSRS reinforcement (C13); hierarchical repo summarization; intent classifier.

- **Exit:** retrieval benchmark (multi-hop + temporal) vs plain BM25 baseline shows the fusion-class gain; 10MB file queried via ref-preview keeps in-context payload ≤2K tokens and ACT-R recall passes the multi-hop + temporal set; compaction triggers without breaking the loop; prefix-dirty handling tested; $/token per key on the dashboard; FSRS intervals match the retention target.

## P6 — Orchestration + connectors (≈5 wks)

Blueprint engine (B2: spec files + verify-gated tasks + frontmatter schema); sub-agents (B3/B4) + multi-agent topologies; scheduling + nudge cards (B7) + automation tool shapes; harness installer (F8); harness-driving (F12: user's agent CLIs as side-by-side workers, own loops, shared files, Trust-Ladder-gated + audited); connector hub routing (MCP-first: MCP Servers + Native + Tool Catalog) + browser-session connectors (F3) + Auth Bridge (F4) + MCP client reconcile (F6); messaging bridges (F13, desktop-first: email/Telegram/WhatsApp; Signal/iMessage + daemon deferred); email/calendar connectors (F14/F15).

- **Exit:** two spec-driven agents on different models run a plan end-to-end; scheduled task fires headless; harness config gets a managed entry (plan-before-touch, foreign-entry refusal); two external CLIs run side-by-side on one workspace with shared files + isolated contexts; messaging round-trip via stub adapter; Gmail-via-browser-session drives a real flow; email read→summarize→reply via stub.

## P7 — Forge + guardrails hardening (≈4 wks)

Forge loop (I1/I2/I4/I5); code-intel (I11: LSP + SCIP + repo-map in `everyaios-codeintel`, guard-ticketed); extension/plugin ABI (I6: manifest, CapabilityGranter, trust flags, lazy activation, dogfood rule); skill registry with auto-injection; adversarial suite against Guard-1/injection defense; Guard-2 diff-card UX polish; estop/OTP; path-floor fuzz.

- **Exit:** an agent-written skill survives restart and is callable next session; bad plugin bundles rejected + capability blocks unlisted exec; LSP hover/references/rename-with-preview round-trip; SCIP query on a fixture repo; repo-map assembles context for a mid-size repo; 100% of the red-team pattern list blocked by Guard-1 or diff-card; path-floor escape fuzz = 0 successes.

## P8 — Product polish + release (≈3 wks)

Verified-completion eval subsystem (EV1: task manifests, verifier SDK, evidence bundles, adversarial suite with fault injection, retrieval-eval corpus — builds before multi-agent work is trusted); reader/office/blueprint/analytics UI pass; widget cards (H17); personality; tray daemon; telemetry opt-in; packaging (Win/macOS/Linux); idle-RSS perf pass (measure & publish real numbers — targets are to verify, not promises); docs.

- **Exit:** Windows beta installs and runs; verifier rejects a plausible-but-unsupported completion; idle/warm RSS measured & published with the coordinator running; telemetry off-by-default verified; all UIs functional.

## P9 — Desktop computer-use (E9) + remaining post-v1

E9 is required ChatGPT+Claude desktop parity (native windows, see-pane, Guard-2) — not built, not a cut. Other P9+ items stay sequenced: WASM fuel sandbox (I3), voice input (H15), remote session handoff (H18), local OpenAI-compatible server (A8), HTML→video, magic completion (H16), connector sync→RAG, AutomationBench, community skills marketplace, self-hosted MCP hub, image generation (A10), clipboard (H26), voice TTS (H28).

## P10 — End-to-end testing & QA (≈4 wks, parallel)

Integration suites (12 E2E flows); security & adversarial (red-team corpus, 50+ injection payloads, 10K path fuzz, symlink/TOCTOU, Guard-2 non-bypass, revoked key, sidecar crash mid-call, kill-core → children die <5s, malicious SKILL.md, over-privileged manifest); performance & stress (cold start, RSS, IPC, snapshot, retrieval, FTS5, compaction, concurrency, tabs×agents, scheduled volume, heap, battery, 4hr stability); cross-platform (Win 11 / macOS Sequoia ARM / Ubuntu 24.04; WSL; updater; vault migration; Ollama; Chrome/Edge fallback); regression & CI/CD (matrix, LibreOffice oracle, nightly E2E, perf artifacts, pre-commit, release pipeline).

- **Exit:** all E2E suites green; 0 path escapes; no orphan processes; benchmarks hit targets; release artifacts on all 3 platforms.

## P11 — UI/UX design & optimization (≈3 wks, parallel)

Design system; core UX flows (onboarding, empty/error/loading, Guard-2 card, multi-agent view, blueprint editor, office edit UX, cockpit quiet↔expanded, MCQ card); generative UI (H25, sandboxed); resumable streams (H27); accessibility & i18n (WCAG 2.2 AA target); performance UX (skeletons, optimistic UI, virtualization, LCP <1s, TTI <2s); user research & feedback loop.

- **Exit:** design system adopted; supported-surface WCAG 2.2 AA criteria pass; LCP/TTI targets met; feedback loop live.

## P12 — Market research & go-to-market (≈4 wks, parallel)

Competitive analysis + gap matrix; personas + priorities + value props; positioning & messaging; launch strategy (repo, README, beta 50–100); docs & community; monetization research (**v1 = 100% free**).

- **Exit:** launch plan + assets ready; beta testers onboarded; docs live.

## Risk register

Top risks and mitigations (Bun sidecar perf → pre-spawn + Rust hot paths; CDP fragility → pinned chrome-for-testing + tolerant client; Office byte-preservation → conformance oracle + feature flags; OAuth ToS volatility → encrypted store + BYOK degrade; scope creep → matrix 09 is the contract) are tracked with their owning phases in `TODO.md`.
