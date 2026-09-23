# External Systems

> **Post-thaw authority: [`../../ARCH/CORE.md`](../../ARCH/CORE.md)** (27 invariants I1–I27) **+ the subsystem contracts** (`WORK` · `SESSION` · `AGENT` · `EXTERNAL-AGENTS` · `CONTEXT` · `CAPABILITIES` · `MEMORY` · `SECURITY` · `RECOVERY` · `ROUTING` · `UI` · `DESKTOP`). Refreshed post-thaw (TODO **P69.A35**). This artifact remains what it was built to be: accurate about the **code and tests** it indexes — that is its value. Where quoted code wording predates the thaw (legacy `Chief` identifiers, "token economy" module docs), quotations are verbatim and marked as such.

---


## L0 — Hosted agents and protocols

| System | Protocol | Bridge in repo | Notes |
|---|---|---|---|
| Claude Code, Codex, OpenCode | ACP (Agent Client Protocol) | `crates/everyaios-acp` ("harness bridge, P6.8"; `agent_backend.rs`, `a2a.rs`) | installed-CLI discovery; governance modes governed-mediated / self-contained / not-governed with honest UI badges (CORE §7.5, I15); the `AgentBridge` is work/binding-scoped, performs no effects — the Work Gateway is the only path to an effect (`ARCH/EXTERNAL-AGENTS.md`) |
| MCP servers | MCP | `crates/everyaios-mcp` (client + server; `attach.rs`, `hijack.rs`) | MCP-first connector decision: `ARCH/ADR/0001`; external MCP tools normalize into the canonical capability model, never a second permission universe (TODO P69.D18) |
| Chrome | CDP | `crates/everyaios-cdp` ("Chrome DevTools Protocol client, ARCH/08, E1") | browser layer builds a11y snapshots on top (`everyaios-browser`) |

## LLM providers (BYOK)

- **Credential custody:** SQLCipher key-ring in `crates/everyaios-vault`
  (ARCH/03, J8). The sidecar never holds keys. *The `provider/stream` broker seam was **deleted 2026-09-22**
  with the built-in engine (`P71.2c`, `ADR-0005` §2/§6): in v1 the **bound external agent owns its own
  credentials and transport**, EveryAIOS holds only its own keys (connectors, capability secrets) in the
  vault, and `flows.md` F3 now describes the retired path as history.* The former TS-side custody
  (`packages/core-providers/src/vault.ts`) was confirmed defect V4 against CORE I10 (`ARCH/CORE.md` §11);
  **repaired in code 2026-09-21** (`P69.C4` — handle-only façade, custody Rust-side; implemented, not
  verified), guarded by CRED-1/2/3 in `scripts/check-arch-invariants.mjs`.
- **Catalog:** `crates/everyaios-catalog` syncs models.dev metadata so routing
  and the UI picker work from a local snapshot; curated seed rows are labeled
  fallback, never presented as live data.
- **Runtime routing:** provider-qualified model selections are preserved
  through routing; **re-scoped by [`ADR/0005`](../../ARCH/ADR/0005-external-agents-are-the-v1-engines.md):** the
  `ModelCatalog → ModelRouter → Vault → ProviderTransport` chain is **retired**. EveryAIOS resolves *which
  agent* receives the Work; the agent owns its own provider, model and authentication (`ARCH/ROUTING.md`
  §1–§4). Model catalogue, pricing and usage/cost survive as **observations**, and context capacity still
  comes from the resolved route, never a global registry (CORE I21).

## Network egress and retry boundaries

- **All outbound network crosses Guard-2 `netfloor`** (SSRF policy) —
  `AGENTS.md` §15, `crates/everyaios-guard`.
- Live/external integration tests are env-gated: `EVERYAIOS_LIVE_TEST=1`
  (`AGENTS.md` §14); `crates/*/tests/live_*.rs` are skipped without it.
- The `gws` managed-child connector seam is read-first (connectors may not
  write without the ticket path) — `SPEC-CHANGELOG.md` 2026-08-25 entry.
  Post-thaw target: connector actions produce a canonical `EffectRequest` and go through Guard → Executor,
  with no connector-side permission model (TODO P69.D17).

## Search / research backends

- `crates/everyaios-search` ("P8.4 — search & research") includes a
  SearXNG-space adapter (`searx_space.rs`); optional hybrid index (SeekStorm)
  appears in the P15–P26 batch record (`SPEC-CHANGELOG.md`).

## Config / credential surfaces

| Key surface | Where consumed |
|---|---|
| Provider API keys | `everyaios-vault` only; never in `packages/` or `ui/` |
| Workspace crate names | `crates/*/Cargo.toml` `[package] name` |
| TS path aliases | `ui/tsconfig.json` (`@/* → ./src/*`) |
| Live-test gate | `EVERYAIOS_LIVE_TEST=1` env var |

## Post-thaw defect pointers (verified in source, `ARCH/CORE.md` §11)

Four of the nine thaw-confirmed defects lived on the external-agent path: **V1** — the ACP permission path grants approval without consulting Guard (`crates/everyaios-acp/src/chief.rs:417`, `Approval::allow()`); **V2** — ACP `fs/*` and `terminal/*` unhandled (`client.rs:521` handled only `session/request_permission`; everything else returned `-32601`, `:538`), so mediated mode had no filesystem/terminal path; **V3** — mediated mode not the default (`chief.rs:373`, `advertise_fs_terminal: false`). (V4, TS credential custody, is noted above.) **All four are repaired in code 2026-09-21 — `P69.C1`/`C2`/`C3`/`C4`, implemented but not verified**; the cited line numbers are as-of the thaw date. The other five (V5–V9, ACP-registry adapter — `ARCH/EXTERNAL-AGENTS.md` §4) are repaired as `P69.C7`–`C11`.

## Adapter locations (where a new external integration goes)

1. Protocol bridge crate: `everyaios-acp` / `everyaios-mcp` / `everyaios-cdp`
   pattern — dedicated crate, module doc stating the integration and plan ID.
2. Effect exposure: tools/mutations enter through guard-scanned surfaces, not
   raw commands.
3. UI surface: panel/view under `ui/src/components/`, states per
   `ui/DESIGN-SYSTEM.md` §3 (EmptyState/ErrorState/LoadingState).
