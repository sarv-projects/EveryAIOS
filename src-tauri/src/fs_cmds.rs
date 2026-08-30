//! P11.5.3 — real-filesystem Tauri commands for the folder view (tree over
//! the live disk), the code view (open/save a real file), and the diff view
//! (pending agent undo snapshots). No mock layer: every command talks to the
//! actual filesystem via `std::fs`.
//!
//! Honest ceilings: reads are capped at 2 MB of text (a code-view guard, not
//! a real limit — binary files report `binary: true` and are not loaded);
//! writes are plain text writes (no atomic rename here — office engines keep
//! their own atomic writers). Paths are user-supplied from the view; the app
//! never enumerates hidden system dirs by default.

use std::path::PathBuf;

use tauri::State;

use crate::AppState;

/// Text-size cap for `fs_read_file` (code view). Larger files report
/// `truncated: true` so the editor can show a notice instead of a blank.
const MAX_TEXT_BYTES: u64 = 2 * 1024 * 1024;

/// Resolve the user's home directory (works on all three platforms).
#[tauri::command]
pub fn fs_home() -> Result<String, String> {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(|p| PathBuf::from(p).display().to_string())
        .ok_or_else(|| "no home directory found".to_string())
}

/// List a directory as sorted entries (dirs first, then files, alpha).
#[tauri::command]
pub fn fs_list_dir(path: String) -> Result<serde_json::Value, String> {
    let dir = PathBuf::from(&path);
    let meta = std::fs::metadata(&dir).map_err(|e| format!("{path}: {e}"))?;
    if !meta.is_dir() {
        return Err(format!("{path}: not a directory"));
    }
    let mut entries: Vec<serde_json::Value> = Vec::new();
    for ent in std::fs::read_dir(&dir).map_err(|e| format!("{path}: {e}"))? {
        let ent = ent.map_err(|e| format!("{path}: {e}"))?;
        let name = ent.file_name().to_string_lossy().into_owned();
        // Skip obvious noise so the tree stays navigable.
        if name == ".DS_Store" || name == "Thumbs.db" {
            continue;
        }
        let ft = ent.file_type().map_err(|e| format!("{name}: {e}"))?;
        let is_dir = ft.is_dir();
        let is_symlink = ft.is_symlink();
        let mut size: Option<u64> = None;
        let mut modified: Option<String> = None;
        if let Ok(m) = ent.metadata() {
            if m.is_file() {
                size = Some(m.len());
            }
            if let Ok(t) = m.modified() {
                if let Ok(d) = t.duration_since(std::time::UNIX_EPOCH) {
                    modified = Some(d.as_millis().to_string());
                }
            }
        }
        entries.push(serde_json::json!({
            "name": name,
            "dir": is_dir,
            "symlink": is_symlink,
            "size": size,
            "modified": modified,
        }));
    }
    entries.sort_by(|a, b| {
        let ad = a["dir"].as_bool().unwrap_or(false);
        let bd = b["dir"].as_bool().unwrap_or(false);
        bd.cmp(&ad).then_with(|| {
            a["name"]
                .as_str()
                .unwrap_or("")
                .to_lowercase()
                .cmp(&b["name"].as_str().unwrap_or("").to_lowercase())
        })
    });
    Ok(serde_json::json!({
        "path": path,
        "parent": dir.parent().map(|p| p.display().to_string()),
        "entries": entries,
    }))
}

/// Read a file as UTF-8 text (capped at 2 MB). Binary/oversized files report
/// flags instead of failing, so the code view can render an honest notice.
#[tauri::command]
pub fn fs_read_file(path: String) -> Result<serde_json::Value, String> {
    let p = PathBuf::from(&path);
    let meta = std::fs::metadata(&p).map_err(|e| format!("{path}: {e}"))?;
    if meta.len() > MAX_TEXT_BYTES {
        return Ok(serde_json::json!({
            "path": path,
            "name": p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(),
            "content": "",
            "sizeBytes": meta.len(),
            "truncated": true,
        }));
    }
    let bytes = std::fs::read(&p).map_err(|e| format!("{path}: {e}"))?;
    let content = match String::from_utf8(bytes.clone()) {
        Ok(s) => s,
        Err(_) => {
            return Ok(serde_json::json!({
                "path": path,
                "name": p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(),
                "content": "",
                "sizeBytes": meta.len(),
                "binary": true,
            }));
        }
    };
    Ok(serde_json::json!({
        "path": path,
        "name": p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(),
        "content": content,
        "sizeBytes": meta.len(),
        "truncated": false,
        "binary": false,
    }))
}

/// Write UTF-8 text to a file (creates/overwrites). Used by the code view's
/// Save. The parent must already exist.
#[tauri::command]
pub fn fs_write_file(path: String, content: String) -> Result<serde_json::Value, String> {
    let p = crate::control::floor_user_file(&path)?;
    if let Some(parent) = p.parent() {
        if !parent.as_os_str().is_empty() && !parent.exists() {
            return Err(format!("{path}: parent directory does not exist"));
        }
    }
    std::fs::write(&p, content.as_bytes()).map_err(|e| format!("{path}: {e}"))?;
    Ok(serde_json::json!({ "path": path, "bytes": content.len() }))
}

/// P41.3 — Ticketed editor write, request half: mints a Guard-2 ticket for a
/// buffer write (I12 — everything ticketed; no silent autosaves). The card
/// carries a bounded before/after diff preview; the write itself happens ONLY
/// in [`fs_write_commit`] after `use_ticket` (approval + single-use +
/// args-hash match). Returns `action: allow` (policy auto-approved) or
/// `action: ask` (pending card the guard panel renders).
#[tauri::command]
pub fn fs_write_ticket(
    state: State<'_, AppState>,
    path: String,
    content: String,
) -> Result<serde_json::Value, String> {
    use everyaios_guard::{Operation as GuardOp, RiskLevel};
    use std::hash::{Hash, Hasher};

    // The before-image (for the diff card); missing file = creation.
    let path = crate::control::floor_user_file(&path)?
        .display()
        .to_string();
    let before = std::fs::read_to_string(&path).unwrap_or_default();
    let preview = diff_preview(&before, &content);

    let decision = everyaios_guard::DecisionPackage::new(format!(
        "Write {}",
        std::path::Path::new(&path)
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
    ))
    .with_risk(RiskLevel::Medium)
    .with_paths(vec![path.clone()]);

    let mut h = std::collections::hash_map::DefaultHasher::new();
    "editor.file_write".hash(&mut h);
    path.hash(&mut h);
    content.hash(&mut h);
    let args_hash = format!("{:016x}", h.finish());

    let mut guard = state.guard_service.lock().map_err(|e| e.to_string())?;
    let verdict = guard.evaluate(
        "editor",
        "everyaios",
        "editor.file_write",
        GuardOp::GenericWrite,
        decision,
        &args_hash,
        0,
    );
    match verdict {
        everyaios_core::GuardDecision::Allow { ticket_id } => {
            let approval_nonce = guard.approval_nonce(&ticket_id).unwrap_or("").to_string();
            Ok(serde_json::json!({
                "action": "allow",
                "ticketId": ticket_id,
                "approvalNonce": approval_nonce,
                "preview": preview,
            }))
        }
        everyaios_core::GuardDecision::Ask { ticket_id } => {
            let approval_nonce = guard.approval_nonce(&ticket_id).unwrap_or("").to_string();
            Ok(serde_json::json!({
                "action": "ask",
                "ticketId": ticket_id,
                "approvalNonce": approval_nonce,
                "preview": preview,
            }))
        }
        everyaios_core::GuardDecision::Block { reason } => Err(format!("write blocked: {reason}")),
    }
}

/// P41.3 — Ticketed editor write, executor half: consumes the (mandatory)
/// single-use ticket (`use_ticket` — approval + args-hash match), then
/// writes. No ticket, no write: the editor never silently autosaves into the
/// workspace.
#[tauri::command]
pub fn fs_write_commit(
    state: State<'_, AppState>,
    path: String,
    content: String,
    ticket_id: String,
) -> Result<serde_json::Value, String> {
    use std::hash::{Hash, Hasher};

    let mut h = std::collections::hash_map::DefaultHasher::new();
    "editor.file_write".hash(&mut h);
    path.hash(&mut h);
    content.hash(&mut h);
    let args_hash = format!("{:016x}", h.finish());

    let mut guard = state.guard_service.lock().map_err(|e| e.to_string())?;
    guard
        .use_ticket(&ticket_id, &args_hash)
        .map_err(|e| e.to_string())?;
    drop(guard); // never hold the guard lock across a disk write

    let p = std::path::PathBuf::from(&path);
    std::fs::write(&p, content.as_bytes()).map_err(|e| format!("{path}: {e}"))?;
    Ok(serde_json::json!({ "path": path, "bytes": content.len(), "ticketId": ticket_id }))
}

/// A bounded before/after diff preview for the approval card (first 12 lines
/// each; the full diff renders in the Diff rail).
fn diff_preview(before: &str, after: &str) -> serde_json::Value {
    let head = |s: &str| s.lines().take(12).collect::<Vec<_>>().join("\n");
    serde_json::json!({ "before": head(before), "after": head(after) })
}

/// List the pending agent undo snapshots (`file_undos`) — the real patch set
/// the diff view renders. Each row is a file the agent mutated this session,
/// with its pre-mutation snapshot available for a restore or a diff.
#[tauri::command]
pub fn fs_undo_list(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let undos = state.file_undos.lock().map_err(|e| e.to_string())?;
    let rows: Vec<serde_json::Value> = undos
        .iter()
        .map(|u| {
            let before_bytes = u.before.as_ref().map(|b| b.len()).unwrap_or(0);
            serde_json::json!({
                "sessionId": u.session_id,
                "path": u.path.display().to_string(),
                "beforeBytes": before_bytes,
            })
        })
        .collect();
    Ok(serde_json::json!({ "undos": rows, "count": rows.len() }))
}
