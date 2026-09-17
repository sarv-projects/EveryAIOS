<p align="center">
  <img src="src-tauri/icons/128x128.png" width="88" alt="EveryAIOS" />
</p>

<h1 align="center">EveryAIOS</h1>
<h3 align="center">Every AI. Every Agent. Every Task. One Space.</h3>

<p align="center">
  <strong>The Universal Agentic Operating System & Desktop Harness ("The Switzerland of AI")</strong><br/>
  One unified native desktop cockpit for knowledge work, financial engineering, document surgery, browser automation, desktop control, multi-agent swarms, and autonomous software development.
</p>

<p align="center">
  <a href="#-desktop-app-installers--coming-soon"><img src="https://img.shields.io/badge/Desktop%20App-Coming%20Soon-blueviolet?style=for-the-badge&logo=windows&logoColor=white" alt="Desktop App Coming Soon" /></a>
  <a href="#-the-8-full-stack-modules"><img src="https://img.shields.io/badge/Architecture-8%20Full--Stack%20Modules-blue?style=for-the-badge" alt="8 Full-Stack Modules" /></a>
  <a href="TEST-CASES.md"><img src="https://img.shields.io/badge/Quality-ISO%2FIEC%2029119%20MNC%20Grade-success?style=for-the-badge" alt="ISO 29119 Tested" /></a>
  <a href="TEST-CASES.md#3-master-end-to-end-enterprise-testing-50-real-world-use-cases"><img src="https://img.shields.io/badge/E2E%20Testing-50%20Real%20Use%20Cases-brightgreen?style=for-the-badge" alt="50 Real Use Cases" /></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/architecture-v3.80%20Universal%20Harness-blue?style=flat-square" alt="Architecture v3.80" />
  <img src="https://img.shields.io/badge/platforms-Windows%2011%20%7C%20macOS%20%7C%20Linux-blue?style=flat-square" alt="Cross Platform" />
  <img src="https://img.shields.io/badge/privacy-100%25%20Local--First%20%2B%20Air--Gapped-success?style=flat-square" alt="Privacy First" />
  <img src="https://img.shields.io/badge/submodules-166%20Indexed%20(1221%20Verified)-green?style=flat-square" alt="166 Submodules" />
  <img src="https://img.shields.io/badge/security-7--Layer%20Guard--2%20%2B%20Merkle%20Audit-purple?style=flat-square" alt="Security" />
  <img src="https://img.shields.io/badge/license-MIT%2FApache--2.0-lightgrey?style=flat-square" alt="License" />
</p>

---

> [!IMPORTANT]
> ### 🚀 Desktop Release Status: Coming Soon!
> **Pre-packaged, auto-updating desktop installers (`.msi` for Windows 11, `.dmg` for macOS, and `.AppImage` for Linux) are currently in final release qualification.**
> 
> * **Primary Target**: **Windows 11** (Native MSVC, Windows UI Automation, ConPTY, Job Objects sandboxing).
> * **Cross-Platform**: macOS Sonoma / Sequoia (Apple Silicon & Intel) and Ubuntu 24.04 LTS.
> * **Developer Availability**: The entire codebase is **100% open-source and operational today**. You do not need to wait for binary releases—you can build, inspect, and run EveryAIOS locally from source right now!
> 
> 📦 [Jump to Developer Setup](#-developer-quickstart-run-from-source-today) &nbsp;·&nbsp; 📋 [Review the Enterprise Test Suite (TEST-CASES.md)](TEST-CASES.md) &nbsp;·&nbsp; 🗺️ [Inspect Architecture (ARCH/00-INDEX.md)](ARCH/00-INDEX.md)

---

## The Core Architectural Principle: "The Switzerland of AI"

### Permanent Rejection of the Proprietary Coding Agent Trap
Most AI companies rush to build their own closed coding models and proprietary prompting loops. This is a treadmill: competing against frontier AI labs on custom coding loops is an inefficient duplication of effort.

**EveryAIOS takes the radically opposite, durable approach:**
- **We build the Universal Desktop Operating System & Agent Harness.**
- Instead of forcing you into a single proprietary agent, EveryAIOS provides an open, governed desktop operating layer that **hosts, sandboxes, manages, evaluates, and orchestrates ANY agent** via open protocols (Agent Communication Protocol / ACP stdio and Model Context Protocol / MCP).
- Run your favorite frontier coding CLIs and external agent tools inside EveryAIOS. They retain 100% of their native loops, tools, and prompts while gaining access to EveryAIOS's native superpowers: **in-process Excel formula recalculation, surgical Word/PDF part-patching, 3-tier headless browsers, native desktop computer use, 5-tier cognitive memory, and a 7-layer cryptographic security membrane.**

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                    EVERYAIOS: THE SWITZERLAND OF AI                              │
├──────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                     THE AGENT-NATIVE PLANE                                       │
│          Hosted External Coding Agents & Swarms (via open ACP stdio JSON-RPC 2.0)               │
│      [Claude Code]   [OpenAI Codex]   [OpenCode]   [Aider]   [Cline / Roo]   [Grok Build]        │
│              • Native Prompts   • Native AST Editors   • Native Reasoning Loops                  │
├──────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                     THE SHARED COWORK PLANE                                      │
│                           Native Desktop Primitives & Subsystems                                 │
│   ┌───────────────────┬───────────────────┬───────────────────┬──────────────────────────────┐   │
│   │  Office Engine    │  Browser & CUA    │ Cognitive Memory  │  Security Membrane           │   │
│   │  • IronCalc XLSX  │  • Lightpanda Zig │ • 5-Tier ACT-R    │  • Zero-I/O Netfloor SSRF    │   │
│   │  • Surgical OOXML │  • Scrapling      │ • FTS5 BM25       │  • Lexical Pathfloor Sandbox │   │
│   │  • lopdf Reader   │  • 37 CDP Tools   │ • AvoidanceStore  │  • Guard-2 TTL Tickets       │   │
│   │  • Zero LLM Math  │  • Native SendInput│ • Knowledge Graph│  • Append-Only Merkle Audit  │   │
│   └───────────────────┴───────────────────┴───────────────────┴──────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Why EveryAIOS? Comprehensive Industry Comparison

Today, knowledge workers and engineers juggle 3 to 5 fragmented tools: a chat app for questions, an IDE for code, an online spreadsheet tool, and separate browser extensions. You pay multiple \$20–\$200/month subscriptions, constantly hit message rate limits, and re-copy context all day.

| Feature / Dimension | **EveryAIOS** | **ChatGPT / Claude Desktop** | **Cursor / Windsurf** | **Claude Cowork / Plugins** |
| :--- | :---: | :---: | :---: | :---: |
| **Architectural Model** | **Universal Desktop OS Harness**<br/>*(Switzerland of AI; runs any model or agent)* | **Proprietary Walled Garden**<br/>*(Locked to single vendor ecosystem)* | **Editor-Only Agent**<br/>*(Forked VS Code for code files only)* | **Single-Agent Cowork**<br/>*(Closed plugin ecosystem; cloud-bound)* |
| **Model Freedom (BYOK & Offline)** | ✅ **100+ Models + 100% Offline**<br/>*(Anthropic, OpenAI, Gemini, DeepSeek, Qwen, Ollama, MLX)* | ❌ **Single Provider Only**<br/>*(Cannot bring alternate frontier models)* | ⚠️ **Curated Cloud Selection**<br/>*(Proprietary cloud models; limited local LLMs)* | ❌ **Anthropic Only**<br/>*(No OpenAI, Gemini, or local models)* |
| **External Agent Hosting (ACP)** | ✅ **Host Any Coding Agent**<br/>*(Run external coding agents via ACP stdio)* | ❌ **None**<br/>*(Cannot host external agents)* | ❌ **Locked to Internal Agent**<br/>*(Cannot run competing agent engines)* | ❌ **None**<br/>*(Single proprietary agent)* |
| **Multi-Agent Swarms & Fleet Isolation** | ✅ **100+ Concurrent Worktrees**<br/>*(Isolated Git worktrees; zero file collision)* | ❌ **None**<br/>*(Single turn conversation)* | ❌ **None**<br/>*(Single editor composer)* | ❌ **None**<br/>*(Single agent execution)* |
| **Real Spreadsheet Recalculation** | ✅ **IronCalc 0.8.3 Engine**<br/>*(300+ Excel formulas; 0 tokens on arithmetic)* | ❌ **Hallucinates Math**<br/>*(Guesses numbers or runs slow cloud Python)* | ❌ **None**<br/>*(Code files only)* | ⚠️ **Basic Cloud Analysis**<br/>*(No in-process formula recalculation)* |
| **Surgical Document Part-Patching** | ✅ **Byte-Stable OOXML**<br/>*(Patches `.docx`, `.pptx`, `.pdf`; preserves styles)* | ❌ **Re-writes Entire Files**<br/>*(Corrupts themes, macros, and styles)* | ❌ **None** | ⚠️ **Limited Formatting**<br/>*(HTML/Markdown exports)* |
| **Tiered Browser Automation** | ✅ **Lightpanda + Cloak + CDP**<br/>*(Ultra-fast Zig headless $\to$ stealth $\to$ 37 CDP tools)* | ⚠️ **Slow Cloud Scraping**<br/>*(Cloud-rendered; high latency)* | ❌ **None** | ⚠️ **Cloud Browser**<br/>*(No local stealth fingerprinting)* |
| **Native Desktop Computer Use (CUA)** | ✅ **Windows UIA + SendInput**<br/>*(Hybrid A11y Tree + OCR; hardware estop)* | ⚠️ **macOS Beta Only**<br/>*(Cloud screenshot streaming; high token cost)* | ❌ **None** | ⚠️ **Experimental**<br/>*(High latency per-action token spend)* |
| **Cognitive Memory & Failure Immunity** | ✅ **ACT-R + AvoidanceStore**<br/>*(Learns from errors; kills repetitive failure loops)* | ⚠️ **Basic Memory**<br/>*(Flat text memory; repeats same errors)* | ⚠️ **Rules Files Only**<br/>*(Static `.cursorrules` text)* | ⚠️ **Session Ephemeral**<br/>*(Limited cross-session learning)* |
| **24/7 Background Automations** | ✅ **SQLCipher Calendar & Daemon**<br/>*(5-field cron daemon runs even when app is closed)* | ❌ **None**<br/>*(Requires active browser window)* | ❌ **None** | ❌ **None**<br/>*(Active session only)* |
| **Enterprise Security Membrane** | ✅ **7-Layer Guard-2 + Netfloor**<br/>*(Zero-I/O SSRF firewall; lexical pathfloor)* | ❌ **Cloud-Governed**<br/>*(No user-inspectable egress firewall)* | ⚠️ **Full OS Access**<br/>*(Runs with complete user privileges)* | ⚠️ **Standard Sandbox**<br/>*(No zero-I/O private subnet firewall)* |
| **Cryptographic Audit Trail** | ✅ **Append-Only Merkle Tree**<br/>*(Tamper-evident mathematical verification)* | ❌ **Closed Cloud Logs**<br/>*(Proprietary vendor telemetry)* | ❌ **None** | ❌ **Closed Telemetry** |
| **Cost & Licensing** | 🟢 **Free & Open Source**<br/>*(MIT / Apache-2.0; pay raw token costs or $0 offline)* | 🔴 **$20 – $200 / month**<br/>*(Per user monthly subscription)* | 🔴 **$20 / month**<br/>*(Plus usage overages)* | 🔴 **Enterprise Subscription** |

---

## The 8 Full-Stack Modules of EveryAIOS

EveryAIOS is engineered as an industrial-grade desktop operating harness across 22 Rust core crates, 11 TypeScript coordination packages, and a React 19 cockpit shell:

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                    THE 8 FULL-STACK MODULES                                      │
├──────────────────────────────────────────────────┬───────────────────────────────────────────────┤
│ 1. Universal Agent Hosting & Swarm Orchestrator │ 5. Work-Native Primitives (Office/Browser/CUA)│
│ 2. Model Gateway & Encrypted Keyring Vault       │ 6. Durable Work & 5-Tier Cognitive Memory     │
│ 3. Unified Cockpit Shell & Compaction Engine     │ 7. Executive Automations & 24/7 Calendar      │
│ 4. Governed MCP & Capability Marketplace         │ 8. Security Guard-2 & Merkle Audit Membrane   │
└──────────────────────────────────────────────────┴───────────────────────────────────────────────┘
```

### 1. 🤖 Module 1: Universal Agent Hosting & Swarm Orchestrator
- **ACP Stdio Host**: Connect external frontier and open-source coding agents over the Agent Communication Protocol (JSON-RPC 2.0 stdio). Agents retain their custom reasoning loops and tools.
- **Dynamic Chief Dispatch**: The Native Chief dynamically routes tasks to the best specialist agent, or manages multi-agent swarms.
- **Git Worktree Swarm Isolation**: Spin up 20–30 subagents concurrently without merge collisions. Each agent is provisioned in its own dedicated worktree (`.everyaios/worktrees/task-<id>`) with a serialized `GitOperationQueue` and 3-file blackboards (`task_plan.md`, `findings.md`, `receipts/`).
- **First-Class Interaction Tools**: Built-in `ask` (clarification dialogs with selectable options), `plan` (blueprint DAG decomposition), `todo` (real-time task checklist), and `subagent` (delegation to isolated workers).

### 2. 🔑 Module 2: Model Gateway & Encrypted Keyring Vault
- **Universal Model Freedom**: Connect to 100+ cloud models (OpenAI, Anthropic, Google Gemini, DeepSeek, Alibaba Qwen, Meta Llama) or run 100% private offline models via **Ollama**, **LM Studio**, **vLLM**, or Apple Silicon **MLX**.
- **SQLCipher AES-256-GCM Vault**: Credentials and session states are encrypted on disk with zero plaintext leakage to logs, prompts, or UI threads.
- **Automatic 429 Rate-Limit Failover**: Configure multi-key pools per provider. If a key encounters an HTTP 429 quota limit, EveryAIOS rotates to a backup key in `< 50ms` so your streaming session never halts.

### 3. 🖥️ Module 3: Unified Cockpit Shell & Context Compaction Engine
- **Linear/Apple-Grade Cockpit**: Built with React 19, Zustand 5, and Tailwind 4. Features 12 primary center screens and 19 interactive right-rail viewports (`office-xlsx`, `office-docx`, `office-pdf`, `code`, `diff`, `browse`, `desktop`, `terminal`, etc.).
- **Physical Spring Motion & Zero Layout Shift (CLS = 0)**: Damped spring physics (stiffness: 450, damping: 35) with 150ms crossfades (strictly no horizontal sliding) and exact structural skeletons.
- **Cache-Affine Prompt Assembler**: 12-segment prompt architecture with byte-stable prefix caching above `CACHE_BOUNDARY`, cutting token costs by up to 90%.
- **Context-Mode 50KB Output Ceilings**: Automatically truncates raw tool outputs exceeding 50KB with actionable query hints and pass-by-ref hashes (`refRegistry`).

### 4. 🔌 Module 4: Governed MCP & Capability Marketplace
- **51 In-Process Governed Tools**: High-speed, zero-latency tool execution covering browser (37), office (4), memory (3), search (2), and storage (5).
- **External Server Sandboxing**: Securely connect external stdio and SSE MCP servers with isolated process boundaries.
- **Zero-Trust Dispatch**: Every tool call is hashed using canonical IEEE-754 serialization, policy-evaluated, and ticketed through Guard-2 before execution.

### 5. 📊 Module 5: Work-Native Primitives (Office, Browser, CUA)
- **Embedded IronCalc 0.8.3 Spreadsheet Engine**: Recalculates complex formula chains (SUM, VLOOKUP, INDEX/MATCH, circular iterations) natively in Rust with zero IPC serialization overhead and 0 tokens spent on math.
- **Surgical OOXML Part-Patcher**: Unpacks DOCX, PPTX, and PDF archives in memory, surgically patches only modified XML nodes, and repacks with original themes, macros, and styles 100% intact.
- **3-Tier Headless Browser Stack**:
  - *Tier 1 (Lightpanda)*: Ultra-fast Zig headless engine (10x faster, 90% less RAM than Chromium).
  - *Tier 2 (Scrapling & CloakBrowser)*: Stealth scraping with Canvas/WebGL fingerprinting to bypass anti-bot defenses without external paid proxies.
  - *Tier 3 (Full Chrome CDP)*: Complete 37-tool Chrome DevTools Protocol automation with live screencasting in the right rail.
- **Native Computer Use Agent (CUA)**: High-precision OS desktop control (Windows `SendInput`, macOS AX, Linux X11) using hybrid accessibility tree grounding, OCR fallback, and an instant hardware Emergency Stop (`Ctrl+Alt+Escape`).

### 6. 🧠 Module 6: Durable Work & Cognitive 5-Tier Memory Subsystem
- **5-Tier Cognitive Memory Hierarchy**: Combines working context, episodic session logs, semantic retrieval, temporal knowledge graphs, and user architectural taste profiles.
- **`AvoidanceStore` Autonomous Failure Immunity**: Analyzes root causes from past execution failures and automatically injects learned negative constraints into prompts, preventing agents from getting trapped in repetitive error loops.
- **Cryptographic Storage Deduplication**: 7-stage deduplication pipeline (xxHash3 + BLAKE3) with interactive squarified treemaps.

### 7. 📅 Module 7: Executive Automations & 24/7 Calendar Daemon
- **Local Encrypted Calendar Engine**: Backed by SQLCipher tables (`ui_calendars`, `ui_calendar_events`) with conversational natural-language booking.
- **Unattended 24/7 System Tray Daemon**: Executes scheduled 5-field cron tasks, repo health digests, and morning briefings even when the main app window is closed.
- **Free Deep Web Research**: Built-in tiered search cascade (SearXNG + DuckDuckGo fallback) delivering cited briefings with zero search API subscription fees.

### 8. 🛡️ Module 8: Security Guard-2 & Merkle Audit Membrane
- **Zero-I/O `netfloor` SSRF Firewall**: Kernel-level egress filtering in pure Rust memory that blocks private subnets (RFC 1918), loopback, and cloud metadata (`169.254.169.254`) before socket creation.
- **Lexical `pathfloor` Sandbox**: Resolves canonical file paths and strictly blocks traversal escapes (`..`) outside authorized workspace boundaries.
- **Guard-2 Authorization Tickets**: Generates cryptographic TTL-bounded tickets ($T_{\text{expire}} = 60\text{s}$) surfaced to users via visual Diff Cards before privileged side effects.
- **Tamper-Proof Merkle Audit Trail**: Every tool call, diff, and system action is logged into an append-only cryptographic hash tree for mathematical non-repudiation.

---

## Enterprise MNC Quality Standards: 50 Real-World Production Use Cases

EveryAIOS is validated against our canonical enterprise test specification: [`desktop_app/TEST-CASES.md`](TEST-CASES.md). Engineered according to **ISO/IEC/IEEE 29119** standards, this suite includes **50 exhaustive, multi-step production use cases** across 10 enterprise domains:

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                             50 REAL-WORLD PRODUCTION USE CASES MATRIX                           │
├────────────────────────────────────────┬─────────────────────────────────────────────────────────┤
│ Category 1: Financial Engineering      │ • M&A LBO model recalculation, ASC 830 FX translation,  │
│ (E2E-UC-01 – E2E-UC-05)                │   Monte Carlo VaR, OECD Pillar Two, ABCP cash flows     │
├────────────────────────────────────────┼─────────────────────────────────────────────────────────┤
│ Category 2: Legal & Document Surgery   │ • 80-page MSA surgical indemnity patching, FDA Part 11, │
│ (E2E-UC-06 – E2E-UC-10)                │   SEC S-4 prospectus audit, Board pitch deck restyle    │
├────────────────────────────────────────┼─────────────────────────────────────────────────────────┤
│ Category 3: Multi-Agent Swarms & Code  │ • 5-agent swarm microservices, automated bisect repair, │
│ (E2E-UC-11 – E2E-UC-15)                │   CJS-to-ESM migration, zero-downtime PostgreSQL DB    │
├────────────────────────────────────────┼─────────────────────────────────────────────────────────┤
│ Category 4: Autonomous Web Navigation  │ • Multi-SaaS billing extraction, Cloudflare Turnstile   │
│ (E2E-UC-16 – E2E-UC-20)                │   bypass, PACER docket mining, SPA shadow DOM extract   │
├────────────────────────────────────────┼─────────────────────────────────────────────────────────┤
│ Category 5: Desktop OS Control (CUA)   │ • Air-gapped SAP GUI invoice entry, QuickBooks recon,   │
│ (E2E-UC-21 – E2E-UC-25)                │   AutoCAD batch export, Epic EHR data sync, estop safety│
├────────────────────────────────────────┼─────────────────────────────────────────────────────────┤
│ Category 6: Deep Research & Synthesis  │ • Competitive intelligence dossier, PubMed meta-analysis│
│ (E2E-UC-26 – E2E-UC-30)                │   FOMC policy yield curve analysis, CVE security audit  │
├────────────────────────────────────────┼─────────────────────────────────────────────────────────┤
│ Category 7: Executive Assistance Daemon│ • 24/7 conversational calendar scheduling, 07:00 AM     │
│ (E2E-UC-31 – E2E-UC-35)                │   briefing daemon, weekly repo digest, 50GB dataset ETL │
├────────────────────────────────────────┼─────────────────────────────────────────────────────────┤
│ Category 8: Cognitive Memory & Taste   │ • Architectural taste profile enforcement, error        │
│ (E2E-UC-36 – E2E-UC-40)                │   AvoidanceStore self-healing, cross-project firewall   │
├────────────────────────────────────────┼─────────────────────────────────────────────────────────┤
│ Category 9: Security Membrane & Audit  │ • Zero-I/O netfloor AWS metadata block, pathfloor       │
│ (E2E-UC-41 – E2E-UC-45)                │   shield, Guard-2 ticket replay rejection, Merkle audit │
├────────────────────────────────────────┼─────────────────────────────────────────────────────────┤
│ Category 10: Disaster Recovery & SCIF  │ • 100% offline SCIF development, SIGKILL crash recovery,│
│ (E2E-UC-46 – E2E-UC-50)                │   429 key pool rotation, DoD 5220.22-M workspace shred  │
└────────────────────────────────────────┴─────────────────────────────────────────────────────────┘
```

📖 **Read the complete test specifications**: [`desktop_app/TEST-CASES.md`](TEST-CASES.md)

---

## 📦 Desktop App Installers — Coming Soon!

We are putting the final touches on our signed desktop application installers:

| Operating System | Format | Target Architecture | Status |
| :--- | :---: | :---: | :---: |
| **Windows 11 / 10** | `.msi` / `.exe` | x64 / ARM64 | 🟡 **Coming Soon (Primary Target)** |
| **macOS (Apple Silicon)** | `.dmg` | M1 / M2 / M3 / M4 (Universal) | 🟡 **Coming Soon** |
| **macOS (Intel)** | `.dmg` | x86_64 | 🟡 **Coming Soon** |
| **Linux (Ubuntu / Debian)** | `.deb` / `.AppImage` | x86_64 / aarch64 | 🟡 **Coming Soon** |

> 🔔 **Want early beta access?** Star the repository and watch releases to be notified the minute the initial installer bundles go live!

---

## 🛠️ Developer Quickstart (Run from Source Today)

You don't have to wait for the packaged installers. The entire repository is 100% open-source and builds cleanly from source right now:

### Prerequisites
- **Rust** (`rustc` & `cargo` 1.80+): `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
- **Node.js** (v20+) & **pnpm**: `npm install -g pnpm`
- **Tauri Prerequisites**: Follow the [official Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for your operating system (C++ build tools on Windows, Xcode command line tools on macOS, webkit2gtk on Linux).

### 1-Minute Setup & Launch

```bash
# 1. Clone the repository
git clone https://github.com/sarv-projects/EveryAIOS.git
cd EveryAIOS/desktop_app

# 2. Install workspace dependencies
pnpm install

# 3. Build the background coordinator sidecar
pnpm --filter @everyaios/coordinator build
mkdir -p src-tauri/bin && cp packages/coordinator/dist/coordinator src-tauri/bin/coordinator

# 4. Start the native desktop cockpit
cd src-tauri && cargo tauri dev
```

---

## Frequently Asked Questions (FAQ)

<details>
<summary><strong>Is EveryAIOS really free and open source?</strong></summary>
<br/>
Yes! EveryAIOS is 100% free and open-source under the MIT and Apache-2.0 licenses. There are no paywalls, no monthly subscription fees, and no artificial feature tiering. You only pay your AI model provider directly for the raw tokens you consume (fractions of a cent), or run local models like Ollama for 100% free offline compute.
</details>

<details>
<summary><strong>How does EveryAIOS differ from paying $20/mo for ChatGPT Plus or Claude Pro?</strong></summary>
<br/>
Single-vendor subscriptions trap you in a walled garden:
1. <strong>Single Model Lock-in:</strong> They restrict you to their own model family. In EveryAIOS, you can use Claude for writing and architecture, DeepSeek or Qwen for lightning-fast coding, GPT-6 for math, and local Ollama for air-gapped private files—all in the same session.
2. <strong>Hourly Rate Limits:</strong> When you hit a rate limit on ChatGPT or Claude Pro, you are locked out for hours. EveryAIOS supports multi-key pools with automatic 429 failover, so your work never stops.
3. <strong>Real Spreadsheet & Document Math:</strong> Web chatbots cannot run real Excel spreadsheets; they hallucinate calculations or re-serialize corrupt files. EveryAIOS has an embedded in-process IronCalc engine.
4. <strong>100% Local Privacy:</strong> Cloud web chats store your prompts and files on remote servers. EveryAIOS stores all data in an encrypted SQLCipher vault on your own drive.
</details>

<details>
<summary><strong>Can I run EveryAIOS completely offline without an internet connection?</strong></summary>
<br/>
Yes! Connect EveryAIOS to local runtimes such as <strong>Ollama</strong>, <strong>LM Studio</strong>, <strong>vLLM / llama.cpp</strong>, or Apple Silicon <strong>MLX</strong>. When using local models, all inference, cognitive memory indexing, and document processing happen entirely on your computer with zero network traffic.
</details>

<details>
<summary><strong>How does Multi-Agent Swarm Orchestration with Git Worktrees work?</strong></summary>
<br/>
EveryAIOS allows the Native Chief to spawn 20–30 subagents concurrently:
1. <strong>Worktree Isolation:</strong> Each subagent is provisioned in its own dedicated Git worktree (`.everyaios/worktrees/task-<id>`). Agents edit files, run builds, and execute tests simultaneously without dirtying your main working tree or causing file conflicts.
2. <strong>Serialized Git Operations:</strong> A mutex-protected `GitOperationQueue` serializes branch creation and commits, automatically clearing stale `.git/index.lock` files to prevent deadlocks.
3. <strong>Shared Blackboards:</strong> Agents communicate asynchronously through 3 structured files (`task_plan.md`, `findings.md`, and `receipts/`), maintaining clear contract boundaries.
</details>

<details>
<summary><strong>How does the AvoidanceStore prevent repetitive AI mistakes?</strong></summary>
<br/>
When an agent encounters a tool error or execution failure, the `AvoidanceStore` (`everyaios-memory`) analyzes the error signature and records the root-cause negative constraint. During subsequent turns, these constraints are injected into the prompt context below `CACHE_BOUNDARY`, preventing the agent from repeating the same failed approach.
</details>

<details>
<summary><strong>Where are my API keys stored?</strong></summary>
<br/>
Your API keys are stored locally on your device in an encrypted SQLCipher database using AES-256 encryption. They never leave your machine except in direct, encrypted HTTPS requests to official provider endpoints (e.g., `api.anthropic.com` or `api.openai.com`). Keys are never sent to any third-party relay, proxy, or telemetry service.
</details>

---

## Technical Specifications & Architecture Index

For engineers, researchers, and contributors exploring our internal architecture:

* [`DESKTOP-APP-SPEC.md`](DESKTOP-APP-SPEC.md) — The normative product contract, schemas, and security invariants.
* [`TEST-CASES.md`](TEST-CASES.md) — Canonical ISO/IEC/IEEE 29119 enterprise master test specification (8 dimensions, 50 real-world use cases).
* [`ARCH/00-INDEX.md`](ARCH/00-INDEX.md) — Complete architecture index and module map.
* [`ARCH/01-SYSTEM-ARCHITECTURE.md`](ARCH/01-SYSTEM-ARCHITECTURE.md) — Core system architecture (Rust core + Bun coordinator sidecar).
* [`ARCH/02-MODULE-LAYOUT.md`](ARCH/02-MODULE-LAYOUT.md) — Ownership matrix for all 22 Rust crates and 11 TypeScript packages.
* [`ARCH/09-FEATURE-MATRIX.md`](ARCH/09-FEATURE-MATRIX.md) — Complete 166-submodule implementation matrix across layers A through K.
* [`TODO.md`](TODO.md) — Master implementation census (1,429 items = 1,221 completed + 208 open).
* [`SPEC-CHANGELOG.md`](SPEC-CHANGELOG.md) — Historical architectural decisions, release logs, and verification evidence.

---

## License

EveryAIOS is free, open source, and dual-licensed under the **[MIT License](LICENSE-MIT)** and the **[Apache License, Version 2.0](LICENSE-APACHE)**.
