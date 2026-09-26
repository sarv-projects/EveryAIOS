# 15 — Agent X (native agent)

> **Status:** Frozen v1 (frozen 2026-09-26; drafted P2).
> **P7 pass (2026-09-26):** line-checked; requirements seeded (`REQ-AGX-*`, Requirements section).
> **Role:** the native first-party agent of AgentCowork. Architecturally a **peer** of every external agent (DEC-010) — same `AgentEngine` contract, same Guard, no privileged path.
> **Dependencies:** `11-WORK`, `16-CONTEXT`, `17-MEMORY`, `13-CAPABILITY`, `14-PROVIDERS`, `18-MODEL-ROUTING`, `19-RUNTIME-ENVIRONMENTS`, `12-TRUST`.
> **Evidence:** `ARCHIVE/v1-research/agent-harness-verification.md` — 8 VERIFIED / 3 PARTIAL / 0 WRONG (claims, corrections and pinned clone HEADs recorded there) + product-owner brief (2026-09-26). Anchors cited inline.

## 1. Purpose & responsibilities

General-purpose autonomous agent for **software engineering + computer work** (coding · cowork · research) — one core, per-task profiles.

**Owns:** the agent loop · step admission · planning · context **control** (selection/ranking/budget/prune/compact/rebuild, DEC-007) · tool selection and batching · subagent orchestration policy · continuation/recovery · completion contracts · result synthesis · its CLI and ACP surfaces.
**Never owns:** capability implementation (`13`/`14`) · permissions (`12`) · work scheduling and budgets (`11`) · the durable memory store (`17`) · context data services (`16` infra) · deterministic multi-step processes (`20`) · UI.

**Tool plane (bounded, Guard-mapped — DEC-028, REQ-CAP-001):** a bounded **eager hot set** of task-shaped tool façades (coder profile: file/repo/shell/code + web + agent-plane; the cowork profile substitutes office/browser/desktop for code/shell — loadouts per `13` §6) plus one meta-tool pair (`capability.search`/`capability.invoke`) for the long tail. MCP/plugin tools are **never flattened** into the request; every effect-bearing tool resolves through the capability/Guard/ticket path, read-only tools carry path scopes, independent reads may run in parallel, and mutating calls serialize per workspace lease (`25` §6). Tool outputs are bounded (preview ≈ 2,000 lines/50 KiB; the full output persists as an artifact ref; lossy success is forbidden — DEC-032).

**Implementation home (proposed; code-phase decision):** the loop is Rust kernel-side — a new `everyaios-agentx`-class crate or an `everyaios-core` module — behind `everyaios-ipc`/CTR-001, with the sidecar remaining a shared-plane service host (frozen-code inventory §1/§7: no Agent-X loop module exists today).

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
- **Child sessions:** a subagent child is a normal durable session with `parent_session_id?` linkage; its log projections are independent of — and survive — parent compaction, and its state is a facet of its `Work` item (`kind: subagent_task`), never a second state machine (§7).

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
- **Retry ownership (DEC-034 single-owner rule):** Agent X retries **turns** (bounded, then replan) and never re-implements transport retries — those belong to `18`; context overflow is recovered once by the context controller (§5) and then surfaced.

**Event/stream mapping (one vocabulary, three projections):**

| Internal stream (`18` §4) | Published event (`30` §3) | UI projection | ACP update class (`32` §4) |
|---|---|---|---|
| `step-start` | `step.started` | run/plan progress | — |
| `text-start/delta/end` | `model.delta` (ephemeral, not persisted per delta) | message bubble | `AgentMessageChunk` |
| `reasoning-start/delta/end` | `model.delta` (ephemeral) | summarized progress only — never raw CoT | `AgentThoughtChunk` |
| `tool-input/delta/end` | `tool.proposed` | tool card (proposed) | `ToolCall` |
| `tool-call` / `tool-result` / `tool-error` | `tool.started` · `tool.progress` · `tool.completed` | tool card state model | `ToolCallUpdate` |
| plan/todo projection | `plan.created` | plan bar | `Plan` |
| `step-finish` vs `finish` | `step.completed` vs `run.completed`/`run.failed` | Runs projection | session/prompt boundaries |
| usage | `usage.recorded` | analytics | — |

## 5. Context control

Agent X owns context **control**; Core owns context **data** (DEC-007; `16-CONTEXT`).

- Budget discipline per DEC-027: named terms (`keep` ≈ 8k retained recent tokens · `buffer`/`reserve` ≈ 20k safety margin · summary output reserve), pre-turn feasibility check, stable-prefix/dynamic-suffix assembly, bounded fragments with persisted baseline + deltas (§A2 / §E1).
- Pipeline: retrieve → select/rank → budget → prune → compact-if-needed → checkpoint → pack.
- Manual control: focus / pin / exclude / inspect (surfaced in UI; `AGENTCOWORK-UI.md`).
- **Subagent context isolation:** each child assembles its own context; `fork_context` is an explicit per-spawn option (default: fresh + bounded inherited snapshot) — never the parent's full transcript (§B3).
- **Memory boundary:** recall via `memory.recall()` from `17` (scopes and ceilings actor-derived, never caller-supplied); Agent X's private working notes live as **session-scope memory items + the session log** — there is **no second durable memory store**, and Core never writes or mutates another agent's native memory/config/session files (DEC-043).

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
| Isolation | `inprocess` (default), `worktree`, and `acp` are **per-spawn options**; cheap read-only children don't pay worktree cost; concurrent writers get isolated checkouts + write leases. ACP children run as external provider-executed agents through the `14` acp adapter and gateway (`32` §4) under a scoped capability projection (Core tickets never cross the boundary), with permission prompts routed through the parent's approval channel and the same concurrency bound (DEC-029/031). |
| Context | `fork_context` explicit; default fresh + bounded inherited snapshot. |
| Return value | **Worker receipt** (status · scope · summary · findings · changed files · tests · artifacts · blockers · confidence · usage · `will_wake` · `partial`) — never the transcript. |
| Bounds | Platform enforces outer limits (max parallel · total · depth · tokens · spend); the running agent decides actual usage within them. |
| Modes | `automatic` · `preferred` · `manual` · `disabled`, plus routing rules (task type / language / capability / cost). |
| Main context | Sees only a compact worker catalog (role, skills, model, relative cost) — never each worker's full prompt. |
| Review queue | **Not borrowed from Codex** (absent from its source, §A3). If wanted, it is our own product-layer build (OQ-AX-01). |

Overlapping writes go through workspace leases (queue / rebase / ask) — never silent overwrite.

**Async lifecycle (absorbed wave 2 — `DEC-036`):**
- **Spawn returns immediately** — `{agent_id, nickname?, session_ref, status, parent_turn_id}`; spawn is never coupled to child completion unless a bounded `await` is requested.
- **Two completion modes:** a **bounded foreground wait** (declared tiers; used sparingly) or a **queue-only wake at a turn boundary** (`next-turn`/`next-step`) — completion is admitted as a typed `subagent.completed` event plus a queued prompt only if the parent is live and the child was not cancelled.
- **Wake-suppression gate:** `backgrounded && !cancelled && wake_enabled && !block_waited && !explicitly_killed && !goal_loop_active && parent_channel_open`; **a cancelled child never wakes the parent**; `will_wake` is explicit so clients never promise a wake that will not happen.
- **Typed child stream:** `subagent.spawned` (emitted before the first prompt dispatch) · `subagent.progress` (≈2 s) · `subagent.finished` (status · error · tool calls · turns · duration · tokens · output · `will_wake`).
- **Bounded waits auto-background** — a wait that exceeds its budget moves the child to the background lane instead of freezing the parent turn.
- **Concurrency:** slots are **held until closed** (not just until finished); admission is queue-on-limit by default with a `fail` opt-in; per-lane defaults + depth are declared and enforced via `11` (DEC-031).
- **Cancellation:** cooperative and token-based — parent cancel ⇒ child cancel; session teardown ⇒ cancel with **no completion rebuffer**; explicit close cascades to descendants; cancelled runs are terminal and never wake; queued spawns are swept within a bounded interval.
- **Report trust:** child receipts are **untrusted data** — scanned for instruction-shaped patterns and delivered under a no-authority header; background completion notices are framed as automated events, never as messages.
- **Child sessions are durable:** child transcripts live in their own log projections, survive parent compaction, and are addressable by `agent_id` for resume/steer; receipt delivery is at-most-once per parent incarnation, size-capped with a full-log artifact ref; `usage` rolls up to the parent.

**Child lifecycle mapping (no second enum — INV-06).** Child work items are `Work` of `kind: subagent_task` (`11` §2); subagent state is a facet of that state machine, not a parallel machine:

| Child facet | Derived from | Notes |
|---|---|---|
| `pending` | Work `queued` (admitted, not started) | spawn returned; slot held (DEC-036) |
| `running` | Work `running` | `subagent.spawned` emitted before the first prompt dispatch |
| `waiting` | Work `waiting`/`paused`/`awaiting_approval` | Guard ASK / question / bounded wait parked |
| `interrupted` | active Step settled `failed{reason:"interrupted"}`, Work returns admissible | `interrupt` only; session survives |
| `completed` / `failed` | Work terminal | receipt emitted once; wake per gate |
| `cancelled` / `expired` | Work terminal | never wakes; teardown not rebuffered |
| `closed` | explicit close after terminal | releases the concurrency slot (held-until-closed) |

**Spawn options (`SubagentOptions`, CTR-021 extension; DEC-029/036):**

```
SubagentOptions {
  worker: AgentProfileRef | role            // required
  task: { objective, prompt?, success_conditions? }
  context: { fork: none | bounded | full    // default per role (OQ-AX-02)
             refs[] }                        // ≤ declared ref budget; never the transcript
  tools?: loadout_ref                        // child tool scope = parent ceiling ∩ loadout ∩ agent rules
  model?: ModelRef | inherit                 // default inherit → 18 router
  isolation: inprocess | worktree | acp      // default inprocess
  limits?: { max_steps?, max_tokens?, max_spend?, wall_time_ms? }   // may narrow, never widen Core bounds
  delivery: { await?: bounded(ms) | none, wake: bool = true, surface: parent | ui }
}
→ SubagentRef { agent_id, nickname?, session_ref, work_id, status, parent_turn_id }
```

Depth/budget fields (`max_parallel` · `max_total_per_tree` · `max_depth` · `max_worker_tokens` · `max_session_spend` · per-lane concurrency) are **Core-owned** (`11` §3; DEC-031): a spawn may request **narrower** limits only.

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

## 16. Requirements (`REQ-AGX-*`)

Testable behaviors owned by this module live in `ARCH/08-REQUIREMENTS.md`; the traceability chain is in `ARCH/09-FEATURE-MATRIX.md`. This table is a pointer, not a second copy.

| REQ | Behavior (one line) |
|---|---|
| `REQ-AGX-001` | Delegation contract: child session, escaped rules, worktree option, receipts, Core-enforced bounds (DEC-029/031) |
| `REQ-AGX-002` | Native harness loop: step loop, boundaries, step budget + wrap-up, completion contract (DEC-022) |
| `REQ-AGX-003` | Deterministic loop guards: repeated-call/no-progress escalation through the approval primitive (DEC-021) |
| `REQ-AGX-004` | Tool plane: bounded loadout, per-tool guard mapping, no flat dump, parallel reads/serial mutations (REQ-CAP-001) |
| `REQ-AGX-005` | Tool output: bounded preview + durable artifact ref; lossy success forbidden (DEC-032) |
| `REQ-AGX-006` | Subagent spawn/completion: returns immediately, turn-boundary wake gate, held slots (DEC-036) |
| `REQ-AGX-007` | Isolation modes: in-process default; worktree and ACP as explicit per-spawn options (DEC-029) |
| `REQ-AGX-008` | Receipts not transcripts; untrusted, scanned, size-capped, at-most-once (DEC-036, DM-016) |
| `REQ-AGX-009` | Context control: pre-turn feasibility, checkpoint before compaction, no silent overflow (DEC-027) |
| `REQ-AGX-010` | Model-plane handoff: one router, one retry owner per failure class (DEC-034) |
| `REQ-AGX-011` | Meta-tool long-tail loading: static-description search + invoke with invoke-time tickets |
| `REQ-AGX-012` | ACP/CLI surface parity: same lifecycle, typed updates, cooperative cancel, projections only |
| `REQ-AGX-013` | Recovery and no-fabrication: bounded retries, crash resume, partial markers, verified completion |
