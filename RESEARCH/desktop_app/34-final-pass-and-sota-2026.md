# 34 — Final Pass: Gap Closure + 2026 SOTA Validations (2026-08-06)

> The closing research pass before the spec. Three jobs: (a) sweep for **other repos** we'd missed, (b) **web-verify** the tech-SOTA assumptions the spec rests on, (c) reconcile the ledger to 142. Feeds directly into `DESKTOP-APP-SPEC.md`.
> ⚠️ The earlier "agent-OS family" README-only gap (doc 30 §9) is closed for the flagship (BrowserOS → doc 33 source-read). ZeroClaw/IronClaw remain 🟦 structure-verified (candidate for a future code-level pass).

---

## §1 New repos added (8, live-verified 2026-08-06 via github.com scrape)

The corpus had a **memory / knowledge-graph / local-runtime hole** — heavy on orchestration + browser tooling, thin on memory SOTA. Closed:

| Repo | ⭐ | Lang | Why it matters to the spec |
|---|---|---|---|
| mem0ai/mem0 | 62,670 | Python | **The 2026 memory reference.** Multi-signal retrieval (semantic + BM25 + entity-graph boost fused into one score; +29.6 temporal, +23.1 multi-hop vs plain RAG per their 2026 report), multi-scope identity (user/agent/session/org), procedural memory. Validates spec §2 P5 and doc 32's retrieve rule. |
| topoteretes/cognee | 29,820 | Python | ECL (Extract→Cognify→Load) pipeline into KG + vector + relational memory; the "connect the dots" GraphRAG pattern for our knowledge layer. |
| getzep/graphiti | 29,619 | Python | **Temporal knowledge graph** (edge-versioned, recency-aware). The data structure behind our Spreading-Activation (#7) and Temporal-Anticipation (#4) algorithms — proves the KG-as-timeline approach. |
| Mozilla-Ocho/llamafile (→ `mozilla-ai/llamafile`, org move 2026-09-04 doc 87) | 25,504 | C/C++ | **Single-file local LLM runtime** (weights + server in one binary, no install). Our "local models with zero setup" option alongside Ollama. |
| letta-ai/letta | 24,116 | Python | MemGPT successor — **agent-managed context paging** (core/archival/recall memory; the agent decides what to page in/out). The multi-tier memory hierarchy blueprint (spec §2 P5, doc 03 §4). |
| neuml/txtai | 12,802 | Python | Embedded vector DB (SQLite-backed) + embeddings, runs anywhere. Lighter-than-LanceDB fallback for the vector pillar. |
| getzep/zep | 4,813 | TS | Agent memory layer (fact extraction, temporal knowledge) — Graphiti's production home; the OSS memory-as-a-service pattern done locally. |
| kuzudb/kuzu | 4,026 | C++ | **Embedded, zero-dependency graph database (Cypher).** The KG store for our on-device graph (vs heavy Neo4j/Qdrant — MemOS's mistake we avoid). |

**Tried but not added:** `PulseMCP`/`mcp-get`/`mcp-marketplace` weren't locatable under those GitHub paths (Pulse MCP is a web product; mcp-get is an npm/registry tool, not a repo we can deep-read). MCP registry mechanics are covered by the spec §3 (MCP 2026-07-28 spec) instead. LangGraph/Orchard/OSWorld/OSCAR already covered in docs (04/09/22). `charmbracelet/crush` already in ledger (opencode lineage).

**Ledger: 134 → 142** (doc 27 §13 added; header + summary updated; depth census re-grepped post-addition: **33 ⬛ / 94 🟦 / 12 🟩 / 2 ⚪**, 141 tagged of 142).

---

## §2 2026 SOTA validations (web research, sourced)

These are the load-bearing tech assumptions of the spec — each independently confirmed:

1. **Shell: Tauri/wry is the lightweight winner.** Native webviews (WebKit/WKWebView, WebView2/Edge, WebKitGTK) vs Electron's bundled Chromium. ⚠️ **The critical nuance for our browser layer:** only **Windows WebView2** exposes a clean loopback CDP socket; macOS WKWebView and Linux WebKitGTK do not offer first-party CDP to external clients. → The spec's browser decision (CDP over system Chrome/Edge as a child process + chrome-for-testing fallback) is the only way to get *real* programmatic CDP on all three OSes. CEF would give CDP but is Electron-heavy. (Sources: v2.tauri.app debug docs.)
2. **Embedded vector search: sqlite-vec is the 2026 standard** (sqlite-vss/faiss is legacy). Pure C, zero deps, `vec0` virtual tables, Rust binding. FTS5 + vec0 hybrid with RRF in SQL = the proven local hybrid pattern. → spec §3 storage. (We already ship `bundle-sqlite-vec-android.mjs` in our mobile repo — same library family, proven in our own stack.)
3. **Embedded JS runtime: rquickjs/QuickJS-NG is the clear winner** — ~300µs runtime instantiation, near-complete ES2025, safe high-level Rust bindings (`AsyncRuntime`, `FromJs`/`IntoJs` macros). boa_engine lags perf; deno_core drags V8. → spec §3 script-eval; matches BrowserOS's own choice (rquickjs 0.12.1, source-read in doc 33).
4. **MCP 2026-07-28 spec:** Streamable HTTP is now the norm (stateless, single POST endpoint, request-scoped SSE); tool annotations (`readOnlyHint`/`openWorldHint`) standardized; required `Mcp-Method`/`Mcp-Name` HTTP headers (SEP-2243); official MCP registry. → spec §3 (rmcp server, one URL `http://127.0.0.1:<port>/mcp`).
5. **Device-code / PKCE OAuth for subscriptions:** mature and widely used (LiteLLM, Hermes, open-source coding agents). ⚠️ Risks confirmed: plaintext JSON token storage is the #1 failure mode; providers tighten bot-detection/ToS enforcement and occasionally restructure free tiers (Qwen noted). → spec §2 P7: **encrypted token store (SQLCipher)** + graceful degradation to BYOK.
6. **Memory SOTA 2026:** benchmarks LoCoMo / LongMemEval / BEAM (1M–10M token scale); multi-signal fused retrieval; multi-scope identity; **procedural memory** emerging as the third memory type; bounded retrieval budgets (~6,900 tokens/call). → spec §2 P5 adopts all four (mem0/letta grounded).

---

## §3 What this pass changed

- **Ledger 142** (8 additions, §13) with corrected depth census.
- **DESKTOP-APP-SPEC.md** authored — the complete synthesis (12 pillars, stack, steal-map, M0–M9 build order).
- **Architecture locked:** Tauri shell + Rust core (one binary) · CDP browser child-process + injected recorder (not a Chromium fork) · sqlite-vec + FTS5 + Kuzu · rquickjs scripts · rmcp MCP · local-first connector hub (no cloud proxy) · encrypted OAuth tokens · tokenmining economics.
- **Still-open (documented in spec §6):** replay fidelity ceiling vs BrowserOS's fork-native capture; unofficial-OAuth volatility; optional future hosted "free-chat pool" (never core).

*End of the research corpus proper — docs 01–34 + spec. The build plan starts at M0 (spec §5).*
