# 07 — Deep Research & Autonomous Data Analysis Engines

> Verified 2026-08-05. Stars live. **This is the "deep research / data analysis" pillar — replacing Perplexity-class paid tools with free local loops.**

## The research engines (verified)

| Repo | Stars | Lang | Mechanism |
|---|---|---|---|
| dzhng/deep-research | **19.5K** | TS | Canonical recursive tree: user query → follow-up questions → breadth×depth search tree → per-node parallel searches → "learnings" extracted → recurse until depth=0 → cited markdown report. ~500 LoC, model-agnostic (defaults OpenAI, works on OpenRouter/Ollama). **The cleanest implementation to port.** |
| langchain-ai/open_deep_research | **12.5K** | Python | LangGraph: dynamic multi-section research *plan* → parallel search workers per section → draft + reflection/gap-check → targeted second-pass searches → final report. Top-tier on Deep Research Bench. |
| 0xmariowu/Autosearch (AutoSearchMCP) | ~2K | Python | MCP-native search layer: **40+ channels** (arXiv, PubMed, GitHub, SEC EDGAR, HN, Reddit, Chinese platforms), dedupe + source attribution → uniform markdown. Drop-in MCP server = instant multi-channel search. |
| ruc-datalab/DeepAnalyze | ~4.3K | Python | Autonomous data science: inspect file → plan → write pandas code → execute in sandbox (Docker/Jupyter) → read traceback → **self-correct** → analyst-grade report. The self-correction loop is the steal. |
| business-science/ai-data-science-team | **5,369** (verified 2026-08-06, doc 27) | Python | Multi-agent DS team (Loader/Cleaner/EDA/Feature/ML agents under a Supervisor) + Streamlit pipeline-studio with lineage. (⚠️ transferred from `LearningCircuit` org — old path 404s.) |
| LearningCircuit/local-deep-research | — | — | SearXNG + Ollama → recursive breadth/depth research **fully offline, zero API cost**. Proof that our searxng-first approach scales to research. |

## What to steal (concrete)

1. **Breadth/depth recursion (dzhng):** expose `Breadth 1–10 × Depth 1–3` sliders; parallel fan-out per node; collect "learnings" (not raw pages) up the tree. We already have `core-search` cascade + fan-out + `research-tiers.ts` — this pattern slots on top.
2. **Plan → parallel sections → gap-check (open_deep_research):** for long reports, draft a TOC first, assign sections to parallel workers, then a reflection pass hunts for missing citations and re-searches.
3. **Multi-channel search via MCP (AutoSearch):** 40+ channels is a config + adapters problem. Our connector architecture (`core-connectors`) + MCP client (`core-search/mcp-client.ts`) covers this — add arXiv/GitHub/EDGAR adapters.
4. **Self-correcting code execution (DeepAnalyze):** write → run in sandbox → parse stderr → fix → rerun. This is the same TDD loop as the Forge (spec P6) — one sandbox executor serves both data analysis and tool-building.
5. **Scheduled recurring research (AnythingLLM scheduled jobs):** "scrape competitor pricing every Monday 9AM" — we already have `core-automations` workflow engine + `cloudflare-server` watchers. Desktop = same engine, local scheduler.
6. **Contradiction resolution:** when sources conflict, flag + targeted secondary lookups (paste's idea, verified implementable via `core-memory/conflict.ts` + cascade re-search).

## The free-stack answer

`SearXNG (built) → tiered scrape (doc 06) → local embed (built) → breadth/depth loop (new, ~400 LoC) → synthesis with citations`. Entirely free, no API keys — this is the Perplexity-killer, and it's the one thing every competitor charges for.
