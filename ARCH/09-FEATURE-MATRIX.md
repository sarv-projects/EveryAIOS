# 09 — Capability → Feature → Module Matrix (the complete derivation)

> Every capability from the research corpus (docs 01–34, 142 repos) + the v2.0 matrix + the user's explicit requirements. **No scope cuts.** Status legend: 🟢 = exists (reuse from @personal-ai/core-*) · 🟡 = new (build) · 🔵 = new-in-Rust (everyaios-*) · ⚪ = later/optional. Module refs: sidecar = packages/coordinator + core-*; Rust = crates/everyaios-*; UI = ui/.

## A. Model & BYOK layer

| # | Capability | Feature | Module | Status | Source |
|---|---|---|---|---|---|
| A1 | Multi-provider BYOK | ProviderAdapter: anthropic/openai/responses/azure/bedrock/gemini/openrouter/deepseek/openai-compat/ollama/llamafile | sidecar (core-providers) + Rust vault | 🟢+🔵 | doc 19 |
| A2 | **Multi-key per provider** | Key rings: add N keys/provider, priority+weight, per-key model filter, budgets, health | Rust everyaios-vault | 🔵 **NEW (user req)** | 03 |
| A3 | **Auto-failover rotation** | 429/401/5xx → cooldown → immediate next key; max-switches; all-fail backoff | Rust everyaios-vault | 🔵 **NEW (user req)** | 03 |
| A4 | OAuth subscriptions | chatgpt-pro (PKCE) / copilot·qwen (device-code), encrypted tokens, same fallback semantics | Rust everyaios-vault + sidecar | 🔵 | 33 §7.4, 13 §5.5 |
| A5 | Local models | Ollama managed + llamafile single-binary; ≥15–20K ctx warning | Rust spawn + sidecar | 🟢+🔵 | 34 §2 |
| A6 | Model catalog + hints | capabilities (tools/vision/ctx), router picks per task | sidecar core-providers | 🟢 | doc 19 |
| A7 | Asymmetric tiering | planner_model / subagent_models / depth=2 / concurrency=6 / writers=3 | sidecar (blueprint) | 🟡 | doc 16/05 |
| A8 | Local OpenAI-compatible server | expose engine on localhost for VS Code/Cursor reuse | Rust everyaios-mcp (additional endpoint) | 🟡 | v2.0 §P3 |
| A9 | Cache-aware costs | cache_read/cache_write/$ per call, key-affinity | sidecar + Rust audit | 🔵 | 05, doc 05 |

## B. Agent orchestration

| # | Capability | Feature | Module | Status | Source |
|---|---|---|---|---|---|
| B1 | Agent loop (pi-style) | streaming, length-guard (fail truncated tool calls), model-swap hook, cost ledger | sidecar core-engine | 🟡 (loop) | doc 05/16 |
| B2 | Spec-driven blueprints | .md → agent registry; continuous plan rewrite; dependency resolution; resume-after-reboot | sidecar (new loader) | 🟡 | v2.0 §P2, doc 03 |
| B3 | Sub-agents | role isolation, own context+workspace, DELEGATE_BLOCKED_TOOLS | sidecar | 🟢+🟡 | doc 16 |
| B4 | Inter-agent messaging | peer-review, cross-check, request sub-routines; no recursive spawn | sidecar | 🟡 | doc 03 |
| B5 | Grammar-enforced extraction | ```blocks → tool calls (weak models) | sidecar core-engine | 🟢 | v2.0 §P3 |
| B6 | Iteration budgets | per-agent turn caps; subagent caps (Hermes 500/50 pattern) | sidecar | 🟡 | doc 16 |
| B7 | Scheduled tasks | cron/interval/event/webhook; nudge sentinels (suggest_schedule) | sidecar core-automations + UI | 🟢+🟡 | 33 §7 |
| B8 | Crystallization | multi-step workflows → deterministic loops, 0 tokens | sidecar core-automations | 🟢 | v2.0 §P7 |

## C. Memory & context

| # | Capability | Feature | Module | Status | Source |
|---|---|---|---|---|---|
| C1 | 7 memory algorithms | polarized, compass, phantom thread, anticipation, spreading activation, KG+conflict, decay | sidecar core-memory | 🟢 | 07, v2.0 §3 |
| C2 | Multi-tier memory | sensory/working/episodic/semantic/procedural + Letta paging | sidecar | 🟢+🟡 | 07, 34 §2 |
| C3 | Multi-signal retrieval | FTS5+vec+graph+temporal fusion, budgets, snippets | sidecar (new fusion) | 🟡 | 07, 34 §2, 32 |
| C4 | Vectorless default | FTS5/BM25 retrieval without embeddings | sidecar core-files | 🟢 | 32, 34 |
| C5 | Embeddings (optional) | on-device bge-micro/gte-small, int8/vec0 | sidecar core-files | 🟢 | v2.0 §P4 |
| C6 | Knowledge graph store | LadybugDB embedded graph (Kuzu community fork — Kuzu abandoned Oct 2025; C++, ACID, Cypher, vector+FTS built-in), temporal edges | sidecar (new) | 🟡 | 07, 34 §2 |
| C7 | Memory injection | warm set 0ms TTFT, scope-leakage floors, budgets | sidecar + 05 | 🟢+🟡 | 07 |
| C8 | Sync/export/wipe | E2E-encrypted sync (opt-in), export, per-scope wipe | sidecar core-sync | 🟢 | v2.0 §P8 |
| C9 | **Taste profile** | auto-learned coding-preference profile (style/patterns/frameworks/naming) with confidence scores 0–1; stored as shareable markdown (`~/.everyaios/taste/` + per-repo `.everyaios-taste/`); injected as a stable-prefix symbolic prior at generation; learns from accept/reject/edit via correction-detector + audit (Command Code taste-1 pattern — proprietary, pattern only) | sidecar (core-memory + new taste store) | 🟡 **NEW** | doc 37 |
| C10 | **Pass-by-reference context** | files/datasets/tool results exposed as **live handles + bounded previews** (head/tail + type metadata); agent queries/slices them via sandboxed script-eval (E4) instead of serializing payloads into context (NOOA pattern — never serialize what you can reference) | sidecar + E4 script-eval | 🟡 **NEW** | doc 39 |

## D. Office & files (user-critical)

| # | Capability | Feature | Module | Status | Source |
|---|---|---|---|---|---|
| D1 | **Word open+edit** | block-patch engine, byte-preserving w:t, headers/tables/sections | sidecar office/docx | 🟡 **NEW** | 28, 04 |
| D2 | **Excel open+edit** | IronCalc recalc + calamine read + workbook DSL + deterministic planner + flash-fill/pivot | Rust sidecar + sidecar | 🟡 **NEW** | 28, 04 |
| D3 | **PPT open+edit** | surgical OOXML part editing (slides), add/remove slides, text/shape ops | sidecar office/pptx | 🟡 **NEW** | 04 |
| D4 | **PDF open+edit** | render (pdf.js), form-fill/annotate (pdf-lib), text-swap (lopdf), redact, re-author | sidecar + Rust bridge | 🟡 **NEW** | 04 |
| D5 | Universal read/ingest | markitdown-class extraction → RAG, chat overlay | sidecar core-files | 🟢 | v2.0 §P1 |
| D6 | Round-trip conformance | LibreOffice oracle in CI, byte-stability asserts | CI | 🟡 | 29, 04 §4.4 |
| D7 | Rollback | snapshotBefore, atomic writes | sidecar office | 🟡 | 28 §2 |
| D8 | Legacy formats | .doc/.xls/.ppt → convert-on-open, read-only | Rust + optional soffice | 🟡 | 04, 29 §3a |

## E. Browser & computer use

| # | Capability | Feature | Module | Status | Source |
|---|---|---|---|---|---|
| E1 | CDP child browser | system Chrome/Edge + chrome-for-testing fallback | Rust everyaios-cdp | 🔵 | 33, 34, 08 |
| E2 | 17-tool catalog | tabs..run (8.2) | Rust everyaios-mcp | 🔵 | 33 §6 |
| E3 | A11y snapshot/diff | refs [eN], interactive mode, URL-change short-circuit | Rust everyaios-browser | 🔵 | 33 §5, 08 |
| E4 | Script-eval (run) | rquickjs sandbox + browser SDK + InnerCallHook | Rust everyaios-script | 🔵 | 33 §6.3, 08 |
| E5 | Session replay | injected recorder → NDJSON → SQLite; scrubber UI; has_gap | Rust everyaios-audit + UI | 🔵 | 33 §9, 08 |
| E6 | Tab ownership | mine/user/other-agent; claims; group-per-agent | Rust everyaios-browser + audit | 🔵 | 33, 08 |
| E7 | Login import/sessions | capture-in-browser sign-in (vault path 1); optional Chrome profile import (path 3) | Rust everyaios-browser | 🔵 | 33 §3.2, 08 §8.9 |
| E8 | Authenticated scraping | logged-in sessions → tiered scrape → RAG | Rust+sidecar | 🟡 | 01/06 |
| E9 | Computer-use (pixels) | GUI control (post-v1, gated) | Rust (later) | ⚪ | v2.0 §P8, 09 |
| E10 | **Lightweight engine tier** | Lightpanda (Zig, opt-in, AGPL — ~16× less memory) + Obscura (Rust, default — ~30MB RSS) via CDP; tier 0 static→1 lightweight→2 full escalation | Rust everyaios-cdp | 🔵 **NEW** | 08 §8.8 |
| E11 | **Session Vault** | multi-account per site, encrypted cookies/localStorage in SQLCipher, Trust-Ladder-gated access (agent never sees raw cookies), rotation, usage audit, expiry nudges | Rust everyaios-vault + everyaios-browser | 🔵 **NEW (user req)** | 08 §8.9 |
| E12 | **Challenge handler** | PoW captchas solved locally + LLM visual-grounding + human-in-loop pass-through (default) + optional BYO solver API (user key) | Rust everyaios-core + sidecar | 🔵+🟡 **NEW** | 08 §8.10 |
| E13 | Session inheritance | live-attach to user's own Chrome profile via CDP debug port (vault path 2, no re-login) | Rust everyaios-cdp | 🔵 **NEW** | 08 §8.9 |
| E14 | Behavioral realism | humanized input events (Bézier mouse curves, typing cadence), optional per-site | Rust everyaios-cdp | 🔵 **NEW** | 08 §8.10 (CloakBrowser pattern) |

## F. Connector hub

| # | Capability | Feature | Module | Status | Source |
|---|---|---|---|---|---|
| F1 | Hub routing | native → Composio → Zapier → Nango → Auth Bridge; no double-connect | sidecar core-connectors | 🟢+🟡 | 13 |
| F2 | Native adapters | 27+ direct adapters | sidecar core-connectors | 🟢 | v2.0 §3 |
| F3 | Browser-session connectors | drive logged-in web apps via browser layer | Rust+sidecar | 🔵+🟡 | 13, 08 |
| F4 | Local Auth Bridge | project PKCE client, no secret, local token manager | Rust everyaios-vault | 🔵 | 13 §5.5 |
| F5 | Composio/Zapier/Nango | user-key, self-hosted/optional (never required) | sidecar | 🟢 (partial) | 12/13 |
| F6 | MCP client (consume) | connect external MCP servers, reconcile | sidecar | 🟢 (built client) | 10 |
| F7 | MCP server (serve) | our tools to Claude Code/Codex/Cursor/... via one endpoint | Rust everyaios-mcp | 🔵 | 33 §8, 34 §2 |
| F8 | Harness installer | plan-before-touch install into 7 harnesses, ownership markers | Rust (new) | 🔵 | 33 §8 |
| F9 | Unified Tool Registry | one normalized ToolDefinition + permission classes; **adopts ACP tool-kind taxonomy** (read/edit/delete/move/search/execute/think/fetch/other, doc 45 §4.3) | sidecar core-tools | 🟢 | 10, 45 |
| F10 | WSL/POSIX bridge | `wsl.exe` runners, `\\wsl.localhost\` paths, loopback IPC, native script exec in Linux | Rust everyaios-core + sidecar | 🟡 | doc 03 §5, v2.0 §P5 |
| F11 | Port/network hooks | async loopback listeners, inbound/outbound monitor, webhook ingress — gated behind trust levels | Rust everyaios-core | 🔵 | doc 03 §5 |
| F12 | Harness-driving | drive the user's existing agent CLIs (Codex/Claude Code/Cursor/Grok/OpenCode/Cline/Pi) side-by-side on the same workspace — own context each, shared files + session state, Trust-Ladder-gated + audited (reverse of F8; OpenWebUI Computer pattern). **External interface = ACP (Agent Client Protocol)**: our app = Client, stdio JSON-RPC, permission requests → Guard-2 cards, tool calls/file ops → audit NDJSON, cancel → watchdog kills (doc 45) | sidecar + Rust everyaios-core | 🟡 **NEW** | doc 35 §C, 45 |
| F13 | Messaging bridges | WhatsApp/Telegram/Signal/iMessage adapters to the same agent engine — 24×7 assistant on the user's own accounts, scheduled reminders + memory reuse (Secure OpenClaw pattern; DeerFlow 2.0 channels = 10-IM-adapter reference impl w/ run_policy + dedupe, doc 39 §B1) | sidecar | 🟡 **NEW** | doc 36 §B |

## G. Search & research

| # | Capability | Feature | Module | Status | Source |
|---|---|---|---|---|---|
| G1 | Free search cascade | searxng-first + public instances + circuit breaker + BM25 rerank | sidecar core-search | 🟢 | v2.0 §P7 |
| G2 | Deep research | breadth×depth tree, learnings-up, gap-check, cited reports | sidecar | 🟢+🟡 | 07 |
| G3 | Multi-channel search | arXiv/GitHub/EDGAR/Reddit adapters | sidecar | 🟡 | 07 |
| G4 | Data-analysis REPL | sandboxed pandas/numpy for CSV/Excel/SQLite | sidecar + sandbox | 🟡 | 07 |
| G5 | Repo-wide engineering | scan/dep-map/test-loop/patch in workspace | sidecar + sandbox | 🟡 | v2.0 §P7 |
| G6 | Site/domain search | SeekStorm-class inverted index for local corpora | sidecar | 🟡 | 32/21 |

## H. UI & product

| # | Capability | Feature | Module | Status | Source |
|---|---|---|---|---|---|
| H1 | Chat | streaming, token streamer, message branching, artifacts | UI | 🟢 (port) | v2.0 §P1 |
| H2 | Cockpit dashboard | live agent cards, Watch/Stop, recent sessions | UI | 🟡 | 33 §9.5 |
| H3 | Audit + replay UI | searchable sessions, per-step screenshots, scrubber | UI | 🟡 | 33 §9.5 |
| H4 | Blueprint editor | live execution status on .md | UI | 🟡 | v2.0 §P2 |
| H5 | Office editors | docx/xlsx/pptx/pdf views + chat overlay | UI | 🟡 | 04 |
| H6 | Reader | PDF/EPUB/web/markdown universal reader | UI | 🟢 (port) | v2.0 §P1 |
| H7 | Math + code rendering | KaTeX, syntax highlight + run/compile | UI | 🟢 (port) | v2.0 §P1 |
| H8 | Permission cards | Guard-2 diff cards, trust ladder UI | Rust+UI | 🔵+🟡 | 06 |
| H9 | Token/cost analytics | per-key/per-session dashboard | UI+Rust | 🔵+🟡 | 05 §5.6 |
| H10 | Personality | SOUL.md, user-tunable, core rules inviolable | sidecar+UI | 🟡 | v2.0 §P1 |
| H11 | Tray daemon | watchers + automations headless | Rust | 🔵 | v2.0 §P7 |
| H12 | Telemetry | opt-in, enumerated fields, no content | Rust | 🔵 | 33 §11 |
| H13 | Local OpenAI-compatible server UI | expose + manage | Rust | 🟡 | A8 |
| H14 | Scheduled tasks UI | create from chat (nudge cards) + settings | UI | 🟡 | 33 §7, v2.0 |
| H15 | Voice input (VAD) | hands-free chat, speech-to-text (BrowserOS/mobile pattern) | UI | ⚪ | 33 §10 |
| H16 | Magic-completion | inline context-aware completion (AnythingLLM Magic Tab, optional) | UI | ⚪ | 01 |
| H17 | Widget cards | inline render: weather, stock (yahoo-finance2), math/calc, lookups (Vane pattern) | UI | 🟡 **NEW** | doc 35 §B |
| H18 | Remote session handoff | LAN/Tailscale/tunnel view — resume a running desktop session from phone mid-run (opt-in; extends B2 resume + C8 sync) | Rust + sidecar | ⚪ | doc 35 §C |

## I. Forge & skills

| # | Capability | Feature | Module | Status | Source |
|---|---|---|---|---|---|
| I1 | Code synthesis loop | write→sandbox→test→iterate | sidecar + sandbox | 🟡 | v2.0 §P6 |
| I2 | Skill registry | ~/.everyaios/skills/, manifest + ownership markers, auto-inject into planner | sidecar + Rust | 🟡 | v2.0 §P6, 33 §8 |
| I3 | WASM fuel-metered sandbox | compute budget + epoch kill | Rust (later) | ⚪ | 09 |
| I4 | TDD loop | auto-generate tests, read stderr, rewrite | sidecar | 🟡 | v2.0 §P6 |
| I5 | ECC guardrails | plan-before-build, session scanning | sidecar | 🟡 | 09 |
| I6 | **Extension/plugin ABI** | versioned bundles (`abi_version`, cumulative host adapters — Zed WIT `since_v0_0_x` pattern); typed manifest: `contributes` + `capabilities` allow-lists with `*`/`**` arg wildcards (Zed `CapabilityGranter`); fail-closed per-extension trust flags (Hermes `allowed_*`); explicit agent-binding (Cherry Studio); lazy activation (VS Code); host facades `ctx.llm`/`ctx.files`/`ctx.approval()`; dogfood first-party plugins | sidecar + Rust everyaios-guard | 🟡 | 44 §5 |

## J. Cross-cutting

| # | Capability | Feature | Module | Status | Source |
|---|---|---|---|---|---|
| J1 | Trust Ladder | 0–100 graduated permissions, 15 tests built | sidecar core-tools | 🟢 | 06 |
| J2 | Guard-1 regex interceptors | compiled blocklist, pre-exec scan | Rust everyaios-guard | 🔵 | 06, 03 §8 |
| J3 | Guard-2 diff cards | native click-to-approve, non-bypassable | Rust everyaios-guard | 🔵 | 06 |
| J4 | Path/scope hard-floors | canonicalization, symlink-safe boundaries | Rust everyaios-guard | 🔵 | 06 |
| J5 | Audit trail | append-only, token estimates, receipts, replay | Rust everyaios-audit | 🔵 | 33 §9, 06 |
| J6 | Prompt-injection defense | <user_document> wrapping, context scan, tool-result sanitization | sidecar+Rust | 🟡 | 06, 25 |
| J7 | ProcessSupervisor | spawn/restart/backoff/circuit-breaker | Rust everyaios-core | 🔵 | v2.0 §4.3 |
| J8 | Key vault | SQLCipher, CES executor, crash scrubbing | Rust everyaios-vault | 🔵 | 06 §6.8 |
| J9 | Config-as-files | everyaios.toml + agents/*.md + providers.toml | all | 🟡 | v2.0 §7.6 |
| J10 | Watchdog | connect/idle timeouts re-armed per byte | Rust+sidecar | 🔵+🟢 | 28 §3 |
| J11 | Hard $ budget per session | default $2.00/agent; core-providers live-pricing + sqlite counters; kill sidecar on exceed; "stopped: $X limit" UI; reasonix token discipline upstream brake | sidecar+Rust | 🟡 | 43 |
| J12 | Orphan-prevention on Rust death | Linux `prctl(PR_SET_PDEATHSIG, SIGKILL)`; Windows Job Object `KILL_ON_JOB_CLOSE`; macOS posix_spawn process group; 5s parent-PID poll belt+suspenders | Rust everyaios-core | 🔵 | 43 |
| J13 | Sidecar heap safety | `--max-old-space-size=512`; self-restart at 80% heap; resume from last Hermes checkpoint (20snap/500MB); 30min rotation | Rust+sidecar | 🔵+🟢 | 43 |
| J14 | Distributed tracing | OpenTelemetry Rust↔Node shared trace_id; audit gains trace_id+span_id | Rust+sidecar | 🟡 | 43 |
| J15 | Length-prefixed IPC framing | `[u32 LE][payload]`; bounded channels (cap 16) + backpressure; truncation → `ref:` handle | Rust everyaios-ipc | 🔵 | 43 |
| J16 | Process lifecycle hardening | UNIX socket over TCP (zero port collision); pre-spawn coordinator at boot (~60MB Bun binary — realistic; 25MB is hello-world-only, doc 43 §1.3); warm-pool 5min idle | Rust everyaios-core | 🔵 | 43 |
| J17 | **ACP harness bridge** | ACP client over stdio JSON-RPC (official Rust crate or `@agentclientprotocol/sdk`) for F12; `initialize` handshake (protocolVersion + optional-by-default capabilities); `session/request_permission` → Trust Ladder + Guard-2; `session/update` → audit NDJSON; `session/cancel` → watchdog/budget kills; v2-draft monitored | Rust + sidecar | 🟡+🔵 | 45 |

**Totals:** 109 feature rows · status buckets: 🟢 26 · 🟡 52 · 🔵 40 · ⚪ 5 (multi-status rows like `🟢+🔵` are counted in every bucket they carry). The build plan (10) sequences these so every milestone ships working value.
