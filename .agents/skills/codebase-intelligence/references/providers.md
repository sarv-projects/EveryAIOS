# Provider Matrix

| Capability | Preferred baseline | Optional stronger provider | Failure fallback |
|---|---|---|---|
| Parse / AST | Tree-sitter Language Pack | native parser/compiler | file inventory |
| Structure/imports/exports | Tree-sitter Language Pack `process()` | language-native indexer | FTS |
| Structural search/refactor | ast-grep | language-native codemod | text search |
| Definitions/references | SCIP / LSP | compiler/typechecker | Tree-sitter + heuristic |
| Fast lexical search | SQLite FTS5 | Zoekt | `rg` |
| Graph analysis | NetworkX | dedicated graph store | adjacency traversal |
| Vector retrieval | none by default | Ollama + local vector DB / LanceDB / Qdrant | FTS + graph |
| Runtime/framework edges | adapters + config conventions | framework-specific analyzers | explicit evidence only |
| Deep code/data/control flow | none by default | Joern CPG / CodeQL | manual source tracing |
| History | Git | hosted code-review metadata | source/docs |
| Visualization | Mermaid / DOT | graph UI | structured JSON |

## Important rule

Do not require every provider. The baseline must remain useful on a fresh local checkout with no account, no external service, and no model-specific dependency.

## Optional MCP

An MCP wrapper may expose stable tools such as:

- `repo_overview`
- `search_code`
- `find_symbol`
- `find_references`
- `trace_path`
- `impact_of`
- `find_tests`
- `find_config`
- `architecture`
- `git_history`
- `freshness`

The skill itself must never require MCP. A CLI/JSON interface is sufficient.
