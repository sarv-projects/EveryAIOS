# 27 — MASTER REPO LEDGER (all repos ever added, live-verified 2026-08-06; sections 20–28 added 2026-08-09/10/13)

> **Every repo ever added across docs 01–75**, deduplicated, **live-verified** (docs 68–75 add 0 new repos) (HTTP + `stargazerCount` scraped from github.com). **281 unique repos** (170 through section 19 + 22 in sections 20–21 + 26 in section 22 + 1 in section 23 — LadybugDB, doc 54, 2026-08-09 + 3 in section 24 — agent-browser/obscura/steel-browser, doc 55, 2026-08-10 + 4 in section 25 — warp/cowork-forge/cronflow/copilot-cli, doc 56, 2026-08-10 + 1 in section 26 — agentclientprotocol/registry, doc 57, 2026-08-10 + 19 in section 27 — OmniRoute/taste-skill/ppt-master/univer/codebase-memory-mcp/llmfit/GenericAgent/holaOS/better-harness/CodeWhale/etc., doc 58, 2026-08-13 + 1 in section 28 — TencentDB-Agent-Memory, doc 60, 2026-08-13 + 8 in section 29 — deepseek-harness/openhuman/A2A/Rapid-MLX/openocta/flock/RepoMapper/nilbox, doc 61, 2026-08-14 + 19 in section 31 — codeburn/Scrapling/xerj/awesome-claude-skills/career-ops/agentic-awesome-skills/code-review-graph/serena/loop-engineering/mirrord/system_prompts_leaks/prompts.chat/langflow/NextChat/lobehub/Prompt-Engineering-Guide/Pake/claude-mem/Qdrant-Edge, doc 65, 2026-08-15 + 4 in section 32 — models.dev/opentui/sst/openauth, doc 66, 2026-08-15 + 3 in section 33 — bolt.diy/hatchet/durable-execution-the-hard-way, doc 67, 2026-08-15). ⚠️ **ncdu has no GitHub mirror** — canonical host is `dev.yorhel.nl/ncdu` (listed with ⭐ n/a). (context-mode re-verified at 19,654⭐ — doc 32; final-pass §13; workspace/multi-agent §14; composio-community §15; command-code §16; NOOA §17; ACP ecosystem + extension-ABI references §18–19; dependency audit §23; ACP registry + subscription auth §26).
>
> 🔗 **URL convention:** every repo is `https://github.com/{owner}/{repo}` using the `owner/repo` shorthand in the table below — e.g., `openclaw/openclaw` → https://github.com/openclaw/openclaw. No need to search.
> **Depth tags:** ⬛ CODE = source-read (docs 16/17/25/28/29/33/35/55/56) · 🟦 STRUCT = structure-verified (doc 26) · 🟩 MAP = feature map (doc 18) · ⚪ ONE = one-line ledger (docs 14/15).
> ⚠️ = rate-limited structure this pass (doc 26 §6). ⭐ = live count 2026-08-06 (may differ from earlier API counts).
> **Transferred (not gone):** `LearningCircuit/ai-data-science-team` (404 at old path) → lives at **`business-science/ai-data-science-team`** (5,369⭐, doc 07).

---

## 1. Agentic OS / computer-use (16)
| Repo | ⭐ | Depth | What / steal |
|---|---|---|---|
| openclaw/openclaw | 385,302 | ⬛ | Spec-file orchestration (AGENTS/SOUL/USER/BOOT), per-agent workspace (doc 16 §5) |
| nousresearch/hermes-agent | 226,267 | ⬛ | The agent-that-grows: conversation loop, 8 memory providers, delegation, skills (docs 02/14/24/25) — **re-read doc 38**: IterationBudget 500/50 + execute_code refund, 3-layer tool-result persistence (preview+path, per-turn 200K, 0.15/0.30 context fractions), context_compressor Resolved/Pending + skill-marker reinjection, checkpoints 20snap/500MB |
| OpenInterpreter/open-interpreter | 67,927 | ⬛ | **Codex Rust fork** — 10 harnesses (`/harness`: native, claude-code, kimi-code, qwen-code, deepseek-tui, swe-agent, zcode…), ACP+Codex SDK compat, `AGENTS.md`+`.agents/skills` standard, provider catalog auto-gen via `write_provider_catalog.py`, native sandboxing (macOS/Linux/Windows), QA skill (agent-browser+trycua), `/model` TUI switcher, portability-first (docs 01/22/23/31) |
| agiresearch/AIOS | 6,186 | ⬛ | **LLM-as-OS kernel** — `BaseScheduler` ABC (4 abstract: LLM/mem/storage/tool), `FIFOScheduler` batch_interval=0.1s+_execute_syscall(status tracking executing→done), `RR scheduler` 0.05s, `LLMAdapter` router (SequentialRouting/SmartRouting, litellm.completion, 7 providers: OpenAI/Gemini/Groq/Anthropic/HF/Ollama/Novita, api_keys via config+env), **Rust port** `aios-rs/src/scheduler.rs` (Scheduler trait+NoopScheduler), LiteCUA extension (VM Controller+MCP Server), Cerebrum SDK (docs 22/23/26) |
| agent0ai/agent-zero | 18,746 | ⬛ | AgentContext model, SKILL.md self-creation, FAISS, time-travel (doc 16) |
| RightNow-AI/openfang | 18,077 | ⬛ | Rust 14-crate agent OS: kernel/runtime/hands/memory/skills, WASM dual-metering (doc 16) |
| simular-ai/Agent-S | 12,127 | ⬛ | **S3 72.60% OSWorld (surpasses human)** — flat architecture (AgentS3, no hierarchy), `Worker` flush_messages (long-context: keep text/drop old imgs, short-context: drop full turns), `ACI` grounding via UI-TARS-1.5-7B+CodeAgent, **full LibreOffice UNO**: `SET_CELL_VALUES_CMD` (Calc/Writer/Impress cell+formula editing via UNO), `agent_action` decorator, `PROCEDURAL_MEMORY` sys prompts, per-step reflection, max_trajectory_length=8, bBoN (docs 21/22/26) |
| different-ai/openwork | 21,172 | ✅ | Claude-Cowork/Codex alt; remote MCP control plane (docs 09/25) |
| xlang-ai/OSWorld | 3,066 | ✅ | Computer-use benchmark env (doc 22 verification) |
| heygen-com/hyperframes | 39,683 | ⬛ | **HTML→video framework** — 19 agent skills, CLI `hyperframes`, seekable animations, AI agent-friendly (Claude Code/Cursor/Gemini/Codex), Codex plugin, core skill set router, Node 22+, Apache-2.0 (docs 10/18/26) |
| microsoft/Orchard | 386 | ✅ | EXISTS (small) — paste's "Orchard framework" is not this; treat paste claim as unverified (doc 22) |
| zeroclaw-labs/zeroclaw | 32,524 | ⬛ | **Single Rust binary agent runtime (our closest architectural match — code-verified 2026-08-06)** — 16-crate layout: `zeroclaw-runtime` (agent loop+security+SOP+cron+SubAgents+RPC), `zeroclaw-api` (kernel ABI: ModelProvider/Channel/Tool/Memory/Observer/RuntimeAdapter/Peripheral traits), `zeroclaw-providers` (routing+retry), `zeroclaw-memory` (SQLite+embeddings+consolidation), `zeroclaw-plugins` (WASM WIT component model), `zeroclaw-gateway` (REST+WS+dashboard), request lifecycle: User→Channel→Runtime→Security→Provider→Tool→back; supervised autonomy + tool receipts + Landlock/Firejail/Seatbelt, SOP engine, estop+OTP (doc 30 §1 + architecture docs read) |
| nearai/ironclaw | 12,591 | ⬛ | **Rust agent OS (code-verified 2026-08-06)** — WASM sandbox (capability permissions+endpoint allowlisting+credential injection with leak detection), Docker sandbox (per-job tokens, orchestrator/worker), multi-channel (REPL/HTTP/WASM channels: Telegram+Slack/Web Gateway with SSE+WebSocket), persistent memory (hybrid FTS+vector RRF), Routines Engine (cron+event+webhook+heartbeat), encrypted credential store, `onboard` BYOK flow, MCP protocol, self-repair, FEATURE_PARITY.md (doc 30 §2 + README+GH page read) |
| browseros-ai/BrowserOS | 12,933 | ⬛ | **Agent browser (Chromium fork + agent platform)** — ⭐ source deep-dive doc 33: `run` rquickjs script-eval w/ `browser` SDK + InnerCallHook audit, a11y snapshot/refs/diff engine, audit+replay (NDJSON, sticky gap, 7-day retention), compaction engine knobs, plan-before-touch harness installer (7 agents), OAuth BYOK (ChatGPT/Copilot/Qwen), ⚠️ Klavis connector proxy = cloud (skip); learn-don't-copy (⚠️ AGPL) |
| papercomputeco/stereOS | 485 | 🟩 | Hardened Nix Linux for agents — agent/admin user split, restricted PATH, stereosd/agentd daemons, Lambda-MicroVM mixtapes (doc 30 §6) |
| PhyAgentOS-Dev/PhyAgentOS | 1,619 | 🟩 | Embodied/session-centered runtime — low desktop relevance (doc 30 §7) |

## 2. Coding agents / CLIs (11)
| Repo | ⭐ | Depth | What / steal |
|---|---|---|---|
| anomalyco/opencode | 194,005 | ⬛ | **Current opencode home** (⭐ = current-home count vs archived repo 13.6K) — Go→TS/Bun rewrite, 21 pkgs, Electron desktop (docs 24/25) — **re-read doc 38**: task-tool subagents (depth limit, inherited denies, task_id resume, per-agent model), per-message token schema {input,output,reasoning,cache{read,write}}+cost, stats aggregation, compaction (20K buffer, tail-turns+split, PRUNE_PROTECT 40K tool-output erasure) |
| opencode-ai/opencode | 13,611 | ⬛ | Archived Go codebase (original) |
| charmbracelet/crush | 27,111 | ⬛ | Original-author continuation of opencode |
| anthropics/claude-code | 140,432 | ⬛ | **Closed engine (patterns only)** — permission modes plan/acceptEdits/bypass→Trust Ladder UX, plugin marketplace, CLAUDE.md context, `/plugin marketplace add`, ACP agent, skills hooks, sub-agents, compaction (docs 05/22) |
| earendil-works/pi | 84,484 | ⬛ | **agent-loop.ts source-read 2026-08-06** — `runLoop()`: outer follow-up loop + inner tool-call loop; `stopReason=="length"` → fail ALL truncated tool calls; `executeToolCalls` parallel/sequential modes; `EMPTY_USAGE = {input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{...}}` (the pi cost-schema — our A9 mirror); `Agent` class: steeringQueue/followUpQueue with QueueMode, convertToLlm (user|assistant|toolResult filter), transformContext for pruning; `@pi-ai` providers: 35+ (OpenAI/Anthropic/DeepSeek/Mistral/Groq/xAI/OpenRouter/Copilot OAuth/Codex OAuth…) + auto auth resolution + cross-provider handoffs; `@pi-agent-core`: Agent state + SQLite session backend + event stream (agent_start→turn_start→message_update→tool_execution→turn_end→agent_end) (docs 05/16/19) |
| esengine/DeepSeek-Reasonix | 31,939 | ⬛ | Prefix-cache stability, compaction ratios, per-call allow/ask/deny (docs 05/16) |
| google-gemini/gemini-cli | 106,386 | ⬛ | **TypeScript agent CLI** — `GeminiEventType` 16 events (Content/ToolCallRequest/ChatCompressed/ContextWindowWillOverflow/LoopDetected/InvalidStream…), retry backoff (maxAttempts=4, exponential, 1s initial), `CompressionStatus` enum (COMPRESSED/INFLATED/EMPTY_SUMMARY/NOOP), `isValidResponse`+history validation, `MID_STREAM_RETRY_OPTIONS`, 1M token context, MCP+Google Search grounding, free tier 60rpm/1000rpd, GEMINI.md (docs 22/23/31) |
| googleworkspace/cli | 30,226 | ⬛ | **gws CLI (Rust+TS)** — dynamic command surface (Google Discovery Service→auto-builds commands), structured JSON, 40+ agent skills, OAuth/gcloud/SA/token auth, AES-256-GCM encrypted creds, `gws drive files list`, works for humans+AI agents, Apache-2.0 (docs 23/31) |
| farion1231/cc-switch | 126,015 | ⬛ | **Tauri 2 Rust BYOK hub (our exact stack!)** — `ProviderService` CRUD (add/update/delete/switch), `SpeedtestService` (warmup+timed 2nd req via `join_all`, 2-30s clamp, timeout/connect/HTTP error categorization), `AppType` enum (Claude/Codex/Gemini/GrokBuild/OpenCode/ClaudeDesktop/Hermes/OpenClaw), per-app failover queue, `live` config sync+import, proxy/providers per service, `session_usage` tracking, `balance`/`subscription`/`coding_plan`, `SkillService`+`PromptService`+`McpService` (docs 19/22/23/31) |
| Significant-Gravitas/AutoGPT | 185,844 | ⬛ | **Component architecture (Forge)** — 19 components (CodeExecutor/Docker, FileManager, GitOps, WebPlaywright, WebSearch, ImageGen, Skills, Todo, Watchdog…), 8 prompt strategies (OneShot, PlanExecute, ReWOO, Reflexion, ToT, LATS, Debate, MultiAgentDebate), `MultiProvider` LLM, `CommandPermissionManager`, `AgentContext`+`ExecutionContext`, autogpt_platform backend+blocks, classic agent factory+forge base (docs 23/26/31) |
| openai/openai-agents-python | 28,423 | ⬛ | **OpenAI Agents SDK** — SandboxAgent (UnixLocalSandboxClient/DockerSandboxClient), Realtime+Voice agents, guardrails, handoffs, sessions+tracing, `Runner.run_sync()`, `Manifest`+GitRepo, provider-agnostic (100+ LLMs), JS port, `computer.py/editor.py/apply_diff.py` tools (docs 21/24/31) |

## 3. Desktop AI apps (16)
| Repo | ⭐ | Depth | What / steal |
|---|---|---|---|
| Mintplex-Labs/anything-llm | 64,408 | ⬛ | Collector→convert→chunk(1000/20)→embed→LanceDB; 30 AiProviders; model router (docs 01/16/19) |
| janhq/jan | 43,869 | ⬛ | **Tauri 2 verified** (tauri.conf v0.8.4); llama.cpp, HF model manager, :1337 server (docs 08/24) |
| open-webui/open-webui | 148,001 | ⬛ | **retrieval code-verified 2026-08-06** — `retrieval/utils.py`: BM25Retriever + EnsembleRetriever + ContextualCompressionRetriever (hybrid), YoutubeLoader + get_web_loader for external knowledge, config keys for firecrawl/tavily/playwright, VECTOR_DB_CLIENT factory pattern, access-control integration (has_access_to_file/has_folder_access), LOADER_CONFIG_KEYS dict for web loader settings; features: RBAC, Filters/Actions/Pipes/Tools/Skills + MCP/MCPO/OpenAPI, Models & Agents, Notes, Channels, Persistent Memory, Calendar + AI scheduling, Live Workflow, Automations (docs 18/26) |
| ollama/ollama | 177,891 | ⬛ | Go daemon, GGUF, OpenAI-compatible :11434 (docs 08/11) |
| lencx/chatgpt | 54,432 | 🟪 | **Tauri desktop wrapper (Rust)** — Mac/Win/Linux, v2-dev branch, successor: Noi. Popular Tauri app reference for multi-platform packaging + auto-updater (doc 40) |
| CherryHQ/cherry-studio | 49,788 | ⬛ | **Electron desktop client** — 300+ pre-configured assistants, multi-provider (OpenAI/Gemini/Anthropic+Ollama/LM Studio local), MCP, WebDAV file management, multi-model simultaneous chat, AI translation, code highlighting, Mermaid charts, cross-platform (Win/Mac/Linux) (docs 18/26) |
| Bin-Huang/chatbox | 41,343 | ⬛ | **Tauri+React BYOK desktop client** — multi-provider (OpenAI/Gemini/Anthropic/Ollama), local chat history, Markdown rendering, code highlighting, image generation, cross-platform (Win/Mac/Linux), MIT (docs 18/26) |
| danny-avila/LibreChat | 41,714 | ⬛ | BaseClient per-user keys; **Artifacts agent-level, resumable generation-jobs** (docs 19/23/24/25) |
| ItzCrazyKns/Vane | 36,008 | ⬛ | **Source-read doc 35** — SearXNG + readability + embeddings + cited answers; classifier→researcher→scrapeURL search agents, widgets, search modes (docs 18/26/35) |
| leon-ai/leon | 17,414 | ⬛ | **V2 agentic personal assistant** — smart/controlled/agent modes, Skills→Actions→Tools→Functions→Binaries, Vercel AI SDK+better-sqlite3, Aurora UI, Node 24+, bridges (Node+Python), proactive pulse system, layered memory, local+remote AI providers, `core/context/LEON.md`+`ARCHITECTURE.md`, server/app/aurora/skills/bridges, MIT (docs 18/26) |
| andrewyng/openworker | 13,294 | 🟪 | **Andrew Ng's AI coworker (Python+Node+Rust)** — Tauri desktop + local agent server (aisuite), 25+ connectors (GitHub/Slack/Jira/Notion/Gmail/Calendar+MCP), approval-gated actions, scheduled automations, BYO model (11 providers+Ollama), local-first privacy, Rust toolchain (doc 40) |
| open-webui/desktop | 2,489 | 🟪 | **Open WebUI Desktop (Svelte)** — wraps Open WebUI as native desktop app (doc 40) |
| OpenCoworkAI/open-cowork | 1,979 | 🟪 | **Desktop AI agent (TS)** — one-click Claude Code+MCP+Skills install, sandboxed tool execution, encrypted local store, scheduled tasks, Win+Mac (doc 40) |
| genspark-ai/genoffice | 1,894 | ⬛* | **Deep-dive doc 28** — docx block-patch (text-patch.ts), xlsx-sidecar (calamine+ironcalc), **deterministic-planner** (zero-LLM ops), agent skill loop, watchdog streams (*core pillars read; pptx/pdf/project-store/ai-search internals pending) |
| szczyglis-dev/py-gpt | 1,870 | ⬛ | **Python desktop assistant** — chat/agents/code/web/image/audio + plugins, PyQt UI, local+remote models, agent modes, context memory (docs 18/26) |
| lmstudio-ai/lms | 5,160 | ⬛ | **LM Studio CLI** — `lms status/server start/stop/ls/ps/load/unload/log stream/create`, `--json` machine-readable output, lmstudio.js monorepo SDK, model load with GPU acceleration (`lms load <path> -y`), TypeScript (docs 18/26) |

## 4. Orchestration frameworks (6)
| Repo | ⭐ | Depth | What / steal |
|---|---|---|---|
| FoundationAgents/MetaGPT | 69,675 | ⬛ | **SOP software company** — product managers/architects/project managers/engineers, `metagpt "Create a 2048 game"`→full repo, `DataInterpreter`, MGX natural language programming, AFlow (ICLR 2025 oral top 1.8%), SPO+AOT papers, `generate_repo()`+`ProjectRepo` (docs 18/26/31) |
| microsoft/autogen | 60,258 | ⬛ | **Multi-agent framework (maintenance→MAF)** — `AssistantAgent`, `AgentTool` for multi-agent orch, MCP via `McpWorkbench`+`StdioServerParams`, `max_tool_iterations=10`, `agent.run_stream()`, AutoGen Studio no-code GUI, agentchat+ext pkgs, MAF successor with A2A+MCP (docs 18/26/31) |
| crewAIInc/crewAI | 56,681 | ⬛ | **Crews+Flows framework** — Crews (autonomous role-based collaboration), Flows (event-driven precise control), 100K+ certified devs, AMP Suite enterprise (tracing/observability/security), Claude Code plugin, MIT (docs 18/26/31) |
| agno-agi/agno | 41,599 | ⬛ | **compression source-read 2026-08-06** — `compression/manager.py`: `CompressionManager` w/ `compress_tool_results_limit` (default 3) + `compress_token_limit`; `should_compress()`: token-based OR count-based threshold; `DEFAULT_COMPRESSION_PROMPT`: preserve numbers/dates/entities/identifiers/quotes, remove introductions/hedging/meta-commentary/formatting-artifacts/redundancies; AgentOS runtime: 50+ SSE/WS endpoints, 100+ integrations, JWT-based RBAC, context providers (Slack/Drive/MCP), human approval pausing, OpenTelemetry tracing, cron scheduling; + `approval/` + `culture/` modules (docs 18/26) |
| CopilotKit/CopilotKit | 36,509 | ⬛ | **Multi-platform agentic SDK** — AG-UI Protocol (Google/LangChain/AWS/Microsoft), React/Angular/Vue/React Native/Slack, generative UI+shared state+HITL, self-learning CLHF, `npx copilotkit@latest create`, agent skills for Claude Code/Codex/Cursor/Gemini, backend tool rendering→UI components (docs 23/26) |
| langchain-ai/deepagents | 27,395 | ⬛ | **LangGraph harness** — sub-agents (isolated contexts), filesystem (local/sandboxed/remote), context management (summarize+offload to disk), shell access, persistent memory, HITL approval, skills on-demand, MCP, model-agnostic (frontier/open-weight/local/Ollama/vLLM), `create_deep_agent()`, JS port deepagents.js, Deep Agents Code CLI (docs 23/31) |

## 5. Agents / memory / research (15)
| Repo | ⭐ | Depth | What / steal |
|---|---|---|---|
| huggingface/smolagents | 28,692 | ⬛ | LocalPythonExecutor guards (10M ops/30s/dunder block) (doc 16) |
| bytedance/deer-flow | 79,565 | ⬛ | **2.0 channels-first super-agent** — 10 IM adapters (Telegram/Slack/Discord/WeChat/Feishu/DingTalk/WeCom/GitHub/Buzz/Nostr), `message_bus`+per-channel `run_policy`+`dedupe_store`, LangGraph 14-middleware chain (ThreadData→…→Clarification), `SubagentLimitMiddleware` (3 concurrent, 6 total/run), `task()` poll loop 5s→SSE, `CustomSubagentConfig` YAML, per-sandbox str_replace serial lock, JWT/OIDC/password auth (docs 11/15/21/39) |
| rohitg00/agentmemory | 26,629 | ⬛ | **Persistent agent memory (iii engine)** — 95.2% R@5 retrieval, 92% token reduction, 54 MCP tools, 12 auto hooks, 0 external DBs, 1,428+ tests, confidence scoring+lifecycle+knowledge graphs+hybrid search, supports 10+ coding agents (Claude Code/Copilot/Cursor/Gemini/Codex/Hermes/OpenClaw/pi/OpenCode), npm global install (docs 21/23) |
| Fosowl/agenticSeek | 26,736 | ⬛ | **100% local Manus alt** — voice-enabled, autonomous web browsing+code execution+task planning, SearXNG+Docker+Ollama/LM Studio/OpenAI/DeepSeek/OpenRouter/Anthropic, Python 3.10, GPL-3.0, smart agent selection, REDIS session cache (docs 23/31) |
| Panniantong/Agent-Reach | 67,185 | ⬛ | **Agent internet capability installer** — YouTube/Twitter/Reddit/Bilibili/RSS/GitHub/Instagram/Facebook/Web search, multi-backend routing (auto failover), `agent-reach doctor` diagnostics, free+open-source, cookie-local, MIT, all CLI agents (docs 23/31) |
| khoj-ai/khoj | 36,334 | ⬛ | **Self-hosted AI second brain** — local+online LLMs (llama3/qwen/gemma/mistral/gpt/claude/gemini/deepseek), semantic search (PDF/MD/Notion/Word/org-mode), custom agents (knowledge+persona+model+tools), Obsidian/Emacs/Desktop/Phone/WhatsApp, Pipali open-source AI coworker, cloud+self-host (docs 23/26) |
| HKUDS/nanobot | 46,698 | ⬛ | **Ultra-light self-hosted agent** — WebUI+Terminal+Telegram/Discord/Slack/WeChat/Email, tools (files/shell/web/MCP/cron/images/subagents), Dream long-term memory, OpenAI-compatible API, model routing+fallback, scheduled automation, Python 3.11+, MIT (docs 21/23/24) |
| dzhng/deep-research | 19,488 | ⬛ | breadth×depth + gap-check (doc 17) |
| langchain-ai/open_deep_research | 12,517 | ⬛ | LangChain deep research (doc 17) |
| ruc-datalab/DeepAnalyze | 4,436 | 🟩 | Deep-analysis agent (doc 07) |
| LearningCircuit/local-deep-research | 8,851 | 🟩 | Local deep research agent (doc 07) |
| rtk-ai/rtk | 75,397 | ⬛ | **Rust bash-output compressor** — single binary, 100+ commands, <10ms overhead, per-command rules (ls→tree+counts, grep→truncate+group, git diff→reduced context, cargo test→failures only, pytest→failures only), token est `bytes/4`, `rtk init -g` for Claude Code/Codex/Gemini/Cursor/Windsurf, Apache-2.0 (docs 20/23/31) |
| ruvnet/ruflo | 67,142 | ⬛ | **Agent meta-harness** — 100+ specialized agents, coordinated swarms, self-learning memory, federated comms across machines, enterprise guardrails, `npx ruflo init`, Router→Swarm→Agents→Memory→LLM with Learning Loop, Claude Code+Codex plugins, 8.1M+ eco downloads, RuVector Agentic DB, MIT (docs 21/23/24) |
| EverMind-AI/EverOS | 11,843 | 🟩 | Markdown-first memory runtime, SQLite+LanceDB indexes (doc 30 §4) |
| MemTensor/MemOS | 10,623 | 🟩 | Memory OS — cubes, KB/tool memory; Neo4j+Qdrant self-host (doc 30 §5) |

## 6. Web / scraping / search / RAG (16)
| Repo | ⭐ | Depth | What / steal |
|---|---|---|---|
| browser-use/browser-use | 108,021 | ⬛ | service.py/HistoryItem.to_string() — DOM-based browser agent (doc 17) |
| firecrawl/firecrawl | 161,936 | ⬛ | Search+scrape→markdown; BullMQ services (doc 17) |
| unclecode/crawl4ai | 76,650 | ⬛ | Memory-adaptive dispatcher (doc 17) |
| infiniflow/ragflow | 86,939 | ⬛ | **Deep RAG engine** — visual chunking, agentic RAG workflow (MCP+code executor+memory), multi-channel (Feishu/Discord/Telegram/Line), MinerU+Docling parsing, orchestrateable ingestion pipeline, GraphRAG, OpenClaw skill, multi-modal PDF/DOCX, DeepSeek v4+Gemini 3 support (docs 21/23/26) |
| ScrapeGraphAI/Scrapegraph-ai | 29,140 | ⬛ | **LLM-graph scraping library** — `SmartScraperGraph` (prompt+URL→JSON), Ollama/OpenAI+100+ models, MCP server, LangChain+LlamaIndex+CrewAI+Agno integrations, Pipedream+Bubble+Zapier+n8n+Dify low-code, Playwright headless, MIT (docs 21/23/31) |
| getmaxun/maxun | 17,050 | ⬛ | **No-code scraping bots** — visual bot builder, scheduled runs, data extraction, self-hosted (doc 23) |
| oxylabs/google-ai-mode-scraper | 3,468 | ⬛ | **Paid API scraper** — Google AI mode→JSON/Markdown, `source:google_ai_mode`, `render:html`, proxy+headless+anti-block handled, Oxylabs Web Scraper API (docs 23/31) |
| adbar/trafilatura | 6,415 | ✅ | Best precision/recall pure-HTML extractor (docs 06/24) |
| jina-ai/reader | 11,819 | ✅ | URL→markdown reader (doc 06) |
| jo-inc/camofox-browser | 8,356 | ✅ | a11y snapshots ~90% token cut (docs 06/10) |
| InternLM/MindSearch | 6,910 | ⬛ | **Planner+parallel searchers** — 5 search engines (DuckDuckGo/Bing/Brave/Google/Tencent), InternLM2.5-7b-chat+GPT4, React+Gradio+Streamlit UIs, FastAPI backend, Lagent v0.5 agent module, Apache-2.0 (docs 21/23) |
| VectifyAI/PageIndex | 35,028 | ⬛ | **Vectorless RAG source-read**: cost-model tree + injection hardening (docs 23/24/25) |
| qdrant/qdrant | 33,807 | ⬛ | **Rust vector DB + Edge embedded** — server (Docker `:6333`) + EdgeShard (in-process), HNSW+quantization+sharding, 7 official clients (Go/Rust/JS/Python/.NET/Java), agent skills for optimal config, Apache-2.0 (docs 20/26) |
| SeekStorm/SeekStorm | 1,904 | ⬛ | **Sub-millisecond Rust search** — vector+lexical hybrid, in-process lib+multi-tenancy server, 6 clients (Rust/Python/PyO3/C#/Java), Docker, REST API, Apache-2.0, production since 2020 (docs 20/23) |
| Skyvern-AI/rustwright | 832 | ⬛ | **Rust Playwright (2.55× faster, 70% less RAM)** — drop-in API compat (Python+Node), raw CDP engine (no Node driver), `rustwright-cli` (open/snapshot/click/close), MCP server, Chromium-only alpha, Python/Node/Ruby/.NET/Java bindings, MIT (docs 20/26) |
| endee-io/endee | 1,316 | ⬛ | **End-to-end agent framework** — full agent lifecycle platform (docs 20/23) |

## 7. Connectors / hub / MCP (8)
| Repo | ⭐ | Depth | What / steal |
|---|---|---|---|
| composiohq/composio | 29,561 | ⬛ | 250+ tool integrations, sandbox, MCP bridge (docs 12/17) |
| NangoHQ/nango | 11,360 | ⬛ | 15 packages; OAuth/API connector platform (docs 12/17) |
| modelcontextprotocol/servers | 89,256 | ⬛ | Reference MCP servers (docs 10/15) |
| microsoft/playwright-mcp | 35,850 | ⬛ | **Playwright MCP server** — accessibility tree-based (no pixels), `npx @playwright/mcp@latest`, 10+ MCP clients (VS Code/Claude Code/Codex/Copilot/Cursor/Windsurf/Claude Desktop/Cline/Goose/Grok), CLI+SKILLS alternative for token-efficiency, Node 18+, Apache-2.0 (docs 15/26) |
| zapier/sdk | 242 | ⬛ | Zapier CLI SDK (doc 17) |
| zapier/connectors | 113 | ⬛ | Integration platform connectors (doc 17) |
| zapier/zapier-mcp | 371 | ⬛ | Zapier's MCP server — 7000+ app connectors via MCP, `npx @zapier/mcp` (doc 17) |
| zapier/AutomationBench | 179 | ⬛ | Zapier automation benchmark — 100+ real-world workflow eval set (doc 17) |

## 8. Infra / runtime libs (17)
| Repo | ⭐ | Depth | What / steal |
|---|---|---|---|
| microsoft/markitdown | 171,824 | ⬛ | **Office/media→markdown converter** — PDF/PPTX/DOCX/XLSX/Images(OCR+EXIF)/Audio(transcription)/HTML/CSV/JSON/XML/ZIP/YouTube/EPubs, plugin system (`#markitdown-plugin`), CLI `markitdown file.pdf -o doc.md`, pipe support, optional deps per format, Azure Doc Intel+Content Understanding, built by AutoGen team, MIT (docs 20/21/31) |
| tauri-apps/tauri | 110,062 | ⬛ | **Rust desktop shell (our pick!)** — tao window handling + WRY system webview (WKWebView/WebView2/WebKitGTK), 6 platforms (Win/Mac/Linux/iOS/Android), built-in bundler (.app/.dmg/.deb/.rpm/.AppImage/.exe/.msi), self-updater, system tray, native notifications, MIT+Apache-2.0 (docs 20/26) |
| rust-lang/rust | 115,291 | ⬛ | **Rust language** — our core implementation language, cargo build system, crates.io ecosystem, WASM target, FFI, async/await, tokio runtime (docs 20/26) |
| burntsushi/ripgrep | 67,040 | ⬛ | **Fast Rust grep** — regex search, `.gitignore` awareness, SIMD acceleration, Unicode support, `-g` glob flags, MIT+Unlicense (docs 20/26) |
| toeverything/AFFiNE | 71,252 | ⬛ | **Local-first Notion+Miro** — block-based editor, CRDT sync, offline-first, canvas+docs, plugin system, Rust+TS, AGPL (docs 20/26) |
| mudler/LocalAI | 48,277 | ⬛ | **Local OpenAI-compatible server** — drop-in replacement, llama.cpp+diffusers+whisper backends, Docker, model gallery, text+image+audio+video, MIT (docs 20/21) |
| headroomlabs-ai/headroom | 65,131 | ⬛ | Context-compression layer (SmartCrusher/CCR) — compaction answer (docs 22/24/31) |
| BerriAI/litellm | 55,685 | ⬛ | 132-provider gateway, one entry (docs 19/24) |
| calesthio/OpenMontage | 45,375 | ⬛ | Open-source video editor + compositor — V2 bucket, timeline editing, AI-assisted (docs 22) |
| superradcompany/microsandbox | 7,150 | ⬛ | **krun microVMs**, 15 crates, 4 SDKs (docs 20/23/24/25) |
| Factory-AI/vfs | 3 | ⬛ | SQLite VFS + copy-on-write sandbox — virtual file system layer for safe agent I/O isolation (doc 20) |
| LibreOffice/core | 4,197 | 🟩 | **REFERENCE only** (doc 29) — format-fidelity ground truth; LOK tiled rendering + headless convert + rust_uno (exp.) = optional backends, never bundle |
| yamadashy/repomix | 27,665 | ⬛ | Repo→single-file packer (CLI/web/VS Code/ext/MCP) — glob select → strip-comments token count → **secretlint redaction** → XML-with-tree; remote/GitHub shorthand; git-log+diffs; AI-friendly token-optimized; MIT (doc 31 §6) |
| MikkoParkkola/glyphdown | 1 | ⬛ | ⚠️ **PolyForm Noncommercial** — Claude Code plugin: **lossless reversible symbolic dialect** (GLYPHDOWN-L1, −44.6% on every system-prompt call), tool-output codec −31.7% corpus / −71.1% bash, native-binary hot path, cache-stacking insight — **learn concept, cannot copy** (doc 31 §2) |
| AP3008/Janus | 3 | ⬛ | MIT Rust **compaction proxy** for Anthropic API — dedup → regex structural (docs/comments/stack-traces) → **tree-sitter AST relevance prune** → Redis/RediSearch semantic cache (BGE-small-384d); Ratatui metrics TUI (doc 31 §4) |
| AlexChen31337/openclaw-plugin-terse | 0 | ⬛ | MIT OpenClaw plugin — per-tool regex compression hooks (50–85%), lite/full/ultra levels, **code/errors verbatim rule**, excludeAgents/tools safety rails, sub-agent injection (doc 31 §3) |
| tarek-clarke/DarwinCaveman | 0 | 🟩 | MIT — output-side decompression: terse "caveman" generations decoded by local Ollama before display (doc 31 §5) |

## 9. Cyber agents (10)
| Repo | ⭐ | Depth | What / steal |
|---|---|---|---|
| usestrix/strix | 49,127 | ⬛ | **AI pentest** — autonomous multi-agent, full toolkit (recon→exploit→validation), real PoCs (no false positives), CI/CD + GitHub Actions, Apache-2.0, `strix-agent` PyPI (docs 14/18/26) |
| aliasrobotics/CAI | **9,651** | ✅ | **FOUND** — 300+ models via LiteLLM incl. Ollama air-gap; multi-agent (docs 03/24/25) |
| vxcontrol/pentagi | 21,659 | ⬛ | **PentAGI** — Coordinator+4 sub-agents, pgvector memory, Docker-isolated, Graphiti KG, OAuth (GitHub+Google), Langfuse tracing, 10+ LLM providers (Ollama/OpenAI/Anthropic/Gemini/Bedrock/DeepSeek/GLM/Kimi/Qwen/MiniMax) (docs 18/26) |
| GreyDGL/PentestGPT | 14,724 | ⬛ | **USENIX Security 2024** — multi-stage pipeline (recon→exploit→walkthrough), Claude Code+Codex backend-pluggable, session persistence, multi-category (Web/Crypto/Reversing/Forensics/PWN/PrivEsc), legacy mode (OpenAI/Anthropic/Gemini/DeepSeek/xAI/Qwen/Ollama), MIT (docs 18/26) |
| 0x4m4/hexstrike-ai | 10,832 | ⬛ | MCP bridge to 150+ offensive tools — Kali/Parrot integration, unified MCP interface for security tooling (docs 18/26) |
| berylliumsec/nebula | **1,081** | ✅ | **FOUND** — pentest desktop workbench, scope enforcement, OCI isolation (docs 03/24/25) |
| JoasASantos/NeuroSploit | 1,281 | ⬛ | Rust red/blue team framework — agentic pentest, Rust-native tooling (docs 18/26) |
| protectai/vulnhuntr | 2,726 | ⬛ | Zero-shot static→exploit vuln discovery — AI-powered code analysis, PoC generation (docs 18/26) |
| straylabs-ai/deadend-cli | 288 | ⬛ | Agentic pentest CLI, 81% KIMI K2.5 benchmark — automated security testing terminal (docs 18/26) |
| Azure/PyRIT | 114 | ⬛ | LLM red-teaming orchestrator — Microsoft's AI security testing framework (docs 18/26) — ⚠️ low vs historical ~1.6K: scraped twice, repo was reorganized; treat count as current-truth |

## 10. Business / automation tools (10)
| Repo | ⭐ | Depth | What / steal |
|---|---|---|---|
| n8n-io/n8n | 199,517 | ✅ | Workflow automation (doc 10) |
| HKUDS/Vibe-Trading | 29,925 | ⬛ | **Trading agent** — FastAPI+React 19, `vibe-trading-ai` PyPI, MCP+API, shadow account, financial guardrails, MIT, Python 3.11+ (docs 10/18/26) |
| Fincept-Corporation/FinceptTerminal | 29,884 | ⬛ | C++/Qt financial terminal — 100+ data connectors → unified stream, Bloomberg-like (docs 10/18/26) |
| Anil-matcha/Open-Generative-AI | 25,670 | ⬛ | Image/video multi-backend router — fallback across providers, generative media pipeline (docs 10/18/26) |
| AgriciDaniel/claude-ads | 7,851 | ⬛ | Paid-media skill for AI agents — capability-gated state-mutation, ad campaign management (docs 10/18/26) |
| cloudflare/agentic-inbox | 6,736 | ⬛ | **Cloudflare Workers AI agent email** — Durable Objects+SQLite+R2, Email Routing, Agents SDK+Workers AI, Access auth, approve-before-send guard, self-hosted (docs 10/18/26) |
| BlockRunAI/ClawRouter | 6,683 | ⬛ | **Agent-native LLM router** — 66 models, 6 free (no keys), x402 USDC micropayments (Base+Solana), 87% cost reduction, TypeScript, OpenClaw plugin, USDC Hackathon Winner, MIT (docs 10/18/26) |
| The-Swarm-Corporation/AutoHedge | 4,114 | ⬛ | Director→Quant→Risk→Execution — multi-agent trading pipeline, hedge fund-style (docs 10/18/26) |
| nowork-studio/NotFair | 3,321 | ⬛ | Goal↔metric contract — loop marketing agents, continuous optimization (docs 10/18/26) |
| mksglu/context-mode | 19,654 | ⬛ | ⚠️ **ELv2** (learn, not copy) — MCP context server, **98% context savings (315KB→5.4KB)**: sandbox tools keep raw data out, FTS5 KB (BM25+porter stem+trigram+**RRF**+proximity+fuzzy+smart snippets+TTL cache+throttling), **Think-in-Code** sandboxed eval, session continuity (event index, `--continue`), routing-enforcement hooks, 17 clients (docs 10/25/32) |

## 11. Skills / prompts / checklists (10)
| Repo | ⭐ | Depth | What / steal |
|---|---|---|---|
| obra/superpowers | 267,591 | ⬛ | **Skill-systems for coding agents** — 200+ skills, plugin marketplace, agent tooling, MIT (docs 22/23) |
| affaan-m/ECC | 238,119 | ⬛ | Multi-agent config/skill repo; plan-before-build + AgentShield; agent orchestration; skill bundling; MIT (docs 04/09/10/26) |
| anthropics/skills | 166,565 | ⬛ | **Official skills collection** — MCP/ACP skills for Claude Code+Agents, `.skills/` directory, CLAUDE.md, Apache-2.0 (docs 22/23) |
| x1xhlol/system-prompts-and-models-of-ai-tools | 142,609 | ⬛ | System prompts + model catalog of AI tools — comprehensive reference for agent behavior design (docs 22/23) |
| nextlevelbuilder/ui-ux-pro-max-skill | 113,950 | ⬛ | UI/UX skill for agents — design system automation, component generation (docs 22/23) |
| thedaviddias/Front-End-Checklist | 73,441 | ⬛ | Front-end QA checklist — comprehensive pre-launch verification framework (docs 22/23) |
| elder-plinius/CL4R1T4S | 46,764 | ⬛ | System prompts for agent security — prompt injection defense, safety guardrails reference (docs 22/23) |
| coreyhaines31/marketingskills | 43,200 | ⬛ | Marketing skills for AI agents — campaign automation, content generation (docs 22/23) |
| K-Dense-AI/scientific-agent-skills | 32,801 | ⬛ | Scientific research skills — literature review, data analysis, experiment design for agents (docs 22/23) |
| mukul975/Anthropic-Cybersecurity-Skills | 27,369 | ⬛ | Anthropic-style cyber skills — Claude-compatible security skill pack (docs 22/23) |

## 12. Reference / misc (3)
| Repo | ⭐ | Depth | What / steal |
|---|---|---|---|
| vellum-ai/vellum-assistant | 1,015 | ⬛ | CES continuous-eval (doc 17) |
| 0xmariowu/Autosearch | 37 | 🟩 | Search agent (doc 11) |
| business-science/ai-data-science-team | 5,369 | 🟩 | **Transferred from LearningCircuit org** — multi-agent DS team (Loader/Cleaner/EDA/Feature/ML under Supervisor) + Streamlit pipeline studio (doc 07) |

## 13. Final-pass additions — memory / knowledge-graph / local runtime (2026-08-06, live-verified)
| Repo | ⭐ | Depth | What / steal |
|---|---|---|---|
| mem0ai/mem0 | 62,670 | ⬛ | **The 2026 memory SOTA** — multi-signal retrieval (semantic + BM25 + entity-graph boost fused into one score: +29.6 temporal / +23.1 multi-hop over plain RAG), multi-scope identity (user/agent/session/org), procedural memory; validates our doc 03 memory layer + doc 32 retrieve rule |
| topoteretes/cognee | 29,820 | ⬛ | ECL pipeline (Extract → Cognify → Load) into knowledge graph + vector + relational memory; GraphRAG-style connect-the-dots (see docs 05/21 for KG context) |
| getzep/graphiti | 29,619 | ⬛ | **Temporal knowledge graph** (Zep) — edge-versioned KG, recency-aware retrieval; the data structure for our Spreading-Activation (#7) + Temporal-Anticipation (#4) algorithms |
| Mozilla-Ocho/llamafile | 25,504 | ⬛ | **Single-file local LLM runtime** (Mozilla) — one binary = weights + server; lightest possible local-model path for BYO-local |
| letta-ai/letta | 24,116 | ⬛ | MemGPT successor — **agent-managed context paging** (core + archival + recall memory); the memory-hierarchy blueprint (doc 03 §4 multi-tier) |
| neuml/txtai | 12,802 | ⬛ | Embedded vector DB (SQLite) + embeddings, portable pure-C/Python; lighter than LanceDB for simple semantic search |
| getzep/zep | 4,813 | ⬛ | Agent memory layer (fact extraction + temporal knowledge) — Graphiti's production home |
| kuzudb/kuzu | 4,026 | ⬛ | **Embedded graph database (C++, zero-dependency)** — the lightweight Cypher graph store for our KG (vs heavy Neo4j/Qdrant); adjacency-list model of doc 03 §7; ⚠️ **archived Oct 2025** (team acquired by Apple) — superseded by LadybugDB (section 23, doc 54 §1.1) |

## 14. Workspace / multi-agent additions (2026-08-06, live-verified)
| Repo | ⭐ | Depth | What / steal |
|---|---|---|---|
| open-webui/computer | 401 | 🟩 | **Open WebUI Computer (`cptr`)** — serves the whole machine to any browser: Editor/Files/Terminal/Git on one screen, drives the user's existing agent CLIs (Codex/Claude Code/Cursor/Grok/OpenCode/Cline/Pi) side-by-side on the same real workspace (no containers/sandbox), persistent sessions + phone pickup (doc 35 → matrix F12/H18) |

## 15. Composio-community batch (2026-08-06, live-verified)
| Repo | ⭐ | Depth | What / steal |
|---|---|---|---|
| composio-community/open-chatgpt-atlas | 447 | ⬛ | **ChatGPT Atlas alt** — Chrome ext + Electron browser, Gemini 2.5 **computer-use visual automation** (screenshot→click), Composio Tool Router (500+ apps), **confirmation dialogs for sensitive web actions**, no-backend direct calls (doc 36 → validates E9/J3/F5) |
| composio-community/secure-openclaw | 1,194 | ⬛ | Thin **24×7 messaging gateway** (WhatsApp/Telegram/Signal/iMessage → Claude loop → Composio tools, memory + scheduled reminders); MIT — `gateway.js`/`cli.js`/`config.js` (doc 36 → **matrix F13 messaging bridges**) |
| composio-community/awesome-claude-plugins | 1,859 | 🟩 | Curated **Claude Code plugin catalog** (commands/agents/hooks/MCP; 10 categories) + plugin-structure docs (doc 36 → I2/F8 taxonomy) |
| composio-community/awesome-codex-skills | 15,651 | 🟩 | Curated **Codex skills catalog** (5 categories) + `~/.codex/skills` SKILL.md install convention (doc 36 → I2 skill-registry convention) |

## 16. Command Code & taste-1 (2026-08-06, live-verified)
| Repo | ⭐ | Depth | What / steal |
|---|---|---|---|
| CommandCodeAI/command-code | 3,628 | 🟩 | **Command Code CLI agent** (binary closed-source) — the **`taste-1` meta neuro-symbolic preference learner**: auto-learns micro coding prefs (exports/naming/flags/frameworks) from accepts/rejects/edits, stores as confidence-scored `taste.md`, injects as symbolic prior at generation (doc 37 → **matrix C9 taste profile**; pattern only) |
| CommandCodeAI/desktop | 26 | 🟩 | Desktop wrapper: projects/sessions, streamed conversations, review plans + feedback, file browser + line-diffs, Git panel, integrated terminal (doc 37 → **validates P1 workspace layout**) |
| CommandCodeAI/agent-skills | 101 | 🟩 | Curated skills catalog, 9 categories (doc 37 → I2 seed library) |
| CommandCodeAI/langui | 3,144 | 🟩 | Open-source Tailwind **chat-UI components** (Langbase) (doc 37 → optional H1 chat-UI source) |

## 17. NVIDIA NOOA (2026-08-06, live-verified)
| Repo | ⭐ | Depth | What / steal |
|---|---|---|---|
| NVIDIA-NeMo/labs-OO-Agents | 990 | ⬛ | **NOOA — Object-Oriented Agents** (Python, LiteLLM, Apache-2.0 LICENSE): agent-as-class, 6 harness capabilities; **pass-by-reference context** (live refs + bounded previews — never serialize what you can reference) → **matrix C10**; **nooa-memory ACT-R activation + spontaneous recall** (retention half-life × log1p(strength), importance ≥8 protected, associative semantic+keyword+recency+graph, typed supports/contradicts/derived-from edges, pre-turn spontaneous block) → **algorithm #32**; AST + module deny-list + per-cell REPL sandbox (defense-in-depth), `intercept()` middleware, channels (monitor/cron/tail/race/spawn), 11 SKILL.md bundles, trace viewer (doc 39 → C10 + #32 + 05 §5.9 + 07 §7.7 + 06 §6.6) |

## 18. ACP ecosystem + modularity references (2026-08-07, live-verified)
| Repo | ⭐ | Depth | What / steal |
|---|---|---|---|
| agentclientprotocol/agent-client-protocol | 3,889 | ⬛ | **ACP (Agent Client Protocol) spec** — Apache-2.0, no CLA; JSON-RPC 2.0 over stdio (newline-delimited); `initialize` capability negotiation (integer major version + optional-by-default capabilities — the production-proven ABI-versioning model); session lifecycle (session/new, prompt, update, cancel, request_permission); v2 draft (beyond-turn updates, message patching, structured diff + `git_patch`); versioned JSON Schema artifacts (schema/v1/, schema/v2/); official SDKs: Rust `agent-client-protocol`, TS `@agentclientprotocol/sdk`, Python/Java/Kotlin (doc 45 → **F12 harness-driving protocol + matrix J17**; doc 44 patch-1 reference impl) |
| openclaw/acpx | 3,107 | 🟪 | **Headless CLI client for stateful ACP sessions** — reference for driving ACP agents without a GUI (doc 45 §3) |
| RAIT-09/obsidian-agent-client | 2,336 | 🟪 | **ACP client in Obsidian** (brings Claude Code/Codex/Gemini into a desktop app via ACP) — precedent for embedding ACP agents in a desktop shell (doc 45 §3) |

## 19. Extension-ABI reference implementations (2026-08-07, source-verified)
| Repo | ⭐ | Depth | What / steal |
|---|---|---|---|
| zed-industries/zed | 48,945 | ⬛ | **Modularity gold standard** — `crates/extension/src/capabilities.rs` (`ExtensionCapability::ProcessExec/DownloadFile/NpmInstallPackage`), `process_exec_capability.rs` (`*`/`**` arg wildcard matcher + unit tests), `capability_granter.rs` (manifest allow-list ∧ host grant double-check), `extension_manifest.rs` (`schema_version`, allow_exec), `wasm_host.rs` (wasmtime/WASI), `wasm_host/wit/since_v0_0_{1,4,6}.rs` (versioned ABI) (doc 44 → **matrix I6 Extension ABI** — the capability/ABI model to copy) |
| microsoft/vscode | 168,432 | 🟪 | **Contribution-point model** — `src/vs/platform/extensions/common/extensions.ts` (`contributes`, `activationEvents`, `capabilities`), extension-host process + lazy activation, host proxies (doc 44 §1 → I6 lazy-activation + declare-don't-code) |

---

## 20. Storage intelligence — disk walker / treemap / dedup / instant search (2026-08-09, live-verified; doc 49)
> 🟦 here = **web-verified per docs 49–50** (README/docs/secondary), NOT doc-26 structure-read. All rows in sections 20–21 dedup-checked against sections 1–19 (no overlap; 22 genuinely new).
| Repo | ⭐ | Depth | What / steal |
|---|---|---|---|
| xangelix/edirstat | 24 | 🟦 | **Parallel disk-usage analyzer + deduplicator (Rust, MIT, active)** — work-stealing walker (crossbeam-deque, cycle/device-boundary checks, `ignore` globset), lock-free snapshot coordinator (immutable `FileNode` arena via `arc_swap`, ~100ms cadence), zero-copy `bytemuck` u32 arena, Windows MFT scanner, **7-stage dedup** (size → prefix/mid/suffix blocks → multi-range sampling → BLAKE3, hardlink-aware), headless CLI + Zstd snapshots (doc 49 §2 → **everyaios-storage crate + matrix D9/D10**) |
| Dicklesworthstone/ultrasearch | 25 | 🟦 | **Windows Rust instant search** — always-on `searchd` (NTFS MFT via `usn-journal-rs` + USN tailing), idle-only content workers (Extractous/IFilter/OCR), GPU UI over named pipes, Alt+Space palette (doc 49 §3 → **G7 FTS5 filename index + notify watcher**) |
| windirstat/windirstat | 3,813 | 🟦 | **WinDirStat (GPL-2.0 — pattern only, no code)** — treemap + extension stats + hash dedup + cleanup actions (recycle-bin, Disk Cleanup/defrag/CHKDSK shortcuts); the feature checklist for our treemap/cleanup UI (doc 49 §4 → D9 cleanup + D11) |
| pkolaczk/fclones | 2,868 | 🟦 | **Dedup at scale (Rust, MIT)** — size grouping → xxHash3/metro prefix/suffix → BLAKE3/SHA only when needed; reflink COW (btrfs/xfs/apfs); path-prefix compression + device-aware scheduling; millions of files, low RSS (doc 49 §5 → D10 stage ordering) |
| dev.yorhel.nl/ncdu | n/a | 🟦 | **ncdu — no GitHub mirror** (canonical: dev.yorhel.nl/ncdu, C). TUI reference UX for compact disk-usage lists (doc 49 §6) |
| dundee/gdu | 5,882 | 🟦 | **Go disk analyzer (Go package API)** — cross-platform TUI + library API (doc 49 §6) |
| bootandy/dust | 12,102 | 🟦 | **du in Rust** — bar-graph output = a great chat-artifact pattern for agent disk summaries (doc 49 §6) |
| byron/dua-cli | 6,110 | 🟦 | **dua-cli (Rust, MIT/Apache)** — TUI **and library crate** (walk → structured data) — closest library-grade walker (doc 49 §6) |
| KDE/filelight | 280 | 🟦 | **KDE treemap GUI (GitHub mirror)** — treemap visualization reference (doc 49 §6) |
| GNOME/baobab | 164 | 🟦 | **GNOME disk-usage analyzer (GitHub mirror of GitLab)** — treemap/chart reference (doc 49 §6) |
| shundhammer/qdirstat | 2,523 | 🟦 | **QDirStat (C++/Qt, KDirStat successor)** — `qdirstat-cache-writer` = headless background crawler pattern (doc 49 §6) |

## 21. Generative UI / voice / clipboard / email (2026-08-09, live-verified; doc 50)
| Repo | ⭐ | Depth | What / steal |
|---|---|---|---|
| ag-ui-protocol/ag-ui | 15,196 | 🟦 | **AG-UI — Agent-User Interaction Protocol (MIT)** — ~16 JSON event types over one channel (SSE/WS/webhooks); adopters LangGraph/CrewAI/MS Agent Framework/Google ADK/AWS Strands/PydanticAI/Agno/LlamaIndex/AG2; framework bindings incl. Rust (doc 50 §1 → **matrix H25** — adopt the wire spec for chat↔coordinator UI updates) |
| rhasspy/piper | 11,276 | 🟦 ⚠️ | **Piper TTS (MIT) — ⚠️ ARCHIVED (read-only)** — use `sherpa-onnx` Piper voices / `piper-rs` instead (doc 50 §5 → H28 offline TTS) |
| espeak-ng/espeak-ng | 6,723 | 🟦 | **espeak-ng (GPL-3.0)** — phonemizer data backend for Piper/sherpa TTS; data linkage only, no code copy (doc 50 §5) |
| k2-fsa/sherpa-onnx | 14,058 | 🟦 | **sherpa-onnx (Apache-2.0, official Rust crate)** — TTS (VITS/Matcha/Kokoro) + STT (Zipformer) + VAD + diarization on ONNX Runtime — the primary offline-voice library (doc 50 §5 → H28 TTS + H15 STT) |
| coqui-ai/TTS | 45,870 | 🟦 | **Coqui TTS (MPL-2.0)** — repo live but company wound down → **skip** (Python-heavy, no first-class Rust) (doc 50 §5) |
| dscripka/openWakeWord | 2,650 | 🟦 | **openWakeWord (Apache-2.0)** — streaming ONNX wake-word detector; Python-first, wrapper needed (doc 50 §5 → H15 wake word) |
| Picovoice/porcupine | 4,908 | 🟦 | **Porcupine — ⚠️ proprietary/commercial license** → BYO only, never bundle (doc 50 §5) |
| alphacep/vosk-api | 15,033 | 🟦 | **Vosk (Apache-2.0, Kaldi)** — offline STT, community Rust wrappers (doc 50 §5 → H15 offline STT option) |
| ggerganov/whisper.cpp | 52,741 | 🟦 | **whisper.cpp (MIT)** — C/C++ Whisper port, `whisper-rs` bindings; tiny/base models CPU-ok (doc 50 §5 → H15 option) |
| postalsys/imapflow | 562 | 🟦 | **imapflow (Node, Apache-2.0)** — async IMAP with IDLE push; provider-agnostic email fallback (Rust: async-imap + lettre) (doc 50 §6 → F14) |
| openonion/email-agent | 2 | 🟦 | **email-agent (tiny reference)** — local Google OAuth + NL email agent (search/triage/meeting-scheduling); design reference for F14/F15 tool surface (doc 50 §6) |

## 22. Gap-pass-2 — hierarchy / computer-use / search-stack references (2026-08-09, live-verified; doc 52)
> 🟦 = web-verified per doc 52 (GitHub API live check). **8 proposed repos were UNVERIFIABLE** (cyber-memory, AIO-Sandbox-AI, Special Agents, Agent Market, Nous APM, TraceVerse, devai pod, Lybic — 404/no real match; treated as possibly hallucinated, never cited).
| Repo | ⭐ | Depth | What / steal |
|---|---|---|---|
| trycua/cua | 21,059 | 🟦 | **Cua — "Docker for computer-use AI"** — sandboxed desktops for any agent; reference for post-v1 E9 computer-use sandboxing (doc 52 §0) |
| eigent-ai/eigent | 14,870 | 🟦 | **Eigent — open-source Cowork Desktop** — local, free desktop multi-agent cowork; validates the desktop-multi-agent bet (doc 52 §0) |
| microsoft/agent-framework | 12,697 | 🟦 | **Microsoft Agent Framework** — SDK/runtime for multi-agent systems; orchestration reference (we keep pi/Hermes-derived B-section) (doc 52 §0) |
| Simular-ai/Agent-S | 12,143 | 🟦 | **Agent S — open agentic framework that uses computers like a human** — GUI grounding SOTA-class; post-v1 E9 pattern reference (doc 52 §0) |
| SolaceLabs/solace-agent-mesh | 4,954 | 🟦 | **Solace Agent Mesh** — event-driven multi-agent framework; reference for event-driven patterns (doc 52 §0) |
| boxlite-ai/boxlite | 2,225 | 🟦 | **BoxLite — micro-VM for AI agents** (light enough to embed) — reference for I3 WASM/libkrun sandboxing (doc 52 §0) |
| asciimoo/hister | 1,849 | 🟦 | **Hister — self-hosted search engine** (Searx author) — full-text indexer for web/local content; C3/G7 local-web-memory reference (doc 52 §4) |
| BAI-LAB/MemoryOS | 1,549 | 🟦 | **MemoryOS (EMNLP-2025 Oral)** — memory OS with temporal knowledge graph + hybrid vector retrieval + Ebbinghaus decay; reference only (C1–C12 complete) (doc 52 §0) |
| neon-mmd/websurfx | 1,171 | 🟦 | **WebSurfx — Rust metasearch engine** (IO-uring, ~20–40MB, built-in ranking+cache) → **G8 fast tier** (doc 52 §4) |
| eunomia-bpf/agentsight | 569 | 🟦 | **AgentSight — eBPF system-level profiler/monitor for agents** → J14 observability reference (doc 52 §0) |
| RyjoxTechnologies/Octopoda-OS | 504 | 🟦 | **Octopoda-OS — open-source memory + observability layer for AI agents** — reference only (doc 52 §0) |
| vixues/LeAgent | 202 | 🟦 | **LeAgent — open-source desktop AI agent** (plans & ships work; 100+ tools catalog reference) — F14 row taken by email, reference only (doc 52 §0) |
| mat-1/metasearch2 | 171 | 🟦 | **metasearch2 — Rust metasearch engine (cute)** — powers metasearch2-mcp; fast-tier reference (doc 52 §4) |
| deejayy/indexical | 66 | 🟦 | **Indexical — private local-first memory for everything you read** — C3/G7 local-web-memory reference (doc 52 §4) |
| gefsikatsinelou/MetaSearchMCP | 52 | 🟦 | **MetaSearchMCP — metasearch MCP backend** (multi-engine aggregation, fallback, dedup) — validates F6/F9 search-as-MCP (doc 52 §4) |
| RobertTLange/agentlens | 36 | 🟦 | **AgentLens — local in-depth observability for coding-agent sessions** → J14 reference (doc 52 §0) |
| Luthiraa/julie | 28 | 🟦 | **Julie — open-source assistant with computer-use agents** (lightweight always-on GUI agent) — post-v1 E9 reference (doc 52 §0) |
| keith-vs-kev/searxng-search | 17 | 🟦 | **OpenClaw plugin: SearXNG-powered web search — no API keys, no rate limits, self-hosted** — validates G1 (doc 52 §4) |
| TadMSTR/searxng-mcp | 16 | 🟦 | **searxng-mcp — SearXNG metasearch → ML rerank → 4-tier fetch cascade (Firecrawl/Crawl4AI/raw/Wayback), parallel** → **G8 parallel fetch pattern** (doc 52 §4) |
| Kevin-Liu-01/Local-Search | 5 | 🟦 | **Local-Search — Rust CLI: local browser → structured search API** (user's Chrome profile, cached) — E13 authenticated-search reference (doc 52 §4) |
| Ferki-git-creator/bytewise-search | 3 | 🟦 | **Bytewise-search — private in-browser search engine** — reference (doc 52 §4) |
| guilherme13c/pythia | 3 | 🟦 | **Pythia — distributed Kubernetes-native search engine + web crawler (Rust)** — worst-case-build reference only (doc 52 §5) |
| lyteabovenyte/Offline-Search | 2 | 🟦 | **Offline-Search — search the world you've saved, offline** — C3/G7 reference (doc 52 §4) |
| vikramlingam/Perceive-Search | 2 | 🟦 | **Perceive-Search — privacy metasearch + local Qwen AI summaries** — G2 synthesis reference (doc 52 §4) |
| dorucioclea/farfalle | 1 | 🟦 | **Farfalle — self-hosted AI search engine** (local/cloud LLM answers) — G2 synthesis reference (doc 52 §4) |
| dedsecrattle/Argus | 1 | 🟦 | **Argus — distributed web crawler (Rust)** — worst-case-build reference only (doc 52 §5) |

## 23. Dependency-audit additions (2026-08-09, live-verified; doc 54)
| Repo | ⭐ | Depth | What / steal |
|---|---|---|---|
| LadybugDB/ladybug | 1,557 | 🟦 | **LadybugDB — "DuckDB for graphs" (MIT, active — pushed 2026-08-09)** — embedded columnar graph DB, Cypher + built-in vector + FTS; Rust binding `lbug` 0.19.1 (260K dl) / Python `ladybug` / Node `@ladybugdb/core`; community successor to kuzudb (archived Oct 2025) → **C6 graph backend + Algorithms #6/#30** (doc 54 §1.1) |

## 24. Agent-browser ecosystem — agent-browser / obscura / steel-browser (2026-08-10, live-verified; doc 55)
> All three **cloned and key files source-read** (doc 55); ⬛ = code-level read, 🟦 = structure-level. Dedup-checked against sections 1–23 (no overlap; 3 genuinely new).
| Repo | ⭐ | Depth | What / steal |
|---|---|---|---|
| vercel-labs/agent-browser | 40,295 | ⬛ | **Browser automation CLI for AI agents (Rust, Apache-2.0, pushed 2026-08-08 — the exploding standard for coding agents: Claude Code/Cursor/Codex/Gemini CLI/Windsurf/Goose)** — Rust CLI + persistent daemon over CDP (no Node/Puppeteer): **snapshot/ref a11y engine** (`snapshot.rs` role taxonomy interactive/content/structural + zero-width filter + compact `@eN` refs, ~200–400 tokens/page), **`find` semantic locators** (role+name/label/placeholder), **`read` markdown negotiation + llms.txt/llms-full.txt ancestor walk** + no-browser HTTP path (`read.rs`), **`batch` JSON mode**, **MCP tool profiles** (core/network/state/debug/tabs/react/mobile/all + read-only/open-world annotations + paginated discovery — productionizes our ARCH/08 annotation model), **embedded axe-core a11y audit**, **React fiber-tree introspection** (tree/renders/suspense + Web Vitals), **WebRTC containment + worker fail-closed guards + content boundaries + max-output** (browser-level network policy), **SKILL.md skills system** (thin stub → `skills get core`, `name/description/allowed-tools` frontmatter + references/ — the emerging ecosystem skill format), `doctor/` diagnostics, Appium/iOS/Safari, `@agent-browser/eve` cloud-provider integration (doc 55 §1 → **S2–S12 steals: read/llms.txt, find, batch, a11y_audit, MCP profiles, WebRTC containment, SKILL.md format, doctor**; ARCH/08 §8.2, ARCH/06 §6.15) |
| h4ckf0r0day/obscura | 20,995 | ⬛ | **Headless browser engine from scratch in Rust (Apache-2.0, pushed 2026-08-09) — ⚠️ ARCH/08 §8.8 star count was stale ("10K+" → now 21K)** — 9-crate workspace: html5ever DOM + V8 JS + own layout/paint (taffy/tiny-skia/ab_glyph); **implements its own CDP *server*** (14 domains: target/page/runtime/dom/network/fetch/io/storage/input/accessibility/domsnapshot/emulation/pdf/browser + custom **LP domain `LP.getMarkdown`**) → drop-in headless-Chrome for Puppeteer/Playwright/our everyaios-cdp; **embedded MCP server** (stdio+HTTP, 32 tool defs, ref-based `interactive_refs` wiped on nav, **4000-char default text cap**); `obscura serve/scrape/mcp` + **`obscura-worker` parallel workers** (`--concurrency 25`, shared proxy); **security defaults to copy: SSRF guard (loopback/RFC1918 blocked, `--allow-private-network` opt-in), `file://` blocked by default, bounded queues + max-connections (anti-OOM), `panic=unwind`+catch_unwind op wrappers**; RFC-6265 `CookieJar` (host_only/SameSite normalization); `--stealth` fingerprint randomization + 3.5K tracker blocklist; **30MB RSS / 70MB binary / ~85ms page load** (doc 55 §2 → **Tier-1 engine confirmed; A1 adapt = spawn via ProcessSupervisor; S9 SSRF defaults + S10 4000-char cap → ARCH/06 §6.15 + ARCH/05**) |
| steel-dev/steel-browser | 7,458 | 🟦 | **steel.dev browser API service (TypeScript, Apache-2.0, pushed 2026-08-05) — ⚠️ the Rust `steel-dev/steel` repo ARCH/08 referenced is GONE (404); this Fastify + puppeteer-core service is the live project** — **full storage-context sessions** (cookies + localStorage + sessionStorage + **IndexedDB**, `persist` flag) with **Chrome leveldb encoding decode** (`0x00`=UTF-16-LE, `0x01`=ISO-8859-1 — `services/leveldb/`), **casting WebSocket** (live view + mouse/keyboard control, desktop/mobile dims), **recorder extension** (background.js+inject.js) + recording-events WS, **instrumentation taxonomy** (browser-interaction/network/worker/page-console/target-manager events, **DuckDB log store** `logs.duckdb`), **scrape utils** (readability/defuddle, jsonToMarkdown, pdfToHtml mupdf, stripBase64Images, safeGoTo), fingerprint-generator/injector, proxy-chain, Selenium path (doc 55 §3 → **S1 Session-Vault full-storage-context + S13 casting + S14 DuckDB store + A6 stripBase64/pdfToHtml**; ARCH/08 §8.9) |

## 25. Agentic dev-environments + workflow + closed-source agents (2026-08-10, live-verified; doc 56)
> warp/cowork-forge/cronflow **cloned + key files source-read** (doc 56); copilot-cli is closed (binary wrapper — 🟪 reference). Dedup-checked against sections 1–24 (no overlap; 4 genuinely new).
| Repo | ⭐ | Depth | What / steal |
|---|---|---|---|
| warpdotdev/warp | 64,107 | ⬛ | **Agentic development environment (Rust, AGPL-3.0 + MIT warpui — open-sourced 2026, OpenAI founding sponsor, Oz agent platform)** — 60+ crates; `ai` crate = production **incremental codebase-embedding index** (`full_source_code_embedding/`: tree-sitter **semantic chunker** MAX_TRAVERSAL_DEPTH=200 + coalesce_fragments, **merkle-tree content-hash incremental sync**, search shaping w/ char-boundary-safe reads, `file_outline` native) — the **open Rust DeepWiki**; `input_classifier` (**ONNX intent classifier**, candle + ort backends), `lsp` (**rust/ts/pyright/clangd/go servers** — context-light diagnostics), `isolation_platform` (docker/namespace sandbox), `computer_use`, `managed_secrets`, `mcp` (**rmcp — same crate we chose**), `warp_multi_agent_api`, `agents/specs/*.md` spec-driven OSS workflows; ⚠️ **AGPL → pattern-only, never link** (doc 56 §1 → **W1–W8: I7 RepoMap ext, C5 embeddings, intent routing, LSP diagnostics, I3 sandbox, E9, vault, F6/F7**) |
| sopaco/cowork-forge | 83 | ⬛ | **Full-role AI dev team (Rust, MIT, v2.5.2 — pushed 2026-07-17; adk-rust framework; Tauri GUI)** — config-driven stage pipeline (`config_definition/`: StageDefinition/HookConfig/HookPoint/ArtifactConfig/StageRetryConfig/FlowDefinition/MemoryScope/**InheritanceMode**), stages idea→prd→design→plan→coding→check→delivery w/ per-stage artifact save tools + **Actor-Critic stage types + goto_stage escalation signals**; **ACP external-coding-agent adapter** (`acp/client.rs` — drives Codex/Claude Code/Gemini over ACP stdio/WebSocket, streaming); role-prompt instructions (PM/Architect/Engineer); `interaction/` InteractiveBackend UI-decoupling trait; `runtime_security` checker; iteration inheritance (`base_iteration_id`); agentskills.io SKILL.md skills (codegraph/repomix/rtk/terrain) (doc 56 §2 → **C1–C6: I-rows pipeline, F12/J17 ACP ref, surgical hierarchy, sandbox guardrails**) |
| dali-benothmen/cronflow | 125 | ⚪ | **Code-first workflow automation engine (Rust core + Bun + napi TS SDK)** — ⚠️ **no LICENSE file (NOASSERTION despite README Apache-2.0 badge) → pattern-only**; 52KB `workflow_state_machine.rs` w/ **HITL pause as first-class state** (transition table Running→Paused→Running/Cancelled), step orchestrator + dispatcher + job queue + webhook triggers + retry w/ backoff+jitter+clamp; stale (pushed 2025-11-03) (doc 56 §3 → **H22/B7 automation-builder reference: code-first DSL, HITL-with-timeout state, webhook triggers**) |
| github/copilot-cli | 11,073 | 🟪 | **GitHub Copilot CLI — CLOSED (custom license, no derivatives; repo = install scripts + private-release binaries)** — architecture reference: agentic loop + `/model` switching, Autopilot mode (multi-step autonomous plan), `/fleet` parallel subagents, **LSP diagnostics via `lsp-config.json`** (open pattern = Warp `lsp` crate), context memory + compaction, agentskills.io SKILL.md skills, built-in GitHub MCP; **Copilot CLI added to our F12 harness list** (doc 56 §4) |

---

## 26. ACP agent registry + BYO-agent subscription auth (2026-08-10, live-verified; doc 57)
> `agentclientprotocol/registry` — the official ACP agent registry: 346⭐, Apache-2.0, daily-active (hourly version cron); per-agent `<id>/agent.json` + optional `icon.svg` + aggregated CDN index `registry.json`; RFD `/rfds/acp-agent-registry`; dist types binary (6 targets) / npx / uvx; **38 agents incl. `claude-acp` (Claude Agent — authors Anthropic·Zed·JetBrains, Claude Agent SDK)**. **→ F8/F12 registry-fed discovery + auth-mode badge; ⚠️ subscription-auth boundary (doc 57 §3 → ARCH/06 §6.16): Claude via official ACP wrapper = allowed; token-harvest for other engines = blocked.** Dedup-checked against sections 1–25 (no overlap; 1 genuinely new).
| Repo | ⭐ | Depth | What / steal |
|---|---|---|---|
| agentclientprotocol/registry | 346 | 🟦 | **Official ACP agent registry (Apache-2.0, daily-active, live-verified 2026-08-10 — 38 agents on CDN)** — per-agent `agent.json` manifests (`id`/`name`/`version`/`description`/`distribution`; binary 6-target / npx / uvx) + `icon.svg` + aggregated CDN index `cdn.agentclientprotocol.com/registry/v1/latest/registry.json`; CI-validated schema; **headline entry `claude-acp` ("Claude Agent" v0.66.0 — authors Anthropic·Zed·JetBrains, npx `@agentclientprotocol/claude-agent-acp`, runs the Claude Agent SDK → Claude via ACP = first-party-supported)**; 38 agents (claude-acp, codex-acp, gemini, qwen-code, opencode, goose, cline, cursor, devin, github-copilot-cli, pi-acp, mistral-vibe, amp-acp, deepagents, …); clients Zed/JetBrains/VS Code/Neovim/Obsidian → **F8/F12 registry-fed harness discovery** (CDN + local cache + version pinning + curated allow-list) + **auth-mode badge** (subscription/API/local) (doc 57 §2–3) |

---

## 27. Batch-2 — OmniRoute / Forge-intel / Office / Skills / Agent-workspaces (2026-08-13, live-verified; doc 58)
> 44-repo user list → 21 uncovered after dedup against docs 01–57. All live-verified via GitHub API 2026-08-13 (⭐ + license + pushed_at). **Biggest find: OmniRoute (46,937⭐ MIT) — the provider-catalog + routing goldmine for A1/A2/A3/A4/A6/A7.** ⚠️ holaOS = "Modified Apache 2.0" (commercial gate for hosted/embedded use — source-available, not permissive); worldmonitor = AGPL-3.0 (GNU long-form header makes GitHub report NOASSERTION). ⚠️ Decentralised-AI/DeepSeek-TUI = 4⭐ stale fork → canonical is `Hmbown/CodeWhale` (40,724⭐).
| Repo | ⭐ | Depth | What / steal |
|---|---|---|---|
| diegosouzapw/OmniRoute | 46,937 | 🟩 | **Free MIT AI gateway — 339 providers (90+ free), 1200+ models, ~1.51B free tokens/mo** — one OpenAI-compatible endpoint; 19 routing strategies (priority/fill-first/weighted/p2c/cost-optimized/headroom/reset-aware/context-relay/**cache-optimized**/**lkgp**/fusion/pipeline…); **auto-combo 14-factor live scoring**; quota-aware auto-fallback; RTK+Caveman compression (15–95% token savings); MCP/A2A; prompt-injection guard + credential-masking; `X-OmniRoute-Decision` header; provider taxonomy (**v3.8.50: No-auth 10 / OAuth 25 / Web-cookie 34 / API-key ~228 / Local ~11** / Search / Audio / Upstream-proxy / Cloud-agent) — **steal the API-key+local+keyless catalog data + routing vocabulary for A1/A2/A3/A4/A6/A7/A9/P6.10; ⚠️ the OAuth+cookie classes = doc-57 reject list** (doc 58 §1 + doc 59) |
| Leonxlnx/taste-skill | 76,101 | 🟩 | **Anti-slop frontend skill (SKILL.md: layout/typography/motion/spacing)** — "turns taste into portable agent behavior" → **C9 taste profile extended to UI/design taste + H25/P11** (doc 58 §5) |
| koala73/worldmonitor | 81,424 | 🟩 | Real-time global-intelligence dashboard (news aggregation, geopolitical/infrastructure monitoring) — **AGPL-3.0 (learn-don't-copy)** → **ADAPT-idea only for G2/H17/P3 situational-awareness cockpit** (doc 58 §7) |
| huginn/huginn | 49,784 | 🟩 | Classic self-hosted agent/automation (Ruby, event→trigger→act, JSON HTTP) — the ancestor of B7/B8/F13; **REF pattern only** (doc 58 §7) |
| hugohe3/ppt-master | 46,294 | 🟩 | **AI → natively-editable PPTX** (real shapes/transitions/animations/charts/speaker-notes, not images) from PDF/DOCX/URL/MD — SKILL.md workflow → **STEAL the "reason-then-native-shapes" contract for D3/P4.3** (doc 58 §4) |
| DeusData/codebase-memory-mcp | 38,771 | 🟩 | **Code-intelligence MCP — indexes codebase into a persistent knowledge graph, millisecond indexing, structural queries** → **ADAPT as a future I7 third query path (symbol-reference KG), not a fork now** (doc 58 §2) |
| agentscope-ai/QwenPaw | 33,748 | 🟩 | Qwen Personal Agent Workstation (AgentScope team) — local/cloud, 10+ channels, "works for you grows with you" → **REF for F13 channel arch + personal-assistant growth loop** (doc 58 §6) |
| AlexsJones/llmfit | 31,380 | 🟩 | **Rust CLI/TUI — detects RAM/CPU/GPU and scores 106 local models (quality/speed/fit, Q4_K_M ≈ 0.5 bytes/param)** → **ADAPT hardware-fit scoring for A5/P1.9 local-model picker** (doc 58 §3) |
| op7418/guizang-ppt-skill | 23,921 | 🟩 | HTML single-file slide-deck skill (editorial/Swiss layouts, WebGL presenter) — **AGPL-3.0 → learn-don't-copy**; the HTML-deck alternative to native PPTX → **REF for D3/H25** (doc 58 §4) |
| AsyncFuncAI/deepwiki-open | 17,637 | 🟩 | Open-source DeepWiki — generate repo wiki docs + diagrams → **REF (I7 long tail + Forge docs skill; overlaps Warp W1 already source-read)** (doc 58 §3) |
| dream-num/univer | 14,097 | 🟩 | **Full-stack office SDK (spreadsheet/document/slides) + univer-mcp-start-kit + Git-style sheet diff/rollback** (Apache-2.0) → **ADAPT: evaluate as H5 office UI engine; D7 rollback validated** (doc 58 §4) |
| lsdefine/GenericAgent | 13,760 | 🟩 | **Self-evolving agent — ~3K lines core, 9 atomic tools + ~100-line loop, grows a skill tree per task** → **ADAPT the minimal-loop + skill-tree discipline for I2/B8** (doc 58 §3) |
| microsoft/agent-framework | 12,769 | 🟩 | **AutoGen + Semantic Kernel merged (MAF)** — .NET+Python, A2A+MCP → **REF: confirms B-section, we keep shortest-path (doc 53 §5)** (doc 58 §3) |
| holaboss-ai/holaOS | 6,093 | 🟩 | **"All-in-One AI agent workspace" — run Claude Code/Codex across tools/100+ integrations/MCP/browser/files** — ⚠️ **"Modified Apache 2.0" (commercial gate: hosted/embedded redistribution needs a paid license)** → **WATCH: closest public articulation of our thesis, competitor not steal-source — don't copy code/integration-list** (doc 58 §6) |
| QoderAI/better-harness | 1,825 | 🟩 | **Harness Engineering — agent reviews the coding agent's own loop (evidence → loop-level insights → fix task)** → **ADAPT the loop self-audit for I5/P7.1** (doc 58 §3) |
| pedr0v/crux | 2 | 🟩 | Code-intelligence for agents (symbol/def/references, pre-indexed context) — **2⭐ brand-new (08-12) → REF only** (doc 58 §2) |
| Hmbown/CodeWhale | 40,724 | 🟩 | **Community-driven agent harness (Rust, MIT, the DeepSeek-TUI project renamed)** — plan mode, file edit, shell, git, MCP, sub-agents → **F12 harness candidate via ACP** (doc 58 §6) |
| Decentralised-AI/DeepSeek-TUI | 4 | ⚪ | **⚠️ stale fork of CodeWhale — canonical = `Hmbown/CodeWhale` (40,724⭐)** (doc 58 §6) |
| unslothai/unsloth | 70,756 | ⚪ | LLM fine-tuning library — **IGNORE** (not desktop-app) |
| coollabsio/coolify | 60,491 | ⚪ | Self-hosted PaaS — **IGNORE** |
| PleasePrompto/google-ai-mode-mcp | 147 | ⚪ | Google-AI-mode MCP wrapper — **IGNORE (G1/G3 long-tail)** |

---

## 28. TencentDB Agent Memory (2026-08-13, live-verified; doc 60)
> Team-level memory hub for AI agents — **MIT** (GitHub reports NOASSERTION only because Tencent wraps MIT in a `Copyright (C) 2026 Tencent` header; terms are clean MIT). Live-verified 2026-08-13: 21,002⭐, created 2026-04-07, pushed 2026-08-11, v2.0.0.
| Repo | ⭐ | Depth | What / steal |
|---|---|---|---|
| TencentCloud/TencentDB-Agent-Memory | 21,002 | 🟩 | **Team memory hub — the 4-asset taxonomy (Chat Memory L0→L3 / Skill / LLM-Wiki / Code-Graph) + unified governance (ownership/version/status/visibility/ACL/usage-count/agent-binding) + BM25+vector+RRF retrieval with item/char/timeout caps + L0→L3 distillation ladder + cold-start import (code→graph, docs→wiki, sessions→memory)** — ⚠️ three-service Docker server (NOT copied; we're local-first) → **STEAL the taxonomy + governance + distillation + loadout for our "one memory model" invariant (C1/C2/C3/C7/C8/I2/I7 + F12/J17 + P12.1)** (doc 60) |

---

## 29. Desktop-Agent Land-Grab 2026 (2026-08-14, live-verified; doc 61)
> Market (易观: 17 CN desktop office agents, 60M monthly visits; WorkBuddy 20.97M / TRAE 12.79M / QwenWork Aug-3 merger) + harness/memory/model/protocol batch. **Biggest find: DeepSeek Harness (93,087⭐ MIT, "everything is a plugin" on Cordis) → validates I6 + J5 traceable-session-log.** ⚠️ 6 unverifiable flags (RavenClaws · ReflexionOS · Keelson · "Iroh desktop agent" · Distri · M1K3 — never cite; `n0-computer/iroh` is a p2p lib, not a desktop agent).
| Repo | ⭐ | License | Depth | What / steal |
|---|---|---|---|---|
| deepseek-ai/deepseek-harness | 93,087 | MIT | 🟩 | **Agent harness, "everything is a plugin" (Cordis kernel: models/tools/skills/sessions/sandboxes/storage/loops/scheduling/UI all plugins) + "every run is traceable" (append-only session log incl. context injection; Trajectory view; resume/fork/replay on one event stream) + 4 runtime modes** → **STEAL the plugin-slot taxonomy + traceable-event-stream UX → I6 + J5/P3** (doc 61 §1) |
| tinyhumansai/openhuman | 36,281 | GPL-3.0 | 🟩 | **Personal AI "brain + orchestrator + researcher": Memory Tree + Obsidian markdown vault (no vector-soup), 20-min auto-fetch, subconscious loop, TokenJuice compression, tinyagents/tinyflows checkpointed graphs, split brain, A2A-over-Signal, 17 IM channels + native email, Rust-enforced Privacy Mode** → **REF/STEAL-pattern (GPL → learn-don't-copy): markdown memory mirror + auto-fetch cadence → C8/C12 + H22/F13/B3/B4** (doc 61 §2) |
| a2aproject/A2A | 25,344 | Apache-2.0 | 🟩 | **Agent2Agent protocol (Linux Foundation, v1.0 GA Mar 2026, 150+ orgs): Agent Cards + Signed Agent Cards (crypto identity) + AP2 payments + MLS/quantum-safe** → **REF: A2A = remote-agent discovery/identity as J17's *secondary* interface (ACP stays local-harness primary); AP2 noted post-v1** (doc 61 §4) |
| openocta/openocta | 3,062 | Apache-2.0 | 🟩 | China's first open-source personal desktop agent — single Go binary + embedded Control UI + IM remote (WeChat/DingTalk/Feishu) + 4-level memory + L4 evolution + Skills/MCP/Knowledge Vault → **REF for F13 IM-bridge demand + C9 + single-binary install benchmark (Go → we stay Rust/Tauri)** (doc 61 §5) |
| raullenchai/Rapid-MLX | 3,461 | Apache-2.0 | 🟩 | **"4.2× faster than Ollama, 0.08s cached TTFT, 100% tool calling" on Apple Silicon** → **REF: A5 MLX backend for Mac** (doc 61 §3) |
| Onelevenvy/flock | 1,098 | Apache-2.0 | 🟩 | Rust desktop multi-agent harness + **visual workflow editor (node graph, sandboxed local agents)** → **ADAPT: H22 visual node-graph editor surface** (doc 61 §5) |
| pdavis68/RepoMapper | 195 | MIT | 🟩 | MCP server — tree-sitter + PageRank + binary-search repo map into token budget → **REF: confirms I7 RepoMap (aider origin, doc 46/51), MCP-surface only** (doc 61 §5) |
| rednakta/nilbox | 14 | GPL-3.0 | 🟩 | Desktop sandbox — dedicated Linux VM per project + **Zero Token Architecture (host proxies + injects keys; agent never sees the real key)** + agent firewall + one-click store → **REF (GPL): name the J8 "keys never reach the agent" principle + E9 VM-isolation ceiling** (doc 61 §5) |

> **Models (catalog, not ledger):** Meta **Muse Glimmer** (30B dense, Apache-2.0, **120K ctx**, single consumer GPU) + NVIDIA **Nemotron 3.5 Lightning** (30B MoE / 3B active, executor-tier, NVFP4) → A5 catalog additions + retire the 15–20K ctx warning for this class; **NeMo Switchyard** = NVIDIA routing (A7 ref, no distinct repo). **No on-device training** — Unsloth Desktop LoRA/QLoRA stays parked post-v1 (doc 58 unsloth verdict unchanged).

---

## 33. Capability-delta batch — Sites / heartbeat (2026-08-15, live-verified; doc 67 — 3 new repos)
| Repo | ⭐ | Depth | What / steal | Maps to |
|---|---|---|---|---|
| stackblitz-labs/bolt.diy | ~27K | ⬛ | **Official open-source Bolt.new (MIT, cloned + source-read)** — prompt→run→edit→deploy full-stack apps, self-hosted + BYOK LLM (19+ providers). `app/lib/runtime/action-runner.ts` = typed agent→runtime action stream (`BoltAction` parse: file/shell/start/complete) executing against WebContainer with per-action state + abort; `app/components/workbench/Preview.tsx` = live preview + device frames + port dropdown + screenshot; `Artifact.tsx` = inline action checklist + diff; `DeployButton` + `functions/[[path]].ts` deploy path; Electron wrapper on the same Remix codebase | **NEW H29** (local dashboard artifacts — the local-first Sites) |
| hatchet-dev/hatchet | ~5K | ⬛ | **Orchestration engine for background tasks/AI agents/durable workflows (MIT, cloned + source-read)** — Go engine + gRPC dispatch; **dispatcher heartbeat-lease model** (`internal/services/dispatcher/dispatcher.go:502-512` — per-worker heartbeat, missed heartbeat → task reassignment in `process_reassignments.go`); durable-execution v1 (`pkg/v1/` task/worker/workflow — steps replay/retry from persisted state); OTel telemetry; Rust-core friendly | **B7 extended** (heartbeat automations reawaken same conversation w/ context; resume from audit-event checkpoint) |
| hatchet-dev/durable-execution-the-hard-way | ~2K | 🟦 | **Guide: build a durable-execution engine from scratch (Go+Postgres+sqlc)** — 7+ lessons (task queue → concurrency limits → durable event log → non-determinism → durable tasks); the incremental blueprint to port the principles (lease/event-log/non-determinism guard) into our Rust scheduler | B7/B2 reference |

> **bolt.diy** = the open local-first shape of ChatGPT Work's Sites: artifact generation → WebContainer/local execution → live preview. We steal the **typed action-stream contract + localhost-preview pattern**, not WebContainer (our `everyaios-script` rquickjs + tiered engine is the right local primitive). **Hatchet** = the heartbeat-lease mechanism: we port the *principles* (heartbeat, lease expiry → reassignment, durable event log) into `everyaios-core`, not the Go+Postgres server. Both queued in TODO (H29 + B7 extension).

## 32. anomalyco org — models.dev / opentui / sst / openauth (2026-08-15, live-verified; doc 66 — 4 new repos)
| Repo | ⭐ | License | Verdict | Maps to |
|---|---|---|---|---|
| anomalyco/models.dev | 6,413 | MIT | **STEAL (direct data source)** | A6, A9, A2/A3, A7, J11 |
| anomalyco/opentui | 13,015 | MIT | REF | P11.5 |
| anomalyco/sst | 26,234 | MIT | SKIP | — |
| anomalyco/openauth | 7,339 | MIT | REF | A2/A4 |

> **models.dev** = open database of model capabilities/pricing/limits; **two-tier lab-vs-provider schema** (`models/<lab>/<model>.toml` = provider-agnostic facts; `providers/<provider>/.../<id>.toml` = override-only + `base_model` inheritance — exactly our model-family vs transport-provider adapter split); compiled `models.json` (432KB, 364 entries, 186 providers): `pricing{prompt,completion,web_search,input_cache_read,input_cache_write}`, `supported_parameters` (capability proxy: tools/structured_outputs/reasoning/response_format/tool_choice), `architecture` (modalities/tokenizer), `context_length`+`max_completion_tokens`; **30 per-provider sync modules** (`bun models:sync <provider>` → per-provider automation PRs + `bun validate` gate + missing-model issues) = our live-registry maintenance pattern; `@opencode-ai/models` SDK (MIT) → Rust equivalent = `everyaios-catalog`. opencode ⭐ refresh 194,005→197,724 (no new code steals — doc 38 stands).

---

## 30. Cost-optimization + event-driven orchestration + eval (2026-08-14, live-verified; doc 62 — 0 new repos)
> **No new GitHub repos this pass** — the finds are closed products, papers, and techniques. **Ara** (YC P26, `ara.so` — self-driving IDE, closed) + **Clairvoyance** (Stardock, Feb 2026, `clairvoyanceai.com` — "persistent staff" personas, closed) → **WATCH** (competitive + persona UX; no code). **Murakkab** (MIT+Microsoft, OSDI 2026, arXiv 2508.18298 — GPU 2.8×/energy 3.7×/cost 4.3×) + **LangChain × NeMo Switchyard** (`switchyard-agent-routing-benchmark` — 74% cheaper / 7% frontier / 145 tasks) → **REF/STEAL-pattern → A7**; **OpenCastor** (HN leaderboard; exact repo unpinned) → REF profile shape → J11; **MongoDB managed MCP** (vendor: 30k installs/wk; repo unpinned) → REF → F6; ⚠️ **PromptThin = 404, unverifiable — never cite**. Vendor-reported % (Writer 41/44, security 40–62, SWE-bench-Pro 23, plan-cache 50.31) = rationale only, verify-before-citing.

---

## 31. Batch-3 — agent infra / scraping / search / UI (2026-08-15, live-verified; doc 65 — 19 new repos)
| Repo | ⭐ | License | Verdict | Maps to |
|---|---|---|---|---|
| getagentseal/codeburn | — | — | **STEAL** | A9, J11, P6 |
| D4Vinci/Scrapling | — | — | **STEAL** | G8, E14, F11 |
| xerj-org/xerj | — | — | REF | I7, C5 |
| ComposioHQ/awesome-claude-skills | — | — | **STEAL** | I2 |
| santifer/career-ops | — | — | REF | EV1, A6/A7 |
| sickn33/agentic-awesome-skills | — | — | **STEAL** | I2, F8 |
| tirth8205/code-review-graph | — | — | **STEAL** | I7, C5 |
| oraios/serena | — | — | **STEAL** | I11 |
| cobusgreyling/loop-engineering | — | — | **STEAL** | P6, J11, B6 |
| metalbear-co/mirrord | — | — | REF | P7, P11 |
| asgeirtj/system_prompts_leaks | — | — | REF | prompts |
| f/prompts.chat | — | — | SKIP | — |
| langflow-ai/langflow | — | — | REF | P6, F-series |
| ChatGPTNextWeb/NextChat | — | — | SKIP | — |
| lobehub/lobehub | — | — | REF | P6, I2 |
| dair-ai/Prompt-Engineering-Guide | — | — | SKIP | — |
| tw93/Pake | — | — | REF | Tauri shell |
| thedotmack/claude-mem | — | — | **STEAL** | P5, C-series |
| Qdrant Edge | — | — | REF | P5.8 |

> 11 source-read (codeburn, Scrapling, xerj, awesome-claude-skills, career-ops, agentic-awesome-skills, code-review-graph, serena, loop-engineering, claude-mem, Pake) · rest web-level. 18 already-tracked from this list (Agent-Reach, browser-use, maxun, qdrant, SeekStorm, open-webui, n8n, AutoGPT, void, kilocode, openclaw, superpowers, hermes-agent, ruflo, superset, Reasonix, ui-ux-pro-max-skill, + Agent-Reach/docs duplicate) → verdict unchanged. All steals **extend existing rows** (A9/J11/G8/E14/I2/F8/I7/I11/P6/P5) — no scope expansion.

---

## Summary
- **281 repos** tracked (227 through section 26 + **19 new in section 27** + **1 new in section 28** + **8 new in section 29** + **19 new in section 31** + **4 new in section 32** + **3 new in section 33**) · **280 live** · **1 transferred** (`LearningCircuit/ai-data-science-team` → `business-science/ai-data-science-team`, 5,369⭐)
- Depth: **⬛ = source code read (key files), 🟪 = README/architecture verified, 🟩 = feature map, ⚪ = one-line**
- **~44 repos source-read** (actual code files: mem0 main.py, graphiti graphiti.py, Agent Zero skills.py/security.py/context.py, DeerFlow agent.py/task_tool.py, NOOA forgetting.py/manager.py, cc-switch provider.rs/speedtest.rs, opencode task.ts/compaction.ts, agent-browser snapshot.rs/read.rs, obscura server.rs/lp.rs, warp chunker/merkle_tree, cowork-forge stage_executor.rs/acp/client.rs, etc.) · **~160 🟪 README-verified** (incl. sections 20–25 additions) · **19 🟩 map** · **3 ⚪ one-line**
- **New repos (doc 40):** agent-zero (19K), andrewyng/openworker (13K), lencx/chatgpt (54K), OpenCoworkAI/open-cowork (2K), open-webui/desktop (2.5K), open-webui/computer (401) — macOS/Windows deployment notes documented
- **New repos (docs 44–45):** agentclientprotocol/agent-client-protocol (3,889 — ACP spec), openclaw/acpx (3,107), RAIT-09/obsidian-agent-client (2,336) → ledger freeze at **159** (158 live + 1 transferred in this ledger); zed-industries/zed + microsoft/vscode added as extension-ABI reference implementations; docs 46–48 add 11 more (all live) → **170 total (169 live + 1 transferred)**
- **New repos (docs 49–50):** 22 more (doc 49: eDirStat, UltraSearch, WinDirStat, fclones, ncdu, gdu, dust, dua-cli, filelight, baobab, QDirStat — doc 50: AG-UI, Piper, espeak-ng, sherpa-onnx, Coqui, openWakeWord, Porcupine, Vosk, whisper.cpp, imapflow, openonion/email-agent) → **added as sections 20–21** (live-verified 2026-08-09; ⭐ in table; ncdu has no GitHub mirror, listed as `dev.yorhel.nl/ncdu`; ⚠️ rhasspy/piper archived, coqui-ai/TTS company-wound-down, Porcupine proprietary) → **192 total**
- **New repos (doc 52):** 26 more → **added as section 22** (live-verified 2026-08-09; ⭐ in table; smallest are 1⭐ references — Argus, farfalle; **8 proposed repos unverifiable/never added**: cyber-memory, AIO-Sandbox-AI, Special Agents, Agent Market, Nous APM, TraceVerse, devai pod, Lybic) → **218 total**
- **New repos (doc 54):** LadybugDB (1,557⭐, MIT, active — pushed 2026-08-09; Rust binding `lbug` 0.19.1) → **added as section 23** (doc 54 §1.1) → **219 total**; kuzu row flagged ⚠️ archived
- **New repos (doc 55):** agent-browser (40,295⭐, Rust CLI+daemon — the coding-agent browser standard), obscura (20,995⭐ — ⚠️ ARCH/08 star count "10K+" corrected), steel-browser (7,458⭐, TS — Rust `steel` repo 404, live project is the Fastify API service) → **added as section 24** (cloned + source-read, live-verified 2026-08-10) → **222 total**
- **New repos (doc 56):** warp (64,107⭐, AGPL — open-sourced agentic dev environment; the major find), cowork-forge (83⭐, MIT — multi-role AI dev team), cronflow (125⭐, ⚠️ no LICENSE file — pattern-only workflow engine), github/copilot-cli (11,073⭐, closed — binary wrapper; F12 harness) → **added as section 25** (live-verified 2026-08-10) → **226 total**; ⭐ refresh: cc-switch 126,015 · rtk 75,397 · open-interpreter 67,927 · tauri 110,062
- **New repos (doc 57):** agentclientprotocol/registry (346⭐, Apache-2.0 — the official ACP agent registry, 38-agent CDN catalog incl. `claude-acp` co-authored by Anthropic·Zed·JetBrains, live-verified 2026-08-10) → **added as section 26** → **227 total**
- **New repos (doc 58):** 18 more (OmniRoute 46.9K · taste-skill 76.1K · worldmonitor 81.4K AGPL · huginn 49.8K · ppt-master 46.3K · codebase-memory-mcp 38.8K · QwenPaw 33.7K · llmfit 31.4K · guizang-ppt-skill 23.9K AGPL · deepwiki-open 17.6K · univer 14.1K · GenericAgent 13.8K · MAF 12.8K · holaOS 6.1K ⚠️-modified-Apache · better-harness 1.8K · crux 2 · DeepSeek-TUI 4 (stale fork) · unsloth 70.8K · coolify 60.5K · google-ai-mode-mcp 147) → **added as section 27** (live-verified 2026-08-13) → **246 total** (incl. **Hmbown/CodeWhale 40.7K** — the DeepSeek-TUI project renamed); ⚠️ holaOS = modified Apache-2.0 (commercial gate), worldmonitor = AGPL-3.0 (GitHub mislabels NOASSERTION)
- **New repo (doc 60):** TencentCloud/TencentDB-Agent-Memory (21,002⭐, **MIT** — GitHub reports NOASSERTION only because of the Tencent copyright header; terms are MIT) → **added as section 28** (live-verified 2026-08-13) → **247 total**; **steal the 4-asset taxonomy + L0→L3 distillation + unified governance + agent-loadout for our "one memory model" (C1/C2/C3/C7/C8/I2/I7 + F12/J17 + P12.1)**
- **New repos (doc 61):** 8 more (deepseek-harness 93,087⭐ MIT · openhuman 36,281⭐ GPL-3.0 · A2A 25,344⭐ Apache-2.0 · Rapid-MLX 3,461⭐ Apache-2.0 · openocta 3,062⭐ Apache-2.0 · flock 1,098⭐ Apache-2.0 · RepoMapper 195⭐ MIT · nilbox 14⭐ GPL-3.0) → **added as section 29** (live-verified 2026-08-14) → **255 total**; **deepseek-harness ("everything is a plugin" + traceable event stream) validates I6+J5/P3; openhuman (markdown memory mirror) validates C8/C12; A2A = J17 secondary interface; ⚠️ 6 unverifiable flags (RavenClaws/ReflexionOS/Keelson/Iroh-desktop/Distri/M1K3 — never cite)**; models Muse Glimmer + Nemotron 3.5 Lightning + Rapid-MLX → A5 catalog
- **New repos (doc 65):** 19 more (codeburn, Scrapling, xerj, awesome-claude-skills, career-ops, agentic-awesome-skills, code-review-graph, serena, loop-engineering, mirrord, system_prompts_leaks, prompts.chat, langflow, NextChat, lobehub, Prompt-Engineering-Guide, Pake, claude-mem, Qdrant Edge) → **added as section 31** (live-verified 2026-08-15) → **274 total**; 8 steals all extend existing rows (codeburn→A9/J11 usage-parser registry + efficiency metrics, Scrapling→G8/E14 auto-selector + fingerprints, claude-mem→P5 saved-vs-discovered, serena→I11 symbol-editing, code-review-graph→I7 persistent graph, loop-engineering→P6 pattern registry, awesome-claude-skills→I2 SKILL.md anatomy, agentic-awesome-skills→F8 skills_index.json, xerj/career-ops/lobehub/langflow/Pake/mirrord→REF); 18 from this list already tracked — verdict unchanged
- **New repos (doc 66):** 4 more (models.dev 6,413⭐ MIT — open model catalog w/ pricing + two-tier lab/provider schema; opentui 13,015⭐ MIT — Zig-native TUI core; sst 26,234⭐ MIT — cloud infra SKIP; openauth 7,339⭐ MIT — auth REF) → **added as section 32** (models.dev/opentui cloned + source-read, live-verified 2026-08-15) → **278 total**; **models.dev = direct MIT steal → A6 catalog (186 prov / 364 models incl. cache pricing) + A9 cost engine + A7 routing filters + A2/A3 env; opencode ⭐ refresh 194K→197.7K**
- **New repos (doc 67):** 3 more (stackblitz-labs/bolt.diy ~27K⭐ MIT — official open-source Bolt.new, typed agent→runtime action stream + WebContainer/local preview = the local-first Sites → NEW H29; hatchet-dev/hatchet ~5K⭐ MIT — heartbeat-lease durable execution → B7 extension; hatchet-dev/durable-execution-the-hard-way ~2K⭐ — from-scratch durable-execution blueprint → B7/B2 reference) → **added as section 33** (all 3 cloned + source-read, live-verified 2026-08-15) → **281 total**; **UI/UX finalization: ARCH/12 9-tab strip → 48px activity rail + views contract (matrix H20 redefined); proactivity/inline-edit/kanban deltas = already covered (wiring + UI nuances)**
- **New repos (doc 68):** **0 new** (final all-rounder market research, 2026-08-15 — web-verified against primary sources, no new GitHub repos) → ledger unchanged **281 total**; **Microsoft Copilot Cowork (Mar 2026) + Google Gemini Notebook (NotebookLM, Gemini 3) + Gemini-in-Workspace added as competitors; H30 voice-memo→report + H31 corpus-research surface + H32 agent picker/agent-scoped model surface + two-channel capability injection (F12/J17/F7) + mobile-companion note (H18)**
- **Biggest live repos:** openclaw 385K, superpowers 268K, ECC 238K, hermes 226K, anomalyco/opencode 194K, n8n 199.5K, AutoGPT 186K, markitdown 172K, anthropics/skills 167K, firecrawl 162K
