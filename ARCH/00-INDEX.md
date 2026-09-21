# ARCH — Derived Index (points at CORE)

> **⛭ ROOT AUTHORITY: [`CORE.md`](CORE.md).** Read that first. It owns the canonical primitives, the
> ownership matrix and the invariants, and **every document in this directory derives from it and may not
> weaken it**. This index is a *derived* map, not an authority. The thaw that made `CORE.md` the root is
> recorded in [`ADR/0003-architecture-thaw-core-authority.md`](ADR/0003-architecture-thaw-core-authority.md).
>
> **Status:** Architecture reference, derived from `CORE.md`. It works alongside the master spec `../DESKTOP-APP-SPEC.md` (**note:** spec §4.3 "Final architecture — the agent control plane", §4.4 Work Gateway / Session Runtime and §9's principles already carry a large part of the control-plane contract, so much of this directory is the *elaboration* of that contract rather than a competing statement of it); this ARCH series defines architecture boundaries, module ownership, and diagrams. Function identity is mirrored in `09-FEATURE-MATRIX.md`; historical decisions are recorded in `../SPEC-CHANGELOG.md`. Delivery status remains in `../TODO.md` (architecture-thaw work is **P69**; v1 release is **P70**).
> **Decision (user-confirmed):** **Hybrid & Decoupled** — the `@everyaios/core-*` TypeScript engine stays as a supervised Bun-compiled sidecar; a **Rust layer owns the paths where research proved Rust wins**: browser/CDP control, script-eval sandbox (rquickjs), security guards, audit/replay ingest, **storage intelligence** (`everyaios-storage`), IronCalc spreadsheet recalculation (`everyaios-office`), and memory graph (`everyaios-memory`). External coding agents run decoupled as out-of-process ACP stdio children.
> **Rewritten `P69.A13` (done 2026-09-20) — this file is the derived index. It points at CORE and the subsystem contracts; it states no primitives, no ownership, and no invariants of its own.**

## What this index is

`CORE.md` owns: the 16 primitives (§3), the ownership matrix (§4), the 27 invariants I1–I27 (§6), and the 7 planes (§2, §13). The subsystem contracts own their boundaries: [`WORK.md`](WORK.md) · [`SESSION.md`](SESSION.md) · [`AGENT.md`](AGENT.md) · [`EXTERNAL-AGENTS.md`](EXTERNAL-AGENTS.md) · [`CONTEXT.md`](CONTEXT.md) · [`CAPABILITIES.md`](CAPABILITIES.md) · [`MEMORY.md`](MEMORY.md) · [`SECURITY.md`](SECURITY.md) · [`RECOVERY.md`](RECOVERY.md) · [`AUTOMATION.md`](AUTOMATION.md) · [`ROUTING.md`](ROUTING.md) · [`UI.md`](UI.md) · [`DESKTOP.md`](DESKTOP.md).

This file owns nothing except the reading path. Where any row below appears to restate a primitive, owner, or invariant, CORE wins.

## Reading order (derived documents, not authorities)

1. **01-SYSTEM-ARCHITECTURE.md** — derived overview: the module story mapped onto CORE's 7 planes (the map)
2. **02-MODULE-LAYOUT.md** — crate/package → owning plane → ownership question, plus the disposition table (canonical / shrink / merge / remove)
3. **03-BYOK-KEYRINGS.md** — multi-key per provider, **429-only** failover (5xx does not rotate), 4h models.dev catalog, OpenCode custom inference, **OpenCode Zen / Go / Free** (three rows), OAuth subscriptions
4. **04-OFFICE-ENGINE.md** — open + edit Word/Excel/PPT/PDF (surgical, byte-preserving, IronCalc DAG)
5. **05-TOKEN-ECONOMY.md** — context-engineering strategies (prefix-cache, tool-result control, pass-by-reference); the architecture is the six contracts in `CONTEXT.md` §5 plus the optimization order in §3
6. **06-SECURITY-GUARDRAILS.md** — sole-Guard ownership per `SECURITY.md`; trust ladder as policy input; authorization provenance; sandbox as mechanism
7. **07-MEMORY-CONTEXT.md** — keeps the algorithms, multi-scope and SOTA retrieval as **strategies** under the four memory classes in `MEMORY.md`
8. **08-BROWSER-LAYER.md** — tiered CDP Browse (Lightpanda + Chrome CDP + stealth). E9 computer use is the real OS (vision + A11y + DAG)
9. **09-FEATURE-MATRIX.md** — the complete submodule & function matrix
10. **10-BUILD-PLAN.md** — phases with exit criteria
11. **11-AI-CHAT-FEATURES.md** — AI chat derivation: copy (from APP engine + Hermes/etc.), convert, reject
12. **12-UI-SPEC.md** — UI/UX specification **v3.10**: Windows-first runtime provenance + two-pane agent picker + agent-owned models + session function loadout; rail Folder/Shell/Browse/**Computer use**/Code + Office flyout; CUA see-pane + vision modal + DAG on Progress
13. **13-PROMPT-ANATOMY.md** — the assembled desktop prompt (`packages/coordinator/src/prompt.ts`): identity/persona scanned before insertion, third-party retrieval as data-only content, `<user_document>` delimiting, byte-stable prefix above `CACHE_BOUNDARY`, prompt-is-not-permission (P1.5). Absorbed into `CONTEXT.md` (`P69.A24`): the assembler serializes Context, it does not own policy (I22)
14. **15-CONNECT-STORE.md** — the Connect Store (v1.0, 2026-08-29): the curated "click → sign in → use" connector surface — remote MCP + OAuth 2.1 (`everyaios-mcp::store`), device-flow/loopback PKCE for the big four (GitHub/Google/Microsoft/Slack), Guard-2 consent payloads (`ConnectConsent`), first-class remote MCP via `remote_plan`
15. **spec §4.5** — `CapabilityBackend` (Local / Wsl / Remote); H36 terminal profiles; user-owned cloud slot. Not a new ARCH file — lives in the spec.
16. **17-NATIVE-AGENT.md** — historical context: v3.75 two-plane contract; its rows B10/B11/C14/C15/F16/I14–I17 in v3.76; Settings Control Center in v3.77; Windows-first runtime/picker/cowork evidence contract in v3.78. Retains: the EveryAIOS **Native agent plane** vs the **shared cowork plane** — the one invariant (native plane belongs to the agent; shared plane belongs to EveryAIOS), the capability-resolution policy (native-first, augmentation-second), the module-ownership map (one plane + one contract per module), the agent loop and its edge cases, the **schema contract for every native tool (`RegisteredTool`), shared façade, agent type, sub-agent spec, prompt segment, routing rule, and Settings read model**. Per [`ADR/0003`](ADR/0003-architecture-thaw-core-authority.md) and [`CORE.md`](CORE.md) §7.1, the loop-owner role is `AgentBinding` and coordination is the Turn Coordinator — the retired term is not used as a concept in new text.
17. **16-CHAT-LOOP-RUST-PORT.md** — ⛔ **SUPERSEDED (2026-09-21, [`ADR/0005`](ADR/0005-external-agents-are-the-v1-engines.md))**: v1 ships no built-in engine, so there is no EveryAIOS turn loop to port. Retained as history: SCOPE (2026-08-29, not implemented): porting `ConversationEngine.run()` + `runChatStream` to Rust — the verified scope is ~2,770 TS lines (engine.ts + chat.ts orchestration + prompt.ts 12-segment assembler) ≈ ~3,400 Rust + ~1,200 tests, because every I/O dep (broker, ToolService+Guard, MemoryService, gate/risk/plan/contract) already lives in Rust; M0–M4 migration with a keep-TS-behind-toggle cut-over + the two hard seams (P30.8 context-audit parity, A9 cache-affine byte-stability)
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

## Document accounting — every document's role (nothing unaccounted)

`CORE.md` describes the system; this table accounts for the **documents** that describe it, so no
Markdown file in this repository is orphaned from the architecture. If a file is not in this table, it is
not architectural — and if a *new* architectural document appears, it belongs in a row here.

**HLD — high-level design (what the system is, and what owns what)**

| Role | Documents |
|---|---|
| **Root authority** | [`CORE.md`](CORE.md) — primitives · ownership matrix · 27 invariants · planes |
| **Subsystem contracts** (13) | [`WORK.md`](WORK.md) · [`SESSION.md`](SESSION.md) · [`AGENT.md`](AGENT.md) · [`EXTERNAL-AGENTS.md`](EXTERNAL-AGENTS.md) · [`CONTEXT.md`](CONTEXT.md) · [`CAPABILITIES.md`](CAPABILITIES.md) · [`MEMORY.md`](MEMORY.md) · [`SECURITY.md`](SECURITY.md) · [`RECOVERY.md`](RECOVERY.md) · [`AUTOMATION.md`](AUTOMATION.md) · [`ROUTING.md`](ROUTING.md) · [`UI.md`](UI.md) · [`DESKTOP.md`](DESKTOP.md) |
| **Decisions** | [`ADR/0001`](ADR/0001-connector-platform-mcp-first.md) · [`0002`](ADR/0002-ui-v2-cockpit-replaces-v1-router-pages.md) · [`0003`](ADR/0003-architecture-thaw-core-authority.md) (thaw) · [`0004`](ADR/0004-behaviour-profile-invariant.md) (I27) · [`0005`](ADR/0005-external-agents-are-the-v1-engines.md) (external agents are the v1 engines; the built-in engine defers to post-v1) · [`0006`](ADR/0006-session-kinds.md) (session kinds: interactive · automation · delegated) |
| **Product contract** | `../DESKTOP-APP-SPEC.md` (§4.3 control plane · §4.4 Work Gateway · §4.6 two-plane model · §9 principles · §0 capability index) |
| **Derived architecture** (downgraded, each bannered) | this file · [`01`](01-SYSTEM-ARCHITECTURE.md) · [`02`](02-MODULE-LAYOUT.md) · [`03`](03-BYOK-KEYRINGS.md) · [`04`](04-OFFICE-ENGINE.md) · [`05`](05-TOKEN-ECONOMY.md) · [`06`](06-SECURITY-GUARDRAILS.md) · [`07`](07-MEMORY-CONTEXT.md) · [`08`](08-BROWSER-LAYER.md) · [`09`](09-FEATURE-MATRIX.md) · [`10`](10-BUILD-PLAN.md) · [`11`](11-AI-CHAT-FEATURES.md) · [`12`](12-UI-SPEC.md) · [`13`](13-PROMPT-ANATOMY.md) · [`15`](15-CONNECT-STORE.md) · [`16`](16-CHAT-LOOP-RUST-PORT.md) · [`17`](17-NATIVE-AGENT.md) · [`DIAGRAMS.md`](DIAGRAMS.md) |

**LLD — low-level design (how the code is actually built)**

| Role | Documents |
|---|---|
| **Code-level understanding artifacts** | `../docs/codebase/` — [`README`](../docs/codebase/README.md) · [`architecture`](../docs/codebase/architecture.md) (layers, boundaries) · [`components`](../docs/codebase/components.md) (per-subsystem entry points) · [`flows`](../docs/codebase/flows.md) (execution paths, with tiers) · [`data-and-state`](../docs/codebase/data-and-state.md) (state ownership) · [`external-systems`](../docs/codebase/external-systems.md) (L0 agents, egress) · [`tests-and-verification`](../docs/codebase/tests-and-verification.md) · [`invariants`](../docs/codebase/invariants.md) (**`CE1–CE9`** code-evidenced, deliberately *not* CORE's `I1–I27`) · [`decisions`](../docs/codebase/decisions.md) (`D1–D10`) · [`hotspots`](../docs/codebase/hotspots.md) · `freshness.json` |
| **UI design** | [`12-UI-SPEC.md`](12-UI-SPEC.md) (pixels) · `../UI-DESIGN-PROMPT.md` (canonical UI spec) · `../ui/DESIGN-SYSTEM.md` (tokens/layouts) |
| **Test evidence** | `../TEST-CASES.md` (acceptance suite) · `../testcases.md` (scenarios) · `../UX-TESTING-PLAN.md` (UX criteria) |
| **Generated** | `../CODEBASE-MAP.md` (every tracked file; `--check` gates it) · `hotspots` numbers (codegraph) |

**Truth sources and process**

| Role | Documents |
|---|---|
| **Delivery truth** | `../TODO.md` (the only implementation status) · `../SPEC-CHANGELOG.md` (dated history) · `../CURRENT_RUN.md` (handover, **no architectural authority**) |
| **Capability identity** (one triple) | `../capabilities.yaml` == [`09-FEATURE-MATRIX.md`](09-FEATURE-MATRIX.md) == spec §0 — **166** ids, CI-enforced |
| **Repository instructions** | `../AGENTS.md` (the agent contract) · `../.agents/` (agent kit: `README` · `docs/` · `templates/AGENTS.template.md` · `skills/codebase-intelligence/**` · `skills/skill-creator/SKILL.md`) — tooling, not architecture |
| **Product narrative** | `../README.md` (user-facing; surfaces the same governance boundary as [`EXTERNAL-AGENTS.md`](EXTERNAL-AGENTS.md) §5) · `../COMPETITIVE-POSITIONING.md` |
| **Operations** | `../deploy/BYO-HOST.md` (self-host deployment) |
| **Non-normative** | `../RESEARCH/**` (104 docs, frozen by decision `D8`; every file carries a non-normative label — **not a contract, and never updated with code**) |

> **The accounting rule.** A document that states architecture must be reachable from this file, and a
> document that states architecture must derive from `CORE.md`. Anything else is evidence, history, tooling
> or narrative — useful, and deliberately outside the authority chain.



One project = one folder + one session tree · one effect-authorization model (ARCH/06 §6.10) as the mutation gate — agent/automation = `AuthorizationTicket`, human UI = trusted native gesture, both on the one audit · one append-only event log (doc 53's 10 event types) · one Progress timeline that tabs/panels disclose rather than duplicate.

## ADRs (accepted architecture decisions)

Decisions that used to live as monolithic blockquotes in `TODO.md`'s header
now live as numbered ADR files (Fix 2). Each is one decision + rationale +
consequences; `TODO.md` links them instead of duplicating the text.

| ADR | Decision |
|---|---|
| [`0001`](ADR/0001-connector-platform-mcp-first.md) | MCP is the connector platform; Composio/Zapier/Nango aggregator removed |
| [`0002`](ADR/0002-ui-v2-cockpit-replaces-v1-router-pages.md) | UI v2 cockpit replaces v1 router pages (capability map) |
| [`0003`](ADR/0003-architecture-thaw-core-authority.md) | Architecture thaw: `ARCH/CORE.md` becomes the root authority (retires the old executive-loop term; opens the v3.64 freeze) |
| [`0004`](ADR/0004-behaviour-profile-invariant.md) | Add **I27**: behavioural policy is declared once and compiled per adapter; an uncompilable clause is reported `unenforceable` |
| [`0005`](ADR/0005-external-agents-are-the-v1-engines.md) | **External agents are the v1 engines.** The built-in engine (model routing, native loop, its ~50-tool catalogue) is deferred to post-v1 as a *governed baseline binding*. Amends ADR-0003's "one option among equals"; re-scopes `ROUTING.md`; narrows I10 to EveryAIOS-managed credentials; adds the `delegate.*` façade as a prerequisite |
| [`0006`](ADR/0006-session-kinds.md) | **Session kinds** (`interactive` · `automation` · `delegated`). Resolves the silence between `SESSION.md`'s 1:1 Chat↔Session rule and `WORK.md` §7's "every trigger creates Work": a trigger-created Session has **no Chat**, and every Work still has an owning Session. Adds no invariant |

## Grounding

All decisions trace to `RESEARCH/desktop_app/` docs 01–91 and the 282-repo ledger (doc 27 + doc 46 additions + docs 49–50: +22 + doc 52: +26 + doc 54: +1 + doc 55: +3 + doc 56: +4 + doc 57: +1 + doc 58: +19 + doc 60: +1 + doc 61: +8 + doc 62: +0 + doc 63: +0 + doc 64: +0 + doc 65: +19 + doc 66: +4 + doc 67: +3 + doc 83: +1 + docs 84–90: +0 repos — doc 63 is the 37-repo steal ledger, doc 64 the giants code-level deep-dive (rustdesk/ladybird/serenity/brave/chromium cloned + source-read; pattern-sources only), doc 67 the capability-delta batch (bolt.diy/hatchet/durable-execution-the-hard-way cloned + source-read; Sites + heartbeat steals + UI/UX finalization). Key source deep-dives: 19 (BYOK providers), 28/29 (office), 32/31 (token economy), 33 (BrowserOS — browser + audit + compaction), 05/16 (agentic coding: pi/Hermes/Reasonix/opencode), 03 (vision + security + memory), 13 (connector hub), 06/09 (browser/agentic OS), 46 (Aider + Devin Cloud — UI/UX, RepoMap, edit strategies, automations), 63 (37-repo steal ledger: harness/browser/office/user-capability clusters), 64 (giants code-level: sandbox profiles, syscall broker, adblock crate, NAT traversal), 67 (Sites/heartbeat/proactivity/inline-edit/kanban deltas + activity-rail UI finalization). Final-pass SOTA: doc 34.
