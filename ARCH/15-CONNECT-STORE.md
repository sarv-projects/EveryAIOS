# Connect Store — remote MCP + OAuth connectors (the "click → sign in → use" surface)

> **Status:** v1.0 (2026-08-29). Companion to `manager.rs` (local stdio MCP installs)
> and `everyaios-vault::oauth` (PKCE + device-flow OAuth). **New file `everyaios-mcp/src/store.rs`.**
> Live code: `store_catalog` Tauri command → `ui/src/lib/mcp.ts` `storeCatalog()`.
> **v1.1 (2026-08-29):** vault `oauth.rs` now registers the five connector
> providers the store routes to — `github` (device flow, `repo read:user`),
> `google` (PKCE, Drive read), `microsoft` (PKCE, Graph mail/files/calendar),
> `slack` (PKCE), `notion` (PKCE). Slack/Notion ship with an empty client_id
> (their integrations need a registered app) — set via `with_client_id`; the
> others use community/known public client IDs (override anytime). 4 new vault
> oauth tests (110 vault tests total).

## The problem

Users want ChatGPT-app workability: **click a connector, sign in, use it.** They do
not want to create OAuth apps (n8n's biggest complaint) or edit JSON MCP config
(the current Claude-desktop/VS-Code complaint). The 2026 ecosystem answer is:

1. **Remote MCP servers + the OAuth 2.1 authorization spec** (PKCE + dynamic client
   registration). Every official server (GitHub, Google Drive, Atlassian, Microsoft
   Graph, Snowplow…) is a connector with **zero app-side per-provider code**.
2. **Device flow / loopback PKCE** for the big four (GitHub, Google, Microsoft,
   Slack) — works with **zero infrastructure**.
3. **BYOK API keys** for the long tail.

## What this commit adds (the store)

`everyaios-mcp/src/store.rs` — a **curated Connect Store**:

- `StoreIndex::bundled()` — a short, reviewed, audit-visible index of official
  remote MCP servers + flat OAuth connectors (GitHub, Google Drive, Microsoft
  Graph, Notion, Slack + GitHub-device/Gmail flat connectors). Each entry is a
  vetted endpoint + the exact `ConnectConsent` Guard-2 must render.
- `StoreKind::{RemoteMcp, Connector}` — remote-MCP vs flat-OAuth.
- `ConnectFlow::{Pkce, DeviceCode, ApiKey}` — which OAuth flow to run (matches the
  vault's `FlowKind`).
- `ConnectConsent` — the plain-language scopes + mutation/memory flags Guard-2
  shows before any authorization. **Prompt-is-not-permission is preserved.**

`manager.rs` gains a first-class remote path:
- `RemotePlan { id, url, oauth_provider }` + `remote_plan()`. Previously
  `install_plan` rejected `registryType: "remote"` with `UnsupportedType`; now a
  remote server is validated (allow-listed + https/loopback) as a *connect* target
  rather than a spawned binary — no executable bytes cross the trust boundary.

Wiring:
- `mcp_cmds::store_catalog` (Tauri) → `ui/lib/mcp.ts` `storeCatalog()` — renders
  the store as the Connectors-tab "Connect" list.
- Extensible: `StoreIndex::with([...])` overrides bundled entries for BYO client
  IDs — the n8n wall, but only for the trailing edge.

## Why remote MCP now

The old surface was stdio-only: every connector was a locally-spawned server you
had to install + configure. The ecosystem moved to remote-OAuth MCP — a server the
app *connects* to over HTTP/SSE with OAuth 2.1. This commit makes that a
first-class target (`remote_plan`) so the app can be an MCP *client of a store*,
not a factory of spawned children.

## Skills / plugins

Skills and connectors converge on **MCP** (tools/resources) + **SKILL.md**
(instructions). Distribution is a **signed registry index** (the ACP/MCP registry
machinery already in `everyaios-mcp`/`everyaios-acp`, signed with the same minisign
key the updater uses). Install = Guard-2 consent (tool list + permissions) →
sandboxed (the `everyaios-guard` sandbox profiles). This is the post-v1
"community skills marketplace" (TODO **P9.7 / line 968**).

## Honest boundaries

- The **only** place a server touches the flow is the optional **OAuth relay** for
  providers that require https redirect URIs (Notion etc.) — open-source,
  self-hostable (the LobeChat chat-plugins-gateway / AnythingLLM Hub model). Not
  shipped by default.
- The bundle ships **community/known public client IDs** (like the vault's
  `DEFAULT_CLIENT_IDS` for subscriptions) with a documented "register our own when
  we ship" note; every one is overridable via `with_client_id`.
- Consent is non-bypassable: `store_catalog` gives the UI *what to show*; the
  request to authorize still flows through `everyaios-vault::oauth` + Guard-2.

## Routing model (what connects feeds)

Tools from connected servers are merged into the unified catalog surface
(`manager::merge_into_catalog`); the coordinator's model-facing tool list is the
*sid*car's concern and unchanged here. Memory indexing from connectors
(`indexes_into_memory`) is an explicit per-entry flag the consent card shows.