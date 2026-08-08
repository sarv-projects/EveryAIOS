//! everyaios-cdp — Chrome DevTools Protocol client (ARCH/08, E1).
//!
//! P0.1 scope: the type skeleton (targets, sessions, transport error) so the
//! shape of the API is fixed before P2.1 wires the WebSocket transport
//! (tokio-tungstenite), discovery (`--remote-debugging-port=0` +
//! DevToolsActivePort), and protocol-version tolerance.

use serde::{Deserialize, Serialize};

/// A browser target (tab, page, or worker) as reported by
/// `Target.getTargets`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TargetInfo {
    pub target_id: String,
    /// CDP wire field is `type` (e.g. `page`, `worker`).
    #[serde(rename = "type")]
    pub target_type: TargetType,
    pub title: String,
    pub url: String,
    /// WebSocket debugger URL for this target — serialized with the exact
    /// CDP wire name `webSocketDebuggerUrl`.
    #[serde(rename = "webSocketDebuggerUrl")]
    pub ws_url: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TargetType {
    Page,
    Tab,
    Iframe,
    Worker,
    Other,
}

/// A session attached to one target (CDP `Target.attachToTarget`).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Session {
    pub session_id: String,
    pub target_id: String,
}

/// Transport errors. The WebSocket layer arrives in P2.1; for now the enum
/// documents the failure surface (including the version-skew case).
#[derive(Debug, thiserror::Error)]
pub enum CdpError {
    #[error("discovery failed: {0}")]
    Discovery(String),
    #[error("transport not yet wired (P2.1): {0}")]
    TransportNotWired(String),
    #[error("protocol error: code {code}: {message}")]
    Protocol { code: i64, message: String },
    #[error("chrome version skew: {0}")]
    VersionSkew(String),
}

/// Discovery result of a running Chrome/Edge instance.
#[derive(Debug, Clone, PartialEq)]
pub struct BrowserEndpoint {
    /// WS URL of the browser-level endpoint (e.g.
    /// `ws://127.0.0.1:9222/devtools/browser/...`).
    pub browser_ws_url: String,
    pub version: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn target_info_serializes_like_cdp() {
        let t = TargetInfo {
            target_id: "ABC123".into(),
            target_type: TargetType::Page,
            title: "Example".into(),
            url: "https://example.com".into(),
            ws_url: "ws://127.0.0.1:9222/devtools/page/ABC123".into(),
        };
        let json = serde_json::to_string(&t).unwrap();
        assert!(json.contains("\"type\":\"page\""), "{json}");
        assert!(json.contains("\"webSocketDebuggerUrl\""), "{json}"); // alias handled at P2.1
    }

    #[test]
    fn target_type_roundtrip() {
        for (s, t) in [("page", TargetType::Page), ("worker", TargetType::Worker)] {
            let parsed: TargetType = serde_json::from_str(&format!("\"{s}\"")).unwrap();
            assert_eq!(parsed, t);
        }
    }

    #[test]
    fn error_variants_display() {
        assert!(CdpError::VersionSkew("unexpected".into())
            .to_string()
            .contains("version skew"));
    }
}
