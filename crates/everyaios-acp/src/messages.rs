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
    /// ACP session configuration support. Select options need no capability
    /// marker; the optional boolean marker advertises that this client can
    /// render and set boolean options too.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session: Option<SessionCapabilities>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct SessionCapabilities {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub config_options: Option<ConfigOptionCapabilities>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ConfigOptionCapabilities {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub boolean: Option<serde_json::Value>,
}

impl SessionCapabilities {
    pub fn config_options_with_boolean() -> Self {
        Self {
            config_options: Some(ConfigOptionCapabilities {
                boolean: Some(serde_json::json!({})),
            }),
        }
    }
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
    /// Terminal-type methods carry env for the out-of-band launch. Real agents
    /// send this as a JSON **object** (`"env": {}` on `pi-acp`), while the
    /// pair-list form appears elsewhere — accept both.
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "deserialize_env_pairs"
    )]
    pub env: Option<Vec<(String, String)>>,
}

/// Accept an env payload as either a list of `[key, value]` pairs or a
/// `{ key: value }` object. Absent/null stays `None`.
fn deserialize_env_pairs<'de, D>(deserializer: D) -> Result<Option<Vec<(String, String)>>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum Raw {
        Pairs(Vec<(String, String)>),
        Map(std::collections::BTreeMap<String, String>),
    }

    Ok(match Option::<Raw>::deserialize(deserializer)? {
        None => None,
        Some(Raw::Pairs(pairs)) => Some(pairs),
        Some(Raw::Map(map)) => Some(map.into_iter().collect()),
    })
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
    #[serde(default, deserialize_with = "deserialize_auth_methods")]
    pub auth_methods: Vec<AuthMethod>,
}

/// `authMethods` is a **sequence** in most ACP agents (live-verified against
/// `pi-acp`, which sends an array), while **id → method maps** also appear in
/// the ecosystem. Both describe the same thing, so accept either: when the
/// payload is a map, the key is the method id and the name falls back to it.
///
/// This is one of several places the ACP wire format is not self-consistent
/// (with `session/update`'s `content` — a single block on chunk updates, an
/// array on tool calls — and an auth method's `env`, which arrives as an object
/// on real agents). The tolerant parse is deliberate: refusing a real agent
/// over a shape difference is worse than normalizing it.
fn deserialize_auth_methods<'de, D>(deserializer: D) -> Result<Vec<AuthMethod>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    #[derive(Deserialize, Default)]
    #[serde(rename_all = "camelCase", default)]
    struct AuthMethodBody {
        id: Option<String>,
        name: Option<String>,
        description: Option<String>,
        r#type: Option<AuthMethodType>,
        args: Option<Vec<String>>,
        env: Option<Vec<(String, String)>>,
    }

    #[derive(Deserialize)]
    #[serde(untagged)]
    enum Raw {
        List(Vec<AuthMethod>),
        Map(std::collections::BTreeMap<String, AuthMethodBody>),
    }

    match Raw::deserialize(deserializer)? {
        Raw::List(list) => Ok(list),
        Raw::Map(map) => Ok(map
            .into_iter()
            .map(|(key, body)| AuthMethod {
                id: body.id.unwrap_or_else(|| key.clone()),
                name: body.name.unwrap_or(key),
                description: body.description,
                r#type: body.r#type,
                args: body.args,
                env: body.env,
            })
            .collect()),
    }
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
    /// Agent-owned session configuration, including model selectors when the
    /// agent exposes them. Empty means the agent manages its own model state.
    ///
    /// Optional on the wire: the protocol says the Agent **MAY** return
    /// `configOptions`, so an agent that does not must not fail `session/new`.
    #[serde(default)]
    pub config_options: Vec<ConfigOption>,
}

/// One ACP session-level configuration selector. The agent owns this
/// vocabulary and the current value; EveryAIOS must not substitute its native
/// provider/model catalog for it.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ConfigOption {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub category: Option<String>,
    pub r#type: String,
    pub current_value: serde_json::Value,
    pub options: Vec<ConfigOptionValue>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ConfigOptionValue {
    pub value: serde_json::Value,
    pub name: String,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetConfigOptionParams {
    pub session_id: String,
    pub config_id: String,
    pub value: serde_json::Value,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct SetConfigOptionResult {
    pub config_options: Vec<ConfigOption>,
}

// ---------------------------------------------------------------------------
// session/prompt
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum PromptContent {
    #[serde(rename = "text")]
    Text { text: String },
    /// A workspace file embedded as an ACP resource. Agents must advertise
    /// `promptCapabilities.embeddedContext` before the client sends this
    /// capability-gated block.
    #[serde(rename = "resource")]
    Resource { resource: EmbeddedResource },
    // image/audio/other v1 content is capability-gated; unknown variants do
    // not break a peer that sends them.
    #[serde(other)]
    Other,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmbeddedResource {
    pub uri: String,
    pub mime_type: String,
    pub text: String,
}

impl PromptContent {
    pub fn text(s: impl Into<String>) -> Self {
        PromptContent::Text { text: s.into() }
    }

    pub fn resource(
        uri: impl Into<String>,
        mime_type: impl Into<String>,
        text: impl Into<String>,
    ) -> Self {
        PromptContent::Resource {
            resource: EmbeddedResource {
                uri: uri.into(),
                mime_type: mime_type.into(),
                text: text.into(),
            },
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionPromptParams {
    pub session_id: String,
    pub prompt: Vec<PromptContent>,
}

/// Token usage an agent **reported** for one prompt turn (P71.4).
///
/// This is an *observation*, never a computation: every field is what the agent
/// said, and an absent field is unknown rather than zero (`ARCH/ROUTING.md` §5,
/// **I15**). `cached_read_tokens` and `cached_write_tokens` stay separate
/// because they are billed differently — collapsing them would invent
/// precision the agent did not report.
#[derive(Debug, Clone, Copy, PartialEq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct PromptUsage {
    /// Prompt (input) tokens the agent charged this turn.
    pub input_tokens: u64,
    /// Completion (output) tokens the agent produced.
    pub output_tokens: u64,
    /// Prompt-cache **reads** — a subset of the input the agent billed cheaper.
    pub cached_read_tokens: u64,
    /// Prompt-cache **writes** — billed separately from a read.
    pub cached_write_tokens: u64,
    /// The turn's own cost in USD when the agent prices its turns. `None` means
    /// the agent reported no cost; it is never estimated here.
    pub cost_usd: Option<f64>,
}

impl PromptUsage {
    /// Whether the agent reported any token count at all. A turn whose usage
    /// was entirely absent must not read as a measured zero.
    pub fn reported(&self) -> bool {
        self.input_tokens > 0
            || self.output_tokens > 0
            || self.cached_read_tokens > 0
            || self.cached_write_tokens > 0
            || self.cost_usd.is_some()
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct SessionPromptResult {
    pub stop_reason: StopReason,
    /// P71.4 — the agent's own usage report for this turn, when it sends one.
    /// Absent is the normal case for agents that report nothing; the ledger
    /// records that as *unreported*, never as zero tokens.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub usage: Option<PromptUsage>,
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
    /// ACP is inconsistent about this field: the **chunk** updates
    /// (`agent_message_chunk` / `agent_thought_chunk` / `user_message_chunk`)
    /// carry a *single* `ContentBlock`, while `tool_call` /
    /// `tool_call_update` carry an *array*. Accepting only the array shape
    /// silently drops every streamed token from a spec-conformed agent
    /// (opencode sends the object form), so both are normalised to a list
    /// here rather than at each consumer.
    #[serde(default, deserialize_with = "content_blocks")]
    pub content: Vec<ContentBlock>,
    pub locations: Vec<Location>,
    pub raw_input: Option<serde_json::Value>,
    pub raw_output: Option<serde_json::Value>,
    /// P53.1 — the agent's live slash vocabulary. Present only on
    /// `available_commands_update`; empty otherwise. Stored per ACP handle and
    /// served to the composer — never a hardcoded per-harness table.
    #[serde(default)]
    pub available_commands: Vec<AvailableCommand>,
    /// Complete agent-owned configuration after a config-option update.
    #[serde(default)]
    pub config_options: Vec<ConfigOption>,
}

/// Deserialize `SessionUpdate::content` from **either** a single
/// `ContentBlock` or an array of them (see the field docs). `null`/absent
/// yields an empty list, preserving the previous `default` behaviour.
fn content_blocks<'de, D>(de: D) -> Result<Vec<ContentBlock>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum OneOrMany {
        Many(Vec<ContentBlock>),
        One(ContentBlock),
    }
    Ok(match Option::<OneOrMany>::deserialize(de)? {
        Some(OneOrMany::Many(v)) => v,
        Some(OneOrMany::One(b)) => vec![b],
        None => Vec::new(),
    })
}

/// One live slash command advertised by the agent
/// (`available_commands_update.availableCommands[]` — ACP slash-commands
/// surface: `{name, description, input?}`, no leading `/`; the client
/// displays `/name` and submits `/name args` as `session/prompt` text).
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AvailableCommand {
    pub name: String,
    pub description: String,
    /// Optional JSON-schema-ish input hint. Opaque to us (rendered as help
    /// text); never executed.
    pub input: Option<serde_json::Value>,
}

impl SessionUpdate {
    pub fn is_tool_call(&self) -> bool {
        self.session_update == "tool_call"
    }

    pub fn is_tool_call_update(&self) -> bool {
        self.session_update == "tool_call_update"
    }

    /// P53.1 — this update carries the agent's live slash vocabulary.
    pub fn is_available_commands_update(&self) -> bool {
        self.session_update == "available_commands_update"
    }

    pub fn is_config_option_update(&self) -> bool {
        self.session_update == "config_option_update"
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
    fn auth_methods_accept_the_array_shape() {
        // Most agents: a sequence of methods, each carrying its own id.
        let v = serde_json::json!({
            "protocolVersion": 1,
            "agentCapabilities": {},
            "agentInfo": { "name": "a", "title": "A", "version": "1" },
            "authMethods": [
                { "id": "login", "name": "Log in", "type": "url" }
            ]
        });
        let r: InitializeResult = serde_json::from_value(v).unwrap();
        assert_eq!(r.auth_methods.len(), 1);
        assert_eq!(r.auth_methods[0].id, "login");
        assert_eq!(r.auth_methods[0].r#type, Some(AuthMethodType::Url));
    }

    #[test]
    fn auth_methods_accept_the_map_shape_pi_acp_sends() {
        // pi-acp sends `authMethods` as a map of methodId → method (observed
        // live). The key becomes the id; the name falls back to the key.
        let v = serde_json::json!({
            "protocolVersion": 1,
            "agentCapabilities": {},
            "agentInfo": { "name": "pi-acp", "title": "pi", "version": "1" },
            "authMethods": {
                "terminal": { "type": "terminal", "description": "Run pi in a terminal" }
            }
        });
        let r: InitializeResult = serde_json::from_value(v).unwrap();
        assert_eq!(r.auth_methods.len(), 1);
        assert_eq!(r.auth_methods[0].id, "terminal");
        assert_eq!(r.auth_methods[0].name, "terminal");
        assert_eq!(r.auth_methods[0].r#type, Some(AuthMethodType::Terminal));
        assert_eq!(
            r.auth_methods[0].description.as_deref(),
            Some("Run pi in a terminal")
        );
    }

    #[test]
    fn terminal_auth_method_env_parses_as_an_object_or_a_pair_list() {
        // Exactly what `pi-acp` sends (live-captured 2026-09-14): a sequence of
        // methods whose `env` is an object, not a pair list.
        let v = serde_json::json!({
            "protocolVersion": 1,
            "agentCapabilities": {
                "loadSession": true,
                "mcpCapabilities": { "http": false, "sse": false },
                "promptCapabilities": { "audio": false, "embeddedContext": false, "image": true },
                "sessionCapabilities": { "delete": {}, "list": {} }
            },
            "agentInfo": { "name": "pi-acp", "title": "pi ACP adapter", "version": "0.0.33" },
            "authMethods": [{
                "args": ["--terminal-login"],
                "description": "Start pi in an interactive terminal to configure API keys or login",
                "env": {},
                "id": "pi_terminal_login",
                "name": "Launch pi in the terminal",
                "type": "terminal"
            }]
        });
        let r: InitializeResult = serde_json::from_value(v).unwrap();
        assert_eq!(r.protocol_version, 1);
        assert!(r.agent_capabilities.load_session);
        assert!(r.agent_capabilities.prompt_capabilities.image);
        assert_eq!(r.agent_info.name, "pi-acp");
        assert_eq!(r.auth_methods.len(), 1);
        assert_eq!(r.auth_methods[0].id, "pi_terminal_login");
        assert_eq!(r.auth_methods[0].r#type, Some(AuthMethodType::Terminal));
        assert_eq!(r.auth_methods[0].env.as_deref(), Some(&[][..]));

        // The pair-list form still parses.
        let pairs = serde_json::json!({ "env": [ ["A", "1"], ["B", "2"] ] });
        let m: AuthMethod = serde_json::from_value(serde_json::json!({
            "id": "x", "name": "X", "env": pairs["env"].clone()
        }))
        .unwrap();
        assert_eq!(
            m.env.as_deref(),
            Some(&[("A".into(), "1".into()), ("B".into(), "2".into())][..])
        );

        // And an object map becomes pairs.
        let m2: AuthMethod = serde_json::from_value(serde_json::json!({
            "id": "y", "name": "Y", "env": { "K": "V" }
        }))
        .unwrap();
        assert_eq!(m2.env.as_deref(), Some(&[("K".into(), "V".into())][..]));
    }

    #[test]
    fn auth_methods_tolerate_being_absent_or_empty() {
        let v = serde_json::json!({
            "protocolVersion": 1,
            "agentCapabilities": {},
            "agentInfo": { "name": "a", "title": "A", "version": "1" },
            "authMethods": {}
        });
        let r: InitializeResult = serde_json::from_value(v).unwrap();
        assert!(r.auth_methods.is_empty());
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

    #[test]
    fn prompt_content_resource_uses_acp_embedded_shape() {
        let c = PromptContent::resource("file:///workspace/a.rs", "text/plain", "fn main() {}");
        let v = serde_json::to_value(c).unwrap();
        assert_eq!(v["type"], "resource");
        assert_eq!(v["resource"]["uri"], "file:///workspace/a.rs");
        assert_eq!(v["resource"]["mimeType"], "text/plain");
        assert_eq!(v["resource"]["text"], "fn main() {}");
    }

    #[test]
    fn available_commands_update_parses_live_slash_vocab() {
        // P53.1 — the exact ACP wire shape: `sessionUpdate:
        // "available_commands_update"` + `availableCommands[]`. `input` is
        // optional; a missing list degrades to empty, never an error.
        let v = serde_json::json!({
            "sessionId": "s1",
            "sessionUpdate": "available_commands_update",
            "availableCommands": [
                {"name": "compact", "description": "Compact the conversation"},
                {"name": "review", "description": "Review the diff",
                 "input": {"type": "object"}}
            ]
        });
        let u: SessionUpdate = serde_json::from_value(v).unwrap();
        assert!(u.is_available_commands_update());
        assert_eq!(u.available_commands.len(), 2);
        assert_eq!(u.available_commands[0].name, "compact");
        assert_eq!(
            u.available_commands[0].description,
            "Compact the conversation"
        );
        assert!(u.available_commands[0].input.is_none());
        assert!(u.available_commands[1].input.is_some());

        // A tool_call update carries no commands (empty, not absent-error).
        let t: SessionUpdate = serde_json::from_value(serde_json::json!({
            "sessionId": "s1",
            "sessionUpdate": "agent_message_chunk",
        }))
        .unwrap();
        assert!(!t.is_available_commands_update());
        assert!(t.available_commands.is_empty());
    }

    /// The exact shape opencode sends for a streamed token: a **single**
    /// `content` object, not an array. A `Vec`-only field rejected this with
    /// "invalid type: map, expected a sequence", which failed the whole prompt
    /// turn — the streaming path of every spec-conformed agent.
    #[test]
    fn chunk_content_may_be_a_single_object() {
        let u: SessionUpdate = serde_json::from_value(serde_json::json!({
            "sessionId": "ses_1",
            "sessionUpdate": "agent_thought_chunk",
            "content": { "type": "text", "text": "thinking out loud" }
        }))
        .unwrap();
        assert_eq!(u.content.len(), 1);
        assert_eq!(u.content[0].r#type, "text");
        assert_eq!(u.content[0].text, "thinking out loud");

        // The array shape (tool_call / tool_call_update) still parses, and
        // order is preserved.
        let many: SessionUpdate = serde_json::from_value(serde_json::json!({
            "sessionId": "ses_1",
            "sessionUpdate": "tool_call",
            "content": [
                { "type": "text", "text": "first" },
                { "type": "text", "text": "second" }
            ]
        }))
        .unwrap();
        assert_eq!(many.content.len(), 2);
        assert_eq!(many.content[0].text, "first");
        assert_eq!(many.content[1].text, "second");

        // Absent and explicit-null both stay empty (the previous default).
        for body in [
            serde_json::json!({ "sessionUpdate": "agent_message_chunk" }),
            serde_json::json!({ "sessionUpdate": "agent_message_chunk", "content": null }),
        ] {
            let u: SessionUpdate = serde_json::from_value(body).unwrap();
            assert!(u.content.is_empty());
        }
    }
}
