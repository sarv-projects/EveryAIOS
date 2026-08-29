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

/// P11.5.8 — one known/attached MCP server row for the Connectors panel.
#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerRow {
    pub name: String,
    pub status: String, // connected | disconnected
    pub transport: String, // stdio | http
    pub tools: usize,
    pub desc: String,
}

/// P11.5.8 — the installed/user MCP servers list: the built-in catalog
/// (native, always connected) + user-attached stdio servers tracked in the
/// shell. Replaces the hardcoded `MCP_SERVERS` rows in connectors-panel.tsx.
#[tauri::command]
pub fn mcp_servers(
    state: tauri::State<'_, crate::AppState>,
) -> Result<Vec<McpServerRow>, String> {
    let catalog = mcp_catalog();
    let mut rows = vec![McpServerRow {
        name: "EveryAIOS native (built-in)".into(),
        status: "connected".into(),
        transport: "native".into(),
        tools: catalog.total,
        desc: format!("{} browser + {} storage tools", catalog.browser, catalog.storage),
    }];
    let attached = state
        .mcp_servers
        .lock()
        .map_err(|e| e.to_string())?;
    for (name, info) in attached.iter() {
        rows.push(McpServerRow {
            name: name.clone(),
            status: "connected".into(),
            transport: info.transport.clone(),
            tools: info.tools,
            desc: info.desc.clone(),
        });
    }
    Ok(rows)
}

/// Connect-Store — the curated "click → sign in → use" connector list.
/// Remote MCP servers + flat OAuth connectors, each with the Guard-2
/// consent payload the UI must render before the flow runs. This is the
/// ChatGPT-connector-equivalent surface: a short vetted index, not a
/// settings form.
#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StoreRow {
    pub id: String,
    pub kind: String, // remote-mcp | connector
    pub name: String,
    pub description: String,
    pub url: Option<String>,
    pub flow: String, // pkce | device-code | api-key
    pub vault_provider: String,
    pub tool_hint: u32,
    pub scopes_plain: Vec<String>,
    pub can_mutate: bool,
    pub indexes_into_memory: bool,
}

#[tauri::command]
pub fn store_catalog() -> Vec<StoreRow> {
    use everyaios_mcp::{StoreIndex, StoreKind};
    StoreIndex::bundled()
        .entries()
        .into_iter()
        .map(|e| StoreRow {
            id: e.id.clone(),
            kind: match e.kind {
                StoreKind::RemoteMcp => "remote-mcp".into(),
                StoreKind::Connector => "connector".into(),
            },
            name: e.name.clone(),
            description: e.description.clone(),
            url: e.url.clone(),
            flow: match e.flow {
                everyaios_mcp::ConnectFlow::Pkce => "pkce".into(),
                everyaios_mcp::ConnectFlow::DeviceCode => "device-code".into(),
                everyaios_mcp::ConnectFlow::ApiKey => "api-key".into(),
            },
            vault_provider: e.vault_provider.clone(),
            tool_hint: e.tool_hint,
            scopes_plain: e.consent.scopes_plain.clone(),
            can_mutate: e.consent.can_mutate,
            indexes_into_memory: e.consent.indexes_into_memory,
        })
        .collect()
}

/// P11.5.8 — attach a user-supplied MCP server (stdio) and reconcile its
/// tools into the unified catalog (native wins on name collisions). The
/// exact-command consent is a Guard-2 card in the UI before this is called.
#[tauri::command]
pub fn mcp_attach(
    state: tauri::State<'_, crate::AppState>,
    name: String,
    command: String,
    args: Vec<String>,
) -> Result<serde_json::Value, String> {
    use everyaios_mcp::attach::AttachedServer;
    let arg_refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    let server = AttachedServer::spawn(&command, &arg_refs).map_err(|e| e.to_string())?;
    let tools = server.tools.clone();
    let desc = format!("user-supplied: {} {}", command, args.join(" "));
    // Keep the child alive for the session (the live map owns it; dropping
    // the map entry on shutdown kills the child).
    let mut live = state
        .mcp_live
        .lock()
        .map_err(|e| e.to_string())?;
    live.insert(name.clone(), server);
    drop(live);
    let mut attached = state
        .mcp_servers
        .lock()
        .map_err(|e| e.to_string())?;
    attached.insert(
        name.clone(),
        McpServerRow {
            name: name.clone(),
            status: "connected".into(),
            transport: "stdio".into(),
            tools: tools.len(),
            desc: desc.clone(),
        },
    );
    Ok(serde_json::json!({
        "name": name,
        "tools": tools,
        "desc": desc,
    }))
}
