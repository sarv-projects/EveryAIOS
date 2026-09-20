# Flows

> **Post-thaw authority: [`../../ARCH/CORE.md`](../../ARCH/CORE.md)** (27 invariants I1–I27) **+ the subsystem contracts** (`WORK` · `SESSION` · `AGENT` · `EXTERNAL-AGENTS` · `CONTEXT` · `CAPABILITIES` · `MEMORY` · `SECURITY` · `RECOVERY` · `ROUTING` · `UI` · `DESKTOP`). Refreshed post-thaw (TODO **P69.A35**). This artifact remains what it was built to be: accurate about the **code and tests** it indexes — that is its value. Where quoted code wording predates the thaw (legacy `Chief` identifiers, "token economy" module docs), quotations are verbatim and marked as such.

---


Execution paths at file granularity. Evidence type is stated per step:
**[G]** = file-level graph edge (codegraph, confidence B), **[S]** = read from
source, **[D]** = from repo docs (`AGENTS.md`, `ARCH/`, `DESKTOP-APP-SPEC.md`).
Step sequences reconstructed from seams + docs are marked as such; they are not
traced per-symbol (no LSP/SCIP tier-A resolution is configured yet).

## F1 — Chat turn (user message → model stream → UI)

Post-thaw vocabulary: the user-facing container is a **Chat**; the technical unit behind it is a
**Session** (`ARCH/SESSION.md`). The loop is owned by the selected agent's `AgentBinding`; the
coordinator owns turn coordination, not reasoning (CORE §7.1).

1. Composer submit in `ui/src/components/chat/*` updates Chat state in
   `ui/src/lib/store.ts` **[S]** (a projection — the UI owns no durable truth, `ARCH/UI.md`).
2. UI invokes a Tauri command via `nativeCall()` (`ui/src/lib/runtime.ts`,
   wrapped by `ui/src/lib/tauri.ts:30` which funnels every call through
   `tauriInvoke`) **[S]**.
3. The matching `#[tauri::command]` in `src-tauri/src/*_cmds.rs` delegates into
   `crates/everyaios-core` (`chat.rs`, `routing.rs`) **[G: src-tauri → core]**.
4. `crates/everyaios-core/src/sidecar_link.rs` frames the request to the Bun
   sidecar (`packages/coordinator`) over stdio JSON-RPC 2.0
   (`[u32 LE len][JSON]`) **[D + G: sidecar_link.rs ↔ coordinator/index.ts seam]**.
5. `packages/coordinator/src/chat.ts` runs turn coordination; provider access is
   requested through the broker (F3), never with local keys **[S: chat.test.ts,
   index.ts reference `provider/stream`]**. Post-thaw frame: what the model sees is a derived
   `ContextSurface` reduced in the normative 7-step optimization order (cheap deterministic reducers
   with re-measure before any model summarization), with capacity taken from the resolved route
   (`ARCH/CONTEXT.md`, `ARCH/ROUTING.md`; I19, I21).
6. Streamed deltas return along the same seam into `chat.rs`, are persisted to
   the audit/event path, and surface in the UI timeline **[D]** — the timeline is a projection of the
   Event log (CORE I3).

## F2 — Effect authorization (the guard path)

Post-thaw rule: **authorization provenance**, not "everything is ticketed" (`ARCH/CORE.md` §5.1).
Agent/automation mutations consume an `AuthorizationTicket`; human UI mutations carry trusted
user-gesture provenance stamped by Rust call sites only. Every audit row records which one.

1. A proposed mutating effect (tool call, automation step) reaches
   `crates/everyaios-guard` **[D: AGENTS §10, §15]**.
   **Known defect V1:** the ACP permission path grants approval without consulting Guard
   (`crates/everyaios-acp/src/chief.rs:417`, `Approval::allow()`) — open work (TODO P69.C1, CORE I12).
2. Guard-1 deterministic pre-exec scan runs: `pathfloor` (filesystem),
   `netfloor` (SSRF/egress), TOCTOU checks, sandbox policy
   (`guard/src/approval_policy.rs`, `autonomy.rs`, `batch.rs`) **[S: module layout]**.
3. Risk classifies the op: `AuthorizationTicket::from_risk_and_op(risk,
   operation, read_only)` (`crates/everyaios-guard/src/ticket.rs:59`) **[S]**.
4. High-risk ops surface a Guard-2 human approval card in the cockpit
   (`ui/src/guard-main.ts` is the dedicated webview entry) **[D: ARCH/06]**.
5. The ticket is single-use and argument-bound: `is_valid()`,
   `matches_args(args_hash)`, `consume(args_hash)`
   (`ticket.rs:146–162`, struct at `:102`, store at `:175`) **[S]**.
6. The executor performs the effect only with a consumed ticket; the operation
   is appended to the audit ledger as an `AuditEvent`
   (`crates/everyaios-audit/src/lib.rs:34`; append/resume sequencing covered by
   that crate's unit tests) **[S]**, with the authorization provenance (`agent_ticket` /
   `automation_ticket` / `human_gesture`) recorded on the row **[D: spec §4.3]**.

## F3 — Provider key broker (keys never leave the vault)

1. Provider API keys are stored only in `crates/everyaios-vault` (SQLCipher
   key-ring) **[S: module doc]**.
2. The sidecar requests a model stream by name over the stdio contract; the
   `provider/stream` seam files — `src-tauri/src/lib.rs`,
   `crates/everyaios-core/src/chat.rs`, `crates/everyaios-core/src/sidecar_link.rs`,
   `packages/coordinator/src/index.ts` — are where the brokered exchange lives **[G
   co-occurrence + D: AGENTS §15]**.
3. Rust resolves the credential from the vault, opens the outbound request
   through Guard-2 `netfloor` policy, and relays stream frames to the sidecar;
   key material never enters sidecar memory or IPC payloads **[D: AGENTS §10, §15
   — this step is doc-asserted; the relay implementation detail is not
   symbol-traced here]**.
4. Catalog/model metadata comes from `crates/everyaios-catalog` (models.dev
   sync) so routing does not require network at call time **[S: module doc]**.
   **Known defect V4:** `packages/core-providers/src/vault.ts:88,:147` seals/unseals provider keys in
   TypeScript — credential custody must live only in `everyaios-vault` (CORE I10; TODO P69.C4, the most
   severe of the four).

## F4 — External agent session (ACP example)

1. `crates/everyaios-acp` bridges the Agent Client Protocol to installed
   external agents (Claude Code, Codex, OpenCode) **[S: module doc + ADR
   registry in `DESKTOP-APP-SPEC.md`]**.
2. Governance class of the external agent is surfaced honestly in the UI
   (Governed-Mediated / Self-contained / NotGoverned badges,
   `ui/DESIGN-SYSTEM.md` §3) — and audit coverage must be stated per mode, never claimed uniformly
   (CORE I15, `ARCH/EXTERNAL-AGENTS.md`). **Known gaps V2/V3:** mediated-mode `fs/*`/`terminal/*`
   handlers are unimplemented (`client.rs:521` handles only `session/request_permission`, `:538`
   returns `-32601`), and mediated mode is not the default (`chief.rs:373`,
   `advertise_fs_terminal: false`) — open work (TODO P69.C2/C3).
3. MCP tool surfaces are exposed via `crates/everyaios-mcp`; tool-hijack
   validation is part of that crate's contract **[S: module doc, `hijack.rs`]**.
   The Work Gateway is the only path to an effect; external agents see task-shaped façades via the
   `AgentBridge`, never the internal tool catalogue (`ARCH/EXTERNAL-AGENTS.md`).

## Known limits of this document

- Flows are file-level. Call-order *within* a step is reconstructed from seams
  and docs, not symbol-traced. Lifting this to tier-A evidence requires
  LSP/SCIP-backed resolution (see `freshness.json` coverage notes).
- The P69.A35 refresh re-read the named defect seams in the working tree
  (`chief.rs:417,:373`; `client.rs:521,:538`; `vault.ts:88,:147`) but did not re-trace step sequences;
  treat pre-existing step order as carried, defect pointers as re-read.
