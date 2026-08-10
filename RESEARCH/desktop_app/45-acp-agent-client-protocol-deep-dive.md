# 45 — Agent Client Protocol (ACP) Deep-Dive (source-verified)

> **Date:** 2026-08-07 · **Purpose:** the missing piece for **harness-driving (F12)** — hosting Claude Code / Codex / Cursor / OpenCode / Cline side-by-side as audited workers. ACP is *the* open standard for connecting any agent to any client. It also ships a live, working example of the **versioned-ABI + capability-negotiation** model we're building (doc 44 §5.3 patches 1–2).
> **Method:** all claims below source-read this pass from the live repo (`agentclientprotocol/agent-client-protocol`, 3,889★, Apache-2.0, no CLA) + opencode/BrowserOS ACP implementations. Nothing README-paraphrased.
> **Related:** doc 44 (modularity M1–M6 — ACP is the "M7" harness seam), doc 33 §7.6 (BrowserOS already hosts ACP agents), doc 35 (Open WebUI Computer harness-driving F12), doc 43 §2.3 (IPC/observability).

---

## 0. TL;DR

| Fact | Value |
|---|---|
| What | **Agent Client Protocol** — standardizes communication between *clients* (editors/IDEs/desktop shells) and *coding agents* (Claude Code, Codex, Cursor, OpenCode…) |
| Repo | `github.com/agentclientprotocol/agent-client-protocol` (3,889★, Apache-2.0, no CLA) |
| Site | agentclientprotocol.com |
| Wire format | JSON-RPC 2.0, newline-delimited over **stdio** (Streamable HTTP = draft); custom transports allowed |
| Stable protocol version | **1** (integer major; negotiated at `initialize` via `protocolVersion`) |
| v2 status | **Draft** (2026-07-20) — beyond-turn lifecycle, message patching by stable IDs, structured diff + `git_patch`, flexible permission prompts, forward-compat `_`-prefixed unknowns |
| Evolution process | **RFD process** (15+ RFDs shipped since v1) — capabilities added additively, never breaking |
| Official SDKs | Kotlin, Java, Python, **Rust** (`agent-client-protocol` crate), **TypeScript** (`@agentclientprotocol/sdk`) |
| Who ships it | **Zed** (client; drives Claude Code + Codex via ACP), **Claude Code** (agent), **opencode** (both sides: `packages/opencode/src/acp/`), **BrowserOS** (hosts ACP agents), Open Interpreter Codex fork, OpenClaw `acpx` (headless CLI client), Obsidian agent-client, anthropics/skills (MCP/ACP skills) |
| Why we care | Our **F12 harness-driving** (host existing agent CLIs as audited workers) is *exactly* what ACP defines. BrowserOS already proved the integration (doc 33 §7.6). ACP also validates our doc 44 ABI-versioning design with a production example. |

---

## 1. The protocol, at message level (source-verified from `docs/protocol/v1/`)

### 1.1 Message flow (from `overview.mdx`)

```
[Initialization]  Client → Agent: initialize           (negotiate protocolVersion + capabilities)
                  Client → Agent: authenticate          (only if Agent requires it)

[Session Setup]   Client → Agent: session/new           (create; params: cwd, mcpServers[])
                  — or — Client → Agent: session/load   (resume; requires loadSession capability)

[Prompt Turn]     Client → Agent: session/prompt        (user message)
                  Agent → Client: session/update        (progress notifications, tool calls, file ops)
                  Client → Agent: session/cancel        (notification — interrupt)
                  Agent → Client: session/prompt RESPONSE (stop reason)
```

### 1.2 Method inventory (v1)

| Side | Method | Type | Notes |
|---|---|---|---|
| Agent | `initialize` | request | **MUST.** Version + capability negotiation |
| Agent | `authenticate` | request | only if required by agent |
| Agent | `session/new` | request | **MUST.** params: `cwd`, `mcpServers[]` (name/command/args/env) |
| Agent | `session/prompt` | request | **MUST.** the turn |
| Agent | `session/load` | request | optional (capability `loadSession`) |
| Agent | `session/set_mode` | request | switch agent operating modes |
| Agent | `logout` | request | optional (capability `auth.logout`) |
| Agent | `session/cancel` | notification | interrupt ongoing work |
| Client | `session/request_permission` | request | **MUST.** agent asks user to authorize a tool call |
| Client | `fs/read_text_file` | request | optional (capability `fs.readTextFile`) |
| Client | `fs/write_text_file` | request | optional (capability `fs.writeTextFile`) |
| Client | `terminal/create` (+input/output…) | request | optional (capability `terminal`) |
| Client | … | | full catalog in `schema/v1/schema.json` |

### 1.3 Capability negotiation — the exact model we copy (from `initialization.mdx`)

```json
// Client → Agent
{ "jsonrpc":"2.0", "id":0, "method":"initialize",
  "params": {
    "protocolVersion": 1,
    "clientCapabilities": { "fs": {"readTextFile": true, "writeTextFile": true}, "terminal": true },
    "clientInfo": { "name": "my-client", "title": "My Client", "version": "1.0.0" }
  } }
// Agent → Client
{ "jsonrpc":"2.0", "id":0, "result": {
    "protocolVersion": 1,
    "agentCapabilities": {
      "loadSession": true,
      "promptCapabilities": { "image": true, "audio": true, "embeddedContext": true },
      "mcpCapabilities": { "http": true, "sse": true } },
    "agentInfo": { "name": "my-agent", "title": "My Agent", "version": "1.0.0" },
    "authMethods": [] } }
```

**The rules that make ACP future-proof (copy these into our ABI):**
1. `protocolVersion` is a single integer, incremented **only on breaking changes**. Non-breaking features ride the **capability** mechanism instead.
2. **All capabilities are OPTIONAL and default to UNSUPPORTED** — omitted = unsupported. Peers MUST handle any combination.
3. New capabilities are **never a breaking change**. This is how ACP shipped 15+ RFDs without a v2 — and why our `abi_version` + capability allow-lists (doc 44 §5.3) match reality.
4. Custom capabilities advertised via `_meta` (v1) / `_`-prefixed enum variants (v2) — forward-compat by default.

### 1.4 Tool calls & permission (from `tool-calls.mdx`)

- Agent reports tools via `session/update` with `sessionUpdate: "tool_call"` / `"tool_call_update"`: `toolCallId`, `title`, **`kind`** (`read|edit|delete|move|search|execute|think|fetch|other` — clients pick icons/UX), `status` (`pending|in_progress|…`), `content[]`, `locations[]`, `rawInput`, `rawOutput`.
- **Permission = a first-class client method.** Agent → Client `session/request_permission` → client renders approval UI → user decides → agent proceeds or aborts. **This is exactly our Guard-2 diff-card flow, standardized.**
- The `kind` enum maps 1:1 onto our tool permission classes (F9) and Zed's capability kinds — a shared taxonomy across the ecosystem.

### 1.5 Transports (from `transports.mdx`)

- **stdio** = standard: client launches agent as subprocess; newline-delimited JSON-RPC on stdin/stdout; stderr = free-form logs; agent MUST NOT write non-ACP to stdout. **Matches our pai-core ⇄ coordinator stdio design (ARCH/01 §1.4) exactly.**
- Streamable HTTP = draft proposal in progress.
- Custom transports allowed — protocol is transport-agnostic (bidirectional message channel required).

---

## 2. ACP v2 (draft, 2026-07-20) — the direction of travel

From `docs/announcements/acp-v2-draft.mdx` (source-read):

| v2 change | What it means for us |
|---|---|
| **Beyond the turn** — `session/update` notifications can flow freely anytime; prompt response = "message acknowledged", not "turn ended"; agent can signal idle/ready | Background/autonomous work (our automations + proactive agents) becomes expressible; matches our async engine stages |
| **Message patching by stable IDs** — omitted fields unchanged, `null` clears, values replace, chunks append; message IDs required; applied uniformly to messages, tool calls, terminal output | Streaming + redaction-friendly session model — reuse for our replay/audit (BrowserOS NDJSON patterns) |
| **Diff overhaul** — structured file changes (add/delete/modify/move/copy/binary) + optional `git_patch` | Structured diff = our Guard-2 diff-cards + GenOffice block-patch rendering share a format |
| **Flexible permission prompts** — `title`/`description`/extensible `subject` decoupled from the tool call | Richer approval cards than v1 |
| **Forward-compat by default** — `_`-prefixed unknown enum variants everywhere | Older clients/agents never choke on new data; same principle as our ABI versioning |

**Bottom line:** v2 keeps the same JSON-RPC/stdio core, adds stateful background sessions + structured diffs. We should design our harness-driving against **v1 (stable) with v2-mindful abstractions** — the diff/permission shapes in v2 align with what we already spec'd.

---

## 3. Who implements it (verified this pass)

| Project | Role | Evidence |
|---|---|---|
| **Zed** | Client | drives Claude Code + Codex via ACP (the originator — zed.dev/img/acp branding in repo README) |
| **Claude Code** | Agent | ledger doc 27 row: "ACP agent" (140K★) |
| **opencode** | Both | `packages/opencode/src/acp/` (agent.ts, session.ts, permission.ts, tool.ts, usage.ts, profile.ts, service.ts, event.ts, content.ts, error.ts, directory.ts, config-option.ts) + `cli/cmd/acp.ts` + 8 test files — **full client AND agent side in TS** |
| **BrowserOS** | Client | doc 33 §7.6: `src/lib/agents/acp/` (`acp-agent-runtime.ts`, `browseros-skill.ts`, `acp-agent-policy.ts`), `host-acp/` bundles Bun runtime + native binary; `acpx-ai-provider` (MIT, DaniAkash/agent-toolkit) turns ACP agents into AI SDK models — **sub-agents as first-class model objects** |
| **Open Interpreter** (Codex Rust fork) | Agent | ledger doc 27: "ACP+Codex SDK compat" |
| **openclaw/acpx** | Headless client | 3,107★ — "Headless CLI client for stateful ACP sessions" |
| **RAIT-09/obsidian-agent-client** | Client | 2,336★ — ACP into Obsidian (Claude Code/Codex/Gemini) |
| **anthropics/skills** | Skills | official skills collection ships MCP/ACP skills (166K★) |

**Ecosystem verdict:** ACP is the *de facto* standard for "editor/desktop shell ↔ agent CLI" — which is precisely our F12 surface. Not a gamble; an adoption play.

---

## 4. How this maps onto OUR architecture (the steal list)

### 4.1 F12 harness-driving — now fully specified
Our spec says "harness-driving (F12) hosts existing agent CLIs (Claude Code, Cursor, Grok, Codex, OpenCode…) side-by-side as audited workers." ACP gives us the contract:

```
pai-core (Rust) ──spawns──> agent CLI subprocess (claude, codex, cursor…)
       │                      │
       │   ACP: stdio JSON-RPC (newline-delimited)   ← the SAME pattern as our coordinator IPC
       │                      │
       └── our UI = the Client (renders tool calls, diff-cards, terminals, audit)
```

- **Our app plays the Client role** (we already are a "client" to our own coordinator). One ACP client implementation (Rust `agent-client-protocol` crate or TS `@agentclientprotocol/sdk` in the coordinator) → drive *any* ACP agent.
- **Audit/replay for free:** every `session/update` (tool calls, file ops, permission requests) is already structured JSON — ingest into `pai-audit` NDJSON (ARCH/02 §2.2) without scraping a TTY.
- **GuardRail stays in front:** permission requests arrive as `session/request_permission` — our Trust Ladder answers them deterministically where possible, diff-card (Guard-2) otherwise. We never need to modify the agent CLIs.
- **Budget/watchdog (J11/J10):** ACP's turn/cancel semantics (`session/cancel`, stop reasons) give clean kill points for iteration budgets and the watchdog — no orphan agents (ties to doc 43 §1.1).

### 4.2 The ABI-versioning validation
ACP is **production proof** of doc 44's patches 1–2: integer major version + capability-optional-by-default + additive evolution (15 RFDs, no breakage). When we spec our `abi_version` and manifest `capabilities`, we are reproducing a model that already scales across hundreds of integrations.

### 4.3 What to adopt verbatim
1. **`initialize` capability negotiation** — our `pai-ipc` handshake should mirror it (version + capabilities + info, omitted = unsupported).
2. **Tool `kind` taxonomy** (`read|edit|delete|move|search|execute|think|fetch|other`) — adopt as the canonical tool-permission classes (extend F9).
3. **`session/request_permission` semantics** — the permission card protocol for both ACP agents AND our own coordinator tools.
4. **stdio transport rules** — newline-delimited JSON, stderr = logs, stdout = protocol-only. (We already follow this; make it a written contract.)
5. **`git_patch`/structured-diff** (v2) — render format for our diff-cards + office block-patch previews.

### 4.4 What NOT to adopt
- We keep our own richer internal IPC (pass-by-reference C10, typed events, refs) for *our* coordinator — ACP is the *external harness* interface, not the internal engine bus. (BrowserOS makes the same split: internal agents vs hosted ACP agents.)
- v2 draft — monitor, don't build against (draft status, may change before stabilization).

---

## 5. Repo references (for future re-checks — raw paths)

| Repo | Path | What it proves |
|---|---|---|
| agentclientprotocol/agent-client-protocol | `docs/protocol/v1/overview.mdx` | message flow, method inventory |
| agentclientprotocol/agent-client-protocol | `docs/protocol/v1/initialization.mdx` | version + capability negotiation, exact JSON |
| agentclientprotocol/agent-client-protocol | `docs/protocol/v1/session-setup.mdx` | session/new + session/load + MCP servers |
| agentclientprotocol/agent-client-protocol | `docs/protocol/v1/tool-calls.mdx` | tool_call updates, kinds, request_permission |
| agentclientprotocol/agent-client-protocol | `docs/protocol/v1/transports.mdx` | stdio rules, Streamable HTTP draft |
| agentclientprotocol/agent-client-protocol | `docs/announcements/acp-v2-draft.mdx` | v2 themes (beyond-turn, patching, diff overhaul) |
| agentclientprotocol/agent-client-protocol | `schema/v1/schema.json` + `schema/v2/` | versioned JSON Schema artifacts (release-attached) |
| agentclientprotocol/agent-client-protocol | `agent-client-protocol-schema/src/v1/*.rs`, `src/v2/*.rs` | Rust data model for wire messages |
| agentclientprotocol/agent-client-protocol | `CONTRIBUTING.md`, `GOVERNANCE.md` | RFD process, no-CLA, Apache-2.0 |
| anomalyco/opencode | `packages/opencode/src/acp/agent.ts`, `session.ts`, `permission.ts`, `cli/cmd/acp.ts` | full ACP client+agent in TS (reference impl) |
| BrowserOS (browseros-ai) | `src/lib/agents/acp/acp-agent-runtime.ts`, `acp-agent-policy.ts` | hosting ACP agents + policy enforcement |
| openclaw/acpx | — | headless CLI client for stateful sessions |
| RAIT-09/obsidian-agent-client | — | ACP client in Obsidian (2,336★ precedent) |
| zed-industries/zed | `crates/agent_client*` | Zed's ACP client integration |

---

## 6. Spec impact (to apply on next update)

1. **F12 (harness-driving) gets its protocol:** adopt ACP as the *external* agent-harness interface; our app is the Client; GuardRail/Trust Ladder/audit sit between ACP messages and execution. Mark F12 "implementation = ACP client (Rust crate or TS SDK in coordinator)".
2. **New matrix row (J17):** ACP harness bridge — stdio JSON-RPC client, `session/request_permission` → Guard-2 diff-cards, `session/update` → audit NDJSON, `session/cancel` + stop-reasons → watchdog/budget kill points.
3. **Tool-kind taxonomy:** extend F9 permission classes with the ACP `kind` set (shared ecosystem vocabulary).
4. **IPC handshake:** mirror ACP's `initialize` (protocolVersion + optional-by-default capabilities) in our `pai-ipc` contract — doc 44 patch 1 gets a reference implementation to copy.
5. **v2 monitoring note:** track ACP v2 stabilization (structured diff + `git_patch` → our diff-card renderer; beyond-turn updates → our automations).
