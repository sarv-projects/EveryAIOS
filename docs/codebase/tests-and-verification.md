# Tests and Verification

> **Post-thaw authority: [`../../ARCH/CORE.md`](../../ARCH/CORE.md)** (27 invariants I1–I27) **+ the subsystem contracts** (`WORK` · `SESSION` · `AGENT` · `EXTERNAL-AGENTS` · `CONTEXT` · `CAPABILITIES` · `MEMORY` · `SECURITY` · `RECOVERY` · `ROUTING` · `UI` · `DESKTOP`). Refreshed post-thaw (TODO **P69.A35**). This artifact remains what it was built to be: accurate about the **code and tests** it indexes — that is its value. Where quoted code wording predates the thaw (legacy `Chief` identifiers, "token economy" module docs), quotations are verbatim and marked as such.

---


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

## Post-thaw verification direction (TODO-owned, not yet built)

These do not exist yet — they are the thaw's verification backlog, stated here so this map does not
imply they do:

- **CI architecture checks (TODO P69.E):** exactly one AgentRegistry / ToolRegistry / authorization
  engine / Work model / event writer / vault; no TS privileged effects; every effect passes Guard
  (connector, MCP, ACP, UI paths); no second event log; no scheduler/workflow/subagent-owned execution
  loop; no UI write except through the Work Gateway; capability lockstep (`capabilities.yaml` ==
  `ARCH/09` == spec §0, **166** ids) stays green.
- **Architecture regression tests (TODO P69.F9):** Work lifecycle, crash recovery, idempotency,
  `uncertain`-effect classification, receipt correctness, event ordering, event→projection consistency,
  binding switch, passport generation, agent resume, scoped-capability leakage, the ACP permission path,
  ACP mediated fs/terminal, bridge isolation, Guard-bypass attempts, connector bypass, secret leakage,
  UI-state divergence.
- **Defect closure (TODO P69.C, nine rows):** V1 (ACP permission path bypasses Guard), V2/V3 (mediated-mode
  fs/terminal + default), V4 (TS credential custody), plus V5–V9 (ACP-registry adapter: auth inferred from
  license, registry `env` discarded, bare binary launch, unparsed `license_url` + substring license
  matching, split auth-mode wire contract). **All nine are repaired in code as of 2026-09-21
  (`P69.C1`–`C4`/`C7`–`C12` — implemented, NOT verified).** The verification owed per row is still a test
  that fails before the fix and passes after; `P69.E7/E8` already turn two of the classes (TS credential
  custody, hardcoded approval) into CI gates so they cannot recur silently.

## Known verification gaps (stated, not hidden)

- No file→test coverage mapping exists in the index (no coverage data is
  collected); "related tests" above is by naming/location convention.
- The 202 detected test files are unevenly distributed: `everyaios-guard`,
  `everyaios-vault`, and `everyaios-audit` carry the system's most safety-
  critical logic but their integration coverage lives mostly in `#[cfg(test)]`
  modules rather than `tests/` files — verify per-change, do not assume parity
  with `coordinator`'s 59-file suite.
