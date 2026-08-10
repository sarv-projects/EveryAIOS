# 21 — New Agents, Search & Scraping Ledger (requested 2026-08-06)

> New repos the user asked to research. URLs + what they are + how they fit. Deep provider/BYOK analysis → doc 19.

---

## Agent frameworks & SDKs

### AutoGPT — `Significant-Gravitas/AutoGPT`
- **URL:** https://github.com/Significant-Gravitas/AutoGPT
- **What:** "AI agents that finish the work" — describe a goal, it plans/executes. The original autonomous-agent project (now platform + OSS platform server).
- **Fit:** reference for long-horizon goal loops (doc 03). Pattern source, not a component.

### openai-agents-python — `openai/openai-agents-python`
- **URL:** https://github.com/openai/openai-agents-python | **Docs:** openai.github.io/openai-agents-python
- **What:** Lightweight multi-agent workflow SDK. **Provider-agnostic**: OpenAI Responses + Chat Completions APIs + **100+ other LLMs**. Agents, handoffs, guardrails, tracing, sessions.
- **Fit:** a proven agent-loop reference (agents → handoffs → guardrails); the 100+ provider claim matters for BYOK (check their LiteLLM integration).

### deepagents — `langchain-ai/deepagents`
- **URL:** https://github.com/langchain-ai/deepagents | **Docs:** docs.langchain.com/oss/python/deepagents
- **What:** LangChain's agent framework for complex multi-step tasks (crisp profiles: planning + tool use).
- **Fit:** reference for structured agent profiles + planning (doc 03/05).

### CopilotKit — `CopilotKit/CopilotKit`
- **URL:** https://github.com/CopilotKit/CopilotKit | **Docs:** docs.copilotkit.ai
- **What:** React/Next.js framework for building in-app AI copilots (CoAgents, useCoAgent, generative UI in React).
- **Fit:** reference for our UI agent canvas + generative-UI patterns (React components rendered by agent actions).

### agenticSeek — `Fosowl/agenticSeek`
- **URL:** https://github.com/Fosowl/agenticSeek
- **What:** **100% local Manus alternative** — private agentic AI without cloud.
- **Fit:** direct competitor/reference for our local-first agent; check its local toolset (browser, code exec) for ideas.

### nanobot — `HKUDS/nanobot`
- **URL:** https://github.com/HKUDS/nanobot | **Docs:** nanobot.wiki
- **What:** Lightweight bot/agent framework, multi-language docs (verified 2026-08-06, doc 23 §A2). HKUDS = HK University of Data Science lab (also Vibe-Trading).
- **Fit:** ✅ resolved (doc 24 §2.4): confirmed Python agent/bot framework (PyPI `nanobot-ai`, docs nanobot.wiki); low adoption priority.

### khoj — `khoj-ai/khoj`
- **URL:** https://github.com/khoj-ai/khoj | **Docs:** docs.khoj.dev
- **What:** AI second brain — personal AI that answers from your notes/docs (RAG + agents + chat, self-hostable).
- **Fit:** RAG + personal-memory reference (our core-memory pillars).

---

## Memory for agents

### agentmemory — `rohitg00/agentmemory`
- **URL:** https://github.com/rohitg00/agentmemory
- **What:** **Persistent memory for AI coding agents** — built on the `iii` engine; works with Claude Code, Copilot CLI, Cursor, Gemini CLI, Codex CLI, Hermes, OpenClaw, pi, OpenCode, and any MCP client. "Your coding agent remembers everything."
- **Fit:** direct reference for our memory layer exposed via MCP to any agent — exactly our Connector-Hub/Forge memory story (docs 03/13). Check its MCP memory server implementation.

---

## Search & research

### MindSearch — `InternLM/MindSearch`
- **URL:** https://github.com/InternLM/MindSearch | **Paper:** arxiv.org/abs/2407.20183
- **What:** InternLM's open search-agent framework — multi-agent web search + reasoning (planner + searchers), used by InternLM Chat.
- **Fit:** reference for multi-agent search orchestration (doc 07 deep research).

### Agent-Reach — `Panniantong/Agent-Reach`
- **URL:** https://github.com/Panniantong/Agent-Reach
- **What:** "Give your AI agent internet capability with one click" — the most stable way to add web access to agents; picks/installs/inspects the right integration automatically.
- **Fit:** reference for our "free web access for agents" onboarding (doc 06) — how it auto-selects the search integration.

### PageIndex — `VectifyAI/PageIndex` ⚠️ MAJOR FIND
- **URL:** https://github.com/VectifyAI/PageIndex | **Site:** vectify.ai/pageindex
- **What:** **Vectorless, reasoning-based RAG — no vector DB, no chunking** (verified 2026-08-06, doc 23 §A3). Context-aware retrieval that reads documents like a human.
- **Fit:** ✅ resolved (doc 24 §2.2): mechanism **code-verified** (`page_index.py` + `retrieve.py` + `tree_optimize.py` — agent navigates a tree index, fetches tight page ranges; no embeddings/chunking). Keep HNSW for corpus recall; adopt the agent-navigable tree-index layer.

### ragflow — `infiniflow/ragflow`
- **URL:** https://github.com/infiniflow/ragflow | **Docs:** ragflow.io/docs
- **What:** Open-source RAG engine — deep document understanding (template-based chunking, OCR), agentic RAG workflows, GraphRAG, hybrid retrieval.
- **Fit:** strong reference for our RAG ingestion quality (template chunking + OCR + GraphRAG ideas beyond what AnythingLLM does).

---

## Scraping & web data

### ScrapeGraphAI — `ScrapeGraphAI/Scrapegraph-ai`
- **URL:** https://github.com/ScrapeGraphAI/Scrapegraph-ai | **Docs:** scrapegraphai.com
- **What:** "You Only Scrape Once" — LLM-driven scraping via graph pipelines (build a scraping graph, no manual selectors); local models supported.
- **Fit:** reference for LLM-guided extraction (doc 06 tier 2/4) — our crawl4ai + LLM extraction already covers this; steal the graph-pipeline idea.

### google-ai-mode-scraper — `oxylabs/google-ai-mode-scraper`
- **URL:** https://github.com/oxylabs/google-ai-mode-scraper
- **What:** Oxylabs' scraper for **Google AI Mode** (the AI-overlay SERP) — proxy-based SERP scraping.
- **Fit:** niche; reference for AI-overlay SERP handling if we ever need it (requires their paid proxy — not local-first).

### maxun — `getmaxun/maxun`
- **URL:** https://github.com/getmaxun/maxun | **Site:** maxun.dev
- **What:** No-code platform: "Turn any website into a structured API" — real-time scraping, crawling, search, AI data extraction.
- **Fit:** reference for the visual-scraper UX (user records a flow → structured API) — could inspire our scraping onboarding.

### deer-flow — `bytedance/deer-flow` ⚠️ CORRECTION
- **URL:** https://github.com/bytedance/deer-flow
- **Status:** **The repo EXISTS again as "DeerFlow 2.0"** (was removed when we researched doc 11!). Requires Python 3.12+, Node 22+. Original DeerFlow was ByteDance's "Super Agent Harness" (long-horizon loop + memory + observability).
- **Action:** re-add to research — verify the 2.0 content (it's the repo doc 11 said was gone).

---

## Google CLIs

### gemini-cli — `google-gemini/gemini-cli`
- **URL:** https://github.com/google-gemini/gemini-cli | **Docs:** geminicli.com/docs
- **What:** Google's agentic coding CLI (npm `@google/gemini-cli`). Weekly preview+stable releases.
- **Fit:** competitor/reference for our coding-agent CLI (doc 05) + a target for cc-switch-style BYOK config.

### ruflo — `ruvnet/ruflo`
- **URL:** https://github.com/ruvnet/ruflo | **UI beta:** flo.ruv.io
- **What:** Agentic-engineering runtime/flow framework (npm `ruflo`, `npx ruflo`; from the Cognitum agentic-engineering series) — UI beta at flo.ruv.io. (✅ structure verified doc 24 §2.5: Rust core, `SKILL.md`, `.claude-plugin`, `agentdb.rvf`.)
- **Fit:** reference for flow-based agent orchestration; verify before adopting.

### anomalyco/opencode — ✅ verified 2026-08-06 (doc 23 §A1)
- **URL:** https://github.com/anomalyco/opencode | **Site:** opencode.ai | **npm:** `opencode-ai`
- **Status:** **This IS opencode's current home** — "The open source AI coding agent." The `opencode-ai/opencode` org is archived; the project lives under `anomalyco` now. Charm's Crush is the original-author fork-offshoot. Docs 14/21 updated.

### googleworkspace/cli — `googleworkspace/cli`
- **URL:** https://github.com/googleworkspace/cli
- **What:** Unified CLI for Google Workspace (`gws`) — Drive, Gmail, Calendar + every Workspace API, zero boilerplate, structured JSON output, **40+ built-in agent skills**.
- **Fit:** strong candidate for our Gmail/Calendar/Drive native connector (doc 13 Connector Hub) — a ready-made local CLI with agent skills instead of OAuth plumbing.

---

## Rapid table

| Repo | URL | What | Fit |
|---|---|---|---|
| AutoGPT | github.com/Significant-Gravitas/AutoGPT | autonomous goal agent | pattern ref |
| openai-agents-python | github.com/openai/openai-agents-python | multi-agent SDK, 100+ LLMs | agent-loop ref |
| deepagents | github.com/langchain-ai/deepagents | LangChain deep agents | profile/planning ref |
| CopilotKit | github.com/CopilotKit/CopilotKit | React copilot framework | UI agent canvas |
| agenticSeek | github.com/Fosowl/agenticSeek | 100% local Manus alt | competitor ref |
| nanobot | github.com/HKUDS/nanobot | (verify) | verify |
| khoj | github.com/khoj-ai/khoj | AI second brain (RAG) | memory/RAG ref |
| **agentmemory** | github.com/rohitg00/agentmemory | persistent agent memory via MCP | **memory-layer ref** |
| MindSearch | github.com/InternLM/MindSearch | multi-agent web search | deep-research ref |
| Agent-Reach | github.com/Panniantong/Agent-Reach | one-click internet for agents | search onboarding |
| PageIndex | github.com/VectifyAI/PageIndex | (verify) | verify |
| ragflow | github.com/infiniflow/ragflow | RAG engine (template chunk/OCR/Graph) | RAG quality ref |
| Scrapegraph-ai | github.com/ScrapeGraphAI/Scrapegraph-ai | LLM scraping graphs | extraction ref |
| google-ai-mode-scraper | github.com/oxylabs/google-ai-mode-scraper | Google AI SERP scraper | niche |
| maxun | github.com/getmaxun/maxun | no-code site→API | scraping UX |
| **deer-flow** | github.com/bytedance/deer-flow | **repo is back as 2.0** | re-verify |
| gemini-cli | github.com/google-gemini/gemini-cli | Google agent CLI | CLI ref |
| **googleworkspace/cli** | github.com/googleworkspace/cli | `gws` CLI + 40 agent skills | **Gmail/Drive connector** |
| ruflo | github.com/ruvnet/ruflo | agentic flow framework (flo.ruv.io) | verify |
| anomalyco/opencode | github.com/anomalyco/opencode | ✅ verified home (doc 24 §2.1) — Go→TS rewrite + desktop package | — |

> **Top steals:** agentmemory (MCP memory), ragflow (chunking/OCR/GraphRAG), googleworkspace/cli (Gmail/Drive without OAuth plumbing), deer-flow (re-verify 2.0), openai-agents-python (handoff+guardrail loop).
> **⚠️ Deer-flow correction:** doc 11 (2026-08-05) said the upstream repo was removed; this pass (2026-08-06) found `bytedance/deer-flow` **live again as DeerFlow 2.0** (Python 3.12+, Node 22+). This supersedes the doc 11/15 claim — see doc 22-E note.
