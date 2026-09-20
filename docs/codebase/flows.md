# Flows

Execution paths at file granularity. Evidence type is stated per step:
**[G]** = file-level graph edge (codegraph, confidence B), **[S]** = read from
source, **[D]** = from repo docs (`AGENTS.md`, `ARCH/`, `DESKTOP-APP-SPEC.md`).
Step sequences reconstructed from seams + docs are marked as such; they are not
traced per-symbol (no LSP/SCIP tier-A resolution is configured yet).

## F1 — Chat turn (user message → model stream → UI)

1. Composer submit in `ui/src/components/chat/*` updates session state in
   `ui/src/lib/store.ts` **[S]**.
2. UI invokes a Tauri command via `nativeCall()` (`ui/src/lib/runtime.ts`,
   wrapped by `ui/src/lib/tauri.ts:30` which funnels every call through
   `tauriInvoke`) **[S]**.
3. The matching `#[tauri::command]` in `src-tauri/src/*_cmds.rs` delegates into
   `crates/everyaios-core` (`chat.rs`, `routing.rs`) **[G: src-tauri → core]**.
4. `crates/everyaios-core/src/sidecar_link.rs` frames the request to the Bun
   sidecar (`packages/coordinator`) over stdio JSON-RPC 2.0
   (`[u32 LE len][JSON]`) **[D + G: sidecar_link.rs ↔ coordinator/index.ts seam]**.
5. `packages/coordinator/src/chat.ts` runs the LLM turn loop; provider access is
   requested through the broker (F3), never with local keys **[S: chat.test.ts,
   index.ts reference `provider/stream`]**.
6. Streamed deltas return along the same seam into `chat.rs`, are persisted to
   the audit/event path, and surface in the UI timeline **[D]**.

## F2 — Effect authorization (the guard path)

1. A proposed mutating effect (tool call, automation step) reaches
   `crates/everyaios-guard` **[D: AGENTS §10, §15]**.
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
   that crate's unit tests) **[S]**.

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

## F4 — External agent session (ACP example)

1. `crates/everyaios-acp` bridges the Agent Client Protocol to installed
   external agents (Claude Code, Codex, OpenCode) **[S: module doc + ADR
   registry in `DESKTOP-APP-SPEC.md`]**.
2. Governance class of the external agent is surfaced honestly in the UI
   (Governed-Mediated / Self-contained / NotGoverned badges,
   `ui/DESIGN-SYSTEM.md` §3) — external agents' own effects are not vault- or
   guard-mediated **[D]**.
3. MCP tool surfaces are exposed via `crates/everyaios-mcp`; tool-hijack
   validation is part of that crate's contract **[S: module doc, `hijack.rs`]**.

## Known limits of this document

- Flows are file-level. Call-order *within* a step is reconstructed from seams
  and docs, not symbol-traced. Lifting this to tier-A evidence requires
  LSP/SCIP-backed resolution (see `freshness.json` coverage notes).
