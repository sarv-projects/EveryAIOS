# Tests and Verification

## Commands

```bash
cargo test                                    # all Rust unit + integration tests
cargo test -p everyaios-core                  # single crate
pnpm test                                     # all Vitest suites
pnpm --filter ui tsc --noEmit                 # UI typecheck
cargo clippy                                  # Rust lint
node scripts/e2e/security-gate.mjs            # security gate
```

Live integration tests are gated: `EVERYAIOS_LIVE_TEST=1` (`AGENTS.md` §14).

## Test inventory (file counts, not coverage claims)

| Area | Files | Location pattern |
|---|---|---|
| Rust integration | 28 | `crates/*/tests/*.rs` — `acceptance_*` prefix per convention; `live_*` env-gated |
| Rust unit mods | 382 files with `#[cfg(test)]` | `crates/*/src/**/*.rs` |
| Sidecar (coordinator) | 59 | `packages/coordinator/**/*.test.ts` |
| Cockpit UI | 54 | `ui/src/**/*.test.ts(x)` — DOM testing library |
| core-ai | 13 | `packages/core-ai` |
| core-memory / core-search / core-providers / core-connectors / core-engine | 8 / 7 / 6 / 5 / 4 | `packages/core-*` |

Example integration tests: `crates/everyaios-acp/tests/acceptance_acp_handshake.rs`,
`crates/everyaios-blueprint/tests/acceptance_skill_distillation.rs`,
`crates/everyaios-browser/tests/acceptance_cdp.rs`.

## CI gates (`.github/workflows/ci.yml`)

| Job | Verifies |
|---|---|
| `rust` | kernel build + tests |
| `office-oracle` | office crate conformance |
| `ui` | cockpit typecheck + Vitest |
| `sidecar` | coordinator tests |
| `tauri-check` | shell layer check |
| `docs-sync` | doc staleness, incl. `node scripts/gen-codebase-map.mjs --check` (CODEBASE-MAP.md must match `git ls-files` exactly) |

Policy: CI runs all tests on every PR; no merging with failing tests
(`AGENTS.md` §14).

## Behavior → test mapping (where the graph can point)

- ACP handshake → `acceptance_acp_handshake.rs`; CDP round-trip →
  `acceptance_cdp.rs`; skill distillation →
  `acceptance_skill_distillation.rs`.
- Design tokens/contrast → `ui/src/lib/design-tokens.test.ts` is the stated
  authority on token values (`ui/DESIGN-SYSTEM.md` §1).
- Ticket semantics (single-use, args-hash binding) → unit tests inside
  `crates/everyaios-guard/src/ticket.rs` (`#[cfg(test)]` module).
- Audit append/resume → unit tests inside `crates/everyaios-audit/src/lib.rs`.

## Known verification gaps (stated, not hidden)

- No file→test coverage mapping exists in the index (no coverage data is
  collected); "related tests" above is by naming/location convention.
- The 202 detected test files are unevenly distributed: `everyaios-guard`,
  `everyaios-vault`, and `everyaios-audit` carry the system's most safety-
  critical logic but their integration coverage lives mostly in `#[cfg(test)]`
  modules rather than `tests/` files — verify per-change, do not assume parity
  with `coordinator`'s 59-file suite.
