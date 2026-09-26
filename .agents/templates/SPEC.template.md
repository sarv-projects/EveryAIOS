<!--
Blank specification template. Copy it into a project's spec home (for example
specs/<area>.md, or a requirements registry) and fill it in.

Rules: stable IDs; one behavior per requirement; acceptance and failure cases
before implementation; never silently change an accepted requirement.
Full protocol: `.agents/docs/spec-driven-development.md` (in this kit).
-->

# <Spec / area title>

> **Status:** Draft | Proposed | Accepted | Implemented | Deprecated — `<date>` · **Owner:** `<name/role>`
> **ID prefix:** `<DOMAIN>` (used by all requirements below, e.g. `REQ-<DOMAIN>-001`)

## 1. Problem

What is wrong or missing today, for whom, and why it matters. No solution language.

## 2. Goals

- <goal 1>

## 3. Non-goals

- <what this spec must never become>

## 4. User stories

- As a `<role>`, I want `<capability>`, so that `<outcome>`.

## 5. Requirements

One behavior per requirement; testable, observable, no implementation detail.
IDs are stable once published; deprecated IDs are never reused.

### REQ-<DOMAIN>-001 — <one-line title>

- **Statement:** GIVEN `<context>`, WHEN `<trigger>`, THEN `<observable outcome>`.
- **Priority:** must | should | may
- **Source:** `<issue / story / upstream spec / decision>`
- **Acceptance:** `<how a test proves it, concretely>`
- **Failure cases:** `<failure 1>`; `<failure 2>`
- **Tests:** `TEST-<DOMAIN>-001` (or `pending`)
- **Status:** seeded | accepted | implemented | verified | deprecated

### REQ-<DOMAIN>-002 — <one-line title>

- ...

## 6. Behavior

### Normal flow

### Error cases

### Edge cases

## 7. Interfaces & contracts

Inputs, outputs, error shapes, contracts with other components. Reference the
project's canonical contract and entity identifiers where they exist.

## 8. Data model

Entities, ownership, lifecycle, migration implications.

## 9. Security

Authority, secrets, isolation, injection, failure modes. State explicitly which
security property is enforced by code — never by prompt or convention.

## 10. Performance (non-functional)

Concrete numbers: latency targets (p50/p95), budgets, limits, resource ceilings.
"Fast" is not a requirement.

## 11. Observability

What is recorded per operation (ids, duration, status, error codes) and where it
can be inspected.

## 12. Acceptance criteria

Checklist, one line per requirement: the condition that proves it satisfied.

- [ ] `REQ-<DOMAIN>-001` — <condition>

## 13. Test plan

| Requirement | Test case | Kind | Status |
|---|---|---|---|
| `REQ-<DOMAIN>-001` | `TEST-<DOMAIN>-001` | unit / integration / e2e / acceptance | pending |

## 14. Rollout & migration

How this lands safely; compatibility; what must never be half-enabled.

## 15. Open questions

- `OQ-<MNEMONIC>-<n>` — <question + who resolves it>. Cross-cutting questions use `OQ-###` in the project index; module-scoped ids are stable and never renumbered.

## 16. Related

Decisions (ADR/`DEC-*`), specs, issues, flows.
