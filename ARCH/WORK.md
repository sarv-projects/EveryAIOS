# ARCH/WORK — Work, Run, Step, Effect, Event and the projection rule

> **Status:** Subsystem contract, derived from [`CORE.md`](CORE.md) §3 and §5. Owns the execution primitives,
the canonical event vocabulary, and the rule that every read surface is a projection. Invariants it must not
weaken: **I3, I4, I6, I7, I9**.

---

## 1. The law

> **Work is the durable unit of execution.** It survives crashes, pauses, agent switches, node changes and UI
disconnects. It is not the AI's working memory — it *is* the work.

That single sentence is why the system can say "the AI forgot, but the work did not". Everything else in
this document exists to keep it true.

---

## 2. The chain

```mermaid
flowchart TD
    W["WORK — the durable objective"] --> R["RUN — one execution attempt"]
    R --> S["STEP — one logical unit of work"]
    S --> T["request: TOOL / DELEGATION"]
    T --> C["CAPABILITY"] --> A["AUTHORITY (guard)"] --> X["EXECUTOR"] --> E["EFFECT"]
    E --> O["OBSERVATION"] --> V["VERIFICATION"] --> RC["RECEIPT"] --> EV["EVENT"]
```

| Primitive | Meaning | Notes |
|---|---|---|
| **Work** | durable objective | the only thing that must survive a restart |
| **Run** | one attempt | a Work may have many; a failed Run is not a failed Work |
| **Step** | one logical unit | **not** necessarily one tool call |
| **Effect** | a requested change to the world | the model requests; the executor performs |
| **Observation** | what actually happened | never assumed |
| **Verification** | whether it achieved the goal | may honestly be *unverifiable* |
| **Receipt** | evidence | the artifact that makes a claim checkable |
| **Event** | historical truth | append-only |

> **A Step is not a tool call.** Conflating them makes planning impossible to express and forces the UI to
> render implementation detail. One Step may be "make the tests pass" and involve forty tool calls.

---

## 3. Contract objects

| Object | What it is |
|---|---|
| `EffectRequest` | a proposed effect: operation, target/resource identity, args hash, risk, idempotency class. Produced by a capability, a connector action, or a tool request |
| `CapabilityRequest` | a request to *use* a capability before it becomes an effect request — carries the capability id, resolved scope and required authority |
| `AuthorizationTicket` | single-use, argument-bound authorization for exactly one `EffectRequest` (see [SECURITY.md](SECURITY.md) §3) |
| `WorkReceipt` / per-effect receipt | the evidence chain: requested vs authorized, resource, before/after refs, diff, rollback ref, gap/uncertainty |

Canonical ids (owned by the shared types crate): `SpaceId` · `ProjectId` · `WorkspaceId` · `SessionId` ·
`WorkId` · `RunId` · `StepId` · `EffectId` · `EventId` · `AgentBindingId` · `ReceiptId`.

---

## 4. State

`Work` state is **event-derived**, not a mutable blob the system trusts:

```
Created → Planning → Ready → Running { WaitingTool · WaitingApproval · WaitingUser · Checkpointed }
        → Verifying → Completed | Failed | Cancelled | Paused | Recoverable
```

`Recoverable` is a first-class outcome, not a failure: the system knows it was interrupted and knows whether
the in-flight effect committed, was lost, or is unknown (see [RECOVERY.md](RECOVERY.md) §3).

---

## 5. The canonical event vocabulary

The event log is the historical truth, so the vocabulary is a contract — not an open string field. At
minimum:

| Group | Events |
|---|---|
| Work | `WorkCreated` · `WorkStarted` · `WorkPaused` · `WorkResumed` · `WorkCompleted` · `WorkFailed` · `WorkCancelled` |
| Run | `RunStarted` · `RunCompleted` · `RunFailed` · `RunPaused` · `RunResumed` |
| Step | `StepStarted` · `StepCompleted` · `StepFailed` |
| Request / authority | `ToolRequested` · `ApprovalRequested` · `ApprovalDecided` · `TicketMinted` · `TicketConsumed` |
| Effect | `EffectAttempted` · `EffectObserved` · `EffectVerified` · `EffectFailed` · `EffectUncertain` |
| Output | `ArtifactCreated` · `ReceiptCreated` |
| Binding | `AgentBindingCreated` · `AgentBindingActivated` · `AgentBindingSuspended` · `AgentBindingResumed` |

Rules:

- Events are **append-only**; nothing rewrites them (I3, I5).
- Every event carries `sequence` (total persistence order) and `causal_parent` (the happens-before edge).
  Unrelated concurrent events may interleave in any order — `causal_parent` is what defines ordering, not timestamps.
- Events are **versioned**; an envelope carries its schema version so a replay of old events stays valid.
- Not every event is semantic: presence and telemetry replay as UI state and must **never** create false
  semantic edges in memory or graph reconstruction (I4).

---

## 6. Everything else is a projection

> **UI, memory, analytics, audit view and recovery state are all projections of the event log.** None of them
> is an independent truth, and none may be written to directly.

| Projection | Derived from |
|---|---|
| UI timeline · Work status · session state | events |
| memory extraction (candidates) | events, after the turn |
| analytics · token/cost dashboard | events + the cost ledger |
| artifact list · agent activity | events |
| audit view | events + receipts (evidence) |
| recovery state | events + checkpoints |

Two consequences that are easy to violate:

1. A "session state" store that the UI *writes* is a second source of truth (I4). The UI projects; the
   kernel owns.
2. A read model that cannot be rebuilt from events is either derived state with a documented cache rule, or
   a bug. There is no third option.

---

## 7. One path — every trigger produces Work

| Trigger | What it actually does |
|---|---|
| Chat | creates Work |
| Scheduler | creates Work (it owns **no** execution engine, memory, tools, state machine or event log) |
| Workflow / automation | a Blueprint plus deterministic execution → creates Work |
| Subagent | creates a **child Work** |
| External agent (ACP) | acts inside the Work it is bound to |
| MultiRun | a **strategy** that launches several Runs of the same Work and fuses the results |

This table is the enforcement of the reduction rule: *if it can be expressed as Work + Step + Capability +
Effect, it does not get a runtime.*

---

## 8. Subagents are child Work

```
Parent Work
├── Child Work A
├── Child Work B
└── Child Work C
```

Each child gets its own Work and Run, a scoped agent definition, scoped tools, a **permission intersection**
(never a superset of the parent), an isolated workspace/worktree where needed, its own budget, and bounded
depth and concurrency. It returns **summary + findings + artifacts — not its transcript**.

The child receives a `ContextCapsule` (provenance) and, when needed, a `ContextPassport` (semantic state) —
see [CONTEXT.md](CONTEXT.md) §8. Copying the parent's whole context into the child is the anti-pattern: it
makes delegation expensive and cache-hostile.

---

## 9. Blueprint is declarative, never a runtime

| Blueprint owns | Execution owns |
|---|---|
| Plan · Task · dependencies · checkpoints · acceptance conditions · task specification · serialization · validation · cycle detection | Work · Run · Step · Effect · Receipt · Event |

`Blueprint → Work → Run → Step → Effect`. A blueprint that executes, schedules, retries, or owns its own
progress state has become a runtime and must be rejected in review.

---

## 10. Invariants this document must not weaken

| Invariant | How |
|---|---|
| I3 — one historical truth | §5, §6 |
| I4 — one owner per state | §6; the UI/kernel boundary |
| I6 — Work is durable | §1, §4's `Recoverable` |
| I7 — effects carry provenance and evidence | §2, §3 |
| I9 — MultiRun is a strategy | §7 |
| I26 — no new runtime | §7's table is the test |

---

## 11. Migration notes

The kernel already carries Work, an execution kernel, a work gateway, per-effect receipts, per-surface
verification and durable persistence. What this document adds is the **contract**: the reduced primitive
set, the canonical event vocabulary, the explicit projection rule, and the statement that scheduler,
workflow, subagent, multirun and blueprint sources are all *triggers*, never runtimes. Collapsing the
remaining duplicates (a second Execution-state vocabulary, duplicate event writers, workflow-owned state) is
`P69.D` and `P69.F2`.
