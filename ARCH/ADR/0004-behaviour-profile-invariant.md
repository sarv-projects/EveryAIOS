# ADR-0004 — Add I27: behavioural policy compiles per adapter

- **Status:** accepted
- **Date:** 2026-09-20
- **Applies to:** `CORE.md` §6 · `AGENT.md` §5.2–§5.3 · `EXTERNAL-AGENTS.md` §8
- **Amends:** [`0003-architecture-thaw-core-authority.md`](0003-architecture-thaw-core-authority.md) — which
  closed the invariant set at 26 and required **an ADR, not a document edit**, for any further expansion.
  This ADR is that record; ADR-0003's decision text is left intact.

## Context

The thaw established 26 invariants, including **I26**: *adding a capability must never require modifying an
agent integration*. I26 covers **capability**. It says nothing about **behaviour**, and behaviour has exactly
the same failure mode.

EveryAIOS must be able to state a policy like *"verify after every change"* or *"require approval before a
destructive tool"* once, agent-agnostically, and have it hold across Claude Code, Codex, Cline, OpenCode, Pi,
Command Code, Antigravity and whatever is registered next. Without a rule, each such policy becomes N
per-agent implementations — which is how an architecture acquires a `ClaudeBrowserIntegration` and a
`CodexBrowserIntegration` and eventually dies of a thousand adapters.

The hook surfaces needed to compile such a policy genuinely exist, but they differ per agent and some agents
expose nothing embeddable at all (Antigravity has no public core runtime). So the honest contract is not
"EveryAIOS enforces behaviour"; it is "EveryAIOS declares behaviour and reports, per binding, what it could
actually compile."

## Decision

Adopt **I27** in `CORE.md` §6:

> **Behavioural policy is declared once, agent-agnostically, and compiled into each adapter's native
> mechanism.** A clause an agent cannot enforce is reported `unenforceable` for that binding — never silently
> dropped and never shown as applied.

Concretely:

1. **`AgentBehaviorProfile`** is the agent-agnostic declaration (`AGENT.md` §5.2). It is **data**, versioned
   with the architecture, and must work for an agent that does not exist yet.
2. **Compilation is the adapter's job.** The adapter maps each clause onto what it natively exposes
   (`AGENT.md` §5.3). Hook names live in the adapter as data; a hook name appearing as a condition in the
   kernel is a defect.
3. **`unenforceable` is a first-class per-binding outcome**, surfaced in the UI. This is I15 applied to
   behaviour: never claim an enforcement you do not have.
4. **The profile claims no Layer-3 control.** It requests the agent's own mechanisms; it never guarantees
   anything about the agent's reasoning.
5. The **negotiated capability matrix** is extended with the interception rows the compilation needs:
   `context_injection` · `tool_interception` · `memory_injection` · `compaction_hook` ·
   `programmatic_control` — negotiated per agent, with `unknown` rendering as unknown.

Implementation is tracked as **P69.B15**.

## Consequences

- Behavioural policy now has one owner and one place to change, mirroring I26 for capabilities.
- **EveryAIOS can advertise a governance posture that is exactly true per agent**, including "this agent
  exposes no seam for clause X" — at the cost of a visibly non-uniform policy surface across agents, which is
  the honest representation of reality rather than a defect.
- The extension-surface inventory in `AGENT.md` §5.3 is **[D]**-tier and will rot as agents evolve. It must be
  re-verified at adapter-implementation time, and it is deliberately a *data* table so rot is a data fix
  rather than an architectural one.
- A future agent with a richer extension surface can enforce *more* clauses without any architecture change,
  which is the intended direction of travel.

## Alternatives rejected

- **Fold this into I26 as a second sentence.** Rejected: I26's obligation is "no integration edit"; I27's
  obligation is "report what you could not enforce". Folding them loses the honesty requirement, which is the
  part that actually prevents lying badges.
- **Let each adapter define its own behaviour semantics.** Rejected: this is the N-implementations failure
  I26 exists to prevent, applied to behaviour.
- **Require EveryAIOS to guarantee enforcement regardless of agent support.** Rejected: not achievable for
  agents exposing no seam, and claiming it would violate I15.
