# 10 — Kernel

> **Status:** Draft P2 (early). Must pass the `ARCH/00-INDEX.md` §5 checklist at freeze.
> **Role:** the smallest layer: identity, errors, configuration, time, serialization, and the base conventions every module depends on. **No domain logic** (INV-14).
> **Evidence:** `ARCH/06-DATA-MODEL.md` (conventions), `ARCH/07-CONTRACTS.md` (contract rules), product-owner brief (“the kernel stays small”), INV-14.

## 1. Scope

**Owns:** id generation/validation rules · error taxonomy · configuration layering and validation · time primitives · serialization/storage conventions · the base envelope every contract uses (actor context, cancellation, result/error) · the minimal-kernel enforcement rule.
**Never owns:** policy (`12`) · scheduling (`11`) · storage engines (`17`/`29`/`30`) · domain types · protocol handling (`14`).

## 2. Identity

- **Entities:** uuidv7, minted by the owning service (single-writer, INV-06) — never by callers or UI.
- **Semantic ids:** capability ids are dotted names (`office.spreadsheet.edit`); provider ids are stable registry ids; model ids are `provider/model`.
- **Opaque rule:** ids never encode state, version, or meaning.
- **Human-facing short ids** (UI lists, receipts) are derived and non-authoritative; lookups always resolve through the owning service.
- **Reference scheme:** cross-entity references are by id (+type) only; content locations use a URI form owned by `29-ARTIFACTS` (scheme decided there).

## 3. Errors

Taxonomy (canonical for every boundary; extensions require a DEC):

| Code | Meaning | Retryable |
|---|---|---|
| `AuthorizationDenied` | Guard denied; ticket missing/expired/insufficient | no (re-plan or ask) |
| `NotFound` | target does not exist or is filtered by policy | no |
| `Conflict` | concurrent state change (lease, version, duplicate) | yes (bounded) |
| `Unavailable` | provider/agent/environment down or degraded | yes (backoff) |
| `Timeout` | call exceeded deadline | yes |
| `InvalidState` | operation not valid for current state (incl. stale epochs) | no |
| `GuidanceRequired` | capability can proceed only with user setup | no (surface guidance) |
| `RequiresUserAction` | explicitly needs a decision/input | no (approval path) |
| `Internal` | bug | no (report + log) |

Rules: typed and actionable; **no secrets or user content in messages**; stable codes for UI mapping; cause chains preserved for diagnostics; boundary errors never leak internals (INV-11). `Guidance`/`RequiresUserAction` are **results with next steps**, not failures (`13`).

## 4. Configuration

Layer order (later wins, each layer's source recorded):

```
defaults → user (global) → workspace/project → agent profile → session → run override
```

- Schemas are typed, versioned, and validated at load; unknown keys produce warnings + migration notes, never silent acceptance.
- **No secrets in config** — vault references only (INV-02).
- Feature flags: default-safe, locally overridable, no remote dependency for core behavior.
- Config changes that affect running work are versioned into that work's record (reproducibility).

## 5. Time

- **Storage:** integer epoch milliseconds, UTC (`06` conventions). Display formatting is a boundary concern only.
- **Durations/timeouts:** monotonic clock; never wall-clock deltas.
- **Schedules:** absolute times + explicit timezone policy; DST resolved at the boundary; “recurring” rules are owned by `20-WORKFLOW`/automations, evaluated by the scheduler (`11`).
- Clock skew: local-first system; no cross-machine ordering assumptions in v1 (multi-device sync is deferred, `32`).

## 6. Serialization & storage conventions

- **Canonical JSON** at boundaries (IPC, export, events); stable field ordering; numbers as integers where possible (no float precision surprises in ids/sizes).
- **Durable stores:** SQLite (WAL) per store owner; one writer per store (INV-06); no cross-module direct DB access — services only.
- **Migrations:** forward-only, idempotent, tested; run before the feature that needs them; failures block cleanly (no partial schema).
- **Content refs over copies:** prefer references; inline only when bounded and reconstructable.
- **UTF-8 everywhere**; sizes in bytes; token counts only via `18-MODEL-ROUTING`.

## 7. Contract plumbing (base envelope)

Every `CTR-*` (in `07`) carries:

- **Actor context:** who is calling (user · agent · workflow), with scope + permissions snapshot.
- **Cancellation:** cooperative cancellation token; deadlines propagate; cancellation leaves durable state consistent (INV-16).
- **Idempotency:** effect invocations carry keys minted here (`work_id` + `ticket`), so retries cannot double-apply where providers support dedupe.
- **Result envelope:** `{ ok, value } | { error: { code, message, retryable, cause? } }` — language-neutral schema, versioned.

## 8. Minimal-kernel rule (enforcement)

1. The kernel contains no domain logic — no Office, browser, file, or agent semantics.
2. No module may add a “just one” kernel special-case; capabilities land in their modules.
3. Kernel surface changes require a `DEC` entry and an INV-14 checklist pass (dependency-direction check).
4. Everything depends on the kernel; the kernel depends on nothing in `10`–`34`.

## 9. Failure modes

| Failure | Behavior |
|---|---|
| Config parse error | Fail closed for that layer; fall back to previous layer with a surfaced warning + audit event. |
| Migration failure | Block the dependent feature; never run against a half-migrated store; report exact migration + error. |
| Clock anomalies (jump backward) | Monotonic clock shields timers; schedules re-evaluate conservatively. |
| Id collision (uuidv7) | Treated as Internal error; single-writer minting makes this a bug, not a case. |

## 10. Open questions (`OQ-KRN-*`)

1. Result/error envelope: one schema for all boundaries vs transport-specific wrappers (adapters may map).
2. Migration-runner ownership: kernel utility vs storage owner (`19`/`30`).
3. Trace/span ids: separate namespace or derived from `work_id`/`step_id` (observability shape, `30`).
4. Canonical JSON strictness: number precision + key ordering rules for cross-language consumers.
5. Short-id format for UI (prefix + base32?) — cosmetic, low stakes.

## 11. Interop

**Depends on:** nothing.
**Exposes to:** everything in `10`–`34`.
**DAG check:** no cycles are possible while this rule holds (INV-14).
