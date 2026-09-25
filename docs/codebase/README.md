# EveryAIOS — Codebase Understanding

> **Post-thaw authority: [`../../ARCH/CORE.md`](../../ARCH/CORE.md)** (27 invariants I1–I27) **+ the subsystem contracts** (`WORK` · `SESSION` · `AGENT` · `EXTERNAL-AGENTS` · `CONTEXT` · `CAPABILITIES` · `MEMORY` · `SECURITY` · `RECOVERY` · `ROUTING` · `UI` · `DESKTOP`). Refreshed post-thaw (TODO **P69.A35**); claims touching the P69.C/D repairs were re-verified against source **2026-09-21** (see `freshness.json` → `claims_refresh`). This artifact remains what it was built to be: accurate about the **code and tests** it indexes — that is its value. Where quoted code wording predates the thaw (legacy `Chief` identifiers, "token economy" module docs), quotations are verbatim and marked as such.

---


Generated understanding artifacts for the EveryAIOS desktop harness. Compact,
reviewable, and evidence-linked: every non-obvious claim points to source files,
tests, configuration, or Git history. These files are committed; the machine
index they were derived from (`.code-intelligence/`) is disposable and gitignored.

## What this repository is

EveryAIOS is a **local-first, BYO-key desktop harness that hosts coding agents**
(Claude Code, Codex, OpenCode, MCP servers) rather than
being one itself. Under [`ARCH/ADR/0005`](../../ARCH/ADR/0005-external-agents-are-the-v1-engines.md)
the external agent is the only first-class v1 engine; a built-in binding is deferred to post-v1, and
the coordinator's own turn loop plus the `provider/stream` broker seam were deleted/archived
(`P71.2c` — see [flows.md](flows.md) F1.5/F3 and [external-systems.md](external-systems.md)). The
user-facing container is a **Chat**; the technical unit behind it is a
**Session** (`ARCH/SESSION.md` — a Chat may be standalone or attached to a Project). Chat, browser, files, documents, code, automations, agents, and
connected accounts share one durable work context. Every side-effecting operation
enters the authoritative effect boundary with **authorization provenance** (`ARCH/CORE.md` §5.1):
agent/automation mutations consume a single-use, args-bound `AuthorizationTicket` minted by
`everyaios-guard`; human UI mutations carry trusted user-gesture provenance. Both are audited.

Normative product spec: [`DESKTOP-APP-SPEC.md`](../../DESKTOP-APP-SPEC.md).
Agent contract: [`AGENTS.md`](../../AGENTS.md).
Capability identity: [`capabilities.yaml`](../../capabilities.yaml) == `ARCH/09-FEATURE-MATRIX.md` == spec §0 (**166** ids, CI-enforced by `scripts/check-doc-sync.mjs`).

## Runtime shape (5 layers)

| Layer | Implementation | Talks to next layer via |
|---|---|---|
| L4 Cockpit | `ui/` — React 19 + Zustand 5 + Tailwind 4 | Tauri IPC: `nativeCall()` (`ui/src/lib/runtime.ts`) |
| L3 Tauri shell | `src-tauri/` — 367 registered commands across 42 `*_cmds.rs` modules (machine-checked by `scripts/ipc-parity.mjs`) | direct Rust calls into L2 |
| L2 Rust kernel | `crates/` — 21-cargo workspace | stdio JSON-RPC 2.0 (`crates/everyaios-ipc`) |
| L1 Bun sidecar | `packages/coordinator` — turn coordination (not reasoning) | ACP / MCP / CDP |
| L0 External agents | Claude Code, Codex, OpenCode, MCP servers, Chrome | their own protocols |

**The one invariant (`ARCH/CORE.md` I1): Work proposes, the kernel disposes.** The sidecar has no
effect-execution surface; provider API keys never leave the vault (I10). Agent/automation effects carry
ticket provenance; human UI effects carry trusted user-gesture provenance (`ARCH/CORE.md` §5.1) —
"every mutation is ticketed" was never the invariant. See [invariants.md](invariants.md).

*Architecture view:* `ARCH/CORE.md` §2 restates the layers above as seven planes (shell · agent plane ·
runtime kernel · capability plane · external agents · persistent intelligence · platform) with the
dependency rule that nothing reaches an effect except through the kernel. The L0–L4 table is the
code-layout view; the planes are the authority. "Chief" is retired as a concept — the loop owner is the
selected agent's `AgentBinding` (`ARCH/AGENT.md`); the name survives only in legacy identifiers.

## Build / test / verify

The Rust workspace manifest is `crates/Cargo.toml` (there is **no** root
`Cargo.toml`), so every `cargo` command runs with `crates/` as the working
directory — CI does the same (`working-directory: crates`):

```bash
(cd crates && cargo build)                     # Rust kernel
(cd crates && cargo test)                      # all Rust unit + integration tests
(cd crates && cargo clippy)                    # Rust lint
pnpm install                                  # JS workspace
pnpm --filter @everyaios/coordinator build    # sidecar
pnpm --filter @everyaios/coordinator test     # sidecar tests (bun test)
pnpm --filter @everyaios/ui type-check         # cockpit typecheck (tsc --noEmit)
(cd ui && bun test)                            # cockpit tests (bun test; the ui package has no test script)
```

There is no root `test` script, and `@everyaios/ui` has no `test` script either —
so `pnpm test` from the repo root does not exist. Vitest is a devDependency only
under `packages/core-*`.

CI gates (`.github/workflows/ci.yml`): `docs-sync`, `rust`, `office-oracle`,
`ui`, `sidecar`, `tauri-check`. See
[tests-and-verification.md](tests-and-verification.md).

## Artifact index

| File | Contents |
|---|---|
| [architecture.md](architecture.md) | Subsystems, boundaries, overview diagram |
| [components.md](components.md) | Per-subsystem responsibilities, entry points, tests |
| [flows.md](flows.md) | Key execution paths with source evidence |
| [data-and-state.md](data-and-state.md) | Persistence, caches, state ownership |
| [external-systems.md](external-systems.md) | L0 agents, providers, egress control |
| [tests-and-verification.md](tests-and-verification.md) | Test map + commands |
| [invariants.md](invariants.md) | Stable rules the code/tests enforce |
| [decisions.md](decisions.md) | Architectural rationale with provenance |
| [hotspots.md](hotspots.md) | Graph centrality signals (indicators, not scores) |
| [freshness.json](freshness.json) | Index/commit provenance for this set |

## Index freshness

Structural facts in this set come from the codegraph index (`schema_version` 2,
tree-sitter extractor) built at commit `c574ea4`. Full provenance and coverage
notes: [freshness.json](freshness.json). Refresh policy: re-run
`.agents/skills/codebase-intelligence/scripts/codegraph.py index` after
structural changes, and regenerate this set after architectural or behavioral
changes. Do not treat a stale report as evidence.
