# External Systems

## L0 — Hosted agents and protocols

| System | Protocol | Bridge in repo | Notes |
|---|---|---|---|
| Claude Code, Codex, OpenCode | ACP (Agent Client Protocol) | `crates/everyaios-acp` ("harness bridge, P6.8"; `agent_backend.rs`, `a2a.rs`) | installed-CLI discovery; governance badges shown honestly in UI |
| MCP servers | MCP | `crates/everyaios-mcp` (client + server; `attach.rs`, `hijack.rs`) | MCP-first connector decision: `ARCH/ADR/0001` |
| Chrome | CDP | `crates/everyaios-cdp` ("Chrome DevTools Protocol client, ARCH/08, E1") | browser layer builds a11y snapshots on top (`everyaios-browser`) |

## LLM providers (BYOK)

- **Credential custody:** SQLCipher key-ring in `crates/everyaios-vault`
  (ARCH/03, J8). The sidecar never holds keys; streams are brokered over the
  `provider/stream` seam (see [flows.md](flows.md) F3).
- **Catalog:** `crates/everyaios-catalog` syncs models.dev metadata so routing
  and the UI picker work from a local snapshot; curated seed rows are labeled
  fallback, never presented as live data.
- **Runtime routing:** provider-qualified model selections are preserved
  through routing; per-agent ownership rules in `ui/DESIGN-SYSTEM.md` (2026-09-12 note).

## Network egress and retry boundaries

- **All outbound network crosses Guard-2 `netfloor`** (SSRF policy) —
  `AGENTS.md` §15, `crates/everyaios-guard`.
- Live/external integration tests are env-gated: `EVERYAIOS_LIVE_TEST=1`
  (`AGENTS.md` §14); `crates/*/tests/live_*.rs` are skipped without it.
- The `gws` managed-child connector seam is read-first (connectors may not
  write without the ticket path) — `SPEC-CHANGELOG.md` 2026-08-25 entry.

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

## Adapter locations (where a new external integration goes)

1. Protocol bridge crate: `everyaios-acp` / `everyaios-mcp` / `everyaios-cdp`
   pattern — dedicated crate, module doc stating the integration and plan ID.
2. Effect exposure: tools/mutations enter through guard-scanned surfaces, not
   raw commands.
3. UI surface: panel/view under `ui/src/components/`, states per
   `ui/DESIGN-SYSTEM.md` §3 (EmptyState/ErrorState/LoadingState).
