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

## 📦 Desktop Installers — Coming Soon

We're putting the finishing touches on signed, auto-updating desktop installers.

| Platform | Format | Status |
| :--- | :--- | :---: |
| **Windows 11 / 10** | `.msi` / `.exe` (x64 & ARM64) | 🟡 Coming Soon |
| **macOS (Apple Silicon)** | `.dmg` (M1 – M4, Universal) | 🟡 Coming Soon |
| **macOS (Intel)** | `.dmg` (x86_64) | 🟡 Coming Soon |
| **Linux (Ubuntu / Debian)** | `.deb` / `.AppImage` | 🟡 Coming Soon |

> ⭐ **Star and watch this repo** to get notified the moment installers go live.

The full codebase is open-source and builds from source today — [jump to the quickstart](#-run-from-source-today) if you want to try it now.

---

## 🛠️ Run from Source Today

Don't want to wait? You can clone and run EveryAIOS locally right now.

**You'll need:**
- [Rust](https://rustup.rs/) (`cargo` 1.80+)
- [Node.js](https://nodejs.org/) v20+ and [pnpm](https://pnpm.io/) (`npm install -g pnpm`)
- Tauri build deps for your OS — see the [official Tauri prerequisites guide](https://v2.tauri.app/start/prerequisites/)

```bash
# Clone
git clone https://github.com/sarv-projects/EveryAIOS.git
cd EveryAIOS/desktop_app

# Install dependencies
pnpm install

# Build the coordinator sidecar
pnpm --filter @everyaios/coordinator build
mkdir -p src-tauri/bin && cp packages/coordinator/dist/coordinator src-tauri/bin/coordinator

# Launch the desktop app
cd src-tauri && cargo tauri dev
```

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
| **Memory & Work** | Persistent cognitive memory across sessions. Learns your preferences and avoids past mistakes. |
| **Automations** | Schedule recurring tasks. Background cron daemon runs even when the app is closed. |
| **Security** | 7-layer review membrane. Every destructive action requires your approval. Tamper-evident audit log. |

<details>
<summary><strong>See the full technical architecture →</strong></summary>

EveryAIOS is structured as two planes — the **Agent-Native Plane** (where external coding agents like Claude Code, Codex, and Aider run with their own loops and tools) and the **Shared Cowork Plane** (the native EveryAIOS services: Office engine, browser, computer use, memory, security, automations).

The architecture is documented in detail in [`ARCH/00-INDEX.md`](ARCH/00-INDEX.md). Key documents:

- [`ARCH/01-SYSTEM-ARCHITECTURE.md`](ARCH/01-SYSTEM-ARCHITECTURE.md) — Process topology, the 8 full-stack modules, IPC boundaries
- [`ARCH/02-MODULE-LAYOUT.md`](ARCH/02-MODULE-LAYOUT.md) — Ownership matrix for all 22 Rust crates and 11 TypeScript packages
- [`ARCH/06-SECURITY-GUARDRAILS.md`](ARCH/06-SECURITY-GUARDRAILS.md) — The full 7-layer security design
- [`ARCH/07-MEMORY-CONTEXT.md`](ARCH/07-MEMORY-CONTEXT.md) — 5-tier cognitive memory and ACT-R activation
- [`ARCH/09-FEATURE-MATRIX.md`](ARCH/09-FEATURE-MATRIX.md) — 166-submodule capability matrix
- [`ARCH/17-NATIVE-AGENT.md`](ARCH/17-NATIVE-AGENT.md) — The two-plane contract: what belongs to the agent vs. EveryAIOS
- [`DESKTOP-APP-SPEC.md`](DESKTOP-APP-SPEC.md) — The normative product contract and security invariants
- [`TODO.md`](TODO.md) — Implementation census (1,429 items; 1,221 completed)

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

EveryAIOS can spin up 20–30 subagents running in parallel, each in its own isolated Git worktree. They can work on different parts of a codebase simultaneously without causing file conflicts, then merge their results together. A central "Chief" agent coordinates routing and merging. You watch the whole thing in the Activity view.

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

The core architecture is complete and battle-tested. The packaged desktop installers are in final qualification (see the status table above). If you're comfortable building from source, everything runs and works today. We're being careful about the packaged release because we want the first-run experience to be great, especially on Windows.

</details>

<details>
<summary><strong>How do I contribute or report a bug?</strong></summary>
<br/>

Open an issue or PR on GitHub. The full codebase — all 22 Rust crates, 11 TypeScript packages, and the React cockpit — is here. The [`TODO.md`](TODO.md) lists exactly what's built, what's open, and what's next.

</details>

---

## License

EveryAIOS is dual-licensed under the **[MIT License](LICENSE-MIT)** and the **[Apache License, Version 2.0](LICENSE-APACHE)**. Free to use, fork, and build on.
