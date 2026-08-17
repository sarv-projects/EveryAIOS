# EveryAIOS — Casual vs Power User UX: What Each Group Actually Wants

**Question addressed:** What do casual (non-technical) users and power (technical) users each *exactly* want from a local-first AI desktop workspace — and what does that mean for the EveryAIOS UI?

**Research date:** 17 August 2026. Sources: Wharton Blueprint for AI Agent Adoption (2026-04), Jakob Nielsen's 2026 AI/UX predictions + mid-year reality check (2026-07), NN/g progressive disclosure, 2026 AI-tool buyer's guides, and the code-level competitor research already in doc 83 (openworker / cc-switch / skales / deepseek-harness).

> **Bottom line:** Casual users are not asking for "fewer features" — they are asking for **trust, plain-language control, and outcomes that match their words**. Power users are not asking for "more features" either — they are asking for **transparency, fine-grained control, keyboard-first speed, and the freedom to use any model/tool without the UI getting in the way**. The two sets of needs are almost perfectly complementary, which is exactly what progressive disclosure (already in `powerMode`/`devMode`) is built to serve. The risk is not "too much vs too little" — it is **one surface trying to do both at once**.

---

## 1. The evidence base

### 1.1 Wharton Blueprint for AI Agent Adoption (2026-04-21) — the trust science

Wharton Human-AI Research + Science Says surveyed business leaders (combined workforce 700,000+ employees) and synthesized behavioral-science findings on why people do/do not adopt AI agents. The three **psychological frictions** are:

| Friction | Definition | What wins users |
| --- | --- | --- |
| **Perceived Competence** | Belief the agent can actually do the task | Show detailed explanations of the agent's process; demonstrate co-created value; pair the agent with a credible human expert; **avoid an overly warm/friendly personality** |
| **Trust** | Willingness to rely on it despite uncertainty | Be transparent about limitations (say where it fails); show proof of successful outcomes; use "learning/improving" framing; **use precise numbers/metrics in outputs** |
| **Delegation of Control** | Willingness to grant it autonomy | Design for **moderate, human-in-the-loop autonomy with approvals**; clearly communicate where the user can **edit, pause, stop, or reverse**; keep people attentive on high-stakes outputs |

Quantified signals:
- **Control concerns = 26%** of the weight of the decision to adopt AI (worry of not being able to audit the agent's process).
- **Privacy concerns = 31%** (cited in the Blueprint's companion coverage).
- **Psychological ownership** (e.g., naming the agent) can lift adoption by **up to 20%**.
- Explanations must be plain: *"Do not frame explanations as technical details (e.g., 'this agent is not directly connected to the X MCP'); keep it simple and clear."*

### 1.2 Jakob Nielsen (UX Tigers) — 2026 mid-year reality check

- **"The best AI UX is often invisible because the product already knows the context."** A generic chatbot asks the user to explain the job; a good workflow AI inherits the document, calendar, permissions, and norms before the user types a word.
- **"The winning interface is not necessarily the prettiest; it is the one that asks the fewest unnecessary questions."**
- **UX is becoming the moat:** "being the easiest, safest, and most deeply integrated model to use" beats being the smartest model for three months.
- **UX sits inside the scaling stack:** task analysis, error tolerance, memory design, and feedback loops are capability inputs, not polish.

### 1.3 General 2026 UX consensus (dev.family, UX Tigers predictions, NN/g)

- **Calm, predictable, familiar interfaces win.** "Users are tired of 'figuring out' design. They want to simply use the product."
- **Progressive disclosure** (NN/g): defer advanced/rarely-used features to secondary screens; makes apps easier to learn and less error-prone. Casual users aren't overwhelmed; regular users reach common functions fast; power users still get everything.

### 1.4 Power-user evidence (2026 tool guides + doc 83 code research)

- **AI coding-assistant buyer's guide (kilo.ai):** power-user primary needs = **speed, access to frontier models, tight cost control, and transparency** (buying direct from the provider "typically with the most transparency").
- **Cline positioning (builder.io):** "full transparency and control over every AI action, the flexibility to use any model" — this is the power-user value proposition, verbatim.
- **deepseek-harness (doc 83, code-verified):** runtime invariant **"model-visible means logged"** — power users trust a system that logs every model-visible effect.
- **openworker (doc 83, code-verified):** a **RiskClass × Mode permission matrix** and shell-operator disqualification — power users want fine-grained, understandable permission control, not a black box.
- **cc-switch (doc 83):** per-agent **provider-config writers** — power users manage many CLIs/models and want each configured precisely.
- **Raycast / Linear (design references):** keyboard-first, high-density, command-driven surfaces are the power-user baseline.

---

## 2. What casual users exactly want

| Need | What it means in the UI | EveryAIOS status |
| --- | --- | --- |
| **Trust without reading docs** | Plain-language state ("Safe & Private", "Ready · Local"), honest limitations, proof of what changed | ✅ landed (title badge, status pill, §9.1) |
| **Plain-language explanations** | "What the agent is doing" in consumer words, not "IronCalc recalc · 12K tokens" | ⚠️ now-doing strip still shows technical detail — needs consumer phrasing |
| **Moderate autonomy + visible control** | Approvals, pause/stop/reverse always reachable; never silent background action | ✅ designed (Guard-2, Pause/Resume, J-series) |
| **Ownership moment** | Let the user name their agent (Wharton: +20% adoption) | ⚠️ B9 has a name field but no deliberate "name your agent" moment |
| **Precise numbers in OUTPUT** | Deliverables carry exact figures/metrics (competence) — distinct from hiding chrome spend | ⚠️ not yet a stated rule |
| **Fewest unnecessary questions** | Inherit context (files, folder, session) so the user types once | ✅ designed (session context, workspace) |
| **Simplicity / calm** | One clear path; advanced surfaces hidden until needed | ✅ landed (casual rail, simplified composer, status pill) |
| **Outcome verbs, not jargon** | "Clean & balance this Excel sheet", not "Refresh Q3 numbers" | ✅ landed (casual prompts) |

## 3. What power users exactly want

| Need | What it means in the UI | EveryAIOS status |
| --- | --- | --- |
| **Full transparency** | Every effect visible: diffs, tickets, audit, replay, "model-visible means logged" | ✅ designed (J5 audit, tickets, audit view) |
| **Fine-grained control** | RiskClass × Mode permission matrix, per-agent tool/MCP/connector scoping | ✅ designed (openworker-style matrix, B9 scoping) |
| **Keyboard-first speed** | Complete shortcuts, command palette, dense lists | ⚠️ shortcuts exist but not audited for completeness |
| **Model/tool freedom** | Any model, BYOK/local, per-agent provider config | ✅ designed (A2/A6/A7, F12, P30 cc-switch steal) |
| **Cost control + budgets** | Live spend, caps, per-key breakdown | ✅ designed (P5, analytics) |
| **Customization / automation** | Custom agents, macros, workflows, automations as first-class | ✅ designed (B9, B2/B7, H22) |
| **Reproducibility / eval** | Replay, receipts, fixtures, simulation | ✅ designed (K-pillar, P28) |

## 4. Synthesis: the dual-mode contract

The two sets of needs are **complementary, not competing**. The contract:

1. **Casual mode answers "can I trust it and can I stop it?"** — plain state, plain explanations, approvals, pause/stop/reverse, outcome verbs, ownership.
2. **Power mode answers "can I see everything and control everything?"** — full transparency, fine-grained permissions, keyboard-first, model/tool freedom, cost, audit, extensibility.
3. **One toggle (`⌘.` / Settings → General → Mode) crosses the line.** Nothing is hidden from power users; nothing is forced on casual users.
4. **The same underlying engine serves both.** The difference is *surface*, not capability — which is precisely why the architecture (one ticket path, one audit, one executor) is the moat.

## 5. Concrete gaps this research exposes (→ TODO P32)

| # | Gap | Evidence | Fix |
| --- | --- | --- | --- |
| P32.1 | **Plain-language now-doing strip** — still shows "IronCalc recalc · 12K tokens" | Wharton: don't frame explanations as technical details | Now-doing strip + approval cards get consumer phrasing ("Updating your spreadsheet…", "This will change 1 paragraph") with technical detail behind a hover/expand |
| P32.2 | **Name-your-agent ownership moment** | Wharton: ownership → +20% adoption | B9 wizard step 1 makes the name deliberate ("Give your agent a name"); default agent gets a suggested name |
| P32.3 | **Precise-numbers-in-outputs rule** | Wharton: trust via precise metrics | Deliverable/artifact cards always show exact figures (cells changed, files touched, tokens) — not rounded chrome |
| P32.4 | **Honest-limitation surfacing** | Wharton: trust via defined limitations | When the agent can't do something, say so plainly + offer the nearest alternative (already §9.1 honest framing; make it a UI rule) |
| P32.5 | **Keyboard-first audit** | kilo.ai / Raycast / Linear | Sweep every action for a shortcut; add missing ones; keep `⌘.` mode toggle discoverable in the shortcuts overlay |
| P32.6 | **"Fewest questions" context inheritance** | Nielsen | First-run + casual: pre-fill folder/session context so the first ask needs no setup; onboarding already does this (ARCH/12 §4.0) — keep it enforced |

## 6. What we deliberately do NOT chase

- **Not** a "dumbed-down" casual mode that removes capability — casual hides surface, never capability.
- **Not** a warm/personable agent that over-promises — Wharton explicitly warns against overly friendly personalities; competence + honesty win.
- **Not** a power mode that requires reading docs — power users want *discoverable control* (shortcuts, palette, tooltips), not walls of settings.
- **Not** hiding the spend/tokens from power users — that's a casual-mode choice; power mode keeps the taxi meter because it's a control surface.

## References

[1]: https://ai.wharton.upenn.edu/wp-content/uploads/2026/04/Wharton-Blueprint-for-AI-Agent-Adoption.pdf "Wharton Blueprint for AI Agent Adoption (2026-04)"
[2]: https://knowledge.wharton.upenn.edu/special-report/wharton-blueprint-ai-agent-adoption/ "Wharton — Blueprint for AI Agent Adoption (HTML)"
[3]: https://jakobnielsenphd.substack.com/p/2026-predictions-halfway "Nielsen — 2026 AI and UX Predictions: Mid-Year Reality Check (2026-07)"
[4]: https://www.uxtigers.com/post/2026-predictions "Nielsen — 18 Predictions for 2026"
[5]: https://www.nngroup.com/articles/progressive-disclosure/ "NN/g — Progressive Disclosure"
[6]: https://dev.family/blog/article/uxui-ai-and-trends-that-actually-work-in-2026 "dev.family — UX/UI, AI and Trends That Actually Work in 2026"
[7]: https://kilo.ai/articles/ai-coding-assistant-buyers-guide "kilo.ai — AI Coding Assistant Buyer's Guide 2026"
[8]: https://www.builder.io/blog/best-ai-tools-2026 "builder.io — Best AI Coding Tools for Developers in 2026"
[9]: file:///home/ubuntu/upload/RESEARCH/desktop_app/83-competitor-batch-openworker-ccswitch-skales-dsh.md "EveryAIOS doc 83 — competitor batch (code-verified power-user patterns)"
