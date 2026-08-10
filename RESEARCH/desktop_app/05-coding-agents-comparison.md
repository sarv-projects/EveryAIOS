# Coding Agent Comparison — opencode, pi, Claude Code, Hermes, AnythingLLM, Reasonix

> Research date: 2026-08-05. GitHub star counts verified via GitHub API. Code-level reads of each repo (go.mod, package.json, README, SPEC/ARCHITECTURE docs).
> Context: choosing what to steal for our desktop app's agent/coding pillar.

---

## 0. Verification Table (GitHub API, authoritative)

| Repo | ⭐ | Lang | License | What it is |
|---|---|---|---|---|
| **opencode-ai/opencode** | 13.6K | Go | MIT | ⚠️ **ARCHIVED** — original author → **charmbracelet/crush**; active home is **anomalyco/opencode** (TS rewrite, doc 24 §2.1) |
| **earendil-works/pi** | 84K | TypeScript | — | "AI agent toolkit: unified LLM API, agent loop, TUI, coding agent CLI" |
| **anthropics/claude-code** | 140K | Python (repo) | — | Agentic coding tool; engine is **proprietary**, repo = installer + plugins |
| **NousResearch/hermes-agent** | 225.9K | Python | MIT | "The agent that grows with you" (deep-researched in doc 02) |
| **Mintplex-Labs/anything-llm** | 64K | JS/TS | MIT | RAG workspace (deep-researched in doc 01) |
| **esengine/DeepSeek-Reasonix** | 31.4K | **Go** (main-v2) | — | "DeepSeek-native AI coding agent… prefix-cache stability" |

---

## 1. opencode → Crush (archived) + anomalyco (apparent new home)

**Verified: `opencode-ai/opencode` README says "Archived: Project has Moved… continued under the name Crush, developed by the original author and the Charm team."** → `charmbracelet/crush`.

> **✅ Owner update (doc 24 §2.1 — verified 2026-08-06):** opencode's active home is **`anomalyco/opencode`** (full README + package.json fetched: site opencode.ai, npm `opencode-ai`, brew tap anomalyco/tap). **It was rewritten from Go → Bun/TypeScript monorepo** (packages: opencode / desktop / app / console) and now ships a desktop app. The original author's continuation remains **Crush** at Charm; `opencode-ai/opencode` (Go) is the archived org.

**OpenCode's stack (from `go.mod`):**
- Go 1.24, `charmbracelet/bubbletea` (TUI), `bubblezone`, `glamour` (markdown rendering), `lipgloss` (styling)
- `ncruces/go-sqlite3` (SQLite sessions), `goose` (migrations)
- `mark3labs/mcp-go` (MCP client)
- SDKs: `anthropic-sdk-go`, `openai-go`, plus Azure, Bedrock, Groq
- `html-to-markdown`, `goquery` (scraping), `chroma` (syntax highlight), `go-diff`/`udiff` (file diffs), `doublestar` (glob), `fsnotify`

**Features (from README):** Bubble Tea TUI, multi-provider (OpenAI/Anthropic/Gemini/Bedrock/Groq/Azure/OpenRouter), session mgmt, tool integration (execute commands, search files, modify code), Vim-like editor, SQLite persistence, **LSP integration**, file-change tracking, external editor, named-arg custom commands.

**Crush (successor):** Multi-model, switch LLMs mid-session preserving context, session-based, LSP-enhanced, **MCP extensible (`http`/`stdio`/`sse`)**, works on every terminal platform incl. Android/FreeBSD/OpenBSD/NetBSD, built on Charm ecosystem (25K+ apps). Install: brew/npm/winget/scoop/nix.

---

## 2. pi (earendil-works/pi) — 84K⭐, TypeScript monorepo

**Packages:**
- `@earendil-works/pi-ai` — unified multi-provider LLM API (OpenAI, Anthropic, Google…): provider collections, **automatic auth resolution, token & cost tracking**, context persistence, mid-session model hand-off. **Only includes tool-calling-capable models** (explicit design choice).
- `@earendil-works/pi-agent-core` — stateful agent with tool execution + **event streaming** (`agent.subscribe(event)`), SQLite session backends (separate package for runtime-specific SQLite).
- `@earendil-works/pi-coding-agent` — the CLI coding harness: **interactive, print/JSON, RPC (process integration), and SDK (embed in your app)** — four modes.
- `@earendil-works/pi-tui` — TUI lib with differential rendering.
- Extensions: **Skills, Prompt Templates, Themes, Pi Packages** (shareable via npm/git). "Adapt pi to your workflows, not the other way around, without forking."

**Key design stance:** *minimal core, deliberately skips subagents and plan mode* — "you can ask pi to build what you want or install a third-party pi package." **No built-in permission system** — runs with user's permissions; containerization is opt-in via 3 patterns (Gondolin micro-VM, plain Docker, OpenShell sandbox). Supply-chain hardening: pinned deps, `save-exact=true`, `min-release-age=2`.

---

## 3. Claude Code (anthropics/claude-code) — 140K⭐

**Repo reality:** The GitHub repo is **Python, but it's the installer/distribution + plugins**, not the engine. The actual engine is a proprietary compiled binary (npm was deprecated in favor of install scripts). "Use it in your terminal, IDE, or tag @claude on GitHub."

**What we know about the engine (from docs/behavior, not source):** terminal-native agentic loop (plan → edit → bash → test → iterate), `CLAUDE.md` context files, subagents, hooks, MCP support, checkpointing, permission modes (acceptEdits / plan / bypassPermissions), GitHub integration, skills. The repo does ship **official plugins** (custom commands + agents in `plugins/`).

**Steal:** the permission-mode concept (`plan` vs `acceptEdits` vs `bypass`) maps directly onto our Trust Ladder; `CLAUDE.md` convention is the AGENTS.md standard. **Don't steal:** can't — closed source.

---

## 4. Hermes Agent — already deep-researched (doc 02)

225.9K⭐, Python, MIT. Gateway (21 platforms), memory (frozen-snapshot + providers + skill self-creation), cron NL scheduling, delegation with `DELEGATE_BLOCKED_TOOLS`, web search registry, sandbox environments (local/docker/ssh/singularity/modal). See `RESEARCH/desktop_app/02-hermes-agent-feature-blueprint.md`.

---

## 5. AnythingLLM — already deep-researched (doc 01)

64K⭐. AIbitat agent runtime, 16 skill plugins, web search (14 engines, keyless default DDG), RAG pipeline (collector microservice + TextSplitter + 14 embedders + 10 vector DBs + native reranker), memory injection + Observer/Reflector extraction, scheduled jobs (Job/Run + child-process workers), Model Router (calculated + LLM-classified rules), MCP-as-skills. See `RESEARCH/desktop_app/01-anythingllm-feature-blueprint.md`.

---

## 6. DeepSeek-Reasonix — 31.4K⭐, Go — THE most relevant new find

**Verified:** TS 0.x line is legacy/maintenance; **active dev is `main-v2` = a Go rewrite**: "a single static Go binary, tuned around DeepSeek's prefix cache so token costs stay low across long sessions."

### The cache-first design (novel — steal this)
Reasonix is **DeepSeek-only by design** because "every layer is tuned to the byte-stable prefix-cache mechanic." Case study: 435M input tokens in one day, **99.82% cache hit**, ~$12 vs ~$61 without cache on `v4-flash`.

**Config knobs (from `reasonix.example.toml`):**
- `soft_compact_ratio = 0.5` — notice only, **keeps the cache-first prefix intact**
- `tool_result_snip_ratio = 0.6` — snip stale tool results before summary compaction
- `compact_ratio = 0.8` / `compact_force_ratio = 0.9` — compaction high-water marks
- `temperature = 0.0`, `recovery_model`, `system_prompt_file`, `output_style` (persona folded into prompt)

### Spec-driven, config-driven core (matches our orchestration vision)
- **`reasonix.toml` drives everything**: `[[providers]]` (name, kind="openai", base_url, model(s), api_key_env), `[agent]`, `[tools]`, `[permission]`, `[desktop]`, `[notifications]`. "Adding another OpenAI-compatible model is a config edit, not a code change."
- **Interface-first + registry-based**: `Provider` and `Tool` are Go interfaces; factories self-register via `init()`; built-in tools = read_file/write_file/edit_file/move_file/bash/ls/glob/grep; plugins = stdio JSON-RPC (MCP-compatible).
- **Two extension tiers**: compile-time built-ins + runtime external plugins.
- Single binary, `CGO_ENABLED=0`, one TOML dep, cross-compile 6 targets.

### Multi-model / subagent config (directly matches "per-agent models")
```toml
# planner_model = "deepseek-pro"       # optional two-model collaboration
# subagent_model = "deepseek-pro"      # default for runAs=subagent skills
# subagent_models = { review = "deepseek-pro", security_review = "deepseek-pro" }
# max_subagent_depth = 2               # nested delegation depth
# max_subagent_concurrency = 6
# max_parallel_writers = 3             # concurrent non-overlapping writers
```
→ executor (cheap/fast) + planner (frontier) + per-skill subagent model overrides. **This is exactly the asymmetric multi-model tiering we designed.**

### Other capabilities
- **Permissions & sandbox** module (`internal/permission`: per-call Policy allow/ask/deny → Decision)
- **Remote-SSH** module: port-forward lifecycle, SFTP file layer, detached `reasonix serve` bootstrap over SSH
- **Desktop app + CLI + VS Code extension** sharing one local engine ("The CLI/TUI, desktop app, and VS Code extension all use the same local Reasonix engine")
- Custom slash commands from `.reasonix/commands/*.md`; embedded documentation retrieval; `@` references; two-model collaboration; task contracts & pause policy; capability diagnostics
- Provider presets for many vendors (Kimi, MiniMax, GLM/Z.AI, OpenCode Go/Zen, Qwen, NovitaAI, NVIDIA, KiloCode, Vercel AI Gateway, HuggingFace, Ollama Cloud…)

---

## 6.5 Deep-dive: the actual agent loops (code-level, second pass)

### pi — `packages/agent/src/agent-loop.ts` (TypeScript)
- **Two entry points**: `agentLoop()` (start with new prompts) and `agentLoopContinue()` (retry without new message; **rejects if last message is assistant role** — caller contract).
- Loop internals: `message.content.filter(c => c.type === "toolCall")` → batch tool execution → push `toolResult` messages into context → loop.
- 🔥 **`stopReason === "length"` guard**: if the model hit its token limit, the loop **fails all tool calls instead of executing truncated/borked args** (`failToolCallsFromTruncatedMessage`). Great defensive pattern.
- **`prepareNextTurn` hook**: after each turn, the agent can swap the **model** mid-session (nextTurnSnapshot.model), inject steering messages (`getSteeringMessages`), or rewrite context. This is how pi does model hand-off + context management.
- Event stream: `turn_start`, `turn_end`, `agent_end`, text deltas, tool calls — one `EventStream<AgentEvent, AgentMessage[]>`.
- `EMPTY_USAGE` + `Model` type tracks `cacheRead/cacheWrite/cost` — **token & cost tracking built into the loop**, matches Reasonix's cache obsession.

### Reasonix v2 — Go (`cmd/reasonix/main.go` + `internal/`)
- `main.go` is tiny: blank-imports built-ins (anthropic/openai/responses providers + builtin tools) → they self-register via `init()`. **Crash capture wrapper** (`crashreport.CapturePanic` → reasonix home dir) on every panic.
- `go.mod`: Charm bubbletea v2 TUI + **tree-sitter** (JS/Python/Rust/TS grammars for code understanding) + `pkg/sftp` (Remote-SSH) + `go-keyring` (secure credential storage) + `jsonschema` + goldmark + TOML.
- Architecture (SPEC §2): `cli → {agent, plugin, config} → {tool, provider}` — dependency direction is enforced acyclic; built-ins import parent to self-register, parents never import children.
- Permission module: per-call `Policy` (allow/ask/deny) → `Decision`.

### Claude Code — plugins as the extension surface
- Engine closed-source, but the **plugin structure is the spec**: `.claude-plugin/plugin.json` + `commands/` (slash commands) + `agents/` (specialized subagents) + `skills/` + `hooks/` (event handlers) + `.mcp.json`.
- Official plugins show the pattern: `code-review` (**5 parallel agents with confidence-based scoring** to filter false positives), `feature-dev` (7-phase workflow + code-explorer/architect/reviewer agents), `pr-review-toolkit` (6 specialized review agents), `ralph-wiggum` (self-referential iteration loop), `security-guidance` (**PreToolUse hook monitoring 9 security patterns** — command injection, XSS, eval, pickle deserialization, os.system — matches our dual-guard idea).
- **Steal**: the plugin folder structure (commands/agents/skills/hooks/mcp.json) is a clean, proven extension convention — reuse for our desktop app's plugin packaging.

## 🎯 Steal-list for our desktop app

| Repo | Steal | File/mechanism |
|---|---|---|
| **Reasonix** | **Cache-first compaction** — `soft_compact_ratio`/`tool_result_snip_ratio`/`compact_force_ratio`; snip stale tool output before compaction; never break the stable prefix | `reasonix.example.toml` agent section |
| **Reasonix** | **Config-driven agents/providers/tools** — TOML-declared providers, per-skill subagent models (`subagent_models`), `max_subagent_depth/concurrency`, planner+executor split | SPEC.md §3, example toml |
| **Reasonix** | **Single-binary distribution story** — CGO_ENABLED=0, one dep, cross-compile | SPEC.md §1-2 |
| **Reasonix** | Permissions as per-call `allow/ask/deny` Policy → pairs with our Trust Ladder | `internal/permission` |
| **Reasonix** | Remote-SSH execution (port-forward + SFTP + detached serve) — a 6th sandbox backend for us | `internal/remote/` |
| **pi** | **Unified LLM API w/ token & cost tracking + auth resolution** — clean `pi-ai` abstraction | `packages/ai` |
| **pi** | **Four modes (interactive/JSON/RPC/SDK)** — our Node sidecar can expose the same surface; desktop UI + CLI + SDK from one engine | `packages/coding-agent` |
| **pi** | Skills/Prompt Templates/Themes/Pi Packages sharing model | `packages/coding-agent` docs |
| **Crush/OpenCode** | **LSP integration for code intelligence** (Language Server Protocol for context) | opencode README / crush |
| **Crush** | MCP over `http`/`stdio`/`sse` (our MCP host covers stdio; add http/sse) | crush README |
| **Claude Code** | Permission modes (`plan`/`acceptEdits`/`bypass`) as UX for Trust Ladder | docs (engine closed) |
| **Hermes** | (doc 02) delegation security, memory, sandboxes, gateway | — |
| **AnythingLLM** | (doc 01) RAG pipeline, scheduled jobs, model router | — |

### What NOT to copy
- **OpenCode** — archived at `opencode-ai`; active home `anomalyco/opencode` (TS/Bun rewrite w/ desktop app, doc 24 §2.1). Don't build on the archived Go fork; evaluate **Crush** (original author) vs the rewritten anomalyco codebase.
- **Claude Code engine** — closed source; only patterns.
- **pi's "no permissions by default"** — we deliberately do the opposite (Trust Ladder).
- **Reasonix being DeepSeek-only** — the cache-first *mechanics* are portable; the single-provider lock-in is not for us (we're multi-provider BYOK).

---

## 7. Synthesis — where our app fits

These six projects split cleanly:
- **Coding harnesses** (Crush, pi, Claude Code, Reasonix): terminal-native, expert audience. Best ideas: LSP context, config-driven providers, cache-first compaction, permission policy, RPC/SDK surfaces.
- **Workspace/RAG + agents** (AnythingLLM, Hermes): document/agent-centric. Best ideas: skills-as-files, memory layers, scheduled jobs, gateway, sandboxes.

**Our desktop app = the unifier the market lacks**: the *workspace + RAG + memory* of AnythingLLM/Hermes, the *coding-harness + cache-first + config-driven* ideas of Reasonix/pi, wrapped in a lightweight Tauri shell with a Node sidecar running our existing TS engine. Nobody ships all of it in one desktop product (verified claim — with the caveat that **we already own the algorithm layer**).
