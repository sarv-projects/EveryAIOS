# 03 · Deep Research Engines — Architecture Deep-Dives

> The open-source deep research agent landscape, focused on: (1) search loop design,
> (2) keyless operation via SearXNG, (3) local-model capability.

---

## 1. dzhng/deep-research (30K+ ⭐, Node/TS) — The Viral One

**The algorithm (what made it famous):**
1. **Query decomposition** — generates a web of follow-up questions to narrow user intent.
2. **Breadth × depth scaling** — user sets how wide (number of parallel searches per round) and how
   deep (number of iterative refinement rounds). Recursively deep-dives.
3. Each round: search → read top results → synthesize learnings → generate next round of queries
   (narrower, based on what was found).
4. Produces a structured markdown report.

**Dependencies:** needs OpenAI + Tavily keys (not keyless out of the box — we'd swap in our cascade).
**What to steal:** the breadth×depth recursion + follow-up question generation. Graft onto our DR v2 engine.

## 2. langchain-ai/open_deep_research (LangGraph)

**Architecture:** LangGraph-managed long-running research loops. The model **writes dynamic research
plans**, reads dozens of web sources **concurrently**, and **continually checks its own drafts for
information gaps** (self-verification loop).

**What to steal:** the self-verification loop — the 2026 SOTA trick. After drafting, ask the model
"what's missing / what's unsupported?" and do another focused search round.

## 3. Perplexica (ItzCrazyKns/Perplexica, 35K+ ⭐) — Open-Source Perplexity Clone

- **Search pipeline:** SearXNG-backed (works with self-hosted SearXNG — keyless by default),
  similarity search over retrieved content, LlamaIndex under the hood.
- **Multiple modes** (web search, academic, YouTube, Reddit, etc.) — mode-switching UX.
- Local models supported via Ollama.
- **What to steal:** the mode-switching UX + SearXNG-first search.

## 4. gpt-researcher (assafelovic, 25K+ ⭐)

- **Loop:** plan → parallel search → iterate → write report. The classic research loop.
- Keyless mode exists (uses search providers you configure; SearXNG works).
- **What to steal:** the plan-search-write iteration structure (we have it in v2 already).

## 5. STORM (Stanford, stanford-oval/storm, 20K+ ⭐)

- **R2A workflow:** Retrieval-Augmented-Awareness-Reflection. Multi-perspective question asking,
  retrieval, then a reflection step to identify coverage gaps.
- **What to steal:** the explicit reflection/coverage-gap step (overlaps with self-verification).

## 6. MindSearch (InternLM, 8K+ ⭐)

- Agent search across 300+ APIs; multi-source orchestration; WebPlanner + WebSearcher agents.
- **What to steal:** WebPlanner/WebSearcher role split (a planning agent that fans out to search agents).

## 7. OpenDeepResearch (HuggingFace)

- Fully open-source deep research; explicitly supports **local models** (works with Ollama/vLLM).
- Validates the "local-model deep research" path for our desktop app.

## 8. owi (ByteDance) / Khoj / nano-graphrag

- **owi:** multi-agent orchestrator framework.
- **Khoj:** personal AI with deep research mode, self-hostable, RAG over user's own docs.
- **nano-graphrag:** graph-RAG research mode — knowledge-graph powered research (aligns with our KG).

## 9. DeerFlow (bytedance/deer-flow, **79.6K ⭐**, MIT) — Most Relevant New One

**Architecture (verified):** LangGraph-based SuperAgent harness. A **Lead Agent** coordinates tools,
sandboxes, persistent memory, and **background subagents** through **ordered middleware chains**
(`TodoListMiddleware`, sandbox lifecycle, context summarization, memory extraction). Research loop =
plan → search (Tavily/InfoQuest/DDG) → read (Jina/Firecrawl/Crawl4AI) → **execute code in sandboxes**
(AioSandbox, Docker or local) → write, with outputs persisted to **virtual paths** like
`/mnt/user-data/outputs`. Model-agnostic — **fully local via Ollama/vLLM OpenAI-compatible endpoints.**

**What to steal (3 things):**
1. **`/mnt/user-data/*` virtual path translation** — sandboxed file execution mapped to predictable
   virtual paths. Pairs perfectly with our scoped-access permission model (virtual paths = permission boundaries).
2. **Ordered middleware chains** — cross-cutting concerns (workspace isolation, upload injection,
   memory extraction) as named middleware instead of spaghetti in the agent loop. Our WorkflowEngine is
   IR-based, not LangGraph — we don't need LangGraph, but the middleware *concept* ports directly.
3. **SSE event streaming to the UI** — structured step events so the desktop UI shows live
   research/coding progress. (AnythingLLM's `introspect()` narration is the lighter-weight version.)

**Skip:** LangGraph itself + their Python/FastAPI stack.

## 10. Data Analysis Agents (autonomous data science)

| Project | What it does | Steal |
|---|---|---|
| **DeepAnalyze (ruc-datalab)** | End-to-end autonomous data science: prep → clean → statistical modeling → chart visualization → analyst-grade report. Works on Excel/CSV/DBs/JSON/unstructured. | 🎯 Workflow schemas for our data-analysis tool |
| **AI Data Science Team (business-science)** | Multi-agent: cleaning/feature-engineering agent, EDA agent, modeling+charting agent. | Multi-agent division of labor |

---

## Synthesis — Deep Research v3 Recipe (for our app)

Take our existing **DR v2** (PLAN → RETRIEVE → DIVERSIFY → READ → CLUSTER → REPORT) and add:

1. **dzhng breadth×depth recursion** — iterative refinement rounds instead of single-pass.
2. **Self-verification loop** (open_deep_research) — draft, then check for gaps, then focused re-search.
3. **WebPlanner/WebSearcher role split** (MindSearch) — planner agent + parallel search agents.
4. **SSE step-streaming + token-counted narration** (DeerFlow + AnythingLLM) — live progress in UI.
5. **STORM reflection** — coverage-gap detection before finalizing.
6. **Research → memory/KG compounding** — save findings to KG so future research builds on past.
7. **Optional BYOK search boost** (Tavily research mode, Exa neural) — when user adds keys.
