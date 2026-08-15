//! E15 — Electron-app CDP automation (doc 63 §4.1, agent-browser pattern):
//! the wiring that attaches to any Electron app's debug port (VS Code, Slack,
//! Discord, Spotify, Notion) and drives it through the existing CDP stack —
//! a11y snapshot → click/fill/read/screenshot.
//!
//! [`ElectronHandle::attach`] probes the port (`Browser: Electron/…` check),
//! connects at the browser level, and attaches a session to the first page
//! target; the handle then reuses the browser crate's snapshot engine and
//! CDP input/read/screenshot domains.

use crate::{Snapshot, SnapshotEngine, SnapshotMode};
use everyaios_cdp::{probe_electron, CdpClient, CdpError, ElectronApp, Session};
use serde_json::json;

/// An attached Electron app: the app info + a live CDP connection + the first
/// page target's session.
#[derive(Debug)]
pub struct ElectronHandle {
    pub app: ElectronApp,
    pub client: CdpClient,
    pub session: Session,
}

impl ElectronHandle {
    /// Attach to an Electron app listening on `port` (loopback-only — the
    /// discovery layer rejects non-loopback hosts). Probes the app, connects
    /// to its browser-level WS endpoint, and attaches a session to the first
    /// page target. Errors when the port hosts no Electron app.
    pub fn attach(port: u16) -> Result<Self, CdpError> {
        let app = probe_electron(port)?;
        let client = everyaios_cdp::connect_to_browser(&everyaios_cdp::BrowserEndpoint {
            browser_ws_url: app.browser_ws_url.clone(),
            version: app.version.clone(),
        })?;
        // Pick the first page target (an Electron window). If none is listed,
        // attach to the browser endpoint's default page via /json/list again.
        let target = app
            .targets
            .iter()
            .find(|t| {
                matches!(t.target_type, everyaios_cdp::TargetType::Page)
                    || matches!(t.target_type, everyaios_cdp::TargetType::Tab)
            })
            .or_else(|| app.targets.first());
        let target_id = target
            .map(|t| t.target_id.clone())
            .ok_or_else(|| CdpError::Discovery(format!("port {port}: no attachable target")))?;
        let session = client.attach(&target_id)?;
        Ok(Self {
            app,
            client,
            session,
        })
    }

    /// A11y snapshot of the attached window (reuses the existing snapshot
    /// engine — refs `[ref=eN]` scoped to the document).
    pub fn snapshot(&self, document_id: &str, mode: SnapshotMode) -> Result<Snapshot, CdpError> {
        SnapshotEngine::default()
            .with_mode(mode)
            .capture(&self.client, Some(&self.session.session_id), document_id)
    }

    /// Click at a point (device-independent pixels, page coordinates). Emits
    /// mousePressed + mouseReleased so the click registers on the app.
    pub fn click(&self, x: f64, y: f64) -> Result<(), CdpError> {
        for kind in ["mousePressed", "mouseReleased"] {
            self.client.call_session(
                &self.session.session_id,
                "Input.dispatchMouseEvent",
                json!({
                    "type": kind,
                    "x": x,
                    "y": y,
                    "button": "left",
                    "clickCount": 1
                }),
            )?;
        }
        Ok(())
    }

    /// Fill the focused input with `text` (`Input.insertText` — the focused
    /// element receives it; callers focus first via a click or `DOM.focus`).
    pub fn fill(&self, text: &str) -> Result<(), CdpError> {
        self.client.call_session(
            &self.session.session_id,
            "Input.insertText",
            json!({ "text": text }),
        )?;
        Ok(())
    }

    /// Read the window's visible text (`document.body.innerText` — the
    /// read-only inspection path; matches what the model sees).
    pub fn read(&self) -> Result<String, CdpError> {
        let res = self.client.call_session(
            &self.session.session_id,
            "Runtime.evaluate",
            json!({ "expression": "document.body && document.body.innerText || ''", "returnByValue": true }),
        )?;
        Ok(res
            .pointer("/result/value")
            .and_then(serde_json::Value::as_str)
            .unwrap_or_default()
            .to_string())
    }

    /// Screenshot the window: returns the base64-encoded PNG payload.
    pub fn screenshot(&self) -> Result<String, CdpError> {
        let res = self.client.call_session(
            &self.session.session_id,
            "Page.captureScreenshot",
            json!({ "format": "png" }),
        )?;
        res.get("data")
            .and_then(serde_json::Value::as_str)
            .map(str::to_string)
            .ok_or_else(|| CdpError::Protocol {
                code: -1,
                message: "Page.captureScreenshot: missing data".into(),
            })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The attach contract without a live app: `probe_electron` must reject
    /// non-Electron browsers before any connection is attempted.
    #[test]
    fn attach_requires_electron_probe() {
        // A dead port errors cleanly (no Electron app there).
        let err = ElectronHandle::attach(1).unwrap_err();
        assert!(matches!(err, CdpError::Http(_) | CdpError::Discovery(_)), "got {err:?}");
    }
}
