# 08 — Requirements (L1 behavioral registry)

> **Status:** Draft P7 (SDD layer — framework + seed set). **Authority:** the behavioral layer between `AGENTCOWORK-SPEC.md` (WHAT and why) and `ARCH/03-HLD.md` (HOW). Each `REQ-*` is one testable behavior with acceptance and failure cases.
> **Rules:** IDs are stable once accepted; module docs cite `REQ-*` IDs instead of restating behavior; `ARCH/09-FEATURE-MATRIX.md` maps every REQ to its design, task and test. Changing an accepted requirement requires a `DEC` (or the `SPEC` change it derives from).
> **Seed note:** the seed entries below were extracted from `AGENTCOWORK-SPEC.md`, `ARCH/05-INVARIANTS.md` and accepted `DEC-*` entries; each module pass verifies, splits or extends its domain's set. Seeds are pre-freeze drafts — numbering stabilises when a release accepts them.

---

## 1. Purpose and position

This registry answers one question per entry: **what behavior must this system exhibit, and how do we prove it?**

- It does **not** re-explain the product (that is `AGENTCOWORK-SPEC.md`) and does not design (that is `ARCH/03-HLD.md` + module docs). It states *observable behavior* — the contract code must satisfy and tests must verify.
- Requirements are derived from the SPEC, invariants, decisions and flows. When a source and a requirement disagree, the source wins until a `DEC` says otherwise.
- Work units (`TASK-*` in `TODO.md`) and tests (`TEST-*`) reference these IDs; `ARCH/09-FEATURE-MATRIX.md` carries the full chain.

## 2. Identity and domains

**Format:** `REQ-<DOMAIN>-<NNN>` — domain mnemonics, three-digit sequence, never reused.

| Domain | Scope | Owner doc |
|---|---|---|
| `PROD` | Product-wide behaviors that span modules | `AGENTCOWORK-SPEC.md` |
| `KERNEL` | ids, errors, config, time, serialization, minimal-kernel rule | `ARCH/10-KERNEL.md` |
| `WORK` | Work · Step · Task · Session · Run · Checkpoint · Scheduler | `ARCH/11-WORK.md` |
| `TRUST` | Policy · Guard · approvals · tickets · vault · egress · audit | `ARCH/12-TRUST.md` |
| `CAP` | Registry · catalog · resolver · handles · affordances · guidance | `ARCH/13-CAPABILITY.md` |
| `PROV` | Provider adapter contract + native/MCP/ACP/HTTP/CLI/plugin/remote | `ARCH/14-PROVIDERS.md` |
| `AGX` | Agent X loop, planner, delegation, recovery, completion contracts | `ARCH/15-AGENT-X.md` |
| `CTX` | Context infrastructure + context control + projections | `ARCH/16-CONTEXT.md` |
| `MEM` | Durable memory: layers, write/read paths, minimal algorithm set | `ARCH/17-MEMORY.md` |
| `MODEL` | Model registry · router · adapters; local discovery; effort mapping | `ARCH/18-MODEL-ROUTING.md` |
| `RTENV` | Process manager · environments · sandbox · lifecycle · health | `ARCH/19-RUNTIME-ENVIRONMENTS.md` |
| `WF` | Workflow IR · triggers · durability · versioning · approvals | `ARCH/20-WORKFLOW.md` |
| `WORLD` | Scanner · registries · world graph · event stream · incremental updates | `ARCH/21-WORLD-MODEL.md` |
| `OFFICE` | Office runtime L1/L2/L3 · resident contexts · render/validate | `ARCH/22-OFFICE.md` |
| `BROWSER` | Managed Chromium + adapters · browser world · ladder | `ARCH/23-BROWSER.md` |
| `CUA` | Computer-use ladder · UI automation · vision fallback · input safety | `ARCH/24-COMPUTER-USE.md` |
| `FILES` | File identity · watchers · leases · indexing | `ARCH/25-FILES.md` |
| `CODE` | RepoGraph/RepoMap · LSP · worktrees · code execution | `ARCH/26-CODE.md` |
| `SEARCH` | Search plane | `ARCH/27-SEARCH.md` |
| `COMMS` | Connectors; email/calendar/messaging; `web.search`/`web.fetch` | `ARCH/28-COMMS.md` |
| `ART` | Artifact + Receipt models · versions · provenance · Library promotion | `ARCH/29-ARTIFACTS.md` |
| `EVENTS` | Event store · bus · replay · subscriptions; cost telemetry | `ARCH/30-EVENTS.md` |
| `SKILL` | Skill registry/loader/resolver; plugin surfaces | `ARCH/31-SKILLS-PLUGINS.md` |
| `CHAN` | Desktop/CLI/ACP/A2A/API/mobile projections; agent gateway | `ARCH/32-CHANNELS.md` |
| `VERIFY` | Validate · render · verify · reconcile; receipt policy | `ARCH/34-EFFECT-VERIFICATION.md` |
| `UI` | Chat rendering, surface behavior, interaction model | `AGENTCOWORK-UI.md` |

**Entry format (machine-parseable — fixed heading + field lines):**

```md
#### REQ-<DOMAIN>-<NNN> — <one-line title>
- **Statement:** GIVEN <context>, WHEN <trigger>, THEN <observable outcome>.
- **Priority:** must | should | may
- **Source:** <SPEC section | INV-nn | DEC-nnn | FLOW-nn>
- **Acceptance:** <the observable condition that proves it>
- **Failure cases:** <enumerated failure behaviors>
- **Tests:** TEST-<DOMAIN>-<NNN> | pending
- **Status:** seeded | accepted | implemented | verified | deprecated
```

## 3. Requirement quality rules

1. One behavior per requirement; split anything with two behaviors.
2. If no test could fail on it, it is not a requirement.
3. Failure cases are enumerated before implementation.
4. Non-functional requirements carry numbers (latency, budget, limits, compatibility).
5. No implementation detail — behavior only; design lives in the module docs.
6. `Status: verified` requires evidence (`ARCH/42-EVIDENCE-MAP.md`); unit tests alone do not mark risky classes verified.

## 4. Seed set (P7 draft — verify/extend in the owning module pass)

### Product-wide (`PROD`)

#### REQ-PROD-001 — One governed path for every externally visible effect
- **Statement:** GIVEN any externally visible effect requested from any surface, domain, adapter or agent, WHEN the effect is proposed, THEN it executes only through the governed path (`Work → Capability → Provider → Handle → Guard → Ticket → Execute → Effect → Verify → Receipt → Event`) and its receipt references its ticket.
- **Priority:** must
- **Source:** `AGENTCOWORK-SPEC.md` §4 · `ARCH/05-INVARIANTS.md` INV-01/INV-03 · `DEC-002`
- **Acceptance:** an attempted effect without a ticket fails closed and is audited; every receipt cites a ticket; no bypass path exists for domains, adapters, UI or Agent X.
- **Failure cases:** bypass attempt via domain/adapter/UI/Agent X → denied; missing ticket → denied + audit entry; receipt without ticket → verification failure (no silent effects).
- **Tests:** pending
- **Status:** seeded

#### REQ-PROD-002 — Credential custody
- **Statement:** GIVEN a provider credential is stored, WHEN any prompt, context, event, log, receipt or code path is produced, THEN the credential value never appears; consumers receive vault-mediated use, never the secret.
- **Priority:** must
- **Source:** `AGENTCOWORK-SPEC.md` §6 · `ARCH/05-INVARIANTS.md` INV-02
- **Acceptance:** secret-corpus scans over prompts/logs/events/receipts find zero credential values; vault isolation test proves no non-vault consumer can read a secret.
- **Failure cases:** leakage via prompt/log/event/receipt → verification failure; TypeScript/sidecar custody attempt → blocked (CRED-2).
- **Tests:** pending
- **Status:** seeded

#### REQ-PROD-003 — One authorization decider
- **Statement:** GIVEN any mutating action requires a decision, WHEN any component evaluates it, THEN exactly one Trust component decides ALLOW / ASK / DENY; no second permission system exists anywhere.
- **Priority:** must
- **Source:** `AGENTCOWORK-SPEC.md` §6 · `ARCH/05-INVARIANTS.md` INV-04 · `DEC-028`
- **Acceptance:** static inspection finds policy evaluation only in Trust; every domain routes decisions to it; composed layers (confinement × approval policy × exec rules) produce one verdict.
- **Failure cases:** domain-local allow-list → detected by review; conflicting verdicts → impossible by construction (one decider).
- **Tests:** pending
- **Status:** seeded

#### REQ-PROD-004 — Native parity (Agent X)
- **Statement:** GIVEN Agent X performs an action, WHEN it mutates state or reaches outside its sandbox, THEN it traverses the same guard/ticket path as any external agent; no privileged shortcut exists, even temporarily.
- **Priority:** must
- **Source:** `AGENTCOWORK-SPEC.md` §11 · `ARCH/05-INVARIANTS.md` INV-12 · `DEC-010`
- **Acceptance:** Agent X runs through the same guard/ticket path as an external adapter in tests.
- **Failure cases:** native-only fast path → forbidden; parity exceptions → require a superseding `DEC`.
- **Tests:** pending
- **Status:** seeded

#### REQ-PROD-005 — Token discipline for deterministic operations
- **Statement:** GIVEN a deterministic operation (render, browse, list, open, preview, navigate, index search, deterministic user-triggered domain ops), WHEN it runs, THEN zero LLM calls are made.
- **Priority:** must
- **Source:** `AGENTCOWORK-SPEC.md` §9 · `ARCH/05-INVARIANTS.md` INV-13 · `DEC-015`
- **Acceptance:** traces for deterministic flows show zero model calls; token accounting attributes no spend to them.
- **Failure cases:** accidental model call on open/preview/render → traced and fixed; "helpful" summaries on deterministic paths → forbidden.
- **Tests:** pending
- **Status:** seeded

#### REQ-PROD-006 — Evidence-gated readiness
- **Statement:** GIVEN any readiness or capability status shown to a user, WHEN the status is produced, THEN it reflects real acceptance records; mock, preview, catalog or unit-only results are never presented as verified.
- **Priority:** must
- **Source:** `AGENTCOWORK-SPEC.md` §13 · `ARCH/42-EVIDENCE-MAP.md`
- **Acceptance:** statuses derive from acceptance records; Windows readiness requires a real Windows acceptance record.
- **Failure cases:** status without record → blocked from `verified`; mock data leaking into live status → treated as a defect.
- **Tests:** pending
- **Status:** seeded

### Kernel (`KERNEL`)

#### REQ-KERNEL-001 — Minimal kernel
- **Statement:** GIVEN the kernel surface, WHEN any change adds behavior, THEN domain semantics (Office, browser, files, agents) are rejected — the kernel holds identity, errors, config, time, serialization and the base envelope only.
- **Priority:** must
- **Source:** `ARCH/05-INVARIANTS.md` INV-14 · `ARCH/10-KERNEL.md` §8
- **Acceptance:** dependency-direction check shows everything depends on the kernel and the kernel depends on nothing in `10`–`34`; a domain special-case in kernel code fails review.
- **Failure cases:** domain logic placed in the kernel → rejected; kernel surface change without a `DEC` → rejected.
- **Tests:** pending
- **Status:** seeded

#### REQ-KERNEL-002 — Single-writer identity
- **Statement:** GIVEN any durable entity id, WHEN it is minted, THEN it is a uuidv7 minted by the owning service (never by callers or UI), and ids stay opaque (no state, version or meaning encoded).
- **Priority:** must
- **Source:** `ARCH/10-KERNEL.md` §2 · `ARCH/05-INVARIANTS.md` INV-06
- **Acceptance:** no id-minting path outside owning services; derived short ids never used for lookup without resolving through the owner.
- **Failure cases:** caller-minted id → rejected; id collision (uuidv7) → `Internal` error (a bug, not a case).
- **Tests:** pending
- **Status:** seeded

#### REQ-KERNEL-003 — Typed, safe error taxonomy
- **Statement:** GIVEN any boundary error, WHEN it surfaces, THEN it uses the canonical taxonomy codes with correct retryability, carries no secrets or user content, preserves cause chains for diagnostics, and never leaks internals across boundaries.
- **Priority:** must
- **Source:** `ARCH/10-KERNEL.md` §3 · `ARCH/05-INVARIANTS.md` INV-11
- **Acceptance:** every boundary error maps to a taxonomy code; secret-corpus scan of error surfaces is clean; `GuidanceRequired`/`RequiresUserAction` arrive as results with next steps, not failures.
- **Failure cases:** untyped error crossing a boundary → review failure; retryability misclassified → defect; internals leaked → verification failure.
- **Tests:** pending
- **Status:** seeded

#### REQ-KERNEL-004 — Configuration layering and validation
- **Statement:** GIVEN configuration, WHEN it is loaded, THEN later layers win in the fixed order (defaults → user → workspace/project → agent profile → session → run override) with each source recorded; schemas are typed, versioned and validated at load; unknown keys warn with migration notes; secrets appear only as vault references.
- **Priority:** must
- **Source:** `ARCH/10-KERNEL.md` §4 · `ARCH/05-INVARIANTS.md` INV-02
- **Acceptance:** layered-config tests (each layer wins); unknown-key warning test; no secret value in config stores; config changes affecting running work are versioned into that work's record.
- **Failure cases:** parse error → fail closed for that layer, fall back to previous layer with warning + audit event; silent acceptance of unknown key → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-KERNEL-005 — Time discipline
- **Statement:** GIVEN timestamps, durations and schedules, WHEN they are stored or measured, THEN times are integer epoch milliseconds UTC, durations/timeouts use the monotonic clock (never wall-clock deltas), and schedules carry an explicit timezone policy resolved at the boundary.
- **Priority:** must
- **Source:** `ARCH/10-KERNEL.md` §5
- **Acceptance:** stored-time format tests; timers unaffected by simulated wall-clock jumps; DST-boundary schedule test.
- **Failure cases:** wall-clock delta used for a timeout → defect; naive local-time storage → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-KERNEL-006 — Canonical serialization and store conventions
- **Statement:** GIVEN any boundary serialization or durable store, WHEN data crosses or persists, THEN canonical JSON (stable field order, integer-safe numbers) is used at boundaries, SQLite WAL with one writer per store is the durable convention, migrations are forward-only, idempotent and tested, and content is referenced rather than copied.
- **Priority:** must
- **Source:** `ARCH/10-KERNEL.md` §6 · `ARCH/05-INVARIANTS.md` INV-06
- **Acceptance:** cross-language round-trip tests on canonical JSON; no cross-module direct DB access; migration suite idempotent; a half-migrated store can never serve traffic (blocked cleanly).
- **Failure cases:** float-precision id/size corruption → defect; migration failure → dependent feature blocked with exact migration + error reported.
- **Tests:** pending
- **Status:** seeded

#### REQ-KERNEL-007 — Base envelope on every contract
- **Statement:** GIVEN any `CTR-*` invocation, WHEN it is called, THEN it carries actor context (user/agent/workflow with scope + permissions snapshot), cooperative cancellation with deadline propagation, idempotency keys for effects (`work_id` + ticket), and a versioned `{ ok, value } | { error }` result envelope.
- **Priority:** must
- **Source:** `ARCH/10-KERNEL.md` §7 · `ARCH/07-CONTRACTS.md` · `ARCH/05-INVARIANTS.md` INV-16
- **Acceptance:** contract conformance tests show the envelope on every boundary; cancellation leaves durable state consistent; duplicate effect invocation with the same key dedupes where the provider supports it.
- **Failure cases:** missing actor context → rejected; cancellation corrupting durable state → violation; retry double-applying an effect → treated as verification failure.
- **Tests:** pending
- **Status:** seeded

### Work (`WORK`)

#### REQ-WORK-001 — One lifecycle, one scheduler
- **Statement:** GIVEN any runnable thing (chat turn, job, workflow run, subagent task, automation), WHEN it is created, THEN it is a `Work` item on the single lifecycle and admitted by the one scheduler — no second job system or side scheduler exists.
- **Priority:** must
- **Source:** `ARCH/04-DECISIONS.md` DEC-003 · `ARCH/11-WORK.md` §1 · `ARCH/05-INVARIANTS.md` INV-06
- **Acceptance:** every execution kind appears as Work with the same status machine; static check finds no parallel scheduler.
- **Failure cases:** kind running outside Work → architecture violation; second queue → review failure.
- **Tests:** pending
- **Status:** seeded

#### REQ-WORK-002 — Append-only log, projections only
- **Statement:** GIVEN any session/history view (ui-history, prompt-history, inbox, runs), WHEN it is produced, THEN it is folded from the append-only session log; no mutable session state is authoritative.
- **Priority:** must
- **Source:** `ARCH/04-DECISIONS.md` DEC-027 · `ARCH/05-INVARIANTS.md` INV-23 · `ARCH/11-WORK.md` §2/§4
- **Acceptance:** projections rebuild from the log after a crash; no writer mutates a projection store directly.
- **Failure cases:** authoritative mutable state → defect; log gap → stale projections surfaced, not hidden.
- **Tests:** pending
- **Status:** seeded

#### REQ-WORK-003 — Durable work and resume
- **Statement:** GIVEN a crash or restart, WHEN work resumes, THEN `running` work resumes or requeues per step idempotency, `waiting`/`awaiting_approval` remain pending, `cancelled` stays cancelled, and cancellation is recorded — never implied.
- **Priority:** must
- **Source:** `ARCH/05-INVARIANTS.md` INV-16 · `ARCH/11-WORK.md` §4
- **Acceptance:** crash/restart test matrix per status; interrupted effects verified before retry (where no provider dedupe, the step is marked interrupted).
- **Failure cases:** duplicate effect after resume → verification failure; silently dropped queue → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-WORK-004 — Scheduler lanes and enforced outer bounds
- **Statement:** GIVEN concurrent demand, WHEN work is admitted, THEN lanes (foreground 1/session · background bounded globally and per tree · detached rehydrated and bounded) and outer limits (max agents, workers/tree, depth, worker tokens, session spend, per-lane concurrency) are enforced at admission, with the decision recorded.
- **Priority:** must
- **Source:** `ARCH/04-DECISIONS.md` DEC-029 · `ARCH/11-WORK.md` §3
- **Acceptance:** admission tests reject over-limit work (rejected, never trimmed silently); interactive work preempts background; a paused tree releases slots.
- **Failure cases:** worker-tree explosion → rejected at admission; starvation → starvation guard engages.
- **Tests:** pending
- **Status:** seeded

#### REQ-WORK-005 — Budgets are maxima; overrun pauses and surfaces
- **Statement:** GIVEN per-work budgets (tokens/cost/wall-time) aggregated per tree, WHEN a soft threshold is crossed, THEN a warning event is emitted; WHEN a hard ceiling is reached, THEN work pauses and surfaces — never silently overruns; kill only by explicit policy.
- **Priority:** must
- **Source:** `ARCH/11-WORK.md` §5 · `ARCH/05-INVARIANTS.md` INV-22
- **Acceptance:** budget tests show pause-at-ceiling; usage attributed into runs/receipts/telemetry.
- **Failure cases:** silent overrun → defect; background work silently exceeding session budget → paused + surfaced.
- **Tests:** pending
- **Status:** seeded

#### REQ-WORK-006 — Cancellation semantics
- **Statement:** GIVEN an interrupt request on active work, WHEN it applies, THEN one of three verbs runs — interrupt (stop current step, keep session) · cancel (terminate work) · dispose (release environment/resources) — cooperatively, propagating parent→child, always recording state + reason, with partial effects receipted or verified, never hidden.
- **Priority:** must
- **Source:** `ARCH/11-WORK.md` §6
- **Acceptance:** cancellation-propagation tests; environment release delegated to `ARCH/19-RUNTIME-ENVIRONMENTS.md`; partial effects appear in receipts.
- **Failure cases:** cancellation hiding partial effects → verification failure; orphaned child after parent cancel → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-WORK-007 — Checkpoint cadence and side-effect safety
- **Statement:** GIVEN work in progress, WHEN steps complete, waits/approvals start, compaction is about to run, or a worker is handed off, THEN a checkpoint is produced (step boundaries as the base cadence), versioned and reconstructable.
- **Priority:** must
- **Source:** `ARCH/11-WORK.md` §4 · `ARCH/16-CONTEXT.md`
- **Acceptance:** checkpoint tests at each trigger; a resume from checkpoint needs no in-memory state.
- **Failure cases:** missing checkpoint before compaction → resume loss; non-reconstructable checkpoint mislabeled → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-WORK-008 — Runs projection and terminal reasons
- **Statement:** GIVEN a work tree in the UI, WHEN Runs renders, THEN it shows main agent + workers + statuses + budget from typed events; every terminal state carries a reason (receipts + typed error + blockers).
- **Priority:** should
- **Source:** `ARCH/11-WORK.md` §8 · `ARCH/32-CHANNELS.md`
- **Acceptance:** Runs rebuilt solely from events; terminal-state-reason test matrix.
- **Failure cases:** terminal state without reason → defect; UI reading store directly → architecture violation.
- **Tests:** pending
- **Status:** seeded

### Trust (`TRUST`)

#### REQ-TRUST-001 — Egress fail-closed
- **Statement:** GIVEN outbound network traffic, WHEN the guarded egress is unavailable or denies, THEN the connection does not leave by any side door — it fails closed.
- **Priority:** must
- **Source:** `AGENTCOWORK-SPEC.md` §6 · `ARCH/05-INVARIANTS.md` INV-05
- **Acceptance:** egress tests show denied/unavailable egress → no connection; static check finds no direct network clients above the adapter layer.
- **Failure cases:** adapter opening its own socket → architecture violation; timeout falling back to direct → forbidden.
- **Tests:** pending
- **Status:** seeded

#### REQ-TRUST-002 — One approval primitive
- **Statement:** GIVEN a human-in-the-loop decision (agent question, workflow approval node), WHEN it is requested and resolved, THEN it routes through one approval primitive, recorded in events and receipts.
- **Priority:** must
- **Source:** `AGENTCOWORK-SPEC.md` §6 · `ARCH/05-INVARIANTS.md` INV-17 · `DEC-021`
- **Acceptance:** agent-path and workflow-path approvals use the same primitive; audit trail present.
- **Failure cases:** bespoke approval dialogs → blocked at review; unrecorded approvals → receipt verification failure.
- **Tests:** pending
- **Status:** seeded

#### REQ-TRUST-003 — One authorization decider
- **Statement:** GIVEN any mutating effect, WHEN it executes, THEN the decision is made by the single Trust decider (policy evaluation + ticket mint) — no module, prompt, or surface holds a second permission path.
- **Priority:** must
- **Source:** `ARCH/05-INVARIANTS.md` INV-04 · `ARCH/12-TRUST.md` §1/§3 · `ARCH/04-DECISIONS.md` DEC-028
- **Acceptance:** static and runtime checks find exactly one decider entry point; every effect path resolves through it; a bypass attempt fails closed.
- **Failure cases:** effect executed without a Trust decision → architecture violation; second decider introduced → review failure.
- **Tests:** pending
- **Status:** seeded

#### REQ-TRUST-004 — Vault custody, use-only
- **Statement:** GIVEN any provider credential, WHEN it is used, THEN it lives only in the vault; callers receive scoped use, never the value; secrets never appear in prompts, context, events, logs, receipts or UI.
- **Priority:** must
- **Source:** `ARCH/05-INVARIANTS.md` INV-02 · `ARCH/12-TRUST.md` §6 · `ARCH/07-CONTRACTS.md` CTR-013
- **Acceptance:** secret-corpus scans of prompts/logs/receipts/events are clean; no read-value API exists outside the vault; rotation audited.
- **Failure cases:** credential surfaced to a model or log → verification failure; plaintext fallback when vault unavailable → rejected (typed Unavailable).
- **Tests:** pending
- **Status:** seeded

#### REQ-TRUST-005 — Tickets bind and validate
- **Statement:** GIVEN an authorization ticket, WHEN an effect uses it, THEN the ticket is bound (capability, provider, environment, scope, uses, expiry, provider epoch, optional approval) and validated at execution; stale epoch, expiry or revocation ⇒ InvalidState.
- **Priority:** must
- **Source:** `ARCH/05-INVARIANTS.md` INV-03 · `ARCH/12-TRUST.md` §4 · `ARCH/06-DATA-MODEL.md` DM-009
- **Acceptance:** ticket-validation tests per binding dimension; replay beyond use-bound fails; epoch-bump invalidation test.
- **Failure cases:** ticket reuse beyond declared uses → rejection + audit; unbounded ticket → review failure.
- **Tests:** pending
- **Status:** seeded

#### REQ-TRUST-006 — Three policy layers stay distinct
- **Statement:** GIVEN policy configuration, WHEN confinement, approval policy, and declarative exec rules are evaluated, THEN the three layers remain distinct and none is collapsed into another.
- **Priority:** must
- **Source:** `ARCH/04-DECISIONS.md` DEC-028 · `ARCH/12-TRUST.md` §2
- **Acceptance:** layer-distinction tests (each layer evaluated independently, decisions composed); no single knob replaces another.
- **Failure cases:** confinement expressed as approval prompt → violation; approval bypassed by rule → rejection.
- **Tests:** pending
- **Status:** seeded

#### REQ-TRUST-007 — Audit completeness
- **Statement:** GIVEN any Trust decision, denial, or forget/delete operation, WHEN it occurs, THEN it is recorded append-only and tamper-evident, and reads of the audit trail are access-controlled.
- **Priority:** must
- **Source:** `ARCH/05-INVARIANTS.md` INV-24 · `ARCH/12-TRUST.md` §9
- **Acceptance:** audit-completeness tests over decision classes; tamper-evidence verification; read access control test.
- **Failure cases:** unaudited decision → violation; audit readable by an unauthorized surface → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-TRUST-008 — Projection-only external agents
- **Statement:** GIVEN an external agent boundary, WHEN services are exposed, THEN only the permitted projection (declared capabilities, scoped context, workspace, mediated tools/MCP, artifacts, events) is visible — never topology, stores, queues, scheduler, vault or policy internals, router internals, or other agents.
- **Priority:** must
- **Source:** `ARCH/04-DECISIONS.md` DEC-009 · `ARCH/05-INVARIANTS.md` INV-10/11 · `ARCH/12-TRUST.md` §8
- **Acceptance:** boundary-enumeration test shows no internal surface reachable; projection is least-privilege per binding.
- **Failure cases:** internal endpoint reachable → security violation; cross-agent visibility → rejection.
- **Tests:** pending
- **Status:** seeded

#### REQ-TRUST-009 — Trust infrastructure fails closed
- **Statement:** GIVEN an unavailable or failing Trust dependency (policy engine, vault, egress mediation), WHEN an effect requests approval/credential/egress, THEN the effect is denied with a typed error — never allowed by fallback.
- **Priority:** must
- **Source:** `ARCH/12-TRUST.md` §11 · `ARCH/03-HLD.md` §11
- **Acceptance:** failure-injection tests per dependency; denial surfaced with typed error + audit.
- **Failure cases:** open fallback → catastrophic violation; silent allow → verification failure.
- **Tests:** pending
- **Status:** seeded

#### REQ-TRUST-010 — Catastrophic gate is irreducible
- **Statement:** GIVEN a catastrophic-class action, WHEN it is requested, THEN it is gated by explicit approval even under Full Access; no setting, rule or agent capability removes the gate.
- **Priority:** must
- **Source:** `ARCH/12-TRUST.md` §3 · `AGENTCOWORK-SPEC.md` §6
- **Acceptance:** catastrophic-corpus tests under every policy mode show approval required; no bypass path.
- **Failure cases:** gate bypassed under Full Access → catastrophic violation.
- **Tests:** pending
- **Status:** seeded

### Capability (`CAP`)

#### REQ-CAP-001 — No flat tool dump; budgeted subsets
- **Statement:** GIVEN a model turn with capability needs, WHEN capabilities are presented, THEN only a task-relevant semantic subset under the configured budget is shown (loading modes eager / catalog / on-demand); never a flat dump of raw tools.
- **Priority:** must
- **Source:** `AGENTCOWORK-SPEC.md` §5
- **Acceptance:** capability payloads stay within budget; dump-all behavior is unrepresentable; loading mode is honoured per turn.
- **Failure cases:** context overflow from tool lists → prevented by budget; missing capability at need → resolver serves it on demand.
- **Tests:** pending
- **Status:** seeded

#### REQ-CAP-002 — Epoch-checked handles
- **Statement:** GIVEN an issued capability handle, WHEN the provider restarts or its epoch advances, THEN the stale handle is rejected and re-resolution is required — never blind retry.
- **Priority:** must
- **Source:** `AGENTCOWORK-SPEC.md` §5 · `DEC-002`
- **Acceptance:** stale-handle test across a simulated provider restart yields a rejection + re-resolution, not a silent reuse.
- **Failure cases:** stale handle used after restart → error surfaced; retry without re-resolution → forbidden.
- **Tests:** pending
- **Status:** seeded

#### REQ-CAP-003 — Capabilities describe what, never who
- **Statement:** GIVEN a capability descriptor, WHEN providers are attached, THEN the capability describes the operation and its risk; provider identity is an assignment, never part of the capability's contract.
- **Priority:** must
- **Source:** `ARCH/04-DECISIONS.md` DEC-004 · `ARCH/13-CAPABILITY.md` §1/§2
- **Acceptance:** capability ids and descriptors carry no provider identity; provider swap preserves the capability contract.
- **Failure cases:** provider baked into capability id or descriptor → review failure.
- **Tests:** pending
- **Status:** seeded

#### REQ-CAP-004 — Descriptor contract and census gate
- **Statement:** GIVEN any capability, WHEN it is registered, THEN it has a versioned descriptor (id, description, affordances, requirements, providers, loading mode, risk class, verification) and passes the census gate (unique id, non-empty affordances and verification).
- **Priority:** must
- **Source:** `ARCH/13-CAPABILITY.md` §2/§8 · `ARCH/06-DATA-MODEL.md` DM-011 · `ARCH/05-INVARIANTS.md` INV-19
- **Acceptance:** census gate rejects incomplete/duplicate descriptors; catalog generation derives providers from the registry.
- **Failure cases:** invocable capability without descriptor → rejection; duplicate id → rejection.
- **Tests:** pending
- **Status:** seeded

#### REQ-CAP-005 — Guidance and requires_user_action are first-class
- **Statement:** GIVEN a capability invocation that cannot complete alone, WHEN it returns, THEN it yields `guidance` or `requires_user_action` with a next action — a result, not a failure; failures are typed errors with retryability.
- **Priority:** must
- **Source:** `ARCH/13-CAPABILITY.md` §3
- **Acceptance:** result-model tests; UI renders guidance as workable next steps (no dead ends).
- **Failure cases:** guidance surfaced as failure → defect; completed result without receipt → violation (INV-07).
- **Tests:** pending
- **Status:** seeded

#### REQ-CAP-006 — Loading modes and semantic compression
- **Statement:** GIVEN agent-facing capability exposure, WHEN capabilities are activated, THEN only the declared loading mode applies (eager/catalog/on-demand) within the context budget; activation is scoped per agent/session/run; raw catalogs are never dumped (L1 semantic → L2 structured → L3 raw on demand).
- **Priority:** must
- **Source:** `ARCH/04-DECISIONS.md` DEC-005/024 · `ARCH/05-INVARIANTS.md` INV-13 · `ARCH/13-CAPABILITY.md` §6 · `ARCH/16-CONTEXT.md` §3
- **Acceptance:** budget tests; activation-scope tests; no flat dump in any prompt assembly.
- **Failure cases:** catalog dump → budget violation; unscoped activation leaking across agents → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-CAP-007 — Deterministic resolution and failover
- **Statement:** GIVEN a capability request with constraints, WHEN providers are ranked, THEN order is health → environment fit → permission fit → cost/latency, ties are broken deterministically and audited, and provider failure fails over per policy.
- **Priority:** must
- **Source:** `ARCH/13-CAPABILITY.md` §5/§9
- **Acceptance:** resolution-order tests; determinism test on tie; failover test with an unhealthy provider.
- **Failure cases:** nondeterministic selection → defect; no-provider → guidance path, never a dead end.
- **Tests:** pending
- **Status:** seeded

#### REQ-CAP-008 — Capability graph resolves requirements
- **Statement:** GIVEN a capability with `requires` edges, WHEN it is invoked, THEN requirement chains resolve before execution and a blocked chain names the missing edge.
- **Priority:** should
- **Source:** `ARCH/13-CAPABILITY.md` §7
- **Acceptance:** graph-resolution tests; blocked-chain error names the unmet requirement.
- **Failure cases:** silent resolution failure → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-CAP-009 — Registry governance and versioning
- **Statement:** GIVEN registry evolution, WHEN descriptors change, THEN changes are additive for minor versions; breaking changes require a decision and a deprecation window; deprecated capabilities stay resolvable until the window closes.
- **Priority:** should
- **Source:** `ARCH/13-CAPABILITY.md` §8
- **Acceptance:** versioning-policy tests; deprecation-window enforcement; breaking change without decision → rejected.
- **Failure cases:** silent breaking change → review failure.
- **Tests:** pending
- **Status:** seeded

#### REQ-CAP-010 — Invocable implies governed
- **Statement:** GIVEN anything invocable (native tool, MCP tool, connector, domain op), WHEN it is exposed, THEN it is a registered capability with descriptor, risk class and verification hook — no unregistered invocation path exists.
- **Priority:** must
- **Source:** `ARCH/05-INVARIANTS.md` INV-03/19 · `ARCH/13-CAPABILITY.md` §1
- **Acceptance:** census test shows every invocable surface has a capability id; dispatch rejects unregistered ids.
- **Failure cases:** unregistered tool invocable → architecture violation.
- **Tests:** pending
- **Status:** seeded

### Context (`CTX`)

#### REQ-CTX-001 — Context assembly is a non-touching read
- **Statement:** GIVEN context assembly (repo maps, memory recall, excerpts, world queries), WHEN it runs, THEN it never mutates durable state; recall counters bump only on explicit use.
- **Priority:** must
- **Source:** `ARCH/05-INVARIANTS.md` INV-08
- **Acceptance:** mutation-free recall tests; counters unchanged by assembly alone.
- **Failure cases:** assembly writing back "helpful" state → forbidden; usage counting as a side effect of read → forbidden.
- **Tests:** pending
- **Status:** seeded

#### REQ-CTX-002 — Budget honesty
- **Statement:** GIVEN context or memory budgets, WHEN content is injected, THEN budgets are maxima: zero relevant hits inject zero tokens; degradation drops whole items and never truncates an item.
- **Priority:** must
- **Source:** `ARCH/05-INVARIANTS.md` INV-22
- **Acceptance:** budget tests (p50/p95 injected tokens vs ceiling); zero-hit = zero-token test; no partial item in rendered output.
- **Failure cases:** idle tokens injected → budget test fails; truncated item → invalid injection.
- **Tests:** pending
- **Status:** seeded

### Memory (`MEM`)

#### REQ-MEM-001 — Memory v1 algorithm set
- **Statement:** GIVEN v1 memory, WHEN storage and algorithms are exercised, THEN storage is SQLite + FTS5, extraction is ADD-only with `superseded_by`, forget is suppression-based, and no vectors, graph or decay are required for v1 to function.
- **Priority:** must
- **Source:** `AGENTCOWORK-SPEC.md` §7 · `DEC-018`, `DEC-019`
- **Acceptance:** v1 acceptance suite passes without vector/graph/decay components; supersede and forget semantics verified.
- **Failure cases:** v1 behaviour requiring vectors → defect; forget followed by re-extraction → zero.
- **Tests:** pending
- **Status:** seeded

#### REQ-MEM-002 — Memory write discipline
- **Statement:** GIVEN a memory write, WHEN extraction runs, THEN it derives from settled history, runs off the hot path, never fails a turn, rejects secrets at write, and user forget is permanent.
- **Priority:** must
- **Source:** `ARCH/05-INVARIANTS.md` INV-09
- **Acceptance:** extractor-failure isolation test (turn unaffected); secret corpus never persisted; forget → re-extract = 0.
- **Failure cases:** memory failure breaking a turn → forbidden; secret persisted → verification failure; forgotten item re-appearing → defect.
- **Tests:** pending
- **Status:** seeded

### Workflow (`WF`)

#### REQ-WF-001 — Runs pinned to their version
- **Statement:** GIVEN an in-flight workflow run, WHEN the workflow definition is edited, THEN the run continues against its recorded version; a run never mutates underneath itself.
- **Priority:** must
- **Source:** `AGENTCOWORK-SPEC.md` §10 · `ARCH/05-INVARIANTS.md` INV-16
- **Acceptance:** edit-during-run test shows the run executes the pinned version; resume after restart still uses it.
- **Failure cases:** run picking up edited definition → defect; partial state from mixed versions → forbidden.
- **Tests:** pending
- **Status:** seeded

### Agent X (`AGX`)

#### REQ-AGX-001 — Delegation contract
- **Statement:** GIVEN Agent X delegates to a subagent, WHEN the child runs, THEN it runs in a child session with full escaped project rules, an optional per-spawn worktree, returns receipts (not transcripts), and its outer bounds are enforced by Core.
- **Priority:** must
- **Source:** `AGENTCOWORK-SPEC.md` §11 · `DEC-029`, `DEC-031`
- **Acceptance:** child-session isolation test; bounds enforcement test (time/steps/budget); handoff contains receipts, not raw transcripts.
- **Failure cases:** unbounded child → terminated by Core; transcript handoff → replaced by receipt summary; rule leakage across projects → zero.
- **Tests:** pending
- **Status:** seeded

### UI (`UI`)

#### REQ-UI-001 — Reasoning is summarized, never raw chain-of-thought
- **Statement:** GIVEN a model produces reasoning, WHEN it is rendered in chat, THEN the user sees a summarized, structured progress view — never raw chain-of-thought; markdown/mermaid rendering follows the policy-gated pipeline.
- **Priority:** must
- **Source:** `AGENTCOWORK-SPEC.md` §9 · `AGENTCOWORK-UI.md`
- **Acceptance:** no raw CoT in stored or displayed transcripts; mermaid renders only through the isolated, policy-gated path.
- **Failure cases:** raw CoT rendered → defect; unsanitised mermaid → blocked by isolation policy.
- **Tests:** pending
- **Status:** seeded

## 5. Seeding status

| Domain | Seeds | Next pass |
|---|---|---|
| `PROD` (6), `CTX` (2), `MEM` (2) | drafted above | verify + split during the P7 module passes (`16`, `17`) |
| `TRUST` (10), `CAP` (10) | drafted above + expanded in passes `12`/`13` | verified during passes `12` ✅ / `13` ✅ (2026-09-26) |
| `WF` (1), `AGX` (1), `UI` (1) | drafted above | `20`, Agent X finalisation lane, `AGENTCOWORK-UI.md` |
| `KERNEL` (7), `WORK` (8) | drafted above | verified during passes `10` ✅ / `11` ✅ (2026-09-26) |
| `PROV`, `MODEL`, `RTENV`, `WORLD`, `OFFICE`, `BROWSER`, `CUA`, `FILES`, `CODE`, `SEARCH`, `COMMS`, `ART`, `EVENTS`, `SKILL`, `CHAN`, `VERIFY` | pending | seeded during each module's P7 pass |

## 6. Related

- `AGENTCOWORK-SPEC.md` (WHAT) · `ARCH/03-HLD.md` (HOW) · `ARCH/05-INVARIANTS.md` (INV-*) · `ARCH/04-DECISIONS.md` (DEC-*)
- `ARCH/09-FEATURE-MATRIX.md` (traceability) · `TODO.md` (`TASK-*`) · `ARCH/42-EVIDENCE-MAP.md` (acceptance evidence)
- Process: `.agents/docs/spec-driven-development.md` · Template: `.agents/templates/SPEC.template.md`
