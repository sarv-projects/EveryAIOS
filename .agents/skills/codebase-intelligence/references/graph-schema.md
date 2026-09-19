# Graph Schema

## Node families

- `repository`
- `directory`
- `file`
- `module`
- `symbol`
- `route`
- `command`
- `event`
- `queue`
- `database`
- `table`
- `cache`
- `config_key`
- `external_service`
- `test`
- `commit`

## Core edges

- `contains`
- `imports`
- `includes`
- `exports`
- `defines`
- `references`
- `calls`
- `reads`
- `writes`
- `extends`
- `implements`
- `overrides`
- `registers`
- `handles`
- `publishes`
- `subscribes`
- `reads_config`
- `persists_to`
- `caches_in`
- `covered_by`
- `changed_by`
- `depends_on`

## Edge provenance

Each non-trivial edge should carry:

```json
{
  "kind": "calls",
  "provider": "scip",
  "resolution_method": "semantic-index",
  "confidence": 0.99,
  "source": {"path": "src/a.ts", "line": 42},
  "freshness": "<git/tree-id>"
}
```

Suggested confidence bands:

- `0.95-1.00`: compiler/native/SCIP exact resolution;
- `0.80-0.94`: validated LSP/framework relationship;
- `0.55-0.79`: deterministic syntax/path inference;
- `<0.55`: heuristic candidate; do not present as exact.

## Freshness

Every node/edge can inherit freshness from the file hash and index generation. Durable understanding documents should record the repository tree/commit used to generate them.
