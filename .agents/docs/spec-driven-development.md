# Spec-Driven Development

A workflow for changing software through explicit, testable contracts instead of
improvised code. Written for human + agent teams; tool-, model- and client-agnostic.

## Four artifacts

| Artifact | Answers | Verified by |
|---|---|---|
| **Spec** | What must the system do? | acceptance tests |
| **Decision** (ADR) | Why this design and not another? | architecture review + conformance tests |
| **Plan** | How will we change the system? | task/definition-of-done completion |
| **Code** | What does the system do now? | unit / integration / e2e tests |

None replaces another. Spec and code drifting apart is a defect, not documentation debt.

## Spec layers

| Layer | Content | Example |
|---|---|---|
| L0 — Product / PRD | What and why; goals, non-goals; no implementation detail | product specification |
| L1 — Behavioral spec | Testable requirements (GIVEN/WHEN/THEN), priorities, failure cases, acceptance | requirement registry |
| L2 — Architecture | Components, responsibilities **and must-nots**, boundaries, interactions | HLD + module designs |
| L3 — Technical design | Schemas, interfaces, invariants, algorithms, limits | data model + contracts + module LLDs |
| Plan | Task units that reference requirement IDs, touched paths, tests | implementation plan |

## Identity and traceability

- Requirement IDs `REQ-<DOMAIN>-<NNN>`; task IDs `TASK-<DOMAIN>-<NNN>`; test IDs `TEST-<DOMAIN>-<NNN>`.
  Decisions keep their own register/ADR numbering.
- The chain **requirement → decision → implementation → test → evidence** must be
  answerable from the repository alone, e.g.
  `REQ-X-001 → DEC-018 → <code path> → TEST-X-001 → acceptance record`.
- IDs are stable once published. Never renumber; never reuse; deprecate instead.

## Requirement quality rules

1. One behavior per requirement.
2. Testable and observable — if no test could fail on it, it is not a requirement.
3. Failure cases are enumerated before implementation, not after.
4. Non-functional requirements carry numbers (latency, budget, limits, compatibility).
5. L0/L1 never prescribe implementation; L3 prescribes precisely.
6. Acceptance criteria exist for every requirement before code is written.
7. No requirement without an owner (a component that must satisfy it).

## Workflow

```text
USER REQUEST → REQUIREMENT → SPEC (or spec change) → IMPACT CHECK
→ ARCHITECTURE / DECISION → IMPLEMENTATION PLAN → CODE → TESTS / EVALS
→ SPEC VERIFICATION → REVIEW → MERGE → MONITOR → feedback into the spec
```

## The spec gate (before writing code)

1. Read the applicable specs and the decisions they reference.
2. Extract the requirement IDs this change implements and the constraints they impose.
3. Inspect the current implementation (code, tests, configuration) for those areas.
4. Plan the change; identify acceptance criteria and failure cases.
5. If the change requires an architecture change, obtain an explicit decision first.
6. Implement the smallest change that satisfies the requirements.
7. Test — including every failure case listed in the requirement.
8. Verify every acceptance criterion; report deviations instead of hiding them.

**Never silently change a spec.** When the spec and the requested behavior conflict,
stop, emit `BLOCKED`, and propose a decision/spec change. Implementation resumes only
after the spec question is resolved.

## Commits

Separate spec changes from code changes so history reads as intent → implementation:

```text
spec: support multi-agent conversations        (requirements only)
arch: introduce agent session coordinator      (architecture / decision)
feat: implement multi-agent runtime            (code)
test: add multi-agent integration tests        (tests)
```

## Pull request = spec verification

PR bodies state: spec touched · requirement IDs implemented · tests added/updated ·
architecture changes · spec deviations · new risks · migration notes.
A PR that implements requirements without tests, or changes behavior without a spec
update, is incomplete by definition.

## Machine-readable layer

Keep requirement entries in a stable, parseable shape (fixed heading + field lines) so
tooling can later answer, without an LLM: which requirements does this file implement ·
which requirements have no implementation · which acceptance tests are missing · which
specs does a change affect. A project can grow a small "spec compiler"
(spec → schema → tasks/tests/agent context) once the manual loop is stable:

1. keep entries parseable (this document's format);
2. generate coverage views in CI (missing implementation, missing test, changed spec — no test run);
3. only then consider stricter gates (no merge if an acceptance criterion fails or a constraint is violated).

## Adopting this in a repository

- Pick one spec home and one requirements registry per project; do not scatter requirement IDs.
- Map the decision register (ADR or `DEC-*`) and reference it from requirements.
- Map the plan file (task units carry requirement IDs, touched paths, tests).
- Wire the gate into the project's agent/contributor instructions.
- Keep acceptance/evidence paths explicit — "implemented" is not "verified".

## In this repository

- **L1 registry:** `ARCH/08-REQUIREMENTS.md` (`REQ-<DOMAIN>-<NNN>`, domain table inside).
- **Traceability:** `ARCH/09-FEATURE-MATRIX.md` (REQ → module → `DEC/DM/CTR` → `TASK` → `TEST`).
- **Decisions:** `ARCH/04-DECISIONS.md` (`DEC-*`); architecture changes require an entry.
- **L2/L3:** `ARCH/03-HLD.md` + `ARCH/10..34` module docs (each carries its requirements, interfaces and failure behavior).
- **Plan:** `TODO.md` — task units reference `REQ-*` IDs, touched paths and tests.
- **Acceptance/evidence:** `ARCH/42-EVIDENCE-MAP.md`.
- **Status labels for docs:** `Planned → Draft Pn → Review Pn → Frozen` (`ARCH/00-INDEX.md` §6).
