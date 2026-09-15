# Doc 90 — Native agent peer schemas & loops (2026-09-15)

> **Purpose:** research provenance for **ARCH/17-NATIVE-AGENT.md** (frozen spec v3.75; the nine native-plane rows landed as first-class capabilities in spec v3.76). This is the pass that asked: *what does each leading agent actually expose as tools and loops, so EveryAIOS Native can adopt the schemas/invariants — without copying product behavior we cannot observe at runtime?*
> **Evidence grade:** **DOC-VERIFIED** = the vendor's own documentation page was located and its content checked (titles/snippets). **REPO-VERIFIED** = this repository's own code (the only source of truth for what EveryAIOS already has). **No source clones in this pass** — unlike docs 55/64/67, nothing here was cloned and read line-by-line; treat every external claim below as documentation-level, not code-level.
> **Outputs:** `ARCH/17-NATIVE-AGENT.md` (new) · spec §4.6 (new) · `TODO.md` **P64** (10 rows) · `ARCH/00-INDEX.md`.
> **Ledger:** 0 new repos — all six sources were already tracked (docs 05, 46, 51, 69, 83, 86).

## 1. Sources and what was actually verified

| Source | Doc | Grade | Verified |
|---|---|---|---|
| Claude Code tools reference | `code.claude.com/docs/en/tools-reference` | DOC-VERIFIED | Native tool set (Read · Write · Edit · Bash · Glob · Grep · WebFetch · WebSearch), per-tool permission requirements, subagents with their own `tools` field, session resume |
| Codex CLI app-server | `learn.chatgpt.com/docs/app-server` | DOC-VERIFIED | JSON-RPC 2.0 over stdio, bidirectional notifications, threads/turns/review/MCP surface; sandbox + approval modes |
| Cline tools reference | `docs.cline.bot/tools-reference/all-cline-tools` | DOC-VERIFIED | `read_file` · `replace_in_file` · `write_to_file` · `search_files` · `list_files` · `execute_command` · `browser_action` · `ask_followup_question` · `attempt_completion` · `list_code_definition_names` · `use_mcp_tool` · `new_task` |
| Aider edit formats | `aider.chat/docs/more/edit-formats.html` | DOC-VERIFIED | `diff` · `diff-fenced` · `udiff` · `whole` · `editor-diff` · `editor-whole` · `editor-diff-fenced`; tree-sitter repo map |
| SWE-agent ACI | arXiv 2405.15793 + `swe-agent.com` command docs | DOC-VERIFIED | `open` with fixed 100-line windows + line numbers as edit targets; bounded `search_file`/`search_dir`; `edit`; `submit` |
| Hermes agent | doc 02 provenance | REPO-VERIFIED (via doc) | `SOUL.md` pre-insertion persona scan, `skills_save`-style procedural retention, `DELEGATE_BLOCKED_TOOLS` |
| **This repository** | `everyaios-core::tools::ToolRegistry`, `coordinator/*`, `everyaios-blueprint/subagent.rs` | **REPO-VERIFIED** | The schema system and the actual gap list in ARCH/17 §17.10 |

## 2. Adopted (with the exact rule we took)

| Adopted | Rule | Lands in |
|---|---|---|
| Single-occurrence exact edit | If an exact match is ambiguous (0 or >1 occurrence), **refuse and ask for more context** — never guess | P64.5 |
| Order-invariant fuzzy multi-hunk patch | A *fallback* after exact matching, for brittle whitespace/ordering cases | P64.5 |
| Edit-format ladder | Represent edits as a format ladder (exact → structured → fuzzy) rather than one algorithm | P64.5 |
| Bounded-window reads | Hand the model fixed line windows with line numbers as edit targets (SWE-agent ACI), not whole files | P64.3 / native `read_window` |
| Repo map (tree-sitter + PageRank) | Rank symbols/files by graph relevance and **fit to a token budget** before injection | P64.3 |
| Shadow verification | Preflight edits (LSP/tests/typecheck) in a shadow tree **only where risk warrants** — not on every write | P64.6 |
| Permission modes / subagent tool sets | Sub-agents get an explicit, narrowed tool set; parent withholds (`DELEGATE_BLOCKED_TOOLS`) | already Rust (`subagent.rs`) + P64.4 |
| App-server seam | Integrate an external agent through its process/JSON-RPC seam — never assume a GUI product's capabilities | ARCH/17 §17.1 policy |
| `model-visible means logged` | Any context block the model can see must be reconstructable from the trace | already `assertAllLogged()` |

## 3. Rejected (and why)

| Rejected | Why |
|---|---|
| Replacing an external agent's native toolset with EveryAIOS tools | Removes capability the user chose; the integration seam may not even expose it |
| Augmenting capabilities that exist only inside a separate GUI product | Not reachable at runtime — would be a claim we cannot verify |
| A flat catalog dump (tens of primitives) into any agent | The proposal's own anti-pattern: selection confusion, context pollution, permission flattening |
| Making every loop phase a tool (`replan`/`reflect`/`checkpoint`/`verify` as tools) | They are loop phases; exposing them adds latency and context with no capability |
| Generating executable skills from model output without validation | Must pass a candidate → manifest + tests → stored pipeline first |
| Asserting benchmark/cache percentages from peers | No primary source; flagged unverifiable in doc 51 already |

## 4. The honest position this pass establishes

EveryAIOS Native is not *behind* the peers on architecture — the two-plane model and the schema registry already exist in this repo. What is missing is **wiring**, and that is now enumerated as `TODO.md` **P64.1–P64.10** with a named owning module and a gate for each. No new subsystem is proposed; no peer product behavior is copied.
