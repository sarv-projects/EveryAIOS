# ARCH/17 — The EveryAIOS Native Agent (frozen status lifted by ADR/0003)

> **PARTLY SUPERSEDED — read [`CORE.md`](CORE.md), [`AGENT.md`](AGENT.md) and [`EXTERNAL-AGENTS.md`](EXTERNAL-AGENTS.md) first.**
> The **frozen** status of this document is lifted by `ADR/0003`. Specifically superseded: §17.0 item 1
> (“EveryAIOS Native as Universal Chief & Swarm Harness — an orchestrator **owned by us** that handles
> … **reasoning**”) and every use of “Chief” as a *reasoning entity*. The correct model: an agent is a
> replaceable engine attached to a Session (a binding); EveryAIOS owns the environment; the built-in runtime is
> **one option among equals**, never privileged. **Still accurate and preserved:** the two-plane *ownership*
> insight (the agent’s plane belongs to the agent, the shared plane belongs to EveryAIOS), the
> capability-resolution policy (native-first, augmentation-second), and the tool/agent schema catalog in §17.12.
> **Split `P69.A26` (done 2026-09-20).**

---


> **Status:** Architecture contract, **frozen 2026-09-15 — status lifted by [`ADR/0003`](ADR/0003-architecture-thaw-core-authority.md)** (two-plane contract v3.75; native-plane rows **B10/B11/C14/C15/F16/I14–I17** in v3.76; Settings Control Center v3.77; Windows-first runtime/picker/cowork evidence contract v3.78). This file defines the **Native agent plane**, the **shared cowork plane**, the **capability-resolution policy**, and the **schema contract** for every native tool, shared façade, and agent type.
> **Ownership:** This is architecture, not delivery. Delivery status for every row lives in `../TODO.md` (phase **P64**). Capability *identity* stays in `../capabilities.yaml` + `09-FEATURE-MATRIX.md` + `../DESKTOP-APP-SPEC.md` §0. This file **adds no ids of its own** — but the native-plane capabilities it freezes are now first-class rows in those three surfaces (v3.76: **B10** · **B11** · **C14** · **C15** · **F16** · **I14** · **I15** · **I16** · **I17**), so the contract and this document cannot be read two ways. Everything else derives behavior, boundaries, and schemas for existing rows (B1–B9, C*, D*, E9, F*, G*, H*, I*, J*).
> **Non-negotiables carried from `00-INDEX.md`:** one effect-authorization model · one append-only event log · one Progress timeline · Work is the durable unit. ARCH/17 must not weaken any of them.

## Where this content moves (`P69.A26` — pending split)

- **Agent model** (binding, adapter, behavior profile, switching, control layers): [`AGENT.md`](AGENT.md).
- **Protocols and shared plane** (ACP lifecycle, MCP capability surface, `AgentBridge`, task-shaped façades,
  governance modes): [`EXTERNAL-AGENTS.md`](EXTERNAL-AGENTS.md).
- **Preserved here until the split lands:** the tool/agent schema catalog (§§17.4–17.6), the shared-plane
  façade list (§17.5), the prompt/context/routing schemas as implementation detail (§17.7 — policy in
  [`CONTEXT.md`](CONTEXT.md)), edge cases (§17.8), peer-schema provenance (§17.9), gap register (§17.10),
  and the Settings read models (§17.12).
- **Retired:** the "EveryAIOS-owned reasoning orchestrator" (§17.0 item 1, §17.3 closing line) — the built-in
  runtime is one unprivileged binding; turn coordination without reasoning is EveryAIOS's job (AGENT.md §2).

---

## 17.0 Scope, purpose, and the one rule

**Purpose.** EveryAIOS operates as the **Universal Agentic OS & Desktop Harness**:

1. **EveryAIOS Native as Universal Chief & Swarm Harness** — an orchestrator owned by us that handles multi-model routing, task DAG planning, Git worktree isolation (`worktrees.rs`), multi-run diff fusion, subagent supervision, and Guard-2 ticket enforcement. It does NOT compete with Claude Code, OpenAI Codex, or OpenCode by building a proprietary coding prompt/loop; it hosts and coordinates them. **⚠ SUPERSEDED (ADR/0003):** the “orchestrator owned by us that handles … reasoning” claim is lifted; EveryAIOS owns the environment and the built-in runtime is one unprivileged binding (CORE §7.1).
2. **External Specialist Agents** (Claude Code, OpenAI Codex, OpenCode, Grok Build, Cline/Roo, Aider …) — first-class coding runtimes that execute their own proven loops, tools, models, and authentication via ACP or stdio JSON-RPC.
3. **The Shared Cowork Plane** — native Office primitives (IronCalc 0.8.3, surgical OOXML), tiered browser engines, OS computer use, durable Work, four-class cognitive memory, and 7-layer Guard-2 security provided by EveryAIOS to any running agent.

**The one rule (hard invariant):**

> **Native Agent Plane belongs to the agent. Shared Cowork Plane belongs to EveryAIOS.**
> EveryAIOS augments *only* capabilities reachable through the integrated seam (CLI / ACP / MCP). It never attempts to build a second competing coding engine, never assumes access to capabilities inside a separate closed GUI, and never removes an external agent's native tools.

**Function-resolution policy (evaluated per function family, per turn):**

```
need function X
        │
        ├─ is X reachable through the selected agent's native suite?
        │        └─ YES → use the agent's native X
        │        └─ NO  → use EveryAIOS shared X
        │
        └─ BOTH available → resolution chooses by
                quality · cost · permission · latency · context budget
```

---

## 17.1 The two planes

```
                        EVERYAIOS DESKTOP
              ┌──────────────────┬───────────────────────┐
      EVERYAIOS NATIVE      EXTERNAL AGENT RUNTIMES
              │             (Codex CLI · Claude Code · OpenCode · Aider · Cline/Roo · Grok Build)
   ┌──────────┴──────────┐   ┌────────────┴────────────┐
   │ NATIVE AGENT PLANE  │   │ (their own native plane)│
   │ loop · planning     │   │ loop · tools · model    │
   │ routing · memory    │   │ permissions · sessions  │
   │ reasoning · context │   └─────────────────────────┘
   │ native tools        │
   │ sub-agents · skills │
   │ verification        │
   └──────────┬──────────┘
              │   both may use ↓
   ┌──────────▼──────────────────────────────────────────┐
   │              SHARED COWORK PLANE                    │
   │ office · browser · computer-use · connectors ·      │
   │ workspace/codeintel · artifacts · shared memory ·   │
   │ durable Work · scheduler · background runs ·        │
   │ recovery · guard · vault · budget · leases ·        │
   │ cross-agent delegation                              │
   └──────────┬──────────────────────────────────────────┘
              │
                       EXECUTION KERNEL (Rust)
     Guard → Permit (AuthorizationTicket | trusted gesture) → Execute
           → Observe → Verify → Record
     Vault · Workspace · Memory · Audit (Merkle) · Work Gateway
```

**Plane membership is fixed.** A capability is native if it defines what the agent *is*; it is shared if it is workplace infrastructure the agent *uses*.

> **Superseded in part (`P69.A26`):** the `✅ exclusive` rows below describe the pre-thaw model in which the
> built-in runtime owned reasoning, routing, planning, and orchestration. Under [`AGENT.md`](AGENT.md) the
> loop belongs to the bound agent and the built-in runtime is one unprivileged binding. Preserved: the
> plane-membership rule, the shared column, and the resolution policy.

| Capability | Native owns | External agent keeps | Shared borrows |
|---|---|---|---|
| Conversation loop, prompt assembly | ✅ | ✅ own | — |
| Planning / replanning | ✅ exclusive | (its own, if any) | — |
| Model routing | ✅ exclusive | ✅ own model/account | — |
| Memory **reasoning** (what to remember/forget) | ✅ exclusive | — | memory **APIs** |
| Sub-agent orchestration | ✅ exclusive | limited (own subagents) | — |
| Native coding / shell / edit | ✅ | ✅ own | — |
| Native web search / research | ✅ | ✅ own (if any) | research infra |
| Skills / verification / cost / recovery | ✅ | — | partial |
| Workspace map · CodeIntel | ✅ | — | ✅ |
| Office · Browser · Computer Use | uses | — | ✅ |
| Connectors · artifact store | uses | — | ✅ |
| Durable Work · scheduler · background runs | ✅ | — | ✅ |
| Guard · vault · budget · leases | ✅ | — | ✅ |
| Cross-agent delegation (hiring workers) | ✅ exclusive | — | ✅ |

---

## 17.2 Module ownership map (nothing is a mishmash)

Every module has exactly one plane, one owner, and one contract. New work must land in the owning module — not beside it.

| Module | Plane | Owns | Contract out |
|---|---|---|---|
| `packages/coordinator` | Built-in | Agent loop, prompt assembly, routing, tool dispatch, sub-agent orchestration, streaming, memory extraction | JSON-RPC over stdio (`everyaios-ipc`) · proposes only |
| `packages/core-agents` | Native | Shipped agent roster (9) + custom-agent repository (SQLite `agents`) | `AgentDefinition` |
| `packages/core-ai` · `core-engine` | Native | 12-segment assembler, conversation engine, hallucination/risk heuristics | prompt + turn events |
| `packages/core-tools` | Native | Permission gate inputs, Trust Ladder | gate inputs (Rust decides) |
| `packages/core-memory` | Native | Cognitive decay models, spreading activation, retrieval planning | memory requests (Rust persists) |
| `packages/core-providers` | Native | Provider/model surfaces (models.dev-fed) | provider identity only |
| `everyaios-engine` | Native | `gate.rs` (Alg #12), `risk.rs`, `plan.rs` (ToolFamily/RetrievalPlan/ToolPlan), `contract.rs` | pure policy; no I/O |
| `everyaios-core` | Native + kernel | `chat.rs` relay, `tools.rs` **ToolRegistry**, `execution.rs`, `work_gateway.rs`, `terminal.rs`, `git_commit.rs`, `worktree_cap.rs`, `memory_service.rs` | `tool/list`, `tool/exec`, `tool/commit`, Work RPC |
| `everyaios-blueprint` | Native | Sub-agent runtime, surgical routing, checkpoints, change sets, learn/distill/crystallize, SkillStore | `SubAgentSpec`/`SubAgentResult`, skills |
| `everyaios-codeintel` | Native | LSP client, repomap (PageRank), SCIP graph | symbols/references/diagnostics, repo map |
| `everyaios-memory` | Shared | ACT-R, FTS5/BM25, graph, fusion, FSRS, compaction | `memory/*` |
| `everyaios-mcp` | **Shared** | The inbuilt capability catalog (browser/office/memory/search/storage), profiles, external attach | MCP tool surface |
| `everyaios-browser` · `everyaios-cdp` | Shared | CDP session, a11y/DOM snapshot, input synthesis, capture | `browser.*` |
| `everyaios-office` | Shared | OOXML surgical patching, IronCalc recalc, PDF | `office.*` |
| `everyaios-desktop` | Shared | OS computer use (Win/Linux/macOS), OCR/vision, verify | `desktop.*` |
| `everyaios-acp` | Shared | ACP framing, agent registry/install, **agent backend matrix**, chief adapter | `acp/*` |
| `everyaios-search` | Shared | G8 cascade, SearXNG space, deep research | `search.*` |
| `everyaios-script` | Shared | rquickjs sandbox (heap/stack/timeout/payload caps) — backs `forge.run_js` / `run_code`, **not** `script.run`, which is a shell command on the PTY plane | — |
| `everyaios-storage` | Shared | Walk, dedup, treemap, FTS5, USN | `storage.*` |
| `everyaios-guard` | Kernel | Guard-1 prescan, netfloor, pathfloor, protected paths, TOCTOU, egress floor, tickets | verdicts only |
| `everyaios-vault` | Kernel | SQLCipher keyrings, OAuth, broker, `reveal_for_spawn` | opaque handles |
| `everyaios-audit` | Kernel | NDJSON Merkle chain, receipts, repair | append + verify |
| `everyaios-ipc` | Kernel | Length-prefixed framing (`[u32 LE][JSON]`) | transport |
| `everyaios-catalog` | Shared | models.dev 4h sync + aliases | provider catalog |
| `src-tauri/*` | Shell | Tauri commands, window provenance, state | IPC to UI |
| `ui/src/*` | Client | Cockpit, composer, pickers, approvals (`guard.html`) | IPC calls only |

**Rule:** a capability that appears in two modules (e.g. `create_docx` as an engine family tool **and** an MCP office tool) is **one Rust implementation with two thin façades**, never two implementations.

---

## 17.3 The built-in control loop (section title historically “The Chief” — the loop belongs to the bound agent; the built-in runtime is one unprivileged binding)

**Phases** (each is durable on the Work Gateway, none is a tool call):

```
understand → workspace preflight → plan → choose strategy
   → [call native tool | call shared capability | delegate to sub-agent]
   → observe → verify → (continue | replan | recover | finish)
```

| Phase | Input | Output | Edge cases that must be handled |
|---|---|---|---|
| understand | user turn + context | intent + risk class | ambiguous goal → `ask`; irreversible → `plan` first |
| preflight | workspace refs | mounted tool families, memory scope, budget | empty workspace; unindexed repo; locked vault |
| plan | intent | ordered steps + acceptance | no plan for trivial turns (avoid ceremony) |
| strategy | plan + routing table | model + tools + isolation | no connected provider → fail closed with actionable sentence |
| act | one step | tool call / delegation | Guard `ask` → wait, never auto-consume the ticket |
| observe | result | sanitized observation | oversized output → ref-handle + preview (50 KB cap) |
| verify | step + evidence | pass/fail + receipt | unverifiable → `has_gap` honesty, never invented success |
| replan | failure | revised plan | loop guard: same tool+args hash ×3 in 8 → break |
| recover | crash/interrupt | resumed Work | resume from checkpoint; never replay a committed effect |
| finish | verified steps | Work receipt | partial work is surfaced as partial |

**⚠ SUPERSEDED (ADR/0003 / `P69.A26`):** under [`AGENT.md`](AGENT.md), reasoning, routing, planning,
and orchestration belong to the bound agent; EveryAIOS owns turn coordination (load state, project
context/capabilities, emit events, drive recovery), not reasoning. The phase table above remains useful as
the shape of a turn, not as an ownership claim.

---

## 17.4 Native tool schema contract

**Single source of truth:** `everyaios_core::tools::ToolRegistry` (built in `crates/everyaios-core/src/tools.rs`). The coordinator never defines a second catalog; it serializes `tool/list`.

### 17.4.1 `RegisteredTool` — the wire shape

```jsonc
{
  "id": "file_ops.write",              // stable id (prompt-cache key)
  "family": "fileops",                 // browser|storage|script|fileops|search|office|desktop|external|connector
  "description": "Write a UTF-8 file inside the workspace floor (atomic rename)",
  "readOnly": false,
  "operation": "write",                // guard operation class
  "risk": "medium",                    // low|medium|high|critical
  "riskTier": "R2",                    // RiskTier::from_risk_and_op(risk, operation, readOnly)
  "argsSchema": { "type": "object", "properties": { … }, "required": [ … ], "additionalProperties": false }
}
```

**Catalog invariants**
- `argsSchema` is JSON Schema emitted by Rust; the coordinator wraps it as an OpenAI function def (`listedToolsToOpenAI`). **Never** re-declare a tool schema in TypeScript.
- Tool ids are stable and sorted (`sortToolsStable`) so the tools body is byte-stable for prompt cache.
- At most **20** tools are mounted per turn (`MAX_ACTIVE_TOOLS`); selection is deterministic (`resolveActiveTools`).
- **Loop-pinned tools are mounted on every turn** (`LOOP_PINNED_TOOL_IDS`): the four first-class tools (`ask`/`plan`/`todo`/`subagent`) plus `script.run`, `file_ops.read`/`list`/`write`/`edit`, `search.query`. Scoring fills only the *remaining* slots (id match ⇒ +40/−20, description ⇒ +8, family hints ⇒ +6).
  - *Why:* the catalog (~70 ids) always exceeds the cap, so a purely scored subset silently decided which capabilities the agent *had*. Measured 2026-09-17: `script.run` scored only when the user's text contained `script`/`js`/`eval`, so an ordinary request (“fix the failing test”) mounted no shell at all — executor, Guard-2 path and PTY host all correct, agent still had no terminal. Priority order is `previouslyUsed` (the model is mid-loop on it; losing it mid-turn breaks the loop it was selected for) ⇒ pinned ⇒ scored. Pinning never invents a tool: an unregistered id is absent.
- A tool with no handler is a **bug**, not a placeholder.
- External MCP tools are registered as `family: external` with the server label in the description and **never shadow** a native id.

### 17.4.2 Native catalog (exact, from the registry)

**File operations** (`family: fileops`) — every path is path-floored.

| id | readOnly | operation | risk | schema |
|---|---|---|---|---|
| `file_ops.read` | true | write | low | `{ path }` |
| `file_ops.list` | true | write | low | `{ path }` |
| `file_ops.write` | false | write | medium | `{ path, content }` |
| `file_ops.delete` | false | delete | high | `{ path }` |

**Shell execution** (`family: script`) — v3.80: `code` is a **shell command line**, not JavaScript, and it runs on the one PTY plane (§4.5 of the product spec) on the automation profile with `Agent` provenance.

| id | readOnly | operation | risk | schema |
|---|---|---|---|---|
| `script.run` | false | terminal_shell | high | `{ code }` — shell command line |

The id is historical. The rquickjs `everyaios-script` sandbox is unchanged and still backs `forge.run_js` and the automation runtime's `run_code` steps — internal deterministic workflows, not agent shell calls.

**Observing the plane (read-only).** The coordinator reads the plane's *state* — never a second way to cause a shell effect — over the relay's `terminal/*` arm, served from `everyaios_core::terminal::TerminalPlaneObserver` (the same row builders the Shell view reads, so the two façades cannot drift):

| method | params | returns |
|---|---|---|
| `terminal/status` | `{}` | `{ attached, count, ptys[] }` — `attached: false` on a host with no PTY host |
| `terminal/commands` | `{ ptyId, limit? }` | `{ ptyId, cwd, count, commands[] }` (rows carry `trusted`) |
| `terminal/last_command` | `{ ptyId, maxChars? }` | `{ ptyId, block \| null }` — `null` is absent evidence, not an empty success |
| `terminal/history` | `{ ptyId, limit?, maxChars? }` | `{ ptyId, block \| null }` |

There is deliberately **no run method on this arm**: a privileged effect stays the ticketed `script.run` tool (`tool/exec` → `tool/commit` → Guard-2), so an observer can never become a second, unticketed executor. A per-session read on a host with no plane is refused; `terminal/status` is not, because "no shell here" is a fact rather than an error.

**Search** (`family: search`)

| id | readOnly | operation | risk | schema |
|---|---|---|---|---|
| `search.query` | true | external_network | medium | `{ query }` |
| `search_web` | true | external_network | medium | `{ query }` (MCP-derived) |
| `deep_research` | true | external_network | medium | `{ sources, query }` (MCP-derived) |

**Office** (`family: office`) — the native registry exposes per-format ids (`office.docx_open` …); the MCP catalog exposes the coarse façade (`office_open` · `office_edit` · `office_undo` · `office_export`). **One implementation, two façades** — same Guard, same audit.

| id | readOnly | risk | schema |
|---|---|---|---|
| `office.docx_open` | true | low | `{ path }` |
| `office.docx_patch` | false | medium | `{ path, address, text }` — block address e.g. `p1`, byte-preserving `w:t` write |
| `office.xlsx_open` | true | low | `{ path }` — windowed calamine read of the first sheet |
| `office.xlsx_edit` | false | medium | `{ path, address, value, sheet? }` — IronCalc + surgical part-patch |
| `office.pptx_open` | true | low | `{ path }` — deck outline + per-slide text |
| `office.pptx_patch` | false | medium | `{ path, text, part?, shape? }` — byte-preserving `a:t` write |
| `office.pdf_open` | true | low | `{ path }` — page count + extracted text |
| `office.pdf_form_fill` | false | medium | `{ path, fields }` — AcroForm fill |
| `office.pdf_redact` | false | high | `{ path, page, x1?, y1?, x2?, y2? }` — mark a rectangle |
| `office.pdf_pages` | false | medium | `{ path, op, pages?, delta?, other?, out? }` — split/merge/rotate/reorder/delete/extract |

**Desktop computer use** (`family: desktop`)

| id | readOnly | operation | risk | schema |
|---|---|---|---|---|
| `desktop.windows` | true | write | low | `{}` |
| `desktop.read` | true | write | low | `{ windowId }` |
| `desktop.act` | false | web_action | high | `{ kind, windowId?, target?, text? }` |

**Connector writes** (`family: connector`) — ride the automation `ConnectorEngine`, always ticketed.

| id | readOnly | operation | risk | schema |
|---|---|---|---|---|
| `connector.email_send` | false | web_action | high | `{ to[], subject, body? }` |
| `connector.calendar_create` | false | web_action | high | `{ title, when }` |

**Browser** (`family: browser`, MCP-derived, 37 ids) — canonical: `snapshot`, `enhanced_snapshot`, `read`, `text`, `grep`, `click`, `type`, `navigate`, `go_back`, `go_forward`, `scroll`, `hover`, `select_option`, `press_key`, `wait`, `download`, `upload`, `screenshot`, `pdf`, `windows`, `tabs`, `tab_groups`, `evaluate`, `run`, bookmarks ×6, … Each carries `readOnly` + MCP `readOnlyHint`/`openWorldHint`; aliased `browser.<id>`.

**Storage** (`family: storage`, MCP-derived, 5 ids) — aliased `storage.<id>`.

**Memory** (MCP-derived) — `memory_retrieve`, `memory_store`, `memory_review_due`.

**External** (`family: external`) — dynamic per attached MCP server; `open_world` ⇒ `operation: external_network / risk: medium`, read-only ⇒ `write / low`, else `web_action / high`. External ids never shadow a native id.

**Inbuilt MCP catalog total: 51** — browser **37** · office **4** · memory **3** · search **2** · storage **5** (`everyaios_mcp::all_tools()`, grouped by `inbuilt_catalog()`, paginated per `ToolProfile`). Counts are stated once here; derive them from the crate in code and tests rather than repeating a magic number.

### 17.4.3 Coordinator-side first-class tools (`packages/coordinator/src/tools.ts`)

These are the **model's own control tools**. Implemented in `packages/coordinator/src/tools.ts` (`FIRST_CLASS_NATIVE_TOOLS`) and merged into every active turn via `mergeWithNativeTools()` in `packages/coordinator/src/chat.ts`.

| id | family | readOnly | operation | risk | schema |
|---|---|---|---|---|---|
| `ask` | human | true | ask | R0 | `{ question, options?, isMultiSelect?, reason? }` |
| `plan` | human | true | plan | R0 | `{ goal, steps[] }` |
| `subagent` | orchestration | false | spawn | R1 | `{ objective, isolation?, scope?, role? }` |
| `todo` | orchestration | false | todo | R0 | `{ items[] }` |

**Contracts & Execution Pipeline**
- `ask` and `plan` are read-only and **wait for the human**; execution suspends until approved.
- `subagent.isolation ∈ {worktree, sandbox, none}`; `scope` is the file/folder allow-list. Spawned subagents receive isolated task worktrees under `.everyaios/worktrees/task-<id>` with the standardized 3-file blackboard protocol (`task_plan.md`, `findings.md`, `receipts/<id>.json`).
- `todo` renders the visible interactive checklist; checked items persist in turn trajectory.
- **Dynamic Context Resolution**: User `@-mentions` (`@Codebase`, `@Docs`, `@URL`, `@file`) are dynamically resolved in `packages/coordinator/src/chat.ts` via `resolveMentions()` and injected as structured context provider blocks strictly below the byte-stable `CACHE_BOUNDARY`.
- **Worktree Undo & Restore**: `crates/everyaios-core/src/worktrees.rs` provides `undo_worktree` and `restore_branch` for single-step worktree rollback without impacting the primary repository.
- **Cognitive Failure Avoidance**: Failed tool calls capture negative constraints in `crates/everyaios-memory/src/avoid.rs` (`AvoidanceStore`), filtering negative rules into subsequent turns to prevent repetitive error loops.
- **OS Sandboxing**: `crates/everyaios-guard/src/sandbox.rs` enforces Windows Job Objects / Restricted Tokens, macOS Seatbelt, and Linux bubblewrap process containment.

---

## 17.5 Shared-plane façade schemas (what external agents see)

External agents must never receive 51 raw primitives. They receive **task-shaped façades** over the same Rust implementations.

| Facade | Fans out to | readOnly | risk |
|---|---|---|---|
| `office.open` | `office.*_open` | true | low |
| `office.inspect` | open + `office.pdf_pages` / sheet read | true | low |
| `office.edit` | `office.*_patch` / `_edit` | false | medium |
| `office.calculate` | IronCalc recalc path | false | medium |
| `office.render` | PDF/export path | false | medium |
| `office.verify` | conformance oracle | true | low |
| `browser.research` | `search_web` + `read` + `deep_research` | true | medium |
| `browser.operate` | `snapshot` + `click`/`type`/`navigate`/`wait` | false | high |
| `browser.extract` | `read`/`grep`/`pdf`/`screenshot` | true | low |
| `computer_use.see` | `desktop.windows` + `desktop.read` | true | low |
| `computer_use.act` | `desktop.act` | false | high |
| `workspace.map` | repomap + codeintel | true | low |
| `artifact.*` | storage + ref registry | mixed | low |
| `work.*` | Work Gateway | mixed | low–high |

**Rule:** façade implementations call the same service, the same Guard, and the same audit path as native tools — never a parallel path.

---

## 17.6 Agent schemas

### 17.6.1 Shipped inbuilt roster (`packages/core-agents/src/registry.ts`)

```ts
type AgentDefinition = {
  id: string; name: string; icon: string; instructions: string;
  toolIds: string[]; maxRisk: 'read'|'local-write'|'external-write'|'destructive';
  webAccess: boolean; memoryScope: 'none'|'project'|'full';
  preferredModel: string[]; maxToolCallsPerTurn: number;
}
```

| id | name | maxRisk | web | memoryScope | maxToolCalls |
|---|---|---|---|---|---|
| `general` | General Assistant | local-write | ✅ | full | 8 |
| `research` | Research Agent | read | ✅ | project | 12 |
| `reader` | Reader Agent | local-write | ✗ | none | 6 |
| `creator` | Creator Agent | local-write | ✅ | project | 10 |
| `writer` | Writer Agent | local-write | ✗ | project | 8 |
| `planner` | Planner Agent | local-write | ✗ | project | 10 |
| `code` | Code Agent | local-write | ✅ | project | 10 |
| `docmaker` | DocMaker | local-write | ✗ | project | 8 |
| `summarizer` | Summarizer | read | ✗ | project | 6 |

Custom agents persist to the SQLite `agents` table (`id, name, icon, instructions_md, tools_json, permissions_json, memory_scope, model_policy_json, enabled`) and survive restarts; shipped agents are never written to DB.

### 17.6.2 Bundle registry (`everyaios-agents`)

`~/.everyaios/agents/<id>/agent.toml` — one directory per agent so scoped assets (skills, helpers) live beside it. Operations: list · load · save · duplicate · disable · export · remove. Ids are `slug(name)` (≤48 chars, `[a-z0-9-_]`).

### 17.6.3 Specialist sub-agent roster (to formalize)

| Specialist | Plane | Tools it may hold | Default deny |
|---|---|---|---|
| Scout | Native | read/search/research only (structurally read-only, managed cache) | all writes |
| Architect | Native | plan/read/codeintel | all writes |
| Coder | Native | read/edit/exec/test | delegate, memory, cronjob |
| Scalpel | Native | single-file edit + test command, bounded attempts | everything else |
| Researcher | Native | web + artifacts | all writes |
| Browser Operator | Shared | `browser.*` | filesystem writes |
| Office Specialist | Shared | `office.*` | network |
| Reviewer | Native | read + judge | all writes |
| Security Auditor | Native | read + guard probes | all writes |
| External Worker | Adapter | ACP session only | ecosystem control |

### 17.6.4 Sub-agent orchestration contract (`everyaios-blueprint/src/subagent.rs`, `everyaios-core/src/worktrees.rs`)

```jsonc
// SubAgentSpec
{ "spec": TaskSpec, "model": "string", "workspace": "string",
  "parentId": "string|null", "tools": ["..."], "blockedTools": ["..."], "depth": 0 }
```

- `DELEGATE_BLOCKED_TOOLS = [delegate, clarify, memory, send_message, cronjob]` — inherited **denies**, never escalated grants; `delegate` first ⇒ no recursion.
- `DEFAULT_DENY_TASK_TOOLS = [task, todo]` — a child may not mutate the plan ledger unless explicitly granted.
- `SubAgentLimits { max_depth: 2, max_concurrent: 3, max_total: 6 }`.
- Starting prompt = the spec only (fresh context); parent transcript is never handed down.
- Return = `SubAgentResult { task_id, summary, status, artifacts }` — **summary-only by construction** (no transcript field exists).
- Messaging kinds: `peer_review | cross_check | request_sub_routine | handoff`, endpoint-validated.
- Termination: `GoalMet | Timeout | MaxTurns | Aborted | Error`, each recorded on the audit timeline.

#### Multi-Agent Swarm Fleet Isolation & Blackboards
- **Worktree Isolation (`everyaios-core::worktrees`):** Parallel subagents execute inside isolated Git worktrees under `.everyaios/worktrees/task-<id>`, enforced by `WorktreeManager` with disk capacity validation (`WorktreeCap`, default 500MB headroom).
- **Git Lock Serialization (`everyaios-core::git_queue`):** `GitOperationQueue` enforces write Mutex locking to prevent `.git/index.lock` collisions across concurrent subagents; automatically purges stale index locks older than 5s. Reads remain non-blocking.
- **3-File Blackboard Protocol:** Subagents synchronize state without polluting parent context via three dedicated files in the worktree:
  1. `task_plan.md`: subagent objective, assigned file boundaries, phase milestones, and progress status.
  2. `findings.md`: discovered codebase insights, schemas, and shared dependencies.
  3. `receipts/<id>.json`: effect and audit receipts.
- **Dynamic Resource Governor (`everyaios-core::governor`):** `ConcurrencyGovernor` dynamically sizes active worker capacity based on host CPU cores (1 worker per 2 physical cores, clamped [1, 32]) and available RAM (2GB headroom per worker); surplus tasks queue until capacity is released.
- **Cognitive Failure Avoidance (`everyaios-memory::avoid`):** `AvoidanceStore` captures failed tool executions, error classifications, root causes, and explicit negative constraints ("do NOT attempt X when Y") to prevent repetitive error cycles.

---

## 17.7 Prompt, context, and routing schemas

> Policy lives in [`CONTEXT.md`](CONTEXT.md) and the agent model in [`AGENT.md`](AGENT.md); the
> segment/routing facts below are preserved implementation detail (assembler serializes, selector decides).

**12-segment assembler** (`packages/coordinator/src/prompt.ts`), hard `CACHE_BOUNDARY`:

```
1–7  above boundary (byte-identical across turns)
     SOUL.md identity (injection-scanned before insertion) · shipped instructions
     · persona tone · style memory · tool definitions
─── CACHE_BOUNDARY ───
8    <memory_warm_set>   (Rust memory/plan retrieval)
9    <tool_index>        (names only — the compact catalog)
10   <untrusted>         (web/RAG; data-only boundaries)
11   <user_document>     (angle-sanitised: < → ‹, > → ›)
12   <user>              (current turn)
```

**Invariants:** segments 1–7 byte-identical; tools sorted + capped; `assertAllLogged()` fails the turn closed (`context_not_logged`) if any model-visible block is absent from `ContextTrace`; tool output capped at 50 KB (`MAX_TOOL_OUTPUT_CHARS = 51200`) with query refinement hints and line count metrics, with a ref-handle + preview.
- `SINGLE_MATCH_EDIT_INVARIANT`: strict single-occurrence match requirement before applying file replacements, preventing corrupted edits.
- `CONTEXT_MODE_SUMMARY_INVARIANT`: 98% context reduction discipline summarizing raw tool outputs before LLM ingestion.

**Routing:** task class → model role → provider/model, choosing among `reasoning | coding | cheap | research | vision | local`. Resolution loops **only over connected or keyless providers**; disconnected providers render as honest UI rows. Failover is **429-only** with key affinity; a 5xx retries the same key. Unsupported transports fail closed.

**Memory composition order:** retrieval/fusion selects candidates → ACT-R/temporal/graph rank → scope/budget gate injection → compaction applies to the assembled context. FSRS schedules review separately and never changes immediate retrieval truth.

---

## 17.8 Two-plane edge cases (must be handled, not discovered)

| # | Case | Required behavior |
|---|---|---|
| 1 | Both native and shared provide X | Resolution chooses by policy; never inject both full schemas for the same family without distinguishing ids |
| 2 | External agent exposes X but GUI-only | Not reachable ⇒ use shared X. Never claim parity with a product surface we cannot call |
| 3 | No connected provider for the routed model | Fail closed with an actionable sentence; do not silently fall back to a disconnected provider |
| 4 | Guard returns `ask` mid-step | Turn parks; the ticket is single-use and bound to the exact args hash; never auto-consumed |
| 5 | Sub-agent hits depth/concurrency/total cap | Reject with the specific error; do not queue silently |
| 6 | Sub-agent tries to delegate | Blocked by `DELEGATE_BLOCKED_TOOLS` (no recursion) |
| 7 | Duplicate tool+args ×3 in 8 calls | Loop guard trips; replan or stop |
| 8 | Tool output > 50 KB | Store to ref registry; inject preview + hash pointer |
| 9 | Vault locked / key cleared mid-session | Endpoint resolution reconciles **both ways**; provider retires when its last key goes |
| 10 | Vite/sidecar crash mid-Work | Resume from Work Gateway checkpoint; never replay a committed effect |
| 11 | Skill candidate from a successful run | Must pass validation (manifest + tests) before it becomes executable |
| 12 | External agent spawn with credential | Vault key injected at spawn only (`reveal_for_spawn`), never written to the agent's own config file |
| 13 | Attached MCP server no longer reachable | Child killed on detach/refresh (no orphan); tools retired from the live catalog |
| 14 | Two façades over one implementation | Both dispatch to the same service + Guard + audit; no competing reality |
| 15 | Repo map larger than context budget | Rank + truncate deterministically; never drop the boundary byte-stability |

---

## 17.9 Peer-schema provenance (steady steal ledger)

| Source | What we adopt | What we do **not** copy |
|---|---|---|
| **Claude Code** (`code.claude.com/docs/en/tools-reference`) | Single-occurrence exact edit invariant; compact native tool philosophy; explicit permission modes; session resume; isolated subagents | Its coding-only scope; replacing our loop with theirs |
| **Codex CLI** (`learn.chatgpt.com/docs/app-server`) | app-server JSON-RPC seam for supervision; `apply_patch` patch format; sandbox/approval modes; thread/turn/resume semantics | Its GUI-only surfaces (browser/computer-use) — not reachable through the CLI seam |
| **Cline / Roo** (`docs.cline.bot/tools-reference/all-cline-tools`) | Order-invariant fuzzy multi-hunk patch fallback; plan/act tool partitioning; shadow-VCS checkpoints | Its static prompt catalog and VS Code coupling |
| **Aider** (`aider.chat/docs/more/edit-formats.html`) | Edit-format ladder (`diff` · `diff-fenced` · `udiff` · `whole` · `editor-*`); tree-sitter + PageRank repo map | Forcing every task through architect/editor |
| **SWE-agent** (arXiv 2405.15793) | Bounded-window ACI (fixed line windows with line numbers as edit targets) | Its narrow SWE-only interaction model |
| **Hermes** | Pre-insertion persona scan; `skills_save`-style procedural retention | Unvalidated executable skill generation |
| **OpenCode** | `models.dev`-fed provider surface; `task` sub-agent pattern | Assuming its provider list is authoritative |
| **Goose / OpenHands / Operator** | Extension boundary; typed Action→Observation; screenshot→ground → act → verify loop | Cloud/Docker-only execution assumptions |

Provenance rule: adopt **patterns and schemas**, never vendor product behavior we cannot observe at runtime. Every claim in this table is verified against the cited public doc, not inferred.

---

## 17.10 Gap register (→ TODO P64)

| # | Gap | Owning module | Gate |
|---|---|---|---|
| 1 | `mergeFirstClassTools()` never called in the turn | `packages/coordinator` | tool-call tests + cache stability |
| 2 | `resolveMentions()` uncalled; no live `@Codebase` | `packages/coordinator` | mention resolution tests |
| 3 | Repo map never injected | `packages/coordinator` + `everyaios-codeintel` | segments 1–7 byte-stable |
| 4 | `subagent` unreachable; no execution side bound to `SubAgentRuntime` | `packages/coordinator` + `everyaios-blueprint` | parent context grows by the diff only |
| 5 | No unified native edit engine | `everyaios-core` | exact-match fail-closed tests |
| 6 | No risk-gated shadow preflight | `everyaios-engine` + `everyaios-codeintel` | restore-to-any-step on a real repo |
| 7 | No checkpoint per mutating call + rollback UX | `everyaios-blueprint` + `ui` | rollback works end-to-end |
| 8 | Skill distillation primitives never triggered | `everyaios-blueprint` | a learned skill measurably helps a repeat task |
| 9 | Shared-plane façades absent for external agents | `everyaios-mcp` | external agent uses one façade, not raw tools |
| 10 | Windows/macOS process sandbox backends missing (P49.5) | `everyaios-guard` | platform sandbox probes |

---

## 17.11 Verification gates for this document

1. `node scripts/check-doc-sync.mjs` — `capabilities.yaml` == `ARCH/09` == spec §0 (**166** ids, incl. the nine native-plane rows); TODO census matches header; shell version matches changelog.
2. `crates` workspace tests + `src-tauri` tests green.
3. Coordinator + UI suites green; `tsc` clean.
4. No new tool id without a handler (registry test), no second TypeScript tool schema (grep gate), no duplicate implementation behind two façades.
5. Every specialist in §17.6.3 that becomes callable must have its per-child tool grants derived via `derive_child_permissions`.

---

## 17.12 Settings Control Center — shared configuration surface

Settings is a **composition surface over authoritative subsystems**, not a new runtime. It is the user-facing control center for the two-plane architecture and adopts the useful Cline Desktop patterns (searchable inventory, configured/popular/all grouping, detail pane, explicit readiness, installed-versus-marketplace separation, and backend-authoritative persistence) without copying Cline's registries or native runtime.

### 17.12.1 Ownership map

| Settings area | Authoritative subsystem | Native/external rule |
|---|---|---|
| Providers | `everyaios-catalog`, `everyaios-vault`, provider resolver | Native owns its model surface. External agents own their native model/account surface; P63 only injects a verified provider environment at spawn. |
| Agents | `everyaios-acp`, agent registry, `ARCH/17` plane resolver | Native and external native capabilities remain separate; shared grants are explicit and scoped. |
| Channels/connectors | `everyaios-mcp`, vault OAuth, F1–F7/F13–F15 | Tokens remain in the vault; attached tools are live only after handshake/health. |
| Schedules | `everyaios-core::scheduler_service`, B7, Work Gateway | A schedule creates a normal Work/Run with a frozen manifest; settings cannot mutate an in-flight run. |
| Installed extensions | `everyaios-blueprint` skill/plugin registry, `everyaios-guard` granter, F8 managed resources | Signed manifest, capability preview, Guard-2, sandbox/grant, lazy activation, health. |
| Marketplace | signed discovery indexes | Discovery never implies installed, enabled, trusted, or occupied. |

### 17.12.2 Canonical read models

```ts
type SettingsReadModel = {
  id: string; kind: 'provider'|'agent'|'connection'|'schedule'|'extension';
  state: 'discovered'|'installed'|'configured'|'connected'|'disconnected'|'degraded'|'disabled'|'unavailable';
  health: 'ready'|'permission_required'|'missing'|'failed'|'unknown';
  lastError?: string; configHash: string; appliedLive: boolean; restartRequired: boolean;
};

type AgentSettings = {
  agentId: string; installed: boolean; protocol: 'inbuilt'|'acp'|'mcp';
  authMode: 'subscription'|'api_key'|'local_cli'|'keyless'|'unknown';
  nativeCapabilities: string[]; sharedCapabilities: string[];
  modelOwner: 'native'|'agent'|'managed';
  backendBinding?: { providerId: string; injectedEnvNames: string[]; unexpressed: string[]; writesToAgentConfig: false };
  configOptions: Array<{ id: string; name: string; value?: string; options?: string[] }>;
  readiness: 'ready'|'sign_in_required'|'api_key_required'|'local_cli'|'not_installed'|'unavailable'|'health_failed';
};

type ConnectionRecord = {
  id: string; kind: 'remote_mcp'|'oauth_connector'|'native_adapter'|'message_channel';
  transport: 'stdio'|'http'|'oauth'|'api_key'|'browser_session'; scopes: string[];
  enabledConsumers: string[]; state: 'discovered'|'installed'|'connected'|'disconnected'|'degraded'|'revoked';
  health: string; authRef?: string; configHash: string;
};

type ScheduleSettings = {
  id: string; name: string; trigger: 'cron'|'interval'|'event'|'webhook'; target: string;
  chiefAgentId: string; capabilityScope: string[]; autonomy: string; budget: string;
  networkPolicy: string; timezone: string; enabled: boolean; configHash: string;
  nextRunAt?: number; lastRunAt?: number; runs: number;
  state: 'idle'|'running'|'paused'|'failed'|'disabled';
};
// `name` and `runs` are display-only and were added to match the owning
// scheduler job: the Settings surface must not render an opaque id where the
// Automations center shows a name, and the run counter is already on the wire
// from the same `Job`. `id` remains the durable identity. As with
// RuntimeLocation (§17.12.4) and the loadout (§17.12.5), this block is the
// baseline the implementation extends — not a ceiling.

type InstalledExtension = {
  id: string; kind: 'skill'|'plugin'|'mcp'|'acp'|'hook'|'tool'; version: string;
  abiVersion?: number; provenance: string; digest: string; signatureStatus: string;
  capabilitiesRequested: string[]; capabilitiesGranted: string[]; boundAgents: string[];
  activation: 'lazy'|'active'|'disabled'; health: string;
};
```

### 17.12.3 Mutation protocol and failure rules

All Settings writes follow one protocol: `request → Rust validate → Guard/policy → atomic persist → live apply → reread`. The response is `{ appliedLive, restartRequired, state, health, lastError? }`; optimistic UI state is discarded when the authoritative reread disagrees. Provider keys and OAuth tokens use references only. Provider verification is metadata-only by default. Schedule changes affect future Runs only. Extension installation validates signature/manifest before any file is written, grants only the intersection of manifest and host capabilities, and disables before removal.

No settings control may:

- copy subscription credentials;
- rewrite an external agent's native config unless the P47.7/P63.8 effect funnel is live;
- treat a catalog entry as installed or an installed entry as healthy;
- expose raw vault secrets to the UI, sidecar, model, or external agent;
- bypass the one Guard, one Work event log, one scheduler, one vault, or one registry.

### 17.12.4 Windows-first paths and occupancy

The first desktop release is Windows. `AgentSettings.location` is a discriminated value, not a display string:

```ts
type RuntimeLocation =
  | { kind: 'managed'; executable: string; installRoot: string; version: string }
  | { kind: 'windows_path'|'windows_registry'|'user_path'; executable: string; source: string }
  | { kind: 'package_manager'; manager: 'npx'|'uvx'; package: string; version?: string }
  | { kind: 'wsl'; distro: string; linuxPath: string; windowsLauncher: string }
  | { kind: 'unavailable'; reason: string };
```

The ACP registry is a catalog. Occupancy is proven by an install record, a resolved Windows executable, a package-manager probe, an explicit user path, or a WSL probe. The shell must return provenance, exact path, version only when measured, and `verifiedAt`; it must not conflate `%APPDATA%`, `%LOCALAPPDATA%`, `%PROGRAMDATA%`, `%ProgramFiles%`, effective `PATH`, and WSL roots. Discovery is read-only (`acp_install_status` probes system PATH, App Paths registry, and WSL in parallel). Discovered harnesses are marked 🟢 *Auto-Detected & Ready* without redundant setup. Installation is a separate guarded action mediated via Guard-2 install tickets (`acp_install_request` → `acp_install_commit`). A WSL path is launched only through the named distro/backend and never handed to `CreateProcess` as if it were a Windows executable.

### 17.12.5 Agent picker and shared capability loadout

The chat picker is a compact selection control; its expanded state is a two-pane/full-screen Agent Settings surface. The left pane is the installed/discovered runtime inventory. The right pane is selected-agent truth: native model/auth/config options and native capabilities first, then explicitly available EveryAIOS shared capabilities. `modelOwner` is authoritative: `native` for EveryAIOS, `agent` for external ACP, `managed` only for a verified launch-time binding. Selecting a model from EveryAIOS's catalog while an external agent is active is forbidden.

Session capability controls are a loadout, not a tool dump. Each row has `capabilityId`, `source`, `nativeOrShared`, `enabled`, `health`, `scope`, `requiresApproval`, and `appliesFrom`. Defaults come from live install/health/policy state; changes apply to the next turn/run and are frozen into the Work manifest. The Chief resolves native capability first, then a shared façade, and records the choice. MCP/skills/plugins/connectors remain globally installed resources but are session-selectable consumers.

### 17.12.6 Evidence gates

Office must pass real DOCX/XLSX/PPTX/PDF read/edit/recalc/render/rollback tests on Windows, including the LibreOffice oracle where available. Browser must pass a real Chrome/CDP snapshot/action/verify/recovery run. Computer Use must pass Windows UI Automation semantic actions and guarded screenshot/coordinate fallback with foreground/background truth. Memory must pass restart hydration, scope isolation, conflict/forgetting, and retrieval-budget tests. MCP/skills/plugins must pass signed install, capability grant, disable/remove, restart, and live-tool reconciliation. Until then each settings row is `unverified` or `available`, never `ready`.
