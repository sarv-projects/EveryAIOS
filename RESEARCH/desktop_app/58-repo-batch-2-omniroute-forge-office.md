# 58 — Repo Batch 2: OmniRoute + Forge-intel + Office + Skills + Agent-workspaces

> Added 2026-08-13 on user request (44-repo list). All repos **live-verified** via GitHub API 2026-08-13 (⭐ + SPDX license + `pushed_at`). Cross-referenced against docs 01–57 first: anything-llm (01), hermes-agent (02/38), MetaGPT (03/18/26), headroom (22/31), khoj (21/23), agentmemory (21/23), nanobot (23), websurfx (52), Vane (35), steel-browser/agent-browser (55), cherry-studio (18), jan (08/24), leon-ai (18), py-gpt (18), Agent-Reach (23/31), UI-TARS-desktop (48), google-ai-mode-scraper/oxylabs (23/31), local-deep-research (07) are **already covered** — not repeated here.
>
> **New here (21 repos):** OmniRoute · better-harness · GenericAgent · crux · taste-skill · codebase-memory-mcp · univer · ppt-master · guizang-ppt-skill · holaOS · QwenPaw · worldmonitor · llmfit · deepwiki-open · DeepSeek-TUI (correction) · huginn · microsoft/agent-framework (deep-dive fill) · unsloth · coolify · awesome-rust · google-ai-mode-mcp.
>
> **Depth tags:** ⬛ = source/README read this pass · 🟦 = structure verified · 🟩 = README feature map · ⚪ = one-line. **Verdict per repo:** STEAL / ADAPT / REF / IGNORE, mapped to SPEC capability IDs.

---

## 1. OmniRoute — the provider-catalog + routing goldmine ⭐⭐ STEAL

| Repo | ⭐ | License | Pushed | Verdict |
|---|---|---|---|---|
| diegosouzapw/OmniRoute | 46,937 | MIT | 2026-08-13 | **STEAL (A1/A2/A3/A4/A6/A7/A9/P6.10/J6)** |

**What it is.** Free MIT local AI gateway + dashboard (Next.js): one OpenAI-compatible endpoint (`/v1/*`) in front of **339 providers (90+ free), 1200+ models**, aggregating ~1.51B free tokens/month of documented free tiers into one live number (`/dashboard/free-tiers`). Works with Claude Code, Codex, Cursor, OpenCode, Cline, Copilot, Aider, and 25+ CLIs via one config.

**Why it matters to us.** It is the **single richest, already-machine-readable source for the exact layer we built P1 on** (A1 multi-provider BYOK, A4 OAuth subscriptions, A6 model catalog). `src/shared/constants/providers.ts` auto-generates `docs/reference/PROVIDER_REFERENCE.md` (**339 providers, v3.8.50 — 2026-08-12**; v3.8.49 was 290). Our A6 catalog is 15 providers / 280 models — OmniRoute's is 339 / 1200+ with per-provider **category, alias, auth flow, tool-calling mode (native/emulated/none), and free-tier status**. **→ Full source-level deep-dive in doc 59 (13-factor scoring weights, mode packs, budget headers, 19 strategies, steal→code mapping).**

### 1.1 The provider catalog — category taxonomy (steal the *list*, not the code)

OmniRoute classifies every provider; this is a better taxonomy than our flat `DEFAULT_BASE_URLS` map:

| Category | Count | Examples (new-to-us) | Our mapping |
|---|---|---|---|
| **No-auth / keyless** | 10 | AI Horde, DuckDuckGo AI Chat, Felo, OpenCode Free, Auggie CLI (spawn), Devin CLI bridge | ADAPT a few (documented public OpenAI-compat + local spawn); reject reverse-engineered chatbots (Chipotle, MiMo, …) |
| **OAuth** | 25 | Antigravity CLI, Amazon Q, Claude Code, Cline/ClinePass, Codex, Cursor, Devin CLI, GitHub Copilot (+ GHE), GitLab Duo, Grok Build, Kilo Code, Kimi Code, Kiro, Qoder, Trae (ByteDance SOLO), Windsurf, Zed (+ Zed-hosted), Raycast | **Do NOT ingest tokens into broker** — drive official CLIs via F12/J17 ACP (doc 57 "who calls the model" test) |
| **Web cookie** | 34 | ChatGPT Web, Claude Web, Gemini Web, Grok Web, Kimi Web, Qwen Web, Perplexity, Poe, v0, Notion AI, Muse/Meta AI, Hailuo/MiniMax, Yuanbao, Z.ai, huggingchat, lmarena | ⚠️ **Reject entirely** — same ToS class as our A4 ChatGPT unofficial backend (doc 57) |
| **API key (paid/free-credit)** | ~228 | 360 AI, Aion, Ant Ling, b.ai, Baichuan, Bailian, BluesMinds, BytePlus/Ark, Cerebras, Charm Hyper, … | **STEAL the catalog as data** — id/alias/base URL/tool-calling tag/free-tier note → A1/A6 long tail |
| **Local** | ~11 | Ollama, LM Studio, vLLM | A5 |
| **Search** | — | web search providers | G1/G3 |
| **Audio** | — | TTS/STT (EdgeTTS, Whisper) | H28/A10 |
| **Upstream proxy** | — | Cheaper Inference, AgentRouter, OpenRouter | A1 (aggregator) |
| **Cloud agent** | — | Codex Cloud, Devin, Jules | F12 (cloud harness) |
| **System** | — | loopback/internal | n/a |

**Action (sharpened):** do **not** add all 339 into the broker. Import only **documented API-key + local + a short allow-list of keyless OpenAI-compat** as A6 catalog data (id/alias/base URL/tool-calling tag/free-tier note). The ~34 cookie + ~25 OAuth-CLI providers are the **doc-57 landmine list** — Claude Code/Codex/Copilot/Grok Build belong on **F12/J17 via ACP**, not in the vault. The `PROVIDER_REFERENCE.md` is MIT and generated; the two sections to grep are literally titled "OAuth Providers" and "Web Cookie Providers" — treat them as the reject list, not the import list.

### 1.2 Routing strategy taxonomy (19 strategies) — steal for A7/P6.10

Our A7 asymmetric tiering has planner/subagent/depth/concurrency; P6.10 has "shortest-path". OmniRoute's 19 named strategies are a cleaner vocabulary:

`priority` · `fill-first` · `weighted` · `round-robin` · `p2c` (power-of-two) · `least-used` · `random` · `strict-random` · `cost-optimized` · `headroom` (most remaining quota) · `reset-window` · `reset-aware` · `context-relay` (hand off context across targets) · `context-optimized` · `cache-optimized` (pin prefix to same account → maximize prompt-cache hits) · `lkgp` (last-known-good-path, sticky) · `auto` (14-factor live scoring) · `fusion` (fan-out to panel + judge synthesizes) · `pipeline` (chain steps).

**Steal directly for P6.10 / A3:**
- **`cache-optimized`** = route a request back to the connection holding the cached prompt prefix. This is a *concrete* answer to our A9 cache-aware costs (cache_read/cache_write) — pin key per prompt-prefix.
- **`lkgp`** = our A3 failover's missing "sticky to last good provider" default (we rotate on 429; we don't yet *prefer* the last-good path).
- **`fusion`** (panel + judge) = a concrete recipe for our "oracle/review pass" (P11.5.10).
- **`headroom` / `reset-aware`** = quota-aware scheduling (their roadmap item) — exactly what our per-key budgets (A2) should use to pick *which* key serves.

### 1.3 Auto-Combo 14-factor scoring — steal for A7 router

Their `auto/*` combos (`auto`, `auto/coding`, `auto/fast`, `auto/cheap`, `auto/offline`, `auto/smart`) score every candidate on **14 factors** (health, quota, cost, latency, success-rate, freshness…). This is a superset of our A6 "capability hints" + A3 health — worth one paragraph in ARCH/03 or ARCH/05, not a port.

### 1.4 The ToS line — do NOT copy the web-cookie providers blindly

31 "web cookie" providers wrap provider web apps (ChatGPT Web, Claude Web, Gemini Web…) via cookie auth. **This is the exact class doc 57 §3 flagged:** harvesting a subscription's web session to power other calls. Our standing decision (decision 9, ARCH/03 §3.2) already covers the analogous `chatgpt-pro` backend-api path: **keep it user-driven + flag-gated + ToS-noted, never market it**. OmniRoute being MIT does not change that policy. **Steal the routing/taxonomy/catalog; keep our own auth-policy discipline.** (Same for the 23 OAuth providers — importing a *provider* is fine; harvesting a *subscription web session* stays under the doc-57 rule.)

### 1.5 Misc steals worth noting
- **RTK + Caveman compression** (15–95% token savings, 12 pluggable engines) — overlaps doc 20/23 `rtk` + doc 31 compaction; confirms the per-command output-compression layer.
- **Prompt-injection guard on every route + opt-in credential-masking** — mirrors our J6 / ARCH/06 §6.15.
- **`X-OmniRoute-Decision` header** (strategy/provider/latency per response) — trivial, cheap observability we should mirror on the broker.

---

## 2. Code intelligence for agents (RepoMap complements) — ADAPT

| Repo | ⭐ | License | Verdict |
|---|---|---|---|
| DeusData/codebase-memory-mcp | 38,771 | MIT | **ADAPT (I7 / C6)** |
| pedr0v/crux | 2 | MIT | **REF (I7)** — brand-new (pushed 08-12) |

**codebase-memory-mcp** — "high-performance code intelligence MCP server": **pure C**, single static binary, **158 tree-sitter languages + Hybrid LSP for ~10**, **15 MCP tools**, in-memory **SQLite + FTS5**, bundled **nomic-embed-code** (no Ollama), 3D graph UI on `localhost:9749`, arXiv **2603.27277** (83% quality / 10× fewer tokens / 2.1× fewer tool-calls over 31 repos — vendor claim). Indexes a codebase into a **persistent knowledge graph** for structural questions. **⚠️ Its installer writes Claude/Codex/OpenCode configs — we'd spawn it ourselves (Obscura pattern) and Guard-2 any config write, never run their installer.** This is the *graph* answer to the same problem our **I7 RepoMap** solves with tree-sitter + PageRank. Two complementary reads:
- RepoMap = deterministic, zero-embedding, budget-fitted context selection (already our plan, doc 46/56).
- codebase-memory-mcp = a **symbol/reference knowledge graph** you query instead of reading files — closer to a *persistent* C6/C12 code-KG.

**Steal idea (not a port):** I7 is one crate with two query paths (deterministic RepoMap + optional Warp semantic index, doc 56). A **third path — a symbol-reference KG for "where is X" queries** — is what this repo proves users want (38K⭐ is demand signal). Keep it on the I7 long tail; do not fork a second index now.

**crux** — 2⭐, Rust, created 2026-08-12 (days old). **SCIP-backed MCP**: tools `scip_index / scip_map / scip_search / scip_def / scip_refs / scip_outline / scip_callers / scip_dead` (needs language indexers scip-typescript/rust-analyzer/…). Their own A/B: −33% tokens on a 601-file TS repo, −64% on caller graphs; they admit grep is enough under ~200 files. Commercial twin Halv adds hosted multi-repo cache (skip — MIT crux only). **Watch, don't depend** — too new. (Name-collision note: `redbadger/crux` = Rust cross-platform app framework; `mehdiforoozandeh/crux` = research lab notebook — neither relevant.)

---

## 3. Forge & harness — ADAPT / REF

| Repo | ⭐ | License | Verdict |
|---|---|---|---|
| QoderAI/better-harness | 1,825 | MIT | **ADAPT (I5 / P7.1)** |
| lsdefine/GenericAgent | 13,760 | MIT | **ADAPT (I2 / B8)** |
| microsoft/agent-framework (MAF) | 12,769 | MIT | **REF (B2/B3/B4)** |
| AlexsJones/llmfit | 31,380 | MIT | **ADAPT (A5 / A6)** |
| AsyncFuncAI/deepwiki-open | 17,637 | MIT | **REF (I7 / docs skill)** |

**better-harness (QoderAI)** — "Harness Engineering": a plugin (not an agent) that audits the work loop of Claude Code / Codex / Cursor / Copilot / Qwen / Pi / Kimi / Grok across **five dimensions — Task Understanding → Controlled Execution → Change Validation → Reliable Delivery → Learning Capture** — and outputs HTML + Markdown + `findings.json`; **missing evidence stays explicit** (their best idea: never infer what wasn't observed). **This is our I5 ECC guardrails ("plan-before-build, session scanning") turned into a productized loop-audit.** Steal the concept for **F12 + H2**: after an ACP session, emit the same evidence-bounded loop report from our existing audit NDJSON. Don't vendor their per-host adapter matrix.

**GenericAgent (lsdefine)** — self-evolving agent, **~3K lines core**, **9 atomic tools + ~100-line loop (`agent_loop.py`)**, **memory tiers L0–L4**, grows a **skill tree** on every solved task (browser/terminal/filesystem/keyboard/mouse/vision/ADB-mobile). Real Chrome via **TMWebdriver (extension + WebSocket), not Playwright**; arXiv **2604.17091**. This is the *minimal* proof of our I2 skill registry + B8 crystallization. **Steal the discipline only:** (a) a ~100-line loop = every capability is a *tool*, not logic-in-loop; (b) skill tree = our `~/.everyaios/skills/` + ownership markers. **Do NOT adopt as the runtime** — its `code_run` can install packages and drive WeChat/Alipay (full OS control); that's exactly what our dual-guard + shortest-path exist to prevent. Its computer-use is E9-class → post-v1.

**microsoft/agent-framework (MAF)** — AutoGen + Semantic Kernel merged (Oct 2025) into one multi-language (.NET + Python) framework, A2A + MCP. Fill for the doc 22/50 "noted only" rows: it's enterprise, heavyweight, cloud-oriented. **REF** — confirms our B-section direction (sub-agents, multi-agent, MCP) but we deliberately rejected the mandatory multi-agent pipeline (doc 53 §5 shortest-path). No steal.

**llmfit (AlexsJones)** — **Rust CLI/TUI** that detects hardware (RAM/CPU/GPU) and **scores models across quality/speed/fit/context** (GGUF / MLX / Unsloth weights; Q4_K_M ≈ 0.5 bytes/param heuristic) across runtimes **Ollama · llama.cpp · MLX · Docker Model Runner · LM Studio**. **`llmfit recommend --json`** is the integration surface. **Steal the scoring model for A5/P1.9:** our local-model path (A5) warns on <15–20K context but doesn't *fit model → hardware* before spawn. Rust = our stack; 31K⭐ = real demand. Not a trainer — unsloth stays out of scope.

**deepwiki-open** — open-source DeepWiki: analyze a repo's structure → generate wiki docs + diagrams, terminal/browser. **REF** — we already source-read Warp's `ai` crate (doc 56 W1) which does incremental codebase indexing; this is the *product* version of "docs for any repo". Long-tail: a "generate repo wiki" skill for the Forge.

---

## 4. Office & PPT — ADAPT (Univer) / STEAL-skill (ppt-master) / REF (guizang)

| Repo | ⭐ | License | Verdict |
|---|---|---|---|
| dream-num/univer | 14,097 | Apache-2.0 | **ADAPT (P4.2 / P4.3 / H5)** |
| hugohe3/ppt-master | 46,294 | MIT | **STEAL-skill (D3/P4.3)** |
| op7418/guizang-ppt-skill | 23,921 | AGPL-3.0 | **REF/learn-don't-copy (D3/P4.3/H25)** |

**univer (dream-num)** — full-stack **SDK for building office apps inside your product**: Sheets + Docs + Slides, **canvas renderer + formula engine, plugin/preset architecture, same Facade API in browser and Node** (headless for agents). ⚠️ **OSS/Pro split:** Sheets = mature; Docs = usable; **Slides OSS is still early** — import/export, charts, collab are Pro/commercial. Don't assume xlsx/pptx import exists in `@univerjs/*`. Plus `univer-mcp` + `univer-sdk-skills` (agent-facing) and a DreamNum Pro offering with **Git-style diffs/reviews/rollbacks for spreadsheets**.

**The design call (this is the important part):** Univer is the *missing editor surface*, not a replacement for surgical zip-part patching — Pro import/export would reintroduce the "lossy re-serialize" problem ARCH/04 rejected vs LibreOffice. Split:
- **User sees / clicks / live grid** → Univer in H5 tabs (Sheets first, Docs next, Slides last)
- **Agent mutates existing OOXML byte-stably** → our GenOffice-style patch + IronCalc planner (D1–D3)
- **Headless formula / range ops** → pick ONE calc engine (Univer Node or IronCalc), don't run both as truth

**Steal:** (a) Univer as the H5 office UI engine (Apache-2.0, no AGPL problem); (b) **Git-style diff/rollback** = D7 validation; (c) `univer-mcp` = ready reference for G4 REPL + D2. No new matrix row — Univer is "how we implement H5", ppt-master is "how we implement D3 generate".

**ppt-master (hugohe3)** — 46K⭐ skill: AI turns PDF/DOCX/URL/Markdown into a **natively editable PPTX** — real shapes, transitions, animations, data-backed charts, speaker notes — *not images*. A SKILL.md workflow that runs inside Claude Code/Cursor/Copilot. **STEAL the approach for D3/P4.3:** our PPT engine (surgical OOXML part editing) should expose the same contract — "reason the argument first, then emit native shapes + charts". The skill's SKILL.md is MIT and is a direct reference for our I2 skill format + P4.3 implementation plan.

**guizang-ppt-skill (op7418)** — 23.9K⭐, **AGPL-3.0** (learn-don't-copy, same rule as agent-browser/obscura). Generates **single-file HTML slide decks** (editorial/Swiss layouts, image prompts, social covers, WebGL/low-power presenter mode). This is the *other* PPT philosophy: HTML deck vs native PPTX. **REF** — confirms there are two valid outputs; our D3 = native OOXML (fidelity), but an HTML-deck path is a cheap H25 generative-UI showcase. Pattern only (AGPL).

---

## 5. Skills & taste — STEAL-skill (I2, NOT C9)

| Repo | ⭐ | License | Verdict |
|---|---|---|---|
| Leonxlnx/taste-skill | 76,101 | MIT | **STEAL-skill (I2 / H25 / P11)** |

**taste-skill** — 76K⭐ "anti-slop" frontend skill: SKILL.md instruction files (layout, typography, motion, spacing, image-to-code, redesign, soft/minimalist/brutalist) that guide Cursor/Claude Code/Codex/Copilot to ship non-generic interfaces. Dial-driven (VARIANCE / MOTION / DENSITY 1–10), not learned. The key quote: it **"turns taste into portable agent behavior"**.

**⚠️ Do NOT merge with C9 — they are different things (update doc 37):**
| | C9 / doc 37 (Command Code taste-1) | taste-skill (Leonxlnx) |
|---|---|---|
| What | **Learns coding prefs** from accept/reject/edit → rules (algorithm #31) | **Static frontend design** SKILL.md pack |
| Store | `~/.everyaios/taste/` + confidence scores | Copied SKILL.md files |
| Learns? | Yes | No — dials only |
| Job | How we *write code* | How generated *UI looks* (anti-slop) |

**Verdict:** ship as an **optional first-party I2 skill** (via our `~/.everyaios/skills/`); it does **not** replace algorithm #31. Add the one-page C9-vs-taste-skill split to doc 37 so nobody files "C9 done because we added a SKILL.md".

---

## 6. Agent workspaces / competitors — WATCH + ADAPT (UX)

| Repo | ⭐ | License | Verdict |
|---|---|---|---|
| holaboss-ai/holaOS | 6,093 | ⚠️ Modified Apache-2.0 | **WATCH (whole-product competitor)** |
| agentscope-ai/QwenPaw | 33,748 | Apache-2.0 | **REF (F13 / agent workspace)** |
| Decentralised-AI/DeepSeek-TUI | 4 | MIT | **CORRECTION** |

**holaOS** — "The Computer for You and Your Agent": **Electron** workspace running Claude Code, Codex, or a built-in agent across **HolaApps** (live Notion/browser/etc. beside the agent), a marketplace, MCP, **50+ OAuth integrations**, real browser, `.xlsx/.pptx/.docx` deliverables, **Feishu/WeChat/Slack/Telegram** bridges, automations. ⚠️ **Default models are hosted (Kimi K3 / GLM / GPT / Claude) + optional BYOK — the opposite of our "no founder server" rule.** ⚠️ **License = "Modified Apache 2.0" (GitHub NOASSERTION): commercial use allowed, but hosted/SaaS or embedded-in-a-sold-product requires a paid license; internal single-org is free.**

**This is the closest public articulation of our product thesis** — a control-plane workspace over external agents + tools, not a new agent. **Verdict: WATCH/REFERENCE-UX only.** Steal the *shape* (side-by-side live app + agent, marketplace, "real surfaces not chat") to validate ARCH/12 + F12; it's also the **P12 competitor page**, not a code source. Do NOT copy code or the integrations list (license + their hosted-model default is our explicit non-goal). **2026-09-04 refresh (doc 86):** 11.1K★ (+5K/mo); now "100+ integrations"; hosted-frontier default + holaProxy credit meter on ALL integration calls even BYOK + Stripe Connect commission + commercial-gated license; steal the workspace UX (side-by-side drive-visible, Combos, Hub recipes), never the toll.

**QwenPaw (agentscope-ai)** — "Qwen Personal Agent Workstation": local/cloud personal assistant, 10+ channels, extensible capabilities, "works for you, grows with you". From the AgentScope team (production agent framework). **REF** — channel architecture (→ F13 desktop-first scoping) + the personal-assistant growth loop; overlaps OpenClaw/nanobot already covered.

**DeepSeek-TUI — CORRECTION (verified 2026-08-13).** The `Decentralised-AI/DeepSeek-TUI` URL is a **4⭐ stale fork**. The canonical repo is **`Hmbown/CodeWhale`** (40,724⭐, Rust, MIT, pushed 2026-08-13, "community-driven agent harness" — the DeepSeek-TUI project renamed/rebranded to CodeWhale). Plan mode, file edit, shell, git, MCP, sub-agents. It's an **F12 harness candidate** (drive via ACP, same as any harness); no other doc change.

---

## 7. Research / automation — ADAPT (worldmonitor) / REF (huginn)

| Repo | ⭐ | License | Verdict |
|---|---|---|---|
| koala73/worldmonitor | 81,424 | AGPL-3.0 | **ADAPT-idea (G2 / H17 / P3)** |
| huginn/huginn | 49,784 | MIT | **REF (B7 / B8 / F13)** |

**worldmonitor** — 81K⭐ "real-time global intelligence dashboard": AI-powered news aggregation, geopolitical monitoring, infrastructure tracking in a unified situational-awareness interface. ⚠️ **License = GNU AGPL-3.0 (the GNU long-form header makes GitHub report "NOASSERTION", but it is AGPL-3.0)** → learn-don't-copy, same rule as agent-browser/obscura. **ADAPT the idea only:** it's a *productized* version of our G2 deep-research + G8 tiered-search + H17 widget cards — the "situational awareness" cockpit is a strong pattern for P3 (Cockpit/Audit UI). No code steal (copyleft + domain mismatch).

**huginn** — 49.8K⭐, the classic self-hosted agent/automation system (Ruby): agents that monitor + act, event→trigger→workflow, JSON HTTP interface. The *ancestor* of B7 scheduled tasks + B8 crystallization + F13 bridges. **REF** — pattern only (Ruby, 2013-era, no LLM): the "agent = read source + watch for events + act" model is what our B7 cron/event/webhook + nudge sentinels formalize. Confirms we don't need it; note it as the historical root.

---

## 8. IGNORE (no action)

| Repo | ⭐ | Why ignore |
|---|---|---|
| unslothai/unsloth | 70,756 | LLM fine-tuning library (vLLM-based). Not a desktop-app concern. |
| coollabsio/coolify | 60,491 | Self-hosted PaaS/deploy tool (VPS orchestration). No relevance. |
| rust-unofficial/awesome-rust | (list) | Curated crate list — use as a *reference* when picking crates, not a research doc. |
| scrapeless-ai/google-ai-mode-scraper | — | Paid AI-mode scraper API — duplicate of oxylabs/google-ai-mode-scraper (already in doc 23/31). |
| PleasePrompto/google-ai-mode-mcp | 147 | Tiny MCP wrapper for the above; G1/G3 long-tail only. |

---

## 9. Verdict summary

| Repo | ⭐ | License | Verdict | Capability |
|---|---|---|---|---|
| diegosouzapw/OmniRoute | 46,937 | MIT | **STEAL** | A1/A2/A3/A4/A6/A7/A9/P6.10/J6 |
| Leonxlnx/taste-skill | 76,101 | MIT | **STEAL-skill** | I2/H25/P11 (≠ C9) |
| hugohe3/ppt-master | 46,294 | MIT | **STEAL-skill** | D3/P4.3 |
| DeusData/codebase-memory-mcp | 38,771 | MIT | ADAPT | I7/C6 |
| dream-num/univer | 14,097 | Apache-2.0 | ADAPT | P4.2/P4.3/H5 |
| AlexsJones/llmfit | 31,380 | MIT | ADAPT | A5/A6 |
| lsdefine/GenericAgent | 13,760 | MIT | ADAPT | I2/B8 |
| QoderAI/better-harness | 1,825 | MIT | ADAPT | I5/P7.1 |
| koala73/worldmonitor | 81,424 | AGPL-3.0 | ADAPT-idea | G2/H17/P3 |
| op7418/guizang-ppt-skill | 23,921 | AGPL-3.0 | REF (learn-don't-copy) | D3/H25 |
| microsoft/agent-framework | 12,769 | MIT | REF | B2/B3/B4 |
| agentscope-ai/QwenPaw | 33,748 | Apache-2.0 | REF | F13 |
| AsyncFuncAI/deepwiki-open | 17,637 | MIT | REF | I7/docs |
| huginn/huginn | 49,784 | MIT | REF | B7/B8/F13 |
| pedr0v/crux | 2 | MIT | REF (too new) | I7 |
| holaboss-ai/holaOS | 6,093 | ⚠️ Modified Apache-2.0 | **WATCH** | whole-product |
| Decentralised-AI/DeepSeek-TUI | 4 | MIT | CORRECTION | F12 (→ Hmbown/CodeWhale 40,724⭐) |
| unsloth · coolify · awesome-rust · scrapeless · google-ai-mode-mcp | — | — | IGNORE | — |

**Ledger: 227 → 246** (19 new: OmniRoute, better-harness, GenericAgent, crux, taste-skill, codebase-memory-mcp, univer, ppt-master, guizang-ppt-skill, holaOS, QwenPaw, worldmonitor, llmfit, deepwiki-open, huginn, microsoft/agent-framework, unsloth, coolify, **Hmbown/CodeWhale** — + google-ai-mode-mcp listed, not counted as new research value).

---

## 10. What changes in SPEC/ARCH/TODO (recommended, not yet applied)

1. **A6 catalog long-tail** — ingest OmniRoute's **API-key + local + keyless allow-list** (not the cookie/OAuth classes) as A6 reference data. No code dependency; `PROVIDER_REFERENCE.md` (MIT, generated) is the source. **Do not add all 339 — the ~34 cookie + ~25 OAuth-CLI providers are the doc-57 reject list.**
2. **A4 / F12** — the OAuth CLIs (Claude Code, Codex, Copilot, Grok Build, Cursor…) stay on **F12/J17 via ACP**, not in the vault. New *candidates* only (Amazon Q, GitLab Duo, Kiro ⚠️-ToS, Trae, Windsurf, Zed-hosted, Kimi Code), each with the doc-57 check. Add **Hmbown/CodeWhale** to the F12 harness candidate list.
3. **A3/A7/P6.10 routing vocabulary** — adopt `cache-optimized` (prefix-pin) + `lkgp` (sticky last-good) + `headroom`/`reset-aware` (quota) into the failover/tiering spec. One paragraph.
4. **I2 skills (not C9)** — add taste-skill as an optional first-party design skill; add the C9-vs-taste-skill distinction to doc 37 (C9 = learned coding prefs, algorithm #31; taste-skill = static design SKILL.md). Do NOT mark C9 done because a skill was added.
5. **P4.2/P4.3/H5** — evaluate Univer as office UI engine; adopt ppt-master's "reason-then-native-shapes" PPT contract; note git-style sheet diff/rollback as D7 validation.
6. **P7.1/I5** — add "loop self-audit (better-harness pattern)" to the Forge runtime; it's cheap and matches ECC.
7. **I7** — record codebase-memory-mcp (C KG, spawn-only, Guard-2 on config writes) + crux (SCIP, watch) as a *future third query path*, never "run all and fuse" (doc 56 layering: RepoMap = default, Warp = C5-gated, CBM = optional graph).
8. **A5/P1.9** — add llmfit `recommend --json` hardware-fit scoring to the local-model picker.
9. **F12/H2** — better-harness's 5-dimension loop report as a post-ACP artifact (from our audit NDJSON).
10. **P4.3 / D3** — ppt-master "author new deck" path (template-clone + chart/table model) beside our surgical-edit D3.
11. **ARCH/12 / P12** — AnythingLLM + Cherry UI as a UI-only reference pass (workspace chrome / artifact pane / onboarding), and holaOS as the competitor page.
12. **MetaGPT DataInterpreter** — note as an office/REPL *skill* candidate (G4/D2), separate from the SOP roles already mapped.

Nothing above changes the build order or the 138-row contract — all are enrichments of existing capability rows.
