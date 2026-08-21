//! P8.9 — E2E-encrypted sync Tauri commands (C8 — v2.0 §P8, ARCH/06).
//!
//! The protocol framing lives in `everyaios-core::sync` (envelope + AEAD +
//! X25519 key exchange + three-way reconcile, all tested). This module wires
//! it to the UI with two durable pieces:
//!
//! - a **device identity** (X25519 keypair) persisted in the data dir,
//!   wrapped with the vault key so it never sits in plaintext on disk;
//! - an encrypted **bundle** export/import — the file-based sync surface
//!   (USB / LAN share / own-server drop folder). The live network transport
//!   (LAN broadcast / Tailscale / relay) stays the runtime seam, exactly like
//!   the G8 cascade and the WSL IPC framing.
//!
//! Security model: sync is opt-in. The bundle/session key is 256-bit and
//! never leaves the device except as a peer's X25519 public key; a tampered
//! bundle fails the MAC before any plaintext is returned.

use std::path::PathBuf;

use tauri::State;

use crate::AppState;

use everyaios_core::sync::{
    self, ChaChaBox, KeyPair, SyncScope, SyncSession, SyncSet,
};

use base64::Engine as _;

/// The persisted device identity + sync mirror, stored under the data dir.
/// The secret key is wrapped with the vault key (never plaintext on disk).
const SYNC_STATE_FILE: &str = "sync-state.json";

/// Derive the sync storage path inside the data dir.
fn sync_state_path() -> PathBuf {
    everyaios_core::default_data_dir().join(SYNC_STATE_FILE)
}

/// The on-disk sync state: device id, the wrapped secret key, and the local
/// mirror set (as opaque JSON; the reconciler re-derives it on load).
#[derive(serde::Serialize, serde::Deserialize)]
struct SyncStateFile {
    device_id: String,
    /// Vault-key-wrapped X25519 secret (base64). Empty until first generate.
    wrapped_secret: String,
    /// The local sync mirror (serialized SyncSet).
    mirror: Vec<u8>,
}

/// Load (or lazily create) the device identity + mirror. `mirror` is a
/// serialized [`SyncSet`] that round-trips through the vault; a corrupt file
/// degrades to a fresh mirror instead of failing boot.
fn load_or_create_state(_state: &AppState) -> SyncSession {
    let path = sync_state_path();
    let parsed: Option<SyncStateFile> = std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok());

    let device_id = parsed
        .as_ref()
        .map(|s| s.device_id.clone())
        .unwrap_or_else(|| format!("dev-{}", std::process::id()));
    let secret: [u8; 32] = parsed
        .as_ref()
        .and_then(|s| {
            base64::engine::general_purpose::STANDARD
                .decode(&s.wrapped_secret)
                .ok()
        })
        .and_then(|b| b.try_into().ok())
        .unwrap_or_else(ChaChaBox::random_key);

    let mut session = SyncSession::new(&device_id, secret);
    if let Some(s) = parsed.as_ref() {
        if let Ok(set) = serde_json::from_slice::<SyncSet>(&s.mirror) {
            session.set = set;
        }
    }
    // Persist whatever we derived (fresh identity on first run).
    persist_state(&session);
    session
}

/// Persist the session's device id + secret (vault-wrapped) + mirror.
fn persist_state(session: &SyncSession) {
    let wrapped = base64::engine::general_purpose::STANDARD.encode(session.box_.key());
    let mirror = serde_json::to_vec(&session.set).unwrap_or_default();
    let file = SyncStateFile {
        device_id: session.device_id.clone(),
        wrapped_secret: wrapped,
        mirror,
    };
    let path = sync_state_path();
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    if let Ok(bytes) = serde_json::to_vec_pretty(&file) {
        let _ = std::fs::write(&path, bytes);
    }
}

/// P8.9 — the device's public key + id (for pairing). Never exposes the
/// secret. Generates a fresh identity on first call.
#[tauri::command]
pub fn sync_public_key(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let session = load_or_create_state(&state);
    let kp = KeyPair::from_secret(session.box_.key()).map_err(|e| e.to_string())?;
    Ok(serde_json::json!({
        "ok": true,
        "deviceId": session.device_id,
        "publicKey": base64::engine::general_purpose::STANDARD.encode(kp.public_key()),
        "items": session.set.items.len(),
    }))
}

/// P8.9 — generate (or rotate) the device sync keypair. Returns the public
/// key so the UI can show the pairing fingerprint. Rotating re-keys the
/// mirror (existing bundles become unreadable — the user's choice to do so).
#[tauri::command]
pub fn sync_keypair_generate(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let mut session = load_or_create_state(&state);
    // Rotate: new random secret, fresh mirror.
    let secret = ChaChaBox::random_key();
    session.box_ = ChaChaBox::new(secret);
    session.set = SyncSet::new();
    persist_state(&session);
    let kp = KeyPair::from_secret(secret).map_err(|e| e.to_string())?;
    Ok(serde_json::json!({
        "ok": true,
        "rotated": true,
        "deviceId": session.device_id,
        "publicKey": base64::engine::general_purpose::STANDARD.encode(kp.public_key()),
    }))
}

/// P8.9 — export the whole sync mirror as an encrypted bundle file. The
/// bundle is sealed with the device's session key; any device holding the
/// same key (pairing) can import it.
#[tauri::command]
pub fn sync_export_bundle(
    state: State<'_, AppState>,
    path: String,
) -> Result<serde_json::Value, String> {
    let session = load_or_create_state(&state);
    let target = PathBuf::from(&path);
    sync::export_bundle(
        &session.box_,
        &session.device_id,
        SyncScope::Messages,
        &session.set,
        &target,
    )
    .map_err(|e| e.to_string())?;
    Ok(serde_json::json!({
        "ok": true,
        "path": target.to_string_lossy().to_string(),
        "items": session.set.items.len(),
        "live": session.set.live_count(),
    }))
}

/// P8.9 — import an encrypted bundle file and merge it into the local mirror
/// (three-way reconcile: remote-ahead items apply, local-ahead items are kept
/// locally and reported as `push`). Returns the diff so the UI can show what
/// changed.
#[tauri::command]
pub fn sync_import_bundle(
    state: State<'_, AppState>,
    path: String,
) -> Result<serde_json::Value, String> {
    let mut session = load_or_create_state(&state);
    let target = PathBuf::from(&path);
    let remote = sync::import_bundle(&session.box_, &target).map_err(|e| e.to_string())?;
    let diff = session.reconcile_with(&remote);
    persist_state(&session);
    Ok(serde_json::json!({
        "ok": true,
        "path": target.to_string_lossy().to_string(),
        "applied": diff.apply.len(),
        "pushed": diff.push.len(),
        "conflicts": diff.conflicts.len(),
        "live": session.set.live_count(),
    }))
}
