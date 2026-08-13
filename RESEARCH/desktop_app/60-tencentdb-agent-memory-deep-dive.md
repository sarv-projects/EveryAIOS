# 60 — TencentDB Agent Memory Deep-Dive (memory-asset governance + distillation pipeline)

> Added 2026-08-13. Source-level read of TencentDB-Agent-Memory README/INSTALL (live-verified via GitHub API: **21,002⭐, MIT**, created 2026-04-07, pushed 2026-08-11, current release **v2.0.0**).
> **This is the single best existing articulation of the "one memory model" product invariant we already decided to freeze** — one governed taxonomy for *everything an agent can remember*, not a chat-log warehouse.

---

## 0. License note (resolved)

GitHub reports **NOASSERTION** because Tencent wraps MIT in a custom header (`Copyright (C) 2026 Tencent. All rights reserved. Licensed under the MIT.` → full MIT terms follow). **The actual terms are MIT — clean permissive.** Unlike worldmonitor (which was *actually* AGPL behind its GNU header), this one is genuinely MIT. Still a **reimplement-the-logic, don't-paste-files** steal: it's a three-service Docker server, and we are a local-first single-user desktop.

---

## 1. What it is

A **team-level memory hub** for AI agents — not a RAG store, not a vector DB, not a chat-log archive. It answers: *"what's worth keeping, who can use it, and how to retrieve less while retrieving the right things next time."*

**Architecture (what we will NOT copy):** three services — `memory-core` + `memory-hub` + `proxy` — launched via `deploy/global-images/start-all.sh` (Docker), with a control panel on `localhost:8125`. Team/tenant model, multi-user, multi-agent.

**The insight worth stealing is not the server — it is the *taxonomy and governance model*.** Everything an agent can remember is normalized into **four memory assets**, each with the same governance envelope.

---

## 2. The four-asset taxonomy — STEAL (our "one memory model")

| Asset | What it stores | Our row | Our current state |
|---|---|---|---|
| **Chat Memory** (L0→L3) | preferences, facts, decisions, interaction history | C1/C2/C7 | we have 7 algos + multi-tier, but no *named* distillation ladder |
| **Skill** | versioned, resource-file-backed, trigger-bounded, execution-step, validation-rule expertise | I2 | we have SKILL.md convention (docs 33/55/57), but no *version/trigger/validation* envelope |
| **LLM-Wiki** | docs → structured pages + link graph (Karpathy LLM-Wiki idea) | C6 / G5 knowledge | we have user-editable knowledge + KG store, no doc→wiki pipeline |
| **Code-Graph** | code symbols, files, call relationships, impact paths | I7 (RepoMap) + C6 | RepoMap (tree-sitter+PageRank) specified; impact-path ("changing this affects that") is the missing bit |

**Steal:** the *unified asset-registry* concept. Every asset (memory, skill, wiki-page, code-graph node) is registered with **ownership, version, status, visibility, usage-count, agent-binding**. This is exactly the "one memory model" we froze as a product invariant — it collapses our scattered C/I2/I7/G5 rows into one governed namespace.

---

## 3. L0→L3 distillation ladder — STEAL for C1/C2

Conversations are first saved raw, then refined by an **async pipeline** into finer layers:

| Layer | Stores | Primary use |
|---|---|---|
| **L0 Conversation** | raw with full context | verify exact wording/timestamps/sources |
| **L1 Atom** | facts, preferences, constraints, events | precise recall of actionable info |
| **L2 Scenario** | knowledge blocks grouped by project/scenario | restore working context fast |
| **L3 Core/Persona** | long-term profiles, stable patterns, high-level cognition | enter user/team context instantly |

**Retrieval is layered too:** L2/L3 give a quick context bootstrap; when specific facts are needed, **BM25 + vector + RRF** fall back to L1/L0. Results are **capped by item-count, character budget, and timeout** so memory can't flood the context window.

**Steal → our C1/C2/C7:**
- Name our multi-tier memory as **L0–L3** (it already *is* sensory/working/episodic/semantic — this gives it a load-order and a retrieval policy).
- The **BM25+vector+RRF with caps** is our C3 retrieval fusion (doc 34 §2) plus the item/char/timeout budget our C7 injection already demands.
- "L2/L3 bootstrap + L1/L0 on-demand" is the concrete rule for **pass-by-reference / warm-set** (C7/C10): don't inject the store, inject the *top layer* and let the agent page deeper.

---

## 4. Skill envelope — STEAL for I2

A Skill is **not a prompt snippet**: it has **versions, resource files, trigger boundaries, execution steps, and validation rules**. Personal by default; after review it can be shared to the team and bound to a specific agent. (Their skill code is partly derived from **Hermes Agent** — which we already source-read in docs 02/24/38 — so this is a *refinement* of a repo we own.)

**Steal → I2:** add `version` + `trigger` + `validation` + `ownership` fields to our SKILL.md manifest. Our current I2 is the doc-33/55/57 convention (name/description/allow-lists) — this adds the *lifecycle* dimension (who owns it, what version, when it fires, how it's validated).

---

## 5. Governance envelope — STEAL (the big one)

Three things every asset carries, all enforced in one place:

1. **Visibility:** `private` (only Owner — *not even team admins*) · `team` · `restricted` (User/Role/Agent ACL) · `agent` (targeted equipping within a team).
2. **Ownership:** every asset has an `Owner`; owner auto-gets management rights.
3. **Agent loadout ("Fixed Binding + ACL"):** each agent is *equipped* with a specific subset of assets — "Scout gets user-interview memory + market-research wiki + competitive-analysis skill; Builder gets product wiki + code-graph + delivery skill." Switching agents = **re-equipping, not retraining**.

**Steal → our C8 + permission model + F12/J17 multi-agent:**
- Our memory/skills/wikis are local-first **single-user**, so "team" collapses to *"the user's agents"* (sub-agents, ACP harnesses, surgeon/core tiers). The **agent-loadout** concept maps 1:1 onto our F12/J17: different ACP harnesses get different context subsets.
- The **visibility + owner + version + usage-count + binding** envelope is exactly the governance our C8 (sync/export/wipe) and the "one memory model" invariant are missing. It also composes with the **authorization-ticket / audit** model (ARCH/06 §6.9–6.11): an agent can only *read* a memory asset its loadout grants it.

---

## 6. Cold-start import — STEAL for onboarding

"Stop retraining every agent. Give it the save file." Existing assets import directly:
- **Codebases** → Code-Graph auto-indexes symbols/files/calls/impact.
- **Docs/files** → Wiki auto-generates structured pages + link graph.
- **Past agent sessions** → Chat Memory + Skills auto-extracted.

**Steal → P12.1 onboarding + the product rule** ("one useful default task before any module wall"). First run = import a project folder → it becomes memory (code-graph + wiki + session) *before* the user is asked to configure anything. This is the "control-plane onboarding" the eval called out as missing, in concrete form.

---

## 7. Benchmark (one number, vendor-cited)

**PersonaMem:** 48% without → **76% with** (+59% relative), measuring whether an agent correctly understands/applies user info after extended interactions. Vendor-reported — keep as directional, never cite as our own number.

---

## 8. What we deliberately do NOT copy

1. **The three-service Docker server + team/tenant model** — we are local-first single-user (SPEC §2 non-goal: no founder server). Memory lives in SQLite/FTS5 + LadybugDB + the SQLCipher vault (ARCH/05), not a hub process.
2. **The `localhost:8125` panel** — our "Memory Hub" equivalent is the P3 Cockpit + P11.5 Memory Browser panel, surfaced through the existing workspace UI, not a separate web app.
3. **Team sharing semantics** — "team/restricted/ACL" only become real if we later add multi-user sync (C8 opt-in); for v1 the envelope is single-user + agent-loadout.

---

## 9. Steal → code/row mapping (concrete)

| TencentDB internals | → our capability | Concrete change |
|---|---|---|
| 4-asset taxonomy (Chat Memory / Skill / Wiki / Code-Graph) | "one memory model" invariant | one asset-registry namespace across C/I2/I7/G5 |
| L0→L3 distillation ladder | C1/C2 | name our tiers L0–L3 with a load-order + retrieval policy |
| BM25+vector+RRF + item/char/timeout caps | C3/C7 | retrieval fusion + hard context-budget caps |
| Skill envelope (version/trigger/validation/owner) | I2 | extend SKILL.md manifest with lifecycle fields |
| Code-Graph impact paths | I7 | add "callers/callees/impact" to RepoMap output |
| Ownership/version/status/visibility/usage/binding | C8 + "one memory model" | govern all assets under one envelope |
| Agent loadout (Fixed Binding + ACL) | F12/J17 + ARCH/06 | per-harness context subsets gated by ticket/audit |
| Cold-start import (code→graph, docs→wiki, sessions→memory) | P12.1 onboarding | first-run = import folder → memory, no module wall |

All **reimplement-in-Rust** (SQLite/FTS5 + LadybugDB + vault); the source is a Node/Go-ish Docker server, no code import — pure logic + taxonomy extraction.
