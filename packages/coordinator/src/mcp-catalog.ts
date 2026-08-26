/**
 * P18-4 — Connector catalog seed (doc 70 §3/§5): the official/remote MCP
 * server set (Atlassian, GitHub, Google, Supabase, Cloudflare, Exa,
 * Firecrawl, DeepWiki, NotebookLM) + the popular-search SaaS names (Gmail,
 * Slack, Notion, Linear, Figma, Salesforce, Stripe, Sentry, Datadog,
 * Obsidian, n8n, Shopify) that seed the "MCP Servers" tab.
 *
 * Posture: every entry is **user-supplied and hosted** — none of these are
 * inbuilt. The seed is *discovery data* (what the tab lists); installing one
 * still goes through the P22 manager (Guard-2 install + sha-pin + vault-held
 * tokens). `inbuilt` is hard-coded `false` for every entry and validated, so
 * the seed can never drift into claiming a first-party engine.
 */

export type CatalogSource = "official" | "popular-saas";

export interface McpCatalogEntry {
  id: string;
  name: string;
  source: CatalogSource;
  /** All seed entries are hosted (user-supplied) — never inbuilt. */
  inbuilt: false;
  description: string;
  /** The install command shown in the tab (npx/uvx/remote URL). */
  install?: string;
  /** Registry URL for the official/remote set when known. */
  registry?: string;
}

/** The official/remote set (doc 70 §3 — 258 official remote servers). */
export const OFFICIAL_REMOTE: McpCatalogEntry[] = [
  { id: "atlassian", name: "Atlassian", source: "official", inbuilt: false, description: "Jira + Confluence issues, projects, pages, and teams", registry: "https://mcp.atlassian.com" },
  { id: "github", name: "GitHub", source: "official", inbuilt: false, description: "Repositories, issues, pull requests, and Actions", install: "npx @modelcontextprotocol/server-github", registry: "https://github.com/github/github-mcp-server" },
  { id: "google", name: "Google", source: "official", inbuilt: false, description: "Google Docs, Sheets, Drive, Gmail, and Calendar", registry: "https://developers.google.com/generative-ai/mcp" },
  { id: "supabase", name: "Supabase", source: "official", inbuilt: false, description: "Postgres schema, queries, and management", registry: "https://supabase.com/docs/guides/mcp" },
  { id: "cloudflare", name: "Cloudflare", source: "official", inbuilt: false, description: "Workers, KV, D1, R2, and account management", registry: "https://developers.cloudflare.com/agents/mcp" },
  { id: "exa", name: "Exa", source: "official", inbuilt: false, description: "Web search and content retrieval API", registry: "https://docs.exa.ai/mcp" },
  { id: "firecrawl", name: "Firecrawl", source: "official", inbuilt: false, description: "Web scraping, crawling, and extraction", registry: "https://docs.firecrawl.dev/mcp" },
  { id: "deepwiki", name: "DeepWiki", source: "official", inbuilt: false, description: "Codebase documentation on demand", registry: "https://deepwiki.com" },
  { id: "notebooklm", name: "NotebookLM", source: "official", inbuilt: false, description: "Source-grounded research notebooks", registry: "https://notebooklm.google.com" },
];

/** The popular-search SaaS names (doc 70 §5) — user-supplied, hosted. */
export const POPULAR_SAAS: McpCatalogEntry[] = [
  { id: "gmail", name: "Gmail", source: "popular-saas", inbuilt: false, description: "Mail read + compose via official APIs (approve-before-send)", install: "npx @gongshim/gmail-mcp-server" },
  { id: "slack", name: "Slack", source: "popular-saas", inbuilt: false, description: "Channels, threads, and messages" },
  { id: "notion", name: "Notion", source: "popular-saas", inbuilt: false, description: "Pages, databases, and search" },
  { id: "linear", name: "Linear", source: "popular-saas", inbuilt: false, description: "Issues, cycles, and projects" },
  { id: "figma", name: "Figma", source: "popular-saas", inbuilt: false, description: "Files, frames, and comments" },
  { id: "salesforce", name: "Salesforce", source: "popular-saas", inbuilt: false, description: "Records, objects, and reports" },
  { id: "stripe", name: "Stripe", source: "popular-saas", inbuilt: false, description: "Payments, customers, and subscriptions" },
  { id: "sentry", name: "Sentry", source: "popular-saas", inbuilt: false, description: "Issues, events, and projects" },
  { id: "datadog", name: "Datadog", source: "popular-saas", inbuilt: false, description: "Monitors, dashboards, and logs" },
  { id: "obsidian", name: "Obsidian", source: "popular-saas", inbuilt: false, description: "Local vault search and notes", install: "npx obsidian-mcp" },
  { id: "n8n", name: "n8n", source: "popular-saas", inbuilt: false, description: "Workflow automation triggers and executions" },
  { id: "shopify", name: "Shopify", source: "popular-saas", inbuilt: false, description: "Orders, products, and inventory" },
];

/** The full seed for the "MCP Servers" tab. */
export const CATALOG_SEED: McpCatalogEntry[] = [...OFFICIAL_REMOTE, ...POPULAR_SAAS];

/** Look up one seed entry. */
export function catalogEntry(id: string): McpCatalogEntry | undefined {
  return CATALOG_SEED.find((e) => e.id === id);
}

export type SeedVerdict =
  | { ok: true; count: number }
  | { ok: false; reasons: string[] };

/**
 * The seed can never drift into claiming first-party engines: every entry
 * must be `inbuilt: false` (hosted, user-supplied), have a non-empty id +
 * description, and a unique id. Install commands, when present, must be
 * recognized distributions — this reuses the P37 `installPlan` validator so
 * a seed entry can never carry a floating or arbitrary command.
 */
export function validateSeed(entries: McpCatalogEntry[]): SeedVerdict {
  const reasons: string[] = [];
  const seen = new Set<string>();
  for (const e of entries) {
    if (e.inbuilt !== false) {
      reasons.push(`${e.id}: claims inbuilt — seed entries are hosted`);
    }
    if (!e.id || !e.name || !e.description) {
      reasons.push(`${e.id ?? "?"}: missing id/name/description`);
    }
    if (seen.has(e.id)) {
      reasons.push(`${e.id}: duplicate id`);
    }
    seen.add(e.id);
  }
  if (reasons.length > 0) {
    return { ok: false, reasons };
  }
  return { ok: true, count: entries.length };
}
