# Agent-Agnostic Compatibility

The package is deliberately built around **capabilities**, not product names.

## Portable surface

Any coding environment that can:

- read repository files;
- execute a script or shell command;
- inspect Git;
- read Markdown;
- consume JSON;

can use the workflow.

## Native skill hosts

When a host implements the open Agent Skills format, install `.agents/skills/codebase-intelligence/` as a skill and let its `SKILL.md` be the routing contract.

When a host does not implement skills, copy the workflow from `SKILL.md` into the host's project-instruction mechanism or simply follow `AGENTS.md` and call the scripts directly.

## Optional bridges

The same underlying index can be surfaced through:

- CLI JSON;
- a shell wrapper;
- MCP;
- an IDE/LSP adapter;
- a local HTTP service.

The semantic contract stays the same; only transport changes.
