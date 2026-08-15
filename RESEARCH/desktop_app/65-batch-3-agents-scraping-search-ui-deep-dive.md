# Doc 65 — Batch 3: Agent Infra, Scraping, Search & UI Deep-Dive

**Date:** 2026-08-15
**Scope:** The 37-repo list (AI-agent infra / web automation / data extraction / vector+lexical search / UI & docs / misc).
**Method:** every repo verified live via GitHub API; 11 source-read (cloned + code-level), 8 web-level (README/architecture), 18 classified against the 255-repo ledger (already tracked → verdict unchanged).
**Result:** 19 repos are **new to the ledger** (previously 0 doc mentions); 18 are already tracked. 8 carry concrete steal candidates; the rest are REF (validate an existing row) or SKIP (nothing to take).

---

## §0 — Verdict summary (19 new + 18 already-tracked)

| # | Repo | Verdict | Maps to | Key steal / note |
|---|------|---------|---------|------------------|
| 1 | `getagentseal/codeburn` | **STEAL** | A9, J11, P6 | 45-provider usage-parser registry + turn classifier + model-efficiency metrics |
| 2 | `D4Vinci/Scrapling` | **STEAL** | G8, E14, F11 | adaptive auto-selector + Camoufox fingerprints + resource-drop |
| 3 | `xerj-org/xerj` | **REF** | I7, C5 | tree-sitter autoindex (token-free code search), ES-compatible Rust engine |
| 4 | `ComposioHQ/awesome-claude-skills` | **STEAL** | I2 | canonical SKILL.md package anatomy + lazy reference loading |
| 5 | `santifer/career-ops` | **REF** | EV1, A6/A7 | weighted multi-factor A-F scoring (0.1 granularity, PASS/MARGINAL/FAIL/SKIP) |
| 6 | `sickn33/agentic-awesome-skills` | **STEAL** | I2, F8 | `skills_index.json` discovery manifest + `compose_stack` read-only validation |
| 7 | `esengine/DeepSeek-Reasonix` | already tracked | A9, P5 | (ledger 22) prefix-cache stability — re-confirmed 99.82% hit |
| 8 | `tirth8205/code-review-graph` | **STEAL** | I7, C5 | SQLite persistent graph + git-diff incremental rebuild + context-savings estimate |
| 9 | `oraios/serena` | **STEAL** | I11 | 74-LSP symbol-level MCP editing tools (safe-delete, rename, diagnostics) |
| 10 | `superset-sh/superset` | already tracked | P6, P7 | (ledger 58) isolated git-worktrees for parallel agent isolation |
| 11 | `cobusgreyling/loop-engineering` | **STEAL** | P6, J11, B6 | budget-guard + run-log + early-exit pattern registry |
| 12 | `metalbear-co/mirrord` | **REF** | P7, P11 | eBPF/LD_PRELOAD process I/O interception, no code changes |
| 13 | `asgeirtj/system_prompts_leaks` | **REF** | prompts | extracted frontier system prompts → prompt-design reference |
| 14 | `f/prompts.chat` | **SKIP** | — | community prompt collection, nothing architectural |
| 15 | `langflow-ai/langflow` | **REF** | P6, F-series | React-Flow visual component builder → blueprint canvas |
| 16 | `ChatGPTNextWeb/NextChat` | **SKIP** | — | chat UI (we own our Tauri UI) |
| 17 | `lobehub/lobehub` | **REF** | P6, I2 | "Chief Agent Operator": hire/schedule/report over a skill marketplace |
| 18 | `dair-ai/Prompt-Engineering-Guide` | **SKIP** | — | educational content |
| 19 | `nextlevelbuilder/ui-ux-pro-max-skill` | already tracked | I2, UI | (ledger 22) 161 rules + 67 styles + palettes → design-system reference |
| 20 | `tw93/Pake` | **REF** | Tauri shell | Tauri 2.10 wrapper + JS-injection hooks (find-in-page, OAuth external-browser) |
| 21 | `thedotmack/claude-mem` | **STEAL** | P5, C-series | observation→summary pipeline + per-observation token-cost accounting |
| 22 | `Qdrant Edge` | **REF** | P5.8 | edge-optimized qdrant variant (same family as ledger 22) |
| 23–37 | 15 repos | already tracked | — | Agent-Reach, browser-use, maxun, qdrant, SeekStorm, open-webui, n8n, AutoGPT, void, kilocode, openclaw, superpowers, hermes-agent, ruflo, Reasonix |

**Ledger delta:** 255 → **274** (19 new). No existing verdict reversed.

---

## §1 — codeburn (getagentseal/codeburn) — STEAL

Terminal token/cost tracker for AI coding. The useful parts for us are **not** the CLI but three modules:

1. **Provider usage-parser registry** — parses usage/response metadata across ~45 providers/tools (37+ first-party). This is exactly the BYOK normalization problem our A9 token-accounting layer must solve: one canonical `Usage` struct fed by per-provider parsers, mirroring our `ModelRequest/ModelResult` adapter split.
2. **Turn classifier** — buckets each turn into task categories (`test`, `git`, `build`, `install`, `debug`, `feature`, `refactor`, `brainstorm`, `research`). Maps to our P6 turn classification and to the EV1 "multi-step task completion" task-class taxonomy.
3. **Model-efficiency metrics** — `oneShotRate`, `retriesPerEdit`, `costPerEdit`. This is the *cost-vs-quality* axis our J11 cost budget and EV1 eval need (real observed behavior, not vendor claims).

**Steal spec (adapt to Rust, `everyaios-eval::usage` + `everyaios-router`):**
- `UsageParser` trait + `UsageParserRegistry` keyed by provider id, normalizing into a canonical `Usage { input, output, cache_read, cache_write, tool_calls }`.
- `TurnClass` enum (the 9 categories) attached to every agent turn for routing + eval segmentation.
- `EfficiencyMetrics { one_shot_rate, retries_per_edit, cost_per_edit }` computed over an eval run.

---

## §2 — Scrapling (D4Vinci/Scrapling) — STEAL

Adaptive Python scraping framework. Three steal candidates:

1. **Adaptive auto-selector** — generates CSS/XPath selectors from page structure rather than fixed selectors. Directly relevant to our G8 scraping tools: a read-target can be described semantically and resolved to a selector at runtime, surviving minor DOM drift.
2. **`stealth_chrome` / Camoufox fingerprints** — a fingerprint-randomization profile (browser-derived from Camoufox) for evasion. Maps to E14 behavioral realism: when our CDP driver must look human (consent walls, bot-gated sites), rotate a fingerprint profile instead of a fixed UA.
3. **Resource-drop + ad-block (3500-domain list) + proxy rotation** — reduces page weight and blocklist integration. Complements our F11 blocklists and G9 read-cleaner.

**Steal spec (adapt, `everyaios-browser` + `everyaios-cdp`):**
- `SelectorResolver` returning `Css | XPath` from a semantic target + DOM snapshot.
- `FingerprintProfile { ua, platform, webgl_vendor, canvas_noise, ... }` + rotation set.
- `ResourceDropPolicy { block_ads: Vec<Domain>, drop_media: bool, drop_fonts: bool }` feeding the CDP `Network.setBlockedURLs`.

---

## §3 — xerj (xerj-org/xerj) — REF

Rust, Elasticsearch-compatible engine with **autoindex**: tree-sitter-based code parsing → index without burning LLM tokens. FTS + vector + MCP + cluster. This validates our FTS5(+tantivy) + tree-sitter repo-map stack and confirms the direction of I7: *parse-first indexing so search never costs tokens*. No code steal (we already have the tree-sitter repo-map and FTS layer); the autoindex design is the confirmation.

---

## §4 — awesome-claude-skills (ComposioHQ) — STEAL

Canonical Claude-Skill anatomy, applicable to our **I2 skill registry**:
- `SKILL.md` (frontmatter name/description + when-to-use) + `scripts/`, `references/`, `assets/` directories.
- **Lazy-loaded references**: heavy reference material lives in separate files loaded only when the task needs them (keeps the skill's base context tiny).

**Steal spec (adapt, `everyaios-guard::skill` / skill registry):** a skill manifest schema with `when_to_use`, `scripts[]`, `references[]` (lazy), `assets[]`, enforcing that references are fetched on demand, never preloaded.

---

## §5 — career-ops (santifer/career-ops) — REF

Claude-Skills-style job-search agent (`modes/triage.md`, `deep.md`, `scan.md`, …). The reusable pattern is its **weighted scoring rubric** (verified in `modes/triage.md`):

```
global = archetype×0.30 + comp×0.25 + location×0.25 + …  → 0.1-granularity score
verdict ∈ {PASS, MARGINAL, FAIL, SKIP}   (+ hard DQ gates that force FAIL regardless of score)
```

This is the same *weighted-subscore + hard-gate + named-status* structure as our EV1 eval taxonomy (`verified/partial/blocked-correctly/failed-safely/failed-unsafely/unverifiable`) and our A6/A7 router scoring. REF — confirms the design, nothing to copy verbatim.

---

## §6 — agentic-awesome-skills (sickn33/agentic-awesome-skills) — STEAL

"AAS Core": a local, agent-first control plane for catalog discovery. Two steals:

1. **`skills_index.json` discovery manifest** — a machine-readable index (2,009-skill catalog) that agents query to discover/select skills by capability, instead of scanning directories. Maps to F8 catalog discovery.
2. **Versioned schemas + read-only `compose_stack` validation** — `stack-manifest`, `plan`, `recovery`, `selection-evidence` schemas; composing a stack is a *read-only validation* that produces evidence, never an implicit mutation. Maps to our spec-per-task + verify-gate discipline.

**Steal spec (adapt, skill registry + blueprint engine):** a `skills_index.json`-style discovery manifest; `compose_stack` validates a candidate stack against schemas and emits `selection_evidence` without side effects.

---

## §7 — code-review-graph (tirth8205/code-review-graph) — STEAL

Local-first code-intelligence graph for MCP/CLI:
1. **SQLite-backed persistent graph** (symbols/defs/refs as nodes/edges) + networkx-style analysis.
2. **git-diff incremental rebuild** — only re-index files changed since the last commit, not the whole repo.
3. **Context-savings estimation** — reports how many tokens the graph pruned from context.

**Steal spec (adapt, `everyaios-codeintel::graph`):** persistent SQLite symbol graph with incremental rebuild keyed on `git diff`; a `context_savings` counter surfaced per query (ties I7 repo-map into P5 token economics).

---

## §8 — serena (oraios/serena) — STEAL (mature reference for I11)

MCP toolkit = "the IDE for your agent". Ships a catalog of **74 language servers** and symbol-level tools: `find_symbol`, `referencing_symbols`, `find_implementations`, `find_declaration`, `get_diagnostics`, `replace_body`, `rename`, `safe_delete`. This is the mature form of our I11 code-intel cluster (hover/docs, go-to-def, references, rename-with-preview, diagnostics, code actions, inlay hints).

**Steal spec:** the *symbol-level editing* semantics our I11 lacks today:
- `safe_delete` — refuse deletion if the symbol still has references (deterministic gate before destructive edit).
- `replace_body` — swap a function body and verify it parses before writing.
- A packaged **LSP server catalog** (id, command, version, capabilities) so language support is data, not code.

---

## §9 — loop-engineering (cobusgreyling/loop-engineering) — STEAL

Pattern library + CLI for "loop engineering": `budget-guard` (enforce cost/turn budgets mid-loop), `run-log` (structured per-run record), `early-exit` (bail when a completion signal fires). A per-pattern registry schema.

**Steal spec (adapt, `everyaios-eval` / blueprint engine):** a `LoopPatternRegistry` of named patterns (budget-guard, run-log, early-exit, …) each with `triggers`, `guards`, `exit_conditions`, loaded by the coordinator loop (P6) and enforced by J11/B6 budgets.

---

## §10 — claude-mem (thedotmack/claude-mem) — STEAL

Persistent cross-session context: **observation capture → semantic summaries → context builder with token economics**. The distinctive idea is accounting per observation: each captured item carries a *token cost*, and the builder reports *saved-vs-discovered* (did injecting this memory save more tokens than it cost?).

**Steal spec (adapt, `everyaios-memory`):** per-observation `token_cost` in the memory records; a `saved_vs_discovered` metric in the context builder so memory injection is measurable, not assumed. Complements C-series compaction + P5 memory.

---

## §11 — lobehub (lobehub/lobehub) — REF

"Chief Agent Operator": hires agents from a 273K skill marketplace, schedules them 7×24, reports on the team. Confirms the P6 coordinator/planner model (our coordinator already plans→delegates→verifies). REF — the *hiring/scheduling/reporting* framing is a useful UX lens for the multi-agent dashboard, not a code steal.

---

## §12 — Pake (tw93/Pake) — REF

Tauri 2.10 wrapper: turns any webpage into a desktop app with JS-injection hooks — OAuth-pattern detection (open external browser), find-in-page, fullscreen, theme, multi-window, tray. We already use Tauri; the reusable bits are the **JS-injection hook patterns** (in-page find, external-browser OAuth) for our webview surfaces. REF.

---

## §13 — mirrord (metalbear-co/mirrord) — REF

Injects into a local process (eBPF/LD_PRELOAD, no code changes) and intercepts I/O — traffic mirror/steal, env, DNS, files — as if it ran inside a remote k8s pod. Relevant to P7 observability (process I/O interception) and P11 remote-env. REF — the interception technique is a pointer for a future `everyaios-guard::sandbox` syscall-meditation layer; the k8s coupling is out of scope.

---

## §14 — langflow (langflow-ai/langflow) — REF

Low-code React-Flow visual builder (drag-drop components → LangChain/LangGraph, MCP server export). Confirms the blueprint-canvas direction for P6/F-series. REF — component+edge graph is the right UI model; we won't adopt its Python/LangChain runtime.

---

## §15 — SKIP (no steal)

- `f/prompts.chat` — prompt collection.
- `ChatGPTNextWeb/NextChat` — chat UI (we own our Tauri UI).
- `dair-ai/Prompt-Engineering-Guide` — educational guide.
- `asgeirtj/system_prompts_leaks` — REF only: extracted frontier system prompts, useful as a prompt-design reference when authoring our canonical intents, no code.
- `Qdrant Edge` — REF: edge qdrant variant; same family already tracked.

---

## §16 — Landing map (new steals → SPEC/ARCH/TODO rows)

| Steal | New/extended row | Note |
|-------|------------------|------|
| codeburn usage-parser registry + turn class + efficiency | **A9 extended** (usage-parser registry) + **J11** (cost/quality) | pure-Rust core candidate |
| Scrapling auto-selector + fingerprints + resource-drop | **G8 extended** (selector resolver) + **E14** (fingerprint profile) + **G9** (blocklist feed) | browser crate |
| xerj autoindex | I7 (confirmation only) | no new row |
| awesome-claude-skills SKILL.md anatomy | **I2 extended** (lazy references) | skill registry |
| career-ops weighted rubric | EV1 (confirmation only) | no new row |
| agentic-awesome-skills skills_index.json + compose_stack | **F8 extended** (discovery manifest) + I2 | skill registry |
| code-review-graph persistent graph + incremental rebuild | **I7 extended** (SQLite graph + git-diff rebuild) | codeintel crate |
| serena symbol-editing tools (safe-delete) | **I11 extended** (safe-delete, replace-body, LSP catalog) | codeintel crate |
| loop-engineering pattern registry | **P6 extended** (loop pattern registry) | blueprint engine |
| claude-mem per-observation token cost | **P5 extended** (saved-vs-discovered metric) | memory crate |
| lobehub CAO / langflow / Pake / mirrord | REF (no new rows) | — |

---

## §17 — Honest status

- **19 new repos** entered the ledger; **8 steals** identified, all mapped to existing rows (no scope expansion — every steal *extends* a row we already own).
- Steals are **spec-level** in this doc; implementation is queued behind the currently-open wiring items (coordinator loop, skill registry, A9 dashboard, G8/G9 browser tools).
- Nothing is marked DONE here — this doc records what to build and where it lands.
