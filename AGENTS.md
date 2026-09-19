# Repository Agent Instructions

This file is intentionally **agent-agnostic**. Treat it as the durable contract for any coding agent working in this repository.

## 1. Mission

Before changing code, understand the repository's architecture, local conventions, relevant tests, and dependency relationships. Prefer evidence from source, tests, configuration, Git history, and structural indexes over assumptions.

For repository-wide or unfamiliar work, use the `codebase-intelligence` skill when available. Build/update AST and code-graph indexes rather than producing hand-written ASCII dependency maps.

## 2. Instruction hierarchy

- Follow this file for repository-wide behavior.
- Respect more-specific `AGENTS.md` files in subdirectories when supported.
- Follow the project's existing build, test, lint, formatting, and release conventions.
- Do not silently invent new conventions when an existing one is documented in the repository.

## 3. Understand before modifying

Before substantial edits:

1. locate the repository root;
2. inspect Git status and the current branch/worktree;
3. read this file and any relevant nested instruction files;
4. find the implementation, callers/dependents, configuration, and tests;
5. use structural code navigation when a relationship is non-trivial;
6. state assumptions internally and verify them from code where possible.

Do not browse the entire repository indiscriminately. Narrow the context using symbols, dependency graphs, search, and focused file reads.

## 4. Code intelligence

For architectural work, refactors, debugging, migrations, or unfamiliar areas:

- prefer Tree-sitter/AST-based extraction over regex-only structural analysis;
- use an incremental local index;
- preserve file hashes and update only changed files;
- use SQLite for durable local index state;
- use NetworkX or another local graph library for dependency analysis;
- use LSP/SCIP/compiler-backed resolution when available for precise definitions/references;
- distinguish compiler-grade edges from heuristics;
- never present an inferred relationship as certain evidence.

Never create ASCII-art dependency maps as the source of truth. Use structured graph data, Mermaid, DOT, or generated visualizations instead.

## 5. Editing rules

Make the smallest coherent change that solves the problem. Preserve existing public behavior unless the task requires a behavior change.

Before introducing a new dependency:

- check whether the repository already has an equivalent;
- consider maintenance and portability;
- document why the dependency is needed.

Do not modify generated files manually unless the repository explicitly requires it; update the source/template and regenerate them.

## 6. Validation

After changes:

1. run targeted tests first;
2. run formatting/lint/type checks relevant to touched code;
3. run broader tests when practical;
4. inspect the final diff;
5. verify no unintended files changed;
6. verify secrets, credentials, generated caches, and local indexes are not being committed accidentally.

If a check cannot run, record the exact reason rather than pretending it passed.

## 7. Git discipline

Git is part of the development workflow, not an optional final step.

After a meaningful completed change:

```bash
git status --short
git diff --check
git add <intended-files>
git commit -m "clear description of the change"
```

Always review what is staged before committing. Do not use `git add .` blindly when the repository contains unrelated work; stage the intended files explicitly.

Do not rewrite, squash, reset, or discard unrelated user work without explicit instruction.

Commit messages should describe the software change, not the tool, model, assistant, IDE, or agent used to make it.

**Agent names that must NEVER appear in commit messages, code comments, implementation notes, generated files, or documentation:**

- CodeBuff
- FreeBuff
- Claude Code
- Cursor
- Vibe
- Codex
- Grok
- Aider
- Copilot
- Windsurf
- Roo
- Cline
- Amp
- Any other AI tool or model name

The same rule applies to future tools with the same role: keep the repository history about the code and engineering decision, not about which agent happened to perform the edit.

## 8. Skill usage

When a reusable workflow exists, prefer the corresponding skill instead of recreating the procedure from scratch.

The `skill-creator` skill is the standard workflow for creating or evolving reusable skills. Keep reusable skills portable, versioned, and independent of a particular model or coding client.

## 9. Communication

At the end of a substantial task, report:

- what changed;
- what was validated;
- any remaining uncertainty or skipped checks.

Keep descriptions factual and tied to the repository. Do not add marketing language about the development tool used.

---

# EveryAIOS — Project-Specific Instructions

> The sections below are specific to this repository. Sections 1–9 above are universal.

## 10. Architecture (4 layers)

```
L4  COCKPIT           ui/ — React 19 + Zustand 5 + Tailwind 4
        ↓ Tauri IPC: nativeCall("<cmd>", args)
L3  Tauri Shell        src-tauri/ — thin Rust shell, 46 *_cmds.rs modules
        ↓ direct Rust calls
L2  Rust Kernel        crates/everyaios-* — guard/vault/audit/office/browser
        ↓ stdio JSON-RPC 2.0, [u32 LE len][JSON] framing
L1  Bun Sidecar        packages/coordinator — LLM turn loop
        ↓ ACP/MCP/CDP
L0  External Agents    Claude Code, Codex, OpenCode, MCP servers, Chrome
```

### The One Invariant

**The sidecar proposes; the Rust core disposes.** Every mutating effect requires an authorization ticket minted in Rust. Provider API keys never leave the vault. This is enforced structurally, not by convention.

## 11. Development Commands

```bash
# Build (requires: Rust 1.98+, Node 22+, Bun, pnpm 11+)
cargo build                       # Rust kernel
pnpm install                      # JS workspace
pnpm --filter @personal-ai/coordinator build  # Sidecar

# Test
cargo test                        # All Rust tests
cargo test -p everyaios-core      # Single crate
pnpm test                         # All JS tests

# Typecheck
cargo clippy                      # Rust lint
pnpm --filter ui tsc --noEmit     # UI typecheck

# Code Graph (AST-based analysis)
. .venv/bin/activate
python3 .agents/skills/codebase-intelligence/scripts/codegraph.py index
python3 .agents/skills/codebase-intelligence/scripts/codegraph.py report
python3 .agents/skills/codebase-intelligence/scripts/codegraph.py query "symbol_name"
python3 .agents/skills/codebase-intelligence/scripts/codegraph.py path <from> <to>
python3 .agents/skills/codebase-intelligence/scripts/codegraph.py stats
python3 .agents/skills/codebase-intelligence/scripts/codegraph.py export --format graphml

# Codebase Map (narrative + exhaustive file inventory)
node scripts/gen-codebase-map.mjs            # regenerate CODEBASE-MAP.md
node scripts/gen-codebase-map.mjs --check    # exit 1 if stale (CI gate)
```

**Staleness checks:** both tools support a `--check` mode that exits non-zero
when the output is stale.  Run them after substantial structural changes (new
files, moved modules, renamed crates) to keep the indexes accurate.

See `.agents/README.md` for the agent kit layout, `.agents/docs/` for the understanding
protocol and provider matrix, and `.agents/skills/codebase-intelligence/SKILL.md` for the
skill's routing contract.

## 12. File Structure

```
crates/                          # 22 Rust crates (the kernel)
  everyaios-core/                #   Orchestrator: supervisor, worktrees, CUA, tools
  everyaios-guard/               #   Guard-1/2: netfloor, pathfloor, tickets, sandboxes
  everyaios-memory/              #   RRF fusion, ACT-R, compaction, graph
  everyaios-blueprint/           #   Task DAG, checkpoints, skill store, subagents
  everyaios-browser/             #   a11y snapshot, refs, actions, CDP
  everyaios-catalog/             #   models.dev sync, provider seed, routing
  everyaios-storage/             #   Work-stealing walker, dedup, FTS5
  everyaios-codeintel/           #   LSP, SCIP, repo-map PageRank
  everyaios-office/              #   IronCalc XLSX, OOXML patchers
  everyaios-desktop/             #   Desktop automation (CUA)
  everyaios-vault/               #   Encrypted key vault
  everyaios-acp/                 #   Agent Communication Protocol
  everyaios-mcp/                 #   MCP server/client

packages/                        # 11 TypeScript packages (the sidecar)
  coordinator/                   #   LLM turn loop, IPC handler
  core-ai/                       #   AI runtime, streaming, retrieval
  core-providers/                #   Provider management, vault
  core-tools/                    #   Tool definitions
  core-memory/                   #   Memory system
  core-connectors/               #   Connector framework
  core-search/                   #   Search engine

ui/                              # React 19 SPA (the cockpit)
src-tauri/                       # Tauri v2 shell (thin Rust layer)
ARCH/                            # Architecture docs (00–17)
deploy/                          # Docker, systemd, launchd, Fly.io
scripts/                         # CI gates, codegen, tools
```

## 13. Coding Conventions

### Rust
- Edition 2024 (`edition = "2024"`)
- Public items get `///` doc comments with a first-sentence summary
- Modules get `//!` module-level docs
- Use `anyhow::Result` for error propagation, `thiserror` for custom errors
- Tests live in `#[cfg(test)] mod tests` at the bottom of the file, or in `tests/` for integration tests
- Prefer `tokio` async runtime

### TypeScript
- Strict mode enabled
- Use `interface` over `type` for object shapes
- Export named items (not default exports)
- Tests use Vitest (`describe`/`it`/`expect`)
- Prefer `const` over `let`

### IPC Contract
- Tauri commands: `#[tauri::command]` in `src-tauri/src/*_cmds.rs`
- UI calls: `nativeCall("<cmd>", args)` — **not** raw `invoke()`
- Protocol version: `1` (both sides must match)

## 14. Testing Conventions

- Rust: `cargo test` runs all unit + integration tests
- TS: `pnpm test` runs Vitest suites
- Integration tests in `crates/*/tests/` use `acceptance_*` prefix
- UI tests in `ui/src/**/*.test.tsx` use DOM testing library
- Security tests: `scripts/e2e/security-gate.mjs`
- Live tests require env var: `EVERYAIOS_LIVE_TEST=1`
- CI runs all tests on every PR; no merging with failing tests

## 15. Security Rules

- Provider API keys live ONLY in the Rust vault (`everyaios-vault`)
- The sidecar NEVER holds credentials
- All outbound network goes through Guard-2 (`everyaios-guard`)
- Path traversal is blocked by `pathfloor` (Guard-2)
- SSRF is blocked by `netfloor` (Guard-2)
- Sandboxed execution via `sandbox` (Guard-2)
- Audit trail: every mutating operation is logged to `everyaios-audit`
