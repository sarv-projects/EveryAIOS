# 32 — Context-Mode Deep-Dive + The Tokenmining Principle

> Fetched live 2026-08-06. `mksglu/context-mode` was previously logged at **~1.8K⭐ / "confirmed"** (docs 24/25) — it has since **exploded to 19,654⭐** (HN #1, 570+ pts; "used across teams at" Microsoft/Google/Meta/Amazon/NVIDIA/…). Full re-read this pass: README (all sections), npm registry (`context-mode` v1.0.169), `package.json`, LICENSE. ⚠️ GitHub API rate-limited — no source files pulled; claims from README/npm only (🟦 structure-verified).
> ⚠️ **License: Elastic License 2.0 (ELv2)** — source-available, NOT OSI. Cannot provide as hosted/managed service, cannot remove license. **Learn the architecture, don't copy code** (same treatment as glyphdown, doc 31 §2).

> 🔗 **Repo:** https://github.com/mksglu/context-mode (19,654⭐, ELv2, npm: `context-mode` v1.0.169)

## §0 The tokenmining principle (user's framing — adopted as design doctrine)

> **Tokenmining — maximizing intelligence per token.**
> 1. **Retrieve instead of preload** — index, don't dump; pull only what's relevant at the moment it's needed.
> 2. **Compress instead of repeat** — dedupe, densify, cache; never re-send what already exists.
> 3. **Structure instead of narrate** — program the analysis (emit values), don't make the model read raw data into context.
> 4. **Spend tokens where reasoning actually matters** — don't waste context on raw payloads, filler, or brevity games; reserve it for genuine cognition.

Every member of the compression family (doc 31) + context-mode (this doc) maps onto these four rules. Rule 3 has a production-grade name now: **"Think in Code"** (§4). Rule 4 has a critical empirical warning: aggressive brevity prompts *degrade* benchmarks (§5).

## §1 What context-mode is

**npm:** `context-mode` v1.0.169 — *"MCP plugin that saves 98% of your context window. Works with Claude Code, Gemini CLI, VS Code Copilot, OpenCode, and Codex CLI. Sandboxed code execution, FTS5 knowledge base, and intent-driven search."* (README adds JetBrains Copilot, GitHub Copilot CLI, OpenClaw gateway → **17 supported clients**.) Node ≥ 22.5 (or Bun). Deps: `@modelcontextprotocol/sdk`, `better-sqlite3` (+ `bun:sqlite` / `node:sqlite` auto-select), `@mixmark-io/domino` + `turndown`/`turndown-plugin-gfm` (HTML→Markdown), `zod`, `@clack/prompts`.

**The problem it solves (their numbers):** a Playwright snapshot = 56 KB, 20 GitHub issues = 59 KB, one access log = 45 KB → *"after 30 minutes, 40% of your context is gone"* — and when the agent compacts to free space, it *forgets which files it was editing, what tasks are in progress, what you last asked for*.

### The 4-sided solution (README §The Problem / How It Solves It)
1. **Context Saving** — *sandbox tools keep raw data out of the context window.* **315 KB → 5.4 KB (98% reduction).**
2. **Session Continuity** — every file edit, git op, task, error, user decision tracked in SQLite; on compaction it doesn't dump data back — it **indexes events into FTS5 and retrieves only what's relevant via BM25**. Fresh session = clean slate (data deleted immediately unless `--continue`).
3. **Think in Code** — *"The LLM should program the analysis, not compute it. Stop treating the LLM as a data processor, treat it as a code generator."* One script replaces ten tool calls, 100× context saved. Mandatory paradigm across all 17 clients + OpenClaw gateway.
4. **No prose-style enforcement** — it never dictates how the model *writes*; routing stays focused on *where data goes*. Explicit warning: *aggressive brevity prompts degrade coding/reasoning benchmarks* (cites Moonshot kimi-k2.5 via opencode#20258). ⚠️ **Direct contrast to terse's full-level pronoun/article stripping (doc 31 §3) — this repo argues the model's *final answers* shouldn't be terse-prompted at all.**

## §2 Benchmarks (their table — README §Benchmarks, 21 scenarios in BENCHMARK.md)

| Scenario | Raw | Context | Saved |
|---|---|---|---|
| Playwright snapshot | 56.2 KB | 299 B | 99% |
| GitHub Issues (20) | 58.9 KB | 1.1 KB | 98% |
| Access log (500 requests) | 45.1 KB | 155 B | 100% |
| Context7 React docs | 5.9 KB | 261 B | 96% |
| Analytics CSV (500 rows) | 85.5 KB | 222 B | 100% |
| Git log (153 commits) | 11.6 KB | 107 B | 99% |
| Test output (30 suites) | 6.0 KB | 337 B | 95% |
| Repo research (subagent) | 986 KB | 62 KB | 94% |

**Full session: 315 KB → 5.4 KB; session time ~30 min → ~3 hours.**

## §3 The Knowledge Base mechanics — ⭐ steal-as-spec (all from README §How the Knowledge Base Works)

- **Ingest:** `ctx_index` chunks Markdown **by headings, keeping code blocks intact** → SQLite **FTS5** virtual table (`bun:sqlite` / `node:sqlite` ≥22.5 / `better-sqlite3` auto-selected at runtime).
- **BM25 ranking** + **Porter stemming** at index time ("running/runs/ran" same stem); **titles & headings weighted 5×** in scoring for navigational queries.
- **Reciprocal Rank Fusion (RRF):** two parallel strategies merged — (a) FTS5 porter-stem MATCH + (b) FTS5 **trigram substring** ("useEff"→"useEffect", "authenticat"→"authentication"). A doc ranking well in *both* surfaces higher. *Replaces the old cascading-fallback (trigram only if porter returned nothing).*
- **Proximity Reranking:** multi-term queries re-ranked so adjacent terms ("session continuity") beat paragraphs-apart matches.
- **Fuzzy Correction:** Levenshtein typo correction before re-search ("kuberntes"→"kubernetes").
- **Smart Snippets:** returns *windows around matched terms* (intelligent extraction), not first-N-characters truncation.
- **TTL Cache:** per-project SQLite at `~/.context-mode/content/`; default TTL 24h (per-call override); cache hit returns a ~0.3 KB hint instead of a 48 KB+ fetch; `ttl: 0` / `force: true` bypasses; **14-day cleanup** on startup; `--continue` preserves indexed docs across restarts; `ctx_stats` reports hits/data-avoided/network-saved.
- **Progressive Throttling:** calls 1–3 → 2 results/query; 4–8 → 1 result + warning; 9+ → blocked, redirect to `ctx_batch_execute`.
- **`ctx_fetch_and_index`:** fetch URL → HTML→Markdown (domino + turndown) → chunk → index. **The raw page never enters context.** `contentType` filter (code vs prose).

This is **Phantom Thread (0ms pre-load) + Spreading-Activation (docs 03/25 §PageIndex) made practical**: a local FTS5 index + BM25/RRF retrieval instead of dumping content. Note the elegant inversion: PageIndex (doc 25) does retrieval *without* vectors; context-mode does retrieval *with pure SQLite FTS5* — no embedding models, no vector DB. **Our read:** two independent production systems now show the default retrieval layer need not be vector-based — embeddings stay reserved for the graph-relational layer (doc 03 §4), not everyday recall.

## §4 "Think in Code" — the paradigm (Rule 3, production-grade)

```js
// Before: 47 × Read() = 700 KB.  After: 1 × ctx_execute() = 3.6 KB.
ctx_execute("javascript", `
  const files = fs.readdirSync('src').filter(f => f.endsWith('.ts'));
  files.forEach(f => console.log(f + ': ' + fs.readFileSync('src/'+f,'utf8').split('\n').length + ' lines'));
`);
```

**This is doc 03 §7's Autonomous Code-Interpreter REPL in the wild** — and the same philosophy as GenOffice's deterministic-planner (doc 28 §5: compute locally, only the result crosses the model boundary) and IronClaw's Orchestrator (doc 30 §2). Our executor layer should make `ctx_execute`-style sandboxed eval a **first-class tool with a routing nudge** (see §5), exactly as context-mode does across all 17 clients.

## §5 The platform/hook integration model — ⭐ steal-as-spec

**Architecture:** one `context-mode` binary = MCP server + per-platform **hooks** + a **routing block** injected into agent instructions. Per-client configs ship in `configs/<platform>/` (settings.json, hooks.json, `GEMINI.md` / `copilot-instructions.md` routing files).

**Hook coverage (the full event surface):** `PreToolUse`/`BeforeTool` → `PostToolUse`/`AfterTool` → `PreCompact`/`PreCompress` → `SessionStart` → `userPromptSubmitted` → `agentStop`.

**Routing Enforcement (the key design detail):**
- The BeforeTool **matcher targets only tools that produce large output** (`run_shell_command`, `read_file`, `read_many_files`, `grep_search`, `search_file_content`, `web_fetch`, `activate_skill`) + its own tools — *"avoids unnecessary hook overhead on lightweight tools while intercepting every tool that could flood your context window."*
- **Routing instructions** (a skill/instructions file copied into the agent's instructions: `GEMINI.md`, `copilot-instructions.md`) give the model "full awareness" of *where data should go* — i.e. **nudge, don't force**; the model still decides.
- **Fail-open hooks** ("they do not block your tools") + platform auto-detection via MCP `clientInfo.name` (not bare dir presence, to avoid mis-detecting co-installed but unconfigured CLIs).
- **Ops UX:** `context-mode doctor` (diagnose hook + MCP registration), `ctx stats` (in-chat), `context-mode upgrade` (writes hooks file only), `context-mode hook <platform> <event>`.

**Steal for us:** our connector/channel layer (doc 03 §3, ZeroClaw's channels) should adopt exactly this pattern — hook-matchers keyed to *output-producing tools*, a routing-instructions file that nudges where data goes, and fail-open everywhere. It's the cleanest "plugin into an existing agent" interface we've seen — and it's how we'd integrate with Claude Code/Copilot/Codex as *clients* of our hub.

## §6 Security & privacy model (README §Security — their env-var surface)

Project-boundary containment · network-fetch hardening · **storage environment variables** · **routing-guidance environment variables** (per-project, per-key). Local-first (everything in `~/.context-mode/`). Nothing here contradicts our doc 03 §8 trust model — worth mirroring the env-var config surface (vs. only TOML).

---

## §7 Synthesis — the full tokenmining framework (docs 31 + 32 + prior)

| Rule | Mechanism | Source repos |
|---|---|---|
| **1. Retrieve instead of preload** | Local FTS5 KB (BM25+porter stem+trigram+RRF+proximity+fuzzy+smart snippets+TTL) · session-continuity event index · PageIndex tree-optimized retrieval (no vectors!) · Phantom Thread warm sets | context-mode · PageIndex (doc 25) · EverOS (doc 30) |
| **2. Compress instead of repeat** | Live-zone codec preserving KV-cache prefixes (headroom CCR) · tool-dedup (Janus A) · session dedup (glyphdown) · RRF/trigram cache · per-tool verbatim rules (terse) | headroom · Janus · glyphdown · terse (docs 22/31) |
| **3. Structure instead of narrate** | **Think in Code**: sandboxed `ctx_execute` script-eval, only results cross the boundary · GenOffice deterministic DSL (set A1 to 42) · IronClaw per-job auth orchestrator · repomix strip-comments token counting | context-mode · GenOffice (doc 28) · IronClaw (doc 30) · repomix (doc 31) |
| **4. Spend tokens where reasoning matters** | Keep raw payloads out (98% saved) · **no prose-style enforcement on final answers** (brevity prompts degrade benchmarks — kimi-k2.5/opencode#20258) · zero-token crystallization of deterministic steps | context-mode · GenOffice deterministic-planner (doc 28) · doc 03 §7 |

**The sharpest new insight this batch (Rule 4):** context-mode explicitly argues *against* terse-style pronoun/article stripping on **final answers** — the "savings" there can measurably hurt reasoning. The token savings must come from **where data goes** (rules 1–3), not **how the model talks**. That's a design constraint we should bake into our compaction layer: compress inputs/retrievals aggressively, leave generation style alone.

---

## §8 Honest gaps
- ⚠️ No source files read (API rate-limited) — the `ctx_execute` sandbox implementation (how code is isolated) and the routing-blocks' exact text are README-level only. ELv2 also means we can't legally borrow the npm code even for reference implementation details — architecture is what we take.
- "17 clients" and team badges are README claims, not independently verified.
- Benchmarks are self-published (21 scenarios in BENCHMARK.md, not re-read).
- Prior docs' "~1.8K" star figure now stale — ledger updated this pass to **19,654** (live scrape).

*No ledger count change (context-mode already tracked); row upgraded: stars 19,654, depth 🟦, ELv2 flagged, doc refs → 10/25/32.*
