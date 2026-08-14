# 02 — Module Layout (Rust crates + TS packages)

## 2.1 The workspace

```
desktop_app/
├── ARCH/                        ← this architecture series
├── crates/                      ← Rust workspace (new — everyaios-core)
│   ├── everyaios-core/                ← the orchestrator binary (tauri-free; testable headless)
│   ├── everyaios-cdp/                 ← CDP client + generated protocol types (BrowserOS browseros-cdp design)
│   ├── everyaios-browser/             ← snapshot/refs/diff engine, input, observer, markdown walker
│   ├── everyaios-script/              ← rquickjs sandbox (the `run` tool) + InnerCallHook audit
│   ├── everyaios-guard/               ← regex interceptors, diff-card gate, path floors, estop
│   ├── everyaios-audit/               ← NDJSON ingest, recording index, token estimators, replay store
│   ├── everyaios-mcp/                 ← official MCP Rust SDK server (Streamable HTTP + stdio, stateless 2026-07-28) + tool catalog
│   ├── everyaios-vault/               ← SQLCipher key-ring store (per-provider key pools, OAuth tokens)
│   └── everyaios-ipc/                 ← JSON-RPC over stdio (sidecar contract) + tauri command glue
├── packages/                    ← TS workspace (NEW — reuses @personal-ai/core-* from APP/ as deps)
│   └── coordinator/             ← the Bun-compiled sidecar (agent loop, engine stages, hub, memory)
└── ui/                          ← React SPA (webview frontend)
```

**Reuse rule:** `@personal-ai/core-*` packages are consumed **as published workspace deps** (pnpm workspace pointing at `APP/packages/*` or a shared publish), not copied. Desktop-specific additions go in `packages/coordinator/`.

## 2.2 Rust crate responsibilities (all new — source-pattern maps)

| Crate | Owns | Pattern source | Key rules |
|---|---|---|---|
| everyaios-cdp | WebSocket CDP client, discovery (loopback-only), per-target sessions, protocol types | BrowserOS browseros-cdp (doc 33 §5) | loopback-only discovery hosts; sha2-verified protocol file |
| everyaios-browser | a11y snapshot render, ref minting `[ref=eN]`, line-diff + URL-change short-circuit, input dispatch, iframe stitching, content-markdown walker | BrowserOS browseros-core (doc 33 §5) | refs scoped to (document_id, url); depth caps 1..=100; stable-capture attempts |
| everyaios-script | rquickjs async runtime, `browser` SDK surface, ownership filtering, limits | BrowserOS run tool (doc 33 §6.3) | 64MB heap / 512KB stack / 30s / 2MB return; per-primitive InnerCallHook (authorize + record + on_page_created) |
| everyaios-guard | compiled RegexSet blocklist, path-boundary floors, diff-card request state, estop | doc 03 §8, doc 33 §4.3 guards | every generated shell string scanned pre-exec; destructive = human click always |
| everyaios-audit | recording ingest (NDJSON + headers + sticky has_gap), recording index (dedupe, one-tx commit), per-dispatch token estimates, session efficiency projections | BrowserOS recordings/replay/recording_index + session_efficiency_stats (doc 33 §9) | append-only; 7-day replay retention; insert-once projections |
| everyaios-mcp | official `modelcontextprotocol/rust-sdk` server: one endpoint `http://127.0.0.1:9200/mcp` + stdio; **stateless per MCP 2026-07-28** (no initialize handshake, no Mcp-Session-Id — every request self-contained via `_meta`); 37-tool catalog (34 core + 3 `file_ops`); tool annotations (readOnly/openWorld); **`Mcp-Method`/`Mcp-Name` HTTP headers** (required per SEP-2243) | BrowserOS browseros-mcp (doc 33 §6) + MCP 2026-07-28 (doc 34 §2) | stateless streamable HTTP |
| everyaios-vault | SQLCipher token store: per-provider key pools, OAuth token rows, TTL/rotation metadata | BrowserOS oauth_tokens schema (doc 33 §7.4) + doc 19 §7 | keys never enter LLM context; per-key usage/cooldown state |
| everyaios-ipc | stdio JSON-RPC framing, typed messages, streaming | — | versioned contract (01 §1.4) |
| everyaios-storage | parallel work-stealing disk walker (crossbeam-deque + `ignore`, cycle/device-boundary-safe), immutable arena snapshots (arc_swap @~100ms, zstd save/load), squarified treemap layout + per-dir aggregation, 7-stage hash dedup (size → xxHash3 [twox-hash — xxhash-rust is BSL-1.0, doc 54 §1.2] → BLAKE3, hardlink-aware, optional reflink), large-file finder, SQLite FTS5 filename index + notify-debouncer incremental updates, optional OS-native search hooks (Everything/MFT, mdfind, Baloo), Guard-2-ticketed cleanup | eDirStat traversal.rs/arena.rs/coordinator.rs + fclones + UltraSearch patterns (doc 49) | cleanup never bypasses dual-guard (ARCH/06); scans/indexing idle + battery-aware (J16); snapshots immutable (zero-copy arena) |
| everyaios-memory | weighted RRF multi-signal fusion + dedupe + smart snippets + per-type budget caps + RAG chunk-min-size merge (Alg #18/#29); ACT-R activation/decay + importance floor + associative recall + spontaneous-recall query derivation (Alg #32); taste profile store + stable-prefix injection + shareable markdown (Alg #31); compaction pipeline — snip/soft/force ratios, findSafeSplitPoint, sliding window, summarize-fail-open, prefix_dirty flag, PRUNE_PROTECT erasure (Alg #21) | mem0 fusion + NOOA nooa-memory + Command Code taste-1 (pattern-only) + Reasonix/BrowserOS/opencode compaction (docs 07/31/33/37/39/46) | retrieval signals (FTS5/vec/graph) are caller-supplied; taste store dir-scoped (global `~/.everyaios/taste/` vs per-repo `.everyaios-taste/`); all pure logic — no IO beyond taste markdown save/load |

## 2.3 TS coordinator responsibilities (reuses core-*)

| Domain | Package (exists) | New work |
|---|---|---|
| Agent loop (pi-style) | `core-engine` (stages, risk-compass) | length-guard (fail truncated tool calls), model-swap hook, cost ledger wiring |
| Blueprint/spec loader | `core-agents` (registry) | `.md` parser → AgentConfig[]; continuous re-write of status blocks |
| Memory + RAG | `core-memory`, `core-files` (7 algos, hybrid search, embeddings) | multi-signal retrieval fusion (mem0 pattern), procedural memory, Letta-style paging hooks |
| Connector hub | `core-connectors` (orchestrator, 27+ adapters, composio) | routing engine per doc 13; usage meters; Auth Bridge |
| Search/research | `core-search` (cascade, bm25, research-tiers) | deep-research tree runner (doc 07); **tiered cascade + SQLite result cache (G8, Algorithm #33, doc 52)** — cached instant tier → WebSurfx → SearXNG → fallback; parallel top-N fetch cascade |
| Automations | `core-automations` (workflow engine, crystallization) | scheduler UI, nudge sentinels |
| Providers/BYOK | `core-providers`, `core-ai` (clients, router, vault) | **key-ring client** (03): multiple keys/provider, fallback rotation |
| Security | `core-tools` (trust-ladder, permission-gate) | keep; GuardRail enforcement delegated to Rust everyaios-guard |

**Division of trust:** the sidecar proposes; the Rust core disposes. **Execution model:** the sidecar runs the reused `core-*` engine in-process (files, connectors, search — that's the asset being reused), but every **mutating** call must present a valid **everyaios-guard authorization ticket**: Rust performs the regex scan + path resolution + permission decision first and issues a short-lived ticket; the sidecar's tool runtime rejects un-ticketed mutations. The sidecar's own *unguarded* OS access is confined to its data dir (its stdio pipe is the only unrestricted handle). Browser control, script-eval, OAuth-token use, and shell outside the granted workspace always execute in Rust regardless of ticket.

## 2.4 The 37-tool browser catalog (everyaios-mcp + everyaios-browser)

`tabs · tab_groups · history · navigate · snapshot · diff · act · download · upload · read · grep · screenshot · pdf · wait · windows · evaluate · run` — same names/semantics as BrowserOS (doc 33 §6.1) so prompts and skills transfer. Annotations: read-only set on read tools; `run`/`evaluate` are open-world + always permission-checked.

## 2.5 Cross-cutting: config

- `everyaios.toml` (Rust core): ports, dirs (`~/.everyaios/`), retention, vault path, browser binary resolution.
- `agents/*.md` blueprints (sidecar): per-agent models, subagent limits, tools, permission policy — the "everything is a file" rule (v2.0 §7.6).
- `providers.toml` (key-ring): provider → key pool → routing weights (03).
- `.env` fallbacks: `ANTHROPIC_API_KEY` etc. as last-resort single-key fallback (pi pattern, doc 19 §1).
