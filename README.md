<p align="center">
  <img src="src-tauri/icons/128x128.png" width="80" alt="EveryAIOS" />
</p>

<h1 align="center">EveryAIOS</h1>
<h3 align="center">Every AI. One Space.</h3>

<p align="center"><strong>Every Model. Every Agent. Every Task. One Space.</strong></p>

<p align="center">
  One desktop cockpit for your daily work — talk through ideas, crunch spreadsheets, edit documents, automate browsers, control your desktop, and build software.<br/>
  <strong>Run your favorite coding agents (Claude Code, OpenAI Codex, Google Antigravity, Cline, Aider, OpenCode, or our Native Agent).<br/>
  Bring any AI model (Claude 3.7 Sonnet, OpenAI o3 / GPT-4o, DeepSeek-R1 / V3, Qwen 2.5 Coder, Gemini 2.0, or local offline AI via Ollama). Keep 100% of your data private.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/architecture-v3.80%20Two--Plane%20Native-blue?style=flat-square" alt="Architecture v3.80" />
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue?style=flat-square" alt="Cross Platform" />
  <img src="https://img.shields.io/badge/privacy-100%25%20Local--First%20%2B%20Encrypted-success?style=flat-square" alt="Privacy First" />
  <img src="https://img.shields.io/badge/capabilities-166%20Indexed%20(1220%20Verified)-green?style=flat-square" alt="166 Capabilities" />
  <img src="https://img.shields.io/badge/security-Guard--2%20%2B%20OS%20Sandbox%20%2B%20Merkle-purple?style=flat-square" alt="Security" />
  <img src="https://img.shields.io/badge/pricing-Free%20%26%20Open%20Source-green?style=flat-square" alt="Free and Open Source" />
  <img src="https://img.shields.io/badge/license-MIT%2FApache--2.0-lightgrey?style=flat-square" alt="License" />
</p>

---

> ### 🚀 Architecture v3.80 Active Development & Verification
> **EveryAIOS is built in the open with rigorous evidence-based engineering.** The desktop app, native Rust core (22 crates), TypeScript sidecar coordinator, document engines, multi-platform OS sandboxes, and SQLCipher encrypted vault run end-to-end today. Pre-packaged installers (`.msi`, `.dmg`, `.AppImage`) are finalizing in the release pipeline. Developers can build and run directly from source right now.
>
> 📊 **166 capabilities across 11 layers (A–K) are synchronized in lockstep**, backed by 1,220 verified milestones, 330 zero-defect IPC commands, automated security gates (S1–S6), and failure injection resilience suites (L1–L6).
>
> 🔗 [Detailed Feature Matrix](ARCH/09-FEATURE-MATRIX.md) &nbsp;·&nbsp; [Architecture Overview](ARCH/17-NATIVE-AGENT.md) &nbsp;·&nbsp; [Development Roadmap](TODO.md) &nbsp;·&nbsp; [Release Changelog](SPEC-CHANGELOG.md)

---

## Why EveryAIOS? See the Difference

Most people today juggle **3 to 5 separate AI tools**: a chat app for questions, an IDE for code, an online spreadsheet tool, and separate browser plugins. You pay multiple \$20/month subscriptions, constantly hit message rate limits, and re-copy context all day.

**EveryAIOS replaces that entire mess with one app:**

| Feature | **EveryAIOS** | **ChatGPT / Claude Desktop** | **Cursor / Windsurf** | **Terminal Tools (Claude Code, Aider)** |
| :--- | :---: | :---: | :---: | :---: |
| **All-in-One: Chat + Cowork + Coding + Swarm** | ✅ **Yes (One Cockpit)** | ⚠️ **Chat-Centric**<br/>*(Limited MCP/canvas; no unified IDE, Excel engine, or swarm)* | ⚠️ **Code Editor Only**<br/>*(Agent Mode for coding; no Office/documents or general cowork)* | ⚠️ **Terminal Only**<br/>*(Headless CLI; no document viewers or visual interface)* |
| **Bring Any AI Model You Want**<br/>*(Claude 3.7 Sonnet, OpenAI o3 / GPT-4o, DeepSeek-R1 / V3, Qwen 2.5 Coder, Gemini 2.0, Ollama)* | ✅ **Universal Freedom**<br/>*(100+ frontier & local models via BYOK or 100% offline with Ollama/MLX/vLLM)* | ❌ **Locked Walled Garden**<br/>*(Restricted to their own models only)* | ⚠️ **Curated Cloud Selection**<br/>*(Proprietary cloud models; limited local LLM support)* | ⚠️ **Limited / Complex**<br/>*(Claude Code is Anthropic-only; Aider requires manual terminal setup)* |
| **Host External Coding Agents**<br/>*(Claude Code, OpenAI Codex, Google Antigravity, Cline, Aider, OpenCode)* | ✅ **Run them all inside EveryAIOS**<br/>*(Native-first ACP agent hosting with zero capability degradation)* | ❌ **None**<br/>*(Cannot host external coding agents)* | ❌ **Locked to Editor Agent**<br/>*(Cannot run competing CLI agents)* | ⚠️ **Isolated CLIs**<br/>*(Separate terminal windows without unified app context)* |
| **Multi-Agent Swarms & Fleet Isolation**<br/>*(Run 20–30 subagents concurrently without git collisions)* | ✅ **Dedicated Git Worktrees**<br/>*(Mutex `GitOperationQueue`, 3-file blackboards, concurrency governor)* | ❌ **None**<br/>*(Single turn loop)* | ❌ **None**<br/>*(Single composer/agent thread)* | ❌ **None**<br/>*(Single terminal process)* |
| **Native Agent Tools & Dynamic Context**<br/>*(`ask`, `plan`, `todo`, `subagent`, `@Codebase`, `@Git`, `@Problems`)* | ✅ **First-Class Native Tools**<br/>*(Dynamic `@-mentions` injected below `CACHE_BOUNDARY`; 90% cost savings)* | ⚠️ **Basic Context**<br/>*(Flat attachment upload)* | ⚠️ **Editor Symbols**<br/>*(`@Files`, `@Codebase` cloud-indexed)* | ⚠️ **CLI Flags**<br/>*(Manual `/add` file lists)* |
| **OS-Level Sandboxing & Netfloor SSRF Guard**<br/>*(Restricted tokens, bubblewrap, seatbelt, private subnet blocks)* | ✅ **Multi-Platform OS Sandboxes**<br/>*(Windows Job Objects, macOS Seatbelt, Linux bwrap; zero-I/O `netfloor`)* | ❌ **None / Cloud Only**<br/>*(Remote execution only)* | ⚠️ **None**<br/>*(Runs with full user desktop permissions)* | ⚠️ **Limited**<br/>*(Requires external container configuration)* |
| **Real Office Spreadsheets & Documents**<br/>*(Recalculates formulas, edits Word, PowerPoint & PDFs)* | ✅ **Built-in Local Calculation Engine**<br/>*(IronCalc `.xlsx` engine, surgical OOXML `.docx`, `.pptx`, `.pdf`, 0 tokens on math)* | ❌ **Burns Message Quota**<br/>*(Guesses formulas as text or runs cloud Python; destroys formatting)* | ❌ **None** | ❌ **None** |
| **Conversational Calendar & Background Automations**<br/>*(Encrypted calendar, natural language scheduling, tray daemon)* | ✅ **Built-in SQLCipher Calendar & Daemon**<br/>*(Natural language scheduling, 5-field cron, unattended background alerts)* | ❌ **None**<br/>*(Active chat window only)* | ❌ **None** | ❌ **None**<br/>*(Requires external system cron)* |
| **Cognitive Failure Avoidance & Memory**<br/>*(Learns from errors, 5-tier memory, negative constraints)* | ✅ **AvoidanceStore + 5-Tier Memory**<br/>*(Injects learned negative constraints to kill error loops; taste profile)* | ⚠️ **Basic Memory**<br/>*(Unstructured text snippets; repeats errors)* | ⚠️ **Basic Memory**<br/>*(Local rules files only)* | ❌ **None**<br/>*(Amnesic across sessions)* |
| **Autonomous Browser Use (Web Automation)**<br/>*(37 CDP tools, navigates web, fills forms, reuses logins)* | ✅ **Built-in Browser Engine**<br/>*(Multi-browser: Brave, Chrome, Edge; safe session vault reuses logins)* | ⚠️ **Limited / Slow**<br/>*(Cloud browsing only; preview is slow/costly)* | ❌ **None** | ❌ **None** |
| **Native Computer Use (Desktop Automation)**<br/>*(Controls desktop apps, clicks UI elements, OCR, keyboard/mouse)* | ✅ **Native OS Desktop Control**<br/>*(Windows UIA/WGC, macOS AX, Linux X11; visual grounding & OCR)* | ⚠️ **Cloud CUA Beta**<br/>*(Expensive per-screenshot token streaming; macOS only)* | ❌ **None** | ❌ **None** |
| **Deep Web Research & Free Search**<br/>*(Multi-source research with zero API keys)* | ✅ **Built-in Tiered Search Cascade**<br/>*(SearXNG + DuckDuckGo fallback, cited reports, $0 search fees)* | ⚠️ **Burns Chat Quota**<br/>*(Limited web search or requires paid Perplexity/search keys)* | ⚠️ **Basic Search**<br/>*(Short code snippets only)* | ⚠️ **Requires Search API**<br/>*(Manual Tavily/Serper setup)* |
| **Frontier Local Performance (P45 Benchmarks)**<br/>*(Ultra-fast disk & state engine)* | ✅ **High-Throughput SQLite + WAL**<br/>*(3,546 MB/s read, 1.19M writes/s, 19ns route lookup, 401k audit/s)* | ❌ **Cloud Latency**<br/>*(Subject to network round-trips)* | ⚠️ **Varies** | ⚠️ **Varies** |
| **Safety, 1-Click Undo & Time Travel** | ✅ **Safe Approval Cards & Shadow Git**<br/>*(Isolated Guard approval window + instant 1-click file rollback)* | ❌ **No File Rollback**<br/>*(No local file versioning)* | ⚠️ **Standard Git / Checkpoints**<br/>*(Editor-only checkpoints)* | ⚠️ **Terminal Prompts**<br/>*(CLI prompts or manual git)* |
| **100% Private & Local-First** | ✅ **Local Encrypted Vault**<br/>*(AES-256 SQLCipher; run 100% offline air-gapped with zero telemetry)* | ❌ **Cloud-Hosted**<br/>*(All data sent to remote cloud infrastructure)* | ⚠️ **Cloud Indexing**<br/>*(Codebase indexed and processed on cloud servers)* | ⚠️ **Local CLI, Cloud APIs**<br/>*(Terminal is local, but sends files to cloud LLMs)* |
| **Price** | 🟢 **Free & Open Source**<br/>*(Pay only pennies for raw token use or $0 offline)* | 🔴 **$20 – $200 / month**<br/>*(Single-user monthly fee)* | 🔴 **$20 / month**<br/>*(Plus overage fees for high usage)* | 🟢 **Free / Open Source**<br/>*(CLI only, pay raw token costs)* |

---

## The 3 Pillars in One Cockpit

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                    EVERYAIOS DESKTOP COCKPIT                                     │
├──────────────────────────────┬───────────────────────────────────┬───────────────────────────────┤
│           1. CHAT            │             2. COWORK             │            3. CODE            │
│  • Brainstorm & analyze      │  • Real Excel formula engine      │  • Fix bugs & build software  │
│  • Free deep web research    │  • Word, PowerPoint, PDFs         │  • Host Claude Code, Codex,   │
│  • 5-tier cognitive memory   │  • Autonomous Browser Use (37)    │    Antigravity, Cline, Aider  │
│  • AvoidanceStore loop guard │  • Native Computer Use (OCR)      │  • Multi-agent swarm worktrees│
│  • Dynamic model routing     │  • Conversational Calendar        │  • First-class `plan` & `ask` │
│  • 90% prompt cache savings  │  • Unattended tray automations    │  • 1-Click time-travel rollback│
└──────────────────────────────┴───────────────────────────────────┴───────────────────────────────┘
```

### 1. 💬 Chat & Ideate (Intelligent, Context-Aware, and Cost-Efficient)
* **5-Tier Local Memory:** Working memory, episodic session logs, semantic retrieval, temporal knowledge graph, and personal user taste profiles remember your project conventions across sessions with zero extra token costs.
* **Cognitive Failure Avoidance:** The `AvoidanceStore` captures root causes from past execution failures and injects learned negative constraints into the prompt, preventing repetitive error loops.
* **Free Deep Web Research:** Built-in tiered search cascade (SearXNG + DuckDuckGo) gathers fresh facts, cross-checks sources, and synthesizes cited reports without paid search API subscriptions.
* **Cache-Affine Prompt Assembly:** Dynamic context is organized with byte-stable prefixes above a fixed `CACHE_BOUNDARY`, cutting your API token costs by up to 90% and making turns feel instantaneous.
* **Dynamic Model Routing:** Automatically select the optimal model tier—routing simple queries to lightning-fast models (DeepSeek-V3, Claude 3.5 Haiku, Gemini 2.0 Flash) and deep engineering to frontier reasoning models (Claude 3.7 Sonnet, DeepSeek-R1, OpenAI o3, Qwen 2.5 Coder).

### 2. 📊 Cowork (Real Documents, Autonomous Browsing, Computer Use & Automations)
* **Real Excel Spreadsheets:** Powered by the embedded IronCalc engine, EveryAIOS recalculates formulas across `.xlsx` workbooks, updates charts, and preserves cell formatting with 0 tokens spent on math.
* **Word, PowerPoint & PDF Processing:** Surgical byte-stable edits for `.docx`, `.pptx`, and `.pdf` files. Fill interactive forms, swap presentation slides, extract tables, redact sensitive data, and draft publication-ready documents.
* **Autonomous Browser Use:** 37-tool browser engine navigates complex websites, logs into portals with your existing session vault, fills forms, and extracts clean data without ads or clutter.
* **Native Computer Use:** Controls desktop software across Windows, macOS, and Linux. Takes high-resolution screenshots, locates UI controls with visual grounding and OCR, clicks buttons, and types text to automate workflows in apps without APIs.
* **Conversational Calendar & Scheduling:** Manage your schedule with natural language ("Book project sync Friday at 3pm"), backed by encrypted SQLCipher storage and full calendar view integration.
* **Unattended Background Automations:** Schedule recurring morning digests, repo health monitors, or data synchronizations that run reliably via the system tray daemon—even when the main app window is closed.
* **Storage Intelligence:** Spot duplicate files using 7-stage cryptographic hashing (xxHash3 + BLAKE3), identify space hogs, and visualize disk usage with interactive treemaps.

### 3. 💻 Autonomous Coding (Precision, Swarms & Complete Safety)
* **Two-Plane Agent Hosting:** Prefer Claude Code or Aider for terminal work? Rely on Google Antigravity or Cline for agentic tasks? Need OpenAI Codex or OpenCode? EveryAIOS hosts them inside the same cockpit alongside our Native Agent without degrading their native capabilities.
* **First-Class Native Tools:** Includes built-in `ask` (clarification dialogs with single/multi-select options), `plan` (blueprint DAG decomposition), `todo` (real-time task checklist tracking), and `subagent` (delegation to isolated worker agents).
* **Dynamic `@-Mention` Context Resolution:** Reference `@Codebase` (Tree-sitter symbol graph + BM25 indexing), `@File`, `@Git`, `@Doc`, `@Web`, `@Problems` (live LSP compiler diagnostics), `@Memory`, or `@Terminal` directly in prompts.
* **Multi-Agent Swarm Fleets & Worktrees:** Spin up 20–30 subagents concurrently. Each agent executes in its own dedicated Git worktree (`.everyaios/worktrees/task-<id>`) with a serialized `GitOperationQueue`, 3-file blackboards, and zero dirty-working-tree collisions.
* **Unified Code Editing Ladder:** Changes follow an exact-match single-occurrence invariant → AST structural replacement → fuzzy fallback with shadow diff verification. If an edit is ambiguous, it halts and asks rather than guessing.
* **1-Click Time-Travel Rollback:** Every single file change is saved in an isolated version checkpoint. If an agent's change isn't what you wanted, click **"Undo"** to instantly restore your workspace to the exact prior second.
* **Test-Driven Verification (TDD Loop):** Proves code fixes work by running background test suites before proposing changes for user review (RED → GREEN).

---

## Bring Your Favorite Model & Hardware

You are never locked into a single AI provider:

* **Cloud Frontier & Reasoning Models:** Anthropic (Claude 3.7 Sonnet hybrid reasoning & 3.5 Sonnet), OpenAI (o3, o3-mini, o1, GPT-4o), Google (Gemini 2.0 Pro & Flash).
* **High-Speed, Global & Specialized Models:** DeepSeek (DeepSeek-R1 reasoning & DeepSeek-V3 671B MoE), Alibaba Qwen (Qwen 2.5 & Qwen 2.5-Coder 32B), Meta (Llama 3.3 70B), Mistral (Codestral, Mistral Large), Groq LPUs (ultra-fast inference), SiliconFlow, OpenRouter, and any OpenAI-compatible endpoint.
* **100% Private Offline Models:** Run models completely offline on your own hardware using **Ollama**, **LM Studio**, Apple Silicon **MLX**, or **vLLM / llama.cpp**. Zero data ever leaves your computer.
* **Automatic Rate-Limit Protection:** Add backup API keys. If your primary key hits a rate limit, EveryAIOS switches to your backup key automatically so your work isn't interrupted.

---

## Safety You Can See and Control

Most AI tools either do nothing on their own, or have full unmonitored access to your computer. EveryAIOS uses a simple **Trust Ladder**:

1. 🔍 **Exploring & Reading is Free:** Reading files, researching the web, or planning actions happens automatically without constant nagging popups.
2. 🛡️ **Changes Require Approval:** Modifying files, running terminal commands, or sending emails presents a clear, readable **Approval Card** showing you the exact changes before they happen.
3. 🔒 **Protected Boundaries:** Sensitive folders (like `.git`, `.ssh`, or passwords) and cloud metadata are locked down at the system level.
4. ↩️ **Everything is Reversible:** Any file change can be rolled back with one click.

---

## Installation & Getting Started

### 📦 Desktop App Installers
> **Pre-packaged installers for Windows (`.msi`), macOS (`.dmg`), and Linux (`.AppImage`) are coming soon in our upcoming V1 release.**

> In the meantime, you can easily run EveryAIOS from source.

### 🛠️ Running from Source (Quick Setup)

```bash
# 1. Clone the repository
git clone https://github.com/sarv-projects/EveryAIOS
cd EveryAIOS/desktop_app

# 2. Install dependencies
pnpm install

# 3. Build the background coordinator
pnpm --filter @everyaios/coordinator build
mkdir -p src-tauri/bin && cp packages/coordinator/dist/coordinator src-tauri/bin/coordinator

# 4. Start the app
cd ui && pnpm install && cd ..
cd src-tauri && cargo tauri dev
```

**Prerequisites:** Rust, Node.js (v20+), pnpm, and standard Tauri prerequisites for your OS.

---

## Real-World Examples

* 🐝 **Orchestrate a Multi-Agent Swarm:** Have the Primary Chief delegate 5 distinct subtasks (backend API, database schema, frontend UI, unit tests, documentation) to 5 concurrent subagents. Each agent works in an isolated Git worktree without merge conflicts, synchronizing via shared 3-file blackboards.
* 📊 **Update a Complex Financial Model:** Drop in a 20-tab Excel workbook. EveryAIOS recalculates all dependent formulas using the embedded IronCalc engine, updates financial metrics, and leaves all styles and macros untouched with 0 tokens wasted on math.
* 📅 **Natural Language Calendar & Briefings:** Tell EveryAIOS: *"Schedule a 45-minute sprint planning meeting on Thursday at 2:00 PM and set a daily 8:30 AM background automation to review PRs and pull tech news."* The event is saved to the local encrypted calendar and scheduled in the system tray.
* 📑 **Update an Executive Slide Deck:** Drop in a 60-slide `.pptx` presentation. EveryAIOS updates key metrics, restyles charts, and preserves the master presentation theme without corrupting untouched XML elements.
* 🌐 **Autonomous Browser Research:** Direct the agent to compare pricing across 8 SaaS vendors. It navigates paginated catalogs, logs into accounts via the zero-auth session vault, downloads price sheets, and compiles a comparison spreadsheet.
* 🖥️ **Desktop Computer Use:** Direct the agent to extract 100 customer records from a spreadsheet and enter them into a legacy desktop accounting tool. It views the screen, locates form fields with visual grounding & OCR, clicks, and inputs data automatically.
* 🛠️ **Fix a Failing Test Suite with TDD:** Point EveryAIOS at a repository. It analyzes compiler diagnostics with `@Problems`, isolates the failing test, implements the fix in a sandbox worktree, and runs the test suite to prove the fix works (RED → GREEN) before presenting an approval card.

---

## Built for Real Work: 12 Core Subsystems

EveryAIOS is engineered from the ground up as a native desktop platform rather than a simple web wrapper:

### 1. 🧠 Universal Model Freedom (Cloud & 100% Local Offline AI)
- **Frontier Cloud & Reasoning Models:** Anthropic (Claude 3.7 Sonnet hybrid reasoning, 3.5 Sonnet & Haiku), OpenAI (o3, o3-mini, o1, GPT-4o), Google (Gemini 2.0 Pro & Flash).
- **High-Speed & Specialized Open Weights:** DeepSeek (DeepSeek-R1 reasoning & DeepSeek-V3 MoE), Alibaba Qwen (Qwen 2.5 & 2.5-Coder 32B), Meta (Llama 3.3 70B), Mistral (Codestral, Large), Groq LPUs, and any OpenAI-compatible provider.
- **100% Private Offline Runtimes:** Native first-class integration with **Ollama**, **LM Studio**, **vLLM / llama.cpp**, and Apple Silicon **MLX**. Keep all prompts, files, and inference completely local.
- **Automatic Key Pool Failover:** Configure multiple API keys per provider. If a key encounters rate limiting (429), EveryAIOS automatically fails over to a backup key without dropping the active session.

### 2. ⚡ Native Agent Plane & First-Class Tool Suite
- **First-Class Tools:** Built-in native tools provide structured interaction:
  - `ask`: Solicits user decisions and clarifications via interactive UI dialogs (single and multi-select choices), eliminating hallucinated assumptions.
  - `plan`: Blueprint DAG planning with step status tracking and circuit breakers (Skip/Retry/Escalate/Takeover).
  - `todo`: Structured checklist management with live progress indicators.
  - `subagent`: Spawns isolated specialist subagents with derived permissions and dedicated execution scopes.
- **Dynamic `@-Mention` Context Providers:** Type `@Codebase`, `@File`, `@Git`, `@Doc`, `@Web`, `@Problems`, `@Memory`, or `@Terminal` to resolve live workspace context into the prompt below `CACHE_BOUNDARY`.
- **Unified Edit Ladder:** Ensures high-precision modifications via strict exact-matching, AST-aware structural replacement, and fuzzy fallbacks backed by shadow preflights.

### 3. 🐝 Multi-Agent Swarm Fleets & Git Worktree Isolation
- **High-Concurrency Swarm Orchestration:** The Primary Chief can coordinate 20–30 subagents concurrently without cross-process interference.
- **Dedicated Git Worktrees:** Each subagent is provisioned in its own isolated worktree (`.everyaios/worktrees/task-<id>`), allowing parallel branch editing, compilation, and testing without dirtying the main working tree.
- **Mutex `GitOperationQueue`:** Serializes all branch creation, commit, and merge operations, automatically clearing stale `.git/index.lock` files to prevent concurrency deadlocks.
- **3-File Shared Blackboards:** Subagents coordinate via structured files (`task_plan.md`, `findings.md`, and `receipts/`), ensuring clear contract boundaries and clean handoffs.
- **Dynamic `ConcurrencyGovernor`:** Monitors CPU, memory, and disk headroom, pacing concurrent agent spawns to prevent host resource starvation.

### 4. 🔒 Multi-Platform OS Sandboxing & Defense-in-Depth
- **Platform-Native Sandbox Backends:**
  - **Windows:** Job Objects with memory/CPU ceilings and Restricted Security Tokens stripping administrative privileges.
  - **macOS:** Seatbelt (`sandbox-exec`) profiles restricting filesystem traversal and unauthorized network binds.
  - **Linux:** Bubblewrap (`bwrap`) unprivileged user namespaces with minimal read-only bind mounts.
- **Zero-I/O `netfloor` SSRF Guard:** Enforces kernel-level egress filtering that blocks private subnets (RFC1918), link-local addresses, and cloud instance metadata (`169.254.169.254`).
- **Lexical `pathfloor` Sealing:** Strictly forbids agents from accessing or modifying sensitive host paths (`.git/`, `.ssh/`, `.env`, API credentials, agent config files).
- **TTL-Bounded Guard-2 Tickets:** Tool execution requires time-limited cryptographic authorization tickets generated from canonical argument hashes.
- **Tamper-Proof Merkle Audit Chain:** Every executed tool, file diff, and system action is logged into an append-only cryptographic Merkle hash tree for complete verification.

### 5. 📊 Real Office Spreadsheets & Documents
- **Embedded Local Calculation Engine:** Powered by IronCalc 0.8.3, EveryAIOS recalculates formulas, handles dynamic cell dependencies, updates charts, and preserves formatting across `.xlsx` files with 0 tokens spent on arithmetic.
- **Surgical OOXML Document Patcher:** Modifies `.docx`, `.pptx`, and `.pdf` files at the raw XML/byte level, preventing the corruption of unedited document parts, styles, and master slide themes.
- **Zero Token Waste:** All document analysis, mathematical calculation, and table transformations run locally on your CPU.

### 6. 🌐 Autonomous Browser Use & Web Automation
- **37 Native CDP Browser Tools:** Navigate web pages, click elements, fill multi-step forms, handle Single Page Applications (SPAs), capture full-page screenshots, and extract clean DOM trees.
- **Installed Browser Discovery:** Connects to installed browsers (**Google Chrome**, **Brave**, **Microsoft Edge**, **Arc**, **Chromium**) with isolated profile channels to protect personal data.
- **Zero-Auth Session Vault:** Reuses your existing authenticated browser sessions (GitHub, AWS console, Jira, corporate intranets) without typing passwords into prompts or exposing cookies.
- **Accessibility-Aware Navigation (A11y):** Evaluates web pages via real semantic accessibility trees, ensuring reliable element selection unaffected by floating ads, banners, or popups.

### 7. 🖥️ Native Computer Use & Desktop Automation
- **Native OS Software Control:** Automates desktop applications across Windows (UIA / Windows Graphics Capture), macOS (Accessibility API), and Linux (X11 / AT-SPI)—including legacy enterprise ERPs, CAD suites, media editors, and file managers.
- **Visual Grounding + OCR:** Combines high-resolution screen capture, OCR text extraction, and vision AI to locate buttons, text inputs, menus, and icons.
- **Human-Like Input Execution:** Moves the cursor, performs clicks, drags, and types keyboard shortcuts naturally to execute complex desktop tasks.
- **Real-Time Supervision:** Watch computer use happen live. Pause, inspect, or abort execution instantly with a single click or global escape shortcut.

### 8. 📅 Conversational Calendar & Background Automations
- **Encrypted Local Calendar Engine:** Backed by SQLCipher tables (`ui_calendars`, `ui_calendar_events`) with complete CRUD IPC commands and full UI views.
- **Natural Language Scheduling:** Book meetings, block focus time, and set task reminders conversationally ("Schedule code review with Alex on Thursday at 2pm").
- **Unattended Background Automations:** Run cron schedules, interval checks, and webhook triggers via the system tray daemon—even when the window is closed.
- **Self-Healing Resume:** Unattended tasks interrupted by system sleep or app restarts safely resume from durable checkpoints.

### 9. 🧬 Cognitive Failure Avoidance & 5-Tier Memory
- **`AvoidanceStore` Error Immunity:** Captures error signatures and root causes from failed tool executions. Injects learned negative constraints into prompt context to prevent repetitive error loops.
- **5-Tier Memory Hierarchy:** Combines working context, episodic session logs, semantic retrieval, temporal knowledge graphs, and user taste profiles.
- **Closed-Loop Skill Distillation:** Automatically extracts successful multi-step problem-solving patterns into reusable skills.
- **Local & Private:** Zero external vector databases required; powered by fast local SQLite BM25 full-text search with optional neural embeddings.

### 10. 🔍 Free Deep Web Research & Search Cascade
- **Zero API Search Fees:** Tiered G8 search cascade queries SearXNG and DuckDuckGo with health-gated fallbacks and local caching—search the live web without external API subscriptions.
- **Cited Synthesis Briefings:** Compiles research results into structured markdown reports complete with verified citations, source links, and confidence metrics.

### 11. 🧹 Storage Intelligence & Hash Deduplication
- **7-Stage Cryptographic Deduplication:** Uses parallel work-stealing threads to scan folders, eliminating duplicate files using size checks, xxHash3, and BLAKE3 hashes without unnecessary disk I/O.
- **Interactive Disk Treemaps:** Squarified visual treemaps show storage distribution with instant filters for large and stale files.
- **Safe Review Proposals:** Proposes file organization and cleanup packages via approval cards; never deletes data without explicit confirmation.

### 12. 🚀 Frontier Performance & Automated Release Gates
- **P45 Performance Benchmark Evidence:** High-throughput SQLite with WAL mode, optimized pragmas, and 256MB memory-mapped I/O:
  - **3,546 MB/s** read throughput
  - **1,190,000 writes/sec** burst throughput
  - **401,000 Merkle audit events/sec** append logging
  - **19 ns** model route lookup latency
  - **153 MB/s** JSON wire throughput
- **Context-Mode 50KB Output Ceilings:** Automatically truncates raw tool outputs exceeding 50KB with actionable query hints, preventing context window exhaustion.
- **Automated S1–S6 Security Gate:** Continuous verification covering 189 guard deny tests, path traversal defense, Merkle chain verification, MCP isolation, and 330 registered IPC commands.
- **Automated L1–L6 Failure Injection Suite:** Validates sidecar crash recovery, vault auto-lock, honest diagnostics, and corrupted state resilience.
- **Zero Mock Persistence Guarantee:** In live desktop environments (`inTauri() === true`), sessions start completely empty from the encrypted vault with zero demo data leakage to disk.

---

## Frequently Asked Questions (FAQ)

<details>
<summary><strong>Is EveryAIOS really free and open source?</strong></summary>
<br/>
Yes! EveryAIOS is 100% free and open-source under the MIT and Apache-2.0 licenses. There are no paywalls, no recurring monthly fees to us, and no locked features. You only pay your AI provider directly for the raw tokens you use (often pennies), or run local models like Ollama completely free.
</details>

<details>
<summary><strong>How is this different from paying $20/month for ChatGPT Plus or Claude Pro?</strong></summary>
<br/>
ChatGPT Plus and Claude Pro are single-provider web subscriptions:
1. <strong>Single Model Lock-in:</strong> They restrict you to their own model family. With EveryAIOS, you can use Claude 3.7 Sonnet for writing, DeepSeek-R1 or Qwen 2.5 Coder for fast economical coding, OpenAI o3 for hard math, or Ollama for private offline work—all in the same session.
2. <strong>Strict Hourly Limits:</strong> Hit your limit on Claude or ChatGPT, and you are locked out for hours. EveryAIOS lets you add backup keys and switch models instantly, so your work never stops.
3. <strong>No Real Office Math:</strong> Web chatbots cannot run real Excel spreadsheets or preserve your formulas. EveryAIOS has a built-in local calculation engine.
4. <strong>Privacy:</strong> Cloud chats store your conversations on their servers. EveryAIOS stores everything in an encrypted vault directly on your computer.
</details>

<details>
<summary><strong>Can I use EveryAIOS completely offline without the internet?</strong></summary>
<br/>
Yes! You can connect EveryAIOS to local runtimes such as <strong>Ollama</strong>, <strong>LM Studio</strong>, <strong>vLLM / llama.cpp</strong>, or Apple Silicon <strong>MLX</strong>. When using local models, all inference, memory indexing, and document processing happen entirely on your computer with zero network traffic.
</details>

<details>
<summary><strong>How does Multi-Agent Swarm Orchestration with Git Worktrees work?</strong></summary>
<br/>
EveryAIOS allows the Primary Chief to spawn 20–30 subagents concurrently:
1. <strong>Worktree Isolation:</strong> Each subagent is provisioned in its own dedicated Git worktree (`.everyaios/worktrees/task-<id>`). Agents can edit files, run builds, and execute tests simultaneously without dirtying your main working tree or causing file conflicts.
2. <strong>Serialized Git Operations:</strong> A mutex-protected `GitOperationQueue` serializes branch creation and commits, automatically clearing stale `.git/index.lock` files to prevent concurrency deadlocks.
3. <strong>Shared Blackboards:</strong> Agents communicate asynchronously through 3 structured files (`task_plan.md`, `findings.md`, and `receipts/`), maintaining clear contract boundaries and clean handoffs.
</details>

<details>
<summary><strong>What is the OS Sandboxing model (Windows, macOS, Linux)?</strong></summary>
<br/>
EveryAIOS implements platform-native sandbox backends in Rust (`everyaios-guard`):
1. <strong>Windows:</strong> Process Job Objects enforce CPU and memory ceilings, while Restricted Security Tokens strip administrative tokens and write access to sensitive system paths.
2. <strong>macOS:</strong> Seatbelt (`sandbox-exec`) sandbox profiles restrict filesystem access and unauthorized network binds.
3. <strong>Linux:</strong> Bubblewrap (`bwrap`) establishes unprivileged user namespaces with minimal read-only bind mounts.
4. <strong>Netfloor SSRF Protection:</strong> Enforces zero-I/O egress filtering that blocks private subnets (RFC1918), link-local addresses, and cloud metadata (`169.254.169.254`).
</details>

<details>
<summary><strong>How does the Avoidance Store prevent repetitive AI mistakes?</strong></summary>
<br/>
When an agent encounters a tool error or execution failure, the `AvoidanceStore` (`everyaios-memory`) analyzes the error signature and records the root-cause negative constraint. During subsequent turns, these constraints are injected into the prompt context below `CACHE_BOUNDARY`, preventing the agent from repeating the same failed approach in an endless loop.
</details>

<details>
<summary><strong>How do Conversational Calendar and Background Automations work?</strong></summary>
<br/>
EveryAIOS includes a local SQLite calendar engine stored securely in the SQLCipher vault:
1. <strong>Conversational Scheduling:</strong> Type natural language instructions to create, update, or search calendar events and reminders.
2. <strong>Background Tray Daemon:</strong> A lightweight system tray daemon keeps running even when the main app window is closed, executing scheduled 5-field cron tasks, periodic research briefings, and system health monitors.
</details>

<details>
<summary><strong>Can I bring my existing Claude Code, OpenAI Codex, Google Antigravity, Cline, or Aider setup?</strong></summary>
<br/>
Yes! EveryAIOS natively supports the open Agent Client Protocol (ACP). If you already love using Claude Code in your terminal, Google Antigravity or Cline for agentic coding, OpenAI Codex, or Aider for git commits, you can connect them directly into EveryAIOS. They preserve their native loops and tools while gaining access to EveryAIOS's local Excel engine, autonomous browser actions, computer use, and shared memory automatically.
</details>

<details>
<summary><strong>What is the "Two-Plane" architecture and how does it superpower external agents?</strong></summary>
<br/>
EveryAIOS respects the tools you already love through a strict two-plane design:
1. <strong>The Agent-Native Plane:</strong> External coding agents (Claude Code, OpenAI Codex, Google Antigravity, Cline, Aider, OpenCode) retain 100% of their native prompts, reasoning loops, and tools. We never degrade or rewrite an agent's native capabilities.
2. <strong>The Shared Cowork Plane:</strong> EveryAIOS augments those agents with capabilities they lack on their own: built-in local Excel formula recalculation, Word/PowerPoint/PDF editing, 37-action autonomous browser use, native desktop computer use, background cron scheduling, and shared 5-tier cognitive memory.
</details>

<details>
<summary><strong>Where are my API keys stored?</strong></summary>
<br/>
Your API keys are stored locally on your device in an encrypted SQLCipher database using AES-256 encryption. They never leave your machine except in direct, encrypted HTTPS requests to the official provider endpoints (e.g., `api.anthropic.com` or `api.openai.com`). Keys are never sent to any third-party relay or proxy.
</details>

<details>
<summary><strong>How do Browser Use and Computer Use work in EveryAIOS?</strong></summary>
<br/>
EveryAIOS includes both a <strong>built-in 37-action browser engine</strong> and a <strong>native desktop computer use agent</strong>:
1. <strong>Autonomous Browser Use:</strong> The agent navigates websites, clicks elements using semantic accessibility trees, fills forms, performs multi-source research, and safely reuses your logged-in web sessions without exposing passwords.
2. <strong>Native Computer Use:</strong> On Windows, macOS, and Linux, the agent captures high-resolution screen snapshots, uses vision AI and OCR to recognize UI controls, and interacts via mouse and keyboard to operate desktop applications that have no APIs.
3. <strong>Safety & Control:</strong> You watch every move live on screen and can pause, inspect, or stop the agent with a single keystroke or click.
</details>

---

## Architecture & Technical Documentation

For engineers, researchers, and contributors who want to explore our technical architecture and implementation specifications:

* [`DESKTOP-APP-SPEC.md`](DESKTOP-APP-SPEC.md) — The normative product contract, schemas, and security invariants.
* [`ARCH/17-NATIVE-AGENT.md`](ARCH/17-NATIVE-AGENT.md) — The Two-Plane Architecture, capability resolution policy, tool schema catalog, and Settings Control Center.
* [`ARCH/09-FEATURE-MATRIX.md`](ARCH/09-FEATURE-MATRIX.md) — Complete 166-capability implementation matrix across layers A through K.
* [`TODO.md`](TODO.md) — Master implementation census (1,428 items = 1,220 completed + 208 open) and active development queue.
* [`SPEC-CHANGELOG.md`](SPEC-CHANGELOG.md) — Historical architectural decisions, release logs, and verification evidence (v3.80).

---

## License

EveryAIOS is open source and dual-licensed under the **[MIT License](LICENSE-MIT)** and the **[Apache License, Version 2.0](LICENSE-APACHE)**.
