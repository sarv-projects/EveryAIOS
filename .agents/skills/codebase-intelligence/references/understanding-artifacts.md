# Understanding Artifact Contract

## `README.md`

- repository purpose;
- current runtime shape;
- build/test entry points;
- index freshness.

## `architecture.md`

- subsystems/components;
- responsibility of each;
- major dependencies;
- architectural boundaries;
- Mermaid or DOT overview diagrams.

## `components.md`

For each important subsystem:

- responsibility;
- public entry points;
- internal core symbols;
- dependencies/dependents;
- related tests;
- config/external systems;
- evidence.

## `flows.md`

Document important execution paths as numbered steps or Mermaid sequence/flow diagrams. Include source evidence at each significant boundary.

## `data-and-state.md`

Track important entities, transformations, persistence/cache boundaries, invalidation, and state transitions.

## `external-systems.md`

Track providers, databases, queues, APIs, credentials/config keys, retry boundaries, and adapter locations.

## `tests-and-verification.md`

Map important behavior to unit/integration/e2e tests and validation commands.

## `invariants.md`

Record only stable rules that the implementation/tests actually support, e.g. tenant isolation, idempotency, ordering, authorization, or state constraints.

## `decisions.md`

Capture architectural rationale backed by docs or Git history. When rationale cannot be proven, say so explicitly.

## `hotspots.md`

Use graph centrality, churn, dependency fan-out, test gaps, and cycles as signals. These are indicators, not quality scores.

## `freshness.json`

Record:

- commit/tree identifier;
- index version;
- files included/excluded;
- semantic provider versions when known;
- last refresh time;
- partial-coverage notes.
