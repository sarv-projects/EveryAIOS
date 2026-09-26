# 19 — Runtime & Environments

> **Status:** Draft P2 (early). Must pass the `ARCH/00-INDEX.md` §5 checklist at freeze.
> **Role:** where things actually run — processes, sandboxes, environments, lifecycle, health. This module **executes** the platform-confinement layer that `12-TRUST` decides (DEC-028), and hosts provider adapters (`14`) and domain runtimes (`22`–`28`).
> **Dependencies:** `10-KERNEL` · `12-TRUST` (policy + tickets) · `11-WORK` (lifecycle/lanes) · `30-EVENTS` (health/streams). **Consumers:** `14` (adapters, MCP servers), `21` (collectors + helper), `22`–`28` (domains), `25`/`26` (worktrees/leases handoff).
> **Evidence:** product-owner brief (execution environments local/sandbox/remote/cloud) · `ARCHIVE/v1-research/agent-harness-verification.md` §A4 (sandbox backends: `SandboxType { MacosSeatbelt, LinuxSeccomp, WindowsRestrictedToken, WindowsMxc }`, protected subpaths; `codex-rs/protocol/src/sandbox.rs:10-16`) · DEC-028/029 · `ARCH/07-CONTRACTS.md` CTR-015 · `ARCH/21-WORLD-MODEL.md` §5 (elevated helper constraints).

## 1. Purpose & responsibilities

**Owns:** the process manager (spawn · monitor · stop · trees · reaping) · environments (local · sandbox · worktree · remote-later · cloud-later, with resource limits) · sandbox execution backends · agent vs user PTYs · MCP server lifecycle *hosting* (with `14`) · the opt-in elevated helper host · process/environment health.
**Never owns:** policy decisions (`12`) · capability semantics (`13`) · git/worktree semantics (`26`) · write leases (`25`).

Rules:
1. **Confinement is executed here, decided in `12`** — the runtime never evaluates its own policy (INV-04).
2. **Fail closed**: if a required sandbox backend is unavailable, the action is denied with a reason — never silently unconfined (unless policy explicitly allows and audits it).
3. **Every process belongs to an environment**; every environment has a lifetime tied to work/session scope.
4. **Detached processes are registered, never orphans** (`11` detached lane).

## 2. Environment model

| Field | Meaning |
|---|---|
| `id` | environment identity — appears in capability handles (`13` §4) |
| `kind` | `local` · `sandbox` · `worktree` · `remote`* · `cloud`* (*later) |
| `platform` | windows · linux · macos |
| `confinement` | profile ref (policy id + backend actually in use) |
| `limits` | cpu · memory · disk · network (declared; enforced) |
| `workspace` | roots in scope (pathfloor) + workspace scope (`shared` / `isolated-worktree` / `sandbox`, DM-015) |
| `network` | egress policy ref (`12` §7) |
| `lifetime` | session · work · detached |

## 3. Process management

- **Spawn inputs:** command + args (pre-validated by the exec-policy layer, `12` DEC-028), cwd, environment whitelist, typed stdio streams, limits, confinement profile.
- **Process trees:** parent→child tracked; cancellation propagates (`11` §6); orphans reaped on parent death; detached members registered for rehydration.
- **PTYs:** two classes — *agent terminals* (programmatic, policy-scoped) and *user terminals* (interactive, user-owned); same manager, different policies.
- **Output handling:** full output persists to an artifact/event (bounded); the model-facing view is the compact representation + reference (`16` §4 pruning). Never lose evidence, never stream unbounded output into context.

## 4. Sandbox backends (executes DEC-028 layer 1)

| Platform | Backend | Notes |
|---|---|---|
| Windows | restricted token · MXC | AppContainer-class confinement; availability probed |
| Linux | landlock · bwrap · seccomp | stacked in that preference order |
| macOS | seatbelt | profile-based |

- **Protected subpaths** (e.g. VCS hooks) remain read-only inside writable roots.
- **Fallback ladder:** requested backend unavailable → next backend → *deny with reason*; a policy flag may explicitly allow unconfined execution, which is audited and surfaced (never default).
- Escape/containment tests are part of `42-EVIDENCE-MAP` acceptance.

## 5. MCP server lifecycle (with `14`)

- Adapters request servers; the runtime spawns (stdio) or connects (HTTP); **epoch is recorded** at start and bumped on restart (invalidates handles, `13` §4).
- Health monitoring + restart policy per server; shutdown on scope end — global/workspace-scoped servers persist, session-scoped servers end with the session (four-state scoping, DEC-024).
- Config from the provider registry; secrets via vault refs only (INV-02).

## 6. Elevated helper (opt-in)

For privileged collectors (MFT/USN file index, `21` W1) the runtime hosts a small **opt-in** helper: explicit install + consent, **no service/autostart by default**, IPC over a guarded channel (`12`), every request audited. Denied helper ⇒ capabilities degrade to non-admin modes with a surfaced note — never silent elevation.

## 7. Detached work & app lifecycle

- **App start:** process registry rehydrates from work/event state; detached processes are adopted/monitored; strays detected and reconciled (killed or re-attached per policy).
- **App close:** policy decides per work kind — keep (detached workflow run), suspend, or stop; the decision is recorded.
- **Crash recovery:** environments are rebuilt from work state + checkpoints (`11` §4); no environment state is authoritative.

## 8. Health & observability

- Health per environment/process/server: `ok` · `degraded` · `down`, with reason; events on `30`.
- Resource telemetry (cpu/memory/disk) is bounded metadata only — never payload capture.
- The UI surfaces environment health (Settings/Diagnostics), and work items carry their environment ids for debugging.

## 9. Failure modes

| Failure | Behavior |
|---|---|
| Spawn failure | Typed error distinguishing policy denial vs OS failure; no retry loops on policy denial. |
| Sandbox unavailable | Fail closed or explicit audited unconfined mode (policy flag). |
| Process hang | Watchdogs + `11` timeouts → interrupt/cancel with reason. |
| Orphan/leak | Reaper + start-time reconciliation; audited. |
| Helper denied/absent | Degrade to non-admin capability modes with a surfaced note. |
| MCP server crash | Epoch bump → handles invalidated → `14` health/failover path. |

## 10. Interop

**Depends on:** `10` · `11` (lifecycle) · `12` (policy/tickets/egress) · `30` (events) · OS platform APIs.
**Exposes to:** `14` (adapter hosts, MCP servers) · `21` (collectors/helper) · `22`–`28` (domain execution) · `25`/`26` (workspace scopes; worktree provisioning handoff) · UI (diagnostics).
**DAG check:** the runtime executes; it never decides *whether* to execute (that is Guard) and never interprets capability semantics.

## 11. Open questions (`OQ-RT-*`)

1. Detached semantics across app close vs platform constraints (shared with OQ-WORK-1; helper/service options).
2. Helper packaging/update channel + consent UX (with `12`/`21`).
3. Remote/cloud environment timing (post-v1 path; keep the abstraction only).
4. Resource-limit defaults per environment kind.
5. PTY surface details (agent vs user terminals in UI; with `32`).
6. Backend preference tuning per platform (e.g. bwrap vs landlock availability).

## 12. Evidence

Product-owner brief (environments; sandbox; isolation) · `agent-harness-verification.md` §A4 (backend enum + protected subpaths + three-layer separation; anchors `codex-rs/protocol/src/sandbox.rs:10-16`, `protocol.rs:1055-1125`) · DEC-028/029 · `ARCH/07-CONTRACTS.md` CTR-015 · `ARCH/11-WORK.md` §3/§6 · `ARCH/12-TRUST.md` §2/§7 · `ARCH/21-WORLD-MODEL.md` §5.
