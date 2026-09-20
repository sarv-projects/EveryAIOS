# EveryAIOS — Codebase Understanding

Generated understanding artifacts for the EveryAIOS desktop harness. Compact,
reviewable, and evidence-linked: every non-obvious claim points to source files,
tests, configuration, or Git history. These files are committed; the machine
index they were derived from (`.code-intelligence/`) is disposable and gitignored.

## What this repository is

EveryAIOS is a **local-first, BYO-key desktop harness that hosts coding agents**
(Claude Code, Codex, OpenCode, MCP servers, an inbuilt native agent) rather than
being one itself. Chat, browser, files, documents, code, automations, agents, and
connected accounts share one durable work context. Every side-effecting operation
crosses an effect-authorization model (Guard-1 scan → authorization ticket →
Guard-2 human approval), executor, event log, and progress timeline.

Normative product spec: [`DESKTOP-APP-SPEC.md`](../../DESKTOP-APP-SPEC.md).
Agent contract: [`AGENTS.md`](../../AGENTS.md).

## Runtime shape (5 layers)

| Layer | Implementation | Talks to next layer via |
|---|---|---|
| L4 Cockpit | `ui/` — React 19 + Zustand 5 + Tailwind 4 | Tauri IPC: `nativeCall()` (`ui/src/lib/runtime.ts`) |
| L3 Tauri shell | `src-tauri/` — 339 registered commands across ~46 `*_cmds.rs` modules | direct Rust calls into L2 |
| L2 Rust kernel | `crates/` — 22-cargo workspace | stdio JSON-RPC 2.0 (`crates/everyaios-ipc`) |
| L1 Bun sidecar | `packages/coordinator` — LLM turn loop | ACP / MCP / CDP |
| L0 External agents | Claude Code, Codex, OpenCode, MCP servers, Chrome | their own protocols |

**The one invariant: the sidecar proposes, the Rust core disposes.** Every
mutating effect requires an authorization ticket minted in Rust; provider API
keys never leave the vault. See [invariants.md](invariants.md).

## Build / test / verify

```bash
cargo build                                  # Rust kernel
pnpm install                                 # JS workspace
pnpm --filter @personal-ai/coordinator build  # sidecar
cargo test                                   # all Rust tests
pnpm test                                    # all Vitest suites
pnpm --filter ui tsc --noEmit                # UI typecheck
cargo clippy                                 # Rust lint
```

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
tree-sitter extractor) built at commit `911234c`. Full provenance and coverage
notes: [freshness.json](freshness.json). Refresh policy: re-run
`.agents/skills/codebase-intelligence/scripts/codegraph.py index` after
structural changes, and regenerate this set after architectural or behavioral
changes. Do not treat a stale report as evidence.
