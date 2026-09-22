//! P31 — agent-registry Tauri commands. The `everyaios-agents` crate owns
//! the durable store (`~/.everyaios/agents/<id>/agent.toml`); these commands
//! expose list / save / get / remove / disable / duplicate so the P31
//! builder UI talks to the real registry instead of browser-local state.
//!
//! Fail-closed: unknown ids and invalid TOML are errors, never silently
//! ignored; ids are always re-derived from the bundle name by the crate
//! (`slug`), never trusted from the caller.
//!
//! P69.D1 — `agent_directory_list` is the single read façade. The ACP launch
//! registry, the bundled registry index and the local bundle store are all
//! *sources*; `everyaios_agents::AgentDirectory` composes them into one
//! canonical record set so the UI never keeps a parallel agent map.

use std::sync::Arc;

use everyaios_agents::{AgentDirectory, AgentDirectoryEntry, AgentSource};
use everyaios_core::tools::AgentReadinessSource;
use everyaios_types::{AgentDefinition, AgentId, AgentProtocol, AuthMode};
use serde_json::json;
use tauri::State;

use crate::AppState;

/// The registry root — `~/.everyaios/agents` (honors `EVERYAIOS_HOME`).
fn registry() -> everyaios_agents::registry::AgentRegistry {
    everyaios_agents::registry::AgentRegistry::new(
        everyaios_agents::registry::AgentRegistry::default_home(),
    )
}

fn meta_json(m: &everyaios_agents::registry::AgentMeta) -> serde_json::Value {
    json!({
        "id": m.id,
        "name": m.name,
        "emoji": m.emoji,
        "engine": m.engine,
        "disabled": m.disabled,
        "description": m.description,
    })
}

/// List every registered agent (light rows — never the full bundle).
#[tauri::command]
pub fn agent_registry_list() -> Result<serde_json::Value, String> {
    let reg = registry();
    let metas: Vec<serde_json::Value> = reg.list().iter().map(meta_json).collect();
    Ok(json!({ "agents": metas, "root": reg.root().display().to_string() }))
}

/// Save a bundle (agent.toml string) into the registry; returns the derived
/// id. Unknown engine bindings / malformed TOML fail closed.
#[tauri::command]
pub fn agent_registry_save(agent_toml: String) -> Result<String, String> {
    let bundle = everyaios_agents::bundle::AgentBundle::from_toml(&agent_toml)
        .map_err(|e| format!("invalid agent.toml: {e}"))?;
    let reg = registry();
    reg.save(&bundle).map_err(|e| e.to_string())?;
    Ok(everyaios_agents::registry::slug(&bundle.name))
}

/// Fetch one bundle as agent.toml (the "edit / export" path).
#[tauri::command]
pub fn agent_registry_get(id: String) -> Result<String, String> {
    registry().export(&id).map_err(|e| e.to_string())
}

/// Remove an agent (and its per-agent asset dir) from the registry.
#[tauri::command]
pub fn agent_registry_remove(id: String) -> Result<(), String> {
    registry().removes(&id).map_err(|e| e.to_string())
}

/// Duplicate an agent under a new name (wizard "make a copy").
#[tauri::command]
pub fn agent_registry_duplicate(id: String, new_name: String) -> Result<String, String> {
    registry()
        .duplicate(&id, &new_name)
        .map_err(|e| e.to_string())
}

/// Toggle an agent's disabled flag (registry filter, not delete).
#[tauri::command]
pub fn agent_registry_set_disabled(id: String, disabled: bool) -> Result<(), String> {
    registry()
        .set_disabled(&id, disabled)
        .map_err(|e| e.to_string())
}

/// Project a launch manifest onto the canonical `AgentDefinition`.
fn definition_from_manifest(m: &everyaios_acp::HarnessManifest) -> AgentDefinition {
    let protocol = match m.protocol {
        everyaios_acp::HarnessProtocol::Acp => AgentProtocol::Acp,
    };
    AgentDefinition {
        id: AgentId::new(m.id.clone()),
        name: m.name.clone(),
        description: m.description.clone(),
        protocol,
        // The manifest's auth mode is the handshake-refined value; a manifest
        // that has never been probed says `unknown` rather than guessing
        // (`ARCH/03-BYOK-KEYRINGS.md` §3.0, P69.C7).
        auth_mode: match m.auth_mode {
            everyaios_acp::AuthMode::Subscription => AuthMode::Subscription,
            everyaios_acp::AuthMode::ApiKey => AuthMode::ApiKey,
            everyaios_acp::AuthMode::Local => AuthMode::Local,
            everyaios_acp::AuthMode::Keyless => AuthMode::Keyless,
            everyaios_acp::AuthMode::Unknown => AuthMode::Unknown,
        },
        capabilities: Vec::new(),
        extension_mechanisms: Vec::new(),
    }
}

/// Human-readable distribution label (the `locator` shown in the picker's
/// "why can't I run this?" affordance).
fn distribution_label(d: &everyaios_acp::Distribution) -> String {
    match d {
        everyaios_acp::Distribution::Binary { command, .. } => format!("binary: {command}"),
        everyaios_acp::Distribution::Npx { package, .. } => format!("npx: {package}"),
        everyaios_acp::Distribution::Uvx { package, .. } => format!("uvx: {package}"),
    }
}

fn entry_json(entry: &AgentDirectoryEntry) -> serde_json::Value {
    json!({
        "id": entry.definition.id.as_str(),
        "name": entry.definition.name,
        "description": entry.definition.description,
        "protocol": match entry.definition.protocol {
            AgentProtocol::Acp => "acp",
            AgentProtocol::ModelOnly => "model_only",
        },
        "authMode": entry.definition.auth_mode.as_str(),
        "source": entry.source.as_str(),
        // P71.3f — the canonical readiness state; `installed` is its derived
        // projection (kept for surfaces that still read the boolean).
        "readiness": entry.readiness.as_str(),
        "ready": entry.ready(),
        "installed": entry.installed(),
        "removable": entry.source.is_removable(),
        "locator": entry.locator,
    })
}

/// The one agent directory (P69.D1): the ACP launch registry + saved
/// `agent.toml` bundles, composed server-side and returned id-ordered.
/// ADR-0005: there is no built-in row — every entry is an external agent or a
/// user bundle.
///
/// The UI reads this as a façade; it never merges agent lists of its own.
#[tauri::command]
pub fn agent_directory_list(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let mut dir = AgentDirectory::new();
    // P71.3f — rows carry the probed readiness (install facts + live handshake
    // state), not a boolean the caller would have to keep in sync.
    let source = crate::acp_cmds::ShellAgentReadiness {
        sessions: Arc::clone(&state.acp_sessions),
    };
    let readiness_of = |id: &str| source.readiness(id);

    let launch = crate::acp_cmds::launch_registry();
    for manifest in &launch.agents {
        // Every launch-registry row is an external ACP agent (ADR-0005 §D1).
        dir.upsert(
            AgentDirectoryEntry::new(definition_from_manifest(manifest), AgentSource::AcpRegistry)
                .with_readiness(readiness_of(&manifest.id))
                .with_locator(distribution_label(&manifest.distribution)),
        );
    }

    // Local bundles are a *source*: their definitions join the same directory.
    let reg = registry();
    let mut bundle_count = 0usize;
    for meta in reg.list() {
        if let Ok(bundle) = reg.load(&meta.id) {
            bundle_count += 1;
            dir.upsert_bundle(&bundle);
        }
    }

    let rows: Vec<serde_json::Value> = dir.list().iter().map(|e| entry_json(e)).collect();
    Ok(json!({
        "agents": rows,
        // No default agent exists (ADR-0005 §D1); selection is user-owned.
        "defaultAgentId": serde_json::Value::Null,
        "bundleCount": bundle_count,
        "total": dir.len(),
    }))
}
