//! P2.3 / P6.x — MCP tool-catalog Tauri command. Exposes the real 42-tool
//! registry (`everyaios-mcp`: 37 browser tools + 5 storage tools) to the
//! Connectors panel, so the "what tools does this OS ship" surface is live
//! data from the crate, not invented UI copy.

use everyaios_mcp::{all_tools, ToolDef};
use serde::Serialize;
use std::io::{Read, Write};
use std::net::TcpListener;

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

// ---------------------------------------------------------------------------
// Remote MCP + OAuth 2.1 (ARCH/15 Tier 2) — the Connect Store's "Connect"
// button: discovery → dynamic client registration → PKCE loopback → token.
// ---------------------------------------------------------------------------

/// In-flight PKCE state for one store id (kept in the shell between the
/// `mcp_connect_start` browser-open and the loopback callback).
#[derive(Debug, Clone)]
pub struct RemoteFlowState {
    pub target: everyaios_mcp::RemoteTarget,
    pub flow: everyaios_mcp::PkceFlow,
    pub redirect_uri: String,
}

fn store_url(store_id: &str) -> Result<String, String> {
    let store = everyaios_mcp::StoreIndex::bundled();
    let entry = store
        .get(store_id)
        .ok_or_else(|| format!("store entry `{store_id}` not found"))?;
    entry
        .url
        .clone()
        .ok_or_else(|| format!("`{store_id}` is not a remote MCP server"))
}

/// Start a remote-MCP connect: discovery + dynamic client registration +
/// PKCE authorize URL. The UI opens `authUrl` in the system browser; the
/// loopback callback (thread spawned here) exchanges the code and stores the
/// bearer token in the shell.
#[tauri::command]
pub fn mcp_connect_start(
    state: tauri::State<'_, crate::AppState>,
    store_id: String,
) -> Result<serde_json::Value, String> {
    let url = store_url(&store_id)?;
    let http = everyaios_mcp::UreqTransport;
    let target = everyaios_mcp::connect(&url, &http).map_err(|e| e.to_string())?;

    // Bind a loopback listener to get the real redirect port.
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let redirect = format!("http://127.0.0.1:{port}/oauth/callback");
    let flow = everyaios_mcp::build_authorize_url(&target, &redirect).map_err(|e| e.to_string())?;

    let flow_state = RemoteFlowState {
        target: target.clone(),
        flow: flow.clone(),
        redirect_uri: redirect.clone(),
    };
    {
        let mut flows = state
            .mcp_remote_flows
            .lock()
            .map_err(|e| e.to_string())?;
        flows.insert(store_id.clone(), flow_state);
    }

    // The callback thread: accept once, exchange the code, store the token.
    let store_c = store_id.clone();
    let flow_c = flow.clone();
    let target_c = target.clone();
    let redirect_c = redirect.clone();
    let tokens = std::sync::Arc::clone(&state.mcp_remote_tokens);
    let vault = std::sync::Arc::clone(&state.vault);
    std::thread::spawn(move || {
        let _ = listener.set_nonblocking(false);
        if let Ok((mut stream, _)) = listener.accept() {
            let mut buf = [0u8; 4096];
            let n = stream.read(&mut buf).unwrap_or(0);
            let req = String::from_utf8_lossy(&buf[..n]);
            let (code, st) = parse_callback(&req);
            let body = if let (Some(code), Some(st)) = (code, st) {                        if st == flow_c.state {
                            match everyaios_mcp::exchange_code(
                                &target_c,
                                &flow_c,
                                &code,
                                &everyaios_mcp::UreqTransport,
                            ) {
                        Ok(tok) => {
                            if let Ok(mut t) = tokens.lock() {
                                t.insert(store_c.clone(), tok.access_token.clone());
                            }
                            // Persist at rest (item: remote tokens in vault keyring),
                            // so a restart keeps the connection. Best-effort.
                            if let Ok(v) = vault.lock() {
                                let _ = everyaios_vault::oauth::OAuthManager::new(&v)
                                    .store_connector_token(
                                        "remote-mcp",
                                        &store_c,
                                        &tok.access_token,
                                        tok.refresh_token.as_deref(),
                                        tok.expires_in,
                                        &tok.scope,
                                    );
                            }
                            "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n<html><body>EveryAIOS connected. You can close this tab.</body></html>".to_string()
                        }
                        Err(_) => {
                            "HTTP/1.1 400 Bad Request\r\nContent-Type: text/plain\r\n\r\noauth exchange failed".to_string()
                        }
                    }
                } else {
                    "HTTP/1.1 400 Bad Request\r\n\r\nstate mismatch".to_string()
                }
            } else {
                "HTTP/1.1 400 Bad Request\r\n\r\nmissing code".to_string()
            };
            let _ = stream.write_all(body.as_bytes());
        }
        let _ = redirect_c;
    });

    Ok(serde_json::json!({
        "authUrl": flow.auth_url,
        "state": flow.state,
        "redirectUri": redirect,
    }))
}

/// Resolve a remote token: in-memory first (this session), then the vault
/// keyring (persisted across restarts). Returns the access token or None.
pub fn remote_access_token(
    state: &tauri::State<'_, crate::AppState>,
    store_id: &str,
) -> Option<String> {
    if let Ok(tokens) = state.mcp_remote_tokens.lock() {
        if let Some(t) = tokens.get(store_id) {
            return Some(t.clone());
        }
    }
    // Persisted connection from a previous run.
    if let Ok(v) = state.vault.lock() {
        let mgr = everyaios_vault::oauth::OAuthManager::new(&v);
        if let Ok(Some(t)) = mgr.load_connector_token("remote-mcp", store_id) {
            return Some(t);
        }
    }
    None
}

/// Status: is a remote store entry connected (has a token)?
/// Checks the in-memory session map first, then the vault keyring.
#[tauri::command]
pub fn mcp_remote_status(
    state: tauri::State<'_, crate::AppState>,
    store_id: String,
) -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({
        "connected": remote_access_token(&state, &store_id).is_some(),
    }))
}

/// Run one JSON-RPC call against a connected remote MCP server (tools/list,
/// tools/call, …).
#[tauri::command]
pub fn mcp_remote_call(
    state: tauri::State<'_, crate::AppState>,
    store_id: String,
    method: String,
    params: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let url = store_url(&store_id)?;
    let token = remote_access_token(&state, &store_id)
        .ok_or_else(|| format!("`{store_id}` is not connected"))?;

    // Reconnect (discovery + dynamic registration) — the registered client is
    // per-instance; a fresh connect is the honest way to get a target.
    let http = everyaios_mcp::UreqTransport;
    let target = everyaios_mcp::connect(&url, &http).map_err(|e| e.to_string())?;
    let resp = everyaios_mcp::rpc(&target, &token, &method, params, &http)
        .map_err(|e| e.to_string())?;
    Ok(resp)
}

/// One remote tool's serializable description (drawn from a connected MCP
/// server's `tools/list`), shaped like the native catalog so it can be merged
/// into the same Connectors-panel list.
#[derive(Debug, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteToolInfo {
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub input_schema: serde_json::Value,
}

/// Fetch `tools/list` from a connected remote MCP server and return the
/// tools as rows the connector panel can render (item: merge connected tools
/// into the agent catalog surface).
#[tauri::command]
pub fn mcp_remote_tools(
    state: tauri::State<'_, crate::AppState>,
    store_id: String,
) -> Result<Vec<RemoteToolInfo>, String> {
    let url = store_url(&store_id)?;
    let token = remote_access_token(&state, &store_id)
        .ok_or_else(|| format!("`{store_id}` is not connected"))?;
    let http = everyaios_mcp::UreqTransport;
    let target = everyaios_mcp::connect(&url, &http).map_err(|e| e.to_string())?;
    let resp = everyaios_mcp::rpc(&target, &token, "tools/list", serde_json::json!({}), &http)
        .map_err(|e| e.to_string())?;
    let tools = resp
        .get("result")
        .and_then(|r| r.get("tools"))
        .and_then(|t| t.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|t| {
                    serde_json::from_value::<RemoteToolInfo>(t.clone()).ok()
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    Ok(tools)
}

fn parse_callback(req: &str) -> (Option<String>, Option<String>) {
    // GET /oauth/callback?code=…&state=… HTTP/1.1
    let line = req.lines().next().unwrap_or("");
    let path = line.split(' ').nth(1).unwrap_or("");
    let (_, query) = path.split_once('?').unwrap_or((path, ""));
    let mut code = None;
    let mut state = None;
    for kv in query.split('&') {
        if let Some((k, v)) = kv.split_once('=') {
            match k {
                "code" => code = Some(v.to_string()),
                "state" => state = Some(v.to_string()),
                _ => {}
            }
        }
    }
    (code, state)
}
