# 82 — Innovation Priority Stack (decision-applied: add / avoid / ignore / defer)

> **Source:** external scorecard provided 2026-08-17 — 23 capabilities rated on user pull / moat / leverage / complexity, 6 "must-win" bets, architecture gates A–E, and a features-to-decline list.
> **Method:** every row re-judged against the live repo (what is already built vs queued vs new), the benchmark (doc 80), and the moat roadmap (doc 81). Ratings below are **repo-grounded decisions**, not a re-scoring.
> **Repos:** 0 new — **ledger unchanged 281**.
> **Verdict:** the best *actionable* artifact of the four — ratings are accurate, Gates A–E equal the repo's real seams, and the decline list matches existing anti-features. Applied decisions: 4 build-now surfaces (all composition of existing engines), 3 foundational after the Stage-0 gate, ~10 deferred, 5 avoided/ignored. The six must-win bets = the K-pillar from doc 81 under a product-language name — endorse, with the single K3 reframe (competitors already ship "teach once").

---

## 1. Decisions (the table the team should execute against)

### 🔵 ADD NOW — build in the current cycle (all ride existing engines)

| Capability | Repo anchor (exists) | Net-new work | Why now |
|---|---|---|---|
| **One-Gesture Everything Capture** | snapshot/act/diff, clipboard tool (H26 post), file-open, browser capture, H27 resumable, H15 voice (deferred) | "Capture" verb surface + unified input belt | biggest casual-user win/lowest cost; the engines are done |
| **Intelligent Desktop Inbox** | notifications-popover (v2), memory-panel, P6.4 session-open proactivity hook (queued), tasks (P6.4), NowDoingStrip | compose "inbox" view over notifications+memory+tasks+proactive suggestions | ~70% exists; the four-verbs first screen needs it |
| **Do-It-With-Me autonomy gradient** | guard cards (`mcq-interrupt-card`), Cockpit Live/Paused states, estop, H2 | takeover/resume flow (P11.5.4, currently NOT DONE) + "repeat it" affordance | the wedge for non-technical users; machinery is built |
| **Deliverable Studio** | office engines D1–D4, artifact cards, H30/H31 queues (doc 68) | "produce a deck/report/workbook" output surface | **absorb H30/H31 into it** — one queue fewer; office correctness pre-req (own call, kept) |

### 🔵 FOUNDATIONAL — ADD ONLY AFTER THE EXECUTOR GATE (Gate A/B; = doc-80 conditions 1+5 = roadmap Stage 0)

| Item | Gate | Net-new beyond existing parts |
|---|---|---|
| **Proof-Carrying Work Receipts (K1)** | A + C | receipt schema/render/export/reproduction (Merkle P7.7 + GuardReceipt + EV1 + ledger exist) |
| **Reversible Cross-App Change Sets (K2)** | A + B | change-set coordinator + effect-class registry (doc-53 idempotency classes exist) + recovery UI |
| **Data Release Firewall (K5)** | A | policy engine, release receipts, redaction — **two zones (broker + OS-egress for ACP/MCP/browser), doc 81 §3.2** |

### 🟡 DEFER (ordered; each unlocks the next)

| Item | Holder | Unlock condition |
|---|---|---|
| Automation Simulator | — | **is Gate D itself** — build as fixtures/shadow runner with the compiler (reuses EV1/sandbox) |
| Contract & Claim Verifier | K3/K1 vertical | build only its cheap slice now (EV1 citation/claim check = research-credibility gate); full product H2 |
| Context Passports (K4 slim) | after K1 | passport worth more once receipts exist; C10 pass-by-ref is already in production |
| Deliverable-adjacent: Source-to-Decision Map | after receipts | it is a receipts renderer, not a system |
| Meeting-to-Momentum | H2 | blocked on F14/F15 + STT (post-v1) |
| Semantic Time Travel | H2–H3 | backend exists (E5 replay + office Snapshots + audit); product surface only after receipts compound |
| Workspace Branches | H2/H3 | needs worktree isolation first (P17 Superset queue) |
| Capability Sandbox/App Lab | power wedge | reuses automations-panel + blueprint editor — only as demand arrives |
| Team Review Rooms | after receipts+teams | correct where placed |
| Sovereign Team Mesh / Continuity Node / Work Graph-as-product | frontier/optional | never a hidden founder service (spec §8); work graph grows quietly via C6+SCIP |
| **Migration Concierge** | **re-sequenced: DEFER (narrow)** | original said "ship early, narrow" — a switching-tool polish, not a moat; keep only a single "import ChatGPT/Claude export" flow later; consent/credential risk is real |

### ⛔ AVOID / 🚫 IGNORE

| Item | Verdict | Reason |
|---|---|---|
| Bounded Digital Twin | **IGNORE** (their "frontier, sensitive") | pull is Low, not Medium; privacy-sensitive noise |
| Work Graph as product | AVOID standing program | grow C6 + SCIP quietly; expose only Passports (K4-slim) |
| Semantic Time Travel as product | AVOID v1–v2 | backend exists; promise only after receipts/reviews accumulate |
| Capability Sandbox as standalone | AVOID | already have automations-panel + blueprint editor |
| Their decline list (gen generators, image/video front-ends, connector-count marketing, silent autonomy, replacement browser, replacement IDE, recursive swarms) | ✅ endorsed | matches spec §8/§9 anti-features |
| + **Add to the decline list (2026-08-17):** "teach-once" as a novelty — OpenAI Record & Replay (2026-06-18) and Claude watch→skill ship it; our claim = zero-token local governed replay | ✅ | doc 81 §3.1 |
| + **Add:** "broadest control plane" marketing before Gates A/B (the benchmark §8 condition) | ✅ | doc 80 §4 |

---

## 2. The six must-win bets — endorsed (names adopted), one reframe

The bets are K1–K6 under a funnel naming. All six as written, except:

- **Personal automation learning loop ("Teach once…"):** reframe to *"Teach once — I do it forever, zero-token, locally, verified; repair is governed, never guessed."* **Two competitors already run the "teach once" story** (OpenAI Record & Replay 2026-06-18; Claude watch→skill 2026) — the defensible half is the OpenAdapt-proven deterministic local replay (§81.3.1), which also needs Gate D (simulator/fixtures).
- The other five bets map 1:1: Capture→finish (add-now surfaces) · Trusted action loop (K2/gates) · Portable context (K4-slim passports) · Private intelligence loop (K5) · Verified ecosystem loop (Gate E / K6).

---

## 3. Gates A–E — confirmed against the repo

| Gate | Repo state | Evidence |
|---|---|---|
| A — real authority (ticketed executor + durable event + visible result) | 🔴 OPEN | the tool-executor seam (spec §6 Remaining; TODO P6/P7) |
| B — real recovery (honest partial/uncertain effects, no duplicate) | 🟡 PART | E5 replay + office rollback + doc-53 idempotency classes built; change-set coordinator missing |
| C — receipts (outputs ↔ sources/tests/approvals/versions) | 🟡 PART | Merkle + GuardReceipt + EV1 + Trajectory exist; portable receipt primitive missing |
| D — simulation before autonomous execution (fixtures/shadow) | 🟡 PART | EV1 sandbox + script sandbox + blueprint dry-run exist; UI/fixture contract missing; **is the Automation Simulator row** |
| E — ecosystem trust (signed/pinned/tested/revocable before marketplace) | 🟡 PART | F8 pinning + RegistryPolicy + Guard-2 install exist; signatures/fixtures/quarantine missing (P22/P23/P26) |

**Conclusion:** Gates A and D are the two the scorecard adds beyond doc-80 §8 — keep them; their combination is exactly roadmap Stage 0.

---

## 📊 Summary

- The scorecard converts the K-pillar into an executable sequence correctly; ratings are honest (3 scores corrected: Bounded Digital Twin pull Medium→Low; Contract/Claim Verifier pull High→Medium without its EV1 slice; Migration Concierge re-sequenced to DEFER-narrow).
- Final order: **Gates A/B → ADD-now four (capture/inbox/do-with-me/deliverables) → K1+K2+K5 foundations → K3 flagship with recording-first → K4 passports → Gate E + K6 before marketplace → team/continuity optional**.
- Everything traces to one gate: the live ticketed executor (doc-80 cond. 1 · doc-81 Stage 0 · this doc Gate A).