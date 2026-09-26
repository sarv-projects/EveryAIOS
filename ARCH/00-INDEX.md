# AgentCowork — Architecture v1 — Index & Blueprint

> **Doc set:** AgentCowork architecture **v1** — rebuilt from scratch on the shoulders of v0.
> **Status:** Pass **P7** (SDD layer, in progress). Docs 00–44 drafted; module passes + registry + matrix seeded; final review next.
> **Date:** 2026-09-26 · **Repo:** `desktop_app` · **Branch:** `main`
> **Code:** frozen. This set describes the target architecture; no code changes until v1 freezes.
> **v0 archive:** `ARCHIVE/v0/` (local, git-ignored) — see `ARCHIVE/v0/MANIFEST.md`. Nothing in the archive is a contract.
> **Exempt:** `TODO.md` stays the live delivery tracker and is not part of this rebuild.
>
> **v1 freeze for review (2026-09-26):** passes P0–P6 complete — 39 `ARCH/` docs + `AGENTCOWORK-SPEC.md` + `AGENTCOWORK-UI.md` + README/AGENTS syncs. Further changes go through `DEC` entries (`ARCH/04-DECISIONS.md`).
>
> **Owner reopening (2026-09-26):** absorption wave 2 ✅ complete — provider layer (`DEC-034/035`), async subagents (`DEC-036`), web search (`DEC-037`). Docs re-frozen for review.
>
> **SDD pass P7 (in progress, 2026-09-26):** spec-driven layer — `ARCH/08-REQUIREMENTS.md` (REQ registry) + `ARCH/09-FEATURE-MATRIX.md` (traceability) + agent-kit protocol (`.agents/docs/spec-driven-development.md`) + `AGENTS.md` §16.

---

## 1. Why a rebuild

v0 grew by accretion: 33 ARCH files, 55 research files, a 355 KB spec, a 606 KB changelog — with drift between docs and code (stale modules, phantom traces, duplicate ownership of responsibilities). v1 is written from scratch as a small set of documents with:

- **one owner per topic**,
- **an explicit authority chain** (§2),
- **evidence rules** — no claim about an external system is accepted without a primary citation (§6, §7),
- **a pass protocol** that checks architecture viability after every pass (§4, §5),
- **module-by-module development** — each module doc must state what it owns, what it depends on, what it exposes, and how it fails (§3).

**Kept from v0 (direction that survived verification):** Work-first runtime; one governed execution path for every effect; Capability ≠ Provider; custody invariants (sidecar proposes / Core disposes; keys never leave the vault); native-first capability resolution for agents.
**Rebuilt or added in v1:** naming layer (AgentCowork / Core / Agent X); memory architecture (new); world model; workflow engine as Core infrastructure; context split (infrastructure vs control); UI architecture incl. chat rendering; module-by-module interop checks; canonical data-model + contracts as separate shared docs.

---

## 2. Authority chain

| Layer | Document | Authority over |
|---|---|---|
| Product | `AGENTCOWORK-SPEC.md` | **WHAT** the product must be: behavior, contracts, acceptance. Root authority. |
| Requirements | `ARCH/08-REQUIREMENTS.md` | **WHAT must be verified**: testable behaviors (`REQ-*`) derived from the SPEC, each with acceptance + failure cases. |
| Traceability | `ARCH/09-FEATURE-MATRIX.md` | The `REQ → design → task → test` map. Owns links only, never content. |
| Architecture | `ARCH/03-HLD.md` | **HOW** the system is structured. Module docs derive from it. Until SPEC lands, HLD + `04-DECISIONS` are the top authorities. |
| Module LLD | `ARCH/10..34` | Their module only. MUST NOT contradict HLD/SPEC/contracts. |
| Shared | `ARCH/06-DATA-MODEL.md`, `ARCH/07-CONTRACTS.md` | Canonical shared entities (DM-*) and interfaces (CTR-*). Module docs own local details only. |
| UI | `AGENTCOWORK-UI.md` | UI/UX architecture, chat rendering, interaction model. Derives from SPEC + Experience plane. |
| Meta | `ARCH/00..05, 40..44` | Navigation, naming, thesis, decisions, invariants, flows, edge cases, evidence, glossary. |
| Delivery | `TODO.md` | Implementation status only — never a design authority. |
| Evidence | `ARCHIVE/v0/**`, `ARCHIVE/v1-research/**`, `REPO-COMPARE/**` | Historical/working evidence — never authority. |

**Conflict resolution:** module doc vs HLD → HLD wins. HLD vs SPEC → SPEC wins (product intent), unless a recorded decision (`DEC-*`) says otherwise. Any change to an authority doc requires a new/updated `DEC` entry in `04-DECISIONS.md`.

---

## 3. Document map

| ID | File | Scope | Purpose | Status |
|---|---|---|---|---|
| 00 | `ARCH/00-INDEX.md` | Meta | This file: authority, doc map, passes, conventions, evidence | Draft P0 |
| 01 | `ARCH/01-NAMING.md` | Meta | Working names + v0→v1 rename map | Draft P0 |
| 02 | `ARCH/02-THESIS.md` | Meta | Positioning, locked principles, non-goals, success statements | Draft P0 |
| 03 | `ARCH/03-HLD.md` | Meta | Planes, module map, dependency rules, governed path, scoping model | Draft P0 |
| 04 | `ARCH/04-DECISIONS.md` | Meta | Decision register (`DEC-*`) with evidence | Draft P1 |
| 05 | `ARCH/05-INVARIANTS.md` | Meta | Invariants (`INV-*`) + enforcement points + verification | Draft P1 |
| 06 | `ARCH/06-DATA-MODEL.md` | Shared | Canonical entities and schemas (`DM-*`) | Draft P1 |
| 07 | `ARCH/07-CONTRACTS.md` | Shared | Canonical cross-module interfaces (`CTR-*`) | Draft P1 |
| 08 | `ARCH/08-REQUIREMENTS.md` | Requirements | Behavioral registry (`REQ-*`): statements, acceptance, failure cases | Draft P7 (seeded; all domains module-verified) |
| 09 | `ARCH/09-FEATURE-MATRIX.md` | Requirements | Traceability: `REQ` → `DEC/DM/CTR` → `TASK` → `TEST` | Draft P7 (rows seeded) |
| 10 | `ARCH/10-KERNEL.md` | Core kernel | ids, errors, config, time, serialization; minimal-kernel rule | Draft P2 (early) |
| 11 | `ARCH/11-WORK.md` | Work plane | Work · Step · Task · Session · Run · Checkpoint · Scheduler | Draft P2 (early) |
| 12 | `ARCH/12-TRUST.md` | Trust/Control | Policy · Guard · approvals · tickets · vault · egress · audit · external-agent projections | Draft P2 (early) |
| 13 | `ARCH/13-CAPABILITY.md` | Capability | Registry · catalog · resolver · handles · affordances · guidance · capability graph | Draft P2 (early) |
| 14 | `ARCH/14-PROVIDERS.md` | Capability/Execution | Provider adapter contract + native/MCP/ACP/HTTP/CLI/plugin/remote + MCP era policy | Draft P2 (early) |
| 15 | `ARCH/15-AGENT-X.md` | Agent runtime | Agent X LLD: loop, planner, delegation, recovery, completion contracts, CLI/ACP surfaces | Draft P2 (early) |
| 16 | `ARCH/16-CONTEXT.md` | Context | Context infrastructure (Core) + context control (Agent X) + projections | Draft P2 (early) |
| 17 | `ARCH/17-MEMORY.md` | Memory | Durable memory: layers, write/read paths, minimal algorithm set, upgrade path | Draft P2 (early) |
| 18 | `ARCH/18-MODEL-ROUTING.md` | Model plane | Model registry · router · adapters; local discovery; reasoning-effort mapping | Draft P2 (early) |
| 19 | `ARCH/19-RUNTIME-ENVIRONMENTS.md` | Execution | Process manager · environments · sandbox · lifecycle · health | Draft P2 (early) |
| 20 | `ARCH/20-WORKFLOW.md` | Orchestration | Workflow IR · triggers · durability · versioning · approvals | Draft P2 (early) |
| 21 | `ARCH/21-WORLD-MODEL.md` | World | Scanner · registries · world graph · event stream · incremental updates | Draft P2 (early) |
| 22 | `ARCH/22-OFFICE.md` | Domain | Office runtime: L1/L2/L3 · resident contexts · render/validate · format providers | Draft P3 (early) |
| 23 | `ARCH/23-BROWSER.md` | Domain | Browser runtime: managed Chromium + adapters · browser world · ladder | Draft P3 (early) |
| 24 | `ARCH/24-COMPUTER-USE.md` | Domain | Computer-use ladder · UI automation · vision fallback · input safety | Draft P3 (early) |
| 25 | `ARCH/25-FILES.md` | Domain | File identity · watchers · leases · indexing | Draft P3 (early) |
| 26 | `ARCH/26-CODE.md` | Domain | RepoGraph/RepoMap · LSP · worktrees · code execution | Draft P3 (early) |
| 27 | `ARCH/27-SEARCH.md` | Domain | Search plane | Draft P3 (early) |
| 28 | `ARCH/28-COMMS.md` | Domain | Connectors; email/calendar/messaging as a capability layer | Draft P3 (early) |
| 29 | `ARCH/29-ARTIFACTS.md` | Artifacts | Artifact + Receipt models · versions · provenance · library promotion | Draft P2 (early) |
| 30 | `ARCH/30-EVENTS.md` | Events | Event store · bus · replay · subscriptions; usage & cost telemetry | Draft P3 (early) |
| 31 | `ARCH/31-SKILLS-PLUGINS.md` | Extensibility | Skill registry/loader/resolver; plugin surfaces | Draft P3 (early) |
| 32 | `ARCH/32-CHANNELS.md` | Surfaces | Desktop/CLI/ACP/A2A/API/mobile projections; agent gateway | Draft P3 (early) |
| 34 | `ARCH/34-EFFECT-VERIFICATION.md` | Verification | Validate · render · verify · reconcile; receipt policy | Draft P3 (early) |
| 40 | `ARCH/40-FLOWS.md` | Cross | End-to-end sequences (`FLOW-*`) | Draft P4 |
| 41 | `ARCH/41-EDGE-CASES.md` | Cross | Edge-case catalog (`EDGE-*`) + resolutions | Draft P4 |
| 42 | `ARCH/42-EVIDENCE-MAP.md` | Cross | Evidence map + acceptance mapping for implementation | Draft P4 |
| 43 | `ARCH/43-GLOSSARY.md` | Meta | Terms | Draft P3 |
| 44 | `ARCH/44-ABSORB-REGISTER.md` | Meta | Competitor absorb register + licensing ledger | Draft P3 |
| — | `AGENTCOWORK-SPEC.md` | Product | Product contract (WHAT) — root authority | Draft P5 |
| — | `AGENTCOWORK-UI.md` | UI | UI architecture + chat rendering spec | Draft P5 |
| — | `README.md` (root) | Product | Repo landing page — v1 sync | Draft P6 |
| — | `AGENTS.md` (root) | Process | Agent operating instructions — v1 synced 2026-09-26 | Done |

---

## 4. Build passes

| Pass | Content | Exit condition |
|---|---|---|
| **P0** ✅ | Archive v0; 00-INDEX, 01-NAMING, 02-THESIS, 03-HLD | Blueprint readable end-to-end (2026-09-26) |
| **P1** ✅ | 04-DECISIONS, 05-INVARIANTS, 06-DATA-MODEL, 07-CONTRACTS | Drafted 2026-09-26 — `DEC-001…033`, `INV-01…024`, `DM-001…027`, `CTR-001…026` |
| **P2** ✅ | Core modules: 10 → 11 → 12 → 13 → 14 → 15 → 16 → 17 → 18 → 19 → 20 → 21 → 29 | All drafted 2026-09-26 (22 carried with P3 label) |
| **P3** ✅ | Remaining modules: 22–28, 30, 31, 32, 34, 43, 44 | All drafted 2026-09-26 |
| **P4** ✅ | Cross-cutting: 40-FLOWS, 41-EDGE-CASES, 42-EVIDENCE-MAP | Drafted 2026-09-26 — 24 flows · ~50 edges · FIX register |
| **P5** ✅ | `AGENTCOWORK-SPEC.md`, `AGENTCOWORK-UI.md` | SPEC ✅ + UI ✅ drafted 2026-09-26 (UI: 583 lines, 13 sections) |
| **P6** ✅ | Viability + evidence sweep; consistency pass; freeze v1; README/AGENTS sync | Sweep run 2026-09-26 (cross-refs/sections/statuses/names clean; `20-WORKFLOW` interop gap fixed); freeze declared for review; README + AGENTS synced |
| **P7** ⏳ | SDD layer: `08-REQUIREMENTS` + `09-FEATURE-MATRIX`; module Requirements/Acceptance sections; `AGENTS.md` §16 + kit protocol | `REQ-*` registry seeded per domain; matrix traceable; `TODO.md` tasks reference `REQ-*` |

---

## 5. Viability checklist (per doc, and for the whole set at freeze)

- [ ] **One governed path:** every externally visible effect flows `Work → Capability → Provider → Handle → Guard → Ticket → Execute → Effect → Verify → Receipt → Event`.
- [ ] **One owner per responsibility:** no duplicated engines/registries/schedulers/provider systems.
- [ ] **Acyclic dependencies:** every module edge has a named contract (`CTR-*`).
- [ ] **Module interop:** doc states depends-on, exposes-to, and failure behavior.
- [ ] **Flows complete:** start, success, failure, cancel, crash-recovery.
- [ ] **Edge cases:** enumerated and resolved, or explicitly deferred with a DEC.
- [ ] **Evidence:** external claims cited (`path:line` / URL); no silent UNVERIFIED claims.
- [ ] **Traceability:** every `REQ-*` has acceptance + failure cases, an owning module, and a `TEST-*` (or an explicit deferral).
- [ ] **Token discipline:** deterministic operations never require an LLM.
- [ ] **Security:** enforcement in Core (Guard) not prompts; vault custody preserved; external agents get projections only.
- [ ] **No stale v0 terms:** v1 names only (except `01-NAMING` map and history notes).

---

## 6. Conventions

- **Keywords:** MUST / SHOULD / MAY (RFC-2119 semantics).
- **IDs:** `DEC-###` decisions · `REQ-<DOMAIN>-<NNN>` requirements · `TASK-<DOMAIN>-<NNN>` tasks · `TEST-<DOMAIN>-<NNN>` tests · `INV-NN` invariants · `DM-###` data-model entities · `CTR-###` contracts · `FLOW-###` flows · `EDGE-###` edge cases · `RISK-###` risks · `FIX-##` code-phase fix register · `PEND-###` pending decisions.
- **Open questions:** cross-cutting `OQ-###` are registered in §9; module-scoped questions use `OQ-<MNEMONIC>-<n>` (e.g. `OQ-CTX-01`, `OQ-MEM-03`) and are defined by the owning module doc's Open questions section. Both forms are referenced inline; ids are never renumbered or reused.
- **World-model collectors:** `W1…W7` as defined in `ARCH/21-WORLD-MODEL.md` §2.
- **Evidence format:** `ev: path:line` (repo) · `ev: URL` (web) · confidence `H/M/L` · `UNVERIFIED` must be temporary and carry what would verify it.
- **Status labels:** `Planned` → `Draft Pn` → `Review Pn` → `Frozen`.
- **Cross-references:** use file paths (`ARCH/17-MEMORY.md`), not section numbers, so docs can evolve.

---

## 7. Evidence base (surviving)

- v0 docs: `ARCHIVE/v0/ARCH/` (33 entries incl. ADR/ and the archived coordinator loop).
- v0 research: `ARCHIVE/v0/RESEARCH/` — `2026-ai-landscape/` (10 files), `desktop_app/` (45 files).
- Comparator work: `~/business_Dev/REPO-COMPARE/` — `MASTER-COMPARISON.md` (190 items — its §1 “186” line is stale; see `DISPOSITION.md` §a), `DISPOSITION.md`, `LICENSE-LEDGER.md`, `BRIEFS/` (20), `clone2/` (55 full clones), `clone3/` (2).
- v1 lane research (in progress): `ARCHIVE/v1-research/` — memory, agent-harness verification, UI evidence.
- **Lost:** `/tmp/opencode/recon/` reports 01–29 (temp cleanup, 2026-09-26). Do not cite them; re-verify from surviving sources.

---

## 8. Working names

Working product name: **AgentCowork** · Runtime: **Core** · Native agent: **Agent X**. Full map and rename table: `ARCH/01-NAMING.md`.

---

## 9. Open questions

| ID | Question | Resolve by |
|---|---|---|
| OQ-001 | Product shorthand for UI copy (“AC”? “Cowork”? none) | Before UI copy freeze (P5) |
| OQ-002 | Platform scope for World Model collectors (Windows-first vs cross-platform parity) | Module pass 21 |
| OQ-003 | Timing + scope of code identifier rename (`everyaios-*` crates/packages, `EveryAIOS` strings) | Post-freeze code phase |
| OQ-004 | `docs/` folder v1 review; README/AGENTS sync ✅ done (2026-09-26) | Post-freeze |
| OQ-005 | First-release surface set (desktop + CLI minimum? ACP server timing) | 32-CHANNELS / SPEC |
| OQ-006 | Whether v0 doc removals are committed now or when v1 freezes | Product owner |

---

## 10. P0 archive record

**Archived to `ARCHIVE/v0/`** (git-ignored; see `ARCHIVE/v0/MANIFEST.md`): `ARCH/`, `RESEARCH/`, `DESKTOP-APP-SPEC.md`, `SPEC-CHANGELOG.md`, `COMPETITIVE-POSITIONING.md`, `PACKAGING.md`, `SUPPORT-MATRIX.md`, `TEST-CASES.md`, `testcases.md`, `UI-DESIGN-PROMPT.md`, `UX-TESTING-PLAN.md`, `multiagent.txt`.
**Kept live:** `TODO.md` (exempt), `README.md`, `AGENTS.md`, `CURRENT_RUN.md`, `CONTRIBUTING.md`, `PRIVACY.md`, `SECURITY.md`, `LICENSE*`, `THIRD-PARTY-NOTICES.md`, `ui/DESIGN-SYSTEM.md` (current theme source), `docs/` (operational; later pass), `.agents/` (agent kit; later pass).
**Interpretation:** “docs” = the product/architecture/research corpus. Operational, legal, generated and agent-kit files stay in place until their scheduled v1 sync so the repo keeps working during the rebuild.

**Repo cleanup (2026-09-26):** `CODEBASE-MAP.md`, `docs/codebase/` (10 md + `freshness.json`), `docs/release/post-v1.md`, `docs/release/retrospective-pack.md`, `docs/download.md` and `.agents/docs/research.md` were moved to `ARCHIVE/v0/repo-cleanup-2026-09-26/` (git-ignored; see `ARCHIVE/v0/MANIFEST.md`). The gates and references that depended on them were re-homed the same day (see the manifest's "Gate re-homing" note).
