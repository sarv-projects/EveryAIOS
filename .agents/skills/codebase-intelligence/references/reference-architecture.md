# Codebase Intelligence Reference Architecture

## Recommended directory

```text
.code-intelligence/
  index.sqlite3
  manifest.json
  merkle.json
  logs/
```

Keep this directory out of Git unless the repository explicitly wants checked-in generated indexes.

## Storage model

### files

One row per indexed source file.

Suggested columns:

- `id INTEGER PRIMARY KEY`
- `path TEXT UNIQUE NOT NULL`
- `sha256 TEXT NOT NULL`
- `size INTEGER NOT NULL`
- `mtime_ns INTEGER`
- `language TEXT`
- `status TEXT NOT NULL`
- `parser_version TEXT`
- `indexed_at TEXT NOT NULL`

### symbols

One row per definition/symbol occurrence that should be addressable.

Suggested columns:

- `id INTEGER PRIMARY KEY`
- `file_id INTEGER NOT NULL`
- `stable_key TEXT NOT NULL`
- `kind TEXT NOT NULL`
- `name TEXT NOT NULL`
- `qualified_name TEXT`
- `start_byte INTEGER`
- `end_byte INTEGER`
- `start_line INTEGER`
- `start_col INTEGER`
- `end_line INTEGER`
- `end_col INTEGER`
- `is_exported INTEGER DEFAULT 0`

### edges

Suggested columns:

- `id INTEGER PRIMARY KEY`
- `src_id INTEGER NOT NULL`
- `dst_id INTEGER NOT NULL`
- `kind TEXT NOT NULL`
- `resolution_method TEXT NOT NULL`
- `confidence TEXT NOT NULL`
- `source_line INTEGER`
- `metadata_json TEXT`

## Edge taxonomy

Use a small stable vocabulary and add specialized kinds only when necessary:

```text
contains
imports
includes
defines
references
calls
reads
writes
extends
implements
overrides
instantiates
routes-to
publishes
subscribes
configures
migrates
```

## Stable identity

Do not use database row IDs as the long-term identity visible to the agent. They can change after a rebuild.

Prefer deterministic keys based on repository-relative source identity:

```text
python:src/api/auth.py#AuthService.login#method
```

For anonymous/local constructs, include a stable source-range fingerprint.

## Why SCIP/LSP matters

Tree-sitter can parse syntax extremely well, but semantic resolution varies by language. SCIP is a language-agnostic code-index representation intended for go-to-definition, find-references, and similar navigation. LSPs or compiler-backed indexers may provide better precision for specific languages.

Merge semantic edges into the same graph, preserving provenance rather than replacing Tree-sitter data blindly.

## Graph analysis

Use a directed graph for dependencies. Consider separate graphs for:

- file dependencies;
- symbol references/calls;
- runtime architecture;
- test relationships.

This prevents unrelated edge types from producing misleading centrality values.

Example NetworkX workflow:

```python
import networkx as nx

G = nx.DiGraph()
G.add_edge("src/a.py", "src/b.py", kind="imports")
G.add_edge("src/c.py", "src/a.py", kind="imports")

rank = nx.pagerank(G)
components = list(nx.strongly_connected_components(G))
```

For very large graphs, compute metrics on a relevant subgraph instead of materializing every edge for every query.
