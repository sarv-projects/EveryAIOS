# Doc 73 — Batch 6: Computer-Use / Full-Computer Control (2026-08-16)

**Date:** 2026-08-16 · **Method:** web-verified (GitHub + docs), cross-checked against docs 09/20/21/34/35/47/48/52/65/66/72.
**Scope:** 19 repos — vector/search + scraping + UI + models + **computer-use / full-computer control**.
**User priority:** *"the ability to completely control the entire computer is very important."*

**One-line result:** 11 of 19 already covered (docs 09/20/21/35/47/48/52/65/66/72). The one
genuine **steal** is **OpenAdapt's demonstration compiler** (record → deterministic replay →
zero model calls on healthy runs → governed repair → halt-instead-of-guess) → **B8
crystallization + E9 computer-use**. The rest of the computer-use batch are thin wrappers that
*validate* our E9/E14/UI-TARS design. → **TODO P21** (2 tasks).

---

## 1. The steal that matters for "control the whole computer"

### 🔴 OpenAdaptAI/OpenAdapt — STEAL/ADAPT (demonstration compiler)
"Compile a demonstrated GUI workflow into a **deterministic, locally executable program**.
**Zero model calls on healthy runs**; governed repair; **halts instead of guessing**."

This is the **crystallization doctrine** (doc 28 deterministic-planner + B8) applied to the
desktop GUI: record a human demo once → compile to a replayable program → replay with **no LLM**
on the healthy path → when the interface drifts, a **governed repair** step re-invokes the model
*only then* → if it can't verify the result, it **halts** rather than fabricate. This is exactly
how "completely control the computer" becomes *reliable and cheap* (vs the screenshot→action LLM
loop every step, which the other repos in this batch all use).

**Action (P21-1):** extend **B8 crystallization** (currently task/plan-level) with an
OpenAdapt-style **GUI demonstration compiler**: record → compile to deterministic replay
(action list + element selectors + verify-assertions) → zero-model healthy path → governed
repair → halt-instead-of-guess. This is the single highest-value item for the computer-use goal.
Reference only (Python; we rebuild in Rust on top of our CDP/a11y + Guard-2).

### 🟡 showlab/computer_use_ootb → **ShowUI-Aloha** — REFERENCE (human-taught computer-use)
OOTB GUI Agent (Windows/macOS) is a thin Claude-Computer-Use wrapper (2024). Its successor
**ShowUI-Aloha** ("human-taught computer-use agent that learns workflows from demonstrations and
executes new task variants") is the *training/learning* sibling of OpenAdapt: demonstrates →
learn → generalize. **Action (P21-2):** note as the reference for the *learning* half of
crystallization (record → generalize, not just replay); pairs with the reinforce-queue (P5/C13).

### 🟢 augmentcode/auggie — REFERENCE (add to F12 harness catalog)
Augment Code's agentic coding CLI (terminal; "understands your codebase, makes safe edits").
Same category as Claude Code / Gemini CLI / Codex. `gh-aw` already treats it as a selectable
**engine**. **Action:** add `auggie` (+ `augment-agent` GitHub-PR wrapper) to the F12 harness /
ACP registry list (doc 69).

---

## 2. The rest of the computer-use batch — REFERENCE (validate E9/E14, no steal)

| Repo | What it is | Verdict |
|---|---|---|
| AmberSahdev/Open-Interface | Python screenshot→action (GPT-4o/Gemini) mouse/keyboard | REF — older (2024) UI-TARS-class loop; E9 already supersedes |
| suitedaces/computer-agent (Taskhomie) | Desktop app: terminal + browser + mouse + keyboard | REF — validates the one-window cockpit (E9 + H2) |
| showlab/computer_use_ootb | OOTB Claude Computer Use (Win/mac) | REF — thin wrapper; leads to ShowUI-Aloha (above) |
| corbt/agent.exe | Electron wrapper over Claude computer-use | REF/SKIP — thin shell; we *are* that shell |
| OS-Copilot/OS-Copilot | Self-improving embodied agent (FRIDAY, GAIA) | REF — "self-improving" = our memory + reinforce (P5/C13) + taste; research code |

**Why no steal from these:** they all use the *screenshot → VLM → action* loop **every step**
(expensive, non-deterministic). Our E9 already has the better parts (CDP/a11y snapshots + tiered
engines + behavioral realism + Guard-2 approvals). OpenAdapt is the only one that *escapes* the
per-step LLM tax — hence the steal.

---

## 3. Already covered (verdicts stand)

| Repo | Prior doc | Verdict |
|---|---|---|
| qdrant/qdrant | 20 | REF — vector DB (server) |
| Qdrant Edge | 72 | REF — embedded vector alt (sqlite-vec default) |
| SeekStorm/SeekStorm | 72 | STEAL → P20-1 embedded hybrid index |
| xerj-org/xerj | 65 | REF — autoindex token-efficiency |
| getmaxun/maxun | 21 | REF — no-code scraping |
| D4Vinci/Scrapling | 65 | STEAL → P13 G8/E14 selector/fingerprints |
| open-webui/open-webui | 35 | REF — RAG/UI |
| anomalyco/models.dev | 66 | STEAL → P14 catalog |
| openinterpreter/openinterpreter | 09 | REF — local coding agent |
| trycua/cua | 52 | REF — computer-use 2.0 drivers/fleets/benchmarks (E9/J14) |
| cline/cline | 47 | REF — Plan/Act loop, SDK, Kanban worktrees (P17 ref) |

---

## 4. Net action

**TODO P21 (batch-6 queue, 2 tasks):**
1. OpenAdapt demonstration compiler → B8 crystallization + E9 (record → deterministic replay → zero-model healthy path → governed repair → halt-instead-of-guess).
2. ShowUI-Aloha human-taught computer-use → the *learning/generalization* half of crystallization (pairs with P5/C13 reinforce).

**Also:** add `auggie` to the F12/ACP harness list (doc 69).

**Ledger:** unchanged **281 repos** (all 19 already tracked; this pass adds no new live repos).
