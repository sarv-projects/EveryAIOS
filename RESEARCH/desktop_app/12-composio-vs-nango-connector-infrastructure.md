# 12 — Connector Infrastructure: Composio vs Nango (deep dive)

> Verified 2026-08-05 (GitHub API live + repo structure + docs).
> **This decides the connectors pillar (P5): how users connect Gmail/Slack/GitHub/etc. with their own keys.**

## Verified facts

| | Composio (`composiohq/composio`) | Nango (`NangoHQ/nango`) |
|---|---|---|
| Stars | **29.5K** | **11.4K** |
| Language | TS (core) + Python SDK | TS/Node |
| License | **MIT** (SDKs/monorepo) — hosted platform proprietary | **Elastic License 2.0** (source-available) |
| Active | pushed 2026-08-05 | pushed 2026-08-05 |
| What it is | **AI-agent tool execution platform**: 1,000+ toolkits (20K+ tools), tool search, context management, auth brokerage, MCP gateway, RPA | **Integration infrastructure**: OAuth manager + authenticated proxy + sync framework for 900+ APIs |
| Job | Turn SaaS APIs into agent-callable tools fast | Own OAuth flows, proxy calls, and scheduled data pulls yourself |
| Repo shape | `ts/` + `python/` + `packages/cli` + provider adapters (OpenAI, Anthropic, LangChain, LlamaIndex, CrewAI, AutoGen, Vercel…) | `packages/` (server, runner, ui, shared) + Docker images + `Dockerfile.self_hosted` |

## Composio — architecture & reality

- **Components:** `@composio/core` (TS SDK), `composio` (Python SDK), `composio CLI` (`curl -fsSL https://composio.dev/install | sh`), provider adapters (`@composio/langchain`, `-anthropic`, `-openai-agents`, `-crewai`, `-autogen`, `-vercel`…), plus `@composio/slim` for smaller installs.
- **Execution model:** default is **hosted** — `COMPOSIO_BASE_URL = connect.composio.dev`; the SDK session routes auth + API calls through Composio's cloud (keeps tokens safe server-side, handles refresh). Custom/local tools can run in-process or in a sandbox (`session.sandbox`). RPA/browser via browser-use + hyperbrowser toolkits.
- **Self-hosting reality:** ⚠️ **not fully self-hostable.** The monorepo is client SDKs + CLI + adapters. The server-side orchestration, auth-config registry, and hosted MCP gateway are proprietary (enterprise VPC = custom-quoted). So "self-hosted Composio" isn't a thing — it's *use the SDK/CLI against their cloud*.
- **MCP story (the key integration for us):** every session exposes `session.mcp.url` + headers → point any MCP client at `https://connect.composio.dev/mcp` with `x-consumer-api-key: <user's key>`. Also per-toolkit MCP servers from the dashboard. This is the **zero-maintenance BYOK path**: user pastes a Composio key, we attach as an MCP server.
- **Pricing (2026):** Free **20K tool calls/mo** (≈ $0); Starter $29/mo 200K calls; Growth $229/mo 2M; Enterprise custom (VPC/on-prem option exists but paid).

## Nango — architecture & reality

- **Primitives:** ① **Auth** — OAuth flows + token refresh + white-label Connect UI (`nango.openConnectUI()`); ② **Proxy** — `nango.get/post` injects credentials, handles rate limits/retries/SSRF protection; ③ **Sync & Functions** — scheduled TS functions pulling provider data into your DB + webhooks. 900+ APIs.
- **Stack:** Node/TS control plane + runner; **Postgres** (connections, records), **Redis/Valkey** (rate limits, refresh locks), **Elasticsearch** (audit logs), **S3-compatible** object storage (integration scripts). Tokens encrypted at rest (`NANGO_ENCRYPTION_KEY`).
- **License:** ELv2 — self-host freely for internal use, but can't resell as a managed integration service; some features (sync, webhooks, OTel) are Enterprise.
- **Self-host feasibility for a desktop app:** ✅ technically feasible (Docker images + docker-compose), but ⚠️ **each user must register their own OAuth app with each provider** (GitHub App, Google Cloud OAuth client…) and run Postgres/Redis — heavy friction. Great for **power users / pro tier**, not for default onboarding.

## Composio vs Nango — which job

| Need | Pick |
|---|---|
| "User pastes a key, gets 20+ SaaS tools working today" | **Composio** (managed auth, MCP endpoint, free 20K calls/mo) |
| "Fully local, sovereign, tokens in MY database" | **Nango self-hosted** (user registers own OAuth apps — power-user only) |
| Scheduled data pulls into a local RAG DB (issues, contacts, docs) | **Nango sync** (best-in-class) |
| Agent tool-calling ergonomics (native adapters, MCP) | **Composio** |
| Direct raw API proxying with full control | **Nango** |

**They're complementary, not substitutes** — Nango is API-infrastructure plumbing; Composio is agent-tool packaging. A serious product can run both.

## What's ALREADY BUILT in this repo

- `core-connectors/src/composio-catalog.ts` — **32 managed toolkits** mapped (Gmail, Drive, Calendar, Sheets, Docs, Tasks, Outlook, OneDrive, Teams, Instagram, FB, LinkedIn, Slack, Reddit, Discord, Notion, Todoist, Trello, ClickUp, Dropbox, GitHub, GitLab, Linear, Canva, Spotify, HubSpot, Salesforce, Zoom, Box, Browserbase, Zapier) + keyword scoring + cost tiers.
- `core-connectors/src/composio-adapter.ts` — thin `ConnectorAdapter`; delegates auth+execute to server via proxy (Connect Link authorize flow, `session.execute`).
- `packages/cloudflare-server/src/composio-proxy.ts` — CF Worker pass-through: `authorize | status | execute | list` → GCP Cloud Run (where the Composio SDK runs, since Worker can't run it).
- Flow today (mobile): **app → CF Worker → GCP Cloud Run → Composio hosted SDK**. Tokens live in Composio's cloud.

## Recommended desktop-app architecture (dual-path, user's own keys)

```
                        Desktop App
                            │
        ┌───────────────────┴───────────────────┐
        ▼                                       ▼
 PATH A: COMPOSIO (default)          PATH B: NANGO SELF-HOST (pro/power-user)
 ┌──────────────────────────┐       ┌──────────────────────────────┐
 │ User pastes COMPOSIO key │       │ User self-hosts Nango locally │
 │ (their own account, free │       │ (own Postgres/Redis),         │
 │  tier 20K calls/mo)      │       │ registers own OAuth apps      │
 │ → attach session.mcp.url │       │ → OAuth + proxy + sync        │
 │   as an MCP server       │       │   (scheduled pulls → local    │
 │   in the Tool Registry   │       │   RAG DB for GitHub/issues/   │
 │   (zero maintenance)     │       │   docs etc.)                  │
 └──────────────────────────┘       └──────────────────────────────┘
        └──────────────┬──────────────────────┘
                       ▼
            Unified Tool Registry (doc 10)
            → dual-guard permission classes
```

- **Path A is the default** (matches the product decision "users just paste their own Composio keys") — via the **MCP path** (doc 10), which keeps our maintenance at zero.
- **Path B is a Settings → Advanced toggle**: "local integration server (Nango)". Wire Nango's sync output into the existing `core-files` ingestion pipeline so synced data becomes RAG-queryable.
- Both register into the **Unified Tool Registry** with permission classes (`read-only / local-write / external-write / destructive`), gated by the dual-guard — a Composio `GMAIL_SEND_EMAIL` is an external-write like any other.

## Watch-outs

1. **Composio = cloud dependency.** Tool execution for managed toolkits routes through `connect.composio.dev`. Our local-first story must be honest: free search/RAG/agents are local; *SaaS connectors* (by their nature) go through the provider + Composio. Nothing else in the app depends on it.
2. **Nango ELv2** — fine for self-host internal use; don't ship Nango-Cloud as a resold service without checking terms.
3. **Rate math:** 20K Composio calls/mo free ≈ ~650/day — enough for personal use; heavy automation users hit Starter. Surface usage in the token/cost analytics panel.
4. **The existing mobile chain (CF→GCP→Composio)** can stay as-is for mobile; the desktop uses its own direct MCP path — don't force the mobile proxy topology onto the desktop.
