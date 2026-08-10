# 52 — Gap Pass 2: Hierarchy, Escalation, Computer-Use & the Tiered Web-Search Stack

> **Date:** 2026-08-09 · **Status:** 🟦 web-verified (GitHub API live-checked 2026-08-09; docs/README level)
> **Input:** an external AI's v3.7 review (Aider-hierarchy, storage, escalation) + its web-research pass (computer-use, memory, sandbox, marketplace, observability, orchestration, LeAgent) + a web-search deep-dive (tiered cascade) + DeepSeek app analysis + worst-case build estimate.
> **Purpose:** decide **what to ADD / what is ALREADY IN / what NOT to add**, with every proposed repo **live-verified** (26 real, 8 unverifiable).
> **Cross-refs:** v3.8 spec (135 rows), docs 49–51, ARCH/01–12, master ledger doc 27 (192 → **218** repos).

---

## 0. The verdict table (everything proposed, decided)

| Proposal | Verdict | Evidence |
|---|---|---|
| **Gap 2 — Storage intelligence (eDirStat/WinDirStat/UltraSearch)** | ✅ **ALREADY IN** (doc 49) | D9–D11 + G7 + `everyaios-storage` crate, shipped in v3.8. The review's K1–K3/K6/K7 map 1:1 to D9/D10/D11/G7. K4/K5/K8 (health monitoring, smart cleanup, analytics dashboard) → **new D12** |
| Review's **H25–H28** (storage UI rows) | ❌ **NOT ADDED** — ID collision | Our H25–H28 are generative-UI/clipboard/resumable/TTS. Storage UI lives in ARCH/12 §12 (treemap tab, cleanup card, instant search, health widget) |
| **Gap 1 — Aider as surgeon** | 🔶 **PARTIAL ADD** | Aider's *features* are already I7–I10 (RepoMap, edit strategies, architect, file watcher). **ADD:** Aider to the F12 harness list (currently omitted!) + explicit surgical hierarchy in P2 pillar + ARCH/DIAGRAMS note. **NOT ADDED:** B9–B11 rows (duplicate I7–I10), Algorithm 33-Aider (I9 exists; 82.7% is aider-reported, doc 51) |
| **Gap 3 — Permission escalation chain** | 🔶 **PARTIAL ADD** | J1/J3/J17 already provide ladder + diff-cards + ACP `request_permission`. **ADD:** J21 **escalation rules & decision packages** (permissions.toml policy layer + structured decision-package context + confidence threshold) + P9 pillar text. Level-1/2/3 = Trust-Ladder bands, no new mechanism |
| **Computer use (Agent S / Cua / Julie / Lybic → E15–E18, Alg 37, Pillar P12)** | 🔶 **REFERENCE ONLY** | E9 stays ⚪ post-v1 (spec §8 explicit non-goal: DOM-snapshot > pixel in v1). **Verified:** `Simular-ai/Agent-S` 12.1K, `trycua/cua` 21.1K, `Luthiraa/julie` 28. Lybic framework **unverified**. E15–E18 NOT ADDED (redundant with E9); E9 text extended with the verified patterns + OSWorld harness note (doc 48 already deep-dived UI-TARS/OmniParser/Skyvern) |
| **Memory (MemoryOS / octopoda / cyber-memory → C13–C14)** | 🔶 **REFERENCE ONLY** | **Verified:** `BAI-LAB/MemoryOS` 1.5K (EMNLP-2025 academic), `RyjoxTechnologies/Octopoda-OS` 504. cyber-memory **unverified**. C1–C12 already complete (mem0/letta/graphiti/LadybugDB/NOOA). NOT ADDED rows |
| **Sandbox (AIO Sandbox / BoxLite → J21–J23-review#)** | 🔶 **REFERENCE ONLY** | **Verified:** `boxlite-ai/boxlite` 2.2K (micro-VM for agents) — reference for I3 WASM/libkrun. **AIO Sandbox UNVERIFIED** (the only GitHub hit is a WoW-emulator server — the pasted chat's "all-in-one AI sandbox" could not be verified → treat as possibly hallucinated). NOT ADDED rows |
| **Marketplace (Agent Market / Special Agents / Nous APM → I11–I13)** | ❌ **NOT ADDED — ALL UNVERIFIED** | NousResearch/apm 404, Agent Market/Special Agents no real hits. Our I2 skill registry + H24 MCP marketplace + P9.7 community marketplace + P12.6 monetization research stand |
| **Observability (AgentLens / AgentSight → J24–J25)** | 🔶 **REFERENCE ONLY** | **Verified:** `RobertTLange/agentlens` 36 (local coding-agent session observability), `eunomia-bpf/agentsight` 569 (eBPF system-level profiler). J14 (OTel) text extended with both as references. NOT ADDED rows |
| **Orchestration (MS Agent Framework / Solace Mesh / Eigent → B12–B13)** | 🔶 **REFERENCE ONLY** | **Verified:** `microsoft/agent-framework` 12.7K, `SolaceLabs/solace-agent-mesh` 5.0K, `eigent-ai/eigent` 14.9K (desktop multi-agent — validates our desktop-multi-agent bet). Our B-section is deliberately pi/Hermes-derived; NOT ADDED rows |
| **LeAgent 100+ tools (→ F14-review#)** | 🔶 **REFERENCE ONLY** | **Verified:** `vixues/LeAgent` 202. **F14 is taken** by email connector — no collision row; LeAgent referenced in doc 52 only |
| **Web-search tiered cascade (WebSurfx / metasearch2 / Local-Search / Farfalle / Perceive / searxng-mcp → G12–G16, Alg 39)** | ✅ **ADD (the real delta)** | 10 verified repos. **New G8 row** (tiered cascade + cache), **G1 extended** (SQLite cache, parallel fetch cascade), **Algorithm #33** (search tier escalation & cache). Farfalle/Perceive (local-LLM synthesis) → G2 territory, reference. Local-Search (browser-profile search) → E13 territory, reference. indexical/hister/Offline-Search (local web memory) → C3/G7 territory, reference |
| **DeepSeek analysis (strict JSON schema / two-mode / interleaved thinking)** | ✅ **ALREADY IN** | B5 grammar-enforced extraction **≥** strict JSON Schema; A7 planner/subagent tiering = two-mode; G2 deep research = interleaved thinking; P3 BYOK. Nothing new |
| **Worst-case build estimate (6.5–13.5 person-years from scratch)** | ✅ **VALIDATES DOCTRINE** | Exactly why the corpus is steal/adapt/reference (218 repos, ~95% borrowed). No action |

---

## 1. The surgical hierarchy (ADD — small, high-value)

The review is right that Aider belongs in the execution pipeline, and right that the hierarchy was implicit. Two concrete changes (no new rows):

1. **F12 harness list gains Aider** — `(Codex/Claude Code/Cursor/Grok/OpenCode/**Aider**/Cline/Pi)` in SPEC F12, ARCH/09 F12, P2 pillar bullet.
2. **P2 pillar gains the 3-tier framing**: *brain (user/memory/planning + escalation gate) → core (multi-agent orchestration, subagents, codebase understanding) → surgeon (precision git-native edits, diff patching, lint/test repair)* — implemented as **ACP-wired workers in the same harness-driving model** (J17), not a new subsystem. The review's ASCII hierarchy = our F12 + B3/B4 + I7–I10 with Aider added.

**Why no B9–B11 rows:** B9 "Aider integration" duplicates I7–I10; B10 "hierarchy" is configuration of F12/J17; B11 "RepoMap" is I7. Adding them would double-count rows the matrix already owns.

## 2. Escalation rules & decision packages (ADD — J21)

> **ID note:** the external review's *rejected* J21 was "AIO Sandbox integration"; **our J21 is escalation rules** — same ID number, different row (the review's J21–J25 sandbox/observability rows were rejected as redundant). No collision in the matrix (our J21 is unique).

The review's Level 1/2/3 chain is exactly Trust-Ladder bands (J1) — what's genuinely missing is the **policy config + decision-package contract**:

- **`~/.everyaios/permissions.toml`** (extends J9 config-as-files): rules like `delete_files = "always_ask"`, `multi_file_edit = "ask_if_gt_5"`, `external_network = "ask_if_new_domain"`, `terminal_shell = "ask_if_destructive"`, plus `min_confidence_for_auto = 0.85` and `user_feedback_learning = true` (feeds C9 taste profile).
- **Decision package**: when a lower tier escalates, it passes a structured bundle (goal, proposed diff, risk assessment, affected paths) — rendered as the existing Guard-2 diff card (J3); approvals/denials feed the correction-detector (algorithm #9) + taste profile (C9).
- **New row J21** (🟡) — *Escalation rules & decision packages*: permissions.toml policy layer, decision-package contract, confidence threshold for auto-exec.

## 3. Storage health (ADD — D12)

Fold the review's K4 (health monitoring >90%), K5 (smart-cleanup AI) and K8 (analytics dashboard) into one row:
- **New row D12** (🟡) — *Storage health & analytics*: drive-threshold monitoring (e.g., 90% full), cleanup-plan suggestions (duplicates/large files/old caches) via the agent with Guard-2 approval, dashboard (free space, top files, duplicate counts, trends).

## 4. The tiered web-search stack (ADD — G8 + Algorithm #33 + G1 ext)

The pasted chat's search deep-dive is the strongest new content. Verified stack:

| Tier | Component | ⭐ | Verdict |
|---|---|---|---|
| Instant (cached) | SQLite result cache, 5-min TTL (matches 05 token-economy discipline) | — | **ADD** to G1/G8 |
| Fast | `neon-mmd/websurfx` (Rust metasearch, IO-uring, ~20–40MB) | 1,171 | **ADD** as optional Tier-2 engine |
| Fast alt | `mat-1/metasearch2` (Rust metasearch, MCP) | 171 | reference |
| Reliable | SearXNG (existing G1) | — | keep |
| Fetch | `TadMSTR/searxng-mcp` 4-tier fetch cascade (Firecrawl→Crawl4AI→raw→Wayback), parallel | 16 | **ADD** cascade pattern |
| Authenticated | `Kevin-Liu-01/Local-Search` (user's Chrome profile, cached) | 5 | E13 territory — reference |
| Synthesis | `dorucioclea/farfalle` 1 / `vikramlingam/Perceive-Search` 2 (local-LLM answers) | 1/2 | G2 territory — reference |
| Local web memory | `asciimoo/hister` 1,849 / `deejayy/indexical` 66 / `lyteabovenyte/Offline-Search` 2 / `Ferki-git-creator/bytewise-search` 3 | — | C3/G7 territory — reference |
| MCP wrappers | `gefsikatsinelou/MetaSearchMCP` 52 / `keith-vs-kev/searxng-search` 17 | — | F6/F9 validation |

- **New row G8** (🟡) — *Tiered search cascade & cache*: cached instant tier (SQLite, 5-min TTL) → optional Rust metasearch (WebSurfx) → SearXNG → external fallback via circuit breaker; **parallel fetch cascade** for the top-N results (50-page baseline in ~single-page time); BM25 rerank at each tier.
- **Algorithm #33** — *Search tier escalation & cache*: routing policy (respond from cache when fresh → escalate on miss/failure/slow), bounded TTL per query type, idempotent fetch.
- **G1 extended** to point at G8 (cache + cascade).

**Deliberately NOT added:** G12–G16 rows (folded into G8), Algorithm 39 (renumbered #33 — the index continues at 33).

## 5. Repo verification ledger (live 2026-08-09)

**26 verified → master ledger section 22 (192 → 218):**
`websurfx` 1,171 · `microsoft/agent-framework` 12,697 · `Simular-ai/Agent-S` 12,143 · `trycua/cua` 21,059 · `eigent-ai/eigent` 14,870 · `BAI-LAB/MemoryOS` 1,549 · `RyjoxTechnologies/Octopoda-OS` 504 · `boxlite-ai/boxlite` 2,225 · `SolaceLabs/solace-agent-mesh` 4,954 · `mat-1/metasearch2` 171 · `Kevin-Liu-01/Local-Search` 5 · `dorucioclea/farfalle` 1 · `vikramlingam/Perceive-Search` 2 · `gefsikatsinelou/MetaSearchMCP` 52 · `TadMSTR/searxng-mcp` 16 · `keith-vs-kev/searxng-search` 17 · `lyteabovenyte/Offline-Search` 2 · `deejayy/indexical` 66 · `asciimoo/hister` 1,849 · `Ferki-git-creator/bytewise-search` 3 · `guilherme13c/pythia` 3 · `dedsecrattle/Argus` 1 · `Luthiraa/julie` 28 · `RobertTLange/agentlens` 36 · `eunomia-bpf/agentsight` 569 · `vixues/LeAgent` 202

**8 UNVERIFIABLE → NOT added (treat as possibly hallucinated; do not cite):** cyber-memory (MCP memory binary), AIO-Sandbox (AI all-in-one; only a WoW server exists under that name), Special Agents (package format), Agent Market, Nous APM, TraceVerse, devai pod, Lybic GUI Agent (only a 3⭐ demo repo exists).

**Worst-case-build note:** the 6.5–13.5 person-year estimate for a from-scratch distributed crawler/index/queue stack confirms the corpus doctrine — we assemble verified open-source pieces (Tantivy/SeekStorm-class already in doc 32; Argus/Pythia as reference crawlers; Redis-class caching), we never build search infrastructure from zero.

**Ledger: 192 → 218 repos.** Reading-order: 49 (storage) → 50 (gen-UI/image/voice/email) → 51 (aider recheck) → **52 (this doc)** → spec v3.9.
