# 08 — Desktop AI App Competitor Landscape (2026)

> Verified 2026-08-05 (GitHub API + docs). This is the "will we stand out?" + lightweight-benchmark pillar.

## The field (verified)

| App | Stars | Stack | Idle RAM | Standout | Gap we fill |
|---|---|---|---|---|---|
| Open WebUI | **148K** | Web (FastAPI+Svelte) | 200–500MB (container) | Gold-standard self-hosted frontend: RAG pipeline, RBAC, tools, Pipelines plugins | No native OS integration, no tray, no local-first desktop UX |
| Cherry Studio | **49.6K** | Electron+React+TS | 300–600MB | 300+ assistants, multi-provider incl. local, **MCP client+server installers**, WebDAV, themes | Chat-studio only — no deep RAG, no autonomous agents, no real editor |
| Jan | **43.9K** | ✅ **Tauri 2 VERIFIED** (doc 24 §1.5 — `src-tauri/tauri.conf.json` v0.8.4 exists, HTTP 200; root devDeps `@tauri-apps/cli`; workspaces core/web-app/extensions). Engine = llama.cpp | ~100–150MB + model (reported) | 100% offline, HF model manager, local OpenAI server :1337, MCP | No workspace/file RAG orchestration, no multi-agent, no editor/browser |
| Chatbox AI | ~30K | Electron | 250–400MB | Clean BYOK multi-model client, prompt branching | Pure wrapper — no agents, no memory layer, no tools |
| AnythingLLM Desktop | **64K** | Electron + Node | 400–700MB when indexing | Workspaces, RAG, agents, **Authenticated Scraping**, Magic Tab, MCP | Heavy Electron; no autonomous multi-agent orchestration, no computer-use |
| GenOffice | **1.7K** | Electron (5 apps) + **Rust sidecar** | 500MB–1GB | AI-native Office suite: byte-preserving docx round-trip, **Rust sidecar (calamine + IronCalc) for xlsx**, block-based patch engine, pdf.js+pdf-lib | Heavy; Windows/macOS only; not an agent platform |
| Vellum (assistant) | open-source, MIT | Native macOS/Web/iOS | Low | **Identity-driven personal assistant**: named persona + structured KB; **Credential Executor Service (CES)** — the model never sees keys, only requests actions; proactive pings via Telegram/Slack | macOS-centric; not a general-purpose agent OS |
| Ollama | ~90K | Go daemon | 50–100MB idle | Headless local runtime :11434, scriptable | Runtime only — needs a client |
| LM Studio | — | Electron | 300–500MB + model | The polished local-model UX, GGUF catalog, local server | Runtime only — needs a client |
| OpenWork | ~? (new) | TS/Electron | Electron-range | Open alternative to Claude Cowork; shared MCP control plane (`search_capabilities`/`execute_capability`) | Cowork-oriented, not an agent OS |
| OpenFang | **18.1K** | **Rust** | **~40MB idle, <200ms cold start, 32MB binary** | True agent OS: 53 tools, 40 channel adapters, 27 LLM providers, WASM fuel-metered sandbox, autonomous "Hands" on schedules | No rich desktop UI (Tauri app noted in docs); no memory algorithms / RAG depth |

## Key steals for our spec

1. **Local OpenAI-compatible server (Jan/Ollama/LM Studio pattern)** — expose `localhost` OpenAI-compatible endpoints so any tool (VS Code, Cursor) can reuse our engine. (Jan's Tauri move was **verified** 2026-08-06 — doc 24 §1.5.)
2. **GenOffice's Rust sidecar pattern for office files** — `calamine` (fast xlsx read) + `IronCalc` (formula eval) + **block-granular doc patching** (anchored block tree, surgical patches, byte-preserving round-trip). This is exactly the upgrade path for our reader/editor: instead of re-serializing whole files, patch blocks. (Our `core-files` already has `ooxml-extractors.ts` + renderers; add the editor side.)
3. **Vellum's CES (Credential Executor Service)** — the model requests actions; an isolated executor process with the keys performs them. This is a *process-level* upgrade over our vault: credentials never in the LLM context, even in tool args. Fold into spec P8 (add to security section).
4. **Cherry Studio's MCP installers UX** — "click to install MCP server" for filesystem/GitHub/web-search is the smoothest connector onboarding in the category. Steal for our unified tool registry.
5. **OpenFang's "Hands"** — pre-built background capability packages running on schedules/loops. Maps to our `core-automations` + watchers; the naming gives us a mental model for the tray daemon.
6. **Open WebUI's Pipelines** — arbitrary Python functions as first-class tools. Maps to our Forge skill registry.

## Competitive position (honest)

- **No one** combines: local-first lightweight shell + shipped memory algorithms + spec-driven multi-agent orchestration + dual-guard security + unified BYOK/Composio/MCP registry + free searxng-first research.
- Our moat = the **already-built engine** (docs 03/04) + packaging. Cherry/Jan/Chatbox are chat clients; AnythingLLM is a RAG vault; OpenFang is headless OS with no UX depth; GenOffice is office-only.
- Windows-first is right (65–71% desktop share); OpenFang and Vellum are our two most comparable philosophical rivals, and both are weakest exactly where we're strongest (UI depth / memory+privacy stack / cross-platform).
