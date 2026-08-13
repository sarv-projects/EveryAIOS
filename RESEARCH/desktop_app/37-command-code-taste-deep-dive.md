# 37 — Command Code (`CommandCodeAI`) & the `taste-1` preference-learning pattern

> Added 2026-08-06 on user request: *"check the taste part — to add or not? and anything else relevant."* All facts verified this pass: GitHub API (org + repos), repo READMEs, and commandcode.ai docs (docs/taste, blog taste-skills-rules, launch).
>
> **C9 vs taste-skill (2026-08-13, doc 58 §5):** C9 = this doc's *learned coding-preference profile* (accept/reject/edit → rules, algorithm #31). **Leonxlnx/taste-skill** (76K⭐) is a *different* thing — a static frontend *design* SKILL.md pack (layout/typography/motion, no learning). Ship taste-skill as an optional I2 skill; do **not** let it substitute for C9.

---

## A. The org & the product

**Command Code AI** (`CommandCodeAI`, 18 repos, commandcode.ai) — maker of **Command Code**, a terminal-first coding agent whose differentiator is **`taste-1`**: *"a meta neuro-symbolic AI that learns and adapts to your coding preferences over time."*
- **Repos:** https://github.com/CommandCodeAI/command-code (3,628⭐) · https://github.com/CommandCodeAI/desktop (26⭐) · https://github.com/CommandCodeAI/agent-skills (101⭐) · https://github.com/CommandCodeAI/langui (3,144⭐)

| Repo | ★ | What | Relevant to us |
|---|---|---|---|
| `command-code` | 3,628 | The CLI agent (binary is **closed-source** — this repo is the product page) | The taste concept (below) |
| `desktop` | 26 | Desktop wrapper: projects + session history, streamed agent conversations, review plans + iterative feedback, file browser + **line-level diffs**, Git panel (review/discard/commit/push), integrated project terminal, model/permission/theme/shortcut settings | **Validates our P1 workspace layout** (Editor·Files·Terminal·Git) — same feature set |
| `agent-skills` | 101 | Curated skills list — 9 categories: Software Dev, Cloud Infra & AWS, Cloudflare, Content & Comms, Visual Design & Media, Business Ops, Document Mgmt, Data Analytics, Workflow Automation | Third skills catalog (with anthropics/skills, awesome-codex-skills) → seed library for I2 |
| `langui` | 3,144 | Open-source Tailwind chat-UI components (Langbase) | UI steal for H1 chat styling — components, not logic |
| `vscode` | — | A VS Code (Code-OSS) fork with their agent baked in | **Reject** — we're Tauri; confirms their desktop is an editor-fork, ours is a purpose-built shell |
| `BaseAI`/`langbase-*` | 1.3K–3.1K | Langbase serverless AI framework | Out of scope (serverless/web) — noted, not added |

## B. What `taste-1` actually is (the "taste part")

**Definition:** a **meta neuro-symbolic** model:
- **Neural (LLM)** — generation/reasoning.
- **Symbolic (constraint profile)** — a structured, human-readable preference profile acting as a *personalized prior* at generation: `output = LLM(prompt | taste(user))`. It narrows the search space to the user's established patterns instead of internet-statistical defaults.

**What it learns (micro-decisions, not broad rules):** coding style & structural patterns (named vs default exports, strict mode, explicit return types), framework/library choices (Vitest vs Mocha, Commander/tsup, pnpm vs npm), naming conventions, flag styles (`-v` vs `--version`), error-handling hierarchies (typed error classes, stderr logging), commit style.

**How it learns (continuous RL loop, no fine-tuning):**
`Generate → Observe → Extract → Learn → Apply`
- **Accepts** → confidence score ↑ · **Rejects** → confidence ↓ / prune · **Edits** → the exact generated-vs-fixed delta is the correction signal · **Prompts** → intent/instructions captured.
- Every preference carries a **confidence score 0–1**.

**Storage & scope:** human-readable markdown, **`taste.md`** grouped in modular packages (cli / typescript / architecture…):
- per-repo `.commandcode/taste/` (git-committed → teams share it)
- global `~/.commandcode/taste/` (follows the dev everywhere)
- remote push/pull via Studio (`npx taste push/pull`)

**Vs the manual alternatives:** CLAUDE.md / .cursorrules / Copilot instructions / AGENTS.md are all **manually written, statically maintained, and decay**; taste-1 is **automatically learned, auto-maintained, confidence-scored, and compounds** over time.

**License reality:** the `taste-1` neural-symbolic engine + remote registry are **proprietary/cloud**. → **Pattern-only steal. We implement the *shape*, never the code.**

## C. The decision — ADD or NOT? → **ADD (as a pattern), with our own pieces**

**Why ADD (it's genuinely missing from our stack):**
1. Our memory already has *half* of it: **correction-detector + auto-promote** (learns from corrections) and **Forgetting-to-Remember** (learns from frustration) are the Observe/Extract/Learn side — but they don't produce a **generation-time symbolic prior**.
2. Our **Personality (H10, SOUL.md)** is *manual*, like CLAUDE.md — static, decays. Taste's *auto-learned, confidence-scored, self-updating* profile is the missing upgrade.
3. It **fits our principles perfectly**: "everything is a file" (taste.md = user-editable markdown), cache-first (taste.md injected once at session start = **stable prefix**, no cache breaks), zero-server (profile is local + git-shareable).
4. It's the **coding-agent-specific** memory our RAG/memory layer doesn't specialize in (those are facts/notes; taste is *style/preferences*).

**How we'd build it (all existing pieces + one new store):**
- **New store:** `~/.pai/taste/` (global) + `.pai-taste/` (per-repo, git-committed) — markdown packages with **confidence scores 0–1**, auto-extracted.
- **Learn:** reuse correction-detector + auto-promote + Forgetting-to-Remember signal pipeline; add accept/reject hooks on edit/approve actions (our Guard-2 + audit trail already record every accept/reject → free training signal).
- **Apply:** inject taste.md as a **stable-prefix** block in the system prompt (compatible with 05 prefix-cache discipline — injected once, unchanged mid-session) + per-command rules for the code tool (rtk-style, doc 23).
- **Share:** per-repo `.pai-taste/` committed to git; optional encrypted export (C8) instead of their cloud push/pull.
- **Scope gates:** per-domain packages; confidence floor before a preference is auto-applied; always user-editable/overridable.

**Rejected parts:** the proprietary `taste-1` model/cloud, `npx taste push/pull` registry, and any closed-code dependency.

## D. Other relevant steals (added to ledger, not new matrix rows)

- **Desktop app feature set** (diffs, git panel, integrated terminal, feedback loops) → confirms our P1 workspace layout; already covered by H2/H3/H5 + P1.
- **agent-skills catalog** (9 categories) → I2 seed library alongside awesome-codex-skills + anthropics/skills.
- **langui** (Tailwind chat components) → optional H1 chat-UI component source.

## E. Delta vs the locked matrix/spec

| New row | What | Source | Status |
|---|---|---|---|
| **C9** | **Taste profile** — auto-learned coding-preference profile (style/patterns/frameworks) with confidence scores; stored as shareable markdown (`~/.pai/taste/` + per-repo `.pai-taste/`); injected as a stable-prefix symbolic prior at generation; learns from accept/reject/edit via correction-detector + audit | Command Code taste-1 (pattern only) | 🟡 |
| Algorithm #31 | Taste preference learning (Generate → Observe → Extract → Learn → Apply; confidence-scored rules) | same | 🟡 |

**Ledger 147 → 151 (command-code, desktop, agent-skills, langui), matrix 99 → 100.**
