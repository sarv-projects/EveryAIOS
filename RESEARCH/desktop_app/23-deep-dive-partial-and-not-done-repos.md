# 23 — Deep-Dive: Previously Partial / Not-Done Repos (2026-08-06 second pass)

> This doc completes the ❌ NOT-DONE and ⚠️ PARTIAL repos from the audit. Feature-level detail + URLs.
> Status per repo: ✅ verified this pass · ⚠️ partially verified (flagged what's still missing)

---

## A. ❌ NOT-DONE → now resolved

### A1. anomalyco/opencode ✅
- **URL:** https://github.com/anomalyco/opencode | **Site:** opencode.ai | **npm:** `opencode-ai`
- **What:** "The open source AI coding agent." **Appears to be the current home of opencode** — ⚠️ *README-head-level only, not deep-verified this pass*. Go-based terminal AI agent (bubbletea TUI, MCP, LSP — doc 14 §B1). → **(upgraded to confirmed home + Go→TS rewrite in doc 24 §2.1)**
- **⚠️ Verification level:** `anomalyco/opencode` README head fetched 2026-08-06 (site opencode.ai, npm `opencode-ai`). Both readings can be true simultaneously: the **original author** continued the agent as **Crush** at Charm (per the archived `opencode-ai/opencode` README), *while* the opencode project name/home moved to the `anomalyco` org. Treat `anomalyco` as "likely current home — verify deeper before canonizing."
- **Action:** docs 14/21 updated with the hedged claim (opencode-ai org archived; apparent new home `anomalyco/opencode`; Crush = original-author continuation at Charm).

### A2. nanobot — `HKUDS/nanobot` ✅
- **URL:** https://github.com/HKUDS/nanobot | **Docs:** nanobot.wiki
- **What:** Lightweight bot/agent framework (multi-language docs: EN/中文/ES/FR/ID). HKUDS = Hong Kong University of Data Science lab (also Vibe-Trading, doc 10).
- **Fit:** verify deeper before adopting; likely a compact agent/bot library, not a full OS.

### A3. PageIndex — `VectifyAI/PageIndex` ✅ ⚠️ MAJOR FIND
- **URL:** https://github.com/VectifyAI/PageIndex | **Site:** vectify.ai/pageindex
- **What:** **"Vectorless, reasoning-based RAG"** — **no vector DB, no chunking**. Context-aware retrieval that reads documents like a human (LLM-reasoning over pages/context instead of embedding similarity). ⚠️ **Vendor-claimed, not independently verified this pass** — this is the project's own description from its README/site, and "reasoning-based RAG with zero vector math" is a strong claim we should pressure-test before believing it.
- **Fit:** ⚠️ if true, challenges our whole RAG assumption (could replace/supplement the embed→chunk→HNSW pipeline, docs 01/16). **Research this deeper — potentially a paradigm shift, but verify the actual retrieval mechanism first.**

### A4. microsandbox — `superradcompany/microsandbox` ✅
- **URL:** https://github.com/superradcompany/microsandbox
- **What:** **Easy, fast, local microVMs for running untrusted workloads securely.**
- **Fit:** the sandbox backend for our Forge (doc 03) — microVM isolation is stronger than process-sandboxing and lighter than full Docker. **Candidate sandbox backend.**

### A5. endee — `endee-io/endee` ✅
- **URL:** https://github.com/endee-io/endee
- **What:** High-performance AI Search & Intelligence platform — AI search, RAG, semantic search, hybrid retrieval.
- **Fit:** evaluate vs SeekStorm/qdrant for the local hybrid-search backend (doc 20).

### A6. DeerFlow 2.0 — `bytedance/deer-flow` ✅
- **URL:** https://github.com/bytedance/deer-flow
- **What (2.0):** MIT-licensed; **Python 3.12+ backend + Node 22+ frontend**; **#1 on GitHub Trending after 2.0 launch** (2026). ByteDance's "Super Agent Harness" — long-horizon loop + memory + observability + tool orchestration (doc 11 correction stands: repo live again).
- **Action:** **RESOLVED 2026-08-06** — 2.0 re-verified 2026-08-08 (79,565⭐) + structure deep-read (doc 39 §B1): channels-first harness (10 IM adapters, run_policy, dedupe_store, gateway auth) → informs F13 messaging bridges; harness loop code-level read deferred (covered by docs 03/07/38).

---

## B. ⚠️ PARTIAL → now deepened

### B1. rtk (Rust Token Killer) — `rtk-ai/rtk` ✅ (user-flagged very important)
- **URL:** https://github.com/rtk-ai/rtk
- **What:** High-performance CLI proxy — single Rust binary, **<10ms overhead, 100+ supported commands**; filters/compresses/intercepts shell output before it reaches the LLM, cutting up to 90% of bash output tokens.
- **HOW it cuts (command-specific rules — the steal):**
  - `ls`/`tree` → tree format with file counts (not one line per entry)
  - `cat`/`read` → smart file reading: signatures + structure, not full bodies
  - `grep`/`rg` → truncates long lines, groups matches by file
  - `git status`/`diff`/`log` → compact stat formats, strip headers, restrict to hash/author/subject
  - `cargo test`/`npm test` → filters out passing tests, shows failures only
- **Structure:** `Cargo.toml`, `.rtk/` config, `CLAUDE.md`, Formula/ (homebrew), multi-language readmes.
- **Fit:** direct component for our token-reduction (docs 05/16). **Adopt the per-command compression-rule approach.**

### B2. AIOS — `agiresearch/AIOS` ✅ (user-flagged important)
- **URL:** https://github.com/agiresearch/AIOS | **Docs:** docs.agios.ai
- **Kernel services (`aios/` — verified):** `scheduler` (agent/task scheduling), `memory`, `tool` (tool mgmt/execution), plus `config`, `context`, `hooks`, `llm_core`, `storage`, `syscall`, `terminal`, `utils`.
- **What:** LLM-as-OS kernel — embeds LLMs into OS architecture; resource management (scheduling, context switching, memory, storage, tools).
- **Fit:** reference for our sidecar's agent-kernel layering (doc 16 §C9a). The scheduler + tool-manager separation is worth stealing.

### B3. qdrant — `qdrant/qdrant` ✅
- **URL:** https://github.com/qdrant/qdrant | **Docs:** qdrant.tech
- **What:** Vector search engine in Rust; extended vector search, flexible metadata filtering, sparse+dense hybrid, embedded mode.
- **Fit:** local RAG vector backend option (vs LanceDB/sqlite-vec). Benchmark in Phase-2.

### B4. ragflow — `infiniflow/ragflow` ✅
- **URL:** https://github.com/infiniflow/ragflow | **Docs:** ragflow.io/docs
- **What:** Open-source RAG engine on **deep document understanding**: advanced parsing, template-based chunking, **GraphRAG**, agentic RAG workflows, hybrid retrieval.
- **Fit:** the chunking/GraphRAG ideas upgrade our ingestion (doc 01/16). Template chunking + OCR beat naive recursive splitting.

### B5. MindSearch — `InternLM/MindSearch` ✅
- **URL:** https://github.com/InternLM/MindSearch | **Paper:** arxiv.org/abs/2407.20183
- **Architecture:** **planner + searchers** — a multi-agent system decomposes complex queries, runs simultaneous multi-query web searches, aggregates findings. "Mimics human minds" for deep search.
- **Fit:** our deep-research orchestration (doc 07) — planner/searchers decomposition is the mechanism.

### B6. SeekStorm — `SeekStorm/SeekStorm` ✅
- **URL:** https://github.com/SeekStorm/SeekStorm
- **What:** Sub-millisecond native **vector + lexical** search, in-process Rust library + multi-tenant server. Apache-2.0, production since 2020.
- **Fit:** hybrid-search backend candidate (doc 20). BM25 + vector in one engine.

### B7. AutoGPT — `Significant-Gravitas/AutoGPT` ✅
- **URL:** https://github.com/Significant-Gravitas/AutoGPT | **Platform:** platform.agpt.co
- **What:** AI agent platform — describe task, it builds/runs/monitors the agent. OSS platform server + agent framework.
- **Fit:** pattern reference for long-horizon goal loops (doc 03). Not a component.

### B8. openai-agents-python — `openai/openai-agents-python` ✅
- **URL:** https://github.com/openai/openai-agents-python | **Docs:** openai.github.io/openai-agents-python
- **SDK structure:** **Agents** (instructions, tools, guardrails, handoffs), **Sandbox agents**, **Realtime/Voice agents**, built-in **Tracing, Sessions, Handoffs**. Provider-agnostic (OpenAI + 100+ via LiteLLM-compatible).
- **Fit:** a proven agent-loop reference — the handoff + guardrail primitives map to our orchestration (doc 03/05).

### B9. deepagents — `langchain-ai/deepagents` ✅
- **URL:** https://github.com/langchain-ai/deepagents | **Docs:** docs.langchain.com/oss/python/deepagents
- **What:** Batteries-included agent harness — opinionated defaults tuned for long-horizon, multi-step work; extensible, model-agnostic.
- **Fit:** the "crisp profile" planning pattern (doc 03/05) — reference.

### B10. agentmemory — `rohitg00/agentmemory` ✅
- **URL:** https://github.com/rohitg00/agentmemory
- **What:** Persistent memory for coding agents (Claude Code, Cursor, Copilot CLI, Gemini CLI, Codex, Hermes, OpenClaw, pi, OpenCode, any MCP client) built on the **iii engine**. "Your coding agent remembers everything."
- **Fit:** the **MCP memory-server pattern** is exactly our memory-via-MCP story (docs 03/13). Read its memory-server implementation.

### B11. khoj — `khoj-ai/khoj` ✅
- **URL:** https://github.com/khoj-ai/khoj | **Docs:** docs.khoj.dev
- **What:** "AI second brain" — personal AI that answers from your notes/docs; **RAG + agents**, self-host via Docker or PyPI.
- **Fit:** RAG + personal-memory reference (our core-memory pillars, doc 08).

### B12. CopilotKit — `CopilotKit/CopilotKit` ✅
- **URL:** https://github.com/CopilotKit/CopilotKit | **Docs:** docs.copilotkit.ai
- **What:** Build agent-native apps on any framework/surface (React, Angular, Vue, RN). **Generative UI, shared state, human-in-the-loop workflows**, CoAgents, useCoAgent.
- **Fit:** our UI agent-canvas + generative-UI reference (the React-component-rendering pattern).

### B13. agenticSeek — `Fosowl/agenticSeek` ✅
- **URL:** https://github.com/Fosowl/agenticSeek
- **What:** **100% local, private Manus alternative** — voice-enabled; autonomously browses web, writes code, plans tasks; **local reasoning models, zero cloud dependency**.
- **Fit:** direct competitor/reference for our local-first agent. Check its local toolset + voice layer.

### B14. maxun — `getmaxun/maxun` ✅
- **URL:** https://github.com/getmaxun/maxun | **Site:** maxun.dev
- **What:** No-code platform — "turn any website into a structured API": real-time scraping, crawling, search, AI data extraction (record a flow → API).
- **Fit:** the visual scraping-recording UX could inspire our scraping onboarding (doc 06).

### B15. Scrapegraph-ai — `ScrapeGraphAI/Scrapegraph-ai` ✅
- **URL:** https://github.com/ScrapeGraphAI/Scrapegraph-ai | **Site:** scrapegraphai.com
- **What:** "You Only Scrape Once" — **graph-pipeline scraping**: build a scraping graph (nodes = fetch/parse/extract), no manual selectors; LLM-driven.
- **Fit:** the graph-pipeline idea extends our extraction tier (doc 06); local models supported.

### B16. Agent-Reach — `Panniantong/Agent-Reach` ✅
- **URL:** https://github.com/Panniantong/Agent-Reach
- **What:** "Give your AI agent internet with one click" — auto-selects/installs/inspects the best web-access integration; adapts as access methods evolve.
- **Fit:** our "free web access onboarding" reference (doc 06) — auto-integration-selection UX.

### B17. gemini-cli — `google-gemini/gemini-cli` ✅
- **URL:** https://github.com/google-gemini/gemini-cli | **Docs:** geminicli.com/docs
- **What:** Open-source terminal AI agent for Gemini: **Google Search grounding, file ops, shell execution, interactive agent loop, MCP support**, built-in tools. npm `@google/gemini-cli`.
- **Fit:** CLI-agent reference (doc 05) + cc-switch BYOK target.

### B18. googleworkspace/cli — `googleworkspace/cli` ✅
- **URL:** https://github.com/googleworkspace/cli
- **What:** `gws` CLI for humans + agents — **dynamically reads Google Discovery Service at runtime** (all Workspace APIs: Drive/Gmail/Calendar), structured JSON output, **40+ built-in agent skills**.
- **Fit:** our Gmail/Calendar/Drive native connector (doc 13) — runtime API discovery + agent skills = zero OAuth plumbing.

### B19. cc-switch — `farion1231/cc-switch` ✅
- **URL:** https://github.com/farion1231/cc-switch
- **What:** **Tauri-based all-in-one manager** for Claude Code, Claude Desktop, Codex, Gemini CLI, Grok Build, OpenCode, OpenClaw, Hermes Agent — provider/key switching + per-tool config.
- **Fit:** the per-tool config-location map for our BYOK onboarding UX (doc 19 §6). Tauri-based = our own stack.

### B20. Open Interpreter — `OpenInterpreter/open-interpreter` ✅
- **URL:** https://github.com/OpenInterpreter/open-interpreter | **Docs:** docs.openinterpreter.com
- **What:** Coding agent optimized for low-cost models; terminal code execution, Codex-like interface, **`--os` mode** (OS control: screen + click).
- **Fit:** terminal-code-exec reference (doc 09); computer-use `--os` is a future pillar.

---

## C. Skills repos (deepened)

| Repo | URL | Deep-dive |
|---|---|---|
| **anthropics/skills** | https://github.com/anthropics/skills | Contents: `.claude-plugin`, `skills/`, `spec/`, `template/` — the **Agent Skills standard** (agentskills.io). SKILL.md = folder of instructions/scripts/resources loaded dynamically. **Our Forge skill format should match this exactly.** |
| **superpowers** | https://github.com/obra/superpowers | Software-dev methodology on composable skills: spec → break design into readable chunks → implementation plan → **true red/green TDD + YAGNI**. Reference for our Forge TDD loop (doc 16). |
| **CL4R1T4S** | https://github.com/elder-plinius/CL4R1T4S | Full extracted system prompts/guidelines/tools from OpenAI, Google, Anthropic, xAI, Perplexity, Cursor, Windsurf, Devin, Manus, Replit + more. System-prompt design goldmine. |
| **marketingskills** | https://github.com/coreyhaines31/marketingskills | Marketing skills: conversion, copywriting, SEO, analytics, growth. Any Agent-Skills-spec agent. |
| **Anthropic-Cybersecurity-Skills** | https://github.com/mukul975/Anthropic-Cybersecurity-Skills | **817 skills, 6 frameworks, 29 security domains, 26+ compatible platforms** — the largest OSS cyber-skills library. For our cyber pillar (doc 03 §7). |
| **scientific-agent-skills** | https://github.com/K-Dense-AI/scientific-agent-skills | 158 scientific skills, 100+ databases, Agent-Skills standard; works in Cursor/Claude Code/Codex/Antigravity. |
| **Front-End-Checklist** | https://github.com/thedaviddias/Front-End-Checklist | Front-end quality system as review workflow — website + **MCP-compatible tools** + README. For our UI quality gates. |

---

## D. LibreChat feature list — README-verified ✅
- **Generative UI w/ Code Artifacts:** React/HTML/Mermaid rendered in chat (README-confirmed).
- **Image gen/editing:** GPT-Image-1, DALL-E (3/2), Stable Diffusion, Flux, or any MCP server; text-to-image + image-to-image.
- **Multimodal/files:** upload+analyze with Claude 3, GPT-4.5/4o, o1, Llama-Vision, Gemini; chat-with-files via Custom Endpoints, OpenAI, Azure, Anthropic, Bedrock, Google.
- **Web search:** content scrapers + **Jina reranking**.
- **Agents:** no-code assistants, marketplace, MCP, SKILL.md skills, subagents.
- **Code Interpreter API:** sandboxed Python/Node/Go/C/C++/Java/PHP/Rust/Fortran + file I/O (ClickHouse-backed).
- **Presets/context:** branching, message editing/resubmission, forking.
- **Note:** docs/ folder is NOT at repo root (404) — the docs live at docs.librechat.ai (web researcher stalled twice; reasoning-UI/resumable-streams/multi-tab-sync details verified from user's paste + README claims, not independently re-confirmed this pass).

---

## E. Status summary after this pass
| Bucket | Count | Status |
|---|---|---|
| ❌ NOT-DONE | 7 | ✅ all resolved (A1–A6 + LibreChat features in D) |
| ⚠️ PARTIAL | 24 | ✅ deepened (B1–B20 + C skills) |
| ✅ all resolved | — | All Stage-1 + Stage-2 items resolved in **doc 24** (Nebula/CAI → unconfirmed-explained; Hermes `run_agent.py` → refactored; trafilatura 6,415 + Ollama 177,889 API-confirmed; Jan Tauri **verified**; anomalyco → confirmed TS-rewrite home; PageIndex/microsandbox/nanobot/ruflo/LibreChat deepened). Still open: OpenWork (no repo), mksglu/context-mode fork |
