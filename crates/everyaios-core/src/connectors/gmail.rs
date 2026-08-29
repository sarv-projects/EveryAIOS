//! P6.11 — Gmail API transport.
//!
//! Read/search/send/modify operations over the Gmail REST API. The full
//! protocol logic is tested with a mock [`HttpTransport`] — the live
//! implementation uses the Auth Bridge OAuth tokens (PKCE core is already
//! landed in `everyaios-vault::auth_bridge`).
//!
//! Token refresh happens transparently: if a 401 is returned, the
//! [`TokenRefresher`] trait is invoked once before surfacing the error.

use super::{HttpTransport, TransportError, TransportErrorKind};

/// OAuth token refresher — the caller (Auth Bridge) provides the
/// implementation that hits Google's token endpoint.
pub trait TokenRefresher {
    /// Refresh the access token. Returns the new token on success.
    fn refresh(&self) -> Result<String, TransportError>;
}

/// Gmail connector — stateless protocol logic over injected seams.
pub struct GmailConnector<T: HttpTransport, R: TokenRefresher> {
    transport: T,
    refresher: R,
    access_token: String,
    user_id: String,
}

/// A Gmail message (simplified for agent consumption).
#[derive(Debug, Clone)]
pub struct GmailMessage {
    pub id: String,
    pub thread_id: String,
    pub subject: String,
    pub from: String,
    pub to: String,
    pub date: String,
    pub snippet: String,
    pub body_plain: Option<String>,
    pub body_html: Option<String>,
    pub labels: Vec<String>,
}

/// Result of a Gmail search query.
#[derive(Debug, Clone)]
pub struct GmailSearchResult {
    pub messages: Vec<GmailMessage>,
    pub total_estimated: usize,
    pub next_page_token: Option<String>,
}

/// A Gmail label.
#[derive(Debug, Clone)]
pub struct GmailLabel {
    pub id: String,
    pub name: String,
    pub unread_count: usize,
}

/// Send-draft result.
#[derive(Debug, Clone)]
pub struct SendResult {
    pub message_id: String,
    pub thread_id: String,
}

/// Read-draft result for outbound composing.
#[derive(Debug, Clone)]
pub struct DraftDraft {
    pub id: String,
    pub message_id: String,
    pub snippet: String,
}

const GMAIL_API_BASE: &str = "https://gmail.googleapis.com/gmail/v1";

impl<T: HttpTransport, R: TokenRefresher> GmailConnector<T, R> {
    pub fn new(transport: T, refresher: R, access_token: String, user_id: String) -> Self {
        Self {
            transport,
            refresher,
            access_token,
            user_id,
        }
    }

    /// The base URL for Gmail API calls.
    fn base_url(&self) -> String {
        format!("{GMAIL_API_BASE}/users/{}", self.user_id)
    }

    /// Build auth headers for the current access token.
    fn auth_headers(&self) -> Vec<(&str, &str)> {
        vec![("Authorization", &self.access_token)]
    }

    /// GET with automatic 401→refresh→retry once. Every read path routes
    /// through here so an expired access token is transparently refreshed
    /// (spec F14: read/send/modify all recover from a 401).
    fn get_with_refresh(&mut self, url: &str) -> Result<Vec<u8>, TransportError> {
        match self.transport.get(url, &self.auth_headers()) {
            Err(e) if e.kind == TransportErrorKind::Auth => {
                // Token expired — refresh once and retry.
                self.access_token = self.refresher.refresh()?;
                self.transport.get(url, &self.auth_headers())
            }
            other => other,
        }
    }

    /// POST (JSON) with automatic 401→refresh→retry once. Every mutation
    /// path (send/modify/trash) routes through here.
    fn post_with_refresh(
        &mut self,
        url: &str,
        body: &[u8],
    ) -> Result<Vec<u8>, TransportError> {
        match self.transport.post_json(url, &self.auth_headers(), body) {
            Err(e) if e.kind == TransportErrorKind::Auth => {
                self.access_token = self.refresher.refresh()?;
                self.transport.post_json(url, &self.auth_headers(), body)
            }
            other => other,
        }
    }

    /// List Gmail labels.
    pub fn list_labels(&mut self) -> Result<Vec<GmailLabel>, TransportError> {
        let base = self.base_url();
        let url = format!("{base}/labels");
        let resp = self.get_with_refresh(&url)?;
        let json: serde_json::Value =
            serde_json::from_slice(&resp).map_err(|e| TransportError {
                kind: TransportErrorKind::InvalidResponse,
                message: e.to_string(),
            })?;
        let labels = json["labels"]
            .as_array()
            .map(|arr| {
                arr.iter()
                    .filter_map(|l| {
                        Some(GmailLabel {
                            id: l["id"].as_str()?.to_string(),
                            name: l["name"].as_str()?.to_string(),
                            unread_count: l["messagesUnread"].as_u64().unwrap_or(0) as usize,
                        })
                    })
                    .collect()
            })
            .unwrap_or_default();
        Ok(labels)
    }

    /// Search messages by Gmail query string.
    pub fn search(
        &mut self,
        query: &str,
        max_results: usize,
        page_token: Option<&str>,
    ) -> Result<GmailSearchResult, TransportError> {
        let base = self.base_url();
        let mut url = format!(
            "{base}/messages?q={}&maxResults={}",
            urlencoding::encode(query),
            max_results
        );
        if let Some(pt) = page_token {
            url = format!("{url}&pageToken={pt}");
        }
        let resp = self.get_with_refresh(&url)?;
        let json: serde_json::Value =
            serde_json::from_slice(&resp).map_err(|e| TransportError {
                kind: TransportErrorKind::InvalidResponse,
                message: e.to_string(),
            })?;
        let total = json["resultSizeEstimate"].as_u64().unwrap_or(0) as usize;
        let next = json["nextPageToken"].as_str().map(|s| s.to_string());
        let msg_ids = json["messages"]
            .as_array()
            .map(|arr| {
                arr.iter()
                    .filter_map(|m| m["id"].as_str().map(|s| s.to_string()))
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();

        let mut messages = Vec::new();
        for mid in &msg_ids {
            if let Ok(m) = self.get_message(mid) {
                messages.push(m);
            }
        }
        Ok(GmailSearchResult {
            messages,
            total_estimated: total,
            next_page_token: next,
        })
    }

    /// Get a single message by ID.
    pub fn get_message(&mut self, message_id: &str) -> Result<GmailMessage, TransportError> {
        let base = self.base_url();
        let url = format!("{base}/messages/{message_id}?format=full");
        let resp = self.get_with_refresh(&url)?;
        let json: serde_json::Value =
            serde_json::from_slice(&resp).map_err(|e| TransportError {
                kind: TransportErrorKind::InvalidResponse,
                message: e.to_string(),
            })?;
        let headers_map = json["payload"]["headers"]
            .as_array()
            .map(|arr| {
                arr.iter()
                    .filter_map(|h| {
                        Some((
                            h["name"].as_str()?.to_string(),
                            h["value"].as_str()?.to_string(),
                        ))
                    })
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        let find = |name: &str| -> String {
            headers_map
                .iter()
                .find(|(n, _)| n.eq_ignore_ascii_case(name))
                .map(|(_, v)| v.clone())
                .unwrap_or_default()
        };
        let labels = json["labelIds"]
            .as_array()
            .map(|arr| {
                arr.iter()
                    .filter_map(|l| l.as_str().map(|s| s.to_string()))
                    .collect()
            })
            .unwrap_or_default();
        Ok(GmailMessage {
            id: json["id"].as_str().unwrap_or("").to_string(),
            thread_id: json["threadId"].as_str().unwrap_or("").to_string(),
            subject: find("Subject"),
            from: find("From"),
            to: find("To"),
            date: find("Date"),
            snippet: json["snippet"].as_str().unwrap_or("").to_string(),
            body_plain: extract_body(&json["payload"], "text/plain"),
            body_html: extract_body(&json["payload"], "text/html"),
            labels,
        })
    }

    /// Send a new message (returns the sent message ID).
    pub fn send_message(
        &mut self,
        to: &str,
        subject: &str,
        body: &str,
    ) -> Result<SendResult, TransportError> {
        let raw = build_mime_raw(to, subject, body, &self.access_token);
        let encoded = base64_encode_urlsafe(raw.as_bytes());
        let body_json = serde_json::json!({ "raw": encoded });
        let body_bytes = serde_json::to_vec(&body_json).map_err(|e| TransportError {
            kind: TransportErrorKind::InvalidResponse,
            message: e.to_string(),
        })?;
        let base = self.base_url();
        let url = format!("{base}/messages/send");
        let resp = self.post_with_refresh(&url, &body_bytes)?;
        let json: serde_json::Value =
            serde_json::from_slice(&resp).map_err(|e| TransportError {
                kind: TransportErrorKind::InvalidResponse,
                message: e.to_string(),
            })?;
        Ok(SendResult {
            message_id: json["id"].as_str().unwrap_or("").to_string(),
            thread_id: json["threadId"].as_str().unwrap_or("").to_string(),
        })
    }

    /// Mark messages with labels (add/remove).
    pub fn modify_labels(
        &mut self,
        message_ids: &[&str],
        add_labels: &[&str],
        remove_labels: &[&str],
    ) -> Result<(), TransportError> {
        let body_json = serde_json::json!({
            "ids": message_ids,
            "addLabelIds": add_labels,
            "removeLabelIds": remove_labels,
        });
        let body_bytes = serde_json::to_vec(&body_json).map_err(|e| TransportError {
            kind: TransportErrorKind::InvalidResponse,
            message: e.to_string(),
        })?;
        let base = self.base_url();
        let url = format!("{base}/messages/batchModify");
        self.post_with_refresh(&url, &body_bytes)?;
        Ok(())
    }

    /// Trash a message.
    pub fn trash(&mut self, message_id: &str) -> Result<(), TransportError> {
        let base = self.base_url();
        let url = format!("{base}/messages/{message_id}/trash");
        self.post_with_refresh(&url, b"{}")?;
        Ok(())
    }

    /// Get unread counts per label.
    pub fn unread_counts(&mut self) -> Result<Vec<GmailLabel>, TransportError> {
        let labels = self.list_labels()?;
        Ok(labels.into_iter().filter(|l| l.unread_count > 0).collect())
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Extract the body content from a MIME part by mime type.
fn extract_body(part: &serde_json::Value, mime_type: &str) -> Option<String> {
    if part["mimeType"].as_str() == Some(mime_type) {
        if let Some(data) = part["body"]["data"].as_str() {
            return Some(base64_decode_urlsafe(data));
        }
    }
    if let Some(parts) = part["parts"].as_array() {
        for p in parts {
            if let Some(body) = extract_body(p, mime_type) {
                return Some(body);
            }
        }
    }
    None
}

/// Build a simple MIME raw message.
fn build_mime_raw(to: &str, subject: &str, body: &str, _sender_email: &str) -> String {
    format!(
        "To: {to}\r\nSubject: {subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n{body}"
    )
}

/// Base64 URL-safe encode.
fn base64_encode_urlsafe(data: &[u8]) -> String {
    use base64::Engine;
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(data)
}

/// Base64 URL-safe decode — tries URL_SAFE_NO_PAD first, then standard with padding.
fn base64_decode_urlsafe(data: &str) -> String {
    use base64::Engine;
    // Try URL-safe no-pad first (for URL-safe tokens).
    if let Ok(bytes) = base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(data) {
        return String::from_utf8_lossy(&bytes).to_string();
    }
    // Fall back to standard base64 (for Gmail API responses with padding).
    if let Ok(bytes) = base64::engine::general_purpose::STANDARD.decode(data) {
        return String::from_utf8_lossy(&bytes).to_string();
    }
    // Last resort: try URL-safe with padding.
    if let Ok(bytes) = base64::engine::general_purpose::URL_SAFE.decode(data) {
        return String::from_utf8_lossy(&bytes).to_string();
    }
    String::new()
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;

    /// Mock HTTP transport that returns canned responses.
    struct MockTransport {
        responses: RefCell<Vec<Result<Vec<u8>, TransportError>>>,
    }

    impl MockTransport {
        fn new(responses: Vec<Result<Vec<u8>, TransportError>>) -> Self {
            Self {
                responses: RefCell::new(responses),
            }
        }
    }

    impl HttpTransport for MockTransport {
        fn post_json(
            &self,
            _url: &str,
            _headers: &[(&str, &str)],
            _body: &[u8],
        ) -> Result<Vec<u8>, TransportError> {
            self.responses
                .borrow_mut()
                .pop()
                .unwrap_or(Err(TransportError {
                    kind: TransportErrorKind::Other,
                    message: "no more mock responses".into(),
                }))
        }

        fn get(&self, _url: &str, _headers: &[(&str, &str)]) -> Result<Vec<u8>, TransportError> {
            self.responses
                .borrow_mut()
                .pop()
                .unwrap_or(Err(TransportError {
                    kind: TransportErrorKind::Other,
                    message: "no more mock responses".into(),
                }))
        }
    }

    /// Mock token refresher.
    struct MockRefresher;

    impl TokenRefresher for MockRefresher {
        fn refresh(&self) -> Result<String, TransportError> {
            Ok("refreshed-token".into())
        }
    }

    #[test]
    fn gmail_search_returns_messages() {
        let search_resp = serde_json::json!({
            "messages": [
                {"id": "msg1", "threadId": "t1"},
                {"id": "msg2", "threadId": "t2"}
            ],
            "resultSizeEstimate": 42,
            "nextPageToken": "page2"
        });
        let msg1_resp = serde_json::json!({
            "id": "msg1",
            "threadId": "t1",
            "snippet": "Hello world",
            "labelIds": ["INBOX", "UNREAD"],
            "payload": {
                "mimeType": "text/plain",
                "headers": [
                    {"name": "Subject", "value": "Test Subject"},
                    {"name": "From", "value": "alice@example.com"},
                    {"name": "To", "value": "bob@example.com"},
                    {"name": "Date", "value": "Mon, 01 Jan 2026 00:00:00 +0000"}
                ],
                "body": {"data": "SGVsbG8="}
            }
        });
        let msg2_resp = serde_json::json!({
            "id": "msg2",
            "threadId": "t2",
            "snippet": "Second message",
            "labelIds": ["INBOX"],
            "payload": {
                "mimeType": "text/plain",
                "headers": [
                    {"name": "Subject", "value": "Re: Test"},
                    {"name": "From", "value": "carol@example.com"},
                    {"name": "To", "value": "bob@example.com"},
                    {"name": "Date", "value": "Tue, 02 Jan 2026 00:00:00 +0000"}
                ],
                "body": {"data": "U2Vjb25k"}
            }
        });
        // Pop order: search (pop 1st) → msg1 (pop 2nd) → msg2 (pop 3rd).
        let transport = MockTransport::new(vec![
            Ok(serde_json::to_vec(&msg2_resp).unwrap()),
            Ok(serde_json::to_vec(&msg1_resp).unwrap()),
            Ok(serde_json::to_vec(&search_resp).unwrap()),
        ]);
        let mut gmail =
            GmailConnector::new(transport, MockRefresher, "test-token".into(), "me".into());
        let result = gmail.search("test", 10, None).unwrap();
        assert_eq!(result.messages.len(), 2);
        assert_eq!(result.messages[0].id, "msg1");
        assert_eq!(result.messages[0].subject, "Test Subject");
        assert_eq!(result.messages[0].from, "alice@example.com");
        assert_eq!(result.total_estimated, 42);
        assert_eq!(result.next_page_token.as_deref(), Some("page2"));
    }

    #[test]
    fn gmail_send_message() {
        let send_resp = serde_json::json!({
            "id": "sent-123",
            "threadId": "thread-456"
        });
        let transport = MockTransport::new(vec![Ok(serde_json::to_vec(&send_resp).unwrap())]);
        let mut gmail =
            GmailConnector::new(transport, MockRefresher, "test-token".into(), "me".into());
        let result = gmail
            .send_message("bob@example.com", "Hello", "Hi there")
            .unwrap();
        assert_eq!(result.message_id, "sent-123");
        assert_eq!(result.thread_id, "thread-456");
    }

    #[test]
    fn gmail_401_triggers_refresh_on_send() {
        let send_resp = serde_json::json!({
            "id": "sent-ok",
            "threadId": "t-ok"
        });
        // Pop order: after refresh succeeds (pop first), then 401 (pop second).
        let transport = MockTransport::new(vec![
            Ok(serde_json::to_vec(&send_resp).unwrap()),
            Err(TransportError {
                kind: TransportErrorKind::Auth,
                message: "401 Unauthorized".into(),
            }),
        ]);
        let mut gmail = GmailConnector::new(
            transport,
            MockRefresher,
            "expired-token".into(),
            "me".into(),
        );
        let result = gmail.send_message("bob@example.com", "Test", "Body");
        assert!(result.is_ok());
        assert_eq!(result.unwrap().message_id, "sent-ok");
    }

    #[test]
    fn gmail_401_triggers_refresh_on_get_message() {
        let msg_resp = serde_json::json!({
            "id": "m1",
            "threadId": "t1",
            "snippet": "after refresh",
            "labelIds": ["INBOX"],
            "payload": { "mimeType": "text/plain", "headers": [], "body": {} }
        });
        // Pop order: refreshed GET succeeds (pop first), initial 401 (pop second).
        let transport = MockTransport::new(vec![
            Ok(serde_json::to_vec(&msg_resp).unwrap()),
            Err(TransportError {
                kind: TransportErrorKind::Auth,
                message: "401 Unauthorized".into(),
            }),
        ]);
        let mut gmail = GmailConnector::new(
            transport,
            MockRefresher,
            "expired-token".into(),
            "me".into(),
        );
        let result = gmail.get_message("m1");
        assert!(result.is_ok(), "read path must recover from 401 via refresh");
        assert_eq!(result.unwrap().snippet, "after refresh");
    }

    #[test]
    fn gmail_401_triggers_refresh_on_list_labels() {
        let labels_resp = serde_json::json!({
            "labels": [{ "id": "INBOX", "name": "INBOX", "messagesUnread": 3 }]
        });
        let transport = MockTransport::new(vec![
            Ok(serde_json::to_vec(&labels_resp).unwrap()),
            Err(TransportError {
                kind: TransportErrorKind::Auth,
                message: "401 Unauthorized".into(),
            }),
        ]);
        let mut gmail = GmailConnector::new(
            transport,
            MockRefresher,
            "expired-token".into(),
            "me".into(),
        );
        let result = gmail.list_labels();
        assert!(result.is_ok(), "list_labels must recover from 401 via refresh");
        assert_eq!(result.unwrap()[0].unread_count, 3);
    }

    #[test]
    fn gmail_401_triggers_refresh_on_modify_labels() {
        // Pop order: refreshed POST succeeds (pop first), initial 401 (pop second).
        let transport = MockTransport::new(vec![
            Ok(b"{}".to_vec()),
            Err(TransportError {
                kind: TransportErrorKind::Auth,
                message: "401 Unauthorized".into(),
            }),
        ]);
        let mut gmail = GmailConnector::new(
            transport,
            MockRefresher,
            "expired-token".into(),
            "me".into(),
        );
        let result = gmail.modify_labels(&["m1"], &["TRASH"], &["INBOX"]);
        assert!(result.is_ok(), "modify_labels must recover from 401 via refresh");
    }

    #[test]
    fn gmail_read_401_without_refresh_still_fails() {
        // If refresh also fails, the error surfaces (no infinite retry).
        struct FailRefresher;
        impl TokenRefresher for FailRefresher {
            fn refresh(&self) -> Result<String, TransportError> {
                Err(TransportError {
                    kind: TransportErrorKind::Auth,
                    message: "refresh failed".into(),
                })
            }
        }
        let transport = MockTransport::new(vec![Err(TransportError {
            kind: TransportErrorKind::Auth,
            message: "401 Unauthorized".into(),
        })]);
        let mut gmail = GmailConnector::new(
            transport,
            FailRefresher,
            "expired-token".into(),
            "me".into(),
        );
        assert!(gmail.get_message("m1").is_err());
    }

    #[test]
    fn gmail_modify_labels() {
        let transport = MockTransport::new(vec![Ok(b"{}".to_vec())]);
        let mut gmail =
            GmailConnector::new(transport, MockRefresher, "test-token".into(), "me".into());
        let result = gmail.modify_labels(&["msg1"], &["TRASH"], &["INBOX"]);
        assert!(result.is_ok());
    }

    #[test]
    fn gmail_trash() {
        let transport = MockTransport::new(vec![Ok(b"{}".to_vec())]);
        let mut gmail =
            GmailConnector::new(transport, MockRefresher, "test-token".into(), "me".into());
        let result = gmail.trash("msg1");
        assert!(result.is_ok());
    }

    #[test]
    fn extract_body_from_nested_parts() {
        let json = serde_json::json!({
            "mimeType": "multipart/alternative",
            "parts": [
                {
                    "mimeType": "text/plain",
                    "body": {"data": "SGVsbG8="}
                },
                {
                    "mimeType": "text/html",
                    "body": {"data": "PGgxPkhlbGxvPC9oMT4="}
                }
            ]
        });
        let plain = extract_body(&json, "text/plain");
        assert_eq!(plain.as_deref(), Some("Hello"));
        let html = extract_body(&json, "text/html");
        assert_eq!(html.as_deref(), Some("<h1>Hello</h1>"));
    }

    #[test]
    fn base64_roundtrip() {
        let data = b"Hello, world!";
        let encoded = base64_encode_urlsafe(data);
        let decoded = base64_decode_urlsafe(&encoded);
        assert_eq!(decoded, "Hello, world!");
    }
}
