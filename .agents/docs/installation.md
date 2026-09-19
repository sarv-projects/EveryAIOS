# Installation

## Minimal

Copy the skill directory into the skill location supported by your coding environment, then copy `AGENTS.md` into the root of a project.

The only hard runtime assumption is that the agent can read files and run commands.

## In this repository

The kit is installed under `.agents/`, so paths below are relative to the repository root:

```text
.agents/
├── README.md
├── docs/
├── templates/AGENTS.template.md
└── skills/
    ├── codebase-intelligence/
    │   ├── SKILL.md
    │   ├── requirements.txt
    │   ├── references/
    │   └── scripts/codegraph.py
    └── skill-creator/
        └── SKILL.md
```

Note that this repository's `AGENTS.md` at the root is the project contract, and the
universal sections are already merged into it. `.agents/templates/AGENTS.template.md` is
kept only as the blank upstream template for new repositories; it is named `.template.md`
so it is not loaded as an active instruction file for this directory.

## Recommended local indexer dependencies

```bash
python3 -m pip install -r .agents/skills/codebase-intelligence/requirements.txt
```

Then, from the repository root:

```bash
python3 .agents/skills/codebase-intelligence/scripts/codegraph.py index
python3 .agents/skills/codebase-intelligence/scripts/codegraph.py report --top 20
python3 .agents/skills/codebase-intelligence/scripts/codegraph.py query "nativeCall" --refs
python3 .agents/skills/codebase-intelligence/scripts/codegraph.py stats
```

All subcommands accept a global `--root <path>` (default: current directory).

## Available subcommands

| Command | Purpose |
|---|---|
| `index [--force]` | Build/update the code graph (delta-aware) |
| `report [--top N]` | PageRank, cycles, orphans, stats |
| `query <symbol> [--refs]` | Definitions and references for a symbol |
| `path <from> <to>` | Shortest dependency path between files |
| `stats` | Index statistics |
| `export [--format json\|graphml]` | Export the graph |

`codegraph.py` writes its SQLite index and Merkle manifest under `.code-intelligence/`,
which is gitignored. There is no separate `doctor` or `understand` subcommand; `stats`
serves as the health/coverage check.

## Optional providers

Add only what the repository benefits from:

- `ast-grep` for structural search/rewrite;
- a language's LSP or compiler/typechecker for semantic references;
- SCIP indexers for portable semantic cross-reference data;
- `ollama` plus a local vector store for semantic code retrieval;
- Zoekt for very large lexical search;
- Joern/CodeQL for deep code/data-flow analysis;
- Graphviz or Mermaid tooling for rendered diagrams.

The core workflow remains usable when all optional providers are absent.
