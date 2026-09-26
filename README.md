# AgentCowork (working name)

> **Status: architecture docs v1** — the documentation set was rebuilt from scratch in September 2026 on the shoulders of the v0 corpus (archived locally at `ARCHIVE/v0/`). **The code is frozen during this phase**; delivery status lives in [`TODO.md`](TODO.md). Nothing here is released.

AgentCowork is a **local-first AI work environment** that composes interchangeable agents, models, capabilities and execution environments behind one governed execution model, on top of a continuously updated model of the user's digital world. It is an AI-native execution layer on your existing computer — not an operating-system replacement.

*One workspace, every model, every tool.*

---

## Start here (docs)

| Doc | What it is |
|---|---|
| [`ARCH/00-INDEX.md`](ARCH/00-INDEX.md) | **The door** — authority chain, full doc map, conventions, evidence rules |
| [`AGENTCOWORK-SPEC.md`](AGENTCOWORK-SPEC.md) | Product contract (WHAT the product must be) |
| [`ARCH/03-HLD.md`](ARCH/03-HLD.md) | Architecture root (planes, module map, the one governed path) |
| [`AGENTCOWORK-UI.md`](AGENTCOWORK-UI.md) | UI architecture + chat rendering spec |
| [`ARCH/40-FLOWS.md`](ARCH/40-FLOWS.md) · [`ARCH/41-EDGE-CASES.md`](ARCH/41-EDGE-CASES.md) | End-to-end flows and the edge-case catalog |
| [`ARCH/42-EVIDENCE-MAP.md`](ARCH/42-EVIDENCE-MAP.md) | How claims are evidenced; acceptance map; code-phase fix register |
| [`TODO.md`](TODO.md) | Delivery status (exempt from the docs rebuild) |
| [`AGENTS.md`](AGENTS.md) | Operating contract for coding agents in this repository |

Module LLDs live in `ARCH/10`–`ARCH/44` (kernel, work, trust, capability, providers, agent runtime, context, memory, models, runtime, workflow, world model, Office, browser, computer-use, files, code, search, comms, artifacts, events, skills/plugins, channels, verification, glossary, absorb register).

## Architecture in one screen

- **Core is the brain.** Every surface (desktop, CLI, IDE, API, mobile-later) is a projection.
- **Work is universal.** A chat turn, a workflow run, a background job and a subagent task share one lifecycle.
- **One governed path for every effect:**
  `Work → Capability → Provider → Handle → Guard → Ticket → Execute → Effect → Verify → Receipt → Event`.
- **Capability ≠ provider.** Semantic operations compose with interchangeable implementations (native runtimes, MCP, ACP, CLI, plugins, remote).
- **Agents are peers.** The native agent and every external agent implement the same engine contract and pass the same Guard.
- **Memory ≠ context.** Durable scoped knowledge vs the per-turn selection under budget.
- **Deterministic work never touches a model.** Rendering, browsing, indexing and navigation are OS work.

Full detail: [`ARCH/02-THESIS.md`](ARCH/02-THESIS.md) and [`ARCH/03-HLD.md`](ARCH/03-HLD.md).

## Repository layout

```
crates/        Rust kernel workspace (guard, vault, audit, office, browser, MCP/ACP, storage, …)
packages/      TypeScript sidecar (coordinator, core-* shared plane services)
ui/            React cockpit (desktop SPA)
src-tauri/     Tauri shell (thin native layer, IPC commands)
ARCH/          v1 architecture docs (this rebuild; v0 archived under ARCHIVE/v0/)
scripts/       CI gates, codegen, verification tools
.agents/       Agent kit (skills, docs)
```

## Development

```bash
# Rust kernel (workspace manifest lives in crates/)
(cd crates && cargo build)
(cd crates && cargo test)          # all Rust tests
(cd crates && cargo clippy)

# JavaScript/TypeScript workspace
pnpm install
pnpm --filter @everyaios/coordinator build
pnpm test
pnpm --filter ui tsc --noEmit      # UI typecheck

# Repository gates
node scripts/check-arch-invariants.mjs
node scripts/ipc-parity.mjs --md
node scripts/gen-codebase-map.mjs --check
```

> **Naming note:** package and crate identifiers still use the historical `everyaios-*` prefix; a rename is scheduled after the v1 docs freeze (tracked as OQ-003).

## Contributing

- Read [`AGENTS.md`](AGENTS.md) first — it is the operating contract (discovery → plan → implement → verify → report).
- Conventional commits, vendor-neutral: describe the software change, never the tooling used to make it.
- Keep the governed path intact: no unticketed effects, no second permission system, no direct store access across modules.

## License

See [`LICENSE`](LICENSE), [`LICENSE-APACHE`](LICENSE-APACHE), [`LICENSE-MIT`](LICENSE-MIT); third-party attributions in [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md). The absorb register ([`ARCH/44-ABSORB-REGISTER.md`](ARCH/44-ABSORB-REGISTER.md)) records licensing rules for comparative work.
