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

### Providers (`PROV`)

#### REQ-PROV-001 — No protocol vocabulary above the provider layer
- **Statement:** GIVEN any caller above the provider layer, WHEN it invokes work, THEN it speaks capability ids and never sees MCP tool names, ACP methods, HTTP paths or transport details; adapters are interchangeable behind one capability (one provider may implement many capabilities; one capability may have many providers).
- **Priority:** must
- **Source:** `ARCH/14-PROVIDERS.md` §1 · `ARCH/05-INVARIANTS.md` INV-15 · `ARCH/04-DECISIONS.md` DEC-004
- **Acceptance:** interface review finds no protocol vocabulary above the provider layer; one capability resolves to different providers without caller changes.
- **Failure cases:** transport name leaking into capability contracts or prompts → defect; caller bound to one provider → rejected.
- **Tests:** pending
- **Status:** seeded

#### REQ-PROV-002 — Adapter contract and lifecycle
- **Statement:** GIVEN a provider adapter, WHEN it is used, THEN it implements the `ProviderAdapter` contract (discover · connect · health · capabilities · execute · shutdown · events) with the register → connect → serve → shutdown lifecycle, and `execute` runs only with a validated handle and a ticket.
- **Priority:** must
- **Source:** `ARCH/14-PROVIDERS.md` §2 · `ARCH/07-CONTRACTS.md` CTR-010 · `ARCH/05-INVARIANTS.md` INV-03
- **Acceptance:** contract-conformance tests per adapter class; an `execute` call without handle or ticket is rejected.
- **Failure cases:** missing lifecycle call → adapter rejected at review; execute without ticket → `AuthorizationDenied`.
- **Tests:** pending
- **Status:** seeded

#### REQ-PROV-003 — Declared adapter classes
- **Statement:** GIVEN any provider, WHEN it registers, THEN it declares its adapter class — native · mcp · acp · http · cli · plugin · remote — and for `acp` the capability mapping preserves the agent's native tools.
- **Priority:** must
- **Source:** `ARCH/14-PROVIDERS.md` §3 · `ARCH/04-DECISIONS.md` DEC-025
- **Acceptance:** registry entries carry exactly one declared class; `acp` adapters expose tool mappings without flattening native tools.
- **Failure cases:** undeclared class → registration rejected; flattening native tools in an `acp` adapter → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-PROV-004 — MCP client dual-era policy
- **Statement:** GIVEN an MCP server connection, WHEN the era is negotiated, THEN the client tries the modern revision `2026-07-28` (stateless, context in `_meta`, `server/discover`) first and falls back to legacy `2025-11-25` (`initialize`), with per-transport detection (stdio probe with 10 s cap; HTTP 400-body classification), era caching per process/origin, and a per-server force-legacy escape hatch.
- **Priority:** must
- **Source:** `ARCH/14-PROVIDERS.md` §4 · `ARCH/04-DECISIONS.md` DEC-030 · `ARCHIVE/v1-research/mcp-provider-verification.md`
- **Acceptance:** dual-era tests against both revisions; detection and cache tests; force-legacy honored; client core carries both revisions (`rmcp` 3.4.x).
- **Failure cases:** permanent mismatch → provider marked incompatible with reason; detection that loses capabilities → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-PROV-005 — MCP server façade compliance
- **Statement:** GIVEN our MCP façade, WHEN an external client connects, THEN it serves stateless modern behavior with `initialize` compatibility, MUST implement `server/discover`, and MUST validate `Mcp-Method` and `Mcp-Name` headers.
- **Priority:** must
- **Source:** `ARCH/14-PROVIDERS.md` §4
- **Acceptance:** façade tests cover modern and legacy clients; `server/discover` present; header validation rejects mismatches.
- **Failure cases:** missing `server/discover` → client cannot negotiate; unvalidated headers → request rejected.
- **Tests:** pending
- **Status:** seeded

#### REQ-PROV-006 — Epoch discipline and health-first resolution
- **Statement:** GIVEN adapter instances and provider health, WHEN an adapter restarts or degrades, THEN its `provider_epoch` bumps and outstanding handles are invalidated, and the resolver skips degraded providers before they fail a call; health events publish on the event plane and the UI reads the registry.
- **Priority:** must
- **Source:** `ARCH/14-PROVIDERS.md` §5 · `ARCH/04-DECISIONS.md` DEC-002 · `ARCH/30-EVENTS.md`
- **Acceptance:** restart invalidates handles; degraded-before-fail ordering test; per-capability health isolates partial failure; no second store for provider health.
- **Failure cases:** stale handle accepted after epoch bump → `InvalidState`; degraded provider attempted first → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-PROV-007 — Registry entry shape and id mapping
- **Statement:** GIVEN the provider registry, WHEN entries are stored, THEN each follows `DM-013` (id · kind · version · health · capabilities ref · environments · epoch) and carries distinct `catalog_ref` and `transport_ref` alongside the canonical id, with auth modeled as a typed method enum (api · oauth · well-known) that never holds values.
- **Priority:** must
- **Source:** `ARCH/14-PROVIDERS.md` §5 · `ARCH/06-DATA-MODEL.md` DM-013 · `ARCH/12-TRUST.md` §6
- **Acceptance:** schema tests; several transports may share one catalog entry; auth-method metadata carries no secret material.
- **Failure cases:** credential value in registry → custody violation; canonical id aliased with a transport id → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-PROV-008 — Adapter egress and custody compliance
- **Statement:** GIVEN any adapter network or secret access, WHEN it connects or executes, THEN egress passes Guard (allowlists), secrets are `use`-style vault references only, environment scoping (local · sandbox · remote) is part of the handle, and denial is a typed error with no silent fallback.
- **Priority:** must
- **Source:** `ARCH/14-PROVIDERS.md` §6 · `ARCH/05-INVARIANTS.md` INV-02/05 · `ARCH/07-CONTRACTS.md` CTR-013
- **Acceptance:** static checks find no direct egress clients above the adapter layer; unauthorized egress test returns typed deny; secret scan clean.
- **Failure cases:** silent fallback route after DENY → violation; plaintext secret in adapter config → custody violation.
- **Tests:** pending
- **Status:** seeded

#### REQ-PROV-009 — Gateway client identity and session affinity
- **Statement:** GIVEN a gateway-class provider, WHEN a conversation runs, THEN adapters inject the client-identity User-Agent and the session-affinity header (`x-opencode-session` class) from session identity, and a provider entry carries multiple `transport_ref`s when one gateway hosts several wire protocols.
- **Priority:** must
- **Source:** `ARCH/14-PROVIDERS.md` §5 · `ARCH/04-DECISIONS.md` DEC-035 · `ARCH/18-MODEL-ROUTING.md` §4
- **Acceptance:** header-injection tests per conversation; multi-protocol gateway resolves per transport; identity stable across a conversation.
- **Failure cases:** missing affinity header → provider-side session split (defect); client identity spoofed or missing → rejected.
- **Tests:** pending
- **Status:** seeded

#### REQ-PROV-010 — Typed, bounded provider failures
- **Statement:** GIVEN provider failures (crash · protocol mismatch · schema drift · connect timeout · stream idle · auth expiry · cost mismatch), WHEN they occur, THEN behavior is typed and bounded: epoch-bump failover, at most one era retry, descriptor diff + typed failures for removed capabilities, watchdog aborts with reason, refresh-or-guidance on auth, actual-cost override with audit event — never silent.
- **Priority:** must
- **Source:** `ARCH/14-PROVIDERS.md` §7 · `ARCH/30-EVENTS.md` · `ARCH/34-EFFECT-VERIFICATION.md`
- **Acceptance:** failure-mode matrix tests (one per row); each failure surfaces a typed error or event; audit event on cost mismatch.
- **Failure cases:** unbounded retry loop → defect; silent capability removal → defect.
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

#### REQ-CTX-003 — Two-layer split: infrastructure vs control
- **Statement:** GIVEN context handling, WHEN responsibilities are assigned, THEN Core provides context infrastructure (search/snapshot/get/checkpoint/projection — “what context exists”) and the bound agent owns context control (assemble/select/prune/compact/pin/exclude — “what the model sees”), and neither layer does the other’s job.
- **Priority:** must
- **Source:** `ARCH/04-DECISIONS.md` DEC-007 · `ARCH/16-CONTEXT.md` §1
- **Acceptance:** Core exposes no policy deciding what the model sees; agent control ops call Core services instead of reaching into sources; for external agents their native context control is preserved (INV-12) with only the projection seam of `12`/`32`.
- **Failure cases:** Core silently selecting or truncating model context → architecture violation; an agent mutating source stores to build context → denied (read-only, INV-08).
- **Tests:** pending
- **Status:** seeded

#### REQ-CTX-004 — References over copies; read-only sources
- **Statement:** GIVEN a context item, WHEN it is assembled or retrieved, THEN items reference their source (`content_ref` + metadata) rather than duplicating content, and every read passes the context service without mutating sources.
- **Priority:** must
- **Source:** `ARCH/16-CONTEXT.md` §1.1/§2 · `ARCH/05-INVARIANTS.md` INV-08
- **Acceptance:** no source-store write path from context assembly; injected content byte-identical to the referenced artifact/record version; changed sources are re-read, never silently stale-copied.
- **Failure cases:** copy divergence → defect (stale context); write through assembly → violation.
- **Tests:** pending
- **Status:** seeded

#### REQ-CTX-005 — Pre-turn feasibility, named budget terms
- **Statement:** GIVEN a model call, WHEN the turn is prepared, THEN the usable window is computed as model_window_resolved − output_reserve − reasoning_reserve − summary_output_reserve − tool_schema_reserve − system_reserve − safety_buffer and feasibility is checked BEFORE send — overflow is never discovered from the provider; values are product-visible knobs.
- **Priority:** must
- **Source:** `ARCH/16-CONTEXT.md` §3 · `ARCH/04-DECISIONS.md` DEC-027
- **Acceptance:** budget math unit tests per model class; an oversized turn is caught pre-send and recovered (never surfaced as a provider error while recovery options remain); telemetry shows the named terms.
- **Failure cases:** provider-side overflow after send → defect; missing reserve term → defect; silent rounding that overruns → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-CTX-006 — Prune before compact; durable full output
- **Statement:** GIVEN pressure on the window, WHEN the pipeline reacts, THEN pruning runs before compaction, pruned-away full output stays durable (artifact/event) and is marked reconstructable, and pruning is opt-in per agent configuration — never applied to log truth.
- **Priority:** must
- **Source:** `ARCH/16-CONTEXT.md` §4
- **Acceptance:** pruned output retrievable from durable storage; `reconstructable` flag honored (a needed pruned target is recovered, never lost); ordering test (prune strictly precedes compact).
- **Failure cases:** pruned content unrecoverable → verification failure; compaction before pruning → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-CTX-007 — Compaction is a projection; log never rewritten
- **Statement:** GIVEN a compaction trigger (auto threshold, manual “optimize now”, overflow recovery), WHEN it runs, THEN it produces a checkpoint projection over the durable session log without rewriting the log; the chain is deterministic pruning → structured checkpoint → model-written summary for non-reconstructable residue → optional provider-native path; hooks fire pre/post compaction.
- **Priority:** must
- **Source:** `ARCH/16-CONTEXT.md` §4 · `ARCH/11-WORK.md` §4
- **Acceptance:** post-compaction log byte-identical except appended compaction events; resume after compaction uses log + checkpoint only; checkpoint fields follow the documented shape (objective/requirements/decisions/completed/active/files/tests/artifacts/workers/blockers/next_actions).
- **Failure cases:** log rewritten in place → architecture violation; compaction losing durable entries → verification failure; unbounded recovery loop → bounded retries, harder compact, then surfaced.
- **Tests:** pending
- **Status:** seeded

#### REQ-CTX-008 — Checkpoint reconstructability; rebuild prefers live state
- **Statement:** GIVEN any checkpoint, WHEN it is used for resume or rebuild, THEN it is versioned and reconstructable from log + artifacts, and `rebuild` prefers live state over a stale checkpoint.
- **Priority:** must
- **Source:** `ARCH/16-CONTEXT.md` §4/§9
- **Acceptance:** reconstruct test from log + artifacts alone; staleness test shows rebuild choosing live sources; version mismatch handled by an explicit migration/rebuild decision.
- **Failure cases:** non-reconstructable checkpoint mislabeled → defect; stale checkpoint silently used → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-CTX-009 — Cache stability
- **Statement:** GIVEN repeated model calls in a session, WHEN context is packed, THEN the stable prefix (system contract, agent identity, project rules, stable tool definitions) stays stable, dynamic content lands in a suffix, injection blocks are frozen once computed for the session (memory always-on block computed once), and turns ship baseline + deltas.
- **Priority:** must
- **Source:** `ARCH/16-CONTEXT.md` §5
- **Acceptance:** prefix-stability test across turns (byte-stable until a real change); a frozen injection block is not recomputed mid-session; cache-hit telemetry.
- **Failure cases:** recomputing the always-on block per turn → defect (cache churn); dynamic content placed in the prefix → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-CTX-010 — Projection scoping, deny-by-default
- **Statement:** GIVEN an external agent or any projection consumer, WHEN a context projection is requested, THEN the slice is scoped (project/workspace/task/step/artifact/user), sensitivity-filtered at Core and re-enforced at Trust, and deny-by-default for anything not explicitly in scope.
- **Priority:** must
- **Source:** `ARCH/16-CONTEXT.md` §1.3 · `ARCH/04-DECISIONS.md` DEC-009 · `ARCH/05-INVARIANTS.md` INV-11
- **Acceptance:** out-of-scope request denied with typed error; confidential items never enter a broader assembly; the `32` contract is enforced together with `12`.
- **Failure cases:** unscoped projection leak → verification failure; sensitivity-filter bypass → violation.
- **Tests:** pending
- **Status:** seeded

### Memory (`MEM`)

#### REQ-MEM-001 — Memory v1 algorithm set
- **Statement:** GIVEN v1 memory, WHEN storage and algorithms are exercised, THEN storage is one Core-owned SQLite file in WAL mode with FTS5 kept in sync by triggers, extraction is ADD-only with a `superseded_by` pointer, forget is suppression-based, and no vectors, graph, decay or consolidation loops are required for v1 to function.
- **Priority:** must
- **Source:** `AGENTCOWORK-SPEC.md` §7 · `ARCH/04-DECISIONS.md` DEC-018 · `ARCH/06-DATA-MODEL.md` DM-018
- **Acceptance:** the v1 acceptance suite passes with no vector/graph/decay component; supersede and suppression-forget semantics verified; a deterministic integrity check rebuilds FTS from the item store.
- **Failure cases:** any v1 behaviour requiring vectors/graph/decay → defect; FTS drift after mutations → integrity check rebuilds it, and the test fails if it does not.
- **Tests:** pending
- **Status:** seeded

#### REQ-MEM-002 — Memory write discipline and non-blocking degradation
- **Statement:** GIVEN any memory activity, WHEN extraction, storage or recall fails or a scope is disabled, THEN the turn is never blocked or failed: extraction derives from settled history and runs off the hot path, secrets are rejected at write, user forget is permanent, a storage failure disables memory for the session with a surfaced warning, and a disabled memory performs no injection, retrieval, writes or background extraction.
- **Priority:** must
- **Source:** `ARCH/05-INVARIANTS.md` INV-09 · `ARCH/17-MEMORY.md` §1/§8
- **Acceptance:** extractor-failure isolation test (turn unaffected); DB-locked test degrades memory only; secret corpus never persisted; disabled-scope test shows zero activity; forget → re-extract = 0.
- **Failure cases:** memory failure breaking a turn → forbidden; secret persisted → verification failure; disabled memory still writing or injecting → defect; forgotten item re-appearing → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-MEM-003 — Memory ≠ context: recall returns candidates
- **Statement:** GIVEN a recall request, WHEN it is served, THEN memory returns ranked candidates with provenance and never decides inclusion — the Context Controller decides what enters the model's context, and memory exposes no injection policy of its own.
- **Priority:** must
- **Source:** `ARCH/04-DECISIONS.md` DEC-019 · `AGENTCOWORK-SPEC.md` §2 (P-10) · `ARCH/16-CONTEXT.md` §1
- **Acceptance:** a recall response contains candidates and provenance only; injection-selection tests live in the context layer; memory exposes no API that writes into a prompt.
- **Failure cases:** memory injecting directly into a turn → architecture violation; recall returning a pre-truncated injection block → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-MEM-004 — Non-touching read
- **Statement:** GIVEN context assembly, recall, or inspection, WHEN memory is read, THEN no memory state mutates — no counter, salience or timestamp changes; `used_count`/`last_used_at` bump only on the explicit-use path (or stay deferred), never as a side effect of reading.
- **Priority:** must
- **Source:** `ARCH/05-INVARIANTS.md` INV-08 · `ARCH/17-MEMORY.md` §6
- **Acceptance:** mutation-free recall test (store contents byte-identical before and after assembly); counters unchanged unless explicit use runs; deferred counters leave no hidden writes.
- **Failure cases:** a read causing a write → violation; implicit usage counting → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-MEM-005 — Scope model and lifecycle
- **Statement:** GIVEN any memory item, WHEN it is stored or read, THEN it carries exactly one scope — `session` (TTL 7 days after session end) · `task` · `project` · `user` · `org` (schema-ready, disabled in v1) — with lifetime rules enforced: session items expire by default, summaries are pruned by count/age, and pinned items are never auto-pruned.
- **Priority:** must
- **Source:** `ARCH/17-MEMORY.md` §2.1/§7 · `ARCH/06-DATA-MODEL.md` DM-018
- **Acceptance:** scope-validation tests (unknown scope rejected); TTL-expiry test; org-scope writes rejected in v1; pinned item survives pruning.
- **Failure cases:** unscoped item persisted → defect; org items written in v1 → rejected; pinned item auto-pruned → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-MEM-006 — Isolation, sensitivity and projection
- **Statement:** GIVEN a recall or projection request, WHEN items are selected, THEN recall filters current/unexpired items with sensitivity ≤ the caller ceiling, `confidential` items never leave their owning project scope, and an external agent receives only its permitted projection — owning project scope plus its own session/task plus user preferences; no org, no other projects, no `confidential` without an explicit loadout (v1 default: project + user).
- **Priority:** must
- **Source:** `ARCH/05-INVARIANTS.md` INV-10 · `ARCH/04-DECISIONS.md` DEC-009 · `ARCH/12-TRUST.md` §8 · `ARCH/17-MEMORY.md` §4/§9
- **Acceptance:** cross-project leakage = 0; external-agent view test shows no org, other-project or confidential items; sensitivity-ceiling test rejects above-ceiling items; superseded items are never served as current.
- **Failure cases:** confidential item in a broader assembly → verification failure; projection leaking another project → security violation; superseded item served as current → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-MEM-007 — Extraction trigger discipline
- **Statement:** GIVEN a session or task, WHEN extraction is considered, THEN it runs only at settled boundaries (session idle ≥5 min or task completion) behind a cheap signal gate — no signal means no model call and no write — with debounce bounded to ≈1 run per 10 turns per scope and a bounded harvest (≤20 turns, per-message truncation, top-k existing items of the same scope for link/supersede).
- **Priority:** must
- **Source:** `ARCH/17-MEMORY.md` §5 · `ARCH/04-DECISIONS.md` DEC-018
- **Acceptance:** no-signal test shows zero model calls and zero writes; debounce test; harvest-bound test (harvest stays capped); settled-boundary test (extraction never runs mid-turn).
- **Failure cases:** extraction on the hot path → forbidden; unbounded harvest → defect; signal-gate bypass outside the explicit `memory.remember` path → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-MEM-008 — Extractor contract and deterministic validation
- **Statement:** GIVEN a scheduled extraction, WHEN the extractor runs, THEN it is one model call with the closed verb set `ADD | SUPERSEDE (target id required) | NONE`, at most 3 items per run, no scope widening without an explicit user statement, relative dates resolved to absolute, followed by deterministic validation — normalize + hash, drop batch/store duplicates and suppressed hashes, reject secrets with a log (never persist), verify each `SUPERSEDE` target exists, is current and is same-or-narrower scope — all persisted in a single transaction with FTS sync and one audit event.
- **Priority:** must
- **Source:** `ARCH/17-MEMORY.md` §5.3–5.5 · `ARCH/04-DECISIONS.md` DEC-018
- **Acceptance:** verb-set test (unknown verb rejected); cap test (over-cap items dropped); scope-widening test rejected without a user statement; secret rejection logged; supersede-target validation matrix; single-transaction rollback test with FTS consistency.
- **Failure cases:** model-rewritten stored text → impossible by construction (verbs only); invalid supersede target → rejected; partial write on failure → transaction rollback and job marked error.
- **Tests:** pending
- **Status:** seeded

#### REQ-MEM-009 — Supersede semantics and staleness
- **Statement:** GIVEN an item superseded by the extractor or a user edit, WHEN the store is read or written, THEN the original body is never rewritten — a single `superseded_by` pointer marks the reversal, superseded rows are retained for audit but filtered from read paths, and after an explicit supersede the stale original is never served again.
- **Priority:** must
- **Source:** `ARCH/17-MEMORY.md` §7 · `ARCH/04-DECISIONS.md` DEC-018
- **Acceptance:** stale-return on explicit supersede = 0 across the conflict suite; superseded rows remain in the store but absent from recall/inspect current views; pointer integrity (target current) test.
- **Failure cases:** stored text rewritten by a model → violation; superseded row served as current → defect; dangling `superseded_by` → integrity failure.
- **Tests:** pending
- **Status:** seeded

#### REQ-MEM-010 — Forget and scope wipe are permanent
- **Statement:** GIVEN a user forget or scope wipe, WHEN it executes, THEN forget hard-deletes the item, writes a content-hash suppression (blocking re-extraction of identical content) and an audit entry; a scope wipe removes that scope's items, superseded rows and suppressions; both are permanent, and replaying the same history cannot resurrect the item.
- **Priority:** must
- **Source:** `ARCH/05-INVARIANTS.md` INV-09/INV-24 · `ARCH/17-MEMORY.md` §4/§7
- **Acceptance:** re-extraction after forget = 0; wipe leaves no FTS orphans; every forget/wipe audited append-only; suppression survives re-ingestion.
- **Failure cases:** forgotten item re-appearing → defect; unaudited delete → violation; scope wipe leaving superseded rows or suppressions behind → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-MEM-011 — Inspect, export and import
- **Statement:** GIVEN the Memory UI or tooling, WHEN a user inspects, exports or imports memory, THEN every item shows scope/source/created-at and supports per-item delete and per-scope wipe; `memory.export` / `memory.import` support `json | md`; imports re-run hash and secret checks and land as `source='import'`; an export → import round-trip is byte-identical.
- **Priority:** must
- **Source:** `ARCH/17-MEMORY.md` §4/§13 · `AGENTCOWORK-SPEC.md` §7
- **Acceptance:** provenance visible for every item; delete/wipe reachable from the UI; round-trip byte-identical; imported duplicates dedupe by hash; secret scan runs on import.
- **Failure cases:** missing provenance → defect; import bypassing validation → rejected; import silently widening scope → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-MEM-012 — Recall performance and injection budget honesty
- **Statement:** GIVEN recall and injection under the memory budget, WHEN queries run at 10k items, THEN recall p95 is ≤ 50 ms, zero relevant hits inject zero tokens, degradation drops whole items — never truncating an item — with injection measured on rendered output, and extraction cost stays visible through `memory.extraction.run` events.
- **Priority:** must
- **Source:** `ARCH/05-INVARIANTS.md` INV-22 · `ARCH/17-MEMORY.md` §6/§10
- **Acceptance:** p95 ≤ 50 ms at 10k measured in the eval suite; zero-hit = zero-token test; no partial item in rendered injection; extraction cost events present per run.
- **Failure cases:** idle tokens injected → budget test fails; truncated item → invalid injection; extraction spend without an event → telemetry defect.
- **Tests:** pending
- **Status:** seeded

### Models (`MODEL`)

#### REQ-MODEL-001 — One registry, one router, no hard-coded vendor
- **Statement:** GIVEN any model — cloud or local — WHEN it is registered or selected, THEN it lives behind exactly one model registry and one router, no module hard-codes a vendor, and callers never address a provider endpoint directly.
- **Priority:** must
- **Source:** `AGENTCOWORK-SPEC.md` §2 (P-03) · `ARCH/04-DECISIONS.md` DEC-004 · `ARCH/18-MODEL-ROUTING.md` §1
- **Acceptance:** registry census shows every selectable model has one entry; static check finds no vendor-specific selection logic outside the router; swapping a provider changes no caller.
- **Failure cases:** a module calling a vendor endpoint outside the router → architecture violation; a second registry or router → review failure.
- **Tests:** pending
- **Status:** seeded

#### REQ-MODEL-002 — ModelDescriptor contract
- **Statement:** GIVEN a registered model, WHEN its descriptor is stored, THEN it follows `DM-025` — id, provider, resolved context window and max output, tool-calling support, reasoning modes, vision, streaming, structured output, cost, latency class, locality and tokenizer ref, plus the declared lifecycle/visibility, family/release, variants/options, transport and catalog refs, prompt-cache and privacy additions — and no capability beyond the declared set is offered.
- **Priority:** must
- **Source:** `ARCH/18-MODEL-ROUTING.md` §2 · `ARCH/06-DATA-MODEL.md` DM-025
- **Acceptance:** schema validation rejects incomplete descriptors; router and UI read declared capabilities only (composer negotiation shows supported options); a privacy-flagged model is excluded from disallowed scopes.
- **Failure cases:** missing required field → registration rejected; undeclared capability offered to a caller → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-MODEL-003 — Catalog is data, never code
- **Statement:** GIVEN catalog data and local discovery, WHEN the catalog refreshes, THEN it is vendored/compiled as data with a short TTL (≈5 min), atomic tmp+rename writes, a cross-process lock and an offline vendored snapshot, a scheduled refresh (≈60 min) emits a refresh event, refresh failures are logged and never block the UI, and provider SDKs are never installed at runtime.
- **Priority:** must
- **Source:** `ARCH/18-MODEL-ROUTING.md` §2 · `ARCH/04-DECISIONS.md` DEC-034
- **Acceptance:** refresh tests (TTL honored, atomicity under simulated crash, lock contention); offline start works from the snapshot; a failed refresh does not block the UI; no runtime package-install path exists.
- **Failure cases:** torn catalog write → defect; refresh failure blocking the UI → defect; runtime SDK installation → rejected (DEC-034).
- **Tests:** pending
- **Status:** seeded

#### REQ-MODEL-004 — Deterministic routing and no silent downgrade
- **Statement:** GIVEN a selection request with preferences and constraints, WHEN the router resolves, THEN ranking is deterministic and audited from agent-profile default, session override, task requirements, policy, availability and preference weights, the selection carries its declared fallback chain, and an unmet requirement (vision · tools · reasoning · context size) yields `GuidanceRequired`/`RequiresUserAction` — never a silent capability downgrade or emulated tool.
- **Priority:** must
- **Source:** `ARCH/18-MODEL-ROUTING.md` §3 · `ARCH/07-CONTRACTS.md` CTR-014
- **Acceptance:** determinism test on identical inputs (stable order, audited tie-break); unmet-requirement test returns guidance; failover test with an unavailable provider; a policy-denied model is never selected.
- **Failure cases:** nondeterministic selection → defect; silent downgrade or tool emulation → defect; provider down without failover or typed `Unavailable` → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-MODEL-005 — Vault-only credentials in the model plane
- **Statement:** GIVEN adapter auth and endpoint configuration, WHEN a model call is made, THEN credentials are vault `use`-style references only — never values — and keys never appear in logs, prompts, telemetry or stored config.
- **Priority:** must
- **Source:** `ARCH/05-INVARIANTS.md` INV-02 · `ARCH/07-CONTRACTS.md` CTR-013 · `ARCH/18-MODEL-ROUTING.md` §4
- **Acceptance:** secret-corpus scan over logs/prompts/telemetry is clean; endpoint config carries references only; the model plane exposes no read-value API.
- **Failure cases:** key in a log or prompt → verification failure; plaintext fallback when the vault is unavailable → typed `Unavailable`, never a stored copy.
- **Tests:** pending
- **Status:** seeded

#### REQ-MODEL-006 — One typed stream union above adapters
- **Statement:** GIVEN any streaming completion, WHEN events reach callers, THEN they use one typed stream-event union (step-start · text/reasoning/tool-input deltas · tool-call/result/error · step-finish · finish · provider-error) with explicit block ids synthesized when absent, step-finish and turn-finish distinct, and cancellation and backpressure mandatory — no consumer branches on provider id.
- **Priority:** must
- **Source:** `ARCH/18-MODEL-ROUTING.md` §4 · `ARCH/04-DECISIONS.md` DEC-034 · `ARCH/15-AGENT-X.md` §4
- **Acceptance:** union-conformance tests per adapter; block-id synthesis test; provider-id branching absent above the adapter; cancellation and backpressure tests.
- **Failure cases:** provider-specific event shape leaking upward → defect; missing step/turn distinction → defect; silent stream end treated as success → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-MODEL-007 — Usage and cost accounting invariant
- **Statement:** GIVEN a completed model call, WHEN usage and cost are reported, THEN totals are inclusive with a non-overlapping breakdown (`non_cached_input` · `cache_read` · `cache_write` · `reasoning`), values are clamped and consumers never subtract; cost is cache-class-aware (read/write pricing · size tiers · >200k class), provider-reported actuals override catalog estimates, included/free plans are exactly 0, a mismatch is logged as an event, and telemetry carries no prompt or completion content.
- **Priority:** must
- **Source:** `ARCH/18-MODEL-ROUTING.md` §7 · `ARCH/04-DECISIONS.md` DEC-034 · `ARCH/30-EVENTS.md` §5
- **Acceptance:** usage-invariant tests (breakdown stays within the inclusive total; clamping test); actual-overrides-estimate test; mismatch event test; telemetry content scan clean.
- **Failure cases:** consumer subtracting fields → forbidden by the written invariant; negative/underflow value → clamped; prompt/completion content in telemetry → verification failure.
- **Tests:** pending
- **Status:** seeded

#### REQ-MODEL-008 — Single-owner retry discipline
- **Statement:** GIVEN a failed model request, WHEN retries are considered, THEN exactly one layer owns each failure class — request-start transport retries (exponential + jitter, honoring `retry-after`) · pre-content stream interruptions via buffer-until-proven with discarded-attempt usage summed · post-content failures handled at the turn level; a user abort anywhere vetoes retry, and context overflow is terminal.
- **Priority:** must
- **Source:** `ARCH/18-MODEL-ROUTING.md` §4 · `ARCH/04-DECISIONS.md` DEC-034
- **Acceptance:** retry-ownership matrix test (one owner per class); user-abort veto test; usage aggregation across discarded attempts; overflow ends without retry.
- **Failure cases:** two layers retrying one failure → defect; adapter retrying a post-content failure → defect; discarded-attempt usage lost → accounting defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-MODEL-009 — Watchdogs and typed provider errors
- **Statement:** GIVEN a stalled or failing provider stream, WHEN a watchdog fires or the provider errors, THEN header/chunk-idle/read timeouts abort with an explicit reason, a network-error finish fails the step rather than silently ending it, and every failure maps to the typed taxonomy (`InvalidRequest` · `Authentication` · `RateLimit{retryAfterMs}` · `QuotaExceeded` · `ContentPolicy` · `ProviderInternal` · `Transport` · `ContextOverflow`) with `retryable` derived from the type — rate limits back off and surface, and auth expiry gets one refresh attempt where supported, else re-auth guidance.
- **Priority:** must
- **Source:** `ARCH/18-MODEL-ROUTING.md` §4/§8 · `ARCH/04-DECISIONS.md` DEC-034
- **Acceptance:** watchdog matrix tests (each timeout → typed abort reason); taxonomy mapping test; retryability-derivation test; rate-limit backoff/queue surfaced; auth-expiry path test.
- **Failure cases:** silent hang → defect; silent stream end on network error → defect; untyped error crossing a boundary → defect; unbounded retry on auth failure → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-MODEL-010 — Local discovery and locality guarantee
- **Statement:** GIVEN local model servers (Ollama · LM Studio · vLLM · llama.cpp · any OpenAI-compatible endpoint), WHEN discovery runs, THEN the runtime probes endpoints, lists and health-checks models and registers them like any other provider with no manual configuration on the common path (manual entry stays as fallback), and a model declared `locality: local` produces no egress from the machine.
- **Priority:** must
- **Source:** `ARCH/18-MODEL-ROUTING.md` §6 · `ARCH/05-INVARIANTS.md` INV-05
- **Acceptance:** discovery test against a local server; unconfigured common-path test; egress-observation test shows zero external traffic for local models; manual entry works.
- **Failure cases:** a local model routed through cloud egress → violation; local server version drift → health re-probe + descriptor refresh + degraded marking; discovery failure → typed `Unavailable` with guidance.
- **Tests:** pending
- **Status:** seeded

#### REQ-MODEL-011 — Reasoning-effort mapping
- **Statement:** GIVEN a reasoning-capable model, WHEN reasoning effort is chosen, THEN one normalized dial (`auto · minimal · low · medium · high · extra_high`) maps to the provider's parameter, the descriptor declares which levels exist, only supported levels are offered, an unsupported choice is never silently downgraded, and raw chain-of-thought never enters the transcript.
- **Priority:** must
- **Source:** `ARCH/18-MODEL-ROUTING.md` §5 · `ARCH/04-DECISIONS.md` DEC-034
- **Acceptance:** mapping tests per declared level; unsupported level not offered (composer negotiation); transcript scan finds no raw chain-of-thought.
- **Failure cases:** unsupported level silently ignored → defect; raw chain-of-thought rendered → UI defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-MODEL-012 — Resolved window feeds context feasibility
- **Statement:** GIVEN a resolved model selection, WHEN a turn is prepared, THEN the model's resolved window and the router's reserves feed the context pre-turn feasibility check (`window − reserves`) from shared constants, and a window/estimate mismatch is resolved before send through the context recovery path — never discovered as a provider error mid-stream.
- **Priority:** must
- **Source:** `ARCH/18-MODEL-ROUTING.md` §3 · `ARCH/04-DECISIONS.md` DEC-027 · `ARCH/16-CONTEXT.md` §3
- **Acceptance:** shared-constant test (router and context compute identical numbers); mismatch test triggers pre-send recovery; no provider-side overflow while recovery options remain.
- **Failure cases:** router and context diverging on window arithmetic → defect; overflow surfaced by the provider after send → defect.
- **Tests:** pending
- **Status:** seeded

### Runtime environments (`RTENV`)

#### REQ-RTENV-001 — Runtime executes confinement, never decides it
- **Statement:** GIVEN any process or environment action, WHEN the runtime acts, THEN it executes the policy decided by the single Trust decider and never evaluates its own permission policy; no second permission path exists inside the runtime.
- **Priority:** must
- **Source:** `ARCH/05-INVARIANTS.md` INV-04 · `ARCH/04-DECISIONS.md` DEC-028 · `ARCH/19-RUNTIME-ENVIRONMENTS.md` §1
- **Acceptance:** static check finds no policy evaluation in the runtime; spawn inputs arrive pre-validated by the exec-policy layer; a runtime-local allow-list fails review.
- **Failure cases:** runtime allowing an action Trust denied → violation; policy logic duplicated in the runtime → review failure.
- **Tests:** pending
- **Status:** seeded

#### REQ-RTENV-002 — Sandbox backends fail closed
- **Statement:** GIVEN a confined action, WHEN the requested sandbox backend is unavailable, THEN the runtime walks the declared ladder (next backend → deny with reason); protected subpaths (e.g. VCS hooks) stay read-only inside writable roots; unconfined execution happens only under an explicit policy flag that is audited and surfaced — never by default.
- **Priority:** must
- **Source:** `ARCH/04-DECISIONS.md` DEC-028 · `ARCH/19-RUNTIME-ENVIRONMENTS.md` §1/§4 · `ARCH/42-EVIDENCE-MAP.md` §3
- **Acceptance:** backend-unavailable test denies after the ladder (or uses the explicitly allowed, audited mode); protected-subpath write test fails; containment/escape results recorded in the evidence map.
- **Failure cases:** silently unconfined spawn → violation; missing backend treated as success → violation; protected subpath writable → security failure.
- **Tests:** pending
- **Status:** seeded

#### REQ-RTENV-003 — Every process belongs to an environment
- **Statement:** GIVEN any spawned process, WHEN it starts, THEN it belongs to exactly one environment whose identity appears in capability handles and whose declared fields are enforced — kind (`local` · `sandbox` · `worktree`; `remote`/`cloud` later), platform, the confinement profile actually in use, resource limits, workspace roots under pathfloor with scope `shared`/`isolated-worktree`/`sandbox`, network policy ref, and lifetime tied to session/work/detached scope.
- **Priority:** must
- **Source:** `ARCH/19-RUNTIME-ENVIRONMENTS.md` §2 · `ARCH/07-CONTRACTS.md` CTR-015 · `ARCH/06-DATA-MODEL.md` DM-015
- **Acceptance:** environment-identity test (a process without an environment is rejected); limit-enforcement tests; pathfloor test (writes outside workspace roots denied); lifetime test (session end releases session-scoped environments).
- **Failure cases:** process outside any environment → defect; declared limit not enforced → defect; workspace escape → security violation.
- **Tests:** pending
- **Status:** seeded

#### REQ-RTENV-004 — Process trees, orphans and detached work
- **Statement:** GIVEN a running process tree, WHEN a parent exits or cancellation propagates, THEN children are tracked parent→child, cancellation follows the `ARCH/11-WORK.md` §6 semantics, orphans are reaped on parent death, and detached processes are registered for rehydration — never left as unregistered orphans.
- **Priority:** must
- **Source:** `ARCH/19-RUNTIME-ENVIRONMENTS.md` §1/§3 · `ARCH/11-WORK.md` §6 · `ARCH/04-DECISIONS.md` DEC-031
- **Acceptance:** tree-cancellation test; orphan-reaping test; detached registration + rehydration test; no orphan survives without a registry record.
- **Failure cases:** orphaned child after parent death → defect; detached process unregistered → defect; cancellation not propagated to children → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-RTENV-005 — Two PTY classes
- **Statement:** GIVEN a terminal surface, WHEN a PTY is created, THEN it is one of two classes — agent terminal (programmatic, policy-scoped) or user terminal (interactive, user-owned) — served by the same manager under different policies, with class-appropriate authorization.
- **Priority:** must
- **Source:** `ARCH/19-RUNTIME-ENVIRONMENTS.md` §3
- **Acceptance:** class-policy tests (agent PTY actions mediated; user PTY user-owned); same-manager test (one lifecycle/registry path); wrong-class authorization denied.
- **Failure cases:** agent PTY bypassing policy → violation; user terminal silently scripted by an agent → violation.
- **Tests:** pending
- **Status:** seeded

#### REQ-RTENV-006 — Output is durable evidence, bounded to context
- **Statement:** GIVEN process output, WHEN it is produced, THEN the full output persists bounded to an artifact/event while the model-facing view is a compact representation plus a reference — unbounded output never streams into context, and no evidence is discarded.
- **Priority:** must
- **Source:** `ARCH/05-INVARIANTS.md` INV-07 · `ARCH/19-RUNTIME-ENVIRONMENTS.md` §3 · `ARCH/16-CONTEXT.md` §4
- **Acceptance:** output-persistence test (full output retrievable); bounded-context test (model view size capped; the reference resolves); no lost-output case.
- **Failure cases:** unbounded output in context → defect; output discarded without artifact/event → evidence loss; compact view without a resolvable reference → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-RTENV-007 — MCP server lifecycle and epoch discipline
- **Statement:** GIVEN an MCP server requested by an adapter, WHEN the runtime hosts it, THEN it spawns (stdio) or connects (HTTP) with an epoch recorded at start and bumped on restart — invalidating outstanding handles — applies the per-server health/restart policy, shuts down on scope end (global/workspace-scoped servers persist; session-scoped servers end with the session, DEC-024 four-state scoping), and takes config from the provider registry with secrets as vault references only.
- **Priority:** must
- **Source:** `ARCH/19-RUNTIME-ENVIRONMENTS.md` §5 · `ARCH/04-DECISIONS.md` DEC-024 · `ARCH/05-INVARIANTS.md` INV-02
- **Acceptance:** restart test bumps the epoch and rejects stale handles; scope-end shutdown test per scope; server crash routes to the provider health/failover path; no secret value in server config.
- **Failure cases:** stale handle accepted after restart → defect; session-scoped server outliving its session → leak; secret in server config → custody violation.
- **Tests:** pending
- **Status:** seeded

#### REQ-RTENV-008 — Elevated helper is opt-in and degrades loudly
- **Statement:** GIVEN a capability that needs privileged reads (e.g. the file-index helper), WHEN the helper is used, THEN it requires explicit install and consent, runs with no service/autostart by default, communicates only over a guarded channel where every request is audited, and denial or absence degrades the capability to non-admin modes with a surfaced note — never silent elevation.
- **Priority:** must
- **Source:** `ARCH/19-RUNTIME-ENVIRONMENTS.md` §6 · `ARCH/21-WORLD-MODEL.md` §5 · `ARCH/05-INVARIANTS.md` INV-20/INV-24
- **Acceptance:** install/consent test; no-autostart test; guarded-channel and per-request-audit test; denied-helper test shows degraded mode with a visible note.
- **Failure cases:** silent elevation → security violation; helper IPC outside the guarded channel → violation; unaudited privileged request → violation.
- **Tests:** pending
- **Status:** seeded

#### REQ-RTENV-009 — App lifecycle and crash recovery rebuild from work state
- **Statement:** GIVEN app start, close or crash, WHEN the runtime reconciles, THEN start rehydrates the process registry from work/event state and adopts, monitors or reconciles strays, close applies and records the per-work-kind policy (keep · suspend · stop), and crash recovery rebuilds environments from work state plus checkpoints — no environment state is authoritative.
- **Priority:** must
- **Source:** `ARCH/19-RUNTIME-ENVIRONMENTS.md` §7 · `ARCH/05-INVARIANTS.md` INV-16 · `ARCH/11-WORK.md` §4
- **Acceptance:** restart test rehydrates detached work; stray reconciliation is audited (killed or re-attached per policy); close decision recorded per work kind; crash rebuild test (no state loss from in-memory environment state).
- **Failure cases:** environment state authoritative after restart → defect; close silently stopping kept detached work → defect; stray process untracked → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-RTENV-010 — Health and bounded telemetry
- **Statement:** GIVEN environments, processes and servers, WHEN health changes, THEN each reports `ok` · `degraded` · `down` with a reason, changes publish as events, resource telemetry stays bounded metadata (never payload capture), the UI surfaces environment health for diagnostics, and work items carry their environment ids.
- **Priority:** must
- **Source:** `ARCH/19-RUNTIME-ENVIRONMENTS.md` §8 · `ARCH/30-EVENTS.md` §1
- **Acceptance:** health-state and reason test; event-publication test; telemetry scan shows no payload content; work item carries its environment id.
- **Failure cases:** health change without an event → defect; payload capture in telemetry → privacy violation; down environment without a reason → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-RTENV-011 — Typed spawn failures and hang handling
- **Statement:** GIVEN a spawn request or a hung process, WHEN the failure surfaces, THEN spawn failure distinguishes policy denial from OS failure with no retry loop on policy denial, and a hang is handled by watchdogs plus the `ARCH/11-WORK.md` timeouts, ending in interrupt/cancel with a recorded reason.
- **Priority:** must
- **Source:** `ARCH/19-RUNTIME-ENVIRONMENTS.md` §9 · `ARCH/11-WORK.md` §6
- **Acceptance:** typed spawn-error test (denial vs OS failure distinguishable); no-retry-on-denial test; hang-watchdog test ends with a reason; timeout and cancel are distinguished.
- **Failure cases:** retry loop on policy denial → defect; hang without an abort reason → defect; OS failure reported as policy denial (or vice versa) → defect.
- **Tests:** pending
- **Status:** seeded

### Workflow (`WF`)

#### REQ-WF-001 — Runs pinned to their version
- **Statement:** GIVEN an in-flight workflow run, WHEN the workflow definition is edited or a new version is published, THEN the run continues against its recorded `workflow_version` + digest, resume after restart uses the same pinned version, nested runs inherit per the declared inheritance rules, and the only exception is an explicit, audited run-upgrade — a run never mutates underneath itself.
- **Priority:** must
- **Source:** `AGENTCOWORK-SPEC.md` §10 · `ARCH/05-INVARIANTS.md` INV-16 · `ARCH/20-WORKFLOW.md` §6 · `ARCH/04-DECISIONS.md` DEC-033
- **Acceptance:** edit-during-run test shows the run executes the pinned version; resume after restart still uses it; a silent upgrade attempt is rejected; an authorized upgrade is recorded and audited.
- **Failure cases:** run picking up edited definition → defect; partial state from mixed versions → forbidden; unrecorded upgrade → violation.
- **Tests:** pending
- **Status:** seeded

#### REQ-WF-002 — Typed IR is the single definition truth
- **Statement:** GIVEN a workflow definition, WHEN it is authored or published, THEN it is the typed IR (`DM-021`: typed nodes/edges, variables, vault-ref-only secrets, retry/timeout/concurrency policies, outputs) and only **published**, content-addressed versions (definition digest + input/output schema digests) can trigger or execute; every authoring surface (JSON/YAML · SDK · future visual graph · agent) lands on this same IR.
- **Priority:** must
- **Source:** `ARCH/20-WORKFLOW.md` §2 · `ARCH/06-DATA-MODEL.md` DM-021 · `ARCH/04-DECISIONS.md` DEC-008
- **Acceptance:** IR/schema validation rejects malformed definitions; any declared-content change changes the digest; drafts cannot trigger or execute; all authoring surfaces produce equivalent IR.
- **Failure cases:** draft execution → defect; non-content-addressed version → defect; secret value in a definition → custody violation (INV-02).
- **Tests:** pending
- **Status:** seeded

#### REQ-WF-003 — Occurrences persist ahead and claim exactly once
- **Statement:** GIVEN an enabled trigger, WHEN it becomes due, THEN its occurrence row (due time + unique idempotency key) exists before it is due, and a single-transaction claim admits each occurrence to exactly one run; duplicate materialization or claim attempts cannot double-execute.
- **Priority:** must
- **Source:** `ARCH/20-WORKFLOW.md` §4 · `ARCH/04-DECISIONS.md` DEC-033
- **Acceptance:** no execution without a persisted occurrence row; a duplicate-key insert/claim test yields exactly one run; a crash between materialize and claim leaves a reclaimable occurrence.
- **Failure cases:** execution from an unpersisted occurrence → defect; double claim / double run → violation.
- **Tests:** pending
- **Status:** seeded

#### REQ-WF-004 — One wake loop reconciles, claims and executes
- **Statement:** GIVEN the workflow scheduler, WHEN it runs, THEN exactly one wake-loop actor reconciles expired leases (requeue + `lease_reaped` event), applies `cancel_requested` at the next step boundary, materializes due occurrences, claims them exactly-once, executes step-by-step in transactions, and sleeps until the nearest wake (occurrence due · wait `wake_at` · approval deadline · lease expiry) — no second scheduler or timer queue exists.
- **Priority:** must
- **Source:** `ARCH/20-WORKFLOW.md` §4 · `ARCH/04-DECISIONS.md` DEC-033 · `ARCH/07-CONTRACTS.md` CTR-016 · `ARCH/05-INVARIANTS.md` INV-06
- **Acceptance:** single-writer/single-scheduler inspection; lease-expiry requeue emits the event; cancellation lands only at step boundaries; nearest-wake computation test.
- **Failure cases:** parallel scheduler → architecture violation; cancelled run executing another step → defect; expired lease blocking a claim → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-WF-005 — Crash resume follows the step matrix; completion is never fabricated
- **Statement:** GIVEN a crash between steps, WHEN the run resumes, THEN persisted step state decides the action — `pending` → execute · `settled` → reuse result · `started` idempotent/retryable → retry with the **same** idempotency key · `started` side-effecting **keyless** → `needs_attention` (a human decides repair/retry/skip) · attempts exhausted → terminal + repair path — and completion is never fabricated or blindly re-run.
- **Priority:** must
- **Source:** `ARCH/20-WORKFLOW.md` §4 · `ARCH/04-DECISIONS.md` DEC-022/033
- **Acceptance:** resume-matrix test per row; a keyless interrupted side effect never re-runs without a human decision; retries reuse the recorded key.
- **Failure cases:** fabricated completion → violation; blind re-run of a keyless side effect → verification failure; lost settled result → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-WF-006 — Wake times are "not before"; schedules are timezone-faithful
- **Statement:** GIVEN persisted timers and calendar schedules, WHEN the app boots or wakes, THEN persisted `wake_at` is treated as "not before" — never as wall-clock precision — and re-checked at every boot and wake, calendar schedules resolve in the stored IANA zone, and clock changes or DST transitions can neither skip nor duplicate a due occurrence.
- **Priority:** must
- **Source:** `ARCH/20-WORKFLOW.md` §4 · `ARCH/04-DECISIONS.md` DEC-033
- **Acceptance:** boot/wake re-check test; DST-boundary and simulated clock-jump tests show no skip and no duplicate.
- **Failure cases:** wall-clock precision assumed → defect; naive local-time schedule resolution → defect; skip or duplicate on DST → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-WF-007 — Misfire policy is explicit, recorded and bounded
- **Statement:** GIVEN a missed due time (OS sleep or reboot), WHEN reconcile runs, THEN the default policy is **Skip + record** (a visible missed row, no execution), the optional *run latest missed* never executes the whole backlog, and the grace window is bounded (≤ 24 h desktop policy).
- **Priority:** should
- **Source:** `ARCH/20-WORKFLOW.md` §4/§11 · `ARCH/04-DECISIONS.md` DEC-033
- **Acceptance:** policy tests per trigger class; missed rows visible; backlog test executes at most the latest missed occurrence; grace-bound enforcement.
- **Failure cases:** silent skip → defect; backlog replay → defect; unbounded grace → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-WF-008 — Approval nodes use the one approval primitive
- **Statement:** GIVEN a workflow approval node, WHEN it is requested and resolved, THEN it routes through the single approval primitive with `approve · reject · edit · provide-data` (typed form payload for provide-data), an edit records both the editable draft and the immutable original in the receipt, timeout resolves per class (default reject/escalate), and routing conditions live at the IR level.
- **Priority:** must
- **Source:** `ARCH/20-WORKFLOW.md` §7 · `ARCH/04-DECISIONS.md` DEC-021 · `ARCH/05-INVARIANTS.md` INV-17 · `ARCH/07-CONTRACTS.md` CTR-012
- **Acceptance:** node tests per decision kind; timeout default test; edit records both versions; approval audited and evented.
- **Failure cases:** bespoke approval dialog/path → review failure; timeout leaving a run pending forever → defect; unrecorded approval → receipt verification failure.
- **Tests:** pending
- **Status:** seeded

#### REQ-WF-009 — Retry, timeout and concurrency bounds are declared
- **Statement:** GIVEN node execution and trigger concurrency, WHEN defaults apply, THEN node retry is 2 attempts with exponential backoff (opt-in change), step timeout is 5 min default (overridable; workflow `maximumRuntime` bounded), lease/reaper run at 60 s/30 s, per-workflow overlap defaults to Skip with a declared queue option, and trigger storms are absorbed by backpressure — never unbounded fan-out.
- **Priority:** should
- **Source:** `ARCH/20-WORKFLOW.md` §8 · `ARCH/04-DECISIONS.md` DEC-031/033
- **Acceptance:** defaults test; per-node override test; overlap Skip/queue tests; storm/backpressure test.
- **Failure cases:** retry beyond declared attempts → defect; unbounded fan-out → defect; step running past `maximumRuntime` → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-WF-010 — Composition: agent nodes, workflows-as-tools, authored definitions
- **Statement:** GIVEN composition in both directions, WHEN a workflow invokes an agent node, THEN it passes a task + bounded context refs and receives a result/receipt — never the agent's transcript; WHEN an agent invokes a workflow, THEN it resolves through the capability catalog like any other capability; WHEN an agent authors a workflow, THEN the emitted definition passes IR, policy and capability-census validation plus a publish gate before any trigger can run it.
- **Priority:** must
- **Source:** `ARCH/20-WORKFLOW.md` §9 · `ARCH/04-DECISIONS.md` DEC-008 · `ARCH/07-CONTRACTS.md` CTR-001/CTR-009
- **Acceptance:** agent-node handoff carries receipts only; workflow-as-tool resolves through the broker; an unvalidated or unpublished authored definition cannot execute.
- **Failure cases:** transcript leakage into the run → violation; authored definition executing without validation/publish → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-WF-011 — Run evidence is receipted, evented and replayable
- **Statement:** GIVEN a workflow run, WHEN it progresses or reaches a terminal state, THEN run-level and per-node receipts plus typed events are recorded in the single event store, every terminal state carries a reason, and the run's evidence is replayable.
- **Priority:** must
- **Source:** `ARCH/20-WORKFLOW.md` §10 · `ARCH/05-INVARIANTS.md` INV-07/INV-23 · `ARCH/04-DECISIONS.md` DEC-022 · `ARCH/29-ARTIFACTS.md` §3
- **Acceptance:** receipt coverage per run and node; event coverage; replay reproduces the run's step ledger; every terminal state has a reason.
- **Failure cases:** run without receipts → violation; silent terminal state → defect; non-replayable evidence → defect.
- **Tests:** pending
- **Status:** seeded

### World model (`WORLD`)

#### REQ-WORLD-001 — Structural state first; queries, not screenshots
- **Statement:** GIVEN a consumer needs machine state (apps, windows, processes, files, browser, devices), WHEN it asks the World Model, THEN it receives structural world objects/edges with identity and freshness — observation is a query over indexed state, not a screenshot — and window capture happens only on demand (explicit view, action verification, or a structured-tree miss).
- **Priority:** must
- **Source:** `ARCH/04-DECISIONS.md` DEC-011 · `ARCH/21-WORLD-MODEL.md` §1 · `ARCH/24-COMPUTER-USE.md` §7
- **Acceptance:** canonical use cases ("open the spreadsheet from yesterday", "go back to that tab", "what is the active document?") resolve from the index; routine queries capture no screenshots; captures are recorded only for the allowed on-demand cases.
- **Failure cases:** screenshot-first default → design violation; routine query triggering a capture → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-WORLD-002 — Collector set with independent enable/disable and health
- **Statement:** GIVEN the v1 collector set — W1 file inventory + deltas · W2 process/window registry · W3 UI tree on demand · W4 window capture on demand · W5 browser world (W6 devices/registry/shares and W7 content index/OCR deferred) — WHEN collectors run, THEN each is independently enable-able/disable-able and health-reported, and the browser collector shares the `23-BROWSER` CDP machinery.
- **Priority:** must
- **Source:** `ARCH/21-WORLD-MODEL.md` §2
- **Acceptance:** registry shows per-collector state + health; deferred collectors are absent in v1; the browser collector uses the same CDP path as `23`.
- **Failure cases:** collector without health/state → defect; a deferred collector silently active → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-WORLD-003 — Per-kind identity model
- **Statement:** GIVEN any world object, WHEN it is keyed, THEN identity follows the kind's model (`DM-026`): file `(volume, fileId, incarnation)` on Windows (`(st_dev, st_ino)` + guards on POSIX, FAT caveat declared), process `PID + start time`, window `HWND + PID + class + title + launch time`, browser tab `targetId` session-scoped and never persisted across launches, UI element handles epoch-scoped (valid for one observation/action, not persistent identity), and content hash kept separate from file identity.
- **Priority:** must
- **Source:** `ARCH/21-WORLD-MODEL.md` §3 · `ARCH/06-DATA-MODEL.md` DM-026
- **Acceptance:** identity tests per kind; delete→recreate yields a new file incarnation; PID/handle reuse is rejected as a mismatch; tab identity never survives a launch; ambiguous window/process matches are rejected, not guessed.
- **Failure cases:** reused identity accepted as the same object → defect; element ref treated as durable identity → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-WORLD-004 — Cursor and epoch discipline per collector
- **Statement:** GIVEN any collector instance, WHEN it tracks incremental updates, THEN it stores `(source, scope, epoch, cursor, observed_at)`; WHEN its source epoch resets (journal rollover, device change, mount/watch re-generation, new document/session), THEN the old cursor is discarded and the scope rescanned — records are never applied across epochs.
- **Priority:** must
- **Source:** `ARCH/21-WORLD-MODEL.md` §4 · `ARCH/05-INVARIANTS.md` INV-20
- **Acceptance:** epoch-reset test discards the cursor and rescans; cursor/epoch persisted per instance; records at or below the cursor are treated as errors, never silently applied.
- **Failure cases:** stale cursor applied after an epoch reset → defect; cross-scope cursor reuse → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-WORLD-005 — Gaps force a scoped rescan, never a silent gap
- **Statement:** GIVEN a lossy watcher condition (inotify/fanotify overflow, FSEvents drop, RDCW zero-length buffer, dead or truncated USN journal), WHEN a gap is detected, THEN the collector aborts incremental application and forces a rescan of the smallest known scope, recording a freshness anomaly event — a silent gap is never allowed.
- **Priority:** must
- **Source:** `ARCH/21-WORLD-MODEL.md` §4 · `ARCH/05-INVARIANTS.md` INV-20
- **Acceptance:** one test per gap source shows rescan + anomaly event; no incremental record is applied across the gap; the rescan scope is bounded to the smallest known scope.
- **Failure cases:** silent gap → verification failure; unbounded full-volume rescan when a smaller scope is known → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-WORLD-006 — Freshness contract on every object
- **Statement:** GIVEN any world object, WHEN it is produced or read, THEN it carries `observed_at` + `source` + `epoch`; consumers receive explicit staleness, per-collector TTLs can mark objects `unknown` (files: minutes; process/window: seconds), and write paths re-validate stale objects before acting.
- **Priority:** must
- **Source:** `ARCH/21-WORLD-MODEL.md` §4 · `ARCH/07-CONTRACTS.md` CTR-017
- **Acceptance:** object-freshness tests; a stale object is marked `unknown` after its TTL; write-path re-validation test; no stale object is silently reported fresh.
- **Failure cases:** missing freshness stamps → defect; a write path acting on a stale object without re-validation → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-WORLD-007 — Queries read the index; no rescan per query
- **Statement:** GIVEN a query or subscription, WHEN it is served, THEN it reads indexed world state (and the event stream), never walks the filesystem and never triggers a full rescan, and event delivery never triggers unbounded work.
- **Priority:** must
- **Source:** `ARCH/21-WORLD-MODEL.md` §2/§4/§6 · `ARCH/05-INVARIANTS.md` INV-20
- **Acceptance:** query-path inspection shows index reads only; a query against a stale index returns freshness-marked results instead of walking; event-delivery bound test.
- **Failure cases:** full rescan per query → INV-20 violation; unbounded work per event → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-WORLD-008 — Consent records and deny-by-default scoping
- **Statement:** GIVEN a collector instance, WHEN it is enabled, THEN a consent record names the collector id + version · scope · required capability (standard/elevated/OS-permission) · permission actually granted and how · event source + epoch/cursor · data classes · start/stop + retention · revocation path; collection is deny-by-default, scope never expands silently, and there is no persistent "always allow" in v1.
- **Priority:** must
- **Source:** `ARCH/21-WORLD-MODEL.md` §5 · `ARCH/05-INVARIANTS.md` INV-20
- **Acceptance:** consent-record completeness test; a new scope requires new consent; revocation stops the collector and its events; no persistent allow record exists.
- **Failure cases:** collection without consent → violation; silent scope expansion → violation; revocation leaving the collector active → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-WORLD-009 — Metadata-first, capture-gated, local-first
- **Statement:** GIVEN collectors, WHEN they observe, THEN they read metadata only (never file content); screenshots occur only for explicit view, action verification, or a W3 miss; a visible indicator shows while any capture collector is active; `IsPassword`/protected fields are excluded or masked; and no upload path exists — world-model data stays local.
- **Priority:** must
- **Source:** `ARCH/21-WORLD-MODEL.md` §5 · `ARCH/05-INVARIANTS.md` INV-20 · `ARCH/04-DECISIONS.md` DEC-011
- **Acceptance:** content-read scan is clean; indicator test; masked protected-fields test; egress observation shows no world-model upload path.
- **Failure cases:** collector reading file content → violation; capture without the indicator → defect; world data leaving the machine → violation.
- **Tests:** pending
- **Status:** seeded

#### REQ-WORLD-010 — Elevated collectors degrade loudly
- **Statement:** GIVEN an elevated collector mode (USN/MFT file index), WHEN the helper or elevation is absent or denied, THEN the collector falls back to non-admin modes (walk/RDCW), the mode actually granted is recorded per instance, and the degradation is surfaced — never silent elevation and never a silent capability loss.
- **Priority:** must
- **Source:** `ARCH/21-WORLD-MODEL.md` §5 · `ARCH/19-RUNTIME-ENVIRONMENTS.md` §6 · `ARCH/05-INVARIANTS.md` INV-24
- **Acceptance:** denied-helper test yields non-admin mode + visible note + recorded mode; no USN-derived record is applied without the elevation that produced it.
- **Failure cases:** silent elevation → security violation; degraded mode without a surfaced note → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-WORLD-011 — Query/subscribe surface with filtered projections
- **Statement:** GIVEN the `WorldService` contract (`CTR-017`), WHEN consumers query or subscribe, THEN `query(filter)` and `subscribe(filter) → Stream` are the only surfaces, external-agent projections are sensitivity-filtered per `12`/`32`, and internals (raw stores, cursors, collector internals) are never exposed.
- **Priority:** must
- **Source:** `ARCH/21-WORLD-MODEL.md` §6 · `ARCH/07-CONTRACTS.md` CTR-017 · `ARCH/05-INVARIANTS.md` INV-11
- **Acceptance:** contract-conformance test; external projection test shows filtered fields only; no consumer reads collector stores directly.
- **Failure cases:** unfiltered projection → security violation; consumer reading collector stores directly → architecture violation.
- **Tests:** pending
- **Status:** seeded

### Office (`OFFICE`)

#### REQ-OFFICE-001 — One registry per format, shared by every surface
- **Statement:** GIVEN a document operation, WHEN any surface (CLI/MCP/GUI/agent/API) invokes it, THEN it resolves through the single per-format operation registry where each op is `{id · input/output schema · risk · executor · verification hook}`, exposed as typed capability descriptors (never a command-string tool), and a docs-sync test gates registry↔docs parity with no divergent implementations.
- **Priority:** must
- **Source:** `ARCH/22-OFFICE.md` §1/§3 · `ARCH/04-DECISIONS.md` DEC-013 · `ARCH/07-CONTRACTS.md` CTR-009
- **Acceptance:** all surfaces resolve the same op ids; the docs-sync test is present and enforced; no per-surface op implementation; the model receives semantic ops, not a shell.
- **Failure cases:** divergent op implementations → rejection; command-string tool surface → design violation.
- **Tests:** pending
- **Status:** seeded

#### REQ-OFFICE-002 — Progressive L1 → L2 → L3 access
- **Statement:** GIVEN a document operation, WHEN it runs, THEN it is classified L1 (semantic read) · L2 (structured mutation) · or L3 (raw part-level escape hatch, gated), ordinary agent work uses L1/L2, and L3 requires explicit policy gating — it is never the default path.
- **Priority:** must
- **Source:** `ARCH/22-OFFICE.md` §1/§3 · `ARCH/04-DECISIONS.md` DEC-013
- **Acceptance:** the op set is classified per format; L3 ops require explicit gating (policy/approval); default flows emit no raw part edits.
- **Failure cases:** ungated raw part write → violation; L3 used to bypass registry ops → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-OFFICE-003 — Resident document contexts with exclusive writer leases
- **Statement:** GIVEN an open document, WHEN it is edited, THEN exactly one resident context per document holds an exclusive writer lease; a second writer receives an explicit "in use" result with options (read-only render vs wait); flush is interval + dirty-marker driven with explicit flush on session end and idle eviction under memory bounds; no merge exists in v1.
- **Priority:** must
- **Source:** `ARCH/22-OFFICE.md` §1/§4 · `ARCH/04-DECISIONS.md` DEC-013
- **Acceptance:** concurrent-open test yields the lease message and no silent overwrite; flush-policy tests; session-end flush; idle eviction respects the memory bound.
- **Failure cases:** two writers mutating one document → violation; edits lost without an explicit "in use" result → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-OFFICE-004 — Crash-safe commit: staging, fsync, atomic swap, op log
- **Statement:** GIVEN a commit of document mutations, WHEN it persists, THEN it writes a staging package, `fsync`s it, atomically swaps it into place, and supports op-log replay on recovery; a crash mid-write never leaves a torn file, and scratch/work areas stay confined to declared roots (pathfloor).
- **Priority:** must
- **Source:** `ARCH/22-OFFICE.md` §4 · `ARCH/12-TRUST.md` §2 · `ARCH/04-DECISIONS.md` DEC-013
- **Acceptance:** kill-during-commit test recovers via op-log replay with no torn file; scratch-write test denies paths outside declared roots.
- **Failure cases:** torn file after crash → violation; scratch escaping declared roots → security failure.
- **Tests:** pending
- **Status:** seeded

#### REQ-OFFICE-005 — Batch atomicity with replayable op log
- **Statement:** GIVEN a batch of document operations, WHEN it is applied, THEN it is all-or-nothing with an op log for replay and audit; a pre-commit validation failure aborts the whole batch and the receipt records the failed check.
- **Priority:** must
- **Source:** `ARCH/22-OFFICE.md` §4/§5/§7 · `ARCH/04-DECISIONS.md` DEC-023
- **Acceptance:** a failing batch leaves the document unchanged; op-log replay reproduces the batch; the receipt names the failing check.
- **Failure cases:** partially applied batch → violation; failed check unrecorded → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-OFFICE-006 — No silent lossy path; engine limits are declared
- **Statement:** GIVEN a format engine and its fidelity limits, WHEN an operation exceeds them (charts/pivots/SmartArt/OLE or unavoidable re-serialization), THEN the limitation is declared per engine, the operation returns typed `guidance` naming the limitation, and re-serialization is disclosed whenever it is unavoidable — never a silent lossy transformation.
- **Priority:** must
- **Source:** `ARCH/22-OFFICE.md` §1/§2/§7 · `ARCH/07-CONTRACTS.md` CTR-009
- **Acceptance:** an engine-limit registry exists; an unsupported-op test yields typed guidance naming the limitation; no lossy path executes undeclared.
- **Failure cases:** silent shape/chart loss → defect; undeclared re-serialization → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-OFFICE-007 — Deterministic render and validation before commit
- **Statement:** GIVEN a preview or a pending commit, WHEN it runs, THEN previews are projections produced without model tokens (browser shell-out or native renderer), and per-format structural validation (DOCX structure/text round-trip · XLSX recalc + formula presence · PPTX slide/shape audit · PDF page/object counts, plus render-diff where useful) runs before commit.
- **Priority:** must
- **Source:** `ARCH/22-OFFICE.md` §5 · `ARCH/04-DECISIONS.md` DEC-015 · `ARCH/05-INVARIANTS.md` INV-13
- **Acceptance:** the preview flow shows zero model calls; validation hooks run per format pre-commit; a failing structural check blocks the commit.
- **Failure cases:** preview consuming model tokens → INV-13 violation; commit without required validation → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-OFFICE-008 — Risk-scaled verification hooks
- **Statement:** GIVEN a committed office effect, WHEN verification runs, THEN its depth scales with the capability's risk class; PDF redact requires a post-op text-extraction check proving removal, and externally visible sends carry a receipt recording the validation result.
- **Priority:** must
- **Source:** `ARCH/22-OFFICE.md` §5 · `ARCH/05-INVARIANTS.md` INV-19 · `ARCH/04-DECISIONS.md` DEC-022 · `ARCH/34-EFFECT-VERIFICATION.md` §3
- **Acceptance:** the redact post-op extraction test proves removal; the receipt carries the validation result; verification depth matches the risk class.
- **Failure cases:** redact leaving extractable content → security failure; externally visible send without a receipt → violation.
- **Tests:** pending
- **Status:** seeded

#### REQ-OFFICE-009 — XLSX formula integrity: recalculate before commit
- **Statement:** GIVEN an XLSX mutation, WHEN the workbook is committed, THEN formulas are recalculated through the declared engine (IronCalc-class) before commit so stored cached values match the formulas — a workbook never commits stale computed values.
- **Priority:** must
- **Source:** `ARCH/22-OFFICE.md` §2/§3 · `ARCH/04-DECISIONS.md` DEC-023
- **Acceptance:** recalc-before-commit test; an edited formula yields the updated cached value; recalc failure blocks the commit with a typed error.
- **Failure cases:** commit without recalc → defect; stale cached value after a formula edit → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-OFFICE-010 — Templates and staged construction validate at each stage
- **Statement:** GIVEN a template merge or a staged deck build (`deck_start → deck_page → deck_build → deck_replace`), WHEN stages execute, THEN each stage is validated check-before-write and the merged/built artifact is validated after merge — a failed stage stops the build without leaving a partial artifact.
- **Priority:** should
- **Source:** `ARCH/22-OFFICE.md` §6 · `ARCH/04-DECISIONS.md` DEC-023
- **Acceptance:** stage-validation tests; a failed stage leaves no partial artifact; the merged result is validated.
- **Failure cases:** partial artifact after a failed stage → defect; unvalidated merge → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-OFFICE-011 — Corrupt inputs quarantine; large inputs stay bounded
- **Statement:** GIVEN a corrupt/unreadable document or a huge workbook/document, WHEN it is opened, THEN the corrupt document is quarantined with a typed error and its original left untouched, and huge inputs use bounded loads/streaming reads under declared limits.
- **Priority:** must
- **Source:** `ARCH/22-OFFICE.md` §7
- **Acceptance:** corrupt-input test; quarantine keeps the original byte-identical; huge-file test respects the declared memory/load limits.
- **Failure cases:** original modified on failed open → violation; unbounded load → defect.
- **Tests:** pending
- **Status:** seeded

### Browser (`BROWSER`)

#### REQ-BROWSER-001 — Managed Chromium default; adapters are integrations
- **Statement:** GIVEN a browser task, WHEN the runtime selects an engine, THEN AgentCowork-managed Chromium (predictable version, isolated profile, headless/background operation) is the default, and Chrome/Edge/Firefox/Opera/system browsers are selectable adapters — never parallel embedded runtimes — with capability differences declared per adapter.
- **Priority:** must
- **Source:** `ARCH/23-BROWSER.md` §1 · `ARCH/04-DECISIONS.md` DEC-012
- **Acceptance:** default-selection test; the adapter registry declares per-adapter capabilities; no second embedded engine ships.
- **Failure cases:** a second embedded runtime → architecture violation; undeclared adapter capability difference → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-BROWSER-002 — Browser instances are environments with lifecycle and recovery
- **Statement:** GIVEN a browser instance, WHEN it runs, THEN it is an environment (`19`) scoped per workspace/task with isolated cookies/storage by default; its lifecycle is launch → ready → operate → park (hibernate) → close; crash recovery re-launches and re-establishes targets; tabs survive where the profile allows.
- **Priority:** must
- **Source:** `ARCH/23-BROWSER.md` §2 · `ARCH/19-RUNTIME-ENVIRONMENTS.md` §2 · `ARCH/04-DECISIONS.md` DEC-012
- **Acceptance:** the instance appears as an environment; isolation test shows no cookie/storage bleed between workspaces; crash-recovery test re-establishes targets; park/close releases resources.
- **Failure cases:** cross-workspace cookie bleed → security failure; unregistered browser process → defect; crash without target recovery → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-BROWSER-003 — User-browser attach and takeover
- **Statement:** GIVEN the user's own browser (Chrome/Edge), WHEN attach is requested, THEN the explicit "user browser" mode uses its profile under consent, an attach failure falls back to managed Chromium with a surfaced note, the agent's operation is visibly indicated, and user takeover is supported (the agent yields input).
- **Priority:** must
- **Source:** `ARCH/23-BROWSER.md` §2/§7
- **Acceptance:** attach-mode test; fallback-with-note test; visible-indicator test; takeover test shows the agent yields control.
- **Failure cases:** silent profile use without consent → violation; attach failure leaving the run stalled → defect; agent ignoring takeover → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-BROWSER-004 — BrowserWorld tab/frame model
- **Statement:** GIVEN the browser world (`21` W5), WHEN tabs and frames are tracked, THEN tab identity is CDP `targetId` — session-scoped, never persisted across launches, stable ordering — frames carry CDP session ids with cross-origin iframes bounded (expand one level, skip blocked, depth ≈5), and page state includes URL · title · forms · downloads · auth state · freshness.
- **Priority:** must
- **Source:** `ARCH/23-BROWSER.md` §3 · `ARCH/06-DATA-MODEL.md` DM-026 · `ARCH/21-WORLD-MODEL.md` §3
- **Acceptance:** tab-identity test (no persistence across launches); frame-bounded test; page-state fields present.
- **Failure cases:** persisted tab identity reused across launches → defect; unbounded frame expansion → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-BROWSER-005 — Compact, bounded snapshots with maskable fields
- **Statement:** GIVEN a page observation, WHEN a snapshot is produced, THEN it is a compact role/name/value graph (≈200–400 tokens for a page, never raw HTML by default), bounded by nodes · depth · text length, with password/protected fields masked.
- **Priority:** must
- **Source:** `ARCH/23-BROWSER.md` §3/§4
- **Acceptance:** snapshot size stays within declared bounds; raw HTML is not the default output; masked protected-field test.
- **Failure cases:** raw DOM dump by default → defect; unmasked protected field → security failure; unbounded snapshot → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-BROWSER-006 — Ephemeral refs re-resolve after events
- **Statement:** GIVEN an element ref `@eN`, WHEN the page navigates or any event invalidates it, THEN the ref is invalidated and never recycled within a session, and the next action re-resolves by role+name (or a fresh snapshot) — a stale ref is never clicked, and refs are never a security boundary.
- **Priority:** must
- **Source:** `ARCH/23-BROWSER.md` §1/§3/§4/§7
- **Acceptance:** stale-ref test yields re-resolution, never a click on a stale ref; ref-recycling test fails as designed.
- **Failure cases:** click on a stale ref → defect; ref treated as authorization → security violation.
- **Tests:** pending
- **Status:** seeded

#### REQ-BROWSER-007 — Trusted input and condition-based waits
- **Statement:** GIVEN a browser action, WHEN input is dispatched, THEN it uses CDP trusted input events (`Input.dispatchMouseEvent`-class), never gestureless `element.click()`-style calls, and waits are condition-based (network/DOM), not sleeps.
- **Priority:** must
- **Source:** `ARCH/23-BROWSER.md` §4
- **Acceptance:** action-path inspection shows trusted input only; wait-policy test shows no fixed sleeps on navigation.
- **Failure cases:** gestureless click → defect; fixed sleep as the wait strategy → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-BROWSER-008 — Structured-first, vision last inside the browser
- **Statement:** GIVEN a browser task, WHEN connectors/APIs (`28`), DOM/AX structure, or CDP actions can do the work, THEN screenshot vision is not used; vision runs only when structure fails (canvas/WebGL) or for verification/diff, with size-capped captures and highlight-before-capture preferred.
- **Priority:** must
- **Source:** `ARCH/23-BROWSER.md` §1/§4/§6 · `ARCH/04-DECISIONS.md` DEC-011
- **Acceptance:** capability-routing test; vision-fallback test; capture cost caps honored; diff runs without model cost.
- **Failure cases:** screenshot-first browser automation → design violation; uncapped image sent → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-BROWSER-009 — Credentials are user-controlled; auth state is surfaced
- **Statement:** GIVEN logins and sessions, WHEN authentication is needed, THEN the agent never harvests passwords (user-assisted login or connector OAuth via `28`), cookies/storage stay in the managed profile with explicit export/import, and auth state is surfaced in BrowserWorld rather than extracted into context.
- **Priority:** must
- **Source:** `ARCH/23-BROWSER.md` §5 · `ARCH/05-INVARIANTS.md` INV-02
- **Acceptance:** credential-capture scan clean; auth-state projection test (surfaced, not extracted); explicit profile export/import test.
- **Failure cases:** password harvested into context or logs → security violation; implicit profile export → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-BROWSER-010 — Per-origin policy and session consent records
- **Statement:** GIVEN browsing, WHEN origins are visited, THEN allowed/blocked/read-only origins and download policy are enforced by `12-TRUST`, and browser-session consent records name the browser instance · profile · origins · granted capabilities.
- **Priority:** must
- **Source:** `ARCH/23-BROWSER.md` §5 · `ARCH/12-TRUST.md` §10 · `ARCH/05-INVARIANTS.md` INV-05/INV-20
- **Acceptance:** per-origin enforcement tests (allow/block/read-only/download); consent-record completeness test.
- **Failure cases:** blocked origin reachable → security violation; browsing without a consent record → violation.
- **Tests:** pending
- **Status:** seeded

#### REQ-BROWSER-011 — Downloads and uploads route through artifacts
- **Statement:** GIVEN a download or upload, WHEN it occurs, THEN downloads land in a managed staging area and become artifacts (`29`) with provenance, and uploads are user-gated or policy-gated.
- **Priority:** must
- **Source:** `ARCH/23-BROWSER.md` §2 · `ARCH/07-CONTRACTS.md` CTR-018
- **Acceptance:** download → artifact test with provenance; upload gate test (user/policy); no file written outside staging.
- **Failure cases:** download bypassing artifacts → defect; ungated upload → violation.
- **Tests:** pending
- **Status:** seeded

#### REQ-BROWSER-012 — No evasion; CAPTCHA and bot blocks are surfaced
- **Statement:** GIVEN CAPTCHA/bot checks, site automation blocks, or anti-bot friction, WHEN encountered, THEN the runtime surfaces the situation to the user or returns typed `guidance` — it never solves CAPTCHAs, rotates identities/proxies, or spoofs fingerprints.
- **Priority:** must
- **Source:** `ARCH/23-BROWSER.md` §1/§7 · `ARCH/04-DECISIONS.md` DEC-016 · `ARCH/05-INVARIANTS.md` INV-21
- **Acceptance:** evasion-capability catalogue review finds none; CAPTCHA test surfaces to the user; blocked-site test returns guidance without identity rotation.
- **Failure cases:** evasion tooling present → violation; automated CAPTCHA solving → catastrophic violation.
- **Tests:** pending
- **Status:** seeded

### Computer use (`CUA`)

#### REQ-CUA-001 — Highest deterministic rung first
- **Statement:** GIVEN a desktop interaction need, WHEN a rung is chosen, THEN the highest deterministic rung runs first — native API → structured UI (UIA/AX/AT-SPI) → browser DOM/AX → CLI/app API/MCP → vision → raw input — and a screenshot is never taken for something an API or a tree can answer.
- **Priority:** must
- **Source:** `ARCH/24-COMPUTER-USE.md` §1/§2 · `ARCH/04-DECISIONS.md` DEC-011
- **Acceptance:** rung-selection tests per scenario; vision/raw paths are reached only after higher rungs fail or are unavailable.
- **Failure cases:** screenshot used where structure answers → design violation; raw input chosen first → violation.
- **Tests:** pending
- **Status:** seeded

#### REQ-CUA-002 — Per-platform capability matrix is declared and honest
- **Statement:** GIVEN a platform, WHEN computer use is offered, THEN the actually available rungs are declared in a per-platform matrix (e.g. no by-point AX on macOS in the current build; no AT-SPI client on bare X11), the matrix is tested and surfaced, and unimplemented rungs are absent rather than abstractly promised.
- **Priority:** must
- **Source:** `ARCH/24-COMPUTER-USE.md` §1/§2
- **Acceptance:** matrix-conformance tests per platform; a missing rung produces guidance, never a silent failure.
- **Failure cases:** promising a rung the platform lacks → defect; unavailable rung reported as success → violation.
- **Tests:** pending
- **Status:** seeded

#### REQ-CUA-003 — Epoch-scoped observations; ambiguity is rejected
- **Statement:** GIVEN an element resolution, WHEN a handle is produced, THEN it is `(runtime_id | role+name+automationId+bounds)` valid for one observation/action, re-read per step and never persisted as identity; ambiguous matches are rejected and re-read or escalated rather than guessed.
- **Priority:** must
- **Source:** `ARCH/24-COMPUTER-USE.md` §1/§3/§8 · `ARCH/06-DATA-MODEL.md` DM-026 · `ARCH/21-WORLD-MODEL.md` §3
- **Acceptance:** handle-lifetime test; ambiguous-match test rejects; a stale observation is re-validated before acting.
- **Failure cases:** cached structure used as identity → defect; a guessed element selected → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-CUA-004 — Bounded structured reads with timeout isolation
- **Statement:** GIVEN a structured UI read, WHEN it runs, THEN it is bounded (nodes · depth · text limits), the tree is treated as lazy and changing (re-read per action, never cached as identity), and a per-call budget plus worker isolation prevent a hung provider from stalling the agent.
- **Priority:** must
- **Source:** `ARCH/24-COMPUTER-USE.md` §3 · `ARCH/21-WORLD-MODEL.md` §7
- **Acceptance:** bounds test; hung-provider test times out to a partial tree and the ladder falls through.
- **Failure cases:** hung provider stalling the agent → defect; unbounded tree read → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-CUA-005 — Pattern-first actuation
- **Statement:** GIVEN a target element, WHEN it is actuated, THEN supported patterns are re-queried and invoked first (`Invoke` · `Value` · `Toggle` · `Scroll` · `Selection` · `Text` · `Window`), then synthetic events, and raw input only as the last, gated rung.
- **Priority:** must
- **Source:** `ARCH/24-COMPUTER-USE.md` §3/§5
- **Acceptance:** pattern-preference tests per control type; patterns are re-queried per action; raw input is never chosen while a supported pattern works.
- **Failure cases:** synthetic or raw input where a pattern applies → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-CUA-006 — Elevation limits degrade to guidance
- **Statement:** GIVEN an elevated region unreachable without UIAccess/consent, WHEN the agent acts, THEN the region is marked unknown, no partial-input attempt is made, and the run surfaces typed guidance instead.
- **Priority:** must
- **Source:** `ARCH/24-COMPUTER-USE.md` §3/§8
- **Acceptance:** elevated-region test yields unknown + guidance; no input synthesis into the unreachable region.
- **Failure cases:** blind input at an elevated region → violation; unreachable region silently reported empty → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-CUA-007 — Vision rung discipline
- **Statement:** GIVEN the vision rung, WHEN it runs, THEN it executes only for canvas/WebGL/custom render, poor semantics, verification, or a structured miss; captures are size-capped before send (model limits honored; no reliance on provider downscaling); the loop is screenshot → model → action → observe, with a zoom-class action available for legibility.
- **Priority:** must
- **Source:** `ARCH/24-COMPUTER-USE.md` §4 · `ARCH/04-DECISIONS.md` DEC-011
- **Acceptance:** capture-size test; vision-trigger tests per allowed class; zoom path test.
- **Failure cases:** vision used as the default → design violation; oversized capture sent → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-CUA-008 — Capture preference and context discipline
- **Statement:** GIVEN a capture, WHEN vision is needed, THEN DOM/AX-informed capture with highlights is preferred over a plain screenshot, local OCR word-boxes are preferred when the tree is empty and text suffices (zero model cost), snapshots entering context are bounded, and screenshots enter context only when the vision rung ran.
- **Priority:** must
- **Source:** `ARCH/24-COMPUTER-USE.md` §4/§7 · `ARCH/16-CONTEXT.md` §3 · `ARCH/04-DECISIONS.md` DEC-015 · `ARCH/05-INVARIANTS.md` INV-22
- **Acceptance:** preference-order tests; the OCR path runs without model calls; snapshot-bound test; a context scan shows no screenshots outside the vision rung.
- **Failure cases:** a plain screenshot preferred over highlight capture → defect; screenshot in context without the vision rung → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-CUA-009 — On-screen content is untrusted input
- **Statement:** GIVEN on-screen content, WHEN the agent processes it, THEN the content is untrusted input (a prompt-injection surface), consequential actions it proposes require the approval primitive, and capture is consent-gated with protected fields masked.
- **Priority:** must
- **Source:** `ARCH/24-COMPUTER-USE.md` §4/§6 · `ARCH/04-DECISIONS.md` DEC-021 · `ARCH/12-TRUST.md` §5
- **Acceptance:** injection-corpus test (screen instructions never auto-execute); consequential-action approval test; masked-field test.
- **Failure cases:** screen text treated as instructions → catastrophic violation; unapproved consequential action → violation.
- **Tests:** pending
- **Status:** seeded

#### REQ-CUA-010 — Raw input is gated, indicated and rate-limited
- **Statement:** GIVEN the raw-input rung, WHEN it is used, THEN it requires a `HumanAuthorization`-class gate, shows a visible indicator, is rate-limited, is never the first choice, and is never used for evasion.
- **Priority:** must
- **Source:** `ARCH/24-COMPUTER-USE.md` §5 · `ARCH/04-DECISIONS.md` DEC-016 · `ARCH/05-INVARIANTS.md` INV-20/INV-21
- **Acceptance:** gate test (raw input without authorization is denied); indicator test; rate-limit test.
- **Failure cases:** ungated synthetic input → violation; raw input used for evasion → catastrophic violation.
- **Tests:** pending
- **Status:** seeded

#### REQ-CUA-011 — Confirmation thresholds and no bulk storms
- **Statement:** GIVEN a consequential action class (sends · purchases · deletes · permission changes), WHEN it is about to execute, THEN the approval primitive is required; destructive/persistent patterns are denied by policy defaults and the ladder never overrides policy; bulk-input storms are prevented by a bounded action rate per target.
- **Priority:** must
- **Source:** `ARCH/24-COMPUTER-USE.md` §6 · `ARCH/04-DECISIONS.md` DEC-021 · `ARCH/12-TRUST.md` §3
- **Acceptance:** consequential-class tests require approval; policy-default denial test; rate-bound test.
- **Failure cases:** consequential action without approval → violation; ladder bypassing a policy denial → violation; bulk storm → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-CUA-012 — Post-action verification with bounded recovery
- **Statement:** GIVEN an action whose outcome is uncertain (vision-based location, a pattern call that may not have applied), WHEN it completes, THEN the outcome is verified (structured re-read or a second observation), retries are bounded, and repeated failure lands in `needs_attention` — never an unbounded retry loop.
- **Priority:** must
- **Source:** `ARCH/24-COMPUTER-USE.md` §4/§8 · `ARCH/04-DECISIONS.md` DEC-022
- **Acceptance:** post-action verification tests; bounded-retry test; repeated failure yields `needs_attention`.
- **Failure cases:** unbounded retry loop → defect; unverified success claimed → violation.
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

### Files (`FILES`)

#### REQ-FILES-001 — Platform file identity is incarnation-aware
- **Statement:** GIVEN a file on a supported platform, WHEN its identity is recorded, THEN it is `(volume, fileId)` on Windows or `(st_dev, st_ino)` on POSIX extended with incarnation evidence — `(volume, fileId, incarnation)` / `(dev, ino, nlink)` — so a reused id after delete never resumes the old identity, and Windows records never carry zeroed `dev`/`ino`.
- **Priority:** must
- **Source:** `ARCH/25-FILES.md` §1/§2 · `ARCH/21-WORLD-MODEL.md` §3 · `ARCH/06-DATA-MODEL.md` DM-026 · `ARCH/05-INVARIANTS.md` INV-20
- **Acceptance:** rename/move within a volume preserves identity; delete + recreate with a reused id yields a new identity; hardlink sets are distinguished by link count; a Windows scan record contains a real file id (no zeros).
- **Failure cases:** path used as identity → defect; reused id accepted as the same file → defect; zeroed Windows `dev`/`ino` reaching dedup/lease keys → defect (recorded code-phase fix `walk.rs:131-157`).
- **Tests:** pending
- **Status:** seeded

#### REQ-FILES-002 — File replacement re-keys dependents explicitly
- **Statement:** GIVEN a file whose incarnation changes (replace/restore/move across volumes), WHEN dedup, leases or index entries still refer to the old identity, THEN they are re-keyed or invalidated explicitly — stale identity is never carried forward.
- **Priority:** must
- **Source:** `ARCH/25-FILES.md` §2/§8 · `ARCH/21-WORLD-MODEL.md` §3
- **Acceptance:** replacement test shows a new identity with old lease/dedup entries re-keyed or dropped; the index row for the old incarnation is marked stale; dependent capabilities see the new identity.
- **Failure cases:** stale identity silently reused after replacement → defect; dedup grouping across two incarnations → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-FILES-003 — The metadata index is the query surface
- **Statement:** GIVEN file queries (names/paths/ids/size/times/attrs/links), WHEN they run, THEN they read the metadata index instead of walking the filesystem, and the index is updated from watcher deltas (bounded rescans on gaps) with per-row freshness.
- **Priority:** must
- **Source:** `ARCH/25-FILES.md` §1/§3/§4 · `ARCH/05-INVARIANTS.md` INV-20
- **Acceptance:** query-time I/O trace shows no directory walk; a delta-updated file appears in results without a full rescan; index rows expose `observed_at` freshness.
- **Failure cases:** query walking the filesystem → architecture violation; stale index row served without a freshness flag → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-FILES-004 — Watcher gaps abort to a bounded rescan, never a silent gap
- **Statement:** GIVEN a native watcher gap (dead/truncated USN journal, `IN_Q_OVERFLOW`, `FAN_Q_OVERFLOW`, FSEvents `MustScanSubDirs`, RDCW zero-length buffer), WHEN it is detected, THEN the cursor is discarded, the smallest known scope is rescanned, and a freshness anomaly is recorded — completeness is never claimed while a gap is open.
- **Priority:** must
- **Source:** `ARCH/25-FILES.md` §1/§3/§8 · `ARCH/21-WORLD-MODEL.md` §4 · `ARCH/05-INVARIANTS.md` INV-20
- **Acceptance:** overflow-injection test produces a scoped rescan plus anomaly event; no result set is served as complete while the gap is unresolved.
- **Failure cases:** silent gap → defect; full-volume rescan when a smaller known scope was available → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-FILES-005 — Cursor and epoch discipline survives restart and journal reset
- **Statement:** GIVEN a collector instance, WHEN deltas are consumed, THEN its cursor row is `(source, scope, epoch, cursor, observed_at)`; a journal-id/epoch change or a deleted/truncated journal discards the cursor and requests a rescan; records at or below the cursor are rejected, never silently applied.
- **Priority:** must
- **Source:** `ARCH/25-FILES.md` §3/§4 · `ARCH/21-WORLD-MODEL.md` §4
- **Acceptance:** restart resumes from the stored cursor; epoch-change test discards and rescans with the reset recorded; a duplicate/replayed batch is refused.
- **Failure cases:** stale cursor applied after journal reset → defect; replayed records silently applied → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-FILES-006 — Writes re-validate freshness before mutating
- **Statement:** GIVEN a write targeting a known file, WHEN the index entry is stale (TTL passed, identity/size/mtime guard mismatch), THEN the object is re-validated against live state and marked `unknown` on failure before any mutation — never a blind write against a stale snapshot.
- **Priority:** must
- **Source:** `ARCH/25-FILES.md` §4 · `ARCH/21-WORLD-MODEL.md` §4
- **Acceptance:** stale-entry write test triggers re-validation; an identity/size/mtime mismatch blocks or re-keys the write and surfaces; an `unknown` object is not mutated without re-validation.
- **Failure cases:** blind write on a stale/unknown object → defect; silent overwrite of a newer version → violation.
- **Tests:** pending
- **Status:** seeded

#### REQ-FILES-007 — Overlapping writes are serialized by leases
- **Statement:** GIVEN two writers whose path scopes overlap, WHEN a write lease is requested, THEN exactly one is granted and the other receives a conflict result offering queue · rebase (VCS-aware) · ask — never a silent overwrite.
- **Priority:** must
- **Source:** `ARCH/25-FILES.md` §1/§6 · `ARCH/04-DECISIONS.md` DEC-029
- **Acceptance:** concurrent-writer test yields grant + conflict; the conflict resolves through the declared policy; no interleaved write reaches disk.
- **Failure cases:** silent overwrite → violation; both writers granted the same scope → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-FILES-008 — Leases expire crash-safe, are audited and bound to work
- **Statement:** GIVEN a granted lease, WHEN the holder crashes or the work ends, THEN the lease expires without manual cleanup, ownership is tied to `work_id`/worker, grant/conflict/expiry are audited, and worktree-isolated writers hold leases on their checkout with merges as explicit steps.
- **Priority:** must
- **Source:** `ARCH/25-FILES.md` §6 · `ARCH/04-DECISIONS.md` DEC-029 · `ARCH/05-INVARIANTS.md` INV-24
- **Acceptance:** crash-expiry test releases the lease; audit entries exist for grant and expiry; a merge into the parent without its lease is rejected.
- **Failure cases:** permanent lease after crash → defect; unaudited grant/expiry → violation.
- **Tests:** pending
- **Status:** seeded

#### REQ-FILES-009 — Canonicalization precedes policy checks and is re-checked at use
- **Statement:** GIVEN a path used in an operation, WHEN policy resolves it, THEN symlinks/junctions are canonicalized first, platform case-sensitivity and Windows long-path rules are declared, and a canonical mismatch between check and use denies the operation (TOCTOU-aware).
- **Priority:** must
- **Source:** `ARCH/25-FILES.md` §7 · `ARCH/12-TRUST.md` §2/§8
- **Acceptance:** symlink-swap test denies at use time; case/long-path declaration tests per platform; no policy decision is made on a non-canonical path.
- **Failure cases:** policy decision on a non-canonical path → security failure; check/use race exploited → TOCTOU violation.
- **Tests:** pending
- **Status:** seeded

#### REQ-FILES-010 — Path scopes intercept; protected subpaths stay read-only
- **Statement:** GIVEN workspace path scopes (`allowed_paths` / `read_only_paths`), WHEN out-of-scope access occurs, THEN it is denied and logged (interception, not un-discovery), and protected subpaths (VCS hooks, system dirs) remain read-only inside writable roots.
- **Priority:** must
- **Source:** `ARCH/25-FILES.md` §7 · `ARCH/12-TRUST.md` §2/§8 · `ARCH/05-INVARIANTS.md` INV-10
- **Acceptance:** out-of-scope access denied and logged; protected subpath write denied inside an otherwise writable root; listing suppression is not used as a security mechanism.
- **Failure cases:** out-of-scope write allowed → security failure; protected subpath mutated → violation.
- **Tests:** pending
- **Status:** seeded

#### REQ-FILES-011 — Workspace/project identity anchors scopes and survives worktrees
- **Statement:** GIVEN a workspace (`DM-024`: folder · repo · multi-root with roots/trust/policy refs), WHEN project identity is assigned, THEN it is keyed by canonical repo root with git remote as an attribute, re-keying on move/clone is explicit, and worktrees share the parent project identity.
- **Priority:** must
- **Source:** `ARCH/25-FILES.md` §5 · `ARCH/06-DATA-MODEL.md` DM-024 · `ARCH/17-MEMORY.md` §2.1
- **Acceptance:** worktree membership maps to the parent identity; move/clone without an explicit re-key keeps the old key; memory and policy scopes resolve through the same key.
- **Failure cases:** implicit re-key → defect; worktree treated as a new project → memory fragmentation or cross-scope leakage → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-FILES-012 — Unreadable scopes are skipped honestly and surfaced
- **Statement:** GIVEN a permission-denied or unreadable path during collection, WHEN the scan proceeds, THEN the path is skipped without aborting the scan, the skip is surfaced with a count (metadata-mode honesty), and the instance's consent/elevation mode (helper/per-scan/non-admin) is recorded.
- **Priority:** should
- **Source:** `ARCH/25-FILES.md` §3/§8 · `ARCH/21-WORLD-MODEL.md` §5 · `ARCH/05-INVARIANTS.md` INV-20
- **Acceptance:** a permission-denied fixture yields a partial result plus a surfaced skipped count; the collector mode is recorded on the instance; elevated modes remain consent-gated.
- **Failure cases:** one denied path aborting the whole scan → defect; skipped paths hidden → defect; silent elevation → violation.
- **Tests:** pending
- **Status:** seeded

### Code (`CODE`)

#### REQ-CODE-001 — RepoGraph builds incrementally into a per-workspace store
- **Statement:** GIVEN a workspace, WHEN the RepoGraph index is built or updated, THEN it stores the declared node kinds (File · Symbol · Import · Reference · Call · Test · Config · Document · Command) and typed edges (`imports` · `calls` · `extends/implements` · `references` · `tested_by` · `configured_by` · `generated_by` · `depends_on`), re-parses only hash-changed files, and keeps one store per workspace.
- **Priority:** must
- **Source:** `ARCH/26-CODE.md` §1/§2/§8 · `ARCH/07-CONTRACTS.md` CTR-025
- **Acceptance:** change-one-file test re-parses only that file; a clean rebuild equals the incremental result; a corrupted store rebuilds from source within bounded work; stores do not leak across workspaces.
- **Failure cases:** full re-parse on every change → defect (bounded-work violation); cross-workspace store leakage → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-CODE-002 — Edge precision is labeled; inference is never presented as certainty
- **Statement:** GIVEN graph edges and query results, WHEN they are produced, THEN compiler/LSP-grade edges and heuristic (tree-sitter/regex-level) edges are distinct in the data, and consumers can tell which is which — an inferred relationship is never rendered as certain.
- **Priority:** must
- **Source:** `ARCH/26-CODE.md` §1/§2/§12
- **Acceptance:** every edge/query result exposes a precision class; a heuristic-only edge is labeled inferred in agent and UI projections; precision survives projections.
- **Failure cases:** heuristic edge shown as compiler-grade → defect; precision field lost in a projection → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-CODE-003 — RepoMap is a bounded, deterministic signature projection
- **Statement:** GIVEN the RepoGraph, a token budget and task hints, WHEN a RepoMap is produced, THEN it is a deterministic signature-level projection (declarations + key refs, not bodies) within the declared token allowance — zero budget yields zero map — with stable ordering for the cache prefix.
- **Priority:** must
- **Source:** `ARCH/26-CODE.md` §1/§3 · `ARCH/16-CONTEXT.md` §3/§5 · `ARCH/04-DECISIONS.md` DEC-027
- **Acceptance:** identical (graph, budget, hints) yields byte-identical output; an oversize case drops whole entries to fit; zero-budget emits nothing; no file bodies appear in the map.
- **Failure cases:** nondeterministic ordering → defect; budget overrun → defect; body dump → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-CODE-004 — LSP bridge enriches precisely and degrades cleanly
- **Statement:** GIVEN a language server for the workspace language set, WHEN it is available, THEN definitions/references/hover/diagnostics/symbols resolve through it (rename policy-gated, lifecycle under `19`); WHEN it is absent or crashed, THEN queries degrade to RepoGraph + ripgrep with diagnostics marked unavailable — never a silent empty answer.
- **Priority:** must
- **Source:** `ARCH/26-CODE.md` §4 · `ARCH/19-RUNTIME-ENVIRONMENTS.md` §3 · `ARCH/16-CONTEXT.md` §2
- **Acceptance:** LSP-down test returns graph/search results with an explicit unavailable marker; rename without policy approval is denied; diagnostics surface as context items.
- **Failure cases:** silent empty result on LSP crash → defect; ungated rename → violation.
- **Tests:** pending
- **Status:** seeded

#### REQ-CODE-005 — Retrieval returns refs and bounded excerpts only
- **Statement:** GIVEN a lexical (ripgrep), structural (graph) or combined query, WHEN results return, THEN each result is a `file:range` ref with a bounded excerpt, path-scoped by policy, and whole-file dumps are never the default.
- **Priority:** must
- **Source:** `ARCH/26-CODE.md` §5 · `ARCH/12-TRUST.md` §2 · `ARCH/16-CONTEXT.md` §2
- **Acceptance:** excerpt-size bound test; out-of-scope search path denied; resolving a result's content is a separate permission-checked read.
- **Failure cases:** whole-file dump by default → defect; unscoped search → security failure.
- **Tests:** pending
- **Status:** seeded

#### REQ-CODE-006 — Worktrees are per-spawn options with explicit merge and cleanup
- **Statement:** GIVEN isolated coding work, WHEN a worktree is provisioned, THEN isolation is requested per spawn (cheap read-only work does not pay it), the branch strategy is declared per task, the parent holds write leases, merging is an explicit reviewed step with receipts, and abandoned worktrees are cleaned with a receipt.
- **Priority:** must
- **Source:** `ARCH/26-CODE.md` §1/§6 · `ARCH/04-DECISIONS.md` DEC-029 · `ARCH/25-FILES.md` §6
- **Acceptance:** isolation-request test creates a worktree; merge requires diff review + tests and emits a receipt; abandoned-worktree cleanup is receipted.
- **Failure cases:** silent merge into the parent workspace → violation; worktree leak without a cleanup receipt → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-CODE-007 — Destructive git operations are policy-gated
- **Statement:** GIVEN a destructive history or remote operation (force-push, reset, rebase rewrite), WHEN it is requested, THEN it is policy-gated and requires explicit approval — no silent history rewrite occurs.
- **Priority:** must
- **Source:** `ARCH/26-CODE.md` §6 · `ARCH/12-TRUST.md` §3
- **Acceptance:** force-push denied without approval; the decision is recorded; a rejected operation leaves the repository unchanged.
- **Failure cases:** silent rebase/reset → violation; force-push outside policy → catastrophic-class violation.
- **Tests:** pending
- **Status:** seeded

#### REQ-CODE-008 — Code execution walks the governed path
- **Statement:** GIVEN a code execution request (`code.run` · `code.test` · `code.build` · `code.lint`), WHEN it runs, THEN it executes inside a declared environment under exec policy on the governed path with a ticket — never a direct subprocess from the agent.
- **Priority:** must
- **Source:** `ARCH/26-CODE.md` §1/§7 · `AGENTCOWORK-SPEC.md` §4 · `ARCH/05-INVARIANTS.md` INV-01/INV-03 · `ARCH/03-HLD.md` §5
- **Acceptance:** no direct agent subprocess path exists; the wrapper test shows capability handle + ticket + receipt; denial is typed and leaves no side effect.
- **Failure cases:** direct subprocess from the agent → architecture violation; execution without a ticket → denied + audit.
- **Tests:** pending
- **Status:** seeded

#### REQ-CODE-009 — Execution output is bounded with a durable full log
- **Statement:** GIVEN a build/test/run execution, WHEN it completes, THEN output capture is bounded (full log → artifact ref, compact view → context) and long jobs run on the background lane with observable status.
- **Priority:** must
- **Source:** `ARCH/26-CODE.md` §7 · `ARCH/16-CONTEXT.md` §4 · `ARCH/11-WORK.md` §3 · `ARCH/05-INVARIANTS.md` INV-22
- **Acceptance:** output-bound test keeps the compact view within budget while the full log stays retrievable as an artifact; a long job lands on the background lane; no unbounded output enters context.
- **Failure cases:** full output into context → INV-22 violation; lost log → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-CODE-010 — Index freshness follows file deltas; stale edges are visible
- **Statement:** GIVEN file changes reported by `25` watcher deltas, WHEN the index updates, THEN changed files are reindexed, stale edges are flagged rather than served as fresh, and queries prefer fresh subgraphs.
- **Priority:** must
- **Source:** `ARCH/26-CODE.md` §2 · `ARCH/25-FILES.md` §3
- **Acceptance:** watcher-delta test updates only affected files; a stale-edge query is flagged; queries prefer the fresh subgraph.
- **Failure cases:** stale edge served as current → defect; a delta ignored → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-CODE-011 — Index bounds and the v1 language set are declared
- **Statement:** GIVEN a large or mixed repository, WHEN indexing runs, THEN ignore rules (node_modules/vendor/build), size caps and the v1 tree-sitter/LSP language set are declared and enforced, and unsupported languages degrade to lexical results instead of failing the index.
- **Priority:** should
- **Source:** `ARCH/26-CODE.md` §2/§10
- **Acceptance:** ignore-rule test excludes declared paths; an oversized file is skipped with a flag; an unsupported-language file remains lexically searchable.
- **Failure cases:** unbounded index over vendor trees → defect; unsupported language aborting the whole index → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-CODE-012 — Generated files carry provenance; direct edits are flagged
- **Statement:** GIVEN a generated file, WHEN it is indexed or edited, THEN `generated_by` provenance is recorded and a direct edit to a generated file is flagged rather than silently accepted.
- **Priority:** should
- **Source:** `ARCH/26-CODE.md` §2/§8
- **Acceptance:** provenance resolves to the producing step; an edit-to-generated test raises a flag; regeneration updates the edge.
- **Failure cases:** generated file edited without a flag → defect; provenance lost → defect.
- **Tests:** pending
- **Status:** seeded

### Search (`SEARCH`)

#### REQ-SEARCH-001 — One search implementation
- **Statement:** GIVEN any search need (UI, agent, service, workflow), WHEN it is served, THEN it resolves through the single kernel search service via contracts — no second search path, index or parallel implementation exists.
- **Priority:** must
- **Source:** `ARCH/27-SEARCH.md` §1 · `ARCH/03-HLD.md` §4 · `AGENTCOWORK-SPEC.md` §8
- **Acceptance:** static check finds one search implementation; every consumer calls through the service; no module-local ad-hoc search over another owner's store.
- **Failure cases:** a second search path → architecture violation; a consumer querying a source store directly → review failure.
- **Tests:** pending
- **Status:** seeded

#### REQ-SEARCH-002 — Deterministic, model-free queries
- **Statement:** GIVEN any search query, WHEN it executes, THEN it performs zero model calls and no network activity — lexical and structured retrieval only.
- **Priority:** must
- **Source:** `ARCH/27-SEARCH.md` §1/§6 · `AGENTCOWORK-SPEC.md` §9 · `ARCH/05-INVARIANTS.md` INV-13 · `ARCH/04-DECISIONS.md` DEC-015
- **Acceptance:** traces show zero model calls and zero network I/O for search; token accounting attributes no spend; results are reproducible for identical inputs.
- **Failure cases:** a model call on a search path → INV-13 violation; network fetch inside local search → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-SEARCH-003 — Scope and sensitivity are enforced before querying
- **Statement:** GIVEN a query, WHEN it runs, THEN it carries scopes and a sensitivity ceiling from the caller's policy snapshot, and out-of-scope sources are never queried for that caller — filtering is not an after-the-fact step.
- **Priority:** must
- **Source:** `ARCH/27-SEARCH.md` §1/§5 · `ARCH/05-INVARIANTS.md` INV-10 · `ARCH/12-TRUST.md` §8
- **Acceptance:** an out-of-scope source is untouched in query traces; a sensitive hit for lower clearance is filtered before scoring; cross-project leakage is zero.
- **Failure cases:** post-hoc filtering after a source was read → violation; unscoped query → security failure.
- **Tests:** pending
- **Status:** seeded

#### REQ-SEARCH-004 — External agents receive a filtered search projection
- **Statement:** GIVEN an external agent, WHEN it queries search, THEN it sees only its own project plus granted scopes, and out-of-scope refs resolve to `NotFound` — deny-by-default.
- **Priority:** must
- **Source:** `ARCH/27-SEARCH.md` §5/§8 · `ARCH/04-DECISIONS.md` DEC-009 · `ARCH/05-INVARIANTS.md` INV-11
- **Acceptance:** external-agent query test returns only granted scope; an out-of-scope id is not found; no internal index handles leak.
- **Failure cases:** a cross-project result → security violation; an internal handle exposed → violation.
- **Tests:** pending
- **Status:** seeded

#### REQ-SEARCH-005 — Source adapters declare powers and never bypass owners
- **Statement:** GIVEN a source (files metadata, memory, artifacts, world objects, repo symbols, events), WHEN its adapter is registered, THEN it declares supported query forms, freshness semantics and cost class; search composes adapters and never writes or bypasses the owner's store, and structural code queries delegate to `26`.
- **Priority:** must
- **Source:** `ARCH/27-SEARCH.md` §2 · `ARCH/07-CONTRACTS.md` §1
- **Acceptance:** adapter registry shows declared powers; search performs no source-store writes; a code-symbol query routes to RepoGraph.
- **Failure cases:** an adapter accessing a store it does not own → architecture violation; search re-indexing code → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-SEARCH-006 — Query forms compose with a deterministic v1 merge
- **Statement:** GIVEN a query mixing lexical (BM25), structured filters, exact lookups and delegated structural forms, WHEN results are merged, THEN v1 merges by source priority + recency with deterministic tie-breaks (fusion/RRF deferred until a measured trigger), and zero results is a valid outcome.
- **Priority:** must
- **Source:** `ARCH/27-SEARCH.md` §3 · `ARCH/17-MEMORY.md` §12 · `ARCH/16-CONTEXT.md` §11
- **Acceptance:** mixed-form query test; identical inputs produce identical order; empty result sets are returned without padding.
- **Failure cases:** nondeterministic merge order → defect; a fusion layer shipping without the measured trigger → review failure.
- **Tests:** pending
- **Status:** seeded

#### REQ-SEARCH-007 — Canonical result shape; abstention is correct
- **Statement:** GIVEN any result, WHEN it is returned, THEN it carries `ref` · `source` · `score` · `freshness` · bounded `snippet` · `sensitivity`; resolving content is a separate permission-checked read; when nothing matches, nothing is returned.
- **Priority:** must
- **Source:** `ARCH/27-SEARCH.md` §1/§3/§4 · `ARCH/17-MEMORY.md` §6
- **Acceptance:** schema test on every result; a zero-hit query returns an empty set (no placeholder); content resolution performs its own permission check.
- **Failure cases:** missing result fields → defect; padding or guessed results → defect; content embedded without a permission check → security failure.
- **Tests:** pending
- **Status:** seeded

#### REQ-SEARCH-008 — Ranking is deterministic and explained by declared factors
- **Statement:** GIVEN two comparable results, WHEN they are ranked, THEN order derives from source-native score × recency × pin/priority boosts with deterministic tie-breaks, and no personalization beyond the declared factors exists in v1.
- **Priority:** must
- **Source:** `ARCH/27-SEARCH.md` §4/§9
- **Acceptance:** tie-break determinism test; ranking factors observable per result; no personalized-ranking code path.
- **Failure cases:** nondeterministic ranking → defect; hidden personalization → review failure.
- **Tests:** pending
- **Status:** seeded

#### REQ-SEARCH-009 — Result sets are bounded; over-broad queries get guidance
- **Statement:** GIVEN an over-broad query, WHEN it executes, THEN result count and snippet size are capped end-to-end and the caller receives narrowing guidance instead of an unbounded result set.
- **Priority:** must
- **Source:** `ARCH/27-SEARCH.md` §3/§7
- **Acceptance:** caps test enforced at the service (not only in UI); over-broad fixture returns guidance; downstream consumers cannot lift caps.
- **Failure cases:** unbounded result set → defect; caps enforced only in the UI → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-SEARCH-010 — Local metadata search meets the declared latency target
- **Statement:** GIVEN 100k indexed files on the reference profile, WHEN metadata search runs, THEN p95 ≤ 50 ms with local indexes only (no network in the search path).
- **Priority:** should
- **Source:** `ARCH/27-SEARCH.md` §6 · `ARCH/42-EVIDENCE-MAP.md`
- **Acceptance:** the 100k-file benchmark records p95 ≤ 50 ms; the evidence record is attached to the requirement.
- **Failure cases:** target missed without a recorded deviation → defect; a network dependency in the path → violation.
- **Tests:** pending
- **Status:** seeded

#### REQ-SEARCH-011 — Staleness and partial failure are surfaced, never silent
- **Statement:** GIVEN a missing or stale source index, or a failing adapter, WHEN results return, THEN freshness is flagged, partial results come with a typed error path, and other sources remain unaffected.
- **Priority:** must
- **Source:** `ARCH/27-SEARCH.md` §7 · `ARCH/21-WORLD-MODEL.md` §4
- **Acceptance:** stale-index fixture flags freshness; adapter-error test returns partial results plus a typed error; healthy sources are unaffected.
- **Failure cases:** stale results presented as fresh → defect; one adapter failure failing the whole query → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-SEARCH-012 — Search returns references, not answers
- **Statement:** GIVEN a search response, WHEN the caller needs content, THEN the response contains refs and bounded snippets only, and answer synthesis happens outside the search service (agent/consumer) — search never synthesizes prose or bypasses a permission check.
- **Priority:** must
- **Source:** `ARCH/27-SEARCH.md` §1/§4
- **Acceptance:** response shapes contain no synthesized answer text; every content read triggered from a result passes a permission check.
- **Failure cases:** search emitting synthesized answers → design violation; result content embedded while bypassing permission → security failure.
- **Tests:** pending
- **Status:** seeded

### Communication (`COMMS`)

#### REQ-COMMS-001 — Capabilities, never a client
- **Statement:** GIVEN communication functionality, WHEN it is exposed, THEN it is capability verbs (`mail.*` · `calendar.*` · `messaging.*` · `web.*`) over connectors — the product never ships a second inbox/messaging client or a mirrored mailbox.
- **Priority:** must
- **Source:** `ARCH/28-COMMS.md` §1/§3/§9 · `AGENTCOWORK-SPEC.md` §8
- **Acceptance:** capability-surface test; no mailbox mirror store exists; UI surfaces act through capability calls.
- **Failure cases:** a mirror inbox → architecture violation; a second send path outside capabilities → violation.
- **Tests:** pending
- **Status:** seeded

#### REQ-COMMS-002 — Connectors are providers behind the adapter contract
- **Statement:** GIVEN a connector (native HTTP · MCP server · plugin), WHEN it registers, THEN it implements the `14` provider adapter contract and nothing above Capability knows the transport; a transport swap preserves capability contracts.
- **Priority:** must
- **Source:** `ARCH/28-COMMS.md` §1/§2 · `ARCH/14-PROVIDERS.md` §2/§3 · `ARCH/04-DECISIONS.md` DEC-025
- **Acceptance:** connector-swap test with no capability change; descriptors carry no transport vocabulary; `14` conformance per connector.
- **Failure cases:** transport details leaking into capability contracts → defect; a connector outside the adapter contract → review failure.
- **Tests:** pending
- **Status:** seeded

#### REQ-COMMS-003 — Connector descriptors, consent and vault-only credentials
- **Statement:** GIVEN a connector instance, WHEN it is configured, THEN its descriptor declares id · provider · auth type · scopes · capabilities · sync model · rate limits · data classes, auth flows run locally with tokens landing only in the vault, and a per-instance consent record exists.
- **Priority:** must
- **Source:** `ARCH/28-COMMS.md` §2 · `ARCH/12-TRUST.md` §6 · `ARCH/21-WORLD-MODEL.md` §5 · `ARCH/05-INVARIANTS.md` INV-02
- **Acceptance:** descriptor-completeness test; secret scan finds no token outside the vault; consent record present per instance; a scope change requires new consent.
- **Failure cases:** token in config/log/event → custody violation; connector active without consent → violation.
- **Tests:** pending
- **Status:** seeded

#### REQ-COMMS-004 — On-demand sync; no bulk ingestion
- **Statement:** GIVEN connector data, WHEN it is accessed, THEN queries run on demand plus subscriptions where the provider offers them, caches are bounded (headers only where a capability requires it), and nothing (mailbox/calendar/messages) is mirrored by default.
- **Priority:** must
- **Source:** `ARCH/28-COMMS.md` §1/§2/§5 · `AGENTCOWORK-SPEC.md` §8
- **Acceptance:** mirror-store absence test; cache-bound test; an offline query reports coverage rather than stale data.
- **Failure cases:** silent bulk mirror → violation; unbounded cache growth → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-COMMS-005 — Sends are approval-gated and receipted
- **Statement:** GIVEN a send-class action (`mail.send` · `messaging.send` · `calendar.create` with invites), WHEN it executes, THEN it follows draft → approval primitive with `edit` semantics → send → receipt; an uncertain outcome lands in `needs_attention` with no silent retry.
- **Priority:** must
- **Source:** `ARCH/28-COMMS.md` §1/§3/§6 · `ARCH/04-DECISIONS.md` DEC-021 · `ARCH/05-INVARIANTS.md` INV-07 · `ARCH/20-WORKFLOW.md` §7
- **Acceptance:** send without approval is denied; the receipt cites the exact content ref; timeout-after-submit yields `needs_attention` and no duplicate send.
- **Failure cases:** ungated send → violation; duplicate send after an uncertain outcome → defect; receiptless send → violation.
- **Tests:** pending
- **Status:** seeded

#### REQ-COMMS-006 — Read/write risk classes are declared and honored
- **Statement:** GIVEN a communication capability, WHEN its risk class is set, THEN reads are `sensitive` and externally visible sends are `dangerous`, default decisions follow the policy model, and content sensitivity defaults apply (message bodies `confidential`, profile metadata `personal`).
- **Priority:** must
- **Source:** `ARCH/28-COMMS.md` §3/§5 · `ARCH/12-TRUST.md` §3 · `ARCH/06-DATA-MODEL.md` DM-011
- **Acceptance:** descriptor risk-class test; default-decision tests for read/send; sensitivity defaults asserted on stored refs.
- **Failure cases:** send classified `safe` → violation; read exposed without policy evaluation → violation.
- **Tests:** pending
- **Status:** seeded

#### REQ-COMMS-007 — Content is untrusted; excerpts bounded; attachments gated
- **Statement:** GIVEN message/calendar/web content, WHEN it enters the agent, THEN it is untrusted input (no instruction authority), enters context only as bounded excerpts on demand, and attachments move through the artifact gateway with the connector's permissions recorded.
- **Priority:** must
- **Source:** `ARCH/28-COMMS.md` §3/§5 · `ARCH/29-ARTIFACTS.md` §5 · `ARCH/16-CONTEXT.md` §2 · `ARCH/04-DECISIONS.md` DEC-037
- **Acceptance:** injection-corpus test (content never auto-executes); excerpt-bound test; attachment permission record present.
- **Failure cases:** message content treated as instructions → violation; bulk bodies imported into memory → violation; attachment bypassing the gateway → security failure.
- **Tests:** pending
- **Status:** seeded

#### REQ-COMMS-008 — Arrival events carry refs, not bodies, with dedupe
- **Statement:** GIVEN `email.arrived` · `message.received` · `calendar.event.upcoming`, WHEN published, THEN payloads carry refs + metadata only (never full bodies) with provenance and dedupe keys, and workflows may subscribe; content fetches remain separate permission-checked capability calls.
- **Priority:** must
- **Source:** `ARCH/28-COMMS.md` §4 · `ARCH/30-EVENTS.md` · `ARCH/20-WORKFLOW.md` §5
- **Acceptance:** payload-shape test (no bodies); duplicate delivery deduped by key; a subscribed workflow triggers once per distinct event.
- **Failure cases:** body content in an event payload → violation; duplicate event causing a duplicate side effect → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-COMMS-009 — Accounts and scopes are isolated
- **Statement:** GIVEN multiple accounts, WHEN a query or send runs, THEN scopes isolate accounts and cross-account access is explicit — never implicit.
- **Priority:** must
- **Source:** `ARCH/28-COMMS.md` §5
- **Acceptance:** cross-account query denied without an explicit scope; per-account token/scope isolation; an account switch does not merge results.
- **Failure cases:** implicit account mixing → violation; cross-account send → security failure.
- **Tests:** pending
- **Status:** seeded

#### REQ-COMMS-010 — Connector failures are typed, bounded and honest
- **Statement:** GIVEN connector failures (expired/revoked token · rate limit · partial sync · uncertain send · abuse guard), WHEN they occur, THEN behavior is bounded and typed: re-auth guidance with no cached-credential fallback, backoff + queue, flagged coverage, `needs_attention`, and per-connector rate caps.
- **Priority:** must
- **Source:** `ARCH/28-COMMS.md` §7 · `ARCH/12-TRUST.md` §6 · `ARCH/13-CAPABILITY.md` §3
- **Acceptance:** failure-mode matrix tests (one per row); no fallback to cached credentials; persistent limits surfaced to the user.
- **Failure cases:** silent fallback to stale credentials → violation; unbounded retry → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-COMMS-011 — `web.search` is a bounded, cited capability
- **Statement:** GIVEN a `web.search` call, WHEN it executes, THEN it honors declared affordances (query · count ≤20 with default 8 · freshness · type · domain allow/block · locale), returns results carrying `{ref, url, title?, retrieved_at, …}`, and consumes the per-session search budget counted across subagents.
- **Priority:** must
- **Source:** `ARCH/28-COMMS.md` §3 (Web search & fetch) · `ARCH/04-DECISIONS.md` DEC-037 · `AGENTCOWORK-SPEC.md` §3
- **Acceptance:** cap test (hard max 20, default 8); budget test across subagents; citation-fields test; domain filters honored.
- **Failure cases:** uncited result → defect; budget bypass via a subagent → violation; count over 20 → rejected.
- **Tests:** pending
- **Status:** seeded

#### REQ-COMMS-012 — `web.fetch` content is size-capped, cached transparently, and cited
- **Statement:** GIVEN a `web.fetch` call, WHEN it executes, THEN it enforces caps (5 MB body · timeout ≤120 s · declared max chars/tokens), caches per session by `(normalized URL, format)` with a default 15-minute TTL and an explicit `fresh` bypass, and returns `retrieved_at` (+ `sha256`) with content kept as an artifact ref.
- **Priority:** must
- **Source:** `ARCH/28-COMMS.md` §3 (Web search & fetch) · `ARCH/04-DECISIONS.md` DEC-037
- **Acceptance:** cap tests; cache key/TTL tests; `fresh` bypass test; a cached result always surfaces its retrieval time; no silent page substitution.
- **Failure cases:** uncapped fetch → defect; cache key collision → defect; silently serving a different page → violation.
- **Tests:** pending
- **Status:** seeded

#### REQ-COMMS-013 — Web access obeys custody, egress and no-evasion rules
- **Statement:** GIVEN any web search/fetch, WHEN it leaves the machine, THEN provider credentials travel only via vault refs (never in URLs), egress passes Guard with a domain allow/block policy that overrides model requests, the SSRF floor rejects localhost/no-dot/private/link-local/metadata targets after resolution, cross-host redirects are surfaced, and fetched content is untrusted — robots/ToS honored, no evasion.
- **Priority:** must
- **Source:** `ARCH/28-COMMS.md` §3 (Web search & fetch) · `ARCH/05-INVARIANTS.md` INV-02/INV-05 · `ARCH/04-DECISIONS.md` DEC-016/DEC-037
- **Acceptance:** SSRF corpus test (resolve-then-check); key-in-URL scan clean; a model-requested domain denied when policy blocks it; redirect host changes surfaced; no CAPTCHA/anti-bot code path exists.
- **Failure cases:** credential in a URL/query → custody violation; SSRF target reached → security failure; evasion behavior → catastrophic-class violation.
- **Tests:** pending
- **Status:** seeded

### Artifacts & Receipts (`ART`)

#### REQ-ART-001 — Artifact versions are immutable; edits create new versions
- **Statement:** GIVEN an artifact, WHEN a new edit is written, THEN a new immutable version is created (prior versions unchanged), and derived work records lineage via `parent_artifact?`.
- **Priority:** must
- **Source:** `ARCH/29-ARTIFACTS.md` §2 · `ARCH/06-DATA-MODEL.md` DM-019 · `ARCH/05-INVARIANTS.md` INV-18
- **Acceptance:** version-write test (previous version bytes unchanged); an edit produces version+1; a derived artifact carries its lineage link.
- **Failure cases:** in-place mutation of a written version → violation; silent overwrite → violation.
- **Tests:** pending
- **Status:** seeded

#### REQ-ART-002 — Provenance is mandatory on every artifact
- **Statement:** GIVEN any artifact created by agent/workflow/user/worker, WHEN it is recorded, THEN it carries a provenance chain (`created_by_agent → run → worker → workflow`) plus an inputs digest, and provenance-less artifacts are rejected.
- **Priority:** must
- **Source:** `ARCH/29-ARTIFACTS.md` §1/§2 · `ARCH/06-DATA-MODEL.md` DM-019 · `ARCH/05-INVARIANTS.md` INV-18
- **Acceptance:** provenance-completeness test; creation without provenance fails typed; the chain resolves to session/run refs.
- **Failure cases:** missing provenance → rejected; fabricated provenance → security failure.
- **Tests:** pending
- **Status:** seeded

#### REQ-ART-003 — Receipts are mandatory for externally visible effects
- **Statement:** GIVEN an externally visible effect, WHEN it completes, THEN a receipt is emitted inside the governed path (`12` → `13` → `34` → receipt), and the effect path cannot commit without it.
- **Priority:** must
- **Source:** `ARCH/29-ARTIFACTS.md` §3/§8 · `ARCH/05-INVARIANTS.md` INV-07 · `ARCH/04-DECISIONS.md` DEC-022 · `AGENTCOWORK-SPEC.md` §4
- **Acceptance:** an effect-without-receipt attempt is blocked before commit; every committed effect has a receipt citing effect/ticket/verification.
- **Failure cases:** visible effect without receipt → violation; receipt written outside the governed path → violation.
- **Tests:** pending
- **Status:** seeded

#### REQ-ART-004 — Receipts are immutable; replay is evidence replay
- **Statement:** GIVEN a recorded receipt, WHEN `replay(receipt)` runs, THEN it reconstructs inputs and shows what verification ran and what changed; re-doing the action is a new work item, never a silent re-fire.
- **Priority:** must
- **Source:** `ARCH/29-ARTIFACTS.md` §3 · `ARCH/07-CONTRACTS.md` CTR-018 · `ARCH/05-INVARIANTS.md` INV-07
- **Acceptance:** receipt-mutation attempt fails; replay performs no provider call or side effect; replay output matches the recorded verification.
- **Failure cases:** replay re-executing the effect → violation; mutated receipt → violation.
- **Tests:** pending
- **Status:** seeded

#### REQ-ART-005 — Receipt emission yields three views of one fact
- **Statement:** GIVEN a receipt emission, WHEN it occurs, THEN it also writes an event (`30`) and an audit entry (`12`) — three views of one fact with no duplicated state.
- **Priority:** must
- **Source:** `ARCH/29-ARTIFACTS.md` §3 · `ARCH/30-EVENTS.md` §3 (`receipt.recorded`) · `ARCH/12-TRUST.md` §9 · `ARCH/05-INVARIANTS.md` INV-23/INV-24
- **Acceptance:** emission produces exactly one event and one audit entry referencing the receipt; no store duplicates the receipt payload.
- **Failure cases:** receipt without an event or audit entry → defect; duplicated receipt state across stores → violation.
- **Tests:** pending
- **Status:** seeded

#### REQ-ART-006 — Library promotion is explicit and versioned
- **Statement:** GIVEN a reusable inventory item, WHEN it is promoted from work ("Save to Library" / "Save as template"), THEN promotion is explicit (never automatic), the Library item is global and durable with a `DM-023` kind, and versioning/deprecation are explicit operations.
- **Priority:** must
- **Source:** `ARCH/29-ARTIFACTS.md` §4 · `ARCH/04-DECISIONS.md` DEC-014 · `ARCH/06-DATA-MODEL.md` DM-023
- **Acceptance:** no automatic library entries after work completion; promotion requires an explicit action; artifact scope ≠ library scope test.
- **Failure cases:** auto-promotion → violation; library item without a promotion origin where applicable → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-ART-007 — Artifact gateway exchanges refs only under permissions
- **Statement:** GIVEN an external agent, WHEN it reads/writes/attaches/transforms/publishes an artifact, THEN exchange is by refs (`artifact_id` · `mime_type` · `uri`) under per-verb permission checks; raw storage paths are never exposed, and v1 is workspace-scoped — a cross-workspace request is denied typed (explicit export only).
- **Priority:** must
- **Source:** `ARCH/29-ARTIFACTS.md` §5 · `ARCH/41-EDGE-CASES.md` EDGE-105 · `ARCH/05-INVARIANTS.md` INV-11
- **Acceptance:** gateway verbs are gated per permission; no path leakage in responses or errors; a cross-workspace request is denied typed.
- **Failure cases:** raw path in a projection → security failure; unpermissioned verb → violation; implicit cross-workspace access → violation.
- **Tests:** pending
- **Status:** seeded

#### REQ-ART-008 — Receipt-pinned versions are never GC'd
- **Statement:** GIVEN garbage collection or retention pruning, WHEN a version is pinned by a receipt, THEN the pin check runs in the GC transaction and the version is skipped — chain integrity outranks storage savings.
- **Priority:** must
- **Source:** `ARCH/29-ARTIFACTS.md` §6 · `ARCH/41-EDGE-CASES.md` EDGE-100 · `ARCH/04-DECISIONS.md` DEC-032 · `AGENTCOWORK-SPEC.md` §7
- **Acceptance:** GC-vs-receipt race test (pinned version survives); an unpinned version is pruned per policy; the GC outcome is recorded.
- **Failure cases:** receipt-pinned version collected → violation; pin/GC race → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-ART-009 — Retention pruning and explicit delete are audited
- **Statement:** GIVEN retention policy or an explicit delete, WHEN versions are pruned/deleted, THEN pruning follows the per-workspace age/count policy, delete is a user/authorized operation, and both are audited.
- **Priority:** must
- **Source:** `ARCH/29-ARTIFACTS.md` §6 · `ARCH/05-INVARIANTS.md` INV-24 · `ARCH/04-DECISIONS.md` DEC-032
- **Acceptance:** a deletion audit entry is present; an unauthorized delete is denied; retained versions match policy; media follows the same rules.
- **Failure cases:** silent deletion → violation; delete outside authorization → security failure.
- **Tests:** pending
- **Status:** seeded

#### REQ-ART-010 — Previews are projections; rendering consumes zero model tokens
- **Statement:** GIVEN an artifact preview, WHEN the UI opens/renders it, THEN artifacts store render refs (thumbnail/render refs produced by domains, not pixels), and opening/rendering consumes zero model tokens.
- **Priority:** must
- **Source:** `ARCH/29-ARTIFACTS.md` §7 · `ARCH/04-DECISIONS.md` DEC-015 · `AGENTCOWORK-SPEC.md` §9
- **Acceptance:** opening a preview makes no model call; the artifact record stores refs; the render ref resolves through the domain renderer.
- **Failure cases:** preview generating a model call → violation; artifact storing raw pixels → defect.
- **Tests:** pending
- **Status:** seeded

#### REQ-ART-011 — Unresolved artifact locations keep digest and re-link
- **Statement:** GIVEN a moved/deleted backing location, WHEN the identity check (`25`) detects it, THEN the artifact is marked `unresolved`, receipts referencing it keep the digest, and the item is surfaced for re-link — never silently re-pointed.
- **Priority:** must
- **Source:** `ARCH/29-ARTIFACTS.md` §8 · `ARCH/41-EDGE-CASES.md` EDGE-101 · `ARCH/25-FILES.md` §2
- **Acceptance:** a moved-location test shows `unresolved` + re-link guidance; the receipt digest is unchanged; no path is guessed.
- **Failure cases:** artifact silently re-pointed to a different file → violation; receipt digest lost → violation.
- **Tests:** pending
- **Status:** seeded

#### REQ-ART-012 — Write failures are atomic; effects cannot complete without a receipt
- **Statement:** GIVEN a write failure mid-version or disk full during an artifact/receipt write, WHEN it occurs, THEN no partial version or receipt becomes visible (retry or discard), and a mandatory-receipt effect cannot complete — it pauses with reason.
- **Priority:** must
- **Source:** `ARCH/29-ARTIFACTS.md` §8 · `ARCH/41-EDGE-CASES.md` EDGE-104 · `ARCH/05-INVARIANTS.md` INV-07
- **Acceptance:** crash/disk-full injection leaves no partial records; the effect pauses instead of committing; the failure is audited.
- **Failure cases:** partial version visible → defect; effect committed with a missing receipt → violation.
- **Tests:** pending
- **Status:** seeded

## 5. Seeding status

| Domain | Seeds | Next pass |
|---|---|---|
| `PROD` (6) | drafted above | product-wide — verify in the finalisation lane |
| `CTX` (10) | drafted above + expanded in pass `16` | verified during pass `16` ✅ (2026-09-26) |
| `TRUST` (10), `CAP` (10) | drafted above + expanded in passes `12`/`13` | verified during passes `12` ✅ / `13` ✅ (2026-09-26) |
| `PROV` (10) | drafted above + expanded in pass `14` | verified during pass `14` ✅ (2026-09-26) |
| `AGX` (1), `UI` (1) | drafted above | Agent X finalisation lane, `AGENTCOWORK-UI.md` |
| `KERNEL` (7), `WORK` (8) | drafted above | verified during passes `10` ✅ / `11` ✅ (2026-09-26) |
| `MEM` (12) | drafted above + expanded in pass `17` | verified during pass `17` ✅ (2026-09-26) |
| `MODEL` (12) | drafted above + expanded in pass `18` | verified during pass `18` ✅ (2026-09-26) |
| `RTENV` (11) | drafted above + expanded in pass `19` | verified during pass `19` ✅ (2026-09-26) |
| `WF` (11) | drafted above + expanded in pass `20` | verified during pass `20` ✅ (2026-09-26) |
| `WORLD` (11) | drafted above + expanded in pass `21` | verified during pass `21` ✅ (2026-09-26) |
| `OFFICE` (11) | drafted above + expanded in pass `22` | verified during pass `22` ✅ (2026-09-26) |
| `BROWSER` (12) | drafted above + expanded in pass `23` | verified during pass `23` ✅ (2026-09-26) |
| `CUA` (12) | drafted above + expanded in pass `24` | verified during pass `24` ✅ (2026-09-26) |
| `FILES` (12) | drafted above + expanded in pass `25` | verified during pass `25` ✅ (2026-09-26) |
| `CODE` (12) | drafted above + expanded in pass `26` | verified during pass `26` ✅ (2026-09-26) |
| `SEARCH` (12) | drafted above + expanded in pass `27` | verified during pass `27` ✅ (2026-09-26) |
| `COMMS` (13) | drafted above + expanded in pass `28` | verified during pass `28` ✅ (2026-09-26) |
| `ART` (12) | drafted above + expanded in pass `29` | verified during pass `29` ✅ (2026-09-26) |
| `EVENTS`, `SKILL`, `CHAN`, `VERIFY` | pending | seeded during each module's P7 pass |

## 6. Related

- `AGENTCOWORK-SPEC.md` (WHAT) · `ARCH/03-HLD.md` (HOW) · `ARCH/05-INVARIANTS.md` (INV-*) · `ARCH/04-DECISIONS.md` (DEC-*)
- `ARCH/09-FEATURE-MATRIX.md` (traceability) · `TODO.md` (`TASK-*`) · `ARCH/42-EVIDENCE-MAP.md` (acceptance evidence)
- Process: `.agents/docs/spec-driven-development.md` · Template: `.agents/templates/SPEC.template.md`
