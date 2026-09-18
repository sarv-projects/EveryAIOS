# CURRENT RUN STATE — Task Handover & Checkpoint

> **INSTRUCTION FOR ALL CODING AGENTS**: 
> 1. Read this file **first** before starting any task. 
> 2. Update this file **after every completed or partially completed task** before handing off.
> 3. **Git Commit & Push Protocol (`desktop_app`)**:
>    - **Mandatory `git add`, `git commit`, and `git push` for verified changes in `desktop_app`.**
>    - **Strict Vendor-Neutral Rule: Explicitly forbids mentioning any AI tool or agent brand names (no "Cline", "OpenCode", "Freebuff", "Codebuff", "Antigravity", "Claude", etc.) in commit messages, descriptions, PRs, comments, or documentation.**
> 4. Authoritative surfaces: `desktop_app/TODO.md` = delivery status (the one live count), `desktop_app/SPEC-CHANGELOG.md` = release evidence/history, `desktop_app/DESKTOP-APP-SPEC.md` + `desktop_app/ARCH/` = the contract. This file is the session handover only and must not carry a competing census.

---

## 1. Active Goal
**(Current, 2026-09-18 — Secret and ambient credential protection + MCP sandbox flag hardening)**:
- Scope:
  1. Secret & Ambient Credential Protection (CVE-2026-47211): Added `.env`, `.env.local`, `.env.production`, `.env.staging`, `.ssh/`, `.aws/`, `id_rsa`, `id_ed25519`, `service_account.json` to `PROTECTED_PREFIXES` in `crates/everyaios-guard/src/protected_paths.rs` to protect from accidental or malicious recursive deletion and unauthorized access.
  2. MCP Sandbox Flag Hardening: In `crates/everyaios-mcp/src/npx.rs`, enhanced `trusted_npx_package` to reject argument flags starting with `-` or `_`.
  3. Execution test clippy cleanup in `crates/everyaios-core/src/execution.rs`.
- Files: `crates/everyaios-guard/src/protected_paths.rs`, `crates/everyaios-mcp/src/{attach,lib,npx}.rs`, `crates/everyaios-core/src/execution.rs`.
- Verified: guard `protected_paths::tests` 190/0; mcp `npx::tests` 71/0; core `execution::tests` 746/0; `cargo fmt` clean; `cargo clippy --workspace --all-targets` 0 warnings; `check-doc-sync.mjs` 0 (166 caps, 1429 = 1264 done + 165 open, kernel clear); `ipc-parity.mjs` 0; `clean-profile-boot-check.mjs` PASS; UI type-check 0 errors.
- Not flipped: P65.8 live-agent acceptance, P64.5/6 live-model turn soak, packaged E2E, Windows/mac installers, post-v1 gated items.
- Next:
  1. Live-model multi-turn soak for P64 edit ladder & shadow preflights.
  2. P65.8 live external agent acceptance probes.
  3. P50 release qualification & Windows MSI packaging.

**(Previous, 2026-09-18 — P51.29 MCP external floor + P51.17/30 NPX sandbox launcher + P51.7 exportable citations; committed in 78becc3)**:
- Scope: 
  1. P51.29 OpenWorker MCP-EXTERNAL floor: Third-party MCP tools always register with `family: ToolFamily::External`, `operation: "external_network"`, and `risk: "high"`. In `ToolService::handle`, read-named third-party tools are blocked from auto-approval (`spec.read_only && spec.family != ToolFamily::External`) — a stranger's tool name is never trusted as local read.
  2. P51.17 / P51.30 MCP NPX sandbox resolution: `crates/everyaios-mcp/src/npx.rs` + `attach.rs` implements `resolve_stdio_launch_with`. Resolves launcher from system PATH then `EVERYAIOS_BUNDLED_NODE`, validates packages against `trusted_npx_package` allow-list, and rejects shell escapes (`-c`, `--call`, bash/sh) before spawn.
  3. P51.7 Citation export dump: `ui/src/lib/citations.ts` adds `formatCitationExport` (marked body with `[^n]` + sorted `## Sources` markdown block), wired into `messageMarkdown()` in `message-bubble.tsx`.
- Files: `crates/everyaios-core/src/tools.rs`, `crates/everyaios-mcp/src/{attach,lib,npx}.rs`, `ui/src/components/chat/message-bubble.tsx`, `ui/src/lib/citations.ts`, `ui/src/lib/citations.test.ts`.
- Verified: core `p51_29_mcp_external` 1/0; mcp `npx::tests` 5/0; UI `citations.test.ts` 2/0; `check-doc-sync.mjs` 0 (166 caps, 1429 = 1264 done + 165 open, kernel clear); `ipc-parity.mjs` 0.
- Not flipped: P65.8 live-agent acceptance, P64.5/6 live-model turn soak, packaged E2E, Windows/mac installers, post-v1 gated items.
- Next: 
  1. Live-model multi-turn soak for P64 edit ladder & shadow preflights.
  2. P65.8 live external agent acceptance probes.
  3. P50 release qualification & Windows MSI packaging.

**(Previous, 2026-09-18 — P51.28 skill invocation + P51.18 MCP autoStart)**:
- Scope: Crush/Zed `disable-model-invocation` / `user-invocable` have live consumers (`skill/warm_set`, compose, Skills badges). AnythingLLM MCP Start/Stop/autoStart/lazy-start: identity survives Stop; first tools/call does not undo an explicit Stop.
- Verified: blueprint 1/0; core skill_rpc 2/0; src-tauri p51_stop 1/0; coordinator 34/0; UI 2/0; tsc 0; ipc-parity 0 broken.
- Not flipped: P65.8 probes, P64.5/6 soak, packaged E2E, Windows/mac, post-v1.

**(Previous, 2026-09-18 — P60.4/.8–.11 + P51.10 walkthrough)**:
- Scope: cheapest reliable combo; harness×model cases A/B/C; Chief spend warn; fabric a/b/c on the node; occupancy = picked Chief; OpenChamber Changes Walkthrough in Progress.
- Verified: core `p60_` 16/0; coordinator combo/fabric/spend/bind 6/0; UI occupancy/walkthrough/spend 4/0; tsc 0.
- Not flipped: P65.8 probes, P50.4.3 STT, soak, Windows/mac, post-v1.

**(Previous, 2026-09-18 — P60.1 five-way split + P60.2 perception fusion)**:
- Scope: five distinct runtime planes (no CLI-named subagent); vision-first scene graph (structure augments, lying tree still usable).
- Verified: core `p60_` 11/0; `subagent_rpc` 3/0; coordinator runtime-bind/cua-perceive 4/0; tsc 0.
- Not flipped: P60.4/.8–.11, P65.8, P51.10 UI walkthrough, P50.4.3 STT engine, soak, Windows/mac, post-v1.

**(Previous, 2026-09-18 — P60.6 mechanical verify + P60.7 BLOCKED≠FAILED)**:
- Scope: independent disk/command verify (Worker claim ignored); permission/missing-info is Blocked and does not burn fail budget; FAILED×3 reclaims.
- Verified: core `p60_` 7/0; coordinator cua-verify/cua-stop 4/0; tsc 0.
- Not flipped: P60.1/.2/.4/.8–.11, P65.8, packaged E2E, soak, Windows/mac, post-v1.

**(Previous, 2026-09-18 — P60.5 five-part brief)**:
- Scope: Chief writes a complete five-part brief onto the CUA node (`execution/cua_set_brief`); incomplete briefs refuse.
- Verified: core `p60_` 3/0; coordinator cua-brief 2/0; tsc 0.
- Not flipped: remaining P60 engine rows, P65.8, packaged E2E, soak, Windows/mac, post-v1.

**(Previous, 2026-09-18 — P65.2/6/7 settings gates)**:
- Scope: external-agent native surface not replaced; injected-failure rollback; OAuth/extension IPC ownership matrix.
- Verified: UI settings-groups 6/0; ui tsc 0.
- Not flipped: P65.8 live-agent acceptance, P50 packaged E2E, P64.5/6 soak, Windows/mac, post-v1.

**(Previous, 2026-09-18 — P59.7 Manager remaining rewrite + P59.16 CUA skills)**:
- Scope: Agent-S Manager remaining-node rewrite (`execution/cua_replan`); promote fully verified CUA traces to SKILL.md (`execution/cua_promote_skill`) in the existing I2 store.
- Verified: core `p59_` 14/0; coordinator cua-replan/cua-skill/cua-route 7/0; coordinator tsc 0.
- Not flipped: P65.2/6/7/8 remaining gates, P50 packaged E2E, P64.5/6 soak, Windows/mac, post-v1.

**(Previous, 2026-09-18 — P59.8 DAG Progress UI + P65.5 marketplace split)**:
- Scope: Progress view CUA DAG (MACU layout, remaining-only edit); Skills Installed vs Marketplace.
- Verified: cua-dag + skills-surfaces 5/0; core cua 10/0; tsc 0.
- Not flipped: P59.7 Manager rewrite, P59.16 skills, P65.8 acceptance, remaining P51 engine rows without a seam, packaged E2E, soak, Windows/mac, post-v1.

**(Previous, 2026-09-18 — V1 remainders wave 3: P59 CUA live path + P65.3/.4; committed)**:
- Scope: two-surface router in coordinator+Rust; vision gate UI; Computer use rail; DAG persist/step; worker halt on `desktop.act`; screen-untrusted; connections/schedules settings inventories.
- Verified: core cua 10/0, cua_persist 1/0, desktop.act halt 1/0; coordinator cua-route 2/0; UI 23/0 on touched tests; tsc 0.
- Not flipped: P59.7 Manager rewrite, P59.8 DAG UI, P59.16 skills, P65.5–.8 remaining, packaged E2E, soak, Windows/mac, post-v1.
- Next: P59.8 DAG viewer; P65.5 marketplace split; remaining P51 engine rows that have a seam.

**(Previous, 2026-09-18 — V1 remainders wave 2: splits, settings inventory, citations, Scout/Worker/Verifier, voice; committed)**:
- Scope: P68.8/P54.4 terminal splits (`decideSplit` live in Shell); P65.1 Settings Providers from `settings_providers_list`; P52.20 citations from `search.query`; P51.10 `execution/multirun` from `subagent` models; P60.3 Scout/Worker/Verifier on spawn; P50.4.3 VAD+NoopStt; P50.4.4 speechSynthesis read-aloud. Skip P50.4.5–4.7.
- Files: `ui/src/lib/{terminal-split,provider-groups,citations,voice}.ts`, `ui/src/components/{views/shell-view,panels/settings-providers,chat/{chat-composer,message-bubble}}`, `packages/coordinator/src/{citations,chat,tools}.ts`, `crates/everyaios-core/src/{cua,execution,chat}.rs`, `src-tauri/src/voice_cmds.rs`.
- Verified: core `cua::` 8/0, `p51_multirun_ipc_admits` 1/0, `subagent_rpc_scout` 1/0; src-tauri `voice_` 3/0; coordinator bun 50/0 on touched files; UI bun 30/0 on touched files; tsc 0 coordinator + UI.
- Not flipped: P64.5/P64.6 soak; P50.2.x packaged; P50.5.8 win/mac; post-v1; P65.3–.8.
- Next: P65 remaining surfaces; P51.10 UI walkthrough; on-device STT for P50.4.3; live-model soak.

**(Previous, 2026-09-18 — V1 remainders: edit batch live, ladder fixtures, CUA router, shared-plane MCP list; committed)**:
- Scope: P64 Linux remainders after the compact `file_ops.edit` intercept. Consecutive model `file_ops.edit` calls in one round share one `execution/preflight` (`executeEditAwareRound` / `applyEditBatch`). Shared JSON fixtures prove coordinator `applyEditLadder` == Rust `apply_edit_ladder` (Aider fail-closed SEARCH/REPLACE). `SubAgentRuntime::spawn` applies `derive_child_permissions`; inbuilt spawn pins `parentId: root`. MCP `tools/list` advertises façades only (`tool_list_shared_plane`). CUA ladder is code: `route_work_surface` + `vision_gate` + Worker halt-after-two-fails; `desktop.act` refuses office/URL targets. `restore_file_to_bytes` is what `fs_undo_restore` calls (real git-repo test). Heartbeat test waits for a frame instead of a 700ms sleep. P61.12 `digestClass` is the review-after policy hook (Guard wire still open).
- Files: `crates/everyaios-core/src/{cua,file_undo,tools,lib}.rs`, `crates/everyaios-blueprint/src/subagent.rs`, `crates/everyaios-mcp/src/server.rs`, `packages/{core-engine,coordinator}`, `src-tauri/src/fs_cmds.rs`, `ui/src/lib/interrupts.ts`.
- Verified: `cargo test -p everyaios-core --lib p59_` 7/0; `p64_edit_ladder` 1/0; `p64_restore` 1/0; `everyaios-blueprint spawn_applies` 1/0; `everyaios-mcp tool_list_shared` + `stdio_lists` 1/0 each; `src-tauri cargo check` 0; coordinator `bun test` chat/p64/index (batch + fixtures); UI `interrupts.test.ts` 16/0; coordinator `tsc --noEmit` 0; core-engine vitest engine.test 14/0.
- Not flipped: P64.5/P64.6 stay `[PARTIAL]` (no live-model soak). Windows/mac acceptance untouched. Post-v1 untouched.
- Next: live-model soak if a provider binary is usable; P59 Worker attach_desktop on the agent path; P65 acceptance; P61.12 Guard wire class.

**(Previous, 2026-09-18 — P64.5/P64.6: the compact edit path is now reachable from a live model turn; committed)**:
- Scope: the open boundary both earlier 2026-09-18 entries named — `applyExactEdit` had no caller outside tests. The coordinator turn loop (`runInbuiltTurn` in `packages/coordinator/src/chat.ts`) now intercepts the model's `file_ops.edit` function-call and routes it through `applyExactEdit` (ladder → `deriveEditRisk` → `execution/preflight` with the staged candidate → refuse before any mutating `tool/commit` on a failing verdict → `file_ops.write`), instead of falling through to the direct executor where the gate never saw the call (same silent-miss class P64.3 fixed for the repo map). `editArgsFromToolCall` maps the model-facing `{path, old, new}` fail-closed (absent/blank `path` or non-string `old`/`new` throws before any read; `new: ""` is a deletion, distinguished from absence). `root` is sent as `.` and resolved Rust-side by `with_preflight_root` (`crates/everyaios-core/src/chat.rs`): absolute honored, absent/relative floored to the workspace — otherwise the gate would stage a shadow tree of the sidecar's own cwd and pay a `git worktree add` on the wrong repo. `LOOP_PINNED_TOOL_IDS` swapped `file_ops.replace` (an id no registry ever registered) → `file_ops.edit`; ARCH/17 §loop-pinned + the two TODO mentions updated in step.
- Files: `packages/coordinator/src/chat.ts`, `packages/coordinator/src/tools.ts`, `packages/coordinator/src/tools.test.ts`, `packages/coordinator/src/chat.test.ts` (+3 turn-loop cases: ride-through with `execution/record_edit`; failed verdict → commit log contains only `file_ops.read`; missing `old`/`new` fails closed before any read), `crates/everyaios-core/src/chat.rs` (`with_preflight_root` + the preflight arm + 2 Rust tests), `ARCH/17-NATIVE-AGENT.md`, `TODO.md` (P64.5/P64.6 dated notes; both stay `[PARTIAL]`), `SPEC-CHANGELOG.md` (new 2026-09-18 entry on top).
- Verified: Rust `cargo fmt` + `cargo clippy --workspace --all-targets` clean, `cargo test -p everyaios-core --lib` **710/0** (was 709). Coordinator `bun test` **419 passed / 3 failed** / 1353 expects (45 files) — all three failures environment-gated, not code: two Live OpenCode real-binary ACP handshakes timing out at 15 s (binary unusable here) and one E2E sidecar-heartbeat case that passes in isolation (`bun test -t 'session/ready'` → 1/0) and failed only under full-suite load (765 ms of a 5 s window). `npx tsc --noEmit -p coordinator` 0; `check-doc-sync.mjs` 0 (166 / 1429 = 1221 + 208, kernel clear); `ipc-parity.mjs` 0.
- Gotchas: (1) `deriveEditRisk` treats `const`/`let` as noise — only `fn|class|struct|impl|trait|enum|interface|def|func|type` declaration deltas or bracket-balance deltas flag structural, so a test that asserts `structural:true` for a `const`-adding edit is wrong, not the code. (2) Test bridges must tolerate benign turn-loop RPCs (`guard/evaluate`, `terminal/status`, …) — a strict "unexpected RPC throws" handler kills the turn before the read commits; make only the assertion-relevant RPCs strict. (3) The edit gate is an ordering change, not a privilege change — `file_ops.edit` is a `write`-tier catalog tool; the bytes the gate inspected are the bytes `file_ops.write` commits because the coordinator splices only to build the candidate. (4) The receipt RPC on the ladder path is `execution/record_edit`, not `work/record_receipt`.
- Next: 1) real-repo soak — a live model turn issuing an edit through the new seam (the checkbox evidence P64.5/P64.6 still wait for); 2) differential harness `applyExactEdit` ↔ Rust `file_ops.edit`; 3) root-cause the E2E heartbeat flake (isolation pass recorded); 4) `applyEditBatch` still has no live consumer (multi-file arm).

**(Previous, 2026-09-18 — P64.5: the structured rung was dead code; the ladder is now three reachable rungs + a multi-file producer; committed)**:
- Scope: the second handover item from the previous block ("P64.5 ladder producers … so the gate's `filesChanged > 1` arm gets a production input"). Two defects were found and fixed rather than documented around. **(a) The structured rung was unreachable:** `apply_structured_edit` (`crates/everyaios-core/src/tools.rs`) located its splice by calling `apply_exact_once`, so inside `apply_edit_ladder` it could neither rescue (rung 1 failed → it failed identically) nor refuse (rung 1 succeeded → the ladder had already returned) — `EditStrategy::Structured` was never produced by the ladder, and the old test hedged (`s2 == Structured || s2 == Fuzzy`) because it could not tell them apart. Rung 2 is now a **token-exact** matcher (`whitespace_free` returns text + an index map; whitespace insignificant, every other character exact), strictly stricter than fuzzy and strictly more tolerant than exact. **(b) `LexicalShapeSource` could not see `pub` declarations:** the strip chain's second `unwrap_or(t)` bound the **pre-strip** `t`, so a `pub fn`/`pub struct` was restored *with* its `pub ` prefix and matched no keyword — a pub-only file had an empty shape and passed the delta check unconditionally; each strip now shadows. **Coordinator:** `applyExactEdit` now rides the full ladder and records the rung that actually spliced the file (`strategy`) on the verified-edit receipt and its result payload; new `applyEditBatch` sends **one** `execution/preflight` with `filesChanged = N` and every candidate (refuse-all on failure, duplicate-path refusal, partial-success reporting).
- Files: `crates/everyaios-core/src/tools.rs`, `packages/coordinator/src/tools.ts`, `packages/coordinator/src/p64-lane.test.ts`, `TODO.md` (P64.5 → `[PARTIAL 2026-09-18]`; P64.6 "Still open" updated), `SPEC-CHANGELOG.md` (2026-09-18 P64.5 entry).
- Verified: Rust `cargo test -p everyaios-core --lib` **709/0** (was 707; two pre-existing tests tightened so they fail against the pre-fix code), `cargo fmt --check` clean, `cargo clippy --all-targets` clean. Coordinator `bun test` **417/0/1349** (45 files; `p64-lane.test.ts` 53, +15), `npx tsc --noEmit` 0. `check-doc-sync.mjs` 0; `ipc-parity.mjs` 0.
- Gotchas: (1) **The ladder's shape check is not a hard block** — a `ShapeChanged` refusal falls through to the fuzzy rung, which applies the *same* splice without the shape check, so it selects the recorded strategy rather than preventing the edit (now pinned by a test; the policy is unchanged). (2) The ladder is **mirrored** coordinator-side on purpose: Rust's `file_ops.edit` commits, so it cannot hand back the pre-commit post-state `execution/preflight` must inspect. Rust stays the applier of record for the native tool path. (3) The mirror is stricter in one place — it strips `pub`/`async` in a loop where Rust shadows twice. (4) `applyExactEdit` is now a misnomer (it rides the ladder); renamed only if a follow-up wants the churn. (5) `assertSingleMatch` is no longer called by the apply path (still exported/tested).
- Next: 1) give the ladder a **live consumer** — nothing outside tests calls `applyExactEdit`/`applyEditBatch`, which is what keeps P64.5/P64.6 open; 2) warm shadow checks (share the target/build dir between shadow worktree and root) — the synchronous-dispatch latency note stands; 3) Windows `git worktree add --detach` staging run (P68.7); 4) live model-turn soak on a real repo.

**(Previous, 2026-09-18 — P64.7: shadow-preflight receipts surface on the checkpoint timeline; committed)**:
- Scope: the first handover item from the previous block. `applyExactEdit` (`packages/coordinator/src/tools.ts`) now returns `{ok, path, written, preflight:{needsPreflight, verified, passed, reason}}` — the verdict rides with the edit result, so the transcript is the evidence carrier (no new channel; same object Rust recorded as the Work's `shadow_preflight` receipt). `ui/src/lib/checkpoints.ts` adds `preflightOutcome` (three honest states: `preflighted` / `failed`-but-landed = the discrepancy, restore is the remedy / `unverified` = no evidence, never a pass) and `CheckpointTurn.preflight/preflightNote`; `deriveCheckpointTurns` picks the **strongest** evidence per turn (`failed` > `preflighted` > `unverified`). `turn-checkpoint.tsx` renders the badge (emerald/rose/muted + plain-language `title`), `session-timeline.tsx` threads the props; new `ui/src/lib/checkpoints-preflight.test.ts` (11 tests) + a p64-lane ride-through case. `TODO.md` P64.7 note extended (stays `[NOT DONE]`), `SPEC-CHANGELOG.md` 2026-09-18 P64.7 entry added.
- Verified: UI `bun test` **349/0/1225** (43 files, incl. 11 in `checkpoints-preflight.test.ts`); UI `tsc --noEmit` 0. Coordinator `bun test` **402/0/1309** (45 files); coordinator `tsc --noEmit` 0. `check-doc-sync.mjs` 0 (166 caps, 1429 = 1221 + 208, kernel clear); `ipc-parity.mjs` 0. Rust untouched (previous run: 707/0, fmt+clippy clean).
- Gotchas: the `failed` badge state is unit-covered but **unreachable in production today** — the gate refuses failing writes before they land, so a landed-but-failed verdict needs a bypass path (retry / non-gated write / future ladder rung); the changelog says so explicitly. Rows without a verdict render no badge; nothing is invented for shell/office writes.
- Next: 1) P64.5 ladder producers (structured/AST + fuzzy multi-hunk) so the gate's `filesChanged > 1` arm gets a production input — which is also what makes a real `failed` verdict reachable; 2) warm shadow checks (shared build dir) — the synchronous-dispatch latency note stands; 3) Windows run of `git worktree add --detach` staging (P68.7); 4) live model-turn soak, which is what P64.6 and P64.7 gates both still wait on.

**(Previous, 2026-09-18 — P64.6 derived-risk apply path landed (production edits earn the preflight); committed)**:
- Scope: the remaining P64.6 piece from the previous handover — the coordinator now **derives** an edit's risk from the splice itself instead of waiting for a caller flag. `packages/coordinator/src/tools.ts` (+`deriveEditRisk`: structural = declaration-count delta over `fn|class|struct|impl|trait|enum|interface|def|func|type` OR bracket-balance delta; destructive never derived from an in-place splice; `ApplyExactEditOptions.structural/destructive` now only *raise* the gate via `derived || explicit`), `applyExactEdit` sends derived flags + candidate on every edit; `packages/coordinator/src/p64-lane.test.ts` (+4 tests: heuristic units, bracket-balance, no-flag edit arriving at `execution/preflight` with `structural:true`, destructive-never-derived); `TODO.md` P64.6 note updated (stays `[PARTIAL 2026-09-18]`), `SPEC-CHANGELOG.md` 2026-09-18 entry extended (point 6 + rewritten Verification/Not-verified).
- Verified: coordinator `bun test` **401 passed / 0 fail / 1308 expects** (45 files, incl. 37 in `p64-lane.test.ts`); `npx tsc --noEmit` 0. Rust untouched this pass (previous run: `cargo test -p everyaios-core --lib` 707/0, fmt/clippy clean). `check-doc-sync.mjs` + `ipc-parity.mjs` re-run before commit.
- Gotchas: `deriveEditRisk` is deliberately narrow — a merely multi-line edit does NOT fire the gate (cold shadow typecheck costs real build time); over-derivation only buys a check, never a refusal by itself. `structural`/`destructive` remain absent from every model-visible tool schema. An explicit caller flag cannot silence a derived risk (OR-composition, tested). `run_shadow_command` is synchronous inside dispatch — known latency consideration when the gate fires, recorded in the changelog.
- Next: 1) surface `record_preflight` receipts in the P64.7 checkpoint/rollback timeline; 2) multi-file/structured/fuzzy ladder producers (P64.5 remaining rungs) so the gate's `filesChanged > 1` arm gets a production input; 3) consider sharing a target/build dir between the shadow worktree and the root to make fired preflights warm; 4) Windows run of `git worktree add --detach` staging (P68.7 host gap). P64.6 checkbox stays open pending a live model-turn soak on a real repo.

**(Previous, 2026-09-17 — Tier-1 P64 Native Agent Plane wiring implemented, verified, committed)**:

**(Current, 2026-09-17 — Tier-1 P64 Native Agent Plane wiring implemented, verified, committed)**:
- Scope: P64.3 repomap inject (below CACHE_BOUNDARY, segs 1-7 byte-stable) · P64.4 subagent worktree runtime (limits 2/3/6, blocked tools, 3-file blackboards) · P64.5 edit ladder (exact fail-closed → structural splice → fuzzy, Guard-2 ticketed) · P64.6 shadow preflight (risk-gated, PID-tracked, 50KB caps) · P64.7 checkpoint/rollback (kernel auto-checkpoint + fenced restore + timeline UI) · P64.8 skill distill gate (500-line + tests gate) · P64.9 shared-plane façades (16 routes over same 51-tool methods).
- Files: 16 modified + 3 new — crates (blueprint checkpoint/lib/skill_store; core execution/governor/lib/tools/worktrees; mcp lib), coordinator (chat/context-trace/plan/prompt/tools + new p64-lane.test.ts), ui (message-bubble/session-timeline + new lib/checkpoints.ts + turn-checkpoint.tsx).
- Verified: check-doc-sync exit 0 (166 caps, 1429 = 1221 done + 208 open, kernel clear) · ipc-parity exit 0 · ui tsc exit 0 · cargo check touched crates clean · cargo test lib 64 + 175 + 697 pass · security-gate PASS · coordinator p64-lane 21 pass.
- Gotchas: panels/activity-panel.tsx does not exist — UI built on chat/session-timeline.tsx; ARCH/14, ARCH/15, ARCH/11-PROMPT-ANATOMY, ARCH/03-SECURITY-ROUTING, ARCH/05-BROWSER-ENGINE do not exist (contracts taken from ARCH/17 + SPEC only); shell keeps one snapshot per file per session so timeline restores same file set per turn (copy states this); TODO P64.3-P64.9 checkboxes intentionally left open pending live-consumer proof + doc-sync header update.
- Next: Tier-2 P65/P66 Settings center → Tier-3 terminal → Tier-4 swarm/CUA → Tier-5 packaged matrix (P50.5.8/P66.9).

**(Previous, 2026-09-17 — README complete rewrite + full "Switzerland of AI" removal + expanded 2026 multi-tool comparison matrix)**:

**COMPLETED THIS SESSION:**
1. **README.md — Complete Human-Friendly Rewrite & 2026 Multi-Tool Matrix** (`fa2a491`, `ba83ab2`, `532a8bb`):
   - Removed all ASCII box diagrams, competitive bashing, and engineering-heavy architecture sections from the top.
   - Flow: Beautiful casual intro → "What can you actually do with it?" → "Capabilities at a glance" (14 key dimensions) → "How it compares" (expanded late-2026 matrix across EveryAIOS, Claude Desktop & Cowork, OpenAI Codex / ChatGPT, Claude Code CLI, and Cursor / Windsurf) → "The Universal Harness Advantage" note → Installer status → Run from source → Plain-English module table → Architecture in `<details>` dropdown → 10 FAQ dropdowns.
   - Objective, factual, respectful comparison showing EveryAIOS's unique role as a host and desktop operating harness.
2. **"Switzerland of AI" — Removed from ALL docs**:
   - `ARCH/00-INDEX.md`, `ARCH/01-SYSTEM-ARCHITECTURE.md`, `ARCH/02-MODULE-LAYOUT.md`, `ARCH/16-CHAT-LOOP-RUST-PORT.md`, `ARCH/17-NATIVE-AGENT.md` — phrase stripped, substance preserved.
   - `DESKTOP-APP-SPEC.md` lines 81 and 91 — phrase stripped.
   - `SPEC-CHANGELOG.md` lines 23 and 43 — phrase stripped.
   - `README.md` and `TEST-CASES.md` — stripped.
   - `COMPETITIVE-POSITIONING.md` — intentionally untouched (internal strategic doc, not public surface).
3. **Verification**: `node scripts/check-doc-sync.mjs` → exit 0 (166 capabilities, 1429 checkboxes, kernel gate clear).
4. **Committed & pushed**: `532a8bb` → `origin/main`.

---

## 2. Where We Stopped (Latest Progress)
- **Completed Deliverables (2026-09-18 Progress Wave — 17 commits landed)**:
  - **P51.29 / P51.17 / P51.30 / P51.7**: MCP-EXTERNAL floor (`ToolFamily::External`, operation `external_network`, risk `high`, auto-approval blocked on external reads), NPX stdio sandbox launcher (`resolve_stdio_launch_with`, trusted package list, bundled node fallback, shell escape refusal), citation export dump (`formatCitationExport` with `## Sources`).
  - **P51.28 / P51.18**: Model-disabled skill hiding in model catalog (`disable-model-invocation`), MCP autoStart/Start/Stop lifecycle with persistent identity.
  - **P60 Swarm & Runtime**: Reliable combo picking (Case A/B/C), spend warning (>20%), distinct five runtime planes, vision-first perception fusion, mechanical disk verification, `BLOCKED != FAILED` policy, five-part brief on CUA nodes.
  - **P59 CUA Pipeline & Skills**: DAG replanning in Agent-S Manager (`execution/cua_replan`), CUA trace promotion to `SKILL.md`, Progress view CUA DAG visualizer.
  - **P65 Settings & Security**: Native agent surface protection, mutation rollback on failure, OAuth/skills IPC security matrix, provider & connections inventories.
  - **P64 Native Agent Plane**: Edit ladder 3 reachable rungs (Exact $\to$ Token-Exact Structured $\to$ Fuzzy), `applyEditBatch`, derived edit risk, staged shadow worktree preflight isolation, timeline checkpoint preflight badges.
  - **README & Spec Sync**: Human-readable README rewrite, 14-row capability table, 5-column 2026 competitor matrix, 10 FAQ dropdowns.
- **Verification Evidence (All Passed)**:
  - `node scripts/check-doc-sync.mjs` → **exit 0** (166 capabilities in sync, 1429 checkboxes intact = 1264 done + 165 open, kernel gate clear).
  - `node scripts/ipc-parity.mjs` → **exit 0** (321 commands registered).
  - Rust workspace cargo tests: all unit tests passing (`p51_29_mcp_external`, `npx::tests`, `p60_`, `p59_`, `p64_`, `cua::`).
  - UI `bun test` and Coordinator `bun test` passing.
- **Current Census**: **1,429 total = 1,264 done + 165 open** across 1,346 tracked files / 366,004 lines.
- **Current session reconnaissance (read-only, re-measured 2026-09-16):** `desktop_app` only. True scale measured with `git ls-files`: **1,346 tracked files / 366,004 lines** (`rs` 490 files/185,969 lines · `ts` 425/62,625 · `tsx` 144/40,932 · `md` 136/24,283 · `json` 40/24,348 · `mjs` 14/2,081 · `css` 1/712), plus 21 ARCH docs (00–17 + DIAGRAMS + 2 ADR), 93 RESEARCH docs, 47 `src-tauri` files, 141 UI component files, 331 `#[tauri::command]` functions, 2,764 Rust `#[test]` fns, 27 Rust integration-test files, and 134 TS/TSX test files. (Previous entry said 1,331/361,083 and "310 test files" — superseded by this measurement.)
- **Fully or substantially read this session:** all 10 `.agents/skills/*/SKILL.md`; root `AGENTS.md`; `README.md`; `package.json`/`pnpm-workspace.yaml`/`tsconfig.json`/`capabilities.yaml`/`.pre-commit-config.yaml`; all 22 crate `Cargo.toml`s + workspace manifest; all 11 package `package.json`s; `tauri.conf.json`; `ARCH/00`–`ARCH/17`, `DIAGRAMS.md`, `ARCH/ADR/0001`+`0002`; `TODO.md`; substantial portions of `DESKTOP-APP-SPEC.md`, `SPEC-CHANGELOG.md`, `capabilities.yaml`; `src-tauri/src/{lib,state,commands,catalog_cmds,acp_cmds}.rs`; every crate's `lib.rs` module map; `crates/everyaios-core/src/{tools,guard_service,execution}.rs`; `crates/everyaios-guard/src/sandbox.rs`; `crates/everyaios-audit/src/session_log.rs`; `crates/everyaios-memory/src/compaction.rs`; `crates/everyaios-vault/src/broker.rs` (partial); `packages/coordinator/src/{index,chat,plan,tools,router}.ts`; `packages/core-ai/src/{chat/system-prompt,context/tiered-compaction}.ts`; `packages/core-tools/src/{permission-gate,trust-ladder}.ts`; `ui/src/{main,App}.tsx`, `ui/src/lib/{bridge,runtime,tauri}.ts`, `ui/src/lib/store.ts` (partial, 450/2947).
- **Core-code map pass (this wave):** extracted the module-doc header + line count of **every** `.rs`, `.ts` and `.tsx` file in the repo (from each file's own `//!` / leading block comment) to build a verified map, then read in full: `crates/everyaios-ipc/src/{lib,frame,message,channel,handle,budget,socket}.rs` (the whole process contract), `crates/everyaios-types/src/lib.rs`, `crates/everyaios-core/src/{lib,version,capability_manifest,adapter}.rs`, `crates/everyaios-guard/src/{lib,sandbox}.rs`, `crates/everyaios-audit/src/{lib,merkle,session_log}.rs`, `crates/everyaios-memory/src/compaction.rs`, `crates/everyaios-acp/src/acp_cmds`-adjacent domain, `src-tauri/src/{commands,catalog_cmds}.rs`; plus windows of `everyaios-core/src/{chat,guard_service,tools,execution}.rs`, `everyaios-vault/src/broker.rs`, `packages/coordinator/src/{chat,plan,tools,router,index}.ts`, `packages/core-ai/src/{chat/system-prompt,context/tiered-compaction}.ts`, `packages/core-tools/src/{permission-gate,trust-ladder}.ts`.
- **NOT yet read (the honest remainder):** the unrouted tails of the large engine internals — `everyaios-core/src/work_gateway.rs` (reads stopped at the thought-summary helper after ~1500/3533 lines), `everyaios-vault/src/broker.rs` (reads stopped after the streaming entry point at ~400/2205 lines), `everyaios-office/src/xlsx/patch.rs` (stopped inside the test module at ~1327/1621), `everyaios-acp/src/client.rs` (~330/1333), `everyaios-browser/src/actions.rs` (~1000/1879 covering navigation/act/tabs/read/screenshot), `everyaios-cdp/src/browser.rs` (~1000/1164 covering discovery/launch/CfT install), `everyaios-blueprint/src/skill_store.rs` (~1000/1079 covering manifest/store/index/pins), `everyaios-catalog/src/provider_seed.rs` (1742), `everyaios-search/src/lib.rs` (1081), `packages/core-providers/src/registry.ts` (read in full), `packages/core-memory/src/knowledge-graph.ts` (~part of 1061), `ui/src/lib/store.ts` (~1200/2979) — plus 93 RESEARCH docs, ~310 test files, most of the 141 UI component/view/panel files, and the tail of `SPEC-CHANGELOG.md`. No implementation files were changed.
- **Status**: P66.1 / P66.3 (WSL spawn adapter + agent picker redesign), P66.2 (Agent discovery & custom binary import/verify), P66.4 (Session capability loadout backend & UI), and P66.5 (Blue semantic theme & selectable accents) **implemented and machine-verified**.
- **Fresh verified evidence (2026-09-16, this session — commands actually executed):**
  - `node scripts/check-doc-sync.mjs` → **exit 0** — "166 capabilities in sync (yaml == ARCH/09 == spec §0); TODO.md 1428 = 1217 done + 211 open matches header; shell chrome v3.80 matches the changelog; kernel gate clear."
  - `node scripts/ipc-parity.mjs` → **exit 0**.
  - `node scripts/clean-profile-boot-check.mjs` → **PASS** — honest locked/setup boot, doctor Credentials zero-keys count-only, no seeded tasks/scheduler, no sidecar-liveness claim, zero demo/seed markers.
  - `ui/node_modules/.bin/tsc --noEmit -p tsconfig.json` → **exit 0** (zero diagnostics). NB: the documented `pnpm run type-check` fails in a non-TTY shell because pnpm 11 aborts an implicit `pnpm install` module-dir purge (`ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`); invoke the local `tsc` binary instead.
  - `cd crates && cargo check -p everyaios-guard --lib` → **Finished dev profile in 22.23s** (`cargo check` must be run from `crates/`, not the repo root — the workspace manifest lives there).
  - `node scripts/e2e/security-gate.mjs` → **PASS** across all 6 legs (S1 guard deny 189 passed, S2 p10 10 passed, S3 audit 56 passed, S4 mcp 60 passed, S5 ipc-parity 0 broken, S6 approval provenance).
  - `node scripts/e2e/failure-injection.mjs` → **PASS** across all 6 active legs (L1 sidecar restart, L2 vault lock, L3 doctor honest, L4 corrupt persistence, L5 guard suites, L6 version/bogus).
  - `cargo fmt --all -- --check` → **Clean pass, 0 formatting errors**.
  - `packages/core-engine` Vitest OOM resolved with single-fork `vitest.config.ts`.
- **CODE-LEVEL independent verification (2026-09-16, raw code only — docs ignored):**
  - `cd crates && cargo check --workspace --all-targets` → exit 0 (2m18s); `cargo test --workspace --no-fail-fast` → **2,518 passed / 0 failed / 23 ignored** across 73 test binaries, exit 0. Default `cargo test --workspace` → exit 101 on the flaky `bench_browser_snapshot_tree_build` (587.63ms vs the 500ms budget at `crates/everyaios-core/tests/p10_bench.rs:208`); it **passed on re-run** → timing-flaky gate.
  - `cd ui && bun test` → **328 passed / 0 failed / 41 files, exit 0**. `cd packages/coordinator && bun test` → **356 passed / 2 failed / 2 errors, 44 files, exit 1** — both failures are `live-agent-harness.test.ts` spawning the real `opencode` binary (`${HOME}/.bun/bin`, **no skip gate**), plus a `null` exitCode and one dangling process killed by bun. The CI coordinator job installs no such binary.
  - Dead-code scan (module-path references + TS import-graph reachability): **48 Rust modules with zero references anywhere**, including all of `everyaios-engine` (`gate`/`plan`/`risk` — that crate has **zero dependents in any Cargo.toml**); `guard::{loopguard,configscan,ecc}`; `core::{voice,pairing,decline,self_audit,research,report,multirun,migrate,migration,hooks,git_commit,inventory,distill,diagnose,combos,connector_approvals,remote_attach,watcher_glue}`; `memory::{maintain,branch,abort,seek,bench}`; `storage::{trigram,pool,hash_cache,usn_winapi}`; `vault::auth_bridge`; `mcp::record`; `office::provenance`; `script::selfheal`; `browser::{acquisition,har}`; `codeintel::docs_lookup`; `blueprint::{swarm,workflow,worktree,surgical,jobs,inbuilt,helpers,marketplace,plugin_manifest}`. **21 coordinator modules are test-only** (`first-class-tools`, `fleet`, `goal`, `resumable`, `edit-strategies`, `h32`, `mcp-manager/install/catalog`, `mention`, `persona-registry`, `reflection`, `surfaces`, `channel-a`, `capability-seams`, `agent-patterns`, `dream-diary`, `external-inbox`, `migration-import`, `patch-overlay`, `intent`); `ui/src/lib/calendar.ts` is test-only despite 6 registered calendar commands; **60 ghost Tauri commands** per `scripts/ipc-parity.mjs --md` (330 registered / 270 UI-invoked / 0 broken).
  - Implemented≠shipped: `tree-sitter` is **not a dependency** (codeintel repomap is lexical; "tree-sitter precision is a later, optional upgrade" per its own module doc); `hf-hub` is not a dependency (the HF client is hand-rolled over `ureq`).
  - Runtime security boundary as built: strict CSP in `tauri.conf.json`; `src-tauri/capabilities/*.json` grant only `core:*` window controls + `dialog:allow-open` (no `fs`/`shell`/`http` plugin privileges); `guard_cmds::guard_respond` rejects any caller whose window label is not the guard window; the guard window loads only the bundled `guard.html` via `WebviewUrl::App`.
  - Not verified here: the **49 test files under `packages/core-*` are executed by no CI workflow**; `vitest` is not installed in this checkout so those suites could not be run; no Windows target was compiled or run (this host is Linux).
  - Process note: this handover file was concurrently rewritten by another session mid-verification (HEAD moved `974e9ac` → `5419977` → `39ea45e` while tests ran, superseding the earlier draft bullets of this same section). The numbers above are pinned to the working tree as observed during each run; treat neither session's narrative as authority over the other's executed evidence.
- **Working Tree**: Clean and up to date with `origin/main` at commit `f879d8e`.
- **Commits on `origin/main` (`github.com:sarv-projects/EveryAIOS.git`)**:
  - `f879d8e` — `docs(readme): modernize frontier model references and competitor capabilities`
  - `12de9ee` — `docs(readme): update capability matrix, native agent plane, and architecture`
  - `39ea45e` — `docs: update specification, architecture, changelog, and delivery status for native plane and release gates`
  - `5419977` — `fix(guard): add fallback return for sandbox capabilities and stabilize e2e harness`
  - `974e9ac` — **verified actual subject is the single character `\`** (`git log -1 --format=%s 974e9ac`); this entry previously repeated the intended message `perf: record fresh p45 live performance benchmark measurements`, which is not the commit's real subject. Touches only `scripts/p45-live-measurements.json`.
  - `758d25f` — `feat(guard): add windows and macos sandbox capabilities and worktree branch restore`
  - `c0d453a` — `feat(coordinator): wire native tools, context providers, and add performance measurement suite`
  - `3bf7bcf` — `test(coordinator): implement real-world cowork and software benchmark suite`
  - `5ff3c49` — `fix(tauri): correct calendar command return types and add live agent harness verification`
  - `7916591` — `test(coordinator): add multi-agent swarm and cowork capability verification suite`
  - `c2e04ea` — `docs: document multi-agent swarm fleet, avoidance store, calendar ipc, and context mode`
  - `4d1e938` — `feat(core): implement multi-agent fleet worktrees, failure avoidance store, and calendar schema`
  - `e40be8a` — `docs: reconcile runtime evidence status and audit ledger`
  - `c6152d9` — `feat(theme): migrate default brand tokens to cool-blue and add user-selectable accents (P66.5)`
  - `a43c220` — `feat(acp): implement session capability loadout and agent import verification`
  - `8228d74` — `docs: update hero tagline hierarchy and external agent harnesses in README`
  - `7dfd2d2` — `docs: highlight full capabilities including background automations, deep search, and storage intelligence in README`
  - `61bfdd5` — `docs: modernize frontier model references and highlight agent support in README`
  - `d08d438` — `docs: remove external screenshot from README`
  - `25c1284` — `docs: update comparison table and features with 2026 ecosystem capabilities`
  - `76872c5` — `feat(terminal): one PTY plane — shell integration, provenance, and agent terminal executor (v3.80)`
- **Verification evidence (last green run)**:
  - `cargo test -p everyaios-core`: `666 passed, 0 failed` (including `governor::tests`, `worktrees::tests`, `git_queue::tests`).
  - `cargo test -p everyaios-guard`: `all passed, 0 failed` (including `sandbox::tests`, `loopguard::tests`, `netfloor::tests`).
  - `cargo test -p everyaios-memory`: `210 passed, 0 failed` (including `avoid::tests`).
  - `cargo test -p everyaios-vault`: `140 passed, 0 failed` (including `tests::test_calendar_crud_roundtrip`).
  - `cargo test` in `src-tauri`: `41 passed, 0 failed` (including `acp_cmds::tests`, `calendar_cmds` fixed return types).
  - `bun test` in `packages/coordinator`: `358 passed, 0 failed` across 44 files (including `src/live-agent-harness.test.ts` 7/7 passed with real OpenCode ACP handshake and Grok Build CLI and model listings for `opencode/big-pickle` and `grok`, and `src/real-tasks-benchmark.test.ts` 7/7 passed covering real SWE LRUCache, GDPval research synthesis, IronCalc financials, OOXML patching, calendar scheduling, and worktree swarms).
  - `node scripts/measure-perf-p45.mjs`: `P45 Performance Benchmark suite verified — 3546 MB/s read, 1.19M writes/sec, 401k audit events/sec, 19ns route lookup, 153 MB/s JSON throughput`.
  - `node scripts/verify-packaged-e2e.mjs`: `7 passed, 0 failed across store gate, calendar IPC, native tools, @Codebase resolution, avoidance store, worktree isolation, and P45 performance evidence`.
  - `tsc --noEmit` in `ui`: `100% clean type-check across 141 components, 0 errors`.
  - `node scripts/check-doc-sync.mjs`: `✅ doc-sync: 166 capabilities in sync (yaml == ARCH/09 == spec §0); TODO.md 1428 = 1217 done + 211 open matches header; shell chrome v3.80 matches the changelog; ✅ kernel gate clear.`
  - `node scripts/ipc-parity.mjs`: `0 errors (IPC parity clean, 330 registered).`
  - `node scripts/clean-profile-boot-check.mjs`: `[P50.1.7] PASS — clean-profile boot (honest locked/setup, sidecar-absent, zero seeds)`
  - All source-slice implementations intact and committed.
- **Deep-Dive Audit Fleet (Complete Exhaustive Codebase Reads Across 65+ Repos)**:
  - **Multi-Agent Swarm Orchestration**: Verified architectures from `superset-sh/superset`, `ruvnet/ruflo`, `planning-with-files`, `swarms`, `council-of-high-intelligence`, `eigent`, `OpenHands`, `oh-my-claudecode`. Concluded: Primary Chief running 20–30 concurrent subagents must decouple via detached Supervisor daemon, dedicated Git worktrees (`.everyaios/worktrees/task-<id>`), a serialized `GitOperationQueue` (preventing `.git/index.lock` collisions), and 3-file blackboards (`task_plan.md`, `findings.md`, `receipts/`), with disjoint file assignment.
  - **System Prompts & Context Engineering**: Verified raw prompts from Cursor, Windsurf, Devin, Claude Code; analyzed `context-mode` 98% token reduction through sandboxed execution & SQLite FTS5/BM25 indexing; analyzed `Portkey-AI/gateway` & `OmniRoute` circuit breakers and rate-limit mitigation.
  - **Continuous Learning, Taste & Cognitive Memory**: Verified `SEAgent` (Actor-CUA + World-State Judge + Adversarial Failure Imitation), `EvoCUA`, `hermes-agent` closed-loop skill distillation to `SKILL.md`, `taste-skill` anti-slop design tokens, `memU` 3-tier memory, `EverOS` mRAG, `OpenViking` hierarchical context filesystem (`viking://`).
  - **Next-Gen Computer Use & Desktop Operators**: Verified `UI-TARS-desktop`, `Agent-S`, `OpenCUA`, `clawdcursor`, `nuphus-mcp`, `humanlayer` (tri-perception: A11y Tree $\to$ Local OCR $\to$ VLM grounding; coordinate safety barriers; diff cards).
  - **Browser Automation & Stealth Scraping**: Verified `lightpanda-io/browser` (30MB Zig/V8 headless DOM engine), `Scrapling` (structural element relocation, Cloudflare Turnstile bypass), `CloakBrowser` (C++ canvas/WebGL stealth patches), `browser-use`, `cua`, `Agent-Reach` (zero-cost local scrapers).
  - **Durable Workflows & Open WebUI Parity**: Verified `open-webui` (search engine cascade, `#url` web ingestion, conversational calendar, persistent memory), `huginn` event DAGs, Conductor/n8n/Dify durable checkpoints, `googleworkspace/cli`, and Cowork plugin contracts.
- **Latest Work Landed (this wave):**
  1. **Multi-Agent Swarm Fleet Isolation & Concurrency Governor (`everyaios-core`):** Added `GitOperationQueue` (mutex serialization + automatic stale `.git/index.lock` purge), `WorktreeManager` (disk reservation, `.everyaios/worktrees/task-<id>` provisioning, 3-file blackboard initialization `task_plan.md`/`findings.md`/`receipts/`), and `ConcurrencyGovernor` (dynamic resource limit enforcement).
  2. **Failure Refinement Store (`everyaios-memory`):** Implemented `AvoidanceStore` (`avoid.rs`) recording negative constraints and root causes from failed tool executions to prevent repetitive error loops.
  3. **Calendar & AI Automations Schema & IPC (`everyaios-vault`, `src-tauri`, `ui`):** Bumped SQLCipher schema to v8; added `ui_calendars` and `ui_calendar_events` tables and CRUD methods. Added `calendar_cmds.rs` in `src-tauri` registered in `commands.rs` (verified by `ipc-parity.mjs`), and TypeScript bridge in `ui/src/lib/calendar.ts`.
  4. **Prompt Invariants & Context-Mode 50KB Output Ceilings (`packages/coordinator`):** Exported `SINGLE_MATCH_EDIT_INVARIANT` and `CONTEXT_MODE_SUMMARY_INVARIANT` in `prompt.ts`. Added `MAX_TOOL_OUTPUT_CHARS = 51200` truncation ceiling with actionable query hints in `tools.ts`.
  5. **Session Capability Loadout Expansion (`ui/src/lib/capabilities.ts`):** Added `shared:fleet` and `shared:calendar` into `STANDARD_SHARED_CAPABILITIES`.
  6. **Automated Cowork Verification & Benchmark Test Suite (`packages/coordinator/src/cowork-swarm-verification.test.ts` & `testcases.md`):** Rigorously tested agent swapping in picker (OpenCode, Grok Build, Codex, Inbuilt), subagent delegation limits, two-plane shared cowork capabilities, worktree branch isolation, 50KB context mode truncation, and 6 Cowork benchmark problem statements.
  7. **Live Real-World Agent Harness Verification (`packages/coordinator/src/live-agent-harness.test.ts`):** Verified live stdio ACP initialization with installed OpenCode binary (`/home/sarvesh/.bun/bin/opencode` v1.18.31) and Grok Build CLI (`/home/sarvesh/.bun/bin/grok` v1.0.25). Tested free models, primary/subagent dynamic swapping, and selective capability permissions. Fixed `calendar_cmds.rs` return type mismatches in `src-tauri` (`41/41` passed in `cargo test`).

---

## 2A. Module-by-module synthesis (reconnaissance wave 2026-09-16)

### Rust/native plane
- `everyaios-types` and `everyaios-ipc` define the shared wire/domain boundary: length-prefixed JSON frames, request/response correlation, notifications, budgets, and typed protocol values. These are foundational and should remain dependency-light.
- `everyaios-core` is the primary coupling hub. It owns boot/lifecycle, coordinator supervision, chat relay, native tool registry/dispatch, execution, Guard-service integration, terminal/PTY hosting, Work Gateway, scheduling seams, and runtime manifests. The main architectural risk is not missing functionality but concentration: changes here can affect IPC, sidecar recovery, Work durability, security, and UI projections simultaneously.
- `everyaios-vault` is the durable authority for encrypted state, provider credentials, sessions, usage, calendar, and schema migration. Renderer/localStorage state is a cache or preference layer, not a substitute for vault authority. Corrupt-vault behavior is intentionally fail-closed.
- `everyaios-guard` supplies deterministic authorization floors: path/net permissions, prescan, sandbox capability selection, TTL tickets, nonce-bound approvals, and OS-specific containment. `everyaios-audit` supplies Merkle/session evidence and repair/retention semantics. The important invariant is that approval and execution are separate stages; the UI cannot authorize by itself.
- `everyaios-office` owns deterministic OOXML/PDF operations. The XLSX patch path preserves untouched archive parts, applies structural edits, and delegates formula values to recalculation rather than model output. This is high-value but requires Windows acceptance for real Office corpus compatibility.
- `everyaios-browser`/`everyaios-cdp` own installed-browser discovery, capture, navigation, actions, and tier escalation. Browser state is shell-owned and dropped with the live session; credentials stay outside the coordinator.
- `everyaios-acp`/`everyaios-mcp` own external-agent and external-tool protocol seams. ACP is a bidirectional JSON-RPC session with interleaved notifications and sandbox-aware process transport; MCP attach/live-child identity and Guard-2 ticketing are explicit containment boundaries.
- `everyaios-memory`, `storage`, `codeintel`, `blueprint`, `script`, `agents`, `eval`, `search`, `desktop`, and `catalog` are specialized capability crates. Their public entry points are clear, but the reachability scan found several modules that are test-only or unreferenced; implementation presence must not be counted as runtime availability.

### Tauri shell and IPC
- `src-tauri/src/commands.rs` is the single generated handler. This prevents the Tauri replacement-handler trap and gives `ipc-parity.mjs` one authoritative registration surface.
- `AppState` centralizes live privileged handles: vault, Guard, audit, chat relay, PTY host, browser, MCP children/tokens, desktop engine, artifact servers, local model downloads, and catalog state. This preserves ownership but creates a large lock/cleanup surface; lifecycle and lock-order reviews are warranted before adding more fields.
- Capability JSON intentionally grants only window/tray/dialog primitives; filesystem, shell, and network effects flow through Rust commands and their own Guard/floor checks. The dedicated approval window is a security boundary, not merely a UI route.

### TypeScript sidecar and core packages
- `packages/coordinator` is the sidecar orchestration layer: chat streaming, prompt construction, routing, tool dispatch, planning, scheduler, and wire protocol. It is supervised and broker-mediated; it must not become a second authority for secrets, persistence, or privileged effects.
- `core-domain` provides shared types; `core-ai` provides prompt policy, RAG envelopes, context tiers, compression, and routing guards; `core-tools` provides schemas/trust ladder/permission evaluation; `core-engine` provides a reusable conversation engine with retrieval/tool planning, bounded tool rounds, agent sandbox limits, risk assessment, persistence, trajectories, artifacts, and memory hooks.
- The key positive security pattern is defense in depth: surface contract → retrieval/tool plan → per-agent sandbox → permission gate → native executor. Unknown host tool IDs are delegated to the host authority, while catalog tools fail closed on wrong surfaces.
- The key implementation risk is duplicated or partially overlapping paths: the coordinator engine, native Rust engine seams, and test-only core packages can drift unless contract tests continue to pin wire shapes and ownership.
- `core-providers` contains a broad catalog and provider metadata, while live provider credentials/health remain shell/vault concerns. Catalog rows are not proof of configured, reachable, or launchable runtime state.
- `core-memory` includes a rule-based entity/triple graph and spreading activation. It is intentionally cost-free but heuristic; graph output must remain provenance-tagged and must not be treated as authoritative facts without source grounding.

### UI, bridge, and state
- `ui/src/lib/bridge.ts` is the event translation boundary from Tauri/coordinator notifications into Zustand state. It routes streams by session and stream ID, rejects stale/late events, handles Guard cards, tool progress, budgets, ACP, Work, and readiness projections.
- `ui/src/lib/store.ts` is a large projection/state machine rather than a persistence authority. It correctly starts empty in Tauri, uses preview fixtures only outside Tauri, preserves local-only sessions during vault hydration, and keeps stream/queue state session-scoped. Its size is the largest frontend maintainability risk; future work should extract slices without changing wire ownership.
- Shell components divide responsibilities into center content, right-rail workbench, left navigation, status/readiness bars, chat composer/panel, and gates. Live surfaces are expected to derive from bridge/runtime evidence; preview must never be represented as acceptance.
- The UI has strong contract-oriented tests for runtime truth, capability status, Guard UX, stream routing, catalog/provider provenance, calendar/task wire casing, desktop readiness, terminal bytes, first-run behavior, and plain-language output. These tests protect semantics more than pixel fidelity; real Windows/display/browser acceptance remains separate.

### Scripts and verification
- `ipc-parity.mjs` checks registered Rust commands against UI invocation references, but the current scan still identifies many registered-without-UI commands. That is not automatically a defect—some commands are backend/agent/internal—but each ghost should be classified as internal, future, or missing UI coverage.
- `check-doc-sync.mjs` validates capability counts, TODO arithmetic, kernel-gate presence, and selected version/changelog synchrony. It does not prove implementation reachability or platform readiness.
- `clean-profile-boot-check.mjs`, `security-gate.mjs`, and `failure-injection.mjs` emphasize honest empty/locked/corrupt/degraded states and real evidence. Their SKIP semantics are important: missing providers, displays, binaries, or Windows hosts must remain unverified rather than fake-passing.
- The E2E protocol harness mirrors the Rust frame protocol and can drive a real coordinator/provider path. Provider tests use actual endpoints when configured and otherwise exit SKIP; credentials are not embedded in fixtures.

### Cross-cutting risks and open questions
1. **Authority duplication risk:** determine which production path is canonical for every chat/tool turn (native Rust relay versus reusable TypeScript `core-engine`) and document the adapter boundary. Test-only reachability does not establish production ownership.
2. **IPC surface scale:** 331 command functions and a large `AppState` increase registration, lock-order, cleanup, and compatibility risk. Classify ghost commands and consider generated schema/ownership metadata rather than relying only on textual parity.
3. **Platform evidence gap:** Linux checks cannot establish Windows Job Objects, ConPTY, Windows App Paths/WSL launchability, Office corpus behavior, CDP profile behavior, or Computer Use driver readiness. P66.6–P66.9 remain release-critical.
4. **Provider catalog freshness:** the broad static catalog contains current-looking model/provider claims, but metadata is not live verification. Keep user-facing states separate: cataloged, keyed, probed, reachable, and selected.
5. **Heuristic grounding:** prompt envelopes and risk compass reduce injection/hallucination risk but do not prove factual correctness. Citation invariant checks are diagnostic; source provenance and acceptance tests must remain authoritative.
6. **Large-file mutation correctness:** XLSX byte surgery, browser actions, ACP interleaving, Work Gateway concurrency, and vault migrations need focused failure/recovery tests whenever touched. Avoid broad refactors until the exact contract is pinned.
7. **Test execution coverage:** Rust and UI suites have strong evidence in the handover, but core-package suites and real external-agent/provider harnesses are environment-dependent and have previously failed or skipped when binaries/dependencies were absent. CI should make the intended matrix explicit.
8. **Documentation drift:** current handover text contains stale historical claims and old version references in places. Treat executed command output and current source as evidence; reconcile `CURRENT_RUN.md`, `TODO.md`, README, and changelog before release claims.

### Additional deep-read findings
- `everyaios-core::WorkGateway` is a durable projection/event layer over the ExecutionKernel, not an effect executor. It models Work addresses, replayable domain/operational/presence/runtime events, PTY/worktree/agent-session lifecycles, client capabilities, run authority fencing, capability grants, reviews, steering, attachments, and runtime-manifest hashes. It fail-closes malformed journals and rejects unauthenticated steering, but its local JSONL journal is not itself a Merkle ledger; audit correlation remains a separate responsibility.
- `everyaios-browser::BrowserActions` enforces the observe → act → invalidate → re-observe lifecycle for accessibility refs, resolves geometry through CDP backend node IDs, supports deterministic test humanization, and always returns a post-action diff. The design appropriately treats stale refs as an error. Selector/evaluate/read paths still depend on the browser page and must remain constrained by the surrounding command Guard/floor.
- `everyaios-cdp::browser` separates discovery, profile mode, launch, DevToolsActivePort acquisition, managed Chrome-for-Testing fallback, and zip-slip-safe extraction. It uses loopback dynamic ports and isolated profiles by default. The launch/download paths are platform-sensitive and therefore require host acceptance, not only mock-server tests.
- `everyaios-office::xlsx::patch` performs archive-part surgery with explicit errors, style preservation, formula placeholders followed by engine recalculation, row/column shifts, merge/dimension updates, sort/fill/pivot, and shared-string append. The implementation has broad unit fixtures; compatibility with arbitrary producer-generated workbooks remains an integration concern.
- `everyaios-blueprint::skill_store` treats skills as bounded, versioned files: strict slug validation, 500-line cap, lazy scripts/references, deterministic relevance selection capped at 20, install-time SHA-256 pins, and tamper detection. A pin-ledger write is best-effort and a missing pin degrades to unverifiable rather than verified; runtime callers must preserve that distinction.

### Credential / accounting boundary (`everyaios-vault`)
- `broker` is the single credential choke point: the sidecar sends `{provider, model, body}` and never holds a key. It resolves a key through the `KeyRing`, injects auth, zeroizes temporary buffers, applies cache-aware pricing to the append-only `token_usage` ledger, enforces the per-session dollar budget, and fails closed on unknown providers before any HTTP attempt.
- Dialect handling is explicit (`WireTransport`: OpenAI chat vs Anthropic messages) with per-provider endpoint resolution, so an unsupported transport is simply not registered rather than POSTing a wrong-shaped request. Keyless local runtimes bypass the ring entirely and record zero-dollar usage.
- `egress` is a default-block outbound credential firewall: it scans payloads against managed secrets and high-precision secret-shaped patterns, and only `AllowWithReason` permits a trip. This is a strong defense-in-depth control, though it is pattern-based and cannot replace never putting secrets in payloads to begin with.
- `session_budget` is an in-memory kill switch (default $2.00/session) mirrored by the durable ledger. The in-memory tracker is process-local, so durable spend accounting must be read from the ledger for cross-restart truth.
- `session` (the browser session vault) enforces the trust model structurally: the agent sees only opaque ids plus metadata, and raw cookie/storage values flow only through `inject` gated by a per-agent trust level, with a `session_uses` audit row per capture/inject/rotate/revoke/deny.
- `keyring` selection covers status tiers, routing policies, per-key model filters, exponential cooldown, daily token/cost budgets, credential affinity, and handle-only health reporting. Note that `auth_bridge` appears in the earlier reachability scan as referenced only from tests/other crates; the live connector OAuth path is `oauth`/`oauth_cmds`, so treat `auth_bridge` as a secondary or legacy seam until confirmed.

### Native tool registry (`everyaios-core::tools`)
- One registry owns tool identity, family, description, read-only flag, operation class, risk level, computed risk tier, and JSON schema; aliases map user/model-facing ids (e.g. `office.docx_patch`, `file_ops.write`) onto canonical entries. `canonical_args_hash` provides a deterministic argument hash for ticket binding.
- External MCP tools reconcile in with native precedence: an already-registered id is skipped, so an external server can never shadow a built-in. This is the correct containment direction and is covered by security-gate leg S4.
- Risk/operation classification is derived centrally (`classify`, `risk_of`, `operation_of`) rather than left to call sites, which keeps the Guard floor consistent.

### Coordinator tool contract (`packages/coordinator/src/tools.ts`)
- The sidecar's tool path is propose-then-commit (`tool/exec` → optional `tool/commit`), never auto-consuming an approval ticket, with a loop breaker on repeated identical tool+args hashes.
- First-class native tools (`ask`, `plan`, `todo`, `subagent`) are merged with the catalog without duplication, sorted by id for prompt-cache byte stability, and capped at `MAX_ACTIVE_TOOLS = 20` per turn. **Superseded in part by §2Y (2026-09-17, P54.5):** the cap is still 20, but the loop's own tools (`LOOP_PINNED_TOOL_IDS` — the four first-class tools plus `script.run`, `file_ops.read`/`list`/`write`/`replace`, `search.query`) are now **mounted every turn** rather than left to the scorer, which is what had left the agent without a shell for ordinary requests.
- `subagent` carries an explicit shared-capability grant list (`shared:office`, `shared:browser`, `shared:desktop`, `shared:calendar`), which is the intended way to hand a scoped cowork capability to a delegated agent rather than granting blanket access.

### Chief dispatch (`packages/coordinator/src/chat.ts`)
- The turn contract is adapter-based: the inbuilt engine owns the real `ConversationEngine` turn, while any non-inbuilt Chief resolves to an adapter that refuses with an explicit routing error instead of silently falling back. That no-silent-fallback guarantee is the correct interpretation of the two-plane contract, and it means external-agent turns are driven by the UI over the ACP channel.
- Budget semantics are explicitly *not* credit semantics: the hard dollar budget lives in Rust, and the coordinator passes the `budget_exceeded` / `stopped: $X limit` error through untouched so the UI shows the exact limit string.

### UI surfaces confirmed live-backed
- `office-xlsx-view` is a real windowed grid over `xlsx_open` with overscan virtualization, cached windows, a read-only lock while the agent runs (unless the user took over), and ticketed writes that require a returned ticket id plus approval nonce before commit. No fabricated numbers are rendered; recalc results come from the engine.
- `browse-view` derives attachment state from `browser_status`, reports it to the shared store, and only claims a live CDP session when one is attached; the read tab can use the tiered static/light/Chrome path while the snapshot tab correctly requires a live page for refs.
- `ide-workbench` mirrors VS Code structure over Rust backends (real FS explorer, real git SCM, real LSP diagnostics, the single PTY terminal plane) and marks search/run/extensions as honest placeholders rather than pretending they work.

### Coverage boundary
This wave completes the architectural/module map and reads the high-value boundary implementations plus the credential/accounting, tool-registry, coordinator-tool, chief-dispatch, and representative UI view surfaces. It does **not** honestly claim line-by-line reading of every tracked source/test/UI file. Remaining bounded reads are the unread tails of `work_gateway.rs`, `broker.rs`, `xlsx/patch.rs`, the remaining office DOCTOR/PDF/PPTX internals, the rest of the store, most of the 141 UI components (including the `ui/src/components/ui/*` shadcn primitives), the full core-package test corpus, and the 93-doc research corpus. No product implementation files were changed in this reconnaissance wave.

## 2B. Gap audit — not-done / bugs / verification state (2026-09-16, evidence-tagged)

Tag legend: `[V]` verified by an executed command this session · `[V-prior]` verified by an executed command in the prior wave (not re-run here) · `[CODE]` verified by direct source inspection · `[DOC]` asserted by repository documentation only, not re-verified · `[UNTESTED]` no evidence exists.

### A. NOT DONE — product capability gaps
1. **Voice input (P50.4.3)** — VAD/STT stack unimplemented. Promoted to v1 scope, stack absent; composer mic is disabled with a "v1-pending" state. `[DOC]`
2. **Voice output (P50.4.4)** — TTS/read-aloud unimplemented; v1 scope. `[DOC]`
3. **Image generation (P50.4.5)** — post-v1; zero chrome in the build (correctly hidden). `[DOC]`
4. **WASM sandbox (P50.4.6)** — wasmtime/fuel-budget/epoch-interruption absent; `rquickjs` is documented as defense-in-depth only, never containment. `[DOC]`
5. **Remote session handoff / mobile pairing (P50.4.7)** — post-v1; switches inert/disabled. `[DOC]`
6. **Privacy & cost honesty (P50.4.10)** — "100% Private"/provider/model/token/cost/audit badges not proven to derive from live runtime state rather than seeded or stale values. `[DOC]`
7. **Persona selector UI** — the data path exists (`personas.ts`, store `setPersonaId`, bridge sends `personaId`/`soulMd`) but **no UI dropdown exists**; `setPersonaId` has zero component consumers. Deferred post-v1. `[DOC]`
8. **LadybugDB C++ FFI** — `GraphBackend` swap-in seam landed; the binding itself not built. `[DOC]`
9. **Signal adapter + always-on daemon + iMessage** — deferred post-v1. `[DOC]`
10. **LAN/Tailscale/tunnel view of running sessions** — not done. `[DOC]`
11. **Resume from phone mid-run** — not done. `[DOC]`
12. **Hyperframes agent-generated video** — not done. `[DOC]`
13. **Clipboard surface (H26)** — post-v1. `[DOC]`
14. **~~A8 local OpenAI-compatible server is materially incomplete~~ — CLOSED 2026-09-16 (one residue).** `tools`/`tool_choice`/`parallel_tool_calls` are now forwarded upstream; native `tool_calls` are returned (with `finish_reason: tool_calls`); `delta.tool_calls` fragments ride the SSE stream; an assistant `content: null` + `tool_calls` and a `tool` result with `tool_call_id` now parse instead of 400ing; and the live backend streams **incrementally per upstream chunk** via the new `Broker::chat_completion_stream_cb` (the `stream()` trait default is no longer used). **Residue:** the bearer token is still minted per boot, so a client must re-read the config after a restart. Spec A8 + ARCH/09 A8 row + TODO P9.5 updated to match. `[V]` → §2C
15. **~~Computer use — autonomous path not wired~~ — FIXED 2026-09-16 (see §2D).** The engine is attached to the effect funnel at boot (`desktop_cmds::publish_desktop_backend` → `ChatRelay::attach_desktop`), so `desktop.see`/`desktop.act`/`desktop.window_list` are reachable by the inbuilt agent. Still honest: on a headless/no-display host nothing attaches and the tool keeps fail-closing with `desktop session not attached` (by design), and the platform-specific acceptance (A16–A20) remains unproven here. `[V]`
16. **Computer use — platform twins incomplete** — Linux AT-SPI `Action.Invoke` missing (needs an AT-SPI/D-Bus client); macOS AX-by-point invoke missing (needs an `ApplicationServices` FFI layer); the shared allow-list audit across platform twins is unfinished. `[DOC]`
17. **Computer use — WGC capture lacks runtime evidence** — P57.6 Windows.Graphics.Capture is implemented and cross-compile/clippy clean, but no Windows runner has produced pixels. `[DOC]`
18. **Search — packaged UI citation leg unproven** — the live citation/trajectory rendering path is not proven in the packaged UI; P52.20 is recorded as having zero citation producers. `[DOC]`
19. **macOS desktop automation is honestly partial** — `foreground_restore: false`; Background coordinate click/scroll/drag refuse on macOS. `[DOC]`
20. **Linux Background synthetic click may be ignored by the target app** (e.g. Tk) — whether an app honours the synthetic event is the app's decision, so the effect is per-app unproven. `[DOC]`
21. **Code intelligence is lexical, not AST-precise** — `tree-sitter` is **not a dependency**; the repomap/symbol path is lexical by its own module doc. `[CODE]`
22. **HF client is hand-rolled** — `hf-hub` is not a dependency; the Hugging Face client is custom over `ureq`. `[CODE]`
23. **Microsoft Graph connector (F14 v2)** — post-v1. `[DOC]`
24. **Full two-zone data-release firewall (K5)** — post-v1. `[DOC]`

### B. NOT DONE — release verification gates (this is the release-critical list)
1. **P50.5.8 Cross-platform release matrix — NOT DONE.** No green Windows or macOS run is recorded anywhere. Linux leg is the only one with local evidence. `[DOC]`
2. **P50.5.7 Security release gate — PARTIAL.** Implemented and passing *below* the packaged-shell line. Explicitly uncovered: interactive packaged guard-window click-through, the packaged renderer-compromise path, and **native platform sandbox backend enforcement** (declarative profiles only). `[DOC]`
3. **P50.5.2 Real search E2E — PARTIAL.** Crate/protocol legs landed; packaged/UI leg and a current live re-run are open. `[DOC]`
4. **P50.2.1 Sessions — open** (packaged/UI E2E click-through only; all code-level races closed). `[DOC]`
5. **P50.2.2 Memory — open** (packaged verification only). `[DOC]`
6. **P50.2.5 Analytics & notifications — open** (packaged verification only). `[DOC]`
7. **Kernel gate — CLEAR.** All 3 gate items (P48.2, P48.4, P47.5) are `[DONE]`. `[V]`

### C. IMPLEMENTED BUT NOT WIRED / UNREACHABLE (the biggest honesty gap)
1. **~~Provider capability probes never run in production~~ — FIXED 2026-09-16 (see §2D).** The gap was real: `apply_probe`/`capabilities_verified_at` existed with **zero call sites outside their own module**, so the catalog's "advertised ≠ verified" rule was library-only and routing read `verified_report: None` forever. Now every probe the product runs persists a durable `ProviderObservation` (`crates/everyaios-catalog/src/observations.rs`) and every claim-feeding registry replays them (`catalog_cmds::observed_registry`), so `capabilities_verified_at`/`verified_report`/routing health describe real observations. **Open remainder (new, explicit):** no boot-time probe sweep for keyed providers — that needs a vault-mediated probe (an unauthenticated probe would fabricate false 401 observations), which does not exist yet. `[V]`
2. **~~`attach_desktop` has no production caller~~ — FIXED 2026-09-16 (see §2D).** `ChatRelay::attach_desktop` is now called at boot with a real `DesktopEngineBackend` adapter, and the provenance hole that blocked it was closed at the source (agent acts are no longer filed as human gestures). `[V]`
3. **60 ghost Tauri commands** (registered, no UI invocation). Notable: all 20 `work_*` data-plane commands, `provider_health_probe`, `audit_compact`, `tasks_sweep`, `skills_learn`, `repomap_build`, `file_outline`, `model_aliases_resolve`, `ai_markers_scan`, and the vault lifecycle commands (`probe_vault`, `vault_setup`, `vault_unlock`, `session_list`). Each needs classification as internal / planned / missing-UI. `[V]`
4. **`agui-event` is emitted by the shell with zero UI listeners** — the only unused event. `[V]`
5. **48 Rust modules have zero references** (prior scan), including the entire `everyaios-engine` crate (gate/plan/risk) which has **zero dependents in any `Cargo.toml`**. `[V-prior]`
6. **21 coordinator modules are test-only** (prior scan). `[V-prior]`
7. **Correction to a prior claim:** `ui/src/lib/calendar.ts` is **not** test-only — `ipc-parity` shows the six calendar commands invoked live from it. The earlier "test-only" note is superseded. `[V]`
8. **~~Stale doc-comment in `AppState`~~ — RETRACTED 2026-09-16.** `src-tauri/src/state.rs` was re-read: there is **no** dangling `shell_cmds` doc-comment. The only remaining `shell_cmds` references are accurate historical notes in `commands.rs`/`terminal_cmds.rs`/`work_cmds.rs` explaining that the retired piped path is gone. The prior claim was wrong; nothing to fix. `[V]`

### D. BUGS / DEFECTS
1. **Malformed commit subject in `main` history.** `974e9ac`'s full subject is a single backslash `\` (`git log --format=%h %s`). Still present, 5 commits from HEAD. `[V]`
2. **The Conventional-Commits rule is violated throughout history**, not just once. Non-conventional subjects still reachable: `9db3dd3`, `f71fd26`, `6c6d87a`, `df85f67`, `645e949` ("ui updates"), `802205a`, `81688f1`, `2372b04`, `14a6de3`, `974e9ac`. Any current complaint about the newest commits is a pre-existing pattern. `[V]`
3. **~~Timing-flaky release gate~~ — FIXED 2026-09-16.** `bench_browser_snapshot_tree_build` no longer asserts on a single wall-clock sample. The root cause is real and was measured: five consecutive samples on an idle machine spread **8.71 ms → 26.94 ms (≈3×)**, so under `cargo test`'s parallel runner one unlucky sample can clear any tight budget while the code is fine. It now takes the **best of 5** samples — the minimum excludes additive noise, and a genuine regression raises the minimum too, so the gate still bites. `[V]`
4. **~~Environment-dependent failing tests with no skip gate~~ — FIXED 2026-09-16.** `live-agent-harness.test.ts` now probes for the real binaries and `test.skipIf(!hasBinary)`-skips them with a named warning line. Negative test (restricted `PATH`): **4 skip / 0 fail** where it previously produced 2 failed + 2 errors; with the binaries present it is **7 pass / 0 fail**. `[V]`
5. **~~Second flaky test~~ — RETRACTED 2026-09-16.** `llamafile_healthy_probes_health_endpoint` (`crates/everyaios-core/src/local_tests.rs`) is **already hardened**: a 200×10 ms readiness poll, a 12-attempt probe retry loop, and an environmental-skip path that first proves the mock answers a blocking `GET` before blaming the code under test. The flake it described no longer exists; nothing was changed. `[V]`
6. **~~CI coverage hole~~ — FIXED 2026-09-16.** The `sidecar` job in `.github/workflows/ci.yml` now runs `pnpm --filter './packages/core-*' run test` after building the vendored packages. All ten `core-*` packages declare `test: vitest run` and own vitest as a devDependency (49 test files), so the step needs no extra install. **Still unverified locally:** vitest is absent from this checkout, so those suites remain unrun *here* — the fix is a CI-coverage fix, not local evidence. `[V]`
7. **~~Doc drift — version stamp~~ — FIXED 2026-09-16, and now guarded.** `TODO.md`'s header stamp moved `v3.78 → v3.80`, and `scripts/check-doc-sync.mjs` gained check 7, which fails when `TODO.md`'s "current doc revision" disagrees with the newest `SPEC-CHANGELOG.md` heading. Proven by negative test (stamp set to v3.77 → exit 1 with the exact message; restored → exit 0). `[V]`
8. **~~Doc drift — superseded provider claim~~ — FIXED 2026-09-16.** SPEC A1's stale "Live HTTP (2026-09-10)" note was replaced with a 2026-09-16 note: the broker **does** emit `x-opencode-session`/`x-opencode-request`/`x-opencode-client` + `User-Agent: EveryAIOS/<version>` on the OpenCode rows (v3.73/P56.6, which already superseded it in `ARCH/03`), the boot pass **does** register connected-set endpoints (`catalog_cmds::resolve_endpoints` → `ChatRelay::with_endpoint`), and the OpenCode-free overlay **is** live in the broker. `[V]`
9. **~~Doc drift — superseded routing claim~~ — FIXED 2026-09-16 (one claim deliberately kept).** SPEC A11's tail now records the landed endpoint resolution + two-way `refresh_endpoint_live` reconciliation, and keeps the still-true part: `routing_feed_decide` is picker UX (its only caller is `ui/src/lib/discovery.ts`), and the coordinator still carries last-resort provider defaults in its own router. It also now states the **real open A11 gap in bold**: nothing on the production transport calls `apply_probe`/`mark_verified`, so `capabilities_verified_at` is never written on the live path. `[V]`
10. **~~Stale path in an agent guidance file~~ — FIXED 2026-09-16.** `.agents/skills/browser-computer-use/SKILL.md` now reads `crates/everyaios-desktop` (package `everyaios-computeruse`) with an explicit note that the directory and package names differ. `[V]`
11. **`everyaios-engine` is a dead crate** with no dependents — it cannot affect runtime behaviour, but it is compiled, linted, and counted. `[V-prior]`
12. **Honesty hazard — A8 server — RESOLVED 2026-09-16.** It now forwards `tools`/`tool_choice` and returns real `tool_calls`, so it is no longer misleading about being a usable endpoint. The remaining honest caveat (per-boot bearer token) is stated in the spec row itself. `[V]`
13. **Two red CI gates existed at HEAD and were unreported by any prior audit — FIXED 2026-09-16.** (a) `cargo fmt --all -- --check` (the `rust` job's working directory is `crates`) **failed at HEAD** on 9 committed files: `everyaios-cdp/src/{browser,lib}.rs`, `everyaios-core/src/{git_queue,governor,shell_integration,terminal,worktrees}.rs`, `everyaios-memory/src/avoid.rs`, `everyaios-vault/src/lib.rs`. (b) `cargo clippy --all-targets --all-features -- -D warnings` **failed at HEAD** on: `everyaios-guard/src/ticket.rs` (`doc_lazy_continuation`), `everyaios-cdp/src/browser.rs` ×2 (`derivable_impls`), `everyaios-core/src/{chat,sync_transport,terminal}.rs` (doc list + too-many-arguments + `op_ref` + `field_reassign_with_default` ×5), `everyaios-guard/src/netfloor.rs` (`useless_conversion`), `everyaios-desktop/src/{apps,launch}.rs` (`unnecessary clone` ×7), `everyaios-desktop/tests/live_linux_e2e.rs` (`zombie_processes` — a killed-but-unreaped `python3` fixture ×2). Both gates are now **green**. Note the `.rs` fmt drift is *not* covered for `src-tauri/`, whose own fmt drift (`acp_cmds.rs`, `calendar_cmds.rs`, `terminal_cmds.rs`) was left alone because no workflow formats or checks that workspace. `[V]`
14. **Latent behaviour trap avoided while fixing D13.** `everyaios-cdp::BrowserConfig`'s `Default` is implemented **by hand** precisely because the dynamic default is `headless: true` + `extra_args: ["--mute-audio"]`; the clippy `derivable_impls` suggestion would have silently replaced that with `false` / `[]` (a visible-browser regression). Only `BrowserChannel` and `BrowserProfileMode` were switched to `#[derive(Default)]`; `BrowserConfig` kept its manual impl and gained a note explaining why. `[V]`

### E. VERIFIED — what actually has executed evidence
Fresh this session:
- `node scripts/check-doc-sync.mjs` → **exit 0** — 166 capabilities in sync (yaml == ARCH/09 == spec §0); TODO.md 1428 = 1220 done + 208 open matches header; shell chrome v3.80 matches the changelog; kernel gate clear. `[V]`
- `node scripts/ipc-parity.mjs` → **exit 0** — 330 registered · 326 defined · 270 UI-invoked · **0 broken** · 0 unregistered definitions · 0 dead events · 60 ghosts · 1 unused event. `[V]`
- Working tree **clean**, HEAD `f879d8e`. `[V]`

Prior wave (not re-run by me):
- `security-gate.mjs` PASS across S1–S6 (guard deny 189, p10 10, audit 56, mcp 60, parity 0 broken, approval provenance). `[V-prior]`
- `failure-injection.mjs` PASS across L1–L6; **L7 (Chrome) SKIP — no display**. `[V-prior]`
- `clean-profile-boot-check.mjs` PASS — honest locked/setup, zero seeds, no sidecar-liveness claim. `[V-prior]`
- `cargo test --workspace --no-fail-fast` → 2,518 passed / 0 failed / 23 ignored; default run exits 101 on the flaky bench. `[V-prior]`
- `ui` `bun test` → 328 passed / 0 failed. `[V-prior]`
- `packages/coordinator` `bun test` → 356 passed / **2 failed / 2 errors**. `[V-prior]`
- `tsc --noEmit` → exit 0 (zero diagnostics). `[V-prior]`
- `cargo fmt --all -- --check` → clean. `[V-prior]`

### F. NOT TESTED / CANNOT BE TESTED HERE
1. **Windows — nothing compiled or run.** Unverified: Job Objects sandbox, ConPTY, WGC capture, `ShellExecuteEx` launch + `SW_SHOWNOACTIVATE`, Windows App Paths / WSL launchability discovery, NSIS/MSI installers, updater. `[UNTESTED]`
2. **macOS — nothing compiled or run.** Unverified: Seatbelt, Accessibility/TCC, `open -g`, DMG. `[UNTESTED]`
3. **Real Office corpus acceptance** — no DOCX/XLSX/PPTX/PDF producer matrix; byte-surgery correctness is proven only against crafted unit fixtures. `[UNTESTED]`
4. **Browser live attach on a display** — L7 SKIP; live Chrome legs gated behind `EVERYAIOS_E2E_CHROME=1`. `[UNTESTED]`
5. **Provider live legs** — env-gated (NVIDIA / OpenAI / Ollama); not run. `[UNTESTED]`
6. **Packaged-shell interactive click-through** (the P50.5.8 manual checklist) — not performed. `[UNTESTED]`
7. **Native platform sandbox enforcement** — declarative profiles only; no enforcement test executed on any platform. `[UNTESTED]`
8. **Real multi-GB local model download + serve** — not performed. `[UNTESTED]`
9. **`packages/core-*` suites (49 files)** — not run; `vitest` absent from this workspace. `[UNTESTED]`
10. **Live ACP agent interop** — needs installed external CLIs; environment-dependent, previously failed without them. `[UNTESTED]`
11. **Coverage gap in this reconnaissance itself** — 93 RESEARCH docs, ~310 test files, and 138 of 141 UI components were not read; the tails of `work_gateway.rs`, `broker.rs`, `xlsx/patch.rs`, `acp/client.rs`, and `store.ts` remain unread. `[UNTESTED]`

## 2C. Implementation wave 2026-09-16 — what changed, and what was deliberately NOT changed

### Changed (all verified; no capability rows added, census unchanged at 166)
1. **A8 tool-calling + real incremental SSE (closes A14).**
   - `crates/everyaios-vault/src/broker.rs`: new `Broker::chat_completion_stream_cb(provider, model, session_id, body, on_event)` — the incremental twin of `chat_completion_stream`, which is now a thin wrapper over it. `parse_sse` / `parse_sse_anthropic` gained `_with` callback forms; the buffered `parse_sse` stays for the local path. `a RefCell bridges the `Fn`-bounded failover runner to the `&mut` callback so the failover signature did not widen. Events fire only for a successful attempt, so a rotated 429/401 never emits a partial answer; a mid-body transport error is surfaced in-band (documented). Local runtimes replay buffered events (documented asymmetry, not papered over).
   - `crates/everyaios-core/src/openai_server.rs`: `ChatMessage` gained `tool_call_id` + `tool_calls` and a null-tolerant `content`; `ChatCompletionRequest` gained `tools` / `tool_choice` / `parallel_tool_calls`; new `ToolCallOut` / `ToolCallFunction` / `finish_reason_of` / `StreamPiece`; `non_stream_body` emits `tool_calls` + the real finish reason; new `stream_tool_call_chunk` (with `type:"function"` on the naming fragment); `stream_completion` now consumes `StreamPiece`.
   - `src-tauri/src/openai_cmds.rs`: `BrokerBackend::upstream_body` forwards the tool fields and replays the client's tool history; `shape()` parses `tool_calls` (tolerating an object-valued `arguments`); `BrokerBackend::stream` overrides the trait default with the incremental broker call and reconstructs the aggregate call via `everyaios_vault::assemble_tool_calls`.
   - `crates/everyaios-core/src/lib.rs`: re-exports the new public types.
   - Tests: A8 unit tests 16 → **22** (incl. null-content tool history, tool-call chunk shape, tool-call finish reason, and a **real-socket** streaming tool-call leg); broker +2 (incremental callback ordering + a direct Anthropic dialect parse).
2. **Test-gate reliability (D3, D4)** and **CI coverage (D6)** — see §2B D3/D4/D6 for the mechanism and the negative-test evidence.
3. **Doc reconciliation (D7–D10)** — `TODO.md`, `DESKTOP-APP-SPEC.md` (A1 + A11 + A8), `ARCH/09-FEATURE-MATRIX.md` (A8), `scripts/check-doc-sync.mjs` (+check 7), `.agents/skills/browser-computer-use/SKILL.md`.
4. **The two red CI gates (D13)** — `cargo fmt --all` on 9 files; 16 clippy findings fixed across 9 files (one `#[allow]` pair with rationale: `chat.rs::start_plan` arity, and a module-scoped `field_reassign_with_default` in `terminal.rs`'s test module).

### Executed evidence (fresh, this session)
- `cargo fmt --all -- --check` → **CLEAN** (was failing at HEAD).
- `cargo clippy --workspace --all-targets --all-features -- -D warnings` → **CLEAN** (was failing at HEAD on 2 crates before the first fix and 4 more behind it).
- `cargo test -p everyaios-core --all-features` → **673 lib + 44 integration passing, 0 failed** (incl. the bench's 5-sample form).
- `cargo test -p everyaios-vault --lib` → **142 passed / 0 failed**. `-p everyaios-guard -p everyaios-cdp -p everyaios-computeruse` → **61 / 49 / 189 passed, 0 failed**. `-p everyaios-memory -p everyaios-audit` → **211 / 56 passed, 0 failed**.
- `cargo test --workspace --all-features --no-fail-fast --exclude everyaios-core --exclude everyaios-vault` → **exit 0 · 60 result blocks · 1668 passed · 0 failures** (aggregate for the remaining workspace, incl. office 173, script 24, storage 54, search 26, mcp 8, types 3, acp/browser/catalog/codeintel/blueprint/agents/eval/engine/ipc).
- `cargo test --lib` in `src-tauri` → **39 passed / 0 failed / 1 ignored**.
- `cargo check --all-targets` in `src-tauri` → **clean**.
- `packages/coordinator`: `bun run type-check` → exit 0; `bun test` → **358 passed / 0 failed** across 44 files (was 356 passed / 2 failed / 2 errors).
- Restricted-`PATH` negative test of the new skip gate → **4 skip / 0 fail** (was 2 failed + 2 errors).
- `ui` `tsc --noEmit` → **exit 0**.
- `node scripts/check-doc-sync.mjs` → **exit 0** — 166 in sync; `1429 = 1221 done + 208 open`; shell chrome v3.80 **and** TODO header v3.80 match the changelog; kernel gate clear. Negative test proved check 7 fires.
- `node scripts/ipc-parity.mjs` → **exit 0** — 330 registered / 326 defined / 270 UI-invoked / **0 broken** / 0 unregistered / 0 dead events / 60 ghosts / 1 unused event.
- `node scripts/clean-profile-boot-check.mjs` → **PASS** (honest locked/setup, zero seeds, no sidecar-liveness claim).
- **Total Rust coverage executed this session: 2,527 passing / 0 failing** (1668 + 717 core + 142 vault).

### Deliberately NOT changed — surfaced instead of guessed
- **~~§2B A15 / C2 — `attach_desktop` NOT wired~~ — SUPERSEDED 2026-09-16 by §2D.** The provenance blocker described here was real and was closed properly at the source (a provenance parameter threaded through `everyaios-computeruse`'s audit path, so an agent act records as agent authority instead of being filed as a human gesture), then the host wiring landed. Kept here as the reasoning trail: the sequencing it recommended — fix provenance first, then wire — is exactly what §2D did, and the Guard-2 card surface is still the remaining product call for risky acts.
- **§2B A16–A20** (Linux AT-SPI `Action.Invoke`, macOS AX-by-point invoke, WGC runtime evidence, packaged citation leg, macOS/Linux Background synthetic input) — **not implemented**: each needs a platform host (Windows/macOS) or a live display this machine does not have, and the readiness contract makes an unverifiable implementation worse than an honest `unverified`.
- **§2B A21/A22** (`tree-sitter`, `hf-hub`) — **not added**: both are new third-party dependency trees, not fixes, and neither is required for correctness today (the lexical repomap is documented, the hand-rolled HF client works). Adding them would be a scope decision plus a supply-chain decision.
- **§2B C1 (`apply_probe`/`capabilities_verified_at` never written on the live path)** — **not wired**: `catalog_cmds::probe_provider` already performs the `MetadataOnly` probe but only calls `register_endpoint`; stamping verification is a *routing-semantics* change (it would start gating provider selection on probe results) and belongs to the A11 owner, with the probe-safety policy (`MetadataOnly` default, never billable) respected. The audit trail is now recorded in SPEC A11 in bold instead of silently.
- **§2B C5/D11 (`everyaios-engine` zero-dependency crate)** and **C3 (60 ghost commands)** — **not deleted / not classified**: deleting a crate with tests and a documented rationale is not a justified autonomous change, and the ghost list needs an owner per command. Both stay recorded.
- **§2B C4 (`agui-event` emitted, no UI listener)** — **not given a fake consumer**: the AG-UI Tauri surface is absent from the UI *by design* (generative UI H25 is deferred post-v1); `agui_send` and `agui_listen` are likewise never invoked. Instead the two places that implied it was live (`agui.rs` module doc, `ChatRelay::with_agui`) now state the real build state and cite the parity evidence, so nobody mistakes the emitter for a working feature.

---

## 2D. Implementation wave 2 (2026-09-16) — computer-use autonomous path + A11 probe write-back

Both halves of this wave are the same kind of fix: **making an existing mechanism actually reachable on the live path**, without inventing a parallel one.

### Changed — computer-use autonomous path (closes §2B A15 / C2)
- `crates/everyaios-desktop/src/policy.rs` + `lib.rs`: **provenance is threaded through the audit path** instead of assumed. `ActProvenance` reaches `AuditSink`/`DesktopGuard`/`DesktopEngine::act`, so a host can record *who* acted. This was the actual blocker — previously the only sink hardcoded `AuthKind::HumanGesture`, so wiring the agent tool would have filed **agent-initiated desktop actions as human gestures** (a confused-deputy audit lie).
- `src-tauri/src/desktop_cmds.rs`: new `DesktopEngineBackend` adapter implementing the core trait, plus `publish_desktop_backend`, and pure helpers (`provenance → authority class`, `policy_json`) with tests. It is **best-effort and honest on failure**: a headless/no-display host attaches nothing and `desktop.*` keeps fail-closing with `desktop session not attached` rather than pretending to drive a GUI.
- `crates/everyaios-core/src/chat.rs`: `ChatRelay::attach_desktop` (mirrors the existing `attach_terminal`/browser seams — no new registry, no second engine).
- `src-tauri/src/lib.rs`: attached at boot **before** the relay is published, so no agent turn can race ahead of the executor.
- Tests: src-tauri lib 39 → **47** (provenance mapping, policy contract fields, observation write-back — see below).

### Changed — A11 capability-probe write-back (closes §2B C1)
- **New `crates/everyaios-catalog/src/observations.rs`** — a durable per-provider observation store (`<data_dir>/provider-observations.json`, atomic tmp+rename, tolerant read: a malformed file degrades to *no observations*, never to a partially-trusted set). It carries **runtime truth only** — no identity, no aliases, no auth shape — matching the spec's ProviderIdentity / ProviderProfile / **ProviderObservation** split.
- **Three honesty rules, enforced in code and tested:**
  1. A **failed** probe is recorded (real error history, with its status) but **never** verifies.
  2. A `MetadataOnly` (`/v1/models`) probe **cannot confirm a hard capability** — `observed_model_ids` stays empty (the probe counts models, it does not enumerate ids), every advertised cap is `Unverified`, and `trusted_capabilities` stays empty. So replaying one makes a provider *observed*, never *trusted*.
  3. **Root-cause fix in `probe.rs`:** `hard_caps_verified` was **vacuously true** when nothing was advertised — so a bare reachability probe could read as "fully verified" / `Healthy` in `ResourceCard::from_provider`. It now requires at least one **confirmed** capability, and fails closed.
- **Write-back is on the live path:** `catalog_cmds::probe_provider` (the command the Settings → Providers verify flow calls, `ui/src/components/panels/settings-providers.tsx:491`) persists the observation. Recording is best-effort by design — a write failure is reported on stderr and never turns a successful probe into an error.
- **Replay onto every claim-feeding registry:** new `catalog_cmds::observed_registry()` (identity layer + recorded observations) replaces bare `base_registry()` in the provider rows, the endpoint-resolution context, the discovery inventory, and `routing_feed_decide`. Routing now derives **health from observations** (`health_of`: answered → `Healthy` · transport failure (`status == 0`) → `Down` · answered rejection (401/429) → `Degraded`) instead of the previous blanket `Unknown`. A new read-only `RoutingFeed::health_of` accessor makes that test-observable.
- **Keying:** `ObservationStore::record_resolved` canonicalizes through the registry, so `claude` and `anthropic` cannot become two rows with two different truths; `apply_probe` stays alias-aware for legacy files.
- **UI:** `CatalogProviderRow` gained `observedAt` / `reachable` / `observedModelCount`, and the Settings row renders a **`last check failed`** badge when `reachable === false`. The observable/verifiable facts are now separated in the UI rather than collapsed into one "verified" claim.
- **Docs reconciled:** `DESKTOP-APP-SPEC.md` A11 (the bold "capability-probe math is still library-only … that is the open A11 gap" sentence is now the landed state **plus the real remaining gap**), `ARCH/09-FEATURE-MATRIX.md` A11, `TODO.md` header. Census unchanged at **166**; `doc-sync` green.

### Executed evidence (fresh, this wave)
- `cargo fmt --all -- --check` (crates workspace — a **CI gate**) → **CLEAN**.
- `cargo clippy --all-targets --all-features -- -D warnings` (crates) → **CLEAN**.
- `cargo test --workspace --all-features --no-fail-fast` → **2540 passed / 0 failed / 23 ignored**.
- `cargo test -p everyaios-catalog --all-features` → **116 passed / 0 failed** (new module: store round-trip + key folding, malformed-file, failed-probe-never-verifies, reachability-does-not-confirm-hard-caps, no-vacuous-fully-verified, unknown-provider-not-invented, health mapping).
- `src-tauri`: `cargo check --all-targets` clean · `cargo fmt --check` clean · `cargo clippy --all-targets --all-features -- -D warnings` **clean** (one pre-existing, ungated finding — `vault_key_add`'s 10-arg IPC contract — resolved with a rationale'd `#[allow(clippy::too_many_arguments)]`) · `cargo test --lib` → **47 passed / 0 failed / 1 ignored**.
- `ui`: `tsc --noEmit` → **exit 0** · `bun test` → **328 passed / 0 failed**.
- `packages/coordinator`: `bun test` → **358 passed / 0 failed**.
- `node scripts/check-doc-sync.mjs` → **exit 0** (166 in sync; `1429 = 1221 done + 208 open`; both v3.80 stamps).
- `node scripts/ipc-parity.mjs` → **exit 0** — **0 broken**, 0 unregistered definitions, 60 ghosts (unchanged pre-existing set).
- `node scripts/clean-profile-boot-check.mjs` → **PASS** (honest locked/setup, zero seeds — the new observation file is not created at boot, only on a probe).
- Diff hygiene: `cargo fmt` had also reformatted three **unrelated** pre-existing-drift files in `src-tauri` (`acp_cmds.rs`, `calendar_cmds.rs`, `terminal_cmds.rs`); they were **reverted** to keep the diff scoped, and `src-tauri` is not fmt-gated by CI.

### Deliberately NOT changed this wave
- **No boot-time probe sweep** (see §3 item 5) — needs the vault-mediated-probe decision; an unauthenticated sweep would fabricate false 401/Degraded observations.
- **No `tree-sitter` / `hf-hub` dependencies** (A21/A22) — still dependency/supply-chain decisions, not correctness fixes.
- **No capability rows added, no registries duplicated.** `observations.rs` is a store, not a registry: identity stays owned by `provider.rs`.

---

## 2E. Implementation wave 3 (2026-09-16) — vault-mediated provider probe + boot sweep

The A11 remainder from §2D, implemented as the security-boundary change it was flagged as being — not as a workaround.

### The problem this solves
After wave 2, an observation existed only when a user pressed **verify** in Settings, because that flow has a plaintext key in hand. A keyed provider that had never been verified stayed `Unknown` forever: probing it requires the credential, and the credential is not the host's to read.

### Changed — the vault owns the credentialed probe
- `crates/everyaios-vault/src/keyring.rs`: new **`KeyRing::reveal_for_metadata_probe(provider)`**. Deliberately not `select`: a probe has **no model**, so a `model_filter` must not disqualify the key (otherwise the best-configured providers are the only unprobeable ones); it writes **no affinity**; and it moves **no key health, cooldown or budget**. It still honours a **suspension** — that is the user's instruction, not a rate-limit state. The duplicated fallback logic was extracted into one private `highest_priority_credential`, now shared with `reveal_for_spawn` (behaviour unchanged, retested).
- `crates/everyaios-vault/src/broker.rs`: new **`Broker::probe_models(provider, timeout) -> ModelsProbe`** + `Broker::models_url` + `ProviderEndpoint::models_url` + `credential_safe_url`. Four constraints, each deliberate: the URL is **the provider's own resolved endpoint** (there is no URL parameter, so the credential cannot be aimed elsewhere); **`https` or loopback only** (cleartext remote is refused — `BrokerError::InsecureEndpoint`); it is **not a turn** (no ledger row, no session budget, no `report_success`/`report_failure` — a metadata `401` can never suspend the user's key); keyless providers send **no** auth header, matching the chat path. Returns status + body only, so model-listing parsing stays in `everyaios-catalog`.
- `crates/everyaios-catalog/src/fetch.rs`: `count_models` is now public and the probe-result shape moved into one shared **`endpoint_probe_result(url, status, body, error)`** that `probe_models_endpoint` also uses. Both probe paths therefore cannot disagree about what `ok`/`models`/`message` mean. (Side benefit: `ok` is now status-derived rather than hardcoded `200`.)

### Changed — sweep over the connected set
- `src-tauri/src/catalog_cmds.rs`: `probe_provider_vault` (lock → broker → map) and the extracted **`observation_from_probe`** that encodes the failure policy: a broker error yields **no observation**, never a fabricated failed one — `AllKeysExhausted`/`InsecureEndpoint` are "we could not check", not a claim about the provider. Plus **`sweep_connected_providers`** (one `ResolveCtx` for the whole pass, so the 200-provider registry and the snapshot are read once rather than per provider) and **`spawn_observation_sweep`** (off-thread, sequential, 8 s per provider, a panic-safe in-flight guard so two sweeps never race).
- `src-tauri/src/lib.rs`: sweeps are triggered where the connected set actually changes — **boot** (via `spawn_boot_observation_sweep`, at most **once per process**, because `connect_chat_relay` re-runs on every sidecar respawn and a crash loop must not re-dial everything) and **vault setup / unlock** (which is what brings the keyed providers into that set). Both are fire-and-forget: the unlock response never waits on a network call.

### Executed evidence (fresh, this wave)
- `cargo test -p everyaios-vault --lib` → **156 passed / 0 failed** (was 142; +6 keyring, +8 broker — including a real-socket probe that asserts the vault key is attached, that a `401` leaves `fail_count`/`cooldown`/`last_used_at` untouched, that a transport failure reports **status 0** with no invented HTTP code, that a keyless probe sends no credential, that Anthropic uses `x-api-key`, and that a cleartext remote endpoint is refused).
- `cargo test -p everyaios-catalog --all-features` → **116 passed / 0 failed** (the refactor is behaviour-preserving).
- `cargo test --workspace --all-features --no-fail-fast` → **2554 passed / 0 failed / 23 ignored**.
- `cargo fmt --all -- --check` + `cargo clippy --workspace --all-targets --all-features -- -D warnings` → **CLEAN**.
- `src-tauri`: `cargo check --all-targets` clean · `cargo clippy --all-targets --all-features -- -D warnings` **clean** · `cargo test` (all targets) → **52 passed / 0 failed / 1 ignored** (50 lib incl. 3 new + `registration_sync` 2 — the added `AppHandle` params do not affect command registration or the JS call shape).
- `ui` `tsc --noEmit` clean · `bun test` → **328 passed / 0 failed**. `check-doc-sync.mjs` exit 0 · `ipc-parity.mjs` **0 broken** (60 ghosts, unchanged) · `clean-profile-boot-check.mjs` **PASS**.
- Diff hygiene: `cargo fmt` in `src-tauri` again reformatted the three unrelated pre-existing-drift files (`acp_cmds`, `calendar_cmds`, `terminal_cmds`) — **reverted**.

### Honest limits of this wave
- **No end-to-end test of `probe_provider_vault` itself.** `AppState` has no constructor (it is built inline in `lib.rs`'s `setup` and carries ~30 live fields), so the host seam is covered by its two extracted pure pieces (the shaping rule and the no-observation-on-error policy) plus the broker's own real-socket tests; the glue between them is one line. Stated rather than papered over.
- The sweep contacts any connected **keyless** provider at boot (they are already in the dial plan). Bounded at 8 s each, sequential, off-thread.

---

## 2F. Architecture / HLD / LLD audit (2026-09-17) — 22 of 26 units complete

**Ledger: `../EVERYAIOS-ARCH-AUDIT.md` (2,212 lines, outside the git repo so the
frozen doc set is untouched).** This is a *design* audit, not a gate audit: every
unit judges actual execution path, accuracy, HLD/LLD and current best practice,
with each claim tagged `[VERIFIED]` (line-level, re-checked) or `[READ]`
(structural inference).

**Why it exists:** the user's challenge was correct. All prior "verification" in
this repo — including my own in waves 2D/2E — was gate-driven (`cargo test`,
clippy, `ipc-parity`, doc-sync). That proves a function is *correct*; it does not
prove a *capability is reached*. `AGENTS.md` §3.2 declares the architecture
"frozen", and "frozen" was being read as "correct". This audit separates them.

**ALL 26 UNITS COMPLETE (2026-09-17).** 24 Rust crates, 11 TS packages, 45 host
modules, 137 UI components, ~212,000 LOC. §26 (line ~2640 of the ledger) holds the
whole-system synthesis: the four finding classes, the nine cross-boundary leaks,
why the gates could not see any of it, and a **P0-P4 ranked remediation plan**,
plus §26.6 (measured strengths) and §26.7 (the two structural mistakes and the
single change that fixes both).

**Units 24-26 additions (2026-09-17, second pass):**
- **Unit 24 `packages/`** — 11 packages / 32,780 LOC. *Positive:* a clean **acyclic**
  package DAG (3 leaves, no cycles) — better layered than the Rust workspace; the
  prior-wave "core-* tests run in no CI workflow" gap is **CLOSED**
  (`ci.yml:186-195` with the reason written next to the fix); `ci.yml:152-181`
  enforces vendoring parity. *Defects:* **two provider catalogs** (Rust
  `everyaios-catalog` 212 rows/models.dev vs TS `core-providers` 15/280/pi.dev)
  bridged by a **5-entry hand-written id map** (`catalog.ts:29
  BROKER_TO_CATALOG_ID`); the router's tool-calling decision is a **name regex with
  a fail-open default** (`supportToolsHeuristic` returns `true` for unknown models)
  while Rust owns `capabilities_verified_at`; `costScore` maps *unknown* to **0 =
  free** and feeds the route scorer; **`ProviderVault`** (a full TS BYOK vault with
  `getApiKey` returning plaintext, AES-GCM via `core-security`) is **unwired** —
  good for "keys never touch TS", bad as a third credential path one constructor
  away.
- **Unit 25 `ui/src`** — 54,596 LOC / 137 components / 25 view files (not 58k/141).
  *Positive:* the preview/live rule is **consistently implemented** (six gated mock
  sources, explicit `bridgeCall({live, preview})` seam in 10 lib modules, visible
  `preview` badges); the status bar **refuses to invent numbers**
  (`cacheHitRate == null → '—'` + "unavailable until the live usage ledger
  responds"); **`guard-main.ts` is the strongest security design in the codebase**
  (separate Vite entry + separate webview, no React/no iframes, no preview data by
  design, Rust accepts the decision only from that window's label — the correct
  human-gesture provenance that unit 11 shows the control socket does *not* use).
  *Defects:* size concentration only (`store.ts` 2,979 LOC); 15 unused files, 13 of
  which are ordinary unused shadcn primitives.
- **Three of my own candidate findings were WITHDRAWN** after reading adjacent
  lines: the Guard panel's `demoActivityRows` (gated directly above it), the
  `KillSwitch` (unit 20 — live via `desktop_stop`/`is_stopped`), and `guard-main.ts`
  "never imported" (it is a Vite entry). Plus two near-misses caught before
  publishing (`office/xlsx` premise-false; the `core-files` dependency that exists
  only in comments). **The ledger records these explicitly** — the method is only
  worth something if the withdrawals are as visible as the confirmations.

**The single highest-leverage fix in the whole audit** (§26.5 P2 item 9): the
project's own `scripts/ipc-parity.mjs` **already computes** the 60-command ghost set
and exits 0 on it, and its invocation regex
(`invoke(?:<[^>(]*>)?\(`) cannot span a generic containing a parenthesis, so it
reports live commands (`session_list`, `vault_setup`/`vault_unlock`) as ghosts —
which is why the list is not read. Fix the matcher, then fail CI on `work_*`-class
ghosts. That one change converts an advisory report into the detector this audit
had to hand-build four times.

**The findings that matter, in severity order:**

1. **`everyaios-script`'s QuickJS sandbox — the repo's most-tested security
   control — is never instantiated in production `[VERIFIED]`.**
   `Sandbox::new` has exactly three call sites in the entire repository and all
   three are tests. `forge.rs:130` / `automation_runtime.rs:75` hold
   `Arc<dyn ScriptSandbox>` and only ever receive a `StubSandbox`/`FakeScript`.
   The sandbox's limits ARE proven (4 real tests incl. `while (true) {}`
   timeouts) — which is precisely why the gates could not see this. Meanwhile
   `TODO.md:231/562/982` mark P2.5 and the `script.run` dispatch `[DONE]`, while
   `TODO.md:359` ("Not ChatRelay-wired") and `src-tauri/lib.rs:154` (P68.9:
   "`script.run` runs on the PTY plane") are the accurate statements, and
   `ARCH/01:10` still lists ScriptEval as a live core component.
2. **External agents launch unsandboxed `[VERIFIED]`.**
   `src-tauri/src/acp_cmds.rs:1101` calls `ProcessTransport::spawn` (plain
   `Command::new`). The bwrap variant `spawn_sandboxed` is `#[cfg(linux)]`,
   correct, tested — and called only from its own test. So on the one platform
   with a working backend the sandbox is bypassed; on Windows/macOS no backend
   exists at all (a platform gap to state, not a Linux oversight).
3. **The semantic cache silently substitutes wrong answers `[VERIFIED]`.**
   `chat.ts:676` keys `memory/cache_get` on the raw user `text` only — no
   session, agent, persona or history — over one process-global store, and a hit
   emits a synthetic `done`. With `0.85` applied to token-set **Jaccard** (a
   cosine constant on a different metric), "read the attached *document*" vs
   "read the attached *spreadsheet*" scores 0.875 → hit. Cross-context answer
   bleed, presented as a completed turn. The `readOnlyTurn` guard reasons about
   *mutation*; the hazard is *substitution*.
4. **The live WebMCP bearer token is printed to stderr at boot `[VERIFIED]`**
   (`boot.rs:70`, called from `lib.rs:865`) — a direct `AGENTS.md` §11 violation
   ("never expose in logs"). Latent today (the executor is a `NotAttached` stub)
   and it becomes real the moment a CDP session is attached. Its doc comment
   also asserts a "caller filter" that does not exist (no `peer_addr`/
   `SO_PEERCRED` anywhere), and claims "128 bits of entropy" from two hashers
   that share one `RandomState` seed.
5. **Computer use can act but never verify `[VERIFIED]`.**
   `act_with_verify` → `verify_until` → `EngineObserver` → `ocr_window` is a
   closed chain with no host caller; `vision_click`/`see_region` likewise. The
   action path (`desktop_act`) is live. `desktop_status` still reports an `ocr`
   capability flag to Settings.
6. **The confinement/posture layer is the most-built and least-invoked thing in
   the codebase `[VERIFIED]`** — arriving from three directions: guard
   `sandbox.rs`/`seccomp.rs`/`path_seal`/`fs_broker` (unit 6, several marked
   `[DONE]` in TODO), `everyaios-mcp::attach` (`spawn_confined`/`is_sandboxed`
   0 callers; only `SandboxPosture::preferred()` is read), and ACP above.
7. **`ARCH/01:10` names an MCP server that does not exist `[VERIFIED]`**: "MCP
   server (rust-sdk, 127.0.0.1:9200/mcp)". No Rust code binds 9200 (`9200`
   appears only in that doc, a `UI-DESIGN-PROMPT.md` dev-badge, and the
   BrowserOS research note it was copied from); no `rmcp`/`modelcontextprotocol`
   dependency exists in any `Cargo.toml` (the layer is hand-rolled against the
   2026-07-28 stateless spec); and the live server is
   `everyaios-browser::webmcp_http` on an ephemeral port.
8. **`xlsx/planner.rs` (530 LOC)** — declared in `xlsx/mod.rs`, advertised in
   `office/src/lib.rs:21` as one of six xlsx layers, `plan_prompt` has zero
   callers. **`blueprint`'s `subagent.rs`** exposes unreferenced
   `derive_child_permissions`/`DEFAULT_DENY_TASK_TOOLS`/`depth_of`.
   **`everyaios-engine`** (1,086 LOC) has zero dependents — and its private
   `RiskLevel` collides by name with `everyaios-types`' across a security
   boundary, so unit 1's fix requires deleting it.
9. **`everyaios-core` is a 43,617-LOC accumulator, not a tangle `[READ]`.**
   Genuinely dead: `git_commit.rs` (211, incl. `commit_verified_edit` — a
   "never commit a lie" guard), `inventory.rs` (139). Named capabilities with no
   caller: the Forge runtime, tracing, voice, migration, email/calendar,
   messaging adapters, research/citations, distillation, reporting, hooks, and
   the guard-**configuration** API (`set_autonomy_level`/`set_approval_policy`/
   `set_human_floor` — the decision path is live, this seam has no writers).

**Methodological corrections recorded in the ledger (do not re-litigate):**
- The reachability detector **excludes the defining file**, so any `pub` item used
  only inside its own module reads as dead. Verified against
  `scheduler_service.rs` (all 7 sampled "dead" symbols are live-and-internal) and
  `CronExpr` (live at `:1455`, `:1821`). Units 7-20 counts must be read as "not
  referenced outside its module." A correct detector subtracts intra-module use,
  is item-level, and is method-call-aware.
- Four false-positive modes: pub-but-internal, implicit return types, re-export
  chains, method-call access (this last one nearly produced a false security
  finding on `KillSwitch`, which is live via `desktop_stop`/`is_stopped`).
- A near-miss was **caught**: I almost reported all ~3,962 LOC of
  `everyaios-office/xlsx` as unreachable from reading `office_cmds.rs` alone.
  It is false — `src-tauri/src/xlsx_cmds.rs` exists and 7 xlsx commands are
  registered (`commands.rs:142-148`).
- Two roster corrections: `crates/` is **24**, `packages/` is **11** (not 13);
  `everyaios-core` is 43,617 LOC / 75 files (not 49,743 / 96);
  `everyaios-agents` is **live** (unit-6 table row struck through);
  `everyaios-desktop` is the computer-use crate (no separate pkg).

**Also recorded as positives, because the audit is not uniform decay:**
`everyaios-cdp` and `everyaios-codeintel` are clean and wired
proportional to size; `everyaios-office` has 27/31 modules fully referenced and
all nine security-adjacent document modules live (`pdf/redact.rs` does real
object-level redaction); `everyaios-script::artifact::serve` implements a
correct path floor with tests; ACP's `installer.rs` is the best security design
in the repo (**refuses sha256-unpinned downloads outright**, verifies before
extracting, confines archive members); `everyaios-desktop`'s platform twins fail
closed with typed, explanatory errors; `launch.rs` env scrubbing is live and
correctly name-filtered.

## 2G. Implementation wave 4 (2026-09-17) — P65 Settings reachability + typed UI seam

**Scope taken:** finish the in-flight Tier-2 (P65) item — make the Settings
Control Center backend actually reachable, and give the UI one typed seam onto
it. This closes the defect that the prior commit (`792dbaf`) left behind.

### The defect inherited at HEAD
`792dbaf` added `src-tauri/src/settings_cmds.rs` (1,608 LOC, 11 `#[tauri::command]`
fns, all the §17.12.2 read models + the §17.12.3 mutation funnel) but **never
declared the module** and **never registered the commands**. `grep -r settings_cmds
src-tauri/` returned zero matches. It was invisible to the compiler, unreachable
from the UI, and would have **failed** `tests/registration_sync.rs` — which walks
`src/` off the filesystem, not the module tree, so an undeclared file still counts.

### Changed
1. **Wired the module (the actual fix).**
   - `src-tauri/src/lib.rs`: `mod settings_cmds;` (with the reason).
   - `src-tauri/src/commands.rs`: `use crate::settings_cmds;` + all **11** commands
     added to the single `generate_handler![...]` list. One handler, one registry —
     no second registration surface was created.
2. **Fixed a real contract violation found while writing the TS types.**
   `RuntimeLocation` carried `#[serde(tag = "kind", rename_all = "snake_case")]`.
   On an enum that renames the **variants** only, never the struct-variant fields,
   so it was the one struct in the module emitting snake_case (`install_root`,
   `linux_path`, `windows_launcher`) where ARCH/17 §17.12.4 mandates camelCase
   (`installRoot`, `linuxPath`, `windowsLauncher`). Each variant now carries its own
   `rename_all = "camelCase"` (variant-level, so it works on any serde 1.x — no
   `rename_all_fields` version floor). Safe against the reader: `runtime_location_from_json`
   is a **manual** JSON parser, not a `serde::from_value`, so deserialization is unaffected.
3. **New `ui/src/lib/settings.ts`** — the typed client for all 11 commands, mirroring
   §17.12.2 exactly (incl. the §17.12.4 `RuntimeLocation` union, the §17.12.3 mutation
   envelope, and the §17.12.5 loadout rows). Honours two repo rules: keys cross by
   `authRef` reference only, and **preview invents nothing** — with no shell it returns
   empty inventories so panels render their honest empty state instead of a fabricated
   green row.
4. **`ui/src/globals.css`** — 3 stale comments corrected (they said "orange" for a
   colour that has resolved to `--brand` since P66.5; comment-only, no behaviour change).

### Evidence actually executed (fresh, this session)
- Replicated `registration_sync.rs`'s exact parsing in Node: **341 defined == 341
  registered · 0 unregistered · 0 extra** (was **341 defined / 330 registered → 11
  unregistered → the test would have failed**). Both of that test's assertions pass. `[V]`
- `node scripts/ipc-parity.mjs` → exit 0 · **registered 341 · broken 0 ·
  unregisteredDefinitions 0 · deadEvents 0 · ghosts 60**. Ghosts were **71** immediately
  after registration and fell to **60** once `settings.ts` landed — i.e. the 11 new
  commands went from registered-with-no-caller to UI-invoked, returning the ghost set to
  exactly its pre-existing size. That is independent evidence the UI seam is real. `[V]`
- `node scripts/check-doc-sync.mjs` → exit 0 · 166 capabilities in sync ·
  `1429 = 1221 done + 208 open` · both v3.80 stamps · kernel gate clear. `[V]`
- Dependency pre-flight on the orphaned module before wiring it: all 8 cross-module
  helpers it calls exist (`acp_cmds::{agent_installed,launch_registry,runtime_location_for}`,
  `agent_backend_cmds::{backend_binding_view,has_managed_binding}`,
  `catalog_cmds::provider_rows`, `guard_cmds::guard_set_policy_rules`,
  `scheduler_cmds::scheduler_handle` — the first six are `pub(crate)`), and every
  `AppState` field it touches exists (`vault`, `guard_service`, `catalog`, `mcp_servers`,
  `mcp_remote_tokens`, `acp_sessions`). `[V]`

### NOT VERIFIED — stated plainly, not papered over
- **No Rust toolchain on this host** (`cargo`, `rustc`, `rustup` all absent). Therefore
  **`cargo check`, `cargo clippy`, `cargo fmt` and `cargo test` were NOT run** on any
  change in this wave. The Rust edits are verified **statically only** (symbol
  existence, `AppState` field existence, registration-set balance) — never compiled.
  Treat all Rust in §2G as `[UNVERIFIED]`.
- **No `node_modules` and no `tsc`** (only `@tauri-apps` is installed). Therefore
  **`ui/src/lib/settings.ts` and the `globals.css` edit were NOT type-checked.** Under
  this repo's `strict` + `exactOptionalPropertyTypes` + `noUncheckedIndexedAccess`
  settings, an un-run `tsc` is not evidence. Treat the TS in §2G as `[UNVERIFIED]`.
- `bun` is absent, so the coordinator suite could not be run either.
- Only the two Node gates above could execute; that is the whole of this wave's evidence.

### Findings worth recording
1. **P66.5 (Blue semantic theme) is already implemented, and implemented the right way.**
   The plan describes it as "complete the removal of legacy hardcoded orange CSS utility
   classes" across the views. Measurement says otherwise: there are **975** `orange-*`/`amber-*`
   utility hits, but `ui/src/globals.css` already retargets them centrally —
   `--color-orange-500: hsl(var(--brand))`, `--color-orange-600: hsl(var(--brand-hover))`,
   `--color-amber-500: hsl(var(--warning))`, under the comment *"Keep legacy utility names on
   the spec's semantic palette."* With `--primary: 221 83% 53%` (light) / `217 91% 60%` (dark)
   this is **exactly** the cool-blue the plan mandates. So the classes stay in markup while
   rendering blue — a central alias, not 975 edits. **A bulk find-and-replace here would have
   been a regression**: `amber` is also legitimately `--warning` (e.g. `schedules-section`
   renders "paused" as amber), so blanket-rebranding it would have destroyed real warning
   semantics. No sweep was performed. `[V]`
2. **The plan's file paths are stale** (verified one by one): there is no `desktop_app/`
   directory (the repo root *is* the app); `ARCH/14-REPO-MAP.md`, `ARCH/15-BLUEPRINT-ENGINE.md`,
   `ARCH/11-PROMPT-ANATOMY.md`, `ARCH/03-SECURITY-ROUTING.md`, `ARCH/05-BROWSER-ENGINE.md`
   do not exist (real: `13-PROMPT-ANATOMY`, `03-BYOK-KEYRINGS`, `08-BROWSER-LAYER`, and there is
   no repo-map or blueprint-engine doc); `.agents/skills/*` does not exist in this repo; the
   `ui/src/components/settings/*-tab.tsx` targets do not exist (real: `components/panels/settings-*.tsx`);
   `ui/src/components/panels/activity-panel.tsx` and `ui/src/components/viewports/terminal-viewport.tsx`
   do not exist; `scheduler.rs` → `scheduler_service.rs`; and `everyaios-computeruse/src/lib.rs`
   is really `crates/everyaios-desktop/src/lib.rs` (package renamed, directory not). `[V]`
3. **The remaining Tier-2 UI drift is the panels not yet consuming this seam.** The four
   Settings surfaces still read their own libs (`lib/providers`, `lib/scheduler`, `lib/mcp`,
   `lib/acp`). `settings.ts` is the typed seam they should migrate onto; none was rewritten
   in this wave, because doing so without a type-checker is not a verifiable change. `[CODE]`
4. **OPEN DECISION — `ScheduleSettings` cannot reproduce what the schedules panel shows.**
   `src-tauri/src/settings_cmds.rs::schedule_settings_for` maps `target` from `job.sessionId`,
   and the struct carries **no `name`** and **no run count** (only `nextRunAt`/`lastRunAt`).
   But `ui/src/components/panels/schedules-section.tsx` renders `job.name` (the human label)
   and `` `${job.runs} runs` ``. So migrating P65.4 onto `settings_schedules_list()` **as the
   struct stands today would silently drop the schedule's name and run count from Settings**.
   This was deliberately **not** patched, because §17.12 freezes the canonical type names and
   adding fields to `ScheduleSettings` is a contract change that belongs to the §17.12 owner —
   not a mechanical gap to fill on a guess while no Rust toolchain is available to compile it.
   Two ways forward, both one-file: (a) add `name`/`runs` to `ScheduleSettings` and to the
   `§17.12.2` block; or (b) keep the name in a side-lookup the panel already has and accept
   the read model is deliberately identity-only. **Needs an owner decision.** `[V]`
5. **§17.12.2 is a baseline, not a ceiling — the implementation already extends it.**
   `AgentSettings` in Rust carries `location` (§17.12.4), `sessionLoadout` (§17.12.5) and
   two binding extras (`keyPresent`, `refusal`) that the §17.12.2 listing does not show.
   So "frozen names" has in practice meant frozen *names*, with later subsections adding
   fields. That precedent is the reason finding 4 is a judgement call rather than an
   obvious violation. `[CODE]`
6. **`amber` must not be swept during any future P66.5 pass.** `globals.css` maps
   `--color-amber-500: hsl(var(--warning))`, and real UI depends on that: `schedules-section`
   renders the "paused" state as amber. A global orange→blue find-and-replace would have
   turned a genuine warning indicator into brand blue. The correct seam is the alias block
   (lines 49–54), which is already correct. `[V]`

---

## 2H. Implementation wave 5 (2026-09-17) — P65.4 Schedule Settings Contract

**Item taken:** P65.4 (Tier 2, Settings Control Center). The plan's target file
`ui/src/components/settings/schedules-tab.tsx` does not exist; the real surface is
`ui/src/components/panels/schedules-section.tsx` (landed in `792dbaf`).

### Resolved the §2G finding-4 open decision
`ScheduleSettings` carried no `name` and no run count, so the Settings surface
would have had to render an opaque id where the Automations centre shows a name.
Decision taken: **add them, as an additive display pair.** Justification is the
precedent already set by the same contract — §17.12.4 added the whole
`RuntimeLocation` union to `AgentSettings` and §17.12.5 added `sessionLoadout`,
neither of which appears in the §17.12.2 baseline listing. §17.12.2 is the
baseline the implementation extends, not a ceiling, and adding two optional-in-
practice display fields is backward-compatible (no consumer breaks on extra keys).
- `src-tauri/src/settings_cmds.rs`: `ScheduleSettings` gains `name: String` and
  `runs: u64`, both populated in `schedule_settings_for` from the owning `Job`
  (`name`, `runs`) — the same source the Automations centre reads, so the two
  surfaces cannot disagree. `id` remains the durable identity.
- `ui/src/lib/settings.ts`: matching `name` / `runs` on the TS interface.
- `ARCH/17-NATIVE-AGENT.md` §17.12.2: the `ScheduleSettings` block now records the
  real wire shape (`name`, `nextRunAt?`, `lastRunAt?`, `runs`, `state`) plus a note
  on why the two display fields exist. **This is the only md contract edit in this
  wave**, and it reconciles the doc *to* the code rather than the reverse.

### Found a THIRD gap — and changed the plan because of it
`ScheduleSettings.trigger` is the **kind only** (`'cron'`), not the expression.
`ui/src/lib/scheduler.ts`'s `triggerLabel(job.trigger)` renders the actual
schedule (`cron 0 9 * * *`), which has no home in the canonical read model.
So a **wholesale** panel migration would regress name, run count **and** the cron
expression. The read models are deliberately identity/state/health/hash shapes —
they are not display shapes.

**Conclusion recorded as the architecture rule for the remaining P65 UI items:**
split by responsibility — **state, health, `configHash` and every mutation come from
the `settings_*` seam** (that is what it owns, and it is the only path that returns
the §17.12.3 envelope); **rich display detail stays with the domain lib** (`lib/scheduler`,
`lib/mcp`, `lib/providers`). Do not force a full rewrite onto the read models; that
would trade working detail for contract purity.

### Changed — the §17.12.3 mutation protocol on the live path
`ui/src/components/panels/schedules-section.tsx`: the enable toggle now calls
`settings_schedule_set_enabled` instead of writing the scheduler directly, and
implements **discard-optimistic-on-mismatch** honestly:
- on `lastError`, the shell's real reason is surfaced (no silent success);
- on `restartRequired`, the user is told a restart is needed;
- then it **re-reads** (`await load()`) instead of patching its own guess.
`run-now` / `pause` / `resume` deliberately stay on `lib/scheduler`: the settings
contract exposes no run or pause command, and inventing one would create a second
scheduler path — the exact thing §17.12.1 forbids. The now-unused `schedulerEnable`
import was removed (no dangling references).

### Evidence actually executed
- `node scripts/check-doc-sync.mjs` → **exit 0** (166 in sync · `1429 = 1221 + 208` · both v3.80 stamps). `[V]`
- `node scripts/ipc-parity.mjs` → exit 0 · **registered 341 · broken 0 · ghosts 60** (unchanged). `[V]`
- Struct/constructor field-parity check on `ScheduleSettings`: **16 declared == 14
  `field: value` + 2 field-shorthand (`timezone,` / `enabled,)` == 16 initialised** —
  i.e. no missing field initialiser that Rust would reject. `[V]`
- `schedulerEnable` reference scan after the edit → none remaining. `[V]`

### NOT VERIFIED (same environment limits as §2G — unchanged)
- **No Rust toolchain**: `cargo check`/`clippy`/`fmt`/`test` still not run. The Rust
  edit here is checked by field parity and by reading the owning `Job` shape, not by
  a compiler. `[UNVERIFIED]`
- **No `tsc` / no `node_modules`**: the `schedules-section.tsx` and `settings.ts`
  changes were not type-checked. `[UNVERIFIED]`
- Only the two Node gates could run; that is the whole evidence base for this wave.

---

## 2I. Implementation wave 6 (2026-09-17) — P65.3 Channels & Connectors Inventory

**Item taken:** P65.3 (Tier 2). Plan target files `ui/src/components/settings/connectors-tab.tsx`
do not exist; the real surfaces are `ui/src/lib/connections.ts` (new in `792dbaf`) and
`ui/src/components/panels/connectors-panel.tsx`.

### Found: TWO incompatible types named `ConnectionRecord`
`792dbaf` added a TypeScript `ConnectionRecord` in `ui/src/lib/connections.ts` while
`settings_cmds.rs` implements the §17.12.2 `ConnectionRecord`. They disagree on all
three axes, so importing "`ConnectionRecord`" from either module silently gave a
different shape — precisely the contract drift `everyaios-types` exists to remove on
the Rust side, reintroduced on the TS side.

| | `lib/connections.ts` | §17.12.2 + Rust |
|---|---|---|
| `state` casing | `'Connected'` | `'connected'` |
| `kind` axis | `connector \| mcp-server \| oauth-account \| store-entry` | `remote_mcp \| oauth_connector \| native_adapter \| message_channel` |
| field set | `name`, `detail`, `source` | `transport`, `scopes`, `enabledConsumers`, `health`, `authRef?`, `configHash` |
| `revoked` state | absent | present |

`ConnectionState` collided too (both modules exported it).

### Changed — the objective defect only
Renamed the **display projection** so one name means one shape:
`ConnectionRecord` → **`ConnectionView`**, `ConnectionState` → **`ConnectionViewState`**
(`ui/src/lib/connections.ts`), and updated its single importer
(`connectors-panel.tsx`: the import and `ConnectionBadge`). A naming/ownership fix with
no behavioural change — `connectionTone`/`connectionLabel`/the four adapters are
byte-identical apart from their type annotations. `ConnectionRecord` and
`ConnectionState` now belong solely to the §17.12.2 wire model in `@/lib/settings`.

### Surfaced, NOT decided — the vocabulary conflict
Which state vocabulary Settings standardises on is an owner call, because the two
sources disagree and neither is obviously wrong:
- the **plan prose** says `Discovered, Installed, Connected, Disconnected, Degraded`
  (PascalCase, 5 states) — which is what the display projection implements;
- the **normative** §17.12.2 says `discovered, installed, connected, disconnected,
  degraded, revoked` (snake_case, 6 states).
The extra `revoked` is substantive, not cosmetic: P65.3's own acceptance gate is
"**Disconnected or revoked** connector immediately invalidates active tools across all
sessions", and `ConnectionView` has no `revoked` member to express that. Recorded as
an open decision in the module doc comment rather than silently reconciled — the same
rule applied in §2G/§2H: fix the objective collision, surface the semantic choice.
Also noted: the same state-vs-display split as §2H applies to the field sets
(`name`/`detail`/`source` are display; `transport`/`scopes`/`health`/`authRef`/
`configHash` are authority). Neither set should absorb the other.

### Evidence actually executed
- Stale-name scan across all of `ui/src`: **zero code references** to `ConnectionRecord`
  or `ConnectionState` outside `lib/settings.ts` (remaining hits in `connections.ts`
  are the explanatory comments). A trailing `state: ConnectionState` field inside
  `ConnectionView` was caught by this scan and fixed — it would have been a
  "cannot find name" error, since the type was renamed. `[V]`
- Declaration/use balance: `ConnectionView` 1 declaration / 13 refs;
  `ConnectionViewState` 1 declaration / 3 refs — no orphaned or dangling name. `[V]`
- Single-importer confirmation before the rename (`grep` for `@/lib/connections` →
  exactly one file), i.e. the blast radius was fully enumerated before editing. `[V]`
- `node scripts/check-doc-sync.mjs` → exit 0 · `node scripts/ipc-parity.mjs` →
  exit 0 · registered 341 · broken 0 · ghosts 60 (unchanged). `[V]`

### NOT VERIFIED (environment limits unchanged from §2G)
**No `tsc` and no `node_modules`**, so these TypeScript edits were **not type-checked**;
no Rust was touched in this wave. `[UNVERIFIED]`

---

## 2J. Implementation wave 7 (2026-09-17) — P65.2 Agent Two-Plane + a CI-breaking defect

**Item taken:** P65.2 (Tier 2). Plan target `ui/src/components/settings/agents-tab.tsx`
does not exist; the real surface is `ui/src/components/panels/agents-models-section.tsx`.

### The consequence of wave-4's wiring, and why it mattered
The module wired in §2G had **never been compiled**, so two things were true at once:
its contract tests had never run, and any latent defect inside it was invisible. Once
`mod settings_cmds;` exists, the file joins the build — so a latent `dead_code` finding
becomes a **CI failure**, because the `rust` job runs
`cargo clippy --all-targets --all-features -- -D warnings`.

### FOUND AND FIXED — `SettingsReadModel` was dead code (would fail CI)
`SettingsReadModel` (§17.12.2's shared row shape) was **declared and never used**: its
only other occurrence in the whole file was a doc comment. The commands build rows as
`serde_json::Value` — necessarily, because provider rows arrive as `Value` from
`catalog_cmds` — so nothing ever constructed the struct. `mod settings_cmds;` is private,
so the item is not publicly reachable and rustc reports it as dead code; with `-D warnings`
that is a hard build failure.

Fixed the honest way — **not** with `#[allow(dead_code)]`: added
`settings_read_model_uses_contract_field_names`, which constructs the type and pins the
§17.12.2 wire names plus the `skip_serializing_if` behaviour (an absent `lastError` must be
**omitted, not `null`**, so the UI reads a missing key rather than an empty one). The type
is now genuinely reachable **and** a previously untested contract surface is covered.

### Verified by reading — P65.2's acceptance gate does hold in the implementation
The gate is *"External agents retain their own auth credentials; no EveryAIOS key is copied
to external agent configuration files."*
- `BackendBindingView.writes_to_agent_config` is **hardcoded `false`** at its one production
  construction site (`:807`) and asserted by `agent_settings_shape_keeps_writes_flag_false`,
  which pins `writesToAgentConfig == false` on the serialized view. `[CODE]`
- `backend_binding_view` reports **names only** — `injected_env_names` / `unexpressed` — plus
  a `key_present` boolean and an optional `refusal`; no value ever crosses the boundary. `[CODE]`
- The two-plane split is real, not cosmetic: `native_caps(is_inbuilt)` returns
  `loop/planning/routing/memory-reasoning/verification/native-tools` for the inbuilt engine
  and `own-loop/own-tools/own-model/own-permissions` for an external agent, while
  `shared_caps()` returns `office-facade/browser-facade/computer-use-facade/memory-api/work`.
  That is the §17.12 "agent-native plane + shared cowork plane" model expressed in code. `[CODE]`
- `has_managed_binding` gates `modelOwner: managed` on a *verified* binding: config present,
  channel env-injectable, no refusal, and the key either present or unnecessary. `[CODE]`

### Also recorded — 13 contract tests were dormant
`settings_cmds.rs` ends in a `#[cfg(test)]` module with **13 tests**, each mapping to a
contract clause: `provider_state_never_invents_connected`, `model_owner_rule`,
`readiness_never_claims_ready_without_occupancy`,
`runtime_location_mapping_keeps_provenance_distinct`,
`connection_state_never_false_connected`, `mutation_envelope_uses_contract_field_names`,
`agent_settings_shape_keeps_writes_flag_false`, `loadout_rows_apply_from_next_turn`, and
the new one added here. **None had ever executed**, because the module was never compiled.
They now compile. Whether they *pass* is `[UNVERIFIED]` (§2G limits) — but a dormant suite
that starts running is strictly better than one that silently never ran.

### Evidence actually executed (static only — see limits)
- Import audit: all 5 imports in `settings_cmds.rs` used (`Serialize` 11, `json` 33,
  `Value` 40, `State` 11, `record_mutation` 2, `AuthKind` 2, `AppState` 18 refs). `[V]`
- Dead-code audit: all **28** private fns have ≥2 refs (definition + call) — none orphaned. `[V]`
- Declared-type audit: all **10** `pub` types now have ≥2 code use sites beyond their
  declaration (was 0 for `SettingsReadModel`). `[V]`
- `node scripts/check-doc-sync.mjs` → exit 0 · `node scripts/ipc-parity.mjs` → exit 0 ·
  registered 341 · broken 0 · ghosts 60 (unchanged). `[V]`

### NOT VERIFIED
No Rust toolchain: these audits are **static**, not a compiler run. The `dead_code` call is
inference from use-site counts plus `mod` privacy, not a `cargo clippy` result. `[UNVERIFIED]`
No `tsc` either — no TS was changed in this wave.

---

## 2K. Implementation wave 8 (2026-09-17) — P65.1 Provider Control-Center (verification only)

**Item taken:** P65.1 (Tier 2). Plan target `ui/src/components/settings/providers-tab.tsx`
does not exist; the real surface is `ui/src/components/panels/settings-providers.tsx`.

**Outcome: its acceptance gate already holds — no code change was needed or made.**
The gate is *"Failed provider probe renders actionable error without storing an invalid
key; valid probe displays green verified checkmark."* `verifyAndSave`
(`settings-providers.tsx:551`) implements exactly that, and the ordering is the guarantee:

```ts
const p = await providerProbe(row.id, secret.trim() || undefined)
setProbe(p)
if (!p.ok) {
  notify(`${row.name}: ${p.message}`, 'error')   // actionable, from the probe
  return                                          // ← nothing persisted
}
// only past this point: providerProfileUpsert + vault_key_add
```

The `return` on `!p.ok` is what makes it fail-closed: `vault_key_add` is unreachable on a
failed probe, so an invalid key cannot be stored. The green tick is the `probe?.ok`
conditional at `:759`/`:774`. This predates the P65 wave (tagged P56.3), and it satisfies
P65.1 — re-implementing it would have been churn. `[V]`

**Remaining P65.1 gap (recorded, not implemented):** the plan asks for a searchable
**Configured / Popular / All** inventory, and `settings_providers_list` already returns
canonical `groups: { configured, popular, all }` — but the panel still computes its own
buckets via `configuredProviders(filtered)` from `@/lib/providers` and never consumes the
read model. Migrating it is the same call as §2H/§2I and is deliberately not done here:
it would touch a 1,234-line panel with no type-checker available, to replace working
filtering, in exchange for canonical grouping. Needs the state-vs-display decision to be
settled first (see §2I). `[CODE]`

### Tier-2 read-model sweep: complete
All five Tier-2 items have now been dispositioned, each by *reading the code* rather than
assuming the plan's description was accurate:

| Item | Disposition |
|---|---|
| P65.1 Providers | Gate verified already correct (probe-then-persist). Panel not migrated; gap recorded. |
| P65.2 Agents | Gate verified correct (`writesToAgentConfig` hardcoded false + tested). **Fixed a latent CI-breaking `dead_code`.** |
| P65.3 Connections | **Fixed** a real `ConnectionRecord`/`ConnectionState` name collision. Vocabulary conflict surfaced. |
| P65.4 Schedules | **Fixed** the read-model gap (`name`/`runs`) and routed the toggle through the §17.12.3 mutation funnel. |
| P66.5 Blue theme | Already correct centrally via the semantic alias block; 3 stale comments fixed. Bulk sweep deliberately refused. |

**Net: 3 genuine defects fixed, 2 contract gaps closed, 2 decisions surfaced, 1 destructive
"fix" correctly refused.** Every remaining Tier-2 UI item waits on the same two things:
a toolchain to verify against, or the vocabulary decision in §2I.

---

## 2L. Implementation wave 9 (2026-09-17) — P64 reconciliation: the tracker is wrong, and it matters

**Why this wave is analysis and not code:** the plan (and the prior checklist) is built on
`TODO.md`, and `TODO.md` **materially understates what is already implemented**. Writing
code against those rows would re-implement working features. So the highest-value action was
to establish ground truth by call-site evidence, then redirect the work to what is genuinely
open. Every claim below is from reading the code, and **none of it was verified by running
a test** (no toolchain — see §2G limits).

### P64 — measured, item by item

| Item | TODO.md says | What the code shows |
|---|---|---|
| **P64.3** Repo-map as default context | `[NOT DONE]` — *"the map is never selected or injected"* | **IMPLEMENTED.** `chat.ts:763` requests `codeintel/repomap`, then `rankRepoMapTags` → `fitRepoMapToBudget` → `renderRepoMapBlock` → `injectBelowBoundary`, so segments 1–7 stay byte-identical (the gate). Best-effort: a missing handler never blocks. Covered by `p64-lane.test.ts`. **The TODO statement is false.** |
| **P64.4** Sub-agent execution side | `[PARTIAL]` | **PARTIAL — accurate.** `DELEGATE_BLOCKED_TOOLS` is wired across `execution.rs`, `governor.rs`, `blueprint/subagent.rs` **and** `coordinator/tools.ts`. But `SubAgentRuntime` has no production caller (only a `p10_e2e.rs` test + the `lib.rs` re-export) and **`derive_child_permissions` is referenced in exactly one file — its own definition.** The permission-derivation half is dead. |
| **P64.5** Unified native edit engine | `[NOT DONE]` | **IMPLEMENTED.** `dispatch_edit` is on the live `"file_ops.edit"` dispatch arm and runs `apply_edit_ladder` (exact → structured → fuzzy), snapshotting before an atomic tmp+rename write and returning the strategy used. The ambiguity invariant holds by construction (comment + `apply_exact_once` failing on 0/2+). |
| **P64.6** Risk-gated shadow preflight | `[NOT DONE]` | **GENUINELY OPEN — mechanism exists, never called.** `decide_shadow_preflight`, `run_shadow_command`, `spawn_shadow_command_tracked`, `Should_restore` exist in `execution.rs` but are referenced only there and in the `lib.rs` re-export. **No caller.** |
| **P64.7** Checkpoint + rollback UX | `[NOT DONE]` | **GENUINELY OPEN — same pattern.** `auto_checkpoint_kernel`, `commit_workspace_snapshot`, `check_restore_fence`, `should_restore_without_replay` exist in `execution.rs`, referenced only there + the re-export. **No caller.** |
| **P64.8** Validated skill distillation | `[NOT DONE]` | **IMPLEMENTED (cross-language).** `grow_from_task` is referenced from `coordinator/plan.ts` plus `blueprint/{skill_store,learn}.rs` and `memory/journey.rs`. |
| **P64.9** Shared-plane fa\u00e7ades | `[NOT DONE]` | **IMPLEMENTED.** `FACADE_ROUTES` and `find_facade` are both referenced from **`everyaios-mcp/src/lib.rs`** — i.e. the task-shaped fa\u00e7ades are exposed over the MCP catalog, which is the item's stated mechanism. |

### The conclusion that changes the plan
**P64.3, P64.5, P64.8 and P64.9 are implemented but marked `[NOT DONE]`.** The genuinely
open P64 work is **P64.6 and P64.7** — and both are *wiring* jobs, not authoring jobs: the
mechanisms are written and sit one call site away from the live path. **P64.4** is correctly
tagged `[PARTIAL]`, with `derive_child_permissions` unreferenced.

This is the same "implemented but unreachable" class the §2B/C audit documented for the
Script sandbox and `attach_desktop` — and it is the third time this session that reading the
code disagreed with a tracker line (cf. §2G P66.5, §2H `ScheduleSettings`).

### P68.8 also measured — TODO row is stale
`P68.8` is tagged `[NOT DONE]` with *"reattach still announces that output produced while the
view was closed is not replayed."* That is no longer true: `shell-view.tsx:450` defines
`replayInto`, which calls `terminalReplay(ptyId, from)` with a **per-tab `seq` cursor**
(`seqRef`), labels a truncated replay honestly when `dropped > 0`, and prints
"no output retained to replay" only for a genuinely empty ring. The split-pane work is also
present (`splitDir`, `splitActive`, `unsplit` — *"Both sessions keep running — nothing is
killed"*). The `terminal_replay` command is registered. **Not flipped to done** — see below.

### Deliberately NOT done
**`TODO.md` was not edited and no checkbox was flipped.** Every item above is a *reading*
result; this repository's contract is that readiness is **evidence-gated** and that an
unverifiable claim is worse than an honest `unverified` (§3 of the handover, and the P50.4
readiness rule). Marking P64.3/5/8/9 done without executing `cargo test` would repeat the
exact failure this wave is reporting. **The rows should be re-tagged only after the Rust
suite runs on the items' own named tests.** Recorded here so the discrepancy is not lost.

### Evidence actually executed
- Call-site sweeps (symbol → referencing files) for 12 P64 mechanisms; cross-module
  references distinguished from definition-only and from `lib.rs` re-exports. `[V]`
- Direct reads: `chat.ts:752–806` (repomap injection), `tools.rs:1580–1612`
  (the ladder on the live `file_ops.edit` arm), `shell-view.tsx:440–520` + `lib/terminal.ts`
  (replay wiring, `fromSeq`), `TODO.md` rows at `:1794–1821` and `:2302–2321`. `[V]`
- `node scripts/check-doc-sync.mjs` → exit 0 (208 open / 1221 done still matches the header —
  **note the checker validates the arithmetic, not the accuracy of any individual row**). `[V]`
- `node scripts/ipc-parity.mjs` → exit 0 · registered 341 · broken 0 · ghosts 60. `[V]`

### NOT VERIFIED
No Rust toolchain and no `tsc`. Every "IMPLEMENTED" claim above is a **static reading**
(call sites exist, wiring is present) and **not** a passing gate. `[UNVERIFIED]`

---

## 2M. Implementation wave 10 (2026-09-17) — P65 reconciliation + a latent provenance trap

Same method as §2L: read the code, do not trust the tracker row.

| Item | TODO.md says | What the code shows |
|---|---|---|
| **P65.5** Installed & Marketplace | `[NOT DONE]` | **Accurate, and honestly self-labelled.** `settings_extensions_list` exists and builds `InstalledExtension` rows, but the source says `// InstalledExtension read model (P65.5 surface is contract-only here)`. Contract-only = not done, and the code says so rather than implying otherwise. |
| **P65.6** Backend-authoritative persistence | `[NOT DONE]` | **PARTIAL.** The exact envelope `{ state, health, appliedLive, restartRequired, lastError? }` exists (`SettingsMutationResult`), failures normalize through `failed_mutation`, and writes are atomic (`atomic_write_json`). But it is wired to only the two settings mutations (`:510` model, `:1289` schedule) — the **rollout to every mutation** is the open half. |
| **P65.7** Security & ownership verification | `[NOT DONE]` | **PARTIAL — with a latent trap, see below.** Every funnel mutation *is* audited: `settings_mutate` calls `record_mutation(...)` on success. |
| **P65.8** E2E acceptance pass | `[NOT DONE]` | **Accurate.** Requires a live packaged run; impossible here. |

### ⚠️ LATENT — the settings funnel hardcodes `AuthKind::HumanGesture`
`settings_mutate` is one line of provenance:

```rust
match op() {
    Ok(envelope) => {
        record_mutation(state, AuthKind::HumanGesture, audit_kind, audit_payload);
        envelope
    }
    Err(e) => failed_mutation(fail_state, "failed", e),
}
```

**Today this is correct**, and I checked rather than assumed: the only callers of `settings_*`
are `ui/src/lib/settings.ts`, i.e. human UI gestures — and that fact is independently
confirmed by the ipc-parity ghost count dropping 71 → 60 exactly when that file landed.

**But it is the same defect class §2D already fixed once**, and its doc explains why it
matters: *"the only sink hardcoded `AuthKind::HumanGesture`, so wiring the agent tool would
have filed agent-initiated desktop actions as human gestures (a confused-deputy audit lie)."*
Here the sink hardcodes the same value. The moment any agent or automation path is wired to a
settings mutation, its effect will be **audited as a human gesture** — and audit provenance is
what the Guard-2 and receipt chain rest on, so a false `human_gesture` is worse than no receipt.

`AuthKind` is an enum with an `AgentTicket` / `AutomationTicket` member already, so the fix is
to **thread provenance in** exactly as §2D did for `everyaios-desktop` (`ActProvenance` through
`AuditSink`/`DesktopGuard`/`DesktopEngine::act`) — not to guess a different constant today.
**Deliberately not changed here:** there is no agent caller yet, so picking a value would be
inventing the answer, and the correct shape is the threaded parameter §2D established.
Recorded so the wire-up is done provenance-first rather than provenance-after, which §2D
records as the sequencing that actually mattered.

### Evidence actually executed
- Direct reads: `settings_mutate` (the full fn), `SettingsMutationResult` use sites, the
  `InstalledExtension` builder + its `contract-only` comment, `settings_extensions_list`. `[V]`
- Caller confirmation for the provenance claim: `settings_*` is invoked only from
  `ui/src/lib/settings.ts` (no Rust caller, no coordinator caller), corroborated by the
  ipc-parity ghost delta. `[V]`
- `node scripts/check-doc-sync.mjs` → exit 0 · `node scripts/ipc-parity.mjs` → exit 0 ·
  registered 341 · broken 0 · ghosts 60. `[V]`

### NOT VERIFIED
Static reading only — no `cargo test`, no `tsc`. The `HumanGesture` behaviour is read from
source, not observed in a trace. `[UNVERIFIED]`

---

## 2N. Master status map (2026-09-17) — the 208 open items, measured against call sites

The waves above each measured one tier. This is the consolidated map, built the same way
every time: read the code, look for **call sites** (not definitions, not `lib.rs`
re-exports), and treat "the symbol exists" as different from "the code path runs it".
Every row below is `[V]` **as a reading**; none is a passing gate (no toolchain — §2G).

| Tier | Tracker says | Measured reality | Actionable now? |
|---|---|---|---|
| **1 — P64 native agent** | 7 open | **Mostly implemented.** P64.3 (repomap→prompt below boundary), P64.5 (edit ladder on the live `file_ops.edit` arm), P64.8 (`grow_from_task` from coordinator `plan.ts`), P64.9 (`FACADE_ROUTES`/`find_facade` from `everyaios-mcp`) are **done but marked not-done**. P64.6 + P64.7 exist but are **unwired** (no caller). P64.4 correctly `PARTIAL`; `derive_child_permissions` is dead. | **Wiring only** for 64.6/64.7 — needs a compiler |
| **2 — P65/P66 settings** | 14 open | **Largely implemented.** P65.1–65.4 gates read as holding; P65.5 is genuinely `contract-only` (self-labelled); P65.6 envelope exists but reaches only 2 mutations; P65.7 audits every funnel mutation but hardcodes `HumanGesture` (**latent**, §2M); P66.5 done. | Panel migration blocked on the §2I vocabulary decision |
| **3 — P68/P54 terminal** | 6 open | **P68.8 implemented** (`replayInto` + per-tab `seq` + honest truncation label); P54.4 splits implemented; `terminal_replay` registered. P54.7 remote backend + P54.8 shells-not-a-second-product genuinely open; P68.7 is Windows. | P54.7/54.8 small; **P68.7 is Windows-blocked** |
| **4 — P59/P60/P57 CUA + swarm** | 30 open | **GENUINELY OPEN.** CUA *primitives* exist (`send_input`, `SendInput`/`win.rs`, `emergency_stop`) but the orchestration layer does not: `ScoutWorkerVerifier`, `scout`, `ComputerUseAction`, `locator_ladder`, `a11y_tree` are **absent from the entire repo**. P59.5–59.16 and P60.1–60.11 are real, unstarted work. | **Real work, but Rust-critical-path — needs a compiler** |
| **5 — P50/P66 release qualification** | 21 open | **GENUINELY OPEN and hardware-blocked.** P50.5.8 needs Windows 11 + macOS Sonoma/Sequoia + Linux against `.msi`/`.dmg`/`.AppImage`; P50.2.1/2.2/2.5 are packaged click-through; P50.5.2/50.5.7 are `[PARTIAL]`. | **Not possible on this host** |

### What this map changes
1. **Tiers 1–3 are largely finished, not pending.** Four P64 items and P68.8 are implemented
   while the tracker says otherwise. Re-implementing them would be pure waste, and the
   *remaining* work there is small: wire P64.6/P64.7.
2. **Tier 4 is the real remaining build** — and it is exactly where a compiler is
   non-negotiable. `everyaios-core` is the coupling hub (§2A records the concentration risk),
   and P59/P60 want to modify the execution/DAG paths. Writing that blind would be
   irresponsible, so it was **not started**.
3. **Tier 5 cannot be done here at all** — it is the Windows/macOS acceptance matrix already
   marked at the top of §3.

### The single unblocking action
Everything above funnels into one thing: **a Rust toolchain**. It would (a) confirm or refute
every `[UNVERIFIED]` Rust change from waves 4–7, (b) let the 13 dormant `settings_cmds` tests
and the terminal/replay suites actually run, and (c) make it safe to wire P64.6/P64.7 and
start Tier 4. `pnpm install` would additionally restore `tsc` and make the UI work verifiable.

### Evidence actually executed
- Absence sweep for the Tier-4 orchestration symbols across `crates/`, `src-tauri/src/`,
  `packages/coordinator/src/`: `ScoutWorkerVerifier`, `scout`, `ComputerUseAction`,
  `locator_ladder`, `a11y_tree` → **no matches anywhere** (the key distinction from Tiers 1–3,
  where the symbols were present). `[V]`
- Presence sweep for the CUA primitives → `send_input` (types/readiness/desktop_cmds),
  `SendInput` (`platform/win.rs`), `emergency_stop` (desktop/lib.rs + desktop_cmds). `[V]`
- Open-row extraction for P50.2/P50.5/P57/P59/P60 straight from `TODO.md` `[ ]` lines. `[V]`
- `node scripts/check-doc-sync.mjs` → exit 0 · `node scripts/ipc-parity.mjs` → exit 0 ·
  registered 341 · broken 0 · ghosts 60. `[V]`

---

## 2O. Implementation wave 11 (2026-09-17) — P64.5 receipt provenance, a HEAD-broken
## typecheck fixed, and **TS/UI verification unlocked**

### Correction to every earlier wave: TS/UI *can* be verified from this host
Earlier waves (§2G–§2N) recorded "no `bun`, no `tsc`, `node_modules` has only
`@tauri-apps`", and tagged every TS/UI change `[UNVERIFIED]`. That was true of
the *checkout*, not of the *host*. The toolchain was restorable, and restoring
it changed the evidence situation materially:

```
pnpm install --prefer-offline        → 592 packages, 13 workspace projects, exit 0
pnpm -r --filter "./packages/core-*" run build
                                     → all 10 vendored packages compiled (tsc), exit 0
npx -y bun@1.1.38 …                  → bun available ephemerally, no global install
```

The vendored `@personal-ai/core-*` packages ship as `main: ./dist/index.js` and
had never been built, which is why they resolved as `TS2307 Cannot find module`
and why the coordinator suite could not run. Building them fixed both.

**Consequence:** the TS/UI half of waves 4–10 is now *verifiable* rather than
assumed, and this wave verified it. Only the **Rust** half remains unverifiable
(no `cargo`/`rustc`/`rustup`), and that is the single remaining blocker (§3).

### P64.5 — verified-edit receipt wired end to end (was: arm existed, unused)
`ExecutionKernel` is **live** in production — it is held by `ChatRelay`
(`everyaios-core/src/chat.rs:402/469`), exposed via `executions()`
(`chat.rs:485`), and `chat.rs:1062` routes **any** `execution/*` method to
`kernel.handle()` with **no whitelist**. So `execution/record_edit` was always
reachable — nothing called it. (An earlier wave mis-read the kernel as
"constructed only in tests"; `chat.rs:469` is the production instantiation.)

| File | Change |
|---|---|
| `packages/coordinator/src/tools.ts` | `ToolExecutor` tracks the Guard-2 ticket of the last committed effect (`lastTicketId`), gains `setExecutionId()` + `recordVerifiedEdit()`. `applyExactEdit` now records `execution/record_edit` (strategy `exact` + path + ticket) after the write lands. |
| `packages/coordinator/src/chat.ts` | binds the `execution/begin` id to the turn's `ToolExecutor`. |
| `packages/coordinator/src/p64-lane.test.ts` | +4 tests for the receipt path. |
| `ui/src/components/panels/agents-models-section.tsx` | **real HEAD bug fix** (below). |

**Refused to fabricate:** a receipt with no real Guard-2 ticket is *skipped*,
never invented — the kernel rejects an empty ticket, and a made-up id would be
fake provenance. A receipt failure also never invalidates an edit that already
landed (best-effort, matching how `chat.ts` treats the kernel as optional).

### Real HEAD bug: `ui` did not typecheck
`ui/src/components/panels/agents-models-section.tsx:483` contained
`(agent.launchable ?? agent.status === 'installed' || native)`, which is
**TS5076** (`??` and `||` cannot be mixed without parentheses). It came in with
`792dbaf` — the same WIP commit that shipped the orphaned `settings_cmds.rs`.
Since `tsc --noEmit` is the UI's *sole* mechanical gate, the UI package was
failing its only gate at HEAD. Fixed to `launchable ?? (installed || native)`,
which is the intent already expressed at line 398 of the same file and matches
the `m.ctx ?? (m.ctx || 16384)` convention in `local-server-view.tsx`.

### Evidence actually executed this wave — all real, none inferred
| Gate | Result |
|---|---|
| `ui/node_modules/.bin/tsc --noEmit -p ui/tsconfig.json` | **0 errors** (was **1** at HEAD) |
| `packages/coordinator/.bin/tsc --noEmit` | **0 errors** (was 25 before `core-*` were built: 14×TS2307 + 11×TS7006 — all from unresolved vendored dist) |
| coordinator `bun test` (mine) | **374 pass / 3 fail / 1 error** |
| coordinator `bun test` (stashed baseline) | **370 pass / 3 fail / 1 error** |
| → delta | **+4 pass, identical failures — zero regressions** |
| `ui` `bun test` | **328 pass / 0 fail** |
| `node scripts/check-doc-sync.mjs` | exit 0 (166 caps · 1429 = 1221+208 open · kernel gate clear) |
| `node scripts/ipc-parity.mjs` | exit 0 (341 registered · 0 broken) |
| `node scripts/e2e/security-gate.mjs` | **SKIP** — no cargo toolchain (honest) |
| `node scripts/e2e/failure-injection.mjs` | **SKIP** — no core binary (honest) |

**The 3 coordinator failures are pre-existing and not mine.** Baseline and
post-change runs fail the *same* 3: two `P64.3` repo-map-order tests that
**pass in isolation** (`bun test src/p64-lane.test.ts` → 25/25) and are therefore
a cross-file test-order/parallelism interaction, plus the
`live-agent-harness` case that spawns a real `opencode` binary. The earlier
"+1 error" is that same harness.

### What is still NOT done, and why (no overclaiming)
- **P64.6's runner is still not implemented.** Reading the code settled it: the
  *mechanism* is complete and tested (`decide_shadow_preflight`,
  `run_shadow_command`, `spawn_shadow_command_tracked`,
  `WorktreeManager::shadow_worktree_path`, `record_preflight`) but every one of
  them has **zero call sites outside `lib.rs` re-exports**. A grep for any
  configured check/test command (`checkCommand`, `typecheckCommand`, …) across
  `packages/coordinator/src`, `src-tauri/src`, `everyaios-core/src` returns
  **nothing**. So "wire P64.6" means *first design* a project check-command
  source + a bounded runner, then wire it — a feature build on the Rust-critical
  path, not a two-line hookup. Earlier wording calling this "small wiring" is
  **withdrawn**; it was too optimistic, and it is why this wave did not guess.
- **P64.7 is further along than its row suggests.** The UI is complete and
  wired end to end (`lib/checkpoints.ts` → `chat/turn-checkpoint.tsx` →
  `session-timeline.tsx` → `message-bubble.tsx`), restoring through the
  **existing** `fs_undo_restore` with no new commands, and the automatic
  per-file snapshot already runs on every mutation via
  `ToolDispatcher::snapshot_file` / `revert_last`. Residual: the git-commit
  snapshot per mutating step (`commit_workspace_snapshot`) plus the
  `StepCheckpointMeta`/`auto_checkpoint_kernel` index — both unwired, and
  `commit_workspace_snapshot`'s `verified` flag is fed by P64.6, so it is coupled
  to the item above. Not attempted.
- **Nothing Rust was compiled.** Every Rust edit from waves 4–10 stands exactly
  as it did: verified statically only, still `[UNVERIFIED]`.

---

## 2P. Implementation wave 12 (2026-09-17) — **Rust is verified, and the latent risk
## materialised: the wired module did not compile**

### The prediction was right, and it was worse than predicted
Wave 11 flagged this as the top risk: *"My wiring activated 1,635 never-compiled
lines and 13 dormant tests… if any type error remains inside that module, CI now
fails where it previously passed silently."* It did. `settings_cmds.rs` **did not
compile** — 5 hard errors, plus a clippy rejection, plus a failing dormant test.
Every one of them was invisible while the module sat outside the build.

| # | Defect | Kind |
|---|---|---|
| 1 | `provider_groups` filtered `.iter()` with `configured.contains(id)` where `id: &&String` — no `Borrow<&String> for String` | **compile error E0277** |
| 2 | Two sites did `.lock().map(|m| m.clone())` on `HashMap<String, McpServerRow>`; `McpServerRow` had no `Clone` | **compile errors E0599 ×2** |
| 3 | `is_tampered(..)` returns `Option<bool>` (`None` = no install-time pin) but the result was `.unwrap_or(None)`-ed as if the payload were `bool` | **compile errors E0308 ×2** — and semantically it would have collapsed an honest "no pin" into an integrity claim the store cannot make |
| 4 | A `Result` was discarded by `.unwrap_or_default()` while the `if let Ok(..)` still matched on it | **compile error E0308** |
| 5 | `if let Some(p) = .. { } else { return None }` — clippy wants `?` | **clippy `-D warnings`** |
| 6 | `SettingsReadModel` never constructed | **clippy `dead_code`** |
| 7 | Dormant test expected `Popular` in alphabetical order; the code emits the curated `POPULAR_PROVIDERS` order | **test failure** |
| 8 | `tools.rs` facade dispatch: the `.pdf` arm and the `office.pdf_pages` fan-out arm both returned `"office.pdf_open"` — a no-op `else if` | **clippy `if_same_then_else`** |
| 9 | `everyaios-mcp` test compared booleans with `== true` / `== false` | **clippy `bool_comparison`** |
| 10 | rustfmt drift: 4 `src-tauri` modules + 9 crate files | **`cargo fmt --check`** |

Defects 2–4 are the class that only a compiler finds. Defect 3 is the most
serious: it is the same *"don't turn an honest unknown into a claim"* rule `§2D`
and `§2M` already record elsewhere in this codebase.

**Defect 6 resolved deliberately, not suppressed loosely.** Using `SettingsReadModel`
at runtime would *change live wire shapes* (the inventory commands emit rows with
fields beyond this shared core, as `serde_json::Value`). It is the frozen §17.12.2
*declaration* the wire is checked against, so it carries a rationale'd
`#[allow(dead_code)]`, matching the four existing uses in `src-tauri` — one of
which says verbatim "Not dead code: it is part of the provenance vocabulary
contract." The field-name test still pins it.

**Defect 7 is a judgement call, flagged as such.** No spec or UI canonical order
exists; the only definition is `POPULAR_PROVIDERS`, documented as *"Display-only
ordering for the `Popular` group"*, and `settings_providers_list` emits
`groups.popular` in exactly that order. The dormant assertion expected alphabetical
order (`deepseek` before `openai`), which contradicts the shipped order. The
expectation was aligned to the production constant, and the rationale is in the
test. **If the intended Popular order is actually alphabetical, this is the line to
revert** — the change is one assertion in `settings_cmds::tests`.

### Environment recipe (repeatable — record for future sessions)
```
rustup (minimal + clippy + rustfmt)          → ~/.cargo (21M) + ~/.rustup (595M)
apt install libwebkit2gtk-4.1-dev libgtk-3-dev libsoup-3.0-dev \
            libjavascriptcoregtk-4.1-dev libxdo-dev \
            libayatana-appindicator3-dev librsvg2-dev   (src-tauri needs GTK pkg-config)
build the sidecar → src-tauri/bin/coordinator   (tauri.conf.json resources glob
                                                 `bin/coordinator*` hard-fails a bare checkout)
CARGO_TARGET_DIR=/tmp/everyaios-target          (build artifacts ~2.6G on the 96G /tmp
                                                 scratch disk instead of the 16G / )
bun via `npx -y bun@1.1.38`                     (no global install)
```
Two gotchas worth keeping: a `nohup … &` background build **is killed when the
tool's shell exits** (it is not a detached process group) — run builds in the
foreground and let cargo's cache resume them; and the sidecar must be built
*after* the `core-*` dist, since it bundles them.

### Evidence actually executed this wave — the whole Rust surface, real runs
| Gate | Result |
|---|---|
| `crates/`: `cargo check --workspace` | **exit 0** (Finished in 1m07s) |
| `crates/`: `cargo clippy --workspace --all-targets -- -D warnings` | **exit 0** |
| `crates/`: `cargo test --workspace --no-fail-fast` | **2586 passed / 0 failed / 23 ignored** (two consecutive runs; one earlier run showed a single failure that did not reproduce — the pre-existing timing-flaky benchmark) |
| `crates/`: `cargo fmt --all -- --check` | **0 diffs** |
| `src-tauri`: `cargo check --all-targets` | **exit 0** |
| `src-tauri`: `cargo clippy --all-targets --all-features -- -D warnings` | **exit 0** (the CI gate) |
| `src-tauri`: `cargo test` | **66 passed / 0 failed / 1 ignored** — includes `registration_sync` 2/2 |
| `src-tauri`: `cargo fmt -- --check` | **0 diffs** |
| `scripts/e2e/security-gate.mjs` | **PASS, all 6 legs** (S1 guard 189 · S2 p10 10 · S3 audit 56 · S4 mcp 64 · S5 ipc-parity 0 broken · S6 provenance) — **was SKIP in wave 11** |
| `scripts/e2e/failure-injection.mjs` | **PASS, L1–L7** on the real binary (sidecar SIGKILL→respawn, corrupt-vault fail-closed, guard suites, version, browser honest) — **was SKIP in wave 11** |
| `scripts/clean-profile-boot-check.mjs` | **PASS 8/8** (honest locked/setup, zero seeds, no sidecar-liveness claim) — **was SKIP in wave 11** |
| `ui` `tsc --noEmit` / `bun test` | 0 errors / 328 pass (wave 11) |
| coordinator `tsc` / `bun test` | 0 errors / 374 pass (wave 11) |
| `check-doc-sync.mjs` / `ipc-parity.mjs` | exit 0 (341 registered · 0 broken) |

**The three e2e gates that skipped in wave 11 now execute for real.** Nothing on
the Rust or TypeScript side is `[UNVERIFIED]` any more.

### Still open — unchanged by this wave
P64.6's runner (no check-command source exists — §2O), P64.7's git-snapshot/step
index residual, the `ConnectionRecord` vocabulary ruling, and all of Tier 4/5.
This wave *verified* what existed; it did not add features beyond the receipt
wiring in wave 11.

---

## 2Q. Implementation wave 13 (2026-09-17) — an unbounded tool loop in the engine

The vendored `core-*` suites were the one CI job wave 12 had not exercised
(`pnpm --filter './packages/core-*' run test`, added to `ci.yml` so a
regression inside the engine can fail the workflow). Running them reproduced a
**hard failure**: `core-engine` died with `JavaScript heap out of memory` after
~60s at a 4GB heap — which fails the whole recursive job with
`ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL`.

### Root cause: `MAX_TOOL_ROUNDS` could never actually cap the loop
Bisected to a single test, and it was not the test. In
`packages/core-engine/src/engine.ts` the tool loop armed its "one extra
answering round" flag like this:

```ts
while (toolRound < maxToolRounds || extraFinalRound) {
  extraFinalRound = false;            // cleared at the top
  …
  toolRound += 1;
  if (toolRound >= maxToolRounds && previousToolResults.length > 0) {
    extraFinalRound = true;           // …and re-armed at the bottom
  }
}
```

Once `toolRound` reached `maxToolRounds`, the guard stayed true on **every**
subsequent pass, so a provider that keeps requesting tools re-armed the round
forever. Each pass pushed another entry into `previousToolResults` and
`trajectorySteps` until the heap was exhausted. **The cap was unreachable in
exactly the case it exists for** — a model that loops on tool calls. In the
real shell that is an unbounded agent loop, not just a test problem.

**Fix:** the extra round is now armed at most once via a one-shot flag
(`extraFinalRoundUsed`), so the loop terminates at `maxToolRounds` tool rounds
plus the single answering round the code comment says is required ("without
this flag, tools execute but fullResponse stays empty").

**Test reconciled, deliberately.** The dormant assertion expected exactly
`[0,1,2,3,4]` (5 calls) — no extra round at all. That expectation predates the
extra-round feature and **had never passed**, because the test OOM'd before it
could assert anything. The extra round is intentional and load-bearing, so the
assertion now records the real sequence `[0,1,2,3,4,5]` with the reasoning
inline. **If the intended contract is a hard 5-call ceiling, the change to
revert is the one-shot arm, and the test's original expectation resumes.**

### Evidence
t| Gate | Result |
|---|---|
| `core-engine` `vitest run` (alone) | **40 passed / 4 files** in 14ms — was a 4GB OOM |
| `pnpm --filter './packages/core-*' run test` | **exit 0** — core-domain 7 · security 18 · providers 38 · connectors 73 (+3 skipped) · memory 95 · search 61 · tools 22 · agents 4 · engine 40 · ai 121 → **~479 passed / 0 failed** |
| `core-engine` `tsc --noEmit` | **exit 0** (the changed file typechecks) |
| `core-ai` / `core-memory` / `core-tools` `tsc --noEmit` | clean |

---

## 2R. CI-job parity (2026-09-17) — every job in `ci.yml` reproduced locally

With the toolchain restored, each job in `.github/workflows/ci.yml` was run on
this host. The two remaining jobs after wave 13 were **`office-oracle`** and the
**ui build** half of the `ui` job; both pass.

| CI job | What it runs | Local result |
|---|---|---|
| `docs-sync` | `check-doc-sync.mjs` | **exit 0** |
| `rust` | `cargo fmt --check` · `cargo test` · clippy `-D warnings` | **0 diffs · 2586 pass / 0 fail · exit 0** |
| `office-oracle` | `libreoffice-writer` + `live_oracle_opens_clean` (`--ignored`) | **2 passed / 0 failed** against a real LibreOffice (docx open + open-after-patch) |
| `ui` | `tsc --noEmit` + `node scripts/build.mjs` | **0 type errors · build exit 0** (built in 1m04s) |
| `sidecar` | vendored `core-*` vitest · coordinator `tsc` · coordinator `bun test` | **~479 pass / 0 fail · 0 type errors · 374 pass / 3 pre-existing fails** |
| `tauri-check` | sidecar build + `cargo check` + `cargo test --lib` | **exit 0 · 66 pass / 0 fail** (incl. `registration_sync` 2/2) |

Beyond CI, the three release gates also run real: **`security-gate.mjs` PASS 6/6**,
**`failure-injection.mjs` PASS L1–L7** on the built binary, and
**`clean-profile-boot-check.mjs` PASS 8/8**.

**Remaining unverifiable here:** only the Windows and macOS legs of the `rust` /
`tauri-check` matrices. Those are platform-bound, not code-blocked — this host is
Linux, and the Windows-deferred list at the top of §3 still stands.

---

## 2S. Implementation wave 14 (2026-09-17) — **P64.3 never ran in production. Correcting
## the record, then fixing it.**

### Correction first
§2N's P64.3 row said *"**IMPLEMENTED.** … **The TODO statement is false.**"* — that
was **wrong**, and the delivery row was right. The change was real but the two
halves were never connected, so the repo map was **never injected in production**.

### What was actually there
| Half | State |
|---|---|
| Coordinator (`chat.ts:766`) sends `request("codeintel/repomap", {query, maxTokens})` | present |
| Rust handler for `codeintel/repomap` | **did not exist** |
| `repomap_build` Tauri command (the only implementation) | **zero callers** — a ghost command |

The relay's method match in `chat.rs` has **no `codeintel/` arm**, so the request
hit the catch-all `_ => reply_error(id, "method not found: …")`. The coordinator
surrounds that call in `catch { /* repomap is best-effort */ }`, so the failure was
**silent by design**: no error, no log, no map. `p64-lane.test.ts` passed because
its `request` is a mock that *does* answer `codeintel/repomap` — the test proved the
coordinator's half, never the shell's.

That is the exact failure mode the edit-and-delivery rules warn about: a gate that
looks green because the harness, not the product, supplies the other side.

### The fix
- `chat.rs` now serves `codeintel/*` (a `codeintel_rpc` helper + a match arm)
  returning `{ tags: [ {symbol, kind, file, line, rank} ] }` — the shape the
  coordinator reads.
- It is served from **`everyaios-codeintel`**, and `repomap_build` was reduced to a
  thin wrapper over the *same* `ranked_tags` function, so the agent-facing method
  and the UI command cannot drift (one engine, two façades).
- The map covers the **tool layer's floored workspace** (`ToolService::workspace()`,
  newly exposed), so the repo map describes the same tree the edit tools act on.
- `read_source_files` now **sorts before truncating**. Truncation determinism is
  part of the contract, and the previous early-break walk could not guarantee it:
  the cut set depended on `read_dir` order.

### Evidence (all executed)
| Gate | Result |
|---|---|
| `everyaios-codeintel` `cargo test` | **61 passed / 0 failed** (incl. 2 new: sorted-walk determinism + skip/ignore rules, and a missing dir being empty rather than an error) |
| `everyaios-core` `cargo test --lib` | **698 passed / 0 failed** (incl. `codeintel_rpc_serves_ranked_repo_map_tags`, which pins the wire keys and that an unknown `codeintel/*` method is still an error) |
| `crates` `cargo test --workspace` | **2589 passed / 0 failed / 23 ignored** |
| `crates` clippy `--all-targets -D warnings` · `fmt --check` | **exit 0 · 0 diffs** |
| `src-tauri` `cargo test` · clippy `-D warnings` · fmt | **66 passed / 0 failed · exit 0 · 0 diffs** |

### Delivery status
P64.3's stated gate is *"Oversized repo-maps truncate deterministically; prompt
prefix caching remains 100% stable"*. Deterministic truncation is now true and
tested; the byte-stable prefix was already asserted in `p64-lane.test.ts`
(`stablePrefixOf(injected) === stablePrefixOf(base)`). The mechanism is now wired
end to end in Rust, so the row is **flippable on this evidence** — but the
checkbox was left as-is here deliberately, because this file must not carry a
competing census and the flip belongs with a doc-sync run (§3).

---

## 2T. Implementation wave 15 (2026-09-17) — auditing the whole RPC surface: two more
## dead features, same root cause as P64.3

Rather than fix P64.3 and stop, the whole surface was audited: **every method the
coordinator sends via `request(...)` cross-checked against every Rust handler**
(relay prefix arms + exact-string handlers anywhere in `crates/` or `src-tauri/`).

### What the audit found
30 distinct methods are sent. **Two had no handler at all**, exactly like
`codeintel/repomap`:

| Method | Owning item | How it failed | Rust mechanism that already existed |
|---|---|---|---|
| `skill/grow` | **P64.8** | `plan.ts` wraps it in `catch {}` — **silent**, nothing ever distilled | `everyaios_blueprint::grow_from_task` |
| `subagent/spawn` | **P64.4** | **loud** — every delegation threw *"native runtime not wired (no silent fallback)"* | `everyaios_blueprint::SubAgentRuntime` |

### Corrigendum to §2N
That section called P64.8 **"IMPLEMENTED"** and P64.4 **"PARTIAL"**. Both were too
generous. Same defect as P64.3, and the method is worth naming: *"the symbol is
referenced somewhere"* is not *"the wire carries a request to a handler"*. A grep
for a function name is not reachability.

### The fixes
- **`skill/*`** → validated distillation. Deliberately **not** trusting the
  caller's claim that the verify gate passed: `grow_from_task` enforces the tests
  verdict, the 500-line budget, and the manifest check in Rust before anything
  reaches disk. The store is `SkillStore::default_home()` — the *same* root the
  UI's skills commands use, so a distilled skill is immediately visible to both.
- **`subagent/*`** → the spawn **admission** seam. `everyaios_blueprint` owns
  accounting (duplicate / parent-existence / depth / concurrent / total) and the
  relay now holds a live `SubAgentRuntime`, so limits accumulate across spawns
  rather than resetting per call. The reply is the admitted spec reported as
  `running` — deliberately **not** a fabricated `done` with an invented summary,
  because the LLM execution stays coordinator-side.
- Both surfaces refuse an empty or unknown request as an **error**. The old
  failure mode was a silent success-shaped no-op; the tests pin the refusal.

### Evidence
| Gate | Result |
|---|---|
| full-surface audit re-run | **0 unhandled of 30** (was 2) |
| `everyaios-core` `cargo test --lib` | **700 passed / 0 failed** (incl. 2 new: `skill_rpc_refuses_a_grow_without_a_task_name`, `subagent_rpc_admits_a_spawn_and_enforces_the_limits`) |
| `crates` `cargo test --workspace` | **2591 passed / 0 failed / 23 ignored** |
| `crates` clippy `-D warnings` · `fmt --check` | **exit 0 · 0 diffs** |
| `src-tauri` `cargo test` | **66 passed / 0 failed** |

### The systemic finding, stated plainly
Three dead features in one surface — P64.3, P64.4, P64.8. Each had a real
implementation on at least one side, a green tracker row, and no error. The
common cause is **built-but-unconnected halves**, and the two shapes it takes are:

1. a caller with **no handler** (silent `method not found`, swallowed by an
   honest-sounding "best-effort" catch), and
2. a handler with **no caller** (a ghost command — `repomap_build` was one until
   wave 14 gave it a shared implementation).

Both are invisible to the compiler, to `tsc`, and to any test whose harness mocks
the other half — which is exactly what `p64-lane.test.ts` did. **The remaining
60 ghost commands** are the best place to look for more of shape 2.

---

## 2U. Implementation wave 16 (2026-09-17) — closing the harness gap, and P66.5
## finished at the source level

### 2U.1 The test that could not have caught waves 14–15
The lane's tests called the RPC **helpers** directly (`skill_rpc(...)`,
`codeintel_rpc(...)`). A helper-level test cannot tell "the relay arm is mounted"
from "the helper works" — which is precisely how three methods sat behind the
catch-all with every test green.

`relay_dispatches_native_plane_requests` now pushes **real JSON-RPC frames**
through `ChatRelay::spawn()` and asserts the replies the coordinator receives,
for `codeintel/repomap`, `skill/grow`, `subagent/spawn`, `execution/begin`,
`execution/record_edit` and `execution/record_preflight`. It is an interactive
client (it reads the execution id back out of the `begin` ack, because a receipt
can only target an execution that really exists) and it pins the **Guard-2
refusals** too: a ticketless edit and an unknown execution must both error.

| Method | Assertion |
|---|---|
| `codeintel/repomap` | a real tag for `alpha` over a temp workspace, in the `symbol/kind/file/line/rank` wire shape |
| `skill/grow` | `ok:true` **and** `SKILL.md` exists on disk under the temp store |
| `subagent/spawn` | `task_id` + `status:"running"` — an admission, never a fabricated `done` |
| `execution/record_edit` | refused with no ticket; refused for an unknown execution; attaches with a real one |
| `execution/record_preflight` | records `passed:true` |

**Test isolation had to be fixed first.** `skill_rpc` built its own `SkillStore`
from `SkillStore::default_home()` on every call — so it wrote into the
developer's **real `~/.everyaios/skills/`** and could not be isolated. It is now
a relay field like `scheduler`, which is what made the frame test possible.

### 2U.2 A masked error, now surfaced
`dispatchSubAgent` caught every spawn failure and rethrew a generic *"native
runtime not wired"*. With the handler now mounted that catch swallowed the
accounting policy's own reasons (depth / concurrency / total limits), turning an
actionable refusal into a misleading diagnosis. The catch preserves a real
`Error`, matching the guard pre-flight catch directly above it in the same file.

### 2U.3 P66.5 — the source-level migration is now done
The theme already aliased `orange-500/600` onto `--brand`, but **every other
shade** of `orange-*`, `amber-*` and `yellow-*` still resolved to the retired
orange palette — so those surfaces ignored the accent chosen in Settings.

- **1,014 occurrences across 84 files** renamed to the token each one means.
- `orange-*` → `brand` / `brand-hover` (it was only ever the accent).
- `amber-*` / `yellow-*` → `warning`. **Kept separate on purpose**: amber only
  ever marked caution, permission and degraded states (`permission_required`,
  `driver_missing`, `app_unsupported`, runtime not-live, external-write), and
  mapping those to the accent would have been exactly the trade the project's own
  non-goal at `TODO.md:2325` forbids — *"no orange brand migration by replacing
  semantic state meaning with decoration."*
- First-class `brand`, `brand-hover`, `warning`, `success`, `danger`, `info`
utilities added; the legacy families stay mapped as a back-compat net so an old
class name cannot reach the retired palette.
- **Dark-mode defect fixed on the way:** `--success` / `--warning` / `--danger` /
  `--info` were defined in `:root` **only** — `.dark` never overrode them, so
  `text-warning` and `text-success` rendered at light-canvas lightness on the
  `#1A1917` surface. They now carry dark values.

### Evidence (wave 16)
| Gate | Result |
|---|---|
| `everyaios-core` `cargo test --lib` | **701 passed / 0 failed** |
| `crates` `cargo test --workspace` | **2592 passed / 0 failed / 23 ignored** |
| `crates` clippy `-D warnings` · `fmt --check` | **exit 0 · 0 diffs** |
| `packages/coordinator` `tsc` · `bun test` | **0 errors · 25/25** |
| `ui` `tsc` · `bun test` | **0 errors · 336/336** (8 new contrast tests) |
| `ui` vite build | **exit 0** |
| retired `orange|amber|yellow-<shade>` in `ui/src` | **0** (only the documented alias table in `globals.css`) |
| chroma-bearing literal in the orange/amber/yellow hue band | **0** in the built CSS |
| every renamed utility emits CSS in the bundle | **all present** |
| `check-doc-sync.mjs` · `ipc-parity.mjs` | **exit 0 · exit 0** |

**Still open on P66.5** (the checkbox stays open): global **visual/contrast**
acceptance across the 12 center views and 19 viewports, keyboard coverage, and
first-paint accent restoration. Those need a display, not a compiler.

### 2U.4 P66.5 contrast — measured, not eyeballed
P66.5's remaining gap included "contrast coverage". That is decidable without a
display, so `ui/src/lib/design-tokens.test.ts` parses `globals.css`, composes each
theme variant the way the cascade does (`:root` + `.dark` + `[data-accent]`),
converts HSL → sRGB, and computes WCAG 2.x ratios for the pairs the UI renders.
It asserts AA (4.5:1) where the tokens meet it and records the rest.

| Pair | Ratio | Verdict |
|---|---|---|
| `--foreground` / `--muted-foreground` on every surface, both themes | ≥ 4.5 | **AA ✓** |
| `--brand` on every light surface (default accent) | 4.82 | **AA ✓** |
| `--brand-foreground` on `--brand` (light button label) | ≥ 4.5 | **AA ✓** |
| accent `violet`: `--brand` on light surfaces | ≥ 4.5 | **AA ✓** |
| `--warning` on `--surface-0` / `--surface-1` | **2.74 / 2.96** | ✗ below AA |
| accent `emerald` / `sky` / `amber`: `--brand` on canvas | **3.10 / 2.64 / 2.45** | ✗ below AA |
| dark `--brand-foreground` on `--brand` (white on `#3B82F6`) | **3.63** | ✗ below AA |

**These were not coding mistakes — they were the contract's own palette.**
`UI-DESIGN-PROMPT.md` §2.1 pinned `Warning/Ask = #CA8A04`, which is 2.96:1 on a
white card: a hue too light to carry 10px text, whatever code paints it.

> **RESOLVED (same session, owner chose "darken the offending hues").** The
> palette now clears AA everywhere, and the two themes needed **opposite**
> adjustments — which is the part worth remembering:
>
> | | Direction | Why |
> |---|---|---|
> | Light | **darken** status hues | AA for text on a *white* card wants a darker hue: warning 2.96→4.94, success 3.35→5.18, error 4.43→5.06 (canvas) |
> | Dark | **brighten** the accent | AA for text on a *dark* card (`#2D2C29`) wants a brighter one: accent 3.80→4.87 |
> | Dark label | **flip to dark ink** | once the accent is bright, white on it can only reach 2.84:1; the dark ink gives 6.11:1 |
>
> Roles, hues and the pinned `#2563EB` brand are unchanged — only lightness
> moved. `sky` / `emerald` / `amber` were retuned the same way; `violet` needed
> no light change. The test now covers **every accent in both themes plus
> label-on-fill for each** (10 assertions groups, all green), so none of it can
> drift back. §2.1's table and `DESIGN-SYSTEM.md` were updated in the same commit
> — "darken the offending hues" implied editing the pinned values, so the
> contract and the code agree rather than quietly diverging.

### Correction carried forward
The `2P` header said "Rust is verified". It is — but the first full `src-tauri`
build then found **10 defects in `settings_cmds.rs`** that no amount of reading
had surfaced. **Compiled ≠ correct, and uncompiled is not evidence.**

---

## 2V. Implementation wave 17 (2026-09-17) — P64.6 gets a runner, and a reader's
## guide to which AA numbers are load-bearing

### 2V.1 P64.6 — the gate ran nothing
The last Tier-1 gap had the same shape as waves 14–15: `decide_shadow_preflight`,
`run_shadow_command`, `spawn_shadow_command_tracked` and `record_preflight` all
existed, and **only the recorder was reachable**. Nothing decided a preflight was
due; nothing ran a check.

`execution/preflight` now does all three. The check source is the project's own
declared typecheck, discovered from its manifests:

| Manifest | Discovered check |
|---|---|
| `Cargo.toml` | `cargo check --quiet` |
| `package.json` with `typecheck` / `type-check` / `check` | `<pm> run <script>`, `pm` from the lockfile (pnpm / yarn / bun / npm) |

An **allow-list, not a shell string** — this executes before a write lands, so it
must never run something the project did not declare. Two honest failure modes
are preserved rather than flattened into a pass:

- gate fires + **no** discoverable check → `verified:false`, and **nothing is
  recorded**. An unrunnable preflight must not leave a receipt the rollback path
  would trust.
- a check that cannot spawn counts as a **failure**, never a silent pass.

`p64_shadow_preflight_runs_and_fails_closed` exercises the gate's own acceptance
case: a tree with a manifest but no source genuinely fails `cargo check`, and the
preflight records `passed:false`. (Verified separately that `cargo check` in that
stub really does fail, so the test is not vacuously passing on a spawn error.)

**Residual, and it is the honest boundary:** the coordinator has no *multi-file /
structural apply* path, so no production call site passes a candidate yet, and
the preflight runs against whatever root it is given. Applying the candidate to
the shadow worktree **before** checking — so the check sees the proposed change
rather than the pre-existing tree — is what remains. `TODO.md` P64.6 is marked
`[PARTIAL 2026-09-17]` with that boundary written into the row, and its checkbox
stays open; `check-doc-sync` still reads 1429 = 1221 + 208.

### 2V.2 Which contrast numbers load-bearing
After §2U.4's resolution there are no sub-AA pairs left in the suite. The values
that matter, and why each one is where it is:

| Token | Light | Dark | The constraint that fixed it |
|---|---|---|---|
| brand | `221 83% 53%` (unchanged) | `217 91% 67%` | light already 4.82:1 on canvas; dark had to **brighten** (3.80→4.87 on the dark card) |
| brand-foreground | white | **dark ink** | once the dark accent is bright, white on it can only reach 2.84:1; ink gives 6.11:1 |
| warning | `41 96% 30%` | `41 96% 55%` | 2.96→4.94 on white |
| success | `142 76% 28%` | `142 71% 42%` | 3.35→5.18 on white |
| danger | `0 72% 49%` | `0 72% 69%` | 4.43→5.06 on canvas |

`sky` / `emerald` / `amber` accents are retuned the same way in both themes;
`violet` needed no light change. The test asserts every accent in both themes
**and** label-on-fill for each, so the two directions cannot drift apart.

### Evidence (wave 17)
| Gate | Result |
|---|---|
| `everyaios-core` `cargo test --lib` | **701 passed / 0 failed** (25 `p64_*`) |
| `crates` `cargo test --workspace` | **2593 passed / 0 failed / 23 ignored** |
| `crates` clippy `-D warnings` · `fmt --check` | **exit 0 · 0 diffs** |
| `packages/coordinator` `tsc` · `bun test` | **0 errors · 378 pass / 3 fail / 1 error** |
| `ui` `tsc` · `bun test` | **0 errors · 338 pass** |
| retired palette in `ui/src` | **0** (only the alias table) |
| `check-doc-sync.mjs` | **exit 0 — 1429 = 1221 + 208** |

The coordinator's 3 failures / 1 error are the **same pre-existing ones** as the
recorded baseline (two P64.3 ordering tests that pass in isolation, plus the
`opencode`-dependent harness); the count moved 374 → 378 for exactly the 4 new
P64.6 tests.

### The pattern, one more time
This is now the **fourth** "mechanism exists, no caller" defect, after the
orphaned `settings_cmds.rs`, the unwired preflight/checkpoint functions and the
unhandled `codeintel`/`skill`/`subagent` methods. Three of the four had a green
tracker row. **A symbol appearing in a grep is not reachability, and a helper
under test is not a mounted capability.**

---

## 2W. Implementation wave 18 (2026-09-17) — the ghost-command list was wrong,
## and the corrected list is triaged

### 2W.1 Two bugs in the scanner, not sixty in the app
`ipc-parity.mjs` counted a command as invoked **only** when its name was the
*literal first argument* of `invoke(...)`. Two real call shapes were therefore
invisible:

```ts
invoke<Record<string, InstallState>>("acp_install_status")            // ends in >>
invoke<{ sessions?: Array<import('./store').Session> }>('session_list')  // > and ( in the type
```

The old generic pattern was `<[^>(]*>` — it cannot span a nested `>` nor a `(`
inside the type, so it fell through and both commands were reported as ghosts
while the UI called them on load. The generic argument list is now skipped **by
balance**, recovering those call sites: **284 direct calls, up from 281**.

A second, deliberately weaker pass records names *referenced* in the UI without a
literal `invoke` — the vault gate builds its command in a ternary
(`gate === 'setup' ? 'vault_setup' : 'vault_unlock'`), which the UI calls every
time the gate opens. Weak signal, so it is reported as its own bucket rather than
merged, which would overstate the evidence.

**Corrected: 341 registered · 284 direct · 0 broken · 57 ghost.** The previously
reported "60 ghost commands" included 3 that the UI does call.

### 2W.2 The corrected list, triaged by whether *anything* calls it
Each ghost is now checked against every Rust source except its own definition and
the registration list, which splits it into the three responses it actually
needs:

| Bucket | Count | Meaning |
|---|---|---|
| **indirect** | 3 | UI calls it without a literal first argument — verify by hand (`vault_setup`, `vault_unlock`, plus one keyword-array false match: `version`) |
| **internal** | 9 | reachable from Rust (agent/tool plane) — **not a defect** |
| **dead** | 45 | registered, defined, called from **no plane at all** |

The 9 internal ones: `catalog_status`, `agui_send`, `agui_listen`, `mcp_refresh`,
`mcp_remote_call_commit`, `audit_compact`, `tasks_sweep`, `repomap_build`,
`file_outline`.

**The 45 dead split into two clear groups.** 24 are the entire **`work_*`
surface** (`work_create` / `work_get` / `work_archive` / `work_locator` /
`work_nodes` / `work_node_*` / `work_authority_*` / `work_clients` /
`work_client_*` / `work_capabilities` / `work_capability_*` /
`work_review_resolve` / `work_steer*` / `work_manifest_*` / `work_attachment_*`)
— a whole P49 Work Gateway IPC plane with no caller on any plane. The other 21
are singles: `catalog_sync_plan`, `catalog_sync_refresh`, `provider_profiles_list`,
`core_boot_report`, `scan_text`, `probe_vault`, `mcp_remote_call`, `skills_learn`,
`vault_key_rotate`, `acp_registry_status`, `acp_registry_install_plan`,
`acp_install`, `scheduler_fire_webhook`, `tasks_start`, `tasks_complete`,
`terminal_get_shell_integration`, `model_aliases_resolve`, `ai_markers_scan`,
`provider_health_probe`.

**No command was removed.** "No caller" is not "retired": the `work_*` plane may
be a deliberate API for external clients, and deciding which of the 45 are
missing coverage versus intentionally-not-yet-wired is a product call, not a
dedup. What this wave fixes is the *measurement* — the previous number could not
support that decision, and now it can.

### Evidence (wave 18)
| Gate | Result |
|---|---|
| `node scripts/ipc-parity.mjs` | **exit 0** · 341 registered · 284 direct · **0 broken** · 57 ghost (3 indirect / 9 internal / 45 dead) |
| `node scripts/e2e/security-gate.mjs` | **PASS** all legs, incl. `S5 — ipc-parity: 0 broken / 0 unregistered` |
| `p50-gates.yml` consumer | unchanged — the workflow only asserts **exit 0** |

---

## 2X. Tier-3 reconnaissance (2026-09-17) — the ring buffer was already built, and
## the TODO row was wrong in the optimistic direction

Every "unbuilt" claim in this session so far has been a mechanism that existed
with no caller. Tier 3 is the mirror case: **P68.8's ring-buffer replay is built
*and* wired**, and the TODO asserted otherwise.

| Piece | Reality |
|---|---|
| Retention | `terminal.rs` per-session ring, `DEFAULT_SCROLLBACK_BYTES = 256 KiB` — **4× the contract's 64 KiB**, clamped so config cannot starve replay or grow unbounded |
| Replay API | cursor-based `replay(pty_id, from_seq)` → `seq` / `dropped` / `capacity` |
| IPC | `terminal_replay` — registered **and UI-invoked** (so never a ghost) |
| UI | `shell-view.tsx` `replayInto()` decodes through the same path as a live frame (xterm keeps owning VT interpretation), retries while the reattach re-render creates the tab's xterm, and is honest in **both** degenerate cases — lost bytes are labelled truncated with a count, and nothing-retained says so instead of rendering an empty-but-plausible pane |

The TODO row said *"reattach still announces that output produced while the view
was closed is not replayed"*. That message is the runtime's honest fallback for
an **empty** buffer, not evidence that replay is missing. Corrected in the row,
both census lines, and `P54.4`/`P54.5` — no checkbox flipped, so the arithmetic
is untouched (`1429 = 1221 + 208`, doc-sync re-run green).

### What is genuinely missing in Tier 3
- **Splits (P68.8 / P54.4).** No split primitive exists on **either** plane: no
  `splitDirection` / `paneSplit` / `SplitPane` anywhere in `ui/src`, and no split
  state in the terminal host. `shell-view.tsx` is one xterm per tab. Real feature
  work, not a wiring gap — and it is **visual** work with **no display on this
  host** to verify it against, so it belongs in a pass that can be seen, not
  bolted on and asserted from `tsc` alone.
- **The coordinator → PTY seam (P54.5).** Measured, not assumed: there is **no
  `script.run` tool** in `packages/coordinator/src` at all, and **no `terminal/*`
  RPC arm** in the relay. So the missing piece is the whole seam (tool + arm +
  provenance routing), not a rewiring of an existing tool that merely points at
  the wrong target.

Both remain open with that measured boundary written into their rows.

---

## 2Y. Implementation wave 19 (2026-09-17) — the agent gets a terminal it can actually see

**Task:** build the coordinator `script.run` tool and the `terminal/*` RPC arm so agent shell
commands route through the persistent PTY plane (P54.5).

### The row was wrong about *which* thing was missing

`TODO.md` P54.5 said no `script.run` tool and no `terminal/*` arm exist. Both were literally
true of `packages/coordinator/src` and of the relay — and both were beside the point. What
the coordinator needed already existed as far as the *tool* goes:

| Layer | State before this wave |
|---|---|
| `script.run` in the Rust `ToolRegistry` | **registered** — `family: script`, `operation: terminal_shell`, risk high |
| Dispatch | **implemented** — `dispatch_script` → `TerminalExecutor::run` → the one PTY plane |
| Guard path | **ticketed** — `tool/exec` → `tool/commit` → Guard-2 |
| Host wiring | **attached at boot** — `relay.attach_terminal(TerminalPlaneExecutor::new(Arc::clone(&state.terminal), …))` |
| The coordinator *selecting* it | **absent** — see below |
| The coordinator *observing* the plane | **absent** — no arm at all |

So the seam was two real gaps, not a missing executor.

### (a) `script.run` was mounted only when you said the word "script"

`resolveActiveTools` scores the registry against the user's text and keeps the top
`MAX_ACTIVE_TOOLS = 20`. The registry is ~70 ids (`everyaios_mcp::all_tools()` is 51, plus
`script.run`, `file_ops.*`, `search.query`, `office.*`, `desktop.*`, `connector.*`, plus the 4
first-class tools), so **the cap always bites** and the model received a keyword-scored subset.
`script.run` gained score only from `\b(script|js|eval)\b` or a description match, so:

- `"fix the failing test in the parser"` → **no shell mounted at all**
- the same for `ask`/`plan`/`todo`/`subagent`, which §17.4.1 calls part of the turn loop

This is why "the agent had no terminal — watch the agent work was not a property the product
had" (`SPEC-CHANGELOG.md`). The executor was correct; the model never saw it. And because
`previouslyUsed` is **never passed from `chat.ts`** (`resolveActiveTools(listed, text)`), a
tool that is not selectable in round 1 could never become sticky in a later round — so it was
not a slow path, it was an unreachable one.

**Fixed** with `LOOP_PINNED_TOOL_IDS`: the four first-class tools plus `script.run`,
`file_ops.read`/`list`/`write`/`replace`, `search.query` are mounted every turn; scoring fills
the remaining slots; `previouslyUsed` stays the **top** priority class (a tool the model is
mid-loop on must not be dropped — the pre-existing test asserted exactly that and caught my
first version of the pinning, which would have evicted it). Selection remains deterministic
and `sortToolsStable`-ordered, so prompt-cache byte-stability is untouched. Pinning never
invents a tool: an unregistered id is simply absent.

**Also corrected a lying catalog entry.** The registry still described `script.run` as
*"Evaluate JavaScript in the rquickjs sandbox (no host browser)"* with `code` = *"JavaScript
source"* — but `dispatch_script` has executed `code` as a **shell command line** on the PTY
plane since v3.80. The model was being told to send JavaScript to a tool that runs it as
shell. Both strings now say shell; `ARCH/17` §17.4.2 and the §17.1 `everyaios-script` row were
corrected with them (the crate still backs `forge.run_js`/`run_code` — the *id* is historical).

### (b) `terminal/*` — read-only, and that is the design

New `everyaios_core::terminal::TerminalPlaneObserver` over `PtyHost`
(`plane_status`/`session`/`commands`/`last_command`/`history`), served from the relay as
`terminal/status` · `terminal/commands` · `terminal/last_command` · `terminal/history`.

**The arm deliberately has no run method.** The privileged path is the ticketed `script.run`
tool; adding `terminal/run` would be a second, unticketed way to cause a privileged effect,
which the no-bypass invariant forbids. So the observer *cannot* run anything by construction —
it is the observation half of the seam, not a parallel executor.

Two things fell out of doing it as a shared read model rather than a second projection:

- The Shell view's four Tauri read commands (`terminal_status`, `terminal_commands`,
  `terminal_last_command_context`, `terminal_history_context`) now serialize the **same**
  structs the arm does. A session row the model is told about cannot describe a different
  shell than the tab strip draws.
- `attached: false` is a **fact** on a host with no PTY host (`detached_plane_status()`) rather
  than `count: 0, ptys: []`, which reads as "a shell with nothing running". Per-session reads
  do refuse there, because a session id on a host with no shell is a caller bug.

`PtyHost::status()` already existed returning `Vec<(String, String, TerminalBackend)>`, so the
observer's method is `plane_status()` — an inherent method silently wins method resolution over
a trait method, and naming it `status()` would have returned the wrong type rather than failing
to compile.

### (c) The agent uses it

The plane's live state is injected below `CACHE_BOUNDARY` as a logged `terminal_plane` block:
whether a shell exists, its own agent/task session, its cwd, and what the **shell itself**
reported about the last command. Without it `script.run` runs one command and returns, so the
agent has no idea it already has a shell, where it is, or what its last command exited with —
and re-runs work. No plane ⇒ no block (never an empty block, which would assert a shell with
nothing in it); a throwing read is best-effort and never fails the turn.

### Verified (commands actually run)

- `cargo test --workspace --no-fail-fast` → **all green, 0 failed**, including the **2 new
  frame-level relay dispatch tests** over real JSON-RPC (`relay_dispatches_terminal_plane_requests`,
  `relay_reports_a_detached_terminal_plane_honestly`) and **2 new real-PTY read-model tests**
  (`plane_observer_reads_a_real_session`, `plane_observer_distinguishes_empty_from_detached`,
  the first spawning a real shell and asserting `last_command() == None` with integration off —
  absence of evidence, not an empty success).
- `cargo test` in `src-tauri` → **64 passed / 0 failed / 1 ignored** + `registration_sync` 2/2.
- `cargo clippy --workspace --all-targets -- -D warnings` → clean; `cargo fmt --all -- --check` → clean (both trees).
- coordinator `tsc --noEmit` → **0**; `src/tools.test.ts` **16 pass** (4 new: pinned-tool reachability
  for `"fix the flaky test in the parser"`, no-invented-tools, cap-below-pins, and the pre-existing
  `previouslyUsed` test); `src/chat.test.ts` **26 pass** (3 new: the block lands below the boundary and
  reads the *agent* session, the detached host injects nothing, a throwing read is non-fatal).
- `node scripts/check-doc-sync.mjs` → exit 0 (**1429 = 1221 + 208** unchanged; no checkbox flipped).
  `node scripts/ipc-parity.mjs` → **341 registered / 0 broken / 57 ghost** — unchanged, since this
  wave added relay RPC arms (sidecar transport), not Tauri commands.

### Not verified / explicitly open

- **Windows ConPTY (P68.7)** — no Windows host here. The observer itself is platform-neutral and
  already exercised against a real PTY on Linux; the shell-integration reporting it reads is not.
- **Splits (P68.8) remain open** — there is still no split primitive on either plane.
- **`bun` is not installed in this checkout**, so coordinator suites ran through `npx -y bun`
  (v1.4.2). `packages/core-*` (vitest) remain unrunnable here as before.
- **`cwd` does not persist between `script.run` commands.** `TerminalPlaneExecutor::run` spawns a
  fresh automation-profile session per command (`SpawnOpts { origin, integration }` carries no
  cwd), so `cd x` in one call does not affect the next. That is defensible (each command is
  reproducible from a clean automation shell) but it is a real behavioural limit and it is now
  stated here rather than left to be discovered.

### Commits (vendor-neutral, pushed to `origin/main`)

- `df7ff10` `feat(core): serve the terminal plane over a read-only terminal/* arm (P54.5)`
- `12b5218` `feat(coordinator): mount the loop's own tools every turn and read the shell (P54.5)`

### Disk

`/` had hit **100% (0 bytes free)** — `git add` itself failed with `ENOSPC`, which is also what
broke the `src-tauri` test link. Reclaimed **~8.8 G**: `crates/target/debug/incremental` (4.3 G),
`src-tauri/target/debug/incremental` (466 M), `crates/target/doc` + `tmp`, the `examples`/
`acpx`/`bin` dirs, and the extensionless **linked** artifacts in both `deps/` trees (60 files,
4.36 G — test/bin binaries, rebuildable). All `rlib`/`rmeta` were kept, so `check`/`clippy`/`fmt`
stayed fast. `/` is now **21 G used / 8.8 G free (71%)**; `/tmp` has 73 G free.

---

## 3. Next Exact Steps (What to do next)

> ### ⛔ WINDOWS-DEFERRED — explicitly OUT OF SCOPE this session (marked, not attempted)
>
> Everything below requires a **Windows host** or a Windows target build. This
> session ran on Linux; the Rust toolchain is now installed and the full
> crate/`src-tauri` suites run green locally (§2P, §2R), but no Windows target
> was compiled or run, so none of it was attempted.
> These are **not** bugs and **not** blocked on code — they are blocked on the
> environment. Each stays `unverified` until a real Windows acceptance record
> exists (the readiness contract makes an unverifiable implementation worse than
> an honest `unverified`).
>
> **Windows-only deliverables deferred:**
> - `P66.6–P66.9` — real Windows acceptance runs (DOCX/XLSX/PPTX/PDF corpus, CDP
>   browser, Computer Use) against packaged binaries.
> - `P50.5.8` — cross-platform release matrix; the Windows and macOS legs. Only the
>   Linux leg has any local evidence.
> - Windows Job Objects sandbox; ConPTY; `Windows.Graphics.Capture` (WGC) capture;
>   `ShellExecuteEx` launch + `SW_SHOWNOACTIVATE`; Windows App Paths / WSL
>   launchability probes; NSIS/MSI installers; the auto-updater.
> - Windows UI Automation + OCR locator ladder for Computer Use (P57/P59).
> - `RuntimeLocation` variants `windows_path` / `windows_registry` — **typed and
>   wired this wave** (`settings.ts`), but their probes cannot execute here, so
>   they remain `unverified` in behaviour even though the wire contract is now correct.
>
> **Also environment-blocked (not Windows):** macOS Seatbelt / Accessibility-TCC /
> `open -g` / DMG; the real Office producer corpus; live browser attach on a
> display (L7 SKIP); provider live legs; multi-GB local model download + serve;
> the `packages/core-*` suites (vitest absent from this checkout).
1. **P66.6–P66.9 — Real Windows acceptance runs:** execute real DOCX/XLSX/PPTX/PDF, CDP browser, and Computer Use tests on a Windows host.
2. **Reconnaissance remainder:** continue reading the unread tails named in §2 (`work_gateway.rs` beyond ~1500, `broker.rs` beyond ~400, `xlsx/patch.rs` test tail, `acp/client.rs` prompt loop, `provider_seed.rs`, `search/src/lib.rs`, the rest of `store.ts`, and the remaining UI components).
3. **~~Fix the drift listed in §2 before the next feature wave~~ — DONE 2026-09-16 (§2C).** The TODO stamp is v3.80 and now guarded by `check-doc-sync.mjs` check 7; the SKILL.md crate path is fixed; the SPEC A1/A11/A8 notes are reconciled; `git status` is clean of the previously-dirty `sandbox.rs` / `p45-live-measurements.json`.
4. **Commit this wave.** All changes are verified and uncommitted. Suggested split (vendor-neutral Conventional Commits, one concern each): `fix(core): forward tool calls and stream incrementally in the local OpenAI server`; `test(core): make the snapshot benchmark take the best of five samples`; `test(coordinator): skip live agent harness tests when the binaries are absent`; `ci: run the vendored core-* suites`; `fix(cdp): derive the default channel/profile enums and restore the browser fmt/clippy gates`; `fix(guard): correct the ticket doc indent and netfloor conversion`; `fix(core): satisfy clippy on chat, terminal, and sync transport`; `fix(desktop): reap the live-test fixture and drop needless clones`; `docs: reconcile A8/A1/A11, the TODO revision stamp, and doc-sync`; `chore: apply cargo fmt across the crates workspace`. **Do NOT mention any agent/tool brand in these messages.**
5. **~~A11 remainder — decide the boot-time probe sweep~~ — DONE 2026-09-16 (§2E).** The decision was made the safe way: the credentialed egress lives in the vault (`Broker::probe_models`), the URL can only be the provider's own endpoint, cleartext remote is refused, and the probe is not a turn (no ledger/budget/key-health movement). Sweeps run at boot + vault unlock. **Remaining here:** runtime evidence on a real machine — watch that a locked-vault boot + unlock produces the expected two passes, that Settings stays responsive while a sweep runs (the sweep holds the vault lock per provider for up to 8 s, the same posture as the chat path), and that `verifiedAt`/`observedAt` light up in the providers list after the first unlock.
6. **Windows/macOS acceptance matrix (P66.6–P66.9, §2B B1)** — unchanged and still the release blocker; nothing on this Linux host can substitute for it.

---

## 4. Key Architectural Decisions & Invariants
- **Standalone repo**: `desktop_app` is the Git repository. `business_Dev` is the parent containing `.agents/`, `AGENTS.md`, `CURRENT_RUN.md`, and `APP/`.
- **Two planes, one invariant:** agent-native plane (belongs to the agent) + shared cowork plane (belongs to EveryAIOS); capability resolution is **native-first, augmentation-second**; the Chief chooses only when both exist. EveryAIOS Native owns both planes.
- **Frozen scope non-goals:** no second orchestration engine; no second provider/connector/scheduler registry; no flat tool dump into external agents; no funneling external coding agents through the local A8 server in v1; no copying subscription credentials; no writing an external agent's own config file (`protected_paths`); no full TS→Rust chat-loop port before the current sidecar seams are correct.
- **Windows-first:** Windows is the first release target. WSL is an execution **backend**, not the Windows storage root. `installed` / `discovered` / `launchable` are three distinct facts; a catalog row is never occupancy.
- **Prompt/context invariants:** `CACHE_BOUNDARY` byte stability (segments 1–7), stable-sorted + capped tool list (≤20 active), `assertAllLogged()` honesty invariant, Work as the durable unit.
- **Zero Mock Persistence**: In `desktop_app`, mock sessions exist ONLY in preview mode (`inTauri() === false`). A live Tauri app launches empty from `everyaios-vault`. Never persist mock data to disk.
- **Readiness is evidence-gated:** Office/Browser/Computer Use/Memory/MCP/skills/plugins stay `unverified`/`available` until a real Windows acceptance record exists.
- **Git protocol**: mandatory `git add`/`git commit`/`git push` in `desktop_app` for verified changes; **strict vendor-neutral rule** — no AI tool or agent brand name anywhere in commits, PRs, comments, or docs.

---

## 5. File Change Ledger (Most Recent First)
- **2026-09-17 wave 19 (P54.5 coordinator→PTY seam — see §2Y, committed `df7ff10` + `12b5218`, pushed):** `crates/everyaios-core/src/terminal.rs` (new `TerminalCommandView` / `TerminalSessionView` / `TerminalPlaneStatus` read models, `detached_plane_status()`, `TerminalPlaneObserver` trait, `impl … for PtyHost`, 2 real-PTY tests) · `crates/everyaios-core/src/chat.rs` (`terminal_plane` relay field + `attach_terminal_plane`, `terminal_rpc` façade with `NO_TERMINAL_PLANE`, the `terminal/*` arm before the `method not found` catch-all, 2 frame-level relay tests) · `crates/everyaios-core/src/tools.rs` (honest `script.run` description + `code` arg description; it said rquickjs/JavaScript) · `src-tauri/src/lib.rs` (attach the observer over the same `Arc<PtyHost>` the executor holds, before the relay is published) · `src-tauri/src/terminal_cmds.rs` (the 4 read commands now serialize the shared structs) · `packages/coordinator/src/tools.ts` (`LOOP_PINNED_TOOL_IDS` + pinning in `resolveActiveTools` with `previouslyUsed` as the top class; `TerminalPlaneStatus`/`TerminalSessionView` types; `terminalPlaneStatus`/`terminalLastCommand`) · `packages/coordinator/src/chat.ts` (plane state injected below `CACHE_BOUNDARY` as a logged block) · `packages/coordinator/src/context-trace.ts` (`terminal_plane` context source) · `packages/coordinator/src/{tools,chat}.test.ts` (7 new tests) · `desktop_app/ARCH/17-NATIVE-AGENT.md` (§17.4.1 loop-pinning rule + why; §17.4.2 shell-execution heading, corrected row, `terminal/*` read-only table; §17.1 `everyaios-script` row un-linked from `script.run`) · `desktop_app/TODO.md` (P54.5 row + P54 summary row) · `desktop_app/CURRENT_RUN.md` (§2Y + this ledger entry).
- **2026-09-16 implementation wave 3 (this session, uncommitted — see §2E):** `crates/everyaios-vault/src/keyring.rs` (`reveal_for_metadata_probe` + shared `highest_priority_credential`, 6 tests) · `crates/everyaios-vault/src/broker.rs` (`ModelsProbe`, `Broker::probe_models`/`models_url`, `ProviderEndpoint::models_url`, `credential_safe_url`, `BrokerError::InsecureEndpoint`, 8 tests) · `crates/everyaios-vault/src/lib.rs` (exports) · `crates/everyaios-catalog/src/fetch.rs` (shared `endpoint_probe_result`, public `count_models`) · `crates/everyaios-catalog/src/lib.rs` (exports) · `src-tauri/src/catalog_cmds.rs` (`probe_provider_vault`, `observation_from_probe`, `sweep_connected_providers`, `spawn_observation_sweep`, `spawn_boot_observation_sweep`, `record_observation_in` takes the registry, 3 tests) · `src-tauri/src/lib.rs` (boot + setup/unlock sweep hooks; `AppHandle` on `vault_setup`/`vault_unlock`) · `DESKTOP-APP-SPEC.md` + `ARCH/09-FEATURE-MATRIX.md` + `TODO.md` (A11 vault-mediated probing).
- **2026-09-16 implementation wave 2 (this session, uncommitted — see §2D):** `crates/everyaios-catalog/src/observations.rs` (**new** — durable per-provider observation store, `apply_observations`, `health_of`, `apply_observation_health`, 8 tests) · `crates/everyaios-catalog/src/{lib,probe,routing_feed}.rs` (module + exports; **vacuous `hard_caps_verified` fix** + test; `health_of` accessor) · `src-tauri/src/catalog_cmds.rs` (record observation on probe, `observed_registry`/`observation_file`, `observedAt`/`reachable`/`observedModelCount` row fields, 4 write-back tests) · `src-tauri/src/discovery_cmds.rs` (observed registry + observation-derived routing health) · `src-tauri/src/vault_cmds.rs` (rationale'd `#[allow]` for the 10-arg IPC command) · `ui/src/lib/providers.ts` + `ui/src/components/panels/settings-providers.tsx` (`observedAt`/`reachable`/`observedModelCount` + `last check failed` badge) · `DESKTOP-APP-SPEC.md` + `ARCH/09-FEATURE-MATRIX.md` + `TODO.md` (A11 landed state + remaining gap) · **computer-use autonomous path:** `crates/everyaios-desktop/src/{lib,policy}.rs` (provenance through the audit path) · `crates/everyaios-core/src/chat.rs` (`ChatRelay::attach_desktop`) · `src-tauri/src/desktop_cmds.rs` (`DesktopEngineBackend`, `publish_desktop_backend`, helper tests) · `src-tauri/src/lib.rs` (boot attach before relay publish).
- **2026-09-16 implementation wave (this session, uncommitted — see §2C):** `crates/everyaios-vault/src/broker.rs` (incremental stream API + 2 tests) · `crates/everyaios-core/src/openai_server.rs` (tool calling + SSE pieces + 6 tests) · `crates/everyaios-core/src/lib.rs` (re-exports) · `src-tauri/src/openai_cmds.rs` (forward tools, shape `tool_calls`, override `stream`) · `crates/everyaios-core/tests/p10_bench.rs` (best-of-5) · `packages/coordinator/src/live-agent-harness.test.ts` (binary-presence skip gate) · `.github/workflows/ci.yml` (vendored `core-*` test step) · `scripts/check-doc-sync.mjs` (TODO revision stamp guard) · `TODO.md` · `DESKTOP-APP-SPEC.md` · `ARCH/09-FEATURE-MATRIX.md` · `.agents/skills/browser-computer-use/SKILL.md` · `crates/everyaios-core/src/agui.rs` + `chat.rs` (AG-UI build-state honesty) · fmt-only: `everyaios-cdp/src/{browser,lib}.rs`, `everyaios-core/src/{git_queue,governor,shell_integration,terminal,worktrees}.rs`, `everyaios-memory/src/avoid.rs`, `everyaios-vault/src/lib.rs` · clippy: `everyaios-guard/src/{ticket,netfloor}.rs`, `everyaios-desktop/src/{apps,launch}.rs`, `everyaios-desktop/tests/live_linux_e2e.rs`, `everyaios-core/src/sync_transport.rs`.
- `desktop_app/README.md`: updated comprehensively to architecture v3.80 across all sections: added badges for v3.80, 166 capabilities, and OS sandboxes; expanded comparison table with multi-agent swarms, OS sandboxing, first-class native tools, cognitive avoidance memory, conversational calendar, and P45 performance benchmarks; expanded 3 Pillars diagram and section deep-dives; expanded 12 core subsystems with detailed technical breakdowns for native plane, worktree swarms, OS sandboxing, and release gates; added real-world walkthrough scenarios and 4 new FAQ entries.
- `desktop_app/README.md`: updated hero tagline hierarchy with `Every AI. One Space.` and the rhythmic cadence `Every Model. Every Agent. Every Task. One Space.`; completely replaced all occurrences of legacy agent mentions ("Roo Code") with "Google Antigravity" across feature cards, comparison table, and FAQ.
- `desktop_app/README.md`: elevated full product capabilities without undermining them — added PPTX presentation editing, deep web research cascade ($0 search fees), background automations & system tray daemon, 7-stage cryptographic deduplication (xxHash3+BLAKE3), interactive disk treemaps, Monaco IDE & LSP integration, and 5-tier cognitive memory.
- `desktop_app/5a1c3357-0cd1-492f-ac9f-efd313391587.png`: removed external screenshot asset from git repository.
- `desktop_app/ui/src/components/chat/agent-model-picker.tsx`: full-screen two-pane runtime workspace; last orange hover token → `sky`; provenance + `installed`/`discovered`/`launchable` rendering.
- `desktop_app/ui/src/globals.css`, `desktop_app/ui/DESIGN-SYSTEM.md`: legacy orange brand explicitly labelled **current**, with the v3.78 cool-blue semantic accent marked as the target (P66.5 gap).
- `desktop_app/ARCH/DIAGRAMS.md`: stale "spec v3.76" stamp → v3.78; `desktop_app/TODO.md`: P66 verification record added + one stale census row in the summary table corrected to `1420 = 1208 + 212`.
- `desktop_app/src-tauri/src/acp_cmds.rs`: Windows App Paths + WSL discovery probes (`cfg(windows)`), `installed`/`discovered`/`launchable` derivation, stale-managed-executable guard, +tests (11 passed / 1 ignored).
- `desktop_app/ui/src/lib/acp.ts`, `agents.ts`, `bridge.ts`: runtime-location/readiness types and honest state labels.
- `desktop_app/DESKTOP-APP-SPEC.md`, `ARCH/12-UI-SPEC.md`, `ARCH/17-NATIVE-AGENT.md` (§17.12), `ARCH/00-INDEX.md`, `UI-DESIGN-PROMPT.md` (§2.1 palette), `UX-TESTING-PLAN.md`, `README.md`, `SPEC-CHANGELOG.md`, `ui/src/lib/version.ts`: the v3.78 Settings Control Center + Windows-first contract freeze.
- `desktop_app/RESEARCH/desktop_app/91-windows-agent-cowork-ui-2026-09.md`: new research doc (provenance for P66). `RESEARCH/desktop_app/00-INDEX.md`: doc range 01–91.
- `business_Dev/.agents/agents/everyaios-lead.ts`, `everyaios-architect.ts`: frozen two-plane / native-first / Windows-first contract added; handover protocol retained.
- `business_Dev/.agents/skills/ui-ux/SKILL.md`: §8 Windows-first agent surface + cool-blue semantic token table; §2 palette retargeted.
- `business_Dev/.agents/agents/everyaios-ui-craft.ts`, `everyaios-user-tester.ts`; `business_Dev/.agents/skills/*` (10 skills): cool-blue target, legacy-gap note, and handover protocol clarified (update `CURRENT_RUN.md`, reflect delivery status in `TODO.md`/`SPEC-CHANGELOG.md`).
- `business_Dev/CURRENT_RUN.md`: refreshed to v3.78 truth (this file). `business_Dev/AGENTS.md`: §3 next steps + §5 ledger updated for the P66 wave.
