# Connect Store — remote MCP + OAuth connectors (the "click → sign in → use" surface)

> **DERIVED DOCUMENT — see [`CORE.md`](CORE.md) §4 and [`CAPABILITIES.md`](CAPABILITIES.md) first.**
> Connectors are a capability pack: a connector declares a manifest, authentication, capabilities, provider
> transport and action definitions, and its actions produce a canonical `EffectRequest` that passes
> `Guard → Executor` like any other effect. A connector may not own a permission model, an audit bypass, an
> independent effect commit, or connector-scoped Work state.
> **Consolidation `P69.D17` landed in code 2026-09-20 (implemented, not verified):** connector actions produce
> a canonical `EffectRequest` through the one ticketed executor — the contract section below is the landed shape.

## Capability-pack contract — connectors under CORE (`P69.D17`)

> Authoritative: [`CORE.md`](CORE.md) §4 · [`CAPABILITIES.md`](CAPABILITIES.md) · [`SECURITY.md`](SECURITY.md).
> A connector is a **capability pack**: manifest + authentication + declared capabilities + provider transport
> + action definitions. Every connector action produces a canonical **`EffectRequest`** and travels
> `Guard → Executor` like any other effect; the store catalog (`store_catalog`) is *what to show*, never a
> permission. No connector-scoped permission model, audit bypass, independent effect commit, or
> connector-scoped Work state. Raw OAuth tokens stay in the vault and are never handed to an agent.
> External MCP tools normalize into the same canonical capability model (adapter, never a second permission
> universe — `P69.D18`); they never bypass the executor.

---


> **Full-Stack Module:** Module 4 — Governed MCP & Capability Marketplace (`crates/everyaios-mcp`, stdio & remote SSE MCP client/server).
> **Status:** v1.6 (2026-09-03 — the notes below reach v1.6; the header previously read v1.2). Companion to `manager.rs` (local stdio MCP installs)
> and `everyaios-vault::oauth` (PKCE + device-flow OAuth). **New file `everyaios-mcp/src/store.rs`.**
> Live code: `store_catalog` Tauri command → `ui/src/lib/mcp.ts` `storeCatalog()`.
> **v1.1 (2026-08-29):** vault `oauth.rs` now registers the five connector
> providers the store routes to — `github` (device flow, `repo read:user`),
> `google` (PKCE, Drive read), `microsoft` (PKCE, Graph mail/files/calendar),
> `slack` (PKCE), `notion` (PKCE). Slack/Notion ship with an empty client_id
> (their integrations need a registered app) — set via `with_client_id`; the
> others use community/known public client IDs (override anytime). 4 new vault
> oauth tests (110 vault tests total).
>
> **Settings ownership (ARCH/17 §17.12 — read models move with the `P69.A26` split → AGENT.md + EXTERNAL-AGENTS.md):** this document defines the shared connector/store backend; the Settings Control Center composes its `ConnectionRecord` read model and must not create a second connector registry. The connect store, its OAuth providers and the MCP
> children it instals are **Shared Cowork Plane** — connector capabilities are
> borrowed by every agent (Native included) through the shared façade, and raw
> OAuth tokens never leave the vault for an agent. The monitored-transport note
> below applies identically to a Native-mediated child and an external agent's
> child.
> **v1.2 (2026-08-29):** remote client landed — `everyaios-mcp::remote`
> (OAuth 2.1 discovery + RFC 7591 dynamic client registration + PKCE + token
> exchange + streamable-HTTP JSON-RPC over the `HttpTransport` seam; ureq
> default). Tauri `mcp_connect_start` (discovery → PKCE → loopback callback
> thread → bearer token in shell state), `mcp_remote_status`, `mcp_remote_call`
> (tools/list, tools/call). UI: **Connect Store tab** in the Connectors panel
> renders `storeCatalog()` with live Connect buttons + plain-language scopes.
> 5 new remote-client tests (53 mcp tests total).
> **v1.3 (2026-08-29):** four gap-closers — (1) remote-MCP tokens now persist
> in the vault (`OAuthManager::store_connector_token` / `load_connector_token`
> into the SQLCipher `oauth_tokens` table; `mcp_connect_start` writes them,
> `mcp_remote_status` / `mcp_remote_call` fall back to the vault on restart);
> (2) `mcp_remote_tools` merges a connected server's `tools/list` into the
> catalog surface (UI `mcpRemoteTools`); (3) flat connectors route through the
> vault provider (`StoreSection` dispatches device-code / pkce / api-key to the
> vault OAuth commands instead of assuming a remote MCP URL); (4) connector
> client-ids are overridable per-provider via
> `EVERYAIOS_OAUTH_CLIENT_ID_<UPPER_PROVIDER>` env (Slack/Notion — the
> zero-code path until we register our own app). Vault oauth tests 110 → 113.
> **v1.4 (2026-08-29):** skills/plugins store companion —
> `everyaios-guard::skillstore` (P9.7): one Ed25519-signed index of skills with
> per-entry capability demands, verified against a pinned public key, gated by
> `RUNTIME_CAPABILITY_ALLOWLIST` and Guard-2 consent (ARCH/15 tier 3).
> 6 new skillstore tests. **CI:** the dropped `APP_CLONE_TOKEN` gate is replaced
> by an explicit fail-loudly step in `ci.yml` — every coordinator dep must
> resolve to a vendored `packages/core-*` package or the workflow fails.
> **v1.5 (2026-09-01, P50.3.4/.5):** consent enforcement moved fully into Rust —
> user-supplied stdio attach is two-phase (`mcp_attach_request` mints an
> args-hash-bound Guard-2 ticket over the exact command line; `mcp_attach_commit`
> consumes the single-use ticket before any child spawns; `mcp_detach` persists
> the disconnect), and remote `tools/call` goes through the same ticket +
> audit-receipt path as native effects (`mcp_remote_call` request half →
> `mcp_remote_call_commit` executor half; read-only `tools/list`/discovery stay
> ungated). Attached-server identity persists to `<data_dir>/mcp_servers.json`
> and restores at boot as honestly `disconnected` rows.
> **v1.6 (2026-09-03, P50.2.6):** connected-truth hardening — `mcp_servers`
> reports an attached row `connected` only while its live child is tracked in
> the shell's `mcp_live` map (restart-restored rows stay `disconnected` until
> re-attached); the Connectors panel hydrates each Store row from
> `mcp_remote_status` (remote-MCP) or the vault OAuth accounts (flat
> connectors) and disconnects through `oauth_revoke`/`mcp_detach`, so only
> installed/attached/authenticated resources ever render `connected`.

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
sandboxed (a tested concrete monitored backend primitive; currently Linux `bwrap` when installed), with host changes imported only through the validated `ReviewedImport` manifest and a reviewed change set. **Launch transport (updated v3.75):** the ACP launch path was wired to the shared monitored transport on 2026-09-02 (`ProcessTransport::spawn_sandboxed` over `LinuxBwrapBackend::spawn_stdio`, with a real bwrap round-trip test), and the **MCP** attach path followed in v3.74 (P62.2 — `spawn_with_posture(SandboxPosture::preferred())`, `--clearenv` + `--unshare-net` + a credential-free `essential_env()` allow-list, fail-closed if confinement is requested but unavailable). So neither path is "uncontrolled" any more **on Linux**; on macOS/Windows both honestly degrade to `Ambient` because the native backends are still unbuilt (P49.5). macOS/Windows native enforcement and packaged verification remain release gates. A self-contained external process is not covered by the native EveryAIOS ticket/audit guarantee. The attach API still requires a concrete sandbox process and reviewed-import root to be considered controlled. This is the post-v1
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
sidecar's concern and unchanged here. Memory indexing from connectors
(`indexes_into_memory`) is an explicit per-entry flag the consent card shows.