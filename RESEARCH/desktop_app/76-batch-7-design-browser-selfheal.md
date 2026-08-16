# Doc 76 — Batch 7: Design / Browser Self-Healing / Computer-Use (2026-08-16)

**Date:** 2026-08-16 · **Sources (web-verified):** `nexu-io/open-design` (57–68K★ in ~8 weeks), `browser-use/browser-harness` (16.7K★), `microsoft/magentic-ui` (MagenticLite, 10K★), `web-infra-dev/midscene`, `jackwener/OpenCLI`, `nanobrowser/nanobrowser`, `DietrichGebert/ponytail`, `stitionai/devika`; cross-checked against docs 06/15/17/18/48/63.

**One-line result:** 3 of 11 already covered (browser-use → 06/15/17/63; UI-TARS-desktop → 48; LM Studio/lmstudio-ai → 18/34/35). Two real steals: **open-design's DESIGN.md brand-system-as-skill + composable design-skills** (I2/H29) and **browser-harness's self-healing harness** (agent edits its own helpers mid-task → our script-eval + P21 governed-repair). The rest are validations of the one-session browser+files+HITL cockpit. → **TODO P24**.

---

## 1. 🟡 ADAPT — nexu-io/open-design (the design vertical of our exact architecture)

The open-source **Claude Design** alternative: local-first desktop app, **BYOK**, and — critically — it **auto-detects 10 coding-agent CLIs (Claude Code, Codex, Cursor, …)** and drives them to produce design artifacts (prototypes, landing pages, dashboards, slides, images, video). Ships **259+ composable Skills + 142+ brand-grade Design Systems** via **`DESIGN.md`** (a brand system encoded as a markdown file the agent reads, mirroring `CLAUDE.md`/`SKILL.md`).

This is **our H32 agent-picker + ACP harness + I2 skills + H29 artifacts thesis, but scoped to design** — it validates everything we've been building, and it's the first big open competitor in the design vertical.

**Action (P24-1):** steal the **`DESIGN.md` brand-system-as-skill** pattern (a repo-level design-system file the default agent loads, like `CLAUDE.md`) + the **composable design-skills** catalog. Fold into I2/H29 and pair with P19-4 (ui-ux-pro-max design-intelligence skill). Reference only (its skills are for *other* agents; we rebuild on our stack).

## 2. 🟡 ADAPT — browser-use/browser-harness (self-healing harness)

~**592 lines of Python**, 16.7K★: "the thinnest possible bridge from the LLM to Chrome, on CDP." When the agent hits something it doesn't recognize, it **writes/edits its own helper functions mid-task** (self-healing) instead of failing. The opposite of the heavy "recipes/rails" harnesses.

**Action (P24-2):** fold the **self-healing** idea into our browser layer — the agent may emit an editable helper (via `everyaios-script` rquickjs, E4) on an unrecognized page pattern, rather than the harness hard-coding every site. Pairs with **P21's OpenAdapt governed-repair** (the healthy-path determinism vs the self-healing escape hatch are complementary).

## 3. 🟢 REF — microsoft/magentic-ui (MagenticLite)

Experimental agent across **browser + local file system in one workflow**, human-in-the-loop, optimized for **small models** (Fara-7B, runs under LM Studio/Ollama). 10K★, MIT. This is the **one-session browser+files cockpit** we already built (E9 + Folder view + H2 + A5 hardware-fit) — a validation, not a steal. Note its "local DB config, not YAML" + transparency-notes discipline as minor UX references.

## 4. The rest — REFERENCE / SKIP

| Repo | Verdict |
|---|---|
| **web-infra-dev/midscene** | 🟢 REF — vision-driven UI automation (screenshot + VLM + JS). Validates our E9 tiered-perception (a11y snapshot first = token-lean, vision as escalate — doc 48 OmniParser/UI-TARS). |
| **jackwener/OpenCLI** | 🟢 REF — "make any website into a CLI using your logged-in browser" = our **Session Vault (E11/E13)** + G8 read/llms.txt. |
| **nanobrowser/nanobrowser** | 🟢 REF — open-source Chrome-extension multi-agent web automation (your own LLM). The browser-extension surface (G1/G2), not the control plane. |
| **DietrichGebert/ponytail** | 🟢 REF/ADAPT — "think like the laziest senior dev; the best code is the code you never wrote." Fold this **minimal-change/YAGNI** doctrine into the default agent's coding persona + the C1–C3 coding cluster (doc 63) and token economy (doc 32). |
| **stitionai/devika** | ⚪ SKIP — 2024-era "Agentic Software Engineer" (LangChain, Python); long-superseded by our P6 blueprint + P8 eval. Reference for the plan/execute UI only. |

## 5. Already covered (verdicts stand)

| Repo | Doc | Verdict |
|---|---|---|
| browser-use/browser-use | 06/15/17/63 | REF — a11y-tree, service.py/HistoryItem, P3/P9 |
| bytedance/UI-TARS-desktop | 48 | REF — operator abstraction (E9) |
| LM Studio / lmstudio-ai | 18/34/35 | REF — lms CLI, mlx-engine, local server (A5) |

## 6. Net action

**TODO P24 (batch-7 design/browser/computer-use queue):**
1. **open-design `DESIGN.md` + composable design-skills** → I2/H29 (pairs with P19-4).
2. **browser-harness self-healing harness** → E14/E16 + `everyaios-script` helper-editing (pairs with P21 governed-repair).
3. **ponytail minimal-code doctrine** → default-agent coding persona + C1–C3 cluster + token economy.

**Ledger:** unchanged **281 repos** (browser-use/UI-TARS-desktop/LM Studio already tracked; the 8 new names — open-design, browser-harness, magentic-ui, midscene, OpenCLI, nanobrowser, ponytail, devika — are reference/adapt-only, tracked in P24, consistent with docs 71–75).
