# Repository Understanding Documentation

The kit has two deliberately separate layers:

1. **Index state** under `.code-intelligence/`: machine-generated, incremental, disposable, normally ignored by Git.
2. **Understanding artifacts** under `docs/codebase/`: compact, reviewable descriptions of architecture and behavior that a project may choose to commit.

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

Keep generated understanding concise. Every non-obvious claim should point back to source files, tests, configuration, or Git history.

## Refresh policy

Refresh the machine index after structural changes. Regenerate understanding artifacts after architectural or behavioral changes. Do not treat a stale report as evidence.
