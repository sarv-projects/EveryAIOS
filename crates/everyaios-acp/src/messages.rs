//! ACP v1 message types (doc 45 §1, agentclientprotocol.com/protocol/v1).
//!
//! Conventions (from the spec): JSON object property keys are **camelCase**;
//! discriminator string values are **snake_case**. We mirror that here with
//! `#[serde(rename_all = "camelCase")]` on structs and `rename_all =
//! "snake_case"` on the enums that serialize as strings.

use serde::{Deserialize, Serialize};

/// The stable wire protocol version (integer major; negotiated at
/// `initialize`). Bumped only on breaking changes — non-breaking features
/// ride the capability mechanism.
pub const PROTOCOL_VERSION: u64 = 1;

// ---------------------------------------------------------------------------
// Capabilities — all optional, default = unsupported (doc 45 §1.3)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ClientCapabilities {
    pub fs: FsCapabilities,
    pub terminal: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct FsCapabilities {
    pub read_text_file: bool,
    pub write_text_file: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AgentCapabilities {
    pub load_session: bool,
    pub prompt_capabilities: PromptCapabilities,
    pub mcp_capabilities: McpCapabilities,
    pub auth: AuthCapabilities,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct PromptCapabilities {
    pub image: bool,
    pub audio: bool,
    pub embedded_context: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct McpCapabilities {
    pub http: bool,
    pub sse: bool,
}

/// Agent auth capabilities. The spec's `agentCapabilities.auth.logout` is an
/// empty object `{}` when supported (and omitted/null when not) — a bool would
/// misparse. `logout` is `Some(())` when the agent supports it.
#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AuthCapabilities {
    #[serde(default, deserialize_with = "deser_marker")]
    pub logout: Option<()>,
}

/// Accept `{}` (object), `true`, or a missing key as the logout marker.
fn deser_marker<'de, D>(de: D) -> Result<Option<()>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let v: Option<serde_json::Value> = Option::deserialize(de)?;
    Ok(match v {
        Some(serde_json::Value::Null) | None => None,
        // `{}` or `true` ⇒ supported.
        _ => Some(()),
    })
}

impl AuthCapabilities {
    pub fn supports_logout(&self) -> bool {
        self.logout.is_some()
    }
}

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientInfo {
    pub name: String,
    pub title: String,
    pub version: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AgentInfo {
    pub name: String,
    pub title: String,
    pub version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthMethod {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    /// `agent` (default) | `url` | `terminal` — how the client completes login.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub r#type: Option<AuthMethodType>,
    /// Terminal-type methods carry args/env for the out-of-band launch.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub args: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub env: Option<Vec<(String, String)>>,
}

// ---------------------------------------------------------------------------
// initialize
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InitializeParams {
    pub protocol_version: u64,
    pub client_capabilities: ClientCapabilities,
    pub client_info: ClientInfo,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct InitializeResult {
    pub protocol_version: u64,
    pub agent_capabilities: AgentCapabilities,
    pub agent_info: AgentInfo,
    pub auth_methods: Vec<AuthMethod>,
}

// ---------------------------------------------------------------------------
// session/new
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct McpServer {
    pub name: String,
    pub command: String,
    pub args: Vec<String>,
    pub env: Vec<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct SessionNewParams {
    pub cwd: String,
    pub mcp_servers: Vec<McpServer>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionNewResult {
    pub session_id: String,
}

// ---------------------------------------------------------------------------
// session/prompt
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum PromptContent {
    #[serde(rename = "text")]
    Text { text: String },
    // image/audio/embedded/context are v1-capability-gated; modeled loosely
    // so unknown variants don't break a peer that sends them.
    #[serde(other)]
    Other,
}

impl PromptContent {
    pub fn text(s: impl Into<String>) -> Self {
        PromptContent::Text { text: s.into() }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionPromptParams {
    pub session_id: String,
    pub prompt: Vec<PromptContent>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct SessionPromptResult {
    pub stop_reason: StopReason,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StopReason {
    /// Turn ended normally (the common case).
    #[default]
    EndTurn,
    MaxTokens,
    Cancelled,
    Refusal,
    NotImplemented,
    Error,
    /// Unknown/forward-compat stop reason (`_`-prefixed or new).
    #[serde(other)]
    Other,
}

impl StopReason {
    pub fn as_str(&self) -> &'static str {
        match self {
            StopReason::EndTurn => "end_turn",
            StopReason::MaxTokens => "max_tokens",
            StopReason::Cancelled => "cancelled",
            StopReason::Refusal => "refusal",
            StopReason::NotImplemented => "not_implemented",
            StopReason::Error => "error",
            StopReason::Other => "other",
        }
    }
}

// ---------------------------------------------------------------------------
// Tool kinds (the shared permission taxonomy — doc 45 §1.4, F9)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ToolKind {
    Read,
    Edit,
    Delete,
    Move,
    Search,
    Execute,
    Think,
    Fetch,
    #[serde(other)]
    Other,
}

impl ToolKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            ToolKind::Read => "read",
            ToolKind::Edit => "edit",
            ToolKind::Delete => "delete",
            ToolKind::Move => "move",
            ToolKind::Search => "search",
            ToolKind::Execute => "execute",
            ToolKind::Think => "think",
            ToolKind::Fetch => "fetch",
            ToolKind::Other => "other",
        }
    }

    /// Map an ACP tool kind onto our Guard-2 operation class, so a tool call
    /// arriving over ACP routes into the same policy engine as native tools.
    pub fn is_mutation(&self) -> bool {
        matches!(
            self,
            ToolKind::Edit | ToolKind::Delete | ToolKind::Move | ToolKind::Execute
        )
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ToolStatus {
    Pending,
    #[default]
    InProgress,
    Completed,
    Failed,
    #[serde(other)]
    Other,
}

// ---------------------------------------------------------------------------
// session/update (agent → client notification)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ContentBlock {
    pub r#type: String,
    pub text: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Location {
    pub r#type: String,
    pub uri: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub range: Option<TextRange>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct TextRange {
    pub start: Position,
    pub end: Position,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Position {
    pub line: u64,
    pub character: u64,
}

/// A parsed `session/update` notification. `session_update` is the
/// discriminator string; we keep the fields we act on (tool calls, plans,
/// available commands, mode changes) and ignore the rest (forward-compat).
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct SessionUpdate {
    pub session_id: String,
    /// `tool_call` | `tool_call_update` | `agent_message_chunk` |
    /// `plan` | `available_commands_update` | `mode_change` | …
    pub session_update: String,
    pub tool_call_id: String,
    pub title: String,
    pub kind: Option<ToolKind>,
    pub status: Option<ToolStatus>,
    pub content: Vec<ContentBlock>,
    pub locations: Vec<Location>,
    pub raw_input: Option<serde_json::Value>,
    pub raw_output: Option<serde_json::Value>,
}

impl SessionUpdate {
    pub fn is_tool_call(&self) -> bool {
        self.session_update == "tool_call"
    }

    pub fn is_tool_call_update(&self) -> bool {
        self.session_update == "tool_call_update"
    }
}

// ---------------------------------------------------------------------------
// session/request_permission (agent → client request) — the Guard-2 seam
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ToolCall {
    pub tool_call_id: String,
    pub title: String,
    pub kind: Option<ToolKind>,
    pub content: Vec<ContentBlock>,
    pub locations: Vec<Location>,
    pub raw_input: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PermissionOptionKind {
    AllowOnce,
    AllowAlways,
    RejectOnce,
    RejectAlways,
    #[serde(other)]
    Other,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionOption {
    pub option_id: String,
    pub kind: PermissionOptionKind,
    pub label: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct PermissionRequestParams {
    pub session_id: String,
    pub tool_call: ToolCall,
    pub options: Vec<PermissionOption>,
}

// ---------------------------------------------------------------------------
// Authentication (doc 45 §1.5 — `authenticate` / `logout`, auth_required)
// ---------------------------------------------------------------------------

/// The authentication method type (the `type` field on [`AuthMethod`]).
/// `Agent` is the default: the agent drives its own login flow (prints a URL,
/// opens its own browser, waits for the user). `Url` returns a URL the client
/// opens in the system browser; the client calls `authenticate` again after
/// the user completes login. `Terminal` is an out-of-band interactive launch
/// (not driven over the ACP connection).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AuthMethodType {
    #[serde(rename = "agent")]
    Agent,
    #[serde(rename = "url")]
    Url,
    #[serde(rename = "terminal")]
    Terminal,
}

impl AuthMethodType {
    pub fn as_str(&self) -> &'static str {
        match self {
            AuthMethodType::Agent => "agent",
            AuthMethodType::Url => "url",
            AuthMethodType::Terminal => "terminal",
        }
    }
}

/// The `authenticate` request: pick one of the methods advertised in the
/// `initialize` response's `authMethods`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthenticateParams {
    pub method_id: String,
}

/// The `authenticate` response. `{}` on success for agent-type methods; a
/// `url` for url-type methods (the client opens it in the system browser, the
/// user completes login, then the client calls `authenticate` again).
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AuthenticateResult {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
}

/// The client's decision for a permission request. `allow` + `option_id`
/// selects one of the offered options; when `option_id` is `None` the session
/// synthesizes a default allow_once/reject_once.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PermissionDecision {
    Allow { option_id: Option<String> },
    Deny { option_id: Option<String> },
}

impl PermissionDecision {
    pub fn allow() -> Self {
        PermissionDecision::Allow { option_id: None }
    }

    pub fn deny() -> Self {
        PermissionDecision::Deny { option_id: None }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionOutcome {
    pub option_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionResult {
    pub outcome: PermissionOutcome,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn initialize_result_roundtrips_camelcase() {
        let r = InitializeResult {
            protocol_version: 1,
            agent_capabilities: AgentCapabilities {
                load_session: true,
                ..Default::default()
            },
            agent_info: AgentInfo {
                name: "claude-acp".into(),
                title: "Claude Agent".into(),
                version: "0.66.0".into(),
            },
            auth_methods: vec![],
        };
        let v = serde_json::to_value(&r).unwrap();
        assert_eq!(v["protocolVersion"], 1);
        assert_eq!(v["agentCapabilities"]["loadSession"], true);
        assert_eq!(v["agentInfo"]["name"], "claude-acp");

        let back: InitializeResult = serde_json::from_value(v).unwrap();
        assert!(back.agent_capabilities.load_session);
    }

    #[test]
    fn tool_kind_and_stop_reason_use_snake_case() {
        assert_eq!(serde_json::to_value(ToolKind::Edit).unwrap(), "edit");
        assert_eq!(
            serde_json::to_value(StopReason::EndTurn).unwrap(),
            "end_turn"
        );
        assert_eq!(
            serde_json::from_value::<ToolKind>(serde_json::json!("delete")).unwrap(),
            ToolKind::Delete
        );
        assert!(ToolKind::Edit.is_mutation());
        assert!(!ToolKind::Read.is_mutation());
    }

    #[test]
    fn session_update_parses_tool_call_discriminator() {
        let v = serde_json::json!({
            "sessionId": "s1",
            "sessionUpdate": "tool_call",
            "toolCallId": "tc1",
            "title": "Edit main.rs",
            "kind": "edit",
            "status": "in_progress"
        });
        let u: SessionUpdate = serde_json::from_value(v).unwrap();
        assert!(u.is_tool_call());
        assert_eq!(u.tool_call_id, "tc1");
        assert_eq!(u.kind, Some(ToolKind::Edit));
        assert_eq!(u.status, Some(ToolStatus::InProgress));
    }

    #[test]
    fn permission_request_roundtrips() {
        let p = PermissionRequestParams {
            session_id: "s1".into(),
            tool_call: ToolCall {
                tool_call_id: "tc1".into(),
                title: "Write /w/a.rs".into(),
                kind: Some(ToolKind::Edit),
                ..Default::default()
            },
            options: vec![PermissionOption {
                option_id: "allow-once".into(),
                kind: PermissionOptionKind::AllowOnce,
                label: "Allow once".into(),
            }],
        };
        let v = serde_json::to_value(&p).unwrap();
        assert_eq!(v["sessionId"], "s1");
        assert_eq!(v["toolCall"]["toolCallId"], "tc1");
        assert_eq!(v["options"][0]["optionId"], "allow-once");
    }

    #[test]
    fn prompt_content_text() {
        let c = PromptContent::text("hello");
        let v = serde_json::to_value(c).unwrap();
        assert_eq!(v["type"], "text");
        assert_eq!(v["text"], "hello");
    }
}
