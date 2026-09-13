# 88 — Casual surface / first-five-minutes UX audit (2026-09-13)

> **Method:** one external research pass (2026-09-13) over agentic-desktop products + 2026 activation/approval literature, then every load-bearing claim **checked against this repo's code** before it was acted on. Extends doc 84 (casual vs power) and doc 86 (competitor desktop deep-dive) without re-deriving them. Claims are marked **VERIFIED (code/read this session)**, **REPORTED (external source, not primary-read)**, or **UNCONFIRMED**.
> 🔗 **Products:** Claude Cowork (help docs + Simon Willison first impressions) · Eigent (`eigent-ai/eigent`) · OpenAI Codex app · OpenClaw / OpenCowork / Hermes Desktop (doc 86) · Perplexity local-first Portable Computer.
> 🔗 **Design evidence:** Zylos *"Designing the First 5 Minutes for AI Agent Products"* · tianpan.co *"The Approval Prompt Nobody Reads"* · Wharton AI Agent Adoption Blueprint · Nielsen mid-2026 · NN/g progressive disclosure.
> **Outcome:** the **P61** queue in `TODO.md` (12 items, 11 landed) + two honesty corrections (P32.2/P32.3). Architecture unchanged — this was a surface/vocabulary/defaults audit.

## 1. The numbers (external, directional — not measurements of this app)

| Finding | Number | Implication | Status |
|---|---|---|---|
| AI/ML activation rate (highest category) | 54.8 % | the category converts | REPORTED |
| Users who churn without first-week value | 90 % | week one is the whole game | REPORTED |
| Day-1 → Day-7 activation | 21 % → 12 % | ~half of activated users lost in a week | REPORTED |
| Users who approve agent permission prompts | ~93 % | a uniform approval gate is mostly a rubber stamp | REPORTED |
| Click through a security warning in <2 s | ~70 % | habituation is physics, not discipline | REPORTED |
| Escalation rate with proper risk tiering | 10–15 % | 85–90 % of today's modals should be a log line | REPORTED |

Two findings carried the audit:
- **"Kill the blank canvas."** An empty prompt makes users either over-scope or freeze; both fail. Show 3–5 pre-scoped, achievable first tasks.
- **The first-failure cliff.** One failure with **no visible way to dial back** causes permanent abandonment — not reduced permission. The dial must be reachable *at the moment of failure*.

## 2. What the leaders do (behavior, not chrome)

| Product | The lesson | Status |
|---|---|---|
| **Claude Cowork** | **One** composer mode selector — *Manual / Auto / Skip*, three plain words, in the message box; chat and Cowork share one home; **delete always asks** (one categorical hard stop, everything else tiered); progress + surfaced reasoning + mid-task steering | VERIFIED (help docs) / REPORTED (review) |
| **Eigent** | Sells **"Zero Setup — no technical configuration required"** and ladders complexity: *Cowork with Single Agent* → *Cowork with Workforce*. Simple is the front door; multi-agent is the upgrade | VERIFIED (repo README) |
| **Codex app** | Reviewed as *"gold for senior engineers"* — a **warning**: that is the power-user ceiling and where non-technical users bounce | REPORTED |
| **OpenClaw / Hermes / DeepChat** | Feature breadth is not the moat; local-first + MCP/ACP/skills are becoming table stakes (doc 86) | VERIFIED (doc 86) |

The user complaint that matters most (r/ClaudeAI, paraphrased): *"I'm not a coder, I'm an accountant…"* — the non-technical user hits a wall exactly when their first task is not pre-scoped.

## 3. Where EveryAIOS was already ahead (do not touch)

- **Plan approval, not step approval** — `BatchTicket` + the authorization-ticket model is the anti-fatigue design Cowork fakes with a mode dropdown. VERIFIED (spec §4.3 / guard crate).
- **Reversibility is architectural** — receipts, undo, audit, replay. VERIFIED.
- **Casual/Power progressive disclosure** (⌘.) exists — most competitors have no casual mode at all. VERIFIED.
- **`toPlainStage` + `limitationFor`** — a plain-language layer for stages already existed and was wired. VERIFIED.
- **`setup-gate.tsx`** states privacy/network destinations per path (Nielsen's "fewest questions", done honestly). VERIFIED.

## 4. The gaps (as found, then what happened to each)

| # | Gap (as audited) | Code check | Resolution |
|---|---|---|---|
| A | Composer asked **three** questions before the user typed: Agent ▾ · Work Mode ▾ · Autonomy ▾, with labels *Sandbox · Ask · Auto · Maximum* | VERIFIED — `chat-composer.tsx` rendered all three unconditionally; no `powerMode` gate | **P61.3** — one plain dial in casual (*Look only · Ask me first · Balanced · Just do it*); display layer over the same four `PermissionMode` values |
| B | Default `Ask` = uniform gating → trains the reflex (the security bug) | VERIFIED — `readPermission()` defaults to `ask` | **Partly addressed** — the dial names the level honestly and high-blast effects require deliberate approval (**P61.6**). The three-tier *non-blocking* "Done — review" digest needs a Guard effect class → **P61.12 open** |
| C | "Kill the blank canvas" only half-done — four example pills that only filled the box; nothing on click; no idle suggestion | VERIFIED — `home-launchpad.tsx` | **P61.4** — five pre-scoped starter **task cards** + once-only 24 h nudge (`first-run.ts`) |
| D | Jargon leaked into the casual surface (Guard, Trust Ladder, Autonomy, MCP, ACP, Chief, vault, ticket, trajectory, Sandbox) | VERIFIED — plain-language covered stages only | **P61.7** — `PLAIN_NOUNS`/`toPlainNoun`, applied first to the title-bar safety control |
| E | Trust Ladder 75/100 meter + the 5×5 matrix are power chrome shown in casual | VERIFIED — `guard-panel.tsx` (882 lines) | **P61.8** — casual states one true sentence from live sources; the meter + matrix are power-only; pending approvals still render in both |
| F | "The recovery card must carry the dial" — audit implied it was missing | **Audit over-stated it** — `TurnErrorCard` already had Retry / Copy / Copy request id | **P61.5** — *extended*: Try again safer (`saferMode`) · Try differently · Undo (only when a tool completed) |
| G1 | `preciseFigures()` fabricated numbers under a tooltip reading *"Exact figures from this run's receipt"* | **VERIFIED — real honesty bug.** `Artifact` has no count fields, so the function returned hardcoded constants (`42 cells updated`, `8 slides`, `0 tests broken`) | **P61.1** — returns only `Artifact.figures`; badge absent when there are none; tests pin "no digits of its own" |
| G2 | `suggestAgentNames` / `SUGGESTED_AGENT_NAMES` dead code (Wharton's +20 % ownership moment) | **VERIFIED dead** — referenced only inside `plain-language.ts` | **P61.2** — wired into the agent-builder naming step as tap-to-name chips |
| G3 | *(found while checking G2, not in the audit)* `TaskIntent` / `taskIntent` declared, stored, referenced nowhere | **VERIFIED dead** | **P61.2** — removed. (`ComposerRole` was checked too; it is live in `chat-panel.tsx` power-only spec mode and was correctly left alone) |
| H | Students had no posture (only a scoped-PDF chip) | VERIFIED | **P61.9** — read-only **Study Buddy** template (`deny: fs.write, shell`) + "Explain something simply" starter; replaced a starter that required a connector |
| I | Settings is a power labyrinth; casual must be self-sufficient without it | VERIFIED | **Not closed this pass** — the first-run starters + one dial reduce the need; a full casual-settings pass is not queued |
| J | Panel-collapse (the Willison Cowork bug: sidebar could not be closed, artifact crushed) | **VERIFIED — no trap.** `setActiveView`/`addView` set `powerMode: true` + `railCollapsed: false`; `closeView` collapses the rail on last close; sidebar toggle `⌘/`; rail Collapse/Expand + per-view Close; cockpit slideover Close + Collapse | **P61.11** — audited, **no fix invented** |
| K | Waits without a sentence; watches should produce an artifact (Devin DeepWiki pattern) | VERIFIED — `toPlainStage` covered some stages, not tool-done/prefixed ones | **P61.10** — covers settled tool stages + `routed:`/`cache:`/`context:`/`chief:` prefixes; the strip always carries a line |

## 5. Audit corrections worth keeping

1. **"Casual/Power split exists" was misleading.** `powerMode` only hid the rail/viewport and the budget pill — it is a **layout** mode, not a vocabulary or control mode. The casual surface had to be built, not merely extended.
2. **The recovery card gap was overstated** (see F) — extend, not build.
3. **P32.2 / P32.3 were marked `[DONE]` while one was dead code and the other fabricated** — a truthfulness problem in the tracker, not just a UX one. Both rows now carry an inline ⚠️ correction noting the earlier `[DONE]` was wrong, rather than silently rewriting history.

## 6. What was implemented (see TODO P61 + `SPEC-CHANGELOG.md` v3.68)

New pure/tested modules: `ui/src/lib/first-run.ts`, `ui/src/lib/recovery.ts`, `ui/src/lib/interrupts.ts`, plus `PLAIN_NOUNS`/`PLAIN_AUTONOMY_*` in `plain-language.ts` — each with a co-located `*.test.ts`. Surfaces changed: `chat-composer`, `home-launchpad`, `message-bubble` (error card), `mcq-interrupt-card`, `guard-panel`, `title-bar`, `now-doing-strip`, `artifact-card`, `agent-builder-panel`. **No Rust, no capability-contract, no policy change.**

## 7. What remains open

- **P61.12 — non-blocking "Done — review" digest.** The audit's third tier (reversible + unsurprising effects run without a prompt and report afterwards) requires the Guard to emit a non-blocking effect class. That is a **policy** decision, so it is recorded open rather than faked in the UI. This is the largest remaining anti-fatigue lever.
- Two lower-priority audit items were deliberately **not** queued: a casual-settings pass (I) and warning-only Guard-1 on destructive human commands — the latter risks re-creating the exact approval-fatigue problem the two-path rule exists to avoid.
