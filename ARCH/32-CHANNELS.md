# 32 — Channels (Surfaces & Protocols)

> **Status:** Draft P3 (early). Must pass the `ARCH/00-INDEX.md` §5 checklist at freeze.
> **P7 pass (2026-09-26):** line-checked; requirements seeded (`REQ-CHAN-*`, Requirements section).
> **Role:** every surface is a **projection of Core**, and every external agent connects through the **Agent Gateway** and receives projections only (DEC-009). One internal contract; protocols are mappings.
> **Dependencies:** `07-CONTRACTS` (CTRs) · `11-WORK` (sessions) · `12-TRUST` (projection enforcement) · `13`/`14` (capability/tool subsetting) · `16-CONTEXT` (context projection) · `29`/`30` (artifact gateway, event filter). **Consumers:** external agents, IDE/CLI users, remote surfaces.
> **Evidence:** product-owner brief (protocol surfaces: ACP · A2A · API; the 7-item projection model; “surfaces are projections”) · `agent-harness-verification.md` §B1/§B2 (ACP server + session manager + tool registry + typed updates — verified), §C3 (ACP stdio ND-JSON), §D1 (scope-tagged registrations) · DEC-009 · `ARCH/12-TRUST.md` §8 · `ARCH/30-EVENTS.md` §6.

## 1. Purpose & rules

**Owns:** the surface set (desktop · CLI · ACP · A2A · API · mobile-later) · the **Agent Gateway** (identity · sessions · projections · artifact gateway · event filter · approval routing) · protocol mappings onto the internal Agent Runtime Contract · per-surface capability declarations.
**Never owns:** business logic · the contracts themselves (`07`) · policy (`12`).

1. **No second brain** — surfaces render, request and subscribe; they never own state (P-01).
2. **One contract, many mappings** — ACP/A2A/API/CLI all map onto the same CTRs (`07`); no protocol-specific semantics leak inward (INV-15).
3. **Projections only for external agents** — the 7-item model is the entire surface (§3).
4. **Channel capability negotiation** — each surface declares what it supports (e.g. approval prompts: desktop yes; mobile later); UI/composer behavior follows declarations (`AGENTCOWORK-UI.md`).

## 2. Surface map

| Surface | Shape | Notes |
|---|---|---|
| **Desktop UI** | Richest projection: sessions, composer, Workbench, approvals, Runs, Context inspector | UI doc owns rendering; this module owns the contract mapping |
| **CLI** | `agentcowork` (placeholder): `-p "<prompt>"` · `--workspace` · `serve --acp` · status/approvals | Same contracts; no privileged path |
| **IDE via ACP** | Agent X (or any adapter) as an ACP **server** | Verified pattern: session manager + tool registry + typed updates |
| **A2A (remote agents)** | Task/message/artifact exchange; remote agents stay **opaque** | Interface defined now; full implementation post-v1 (OQ-CHN-1) |
| **AgentCowork API (Work API)** | First-party/advanced automation: create/inspect work, runs, approvals | Same gateway rules as external agents |
| **Mobile / remote (later)** | Approvals + monitoring + lightweight prompts first; sessions live in Core | Multi-device handoff = same session, different surface |

## 3. The Agent Gateway (`CTR-022`) — the 7-item projection

| # | Projection | Enforcement |
|---|---|---|
| 1 | **Identity / agent contract** — agent id, workspace id, declared capabilities (Agent Card analogue) | Gateway-issued; audited |
| 2 | **Capability projection** — Effective = Installed × Available × Allowed × Relevant | `13` §6 + `12` §8 |
| 3 | **Context projection** — scoped slice (workspace root, rules, RepoMap, relevant files, git status, recent history, **memory — filtered recall projection**) | `16` §1.3 + `17` §4 (recall-only boundary, DEC-043), sensitivity-filtered |
| 4 | **Workspace projection** — `allowed_paths` / `read_only_paths`; interception, not un-discovery | `12` §8, pathfloor |
| 5 | **Tool/MCP subset** — only the granted subset is mounted | `13`/`14` |
| 6 | **Artifacts** — via the artifact gateway (refs; permissions) | `29` §5 |
| 7 | **Events / task state** — filtered stream, stable subset vocabulary | `30` §6 |

**Never exposed:** Core internals, stores/schema, queues, scheduler internals, vault, policy internals, model-router internals, other agents’ state (`12` §8). Session lifecycle (bindings, HITL routing) is gateway-managed; approvals route to the channel that owns the binding.

## 4. ACP mapping (the coding/IDE seam)

- **As server:** Agent X exposes session management + tool registry + typed streaming updates (verified reference: Grok Build B1/B2). Message shapes map the internal typed stream (`30` §3) onto ACP update classes — plans, messages, tool calls, tool updates.
- **As client:** external agents arrive either in-process (CLI adapters) or as ACP subprocesses over stdio ND-JSON (verified OpenCode pattern C3); the adapter registers a factory (`15` §2) and receives its projection.
- **Auth:** local subprocess trust model for stdio; gateway-issued tokens for remote/API binds.

## 5. A2A & remote agents

Remote agents remain **opaque**: exchange tasks/messages/artifacts; their internals stay theirs (the A2A philosophy). Remote runs materialize as `Work` items like everything else; network passes egress (`12` §7). v1: the interface + registry entries ship; the remote transport implementation is explicitly post-v1.

## 6. CLI surface

`agentcowork` (placeholder name, OQ-005): run a prompt with a workspace, serve ACP for editors, inspect work/runs/approvals, trigger workflows. The CLI is a thin projection — no separate state, same gateway rules, and it must work when the desktop UI is closed (detached work continues, `11` §3/§7). Memory writes from CLI/detached runs route through the single-writer mechanism (`17` §8) — same store rules, never a second writer.

## 7. Approvals & interaction routing

Approvals (`DEC-021`) route to the channel bound to the session/work: desktop prompts, CLI prompts, or API callbacks; if no interactive channel is available, the request waits durably (`11`, `20` §7) and surfaces on the next channel attach. Notification ≠ receipt (`20` §7 note).

## 8. Failure modes

| Failure | Behavior |
|---|---|
| Gateway auth failure | Typed `AuthorizationDenied`; audited; no partial projection. |
| Projection leak attempt | Denied by `12`; logged; session flagged. |
| Channel disconnect mid-approval | Approval stays durable; re-surfaces on attach. |
| Protocol version mismatch | Typed error + supported-window message. |
| External agent disconnects mid-run (ACP/API drop) | Work continues as durable Work; the gateway session is held; re-attach replays the filtered stream from the last ack — no orphaned internal state (EDGE-077). |
| Surface crash | Isolated; Core and other surfaces unaffected (work is async). |

## 9. Interop

**Depends on:** `07` · `11` · `12` · `13` · `14` · `16` · `29` · `30`.
**Exposes to:** external agents (gateway), editors (ACP), automation (API), humans (desktop/CLI).
**DAG check:** channels never bypass the gateway for external agents and never own state.

## 10. Open questions (`OQ-CHN-*`)

1. A2A implementation timing (post-v1 trigger).
2. Gateway auth model for remote/API binds (token minting via `12`).
3. CLI final name + command surface (OQ-005).
4. Mobile scope for v1.5 (approvals-only first?).
5. Notification system boundaries (OS notifications vs in-app) — UI tie.

## 11. Evidence

Product-owner brief (three protocol surfaces; 7-item projection; “surfaces are projections”) · `agent-harness-verification.md` §B1/§B2 (ACP server + session manager + tool registry + typed updates; anchors `acp_conversion.rs:116,633`, `session/persistence.rs:1605-1606`), §C3 (opencode acp stdio ND-JSON), §D1 (factory/scope patterns) · DEC-009/021 · `ARCH/12-TRUST.md` §8 · `ARCH/30-EVENTS.md` §6 · `ARCH/16-CONTEXT.md` §1.3 · `ARCH/13-CAPABILITY.md` §6.

## 12. Requirements (`REQ-CHAN-*`)

Testable behaviors owned by this module live in `ARCH/08-REQUIREMENTS.md`; the traceability chain is in `ARCH/09-FEATURE-MATRIX.md`. This table is a pointer, not a second copy.

| REQ | Behavior (one line) |
|---|---|
| `REQ-CHAN-001` | Surfaces render/request/subscribe; they never own state — Core is the brain (P-01) |
| `REQ-CHAN-002` | ACP/A2A/API/CLI map onto the same CTRs; no protocol semantics leak inward (INV-15) |
| `REQ-CHAN-003` | The Agent Gateway exposes exactly the 7-item projection — nothing else (CTR-022, DEC-009) |
| `REQ-CHAN-004` | Workspace projection intercepts out-of-scope access (deny + audit), never un-discovers (INV-11) |
| `REQ-CHAN-005` | Gateway-issued, audited identity; local stdio trust vs token binds for remote/API |
| `REQ-CHAN-006` | Approvals route to the owning channel and wait durably when none is attached (DEC-021) |
| `REQ-CHAN-007` | ACP server maps the typed stream; ACP clients register adapters via a factory |
| `REQ-CHAN-008` | A2A remote agents stay opaque; runs materialize as Work; transport is post-v1 |
| `REQ-CHAN-009` | CLI is a thin projection with no separate state that works detached (`11` §3/§7) |
| `REQ-CHAN-010` | Channel capability negotiation: surfaces declare support; UI follows declarations |
| `REQ-CHAN-011` | A surface crash is isolated; Core and other surfaces are unaffected (EDGE-075) |
| `REQ-CHAN-012` | Protocol version mismatch → typed error naming the supported window (EDGE-079) |
| `REQ-CHAN-013` | External-agent disconnect: durable work + stream replay from last ack — no orphans (EDGE-077) |
