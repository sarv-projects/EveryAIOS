# ADR-0008 — Session workbench projection and resource leases

- **Status:** accepted; implementation and qualification are pending
- **Date:** 2026-09-24
- **Applies to:** [`CORE.md`](../CORE.md) · [`SESSION.md`](../SESSION.md) · [`WORK.md`](../WORK.md) · [`AGENT.md`](../AGENT.md) · [`EXTERNAL-AGENTS.md`](../EXTERNAL-AGENTS.md) · [`UI.md`](../UI.md) · [`12-UI-SPEC.md`](../12-UI-SPEC.md) · [`CAPABILITIES.md`](../CAPABILITIES.md) · [`08-BROWSER-LAYER.md`](../08-BROWSER-LAYER.md) · [`04-OFFICE-ENGINE.md`](../04-OFFICE-ENGINE.md) · [`DESKTOP.md`](../DESKTOP.md) · [`RECOVERY.md`](../RECOVERY.md) · [`SECURITY.md`](../SECURITY.md) · [`AUTOMATION.md`](../AUTOMATION.md)
- **Amends:** [`ADR-0007`](0007-windows-first-v1-qualification.md) only where its identity and qualification language needs a shared projection/lease seam; it adds no primitive, runtime, registry, event log, scheduler, or authorization authority.
- **Delivery owner:** [`TODO.md`](../../TODO.md) `P71.10` (open; implementation and qualification are not claimed here)

## Context

The product already has a durable execution spine and a rich set of physical capability engines, but those
owners do not by themselves answer a cockpit question: *which resources and lenses belong to this user
work context right now?* A tempting answer is to make a Workbench the owner of browser tabs, documents,
desktop targets, provider state, drafts, and approvals. That would create a second state machine beside
Work/Run/Event/Receipt/Audit and would let presentation state decide execution state.

The adopted boundary is narrower. A Session may expose a **logical, non-authoritative projection** of the
resources attached to its work. Physical resources remain owned by their existing engines. Concurrency is
expressed by a **typed lease and fencing contract** owned by Work/Run, while authorization remains exclusively
Guard's decision. This ADR defines the contract; it does not implement the projection, Channel B, or a new
runtime.

## Decision and non-goals

1. Add `SessionWorkbenchProjection` as a **derived read model keyed by canonical `SessionId`**. It is composed
   from the canonical `Session → Work → Run → AgentBinding` owner chain and from typed resource references. It
   is not a Workbench primitive, a canonical state owner, an event log, or a second source of truth.
2. Add `ResourceLease` as a **typed Work/Run concurrency and fencing contract**. It says which Work/Run may
   observe, view, edit, or act on a resource generation. It is not a permission, capability grant, or Guard
   ticket.
3. A Session owns its logical projection, per-session lens state, resource references, lease attachments, and
   pre-submission draft references. It does **not** own a physical browser profile/tab, Office document or
   view, Desktop target, provider process/session, or any other engine resource.
4. The single authorities remain unchanged: shared engines and `ToolService` execute; `everyaios-guard`
   authorizes; `everyaios-vault` custodies credentials; the capability registry describes availability; the
   Work/Event/Receipt/Audit spine records truth and evidence.
5. This ADR adds no Workbench primitive, execution runtime, event log, permission system, retry loop, scheduler,
   capability registry, or recovery authority. A proposal that needs one is a different architecture decision.

`MUST`, `MUST NOT`, and `MAY` below are normative. The subsystem documents contain derivations and links, not
copies of this model.

## 1. Canonical identity and projection

### 1.1 The owner chain

Every effectful resource operation carries, or derives, this canonical context:

```text
SessionId
└── WorkId[]                         durable objective owner
    └── RunId[]                      execution-attempt owner
        └── AgentBindingId            replaceable actor binding
            ├── provider_session_id   binding-private adapter state
            └── resource attachments  Work/Run lease references
```

The cardinality is deliberately not a singleton: a Session may contain several Works, a Work may contain
several Runs, and a binding may be switched without replacing the Session or Work. The active owner tuple is
`(SessionId, WorkId, RunId, AgentBindingId)`. A provider session id is never a canonical owner id.

The projection is keyed by exactly one `SessionId`. Every Work, Run, Binding, resource reference, and lease
attachment in that projection must point back to that Session and to its complete owner chain. A projection
may be absent, rebuilding, stale, or unavailable; it may never borrow another Session's lens, resource,
queue, or lease to fill the gap.

### 1.2 `SessionWorkbenchProjection`

The read model has the following bounded shape. It contains references and safe summaries, not physical
content, credentials, bearer material, or an independent execution state machine:

```text
SessionWorkbenchProjection
├── schema_version
├── session_id                         canonical, unique projection key
├── session_kind                       interactive | automation | delegated
├── owner_context                      Session → Work → Run → AgentBinding
├── event_cursor                       last acknowledged canonical sequence
├── freshness                          fresh | rebuilding | stale | unavailable
├── works[]                            Work summaries and durable queue refs
├── runs[]                             Run summaries, waits, and active lease refs
├── bindings[]                         safe binding/readiness summaries
├── lenses[]                           per-Session LensState values
├── resource_refs[]                    typed physical-resource references
├── lease_attachments[]                non-secret lease id/generation/fence/status
├── drafts[]                           durable pre-submit draft references
├── prompt_queue[]                     Work/Run queue-item references
├── pending_questions[]                Work/Run wait/question references
├── pending_reviews[]                  Work/Run review/Guard references
└── receipt_refs[]                     audit-owned evidence references
```

The projection is a cache/read model. It is rebuilt from canonical Session/Work/Run/Binding records, Work and
lease events, receipts, and the last acknowledged event cursor. A persisted copy may make a cockpit fast, but
it is never evidence that an effect happened. If the source records are incomplete or malformed, the result is
`rebuilding` or `unavailable`, never a fabricated clean state.

### 1.3 `LensState`

`LensState` is per-Session presentation state attached to the projection. It is a reference to a surface, not
ownership of the surface's physical resource:

```text
LensState
├── lens_id / view_id                  stable presentation identity
├── kind                               browser | office | desktop | code | shell | progress | …
├── open_order / active                per-Session tab/rail state
├── resource_ref_ids                   typed references shown by this lens
├── resource_generation                generation last observed by the lens
├── availability                       available | stale | unavailable | conflicting | pending
├── interaction_mode                   observe | read_only | takeover_requested | user_controlled
└── owner_context                      the Session/Work/Run/Binding tuple that scoped it
```

Opening a lens records a reference. It does not acquire authority by itself. Switching Sessions restores only
the newly selected Session's `LensState`; it never transfers an active tab, draft, queue, lease, or physical
handle from the previous Session. A shared resource may be displayed to both Sessions, but each view carries
its own availability and generation.

The projection and lens state contain **no secrets**: no bearer, token, cookie, private provider state,
credential value, or raw lease secret. Safe statuses may name a lease id, generation, and conflict class.

## 2. `ResourceLease` and fencing

### 2.1 Typed contract

A `ResourceLease` is a Work/Run-owned record with at least this contract:

```text
ResourceLease
├── lease_id                           opaque, non-secret correlation id
├── resource_ref                       typed stable resource identity
├── owner_work_id                      authoritative Work owner
├── owner_run_id                       authoritative Run owner
├── actor_binding_id                   binding that may exercise the lease
├── session_scope                      canonical Session for lookup/audit only
├── access                             observe | view | edit | action | control
├── resource_generation                physical version observed at issue
├── fence                              monotonic fencing value for this resource
├── scope_fingerprint                  policy/config scope used at issue
├── state                              active | released | expired | revoked | reclaim_pending | reclaimed | uncertain
├── issued_at / expires_at             bounded lifetime
└── last_heartbeat                     liveness evidence, not authority
```

`SessionId` in `session_scope` is not the lease owner. `AgentBindingId` is the actor context, not the owner.
The Work/Run pair is the authority for the lease record. The resource engine remains the authority for the
physical resource; it may reject a lease even when the Work/Run record is valid. `actor_binding_id` is part of
the exercise context, not ownership: when a binding is parked, revoked, or switched, the Work/Run lease
coordinator must revalidate or reissue the actor binding before the incoming binding can exercise the lease.

`lease_id` is safe to correlate in a projection or audit row. The capability/bearer that proves possession is
held only by the Rust supervisor/private owner. It is never serialized to the renderer, Tauri IPC, a UI
projection, a Work event payload, a log, or an error string. A boundary that needs a lease may pass an opaque
internal handle within Rust; a public surface passes only the typed reference and non-secret status.

### 2.2 Resource identity and generations

A resource key is canonicalized by the owning engine and includes the smallest identity needed to prevent a
false match:

- a file includes canonical real path, file identity, and revision/content digest;
- a browser resource includes profile identity, target/tab identity, and document/navigation generation;
- a Desktop resource includes host, window/app/target identity, process birth identity where available, and
  target generation;
- a provider-private resource includes binding identity and provider-handle generation, never a Session id.

`resource_generation` changes when the physical version changes: a file revision/digest changes, a tab navigates
or its document is replaced, a profile is recreated, or a Desktop target/window is replaced. A `fence` is a
monotonic lease-authority value. They are not interchangeable: a file may have a new generation while an old
lease still has a valid-looking fence, and a fence can advance without content changing.

Before an effect, checkpoint, renewal, or receipt commit, the executor revalidates the resource identity,
resource generation, lease state, and fence. A stale generation or stale fence is refused as
`stale_resource`/`stale_lease`; it is never silently retargeted at the newer resource.

### 2.3 Same-resource contention

The Work/Run lease coordinator applies these rules uniformly; resource engines may add stricter rules but may
not weaken them:

1. Canonicalize the resource key and compare its current generation before admission.
2. Classify the requested access as observation/view or edit/action/control.
3. Compatible observation/view leases may share a resource. An edit, action, or control lease is exclusive
   against every incompatible lease on that resource key.
4. A second writer does not receive a second lease, a copied handle, or a last-writer-wins write. It receives a
   typed conflict, waits under the Work/Run wait policy, or opens a new generation after explicit release.
5. Lease replacement or user takeover revokes the old lease and advances the fence before a new holder acts.
   The old holder's next observation/action/commit is stale even if its wall-clock timeout has not elapsed.
6. Normal release, expiry, revocation, and reclaim are distinct durable facts. Reclaim first verifies process/
   resource identity and the absence of a live effect; it never assumes that a crashed holder is harmless.
7. Shared resources are opt-in and typed. An isolated profile, document, or Desktop target has no implicit
   sharing. A shared resource is a concurrency policy, not a claim that two Sessions have the same identity.

A lease controls **who may exercise a resource concurrently**. It never grants permission. Guard still checks
risk, scope, path/network floors, and the canonical owner context before minting or consuming an authorization
ticket for an effect.

### 2.4 Binding switch, park, and provider restart

Parking or switching a binding changes only the binding and its private provider state. The active Work/Run
lease remains Work/Run-owned. The outgoing binding's `provider_session_id`, transcript, native tools, and
provider cache remain private and are never copied into the Session projection. The incoming binding receives
the same canonical Work/Run context, but the lease coordinator updates or revalidates `actor_binding_id` as
part of the switch. The incoming binding may use a valid lease only after the resource generation, fence, and
actor-binding transition are checked; the old actor binding cannot act through the replacement.

A provider restart creates a new provider-handle generation. It does not create a new Session, Work, or Run.
If native resume is unavailable, the Work continues from its durable checkpoint/ContextPassport and the
result is labelled **provider session restarted**. Any old provider handle or lease-bound capability is stale;
it is not smuggled across the restart.

## 3. Lifetime and ownership

The table is the lifetime contract. “Projection” never means “physical owner.”

| Object | Owns / records | Lifetime and deletion rule | Must not own |
|---|---|---|---|
| **Session** | Logical `SessionWorkbenchProjection`, per-Session lens state, resource references, lease attachments, pre-submit draft references, and lookup scope | Deleting a Session detaches its projection and presentation state. Surviving Work/Run leases and canonical records continue; reattachment rebuilds from the event cursor. | Browser/Office/Desktop/provider resources, Work truth, Guard authority, audit evidence |
| **Work** | Durable objective, owner identity, durable prompt queue, lease attachment root, and work-level review/question references | Outlives Session/UI/binding/process/client deletion and reconnects; cancellation/recovery follows Work semantics. | Physical resource ownership or provider-private state |
| **Run** | Execution attempt, active lease/fence state, waits, in-flight effect, and resume/recovery cursor | Survives UI disconnect and provider transport reconnect; a terminal Run releases or closes its leases, while an uncertain Run remains reconcilable. | Session deletion semantics or a second execution loop |
| **AgentBinding** | Provider-private session id/transcript/config/cache and negotiated actor capabilities | Parked/suspended state may outlive a turn; private state is reattached or discarded by adapter policy. | Work/Run truth, physical resource ownership, lease authority, canonical Session identity |
| **ResourceRef** | Stable typed identity, resource generation, revision/digest, and availability | May outlive a Session and be reattached to surviving Work; missing resources remain explicit. | A bearer, permission, or content copy in the projection |
| **ResourceLease** | Work/Run concurrency state, access class, resource generation, fence, and lifecycle | Released at the owning Work/Run boundary; expired/reclaimed/uncertain states are durable and auditable. | Authorization, Guard policy, execution retries, audit truth |
| **ToolService / capability engine** | Capability resolution, execution, retries, observations, and safe handles | Existing single authority; operates only on an admitted Work/Run effect. | Workbench state, lease records, provider identity, audit authority |
| **Guard / Vault** | Authorization decision and credential custody | Existing single authorities; logout/scope changes invalidate access without rewriting identity. | Lease ownership or UI state |
| **Work/Event/Receipt/Audit** | Canonical execution history and evidence | Existing durable spine; projection reads it and never replaces it. | A Workbench-specific event log or receipt |
| **Capability pack** | Typed capability descriptors, resource adapters, viewers, and safe projections | A pack can be enabled/disabled without becoming a runtime. | Work/Run state, leases, execution, retries, or audit |
| **UI / LensState** | Non-authoritative rendering, per-Session active/open lenses, drafts and interaction affordances | May be rebuilt, stale, or unavailable; deleting it never deletes Work or physical truth. | Canonical state, bearer/token material, permission decisions |

A Session deletion therefore means **detach the view**, not “delete everything the view touched.” If a Work
survives, its owner tuple, queue, events, receipts, and leases remain addressable. An unpromoted draft follows
the Session's explicit retention/deletion policy and is never silently promoted into a Work queue. A later UI
or headless reattachment presents the same canonical context; it does not manufacture a replacement Work.

## 4. Interaction records and durability

The projection renders interaction records; the owner named below remains authoritative. These records must
not be collapsed into a generic “chat state.”

| Record | Durable owner | Meaning and delivery rule |
|---|---|---|
| **Draft** | Session's logical input record, referenced by the projection | Text/attachments the user has not submitted. It survives reload and is not an effect, queue item, or provider prompt. Submission creates a Work/Run queue record before dispatch. |
| **Prompt queue item** | Work/Run input journal | An accepted user prompt intended for a specific Work/Run. It is durable, ordered, cancellable, and replayable from the event cursor. Queue order is not a new execution state machine. |
| **Steering intent** | Active Run coordination record | A bounded control message for the currently active Run (pause, redirect, narrow scope, or interrupt). It is not a queued prompt and does not silently become a new Work. If the Run/generation is no longer current, the result is `not_applied`/a question, never a fabricated delivery. |
| **Question / user-input wait** | Work/Run wait record | A question is tied to the exact Work/Run and generation. Its answer is an event on that chain; a UI draft is not an answer until submitted. |
| **Review request** | Work/Run review record | A request to inspect a plan, diff, or pending effect. It is separate from approval and never grants authority. |
| **Approval / Guard ticket** | `everyaios-guard`, linked to the Work/Run effect | A human or automation decision for one exact effect. The UI renders the card and submits a native-gesture decision; it does not own or auto-approve the ticket. |
| **Receipt** | `everyaios-audit` / Work receipt chain | Evidence that an observation/verification was recorded. The projection displays a receipt reference and uncertainty; it cannot manufacture a success receipt. |
| **Lens/resource reference** | Session projection reference to a Work/Run-owned resource/lease | Presentation and reattachment data. It carries no physical handle or bearer. |

Interactive Sessions may expose all of these surfaces. Automation and delegated Sessions use the same records
and owner chain. A headless automation firing has an automation Session and no hidden Chat; opening a run may
attach a fresh continuation Chat to that existing Session/Work, but it does not create a second execution owner.

## 5. Subsystem derivations

The following are concise ownership consequences. The full rules remain in this ADR; the linked documents own
their subsystem-specific mechanics.

| Subsystem | Required derivation |
|---|---|
| [`SESSION.md`](../SESSION.md) | Session owns the logical projection and lens/draft references, not physical resources; deletion detaches while Work survives. |
| [`WORK.md`](../WORK.md) | Work/Run/Event/Receipt remain truth; queues, steering, questions, reviews, and approvals have the ownership table above. |
| [`AGENT.md`](../AGENT.md) | Binding owns provider-private state; Work/Run own resource leases; switch/park/reconnect changes the binding or handle generation only. |
| [`EXTERNAL-AGENTS.md`](../EXTERNAL-AGENTS.md) | Authenticated ACP/MCP connection context is host-derived; caller fields and JSON-RPC ids cannot select owners; bearer custody stays Rust-private. |
| [`UI.md`](../UI.md) / [`12-UI-SPEC.md`](../12-UI-SPEC.md) | LensState and the projection are per-Session, non-authoritative, responsive, accessible, and honest about stale/unavailable resources. |
| [`CAPABILITIES.md`](../CAPABILITIES.md) | Packs provide typed handles/projections only; engines/ToolService/Guard/Vault/Audit remain the single authorities. |
| [`08-BROWSER-LAYER.md`](../08-BROWSER-LAYER.md) | Browser profile/tab identity, explicit shared/isolated scope, and generation-fenced observation/action leases; account records are not canonical Sessions. |
| [`04-OFFICE-ENGINE.md`](../04-OFFICE-ENGINE.md) | File identity/revision/digest, view/edit leases, snapshot/rollback, and clean/partial/uncertain outcomes through one shared engine. |
| [`DESKTOP.md`](../DESKTOP.md) | Target identity/generation, observation versus action leases, foreground takeover, stale refs, and cross-Session contention. |
| [`RECOVERY.md`](../RECOVERY.md) | Lease/fence reclaim and restart rules preserve uncertainty; projection rebuilds from the event cursor. |
| [`SECURITY.md`](../SECURITY.md) | Guard checks bind the canonical owner tuple, ResourceRef, generation, and lease where applicable; lease is not permission. |
| [`AUTOMATION.md`](../AUTOMATION.md) | Headless Sessions use the same chain/projection/leases without hidden Chats; scheduler admission/occurrence identity remains scheduler-owned. |

## 6. Edge-case acceptance matrix

Every row below is a **required acceptance condition**, not a claim that the current tree passes it. The
implementation/qualification lane is open in [`TODO.md`](../../TODO.md) `P71.10`; the matrix becomes evidence
only when the named tests and live checks are run on the qualified host.

| Edge case | Required result | Required proof (pending) |
|---|---|---|
| Two Sessions view the same document | Both may hold compatible observation/view leases against the same resource generation; neither receives a writer handle; a later write makes the other view stale. | Kernel lease matrix test + Office two-session integration test. |
| Concurrent writer lease | Exactly one Work/Run holds the edit lease; the second waits or receives a typed conflict; no last-writer-wins write or copied lease. | Concurrent acquire/fence test with two independent Work/Run owners. |
| Stale file generation | A writer whose digest/revision no longer matches is refused as stale before patch; it must re-observe/rebase and cannot use a fresh lease to bypass the check. | TOCTOU/revision test and Office apply test. |
| Shared browser profile/tab | Sharing is explicit, scoped, and generation-fenced; observation may coexist only under the declared shared policy; account/session-vault data remains private. | Browser shared-profile integration test with two canonical Sessions. |
| Isolated browser profile/tab | The profile/tab key is unique to its owner scope; another Session cannot infer or attach it from a URL, account record, or caller argument. | Browser isolation and cross-Session denial test. |
| Physical Desktop target lease | Observation and action are separate access classes; an action/takeover lease is exclusive and stale after target replacement or process-birth mismatch. | Windows target-generation, observation/action, and cross-Session contention acceptance test. |
| Binding switch / park / reconnect | Work/Run identity and valid leases survive; only binding/private provider state changes; parked state is reattached without creating a new Session/Work. | ACP lifecycle unit/integration test plus projection rebuild assertion. |
| Provider restart | A new provider session/handle generation is explicit; old handle/lease is stale; continuation is labelled restarted, not native resume. | ACP restart/reconnect test with Work checkpoint and event cursor. |
| User takeover | A native user gesture requests takeover; Guard decides the effect; the old lease is revoked/fenced before user-controlled action; the agent is notified and resumes from a checkpoint. | Guard/UI/Tauri takeover test with conflict and stale-actor cases. |
| Session switch restores only its own lens | Active/open lens, draft, queue, and resource references are selected by the new SessionId; no tab, lease, or physical handle transfers implicitly. | UI DOM/projection test switching between two Sessions with different lens sets. |
| Draft and queue durability | Draft survives reload without dispatch; submit creates a durable Work/Run queue item before execution; queue order, cancellation, and replay are preserved. | Session/Work persistence and crash/replay tests. |
| Question ownership | A question and answer identify the exact Work/Run/generation; switching Sessions or lenses cannot answer a different wait. | Work wait/question integration test with two Sessions. |
| Approval and receipt ownership | Guard owns the ticket/decision and audit owns the receipt; the projection only displays references and never creates approval or success. | Guard/audit/UI contract test, including a forged UI approval attempt. |
| Crash after effect before receipt | The durable attempt remains; outcome is `uncertain`; recovery reconciles before retry and never reports success, failure, or cancellation by inference. | Fault-injection crash test at the effect/receipt boundary. |
| Crash while lease is held | Recovery records the lease as held/uncertain, verifies resource identity, fences before reclaim, and does not grant a replacement while an effect may be live. | Process-kill lease-recovery test and restart replay test. |
| Session deletion with surviving Work | Deletion removes the projection/UI attachment but preserves Work/Run, queue, events, receipts, and Work-owned leases; a later reattach rebuilds the projection. | Session deletion/reattachment integration test with an active Work. |
| Headless automation | An automation Session uses the same chain, projection, and leases with no hidden Chat; scheduler occurrence identity remains separate and durable. | Scheduler → Work factory → Run/lease test with no Chat, plus a UI open-run attachment test. |
| Missing or stale resource | The lens reports unavailable/stale with a safe reason, disables mutating controls, and offers re-observe/reopen/reattach; it never falls back to another resource. | Resource-loss and generation-change tests for file/browser/Desktop. |
| Logout or config-scope change | Identity and Work survive, but private authentication/lease access is invalidated; the surface becomes unavailable until re-auth/scope re-resolution, with no silent scope widening. | Vault/logout and policy-snapshot tests, including cross-Session denial. |
| No bearer/token in UI, IPC, or logs | Projection, Tauri payloads, event/audit records, errors, and logs contain only safe ids/status/generations; possession material stays in the Rust-private owner. | Secret-leak/static scan plus adversarial IPC/log capture test. |
| Unknown outcome classification | `unknown`/`uncertain` is a first-class result; no path maps it to success, failure, or cancelled without an observation/reconciliation. | Property/table-driven recovery test over all crash/cancellation points. |

## 7. Implementation and qualification status

This documentation decision is accepted, but **no projection, lease coordinator, Channel B mount, or resource
adapter is implemented by this ADR**. Before the decision can be called implemented or qualified, the owner
lanes must provide, at minimum:

- canonical schema validation for the full owner tuple, `LensState`, `ResourceRef`, and `ResourceLease`,
  including generation/fence and privacy boundaries;
- a Work/Run-owned lease coordinator with durable lifecycle facts, contention decisions, fencing, reclaim,
  and crash recovery, all projected from the existing event/receipt spine;
- browser, Office, Desktop, and provider adapter integrations that return typed safe statuses rather than
  physical handles;
- authenticated ACP/MCP owner-context derivation and Rust-private lease custody, with no bearer crossing
  renderer or IPC;
- per-Session UI projection/lens behavior, durable draft/queue presentation, approvals/receipts, responsive
  layouts, and accessibility/focus/status announcements; and
- focused unit, integration, adversarial security, crash/replay, and real-host qualification evidence for every
  row in §6.

Until those conditions are met, delivery language must remain **open / implemented — unverified / blocked** as
applicable. In particular, this ADR does not qualify Channel B, does not make a browser or Desktop lease
available, and does not turn a projection into a release or support claim.

## Consequences

- The cockpit can restore a coherent per-Session work surface without becoming an execution owner.
- Browser, Office, Desktop, and provider engines remain shared and replaceable; their resource identities and
  generations can be fenced without moving physical ownership into a Session.
- Queue, steering, question, approval, and receipt semantics become explicit and independently testable.
- Recovery can distinguish a stale projection from an uncertain effect, which prevents both lost work and
  fabricated success.
- Any future change that makes the projection authoritative, moves a lease into a binding, adds a second event
  log, or lets a renderer select the owner context conflicts with this ADR and requires a new decision.
