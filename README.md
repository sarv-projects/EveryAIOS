<p align="center">
  <img src="src-tauri/icons/128x128.png" width="80" alt="EveryAIOS" />
</p>

<h1 align="center">EveryAIOS</h1>

<p align="center"><strong>The Local-First AI Desktop Operating System — Chat, Cowork & Autonomous Coding in One Unified Cockpit.</strong></p>

<p align="center">
  An open-source, local-first AI coworker and agent operating substrate that lives on your computer — seamlessly orchestrating your files, spreadsheets, documents, browser, desktop apps, PTY terminals, code, and external coding agents.<br/>
  <strong>Your keys. Your hardware. Zero middleman servers. Nothing you do passes through us.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/build%20phase-active%20development%20%28P64%20wiring%29-yellow?style=flat-square" alt="Build Phase" />
  <img src="https://img.shields.io/badge/capabilities-166%20verified%20specs-blue?style=flat-square" alt="Capabilities" />
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-blue?style=flat-square" alt="Cross Platform" />
  <img src="https://img.shields.io/badge/privacy-100%25%20Local--First%20%2B%20BYOK-success?style=flat-square" alt="Privacy First" />
  <img src="https://img.shields.io/badge/protocols-MCP%20%2B%20ACP%20Native-6f42c1?style=flat-square" alt="MCP and ACP Native" />
  <img src="https://img.shields.io/badge/security-Dual--Guard%20%26%20Merkle%20Audited-orange?style=flat-square" alt="Guarded Execution" />
  <img src="https://img.shields.io/badge/license-MIT%2FApache--2.0-lightgrey?style=flat-square" alt="License" />
</p>

---

> ### 🚧 IN ACTIVE DEVELOPMENT / BUILD PHASE (v3.76)
> **EveryAIOS is currently under active construction and rapid build iteration.** The Rust core execution kernel, 12-segment cache-affine prompt engine, SQLCipher vault, and desktop cockpit run end-to-end. Phase **P64** (Native Agent Plane wiring & Cowork Façades) is actively landing.
>
> 📦 **Pre-packaged release installers (.dmg / .msi / .AppImage)** are currently in the packaging pipeline. Developers and early contributors can build directly from source today.
>
> 🔗 [Live Capability Matrix (166 rows)](ARCH/09-FEATURE-MATRIX.md) &nbsp;·&nbsp; [Frozen Native Architecture (ARCH/17)](ARCH/17-NATIVE-AGENT.md) &nbsp;·&nbsp; [Implementation TODO](TODO.md)

---

<p align="center">
  <img src="5a1c3357-0cd1-492f-ac9f-efd313391587.png" width="94%" alt="EveryAIOS Workspace" />
</p>

---

## Why EveryAIOS?

Today's AI software landscape is broken into disconnected silos:
- **Walled-Garden Chat Apps** (ChatGPT, Claude Desktop) lock you into expensive subscriptions with strict message caps, burning your quota on basic spreadsheet math or web lookups.
- **AI Coding IDEs & Terminals** (Cursor, Claude Code, Cline, Aider) are great at code editing but are completely blind to spreadsheets, PDFs, enterprise connectors, and general office tasks.
- **Global Model Providers** (DeepSeek, Qwen, SiliconFlow, Groq, local Ollama/MLX) offer incredible, ultra-cheap intelligence, but have **zero desktop software home**.

**EveryAIOS unifies Chat, Enterprise Cowork, and Autonomous Coding into a single desktop operating system.**

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                             EVERYAIOS DESKTOP COCKPIT                            │
├─────────────────────────┬────────────────────────────┬───────────────────────────┤
│        1. CHAT          │         2. CODING          │        3. COWORK          │
│  • 12-Segment Cache     │  • Native Coding Engine    │  • Native XLSX (IronCalc) │
│  • ACT-R Memory Graph   │  • Subordinated Claude /   │  • Native DOCX & Vector   │
│  • Any Model or Local   │    Cline / Aider / Codex   │    PDF Engine             │
│    Ollama / MLX GPU     │  • Shadow Git 1-Click Undo │  • 37 CDP Browser Tools   │
│  • 90%+ Cache Hits      │  • Netfloor SSRF Shield    │  • OS Computer Use (CUA)  │
│  • Task-Class Routing   │  • Single-Occurrence Exact │  • Durable Work Gateway   │
│                         │    Match & Fuzzy Fallbacks │  • Connectors (Slack/Mail)│
└─────────────────────────┴────────────────────────────┴───────────────────────────┘
```

---

## Core Pillars & Architectural Advantages

### 1. 🛡️ The Two-Plane Architecture (`ARCH/17`)
EveryAIOS doesn't fight existing coding tools; it acts as their **super-harness**:
* **Native Agent Plane:** Owned by the agent. Includes our native 12-segment cache-affine engine, cognitive ACT-R memory, blueprint DAG planner, and specialized subagents (`Scalpel`, `Scout`, `Architect`).
* **Shared Cowork Plane:** Owned by EveryAIOS. Exposes native Office tools, 37 CDP browser automation tools, OS computer use, and connectors via standard **MCP / ACP Façades**.
* **Universal Shadow Git Rollback:** Auto-commits isolated pre/post tool diffs, providing 1-click time-travel undo across native AND third-party agent modifications.

### 2. ⚡ Zero-Token Local Compute (Cost & Quota Shield)
In single-vendor cloud apps, crunching a 10,000-cell spreadsheet or parsing a 200-page PDF consumes your entire 5-hour rate limit. EveryAIOS executes non-reasoning tasks locally:
* **IronCalc (XLSX):** Evaluates and recalculates Excel formulas in native Rust memory — **0 LLM tokens burned**.
* **docx-rs & lopdf:** Surgically modifies Word XML and renders vector PDFs — **0 LLM tokens burned**.
* **Deterministic Fact Extraction:** Extracts declarative truths and user preferences via regex — **0 LLM tokens burned**.

### 3. 🌐 Universal BYOK Vault & 429 Auto-Failover
* **Universal Provider Freedom:** Plug in **DeepSeek (V3/R1)**, **Alibaba Qwen**, **SiliconFlow**, **Groq**, **OpenRouter**, **NVIDIA NIM**, **Mistral**, **OpenAI**, **Anthropic**, or 100% offline local models via **Ollama**, **MLX**, or **vLLM**.
* **Multi-Key Pool & Transparent 429 Failover:** Key rings are encrypted at rest with AES-256-GCM (SQLCipher). If an upstream provider returns an HTTP 429 rate limit, the vault rotates keys with exponential backoff **mid-stream without failing the turn**.

### 4. 🔒 Kernel-Enforced Security & SSRF Defense
* **`netfloor` Protection:** Zero-I/O destination classifier completely blocks prompt-injection SSRF attacks against AWS/GCP cloud metadata (`169.254.169.254`), loopback ports, and private RFC1918 subnets before any network socket is opened.
* **Dual-Guard & Algorithm #12 Gate:** Deterministically classifies action risks (`read`, `local-write`, `destructive`) and renders interactive **Guard-2 Diff Cards** before any destructive command or file write.
* **Tamper-Evident Merkle Audit Log:** Every action, tool call, and human approval is cryptographically chained in an append-only NDJSON ledger.

---

## Installation & Setup

### 📦 Pre-Packaged Installers
> **Status: Packaging in Progress**  
> Standalone installers (`.dmg` for macOS, `.msi` for Windows, `.AppImage` / `.deb` for Linux) are currently being finalized in the release pipeline for the V1 milestone.

### 🛠️ Build from Source (Developer Build)

```bash
# 1. Clone repository
git clone https://github.com/sarv-projects/EveryAIOS
cd EveryAIOS/desktop_app

# 2. Install workspace dependencies
pnpm install

# 3. Build the TypeScript coordinator sidecar
pnpm --filter @everyaios/coordinator build
mkdir -p src-tauri/bin && cp packages/coordinator/dist/coordinator src-tauri/bin/coordinator

# 4. Install UI dependencies and start Tauri development shell
cd ui && pnpm install && cd ..
cd src-tauri && cargo tauri dev
```

**Prerequisites:** Rust (stable `1.80+`), Node.js (`v20+`), pnpm / Bun, and standard [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/) for your operating system.

---

## What You Can Get Done

* 📊 **Enterprise Financial Modeling & Spreadsheets**  
  Drop in a complex `.xlsx` workbook. Formulas and cross-sheet dependencies are evaluated in Rust via IronCalc. Formatting, macros, and styles remain 100% preserved.
* 🛠️ **Autonomous Code Repair with Shadow Git Rollbacks**  
  Point it at a broken repository. It reads diagnostics via LSP, isolates the bug with the `Scalpel` facet, drafts single-occurrence exact diffs, runs tests, and lets you 1-click rollback if dissatisfied.
* 🔍 **Deep Citation-Backed Research**  
  Launches the `Scout` agentic facet to search across multiple web engines, stripping ads and junk, and synthesizes an evidence brief with exact clickable file/URL citations.
* 🌐 **Authenticated Browser & Desktop Automation**  
  Uses 37 Chrome DevTools Protocol (CDP) tools with accessibility (a11y) tree semantic grounding and multi-platform OS computer use (Windows WGC/UIA, Linux X11, macOS AX).
* 🤝 **Seamless Multi-Agent Handoff**  
  Start a task with a fast local model, and seamlessly transition the session to Claude Code, Aider, or Cline. Memory, workspace context, and security rules stay completely intact.

---

## Complete Capability Census (166 Capabilities)

EveryAIOS is engineered around **166 verified capabilities** across 10 functional domains:

<details>
<summary><strong>🧠 1. Models &amp; BYOK (A1–A11)</strong> — Universal Model Freedom</summary>
<br/>

- **Universal BYOK:** OpenAI, Anthropic, Gemini, DeepSeek, Qwen, SiliconFlow, Groq, Mistral, Cerebras, NVIDIA NIM, and any OpenAI-compatible endpoint.
- **SQLCipher Multi-Key Vault:** AES-256-GCM encryption with multi-key rings per provider.
- **Automatic 429 Failover:** Rotates rate-limited keys with exponential backoff without dropping the stream.
- **Local Runtimes:** Ollama, LM Studio, MLX (Apple Silicon), vLLM, and embedded GGUF via llama.cpp.
- **Live models.dev Catalog Sync:** 4-hour ETag-cached catalog synchronization with capability metadata.
- **12-Segment Cache-Affine Prompt Assembler:** Enforces a hard `CACHE_BOUNDARY` for 90%+ prompt cache hit rates.

</details>

<details>
<summary><strong>🤖 2. Orchestration &amp; Agent Plane (B1–B11)</strong> — Inbuilt Loop &amp; Two-Plane Resolution</summary>
<br/>

- **Two-Plane Capability Resolution (B10):** Native-first, cowork-augmentation second.
- **First-Class Control Tools (B11):** In-turn `ask`, `plan`, `todo`, and `subagent` tools.
- **Blueprint DAG Engine:** Deterministic multi-stage plans with Skip/Retry/Escalate/Takeover circuit breakers.
- **Specialist Facets:** Dedicated `Scalpel`, `Scout`, `Architect`, `Browser Operator`, and `Office Synthesizer` subagents.
- **Subagent Context Shielding:** Child subagents run in isolated context windows, preventing main loop bloat.
- **LoopGuard:** Detects and halts 3x cyclical tool call loops using IEEE-754 argument hashing.

</details>

<details>
<summary><strong>💾 3. Context &amp; Memory Plane (C1–C15)</strong> — Cognitive ACT-R &amp; Repo Mapping</summary>
<br/>

- **Cognitive ACT-R Activation:** Recency and frequency-weighted memory activation curves.
- **Deterministic Fact Extraction:** Extracts project truths and user preferences without spending LLM tokens.
- **Repo-Map Context Injection (C15):** Tree-Sitter AST extraction + Personalized PageRank dependency mapping (1,024-token budget fitting).
- **Dynamic Context Mentions (C14):** Inline `@Codebase` and `@Files` mention resolution.
- **SQLite FTS5 Hybrid Search:** Combines BM25 keyword matching with knowledge graph associations.
- **50KB Payload Cap (`refRegistry`):** Replaces oversized tool outputs with SHA-256 content-addressed handles.

</details>

<details>
<summary><strong>📑 4. Document &amp; Office Engine (D1–D14)</strong> — Local Rust File Engines</summary>
<br/>

- **IronCalc Excel Engine:** In-memory formula calculation and surgical XML patcher for `.xlsx`.
- **docx-rs Word Engine:** Paragraph injection, table extraction, and style-preserving modifications for `.docx`.
- **lopdf PDF Engine:** Direct vector-level text extraction, AcroForm filling, and page splitting/merging.
- **Universal Reader:** Clean extraction for unstructured and legacy file formats.

</details>

<details>
<summary><strong>🌐 5. Browser &amp; Computer Use (E1–E14)</strong> — 37 CDP Tools &amp; Native CUA</summary>
<br/>

- **37-Tool CDP Browser:** Accessibility (a11y) tree snapshots, coordinate clicking, form filling, network interception.
- **Zero-Auth Session Vault:** Reuse existing authenticated browser sessions safely.
- **Multi-Platform OS Computer Use:** Windows Graphics Capture (WGC) & UI Automation, Linux X11 / XTest, macOS Accessibility (AX).
- **Visual Grounding:** OCR and vision-language locators for apps without accessibility trees.

</details>

<details>
<summary><strong>🔌 6. Connectors &amp; Shared Façades (F1–F16)</strong> — MCP / ACP Interoperability</summary>
<br/>

- **Shared Cowork Façades (F16):** Exposes Office, Browser, and CodeIntel tools as clean task-shaped surfaces to external agents.
- **MCP Client & Server:** Bidirectional Model Context Protocol integration.
- **ACP Work Gateway:** Integrates Claude Code, Codex, Cline, Aider, and OpenCode over the Agent Client Protocol.
- **Email & Calendar Connectors:** Read-first Gmail, IMAP/SMTP, and CalDAV integrations under Guard-2 tickets.

</details>

<details>
<summary><strong>🔍 7. Search &amp; Research Cascade (G1–G8)</strong> — Multi-Source Intelligence</summary>
<br/>

- **G8 Search Cascade:** Tiered cascade across open SearXNG instances, local indexers, and public APIs.
- **Deep Research Pipeline:** Autonomous multi-turn exploration with content extraction and markdown citation graphs.
- **Local File & Content Indexer:** Instant full-text file search over the local workspace.

</details>

<details>
<summary><strong>🖥️ 8. Cockpit Shell &amp; UI (H1–H36)</strong> — Tauri 2 + React 19 Frontend</summary>
<br/>

- **Work Cockpit:** Unified layout with zero layout shift (CLS = 0) and physical spring animations.
- **Guard-2 Diff Cards:** Isolated approval dialogs showing colorized side-by-side unified diffs.
- **Integrated PTY Shell:** Multi-profile terminal host (PowerShell, CMD, WSL, Bash) with ConPTY/Unix PTY.
- **Autonomy Dial:** Sandbox / Ask / Balanced / Just-Do-It presets with immutable per-task freezes.

</details>

<details>
<summary><strong>👨‍💻 9. Developer Tools &amp; Code Engine (I1–I17)</strong> — Surgical Precision</summary>
<br/>

- **Unified Native Edit Ladder (I14):** Exact single-occurrence match $\to$ Structured search/replace $\to$ Fuzzy multi-hunk fallback.
- **Risk-Gated Shadow Preflight (I15):** Background virtual filesystem verification against LSP diagnostics before diff presentation.
- **Universal Checkpoint & Rollback (I16):** Automated shadow git commits per mutating action.
- **Validated Skill Distillation (I17):** Distills proven multi-step coding routines into tested, reusable `.everyaios/skills/`.

</details>

<details>
<summary><strong>🛡️ 10. Security, Guardrails &amp; Audit (J1–J24)</strong> — Zero-Trust Kernel</summary>
<br/>

- **Zero-I/O `netfloor` SSRF Shield:** Blocks loopback, cloud metadata (`169.254.169.254`), and private RFC1918 subnets.
- **`pathfloor` Lexical Containment:** Prevents directory traversal (`../`) and protects `.git/`, `.everyaios/`, `.ssh/`.
- **Single-Use Authorization Tickets:** The AI never self-executes; every action requires an authenticated Guard-2 ticket.
- **J6 Angle-Bracket Sanitization:** Neutralizes prompt-injection attempts in user document attachments (`<` $\to$ `‹`).
- **Provable Honesty (`assertAllLogged`):** Fails closed if any model-visible context is absent from the Merkle audit trace.

</details>

---

## Documentation & Architecture Reference

EveryAIOS maintains complete, synchronized architectural specifications:

* [`DESKTOP-APP-SPEC.md`](DESKTOP-APP-SPEC.md) — The normative product contract, schemas, and security invariants.
* [`ARCH/17-NATIVE-AGENT.md`](ARCH/17-NATIVE-AGENT.md) — The frozen Two-Plane Architecture, capability resolution policy, and tool schema catalog.
* [`ARCH/09-FEATURE-MATRIX.md`](ARCH/09-FEATURE-MATRIX.md) — The 166-capability live implementation matrix.
* [`TODO.md`](TODO.md) — Master implementation census and active phase queue (P64).
* [`SPEC-CHANGELOG.md`](SPEC-CHANGELOG.md) — Historical decisions, release logs, and verification evidence.

---

## License

EveryAIOS is open source and dual-licensed under the **[MIT License](LICENSE-MIT)** and the **[Apache License, Version 2.0](LICENSE-APACHE)**.
