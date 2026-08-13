# 2026 AI Landscape — Research Archive Index

> **Purpose:** Permanent reference for all research conducted for the open-source desktop AI app
> (browser + chat + coding + research + reader + editor in one). Every repo, framework, architecture
> decision, and steal-list from the 2026 research sessions.
>
> **Date:** August 2026 · **Status:** Verified via GitHub API unless noted
>
> **⚠️ SUPERSEDED — historical archive.** This folder predates the desktop app (mid-2026 research). The live research is `../desktop_app/RESEARCH/` (docs 01–60, 247-repo ledger); several positions here were superseded by the hybrid decision — e.g. "Electron over Tauri" (00-INDEX §Doc Index) is **outdated**: the desktop app is Tauri/Rust shell + supervised Bun-compiled TS sidecar + Rust core (browser/CDP, script-eval, guards, audit, vault). Do not read this archive as current.

---

## Doc Index

| # | Doc | Covers |
|---|-----|--------|
| 00 | `00-INDEX.md` | This index |
| 01 | `01-master-landscape-2026.md` | **The complete master list** — every project researched, with stars/stack/license/verdict |
| 02 | `02-search-landscape.md` | Keyless web search (SearXNG, DDG, Wikipedia, HN, Jina, Marginalia...) + BYOK search APIs (Tavily, Exa, Brave, SerpAPI...) |
| 03 | `03-deep-research-engines.md` | Deep research agents: Perplexica, gpt-researcher, STORM, MindSearch, OpenDeepResearch, dzhng/deep-research, DeerFlow, DeepAnalyze |
| 04 | `04-desktop-apps-deep-dive.md` | AnythingLLM (full source-level dive), Jan, PyGPT, Leon, GenOffice, Vellum |
| 05 | `05-agent-os-computer-use.md` | Agent OSes (OpenFang, AIOS) + computer-use layer (Open Interpreter, Agent S, Browser Use, OpenWork) |
| 06 | `06-local-model-stack.md` | Ollama, Open WebUI, llama.cpp, LM Studio — local model runtimes & integration patterns |
| 07 | `07-composio-deep-dive.md` | Composio platform facts + what we already have in `core-connectors` |
| 08 | `08-automation-architectures.md` | Desktop automation scheduling options (in-app / tray / OS-level / hybrid) |
| 09 | `09-repo-reality-check.md` | 10-repo verification (which are real, actual stars, hallucination alert) |
| 10 | `10-steal-shortlist.md` | **What to steal, what to skip** — the consolidated action list |

---

## How to Read

1. Start with **01-master-landscape** for the overview of everything.
2. For any project you want to build against, jump to its section doc (02–06).
3. **10-steal-shortlist** is the "build this" action list distilled from all docs.
4. **09-repo-reality-check** documents which pasted repo claims were verified vs. hallucinated — re-verify anything you plan to depend on before integrating.

---

## Key Takeaways (TL;DR)

- **We already built ~70% of this** — keyless search cascade, deep research v2, 9 agents, memory + KG, 31 Composio toolkits, workflow engine, 6 safety mechanisms.
- The genuinely **new** additions for desktop: sandbox virtual-paths, SSE step-streaming, Ollama sidecar, You.com keyless provider, token-counted search narration, local SearXNG + Jina Reader OSS containers.
- **Electron over Tauri** for now (multi-tab webview browser is core).
- **Windows-first deployment** (65–71% market), **Linux-first development**.
- **Firecrawl is AGPL** — legal note if we ever go commercial; Jina Reader OSS is the self-hostable alternative.
- **Whoogle is dead** (archived Apr 2026); **Reddit .json keyless scraping is dead**; public SearXNG instances are mostly 403-blocked (hence our pool + circuit breakers).
