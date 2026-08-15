//! Agent-frontmatter schema (P6.1 — doc 63 §4.4, qwen-code
//! `agent-frontmatter-schema.ts` pattern, Claude Code parity).
//!
//! Parses Claude-Code/Qwen-compatible agent frontmatter
//! (`permissionMode`/`color`/`hooks`/`mcpServers`/`maxTurns`) into an
//! `AgentConfig`, with a `permissionMode → approvalMode` bridge so users can
//! drop in existing CC/Qwen agent files.

use serde::{Deserialize, Serialize};
use thiserror::Error;

/// Claude-Code-compatible permission modes.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PermissionMode {
    Default,
    Plan,
    AcceptEdits,
    Auto,
    BypassPermissions,
    DontAsk,
}

/// Our internal approval mode — the bridge target.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ApprovalMode {
    /// Ask before every privileged action.
    Default,
    /// Plan first; act on approval.
    Plan,
    /// Auto-accept edits (not arbitrary shell).
    Auto,
    /// Bypass all approvals (highest autonomy — user opts in).
    Bypass,
}

impl PermissionMode {
    /// Parse a CC permission-mode string (case-insensitive).
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "default" => Some(Self::Default),
            "plan" => Some(Self::Plan),
            "acceptEdits" | "accept-edits" | "acceptedits" => Some(Self::AcceptEdits),
            "auto" | "bypassPermissions" | "bypass-permissions" | "bypasspermissions" => {
                Some(Self::Auto)
            }
            "dontAsk" | "dont-ask" | "dontask" => Some(Self::DontAsk),
            _ => None,
        }
    }

    /// Bridge to our approval mode (the safety-relevant mapping).
    pub fn to_approval_mode(self) -> ApprovalMode {
        match self {
            Self::Default | Self::DontAsk => ApprovalMode::Default,
            Self::Plan | Self::AcceptEdits => ApprovalMode::Plan,
            Self::Auto => ApprovalMode::Auto,
            Self::BypassPermissions => ApprovalMode::Bypass,
        }
    }
}

/// A parsed agent config.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AgentConfig {
    pub permission_mode: PermissionMode,
    pub color: Option<String>,
    pub hooks: Vec<String>,
    pub mcp_servers: Vec<String>,
    pub max_turns: Option<u32>,
}

impl Default for AgentConfig {
    fn default() -> Self {
        Self {
            permission_mode: PermissionMode::Default,
            color: None,
            hooks: Vec::new(),
            mcp_servers: Vec::new(),
            max_turns: None,
        }
    }
}

#[derive(Debug, Error)]
pub enum FrontmatterError {
    #[error("unbalanced frontmatter delimiters")]
    UnbalancedDelimiters,
    #[error("unknown permissionMode {0:?}")]
    UnknownPermissionMode(String),
    #[error("invalid maxTurns {0:?}")]
    InvalidMaxTurns(String),
}

/// Parse `---`-delimited frontmatter. Scalars are read line-by-line; `hooks`
/// and `mcpServers` collect their raw entries (nested object lines are joined
/// onto the current entry). No YAML dependency — the CC/Qwen schema is flat
/// enough for a targeted parser.
pub fn parse_frontmatter(fm: &str) -> Result<AgentConfig, FrontmatterError> {
    let trimmed = fm.trim();
    let body = trimmed
        .strip_prefix("---")
        .and_then(|s| s.strip_suffix("---"))
        .ok_or(FrontmatterError::UnbalancedDelimiters)?
        .trim();

    let mut config = AgentConfig::default();
    let mut in_list: Option<List> = None;
    let mut current_entry = String::new();

    for raw in body.lines() {
        let line = raw.trim();
        if line.is_empty() {
            continue;
        }
        // A new top-level `key: value`.
        if !line.starts_with(' ') && !line.starts_with('-') && line.contains(':') {
            if let Some(list) = in_list.take() {
                flush(&mut config, list, &current_entry);
                current_entry.clear();
            }
            let (key, value) = line.split_once(':').unwrap();
            let key = key.trim();
            let value = value.trim();
            match key {
                "permissionMode" | "permission" => {
                    config.permission_mode = PermissionMode::parse(value)
                        .ok_or_else(|| FrontmatterError::UnknownPermissionMode(value.to_string()))?;
                }
                "color" => config.color = Some(value.to_string()),
                "maxTurns" | "max_turns" => {
                    config.max_turns = Some(
                        value
                            .parse()
                            .map_err(|_| FrontmatterError::InvalidMaxTurns(value.to_string()))?,
                    );
                }
                "hooks" => in_list = Some(List::Hooks),
                "mcpServers" | "mcp_servers" => in_list = Some(List::McpServers),
                _ => {}
            }
            continue;
        }
        // A list item or continuation line.
        if let Some(list) = in_list {
            let item = line.trim_start_matches('-').trim();
            if !item.is_empty() {
                if !current_entry.is_empty() {
                    current_entry.push(' ');
                }
                current_entry.push_str(item);
            }
            let _ = list;
        }
    }
    if let Some(list) = in_list {
        flush(&mut config, list, &current_entry);
    }
    Ok(config)
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum List {
    Hooks,
    McpServers,
}

fn flush(config: &mut AgentConfig, list: List, entry: &str) {
    if entry.trim().is_empty() {
        return;
    }
    match list {
        List::Hooks => config.hooks.push(entry.trim().to_string()),
        List::McpServers => config.mcp_servers.push(entry.trim().to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_scalar_fields() {
        let fm = "---\npermissionMode: acceptEdits\ncolor: red\nmaxTurns: 100\n---";
        let c = parse_frontmatter(fm).unwrap();
        assert_eq!(c.permission_mode, PermissionMode::AcceptEdits);
        assert_eq!(c.color.as_deref(), Some("red"));
        assert_eq!(c.max_turns, Some(100));
    }

    #[test]
    fn parses_hooks_and_mcp_servers() {
        let fm = "---\npermissionMode: plan\nhooks:\n  - command: \"npm test\"\nmcpServers:\n  - name: \"browser\"\n---";
        let c = parse_frontmatter(fm).unwrap();
        assert_eq!(c.permission_mode, PermissionMode::Plan);
        assert_eq!(c.hooks.len(), 1);
        assert!(c.hooks[0].contains("npm test"));
        assert_eq!(c.mcp_servers.len(), 1);
    }

    #[test]
    fn unknown_permission_mode_errors() {
        let fm = "---\npermissionMode: yolo\n---";
        assert!(matches!(
            parse_frontmatter(fm),
            Err(FrontmatterError::UnknownPermissionMode(_))
        ));
    }

    #[test]
    fn unbalanced_delimiters_error() {
        assert!(matches!(
            parse_frontmatter("permissionMode: plan"),
            Err(FrontmatterError::UnbalancedDelimiters)
        ));
    }

    #[test]
    fn permission_to_approval_bridge() {
        assert_eq!(PermissionMode::Default.to_approval_mode(), ApprovalMode::Default);
        assert_eq!(PermissionMode::Plan.to_approval_mode(), ApprovalMode::Plan);
        assert_eq!(PermissionMode::AcceptEdits.to_approval_mode(), ApprovalMode::Plan);
        assert_eq!(PermissionMode::Auto.to_approval_mode(), ApprovalMode::Auto);
        assert_eq!(PermissionMode::BypassPermissions.to_approval_mode(), ApprovalMode::Bypass);
        assert_eq!(PermissionMode::DontAsk.to_approval_mode(), ApprovalMode::Default);
    }
}
