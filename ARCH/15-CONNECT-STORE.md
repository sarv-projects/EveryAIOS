# Connect Store — remote MCP + OAuth connectors (the "click → sign in → use" surface)

> **DERIVED DOCUMENT — see [`CORE.md`](CORE.md) §4 and [`CAPABILITIES.md`](CAPABILITIES.md) first.**
> Connectors are a capability pack: a connector declares a manifest, authentication, capabilities, provider
> transport and action definitions, and its actions produce a canonical `EffectRequest` that passes
> `Guard → Executor` like any other effect. A connector may not own a permission model, an audit bypass, an
> independent effect commit, or connector-scoped Work state.
> **Consolidation `P69.D17` landed in code 2026-09-20 (implemented, not verified):** connector actions produce
> a canonical `EffectRequest` through the one ticketed executor — the contract section below is the landed shape.
>
> **v1 scope clarification (2026-09-24):** [`ADR/0007`](ADR/0007-windows-first-v1-qualification.md)
> keeps the Connect Store and MCP shared plane in v1 as part of Channel B, with one Work-scoped bridge,
> one Guard/executor/audit path, and no raw OAuth token in a sidecar, agent, or renderer.
> **Corrected 2026-09-25 against source:** the earlier note here that "the live ACP launch currently
> passes an empty `mcpServers` list" **no longer describes the code.** `src-tauri/src/acp_cmds.rs`
> `channel_b_servers` feeds both production `session_new` calls (empty only on a lease failure), so the
> server list is populated — see [`EXTERNAL-AGENTS.md`](EXTERNAL-AGENTS.md) §3.1 and
> [`ADR/0007`](ADR/0007-windows-first-v1-qualification.md). Channel B is still **unverified/open**, because
> no live guarded `tools/list` + `tools/call` round-trip has been recorded — that is the real residual, not
> an empty list. Voice/STT/TTS/wake-word/audio remain post-v1.

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
> **Settings ownership (the Settings Control Center read-model contract — historically `ARCH/17` §17.12, now [`AGENT.md`](AGENT.md) + [`EXTERNAL-AGENTS.md`](EXTERNAL-AGENTS.md) since the `P69.A26` split and the 2026-09-22 archive move — `P71.5a`):** this document defines the shared connector/store backend; the Settings Control Center composes its `ConnectionRecord` read model and must not create a second connector registry. The connect store, its OAuth providers and the MCP
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

---

## Repo-comparison additions (briefs 01–19)

> Provenance: `REPO-COMPARE/DELTA-ANALYSIS.md` §3 group "ARCH/15-CONNECT-STORE.md + connectors/MCP
> (briefs 02 + 18)" — minus CON-3, pre-routed to the AUTOMATION lane — plus 11-3, the SEC-19
> cross-presence pointer, and §6 #5. Evidence paths are relative to
> `/home/sarvesh/business_Dev/REPO-COMPARE/`. **MCP-first stance (ADR-0001) is unchanged** (ADR files
> referenced, never edited): every entry extends the store/façade contract — never a second protocol,
> registry, or permission universe. `→ …` marks an implementation target queued in TODO by its owning lane.

### Adds

- **CON-1** · `[add]` · SOURCE: nango (ELv2 — pattern-read only) — `clone2/nango/packages/providers/providers.yaml`
  · LOGIC: a declarative provider-template registry (auth modes, token/authorize URL interpolation, header
  templates, typed connection-config schemas driving auto-generated forms) makes connectors data instead of
  bespoke adapter code, with bespoke adapters only for outliers.
  · TARGET: this file §What this commit adds (the store) → **core-connectors** (impl queued).
- **CON-2** · `[add]` · SOURCE: nango (ELv2 — pattern-read only) —
  `clone2/nango/packages/shared/lib/services/connections/credentials/refresh.ts:100,602`
  (`refresh_exhausted`, expiration buffer; failure cooldown window at `:104`) · LOGIC: an OAuth refresh
  state machine (expiry buffer, provider quirks, single-flight collapse, failure cooldown +
  `refresh_exhausted`, 24h keep-alive sweep, preserve-old-token) keeps connector sessions alive with state
  living Rust-side next to the tokens. · TARGET: this file §Honest boundaries → **vault** state columns +
  sweep (impl queued).
- **CON-4** · `[add]` · SOURCE: nango (ELv2 — pattern-read only) —
  `clone2/nango/packages/types/lib/agent/toolset.ts` (pinned/searchable tool split) +
  `clone2/nango/packages/server/lib/services/agentSessionToolSearch.service.ts` · LOGIC: the connector
  façade is a session-scoped toolset — pinned + searchable tools with a `tool_search` meta-tool in the
  stable prefix from day one — so connector tool count stays out of every prompt (I16 cache-stable).
  · TARGET: EXTERNAL-AGENTS §3 (task-shaped façades) → **everyaios-mcp** (impl queued); item recorded
  here per the delta's connectors/MCP group.
- **STO-7** · `[add]` · SOURCE: nango (ELv2 — pattern-read only) —
  `clone2/nango/packages/records/lib/cursor.ts:21` (`sort||id` cursors) +
  `clone2/nango/packages/records/lib/store.ts` (hard/soft/prune modes) +
  `clone2/nango/packages/shared/lib/services/sync/job.service.ts` · LOGIC: a records-cache sync store
  (`sort||id` cursors, checkpoints, soft-delete generations, retention daemons with documented retention
  defaults) is the contract note for connector data sync recorded here, never a copy of their policy
  numbers. · TARGET: contract note here → **everyaios-storage** (impl queued).
- **REG-3** · `[add]` · SOURCE: modelcontextprotocol/registry (Apache-2.0) —
  `clone3/mcp-plugins-skills-connectors/registry/docs/reference/server-json/official-registry-requirements.md`
  · LOGIC: publisher namespace-ownership proof (reverse-DNS namespace + an Ed25519 key bound to the
  namespace in the signed index) hardens the existing signed skillstore without creating a registry.
  · TARGET: this file §Skills / plugins (skillstore).
- **CFG-1** · `[add]` · SOURCE: IBM/mcp-context-forge (Apache-2.0) —
  `clone3/mcp-plugins-skills-connectors/mcp-context-forge/mcp-catalog.yml` · LOGIC: seeded public OAuth
  discovery metadata (issuer/authorization/token/scopes copied from provider `.well-known`, never client
  secrets) bundled as Connect Store seed lets remote-MCP add skip an add-time outbound probe, with runtime
  discovery as fallback. · TARGET: this file §What this commit adds (the store) → **vault** `oauth`
  (impl queued).
- **OC-1** · `[add]` · SOURCE: oomol-lab/open-connector (Apache-2.0) —
  `clone3/mcp-plugins-skills-connectors/open-connector/docs/catalog-format.md` +
  `clone3/mcp-plugins-skills-connectors/open-connector/src/catalog-store.ts` · LOGIC: `operationType`
  (read|write|destructive) plus executability flags (`locallyExecutable`/`catalogOnly`/`needsCredential`/
  `noAuthRunnable`) on store rows and pack tool listings is discovery honesty only — Guard remains the
  authorization decider. · TARGET: this file §What this commit adds (the store) → **CAPABILITIES**
  §permissions vocabulary (impl queued).
- **OC-3** · `[add]` · SOURCE: oomol-lab/open-connector (Apache-2.0) —
  `clone3/mcp-plugins-skills-connectors/open-connector/docs/credentials.md` · LOGIC: idempotency keys for
  connector writes store hash + request fingerprint only (never the raw key) with a 24h replay window,
  enforced at Guard/executor admission so duplicate writes cannot double-commit.
  · TARGET: this file §Capability-pack contract (connector-scoped writes) → **everyaios-guard** admission
  (impl queued).
- **CMP-2** · `[add]` · SOURCE: ComposioHQ/composio (MIT) —
  `clone3/mcp-plugins-skills-connectors/composio/ts/packages/experimental/src/pi/session-tools.ts` +
  `clone3/mcp-plugins-skills-connectors/composio/ts/packages/core/src/lib/toolRouterMcp.ts` · LOGIC: an
  optional meta-tool mode on the connector façade (`search_tools`/`auth_tool`/`execute_tool`) lazily
  fetches schemas for context economy while auth stays a first-class runtime step and execution still runs
  Guard→ticket→executor. · TARGET: EXTERNAL-AGENTS §3 façades → **CAPABILITIES** small-inventory rule
  (impl queued); item recorded here per the delta's connectors/MCP group.
- **OBS-1** · `[add]` · SOURCE: Observal (Apache-2.0) —
  `clone3/mcp-plugins-skills-connectors/Observal/observal_cli/capability_lock.py` · LOGIC: a
  per-activation capability lock (JSONL `{ts, kind: agent|mcp|skill|hook|prompt|sandbox, harness session,
  pack}`, 8KB line cap, 30-day retention) appended on the executor/ticket path is an audit-compatible
  record — never a parallel authority or connector-scoped Work state. · TARGET: this file §Capability-pack
  contract → **CAPABILITIES** §4 + everyaios-audit (impl queued).
- **SP-2** · `[add]` · SOURCE: obra/superpowers (MIT) —
  `clone3/mcp-plugins-skills-connectors/superpowers/hooks/hooks.json` · LOGIC: declared lifecycle hooks in
  the pack manifest (e.g. `on: session_start`, explicit async flag) run as ticketed Guard→executor
  commands with the activation recorded in OBS-1's capability lock, so packs never smuggle ambient shell.
  · TARGET: this file §Skills / plugins → **CAPABILITIES** manifest §3 + ticketed execution (impl queued).
- **11-3** · `[add]` · SOURCE: eliza (MIT) — `clone2/eliza/packages/core/README.md` (roomId as the single
  room entitlement, evaluated inside the storage adapter before rows/counts/ranking return; CAS for grant
  changes; fail-closed for unresolved identities) · LOGIC: Connect Store/connector data reads check the
  entitlement inside the storage adapter before any row, count, or ranking returns — fail-closed for
  unresolved identities, CAS for role changes. · TARGET (primary): this file (connector data reads; pairs
  with the STO-7 sync-store contract) **→ SECURITY §2**.

### Improves

- **REG-1** · `[improve]` · SOURCE: modelcontextprotocol/registry (Apache-2.0) —
  `clone3/mcp-plugins-skills-connectors/registry/docs/reference/server-json/generic-server-json.md` +
  `clone3/mcp-plugins-skills-connectors/registry/docs/reference/server-json/official-registry-requirements.md`
  (4KB `_meta` cap) · LOGIC: a namespaced, size-capped publisher extension on `store_catalog`/skillstore
  rows (`_meta.everyaios.*` preserved, foreign keys dropped, 4KB cap) gives store entries a bounded
  extension slot without a publish-side registry. · TARGET: this file §Skills / plugins + §What this
  commit adds (the store).
- **REG-2** · `[improve]` · SOURCE: modelcontextprotocol/registry (Apache-2.0) —
  `clone3/mcp-plugins-skills-connectors/registry/internal/service/versioning.go` · LOGIC:
  semver-with-publication-timestamp-fallback ordering makes skillstore/store version precedence total and
  deterministic (valid semver wins; both non-semver → publication timestamp).
  · TARGET: this file §Skills / plugins → **everyaios-guard**::skillstore (impl queued).
- **CFG-2** · `[improve]` · SOURCE: IBM/mcp-context-forge (Apache-2.0) —
  `clone3/mcp-plugins-skills-connectors/mcp-context-forge/docs/architecture-plugin-multi-tenancy.md` +
  `clone3/mcp-plugins-skills-connectors/mcp-context-forge/mcpgateway/plugins/__init__.py` · LOGIC:
  two-tier pack config — an immutable declarative base loaded at startup plus additive, selective
  per-context/session overrides — feeds the effective-set resolver instead of mutating manifests.
  · TARGET: this file §Capability-pack contract → **CAPABILITIES** §§3–4 (impl queued).
- **DIF-1** · `[improve]` · SOURCE: langgenius/dify-plugin-daemon (Apache-2.0) —
  `clone3/mcp-plugins-skills-connectors/dify-plugin-daemon/pkg/plugin_packager/signer/sign.go` · LOGIC:
  per-artifact detached signatures (zip-comment or sidecar `.sig`) verified against the skillstore Ed25519
  key at install make unsigned/tampered bundles a refusal, not a warning. · TARGET: this file §Skills /
  plugins → **everyaios-blueprint** skill store (impl queued).
- **DIF-3** · `[improve]` · SOURCE: langgenius/dify-plugin-daemon (Apache-2.0) —
  `clone3/mcp-plugins-skills-connectors/dify-plugin-daemon/internal/core/plugin_manager/installer.go` +
  `clone3/mcp-plugins-skills-connectors/dify-plugin-daemon/internal/core/plugin_manager/local_launch_test.go`
  (`TestEnsureLocalRuntimeFailureKeepsInstalledPackage`) · LOGIC: a runtime-start failure must never
  discard an installed pack — it lands as honestly `unverified` under evidence-gated readiness, never
  lost. · TARGET: this file §Skills / plugins → **everyaios-blueprint** install path (impl queued).
- **MCPM-2** · `[improve]` · SOURCE: mcpm.sh (MIT) —
  `clone3/mcp-plugins-skills-connectors/mcpm.sh/src/mcpm/profile/profile_config.py` · LOGIC:
  profiles-as-tags — pack membership is a tag query on one manifest, never a duplicate per-profile
  manifest — keeps the effective-set resolver the single shape of "what this context gets".
  · TARGET: this file §Capability-pack contract → **CAPABILITIES** §4 (impl queued).
- **OC-2** · `[improve]` · SOURCE: oomol-lab/open-connector (Apache-2.0) —
  `clone3/mcp-plugins-skills-connectors/open-connector/docs/credentials.md` · LOGIC: formalize the
  connection-identity runtime contract (`accountId`/`displayName`/`grantedScopes`, raw tokens never leave
  the vault) and make plaintext credential storage a hard error rather than a warned fallback.
  · TARGET: this file §Honest boundaries → **SECURITY** §5 + 03-BYOK-KEYRINGS §3.4 (secondary, cross-ref).

### Cross-presence pointer + recorded invariants

- **SEC-19 (pointer)** · `[pointer]` · SOURCE: genoffice (Apache-2.0) —
  `clone2/genoffice/apps/sheets/src/ai/privacy-policy.ts` · LOGIC: column-class egress policy
  (allow/redact/statistics-only/deny; columns default closed) must be enforced before any artifact reaches
  a connector. · TARGET: **→ SECURITY §5** (policy owner) **+ this file §Honest boundaries**
  (connector-facing half: no artifact egress to a connector outside an allowed column class — the policy
  text lives in SECURITY, this file records the enforcement point on the connector path).
- **§6 #5 (rejection register)** · `[invariant]` · **"the store catalog is what-to-show, never a
  permission."** — recorded invariant: **No new registries** — REG/CFG/OBS touch only the `store_catalog`
  show-list and the signed skillstore; Guard remains the only decider.

---

## Official MCP Registry Schema (Version 2025-12-11)

EveryAIOS adopts the canonical Model Context Protocol `server.json` schema:
```json
{
  "$schema": "https://modelcontextprotocol.io/schema/2025-12-11/server.json",
  "name": "com.github.modelcontextprotocol/github-server",
  "version": "1.4.2",
  "description": "Official GitHub MCP Server for repositories, issues, and PRs",
  "publisher": {
    "name": "GitHub Inc.",
    "ed25519_public_key": "MC4CAQAwBQYDK2VwBCIEIP..."
  },
  "distribution": {
    "type": "binary",
    "platforms": {
      "windows-x64": {
        "url": "https://github.com/modelcontextprotocol/servers/releases/download/v1.4.2/github-win-x64.zip",
        "sha256": "4b92ec84a7...",
        "bin": "github-mcp.exe",
        "args": ["--stdio"]
      }
    }
  }
}
```
- **Integrity Validation:** SHA-256 verification is mandatory before executing downloaded binary MCP servers.
- **Publisher Namespace Signature:** Server publishers are cryptographically proven via Ed25519 digital signatures.

## 5-Meta-Tool Catalog Scaling (`CON-4` / Open-Connector Pattern)

To prevent prompt context window exhaustion when hundreds of connector actions are available, `everyaios-mcp` exposes 5 meta-tools instead of dumping raw tool schemas into the prompt:

1. **`list_apps`:** Lists available connector applications (GitHub, Google Drive, Slack, Linear, Notion) and their connection states.
2. **`list_connections`:** Returns authenticated account identities (`accountId`, `grantedScopes`).
3. **`search_actions(query, app?)`:** Executes fast in-memory MiniSearch ranking over thousands of action descriptions.
4. **`get_action_guide(action_id)`:** Lazily fetches parameter schemas, usage examples, and required scopes only when the agent selects the action.
5. **`execute_action(action_id, params)`:** Dispatches the execution through `Guard -> Ticket -> Vault Outbound Proxy -> Receipt`.

## Proactive OAuth Token Refresh in Rust (`CON-2` / Nango Pattern)

To maintain long-lived connector sessions without exposing tokens to the TypeScript sidecar:
- **Rust-Only Custody:** 100% of OAuth `access_token` and `refresh_token` payloads reside exclusively in SQLCipher (`everyaios-vault`). Outbound authenticated HTTP requests are brokered through Rust.
- **15-Minute Expiration Buffer:** If `expires_at - now <= 900s`, the vault automatically triggers token refresh before dispatching the request.
- **Singleflight Promise Collapsing:** Concurrent tool calls targeting the same provider share a single active token refresh future, preventing duplicate refresh calls and provider rate-limiting.
- **30-Second Failure Cooldown:** If a refresh fails (e.g. temporary network drop), the provider enters a 30s cooldown before retrying, preventing runaway tight retry loops.

## Native Windows Everything Search Integration

For sub-millisecond local file discovery across multi-terabyte drives:
- **Loopback Search Client:** Rust connects to the Voidtools Everything search service via loopback HTTP (`127.0.0.1:47512`).
- **FILETIME Conversion:** Windows 64-bit `FILETIME` timestamps and NTFS attributes are converted directly into canonical `FileMetadata`.
- **Netfloor Isolation:** Everything HTTP connections are strictly confined to `127.0.0.1` and barred from external network egress.