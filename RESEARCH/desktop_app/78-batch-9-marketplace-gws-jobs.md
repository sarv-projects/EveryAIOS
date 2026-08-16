# Doc 78 — Batch 9: Multi-Harness Marketplace / Google Workspace / Jobs Vertical (2026-08-16)

**Date:** 2026-08-16 · **Sources (web-verified):** `wshobson/agents` (94 plugins / 203 agents / 175 skills), `googleworkspace/cli` (`gws`, Google's official Workspace CLI), `feder-cr/Jobs_Applier_AI_Agent_AIHawk` (AIHawk); cross-checked against docs 58/65/77.

**Focus (user):** *"esp the job application, can be useful."*

**One-line result:** 3 of 6 already covered (career-ops → 65, huginn → 58, airflow → 77). Three real adopts: **wshobson/agents** = the ready-made **multi-harness plugin marketplace catalog** for our P23 "Add" button; **googleworkspace/cli (`gws`)** = the official **Google Workspace connector** (Drive/Gmail/Calendar/Sheets/Docs) we should consume instead of hand-building; **AIHawk** = the **"Jobs" vertical** that composes career-ops' rubric + our office engine + browser + approve-before-send into one packaged agent. → **TODO P26**.

---

## 1. 🟡 ADAPT — wshobson/agents (the multi-harness plugin marketplace, already built)

**94 plugins · 203 agents · 175 skills · 109 …** installable across **Claude Code, Codex CLI, Cursor, OpenCode, GitHub Copilot, Gemini CLI** (and Zed). One capability source file → every harness.

This is **exactly the P23-3 "marketplace Add" button we spec'd**, already populated. **Action (P26-1):** adopt `wshobson/agents` as a **catalog seed** for the F8 registry / P23 marketplace — our single cockpit already *is* the multi-harness host it targets (F12/J17 ACP), so its plugins/agents/skills become installable in EveryAIOS via the existing registry-fed install (Guard-2, sha-pinned).

## 2. 🟡 ADAPT — googleworkspace/cli (`gws`) (the Google Workspace connector)

Google's official CLI: **one tool for Drive, Gmail, Calendar, Sheets, Docs, Chat, Admin** — "built for humans and AI agents", **dynamically generated from the Google Discovery Service**, structured JSON output, MCP integration.

**Action (P26-2):** consume `gws` as the **Google Workspace connector** (F14/F15 email/calendar + P18's Gmail read-first item) — run it as a managed child (P22 MCP-Server-Manager pattern) rather than hand-writing Gmail/Calendar/Drive adapters. Policy unchanged: **read-first + approve-before-send** (every send/delete a Guard-2 ticket) + OAuth token in the SQLCipher vault. This *retires* the "external connector OAuth is a config placeholder" gap with an official, dynamically-maintained surface.

## 3. 🟡 ADAPT — AIHawk Jobs vertical (the use-case you flagged)

`feder-cr/Jobs_Applier_AI_Agent_AIHawk` auto-applies to jobs with a **tailored resume + cover letter per posting** (Python + browser). Combined with **career-ops** (doc 65: scan portals → **A–F rubric → 1.0–5.0 score**), this is a full vertical that exercises *everything we already built*:

scan portals → rubric-score → **tailor CV + cover letter (our docx engine, D1)** → **auto-apply (browser + Session Vault E11/E13)** → **Guard-2 approve-before-send on every submission** (never silent mass-apply).

**Action (P26-3):** ship a **"Jobs" skill/agent pack** (I2 skill + P6 blueprint) as the reference vertical: career-ops rubric + AIHawk apply flow + office-engine document tailoring. **Policy note:** auto-apply is a *write to a third party* — every submission is a Guard-2 ticket; the HN quality critique ("no cover letter beats an LLM cover letter") is folded in as a *human-confirm-before-send* step, not an auto-send.

## 4. Already covered (verdicts stand)

| Repo | Doc | Verdict |
|---|---|---|
| santifer/career-ops | 65 | REF — A–F rubric job eval |
| huginn/huginn | 58 | REF — agents/cron monitors (B7) |
| apache/airflow | 77 | ADAPT — DAG scheduler semantics → P25-1 |

## 5. Net action

**TODO P26 (batch-9 marketplace/gws/jobs queue):**
1. **wshobson/agents marketplace** → F8/P23 catalog seed (94 plugins / 203 agents / 175 skills, multi-harness).
2. **googleworkspace/cli (`gws`)** → F14/F15 + P18 Gmail read-first connector (managed child, Discovery-based, read-first + approve-before-send, vault tokens).
3. **AIHawk + career-ops "Jobs" vertical** → I2 skill + P6 blueprint (scan → rubric → tailor CV/cover letter via docx → auto-apply via browser + Session Vault, every submit a Guard-2 ticket).

**Ledger:** unchanged **281 repos** (career-ops/huginn/airflow already tracked; `wshobson/agents`, `googleworkspace/cli`, `AIHawk` are new but reference/adapt-only, tracked in P26, consistent with docs 71–77).
