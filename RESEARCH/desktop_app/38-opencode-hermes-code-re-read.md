# 38 — opencode & Hermes: full code re-read (subagents · token tracking · compaction)

> Added 2026-08-06 on user request: *"opencode, hermes, once again, read their entire repos… esp its subagents, its cli mode → how it tracks tokens… not the cli, but its internal algos, codes."*
> **Method:** both shallow-cloned and source-read this pass (`/tmp/oc-deep` 218MB, `/tmp/h-deep` 220MB). OpenCode = `anomalyco/opencode` (TS/Bun rewrite); Hermes = `nousresearch/hermes-agent` (Python). Ledger depth ⬛ both (already source-read — this pass deepens).
>
> 🔗 **Repos:** https://github.com/anomalyco/opencode (194K⭐) · https://github.com/NousResearch/hermes-agent (226K⭐)

---

## A. OpenCode — subagents (code-verified, `packages/opencode/src/tool/task.ts` 360 lines + `agent/`)

### A1. The `task` tool (how a subagent is spawned)
- **Parameters:** `description` (3–5 words) · `prompt` (the task) · `subagent_type` (specialized agent) · `task_id` (optional — **resume the same subagent session**, don't spawn fresh) · `command` · `background` (async; needs `OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS=true`).
- **Depth limit:** walks `parentID` chain up to the root; `depth >= cfg.subagent_depth ?? 1` → hard error. **Default subagent depth = 1** (no nested subagents unless configured).
- **Permission gate:** the `task` tool itself goes through `ctx.ask({permission: "task", patterns: [subagent_type], always: ["*"], metadata})` — the model must be allowed to spawn a subagent (permission rule `task`).
- **Unknown agent type** → clean error, no silent fallback.

### A2. Subagent permission inheritance (`agent/subagent-permissions.ts`, 27 lines — the whole file read)
`deriveSubagentSessionPermission(parentSessionPermission, subagent)`:
1. Subagent **inherits the parent's `deny` rules + `external_directory` rules** (parent restrictions carry down).
2. **Default-deny `todowrite` and `task`** unless the subagent's own permission ruleset explicitly permits them → **kids can't spawn kids** (same invariant as Hermes `DELEGATE_BLOCKED_TOOLS`, but enforced structurally via inherited denials).
3. `task.ts` adds a third default-deny: `experimental.primary_tools` are denied inside subagents.

### A3. Per-agent model (heterogeneous tiering, concrete)
- Each agent has `mode: "subagent" | "primary" | "all"`, `model?: {providerID, modelID}`, `permission: ruleset`, `tools`.
- On spawn: `model = next.model ?? parent's model` — **a subagent can run a different provider/model than its parent** (exactly our A7 asymmetric tiering).
- Default agent is `primary`; `config.default_agent` cannot be a subagent.
- Output envelope: `<task id state><summary/><task_result|task_error/></task>` XML — structured subagent results with optional summary.

### A4. What we steal (B3 subagents + our orchestration)
- `subagent_depth` hard limit + error (default 1) → our B6 iteration/depth caps.
- Inherited-denials permission model → our B3 role isolation (stronger than our current DELEGATE_BLOCKED_TOOLS note).
- `task_id` **session resume** for subagents → long-running delegated work (B2 resume).
- Per-agent `model ?? parent` → A7.
- Default-deny recursion structurally (not just prompt-level).

## B. OpenCode — token tracking & cost accounting (code-verified)

### B1. The per-message token schema (the heart of it)
Every assistant message stores (SQLite columns, `session/session.ts`):
```
tokens: { input, output, reasoning, cache: { read, write } }   +   cost: number
```
- **`reasoning` tokens tracked separately** (reasoning models).
- `getUsage()` normalizes AI SDK v6 usage → `inputTokens/outputTokens/reasoningTokens/cacheReadInputTokens/cacheWriteInputTokens` (with bedrock/venice metadata fallbacks).
- ⚠️ **Critical gotcha (copy this):** *AI SDK v6 normalizes `inputTokens` to INCLUDE cached tokens* — opencode **subtracts the cached count back out** to get non-cached input so cost is computed correctly (cached input is billed differently).
- `provider.ts`: each model carries `cost: {input, output, cache: {read, write}}` + `limit: {context, output}`; zero-cost models are filtered from autoload.

### B2. Cost aggregation (`cli/cmd/stats.ts`)
`stats` command aggregates over sessions: `totalCost`, `totalTokens` (input/output/reasoning/cache-read/cache-write), **`toolUsage` per tool**, **`modelUsage` per model** (messages/tokens/cost), `costPerDay`, `tokensPerSession`, **`medianTokensPerSession`** — filterable by `--days/--tools/--models/--project`. This is the exact shape of our **H9 token/cost analytics dashboard** (per-key + per-session + per-model + per-tool).

### B3. What we steal (A9 + H9)
- The per-message `{input, output, reasoning, cache:{read,write}} + cost` schema → our audit/ledger (J5 + A9).
- The **cache-normalization gotcha** (subtract cached from input before cost) → prevents double-charging in our A9.
- The stats aggregation shape (per-model, per-tool, median/session) → H9.

## C. OpenCode — compaction engine (code-verified, `session/compaction.ts` 562 lines + `overflow.ts`)

### C1. Overflow trigger (`overflow.ts`)
- `COMPACTION_BUFFER = 20_000`; `reserved = cfg.compaction.reserved ?? min(20_000, maxOutputTokens)`; `usable = model.input_limit - reserved`.
- Overflow when `tokens.total || input+output+cache.read+cache.write >= usable`. Off-switch: `compaction.auto === false`.

### C2. Tail selection (`select()`)
- Keep `tail_turns` (default **2**) recent turns, but fit them into `preserveRecentBudget` (config `preserve_recent_tokens`) using per-turn token estimates; **`splitTurn`** can retain a partial turn that fits the remaining budget.

### C3. Tool-output pruning (`prune()` — the standout trick)
- Walk backward from the latest message, past 2 user turns, stop at an assistant summary or an already-compacted part.
- Accumulate token estimates of completed, non-protected tool outputs; **`PRUNE_PROTECT = 40_000`** tokens of recent tool output are always kept; older tool outputs **erase `state.output` entirely** (marked `state.time.compacted`), freeing context without deleting the conversation structure.
- Only commits if `pruned > PRUNE_MINIMUM = 20_000`. `PRUNE_PROTECTED_TOOLS = ["skill"]` (skill outputs never erased).

### C4. What we steal (05 token economy)
- The **tool-output erasure** pattern (PRUNE_PROTECT 40K / commit floor 20K) → direct upgrade to our 05 compaction: reclaim context by erasing old tool payloads, keep the last 40K tokens, never erase skill/important outputs.
- 20K compaction buffer; tail-turns-with-budget + partial-turn split; `auto=false` escape hatch.

## D. Hermes — budgets, tool-result persistence & compression (code-verified)

### D1. Iteration budget (`agent/iteration_budget.py`, full file read)
- Thread-safe `consume()/refund()/used/remaining` per agent.
- **Parent cap `max_iterations` (default 500); each subagent cap `delegation.max_iterations` (default 50)** — total across parent+subagents can exceed the parent cap.
- **`execute_code` (programmatic tool-calling) iterations are refunded** — don't eat the budget.
→ Steal for B6: refundable programmatic iterations is the right semantics (deterministic code execution shouldn't count against reasoning turns).

### D2. 3-layer tool-result persistence (`tools/tool_result_storage.py` + `tools/budget_config.py`) — ⭐ the exact mechanism for 05 "snip before summarize"
1. **Per-tool output cap** (tool author truncates first).
2. **Per-result persistence:** output exceeds the tool's registered threshold → full output written to the sandbox temp dir (`/tmp/hermes-results/{tool_use_id}.txt`), in-context replaced with `<persisted-output>` preview (1,500 chars) + file-path reference; model reads full via `read_file` on any backend.
3. **Per-turn aggregate budget:** after a turn, if total tool output > `MAX_TURN_BUDGET_CHARS` (200K), spill the largest non-persisted results to disk until under budget.
- **Threshold resolution:** pinned > tool_overrides > registry > default (100K chars); `read_file` pinned to `inf` (prevents persist→read→persist loops).
- **Context-window-scaled budgets** (the polish): `_CHARS_PER_TOKEN = 4`, per-result fraction **0.15** of the model's window, per-turn fraction **0.30**, floor `_MIN_RESULT_SIZE_CHARS = 8_000` — small-context models get tighter budgets automatically.
→ Steal for 05: this is the complete, production-tested "persist-don't-truncate" design — preview+path reference, per-turn aggregate cap, context-scaled fractions. Strictly better than our current snip plan.

### D3. Context compressor (`agent/context_compressor.py`)
- Self-contained summarizer (own client); **structured summary template with Resolved/Pending question tracking**; **iterative summary updates** across multiple compactions (info preserved); **token-budget tail protection instead of fixed message count**; **scaled summary budget proportional to compressed content**; "CONTEXT COMPACTION — REFERENCE ONLY" handoff framing; `_compressed_summary` metadata key; rolling micro-compaction vs batch compaction.
- **Skill-awareness:** `_extract_pruned_skill_names` / `_collect_ghosted_skill_names` / `_reinject_pruned_skill_markers` — pruned skill references are re-injected as markers so the model knows they existed (no silent skill loss).
- Path-mention collection (`_collect_path_mentions`, limit 12) → relevant files preserved across compaction.
→ Steal for 05: Resolved/Pending summary structure, iterative summaries, skill/marker reinjection, path-mention preservation.

### D4. Run loop (`run_agent.py`, 8,167 lines)
- `AIAgent`: checkpoints (`checkpoint_max_snapshots=20`, `max_total_size_mb=500`, `max_file_size_mb=10`); context-engine transitions with `carry_over_context`; rate-limit pool recovery; ephemeral scaffolding filtering; `account_usage.py`/`aux_accounting.py`/`billing_usage.py` (usage accounting files); `bounded_response.py`.
→ Steal for B2: checkpoint snapshots (20/500MB/10MB) for resume-after-reboot; rate-limit pool recovery.

## E. Delta vs the locked matrix/spec

**No new matrix rows** — every finding lands on existing rows, but as *code-verified implementation details* worth recording in ARCH/05 (token economy) and ARCH/03/09 (ledger schema):

| Finding | Land on |
|---|---|
| opencode per-message token schema + cache-normalization gotcha | A9 / J5 / H9 |
| opencode stats aggregation (per-model/per-tool/median) | H9 |
| opencode compaction: 20K buffer, tail-turns+split, PRUNE_PROTECT 40K erasure | 05 |
| opencode subagent depth limit + inherited denies + task_id resume + per-agent model | B3 / B6 / A7 |
| Hermes 3-layer tool-result persistence (preview+path, per-turn 200K, 0.15/0.30 context fractions) | 05 |
| Hermes IterationBudget 500/50 + execute_code refund | B6 |
| Hermes context_compressor (Resolved/Pending, iterative, skill-marker reinjection) | 05 |
| Hermes checkpoints (20 snapshots / 500MB) | B2 |

**Ledger:** no count change (151). opencode + hermes rows noted with doc 38.
