# Doc 41 — Master Steal vs Reference Index
**Final synthesis across docs 01–40. Every repo classified, every steal traced to source files.**

---

## 🏷️ How to read this document

| Tag | Meaning | Action during build |
|---|---|---|
| **🔴 STEAL** | Source code read, pattern traced to specific files. Directly implementable. | Open the listed source files, understand the logic, replicate in Rust/TS. |
| **🟡 ADAPT** | Pattern understood but needs Rust/TS translation or license allows concept-only. | Study the design, implement our own version. |
| **🟢 REFERENCE** | Consult during the specific build phase listed. Don't need upfront deep-read. | Open when building that component. |

---

## 📦 P0: Rust Workspace + Node Sidecar Skeleton

### 🔴 STEAL — implement immediately

| Repo | Source files to read | What to steal | Our implementation |
|---|---|---|---|
| **tauri-apps/tauri** (110K⭐) | `ARCHITECTURE.md`, `core/tauri/src/lib.rs` | tao window handling + WRY webview, bundler config | `pai-desktop` crate — our Tauri shell |
| **farion1231/cc-switch** (125K⭐) | `src-tauri/src/commands/provider.rs`, `src-tauri/src/services/provider/mod.rs`, `src-tauri/src/services/speedtest.rs` | `ProviderService` CRUD (add/update/delete/switch), `SpeedtestService` (warmup+timed 2nd req, `join_all`, 2-30s clamp), `AppType` enum per-app management | `pai-byok` crate — our BYOK hub |
| **zeroclaw-labs/zeroclaw** (33K⭐) | `crates/zeroclaw-api/src/lib.rs` (kernel ABI traits), `crates/zeroclaw-runtime/src/` (agent loop+security) | 16-crate layout, kernel ABI trait pattern (ModelProvider/Channel/Tool/Memory/Observer/RuntimeAdapter), request lifecycle | Our crate layout: `pai-core`, `pai-guard`, `pai-browser`, `pai-memory`, `pai-byok`, `pai-desktop` |
| **nousresearch/hermes-agent** (226K⭐) | `run_agent.py`, `iteration_budget.py`, `tool_result_storage.py`, `context_compressor.py` | `IterationBudget` (parent 500/subagent 50/execute_code refund), 3-layer tool-result persistence (preview+path, per-turn 200K, 0.15/0.30 context fractions), `context_compressor` Resolved/Pending + skill-marker reinjection | `pai-core` coordinator loop |
| **anomalyco/opencode** (194K⭐) | `packages/core/src/task.ts`, `packages/core/src/compaction.ts`, `packages/core/src/session.ts` | task-tool subagents (depth limit, inherited denies, task_id resume), compaction (20K buffer, tail-turns+split, PRUNE_PROTECT 40K tool-output erasure), per-message token schema | `pai-core` subagent spawner + token tracker |
| **agiresearch/AIOS** (6K⭐) | `aios/scheduler/base.py`, `aios/scheduler/fifo_scheduler.py`, `aios-rs/src/scheduler.rs` | `BaseScheduler` ABC (4 abstract methods), `FIFOScheduler` batch_interval=0.1s + `_execute_syscall` status tracking, `LLMAdapter` router (SequentialRouting/SmartRouting, 7 providers) | `pai-core` scheduler |

### 🟡 ADAPT — study design, implement our version

| Repo | What to adapt | Constraint | Our version |
|---|---|---|---|
| **earendil-works/pi** (84K⭐) | `EMPTY_USAGE` schema (input/output/cacheRead/cacheWrite/totalTokens/cost), agent-loop.ts event stream, provider auto-auth resolution | Python patterns → Rust traits | `pai-core` cost tracking + event bus |
| **google-gemini/gemini-cli** (106K⭐) | retry backoff (maxAttempts=4, exponential, 1s initial), `CompressionStatus` enum, 16 `GeminiEventType` events | TypeScript → Rust | `pai-core` retry layer |
| **agent0ai/agent-zero** (19K⭐) | `helpers/skills.py` (~800 lines): SKILL.md discovery+validation+activation, MAX_ACTIVE_SKILLS=20, search scoring | Python → Rust for `pai-skills` crate | `pai-skills` crate |
| **agent0ai/agent-zero** | `helpers/security.py`: cross-platform safe filename (FORBIDDEN_CHARS_RE, WINDOWS_RESERVED, NFC normalization) | Python → Rust | `pai-guard` file-safety module |
| **agent0ai/agent-zero** | `helpers/context.py`: ContextVar-based per-agent context storage | Python → Rust RwLock<HashMap> | `pai-core` agent context |

---

## 📦 P1: AI Chat + BYOK + Provider Hub

### 🔴 STEAL

| Repo | Source files | What to steal | Our implementation |
|---|---|---|---|
| **farion1231/cc-switch** | `src-tauri/src/proxy/providers/` (Claude/Codex/Gemini/Copilot/XAI), `src-tauri/src/session_manager/providers/` | Per-provider proxy + session management, `live` config sync | `pai-byok` provider adapters |
| **farion1231/cc-switch** | `src-tauri/src/services/balance.rs`, `subscription.rs`, `coding_plan.rs` | Quota tracking per provider, subscription management | `pai-byok` quota layer |
| **danny-avila/LibreChat** (42K⭐) | Provider list, artifact system, resumable streams | BaseClient per-user keys, multi-model chat, artifact rendering | `pai-chat` UI + provider layer |
| **OpenInterpreter/open-interpreter** (68K⭐) | Provider catalog auto-gen (`write_provider_catalog.py`), `/model` TUI switcher, `/harness` switcher | 10 harnesses, dynamic provider discovery | `pai-byok` provider catalog |
| **BerriAI/litellm** (56K⭐) | 132-provider gateway pattern | Single-entry multi-provider routing | `pai-byok` gateway |

### 🟢 REFERENCE — consult during build

| Repo | Consult for | Build phase |
|---|---|---|
| **Bin-Huang/chatbox** (41K⭐) | Tauri+React BYOK UI patterns | P1 UI |
| **CherryHQ/cherry-studio** (50K⭐) | Multi-provider desktop UX, MCP integration | P1 UI |
| **lencx/chatgpt** (54K⭐) | Tauri desktop packaging, auto-updater | P1 packaging |
| **x1xhlol/system-prompts** (143K⭐) | System prompt reference library | P1 agent design |
| **ollama/ollama** | `ollama serve` spawn + `GET /api/tags` + `GET /api/show` (model_info.context_length); `/api/chat` `format` accepts `"json"` or a JSON schema — **raw GBNF 500s on 0.21.x** (verified live) | P1.8 local.rs detection/spawn/list + broker `/api/chat` path |
| **Mozilla-Ocho/llamafile** (25K⭐) | Single-file llama.cpp server (weights + server in one binary); native GBNF `grammar` field on `/v1/chat/completions` — the real GBNF home (B5) | P1.8 local.rs launch (`--ctx-size 16384`) + broker llamafile path |

---

## 📦 P2: Agent Loop + Tool System + Sub-agents

### 🔴 STEAL

| Repo | Source files | What to steal | Our implementation |
|---|---|---|---|
| **bytedance/deer-flow** (79K⭐) | `agent.py`, `task_tool.py`, `subagent_limit_middleware.py`, `subagents_config.py` | 14-middleware chain (ThreadData→…→Clarification), `SubagentLimitMiddleware` (3 concurrent, 6 total/run, 50 turns, 15-30min timeout, 1M token budget), `task()` poll loop (5s→SSE), `CustomSubagentConfig` YAML, per-sandbox str_replace serial lock | `pai-core` middleware chain + subagent spawner |
| **nousresearch/hermes-agent** | `run_agent.py` conversation loop, `iteration_budget.py` | Parent 500/subagent 50/execute_code refund budget, checkpoint system (20 snap/500MB) | `pai-core` coordinator |
| **anomalyco/opencode** | `task.ts` subagent spawner | depth limit, inherited denies, task_id resume, per-agent model selection | `pai-core` subagent system |
| **Significant-Gravitas/AutoGPT** (186K⭐) | `agent.py`, Forge component system | 19 components (CodeExecutor/Docker, FileManager, GitOps, WebPlaywright, Skills, Watchdog), 8 prompt strategies | `pai-core` component registry |
| **langchain-ai/deepagents** (27K⭐) | Sub-agent isolation, context management (summarize+offload to disk), persistent memory | `create_deep_agent()` pattern | `pai-core` agent factory |

### 🟡 ADAPT

| Repo | What to adapt | Our version |
|---|---|---|
| **huggingface/smolagents** (29K⭐) | LocalPythonExecutor guards (10M ops/30s/dunder block) | `pai-guard` execution sandbox |
| **FoundationAgents/MetaGPT** (70K⭐) | SOP software company pattern, `DataInterpreter` | `pai-core` role-based agent templates |
| **microsoft/autogen** (60K⭐) | `AgentTool` for multi-agent orch, MCP via `McpWorkbench`+`StdioServerParams` | `pai-core` agent-as-tool |
| **crewAIInc/crewAI** (57K⭐) | Crews+Flows pattern, role-based collaboration | `pai-core` agent teams |
| **sopaco/cowork-forge** (83⭐, MIT) | **ACP external-coding-agent adapter** (`acp/client.rs` + `agents/external_coding_agent.rs` — drives Codex/Claude Code/Gemini over ACP stdio/WebSocket w/ streaming) + config-driven stage/hook/artifact pipeline (StageDefinition/HookConfig/ArtifactConfig/StageRetryConfig/FlowDefinition) + Actor-Critic stage types + goto_stage escalation + role-prompt instruction set (PM/Architect/Engineer) | `pai-core` ACP harness (F12/J17) + role templates (doc 56 C1–C3, C6) |

---

## 📦 P3: Memory + Context + Knowledge Graph

### 🔴 STEAL — these are the crown jewels

| Repo | Source files | What to steal | Our implementation |
|---|---|---|---|
| **mem0ai/mem0** (63K⭐) | `mem0/memory/main.py` (~2000 lines) | **9-phase batch pipeline:** Phase 0 (context gathering) → Phase 1 (existing memory retrieval, top_k=10) → Phase 2 (LLM extraction, anti-hallucination UUID mapping) → Phase 3 (batch embed) → Phase 4-5 (CPU processing + MD5 hash dedup) → Phase 6 (batch persist with individual fallback) → Phase 7 (batch entity linking: batch embed→batch search→insert vs update split) → Phase 8 (save messages + return). Multi-signal retrieval: semantic + BM25 keyword + entity graph boost → `score_and_rank()`. 27 vector stores, 20+ LLM providers. Identity scoping: user_id/agent_id/run_id first-class. | `pai-memory` crate — our memory engine |
| **getzep/graphiti** (30K⭐) | `graphiti_core/graphiti.py` (~1500 lines), `graphiti_core/search/search.py` | **Temporal knowledge graph:** EntityNode, EpisodicNode, CommunityNode, SagaNode + EntityEdge, EpisodicEdge. Episode pipeline: extract_nodes→resolve(dedup)→extract_edges→resolve(invalidation)→attributes→persist. Saga system: NEXT_EPISODE chains, dual-watermark summaries. Search: RRF + node distance + cross-encoder reranking, 3 config recipes. Multi-DB: Neo4j/FalkorDB/Neptune/Kuzu via IoC driver. | `pai-memory` KG engine |
| **NVIDIA-NeMo/labs-OO-Agents** (990⭐) | `packages/nooa-memory/src/nooa_memory/forgetting.py`, `manager.py`, `references.py` | **ACT-R activation:** retention `half-life × log1p(strength)`, importance ≥8 never auto-forgotten, associative semantic+keyword+recency+graph recall, typed supports/contradicts/derived-from edges, pre-turn spontaneous-recall context block → algorithm #32 | `pai-memory` cognitive engine |
| **agent0ai/agent-zero** | `helpers/skills.py` | Active/hidden/visible skill state management, MAX_ACTIVE_SKILLS=20, search scoring system, skill roots priority chain | `pai-skills` crate |
| **rohitg00/agentmemory** (27K⭐) | MCP memory server pattern | 95.2% R@5 retrieval, confidence scoring + lifecycle + knowledge graphs + hybrid search, 0 external DBs | `pai-memory` design reference |
| **warpdotdev/warp** (64K⭐, AGPL — pattern-only) | `crates/ai/src/index/full_source_code_embedding/` — **incremental codebase-embedding index**: tree-sitter semantic chunker (MAX_TRAVERSAL_DEPTH=200, coalesce_fragments), **merkle-tree content-hash incremental sync**, search shaping w/ char-boundary-safe reads, `file_outline/native.rs`; + `input_classifier` (ONNX candle+ort), `lsp` crate (rust/ts/pyright/clangd/go) | `pai-memory` codebase index + `pai-repomap` semantic path (doc 56 W1/W2/W4 — the open Rust DeepWiki) |

### 🟡 ADAPT

| Repo | What to adapt | Our version |
|---|---|---|
| **letta-ai/letta** (24K⭐) | MemGPT successor — agent-managed context paging (core + archival + recall memory) | `pai-memory` memory hierarchy |
| **Mintplex-Labs/anything-llm** (64K⭐) | Collector→convert→chunk(1000/20)→embed→LanceDB pipeline | `pai-memory` ingestion |
| **infiniflow/ragflow** (87K⭐) | Visual chunking, agentic RAG workflow, MinerU+Docling parsing | `pai-memory` RAG engine |
| **kuzudb/kuzu** (4K⭐) | Embedded graph DB (C++, zero-dependency) — lightweight Cypher graph store | `pai-memory` KG backend |
| **qdrant/qdrant** (34K⭐) | Edge embedded mode, HNSW+quantization | `pai-memory` vector backend |
| **topoteretes/cognee** (30K⭐) | ECL pipeline (Extract→Cognify→Load) into KG+vector+relational | `pai-memory` extraction |

---

## 📦 P4: Context Compression + Token Economy

### 🔴 STEAL

| Repo | Source files | What to steal | Our implementation |
|---|---|---|---|
| **esengine/DeepSeek-Reasonix** (32K⭐) | Prefix-cache stability, compaction ratios, per-call allow/ask/deny | Cache-first retrieval, `snip 0.6/soft 0.5/force 0.9` thresholds | `pai-core` token manager |
| **nousresearch/hermes-agent** | `context_compressor.py` | Resolved/Pending state machine, skill-marker reinjection, 0.15/0.30 context fraction allocation | `pai-core` context compressor |
| **rtk-ai/rtk** (75K⭐) | Single Rust binary, 100+ commands, per-command rules | ls→tree+counts, grep→truncate+group, git diff→reduced context, cargo test→failures only, bytes/4 token est | `pai-browser` output compressor |
| **NVIDIA-NeMo/labs-OO-Agents** | Pass-by-reference context | Never serialize what you can reference: live handles + bounded previews → matrix C10 | `pai-core` context construction |
| **headroomlabs-ai/headroom** (65K⭐) | SmartCrusher/CCR context compression | Dedicated compression layer before LLM call | `pai-core` pre-call compressor |

### 🟡 ADAPT

| Repo | What to adapt | Constraint | Our version |
|---|---|---|---|
| **AP3008/Janus** (3⭐) | MIT Rust compaction proxy (dedup→regex→tree-sitter AST prune→Redis cache) | Learn pattern | `pai-core` compaction proxy |
| **AlexChen31337/openclaw-plugin-terse** (0⭐) | MIT per-tool regex compression (50-85%), lite/full/ultra levels, code/errors verbatim rule | Learn pattern | `pai-core` tool output compression |
| **mksglu/context-mode** (20K⭐) | 98% context savings (315KB→5.4KB), FTS5 KB (BM25+porter+trigram+RRF), Think-in-Code sandboxed eval | ⚠️ ELv2 — learn, cannot copy | `pai-core` context server |
| **MikkoParkkola/glyphdown** (1⭐) | Lossless reversible symbolic dialect (−44.6% system-prompt, −31.7% corpus) | ⚠️ PolyForm Noncommercial — concept only | `pai-core` codec design |

### 🟢 REFERENCE — consult during build

| Repo | Consult for |
|---|---|
| **yamadashy/repomix** (28K⭐) | Repo→single-file packer, secretlint redaction, AI-friendly output format |

---

## 📦 P5: Browser + Computer Use + Web Automation

### 🔴 STEAL

| Repo | Source files | What to steal | Our implementation |
|---|---|---|---|
| **browseros-ai/BrowserOS** (13K⭐) | Full Rust+TS tree | a11y snapshot/diff engine, `run` rquickjs script-eval with browser SDK, audit+replay (NDJSON), plan-before-touch harness installer (7 agents), OAuth BYOK | `pai-browser` engine |
| **Skyvern-AI/rustwright** (832⭐) | Raw CDP engine (2.55x faster, 70% less RAM), `rustwright-cli` (open/snapshot/click/close) | Drop-in Playwright replacement, no Node driver | `pai-browser` CDP driver |
| **microsoft/playwright-mcp** (36K⭐) | Accessibility tree-based browser (no pixels), `npx @playwright/mcp@latest` | Structured a11y snapshots (not screenshots), token-efficient | `pai-browser` a11y layer |
| **firecrawl/firecrawl** (162K⭐) | Search+scrape+crawl+map+batch, 96% web coverage, P95 3.4s latency, LLM-ready Markdown | Web context API pattern | `pai-browser` scraper |
| **browser-use/browser-use** (108K⭐) | DOM-based browser agent, form fill+extraction+QA, self-hosted | Browser agent loop | `pai-browser` agent |

### 🟡 ADAPT

| Repo | What to adapt | Our version |
|---|---|---|
| **simular-ai/Agent-S** (12K⭐) | ACI grounding (UI-TARS-1.5-7B), Worker flush_messages, full LibreOffice UNO cell editing | `pai-browser` grounding + `pai-files` office integration |
| **ScrapeGraphAI/Scrapegraph-ai** (29K⭐) | `SmartScraperGraph` (prompt+URL→JSON), Ollama+100+ models, MCP server | `pai-browser` LLM scraping |
| **unclecode/crawl4ai** (77K⭐) | Memory-adaptive dispatcher | `pai-browser` crawl engine |

---

## 📦 P6: Guardrails + Security + Trust Ladder

### 🔴 STEAL

| Repo | Source files | What to steal | Our implementation |
|---|---|---|---|
| **agent0ai/agent-zero** | `helpers/security.py` | Cross-platform safe filename (FORBIDDEN_CHARS_RE covering Linux+Windows, WINDOWS_RESERVED 22 names, NFC normalization, 255 char max) | `pai-guard` file safety |
| **huggingface/smolagents** | LocalPythonExecutor guards | 10M ops/30s timeout, dunder block, restricted imports | `pai-guard` code sandbox |
| **NVIDIA-NeMo/labs-OO-Agents** | `code_validator/`, `restrictions.py` | AST validation + module deny-list, in-process sandbox (defense-in-depth) | `pai-guard` AST validator |
| **bytedance/deer-flow** | Per-sandbox str_replace serial lock | `(sandbox_id, path)` tuple prevents concurrent file corruption | `pai-guard` file locking |
| **superradcompany/microsandbox** (7K⭐) | libkrun microVMs (`msb_krun 0.1.25`), smoltcp networking | MicroVM isolation pattern | `pai-guard` sandbox (post-v1) |

### 🟡 ADAPT

| Repo | What to adapt | Our version |
|---|---|---|
| **anthropics/claude-code** (140K⭐) | Permission modes plan/acceptEdits/bypass → Trust Ladder UX | `pai-guard` trust ladder |
| **andrewyng/openworker** (13K⭐) | Approval-gated writes/sends/commands, unattended runs park in inbox | `pai-guard` approval system |
| **Azure/PyRIT** (114⭐) | LLM red-teaming orchestrator | `pai-guard` prompt injection defense |
| **elder-plinius/CL4R1T4S** (47K⭐) | System prompts for agent security | `pai-guard` security prompts |

---

## 📦 P7: File Processing + Office Suite Replacement

### 🔴 STEAL

| Repo | Source files | What to steal | Our implementation |
|---|---|---|---|
| **microsoft/markitdown** (172K⭐) | PDF/PPTX/DOCX/XLSX/Images(OCR+EXIF)/Audio/HTML/CSV/JSON/XML/ZIP/YouTube → Markdown, plugin system | Universal file→markdown converter | `pai-files` file converter |
| **genspark-ai/genoffice** (2K⭐) | `block-patch.ts` docx editing, `deterministic-planner` (zero-LLM ops), xlsx-sidecar (calamine+ironcalc) | Deterministic office file editing without LLM | `pai-files` office engine |
| **simular-ai/Agent-S** | `SET_CELL_VALUES_CMD` — full LibreOffice UNO integration (Calc/Writer/Impress cell editing) | Office automation via UNO | `pai-files` office bridge |

### 🟢 REFERENCE

| Repo | Consult for |
|---|---|
| **LibreOffice/core** (4K⭐) | Format-fidelity ground truth, LOK tiled rendering, headless convert, rust_uno (experimental) — **never bundle** |
| **toeverything/AFFiNE** (71K⭐) | Local-first Notion+Miro, CRDT sync, block-based editor |

---

## 📦 P8: Desktop Shell + Cross-Platform Packaging

### 🔴 STEAL

| Repo | Source files | What to steal |
|---|---|---|
| **tauri-apps/tauri** | Full Tauri v2 API, bundler, self-updater | Our desktop shell |
| **lencx/chatgpt** | Multi-platform Tauri packaging patterns | CI/CD for Mac/Win/Linux |
| **janhq/jan** | Tauri v2 verified (tauri.conf v0.8.4) | Desktop AI app reference |

### 🟢 REFERENCE — macOS vs Windows differences (from doc 40)

| Concern | macOS | Windows | Linux |
|---|---|---|---|
| WebView | WKWebView (built-in) | WebView2 Evergreen | WebKitGTK 4.1 |
| Signing | Apple Developer $99/yr + notarization | Authenticode $250-500/yr | None required |
| Sandbox | App Sandbox (entitlements) | None mandatory | Flatpak portals |
| Installer | .dmg, .app | .msi (WiX), .exe (NSIS) | .deb, .rpm, .AppImage |
| Auto-updater | Tauri built-in | Tauri built-in | Package manager or AppImageUpdate |

---

## 📦 P9+: Connector Hub + Messaging + Deep Research + Skills Ecosystem

### 🔴 STEAL

| Repo | Source files | What to steal |
|---|---|---|
| **composiohq/composio** (30K⭐) | 250+ tool integrations, sandbox, MCP bridge | Connector hub architecture |
| **NangoHQ/nango** (11K⭐) | 15 packages, OAuth/API connector platform | OAuth connector pattern |
| **andrewyng/openworker** | 25+ connectors (GitHub/Slack/Jira/Notion/Gmail/Calendar+MCP) | Connector catalog |
| **googleworkspace/cli** (30K⭐) | Dynamic command surface (Google Discovery Service), 40+ agent skills | Workspace connector |
| **composio-community/secure-openclaw** (1K⭐) | 24x7 messaging gateway (WhatsApp/Telegram/Signal/iMessage→Claude loop→Composio tools) | Messaging bridges (matrix F13) |
| **InternLM/MindSearch** (7K⭐) | Planner+parallel searchers, 5 search engines | Deep research engine |
| **Panniantong/Agent-Reach** (67K⭐) | Multi-platform agent internet (YouTube/Twitter/Reddit/Bilibili/GitHub), multi-backend routing, auto failover | Agent internet installer |
| **anthropics/skills** (167K⭐) | Official skills collection, `.skills/` directory, CLAUDE.md | Skills ecosystem |
| **obra/superpowers** (268K⭐) | 200+ skills, plugin marketplace | Skills catalog |

### 🟢 REFERENCE

| Repo | Consult for |
|---|---|
| **affaan-m/ECC** (238K⭐) | Multi-agent config/skill repo, AgentShield |
| **ItzCrazyKns/Vane** (36K⭐) | SearXNG+readability+embeddings+search agents |
| **Fosowl/agenticSeek** (27K⭐) | 100% local Manus alt, SearXNG+Docker+multi-model |
| **HKUDS/nanobot** (47K⭐) | Ultra-light self-hosted agent, Dream memory, Telegram/Discord/Slack |
| **ruvnet/ruflo** (67K⭐) | Agent meta-harness, 100+ agents, coordinated swarms |
| **khoj-ai/khoj** (36K⭐) | Self-hosted second brain, semantic search, Obsidian/Emacs/Desktop/Phone |
| **CopilotKit/CopilotKit** (37K⭐) | AG-UI Protocol, multi-platform agentic SDK |
| **github/copilot-cli** (11K⭐, closed — custom license) | Copilot CLI architecture: agentic loop + `/model` switching, Autopilot mode, `/fleet` subagents, **LSP diagnostics via `lsp-config.json`** (open pattern = Warp `lsp` crate, doc 56 W4), agentskills.io SKILL.md skills, GitHub MCP — F12 harness list member (doc 56 §4) |
| **dali-benothmen/cronflow** (125⭐, ⚠️ no LICENSE) | HITL pause-with-timeout as first-class state-machine state, webhook triggers, retry w/ backoff+jitter — H22/B7 automation-builder reference (doc 56 §3) |
| **nextlevelbuilder/ui-ux-pro-max-skill** (114K⭐) | UI/UX design automation |
| **thedaviddias/Front-End-Checklist** (73K⭐) | Pre-launch QA checklist |
| **coreyhaines31/marketingskills** (43K⭐) | Marketing automation skills |
| **K-Dense-AI/scientific-agent-skills** (33K⭐) | Scientific research for agents |
| **mukul975/Anthropic-Cybersecurity-Skills** (27K⭐) | Cyber skill packs |

---

## 📊 Summary

| Category | 🔴 STEAL | 🟡 ADAPT | 🟢 REFERENCE |
|---|---|---|---|
| Core/Agent loop (P0-P2) | 12 repos | 6 repos | 4 repos |
| Memory/KG (P3) | 5 repos | 6 repos | — |
| Context/Token (P4) | 5 repos | 4 repos | 1 repo |
| Browser (P5) | 5 repos | 3 repos | — |
| Guardrails (P6) | 5 repos | 4 repos | — |
| File processing (P7) | 3 repos | — | 2 repos |
| Desktop (P8) | 3 repos | — | platform notes |
| Connectors/Skills (P9+) | 9 repos | — | 14 repos |
| **Total actionable** | **47 repos** | **23 repos** | **21 repos** |

**Remaining ~65 repos** are cyber agents, business tools, and niche repos — reference-only, consult if building those specific features.
