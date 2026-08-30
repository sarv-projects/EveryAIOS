//! everyaios-acp — the ACP (Agent Client Protocol) harness bridge (P6.8 /
//! F12 / J17; doc 45 §1, doc 57 §2).
//!
//! - [`frame`] — newline-delimited JSON-RPC framing (the ACP stdio wire).
//! - [`messages`] — ACP v1 message types (initialize, session/new, prompt,
//!   stop reasons, tool kinds, session/update, request_permission).
//! - [`client`] — the [`AcpSession`] client lifecycle (spawn → initialize →
//!   session/new → prompt → permission → cancel) with a testable transport.
//! - [`registry`] — the agent **launch registry** (the `ollama launch`
//!   pattern): manifests with auth-mode badges + distribution types + how to
//!   drive each agent, with our own inbuilt engine as the default.
//! - [`registry_index`] — F8: the official ACP registry schema (`registry.json`)
//!   parse + platform resolution + install plans + merge + allow-list policy.
//! - [`registry_client`] — F8: fetch + cache the official registry (pluggable
//!   HTTP transport).
//! - [`installer`] — F8: the install executor (download → sha256 → extract +
//!   install-state persistence).

pub mod a2a;
pub mod chief;
pub mod client;
pub mod frame;
pub mod harness_config;
pub mod installer;
pub mod messages;
pub mod registry;
pub mod registry_client;
pub mod registry_index;

pub use a2a::{A2aError, AgentCard, AgentCardVerifier, AgentSkill, CardTrust, SignedAgentCard};
pub use chief::{
    governance_mode, AcpChief, Approval, ChiefAdapter, ChiefCapabilities, ChiefError, ChiefEvent,
    DelegateChief, EventStream, GovernedSession, PermissionRequest, SessionHandle, SessionOptions,
    SessionState, UserMessage,
};
pub use client::{AcpError, AcpSession, AcpTransport, ProcessTransport, PromptOutcome};
pub use frame::{decode_messages, encode_message};
pub use harness_config::{
    builtin_writers, ClaudeCodeConfig, CodexConfig, HarnessConfigError, HarnessConfigWriter,
    OpenCodeConfig, ProviderConfig,
};
pub use installer::{InstallError, InstallOutcome, Installer, OwnershipMarker};
pub use messages::{
    AgentCapabilities, AgentInfo, AuthMethod, AuthMethodType, AuthenticateParams,
    AuthenticateResult, ClientCapabilities, ClientInfo, ContentBlock, FsCapabilities,
    InitializeParams, InitializeResult, Location, McpServer, PermissionDecision, PermissionOption,
    PermissionOptionKind, PermissionOutcome, PermissionRequestParams, PermissionResult, Position,
    PromptCapabilities, PromptContent, SessionNewParams, SessionNewResult, SessionPromptParams,
    SessionPromptResult, SessionUpdate, StopReason, TextRange, ToolCall, ToolKind, ToolStatus,
    PROTOCOL_VERSION,
};
pub use registry::{
    AuthMode, Distribution, HarnessManifest, HarnessProtocol, LaunchPlan, LaunchRegistry,
};
pub use registry_client::{FetchError, RegistryClient};
pub use registry_index::{
    BinaryTarget, InstallKind, InstallSpec, Platform, PolicyVerdict, RegistryAgent,
    RegistryDistribution, RegistryIndex, RegistryPolicy,
};
