# 09 — Agentic OS & Computer-Use Layer

> Verified 2026-08-05 (GitHub API). **This is the "LLM as the CPU / no upper limit" pillar's infrastructure.**

## The landscape (verified)

| Repo | Stars | Lang | What it is | Usable as desktop backend? |
|---|---|---|---|---|
| affaan-m/ECC | **238K** ⭐ | JS/MD | "Agent harness performance optimization system" — the biggest agent-harness repo on GitHub. Planning-before-building, verification gates, **AgentShield** (session/security scanning), repo-history → reusable defaults, modular command defs | Yes (pattern layer, not runtime) |
| browser-use | 108K | Python | DOM-snapshot browser control (doc 06) | Via sidecar |
| OpenFang (RightNow-AI) | **18.1K** | **Rust** | True agent OS: 14-crate workspace → single ~32MB binary, <200ms cold start, ~40MB idle. 53+ native tools, 40 channel adapters, 27 LLM providers, OpenAPI REST/WS/SSE. **WASM dual-metered sandbox** (fuel metering + epoch interruption + watchdog) | **Yes** — the reference for our Rust ambitions |
| Agent S (simular-ai) | **12.1K** | Python | Agent-Computer Interface (ACI): grounds GUI automation w/ UI-TARS vision models, SOTA on OSWorld (~72% human-parity) | Library (GUI-driving), heavy |
| agiresearch/AIOS | **6.2K** | Python | LLM-as-OS kernel: scheduler for LLM calls, context/memory abstraction, tool manager, VM controller + MCP server (LiteCUA) | Research API, not product |
| Open Interpreter | ~56K | Python | Terminal agent that runs code locally; `--os` mode adds screen+click via computer-use APIs | CLI, needs sandboxing |
| OpenWork (different-ai) | new | TS/Electron | Open-source Claude-Cowork alternative; shared **MCP control plane** (search_capabilities / execute_capability) so external agents reuse org tools | Desktop app concept to watch |
| **Agent Zero (agent0ai/agent-zero)** | **~34K** | Python/Docker | The *real* Agent Zero: Dockerized Linux desktop, DOM-annotated interactive browser, live doc collaboration, **skills/plugins as markdown (SKILL.md)**, multi-agent delegation, host bridge (`a0` CLI) | Yes — markdown-skill model |
| ⚠️ msitarzewski/AGENT-ZERO | 261 | — | A *different, tiny* "operational framework" repo — **not** the famous Agent Zero. The pastes kept linking this one. | No |
| HuggingFace/smolagents | ~20K | Python | **Code-as-action**: agent writes executable Python instead of JSON tool calls | Library — the weak-model trick |

## The three big steals

### 1. OpenFang's WASM sandbox (the safe "no upper limit")
Tools/custom extensions run as WASM with **dual metering** (fuel = compute budget + epoch interruption) and a watchdog that kills runaway bytecode. That's how you let the agent write and run *anything* without risking the host — better isolation than process-sandboxing alone, and it's Rust-native so it fits our long-term core. Near-term: Docker/locked-WSL sandbox (doc 03) does the same job.

### 2. Agent Zero's markdown skill system
`SKILL.md` files = capability + usage instructions parsed at runtime; agents load/create skills on the fly; multi-agent delegation with specialized roles. This **is** spec P2/P6 verbatim (and matches our Forge). Their structure: skills dir + prompts dir + tools dir, all markdown-first.

### 3. ECC's engineering guardrails (the quality ceiling)
Planning-before-building, forced verification steps, session scanning (AgentShield), and history→defaults. This is the "highest accuracy, grows with you" pillar at the harness level: before the agent edits code it must state the plan; after edits it must verify (build/test). Fold into the agent-loop contract (spec §2 "pi-style loop" + Forge TDD).

## Positioning note

- **Rust-native reality check:** only OpenFang is a genuine Rust agent OS. Everything else is Python/TS. Our "Tauri + Node sidecar now, Rust core later" remains the pragmatic path; OpenFang is the proof of concept that a Rust core is viable when we get there.
- **Computer-use (Agent S/Open Interpreter)** is a *future* pillar (GUI automation), gated behind the dual-guard. Not in v1 scope — v1 uses DOM-snapshot browsing (doc 06) which is far more reliable than pixel/vision clicking.
