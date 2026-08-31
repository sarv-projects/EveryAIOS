//! P9.5 — Local OpenAI-compatible server: Tauri wiring.
//!
//! Starts / stops the `everyaios_core::openai_server::OpenAiServer` on a
//! loopback port and reports its base URL + bearer token so the UI can show a
//! copy-paste config for VS Code / Cursor / Continue.
//!
//! The live [`CompletionBackend`] bridges to the **vault broker** — the same
//! single place keys leave the vault for the sidecar path. The server process
//! itself never holds a provider key; it hands `(provider, model, body)` to
//! the broker, which resolves the key, calls the upstream, and returns the
//! OpenAI-shaped response. Local runtimes (ollama/llamafile) route keylessly.
//!
//! Model id resolution: an incoming `model` of `provider/model` is split on
//! the first `/`; a bare id resolves through the config's MODEL_ALIASES, then
//! falls back to treating it as an OpenAI model. `everyaios-auto` is a
//! sentinel that lets the request pick the default provider/model.

use std::sync::{Arc, Mutex};

use everyaios_core::{
    ChatCompletionRequest, CompletionBackend, CompletionResult, ModelLister, ModelRow,
    OpenAiServer,
};
use tauri::State;

use crate::AppState;

/// The running server handle stored in `AppState` (None until started).
#[derive(Default)]
pub struct OpenAiServerSlot {
    server: Option<OpenAiServer>,
}

/// Live backend: resolve the model → call the vault broker → shape the result.
struct BrokerBackend {
    vault: Arc<Mutex<everyaios_vault::Vault>>,
    aliases: std::collections::HashMap<String, String>,
    /// The default provider/model used for the `everyaios-auto` sentinel.
    default_provider: String,
    default_model: String,
}

impl BrokerBackend {
    /// Split `model` into `(provider, model)`. `provider/model` splits on the
    /// first `/`; aliases resolve first; `everyaios-auto` → the default.
    fn resolve(&self, model: &str) -> (String, String) {
        if model == "everyaios-auto" || model.is_empty() {
            return (self.default_provider.clone(), self.default_model.clone());
        }
        // Alias table (config MODEL_ALIASES).
        let resolved = self.aliases.get(model).cloned().unwrap_or_else(|| model.to_string());
        if let Some((prov, m)) = resolved.split_once('/') {
            (prov.to_string(), m.to_string())
        } else {
            // Bare model id — default to OpenAI-compatible provider.
            (self.default_provider.clone(), resolved)
        }
    }
}

impl CompletionBackend for BrokerBackend {
    fn complete(&self, req: &ChatCompletionRequest) -> Result<CompletionResult, String> {
        let (provider, model) = self.resolve(&req.model);
        // Build the upstream body: pass messages through; forward optional
        // temperature/max_tokens. The broker adds auth + prompt-cache markers.
        let mut body = serde_json::json!({
            "model": model,
            "messages": req.messages.iter().map(|m| serde_json::json!({
                "role": m.role, "content": m.content,
            })).collect::<Vec<_>>(),
        });
        if let Some(t) = req.temperature {
            body["temperature"] = serde_json::json!(t);
        }
        if let Some(mt) = req.max_tokens {
            body["max_tokens"] = serde_json::json!(mt);
        }

        let vault = self.vault.lock().map_err(|e| e.to_string())?;
        let broker = everyaios_vault::Broker::new(&vault);
        let session_id = "openai-compat-server";
        let resp = broker
            .chat_completion(&provider, &model, session_id, body)
            .map_err(|e| e.to_string())?;

        // Extract the assistant content + usage from the OpenAI-shaped reply.
        let content = resp
            .pointer("/choices/0/message/content")
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string();
        let prompt_tokens = resp
            .pointer("/usage/prompt_tokens")
            .and_then(|v| v.as_u64())
            .unwrap_or(0);
        let completion_tokens = resp
            .pointer("/usage/completion_tokens")
            .and_then(|v| v.as_u64())
            .unwrap_or(0);
        Ok(CompletionResult {
            content,
            prompt_tokens,
            completion_tokens,
            model: format!("{provider}/{model}"),
        })
    }
}

/// Model lister: advertise the `everyaios-auto` sentinel + configured aliases
/// + any installed local models (ollama/llamafile). Never lists a raw key.
struct EngineModels {
    aliases: Vec<String>,
    local: Vec<String>,
}

impl ModelLister for EngineModels {
    fn models(&self) -> Vec<ModelRow> {
        let mut rows = vec![ModelRow::new("everyaios-auto", "everyaios")];
        for a in &self.aliases {
            rows.push(ModelRow::new(a.clone(), "everyaios"));
        }
        for m in &self.local {
            rows.push(ModelRow::new(m.clone(), "local"));
        }
        rows
    }
}

/// Start the local OpenAI-compatible server (idempotent — returns the existing
/// server's details if already running). Loopback-only; returns the base URL +
/// per-process bearer token for the client config.
#[tauri::command]
pub fn openai_server_start(
    state: State<'_, AppState>,
    port: Option<u16>,
) -> Result<serde_json::Value, String> {
    let mut slot = state.openai_server.lock().map_err(|e| e.to_string())?;
    if let Some(existing) = slot.server.as_ref() {
        return Ok(serde_json::json!({
            "running": true,
            "baseUrl": existing.base_url(),
            "token": existing.token(),
            "already": true,
        }));
    }

    let cfg = everyaios_core::Config::load().unwrap_or_default();
    let aliases = cfg.model_aliases.clone();
    let alias_names: Vec<String> = aliases.keys().cloned().collect();

    // Default provider/model for the `everyaios-auto` sentinel: first alias
    // target, else a conservative OpenAI-compatible default.
    let (default_provider, default_model) = aliases
        .values()
        .next()
        .and_then(|v| v.split_once('/').map(|(p, m)| (p.to_string(), m.to_string())))
        .unwrap_or_else(|| ("openai".to_string(), "gpt-4o-mini".to_string()));

    // Installed local models (best-effort; empty if no runtime).
    let local = {
        let mgr = everyaios_core::LocalManager::from_config(&cfg);
        mgr.list_ollama_models()
            .into_iter()
            .map(|m| format!("ollama/{}", m.name))
            .collect::<Vec<_>>()
    };

    let backend: Arc<dyn CompletionBackend> = Arc::new(BrokerBackend {
        vault: Arc::clone(&state.vault),
        aliases,
        default_provider,
        default_model,
    });
    let lister: Arc<dyn ModelLister> = Arc::new(EngineModels {
        aliases: alias_names,
        local,
    });

    let bind = format!("127.0.0.1:{}", port.unwrap_or(0));
    let server = OpenAiServer::serve(&bind, backend, lister).map_err(|e| e.to_string())?;
    let base_url = server.base_url();
    let token = server.token().to_string();
    slot.server = Some(server);

    Ok(serde_json::json!({
        "running": true,
        "baseUrl": base_url,
        "token": token,
        "already": false,
    }))
}

/// Stop the server (idempotent). Dropping the handle closes the listener.
#[tauri::command]
pub fn openai_server_stop(state: State<'_, AppState>) -> Result<(), String> {
    let mut slot = state.openai_server.lock().map_err(|e| e.to_string())?;
    slot.server = None;
    Ok(())
}

/// Current server status (running + base URL + token, or stopped).
#[tauri::command]
pub fn openai_server_status(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let slot = state.openai_server.lock().map_err(|e| e.to_string())?;
    match slot.server.as_ref() {
        Some(s) => Ok(serde_json::json!({
            "running": true,
            "baseUrl": s.base_url(),
            "token": s.token(),
        })),
        None => Ok(serde_json::json!({ "running": false })),
    }
}
