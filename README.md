<p align="center">
  <img src="src-tauri/icons/128x128.png" width="88" alt="EveryAIOS" />
</p>

<h1 align="center">EveryAIOS</h1>
<h3 align="center">Every AI. Every Agent. Every Task. One Space.</h3>

<p align="center">
  <a href="#installers--on-the-way"><img src="https://img.shields.io/badge/Desktop%20App-Coming%20Soon-blueviolet?style=for-the-badge" alt="Coming Soon" /></a>
  <a href="#everything-it-can-do"><img src="https://img.shields.io/badge/Capabilities-166%20across%2010%20layers-brightgreen?style=for-the-badge" alt="166 capabilities" /></a>
  <a href="TEST-CASES.md"><img src="https://img.shields.io/badge/Test%20Suite-50%20Real%20Use%20Cases-green?style=for-the-badge" alt="50 Use Cases" /></a>
  <a href="#run-it-now-from-source"><img src="https://img.shields.io/badge/Open%20Source-100%25%20Free-success?style=for-the-badge" alt="Open Source" /></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT%2FApache--2.0-lightgrey?style=flat-square" alt="License" />
  <img src="https://img.shields.io/badge/platforms-Windows%2011%20%7C%20macOS%20%7C%20Linux-blue?style=flat-square" alt="Platforms" />
  <img src="https://img.shields.io/badge/privacy-100%25%20Local--First-success?style=flat-square" alt="Privacy" />
  <img src="https://img.shields.io/badge/your%20data-never%20leaves%20your%20machine-orange?style=flat-square" alt="Your data stays local" />
</p>

---

**Jump to:** [What you can do](#what-can-you-actually-do-with-it) · [Everything it can do](#everything-it-can-do) · [How it compares](#how-it-compares) · [Installers](#installers--on-the-way) · [Run it now](#run-it-now-from-source) · [FAQ](#frequently-asked-questions)

---

EveryAIOS is a **free, open-source desktop app** that brings all of your AI tools, agents, and workflows into one place — on your own computer, with your own keys, with your data staying local.

Think of it as a home base for everything AI. Chat with any model you want. Put your existing coding agents inside it. Work with real Office documents. Schedule work to run while you sleep. Drive a real browser and your own desktop. One fast, native cockpit instead of twelve browser tabs.

**No subscriptions. No walled gardens. No vendor lock-in.** Your AI work, on your machine, the way you want it.

> ### The idea in one line
>
> Your coding agent keeps its own brain — its models, its prompts, its tools, its habits. EveryAIOS gives it a body: real Excel and Word, a real browser, a real desktop, memory that lasts past today, and an approval prompt before it touches anything of yours.
>
> Nothing about your agent changes. It simply gets more to work with — and you get to watch all of it.

---

## What can you actually do with it?

Here is what EveryAIOS puts in your hands on day one.

**Work with any AI model**
Switch between OpenAI, Anthropic, Google Gemini, DeepSeek, Qwen, Llama and anything OpenAI-compatible — mid-conversation. Or go fully offline with local models like Ollama, LM Studio, vLLM or Apple MLX. Your keys stay on your machine, encrypted.

**Bring your own coding agent**
Already using Claude Code, OpenAI Codex, Aider, Cline or another coding CLI? EveryAIOS hosts them natively and leaves them alone — their own prompts, tools, models and reasoning stay intact. You get a far better cockpit around them, and the option to run several at once, each in its own Git worktree so their edits never collide.

**Do real work in real documents**
EveryAIOS embeds a genuine spreadsheet engine, so an `.xlsx` file is recalculated natively: formulas run, dependencies resolve, and the numbers are right. Word and PDF files are edited at the XML level, so your formatting, styles, charts and macros come out the other side intact.

**Browse the web and drive your desktop**
Agents get three tiers of browser — a fast headless engine for speed, a stealth tier for awkward sites, and full Chrome automation when you need everything. Computer use goes further: agents can operate your actual OS windows, which is how you reach legacy software, SAP, QuickBooks, or that internal tool nobody ever built an API for.

**Let it work while you are not watching**
Schedule recurring jobs in plain language or cron — morning briefings, repo health digests, inbox triage, weekly data pulls. A background daemon keeps them running even with the window closed.

**Memory that outlives the conversation**
EveryAIOS remembers your projects: the approaches you prefer, the errors that bit you last week, the ideas you already rejected. Agents stop repeating mistakes and stop asking you the same question twice.

**Know exactly what is about to happen**
Every risky action — a file write, a shell command, an outbound request — stops at a visual diff card showing precisely what will change. Approve it, deny it, or turn it into a standing rule. Everything is recorded in a tamper-evident audit trail you can replay later.

**See what it costs**
Live token and cost accounting per turn, per model and per project. Cache-aware, so re-reading a large document does not quietly double your bill.

**Search that actually finds your own stuff**
Instant search across your files, your documents and your past work — no API key, no cloud round-trip, no upload. Filenames, contents and history, all local.

**Stay in control of how far it goes**
An autonomy control sits right in the message box: decide how much an agent may do before it must stop and ask, switch that setting per task, and raise it temporarily when you are confident.

---

## Everything it can do

EveryAIOS is **166 capabilities across ten layers**, all specified in this repository. Here is the whole set, in plain English.

**Models & keys** · 11 capabilities
Bring your own key to OpenAI, Anthropic, Google Gemini, DeepSeek, Qwen, Llama, or any OpenAI-compatible endpoint — plus OAuth sign-in where a provider offers it. Keep several keys per provider and EveryAIOS rotates to the next one automatically when a limit is hit. Run entirely offline on Ollama, LM Studio, vLLM, llama.cpp or Apple MLX. A live model catalogue with per-model hints, cheap-and-expensive tiering so small jobs use small models, cache-aware cost accounting, an alias layer for model renames, and a local OpenAI-compatible endpoint so your other tools can share the same setup. *(Image generation and the local endpoint land after v1.)*

**Agents & automation** · 11 capabilities
A spec-driven agent loop with blueprints, parallel subagents, and messaging between agents. Grammar-enforced extraction, so you get structured data back instead of prose you have to parse. Iteration and cost budgets so nothing runs away. Scheduled tasks. Crystallization — turning a one-off success into a repeatable routine. A builder for authoring your own agents. Native, first-class control tools — ask, plan, todo, subagent — that work mid-turn rather than as an afterthought.

**Memory & context** · 15 capabilities
Four kinds of memory working together: **Context** (this turn), **Episodic** (what happened — derived from your Work history), **Knowledge** (facts, entities, preferences) and **Procedural** (skills and learned workflows), sitting on a 34-algorithm retrieval index. Multi-signal retrieval fuses semantic, lexical and graph signals. Vectorless by default, so nothing breaks without an embedding service; embeddings optional. A knowledge graph and a temporal graph. Spaced repetition for what you actually revisit. Pass-by-reference context, so a large document is never re-pasted into the prompt. A taste profile. Repo-map context injection (tree-sitter + PageRank, fitted to your budget). `@`-mentions for context providers such as `@Codebase`. Sync, export and wipe on demand.

**Office & files** · 12 capabilities
Open, edit and save Word, Excel, PowerPoint and PDF. Native spreadsheet recalculation. Round-trip conformance, so a file survives a trip through EveryAIOS unchanged where it should be. Rollback when an edit was wrong. Legacy formats supported. Storage intelligence on top: duplicate detection by content hash, a large-file finder, and storage health and analytics across your machine.

**Browser & computer use** · 17 capabilities
Three browser tiers — a lightweight engine, a stealth-scraping tier, and full Chrome over CDP — behind a 37-tool catalogue. Accessibility-tree snapshots with stable references cut token use dramatically compared to raw HTML. Tab ownership, session replay, login import, authenticated scraping, challenge handling, a session vault, session inheritance, behavioural realism, Electron-app automation, and multi-protocol action parsing. Then the desktop layer: any real OS window, driven through the accessibility tree plus Win32, macOS AX or Linux X11 — with a hardware emergency stop.

**Connectors** · 16 capabilities
A hub router with native adapters, browser-session connectors, and a local auth bridge. MCP in both directions: consume other MCP servers, and serve your own tools to other clients. A harness installer, a unified tool registry, a WSL/POSIX bridge, port and network hooks, messaging bridges, plus email and calendar connectors. Shared-plane façades expose EveryAIOS's own tools to external agents as task-shaped actions. *(Composio, Zapier and Nango arrive after v1.)*

**Search & research** · 9 capabilities
Search that works with no API key at all. Deep research with real citations. Multi-channel search, site- and domain-scoped search, and instant filename and content search across your own machine. A tiered cascade with caching, so repeat questions are instant. A read-cleaner that strips navigation, ads and boilerplate before text ever reaches the model. A data-analysis REPL for when you need actual computation rather than a plausible-sounding paragraph.

**Cockpit** · 36 capabilities
12 center screens and 19 viewports: Chat, Projects, Files, Browser, Terminal, Office viewers, the Guard dashboard, and an Activity rail with a multi-view viewport. A blueprint editor, permission cards with visual diffs, token and cost analytics, scheduled-task and automation builders, a knowledge browser, an MCP marketplace, a progress timeline of every step, takeover/resume, widget cards, generative UI, voice input and output, a tray daemon, local dashboard artifacts, and the autonomy control in the message box.

**Forge & skills** · 17 capabilities
A code synthesis loop and a TDD loop. A skill registry with Ed25519-signed indexes that refuses anything tampered with. Guardrail checks. An extension and plugin ABI. Repo-map and semantic indexing. Per-model edit strategies. Architect mode — plan first, then build. A file watcher that reacts to AI comments. LSP-backed code intelligence. A unified edit ladder (exact, then structured, then fuzzy — and it fails closed rather than guessing). Risk-gated shadow preflight before it commits to a change. Per-step checkpoints with rollback. A validated skill-distillation loop.

**Trust, safety & reliability** · 22 capabilities
A Trust Ladder running from observe-only to full autonomy. Regex interceptors, diff cards, and path- and scope-hard-floors that no policy can opt out of. An SSRF firewall that refuses cloud-metadata and link-local addresses under every policy, and refuses loopback when the destination came from untrusted content. Protection for ambient credentials — `.env`, `.ssh/`, `.aws/`, `id_rsa` and friends. Prompt-injection defence. Scanning for dangerous agent configuration. A Merkle hash-chain audit trail. Hard per-session dollar budgets. Process supervision, a watchdog, orphan prevention on crash, sidecar heap safety, distributed tracing, length-prefixed IPC framing, and profile-gated security profiles.

Every one of these is a row in the [capability matrix](ARCH/09-FEATURE-MATRIX.md) — and in CI that matrix is machine-checked against the product contract and the machine-readable index, so the three cannot drift apart.

---

## How it compares

*As of late 2026 — comparing the leading desktop agent platforms, developer CLIs, and AI editors:*

| Dimension | EveryAIOS | Claude (Desktop & Cowork) | OpenAI Codex / ChatGPT | Claude Code (CLI) | Cursor / Windsurf |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Primary Role** | **Universal Desktop OS & Agent Harness** | Knowledge work & conversational assistant | Developer workstation & coding agent | Terminal-first coding agent CLI | AI-first code editor (IDE) |
| **Model Freedom & Privacy** | **100+ models + 100% offline** (Ollama, MLX, BYOK); AES-256 local vault | Anthropic Claude only; cloud-hosted data | OpenAI models only; cloud/hybrid execution | Anthropic Claude only; cloud inference | Curated cloud models + limited BYOK |
| **External Agent Hosting** | **Yes** — hosts Claude Code, Codex, Aider, Cline via ACP stdio | ❌ None (closed Anthropic loop) | ❌ None (closed OpenAI loop) | N/A (runs as agent; hostable in EveryAIOS) | ❌ None (closed editor composer) |
| **Parallel Subagents** | **Up to 3 at once** (6 per task, depth 2) in isolated Git worktrees, auto-merged | ❌ Single linear session | ⚠️ Background task execution (linear) | ❌ Single terminal loop | ❌ Single composer session |
| **Office & Spreadsheet Engine** | **Native IronCalc 0.8.3** (300+ Excel formulas) + surgical OOXML patcher | Claude Docs & Slides (text/markdown; no formula DAG) | Scripted file generation (Python) | ❌ Code/text edits only | ❌ Code files only |
| **Browser & Computer Use (CUA)** | **Tiered local browser** (Lightpanda + Chrome CDP) + Win32/A11y OS control | Cloud-rendered browser; remote VM preview | Cloud browsing tool; developer environment | CLI bash & web fetch tools | Basic web fetch / doc scraping |
| **Background Automations** | **24/7 background cron daemon** (runs with window closed) | ❌ Active session only | ⚠️ CLI background tasks | ❌ Active terminal only | ❌ Active editor session only |
| **Security & Governance** | **7-layer Guard-2**: zero-I/O SSRF firewall, diff cards, Merkle audit | Cloud safety filters & permissions | Sandbox execution & confirmation prompts | Terminal permission prompts (allow/ask/deny) | Standard IDE file permissions |
| **Cost & Licensing** | **Free & open-source** (MIT/Apache-2.0); pay raw tokens or \$0 offline | \$20–\$100+/month subscription | \$20–\$30/month or API tokens | Anthropic API tokens or subscription | \$20/month subscription + usage |

> ### Why this is different, not just bigger
>
> EveryAIOS does not ask you to abandon the tools you already like. It is an **open operating layer**, so a specialised coding agent runs *inside* it and keeps every one of its native prompts, tools and habits — while gaining everything in the list above: spreadsheets it can genuinely calculate, Word and PDF files it can edit without wrecking, a browser and a desktop it can actually drive, memory that spans weeks, and a 24/7 scheduler.
>
> You are not choosing between your agent and this app. You are giving your agent a bigger machine to stand on.

---

## Installers — on the way

**Everything described in this README is in the repository and runs today from source.** Signed, double-click installers are the last piece of the release work and are actively in progress ([`TODO.md`](TODO.md) → **P70**): packaging, code-signing, the auto-updater and release qualification.

| Platform | Format | Status |
| :--- | :--- | :---: |
| **Windows 11 / 10** | `.msi` / `.exe` (x64 & ARM64) | 🔜 in progress |
| **macOS (Apple Silicon)** | `.dmg` (M1 – M4, Universal) | 🔜 in progress |
| **macOS (Intel)** | `.dmg` (x86_64) | 🔜 in progress |
| **Linux (Ubuntu / Debian)** | `.deb` / `.AppImage` | 🔜 in progress |

Until then you can be running the real thing in about ten minutes — see below.

> ⭐ **Star and watch this repo** to be notified the moment installers go live.

---

## Run it now (from source)

No installer needed — clone it and run it. About 10 minutes end to end, most of it compiling.

**1. Install the toolchain**

| You need | Version | Why |
| :--- | :--- | :--- |
| [Rust](https://rustup.rs/) | **1.98+** | the crates use edition 2024 |
| [Node.js](https://nodejs.org/) | **v22+** | the UI and sidecar |
| [pnpm](https://pnpm.io/) | **11+** (`npm install -g pnpm`) | workspace manager |
| [Bun](https://bun.sh/) | latest | builds the sidecar |
| Tauri build deps | — | [official prerequisites guide](https://v2.tauri.app/start/prerequisites/) (on Linux this is the step people miss) |

**2. Clone and build**

```bash
git clone https://github.com/sarv-projects/EveryAIOS.git
cd EveryAIOS/desktop_app

pnpm install                                    # JS workspace

pnpm --filter @everyaios/coordinator build      # build the sidecar
mkdir -p src-tauri/bin
cp packages/coordinator/dist/coordinator src-tauri/bin/coordinator

cd src-tauri && cargo tauri dev                 # launch
```

**3. First run** — open **Settings → Providers**, add a key (or point at a local model such as Ollama), then start a chat. To bring in Claude Code, Codex or another CLI, open the agent picker; EveryAIOS discovers what you already have installed and offers the rest from the [ACP registry](https://agentclientprotocol.com/registry).

> **Stuck?** If `cargo tauri dev` fails on a native dependency, that's almost always the Tauri prerequisites in step 1. If the app opens with no models, the vault needs a provider added first (Settings → Providers).

---

## What's inside

EveryAIOS is built on 22 Rust core modules, 11 TypeScript coordination packages, and a React 19 desktop shell. Here's a plain-English summary of the major parts:

| Area | What it does |
| :--- | :--- |
| **Agent Hosting** | Connects external AI coding agents via open protocols. They keep their own tools; you get a unified cockpit. |
| **Model Gateway & Keys** | Encrypted local vault for your API keys. Supports 100+ models. Automatically handles rate-limit failover. |
| **Desktop Shell** | Fast, native cockpit with 12 center screens and 19 viewports. Built for real work, not demos. |
| **MCP Tools** | 51 governed in-process tools covering browser, office, memory, search, and storage. |
| **Office & Browser** | Real spreadsheet engine, surgical document editing, and 3-tier browser automation — all local. |
| **Memory & Work** | Four-class memory that persists across sessions. Learns your preferences and avoids past mistakes. |
| **Automations** | Schedule recurring tasks. Background cron daemon runs even when the app is closed. |
| **Security** | 7-layer review membrane. Every destructive action requires your approval. Tamper-evident audit log. |

<details>
<summary><strong>See the full technical architecture →</strong></summary>

EveryAIOS is built on an **ownership split between two planes**. The **agent plane** belongs to whichever agent you bind — Claude Code, Codex, Aider and friends keep their own loop, tools, model and account, and no binding is privileged (the optional built-in engine is one binding among equals). The **shared plane** belongs to EveryAIOS: Office engine, browser, computer use, memory, capabilities, security and automations, offered to *any* agent through one stable interface.

The architecture is documented in detail starting from [`ARCH/CORE.md`](ARCH/CORE.md) — the single root authority — and the index at [`ARCH/00-INDEX.md`](ARCH/00-INDEX.md). Start here:

- ⭐ [`ARCH/CORE.md`](ARCH/CORE.md) — **the root authority.** The primitives (Work · Run · Step · Effect · Receipt · Event), who owns what, and the 27 invariants everything else must obey
- [`ARCH/00-INDEX.md`](ARCH/00-INDEX.md) — the index, plus a reading path through the whole set
- [`ARCH/WORK.md`](ARCH/WORK.md) · [`ARCH/SESSION.md`](ARCH/SESSION.md) · [`ARCH/AGENT.md`](ARCH/AGENT.md) · [`ARCH/CONTEXT.md`](ARCH/CONTEXT.md) — the subsystem contracts (durable Work, Chats, agent hosting, context engineering)
- [`ARCH/CAPABILITIES.md`](ARCH/CAPABILITIES.md) — capability packs, skills and the File Workbench viewers
- [`ARCH/02-MODULE-LAYOUT.md`](ARCH/02-MODULE-LAYOUT.md) — ownership matrix for all 22 Rust crates and 11 TypeScript packages
- [`ARCH/SECURITY.md`](ARCH/SECURITY.md) — the sole-authorization-gate design and the authorization-provenance rule
- [`ARCH/MEMORY.md`](ARCH/MEMORY.md) — four memory classes (Context · Episodic · Knowledge · Procedural), with ACT-R as a strategy
- [`ARCH/EXTERNAL-AGENTS.md`](ARCH/EXTERNAL-AGENTS.md) — ACP/MCP surfaces, the agent bridge, and what governance can honestly be claimed
- [`ARCH/09-FEATURE-MATRIX.md`](ARCH/09-FEATURE-MATRIX.md) — the 166-row capability matrix
- [`ARCH/17-NATIVE-AGENT.md`](ARCH/17-NATIVE-AGENT.md) — the two-plane model: what belongs to the agent vs. what belongs to EveryAIOS *(its original "frozen" status is lifted by [`ARCH/ADR/0003`](ARCH/ADR/0003-architecture-thaw-core-authority.md); `CORE.md` supersedes it)*
- [`DESKTOP-APP-SPEC.md`](DESKTOP-APP-SPEC.md) — the normative product contract
- [`TODO.md`](TODO.md) — the delivery ledger: what is built, what is open, and what is next

</details>

## Frequently Asked Questions

<details>
<summary><strong>Is this really free? What's the catch?</strong></summary>
<br/>

No catch. EveryAIOS itself is free and open-source (MIT / Apache-2.0). You bring your own API keys and pay your AI provider directly for tokens — usually fractions of a cent per request. You can also run completely free with local models like Ollama.

</details>

<details>
<summary><strong>Why would I use this instead of just opening Claude.ai or ChatGPT?</strong></summary>
<br/>

Web chatbots are great for quick questions. EveryAIOS is for getting actual work done:

- **Your own keys, your own models.** Use whatever model makes sense for the job — not just the one the website offers.
- **Real documents.** EveryAIOS can open a real `.xlsx` file, recalculate its formulas, and save it back — without hallucinating numbers or corrupting your formatting.
- **Persistent memory.** EveryAIOS remembers your preferences, past errors, and project context across sessions. Web chats start fresh every time.
- **Background tasks.** Schedule agents to run at 7 AM, pull data, and send you a briefing — even when the app is closed.
- **Your data stays local.** Everything is encrypted on your own drive.

</details>

<details>
<summary><strong>Can I run it completely offline?</strong></summary>
<br/>

Yes. Connect EveryAIOS to a local model runtime — Ollama, LM Studio, vLLM, llama.cpp, or Apple MLX — and everything runs on your computer with zero network traffic. Inference, memory indexing, document processing: all local.

</details>

<details>
<summary><strong>I already use a coding agent like Claude Code or Codex. Why do I need this?</strong></summary>
<br/>

You don't have to choose. EveryAIOS can host those agents inside itself — they keep their own tools and reasoning. What you get is a better environment around them: a cockpit UI, real spreadsheet and document support, browser automation, persistent memory, scheduling, and a security review layer that shows you exactly what the agent is about to do before it does it.

</details>

<details>
<summary><strong>How does the multi-agent swarm feature work?</strong></summary>
<br/>

EveryAIOS runs up to **3 subagents at once** (6 per task, nesting depth 2 — the limits the shipped code actually enforces), each in its own isolated Git worktree. They can work on different parts of a codebase simultaneously without file conflicts, then merge their results together. A central agent-binding slot coordinates routing and merging. You watch the whole thing in the Activity view.

</details>

<details>
<summary><strong>How does it avoid making the same mistakes twice?</strong></summary>
<br/>

When an agent hits an error, EveryAIOS analyzes the failure and records a "negative constraint" — basically a note saying "don't try this approach again in this context." On the next turn, those constraints are automatically injected into the prompt. Over time, agents in your projects get noticeably better at avoiding the failure patterns they've already seen.

</details>

<details>
<summary><strong>Where are my API keys stored? Are they safe?</strong></summary>
<br/>

Your keys are stored in an AES-256 encrypted local database (SQLCipher) on your own machine. They never go to any third party — only directly to the official API endpoint of the provider you're using (e.g. `api.openai.com`). No relay, no proxy, no telemetry.

</details>

<details>
<summary><strong>What is the security review layer?</strong></summary>
<br/>

Before any agent can do something potentially dangerous — write to a file, run a shell command, make a network request outside your workspace — EveryAIOS intercepts it, shows you a visual diff card explaining exactly what's about to happen, and waits for your approval. Every approved action is logged in a tamper-evident audit trail. You can also configure which categories of actions are auto-approved or always blocked.

</details>

<details>
<summary><strong>If my agent has its own shell and file tools, can EveryAIOS still see them?</strong></summary>
<br/>

There are two planes, and EveryAIOS tells you plainly which one you are in.

**Anything reached through EveryAIOS** — Office, browser, computer use, memory, search, connectors, your files — is authorized, executed and recorded by EveryAIOS. That is a genuine audit trail, and you can replay it.

**An external agent's own built-in tools** — its own shell, its own editor, its own network calls — run under that agent's permissions and your operating system's sandbox, not ours. The app shows you which mode is in force rather than pretending the two are identical, and it will not claim an audit trail it did not write.

The full design is in [`ARCH/EXTERNAL-AGENTS.md`](ARCH/EXTERNAL-AGENTS.md) §5.

</details>

<details>
<summary><strong>Is it ready to use?</strong></summary>
<br/>

Yes — build it from source and you get everything described above, today. What is still in progress is the *shipping* side: signed installers, the auto-updater and release qualification ([`TODO.md`](TODO.md) → **P70**). We develop in the open rather than keeping the code private until launch day.

</details>

<details>
<summary><strong>How do I contribute or report a bug?</strong></summary>
<br/>

Open an issue or PR on GitHub. The full codebase — all 22 Rust crates, 11 TypeScript packages, and the React cockpit — is here. The [`TODO.md`](TODO.md) lists exactly what's built, what's open, and what's next.

</details>

---

## License

EveryAIOS is dual-licensed under the **[MIT License](LICENSE-MIT)** and the **[Apache License, Version 2.0](LICENSE-APACHE)**. Free to use, fork, and build on.
