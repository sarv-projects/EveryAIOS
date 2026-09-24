//! P6.7 — the MCP server side (F6/F7, doc 34 §2, doc 61 §7).
//!
//! This is the *protocol layer*, transport-agnostic: the 2026-07-28
//! stateless Streamable HTTP shape, cacheable tool lists (`ttlMs`), and MRTR
//! (multi-round-trip) continuation for long-running ops that must not hold a
//! stream open. `initialize` is answered as a *compat handshake* for real
//! clients (the official MCP Inspector CLI, Claude/Codex-style hosts) — no
//! session state is ever created, the server stays stateless. The concrete
//! HTTP / stdio transport binds to these types; the catalog reconciliation
//! merges external MCP tools into the unified registry (dedupe by name,
//! native wins).

use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::io::{BufRead, Read, Write};
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, SyncSender, TrySendError};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use crate::{ArgDef, all_tools};

/// The MCP revision implemented by the supervised HTTP lease.
///
/// The repository's transport contract is the 2026-07-28 Streamable-HTTP
/// shape.  The older wire revisions remain negotiable for initialize clients,
/// but the HTTP metadata gate below is intentionally tied to this revision.
pub const SUPPORTED_PROTOCOL_VERSION: &str = "2026-07-28";

/// Protocol versions understood by the initialize handshake.
///
/// A client asking for an unknown version receives the newest version this
/// server understands; an arbitrary client string is never echoed back.
pub const SUPPORTED_PROTOCOL_VERSIONS: &[&str] = &[
    "2024-11-05",
    "2025-03-26",
    "2025-06-18",
    "2025-11-25",
    SUPPORTED_PROTOCOL_VERSION,
];

const DEFAULT_HTTP_READ_TIMEOUT: Duration = Duration::from_secs(10);
const LEASE_READ_TIMEOUT: Duration = Duration::from_millis(250);
const LEASE_REQUEST_TIMEOUT: Duration = Duration::from_millis(750);
const LEASE_SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(1);
const MAX_LEASE_SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(5);
const MAX_LEASE_WORKERS: usize = 32;
const MAX_HTTP_HEADER_BYTES: usize = 64 * 1024;
const MAX_HTTP_HEADER_VALUE_BYTES: usize = 16 * 1024;
const MAX_MCP_METADATA_BYTES: usize = 256;
const MAX_IDEMPOTENCY_KEY_BYTES: usize = 256;
const MAX_MUTATION_CACHE_ENTRIES: usize = 1024;
const UNKNOWN_MUTATION_OUTCOME_CODE: i64 = -32004;
const PANIC_MUTATION_OUTCOME_CODE: i64 = -32603;

/// Negotiate an initialize protocol version without reflecting untrusted input.
fn negotiate_protocol_version(requested: Option<&str>) -> &'static str {
    requested
        .and_then(|value| {
            SUPPORTED_PROTOCOL_VERSIONS
                .iter()
                .copied()
                .find(|v| *v == value)
        })
        .unwrap_or(SUPPORTED_PROTOCOL_VERSION)
}

/// Is this HTTP `Origin` header value a loopback origin?
///
/// Only a literal loopback authority is accepted.  A prefix check would
/// wrongly accept lookalikes such as `localhost.evil.com` or
/// `127.0.0.1.nip.io`; path, credentials, and query components are not valid
/// Origin values and are rejected as well.
fn origin_is_local(origin: &str) -> bool {
    let value = origin.trim();
    if value.is_empty() || value.chars().any(|c| c.is_control()) {
        return false;
    }
    let normalized = value.to_ascii_lowercase();
    let (_scheme, rest) = if let Some(rest) = normalized.strip_prefix("http://") {
        ("http", rest)
    } else if let Some(rest) = normalized.strip_prefix("https://") {
        ("https", rest)
    } else if let Some(rest) = normalized.strip_prefix("tauri://") {
        ("tauri", rest)
    } else {
        return false;
    };
    if rest.contains('/') || rest.contains('?') || rest.contains('#') {
        return false;
    }
    let authority = rest;
    if authority.is_empty()
        || authority.contains('@')
        || (authority.contains('[') && !authority.starts_with('['))
    {
        return false;
    }
    let (host, port) = if let Some(end) = authority.strip_prefix('[') {
        let Some((host, suffix)) = end.split_once(']') else {
            return false;
        };
        if suffix.is_empty() {
            (host, None)
        } else if let Some(port) = suffix.strip_prefix(':') {
            if port.is_empty() || !port.chars().all(|c| c.is_ascii_digit()) {
                return false;
            }
            (host, Some(port))
        } else {
            return false;
        }
    } else {
        match authority.rsplit_once(':') {
            Some((host, port)) if !port.is_empty() && port.chars().all(|c| c.is_ascii_digit()) => {
                (host, Some(port))
            }
            Some(_) => return false,
            None => (authority, None),
        }
    };
    if port.is_some_and(|p| p.parse::<u16>().is_err()) {
        return false;
    }
    matches!(
        host.to_ascii_lowercase().as_str(),
        "127.0.0.1" | "localhost" | "::1"
    )
}

/// A tool definition from an *external* MCP server (F6 — consume path).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ExternalTool {
    pub name: String,
    pub description: String,
    /// JSON-Schema input schema (the MCP wire shape).
    #[serde(default)]
    pub input_schema: serde_json::Value,
    /// MCP annotation: true = never mutates.
    #[serde(default)]
    pub read_only: bool,
    /// MCP annotation: true = may reach outside the workspace.
    #[serde(default)]
    pub open_world: bool,
    /// The server that supplied it (provenance for dedupe/reconciliation).
    pub source: String,
}

/// The unified tool registry: native (37 browser + 5 storage) + external MCP
/// tools, reconciled so the agent sees one flat, deduplicated list (doc 13 §2).
#[derive(Debug, Clone, Default)]
pub struct ToolCatalog {
    /// External tools, keyed by name (reconciliation dedupes here).
    external: BTreeMap<String, ExternalTool>,
    /// Reconcile order: `name → source`; the first registration wins (native
    /// tools are always registered first and never shadowed).
    origin: BTreeMap<String, String>,
}

impl ToolCatalog {
    pub fn new() -> Self {
        Self::default()
    }

    /// Register an external MCP tool. Native tools (the built-in catalog)
    /// always win — an external server can never shadow `snapshot` etc.
    /// Returns `false` if the name collides with a native tool.
    pub fn register(&mut self, tool: ExternalTool) -> bool {
        if crate::find_tool(&tool.name).is_some() || crate::find_storage_tool(&tool.name).is_some()
        {
            return false;
        }
        self.origin
            .entry(tool.name.clone())
            .or_insert_with(|| tool.source.clone());
        self.external.entry(tool.name.clone()).or_insert(tool);
        true
    }

    /// The reconciled tool count: native (42) + successfully-registered
    /// external (deduped, no native collision).
    pub fn external_count(&self) -> usize {
        self.external.len()
    }

    pub fn external_tools(&self) -> impl Iterator<Item = &ExternalTool> {
        self.external.values()
    }

    /// Total reconciled tools the agent sees.
    pub fn total(&self) -> usize {
        all_tools().len() + self.external_count()
    }

    /// Resolve the origin of a tool name (native vs which external server).
    pub fn origin(&self, name: &str) -> Option<&str> {
        if crate::find_tool(name).is_some() || crate::find_storage_tool(name).is_some() {
            return Some("native");
        }
        self.origin.get(name).map(|s| s.as_str())
    }
}

/// The JSON-RPC `tools/list` response with a cache TTL (2026-07-28 stateless
/// spec — clients cache the list and only refetch after `ttl_ms`). Field
/// names are camelCase: the MCP wire protocol is camelCase, and real clients
/// (the Inspector CLI, Claude/Codex hosts) key on `inputSchema` /
/// `readOnlyHint` / `openWorldHint` — snake_case entries are dropped.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolListResponse {
    pub tools: Vec<ToolListEntry>,
    /// Cacheable tool list: clients may reuse until this TTL expires.
    pub ttl_ms: u64,
    /// Opaque cache key (changes when the catalog changes).
    pub etag: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolListEntry {
    pub name: String,
    pub description: String,
    #[serde(rename = "inputSchema")]
    pub input_schema: serde_json::Value,
    #[serde(rename = "readOnlyHint")]
    pub read_only: bool,
    #[serde(rename = "openWorldHint")]
    pub open_world: bool,
}

/// Build the stable shared façade list without any reconciled external tools.
///
/// This is the list used by a per-binding Channel B lease.  It deliberately
/// derives from the one existing `SHARED_FACADES` table; the transport does
/// not own a second capability registry.
pub fn tool_list_shared_facades(ttl_ms: u64) -> ToolListResponse {
    let tools: Vec<ToolListEntry> = crate::SHARED_FACADES
        .iter()
        .map(|f| ToolListEntry {
            name: f.name.to_string(),
            description: f.description.to_string(),
            // The façade table has no per-tool argument schema. Advertise an
            // open object rather than guessing identity-bearing fields (for
            // example `workId`/`taskId`) that the transport cannot authorize.
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {},
                "additionalProperties": true
            }),
            read_only: f.read_only,
            open_world: false,
        })
        .collect();
    let tag = etag(&tools);
    ToolListResponse {
        tools,
        ttl_ms,
        etag: tag,
    }
}

/// P64.9 — the list an **external** MCP client sees: shared-plane façades
/// plus reconciled third-party tools. Native 51-tool ids stay callable by
/// name (same handler) but are not advertised, so an external agent never
/// receives a flat dump of primitives.
pub fn tool_list_shared_plane(catalog: &ToolCatalog, ttl_ms: u64) -> ToolListResponse {
    let mut tools = tool_list_shared_facades(ttl_ms).tools;
    for e in catalog.external_tools() {
        tools.push(ToolListEntry {
            name: e.name.clone(),
            description: e.description.clone(),
            input_schema: e.input_schema.clone(),
            read_only: e.read_only,
            open_world: e.open_world,
        });
    }
    tools.sort_by(|a, b| a.name.cmp(&b.name));
    let tag = etag(&tools);
    ToolListResponse {
        tools,
        ttl_ms,
        etag: tag,
    }
}

/// Render the built-in catalog + reconciled external tools as a single
/// cacheable list. `ttl_ms` is the startup-latency target (doc 61 §7.2).
/// Kept for in-process native callers; MCP `tools/list` uses
/// [`tool_list_shared_plane`].
pub fn tool_list(catalog: &ToolCatalog, ttl_ms: u64) -> ToolListResponse {
    let mut tools: Vec<ToolListEntry> = all_tools()
        .iter()
        .map(|t| ToolListEntry {
            name: t.name.to_string(),
            description: t.description.to_string(),
            input_schema: args_to_schema(t.args),
            read_only: t.read_only,
            open_world: t.open_world,
        })
        .collect();
    for e in catalog.external_tools() {
        tools.push(ToolListEntry {
            name: e.name.clone(),
            description: e.description.clone(),
            input_schema: e.input_schema.clone(),
            read_only: e.read_only,
            open_world: e.open_world,
        });
    }
    tools.sort_by(|a, b| a.name.cmp(&b.name));
    let etag = etag(&tools);
    ToolListResponse {
        tools,
        ttl_ms,
        etag,
    }
}

/// A stable ETag over the tool list (name + schema hash) so clients can
/// conditionally refetch. No crypto required — FNV-1a over the names.
fn etag(tools: &[ToolListEntry]) -> String {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for t in tools {
        for b in t.name.bytes() {
            h ^= b as u64;
            h = h.wrapping_mul(0x1000_0000_01b3);
        }
    }
    format!("{h:016x}")
}

/// Convert our typed [`ArgDef`]s into a JSON-Schema `input_schema`.
fn args_to_schema(args: &[ArgDef]) -> serde_json::Value {
    let mut properties = serde_json::Map::new();
    let mut required = Vec::new();
    for a in args {
        let ty = match a.kind {
            crate::ArgKind::String => "string",
            crate::ArgKind::Number => "number",
            crate::ArgKind::Bool => "boolean",
            crate::ArgKind::StringArray => "array",
            crate::ArgKind::Object => "object",
        };
        let mut prop = serde_json::Map::new();
        prop.insert("type".into(), serde_json::Value::String(ty.into()));
        prop.insert(
            "description".into(),
            serde_json::Value::String(a.description.into()),
        );
        properties.insert(a.name.into(), serde_json::Value::Object(prop));
        if a.required {
            required.push(serde_json::Value::String(a.name.into()));
        }
    }
    serde_json::json!({
        "type": "object",
        "properties": properties,
        "required": required,
        "additionalProperties": true
    })
}

/// MRTR (multi-round-trip) continuation — the 2026-07-28 stateless way to run
/// a long-lived operation (a sub-agent loop, a B1 turn) without holding a
/// stream open. The client sends a fresh stateless request carrying the
/// continuation handle; the server resumes and returns the next segment.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MrtrHandle {
    /// Opaque server-side call id.
    pub call_id: String,
    /// Monotonic segment index (resume from here).
    pub segment: u64,
}

/// The stateless request envelope (no `initialize`/`session` — 2026-07-28).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "method", rename_all = "camelCase")]
pub enum StatelessRequest {
    /// Fetch the (cacheable) tool list.
    ToolsList,
    /// Invoke a tool.
    CallTool {
        name: String,
        arguments: serde_json::Value,
        /// Optional MRTR continuation (resume an in-flight call).
        #[serde(default)]
        continuation: Option<MrtrHandle>,
    },
}

/// The disposition of a handler failure at the tool-call boundary.
///
/// A retryable or approval-pending failure is safe to attempt again because
/// the handler has explicitly refused the effect.  A terminal failure is safe
/// to remember and replay.  An unknown failure may have happened after the
/// effect, so it must never be replayed automatically.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ToolCallErrorKind {
    /// The host refused the call temporarily; no effect is known to have run.
    Retryable,
    /// Approval or another human gate is still pending.
    ApprovalPending,
    /// The request was rejected before an effect and will not change on retry.
    Terminal,
    /// The effect outcome cannot be established safely.
    Unknown,
}

/// A structured failure returned by a tool handler.
///
/// Existing handlers can continue returning `Result<Value, String>`; the
/// default [`ToolCallHandler::call_outcome`] classifies common wire messages.
/// Hosts that already have typed error information may override that method
/// instead of encoding policy in an error string.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ToolCallError {
    pub kind: ToolCallErrorKind,
    pub code: i64,
    pub message: String,
}

impl ToolCallError {
    /// Construct a typed handler failure.
    pub fn new(kind: ToolCallErrorKind, code: i64, message: impl Into<String>) -> Self {
        Self {
            kind,
            code,
            message: message.into(),
        }
    }

    /// Construct a temporary availability failure.
    pub fn retryable(message: impl Into<String>) -> Self {
        Self::new(ToolCallErrorKind::Retryable, -32001, message)
    }

    /// Construct a human approval-pending failure.
    pub fn approval_pending(message: impl Into<String>) -> Self {
        Self::new(ToolCallErrorKind::ApprovalPending, -32001, message)
    }

    /// Construct a known terminal failure.
    pub fn terminal(message: impl Into<String>) -> Self {
        Self::new(ToolCallErrorKind::Terminal, -32001, message)
    }

    /// Construct an indeterminate post-effect failure.
    pub fn unknown(message: impl Into<String>) -> Self {
        Self::new(
            ToolCallErrorKind::Unknown,
            UNKNOWN_MUTATION_OUTCOME_CODE,
            message,
        )
    }

    /// Classify the legacy string error form conservatively.
    ///
    /// Explicit uncertainty markers win over retry markers, and approval
    /// markers win over generic availability words.  Unrecognized failures
    /// are unknown rather than being treated as safe-to-replay terminal
    /// results.
    pub fn from_message(message: impl Into<String>) -> Self {
        let message = message.into();
        let normalized = message.to_ascii_lowercase();
        let compact = normalized.replace(['-', '_'], " ");
        let kind = if contains_any(
            &compact,
            &[
                "unknown outcome",
                "outcome unknown",
                "unknown result",
                "post effect",
                "after effect",
                "effect uncertain",
                "uncertain",
                "indeterminate",
                "could not determine",
                "result not known",
                "lost response",
            ],
        ) {
            ToolCallErrorKind::Unknown
        } else if contains_any(
            &compact,
            &[
                "approval required",
                "approval pending",
                "awaiting approval",
                "pending approval",
                "consent required",
                "consent pending",
                "permission required",
                "human approval",
            ],
        ) {
            ToolCallErrorKind::ApprovalPending
        } else if contains_any(
            &compact,
            &[
                "temporar",
                "transient",
                "retryable",
                "try again",
                "rate limit",
                "temporarily unavailable",
                "temporarily",
                "unavailable",
                "not ready",
                "capacity",
                "overloaded",
                "busy",
                "timeout",
                "timed out",
            ],
        ) {
            ToolCallErrorKind::Retryable
        } else if contains_any(
            &compact,
            &[
                "invalid",
                "validation",
                "malformed",
                "not found",
                "forbidden",
                "permission denied",
                "conflict",
                "rejected",
                "unsupported",
                "bad request",
                "terminal",
                "denied",
            ],
        ) {
            ToolCallErrorKind::Terminal
        } else {
            ToolCallErrorKind::Unknown
        };
        let code = if kind == ToolCallErrorKind::Unknown {
            UNKNOWN_MUTATION_OUTCOME_CODE
        } else {
            -32001
        };
        Self {
            kind,
            code,
            message,
        }
    }
}

fn contains_any(value: &str, needles: &[&str]) -> bool {
    needles.iter().any(|needle| value.contains(needle))
}

/// Host-owned execution seam for MCP `tools/call`.
///
/// The MCP transport never executes a tool by itself. The desktop host injects
/// a handler that routes calls through `ToolService`/Guard-2; tests can inject
/// a deterministic handler. This keeps the endpoint useful without creating a
/// second, bypassable executor.
pub trait ToolCallHandler {
    fn call(&mut self, name: &str, arguments: &Value) -> Result<Value, String>;

    /// Execute a call with a structured failure disposition.
    ///
    /// This default preserves the existing `Result<Value, String>` contract
    /// for all current hosts while giving the mutation ledger a single place
    /// to distinguish retryable, terminal, and unknown outcomes.
    fn call_outcome(&mut self, name: &str, arguments: &Value) -> Result<Value, ToolCallError> {
        self.call(name, arguments)
            .map_err(ToolCallError::from_message)
    }
}

/// A small, dependency-free MCP server over the two supported local
/// transports: newline-delimited stdio and Streamable-HTTP-shaped loopback
/// requests. Direct callers retain the legacy permissive HTTP mode; the
/// supervised lease enables the strict `/mcp` contract, keep-alive, and
/// bounded worker lifecycle without changing the protocol handler. Origin,
/// bearer, and body limits are enforced before dispatch.
pub struct McpServer<H> {
    pub catalog: ToolCatalog,
    handler: H,
    bearer_token: Option<String>,
    max_body_bytes: usize,
    /// HTTP lease mode exposes only the stable shared façade table and refuses
    /// guessed internal/native names. The ordinary protocol/stdio server keeps
    /// its historical native-call compatibility.
    shared_plane_only: bool,
    /// Optional exact request target for a supervised Channel B endpoint.
    http_path: Option<String>,
    /// The bound address used to validate Host and Origin on a strict lease.
    expected_addr: Option<SocketAddr>,
    /// Whether this server is speaking the strict Streamable-HTTP contract.
    strict_http: bool,
    /// Read timeout used by the supervised listener. Direct HTTP callers keep
    /// the historical ten-second default.
    read_timeout: Duration,
    /// Maximum time a dispatched tool call may occupy a lease request worker.
    request_timeout: Duration,
    /// Bounded grace period used when joining lease workers during shutdown.
    shutdown_timeout: Duration,
    /// Per-lease mutation identity cache.  Entries are installed before the
    /// handler runs so a timeout cannot turn a retry into a second effect.
    mutation_cache: Mutex<BTreeMap<String, CachedMutation>>,
    /// Monotonic logical clock used to evict the oldest safe terminal entry.
    mutation_clock: AtomicU64,
    /// Maximum number of entries retained by this lease's mutation ledger.
    mutation_cache_capacity: usize,
    /// Only the supervised Channel B lease enables this boundary.  Stdio and
    /// legacy direct HTTP retain their historical retry/approval semantics.
    deduplicate_mutations: bool,
}

impl<H: ToolCallHandler> McpServer<H> {
    pub fn new(handler: H) -> Self {
        Self {
            catalog: ToolCatalog::new(),
            handler,
            bearer_token: None,
            max_body_bytes: 4 * 1024 * 1024,
            shared_plane_only: false,
            http_path: None,
            expected_addr: None,
            strict_http: false,
            read_timeout: DEFAULT_HTTP_READ_TIMEOUT,
            request_timeout: LEASE_REQUEST_TIMEOUT,
            shutdown_timeout: LEASE_SHUTDOWN_TIMEOUT,
            mutation_cache: Mutex::new(BTreeMap::new()),
            mutation_clock: AtomicU64::new(0),
            mutation_cache_capacity: MAX_MUTATION_CACHE_ENTRIES,
            deduplicate_mutations: false,
        }
    }

    pub fn with_catalog(mut self, catalog: ToolCatalog) -> Self {
        self.catalog = catalog;
        self
    }

    pub fn with_bearer_token(mut self, token: impl Into<String>) -> Self {
        self.bearer_token = Some(token.into());
        self
    }

    pub fn with_max_body_bytes(mut self, max: usize) -> Self {
        self.max_body_bytes = max.max(1);
        self
    }

    /// Restrict HTTP discovery and calls to the existing shared façade table.
    /// This is enabled automatically by [`McpServer::start_http_listener`].
    pub fn with_shared_plane_only(mut self, enabled: bool) -> Self {
        self.shared_plane_only = enabled;
        self
    }

    /// Builder alias for [`Self::with_shared_plane_only`].
    pub fn shared_plane_only(self) -> Self {
        self.with_shared_plane_only(true)
    }

    pub fn is_shared_plane_only(&self) -> bool {
        self.shared_plane_only
    }

    /// Restrict an HTTP server to one exact request target and enable the
    /// strict Streamable-HTTP request/response gate.
    pub fn with_http_path(mut self, path: impl Into<String>) -> Self {
        self.http_path = Some(path.into());
        self.strict_http = true;
        self.deduplicate_mutations = true;
        self
    }

    /// Explicitly select the strict Streamable-HTTP contract.
    pub fn with_streamable_http(mut self, enabled: bool) -> Self {
        self.strict_http = enabled;
        self.deduplicate_mutations = enabled;
        self
    }

    /// Set the per-lease mutation-ledger capacity.
    ///
    /// The value is clamped to the hard protocol bound.  This is primarily a
    /// test and host tuning seam; it never permits an unbounded ledger.
    pub fn with_mutation_cache_capacity(mut self, capacity: usize) -> Self {
        self.mutation_cache_capacity = capacity.max(1).min(MAX_MUTATION_CACHE_ENTRIES);
        self
    }

    /// Set the per-connection read timeout. The direct server defaults to ten
    /// seconds; supervised leases use a short timeout so shutdown can join
    /// idle keep-alive workers promptly.
    pub fn with_read_timeout(mut self, timeout: Duration) -> Self {
        self.read_timeout = timeout.max(Duration::from_millis(1));
        self
    }

    /// Set the maximum time a request worker waits for the host handler.
    pub fn with_request_timeout(mut self, timeout: Duration) -> Self {
        self.request_timeout = timeout.max(Duration::from_millis(1));
        self
    }

    /// Set the bounded shutdown grace period used by a supervised lease.
    pub fn with_shutdown_timeout(mut self, timeout: Duration) -> Self {
        self.shutdown_timeout = timeout
            .max(Duration::from_millis(1))
            .min(MAX_LEASE_SHUTDOWN_TIMEOUT);
        self
    }

    pub fn bearer_token(&self) -> Option<&str> {
        self.bearer_token.as_deref()
    }

    /// Handle one JSON-RPC request and return one JSON-RPC response.
    ///
    /// Notifications (no `id` field — e.g. `notifications/initialized`) get
    /// an empty response. HTTP callers use [`Self::process_json_body`] so they
    /// can turn the same notification into the required `202 Accepted` reply.
    pub fn handle_json(&mut self, body: &str) -> String {
        match self.process_json_body(body, None) {
            Ok(Some(response)) => response,
            Ok(None) => String::new(),
            Err(error) => rpc_error(json_rpc_id(body), error.code(), error.message()),
        }
    }

    /// Validate and dispatch one JSON-RPC value without going through the
    /// stdio convenience wrapper. `Ok(None)` is a valid notification.
    fn process_json_body(
        &mut self,
        body: &str,
        fallback_protocol: Option<&str>,
    ) -> Result<Option<String>, JsonRpcParseError> {
        let parsed = parse_json_rpc(body, fallback_protocol)?;
        if parsed.id.is_none() {
            return Ok(None);
        }
        Ok(Some(self.dispatch_parsed(&parsed)))
    }

    fn dispatch_parsed(&mut self, request: &ParsedJsonRpc) -> String {
        let id = request.id.clone().unwrap_or(Value::Null);
        match request.method.as_str() {
            "initialize" => {
                let params = request.value.get("params");
                let Some(params) = params else {
                    return rpc_error(id, -32602, "initialize params are required");
                };
                let Some(params) = params.as_object() else {
                    return rpc_error(id, -32602, "initialize params must be an object");
                };
                let Some(requested) = params.get("protocolVersion").and_then(Value::as_str) else {
                    return rpc_error(id, -32602, "protocolVersion is required");
                };
                if params
                    .get("capabilities")
                    .is_some_and(|capabilities| !capabilities.is_object())
                    || params
                        .get("clientInfo")
                        .is_some_and(|client_info| !client_info.is_object())
                {
                    return rpc_error(id, -32602, "initialize capabilities/clientInfo are invalid");
                }
                let negotiated = negotiate_protocol_version(Some(requested));
                let response_id = id.clone();
                serde_json::to_string(&rpc_ok(
                    id,
                    serde_json::json!({
                        "protocolVersion": negotiated,
                        "capabilities": { "tools": {} },
                        "serverInfo": {
                            "name": "everyaios-mcp",
                            "version": env!("CARGO_PKG_VERSION")
                        },
                        "instructions": "EveryAIOS shared-plane façades (task-shaped, one per capability family). Stateless: no session is created."
                    }),
                ))
                .unwrap_or_else(|_| rpc_error(response_id, -32603, "serialization failed"))
            }
            "ping" => {
                let response_id = id.clone();
                serde_json::to_string(&rpc_ok(id, serde_json::json!({})))
                    .unwrap_or_else(|_| rpc_error(response_id, -32603, "serialization failed"))
            }
            "tools/list" => {
                if request
                    .value
                    .get("params")
                    .is_some_and(|params| !params.is_object())
                {
                    return rpc_error(id, -32602, "tools/list params must be an object");
                }
                let list = if self.shared_plane_only {
                    tool_list_shared_facades(300_000)
                } else {
                    tool_list_shared_plane(&self.catalog, 300_000)
                };
                let response_id = id.clone();
                serde_json::to_string(&rpc_ok(id, list))
                    .unwrap_or_else(|_| rpc_error(response_id, -32603, "serialization failed"))
            }
            "tools/call" => {
                let Some(params) = request.value.get("params").and_then(Value::as_object) else {
                    return rpc_error(id, -32602, "tools/call params are required");
                };
                let Some(name) = params.get("name").and_then(Value::as_str) else {
                    return rpc_error(id, -32602, "tool name is required");
                };
                let arguments = match params.get("arguments") {
                    None => Value::Object(serde_json::Map::new()),
                    Some(value) if value.is_object() => value.clone(),
                    Some(_) => return rpc_error(id, -32602, "tool arguments must be an object"),
                };
                let known = if self.shared_plane_only {
                    crate::find_facade(name).is_some()
                } else {
                    crate::find_facade(name).is_some()
                        || all_tools().iter().any(|t| t.name == name)
                        || self.catalog.origin(name).is_some()
                };
                if !known {
                    return rpc_error(id, -32602, "unknown tool");
                }

                let identity = self.mutation_identity(request, name, &arguments);
                let Some((key, fingerprint)) = identity else {
                    return self.execute_tool_call(name, &arguments).into_rpc(id);
                };
                match self.begin_mutation(&key, &fingerprint) {
                    MutationStart::Execute => {
                        let outcome = self.execute_tool_call(name, &arguments);
                        self.finish_mutation(&key, &fingerprint, &outcome);
                        outcome.into_rpc(id)
                    }
                    MutationStart::Replay(outcome) => outcome.into_rpc(id),
                    MutationStart::Reject(outcome) => outcome.into_rpc(id),
                }
            }
            _ => rpc_error(id, -32601, "method not found"),
        }
    }

    fn tool_call_is_mutating(&self, name: &str) -> bool {
        if let Some(facade) = crate::find_facade(name) {
            return !facade.read_only;
        }
        if let Some(tool) = crate::find_inbuilt_tool(name) {
            return !tool.read_only;
        }
        self.catalog
            .external_tools()
            .find(|tool| tool.name == name)
            .is_some_and(|tool| !tool.read_only)
    }

    fn mutation_identity(
        &self,
        request: &ParsedJsonRpc,
        name: &str,
        arguments: &Value,
    ) -> Option<(String, String)> {
        if !self.deduplicate_mutations || !self.tool_call_is_mutating(name) {
            return None;
        }
        let operation_fingerprint = tool_call_fingerprint(name, arguments);
        if let Some(key) = request.idempotency_key.clone() {
            return Some((key, operation_fingerprint));
        }
        let id_fingerprint = value_digest(request.id.as_ref().unwrap_or(&Value::Null));
        Some((
            format!("implicit:{operation_fingerprint}:{id_fingerprint}"),
            format!("{operation_fingerprint}:{id_fingerprint}"),
        ))
    }

    fn begin_mutation(&self, key: &str, fingerprint: &str) -> MutationStart {
        let now = self.mutation_clock.fetch_add(1, Ordering::Relaxed);
        let mut cache = self
            .mutation_cache
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        if let Some(existing) = cache.get_mut(key) {
            if existing.fingerprint != fingerprint {
                return MutationStart::Reject(CallOutcome::Error {
                    code: -32009,
                    message: "idempotency key was reused for a different request".to_string(),
                });
            }
            return match &existing.state {
                MutationState::InFlight => MutationStart::Reject(CallOutcome::Error {
                    code: -32002,
                    message: "request with this idempotency key is already in progress".to_string(),
                }),
                MutationState::Terminal(outcome) => {
                    existing.last_used = now;
                    MutationStart::Replay(outcome.clone())
                }
                MutationState::Retryable => {
                    existing.state = MutationState::InFlight;
                    existing.last_used = now;
                    MutationStart::Execute
                }
                MutationState::Uncertain(outcome) => {
                    // Returning the recorded uncertainty is not an effect
                    // replay.  Crucially, this branch never returns Execute.
                    MutationStart::Reject(outcome.clone())
                }
            };
        }

        if cache.len() >= self.mutation_cache_capacity {
            // Only known no-effect outcomes are evictable. In-flight effects
            // and uncertain post-effect outcomes remain fences: dropping one
            // would allow a later retry to execute the same effect blindly.
            let victim = cache
                .iter()
                .filter_map(|(candidate_key, entry)| match &entry.state {
                    MutationState::Terminal(_) | MutationState::Retryable => {
                        Some((entry.last_used, candidate_key.clone()))
                    }
                    MutationState::InFlight | MutationState::Uncertain(_) => None,
                })
                .min_by_key(|(last_used, _)| *last_used)
                .map(|(_, candidate_key)| candidate_key);
            if let Some(victim) = victim {
                cache.remove(&victim);
            } else {
                return MutationStart::Reject(CallOutcome::Error {
                    code: -32003,
                    message: "mutation idempotency cache has no safely evictable terminal outcome"
                        .to_string(),
                });
            }
        }
        cache.insert(
            key.to_string(),
            CachedMutation {
                fingerprint: fingerprint.to_string(),
                state: MutationState::InFlight,
                last_used: now,
            },
        );
        MutationStart::Execute
    }

    fn finish_mutation(&self, key: &str, fingerprint: &str, outcome: &HandlerOutcome) {
        let now = self.mutation_clock.fetch_add(1, Ordering::Relaxed);
        let mut cache = self
            .mutation_cache
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let Some(entry) = cache.get_mut(key) else {
            // The in-flight entry cannot normally disappear: eviction excludes
            // it and a handler result only changes its state after the handler
            // has returned. Fail closed if a future implementation violates
            // that invariant rather than recreating a potentially executable
            // entry.
            return;
        };
        if entry.fingerprint != fingerprint || !matches!(entry.state, MutationState::InFlight) {
            return;
        }
        match outcome.disposition {
            OutcomeDisposition::Terminal => {
                entry.state = MutationState::Terminal(outcome.outcome.clone());
                entry.last_used = now;
            }
            OutcomeDisposition::Uncertain => {
                entry.state = MutationState::Uncertain(outcome.outcome.clone());
                entry.last_used = now;
            }
            OutcomeDisposition::Retryable => {
                // Keep only the fingerprint, not the refusal as a replayable
                // result.  A later identical request may execute, while a
                // changed-argument reuse is still rejected.  This state is
                // safe to evict because no effect is known to have occurred.
                entry.state = MutationState::Retryable;
                entry.last_used = now;
            }
        }
    }

    fn execute_tool_call(&mut self, name: &str, arguments: &Value) -> HandlerOutcome {
        let call = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            self.handler.call_outcome(name, arguments)
        }));
        match call {
            Ok(Ok(value)) => HandlerOutcome::terminal(CallOutcome::Result(value)),
            Ok(Err(error)) => {
                let disposition = match error.kind {
                    ToolCallErrorKind::Retryable | ToolCallErrorKind::ApprovalPending => {
                        OutcomeDisposition::Retryable
                    }
                    ToolCallErrorKind::Terminal => OutcomeDisposition::Terminal,
                    ToolCallErrorKind::Unknown => OutcomeDisposition::Uncertain,
                };
                HandlerOutcome {
                    outcome: CallOutcome::Error {
                        code: error.code,
                        message: error.message,
                    },
                    disposition,
                }
            }
            Err(_) => HandlerOutcome::unknown(CallOutcome::Error {
                code: PANIC_MUTATION_OUTCOME_CODE,
                message: "tool handler panicked; effect outcome is unknown".to_string(),
            }),
        }
    }

    fn mark_body_uncertain(&mut self, body: &str) {
        let Ok(parsed) = parse_json_rpc(body, None) else {
            return;
        };
        if parsed.method != "tools/call" {
            return;
        }
        let Some(params) = parsed.value.get("params").and_then(Value::as_object) else {
            return;
        };
        let Some(name) = params.get("name").and_then(Value::as_str) else {
            return;
        };
        let arguments = match params.get("arguments") {
            None => Value::Object(serde_json::Map::new()),
            Some(value) if value.is_object() => value.clone(),
            Some(_) => return,
        };
        let Some((key, fingerprint)) = self.mutation_identity(&parsed, name, &arguments) else {
            return;
        };
        self.finish_mutation(
            &key,
            &fingerprint,
            &HandlerOutcome::unknown(CallOutcome::Error {
                code: PANIC_MUTATION_OUTCOME_CODE,
                message: "tool handler panicked; effect outcome is unknown".to_string(),
            }),
        );
    }

    /// Serve newline-delimited JSON-RPC until EOF. This is the local MCP stdio
    /// lifecycle used by Claude/Codex-style hosts.
    pub fn serve_stdio<R: BufRead, W: Write>(
        &mut self,
        reader: R,
        mut writer: W,
    ) -> std::io::Result<()> {
        for line in reader.lines() {
            let line = line?;
            if line.trim().is_empty() {
                continue;
            }
            let response = self.handle_json(&line);
            if !response.is_empty() {
                writeln!(writer, "{response}")?;
                writer.flush()?;
            }
        }
        Ok(())
    }

    /// Serve one HTTP request from a loopback TCP stream, then close the
    /// connection. Kept for the one-shot supervision model (and tests); the
    /// keep-alive path is [`Self::serve_http_connection`].
    pub fn serve_http_once(&mut self, stream: &mut TcpStream) -> std::io::Result<()> {
        let _ = self.serve_http_connection(stream)?;
        Ok(())
    }

    /// Serve HTTP requests over one loopback connection until the peer closes
    /// it or requests `Connection: close` (P39.3). Returns the number of
    /// requests served. Keep-alive lets one agent reuse a single socket for
    /// repeated tool calls instead of paying a TCP handshake per request;
    /// each request still goes through the same origin/bearer/body gates.
    pub fn serve_http_connection(&mut self, stream: &mut TcpStream) -> std::io::Result<u32> {
        let policy = self.http_policy();
        let mut dispatch = |body: String| {
            self.process_json_body(&body, None)
                .map(|response| response.unwrap_or_default())
                .map_err(|error| DispatchError::Protocol(error.message().to_string()))
        };
        serve_http_connection_with_dispatch(stream, &policy, None, &mut dispatch)
    }

    /// Clone only immutable transport policy. The injected handler stays in
    /// `self`; the supervised lease moves this same server into its bounded
    /// executor rather than introducing a second execution path.
    fn http_policy(&self) -> HttpPolicy {
        HttpPolicy {
            strict: self.strict_http,
            bearer_token: self.bearer_token.clone(),
            http_path: self.http_path.clone(),
            expected_addr: self.expected_addr,
            max_body_bytes: self.max_body_bytes,
            read_timeout: self.read_timeout,
            request_timeout: self.request_timeout,
        }
    }
}

/// A supervised, per-binding Channel B HTTP lease.
///
/// The lease is deliberately narrow: it binds an ephemeral port on IPv4
/// loopback only, generates its own bearer credential, and exposes the stable
/// shared façade table.  The injected [`ToolCallHandler`] remains the only
/// execution seam; this transport never invokes a capability itself. Requests
/// are parsed concurrently but dispatched through one bounded executor because
/// the existing handler trait is synchronous. A handler that never returns can
/// therefore leave only that executor detached after the documented shutdown
/// grace period; the lease, listener, and connection workers still stop.
/// The endpoint is deliberately POST-only JSON mode: GET/SSE and DELETE
/// session-resumption legs are not implemented by this stateless lease.
pub struct McpHttpLease<H: ToolCallHandler + Send + 'static> {
    local_addr: SocketAddr,
    url: String,
    token: String,
    stop: Arc<AtomicBool>,
    listener_thread: Option<JoinHandle<()>>,
    workers: Arc<Mutex<Vec<JoinHandle<()>>>>,
    active_workers: Arc<AtomicUsize>,
    connections: Arc<ConnectionRegistry>,
    executor: Option<Arc<LeaseExecutor>>,
    executor_thread: Option<JoinHandle<()>>,
    shutdown_timeout: Duration,
    marker: std::marker::PhantomData<fn() -> H>,
}

/// Compatibility names for callers that describe this as a listener or a
/// server lease. They are aliases, so shutdown/drop behavior is identical.
pub type McpHttpListener<H> = McpHttpLease<H>;
pub type McpServerLease<H> = McpHttpLease<H>;

struct ExecutorJob {
    body: String,
    reply: SyncSender<Result<String, String>>,
}

struct LeaseExecutor {
    sender: SyncSender<ExecutorJob>,
    stop: Arc<AtomicBool>,
    request_timeout: Duration,
}

impl LeaseExecutor {
    fn dispatch(&self, body: String) -> Result<String, DispatchError> {
        if self.stop.load(Ordering::Acquire) {
            return Err(DispatchError::Cancelled);
        }
        let (reply, receiver) = mpsc::sync_channel(1);
        self.sender
            .try_send(ExecutorJob { body, reply })
            .map_err(|error| match error {
                TrySendError::Full(_) => DispatchError::Unavailable,
                TrySendError::Disconnected(_) => DispatchError::Unavailable,
            })?;
        let deadline = Instant::now() + self.request_timeout;
        loop {
            if self.stop.load(Ordering::Acquire) {
                return Err(DispatchError::Cancelled);
            }
            let remaining = deadline.saturating_duration_since(Instant::now());
            if remaining.is_zero() {
                return Err(DispatchError::Timeout);
            }
            match receiver.recv_timeout(remaining.min(Duration::from_millis(20))) {
                Ok(Ok(body)) => return Ok(body),
                Ok(Err(message)) => return Err(DispatchError::Protocol(message)),
                Err(RecvTimeoutError::Timeout) => continue,
                Err(RecvTimeoutError::Disconnected) => {
                    return Err(DispatchError::Unavailable);
                }
            }
        }
    }
}

#[derive(Debug)]
enum DispatchError {
    Cancelled,
    Timeout,
    Unavailable,
    Protocol(String),
}

impl DispatchError {
    fn http_status(&self) -> u16 {
        match self {
            Self::Timeout => 408,
            Self::Unavailable => 503,
            Self::Cancelled => 499,
            Self::Protocol(_) => 400,
        }
    }

    fn rpc_code(&self) -> i64 {
        match self {
            Self::Timeout => -32002,
            Self::Unavailable => -32003,
            Self::Cancelled => -32001,
            Self::Protocol(_) => -32600,
        }
    }

    fn message(&self) -> &str {
        match self {
            Self::Cancelled => "request cancelled",
            Self::Timeout => "request deadline exceeded",
            Self::Unavailable => "request executor unavailable",
            Self::Protocol(message) => message,
        }
    }
}

struct WorkerCountGuard {
    count: Arc<AtomicUsize>,
}

impl WorkerCountGuard {
    fn new(count: Arc<AtomicUsize>) -> Self {
        Self { count }
    }
}

impl Drop for WorkerCountGuard {
    fn drop(&mut self) {
        self.count.fetch_sub(1, Ordering::AcqRel);
    }
}

#[derive(Default)]
struct ConnectionRegistry {
    next_id: AtomicU64,
    streams: Mutex<Vec<(u64, TcpStream)>>,
}

impl ConnectionRegistry {
    fn register(&self, stream: &TcpStream) -> u64 {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        if let Ok(clone) = stream.try_clone() {
            if let Ok(mut streams) = self.streams.lock() {
                streams.push((id, clone));
            }
        }
        id
    }

    fn unregister(&self, id: u64) {
        if let Ok(mut streams) = self.streams.lock() {
            streams.retain(|(stream_id, _)| *stream_id != id);
        }
    }

    fn close_all(&self) {
        if let Ok(streams) = self.streams.lock() {
            for (_, stream) in streams.iter() {
                let _ = stream.shutdown(std::net::Shutdown::Both);
            }
        }
    }
}

impl<H> McpHttpLease<H>
where
    H: ToolCallHandler + Send + 'static,
{
    /// Start a new supervised loopback lease with a generated bearer token.
    pub fn start(handler: H) -> std::io::Result<Self> {
        McpServer::new(handler).into_http_lease()
    }

    /// Alias for supervisors that use `bind` as the lifecycle verb.
    pub fn bind(handler: H) -> std::io::Result<Self> {
        Self::start(handler)
    }

    pub fn local_addr(&self) -> SocketAddr {
        self.local_addr
    }

    /// The generated endpoint. The path is always `/mcp`.
    pub fn url(&self) -> &str {
        &self.url
    }

    pub fn endpoint(&self) -> &str {
        self.url()
    }

    pub fn mcp_url(&self) -> &str {
        self.url()
    }

    /// The ephemeral bearer credential for this binding.
    pub fn token(&self) -> &str {
        &self.token
    }

    pub fn bearer_token(&self) -> &str {
        self.token()
    }

    pub fn credential(&self) -> &str {
        self.token()
    }

    /// A ready-to-use HTTP `Authorization` value for the ACP descriptor.
    pub fn authorization_header(&self) -> String {
        format!("Bearer {}", self.token)
    }

    pub fn is_running(&self) -> bool {
        !self.stop.load(Ordering::Acquire)
    }

    /// Number of connection workers currently executing or reading.
    pub fn active_workers(&self) -> usize {
        self.active_workers.load(Ordering::Acquire)
    }

    /// Stop accepting, close active sockets, and join workers within a bounded
    /// grace period. A synchronous host handler cannot be force-killed safely;
    /// if it ignores the request deadline, its executor is detached after the
    /// bound rather than making lease shutdown wait forever.
    pub fn shutdown(&mut self) {
        self.stop.store(true, Ordering::Release);
        self.connections.close_all();
        if let Some(listener) = self.listener_thread.take() {
            let _ = listener.join();
        }
        // Close once more after the listener exits to cover an accept that
        // raced the first stop check.
        self.connections.close_all();
        // No new jobs can be submitted after the listener has stopped. Drop the
        // lease's sender before joining workers; worker clones are released as
        // their sockets observe the stop flag.
        self.executor_sender_drop();
        self.join_workers_bounded();
        self.join_executor_bounded();
    }

    fn executor_sender_drop(&mut self) {
        // The listener and workers hold their own executor clones. Dropping the
        // lease's sender lets a healthy receiver finish once those clones are
        // released; a receiver blocked in ToolCallHandler remains bounded by
        // join_executor_bounded below.
        drop(self.executor.take());
    }

    fn join_workers_bounded(&mut self) {
        let deadline = Instant::now() + self.shutdown_timeout;
        let mut handles = match self.workers.lock() {
            Ok(mut workers) => std::mem::take(&mut *workers),
            Err(poisoned) => {
                let mut workers = poisoned.into_inner();
                std::mem::take(&mut *workers)
            }
        };
        loop {
            let mut pending = Vec::new();
            for handle in handles.drain(..) {
                if handle.is_finished() {
                    let _ = handle.join();
                } else {
                    pending.push(handle);
                }
            }
            handles = pending;
            if handles.is_empty() || Instant::now() >= deadline {
                break;
            }
            thread::sleep(Duration::from_millis(5));
        }
        // Dropping a still-running JoinHandle detaches it. Its socket was
        // closed above and its stop flag is set, so it cannot accept new work.
        drop(handles);
    }

    fn join_executor_bounded(&mut self) {
        let deadline = Instant::now() + self.shutdown_timeout;
        if let Some(executor) = self.executor_thread.take() {
            loop {
                if executor.is_finished() {
                    let _ = executor.join();
                    return;
                }
                if Instant::now() >= deadline {
                    // The synchronous ToolCallHandler trait has no cancellation
                    // primitive. Detach only this already-cancelled executor;
                    // never hold the lease or listener mutex waiting for it.
                    drop(executor);
                    return;
                }
                thread::sleep(Duration::from_millis(5));
            }
        }
    }

    /// Consuming close spelling convenient for lease-owning call sites.
    pub fn close(mut self) {
        self.shutdown();
    }

    /// Alias for [`Self::close`] used by supervisor code.
    pub fn stop(self) {
        self.close();
    }
}

impl<H: ToolCallHandler + Send + 'static> Drop for McpHttpLease<H> {
    fn drop(&mut self) {
        self.shutdown();
    }
}

impl<H> McpServer<H>
where
    H: ToolCallHandler + Send + 'static,
{
    /// Start a fresh per-binding Channel B lease. This is an associated
    /// constructor so a host can inject its existing handler without creating
    /// another capability registry.
    pub fn start_http_listener(handler: H) -> std::io::Result<McpHttpLease<H>> {
        McpServer::new(handler).into_http_lease()
    }

    /// Start a fresh lease using the same naming as other local supervisors.
    pub fn start_http(handler: H) -> std::io::Result<McpHttpLease<H>> {
        Self::start_http_listener(handler)
    }

    /// Short alias for [`Self::start_http_listener`].
    pub fn lease(handler: H) -> std::io::Result<McpHttpLease<H>> {
        Self::start_http_listener(handler)
    }

    /// Turn this configured protocol server into a supervised loopback lease.
    /// The existing origin, body, and bearer gates are reused; only the
    /// listener lifecycle and shared-plane admission are added.
    pub fn into_http_lease(mut self) -> std::io::Result<McpHttpLease<H>> {
        // The address is a literal, not caller-controlled: a lease cannot be
        // rebound to a LAN interface or a fixed port.
        let listener = TcpListener::bind(("127.0.0.1", 0))?;
        listener.set_nonblocking(true)?;
        let local_addr = listener.local_addr()?;
        let token = generate_bearer_token();
        self.bearer_token = Some(token.clone());
        self.shared_plane_only = true;
        self.http_path = Some("/mcp".to_string());
        self.expected_addr = Some(local_addr);
        self.strict_http = true;
        self.deduplicate_mutations = true;
        self.read_timeout = self.read_timeout.min(LEASE_READ_TIMEOUT);
        self.request_timeout = self.request_timeout.min(LEASE_REQUEST_TIMEOUT);
        let shutdown_timeout = self.shutdown_timeout;
        let policy = self.http_policy();
        let (sender, receiver): (SyncSender<ExecutorJob>, Receiver<ExecutorJob>) =
            mpsc::sync_channel(32);
        let executor_thread = {
            let stop = Arc::new(AtomicBool::new(false));
            // The receiver owns the only mutable reference to the injected
            // handler. HTTP workers never lock the server/handler.
            let executor_stop = Arc::clone(&stop);
            let thread = thread::spawn(move || {
                let mut server = self;
                while let Ok(job) = receiver.recv() {
                    if executor_stop.load(Ordering::Acquire) {
                        let _ = job.reply.send(Err("request cancelled".to_string()));
                        continue;
                    }
                    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                        match server.process_json_body(&job.body, None) {
                            Ok(Some(response)) => Ok(response),
                            Ok(None) => Ok(String::new()),
                            Err(error) => Ok(rpc_error(
                                json_rpc_id(&job.body),
                                error.code(),
                                error.message(),
                            )),
                        }
                    }))
                    .unwrap_or_else(|_| {
                        server.mark_body_uncertain(&job.body);
                        Ok(rpc_error(
                            json_rpc_id(&job.body),
                            PANIC_MUTATION_OUTCOME_CODE,
                            "tool handler panicked; effect outcome is unknown",
                        ))
                    });
                    let _ = job.reply.send(result);
                }
            });
            (stop, thread)
        };
        let (executor_stop, executor_thread) = executor_thread;
        let stop = Arc::clone(&executor_stop);
        let executor = Arc::new(LeaseExecutor {
            sender,
            stop: Arc::clone(&executor_stop),
            request_timeout: policy.request_timeout,
        });
        let connections = Arc::new(ConnectionRegistry::default());
        let workers: Arc<Mutex<Vec<JoinHandle<()>>>> = Arc::new(Mutex::new(Vec::new()));
        let active_workers = Arc::new(AtomicUsize::new(0));
        let stop_thread = Arc::clone(&stop);
        let executor_thread_ref = Arc::clone(&executor);
        let connections_thread = Arc::clone(&connections);
        let workers_thread = Arc::clone(&workers);
        let active_workers_thread = Arc::clone(&active_workers);
        let policy_thread = policy.clone();
        let listener_thread = thread::spawn(move || {
            loop {
                if stop_thread.load(Ordering::Acquire) {
                    break;
                }
                match listener.accept() {
                    Ok((mut stream, _peer)) => {
                        // Reap completed workers before applying the bounded
                        // admission cap; this keeps the handle vector from
                        // becoming a second source of retained connections.
                        if let Ok(mut workers) = workers_thread.lock() {
                            let mut pending = Vec::new();
                            for old in workers.drain(..) {
                                if old.is_finished() {
                                    let _ = old.join();
                                } else {
                                    pending.push(old);
                                }
                            }
                            *workers = pending;
                        }
                        if active_workers_thread.fetch_add(1, Ordering::AcqRel) >= MAX_LEASE_WORKERS
                        {
                            active_workers_thread.fetch_sub(1, Ordering::AcqRel);
                            let _ = write_http_response(
                                &mut stream,
                                503,
                                rpc_error(Value::Null, -32003, "too many active connections")
                                    .as_bytes(),
                                false,
                                None,
                            );
                            continue;
                        }
                        let worker_executor = Arc::clone(&executor_thread_ref);
                        let worker_stop = Arc::clone(&stop_thread);
                        let worker_connections = Arc::clone(&connections_thread);
                        let worker_policy = policy_thread.clone();
                        let worker_count = Arc::clone(&active_workers_thread);
                        let worker = thread::spawn(move || {
                            let _worker_guard = WorkerCountGuard::new(worker_count);
                            if worker_stop.load(Ordering::Acquire) {
                                return;
                            }
                            let connection_id = worker_connections.register(&stream);
                            let _ = stream.set_read_timeout(Some(worker_policy.read_timeout));
                            let _ = stream.set_write_timeout(Some(
                                worker_policy.request_timeout.min(Duration::from_secs(2)),
                            ));
                            let mut dispatch = |body: String| worker_executor.dispatch(body);
                            let _ = serve_http_connection_with_dispatch(
                                &mut stream,
                                &worker_policy,
                                Some(&worker_stop),
                                &mut dispatch,
                            );
                            worker_connections.unregister(connection_id);
                        });
                        if let Ok(mut workers) = workers_thread.lock() {
                            workers.push(worker);
                        } else {
                            let _ = worker.join();
                        }
                    }
                    Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                        thread::sleep(Duration::from_millis(5));
                    }
                    Err(error) if error.kind() == std::io::ErrorKind::Interrupted => continue,
                    Err(_) => break,
                }
            }
        });
        let url = format!("http://127.0.0.1:{}/mcp", local_addr.port());
        Ok(McpHttpLease {
            local_addr,
            url,
            token,
            stop,
            listener_thread: Some(listener_thread),
            workers,
            active_workers,
            connections,
            executor: Some(executor),
            executor_thread: Some(executor_thread),
            shutdown_timeout,
            marker: std::marker::PhantomData,
        })
    }

    /// Alias for [`Self::into_http_lease`].
    pub fn listen_loopback(self) -> std::io::Result<McpHttpLease<H>> {
        self.into_http_lease()
    }
}

/// Free-function spelling for dependency-injection call sites.
pub fn start_http_listener<H>(handler: H) -> std::io::Result<McpHttpLease<H>>
where
    H: ToolCallHandler + Send + 'static,
{
    McpServer::start_http_listener(handler)
}

fn generate_bearer_token() -> String {
    use rand::RngCore;
    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    let mut token = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        use std::fmt::Write;
        let _ = write!(token, "{byte:02x}");
    }
    token
}

#[derive(Clone)]
struct HttpPolicy {
    strict: bool,
    bearer_token: Option<String>,
    http_path: Option<String>,
    expected_addr: Option<SocketAddr>,
    max_body_bytes: usize,
    read_timeout: Duration,
    request_timeout: Duration,
}

/// One parsed loopback HTTP request (request line, headers, and body).
struct HttpRequest {
    method: String,
    target: String,
    body: String,
    keep_alive: bool,
    host: Option<String>,
    origin: Option<String>,
    authorization: Option<String>,
    accept: Option<String>,
    content_type: Option<String>,
    idempotency_key: Option<String>,
    protocol_version: Option<String>,
    mcp_method: Option<String>,
    mcp_name: Option<String>,
}

enum ReadRequest {
    Eof,
    Request(HttpRequest),
    Failure { status: u16, body: String },
}

fn read_http_request(
    stream: &mut TcpStream,
    buffered: &mut Vec<u8>,
    max_body_bytes: usize,
    deadline: Instant,
    read_timeout: Duration,
) -> std::io::Result<ReadRequest> {
    let mut chunk = [0u8; 4096];
    let header_end = loop {
        if Instant::now() >= deadline && !buffered.is_empty() {
            return Ok(ReadRequest::Failure {
                status: 408,
                body: "request header deadline exceeded".to_string(),
            });
        }
        if let Some(position) = buffered.windows(4).position(|window| window == b"\r\n\r\n") {
            break position + 4;
        }
        if buffered.len() > MAX_HTTP_HEADER_BYTES {
            return Ok(ReadRequest::Failure {
                status: 413,
                body: "headers too large".to_string(),
            });
        }
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            return if buffered.is_empty() {
                Ok(ReadRequest::Eof)
            } else {
                Ok(ReadRequest::Failure {
                    status: 408,
                    body: "request header deadline exceeded".to_string(),
                })
            };
        }
        let _ = stream.set_read_timeout(Some(read_timeout.min(remaining)));
        let read = match stream.read(&mut chunk) {
            Ok(read) => read,
            Err(error)
                if matches!(
                    error.kind(),
                    std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut
                ) =>
            {
                if buffered.is_empty() {
                    return Ok(ReadRequest::Eof);
                }
                return Ok(ReadRequest::Failure {
                    status: 408,
                    body: "request header deadline exceeded".to_string(),
                });
            }
            Err(error) => return Err(error),
        };
        if read == 0 {
            return if buffered.is_empty() {
                Ok(ReadRequest::Eof)
            } else {
                Ok(ReadRequest::Failure {
                    status: 400,
                    body: "truncated request".to_string(),
                })
            };
        }
        buffered.extend_from_slice(&chunk[..read]);
    };

    if header_end > MAX_HTTP_HEADER_BYTES {
        return Ok(ReadRequest::Failure {
            status: 413,
            body: "headers too large".to_string(),
        });
    }
    let header = match std::str::from_utf8(&buffered[..header_end]) {
        Ok(header) => header.to_string(),
        Err(_) => {
            return Ok(ReadRequest::Failure {
                status: 400,
                body: "header is not valid UTF-8".to_string(),
            });
        }
    };
    let mut lines = header.split("\r\n");
    let request_line = lines.next().unwrap_or_default();
    let mut request_parts = request_line.split_whitespace();
    let Some(method) = request_parts.next() else {
        return Ok(ReadRequest::Failure {
            status: 400,
            body: "malformed request line".to_string(),
        });
    };
    let Some(target) = request_parts.next() else {
        return Ok(ReadRequest::Failure {
            status: 400,
            body: "malformed request line".to_string(),
        });
    };
    let version = request_parts.next();
    if request_parts.next().is_some() || version != Some("HTTP/1.1") || !valid_token(method) {
        return Ok(ReadRequest::Failure {
            status: 400,
            body: "malformed request line".to_string(),
        });
    }
    if target.len() > MAX_HTTP_HEADER_VALUE_BYTES
        || !target.starts_with('/')
        || target.contains('#')
        || target.contains("://")
    {
        return Ok(ReadRequest::Failure {
            status: 400,
            body: "invalid request target".to_string(),
        });
    }

    let mut headers = BTreeMap::<String, String>::new();
    for line in lines {
        if line.is_empty() {
            continue;
        }
        let Some((name, value)) = line.split_once(':') else {
            return Ok(ReadRequest::Failure {
                status: 400,
                body: "malformed header".to_string(),
            });
        };
        if !valid_token(name) || name.trim() != name {
            return Ok(ReadRequest::Failure {
                status: 400,
                body: "malformed header name".to_string(),
            });
        }
        let value = value.trim();
        if value.len() > MAX_HTTP_HEADER_VALUE_BYTES
            || value
                .chars()
                .any(|character| character.is_control() && character != '\t')
        {
            return Ok(ReadRequest::Failure {
                status: 400,
                body: "malformed header value".to_string(),
            });
        }
        let key = name.to_ascii_lowercase();
        if headers.insert(key.clone(), value.to_string()).is_some() {
            return Ok(ReadRequest::Failure {
                status: 400,
                body: "duplicate header".to_string(),
            });
        }
    }
    if headers.contains_key("transfer-encoding") {
        return Ok(ReadRequest::Failure {
            status: 400,
            body: "transfer-encoding is not supported".to_string(),
        });
    }
    let content_length = match headers.get("content-length").map(|value| {
        if value.is_empty() || !value.bytes().all(|byte| byte.is_ascii_digit()) {
            None
        } else {
            Some(value.parse::<usize>().unwrap_or(usize::MAX))
        }
    }) {
        Some(Some(content_length)) => content_length,
        Some(None) => {
            return Ok(ReadRequest::Failure {
                status: 400,
                body: "invalid content-length".to_string(),
            });
        }
        None if method.eq_ignore_ascii_case("POST") => {
            return Ok(ReadRequest::Failure {
                status: 411,
                body: "content-length is required".to_string(),
            });
        }
        None => 0,
    };
    if content_length > max_body_bytes {
        return Ok(ReadRequest::Failure {
            status: 413,
            body: "body too large".to_string(),
        });
    }
    let connection = headers.get("connection").map(String::as_str).unwrap_or("");
    let mut keep_alive = false;
    for token in connection
        .split(',')
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        if token.eq_ignore_ascii_case("keep-alive") {
            keep_alive = true;
        } else if token.eq_ignore_ascii_case("close") {
            keep_alive = false;
        } else {
            return Ok(ReadRequest::Failure {
                status: 400,
                body: "unsupported connection token".to_string(),
            });
        }
    }

    while buffered.len().saturating_sub(header_end) < content_length {
        if Instant::now() >= deadline {
            return Ok(ReadRequest::Failure {
                status: 408,
                body: "request body deadline exceeded".to_string(),
            });
        }
        let remaining = deadline.saturating_duration_since(Instant::now());
        let _ = stream.set_read_timeout(Some(
            read_timeout.min(remaining.max(Duration::from_millis(1))),
        ));
        let read = match stream.read(&mut chunk) {
            Ok(read) => read,
            Err(error)
                if matches!(
                    error.kind(),
                    std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut
                ) =>
            {
                return Ok(ReadRequest::Failure {
                    status: 408,
                    body: "request body deadline exceeded".to_string(),
                });
            }
            Err(error) => return Err(error),
        };
        if read == 0 {
            return Ok(ReadRequest::Failure {
                status: 400,
                body: "truncated body".to_string(),
            });
        }
        buffered.extend_from_slice(&chunk[..read]);
    }
    let body_start = header_end;
    let body_end = body_start + content_length;
    let body = match std::str::from_utf8(&buffered[body_start..body_end]) {
        Ok(body) => body.to_string(),
        Err(_) => {
            return Ok(ReadRequest::Failure {
                status: 400,
                body: "body is not valid UTF-8".to_string(),
            });
        }
    };
    buffered.drain(..body_end);
    Ok(ReadRequest::Request(HttpRequest {
        method: method.to_string(),
        target: target.to_string(),
        body,
        keep_alive,
        host: headers.get("host").cloned(),
        origin: headers.get("origin").cloned(),
        authorization: headers.get("authorization").cloned(),
        accept: headers.get("accept").cloned(),
        content_type: headers.get("content-type").cloned(),
        idempotency_key: headers.get("idempotency-key").cloned(),
        protocol_version: headers.get("mcp-protocol-version").cloned(),
        mcp_method: headers.get("mcp-method").cloned(),
        mcp_name: headers.get("mcp-name").cloned(),
    }))
}

fn valid_token(value: &str) -> bool {
    !value.is_empty()
        && value.bytes().all(|byte| {
            byte.is_ascii_alphanumeric()
                || matches!(
                    byte,
                    b'!' | b'#'
                        | b'$'
                        | b'%'
                        | b'&'
                        | b'\''
                        | b'*'
                        | b'+'
                        | b'-'
                        | b'.'
                        | b'^'
                        | b'_'
                        | b'`'
                        | b'|'
                        | b'~'
                )
        })
}

fn content_type_is_json(value: Option<&str>) -> bool {
    value.is_some_and(|value| {
        value
            .split(';')
            .next()
            .is_some_and(|media_type| media_type.trim().eq_ignore_ascii_case("application/json"))
    })
}

fn accept_supports_streamable_http(value: Option<&str>) -> bool {
    let Some(value) = value else {
        return false;
    };
    let mut accepts_json = false;
    let mut accepts_sse = false;
    for entry in value.split(',') {
        let mut parts = entry.split(';');
        let media_type = parts.next().unwrap_or_default().trim();
        let mut quality = 1.0f32;
        for parameter in parts {
            let parameter = parameter.trim();
            if parameter.is_empty() {
                continue;
            }
            let Some((name, value)) = parameter.split_once('=') else {
                if parameter.eq_ignore_ascii_case("q") {
                    return false;
                }
                continue;
            };
            if name.trim().eq_ignore_ascii_case("q") {
                let Ok(parsed) = value.trim().parse::<f32>() else {
                    return false;
                };
                if !(0.0..=1.0).contains(&parsed) {
                    return false;
                }
                quality = parsed;
            }
        }
        if quality <= 0.0 {
            continue;
        }
        match media_type.to_ascii_lowercase().as_str() {
            "application/json" => accepts_json = true,
            "text/event-stream" => accepts_sse = true,
            _ => {}
        }
    }
    accepts_json && accepts_sse
}

fn split_authority(authority: &str) -> Option<(&str, Option<u16>)> {
    if let Some(end) = authority.strip_prefix('[') {
        let (host, suffix) = end.split_once(']')?;
        if suffix.is_empty() {
            return Some((host, None));
        }
        let port = suffix.strip_prefix(':')?;
        return Some((host, Some(port.parse().ok()?)));
    }
    match authority.rsplit_once(':') {
        Some((host, port)) => Some((host, Some(port.parse().ok()?))),
        None => Some((authority, None)),
    }
}

fn local_authority(value: &str) -> Option<(&str, Option<u16>)> {
    let (host, port) = split_authority(value)?;
    if !matches!(
        host.to_ascii_lowercase().as_str(),
        "127.0.0.1" | "localhost" | "::1"
    ) {
        return None;
    }
    Some((host, port))
}

fn host_matches(host: Option<&str>, expected_addr: Option<SocketAddr>) -> bool {
    let Some(host) = host else {
        return false;
    };
    let Some((host_name, port)) = local_authority(host.trim()) else {
        return false;
    };
    if let Some(expected) = expected_addr {
        return port == Some(expected.port())
            && expected.is_ipv4()
            && matches!(
                host_name.to_ascii_lowercase().as_str(),
                "127.0.0.1" | "localhost"
            );
    }
    true
}

fn origin_matches(origin: Option<&str>, expected_addr: Option<SocketAddr>) -> bool {
    let Some(origin) = origin else {
        // Native MCP clients are not browsers and commonly omit Origin. When
        // present, however, it is always checked and never treated as a
        // prefix or a DNS name.
        return true;
    };
    if !origin_is_local(origin) {
        return false;
    }
    let Some(expected) = expected_addr else {
        return true;
    };
    let value = origin.trim();
    let Some((scheme, rest)) = value.split_once("://") else {
        return false;
    };
    if scheme.eq_ignore_ascii_case("tauri") {
        return true;
    }
    let authority = rest.split(['/', '?', '#']).next().unwrap_or("");
    local_authority(authority).is_some_and(|(host, port)| {
        port == Some(expected.port())
            && expected.is_ipv4()
            && matches!(
                host.to_ascii_lowercase().as_str(),
                "127.0.0.1" | "localhost"
            )
    })
}

fn bearer_matches(expected: Option<&str>, provided: Option<&str>) -> bool {
    let Some(expected) = expected else {
        return true;
    };
    let Some(provided) = provided else {
        return false;
    };
    let Some((scheme, token)) = provided.split_once(' ') else {
        return false;
    };
    if !scheme.eq_ignore_ascii_case("Bearer")
        || token.is_empty()
        || token.chars().any(char::is_whitespace)
    {
        return false;
    }
    if expected.len() != token.len() {
        return false;
    }
    let mut difference = 0u8;
    for (left, right) in expected.bytes().zip(token.bytes()) {
        difference |= left ^ right;
    }
    difference == 0
}

struct HttpFailure {
    status: u16,
    body: String,
    protocol_version: Option<String>,
}

impl HttpFailure {
    fn new(status: u16, code: i64, message: &str) -> Self {
        Self {
            status,
            body: rpc_error(Value::Null, code, message),
            protocol_version: None,
        }
    }

    fn with_id(mut self, id: Value) -> Self {
        self.body = serde_json::from_str::<Value>(&self.body)
            .ok()
            .and_then(|mut value| {
                value
                    .as_object_mut()
                    .and_then(|object| object.insert("id".to_string(), id));
                Some(value)
            })
            .map(|value| value.to_string())
            .unwrap_or_else(|| self.body);
        self
    }

    fn with_protocol(mut self, protocol_version: Option<&str>) -> Self {
        self.protocol_version = protocol_version
            .filter(|version| *version == SUPPORTED_PROTOCOL_VERSION)
            .map(ToString::to_string);
        self
    }
}

impl HttpPolicy {
    fn validate(&self, request: &HttpRequest) -> Result<ParsedJsonRpc, HttpFailure> {
        let context = |status, code, message: &str| {
            HttpFailure::new(status, code, message)
                .with_protocol(request.protocol_version.as_deref())
                .with_id(json_rpc_id(&request.body))
        };
        if !self.strict {
            if !bearer_matches(
                self.bearer_token.as_deref(),
                request.authorization.as_deref(),
            ) {
                return Err(context(401, -32000, "unauthorized"));
            }
            if !origin_matches(request.origin.as_deref(), self.expected_addr) {
                return Err(context(403, -32000, "origin rejected"));
            }
            if self
                .http_path
                .as_deref()
                .is_some_and(|expected| expected != request.target)
            {
                return Err(context(404, -32000, "not found"));
            }
            return parse_json_rpc(&request.body, None).map_err(|error| {
                context(400, error.code(), error.message()).with_id(json_rpc_id(&request.body))
            });
        }

        if !bearer_matches(
            self.bearer_token.as_deref(),
            request.authorization.as_deref(),
        ) || self.bearer_token.is_none()
        {
            return Err(context(401, -32000, "unauthorized"));
        }
        if !host_matches(request.host.as_deref(), self.expected_addr) {
            return Err(context(403, -32000, "host rejected"));
        }
        if !origin_matches(request.origin.as_deref(), self.expected_addr) {
            return Err(context(403, -32000, "origin rejected"));
        }
        if self.http_path.as_deref().unwrap_or("/mcp") != request.target {
            return Err(context(404, -32000, "not found"));
        }
        if request.method != "POST" {
            return Err(context(405, -32600, "POST is required"));
        }
        if !content_type_is_json(request.content_type.as_deref()) {
            return Err(context(415, -32600, "application/json is required"));
        }
        if !accept_supports_streamable_http(request.accept.as_deref()) {
            return Err(context(
                406,
                -32600,
                "Accept must include application/json and text/event-stream",
            ));
        }
        if request.protocol_version.as_deref() != Some(SUPPORTED_PROTOCOL_VERSION) {
            return Err(context(
                400,
                -32600,
                "MCP-Protocol-Version must be the supported revision",
            ));
        }
        let Some(mcp_method) = request.mcp_method.as_deref() else {
            return Err(context(400, -32600, "Mcp-Method is required"));
        };
        if mcp_method.len() > MAX_MCP_METADATA_BYTES || mcp_method.chars().any(char::is_control) {
            return Err(context(400, -32600, "Mcp-Method is invalid"));
        }
        let mut parsed = parse_json_rpc(&request.body, request.protocol_version.as_deref())
            .map_err(|error| {
                context(400, error.code(), error.message()).with_id(json_rpc_id(&request.body))
            })?;
        if let Some(raw_key) = request.idempotency_key.as_deref() {
            let key = validate_idempotency_key(raw_key).map_err(|message| {
                context(400, -32600, &message).with_id(parsed.id.clone().unwrap_or(Value::Null))
            })?;
            if parsed
                .idempotency_key
                .as_ref()
                .is_some_and(|body_key| body_key != &key)
            {
                return Err(
                    context(400, -32600, "Idempotency-Key does not match the request")
                        .with_id(parsed.id.clone().unwrap_or(Value::Null)),
                );
            }
            parsed.idempotency_key = Some(key);
        }
        if mcp_method != parsed.method {
            return Err(context(400, -32600, "Mcp-Method does not match JSON-RPC")
                .with_id(parsed.id.clone().unwrap_or(Value::Null)));
        }
        if parsed.protocol_version != SUPPORTED_PROTOCOL_VERSION {
            return Err(context(400, -32600, "MCP protocol version does not match")
                .with_id(parsed.id.clone().unwrap_or(Value::Null)));
        }
        if let Some(mcp_name) = request.mcp_name.as_deref() {
            if mcp_name.len() > MAX_MCP_METADATA_BYTES || mcp_name.chars().any(char::is_control) {
                return Err(context(400, -32600, "Mcp-Name is invalid")
                    .with_id(parsed.id.clone().unwrap_or(Value::Null)));
            }
        }
        if parsed.method == "tools/call" {
            let Some(name) = parsed.name.as_deref() else {
                return Err(context(400, -32600, "Mcp-Name is required")
                    .with_id(parsed.id.clone().unwrap_or(Value::Null)));
            };
            if request.mcp_name.as_deref() != Some(name) {
                return Err(context(400, -32600, "Mcp-Name does not match tools/call")
                    .with_id(parsed.id.clone().unwrap_or(Value::Null)));
            }
        } else if request.mcp_name.is_some() {
            return Err(
                context(400, -32600, "Mcp-Name is only valid for tools/call")
                    .with_id(parsed.id.clone().unwrap_or(Value::Null)),
            );
        }
        Ok(parsed)
    }
}

fn serve_http_connection_with_dispatch<F>(
    stream: &mut TcpStream,
    policy: &HttpPolicy,
    stop: Option<&AtomicBool>,
    dispatch: &mut F,
) -> std::io::Result<u32>
where
    F: FnMut(String) -> Result<String, DispatchError>,
{
    stream.set_read_timeout(Some(policy.read_timeout))?;
    stream.set_write_timeout(Some(policy.request_timeout.min(Duration::from_secs(2))))?;
    let mut buffered = Vec::new();
    let mut served = 0u32;
    loop {
        if stop.is_some_and(|stop| stop.load(Ordering::Acquire)) {
            return Ok(served);
        }
        let request_budget = if policy.strict {
            policy.request_timeout
        } else {
            policy.read_timeout
        };
        let request_deadline = Instant::now() + request_budget;
        let request = match read_http_request(
            stream,
            &mut buffered,
            policy.max_body_bytes,
            request_deadline,
            policy.read_timeout,
        )? {
            ReadRequest::Eof => return Ok(served),
            ReadRequest::Failure { status, body } => {
                let body = framing_error_body(status, &body);
                write_http_response(stream, status, body.as_bytes(), false, None)?;
                return Ok(served);
            }
            ReadRequest::Request(request) => request,
        };
        served = served.saturating_add(1);
        let keep_alive = request.keep_alive;
        match policy.validate(&request) {
            Err(failure) => {
                write_http_response(
                    stream,
                    failure.status,
                    failure.body.as_bytes(),
                    false,
                    failure.protocol_version.as_deref(),
                )?;
                return Ok(served);
            }
            Ok(parsed) if parsed.id.is_none() => {
                // Streamable HTTP requires an accepted JSON-RPC notification
                // to be acknowledged with 202 and no response body.
                write_http_response(stream, 202, b"", keep_alive, Some(parsed.protocol_version))?;
            }
            Ok(parsed) => {
                let response_id = parsed.id.clone().unwrap_or(Value::Null);
                match dispatch(request.body) {
                    Ok(response) if !response.is_empty() => {
                        write_http_response(
                            stream,
                            200,
                            response.as_bytes(),
                            keep_alive,
                            Some(parsed.protocol_version),
                        )?;
                    }
                    Ok(_) => {
                        write_http_response(
                            stream,
                            500,
                            rpc_error(response_id, -32603, "empty JSON-RPC response").as_bytes(),
                            false,
                            Some(parsed.protocol_version),
                        )?;
                        return Ok(served);
                    }
                    Err(error) => {
                        let body = rpc_error(response_id, error.rpc_code(), error.message());
                        write_http_response(
                            stream,
                            error.http_status(),
                            body.as_bytes(),
                            false,
                            Some(parsed.protocol_version),
                        )?;
                        return Ok(served);
                    }
                }
            }
        }
        if !keep_alive {
            return Ok(served);
        }
    }
}

struct ParsedJsonRpc {
    value: Value,
    method: String,
    id: Option<Value>,
    name: Option<String>,
    protocol_version: &'static str,
    idempotency_key: Option<String>,
}

#[derive(Debug, Clone)]
enum CallOutcome {
    Result(Value),
    Error { code: i64, message: String },
}

impl CallOutcome {
    fn into_rpc(self, id: Value) -> String {
        match self {
            Self::Result(value) => {
                let fallback_id = id.clone();
                serde_json::to_string(&rpc_ok(
                    id,
                    serde_json::json!({
                        "content": [{"type": "text", "text": value.to_string()}],
                        "structuredContent": value
                    }),
                ))
                .unwrap_or_else(|_| rpc_error(fallback_id, -32603, "serialization failed"))
            }
            Self::Error { code, message } => rpc_error(id, code, &message),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum OutcomeDisposition {
    /// The handler returned a refusal that is safe to retry.
    Retryable,
    /// The handler completed with a known result that can be replayed.
    Terminal,
    /// The effect may have happened, so this key is a permanent replay fence.
    Uncertain,
}

#[derive(Debug, Clone)]
struct HandlerOutcome {
    outcome: CallOutcome,
    disposition: OutcomeDisposition,
}

impl HandlerOutcome {
    fn terminal(outcome: CallOutcome) -> Self {
        Self {
            outcome,
            disposition: OutcomeDisposition::Terminal,
        }
    }

    fn unknown(outcome: CallOutcome) -> Self {
        Self {
            outcome,
            disposition: OutcomeDisposition::Uncertain,
        }
    }

    fn into_rpc(self, id: Value) -> String {
        self.outcome.into_rpc(id)
    }
}

#[derive(Clone)]
enum MutationState {
    InFlight,
    /// The handler explicitly refused before an effect; the key may be tried
    /// again with the same arguments, but is not a replayable outcome.
    Retryable,
    Terminal(CallOutcome),
    Uncertain(CallOutcome),
}

#[derive(Clone)]
struct CachedMutation {
    fingerprint: String,
    state: MutationState,
    last_used: u64,
}

enum MutationStart {
    Execute,
    Replay(CallOutcome),
    Reject(CallOutcome),
}

fn value_digest(value: &Value) -> String {
    let bytes = serde_json::to_vec(value).unwrap_or_default();
    let digest = Sha256::digest(&bytes);
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn tool_call_fingerprint(name: &str, arguments: &Value) -> String {
    value_digest(&serde_json::json!({
        "name": name,
        "arguments": arguments,
    }))
}

#[derive(Debug)]
enum JsonRpcParseError {
    Parse(String),
    Invalid(String),
}

impl JsonRpcParseError {
    fn code(&self) -> i64 {
        match self {
            Self::Parse(_) => -32700,
            Self::Invalid(_) => -32600,
        }
    }

    fn message(&self) -> &str {
        match self {
            Self::Parse(message) | Self::Invalid(message) => message,
        }
    }
}

fn validate_idempotency_key(value: &str) -> Result<String, String> {
    if value.is_empty()
        || value.len() > MAX_IDEMPOTENCY_KEY_BYTES
        || value
            .chars()
            .any(|character| character.is_control() || character.is_whitespace())
    {
        return Err("idempotency key is invalid".to_string());
    }
    Ok(value.to_string())
}

fn merge_idempotency_candidate(
    found: &mut Option<String>,
    candidate: Option<&Value>,
) -> Result<(), String> {
    let Some(candidate) = candidate else {
        return Ok(());
    };
    let Some(raw) = candidate.as_str() else {
        return Err("idempotency key must be a string".to_string());
    };
    let key = validate_idempotency_key(raw)?;
    if found.as_ref().is_some_and(|existing| existing != &key) {
        return Err("idempotency key values do not match".to_string());
    }
    *found = Some(key);
    Ok(())
}

fn idempotency_key_from_value(value: &Value) -> Result<Option<String>, String> {
    let mut found = None;
    merge_idempotency_candidate(&mut found, value.get("idempotencyKey"))?;
    merge_idempotency_candidate(&mut found, value.get("idempotency_key"))?;
    let params = value.get("params").and_then(Value::as_object);
    if let Some(params) = params {
        merge_idempotency_candidate(&mut found, params.get("idempotencyKey"))?;
        merge_idempotency_candidate(&mut found, params.get("idempotency_key"))?;
        if let Some(meta) = params.get("_meta").and_then(Value::as_object) {
            merge_idempotency_candidate(&mut found, meta.get("idempotencyKey"))?;
            merge_idempotency_candidate(&mut found, meta.get("idempotency_key"))?;
        }
        if let Some(arguments) = params.get("arguments").and_then(Value::as_object) {
            merge_idempotency_candidate(&mut found, arguments.get("idempotencyKey"))?;
            merge_idempotency_candidate(&mut found, arguments.get("idempotency_key"))?;
        }
    }
    Ok(found)
}

fn json_rpc_id(body: &str) -> Value {
    serde_json::from_str::<Value>(body)
        .ok()
        .and_then(|value| value.get("id").cloned())
        .filter(|value| value.is_string() || value.is_number() || value.is_null())
        .unwrap_or(Value::Null)
}

fn parse_json_rpc(
    body: &str,
    fallback_protocol: Option<&str>,
) -> Result<ParsedJsonRpc, JsonRpcParseError> {
    let value: Value =
        serde_json::from_str(body).map_err(|error| JsonRpcParseError::Parse(error.to_string()))?;
    let object = value.as_object().ok_or_else(|| {
        JsonRpcParseError::Invalid("JSON-RPC message must be an object".to_string())
    })?;
    if object.get("jsonrpc").and_then(Value::as_str) != Some("2.0") {
        return Err(JsonRpcParseError::Invalid(
            "jsonrpc must be exactly 2.0".to_string(),
        ));
    }
    let method = object
        .get("method")
        .and_then(Value::as_str)
        .filter(|method| !method.is_empty() && !method.chars().any(char::is_control))
        .ok_or_else(|| JsonRpcParseError::Invalid("method must be a non-empty string".to_string()))?
        .to_string();
    if let Some(params) = object.get("params") {
        if !params.is_object() && !params.is_array() && !params.is_null() {
            return Err(JsonRpcParseError::Invalid(
                "params must be an object, array, or null".to_string(),
            ));
        }
    }
    let id = match object.get("id") {
        None => None,
        Some(value) if value.is_string() || value.is_number() || value.is_null() => {
            Some(value.clone())
        }
        Some(_) => {
            return Err(JsonRpcParseError::Invalid(
                "id must be a string, number, or null".to_string(),
            ));
        }
    };
    let protocol_version = if method == "initialize" {
        object
            .get("params")
            .and_then(Value::as_object)
            .and_then(|params| params.get("protocolVersion"))
            .and_then(Value::as_str)
            .map(|requested| negotiate_protocol_version(Some(requested)))
            .unwrap_or_else(|| negotiate_protocol_version(fallback_protocol))
    } else {
        negotiate_protocol_version(fallback_protocol)
    };
    let name = if method == "tools/call" {
        object
            .get("params")
            .and_then(Value::as_object)
            .and_then(|params| params.get("name"))
            .and_then(Value::as_str)
            .filter(|name| !name.is_empty() && !name.chars().any(char::is_control))
            .map(ToString::to_string)
    } else {
        None
    };
    let idempotency_key = idempotency_key_from_value(&value).map_err(JsonRpcParseError::Invalid)?;
    Ok(ParsedJsonRpc {
        value,
        method,
        id,
        name,
        protocol_version,
        idempotency_key,
    })
}

fn rpc_ok<T: Serialize>(id: Value, result: T) -> Value {
    serde_json::json!({"jsonrpc":"2.0", "id": id, "result": result})
}

fn rpc_error(id: Value, code: i64, message: &str) -> String {
    serde_json::json!({"jsonrpc":"2.0", "id": id, "error":{"code":code,"message":message}})
        .to_string()
}

fn framing_error_body(status: u16, message: &str) -> String {
    let code = match status {
        408 => -32002,
        413 | 411 => -32600,
        _ => -32700,
    };
    rpc_error(Value::Null, code, message)
}

fn write_http_response(
    stream: &mut TcpStream,
    status: u16,
    body: &[u8],
    keep_alive: bool,
    protocol_version: Option<&str>,
) -> std::io::Result<()> {
    let reason = match status {
        200 => "OK",
        202 => "Accepted",
        400 => "Bad Request",
        401 => "Unauthorized",
        403 => "Forbidden",
        404 => "Not Found",
        405 => "Method Not Allowed",
        408 => "Request Timeout",
        411 => "Length Required",
        413 => "Payload Too Large",
        415 => "Unsupported Media Type",
        406 => "Not Acceptable",
        499 => "Client Closed Request",
        500 => "Internal Server Error",
        503 => "Service Unavailable",
        _ => "Error",
    };
    let connection = if keep_alive { "keep-alive" } else { "close" };
    write!(stream, "HTTP/1.1 {status} {reason}\r\n")?;
    if !body.is_empty() {
        write!(stream, "content-type: application/json\r\n")?;
    }
    if status == 401 {
        write!(stream, "www-authenticate: Bearer\r\n")?;
    }
    if status == 405 {
        write!(stream, "allow: POST\r\n")?;
    }
    if let Some(protocol_version) = protocol_version {
        write!(stream, "mcp-protocol-version: {protocol_version}\r\n")?;
    }
    write!(
        stream,
        "content-length: {}\r\nconnection: {connection}\r\n\r\n",
        body.len()
    )?;
    stream.write_all(body)
}

#[cfg(test)]
mod transport_tests {
    use super::*;
    use std::io::Cursor;
    use std::net::TcpListener;
    use std::thread;

    struct Fake;
    impl ToolCallHandler for Fake {
        fn call(&mut self, name: &str, arguments: &Value) -> Result<Value, String> {
            Ok(serde_json::json!({"tool": name, "args": arguments}))
        }
    }

    #[test]
    fn stdio_lists_and_calls_native_tool() {
        let mut server = McpServer::new(Fake);
        let input = format!(
            "{}\n{}\n",
            serde_json::json!({"jsonrpc":"2.0","id":1,"method":"tools/list"}),
            serde_json::json!({"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"snapshot","arguments":{}}})
        );
        let mut output = Vec::new();
        server.serve_stdio(Cursor::new(input), &mut output).unwrap();
        let text = String::from_utf8(output).unwrap();
        assert!(text.contains("snapshot"));
        assert!(text.contains("structuredContent"));
    }

    #[test]
    fn loopback_http_requires_bearer_and_origin() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        let handle = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut server = McpServer::new(Fake).with_bearer_token("secret");
            server.serve_http_once(&mut stream).unwrap();
        });
        let mut client = TcpStream::connect(addr).unwrap();
        let body = serde_json::json!({"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"snapshot","arguments":{}}}).to_string();
        write!(client, "POST /mcp HTTP/1.1\r\nHost: localhost\r\nOrigin: http://localhost\r\nAuthorization: Bearer secret\r\nContent-Length: {}\r\n\r\n{}", body.len(), body).unwrap();
        let mut response = String::new();
        client.read_to_string(&mut response).unwrap();
        handle.join().unwrap();
        assert!(response.starts_with("HTTP/1.1 200"));
        assert!(response.contains("structuredContent"));
    }
}

#[cfg(test)]
mod lease_tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpStream;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::time::Duration;

    struct CountingHandler {
        calls: Arc<AtomicUsize>,
    }

    impl ToolCallHandler for CountingHandler {
        fn call(&mut self, name: &str, _arguments: &Value) -> Result<Value, String> {
            self.calls.fetch_add(1, Ordering::SeqCst);
            Ok(serde_json::json!({"tool": name}))
        }
    }

    fn post(addr: SocketAddr, token: &str, body: &str) -> String {
        let mut stream = TcpStream::connect(addr).expect("connect to loopback lease");
        stream
            .set_read_timeout(Some(Duration::from_secs(2)))
            .unwrap();
        let value: Value = serde_json::from_str(body).unwrap();
        let method = value.get("method").and_then(Value::as_str).unwrap_or("");
        let mut request = format!(
            "POST /mcp HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nOrigin: http://127.0.0.1:{port}\r\nAuthorization: Bearer {token}\r\nContent-Type: application/json\r\nAccept: application/json, text/event-stream\r\nMCP-Protocol-Version: 2026-07-28\r\nMcp-Method: {method}\r\nContent-Length: {length}\r\nConnection: close\r\n\r\n{body}",
            port = addr.port(),
            length = body.len(),
        );
        if method == "tools/call" {
            if let Some(name) = value
                .get("params")
                .and_then(|params| params.get("name"))
                .and_then(Value::as_str)
            {
                request = request.replace(
                    &format!("Mcp-Method: {method}\r\n"),
                    &format!("Mcp-Method: {method}\r\nMcp-Name: {name}\r\n"),
                );
            }
        }
        stream.write_all(request.as_bytes()).unwrap();
        let mut response = String::new();
        stream.read_to_string(&mut response).unwrap();
        response
    }

    #[test]
    fn lease_binds_only_loopback_and_exposes_generated_mcp_url_and_token() {
        let mut lease = McpServer::start_http_listener(CountingHandler {
            calls: Arc::new(AtomicUsize::new(0)),
        })
        .unwrap();
        assert_eq!(lease.local_addr().ip().to_string(), "127.0.0.1");
        assert_ne!(lease.local_addr().port(), 0);
        assert!(lease.url().starts_with("http://127.0.0.1:"));
        assert!(lease.url().ends_with("/mcp"));
        assert_eq!(lease.token().len(), 64);
        assert_ne!(lease.token(), "fixture");
        assert!(lease.is_running());
        lease.shutdown();
        assert!(!lease.is_running());
    }

    #[test]
    fn lease_token_isolated_and_shared_facade_only_admission_is_enforced() {
        let calls = Arc::new(AtomicUsize::new(0));
        let lease = McpServer::start_http_listener(CountingHandler {
            calls: Arc::clone(&calls),
        })
        .unwrap();
        let body = serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/list",
            "params": {}
        })
        .to_string();
        let wrong = post(lease.local_addr(), "not-the-lease-token", &body);
        assert!(wrong.starts_with("HTTP/1.1 401"));

        let listed = post(lease.local_addr(), lease.token(), &body);
        assert!(listed.starts_with("HTTP/1.1 200"));
        let listed_json = listed.split_once("\r\n\r\n").unwrap().1;
        let listed_value: Value = serde_json::from_str(listed_json).unwrap();
        let names: Vec<&str> = listed_value["result"]["tools"]
            .as_array()
            .unwrap()
            .iter()
            .map(|tool| tool["name"].as_str().unwrap())
            .collect();
        let expected: Vec<&str> = crate::SHARED_FACADES
            .iter()
            .map(|facade| facade.name)
            .collect();
        assert_eq!(names, expected);
        assert!(!names.contains(&"snapshot"));

        let guessed = post(
            lease.local_addr(),
            lease.token(),
            &serde_json::json!({
                "jsonrpc": "2.0",
                "id": 2,
                "method": "tools/call",
                "params": { "name": "snapshot", "arguments": {} }
            })
            .to_string(),
        );
        assert!(guessed.contains("-32602"));
        assert_eq!(calls.load(Ordering::SeqCst), 0);
        lease.close();
    }

    #[test]
    fn lease_shutdown_closes_the_listener() {
        let lease = McpServer::start_http_listener(CountingHandler {
            calls: Arc::new(AtomicUsize::new(0)),
        })
        .unwrap();
        let addr = lease.local_addr();
        lease.close();
        assert!(
            TcpStream::connect_timeout(&addr, Duration::from_millis(200)).is_err(),
            "closed lease must not leave a listening socket behind"
        );
    }

    #[test]
    fn lease_drop_joins_the_listener() {
        let lease = McpServer::start_http_listener(CountingHandler {
            calls: Arc::new(AtomicUsize::new(0)),
        })
        .unwrap();
        let addr = lease.local_addr();
        drop(lease);
        assert!(TcpStream::connect_timeout(&addr, Duration::from_millis(200)).is_err());
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn ext(name: &str, src: &str) -> ExternalTool {
        ExternalTool {
            name: name.into(),
            description: "ext".into(),
            input_schema: json!({"type": "object"}),
            read_only: true,
            open_world: false,
            source: src.into(),
        }
    }

    #[test]
    fn tool_list_shared_plane_advertises_facades_not_primitives() {
        let cat = ToolCatalog::new();
        let resp = tool_list_shared_plane(&cat, 300_000);
        assert_eq!(resp.tools.len(), crate::SHARED_FACADES.len());
        let names: Vec<&str> = resp.tools.iter().map(|t| t.name.as_str()).collect();
        assert!(names.contains(&"office.edit"));
        assert!(names.contains(&"computer_use.act"));
        assert!(
            !names.contains(&"snapshot"),
            "external agents must not see the 51-tool dump"
        );
    }

    #[test]
    fn tool_list_covers_native_and_external() {
        let mut cat = ToolCatalog::new();
        cat.register(ext("linear_search", "linear-mcp"));
        let resp = tool_list(&cat, 300_000);
        // 51 native (browser 37 + office 4 + memory 3 + search 2 + storage 5) + 1 external.
        assert_eq!(resp.tools.len(), 52);
        assert_eq!(resp.ttl_ms, 300_000);
        // Sorted; contains both.
        let names: Vec<&str> = resp.tools.iter().map(|t| t.name.as_str()).collect();
        assert!(names.windows(2).all(|w| w[0] <= w[1]), "sorted");
        assert!(names.contains(&"snapshot"));
        assert!(names.contains(&"linear_search"));
    }

    #[test]
    fn native_wins_reconciliation() {
        let mut cat = ToolCatalog::new();
        // An external server tries to shadow `snapshot` — refused.
        assert!(!cat.register(ext("snapshot", "evil-mcp")));
        assert_eq!(cat.external_count(), 0);
        assert_eq!(cat.origin("snapshot"), Some("native"));

        // A genuinely new tool registers.
        assert!(cat.register(ext("gmail_search", "gmail-mcp")));

        assert_eq!(cat.origin("gmail_search"), Some("gmail-mcp"));
        assert_eq!(cat.total(), 52);
    }

    #[test]
    fn duplicate_external_name_dedupes_first_wins() {
        let mut cat = ToolCatalog::new();
        assert!(cat.register(ext("notion_query", "notion-a")));
        // Second source for the same name is ignored (no double-register).
        cat.register(ext("notion_query", "notion-b"));
        assert_eq!(cat.external_count(), 1);
        assert_eq!(cat.origin("notion_query"), Some("notion-a"));
    }

    #[test]
    fn etag_is_stable_for_same_catalog() {
        let cat = ToolCatalog::new();
        let a = tool_list(&cat, 1);
        let b = tool_list(&cat, 1);
        assert_eq!(a.etag, b.etag);
        let mut cat2 = ToolCatalog::new();
        cat2.register(ext("x", "s"));
        let c = tool_list(&cat2, 1);
        assert_ne!(a.etag, c.etag);
    }

    #[test]
    fn input_schema_reflects_required_args() {
        let schema = args_to_schema(crate::find_tool("navigate").unwrap().args);
        assert_eq!(schema["type"], "object");
        assert!(
            schema["required"]
                .as_array()
                .unwrap()
                .contains(&json!("url"))
        );
        assert_eq!(schema["properties"]["url"]["type"], "string");
    }

    #[test]
    fn mrtr_handle_serializes_roundtrip() {
        let h = MrtrHandle {
            call_id: "c-1".into(),
            segment: 3,
        };
        let json = serde_json::to_string(&h).unwrap();
        let back: MrtrHandle = serde_json::from_str(&json).unwrap();
        assert_eq!(back.call_id, "c-1");
        assert_eq!(back.segment, 3);
    }

    #[test]
    fn stateless_request_has_no_session() {
        let req = StatelessRequest::CallTool {
            name: "snapshot".into(),
            arguments: json!({}),
            continuation: Some(MrtrHandle {
                call_id: "c".into(),
                segment: 0,
            }),
        };
        let json = serde_json::to_string(&req).unwrap();
        // Stateless: no initialize/session in the wire shape.
        assert!(!json.contains("initialize"));
        assert!(!json.contains("session"));
        assert!(json.contains("callTool"));
    }

    #[test]
    fn origin_check_accepts_only_literal_loopback() {
        // Bugfix 10 — lookalikes are refused, genuine loopback passes.
        assert!(origin_is_local("http://localhost:3000"));
        assert!(origin_is_local("http://127.0.0.1:8080"));
        assert!(origin_is_local("http://[::1]:7000"));
        assert!(origin_is_local("http://localhost"));
        assert!(origin_is_local("tauri://localhost"));
        // Prefix lookalikes must fail.
        assert!(!origin_is_local("http://localhost.evil.com"));
        assert!(!origin_is_local("http://127.0.0.1.nip.io"));
        assert!(!origin_is_local("http://127.0.0.10:9000"));
        assert!(!origin_is_local("http://example.com"));
        // Unknown / malformed — fail closed.
        assert!(!origin_is_local(""));
        assert!(!origin_is_local("null"));
        assert!(!origin_is_local("ftp://localhost"));
    }
}
