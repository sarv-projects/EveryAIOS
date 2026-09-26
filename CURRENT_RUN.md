# CURRENT_RUN — handover log

> Read this first. Working log for agents in `desktop_app`.
> **v1 docs rebuild in progress — code is frozen until v1 freezes.**
> Previous v0 handover content (≈344 KB) was replaced on 2026-09-26; it remains in git history.

## Active goal
Rebuild the AgentCowork docs from scratch as **v1**: ARCH set + SPEC + UI + supporting docs, on the shoulders of the v0 corpus. v0 archived locally (`ARCHIVE/v0/`, git-ignored). `TODO.md` untouched by design. No scope cuts.

## Where we stopped — 2026-09-26, passes P0–P6 ✅ (docs v1 complete; frozen for review)
**Done:**
- v0 archived: `ARCH/` (33 entries) → `ARCHIVE/v0/ARCH/`; `RESEARCH/` → `ARCHIVE/v0/RESEARCH/`; 10 root product docs → `ARCHIVE/v0/root/`; manifest at `ARCHIVE/v0/MANIFEST.md`; archive README updated.
- v1 foundation drafted:
  - `ARCH/00-INDEX.md` — authority chain, full doc map (00–44 + SPEC/UI/README/AGENTS), passes P0–P6, viability checklist, conventions, evidence base, P0 archive record, OQ register.
  - `ARCH/01-NAMING.md` — AgentCowork / Core / Agent X, v0→v1 rename map, rules (code identifiers frozen).
  - `ARCH/02-THESIS.md` — definition, positioning, principles P-01…P-14, non-goals, differentiator, success statements S-01…S-10.
  - `ARCH/03-HLD.md` — planes, module map 10–44, dependency rules, governed execution path (control vs effect), scoping model, interop matrix, implementation order, risks RISK-001…007.
- Three background research lanes dispatched (deliverables → `ARCHIVE/v1-research/`):
  - `lib-3` (librarian) → `memory.md` — ✅ completed; evidence verified; integrated into `ARCH/17-MEMORY.md` (Draft P2).
  - `gen-21` (general) → `agent-harness-verification.md` — ✅ completed; 8 VERIFIED / 3 PARTIAL / 0 WRONG; integrated into `ARCH/15-AGENT-X.md` + `DEC-027…029`.
  - `des-1` (designer) → `ui-architecture-evidence.md` — ✅ completed (1,710 lines, verified); key corrections: right rail is **22** viewports (not 19), `prose` typography is inert today, mermaid exists only in one viewport, streaming re-parses per token, Tauri envelope rules out iframe isolation (blob-`<img>` pattern recommended). (`des-2` duplicate retry cancelled.)
  - `lib-4` (librarian) → `mcp-provider-verification.md` — ✅ completed (641 lines); integrated into `ARCH/14-PROVIDERS.md` + `DEC-030`.
  - `gen-23` (general) → `world-model-verification.md` — ✅ completed (359 lines); integrated into `ARCH/21-WORLD-MODEL.md`. Key: structured-first is our design choice (industry is screenshot-first); `(VolumeSerial, FILE_ID_128)` + incarnation required (IDs reused after delete); watcher overflow ⇒ bounded rescan + epoch cursors; **code-phase bug confirmed**: `walk.rs:131-157` zeroes dev/ino → corrupts `dedup.rs`.
  - `gen-22` (general) → `workflow-engine-verification.md` — ✅ completed (690 lines); integrated into `ARCH/20-WORKFLOW.md` + `DEC-033`. Key: durability = journal + occurrence rows + leases + idempotency keys; in-flight runs pinned; keyless side effects → `needs_attention`; browser-event and completion-chained triggers are product inventions (no precedent).
  - `gen-24` (general) → `office-runtime-verification.md` — ✅ completed (448 lines); integrated into `ARCH/22-OFFICE.md`. Key: OfficeCLI L1/L2/L3 + resident/flush verified (its MCP is one command-string tool — not copied); GenOffice per-domain op registries + docs-sync drift gate; current crate lacks resident/lease (main code-phase gap); no surveyed engine supports merge.
  - `gen-25` (general) → `provider-layer-absorption.md` — ✅ completed (279 lines; OpenCode `fe3f3a4` · Cline `254f40c` pinned); integrated into `ARCH/18`/`14`, `DEC-034/035`, and `44` ledger amendments (cline + grok-build were missing).
  - `gen-26` (general) → `async-subagents-websearch-absorption.md` — ✅ completed (416 lines; Claude Code docs · Codex/Grok/Cline/OpenCode pinned); integrated into `ARCH/15` §7 + `28` §Web + `27` + SPEC §8 + `DEC-036/037`. Aider verdict: no upstream subagents (RepoMap only).
- P1–P6 ✅ complete: `ARCH/04-DECISIONS.md` (DEC-001…037) · `ARCH/05-INVARIANTS.md` (INV-01…024) · `ARCH/06-DATA-MODEL.md` (DM-001…027) · `ARCH/07-CONTRACTS.md` (CTR-001…026) drafted; module drafts `ARCH/10-KERNEL.md`, `ARCH/11-WORK.md`, `ARCH/12-TRUST.md`, `ARCH/13-CAPABILITY.md`, `ARCH/14-PROVIDERS.md`, `ARCH/15-AGENT-X.md`, `ARCH/16-CONTEXT.md`, `ARCH/17-MEMORY.md`, `ARCH/18-MODEL-ROUTING.md`, `ARCH/19-RUNTIME-ENVIRONMENTS.md`, `ARCH/20-WORKFLOW.md`, `ARCH/21-WORLD-MODEL.md`, `ARCH/22-OFFICE.md`, `ARCH/23-BROWSER.md`, `ARCH/24-COMPUTER-USE.md`, `ARCH/25-FILES.md`, `ARCH/26-CODE.md`, `ARCH/27-SEARCH.md`, `ARCH/28-COMMS.md`, `ARCH/29-ARTIFACTS.md`, `ARCH/30-EVENTS.md`, `ARCH/31-SKILLS-PLUGINS.md`, `ARCH/32-CHANNELS.md`, `ARCH/34-EFFECT-VERIFICATION.md`, `ARCH/43-GLOSSARY.md`, `ARCH/44-ABSORB-REGISTER.md`, `ARCH/40-FLOWS.md` (24 flows), `ARCH/41-EDGE-CASES.md` (~50 edges), `ARCH/42-EVIDENCE-MAP.md` (acceptance + FIX register) (evidence-integrated). `AGENTCOWORK-SPEC.md` + `AGENTCOWORK-UI.md` (both root) ✅; `README.md` + `AGENTS.md` v1-synced. Research: wave 1 ✅ (memory · harness · UI-evidence · MCP · world-model · workflow · office). **v1 frozen for review (2026-09-26); reopened for owner-directed absorption wave 2** — `gen-25` provider-layer ✅ integrated (`18`/`14` + `DEC-034` + `44` ledger amendments) incl. the **OpenCode Go client contract** (own UA + `x-opencode-session` affinity, `DEC-035`); `gen-26` async-subagents/web-search ✅ integrated (`15` §7 · `28` §Web · `27` · SPEC §8 · `DEC-036/037`). **Absorption wave 2 complete — docs re-frozen for review.**
- Evidence note: `/tmp/opencode/recon/` reports were lost to a temp cleanup. Surviving evidence: `ARCHIVE/v0/RESEARCH/**` (55 files), `~/business_Dev/REPO-COMPARE/**` (`MASTER-COMPARISON.md`, `DISPOSITION.md`, `LICENSE-LEDGER.md`, `BRIEFS/` 20 files, `clone2/` 58 clones).

**Repo cleanup — 2026-09-26 (tracked-doc cleanup pass):**
- Moved out of the tracked tree (16 files) to `ARCHIVE/v0/repo-cleanup-2026-09-26/`: `CODEBASE-MAP.md`; `docs/codebase/` (10 md + `freshness.json`); `docs/download.md`; `docs/release/post-v1.md`; `docs/release/retrospective-pack.md`; `.agents/docs/research.md`. `ARCHIVE/v0/MANIFEST.md` + `ARCHIVE/README.md` record the move.
- Gates re-homed: `gen-codebase-map.mjs --check` removed from `ci.yml` and release-qualify E3 (`check-doc-refs.mjs` takes the slot); `gen-release-surface.mjs --check` scoped to winget manifests (F3 retired); `check-public-surface.mjs` G4/G5 retired; `check-doc-refs.mjs` scan set + baseline path updated, `TODO.md` accepted as a historical ledger; live references re-pointed (`CONTRIBUTING.md`, `README.md`, `AGENTS.md` §11, `ARCH/00-INDEX.md` §10, `.agents/README.md`, `feature_request.yml`, `launch-checklist.md`, `docs/testing/windows-v1-runbook.md`, `run-windows-v1-validation.ps1`, both workflows).
- Gate state after the re-homing: `check-doc-refs.mjs`, `check-public-surface.mjs` and `gen-release-surface.mjs --check` exit 0.
- **Pre-existing red (out of scope, left as-is):** `check-doc-sync.mjs` reads archived v0 files (`ARCH/09-FEATURE-MATRIX.md`, `DESKTOP-APP-SPEC.md`, `SPEC-CHANGELOG.md`) and fails on main; it is the only FAIL in release-qualify E3 and is queued for re-homing.

**Working-tree state:** the v0→v1 doc work was committed by the product owner (HEAD `93a30e3`); the 2026-09-26 tracked-doc cleanup (16 deletions + live-doc/script/workflow edits) is committed as one coherent change. `ARCHIVE/**` is git-ignored, so the archive side is never committed. Code tree clean — the code phase has not started.

## Next exact steps
1. Cleanup gate re-run ✅ 2026-09-26 (`check-doc-refs.mjs` · `check-public-surface.mjs` · `gen-release-surface.mjs --check` exit 0; `release-qualify.mjs` E3 remains red only on the pre-existing `check-doc-sync`) and the cleanup is committed — 16 tracked deletions + the live-doc/script/workflow edits. `ARCHIVE/` is git-ignored, so the archive side is not committed.
2. Code-phase prep: re-verify `ARCH/42-EVIDENCE-MAP.md` §4 FIX-01…18 → open the P0 wave per §5.
3. ✅ Docs build complete — P0–P6 done; v1 frozen for review. Product-owner review pending.
4. Pass P1 ✅ complete: `04` `05` `06` `07` drafted.
5. Pass P2: module LLDs in dependency order 10 ✅ → 11 ✅ → 12 ✅ → 13 ✅ → 14 ✅ → 15 ✅ → 16 ✅ → 17 ✅ → 18 ✅ → 19 ✅ → 20 ✅ → 21 ✅ → 29 ✅.
6. Gate every doc with the §5 viability checklist in `ARCH/00-INDEX.md`; update the interop matrix in `ARCH/03-HLD.md` as modules land.

## Decisions & gotchas
- Names: product **AgentCowork** (working), runtime **Core**, native agent **Agent X** (`ARCH/01-NAMING.md`). Code identifiers (`everyaios-*`) stay until a post-freeze code-phase rename (OQ-003).
- Authority: SPEC (WHAT, planned P5) → HLD (HOW, currently top) → module docs. Archive/evidence is never authority.
- No-assumptions rule: every external claim needs `path:line` or URL evidence; the lost recon reports must not be cited.
- Do not restore v0 files into tracked paths without a `DEC` entry in `ARCH/04-DECISIONS.md`.
- `TODO.md` is exempt; `README.md`/`AGENTS.md` v1 sync ✅ done 2026-09-26.
