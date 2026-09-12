//! P56.1–P56.7 — the live provider-catalog surface.
//!
//! Three owners, each doing one job:
//!
//! * `everyaios-catalog::{live, store, fetch}` — parse/validate/persist the
//!   models.dev snapshot (pure + durable).
//! * `everyaios-catalog::{profiles, provider}` — the user-config profiles and
//!   the vendored provider registry (identity + aliases).
//! * this module — the shell's runtime surface: the 4h refresh job, the
//!   Settings → Providers list, the per-provider model table, the activate
//!   screen's `MetadataOnly` probe, and the endpoint resolution the chat relay
//!   consumes at boot.
//!
//! Nothing here invents a provider: a row exists because the live catalog, the
//! vendored registry, or the user's own profile file says so. Secrets never
//! cross this boundary — a probe carries a key *in*, and only a status back.

use std::collections::{BTreeMap, HashMap};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use everyaios_catalog::{
    base_registry, refresh_now, CatalogStore, HttpFetch, ProfileFormat, ProfileModel,
    ProfileSource, ProfileStore, ProviderProfile, RefreshDecision, RefreshOutcome,
    DEFAULT_REFRESH_SECS,
};
use everyaios_vault::{KeyRing, ProviderEndpoint, WireTransport};
use serde_json::{json, Value};
use tauri::State;

use crate::AppState;

/// P56.1 — the catalog's runtime owner: the durable store plus a refresh gate
/// so the 4h timer and a manual Settings refresh never fetch concurrently.
pub struct CatalogState {
    pub store: CatalogStore,
    refreshing: Mutex<()>,
}

impl CatalogState {
    pub fn new(dir: PathBuf) -> Self {
        Self {
            store: CatalogStore::new(dir),
            refreshing: Mutex::new(()),
        }
    }

    /// Run one refresh (`force` skips the staleness check). Serialized.
    pub fn refresh(&self, force: bool) -> RefreshOutcome {
        let _guard = self.refreshing.lock().unwrap_or_else(|e| e.into_inner());
        let now = now_ms();
        if !force {
            let meta = self.store.load_meta();
            let fresh = meta
                .as_ref()
                .map(|m| {
                    !everyaios_catalog::is_stale(
                        m.fetched_at,
                        now,
                        self.store.refresh_interval_secs(),
                    )
                })
                .unwrap_or(false);
            if fresh {
                let snapshot = self.store.load();
                return RefreshOutcome {
                    decision: match snapshot {
                        Some(s) => RefreshDecision::NotModified {
                            fetched_at: s.fetched_at,
                            providers: s.provider_count(),
                            models: s.model_count(),
                        },
                        None => RefreshDecision::Failed {
                            error: "catalog is fresh but no snapshot is stored".to_string(),
                        },
                    },
                    meta,
                    persisted: false,
                };
            }
        }
        refresh_now(&self.store, &HttpFetch::new(), now)
    }

    /// The cheap status half (never parses the snapshot).
    pub fn status(&self) -> Value {
        let meta = self.store.load_meta();
        let now = now_ms();
        let interval = self.store.refresh_interval_secs();
        let (fetched_at, providers, models, last_decision, last_failed, has_snapshot) = match &meta
        {
            Some(m) => (
                m.fetched_at,
                m.providers,
                m.models,
                m.last_decision.clone(),
                m.last_failed,
                self.store.load().is_some(),
            ),
            None => (0, 0, 0, None, false, self.store.load().is_some()),
        };
        json!({
            "source": everyaios_catalog::MODELS_DEV_API_URL,
            "hasSnapshot": has_snapshot,
            "fetchedAt": fetched_at,
            "stale": everyaios_catalog::is_stale(fetched_at, now, interval),
            "intervalHours": interval / 3600,
            "providers": providers,
            "models": models,
            "lastDecision": last_decision,
            "lastFailed": last_failed,
            "snapshotBytes": std::fs::metadata(self.store.snapshot_path()).map(|m| m.len()).ok(),
        })
    }
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn profile_store() -> ProfileStore {
    ProfileStore::in_dir(everyaios_core::default_data_dir())
}

/// P56.2/P56.7 — the merged provider list.
///
/// Sources are layered, lowest precedence first: the vendored registry
/// (identity, aliases, auth shape) → the live models.dev snapshot (name, npm,
/// api, doc, env, model rows) → the shipped overlays (OpenCode Zen/Go/Free,
/// NVIDIA NIM) → the user's own profiles. A row is never fabricated.
pub fn provider_rows(state: &AppState) -> Vec<Value> {
    let registry = base_registry();
    let snapshot = state.catalog.store.load();
    let profiles = profile_store();
    let keyed: std::collections::HashSet<String> = {
        let vault = state.vault.lock().map_err(|e| e.to_string());
        match vault {
            Ok(v) => KeyRing::new(&v)
                .providers_with_keys()
                .unwrap_or_default()
                .into_iter()
                .collect(),
            Err(_) => Default::default(),
        }
    };

    // id → merged row
    let mut rows: BTreeMap<String, Value> = BTreeMap::new();

    for rec in registry.all() {
        rows.insert(
            rec.id.clone(),
            json!({
                "id": rec.id,
                "name": rec.name,
                "aliases": rec.aliases,
                "env": rec.api_key_env,
                "auth": format!("{:?}", rec.auth).to_lowercase(),
                "transport": rec.transport.map(|t| format!("{t:?}").to_lowercase()),
                "baseUrl": rec.base_url.clone().unwrap_or_default(),
                "docUrl": Value::Null,
                "npm": Value::Null,
                "logoUrl": everyaios_catalog::logo_url(&rec.id),
                "source": format!("{:?}", rec.source).to_lowercase(),
                "modelIds": Vec::<String>::new(),
                "modelCount": 0,
                "keyConfigured": keyed.contains(&rec.id),
                "profileSource": Value::Null,
                "format": Value::Null,
                "keyless": matches!(rec.auth, everyaios_catalog::Auth::Keyless),
                "sessionHeaders": false,
                "verifiedAt": rec.capabilities_verified_at.clone(),
            }),
        );
    }

    if let Some(snap) = &snapshot {
        for p in snap.providers.values() {
            let entry = rows.entry(p.id.clone()).or_insert_with(|| {
                json!({
                    "id": p.id,
                    "name": p.name,
                    "aliases": Vec::<String>::new(),
                    "env": Vec::<String>::new(),
                    "auth": "unknown",
                    "transport": Value::Null,
                    "baseUrl": "",
                    "docUrl": Value::Null,
                    "npm": Value::Null,
                    "logoUrl": p.logo_url(),
                    "source": "models-dev-live",
                    "keyConfigured": false,
                    "profileSource": Value::Null,
                    "format": Value::Null,
                    "keyless": false,
                    "sessionHeaders": false,
                    "verifiedAt": Value::Null,
                })
            });
            entry["name"] = json!(p.name);
            entry["npm"] = json!(p.npm);
            entry["api"] = json!(p.api);
            entry["docUrl"] = json!(p.doc);
            entry["env"] = json!(p.env);
            entry["logoUrl"] = json!(p.logo_url());
            entry["modelCount"] = json!(p.model_count());
            entry["modelIds"] = json!(p.models.keys().cloned().collect::<Vec<_>>());
            entry["transport"] = json!(format!("{:?}", p.transport()).to_lowercase());
            if entry["baseUrl"].as_str().unwrap_or("").is_empty() {
                entry["baseUrl"] = json!(p.api.clone().unwrap_or_default());
            }
            entry["source"] = json!("models-dev-live");
        }
    }

    // Shipped overlays (P56.5/P56.6) then user profiles (P55.6/P56.4).
    let overlays = everyaios_catalog::opencode_overlay_profiles();
    for profile in overlays.iter().chain(profiles.list().iter()) {
        let entry = rows.entry(profile.id.clone()).or_insert_with(|| {
            json!({
                "id": profile.id,
                "name": profile.name,
                "aliases": Vec::<String>::new(),
                "env": Vec::<String>::new(),
                "auth": if profile.api_key_required { "api_key_env" } else { "keyless" },
                "transport": Value::Null,
                "docUrl": Value::Null,
                "npm": Value::Null,
                "logoUrl": everyaios_catalog::logo_url(&profile.id),
                "source": "overlay",
                "modelIds": Vec::<String>::new(),
                "modelCount": 0,
                "keyConfigured": false,
                "verifiedAt": Value::Null,
            })
        });
        entry["name"] = json!(profile.name);
        entry["profileSource"] = json!(format!("{:?}", profile.source).to_lowercase());
        entry["format"] = json!(profile.format);
        entry["keyless"] = json!(!profile.api_key_required);
        entry["sessionHeaders"] = json!(profile.session_headers);
        entry["baseUrl"] = json!(profile.base_url);
        if let Some(v) = &profile.verified_at {
            entry["verifiedAt"] = json!(v);
        }
        if !profile.models.is_empty() {
            entry["modelIds"] = json!(profile
                .models
                .iter()
                .map(|m| m.id.clone())
                .collect::<Vec<_>>());
            entry["modelCount"] = json!(profile.models.len());
        }
    }

    let mut out: Vec<Value> = rows.into_values().collect();
    out.sort_by(|a, b| {
        a["name"]
            .as_str()
            .unwrap_or("")
            .to_lowercase()
            .cmp(&b["name"].as_str().unwrap_or("").to_lowercase())
    });
    out
}

/// The base URL a probe should hit, in precedence order: user profile → live
/// catalog `api` → the vendored registry. `None` is honest — some models.dev
/// providers ship an SDK-default endpoint we cannot construct ourselves.
fn probe_base_url(state: &AppState, provider: &str) -> Option<String> {
    if let Some(p) = profile_store().get(provider) {
        if let Some(url) = p.normalized_base_url() {
            return Some(url);
        }
    }
    if let Some(snap) = state.catalog.store.load() {
        if let Some(p) = snap.provider(provider) {
            if let Some(api) = p.api.clone() {
                return Some(api.trim_end_matches('/').to_string());
            }
        }
    }
    base_registry()
        .resolve(provider)
        .and_then(|r| r.base_url.clone())
}

/// Resolve the endpoint for a provider (P55.5) — profile → catalog → registry.
pub fn resolve_endpoint(state: &AppState, provider: &str) -> Option<ProviderEndpoint> {
    let profile = profile_store().get(provider);
    let base = probe_base_url(state, provider)?;
    let (transport, headers, session_headers, keyless) = match &profile {
        Some(p) => (
            match p.format {
                ProfileFormat::Anthropic => WireTransport::AnthropicMessages,
                ProfileFormat::OpenaiResponses | ProfileFormat::OpenaiCompatible => {
                    WireTransport::OpenaiChat
                }
            },
            p.headers
                .iter()
                .map(|(k, v)| (k.clone(), v.clone()))
                .collect::<Vec<_>>(),
            p.session_headers,
            !p.api_key_required,
        ),
        None => {
            let snap_transport = state
                .catalog
                .store
                .load()
                .and_then(|s| s.provider(provider).map(|p| p.transport()));
            match snap_transport {
                // Only the dialects the broker can actually speak get an
                // endpoint; anything else keeps the legacy path rather than
                // being pointed at a wrong URL.
                Some(everyaios_catalog::Transport::AnthropicMessages) => {
                    (WireTransport::AnthropicMessages, Vec::new(), false, false)
                }
                Some(everyaios_catalog::Transport::OpenaiChat) | None => {
                    (WireTransport::OpenaiChat, Vec::new(), false, false)
                }
                Some(_) => return None,
            }
        }
    };
    let overlay_session = everyaios_catalog::opencode_overlay_profiles()
        .iter()
        .find(|p| p.id == provider)
        .map(|p| p.session_headers)
        .unwrap_or(false);
    Some(ProviderEndpoint {
        base_url: base,
        transport,
        headers,
        session_headers: session_headers || overlay_session,
        keyless: keyless
            || base_registry()
                .resolve(provider)
                .map(|r| matches!(r.auth, everyaios_catalog::Auth::Keyless))
                .unwrap_or(false),
    })
}

/// Every endpoint the chat relay should know about. Providers whose transport
/// we cannot speak are simply absent — the relay then behaves exactly as it
/// did before instead of failing at a wrong URL.
pub fn resolve_endpoints(state: &AppState) -> HashMap<String, ProviderEndpoint> {
    let mut out = HashMap::new();
    for row in provider_rows(state) {
        let Some(id) = row["id"].as_str() else {
            continue;
        };
        if let Some(ep) = resolve_endpoint(state, id) {
            out.insert(id.to_string(), ep);
        }
    }
    out
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/// P56.1 — cheap live status (never parses the 4.6 MB snapshot).
#[tauri::command]
pub fn catalog_status(state: State<'_, AppState>) -> Value {
    state.catalog.status()
}

/// P56.1 — run the refresh job now (`force` skips the staleness check).
#[tauri::command]
pub fn catalog_refresh(state: State<'_, AppState>, force: Option<bool>) -> Value {
    let outcome = state.catalog.refresh(force.unwrap_or(true));
    json!({
        "accepted": outcome.decision.accepted(),
        "persisted": outcome.persisted,
        "summary": outcome.summary(),
        "status": state.catalog.status(),
    })
}

/// P56.1 — the configurable cadence (clamped to 1–24h by the store).
#[tauri::command]
pub fn catalog_set_interval(state: State<'_, AppState>, hours: u64) -> Result<Value, String> {
    let clamped = everyaios_catalog::refresh_interval_secs(Some(hours));
    state
        .catalog
        .store
        .save_settings(&everyaios_catalog::CatalogSettings {
            refresh_hours: Some(clamped / 3600),
        })?;
    Ok(json!({
        "ok": true,
        "intervalHours": clamped / 3600,
        "requestedHours": hours,
        "clamped": clamped != hours * 3600,
    }))
}

/// Drop the cached snapshot (Settings → clear). Settings are kept.
#[tauri::command]
pub fn catalog_clear(state: State<'_, AppState>) -> Result<Value, String> {
    state.catalog.store.clear()?;
    Ok(json!({ "ok": true, "status": state.catalog.status() }))
}

/// P56.2 — the merged Settings → Providers list.
#[tauri::command]
pub fn catalog_providers(state: State<'_, AppState>) -> Value {
    let rows = provider_rows(&state);
    json!({
        "providers": rows,
        "status": state.catalog.status(),
        "profiles": profile_store().list(),
    })
}

/// P56.7 — the whole model table for one provider. `opencode-free` returns the
/// keyless free subset (regex + `big-pickle`), which is the only honest list
/// for that row.
#[tauri::command]
pub fn catalog_provider_models(state: State<'_, AppState>, provider: String) -> Value {
    let snap = state.catalog.store.load();
    let mut rows: Vec<Value> = Vec::new();
    let mut free_subset: Option<Vec<String>> = None;

    if let Some(s) = &snap {
        if let Some(p) = s.provider(&provider) {
            free_subset = Some(s.opencode_free_models());
            for m in p.model_rows() {
                if provider == "opencode-free" {
                    let free = free_subset.as_ref().unwrap();
                    if !free.iter().any(|f| f == &m.id) {
                        continue;
                    }
                }
                rows.push(json!({
                    "id": m.id,
                    "name": if m.name.is_empty() { m.id.clone() } else { m.name.clone() },
                    "description": m.description,
                    "family": m.family,
                    "context": m.limit.context,
                    "output": m.limit.output,
                    "priceInput": m.cost.input,
                    "priceOutput": m.cost.output,
                    "cacheRead": m.cost.cache_read,
                    "cacheWrite": m.cost.cache_write,
                    "reasoning": m.reasoning,
                    "toolCall": m.tool_call,
                    "structuredOutput": m.structured_output,
                    "attachment": m.attachment,
                    "temperature": m.temperature,
                    "images": m.modalities.accepts_image(),
                    "pdf": m.modalities.accepts_pdf(),
                    "openWeights": m.open_weights,
                    "knowledge": m.knowledge,
                    "releaseDate": m.release_date,
                    "lastUpdated": m.last_updated,
                    "status": m.status,
                }));
            }
        }
    }

    // A user profile may carry its own model list (P56.4) — that is the
    // authoritative list for that endpoint, not the catalog's.
    let profile_models: Vec<Value> = profile_store()
        .get(&provider)
        .map(|p| {
            p.models
                .iter()
                .map(|m| {
                    json!({
                        "id": m.id,
                        "name": if m.name.is_empty() { m.id.clone() } else { m.name.clone() },
                        "context": m.context,
                        "output": m.output,
                        "free": m.free,
                        "fromProfile": true,
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    json!({
        "provider": provider,
        "models": rows,
        "profileModels": profile_models,
        "count": rows.len() + profile_models.len(),
        "live": snap.is_some(),
        "freeSubset": free_subset,
    })
}

/// P56.3 — the activate screen's `MetadataOnly` probe.
///
/// `GET {base}/models` (Anthropic: `x-api-key` + `anthropic-version`; everyone
/// else: `Authorization: Bearer`; keyless: no auth header at all). Read-only:
/// nothing is persisted here, so a failed probe cannot leave a half-configured
/// provider behind. The UI persists on a tick, with the `verifiedAt` stamp.
#[tauri::command]
pub fn provider_probe(state: State<'_, AppState>, provider: String, key: Option<String>) -> Value {
    let Some(base) = probe_base_url(&state, &provider) else {
        return json!({
            "ok": false,
            "status": 0,
            "message": "no endpoint in the catalog for this provider — add a base URL",
            "models": 0,
        });
    };
    let endpoint = resolve_endpoint(&state, &provider);
    let is_anthropic = endpoint
        .as_ref()
        .map(|e| e.transport == WireTransport::AnthropicMessages)
        .unwrap_or(false);
    let headers = endpoint.map(|e| e.headers).unwrap_or_default();
    let probe =
        everyaios_catalog::probe_models_endpoint(&base, is_anthropic, &headers, key.as_deref());
    json!({
        "ok": probe.ok,
        "status": probe.status,
        "message": probe.message,
        "models": probe.models,
        "url": probe.url,
    })
}

/// P55.6/P56.4 — the durable provider profiles (no secrets).
#[tauri::command]
pub fn provider_profiles_list() -> Value {
    json!({ "profiles": profile_store().list() })
}

/// P55.6/P56.4 — create or replace a profile (custom inference form / base-URL
/// override / NVIDIA NIM). Rejects a base URL that already carries a request
/// path, because the broker appends the dialect path itself.
#[tauri::command]
pub fn provider_profile_upsert(
    state: State<'_, AppState>,
    profile: Value,
) -> Result<Value, String> {
    let format = match profile.get("format").and_then(|f| f.as_str()) {
        Some(f) => ProfileFormat::parse(f)?,
        None => ProfileFormat::OpenaiCompatible,
    };
    let mut headers = BTreeMap::new();
    if let Some(obj) = profile.get("headers").and_then(|h| h.as_object()) {
        for (k, v) in obj {
            if let Some(v) = v.as_str() {
                headers.insert(k.clone(), v.to_string());
            }
        }
    }
    let models: Vec<ProfileModel> = profile
        .get("models")
        .and_then(|m| m.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|m| {
                    let id = m.get("id")?.as_str()?.to_string();
                    Some(ProfileModel {
                        name: m
                            .get("name")
                            .and_then(|n| n.as_str())
                            .unwrap_or(&id)
                            .to_string(),
                        context: m.get("context").and_then(|c| c.as_u64()).unwrap_or(0),
                        output: m.get("output").and_then(|c| c.as_u64()).unwrap_or(0),
                        free: m.get("free").and_then(|f| f.as_bool()).unwrap_or(false),
                        id,
                    })
                })
                .collect()
        })
        .unwrap_or_default();
    let id = profile
        .get("id")
        .and_then(|i| i.as_str())
        .unwrap_or("")
        .to_string();
    let name = profile
        .get("name")
        .and_then(|n| n.as_str())
        .unwrap_or("")
        .to_string();
    let saved = profile_store().upsert(ProviderProfile {
        id: if id.trim().is_empty() {
            ProviderProfile::slug(&name)
        } else {
            id
        },
        name,
        format,
        base_url: profile
            .get("baseUrl")
            .or_else(|| profile.get("base_url"))
            .and_then(|u| u.as_str())
            .unwrap_or("")
            .to_string(),
        // `keyRequired` defaults to false: a keyless local endpoint is valid
        // and is the common case for the custom form (P56.4).
        api_key_required: profile
            .get("keyRequired")
            .and_then(|k| k.as_bool())
            .unwrap_or(false),
        headers,
        body: profile.get("body").cloned().unwrap_or(json!({})),
        temperature: profile.get("temperature").and_then(|t| t.as_f64()),
        models,
        source: ProfileSource::UserConfig,
        verified_at: profile
            .get("verifiedAt")
            .and_then(|v| v.as_str())
            .map(str::to_string),
        verified_models: profile
            .get("verifiedModels")
            .and_then(|v| v.as_u64())
            .unwrap_or(0) as usize,
        session_headers: profile
            .get("sessionHeaders")
            .and_then(|s| s.as_bool())
            .unwrap_or(false),
    })?;
    // A profile changes routing immediately for the next turn.
    let _ = state;
    Ok(json!({ "ok": true, "profile": saved }))
}

#[tauri::command]
pub fn provider_profile_remove(id: String) -> Result<Value, String> {
    let removed = profile_store().remove(&id)?;
    Ok(json!({ "ok": true, "removed": removed, "id": id }))
}

/// P56.5 — the shipped NVIDIA NIM overlay as a one-click profile.
#[tauri::command]
pub fn provider_nim_profile(base_url: Option<String>) -> Value {
    let mut p = everyaios_catalog::nvidia_nim_profile();
    if let Some(url) = base_url {
        if !url.trim().is_empty() {
            p.base_url = url;
        }
    }
    json!(p)
}

// ---------------------------------------------------------------------------
// P14.5 — the pure merge gate (kept: it is the documented per-provider path)
// ---------------------------------------------------------------------------

/// The documented refresh plan — what one per-provider sync run would do.
#[tauri::command]
pub fn catalog_sync_plan() -> Value {
    let modules: Vec<Value> = everyaios_catalog::SYNC_MODULES
        .iter()
        .map(|s| {
            json!({
                "provider": s.provider,
                "source": s.source,
                "writableFields": s.writable_fields,
            })
        })
        .collect();
    json!({
        "modules": modules,
        "plan": everyaios_catalog::refresh_plan(),
        "liveSource": everyaios_catalog::MODELS_DEV_API_URL,
        "defaultIntervalHours": DEFAULT_REFRESH_SECS / 3600,
    })
}

/// Run the pure merge gate over a caller-supplied baseline + fetch payload.
#[tauri::command]
pub fn catalog_sync_refresh(
    baseline_json: String,
    fetched_json: String,
    known_labs: Vec<String>,
) -> Result<Value, String> {
    let baseline: Vec<everyaios_catalog::ModelEntry> = serde_json::from_str(&baseline_json)
        .map_err(|e| format!("catalog refresh: bad baseline JSON: {e}"))?;
    let fetched: Vec<everyaios_catalog::ModelEntry> = serde_json::from_str(&fetched_json)
        .map_err(|e| format!("catalog refresh: bad fetched JSON: {e}"))?;
    let labs: Vec<&str> = known_labs.iter().map(String::as_str).collect();
    let report = everyaios_catalog::merge_refresh(&baseline, &fetched, &labs);
    Ok(json!({
        "accepted": report.accepted,
        "fetchedProviders": report.fetched_providers,
        "acceptedEntries": report.accepted_entries,
        "rejectedProviders": report.rejected_providers,
        "findings": report
            .findings
            .iter()
            .map(|f| json!({
                "severity": match f.severity {
                    everyaios_catalog::Severity::Error => "error",
                    everyaios_catalog::Severity::Warning => "warning",
                },
                "message": f.message,
            }))
            .collect::<Vec<_>>(),
    }))
}

/// The background job the shell spawns at boot (P56.1): refresh when stale,
/// then re-check every minute so a Settings cadence change takes effect
/// without a restart. Never blocks the UI thread.
pub fn spawn_refresh_job(catalog: Arc<CatalogState>) {
    std::thread::spawn(move || {
        // Boot leg: stale (or empty) → fetch now.
        let _ = catalog.refresh(false);
        loop {
            std::thread::sleep(Duration::from_secs(60));
            let meta = catalog.store.load_meta();
            let interval = catalog.store.refresh_interval_secs();
            let stale = meta
                .as_ref()
                .map(|m| everyaios_catalog::is_stale(m.fetched_at, now_ms(), interval))
                .unwrap_or(true);
            if stale {
                let _ = catalog.refresh(false);
            }
        }
    });
}
