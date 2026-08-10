# 07 · Composio Deep-Dive + Our Existing Integration

> Research: Composio (composio.dev, github.com/ComposioHQ/composio) for per-user-key desktop integration.

---

## 1. What Composio IS (2026)

- **Tool/connector platform** + **Universal MCP Gateway**. 1,000+ app connectors (Gmail, Drive,
  Calendar, Slack, Notion, GitHub, Linear, Trello, Dropbox, Spotify, Reddit, Todoist, Facebook,
  LinkedIn, Canva, ...). 
- Manages **OAuth for you** — no CASA audit, no Google Cloud project, no Meta App Review.
- Products: Composio Gateway, Composio Cloud, open-source SDK (`@composio/core` / Python SDK).
- **Key 2026 fact:** it's now an MCP Gateway too — so per-user Composio gives managed OAuth **and**
  MCP endpoints simultaneously.

## 2. Pricing / Free tier

- **Free tier:** ~20K tool calls/month, **unlimited connected accounts**.
- Paid: ~$29/mo.
- **Each user needs their own Composio API key** — exactly our design: users paste their own key.

## 3. Self-host vs cloud

- Partially self-hostable (open-source SDK + core), but managed auth is cloud-dependent.
- For our app: desktop runs `@composio/core` in the app's main process → Composio Cloud, using the
  user's own key. OAuth connect = Composio Connect popup.

## 4. What We Already Have (verified in codebase)

- `packages/core-connectors/src/composio-catalog.ts` — **31-32 curated managed toolkits**
- `composio-adapter.ts` — thin delegation layer
- `connection-manager.ts` — connection lifecycle
- `ComposioOrchestrator` — 3-lane (A/B/C) with per-user metering from Composio org pool, 20% paying floor
- `@composio/core` **v0.14.0** in pnpm-lock (SDK installed)
- Server chain: Mobile → CF Worker `/v1/connectors/composio/*` → Cloud Run `/v1/composio/*` → Composio SDK

**The desktop change — it gets simpler, not harder:**
```
MOBILE (current):  Mobile → CF Worker proxy → Cloud Run → @composio/core → Composio Cloud
DESKTOP (new):     App (Node main process) ──> @composio/core ──> Composio Cloud
                   (user's own COMPOSIO_API_KEY pasted in Settings)
```
The mobile path needed the proxy chain because RN can't run the SDK + we wanted server-side key
custody. On desktop the SDK runs directly in the app's main process — the adapter + catalog are pure
TS and work unchanged. User pastes their key → in-app "Connect Gmail/Slack/Notion" buttons →
tools execute locally.

## 5. Composio vs plain MCP — the honest split

| Layer | Role |
|---|---|
| **Composio** | the 30-50 managed SaaS connectors (solves the N×M OAuth nightmare) |
| **Plain MCP servers** | local/niche tools (filesystem, DB, custom) — free, no account |
| **Our ConnectorOrchestrator** | unifies both under one abstraction (already exists) |

## 6. Docs references

- `docs/deep-dives/20-composio-integration.md` — full integration deep dive
- `PRODUCTION-LIFECYCLE.md` — Composio setup steps (sign up free, create API key, store as secret)
- Zero-auth connectors (Weather, RSS, Wikipedia) stay direct — no Composio needed.
