<p align="center">
  <img src="src-tauri/icons/128x128.png" width="80" alt="EveryAIOS" />
</p>

<h1 align="center">EveryAIOS</h1>

<p align="center"><strong>Tell it what you want done. It figures out how. You stay in control.</strong></p>

<p align="center">
  An open-source, local-first AI coworker that lives on your computer — working with your files, spreadsheets, documents, browser, desktop apps, code, email and calendar.<br/>
  Your keys. Your hardware. No middleman server. Nothing you do passes through us.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/status-active%20development-yellow?style=flat-square" alt="Active Development" />
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-blue?style=flat-square" alt="Cross Platform" />
  <img src="https://img.shields.io/badge/privacy-100%25%20Local--First%20%2B%20BYOK-success?style=flat-square" alt="Privacy First" />
  <img src="https://img.shields.io/badge/protocols-MCP%20%2B%20ACP%20Native-6f42c1?style=flat-square" alt="MCP and ACP Native" />
  <img src="https://img.shields.io/badge/safety-Guarded%20%26%20Audited-orange?style=flat-square" alt="Guarded Execution" />
  <img src="https://img.shields.io/badge/license-MIT%2FApache--2.0-lightgrey?style=flat-square" alt="License" />
</p>

<p align="center">
  <img src="5a1c3357-0cd1-492f-ac9f-efd313391587.png" width="94%" alt="EveryAIOS Workspace" />
</p>

<p align="center">
  🚧 <strong>EveryAIOS is in active development</strong> — early, open, and shipping fast.<br/>
  The core is built and the app runs end to end. New capabilities land regularly:<br/>
  <a href="#coming-soon">See what's coming soon ↓</a> &nbsp;·&nbsp; <a href="ARCH/09-FEATURE-MATRIX.md">Live capability status</a>
</p>

> **Welcome — and thank you for looking.** EveryAIOS is being built in the open, one capability at a time. If something you need isn't here yet, it's likely already designed and on the roadmap below. Star the repo to follow along, open an issue to ask for what you want, or jump into the [development docs](#contributing--architecture) and help build it.

---

## What is EveryAIOS?

Most AI tools keep your work locked inside their own chat window, their own cloud, their own subscription. When you move between tools, you lose the thread — what you were working on, which files were touched, what had already been tried.

**EveryAIOS is one place to get real computer work done with AI, on your own machine.**

You open the app and it asks: **"What would you like to get done?"** Drop in a messy folder, a 400-page PDF, a broken codebase, a financial spreadsheet or an email thread. It works out a plan, does the work across your own tools, and asks you before anything that changes your files or system.

Close your laptop, reboot, swap models, or hand the task to Claude Code or Codex — **your work, your memory and your safety rules stay exactly where they were.**

---

## Quick Start

### Install a build

Download the latest installer for macOS, Windows or Linux from the [**Releases page**](https://github.com/sarv-projects/EveryAIOS/releases). Builds are produced by the release workflow on version tags.

> **Early build, active development.** EveryAIOS is usable today and getting better every week. A few capabilities are still foundations, and the [Coming soon](#coming-soon) list shows what's next — the [capability matrix](ARCH/09-FEATURE-MATRIX.md) and [TODO](TODO.md) track exact status per feature.

### Build from source

```bash
git clone https://github.com/sarv-projects/EveryAIOS
cd EveryAIOS

# Install workspace dependencies (coordinator + UI + engine packages)
pnpm install

# Build the coordinator sidecar and place it where the app expects it
pnpm --filter @everyaios/coordinator build
mkdir -p src-tauri/bin && cp packages/coordinator/dist/coordinator src-tauri/bin/coordinator

# Install and build the UI, then launch the desktop app
cd ui && bun install && cd ..
cd src-tauri && cargo tauri dev
```

**Requirements:** Rust (stable), Node + pnpm, Bun, and the usual [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/) for your platform.

---

## What You Can Get Done

* 📁 **Reorganize & clean up your Downloads**
  Point it at a cluttered folder. It scans everything, finds duplicates by content and structure, and proposes a tidy layout as a plan. You review the exact move list, approve it with one click, and can undo the whole operation afterwards.

* 🔍 **Turn messy research into a real document**
  Ask for a competitor analysis or a briefing. It runs multi-source web research, strips out the noise, keeps citations attached to every claim, and drafts a slide deck or written brief you can edit.

* 📊 **Update a financial model**
  Drop in a quarterly spreadsheet. Numbers are recalculated with a real formula engine — not guessed — across sheets, and the summary memo is refreshed. Anything it can't calculate is flagged instead of invented.

* 🛠️ **Fix a broken repository**
  It reads the project structure and diagnostics, finds the likely cause, drafts a small diff, runs your tests to see what actually happens, applies the fix once you approve, and records the passing test run as evidence.

* 🤝 **Hand a task off between agents**
  Start with a cheap local model, then switch the session's lead agent to Claude Code or Codex when you need heavier reasoning. The context comes with it, so the new agent picks up without starting over.

* ⚙️ **Automate the boring routine**
  Show it a repeated multi-step job once. EveryAIOS can turn that into a saved routine that runs on a schedule without spending model tokens each time.

---

## Everything It Can Do

EveryAIOS is built around **157 capabilities**. Here they are, grouped into ten plain-language areas.

<details>
<summary><strong>🧠 Models &amp; Providers</strong> — use any AI, your keys</summary>

<br/>

- **Any provider, bring your own key** — OpenAI, Anthropic, Google, Groq, DeepSeek, Mistral, Cerebras, NVIDIA NIM, OpenCode (Zen / Go / Free), any OpenAI-compatible endpoint, and more.
- **Multiple keys per provider** — keep several keys and spread work across them.
- **Automatic key rotation on rate limits** — when a provider returns "too many requests", it cools that key down and moves to the next one without interrupting the stream.
- **Sign in with subscriptions you already pay for** — connect supported accounts with a normal sign-in instead of copying keys.
- **Run models locally** — Ollama, LM Studio, llama.cpp, GGUF and MLX models, chosen to fit your actual hardware.
- **Live model catalog** — the model list is fetched and refreshed from a public catalog, with notes on what each model can do (tools, vision, context size). It is never a frozen, hardcoded list.
- **Right-sized model per task** — simple steps can use small, cheap models while hard reasoning gets a stronger one, automatically.
- **Cost and cache accounting** — see prompt-cache hits, tokens generated, and what each turn actually cost.
- **One identity per provider** — providers and their nicknames (e.g. "claude" → Anthropic) are resolved consistently, so one provider definition works everywhere.

</details>

<details>
<summary><strong>🤖 Agents &amp; Automation</strong> — the thing that actually does the work</summary>

<br/>

- **Built-in agent** — a full plan → act → check loop that can use tools, recover from mistakes, and keep going across steps.
- **Written plans you can edit** — plans are saved as readable documents, and the agent keeps them up to date as the work progresses so you can always see and change the route.
- **Sub-agents** — spin up focused helpers with their own context for research, review or a specific sub-job.
- **Agent-to-agent messaging** — helpers can ask each other questions and request cross-checks.
- **Structured extraction** — when it needs data out of a document, it extracts it into a strict shape instead of a loose paragraph.
- **Iteration limits** — hard caps on retries and loops so a confused agent can't burn forever.
- **Scheduled tasks** — run work later or on a recurring schedule.
- **Teach-once routines** — a repeated workflow can be compiled into a saved routine that replays deterministically, with no model tokens on the healthy path.
- **Build your own agent** — create named agents with their own instructions, tools and model, then pick them per task.

</details>

<details>
<summary><strong>💾 Memory &amp; Context</strong> — it remembers, without filling up</summary>

<br/>

- **Layered memory** — short-term working memory, things that happened, learned facts, and learned procedures are kept separately and used in the right situation.
- **Search that combines signals** — keyword matching, optional semantic search, relationship lookups and recency are blended and re-ranked rather than trusting one method.
- **Works without embeddings** — the default retrieval path needs no vector model at all, so it works offline and instantly.
- **Optional embeddings** — turn on semantic search when you want it.
- **Knowledge graph** — entities and relationships are stored with where they came from and how confident the system is.
- **Memory that knows when a fact was true** — facts carry validity windows, so old information is superseded rather than silently overwritten.
- **Memory injection** — relevant memories are folded into the conversation at the right moment.
- **You own your memory** — export, sync or wipe it at any time.
- **Learns your taste** — it picks up your naming, formatting and style preferences from the changes you accept.
- **Big files by reference** — massive documents are indexed as lightweight handles with previews instead of being pasted into the prompt.
- **Spaced-repetition review** — facts and findings can be surfaced again on a review schedule so they stick.
- **Runs on SQLite or Postgres** — the store works locally by default and can scale up.

</details>

<details>
<summary><strong>📑 Documents, Files &amp; Storage</strong> — real edits to real files</summary>

<br/>

- **Word documents** — open and edit `.docx`.
- **Excel workbooks** — open and edit `.xlsx` with a real formula engine.
- **PowerPoint decks** — open and edit `.pptx`.
- **PDFs** — open and edit: search, fill forms, replace text and redact.
- **Reads almost anything** — a universal reader for documents and files you drag in.
- **Keeps formatting intact** — edits patch only the parts that need to change, so themes, custom styles, macros and layout survive round-trip.
- **Undo any change** — every edit can be rolled back.
- **Legacy formats** — older document formats are handled rather than rejected.
- **Disk map** — scan and visualise what is using your disk.
- **Duplicate finder** — locate duplicate files by content hash.
- **Big-file finder** — surface the giant files worth deleting.
- **Storage health** — analytics and guided cleanup suggestions.

</details>

<details>
<summary><strong>🌐 Browser &amp; Desktop Control</strong> — it can use your computer</summary>

<br/>

- **Built-in browser** — drives a real browser directly through the page's own structure, so it works fast without needing a heavy vision model.
- **Large browser toolkit** — dozens of built-in browser actions (navigate, click, type, read, extract, download, and more).
- **Sees pages the way a screen reader does** — accessibility snapshots of page structure, with changes highlighted.
- **Run page scripts** — evaluate scripts when a page needs it.
- **Replay sessions** — review what the browser did, step by step.
- **Tab ownership** — the agent knows which tabs are "yours" and which are its own, and won't fight you for them.
- **Imports your logins** — reuse existing browser sessions so authenticated sites just work.
- **Authenticated scraping** — read data from sites you're signed in to.
- **Desktop computer-use** — controls native apps directly on Windows, macOS and Linux, with visual recognition for apps that have no accessible interface.
- **Lightweight browser option** — a fast, low-resource mode for simple pages.
- **Encrypted session vault** — authenticated sessions are stored encrypted.
- **Gets past challenges** — handles common bot/verification hurdles with the right tier of browser.
- **Session inheritance** — carry a signed-in session from one step to the next.
- **Human-like input** — natural mouse curves and keystroke timing instead of robotic, instant clicks.
- **Automates desktop apps built with web tech** — apps like VS Code and Slack that are secretly web pages under the hood.
- **Lean page snapshots + WebMCP** — compact page representations and support for pages that expose their own tools.
- **Understands several action formats** — different agent action styles are accepted and normalised.

</details>

<details>
<summary><strong>🔌 Connectors &amp; Integrations</strong> — connects to your tools</summary>

<br/>

- **One connector hub** — all external services are reached through a single, consistent layer with routing.
- **Native connectors** — first-class integrations built directly into the app.
- **Browser-session connectors** — for services with no API, it can drive the website as you.
- **Local sign-in bridge** — complete an OAuth sign-in in your own browser, never exposing the token to the AI.
- **MCP client** — connect to any Model Context Protocol server to gain its tools.
- **MCP server** — expose EveryAIOS's own tools (documents, browser, memory, storage) to other apps.
- **Agent harness installer** — install and manage external agent CLIs.
- **One tool registry** — every built-in and connected tool appears in a single, governed catalog.
- **WSL / POSIX bridge** — reach Linux tools from Windows.
- **Port &amp; network hooks** — work with local servers and network services.
- **Drive external agents** — hand steps to external agent CLIs.
- **Messaging bridges** — connect messaging channels.
- **Email connector** — Gmail or IMAP/SMTP, read-first: nothing is sent without approval.
- **Calendar connector** — read and manage calendar events.

</details>

<details>
<summary><strong>🔍 Search &amp; Research</strong> — finds things and checks them</summary>

<br/>

- **Free web search, no API key** — search works out of the box via open, self-hostable search.
- **Deep research** — multi-pass research across many sources for a real answer.
- **Multiple search channels** — several engines/sources combined, with fallbacks.
- **Data-analysis mode** — a live analysis environment for crunching numbers and data.
- **Repo-wide search** — search an entire codebase, not just open files.
- **Site-scoped search** — restrict research to a specific domain or site.
- **Instant file &amp; content search** — a local index of your own files by name and contents.
- **Tiered cascade with caching** — cheapest search first, caching results, and moving up only when needed.
- **Content cleaner** — strips ads, boilerplate and junk out of fetched pages before the model reads them.

</details>

<details>
<summary><strong>🖥️ The App &amp; Its Interface</strong> — what it feels like to use</summary>

<br/>

- **Chat** — a natural conversation surface that can do work, not just talk.
- **Starts simple** — no blank page on first run: ready-made starter tasks show what will happen and where the boundary is, and the safety control reads in plain words (*Look only · Ask me first · Balanced · Just do it*). A power toggle reveals the full control surface.
- **Work cockpit** — a dashboard showing the plan, progress and current activity.
- **Audit &amp; replay** — look back at exactly what happened and why.
- **Plan editor** — read and edit the blueprint for a task.
- **Office viewers** — view and edit documents in place.
- **Reader** — a clean, comfortable reading view.
- **Math &amp; code rendering** — formatted equations and syntax-highlighted code.
- **Permission cards** — clear, plain-language approval prompts for anything risky.
- **Spend analytics** — see token and cost usage over time.
- **Personality** — choose how the assistant talks to you.
- **Menu-bar / tray mode** — it can live in your tray and stay out of the way.
- **Optional telemetry** — off by default, opt-in only.
- **Scheduled tasks view** — see and manage what runs on a schedule.
- **Voice input** — speak your request, with automatic silence detection.
- **Widget cards** — rich inline results instead of walls of text.
- **Progress timeline** — a single, clickable, timestamped list of every step.
- **Activity rail with multiple views** — a workspace with chat, files, browser, code and more side by side.
- **Take-over and resume** — step in by hand, then let the agent continue.
- **Automation builder** — build routines from plain language or templates.
- **Knowledge browser** — explore what it has learned.
- **MCP marketplace** — browse and add MCP tools.
- **Generative UI** — the assistant can render small interactive interfaces for a task.
- **Voice replies** — spoken answers.
- **Local dashboard artifacts** — genuinely local, private "Sites" and dashboards it builds for you.
- **Corpus research surface** — point it at a pile of sources and get grounded, cited answers.
- **Agent picker** — choose who leads the session, right from the composer.
- **Autonomy control** — a simple dial for how much freedom the agent has, with the setting frozen per task and any increase explicitly escalated to you.
- **Integrated terminal** — a real multi-profile terminal (PowerShell, Command Prompt, WSL distros, Unix shells).

</details>

<details>
<summary><strong>👨‍💻 Code &amp; Developer Tools</strong> — for people who write software</summary>

<br/>

- **Code-writing loop** — investigate, patch, run tests, iterate.
- **Skill library** — installable, signed capability packs.
- **Test-driven loop** — write the failing test first, then the fix.
- **Guardrails** — policy checks around automatic code changes.
- **Plugin system** — extensions declare exactly what they're allowed to contribute and touch.
- **Semantic code map** — a structural map of a repository (via tree-sitter and link analysis) so the agent can find its way around large projects.
- **Per-model edit strategy** — how edits are shaped to suit the strengths of each model.
- **Architect mode** — a two-pass design-then-build mode.
- **File watcher with AI comments** — react to file changes, and act on `TODO`-style comments you leave in code.
- **Language-server intelligence** — real diagnostics, symbols and navigation via LSP.
- **Project-scoped coding rail** — a focused coding workspace inside the app, not a separate IDE.

</details>

<details>
<summary><strong>🛡️ Safety, Privacy &amp; Trust</strong> — the part that makes it usable</summary>

<br/>

- **Trust ladder** — reading and exploring never prompts. Small, in-folder changes can be automatic. Anything that leaves your machine, or is destructive, always asks.
- **Deterministic safety checks** — obvious bad patterns (path escapes, dangerous commands, credential leaks, bad URLs) are blocked before they run, without a prompt.
- **Approval cards you can actually read** — risky actions show a clear, plain-language summary of exactly what will change, in a separate protected window.
- **Hard boundaries** — file paths, workspace scope and allowed operations have non-negotiable floors.
- **The agent acts on a ticket, you act by clicking** — the AI can never execute a change on its own authority. Everything agent-initiated is authorized by a single-use ticket; everything *you* do by hand is authorized by your own action.
- **Every effect is recorded** — both paths land on the same append-only, tamper-evident audit chain, so a machine can never manufacture "the user approved this".
- **Prompt-injection defence** — content the agent reads is treated as untrusted, so a malicious document can't hijack it.
- **Process supervision** — helper processes are watched and restarted; nothing is left orphaned if the app dies.
- **Encrypted key vault** — API keys live in an encrypted local store and are injected at the moment of use, never kept in the chat or the model's context.
- **Configuration as files** — settings are plain files you can read, diff and version.
- **Watchdog &amp; health checks** — the app watches its own components and recovers.
- **Hard spend limits** — set a dollar ceiling per session so nothing runs away.
- **Clean shutdown** — no leftover processes, no half-written state.
- **Memory safety under load** — the orchestrator is monitored so heavy work can't silently exhaust its memory.
- **Bridge to external agent harnesses** — talk to external agent CLIs through a standard local protocol.
- **Full tracing** — detailed internal tracing for diagnosing what happened.
- **Sturdy internal messaging** — well-defined, framed communication between the app's parts.
- **Security profiles** — different safety postures for different situations.
- **Config scanning** — installed tools and connectors are scanned for unsafe configuration before use.
- **Escalation rules** — when to interrupt you, and what happens if you don't respond.

</details>

---

## Why You Can Trust It

1. 🔒 **100% private and local-first.** Everything runs on your machine. Credentials, documents and history live in an encrypted local vault. Your prompts go straight to the provider you configured — or stay offline on your own hardware. No middleman server, no logging.

2. 🛡️ **It proposes; you decide.** The AI can plan, read and draft freely, but it cannot change your system without authorization. Every write, command, email and external action either runs under a ticket you approved or is something you explicitly did yourself — and either way it's recorded and undoable.

3. ⚡ **Your work survives.** Work is a durable object, not a chat window. If your laptop dies, the network drops or a model times out, the session, its plan and its records come back exactly where you left off.

4. 📐 **Real results, not guesses.** Spreadsheet maths uses a real calculation engine. Document edits touch only the parts that changed, and the rest of the file is preserved bit-for-bit.

5. 🔀 **No lock-in.** Bring your own keys, rotate multiple keys automatically, run open models locally, or hand work off to external agents like Claude Code or Codex. Switch whenever you like — the work stays put.

---

## Coming Soon

EveryAIOS grows in the open. These are designed and on the roadmap — **not missing, just next**:

- Local OpenAI-compatible server (reuse EveryAIOS as a model endpoint for other tools)
- Image generation
- Composio / Zapier / Nango connector bridges
- Inline "magic completion" suggestions
- Remote session handoff and a mobile companion app
- Clipboard tool
- Resumable streams across restarts
- Voice memo → structured report
- Always-on executor node (your own remote worker)
- CLI / doctor / admin surface
- Fuel-metered WASM sandbox for untrusted extensions
- Full IDE mode (editor-grade Rust IDE behind the Code rail)
- Knowledge → Skill compiler
- Credential-provider fill (user-controlled secrets without exposure)

---

## Contributing & Architecture

EveryAIOS is a Tauri 2 desktop app with a React interface, a Rust core that owns execution, security and state, and a TypeScript coordinator that does the AI orchestration. Everything effectful funnels through one execution kernel: **proposal → policy → guard → ticket → executor → verification → audit → recovery**.

If you're an engineer, the place to start is:

- [`DESKTOP-APP-SPEC.md`](DESKTOP-APP-SPEC.md) — the full product and capability contract
- [`ARCH/09-FEATURE-MATRIX.md`](ARCH/09-FEATURE-MATRIX.md) — every capability with its status and home
- [`ARCH/`](ARCH/) — module layout, build plan and diagrams
- [`TODO.md`](TODO.md) — what's open, and what's next

---

## License

EveryAIOS is open source and dual-licensed under the [MIT License](LICENSE-MIT) and the [Apache License, Version 2.0](LICENSE-APACHE).
