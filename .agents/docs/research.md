# Research Notes and Integrated Open-Source Patterns

Research snapshot: 2026-09-19.

The kit intentionally borrows **patterns and interfaces**, not source code, from established open-source projects.

## 1. Agent Skills format

The open Agent Skills specification defines a skill as a directory centered on `SKILL.md`, with optional `scripts/`, `references/`, and `assets/`. It recommends progressive disclosure: metadata first, then instructions, then supporting files. The package follows that structure and keeps the main skill concise.

Source: https://agentskills.io/specification

Anthropic's public skills repository uses the same folder + `SKILL.md` model and emphasizes reusable, self-contained skills.

Source: https://github.com/anthropics/skills

OpenAI's current skill documentation states that the same open standard is used by ChatGPT/Codex, with repository/user skill directories and progressive loading.

Source: https://developers.openai.com/docs/build-skills

## 2. AGENTS.md / universal project instructions

`AGENTS.md` is a simple open format for persistent project instructions. Claude Code can now read `AGENTS.md` directly when no project-specific `CLAUDE.md` takes precedence, and Codex loads repository-scoped `AGENTS.md` files as project instructions.

Sources:
- https://github.com/agentsmd/agents.md
- https://learn.chatgpt.com/docs/agent-configuration/agents-md
- https://code.claude.com/docs/en/memory

The kit therefore keeps project rules in `AGENTS.md` and avoids client-specific instruction formats.

## 3. Tree-sitter

Tree-sitter is the syntax/AST foundation for fast, incremental parsing and structural code navigation. GitHub's own code navigation system is built around Tree-sitter tags and queries.

Sources:
- https://github.com/tree-sitter/tree-sitter
- https://github.com/github/code-navigation

Current `tree-sitter-language-pack` provides a single cross-language package with structure/import/export/symbol/docstring/diagnostic/chunk extraction across hundreds of grammars. It is preferred over the older `py-tree-sitter-languages`, whose repository marks it unmaintained.

Sources:
- https://docs.tree-sitter-language-pack.xberg.io/guides/intelligence/
- https://docs.tree-sitter-language-pack.xberg.io/reference/api-python/
- https://github.com/grantjenks/py-tree-sitter-languages

## 4. Structural search and rewriting

`ast-grep` provides AST-aware search, linting and rewriting based on Tree-sitter. It is the preferred optional tool for questions where textual grep would produce false positives or for large structural refactors.

Source: https://github.com/ast-grep/ast-grep

## 5. Semantic code navigation

Serena exposes symbol-level semantic retrieval/editing through language servers and is explicitly designed to be model/interface agnostic. The key idea integrated here is to expose IDE-like `find symbol`, `find references`, and relational operations to agents instead of forcing whole-file reads.

Source: https://github.com/alyadins/serena

SCIP is a language-agnostic index format for definitions, references, and implementations. It is the preferred semantic exchange layer where language-specific indexers exist.

Sources:
- https://github.com/scip-code/scip
- https://sourcegraph.com/docs/code-navigation/writing-an-indexer

LSP 3.18 provides current standard facilities for symbol/reference/type navigation and related language intelligence.

Source: https://github.com/microsoft/language-server-protocol/blob/gh-pages/_specifications/lsp/3.18/specification.md

## 6. Repository maps and graph ranking

Aider's repository map extracts definitions/references and uses a file dependency graph plus PageRank to select context under a token budget. The kit adopts the useful parts—structural summaries, graph ranking, and bounded context—but makes the map queryable and evidence-bearing rather than injecting a fixed map into every prompt.

Source: https://github.com/Aider-AI/aider/blob/main/aider/website/docs/repomap.md

## 7. Incremental code indexing

Continue's indexing design uses content-addressed caching and SQLite/LanceDB artifacts so unchanged files do not need to be reprocessed. The kit adopts content-addressed indexing, SQLite persistence, and optional vector artifacts.

Source: https://github.com/continuedev/continue/blob/main/core/indexing/README.md

## 8. Local retrieval + evidence + impact

The current `codebase-index` project combines Tree-sitter, SQLite FTS5, ranked retrieval, graph traversal, impact analysis, explicit edge confidence, partial-coverage reporting, secret gates, and an agent skill/MCP/CLI surface. These patterns heavily inform this kit's retrieval and evidence protocol.

Source: https://github.com/denfry/codebase-index

## 9. Semantic code graphs with local memory

Current open-source projects such as CodeGraph and open-codebase-index combine Tree-sitter graphs, incremental indexing, local persistent stores, embeddings, BM25/lexical search, and agent-facing query tools. The kit treats these as optional implementations of the same abstract layers rather than requiring one provider.

Sources:
- https://github.com/codegraph-ai/CodeGraph
- https://github.com/Helweg/open-codebase-index
- https://github.com/lzehrung/codegraph

## 10. Semantic/vector retrieval

Roo Code's current codebase indexing parses semantic blocks with Tree-sitter, embeds them, and stores vectors in Qdrant. The kit adopts the architecture as an optional layer: structural/lexical retrieval remains the default, while local vectors can be added when natural-language discovery is materially useful.

Source: https://github.com/RooCodeInc/Roo-Code/blob/main/apps/docs/docs/features/codebase-indexing.mdx

## 11. Deep static analysis / code property graphs

Joern models code as a language-agnostic Code Property Graph spanning syntax, control-flow, and data-flow concepts. Kythe is another long-running pluggable ecosystem for code indexing and cross-reference graphs. These are optional deep-analysis backends, not requirements for ordinary coding work.

Sources:
- https://github.com/joernio/joern
- https://docs.joern.io/code-property-graph/
- https://github.com/kythe/kythe

## 12. Fast lexical retrieval

Zoekt is a fast code-search engine using trigram indexes and syntax-aware ranking. It is useful when a repository is large enough that SQLite FTS5 is no longer sufficient or when cross-repository search is required.

Source: https://github.com/sourcegraph/zoekt

## 13. Security / data-flow analysis

CodeQL provides a local database representation of a codebase and query system for security and code analysis. It is useful as an optional security/data-flow enrichment stage rather than as the universal repository index.

Source: https://docs.github.com/en/code-security/concepts/code-scanning/codeql/codeql-cli

## Design conclusion

No single open-source project currently gives a universal, model-agnostic, offline-first, evidence-backed understanding contract across every language and every agent. The best design is therefore a **layered capability contract**:

`Tree-sitter -> semantic index (SCIP/LSP/native) -> graph -> retrieval -> architecture/behavior synthesis -> evidence + freshness -> agent-facing bounded queries`.

Each layer is replaceable.
