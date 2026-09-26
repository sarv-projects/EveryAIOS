//! Remote MCP client — OAuth 2.1 + streamable HTTP (ARCH/15 Tier 2).
//!
//! The Connect Store lists remote MCP servers (`StoreKind::RemoteMcp`) but the
//! crate had no way to *talk to* them. This module is the client half:
//!
//! - **Dual era** (DEC-030, ARCH/14 §4): the modern revision `2026-07-28` is
//!   first-class and stateless — the protocol version travels in a header and
//!   request context rides in `_meta` — while the legacy revision `2025-11-25`
//!   stays a supported fallback behind `initialize`. HTTP distinguishes the eras
//!   by classifying the `400` body, the verdict is cached per process/origin,
//!   and every server has an explicit **force-legacy** escape hatch.
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
//!
//! ## Why the call is sent once
//!
//! Era detection is read-only by construction: it probes `server/discover`,
//! then at most one `initialize`, and never the caller's own method. A failing
//! `tools/call` is therefore **never** re-sent under the other era, because a
//! mutating call that already ran must not run twice (INV-07, ARCH/14 §7).

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};

use crate::protocol::{
    DISCOVER_METHOD, LEGACY_PROTOCOL_REVISION, METHOD_HEADER, MODERN_PROTOCOL_REVISION,
    NAME_HEADER, PROTOCOL_VERSION_HEADER,
};

/// The modern revision this client speaks first.
pub const MODERN_PROTOCOL_VERSION: &str = MODERN_PROTOCOL_REVISION;

/// The legacy fallback revision.
pub const LEGACY_PROTOCOL_VERSION: &str = LEGACY_PROTOCOL_REVISION;

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
    /// Per-server **force-legacy** escape hatch (DEC-030).
    ///
    /// When set, this server is spoken to exclusively in the legacy revision:
    /// detection is skipped entirely and no modern header or `_meta` is sent.
    /// It is the operator's answer to a server that misreports its era.
    pub force_legacy: bool,
}

impl RemoteTarget {
    /// Arm the per-server force-legacy escape hatch for this target.
    pub fn with_force_legacy(mut self, force_legacy: bool) -> Self {
        self.force_legacy = force_legacy;
        self
    }
}

/// Which wire revision a remote server is spoken to (DEC-030).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum McpEra {
    /// `2026-07-28` — stateless: protocol-version header plus `_meta`.
    Modern,
    /// `2025-11-25` — `initialize` handshake, no modern headers.
    Legacy,
}

impl McpEra {
    /// The revision string this era negotiates.
    pub fn version(self) -> &'static str {
        match self {
            Self::Modern => MODERN_PROTOCOL_VERSION,
            Self::Legacy => LEGACY_PROTOCOL_VERSION,
        }
    }

    /// Does this era carry the modern stateless contract?
    pub fn is_modern(self) -> bool {
        matches!(self, Self::Modern)
    }
}

/// What one probe reply proved about the server's era.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EraVerdict {
    /// The server answered the modern contract.
    Modern,
    /// The server refused the modern contract: it is legacy.
    Legacy,
    /// The reply proved neither era (transport loss, auth refusal, 5xx, an
    /// unclassifiable body). The caller retries the other era exactly once and
    /// otherwise keeps the modern default (ARCH/14 §7).
    Inconclusive,
}

/// Body markers that only a modern server produces.  A refusal that names the
/// modern revision or its headers is a modern server complaining about
/// something else — never evidence that it is legacy.
///
/// The probed method name is deliberately **not** a marker: a legacy server
/// answers `Method not found: server/discover`, and reading its own echo as a
/// modern signal would pin the origin to the wrong era forever.
const MODERN_MARKERS: &[&str] = &[
    "2026-07-28",
    "mcp-protocol-version",
    "mcp-method",
    "mcp-name",
];

/// Body markers that only a legacy server produces: it does not know the
/// modern method, or it names the legacy revision.
const LEGACY_MARKERS: &[&str] = &["-32601", "method not found", "unknown method", "2025-11-25"];

/// Body markers that mean the probed method does not exist on this server.
const UNKNOWN_METHOD_MARKERS: &[&str] = &["-32601", "method not found", "unknown method"];

/// Status codes that mean "this server refused the request contract", as
/// opposed to an authorization or availability problem that says nothing about
/// the era.
fn status_refuses_modern_contract(status: u16) -> bool {
    matches!(status, 400 | 404 | 405 | 406 | 415 | 422)
}

/// Classify one `server/discover` reply into an era (ARCH/14 §4: HTTP
/// distinguishes the eras from the refusal body).
pub fn classify_era(status: u16, body: &serde_json::Value) -> EraVerdict {
    // A successful answer to a modern method settles it: a 2xx JSON-RPC
    // result can only come from a server that understood the request.
    if is_json_rpc_success(status, body) {
        return EraVerdict::Modern;
    }
    let text = body.to_string().to_ascii_lowercase();
    if MODERN_MARKERS.iter().any(|marker| text.contains(marker)) {
        return EraVerdict::Modern;
    }
    if LEGACY_MARKERS.iter().any(|marker| text.contains(marker)) {
        return EraVerdict::Legacy;
    }
    if status_refuses_modern_contract(status) {
        return EraVerdict::Legacy;
    }
    EraVerdict::Inconclusive
}

/// Classify the single legacy `initialize` retry.
///
/// This probe only runs when the modern one proved nothing, so it reads the
/// reply for exactly one question: does this server still have `initialize`?
/// A server that answers it is speaking the legacy contract; a server that
/// says the method does not exist is stateless-modern.  Everything else stays
/// inconclusive so no guess is cached.
fn classify_initialize_probe(status: u16, body: &serde_json::Value) -> EraVerdict {
    if is_json_rpc_success(status, body) {
        return EraVerdict::Legacy;
    }
    let text = body.to_string().to_ascii_lowercase();
    if MODERN_MARKERS.iter().any(|marker| text.contains(marker))
        || UNKNOWN_METHOD_MARKERS
            .iter()
            .any(|marker| text.contains(marker))
    {
        return EraVerdict::Modern;
    }
    EraVerdict::Inconclusive
}

fn is_json_rpc_success(status: u16, body: &serde_json::Value) -> bool {
    (200..300).contains(&status) && body.get("error").is_none() && body.get("result").is_some()
}

/// The per-process, per-origin era cache (DEC-030: "era is cached per
/// process/origin").
#[derive(Debug, Default)]
pub struct EraCache {
    by_origin: BTreeMap<String, McpEra>,
}

impl EraCache {
    /// An empty cache.
    pub fn new() -> Self {
        Self::default()
    }

    /// The cached era for one origin, if detection already concluded.
    pub fn get(&self, origin: &str) -> Option<McpEra> {
        self.by_origin.get(origin).copied()
    }

    /// Record a conclusive verdict for one origin and return the era now in
    /// force for it.
    pub fn insert(&mut self, origin: &str, era: McpEra) -> McpEra {
        self.by_origin.insert(origin.to_string(), era);
        era
    }

    /// Number of origins with a cached era.
    pub fn len(&self) -> usize {
        self.by_origin.len()
    }

    /// Is no origin cached?
    pub fn is_empty(&self) -> bool {
        self.by_origin.is_empty()
    }

    /// Forget every cached era (a provider restart, a credential change, or a
    /// test that must not inherit a verdict).
    pub fn clear(&mut self) {
        self.by_origin.clear();
    }
}

fn process_era_cache() -> &'static Mutex<EraCache> {
    static CACHE: OnceLock<Mutex<EraCache>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(EraCache::new()))
}

/// The era cached for `origin` in this process.
pub fn cached_era(origin: &str) -> Option<McpEra> {
    process_era_cache()
        .lock()
        .ok()
        .and_then(|cache| cache.get(origin))
}

/// Record the conclusive era verdict for `origin` in this process.
pub fn cache_era(origin: &str, era: McpEra) {
    if let Ok(mut cache) = process_era_cache().lock() {
        cache.insert(origin, era);
    }
}

/// Drop every cached era in this process.
pub fn clear_era_cache() {
    if let Ok(mut cache) = process_era_cache().lock() {
        cache.clear();
    }
}

/// The cache key for a server URL: `scheme://authority`.
///
/// Two paths on one host share a verdict; a different host never does, so one
/// misdetected server cannot drag another down.
pub fn origin_of(url: &str) -> String {
    let (scheme, rest) = url.split_once("://").unwrap_or(("https", url));
    let authority = rest
        .split(['/', '?', '#'])
        .next()
        .unwrap_or("")
        .to_ascii_lowercase();
    format!("{scheme}://{authority}")
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

/// One HTTP reply to a JSON-RPC message: the exact status plus the body.
///
/// A JSON-RPC error is carried in a `4xx` body, so era classification needs
/// the status, not just a parsed value.
#[derive(Debug, Clone, PartialEq)]
pub struct McpResponse {
    pub status: u16,
    pub body: serde_json::Value,
}

/// The HTTP seam — the real `UreqTransport` talks to the wire; tests use a
/// mock. Mirrors the vault's `post_form`/`get_json` pattern but with a trait
/// so the remote-client logic is unit-testable without a socket.
pub trait HttpTransport: Send {
    fn get_json(&self, url: &str) -> Result<serde_json::Value, RemoteError>;
    fn post_form(&self, url: &str, form: &[(&str, &str)])
    -> Result<serde_json::Value, RemoteError>;
    fn post_json(
        &self,
        url: &str,
        bearer: Option<&str>,
        body: &serde_json::Value,
    ) -> Result<serde_json::Value, RemoteError>;

    /// POST one JSON-RPC message with per-request headers and read the exact
    /// HTTP status.
    ///
    /// This is the dual-era path: the modern headers are mandatory there, and
    /// era classification needs to see a `400` body rather than a collapsed
    /// transport error.  The default keeps every existing transport compiling
    /// by dropping the headers and reporting `200`; a transport that talks to a
    /// real server **must** override it, because a request that silently loses
    /// `MCP-Protocol-Version` / `Mcp-Method` / `Mcp-Name` can never satisfy the
    /// modern contract it claims to be speaking.
    fn post_json_rpc(
        &self,
        url: &str,
        bearer: Option<&str>,
        headers: &[(&str, &str)],
        body: &serde_json::Value,
    ) -> Result<McpResponse, RemoteError> {
        let _ = headers;
        Ok(McpResponse {
            status: 200,
            body: self.post_json(url, bearer, body)?,
        })
    }
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

    fn post_json_rpc(
        &self,
        url: &str,
        bearer: Option<&str>,
        headers: &[(&str, &str)],
        body: &serde_json::Value,
    ) -> Result<McpResponse, RemoteError> {
        let mut req = ureq::post(url)
            .set("Accept", "application/json, text/event-stream")
            .set("Content-Type", "application/json");
        for (name, value) in headers {
            req = req.set(name, value);
        }
        if let Some(b) = bearer {
            req = req.set("Authorization", &format!("Bearer {b}"));
        }
        match req.send_json(body) {
            Ok(response) => Ok(McpResponse {
                status: response.status(),
                // A streamable-HTTP reply may legitimately be an SSE frame or
                // an empty body; the caller classifies what arrived.
                body: response.into_json().unwrap_or(serde_json::Value::Null),
            }),
            // A JSON-RPC error arrives as a 4xx *with* a body. Report the
            // refusal instead of collapsing it into a transport failure, or
            // era classification can never see it.
            Err(ureq::Error::Status(status, response)) => Ok(McpResponse {
                status,
                body: response.into_json().unwrap_or(serde_json::Value::Null),
            }),
            Err(error) => Err(RemoteError::Transport(error.to_string())),
        }
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
        let wk = format!(
            "{}/.well-known/oauth-authorization-server",
            base.trim_end_matches('/')
        );
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
pub fn connect(server_url: &str, http: &dyn HttpTransport) -> Result<RemoteTarget, RemoteError> {
    if !(server_url.starts_with("https://")
        || server_url.starts_with("http://127.0.0.1")
        || server_url.starts_with("http://localhost"))
    {
        return Err(RemoteError::InsecureUrl(server_url.to_string()));
    }
    let resource = discover_protected_resource(server_url, http)?;
    let auth = discover_authorization_server(&resource, server_url, http)?;
    let redirect_uri = "http://127.0.0.1:0/oauth/callback".to_string();
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
        force_legacy: false,
    })
}

/// Build the PKCE authorize URL + keep state/verifier (the shell stores
/// these while the browser is open, then calls [`exchange_code`]).
pub fn build_authorize_url(
    target: &RemoteTarget,
    redirect_uri: &str,
) -> Result<PkceFlow, RemoteError> {
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

/// Process-monotonic JSON-RPC request id.
///
/// The revision is stateless, so the id is the only thing that distinguishes
/// two otherwise identical calls — a server that caches by id would otherwise
/// collapse a second `tools/call` into the first one's answer.
fn next_request_id() -> u64 {
    static NEXT: AtomicU64 = AtomicU64::new(1);
    NEXT.fetch_add(1, Ordering::Relaxed)
}

/// The modern request headers for one JSON-RPC method.
///
/// `Mcp-Name` is only meaningful for `tools/call`; sending it for any other
/// method is a protocol violation the façade rejects.
pub fn modern_headers(method: &str, name: Option<&str>) -> Vec<(String, String)> {
    let mut headers = vec![
        (
            PROTOCOL_VERSION_HEADER.to_string(),
            MODERN_PROTOCOL_VERSION.to_string(),
        ),
        (METHOD_HEADER.to_string(), method.to_string()),
    ];
    if method == "tools/call"
        && let Some(name) = name
    {
        headers.push((NAME_HEADER.to_string(), name.to_string()));
    }
    headers
}

/// Build one JSON-RPC request body.
///
/// In the modern era the request is stateless, so the context a session used to
/// carry is passed in `params._meta`: the negotiated revision and, when the
/// caller has one, the idempotency key.  The legacy era keeps the pre-`_meta`
/// body — a legacy server that does not know `_meta` is not a server to probe.
pub fn build_request(
    method: &str,
    params: serde_json::Value,
    era: McpEra,
    idempotency_key: Option<&str>,
) -> serde_json::Value {
    // The legacy body is passed through untouched: a server that predates
    // `_meta` must see exactly the wire shape it always saw.
    let params = match era {
        McpEra::Legacy => params,
        McpEra::Modern => {
            let mut object = match params {
                serde_json::Value::Object(map) => map,
                _ => serde_json::Map::new(),
            };
            let mut meta = serde_json::Map::new();
            meta.insert(
                "protocolVersion".to_string(),
                serde_json::Value::String(era.version().to_string()),
            );
            if let Some(key) = idempotency_key {
                meta.insert(
                    "idempotencyKey".to_string(),
                    serde_json::Value::String(key.to_string()),
                );
            }
            object.insert("_meta".to_string(), serde_json::Value::Object(meta));
            serde_json::Value::Object(object)
        }
    };
    serde_json::json!({
        "jsonrpc": "2.0",
        "id": next_request_id(),
        "method": method,
        "params": params,
    })
}

/// The `params.name` of a `tools/call`, if this request is one.
pub fn tool_name<'a>(method: &str, body: &'a serde_json::Value) -> Option<&'a str> {
    if method != "tools/call" {
        return None;
    }
    body.get("params")?
        .get("name")?
        .as_str()
        .filter(|name| !name.is_empty() && !name.chars().any(char::is_control))
}

/// Resolve which era to speak to `target` (DEC-030 precedence).
///
/// 1. the per-server **force-legacy** escape hatch — detection is skipped;
/// 2. the process cache for this origin;
/// 3. detection: probe `server/discover`, and when that is inconclusive retry
///    the other era exactly once with `initialize`.
///
/// Only a conclusive verdict is cached: an unreachable server must be re-probed
/// next time rather than pinned to a guess.
pub fn negotiate_era(
    target: &RemoteTarget,
    bearer: Option<&str>,
    http: &dyn HttpTransport,
) -> McpEra {
    if target.force_legacy {
        return McpEra::Legacy;
    }
    let origin = origin_of(&target.url);
    if let Some(era) = cached_era(&origin) {
        return era;
    }
    match probe_era(target, bearer, http) {
        Some(era) => {
            cache_era(&origin, era);
            era
        }
        None => McpEra::Modern,
    }
}

/// Probe one origin for its era using read-only methods only.
fn probe_era(
    target: &RemoteTarget,
    bearer: Option<&str>,
    http: &dyn HttpTransport,
) -> Option<McpEra> {
    let discover = build_request(DISCOVER_METHOD, serde_json::json!({}), McpEra::Modern, None);
    let headers = modern_headers(DISCOVER_METHOD, None);
    let borrowed = header_refs(&headers);
    match http.post_json_rpc(&target.url, bearer, &borrowed, &discover) {
        Ok(response) => match classify_era(response.status, &response.body) {
            EraVerdict::Modern => Some(McpEra::Modern),
            EraVerdict::Legacy => Some(McpEra::Legacy),
            // The other era gets exactly one retry (ARCH/14 §7).
            EraVerdict::Inconclusive => probe_era_legacy(target, bearer, http),
        },
        Err(_) => probe_era_legacy(target, bearer, http),
    }
}

/// The single legacy retry: an `initialize` handshake for the fallback era.
fn probe_era_legacy(
    target: &RemoteTarget,
    bearer: Option<&str>,
    http: &dyn HttpTransport,
) -> Option<McpEra> {
    let params = serde_json::json!({
        "protocolVersion": LEGACY_PROTOCOL_VERSION,
        "capabilities": {},
        "clientInfo": {"name": "everyaios-mcp", "version": env!("CARGO_PKG_VERSION")},
    });
    let initialize = build_request("initialize", params, McpEra::Legacy, None);
    match http.post_json_rpc(&target.url, bearer, &[], &initialize) {
        Ok(response) => match classify_initialize_probe(response.status, &response.body) {
            EraVerdict::Modern => Some(McpEra::Modern),
            EraVerdict::Legacy => Some(McpEra::Legacy),
            EraVerdict::Inconclusive => None,
        },
        Err(_) => None,
    }
}

fn header_refs(headers: &[(String, String)]) -> Vec<(&str, &str)> {
    headers
        .iter()
        .map(|(name, value)| (name.as_str(), value.as_str()))
        .collect()
}

/// One streamable-HTTP JSON-RPC call in a known era. Returns the parsed
/// JSON-RPC response body (the caller parses `result`/`error`).
pub fn rpc_in_era(
    target: &RemoteTarget,
    bearer: &str,
    era: McpEra,
    method: &str,
    params: serde_json::Value,
    idempotency_key: Option<&str>,
    http: &dyn HttpTransport,
) -> Result<serde_json::Value, RemoteError> {
    let body = build_request(method, params, era, idempotency_key);
    let headers = if era.is_modern() {
        modern_headers(method, tool_name(method, &body))
    } else {
        Vec::new()
    };
    let borrowed = header_refs(&headers);
    let response = http.post_json_rpc(&target.url, Some(bearer), &borrowed, &body)?;
    if (200..300).contains(&response.status) {
        return Ok(response.body);
    }
    let message = response
        .body
        .get("error")
        .and_then(|error| error.get("message"))
        .and_then(serde_json::Value::as_str)
        .map(str::to_string)
        .unwrap_or_else(|| format!("HTTP {} with no JSON-RPC error message", response.status));
    Err(RemoteError::Rpc {
        status: response.status,
        method: method.to_string(),
        message,
    })
}

/// One streamable-HTTP JSON-RPC call (tools/list, tools/call, …) in the
/// server's own era.
///
/// Modern first (DEC-030): the era is detected once per origin and cached, the
/// force-legacy hatch outranks everything, and the call is sent exactly once —
/// a refused call is not replayed under the other era, because a mutating
/// `tools/call` that may already have run must not run twice.
pub fn rpc(
    target: &RemoteTarget,
    bearer: &str,
    method: &str,
    params: serde_json::Value,
    http: &dyn HttpTransport,
) -> Result<serde_json::Value, RemoteError> {
    let era = negotiate_era(target, Some(bearer), http);
    rpc_in_era(target, bearer, era, method, params, None, http)
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
    const UNRESERVED: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
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
        expires_in: json
            .get("expires_in")
            .and_then(|v| v.as_i64())
            .unwrap_or(3600),
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
    /// The server answered the call with a non-success status.  The status and
    /// the JSON-RPC error message are both preserved so the caller can tell a
    /// refusal (retry elsewhere) from an era mismatch.
    #[error("MCP `{method}` refused with HTTP {status}: {message}")]
    Rpc {
        status: u16,
        method: String,
        message: String,
    },
}

/// One JSON-RPC request as the scripted era transport saw it.
#[cfg(test)]
#[derive(Debug, Clone)]
struct SeenRequest {
    method: String,
    headers: Vec<(String, String)>,
    body: serde_json::Value,
    bearer: Option<String>,
}

#[cfg(test)]
impl SeenRequest {
    fn header(&self, name: &str) -> Option<&str> {
        self.headers
            .iter()
            .find(|(key, _)| key.eq_ignore_ascii_case(name))
            .map(|(_, value)| value.as_str())
    }
}

/// A JSON-RPC transport scripted per method: it records every outgoing
/// request (method, headers, body) and answers with the status/body the test
/// chose for that method.  The era tests need to see the wire, which a
/// URL-keyed route table cannot express.
#[cfg(test)]
struct ScriptedHttp {
    replies: HashMap<String, (u16, serde_json::Value)>,
    seen: std::sync::Mutex<Vec<SeenRequest>>,
}

#[cfg(test)]
impl ScriptedHttp {
    fn new(replies: impl IntoIterator<Item = (&'static str, u16, serde_json::Value)>) -> Self {
        Self {
            replies: replies
                .into_iter()
                .map(|(method, status, body)| (method.to_string(), (status, body)))
                .collect(),
            seen: std::sync::Mutex::new(Vec::new()),
        }
    }

    fn seen(&self) -> Vec<SeenRequest> {
        self.seen.lock().expect("era transport lock").clone()
    }

    fn methods(&self) -> Vec<String> {
        self.seen().into_iter().map(|seen| seen.method).collect()
    }
}

#[cfg(test)]
impl HttpTransport for ScriptedHttp {
    fn get_json(&self, _url: &str) -> Result<serde_json::Value, RemoteError> {
        Err(RemoteError::Msg(
            "scripted transport has no GET route".into(),
        ))
    }

    fn post_form(
        &self,
        _url: &str,
        _form: &[(&str, &str)],
    ) -> Result<serde_json::Value, RemoteError> {
        Err(RemoteError::Msg(
            "scripted transport has no form route".into(),
        ))
    }

    fn post_json(
        &self,
        _url: &str,
        _bearer: Option<&str>,
        _body: &serde_json::Value,
    ) -> Result<serde_json::Value, RemoteError> {
        Err(RemoteError::Msg(
            "scripted transport answers through post_json_rpc".into(),
        ))
    }

    fn post_json_rpc(
        &self,
        _url: &str,
        bearer: Option<&str>,
        headers: &[(&str, &str)],
        body: &serde_json::Value,
    ) -> Result<McpResponse, RemoteError> {
        let method = body
            .get("method")
            .and_then(serde_json::Value::as_str)
            .unwrap_or_default()
            .to_string();
        self.seen
            .lock()
            .expect("era transport lock")
            .push(SeenRequest {
                method: method.clone(),
                headers: headers
                    .iter()
                    .map(|(name, value)| (name.to_string(), value.to_string()))
                    .collect(),
                body: body.clone(),
                bearer: bearer.map(str::to_string),
            });
        let (status, reply) = self
            .replies
            .get(&method)
            .cloned()
            .ok_or_else(|| RemoteError::Msg(format!("no scripted reply for `{method}`")))?;
        Ok(McpResponse {
            status,
            body: reply,
        })
    }
}

/// A connected target for one test origin (no OAuth round trip).
#[cfg(test)]
fn target_for(url: &str) -> RemoteTarget {
    RemoteTarget {
        url: url.to_string(),
        auth: AuthServerMetadata {
            issuer: "https://auth.example.com".into(),
            authorization_endpoint: "https://auth.example.com/authorize".into(),
            token_endpoint: "https://auth.example.com/token".into(),
            registration_endpoint: String::new(),
            scopes_supported: vec![],
            response_types_supported: vec![],
        },
        client: ClientRegistration {
            client_id: "fixture-client".into(),
            client_secret: String::new(),
            token_endpoint_auth_method: "none".into(),
        },
        force_legacy: false,
    }
}

#[cfg(test)]
fn modern_discover_reply() -> serde_json::Value {
    serde_json::json!({
        "jsonrpc": "2.0",
        "id": 1,
        "result": {"protocolVersion": MODERN_PROTOCOL_VERSION, "tools": []}
    })
}

#[cfg(test)]
fn legacy_unknown_method_reply() -> serde_json::Value {
    serde_json::json!({
        "jsonrpc": "2.0",
        "id": 1,
        "error": {"code": -32601, "message": "Method not found: server/discover"}
    })
}

#[cfg(test)]
fn legacy_initialize_reply() -> serde_json::Value {
    serde_json::json!({
        "jsonrpc": "2.0",
        "id": 1,
        "result": {"protocolVersion": LEGACY_PROTOCOL_VERSION, "capabilities": {}}
    })
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
        assert_eq!(
            t.auth.authorization_endpoint,
            "https://auth.example.com/authorize"
        );
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
        assert!(
            flow.auth_url
                .starts_with("https://auth.example.com/authorize?")
        );
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
        let resp = rpc(
            &t,
            "tok-remote-1",
            "tools/list",
            serde_json::json!({}),
            &http,
        )
        .unwrap();
        assert_eq!(resp["result"]["tools"], serde_json::json!([]));
    }

    // -- DEC-030 dual era ---------------------------------------------------

    #[test]
    fn modern_request_carries_the_protocol_headers_and_meta() {
        let http = ScriptedHttp::new([
            (DISCOVER_METHOD, 200, modern_discover_reply()),
            (
                "tools/call",
                200,
                serde_json::json!({"jsonrpc": "2.0", "id": 2, "result": {"ok": true}}),
            ),
        ]);
        let target = target_for("https://modern.example.com/mcp");
        let resp = rpc(
            &target,
            "tok-1",
            "tools/call",
            serde_json::json!({"name": "remote.do_thing", "arguments": {"a": 1}}),
            &http,
        )
        .unwrap();
        assert_eq!(resp["result"]["ok"], true);

        let seen = http.seen();
        assert_eq!(
            seen.iter().map(|s| s.method.as_str()).collect::<Vec<_>>(),
            vec![DISCOVER_METHOD, "tools/call"],
            "modern era is probed with server/discover before the call"
        );
        let call = &seen[1];
        assert_eq!(call.bearer.as_deref(), Some("tok-1"));
        // Protocol version header + method + name must all be present.
        assert_eq!(
            call.header(PROTOCOL_VERSION_HEADER),
            Some(MODERN_PROTOCOL_VERSION)
        );
        assert_eq!(call.header(METHOD_HEADER), Some("tools/call"));
        assert_eq!(call.header(NAME_HEADER), Some("remote.do_thing"));
        // The stateless context rides in `_meta`.
        assert_eq!(
            call.body["params"]["_meta"]["protocolVersion"],
            serde_json::json!(MODERN_PROTOCOL_VERSION)
        );
        assert_eq!(call.body["jsonrpc"], "2.0");
    }

    #[test]
    fn modern_non_call_request_has_no_name_header() {
        let http = ScriptedHttp::new([
            (DISCOVER_METHOD, 200, modern_discover_reply()),
            (
                "tools/list",
                200,
                serde_json::json!({"jsonrpc": "2.0", "id": 2, "result": {"tools": []}}),
            ),
        ]);
        rpc(
            &target_for("https://modern-list.example.com/mcp"),
            "tok-1",
            "tools/list",
            serde_json::json!({}),
            &http,
        )
        .unwrap();
        let seen = http.seen();
        let list = seen.last().expect("tools/list request");
        assert_eq!(list.header(METHOD_HEADER), Some("tools/list"));
        assert_eq!(list.header(NAME_HEADER), None);
    }

    #[test]
    fn idempotency_key_rides_in_meta_where_the_facade_reads_it() {
        let http = ScriptedHttp::new([
            (DISCOVER_METHOD, 200, modern_discover_reply()),
            (
                "tools/call",
                200,
                serde_json::json!({"jsonrpc": "2.0", "id": 2, "result": {}}),
            ),
        ]);
        rpc_in_era(
            &target_for("https://modern-idem.example.com/mcp"),
            "tok-1",
            McpEra::Modern,
            "tools/call",
            serde_json::json!({"name": "remote.write"}),
            Some("mutation-7"),
            &http,
        )
        .unwrap();
        let seen = http.seen();
        let call = seen.last().expect("tools/call request");
        // The façade reads `params._meta.idempotencyKey` (server.rs), so the key
        // must be in `_meta` and not in a header the remote may not know.
        assert_eq!(
            call.body["params"]["_meta"]["idempotencyKey"],
            serde_json::json!("mutation-7")
        );
        assert_eq!(call.header(NAME_HEADER), Some("remote.write"));
    }

    #[test]
    fn legacy_fallback_is_used_when_the_modern_method_is_unknown() {
        let http = ScriptedHttp::new([
            (DISCOVER_METHOD, 400, legacy_unknown_method_reply()),
            (
                "tools/list",
                200,
                serde_json::json!({"jsonrpc": "2.0", "id": 2, "result": {"tools": []}}),
            ),
        ]);
        let target = target_for("https://legacy.example.com/mcp");
        let resp = rpc(&target, "tok-1", "tools/list", serde_json::json!({}), &http).unwrap();
        assert_eq!(resp["result"]["tools"], serde_json::json!([]));
        assert_eq!(cached_era(&origin_of(&target.url)), Some(McpEra::Legacy));
        let list = http.seen().pop().expect("tools/list request");
        assert!(
            list.headers.is_empty(),
            "a legacy server gets no modern headers"
        );
        assert!(list.body["params"].get("_meta").is_none());
    }

    #[test]
    fn detection_retries_the_other_era_exactly_once() {
        // `server/discover` proves nothing (503), so the client retries the
        // legacy handshake once and stops.
        let http = ScriptedHttp::new([
            (
                DISCOVER_METHOD,
                503,
                serde_json::json!({"error": "upstream unavailable"}),
            ),
            ("initialize", 200, legacy_initialize_reply()),
            (
                "tools/list",
                200,
                serde_json::json!({"jsonrpc": "2.0", "id": 3, "result": {"tools": []}}),
            ),
        ]);
        let target = target_for("https://retry.example.com/mcp");
        rpc(&target, "tok-1", "tools/list", serde_json::json!({}), &http).unwrap();
        assert_eq!(
            http.methods(),
            vec![DISCOVER_METHOD, "initialize", "tools/list"],
            "detection probes modern, retries legacy once, then sends the call"
        );
        assert_eq!(cached_era(&origin_of(&target.url)), Some(McpEra::Legacy));
    }

    #[test]
    fn a_stateless_server_that_refuses_initialize_is_classified_modern() {
        // The modern probe proved nothing (503), and the legacy retry says
        // there is no `initialize` — that is a stateless server, not a legacy
        // one, so the retry must not pin the origin to legacy.
        let http = ScriptedHttp::new([
            (
                DISCOVER_METHOD,
                503,
                serde_json::json!({"error": "upstream unavailable"}),
            ),
            (
                "initialize",
                200,
                serde_json::json!({
                    "jsonrpc": "2.0", "id": 1,
                    "error": {"code": -32601, "message": "Method not found: initialize"}
                }),
            ),
            (
                "tools/list",
                200,
                serde_json::json!({"jsonrpc": "2.0", "id": 2, "result": {"tools": []}}),
            ),
        ]);
        let target = target_for("https://stateless.example.com/mcp");
        rpc(&target, "tok-1", "tools/list", serde_json::json!({}), &http).unwrap();
        assert_eq!(
            cached_era(&origin_of(&target.url)),
            Some(McpEra::Modern),
            "a server without `initialize` is modern, never legacy"
        );
        let list = http.seen().pop().expect("tools/list request");
        assert_eq!(list.header(METHOD_HEADER), Some("tools/list"));
    }

    #[test]
    fn an_inconclusive_probe_is_not_cached() {
        let http = ScriptedHttp::new([
            (DISCOVER_METHOD, 503, serde_json::json!({"error": "down"})),
            ("initialize", 503, serde_json::json!({"error": "down"})),
            (
                "tools/list",
                200,
                serde_json::json!({"jsonrpc": "2.0", "id": 2, "result": {"tools": []}}),
            ),
            (
                "tools/list",
                200,
                serde_json::json!({"jsonrpc": "2.0", "id": 3, "result": {"tools": []}}),
            ),
        ]);
        let target = target_for("https://flaky.example.com/mcp");
        rpc(&target, "tok-1", "tools/list", serde_json::json!({}), &http).unwrap();
        assert_eq!(cached_era(&origin_of(&target.url)), None);
        // A second call re-probes instead of trusting the guess.
        rpc(&target, "tok-1", "tools/list", serde_json::json!({}), &http).unwrap();
        assert_eq!(
            http.methods()
                .iter()
                .filter(|m| *m == DISCOVER_METHOD)
                .count(),
            2
        );
    }

    #[test]
    fn force_legacy_skips_detection_entirely() {
        let http = ScriptedHttp::new([(
            "tools/call",
            200,
            serde_json::json!({"jsonrpc": "2.0", "id": 9, "result": {"ok": true}}),
        )]);
        let target = target_for("https://forced.example.com/mcp").with_force_legacy(true);
        let resp = rpc(
            &target,
            "tok-1",
            "tools/call",
            serde_json::json!({"name": "remote.write"}),
            &http,
        )
        .unwrap();
        assert_eq!(resp["result"]["ok"], true);
        assert_eq!(
            http.methods(),
            vec!["tools/call"],
            "the escape hatch must not spend a detection round trip"
        );
        let call = http.seen().pop().expect("the call");
        assert!(call.headers.is_empty());
        assert!(call.body["params"].get("_meta").is_none());
        assert!(
            cached_era(&origin_of(&target.url)).is_none(),
            "a force-legacy server must not poison the shared origin cache"
        );
    }

    #[test]
    fn era_is_cached_per_origin_not_globally() {
        let modern = ScriptedHttp::new([
            (DISCOVER_METHOD, 200, modern_discover_reply()),
            (
                "tools/list",
                200,
                serde_json::json!({"jsonrpc": "2.0", "id": 2, "result": {"tools": []}}),
            ),
        ]);
        let target = target_for("https://cache-a.example.com/mcp");
        rpc(&target, "tok", "tools/list", serde_json::json!({}), &modern).unwrap();
        rpc(&target, "tok", "tools/list", serde_json::json!({}), &modern).unwrap();
        assert_eq!(
            modern
                .methods()
                .iter()
                .filter(|m| *m == DISCOVER_METHOD)
                .count(),
            1,
            "a second call to a known origin must not re-probe"
        );

        // A different host on the same transport is a different verdict.
        let other = target_for("https://cache-b.example.com/mcp");
        assert_eq!(cached_era(&origin_of(&other.url)), None);
        rpc(&other, "tok", "tools/list", serde_json::json!({}), &modern).unwrap();
        assert_eq!(
            modern
                .methods()
                .iter()
                .filter(|m| *m == DISCOVER_METHOD)
                .count(),
            2
        );
    }

    #[test]
    fn two_paths_on_one_origin_share_a_verdict() {
        assert_eq!(
            origin_of("https://Same.Example.com:8443/mcp/v1"),
            origin_of("https://same.example.com:8443/other")
        );
        assert_ne!(
            origin_of("https://a.example.com"),
            origin_of("http://a.example.com")
        );
    }

    #[test]
    fn classify_era_separates_refusal_from_noise() {
        // A 2xx JSON-RPC result settles it.
        assert_eq!(
            classify_era(200, &modern_discover_reply()),
            EraVerdict::Modern
        );
        // A 400 naming an unknown method is the legacy signature.
        assert_eq!(
            classify_era(400, &legacy_unknown_method_reply()),
            EraVerdict::Legacy
        );
        // A 400 that names the modern revision is a *modern* server refusing
        // something else — never downgraded to legacy.
        assert_eq!(
            classify_era(
                400,
                &serde_json::json!({
                    "jsonrpc": "2.0", "id": 1,
                    "error": {"code": -32602, "message": "MCP-Protocol-Version must be 2026-07-28"}
                })
            ),
            EraVerdict::Modern
        );
        // An anonymous contract refusal with no recognizable body.
        assert_eq!(
            classify_era(415, &serde_json::json!({"error": "unsupported"})),
            EraVerdict::Legacy
        );
        // Auth and availability say nothing about the era.
        assert_eq!(
            classify_era(401, &serde_json::json!({"error": "unauthorized"})),
            EraVerdict::Inconclusive
        );
        assert_eq!(
            classify_era(429, &serde_json::json!({"error": "slow down"})),
            EraVerdict::Inconclusive
        );
        assert_eq!(
            classify_era(500, &serde_json::json!({"error": "boom"})),
            EraVerdict::Inconclusive
        );
    }

    #[test]
    fn a_refused_call_is_a_typed_error_and_is_never_retried() {
        let http = ScriptedHttp::new([
            (DISCOVER_METHOD, 200, modern_discover_reply()),
            (
                "tools/call",
                403,
                serde_json::json!({
                    "jsonrpc": "2.0", "id": 2,
                    "error": {"code": -32000, "message": "guard denied"}
                }),
            ),
        ]);
        let target = target_for("https://refused.example.com/mcp");
        let error = rpc(
            &target,
            "tok-1",
            "tools/call",
            serde_json::json!({"name": "remote.write"}),
            &http,
        )
        .unwrap_err();
        assert!(matches!(
            error,
            RemoteError::Rpc {
                status: 403,
                ref method,
                ..
            } if method == "tools/call"
        ));
        assert_eq!(
            http.methods(),
            vec![DISCOVER_METHOD, "tools/call"],
            "a refused mutating call must not be re-sent under the other era"
        );
    }

    #[test]
    fn era_cache_is_an_explicit_value_not_a_global() {
        let mut cache = EraCache::new();
        assert!(cache.is_empty());
        assert_eq!(cache.get("https://x.example"), None);
        assert_eq!(
            cache.insert("https://x.example", McpEra::Legacy),
            McpEra::Legacy
        );
        assert_eq!(cache.get("https://x.example"), Some(McpEra::Legacy));
        assert_eq!(cache.len(), 1);
        cache.clear();
        assert!(cache.is_empty());
    }

    #[test]
    fn the_process_cache_is_shared_and_clearable() {
        let origin = "https://process-cache.example/mcp";
        assert_eq!(cached_era(&origin_of(origin)), None);
        cache_era(&origin_of(origin), McpEra::Legacy);
        assert_eq!(cached_era(&origin_of(origin)), Some(McpEra::Legacy));
        clear_era_cache();
        assert_eq!(cached_era(&origin_of(origin)), None);
    }

    #[test]
    fn eras_report_their_revisions() {
        assert_eq!(McpEra::Modern.version(), "2026-07-28");
        assert_eq!(McpEra::Legacy.version(), "2025-11-25");
        assert!(McpEra::Modern.is_modern());
        assert!(!McpEra::Legacy.is_modern());
    }

    #[test]
    fn the_legacy_body_is_untouched_and_the_modern_body_gains_only_meta() {
        let args = serde_json::json!({"name": "remote.write", "arguments": {"a": 1}});

        let legacy = build_request("tools/call", args.clone(), McpEra::Legacy, None);
        assert_eq!(legacy["params"], args);
        assert!(legacy["params"].get("_meta").is_none());
        // A non-object params value is the caller's business in the legacy era.
        let positional = build_request(
            "tools/call",
            serde_json::json!(["a", 1]),
            McpEra::Legacy,
            None,
        );
        assert_eq!(positional["params"], serde_json::json!(["a", 1]));

        let modern = build_request("tools/call", args.clone(), McpEra::Modern, Some("k-1"));
        assert_eq!(modern["params"]["name"], "remote.write");
        assert_eq!(modern["params"]["arguments"], serde_json::json!({"a": 1}));
        assert_eq!(
            modern["params"]["_meta"],
            serde_json::json!({"protocolVersion": "2026-07-28", "idempotencyKey": "k-1"})
        );
    }

    #[test]
    fn request_ids_are_not_reused() {
        // A stateless client has no session to disambiguate two identical
        // calls, so the id must be unique per request.
        let first = build_request("tools/list", serde_json::json!({}), McpEra::Modern, None);
        let second = build_request("tools/list", serde_json::json!({}), McpEra::Modern, None);
        assert_ne!(first["id"], second["id"]);
    }
}
