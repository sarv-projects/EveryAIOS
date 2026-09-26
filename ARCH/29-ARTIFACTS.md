# 29 — Artifacts & Receipts

> **Status:** Draft P2 (early). Must pass the `ARCH/00-INDEX.md` §5 checklist at freeze.
> **Role:** **Artifacts** are work products — versioned, provenance-carrying, scoped to work. **Receipts** are durable evidence of effects. **Library** is the reusable inventory; promotion is explicit (DEC-014).
> **Dependencies:** `10-KERNEL` · `25-FILES` (identity/locations) · `30-EVENTS` (stream, telemetry) · `34-EFFECT-VERIFICATION` (verification precedes receipts). **Consumers:** `15`, `20`, UI (`32`), external agents (artifact gateway).
> **Evidence:** product-owner brief (`Artifact` / `ProvenanceChain` / `LibraryItem` schemas; “Save to Library”; receipts first-class) · `ARCH/06-DATA-MODEL.md` DM-019/020/023 · `ARCH/07-CONTRACTS.md` CTR-018 · DEC-014 / DEC-022 / DEC-023 / DEC-032 · INV-07 / INV-18.

## 1. Purpose & responsibilities

**Owns:** the artifact model + versioning + provenance + preview refs · the **ReceiptService** (record · get · replay) · the Library (inventory + promotion) · the artifact gateway for external agents (exchange via refs) · retention/GC.
**Never owns:** verification execution (`34` produces the verification result a receipt references) · the security audit log (`12`; receipts are product evidence, audit is the security record) · file-content indexing (`25`).

## 2. Artifact model (DM-019)

| Field | Meaning |
|---|---|
| `id` · `name` · `type` · `mime_type` | identity + classification |
| `source` | `agent` · `workflow` · `user` · `worker` |
| owner refs | `session_id?` · `run_id?` · `workflow_id?` · `agent_id?` · `workspace_id?` |
| `version` | immutable per version; `parent_artifact?` for lineage (e.g. derived reports) |
| `location` | storage URI (managed store or workspace-file reference) |
| `provenance` | chain: `created_by_agent → run → worker → workflow` + inputs digest |
| `permissions` | who can read/write/share (enforced by `12`) |
| `created_at` | UTC ms |

**Types (non-exhaustive):** documents · spreadsheets · presentations · PDFs · images · diagrams · code patches/diffs · datasets · reports · logs/bundles · web captures.

**Versioning rules:** versions are immutable once written; a new edit creates a new version; workspace-file artifacts are tracked by file identity (`25`) plus a managed copy when they must survive edits; provenance is mandatory (INV-18).

## 3. Receipts (DM-020)

```
Receipt {
  id, effect_ref, ticket_ref,
  capability_id, provider_id,
  inputs_digest, outputs,
  verification,            // what ran before the receipt (per risk class, 34)
  status, work_id, timestamps
}
```

Rules:
- **Mandatory** for every externally visible effect (INV-07); emitted inside the governed path (`12` → `13` → `34` → receipt).
- **Immutable**; receipts are the product-facing evidence chain.
- **Replay = evidence replay**, not re-execution: `replay(receipt)` reconstructs inputs + shows what verification ran and what changed; re-doing the action is a **new work item** (never a silent re-fire).
- Emission also writes an event (`30`) and an audit entry (`12`) — three views of one fact, never duplicated state.

## 4. Library (DM-023)

| Field | Meaning |
|---|---|
| `kind` | `agent` · `skill` · `workflow` · `connector` · `plugin` · `template` · `prompt` · `saved_artifact` |
| `name` · `description` · `version` · `usage_count` | inventory metadata |
| `saved_from_artifact_id?` | explicit promotion origin |

Distinction: artifacts are scoped to work; the Library is global and durable. Promotion is explicit (“Save to Library” / “Save as template”) — never automatic (DEC-014). Versioning + deprecation of library items are explicit operations.

## 5. Artifact gateway (external agents)

Exchange via refs only: `artifact_id` · `mime_type` · `uri`. Supported verbs (permission-gated): read · write · attach · transform · publish. External agents never see raw storage paths; the gateway maps to the managed store (working URI scheme token `eaios://artifact/<id>`; final scheme renames with the brand, OQ-ART-2).

## 6. Retention & GC (DEC-032)

- **Managed store:** per-workspace, content-addressed immutable versions; workspace files referenced by identity (`25`).
- **Receipt-pinned versions are never GC’d** — chain integrity outranks storage savings.
- Unreferenced versions: pruned by age/count policy per workspace; deletions are audited; media (large binaries) follow the same rule set.
- Explicit delete is a user/authorized operation and is audited (INV-24); Library items may outlive their originating work.

## 7. Previews & rendering handoff

Previews are **projections** (thumbnail/render refs) produced by domains (`22`) — artifacts store refs, not pixels. The UI opens them through the universal document surface (`AGENTCOWORK-UI.md`); opening/rendering consumes zero model tokens (DEC-015).

## 8. Failure modes

| Failure | Behavior |
|---|---|
| Write fails mid-version | Version is atomic — no partial versions visible; retry or discard; audit. |
| Location moved/deleted | Identity check (`25`) marks artifact `unresolved`; receipts referencing it keep the digest; surfaced for re-link. |
| Receipt missing for a visible effect | Blocked before commit (INV-07); the effect path cannot complete without it. |
| GC vs receipt race | Receipt pin check runs in the GC transaction; pinned versions are skipped. |
| Gateway permission denied | Typed `AuthorizationDenied`; no path leakage. |

## 9. Interop

**Depends on:** `10` · `25` (identity/locations) · `30` (events) · `34` (verification result) · `12` (permissions).
**Exposes to:** `15`/`20` (attach results), `16` (artifact refs as context items), UI (`32`), external agents (gateway).
**DAG check:** artifacts never execute; receipts never authorize (they record).

## 10. Open questions (`OQ-ART-*`)

1. Storage layout details (directory scheme, blob format) — implementation-phase decision under DEC-032.
2. URI scheme finalization (brand rename; OQ-003 tie).
3. Library item versioning vs template semantics (how “template” differs from `saved_artifact`).
4. Cross-workspace artifact sharing rules (deferred; v1 = workspace-scoped + explicit export).
5. Receipt retention horizon (forever vs time-boxed with chain digest retention).

## 11. Evidence

Product-owner brief (`Artifact`, `ProvenanceChain`, `LibraryItem`; promotion lifecycle; receipts) · `ARCH/06-DATA-MODEL.md` DM-019/020/023 · `ARCH/07-CONTRACTS.md` CTR-018 · DEC-014/022/023/032 · INV-07/18/24 · `ARCH/17-MEMORY.md` (export/import pattern).
