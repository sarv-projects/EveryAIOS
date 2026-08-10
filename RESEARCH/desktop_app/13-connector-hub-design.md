# 13 — Connector Hub Design (the unified connection layer)

> Date: 2026-08-05 · Builds on doc 10 (Unified Tool Registry), doc 12 (Composio vs Nango), and fresh Zapier research.
> **One hub, four engines, one registry, one permission system.** Users connect once; the LLM sees one flat tool list.

## 0. The idea in one line

The **Connector Hub** is the desktop app's single place where users connect their apps (Gmail, GitHub, Slack, Notion…). It routes each connection to the best engine — **Composio** (managed execution), **Zapier** (governed access to 9,000+ apps), **Nango** (self-hosted sovereign OAuth + sync, pro), or our **native adapters** (27+ already built) — then registers every resulting tool into the Unified Tool Registry under one permission system.

---

## 1. The engines (what routes where)

| Engine | Job | Auth model | User friction | Where it lives |
|---|---|---|---|---|
| **Native adapters** ✅ built | 27+ zero-auth connectors (Weather, RSS, HN, Wikipedia, Reddit…) | none / direct | zero | `core-connectors/src/adapters/*` |
| **Composio** ✅ built (partial) | 1,000+ toolkits, agent-optimized execution | user pastes Composio key → hosted sessions | paste a key | **MCP path**: `session.mcp.url` as MCP server (doc 12) |
| **Zapier** (new) | **9,000+ apps**, governed access (SOC 2), also no-code zaps | user's Zapier account + OAuth connections | login once | **MCP**: `https://mcp.zapier.com/api/v1/connect` (hosted) **or SDK**: `@zapier/zapier-sdk` in the sidecar **or connectors**: local stdio MCP |
| **Nango** (pro toggle) | self-hosted OAuth + proxy + **scheduled syncs → local RAG** | user's own OAuth apps + own Postgres | high (power users) | local server (Docker) |
| **User MCP servers** ✅ built (client) | anything the user configures | per-server | config file | `core-search/mcp-client.ts` → full MCP host |
| **Forge skills** (P6) | tools the agent builds itself | n/a | zero | `~/.pai/skills/` |

**Zapier's verified open-source facts (2026-08-05):**
- `zapier/zapier-mcp` (372⭐): hosted MCP server at `mcp.zapier.com/api/v1/connect` — "governed access to 9,000+ apps… no code, no infrastructure, SOC 2 Type II". Repo is the plugin distribution layer.
- `zapier/sdk` (242⭐): `@zapier/zapier-sdk` npm — `login` (machine-stored), `create-connection <app>` (OAuth, Zapier holds grant), `run-action <app> <action> --inputs`. Runs inside our Node sidecar as a normal dependency.
- `zapier/connectors` (113⭐, **prototype, ELv2**): the big steal — each app is **one folder, four surfaces**: ① agentskills.io skill (works in ~40 clients), ② TS module with `.run(input, opts)` + **`connectionResolvers`** (`env:TOKEN` = user-held creds, `zapier:<id>` = Zapier-managed), ③ CLI (`npx @zapier/notion-connector run search`), ④ **local MCP server over stdio** (`… connector mcp`).
- `zapier/AutomationBench` (178⭐): 600-task benchmark (6 business domains × 100, 47 simulated SaaS tools), programmatically verifiable — **use as our agent eval harness for connector workflows**. (Current top models pass only ~35–50% — this space is wide open.)
- Pattern to copy: **`llms.txt`** — machine-readable capability index for AI agents.

---

## 2. Core data model

```ts
// One row per connected account. The router's unit.
interface Connection {
  id: string;                 // uuid
  provider: string;           // 'gmail' | 'github' | 'notion' | ...
  engine: 'native' | 'composio' | 'zapier' | 'nango' | 'mcp' | 'forge';
  engineRef: string;          // engine-specific handle (composio session id / zapier connection id / nango conn id / mcp server name)
  state: 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error' | 'dead';
  permissionClass: 'read-only' | 'local-write' | 'external-write' | 'destructive';
  usage: { calls: number; month: string; budget?: number };  // Composio 20K/mo etc.
  syncSchedule?: string;      // Nango/Zapier: '0 9 * * 1' → feeds RAG
  createdAt: string;
}

// The registry entry — every engine emits these. The LLM sees only this flat list.
interface ToolDefinition {
  name: string;               // 'gmail_send_email'
  description: string;
  parameters: JSONSchema;
  permissionClass: PermissionClass;
  connectionId?: string;
  execute(args: unknown, ctx: ToolCtx): Promise<ToolResult>;  // routed to owning engine
}
```

**Routing rule (the no-double-connect guarantee):** one `(provider, account)` → one `engine`. The hub picks the engine at connect time and stores it; the registry never registers the same account twice. Default preference: **native → Composio → Zapier → Nango** (lowest-friction first), overridable per provider in Settings.

**Connection state machine** reuses the existing `connection-manager.ts` states + adds `reconnecting` (doc 03) — every engine's connection goes through the same supervised lifecycle.

---

## 3. The flow (end to end)

```
User opens CONNECTOR HUB → sees grid of providers (Gmail, Slack, GitHub, Notion…)
        │
        ▼  "Connect" on a provider
  Hub asks engine per routing preference
        │
   ┌────┴────────┬─────────────┬──────────────┐
   ▼             ▼             ▼              ▼
 COMPOSIO      ZAPIER        NANGO (pro)   NATIVE
 paste key →   login →       self-host →   instant
 session.mcp   OAuth connect OAuth apps    (no auth)
 .url attach   (browser)     + sync setup
        │             │            │
        ▼             ▼            ▼
   ┌────────────────────────────────────────────┐
   │  Unified Tool Registry (doc 10)            │
   │  one flat tool list → agent loop (P3)      │
   │  permission class on every tool            │
   │  dual-guard: regex gate + trust ladder +   │
   │  confirmation cards for external-write/    │
   │  destructive (P8)                          │
   └────────────────────────────────────────────┘
        │
        ▼
  Supervision (doc 03): every engine connection is a
  supervised child process / session — crash → restart
  w/ backoff, dead-target registry, reconnect state.
```

**Key mechanics:**
- **Composio** = attach `session.mcp.url` as an MCP server (zero maintenance, user's key, 20K free calls/mo — surfaced in the analytics panel).
- **Zapier** = three interchangeable surfaces (hosted MCP / SDK in sidecar / local connectors MCP) — start with hosted MCP, add the SDK for programmatic `run-action`, adopt the **connectors shape** (one folder → skill + TS module + CLI + MCP) as the internal standard for any connector we author ourselves.
- **Nango** = only for power users; its **sync** writes into the existing `core-files` ingestion pipeline → synced issues/contacts/docs become RAG-queryable. Nango-managed connections take precedence over Composio/Zapier for the same provider *when the user enables pro mode* (explicit routing override, no silent double-connect).
- **Every external-write tool** (`gmail_send_email`, `slack_post_message`, `github_create_issue`) is permission-classed `external-write` → trust-ladder gate + confirmation card, regardless of which engine it came from.

---

## 4. UX surface

- **Connector Hub screen** (sidebar item): searchable provider grid with per-provider: connected badge + engine tag ("via Composio" / "via Zapier" / "local"), connect/disconnect/reconnect, usage meter, sync schedule editor.
- **Connection detail**: state, engine, last-used, permission class, "what it can do" list (from registered tools), budget.
- **OAuth UX** (steal from n8n/Zapier, doc 10): clean connection-card modals; tokens never shown.
- **Pro toggle**: Settings → Advanced → "Local integration server (Nango)" with Docker one-liner + setup wizard (register your OAuth apps) — clearly marked power-user.

---

## 5. What to build (phases) & what exists

**Exists already (do not rebuild):** 27+ native adapters + `composio-catalog.ts` (32 toolkits) + `composio-adapter.ts` + CF→GCP proxy chain (mobile) + `connection-manager.ts` state machine + `core-search/mcp-client.ts` + `core-connectors` orchestrator + permission-gate & trust-ladder.

**New:**
1. `ConnectorHub` core (sidecar): `ConnectionStore` (SQLite), router (engine preference + no-double-connect), `ToolRegistry.registerConnection()`, usage metering. *(TS — the spine)*
2. Composio MCP attach (desktop): register user key → `session.mcp.url` → registry. *(small)*
3. Zapier path: hosted MCP attach first; SDK adapter (`@zapier/zapier-sdk`) second; adopt the **connectors artifact shape** for our own authored connectors. *(small–medium)*
4. Nango adapter (pro): spawn/manage local Nango (Docker), wire sync → `core-files` ingestion. *(medium, gated)*
5. Hub UI: provider grid, engine badges, usage panel, sync editor. *(UI phase)*
6. **AutomationBench integration** (later): run our agent against Zapier's 600-task public set to measure real business-workflow capability — the honest eval.

---

## 5.5 Path B2 — Local Auth Bridge (unofficial OAuth, own laptop, open source)

> Solves "users want Gmail/Calendar but per-user OAuth registration is friction." Verified 2026-08-05. This is the standard FOSS pattern (Thunderbird, K-9 Mail ship project OAuth clients).

**What it is:** the app ships **one project-registered OAuth client** (desktop apps use **PKCE — `client_id` is public by design, no `client_secret` needed**), user logs in via system browser once, and a **local token manager** (mini-Nango we build, or Nango pointed at our client) stores + refreshes tokens on the user's own laptop. Individual use, no third party in the middle.

**Verified policy reality (2026):**
| | Google | Microsoft |
|---|---|---|
| Unverified client, personal account | Works behind "Google hasn't verified this app" screen + security alerts; Workspace accounts usually admin-blocked | Works **cleanly** — multi-tenant public client + `localhost` loopback redirect; no paid audit for delegated mail/calendar scopes |
| Remove warnings | Gmail scopes → CASA audit ~$500–several-thousand/yr, 3–12 wks | Only needed for org/admin scopes |
| Real risk | Shared client across thousands of users → Google abuse detection **can suspend the client** | Low |
| App password / IMAP | Unreliable (needs 2FA, being phased out) | Dead (basic auth deprecated) |
| Calendar w/o OAuth | Impossible (CalDAV dead for consumers; ICS read-only) | Needs OAuth (Graph) |

**The scale-safe design:** project client = convenience default; **always offer "use my own OAuth app"** (one-page setup wizard) so power users bypass warnings and the project client never becomes a single point of failure. Same local token manager serves both.

**Where it fits in the hub:** new engine value `local-oauth` (sibling of `nango`), registered after native/Composio/Zapier in routing preference; tokens in the local vault (never in the LLM context); external-write permission classes unchanged. This removes the "pro-only" label from basic Gmail/Calendar/Microsoft connections — casual users get zero-registration connect via Composio, and privacy-first users get zero-third-party connect via the bridge.

---

## 6. Watch-outs

- **No double-connect** — one provider+account → one engine, always.
- **Cloud honesty** — Composio/Zapier tool execution routes through their clouds (by nature of SaaS connectors). Free search/RAG/agents stay local. Nothing else depends on them.
- **Licenses** — Zapier connectors = ELv2 (fine internally; don't resell). Nango = ELv2. Composio SDK = MIT.
- **Rate budgets** — Composio 20K calls/mo free; Zapier has its own plan limits; surface both in the usage panel and let the router prefer the engine with budget left for the same capability (future: smart routing).
