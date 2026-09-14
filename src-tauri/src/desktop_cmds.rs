//! P48.3 — E9 desktop computer-use effect-funnel seam.
//!
//! `everyaios-desktop` is a *library* engine (see/read/act/verify); this
//! module is the host wiring that the crate's own docs require: "the desktop
//! host wires `policy::PermissionGate` to the ticket store and `AuditSink` to
//! the Merkle audit chain, exactly like every other effect in the product."
//!
//! **human-gesture path** (`desktop_act` / see / read). The agent catalog
//! already lists `desktop.windows` / `desktop.read` / `desktop.act` in
//! `ToolService` (P48.3), but the autonomous agent tool `attach_desktop` is
//! not wired into the agent loop — a live agent turn gets `desktop session not
//! attached`. The human Settings/Computer-use surfaces use the explicit
//! `desktop_attach` Tauri probe instead; wiring the agent tool into the loop
//! (plus the remaining P57/P59 seams) is still open.
//!
//! Gating model (fail-closed, per the spec's dual-guard + honesty invariant):
//! each human `act` is routed through the engine's own Guard-2 preflight. The
//! preflight lets **routine/navigational** acts through (Allow on an
//! allow-listed app); **risky classes** (Delete / Money / Install / Captcha /
//! Transmit) reach the human `PermissionGate` seam, which this host backs
//! with a Deny-by-default gate so nothing risky silently executes. Every
//! decision and every executed act is audited via `control::record_mutation`
//! with `human_gesture` provenance (same Merkle chain as every other effect).

use std::sync::Arc;
use tauri::{Manager, State};

use crate::AppState;

/// The lazy desktop engine held in `AppState`. `None` until a successful
/// platform backend attach; on headless / no-display it honest-fails (matches
/// the "honest-fail → live" browser posture). Also caches an `AppHandle` so
/// the engine's Guard-2 audit sink can reach `record_mutation`.
#[derive(Default)]
pub struct DesktopSlot {
    engine: Option<Arc<everyaios_computeruse::DesktopEngine>>,
    /// Why the engine is unavailable when `None` (empty until first attempt).
    last_error: Option<String>,
    /// The audit sink bridge (holds the `AppHandle` to feed the Merkle chain).
    sink: Option<Arc<AuditSinkToChain>>,
    /// P57.8 — the installed-app inventory. The disk scan happens once per
    /// session (installed apps do not appear mid-session); Settings filtering
    /// reads this cache, so typing in the picker costs no filesystem work.
    apps: Option<Vec<everyaios_computeruse::InstalledApp>>,
}

/// P57.8 — the persisted desktop policy (`<data_dir>/desktop.json`).
///
/// One file is the source of truth for the allow-list paths, the legacy name
/// allow-list, strict mode, safe zones and the interaction default, read at
/// attach time and written by every Settings change, so the live Guard-2
/// preflight and the surface can never disagree about what is in use. A
/// malformed file degrades to the local default (no allow-list), never to a
/// partially trusted one.
pub fn policy_path() -> std::path::PathBuf {
    everyaios_core::default_data_dir().join("desktop.json")
}

pub fn load_policy() -> everyaios_computeruse::AppPolicy {
    std::fs::read(policy_path())
        .ok()
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or_default()
}

fn save_policy(policy: &everyaios_computeruse::AppPolicy) -> Result<(), String> {
    let path = policy_path();
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| format!("create data dir: {e}"))?;
    }
    let json = serde_json::to_vec_pretty(policy).map_err(|e| format!("encode: {e}"))?;
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, &json).map_err(|e| format!("write: {e}"))?;
    std::fs::rename(&tmp, &path).map_err(|e| format!("rename: {e}"))
}

fn policy_json(policy: &everyaios_computeruse::AppPolicy) -> serde_json::Value {
    serde_json::json!({
        "allowList": policy.allow_list,
        "allowPaths": policy.allow_paths,
        "strict": policy.strict,
        "interactionDefault": policy.interaction_mode.as_str(),
        "allowsRaisingWindows": policy.allows_raising_windows(),
    })
}

/// P57.8 — write the policy through: persist, then apply to the live engine
/// when one is attached. `appliedLive=false` means the file is what the next
/// attach will read (the response says which, so the UI never implies a live
/// change it did not make).
fn commit_policy(
    state: &State<'_, AppState>,
    policy: &everyaios_computeruse::AppPolicy,
) -> Result<bool, String> {
    save_policy(policy)?;
    let mut applied = false;
    let slot = state.desktop.lock().map_err(|e| e.to_string())?;
    if let Some(engine) = slot.engine.as_ref() {
        engine.set_policy(policy.clone());
        applied = true;
    }
    Ok(applied)
}

/// Fail-closed human gate: the engine's preflight already lets routine acts
/// through on allow-listed apps; this gate only fires when the policy needs a
/// human confirmation for a risky class (Delete / Money / Install / Captcha /
/// Transmit). Auto-approving those from a Tauri command is never acceptable,
/// so we Deny. (A future Guard-2 card surface may render these; until then
/// they fail closed — never silent.)
struct FailClosedGate;

impl everyaios_computeruse::policy::PermissionGate for FailClosedGate {
    fn request(
        &self,
        _act: &everyaios_computeruse::types::ActKind,
        _class: everyaios_computeruse::policy::ConfirmClass,
    ) -> everyaios_computeruse::policy::GateDecision {
        everyaios_computeruse::policy::GateDecision::Deny
    }
}

/// Bridges the engine's Guard-2 `AuditSink` to the same Merkle chain every
/// other effect uses (`control::record_mutation`, human-gesture provenance).
/// `record_mutation` itself injects `authorization: human_gesture`. The shared
/// `Arc` inner lets the single engine instance (and a clone passed to the
/// engine) both see the app handle installed at attach time.
#[derive(Clone)]
struct AuditSinkToChain {
    app: std::sync::Arc<std::sync::Mutex<Option<tauri::AppHandle>>>,
}

impl Default for AuditSinkToChain {
    fn default() -> Self {
        Self {
            app: std::sync::Arc::new(std::sync::Mutex::new(None)),
        }
    }
}

impl everyaios_computeruse::policy::AuditSink for AuditSinkToChain {
    fn write(&self, kind: &str, payload: serde_json::Value) {
        let app = self.app.lock().ok().and_then(|a| a.clone());
        if let Some(app) = app {
            let state = app.state::<AppState>();
            crate::control::record_mutation(
                &state,
                crate::control::AuthKind::HumanGesture,
                kind,
                payload,
            );
        }
    }
}

/// Get-or-lazily-attach the engine, caching a shared handle to the audit sink
/// so the Guard-2 bridge can reach `record_mutation` on later calls.
fn get_or_attach(
    state: &State<'_, AppState>,
    app: &tauri::AppHandle,
) -> Result<Arc<everyaios_computeruse::DesktopEngine>, String> {
    {
        let mut slot = state.desktop.lock().map_err(|e| e.to_string())?;
        if let Some(engine) = slot.engine.as_ref() {
            return Ok(Arc::clone(engine));
        }
        let sink = AuditSinkToChain::default();
        let slot_sink = Arc::new(sink.clone());
        // P57.8 — the attach reads the persisted policy, so an allow-list row
        // added in a previous session is in force before the first action.
        match everyaios_computeruse::DesktopEngine::new(
            load_policy(),
            Box::new(FailClosedGate),
            Box::new(sink),
        ) {
            Ok(engine) => {
                let engine = Arc::new(engine);
                // Install the app handle ONCE (both the engine's copy and our
                // retained copy share the same Arc inner), so the engine's
                // Guard-2 audits reach `record_mutation` on the live chain.
                *slot_sink.app.lock().map_err(|e| e.to_string())? = Some(app.clone());
                slot.engine = Some(Arc::clone(&engine));
                slot.sink = Some(slot_sink);
                slot.last_error = None;
                Ok(engine)
            }
            Err(e) => {
                let msg = format!("desktop engine unavailable: {e}");
                slot.last_error = Some(msg.clone());
                Err(msg)
            }
        }
    }
}

fn window_of(id: u64) -> everyaios_computeruse::WindowInfo {
    everyaios_computeruse::WindowInfo {
        id,
        title: String::new(),
        app: String::new(),
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        has_a11y_tree: false,
    }
}

/// Flatten a11y tree → `[index] role: name` lines (the "text read" of desktop).
fn render_tree(root: &everyaios_computeruse::ReadNode) -> String {
    root.flatten()
        .into_iter()
        .map(|n| {
            let label = if n.name.is_empty() {
                n.role.clone()
            } else {
                format!("{} {}", n.role, n.name)
            };
            format!("[{}] {}", n.index_path, label)
        })
        .collect::<Vec<_>>()
        .join("\n")
}

/// Capability surface + attach state + the derived H4 readiness (the honest
/// "what can this machine do, is it allowed to, and is the engine live" probe
/// the UI rail dot and the Settings chip read).
#[tauri::command]
pub fn desktop_status(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let slot = state.desktop.lock().map_err(|e| e.to_string())?;
    match slot.engine.as_ref() {
        Some(engine) => {
            let c = engine.capabilities();
            let policy = engine.policy();
            let read = everyaios_computeruse::derive_readiness(
                Some(&c),
                &policy,
                engine.guard().kill.is_stopped(),
                None,
            );
            Ok(serde_json::json!({
                "attached": true,
                "interactionDefault": policy.interaction_mode.as_str(),
                "readiness": { "state": read.state.as_str(), "detail": read.detail, "usable": read.usable },
                "capabilities": {
                    "see": format!("{:?}", c.see),
                    "see_occluded": c.see_occluded,
                    "uia_tree": c.uia_tree,
                    "invoke_set_value": c.invoke_set_value,
                    "send_input": c.send_input,
                    "background_input": c.background_input,
                    "ocr": c.ocr,
                    "window_list": c.window_list,
                    "launch_app": c.launch_app,
                },
            }))
        }
        None => {
            // H4 — an unattached driver is `driver_missing` with the attach
            // error verbatim, never a green dot over a dead engine.
            let policy = load_policy();
            let read = everyaios_computeruse::derive_readiness(
                None,
                &policy,
                false,
                slot.last_error.as_deref(),
            );
            Ok(serde_json::json!({
                "attached": false,
                "reason": slot.last_error,
                "interactionDefault": policy.interaction_mode.as_str(),
                "readiness": { "state": read.state.as_str(), "detail": read.detail, "usable": read.usable },
            }))
        }
    }
}

/// Explicit user-triggered attach/probe. Passive `desktop_status` intentionally
/// does not open a platform handle or request desktop permissions; Settings and
/// the Computer-use view call this command when the user asks to measure the
/// live capability surface. Attach failure is returned as an honest status so
/// the UI can render the derived H4 state instead of a generic IPC error.
#[tauri::command]
pub fn desktop_attach(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<serde_json::Value, String> {
    let _ = get_or_attach(&state, &app);
    desktop_status(state)
}

/// List native windows (read-only; estop-guarded, not a mutation).
#[tauri::command]
pub fn desktop_windows(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<serde_json::Value, String> {
    let engine = get_or_attach(&state, &app)?;
    let windows = engine
        .list_windows()
        .map_err(|e| e.to_string())?
        .into_iter()
        .map(|w| {
            serde_json::json!({
                "id": w.id, "title": w.title, "app": w.app,
                "x": w.x, "y": w.y, "width": w.width, "height": w.height,
            })
        })
        .collect::<Vec<_>>();
    Ok(serde_json::json!({ "windows": windows }))
}

/// Text read of a window via the a11y tree. Read-only (estop-guarded, not a
/// mutation; no Merkle row is expected for a read).
#[tauri::command]
pub fn desktop_read(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
    window_id: u64,
) -> Result<serde_json::Value, String> {
    let engine = get_or_attach(&state, &app)?;
    let read = engine
        .read(&window_of(window_id))
        .map_err(|e| e.to_string())?;
    let text = read.tree.as_ref().map(render_tree).unwrap_or_default();
    Ok(serde_json::json!({
        "tree": text,
        "has_tree": read.tree.is_some(),
        "dpi_scale": read.dpi_scale,
    }))
}

/// Capture a window (`see`), returning PNG bytes as base64 for the UI.
/// Read-only (estop-guarded, not a mutation).
#[tauri::command]
pub fn desktop_see(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
    window_id: u64,
) -> Result<serde_json::Value, String> {
    let engine = get_or_attach(&state, &app)?;
    let result = engine
        .see(&window_of(window_id))
        .map_err(|e| e.to_string())?;
    use base64::Engine;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&result.png);
    Ok(serde_json::json!({ "png": b64, "width": result.width, "height": result.height }))
}

/// Parse the wire act-kind vocabulary into an [`everyaios_computeruse::ActKind`].
/// Shared by `desktop_act` and the P57.4 escalation pair so both see the exact
/// same act.
#[allow(clippy::too_many_arguments)]
fn parse_act(
    kind: &str,
    x: Option<i32>,
    y: Option<i32>,
    name: Option<String>,
    text: Option<String>,
) -> Result<everyaios_computeruse::ActKind, String> {
    Ok(match kind {
        "click" => everyaios_computeruse::ActKind::Click {
            x: x.unwrap_or(0),
            y: y.unwrap_or(0),
        },
        "clickByName" => everyaios_computeruse::ActKind::ClickByName {
            name: name.ok_or("name required for clickByName")?,
        },
        "type" => everyaios_computeruse::ActKind::Type {
            text: text.ok_or("text required for type")?,
        },
        "setValue" => everyaios_computeruse::ActKind::SetValue {
            name: name.ok_or("name required for setValue")?,
            value: text.ok_or("value required for setValue")?,
        },
        "scroll" => everyaios_computeruse::ActKind::Scroll {
            x: x.unwrap_or(0),
            y: y.unwrap_or(0),
            delta: y.unwrap_or(0),
        },
        // P57.1 — launch the allow-listed program by its canonical path. A
        // launch with no path falls back to the name form, which resolves
        // through PATH in the backend. Guard-2 evaluates the **launch target**
        // as the subject, so an app has to be allow-listed in Settings →
        // Computer use before this can proceed.
        "launch" => match text.filter(|t| !t.trim().is_empty()) {
            Some(path) => everyaios_computeruse::ActKind::launch_path(path),
            None => everyaios_computeruse::ActKind::launch_by_name(
                name.ok_or("launch requires a path (text) or an app name")?,
            ),
        },
        other => return Err(format!("unsupported desktop act kind: {other}")),
    })
}

/// Execute ONE human-initiated desktop act, through the engine's Guard-2 gate
/// and audited on the same Merkle chain as every other effect. Fail-closed:
/// risky classes are Denied by `FailClosedGate`; hard-denied apps never run.
#[tauri::command]
#[allow(clippy::too_many_arguments)] // Tauri command signature — fixed arity by contract
pub fn desktop_act(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
    window_id: u64,
    kind: String,
    x: Option<i32>,
    y: Option<i32>,
    name: Option<String>,
    text: Option<String>,
) -> Result<serde_json::Value, String> {
    let engine = get_or_attach(&state, &app)?;
    let act = parse_act(&kind, x, y, name, text)?;
    let outcome = engine
        .act(&window_of(window_id), &act, None)
        .map_err(|e| e.to_string())?;

    // Every executed-or-declined act is audited with human_gesture provenance.
    crate::control::record_mutation(
        &state,
        crate::control::AuthKind::HumanGesture,
        "desktop.act",
        serde_json::json!({
            "act": act.describe(),
            "window_id": window_id,
            "executed": outcome.ok && outcome.error.is_none(),
            "error": outcome.error,
        }),
    );

    if let Some(err) = outcome.error {
        return Err(format!("desktop.act declined: {err}"));
    }
    Ok(serde_json::json!({ "ok": true, "act": act.describe() }))
}

/// P57.4 — does this act need a foreground escalation under the current
/// interaction default? Pure read: the UI renders the Guard-2 card from this
/// and nothing moves.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn desktop_escalation(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
    window_id: u64,
    kind: String,
    x: Option<i32>,
    y: Option<i32>,
    name: Option<String>,
    text: Option<String>,
) -> Result<serde_json::Value, String> {
    let engine = get_or_attach(&state, &app)?;
    let act = parse_act(&kind, x, y, name, text)?;
    serde_json::to_value(engine.escalation_for(&window_of(window_id), &act))
        .map_err(|e| e.to_string())
}

/// P57.4 — run an act that needs a foreground escalation, **only** with an
/// explicit human gesture. Without one the escalation is returned as a refusal
/// (nothing is raised). With one, the previous foreground window is snapshotted,
/// the default is switched to Foreground for this single act, and both are
/// restored afterwards; the outcome (including an honest restore failure) is
/// audited with human_gesture provenance.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn desktop_act_escalating(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
    window_id: u64,
    kind: String,
    gesture_approved: bool,
    x: Option<i32>,
    y: Option<i32>,
    name: Option<String>,
    text: Option<String>,
) -> Result<serde_json::Value, String> {
    let engine = get_or_attach(&state, &app)?;
    let act = parse_act(&kind, x, y, name, text)?;
    let snapshot = engine.foreground_snapshot();
    let outcome = engine
        .act_escalating(&window_of(window_id), &act, None, gesture_approved)
        .map_err(|e| e.to_string())?;
    crate::control::record_mutation(
        &state,
        crate::control::AuthKind::HumanGesture,
        "desktop.act.escalated",
        serde_json::json!({
            "act": act.describe(),
            "window_id": window_id,
            "gestureApproved": gesture_approved,
            "previousForeground": snapshot.window_id,
            "executed": outcome.ok && outcome.error.is_none(),
            "error": outcome.error,
        }),
    );
    if let Some(err) = outcome.error {
        return Err(format!("desktop.act.escalated declined: {err}"));
    }
    Ok(serde_json::json!({
        "ok": true,
        "act": act.describe(),
        "escalated": gesture_approved,
        "restored": snapshot.window_id,
    }))
}

/// Emergency stop — trips the engine's kill switch so every further op fails
/// closed.
#[tauri::command]
pub fn desktop_stop(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let slot = state.desktop.lock().map_err(|e| e.to_string())?;
    if let Some(engine) = slot.engine.as_ref() {
        engine.emergency_stop();
    }
    Ok(serde_json::json!({ "stopped": true }))
}

// ==== P57.8 — Settings → Computer use ========================================

/// The current policy + derived readiness (the section's first read).
#[tauri::command]
pub fn desktop_policy_get(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let slot = state.desktop.lock().map_err(|e| e.to_string())?;
    let (policy, caps, killed) = match slot.engine.as_ref() {
        Some(engine) => (
            engine.policy(),
            Some(engine.capabilities()),
            engine.guard().kill.is_stopped(),
        ),
        None => (load_policy(), None, false),
    };
    let read = everyaios_computeruse::derive_readiness(
        caps.as_ref(),
        &policy,
        killed,
        slot.last_error.as_deref(),
    );
    Ok(serde_json::json!({
        "policy": policy_json(&policy),
        "attached": slot.engine.is_some(),
        "readiness": { "state": read.state.as_str(), "detail": read.detail, "usable": read.usable },
    }))
}

/// The installed-app inventory, filtered by `query` (all-character match over
/// name + path). Cached per session; `refresh: true` re-scans the disk.
#[tauri::command]
pub fn desktop_apps(
    state: State<'_, AppState>,
    query: Option<String>,
    refresh: Option<bool>,
) -> Result<serde_json::Value, String> {
    let policy = load_policy();
    let mut slot = state.desktop.lock().map_err(|e| e.to_string())?;
    let rescan = refresh.unwrap_or(false) || slot.apps.is_none();
    if rescan {
        // The filesystem scan is session-cached; policy annotations are
        // refreshed below on every read so an Add/Remove write is visible
        // immediately without rescanning application directories.
        slot.apps = Some(everyaios_computeruse::installed_apps(&policy));
    }
    let mut cached = slot.apps.clone().unwrap_or_default();
    // Keep the disk scan cached, but never keep policy annotations cached: an
    // Add/Remove operation may have changed the persisted policy since the
    // inventory was collected.
    everyaios_computeruse::annotate_inventory(&mut cached, &policy);
    drop(slot);
    let rows: Vec<serde_json::Value> =
        everyaios_computeruse::search_apps(&cached, query.as_deref().unwrap_or(""))
            .into_iter()
            .map(|a| {
                serde_json::json!({
                    "name": a.name,
                    "path": a.path,
                    "source": a.source.as_str(),
                    "hardDenied": a.hard_denied,
                    "allowListed": a.allow_listed,
                })
            })
            .collect();
    Ok(serde_json::json!({
        "apps": rows,
        "total": cached.len(),
        "scanned": rescan,
        "platformRoots": everyaios_computeruse::apps::platform_app_roots()
            .iter()
            .map(|p| p.to_string_lossy().into_owned())
            .collect::<Vec<_>>(),
    }))
}

/// Allow-list one path (the picker's Add, or **Add by path** after a file
/// picker). The path is canonicalized in Rust and a hard-denied program is
/// refused here too — the UI hiding the button is not the enforcement.
#[tauri::command]
pub fn desktop_policy_allow_path(
    state: State<'_, AppState>,
    path: String,
) -> Result<serde_json::Value, String> {
    let mut policy = load_policy();
    let added = policy.add_path(&path)?;
    let applied = commit_policy(&state, &policy)?;
    crate::control::record_mutation(
        &state,
        crate::control::AuthKind::HumanGesture,
        "desktop.policy.allow_path",
        serde_json::json!({
            "path": added,
            "requested": path,
            "appliedLive": applied,
            "allowPaths": policy.allow_paths.len(),
        }),
    );
    Ok(serde_json::json!({
        "added": added,
        "appliedLive": applied,
        "policy": policy_json(&policy),
    }))
}

/// Remove an allow-listed path (the Settings Remove action).
#[tauri::command]
pub fn desktop_policy_remove_path(
    state: State<'_, AppState>,
    path: String,
) -> Result<serde_json::Value, String> {
    let mut policy = load_policy();
    let removed = policy.remove_path(&path);
    let applied = commit_policy(&state, &policy)?;
    crate::control::record_mutation(
        &state,
        crate::control::AuthKind::HumanGesture,
        "desktop.policy.remove_path",
        serde_json::json!({
            "path": path,
            "removed": removed,
            "appliedLive": applied,
        }),
    );
    Ok(serde_json::json!({
        "removed": removed,
        "appliedLive": applied,
        "policy": policy_json(&policy),
    }))
}

/// Set the interaction default (`background` | `foreground`). Background is the
/// contract; foreground is the escalation the engine enforces for window
/// raising (P57.4).
#[tauri::command]
pub fn desktop_policy_set_interaction(
    state: State<'_, AppState>,
    mode: String,
) -> Result<serde_json::Value, String> {
    let parsed = everyaios_computeruse::InteractionMode::parse(&mode)
        .ok_or_else(|| format!("unknown interaction mode: {mode}"))?;
    let mut policy = load_policy();
    policy.interaction_mode = parsed;
    let applied = commit_policy(&state, &policy)?;
    crate::control::record_mutation(
        &state,
        crate::control::AuthKind::HumanGesture,
        "desktop.policy.set_interaction",
        serde_json::json!({ "mode": parsed.as_str(), "appliedLive": applied }),
    );
    Ok(serde_json::json!({
        "appliedLive": applied,
        "policy": policy_json(&policy),
    }))
}

#[cfg(test)]
mod policy_tests {
    use super::*;

    /// The persisted shape is the contract the UI reads; a field rename here
    /// would silently blank the Settings section.
    #[test]
    fn policy_json_exposes_the_contract_fields() {
        let mut p = everyaios_computeruse::AppPolicy::default();
        p.allow_paths.push("/usr/bin/gedit".into());
        p.interaction_mode = everyaios_computeruse::InteractionMode::Foreground;
        let j = policy_json(&p);
        assert_eq!(j["interactionDefault"], "foreground");
        assert_eq!(j["allowsRaisingWindows"], true);
        assert_eq!(j["allowPaths"][0], "/usr/bin/gedit");
        assert_eq!(j["strict"], false);
        let mut bg = everyaios_computeruse::AppPolicy::default();
        bg.strict = true;
        assert_eq!(policy_json(&bg)["allowsRaisingWindows"], false);
    }

    #[test]
    fn a_malformed_policy_file_is_never_a_partial_allow_list() {
        // `load_policy` reads the real data dir, so assert the decode rule the
        // same way it is applied: a bad document yields the default.
        let bad: Result<everyaios_computeruse::AppPolicy, _> = serde_json::from_slice(b"{oops");
        assert!(bad.is_err());
        let fallback = bad.unwrap_or_default();
        assert!(fallback.allow_paths.is_empty());
        assert_eq!(
            fallback.interaction_mode,
            everyaios_computeruse::InteractionMode::Background
        );
    }
}
