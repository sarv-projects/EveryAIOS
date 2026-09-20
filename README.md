<p align="center">
  <img src="src-tauri/icons/128x128.png" width="88" alt="EveryAIOS" />
</p>

<h1 align="center">EveryAIOS</h1>
<h3 align="center">Every AI. Every Agent. Every Task. One Space.</h3>

<p align="center">
  <a href="#-desktop-installers--coming-soon"><img src="https://img.shields.io/badge/Desktop%20App-Coming%20Soon-blueviolet?style=for-the-badge&logo=windows&logoColor=white" alt="Coming Soon" /></a>
  <a href="TEST-CASES.md"><img src="https://img.shields.io/badge/Test%20Suite-50%20Real%20Use%20Cases-brightgreen?style=for-the-badge" alt="50 Use Cases" /></a>
  <a href="#-run-from-source-today"><img src="https://img.shields.io/badge/Open%20Source-100%25%20Free-success?style=for-the-badge" alt="Open Source" /></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT%2FApache--2.0-lightgrey?style=flat-square" alt="License" />
  <img src="https://img.shields.io/badge/platforms-Windows%2011%20%7C%20macOS%20%7C%20Linux-blue?style=flat-square" alt="Platforms" />
  <img src="https://img.shields.io/badge/privacy-100%25%20Local--First-success?style=flat-square" alt="Privacy" />
</p>

---

**Jump to:** [What you can do](#what-can-you-actually-do-with-it) · [Run it today](#-run-it-today-from-source) · [What's ready vs. coming](#whats-ready-today-and-whats-not) · [How it compares](#how-it-compares) · [FAQ](#frequently-asked-questions)

---

EveryAIOS is a **free, open-source desktop app** that brings all of your AI tools, agents, and workflows into one place — on your own computer, with your own keys, with your data staying local.

Think of it as a home base for everything AI: you can chat with any model you want, connect your favorite coding agents, work with real Office documents, automate repetitive tasks on a schedule, and browse the web — all from a single, fast, native desktop cockpit.

No subscriptions. No walled gardens. No vendor lock-in. Just your AI work, the way you want it.

---

## What can you actually do with it?

Here's a taste of what EveryAIOS makes possible out of the box:

**Work with any AI model**
Switch between OpenAI, Anthropic, Google Gemini, DeepSeek, Qwen, and more in the same session. Or go fully offline with local models like Ollama, LM Studio, or Apple MLX — your keys stay on your machine, encrypted.

**Connect your coding agents**
If you use Claude Code, OpenAI Codex, Aider, or any other coding CLI, EveryAIOS can host them natively. They keep their own tools and reasoning — you just get a better cockpit around them.

**Actually work with spreadsheets and documents**
EveryAIOS has a real, embedded spreadsheet engine (IronCalc) that recalculates Excel formulas natively — no guessing, no hallucinating numbers. It can also surgically edit Word documents and PDFs without corrupting your formatting.

**Browse the web and control your desktop**
Built-in tiered browser automation (from a lightweight headless browser all the way up to full Chrome) lets agents navigate web pages, fill forms, and extract data. Computer use lets agents control your actual OS windows — useful for legacy software, SAP, QuickBooks, and more.

**Automate tasks in the background**
Schedule recurring tasks — morning briefings, repo health digests, data pulls — to run even when the app window is closed.

**Keep your past work and memory**
EveryAIOS builds up knowledge about your projects over time. It learns what approaches you prefer, remembers past errors so agents don't repeat them, and keeps a searchable log of everything that happened.

**Stay secure**
A built-in security layer reviews every potentially dangerous action before it runs, shows you exactly what's going to change, and keeps a tamper-evident audit log. Your files, keys, and data never leave your machine without you knowing.

---

## Capabilities at a glance

| Capability | Details |
| :--- | :--- |
| **100+ AI models** | OpenAI, Anthropic, Google Gemini, DeepSeek, Qwen, Llama, and any OpenAI-compatible endpoint. Switch mid-session. |
| **Fully offline** | Ollama, LM Studio, vLLM, llama.cpp, Apple MLX — zero network traffic when using local models. |
| **Bring your own key** | Keys stay in an AES-256 encrypted local vault. Auto-rotates to a backup key on rate limits. |
| **External agent hosting** | Run Claude Code, OpenAI Codex, Aider, Cline, Grok Build via open ACP stdio. They keep their own tools. |
| **Parallel subagents** | Up to **3 at once** (6 per task, nesting depth 2 — the shipped `SubAgentLimits`), each in its own Git worktree so files never collide, with automatic merge. |
| **Real spreadsheet engine** | IronCalc 0.8.3 — 300+ Excel formulas recalculated natively in Rust. Zero hallucinated numbers. |
| **Surgical document editing** | Word, PowerPoint, PDF — patches only the changed XML nodes, preserves formatting, macros, styles. |
| **3-tier browser automation** | Lightpanda (fast headless) → stealth scraping → full Chrome CDP with 37 tools. All local. |
| **Native desktop computer use** | Control real OS windows via accessibility tree + Win32 / macOS AX / Linux X11. Hardware emergency stop. |
| **Four-class memory** | **Context** (this turn) · **Episodic** (what happened — derived from your Work history, not a second log) · **Knowledge** (facts, entities, preferences) · **Procedural** (skills and learned workflows). Persists across sessions. |
| **Background automations** | 5-field cron scheduler runs 24/7, even when the app window is closed. |
| **Security review layer** | Every dangerous action gets a visual diff card and waits for your approval. Tamper-evident Merkle audit log. |
| **51 governed tools** | Browser (37), Office (4), Memory (3), Search (2), Storage (5) — all in-process, zero IPC overhead. |
| **12 cockpit screens + 19 side panels** | Chat, Projects, Files, Browser, Terminal, Office viewers, Guard dashboard, and more. |

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

> 💡 **The Universal Harness Advantage:** EveryAIOS does not force you to choose. Because it acts as an open operating layer, you can run specialized developer tools like Claude Code or OpenAI Codex *inside* EveryAIOS. They retain 100% of their native prompts, tools, and reasoning, while gaining EveryAIOS's native superpowers: in-process Excel formula recalculation, surgical Word/PDF part-patching, local browser automation, four-class durable memory, and a 24/7 background daemon.

---

## 📦 Desktop installers — not yet available

Everything in this README runs **today if you build from source**. There is no signed installer yet.

| Platform | Format | Status |
| :--- | :--- | :---: |
| **Windows 11 / 10** | `.msi` / `.exe` (x64 & ARM64) | ⏳ planned |
| **macOS (Apple Silicon)** | `.dmg` (M1 – M4, Universal) | ⏳ planned |
| **macOS (Intel)** | `.dmg` (x86_64) | ⏳ planned |
| **Linux (Ubuntu / Debian)** | `.deb` / `.AppImage` | ⏳ planned |

Packaging, code-signing, the auto-updater and release qualification are a defined but **unstarted** workstream ([`TODO.md`](TODO.md) → **P70**). We'd rather say that plainly than ship a first run we aren't happy with.

> ⭐ **Star and watch this repo** to get notified when installers go live.

→ [**Run it today from source**](#-run-it-today-from-source) — about 10 minutes.

---

## What's ready today, and what's not

We'd rather you know before you install than discover it later.

**Ready and working** — the local encrypted key vault (BYOK, multi-key failover), chat across 100+ models plus local runtimes, hosting external agents via ACP, the native spreadsheet engine, surgical Word/PDF editing, browser automation, computer use, memory, scheduled automations, and the approval/audit layer.

**Not finished** — packaged installers (above), and the architecture-consolidation work tracked as [P69](TODO.md) in `TODO.md`. That work is about tightening ownership inside the codebase, not about features you'd miss.

**One caveat worth reading: what EveryAIOS can and can't see.**

| | EveryAIOS fully governs | Your agent's own tools |
| :--- | :--- | :--- |
| **What it is** | anything reached through EveryAIOS — Office, browser, computer use, memory, search, connectors, files | an external agent's built-in shell, file editor, or its own network calls |
| **Coverage** | every action is authorized, executed and recorded by EveryAIOS | governed by **that agent's own permissions** plus your operating system's sandbox |
| **Honest claim** | full audit trail | EveryAIOS does **not** claim an audit trail here |

The app shows you which mode is in force rather than pretending both are identical. If you'd like the full detail, it's in [`ARCH/EXTERNAL-AGENTS.md`](ARCH/EXTERNAL-AGENTS.md) §5.

---

## 🛠️ Run it today (from source)

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
| **Desktop Shell** | Fast, native cockpit with 12 screens and 19 side panels. Built for real work, not demos. |
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
- [`TODO.md`](TODO.md) — implementation census (1,607 items; 1,304 completed)

</details>

---

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
<summary><strong>Is EveryAIOS production-ready?</strong></summary>
<br/>

The core architecture is complete and documented, and the whole app runs from source today. **The packaged installers are not finished** — signing, the auto-updater and release qualification are a defined, unstarted workstream ([`TODO.md`](TODO.md) → **P70**). We're doing it in the open rather than shipping a half-finished first run. If you build from source you get everything described above.

</details>

<details>
<summary><strong>How do I contribute or report a bug?</strong></summary>
<br/>

Open an issue or PR on GitHub. The full codebase — all 22 Rust crates, 11 TypeScript packages, and the React cockpit — is here. The [`TODO.md`](TODO.md) lists exactly what's built, what's open, and what's next.

</details>

---

## License

EveryAIOS is dual-licensed under the **[MIT License](LICENSE-MIT)** and the **[Apache License, Version 2.0](LICENSE-APACHE)**. Free to use, fork, and build on.
