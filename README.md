<p align="center">
  <img src="src-tauri/icons/128x128.png" width="80" alt="EveryAIOS" />
</p>

<h1 align="center">EveryAIOS</h1>

<p align="center"><strong>The All-in-One AI Desktop App — Chat, Cowork & Code on Your Computer.</strong></p>

<p align="center">
  One single desktop app for your everyday work: talk through ideas, crunch spreadsheets, edit documents, browse the web, and build software.<br/>
  <strong>Use your favorite AI models (ChatGPT, Claude, DeepSeek, Qwen, or local offline AI). Bring your favorite coding tools. Keep 100% of your data private.</strong>
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

<p align="center">
  <img src="5a1c3357-0cd1-492f-ac9f-efd313391587.png" width="94%" alt="EveryAIOS Workspace" />
</p>

---

## Why EveryAIOS? See the Difference

Most people today juggle **3 to 5 separate AI tools**: a chat app for questions, an IDE for code, an online spreadsheet tool, and separate browser plugins. You pay multiple \$20/month subscriptions, constantly hit message rate limits, and re-copy context all day.

**EveryAIOS replaces that entire mess with one app:**

| Feature | **EveryAIOS** | **ChatGPT / Claude Desktop** | **Cursor / Windsurf** | **Terminal Tools (Claude Code, Aider)** |
| :--- | :---: | :---: | :---: | :---: |
| **All-in-One: Chat + Cowork + Coding** | ✅ **Yes (One App)** | ⚠️ Chat only | ⚠️ Code editing only | ⚠️ Terminal coding only |
| **Bring Any AI Model You Want**<br/>*(DeepSeek, Claude, GPT-4o, Qwen, Groq, Llama, Ollama)* | ✅ **Universal Freedom**<br/>*(100+ models or local offline)* | ❌ **Locked**<br/>*(Only their own model)* | ⚠️ **Limited**<br/>*(A few selected providers)* | ⚠️ **Limited**<br/>*(Requires command-line setup)* |
| **Use Your Favorite Coding Agents**<br/>*(Claude Code, Cline, Aider, OpenCode, or Native)* | ✅ **Run them all inside EveryAIOS** | ❌ None | ❌ Locked to their own editor | ❌ Standalone separate CLIs |
| **Real Excel & Document Editing**<br/>*(Recalculates formulas, edits Word & PDFs)* | ✅ **Built-in Local Engine**<br/>*(0 AI tokens wasted on math)* | ❌ **Burns message quota**<br/>*(Guesses formulas as text)* | ❌ None | ❌ None |
| **Autonomous Browser & Desktop Actions**<br/>*(Clicks, fills forms, navigates apps)* | ✅ **Built-in (37 Actions)** | ⚠️ Limited / slow cloud beta | ❌ None | ❌ None |
| **No Annoying "Wait 4 Hours" Limits** | ✅ **Auto-rotates backup keys**<br/>*(Work never stops)* | ❌ **Strict message caps**<br/>*(Locked out when limit hit)* | ❌ Fails when quota hit | ⚠️ Manual fallback |
| **Safety & 1-Click Undo** | ✅ **Safe Approval Cards**<br/>*+ Instant 1-Click Rollback* | ❌ No file rollback | ⚠️ Standard git only | ⚠️ Terminal prompts |
| **100% Private & Local-First** | ✅ **Your files stay on your machine** | ❌ Cloud-hosted | ⚠️ Cloud telemetry | ⚠️ Local terminal |
| **Price** | 🟢 **Free & Open Source**<br/>*(Pay only for pennies of raw tokens)* | 🔴 \$20 – \$200 / month | 🔴 \$20 / month | 🟢 Open source |

---

## The 3 Things You Can Do in One Cockpit

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                             EVERYAIOS DESKTOP COCKPIT                            │
├─────────────────────────┬────────────────────────────┬───────────────────────────┤
│        1. CHAT          │         2. COWORK          │         3. CODE           │
│  • Brainstorm & write   │  • Real Excel formulas     │  • Fix bugs & write code  │
│  • Deep web research    │  • Word documents & PDFs   │  • Use Claude Code, Cline,│
│  • Remembers your style │  • Automate web browser    │    Aider, or Native Agent │
│  • Zero-cost memory     │  • Control desktop apps    │  • 1-Click Undo any diff  │
│  • Any AI model         │  • Connect Email & Slack   │  • Runs your tests first  │
└─────────────────────────┴────────────────────────────┴───────────────────────────┘
```

### 1. 💬 Chat & Ideate (Better, Faster, and Cheaper)
* **Never lose context:** EveryAIOS remembers your project facts, preferences, and documents across sessions using smart local memory.
* **Cut AI costs by up to 90%:** Static prompts are cached efficiently, making turns faster and dramatically cheaper.
* **Choose the right model for the job:** Use ultra-fast, cheap models (like DeepSeek or Haiku) for quick lookups, and switch to heavy reasoning models (like Claude 3.7 or OpenAI o3) for hard thinking.

### 2. 📊 Cowork (Real Documents & Browser Automation)
* **Real Excel Spreadsheets:** Unlike chat apps that guess math in text, EveryAIOS includes a real calculation engine. It recalculates formulas across `.xlsx` sheets, updates charts, and leaves your formatting intact.
* **Word & PDF Editing:** Fill forms, extract tables, redact sensitive data, and draft clean `.docx` files.
* **Smart Browser Automation:** The built-in browser can navigate websites, research competitors, log into portals, and extract clean information without ads or clutter.
* **Computer Control:** Can interact with desktop applications on Windows, macOS, and Linux to get tedious tasks done.

### 3. 💻 Autonomous Coding (With a Safety Net)
* **Your Favorite Agents in One Home:** Prefer Claude Code or Aider for terminal work? Love Cline for in-editor patching? EveryAIOS hosts them seamlessly in the same app.
* **1-Click Time-Travel Undo:** Every single code change is automatically checkpointed. If an agent makes a mistake, click **"Undo"** to instantly roll your files back to the exact previous second.
* **Never Guesses Edits:** The code engine insists on finding the exact right spot before changing files. If an edit is ambiguous, it stops and asks rather than breaking your project.

---

## Bring Your Favorite Model & Hardware

You are never locked into a single AI provider:

* **Cloud Frontier Models:** Anthropic (Claude 3.5 / 3.7), OpenAI (GPT-4o, o1, o3), Google (Gemini 2.0 / 1.5 Pro).
* **High-Speed & Global Models:** DeepSeek (V3, R1), Alibaba Qwen (2.5, Coder), Groq (instant LPU responses), Mistral, SiliconFlow, OpenRouter.
* **100% Private Offline Models:** Run models completely offline on your own machine using **Ollama**, **LM Studio**, or Apple Silicon **MLX**. Zero data ever leaves your computer.
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
* 🛠️ **Debug a failing test suite:** Give it a repository. It reads compiler errors, pinpoints the broken line, applies a surgical fix, runs the tests to prove it works, and gives you a 1-click rollback if you want to revert.
* 🔍 **Write a comprehensive briefing:** Give it a topic. It browses dozens of sources, filters out marketing fluff, keeps exact links to every claim, and formats a clean report or slide deck.

---

## Built for Real Work: Everything You Need in One Place

Instead of juggling separate chat subscriptions, web spreadsheets, browser extensions, and terminal windows, EveryAIOS unifies your daily workflow into one seamless desktop app:

### 🧠 Universal Model Freedom (Cloud & 100% Local)
- **Use Any Model in the World:** Connect to Anthropic (Claude 3.5 & 3.7), OpenAI (GPT-4o, o1, o3), Google Gemini, DeepSeek (V3 & R1), Alibaba Qwen, Mistral, Groq, or any custom OpenAI-compatible endpoint.
- **Run Completely Offline:** Native support for local AI runtimes like **Ollama**, **LM Studio**, and Apple Silicon **MLX**. Work completely offline with zero data leaving your machine.
- **Never Get Interrupted by Rate Limits:** Add multiple backup API keys per provider. If one key hits a rate limit (429), EveryAIOS automatically switches to your backup key in real time without dropping your active conversation.
- **Smart Cost Saving:** Static system prompts and context are automatically cached, cutting your API token costs by up to 90% and making replies feel instant.

### 📊 Real Office Spreadsheets & Documents
- **Real Math, Not Hallucinated Text:** Unlike web chat tools that output static markdown tables or approximate numbers, EveryAIOS includes a real local spreadsheet calculation engine. It calculates formulas across `.xlsx` workbooks, preserves your cell styling, and ensures financial models stay 100% accurate.
- **Word & PDF Processing:** Read, edit, and generate `.docx` and `.pdf` files. Extract tables, fill out forms, redact sensitive information, and summarize contracts with precision.
- **Zero Token Waste:** All spreadsheet calculations and document parsing are performed locally on your device—saving your precious AI tokens for actual thinking.

### 🌐 Autonomous Web Research & Browser Actions
- **Deep Multi-Source Research:** Ask any complex question. EveryAIOS searches the web across multiple independent sources, filters out marketing clutter, and produces comprehensive research memos backed by exact source citations.
- **Smart Web Actions:** The built-in browser engine can navigate web portals, search catalogs, interact with web apps, and extract structured data automatically.
- **Zero Login Headaches:** Safely reuse your existing authenticated browser sessions to look up information behind logins without exposing your passwords.

### 💻 Powerful Coding & Instant 1-Click Rollback
- **Bring Your Favorite Coding Agents:** Connect the tools you already love—Claude Code, Cline, Aider, OpenCode, or our Native Agent—directly inside EveryAIOS.
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
1. <strong>Single Model Lock-in:</strong> They restrict you to their own model. With EveryAIOS, you can use Claude for writing, DeepSeek for affordable coding, GPT-4o for reasoning, or Ollama for privacy—all in the same chat.
2. <strong>Strict Hourly Limits:</strong> Hit your limit on Claude or ChatGPT, and you are locked out for hours. EveryAIOS lets you add backup keys and switch models instantly, so your work never stops.
3. <strong>No Real Office Math:</strong> Web chatbots cannot run real Excel spreadsheets or preserve your formulas. EveryAIOS has a built-in local calculation engine.
4. <strong>Privacy:</strong> Cloud chats store your conversations on their servers. EveryAIOS stores everything in an encrypted vault directly on your computer.
</details>

<details>
<summary><strong>Can I use EveryAIOS completely offline without the internet?</strong></summary>
<br/>
Yes! You can connect EveryAIOS to local runtimes such as <strong>Ollama</strong>, <strong>LM Studio</strong>, or Apple Silicon <strong>MLX</strong>. When using local models, all inference, memory indexing, and document processing happen entirely on your computer with zero network traffic.
</details>

<details>
<summary><strong>Can I bring my existing Claude Code, Cline, or Aider setup?</strong></summary>
<br/>
Yes! EveryAIOS natively supports the open Agent Client Protocol (ACP). If you already love using Claude Code in your terminal, Cline in your IDE, or Aider for git commits, you can connect them directly into EveryAIOS. They gain access to EveryAIOS's Excel engine, browser actions, and local memory automatically.
</details>

<details>
<summary><strong>Where are my API keys stored?</strong></summary>
<br/>
Your API keys are stored locally on your device in an encrypted SQLCipher database using AES-256 encryption. They never leave your machine except in direct, encrypted HTTPS requests to the official provider endpoints (e.g., `api.anthropic.com` or `api.openai.com`). Keys are never sent to any third-party relay or proxy.
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
