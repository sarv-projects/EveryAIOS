# 04 · Desktop Apps Deep-Dive — AnythingLLM, Jan, PyGPT, Leon, GenOffice, Vellum

---

## 1. AnythingLLM (Mintplex-Labs/anything-llm, 64K+ ⭐, Electron) — THE Deep-Dive

The closest thing to our vision (RAG + agents + MCP) — but **no memory algorithms, no KG,
no self-planning, no crystallization.** We'd be building the next evolution.

### 1a. Web Search Architecture (read from actual source)

Files: `server/utils/agents/aibitat/plugins/web-browsing.js` + `web-scraping.js`

- **LLM-triggered tool-calling, not always-on.** The agent gets ONE function called `web-browsing`
  (`description: "Search the internet for real-time information..."`). The LLM decides when to call it.
- Inside, a `switch(provider)` picks from **14 engines**: SerpAPI, SearchAPI, Serper.dev, Bing, Baidu,
  Serply, **SearXNG**, Tavily, **DuckDuckGo**, Exa, Perplexity Sonar, Brave, fastCRW, **You.com**.
- **The 3 genuinely keyless options:**
  1. **DuckDuckGo HTML scrape** — the *default* engine, no key (`html.duckduckgo.com/html`
     regex-parsed, with DDG redirect-URL decoding).
  2. **You.com keyless free tier** — `api.you.com/v1/agents/search` with no key, optional key for more.
  3. **SearXNG** — self-hosted instance URL.

### 1b. Smart patterns to steal

- 🔥 **`introspect()` narration** — every engine call announces itself: *"Using DuckDuckGo to search
  for..."* then *"I found 6 results — reviewing the results now. (~1,400 tokens)"*. Perplexica-style
  step-streaming UX, but **token-counted** (they run every result through tiktoken before LLM handoff).
- 🔥 **`reportSearchResultsCitations()`** — every result pushed to a citation list surfaced in the UI
  (`link://chunkSource`), with token count shown. Citations are first-class, not footnotes.
- **Keyless-by-default + keyed-upgrade** — proven in production by a 64K-star app.
- **`web-scraping` plugin** — CollectorApi (Firecrawl-backed) to fetch page text, then **summarizes if
  over token budget** — identical to our `executeFetchCascade`, validating our design.

### 1c. Agent plugin system (aibitat)

- `create-files` — agents can generate **.docx, .pdf, .pptx, .xlsx** files (relevant to our
  "replace editors" ambition).
- `filesystem` — full read/write/edit/search on local files.
- `sql-agent` — Postgres/MySQL/MSSQL.
- Gmail/Calendar/Outlook plugins.
- `create-scheduled-job` — cron scheduling.
- `memory.js`, `router-classifier` + `toolReranker` — tool routing/ranking.

### 1d. `open-computer` folder = QEMU VM sandbox

It's a git submodule of `qemu-project/qemu` with a Win10-themed virtual desktop — Mintplex's separate
project: AI agents operating a **virtualized OS** (QEMU) instead of your real machine.
**Worth watching, not copying** — QEMU is heavy.

### 1e. Desktop vs server

- `anythingllm-desktop` package wraps the same server in Electron; search/agents identical.
- **Our comparison verdict:** our `WebSearchCascade` is already more advanced (true cascade + 12-instance
  pool + circuit breakers + races vs. their single-provider switch). They beat us on: **You.com keyless,
  token-counted introspect narration, first-class citations UI.**

---

## 2. Jan (janhq/jan, 30K+ ⭐, Electron + React)

- Local-first AI assistant; manages models/engines (local via llama.cpp/Ollama + cloud providers).
- Built from scratch (not an AnythingLLM fork).
- **Steal:** local-model download/management UX; extension story.

## 3. PyGPT (szczyglis-dev/py-gpt, ~10K ⭐, Python/PySide6)

- Full-featured desktop AI assistant: agents, vision, voice, plugins, automation modes, web search.
- **Steal:** the feature-set checklist (what a "complete" assistant UI includes).

## 4. Leon (leon-ai/leon, 15K+ ⭐, Node core + Python skills)

- Personal assistant; skills are self-contained modules; web + messaging channels.
- **Steal:** skill-as-module architecture (each skill = installable package with its own logic).

## 5. GenOffice (genspark-ai/genoffice) — the "replace editors" reference

- **Stack:** Electron UI + **Rust sidecars**. xlsx import/export runs through in-house Rust sidecar
  (calamine + IronCalc). Verdict: real repo, MIT.
- **Key logic to repurpose:**
  - **Byte-preserving paragraph patch** — docx editing via block-tree structure, so it edits paragraphs
    without breaking the docx zip/XML (this is our "reads/writes Office files without breaking them"
    superpower).
  - **`file-parse`** — converts PDF/pptx/xlsx → compressed LLM-friendly markdown with index tags.
- **How to integrate:** skip the Electron shell; port the chunking rules + block-tree patching logic into
  our Rust backend (Tauri/Slint) or TS; replace their cloud AI-provider module with our own BYOK router.
- **Similar alternatives worth knowing:** docx4js, mammoth, Unstructured, marker-pdf.

## 6. Vellum (vellum-ai) — company/platform

- LLM orchestration platform (prompt engineering, workflows, evaluations). Open-source repos exist
  but are mostly small utilities — **not a framework to steal from.**
- **Steal:** the **drop-a-folder plugin convention** for community skills (their workflow/prompt-folder
  layout is a good community-skills convention).

---

## Desktop App Framework Verdict (from research)

- **Electron vs Tauri:** if multiple live browser tabs are core (they are), **Electron is the safer bet**
  today. Tauri/Slint = lighter but webview multi-tab is harder. Ship Windows-first later, Linux-first dev.
- **RAM note:** Electron tray background ~100–200MB idle; acceptable for v0.1.
