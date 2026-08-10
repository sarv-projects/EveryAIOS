# Ultra-Agentic Evolvable Orchestration — Research Blueprint

> Research: how "no upper limit" agent systems actually work in 2026 — self-evolution, spec-driven orchestration, per-agent model assignment, continuous autonomous loops, weak-tool-model resilience, cyber use-cases.
> Sources: hermes-agent, agent-zero, OpenClaw (openclaw/openclaw, ~385K⭐, TypeScript), smolagents, Agno, CrewAI, AutoGen, MetaGPT, DeerFlow, Strix/PentAGI/PentestGPT (verified via GitHub API).

---

## 1. The "No Upper Limit" Architecture — what it really means

An **evolvable agent** executes a closed-loop evolutionary cycle:

1. **Generate** — when it hits an unhandled task, it *writes a new capability*: a `SKILL.md`, a tool, a Python script, a plugin (not just text output).
2. **Verify** — runs the new capability in a sandbox (Docker/Modal/local), tests it, gets execution feedback (stderr/stdout fed back into context).
3. **Persist** — commits the verified capability to a skills registry (`~/.hermes/skills/`, workspace `skills/`, a git repo) so it survives restarts and context resets.
4. **Co-evolve** — generator + verifier sub-agents stress-test and refine it.

**There is no hard upper limit in the code — the limit is just: does it have a sandbox, a tool to write files, and a registry to persist to?** Everything else is scaffolding around that loop.

---

## 2. Self-Evolving Agents — verified mechanisms

### Hermes Agent (nousresearch/hermes-agent)
- `tools/skill_manager_tool.py` — the **self-modification engine**: agent creates/edits/patches/deletes its own skills via `skill_manage` (actions: `create`, `edit`, `patch`, `delete`, `write_file`, `remove_file`).
- `agent/learning_graph.py` + `learn_prompt.py` — parses skill frontmatter into a procedural memory graph; builds learn prompts on `/learn` or periodic nudges.
- **Self-improvement loop**: if a workflow fails, background review policies patch the skill's instructions → better next run.
- User modeling via Honcho (preferences tracked across sessions).

### Agent Zero (agent0ai/agent-zero, 18.7K⭐, Python)
- Full Dockerized Linux environment + host bridge.
- **Runtime plugin generation**: agent writes Python scripts, creates tools in `tools/`, pulls from a 100+ plugin hub.
- **"Time Travel" snapshots**: workspace state snapshots (`/a0/usr`) → agent can test modifications, diff, roll back. Critical for safe self-modification.

### Voyager-style skill libraries (academic → production)
- Successful code snippets verified + named + stored in a persistent skill library, retrieved via vector/keyword search.
- 2026 evolution: **SAGE** (RL for skill acquisition), **SEAL/AutoSkill** (experience-driven lifelong learning), Braintrust/AWorld eval harnesses (agent generates + critiques its own tool definitions before promoting to production).

---

## 3. Spec-Driven Orchestration — md files that CONTROL agents

### OpenClaw (openclaw/openclaw, 385K⭐, TypeScript) — the closest existing match to your vision

**Workspace file map** (the agent's "home", loaded every session):

| File | Role |
|---|---|
| `AGENTS.md` | Operating instructions, rules, priorities, routing. Loaded every session. |
| `SOUL.md` | Persona, tone, boundaries (the "voice"). Loaded every session. |
| `USER.md` | Directive-based user model — stable prefs, communication style (separate 4K-char budget). |
| `IDENTITY.md` | Name, vibe, emoji. |
| `BOOT.md` | Optional startup checklist on gateway restart. |
| `BOOTSTRAP.md` | One-time first-run ritual. |
| `memory/YYYY-MM-DD.md` | Daily memory log (today + yesterday read at session start). |

**Per-agent definition** (`~/.openclaw/openclaw.json`, `agents.entries.*`): each agent entry can have its **own workspace, model, sandbox, tools, MCP servers**. Non-default agents get `<state-dir>/workspace-<agentId>` — **isolated workspace per agent**.

**System prompt is assembled per-run** (`buildAgentSystemPrompt`): Tooling, Execution Bias, Promised Work, Safety, Skills, Workspace, Sandbox, Temporal Context, Runtime, Reasoning. Provider plugins can inject stable-prefix (above cache boundary) / dynamic-suffix sections — model-family-specific tuning.

**The key mechanism:** these are *plain markdown files the agent reads AND WRITES*. Personality is editable by the agent itself (see the "Molty prompt" — the agent rewrites its own SOUL.md). Your "create spec-driven md files to control agents in natural language" = this, exactly.

### CLAUDE.md / AGENTS.md standard
- Formalized as an open standard (agents.md, Linux Foundation's Agentic AI Foundation).
- Injected into system-prompt hierarchy; nested hierarchy (nearest file wins); monorepo support.

### Agent Zero skills
- `SKILL.md` with YAML frontmatter (name, description) + natural-language instructions + optional scripts; spliced into the system prompt's "Extras" tier JiT.

---

## 4. Multi-Agent Orchestration with Per-Agent Models

| Framework | Config method | Per-agent model |
|---|---|---|
| **Agno (Phidata)** | Python code | `Agent(name="Researcher", model=OpenAIChat(id="gpt-4o"))` — explicit per-agent |
| **CrewAI** | YAML + code | `agents.yaml` (role/goal/backstory) + `LLM(model="anthropic/claude-3-5-sonnet")` injected per agent |
| **MetaGPT** | YAML | Global `config2.yaml` + per-agent overrides |
| **AutoGen** | JSON dicts | `config_list` per agent (mix local Ollama + Azure) |
| **OpenClaw** | JSON + md | Per-agent entries: model, workspace, tools, sandbox |

**The 2026 pattern for your app:** agent definition = **spec file** (md/yaml: name, role, model, tools, workspace, sandbox, goals) → loaded into the orchestrator → instantiated with that model+toolset. **Route by capability**: cheap/fast model for parsing/formatting, frontier model for strategy/planning. (Your existing `modelRouter` work + `affinity-tracker` already heads here.)

---

## 5. Continuous Autonomous Loops (plans + targets + nonstop LLM calls)

- **ReAct loop** (Reason → Act → Observe) run by an orchestrator/supervisor; **state decoupled from LLM context** — every tool output, thought, and file change goes to persistent storage (SQLite/Postgres) + sandboxed FS.
- **Budgets**: token/cost caps, `max_iterations`, subagent caps — halt gracefully, never infinite-loop.
- **Checkpoints**: state checkpointed incrementally; **HITL pauses** at critical nodes (code commit, DB mutation, high-cost call).
- **DeerFlow SuperAgent** (79K⭐): middleware chains (TodoList, sandbox lifecycle, context summarization, memory extraction) around the loop; SSE event streaming to UI.

**For your "cybersecurity researcher can run algo/targets on its own" scenario:** set target → agent plans (updates `PLAN.md`/`TODO.md`) → loops: search → analyze → write code → run in sandbox → verify → report. The loop is identical to any other long-horizon task; only the toolset differs.

---

## 6. Making Weak Tool-Calling LLMs Work (the "irrespective of LLM quality" requirement)

- **Code-as-Action (smolagents/HF)**: instruct the LLM to write *executable Python* instead of JSON tool-calls. LLMs are far better at code than strict JSON schemas (~30% fewer steps). Runs sandboxed.
- **Execution feedback**: stderr/stdout fed straight back into context → self-correcting loop (read error → fix code → retry).
- **Verifier loops**: secondary agent or deterministic test suite checks tool output before the main loop proceeds.
- **Confidence filters** (Deadend CLI): supervisor/sub-agent design with confidence gating.
- **Prompt sandwich / structured-output wrappers**: force schema compliance at the API layer, not by hoping the model complies.

**This is the answer to "irrespective of whether the LLM is actually good in tool use":** don't rely on native function-calling — use code-as-action + execution feedback + verifier. Works with any model that can write code.

---

## 7. Autonomous Cyber-Security Agents (verified, with stars)

| Tool | Stars | Mechanism |
|---|---|---|
| **Strix** | 19K+ | Multi-agent dynamic runtime analysis; validates flaws by generating functional PoC exploits + CVSS scoring |
| **PentAGI** | ~15.5K | Coordinator + 4 sub-agents (Searcher, Coder, Installer, Pentester); isolated Docker; pgvector semantic memory |
| **PentestGPT** | 11K+ | 3-module reasoning (Reasoning/Generation/Parsing); hierarchical task tree to avoid context collapse (USENIX 2024) |
| **CAI (Cybersecurity AI)** | ~6.7K | ✅ `aliasrobotics/CAI` — modular offensive/defensive cybersecurity framework; **300+ models via LiteLLM** (incl. local Ollama); multi-agent assemblies; PyPI `cai-framework` (doc 25 §6) |
| **HexStrike AI** | 5.9K+ | MCP server bridging LLM clients to 150+ offensive tools (Nmap, sqlmap, Nuclei) |
| **Nebula** | ~1K | ✅ `berylliumsec/nebula` — AI pentest **desktop workbench** (nebula-core): terminal/editor/browser/AI-assistant/file-manager; scope enforcement, approval pauses, OCI-isolated execution, evidence trail (doc 25 §6) |
| **NeuroSploit** | 1.3K | ✅ `JoasASantos/NeuroSploit` (Rust) — role-based red/blue pentest framework (doc 18 §3) |
| **Deadend** | 288 | ✅ `straylabs-ai/deadend-cli` (Python) — agentic pentest CLI, 81% KIMI K2.5 (doc 18 §3) |

**Key architectural facts for your use-case:**
- All of these run **multi-agent with per-agent models** (a cheap model for the searcher, a strong one for exploit synthesis).
- All sandbox execution (Docker) — mandatory for autonomous offensive ops.
- Memory matters: semantic long-term memory (pgvector) is how they avoid context collapse over long engagements.
- **The agent can evolve**: tools/skills written mid-engagement persist for the next one.

---

## 8. The Unified Blueprint for Your Desktop App

```
desktop_app/agents/                          ← spec-driven, user-editable
├── ORCHESTRATION.md                          ← natural-language orchestration plan
├── agents/
│   ├── researcher/  (AGENT.md: model=gpt-x, tools=[web,deep-research], workspace=...)
│   ├── coder/       (AGENT.md: model=claude-x, tools=[filesystem,sandbox], workspace=...)
│   └── cyber/       (AGENT.md: model=deepseek, tools=[sandbox,nuclei,nmap], sandbox=docker)
├── SOUL.md / USER.md / IDENTITY.md           ← persona per OpenClaw pattern
├── NOW.md / PLAN.md / TODO.md               ← live goals (agent writes these itself)
└── skills/<name>/SKILL.md + scripts/        ← agent-written capabilities (persist)

Core runtime (Node sidecar):
├── AgentRegistry        ← reads AGENT.md specs → instantiates agents w/ assigned models
├── Orchestrator         ← reads ORCHESTRATION.md → spawns/coordinates agents
├── SkillManagerTool     ← agent self-evolution (create/edit/patch skills) [Hermes pattern]
├── CodeAsActionExecutor ← sandboxed python execution for weak-tool models [smolagents]
├── VerifierLoop         ← execution-feedback + confidence filters
├── SandboxBackends      ← local/docker/ssh/modal [Hermes environments pattern]
├── ModelRouter          ← per-agent model assignment + cost routing [existing APP work]
├── PlanTracker          ← PLAN.md/TODO.md updates + checkpoints
├── ProcessSupervisor    ← restart/backoff/dead-target registry [prev research doc]
└── SessionState         ← checkpoint/resume for long-horizon runs
```

**The non-negotiables:**
1. **Spec files drive everything** — agents, models, tools, goals, orchestration are all user-editable md/yaml. The system reads them at runtime.
2. **Self-evolution is a loop, not a feature** — write → verify in sandbox → persist. Without the verify step it's chaos; without persist it doesn't grow.
3. **No upper limit = no hardcoded toolset** — agents can add tools/skills at runtime within their sandbox + permission scope.
4. **Sandbox + permissions are the ceiling** — the *only* real limit, and it's user-controlled (path grants, sandbox choice), not code-controlled.
5. **Weak models still work** — code-as-action + execution feedback + verifier, never raw JSON tool-calling.

---

## 9. What you already have (from APP codebase)

| Needed | Existing in APP | Gap |
|---|---|---|
| Model routing | `core-ai/modelRouter`, `affinity-tracker` | Extend to per-agent assignment |
| Circuit breaker/backoff | `core-automations/workflow-object/engine.ts`, `core-search/searxng-pool.ts` | Process-level (restart guard) |
| Connector status states | `core-connectors/connection-manager.ts` | Add `reconnecting`, supervisor |
| Agents | 9 agents + WorkflowEngine | Add spec-driven instantiation + self-evolution |
| Subagents | WorkflowEngine node types | Add `DELEGATE_BLOCKED_TOOLS` pattern |
| Memory | Memory v2 + KG | Add skill registry + learning graph |
| Sandbox | (cloud-side) | Add local/docker backends |
