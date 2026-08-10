# 17 — Tier-1 Feature Implementation: Web, Research & Connectors (feature-by-feature, code-level)

> Compiled 2026-08-06. Tier-1 code-level breakdown for: browser-use, firecrawl, crawl4ai, deep-research family (dzhng, open_deep_research, local-deep-research), Composio, Nango, Zapier connectors, Jan, Vellum.
> Tier-1 agents/coding → `16-feature-implementation-tier1-agents.md`. Tier-2 → `18`.

---

## 1. Browser Use — `browser-use/browser-use` (108K⭐, Python)
- **Repo:** https://github.com/browser-use/browser-use | **Docs:** https://docs.browser-use.com

### Feature → Implementation map
| Feature | How it's implemented (code) |
|---|---|
| **Agent loop** | `browser_use/agent/service.py` — `Agent` class, LLM function-calling loop: each step reads browser state → LLM reasoning (`AgentBrain`) → executes up to `max_actions_per_step=4` actions via Playwright/CDP → observe page change → repeat until goal. |
| **Perception (a11y-tree)** | `browser_use/dom/` — DOM → numbered **accessibility-aware interactive nodes** (token-efficient, ~90% smaller than HTML) with stable element refs (`e1`, `e2`) + coordinates. Fallback to vision for shadow-DOM/canvas. |
| **Action space** | `browser_use/controller/` — navigate, go_back, refresh, click, type_text, scroll, select_dropdown_option, switch_tab, close_tab, upload_file, screenshot, wait; `@action`-decorated tool registry. |
| **History & compaction** | `browser_use/agent/message_manager/views.py` — Pydantic `HistoryItem` (step_number, evaluation_previous_goal, memory, next_goal, action_results, error, system_message) with `to_string()` serialization into LLM prompt; `MessageHistory` manager; `max_history_items` pruning; `AgentHistoryList` records full trace. |
| **Fast mode** | `flash_mode=True` skips internal evaluation, next-goal reflection, thinking steps → max speed. |
| **Vision** | `use_vision` auto/True/False + `vision_detail_level` low/high/auto; screenshots fed to multimodal LLM alongside DOM map. |
| **Module layout** | `browser_use/`: `actor`, `agent`, `beta`, `browser`, `controller`, `dom`, `filesystem`, `integrations`, `llm`, `mcp`, `sandbox`, `screenshots`, `skills`, `sync`, `telemetry`, `tokens`, `cli.py`, `config.py`, `observability.py`. |

**Steals (code-level):** `HistoryItem.to_string()` structured serialization; a11y-node perception with element refs; `flash_mode` fast path; `@action` decorator tool registry.

---

## 2. Firecrawl — `firecrawl/firecrawl` (161K⭐, TS)
- **Repo:** https://github.com/firecrawl/firecrawl | **Docs:** https://docs.firecrawl.dev

### Feature → Implementation map
| Feature | How it's implemented (code) |
|---|---|
| **API surface** | `apps/api/src/` — `routes/`, `controllers/`, `services/`, `scraper/`, `search/`, `types/`, `db/`. Endpoints: `/v2/scrape` (URL→markdown/HTML/screenshot/JSON), `/v2/search` (search + clean content), `/v2/crawl` (async site crawl, robots-aware, jobs w/ progress), `/v2/map` (link discovery + relevance filter), `/v2/agent` (NL prompt → autonomous research with Pydantic schemas). |
| **Queue/workers** | BullMQ (`bullmq` + `@bull-board`) + Redis; `services/extract-queue.ts`, `extract-worker.ts`, `index-cache.ts`, `indexing/`, `ledger/` — distributed batch scraping + long crawls without blocking API threads. |
| **Markdown engine** | custom deterministic HTML pre-filters + cleanup (turndown + `joplin-turndown-plugin-gfm`); scraper module in `apps/api/src/scraper/`. |
| **JS-heavy pages** | Playwright + headless Chromium sandboxes; interaction endpoints `/scrape/{id}/interact`. |
| **Platform services** | `services/`: `ab-test.ts`, `alerts/`, `autumn/`, `billing/`, `idempotency/`, `integrations/`, `mcp/`, `monitoring/`, `notification/`, `oauth-token-introspection.ts`, `posthog.ts`, `cclog-worker.ts`. |
| **DB** | Drizzle ORM + PostgreSQL/ClickHouse (`db/`). |

**Steals (code-level):** `/map` before `/crawl` (route inventory then deep crawl); BullMQ queue isolation; idempotency service; scraper/search split.

---

## 3. Crawl4AI — `unclecode/crawl4ai` (76K⭐, Python)
- **Repo:** https://github.com/unclecode/crawl4ai | **Docs:** https://docs.crawl4ai.com

### Feature → Implementation map
| Feature | How it's implemented (code) |
|---|---|
| **Async crawler** | `crawl4ai/async_webcrawler.py` — `AsyncWebCrawler` (async context manager); `async_crawler_strategy.py` — `AsyncPlaywrightCrawlerStrategy` with `BrowserManager`, `PlaywrightAdapter`, `UndetectedAdapter`, aiohttp. |
| **Browser pool / adaptive dispatch** | `crawl4ai/adaptive_crawler.py` + `crawlers/` — Browser Pool + `MemoryAdaptiveDispatcher` throttles concurrency by live memory/CPU. |
| **Content extraction** | `content_scraping_strategy.py` — JS injection (`js_code`), `wait_for` selectors, pre/post-navigation hooks; `html2text/` conversion. |
| **Chunking** | `chunking_strategy.py` — chunking modes before LLM extraction. |
| **Extraction strategies** | `extraction_strategy.py` — `JsonCssExtractionStrategy` (CSS/XPath from JSON schema, 0-cost) vs `LLMExtractionStrategy` (Pydantic models via Ollama/OpenAI). |
| **Markdown filters** | `content_filter_strategy.py` — `PruningContentFilter` (drops low-value blocks), BM25 filter. |
| **Deep crawl** | `deep_crawling/` — recursive w/ crash recovery. |
| **Models** | `crawl4ai/models.py` — `DomainState`, `CrawlerTaskResult`. |

**Steals (code-level):** memory-adaptive dispatcher; CSS-schema extraction before LLM (0-cost tier); pruning content filter; hook-based JS injection.

---

## 4. Deep-research family

### 4a. dzhng/deep-research — `dzhng/deep-research` (19.5K⭐, TS)
- **Repo:** https://github.com/dzhng/deep-research
- **Loop (`src/deep-research.ts`, <500 LOC):** `generateSerpQueries` (Zod schema `{queries:[{query, researchGoal}]}` via `generateObject`) → **breadth×depth tree recursion** → parallel searches (`p-limit` ConcurrencyLimit, default 2 / `FIRECRAWL_CONCURRENCY`) → Firecrawl scrape → `processSerpResult` accumulates **learnings** (dedup'd) → feed learnings into next query generation (deeper follow-ups) → return learnings + visited URLs.
- **Feedback (`src/feedback.ts`):** `generateObject` with Zod `{questions: z.array(z.string())}` → clarifying questions to narrow direction (up to `numQuestions`).

### 4b. open_deep_research — `langchain-ai/open_deep_research` (12.5K⭐, Python)
- **Repo:** https://github.com/langchain-ai/open_deep_research
- **Graph (`open_deep_research/graph.py`):** LangGraph nodes — **plan → research → gap-check → finalize**. Config-driven (`configuration.py`): model, search tool, MCP servers, report format. Gap-check compares coverage vs. outline and triggers additional research.

### 4c. local-deep-research — `LearningCircuit/local-deep-research` (Python/Docker)
- **Repo:** https://github.com/LearningCircuit/local-deep-research | **PyPI:** `local-deep-research`
- **What:** local-first deep research; Docker + PyPI; pairs with SearXNG + Ollama for fully-free research (doc 07). Iterative loop similar to 4a but with local search/LLM.

**Steals (code-level):** breadth×depth tree + learnings feedback; gap-check node; Zod/Pydantic schema extraction for queries.

---

## 5. Composio — `composiohq/composio` (29.6K⭐, TS, MIT)
- **Repo:** https://github.com/composiohq/composio | **Docs:** https://docs.composio.dev

### Feature → Implementation map
| Feature | How it's implemented (code/docs) |
|---|---|
| **Toolkits & actions** | 1,000+ toolkits; naming `{TOOLKIT}_{ACTION}` (`GITHUB_CREATE_ISSUE`). SDKs in `python/`, `js/`, `packages/` (sdk, cli, mcp). |
| **Execution model** | auth/discovery via hosted control plane; actual code exec in a **Python sandbox** — cloud-hosted or **Local Sandbox** (self-host). Session (`composio.create(user_id)`) scopes user/toolkits/auth; sandbox pre-installs pandas/numpy + helpers (`run_composio_tool`, `invoke_llm`, `web_search`). |
| **MCP path** | `session.mcp.url` = `https://backend.composio.dev/v3/mcp/{SERVER_ID}?user_id={USER_ID}` + `x-api-key` → tools stream into any MCP client. |
| **BYOK** | managed apps (Composio OAuth) OR custom Auth Configs (own client IDs/secrets). Free tier ~20K calls/mo. |
| **⚠️ Self-hosting** | monorepo = client SDKs + CLI only; orchestration is hosted (not self-hostable) — doc 12. |

**Steals (code-level):** session-scoped sandbox w/ pre-installed data libs; MCP session.url pattern; dynamic tool discovery (fetch only relevant tools to save context).

---

## 6. Nango — `NangoHQ/nango` (11.4K⭐, TS, ELv2)
- **Repo:** https://github.com/NangoHQ/nango | **Docs:** https://docs.nango.dev

### Feature → Implementation map
| Feature | How it's implemented (code/packages) |
|---|---|
| **OAuth manager** | packages: `orchestrator/` (connection lifecycle), `server/`, `jobs/` (sync scheduling), `runner/` (isolated JS/TS execution), `persist/` (record storage), `keystore/` + `kms/` (AES-256-GCM encryption), `database/` (Postgres), `kvstore/` (Redis/Valkey locks), `node-client/`, `cli/`, `connect-ui/`, `nango-yaml/` (integration config DSL), `authz/`, `billing/`, `metering/`, `lambda-runner/`, `fleet/`, `egress/`, `data-ingestion/`, `audit/`, `logs/`, `email/`, `feature-flags/`, `frontend/`, `design-system/`, `clickhouse-migrations/`. |
| **Proxy** | unified `/proxy/...` gateway; `Connection-Id` header → auto-injects token/API key; traffic logging. |
| **Sync framework** | JS/TS functions in isolated Runner containers; cron or programmatic triggers; delta detection, cursors, payload caching to Postgres. |
| **Self-host** | Docker Compose / Helm: Server + Orchestrator + Jobs + Runner + Persist; Postgres + Redis/Valkey + S3. |

**Steals (code-level):** package-per-concern layout (orchestrator/jobs/runner/persist); `nango-yaml` declarative integration config; connection-scoped proxy.

---

## 7. Zapier connectors — `zapier/connectors` (113⭐, ELv2, prototype)
- **Repo:** https://github.com/zapier/connectors
- **Structure:** `apps/` (per-app connector folders) + `plugins/`; `AGENTS.md`/`CLAUDE.md` spec files at root.

### Feature → Implementation map
| Feature | How it's implemented (code) |
|---|---|
| **One folder, four surfaces** | each app folder ships: ① agentskills.io skill, ② TS module `.run(input, opts)` + **`connectionResolvers`** (`env:TOKEN` = user-held creds; `zapier:<id>` = Zapier-managed), ③ CLI (`npx @zapier/<app>-connector run <action>`), ④ local MCP server over stdio (`connector mcp`). |
| **Connection resolution** | `connectionResolvers` abstraction lets the same connector work with user-held or managed credentials — the Connector Hub pattern (doc 13). |
| **Plugin packaging** | `plugins/` dir for shared tooling (agentskills integration). |

**Steals (code-level):** connectionResolvers dual-credential pattern; multi-surface single-definition connectors.

---

## 8. Jan — `janhq/jan` (43.9K⭐, TS/Rust)
- **Repo:** https://github.com/janhq/jan | **Docs:** https://www.jan.ai/docs
- **Structure:** `core/` (Tauri+TS core: `src/`, rolldown build, vitest) + `extensions/` + `docs/` + `autoqa/`.

### Feature → Implementation map
| Feature | How it's implemented (code/docs) |
|---|---|
| **Tauri shell** | `core/` = Tauri (Rust) app core — migrated from Electron ~v0.6.0 (doc 08 hedge: root package.json no longer shows electron/tauri deps). |
| **Inference engine** | **llama.cpp** (`ggml-org/llama.cpp`) — pre-compiled hardware backends per system (CUDA 12.x/11.7, Vulkan for AMD/Arc, AVX/AVX-512 CPU). |
| **Model routing** | since v0.8.0: single centralized router process `llama-server --models-preset <router.preset.ini>`; load/unload on demand via `/models/load` + `/models/unload`. |
| **Local API server** | OpenAI-compatible at `127.0.0.1:1337/v1`; Bearer token, CORS, timeouts, server-side tool execution. |
| **MCP host** | `extensions/` — configure external MCP servers (name, command, args); tool-calling loop with **permission/approval cards** before dispatch. |
| **Model import** | HF/Jan Hub GGUF download; "Import" links local GGUF in-place (no duplication). |

**Steals (code-level):** single router process with models-preset; approval-card UI before tool dispatch; in-place GGUF import.

---

## 9. Vellum Assistant — `vellum-ai/vellum-assistant` (MIT)
- **Repo:** https://github.com/vellum-ai/vellum-assistant
- **Docs-in-repo:** `ARCHITECTURE.md` → points to `assistant/ARCHITECTURE.md`, `assistant/docs/architecture/memory.md`, `integrations.md`, `security.md`, `credential-execution-service.md`.

### Feature → Implementation map
| Feature | How it's implemented (code/docs) |
|---|---|
| **CES (Credential Execution Service)** | `assistant/docs/credential-execution-service.md` — **credentials live in a separate process and never reach the model**; tool calls execute in a sandbox with default-deny policy; actor identity resolution (guardian/trusted/unknown) upfront — unknown actors cannot read memory, trigger tools, or escalate. |
| **Memory (8 types)** | `assistant/docs/architecture/memory.md` — episodic, semantic, procedural, emotional, prospective, behavioral, narrative, shared; cross-channel (WhatsApp/Discord/web/mobile). |
| **Workflow orchestration** | workflow engine + authoring guides (per ARCHITECTURE.md). |
| **Cross-channel** | `integrations.md` — multi-channel access. |

**Steals (code-level):** CES process-separation + default-deny; actor-class identity gate; the 8-type memory taxonomy.

---

> Next: **`18-feature-implementation-tier2-medium.md`** (medium-depth feature maps for the remaining repos).
