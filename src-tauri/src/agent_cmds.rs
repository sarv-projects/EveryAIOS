//! P31 — agent-registry Tauri commands. The `everyaios-agents` crate owns
//! the durable store (`~/.everyaios/agents/<id>/agent.toml`); these commands
//! expose list / save / get / remove / disable / duplicate so the P31
//! builder UI talks to the real registry instead of browser-local state.
//!
//! Fail-closed: unknown ids and invalid TOML are errors, never silently
//! ignored; ids are always re-derived from the bundle name by the crate
//! (`slug`), never trusted from the caller.

use serde_json::json;

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
    registry().duplicate(&id, &new_name).map_err(|e| e.to_string())
}

/// Toggle an agent's disabled flag (registry filter, not delete).
#[tauri::command]
pub fn agent_registry_set_disabled(id: String, disabled: bool) -> Result<(), String> {
    registry().set_disabled(&id, disabled).map_err(|e| e.to_string())
}