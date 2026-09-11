<p align="center">
  <img src="src-tauri/icons/128x128.png" width="80" alt="EveryAIOS" />
</p>

<h1 align="center">EveryAIOS</h1>

<p align="center"><strong>Tell it what you want done. It figures out how. You stay in control.</strong></p>

<p align="center">
  An open-source, local-first AI coworker on your computer — files, spreadsheets, documents, browser, native desktop, code, email, calendar, and specialized agents.<br/>
  Your keys. Your hardware. Zero accounts. Nothing passes through a middleman server.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-blue?style=flat-square" alt="Cross Platform" />
  <img src="https://img.shields.io/badge/privacy-100%25%20Local--First%20%2B%20BYOK-success?style=flat-square" alt="Privacy First" />
  <img src="https://img.shields.io/badge/protocols-MCP%20%2B%20ACP%20Native-6f42c1?style=flat-square" alt="MCP and ACP Native" />
  <img src="https://img.shields.io/badge/safety-Guarded%20%26%20Audited-orange?style=flat-square" alt="Guarded Execution" />
  <img src="https://img.shields.io/badge/license-MIT%2FApache--2.0-lightgrey?style=flat-square" alt="License" />
</p>

<p align="center">
  <img src="5a1c3357-0cd1-492f-ac9f-efd313391587.png" width="94%" alt="EveryAIOS Workspace" />
</p>

---

## Quick Start

### 1. Download or Build

<table>
  <tr>
    <td><b>Platform</b></td>
    <td><b>Distribution</b></td>
    <td><b>Quick Command</b></td>
  </tr>
  <tr>
    <td><b>macOS</b></td>
    <td>Universal DMG / Homebrew</td>
    <td><code>brew install sarv-projects/tap/everyaios</code></td>
  </tr>
  <tr>
    <td><b>Windows</b></td>
    <td>x64 Installer (.exe) / WSL2</td>
    <td><code>winget install EveryAIOS.EveryAIOS</code></td>
  </tr>
  <tr>
    <td><b>Linux</b></td>
    <td>AppImage / .deb</td>
    <td><code>curl -fsSL https://everyaios.dev/install.sh | bash</code></td>
  </tr>
</table>

#### Developer Build (from source)

```bash
# Clone & install dependencies
git clone https://github.com/sarv-projects/EveryAIOS
cd EveryAIOS/desktop_app && pnpm install

# Compile coordinator engine & launch
pnpm --filter './packages/core-*' run build
pnpm --filter @everyaios/coordinator build
mkdir -p src-tauri/bin && cp packages/coordinator/dist/coordinator src-tauri/bin/coordinator
cd ui && bun install && cd ..
cd src-tauri && cargo tauri dev
```

---

## What is EveryAIOS?

Most AI tools force you into walled gardens — their cloud chat, their proprietary editor, their subscription, their server. When you move between tools, you lose the thread: what you were working on, what files were touched, and what was already tried.

**EveryAIOS is a single, unified operating layer for AI-assisted work on your own machine.**

You open the app. It asks: **"What would you like to get done?"** Drop a messy folder, a 400-page PDF, a broken codebase, a financial spreadsheet, or an email thread. It plans the steps, executes across your local tools, and asks before anything that actually modifies your files or system.

Switch models mid-stream, close your laptop, reboot, or hand off execution to Claude Code or Codex — **your work, memory, context, and safety rules remain completely intact.**

---

## The Five Guarantees

1. 🔒 **100% Private & Local-First (No Middleman Servers)**  
   EveryAIOS runs directly on your machine. All credentials, documents, and history live in an encrypted local vault. Your prompts and data go directly to the providers you configure (or stay offline on local hardware) — never proxied or logged through third-party servers.

2. 🛡️ **Propose, Never Impose**  
   The AI can plan, read, and draft freely, but it cannot mutate your system without authorization. Every file write, shell command, email dispatch, or external action passes through an explicit, human-verifiable approval gate with an instant undo receipt.

3. ⚡ **Persistent, Unbreakable Continuity**  
   Work is a durable object, not a temporary chat window. If your laptop dies, the network drops, or the model times out, your session, task dependency graph, and receipts reload exactly where you left off.

4. 📐 **Engine-True Precision**  
   Calculations in spreadsheets use real formula calculation engines, not token guesses. Word and PowerPoint edits patch only the targeted blocks while keeping custom formatting, themes, and macros bit-for-bit identical.

5. 🔀 **Absolute Model & Agent Freedom**  
   You are never locked into one model or subscription. Bring your own API keys, ring multiple keys to rotate automatically on rate limits, run open-source models offline via Ollama, LM Studio, or llama.cpp, or hand off tasks to external agent CLIs like Claude Code or Codex.

---

## What You Can Get Done

* 📁 **Reorganize & Clean Downloads**  
  Drop a cluttered directory. EveryAIOS scans the folder, identifies duplicates by hash and structure, and proposes a clean layout as a plan. You review the exact move list and approve it with one click. If you change your mind, roll back the entire operation instantly.

* 🔍 **Turn Messy Research into Presentations**  
  Ask for a deep competitor analysis. EveryAIOS runs parallel multi-source web research, strips noise, verifies claims with real citations, recalculates figures, and surgically drafts a slide deck or summary brief.

* 📊 **Financial Spreadsheet Updates**  
  Drop a quarterly financial model. The engine recalculates formulas with mathematical certainty, updates numbers across sheets, and refreshes the executive memo. Unsupported formulas are explicitly flagged rather than hallucinated.

* 🛠️ **Fix Broken Repositories with Verifiable Proof**  
  Point to a broken repository. The agent inspects code intelligence diagnostics, identifies root causes, drafts minimal surgical diffs, runs your tests to observe failures, applies the fix upon your approval, and records passing test evidence.

* 🤝 **Handoff Between Agents Mid-Task**  
  Start drafting a project with an inexpensive local model. When you need specialized reasoning, switch the session Chief to Claude Code or Codex. EveryAIOS transfers a compacted context bundle so the new agent takes over without losing project history.

* ⚙️ **Hands-Free Repetitive Automations**  
  Teach EveryAIOS a multi-step routine once. The crystallization engine compiles your workflow into a deterministic local skill that executes on schedule without burning model tokens.

---

## Core Capabilities

### 🧠 Any Model, Any Provider
* **100+ Cloud Providers:** Connect OpenAI, Anthropic, Google Gemini, OpenCode (Zen, Go, and Free), Groq, DeepSeek, Cerebras, Mistral, and NVIDIA NIM.
* **Auto-Failover Key Rings:** Assign multiple keys per provider. When an API hits a rate limit (HTTP 429), it automatically cools down and rotates to the next key without breaking your stream.
* **Hardware-Aware Local Models:** Built-in hardware scanner that matches your available VRAM and RAM against open-source models (GGUF/MLX) with live search and zero hardcoded names.
* **Cost & Cache Accounting:** Real-time visibility into input cache hits, output generation, and exact spending per turn.

### 🎛️ The Three-Control Composer
Take full command of how every task executes:
* **Agent (WHO):** Choose the built-in coworker, a tailored persona, or an installed external CLI (Claude Code, Codex, Aider, OpenCode) to lead the session.
* **Work Mode (WHAT):** Select `Auto` for standard interaction, `Plan` for structured blueprints, `Build` for execution, or `Research` for multi-source exploration.
* **Autonomy (HOW MUCH):** Adjust freedom dynamically:
  * `Sandbox`: Strictly read-only exploration.
  * `Ask`: Confirms every modification before execution.
  * `Auto`: Executes safe routine actions, prompting only for significant changes.
  * `Maximum`: High autonomy while still strictly blocking destructive commands.

### 💾 Cognitive Memory That Actually Remembers
* **Remembers Your Context:** Retains facts, project preferences, and decisions across days and weeks without bloating your token window.
* **Coding Taste Profile:** Automatically learns your naming conventions, formatting preferences, and architectural style from the changes you accept.
* **Pass-by-Reference Context:** Massive datasets and documents are indexed as lightweight handles with instant previews rather than dumped into the context window.
* **Spaced Repetition Review:** Integrated retention scheduling to help you review and reinforce facts and insights captured during research.

### 📑 Document & File Surgery
* **Byte-Preserving Office Edits:** Surgical block-patching for Word documents (`.docx`), Excel workbooks (`.xlsx`), and PowerPoint decks (`.pptx`).
* **IronCalc Formula Engine:** Mathematical recalculation supporting 300+ spreadsheet functions.
* **Native PDF Suite:** Fast full-text search, form filling, text replacement, and redactions.
* **Storage Intelligence:** Parallel work-stealing disk scanner that maps disk usage, pinpoints massive files, detects duplicate data, and generates guided cleanup plans.

### 🌐 Browser Automation & Computer Use
* **Inbuilt Fast Browser:** High-speed browser automation driven directly via accessibility trees and DOM snapshots. Operates without requiring heavy vision models.
* **Computer Use Agent:** Real OS desktop control (Windows, macOS, Linux) with visual recognition for applications that lack accessible APIs. Operates safely in the background without stealing focus.
* **Encrypted Session Vault:** Safely stores authenticated browser sessions so you can perform authenticated research without re-logging in every session.
* **Humanized Realism:** Natural Bézier mouse curves and realistic keystroke cadences to avoid abrupt interactions.

### 🔌 Extensible Ecosystem
* **MCP-First:** Connect to any Model Context Protocol tool server or expose EveryAIOS's native tools (documents, browser, memory, storage) to other applications.
* **Connect Store:** Curated, one-click local OAuth integrations for GitHub, Google Workspace, Slack, Linear, Notion, and email (IMAP/SMTP/Gmail).
* **Developer Terminal:** Integrated multi-profile terminal with full PTY support for PowerShell, Command Prompt, WSL distros, and Unix shells.

---

<details>
<summary><strong>Architecture & Technical Specifications (For Engineers)</strong></summary>

<br/>

### Multi-Process Hybrid Design
EveryAIOS uses a multi-process architecture to guarantee responsiveness, safety, and memory isolation:

```
┌─────────────────────────────────────────────────────────────────┐
│                        Tauri 2 Native UI                        │
│            React 19 · Zustand · Tailwind · Monaco Editor        │
└────────────────────────────────┬────────────────────────────────┘
                                 │ Tauri IPC (250 Native Commands)
┌────────────────────────────────┴────────────────────────────────┐
│                        Core Rust Engine                         │
│  • Security Gate: Deterministic regex prescan & ticket authority│
│  • Encrypted Vault: SQLCipher credential broker with 429 logic  │
│  • Document Engines: Surgical OOXML part-patching & IronCalc    │
│  • Browser Core: Loopback CDP client & Obscura lightweight tier │
│  • Computer Use: Native window hooks, UIA/AX, and CUA DAG runtime│
│  • Storage Intelligence: Work-stealing disk scanner & dedup     │
│  • Memory Core: 34 cognitive retrieval algorithms & FSRS-6      │
│  • Code Intelligence: LSP runner & Tree-sitter RepoMap PageRank │
│  • Audit Engine: Append-only NDJSON ledger & Merkle hash chains │
└────────────────────────────────┬────────────────────────────────┘
                                 │ Length-Prefixed Stdio JSON-RPC
┌────────────────────────────────┴────────────────────────────────┐
│                   Supervised Bun Coordinator                    │
│  • Turn Orchestrator: 12-segment prompt assembler               │
│  • Dynamic Chief: Handoff adapter for external ACP agent CLIs   │
│  • Context Optimization: Prefix-cache boundaries & compaction   │
│  • Tool Hub: Local MCP server bridge & auth connectors          │
└─────────────────────────────────────────────────────────────────┘
```

### Key Engineering Invariants
* **Sidecar Proposes, Rust Disposes:** The TypeScript coordinator formulates plans and tool calls. Mutating calls generate a single-use authorization ticket validated by the Rust security engine before execution.
* **Cryptographic Diff-Cards:** Visual confirmation cards carry a unique machine-readable reason and cryptographic nonce displayed in an isolated native window to prevent clickjacking or prompt spoofing.
* **Credential Sealing:** Raw API keys are never stored in browser memory, coordinator memory, or chat logs. The Rust credential broker injects headers directly onto outbound HTTPS sockets and zeroizes temporary buffers immediately.
* **Deterministic Verification:** Every automated plan requires verifiable evidence before marking tasks complete. If an outcome cannot be programmatically verified, it is marked unverifiable rather than assumed successful.

</details>

---

## License

EveryAIOS is open source and dual-licensed under the [MIT License](LICENSE-MIT) and the [Apache License, Version 2.0](LICENSE-APACHE).
