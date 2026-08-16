# Doc 74 — Built-In MCP Server Manager (mcpservers.org, second pass)

**Date:** 2026-08-16 · **Source:** `https://mcpservers.org/` (homepage — now **9,800+** official + community servers, 18 categories: Featured / Official 🌟 / Development / Productivity / Database / Search / Web Scraping / File System / Version Control / Communication / Cloud Service / Cloud Storage / Marketing / Finance / Design / Memory / Other). Cross-checked against doc 70 (first pass, 11,054-server `/all` sampling) + the existing `everyaios-acp` registry/installer/launcher machinery.

**Question (refined):** instead of re-implementing each server's capability in Rust, can we optimize by **having MCP servers directly** — a built-in way to install + run third-party MCP servers as first-class citizens?

**One-line answer:** **Yes — bundle the *manager*, not the 9,800 servers.** We already built the exact machinery for ACP agents (`everyaios-acp`: `registry_index` → `registry_client` → `installer` → `ProcessTransport` stdio spawn → `LaunchRegistry` + Guard-2 install split + auth surface). Mirror that same pattern for MCP servers: a **built-in MCP Server Manager** that one-click installs + runs a curated allow-list of official/community servers locally (`npx`/`uvx`/stdio) or attaches user-hosted HTTP/remote ones, surfaces their tools into the agent registry, holds tokens in the vault, and enforces read-first + approve-before-send. → **TODO P22**.

---

## 1. The two surfaces (why "built-in" is the wrong axis)

| Surface | Direction | What we have today | The gap |
|---|---|---|---|
| **`everyaios-mcp` (42 tools)** | EveryAIOS **exposes its own** tools *as* an MCP server | ✅ done — 37 browser + 5 storage, ACP tool-kind taxonomy, profiles, readOnly/openWorld | none |
| **Third-party MCP servers** (mcpservers.org's 9,800+) | EveryAIOS **consumes** other servers' tools | ⚠️ `mcp_catalog` command + Connectors "MCP Servers" tab = **config-surface placeholder only** | **this is the gap** |

"Having MCP servers built in" conflates the two. We should **never** re-implement third-party servers (doc 70's conclusion still holds). The optimization is to make *consuming* them a native, one-click, managed, guarded operation — exactly the way we already consume ACP agents.

## 2. Verdict: manager, not server bundling

| Option | Verdict | Why |
|---|---|---|
| Bundle 9,800 servers | 🔴 NO | Duplicates our Rust engines, Python deps, hosted = anti-local-first (doc 70 §1–3 unchanged). |
| **Built-in MCP Server Manager** | 🟢 **STEAL/ADAPT — the optimization** | Mirror `everyaios-acp`. One-click install + run curated official/community servers locally; tools flow into the same Guard-2-gated tool registry. |
| Re-implement in Rust | 🟡 only for the 3 native gaps | PDF page ops, content search + OCR, Gmail read-first (doc 70 §2 / TODO P18) — these stay *native* because they're engine-level, not tool-level. |

## 3. The manager spec (reuse, don't rebuild)

The ACP crate already proves every mechanism we need. The MCP Server Manager maps 1:1:

| # | Manager step | Reuse from `everyaios-acp` |
|---|---|---|
| 1 | **Registry index** — a curated allow-list of official + high-value local servers (not all 9,800) | `registry_index` typed parse + `RegistryPolicy` allow-list |
| 2 | **One-click install** — `npx`/`uvx` pin or binary download → sha256 → extract | `registry_client` (fetch + disk cache + offline) + `installer` (download → sha256 → extract → install-state) |
| 3 | **Run as managed child** — stdio transport, framed JSON-RPC | `frame.rs` newline-delimited framing + `client.rs` `ProcessTransport` stdio spawn + keep-alive |
| 4 | **Tool surfacing** — list/`tools/list` → merge into the agent registry with kind/readOnly/openWorld/profile | `everyaios-mcp::ToolDef` shape (already ACP tool-kind taxonomy) |
| 5 | **Auth** — OAuth/API-key per server | `AcpSession::authenticate` + `authMethods` surface; tokens → SQLCipher vault |
| 6 | **Write policy** — read-first + approve-before-send | shared `GuardService` (`evaluate`/`use_ticket`) + the ticket contract |

**Install = Guard-2 ticket** (disk write under `<data_dir>/mcp`), same split as `acp_install_request`/`commit`. **Every write-capable tool call = Guard-2 approval** (matches the connector-platform decision: read-first, approve-before-send).

## 4. New references this pass (sharpens the design)

| Server | Verdict | Why |
|---|---|---|
| **postgres-mcp-hardened** (Rust, MIT) | 🟡 **ADAPT the write-refusal pattern** | "Writes are refused **twice**: sqlparser AST validation + DB-level `default_transaction_read_only` + per-session `statement_timeout`; column redaction, EXPLAIN cost guard, **hash-chained audit log**." This is our Guard posture (deterministic pre-check + read-only default + audit chain) applied to a DB connector — the template for our Native connector write path. |
| **houdini-bridge-mcp** | 🟢 REF | "Security-first, data-only control surface — AI authors validated wrangles, never arbitrary code." Validates our "agent proposes, Guard disposes" axiom for creative tools. |
| **egolite browser** (sponsor) | 🟢 REF | "Sharing your logged-in state, zero config" = our Session Vault (E11/E13). Already superseded. |
| **Forge — Agent Reputation Protocol** | ⚪ WATCH | MCP-native agent identity/vouching/trust scores. Post-v1; maps to H2 fleets / J17 harness trust. |
| **Croncool** (durable workflows/webhooks) | 🟢 REF | Validates B7 heartbeat/durable-execution direction (doc 67). |
| **Chrome DevTools / Playwright / Filesystem / Postgres MCP** | 🔴 SKIP (superseded) | Our `everyaios-cdp` / browser tier / `everyaios-storage` already cover these (doc 70 §5). |

## 5. Policy (unchanged, restated for the manager)

- **Local, curated allow-list** only for auto-install (stdio/`npx`/`uvx`); hosted/remote = user-supplied, never auto-bundled.
- **Install + write** = Guard-2 tickets; **tokens** = SQLCipher vault; **secrets never in the sidecar**.
- **Read-first + approve-before-send** for every outbound-capable tool (mail/slack/DB writes).

## 6. Net action

**TODO P22 (built-in MCP Server Manager):**
1. `everyaios-mcp::manager` — registry index + curated allow-list + install (npx/uvx/binary) + stdio child spawn (reuse ACP framing/transport) + `tools/list` surfacing.
2. Tauri `mcp_servers`/`mcp_install`/`mcp_run`/`mcp_tools` + Connectors "MCP Servers" tab → live manager (one-click install → run → tool list), Guard-2 install + per-write tickets, vault-held tokens.
3. Native connector write template = postgres-mcp-hardened pattern (refuse-twice + read-only default + audit chain).

**Also:** doc 70's three *native* gaps (PDF page ops, content search + OCR, Gmail read-first) stay in TODO P18 — the manager is the *consumption* layer, those are the *engine* layer.

**Ledger:** unchanged **281 repos** (this pass adds no new live repos — all references already tracked in docs 35/47/55/63/70).
