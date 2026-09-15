# ARCH/17 — The EveryAIOS Native Agent (frozen)

> **Status:** Architecture contract, frozen 2026-09-15 (spec v3.75; the nine native-plane capability rows **B10/B11/C14/C15/F16/I14–I17** became first-class in spec v3.76, same day). This file defines the **Native agent plane**, the **shared cowork plane**, the **capability-resolution policy**, and the **schema contract** for every native tool, shared façade, and agent type.
> **Ownership:** This is architecture, not delivery. Delivery status for every row lives in `../TODO.md` (phase **P64**). Capability *identity* stays in `../capabilities.yaml` + `09-FEATURE-MATRIX.md` + `../DESKTOP-APP-SPEC.md` §0. This file **adds no ids of its own** — but the native-plane capabilities it freezes are now first-class rows in those three surfaces (v3.76: **B10** · **B11** · **C14** · **C15** · **F16** · **I14** · **I15** · **I16** · **I17**), so the contract and this document cannot be read two ways. Everything else derives behavior, boundaries, and schemas for existing rows (B1–B9, C*, D*, E9, F*, G*, H*, I*, J*).
> **Non-negotiables carried from `00-INDEX.md`:** one effect-authorization model · one append-only event log · one Progress timeline · Work is the durable unit. ARCH/17 must not weaken any of them.

---

## 17.0 Scope, purpose, and the one rule

**Purpose.** EveryAIOS ships two kinds of agent users can select:

1. **EveryAIOS Native** — a full agent harness owned by us (loop, planning, routing, memory reasoning, context construction, sub-agents, native tools). It owns its cognitive plane **and** the shared cowork plane.
2. **External agents** (Codex CLI, Claude Code, OpenCode, Aider, Cline/Roo, Grok Build …) — runtimes that keep their own loop, tools, model, permissions, and account. They may borrow the shared cowork plane.

**The one rule (hard invariant):**

> **Native Agent Plane belongs to the agent. Shared Cowork Plane belongs to EveryAIOS.**
> EveryAIOS augments *only* capabilities reachable through the integrated seam (CLI / ACP / MCP). It never assumes access to capabilities inside a separate GUI product, and it never removes an external agent's native capability.

**Capability-resolution policy (evaluated per capability family, per turn):**

```
need capability X
        │
        ├─ is X reachable through the selected agent's native suite?
        │        └─ YES → use the agent's native X
        │        └─ NO  → use EveryAIOS shared X
        │
        └─ BOTH available → the Chief chooses by
                quality · cost · permission · latency · context budget
```

This policy is what makes the two planes composable instead of competing. It is enforced in the Chief loop, not in a prompt instruction.

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
| `packages/coordinator` | Native | Chief loop, prompt assembly, routing, tool dispatch, sub-agent orchestration, streaming, memory extraction | JSON-RPC over stdio (`everyaios-ipc`) · proposes only |
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
| `everyaios-script` | Shared | rquickjs sandbox (heap/stack/timeout/payload caps) | `script.run` |
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

## 17.3 The Chief — native control loop

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

**Owned by Native and never delegated to a tool:** model routing, context assembly, memory reasoning, verification strategy, cost strategy, recovery, worker orchestration.

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
- At most **20** tools are mounted per turn (`MAX_ACTIVE_TOOLS`); selection is deterministic (`resolveActiveTools`: previously-used ⇒ +1000, id match ⇒ +40/−20, description ⇒ +8, family hints ⇒ +6).
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

**Script sandbox** (`family: script`)

| id | readOnly | operation | risk | schema |
|---|---|---|---|---|
| `script.run` | false | terminal_shell | high | `{ code }` |

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

### 17.4.3 Coordinator-side first-class tools (`packages/coordinator/src/first-class-tools.ts`)

These are the **model's own control tools**. They route to coordinator handlers, not to a native engine, and they are merged into the turn's tool list by `mergeFirstClassTools()` (currently written and **unhooked** — see §17.15).

| id | family | readOnly | operation | risk | schema |
|---|---|---|---|---|---|
| `ask` | human | true | ask | R0 | `{ question, options?, reason? }` |
| `plan` | human | true | plan | R0 | `{ goal, steps[] }` |
| `subagent` | orchestration | false | spawn | R1 | `{ objective, isolation?, scope? }` |
| `todo` | orchestration | false | todo | R0 | `{ items[] }` |

**Contracts**
- `ask` and `plan` are read-only and **wait for the human**; nothing executes until approved.
- `subagent.isolation ∈ {worktree, sandbox, none}`; `scope` is the file/folder allow-list (empty = none).
- `todo` renders the visible checklist; checked items persist in the trajectory.

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

### 17.6.4 Sub-agent orchestration contract (`everyaios-blueprint/src/subagent.rs`)

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

---

## 17.7 Prompt, context, and routing schemas

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

**Invariants:** segments 1–7 byte-identical; tools sorted + capped; `assertAllLogged()` fails the turn closed (`context_not_logged`) if any model-visible block is absent from `ContextTrace`; tool output capped at 50 KB with a ref-handle + preview.

**Routing:** task class → model role → provider/model, choosing among `reasoning | coding | cheap | research | vision | local`. Resolution loops **only over connected or keyless providers**; disconnected providers render as honest UI rows. Failover is **429-only** with key affinity; a 5xx retries the same key. Unsupported transports fail closed.

**Memory composition order:** retrieval/fusion selects candidates → ACT-R/temporal/graph rank → scope/budget gate injection → compaction applies to the assembled context. FSRS schedules review separately and never changes immediate retrieval truth.

---

## 17.8 Two-plane edge cases (must be handled, not discovered)

| # | Case | Required behavior |
|---|---|---|
| 1 | Both native and shared provide X | Chief chooses by policy; never inject both full schemas for the same family without distinguishing ids |
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
