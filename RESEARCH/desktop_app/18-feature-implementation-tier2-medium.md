# 18 — Tier-2 Feature Implementation: Medium-depth maps (frameworks, desktop apps, cyber, business tools)

> Compiled 2026-08-06. Tier-2 = medium depth: per-repo **feature list → where/how implemented** (code paths where known) + URLs.
> Tier-1 deep dives → docs 16–17. All-repo ledger overviews → docs 14–15.

---

## 1. Orchestration frameworks (code paths)

### Agno — `agno-agi/agno` (Python)
- **Repo:** https://github.com/agno-agi/agno | **Docs:** docs.agno.com
- **Features → impl:** `libs/agno/` — `Agent` (model/instructions/tools/memory per agent, e.g. `Agent(name="Researcher", model=OpenAIChat(id="gpt-4o"))`), `Team` (multi-agent), `tools/` (30+), `memory/` (conversation + knowledge bases), `storage/` (session persistence), AgentOS runtime + Web UI.

### CrewAI — `crewAIInc/crewAI` (Python)
- **Repo:** https://github.com/crewAIInc/crewAI | **Docs:** docs.crewai.com
- **Features → impl:** `src/crewai/` — `Crew` (orchestrator), `Agent` (role/goal/backstory), `Task`, `Tool`, `Process` (sequential/hierarchical), `Flow` (event-driven, `@start`/`@listen` decorators), `LLM` config, `Knowledge` sources, memory (short/long/entity). YAML-driven via `agents.yaml`/`tasks.yaml`.

### AutoGen — `microsoft/autogen` (Python)
- **Repo:** https://github.com/microsoft/autogen | **Docs:** microsoft.github.io/autogen
- **Features → impl:** v0.2 (maintenance) — `ConversableAgent`, `GroupChatManager`, `AssistantAgent/UserProxyAgent`, code executors (Docker/local), tool calling; evolving v1 (`python/packages/autogen-agentchat/`) with `SingleThreadedAgentRuntime`, `HandoffMessage`, event-driven runtime.

### MetaGPT — `FoundationAgents/MetaGPT` (Python, MIT)
- **Repo:** https://github.com/FoundationAgents/MetaGPT | **Docs:** docs.deepwisdom.ai
- **Features → impl:** `metagpt/roles/` (ProductManager, Architect, Engineer, QA…), `metagpt/actions/` (WritePRD, WriteDesign, WriteCode…), `metagpt/team.py` (SOP-driven collaboration), `config2.yaml` global + per-agent overrides; outputs PRD→design→code→tests.

---

## 2. Desktop apps (feature maps)

| App | URL | Features → where implemented |
|---|---|---|
| **Cherry Studio** | https://github.com/CherryHQ/cherry-studio | Workspaces, multi-provider (Ollama/LM Studio/cloud), assistants w/ knowledge bases, `src/` (main/renderer), MCP support. |
| **Chatbox** | https://github.com/chatboxai/chatbox | BYOK desktop client (ChatGPT/Claude/others); **Electron 35 + React 18, GPL-3.0 (patterns only)**; provider Spotlight + models.dev registry. (Corrected 2026-09-04 doc 86 — was `Bin-Huang/chatbox`, Tauri.) |
| **GenOffice** | https://github.com/genspark-ai/genoffice | ⬛ **deep-dive → doc 28.** 5 apps (docs/sheets/slides/pdf) + 10 engine packages; **docx block-patch** (text-patch.ts minimal w:t prefix/suffix, byte-preserving), **Rust sidecar** `apps/sheets/native/xlsx-engine` (calamine 0.36 + ironcalc 0.7), **deterministic-planner** (regex NLP→DSL, zero-LLM common ops), agent skill loop, watchdog streaming. |
| **Open WebUI** | https://github.com/open-webui/open-webui | FastAPI+Svelte; **Pipes/Filters/Actions** (in-process Python functions), external Pipelines service; **RAG**: tiktoken/HF tokenizers + Markdown-Header splitting + `CHUNK_MIN_SIZE_TARGET` merge pass; vector backends ChromaDB/FAISS/Qdrant/Milvus/pgvector; auth SSO/OIDC/LDAP/SCIM + RBAC. |
| **Ollama** | https://github.com/ollama/ollama | Go daemon :11434; GGUF + quantizations; OpenAI-compatible API; `server/` + `llm/` runner dispatch per backend; SDKs. |
| **LM Studio** | https://github.com/lmstudio-ai/lms | CLI (`lms`), TS SDK (`lmstudio-js`), Python SDK, `mlx-engine` (Apple MLX); closed desktop app; OpenAI-compatible local server. |
| **Leon** | https://github.com/leon-ai/leon | `master` = legacy NLU (skills-as-modules); `develop` = 2.0 agentic core (Vercel AI SDK providers, better-sqlite3, socket.io, React/TanStack). |
| **PyGPT** | https://github.com/szczyglis-dev/py-gpt | Python desktop assistant: chat/agents/code exec/web search/image gen/audio; plugin + command system (system commands, file I/O, Python code, web APIs). |
| **Vane (ex-Perplexica)** | https://github.com/ItzCrazyKns/Vane | SearXNG search; `playwright`/`jsdom`/`@mozilla/readability` (page→text); `better-sqlite3` + `drizzle-orm` (store); `@huggingface/transformers` (embeddings); `js-tiktoken`; cited answers + widgets. |

---

## 3. Cyber agents (feature maps)

| Repo | URL | Features → impl |
|---|---|---|
| **PentAGI** | https://github.com/vxcontrol/pentagi | Coordinator + sub-agents (Searcher/Coder/Installer/Pentester); isolated Docker; pgvector semantic memory; autonomous pentest on Kali. Go. |
| **PentestGPT** | https://github.com/GreyDGL/PentestGPT | 3-module reasoning (Reasoning/Generation/Parsing); hierarchical task tree to avoid context collapse; human-in-loop (USENIX 2024). Python. |
| **HexStrike** | https://github.com/0x4m4/hexstrike-ai | MCP server bridging LLM clients to 150+ offensive tools (Nmap, sqlmap, Nuclei). Python. |
| **PyRIT** | https://github.com/Azure/PyRIT | Orchestrator/Scorer/AttackStrategy/Converter pipeline for LLM red-teaming. Python. |
| **Vulnhuntr** | https://github.com/protectai/vulnhuntr | LLM + static code analysis → remotely exploitable vuln discovery; zero-shot, first autonomous AI 0day. Python. |
| **Strix** | https://github.com/usestrix/strix | Autonomous AI pentest agents (find + fix app vulns); multi-agent runtime analysis, PoC exploits + CVSS. Python. Docs: docs.strix.ai. |
| **Deadend** | https://github.com/straylabs-ai/deadend-cli | Agentic pentest CLI (81% on KIMI K2.5 eval); supervisor/sub-agent with confidence gating. Python. |
| **NeuroSploit** | https://github.com/JoasASantos/NeuroSploit | AI pentest framework, role-based red/blue teams. Rust. |

---

## 4. Business tools (feature maps)

| Repo | URL | Features → impl |
|---|---|---|
| **AutoHedge** | https://github.com/The-Swarm-Corporation/AutoHedge | Director→Quant→Risk→Execution agent pipeline (separate reasoning from execution). Python. |
| **Vibe-Trading** | https://github.com/HKUDS/Vibe-Trading | Personal trading agent; data-loader error handling + financial guardrails (validate OHLC before any calc). Python. |
| **claude-ads** | https://github.com/AgriciDaniel/claude-ads | Claude-first paid-media ops skill (12 ad platforms); capability-gated state-mutation — read-only by default, structured diff + human approval before external write. Python. |
| **NotFair** | https://github.com/nowork-studio/NotFair | Goal↔metric binding contract (agent can't judge its own success; metrics verified mechanically at source); loop-powered marketing agents. TS. |
| **FinceptTerminal** | https://github.com/Fincept-Corporation/FinceptTerminal | 100+ heterogeneous data connectors → one consistent stream (unified plugin-connector architecture). C++. |
| **Agentic Inbox** | https://github.com/cloudflare/agentic-inbox | Self-hosted email + AI agent on Cloudflare Workers + Email Routing; AI triage/draft with approve-before-send. TS. |
| **ClawRouter** | https://github.com/BlockRunAI/ClawRouter | Agent-native LLM router — 66 models (8 free); provider routing for agents. TS. (`mksglu/context-mode` fork ✅ CONFIRMED — repo live, npm `context-mode`, doc 25 §6.) |
| **Open-Generative-AI** | https://github.com/Anil-matcha/Open-Generative-AI | Multi-model adapter router w/ fallback between image/video backends (MuAPI). JS. |
| **Hyperframes** | https://github.com/heygen-com/hyperframes | HTML→video rendering framework (npm); animated video reports/walkthroughs. TS. |

---

## 5. Agentic OS / misc

| Repo | URL | Features → impl |
|---|---|---|
| **ECC** | https://github.com/affaan-m/ECC | Agent-harness guardrails: planning-before-building, verification gates, AgentShield session scanning, repo-history→defaults. JS/MD. (238K⭐ — treat critically, docs 04/09.) |
| **AIOS** | https://github.com/agiresearch/AIOS | LLM-as-OS kernel: scheduler for LLM calls, context/memory abstraction, tool manager, VM controller + MCP server (LiteCUA). Python. |
| **Open Interpreter** | https://github.com/OpenInterpreter/open-interpreter | Terminal agent running code locally; `--os` mode adds screen+click computer-use. Python. |
| **Agent S** | https://github.com/simular-ai/Agent-S | Agent-Computer Interface (ACI): GUI grounding with UI-TARS vision models; experience-augmented hierarchical planner; SOTA OSWorld (~72%). Python. |
| **OpenClaw** (tier-1 → doc 16 §5) | https://github.com/openclaw/openclaw | spec-driven orchestration; per-agent workspace/model/sandbox. |
| **Leon 2.0** | (doc 18 §2) | — |
| **OpenWork** | https://github.com/different-ai/openwork | ✅ confirmed — open-source Claude-Cowork/Codex alternative; remote MCP control plane (`search_capabilities`/`execute_capability`), Google Workspace + M365 plugins (doc 09/25 §6) |

---

## 6. Tier-2 notes
- Star counts flagged where rate-limited/uncertain (docs 14–15 hold the authoritative table).
- Nebula + CAI (doc 03) → **CONFIRMED** (doc 25 §6: `aliasrobotics/CAI`, `berylliumsec/nebula`); OpenWork confirmed (`different-ai/openwork`); `mksglu/context-mode` confirmed (npm `context-mode`). **All tier-2 repo structures → doc 26** (5 rate-limited: CrewAI src, Chatbox src, HexStrike, Agentic-Inbox src, Leon develop).
- AnythingLLM/Hermes/pi/Reasonix/smolagents/OpenFang tier-1 → doc 16.
- browser-use/firecrawl/crawl4ai/deep-research/Composio/Nango/Zapier/Jan/Vellum tier-1 → doc 17.

> Full coverage: **16** (tier-1 agents) + **17** (tier-1 web/connectors) + **18** (tier-2) + **14–15** (all-repo ledger) + **01–13** (domain research).
