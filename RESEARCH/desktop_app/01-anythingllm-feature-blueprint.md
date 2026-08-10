# AnythingLLM Feature Blueprint — How Each Feature Was Built

> Source: docs.anythingllm.com (accessed 2026-08-05) + Mintplex-Labs/anything-llm GitHub repo (code-level read of `server/`, `collector/`, `frontend/`).
> Purpose: feature-by-feature map of AnythingLLM → concrete repo files, so we can steal the architecture for our desktop app.

---

## 0. Repo Map (top-level)

| Path | What it is |
|---|---|
| `server/` | Node.js/Express backend — all AI logic, agents, RAG, APIs |
| `collector/` | Standalone document-processing microservice (parses files → text) |
| `frontend/` | React SPA (Vite) — the UI |
| `open-computer/` | QEMU-based VM sandbox (git submodule) for agent computer-use |
| `browser-extension/` | Browser extension for capturing web content into a workspace |
| `embed/` | Embeddable chat widget |
| `docker/`, `cloud-deployments/` | Deployment |
| `locales/` | i18n |

**Backend structure (`server/`):**
- `endpoints/` — Express route handlers (the API surface)
- `utils/` — the real logic: `AiProviders/`, `agents/`, `agentFlows/`, `EmbeddingEngines/`, `vectorDbProviders/`, `vectorStore/`, `TextSplitter/`, `DocumentManager/`, `MCP/`, `memories/`, `BackgroundWorkers/`, `chats/`, `collectorApi/`, `EncryptionManager/`, `SpeechToText/`, `TextToSpeech/`, `EmbeddingRerankers/`
- `models/` — Prisma-backed data models
- `jobs/` — background workers (scheduled jobs, embedding worker, memory extraction)
- `middleware/`, `swagger/`, `storage/`, `prisma/`

---

## 1. AI Agents (`@agent`) — `server/utils/agents/`

**Docs:** `/features/ai-agents`, `/agent/overview`, `/agent/setup`, `/agent/usage/*`

### The engine: `aibitat/` (a custom agent runtime)
- `server/utils/agents/aibitat/index.js` — **AIbitat class**: manages multi-agent conversation as a "graph of agents". `EventEmitter`-driven, `agents: Map`, `channels: Map`, `functions: Map`. Tracks `maxRounds`, `_aborted` flag, `abortController`, `_pendingCitations` buffer, `_toolAttachments`.
- Agents are invoked via `@agent <prompt>` in a workspace; exit via `exit`.
- **Provider-agnostic**: `aibitat/providers/` has ~35 provider adapters (openai, anthropic, gemini, ollama, lmstudio, localai, openrouter, deepseek, groq, mistral, perplexity, xai, azure, bedrock, fireworks, together, sambanova, cohere, cerebras, novita, minimax, moonshot, nvidia-nim, litellm, koboldcpp, textgenwebui, foundry, dockerModelRunner, etc.) — **one unified interface, all BYOK/local**.
- `aibitat/providers/helpers/tooled.js` + `untooled.js` — the two execution paths: tool-calling models vs plain completion models.
- `aibitat/providers/ai-provider.js` — the `Provider` façade (system prompts, inference).

### The skill system (plugins)
`server/utils/agents/aibitat/plugins/index.js` exports the full skill list:
1. `web-browsing` — web search (14 engines, see §3)
2. `web-scraping` — full-page fetch via CollectorApi (Firecrawl-backed)
3. `websocket` — stream agent activity to the frontend in real time
4. `docSummarizer` (`summarize.js`) — summarize workspace documents
5. `chat-history` — manages history + clarifying-question surveys
6. `memory` (`rag-memory`) — RAG search + store to long-term memory (vector DB)
7. `rechart` — chart generation from data
8. `sql-agent` — query Postgres/MySQL/MSSQL via `SQLConnectors/`
9. `filesystem` — read/write/edit/search local files (availability-gated)
10. `create-files` — generate .docx/.pdf/.pptx/.xlsx files
11. `gmail` — email read/search/send via OAuth bridge
12. `outlook` — Outlook mail (drafts/search/send folders)
13. `google-calendar` — calendar CRUD
14. `request-user-input` — agent can ask the human a question mid-task
15. `create-scheduled-job` — agent builds cron jobs conversationally (single-user only)
16. `model-router-cooldown` — internal, router state
17. `router-classifier` — internal LLM classifier used by Model Router

### Skill enabling/config — `server/utils/agents/defaults.js`
- `DEFAULT_SKILLS = [memory, docSummarizer, webScraping]` — enabled by default.
- `SKILL_FILTER_CONFIG` — skills with availability checks (`filesystem`, `create-files`, `gmail`, `outlook`) — each has an `isToolAvailable()` gate + a `disabled_*_skills` settings key.
- `WORKSPACE_AGENT` = `@agent` with dynamic role/system prompt built from workspace+user+prompt.
- `USER_AGENT` = "human monitor" with `interrupt: ALWAYS` — human-in-the-loop.
- `imported.js` — load user's custom skill folders (drop-a-folder convention).
- Tool reranking: `aibitat/utils/toolReranker.js` — picks the best tool for the prompt (intelligent tool selection, per docs `/agent/intelligent-tool-selection`).

### MCP integration — `server/utils/MCP/`
- `MCPCompatibilityLayer extends MCPHypervisor` (singleton).
- `activeMCPServers()` boots all configured MCP servers, returns flows named `@@mcp_{name}`.
- `convertServerToolsToPlugins(name)` — lists tools, suppresses disabled ones, wraps **each MCP tool as an AIbitat plugin function** → MCP tools become agent skills automatically.
- Docs: `/mcp-compatibility/overview` (desktop vs docker).

### Custom agents (code skills) — `server/utils/agents/imported.js` + docs `/agent/custom/*`
- Plugin = `plugin.json` manifest + `handler.js` — dropped in a folder → imported as a skill.
- Schema: `imported-manifest.schema.json`.

---

## 2. Agent Flows (no-code) — `server/utils/agentFlows/`

**Docs:** `/agent-flows/overview`, `/agent-flows/getting-started`, `/agent-flows/blocks/*`

- `flowTypes.js` — **the block schema**: `START` (init variables), `API_CALL` (HTTP request w/ headers, body, responseVariable, directOutput), `LLM_INSTRUCTION` (process data with LLM), `WEB_SCRAPING` (fetch URL). Examples per block for few-shot LLM prompting.
- `executor.js` — executes a flow: each block resolves variables, runs the block, chains outputs. `skipHandleExecution` flag returns flow output directly to the user without extra LLM turn.
- `executors/` — per-block executors.
- Flows are used like skills: via `@agent` or auto-triggered; **LLM can chain multiple flows together** for a task.
- "Agent Flows vs Agent skills": flows = no-code visual builder; skills = code plugins. Same runtime, different authoring.

---

## 3. Web Search — `server/utils/agents/aibitat/plugins/web-browsing.js`

**Docs:** `/agent/usage/web-browsing`

- Single tool `web-browsing` (LLM-triggered tool-calling, not always-on).
- `search(query)` → reads `agent_search_provider` setting → **switch over 14 engines**:
  `serpapi`, `searchapi`, `serper-dot-dev`, `bing-search`, `baidu-search`, `serply-engine`, `searxng-engine`, `tavily-search`, `duckduckgo-engine`, `exa-search`, `perplexity-search`, `brave-search`, `crw-search` (fastCRW), `you-search` — **default = DuckDuckGo (keyless)**.
- `tiktoken` token counting for every result set (narration: "I found N results (~X tokens)").
- Citations: results pushed to `_pendingCitations` buffer, flushed to frontend with `chunkSource` links.

## 4. Web Scraping — `server/utils/agents/aibitat/plugins/web-scraping.js`

**Docs:** `/agent/usage/web-scraping`

- Fetches full page text via `CollectorApi` (`server/utils/collectorApi/`) — proxied to the `collector/` microservice (Firecrawl-backed extraction, self-hostable).
- Summarizes content when over token budget before handing to the LLM.

---

## 5. RAG Pipeline (embeddings + vector DB)

**Docs:** `/setup/embedder-configuration/*`, `/setup/vector-database-configuration/*`, `/agent/usage/rag-search`

### Document ingestion — `collector/` microservice
- `collector/index.js` — Express app, standalone process.
- `processSingleFile/` — per-file-type parser (`convert/` for docx→txt, pdf, etc.).
- `processLink/` — URL/YouTube transcript extraction.
- `processRawText/` — plain text ingestion.
- `extensions/` — plugin-ish hooks; `hotdir/` — watched folder ingestion.
- `convertAudioToWav/` — audio → transcript (Whisper).
- Server side: `server/utils/DocumentManager/` orchestrates: validate → collector → `TextSplitter` → embedding worker → vector store; `server/models/documents.js` + `vectors.js` track state.
- Job: `server/jobs/embedding-worker.js` + `EmbeddingWorkerManager.js` — async queue with progress events.

### Chunking — `server/utils/TextSplitter/index.js`
- Recursive character splitter (RAG chunking), tested in `__tests__/utils/TextSplitter`.

### Embedding engines — `server/utils/EmbeddingEngines/`
- 14 engines: `native` (built-in local), `openAi`, `azureOpenAi`, `gemini`, `cohere`, `mistral`, `voyageAi`, `ollama`, `lmstudio`, `localAi`, `liteLLM`, `openRouter`, `genericOpenAi`, `lemonade` — same abstraction as LLM providers.

### Reranking — `server/utils/EmbeddingRerankers/`
- `native/index.js` — local cross-encoder reranker; used by memory injection and RAG.

### Vector DBs — `server/utils/vectorDbProviders/`
- Providers: `chroma`, `lancedb`, `milvus`, `pinecone`, `qdrant`, `weaviate`, `astra`, `zilliz`, `pgvector`, `native` (in-app, no external service) — matches docs' local (chroma/lancedb/milvus) + cloud (pinecone/qdrant/weaviate/astradb/zilliz) options.
- `server/utils/vectorStore/` — the store abstraction (`resetAllVectorStores.js`).

---

## 6. Memory (the "grows with you" system)

**Docs:** (feature docs under Features)

### Agent skill memory — `plugins/memory.js`
- `rag-memory` tool: `search` | `store` actions into the vector DB, with a `Deduplicator` guard.

### System-level memory — `server/utils/memories/index.js`
- `getMemoriesForPrompt()` — injected into **every** system prompt at chat time:
  - Global memories (up to 5) + workspace memories (top 5).
  - **Reranks workspace memories** against current prompt + last 3 messages when > `MAX_INJECTED_WORKSPACE_LIMIT` (uses `NativeEmbeddingReranker`).
  - `Memory.updateLastUsed()` — recency tracking.
  - `formatMemories()` — rendered as a markdown section appended to the prompt.

### Automatic extraction — `server/jobs/extract-memories.js`
- Background job: groups unprocessed chats by (user, workspace) — needs ≥5 chats (`MIN_CHATS_TO_PROCESS`), idle threshold 20min.
- **Two-phase LLM extraction**: Phase 1 "Observer" extracts candidate facts; Phase 2 "Reflector" (from `jobs/helpers/memory-extraction-utils.js`) refines/validates → stores as durable memories.
- `server/models/memory.js` — the Memory model (`globalForUser`, `forUserWorkspace`, `updateLastUsed`).

---

## 7. Scheduled Jobs (automations) — `server/endpoints/scheduledJobs.js` + `server/jobs/run-scheduled-job.js`

**Docs:** `/scheduled-jobs/overview`, `getting-started`, `scheduling`, `viewing-runs`, `configuration`

- **Job** = name + prompt + schedule (cron) + allowed tools. **Run** = one execution with full trace (thoughts, tool calls, generated files, final response).
- Scheduling: `server/models/scheduledJob.js` uses **`@breejs/later`** (cron parsing in UTC) + `cron-validate`.
- Execution: `BackgroundService` (`server/utils/BackgroundWorkers`) singleton — spawns worker **child processes** (`jobs/run-scheduled-job.js`) via `process.on("message")` IPC; p-queue for queuing; states `queued → running → completed/failed/timed_out/killed`.
- Full run trace saved (`ScheduledJobRun` model); "Continue in Thread" — results land in an auto-created Scheduled Jobs workspace.
- **Push notifications** on completion (`sendWebPushNotification` + `server/endpoints/webPush.js`, `PushNotifications/`).
- Conversation creation: `create-scheduled-job` agent skill — agent builds the job card for user review.
- Single-user mode only (multi-user security boundary).

---

## 8. Model Router — `server/endpoints/modelRouter.js` + `server/utils/AiProviders/modelRouter/`

**Docs:** `/model-router/overview`, `/model-router/setup`

- **Primary provider** (fallback + rule evaluation) + **rules** evaluated top→bottom; first match wins.
- **Calculated rules** — fast, no LLM: keywords, token count, time of day, image attached.
- **LLM-classified rules** — plain-English description; `router-classifier.js` plugin spins a headless AIbitat whose only job is to call `select_category` once (with `skipHandleExecution` + TERMINATE). Priority-ordered category selection; "none" fallback.
- `model-router-cooldown` plugin — prevents bounce loops.
- `onInferenceComplete` telemetry in `AiProviders/modelRouter/` tests.

---

## 9. Chat / Conversation Engine — `server/utils/chats/`

- `index.js` — chat orchestration; `openaiCompatible.js` — unified streaming (SSE) for all providers; `openaiHelpers.js`.
- Attachments (`utils/helpers/attachments.js`), `convertTo.js` (image handling).
- Workspaces: `server/models/workspace.js`; threads: `workspaceThread.js`; `server/endpoints/workspaceThreads.js`.
- Suggested messages: `workspacesSuggestedMessages.js` model.
- Prompt history: `promptHistory.js`; slash command presets: `slashCommandsPresets.js`; system prompt variables: `systemPromptVariables.js` (template vars).

---

## 10. BackgroundWorkers — `server/utils/BackgroundWorkers/`
- Singleton service booted in `server/index.js`; used by scheduled jobs; runs `server/jobs/*` as child processes with IPC; telemetry (`server/models/telemetry.js`), event logs (`eventLogs.js`).

---

## 11. Frontend — `frontend/src/pages/`
- `Main/` — the app shell; `WorkspaceChat/` — chat UI (agent streaming via `websocket` plugin); `WorkspaceSettings/`; `GeneralSettings/`; `Admin/` (multi-user); `Login/`; `Invite/`; `OnboardingFlow/`; `404.jsx`.
- Contexts: `AuthContext`, `ThemeContext`, `PfpContext`, `EmbeddingProgressContext` (live embedding progress), `PWAContext`, `LogoContext`.
- `components/` + `hooks/` — UI kit; `models/` — API client; `utils/`.

---

## 12. Other notable features

- **Collector link processing** — `collector/processLink/` (URL → markdown, YouTube transcripts).
- **TTS/STT** — `server/utils/TextToSpeech/` (audio format tests), `SpeechToText/`; transcription models (Whisper local, OpenAI).
- **Encryption** — `server/utils/EncryptionManager/` (API key encryption at rest).
- **Browser extension** — `browser-extension/` + `server/endpoints/browserExtension.js` (capture current page into a workspace).
- **Embeddable chat widget** — `embed/` + `server/endpoints/embedManagement.js` + `models/embedConfig.js`, `embedChats.js`.
- **Mobile** — `server/endpoints/mobile/` (API for mobile clients).
- **Telegram bot** — `server/utils/telegramBot/` + `server/endpoints/telegram.js` + `server/jobs/handle-telegram-chat.js`.
- **Live document sync** — `server/endpoints/experimental/liveSync.js` + `models/documentSyncQueue.js` + `jobs/sync-watched-documents.js` (watched-folder → auto re-embed).
- **Computer use (beta)** — `open-computer/` (QEMU VM submodule); docs `/beta-preview/active-features/computer-use`.
- **Multi-user mode** — `workspaceUsers.js`, `user.js`, `invite.js`, `multiUserProtected` middleware, `passwordRecovery/`.
- **i18n** — `locales/` + `frontend/src/locales/`.
- **OpenAI-compatible API** — `server/endpoints/api/openai/index.js` (expose own chat as an OpenAI-compatible endpoint).

---

## 🎯 Steal-list for our desktop app

| AnythingLLM mechanism | File | What we steal |
|---|---|---|
| AIbitat agent runtime | `agents/aibitat/index.js` | EventEmitter agent graph — we already have `WorkflowEngine`, keep ours, borrow citations buffer + abort handling |
| Provider adapter pattern | `aibitat/providers/*` (~35 files) | One interface for all BYOK + local — matches our registry, verify we cover the same set |
| Plugin/skill model | `plugins/index.js` + `defaults.js` | `DEFAULT_SKILLS` + availability gates (`isToolAvailable()`) — **adopt the gate pattern for filesystem/connectors** |
| MCP-as-skills | `utils/MCP/index.js` | Wrap each MCP tool as a function automatically — **adopt directly** |
| Web search switch | `web-browsing.js` | 14-engine switch + tiktoken counting + citations — we have a better cascade; add **You.com keyless** + token narration |
| Memory injection | `memories/index.js` + `jobs/extract-memories.js` | Prompt-time rerank + Observer/Reflector extraction job — we already have memory v2; adopt 2-phase extraction + `updateLastUsed` |
| Scheduled jobs | `scheduledJobs.js` + `run-scheduled-job.js` | Job/Run models, cron via `@breejs/later`, worker child-process IPC, run traces — **direct blueprint for our automation pillar** |
| Model router | `modelRouter.js` + `router-classifier.js` | Calculated + LLM-classified rules, classifier-as-headless-agent — we planned this; copy the rule model |
| Collector microservice | `collector/` | Separate document-parsing process — replaces our inline parsing; supports watched folders |
| TextSplitter | `TextSplitter/index.js` | Recursive splitter reference |
| Embedding engines | `EmbeddingEngines/` + `EmbeddingRerankers/` | Same 14-engine abstraction + native reranker |
| Embedding progress UX | `EmbeddingProgressContext` | Live progress events — steal for our UI |

### What NOT to copy
- Prisma + full server/auth stack (we have our own).
- QEMU open-computer (heavy; revisit later).
- Their single-workspace SPA nav (we're building multi-pillar workspaces).
- Multi-user/admin/invite complexity for v1 (single-user desktop first).
