//! P48.3 — E9 desktop computer-use effect-funnel seam.
//!
//! `everyaios-desktop` is a *library* engine (see/read/act/verify); this
//! module is the host wiring that the crate's own docs require: "the desktop
//! host wires `policy::PermissionGate` to the ticket store and `AuditSink` to
//! the Merkle audit chain, exactly like every other effect in the product."
//!
//! Honest closure: the engine is attached to the effect funnel on the
//! **human-gesture path only** (the user drives the desktop view directly,
//! exactly like the shell/git/office human path — option (b)). There is no
//! agent/automation path to the desktop engine yet: an agent reaches effects
//! only via the ticketed executor, and desktop is not (yet) a loop tool. Until
//! that tool-exposes-desktop seam is built and ticket-audited, the matrix cell
//! stays honest — this module attaches the *engine* to the funnel, not the
//! agent to the engine.
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
pub struct DesktopSlot {
    engine: Option<Arc<everyaios_computeruse::DesktopEngine>>,
    /// Why the engine is unavailable when `None` (empty until first attempt).
    last_error: Option<String>,
    /// The audit sink bridge (holds the `AppHandle` to feed the Merkle chain).
    sink: Option<Arc<AuditSinkToChain>>,
}

impl Default for DesktopSlot {
    fn default() -> Self {
        Self {
            engine: None,
            last_error: None,
            sink: None,
        }
    }
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
        match everyaios_computeruse::DesktopEngine::new(
            everyaios_computeruse::AppPolicy::default(),
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

/// Capability surface + attach state (the honest "what can this machine do and
/// is the engine live" probe the UI rail dot reads).
#[tauri::command]
pub fn desktop_status(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let slot = state.desktop.lock().map_err(|e| e.to_string())?;
    match slot.engine.as_ref() {
        Some(engine) => {
            let c = engine.capabilities();
            Ok(serde_json::json!({
                "attached": true,
                "capabilities": {
                    "see": format!("{:?}", c.see),
                    "see_occluded": c.see_occluded,
                    "uia_tree": c.uia_tree,
                    "invoke_set_value": c.invoke_set_value,
                    "send_input": c.send_input,
                    "ocr": c.ocr,
                    "window_list": c.window_list,
                    "launch_app": c.launch_app,
                },
            }))
        }
        None => Ok(serde_json::json!({ "attached": false, "reason": slot.last_error })),
    }
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

/// Execute ONE human-initiated desktop act, through the engine's Guard-2 gate
/// and audited on the same Merkle chain as every other effect. Fail-closed:
/// risky classes are Denied by `FailClosedGate`; hard-denied apps never run.
#[tauri::command]
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
    let act = match kind.as_str() {
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
        other => return Err(format!("unsupported desktop act kind: {other}")),
    };
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
