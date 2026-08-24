//! P31.2 — the agent bundle manifest (`agent.toml`), versioned schema
//! (I6-compatible). One bundle carries persona + engine binding + optional
//! model/provider pin + scoped MCP/connectors/skills/tools + workflows —
//! everything a custom agent is.

use serde::{Deserialize, Serialize};

pub const BUNDLE_SCHEMA_VERSION: u32 = 1;

/// The engine the bundle binds to (P31.8): the brain, swappable without
/// touching persona or scopes.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum EngineBinding {
    /// The inbuilt EveryAIOS engine.
    Inbuilt,
    /// An ACP-installed CLI agent (Claude Code / Codex / …).
    Acp(String),
    /// Model-only: no tools, no engine — chat-only brain.
    ModelOnly,
}

/// The model pin: `None` = inherit from the chat bar at send time.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct ModelPin {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provider: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
}

impl ModelPin {
    pub fn is_inherited(&self) -> bool {
        self.provider.is_none() && self.model.is_none()
    }

    /// Optional pin: inherited default.
    pub fn inherited() -> Self {
        Self::default()
    }

    pub fn pinned(provider: impl Into<String>, model: impl Into<String>) -> Self {
        Self { provider: Some(provider.into()), model: Some(model.into()) }
    }
}

/// Tool allow/deny lists. `allow` empty = inherit whatever the engine offers
/// (everyaios-guard CapabilityGranter semantics); explicit entries always win.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct ToolScope {
    #[serde(default)]
    pub allow: Vec<String>,
    #[serde(default)]
    pub deny: Vec<String>,
}

impl ToolScope {
    pub fn allows(&self, tool: &str) -> bool {
        if self.deny.contains(&tool.to_string()) {
            return false;
        }
        self.allow.is_empty() || self.allow.contains(&tool.to_string())
    }
}

/// The versioned bundle (P31.2). Round-trips through `agent.toml`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AgentBundle {
    pub schema_version: u32,
    /// Identity (wizard step 1).
    pub name: String,
    pub emoji: String,
    pub description: String,
    /// Brain (step 2).
    #[serde(default)]
    pub persona: Option<String>,
    #[serde(default)]
    pub system_prompt: Option<String>,
    pub engine: EngineBinding,
    pub model: ModelPin,
    /// Capabilities (step 3) — exact subsets, never "all".
    #[serde(default)]
    pub mcp_servers: Vec<String>,
    #[serde(default)]
    pub connectors: Vec<String>,
    #[serde(default)]
    pub skills: Vec<String>,
    #[serde(default)]
    pub tools: ToolScope,
    /// Workflows (step 4).
    #[serde(default)]
    pub blueprints: Vec<String>,
    #[serde(default)]
    pub automations: Vec<String>,
}

impl AgentBundle {
    pub fn new(name: impl Into<String>) -> Self {
        Self {
            schema_version: BUNDLE_SCHEMA_VERSION,
            name: name.into(),
            emoji: "🤖".into(),
            description: String::new(),
            persona: None,
            system_prompt: None,
            engine: EngineBinding::Inbuilt,
            model: ModelPin::inherited(),
            mcp_servers: Vec::new(),
            connectors: Vec::new(),
            skills: Vec::new(),
            tools: ToolScope::default(),
            blueprints: Vec::new(),
            automations: Vec::new(),
        }
    }

    /// The toolset this bundle's capability grant computes to.
    pub fn effective_tools(&self, engine_offered: &[String]) -> Vec<String> {
        engine_offered
            .iter()
            .filter(|t| self.tools.allows(t))
            .cloned()
            .collect()
    }

    /// Scope check: does this bundle declare this MCP server?
    pub fn declares_mcp(&self, server_id: &str) -> bool {
        self.mcp_servers.iter().any(|s| s == server_id)
    }

    /// Scope check: does this bundle declare this connector?
    pub fn declares_connector(&self, connector_id: &str) -> bool {
        self.connectors.iter().any(|c| c == connector_id)
    }

    pub fn from_toml(src: &str) -> Result<Self, String> {
        toml::from_str(src).map_err(|e| e.to_string())
    }

    pub fn to_toml(&self) -> Result<String, String> {
        toml::to_string(self).map_err(|e| e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trip_toml() {
        let mut b = AgentBundle::new("Grace");
        b.engine = EngineBinding::Acp("claude-code".into());
        b.model = ModelPin::pinned("anthropic", "claude-sonnet-4");
        let toml = b.to_toml().unwrap();
        let back = AgentBundle::from_toml(&toml).unwrap();
        assert_eq!(back.name, "Grace");
        assert_eq!(back.engine, EngineBinding::Acp("claude-code".into()));
        assert_eq!(back.model.model.as_deref(), Some("claude-sonnet-4"));
    }

    #[test]
    fn default_is_inherited_model() {
        let b = AgentBundle::new("x");
        assert!(b.model.is_inherited());
    }

    #[test]
    fn tool_scope_allow_empty_means_inherit() {
        let b = AgentBundle::new("x");
        assert!(b.tools.allows("fs.read"));
        assert!(b.tools.allows("anything"));
    }

    #[test]
    fn deny_wins_over_allow() {
        let mut b = AgentBundle::new("x");
        b.tools.allow = vec!["fs.write".into()];
        b.tools.deny = vec!["fs.remove".into()];
        assert!(b.tools.allows("fs.write"));
        assert!(!b.tools.allows("fs.remove"));
    }

    #[test]
    fn effective_tools_filters_by_scope() {
        let mut b = AgentBundle::new("x");
        b.tools.allow = vec!["fs.read".into(), "shell".into()];
        let offered = vec!["fs.read".into(), "fs.write".into(), "shell".into()];
        assert_eq!(b.effective_tools(&offered), vec!["fs.read", "shell"]);
    }
}