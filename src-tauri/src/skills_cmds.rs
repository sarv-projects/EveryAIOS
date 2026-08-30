//! P9.7 — skills-store install flow (ARCH/15 tier 3, "skills = MCP + SKILL.md").
//!
//! Closes the loop on `everyaios-guard::skillstore` (the single Ed25519-signed
//! skills index) + `everyaios-blueprint::SkillStore` (the on-disk `SKILL.md`
//! registry at `~/.everyaios/skills/`):
//!
//!   1. `skills_catalog()` — verify the bundled signed index against the pinned
//!      public key; return the rows for the UI (with per-skill capability
//!      demands = the Guard-2 consent surface) alongside what's already installed
//!      on disk.
//!   2. `skills_install(id)` — re-verify + structurally validate the index (a
//!      tampered index is rejected — no install happens), then write a `SKILL.md`
//!      into the blueprint `SkillStore`. The caller (UI) renders the consent
//!      card from `permissions` before invoking; the shell gates the write.
//!   3. `skills_uninstall(id)` — remove the skill directory.
//!
//! The app ships only the verifying public key + signed index (never the store
//! operator's signing key) — the asymmetry from `skillstore`'s trust model.

use serde::Serialize;
use tauri::State;

use crate::AppState;

/// Pinned verifying public key for the bundled skills store index (the store
/// operator's public half; the private signing key never ships in the app).
/// Regenerated with `cargo run -p everyaios-guard --example gen_skillstore_seed`.
pub const STORE_PUBLIC_KEY_B64: &str = "lvI3luTatntgPJAIeBRIFHJsYv3CQRUCMZg97OYZrT0=";

/// The bundled signed index body (canonical JSON array of `SkillRow`).
pub const STORE_INDEX_BODY: &str = r#"[{"id":"docx-assistant","name":"DOCX Assistant","version":"1.2.0","description":"Draft and format .docx documents from plain instructions.","permissions":["fs.write","tool.mcp"],"manifest":"docx-assistant"},{"id":"note-taker","name":"Note Taker","version":"0.9.0","description":"Read your notes and surface the ones relevant to the current task.","permissions":["fs.read"],"manifest":"note-taker"},{"id":"doc-scanner","name":"Document Scanner","version":"0.4.1","description":"Scan a folder for documents and summarize contents.","permissions":["fs.read","tool.mcp"],"manifest":"doc-scanner"},{"id":"email-drafter","name":"Email Drafter","version":"1.0.0","description":"Draft replies in your tone from an inbox thread.","permissions":["fs.read","tool.connector"],"manifest":"email-drafter"}]"#;

/// The matching Ed25519 signature (base64) over `STORE_INDEX_BODY`.
pub const STORE_INDEX_SIGNATURE_B64: &str =
    "9qWu8UH8qeraWOutHfGpbYfU1LaD3x5F4mMeIIqOCm82Gi+vYW5+HhUo0QQYgeTcC0aaUJaSKVpzEXzGoX0dAA==";

/// The capability floor a skill may not exceed (mirrors
/// `everyaios_guard::skillstore::RUNTIME_CAPABILITY_ALLOWLIST`).
pub const RUNTIME_CAPABILITY_ALLOWLIST: &[&str] =
    &["fs.read", "fs.write", "tool.mcp", "tool.connector"];

/// Resolve the skill-store root. Prefer `EVERYAIOS_SKILLS_DIR`; fall back to
/// the blueprint default home (`~/.everyaios/skills`).
fn skills_root() -> std::path::PathBuf {
    std::env::var_os("EVERYAIOS_SKILLS_DIR")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(everyaios_blueprint::SkillStore::default_home)
}

/// One skill row rendered to the UI (with install state).
#[derive(Debug, Clone, Serialize)]
pub struct SkillRowView {
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: String,
    pub permissions: Vec<String>,
    pub scopes_plain: Vec<String>,
    pub installed: bool,
    /// `Some(true)` = installed skill's on-disk bytes differ from its
    /// install-time sha-256 pin (mutated / upgraded out-of-band). `None` =
    /// not installed or no pin (user-authored skill).
    pub tampered: Option<bool>,
}

/// Verify the bundled signed index against the pinned key and return the rows.
fn verify_bundled() -> Result<Vec<everyaios_guard::skillstore::SkillRow>, String> {
    let signed = everyaios_guard::skillstore::SignedSkillIndex {
        body: STORE_INDEX_BODY.to_string(),
        signature_b64: STORE_INDEX_SIGNATURE_B64.to_string(),
    };
    everyaios_guard::skillstore::verify_and_validate(
        &signed,
        STORE_PUBLIC_KEY_B64,
        RUNTIME_CAPABILITY_ALLOWLIST,
    )
    .map_err(|e| e.to_string())
}

/// Read the set of installed skill names from the on-disk registry (skipping
/// malformed entries — same policy as `SkillStore::scan`).
fn installed_names() -> std::collections::BTreeSet<String> {
    let store = everyaios_blueprint::SkillStore::new(skills_root());
    match store.scan() {
        Ok(skills) => skills.into_iter().map(|s| s.manifest.name).collect(),
        Err(_) => std::collections::BTreeSet::new(),
    }
}

/// doc-75 sha-pin integrity check: has the installed skill's on-disk bytes
/// drifted from its install-time pin? `None` = not present on disk / no pin.
fn skill_tampered(store: &everyaios_blueprint::SkillStore, id: &str) -> Option<bool> {
    let path = store.root().join(id).join("SKILL.md");
    let bytes = std::fs::read(&path).ok()?;
    store.is_tampered(id, &bytes)
}

/// P9.7 — the skills-store listing: verified index rows + install state.
#[tauri::command]
pub fn skills_catalog(
    #[allow(unused)] state: State<'_, AppState>,
) -> Result<Vec<SkillRowView>, String> {
    let rows = verify_bundled()?;
    let installed = installed_names();
    let store = everyaios_blueprint::SkillStore::new(skills_root());
    Ok(rows
        .into_iter()
        .map(|r| SkillRowView {
            id: r.id.clone(),
            name: r.name.clone(),
            version: r.version.clone(),
            description: r.description.clone(),
            permissions: r.permissions.clone(),
            scopes_plain: r
                .permissions
                .iter()
                .map(|p| plain_language_scope(p).to_string())
                .collect(),
            installed: installed.contains(&r.id),
            tampered: skill_tampered(&store, &r.id),
        })
        .collect())
}

/// P9.7 — install a listed skill. The signed index is re-verified and
/// structurally validated here (a tampered index installs nothing); then a
/// `SKILL.md` is written into the blueprint `SkillStore`. The UI renders the
/// Guard-2 consent card from `permissions` *before* calling this.
#[tauri::command]
pub fn skills_install(id: String) -> Result<serde_json::Value, String> {
    let rows = verify_bundled()?;
    let row = rows
        .iter()
        .find(|r| r.id == id)
        .ok_or_else(|| format!("skill `{id}` is not in the verified store"))?;

    // Build a blueprint Skill (manifest + body) from the verified row. The
    // registry keys skills by their slug `id` (SkillStore::save validates
    // `[a-z0-9-]+`), so the manifest name is the row id, not the display name.
    let skill = everyaios_blueprint::Skill {
        manifest: everyaios_blueprint::SkillManifest {
            name: row.id.clone(),
            description: row.description.clone(),
            tools: row.permissions.clone(),
            triggers: vec![row.name.clone()],
            when_to_use: Vec::new(),
            scripts: Vec::new(),
            references: Vec::new(),
            assets: Vec::new(),
            author: "everyaios-store".into(),
            created: chrono_like_now(),
            version: row.version.clone(),
        },
        body: format!(
            "# {}\n\n{}\n\nStore-sourced skill (verified against the pinned store key). Capabilities: {}.",
            row.name,
            row.description,
            row.permissions.join(", ")
        ),
    };

    let store = everyaios_blueprint::SkillStore::new(skills_root());
    let path = store.save(&skill, true).map_err(|e| e.to_string())?;
    // doc-75 sha-pinned marketplace model: pin the skill to the exact bytes we
    // wrote, so any later on-disk mutation is detected (never silently trusted).
    store.pin(
        row.id.as_str(),
        "everyaios-store",
        row.version.as_str(),
        skill.to_skill_md().as_bytes(),
    );
    Ok(serde_json::json!({
        "id": row.id,
        "name": row.name,
        "installed": true,
        "path": path.display().to_string(),
    }))
}

/// P9.7 — uninstall a skill (removes its directory from the on-disk registry).
#[tauri::command]
pub fn skills_uninstall(name: String) -> Result<serde_json::Value, String> {
    let store = everyaios_blueprint::SkillStore::new(skills_root());
    store.delete(&name).map_err(|e| e.to_string())?;
    store.unpin(&name);
    Ok(serde_json::json!({ "id": name, "installed": false }))
}

/// Human-readable consent summary for the Guard-2 card (plain-language scopes).
pub fn plain_language_scope(permission: &str) -> &'static str {
    match permission {
        "fs.read" => "Read your files",
        "fs.write" => "Write to your files (each write is approved)",
        "tool.mcp" => "Call local + remote MCP tools",
        "tool.connector" => "Call your connected connectors (Gmail, Drive, Notion…)",
        _ => "Request an OS capability",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The embedded seed must verify against the pinned key — if the operator
    /// regenerates the index (gen_skillstore_seed) without updating the key,
    /// this fails loudly instead of shipping a broken store.
    #[test]
    fn bundled_seed_verifies() {
        let rows = verify_bundled().expect("bundled seed verifies vs pinned key");
        assert_eq!(rows.len(), 4);
        let ids: Vec<&str> = rows.iter().map(|r| r.id.as_str()).collect();
        assert!(ids.contains(&"docx-assistant"));
        assert!(ids.contains(&"email-drafter"));
        for r in &rows {
            for p in &r.permissions {
                assert!(plain_language_scope(p) != "Request an OS capability");
            }
        }
    }

    #[test]
    fn tampered_seed_rejected() {
        // A signature that no longer matches the body must reject.
        let bad = everyaios_guard::skillstore::SignedSkillIndex {
            body: r#"[{"id":"evi","name":"Evi","version":"1.0.0","description":"x","permissions":["shell.exec"],"manifest":""}]"#
                .to_string(),
            signature_b64: STORE_INDEX_SIGNATURE_B64.to_string(),
        };
        assert!(
            everyaios_guard::skillstore::verify_skill_index(&bad, STORE_PUBLIC_KEY_B64).is_err()
        );
    }
}

fn chrono_like_now() -> String {
    // A dependency-light timestamp (the shell already carries `time`, but a
    // stable YYYY-MM-DD is enough for the ownership marker).
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let days = secs / 86_400;
    let (y, m, d) = civil_from_days(days as i64);
    format!("{y:04}-{m:02}-{d:02}")
}

/// Days→civil date (Howard Hinnant's algorithm). Not `time`-crate-dependent.
fn civil_from_days(z: i64) -> (i64, i64, i64) {
    let z = z + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as i64;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    (y, m, d)
}
