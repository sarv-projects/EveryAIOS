//! P6.6/P6.11 — Connector transports.
//!
//! Every transport is behind an injectable [`HttpTransport`] seam (or
//! [`CdpSession`] for browser-session connectors) so the full protocol logic
//! is testable with mock data and no live accounts.
//!
//! The live transport implementations (real OAuth tokens, real CDP sessions)
//! are wired at runtime through the `ConnectorHub` engine routing — never
//! from inside these modules.

pub mod browser_session;
pub mod calendar;
pub mod gmail;
pub mod graph;
pub mod gws;
pub mod imap_smtp;
pub mod native;
pub mod read_first;
pub mod scopes;
pub mod workspace;

pub use browser_session::BrowserSessionConnector;
pub use calendar::CalendarConnector;
pub use gmail::{GmailConnector, TokenRefresher};
pub use graph::{
    GraphCalendarEvent, GraphChat, GraphChatMessage, GraphConnector, GraphDriveItem,
    GraphMailMessage,
};
pub use gws::{GwsAction, GwsConnector, GwsError, GwsRequest};
pub use imap_smtp::ImapSmtpConnector;
pub use native::{
    classify_sql, has_stacked_statements, AuditChain, AuditEntry, ColumnRedaction, CostGuardError,
    ExplainCostGuard, SqlClass, SqlGuard, SqlGuardError,
};
pub use read_first::{
    ReadFirstPolicy, SendAction, SendApproval, SendBlocked, SendClass, SendKind, VaultTokenRef,
};
pub use scopes::{
    attach_scopes, ConnectorScopeManifest, ScopeEntry, GOOGLE_WORKSPACE_SCOPES,
    MICROSOFT_GRAPH_SCOPES, SCOPE_MANIFEST,
};
pub use workspace::{WorkspaceConnector, WorkspaceDoc, WorkspaceDriveFile, WorkspaceSheetValues};

/// Injectable HTTP transport seam — all connectors call the outside world
/// through this trait so the full protocol logic can be tested without
/// network access.
pub trait HttpTransport {
    /// Send a JSON POST and return the parsed response.
    fn post_json(
        &self,
        url: &str,
        headers: &[(&str, &str)],
        body: &[u8],
    ) -> Result<Vec<u8>, TransportError>;

    /// Send a GET and return the raw response bytes.
    fn get(&self, url: &str, headers: &[(&str, &str)]) -> Result<Vec<u8>, TransportError>;
}

/// Injectable CDP session seam for browser-session connectors.
pub trait CdpSession {
    /// Evaluate a JavaScript expression in the page context.
    fn evaluate(&self, expression: &str) -> Result<String, TransportError>;

    /// Navigate to a URL and wait for load.
    fn navigate(&self, url: &str) -> Result<(), TransportError>;

    /// Send a CDP command and return the JSON result.
    fn send_command(
        &self,
        method: &str,
        params: serde_json::Value,
    ) -> Result<serde_json::Value, TransportError>;
}

/// Transport-level error.
#[derive(Debug, Clone)]
pub struct TransportError {
    pub kind: TransportErrorKind,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TransportErrorKind {
    Network,
    Auth,
    RateLimited,
    NotFound,
    InvalidResponse,
    Timeout,
    Other,
}

impl std::fmt::Display for TransportError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{:?}: {}", self.kind, self.message)
    }
}

impl std::error::Error for TransportError {}
