# ADR-0003 — Architecture thaw: ARCH/CORE.md becomes the root authority

- **Status:** accepted
- **Date:** 2026-09-20
- **Applies to:** all of `ARCH/`, `../DESKTOP-APP-SPEC.md`, `../TODO.md`, `../capabilities.yaml`
- **Supersedes:** the freeze declaration at `../SPEC-CHANGELOG.md` (v3.64, "the architecture is frozen and
  no more architecture expansion") and the "frozen" status of `17-NATIVE-AGENT.md` (2026-09-15)

## Context

The architecture was declared frozen as of spec v3.64 with an explicit "no more architecture expansion"
statement, on the reasoning that the remaining job was implementation, adversarial testing, and E2E
evidence. Since then, three things made a re-opening unavoidable:

1. **A context-engineering practice matured elsewhere that this architecture had only partially
   absorbed.** `05-TOKEN-ECONOMY.md` already carried the prefix-cache lesson and tool-result size control,
   but the architecture had no *named contract* for the separation between durable history and the
   model-facing surface, for deterministic-reduction-before-summarization, or for cache-boundary as an
   invariant rather than an optimization.
2. **The agent-hosting story became concrete.** External agent runtimes now expose deep extension
   surfaces (hooks, SDKs, app-server protocols, plugin lifecycles). That made it possible — and
   necessary — to state precisely what EveryAIOS owns versus what the hosted agent owns.
3. **Four defects were confirmed in source**, three of them in the trust boundary itself. An architecture
   that claims a single authorization gate while its ACP permission path grants approval without
   consulting Guard, and while a TypeScript package stores provider credentials, is not frozen — it is
   mis-described.

## Decision

**The architecture is re-opened, corrected, and re-frozen at the revision introduced by this ADR.**
`ARCH/CORE.md` becomes the single architectural authority: the primitives, the ownership matrix, and
the invariants. Every other architecture document derives from it and none may weaken it.

### 1. The documentation hierarchy becomes explicit

```
ARCH/CORE.md          ← single architectural authority (primitives · ownership · invariants)
ARCH/<SUBSYSTEM>.md   ← one contract per subsystem, derived from CORE
ARCH/ADR/             ← why a specific implementation was chosen
RESEARCH/             ← explicitly non-normative research
DESKTOP-APP-SPEC.md   ← product contract (behavior), references CORE for architecture
TODO.md               ← delivery status and every unit of work
```

Architecture facts live in exactly one place. A subsystem document may not restate CORE; it may only
specialize it.

### 2. Six new ownership invariants are established

Canonical truth is never optimized for a provider (I2) · no subsystem creates a second source of truth
(I4) · subagents are child Work/Runs, not a runtime (I8) · MultiRun is a strategy, not a kernel (I9) ·
provider-visible prefixes are append-stable (I16) · raw tool output is not automatically model context
(I17) · cheap reduction precedes model-backed summarization (I19) · compaction never depends on an
over-limit summary request (I20) · context capacity comes from the resolved route (I21) · agent switching
changes only the binding (I24) · adding a capability never requires touching an agent integration (I26).

The full set lives in `CORE.md` §6 — **26 at the time of this ADR**. The set is not closed: it was amended
the same day by [`0004-behaviour-profile-invariant.md`](0004-behaviour-profile-invariant.md), which adds
**I27** (behavioural policy compiles per adapter). A newly added invariant is a new invariant; it does not
retroactively change this record.

### 3. The term "Chief" is retired

"Chief" conflated two roles, which is why architecture text kept contradicting itself:

- the **loop owner** (reasoning, planning, tool selection) — belongs to the *selected agent*;
- **turn coordination** (state loading, context building, tool projection, event emission, recovery) —
  belongs to EveryAIOS and is **not reasoning**.

The first becomes `AgentBinding`; the second becomes the **Turn Coordinator**. A built-in engine may still
ship as one binding for zero-install first run, but it is **not privileged**, nothing may depend on it,
and every feature must work with it absent.

### 4. The canonical primitives are frozen

Space · Project · Workspace · Chat · Session · Work · Run · Step · Capability · Tool ·
AuthorizationTicket · Effect · Observation · Verification · Receipt · Event. A seventeenth requires an
ADR. The governing reduction rule:

> **If a new feature can be expressed as `Work + Step + Capability + Effect`, it does not get a new
> runtime.**

### 5. The invariant that was always false is corrected

"Every mutation is ticketed" was never accurate. The canonical rule is **authorization provenance**: an
agent/automation mutation consumes an `AuthorizationTicket`; a human UI mutation carries trusted
user-gesture provenance; both feed the same verify → receipt → audit path. A machine must not be able to
manufacture human authorization.

## Consequences

**Required follow-up (tracked in `../TODO.md`):**

- Four confirmed defects enter the work list with source evidence: the ACP permission path granting
  approval without Guard (`crates/everyaios-acp/src/chief.rs:417`), unhandled ACP `fs/*`/`terminal/*`
  (`client.rs:521`, `:538`), mediated mode not being the default (`chief.rs:373`), and a TypeScript
  package storing provider credentials (`packages/core-providers/src/vault.ts`).
- The duplicate-authority consolidation list gains an owner and an action per item.
- Nine subsystem documents are created under `ARCH/`; thirteen existing ones are rewritten or downgraded.
- Architecture CI checks are added so the ownership invariants stop depending on reviewer diligence.
- `TODO.md` becomes the single implementation-status surface; `CURRENT_RUN.md` stops carrying
  architectural claims.

**What this ADR does not change:**

- The four inherited non-negotiables survive: one effect-authorization model · one append-only event log ·
  one Progress timeline · Work is the durable unit.
- Capability *identity* stays owned by `capabilities.yaml` + `09-FEATURE-MATRIX.md` + spec §0, still
  hand-kept in lockstep and machine-checked.
- `DESKTOP-APP-SPEC.md` remains the product contract; `TODO.md` remains delivery status.
- `RESEARCH/` remains frozen and non-normative.

**New freeze point.** The architecture is frozen at the revision this ADR introduces. Further expansion
requires a new ADR — not a doc edit.
