# 24 — Completion Pass: Stage-1 + Stage-2 Flags Resolved (2026-08-06)

> Round-2 verification pass. Every item previously flagged 🔴/🟠 was re-checked against live sources (GitHub API, raw files, docs sites). **Verdict per item below, with the evidence.** Tier-3 (doc-18 tier-2 repos) re-verified against live READMEs — code paths cited in doc 18 confirmed.

---

## 1. 🔴 Stage-1 hard flags — all resolved

### 1.1 Nebula + CAI (doc 03 cyber table) — ✅ BOTH CONFIRMED (pass 2, doc 25 §6)
- **CAI (Cybersecurity AI, "6.7K+, 300+ models")** — ✅ **CONFIRMED (pass 2, doc 25 §6): `aliasrobotics/CAI`** — offensive/defensive cybersecurity framework, **300+ models via LiteLLM** (incl. local Ollama air-gap), multi-agent assemblies, prompt-injection guardrails; PyPI `cai-framework`. (Pass-1 search used the wrong terms; the real repo was found via web research.)
- **Nebula** — ✅ **CONFIRMED (pass 2, doc 25 §6): `berylliumsec/nebula`** — AI pentest desktop workbench (`nebula-core`): terminal/editor/browser/AI assistant/file manager, scope enforcement, approval pauses, OCI-isolated execution, evidence trail.
- **NeuroSploit** — ✅ CONFIRMED: `JoasASantos/NeuroSploit` (Rust, ~1.3K⭐) — already listed correctly in doc 18 §3.
- **Deadend** — ✅ CONFIRMED: `straylabs-ai/deadend-cli` (Python, 288⭐, "Agentic pentest tooling, 81% on KIMI K2.5") — already in doc 18 §3.
- **Action taken:** doc 03 cyber table updated — NeuroSploit/Deadend/CAI/Nebula all marked ✅ confirmed with URLs (doc 25 §6).

### 1.2 Hermes `agent/run_agent.py` — ✅ RESOLVED: file refactored out of existence
- Raw fetch returns **404: Not Found** — the file no longer exists.
- The `agent/` dir listing (live, this pass) is real and large: `agent_init.py`, `agent_runtime_helpers.py`, `conversation_loop.py`, `turn_context.py`, `turn_finalizer.py`, `iteration_budget.py`, `subagent_lifecycle.py`, `context_compressor.py`, `prompt_caching.py`, `moa_loop.py` (Mixture-of-Agents), `memory_manager.py`, `learning_graph.py`, `credential_pool.py`, `secret_scope.py`, `tool_guardrails.py`, `file_safety.py`, `prompt_builder.py`, `web_search_provider.py`, `tts_provider.py`, `image_gen_provider.py`, `video_gen_provider.py`…
- `agent_init.py` docstring confirms: *"AIAgent.__init__ … Keeping it in run_agent.py bloats that file … After this extraction the body lives here as init_agent(agent, …)"* — i.e., **Hermes was refactored** (verified). Per the file structure, orchestration appears to live in `conversation_loop.py` + the turn/iteration files (⚠️ filename-based inference — `conversation_loop.py` contents not source-read this pass). Doc 14 §A updated to the real file names.
- **Steal:** the refactor itself is instructive — 60+ param `__init__` split into `init_agent()`; turn lifecycle split across `turn_context/turn_finalizer/turn_retry_state`; per-domain registries (`web_search_provider/registry`, `tts_provider/registry`, `image_gen_provider/registry`).

### 1.3 trafilatura stars — ✅ API-CONFIRMED: **6,415** (Python, default branch `master`) — doc 06 updated (was "~5–8K unverified").

### 1.4 Ollama stars — ✅ API-CONFIRMED: **177,889** (Go, `main`) — doc 11 updated (was "~90K+ unverified").

### 1.5 Jan "moved to Tauri" claim — ✅ **VERIFIED** (was "unverified this pass")
- Root `package.json` (live): devDeps include **`@tauri-apps/cli`**; scripts: `"dev": "yarn dev:tauri"`, `"build": "yarn build:web && yarn build:tauri"`, `"ios": "yarn tauri ios dev"`, `"android": "yarn tauri android dev"`.
- **`src-tauri/tauri.conf.json` EXISTS (HTTP 200)**: `"$schema": "…/tauri.app/config/2"` (Tauri 2), productName "Jan", version **0.8.4**, identifier `jan.ai.app`, `frontendDist: ../web-app/dist`.
- Monorepo workspaces: `core`, `web-app`, `extensions/*`. **Jan is now a Tauri 2 app.** Doc 08 updated.

---

## 2. 🟠 Stage-2 "appears / vendor-claimed" — all deepened

### 2.1 anomalyco/opencode — ✅ RESOLVED: it IS opencode's current home, and it's been rewritten (TS/Bun, not Go)
- Full README + package.json fetched: "The open source AI coding agent", `npm opencode-ai`, `brew install anomalyco/tap/opencode`, install from opencode.ai — **same product lineage**.
- **Stack change (important):** Bun 1.3.14 monorepo — per `package.json` scripts/workspaces: `packages/opencode`, `packages/desktop`, `packages/app`, `packages/console/app`, `packages/stats/app`, `packages/storybook`), `oxlint`, `bun turbo` — **the old Go/bubbletea codebase is gone; this is a TypeScript rewrite**, and it now ships **`packages/desktop`** (a desktop app) + web + console.
- Relationship: `opencode-ai/opencode` (archived, Go) = old home; original author's continuation = `charmbracelet/crush`; `anomalyco/opencode` = the active product home (rewritten). Both prior readings were true; the hedge can now be upgraded to "confirmed home" for the *product*, with the Go→TS rewrite noted.
- Docs 05/14/23 updated accordingly.

### 2.2 PageIndex (vectorless RAG) — ✅ RESOLVED: mechanism code-verified (still ⚠️ for scale claims)
- Repo structure (live): `pageindex/` package with **`page_index.py` (tree index build), `page_index_md.py` (markdown variant), `retrieve.py` (retrieval), `tree_optimize.py` (tree optimization), `client.py`, `config.yaml`, `flash/`**, plus `run_pageindex.py`, `examples/agentic_vectorless_rag_demo.py` (uses **OpenAI Agents SDK**), `cookbook/`, `tests/`.
- Demo confirms mechanism: **builds a hierarchical tree index** (document structure), agent tools `get_document()` / `get_document_structure()` / `get_page_content(pages="5-7")`; agent **navigates the tree and fetches tight page ranges** — "no vector similarity search and chunking". `tree_optimize.py` suggests the tree is optimized (page-range locality).
- **The core claim is demo- and structure-verified** (the agentic demo + package layout show no embeddings/chunking in the retrieval path); ⚠️ `retrieve.py`/`page_index.py` internals are **not yet source-read** — treat the "no vector math" claim as project-verified, not independent code-verified. Scale validation still pending ("millions of documents" is vendor-published). **Verdict: adopt the pattern for our retrieval pillar's *agent-navigable document index* layer; keep HNSW for corpus-wide recall.**

### 2.3 microsandbox — ✅ RESOLVED (mechanism-level)
- Confirmed: **Rust core** (Cargo.toml, .rustfmt.toml), **SDKs in Rust/Python/TS/Go** (`cargo add microsandbox`, `uv add`, `npm i`, `go get …/sdk/go`), CLI `msb` + `npx microsandbox run debian`, install script, `Dockerfile.agentd`, Apache-2.0.
- Positioning: "untrusted workloads … AI agents, user code, plugins, CI jobs, dev environments, scrapers, automation" with **hardware-level microVM isolation**. (Hypervisor backend — **RESOLVED 2026-08-06: libkrun** — `msb_krun = "=0.1.25"` pinned in Cargo.toml; README credits libkrun + smoltcp; Rust SDK `Sandbox::builder(...).create()` boots a microVM as a child process — doc 39 §B2.)
- **Verdict: strong Forge-sandbox candidate (doc 03/20); validate boot latency + cross-platform story (Windows/macOS licensing) before committing.**

### 2.4 nanobot — ✅ RESOLVED: confirmed Python agent/bot framework (not an OS)
- PyPI `nanobot-ai`, docs at **nanobot.wiki** (11 languages), install from PyPI/uv/source, task-oriented guides, "Start Without Technical Background" — a **compact, beginner-friendly agent/bot library** by the HKUDS lab. Not OS-relevant; low adoption priority. Doc 21/23 updated.

### 2.5 ruflo — ✅ RESOLVED: confirmed Rust-based agentic flow framework
- Structure (live): **Cargo.toml (Rust)**, `SKILL.md`, `.claude-plugin`, `CLAUDE.md`, `.harness`, `agentdb.rvf` (+ lock), `npx ruflo`, Svelte UI beta at flo.ruv.io, ecosystem badges to ruvnet/claude-flow / goal.ruv.io / **ruvector** (agentic DB).
- **Verdict:** from the Cognitum agentic-engineering series; Rust core + Claude plugin + agent DB. Worth watching for its **agent-as-flow + skills** conventions; not a full OS. Doc 21/23 updated.

### 2.6 LibreChat feature list — ✅ RESOLVED: **independently confirmed from the live docs site**
- Docs live at **www.librechat.ai/docs** (Next.js/Fumadocs; NOT docs.librechat.ai root). Full doc tree extracted from the site payload this pass:
  - `features/artifacts` ✅ Code Artifacts
  - `features/resumable_streams` ✅ Resumable Streams
  - `features/image_gen` ✅ + `configuration/tools/flux`, `configuration/tools/stable_diffusion`, `configuration/tools/gemini_image_gen`
  - `configuration/stt_tts` ✅ Speech
  - `features/subagents`, `features/skills`, `features/agents`, `features/agents_api`, `features/memory`, `features/mcp`, `features/code_interpreter`, `features/ocr`, `features/web_search`, `features/rag_api`, `features/search`
  - `quick_start/custom_endpoints` — "Connect Ollama, Deepseek, Groq, and more"
  - `configuration/pre_configured_ai/{anthropic,bedrock,google,openai,assistants}`
  - LibreChat **joined ClickHouse** (banner: "power the open-source Agentic Data Stack") — relevant to our infra thinking.
- ⚠️ Scope note: the **doc pages were confirmed to exist** (slug list extracted from the site payload) — the pages' *implementation details* were not re-read this pass (doc 23 §D caveat stands). Doc 23 §D updated.

---

## 3. 🟡 Tier-3 re-verification (doc-18 tier-2 repos) — README claims re-verified (code paths remain doc-18-cited, not re-listed this pass)

- **Frameworks:** CrewAI (multi-agent orchestration, crewai.com), AutoGen (0.2 logo/README + evolving v1), MetaGPT ("Enable GPT to work in a software company"), Agno ("framework and runtime for agent platforms") — all live; doc 18 code paths (`src/crewai/`, `metagpt/roles/`, `python/packages/autogen-agentchat/`) consistent with repo structure.
- **openai-agents-python bonus:** `src/agents/` now contains **`computer.py`, `editor.py`, `apply_diff.py`, `agent_tool_state.py`** — the SDK ships computer-use + editor/diff tools natively (relevant to our OS-work pillars).
- **Desktop apps:** Cherry Studio, Chatbox ("Community Edition… Ultimate AI Copilot on the Desktop"), PyGPT (2.7.12), Leon, Vane, Open WebUI, **GenOffice ("five Electron apps sharing one engine layer")** — all live; doc 18 maps hold.
- **Cyber:** NeuroSploit (1.3K⭐, Rust), Deadend (288⭐, Python) confirmed via GitHub search; PentAGI/PentestGPT/HexStrike/PyRIT/Vulnhuntr URLs already correct in doc 18.
- **Business tools:** all 9 (AutoHedge, Vibe-Trading, claude-ads, NotFair, FinceptTerminal, Agentic Inbox, ClawRouter, Open-Generative-AI, Hyperframes) — doc 10/18 entries stand (live star counts in doc 10).
- **Still open (pass 2, doc 25):** **none** — OpenWork (`different-ai/openwork`), `mksglu/context-mode` (repo + npm), CAI, Nebula all ✅ CONFIRMED. Remaining are *empirical* not research gaps: PageIndex scale validation, microsandbox boot-latency/platform licensing, LibreChat page-content re-read, Hermes `conversation_loop.py` full read (heads only).

---

## 4. Doc-update map (this pass)
| Doc | Change |
|---|---|
| 03 | Cyber table: CAI/Nebula → unconfirmed; NeuroSploit/Deadend → confirmed w/ URLs |
| 05 | anomalyco/opencode hedge → upgraded to confirmed home (TS rewrite noted) |
| 06 | trafilatura stars → 6,415 (API) |
| 08 | Jan Tauri claim → VERIFIED (tauri.conf.json v0.8.4, Tauri 2, src-tauri/) |
| 11 | Ollama stars → 177,889 (API) |
| 14 | Hermes loop: run_agent.py 404 → refactored; real file set listed; anomalyco upgraded |
| 18 | §6 notes updated (Nebula/CAI resolved-as-unconfirmed) |
| 21 | PageIndex/microsandbox/nanobot/ruflo flags → resolved (→ doc 24) |
| 23 | Status table → all Stage-1/2 resolved; still-open list reduced to OpenWork + context-mode fork |
| 24 | (this doc) |
| 25 | Deep-code gap resolutions (pass 2): PageIndex internals source-read (cost-model tree + injection hardening), LibreChat doc content read, Hermes loop confirmed, microsandbox krun hypervisor, anomalyco desktop = Electron; **CAI/Nebula/OpenWork/context-mode all found** |
| 26 | Tier-2 code-level upgrade: live structure maps for all ~30 tier-2 repos (doc 18) |
