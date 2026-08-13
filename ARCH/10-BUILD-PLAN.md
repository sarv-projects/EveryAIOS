# 10 — Build Plan (phases with exit criteria)

> Sequencing merges v2.0 §5 phases with the research M0–M9 (RESEARCH spec §5) and the Rust-layer reality (browser/script/guard/audit are new and Rust). Each phase has an **exit criterion that can be verified by a test**, honoring the "no failures / edge cases" goal (each phase adds an edge-case hardening pass + the conformance/adversarial test suites). P10 (testing/QA), P11 (UI/UX) and P12 (market/GTM) run **in parallel** with P0–P8 (see TODO.md P10–P12 for the full task breakdown).

## P0 — Workspace & skeleton (≈2 wks)
- Rust workspace (`crates/*`), TS workspace (`packages/coordinator` + `ui`), pnpm linking to `@personal-ai/core-*`, CI (cargo test, vitest, tauri build matrix).
- `everyaios-core` binary boots headless (config, dirs, vault init, SQLite schema v1), `everyaios-ipc` stdio JSON-RPC framing, ProcessSupervisor spawning a hello-world sidecar.
- **Exit:** `cargo test` green; sidecar E2E "echo" over IPC green; `everyaios-core --version` prints; config from `everyaios.toml` loaded; vault opens/creates SQLCipher db; Tauri window shows React shell; sidecar heap safety (J13) + watchdog (J10) + UNIX-socket/pre-spawn (J16) tasks land in P0.

## P1 — Chat + BYOK key-rings (≈4 wks)
- ProviderAdapter (A1) + **key-ring vault (A2/A3)**: add N keys/provider, priority/weight, cooldowns, auto-failover, budgets, health UI.
- Sidecar chat loop (streaming) + UI chat; token/cost ledger (A9); cache-aware costs.
- OAuth subscription flows (A4) behind a flag.
- **Exit:** two keys under one provider auto-failover under a simulated 429 (unit test + manual UI); streaming chat round-trip with a real BYOK key; ledger rows correct; $ budget kills session (J11).

## P2 — Browser layer (≈6 wks)
- everyaios-cdp + everyaios-browser: spawn system Chrome/Edge, CDP discovery, snapshot/diff/refs, input, 37-tool catalog served via everyaios-mcp (stdio first, then HTTP).
- **Tiered engines (E10):** **Lightpanda** lightweight CDP tier (**default** for scrape/RAG) + **Obscura** opt-in; tier 0 static → 1 lightweight → 2 full escalation; spawn-only license discipline.
- **Session Vault (E11):** SQLCipher-encrypted multi-account sessions (cookies/localStorage), Trust-Ladder-gated access (agent never sees raw cookies), rotation, usage audit; capture paths 1–3 incl. **live-attach session inheritance (E13)**.
- **Challenge handler (E12/E14):** PoW local solver + human-in-loop pass-through (default) + behavioral-realism input layer; optional BYO solver API behind a flag.
- **Script-eval (E4):** everyaios-script (`run`/`evaluate`) rquickjs sandbox + `browser` SDK + InnerCallHook (every primitive authorized → recorded → page-claims captured); ownership-filtered `pages.list()`.
- **Session replay (E5):** injected recorder → NDJSON ingest → replay store; sticky `has_gap`; durable event log + idempotency classes; 7-day retention.
- Ownership isolation + tab claims + audit rows.
- **Exit:** scripted browser E2E: navigate → snapshot → act (click/fill) → diff → assert (headed on dev box / headless chrome-for-testing in CI); ownership: agent cannot close a user tab (test); scrape task runs on Obscura tier and escalates to Chrome only on JS-render need (test); session-vault round-trip (capture → grant → inject → revoke; agent never sees cookies — test); challenge surface → human-in-loop handoff works (manual); PoW challenge auto-solved locally (test); `run` executes a multi-step script with audited primitives (every primitive has an audit row); recording → replay round-trip with has_gap on a forced gap.

## P3 — Cockpit & audit UI (≈4 wks)
- Replay & audit UI (scrubber + per-step screenshots + searchable sessions); cockpit cards (Watch/Stop, quiet mode, MCQ interrupts); distributed tracing (J14).
- **Exit:** replay & audit UI round-trip; cockpit shows live + stop kills the loop.

## P4 — Office engine + storage intelligence (≈5 wks)  ← user-critical
- docx block-patch editor; xlsx (IronCalc sidecar + calamine + workbook DSL + deterministic planner); pptx part-editor; pdf (pdf-lib form/annotate + lopdf swap + re-author + redact); renderers in UI; conformance oracle wired.
- **Storage intelligence (D9–D11, G7 — doc 49):** `everyaios-storage` — parallel work-stealing walker (crossbeam-deque) + immutable arena snapshots (arc_swap, zstd save/load) + squarified treemap; 7-stage hash dedup (size → xxHash3 → BLAKE3, hardlink-aware, optional reflink); large-file finder; **Guard-2-ticketed cleanup**; SQLite FTS5 instant filename search + notify-watcher incremental updates.
- **Exit:** round-trip tests (open → edit → save → LibreOffice-reopen asserts byte-stable untouched parts); formula recalc correctness tests (IronCalc golden cases); pptx slide add/remove round-trip; pdf form fill test; every edit has snapshotBefore rollback; **scan fixture tree → treemap data + dedup report; zstd snapshot round-trip; FTS5 filename query <50ms (P4.8).**

## P5 — Memory fusion + token economy (≈5 wks)
- Multi-signal fusion (C3), LadybugDB graph backend (C6), Letta paging (C2), warm-set wiring (C7); **Taste profile (C9)** — taste store (`~/.everyaios/taste/` + per-repo), accept/reject/edit learning hooks on Guard-2 + audit, confidence-scored rules, stable-prefix injection; **ACT-R activation + spontaneous recall (#32, NOOA doc 39)** — retention/importance math + typed relational edges, pre-turn spontaneous block; **pass-by-reference context (C10)** — live refs + bounded previews via script-eval (E4); **ghost context prevention (7.5.1)** — file-event tombstone eviction via `notify` crate; compaction pipeline with Reasonix/BrowserOS/Janus knobs (05); snip rules; prefix-stability enforcement + cache-break events; per-session efficiency projections.
- **Exit:** retrieval benchmark (multi-hop + temporal queries) vs plain BM25 baseline (target: mem0-class gains); **pass-by-reference (C10) exit:** a 10MB file queried via ref-preview keeps in-context payload under a hard cap (≤2K tokens) and ACT-R recall (#32) passes the multi-hop + temporal query set; compaction triggers at ratios without breaking the loop; prefix-dirty handling tested; dashboard shows $/token per key.

## P6 — Orchestration + connectors (≈5 wks)
- Blueprint engine (B2), sub-agents (B3/B4), scheduling + nudge cards (B7), harness installer (F8), **harness-driving (F12)**: spawn/attach the user's existing agent CLIs (Codex/Claude Code/Cline/OpenCode/Grok/Pi) as side-by-side workers on the same workspace — own context each, shared files + session state, Trust-Ladder-gated + audited (Open WebUI Computer pattern, doc 35 §C); connector hub routing + browser-session connectors (F3) + Auth Bridge (F4) + optional Composio/Zapier/Nango (F5), MCP client reconcile (F6), **messaging bridges (F13)** — **desktop-first** (in-app cards, not a headless 24×7 daemon): email/Telegram/WhatsApp adapters first (Hermes/OpenClaw patterns, docs 36/39), Signal/iMessage + always-on daemon deferred (we start desktop, not CLI→headless), **email/calendar connectors (F14/F15, doc 50)** — Gmail/Google Calendar via Auth Bridge OAuth or IMAP/SMTP + ICS.
- **Exit:** two spec-driven agents with different models run a plan end-to-end; scheduled task fires headless; a harness config file gets a managed entry (plan-before-touch, foreign-entry refusal test); **two external agent CLIs run side-by-side on the same workspace with shared files + isolated contexts (test)**; **messaging-bridge round-trip via stub adapter (message in → agent loop → reply out, test)**; Gmail-via-browser-session connector drives a real flow (dev credentials); email read→summarize→reply round-trip via stub (F14).

## P7 — Forge + guardrails hardening (≈4 wks)
- Forge loop (I1/I2/I4/I5), **Extension/plugin ABI (I6)** — manifest.toml (abi_version, contributes, capabilities, trust_flags), CapabilityGranter allow-lists with `*`/`**` wildcards, lazy activation, fail-closed trust flags, dogfood rule; skill registry with auto-injection; adversarial test suite (cyber corpus, doc 26) against Guard-1/injection defense; Guard-2 diff-card UX polish; estop/OTP; path-floor fuzz tests.
- **Exit:** agent writes a skill that survives restart and is callable next session (the v2.0 exit criterion); plugin manifest rejects bad bundles + capability blocks unlisted exec (I6); 100% of the red-team pattern list blocked by Guard-1 or diff-card (test); path-floor escape fuzz = 0 successes.

## P8 — Product polish + release (≈3 wks)
- Reader/office/blueprint/analytics UI pass; **widget cards (H17 — weather/stock/math inline)**; personality; tray daemon; telemetry opt-in; packaging (Win/macOS/Linux installers); idle-RSS perf pass (**measure & publish real numbers** — <30MB idle / <80MB warm are targets to verify, not promises); docs.
- **Exit:** Windows beta build installs and runs; **idle/warm RSS measured & published with the coordinator running** (<30MB idle / <80MB warm are targets to verify, not promises — the Bun sidecar alone is ~93MB, J16); telemetry off-by-default verified (no requests without opt-in); all UIs functional.

## P9+ — Post-v1 (not in scope order)
Computer-use pixels (E9), WASM fuel sandbox (I3), voice input (H15, offline STT/wake-word ext — doc 50), remote session handoff (H18), local OpenAI-compatible server (A8), HTML→video reports, magic completion (H16), Nango sync→RAG, AutomationBench eval harness, community skills marketplace, self-hosted connector-hub server (doc 13 opt-in), **image generation (A10), clipboard tool (H26), voice output TTS (H28)** — the docs 49–50 gap-pass additions (138-row matrix). F14/F15 moved to P6, H25/H27 moved to P11 (matching TODO).

## P10 — End-to-end testing & QA (≈4 wks, parallel)
- Integration suites (12 E2E flows: install→BYOK→chat→tool; memory persistence; browser pipeline; office pipeline; sub-agents; crystallization; connector hub; ACP harness; scheduled headless; messaging stub; extension ABI; MCP server).
- Security & adversarial (cyber red-team corpus; 50+ injection payloads; 10K path fuzz; symlink/TOCTOU suite; Guard-2 non-bypass; revoked key; sidecar crash mid-call; kill everyaios-core → children die <5s; malicious SKILL.md; over-privileged plugin manifest).
- Performance & stress (cold start <2s; idle/warm RSS measured & published — <30MB/<80MB are verify-targets, not promises; IPC <2ms; snapshot <500ms; retrieval <100ms; FTS5 <50ms; compaction <3s; 50 concurrent calls; 10 tabs × 3 agents; 100 scheduled; heap <512MB @30min; battery; 4hr stability).
- Cross-platform (Win 11 / macOS Sequoia ARM / Ubuntu 24.04; WSL bridge; auto-updater; SQLCipher vault migration; Ollama; Chrome/Edge fallback).
- Regression & CI/CD (matrix: cargo test + vitest + Tauri build; LibreOffice conformance oracle; nightly E2E; perf regression artifacts; pre-commit hooks; release pipeline).
- **Exit:** all E2E suites green; 0 path escapes; no orphan processes; benchmarks hit targets; release pipeline artifacts on all 3 platforms.

## P11 — UI/UX design & optimization (≈3 wks, parallel)
- Design system (palette, typography, spacing 4px grid, component library, motion, icons, Figma file).
- Core UX flows (onboarding, empty/error/loading states, Guard-2 permission card, multi-agent view, blueprint editor, office edit UX, cockpit quiet↔expanded, MCQ interrupt card).
- **Generative UI (H25, AG-UI — doc 50):** agent-emitted live components over one JSON channel, sandboxed iframe renderer (strict CSP + process isolation, Anthropic Artifacts pattern); artifact cards upgrade from static previews to live components on demand.
- **Resumable streams (H27, doc 50):** coordinator holds in-flight stream state (last token/id); reconnect UI ("🔄 Reconnecting…" chip) + auto-resume from last token (LibreChat pattern); idempotent retry wiring per ARCH/03.
- Accessibility & i18n (WCAG 2.1 AA, keyboard nav, high-contrast, reduced-motion, locale files, RTL, font scaling).
- Performance UX (skeleton loaders, optimistic UI, virtual scrolling, progressive loading, debounced search, LCP <1s, TTI <2s).
- User research & feedback (beta feedback mechanism, NPS after 7d, 5 testers × 3 rounds, UX metrics, opt-in session recording).
- **Exit:** design system adopted across UI; WCAG AA pass; LCP/TTI targets met; feedback loop live.

## P12 — Market research & go-to-market (≈4 wks, parallel)
- Competitive analysis (AnythingLLM/Jan/Cherry/OpenWorker/Chatbox/Claude Code/Open WebUI hands-on; gap matrix vs top 5; positioning hooks: crystallization, office engine, memory algos).
- Personas (power dev, knowledge worker, privacy researcher, automation builder) + feature priorities + value props.
- Positioning & messaging (tagline, description, "Why EveryAIOS?", comparison pages, name, brand identity).
- Launch strategy (open-source repo + LICENSE, README, HN/Reddit/X/YouTube/Product Hunt, beta program 50–100).
- Docs & community (install/getting-started/provider/skill-plugin/ACP guides, CONTRIBUTING, SECURITY, docs site, Discord).
- Monetization research (open-core models, plugin marketplace potential, "EveryAIOS Pro" optional tier, pricing benchmarks; **v1 = 100% free**).
- **Exit:** launch plan + assets ready; beta testers onboarded; docs live.

## Risk register (top items, with mitigation)
1. **Bun-compiled sidecar perf** — mitigation: pre-spawn at boot, keep-alive, Rust hot paths already extracted (browser/script/guard/audit).
2. **CDP fragility across Chrome versions** — pinned chrome-for-testing for CI + fallback; protocol-version tolerant client (everyaios-cdp).
3. **Office byte-preservation complexity** — conformance oracle in CI on every save-path change; feature-flag edits until green.
4. **OAuth ToS volatility** — encrypted store + graceful degrade to BYOK (03 §3.6).
5. **Scope creep** — the matrix (09) is the contract; phases are feature-locked at kickoff.
