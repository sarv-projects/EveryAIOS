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
| `PROD` (6), `TRUST` (2), `CAP` (2), `CTX` (2), `MEM` (2) | drafted above | verify + split during the P7 module passes (`12`, `13`, `16`, `17`) |
| `WF` (1), `AGX` (1), `UI` (1) | drafted above | `20`, Agent X finalisation lane, `AGENTCOWORK-UI.md` |
| `KERNEL`, `WORK`, `PROV`, `MODEL`, `RTENV`, `WORLD`, `OFFICE`, `BROWSER`, `CUA`, `FILES`, `CODE`, `SEARCH`, `COMMS`, `ART`, `EVENTS`, `SKILL`, `CHAN`, `VERIFY` | pending | seeded during each module's P7 pass |

## 6. Related

- `AGENTCOWORK-SPEC.md` (WHAT) · `ARCH/03-HLD.md` (HOW) · `ARCH/05-INVARIANTS.md` (INV-*) · `ARCH/04-DECISIONS.md` (DEC-*)
- `ARCH/09-FEATURE-MATRIX.md` (traceability) · `TODO.md` (`TASK-*`) · `ARCH/42-EVIDENCE-MAP.md` (acceptance evidence)
- Process: `.agents/docs/spec-driven-development.md` · Template: `.agents/templates/SPEC.template.md`
