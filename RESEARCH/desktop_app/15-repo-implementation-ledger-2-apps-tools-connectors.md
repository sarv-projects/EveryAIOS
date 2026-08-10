# 15 — Repo Implementation Ledger, Part 2: Desktop Apps, Scraping, Deep Research, Business Tools, Connectors

> Compiled 2026-08-06. Part 2 of the implementation ledger — every repo from docs 01–13 in these domains, with URLs, docs links, and how features are actually implemented.
> **Part 1 (agents, coding, orchestration, cyber) → `14-repo-implementation-ledger-1-agents-coding.md`.**
> ⚠️ Stars live as of 2026-08-05/06 where verified; flagged where 404/rate-limited this pass.

---

## F. Desktop AI apps (competitor landscape — doc 08)

### F1. Jan — `janhq/jan` (43.9K⭐, TS/Rust)
- **Repo:** https://github.com/janhq/jan | **Docs:** https://www.jan.ai/docs (llama-cpp engine, api-server, mcp pages)
- **Architecture (docs-verified):** **Tauri (Rust)** — migrated off Electron around v0.6.0 (⚠️ note: root package.json no longer shows electron/tauri deps; migration reported by docs, hedge preserved). **Inference engine = `llama.cpp`** (ggml-org), downloading pre-compiled backends per hardware (CUDA 12.x/11.7, Vulkan for AMD/Intel Arc, AVX/AVX-512 CPU).
- **Model management:** Hugging Face/Jan Hub GGUF downloads; "Import" links local GGUF in-place (no duplication). Since v0.8.0 a **single centralized router process** (`llama-server --models-preset router.preset.ini`) loads/unloads models on demand via `/models/load` + `/models/unload`.
- **Local API server:** OpenAI-compatible at `http://127.0.0.1:1337/v1`; custom Bearer token, CORS, timeouts, server-side tool execution.
- **Extensions:** modular extension interfaces for third-party providers (Anthropic, OpenAI, custom) into settings/sidebar. **MCP:** Jan is an MCP Host — configure external MCP servers (name, command, args); tool-calling loop in chat with interactive permission/approval cards before tool dispatch.
- **Check later:** `core/` (Tauri), `app/` (React UI), `extensions/`.

### F2. Cherry Studio — `CherryHQ/cherry-studio` (49.6K⭐, TS)
- **Repo:** https://github.com/CherryHQ/cherry-studio | **Docs:** cherry-ai.com/docs / openaitx docs mirror
- **What:** Unified cross-platform desktop app for multiple workspaces and models; connects to Ollama/LM Studio/local runtimes; lightweight, low RAM. Electron-based.
- **Check later:** `src/` (main/renderer), providers config.

### F3. Chatbox — `Bin-Huang/chatbox` (Community Edition)
- **Repo:** https://github.com/Bin-Huang/chatbox | **Site:** chatboxai.app
- **What:** Cross-platform desktop client for ChatGPT/Claude/other LLMs (BYOK). Note: some flows move to `chatboxai/chatbox` org — **live-verified 2026-08-08: `chatboxai/chatbox` = 41,366⭐ (TS)**; treat that as the canonical org.
- **Check later:** `src/` (Tauri + React), provider adapters.

### F4. Vellum Assistant — `vellum-ai/vellum-assistant` (open-source, MIT)
- **Repo:** https://github.com/vellum-ai/vellum-assistant | **Docs:** vellum.ai
- **CES credential isolation (the big steal):** actor identity resolution (guardian/trusted/unknown) upfront — unknown actors **cannot** read memory, trigger tools, or escalate; **credentials live in a separate process and never reach the model**; every tool call runs in a sandbox with **default-deny** policy.
- **Memory:** 8 types — episodic, semantic, procedural, emotional, prospective, behavioral, narrative, shared; cross-channel (WhatsApp, Discord, web, mobile).
- **Check later:** README security section; `packages/` for memory + sandbox.

### F5. GenOffice — `genspark-ai/genoffice` (1.7K⭐, TS/Electron + Rust sidecar)
- **Repo:** https://github.com/genspark-ai/genoffice
- **Architecture:** 5 Electron apps (docs, sheets, slides, pdf, +1) sharing one engine layer.
- **Rust sidecar:** sheets uses `calamine` + `IronCalc` for `.xlsx` import/export. **Block-patch engine:** docs does byte-preserving round-trips — only dirty paragraphs regenerated, rest of file kept byte-for-byte.
- **Check later:** `apps/sheets/`, `apps/docs/` (Rust sidecar integration).

### F6. Open WebUI — `open-webui/open-webui` (148K⭐, Python)
- **Repo:** https://github.com/open-webui/open-webui | **Docs:** https://docs.openwebui.com
- **Architecture:** FastAPI (Python) backend + Svelte/SvelteKit frontend.
- **Pipelines & Functions:** in-process Python functions — **Pipes** (custom model providers/routers), **Filters** (pre/post message processing, moderation, translation), **Actions**; external Pipelines service (OpenAI-compatible spec, legacy-ish).
- **RAG:** ingest local files or URLs (`#` prefix); recursive char/token splitters (tiktoken / HF tokenizers) or Markdown Header splitting; **chunk-merging pass** with `CHUNK_MIN_SIZE_TARGET` to fuse undersized fragments; vectors in ChromaDB/FAISS local or external Qdrant/Milvus/pgvector.
- **Auth/RBAC:** email/password, SSO/OIDC (Google/Microsoft/Okta/Keycloak), LDAP, SCIM 2.0 provisioning; roles Admin/User/Pending + group permissions.
- **Check later:** `backend/` (FastAPI), `src/` (Svelte).

### F7. Ollama — `ollama/ollama` (~90K+⭐, Go)
- **Repo:** https://github.com/ollama/ollama | **Docs:** docs.ollama.com
- **What:** Local LLM daemon on :11434. Go runtime; model format GGUF w/ quantizations; OpenAI-compatible API; libraries for Python/JS.
- **Check later:** `server/`, `llm/` (runner dispatch per backend).

### F8. LM Studio — `lmstudio-ai/lms` (5.2K⭐, TS) + SDKs
- **Repo:** https://github.com/lmstudio-ai/lms (CLI) · `lmstudio-ai/lmstudio-js` (TS SDK, 1.7K⭐) · `lmstudio-ai/lmstudio-python` (857⭐) · `lmstudio-ai/mlx-engine` (Apple MLX, 1.1K⭐)
- **Docs:** lmstudio.ai/docs
- **What:** The desktop app itself is closed-source; OSS surface = CLI + SDKs + MLX engine. Local inference via llama.cpp engine family; OpenAI-compatible local server.
- **Check later:** `lms` CLI commands, `lmstudio-js` SDK.

### F9. OpenFang — `RightNow-AI/openfang` (18.1K⭐, Rust)
- **Repo:** https://github.com/RightNow-AI/openfang
- **Architecture:** **Agent OS in Rust** — 137K LOC, 14 crates, 2,696+ tests, zero clippy warnings; single ~32MB binary (`openfang init` / `openfang start`, dashboard on :4200). **WASM sandbox** for agent tool execution. Built for autonomous 24/7 background agents (scheduling, monitoring, knowledge graph building).
- **Check later:** `crates/` — scheduler, sandbox (WASM), memory.

### F10. Vane (formerly Perplexica) — `ItzCrazyKns/Vane` (36K⭐, TS)
- **Repo:** https://github.com/ItzCrazyKns/Vane
- **What:** Privacy-focused local answering engine (Perplexity-style) with citations; local LLMs (Ollama) + cloud providers.
- **Implementation:** web search via **SearXNG**; deps: `playwright`, `jsdom`, `@mozilla/readability` (page→text), `better-sqlite3`, `drizzle-orm`, `@huggingface/transformers` (embeddings), `js-tiktoken`, `yahoo-finance2` (widgets).
- **Check later:** `apps/`, `lib/` (search + RAG-mem + citations).

### F11. Leon — `leon-ai/leon` (17.4K⭐, TS/Node)
- **Repo:** https://github.com/leon-ai/leon
- **What:** Open-source personal assistant (self-hosted). `master` = legacy NLU architecture (skills-as-modules); `develop` = 2.0 developer preview moving to agentic core with Vercel AI SDK providers (`@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/groq`), `better-sqlite3`, socket.io, React/TanStack UI.
- **Check later:** `develop` branch `packages/`.

### F12. PyGPT — `szczyglis-dev/py-gpt` (1.9K⭐, Python)
- **Repo:** https://github.com/szczyglis-dev/py-gpt
- **What:** All-in-one desktop AI assistant (GPT-4/5, Claude, Gemini, Ollama/Llama, Mistral, HF) — chat, assistants, code exec, web search, image gen, audio. Python >=3.10; Linux zip + Windows msi builds. **Plugin system:** models can execute system commands, file I/O, Python code, web APIs.
- **Check later:** `gpt_computer_assistant/`, plugins dir.

### F13. DeerFlow (ByteDance) — ⚠️ **2026-08-06 UPDATE: repo live again as DeerFlow 2.0**
- **Repo:** https://github.com/bytedance/deer-flow (Python 3.12+, Node 22+). Earlier this pass (2026-08-05) the repo appeared removed — it's back as 2.0 (see doc 21 + doc 11 correction).
- **Mirrors:** `coolclaws/deerflow-book` (662⭐, 源码解析), `stophobia/deerflow2.0-enhanced` (652⭐), `hawkli-1994/deerflow-book` (434⭐). `langbot-app/LangBot` (17.3K⭐) is a different (agentic IM bots) project.
- **Status:** **RESOLVED 2026-08-06** — re-verified live 2026-08-08 (79,565⭐; ground-up rewrite, doc 39 §B1). Structure deep-read: **channels-first super-agent harness** — 10 IM adapters (telegram/slack/discord/wechat/feishu/dingtalk/wecom/github/buzz/nostr) + `message_bus` + per-channel `run_policy` + `dedupe_store` + gateway auth (JWT/OIDC/password/credential-file) + skills → **informs F13 messaging bridges** (run_policy + dedupe steal). Harness loop code-level read still deferred — covered by docs 03/07/38.

---

## G. Browser automation & scraping (doc 06)

### G1. Browser Use — `browser-use/browser-use` (108K⭐, Python)
- **Repo:** https://github.com/browser-use/browser-use | **Docs:** https://docs.browser-use.com
- **Agent loop (`browser_use/agent/service.py`):** LLM function-calling loop; each step evaluates browser state, queries LLM for structured reasoning (`AgentBrain`), executes up to `max_actions_per_step=4` actions via Playwright/CDP until page changes/goal met.
- **Perception:** maps DOM → clean numbered **a11y-tree interactive nodes** (token-efficient vs full HTML) with coordinate/element-index targeting.
- **Action space:** navigate, go_back, refresh, click, type_text, scroll, select_dropdown_option, switch_tab, close_tab, upload_file, screenshot, wait.
- **Memory:** `max_history_items` pruning; `AgentHistoryList` records steps/thoughts/content/URLs/errors. **Fast Agent** (`flash_mode=True`) skips evaluation/reflection for speed.
- **Vision:** `use_vision` auto/True/False + `vision_detail_level` low/high/auto; screenshots fed to multimodal LLM alongside DOM map.
- **Check later:** `browser_use/agent/service.py`, `browser_use/browser/`.

### G2. Firecrawl — `firecrawl/firecrawl` (161K⭐, TS)
- **Repo:** https://github.com/firecrawl/firecrawl | **Docs:** https://docs.firecrawl.dev
- **Endpoints:** `/v2/scrape` (URL→markdown/HTML/screenshot/JSON), `/v2/search` (search + clean content), `/v2/crawl` (async site crawl, robots.txt aware, jobs w/ progress), `/v2/map` (internal link discovery, relevance filter), `/v2/agent` (NL prompt → autonomous research w/ Pydantic schemas).
- **Engine:** deterministic HTML pre-filters + cleanup → clean markdown (turndown + GFM plugin); **Playwright + headless Chromium** for SPA/JS-heavy/infinite-scroll; interactions via `/scrape/{id}/interact`.
- **Self-host:** docker-compose (API + Redis queue + workers + Playwright instances); BullMQ-style queue.
- **Check later:** `apps/api/` (services/scrape|search|crawl|map), `apps/api/package.json`.

### G3. Crawl4AI — `unclecode/crawl4ai` (76K⭐, Python)
- **Repo:** https://github.com/unclecode/crawl4ai | **Docs:** https://docs.crawl4ai.com
- **Design:** `AsyncWebCrawler` (async context manager) on **Playwright**; **Browser Pool + MemoryAdaptiveDispatcher** throttles concurrency by live memory/CPU.
- **Hooks:** pre/post-navigation + `js_code` injection (click "load more", dismiss overlays, `wait_for` selectors).
- **Extraction:** `JsonCssExtractionStrategy` (CSS/XPath from JSON schema, 0-cost) vs `LLMExtractionStrategy` (Pydantic models via Ollama/OpenAI). Markdown via `DefaultMarkdownGenerator` + `PruningContentFilter` (drops low-value blocks, prunes tokens).
- **Check later:** `crawl4ai/async_crawler_strategy.py`, `crawl4ai/extraction_strategies.py`.

### G4. Trafilatura — `adbar/trafilatura` (Python, ~12K⭐)
- **Repo:** https://github.com/adbar/trafilatura | **Docs:** trafilatura.readthedocs.io
- **What:** Main-text/metadata extraction for web pages — heuristic boilerplate cleaning, lxml HTML/XML parsing; also discovery/crawling CLI.
- **Check later:** `trafilatura/` (core extraction modules).

### G5. Jina Reader — `jina-ai/reader` (TypeScript/Python)
- **Repo:** https://github.com/jina-ai/reader | **Service:** https://r.jina.ai (URL→LLM-ready markdown), https://s.jina.ai (search)
- **What:** URL → clean markdown + web search for RAG/agents.
- **Check later:** `reader/` (proxy + extractors).

### G6. Camofox — `jo-inc/camofox-browser` (8.4K⭐, JS/TS/C++ — ⚠️ doc 06 said ~2.5K; this pass's live search says 8.4K, treat the newer figure)
- **Repo:** https://github.com/jo-inc/camofox-browser
- **What:** Stealth headless browser for AI agents to bypass anti-bot (Cloudflare, CAPTCHAs); anti-detection server wrappers + MCP integration.
- **Check later:** `packages/` (browser core + MCP server).

---

## H. Deep research & data analysis (doc 07)

### H1. dzhng/deep-research — `dzhng/deep-research` (19.5K⭐, TypeScript)
- **Repo:** https://github.com/dzhng/deep-research
- **Core (`src/deep-research.ts`, <500 LOC):** `generateSerpQueries` uses `generateObject` + Zod schema `{queries: [{query, researchGoal}]}`; **breadth×depth tree recursion**; parallel searches via `p-limit` ConcurrencyLimit; page scrape via Firecrawl SDK; learnings + visited URLs fed back into next query round.
- **Check later:** `src/deep-research.ts`, `src/feedback.ts`.

### H2. open_deep_research — `langchain-ai/open_deep_research` (12.5K⭐, Python)
- **Repo:** https://github.com/langchain-ai/open_deep_research
- **Graph (`open_deep_research/graph.py`):** LangGraph nodes — **plan → research → gap-check → finalize**; supports multiple model providers, search tools, MCP servers; report generation w/ markdown.
- **Check later:** `open_deep_research/graph.py`, `open_deep_research/configuration.py`.

### H3. AutoSearch — `0xmariowu/Autosearch` (TypeScript)
- **Repo:** https://github.com/0xmariowu/Autosearch | **npm:** `autosearch-ai`
- **What:** MCP-native deep-research engine, LLM-decoupled, **40 search channels** (incl. 10+ Chinese sources). Plug into any agent host via MCP.
- **Check later:** `src/channels/`.

### H4. DeepAnalyze — `ruc-datalab/DeepAnalyze` (4.4K⭐, Python)
- **Repo:** https://github.com/ruc-datalab/DeepAnalyze
- **What:** First agentic LLM for autonomous data science — self-correcting loop over EDA→modeling→reporting.
- **Check later:** `deepanalyze/` (agent loop).

### H5. ai-data-science-team — `LearningCircuit/ai-data-science-team` (Python, ~1.5K⭐)
- **Repo:** https://github.com/LearningCircuit/ai-data-science-team
- **What:** Multi-agent data-science team (roles: data scientist, analyst, coder) on Jupyter — runs data pipelines via agents.
- **Check later:** `ai_data_science_team/`.

### H6. local-deep-research — `LearningCircuit/local-deep-research` (Python/Docker)
- **Repo:** https://github.com/LearningCircuit/local-deep-research | **PyPI:** `local-deep-research`
- **What:** Local-first deep research; Docker + PyPI; pairs with SearXNG + Ollama for fully free research.
- **Check later:** README + `deep_research/`.

---

## I. Business automation tools (doc 10)

| Repo | URL | Stars/Lang | What/how |
|---|---|---|---|
| **AutoHedge** | https://github.com/The-Swarm-Corporation/AutoHedge | 4.1K, Py | Automated hedging system — swarm-based trading agents. |
| **Vibe-Trading** | https://github.com/HKUDS/Vibe-Trading | 29.9K, Py | Personal trading agent ("One command to emerge"). |
| **claude-ads** | https://github.com/AgriciDaniel/claude-ads | 7.8K, Py | Claude-first paid-media ops skill for Claude Code, 12 ad platforms. |
| **NotFair** | https://github.com/nowork-studio/NotFair | 3.3K, TS | Goal-driven, loop-powered marketing agents. |
| **FinceptTerminal** | https://github.com/Fincept-Corporation/FinceptTerminal | 29.9K, **C++** | Financial terminal; moving to subscription private edition + Quantcept. |
| **Agentic Inbox** | https://github.com/cloudflare/agentic-inbox | 6.7K, TS | Self-hosted email client + AI agent, runs entirely on Cloudflare Workers + Email Routing. |
| **ClawRouter** | https://github.com/BlockRunAI/ClawRouter | 6.7K, TS | Agent-native LLM router — 66 models (8 free); provider routing for agents. |
| **Open-Generative-AI** | https://github.com/Anil-matcha/Open-Generative-AI | 25.7K, JS | Unrestricted open-source alternative to AI video platforms (MuAPI). |
| **Hyperframes** | https://github.com/heygen-com/hyperframes | 39.7K, TS | npm framework from HeyGen for dynamic video/media frames. |

---

## J. Connectors & integration infra (docs 12–13)

### J1. Composio — `composiohq/composio` (29.6K⭐, TypeScript, MIT)
- **Repo:** https://github.com/composiohq/composio | **Docs:** https://docs.composio.dev
- **Toolkits/Actions:** 1,000+ toolkits; `{TOOLKIT}_{ACTION}` naming (e.g. `GITHUB_CREATE_ISSUE`).
- **Execution model:** auth + discovery via Composio cloud control plane; code execution in a secure **Python sandbox** — cloud-hosted or **Local Sandbox** (self-hosted execution). Session (`composio.create(user_id)`) scopes user/toolkits/auth; sandbox pre-installs pandas/numpy + helpers (`run_composio_tool`, `invoke_llm`, `web_search`).
- **MCP path:** `session.mcp.url` = `https://backend.composio.dev/v3/mcp/{SERVER_ID}?user_id={USER_ID}` + `x-api-key` header → streams tools into any MCP client.
- **BYOK:** managed apps (Composio's OAuth) OR custom Auth Configs (your own client IDs/secrets). Free tier ~20K tool calls/month.
- **⚠️ Not self-hostable as a whole** (monorepo = SDKs + CLI; orchestration is hosted) — see doc 12 for the dual-path desktop architecture.
- **Check later:** `python/`, `js/`, `packages/` (sdk, cli, mcp).

### J2. Nango — `NangoHQ/nango` (11.4K⭐, TypeScript, Elastic License 2.0)
- **Repo:** https://github.com/NangoHQ/nango | **Docs:** https://docs.nango.dev
- **OAuth manager:** authorize (Nango Connect/SDK, connectionId + provider config, state/PKCE) → `/oauth/callback` exchanges code → token store (encrypted AES-256-GCM w/ `NANGO_ENCRYPTION_KEY`), auto refresh, Redis concurrency locks.
- **Proxy:** `/proxy/...` unified gateway; `Connection-Id` header → auto-injects token/API key; logs all traffic.
- **Sync framework:** JS/TS functions in isolated Runner containers; cron or programmatic triggers; delta detection, cursors, payload caching to Postgres.
- **Self-host:** Node microservices (Server, Orchestrator, Jobs, Runner, Persist) + **Postgres + Redis/Valkey** + S3 object storage; Docker Compose or Helm.
- **Check later:** `packages/` (server, runner, shared).

### J3. Zapier — org `zapier` (298 repos; core product closed SaaS)
| Repo | URL | Stars | What/how |
|---|---|---|---|
| **zapier-mcp** | https://github.com/zapier/zapier-mcp | 372 | Hosted MCP server at `https://mcp.zapier.com/api/v1/connect` — governed access to 9,000+ apps / 30K+ actions; **Zapier holds all OAuth grants centrally**; dynamic tool discovery; SOC 2; rate-limited + audit logged. |
| **sdk** | https://github.com/zapier/sdk | 242 | `@zapier/zapier-sdk` npm — `login` (machine-stored), `create-connection <app>` (OAuth), `run-action <app> <action> --inputs`. Runs as normal dependency in our Node sidecar. |
| **connectors** | https://github.com/zapier/connectors | 113, ELv2 | **The steal:** each app = **one folder, four surfaces** — ① agentskills.io skill, ② TS module `.run(input, opts)` + `connectionResolvers` (`env:TOKEN` = user-held creds, `zapier:<id>` = managed), ③ CLI, ④ local MCP over stdio. Pre-1.0 prototype. |
| **AutomationBench** | https://github.com/zapier/AutomationBench | 179, Py | Benchmark of agents on realistic business workflows (~600 tasks; top models pass ~35–50%) + white paper. |

- **Docs:** https://docs.zapier.com/mcp/home | Also `llms.txt` capability index pattern (doc 13).

### J4. MCP ecosystem — `modelcontextprotocol`
- **Org:** https://github.com/modelcontextprotocol | **Servers:** https://github.com/modelcontextprotocol/servers (reference servers: filesystem, memory, git, fetch, etc.) | **Spec:** https://modelcontextprotocol.io | **SDKs:** TS/Python/Java/Kotlin/C#.
- **What/how:** JSON-RPC 2.0 over stdio (local) or HTTP+SSE (remote); primitives = **Tools** (server→client capabilities), **Resources** (URI-addressable context), **Prompts** (templates); client ↔ server handshake + capability negotiation.

---

## K. Rapid-reference table (part 2)

| Repo | URL | Docs | Lang | Core implementation steal |
|---|---|---|---|---|
| Jan | github.com/janhq/jan | jan.ai/docs | TS/Rust | Tauri + llama.cpp router process; MCP host w/ approval cards |
| Cherry Studio | github.com/CherryHQ/cherry-studio | (repo docs) | TS | workspaces + multi-provider |
| Chatbox | github.com/Bin-Huang/chatbox | chatboxai.app | TS | Tauri BYOK client |
| Vellum | github.com/vellum-ai/vellum-assistant | vellum.ai | (TS?) | **CES: creds in separate process, default-deny sandbox** |
| GenOffice | github.com/genspark-ai/genoffice | (repo) | TS/Rust | Rust sidecar (calamine/IronCalc); block-patch docs |
| Open WebUI | github.com/open-webui/open-webui | docs.openwebui.com | Py | FastAPI+Svelte; Pipes/Filters/Actions; chunk-merge RAG |
| Ollama | github.com/ollama/ollama | docs.ollama.com | Go | local daemon, GGUF, OpenAI-compatible |
| LM Studio | github.com/lmstudio-ai/lms | lmstudio.ai/docs | TS | CLI+SDKs+MLX; closed app |
| OpenFang | github.com/RightNow-AI/openfang | (repo) | Rust | 137K LOC agent OS; WASM sandbox; single binary |
| Vane | github.com/ItzCrazyKns/Vane | (repo) | TS | SearXNG + readability + local embeddings + citations |
| Leon | github.com/leon-ai/leon | (repo) | TS | skills-as-files; 2.0 agentic core (Vercel AI SDK) |
| PyGPT | github.com/szczyglis-dev/py-gpt | (repo) | Py | desktop assistant + plugin/command exec |
| DeerFlow | mirrors only | — | — | upstream removed (doc 11) |
| Browser Use | github.com/browser-use/browser-use | docs.browser-use.com | Py | a11y-tree perception; AgentBrain; flash mode |
| Firecrawl | github.com/firecrawl/firecrawl | docs.firecrawl.dev | TS | scrape/search/crawl/map; Playwright; BullMQ |
| crawl4ai | github.com/unclecode/crawl4ai | docs.crawl4ai.com | Py | browser pool + memory-adaptive dispatcher; hooks; LLM extraction |
| Trafilatura | github.com/adbar/trafilatura | trafilatura.readthedocs.io | Py | heuristic main-text extraction |
| Jina Reader | github.com/jina-ai/reader | (repo) | TS/Py | r.jina.ai markdown proxy + s.jina.ai search |
| Camofox | github.com/jo-inc/camofox-browser | (repo) | JS/TS/C++ | stealth headless browser + MCP |
| deep-research | github.com/dzhng/deep-research | (repo) | TS | breadth×depth tree; Zod queries; Firecrawl |
| open_deep_research | github.com/langchain-ai/open_deep_research | (repo) | Py | LangGraph plan→research→gap-check→finalize |
| AutoSearch | github.com/0xmariowu/Autosearch | (repo) | TS | 40-channel MCP research engine |
| DeepAnalyze | github.com/ruc-datalab/DeepAnalyze | (repo) | Py | agentic data-science self-correct loop |
| ai-data-science-team | github.com/LearningCircuit/ai-data-science-team | (repo) | Py | multi-agent data pipelines on Jupyter |
| local-deep-research | github.com/LearningCircuit/local-deep-research | (repo) | Py/Docker | SearXNG+Ollama free research |
| Composio | github.com/composiohq/composio | docs.composio.dev | TS | MCP session.url; sandbox exec; BYOK |
| Nango | github.com/NangoHQ/nango | docs.nango.dev | TS | OAuth manager + proxy + sync (Postgres/Redis) |
| zapier-mcp | github.com/zapier/zapier-mcp | docs.zapier.com/mcp | — | hosted MCP, 9K+ apps, governed |
| zapier/sdk | github.com/zapier/sdk | (repo) | — | login/create-connection/run-action |
| zapier/connectors | github.com/zapier/connectors | (repo) | TS | one folder → skill+TS+CLI+MCP, connectionResolvers |
| zapier/AutomationBench | github.com/zapier/AutomationBench | (repo) | Py | 600-task business-workflow eval |
| MCP servers | github.com/modelcontextprotocol/servers | modelcontextprotocol.io | — | JSON-RPC tools/resources/prompts |

> **Feature-level code breakdowns** (tier-1: browser-use, firecrawl, crawl4ai, deep-research, Composio, Nango, Zapier connectors, Jan, Vellum) → `17-feature-implementation-tier1-web-connectors.md`. Tier-2 medium maps → `18-feature-implementation-tier2-medium.md`.

---

## L. Ledger notes & corrections (this pass)

- **PentAGI:** doc 03 said `lab42-global/PentAGI` — 404 this pass. Live repo = **`vxcontrol/pentagi`** (21.6K⭐, Go). Corrected in table.
- **HexStrike:** `wunderwuzzi23/hexstrike` 404'd → live = **`0x4m4/hexstrike-ai`** (10.8K⭐, Python, MCP).
- **Strix:** no dominant repo confirmed (only 31⭐ Kotlin `daboynb/strix`). Flag for re-check.
- **DeerFlow:** original repo removed (doc 11 confirmed). Mirrors listed.
- **Jan Tauri claim:** reported by Jan docs; root package.json no longer shows electron/tauri deps — hedge retained (doc 08).
- **PyRIT stars:** first search mis-parsed as 114 (raw API returned `"stars 114"` — implausible); PyRIT is actually ~1.7K⭐ (Azure/PyRIT). Corrected in doc 14.
- **Open Interpreter:** stars unavailable this pass (rate-limited) — value ~46K⭐ from earlier research; repo live.
- **Camofox stars:** doc 06 said ~2.5K; this pass's live GitHub search found `jo-inc/camofox-browser` at 8,355⭐. Newer figure used.
- **Coverage note:** `awesome-ai-agents-2026` (`caramaschiHG/awesome-ai-agents-2026`, 1.5K⭐) and AnythingLLM's `open-computer` submodule are index/list entries covered in doc 11, not implementation references — intentionally not ledgered.
