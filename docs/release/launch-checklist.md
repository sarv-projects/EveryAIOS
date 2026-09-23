# v1 launch checklist (P70.F8)

Two lists. The first is enforced by gates — if an item here is wrong, a build is
red. The second can only be ticked by a human on a real host, and it is **not**
ticked today.

## A. Machine-checked (green on every commit)

| # | Item | Checked by |
|---|---|---|
| 1 | One version authority, all consumers agree | `scripts/check-versions.mjs` |
| 2 | Bundle matrix is Windows-only and cannot widen silently | `scripts/check-release-matrix.mjs` |
| 3 | App metadata complete; MSI upgrade code pinned | `scripts/check-app-metadata.mjs` |
| 4 | Native-dependency audit covers every spawn | `scripts/check-native-deps.mjs` |
| 5 | Size + RSS budgets recorded and validated | `scripts/check-size-budget.mjs` |
| 6 | Every durable store stamped, forward-only | `scripts/check-store-schemas.mjs` |
| 7 | Licence inventory + notices current, zero copyleft | `scripts/check-licences.mjs` |
| 8 | Updater key custody + pubkey agreement | `scripts/check-updater-keys.mjs` |
| 9 | Updater code/config/docs/registry agree | `scripts/check-update-pipeline.mjs` |
| 10 | Install layout, recovery playbook, diagnostics, platform truth | `scripts/check-diagnostics-surface.mjs` |
| 11 | Winget manifests + download page name the shipping version | `scripts/gen-release-surface.mjs --check` |
| 12 | Legal/policy docs present; no telemetry dependency | `scripts/check-public-surface.mjs` |
| 13 | Kernel gate clear; honest-capability audit passes | `scripts/release-qualify.mjs` (E1, E3, E11) |
| 14 | Docs, structural map and IPC parity agree | `check-doc-sync` + `gen-codebase-map --check` + `ipc-parity` |

## B. Human, on a real host (open — `P70.E8`/`E9`)

| # | Item | Why it is open |
|---|---|---|
| 1 | Install → first run → configure a provider → one real task → uninstall, recorded | No clean Windows host has run it (`E9`) |
| 2 | N-1 → N upgrade, then reinstall N-1 and observe the refusal | Needs two sequential Windows builds (`E8`) |
| 3 | Live integration: real Chrome CDP, a real external agent's ACP handshake, the office oracle, vault hydration | Needs live services (`E5`) |
| 4 | Live-model soak (edit ladder, shadow preflight, external-agent probes) | Needs live credentials (`E6`) |
| 5 | Crash/soak: kills at inopportune moments, Work recovery, `uncertain` classification | Wired on a 3-OS CI matrix; not run for this candidate (`E7`) |
| 6 | Perf + RSS measurement against the recorded budgets | Budgets are provisional until a first measurement lands (`E10`) |
| 7 | Known-issues list written for the shipped build | Derived from B1–B6 |
| 8 | Rollback rehearsed (the drill in `docs/updating.md` §7) | Needs B2 first |
| 9 | Sign-off record written | `scripts/release-qualify.mjs --record <version>` refuses until every item passes |

**The honest statement:** section A is green; section B is open. A v1 claim made
today would be a claim about the repository, not about a qualified binary —
which is exactly what `docs/download.md` "Not yet" says, and what the release
notes carry into the release body.
