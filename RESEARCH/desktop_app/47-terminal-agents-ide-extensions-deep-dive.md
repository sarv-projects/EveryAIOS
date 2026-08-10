# 47 — Terminal Agents & IDE Extensions Deep Dive

> **Date:** 2026-08-08
> **Repos:** Goose (52.6K), OpenHands (83.5K), Cline (65.9K), Continue (35.4K), Amp (proprietary)
> **Also verified:** Mentat (2.5K, archived), Roo Code (24.4K, archived), Twinny (3.6K, archived), Void (28.9K, archived)
> **Purpose:** Verify distinctness, extract steal/adapt/refer patterns for EveryAIOS
> **Cross-refs:** Doc 46 (Aider/Devin), doc 05 (coding agents), doc 16 (tier-1 features)

---

## 1. New Repos Added (#161-165)

### 1.1 block/goose — 52.6K⭐, Apache-2.0, Rust

**What it is:** Block's (formerly Square) MCP-powered local agent. Single Rust binary with desktop app, CLI, and embeddable API. Part of Linux Foundation's Agentic AI Foundation (AAIF).

**Architecture:**
- Rust core binary → multiple frontends (CLI, desktop app, API)
- MCP as THE extensibility backbone (70+ extensions)
- 15+ LLM providers via direct API keys or ACP subscription linking
- "Custom Distributions" — white-label/rebrand with specific providers/extensions/settings

**Key steals:**
1. **MCP-first extensibility** — build entire plugin system on MCP from day one
2. **Custom Distros** — allow branded EveryAIOS configurations for orgs/teams
3. **ACP subscription linking** — users bring existing Claude/ChatGPT subs (no separate API keys)
4. **Rust core + multiple frontends** — single performant core powers CLI/desktop/API simultaneously

**Classification: STEAL**

---

### 1.2 OpenHands/OpenHands — 83.5K⭐, MIT, TypeScript/Python

**What it is:** Autonomous "Devin-like" agent evolved into "Agent Canvas" — Electron desktop app as self-hosted developer control center. Connects to multiple agent backends.

**Architecture:**
- Electron desktop app (Vite + electron-builder)
- REST API agent server (local/Docker/VM/cloud)
- Agent-Client Protocol (ACP) for agent interoperability
- Automation Server for scheduled/webhook-triggered runs

**Key steals:**
1. **Multi-backend agent switching** — run OpenHands, Claude Code, Codex through single UI
2. **ACP protocol adoption** — standardized agent communication
3. **Automation Server** — webhook/schedule triggers integrating Slack/GitHub
4. **Electron + REST API separation** — clean UI/execution split

**Classification: STEAL**

---

### 1.3 cline/cline — 65.9K⭐, Apache-2.0, TypeScript

**What it is:** Most popular open-source VS Code agent. Plan/Act dual-mode loop, MCP tools, SDK for building custom agents, CLI mode.

**Architecture:**
- Extension Layer → Controller → Task (Plan/Act loop) → Tool Executor → API Provider
- React webview via gRPC-over-postMessage
- 18+ built-in tools + MCP servers
- Kanban board for parallel agents with git worktrees

**Key steals:**
1. **Plan/Act dual-mode loop** — separating planning from execution improves reliability
2. **Checkpoint/rollback** — safety net for agentic changes (validates our MCQ interrupt)
3. **Kanban + git worktrees** — parallel agents with isolated branches
4. **SDK (@cline/sdk)** — building custom multi-agent teams
5. **CLI headless mode** — CI/CD integration with zero interaction

**Classification: STEAL**

---

### 1.4 continuedev/continue — 35.4K⭐, Apache-2.0, TypeScript

**What it is:** Open-source autocomplete + chat for VS Code/JetBrains. Core compiled to binary, thin IDE adapters. ⚠️ Read-only (final 2.0.0 release).

**Architecture:**
- Three layers: GUI (React) → Core (TypeScript binary) → IDE Extensions (thin adapters)
- Typed message protocol (ToCoreProtocol/FromCoreProtocol)
- Context Providers (@Codebase, @Docs, @URL) — pluggable context injection
- LanceDB + tree-sitter for workspace indexing

**Key steals:**
1. **Core-as-binary with typed protocol** — cleanest cross-frontend reuse pattern
2. **Context Provider plugin system** — extensible context injection without modifying core
3. **`.prompt` files as slash commands** — user-created prompts become actions
4. **Tab autocomplete retrieval pipeline** (indexing → embedding → reranking → snippet)

**Classification: STEAL** (architecture patterns, even though read-only)

---

### 1.5 Amp (ampcode.com) — Proprietary, by Sourcegraph

**What it is:** Commercial terminal agent with web UI, IDE integrations, and cloud execution. Multi-model routing, lifecycle hooks, remote "Orbs" for background work.

**Architecture:**
- CLI + web UI + IDE integrations sharing thread model
- 4 routing modes (low/medium/high/ultra) → different frontier models
- "Orbs" — remote cloud machines for agent threads
- Plugin system with lifecycle event hooks
- "Runners" — persistent scheduled agent instances

**Key adapts (proprietary, can't steal directly):**
1. **Multi-mode routing (low/med/high/ultra)** — validates our asymmetric tiering
2. **Oracle pattern** — secondary reviewer model for complex decisions
3. **Lifecycle hooks** (tool.call, tool.result, agent.start, agent.end) — validates our hook system
4. **Schedules** — agents wake themselves on cron (validates our B7)
5. **Librarian pattern** — deep code search subagent

**Classification: ADAPT** (proprietary, but patterns are adaptable)

---

## 2. Archived Repos (REFERENCE only)

| Repo | Stars | Why Archived | Lesson |
|------|-------|-------------|--------|
| AbanteAI/mentat | 2.5K | Team pivoted to bot service | CLI-only tools struggle to retain users. Desktop app is right call. |
| RooCodeInc/Roo-Code | 24.4K | Shut down May 2026 | Mode system (Code/Architect/Ask/Debug) was excellent. Community forked as ZooCode. |
| twinnydotdev/twinny | 3.6K | Archived Nov 2025 | Local-first Ollama default was ahead of its time. P2P inference sharing (Symmetry) was novel. |
| voideditor/void | 28.9K | Archived Jun 2026 | VS Code fork is hard to maintain. Extension approach (Cline) wins over fork approach. |

**Key lesson from archives:** Extensions (Cline at 65.9K, still active) beat forks (Void at 28.9K, dead). Desktop apps (Jan, Goose) beat CLI-only (Mentat). Our approach (Tauri desktop app + extension ABI) is validated.

---

## 3. Distinctness Verification

| Tool | Overlaps with | Distinct contribution |
|------|--------------|----------------------|
| Goose | OpenClaw (gateway), OpenFang (Rust) | Custom Distros, ACP subs, Linux Foundation governance |
| OpenHands | Devin (cloud agent) | Open-source, multi-backend, self-hosted |
| Cline | Aider (code editing) | Plan/Act loop, VS Code native, Kanban worktrees |
| Continue | OpenCode (LSP) | Core-as-binary pattern, Context Providers, cross-IDE |
| Amp | Devin (cloud), ECC (hooks) | Oracle pattern, Librarian, commercial-grade UX |

**No duplicates. Each contributes something the others don't.**

---

## 4. Updated Totals

- **Total repos tracked:** 165 (was 160)
- **STEAL:** 51 (was 47, +4: Goose, OpenHands, Cline, Continue)
- **ADAPT:** 24 (was 23, +1: Amp)
- **REFERENCE:** ~90 (unchanged, archived repos stay here)

---

## 5. What Changes in EveryAIOS Design

| New Pattern | Source | Maps to EveryAIOS |
|-------------|--------|-------------------|
| Custom Distros (white-label configs) | Goose | New: configurable branded distributions |
| ACP subscription linking | Goose, OpenHands | Refines A1-A3: users bring existing subs |
| Multi-backend agent switching | OpenHands | Refines B3: orchestrate external agents |
| Plan/Act dual-mode in agent loop | Cline | Refines B1: explicit plan phase before execution |
| Core-as-binary with typed protocol | Continue | Validates our Rust core + TS sidecar IPC |
| Context Provider plugins | Continue | New: @Codebase, @Docs, @URL injection points |
| Kanban + git worktrees for parallel agents | Cline | Refines B3: isolated branches per sub-agent |
| Oracle/reviewer model pattern | Amp | Refines I4: separate review model for quality |
| Lifecycle hooks (tool.call/result, agent.start/end) | Amp, Cline | Validates J18 (profile-gated hooks from ECC) |
