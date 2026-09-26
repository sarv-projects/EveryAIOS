# 09 — Feature Matrix (REQ traceability)

> **Status:** Draft P7 (framework — seed rows demonstrate the format; filled as requirements are accepted). **This file owns links, never content:** requirements live in `ARCH/08-REQUIREMENTS.md`, designs in the module docs, tasks in `TODO.md`, evidence in `ARCH/42-EVIDENCE-MAP.md`.
> **Purpose:** answer from one place — which requirements does a file implement · which requirements have no implementation · which acceptance tests are missing · which specs does a change affect.

---

## 1. Matrix schema

One row per `REQ-*`. Status only from evidence.

| REQ | Module (doc) | Code paths | Design (DEC/DM/CTR) | Flow/Edge | Task (`TODO.md`) | Test | Status |
|---|---|---|---|---|---|---|---|
| `REQ-<DOMAIN>-<NNN>` | `<10..34 doc>` | `<path>` | `<DEC / DM / CTR IDs>` | `<FLOW / EDGE IDs>` | `<TASK-<DOMAIN>-<NNN>>` | `<TEST-<DOMAIN>-<NNN>>` or `pending` | `<status>` |

**Status ladder:** `unplanned → planned → in-progress → implemented → verified` (+ `blocked`).
`verified` requires an acceptance record (`ARCH/42-EVIDENCE-MAP.md`); for risky capability classes, unit tests alone never reach `verified`.

## 2. Rules

- One row per requirement; a requirement without a row is unplanned work — surface it, don't hide it.
- `Design` cells cite IDs (`DEC-*`, `DM-*`, `CTR-*`); `Flow/Edge` cite `FLOW-*`/`EDGE-*` where applicable.
- `Task` uses `TASK-<DOMAIN>-<NNN>` IDs defined in `TODO.md` (task text lives there, not here).
- `Test` names the automated test and/or the acceptance record path; `pending` is visible debt, not a failure.
- Never restate a requirement's statement here — link to `ARCH/08-REQUIREMENTS.md`.

## 3. Seed rows (P7 seeds; module passes append rows as domains are seeded — `KERNEL`/`WORK` added 2026-09-26)

| REQ | Module (doc) | Code paths | Design (DEC/DM/CTR) | Flow/Edge | Task (`TODO.md`) | Test | Status |
|---|---|---|---|---|---|---|---|
| `REQ-PROD-001` | `12-TRUST`, `13-CAPABILITY` | governed path: guard + capability planes | `DEC-002`, `INV-01/03` | — | pending | pending | unplanned |
| `REQ-PROD-002` | `12-TRUST`, `18-MODEL-ROUTING` | `crates/everyaios-vault`, credential consumers | `INV-02` | — | pending | pending | unplanned |
| `REQ-MEM-001` | `17-MEMORY` | memory store + extraction pipeline | `DEC-018/019` | — | pending | pending | unplanned |
| `REQ-KERNEL-001` | `10-KERNEL` | none yet — no kernel crate (code-state baseline) | `INV-14` | — | pending | pending | unplanned |
| `REQ-KERNEL-002` | `10-KERNEL` | pending | `INV-06` | — | pending | pending | unplanned |
| `REQ-KERNEL-003` | `10-KERNEL` | pending | `INV-11` | — | pending | pending | unplanned |
| `REQ-KERNEL-004` | `10-KERNEL` | pending | `INV-02` | — | pending | pending | unplanned |
| `REQ-KERNEL-005` | `10-KERNEL` | pending | — | — | pending | pending | unplanned |
| `REQ-KERNEL-006` | `10-KERNEL` | pending | `INV-06` | — | pending | pending | unplanned |
| `REQ-KERNEL-007` | `10-KERNEL` | pending | `CTR-003/004/026` | — | pending | pending | unplanned |
| `REQ-WORK-001` | `11-WORK` | pending | `DEC-003`, `INV-06`, `CTR-003/026` | — | pending | pending | unplanned |
| `REQ-WORK-002` | `11-WORK` | pending | `DEC-027`, `INV-23`, `CTR-004`, `DM-007` | — | pending | pending | unplanned |
| `REQ-WORK-003` | `11-WORK` | pending | `INV-16`, `DM-006` | — | pending | pending | unplanned |
| `REQ-WORK-004` | `11-WORK` | pending | `DEC-029`, `CTR-026` | — | pending | pending | unplanned |
| `REQ-WORK-005` | `11-WORK` | pending | `INV-22`, `DEC-029`, `DM-001` | — | pending | pending | unplanned |
| `REQ-WORK-006` | `11-WORK` | pending | `DM-001/002` | — | pending | pending | unplanned |
| `REQ-WORK-007` | `11-WORK` | pending | `INV-16`, `DM-006` | — | pending | pending | unplanned |
| `REQ-WORK-008` | `11-WORK` | pending | `DM-005/007` | — | pending | pending | unplanned |
| `REQ-TRUST-001` | `12-TRUST` | pending | `INV-05` | — | pending | pending | unplanned |
| `REQ-TRUST-002` | `12-TRUST` | pending | `DEC-021`, `DM-010` | — | pending | pending | unplanned |
| `REQ-TRUST-003` | `12-TRUST` | pending | `INV-04`, `DEC-028` | — | pending | pending | unplanned |
| `REQ-TRUST-004` | `12-TRUST` | pending | `INV-02`, `CTR-013` | — | pending | pending | unplanned |
| `REQ-TRUST-005` | `12-TRUST` | pending | `INV-03`, `DM-009` | — | pending | pending | unplanned |
| `REQ-TRUST-006` | `12-TRUST` | pending | `DEC-028` | — | pending | pending | unplanned |
| `REQ-TRUST-007` | `12-TRUST` | pending | `INV-24` | — | pending | pending | unplanned |
| `REQ-TRUST-008` | `12-TRUST` | pending | `DEC-009`, `INV-10/11` | — | pending | pending | unplanned |
| `REQ-TRUST-009` | `12-TRUST` | pending | `INV-05` | — | pending | pending | unplanned |
| `REQ-TRUST-010` | `12-TRUST` | pending | `DM-010` | — | pending | pending | unplanned |
| `REQ-CAP-001` | `13-CAPABILITY` | pending | `INV-13`, `DEC-005`, `DM-011` | — | pending | pending | unplanned |
| `REQ-CAP-002` | `13-CAPABILITY` | pending | `DEC-002`, `DM-012` | — | pending | pending | unplanned |
| `REQ-CAP-003` | `13-CAPABILITY` | pending | `DEC-004` | — | pending | pending | unplanned |
| `REQ-CAP-004` | `13-CAPABILITY` | pending | `DM-011`, `INV-19` | — | pending | pending | unplanned |
| `REQ-CAP-005` | `13-CAPABILITY` | pending | `INV-07` | — | pending | pending | unplanned |
| `REQ-CAP-006` | `13-CAPABILITY` | pending | `DEC-005/024`, `INV-13` | — | pending | pending | unplanned |
| `REQ-CAP-007` | `13-CAPABILITY` | pending | `DM-012` | — | pending | pending | unplanned |
| `REQ-CAP-008` | `13-CAPABILITY` | pending | `DM-011` | — | pending | pending | unplanned |
| `REQ-CAP-009` | `13-CAPABILITY` | pending | `—` | — | pending | pending | unplanned |
| `REQ-CAP-010` | `13-CAPABILITY` | pending | `INV-03/19` | — | pending | pending | unplanned |
| `REQ-PROV-001` | `14-PROVIDERS` | pending | `INV-15`, `DEC-004` | — | pending | pending | unplanned |
| `REQ-PROV-002` | `14-PROVIDERS` | pending | `CTR-010`, `INV-03` | — | pending | pending | unplanned |
| `REQ-PROV-003` | `14-PROVIDERS` | pending | `DEC-025` | — | pending | pending | unplanned |
| `REQ-PROV-004` | `14-PROVIDERS` | pending | `DEC-030` | — | pending | pending | unplanned |
| `REQ-PROV-005` | `14-PROVIDERS` | pending | `DEC-030` | — | pending | pending | unplanned |
| `REQ-PROV-006` | `14-PROVIDERS` | pending | `DEC-002`, `DM-013` | — | pending | pending | unplanned |
| `REQ-PROV-007` | `14-PROVIDERS` | pending | `DM-013`, `CTR-013` | — | pending | pending | unplanned |
| `REQ-PROV-008` | `14-PROVIDERS` | pending | `INV-02/05`, `CTR-013` | — | pending | pending | unplanned |
| `REQ-PROV-009` | `14-PROVIDERS` | pending | `DEC-035` | — | pending | pending | unplanned |
| `REQ-PROV-010` | `14-PROVIDERS` | pending | `—` | — | pending | pending | unplanned |

## 4. Maintenance

- Updated in the same change as the requirement or test it refers to; traceability edits ride with spec commits, not code commits.
- The matrix is checked in reviews of module passes: every accepted `REQ-*` must have a row; every row must have an owning module.
- Future tooling (a "spec compiler") can derive the missing-implementation and missing-test views mechanically from `ARCH/08-REQUIREMENTS.md` + this matrix; until then this file is maintained by hand in passes.

## 5. Related

- `ARCH/08-REQUIREMENTS.md` (requirement definitions) · `TODO.md` (tasks) · `ARCH/42-EVIDENCE-MAP.md` (acceptance evidence) · `ARCH/40-FLOWS.md` / `ARCH/41-EDGE-CASES.md` (flow and edge IDs)
- Process: `.agents/docs/spec-driven-development.md`
