# Hermes Agent Feature Blueprint — How the Six Flagship Features Were Built

> Source: github.com/nousresearch/hermes-agent (Python, ~225K⭐, MIT) — code-level read of `gateway/`, `agent/`, `tools/`, `cron/`, `plugins/`, `skills/`.
> Maps the six marketing pillars → exact repo files → steal-list for our desktop app.

---

## Repo Map

| Path | What it is |
|---|---|
| `agent/` | The core AI agent: conversation loop, providers, memory manager, compression, delegation, subagent lifecycle |
| `gateway/` | Multi-platform gateway: adapters, session, delivery, relay, hooks, slash commands, cron tick |
| `gateway/platforms/` | Built-in adapters: WhatsApp Cloud, Signal, Weixin, QQBot, Yuanbao, BlueBubbles, webhook, API server |
| `plugins/platforms/` | **Plugin-based adapters**: Telegram, Discord, Slack, email, Matrix, Mattermost, Teams, IRC, Line, Dingtalk, Feishu, WeCom, WhatsApp, Google Chat, SMS, ntfy, Simplex, A2A, Home Assistant, Buzz, Raft, Photon (21 platforms) |
| `cron/` | Scheduler, jobs, executions, suggestions (NL scheduling) |
| `tools/` | 100+ tools: browser, vision, image gen, TTS, delegation, sandbox environments, memory, skills, web |
| `tools/environments/` | Execution sandboxes: local, docker, ssh, singularity, modal, managed_modal, daytona, vercel_sandbox |
| `skills/` | Bundled skills (research, productivity, dev, email, github, media...) |
| `plugins/` | Plugin system: platforms, memory providers, web search providers, image/video gen, cron providers |
| `apps/desktop/` | Electron desktop app (React, design-system-driven) |
| `hermes_state*.py`, `trajectory_compressor.py` | State persistence + context compression |
| `providers/` | LLM provider adapters |

---

## #1 — "Lives Everywhere" (Telegram, Discord, Slack, WhatsApp, Signal, Email, CLI + 20 more)

**The architecture: a plugin registry + adapter interface, not a hardcoded switch.**

- `gateway/platform_registry.py` — `PlatformEntry` dataclass: `name`, `label`, `adapter_factory`, `check_fn`, `validate_config`, `required_env`, `install_hint`. Plugins self-register via `PluginContext.register_platform()`. Gateway looks up plugins first, falls back to legacy if/elif.
- `gateway/platforms/base.py` — **`BasePlatform` ABC**: abstract methods all adapters implement (receive, send, media handling, threads, audio MIME maps for Telegram voice bubbles vs docs).
- **Built-in adapters** (`gateway/platforms/`): `whatsapp_cloud.py`, `signal.py`, `weixin.py`, `qqbot/`, `yuanbao.py`, `bluebubbles.py` (iMessage), `webhook.py`, `api_server.py` (REST), `msgraph_webhook.py` (Outlook).
- **Plugin adapters** (`plugins/platforms/`): each has `plugin.yaml` (name, `kind: platform`, `requires_env`, `optional_env`, `prompt`, `password: true`, setup URL) + `adapter.py`. Telegram uses `python-telegram-bot`; Discord has `voice_mixer.py` + ffmpeg utils; Slack has `block_kit.py`; email adapter for IMAP/SMTP.
- **Gateway runtime** (`gateway/`): `session.py`/`session_context.py` (per-channel session state), `delivery.py` + `delivery_ledger.py` (guaranteed delivery), `stream_consumer.py`/`stream_dispatch.py` (SSE streaming to channels), `slash_commands.py` (platform commands), `channel_directory.py` (cached reachable-channels map → `send_message` tool), `mirror.py` (cross-platform mirroring), `pairing.py`, `profile_routing.py`, `authz_mixin.py` (per-user/per-chat allowlists), `wake.py`, `restart.py` + `restart_loop_guard.py`, `scale_to_zero.py`, `memory_monitor.py`, `cgroup_cleanup.py`.
- **One agent, one memory, every surface**: all channels route into the same agent session with shared state — the channel is just transport (`send_message_tool.py`, `react_to_message_tool.py`).

**Key insight:** every platform = one `plugin.yaml` + one adapter class. Adding a 22nd platform is a drop-in folder, not a code change to the gateway.

---

## #2 — "Remember" (Persistent Memory, auto-generates skills)

**Three memory layers, pluggable:**

### Layer 1: Curated file memory — `tools/memory_tool.py`
- `MEMORY.md` (agent's notes: environment facts, project conventions, tool quirks) + `USER.md` (user preferences, communication style).
- Single `memory` tool with `add | replace | remove` actions; `§`-delimited multiline entries; short-substring matching (no IDs).
- **Frozen snapshot pattern**: files injected into system prompt as a stable snapshot at session start; mid-session writes update disk (durable) but NOT the system prompt → preserves prompt prefix cache all session. Refreshes next session.

### Layer 2: Pluggable provider memory — `agent/memory_manager.py` + `agent/memory_provider.py`
- `MemoryManager` orchestrates **one** external provider at a time (prevents schema bloat).
- Provider lifecycle: `initialize()` → `system_prompt_block()` → `prefetch(query)` (background recall before each turn) → `sync_turn(user, asst)` (async write after each turn) → `get_tool_schemas()` → `handle_tool_call()` → `shutdown()`.
- Optional hooks: `on_turn_start`, `on_session_end` (end-of-session extraction), `on_session_switch`, `on_pre_compress` (extract before context compression), `on_memory_write` (mirror built-in writes), `on_delegation` (parent observes subagent work), `backup_paths()`.
- Providers shipped (`plugins/memory/`): **Honcho, Hindsight, Mem0, supermemory, retaindb, byterover, openviking, holographic** — all external BYOK/local vector services.
- `TRIVIAL_PROMPT_RE` — skips prefetch for "ok/yes/thanks" etc. (token saving).

### Layer 3: Skills = procedural memory — `tools/skill_manager_tool.py`
- **Agent creates/edits/deletes skills itself** (`create`, `edit`, `patch`, `delete`, `write_file`, `remove_file`) — turns successful task approaches into reusable skills.
- Layout: `~/.hermes/skills/<name>/SKILL.md` + `references/`, `templates/`, `scripts/`, `assets/`.
- Backing modules: `skills_tool.py`, `skills_hub.py` (marketplace), `skills_sync.py`, `skills_guard.py` + `skills_ast_audit.py` (security audit of skill code), `skill_provenance.py`, `skill_usage.py`.
- `agent/learning_graph.py` + `learning_mutations.py` + `learn_prompt.py` — learning graph (how the agent logs what it learned).
- Memory extraction helpers in `jobs/` + `agent/context_compressor.py` / `conversation_compression.py` / `trajectory_compressor.py` — compaction pipeline.

---

## #3 — "Schedule" (Natural-language scheduling, unattended)

- `cron/scheduler.py` — `tick()` every 60s from gateway background thread; file-based lock (`~/.hermes/cron/.tick.lock`) for single-ticker across processes; cross-platform locking (fcntl/msvcrt).
- `cron/jobs.py` — storage `~/.hermes/cron/jobs.json`; output saved `~/.hermes/cron/output/{job_id}/{timestamp}.md`; atomic writes + file locks; croniter for 5-field cron; `create_job`, `claim_job_for_fire`, `mark_job_run`, `pause/resume/remove/update`.
- `cron/executions.py` — run lifecycle.
- **Natural language**: `tools/cronjob_tools.py` exposes a single compressed `cronjob` tool (actions: create/list/run/pause/etc.) → the LLM creates jobs from plain language ("every weekday at 9am..."). `cron/suggestions.py` + `suggestion_catalog.py` + `blueprint_catalog.py` — canned job blueprints the agent can offer.
- `cron/lifecycle_guard.py` — protects job lifecycle; `scheduler_provider.py` — pluggable schedulers (e.g. cloud cron).
- Unattended runs: cron job runs as its own agent session with allowed tools; results saved for review; heartbeat (`_CRON_RUN_HEARTBEAT_INTERVAL` 10s) keeps the inactivity watchdog at bay during long runs; hard ceiling 6h.

---

## #4 — "Delegate" (Isolated subagents, zero-context-cost)

- `tools/delegate_tool.py` — **the subagent architecture**:
  - Spawns child `AIAgent` instances with **fresh conversation** (no parent history), own `task_id` (own terminal session + file ops cache), inherited toolsets, focused system prompt from goal+context.
  - **Parent context only sees the delegation call + summary result** — never child's intermediate tool calls/reasoning → *zero context cost*.
  - `DELEGATE_BLOCKED_TOOLS` frozenset: `delegate_task` (no recursion), `clarify` (no user interaction), `memory` (no shared MEMORY.md writes), `send_message` (no cross-platform side effects), `cronjob` (no scheduling more work) — **security boundary for children**.
  - Single-task and **batch/parallel modes** (ThreadPoolExecutor workers). Top-level model calls run in background; orchestrator children wait for own workers to synthesize.
  - Approval in subagent threads: `_subagent_auto_deny` (safe default) vs `_subagent_auto_approve` (opt-in via `delegation.subagent_auto_approve`); TLS callback installed via `ThreadPoolExecutor(initializer=...)` to avoid deadlocking the parent TUI on stdin.
- `tools/async_delegation.py` — fire-and-forget background subagents.
- `agent/subagent_lifecycle.py` + `delegation_context.py` + `agent/background_review.py` — child session lifecycle, context wiring, review of child output.
- `tools/delegation_live_log.py` — stream child progress live to parent UI.
- `agent/turn_context.py` — turn-scoped context passing.

---

## #5 — "Search" (web search, browser automation, vision, image gen, TTS, multi-model)

**Web search — registry + plugin providers:**
- `agent/web_search_registry.py` + `agent/web_search_provider.py` — central registry; providers self-register at import via `register_provider()`. Active selection precedence: per-capability config → shared fallback → single eligible provider → legacy order `firecrawl → parallel → tavily → exa → searxng → brave-free → ddgs`. Capability filter: `supports_search` vs `supports_extract`.
- `tools/web_tools.py` — `web_search_tool` + `web_extract_tool`; LLM extraction via OpenRouter + Gemini 3 Flash → key excerpts + markdown summaries **to cut token usage**; debug mode.
- Providers in `plugins/web/`: firecrawl, parallel, tavily, exa, searxng, brave-free, ddgs (keyless options included).

**Browser automation — `tools/browser_tool.py`:**
- Backends: **local Chromium (default, zero-cost, headless)** via agent-browser CLI, Browserbase cloud, Browser Use cloud. Auto-detected from config/credentials.
- Accessibility-tree (ariaSnapshot) text representation → LLM never needs vision; element interaction via ref selectors (`@e1`); session isolation per task; task-aware LLM summarization; auto cleanup. Also: `browser_cdp_tool.py`, `browser_camofox.py`, `browser_dialog_tool.py`, `browser_supervisor.py`.

**Vision — `tools/vision_tools.py`:** centralized auxiliary vision router (OpenRouter / Nous / Codex / native Anthropic / custom OpenAI-compatible); downloads image → base64 → analyze.

**Image gen — `tools/image_generation_tool.py`:** FAL.ai catalog (`FAL_MODELS`) with per-model metadata + `supports` whitelist + upscale gating; unified prompt+aspect_ratio → model-specific payload. `agent/image_gen_provider.py` + `image_gen_registry.py`, `plugins/image_gen/`, `video_generation_tool.py` + `flux3_video_tool.py`, `xai_video_tools.py`.

**TTS — `tools/tts_tool.py`:** built-ins: **Edge TTS (free, no key)**, ElevenLabs, OpenAI, MiniMax, Mistral, Gemini, xAI, **NeuTTS / KittenTTS / Piper (local, free, no key)**; plus arbitrary custom command providers (`tts.providers.<name>`). `tts_streaming.py`, `streaming_tts_consumer.py` (stream audio to channels), `transcription_tools.py`.

**Multi-model reasoning:** `agent/moa_loop.py` (mixture-of-agents), `bounded_response.py`, `relay_runtime.py`.

---

## #6 — "Experiment" (Isolated sandboxing, 5 backends + hardening)

- `tools/environments/base.py` — **`BaseEnvironment` ABC, unified spawn-per-call model**: every command spawns a fresh `bash -c`; session snapshot (env vars, functions, aliases) captured once, re-sourced before each command; CWD persists via in-band stdout markers (remote) or temp file (local); bounded output collector (40/60 head-tail window) with **disk spill** (`_SPILL_CAP_CHARS` 5MB) so truncated output is recoverable without re-run.
- **Backends** (`tools/environments/`):
  - `local.py` — direct subprocess; MSYS/WSL path translation for Windows; provider env blocklist (secrets never leaked to commands).
  - `docker.py` — **hardened**: `cap-drop ALL`, `no-new-privileges`, PID limits, CPU/memory/disk limits, optional bind-mount persistence.
  - `ssh.py` — remote execution with ControlMaster connection persistence + `FileSyncManager` (scp file sync).
  - `singularity.py` — HPC container backend.
  - `modal.py` — cloud sandbox via Modal SDK (`Sandbox.create()` + `Sandbox.exec()`), persistent snapshot across sessions; `managed_modal.py`.
  - `daytona.py`, `vercel_sandbox.py` — extra cloud exec backends.
- `tools/code_execution_tool.py` — the code-runner tool; `tools/terminal_tool.py` — interactive terminal with approval callback (`prompt_dangerous_approval`); `write_approval.py`; `path_security.py` (path traversal guards); `tools/computer_use/` + `computer_use_tool.py` (GUI automation); `tools/tirith_security.py` + `threat_patterns.py` + `osv_check.py` (vuln scanning).
- Session isolation per task_id: each subagent/delegation gets its own sandbox + terminal + file state.

---

## The six pillars → our desktop app steal-list

| Hermes pillar | Mechanism | File | Steal for our app |
|---|---|---|---|
| Lives Everywhere | Plugin registry + adapter ABC + `plugin.yaml` (env gates, install hints) | `gateway/platform_registry.py`, `platforms/base.py`, `plugins/platforms/*` | **Direct blueprint for our connector/channel layer** — every platform a drop-in folder with declared env requirements. We already have `ConnectorOrchestrator` — extend with this manifest pattern. |
| Remember | Curated files + pluggable provider + skill self-creation | `memory_tool.py`, `memory_manager.py`, `skill_manager_tool.py` | Adopt **frozen-snapshot prompt injection** (preserves prefix cache — cheaper) + **agent-created skills** (we have skill infra in APP). |
| Schedule | Cron tick + job store + NL tool + blueprints | `cron/*`, `cronjob_tools.py` | Our automations pillar is the same shape; steal **job blueprints catalog** + per-job tool allowlist + run traces. |
| Delegate | Fresh-context children + `DELEGATE_BLOCKED_TOOLS` + batch mode | `delegate_tool.py`, `subagent_lifecycle.py` | **Adopt verbatim concept** — our subagents feature: blocked-tools security set, summary-only parent context, ThreadPool workers. |
| Search | Registry + plugin providers + keyless local defaults | `web_search_registry.py`, `web_tools.py`, `browser_tool.py`, `tts_tool.py` | Registry pattern matches our cascade; add **local-Chromium accessibility-tree browsing** and **Edge TTS / Piper free tiers**. |
| Experiment | `BaseEnvironment` spawn-per-call + hardened docker + remote backends | `environments/base.py`, `docker.py`, `ssh.py`, `modal.py` | **Direct blueprint for our code-execution pillar** — spawn-per-call model + cap-drop docker + disk-spill output collector. |

### What NOT to copy
- Full Python gateway (we're Node sidecar).
- 21 platform adapters (our scope: desktop + email + webhook first; registry allows growth).
- Agent-browser CLI dependency (we'll use our WebView layer instead, but keep the accessibility-tree idea).
- Nous-hosted tool gateway (subscription lock).
