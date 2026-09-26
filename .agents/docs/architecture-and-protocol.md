# Repository Understanding Protocol

This is the conceptual protocol implemented by the `codebase-intelligence` skill. It pairs with `spec-driven-development.md`: understanding precedes spec changes, and spec changes drive implementation.

## Phase A — Discover

- repository root and worktree
- instruction files
- languages and build systems
- manifests and lockfiles
- application entry points
- tests
- configuration and environment variables
- generated/vendor/build directories
- external integration declarations

## Phase B — Index

Extract, with provenance:

- file nodes
- directories/modules
- AST/structure nodes
- symbols
- imports/exports
- file dependencies
- syntax diagnostics
- semantic chunks
- optional references/calls from LSP/SCIP/native indexers

Track SHA-256 content hashes and a deterministic directory/Merkle fingerprint.

## Phase C — Enrich

Optional adapters can contribute:

- exact semantic definitions/references;
- type hierarchy;
- implementations/overrides;
- call graph;
- control/data-flow findings;
- structural code queries;
- lexical search indexes;
- local embeddings/vector search.

Every imported fact keeps its provider and confidence.

## Phase D — Understand

Synthesize evidence into:

- subsystem boundaries and responsibilities;
- entry points and request/event/command flows;
- data/state/configuration flows;
- external-system boundaries;
- test coverage relationships;
- invariants and safety constraints;
- coupling and architectural hotspots;
- historical rationale and recent evolution.

## Phase E — Retrieve

For an agent question, build a small evidence pack using multiple independent signals, rank results, and return exact source locations plus a bounded read plan.

## Phase F — Impact

Given a symbol, file, or diff:

- traverse reverse dependencies;
- include semantic callers/implementers when available;
- include configuration and runtime edges when known;
- include relevant tests;
- report coverage and uncertainty;
- do not convert partial coverage into a claim of safety.

## Phase G — Verify and remember

After changes:

- run validation;
- refresh stale index portions;
- update durable understanding artifacts only when the architectural fact is stable;
- attach a commit/tree identifier and freshness metadata.
