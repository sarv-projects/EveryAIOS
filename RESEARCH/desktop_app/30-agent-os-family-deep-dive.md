# 30 — Agent-OS Family Deep-Dive: ZeroClaw · IronClaw · BrowserOS · EverOS · MemOS · stereOS · PhyAgentOS

> Fetched live 2026-08-06. Depth: **🟦 structure-verified** (official mdBook/README architecture, not source-read) for ZeroClaw/IronClaw/BrowserOS; 🟩 README-level for EverOS/MemOS/stereOS/PhyAgentOS. `agiresearch/AIOS` already covered at code level (docs 16 §5, 26 §5) — cross-referenced, not re-read.
> ⚠️ GitHub API rate-limited this pass — top-level file listings could NOT be pulled; all structure claims below come from each repo's **README + official docs** (mdBook for ZeroClaw, README for IronClaw/BrowserOS). No source files read.

> 🔗 **Repos:** https://github.com/zeroclaw-labs/zeroclaw · https://github.com/nearai/ironclaw · https://github.com/browseros-ai/BrowserOS · https://github.com/EverMind-AI/EverOS · https://github.com/MemTensor/MemOS · https://github.com/PhyAgentOS-Dev/PhyAgentOS · https://github.com/papercomputeco/stereOS · https://github.com/agiresearch/AIOS

## §0 The set (all live-verified this pass)

| Repo | ⭐ | License | One-liner | Relevance to our build |
|---|---|---|---|---|
| zeroclaw-labs/zeroclaw | 32,522 | MIT/Apache-2.0 | Single Rust binary agent runtime: ~20 LLM providers, 30+ channels, tools, WASM plugins | 🔥 **Highest** — same stack (Rust + BYOK + MCP + channels + security), we can copy crate layout |
| nearai/ironclaw | 12,591 | MIT/Apache-2.0 | Rust personal AI assistant (OpenClaw reimplementation) | 🔥 High — component table + WASM-sandbox security model |
| browseros-ai/BrowserOS | 12,931 | AGPL-3.0 | "A second browser for your AI agents" — Chromium fork + MCP agent platform | 🔥 High — our agent-browser tab layer + session replay |
| EverMind-AI/EverOS | 11,843 | (MIT implied) | Python local-first memory runtime, **Markdown as source of truth** + SQLite/LanceDB | 🟠 Medium-high — memory layer, Markdown-first principle matches doc 03 |
| MemTensor/MemOS | 10,643 | **Apache-2.0** (live-verified 2026-08-08) | "Memory Operating System" — unified store/retrieve/manage, Neo4j+Qdrant | 🟠 Medium — memory, but heavy deps (Neo4j/Qdrant); plugin internals unverified (pattern-level) |
| papercomputeco/stereOS | 485 | (custom) | Nix-built hardened Linux distro for AI agents ("mixtapes") | 🟡 Medium-low — sandbox/host isolation reference |
| PhyAgentOS-Dev/PhyAgentOS | 1,619 | MIT | Session-centered runtime for **embodied** intelligence (robotics) | ⚪ Low for desktop — family member only |
| agiresearch/AIOS | 6,186 | MIT | LLM-as-OS kernel (scheduler/llm_core/memory/syscall) | Already covered — docs 16/26 |

---

## §1 ZeroClaw — the flagship reference (32.5K⭐, Rust 2024)

**Positioning:** *"An agent runtime — a single Rust binary you configure and run. Talks to LLM providers (Anthropic, OpenAI, Ollama, ~20 others), reaches the world through 30+ channels (Discord, Telegram, Matrix, email, voice, webhooks, your own CLI), acts through tools (shell, browser, HTTP, hardware, custom MCP servers). Everything runs on your machine, with your keys, in your workspace."* — **this is almost exactly our architecture.** Their philosophy page: *You own it / Security-first with escape hatches / Minimal (binary size, deps, surface) / Provider-agnostic.*

### 1.1 Crate map (from official mdBook `architecture/overview.md` — 17 crates)

| Crate | Role | Steal for us |
|---|---|---|
| `zeroclaw-runtime` | Agent loop, **security policy enforcement**, SOP engine, cron scheduler, **SubAgents**, RPC layer | Our planner/executor split + SOP automation |
| `zeroclaw-config` | TOML schema, **secrets encryption**, **autonomy levels**, workspace resolution | Config = TOML + encrypted secrets (doc 03 §2) |
| `zeroclaw-api` | **Kernel ABI**: traits `ModelProvider`, `Channel`, `Tool`, `Memory`, `Observer`, `RuntimeAdapter`, `Peripheral` | Our plugin trait set — copy this trait list verbatim |
| `zeroclaw-providers` | All LLM client impls + **hint-based router** + **same-provider retry wrapper** | BYOK router (docs 03 §3 / 19) — retry wrapper pattern |
| `zeroclaw-channels` | 30+ messaging integrations (Discord/Slack/Telegram/Matrix/email/voice/…) | Channel abstraction for our connector hub |
| `zeroclaw-gateway` | HTTP/WebSocket gateway, **web dashboard**, webhook ingress | Our desktop↔webview IPC + dashboard |
| `zeroclaw-tools` | Callable tools (browser, HTTP, hardware probes) | Tool registry |
| `zeroclaw-tool-call-parser` | Model-side tool-call syntax parsing/normalisation | Grammar-enforced tool extraction (doc 03 §3) |
| `zeroclaw-memory` | Conversation memory, embeddings, **vector retrieval** | Memory layer |
| `zeroclaw-plugins` | **Sandboxed WASM plugin host (WIT component model)** | WASM skill sandbox (doc 03 §6 The Forge) |
| `zeroclaw-hardware` | Hardware HAL (GPIO/I2C/SPI/USB) | N/A desktop |
| `zeroclaw-infra` | SQLite session backend, **debouncers**, **stall watchdog** | Watchdog = our GenOffice watchdog pattern (doc 28) |
| `zeroclaw-log` | Single log surface: **JSONL schema, attribution**, `record!`/`scope!` macros, `/api/logs`, `Observer` bridge | Structured audit logging (doc 03 §8) |
| `zeroclaw-spawn` | **Sanctioned `tokio::spawn` wrapper (`spawn!`) that propagates attribution** | Async attribution — tiny but brilliant |
| `zeroclaw-macros` | Derive macros for config, tool registration | Reduce boilerplate |
| `zerocode` | **Terminal UI** (config pane, themes, remote WSS setup, env pass-through) | TUI reference |
| `aardvark-sys`, `robot-kit` | Specialised hardware | N/A |

⭐ **Microkernel roadmap (RFC #5574):** actively splitting `zeroclaw-runtime` — kernel shrinks to agent loop + policy enforcement, everything else behind feature flags. Same direction as our lean-core design.

### 1.2 Security model (from `philosophy/security-first.md` — this is the Trust Ladder in production)

Default autonomy = **`supervised`**: medium-risk ops need approval, high-risk ops blocked. Ships:
- **Workspace boundaries** — agent can only touch paths inside configured workspace (= our Isolated File Access Hard-Floors, doc 03 §8)
- **Command allow/deny lists** + **shell-policy validation** (= our Regex Interceptors)
- **OS-level sandboxes**: Docker, Firejail, Bubblewrap, **Landlock (Linux)**, Seatbelt (macOS) — Landlock is the modern no-root answer
- **Tool receipts** — *cryptographically-linked audit log of every tool call*
- **Emergency stop** (`zeroclaw estop`) + **OTP-gated actions**
- **YOLO mode** — one config preset disabling guardrails; "loud, logged, obviously named. Not the default." (perfect UX framing for our power-user escape hatch)

### 1.3 Request lifecycle (from mdBook sequence diagram)

```
User → Channel (message/DM/webhook) → Runtime.deliver_message(ctx)
     → Provider.chat(messages, tools) → stream: text | tool_call
     → Security.validate(tool_call) → Tool.execute → Memory.record
```

Same shape as every agent, but note: **Security is an explicit hop between provider output and tool execution** — that's the deterministic guardrail placement we planned.

---

## §2 IronClaw (12.6K⭐, Rust) — OpenClaw reimplemented in Rust

**Heritage:** *"Rust reimplementation inspired by OpenClaw"* with a **`FEATURE_PARITY.md`** tracking matrix (a model for our own parity tracking). Key deltas: **Rust vs TypeScript** (native perf, memory safety, single binary), **WASM sandbox vs Docker**, **PostgreSQL vs SQLite** (production persistence), security-first design.

### 2.1 Component table (from README Architecture section)

| Component | Purpose | Steal |
|---|---|---|
| Agent Loop | Main message handling + job coordination | Core loop |
| **Router** | Classifies user intent (**command / query / task**) | Intent routing — cheap classification before planning |
| Scheduler | **Parallel job execution with priorities** | Our scheduler (doc 03 §7) |
| Worker | Executes jobs: LLM reasoning + tool calls | Executor |
| **Orchestrator** | **Container lifecycle, LLM proxying, per-job auth** | Docker sandbox + per-job key scoping |
| Web Gateway | Browser UI: chat, memory, jobs, logs, extensions, routines | Desktop dashboard surface |
| **Routines Engine** | Scheduled (cron) **and reactive (event, webhook)** background tasks | Automations engine (doc 03 §7) |
| Workspace | Persistent memory with **hybrid search** | Memory |
| **Safety Layer** | Prompt-injection defense + content sanitization | Our prompt-injection regex (doc 25 PageIndex findings) |

**Ops UX (steal whole):** rustup-style single-line installer → `ironclaw onboard` guided setup (pick provider → hidden key prompt → provisions config + **encrypted credential store** + WebUI login token) → `ironclaw status` / `repl` / `run --message`. This is the cleanest BYOK onboarding flow we've seen — copy it for doc 19.

---

## §3 BrowserOS neo (12.9K⭐, AGPL-3.0) — the agent browser

**Positioning:** *"Two browsers: one for your agents, one for you. A second browser just for your AI agents — import your logins from Chrome in one click, connect Claude Code, Codex, Cursor, or any MCP agent, hand off web tasks. Agents run in parallel in their own tabs. You watch live, or replay any session like a video."*

**Architecture (from README §Architecture — verified structure):**
```
packages/browseros/            Chromium fork + build system (Python)
  chromium_patches/  build/  resources/
packages/browseros-agent/      Agent platform (Rust/TypeScript/Go)
  apps/
    claw-server-rust/    neo backend: MCP endpoint + JSON API (Rust)
    claw-app/            neo dashboard extension (WXT + React): watch/replay/manage sessions
    claw-onboard/        neo onboarding flow
    server/              Browser MCP server + AI agent loop (Bun)
    app/                 extension UI (new tab, side panel chat)
    cli/                 control from terminal (Go)
  packages/
    cdp-protocol/        Type-safe Chrome DevTools Protocol bindings
```

**Why it matters to us:**
- **Session replay** ("replay any session like a video") — the agent tab records its own screen state; our agent-browser should record DOM/screenshot deltas for replay + audit.
- **Login hand-off**: one-click Chrome profile import = solving the auth wall without building our own credential store.
- **cdp-protocol crate** — type-safe CDP bindings is the exact tool our embedded browser needs (vs hand-rolled CDP).
- Architecture split **browser (Chromium fork) + agent platform (Rust/Go/Bun)** — heavy browser isolated from agent core; matches our shell/core decoupling.
- ⚠️ AGPL-3.0 — we can **learn from it, not copy code** into a MIT/Apache project.

---

## §4 EverOS (11.8K⭐, Python) — Markdown-first memory

**The pitch (README-verified):** *"A Python library and local-first memory runtime… stores conversations, files, and agent trajectories as **readable Markdown**, then syncs local SQLite and LanceDB indexes for fast retrieval and self-evolving reuse."*

**Their comparison table's key claim (steal the principle, not the code):**
- ✅ Canonical `.md` files — readable, editable, **diffable, Git-versioned** (vs "usually API/vector/graph dashboards")
- ✅ Markdown as source of truth → indexes are **derived, rebuildable** caches, not primary storage

This is exactly the **Markdown Blueprints** principle from doc 03 §2 — the difference: EverOS uses it for *memory*, we use it for *automation state*. Same idea, two surfaces. `pip install everos`, local-first, no server.

---

## §5 MemOS (10.6K⭐, ArXiv 2507.03724) — Memory Operating System

**Pitch:** *"Unifies store / retrieve / manage for long-term memory, enabling context-aware and personalized interactions with KB, multi-modal, tool memory, and enterprise-grade optimizations."* Concepts: **memory cubes** (named containers), self-host via **Neo4j + Qdrant** (⚠️ heavy — Docker orchestration needed), or hosted cloud API, plus a **MemOS plugin** for AI agents.

**Assessment for us:** strong memory *research* (memory cubes = namespaced memory = our project-tagged warm sets, doc 03 §4), but **Neo4j+Qdrant self-host is the opposite of lightweight** — we stay SQLite + LanceDB (docs 03/08). Watch the plugin interface; skip the infra.

---

## §6 stereOS (485⭐) — hardened Linux for agents

**Pitch:** *"A Linux-based operating system hardened and purpose-built for AI agents."* Nix-based images called **mixtapes** (e.g. `opencode-mixtape` bundles the agent binary + appends to the agent user's **restricted PATH**, env via `ANTHROPIC_API_KEY`/`OPENAI_API_KEY`).

**System (README-verified):**
- `admin` user/group + `agent` user/group with `/home/agent/workspace` (privilege separation baked into the OS image)
- `stereosd` (system daemon) + `agentd` (agent management daemon) = control plane for operators
- Image formats: raw EFI, QCOW2, **direct-kernel boot artifacts**, **AWS Lambda MicroVM source** (Dockerfile bundle — agent as a Lambda!)

**Steal:** the **agent-user isolation model** (dedicated unprivileged user + workspace dir + restricted PATH) is a simpler, lighter alternative to full VM sandboxes for background jobs; Lambda-MicroVM packaging for serverless agent runs.

---

## §7 PhyAgentOS (1.6K⭐) — embodied intelligence (low relevance, noted for completeness)

Session-centered runtime for **robotics/sim embodied agents** — "Cognitive-Physical Decoupling". Interesting bits: `SessionVerifier` / `VerifySessionTool` (agent-verification of executed sessions) and Behavior-1K benchmarking. **Not applicable to a desktop app** beyond the verification-session idea (we already have eval harnesses in doc 07).

---

## §8 What-to-steal summary (mapped to our build pillars)

| Pillar (doc 03) | Source repo | Concrete steal |
|---|---|---|
| Core shell/loop | ZeroClaw | 17-crate layout; **`zeroclaw-api` kernel ABI traits** (ModelProvider/Channel/Tool/Memory/Observer/…); microkernel roadmap (RFC #5574) |
| BYOK providers | ZeroClaw + IronClaw | `hint-based router` + same-provider retry wrapper; IronClaw's `onboard` guided setup + encrypted credential store + WebUI token |
| Trust Ladder / security | ZeroClaw | `supervised` default autonomy; workspace boundaries; allow/deny lists; Landlock/Firejail/Bubblewrap/Seatbelt; **tool receipts**; `estop` + OTP; YOLO-mode framing |
| Automation engine | IronClaw | Routines Engine (cron + event + webhook reactive triggers); Scheduler w/ priorities; Router intent classification (command/query/task) |
| Agent browser | BrowserOS | Parallel agent tabs; **session replay**; one-click Chrome-login import; `cdp-protocol` type-safe CDP bindings |
| Memory layer | EverOS + MemOS | Markdown-as-source-of-truth + derived SQLite/LanceDB indexes (rebuildable cache); memory-cube namespacing concept (skip Neo4j/Qdrant) |
| Sandbox/host isolation | stereOS | Agent-user privilege separation, restricted PATH, workspace home; Lambda-MicroVM packaging |
| Channels/connector hub | ZeroClaw | 30+ channel abstraction; gateway (HTTP/WS/dashboard/webhook ingress) as our hub pattern |
| Audit logging | ZeroClaw | JSONL schema + attribution via `spawn!` wrapper + tool receipts — the `zeroclaw-log`+`zeroclaw-spawn` pairing |
| Watchdog | ZeroClaw | `zeroclaw-infra` stall watchdog (same problem as GenOffice's watchdog.ts, doc 28) |

**Parity-tracking lesson (IronClaw):** keep a `FEATURE_PARITY.md` matrix like IronClaw's vs OpenClaw — we should do the same against these repos so every copied capability is traceable.

---

## §9 Remaining open items (honest gaps)

- ⚠️ No **source files** read this pass (API rate-limited) — ZeroClaw crate internals, IronClaw `FEATURE_PARITY.md` contents, BrowserOS `claw-server-rust` code, EverOS package layout all **docs-verified only**.
- ZeroClaw memory-module docs (`memory.md`/`config.md` guessed paths 404'd — book uses `crates.md`, `request-lifecycle.md` etc.; re-list `docs/book/src/architecture/` when API resets).
- MemOS license/plugin internals unverified; EverOS exact index schema (SQLite vs LanceDB split) unread.
- AIOS (agiresearch) deliberately not re-read — see docs 16/26.

*Full repo list + live stars consolidated in doc 27; this family adds 7 repos → ledger now 129.*
