# Data and State

> **Post-thaw authority: [`../../ARCH/CORE.md`](../../ARCH/CORE.md)** (27 invariants I1–I27) **+ the subsystem contracts** (`WORK` · `SESSION` · `AGENT` · `EXTERNAL-AGENTS` · `CONTEXT` · `CAPABILITIES` · `MEMORY` · `SECURITY` · `RECOVERY` · `ROUTING` · `UI` · `DESKTOP`). Refreshed post-thaw (TODO **P69.A35**). This artifact remains what it was built to be: accurate about the **code and tests** it indexes — that is its value. Where quoted code wording predates the thaw (legacy `Chief` identifiers, "token economy" module docs), quotations are verbatim and marked as such.

---


## State ownership map

| State | Owner | Location | Persistence | Evidence |
|---|---|---|---|---|
| UI Chat projection + ephemeral UI state | L4 | `ui/src/lib/store.ts` (Zustand) | in-memory; session continuity via replay (below) | 48 defs / 4,078 refs — largest state hub in graph. Post-thaw: user-facing word is **Chat**, Session the internal unit (`ARCH/SESSION.md`); the UI owns no durable truth — projection/cache/ephemeral only (`ARCH/UI.md`, TODO P69.D24) |
| Runtime readiness | L4 | `ui/src/lib/runtime.ts` | in-memory, subscribable | `getRuntimeState`/`subscribeRuntimeState` exports |
| Event ledger / audit | L2 | `crates/everyaios-audit` | append-only NDJSON on disk | module doc; `AuditEvent` `lib.rs:34`; `merkle.rs` for hash chaining |
| Authorization tickets | L2 | `crates/everyaios-guard/src/ticket.rs` | short-lived, single-use (`consume()`), args-hash-bound | `TicketStore` `:175` |
| Provider keys | L2 | `crates/everyaios-vault` | SQLCipher-encrypted key-ring | module doc (ARCH/03, J8) |
| Model catalog | L2 | `crates/everyaios-catalog` | synced snapshot (models.dev) | module doc (P14) |
| Storage intelligence | L2 | `crates/everyaios-storage` | on-disk index: dedup, FTS5 full-text, checkpoints | module doc; `checkpoint.rs`, `content.rs` |
| Memory / context | L2 (+ L1 reasoning only) | `crates/everyaios-memory` | four classes — Context (this turn only) / Episodic (derived from Work/Run/Event history, not a parallel timeline) / Knowledge / Procedural; former five-tier algorithms are strategies | module doc (P5) — *"memory fusion + token economy" wording verbatim, pre-thaw; now context engineering (`ARCH/CONTEXT.md`) + four classes (`ARCH/MEMORY.md`)* |
| Subagent worktrees | L2 | `crates/everyaios-core` | `.everyaios/worktrees/task-<id>`, 500 MB headroom cap, serialized git queue | `DESKTOP-APP-SPEC.md` B3. Post-thaw: subagents are child Work/Runs, never a separate runtime (CORE I8) |
| Machine code index | tooling | `.code-intelligence/` (gitignored) | SQLite, schema v2 | `stats.json`; rebuildable, never committed |
| Blueprint/checkpoints | L2 | `crates/everyaios-blueprint` | task DAG + `change_set.rs` | module doc (P6). Post-thaw target: declarative plans only — execution/scheduler/swarm/workflow runtimes leave for Work/Run/Step/Effect (TODO P69.D12) |

## Transformations worth knowing

- **Event ledger replay:** session state (plan, checkpoints, receipts,
  approvals) is durable in the ledger, so restarts resume from the last
  completed turn rather than model memory — `DESKTOP-APP-SPEC.md` UC-12; the
  audit crate's own tests cover append-and-resume sequencing. Post-thaw frame: the Event log is the
  historical truth and UI/memory/recovery/analytics are its projections, never parallel truths
  (CORE I3, `ARCH/WORK.md`).
- **Ticket lifecycle:** mint (`from_risk_and_op`) → validate (`is_valid`) →
  bind (`matches_args`) → consume exactly once (`consume`). A consumed ticket
  cannot authorize a second effect — the single-use rule is structural, not
  advisory (`ticket.rs:146–162`).
- **Provider streaming:** key material stays in the vault; only stream frames
  cross the IPC boundary (F3 in [flows.md](flows.md)).

## Cache / invalidation boundaries

- `.code-intelligence/` — disposable acceleration layer; invalidation is
  content-hash based (incremental `codegraph.py index`; Merkle root in
  `stats.json`). Regenerate freely; never commit.
- `packages/*/dist/` — build output, gitignored; source of truth is `src/`.
- Model catalog — refreshed by `everyaios-catalog` sync; routing treats curated
  seed rows as fallback, never as live data (`ui/DESIGN-SYSTEM.md` status-bar rule).

## State transition rules (stable)

1. UI never holds authorization state that outlives a Guard-2 decision; the
   ticket store lives in Rust (guard crate). Authorization provenance, not blanket ticketed-everything:
   agent/automation mutations consume tickets, human UI mutations carry trusted user-gesture provenance
   (`ARCH/CORE.md` §5.1).
2. Audit events are append-only — no update/delete path exists in the audit
   crate's public surface (`append` + sequence resume are the operations its
   tests exercise).
3. Worktree caps and the serialized `GitOperationQueue` bound concurrent
   subagent filesystem state (`DESKTOP-APP-SPEC.md` B3).
