<p align="center">
  <img src="src-tauri/icons/128x128.png" width="80" alt="EveryAIOS" />
</p>

<h1 align="center">EveryAIOS</h1>

<p align="center"><strong>The All-in-One AI Desktop App — Chat, Cowork & Code on Your Computer.</strong></p>

<p align="center">
  One single desktop app for your everyday work: talk through ideas, crunch spreadsheets, edit documents, browse the web, and build software.<br/>
  <strong>Run your favorite coding agents (Claude Code, OpenAI Codex, Cline, Roo Code, Aider, OpenCode, or our Native Agent).<br/>
  Bring any AI model (Claude 3.7 Sonnet, OpenAI o3 / GPT-4o, DeepSeek-R1 / V3, Qwen 2.5 Coder, Gemini 2.0, or local offline AI via Ollama). Keep 100% of your data private.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/status-active%20development%20(build%20phase)-yellow?style=flat-square" alt="Active Development" />
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-blue?style=flat-square" alt="Cross Platform" />
  <img src="https://img.shields.io/badge/privacy-100%25%20Local--First%20%2B%20Encrypted-success?style=flat-square" alt="Privacy First" />
  <img src="https://img.shields.io/badge/pricing-Free%20%26%20Open%20Source-green?style=flat-square" alt="Free and Open Source" />
  <img src="https://img.shields.io/badge/license-MIT%2FApache--2.0-lightgrey?style=flat-square" alt="License" />
</p>

---

> ### 🚧 In Active Development / Build Phase
> **EveryAIOS is actively being built in the open.** The desktop app, core engines, document processors, and secure local vault run end-to-end today. Pre-packaged one-click installers (`.dmg`, `.msi`, `.AppImage`) are currently being finalized in the release pipeline. Developers can build and run directly from source right now.
>
> 🔗 [Detailed Feature Matrix](ARCH/09-FEATURE-MATRIX.md) &nbsp;·&nbsp; [Architecture Overview](ARCH/17-NATIVE-AGENT.md) &nbsp;·&nbsp; [Development Roadmap](TODO.md)

---

## Why EveryAIOS? See the Difference

Most people today juggle **3 to 5 separate AI tools**: a chat app for questions, an IDE for code, an online spreadsheet tool, and separate browser plugins. You pay multiple \$20/month subscriptions, constantly hit message rate limits, and re-copy context all day.

**EveryAIOS replaces that entire mess with one app:**

| Feature | **EveryAIOS** | **ChatGPT / Claude Desktop** | **Cursor / Windsurf** | **Terminal Tools (Claude Code, Aider)** |
| :--- | :---: | :---: | :---: | :---: |
| **All-in-One: Chat + Cowork + Coding** | ✅ **Yes (One Cockpit)** | ⚠️ **Chat-Centric**<br/>*(Claude has MCP & Computer Use preview; ChatGPT has Canvas & macOS Work with Apps; no unified IDE or Excel engine)* | ⚠️ **Code Editor Only**<br/>*(Agent Mode for coding; no Office/documents or general cowork)* | ⚠️ **Terminal Only**<br/>*(Headless CLI; no document viewers or visual interface)* |
| **Bring Any AI Model You Want**<br/>*(Claude 3.7 Sonnet, OpenAI o3 / GPT-4o, DeepSeek-R1 / V3, Qwen 2.5 Coder, Gemini 2.0, Llama 3.3, Ollama)* | ✅ **Universal Freedom**<br/>*(100+ frontier & local models via BYOK or 100% offline with Ollama/MLX/vLLM)* | ❌ **Locked Walled Garden**<br/>*(Restricted to their own models only)* | ⚠️ **Curated Cloud Selection**<br/>*(Claude, GPT, proprietary models; limited local LLM support)* | ⚠️ **Limited / Complex**<br/>*(Claude Code is Anthropic-only; Aider requires terminal setup)* |
| **Use Your Favorite Coding Agents**<br/>*(Claude Code, OpenAI Codex, Cline, Roo Code, Aider, OpenCode, or Native)* | ✅ **Run them all inside EveryAIOS**<br/>*(Native-first ACP agent hosting)* | ❌ **None**<br/>*(Cannot host external coding agents)* | ❌ **Locked to Editor Agent**<br/>*(Cannot run competing CLI agents)* | ⚠️ **Isolated CLIs**<br/>*(Separate terminal windows without unified app context)* |
| **Universal Tool & MCP Support**<br/>*(Connect any MCP server, database, API, or local skill)* | ✅ **Full MCP Client & Server**<br/>*+ Two-Plane Native Tool Facades* | ⚠️ **Partial**<br/>*(Claude Desktop supports MCP servers; ChatGPT has no MCP)* | ⚠️ **IDE MCP Support**<br/>*(Can connect MCP tools in editor)* | ⚠️ **Manual CLI Setup**<br/>*(Requires JSON editing per tool)* |
| **Real Excel & Document Editing**<br/>*(Recalculates formulas, edits Word & PDFs)* | ✅ **Built-in Local Calculation Engine**<br/>*(Recalculates formulas across `.xlsx`, edits Word & PDFs, 0 tokens spent on math)* | ❌ **Burns Message Quota**<br/>*(Guesses formulas as text or runs cloud Python sandbox; doesn't preserve Excel sheets)* | ❌ **None** | ❌ **None** |
| **Autonomous Browser Use (Web Automation)**<br/>*(37 CDP tools, navigates web, fills forms, extracts data, reuses logins)* | ✅ **Built-in Browser Engine**<br/>*(Multi-browser: Brave, Chrome, Edge, Arc; safe session vault reuses logins)* | ⚠️ **Limited / Slow**<br/>*(Cloud browsing only; Claude Computer Use preview is slow/costly)* | ❌ **None** | ❌ **None** |
| **Native Computer Use (Desktop Automation)**<br/>*(Controls desktop apps, clicks UI elements, OCR, keyboard/mouse)* | ✅ **Native OS Desktop Control**<br/>*(Windows UIA/WGC, macOS AX, Linux X11; visual grounding & OCR)* | ⚠️ **Cloud CUA Beta**<br/>*(Expensive per-screenshot token streaming; macOS only)* | ❌ **None** | ❌ **None** |
| **No Annoying "Wait 4 Hours" Limits** | ✅ **Auto-Rotates Backup Keys**<br/>*(Multi-key pools per provider; work never pauses)* | ❌ **Strict 3–5 Hour Caps**<br/>*(Locked out when message limits hit)* | ❌ **Monthly Fast-Request Cap**<br/>*(Throttled or extra charges when 500 fast requests exhausted)* | ⚠️ **Manual Fallback**<br/>*(Stops on 429; requires manual key swap)* |
| **Safety & 1-Click Undo** | ✅ **Safe Approval Cards**<br/>*+ Instant 1-Click Shadow Git Rollback* | ❌ **No File Rollback**<br/>*(No local file versioning)* | ⚠️ **Standard Git / Checkpoints**<br/>*(Editor-only checkpoints)* | ⚠️ **Terminal Prompts**<br/>*(CLI prompts or manual git)* |
| **100% Private & Local-First** | ✅ **Local Encrypted Vault**<br/>*(AES-256 SQLCipher; run 100% offline air-gapped)* | ❌ **Cloud-Hosted**<br/>*(All data sent to remote cloud infrastructure)* | ⚠️ **Cloud Indexing**<br/>*(Codebase indexed and processed on cloud servers)* | ⚠️ **Local CLI, Cloud APIs**<br/>*(Terminal is local, but sends files to cloud LLMs)* |
| **Price** | 🟢 **Free & Open Source**<br/>*(Pay only pennies for raw token use or $0 offline)* | 🔴 **\$20 – \$200 / month**<br/>*(Single-user monthly fee)* | 🔴 **\$20 / month**<br/>*(Plus overage fees for high usage)* | 🟢 **Free / Open Source**<br/>*(CLI only, pay raw token costs)* |

---

## The 3 Things You Can Do in One Cockpit

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                             EVERYAIOS DESKTOP COCKPIT                            │
├─────────────────────────┬────────────────────────────┬───────────────────────────┤
│        1. CHAT          │         2. COWORK          │         3. CODE           │
│  • Brainstorm & write   │  • Real Excel formulas     │  • Fix bugs & write code  │
│  • Deep web research    │  • Word documents & PDFs   │  • Claude Code, Codex,    │
│  • Remembers your style │  • Autonomous Browser Use  │    Cline, Roo, Aider, etc.│
│  • Zero-cost memory     │  • Native Computer Use     │  • 1-Click Undo any diff  │
│  • Any AI model         │  • Connect Email & Slack   │  • Runs your tests first  │
└─────────────────────────┴────────────────────────────┴───────────────────────────┘
```

### 1. 💬 Chat & Ideate (Better, Faster, and Cheaper)
* **Never lose context:** EveryAIOS remembers your project facts, preferences, and documents across sessions using smart local memory.
* **Cut AI costs by up to 90%:** Static prompts are cached efficiently, making turns faster and dramatically cheaper.
* **Choose the right model for the job:** Use ultra-fast, cost-efficient models (like DeepSeek-V3, Claude 3.5 Haiku, or Gemini 2.0 Flash) for quick lookups, and switch to deep reasoning models (like Claude 3.7 Sonnet extended thinking, DeepSeek-R1, OpenAI o3, or Qwen 2.5 Coder) for hard engineering and complex logic.

### 2. 📊 Cowork (Real Documents, Browser Use & Computer Use)
* **Real Excel Spreadsheets:** Unlike chat apps that guess math in text, EveryAIOS includes a real calculation engine. It recalculates formulas across `.xlsx` sheets, updates charts, and leaves your formatting intact.
* **Word & PDF Editing:** Fill forms, extract tables, redact sensitive data, and draft clean `.docx` files.
* **Autonomous Browser Use:** Built-in 37-tool browser engine navigates complex websites, logs into portals with your existing sessions, fills forms, and extracts clean information without ads or clutter.
* **Native Computer Use:** Controls desktop software across Windows, macOS, and Linux. Takes screenshots, locates UI controls with visual grounding & OCR, clicks buttons, and types text to automate tasks in apps without APIs.

### 3. 💻 Autonomous Coding (With a Safety Net)
* **Your Favorite Agents in One Home:** Prefer Claude Code or Aider for terminal work? Love Cline or Roo Code for in-editor patching? Need OpenAI Codex or OpenCode? EveryAIOS hosts them seamlessly in the same cockpit alongside our Native Agent.
* **1-Click Time-Travel Undo:** Every single code change is automatically saved in an isolated version checkpoint. If an agent makes a mistake, click **"Undo"** to instantly roll your files back to the exact previous second.
* **Never Guesses Edits:** The code engine insists on finding the exact right spot before changing files. If an edit is ambiguous, it stops and asks rather than breaking your project.

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

* 📁 **Clean up a messy 5GB Downloads folder:** Drop the folder in. It spots duplicates by file hash, proposes a tidy organization plan, and moves everything once you click approve.
* 📊 **Update a company budget model:** Drop in an Excel spreadsheet. It recalculates the formulas, updates the summary sheet, and highlights discrepancies without changing your formulas into static text.
* 🌐 **Autonomous Browser Use:** Ask it to research competitor pricing across 10 vendor sites. It logs into your supplier portal, traverses paginated results, downloads PDFs, and compiles an organized comparison matrix.
* 🖥️ **Desktop Computer Use:** Tell it to extract 50 entries from a spreadsheet and enter them into a legacy desktop accounting program. It sees the screen, navigates menus, types the fields, and submits each record automatically.
* 🛠️ **Debug a failing test suite:** Give it a repository. It reads compiler errors, pinpoints the broken line, applies a surgical fix, runs the tests to prove it works, and gives you a 1-click rollback if you want to revert.
* 🔍 **Write a comprehensive briefing:** Give it a topic. It browses dozens of sources, filters out marketing fluff, keeps exact links to every claim, and formats a clean report or slide deck.

---

## Built for Real Work: Everything You Need in One Place

Instead of juggling separate chat subscriptions, web spreadsheets, browser extensions, and terminal windows, EveryAIOS unifies your daily workflow into one seamless desktop app:

### 🧠 Universal Model Freedom (Cloud & 100% Local)
- **Use Any Model in the World:** Connect to Anthropic (Claude 3.7 Sonnet hybrid reasoning, Claude 3.5 Sonnet & Haiku), OpenAI (o3, o3-mini, o1, GPT-4o), Google Gemini (2.0 Pro & Flash), DeepSeek (DeepSeek-R1 & DeepSeek-V3), Alibaba Qwen (2.5-Coder 32B, 2.5 Max), Meta (Llama 3.3 70B), Mistral (Codestral, Large), Groq LPUs, or any custom OpenAI-compatible endpoint.
- **Run Completely Offline:** Native support for local AI runtimes like **Ollama**, **LM Studio**, **vLLM / llama.cpp**, and Apple Silicon **MLX**. Work completely offline with zero data leaving your machine.
- **Never Get Interrupted by Rate Limits:** Add multiple backup API keys per provider. If one key hits a rate limit (429), EveryAIOS automatically switches to your backup key in real time without dropping your active conversation.
- **Smart Cost Saving:** Static system prompts and context are automatically cached, cutting your API token costs by up to 90% and making replies feel instant.

### 📊 Real Office Spreadsheets & Documents
- **Real Math, Not Hallucinated Text:** Unlike web chat tools that output static markdown tables or approximate numbers, EveryAIOS includes a real local spreadsheet calculation engine. It calculates formulas across `.xlsx` workbooks, preserves your cell styling, and ensures financial models stay 100% accurate.
- **Word & PDF Processing:** Read, edit, and generate `.docx` and `.pdf` files. Extract tables, fill out forms, redact sensitive information, and summarize contracts with precision.
- **Zero Token Waste:** All spreadsheet calculations and document parsing are performed locally on your device—saving your precious AI tokens for actual thinking.

### 🌐 Autonomous Browser Use & Web Automation
- **37 Native Browser Actions:** Navigate websites, click buttons, fill multi-step forms, handle dynamic Single Page Apps (SPAs), scroll, and take full-page captures.
- **Your Choice of Browser:** Automatically discovers installed browsers on your system (**Brave**, **Google Chrome**, **Microsoft Edge**, **Arc**, **Vivaldi**, **Chromium**, or a custom binary) with channel-isolated profiles so your personal browser data is never disturbed.
- **Zero-Auth Session Vault:** Safely reuse your existing logged-in sessions (GitHub, AWS console, CRM, internal company intranets) without ever typing passwords into AI prompts or exposing cookies to third parties.
- **Deep Research & Fact Verification:** Autonomously searches multiple independent web sources, filters marketing fluff, and builds rich citation graphs with direct links to every source.
- **Accessibility-Aware Navigation:** Reads the web the way screen readers do—using real semantic accessibility trees (a11y) so it never gets confused by popups, ads, or floating banners.

### 🖥️ Native Computer Use & Desktop Automation
- **Control Real Desktop Software:** Go beyond the browser. EveryAIOS can interact with native desktop applications across Windows, macOS, and Linux—including legacy business software, ERPs, Photoshop, CAD, file managers, and terminal utilities.
- **See & Act (Visual Grounding + OCR):** Uses high-resolution screen capture, OCR, and vision AI to locate buttons, text inputs, dropdowns, and icons on your screen just like a human operator.
- **Natural Keyboard & Mouse Interaction:** Moves the cursor, performs clicks, drags, and types keyboard shortcuts naturally to execute multi-step desktop workflows.
- **Always in Your Control:** Watch the agent work live on your screen. You can pause, review, or halt computer use at any millisecond with a single click or keyboard shortcut.

### 💻 Powerful Coding & Instant 1-Click Rollback
- **Bring Your Favorite Coding Agents:** Connect the tools you already love—Claude Code, OpenAI Codex, Cline, Roo Code, Aider, OpenCode, Block Goose, or our Native Agent—directly inside EveryAIOS.
- **Integrated PTY Shell & Watch-the-Agent-Work:** Coding agents run commands inside real PTY terminal tabs with OSC 133 shell integration, showing you exact commands, exit codes, and outputs with live syntax-highlighted progress.
- **1-Click Time-Travel Undo:** Every single code change is automatically saved in an isolated version checkpoint. If an edit doesn't work as expected, hit **Undo** to roll back your files instantly to the exact previous second.
- **Tests Before Approval:** Before proposing changes to your codebase, EveryAIOS runs your test suite in the background to prove the fix actually works.
- **Surgical Precision:** Edits are verified against exact line matches and language syntax. No guessing or accidentally overwriting your functions.

### 🛡️ Enterprise-Grade Privacy & Security
- **100% Local-First:** Your documents, conversations, notes, and API keys are stored locally on your machine in an encrypted AES-256 vault.
- **Zero Telemetry, Zero Training:** Your data belongs to you. We never train models on your work, log your files, or send private data to central servers.
- **Clear Approval Cards:** The AI cannot modify your files, run terminal commands, or send external emails without presenting a clear visual diff for you to review and approve.
- **Protected Boundaries:** System directories, sensitive keys (`.ssh/`, `.git/`, environment variables), and cloud metadata are strictly walled off from the AI.

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
<summary><strong>Can I bring my existing Claude Code, OpenAI Codex, Cline, Roo Code, or Aider setup?</strong></summary>
<br/>
Yes! EveryAIOS natively supports the open Agent Client Protocol (ACP). If you already love using Claude Code in your terminal, Cline or Roo Code in your IDE, OpenAI Codex, or Aider for git commits, you can connect them directly into EveryAIOS. They preserve their native loops and tools while gaining access to EveryAIOS's local Excel engine, autonomous browser actions, computer use, and shared memory automatically.
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
* [`ARCH/09-FEATURE-MATRIX.md`](ARCH/09-FEATURE-MATRIX.md) — Complete feature and subsystem implementation matrix.
* [`TODO.md`](TODO.md) — Master implementation census and active development queue.
* [`SPEC-CHANGELOG.md`](SPEC-CHANGELOG.md) — Historical decisions, release logs, and verification evidence.

---

## License

EveryAIOS is open source and dual-licensed under the **[MIT License](LICENSE-MIT)** and the **[Apache License, Version 2.0](LICENSE-APACHE)**.
