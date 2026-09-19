<!--
Blank template. Copy this file to the root of a new repository as `AGENTS.md`.
It is deliberately named `AGENTS.template.md` here so that it is not loaded as an
active instruction file for this directory. Project-specific sections should be
appended below section 12, rather than mixed into the universal ones.
-->

# Repository Agent Instructions

This file is the repository-wide engineering contract. It is deliberately model- and agent-agnostic.

## 1. Mission

Understand the software system before making substantial changes. Treat source code, tests, configuration, dependency manifests, generated artifacts, runtime boundaries, and Git history as evidence about one system.

Do not reduce repository understanding to directory listings, grep results, or a single prompt summary.

## 2. Repository understanding

For unfamiliar, architectural, debugging, refactoring, migration, or cross-cutting work:

1. Establish the repository root and inspect Git state.
2. Read the applicable `AGENTS.md` files and project documentation.
3. Use the `codebase-intelligence` skill when available.
4. Refresh the local structural index when it is missing or stale.
5. Inspect the generated `docs/codebase/` understanding artifacts when present.
6. Query symbols, imports, references, dependency paths, tests, configuration, and change impact before opening large amounts of source.
7. Use LSP/SCIP/compiler-backed semantic information when available. Treat syntax-only and heuristic relationships as lower-confidence evidence.
8. Trace at least the relevant execution/data/configuration path for non-trivial changes.
9. Check Git history when the reason for an abstraction or unusual dependency is unclear.
10. Record important new architectural facts in the project's codebase knowledge artifacts when they are stable and broadly useful.

## 3. Structural analysis

Use AST/structural tooling instead of regex when the question is about program structure.

Preferred capability stack, in descending order of semantic precision:

- compiler/typechecker/native semantic index;
- SCIP or a language-server index;
- Tree-sitter structure/import/export parsing;
- ast-grep or equivalent AST-aware search/rewrite;
- lexical search (`rg`) as a fallback for textual questions.

Do not manufacture semantic edges from names alone. Record the derivation method and confidence of important graph relationships.

## 4. Code graphs and maps

The repository understanding system may maintain separate graph layers for:

- files/modules and imports;
- symbols and definitions;
- references/calls;
- runtime architecture boundaries;
- tests and coverage;
- configuration and external services;
- history/evolution.

Do not use hand-written ASCII dependency trees as the source of truth. Prefer structured JSON/SQLite, Mermaid, Graphviz/DOT, or an equivalent machine-readable/rendered graph.

## 5. Incremental indexing

Indexing must be incremental.

- Content hashes are authoritative for change detection.
- Modification time and size may be used as cheap pre-checks only.
- Maintain a Merkle/directory fingerprint for fast subtree change localization where useful.
- Reparse only added/changed files.
- Remove records for deleted files.
- Recompute graph metrics only for the affected graph or relevant subgraph when practical.
- Never claim a graph is complete when language coverage is partial.

Local machine indexes belong under `.code-intelligence/` and are normally disposable and gitignored.

## 6. Understanding artifacts

The preferred committed knowledge surface is `docs/codebase/` when the project chooses to keep generated understanding under version control.

A good understanding set includes, as applicable:

- repository overview;
- architecture and subsystem responsibilities;
- important entry points and execution flows;
- data/state/configuration flows;
- external systems and integration boundaries;
- test/verification map;
- invariants and safety constraints;
- architecture decisions and historical rationale;
- hotspots and known coupling;
- freshness/evidence metadata.

Generated knowledge is evidence-assisted documentation, not an unquestionable source of truth. Reconcile stale claims against source.

## 7. Retrieval discipline

Answer repository questions with bounded evidence packs rather than dumping whole files.

A typical retrieval order is:

1. exact path/symbol matches;
2. AST-defined symbols and imports;
3. semantic references/calls;
4. full-text search;
5. graph neighborhoods and paths;
6. optional local semantic/vector retrieval;
7. focused source reads.

Combine independent signals where possible and preserve the provenance of each result.

## 8. Editing discipline

Make the smallest coherent change that solves the task. Preserve existing behavior unless a change is explicitly required.

Before adding a dependency, check for an existing project-native equivalent and consider portability, maintenance, security, and build cost.

Do not manually edit generated files when the repository has a generator; modify the source and regenerate instead.

## 9. Validation

After modifications:

1. run targeted tests;
2. run formatting/lint/type checks relevant to touched code;
3. run broader tests when practical;
4. inspect the complete diff and staged diff;
5. run repository-understanding refresh if structural relationships changed;
6. verify no secrets, local caches, or unrelated user work are included.

If a check cannot run, report exactly why. Never imply a skipped check passed.

## 10. Git discipline

For repository changes, Git is part of the normal completion path.

Use a workflow equivalent to:

```bash
git status --short
git diff --check
git add <intended-files>
git diff --cached --check
git status --short
git commit -m "clear description of the software change"
```

Stage intended files explicitly; do not blindly stage unrelated work. Do not rewrite or discard unrelated user changes.

Commit messages should describe the software change, not the tool, model, assistant, IDE, or coding agent that happened to perform it.

Do not mention those tool/agent names in commit messages, code comments, implementation notes, generated files, or documentation merely because they were used during the work. Examples include CodeBuff, FreeBuff, Claude Code, Cursor, Vibe, Codex, and Grok.

The same rule applies to future tools with the same role.

## 11. Skills

When a reusable workflow exists, use it instead of recreating the process from scratch.

Use the `skill-creator` skill when creating or materially changing a reusable skill. Skills should follow the open Agent Skills structure and progressive-disclosure model.

## 12. Communication

At the end of a substantial engineering task, summarize:

- what changed;
- what was verified;
- what remains uncertain or was skipped.

Keep the repository itself factual and tool-agnostic.
