//! P44.7/44.8 — Discovery surface + routing-feed Tauri wiring.
//!
//! `discovery_inventory` aggregates every managed-resource class into one
//! surface: providers come from the catalog registry; MCP servers, skills,
//! local models, browsers and agents are collected from their live on-disk /
//! runtime sources. Auth is reported as a *shape*, never a secret — discovery
//! never harvests credentials.
//!
//! `routing_feed_decide` exposes the P44.8 provider-level route decision
//! (verified capabilities + health → ranked providers) so the UI can show
//! *why* a provider is or isn't a route candidate, and so the value is
//! test-observable end to end.

use std::path::PathBuf;

use everyaios_catalog::{
    base_registry, DiscoveryInventory, Health, ManagedResource, ResourceCard, ResourceKind,
    RouteRequirements, RoutingFeed,
};

/// Build the full Discover inventory. Providers from the registry; the other
/// classes from their live collectors (best-effort, honest empties).
#[tauri::command]
pub fn discovery_inventory() -> Result<serde_json::Value, String> {
    let reg = base_registry();
    let mut inv = DiscoveryInventory::from_registry(&reg, 1);

    let data_dir = everyaios_core::default_data_dir();
    inv.extend(collect_local_models());
    inv.extend(collect_installed_mcp(&data_dir));
    inv.extend(collect_installed_skills(&data_dir));
    inv.extend(collect_agents(&data_dir));
    inv.extend(collect_browsers());

    let counts = inv.counts();
    Ok(serde_json::json!({
        "counts": counts,
        "cards": inv.cards,
        "generation": inv.generation,
    }))
}

/// P44.8 — the provider-level route decision for a set of requirements. Loads
/// the registry into a fresh feed and ranks; health is Unknown until live
/// observations are wired (honest — the decision reports the health it has).
#[tauri::command]
pub fn routing_feed_decide(
    requires_tools: Option<bool>,
    requires_structured_output: Option<bool>,
    requires_codex: Option<bool>,
) -> Result<serde_json::Value, String> {
    let reg = base_registry();
    let mut feed = RoutingFeed::new();
    feed.load_registry(&reg);
    // Mark every provider Healthy-by-default so the decision is meaningful in
    // the absence of live pings; a real observation feed overrides per-id.
    for p in reg.all() {
        feed.set_health(&p.id, Health::Unknown);
    }
    let decision = feed.decide(&RouteRequirements {
        requires_tools: requires_tools.unwrap_or(false),
        requires_structured_output: requires_structured_output.unwrap_or(false),
        requires_codex: requires_codex.unwrap_or(false),
    });
    serde_json::to_value(&decision).map_err(|e| e.to_string())
}

// --- live collectors (best-effort, never harvest secrets) ------------------

fn collect_local_models() -> Vec<ResourceCard> {
    let cfg = everyaios_core::Config::load().unwrap_or_default();
    let mgr = everyaios_core::LocalManager::from_config(&cfg);
    mgr.list_ollama_models()
        .into_iter()
        .map(|m| ResourceCard {
            kind: ResourceKind::Model,
            id: format!("ollama/{}", m.name),
            name: m.name,
            version: String::new(),
            source: "local_runtime".into(),
            auth: "keyless".into(),
            capabilities: vec![format!("ctx:{}", m.context_window)],
            capabilities_verified: true, // locally observed
            governance: "local".into(),
            status: ManagedResource::Healthy,
        })
        .collect()
}

fn collect_installed_mcp(data_dir: &PathBuf) -> Vec<ResourceCard> {
    let dir = data_dir.join("mcp");
    std::fs::read_dir(&dir)
        .map(|rd| {
            rd.flatten()
                .filter(|e| e.path().is_dir())
                .map(|e| {
                    let id = e.file_name().to_string_lossy().into_owned();
                    ResourceCard {
                        kind: ResourceKind::Mcp,
                        id: id.clone(),
                        name: id,
                        version: String::new(),
                        source: "installed".into(),
                        auth: "none".into(),
                        capabilities: vec![],
                        capabilities_verified: false,
                        governance: String::new(),
                        status: ManagedResource::Installed,
                    }
                })
                .collect()
        })
        .unwrap_or_default()
}

fn collect_installed_skills(data_dir: &PathBuf) -> Vec<ResourceCard> {
    let dir = data_dir.join("skills");
    std::fs::read_dir(&dir)
        .map(|rd| {
            rd.flatten()
                .filter(|e| e.path().is_dir())
                .map(|e| {
                    let id = e.file_name().to_string_lossy().into_owned();
                    ResourceCard {
                        kind: ResourceKind::Skill,
                        id: id.clone(),
                        name: id,
                        version: String::new(),
                        source: "store".into(),
                        auth: "none".into(),
                        capabilities: vec![],
                        capabilities_verified: false,
                        governance: String::new(),
                        status: ManagedResource::Installed,
                    }
                })
                .collect()
        })
        .unwrap_or_default()
}

fn collect_agents(data_dir: &PathBuf) -> Vec<ResourceCard> {
    // The inbuilt agent is always present; on-disk bundles live under agents/.
    let mut cards = vec![ResourceCard {
        kind: ResourceKind::Agent,
        id: "inbuilt".into(),
        name: "EveryAIOS".into(),
        version: env!("CARGO_PKG_VERSION").into(),
        source: "builtin".into(),
        auth: "none".into(),
        capabilities: vec!["chat".into(), "tools".into(), "plan".into()],
        capabilities_verified: true,
        governance: "inbuilt".into(),
        status: ManagedResource::Healthy,
    }];
    let dir = data_dir.join("agents");
    if let Ok(rd) = std::fs::read_dir(&dir) {
        for e in rd.flatten().filter(|e| e.path().is_dir()) {
            let id = e.file_name().to_string_lossy().into_owned();
            cards.push(ResourceCard {
                kind: ResourceKind::Agent,
                id: id.clone(),
                name: id,
                version: String::new(),
                source: "bundle".into(),
                auth: "none".into(),
                capabilities: vec![],
                capabilities_verified: false,
                governance: "custom".into(),
                status: ManagedResource::Installed,
            });
        }
    }
    cards
}

fn collect_browsers() -> Vec<ResourceCard> {
    // Dependency-light discovery of installed browsers (same probe order as
    // doctor). We only report presence — never a profile or a cookie.
    const CANDS: &[(&str, &[&str])] = &[
        ("chrome", &["google-chrome", "google-chrome-stable", "chrome"]),
        ("chromium", &["chromium", "chromium-browser"]),
        ("edge", &["msedge", "microsoft-edge"]),
        ("brave", &["brave-browser"]),
    ];
    let path = std::env::var("PATH").unwrap_or_default();
    let sep = if cfg!(windows) { ';' } else { ':' };
    let dirs: Vec<&str> = path.split(sep).collect();
    let mut out = Vec::new();
    for (id, names) in CANDS {
        let found = names.iter().any(|n| {
            dirs.iter().any(|d| {
                let mut p = PathBuf::from(d);
                p.push(n);
                p.is_file() || {
                    p.set_extension("exe");
                    p.is_file()
                }
            })
        });
        if found {
            out.push(ResourceCard {
                kind: ResourceKind::Browser,
                id: id.to_string(),
                name: id.to_string(),
                version: String::new(),
                source: "system".into(),
                auth: "none".into(),
                capabilities: vec!["cdp".into()],
                capabilities_verified: true,
                governance: String::new(),
                status: ManagedResource::Healthy,
            });
        }
    }
    out
}
