//! P2.3 / P6.x — MCP tool-catalog Tauri command. Exposes the real 42-tool
//! registry (`everyaios-mcp`: 37 browser tools + 5 storage tools) to the
//! Connectors panel, so the "what tools does this OS ship" surface is live
//! data from the crate, not invented UI copy.

use everyaios_mcp::{all_tools, ToolDef};
use serde::Serialize;

/// One tool's serializable summary.
#[derive(Debug, Serialize)]
pub struct ToolInfo {
    pub name: String,
    pub kind: String,
    pub read_only: bool,
    pub open_world: bool,
    pub profile: String,
    pub description: String,
    pub args: usize,
}

/// The full catalog + aggregate counts (Connectors panel stats strip).
#[derive(Debug, Serialize)]
pub struct McpCatalog {
    pub total: usize,
    pub browser: usize,
    pub storage: usize,
    pub read_only: usize,
    pub open_world: usize,
    pub tools: Vec<ToolInfo>,
}

#[tauri::command]
pub fn mcp_catalog() -> McpCatalog {
    let tools: Vec<&ToolDef> = all_tools();
    McpCatalog {
        total: tools.len(),
        browser: everyaios_mcp::BROWSER_TOOLS.len(),
        storage: everyaios_mcp::STORAGE_TOOLS.len(),
        read_only: tools.iter().filter(|t| t.read_only).count(),
        open_world: tools.iter().filter(|t| t.open_world).count(),
        tools: tools
            .iter()
            .map(|t| ToolInfo {
                name: t.name.to_string(),
                kind: format!("{:?}", t.kind).to_lowercase(),
                read_only: t.read_only,
                open_world: t.open_world,
                profile: format!("{:?}", t.profile).to_lowercase(),
                description: t.description.to_string(),
                args: t.args.len(),
            })
            .collect(),
    }
}
