# 20 — New Infra Libraries Ledger (requested 2026-08-06)

> New repos the user asked to research. URLs + what they are + how they fit our build. For the BYOK provider abstraction see doc 19.

---

## Desktop shell & core

### tauri — `tauri-apps/tauri`
- **URL:** https://github.com/tauri-apps/tauri | **Docs:** https://tauri.app
- **What:** Framework for building desktop (and mobile) apps — Rust backend + system webview. Our chosen shell (spec §2).
- **Fit:** the Tauri + Node-sidecar architecture is already spec'd; this is the framework itself.

### rust — `rust-lang/rust`
- **URL:** https://github.com/rust-lang/rust | **Docs:** https://doc.rust-lang.org
- **What:** The language. Reference for our long-term Rust core (OpenFang-style, doc 09/16).
- **Fit:** not a component — the foundation for the "Rust core later" path.

### ripgrep — `burntsushi/ripgrep`
- **URL:** https://github.com/burntsushi/ripgrep | **Docs:** docs.rs/rg
- **What:** Line-oriented regex search; respects .gitignore, skips hidden/binary. Fastest text search in its class.
- **Fit:** our code/repo search tool in the sidecar — grep/glob/read_file tool backend. Prefer `rg` binary over custom glob.

### rtk (Rust Token Killer) — `rtk-ai/rtk` ⚠️ IMPORTANT (user-flagged)
- **URL:** https://github.com/rtk-ai/rtk
- **What:** High-performance CLI proxy that **cuts up to 90% of bash output** that AI coding agents read (project-claimed figure) — token optimization for agent tool output.
- **Fit:** direct match for our token-reduction goals (doc 05 Reasonix `tool_result_snip_ratio`, doc 16). Steal the output-trimming approach: truncate/summarize tool stdout before it reaches the LLM.

---

## Workspace & files

### AFFiNE — `toeverything/AFFiNE`
- **URL:** https://github.com/toeverything/AFFiNE | **Docs:** affine.pro
- **What:** Local-first, privacy-focused Notion + Miro alternative — writing, drawing, planning in one canvas. (AFFiNE = AFFiNE Is Not Notion-But-Enhanced.)
- **Fit:** reference for our office/docs canvas UI (block-based editor, whiteboard); block-patch philosophy similar to GenOffice (doc 08).

### Factory-AI/vfs — `Factory-AI/vfs`
- **URL:** https://github.com/Factory-AI/vfs
- **What:** **SQLite-backed virtual filesystem for AI agents** — copy-on-write sandboxing, mountable via FUSE (Linux) / NFS. All agent state, created files, KV state, and recorded tool calls in ONE SQLite file.
- **Fit:** strong candidate for our sandboxed agent workspace — a single-file VFS gives isolation + audit + snapshot for free (matches doc 03's Forge sandbox + doc 09).

### microsandbox — `superradcompany/microsandbox`
- **URL:** https://github.com/superradcompany/microsandbox
- **What:** **Easy, fast, local microVMs for running untrusted workloads securely** (verified 2026-08-06, doc 23 §A4).
- **Fit:** the Forge sandbox backend (doc 03) — microVM isolation stronger than process-sandbox, lighter than full Docker. ✅ resolved (doc 24 §2.3): Rust core, SDKs in Rust/Python/TS/Go, CLI `msb`; validate boot latency + Windows/macOS licensing before committing.

---

## Browser & scraping

### rustwright — `Skyvern-AI/rustwright`
- **URL:** https://github.com/Skyvern-AI/rustwright
- **What:** **Rust rewrite of Playwright** — drop-in browser-automation library: in-process Rust CDP engine, ~2.55× faster, ~70% less memory, no Node driver, no Playwright automation fingerprint (alpha, Chromium-only).
- **Fit:** our Rust-core future could use rustwright instead of Playwright for the browser tier (doc 06) — faster + stealthier + less memory.

### LocalAI — `mudler/LocalAI`
- **URL:** https://github.com/mudler/LocalAI | **Docs:** localai.io
- **What:** Open-source local AI serving — OpenAI-compatible API for LLMs, embeddings, image/audio/vision on CPU/GPU, no GPU required.
- **Fit:** a bundled local-inference option for the app (like Ollama but broader: also embeddings + image). Alternative to Ollama for on-device serving.

### markitdown — `microsoft/markitdown`
- **URL:** https://github.com/microsoft/markitdown
- **What:** AutoGen team's utility: converts many file types (PDF, DOCX, XLSX, PPTX, images→text, audio, HTML, etc.) → Markdown, for LLM ingestion.
- **Fit:** our `core-files` extraction tier — a single converter for the RAG ingestion pipeline (complements AnythingLLM's per-type converters, doc 16 §1).

---

## Search engines (embedded)

### SeekStorm — `SeekStorm/SeekStorm`
- **URL:** https://github.com/SeekStorm/SeekStorm | **Docs:** seekstorm.com/docs
- **What:** Sub-millisecond native **vector + lexical** search — in-process Rust library + multi-tenant server. Apache-2.0, in production since 2020, Rust port 2023.
- **Fit:** alternative to LanceDB/sqlite-vec for local hybrid search (BM25 + vector in one engine) — worth benchmarking against what we've built.

### endee — `endee-io/endee`
- **URL:** https://github.com/endee-io/endee
- **What:** High-performance AI search & intelligence platform — AI search, RAG, semantic search, hybrid retrieval.
- **Fit:** evaluate vs SeekStorm for the local hybrid-search backend.

### qdrant — `qdrant/qdrant` (user-flagged important)
- **URL:** https://github.com/qdrant/qdrant | **Docs:** qdrant.tech
- **What:** Vector database written in Rust — high-performance ANN search, filters, hybrid (sparse+dense), embedded mode (`local` mode / Qdrant in-process).
- **Fit:** already referenced in docs (AnythingLLM vector DBs; Open WebUI external backend). Our local RAG could use Qdrant's embedded mode or stick with LanceDB — compare.

---

## Rapid table

| Repo | URL | Lang | What | Fit |
|---|---|---|---|---|
| tauri | github.com/tauri-apps/tauri | Rust | desktop shell framework | our shell |
| rust | github.com/rust-lang/rust | Rust | the language | foundation |
| ripgrep | github.com/burntsushi/ripgrep | Rust | fast regex search | grep tool backend |
| **rtk** | github.com/rtk-ai/rtk | Rust | 90% bash-output cut for agents | token reduction |
| AFFiNE | github.com/toeverything/AFFiNE | TS | Notion+Miro local-first | office canvas ref |
| **vfs** | github.com/Factory-AI/vfs | Rust | SQLite VFS, copy-on-write sandbox | agent workspace |
| microsandbox | github.com/superradcompany/microsandbox | ? | lightweight sandbox | verify |
| rustwright | github.com/Skyvern-AI/rustwright | Rust | Rust Playwright (2.5× faster) | browser tier future |
| LocalAI | github.com/mudler/LocalAI | Go | local OpenAI-compatible serving | on-device inference |
| markitdown | github.com/microsoft/markitdown | Py | files→Markdown | RAG ingestion |
| SeekStorm | github.com/SeekStorm/SeekStorm | Rust | sub-ms vector+lexical | hybrid search |
| endee | github.com/endee-io/endee | ? | AI search platform | hybrid search alt |
| qdrant | github.com/qdrant/qdrant | Rust | vector DB, embedded mode | local RAG option |

> **Top steals:** rtk (output token cut), vfs (single-file sandboxed agent FS), rustwright (browser automation for the Rust future), markitdown (universal file→md), SeekStorm (hybrid search).
