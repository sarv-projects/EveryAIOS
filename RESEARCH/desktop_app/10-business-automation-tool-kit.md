# 10 — Business-Automation Tool-Kit, Composio & MCP Ecosystem

> Verified 2026-08-05 (GitHub API — stars live; several numbers in the original paste were wrong and are corrected here).

## The "10 tools" paste — verified verdicts (what's real, what to steal)

| Repo | Stars (live) | Verdict | What to steal |
|---|---|---|---|
| affaan-m/ECC | **238K** | Real, biggest agent-harness repo | Plan-before-build + verification gates + AgentShield session scanning (also doc 09) |
| HKUDS/Vibe-Trading | **29.8K** | Real, genuinely deep | Data-loader error handling + financial guardrails (validate OHLC before any calc) |
| heygen-com/hyperframes | **39.6K** | Real (Apache-2.0, HeyGen) | **HTML→video rendering** — agent can emit animated video reports/walkthroughs natively |
| Fincept-Corporation/FinceptTerminal | **29.8K** | Real (C++!) | Unified plugin-connector architecture: 100+ heterogeneous data connectors → one consistent stream. Reference for our tool registry |
| Anil-matcha/Open-Generative-AI | **25.6K** | Real, wrapper-heavy | Multi-model adapter router with fallback between image/video backends |
| The-Swarm-Corporation/AutoHedge | **4.1K** | Real but hype (real money risk) | Director→Quant→Risk→Execution agent pipeline (separate reasoning from execution) |
| cloudflare/agentic-inbox | **6.7K** | Real (Cloudflare Workers) | Edge-worker isolation for untrusted parsing; AI email triage/draft (approve-before-send) |
| nowork-studio/toprank → notfair | ~3.8K | Real, local-first | **Goal↔metric binding contract**: agent can't judge its own success; metrics verified mechanically at source before next plan |
| mksglu/context-mode (ClawRouter) | ~1.8K | Real | **Context sliding-window trimmer** that keeps code syntax while dropping stale tool output — same idea as Reasonix `tool_result_snip_ratio` (doc 05) |
| jo-inc/camofox-browser | ~2.5K | Real (Camoufox C++ fork) | a11y snapshots ~90% token reduction (doc 06) |
| AgriciDaniel/claude-ads | ~1.4K | Real (Claude skill) | **Capability-gated state-mutation**: read-only by default, structured diff + human approval before any external write — the dual-guard pattern in the wild |

## Composio (2026, verified — deep dive in doc 12)

> **This section is superseded by `12-composio-vs-nango-connector-infrastructure.md`** (repo-level architecture, self-hosting reality, MCP path, Nango comparison, and what's already built in this repo). Key updates from doc 12: Composio is **MIT-licensed SDKs, 29.5K⭐**, hosted platform proprietary (not self-hostable), free tier 20K calls/mo, and the recommended desktop integration is the **MCP path with the user's own key**.

- **Scale:** 1,000+ pre-authenticated toolkits / 20,000+ tools (GitHub, Gmail, Slack, Notion, Linear…). Agent "OS" layer: stateful per-user sessions, dynamic tool discovery (fetch only relevant tools to save context), credential brokerage.
- **Three integration paths for a desktop app:**
  1. **Local sidecar SDK** (Python/JS SDK runs in our Node sidecar; sessions + loopback IPC to UI) — best for local agent logic.
  2. **Hosted MCP endpoint** (`session.mcp.url` over Streamable HTTP) — zero local weight, auth managed remotely.
  3. **Local MCP bridge** (`mcp-client` wrapper) — treat Composio as a managed remote MCP server.
- **BYOK reality:** Composio is cloud-hosted for OAuth orchestration, but the SDK executes locally and can bridge local MCP servers. Users paste their **own** Composio key — matches the product decision ("users paste their own composio keys").

## MCP ecosystem (2026, verified)

- ~**9,650 server records** in the official registry (~30K version records); **10,000+ active public MCP servers**; **97M+ monthly SDK downloads**; 15K+ GitHub repos tagged `mcp-server`. This is the plugin standard — non-negotiable to be an MCP host.
- Claude Desktop/Cursor host servers via `claude_desktop_config.json` spawning stdio subprocesses or connecting HTTP/SSE — the pattern our coordinator replicates (`core-search/mcp-client.ts` exists; extend to a full managed MCP host with per-server supervision + permission prompts).
- n8n/Zapier/Make now expose agent + MCP surfaces. Steal: **event-driven triggers** ("when file changes / webhook fires") and the **OAuth connection-card UX**.
- **Zapier OSS deep-dive → doc 13** (verified 2026-08-05): org has 298 repos; key: `zapier/zapier-mcp` (372⭐, hosted MCP `mcp.zapier.com/api/v1/connect` → governed access to 9,000+ apps), `zapier/sdk` (242⭐, `@zapier/zapier-sdk` with `create-connection`/`run-action`), `zapier/connectors` (113⭐ prototype, ELv2, **one folder → agentskills.io skill + TS module + CLI + local stdio MCP**, `connectionResolvers` support user-held creds), `zapier/AutomationBench` (178⭐, 600-task business-workflow benchmark — our future eval harness), plus the **`llms.txt`** capability-index pattern. The Connector Hub (doc 13) treats Zapier as a third engine alongside Composio + Nango.

## Unified Tool Registry — the architecture that holds BYOK + Composio + MCP together

```
               ┌───────────────────────────────┐
               │   Agent Runtime (sidecar)     │
               └──────────────┬────────────────┘
                ┌─────────────┼─────────────┐
                ▼             ▼             ▼
         ┌────────────┐ ┌────────────┐ ┌────────────┐
         │ BYOK       │ │ Composio   │ │ MCP client │
         │ adapters   │ │ bridge     │ │ (local     │
         │ (direct    │ │ (user key, │ │ stdio +    │
         │  REST +    │ │ SDK or     │ │ remote     │
         │  vault)    │ │ MCP URL)   │ │ HTTP/SSE)  │
         └────────────┘ └────────────┘ └────────────┘
                └─────────────┼─────────────┘
                     ToolRegistry (normalized ToolDefinition:
                     name/description/parameters/execute)
                              ▼
                  Dual-guard gates (permission per tool class,
                  human-in-the-loop for writes/destructive)
```

1. **One normalized `ToolDefinition` schema** — every tool (BYOK script, Composio, MCP server, built-in) registers into the same registry; the LLM sees a flat list.
2. **Keys never reach the LLM** — vault (existing `core-providers/vault.ts`) + Vellum-style CES executor (doc 08) for high-risk tools.
3. **Permission class per tool** — `read-only / local-write / external-write / destructive`; trust-ladder + confirmation cards gate the top classes regardless of tool origin.
4. **Supervised lifecycle** — each MCP server/Composio bridge runs as a supervised child process (doc 03): crash → restart w/ backoff, dead-target registry, `reconnecting` state.
