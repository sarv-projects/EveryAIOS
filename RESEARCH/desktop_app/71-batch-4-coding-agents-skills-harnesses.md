# Doc 71 — Batch 4: Coding Agents, Skills, Plugins, Agentic Cores (2026-08-16)

**Date:** 2026-08-16 · **Method:** web-verified (GitHub + ecosystem), cross-checked against docs 02/05/14/21/22/38/65/69.
**Scope:** 21 repos — coding agents, skills, plugins, agentic cores, harnesses, workflow builders.

**One-line result:** 13 of the 21 are already covered by prior docs (verdicts stand — no re-work).
The **7 genuinely-new findings** → **TODO P19** (4 tasks): Kilo gateway routing (ADAPT),
ruflo swarms/federation (ADAPT/REF), ui-ux-pro-max design skill (ADAPT), system-prompt
*structure* (REF — text NOT copyable).

---

## 1. New / changed verdicts (the only ones that matter)

### 🔴 voideditor/void — SKIP (deprecated, update doc 47)
Void is a VS Code fork (open-source Cursor alt). **Now deprecated** (repo banner, ~2026-06;
"development is paused as of 2026"). Its two interesting features — "use AI agents on your
codebase" + "checkpoint and visualize changes" — are already superseded by our ACP harness
(F12) + office/storage `Snapshot` rollback. **Action:** doc 47's "Void archived" note is now
confirmed *deprecated*; no steal.

### 🟡 Kilo-Org/kilocode (Kilo Code) — ADAPT (model gateway + BYOK routing)
Kilo Code = open-source AI coding agent for VS Code + JetBrains + CLI + Cloud; 500+ models,
bring-your-own-keys at zero markup, 3M devs / 30T tokens. The **"Kilo Code Gateway"** — a
routing layer between client and 500+ providers — is the concrete pattern for our **A6 catalog
long-tail + A7 routing + H32 agent-scoped model picker** (same conclusion as OmniRoute doc 59 +
models.dev doc 66). Also validates "embedded runtime" (VS Code starts its own runtime = our
sidecar model). **Action (P19-1):** treat the Gateway as the reference for the *cache-optimized
BYOK routing* seam in `everyaios-catalog` (already queued P14); note Kilo is in the ACP registry
as `kilo` (doc 69).

### 🟡 ruvnet/ruflo — ADAPT/REFERENCE (meta-harness: swarms + federation + hooks)
Ruflo (67.9K★) is a **meta-harness on top of Claude Code / Codex**: adds plugins, agents,
**swarms**, persistent memory, MCP tools, **hooks**, and **cross-machine federation**. It is the
exact category we already are (blueprint + ACP + guard + memory), so it's **validation, not a
steal** — but two deltas are worth noting: (a) **swarm orchestration** (N agents on one prompt,
discussion #851) → confirms P6 multi-agent topologies (group-chat/handoff) + H2 Kanban-of-agents
(P17); (b) **cross-machine federation** → the H18 mobile/remote note. Its sibling
`ruvnet/metaharness` ("scaffold your own branded agent harness with its own npx CLI/MCP/memory/
learning loop") is a reference for our **blueprint engine + F8 installer** (a harness generator
is what `everyaios-blueprint` already does). **Action (P19-2):** fold the swarm + federation
deltas into the existing P17/H18 tasks — no new row.

### 🟢 asgeirtj/system_prompts_leaks — REFERENCE (structure only; do NOT copy text)
62.9K★ collection of extracted system prompts (Claude Fable 5, Opus 5, Claude Code, GPT-5.6-Sol,
Codex, Gemini 3.5, Grok, Cursor, Copilot, VS Code, Perplexity). **Legal line: these are
proprietary/copyrighted — verbatim copy is a ToS/copyright risk; we reference *structure* only.**
The *structure* (tool descriptions, permission model, formatting rules, context/memory handling,
guardrails) is the reference for our **P6.22 agent-frontmatter schema** (doc 63 already stole the
`permissionMode/color/hooks/mcpServers/maxTurns` shape from qwen-code/Claude-Code). **Action
(P19-3):** document the observed prompt *anatomy* (sections: role / tools / permissions / memory /
output format / stop rules) into the agent-frontmatter schema — never lift text.

### 🟡 nextlevelbuilder/ui-ux-pro-max-skill — ADAPT (bundled design-intelligence skill)
116.9K★ design-intelligence skill: **161 reasoning rules + 67 UI styles + 50+ styles / 97
palettes / 9 tech stacks**, searchable database of UI styles, color palettes, font pairings,
chart types, UX guidelines. This is a pure **knowledge pack** (no code/deps) and maps directly to
our **I2 SKILL.md anatomy** (doc 65) + **H29 local dashboard artifacts** + the UI v2 design
system. **Action (P19-4):** bundle a design-intelligence skill (structure = SKILL.md + a
searchable style/palette/typography index) as an inbuilt skill for the default agent — it is the
highest-value, zero-dependency item in this batch.

### 🟢 esengine/DeepSeek-Reasonix — REFERENCE (already mapped; cache-discipline confirmation)
DeepSeek-native terminal coding agent, "engineered around prefix-cache stability — leave it
running" (~93% token-cost cut claimed). This is the **same Reasonix** already deep-dived in doc 05
(cache-first compaction, per-agent models); the repo moved under `esengine`. It *confirms* our
ARCH/05 stable-prefix + CACHE_BOUNDARY doctrine — no new steal. **Action:** none (doc 05 stands).

### ⚪ ruvnet/RuView — SKIP (out of scope)
"π RuView" turns WiFi Channel State Information into spatial intelligence / vital signs /
presence detection (WiFi DensePose). Hardware/WiFi-sensing — **completely out of scope** for a
desktop agent OS. No action.

---

## 2. Already covered (verdicts stand — cross-check only)

| Repo | Prior doc | Verdict (unchanged) |
|---|---|---|
| openclaw/openclaw | 02/03 | STEAL → AGENTS.md/SOUL.md spec-orchestration (landed in blueprint) |
| NousResearch/hermes-agent | 02/38/69 | STEAL queue P17 (IterationBudget, 3-layer persistence, MoA, kanban, worktree, checkpoints, journey, egress) |
| n8n-io/n8n | 14 | REF — automation/workflow (B7/B8) |
| Significant-Gravitas/AutoGPT | 21 | REF — agent loop |
| obra/superpowers | 22 | ADAPT — agentic skills framework + methodology (I2) |
| langflow-ai/langflow | 65 | REF — visual workflow builder |
| ChatGPTNextWeb/NextChat | 65 | SKIP — chat wrapper |
| lobehub/lobehub | 65 | REF — agent operator/scheduling |
| dair-ai/Prompt-Engineering-Guide | 65 | SKIP — guide |
| tw93/Pake | 65 | REF — webpage→desktop |
| thedotmack/claude-mem | 65 | STEAL → P5 saved-vs-discovered (P13) |
| metalbear-co/mirrord | 65 | REF — K8s env mirroring |
| sickn33/agentic-awesome-skills | 65 | STEAL → F8 skills_index.json (P13) |
| f/prompts.chat | 65 | SKIP — prompt collection |

---

## 3. Net action

**TODO P19 (batch-4 queue, 4 tasks):**
1. Kilo "Gateway" routing seam → `everyaios-catalog` (extends P14, A6/A7/H32).
2. ruflo swarm + federation deltas → fold into P17 (Kanban-of-agents) + H18.
3. system-prompt *structure* (not text) → P6.22 agent-frontmatter schema.
4. ui-ux-pro-max design-intelligence skill → bundle as inbuilt I2 skill (H29).

**Ledger:** unchanged **281 repos** (void deprecated, no new live repos added this pass;
Reasonix already counted in doc 05).
