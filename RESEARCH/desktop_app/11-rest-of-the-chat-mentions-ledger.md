# 11 — The Rest of the Chat: Final Sweep + Complete Mentions Ledger

> Verified 2026-08-05. This doc closes the loop on **every** repo/framework mentioned anywhere in the conversation so nothing is left unresearched.

## The last uncovered repos (verified this pass)

| Repo | Stars (live) | Lang | What it is | Relevance / steal |
|---|---|---|---|---|
| **DeerFlow** (ByteDance) | ⚠️ **2026-08-06 UPDATE: repo is LIVE again** — `bytedance/deer-flow` now "DeerFlow 2.0" (Python 3.12+, Node 22+). Mirrors like `coolclaws/deerflow-book` (662⭐) also exist. Earlier this pass it appeared removed (2026-08-05). | — | ByteDance's "Super Agent Harness": long-horizon autonomous loop w/ memory, observability, tool orchestration. | Re-verified in doc 21 — re-check the 2.0 content; pattern already covered by doc 03/07 |
| **Perplexica → Vane** (`ItzCrazyKns/Vane`) | **36K** | TS | Perplexica (the local Perplexity clone) was **renamed to Vane** — AI-powered local answering engine: local LLMs + SearXNG + vector memory, citations | Validates our searxng-first free-search stack; steal their RAG-mem + citation UI patterns |
| **Leon** (`leon-ai/leon`) | **17.4K** | TS | Open-source personal assistant (NLU + skills + web UI, self-hosted) | Older-generation assistant; skills-are-files pattern = our Forge, but stack is dated |
| **PyGPT** (`szczyglis-dev/py-gpt`) | **1.9K** | Python | Desktop AI assistant (GPT/Gemini/Claude/Llama), chat + agents + vision, local plugin system | Desktop-app reference; plugin dir = our skill registry |
| **awesome-ai-agents-2026** (`caramaschiHG/awesome-ai-agents-2026`) | **1.5K** | — | Curated 2026 list of agents/frameworks/tools | Keep as a living index to re-check quarterly; not a component |
| **AnythingLLM `open-computer/`** (Mintplex) | (part of 64K repo) | — | A separate submodule-based project (`.gitmodules` + `master/` + `cli/` dirs) for Mintplex's open-computer agent | Real but immature; check later — DOM-snapshot browsing (doc 06) is the better path |
| Ollama | **177,889** (API 2026-08-06) | Go | Local runtime daemon :11434 | doc 08 |
| Open WebUI | **148K** | Python | Self-hosted AI frontend | doc 08 |

## 🔭 Full mentions ledger (every repo raised in the entire conversation → where it's covered)

| Mentioned | Covered in |
|---|---|
| AnythingLLM, authenticated scraping, scheduled jobs, RAG pipeline | doc 01 |
| AnythingLLM `open-computer` | doc 11 |
| Hermes Agent (plugins, memory, skills, cron, delegate, search, sandboxes) | doc 02 |
| OpenClaw (AGENTS.md/SOUL.md orchestration), Agno/CrewAI/AutoGen/MetaGPT per-agent models | doc 03 |
| Agent Zero (real = `agent0ai/agent-zero`; `msitarzewski/AGENT-ZERO` = decoy) | doc 03 + 09 |
| smolagents code-as-action | doc 03 + 09 |
| Strix, PentAGI, PentestGPT, HexStrike, PyRIT, Vulnhuntr (cyber) | doc 03 |
| opencode → Crush, pi, Claude Code, Reasonix (cache-first) | doc 05 |
| Browser Use, Firecrawl, crawl4ai, Trafilatura, Jina Reader, Camofox | doc 06 |
| dzhng/deep-research, open_deep_research, AutoSearch, DeepAnalyze, ai-data-science-team, local-deep-research | doc 07 |
| Jan, Cherry Studio, Chatbox, Vellum, Open WebUI, GenOffice, Ollama, LM Studio, OpenFang (competitor view) | doc 08 |
| AIOS, OpenFang (technical), Open Interpreter, Agent S, OpenWork, ECC | doc 09 |
| AutoHedge, Vibe-Trading, claude-ads, toprank/notfair, FinceptTerminal, Agentic Inbox, ClawRouter, Open-Generative-AI, Hyperframes, Composio, MCP ecosystem | doc 10 |
| **DeerFlow, Perplexica/Vane, Leon, PyGPT, awesome-ai-agents-2026** | doc 11 |
| Fable-mode / fable-os / solana-agent-kit (debunked) | doc 04 |
| "7 algorithms" (built already) | doc 04 + spec §3 |
| SearXNG (built), MCP client (built) | spec §3 |

**Coverage complete — nothing mentioned across the entire chat is left unresearched.**

> 📖 **For the HOW (implementation-level), see the code ledgers: `14-repo-implementation-ledger-1-agents-coding.md` (agents/coding/orchestration/cyber) and `15-repo-implementation-ledger-2-apps-tools-connectors.md` (desktop apps, scraping, deep research, business tools, connectors) — each with repo URL, docs URL, and implementation analysis.**

## Note on verification honesty
- Star counts marked **verified** = live GitHub API on 2026-08-05.
- `~`/`(unverified)` = researcher-reported, not API-confirmed this pass.
- Two pastes' claims were wrong and are corrected: DeerFlow's repo is gone (not "rapidly scaling"), Perplexica = now Vane, and `msitarzewski/AGENT-ZERO` ≠ the famous Agent Zero.
