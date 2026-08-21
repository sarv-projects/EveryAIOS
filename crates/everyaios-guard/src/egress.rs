//! H3 — Data Egress Engine. Before any external call, produce a data-release
//! plan (what / where / why / which model / authorization → ALLOW / REDACT /
//! DENY). Unifies URL floors + connectivity modes.

use crate::urlfloor::{check_url, UrlVerdict};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConnectivityMode {
    /// No network, no registries.
    Offline,
    /// Local models / tools only.
    Local,
    /// Direct provider calls with user keys.
    Byok,
    /// MCP / ACP / browser / registry / search.
    #[default]
    ThirdParty,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EgressVerdict {
    Allow,
    Redact,
    Deny,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EgressPlan {
    pub destination: String,
    pub kind: String,
    pub model: Option<String>,
    pub reason: String,
    pub verdict: EgressVerdict,
}

#[derive(Debug, Clone, Default)]
pub struct EgressEngine {
    pub mode: ConnectivityMode,
    inventory: Vec<EgressPlan>,
}

impl EgressEngine {
    pub fn new(mode: ConnectivityMode) -> Self {
        Self {
            mode,
            inventory: Vec::new(),
        }
    }

    pub fn plan(
        &mut self,
        destination: &str,
        kind: &str,
        model: Option<&str>,
        reason: &str,
        roots: &[&str],
    ) -> EgressPlan {
        let verdict = self.verdict_for(destination, kind, roots);
        let plan = EgressPlan {
            destination: destination.to_string(),
            kind: kind.to_string(),
            model: model.map(str::to_string),
            reason: reason.to_string(),
            verdict,
        };
        self.inventory.push(plan.clone());
        plan
    }

    fn verdict_for(&self, destination: &str, kind: &str, roots: &[&str]) -> EgressVerdict {
        match self.mode {
            ConnectivityMode::Offline => {
                if kind == "network" || destination.starts_with("http") {
                    EgressVerdict::Deny
                } else {
                    EgressVerdict::Allow
                }
            }
            ConnectivityMode::Local => {
                if destination.starts_with("http://127.0.0.1")
                    || destination.starts_with("http://localhost")
                    || kind == "local"
                {
                    EgressVerdict::Allow
                } else if destination.starts_with("http") {
                    EgressVerdict::Deny
                } else {
                    EgressVerdict::Allow
                }
            }
            ConnectivityMode::Byok => {
                if destination.starts_with("http") {
                    match check_url(destination, roots) {
                        UrlVerdict::Allowed => EgressVerdict::Allow,
                        _ => EgressVerdict::Deny,
                    }
                } else {
                    EgressVerdict::Allow
                }
            }
            ConnectivityMode::ThirdParty => match check_url(destination, roots) {
                UrlVerdict::Allowed => EgressVerdict::Allow,
                UrlVerdict::SchemeBlocked | UrlVerdict::Malformed => EgressVerdict::Deny,
                UrlVerdict::OutsideRoots => EgressVerdict::Deny,
            },
        }
    }

    pub fn inventory(&self) -> &[EgressPlan] {
        &self.inventory
    }

    pub fn set_mode(&mut self, mode: ConnectivityMode) {
        self.mode = mode;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn offline_denies_network() {
        let mut e = EgressEngine::new(ConnectivityMode::Offline);
        let p = e.plan(
            "https://api.openai.com",
            "network",
            Some("gpt"),
            "chat",
            &[],
        );
        assert_eq!(p.verdict, EgressVerdict::Deny);
    }

    #[test]
    fn local_allows_loopback_only() {
        let mut e = EgressEngine::new(ConnectivityMode::Local);
        assert_eq!(
            e.plan("http://127.0.0.1:11434", "network", None, "ollama", &[])
                .verdict,
            EgressVerdict::Allow
        );
        assert_eq!(
            e.plan("https://api.openai.com", "network", None, "chat", &[])
                .verdict,
            EgressVerdict::Deny
        );
    }

    #[test]
    fn third_party_uses_url_floor() {
        let mut e = EgressEngine::new(ConnectivityMode::ThirdParty);
        assert_eq!(
            e.plan(
                "javascript:alert(1)",
                "network",
                None,
                "xss",
                &["/workspace"]
            )
            .verdict,
            EgressVerdict::Deny
        );
        assert_eq!(
            e.plan("https://example.com", "network", None, "fetch", &[])
                .verdict,
            EgressVerdict::Allow
        );
    }
}
