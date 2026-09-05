//! P50.4.2 — Local model downloads (Tauri wiring over the P27 backend).
//!
//! The backend (`everyaios_core::models`) was landed in the P27 queue:
//! [`HfClient`] (resumable `Range` downloads + sha256 verify), [`ModelRegistry`]
//! (`<data_dir>/models/hf/index.json`), `local://` URLs + resolver, and
//! [`ModelsRuntime`] (llamafile serve / `ollama create`). This module is the
//! missing consumer wiring: download start/progress/cancel/resume over Tauri
//! events, registry CRUD, hardware-fit quant recommendation, and runtime
//! binding — all honest-fail when the environment lacks network/runtime.
//!
//! Download lifecycle:
//! 1. `model_download_start` spawns a thread; progress is emitted on
//!    [`MODEL_DOWNLOAD_EVENT`] (throttled to ≥1 MiB per event).
//! 2. The `*.part` staging file lives at
//!    `<data_dir>/models/hf/{publisher}/{model}/{filename}.part` — cancel
//!    keeps it, so a later start with the same repo+filename resumes via
//!    `Range` (416 → clean restart).
//! 3. On success the file is renamed to the canonical
//!    `{quant}-{sha8}.gguf` (or `.safetensors`) path and registered in
//!    `index.json`; the entry is then resolvable as `local://hf/...`.
//! 4. Orphaned `.part` files (crashed/cancelled across restarts) are
//!    reported by `model_downloads` so the UI can offer Resume.

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use everyaios_core::models::hf::{part_path, quant_from_filename, HfClient, HfError};
use everyaios_core::models::store::{ModelEntry, ModelRegistry};
use everyaios_core::models::{probe_hardware, ModelsRuntime};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::AppState;
use crate::MODEL_DOWNLOAD_EVENT;

/// One in-flight download (P50.4.2). The cancel flag is cooperative — the
/// download loop checks it at every chunk boundary and returns
/// `HfError::Cancelled`, leaving the `.part` file for resume.
pub struct ModelDownloadSlot {
    pub repo: String,
    pub filename: String,
    /// Staging dest: `<base>/hf/{publisher}/{model}/{filename}` (the `.part`
    /// lives beside it; the final rename is canonical `{quant}-{sha8}.gguf`).
    pub dest: PathBuf,
    pub cancel: Arc<AtomicBool>,
    pub status: Arc<Mutex<DownloadStatus>>,
}

/// Live download status (mirrored to the UI via events + `model_downloads`).
#[derive(Debug, Clone, Default, Serialize)]
pub struct DownloadStatus {
    /// `downloading` | `done` | `error` | `cancelled` | `serving` | `served`
    pub phase: String,
    pub done_bytes: u64,
    pub total_bytes: u64,
    pub error: Option<String>,
    /// Canonical installed path once the registry write landed.
    pub path: Option<String>,
    /// Registry id (`{publisher}/{model}:{quant}`) once installed.
    pub registry_id: Option<String>,
    /// Runtime binding (model_serve): the OpenAI-compatible base URL.
    pub base_url: Option<String>,
}

static DL_COUNTER: AtomicU64 = AtomicU64::new(1);

fn models_base() -> PathBuf {
    everyaios_core::default_data_dir().join("models")
}

fn emit_download(app: &AppHandle, kind: &str, id: &str, repo: &str, filename: &str, status: &DownloadStatus) {
    let _ = app.emit(
        MODEL_DOWNLOAD_EVENT,
        serde_json::json!({
            "kind": kind,
            "id": id,
            "repo": repo,
            "filename": filename,
            "phase": status.phase,
            "doneBytes": status.done_bytes,
            "totalBytes": status.total_bytes,
            "error": status.error,
            "path": status.path,
            "registryId": status.registry_id,
            "baseUrl": status.base_url,
        }),
    );
}

/// Start (or resume) a Hugging Face GGUF/safetensors download. Idempotent:
/// an already-installed model or an in-flight download for the same file is
/// returned as-is (with `resuming` when a `.part` exists). Runs on a
/// background thread; progress lands on `model-download` events.
#[tauri::command]
pub fn model_download_start(
    app: AppHandle,
    state: State<'_, AppState>,
    repo: String,
    filename: String,
) -> Result<serde_json::Value, String> {
    let (publisher, model) = repo
        .split_once('/')
        .filter(|(p, m)| !p.is_empty() && !m.is_empty())
        .ok_or_else(|| format!("repo must be `publisher/model`, got `{repo}`"))?;
    if !filename.ends_with(".gguf") && !filename.ends_with(".safetensors") {
        return Err("only `.gguf` / `.safetensors` files can be downloaded".into());
    }

    let base = models_base();
    let quant = quant_from_filename(&filename).to_string();
    let registry_id = format!("{repo}:{quant}");
    let registry = ModelRegistry::load(base.clone());
    if registry.get(&registry_id).is_some() {
        return Ok(serde_json::json!({
            "ok": true, "alreadyInstalled": true, "id": registry_id,
        }));
    }

    let dest = base.join("hf").join(publisher).join(model).join(&filename);
    let part = part_path(&dest);
    let resume_from = std::fs::metadata(&part).map(|m| m.len()).unwrap_or(0);

    // Idempotent: an in-flight download for the same dest is returned as-is.
    {
        let map = state.model_downloads.lock().map_err(|e| e.to_string())?;
        for (id, slot) in map.iter() {
            if slot.dest == dest {
                let status = slot.status.lock().unwrap_or_else(|e| e.into_inner()).clone();
                return Ok(serde_json::json!({
                    "ok": true, "alreadyInstalled": false, "id": id,
                    "resuming": status.done_bytes > 0,
                }));
            }
        }
    }

    let id = format!("dl-{:04}", DL_COUNTER.fetch_add(1, Ordering::Relaxed));
    let cancel = Arc::new(AtomicBool::new(false));
    let status = Arc::new(Mutex::new(DownloadStatus {
        phase: "downloading".into(),
        done_bytes: resume_from,
        ..Default::default()
    }));
    {
        let mut map = state.model_downloads.lock().map_err(|e| e.to_string())?;
        map.insert(
            id.clone(),
            ModelDownloadSlot {
                repo: repo.clone(),
                filename: filename.clone(),
                dest: dest.clone(),
                cancel: Arc::clone(&cancel),
                status: Arc::clone(&status),
            },
        );
    }

    let app2 = app.clone();
    let status2 = Arc::clone(&status);
    let cancel2 = Arc::clone(&cancel);
    let base2 = base.clone();
    let dest2 = dest.clone();
    let repo2 = repo.clone();
    let filename2 = filename.clone();
    let id2 = id.clone();
    let num_ctx = everyaios_core::Config::load()
        .unwrap_or_default()
        .local
        .num_ctx;
    let publisher2 = publisher.to_string();
    let model2 = model.to_string();
    let quant2 = quant.clone();

    std::thread::spawn(move || {
        let mut last_emit = resume_from;
        let client = HfClient::new();
        let outcome = client.download(
            &repo2,
            &filename2,
            &dest2,
            &mut |done, total| {
                {
                    let mut s = status2.lock().unwrap_or_else(|e| e.into_inner());
                    s.done_bytes = done;
                    s.total_bytes = total;
                }
                if done - last_emit >= 1_000_000 || done == total {
                    last_emit = done;
                    let s = status2.lock().unwrap_or_else(|e| e.into_inner()).clone();
                    emit_download(&app2, "download", &id2, &repo2, &filename2, &s);
                }
            },
            Some(&cancel2),
        );

        let status3 = Arc::clone(&status2);
        match outcome {
            Ok(mut entry) => {
                // Canonicalize: `{quant}-{sha8}.{ext}` (entry_path's `.gguf`
                // suffix is GGUF-only; safetensors keeps its own extension).
                let sha8 = entry.sha256.get(..8).unwrap_or("").to_string();
                let ext = if filename2.ends_with(".safetensors") {
                    ".safetensors"
                } else {
                    ".gguf"
                };
                let canonical = base2
                    .join("hf")
                    .join(&publisher2)
                    .join(&model2)
                    .join(format!("{quant2}-{sha8}{ext}"));
                if canonical != dest2 {
                    let _ = std::fs::rename(&dest2, &canonical);
                }
                entry.path = canonical.to_string_lossy().into_owned();
                entry.ctx = num_ctx;
                let mut reg = ModelRegistry::load(base2.clone());
                reg.add(entry.clone());
                let _ = reg.save();
                let mut s = status3.lock().unwrap_or_else(|e| e.into_inner());
                s.phase = "done".into();
                s.done_bytes = s.total_bytes;
                s.path = Some(entry.path.clone());
                s.registry_id = Some(entry.id.clone());
                let snapshot = s.clone();
                drop(s);
                emit_download(&app2, "download", &id2, &repo2, &filename2, &snapshot);
            }
            Err(HfError::Cancelled) => {
                let mut s = status3.lock().unwrap_or_else(|e| e.into_inner());
                s.phase = "cancelled".into();
                let snapshot = s.clone();
                drop(s);
                emit_download(&app2, "download", &id2, &repo2, &filename2, &snapshot);
            }
            Err(e) => {
                let mut s = status3.lock().unwrap_or_else(|e| e.into_inner());
                s.phase = "error".into();
                s.error = Some(e.to_string());
                let snapshot = s.clone();
                drop(s);
                emit_download(&app2, "download", &id2, &repo2, &filename2, &snapshot);
            }
        }
        // Terminal states leave the slot queryable for a short window; the
        // UI refreshes `model_downloads` and the map entry is dropped here.
        if let Ok(mut map) = app2.state::<AppState>().model_downloads.lock() {
            map.remove(&id2);
        }
    });

    Ok(serde_json::json!({
        "ok": true, "alreadyInstalled": false, "id": id, "resuming": resume_from > 0,
    }))
}

/// List in-flight downloads + orphaned `.part` files (interrupted across
/// restarts — these can be resumed with `model_download_start`).
#[tauri::command]
pub fn model_downloads(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let map = state.model_downloads.lock().map_err(|e| e.to_string())?;
    let active: Vec<serde_json::Value> = map
        .iter()
        .map(|(id, slot)| {
            let s = slot.status.lock().unwrap_or_else(|e| e.into_inner()).clone();
            serde_json::json!({
                "id": id,
                "repo": slot.repo,
                "filename": slot.filename,
                "phase": s.phase,
                "doneBytes": s.done_bytes,
                "totalBytes": s.total_bytes,
                "error": s.error,
                "path": s.path,
                "registryId": s.registry_id,
            })
        })
        .collect();
    drop(map);

    let mut orphans = Vec::new();
    let base = models_base();
    let active_dests: Vec<PathBuf> = {
        let map = state.model_downloads.lock().map_err(|e| e.to_string())?;
        map.values().map(|s| s.dest.clone()).collect()
    };
    walk_parts(&base.join("hf"), &active_dests, &mut orphans);
    Ok(serde_json::json!({ "active": active, "orphans": orphans }))
}

fn walk_parts(dir: &std::path::Path, active: &[PathBuf], out: &mut Vec<serde_json::Value>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            walk_parts(&path, active, out);
            continue;
        }
        if path.extension().and_then(|e| e.to_str()) == Some("part") {
            // The active download writes `.part` at its own dest; only files
            // NOT tracked by an in-flight slot are orphans.
            let staged = path.with_extension("");
            if active.iter().any(|a| a == &staged) {
                continue;
            }
            let done = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
            let rel = path.strip_prefix(models_base()).unwrap_or(&path);
            out.push(serde_json::json!({
                "dest": staged.to_string_lossy(),
                "rel": rel.to_string_lossy(),
                "doneBytes": done,
            }));
        }
    }
}

/// Cooperative cancel: the download thread stops at the next chunk boundary
/// and keeps the `.part` file (resume via `model_download_start`).
#[tauri::command]
pub fn model_download_cancel(state: State<'_, AppState>, id: String) -> Result<serde_json::Value, String> {
    let map = state.model_downloads.lock().map_err(|e| e.to_string())?;
    match map.get(&id) {
        Some(slot) => {
            slot.cancel.store(true, Ordering::Relaxed);
            Ok(serde_json::json!({ "ok": true, "id": id }))
        }
        None => Err(format!("no active download {id}")),
    }
}

/// Installed models from the canonical registry (`index.json`) + total bytes.
#[tauri::command]
pub fn model_registry_list() -> Result<serde_json::Value, String> {
    let base = models_base();
    let registry = ModelRegistry::load(base.clone());
    let entries: Vec<serde_json::Value> = registry
        .list()
        .into_iter()
        .map(|e| {
            serde_json::json!({
                "id": e.id,
                "path": e.path,
                "sha256": e.sha256,
                "size": e.size,
                "ctx": e.ctx,
                "quant": e.quant,
                "source": e.source,
            })
        })
        .collect();
    Ok(serde_json::json!({
        "models": entries,
        "totalBytes": registry.total_bytes(),
        "baseDir": base.join("hf").to_string_lossy(),
    }))
}

/// Remove a downloaded model: registry entry + file on disk.
#[tauri::command]
pub fn model_registry_remove(id: String) -> Result<serde_json::Value, String> {
    let base = models_base();
    let mut registry = ModelRegistry::load(base.clone());
    let removed = registry
        .remove(&id)
        .ok_or_else(|| format!("model not in registry: {id}"))?;
    let _ = std::fs::remove_file(&removed.path);
    let _ = std::fs::remove_file(part_path(std::path::Path::new(&removed.path)));
    registry.save().map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "ok": true, "id": id }))
}

/// Hardware-fit quant recommendation from **live** RAM + the repo's file list
/// (the largest GGUF that fits in 60% of available RAM). Network-dependent.
#[tauri::command]
pub fn model_recommend_quant(repo: String) -> Result<serde_json::Value, String> {
    let hw = probe_hardware();
    let client = HfClient::new();
    let quant = client
        .recommend_quant(&repo, hw.available_ram_bytes)
        .map_err(|e| e.to_string())?;
    Ok(serde_json::json!({
        "quant": quant,
        "availableRamBytes": hw.available_ram_bytes,
    }))
}

/// Bind an installed model to a managed llamafile runtime (P27
/// `ModelsRuntime::serve_gguf`). Honest-fail when no llamafile binary is
/// configured. Serves on the config port; health is verified in the
/// background thread and reported via a `serve` event.
#[tauri::command]
pub fn model_serve(
    app: AppHandle,
    id: String,
) -> Result<serde_json::Value, String> {
    let base = models_base();
    let registry = ModelRegistry::load(base.clone());
    let entry = registry
        .get(&id)
        .cloned()
        .ok_or_else(|| format!("model not in registry: {id}"))?;
    let cfg = everyaios_core::Config::load().unwrap_or_default();
    let mgr = everyaios_core::LocalManager::from_config(&cfg);
    let bin = mgr
        .find_llamafile(&cfg.data_dir)
        .ok_or_else(|| "no llamafile binary found — drop one in `<data_dir>/bin` or set `EVERYAIOS_LLAMAFILE`".to_string())?;
    let port = cfg.local.llamafile_port;
    let num_ctx = cfg.local.num_ctx;

    let status = Arc::new(Mutex::new(DownloadStatus {
        phase: "serving".into(),
        ..Default::default()
    }));
    let app2 = app.clone();
    let status2 = Arc::clone(&status);
    let id2 = id.clone();
    std::thread::spawn(move || {
        let outcome = ModelsRuntime::serve_gguf(&entry, Some(&bin), port, num_ctx, None);
        let mut s = status2.lock().unwrap_or_else(|e| e.into_inner());
        match outcome {
            Ok(ep) => {
                s.phase = "served".into();
                s.base_url = Some(ep.base_url.clone());
            }
            Err(e) => {
                s.phase = "error".into();
                s.error = Some(format!("{e:?}"));
            }
        }
        let snapshot = s.clone();
        drop(s);
        emit_download(&app2, "serve", &id2, &entry.id, "", &snapshot);
    });
    Ok(serde_json::json!({
        "ok": true, "id": id, "port": port, "baseUrl": format!("http://127.0.0.1:{port}"),
        "starting": true,
    }))
}

/// Test seam parity: the registry entry shape the UI expects (used by
/// `model_registry_list` consumers; kept here so the wire shape is pinned
/// next to the commands).
#[allow(dead_code)]
fn _entry_shape(_e: &ModelEntry) {}

/// P52.1 — dry-run fit estimate (no download): file GB + ctx tokens against
/// live hardware. Returns the tier (fits/may_be_slow/wont_fit), the
/// file/KV/total split, and the default quant. Nothing is downloaded.
#[tauri::command]
pub fn model_estimate_fit(
    file_gb: f64,
    ctx_tokens: u64,
) -> Result<serde_json::Value, String> {
    let hw = probe_hardware();
    let ram_gb = hw.available_ram_bytes as f64 / 1_073_741_824.0;
    let vram_gb = hw.gpu_vram_bytes.unwrap_or(0) as f64 / 1_073_741_824.0;
    let est = everyaios_core::models::fit::estimate_fit(file_gb, ctx_tokens, ram_gb, vram_gb);
    Ok(serde_json::json!({
        "tier": est.tier,
        "fileGb": est.file_gb,
        "kvGb": est.kv_gb,
        "totalGb": est.total_gb,
        "ramGb": ram_gb,
        "vramGb": vram_gb,
        "defaultQuant": everyaios_core::models::fit::DEFAULT_QUANT,
    }))
}

/// P52.2 — parse a LocalAI-style gallery `index.yaml` (no network, no
/// install). Returns the index or a parse error.
#[tauri::command]
pub fn model_gallery_parse(yaml: String) -> Result<serde_json::Value, String> {
    let index = everyaios_catalog::gallery::load_index_yaml(&yaml).map_err(|e| e.to_string())?;
    serde_json::to_value(&index).map_err(|e| e.to_string())
}

/// P52.5 — pick the best weight build for this machine from a caller-supplied
/// candidate list (`[{repo,file,hw,quant}]`, hw ∈ npu/gpu/cpu). Pure pick —
/// download still goes through `model_download_start`.
#[tauri::command]
pub fn model_best_pick(
    hw: String,
    candidates: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let hw_class: everyaios_core::models::best::HwClass =
        serde_json::from_value(serde_json::json!(hw)).map_err(|e| format!("bad hw: {e}"))?;
    let list: Vec<everyaios_core::models::best::VariantCandidate> =
        serde_json::from_value(candidates).map_err(|e| format!("bad candidates: {e}"))?;
    Ok(
        everyaios_core::models::best::best_variant(&hw_class, &list)
            .map(|v| serde_json::to_value(v).unwrap_or(serde_json::Value::Null))
            .unwrap_or(serde_json::Value::Null),
    )
}