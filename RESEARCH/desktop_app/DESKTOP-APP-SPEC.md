# ⛔ SUPERSEDED — DO NOT USE AS THE BUILD SPEC

> **This file is an ARCHIVED draft** (final synthesis of docs 01–34, 2026-08-06, 142 repos, all-Rust-leaning).
> **The live master spec is `desktop_app/DESKTOP-APP-SPEC.md` — v3.16** (2026-08-14, docs 01–62, **255 repos**, 138-row matrix, frozen hybrid architecture).
> Everything in this archived copy is superseded: repo counts (142 vs 247), the all-Rust stack framing (now hybrid), and every v3.x feature/algorithm row. Keep it only as history; never build from it.

---

# DESKTOP-APP-SPEC — The Complete Specification (ARCHIVED v0)

> **Final synthesis of docs 01–34** (2026-08-06). 142 repos researched (33 code-level), every capability mapped to a source repo. This is the master build spec: product, architecture, capabilities, steal-map, build order. No scope cuts.
> **Companion docs:** 00-INDEX (reading order) · 27 (master ledger) · 03 (vision) · 19 (BYOK providers) · 32 (tokenmining) · 33 (BrowserOS source deep-dive).
> ⚠️ Every repo we copy *concepts* from: respect licenses (AGPL/ELv2/PolyForm = learn-don't-copy; MIT/Apache = copy-able design).

---

## §0 The product in one paragraph

An **ultra-lightweight, extremely fast, fully open-source personal AI desktop OS** — one Rust binary + a native webview shell (~20–40MB idle) that replaces the browser, the office suite, and scattered SaaS for your AI agent. It runs **entirely on your machine with your keys** (BYOK: Anthropic/OpenAI/OpenRouter/DeepSeek/Ollama/llamafile + OAuth subscriptions: ChatGPT Pro/Copilot/Qwen), no account required, nothing depends on our servers. The agent can **drive a real browser** (CDP-controlled Chromium), **edit local files**, **run sandboxed scripts**, **automate anything on a schedule**, **remember you** (multi-tier memory + knowledge graph), **audit every action** (replayable sessions), and **grow its own skills** (the Forge). Everything is token-mined: retrieve-not-preload, compress-not-repeat, structure-not-narrate, spend-on-reasoning.

**The non-negotiables**
1. **Open source** — anyone can install, run, fork. Zero server-side dependencies.
2. **Lightweight** — Rust core, native webview (Tauri), ~30MB idle, no Node, no Python, no Electron, no Docker.
3. **Fast** — sub-100ms tool latency, 0ms warm-memory TTFT, streaming UI.
4. **Local-first & private** — SQLite + on-disk everything, optional encrypted sync, telemetry opt-in.
5. **BYOK + local + subscription** — three model sources; never lock the user in.
6. **Safe by design** — Trust Ladder, regex interceptors, visual diff confirmations, sandboxed scripts, append-only audit.

---

## §1 System architecture (validated by SOTA research + source deep-dives)

```
┌────────────────────────────────────────────────────────────────────┐
│  UI LAYER — Tauri 2 native webview (React SPA)                     │
│  chat · cockpit dashboard · audit+replay · blueprints · settings   │
└───────────────▲─────────────────────────────────────┬──────────────┘
                │ IPC (tokio + tauri commands)         │ streamed events
┌───────────────┴─────────────────────────────────────▼──────────────┐
│  RUST CORE — one binary (the orchestrator)                         │
│  ┌────────────┬─────────────┬──────────────┬─────────────────────┐ │
│  │ Agent loop │  Tool       │  MCP server  │  Memory + KG        │ │
│  │ (planner / │  registry   │  (rmcp —     │  (SQLite + sqlite-  │ │
│  │ executor / │  17+ tools  │  Streamable  │  vec + FTS5 + Kuzu) │ │
│  │ sub-agents)│             │  HTTP/stdio) │                     │ │
│  ├────────────┴─────────────┴──────────────┴─────────────────────┤ │
│  │  Compaction · Crystallizer · Scheduler · Trust Ladder · Audit │ │
│  └───────────────────────────────────────────────────────────────┘ │
└───────────────▲─────────────────────────────────────┬──────────────┘
                │ CDP (WebSocket, loopback)             │ NDJSON recording
┌───────────────┴─────────────────────────────────────▼──────────────┐
│  BROWSER SUBSYSTEM — Chromium child process (CDP)                   │
│  system Chrome/Edge w/ --remote-debugging-port · fallback:          │
│  chrome-for-testing download · injected recorder script → replay   │
└────────────────────────────────────────────────────────────────────┘
```

**Why not Electron/Node/Python?** Every heavyweight competitor pays RAM+latency for Chromium/Node — AnythingLLM (~500MB+), LibreChat, Open WebUI. The corpus's own family (ZeroClaw, IronClaw, BrowserOS's Rust server) already proved the Rust pattern works at production scale. **One language for the whole core = one binary, no runtime, faster than any Node loop.**

**Browser decision (the hard one):** BrowserOS forks Chromium (10+ patch layers, custom importer, native `browser_os` API, embedded servers) — a multi-hundred-MB build effort we do **not** replicate. Our equivalent: drive **system Chrome/Edge as a child process over CDP** (loopback, token-gated) with a **chrome-for-testing fallback** for users without Chrome, and implement session-recording with an **injected recorder content-script** streaming NDJSON to our core (replicating BrowserOS's ingest contract — `x-recording-tab-id/document-id/batch-id`, sticky `has_gap`) instead of fork-native capture. We get ~90% of BrowserOS's capability with ~5% of the build effort. (Docs: 33 §3, 20 rustwright, 06 browser tools.)

---

## §2 The 12 capability pillars

### P1 — Agentic orchestration (multi-agent, asymmetric)  `→ ZeroClaw, IronClaw, AIOS, OpenClaw, AutoGPT`
- **Planner → Executor loop** with graph-based scheduling (never rigid linear chains).
- **Sub-agents**: role isolation (Architect/Code/Data/Log personas), spawnable workers with own context + workspace, RPC between them, inter-agent messaging matrix (docs 03 §3, 16).
- **Asymmetric tiering**: expensive reasoning models for planning; cheap/fast models for logs, greps, big data; local models for bulk. `ModelProvider` trait + hint-based router (ZeroClaw kernel ABI — copy the trait list verbatim: `ModelProvider, Channel, Tool, Memory, Observer, RuntimeAdapter, Peripheral`).
- **Deterministic shortcuts**: any step needing no cognition (math, file ops, waits) bypasses the LLM entirely → Crystallizer (P8).
- *Steal from:* ZeroClaw crate map (17 crates → our module map), IronClaw Router/Scheduler/Worker, AIOS kernel services, AutoGPT plan-and-execute.

### P2 — Spec-driven orchestration (Markdown blueprints)  `→ doc 03 §2, GenOffice, n8n`
- The workspace is **driven by a .md blueprint file** the agent writes and rewrites: headers, agent tables, targets, bulleted execution lists → parsed into an execution graph (dependencies → parallel/sequential resolution).
- Agents update their own blueprint as they discover files/systems — a live status trail, human-readable at all times.
- `suggest_schedule` sentinel tools (BrowserOS nudge pattern): the agent proposes automations; the UI renders a confirmation card.

### P3 — The browser layer (real agent browser)  `→ BrowserOS (33), browser-use, Playwright patterns, rustwright`
- **17-tool surface** (BrowserOS catalog, source-read): `tabs, tab_groups, history, navigate, snapshot, diff, act, download, upload, read, grep, screenshot, pdf, wait, windows, evaluate, run`.
- **A11y snapshot engine**: page → indented accessibility tree with stable `[ref=eN]`, iframe stitching, depth caps; **line-diff with URL-change short-circuit**; refs scoped to (document, url) so they never leak across navigations. Loop: `snapshot → act → (act returns post-settle diff) → re-snapshot only for fresh refs`.
- **`run`/script-eval (Think in Code)**: rquickjs/QuickJS-NG sandbox (64MB/512KB/30s) exposing a `browser` SDK; **ownership isolation** (`mine | user | other-agent`); **per-primitive audit via InnerCallHook** — scripts cannot bypass the audit trail. One `run` replaces 40+ round-trips. (This is doc 32's "structure instead of narrate".)
- **Session replay**: injected recorder streams DOM/mutation events → NDJSON → SQLite; playback like a video with scrubber + synced action timeline; honest `has_gap` on incomplete recordings; screenshots per step; 7-day retention.
- **One-click Chrome login import**: user signs in once in our browser; the agent uses those sessions (docs: privacy — agent tabs are isolated; your tabs are never touched unless asked).

### P4 — Files & documents (the office-suite replacement)  `→ GenOffice (28), LibreOffice (29), markitdown, docx-rs/calamine`
- **Surgical editing** (GenOffice's block-patch): minimal `w:t` prefix/suffix patches that preserve unknown OOXML bytes (model-based re-serialization like LibreOffice is **lossy** for unknown parts — never do that for edits).
- **Deterministic-planner** (GenOffice): regex NLP → DSL → zero-LLM common operations (tables, formatting, recalcs) — the Crystallizer in the document domain.
- **xlsx sidecar**: Rust (calamine read + ironcalc recalc) for spreadsheet math — no model hallucinations in calculations; `calamine`-based 100K+ row virtualized tables.
- **Universal extraction**: markitdown-style → markdown for any file (PDF/DOCX/XLSX/PPTX/html/epub).
- **LibreOffice = reference + conformance oracle** in our test suite (open→edit→save→reopen, assert untouched regions byte-stable), never a runtime dependency.

### P5 — Memory & knowledge (the 7 algorithms + 2026 SOTA)  `→ docs 03 §4, 32, mem0/letta/graphiti/cognee/kuzu/txtai`
Five-layer memory with **multi-scope identity** (user/agent/session/project — no cross-contamination):
1. **Sensory** (live windows/keystrokes/clipboard) — sliding buffer.
2. **Working** (conversation context) — the token window.
3. **Episodic** (SQLite event log: what happened, when, with which tools).
4. **Semantic** (facts, notes, docs → FTS5 + sqlite-vec hybrid).
5. **Procedural** (skills, workflows, conventions — the Forge output).

The **7 algorithms** (all with SQLite/Rust impl notes from the research):
- **#7 Polarized Memory** — `sentiment_polarity` column; normal recall filters `>= 0`; defensive queries ("what should I avoid?") flip to surface the negative ranked first.
- **#8 Hallucination Risk Compass** — post-generation score (retrieval confidence × source coverage ÷ hedging density, length-normalized); high-risk bands → auto-flag or silent self-check loop.
- **#10 Phantom Thread** — activity-aware **warm set** (`RwLock<Vec<Fact>>` top-5 by current project/session) injected with **0ms TTFT**; strict leakage floor (financial facts never enter a sci-fi session).
- **#12 Trust Ladder** — see P11.
- **#4 Temporal Graph Anticipation** — weekly-rhythm predictor; proactive morning briefs, pre-indexing files you open every Monday 9am.
- **#1 Crystallization** — see P8.
- **#7 Spreading Activation (SYNAPSE)** — Kuzu adjacency graph; entity activation with per-hop decay + **lateral inhibition**; re-ranks FTS5+vector results. (Kuzu = embedded zero-dep graph DB — validated choice vs heavy Neo4j/Qdrant.)

**2026 SOTA grounding (web research + mem0 live):** multi-signal retrieval (semantic + BM25 + entity-graph boost fused → +29.6 temporal / +23.1 multi-hop), bounded retrieval budgets (~7K tokens per call), Letta-style **agent-managed context paging** (core/archival/recall — the agent itself decides what to page in/out). Our design adopts all three.

### P6 — The connector hub (local-first; no cloud proxy)  `→ docs 12/13, harness-integrations (33 §8), ZeroClaw channels`
- **Two local paths, zero servers:**
  1. **Browser-session connectors** — the agent drives the logged-in web app through the browser layer (Gmail/Notion/Linear/whatever you're signed into). No API keys, no OAuth, works with every site. This is the 80% solution.
  2. **OAuth connectors** — public-client PKCE/device-code flows (ChatGPT Pro, GitHub Copilot, Qwen, Google, GitHub…) with **encrypted token store** (SQLCipher — we already ship SQLCipher rebuild tooling), local callback port, per-connector scopes.
- **⚠️ Deliberately rejected:** the Klavis/Composio/Nango *hosted-proxy* pattern (BrowserOS routes 40+ integrations through a cloud "Strata" service). It's convenient but breaks our zero-server constraint. If we ever want it, it's an opt-in "hub server" the user could self-host.
- **harness-integrations pattern (copy the design):** plan-before-touch installer — catalog of agent config paths/formats (JSONC/TOML/YAML), foreign-entry refusal, ownership markers (`.our-managed.json`), skills reconciler with content-hash manifests. One-click "connect my Claude Code / Codex / Cursor / OpenCode / Antigravity / VS Code / Zed" both ways (we install ourselves into them; they use us as MCP client).

### P7 — BYOK & the model gateway  `→ doc 19 (the copy-this doc), ZeroClaw providers, pi, LiteLLM, LibreChat`
- **ProviderAdapter** (one trait, ~10 impls): Anthropic · OpenAI · Azure · Bedrock · Google Gemini · **OpenAI-compatible** (any base URL — DeepSeek, vLLM, LM Studio, Ollama) · OpenRouter (with reasoning extraBody) · local (Ollama/llamafile/llama.cpp) · mock/test.
- **Hints**: model catalog (which models support tools, vision, 200K ctx) → router picks per task; same-provider retry wrapper; key rotation; per-provider health.
- **OAuth subscription models**: `chatgpt-pro` (PKCE), `github-copilot` + `qwen-code` (device-code) — the "use your existing subscription" path (BrowserOS source-read configs; we register our own public client IDs). ⚠️ Encrypted token store (research: plaintext JSON = the #1 risk), graceful degradation when providers tighten ToS.
- **Grammar-enforced structural extraction**: parse tool calls/scripts from text blocks (```bash) via low-level parsers, so even 8B local models can drive tools reliably (doc 03 §3).

### P8 — Automation & the Crystallizer (zero-token execution)  `→ doc 03 §7, GenOffice deterministic-planner, IronClaw Routines, BrowserOS scheduled tasks`
- **Crystallization**: analyze a successful multi-step plan → compile the non-cognitive steps (waits, triggers, notifications, static transforms) into a **native Rust loop** with 0 tokens / 0 API calls. The DSL from GenOffice's planner is the starting grammar.
- **Scheduler**: cron + interval + event/webhook triggers (IronClaw Routines pattern); `suggest_schedule` sentinels; scheduled tasks run headless (tray daemon, no UI window).
- **REPL runtimes**: isolate CSV/Excel/SQLite in a local computation worker (Polars/Rust) — never read raw logs into the prompt.
- **Repo-wide engineering loop**: scan tree, read git history, dependency map, run builds/tests, patch, iterate — inside the workspace sandbox.

### P9 — Deep research & web  `→ firecrawl, browser-use, MindSearch, deer-flow, context-mode, SeekStorm`
- **Multi-hop recursive research** with a knowledge-graph of extracted entities + contradiction handlers; outputs markdown reports with citations.
- **Retrieval-not-preload**: FTS5 KB (BM25+porter+trigram+RRF+proximity+fuzzy+smart snippets+TTL+throttling — context-mode's design; ⚠️ **ELv2, concept-only**, never copy code) — **no embeddings needed for default retrieval** (PageIndex + context-mode both proved vectorless RAG at scale).
- Parallel page reads via the browser layer; markdown extraction in-process (our own DOM walker); site-level search via SeekStorm-class inverted index when indexing local corpora.

### P10 — The Forge (self-evolving skills)  `→ docs 03 §6, ECC, skills ecosystem`
- **Dynamic code synthesis**: missing capability → agent writes a Rust/Python/Go program from scratch.
- **Ephemeral sandbox**: compile+run isolated (WASM or microVM — microsandbox's msb_krun pattern, or subprocess jail), TDD loop (auto-generate tests → run → read stderr → rewrite until green).
- **Verified → promoted**: strip sandbox, optimize, save to `~/.app/skills/` as a registered tool (with `skills.json` manifest + ownership markers). New tools auto-register into the planner's action list **without editing source**.
- Source: skills ecosystem (anthropics/skills, superpowers, ECC) as the initial skill library.

### P11 — Security: the Trust Ladder  `→ doc 03 §8, ZeroClaw security-first, BrowserOS ownership, microsandbox`
- **Score 0→100** from successful task completions. Reads auto; local writes at ≥25; external writes and destructive actions **permanently behind manual confirmation cards** (visual diff of exact paths/lines/vars) — even at 100.
- **Deterministic regex interceptors** on every generated shell string (block `rm -rf`, forks, formats) before exec.
- **Sandboxes**: file system hard-floors (workspace boundary enforced in the core, not the prompt), subprocess jail / WASM for generated code, browser tabs ownership-isolated (mine/user/other-agent).
- **Audit**: append-only SQLite; every tool call + every script primitive (InnerCallHook) recorded with token estimates; replayable sessions; `estop` + optional OTP for destructive ops.

### P12 — Audit, replay & telemetry (the trust surface)  `→ BrowserOS 33 §9`
- `~/.app/` layout: `app.sqlite` (sessions, dispatches, recordings, claims), `screenshots/`, `replays/`, `logs/`.
- Ingest: NDJSON batches w/ sticky `has_gap`; dedupe; per-tab/per-document streams; 7-day replay retention (configurable).
- **Token efficiency projections** per session (estimator v1, insert-once) — cost dashboard with zero extra model calls (doc 32's telemetry pillar).
- PostHog-class telemetry **off by default** (fields enumerated, no page content — their privacy page is the model).

---

## §3 Tech stack (decisions locked)

| Layer | Choice | Why (evidence) |
|---|---|---|
| Shell | **Tauri 2 + Rust core** | 20–40MB idle vs Electron's 500MB+ (docs 08/20; SOTA research confirms tauri/wry lightest) |
| Browser | **CDP over system Chrome/Edge** + chrome-for-testing fallback | BrowserOS forks Chromium — too heavy; CDP gives us everything except fork-native capture, which we replace with an injected recorder (33 §3) |
| Script eval | **rquickjs / QuickJS-NG** | BrowserOS uses it; ~300µs instantiation, ES2025, safe bindings (SOTA research) |
| MCP | **rmcp (Rust)** — Streamable HTTP + stdio, stateless per 2026-07-28 spec | BrowserOS's choice; one MCP server at `http://127.0.0.1:<port>/mcp`, tool annotations `readOnlyHint/openWorldHint`, required `Mcp-Method`/`Mcp-Name` HTTP headers (SEP-2243) |
| Storage | **SQLite** (sea-orm or rusqlite) + **sqlite-vec** (`vec0`) + **FTS5** + **Kuzu** (graph) + **SQLCipher** (tokens) | sqlite-vec is the 2026 standard (sqlite-vss legacy); FTS5+vec hybrid RRF is the proven pattern; Kuzu = embedded zero-dep Cypher |
| HTTP/WS | **axum + reqwest + tokio-tungstenite** | The exact stack BrowserOS's 14K-LOC server runs in production |
| LLM clients | ProviderAdapter + OAuth flows (own) | Doc 19 synthesis of pi/LiteLLM/LibreChat/AnythingLLM/Reasonix |
| Embeddings | local CPU model (all-MiniLM-L6-v2 / nomic-embed) for vector pillar; **default retrieval is FTS5 (no embeddings)** | AnythingLLM default embedder pattern; vectorless proven by context-mode/PageIndex |
| Local models | Ollama (managed) + **llamafile** (single binary, zero install) | llamafile 25.5K⭐; Ollama 177K⭐; warn users: context ≥15–20K or the agent loops |
| UI | React SPA in webview | Dashboard/chat/replay parity with BrowserOS/BrowserClaw UI (WXT-class component patterns, Radix, TanStack Query) |

---

## §4 The complete steal-map (repo → what we take)

**Copy-the-design (MIT/Apache or independent reimplementation):**
- **ZeroClaw** — crate map, kernel ABI traits, hint-based provider router + retry wrapper, security-first posture (supervised default, tool receipts, estop/OTP).
- **BrowserOS** — 17-tool browser catalog, a11y snapshot/refs/diff engine, `run` script-eval + InnerCallHook audit, ownership isolation, audit/replay data model + ingest contract, compaction knobs, OAuth provider pattern, harness-integrations installer design (all concept-level; ⚠️ AGPL).
- **GenOffice** — block-patch docx editing, deterministic-planner, xlsx sidecar recalc, watchdog.
- **context-mode** — FTS5 KB mechanics (BM25/porter/trigram/RRF/proximity/fuzzy/snippets/TTL/throttling), Think-in-Code, routing-enforcement hooks (⚠️ ELv2 — concept only).
- **Janus** — compaction proxy pipeline (dedup → regex → AST prune → semantic trim).
- **IronClaw** — Router/Scheduler/Worker, Routines engine, WASM-vs-subprocess sandbox choice, `FEATURE_PARITY.md` discipline.
- **mem0/letta/graphiti/cognee** — multi-signal retrieval, context paging, temporal KG, ECL pipeline.
- **rtk** — per-command bash-output compression rules.
- **harness-integrations** — plan-before-touch installer + skills reconciler + ownership markers.
- **llamafile** — embed as the "single binary local model" option.
- **firecrawl/browser-use** — markdown extraction + page-reading UX patterns (we implement in-process).
- **pi/LibreChat/AnythingLLM/Reasonix** — BYOK provider structure (doc 19).

**Reference only (don't bundle):** LibreOffice (conformance oracle + format semantics), AnythingLLM (RAG pipeline architecture), Hermes (loop/budget patterns), AutoGPT/AI agents (planning patterns), Cyber agents (red-team test corpus for our trust ladder), MemOS/Neo4j/Qdrant (heavy — learn, skip), stereOS (agent-host hardening ideas).

**Rejected:** Electron/Node/Python cores, hosted connector proxies (Klavis/Composio/Nango as a dependency), Chromium forking, Neo4j/Qdrant/Docker runtime deps, anything requiring our servers.

---

## §5 Build order (milestones)

1. **M0 — Skeleton** (2–4 wks): Tauri shell + Rust core + IPC; config; SQLite schema; log/telemetry scaffold.
2. **M1 — Chat + BYOK** (3–5 wks): ProviderAdapter + 8 providers + OpenRouter + Ollama/llamafile; streaming chat; message normalization; doc 19 as the checklist.
3. **M2 — Browser** (4–6 wks): CDP child-process manager; 17-tool catalog; snapshot/refs/diff; input engine; loop prompt; read-only annotations.
4. **M3 — Scripts + audit** (3 wks): rquickjs `run` + `evaluate`; InnerCallHook audit; ownership claims; replay recorder (injected script → NDJSON ingest); cockpit + audit UI.
5. **M4 — Files & docs** (3–4 wks): filesystem tools + path boundary; markitdown-class extraction; GenOffice block-patch for docx; calamine tables.
6. **M5 — Memory** (4–6 wks): FTS5 KB + sqlite-vec + Kuzu KG; the 7 algorithms (polarized, compass, phantom thread, anticipation, spreading activation); multi-scope identity; compaction engine.
7. **M6 — Orchestration** (3–4 wks): blueprint .md engine; sub-agents; asymmetric routing; scheduled tasks; crystallization DSL; nudge sentinels.
8. **M7 — Connectors** (3–4 wks): harness-integrations installer; OAuth PKCE/device-code + encrypted store; browser-session connectors.
9. **M8 — The Forge + trust** (4–6 wks): skill generation loop + sandbox + registry; trust ladder UI; regex interceptors; diff cards.
10. **M9 — Polish** (2–3 wks): telemetry opt-in; perf pass (<30MB idle target); docs; packaging (Win/macOS/Linux).

---

## §6 Honest constraints & open decisions

1. **Browser capture ≠ fork-native**: our replay depends on CDP + injected recorder; BrowserOS's fork-native capture is more complete (their `chrome.browser_os` API). Acceptable gap; revisit only if replay fidelity becomes a differentiator.
2. **Unofficial OAuth** (ChatGPT/Copilot/Qwen): mature but ToS-volatile (Qwen shifted tiers repeatedly). Always degrade to plain BYOK. Encrypted tokens mandatory.
3. **The optional "free chat pool"** (shared-server models) is a marketing extra for a later hosted version — never in the core architecture.
4. **Windows CDP**: WebView2 gives first-class CDP; macOS/Linux rely on system Chrome/Edge or chrome-for-testing. Ship the fallback downloader from day one.
5. **One binary, many threads**: tokio runtime must keep idle RSS < 30MB (no lazy-loading everything at boot; spawn services on demand).
6. **Skill library licensing**: preloaded skills must be MIT/Apache/CC — check before bundling ECC/others.

---

*Spec authored from docs 01–34. Final-pass additions (mem0/letta/zep/graphiti/cognee/kuzu/txtai/llamafile) verified live 2026-08-06. Ledger: 142 repos. Next: implement M0–M1.*
