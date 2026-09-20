# Components

Responsibilities are quoted from each crate's `//!` module doc where one exists.
Entry points are file-level graph facts; "tests" lists located test files (not a
coverage claim — see [tests-and-verification.md](tests-and-verification.md)).

## L4 — Cockpit (`ui/`)

- **Responsibility:** the single-window cockpit. Shell composition in
  `ui/src/App.tsx`; design tokens in `ui/src/globals.css`; normative UI spec in
  `ARCH/12-UI-SPEC.md`, implementable design system in `ui/DESIGN-SYSTEM.md`.
- **Public entry points:** `ui/src/main.tsx` (app), `ui/src/guard-main.ts`
  (Guard approval webview entry).
- **Core seams (graph hubs):**
  - `ui/src/lib/runtime.ts` — runtime state + `nativeCall()` IPC wrapper
    (in-degree 43; `tauri.ts:14` imports `nativeCall` from here)
  - `ui/src/lib/tauri.ts` — Tauri invoke binding (in-degree 76)
  - `ui/src/lib/store.ts` — Zustand store, 48 defs / 4,078 refs (in-degree 94)
  - `ui/src/lib/utils.ts` — shared helpers (in-degree 115)
  - `ui/src/lib/acp.ts`, `ui/src/lib/agents.ts` — ACP agent surface
- **Tests:** 54 `*.test.ts(x)` under `ui/src` (Vitest + DOM testing library).
- **Config:** `ui/tsconfig.json` declares the `@/* → ./src/*` path alias
  (consumed by the codegraph resolver too).

## L3 — Tauri shell (`src-tauri/`)

- **Responsibility:** thin command layer. `src-tauri/src/lib.rs` holds the
  `generate_handler!` registration (339 commands, per `CODEBASE-COVERAGE` count
  in `scripts/gen-codebase-map.mjs` output) and is the only file with fan-out
  to both crates and commands (in-degree 35, out-degree 48).
- **Modules:** ~46 `*_cmds.rs` files (acp, agent, artifact, boot, browser,
  calendar, catalog, cockpit, codeintel, desktop, discovery, doctor, …) plus
  `commands.rs`, `control.rs`.
- **Rule:** commands validate + delegate; business logic lives in L2 crates.
- **Protocol:** must match `PROTOCOL_VERSION = 1` on the UI side
  (`crates/everyaios-ipc/src/lib.rs:40`).

## L2 — Rust kernel (`crates/`, 22 workspace members)

Responsibilities are each crate's own module doc (`crates/*/src/lib.rs`):

| Crate | Own module doc (abridged) |
|---|---|
| `everyaios-core` | "the EveryAIOS orchestrator binary" — supervisor (`supervisor.rs`), sidecar link (`sidecar_link.rs`), chat (`chat.rs`), native loop, migration, worktrees |
| `everyaios-ipc` | "the EveryAIOS process contract" — `frame.rs`, `channel.rs`, `budget.rs`; `PROTOCOL_VERSION = 1` |
| `everyaios-guard` | "Guard-1: deterministic pre-exec scanning of every" effect — `approval_policy.rs`, `autonomy.rs`, `ticket.rs`, pathfloor/netfloor/sandbox |
| `everyaios-audit` | "append-only NDJSON event log (ARCH/06 §6.5, J5)" — `AuditEvent` at `lib.rs:34`, `merkle.rs` |
| `everyaios-vault` | "SQLCipher-encrypted key-ring store (ARCH/03, J8)" — `broker.rs`, `credential_broker.rs`, `auth_bridge.rs` |
| `everyaios-blueprint` | "orchestration core (P6)" — `blueprint.rs`, `automation.rs`, `change_set.rs` |
| `everyaios-memory` | "memory fusion + token economy (P5, C1–C10)" — `actr.rs`, `avoid.rs`, compaction |
| `everyaios-office` | "surgical OOXML editing (P4, D1–D8)" — `atomic.rs`, `conformance.rs`, docx/ |
| `everyaios-browser` | "accessibility-tree snapshot engine + action layer" — `acquisition.rs`, `actions.rs`, `ax.rs` |
| `everyaios-cdp` | "Chrome DevTools Protocol client (ARCH/08, E1)" — `browser.rs`, `discovery.rs`, `fingerprint.rs` |
| `everyaios-desktop` | "E9 desktop computer-use" — **cargo package name is `everyaios-computeruse`** (collision with the src-tauri shell crate; see `crates/Cargo.toml` comment) |
| `everyaios-mcp` | "MCP server exposing the browser + connector tools" — `attach.rs`, `hijack.rs` (tool-hijack validation) |
| `everyaios-acp` | "the ACP (Agent Client Protocol) harness bridge (P6.8)" — `a2a.rs`, `agent_backend.rs` |
| `everyaios-agents` | "P31 — custom agent bundles (B9)" — `bundle.rs`, `moa.rs` |
| `everyaios-catalog` | "P14 — Model catalog (models.dev)" — `catalog.rs`, `discovery.rs`, `fetch.rs` |
| `everyaios-codeintel` | "code intelligence (P7.1, I11)" — `docs_lookup.rs`, `edit.rs` |
| `everyaios-engine` | "Rust port slice of the TS `ConversationEngine`" — `gate.rs`, `plan.rs` |
| `everyaios-eval` | "Verified-Completion Eval Subsystem (P8.0, EV1)" — `batch.rs`, `corpus.rs`, `evidence.rs` |
| `everyaios-script` | "the `run`/`evaluate` sandbox (ARCH/08 §8.4, E4)" — `artifact.rs`, `sandbox.rs` |
| `everyaios-search` | "search & research (P8.4)" — `searx_space.rs` |
| `everyaios-storage` | "storage intelligence (P4.8, D9–D12 + G7)" — `checkpoint.rs`, `content.rs`, dedup, FTS5 |
| `everyaios-types` | "the shared contract crate (spec §4.0 item 20, P47.3)" |

- **Tests:** 28 integration files under `crates/*/tests/` (`acceptance_*` and
  `live_*` naming; live tests require `EVERYAIOS_LIVE_TEST=1`), plus
  `#[cfg(test)]` unit modules in 382 source files.

## L1 — Sidecar (`packages/`, 11 workspace packages)

- **`coordinator`** — the LLM turn loop and IPC handler; spawns per
  `crates/everyaios-core/src/supervisor.rs`. 59 test files (largest TS suite).
  Entry: `packages/coordinator/src/index.ts`.
- **`core-domain`** — shared domain types; the single most-imported file in the
  graph (`src/index.ts`, in-degree 98, out 0 — a pure type barrel).
- **`core-ai`** (13 tests), **`core-engine`** (4), **`core-memory`** (8),
  **`core-search`** (7), **`core-providers`** (6), **`core-connectors`** (5),
  **`core-tools`**, **`core-security`**, **`core-agents`**.
- All 11 publish under `@personal-ai/*` / `@everyaios/*` names mapped from their
  `package.json`; imports resolve to each package's `src/index.ts` (not the
  gitignored `dist/`).
- **Boundary:** no file-level imports in either direction between `packages/`
  and `ui/` or `crates/` (graph-verified); the sidecar talks to Rust over the
  stdio JSON-RPC contract only.

## Dependency shape (graph evidence)

Hottest dependents: `src-tauri/src/lib.rs` (out-degree 48 into crates),
`crates/everyaios-browser/src/lib.rs` (out 24), `crates/everyaios-vault/src/lib.rs`
(in 24). Cross-crate edges (74) concentrate on `core → guard` (17),
`core → blueprint` (10), `browser → cdp` (9). Full centrality table:
[hotspots.md](hotspots.md).
