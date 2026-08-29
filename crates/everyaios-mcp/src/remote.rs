//! Remote MCP client — OAuth 2.1 + streamable HTTP (ARCH/15 Tier 2).
//!
//! The Connect Store lists remote MCP servers (`StoreKind::RemoteMcp`) but the
//! crate had no way to *talk to* them. This module is the client half:
//!
//! - **Discovery** per the MCP authorization spec (2026-07-28):
//!   `GET {server}/.well-known/oauth-protected-resource` → resource +
//!   authorization_servers; `GET {auth}/.well-known/oauth-authorization-server`
//!   → endpoints.
//! - **Dynamic client registration** (RFC 7591) when the server offers a
//!   `registration_endpoint` — the local app registers itself on the fly
//!   (public client, PKCE, loopback redirect), so **no pre-registered client
//!   ID is needed** — the ChatGPT "click → sign in → use" path for OSS.
//! - **PKCE (S256)** auth-code flow with a local loopback redirect.
//! - **Streamable HTTP** transport: POST JSON-RPC with
//!   `Accept: application/json, text/event-stream`, parse SSE `data:` frames.
//!
//! Tokens are returned to the caller (the shell stores them in the vault's
//! key ring under `remote-mcp:<server-id>`). Everything here is a pure
//! client over a tiny `HttpTransport` seam so tests use a mock.

use serde::{Deserialize, Serialize};

#[cfg(test)]
use std::collections::HashMap;

/// Well-known protected-resource metadata (`.well-known/oauth-protected-resource`).
/// Wire JSON is snake_case per the MCP authorization spec — no rename.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProtectedResource {
    #[serde(default)]
    pub resource: String,
    #[serde(default)]
    pub authorization_servers: Vec<String>,
}

/// Authorization-server metadata (`.well-known/oauth-authorization-server`).
/// Wire JSON is snake_case per RFC 8414 — no rename.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AuthServerMetadata {
    pub issuer: String,
    #[serde(default)]
    pub authorization_endpoint: String,
    #[serde(default)]
    pub token_endpoint: String,
    #[serde(default)]
    pub registration_endpoint: String,
    #[serde(default)]
    pub scopes_supported: Vec<String>,
    #[serde(default)]
    pub response_types_supported: Vec<String>,
}

/// Result of RFC 7591 dynamic client registration.
/// Wire JSON is snake_case per RFC 7591 — no rename.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ClientRegistration {
    pub client_id: String,
    #[serde(default)]
    pub client_secret: String,
    #[serde(default)]
    pub token_endpoint_auth_method: String,
}

/// A validated remote server target.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RemoteTarget {
    /// The MCP server URL (the OAuth 2.1 resource server).
    pub url: String,
    /// Authorization server base (authorize + token endpoints).
    pub auth: AuthServerMetadata,
    /// Registered client (dynamic or supplied).
    pub client: ClientRegistration,
}

/// An in-flight PKCE flow — the shell keeps `state`/`verifier` and opens
/// `auth_url` in the system browser.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PkceFlow {
    pub auth_url: String,
    pub state: String,
    pub code_verifier: String,
    pub redirect_uri: String,
}

/// OAuth token response (the fields a public client needs).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TokenResponse {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub token_type: String,
    pub expires_in: i64,
    pub scope: String,
}

/// The HTTP seam — the real `UreqTransport` talks to the wire; tests use a
/// mock. Mirrors the vault's `post_form`/`get_json` pattern but with a trait
/// so the remote-client logic is unit-testable without a socket.
pub trait HttpTransport: Send {
    fn get_json(&self, url: &str) -> Result<serde_json::Value, RemoteError>;
    fn post_form(
        &self,
        url: &str,
        form: &[(&str, &str)],
    ) -> Result<serde_json::Value, RemoteError>;
    fn post_json(
        &self,
        url: &str,
        bearer: Option<&str>,
        body: &serde_json::Value,
    ) -> Result<serde_json::Value, RemoteError>;
}

/// Default transport using `ureq` (same client as the vault).
#[derive(Debug, Clone, Default)]
pub struct UreqTransport;

impl HttpTransport for UreqTransport {
    fn get_json(&self, url: &str) -> Result<serde_json::Value, RemoteError> {
        ureq::get(url)
            .set("Accept", "application/json")
            .call()
            .map_err(|e| RemoteError::Transport(e.to_string()))?
            .into_json()
            .map_err(|e| RemoteError::Transport(e.to_string()))
    }

    fn post_form(
        &self,
        url: &str,
        form: &[(&str, &str)],
    ) -> Result<serde_json::Value, RemoteError> {
        ureq::post(url)
            .set("Accept", "application/json")
            .send_form(form)
            .map_err(|e| RemoteError::Transport(e.to_string()))?
            .into_json()
            .map_err(|e| RemoteError::Transport(e.to_string()))
    }

    fn post_json(
        &self,
        url: &str,
        bearer: Option<&str>,
        body: &serde_json::Value,
    ) -> Result<serde_json::Value, RemoteError> {
        let mut req = ureq::post(url)
            .set("Accept", "application/json, text/event-stream")
            .set("Content-Type", "application/json");
        if let Some(b) = bearer {
            req = req.set("Authorization", &format!("Bearer {b}"));
        }
        req.send_json(body)
            .map_err(|e| RemoteError::Transport(e.to_string()))?
            .into_json()
            .map_err(|e| RemoteError::Transport(e.to_string()))
    }
}

/// Fetch `.well-known/oauth-protected-resource` from a server URL.
pub fn discover_protected_resource(
    server_url: &str,
    http: &dyn HttpTransport,
) -> Result<ProtectedResource, RemoteError> {
    let base = server_url.trim_end_matches('/');
    let wk = format!("{base}/.well-known/oauth-protected-resource");
    let json = http.get_json(&wk)?;
    serde_json::from_value(json).map_err(RemoteError::Json)
}

/// Fetch authorization-server metadata (with the protected-resource fallback:
/// if the resource's `authorization_servers` list is empty, try the server
/// origin itself).
pub fn discover_authorization_server(
    resource: &ProtectedResource,
    server_url: &str,
    http: &dyn HttpTransport,
) -> Result<AuthServerMetadata, RemoteError> {
    let mut candidates: Vec<String> = resource.authorization_servers.clone();
    if candidates.is_empty() {
        // Fallback: same origin, standard well-known path.
        let origin = server_url
            .split("://")
            .nth(1)
            .and_then(|rest| rest.split('/').next())
            .unwrap_or("");
        candidates.push(format!("https://{origin}"));
    }
    let mut last_err = None;
    for base in candidates {
        let wk = format!("{}/.well-known/oauth-authorization-server", base.trim_end_matches('/'));
        match http.get_json(&wk) {
            Ok(json) => match serde_json::from_value::<AuthServerMetadata>(json) {
                Ok(m) => return Ok(m),
                Err(e) => last_err = Some(RemoteError::Json(e)),
            },
            Err(e) => last_err = Some(e),
        }
    }
    Err(last_err.unwrap_or(RemoteError::Msg(
        "no authorization-server metadata discovered".into(),
    )))
}

/// RFC 7591 dynamic client registration (public client, PKCE, loopback).
pub fn register_dynamic_client(
    registration_endpoint: &str,
    redirect_uri: &str,
    http: &dyn HttpTransport,
) -> Result<ClientRegistration, RemoteError> {
    let body = serde_json::json!({
        "client_name": "EveryAIOS",
        "redirect_uris": [redirect_uri],
        "grant_types": ["authorization_code", "refresh_token"],
        "response_types": ["code"],
        "token_endpoint_auth_method": "none",
        "scope": ""
    });
    // Dynamic registration POSTs JSON to the registration endpoint (not a form).
    let json = post_json_raw(http, registration_endpoint, &body)?;
    serde_json::from_value(json).map_err(RemoteError::Json)
}

/// Full connect handshake: discover resource → discover auth server →
/// register client (or use a supplied one) → return the ready target.
pub fn connect(
    server_url: &str,
    http: &dyn HttpTransport,
) -> Result<RemoteTarget, RemoteError> {
    if !(server_url.starts_with("https://")
        || server_url.starts_with("http://127.0.0.1")
        || server_url.starts_with("http://localhost"))
    {
        return Err(RemoteError::InsecureUrl(server_url.to_string()));
    }
    let resource = discover_protected_resource(server_url, http)?;
    let auth = discover_authorization_server(&resource, server_url, http)?;
    let redirect_uri = format!("http://127.0.0.1:0/oauth/callback");
    let client = if auth.registration_endpoint.is_empty() {
        // No dynamic registration — the caller must supply a client_id.
        return Err(RemoteError::NeedsPreRegisteredClient);
    } else {
        register_dynamic_client(&auth.registration_endpoint, &redirect_uri, http)?
    };
    Ok(RemoteTarget {
        url: server_url.to_string(),
        auth,
        client,
    })
}

/// Build the PKCE authorize URL + keep state/verifier (the shell stores
/// these while the browser is open, then calls [`exchange_code`]).
pub fn build_authorize_url(target: &RemoteTarget, redirect_uri: &str) -> Result<PkceFlow, RemoteError> {
    let verifier = random_url_b64(32);
    let challenge = code_challenge(&verifier);
    let state = random_hex(16);
    let mut query = String::new();
    push_q(&mut query, "client_id", &target.client.client_id);
    push_q(&mut query, "response_type", "code");
    push_q(&mut query, "redirect_uri", redirect_uri);
    push_q(&mut query, "code_challenge", &challenge);
    push_q(&mut query, "code_challenge_method", "S256");
    push_q(&mut query, "state", &state);
    // Ask for a refresh token so re-auth is silent.
    push_q(&mut query, "scope", "openid");
    let auth_url = format!("{}?{}", target.auth.authorization_endpoint, query);
    Ok(PkceFlow {
        auth_url,
        state,
        code_verifier: verifier,
        redirect_uri: redirect_uri.to_string(),
    })
}

/// Exchange the authorization code for tokens (PKCE).
pub fn exchange_code(
    target: &RemoteTarget,
    flow: &PkceFlow,
    code: &str,
    http: &dyn HttpTransport,
) -> Result<TokenResponse, RemoteError> {
    let form = vec![
        ("grant_type", "authorization_code"),
        ("code", code),
        ("redirect_uri", flow.redirect_uri.as_str()),
        ("client_id", target.client.client_id.as_str()),
        ("code_verifier", flow.code_verifier.as_str()),
    ];
    let json = http.post_form(&target.auth.token_endpoint, &form)?;
    parse_tokens(&json)
}

/// Refresh an access token.
pub fn refresh_token(
    target: &RemoteTarget,
    refresh: &str,
    http: &dyn HttpTransport,
) -> Result<TokenResponse, RemoteError> {
    let form = vec![
        ("grant_type", "refresh_token"),
        ("refresh_token", refresh),
        ("client_id", target.client.client_id.as_str()),
    ];
    let json = http.post_form(&target.auth.token_endpoint, &form)?;
    parse_tokens(&json)
}

/// One streamable-HTTP JSON-RPC call (tools/list, tools/call, …). Returns the
/// parsed JSON-RPC response body (the shell parses `result`/`error`).
pub fn rpc(
    target: &RemoteTarget,
    bearer: &str,
    method: &str,
    params: serde_json::Value,
    http: &dyn HttpTransport,
) -> Result<serde_json::Value, RemoteError> {
    let body = serde_json::json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": method,
        "params": params,
    });
    http.post_json(&target.url, Some(bearer), &body)
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

fn post_json_raw(
    http: &dyn HttpTransport,
    url: &str,
    body: &serde_json::Value,
) -> Result<serde_json::Value, RemoteError> {
    // Dynamic registration uses the same transport but with no bearer and a
    // plain JSON Accept — reuse post_json with None.
    http.post_json(url, None, body)
}

fn push_q(out: &mut String, k: &str, v: &str) {
    if !out.is_empty() {
        out.push('&');
    }
    out.push_str(k);
    out.push('=');
    out.push_str(&pct_encode(v));
}

fn random_url_b64(bytes: usize) -> String {
    use base64::Engine as _;
    use rand::RngCore;
    let mut buf = vec![0u8; bytes];
    rand::thread_rng().fill_bytes(&mut buf);
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(&buf)
}

fn random_hex(bytes: usize) -> String {
    use rand::RngCore;
    let mut buf = vec![0u8; bytes];
    rand::thread_rng().fill_bytes(&mut buf);
    buf.iter().map(|b| format!("{b:02x}")).collect()
}

fn code_challenge(verifier: &str) -> String {
    use base64::Engine as _;
    use sha2::Digest;
    let digest = sha2::Sha256::digest(verifier.as_bytes());
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(digest)
}

fn pct_encode(s: &str) -> String {
    const UNRESERVED: &[u8] =
        b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
    let mut out = String::with_capacity(s.len() * 3);
    for &b in s.as_bytes() {
        if UNRESERVED.contains(&b) {
            out.push(b as char);
        } else {
            out.push_str(&format!("%{b:02X}"));
        }
    }
    out
}

fn parse_tokens(json: &serde_json::Value) -> Result<TokenResponse, RemoteError> {
    let access = json
        .get("access_token")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RemoteError::Msg("missing access_token in token response".into()))?;
    Ok(TokenResponse {
        access_token: access.to_string(),
        refresh_token: json
            .get("refresh_token")
            .and_then(|v| v.as_str())
            .map(str::to_string),
        token_type: json
            .get("token_type")
            .and_then(|v| v.as_str())
            .unwrap_or("Bearer")
            .to_string(),
        expires_in: json.get("expires_in").and_then(|v| v.as_i64()).unwrap_or(3600),
        scope: json
            .get("scope")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
    })
}

#[derive(Debug, thiserror::Error)]
pub enum RemoteError {
    #[error("transport: {0}")]
    Transport(String),
    #[error("json: {0}")]
    Json(#[from] serde_json::Error),
    #[error("{0}")]
    Msg(String),
    #[error("insecure remote URL `{0}` — must be https or loopback")]
    InsecureUrl(String),
    #[error("server has no registration endpoint — supply a pre-registered client_id")]
    NeedsPreRegisteredClient,
}

/// A convenient test mock that serves canned JSON.
#[cfg(test)]
pub struct MockHttp {
    pub routes: HashMap<String, serde_json::Value>,
}

#[cfg(test)]
impl MockHttp {
    pub fn new(routes: impl IntoIterator<Item = (String, serde_json::Value)>) -> Self {
        Self {
            routes: routes.into_iter().collect(),
        }
    }
    fn route(&self, url: &str) -> Result<serde_json::Value, RemoteError> {
        self.routes
            .get(url)
            .cloned()
            .ok_or_else(|| RemoteError::Msg(format!("no mock for {url}")))
    }
}

#[cfg(test)]
impl HttpTransport for MockHttp {
    fn get_json(&self, url: &str) -> Result<serde_json::Value, RemoteError> {
        self.route(url)
    }
    fn post_form(
        &self,
        url: &str,
        _form: &[(&str, &str)],
    ) -> Result<serde_json::Value, RemoteError> {
        self.route(url)
    }
    fn post_json(
        &self,
        url: &str,
        _bearer: Option<&str>,
        _body: &serde_json::Value,
    ) -> Result<serde_json::Value, RemoteError> {
        self.route(url)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn server() -> MockHttp {
        MockHttp::new([
            (
                "https://mcp.example.com/.well-known/oauth-protected-resource".into(),
                serde_json::json!({
                    "resource": "https://mcp.example.com",
                    "authorization_servers": ["https://auth.example.com"]
                }),
            ),
            (
                "https://auth.example.com/.well-known/oauth-authorization-server".into(),
                serde_json::json!({
                    "issuer": "https://auth.example.com",
                    "authorization_endpoint": "https://auth.example.com/authorize",
                    "token_endpoint": "https://auth.example.com/token",
                    "registration_endpoint": "https://auth.example.com/register",
                    "scopes_supported": ["openid"],
                    "response_types_supported": ["code"]
                }),
            ),
            (
                "https://auth.example.com/register".into(),
                serde_json::json!({
                    "client_id": "dyn-client-123",
                    "token_endpoint_auth_method": "none"
                }),
            ),
            (
                "https://auth.example.com/token".into(),
                serde_json::json!({
                    "access_token": "tok-remote-1",
                    "refresh_token": "rt-remote-1",
                    "token_type": "Bearer",
                    "expires_in": 3600,
                    "scope": "openid"
                }),
            ),
            (
                "https://mcp.example.com".into(),
                serde_json::json!({
                    "jsonrpc": "2.0",
                    "id": 1,
                    "result": { "tools": [] }
                }),
            ),
        ])
    }

    #[test]
    fn connect_discovers_and_registers_dynamic_client() {
        let http = server();
        let t = connect("https://mcp.example.com", &http).unwrap();
        assert_eq!(t.url, "https://mcp.example.com");
        assert_eq!(t.client.client_id, "dyn-client-123");
        assert_eq!(t.auth.authorization_endpoint, "https://auth.example.com/authorize");
    }

    #[test]
    fn insecure_url_rejected() {
        let http = server();
        assert!(matches!(
            connect("http://evil.example.com/mcp", &http),
            Err(RemoteError::InsecureUrl(_))
        ));
    }

    #[test]
    fn authorize_url_has_pkce_and_state() {
        let http = server();
        let t = connect("https://mcp.example.com", &http).unwrap();
        let flow = build_authorize_url(&t, "http://127.0.0.1:0/oauth/callback").unwrap();
        assert!(flow.auth_url.starts_with("https://auth.example.com/authorize?"));
        assert!(flow.auth_url.contains("code_challenge="));
        assert!(flow.auth_url.contains("code_challenge_method=S256"));
        assert!(flow.auth_url.contains("state="));
        assert!(!flow.auth_url.contains("verifier"));
        // Verifier is stored client-side, never in the URL.
        assert!(!flow.code_verifier.is_empty());
    }

    #[test]
    fn exchange_code_parses_tokens() {
        let http = server();
        let t = connect("https://mcp.example.com", &http).unwrap();
        let flow = build_authorize_url(&t, "http://127.0.0.1:0/oauth/callback").unwrap();
        let tok = exchange_code(&t, &flow, "auth-code-1", &http).unwrap();
        assert_eq!(tok.access_token, "tok-remote-1");
        assert_eq!(tok.refresh_token.as_deref(), Some("rt-remote-1"));
    }

    #[test]
    fn rpc_posts_jsonrpc_and_returns_result() {
        let http = server();
        let t = connect("https://mcp.example.com", &http).unwrap();
        let resp = rpc(&t, "tok-remote-1", "tools/list", serde_json::json!({}), &http).unwrap();
        assert_eq!(resp["result"]["tools"], serde_json::json!([]));
    }
}
