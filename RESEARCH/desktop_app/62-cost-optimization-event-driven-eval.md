# 62 — Cost Optimization + Event-Driven Orchestration + Eval Reality Check

> **Pass:** user-supplied "cost optimization / autonomous IDE / orchestration" research, cross-checked and live-verified 2026-08-14 (web + GitHub API). **Ledger: unchanged at 255 repos — this pass adds 0 repos** (2 closed products WATCH, 2 papers, 2 unpinned repos, 1 unverifiable flag).
> **Thesis:** the *cost* problem is a **harness-design problem, not a provider problem** (Writer's CTO: "I cannot control the labs, but when I build the harness I have significant control"). Our spec already has the skeleton (A9 cache costs · A7 routing · J11 budgets · B6 iteration budgets); this pass upgrades it into a coherent **cache + routing + budget stack** without inventing new rows.

---

## 0. Verdicts at a glance

| Item | Reality (verified) | Verdict → row |
|---|---|---|
| **Ara** (self-driving IDE) | Real — YC P26, `ara.so`, @aradotso; **closed-source** (no repo) | **WATCH** — competitive; "repo memory" + "mission control" already = I7/C6 + H19/H20 |
| **Clairvoyance** (Stardock) | Real — Stardock, Feb 2026, free desktop app, `clairvoyanceai.com`; **closed-source** | **WATCH** — "persistent staff" persona metaphor → B3 + per-agent memory (agent-binding, doc 60); **no new H29 row** |
| **Murakkab** (MIT+Microsoft) | Real — OSDI 2026 paper (arXiv 2508.18298); **GPU 2.8× / energy 3.7× / cost 4.3×** | **REF** — dynamic intent-driven allocation; ⚠️ cloud cluster multiplexing, we're single-machine |
| **NeMo Switchyard + LangChain** | Real — LangChain blog `switchyard-agent-routing-benchmark`: **145 tasks, 7% frontier calls, 74% cheaper, 6pts less accurate** (Ramp: 58% cheaper) | **STEAL-pattern** → A7 (upgrades doc 61's "no distinct repo" note) |
| **OpenCastor** | Real (HN leaderboard, harness evaluator) — exact repo unpinned via API | **REF** — `lower_cost` profile shape → J11/B6 |
| **MongoDB managed MCP** | Real product (30k installs/wk, vendor-reported) — repo unpinned | **REF** → F6 (consume live-data MCP; **F15 already = Calendar, no new row**) |
| **PromptThin** | **404 — unverifiable** | ⚠️ **never cite** |
| Writer 41%/44% · security 40-62%/83% · SWE-bench-Pro 23% · OpenAI Feb-2026 · Anthropic trends · plan-cache 50.31% | plausible but **vendor-reported / unaudited** | note as rationale, **flag "verify before citing as fact"** (doc 51 doctrine) |

---

## 1. The 3-layer cache stack (A9 upgrade — the single biggest lever)

A well-tuned cache stack is the dominant cost lever in 2026 (60–70% reduction at scale). Our A9 already tracks `cache_read/cache_write/$`; this pass specifies the **three layers + invalidation**:

| Layer | What | Reduction | Our implementation |
|---|---|---|---|
| **Prompt cache** | reorder static prefix (system prompt, tool defs) first so repeated prefixes hit the provider cache | ~50% on cached input tokens | provider-specific markers: Anthropic `cache_control: {type:"ephemeral"}` on the last static block; OpenAI auto-cache at ≥1024-token prefixes (128-token granularity) — **not one-size-fits-all** |
| **Semantic cache** | embed the request, return a cached response when meaning matches | 20–40% (no model call) | local vector (no Redis), similarity ≈ 0.92 (0.80 false-hits, 0.98 misses), TTL 7d std / 24h time-sensitive |
| **Result cache** | key full input signature → stored final output | 10–25% (no model call) | TTL 3d, **dependency tagging** — each entry records its data sources; purge only tagged entries on source change |

**Plan cache (B2):** separate from semantic cache — extract + index the *plan* by task signature, match new tasks before fresh planning inference (50.31% cost reduction for plan-act agents; threshold ~0.85, `~/.everyaios/plans.db`, version-based invalidation).

**Key discipline:** cache must never serve stale data into a mutation path — result/semantic cache is **read-only-intent only**; anything that touches the vault/browser/files bypasses it (same rule as our idempotency classes, doc 53 §4).

---

## 2. Model routing is the second lever (A7 — verified)

LangChain's benchmark (verified, Aug 2026): routing **Nemotron 3.5 Lightning (executor) + Claude Opus (frontier, 7% of calls)** via **NeMo Switchyard** cut cost **74%** across 145 multi-turn tasks for a **6-point** accuracy drop (frontier traffic ranged 4.1–9.1% across runs — budget for a *range*, not a number; Opus ≈ 87× Nemotron per-call). This is the concrete proof of our A7 asymmetric-tiering design (doc 53 §5 shortest-path routing): **frontier for planning/judgment, cheap MoE for bulk execution.** Escalation is a floor, not a default.

---

## 3. Event-driven orchestration (B7) + 4 topologies (B3/B4)

**B7 upgrade (Gartner 2026):** beyond cron/interval, agents wake on *observability* signals — CI build failure, test regression, repo change (push/PR/issue), ticket assignment (Jira/Linear), telemetry threshold (error spike, perf regression). Policy controls for scope + frequency. (Ara/Clairvoyance's autonomous-loop products are the commercial proof.)

**B3/B4 — 4 orchestration topologies (textbook MAS taxonomy):** Centralized (orchestrator-routed, auditable) · Independent (parallel, no cross-check) · Decentralized (peer-to-peer, consensus) · Hybrid (orchestrator + direct agent links). Our doc-53 "shortest-path, no mandatory multi-agent pipeline" stands; topology selection is a **config option**, not a v1 rewrite — Centralized is our default (auditability), the others are reference only.

**"Agent staff" personas (Clairvoyance):** persistent per-agent identity with its own knowledge base + notes, surviving sessions. Maps to **B3 sub-agents + doc-60 agent-loadout + I6 agent-binding** — a UX/metaphor layer over memory we already specified, **not a new H29 row**.

---

## 4. Eval reality check + security rationale (QA phase, J2/J3/J11)

- **SWE-bench Verified is a weak frontier indicator** (OpenAI, Feb 2026: contamination + flawed test cases; SWE-bench Pro drops GPT-5/Opus-4.1 to ~23% vs 80%+ on Verified). ⚠️ vendor-reported exact % — verify before citing. **Action: an internal eval harness calibrated to our own codebase/task distribution (P7/P11), not public-benchmark scores.** This is already the 🔁 "retest on desktop" doctrine — public benchmarks become *sanity checks*, never release gates.
- **Cost variance is 50–150×** between easy and hard tasks → per-task budgets (J11) are the only sane control. **Action: add the OpenCastor `lower_cost` profile shape** — `cost_gate_usd` / `thinking_budget` (1K) / `context_budget` (8K) / `max_iterations` (6) — as a named profile beside the $2.00/agent default.
- **Security:** "40–62% of AI-generated code has vulnerabilities" + "83% say traditional tools are inadequate" (⚠️ vendor-reported) is *rationale* for our J2/J3 dual-guard — already essential, no change.

---

## 5. Unverifiable flag

**PromptThin** ("proxy layer, /predict-savings endpoint") — GitHub API 404. The *pattern* (a transparent token-saving proxy with a pre-call savings estimate) is a fine post-v1 idea, but **never cite PromptThin**; attribute the pattern to the general cache-stack literature instead.

---

## 6. Steal → code mapping (reimplement, none vendor; 0 new ledger repos)

| # | From | To | Action |
|---|---|---|---|
| 1 | 3-layer cache stack (technique) | A9 | prompt cache (provider markers) + semantic cache (local vector, ~0.92) + result cache (dependency tagging); read-only-intent only |
| 2 | plan-cache research | B2 | index plans by task signature, ~0.85 threshold, version-based invalidation |
| 3 | LangChain + NeMo Switchyard (verified) | A7 | cite 74%/7%/145-task benchmark as A7's proof; escalate by floor not default |
| 4 | Gartner event-driven | B7 | trigger taxonomy: CI/test/repo/ticket/telemetry + policy controls |
| 5 | OpenCastor `lower_cost` | J11/B6 | named cost profile (cost_gate/thinking/context/max_iterations) |
| 6 | MongoDB managed MCP | F6 | live-data MCP = consume-path only (F15 already = Calendar) |
| 7 | Murakkab (paper) | P7/P8 | dynamic intent-driven allocation principle; ⚠️ cloud-cluster scope |
| 8 | Ara / Clairvoyance (closed) | — | WATCH only; competitive + persona UX reference |
| 9 | SWE-bench reality check | P7/P11 | internal eval harness, benchmarks = sanity check only |

**Ledger: 255 repos (unchanged).** No new GitHub repos — closed products (Ara, Clairvoyance) + papers (Murakkab, LangChain) + unpinned (OpenCastor, MongoDB MCP) + 1 unverifiable (PromptThin).
