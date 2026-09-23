# ARCH/RECOVERY — durable Work, uncertain effects, safe resume

> **Status:** Subsystem contract, derived from [`CORE.md`](CORE.md) §5.2 and §6. Owns what happens after a
> crash, a kill, a disconnect or a lease loss. Invariants it must not weaken: **I6, I7, I15**.

---

## 1. Five inputs, and no others

| Input | Role |
|---|---|
| **Work** | the durable objective — the thing being recovered |
| **Checkpoint** | the last known-good resumable position |
| **Idempotency class** | whether an interrupted effect may be retried at all |
| **Event log** | what definitely happened |
| **Receipt** | what was proven to have happened |

> Fancy memory is not what makes a system recoverable. **Work + checkpoint + idempotency + event log +
> receipt** is. A system with brilliant recall and no durable Work loses the user's task.

---

## 2. Durable ordering

```
DURABLE INTENT → DURABLE ATTEMPT → EFFECT → OBSERVE → VERIFY → RECEIPT
```

The authoritative intent and attempt are written **before** an irreversible external effect. This ordering is
contractual, not an implementation preference — it is the only thing that makes post-crash classification
possible.

---

## 3. The uncertain state

```
ticket approved, attempt lost → uncertain
                            → never failed
                            → never succeeded
```

This is the single most important rule in this document. A crash between approval and execution leaves the
world in an unknown state, and the system must say so.

**Never fabricate completion.** A receipt that reports success for an effect whose outcome was never observed
is the worst possible defect: it is simultaneously a data-integrity bug and a lie to the user.

---

## 4. Recovery flow

```mermaid
flowchart TD
    S["restart"] --> L["load Work"]
    L --> C["load last checkpoint"]
    C --> I["inspect effect state + idempotency key"]
    I --> D{"did the effect commit?"}
    D -->|"yes"| R["record observation + receipt"]
    D -->|"no"| N["resume next safe Step"]
    D -->|"unknown"| U["enter uncertain · reconcile"]
    U --> N
    R --> N
```

Rules: **never blindly replay** a non-idempotent effect; inspect before continuing; classify unknown state as
unknown; resume the next safe Step; require reconciliation before any retry of something that may have
already happened.

---

## 5. Idempotency classes

The capability contract already declares an idempotency class per capability (see spec §4.3). Recovery
branches on it:

| Class | Recovery behaviour |
|---|---|
| `SafeRetry` | retry freely |
| `Idempotent` | retry freely |
| `SameKeyOnly` | retry only with the same key |
| `Unsafe` | never blindly retry |
| `UncertainRequiresReconciliation` | inspect/reconcile first; may require the user |

Exactly-once is **not guaranteed** for external effects (email, calendar, payment, HTTP). Where a provider
offers an idempotency key, use it; otherwise enter `uncertain` and reconcile. Claiming exactly-once would be
an honesty violation.

---

## 6. TOCTOU and lease fencing

- A file can change between check and use; a symlink or reparse point can swap mid-flight. Bind every ticket
  to the canonical path **plus file identity** (hash/inode) plus workspace/session/run, and re-check the
  precondition immediately before the write.
- A stale worker must not commit after its lease expired or was reassigned. Checkpoint and lease-finish
  operations reject a non-current fencing token.

Both are recovery concerns, not only concurrency concerns: they are what stop a resumed Work from writing
over someone else's newer state.

---

## 7. Checkpoints

A checkpoint records enough to resume without re-deriving: phase, completed steps, pending approvals,
artifacts and references, the in-flight effect (if any) with its idempotency key. Checkpoints are written at
phase transitions and before any irreversible effect — not on a timer, and never only at the end.

A Work that is `Recoverable` is presented to the user as resumable **with what is known and what is
unknown**, not with a confident summary that hides the ambiguous effect.

---

## 8. Invariants this document must not weaken

| Invariant | How |
|---|---|
| I6 — Work is the durable unit | §1; recovery is defined on Work, not on a UI session or a provider session |
| I7 — effects carry provenance and a receipt | §2's ordering; §3's refusal to fabricate |
| I15 — no false claims | §3, §5's exactly-once concession, §7's honest resume presentation |
| I5 — append-only evidence | recovery reads the log; it never rewrites it |

---

## 9. Migration notes

The durable kernel persistence, per-effect receipts and per-surface verification already exist and are the
foundation here. What this document adds is the **contract**: the ordering, the uncertain classification,
and the rule that recovery branches on the declared idempotency class rather than on optimism. Regression
coverage (crash at each phase, kill mid-effect, lease loss, append-only resume) is `P69.F9`.

---

## Repo-comparison additions (briefs 01–19)

> Delta-analysis items re-homed into this contract (each entry: brief item ID · disposition tag ·
> SOURCE repo + evidence path under `REPO-COMPARE/clone2|clone3/` · one-sentence LOGIC · target §).
> Arrows to files not owned here are annotations only.

- **WRK-7** · [ADD] · SOURCE: `clone2/codex` (`failInterruptedTools`; name not found by brief 17's re-grep, which softened the claim to interrupted-guidance behavior) + `clone2/opencode` — LOGIC: an interrupted tool must settle deterministically on Work resume (recorded failure, never a silent retry), because silent retry would violate the idempotency classes this document branches on — target: §5 (+ checkpoint restore in §7).
- **WRK-13 + 14-11** · [ADD] / [IMPROVE] · SOURCE: `clone2/openclaw` (terminal/output planes) + `clone2/harnessrouter` (`gateway/control_store.py` — lease fencing + one-way latch) — LOGIC: one terminal plane with a surrogate-safe rolling replay ring, high-water marks and session-scoped attach, fenced by lease tokens with a one-way cancellation latch so stale writers skip and cancellation stays monotonic — target: §6 → `12-UI-SPEC.md` §4.4 (Shell view, annotation).
- **14-12** · [IMPROVE] · SOURCE: `clone2/cline` (`sdk/ARCHITECTURE.md` — proceed-while-running, detached-log reconciliation) — LOGIC: detached long-running command ownership carries a PID + process-generation start token and bounded detach logs, and reconciliation never guesses exit from host death — target: §3/§6 (+ [WORK.md](WORK.md) §2 chain half).
- **14-1** · [ADD] · SOURCE: `clone2/grok-build` (`xai-grok-workspace/src/session/checkpoint.rs` — `RewindCheckpoint` at turn boundaries: fs point + hunk delta + git HEAD/index) — LOGIC: per-prompt rewind checkpoints extend this document's phase-boundary durability to turn boundaries as an explicit protocol, not an in-process accident — target: §7.
- **14-2** · [ADD] · SOURCE: `clone2/cline` (`core/src/session/checkpoint-restore.ts`) — LOGIC: transactional restore wraps any `git clean`-style restore in a private stash ref with commit/rollback, so a half-applied restore is impossible and §3's "never fabricate completion" holds — target: §7.
- **19-9** · [ADD] · SOURCE: `clone3/agent-control/acpx` (`lock-owner.ts`) + `clone3/agent-control/ccmanager` (`sessionRestorer.ts`, `sessionManager.ts`) — LOGIC: process liveness = pid **+ birth identity** (pid-reuse safe) with a single bounded respawn/fallback and a rule to never replay one-off prompts on restore — target: §6 → `AGENT.md` §6 (annotation).
- **19-11** · [ADD] · SOURCE: `clone3/agent-control/vibe-kanban` (`worktree-manager.rs:303-391`, `env.rs:30-74` — retry-after-metadata-cleanup, batch cleanup, uncommitted-change guard) — LOGIC: worktree lifecycle must clean metadata before retry, sweep stale worktrees at boot, and refuse dispatch over uncommitted changes so workspace recovery cannot destroy user work — target: §7 (+ [WORK.md](WORK.md) §7).
- **10-5** · [ADD] · SOURCE: `clone2/ECC` (`docs/architecture/observability-readiness.md`) — LOGIC: a local, file-backed observability-readiness gate (status payload · session snapshot · risk ledger · handoff JSON must all exist) must pass before autonomy/automation levels may rise — honest observability precedes granted autonomy — target: this document + [WORK.md](WORK.md) (observability-readiness gate) → `scripts/` (CI gate, annotation).

---

## 10. Turn-Atomic Multi-File Snapshots with Pre-Commit Rollback (NextCoWork Pattern)

When an agent executes multi-file modifications across a workspace in a single turn:
1. **Pre-Mutation Snapshot:** The engine computes SHA-256 hashes and captures full backup copies of all target files into `~/.everyaios/snapshots/{work_id}/{step_id}/`.
2. **Atomic Change Sets (`file_change_sets`):** Modifications are staged. If any single file write fails, gets rejected by Guard-1 pathfloors, or experiences a syntax error during verification, the entire multi-file change set is transactionally rolled back to its pre-mutation state.
3. **Rollback Receipts:** Rollback events are appended to `everyaios-audit` with `outcome: RolledBackDueToFailure`, ensuring the filesystem is never left in a half-mutated, broken state.

## 11. Windows Named Pipe Lifecycle Mutex & PID Identity Verification (Open-Design / ACPX Pattern)

To prevent process corruption, multiple sidecar instances, or signaling recycled PIDs:
- **Windows Named Pipe Mutex:** The Rust core acquires an exclusive cross-process named pipe lock (`\\.\pipe\everyaios-core-supervisor-lock`). If another instance holds the pipe, startup halts with a clear collision error.
- **PID Birth-Identity Verification:** Before terminating or signaling any child process (MCP server, ACP agent, terminal PTY), the supervisor verifies process creation identity:
  - Windows: `GetProcessTimes` creation timestamp matching the recorded birth time.
  - Linux: `/proc/sys/kernel/random/boot_id` and `/proc/[pid]/stat` `starttime` ticks.
- If the PID has been recycled by the OS for a different application, the signal is dropped, preventing accidental termination of unrelated host applications.

## 12. Subagent Queue Deadlock Prevention (NextCoWork Pattern)

When parent agents spawn child subagents:
- **Parent-Child Cycle Detection:** The work scheduler constructs an in-memory directed acyclic graph (DAG) of active delegation leases. Any circular delegation request (A -> B -> A) is rejected immediately with `CyclicDelegationRefused`.
- **Orphaned Lease Timeout:** If a child run fails to report heartbeat within `SUBAGENT_HEARTBEAT_TIMEOUT = 120s`, the lease is reclaimed, the child marked `InterruptedByTimeout`, and the parent receives a structured timeout receipt.
