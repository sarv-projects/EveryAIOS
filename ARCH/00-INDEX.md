# ARCH — The Desktop Agentic-OS Architecture (8 Full-Stack Modules)

> **Status:** Architecture reference. It works alongside the master spec `../DESKTOP-APP-SPEC.md`; this ARCH series defines architecture boundaries, module ownership, and diagrams. Function identity is mirrored in `09-FEATURE-MATRIX.md`; historical decisions are recorded in `../SPEC-CHANGELOG.md`. Delivery status remains in `../TODO.md`.
> **The 8 Full-Stack Modules Architecture:** EveryAIOS is structured into 8 cohesive Full-Stack Modules, each spanning native Rust kernel logic, TypeScript coordination, and React 19 cockpit surfaces. EveryAIOS rejects the proprietary coding agent trap and operates as the **Universal Agentic OS & Desktop Harness**, driving external specialist agents (Claude Code, OpenAI Codex, OpenCode, Grok Build) while providing native Office primitives, tiered browsers, computer use, durable worktrees, and 7-layer Guard-2 security.
> **Docs:** 00–17 define the architecture, module layout, security, routing, memory, caching, office, browser, MCP, algorithms, repository map, UI surfaces, prompt anatomy, connector store, the chat-loop Rust port scope, and **17 = the frozen Native agent plane (two-plane model + tool/agent schema catalog)**.
> **Decision (user-confirmed):** **Hybrid & Decoupled** — the `@personal-ai/core-*` TypeScript engine stays as a supervised Bun-compiled sidecar; a **Rust layer owns the paths where research proved Rust wins**: browser/CDP control, script-eval sandbox (rquickjs), security guards, audit/replay ingest, **storage intelligence** (`everyaios-storage`), IronCalc spreadsheet recalculation (`everyaios-office`), and memory graph (`everyaios-memory`). External coding agents run decoupled as out-of-process ACP stdio children.

## The 8 Sublimated Full-Stack Modules

1. **Module 1: Universal Agent Harness & Swarm Orchestrator** — External agent driver (ACP stdio JSON-RPC), multi-run fan-out (up to 5 parallel models), Git worktree isolation (`worktrees.rs`), shadow preflight, 3-way merge fusion, and task DAG circuit breakers. Cockpit: `agents` dashboard, dynamic Chief dropdown, right-rail `diff` viewport.
2. **Module 2: Model Gateway & Encrypted Keyring Vault** — SQLCipher AES-256 vault, BYOK credential broker (OpenAI, Anthropic, Bedrock, Vertex, OpenCode Zen/Go/Free, local GGUF/Ollama), multi-key rings with 429-only failover, 4h models.dev catalog sync. Cockpit: `settings` Providers & Keys tab, `guard.html` unlock modal.
3. **Module 3: Unified Cockpit Shell & Context Compaction Engine** — React 19 + Tailwind 4 shell, 12-segment cache-affine prompt assembler (`CACHE_BOUNDARY`), token budget compaction (50KB cap, pass-by-ref), 33ms batched streaming, 37 Tauri command modules. Cockpit: multi-control composer, CoT rollup, 19 right-rail viewports.
4. **Module 4: Governed MCP & Capability Marketplace** — JSON-RPC 2.0 MCP client/server (stdio & SSE), tool schema validation, Guard-2 ticket interception, curated MCP marketplace. Cockpit: `connectors` screen, per-agent tool scoping drawer.
5. **Module 5: Work-Native Primitives (Office, Browser, CUA)** — Embedded IronCalc 0.8.3 spreadsheet DAG recalculation (300+ functions), surgical OOXML part patcher (DOCX/XLSX/PPTX byte-preservation), tiered browser (Lightpanda + Chrome CDP + Scrapling + CloakBrowser), OS Computer Use (Windows Graphics Capture, A11y tree, Win32 `SendInput`). Cockpit: right-rail `office-xlsx`, `office-docx`, `office-pdf`, `browse`, `desktop`.
6. **Module 6: Durable Work & Cognitive 5-Tier Memory Subsystem** — Crash-resilient session ledger, task checkpoints, 5-tier memory (Working, Episodic, Semantic FTS5, Procedural skills, Entity Knowledge Graph), ACT-R mathematical cognitive activation ($A_i = B_i + \sum W_j S_{ji}$), tree-sitter repo-map. Cockpit: `memory` screen, `projects` & `files` screens, right-rail `graph`.
7. **Module 7: Executive Automations & 24/7 Calendar Daemon** — 24/7 background scheduler evaluating 5-field crons, heartbeat lease model, sleep-prevention during active runs, bidirectional calendar sync (Google, Outlook, iCal), meeting prep workflows. Cockpit: `automations` screen, `calendar` screen, right-rail `terminal`.
8. **Module 8: Security Guard-2 & Merkle Audit Membrane** — 7-layer defense: prompt injection J6 `<user_document>`, zero-I/O SSRF `netfloor`, lexical `pathfloor`, Guard-2 TTL authorization tickets, OS sandboxes (Job Objects, bwrap, Seatbelt), Merkle tree audit log. Cockpit: `guard` dashboard, `activity` audit viewer, isolated Guard approval diff cards.

## Reading order

> **Product invariants (from SPEC §1 — every ARCH doc must preserve them):** one project = one folder + one session tree · one effect-authorization model (ARCH/06 §6.10) as the mutation gate — agent/automation = `AuthorizationTicket`, human UI = trusted native gesture, both on the one audit · one append-only event log (doc 53's 10 event types) · one Progress timeline that tabs/panels disclose rather than duplicate.

1. **01-SYSTEM-ARCHITECTURE.md** — processes, layers, IPC, lifecycle, and the 8 Full-Stack Modules (the map)
2. **02-MODULE-LAYOUT.md** — Rust crates + TS packages, ownership mapped to the 8 Modules
3. **03-BYOK-KEYRINGS.md** — multi-key per provider, **429-only** failover (5xx does not rotate), 4h models.dev catalog, OpenCode custom inference, **OpenCode Zen / Go / Free** (three rows), OAuth subscriptions
4. **04-OFFICE-ENGINE.md** — open + edit Word/Excel/PPT/PDF (surgical, byte-preserving, IronCalc DAG)
5. **05-TOKEN-ECONOMY.md** — input control: prefix-cache, compaction, snip, budgets, crystallization
6. **06-SECURITY-GUARDRAILS.md** — trust ladder, dual-guard, sandboxes, ownership, audit, injection defense
7. **07-MEMORY-CONTEXT.md** — 5-tier memory, 7 algorithms, multi-scope, SOTA retrieval, ACT-R activation
8. **08-BROWSER-LAYER.md** — tiered CDP Browse (Lightpanda + Chrome CDP + stealth). E9 computer use is the real OS (vision + A11y + DAG)
9. **09-FEATURE-MATRIX.md** — the complete submodule & function matrix
10. **10-BUILD-PLAN.md** — phases with exit criteria
11. **11-AI-CHAT-FEATURES.md** — AI chat derivation: copy (from APP engine + Hermes/etc.), convert, reject
12. **12-UI-SPEC.md** — UI/UX specification **v3.10**: Windows-first runtime provenance + two-pane agent picker + agent-owned models + session function loadout; rail Folder/Shell/Browse/**Computer use**/Code + Office flyout; CUA see-pane + vision modal + DAG on Progress
13. **13-PROMPT-ANATOMY.md** — the assembled desktop prompt (`packages/coordinator/src/prompt.ts`): identity/persona scanned before insertion, third-party retrieval as data-only content, `<user_document>` delimiting, byte-stable prefix above `CACHE_BOUNDARY`, prompt-is-not-permission (P1.5)
14. **15-CONNECT-STORE.md** — the Connect Store (v1.0, 2026-08-29): the curated "click → sign in → use" connector surface — remote MCP + OAuth 2.1 (`everyaios-mcp::store`), device-flow/loopback PKCE for the big four (GitHub/Google/Microsoft/Slack), Guard-2 consent payloads (`ConnectConsent`), first-class remote MCP via `remote_plan`
16. **spec §4.5** — `CapabilityBackend` (Local / Wsl / Remote); H36 terminal profiles; user-owned cloud slot. Not a new ARCH file — lives in the spec.
17. **17-NATIVE-AGENT.md** — **frozen 2026-09-15 (spec v3.75; its rows B10/B11/C14/C15/F16/I14–I17 in v3.76; Settings Control Center in v3.77; Windows-first runtime/picker/cowork evidence contract in v3.78):** the EveryAIOS **Native agent plane** vs the **shared cowork plane** — the one invariant (native plane belongs to the agent; shared plane belongs to EveryAIOS), the capability-resolution policy (native-first, augmentation-second), the module-ownership map (one plane + one contract per module), the Chief loop and its edge cases, the **schema contract for every native tool (`RegisteredTool`), shared façade, agent type, sub-agent spec, prompt segment, routing rule, and Settings read model**.
18. **16-CHAT-LOOP-RUST-PORT.md** — SCOPE (2026-08-29, not implemented): porting `ConversationEngine.run()` + `runChatStream` to Rust — the verified scope is ~2,770 TS lines (engine.ts + chat.ts orchestration + prompt.ts 12-segment assembler) ≈ ~3,400 Rust + ~1,200 tests, because every I/O dep (broker, ToolService+Guard, MemoryService, gate/risk/plan/contract) already lives in Rust; M0–M4 migration with a keep-TS-behind-toggle cut-over + the two hard seams (P30.8 context-audit parity, A9 cache-affine byte-stability)
18. **research docs 49–51** — storage intelligence (49: eDirStat/UltraSearch/WinDirStat/fclones → `everyaios-storage` + matrix D9–D11/G7), generative UI/image/voice/email gaps (50: AG-UI → H25, A10, F14–F15, H26–H28, H15 ext), aider recheck (51: doc 46 corrections — edit formats ~9, providers 100+, "4.2×/71%" flagged third-party)
19. **research doc 52** — gap pass 2 (Aider-in-F12 + surgical hierarchy, J21 escalation rules & decision packages, D12 storage health, G8 tiered search cascade + Algorithm #33, E9/J14 refs; 26 repos live-verified, 8 hallucinated flagged → ledger 218)
20. **research doc 53** — formalization of 4 review gaps (credential broker, ticket contract, durable events + idempotency, shortest-path routing) → SPEC v3.10 + ARCH/06 §6.9–6.11
21. **research doc 54** — third-party dependency + catalog audit (LadybugDB confirmed → ledger 219; xxhash-rust BSL → twox-hash; `focus_window` verified rename-safe)
22. **research doc 55** — agent-browser ecosystem (Obscura source-verified 21K★, Lightpanda/Steel/CloakBrowser honesty passes) → P2.4/P2.5 refs, 3 repos → ledger
23. **research doc 56** — agentic dev-environments + closed-source agents (aider/opencode/Copilot CLI patterns) → P11.5.9/P12, 4 repos → ledger
24. **research doc 57** — ACP registry + subscription-auth boundary (official Claude ACP wrapper allowed; token harvest blocked) → F12/J17, 1 repo → ledger
25. **research doc 58** — repo batch 2 (OmniRoute provider/routing goldmine, taste-skill (I2≠C9), ppt-master/guizang, univer, codebase-memory-mcp, llmfit, GenericAgent, better-harness, holaOS competitor, worldmonitor, MAF, DeepSeek-TUI→CodeWhale correction) → A1–A7/I2/I5/I7/D3/H5/F12, 19 repos → ledger
26. **research doc 59** — OmniRoute source-level deep-dive (13-factor scoring + mode packs + budget headers + 19 strategies + provider taxonomy) → steal-spec for A2/A3/A6/A7/A9/P6.10/J11
27. **research doc 60** — TencentDB Agent Memory deep-dive (4-asset taxonomy + L0→L3 distillation + governance + agent-loadout) → C1/C2/C3/C7/C8/I2/I7 + F12/J17, 1 repo → ledger
28. **research docs 88–89** — the two 2026-09 provenance docs that drove the current UI/security queues: **88** casual-surface / first-five-minutes audit → **TODO P61**, **89** guard network-destination + agent-config floor audit (a code-level audit of this repo, not market research) → **TODO P62**. (Docs 61–87 are rowed in `RESEARCH/desktop_app/00-INDEX.md`; this list is a reading path, not the full corpus.)

## ADRs (accepted architecture decisions)

Decisions that used to live as monolithic blockquotes in `TODO.md`'s header
now live as numbered ADR files (Fix 2). Each is one decision + rationale +
consequences; `TODO.md` links them instead of duplicating the text.

| ADR | Decision |
|---|---|
| [`0001`](ADR/0001-connector-platform-mcp-first.md) | MCP is the connector platform; Composio/Zapier/Nango aggregator removed |
| [`0002`](ADR/0002-ui-v2-cockpit-replaces-v1-router-pages.md) | UI v2 cockpit replaces v1 router pages (capability map) |

## Grounding

All decisions trace to `RESEARCH/desktop_app/` docs 01–91 and the 282-repo ledger (doc 27 + doc 46 additions + docs 49–50: +22 + doc 52: +26 + doc 54: +1 + doc 55: +3 + doc 56: +4 + doc 57: +1 + doc 58: +19 + doc 60: +1 + doc 61: +8 + doc 62: +0 + doc 63: +0 + doc 64: +0 + doc 65: +19 + doc 66: +4 + doc 67: +3 + doc 83: +1 + docs 84–90: +0 repos — doc 63 is the 37-repo steal ledger, doc 64 the giants code-level deep-dive (rustdesk/ladybird/serenity/brave/chromium cloned + source-read; pattern-sources only), doc 67 the capability-delta batch (bolt.diy/hatchet/durable-execution-the-hard-way cloned + source-read; Sites + heartbeat steals + UI/UX finalization). Key source deep-dives: 19 (BYOK providers), 28/29 (office), 32/31 (token economy), 33 (BrowserOS — browser + audit + compaction), 05/16 (agentic coding: pi/Hermes/Reasonix/opencode), 03 (vision + security + memory), 13 (connector hub), 06/09 (browser/agentic OS), 46 (Aider + Devin Cloud — UI/UX, RepoMap, edit strategies, automations), 63 (37-repo steal ledger: harness/browser/office/user-capability clusters), 64 (giants code-level: sandbox profiles, syscall broker, adblock crate, NAT traversal), 67 (Sites/heartbeat/proactivity/inline-edit/kanban deltas + activity-rail UI finalization). Final-pass SOTA: doc 34.
