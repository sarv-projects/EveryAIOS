# 16 — Tier-1 Feature Implementation: Agents & Coding (feature-by-feature, code-level)

> Compiled 2026-08-06. Tier-1 = full code-level breakdown: **every major feature, HOW it's implemented (real code paths, classes, functions), plus URLs**.
> Tier-1 in this doc: AnythingLLM, Hermes, pi, Reasonix, OpenClaw, Agent Zero, smolagents, OpenFang.
> Tier-1 in doc 17: browser-use, firecrawl, crawl4ai, deep-research family, Composio, Nango, Zapier connectors, Jan, Vellum.
> Tier-2 (medium) → doc 18. Ledger overviews (all repos) → docs 14–15.

---

## 1. AnythingLLM — `Mintplex-Labs/anything-llm` (64K⭐, TS, MIT)
- **Repo:** https://github.com/Mintplex-Labs/anything-llm | **Docs:** https://docs.anythingllm.com

### Feature → Implementation map
| Feature | How it's implemented (code) |
|---|---|
| **Document ingestion** | `collector/` microservice (standalone Express). `POST /process` validates payload (`verifyPayloadIntegrity` middleware), then `processSingleFile/index.js` detects mime/extension → dispatches to `convert/` handlers: `asPDF` (pdf-parse), `asDocx` (mammoth), `asEPub` (epub2), `asImage` (tesseract.js OCR), `asXlsx` (node-xlsx), `asMbox`, `asAudio` (Whisper transcription via `wavefile`), `asOfficeMime`, `asTxt`. Returns documents with text chunks + token estimates. |
| **Chunking** | `server/utils/TextSplitter/index.js` — `TextSplitter` class, defaults `chunkSize=1000`, `chunkOverlap=20`; `determineMaxChunkSize(preferred, embedderLimit)` clamps to embedder context; delegates to `@langchain/textsplitters` (recursive character / token-based). |
| **Embedding** | `server/utils/embedder/` — provider abstraction: `native` (Transformers.js `all-MiniLM-L6-v2`, ~25MB CPU), OpenAI, Ollama, LocalAI, plus 14 total. Same shape as LLM providers. |
| **Vector storage** | `server/utils/vectorDbProviders/` — 10 providers: `native` (in-app), `chroma`, `lancedb`, `milvus`, `pinecone`, `qdrant`, `weaviate`, `astra`, `zilliz`, `pgvector`. Each exposes the same upsert/query interface. Metadata carries docName/workspace tags. |
| **Retrieval at query time** | DocumentManager → embed query → similarity search → **Document Similarity Threshold (min 20%)** + **Max Context Snippets (4–6)** → optional cross-encoder **rerank** (LanceDB accuracy mode) → packed into prompt. Pinned docs bypass RAG (full-text inject). |
| **Agents** | `server/utils/agents/aibitat/index.js` — **AIbitat** class: EventEmitter-driven "graph of agents" (`agents: Map`, `channels: Map`, `functions: Map`); tracks `maxRounds`, `_aborted`, `abortController`, `_pendingCitations`, `_toolAttachments`. 17 skill plugins (`plugins/index.js` + `defaults.js`): web-browsing (14 search engines, keyless DDG default), web-scraping (CollectorApi→Firecrawl), websocket, docSummarizer, chat-history, memory (`rag-memory` search/store + Deduplicator), rechart, sql-agent, filesystem, create-files, gmail, outlook, google-calendar, request-user-input, create-scheduled-job, model-router-cooldown, router-classifier. Availability-gated via `SKILL_FILTER_CONFIG` / `isToolAvailable()`. |
| **Scheduled jobs** | `server/utils/jobs/` — `@mintplex-labs/bree` + `@breejs/later` cron parsing (UTC) + `cron-validate`; `BackgroundService` singleton spawns **child processes** (`jobs/run-scheduled-job.js`) via `process.on("message")` IPC, p-queue queuing; states `queued→running→completed/failed/timed_out/killed`; full run archive to a Scheduled Jobs workspace + web push notifications. |
| **Model Router** | `server/utils/helpers/` — top-to-bottom rules: **calculated** (keyword/token-count/time-of-day/image-attachment match, 0 LLM calls) vs **LLM-classified** (`router-classifier` plugin spins a headless AIbitat whose only job is one `select_category` call with `skipHandleExecution` + TERMINATE); `model-router-cooldown` plugin prevents bounce loops. `updateENV.js` maps `LLM_PROVIDER`, `MODEL_ROUTER_ID`, `OPEN_AI_KEY`, etc. |
| **Multi-user + embed widget** | `server/endpoints/embedManagement.js` + `models/embedConfig.js` + `embedChats.js`; live document sync via `experimental/liveSync.js` + `jobs/sync-watched-documents.js`; AuthContext/ThemeContext/EmbeddingProgressContext in frontend. |
| **Agent Flows (visual)** | `server/utils/agents/aibitat/plugins/flows/` — `flowTypes.js` block schema: `START`, `API_CALL`, `LLM_INSTRUCTION`, `WEB_SCRAPING`; `executor.js` chains blocks, `skipHandleExecution` returns output without extra LLM turn. |

**Steals (code-level):** collector microservice isolation; `isToolAvailable()` skill gates; `_pendingCitations` buffer + `chunkSource` links; `BackgroundService` child-process jobs; Model Router calculated-vs-classified split; abort controller on agent loop.

---

## 2. Hermes Agent — `nousresearch/hermes-agent` (225.9K⭐, Python, MIT)
- **Repo:** https://github.com/nousresearch/hermes-agent | **Docs:** https://hermes-agent.nousresearch.com/docs

### Feature → Implementation map
| Feature | How it's implemented (code) |
|---|---|
| **Agent loop** | ⚠️ `agent/run_agent.py` **no longer exists** (refactored — doc 24 §1.2 / doc 25 §3); real files: `conversation_loop.py` (orchestration) + `turn_context.py`/`turn_finalizer.py`/`turn_retry_state.py`/`iteration_budget.py`/`subagent_lifecycle.py` — `AIAgent`; `_interruptible_api_call` (cancellable background HTTP w/ timeout monitor); tools run sequential/concurrent via `ThreadPoolExecutor`; strict OpenAI-compatible role alternation; **Iteration Budget default 500 turns, subagents capped 50**. |
| **System prompt assembly** | `agent/prompt_builder.py` — stateless assembly: identity, platform hints, skills index, context files; **scans `AGENTS.md`/`.cursorrules`/`SOUL.md` for prompt-injection/promptware** (threat patterns shared with memory-tool scanners + tool-result delimiters). |
| **Memory** | Local `MEMORY.md` + `USER.md`; **8 external providers** behind one interface: Honcho (user modeling), OpenViking (hierarchical `viking://` URIs, L0–L2 tiered loading), Mem0 (server-side LLM fact extraction), Hindsight (knowledge graph + entity resolution), Holographic (local SQLite FTS5, HRR algebraic queries + trust scoring), RetainDB, ByteRover, Supermemory. |
| **Skill self-creation** | `tools/skill_manager_tool.py` — `skill_manage` actions `create/edit/patch/delete/write_file/remove_file`; `SKILL.md` files in `~/.hermes/skills/`; `/learn <url>` slash command gathers material + commits skill; `agent/learning_graph.py` + `learn_prompt.py` parse skill frontmatter into a procedural-memory graph; background review policies patch failing skills. `skills.write_approval: true` gates writes. |
| **Gateway (21 platforms)** | messaging gateway routes to Telegram/Discord/Slack/WhatsApp/Signal/Email; media markers `[[as_document]]` (byte-integrity) + `[[audio_as_voice]]`; runtime ID→peer mapping. |
| **Delegation** | `delegate_task` tool — isolated subagents, independent iteration budgets, scoped contexts, **`DELEGATE_BLOCKED_TOOLS`** permission inheritance. |
| **Web search** | pluggable `web_search_registry` — Firecrawl, Tavily, Exa, DuckDuckGo keyless. |
| **Sandboxes** | `sandbox/` — local env, Docker, remote terminal backends, `terminal.env_passthrough`. |
| **Cron** | natural-language scheduling → cron jobs (doc 02 detail). |

**Steals (code-level):** prompt-injection scan on context files; Holographic SQLite FTS5 + trust scoring; skill_manage write/verify/persist loop; iteration-budget-with-subagent-cap; delegate blocked-tools inheritance.

---

## 3. pi — `earendil-works/pi` (84K⭐, TypeScript)
- **Repo:** https://github.com/earendil-works/pi

### Feature → Implementation map
| Feature | How it's implemented (code) |
|---|---|
| **Unified LLM API** | `packages/ai` — `@earendil-works/pi-ai`: provider collections (OpenAI/Anthropic/Google…), automatic auth resolution, **token & cost tracking** (`EMPTY_USAGE`, `Model` type with `cacheRead/cacheWrite/cost`), context persistence, mid-session model hand-off. Only tool-calling-capable models included (explicit choice). |
| **Agent loop** | `packages/agent/src/agent-loop.ts` — `agentLoop()` / `agentLoopContinue()` (rejects if last message is assistant role). Filters `message.content.filter(c => c.type === "toolCall")` → batch tool execution → pushes `toolResult` into context → loop. 🔥 **`stopReason === "length"` guard**: fails ALL tool calls from truncated message (`failToolCallsFromTruncatedMessage`) instead of executing borked args. |
| **Model swap / steering** | `prepareNextTurn` hook — after each turn can swap model (`nextTurnSnapshot.model`), inject steering messages, rewrite context. |
| **Event stream** | `EventStream<AgentEvent, AgentMessage[]>` — `turn_start/turn_end/agent_end`, text deltas, tool calls. |
| **Session persistence** | SQLite session backends (runtime-specific package). |
| **CLI modes** | `packages/coding-agent` — interactive, print/JSON, RPC (process integration), SDK (embed in app) — four surfaces from one engine. |
| **Extensions** | Skills, Prompt Templates, Themes, Pi Packages (shareable via npm/git) — "adapt pi without forking". |
| **Security stance** | No built-in permission system (runs with user's perms); containerization opt-in: Gondolin micro-VM, Docker, OpenShell sandbox. Supply-chain: pinned deps, `save-exact=true`, `min-release-age=2`. |

**Steals (code-level):** length-guard fails truncated tool calls; `prepareNextTurn` model-swap hook; four-surface CLI (interactive/JSON/RPC/SDK); token+cost in the loop.

---

## 4. DeepSeek-Reasonix — `esengine/DeepSeek-Reasonix` (31.4K⭐, Go, branch `main-v2`)
- **Repo:** https://github.com/esengine/DeepSeek-Reasonix

### Feature → Implementation map
| Feature | How it's implemented (code) |
|---|---|
| **Cache-first compaction** | `reasonix.example.toml` agent section: `soft_compact_ratio=0.5` (notice-only, keeps byte-stable prefix), `tool_result_snip_ratio=0.6` (snip stale tool results before summary), `compact_ratio=0.8`, `compact_force_ratio=0.9` (high-water marks). Case study: 99.82% cache hit on 435M tokens/day. |
| **Config-driven everything** | TOML drives providers (`[[providers]]` name/kind/base_url/models/api_key_env), `[agent]`, `[tools]`, `[permission]`, `[desktop]`, `[notifications]`. Adding a model = config edit. Resolution: `flag > ./reasonix.toml > home/config.toml > defaults`. |
| **Registry-based extensions** | `Provider`/`Tool` Go interfaces; built-ins self-register via blank imports + `init()` in `cmd/reasonix/main.go`; crash-capture wrapper (`crashreport.CapturePanic`). Built-in tools: read/write/edit/move/bash/ls/glob/grep. Plugins = stdio JSON-RPC (MCP-compatible). |
| **Asymmetric model tiering** | `planner_model` (frontier), `subagent_model`, `subagent_models = { review=…, security_review=… }`, `max_subagent_depth=2`, `max_subagent_concurrency=6`, `max_parallel_writers=3`. |
| **Permissions** | `internal/permission` — per-call `Policy allow/ask/deny → Decision`. |
| **Remote-SSH** | `internal/remote/` — port-forward lifecycle, SFTP file layer, detached `reasonix serve` bootstrap over SSH. |
| **Single binary** | `CGO_ENABLED=0`, one TOML dep, 6 cross-compile targets; tree-sitter grammars for code understanding; go-keyring for secrets. |
| **Architecture enforcement** | SPEC.md §2: `cli → {agent, plugin, config} → {tool, provider}`; dependency direction enforced acyclic; built-ins import parent to self-register. |

**Steals (code-level):** the four compaction ratios + snip-before-compact ordering; blank-import registration; acyclic dependency direction; per-call allow/ask/deny.

---

## 5. OpenClaw — `openclaw/openclaw` (~385K⭐, TypeScript)
- **Repo:** https://github.com/openclaw/openclaw
- **Repo root (verified):** `AGENTS.md`, `CLAUDE.md`, `REPORT.md`, `VISION.md`, `.crabbox.yaml`, Dockerfile, `CHANGELOG.md` — the spec files live at repo root.

### Feature → Implementation map
| Feature | How it's implemented (code — repo layout) |
|---|---|
| **Spec-driven orchestration** | Workspace file map loaded every session: `AGENTS.md` (operating rules), `SOUL.md` (persona), `USER.md` (directive user model, 4K budget), `IDENTITY.md`, `BOOT.md`, `BOOTSTRAP.md`, `memory/YYYY-MM-DD.md`. Plain markdown the agent reads AND writes (self-editable personality). |
| **Per-agent definition** | `~/.openclaw/openclaw.json` `agents.entries.*` — each agent gets own workspace/model/sandbox/tools/MCP servers; non-default agents get `<state-dir>/workspace-<agentId>` (isolated workspace per agent). |
| **System prompt assembly** | `buildAgentSystemPrompt` — Tooling, Execution Bias, Promised Work, Safety, Skills, Workspace, Sandbox, Temporal Context, Runtime, Reasoning sections; provider plugins inject stable-prefix (above cache boundary) / dynamic-suffix sections (model-family tuning). |
| **Gateways** | Multi-platform (mobile/desktop/chat) routing; `.crabbox.yaml` + Dockerfile for containers. |

**Steals (code-level):** spec-file set (AGENTS/SOUL/USER/IDENTITY/BOOT/BOOTSTRAP + daily memory log); per-agent workspace isolation dirs; stable-prefix system-prompt injection for cache.

---

## 6. Agent Zero — `agent0ai/agent-zero` (Python/Docker)
- **Repo:** https://github.com/agent0ai/agent-zero | **Docs:** https://www.agent-zero.ai/
- **Repo root (verified):** `agent.py`, `agents/`, `api/`, `conf/`, `docker/`, `extensions/`, `helpers/`, `initialize.py`, `knowledge/`, `lib/`, `models.py`, `plugins/`, `preload.py`.

### Feature → Implementation map
| Feature | How it's implemented (code) |
|---|---|
| **Agent context model** | `agent.py` — `AgentContextType` enum (`USER`/`TASK`/`BACKGROUND`); `AgentContext` class with thread-safe context dicts (`_contexts`, `_contexts_lock`, `_counter`), unique IDs, `AgentConfig`, pause state, streaming agent refs, deferred tasks, context-type tracking; re-init kills existing tasks. |
| **Loop & LLM plumbing** | `models.py` (LLMResult), `lib/` helpers (`extract_tools`, `files`, `history`, `tokens`, `dirty_json`, `subagents`, `extension`, `DeferredTask`, `Localization`, `ResponsesTransport`); LangChain `ChatPromptTemplate`/`SystemMessage`/`BaseMessage` base. |
| **Dockerized desktop** | `docker/` — full XFCE Linux desktop, browser with DOM annotation, LibreOffice live doc co-working; host bridge via A0 CLI (`preload.py`/`extensions/`). |
| **Skills** | `SKILL.md` (YAML frontmatter: name, description) + natural-language instructions + optional scripts; spliced into system prompt "Extras" tier JiT. |
| **Memory** | FAISS vector search + conversation fragments + proven solutions; unified Memory Dashboard. |
| **Web search** | SearXNG (privacy-respecting). |
| **Plugins/subagents** | `plugins/` + `extensions/` dirs; Plugin Hub 100+; multi-agent delegation to focused subagents. |
| **Time-travel snapshots** | workspace state snapshots (`/a0/usr`) → test modifications, diff, roll back (doc 03). |

**Steals (code-level):** AgentContext thread-safe lifecycle + task-kill-on-reinit; dirty-json repair helper; time-travel snapshots for safe self-modification.

---

## 7. smolagents — `huggingface/smolagents` (Apache-2.0, Python)
- **Repo:** https://github.com/huggingface/smolagents | **Docs:** huggingface.co/docs/smolagents

### Feature → Implementation map
| Feature | How it's implemented (code) |
|---|---|
| **Code-as-action** | `src/smolagents/agents.py` — `CodeAgent` prompts LLM to write **executable Python** instead of JSON tool calls; final answer via variable assignment. |
| **Sandboxed execution** | `src/smolagents/local_python_executor.py` — `LocalPythonExecutor`: blocks dunder access (`nodunder_getattr` for `__init__`/`__str__`/etc), enforces `MAX_OPERATIONS=10,000,000`, `MAX_WHILE_ITERATIONS=1,000,000`, `MAX_EXECUTION_TIME_SECONDS=30`; whitelisted safe builtins (`BASE_PYTHON_TOOLS`). Alternatives: `DockerExecutor`, `E2BExecutor`, `ModalExecutor`. |
| **Tool definition** | `src/smolagents/tools.py` — abstract `Tool` base + `@tool` decorator; **auto JSON-schema from type hints** (`_convert_type_hints_to_json_schema`, `get_json_schema`) for LLM param contracts. |
| **Managed agents** | `ManagedAgent` = agent + name/description for nesting (subagents). |

**Steals (code-level):** execution guards (op/loop/time limits, dunder block, safe-builtin whitelist); type-hint → JSON-schema auto-generation; code-as-action for weak models.

---

## 8. OpenFang — `RightNow-AI/openfang` (18.1K⭐, Rust)
- **Repo:** https://github.com/RightNow-AI/openfang

### Feature → Implementation map
| Feature | How it's implemented (code — crates) |
|---|---|
| **Agent OS core** | 14-crate workspace (Cargo.toml v0.6.9, edition 2021, resolver 2): `openfang-kernel` (core), `openfang-runtime`, `openfang-agent`, `openfang-cli`, `openfang-desktop`, `openfang-api`, `openfang-channels`, `openfang-hands` (tools), `openfang-memory`, `openfang-skills`, `openfang-extensions`, `openfang-types`, `openfang-wire`, `openfang-migrate` + `xtask`. |
| **WASM sandbox** | `openfang-extensions` — tools as WASM with **dual metering** (fuel = compute budget + epoch interruption) + watchdog killing runaway bytecode. |
| **Autonomous background agents** | kernel + channels + memory: scheduling, monitoring, knowledge-graph building for 24/7 agents, not chat wrappers. |
| **Distribution** | single ~32MB binary, `openfang init`/`openfang start`, dashboard on :4200. |
| **Shared infra** | tokio, serde/toml/rmp-serde, thiserror/anyhow, tracing, rusqlite (datastore), reqwest (LLM HTTP). |

**Steals (code-level):** WASM fuel + epoch-interruption sandbox; crate-boundary module layout (kernel/runtime/channels/hands/memory/skills).

---

> Next: **`17-feature-implementation-tier1-web-connectors.md`** (browser-use, firecrawl, crawl4ai, deep-research x3, Composio, Nango, Zapier connectors, Jan, Vellum) — then **`18-feature-implementation-tier2-medium.md`**.
