# 35 — Open WebUI · Vane · Open WebUI Computer (deep-dive)

> Added 2026-08-06 on user request: check `ItzCrazyKns/Vane`, `open-webui/open-webui`, and the pasted workspace pitch ("Files, chat, git and code on one screen… Codex, Claude Code, Cursor, Grok, OpenCode, Cline side by side… pick it up from your phone mid-run") — identified as **Open WebUI Computer** (pitch matches the `cptr` README/docs; a young 401★ repo, so treat as design validation — no independent confirmation from other marketing channels yet).
> Sources: repo READMEs + docs verified live this pass; Vane **source-read** via shallow clone (`/tmp/vane-deep`); Open WebUI structure map already in docs 15/18/26.
> **License discipline:** Open WebUI + Computer both report `NOASSERTION` (custom/complex licensing) → **learn the patterns (chunk-merge, artifacts UX, harness-driving), never copy code.** Vane is MIT (patterns + code-reference both fine).

> 🔗 **Repos:** https://github.com/open-webui/open-webui (148K⭐) · https://github.com/ItzCrazyKns/Vane (36K⭐, MIT) · Open WebUI Computer: https://github.com/open-webui/open-webui (the Computer workspace is the same repo as Open WebUI — see its `cptr` docs)

---

## A. Open WebUI — `open-webui/open-webui` (148K★, Python/FastAPI + Svelte/SvelteKit)

Already in corpus (doc 15 F6 🟦 map, doc 26 retrieval/ structure). This pass adds feature + architecture depth (docs.openwebui.com).

**Data locality (the pasted "keep chats, files, knowledge, logs, backups inside the region" pitch):**
- Fully self-hosted / offline-capable; SQLite by default (`backend/data/`), PG + PGVector for production; air-gapped with local Ollama.
- Knowledge exports as `.zip` of processed text; DB snapshot via volume mounts. In-region/air-gap is a first-class deployment story.

**Models (the pasted "local models, private in-region endpoints, approved providers" pitch):**
- Native Ollama/llama.cpp + any OpenAI-compatible endpoint (vLLM/TGI/LocalAI/Mistral/Anthropic/Gemini/Groq/enterprise gateways).
- BYOK pools + admin-managed global providers; **multi-model chat side-by-side** (parallel streaming) + ELO model-arena.

**RAG pipeline (worth stealing for C3):**
1. Extraction engines tiered: Docling, MinerU, Tika, PaddleOCR (8 total) — heavy-OCR only on demand.
2. **Chunking**: markdown-header-aware splitting + **forward-only chunk-min-size merging** (no noisy fragments, semantic context preserved) — a concrete algorithm we can lift for our `core-files` chunker.
3. **Hybrid search**: BM25 + vector with **cross-encoder rerank**; 13 vector DBs (Chroma/PGVector/Qdrant/Milvus/ES…); incremental directory syncing.

**UI / runtime (worth stealing for H1/H3):**
- **Artifacts side-pane**: Claude-Artifacts-style split preview (HTML/SVG/Three.js/D3) with **version selector** + live update — the UX our H1 "artifacts" should match.
- **Open Terminal**: agent gets a real shell (Docker container or bare-metal) — write code, install packages, run tests, launch dev servers. Mirrors our terminal/process surface (J7 + F10).
- **Pipelines**: Python plugin framework to intercept/filter/transform/route messages — equivalent of our Forge skills + B5 grammar hooks.

**Drop (server/webapp baggage):** multi-user RBAC/OIDC/LDAP/SCIM, FastAPI server orchestration (we're a single supervised-process desktop), Pyodide browser-sandbox code-exec quirks (we use native sandboxes).

**Steal list:** artifacts preview pane UX · markdown-aware chunking + chunk-min-size merge + cross-encoder hybrid rerank (C3) · `kb_exec`-style filesystem primitives (`ls`/`grep`/`cat` over the workspace → our read/grep tools + F9) · extraction-engine tiering (OCR only when needed).

---

## B. Vane (formerly Perplexica) — `ItzCrazyKns/Vane` (36K★, **MIT**, TypeScript/Next.js 16)

**Source-read this pass** (shallow clone): privacy-first AI answering engine (the self-hosted Perplexity alternative). Not a desktop app — a Next.js webapp — but its search-agent pipeline is textbook.

**Architecture:**
- Next.js App Router, SQLite (`better-sqlite3` + Drizzle ORM, `chats`/`messages` tables), SearXNG search backplane (`src/lib/searxng.ts` — JSON-format query, engine list, safesearch), Playwright + `@mozilla/readability` + JSDOM for scraping.
- **Provider abstraction** (`src/lib/models/providers/`): openai / anthropic / gemini / groq / ollama / lmstudio / lemonade / transformers — one registry, BYOK + local. Mirrors our core-providers design (A1).
- Streaming-parse robustness: `partial-json` + `@toolsycc/json-repair` for streamed tool JSON — a detail worth copying for B5 grammar-extraction.

**Search-agent pipeline (`src/lib/agents/search/`) — the steal:**
```
classifier.ts  → decides mode (speed/balanced/quality) + sources (web/docs/academic/reddit)
researcher/    → plan.ts + registry.ts of actions:
                   search / scrapeURL (readability-extract) / uploadsSearch (RAG over uploaded docs)
writer (src/lib/prompts/search/writer.ts)  → cited synthesis
```
This is exactly the deep-research loop doc 07 describes — Vane proves a working minimal implementation (G2).

**Features worth mapping:**
- **Search modes** Speed/Balanced/Quality = explicit depth/token-budget toggles → wires straight into our token economy (05) + G2.
- **Citations**: `Citation.tsx` + `src/lib/prompts/search/writer.ts` — inline source refs with per-claim backing; steal for G2 reports.
- **Widgets** (`src/components/...Widget*`): weather, stock (`yahoo-finance2`), math (`mathjs`), images/videos — inline interactive cards in chat. → NEW matrix H17.
- **File-upload RAG**: `pdf-parse` + `mammoth` + `officeparser` + `src/lib/utils/splitText.ts` chunking + `@huggingface/transformers` embeddings — lightweight ingest path (we have the heavier version already).
- **Local search history** in SQLite, Discover tab (curated trending).

**Not steal:** Next.js webapp packaging + Docker-first deploy (we're desktop); everything else maps onto existing rows.

---

## C. Open WebUI Computer — `open-webui/computer` (401★, Python, `cptr` CLI, license NOASSERTION) ← the pasted "real workspace" pitch

**Identified**: the marketing copy is Open WebUI Computer's (matches the cptr README/docs; see header hedge). Repo confirmed live: `pip install cptr && cptr run`. Docs: docs.openwebui.com/ecosystem/computer/. Young product (401★) — treat as **design validation**, not a dependency.

**What it is:** serves the user's *whole machine* to any browser (phone/tablet/laptop): files, terminal, editor, git, browser tabs, running sessions, AI agents, tools. "Your Computer. Anywhere."

- **The workspace (4 tabs, one screen):** Editor (real editor over real disk) · Files (browse/upload/preview the real workspace) · Terminal (run commands, stream output, send input, return later) · Git (review diffs, stage, commit) — all beside the AI agent.
- **Whole machine, no fakes:** real files, real shell, real processes, own GPU — **no browser sandbox, no containers, no repo clone, no credits ticking down**.
- **Multi-agent side-by-side:** Codex, Claude Code, Cursor, Grok, OpenCode, Cline, Pi — the user's *existing* subscriptions/logins, no separate keys, never boxed into one house agent.
- **Persistent sessions:** the session lives on the host, so you start at your desk and **pick it up from your phone mid-run** (LAN/Tailscale/Cloudflare Tunnel).

**Steal for our build (3 concrete):**
1. **Harness-driving (reverse of our F8)** → **NEW matrix F12**: we don't just install *our* tools into harnesses (F8) — we can also *drive the user's existing agent CLIs* (Codex/Claude Code/Cline/OpenCode/Grok/Pi) as side-by-side workers on the same workspace: each agent its own context, all sharing the real filesystem + session state, every action Trust-Ladder-gated + audited (pai-guard/pai-audit). Our F7 MCP server already lets those agents call *us*; F12 is the complement.
2. **Workspace tab layout (Editor · Files · Terminal · Git)** → validates our agentic-OS workspace: H5 office editors + P1 code editor + terminal panel + git panel beside Chat/Reader. A "Workspace" tab-group is the layout.
3. **Cross-device session pickup** → **NEW matrix H18** (⚪ later): our B2 resume-after-reboot + C8 E2E sync extend naturally to an opt-in LAN/Tailscale/tunnel remote view of running sessions.

**Not steal:** cptr's Python server architecture (our Rust core + sidecar covers the same surface natively with the dual-guard); web-first UX.

---

## D. Delta vs our locked matrix

| New row | What | Source | Status |
|---|---|---|---|
| **F12** | Harness-driving — run user's existing agent CLIs side-by-side on the same workspace (shared files/session, isolated contexts, Trust-Ladder + audit) | Computer | 🟡 |
| **H17** | Widget cards — weather/stock/math/lookup inline in chat | Vane | 🟡 |
| **H18** | Remote session handoff — LAN/Tailscale/tunnel, resume from phone mid-run | Computer | ⚪ |

Everything else maps onto existing rows: OpenWebUI artifacts→H1, chunk-merge+cross-encoder→C3, searxng client→G1, search modes→05/G2, citations→G2, extraction tiering→D5, filesystem primitives→F9, Open Terminal→J7/F10, multi-model side-by-side→A-series. **Ledger +143 repos (Open WebUI Computer), matrix 95→98.**
