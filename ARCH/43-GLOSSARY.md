# 43 — Glossary

> **Status:** Draft P3. Terms are defined **once here**; module docs may add domain-specific vocabulary but must link back. Where a term has a canonical schema, the entity id is given.

| Term | Definition |
|---|---|
| **Core** | The runtime/kernel — supervisor of the work plane, capability plane, trust plane, domains and stores. Surfaces are projections of it. |
| **Agent** | A reasoning runtime that plans and acts. Agent X (native) or any external peer (ACP/A2A/CLI/remote). |
| **Agent X** | The native first-party agent; architecturally a peer of external agents — same `AgentEngine` contract, no privileged path (DEC-010). |
| **`AgentEngine`** | The peer contract every agent implements: create/resume sessions, run, steer, interrupt, spawn subagent, dispose (CTR-001). |
| **Agent Gateway** | The brokered entry point external agents use; produces the 7-item projection and enforces it (CTR-022, DEC-009). |
| **Agent Profile** | An agent’s declarative configuration: runtime, version, supported models, capabilities, composer abilities (DM-014). |
| **Approval** | A recorded human decision (approve/reject/edit/provide-data) requested by an agent question or a workflow node (DM-010, DEC-021). |
| **Artifact** | A versioned, provenance-carrying work product (document, spreadsheet, patch, dataset, capture…) (DM-019). |
| **Artifact Gateway** | The ref-based exchange surface for artifacts with external agents (`artifact_id`, mime, uri) (`29` §5). |
| **Capability** | A semantic operation — *what* can be done (`office.spreadsheet.edit`) — independent of *who* implements it (DEC-004). |
| **Capability Descriptor** | The capability’s declaration: id, version, affordances, requirements, providers, loading mode, risk class, auth, verification hook (DM-011). |
| **Capability Handle** | A resolved, epoch-checked binding to a provider for a capability (DM-012). |
| **Capability Plane** | The registry/resolver/handles/affordances layer that turns capabilities into provider bindings (`13`). |
| **Catalog** | The browseable list of installed/available capabilities, skills, agents, workflows — the UI/agent discovery surface (`13` §6). |
| **Channel** | A user or protocol surface (desktop, CLI, ACP, A2A, API, mobile-later) (`32`). |
| **Checkpoint** | A durable state-reconstruction record (work · context · workflow · session) (DM-006, DEC-027). |
| **Completion Contract** | The declared success conditions + verification for a piece of work; the loop may not stop before it is satisfied (`15` §4). |
| **Connector** | A provider integration for external services (mail, calendar, messaging, SaaS) (`28`). |
| **Context (Control vs Infrastructure)** | Core owns context **infrastructure** (what exists); the agent owns context **control** (what the model sees now) (DEC-007). |
| **Context Item** | One context fragment record: source, type, content ref, token cost, scope, pins, reconstructable flag, sensitivity (DM-017). |
| **Context Projection** | The scoped slice given to subagents and external agents — never the substrate (`16` §1.3). |
| **Domain Runtime** | A specialized execution domain — Office, Browser, Computer, Files, Code, Search, Comms (`22`–`28`). |
| **Effect** | The externally visible consequence of an executed capability — the thing verification and receipts attach to. |
| **Event** | A published system fact (append-only) — the single stream every projection derives from (DM-008, `30`). |
| **Guard** | The single policy decider (`ALLOW`/`ASK`/`DENY`) composed of three layers: platform confinement × approval policy × declarative exec rules (DEC-028). |
| **Handles** | See Capability Handle. Handles are cached bindings; the hot path looks one up instead of re-negotiating. |
| **Installed / Available / Activated / Executing** | The four-state scoping model for resources (MCP servers, skills, plugins, models) (DEC-024). |
| **Lane** | Scheduler lanes: **foreground** (active turn) · **background** (non-blocking work) · **detached** (may outlive the app session) (DEC-031). |
| **Library** | The global reusable inventory: agents, skills, workflows, connectors, plugins, templates, prompts, saved artifacts (DEC-014). |
| **Library Item** | One promoted inventory entry (DM-023); promotion is explicit (“Save to Library”). |
| **Memory** | Durable, scoped, provenance-carrying knowledge with write/read/forget lifecycle — distinct from context (DEC-019). |
| **Memory Item** | One atomic memory record; ADD-only with a single `superseded_by` pointer; suppression-based forget (DM-018). |
| **MCP** | Model Context Protocol — one provider transport; dual-era policy (modern 2026-07-28 + legacy fallback) (DEC-030). |
| **Model Descriptor** | A model’s capabilities and limits: window, tools, reasoning modes, vision, costs, locality (DM-025). |
| **Model Router** | The single component agents ask for a model; no module hard-codes a vendor (CTR-014, `18`). |
| **Occurrence** | A materialized upcoming workflow trigger firing with an idempotency key — claimed exactly once (`20` §4). |
| **Provider** | An implementation of capabilities (native runtime, MCP server, ACP agent, HTTP/CLI/plugin/remote) (DM-013). |
| **Provider Epoch** | A counter bumped on provider restart; stale handles/tickets bound to old epochs are invalid (DEC-002). |
| **Receipt** | Durable evidence of an effect: ticket, capability/provider, inputs digest, outputs, verification performed (DM-020). |
| **Reconciliation** | The verification step comparing intended vs actual effect outcomes (`34` §6). |
| **RepoGraph / RepoMap** | The repository intelligence index and its ranked, token-budgeted projection (`26`). |
| **Run** | One concrete execution of an agent or workflow node (DM-005). |
| **Scheduler** | The Core component admitting work into lanes under outer limits (DEC-031, CTR-026). |
| **Session** | A durable conversation/agent-context container; its log is append-only and everything else is a projection (DM-004, DM-007). |
| **Sensitivity** | Data classification (`public`/`personal`/`confidential`) enforced at recall/projection/injection (INV-10). |
| **Skill** | Reusable know-how (instructions + capability requirements) — teaches; doesn’t execute (DM-027, `31`). |
| **Step** | A unit of progress inside a run; checkpoint boundary (DM-002). |
| **Subagent** | A child session spawned by an agent for delegated work; returns a receipt, never a transcript (DEC-029). |
| **Ticket** | Scoped, time-boxed authorization for one effect — required before any execution (DM-009, INV-03). |
| **Tool vs Capability** | “Tool” is provider-side vocabulary; AgentCowork exposes capabilities. Protocols/tool names stay below the Capability Plane (INV-15). |
| **Vault** | The credential store; `use`-style API only — values never leave it (INV-02). |
| **Verification** | The read-only checks before a receipt; depth scales with risk class (`34`, INV-19). |
| **Work** | The universal execution abstraction — one lifecycle for turns, jobs, workflow runs, subagent tasks, automations (DM-001, DEC-003). |
| **Workflow** | A deterministic process definition (typed IR) that can include agent nodes; runs are pinned to a version (DM-021/022, `20`). |
| **Worktree** | A git-isolated checkout provisioned per-spawn for concurrent writers (DEC-029). |
| **World Model** | The continuously updated structural map of the machine + change stream; consumers query it instead of screenshotting (`21`). |

**Naming note:** v0 names (EveryAIOS-era) appear only in `ARCH/01-NAMING.md` and archive references.
