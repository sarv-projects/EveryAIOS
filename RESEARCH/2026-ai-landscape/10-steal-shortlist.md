# 10 · Steal-Shortlist — What to Build From, What to Skip

> Consolidated action list distilled from ALL research docs in this archive.
> Everything here maps to our desktop app vision: browser + chat + coding + research + reader +
> editor in one app, scoped filesystem access, BYOK, per-user Composio, subagents, beautiful UI.

---

## 🎯 Steal (build on these)

| # | Idea | Source | Where it fits |
|---|------|--------|---------------|
| 1 | **You.com keyless provider** + DDG-lite improvements | AnythingLLM | `core-search` cascade (new keyless tier) |
| 2 | **Token-counted `introspect()` narration** — "searching X… found 6 results (~1,400 tokens)" | AnythingLLM | Search/agent step streaming UI |
| 3 | **First-class citations UI** (`reportSearchResultsCitations`) | AnythingLLM | Research/chat message rendering |
| 4 | **Local SearXNG + Jina Reader OSS one-click containers** | Search landscape | Desktop local infra (zero-key search + extraction) |
| 5 | **Breadth×depth recursion + self-verification loop** | dzhng/deep-research + open_deep_research | Deep Research v3 |
| 6 | **WebPlanner/WebSearcher role split + STORM reflection** | MindSearch + STORM | Deep Research v3 architecture |
| 7 | **SSE step-streaming to UI** | DeerFlow | Agent/research progress UI |
| 8 | **`/mnt/user-data/*` virtual path translation** | DeerFlow | Scoped filesystem access (permission boundaries) |
| 9 | **Ordered middleware chains** (workspace, memory, context) | DeerFlow | WorkflowEngine cross-cutting concerns |
| 10 | **Ollama sidecar pattern** (detect/install, OpenAI-compatible) | Local model stack | Local model tier in BYOK router |
| 11 | **Context compression → ContextCompressor** | context-mode (ClawRouter) | Long-session memory/context |
| 12 | **GenOffice docx byte-preserving block-tree + file-parse** | GenOffice | "Replace editors" superpower (Office read/write) |
| 13 | **WASM tool sandbox + dynamic .so plugins** | OpenFang | Agent file/shell tool sandboxing |
| 14 | **AgentShield skill scanning → TrustLadder** | ECC | Skill security (prompt-injection defense) |
| 15 | **Vellum drop-a-folder plugin convention + SOUL.md/NOW.md personality** | Vellum + Palvia | Community skills + persona system |
| 16 | **Composio SDK in-app, per-user keys** | Composio (already integrated) | 30–50 managed SaaS connectors |
| 17 | **Browser Use DOM-compaction over our WebView** | Browser Use | Browser workspace automation |
| 18 | **Sandboxed code execution** (Job Object / Docker / local) | OpenHands + Open Interpreter | Coding workspace |
| 19 | **Hybrid automation: tray + OS-scheduler fallback** | Automation research | Automations |
| 20 | **Hyperframes HTML→video** | hyperframes | Automated content pipelines (later) |

## 🚫 Skip (explicitly)

| Thing | Why |
|---|---|
| **QEMU VM sandbox** (AnythingLLM open-computer) | Heavy; we sandbox tools natively instead |
| **Rust rewrite of the whole app** | TS monorepo already exists & works; Rust core later (Tauri/Slint) if perf demands |
| **GenOffice cloud lock / Vellum platform** | We're BYOK + open source |
| **Firecrawl as core extractor** | **AGPL-3.0** — legal risk for a commercial future; Jina Reader OSS instead |
| **LangGraph / LangChain dependency** | Our IR-based WorkflowEngine is our own; steal concepts only |
| **Whoogle / Reddit .json keyless** | Dead in 2026 |
| **Camofox stealth-browser claims** | Unverified marketing; we don't need stealth |
| **Open WebUI embedding** | It's a competitor product, not a component |

## ⚠️ Legal / licensing notes

- **Firecrawl = AGPL-3.0.** Fine for the open-source app; if we ever sell a closed/commercial edition,
  AGPL forces open-sourcing the whole app OR a commercial license. Note in our README.
- **hermes-agent = MIT** (225.8K ⭐) — "the agent that grows with you", self-improving; models Hermes 4.
- Most deep-research engines are MIT/AGPL — check per-repo before copying code (we're stealing concepts,
  not code, so low risk).

---

## Build Order Suggestion (from all research)

1. **Phase 0:** Desktop shell (Electron + TS monorepo reuse) + tray + settings UI
2. **Phase 1 (search):** You.com keyless + token narration + local SearXNG/Jina launchers
3. **Phase 2 (research):** DR v3 — breadth×depth + self-verify + SSE streaming + citations UI
4. **Phase 3 (local):** Ollama sidecar integration + context routing
5. **Phase 4 (files):** scoped-access path grants + GenOffice-style docx/pdf parsing
6. **Phase 5 (connectors):** Composio in-app per-user keys + MCP host
7. **Phase 6 (automation):** tray → hybrid OS scheduling
8. **Phase 7 (marketing):** "zero API key deep research" as the open-source hook

---

## ➕ 2026-09-04 addendum (doc 86, desktop_app/86-competitor-desktop-deep-dive-2026-09)

Top new steals: **Jan fit-pill + quant tiers + pause/resume** (A5) · **Jan backend-store + OS keyring + migrate** (A BYOK) · **Cherry provider drawer** (rotation + Fetch + health + capability flags) · **Cherry artifact-pane routing** (P4) · **Hermes error cards** (layer-named + 5 matched actions) · **Hermes Bot=profile + namespaced-cron routines + typed-reason DMs** (B/P6) · **opencode always-patterns + compaction budget formula** (J/P5) · **OpenWorker risk×mode floors + MCP-EXTERNAL** (J) · **OpenClaw ledger+flows+push + acpx shape** (B/F — add the cost carrier they lack) · **Cowork 3-mode approvals + shared home** (H) · **OpenChamber goals + multi-run/fusion + per-session cost** (B) · **Zed tool_permissions schema** (H) · **Crush LSP + Catwalk** (F) · **Codex Seatbelt/bwrap profiles** (E).

⚠️ License discipline (binding): Cherry = AGPL-3.0, Chatbox = GPL-3.0 (patterns only, never code); Crush = FSL-1.1-MIT, holaOS = Modified Apache 2.0, open-webui/computer = proprietary (observe only); opencode / open-cowork / hermes / AnythingLLM / Jan / OpenWorker / OpenChamber / OpenClaw = MIT-or-Apache (patterns OK with attribution).
