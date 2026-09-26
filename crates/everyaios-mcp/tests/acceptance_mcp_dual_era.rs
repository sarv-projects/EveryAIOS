//! W0 `TASK-PROV-003` (FIX-12 + FIX-13) — the dual-era MCP contract, proved
//! end to end on loopback with no external network.
//!
//! Two halves of one contract:
//!
//! - the **façade** serves the modern revision's mandatory `server/discover`
//!   and validates the `Mcp-Method` / `Mcp-Name` envelope headers
//!   (DEC-030, ARCH/14 §4, REQ-PROV-005);
//! - the **client** speaks that same envelope, probes the modern era first,
//!   falls back to the legacy `2025-11-25` contract, caches the verdict per
//!   origin, and honours the force-legacy escape hatch (REQ-PROV-004).
//!
//! The last two tests drive the real client against the real façade, so a
//! disagreement between the header names the client emits and the ones the
//! façade validates fails here rather than in production.

use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::time::Duration;

use everyaios_mcp::{
    AuthServerMetadata, ClientRegistration, DISCOVER_METHOD, EraVerdict, HttpTransport,
    LEGACY_PROTOCOL_VERSION, METHOD_HEADER, McpEra, McpResponse, McpServer, NAME_HEADER,
    PROTOCOL_VERSION_HEADER, RemoteError, RemoteTarget, SUPPORTED_PROTOCOL_VERSION,
    ToolCallHandler, cached_era, classify_era, modern_headers, origin_of, rpc,
};
use serde_json::Value;

const TIMEOUT: Duration = Duration::from_secs(3);

struct Echo;

impl ToolCallHandler for Echo {
    fn call(&mut self, name: &str, arguments: &Value) -> Result<Value, String> {
        Ok(serde_json::json!({"tool": name, "arguments": arguments}))
    }
}

// ---------------------------------------------------------------------------
// raw loopback HTTP
// ---------------------------------------------------------------------------

#[derive(Debug)]
struct Raw {
    status: u16,
    headers: String,
    body: String,
}

impl Raw {
    fn json(&self) -> Value {
        serde_json::from_str(&self.body)
            .unwrap_or_else(|error| panic!("expected JSON body, got {:?}: {error}", self.body))
    }
}

/// Post one request with an explicit header set, so a test can omit or corrupt
/// any single envelope field.
fn post_raw(addr: SocketAddr, token: &str, headers: &[(&str, &str)], body: &str) -> Raw {
    let port = addr.port();
    let mut head = format!(
        "POST /mcp HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nOrigin: http://127.0.0.1:{port}\r\nAuthorization: Bearer {token}\r\nContent-Type: application/json\r\nAccept: application/json, text/event-stream\r\n"
    );
    for (name, value) in headers {
        head.push_str(&format!("{name}: {value}\r\n"));
    }
    head.push_str(&format!(
        "Content-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    ));
    let mut stream = TcpStream::connect(addr).expect("connect to loopback lease");
    stream.set_read_timeout(Some(TIMEOUT)).unwrap();
    stream.set_write_timeout(Some(TIMEOUT)).unwrap();
    stream.write_all(head.as_bytes()).expect("write request");
    let mut raw = String::new();
    stream.read_to_string(&mut raw).expect("read response");
    let (head, body) = raw.split_once("\r\n\r\n").expect("response framing");
    let status = head
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .and_then(|status| status.parse().ok())
        .expect("HTTP status");
    Raw {
        status,
        headers: head.to_string(),
        body: body.to_string(),
    }
}

// ---------------------------------------------------------------------------
// FIX-13 — the façade
// ---------------------------------------------------------------------------

#[test]
fn acceptance_server_discover_is_served_on_the_modern_lease() {
    let lease = McpServer::start_http_listener(Echo).expect("start lease");
    let body = serde_json::json!({
        "jsonrpc": "2.0", "id": 1, "method": DISCOVER_METHOD, "params": {}
    })
    .to_string();
    let response = post_raw(
        lease.local_addr(),
        lease.token(),
        &[
            (PROTOCOL_VERSION_HEADER, SUPPORTED_PROTOCOL_VERSION),
            (METHOD_HEADER, DISCOVER_METHOD),
        ],
        &body,
    );

    assert_eq!(response.status, 200, "body: {}", response.body);
    let value = response.json();
    assert_eq!(value["result"]["protocolVersion"], "2026-07-28");
    assert!(
        response
            .headers
            .to_ascii_lowercase()
            .contains("mcp-protocol-version: 2026-07-28")
    );
    // The legacy revision is advertised as still supported.
    let supported: Vec<&str> = value["result"]["supportedProtocolVersions"]
        .as_array()
        .expect("supportedProtocolVersions")
        .iter()
        .map(|version| version.as_str().expect("revision string"))
        .collect();
    assert!(supported.contains(&"2026-07-28"));
    assert!(supported.contains(&LEGACY_PROTOCOL_VERSION));
    // Discovery exposes task-shaped capability ids, never the native catalog.
    let names: Vec<&str> = value["result"]["tools"]
        .as_array()
        .expect("tools array")
        .iter()
        .map(|tool| tool["name"].as_str().expect("tool name"))
        .collect();
    assert!(names.contains(&"office.edit"));
    assert!(!names.contains(&"snapshot"));
    lease.close();
}

#[test]
fn acceptance_the_mcp_method_and_mcp_name_envelope_headers_are_validated() {
    let lease = McpServer::start_http_listener(Echo).expect("start lease");
    let addr = lease.local_addr();
    let token = lease.token().to_string();
    let list = serde_json::json!({
        "jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}
    })
    .to_string();
    let call = serde_json::json!({
        "jsonrpc": "2.0", "id": 3, "method": "tools/call",
        "params": {"name": "office.edit", "arguments": {"blockId": "b-1"}}
    })
    .to_string();

    // A missing Mcp-Method is refused: the façade will not guess the method.
    let no_method = post_raw(
        addr,
        &token,
        &[(PROTOCOL_VERSION_HEADER, SUPPORTED_PROTOCOL_VERSION)],
        &list,
    );
    assert_eq!(no_method.status, 400);
    assert!(
        no_method.json()["error"]["message"]
            .as_str()
            .is_some_and(|message| message.contains("Mcp-Method"))
    );

    // Mcp-Method that disagrees with the JSON-RPC method is refused.
    let mismatched = post_raw(
        addr,
        &token,
        &[
            (PROTOCOL_VERSION_HEADER, SUPPORTED_PROTOCOL_VERSION),
            (METHOD_HEADER, "tools/call"),
        ],
        &list,
    );
    assert_eq!(mismatched.status, 400);

    // tools/call without Mcp-Name is refused.
    let no_name = post_raw(
        addr,
        &token,
        &[
            (PROTOCOL_VERSION_HEADER, SUPPORTED_PROTOCOL_VERSION),
            (METHOD_HEADER, "tools/call"),
        ],
        &call,
    );
    assert_eq!(no_name.status, 400);
    assert!(
        no_name.json()["error"]["message"]
            .as_str()
            .is_some_and(|message| message.contains("Mcp-Name"))
    );

    // Mcp-Name that disagrees with params.name is refused.
    let wrong_name = post_raw(
        addr,
        &token,
        &[
            (PROTOCOL_VERSION_HEADER, SUPPORTED_PROTOCOL_VERSION),
            (METHOD_HEADER, "tools/call"),
            (NAME_HEADER, "browser.extract"),
        ],
        &call,
    );
    assert_eq!(wrong_name.status, 400);

    // Mcp-Name is only meaningful for tools/call.
    let stray_name = post_raw(
        addr,
        &token,
        &[
            (PROTOCOL_VERSION_HEADER, SUPPORTED_PROTOCOL_VERSION),
            (METHOD_HEADER, "tools/list"),
            (NAME_HEADER, "office.edit"),
        ],
        &list,
    );
    assert_eq!(stray_name.status, 400);

    // A legacy revision is refused on the modern lease: sessions are a
    // non-goal, so only the modern contract is negotiable here.
    let legacy = post_raw(
        addr,
        &token,
        &[
            (PROTOCOL_VERSION_HEADER, LEGACY_PROTOCOL_VERSION),
            (METHOD_HEADER, "tools/list"),
        ],
        &list,
    );
    assert_eq!(legacy.status, 400);

    // The fully valid envelope is accepted.
    let accepted = post_raw(
        addr,
        &token,
        &[
            (PROTOCOL_VERSION_HEADER, SUPPORTED_PROTOCOL_VERSION),
            (METHOD_HEADER, "tools/call"),
            (NAME_HEADER, "office.edit"),
        ],
        &call,
    );
    assert_eq!(accepted.status, 200, "body: {}", accepted.body);
    assert_eq!(
        accepted.json()["result"]["structuredContent"]["tool"],
        "office.edit"
    );
    lease.close();
}

#[test]
fn acceptance_unknown_method_and_undeclared_tool_are_typed_refusals() {
    let lease = McpServer::start_http_listener(Echo).expect("start lease");
    let addr = lease.local_addr();
    let token = lease.token().to_string();

    let unknown_method = serde_json::json!({
        "jsonrpc": "2.0", "id": 4, "method": "resources/list", "params": {}
    })
    .to_string();
    let refused = post_raw(
        addr,
        &token,
        &[
            (PROTOCOL_VERSION_HEADER, SUPPORTED_PROTOCOL_VERSION),
            (METHOD_HEADER, "resources/list"),
        ],
        &unknown_method,
    );
    // A refusal is a JSON-RPC answer, not a transport failure or a silent no-op.
    assert_eq!(refused.status, 200);
    let value = refused.json();
    assert_eq!(value["error"]["code"], -32601);
    assert!(value["error"]["data"]["guidance"].is_string());

    // A guessed native primitive is refused with guidance, not exposed.
    let guessed = serde_json::json!({
        "jsonrpc": "2.0", "id": 5, "method": "tools/call",
        "params": {"name": "snapshot", "arguments": {}}
    })
    .to_string();
    let refused = post_raw(
        addr,
        &token,
        &[
            (PROTOCOL_VERSION_HEADER, SUPPORTED_PROTOCOL_VERSION),
            (METHOD_HEADER, "tools/call"),
            (NAME_HEADER, "snapshot"),
        ],
        &guessed,
    );
    let value = refused.json();
    assert_eq!(value["error"]["code"], -32602);
    assert!(
        value["error"]["data"]["guidance"]
            .as_str()
            .is_some_and(|guidance| guidance.contains("tools/list"))
    );
    // Nothing in the refusal may hand back the internal native table.
    for leaked in [
        "disk_scan",
        "deep_research",
        "office_edit",
        "filename_search",
    ] {
        assert!(
            !refused.body.contains(leaked),
            "the refusal leaked an internal name: {leaked}"
        );
    }
    lease.close();
}

// ---------------------------------------------------------------------------
// FIX-12 — the client, driving the real façade
// ---------------------------------------------------------------------------

/// A JSON-RPC transport over the loopback lease, so the client half runs
/// against the real server half instead of a mock.
struct LeaseHttp {
    addr: SocketAddr,
    token: String,
}

impl HttpTransport for LeaseHttp {
    fn get_json(&self, _url: &str) -> Result<Value, RemoteError> {
        Err(RemoteError::Msg(
            "this transport speaks JSON-RPC only".into(),
        ))
    }

    fn post_form(&self, _url: &str, _form: &[(&str, &str)]) -> Result<Value, RemoteError> {
        Err(RemoteError::Msg(
            "this transport speaks JSON-RPC only".into(),
        ))
    }

    fn post_json(
        &self,
        _url: &str,
        _bearer: Option<&str>,
        _body: &Value,
    ) -> Result<Value, RemoteError> {
        Err(RemoteError::Msg(
            "the era path must use post_json_rpc".into(),
        ))
    }

    fn post_json_rpc(
        &self,
        _url: &str,
        _bearer: Option<&str>,
        headers: &[(&str, &str)],
        body: &Value,
    ) -> Result<McpResponse, RemoteError> {
        let port = self.addr.port();
        let mut head = format!(
            "POST /mcp HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nOrigin: http://127.0.0.1:{port}\r\nAuthorization: Bearer {token}\r\nContent-Type: application/json\r\nAccept: application/json, text/event-stream\r\n",
            token = self.token
        );
        for (name, value) in headers {
            head.push_str(&format!("{name}: {value}\r\n"));
        }
        let payload = body.to_string();
        head.push_str(&format!(
            "Content-Length: {}\r\nConnection: close\r\n\r\n{payload}",
            payload.len()
        ));
        let mut stream = TcpStream::connect(self.addr)
            .map_err(|error| RemoteError::Transport(error.to_string()))?;
        stream
            .set_read_timeout(Some(TIMEOUT))
            .map_err(|error| RemoteError::Transport(error.to_string()))?;
        stream
            .set_write_timeout(Some(TIMEOUT))
            .map_err(|error| RemoteError::Transport(error.to_string()))?;
        stream
            .write_all(head.as_bytes())
            .map_err(|error| RemoteError::Transport(error.to_string()))?;
        let mut raw = String::new();
        stream
            .read_to_string(&mut raw)
            .map_err(|error| RemoteError::Transport(error.to_string()))?;
        let (head, payload) = raw
            .split_once("\r\n\r\n")
            .ok_or_else(|| RemoteError::Msg("unframed response".to_string()))?;
        let status = head
            .lines()
            .next()
            .and_then(|line| line.split_whitespace().nth(1))
            .and_then(|status| status.parse().ok())
            .ok_or_else(|| RemoteError::Msg("no HTTP status".to_string()))?;
        Ok(McpResponse {
            status,
            body: serde_json::from_str(payload).unwrap_or(Value::Null),
        })
    }
}

fn lease_target(lease: &everyaios_mcp::McpHttpLease<Echo>) -> RemoteTarget {
    RemoteTarget {
        url: lease.url().to_string(),
        auth: AuthServerMetadata {
            issuer: "http://127.0.0.1".into(),
            authorization_endpoint: String::new(),
            token_endpoint: String::new(),
            registration_endpoint: String::new(),
            scopes_supported: vec![],
            response_types_supported: vec![],
        },
        client: ClientRegistration {
            client_id: "acceptance".into(),
            client_secret: String::new(),
            token_endpoint_auth_method: "none".into(),
        },
        force_legacy: false,
    }
}

#[test]
fn acceptance_the_client_era_probe_speaks_the_envelope_the_facade_validates() {
    let lease = McpServer::start_http_listener(Echo).expect("start lease");
    let target = lease_target(&lease);
    let http = LeaseHttp {
        addr: lease.local_addr(),
        token: lease.token().to_string(),
    };

    let listed = rpc(
        &target,
        lease.token(),
        "tools/list",
        serde_json::json!({}),
        &http,
    )
    .expect("a modern client must be able to list on the modern façade");
    assert!(listed["result"]["tools"].is_array());

    // The era was detected once and cached for this origin.
    assert_eq!(cached_era(&origin_of(&target.url)), Some(McpEra::Modern));

    // A call envelope built by the same header helper the façade validates.
    let called = rpc(
        &target,
        lease.token(),
        "tools/call",
        serde_json::json!({"name": "office.edit", "arguments": {"blockId": "b-1"}}),
        &http,
    )
    .expect("a modern tools/call must reach the façade");
    assert_eq!(called["result"]["structuredContent"]["tool"], "office.edit");
    lease.close();
}

#[test]
fn acceptance_force_legacy_speaks_the_legacy_contract_and_the_modern_lease_refuses_it() {
    let lease = McpServer::start_http_listener(Echo).expect("start lease");
    let target = lease_target(&lease).with_force_legacy(true);
    let http = LeaseHttp {
        addr: lease.local_addr(),
        token: lease.token().to_string(),
    };

    // The hatch is a client-side decision: a legacy request carries no
    // protocol-version header, so a modern-only lease must refuse it. That
    // refusal is typed, not a silent no-op, and no tool ran.
    let error = rpc(
        &target,
        lease.token(),
        "tools/list",
        serde_json::json!({}),
        &http,
    )
    .expect_err("a header-less legacy request must not pass a strict lease");
    assert!(
        matches!(error, RemoteError::Rpc { status: 400, .. }),
        "expected a typed 400, got {error}"
    );
    lease.close();
}

#[test]
fn acceptance_modern_era_precedence_and_legacy_fallback_are_separable() {
    // The modern era carries the protocol revision, the method, and — for a
    // call — the name.
    let call_headers = modern_headers("tools/call", Some("office.edit"));
    assert!(
        call_headers
            .iter()
            .any(|(name, value)| name == PROTOCOL_VERSION_HEADER && value == "2026-07-28")
    );
    assert!(
        call_headers
            .iter()
            .any(|(name, value)| name == METHOD_HEADER && value == "tools/call")
    );
    assert!(
        call_headers
            .iter()
            .any(|(name, value)| name == NAME_HEADER && value == "office.edit")
    );
    // A non-call method carries no name.
    assert!(
        !modern_headers("tools/list", Some("office.edit"))
            .iter()
            .any(|(name, _)| name == NAME_HEADER)
    );

    assert_eq!(McpEra::Modern.version(), "2026-07-28");
    assert_eq!(McpEra::Legacy.version(), LEGACY_PROTOCOL_VERSION);

    // The classifier reads the refusal body, not just the status: an unknown
    // method means legacy, an auth or availability failure proves nothing.
    assert_eq!(
        classify_era(
            400,
            &serde_json::json!({"error": {"code": -32601, "message": "Method not found"}})
        ),
        EraVerdict::Legacy
    );
    assert_eq!(
        classify_era(401, &serde_json::json!({"error": "unauthorized"})),
        EraVerdict::Inconclusive
    );
}
