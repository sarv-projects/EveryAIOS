# ADR-0006 — Session kinds: `interactive` · `automation` · `delegated`

- **Status:** accepted
- **Date:** 2026-09-21
- **Applies to:** [`SESSION.md`](../SESSION.md) §2, §3, §6, §8 · [`WORK.md`](../WORK.md) §7 · [`AUTOMATION.md`](../AUTOMATION.md) §10
- **Related:** [`ADR/0005`](0005-external-agents-are-the-v1-engines.md) (§P71) — both land in the same wave.
  This ADR does **not** add an invariant; it resolves a silence between two existing contracts.

## Context

Two contracts currently disagree, and neither is wrong on its own:

- **`SESSION.md` §2** states *"`Chat ↔ Session` is **1:1**"*, and §3's hierarchy draws a single door:
  `SPACE → (PROJECTS → PROJECT CHATS | STANDALONE CHATS) → SESSION → WORK`. Every Session sits behind a Chat.
- **`WORK.md` §7** requires that *every* trigger create Work, and names six of them: Chat, **Scheduler**,
  Workflow/automation, **Subagent** (a child Work), external agent (acts inside the Work it is bound to), and
  MultiRun.

So a scheduler-created or delegation-created Work has **no Chat**. §3 gives it no Session either. The contract
is silent exactly where the kernel is busiest — automation and delegation.

Two failure modes follow if it stays silent, and both violate **I4**:

1. **An implementation invents a hidden Chat per automation run.** "Chat" then means two different things —
   the user's object *and* a system container — which is precisely the vocabulary collapse §1 exists to
   prevent.
2. **An implementation lets Work exist with no Session.** Then §5's scope chain
   (`Work → Session → Project → Space → User`) has no second rung, so memory and capability resolution for
   headless work is unspecified.

There is also a product requirement, not just a tidiness one: `AUTOMATION.md` §11 requires the automation
surface to show recent runs with an honest status. The user must be able to see and audit headless work
without a Chat being fabricated for them.

## Decision

1. **`Session` gains a `kind`:** `interactive` | `automation` | `delegated`. It is a **property of the
   Session**, never inferred from whether a Chat happens to exist.
2. **`Chat ↔ Session` remains 1:1 for interactive Sessions.** This ADR does not weaken §2: where a Chat
   exists there is exactly one Session, and vice versa.
3. **A non-interactive Session has no Chat, and that is normal** — the same way `project_id = null` is normal
   (§4). It is not a degraded or hidden state.
4. **Every Work has an owning Session, whatever the kind.** §5's scope chain must always have its second rung,
   so no Work can exist outside the chain.
5. **Delegation does not create a Session.** Child Work lives in its parent's Session — that is what **I8**
   ("subagents are child Work/Runs") already requires. `delegated` is reserved for an out-of-session
   delegation the user explicitly starts, not for ordinary child Work.
6. **User-facing surfaces still never say "Session"** (§2 unchanged). A non-interactive Session is reached
   *through its owner*: an automation run appears in the Automation screen's recent-runs list
   (`AUTOMATION.md` §11); a delegated Session appears in the work/Activity timeline.
7. **A Chat may be created *from* a non-interactive Session later** — a user opening a run to inspect or
   continue it. That is a projection-side affordance, not a second Session: the run's Session gains a Chat and
   the 1:1 rule then holds again.
8. **Scope resolution is unchanged in shape.** An `automation` Session resolves
   `Work → Session → Space → User`, or `… → Project → …` when the automation is project-scoped — identical to
   §5's standalone-chat rule. **No new resolution rule is introduced.**

Implementation is tracked as **P71.8** (`TODO.md`).

## Consequences

- §3's tree gains a **second root under Space**: Sessions that have no Chat. The diagram stops implying that
  Chat is the only door into the system.
- **Scheduler and automation code get a legal owner for their Work**, which is what makes `P71.3d` (shrinking
  `scheduler_service.rs` to a trigger plane) safe rather than merely tidy.
- **Scope resolution becomes total:** no Work can exist outside `Work → Session → … → User`, so memory and
  capability scoping are defined for headless work instead of unspecified.
- The UI must **not** invent a hidden Chat per automation run; `AUTOMATION.md` §11's run list is the surface,
  and rule 7 covers the "open it and continue" affordance.
- Retention follows the existing §6 split unchanged: delete projections, **retain** audit and receipts under
  the audit retention policy.
- `AGENT.md` is unaffected: bindings attach to a Session regardless of kind, and **I23**/**I24** hold for
  non-interactive Sessions exactly as for interactive ones.

## Alternatives rejected

- **Give every automation run a hidden Chat.** Rejected: it makes "Chat" mean both the user's object and a
  system container — the exact collapse §1 was written to prevent, and a UI-honesty failure (**I15**) since
  the user would see chats they never created.
- **Let headless Work exist with no Session.** Rejected: §5's scope chain loses its second rung, so memory and
  capability resolution for headless work would be undefined — a silent **I4** violation rather than a loud
  one.
- **Add a fourth container ("Job" / "Run group") for automation.** Rejected: it duplicates what Session
  already is (canonical context, events, artifacts, bindings) and creates a second state owner.
- **Make `delegated` the kind for all child Work.** Rejected: **I8** makes child Work/Runs part of the
  parent's Session; giving each child its own Session would fragment the parent's context and break the
  handoff bundle that makes agent switching work.
- **Infer the kind from the trigger instead of storing it.** Rejected: the same Session can outlive its
  trigger (a run the user later opens and continues), so the inferring rule would flip mid-life — a state
  owner that changes identity.
