//! P63 — **per-agent model-backend configuration** (the Rust half of the
//! install tab's post-install control).
//!
//! An external agent CLI brings its own provider. This module lets the user
//! point that agent at one of *their* providers from the Agent-runtimes card,
//! without ever hand-editing `~/.config/opencode/opencode.json` or learning
//! each CLI's schema.
//!
//! # Where the configuration lives, and why
//!
//! - The **choice** (`<data_dir>/agent_backend.json`) is ours: one small,
//!   non-secret record per agent — provider id, model id, whether to use the
//!   vault key, an optional base-URL override.
//! - The **secret** never enters this file, the IPC payload, or the UI. It is
//!   read from the vault in Rust at spawn time
//!   (`everyaios_vault::KeyRing::reveal_for_spawn`) and written straight into
//!   the child's environment.
//!
//! # What is deliberately *not* implemented
//!
//! **No agent config file is ever written.** The tempting shortcut — copy the
//! key into `opencode.json` / `providers.json` / `config.toml` — is exactly
//! the effect spec §6 #21 / TODO P47.7 gates: those paths are
//! `everyaios-guard::protected_paths` (`floor:protected-settings`, a human ask
//! in every preset), and writing them is post-v1 by recorded ADR. Env
//! injection covers the agents that read env; the ones that do not are
//! reported honestly by `everyaios_acp::BackendChannel` instead of being
//! written behind the user's back.
//!
//! # Honesty surface
//!
//! `agent_backend_get` returns the *names* of the variables a launch will
//! carry, never their values, plus `unexpressed` for anything the chosen agent
//! has no variable for (e.g. a custom base URL on an agent that reads none).
//! The UI renders that as the "injected at launch" line, so the user is never
//! left believing a setting took effect when the agent cannot read it.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::State;

use crate::catalog_cmds::{provider_rows, resolve_endpoint};
use crate::control::{record_mutation, AuthKind};
use crate::AppState;

/// One agent's chosen provider binding (never a secret).
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentBackendConfig {
    /// Catalog provider id (`anthropic`, `openai`, `ollama`, …).
    pub provider: String,
    /// Model id forwarded to agents that have a model variable.
    #[serde(default)]
    pub model: String,
    /// Hand the agent the key from the EveryAIOS vault at spawn.
    #[serde(default)]
    pub use_vault_key: bool,
    /// Base-URL override (defaults to the catalog's endpoint for `provider`).
    #[serde(default)]
    pub base_url: Option<String>,
}

type Store = BTreeMap<String, AgentBackendConfig>;

/// `<data_dir>/agent_backend.json` — the one owner of the per-agent choice.
pub fn config_path() -> std::path::PathBuf {
    everyaios_core::default_data_dir().join("agent_backend.json")
}

fn load() -> Store {
    std::fs::read(config_path())
        .ok()
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or_default()
}

fn save(store: &Store) -> Result<(), String> {
    let path = config_path();
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| format!("create data dir: {e}"))?;
    }
    let json = serde_json::to_vec_pretty(store).map_err(|e| format!("encode: {e}"))?;
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, &json).map_err(|e| format!("write: {e}"))?;
    std::fs::rename(&tmp, &path).map_err(|e| format!("rename: {e}"))
}

fn config_for(agent_id: &str) -> Option<AgentBackendConfig> {
    load().get(agent_id).cloned()
}

/// The env var name the **provider** uses, per the merged catalog rows
/// (seeds + profiles + live snapshot). `None` = no known convention.
fn provider_env_name(state: &AppState, provider: &str) -> Option<String> {
    provider_rows(state)
        .iter()
        .find(|r| r.get("id").and_then(|v| v.as_str()) == Some(provider))
        .and_then(|r| r.get("env"))
        .and_then(|e| e.as_array())
        .and_then(|a| a.first())
        .and_then(|v| v.as_str())
        .map(str::to_string)
        .or_else(|| {
            everyaios_catalog::base_registry()
                .get(provider)
                .and_then(|r| r.api_key_env.first().cloned())
        })
}

/// The provider's own base-URL override variable (declared by the catalog),
/// used only for `ProviderEnv` agents.
fn provider_base_url_env(provider: &str) -> Option<String> {
    everyaios_catalog::base_registry()
        .get(provider)
        .and_then(|r| r.base_url_env.clone())
}

struct BindingParts {
    key_env: String,
    base_url: Option<String>,
    base_url_env: Option<String>,
    keyless: bool,
}

fn binding_parts(state: &AppState, cfg: &AgentBackendConfig) -> Result<BindingParts, String> {
    let key_env = provider_env_name(state, &cfg.provider)
        .ok_or_else(|| format!("no env var name known for provider '{}'", cfg.provider))?;
    let endpoint = resolve_endpoint(state, &cfg.provider);
    let base_url = cfg
        .base_url
        .clone()
        .or_else(|| endpoint.as_ref().map(|e| e.base_url.clone()));
    let keyless = endpoint.as_ref().map(|e| e.keyless).unwrap_or(false);
    Ok(BindingParts {
        key_env,
        base_url,
        base_url_env: provider_base_url_env(&cfg.provider),
        keyless,
    })
}

/// Reveal the provider's key for this spawn. Rust-only; the value is dropped
/// as soon as the child's environment has been built.
fn reveal_key(
    state: &AppState,
    agent_id: &str,
    cfg: &AgentBackendConfig,
    parts: &BindingParts,
) -> Option<zeroize::Zeroizing<String>> {
    if !cfg.use_vault_key || parts.keyless {
        return None;
    }
    let vault = state.vault.lock().ok()?;
    let ring = everyaios_vault::KeyRing::new(&vault);
    // Affinity is per (provider, model, session) — pin one key per agent so a
    // launch never rotates between keys mid-session.
    ring.reveal_for_spawn(&cfg.provider, &cfg.model, &format!("agent:{agent_id}"))
        .ok()
}

/// Names-only view of what a launch would inject (safe for IPC).
fn inject_view(
    state: &AppState,
    agent_id: &str,
    cfg: &AgentBackendConfig,
) -> (Vec<String>, Vec<String>, bool, Option<String>) {
    let spec = everyaios_acp::backend_spec(agent_id);
    if !spec.channel.is_env_injectable() {
        return (Vec::new(), Vec::new(), false, None);
    }
    let Ok(parts) = binding_parts(state, cfg) else {
        return (Vec::new(), Vec::new(), false, None);
    };
    let binding = everyaios_acp::ProviderBinding {
        provider: &cfg.provider,
        model: &cfg.model,
        key_env: &parts.key_env,
        base_url: parts.base_url.as_deref(),
        base_url_env: parts.base_url_env.as_deref(),
        secret: None, // names only — never carry the secret into a view
    };
    let names = everyaios_acp::injected_names(&spec, &binding);
    let gaps = everyaios_acp::unexpressed(&spec, &binding)
        .into_iter()
        .map(str::to_string)
        .collect();
    let key_present = if parts.keyless || !cfg.use_vault_key {
        false
    } else {
        key_in_vault(state, &cfg.provider)
    };
    let refusal = everyaios_acp::plan_env(&spec, &binding)
        .err()
        .map(|e| e.to_string());
    (names, gaps, key_present, refusal)
}

fn key_in_vault(state: &AppState, provider: &str) -> bool {
    let Ok(vault) = state.vault.lock() else {
        return false;
    };
    everyaios_vault::KeyRing::new(&vault)
        .providers_with_keys()
        .map(|p| p.iter().any(|x| x == provider))
        .unwrap_or(false)
}

/// The env pairs a launch of `agent_id` must carry. Best-effort and
/// secret-carrying: **only** `acp_launch` may call this, and only to build the
/// child's environment.
pub fn spawn_env_for(state: &AppState, agent_id: &str) -> Vec<(String, String)> {
    let Some(cfg) = config_for(agent_id) else {
        return Vec::new();
    };
    let spec = everyaios_acp::backend_spec(agent_id);
    if !spec.channel.is_env_injectable() {
        return Vec::new();
    }
    let Ok(parts) = binding_parts(state, &cfg) else {
        return Vec::new();
    };
    let secret = reveal_key(state, agent_id, &cfg, &parts);
    let binding = everyaios_acp::ProviderBinding {
        provider: &cfg.provider,
        model: &cfg.model,
        key_env: &parts.key_env,
        base_url: parts.base_url.as_deref(),
        base_url_env: parts.base_url_env.as_deref(),
        secret: secret.as_ref().map(|s| s.as_str()),
    };
    // A refusal here (e.g. the agent turned out ConfigFileOnly) must never
    // block a launch — the agent simply starts on its own configuration.
    everyaios_acp::plan_env(&spec, &binding).unwrap_or_default()
}

/// The full card state for one agent: the contract, the choice, and the
/// names-only injection view.
#[tauri::command]
pub fn agent_backend_get(state: State<'_, AppState>, agent_id: String) -> Value {
    let spec = everyaios_acp::backend_spec(&agent_id);
    let cfg = config_for(&agent_id);
    let (injected, unexpressed, key_present, refusal) = match &cfg {
        Some(c) => inject_view(&state, &agent_id, c),
        None => (Vec::new(), Vec::new(), false, None),
    };
    json!({
        "agentId": agent_id,
        "channel": spec.channel.as_str(),
        "injectable": spec.channel.is_env_injectable(),
        "note": spec.note,
        "configFile": spec.config_file,
        "configured": cfg.as_ref().map(|c| json!({
            "provider": c.provider,
            "model": c.model,
            "useVaultKey": c.use_vault_key,
            "baseUrl": c.base_url,
        })),
        "injectedEnv": injected,
        "unexpressed": unexpressed,
        "keyPresent": key_present,
        "writesToDisk": false,
        "refusal": refusal,
    })
}

/// Candidate providers for this agent: the merged catalog, flagged with
/// whether a key already exists in the vault (so the card can show "in vault"
/// without ever reading the key).
#[tauri::command]
pub fn agent_backend_providers(state: State<'_, AppState>, _agent_id: String) -> Value {
    let vaulted: Vec<String> = {
        match state.vault.lock() {
            Ok(v) => everyaios_vault::KeyRing::new(&v)
                .providers_with_keys()
                .unwrap_or_default(),
            Err(_) => Vec::new(),
        }
    };
    let rows: Vec<Value> = provider_rows(&state)
        .into_iter()
        .filter_map(|r| {
            let id = r.get("id")?.as_str()?.to_string();
            let env = r
                .get("env")
                .and_then(|e| e.as_array())
                .and_then(|a| a.first())
                .and_then(|v| v.as_str())
                .map(str::to_string);
            let base_url = r
                .get("baseUrl")
                .and_then(|v| v.as_str())
                .unwrap_or_default()
                .to_string();
            let local = base_url.contains("127.0.0.1") || base_url.contains("localhost");
            Some(json!({
                "id": id,
                "name": r.get("name").and_then(|v| v.as_str()).unwrap_or_default(),
                "env": env,
                "baseUrl": base_url,
                "local": local,
                "keyInVault": vaulted.iter().any(|p| p == &id),
                "verifiedAt": r.get("verifiedAt").cloned().unwrap_or(Value::Null),
            }))
        })
        .collect();
    json!({ "providers": rows })
}

/// Set the agent's provider binding. Audited as a human gesture: the user's
/// click is the authorization, and nothing is written to the agent's own files.
#[tauri::command]
pub fn agent_backend_set(
    state: State<'_, AppState>,
    agent_id: String,
    provider: String,
    model: Option<String>,
    use_vault_key: Option<bool>,
    base_url: Option<String>,
) -> Result<Value, String> {
    if provider.trim().is_empty() {
        return Err("provider must not be empty".to_string());
    }
    let spec = everyaios_acp::backend_spec(&agent_id);
    if spec.channel == everyaios_acp::BackendChannel::Subscription {
        return Err(format!(
            "{agent_id} signs in with its own subscription — EveryAIOS does not configure its credentials"
        ));
    }
    if spec.channel == everyaios_acp::BackendChannel::Unknown {
        return Err(format!(
            "{agent_id} has no verified model-backend contract — refusing to guess"
        ));
    }

    let model = model.unwrap_or_default();
    let use_vault_key = use_vault_key.unwrap_or(true);
    let base_url = base_url.filter(|u| !u.trim().is_empty());
    let cfg = AgentBackendConfig {
        provider: provider.clone(),
        model: model.clone(),
        use_vault_key,
        base_url,
    };

    // Fail closed on a provider we cannot name an env var for: silently
    // storing a binding that can never be injected is the dishonest outcome.
    if spec.channel.is_env_injectable() && provider_env_name(&state, &provider).is_none() {
        return Err(format!(
            "no env var name known for provider '{provider}' — it cannot be injected into {agent_id}"
        ));
    }

    let has_base_url_override = cfg.base_url.is_some();
    let mut store = load();
    store.insert(agent_id.clone(), cfg);
    save(&store)?;

    record_mutation(
        &state,
        AuthKind::HumanGesture,
        "agent.backend.set",
        json!({
            "agentId": agent_id,
            "provider": provider,
            "model": model,
            "useVaultKey": use_vault_key,
            "hasBaseUrlOverride": has_base_url_override,
            // Deliberately no base URL / key material here: the audit is a
            // provenance record, not a config store.
            "channel": spec.channel.as_str(),
            "writesToDisk": false,
        }),
    );

    Ok(agent_backend_get(state, agent_id))
}

/// Forget the agent's binding (the agent returns to its own configuration).
#[tauri::command]
pub fn agent_backend_clear(state: State<'_, AppState>, agent_id: String) -> Result<Value, String> {
    let mut store = load();
    store.remove(&agent_id);
    save(&store)?;
    record_mutation(
        &state,
        AuthKind::HumanGesture,
        "agent.backend.clear",
        json!({ "agentId": agent_id }),
    );
    Ok(agent_backend_get(state, agent_id))
}

/// The card's health tick: probe the endpoint the agent would actually use.
/// Our probe of *that* endpoint — never "the agent says it works".
#[tauri::command]
pub fn agent_backend_probe(state: State<'_, AppState>, provider: String) -> Value {
    crate::catalog_cmds::probe_provider(&state, &provider, None)
}
