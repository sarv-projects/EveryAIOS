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
pub mod imap_smtp;

pub use browser_session::BrowserSessionConnector;
pub use calendar::CalendarConnector;
pub use gmail::GmailConnector;
pub use imap_smtp::ImapSmtpConnector;

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
