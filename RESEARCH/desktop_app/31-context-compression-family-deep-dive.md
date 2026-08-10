# 31 — Context-Compression Family Deep-Dive: Headroom · Glyphdown · Terse · Janus · DarwinCaveman · Repomix

> Fetched live 2026-08-06. Theme of this batch: **token reduction & context compaction** — the exact pillar doc 03 §7 calls *Lossless Prompt Compaction & System Daemons* (and doc 20/23's `rtk` bash-output cut). Headroom was already deep-dived (docs 22 §A / 24 — ⬛); this pass re-verifies it + deep-reads the 5 new repos.
> Depth: **glyphdown / terse / Janus / repomix 🟦 structure-verified** (full README + deps read); DarwinCaveman 🟩 (README + app.py read — it's a 50-line FastAPI app); ⚠️ GitHub API rate-limited — no file trees pulled; all claims from READMEs, `package.json`, `LICENSE` files fetched this pass.

> 🔗 **Repos:** https://github.com/headroomlabs-ai/headroom · https://github.com/MikkoParkkola/glyphdown · https://github.com/AlexChen31337/openclaw-plugin-terse · https://github.com/AP3008/Janus · https://github.com/yamadashy/repomix · https://github.com/tarek-clarke/DarwinCaveman

## §0 The set

| Repo | ⭐ | License | What it is | Fit in our compaction stack |
|---|---|---|---|---|
| headroomlabs-ai/headroom | 65,131 | (MIT-ish, per docs 22/24) | Context-compression **layer** — library · proxy · MCP · content-aware compressors, local-first, reversible | Already ⬛ (doc 22 §A) — re-verified, star +3 |
| MikkoParkkola/glyphdown | 1 | ⚠️ **PolyForm Noncommercial** | Claude Code plugin — **lossless symbolic dialect** transcoder (GLYPHDOWN-L1) + tool-output codec | 🔥 **Learn the concept** (lossless reversible dialect); cannot copy code |
| AlexChen31337/openclaw-plugin-terse | 0 | MIT | OpenClaw plugin — regex compression hooks on tool output, 50–85% cut | 🔥 **Copy config schema wholesale** |
| AP3008/Janus | 3 | MIT | Rust **Anthropic API proxy** — dedup → regex → tree-sitter AST prune → semantic cache | 🔥 **The proxy architecture** for doc 03 §7 |
| yamadashy/repomix | 27,665 | MIT | Repo→single-file packer (CLI/website/VS Code/browser ext/MCP) | 🔥 **Repo-wide context ingestion** (doc 03 §7) |
| tarek-clarke/DarwinCaveman | 0 | MIT | "Caveman" output + local-LLM decode-back | 🟠 Output-side decompression trick |

---

## §1 Headroom (65,131⭐ — ⬛ already; this-pass re-verify)

**Status:** fully covered in doc 22 §A (repo **and** docs.headroomlabs.ai researched) + doc 24. No re-read of internals needed. Fresh README tagline confirms positioning: *"60–95% fewer tokens (for JSON data), 15–20% fewer tokens (for coding agents) · library · proxy · MCP · content-aware compressors · local-first · reversible."* Ledger star updated 65,128 → 65,131. **New cross-ref:** headroom's `proxy` form is the same shape as Janus §4 below — a local intercepting proxy — and its SmartCrusher/CCR design (live-zone-only compression to preserve KV-cache prefixes) is the production-grade answer to Glyphdown §2's "don't fight the cache" insight.

---

## §2 Glyphdown (1⭐, ⚠️ PolyForm Noncommercial — learn, don't copy)

**The most interesting *concept* in this batch.** A Claude Code plugin that lowers token cost "without changing what the agent can see" — **lossless by meaning**, **fail-open** (any error passes original through untouched), fast (prebuilt **native binary ~5ms** hot path, Python fallback ~170ms). Dogfooded in production daily by the author.

### Measured numbers (their table — "figures are measured, not asserted")
| Measure | Reduction |
|---|---|
| Tool-heavy session corpus (52 real fixtures) | **−31.7%** (85,405 → 58,347 tokens) |
| Large `Bash` dumps | **−71.1%** |
| Instruction prose in GLYPHDOWN-L1 dialect | **−44.6%** (every cached system-prompt call) |
| Network calls / data leaving machine | **0** — 100% local |

### The hook points (6 per README; 4 shown in its flowchart) — all fail-open: `{"continue": true}` on error
`UserPromptSubmit` (mode detector) → `PreToolUse` (history dedup) → tool runs → `PostToolUse` (codec + session dedup) → `PreCompact` (dense-form mandate) → reply. **Reply itself is never compressed.**

### ⭐ GLYPHDOWN-L1 — the crown-jewel concept
A **lossless prose↔dense transcoder**: rewrites verbose instruction-style prose (system prompts, `CLAUDE.md`, skills) into a compact symbolic dialect the **same model decodes natively**, then expands back **byte-for-byte**:
```
expand(compress(x)) == x    # byte-identical for dialect content; unknown text passes through
```
- **Why it matters:** the system prompt ships on *every* request → this is the only *always-on, every-call* saving (−44.6%).
- **Model-specific dialects** are a **data file** loaded at runtime (`GLYPHDOWN_DIALECT`) — no rebuild, lossless self-check on load. (Tokenizers differ per model.)
- **Cache stacking (the key insight):** it does **not** fight Anthropic's prompt cache — native caching discounts the *stable prefix* (system prompt + tools); Glyphdown shrinks (a) the *turn-to-turn traffic that never caches* (tool results, history, compaction) and (b) the *dense form of what does cache*. The two **stack**, not compete.

**Steal for us (concept, not code — license):** a reversible symbolic dialect for our system prompt + memory headers. Our SQLite memory layer can store both the dense form (for injection) and the original (for display/retrieval fidelity). This is also the missing piece that makes "KV-cache-friendly memory" (doc 03 §4) concrete.

---

## §3 openclaw-plugin-terse (0⭐, MIT) — the config schema to copy

OpenClaw plugin: **regex-based compression hooks** that compress verbose tool output (`exec`, `read`, `process`, …) *before it hits the session transcript* — preventing **compaction cascades** (context compaction removes old messages and degrades reasoning). Claims 50–85% token reduction.

### ⭐ Copy-wholesale config schema (MIT)
```typescript
terse: {
  enabled: true,
  defaultLevel: "full",            // lite | full | ultra
  maxResultChars: 8000,            // global truncation cap
  headChars: 2000, tailChars: 1000,// head/tail retention when truncating
  tools: {
    exec:       { level: "full", maxResultChars: 6000 },
    read:       { level: "lite", maxResultChars: 8000 },
    process:    { level: "full", maxResultChars: 4000, tailOnly: true }, // process logs: tail only
  },
  excludeAgents: ["main"],                 // never compress the main session
  excludeTaskPatterns: ["plan","architect","design","review","critical"],
  excludeTools: ["message","tts","image","browser"],
  subagentPrefix: true, subagentLevel: "full",  // auto-inject terse prompts into sub-agents
}
```
**Levels:** lite −50–60% (strips filler/hedging, keeps full sentences) · **full −65–75%** (strips articles/pleasantries/pronouns; `"I will check the file" → "Check file"`; **code blocks/errors/paths/URLs kept verbatim**) · ultra −75–85% (labels only, code + key-value pairs verbatim).
**The hard rule that makes it safe:** *content-based exclusion* — code blocks and error messages are **always** preserved verbatim, regardless of level.
**Benchmarks (their table):** avg ~65–75% across React-render-fix (−87%), Postgres pool setup (−84%), git-rebase (−58%), npm install (−73%), Docker build (−77%).

**Steal for us:** the whole `tools`-keyed per-tool config + `excludeAgents/excludeTools` safety rails map 1:1 onto our tool registry (doc 03 §3). MIT — can copy.

---

## §4 Janus (3⭐, MIT, Rust) — the compaction PROXY architecture

*"An LLM token compression proxy for the Anthropic API. Janus sits between your application and Claude, intelligently compressing requests…"* (1× GenAI Genesis Winner, Google Sustainability Hack). **This is doc 03 §7's lossless-compaction proxy, fully built.**

### Pipeline (4 stages, all toggleable in `janus.toml`: `tool_dedup` / `regex_structural` / `ast_pruning` / `semantic_trim`)
- **Stage A — Tool-Result Dedup:** tracks tool outputs per session; identical repeat → short placeholder.
- **Stage B — Regex Structural** (5 sub-stages): B1 docstring removal (Python/JSDoc/Rust), B2 comment stripping, B3 whitespace normalization, B4 **stack-trace condensation**, B5 repeated-block dedup.
- **Stage C — AST Pruning:** **tree-sitter** parses code blocks (Python/JS/Rust/Go), removes functions unlikely relevant to the current query — only above a configurable line threshold.
- **Stage D — Semantic Trim:** trims content by semantic relevance (the 4th pipeline stage; per `janus.toml` `semantic_trim = true`).
- **Separate layer — Semantic Cache (on top of the pipeline, per README diagram):** Redis + **RediSearch vector similarity**; semantically-similar requests return cached responses, skipping the upstream call. Embeddings via **fastembed BGE-small-en-v1.5 (384-d)**, cutoff 0.85, TTL 1h.

### Stack (read from README)
Rust · Tokio · **Axum** · **Ratatui TUI dashboard** (real-time metrics) · tree-sitter · fastembed · Redis/RediSearch · **tiktoken-rs** · xxhash · Docker compose.

**Steal for us:** the A→B→C→D ladder is our compaction pipeline spec (doc 03 §7). We'd adapt: Stage C's "query-relevance AST pruning" is exactly the *Repository-Wide Code Engineering* pre-filter we want before sending repo code to a model; Stage D's local-embedding semantic cache (BGE-small via fastembed) is a cheap win on repeated queries. TUI metrics dashboard pattern also matches our token-streamer analytics (doc 03 §1).

---

## §5 DarwinCaveman (0⭐, MIT) — output-side decompression

**The trick:** feed the agent a "caveman wrapper" (prompt to reply in token-reduced caveman — fewer *generated* tokens billed), then translate the terse output **back to fluent English with a free local model** (Ollama llama3). Full source read (it's a ~50-line FastAPI app): `POST /translate` → `ollama.chat(model="llama3", system=DarwinCaveman linguist prompt)` → fluent text. ~15 lines of real logic.

**Assessment:** the symmetric counterpart of input-side compression — you save on the *billed generation side* and spend *free local compute* on the user-facing side. For a desktop app with Ollama available, an "expand terse reply for display" post-processor is a cheap 30% saving on generation tokens. Gimmicky on its own; **valuable as a pattern** in our output pipeline (especially with local translation models).

---

## §6 Repomix (27,665⭐, MIT, TypeScript) — repo→context packer

**The standard tool** for packing a repo into one file for LLM context (CLI, website, browser extension, VS Code extension, Docker, and **MCP server** via `@modelcontextprotocol/sdk`). This is doc 03 §7's *Repository-Wide Code Engineering* ingestion half.

### What its dependency list tells us (read from `package.json`)
| Dependency | What it means (steal) |
|---|---|
| `@repomix/strip-comments` + `@repomix/tree-sitter-wasms` + `web-tree-sitter` | **Comment-stripped token counting** (counts real tokens, not comments) |
| `@secretlint/core` + `secretlint-rule-preset-recommend` | ⭐ **Secret redaction before context** — never leak API keys into prompts |
| `gpt-tokenizer` | Model-aware token counts in output |
| `globby` + `minimatch` + `chokidar` | Glob-based file selection + watch |
| `iconv-lite` + `jschardet` | Encoding detection (UTF-16 etc.) |
| `isbinaryfile` | Binary skip |
| `handlebars` | Output templating (XML/plain formats) |
| `tinypool` | Worker-pool parallel packing |
| `git-url-parse` + `tar` | **Remote repo support** (GitHub shorthand, branches/tags/commits, URLs) + tarball fetch |
| `json5`, `valibot`/`zod` | Config parsing |

### Key capabilities (from README sections)
- **File selection:** `repomix`, find/fd/rg/git-tracked/fzf interactive, globs, file lists, echo piping
- **Git context:** `--git-log` (default 50 commits), combine with diffs for "comprehensive git context"
- **Remote:** GitHub shorthand (`repomix user/repo`), branch/tag/commit, URL
- **Formats:** XML (default, with file tree header) / plain / markdown output styles (well-known formats; not re-verified this pass — §8)
- **Secret scanning** built in (secretlint) — the differentiator most packers lack

**Steal for us:** our "grok any repo" feature = repomix's pipeline (glob selection → encoding/binary detection → comment-stripped token counting → **secretlint redaction** → XML-with-tree output) as a Rust module, plus its MCP-server mode. The secretlint step is non-negotiable for our BYOK privacy posture.

---

## §7 Synthesis — our full compaction stack (doc 03 §7 made concrete)

| Layer | Source repo | Mechanism |
|---|---|---|
| **1. Stable-prefix dialect** | Glyphdown-L1 (concept) | Reversible dense dialect for system prompt + memory headers; keep original in SQLite |
| **2. Turn-to-turn codec** | headroom (SmartCrusher/CCR) + terse | Live-zone compression preserving KV-cache prefixes; per-tool levels + verbatim-code rule |
| **3. Proxy pipeline** | Janus (MIT) | Dedup → regex structural → tree-sitter AST relevance prune → semantic trim, + separate Redis/RediSearch semantic-cache layer (BGE-small-384d) on top |
| **4. Repo ingestion** | repomix (MIT) | Glob select → strip-comments token count → **secretlint redaction** → XML-with-tree output; MCP mode |
| **5. Output-side** | DarwinCaveman (MIT) | Local-model expansion of terse generations before display |
| **6. Caching** | Anthropic prompt-cache stacking (Glyphdown §2 insight) | Never fight the prefix cache; shrink what never caches + densify what does |

**Cross-refs:** `rtk` (docs 20/23 — 90% bash-output cut, per-command compression rules) = the same family at tool level; Agent Zero compaction protocol (doc 16) = the same at conversation level.

---

## §8 Honest gaps
- ⚠️ API rate-limited — no source-file trees pulled this pass; glyphdown's `glyphdown-core/` codec source and Janus's Rust stage implementations are README-level only.
- Glyphdown's −44.6% dialect number is **one measured run** (opus-dialect-validate-2026-05-31) — treat as indicative.
- Terse's 50–85% claims are self-reported benchmarks on internal tasks.
- Repomix: `src/` internals (packing core, MCP server) not read — dep list + README only.
- DarwinCaveman read in full (tiny app) — complete.

*Ledger update: +5 repos (glyphdown, terse, DarwinCaveman, Janus, repomix) → 134 total; headroom star refreshed 65,131.*
