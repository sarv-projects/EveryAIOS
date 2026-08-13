# 05 — Token Economy: Minimize Inputs, Maximize Output Power

> **The user's #1 goal:** *"tokens minimizing, yet greater, more powerful, capable outputs — so control the inputs basically."* This is the entire doc. Doctrine from doc 32 (tokenmining): **retrieve instead of preload · compress instead of repeat · structure instead of narrate · spend tokens where reasoning actually matters.** Knobs from Reasonix (doc 05 §6), BrowserOS (doc 33 §7.2), Janus (doc 31), context-mode (doc 32), rtk (doc 23), Hermes budgets (doc 16).

## 5.1 The four rules, made operational

### Rule 1 — Retrieve instead of preload
- Default retrieval is **FTS5, no embeddings** (context-mode + PageIndex proved vectorless RAG: 315KB→5.4KB, 98% savings; doc 32). BM25 + Porter stem (headings 5× weight) + trigram + **RRF** + proximity rerank + fuzzy + smart snippets (windows around matches) + TTL cache (24h, 0.3KB hint vs 48KB fetch) + progressive throttling.
- **Phantom Thread** (07) preloads the top-5 warm facts with 0ms TTFT instead of dumping history.
- Hard rule: **never paste the whole document/codebase/log** — only retrieved, deduped, budgeted snippets. Large page reads truncate to a saved file (BrowserOS OutputFileAccess pattern, doc 33 §6).
- Snippet budgets: max tokens per source type (file 2K, page 1.5K, search 1K, memory 600, tool result 1K) — sum capped per turn by the context planner.

### Rule 2 — Compress instead of repeat
Compaction pipeline (triggered at thresholds; runs in the sidecar; every step keeps the **byte-stable prefix** — Reasonix's entire insight, 92–99% cache hit on DeepSeek, doc 05 §6):

1. **snip before summarize** (`tool_result_snip_ratio=0.6`): stale/oversized tool results are snipped to a head/tail anchor (rtk-style per-command rules for bash output, doc 23) *before* any summary runs.
2. **soft compact** (`soft_compact_ratio=0.5`): notice-only — the loop slows context growth, keeps prefix.
3. **summarize** (BrowserOS `callSummarizer` design, doc 33 §7.2): transcript → `<conversation_transcript>` → streaming summary with **timeout + abort (fail-open)**, max output tokens; messages-to-transcript; `messagesToTranscript` + `findSafeSplitPoint` (never split mid-turn) + `slidingWindow` (keep recent N tokens, summarize the rest) + `reduceToolOutputs` + `stripBinaryContent` + `pruneMessages`.
4. **force compact** (`compact_force_ratio=0.9`): high-water mark; same pipeline.
5. **Janus-style structural passes** (doc 31): tool-result dedup (identical/overlapping results dropped), regex structural (stack traces → single-line anchors, repeated blocks → `[repeated ×N]`), AST pruning for code blocks (tree-sitter: drop non-referenced lines) — applied opportunistically, never to the stable prefix.
6. **Lossless compaction for long-running projects** (Hermes/Agent Zero protocol): multi-agent logs → dense anchor file on disk + one-paragraph summary in context; MEMORY.md-style frozen snapshot injected at session start so mid-session writes don't break the cache (doc 16).

### Rule 3 — Structure instead of narrate
- **`run`/script-eval** (08): one call does multi-step loops (`Promise.all` fan-out, pagination, bulk extraction) — 1×`run` replaces N×`snapshot+act` round-trips. BrowserOS instruction block is the template (doc 33 §6.3).
- **Deterministic planner** (04): spreadsheet/doc operations via DSL, not prose.
- **Crystallization** (v2.0 §P7, built in core-automations): successful multi-step workflows compile non-cognitive steps (waits, triggers, static transforms, notifications) into a native deterministic loop — **0 tokens on re-runs**.
- **Grammar-enforced extraction** (v2.0 §P3, core-engine): weak models call tools via ```text``` code blocks; no fragile JSON.
- **Tool-result discipline**: results returned as structured types, not prose; images binary-flagged; errors as compact error objects.

### Rule 4 — Spend where reasoning matters
- **Asymmetric tiering** (doc 16, Reasonix): `planner_model` (frontier) plans; `subagent_models` (cheap/local) grind logs, greps, data; `max_subagent_depth=2`, `max_subagent_concurrency=6`, `max_parallel_writers=3`.
- **⚠️ Brevity does not mean better reasoning** (context-mode's warning, doc 32): we compress *where data goes*, never how the model talks. System prompt stays full-strength; only injected content is budgeted.
- **Reasoning-model routing**: hard tasks → reasoning model (with the reasoning content used as tool-plan input, kept out of long-term memory).

## 5.2 The context planner (one budget per turn)

```
Turn budget = context_window − reserve(50% under small windows, fixed above — BrowserOS computeConfig)
  ├─ 15%  system/persona (stable prefix)
  ├─ 10%  user intent (current message — never snipped)
  ├─ 40%  retrieved/rag/memory (Rule 1 budgets)
  └─ 35%  working set (recent turns, tool results, blueprints)
Above budget → the planner *decides* what to defer to a subagent or the Crystallizer instead of truncating silently.
```
Every injection point records its token cost → the cost ledger (§5.6).

## 5.3 Prefix-cache economics (the Reasonix lesson)

- System prompt, persona, tool schemas, blueprint header, and frozen memory are **byte-stable across turns** (no timestamps, no reordering, no cosmetic edits mid-stream).
- **Key affinity** (03 §3.4): same (provider, model, session) → same key, so provider caches don't fragment.
- Cache-aware costs: track `cache_read/cache_write` (pi EMPTY_USAGE pattern, doc 05) and surface real $/session — the dashboard's headline number (v2.0 P1 token streamer).
- Target: >85% cache hit on long sessions. Achievable rates are **provider-specific** (verified Aug 2026):

| Provider | Cache TTL | Achievable hit rate | Strategy |
|---|---|---|---|
| **DeepSeek** (V4 Flash/Pro) | Automatic, long-lived (indefinite for stable prefixes) | **92–99%** | Best economics; route long sessions here; prefix must be byte-stable |
| **Claude** (Anthropic) | **5 minutes** (silently reduced from 1hr in early 2026) | **77–87%** | Keep requests flowing within 5-min windows; add cache-keepalive if session idle; key affinity critical |
| **OpenAI** (GPT-4o/o1) | Varies by model, ~5–10 min typical | **60–80%** | Less transparent; prefix ordering matters |
| **Local (Ollama/llamafile)** | N/A (local compute) | N/A | No caching concern — context is local |

⚠️ **Claude TTL caveat:** Anthropic silently dropped prompt cache TTL from 1 hour to 5 minutes. If the user's session has gaps >5min between turns, cache hit drops to near 0%. The router should prefer DeepSeek for cache-heavy long sessions when the user has DeepSeek keys.

## 5.4 Tool-result size control

| Tool family | Default budget | Notes |
|---|---|---|
| bash/command output | 4K chars | rtk-style per-command rules (ls/grep/diff compress most; doc 23) |
| file read | 8K chars | head/tail + line windows, or OutputFileAccess file path |
| browser snapshot | 6K chars | interactive mode (actionables + headings) by default, full only on demand |
| web page markdown | 6K chars | truncate → saved file link |
| search results | 4K chars | titles+URLs+snippets; full content on demand |
| memory retrieval | 2K chars | warm set top-5 (§07) |

## 5.5 Cache-break events (no-failures)

The compaction layer tracks a `prefix_dirty` flag: set by key rotation (03), mid-session provider switch, blueprint rewrite, or memory write mid-turn. On next turn, either (a) defer the dirty write to turn boundary, or (b) accept the cache miss and re-snapshot the summary. Never reorder history to "fix" it — determinism beats micro-optimization.

## 5.6 Cost ledger & dashboard

One append-only table `token_usage(ts, session, provider, model, key_id, in, out, cache_read, cache_write, cost, tool)` shared by: per-key budgets (03), session efficiency projections (BrowserOS `session_efficiency_stats`, doc 33 §9.4 — insert-once, estimator v1), and the UI's live token/cost stream. Zero extra model calls for analytics (doc 32's telemetry pillar).

## 5.7 Failure discipline (the "no failures" goal)

- Compaction summarizer **fails open** (returns null → skip compact, force-snip instead) — never blocks the loop (BrowserOS).
- Token-count estimation uses a fast local tokenizer + safety multiplier; never trust provider-reported counts alone for threshold decisions.
- `context_length_exceeded` from the provider → snip → retry once (03 §3.6).
- No tool call is ever retried after partial execution (idempotency-only retries).

## 5.8 Code-verified compaction & persistence (opencode + Hermes re-read, doc 38)

Production implementations we verified in source this pass — these are the *exact* mechanisms to copy into 5.4/5.2:

**Hermes 3-layer tool-result persistence** (`tools/tool_result_storage.py` + `budget_config.py`):
1. Per-tool output cap (tool author truncates first).
2. **Per-result persistence:** output > tool's threshold → full output written to sandbox temp dir (`/tmp/hermes-results/{tool_use_id}.txt`), in-context replaced with `<persisted-output>` **preview (1,500 chars) + file-path reference**; model reads full via `read_file` on any backend.
3. **Per-turn aggregate cap:** turn tool-output total > 200K chars → spill largest non-persisted results to disk until under budget.
- Threshold resolution: pinned > tool_overrides > registry > default (100K); **`read_file` pinned `inf`** (prevents persist→read→persist loops).
- **Context-window-scaled budgets:** `_CHARS_PER_TOKEN = 4`, per-result fraction **0.15** of model window, per-turn **0.30**, floor 8K chars — small-context models auto-tighten. → adopt wholesale in 5.4.

**OpenCode compaction** (`session/compaction.ts` + `overflow.ts`):
- Overflow when `input+output+cache.read+cache.write >= model.input_limit - reserved` with `COMPACTION_BUFFER = 20_000`; off-switch `compaction.auto=false`.
- Tail selection: keep `tail_turns` (default 2) recent turns within `preserve_recent_tokens` budget; **splitTurn** keeps a partial turn that fits.
- **Tool-output erasure:** walk back past 2 user turns; keep `PRUNE_PROTECT = 40_000` tokens of recent tool output, **erase `state.output` of older completed non-protected tools** (mark `time.compacted`) — reclaims context without deleting structure; commit only if `pruned > PRUNE_MINIMUM = 20_000`; `skill` outputs never erased. → adopt for our 05 compaction.

**Per-message token schema (opencode, for 5.6 ledger):** every assistant message stores `tokens {input, output, reasoning, cache{read, write}} + cost` (SQLite columns `tokens_input/output/reasoning/cache_read/cache_write` + `cost`). ⚠️ **AI SDK v6 normalizes `inputTokens` to INCLUDE cached tokens — subtract cached back out before cost** (opencode does this; otherwise double-billed cached input).

**Iteration budget (Hermes, for B6):** parent `max_iterations` (default 500), each subagent `delegation.max_iterations` (default 50), **`execute_code` iterations refunded** (deterministic code execution shouldn't count as reasoning turns).

## 5.9 Pass-by-reference context + progressive disclosure (NOOA, doc 39 — C10)

**Rule 0 of context construction: never serialize what you can reference.** NOOA (`nooa-memory` references + live-object pass-by-reference, source-read) makes it a first-class pattern:
- **Live handles + bounded previews:** files/datasets/tool results enter context as a reference (path/id/variable name) + a bounded preview (head/tail samples, type metadata, row/byte counts) — not the payload. The agent queries/slices the real object through the sandboxed script-eval (E4/rquickjs), exactly like a human inspecting a file rather than pasting it.
- **Stored memory references are re-read fresh at recall time** — memory entries can point at live files instead of pasted values.
- **Progressive disclosure (`doc()` pattern):** long tool/type documentation is hidden by default; revealed only when the agent asks (a `doc` tool). Keeps tool-catalog prompts lean.
- Interaction with 5.4/5.8: pass-by-reference is *stronger* than persist-don't-truncate — Hermes persists big outputs to disk and shows a preview; NOOA never materializes them into the tool result at all. Adopt: tool results that are queryable (files, tables, datasets) return `{ref, preview}`; only non-queryable outputs get the 5.8 persistence path.
- **Crystallization tie-in:** compiled deterministic steps (algorithm 5) can run entirely on the referenced objects — zero tokens.

## 5.10 Tool-Result Output Compression (RTK Pattern, doc 46)

> Source: rtk-ai/rtk (75K⭐, Apache-2.0, Rust) — 60-90% token reduction on shell output.

Before feeding tool results to the LLM, apply **command-specific parsers** that understand the semantics of each tool's output format:

| Command category | Compression strategy | Typical savings |
|-----------------|---------------------|----------------|
| Test runners (cargo test, npm test, pytest) | Extract only failures + summary line | 80-90% |
| Build tools (cargo build, npm run build) | Extract only errors + warnings | 70-85% |
| Git operations (git diff, git log, git status) | Structured summary of changes | 60-75% |
| Package managers (npm install, cargo add) | Final status + any errors | 85-95% |
| Linters (clippy, eslint, flake8) | Deduplicated warning list only | 70-80% |
| Docker/container ops | Status + relevant logs | 75-85% |
| File listings (ls, find, tree) | Filtered to relevant patterns | 60-70% |

**Implementation approach:**
1. Maintain a registry of command-pattern → parser mappings (TOML-configurable)
2. Before injecting tool output into LLM context, route through matching parser
3. Parser extracts semantically relevant lines (failures, changes, errors)
4. Unrecognized commands: apply generic truncation (first N + last M lines + token count)
5. Always preserve exit code and timing metadata

**Token savings compound** with prefix-cache stability: compressed output is shorter → less cache-breaking → higher prefix hit rate.

**Relation to existing compaction pipeline (5.2):** RTK compression operates at the *tool-result injection* stage (before content enters the context window), while the 6-stage compaction pipeline operates on *accumulated conversation history*. They are complementary, not competing.

> **Production composition (doc 59):** OmniRoute stacks **RTK + Caveman (DarwinCaveman, doc 31)** as 12 pluggable engines and quotes 15–95% / ~89% avg token savings — the first production proof that the two layers compose. Cite as the implementation reference for §5.10 + §5.2; token-% stays vendor until we measure. Its **`cache-optimized` routing** (rendezvous-hash the prompt prefix back to the connection holding the cache) is the missing half of our A9 prefix-cache economics (§5.3) — pin *which key serves* by cache affinity, not just *track* cache_read/cache_write.