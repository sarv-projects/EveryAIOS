# Hotspots

> **Post-thaw authority: [`../../ARCH/CORE.md`](../../ARCH/CORE.md)** (27 invariants I1–I27) **+ the subsystem contracts** (`WORK` · `SESSION` · `AGENT` · `EXTERNAL-AGENTS` · `CONTEXT` · `CAPABILITIES` · `MEMORY` · `SECURITY` · `RECOVERY` · `ROUTING` · `UI` · `DESKTOP`). Refreshed post-thaw (TODO **P69.A35**). This artifact remains what it was built to be: accurate about the **code and tests** it indexes — that is its value. Where quoted code wording predates the thaw (legacy `Chief` identifiers, "token economy" module docs), quotations are verbatim and marked as such.

---


Graph-derived signals from the codegraph index (commit `c574ea4`, tree-sitter,
2,203 file-level edges). These are **indicators for where to look and what to
protect when changing code — not quality scores**. Post-thaw note: the P69.A35 refresh did **not**
re-run the indexer — all counts below are carried from the 0dd50da verification (see
`freshness.json`); re-run `codegraph.py index` to re-verify against the current tree.

## PageRank top 15 (structural importance)

| # | File | Score | in | out |
|---|---|---|---|---|
| 1 | `packages/core-domain/src/index.ts` | 0.0345 | 98 | 0 |
| 2 | `ui/src/lib/utils.ts` | 0.0307 | 115 | 0 |
| 3 | `ui/src/lib/runtime.ts` | 0.0270 | 43 | 0 |
| 4 | `ui/src/lib/tauri.ts` | 0.0161 | 76 | 1 |
| 5 | `ui/src/lib/store.ts` | 0.0104 | 94 | 10 |
| 6 | `src-tauri/src/lib.rs` | 0.0098 | 35 | 48 |
| 7 | `crates/everyaios-cdp/src/lib.rs` | 0.0093 | 13 | 5 |
| 8 | `crates/everyaios-vault/src/lib.rs` | 0.0082 | 24 | 11 |
| 9 | `crates/everyaios-storage/src/lib.rs` | 0.0060 | 8 | 18 |
| 10 | `crates/everyaios-browser/src/lib.rs` | 0.0043 | 11 | 24 |
| 11 | `crates/everyaios-mcp/src/lib.rs` | 0.0040 | 10 | 10 |
| 12 | `crates/everyaios-desktop/src/types.rs` | 0.0040 | 11 | 0 |
| 13 | `ui/src/components/ui/button.tsx` | 0.0037 | 51 | 1 |
| 14 | `ui/src/lib/acp.ts` | 0.0037 | 5 | 2 |
| 15 | `ui/src/lib/agents.ts` | 0.0036 | 21 | 1 |

Reproduce: `.venv/bin/python .agents/skills/codebase-intelligence/scripts/codegraph.py report --top 15`

## Reading the signals

- **`core-domain/src/index.ts` (in=98, out=0)** — the shared type barrel. A
  signature change here fans out to the whole sidecar; treat as a public API.
- **`ui/src/lib/utils.ts` (in=115)** and **`button.tsx` (in=51)** — UI bedrock.
  Changes are cheap to make and expensive to get wrong; run the UI suite.
- **`src-tauri/src/lib.rs` (out=48, in=35)** — the single fan-out point between
  shell and kernel. Any new command touches it; the `docs-sync` IPC-parity
  checks exist because of this concentration.
- **`vault/src/lib.rs` (in=24)** — the trust anchor. CORE I10 (sole vault custody of provider keys)
  funnels everything through it.
- **`store.ts` (in=94, out=10)** — UI state hub; also the largest ref surface
  (4,078 refs), so renames are high-blast-radius. Post-thaw direction is to collapse any duplicated
  Work/session truth out of it (projection/cache/ephemeral only — TODO P69.D24).

## Cross-crate concentration

74 cross-crate edges, concentrated: `core → guard` (17), `core → blueprint`
(10), `browser → cdp` (9). Guard and blueprint are downstream-mandatory from
core — changes there ripple immediately.

## Cycles

The report does not compute SCCs or cycle detection at this tool version
(sections: PageRank, Orphans, Most Referenced Definitions, Language
Breakdown). No cycle claim is therefore made here either way; run
`codegraph.py export --format graphml` + a NetworkX SCC pass if cycle analysis
is needed.

## Orphans

406 files show zero graph edges. Sample inspected: documentation and
configuration (`*.md`, `.agents/` content). This is expected for non-code
assets; a code file appearing here after a refactor would signal dead or
disconnected code — worth an occasional look, not an alarm.

## Test-gap signal (honest limits)

No coverage instrumentation exists, so "hub without tests" cannot be computed
mechanically. Proximity check: all PageRank top-15 files sit in areas with
colocated test suites (54 UI test files, 59 coordinator test files, crate unit
mods), but per-file mapping is unproven — see
[tests-and-verification.md](tests-and-verification.md).

## Coverage caveats for these numbers

- Graph is file-level; 44% of imports remain unresolved (dynamic imports,
  re-exports, assets, external crates) — centrality under-counts files reached
  only through unresolved specifiers.
- **Per-edge provenance is not persisted.** `edges.resolution_method` and
  `edges.confidence` exist in the schema but are NULL for all 2,203 edges (and
  both columns are NULL for all 8,279 imports). The `B` band claimed for this
  index is a whole-index assertion, not a recorded fact per edge — treat any
  per-edge confidence tier read out of this index as unverified.
- A moved/renamed file updates only after `codegraph.py index` runs
  (incremental; mtime+size pre-check, SHA-256 authoritative).
