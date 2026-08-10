# 53 — Formalization Gaps: Credential Broker · Ticket Contract · Durable Events · Shortest-Path Routing

> **Date:** 2026-08-09 · **Trigger:** an external architecture review (2026-08) audited the v3.9 spec. Four of its points were **correct gaps in formalization** — not new capabilities. Every one formalizes an existing row/pillar; no matrix change (138 rows, 33 algorithms). The review's over-reaches are kept out (§6).
> **Wired into:** SPEC v3.10 (P2/P3 bullets, J5/J21 rows) · ARCH/06 §6.9–6.11 · ARCH/09 (J5/J21 mirrors) · TODO (P1.2, P2.10, P6.10, P7.4).

## §1 The four gaps at a glance

| # | Gap | Existing anchor | What was missing | This doc |
|---|---|---|---|---|
| A | Credential broker | A2/A9 · P3 pillar · `everyaios-vault` | The request flow: who resolves the key, who issues the HTTP call, how buffers are scrubbed | §2 |
| B | Authorization ticket contract | J21 · `everyaios-guard` · "sidecar proposes, Rust disposes" | Field-level schema + lifecycle | §3 |
| C | Durable event model | J5/J19 · `everyaios-audit` · J13 checkpoints | Unified event log + explicit idempotency classes | §4 |
| D | Shortest-path routing | P2 (surgical hierarchy) · B3/B4 · A7 | The hierarchy selects the minimal tier chain per task | §5 |

---

## §2 Credential broker (formalizes A2/A9/P3)

### 2.1 The invariant
> **"Keys live only in Rust" becomes enforceable:** the TS coordinator never holds raw credentials — not during request construction, not during transport, not in memory after the call. (Previously the spec asserted the vault was Rust-owned but never specified the request flow, so the promise was unenforceable as-written.)

### 2.2 The flow

```
Coordinator (TS)                     Rust provider broker (everyaios-vault + broker)
    │  POST provider/request {provider, model, body, opaque_key_handle}
    ├──────────────────────────────────────────►
    │                              1. Validate session budget + permission (J21 ticket)
    │                              2. Resolve opaque_key_handle → raw key (SQLCipher)
    │                              3. Inject auth headers
    │                              4. Perform the provider HTTP call (Rust owns the socket)
    │                              5. Scrub temp secret buffers (zeroize)
    │  ◄────────────────────────────────────────  normalized event stream
    │     (no key material, ever)
```

### 2.3 Contract
- **`opaque_key_handle`** — random 128-bit id minted by `everyaios-vault` at key-ingest; no recoverable relation to the key; scoped to `(provider, key_id)`; revoked on rotation/removal.
- **Home:** the broker lives in `everyaios-vault` as a new `broker` module (no new crate); the vault keeps owning key material, the broker owns the request path.
- Coordinator provider adapters (`core-providers`) are refactored from "clients that know keys" to **request composers**: they build `{provider, model, body}`, ask the broker for a handle, and consume the normalized stream. (TODO P1.2's existing "vault fetch layer" tasks are reconciled against this — the HTTP call executes in Rust, not the sidecar.)
- Budget/permission checks happen **in the broker** (single choke point) — a misbehaving sidecar cannot bypass rate limits by holding its own key.
- OAuth tokens: same path (SQLCipher token rows; broker injects the `Authorization` header).
- Buffers: `zeroize`-on-drop for any temp secret copy; no key material in crash dumps (already ARCH/06 §6.8).

### 2.4 Failure modes
- Broker down → coordinator surfaces "vault unavailable"; **fail-closed**, no raw-key fallback.
- Rotation mid-request → broker re-resolves the handle under its own mutex; stale handle → 401-equivalent retry.

### 2.5 Wired
SPEC P3 bullet · ARCH/06 §6.9 · TODO P1.2 · ARCH/02 §2.2 (`everyaios-vault` row).

---

## §3 Authorization ticket contract (formalizes J21)

### 3.1 The invariant
> **"Sidecar proposes, Rust disposes" is enforced by construction:** no mutating call reaches the OS without a ticket validated by `everyaios-guard`. (Tickets were already a kernel primitive — every mutating call required one — but the field contract was never written down.)

### 3.2 Ticket fields

| Field | Type | Meaning |
|---|---|---|
| `ticket_id` | u64/uuid | unique, single-use |
| `agent_id` | string | blueprint id (delegation scope) |
| `session_id` | string | coordinator session |
| `tool_id` | string | ACP/MCP tool name |
| `operation` | enum | read \| write \| delete \| execute \| network \| navigate \| … |
| `args_hash` | [u8;32] | normalized-args SHA-256 (normalize: sort keys, canonical JSON) |
| `authorized_paths/domains` | list | granted roots / egress hosts for this ticket |
| `expiry` | ts | short TTL (e.g. 30s; one-shot ops immediate) |
| `single_use` | bool | burn on first use (default for destructive) |
| `approval_source` | enum | auto_ladder \| guard1_pass \| guard2_human \| policy |
| `risk_class` | enum | routine \| elevated \| high \| destructive |
| `audit_seq` | u64 | links to the `everyaios-audit` row |

### 3.3 Lifecycle
`request` (sidecar proposes args) → `policy check` (permissions.toml + Trust Ladder) → `issue` (guard mints ticket) → `present` (with the call) → `consume` (guard validates args_hash + expiry + single_use, executes in Rust, burns) → `audit` (ticket row appended to the J5/J19 chain).

### 3.4 Enforced at
Every privileged Rust entry point: FS mutation, shell, network egress, browser control, script-eval, OAuth token use (ARCH/02 §2.2 "Division of trust").

### 3.5 Wired
ARCH/06 §6.10 · SPEC J21 row · ARCH/09 J21 mirror · TODO P7.4.

---

## §4 Durable event model + idempotency (formalizes J5/J19/J13)

### 4.1 The invariant
> **"Nothing unreconstructable" needs more than periodic snapshots:** an append-only event log from which any session replays, plus explicit idempotency semantics so a dead coordinator cannot double-execute external mutations. (Snapshots + J13 checkpoints remain the accelerant; the event log is the source of truth.)

### 4.2 Event types (append-only, single writer)
`UserMessageAdded` · `PlanCreated` · `TaskStarted` · `ToolProposed` · `PermissionGranted` · `ToolStarted` · `ToolCompleted` · `ArtifactWritten` · `ModelTurnCompleted` · `CheckpointCommitted`

Each carries `seq, ts, session, agent, tool, args_hash, result_meta` and feeds the existing J5 NDJSON store + J19 Merkle chain + J13 checkpoint snapshots.

### 4.3 Idempotency classes (declared per operation in the tool manifest)

| Class | Meaning | Retry policy |
|---|---|---|
| `safe_retry` | read-only / deterministic | retry freely |
| `unsafe_retry` | mutates (write, send, execute) | never auto-retry |
| `same_key` | retry only with identical idempotency-key | coordinator re-sends same key; broker dedupes |
| `confirm_after_uncertain` | outcome unknown (network drop mid-mutation) | pause → user confirmation before any retry |

### 4.4 Recovery
On restart: replay events → rebuild state. Any `ToolStarted` without `ToolCompleted` → classify by idempotency class (safe → re-run; same_key → re-send with key; else → confirmation card).

### 4.5 Wired
ARCH/06 §6.11 · SPEC J5 row · ARCH/09 J5 mirror · TODO P2.10.

---

## §5 Shortest-path routing (formalizes P2/B3/B4/A7)

### 5.1 The invariant
> **The surgical hierarchy is routing policy, not a mandatory pipeline.** Every task takes the minimal tier chain that completes it reliably — latency, cost and failure surface shrink with chain length. (Previously the spec implied brain→core→surgeon for everything; the review correctly noted this wastes tokens on simple ops.)

### 5.2 Routing table

| Task class | Chain |
|---|---|
| Simple edit | brain → Aider-class editor (direct) |
| Broad refactor | brain → orchestrator → editor workers (full) |
| Code question | brain → RepoMap/retrieval only |
| Browser research | brain → research planner → browser worker |
| Spreadsheet cleanup | brain → workbook planner → deterministic DSL |
| Known skill | brain → skill (direct) |

### 5.3 Selection logic
Task classifier (coordinator) emits `(tier_chain, depth)` from blueprint + model hints; A7 tiering maps models per tier; B6 iteration budgets bound each chain.

### 5.4 Wired
SPEC P2 bullet · TODO P6.10 · ARCH/09 unchanged (B3/B4/A7 rows already exist).

---

## §6 What the review got wrong (kept out)

1. **"Plugin architecture and core architecture conflict"** — already resolved: I6 has the dogfood rule + host-owned facades (`ctx.llm`/`ctx.files`/`ctx.approval`). The only real tension is bootstrap sequencing (P4–P6 first-party features built into crates, migrated to bundles when the ABI lands in P7) — now documented in the I6 row itself.
2. **"Authorization tickets need to become a kernel primitive"** — they already are (every mutating call requires an `everyaios-guard` ticket); only the field contract was missing (§3).
3. **Stale gap-table claims** (H26 clipboard "no tool", storage "completely missing") — both landed in v3.8; the review was reading two versions behind.
4. **"82.7% benchmark proven"** (Aider Architect Mode) — aider-reported only (doc 51); never cited as fact here or in the matrix.
