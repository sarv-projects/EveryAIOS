# 01 · Master Landscape 2026 — Every Project Researched

> Complete reference of every open-source project, framework, and repo examined for the
> desktop AI app. Star counts verified via GitHub API (Aug 2026) unless marked "unverified".
> Legend: ⭐ stars · 🛠 built on · 📦 license · 🎯 verdict for our app

---

## A. Python Agent Frameworks & Orchestration

| Project | ⭐ | What it does | 🛠 Built on | Verdict |
|---|---|---|---|---|
| **LangChain + LangGraph** | 132K | Industry-standard agent engineering: chains + stateful cyclic graphs | Python/TS, own graph runtime | Pattern reference; not needed (our IR engine exists) |
| **AutoGPT** | 185K | Autonomous agent pioneer, visual builder, 45+ tools, marketplace | Python, platform | Historical; concept already in our engine |
| **Dify** | 136K | Low-code agentic workflow + RAG platform | Python/Flask + React, Docker | Reference for workflow builder UX |
| **OpenHands** | 70K+ | Autonomous coding agent in Docker sandboxes, Codeact loop | Python + Docker, LiteLLM | 🎯 Sandboxed code-exec pattern + `--headless` CI mode |
| **MetaGPT** | 66K | SOP-driven "virtual software company" (PM→Architect→Engineer→QA) | Python, multi-agent | Concept: role pipelines |
| **CrewAI** | 48K | Role-based multi-agent (role/goal/backstory) | Python, LangChain | Concept: role separation |
| **Agno (Phidata)** | 40K+ | Full agent runtime with built-in UI, multi-tenant, DB-backed sessions | Python | 🎯 Agent-session persistence pattern |
| **AutoGen (MS)** | 57K | Event-driven multi-agent conversations | Python/.NET | Concept: agent-to-agent chat |
| **DSPy (Stanford)** | 28K | "Program, not prompt" — compiler optimizes prompts like hyperparams | Python | 🎯 Prompt-as-code optimization for skills |
| **smolagents (HF)** | 28K | Code-as-action agents (LLM writes Python, not JSON) | Python | 🎯 Code-execution tool paradigm |
| **Semantic Kernel (MS)** | 28K | Enterprise agent framework, C#/Python/Java | MS stack | Enterprise patterns |
| **Pydantic AI** | 19K | Type-safe production agents, FastAPI ergonomics | Python, Pydantic v2 | 🎯 Typed tool schemas |
| **Haystack** | 25.5K | RAG-native pipelines | Python | RAG architecture reference |
| **ChatDev** | 25K | Multi-agent software factory via debate | Python | Concept only |
| **SuperAGI** | 17.6K | Autonomous agent orchestration + GUI dashboard | Python | Concept: agent dashboard |
| **Atomic Agents** | 5K | Schema-driven modular agents | Python | Modularity pattern |
| **PocketFlow** | 11K | ~100-line core, human-auditable agent framework | Python/TS | 🎯 Minimalism philosophy |
| **Mastra** | 24.8K | TS-first agent framework, graph workflows, edge deploys | TypeScript, Vercel AI SDK | TS-native alternative to LangGraph |

## B. Rust / Go / Other-Language Frameworks

| Project | ⭐ | Lang | What it does | 🛠 Built on | Verdict |
|---|---|---|---|---|---|
| **Ollama** | 177.8K | Go | Local model runtime, OpenAI-compatible API, GPU auto-detect | llama.cpp under the hood | 🎯 **Bundle as sidecar** — local models without bundling C++ |
| **OpenFang (RightNow-AI/openfang)** | verified | Rust | "Agent Operating System" — 14-crate Rust workspace, single ~32MB binary, sub-200ms cold start, WASM tool sandbox, dynamic .so plugins | Rust | Study (WASM sandbox idea), don't copy wholesale |
| **AIOS (agiresearch/AIOS)** | verified | Rust + Python | "AI Agent OS" kernel — resource scheduling, memory/storage/tool isolation, daemon | Rust core + Python LLM glue | Study: resource-scheduling abstraction |
| **Jan (janhq/jan)** | 30K+ | TS/Electron | Local-first AI assistant, model management, local + cloud engines | Electron + React | Reference for local-model UX |
| **PyGPT (szczyglis-dev/py-gpt)** | ~10K | Python/PySide6 | Desktop AI assistant: agents, vision, voice, plugins, automation | Python, PySide6 | Feature-set reference |
| **Leon (leon-ai/leon)** | 15K+ | Node + Python | Personal assistant, skill-based, web + messaging channels | Node core, Python skills | Skill architecture reference |
| **GenOffice (genspark-ai/genoffice)** | verified | TS/Electron + Rust | AI-native office suite: docx/pdf/pptx/xlsx, byte-preserving block-tree editing | Electron + Rust sidecars (calamine+IronCalc) | 🎯 docx block-tree + file-parse → "replace editors" superpower |

## C. Browser Automation Agents

| Project | ⭐ | What it does | 🛠 Built on | Verdict |
|---|---|---|---|---|
| **Browser Use (browser-use/browser-use)** | 107.9K | "Make websites accessible for AI agents" — LLM + Playwright, DOM perception | Python, Playwright | 🎯 Browser automation over our WebView layer |
| **Skyvern** | 10K+ | Planner-Actor-Validator vision architecture, no DOM selectors, auto 2FA/CAPTCHA | Python | Vision-based automation reference |
| **Stagehand** | 8K+ | TS + Playwright, deterministic code + AI helpers (`act`, `extract`) | TypeScript | Lightweight TS-native alternative |

## D. Deep Research Engines

| Project | ⭐ | What it does | 🛠 Built on | Verdict |
|---|---|---|---|---|
| **Perplexica (ItzCrazyKns/Perplexica)** | 35K+ | Open-source Perplexity clone — SearXNG + similarity search, multiple modes | Next.js, LlamaIndex, SearXNG | 🎯 Mode-switching UX + SearXNG-first search |
| **gpt-researcher (assafelovic)** | 25K+ | Plan → parallel search → iterate → write report loop | Python, LangChain | The classic research loop |
| **STORM (Stanford, stanford-oval/storm)** | 20K+ | R2A workflow: Retrieval-Augmented-Retrieval-Aware-Reflection | Python | Research refinement technique |
| **MindSearch (InternLM)** | 8K+ | Agent search across 300+ APIs | Python | Multi-source search orchestration |
| **OpenDeepResearch (HuggingFace)** | verified | Open-source deep research, works with local models | Python | Local-model deep research |
| **dzhng/deep-research** | 30K+ | Viral one — breadth×depth scaling, follow-up Q generation, recursive dive | Node/TS | 🎯 Breadth×depth recursion to graft onto DR v2 |
| **langchain-ai/open_deep_research** | verified | LangGraph research loops, dynamic plans, self-check drafts | LangGraph | Plan/iterate/self-verify pattern |
| **DeerFlow (bytedance/deer-flow)** | **79.6K** | "Long-horizon SuperAgent harness that researches, codes, and creates" — Lead Agent + background subagents, middleware chains, `/mnt/user-data/*` virtual paths, SSE streaming | Python, LangGraph | 🎯 Virtual paths, middleware concept, SSE step-streaming |
| **DeepAnalyze (ruc-datalab/DeepAnalyze)** | verified | Autonomous end-to-end data science: prep → clean → model → chart → report | Python | 🎯 Data-analysis workflow schemas |
| **AI Data Science Team (business-science/ai-data-science-team)** | verified | Multi-agent data science division (clean/EDA/model/chart) | Python | Multi-agent data science reference |
| **AutoSearch (DavidZWZ/Awesome-Deep-Research index)** | — | MCP-native, LLM-decoupled search layer, 40+ channels, dedupe + attribution | Index | MCP-native search layer pattern |

## E. Agent OS / Computer-Use Layer

| Project | ⭐ | What it does | 🛠 Built on | Verdict |
|---|---|---|---|---|
| **Open Interpreter** | 55K+ | LLM runs code (Python/shell) locally to drive your desktop | Python | Local code-execution reference |
| **Agent S (simular-ai/Agent-S)** | verified | Agentic framework navigating GUIs on Linux/Mac/Windows | Python | Computer-use reference |
| **OpenWork** | unverified | Open-source desktop workspace, local alternative to Claude Cowork | — | Verify before depending |
| **Browser Use** | 107.9K | (see C) DOM-based web automation | Python, Playwright | 🎯 See C |

## F. Local Model Stack

| Project | ⭐ | What it does | 🛠 Built on | Verdict |
|---|---|---|---|---|
| **Ollama** | 177.8K | Local model runtime, the standard | Go, llama.cpp | 🎯 Sidecar |
| **Open WebUI** | 147.9K | Full local AI platform (chat UI + pipelines + RAG + tools) | Python | Heavy; we build our own UI |
| **llama.cpp** | 75K+ | The C++ inference engine everything wraps | C++ | Bundling option |
| **LM Studio** | — | Desktop local-model runner, OpenAI-compatible API | Electron | Reference UX |

## G. Tool/Connector Platforms

| Project | ⭐ | What it does | 🛠 Built on | Verdict |
|---|---|---|---|---|
| **Composio (ComposioHQ/composio)** | 20K+ | 1,000+ app connectors, managed OAuth, now a Universal MCP Gateway | Python/TS SDK | 🎯 Per-user key, in-app SDK (we already integrate v0.14.0) |
| **Firecrawl (firecrawl/firecrawl)** | 161.4K | Search/scrape/crawl/extract web API | TS, cloud-first | ⚠️ **AGPL-3.0** — use Jina Reader OSS locally instead |
| **Jina Reader OSS** | — | Self-hostable Docker: any URL/PDF → clean markdown, zero keys | Python/TS | 🎯 Default local extractor |
| **MCP (Model Context Protocol)** | standard | The tool-standard; every local/niche tool as MCP servers | — | Our ConnectorOrchestrator unifies Composio + MCP |

## H. Other Verified Repos (from reality-check)

| Project | ⭐ | What it does | Verdict |
|---|---|---|---|
| **AutoHedge (The-Swarm-Corporation)** | ~1.6K+ | Autonomous AI hedge fund swarm (Director/Quant/Risk/Execution agents), Solana | Swarm architecture reference |
| **Vibe-Trading (HKUDS)** | ~2.9K+ | NL → strategies/backtests, 29 swarm presets, 71 finance skills, persistent memory | Skills + memory pattern |
| **Claude Ads (AgriciDaniel/claude-ads)** | ~3.2K+ | 250+ paid-ads audit checks, parallel sub-agents, PDF reports | Sub-agent parallel pattern |
| **toprank (nowork-studio)** | ❌ | **HALLUCINATED — does not exist** | Ignore |
| **Fincept Terminal (Fincept-Corporation)** | ~15.3K+ | C++ Bloomberg-style terminal: 100+ connectors, 37 AI agents, node editor | Node-editor + agent dashboard reference |
| **Agentic Inbox (cloudflare/agentic-inbox)** | ~1.5K+ | Self-hosted email client on Cloudflare Workers + AI agent (approve-before-send) | Human-in-the-loop pattern |
| **ClawRouter / context-mode (mksglu)** | ~10.3K+ | Context-window compressor, 98% compression, 14 platforms | 🎯 Compression → our ContextCompressor |
| **Camofox Browser (jo-inc)** | ~3.2K+ | Stealth headless browser for agents, anti-bot bypass | ⚠️ Marketing claims unproven — verify before use |
| **Open Higgsfield AI (Anil-matcha/Open-Generative-AI)** | ~8.6K+ | Self-hosted text→image/video, 200+ models, workflow studio | Image-gen workflows |
| **Hyperframes (heygen-com/hyperframes)** | ~11.1K+ | HTML→MP4 video rendering for agents | Video generation pipeline |
| **hermes-agent (nousresearch)** | 225.8K | "The agent that grows with you" — self-improving personal agent, Hermes models | Local + cloud |
| **ECC (affaan-m/ECC)** | 237.9K | Claude Code harness optimization: skills + agents + security | AgentShield skill scanning → TrustLadder |
| **awesome-ai-agents-2026 (caramaschiHG)** | 1.5K | Curated index: 300+ agents, 20+ categories | Our competitive-analysis taxonomy |

---

## Verified Star Counts (GitHub API, Aug 2026)

| Repo | Stars | Lang | License |
|---|---|---|---|
| browser-use/browser-use | 107.9K | Python | MIT |
| bytedance/deer-flow | 79.6K | Python | MIT |
| firecrawl/firecrawl | 161.4K | TypeScript | AGPL-3.0 ⚠️ |
| nousresearch/hermes-agent | 225.8K | Python | MIT |
| affaan-m/ECC | 237.9K | JavaScript | MIT |
| ollama/ollama | 177.8K | Go | MIT |
| open-webui/open-webui | 147.9K | Python | — |
| caramaschiHG/awesome-ai-agents-2026 | 1.5K | — | — |

> Note: DeerFlow's correct path is `bytedance/deer-flow` (NOT `ByteDance-Seed/DeerFlow`).
> Star counts for older repos (LangChain, AutoGPT, etc.) are from mid-2025 knowledge — re-verify before quoting publicly.

---

## The Recurring Theme

Almost everything we're excited about — Crystallization, NL cron, memory layers, keyless search,
deep research, workflow engine — **we already built.** These repos validate our architecture more
than they extend it. The genuinely new additions are:

1. **Sandbox virtual-paths** (`/mnt/user-data/*` from DeerFlow)
2. **SSE step-streaming** (DeerFlow + AnythingLLM introspect narration)
3. **Ollama sidecar pattern**
4. **You.com keyless provider**
5. **Token-counted search narration** (AnythingLLM)
6. **Local SearXNG + Jina Reader OSS containers**
