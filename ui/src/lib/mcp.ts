// P2.3 / P6.x — the real 42-tool MCP registry (`everyaios-mcp`: 37 browser +
// 5 storage tools) surfaced to the Connectors panel. Mirrors `mcp_cmds.rs`;
// in a plain-browser preview it returns a small demo so the tab is explorable.

import { inTauri, invoke } from "./tauri";

export interface ToolInfo {
  name: string;
  kind: string;
  read_only: boolean;
  open_world: boolean;
  profile: string;
  description: string;
  args: number;
}

export interface McpCatalog {
  total: number;
  browser: number;
  storage: number;
  read_only: number;
  open_world: number;
  tools: ToolInfo[];
}

export async function mcpCatalog(): Promise<McpCatalog> {
  if (!inTauri()) return demoCatalog();
  return invoke<McpCatalog>("mcp_catalog");
}

/** P11.5.8 — one known/attached MCP server row. */
export interface McpServerRow {
  name: string;
  status: "connected" | "disconnected";
  transport: "stdio" | "http" | "native";
  tools: number;
  desc: string;
}

/** P11.5.8 — the installed/user MCP servers list (replaces hardcoded rows). */
export async function mcpServers(): Promise<McpServerRow[]> {
  if (!inTauri()) return demoServers();
  return invoke<McpServerRow[]>("mcp_servers");
}

/** P11.5.8 — attach a user-supplied stdio MCP server + reconcile its tools. */
export async function mcpAttach(
  name: string,
  command: string,
  args: string[],
): Promise<{ name: string; tools: string[]; desc: string }> {
  if (!inTauri()) return { name, tools: ["mcp_tool_1"], desc: "demo attach" };
  return invoke("mcp_attach", { name, command, args });
}

/** Connect-Store — the curated "click → sign in → use" connector list. */
export interface StoreEntry {
  id: string;
  kind: "remote-mcp" | "connector";
  name: string;
  description: string;
  url: string | null;
  flow: "pkce" | "device-code" | "api-key";
  vaultProvider: string;
  toolHint: number;
  scopesPlain: string[];
  canMutate: boolean;
  indexesIntoMemory: boolean;
}

export async function storeCatalog(): Promise<StoreEntry[]> {
  if (!inTauri()) return demoStore();
  return invoke<StoreEntry[]>("store_catalog");
}

/** Start a remote-MCP OAuth 2.1 connect (discovery + PKCE) → auth URL. */
export async function mcpConnectStart(
  storeId: string,
): Promise<{ authUrl: string; state: string; redirectUri: string }> {
  if (!inTauri()) {
    return { authUrl: "https://example.com/oauth/authorize?demo=1", state: "demo", redirectUri: "http://127.0.0.1:0/oauth/callback" };
  }
  return invoke("mcp_connect_start", { storeId });
}

function demoStore(): StoreEntry[] {
  return [
    {
      id: "github",
      kind: "remote-mcp",
      name: "GitHub",
      description: "Repos, issues, PRs via the official GitHub MCP server.",
      url: "https://api.githubcopilot.com/mcp/",
      flow: "device-code",
      vaultProvider: "copilot",
      toolHint: 30,
      scopesPlain: ["Read your repositories, issues, and pull requests"],
      canMutate: true,
      indexesIntoMemory: false,
    },
    {
      id: "google-drive",
      kind: "remote-mcp",
      name: "Google Drive",
      description: "Read and write your Google Drive via the official Drive connector.",
      url: "https://mcp.googleapis.com/mcp/",
      flow: "pkce",
      vaultProvider: "google",
      toolHint: 12,
      scopesPlain: ["View your Google Drive file list and metadata"],
      canMutate: true,
      indexesIntoMemory: false,
    },
    {
      id: "microsoft-graph",
      kind: "remote-mcp",
      name: "Microsoft Graph",
      description: "Outlook mail, OneDrive, and Calendar via Microsoft Graph.",
      url: "https://mcp.microsoft.com/mcp/",
      flow: "pkce",
      vaultProvider: "microsoft",
      toolHint: 20,
      scopesPlain: ["Read your Outlook mail headers", "Read your OneDrive file list"],
      canMutate: true,
      indexesIntoMemory: false,
    },
  ];
}

function demoServers(): McpServerRow[] {
  return [
    { name: "EveryAIOS native (built-in)", status: "connected", transport: "native", tools: 42, desc: "37 browser + 5 storage tools" },
    { name: "GitHub MCP", status: "connected", transport: "stdio", tools: 18, desc: "Repo, issues, PRs" },
    { name: "Filesystem MCP", status: "connected", transport: "stdio", tools: 7, desc: "Read/write local files" },
  ];
}

function demoCatalog(): McpCatalog {
  const samples: ToolInfo[] = [
    { name: "click", kind: "edit", read_only: false, open_world: false, profile: "core", description: "Click an element by ref", args: 1 },
    { name: "snapshot", kind: "read", read_only: true, open_world: false, profile: "core", description: "Accessibility tree snapshot", args: 1 },
    { name: "navigate", kind: "fetch", read_only: false, open_world: true, profile: "network", description: "Navigate to a URL", args: 1 },
    { name: "type", kind: "edit", read_only: false, open_world: false, profile: "core", description: "Type text into an element", args: 2 },
    { name: "disk_scan", kind: "read", read_only: true, open_world: false, profile: "all", description: "Scan a directory tree", args: 1 },
  ];
  return {
    total: samples.length,
    browser: 37,
    storage: 5,
    read_only: 2,
    open_world: 1,
    tools: samples,
  };
}
