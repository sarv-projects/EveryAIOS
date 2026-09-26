# 15 — Agent X (native agent)

> **Status:** Draft P2 (early — harness verification integrated 2026-09-26).
> **Role:** the native first-party agent of AgentCowork. Architecturally a **peer** of every external agent (DEC-010) — same `AgentEngine` contract, same Guard, no privileged path.
> **Dependencies:** `11-WORK`, `16-CONTEXT`, `17-MEMORY`, `13-CAPABILITY`, `14-PROVIDERS`, `18-MODEL-ROUTING`, `19-RUNTIME-ENVIRONMENTS`, `12-TRUST`.
> **Evidence:** `ARCHIVE/v1-research/agent-harness-verification.md` — 8 VERIFIED / 3 PARTIAL / 0 WRONG (claims, corrections and pinned clone HEADs recorded there) + product-owner brief (2026-09-26). Anchors cited inline.

## 1. Purpose & responsibilities

General-purpose autonomous agent for **software engineering + computer work** (coding · cowork · research) — one core, per-task profiles.

**Owns:** the agent loop · step admission · planning · context **control** (selection/ranking/budget/prune/compact/rebuild, DEC-007) · tool selection and batching · subagent orchestration policy · continuation/recovery · completion contracts · result synthesis · its CLI and ACP surfaces.
**Never owns:** capability implementation (`13`/`14`) · permissions (`12`) · work scheduling and budgets (`11`) · the durable memory store (`17`) · context data services (`16` infra) · deterministic multi-step processes (`20`) · UI.

## 2. Peer contract (`AgentEngine`)

```
createSession(options) → AgentSession
resumeSession(id) → AgentSession
run(session, input) → RunHandle
steer(session, input) → void        interrupt(session) → void
spawnSubagent(options) → AgentHandle
dispose(session) → void
```

Adapter-split discipline (verified reference: DeepSeek Harness, §D1):

- Core's registry holds **factories**; the driver registers itself (`setFactory` pattern). The owner receives a capability-only `AgentHandle` (`dispose()`), never direct state.
- Input arrives through a **durable inbox projection** over session events — not by direct mutation; a crashed process loses nothing accepted.
- Tools / prompt sections / listeners are **scope-tagged per agent** (per-binding variance without global registries).

**Evidence:** `agent-harness-verification.md §D1`; anchors `clone2/deepseek-harness/packages/core/agent/src/index.ts:160-203, 245-256` · `agent-loop/src/inbox.ts:27-65` · `scope/src/index.ts:1-40` · `system-prompt/src/index.ts:370-387`.

## 3. Session model

`AgentSession` (internal shape): handle · session state · inbox (durable projection) · context (control side) · tool scope · capability scope · event stream · memory scope · work scope · loop driver.

- **Admission boundaries:** `next-turn` (user messages) vs `next-step` (injected context / tool results). Injected inputs wait for a wake; they never interleave mid-step.
- **Durable log:** session events are append-only; UI history, prompt history and pending work are **projections** (§E4). Compaction is a projection boundary (DEC-027), never a rewrite.
- Session records are Core-owned (`11-WORK`); Agent X reads/writes through contracts only.

## 4. Loop

```
USER INPUT → ADMISSION → (PLAN/DECOMPOSE) → MODEL STEP →
  ACTION SCHEDULER (parallel independent · sequential dependent · background)
  → EXECUTE → OBSERVE → UPDATE STATE → CONTINUATION DECISION (continue | compact | finish)
```

- **Finish is hard to reach.** The loop stops only when the **completion contract** is satisfied, or it is genuinely blocked: missing capability, required user decision, or irrecoverable failure. Never because it read a file, made an edit, ran a command, or completed one subtask.
- **Completion contract:** `goal` + `success_conditions[]` + `verification[]`, carried in work state; verification runs before "done" (DEC-022 / INV-19).
- **Background work is first-class:** while a subagent runs, the main agent does non-overlapping work (verified guidance, `multi_agents_spec.rs:729`).
- **Typed stream vocabulary:** messages · thoughts · tool calls · tool updates · plans (Grok Build ACP union, §B2 / §E3) — never one opaque "output chunks" channel.
- **Overflow recovery:** provider overflow → compact-after-overflow → retry the **same step** (DEC-027).

## 5. Context control

Agent X owns context **control**; Core owns context **data** (DEC-007; `16-CONTEXT`).

- Budget discipline per DEC-027: named terms (`keep` ≈ 8k retained recent tokens · `buffer`/`reserve` ≈ 20k safety margin · summary output reserve), pre-turn feasibility check, stable-prefix/dynamic-suffix assembly, bounded fragments with persisted baseline + deltas (§A2 / §E1).
- Pipeline: retrieve → select/rank → budget → prune → compact-if-needed → checkpoint → pack.
- Manual control: focus / pin / exclude / inspect (surfaced in UI; `AGENTCOWORK-UI.md`).
- **Subagent context isolation:** each child assembles its own context; `fork_context` is an explicit per-spawn option (default: fresh + bounded inherited snapshot) — never the parent's full transcript (§B3).
- **Memory boundary:** recall via `memory.recall()` from `17`; Agent X may keep private working notes, but there is **no second durable memory store** (OQ-MEM-01 recommendation; final call in P1/P2).

## 6. Planning

Lightweight: `Goal → Plan → TaskGraph → SuccessCriteria → VerificationPlan`, kept in work state.

- **Deterministic multi-step processes belong to `20-WORKFLOW`** — the planner must not grow a second workflow engine.
- **Profiles, not separate agents:** a coding profile (RepoGraph/RepoMap · LSP · git · tests) and a cowork profile (workspace · artifacts · browser · office · desktop) select capability loadouts and context strategies. One core, many loadouts.
- Agent **authors workflows** (emits a `WorkflowDefinition`; user clicks "Save as Workflow") and **invokes workflows as tools** (DEC-008).

## 7. Delegation & subagents

Per DEC-029 (evidence §A3 / §B3 / §E7):

| Aspect | Rule |
|---|---|
| Child sessions | One child session per subagent, own context, own toolset/persona — never a forked prompt inside the parent. |
| Project rules | Delivered **in full** to children, escaped so repository content cannot forge harness framing (`prompt/context.rs:152,196`; `agents_md.rs:382`). |
| Isolation | Worktree isolation is a **per-spawn option** (cheap read-only children don't pay worktree cost); concurrent writers get isolated checkouts + write leases. |
| Context | `fork_context` explicit; default fresh + bounded inherited snapshot. |
| Return value | **Worker receipt** (status · scope · summary · findings · changed files · tests · artifacts · blockers · confidence · usage) — never the transcript. |
| Bounds | Platform enforces outer limits (max parallel · total · depth · tokens · spend); the running agent decides actual usage within them. |
| Modes | `automatic` · `preferred` · `manual` · `disabled`, plus routing rules (task type / language / capability / cost). |
| Main context | Sees only a compact worker catalog (role, skills, model, relative cost) — never each worker's full prompt. |
| Review queue | **Not borrowed from Codex** (absent from its source, §A3). If wanted, it is our own product-layer build (OQ-AX-01). |

Overlapping writes go through workspace leases (queue / rebase / ask) — never silent overwrite.

## 8. Recovery

Bounded retry · replan · tool-failure recovery · context recovery (DEC-027) · stuck detection (no progress across N steps → escalate via the approval/question primitive, DEC-021). Crash recovery: session log + inbox projection reconstruct pending work; runs resume (INV-16). Memory/extractor failures never affect the turn (`17`).

## 9. Model interaction

- Asks `18-MODEL-ROUTING`; never hard-codes a vendor. Reasoning effort is a normalized dial mapped to provider capabilities.
- Cache discipline: stable prefix, dynamic suffix; persisted baseline + deltas (§A2).
- Extractor/vision/embedding calls also route through `18` — no side-channel SDK usage anywhere in the agent.

## 10. Permissions

Defaults (owner brief): **everyday allow** — workspace read/write/edit, normal commands and tests, normal deps, local git read/write, browser navigation, office editing, MCP reads · **dangerous ask** — permanent deletion, destructive shell, credential access, OS/security changes, disk operations, mass external writes, destructive git · **full access** — user-activated, with an irreducible catastrophic-operation gate. Enforcement lives in Guard (`12-TRUST`) across **three layers** (DEC-028); the agent requests, never decides.

## 11. Surfaces

| Surface | Shape |
|---|---|
| UI | Session conversation + plan/status + composer (via `32-CHANNELS`; UI doc owns rendering). |
| CLI | `agentcowork` (placeholder) — `-p "prompt"`, `--workspace`, `serve --acp`. |
| ACP server | Exposes Agent X like any external agent: session manager, tool registry, typed updates (§B1/§B2 basis). |
| Interop | Other agents reach Agent X through Core's gateway (`32`); Agent X reaches them through `14` adapters. |

## 12. Failure modes

| Failure | Behavior |
|---|---|
| Model call fails/timeouts | Bounded retry → block with surfaced reason + retry path. |
| Tool failure | Recovery pipeline (retry / alternate provider / replan). |
| Context overflow | Compact-after-overflow → retry same step; never "start a new conversation". |
| Subagent fails/blocks | Receipt with blockers; parent re-plans or escalates. |
| Stuck loop | Stuck detector → escalation. |
| Memory/extractor failure | Turn unaffected (`17`). |
| Guard returns ASK | Pause via approval primitive; state durable across the wait. |

## 13. Interop

**Depends on:** `11` (work/sessions) · `16` (context infra) · `17` (recall) · `13`/`14` (capabilities/providers) · `18` (models) · `19` (environments) · `12` (guard/approvals).
**Exposes to:** `11` (agent engine) · `20` (agent nodes) · `32` (CLI/ACP/UI projections) · `13` (capability requests).
**DAG check:** Agent X calls services; services never call Agent X except through work orchestration (`20`) or the delegation contract.

## 14. Open questions (`OQ-AX-*`)

1. Review-queue scope for v1 (product-layer build; ties to the UI Runs surface).
2. `fork_context` default per worker role (researcher / coder / reviewer).
3. Persona/assistant composition model (PEND-05).
4. CLI binary name + command surface (with `32`).
5. Agent X private notes vs Core-only memory (recommendation: recall via Core; private notes may exist but are not importable).
6. Which model-specific compaction hooks ship in v1 (with `16`, `18`).

## 15. Evidence

`ARCHIVE/v1-research/agent-harness-verification.md` — §A1–A4 (Codex) · §B1–B3 (Grok Build) · §C1–C3 (OpenCode) · §D1 (DeepSeek Harness) · §E (cross-cutting patterns) · §F (unverified: Codex review queue, OpenCode native compaction, OpenCode V2 pruning execution).
Corrections recorded: Codex review queue **absent**; OpenCode **no native compaction path** (both generations summarize with the model); OpenCode pruning is **V1-only**; Codex worktrees are session-bound in the desktop layer, not automatic per subagent.
Pinned clone HEADs: codex `13a966fc` · grok-build `4247f661` · opencode `fe3f3a41` · deepseek-harness `c36a83ff`.
