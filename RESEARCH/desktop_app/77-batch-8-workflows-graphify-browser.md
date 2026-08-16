# Doc 77 — Batch 8: Programmable Workflows / Knowledge Graph / Browser (2026-08-16)

**Date:** 2026-08-16 · **Sources (web-verified):** `apache/airflow`, `Graphify-Labs/graphify` (106.8K★), `addyosmani/agent-skills` (MIT), `Tencent/BrowserSkill`, `AIPexStudio/AIPex`, `browserable/browserable` (MIT), `kontext-security/browser-use-mcp-server`, `x1xhlol/system-prompts-and-models-of-ai-tools`; cross-checked against docs 06/58/62/63/65/67/71/72/75.

**Focus (user):** *"any agent should be able to automatically create workflows, via various connectors, cron jobs, etc."*

**One-line result:** 4 of 12 already covered (awesome-claude-skills → 65, Agent-Reach → 72, career-ops → 65, huginn → 58). The workflow answer is **already 80% built in `everyaios-blueprint` (DAG + `topological_order` + checkpoint/resume) + B7 triggers** — **Airflow supplies the missing scheduler semantics** (cron → dag_run → task states → retries/backfill → monitoring) so an agent authors a workflow as *data*. Two more steals: **Graphify's queryable knowledge-graph** (I7) and **addyosmani's exit-criteria engineering skills** (I2). → **TODO P25**.

---

## 1. 🟡 ADAPT — the programmable-workflow model (Airflow semantics on our blueprint)

**apache/airflow** is the canonical reference for "programmatically author, schedule, and monitor workflows": a **DAG** (workflow as code/data) + a **scheduler** (cron/timetable → `dag_run`) + **task states** (queued/running/success/failed/up_for_retry/upstream_failed) + **retries/backfill/SLA** + a **monitoring UI**.

We already have the hard half in `everyaios-blueprint`: `.md` blueprint parser + `BlueprintRegistry`, a **DAG state machine + `topological_order`**, checkpoint/resume + circuit-break, plan cache, and automation tool shapes. What's missing is the **scheduler/trigger semantics** and the **agent-authored connector steps**:

**Action (P25-1):** make "an agent creates a workflow" a first-class operation — the agent emits a **blueprint** (the DAG) whose nodes are connector/step references (mail/calendar via F14/F15, MCP-server tools via P22, browser/office via our engines), with **cron/event triggers** (B7), **per-node retry/backfill** (Airflow semantics), and the run visible in the **Automations panel** (left nav). This is the "programmatic workflow" answer — Airflow is the semantics reference, not a dependency (we rebuild on blueprint + the scheduler from doc 62/67).

## 2. 🟡 ADAPT — Graphify-Labs/graphify (queryable codebase knowledge graph)

106.8K★, tree-sitter across 36 languages, **no API key for code**: turns a codebase **+ docs + SQL schemas + configs + PDFs** into a **queryable knowledge graph**, exposed as a `/graphify` **skill** for Claude Code/Cursor/Codex.

**Action (P25-2):** fold the **"whole-repo → KG including docs/SQL/configs/PDFs"** scope into `everyaios-codeintel` (I7 — we have SCIP + tree-sitter repo-map/PageRank) + ship a `/graphify`-style **inbuilt skill** (I2). Pairs with code-review-graph (doc 65) + crux (doc 63). This is the same "skill = markdown + tree-sitter" pattern we can host natively.

## 3. 🟡 ADAPT — addyosmani/agent-skills (exit-criteria engineering skills)

19 MIT skills (Addy Osmani, Google Chrome DevRel) that encode **senior-engineer discipline as checklists with exit criteria** ("agents need exit criteria, not more prompt lore"): quality gates, review checklists, production-readiness.

**Action (P25-3):** bundle as **inbuilt engineering skills (I2)** — pairs with P23-2 (inbuilt skill packs) and P24-3 (ponytail minimal-code). Zero deps, pure markdown.

## 4. 🟢 REF — the browser batch (validations, one security note)

| Repo | Verdict |
|---|---|
| **Tencent/BrowserSkill** | 🟢 REF — "agents use your *real, logged-in* browser **without interrupting your work**" (CLI + extension) = our **"My Chrome" attach mode + Session Vault (E11/E13)** and the **agent-tabs-vs-user-tabs** segmentation in the Browse view. |
| **AIPexStudio/AIPex** | 🟢 REF — privacy-first Chrome-extension browser agent ("data never leaves your machine") = the G1/G2 extension surface (like nanobrowser/egolite). |
| **browserable/browserable** | 🟢 REF — MIT JS browser-automation *library* (90.4% bench); we already have CDP + a11y snapshots in Rust. |
| **kontext-security/browser-use-mcp-server** | 🟢 REF + 🔴 **security note** — MCP wrapper over browser-use ("browse from Cursor"); the **Knostic "MCP Hijacking" research** (a malicious MCP server hijacks Cursor's browser and steals credentials) validates our **P22 posture: Guard-2 install + read-first + egress firewall + vault-held tokens for every third-party MCP server**. |
| **x1xhlol/system-prompts-and-models-of-ai-tools** | 🟢 REF — extracted system prompts (Augment/Claude Code/Cluely/CodeBuddy/Comet/Cursor/Devin/Junie/Kiro…). **Structure only, never copy** (same as doc 71 system_prompts_leaks). |

## 5. Already covered (verdicts stand)

| Repo | Doc | Verdict |
|---|---|---|
| ComposioHQ/awesome-claude-skills | 65 | REF — SKILL.md anatomy → I2 |
| Panniantong/Agent-Reach | 72 | REF — per-platform read/search → G8 |
| santifer/career-ops | 65 | REF |
| huginn/huginn | 58 | REF — agents/cron monitors (B7) |

## 6. Net action

**TODO P25 (batch-8 workflows/graphify/browser queue):**
1. **Programmable workflows** — agent-authored blueprint = DAG of connector/step nodes + cron/event triggers (B7) + Airflow retry/backfill/state semantics → Automations panel. (`everyaios-blueprint` + scheduler + connectors; Airflow = reference only.)
2. **Graphify knowledge-graph** → `everyaios-codeintel` (I7) + inbuilt `/graphify` skill (I2) — codebase + docs + SQL + configs + PDFs.
3. **addyosmani/agent-skills** → inbuilt engineering skills (I2) with exit-criteria checklists.
4. **MCP-hijacking security note** → fold the Knostic finding into P22's Guard-2/egress-firewall policy.

**Ledger:** unchanged **281 repos** (awesome-claude-skills/Agent-Reach/career-ops/huginn already tracked; the 8 new names — airflow, graphify, addyosmani/agent-skills, BrowserSkill, AIPex, browserable, browser-use-mcp-server, system-prompts-and-models — are reference/adapt-only, tracked in P25, consistent with docs 71–76).
