# 14 — Repo Implementation Ledger, Part 1: Agents, Coding, Orchestration, Cyber

> Compiled 2026-08-06. Every repo mentioned in docs 01–13 was accessed (repo + README + docs + key source files).
> This is the **implementation ledger**: how each project actually implements its features — real logic, real code paths — plus URLs for future checks.
> **Part 2 (desktop apps, scraping, deep research, business tools, connectors) → `15-repo-implementation-ledger-2-apps-tools-connectors.md`.**
> ⚠️ Star counts are live as of 2026-08-05/06 where verified; a few repos 404'd or were rate-limited this pass and are flagged.

---

## A. Reference architectures (deep code reads)

### A1. AnythingLLM — `Mintplex-Labs/anything-llm` (64K⭐, JS/TS, MIT)
- **Repo:** https://github.com/Mintplex-Labs/anything-llm
- **Docs:** https://docs.anythingllm.com/ (also docs.useanything.com)
- **Submodules (`.gitmodules`):** `browser-extension` → `Mintplex-Labs/anythingllm-extension`, `embed` → `Mintplex-Labs/anythingllm-embed`
- **How it's implemented (code-level):**
  - **Two-process architecture:** `collector/` (document parsing microservice) + `server/` (main API/DB) + `frontend/`.
  - **Collector pipeline (`collector/processSingleFile/index.js`):** mime/extension detection → dispatches to `convert/` handlers: `asPDF` (pdf-parse/PDFLoader), `asDocx` (mammoth), `asEPub` (epub2), `asImage` (tesseract.js OCR), `asXlsx` (node-xlsx), `asMbox`, `asAudio` (Whisper transcription), `asOfficeMime`, `asTxt`. Exposes `POST /process` (full vectorize) + `POST /parse` (`parseOnly: true`).
  - **TextSplitter (`server/utils/TextSplitter/index.js`):** class with defaults `chunkSize=1000`, `chunkOverlap=20`; `determineMaxChunkSize(preferred, embedderLimit)` clamps to model limit; delegates to `@langchain/textsplitters` (recursive char / token splitting).
  - **Embedders:** OpenAI, LocalAI, Ollama, Transformers.js (`@xenova/transformers`) — default local `all-MiniLM-L6-v2` (~25MB, CPU).
  - **Vector DBs:** LanceDB (default, embedded), Chroma, Pinecone, Qdrant, Milvus, Weaviate, AstraDB, PGVector.
  - **Agents:** `server/utils/agents/` — AIbitat-based agent runtime, tool-calling loop, MCP integration (`@modelcontextprotocol/sdk`), 16 skill plugins.
  - **Jobs (`server/utils/jobs/`):** `@mintplex-labs/bree` + `@breejs/later` cron; each run archives thoughts/tool-calls/files/response into a Scheduled-Jobs Workspace.
  - **Model Router:** top-to-bottom rules — *calculated* (keyword/token/time/image, 0 LLM calls) vs *LLM-classified* (plain-English fallback model). `server/utils/helpers/updateENV.js` holds `KEY_MAPPING` for `LLM_PROVIDER`, `MODEL_ROUTER_ID`, etc.
  - **Server deps:** Prisma, express, `@langchain/*`, `@qdrant/js-client-rest`, `@lancedb/lancedb`, `@pinecone-database/pinecone`, `pg/mysql2/mssql`, `jsonwebtoken`, `swagger-ui-express`.
- **Check later:** `server/utils/agents/`, `server/utils/jobs/`, `collector/processSingleFile/convert/`.

### A2. Hermes Agent (Nous) — `nousresearch/hermes-agent` (225.9K⭐, Python, MIT)
- **Repo:** https://github.com/nousresearch/hermes-agent
- **Docs:** https://hermes-agent.nousresearch.com/docs/ (hermes-agent.org)
- **Root structure:** `agent/`, `apps/`, `acp_adapter/`, `assets/`, `.plans/` (gateway/tools/skills/plugins/cron/memory/sandbox live nested inside `agent/`).
- **How it's implemented (from docs + code reads):**
  - **Loop (source-verified 2026-08-06, doc 24 §1.2 — `run_agent.py` no longer exists, refactored):** `conversation_loop.py` + `turn_context.py`/`turn_finalizer.py`/`turn_retry_state.py`/`iteration_budget.py`/`subagent_lifecycle.py` orchestrate `AIAgent`; `prompt_builder.py` assembles stateless system prompts (identity, platform hints, skills index, context files — scans `AGENTS.md`/`.cursorrules`/`SOUL.md` for prompt-injection patterns). `_interruptible_api_call` = cancellable background HTTP. Tools run sequential/concurrent via `ThreadPoolExecutor`. **Iteration budget 500 turns; subagents capped 50.**
  - **Memory:** local `MEMORY.md`/`USER.md` + 8 external plugins — Honcho (user modeling), OpenViking (ByteDance context DB, `viking://` URIs, L0–L2 tiered loading), Mem0, Hindsight (knowledge graph), Holographic (SQLite FTS5, HRR queries + trust scoring), RetainDB, ByteRover, Supermemory.
  - **Skills:** `SKILL.md` files in `~/.hermes/skills/` via `skill_manage` tool (create/patch/edit/delete/write_file/remove_file); `/learn <url>` slash command bootstraps a skill; `skills.write_approval: true` gates writes.
  - **Gateway:** Telegram/Discord/Slack/WhatsApp/Signal/Email; media via `[[as_document]]` and `[[audio_as_voice]]` markers; runtime ID→peer mapping.
  - **Delegation:** `delegate_task` tool spawns isolated subagents with independent iteration budgets + scoped permission inheritance.
  - **Search:** pluggable backends — Firecrawl, Tavily, Exa, DuckDuckGo keyless.
  - **Sandboxes:** local env, Docker, remote terminal backends; `terminal.env_passthrough`.
- **Check later:** `agent/` subdirs (gateway/, tools/, skills/, plugins/, cron/, memory/, sandbox/).

---

## B. Coding agents

### B1. opencode → Crush — `opencode-ai/opencode` → `anomalyco/opencode` (new home) + `charmbracelet/crush`
- **Repo (archived org):** https://github.com/opencode-ai/opencode | **Current home:** https://github.com/anomalyco/opencode (site opencode.ai, npm `opencode-ai` — verified 2026-08-06, doc 23 §A1) | **Fork-offshoot:** https://github.com/charmbracelet/crush
- **OpenCode stack (go.mod):** Go 1.24, bubbletea TUI, glamour, lipgloss, `ncruces/go-sqlite3` + goose migrations, `mark3labs/mcp-go`, `anthropic-sdk-go`, `openai-go`, html-to-markdown, goquery, chroma, go-diff/udiff, doublestar, fsnotify.
- **Features:** LSP integration, multi-provider, session mgmt, Vim-like editor, file-change tracking, custom commands.
- **Crush:** multi-model, mid-session LLM swap preserving context, MCP over http/stdio/sse, cross-platform (incl. Android/BSD).
- **✅ Owner update (doc 24 §2.1):** opencode's active home is the `anomalyco` org (`anomalyco/opencode`, full README + package.json verified 2026-08-06) — **rewritten Go → Bun/TypeScript monorepo** with a new `packages/desktop`; `opencode-ai/opencode` (Go) is the archived org; original author's continuation is Crush at Charm.
- **Check later:** go.mod; Crush README.

### B2. pi — `earendil-works/pi` (84K⭐, TypeScript)
- **Repo:** https://github.com/earendil-works/pi
- **Monorepo packages:** `pi-ai` (unified multi-provider API, auth resolution, token/cost tracking), `pi-agent-core` (stateful agent + event streaming, SQLite sessions), `pi-coding-agent` (CLI: interactive/JSON/RPC/SDK — four modes), `pi-tui`.
- **Agent loop (`packages/agent/src/agent-loop.ts`):** `agentLoop()` / `agentLoopContinue()` (rejects if last message is assistant role); filters `message.content.filter(c => c.type === "toolCall")` → batch execution → pushes `toolResult` into context; 🔥 `stopReason === "length"` guard **fails all tool calls** instead of executing truncated args (`failToolCallsFromTruncatedMessage`); `prepareNextTurn` hook = mid-session model swap (`nextTurnSnapshot.model`), steering messages, context rewrite; `EventStream<AgentEvent, AgentMessage[]>`; `EMPTY_USAGE` + `Model` type tracks `cacheRead/cacheWrite/cost`.
- **Stance:** minimal core, **no built-in subagents/plan-mode/permission system**; containerization opt-in (Gondolin micro-VM, Docker, OpenShell). Supply-chain hardening: pinned deps, `save-exact=true`, `min-release-age=2`.
- **Check later:** `packages/agent/src/agent-loop.ts`, `packages/ai/src/`.

### B3. Claude Code — `anthropics/claude-code` (140K⭐, Python repo = installer/plugins)
- **Repo:** https://github.com/anthropics/claude-code
- **Reality:** repo = installer + plugins; **engine is proprietary compiled binary**. npm deprecated in favor of install scripts.
- **Plugin spec (the steal):** `.claude-plugin/plugin.json` + `commands/` + `agents/` (subagents) + `skills/` + `hooks/` (PreToolUse/PostToolUse) + `.mcp.json`. Official plugins: `code-review` (5 parallel agents w/ confidence scoring), `feature-dev` (7-phase), `pr-review-toolkit`, `security-guidance` (PreToolUse hook monitoring 9 security patterns: command injection, XSS, eval, pickle, os.system).
- **Permission modes:** `plan` / `acceptEdits` / `bypassPermissions` → maps to our Trust Ladder.
- **Check later:** `plugins/` dir structure.

### B4. DeepSeek-Reasonix — `esengine/DeepSeek-Reasonix` (31.4K⭐, Go on `main-v2`)
- **Repo:** https://github.com/esengine/DeepSeek-Reasonix (active branch `main-v2`)
- **Cache-first design:** tuned to DeepSeek's byte-stable prefix cache; case study 435M input tokens/day, 99.82% cache hit (~$12 vs ~$61).
- **TOML knobs (`reasonix.example.toml`):** `soft_compact_ratio=0.5` (notice-only, keeps cache prefix), `tool_result_snip_ratio=0.6` (snip stale tool output first), `compact_ratio=0.8`, `compact_force_ratio=0.9`, `temperature=0.0`, `recovery_model`, `system_prompt_file`, `output_style`.
- **Architecture (SPEC.md §2):** `cli → {agent, plugin, config} → {tool, provider}`, acyclic dependency direction; built-ins self-register via blank imports + `init()` (`cmd/reasonix/main.go`); crash-capture wrapper on every panic.
- **Multi-model tiering:** `planner_model`, `subagent_model`, `subagent_models = { review=..., security_review=... }`, `max_subagent_depth=2`, `max_subagent_concurrency=6`, `max_parallel_writers=3`.
- **Extensions:** built-in tools (read/write/edit/move/bash/ls/glob/grep) + external stdio JSON-RPC (MCP-compatible); **Permissions** = per-call `Policy allow/ask/deny → Decision`; **Remote-SSH** module (port-forward, SFTP, detached `serve`); single binary `CGO_ENABLED=0`.
- **Check later:** SPEC.md, `reasonix.example.toml`, `internal/permission/`, `internal/remote/`.

---

## C. Orchestration frameworks

### C1. OpenClaw — `openclaw/openclaw` (~385K⭐, TypeScript — search-verified 2026-08-06)
- **Repo:** https://github.com/openclaw/openclaw
- **What:** Personal AI assistant running across devices and chats (AGENTS.md/SOUL.md spec-orchestration — see doc 03).
- **Check later:** README + `core/` packages (the AGENTS.md/SOUL.md parser).

### C2. Agent Zero (the real one) — `agent0ai/agent-zero` (Python)
- **Repo:** https://github.com/agent0ai/agent-zero | **Docs:** https://www.agent-zero.ai/
- **How implemented:** central agent loop (Agent execution class); full Dockerized Linux desktop (XFCE) with GUI apps + terminals; **browser with DOM annotation** (click/inspect/change/lift/review); skills = `SKILL.md` files loaded on demand (context-efficiency); memory = FAISS vector search + conversation fragments; web search via **SearXNG**; Plugin Hub (100+ plugins); multi-agent subagent delegation; host bridge via A0 CLI (work on local repos).
- **⚠️ NOT `msitarzewski/AGENT-ZERO`** (261⭐ decoy) — see doc 04/11.
- **Check later:** `agent/` core loop files, `skills/`.

### C3. smolagents — `huggingface/smolagents` (Apache-2.0, Python)
- **Repo:** https://github.com/huggingface/smolagents | **Docs:** huggingface.co/docs/smolagents
- **Code-as-action (`src/smolagents/agents.py`):** `CodeAgent` prompts the LLM to write **executable Python code** instead of JSON tool calls; parsed and run via pluggable executors — `LocalPythonExecutor`, `DockerExecutor`, `E2BExecutor`, `ModalExecutor`; final answers via standard variable assignments.
- **Check later:** `src/smolagents/agents.py`, `src/smolagents/local_python_executor.py`.

### C4. Agno — `agno-agi/agno` (Python)
- **Repo:** https://github.com/agno-agi/agno | **Docs:** docs.agno.com
- **What:** Framework + runtime for agent platforms (SDK + AgentOS runtime + Web UI). Per-agent model/instructions/tools; memory + knowledge bases.
- **Check later:** `libs/agno/` (agents, tools, memory).

### C5. CrewAI — `crewAIInc/crewAI` (Python)
- **Repo:** https://github.com/crewAIInc/crewAI | **Docs:** docs.crewai.com
- **What:** Multi-agent orchestration: Crew → Agents → Tasks → Tools → Process (sequential/hierarchical); role/goal/backstory per agent; Flows for event-driven control.
- **Check later:** `src/crewai/` (agent.py, crew.py, task.py, process.py).

### C6. AutoGen — `microsoft/autogen` (Python)
- **Repo:** https://github.com/microsoft/autogen | **Docs:** microsoft.github.io/autogen
- **What:** Multi-agent conversation framework (v0.2 in maintenance mode; v1/AutoGen+ evolving). Agent conversation patterns, group chat, tool calling, code executors (Docker/local).
- **Check later:** `python/packages/autogen-agentchat/`.

### C7. MetaGPT — `FoundationAgents/MetaGPT` (Python, MIT)
- **Repo:** https://github.com/FoundationAgents/MetaGPT (former `geekan/MetaGPT`) | **Docs:** docs.deepwisdom.ai
- **What:** Assigns different roles (Product Manager, Architect, Engineer, QA) to GPTs forming a collaborative entity; SOP-driven; outputs PRD→design→code→tests.
- **Check later:** `metagpt/roles/`, `metagpt/actions/`.

### C8. OpenWork — (agentic OS, mentioned in early research; folded into doc 09)
- **Status:** Not independently re-verified this pass; see doc 09 for what was established.

---

## C9. Agentic OS & computer-use (doc 09)

### C9a. AIOS — `agiresearch/AIOS` (6.2K⭐, Python)
- **Repo:** https://github.com/agiresearch/AIOS | **Docs:** docs.agios.ai
- **What/how:** "AI Agent Operating System" — embeds LLMs into an OS layer; manages **agent scheduling, context-window management, memory, and tool interactions** as first-class kernel services.
- **Check later:** `aios/` (scheduler, memory, tool manager).

### C9b. Open Interpreter — `OpenInterpreter/open-interpreter` (~46K⭐, Python)
- **Repo:** https://github.com/OpenInterpreter/open-interpreter | **Docs:** docs.openinterpreter.com
- **What/how:** Coding agent that runs a **code interpreter in the terminal** — natural language → generated code executed locally (sandboxed); supports local + cloud models; optimized for low-cost models. Rust reimplementations exist for some harnesses (e.g. Kimi K3).
- **Check later:** `interpreter/` (core loop, code executors).

### C9c. Agent S — `simular-ai/Agent-S` (12.1K⭐, Python)
- **Repo:** https://github.com/simular-ai/Agent-S | **Docs:** (repo README)
- **What/how:** Computer-use agent ("Use Computer Like a Human") — GUI/OS navigation via screenshots + accessibility trees; **experience-augmented hierarchical agent** (high-level planner + low-level actions); GUI grounding model.
- **Check later:** `agent_s/` (agent, gui_grounding, screenshots).

### C9d. ECC — `affaan-m/ECC` (238K⭐, JavaScript)
- **Repo:** https://github.com/affaan-m/ECC
- **What/how:** "The agent harness operating system" — guardrails/control-center framework for agent harnesses (the 238K figure is the biggest on this list; treat critically — see doc 04/09 for context). Internationalized docs + website + GitHub App.
- **Check later:** README + `harness/` structure.

---

## D. Cyber / pentest agents

| Repo | URL | Stars/Lang | Implementation notes |
|---|---|---|---|
| **PentAGI** | https://github.com/vxcontrol/pentagi | **21.6K, Go** | Fully autonomous AI agents performing complete pentests; Kali-based. ⚠️ Earlier doc 03 used `lab42-global/PentAGI` (404 this pass) — **vxcontrol/pentagi is the live repo**. |
| **PentestGPT** | https://github.com/GreyDGL/PentestGPT | 14.7K, Python | LLM-guided pentest reasoning: task-level reasoning, test-generation, attack-tree; human-in-loop guidance. |
| **HexStrike** | https://github.com/0x4m4/hexstrike-ai | **10.8K, Python** | HexStrike AI MCP Agents — MCP server wrapping AI pentest capabilities. ⚠️ `wunderwuzzi23/hexstrike` 404'd this pass; `0x4m4/hexstrike-ai` is the live repo. |
| **PyRIT** | https://github.com/Azure/PyRIT | ~1.7K (search mis-parsed as 114 — see notes), Python | Python Risk Identification Tool for generative AI: orchestrators, scorers, attack strategies, converters for red-teaming LLMs. |
| **Vulnhuntr** | https://github.com/protectai/vulnhuntr | 2.7K, Python | Zero-shot vulnerability discovery using LLMs + static analysis; first autonomous AI 0day finder. |
| **Strix** | https://github.com/usestrix/strix | **49K, Python** | Open-source AI pentesting tool — autonomous AI hackers that find & fix app vulns. **Audit correction (2026-08-06):** this is the live repo; earlier `daboynb/strix` was wrong. Docs: docs.strix.ai |

---

## D2. Cyber-stragglers from doc 03's table (audit-verified 2026-08-06)

| Repo | URL | Stars/Lang | Implementation notes |
|---|---|---|---|
| **Deadend** | https://github.com/straylabs-ai/deadend-cli | 288, Python | Agentic pentest CLI (81% pass on KIMI K2.5 eval); supervisor/sub-agent design with confidence gating (doc 03 §6). |
| **NeuroSploit** | https://github.com/JoasASantos/NeuroSploit | 1.3K, Rust | AI-powered pentest framework in Rust (red/blue team role-based, doc 03 §7). |
| **Nebula** | ~1K | ✅ `berylliumsec/nebula` (doc 25 §6) — AI pentest desktop workbench (nebula-core); scope enforcement, approval pauses, OCI-isolated execution |
| **CAI (Cybersecurity AI)** | ~6.7K | ✅ `aliasrobotics/CAI` (doc 25 §6) — 300+ models via LiteLLM incl. local Ollama; multi-agent; PyPI `cai-framework` |
| **Microsoft @playwright/mcp** | https://github.com/microsoft/playwright-mcp | **35.8K, TS** | MCP server wrapping Playwright: navigate/click/type/snapshot over JSON-RPC (doc 06). The browser-tool MCP standard. |
| **n8n** | https://github.com/n8n-io/n8n | **199.5K, TS** | Fair-code workflow automation w/ native AI capabilities; no-code MCP surface (doc 10 §MCP). |

---

## E. Rapid-reference table (part 1)

| Repo | URL | Docs | Lang | Core implementation steal |
|---|---|---|---|---|
| AnythingLLM | github.com/Mintplex-Labs/anything-llm | docs.anythingllm.com | TS | collector microservice; TextSplitter; model router; bree jobs |
| Hermes | github.com/nousresearch/hermes-agent | hermes-agent.nousresearch.com/docs | Py | 8 memory plugins; SKILL.md; delegate_task; interruptible loop |
| opencode→Crush | github.com/charmbracelet/crush | (README) | Go | LSP integration; MCP http/stdio/sse |
| pi | github.com/earendil-works/pi | (README/docs) | TS | length-guard; prepareNextTurn model swap; 4 CLI modes |
| Claude Code | github.com/anthropics/claude-code | docs.anthropic.com | Py(repo) | plugin folder spec; permission modes |
| Reasonix | github.com/esengine/DeepSeek-Reasonix | (README/SPEC) | Go | cache-first compaction ratios; config-driven agents; per-call Policy |
| OpenClaw | github.com/openclaw/openclaw | (docs in repo) | TS | AGENTS.md/SOUL.md orchestration |
| Agent Zero | github.com/agent0ai/agent-zero | agent-zero.ai | Py | SKILL.md on-demand; FAISS memory; SearXNG; DOM-annotation browser |
| smolagents | github.com/huggingface/smolagents | hf.co/docs/smolagents | Py | code-as-action + pluggable executors |
| Agno | github.com/agno-agi/agno | docs.agno.com | Py | per-agent model/memory; AgentOS runtime |
| CrewAI | github.com/crewAIInc/crewAI | docs.crewai.com | Py | Crew/Agent/Task/Process; Flows |
| AutoGen | github.com/microsoft/autogen | microsoft.github.io/autogen | Py | group chat; code executors |
| MetaGPT | github.com/FoundationAgents/MetaGPT | docs.deepwisdom.ai | Py | SOP role pipeline PRD→code |
| PentAGI | github.com/vxcontrol/pentagi | (README) | Go | autonomous pentest loop on Kali |
| PentestGPT | github.com/GreyDGL/PentestGPT | (README) | Py | attack-tree reasoning, human-in-loop |
| HexStrike | github.com/0x4m4/hexstrike-ai | (README) | Py | MCP pentest agents |
| PyRIT | github.com/Azure/PyRIT | (README) | Py | red-team orchestrators + scorers |
| Vulnhuntr | github.com/protectai/vulnhuntr | (README) | Py | LLM static-analysis vuln discovery |
| ECC | github.com/affaan-m/ECC | (README) | JS | agent-harness guardrails/control center (238K⭐ — treat critically) |
| AIOS | github.com/agiresearch/AIOS | docs.agios.ai | Py | agent scheduling + context-window/memory/tools as kernel services |
| Open Interpreter | github.com/OpenInterpreter/open-interpreter | docs.openinterpreter.com | Py | terminal code interpreter, local exec |
| Agent S | github.com/simular-ai/Agent-S | (README) | Py | experience-augmented computer-use planner + GUI grounding |

## M. Ledger notes & corrections (part 1)

- **Strix corrected:** `usestrix/strix` (49K, Python) — found in audit pass; earlier unverified flag removed.
- **PentAGI corrected:** `vxcontrol/pentagi` (21.6K, Go). **HexStrike corrected:** `0x4m4/hexstrike-ai` (10.8K).
- **PyRIT:** ~1.7K (search mis-parsed as 114).
- **Nebula / CAI:** ✅ both confirmed (doc 25 §6): CAI = `aliasrobotics/CAI` (300+ models via LiteLLM), Nebula = `berylliumsec/nebula` (pentest workbench). NeuroSploit (`JoasASantos/NeuroSploit`, 1.3K, Rust) + Deadend (`straylabs-ai/deadend-cli`, 288, Python) confirmed (doc 18 §3).
- **Added in audit:** Deadend, NeuroSploit, `microsoft/playwright-mcp` (35.8K), `n8n-io/n8n` (199.5K).
- **ClawRouter identity:** confirmed **`BlockRunAI/ClawRouter`** (6.7K, TS, agent-native LLM router, 66 models) as the prominent repo — ledgered under that URL. `mksglu/context-mode` ✅ CONFIRMED as a real separate repo (npm `context-mode`, doc 25 §6) — an early fork/companion, no longer flagged.
- **Hermes source paths** — `run_agent.py` no longer exists (refactored); real files verified (doc 24 §1.2, doc 25 §3): `conversation_loop.py` (3,900-line `run_conversation`), `turn_context.py`, `iteration_budget.py` (500/50), `subagent_lifecycle.py`. No longer flagged.
- **DeerFlow** upstream removed (doc 11); **Fable/Sol** debunked (doc 04) — deliberately not ledgered.

> **Feature-level code breakdowns** (tier-1: AnythingLLM, Hermes, pi, Reasonix, OpenClaw, Agent Zero, smolagents, OpenFang) → `16-feature-implementation-tier1-agents.md`.
> Continue to **Part 2**: `15-repo-implementation-ledger-2-apps-tools-connectors.md`
