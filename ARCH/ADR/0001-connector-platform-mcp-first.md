# ADR-0001 — MCP is the connector platform; no third-party aggregator

- **Status:** accepted
- **Date:** 2026-08-16
- **Applies to:** `DESKTOP-APP-SPEC.md` §0 F-series, `ARCH/09`, `TODO.md` F-series tasks
- **Supersedes:** the earlier Composio / Zapier / Nango aggregator chain (removed)

## Decision

**MCP is the platform — no third-party aggregator.** Composio/Zapier/Nango are
cloud SaaS that hold OAuth tokens on *their* servers, which contradicts the
zero-founder-server/local-vault promise. In 2026 every connector we care about
(Gmail, Slack, GitHub, Linear, Notion, Postgres…) ships an official MCP server.

The connectors surface is therefore three things:

1. **MCP Servers** — user-supplied, run locally via stdio/`npx` or user-hosted
   HTTP; tools surfaced from the live catalog.
2. **Native** — first-party BYO OAuth/API-key where a local integration is
   warranted; tokens in the SQLCipher vault.
3. **Tool Catalog** — the live `everyaios-mcp` registry.

The Composio/Zapier/Nango tabs are removed.

## Consequences

- Connector tasks in `TODO.md` were reworded from aggregator-chain to
  MCP-first equivalents (see the "MCP-first" inline notes).
- The hub routing order is native → MCP servers → Auth Bridge.
- New external connectors are added as MCP server consumers, not bespoke
  aggregator integrations.
