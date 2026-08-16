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
