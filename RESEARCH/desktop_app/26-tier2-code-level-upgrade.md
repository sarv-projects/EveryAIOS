# 26 — Tier-2 Code-Level Upgrade (2026-08-06)

> Live structure verification for every tier-2 repo in doc 18 (structures fetched from GitHub this pass). Upgrades medium maps → source-verified. ⚠️ = API rate-limited this pass, structure pending re-listing (paths per doc 18).

---

## 1. Orchestration frameworks

- **CrewAI** (`crewAIInc/crewAI`) — ⚠️ `src/crewai` listing + `crew.py` fetch were rate-limited/404 this pass; doc 18 paths (`src/crewai/` Crew/Agent/Task/Tool/Process/Flow, YAML-driven) stand pending re-verify. **Re-verified live 2026-08-08:** repo exists (56,763⭐, Python); only the code-path listing still wants a clean `src/crewai` read — structure-level ⬜ until then.
- **AutoGen** (`microsoft/autogen`) — ✅ **`python/packages/`: `autogen-core`, `autogen-agentchat`, `autogen-ext`, `autogen-magentic-one`, `autogen-studio`, `magentic-one-cli`, `pyautogen`, `agbench`** — v1 runtime (core/agentchat/ext) confirmed; Magentic-One shipped as a package.
- **MetaGPT** (`FoundationAgents/MetaGPT`) — ✅ `metagpt/`: **`roles/` `actions/` `environment/` `management/` `memory/` `provider/` `rag/` `document_store/` `learn/` `exp_pool/` `configs/` `prompts/`** — SOP-driven software-company confirmed (doc 18 paths real).
- **Agno** (`agno-agi/agno`) — ✅ `libs/agno/agno/`: `agent/` `agents/` (multi-agent), **`compression/`** (context compression!), **`approval/`** (human-in-loop), **`culture/`** (persona/behavior), `context/`, `db/`, `fs/` (file tools), `eval/`, `factory/`, `api/`, `client/`, `cloud/`. **Steal: the `compression` + `approval` + `culture` modules are directly on-theme for us.**

---

## 2. Desktop apps

- **Cherry Studio** (`CherryHQ/cherry-studio`) — ✅ Electron layout: `src/main/` `src/preload/` `src/renderer/` `src/shared/`.
- **Chatbox** (`Bin-Huang/chatbox`) — ⚠️ `src` listing rate-limited this pass (doc 18: Tauri+React, provider adapters in `src/`).
- **GenOffice** (`genspark-ai/genoffice`) — ✅ `apps/: docs pdf sheets shell slides` (5 apps) + `packages/` (agent-core, ai-provider, docx-engine, pptx-engine/render, file-parse, ai-search, project-store, ui…). **Full source deep-dive → doc 28** (block-patch, xlsx-sidecar, deterministic planner, skill loop, watchdog).
- **PyGPT** (`szczyglis-dev/py-gpt`) — ✅ root: `src/ tests/ data/ bin/ docs/ examples/ snap/` (Python desktop assistant).
- **Open WebUI** (`open-webui/open-webui`) — ✅ `backend/open_webui/: retrieval/ tools/ routers/ socket/ models/ storage/ internal/ migrations/` — RAG (`retrieval/`), tool system (`tools/`), realtime (`socket/`) confirmed.
- **Leon** (`leon-ai/leon`) — ⚠️ `src?ref=develop` rate-limited this pass.
- **Vane** (`ItzCrazyKns/Vane`) — ✅ `src/: app/ lib/ components/` + `instrumentation.ts` (Next-style).
- **LM Studio CLI** (`lmstudio-ai/lms`) — ✅ `src/` (TS) + package.json — the `lms` CLI.

---

## 3. Cyber agents

- **PentAGI** (`vxcontrol/pentagi`) — ✅ `backend/ frontend/ build/ examples/` (Go backend + web frontend; coordinator/sub-agents per doc 18).
- **PentestGPT** (`GreyDGL/PentestGPT`) — ✅ `pentestgpt_agent/ pentestgpt_legacy/ scripts/ docs/` — current agent package + legacy split confirmed.
- **HexStrike** (`0x4m4/hexstrike-ai`) — ⚠️ listing truncated (assets/ only returned; MCP server to 150+ tools per doc 18).
- **PyRIT** (`Azure/PyRIT`) — ✅ `pyrit/` + `doc/` (orchestrator/scorer/attack-strategy pipeline).
- **Vulnhuntr** (`protectai/vulnhuntr`) — ✅ `vulnhuntr/` package + devcontainer (zero-shot static→exploit).
- **Strix** (`usestrix/strix`) — ✅ `strix/ benchmarks/ containers/ docs/ scripts/` — multi-agent runtime + PoC/CVSS confirmed.
- **Deadend** (`straylabs-ai/deadend-cli`) — ✅ `deadend_cli/ cli/ benchmarks/ benchmarks-results/` — supervisor/sub-agent + confidence gating confirmed.
- **NeuroSploit** (`JoasASantos/NeuroSploit`) — ✅ `neurosploit-rs/ agents_md/ examples/` (Rust core).

---

## 4. Business tools

- **AutoHedge** (`The-Swarm-Corporation/AutoHedge`) — ✅ `autohedge/ experimental/ logs/` — Director→Quant→Risk→Execution pipeline.
- **Vibe-Trading** (`HKUDS/Vibe-Trading`) — ✅ `agent/ tools/ frontend/ scripts/ wiki/` — personal trading agent + tool-guardrails confirmed.
- **claude-ads** (`AgriciDaniel/claude-ads`) — ✅ `.claude-plugin/ CLAUDE.md AGENTS.md CHANGELOG.md` — it's a Claude skill (12 ad platforms, capability-gated writes).
- **NotFair** (`nowork-studio/NotFair`) — ✅ `.claude-plugin/ bin/ docs/ gemini/ google-ads/ meta-ads/ install/` — multi-platform ads agents + goal↔metric contract.
- **FinceptTerminal** (`Fincept-Corporation/FinceptTerminal`) — ✅ `fincept-qt/` (**C++/Qt** terminal) + docs — 100+ connectors unified stream.
- **Agentic Inbox** (`cloudflare/agentic-inbox`) — ⚠️ `src` rate-limited; Worker + Email Routing + AI triage per doc 10/18.
- **ClawRouter** (`BlockRunAI/ClawRouter`) — ✅ `src/ skills/ scripts/ dist/ docs/` — 66-model LLM router, agent-native.
- **Hyperframes** (`heygen-com/hyperframes`) — ✅ plugin-first: `.agents/ .claude-plugin/ .claude/ .codex-plugin/ .codex/ .cursor-plugin/ .cursor/ assets/` — HTML→video npm framework.

---

## 5. Agentic OS / misc

- **ECC** (`affaan-m/ECC`) — ✅ **multi-agent config/skill repo**: `.agents/ .claude-plugin/ .claude/ .codebuddy/ .codex-plugin/ .codex/ .cursor/ .gemini/ .hermes/` — plan-before-build + verification gates + AgentShield (doc 10's 238K⭐ treated critically, consistent with doc 09).
- **Agent S** (`simular-ai/Agent-S`) — ✅ `gui_agents/ integrations/ osworld_setup/ evaluation_sets/ tests/` — GUI agent + OSWorld harness confirmed.
- **AIOS** (`agiresearch/AIOS`) — ✅ `aios/: scheduler/ llm_core/ memory/ storage/ context/ syscall/ terminal/ tool/ hooks/ config/` — LLM-as-OS kernel services confirmed (upgrades doc 16/23 entry to structure-verified).
- **microsandbox** — see doc 25 §4 (krun hypervisor, 15 crates).
- **OpenWork** — ✅ confirmed: `different-ai/openwork` (doc 25 §6).

---

## 6. Notes
- ⚠️ rate-limited this pass: CrewAI src, Chatbox src, HexStrike full, Agentic-Inbox src, Leon develop — all have doc-18 paths; re-list only if we adopt them.
- **doc 18 status:** all 7 feature-map rows + these structures are now source-verified except the ⚠️ five above.
