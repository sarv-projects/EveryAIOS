# Repository Understanding Documentation

The kit has two deliberately separate layers:

1. **Index state** under `.code-intelligence/`: machine-generated, incremental, disposable, normally ignored by Git.
2. **Understanding artifacts** under `docs/codebase/`: compact, reviewable descriptions of architecture and behavior that a project may choose to commit. In this repository the committed understanding surface is the hand-authored `ARCH/` set — including the requirement registry [`ARCH/08-REQUIREMENTS.md`](../../ARCH/08-REQUIREMENTS.md) — and the generated `docs/codebase/` set was retired on 2026-09-26 ([`ARCH/00-INDEX.md`](../../ARCH/00-INDEX.md) §10).

## Recommended generated surface

```text
$project/
├── AGENTS.md
├── docs/
│   └── codebase/
│       ├── README.md
│       ├── architecture.md
│       ├── components.md
│       ├── flows.md
│       ├── data-and-state.md
│       ├── external-systems.md
│       ├── tests-and-verification.md
│       ├── invariants.md
│       ├── decisions.md
│       ├── hotspots.md
│       └── freshness.json
└── .code-intelligence/
    ├── index.sqlite
    ├── manifest.json
    ├── merkle.json
    └── reports/
```

That surface is the kit default for adopting projects. This repository does not currently commit a generated surface: `ARCH/` is hand-authored and authoritative, and the machine index under `.code-intelligence/` remains disposable.

Keep generated understanding concise. Every non-obvious claim should point back to source files, tests, configuration, or Git history.

## Refresh policy

Refresh the machine index after structural changes. Regenerate understanding artifacts after architectural or behavioral changes. Do not treat a stale report as evidence.

## Process documents

- `architecture-and-protocol.md` — the 7-phase repository-understanding protocol.
- `spec-driven-development.md` — requirement → plan → code → verification loop, IDs, and the spec gate.
- `installation.md` — dependencies, invocations, and subcommands.
