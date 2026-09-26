# 12 — Trust & Control

> **Status:** Draft P2 (early — DEC-028 and the verified Codex guard model integrated). Must pass the `ARCH/00-INDEX.md` §5 checklist at freeze.
> **P7 pass (2026-09-26):** line-checked; requirements seeded (`REQ-TRUST-*`, Requirements section).
> **Role:** the one place where permission, authorization, custody and audit live. **Guard decides; agents request; prompts never enforce** (P-13, DEC-002).
> **Dependencies:** `10-KERNEL` · `11-WORK` · `19-RUNTIME-ENVIRONMENTS` (sandbox hosts) · `30-EVENTS` (audit feed). **Consumers:** `13`/`14` (capability execution), `15`, `21` (consent), `22`–`28` (domains), `32` (projections).
> **Evidence:** product-owner brief (trust section: projections, defaults, isolation) · `ARCHIVE/v1-research/agent-harness-verification.md` §A4 (approval policy enum · sandbox policy · exec-policy engine; anchors `codex-rs/protocol/src/protocol.rs:969-1125`, `sandbox.rs:10-16`, `execpolicy/src/`) · DEC-028 · INV-01…12, 24 · `ARCH/06-DATA-MODEL.md` (DM-009/010) · `ARCH/07-CONTRACTS.md` (CTR-011/012/013).

## 1. Purpose & rules

**Owns:** policy evaluation · Guard (three layers) · tickets · approvals · vault custody · egress control · audit hooks · consent policy · enforcement of the external-agent projection boundary.
**Never owns:** domain logic · collector implementations (`21` records consent; Trust evaluates it) · UI copy.

1. **One decider** — exactly one component returns ALLOW / ASK / DENY (INV-04).
2. **One egress path** — all outbound network passes Guard; no side doors (INV-05).
3. **Custody** — provider credentials exist only in the vault; contracts use `use`-style APIs, never reads (INV-02, CTR-013).
4. **Enforcement lives here, never in prompts** — no agent instruction is a security boundary (P-13).
5. **Every decision is audited** — including denials and forget/delete (INV-24).

## 2. The three layers (DEC-028) — never collapsed into one enum

| Layer | Question | Shape |
|---|---|---|
| **Platform confinement** | What may this process do on the OS? | Sandbox policy: `read-only` · `workspace-write { writable_roots, network_access }` · `full`; per-platform backends (Windows restricted token / MXC · Linux landlock/bwrap/seccomp · macOS seatbelt); **protected subpaths** (e.g. VCS hooks) stay read-only inside writable roots. |
| **Approval policy** | When is a human asked? | Policy enum (`unless-trusted` · `on-request` · `granular` · `never`) + per-category granular config (sandbox escapes · exec rules · permission requests · skill installs · MCP elicitations …). |
| **Declarative exec rules** | Which commands are pre-authorized? | Command/prefix/network pattern rules; rule engine defaults to **ask**; every decision recorded. |

Guard composes the three into a decision, then issues/validates tickets. Sandboxing is executed by `19-RUNTIME-ENVIRONMENTS`; the policy lives here.

## 3. Policy model

- **Risk tiers** (owner brief defaults): *everyday* → allow (workspace read/write/edit, normal commands/tests/deps, local git, browser navigation, Office editing, MCP reads) · *dangerous* → ask (permanent deletion, destructive shell, credential access, OS/security changes, disk ops, mass external writes, destructive git) · *catastrophic* → always gated, even in Full Access (irreducible gate).
- **Capability risk classes** (`safe` / `sensitive` / `dangerous`, DM-011) map to default decisions and to verification depth (`34`, INV-19).
- **Scopes:** policy evaluates innermost-applicable with outer ceilings (global → workspace → agent → session → run).
- **Full Access** is user-activated; it widens the allow tier but never removes the catastrophic gate.
- **Policy snapshots** are recorded on tickets/handles (`permission_snapshot`) so decisions are reproducible.

## 4. Tickets (DM-009)

- Issued after ALLOW (or a granted approval); bound to `capability_id`, `provider_id`, `environment_id`, scope (paths/targets/patterns), `uses`, `expires_at`, `provider_epoch`, `approval_ref?`.
- Validated at execution time; **stale epoch / expired / revoked ⇒ `InvalidState`**; revoke on provider restart or cancellation.
- Single-use vs bounded-multi-use is declared at issue; effects never execute without one (INV-03).

## 5. Approvals (DM-010, DEC-021)

- One primitive for both agents (questions) and workflows (approval nodes): `request(prompt, options: approve | reject | edit | provide-data, context, timeout)`.
- Routed through UI/channels (`32`); durable across waits (`11` §4); decisions recorded once and referenced by tickets/receipts.
- Expiry policy per action class (default: expire ⇒ deny, surfaced).

## 6. Vault & custody (CTR-013)

- Credentials never appear in prompts, context, events, logs, receipts, or code (INV-02).
- `use`-style API only (perform a signed call / inject into an adapter at call time); enumeration by agent code is impossible.
- Scope per provider/profile; rotation supported; local-only by default; vault access itself is audited.

## 7. Egress

- All outbound network through the Guard egress (INV-05): allowlists by domain/method per policy; per-agent and per-session scopes; request metadata audited (never payloads by default).
- MCP/HTTP/CLI child processes inherit governed network through their environment (`19`).
- Static checks + P6 sweep verify no direct network clients exist above the adapter layer.

## 8. External-agent boundary (DEC-009 — projection enforcement)

The Agent Gateway (`32`) *builds* projections; Trust *enforces* them:

| Projection | Enforcement |
|---|---|
| Capability set | Effective = Installed × Available × Allowed × Relevant; anything else resolves to `NotFound` for that agent. |
| Context | Sensitivity-filtered slices (`16`); cross-project/confidential leakage = 0 (INV-10). |
| Memory | Filtered **recall-only** projection (bound project + own session/task + user preferences; no org, no other projects, `confidential` only with a recorded loadout); scopes and ceilings are **actor-derived**, never caller-supplied; no write path is exposed (`17` §4/§9, DEC-042/043). |
| Workspace | `allowed_paths` / `read_only_paths`; **interception, not un-discovery** — out-of-scope reads are denied and logged. |
| Tools / MCP subset | Only the granted subset is mounted; the rest is invisible. |
| Artifacts | Via the artifact gateway with permissions; never raw storage. |
| Events | Filtered stream; never the internal bus. |

Never exposed: service topology, stores/schema, queues, scheduler internals, vault, policy-engine internals, model-router internals, other agents' state (INV-11).

## 9. Audit

- Append-only, tamper-evident chain; every mutating operation logged (INV-24): actor · action · target · decision · ticket · result · timestamps.
- Denials and forget/delete/wipe are first-class audit entries.
- Memory mutations are audited under the local-mutation class (DEC-042); the record carries **no item body**, and suppression digests are keyed (DEC-039).
- Audit reads are themselves access-controlled; exports carry the chain proof.

## 10. Consent (collector-facing)

Policy evaluated by Trust; records owned by `21`. Required record fields (per collector instance): collector id+version · scope · capability required (standard/elevated/OS-permission) · what was actually granted and how · event source + epoch/cursor · data classes · start/stop + retention · revocation path · audit receipt. Deny-by-default; no persistent grants in v1; visible indicator while capture is active.

## 11. Failure modes

| Failure | Behavior |
|---|---|
| Policy engine error | **Fail closed** — DENY with reason; audited. |
| Vault unavailable | Credentialed calls fail typed (`Unavailable`); no plaintext fallback ever. |
| Egress engine down | Outbound fails closed; offline capabilities unaffected. |
| Ticket replay / stale epoch | `InvalidState`; audited; provider epoch bump re-issues. |
| Approval timeout | Per-class expiry policy (default deny). |
| Policy conflict (scopes disagree) | Innermost decision applies unless an outer **ceiling** forbids; conflicts logged. |

## 12. Interop

**Depends on:** `10` kernel · `19` runtime (sandbox hosts) · `30` events (audit) · vault storage.
**Exposes to:** `13`/`14` (decisions + tickets) · `15` (requests) · `21` (consent evaluation) · `32` (projection enforcement) · UI (approval prompts).
**DAG check:** Trust never executes effects; it authorizes them. No module may evaluate its own policy (INV-04).

## 13. Open questions (`OQ-TRUST-*`)

1. Granular approval category list for v1.
2. Approval routing defaults per channel (desktop first; mobile/API later).
3. Pathfloor/netfloor mapping to the current crate reality (code phase — `everyaios-guard` exists; wiring fidelity to verify).
4. Policy version storage + migration semantics.
5. Consent-record ownership split confirmation (`21` records, Trust evaluates — assumed here).

## 14. Evidence

Owner brief (projections, permission defaults, isolation: host / agent workspace / vault) · `agent-harness-verification.md` §A4 (three verified layers + anchors) · DEC-028 · INV-01…12/24 · `ARCH/06-DATA-MODEL.md` DM-009/010 · `ARCH/07-CONTRACTS.md` CTR-011/012/013 · `ARCH/21-WORLD-MODEL.md` §5 (consent fields).

## 15. Requirements (`REQ-TRUST-*`)

Testable behaviors owned by this module live in `ARCH/08-REQUIREMENTS.md`; the traceability chain is in `ARCH/09-FEATURE-MATRIX.md`. This table is a pointer, not a second copy.

| REQ | Behavior (one line) |
|---|---|
| `REQ-TRUST-001` | Egress fail-closed — one governed outbound path; allowlists; no direct clients above the adapter layer (INV-05). |
| `REQ-TRUST-002` | One approval primitive — request(prompt, options, context, timeout); durable across waits; recorded once (DEC-021). |
| `REQ-TRUST-003` | One authorization decider — every mutating effect is decided in Trust; no second permission path (INV-04). |
| `REQ-TRUST-004` | Vault custody, use-only — credentials never appear in prompts/context/events/logs/receipts; use-style API; scoped and rotated (INV-02). |
| `REQ-TRUST-005` | Tickets bind and validate — effect tickets carry scope/uses/expiry/provider epoch and are validated at execution (INV-03, DM-009). |
| `REQ-TRUST-006` | Three policy layers stay distinct — confinement, approval policy, and declarative exec rules never collapse (DEC-028). |
| `REQ-TRUST-007` | Audit completeness — every decision and denial is append-only, tamper-evident, and access-controlled on read (INV-24). |
| `REQ-TRUST-008` | Projection-only external agents — never expose topology, stores, queues, vault or policy internals (DEC-009, INV-10/11). |
| `REQ-TRUST-009` | Trust infrastructure fails closed — policy/vault/egress failure blocks the effect; no plaintext or open fallback. |
| `REQ-TRUST-010` | Catastrophic gate is irreducible — always gated, even under Full Access (risk tiers, §3). |
