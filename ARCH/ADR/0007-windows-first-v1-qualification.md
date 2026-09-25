# ADR-0007 — Windows-first v1 qualification scope expansion

- **Status:** accepted
- **Date:** 2026-09-24
- **Applies to:** [`CORE.md`](../CORE.md) · [`AGENT.md`](../AGENT.md) · [`EXTERNAL-AGENTS.md`](../EXTERNAL-AGENTS.md) · [`AUTOMATION.md`](../AUTOMATION.md) · [`RECOVERY.md`](../RECOVERY.md) · [`DESKTOP.md`](../DESKTOP.md) · [`../DESKTOP-APP-SPEC.md`](../../DESKTOP-APP-SPEC.md) · [`../SUPPORT-MATRIX.md`](../../SUPPORT-MATRIX.md) · [`../TODO.md`](../../TODO.md)
- **Amends:** [`0003-architecture-thaw-core-authority.md`](0003-architecture-thaw-core-authority.md) only by recording this later scope/qualification amendment; [`0005-external-agents-are-the-v1-engines.md`](0005-external-agents-are-the-v1-engines.md) only by making its external-agent lifecycle and Channel B obligations explicit; and [`0006-session-kinds.md`](0006-session-kinds.md) only by requiring occurrence-to-Work provenance for every automation firing.
- **Related:** the v1 release queue in [`TODO.md`](../../TODO.md), especially `P70.E1`–`P70.E12`.

## Context

The earlier v1 ruling chose a Windows-first product and deferred several hard qualification obligations
rather than treating source seams as finished behavior. The current delivery tree now has important
foundations — canonical Work identity, a Work journal, an ACP adapter, an automation compiler, native
Windows code paths, packaging gates, and a release-qualification harness — but it also has material
gaps. In particular, no live guarded Channel B tool call has been recorded, `session_load` has no live
consumer and `session/resume` is out of scope by policy, durable occurrence identity for `mark_fired` is
absent, Windows runtime acceptance has not run on a real host, and the release sign-off is deliberately
absent.

> **Corrected 2026-09-25 against source.** An earlier revision of this paragraph claimed the live ACP
> launch passed an empty MCP-server list, that the client had no `session/load` path, and that the
> scheduler firing path created Work without the automation compiler. All three are now contradicted by
> the tree — see the evidence table below, which was re-verified line by line. The correct statement of
> each residual is the narrower one recorded there.

The user has now expanded v1 to include those obligations. This ADR changes **scope and qualification
policy**, not the architecture's identity model. It must not be used to turn a half-built row into a
passing capability.

## Decision

### 1. The expanded v1 scope

The following are release requirements for v1, even where their current rows are partial, blocked, or
open:

1. **ACP identity and lifecycle.** Every ACP turn is attached to the canonical
   `Session → Work → Run → AgentBinding` identity. The application Session id, Work id, Run id, binding
   id, and provider session id are distinct values with explicit references. A host handle is scoped to
   its owning Session/binding, cancellation is per Session/handle, and transport reconnect plus provider
   resume/reconnect preserve the same Work and binding identity. Channel B is bound to the ACP session
   and is tested through the same Guard → executor → receipt → event path.
2. **Automation admission and provenance.** A trigger is admitted only after a durable occurrence record;
   the occurrence is mapped to one immutable automation revision and then to Work. `compile_work` is the
   factory boundary. Event and webhook ingress validate authenticity, schema, scope, frequency, and
   misfire policy before Work exists. `pending`, `uncertain`, and `cancelled` are represented using the
   existing Work/Event/Receipt vocabulary; no scheduler-only execution state is introduced.
3. **Windows runtime and release.** The Windows v1 artifact must use real, enforced runtime boundaries:
   AppContainer and/or restricted-token policy as applicable, Job-Object process/resource containment,
   ConPTY, WGC, and UI Automation, with x64 and ARM64 builds. Install, upgrade, rollback, signing,
   updater, and clean-machine uninstall paths are part of qualification. A capability string,
   cross-compile result, supervisor cleanup, or mock is not runtime evidence.
4. **Rust quality.** Rust 2024 formatting, clippy with warnings denied, and the complete workspace test
   matrix are release gates for the release commit. A partial crate test or a local host does not close
   the gate.
5. **Durability, recovery, and live acceptance.** Production `ExecutionKernel` recovery, full Work
   replay (including binding/session kind/provenance), durable audit and receipt handling, Office
   snapshots and rollback, real PDF redaction, independent CUA verification, browser/Office/Desktop/
   accessibility/live-agent acceptance, real Windows hosts, sequential upgrade evidence, and clean-machine
   install/uninstall are all v1 obligations. The release candidate is qualified only when `P70.E1`–
   `P70.E12` each report `PASS`.

The scope decision does not imply that any item above is currently complete. Delivery status remains in
[`TODO.md`](../../TODO.md), and evidence status remains in the support matrix and qualification record.

### 2. Ownership remains unchanged

This ADR adds no canonical primitive, authority, registry, event log, scheduler, or runtime. It composes
only existing owners:

- `Session`, `Work`, `Run`, `Event`, `Effect`, `Receipt`, and `AuthorizationTicket` remain the
  canonical execution spine in [`CORE.md`](../CORE.md).
- `AgentBinding` remains a supporting contract owned by the kernel; its provider session id is private
  adapter state, never a replacement Session id.
- The trigger plane owns definitions, triggers, admission, and occurrence metadata; the Work factory
  compiles; the Work/Execution kernel owns execution, retries, checkpoints, and effects.
- ACP is the external-agent lifecycle protocol; MCP/Channel B is the shared capability surface; neither
  protocol may execute an effect or make an authorization decision.
- The OS sandbox is a mechanism selected by Guard policy, not a second policy or execution authority.
- The release harness records evidence; it does not grant product capability or mark a row passed.

A proposal that needs another primitive, a second event log, a scheduler-owned executor, a second
authorization system, or a separate recovery authority is out of scope and requires a new ADR.

### 3. ACP identity, handles, cancellation, and resume

The v1 identity rule is deliberately strict:

```text
Session (canonical user/automation owner)
  └─ Work (durable objective)
      └─ Run (one execution attempt)
          └─ AgentBinding (agent/adapter binding)
              ├─ provider_session_id (private, adapter-owned)
              ├─ host handle (scoped to the binding/session)
              └─ capability/bridge scope
```

A provider transcript id may be persisted only on the binding. It may not be used as the application
Session id, may not be shared by two bindings, and may not be substituted for a Work id after a
provider restart. A binding change changes the binding, not the Work.

Cancellation is addressed to the owning handle and is monotonic. It must stop the active provider turn
without cancelling another Session's turn, deleting Work history, or converting an unknown effect into a
failure. Transport reconnect replays the Work event stream from the last acknowledged sequence and
re-attaches the existing binding. Provider resume is attempted only when the negotiated ACP capability
supports it; otherwise the host may create a new provider session and continue from the durable
checkpoint/ContextPassport, but must label that path as **provider session restarted**, never as native
resume.

### 4. ACP v1/v2 policy

ACP v1 is the only protocol baseline that v1 currently qualifies. The production path must negotiate
capabilities explicitly and must not infer support from omission.

**The v2 policy for this v1 release is narrow unsupported v2.** A v2 negotiation is refused with a
clear `unsupported ACP version` result unless an explicit v2 adapter implementation and its conformance
tests are present. The host must not silently downgrade a v2 connection to v1, reinterpret v2 methods as
v1 methods, or claim v2's removed client filesystem/terminal surface. The v1 mediated filesystem/
terminal path remains a compatibility surface only; it is not the durable capability path.

Channel B is the durable shared-plane path. It is supplied through the negotiated `mcpServers` entry in
ACP `session/new` and uses the same Work-scoped MCP bridge as every other consumer. If Channel B is
absent, an agent may be self-contained, but the product may not describe the shared capabilities as
available through EveryAIOS. Future v2 support requires an explicit capability/adapter and an acceptance
record; this ADR does not grant it by implication.

### 5. Occurrence-to-Work semantics

An occurrence is trigger metadata, not a new execution primitive. The required sequence is:

```text
trigger admission
  → durable occurrence (automation_id + immutable revision_id + occurrence_id)
  → compile_work(revision, occurrence_id)
  → Work (one canonical objective)
  → Run(s) (retries/reconnects stay within that Work)
  → Effect → Observation → Verification → Receipt → Event
```

The first firing and every retry/reconnect refer to the **same Work** and the same occurrence. A new
trigger firing creates a new occurrence and may create a new Work; it must not reuse an old occurrence
to hide a duplicate. A trigger that is rejected before admission is recorded as a non-firing admission
decision, not as a successful run. Once an occurrence is accepted:

- `pending` means admission is durable but Work/Run admission is not yet complete;
- `uncertain` means the host cannot prove whether Work/Run/effect admission committed and must reconcile
  before retrying;
- `cancelled` means cancellation won the monotonic race and no later attempt may re-open that occurrence.

These are projections over existing Work/Event/Receipt states, not a parallel scheduler state machine.
`AUTOMATION.md` remains the owner of the trigger/occurrence contract; `RECOVERY.md` owns reconciliation
and uncertain effects.

### 6. Acceptance policy and evidence

Scope, implementation, and qualification are separate claims:

- **Implemented** means code exists and compiles or has a focused test; it does not mean the product is
  ready.
- **Implemented — unverified** remains the required marker for a landed slice without live evidence.
- **Blocked** names the missing host, credential, artifact, or external condition.
- **Open** means the row has not met its own acceptance condition.
- **Pass** is reserved for a recorded, reproducible acceptance result on the release candidate.

A v1 claim requires all of the following:

1. real Windows x64 and ARM64 artifacts, with install → first run → real task → uninstall evidence;
2. sequential upgrade and rollback evidence preserving vault, Work/events, checkpoints, memory,
   automations, and audit-chain validity;
3. a real external agent through ACP, including permission handling, Channel B `tools/list`/`tools/call`,
   cancellation, reconnect, and the negotiated resume policy;
4. real browser, Office, Desktop/CUA, accessibility, and live-agent workflows, with independent CUA
   verification rather than the actor's own completion claim;
5. production recovery/replay and durable audit/receipt evidence, including uncertain outcomes; and
6. `P70.E1`–`P70.E12` all reporting `PASS` in one release-candidate sign-off.

Linux/WSL development runs, source inspection, cross-compilation, mocks, browser previews, and
compile-only checks are useful evidence but cannot substitute for the Windows acceptance record.

### 7. Post-v1 exclusions

This ADR does **not** add any of the following to v1:

- voice input, speech-to-text, text-to-speech, wake-word, hands-free voice, voice memo, or audio
  digest/audio automation;
- the built-in reasoning engine or its governed-baseline return (`ADR/0005`/`P71.7`);
- hosted always-on execution, a mobile companion, web/CLI/ACP attach clients, or multi-node failover;
- a public webhook relay or hosted automation service;
- macOS or native Linux desktop artifacts and their signing/notarization/package paths;
- generic distributed/multi-device resumable streams beyond the ACP/Work recovery scope above; or
- a new engine, runtime, event log, permission system, or capability authority.

Those remain post-v1 or explicitly unsupported according to their existing rows. The voice family is a
hard exclusion, not a partially enabled v1 surface.

## Current evidence and limitations (2026-09-24)

The following are the exact current reasons the expanded scope is not yet a qualified v1 claim:

| Obligation | Current evidence | Qualification state |
|---|---|---|
| Channel B | As of 2026-09-25 both production `session_new` calls pass `channel_b_servers`, not `vec![]`. Older line cites (`:1548`/`:1643`, `:1526`/`:1621`) described the empty list and are stale. | **Unverified / open.** The server is on the launch path. A live guarded tool call, including on Windows, has not been recorded. |
| ACP resume/reconnect | `crates/everyaios-acp/src/client.rs:614`–`646` implements `session/new`; the client has cancellation and prompt paths; `client.rs:1568` implements `session_load` (+ `load_session` alias), gated on the agent negotiating `agentCapabilities.loadSession`, exercised by `crates/everyaios-acp/tests/acceptance_acp_handshake.rs:123`. `session/resume` is absent **by policy** (ACP v2; see §4). | **Unverified / open.** `session_load` has no live consumer outside the crate test; reconnect and per-handle cancellation are unqualified; a fresh provider session must never be reported as resume. |
| Automation provenance | `crates/everyaios-core/src/automation_runtime.rs:150`–`193` exposes `compile_work` and stamps `automation_id`, `revision_id`, and `trigger_occurrence_id`. The live firing path in `src-tauri/src/scheduler_fire.rs` **does** call it (`compile_occurrence` at `:123` → `compile_work` at `:125`, occurrence-derived work/run ids at `:225`–`226`, `gateway.create_work_in_session` at `:265`). `scheduler_service.rs:743`–`754` still records `mark_fired` as a job timestamp, not a durable occurrence identity. | **Unverified / open.** The production path preserves provenance; durable occurrence identity and live acceptance are unqualified. |
| Windows runtime | WGC, UIA, ConPTY, and supervisor Job-Object code exist in the tree, but the repository has no real Windows acceptance run for the shipped artifact; the P68.7/P57.6/P66.6–P66.9 residuals remain. | **Blocked / unverified.** A compile or capability flag is not runtime enforcement. |
| Production recovery/replay | `WorkGateway` opens a durable journal and replays Work events/bindings. The live relay recovers with `ExecutionKernel::recover_from_work_gateway_with_checkpoint` (`crates/everyaios-core/src/chat.rs:1165`–`1169`); the journal is authoritative and the snapshot is accepted only after its identities/states validate against the replayed events. There is no `ExecutionKernel::new()` on the live path. | **Unverified / open.** Full cross-surface replay, real-host recovery, and durable per-effect receipt attachment are not qualified. |
| Release sign-off | `scripts/release-qualify.mjs` is fail-loud and currently reports 3 `PASS` / 4 `RUNNABLE` / 5 `BLOCKED`; no `qualification-*.json` sign-off is written. | **Not qualified.** `P70.E12` remains open until every item is `PASS`. |

These limitations are intentionally preserved in the capability, support, and delivery surfaces. This
ADR changes their required v1 status, not their current checkbox or verification status.

## Consequences

- v1 has a larger qualification surface, but no larger architectural authority. Existing owners and
  invariants remain unchanged.
- A row can be in v1 scope and still be `implemented — unverified`, `blocked`, or `open`; those states
  are not contradictions.
- P70.E1–P70.E12 become a single all-`PASS` release gate. A partial harness result cannot create a
  support claim or a sign-off record.
- Voice/STT/TTS/wake-word/audio remain post-v1 exclusions, regardless of any staged UI or research row.
- Future changes to ACP v2, remote clients, hosted ingress, or a new runtime require a separate written
  decision rather than an implicit expansion of this ADR.
