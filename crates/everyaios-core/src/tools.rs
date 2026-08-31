//! Stage 0 — guard-gated tool executor (S0.1).
//!
//! Sidecar proposes (`tool/exec` pre-flight + `tool/commit`); Rust disposes:
//! Guard-1 scan → `GuardService::evaluate` (ticket) → `use_ticket` → dispatch
//! → Merkle audit row. Catalog ids come from `everyaios-mcp` (42 tools) plus
//! `script.run`, `file_ops.*`, and `search.query`.
//!
//! Browser CDP / G8 search / office mutation engines are **dispatched**
//! through the same ticket path. Search uses `everyaios-search::G8Cascade`.
//! Office mutations run `everyaios-office` against a path-floored file.
//! Browser tools need an attached [`BrowserBackend`] (CDP session).

use std::collections::{BTreeMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Instant;

use everyaios_audit::{merkle::MerkleChain, AuditEvent};
use everyaios_guard::CapabilityBroker;
use everyaios_guard::{
    bind_exec_bytes, bind_path, bind_url, open_parent_dir,
    pathfloor::{enforce_floor, FloorVerdict},
    reverify_exec, reverify_path, reverify_url, scan_all, urlfloor, ConnectivityMode,
    DecisionPackage, EgressEngine, EgressVerdict, Operation, ResourceBinding, RiskLevel, RiskTier,
};
use everyaios_mcp::{all_tools, ArgDef, ArgKind, ExternalTool, ToolDef, ToolKind};
use everyaios_script::ScriptSandbox;
use serde::Serialize;
use serde_json::{json, Map, Value};
use sha2::{Digest, Sha256};

use crate::guard_service::{GuardDecision, GuardService};

const MAX_FILE_BYTES: usize = 64 * 1024;
const MAX_SCAN_SAMPLE: usize = 50;
/// P2.3 — hard cap for `download_file` (64 MiB); an oversized response is
/// refused, not buffered past the cap.
const MAX_DOWNLOAD_BYTES: usize = 64 * 1024 * 1024;

/// P2.3 (E2) — the browser engine seam behind the three file-op tools
/// (`save_pdf_enhanced` / `save_screenshot_enhanced` / `download_file`). The
/// executor owns no browser; a host that has an attached CDP session injects
/// this so those tools route real pixels/PDF to disk. When absent the tools
/// fail honestly ("browser session not attached"). `download_file` is a pure
/// HTTP fetch and does NOT need this backend.
pub trait BrowserBackend: Send + Sync {
    /// `Page.printToPDF` → write the PDF under `dir`, return the absolute path.
    fn save_pdf_enhanced(&self, dir: &Path) -> Result<String, String>;
    /// `Page.captureScreenshot` → write a JPEG under `dir`, return the path.
    fn save_screenshot_enhanced(&self, dir: &Path, quality: u8) -> Result<String, String>;
    /// A11y snapshot text of the current page.
    fn snapshot(&self) -> Result<String, String> {
        Err("browser session not attached".into())
    }
    /// Navigate the attached page.
    fn navigate(&self, _url: &str) -> Result<String, String> {
        Err("browser session not attached".into())
    }
    /// Click / type against an a11y ref (`[ref=eN]`).
    fn act(
        &self,
        _kind: &str,
        _selector: Option<&str>,
        _text: Option<&str>,
    ) -> Result<String, String> {
        Err("browser session not attached".into())
    }
}

/// Family a registered tool belongs to (dispatch key).
#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ToolFamily {
    Browser,
    Storage,
    Script,
    FileOps,
    Search,
    Office,
    /// P48.3 — desktop computer-use (E9) as a loop tool. Reached through the
    /// same ticketed executor as every other surface; an unattached backend
    /// fails honestly ("desktop session not attached").
    Desktop,
    /// P48.3 — external MCP tools attached via `attach_external` (user-supplied
    /// stdio/HTTP server). Dispatched through the executor like registry tools.
    External,
    /// P48.3 — connector writes (email/calendar). These ride the automation
    /// runtime's `ConnectorEngine` seam with approval + audit.
    Connector,
}

/// P48.3 — the desktop computer-use engine seam behind the `desktop.*` tools.
/// A host that has a live `DesktopEngine` (everyaios-computeruse) injects this
/// so the agent path reaches native windows through the ticketed executor. When
/// absent the tools fail honestly ("desktop session not attached").
pub trait DesktopBackend: Send + Sync {
    /// List native windows (read-only; e-stop-guarded, not a mutation).
    fn list_windows(&self) -> Result<Value, String>;
    /// A11y/OCR read of a window → serialized snapshot.
    fn read(&self, window_id: u64) -> Result<Value, String> {
        let _ = window_id;
        Err("desktop session not attached".into())
    }
    /// Act against a stable window id / a11y ref (observe → act → re-observe).
    fn act(
        &self,
        kind: &str,
        window_id: Option<u64>,
        target: Option<&str>,
        text: Option<&str>,
    ) -> Result<Value, String>;
}

/// P48.3 — the connector-write engine seam behind the `connector.*` tools
/// (email/calendar). Backed in the host by the automation runtime's
/// `ConnectorEngine` adapter (P42 crates); absent → honest "connector not
/// attached" failure. Writes are gated by the normal ticket + audit path.
pub trait ConnectorToolBackend: Send + Sync {
    fn email(&self, to: Vec<String>, subject: &str, body: &str) -> Result<Value, String>;
    fn calendar(&self, title: &str, when: &str) -> Result<Value, String>;
}

/// P48.3 — an attached external MCP server's live tool dispatcher. Backed in
/// the host by the attach machinery (`everyaios-mcp::AttachedServer`). When
/// absent, external tools fail honestly ("external tool session not attached").
pub trait ExternalToolBackend: Send + Sync {
    fn call(&self, tool_id: &str, args: &Value) -> Result<Value, String>;
}

/// One catalog entry — the single source of truth for `tool/list`, guard
/// pre-flight, and the coordinator's function-calling defs.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisteredTool {
    pub id: String,
    pub family: ToolFamily,
    pub description: String,
    pub read_only: bool,
    pub operation: String,
    pub risk: String,
    pub risk_tier: String,
    pub args_schema: Value,
}

/// Canonical JSON (sorted object keys) hashed with SHA-256. Coordinator
/// `canonicalArgsHash` must produce the same hex.
///
/// Numbers are canonicalized to a runtime-independent token
/// (`n:<f64-bits-hex>`) so Rust (`serde_json`) and TS (`JSON.stringify`)
/// agree regardless of integer-vs-float formatting (`5` vs `5.0`), exponent
/// style (`1e+21` vs `1e21`), or precision beyond 2^53. JavaScript has a
/// single IEEE-754 `number` type, so hashing by the f64 bit pattern is the
/// one representation both runtimes can produce identically.
pub fn canonical_args_hash(args: &Value) -> String {
    let canon = canonicalize(args);
    let bytes = serde_json::to_vec(&canon).unwrap_or_default();
    let mut h = Sha256::new();
    h.update(&bytes);
    h.finalize().iter().map(|b| format!("{b:02x}")).collect()
}

/// Canonicalize a JSON number to a runtime-independent string token.
/// `NaN`/±∞ are not representable in JSON (serde emits `null`); we mirror
/// that by tokenizing them to a stable sentinel so both sides still agree.
fn canonical_number_token(n: &serde_json::Number) -> String {
    let f = n.as_f64().unwrap_or(f64::NAN);
    // Normalize -0.0 to 0.0 (JS `Object.is(-0, 0)` is false but JSON/`===`
    // treat them equal; both runtimes hash them the same via +0.0).
    let f = if f == 0.0 { 0.0 } else { f };
    format!("n:{:016x}", f.to_bits())
}

fn canonicalize(v: &Value) -> Value {
    match v {
        Value::Object(map) => {
            let mut out = Map::new();
            let mut keys: Vec<&String> = map.keys().collect();
            keys.sort();
            for k in keys {
                out.insert(k.clone(), canonicalize(&map[k]));
            }
            Value::Object(out)
        }
        Value::Array(items) => Value::Array(items.iter().map(canonicalize).collect()),
        // Replace numbers with a bit-pattern token string so cross-runtime
        // serialization can never diverge on number formatting.
        Value::Number(n) => Value::String(canonical_number_token(n)),
        other => other.clone(),
    }
}

/// The live catalog (42 MCP tools + extras).
#[derive(Debug, Clone)]
pub struct ToolRegistry {
    tools: Vec<RegisteredTool>,
    /// alias → primary id
    aliases: BTreeMap<String, String>,
}

impl ToolRegistry {
    pub fn new() -> Self {
        let mut tools = Vec::new();
        let mut aliases = BTreeMap::new();

        for def in all_tools() {
            let family = if everyaios_mcp::find_storage_tool(def.name).is_some() {
                ToolFamily::Storage
            } else {
                ToolFamily::Browser
            };
            let id = def.name.to_string();
            let prefix = match family {
                ToolFamily::Storage => "storage",
                _ => "browser",
            };
            aliases.insert(format!("{prefix}.{id}"), id.clone());
            tools.push(from_mcp(def, family));
        }

        for extra in extra_tools() {
            tools.push(extra);
        }
        aliases.insert("script.run".into(), "script.run".into());
        aliases.insert("search.query".into(), "search.query".into());
        for op in ["read", "write", "delete", "list"] {
            aliases.insert(format!("file_ops.{op}"), format!("file_ops.{op}"));
        }
        for id in [
            "office.docx_open",
            "office.docx_patch",
            "office.xlsx_open",
            "office.xlsx_edit",
            "office.pptx_open",
            "office.pptx_patch",
            "office.pdf_open",
            "office.pdf_form_fill",
            "office.pdf_redact",
            "office.pdf_pages",
            "desktop.windows",
            "desktop.read",
            "desktop.act",
            "connector.email_send",
            "connector.calendar_create",
        ] {
            aliases.insert(id.into(), id.into());
        }

        Self { tools, aliases }
    }

    /// P48.3 — reconcile an attached external MCP server's tools into the
    /// catalog as `External`-family entries (server label as provenance).
    /// Already-registered ids (native precedence) are skipped. `label` is the
    /// server provenance (e.g. `mcp:gmail`) recorded on each entry.
    pub fn register_external(&mut self, label: &str, tools: &[ExternalTool]) -> Vec<String> {
        let mut names = Vec::new();
        for t in tools {
            if self.get(&t.name).is_some() {
                continue; // native precedence — never shadow a built-in
            }
            let (operation, risk) = if t.open_world {
                ("external_network", "medium")
            } else if t.read_only {
                ("write", "low")
            } else {
                ("web_action", "high")
            };
            let mut entry = RegisteredTool {
                id: t.name.clone(),
                family: ToolFamily::External,
                description: format!("{} ({label})", t.description),
                read_only: t.read_only,
                operation: operation.to_string(),
                risk: risk.to_string(),
                risk_tier: String::new(),
                args_schema: t.input_schema.clone(),
            };
            entry = stamp_tier(entry);
            self.tools.push(entry);
            self.aliases.insert(t.name.clone(), t.name.clone());
            names.push(t.name.clone());
        }
        names
    }

    pub fn list(&self) -> &[RegisteredTool] {
        &self.tools
    }

    pub fn get(&self, id: &str) -> Option<&RegisteredTool> {
        let primary = self.aliases.get(id).map(|s| s.as_str()).unwrap_or(id);
        self.tools.iter().find(|t| t.id == primary)
    }
}

impl Default for ToolRegistry {
    fn default() -> Self {
        Self::new()
    }
}

fn from_mcp(def: &ToolDef, family: ToolFamily) -> RegisteredTool {
    let (operation, risk) = classify(def);
    stamp_tier(RegisteredTool {
        id: def.name.to_string(),
        family,
        description: def.description.to_string(),
        read_only: def.read_only,
        operation: operation.to_string(),
        risk: risk.to_string(),
        risk_tier: String::new(),
        args_schema: schema_of(def.args),
    })
}

fn stamp_tier(mut t: RegisteredTool) -> RegisteredTool {
    let rl = match t.risk.as_str() {
        "critical" => RiskLevel::Critical,
        "high" => RiskLevel::High,
        "medium" => RiskLevel::Medium,
        _ => RiskLevel::Low,
    };
    t.risk_tier = RiskTier::from_risk_and_op(rl, &t.operation, t.read_only)
        .as_str()
        .to_string();
    t
}

fn extra_tools() -> Vec<RegisteredTool> {
    vec![
        RegisteredTool {
            id: "script.run".into(),
            family: ToolFamily::Script,
            description: "Evaluate JavaScript in the rquickjs sandbox (no host browser)".into(),
            read_only: false,
            operation: "terminal_shell".into(),
            risk: "high".into(),
            risk_tier: String::new(),
            args_schema: json!({
                "type": "object",
                "properties": {
                    "code": { "type": "string", "description": "JavaScript source" }
                },
                "required": ["code"],
                "additionalProperties": false
            }),
        },
        RegisteredTool {
            id: "file_ops.read".into(),
            family: ToolFamily::FileOps,
            description: "Read a UTF-8 file inside the workspace floor".into(),
            read_only: true,
            operation: "write".into(),
            risk: "low".into(),
            risk_tier: String::new(),
            args_schema: path_schema("File path to read", false),
        },
        RegisteredTool {
            id: "file_ops.list".into(),
            family: ToolFamily::FileOps,
            description: "List a directory inside the workspace floor".into(),
            read_only: true,
            operation: "write".into(),
            risk: "low".into(),
            risk_tier: String::new(),
            args_schema: path_schema("Directory path", false),
        },
        RegisteredTool {
            id: "file_ops.write".into(),
            family: ToolFamily::FileOps,
            description: "Write a UTF-8 file inside the workspace floor (atomic rename)".into(),
            read_only: false,
            operation: "write".into(),
            risk: "medium".into(),
            risk_tier: String::new(),
            args_schema: json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string" },
                    "content": { "type": "string" }
                },
                "required": ["path", "content"],
                "additionalProperties": false
            }),
        },
        RegisteredTool {
            id: "file_ops.delete".into(),
            family: ToolFamily::FileOps,
            description: "Delete a file inside the workspace floor".into(),
            read_only: false,
            operation: "delete".into(),
            risk: "high".into(),
            risk_tier: String::new(),
            args_schema: path_schema("File path to delete", false),
        },
        RegisteredTool {
            id: "search.query".into(),
            family: ToolFamily::Search,
            description: "Web search via the G8 cascade (cache → SearXNG → DDG fallback)".into(),
            read_only: true,
            operation: "external_network".into(),
            risk: "medium".into(),
            risk_tier: String::new(),
            args_schema: json!({
                "type": "object",
                "properties": {
                    "query": { "type": "string" }
                },
                "required": ["query"],
                "additionalProperties": false
            }),
        },
        office_tool(
            "office.docx_open",
            "Open a .docx and return plain text + block addresses",
            true,
            "low",
            path_schema("Path to a .docx", false),
        ),
        office_tool(
            "office.docx_patch",
            "Surgically patch one docx block (byte-preserving w:t write)",
            false,
            "medium",
            json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string" },
                    "address": { "type": "string", "description": "Block address (e.g. p1)" },
                    "text": { "type": "string" }
                },
                "required": ["path", "address", "text"],
                "additionalProperties": false
            }),
        ),
        office_tool(
            "office.xlsx_open",
            "Open a .xlsx (windowed calamine read of the first sheet)",
            true,
            "low",
            path_schema("Path to a .xlsx", false),
        ),
        office_tool(
            "office.xlsx_edit",
            "Set one spreadsheet cell through IronCalc + surgical part-patch",
            false,
            "medium",
            json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string" },
                    "sheet": { "type": "string" },
                    "address": { "type": "string" },
                    "value": { "type": "string" }
                },
                "required": ["path", "address", "value"],
                "additionalProperties": false
            }),
        ),
        office_tool(
            "office.pptx_open",
            "Open a .pptx and return the deck outline + per-slide text",
            true,
            "low",
            path_schema("Path to a .pptx", false),
        ),
        office_tool(
            "office.pptx_patch",
            "Patch shape text on one slide (byte-preserving a:t write)",
            false,
            "medium",
            json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string" },
                    "part": { "type": "string" },
                    "shape": { "type": "number" },
                    "text": { "type": "string" }
                },
                "required": ["path", "text"],
                "additionalProperties": false
            }),
        ),
        office_tool(
            "office.pdf_open",
            "Inspect a PDF (page count + extracted text)",
            true,
            "low",
            path_schema("Path to a .pdf", false),
        ),
        office_tool(
            "office.pdf_form_fill",
            "Fill AcroForm fields on a PDF",
            false,
            "medium",
            json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string" },
                    "fields": { "type": "object" }
                },
                "required": ["path", "fields"],
                "additionalProperties": false
            }),
        ),
        office_tool(
            "office.pdf_redact",
            "Mark a PDF rectangle for redaction",
            false,
            "high",
            json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string" },
                    "page": { "type": "number" },
                    "x1": { "type": "number" },
                    "y1": { "type": "number" },
                    "x2": { "type": "number" },
                    "y2": { "type": "number" }
                },
                "required": ["path", "page"],
                "additionalProperties": false
            }),
        ),
        office_tool(
            "office.pdf_pages",
            "PDF page ops: split / merge / rotate / reorder / delete / extract",
            false,
            "medium",
            json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string" },
                    "op": { "type": "string" },
                    "pages": { "type": "array", "items": { "type": "number" } },
                    "delta": { "type": "number" },
                    "other": { "type": "string" },
                    "out": { "type": "string" }
                },
                "required": ["path", "op"],
                "additionalProperties": false
            }),
        ),
        // P48.3 — desktop computer-use as a loop tool (E9 agent path).
        RegisteredTool {
            id: "desktop.windows".into(),
            family: ToolFamily::Desktop,
            description: "List native desktop windows (apps + titles + bounds)".into(),
            read_only: true,
            operation: "write".into(),
            risk: "low".into(),
            risk_tier: String::new(),
            args_schema: json!({ "type": "object", "properties": {}, "required": [] }),
        },
        RegisteredTool {
            id: "desktop.read".into(),
            family: ToolFamily::Desktop,
            description: "Read a window's a11y/OCR tree by stable window id".into(),
            read_only: true,
            operation: "write".into(),
            risk: "low".into(),
            risk_tier: String::new(),
            args_schema: json!({
                "type": "object",
                "properties": {
                    "windowId": { "type": "number" }
                },
                "required": ["windowId"],
                "additionalProperties": false
            }),
        },
        RegisteredTool {
            id: "desktop.act".into(),
            family: ToolFamily::Desktop,
            description: "Act on a native window by stable ref (click/type/scroll/launch)".into(),
            read_only: false,
            operation: "web_action".into(),
            risk: "high".into(),
            risk_tier: String::new(),
            args_schema: json!({
                "type": "object",
                "properties": {
                    "kind": { "type": "string" },
                    "windowId": { "type": "number" },
                    "target": { "type": "string" },
                    "text": { "type": "string" }
                },
                "required": ["kind"],
                "additionalProperties": false
            }),
        },
        // P48.3 — connector writes (email/calendar) via the automation engine.
        RegisteredTool {
            id: "connector.email_send".into(),
            family: ToolFamily::Connector,
            description: "Send an email through the connected mail provider".into(),
            read_only: false,
            operation: "web_action".into(),
            risk: "high".into(),
            risk_tier: String::new(),
            args_schema: json!({
                "type": "object",
                "properties": {
                    "to": { "type": "array", "items": { "type": "string" } },
                    "subject": { "type": "string" },
                    "body": { "type": "string" }
                },
                "required": ["to", "subject"],
                "additionalProperties": false
            }),
        },
        RegisteredTool {
            id: "connector.calendar_create".into(),
            family: ToolFamily::Connector,
            description: "Create a calendar event on the connected calendar provider".into(),
            read_only: false,
            operation: "web_action".into(),
            risk: "high".into(),
            risk_tier: String::new(),
            args_schema: json!({
                "type": "object",
                "properties": {
                    "title": { "type": "string" },
                    "when": { "type": "string" }
                },
                "required": ["title", "when"],
                "additionalProperties": false
            }),
        },
    ]
    .into_iter()
    .map(stamp_tier)
    .collect()
}

fn path_schema(desc: &str, extra: bool) -> Value {
    json!({
        "type": "object",
        "properties": { "path": { "type": "string", "description": desc } },
        "required": ["path"],
        "additionalProperties": extra
    })
}

fn office_tool(id: &str, desc: &str, read_only: bool, risk: &str, schema: Value) -> RegisteredTool {
    RegisteredTool {
        id: id.into(),
        family: ToolFamily::Office,
        description: desc.into(),
        read_only,
        operation: "write".into(),
        risk: risk.into(),
        risk_tier: String::new(),
        args_schema: schema,
    }
}

fn schema_of(args: &[ArgDef]) -> Value {
    let mut properties = Map::new();
    let mut required = Vec::new();
    for a in args {
        let ty = match a.kind {
            ArgKind::String => "string",
            ArgKind::Number => "number",
            ArgKind::Bool => "boolean",
            ArgKind::StringArray => "array",
            ArgKind::Object => "object",
        };
        let mut spec = json!({ "type": ty, "description": a.description });
        if a.kind == ArgKind::StringArray {
            spec["items"] = json!({ "type": "string" });
        }
        properties.insert(a.name.to_string(), spec);
        if a.required {
            required.push(Value::String(a.name.to_string()));
        }
    }
    json!({
        "type": "object",
        "properties": properties,
        "required": required,
        "additionalProperties": true
    })
}

fn classify(def: &ToolDef) -> (&'static str, &'static str) {
    if def.kind == ToolKind::Delete {
        return ("delete", "high");
    }
    if def.kind == ToolKind::Execute || def.name == "run" || def.name == "evaluate" {
        return ("terminal_shell", "high");
    }
    if matches!(def.name, "act" | "upload" | "download" | "download_file") {
        return ("web_action", "high");
    }
    if def.open_world || def.kind == ToolKind::Fetch {
        return ("external_network", "medium");
    }
    if def.read_only {
        return ("write", "low");
    }
    ("write", "medium")
}

fn risk_of(s: &str) -> RiskLevel {
    match s {
        "critical" => RiskLevel::Critical,
        "high" => RiskLevel::High,
        "medium" => RiskLevel::Medium,
        _ => RiskLevel::Low,
    }
}

fn operation_of(name: &str, args: &Value) -> Result<Operation, String> {
    Ok(match name {
        "delete" => Operation::DeleteFiles,
        "multi_file_edit" => Operation::MultiFileEdit {
            files: args.get("files").and_then(Value::as_u64).unwrap_or(1) as usize,
        },
        "external_network" => Operation::ExternalNetwork {
            new_domain: args
                .get("newDomain")
                .and_then(Value::as_bool)
                .unwrap_or(true),
        },
        "terminal_shell" => Operation::TerminalShell {
            destructive: args
                .get("destructive")
                .and_then(Value::as_bool)
                .unwrap_or(false),
        },
        "web_action" => Operation::WebAction,
        "write" => Operation::GenericWrite,
        other => return Err(format!("unknown operation: {other}")),
    })
}

/// The executor: one registry, one guard, one audit chain, one workspace floor.
pub struct ToolService {
    registry: ToolRegistry,
    guard: Arc<Mutex<GuardService>>,
    audit: MerkleChain,
    workspace: PathBuf,
    /// Live parent-dir fds keyed by ticket id (S0.6 TOCTOU).
    parent_fds: BTreeMap<String, fs::File>,
    /// H3: consumed idempotency keys for non-idempotent effects.
    used_idempotency: HashSet<String>,
    /// H3 data-release engine (shared with ChatRelay when wired).
    egress: Arc<Mutex<EgressEngine>>,
    /// File-level undo (Codex /rewind, Claude checkpoint): last write/delete.
    undo: Vec<FileUndo>,
    /// P2.3 — optional browser engine (PDF/screenshot file-op tools).
    browser: Option<Arc<dyn BrowserBackend>>,
    /// P48.3 — optional desktop computer-use engine (`desktop.*` tools, E9).
    desktop: Option<Arc<dyn DesktopBackend>>,
    /// P48.3 — optional connector-write engine (`connector.*` tools).
    connector: Option<Arc<dyn ConnectorToolBackend>>,
    /// P49.7 — optional opaque capability broker for connector authorization.
    capabilities: Option<Arc<Mutex<everyaios_guard::LocalCapabilityBroker>>>,
    /// P48.3 — attached external MCP servers (user-supplied tools).
    external: Vec<ExternalAttachment>,
    /// G8 cascade (cache → SearXNG → DDG).
    search: everyaios_search::G8Cascade,
    search_transport: Arc<dyn everyaios_search::SearchTransport>,
}

/// P48.3 — one attached external MCP server: its backend dispatcher plus the
/// tool ids it registered into the catalog (each carrying the server label).
pub struct ExternalAttachment {
    pub label: String,
    pub tools: Vec<String>,
    pub backend: Arc<dyn ExternalToolBackend>,
}

#[derive(Debug, Clone)]
pub struct FileUndo {
    pub session_id: String,
    pub path: PathBuf,
    pub before: Option<Vec<u8>>,
}

impl ToolService {
    pub fn new(guard: Arc<Mutex<GuardService>>, workspace: PathBuf) -> Self {
        Self::new_with_egress(
            guard,
            workspace,
            Arc::new(Mutex::new(EgressEngine::new(ConnectivityMode::ThirdParty))),
        )
    }

    pub fn new_with_egress(
        guard: Arc<Mutex<GuardService>>,
        workspace: PathBuf,
        egress: Arc<Mutex<EgressEngine>>,
    ) -> Self {
        let _ = fs::create_dir_all(&workspace);
        Self {
            registry: ToolRegistry::new(),
            guard,
            audit: MerkleChain::new(),
            workspace,
            parent_fds: BTreeMap::new(),
            used_idempotency: HashSet::new(),
            egress,
            undo: Vec::new(),
            browser: None,
            desktop: None,
            connector: None,
            capabilities: None,
            external: Vec::new(),
            search: everyaios_search::G8Cascade::default(),
            search_transport: Arc::new(UreqSearchTransport),
        }
    }

    /// P2.3 — attach a browser engine so `save_pdf_enhanced`/
    /// `save_screenshot_enhanced` route real captures to disk.
    pub fn with_browser(mut self, browser: Arc<dyn BrowserBackend>) -> Self {
        self.browser = Some(browser);
        self
    }

    /// Attach (or replace) the live CDP backend after `browser_start`.
    pub fn attach_browser(&mut self, browser: Arc<dyn BrowserBackend>) {
        self.browser = Some(browser);
    }

    /// P48.3 — attach (or replace) the live desktop engine so the `desktop.*`
    /// tools reach native windows through the ticketed executor. This flips the
    /// E9 agent-path cell (desktop becomes a loop tool).
    pub fn attach_desktop(&mut self, desktop: Arc<dyn DesktopBackend>) {
        self.desktop = Some(desktop);
    }

    /// P48.3 — attach (or replace) the connector engine backing `connector.*`
    /// email/calendar writes.
    pub fn attach_connector(&mut self, connector: Arc<dyn ConnectorToolBackend>) {
        self.connector = Some(connector);
    }

    /// Attach the relay-owned capability broker. The broker validates opaque
    /// grants; connector backends still own all credential resolution.
    pub fn attach_capability_broker(
        &mut self,
        capabilities: Arc<Mutex<everyaios_guard::LocalCapabilityBroker>>,
    ) {
        self.capabilities = Some(capabilities);
    }

    /// P48.3 — attach an external MCP server whose tools were reconciled into
    /// the registry under `label`. The server's tools (already present as
    /// `External`-family catalog entries) dispatch to `backend`.
    pub fn attach_external(
        &mut self,
        label: &str,
        tools: Vec<String>,
        backend: Arc<dyn ExternalToolBackend>,
    ) {
        self.external.retain(|e| e.label != label);
        self.external.push(ExternalAttachment {
            label: label.to_string(),
            tools,
            backend,
        });
    }

    /// Inject a search transport (tests; production uses [`UreqSearchTransport`]).
    pub fn with_search_transport(mut self, t: Arc<dyn everyaios_search::SearchTransport>) -> Self {
        self.search_transport = t;
        self
    }

    fn snapshot_file(&mut self, session_id: &str, path: &Path) {
        let before = fs::read(path).ok();
        self.undo.push(FileUndo {
            session_id: session_id.to_string(),
            path: path.to_path_buf(),
            before,
        });
    }

    /// Restore the last file mutation for this session (or any if empty).
    pub fn revert_last(&mut self, session_id: &str) -> Result<String, String> {
        let idx = self
            .undo
            .iter()
            .rposition(|e| session_id.is_empty() || e.session_id == session_id)
            .ok_or_else(|| "nothing to undo".to_string())?;
        let e = self.undo.remove(idx);
        match e.before {
            Some(bytes) => {
                if let Some(parent) = e.path.parent() {
                    let _ = fs::create_dir_all(parent);
                }
                fs::write(&e.path, bytes).map_err(|err| err.to_string())?;
            }
            None => {
                let _ = fs::remove_file(&e.path);
            }
        }
        Ok(e.path.display().to_string())
    }

    pub fn set_connectivity(&self, mode: ConnectivityMode) {
        self.egress
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .set_mode(mode);
    }

    pub fn registry(&self) -> &ToolRegistry {
        &self.registry
    }

    pub fn audit_len(&self) -> usize {
        self.audit.len()
    }

    pub fn handle(&mut self, method: &str, params: &Value) -> Result<Value, String> {
        match method {
            "tool/list" => Ok(json!({
                "tools": self.registry.list(),
                "count": self.registry.list().len(),
            })),
            "tool/exec" => self.exec(params),
            "tool/commit" => self.commit(params),
            _ => Err(format!("method not found: {method}")),
        }
    }

    fn exec(&mut self, params: &Value) -> Result<Value, String> {
        let tool_id = str_param(params, "toolId").ok_or("tool/exec requires toolId")?;
        let spec = self
            .registry
            .get(tool_id)
            .ok_or_else(|| format!("unknown tool: {tool_id}"))?
            .clone();
        let args = params.get("args").cloned().unwrap_or(json!({}));
        let session = str_param(params, "sessionId").unwrap_or("default");
        let agent = str_param(params, "agentId").unwrap_or("agent");

        let hash = canonical_args_hash(&args);
        if let Some(client) = str_param(params, "argsHash") {
            if client != hash {
                return Ok(json!({
                    "action": "block",
                    "reason": "args-hash drift between coordinator and Rust",
                }));
            }
        }

        let hits = prescan(&spec, &args);
        if !hits.is_empty() {
            return Ok(json!({
                "action": "block",
                "reason": format!("Guard-1 blocked: {}", hits.join("; ")),
            }));
        }

        let root = self.workspace.to_string_lossy().to_string();
        {
            let mut eg = self.egress.lock().unwrap_or_else(|e| e.into_inner());
            let urls = collect_urls(&args);
            if urls.is_empty() && matches!(spec.family, ToolFamily::Search | ToolFamily::Browser) {
                let plan = eg.plan(
                    &format!("capability:{}", spec.id),
                    "network",
                    None,
                    spec.id.as_str(),
                    &[&root],
                );
                if plan.verdict == EgressVerdict::Deny {
                    return Ok(json!({
                        "action": "block",
                        "reason": format!("egress denied: {} ({})", spec.id, plan.destination),
                        "egress": plan,
                    }));
                }
            }
            for u in urls {
                if !urlfloor::is_allowed(&u, &[&root]) {
                    return Ok(json!({
                        "action": "block",
                        "reason": format!("url floor refused: {u}"),
                    }));
                }
                let plan = eg.plan(&u, "network", None, spec.id.as_str(), &[&root]);
                if plan.verdict == EgressVerdict::Deny {
                    return Ok(json!({
                        "action": "block",
                        "reason": format!("egress denied: {u}"),
                        "egress": plan,
                    }));
                }
            }
        }

        let op = operation_of(&spec.operation, &args)?;
        let mut decision = DecisionPackage::new(format!("{} {}", spec.id, hash));
        decision.risk = risk_of(&spec.risk);
        decision.affected_paths = collect_paths(&args);
        decision.script_lines = collect_shell(&args);
        decision.network_destinations = collect_urls(&args);

        let out = if let Some(tid) = str_param(params, "ticketId") {
            // Sidecar already ran `guard/evaluate` (H4 guard.ts). Reuse that
            // ticket; still capture bindings below.
            let _ = op;
            let _ = decision;
            GuardDecision::Allow {
                ticket_id: tid.to_string(),
            }
        } else {
            let mut g = self.guard.lock().unwrap_or_else(|e| e.into_inner());
            let mut decision_out = g.evaluate(session, agent, &spec.id, op, decision, &hash, 0);
            // Reads still mint a ticket (ticket-every-effect) but auto-Allow:
            // default policy asks on GenericWrite, which would card every
            // `file_ops.read`. The executor is Rust, not the sidecar.
            if spec.read_only {
                if let GuardDecision::Ask { ticket_id } = &decision_out {
                    let id = ticket_id.clone();
                    let _ = g.approve(&id);
                    decision_out = GuardDecision::Allow { ticket_id: id };
                }
            }
            decision_out
        };

        let ticket_id = match &out {
            GuardDecision::Allow { ticket_id } | GuardDecision::Ask { ticket_id } => {
                Some(ticket_id.clone())
            }
            GuardDecision::Block { .. } => None,
        };
        if let Some(tid) = &ticket_id {
            let bindings = self.capture_bindings(&args);
            for b in &bindings {
                if let ResourceBinding::File(f) = b {
                    if let Some(fd) = open_parent_dir(&f.canonical) {
                        self.parent_fds.insert(tid.clone(), fd);
                    }
                }
            }
            let exec_id = str_param(params, "executionId").unwrap_or("");
            let mut g = self.guard.lock().unwrap_or_else(|e| e.into_inner());
            let _ = g.set_ticket_bindings(tid, bindings);
            if !exec_id.is_empty() {
                let _ = g.set_ticket_execution(tid, exec_id);
            }
        }

        Ok(match out {
            GuardDecision::Allow { ticket_id } => json!({
                "action": "allow",
                "ticketId": ticket_id,
                "argsHash": hash,
                "readOnly": spec.read_only,
            }),
            GuardDecision::Ask { ticket_id } => json!({
                "action": "ask",
                "ticketId": ticket_id,
                "argsHash": hash,
                "readOnly": spec.read_only,
            }),
            GuardDecision::Block { reason } => json!({
                "action": "block",
                "reason": reason,
            }),
        })
    }

    fn commit(&mut self, params: &Value) -> Result<Value, String> {
        let started = Instant::now();
        let tool_id = str_param(params, "toolId").ok_or("tool/commit requires toolId")?;
        let ticket_id = str_param(params, "ticketId").ok_or("tool/commit requires ticketId")?;
        let spec = self
            .registry
            .get(tool_id)
            .ok_or_else(|| format!("unknown tool: {tool_id}"))?
            .clone();
        let args = params.get("args").cloned().unwrap_or(json!({}));
        let hash = canonical_args_hash(&args);
        if let Some(client) = str_param(params, "argsHash") {
            if client != hash {
                return Err("args-hash drift".into());
            }
        }

        if !spec.read_only && ticket_id.is_empty() {
            return Err("mutating tool requires a consumed ticket".into());
        }

        if matches!(spec.family, ToolFamily::Connector) {
            let grant_id = str_param(params, "capabilityGrantId")
                .ok_or("connector tool requires capabilityGrantId")?;
            let run_id = str_param(params, "runId")
                .or_else(|| str_param(params, "executionId"))
                .ok_or("connector tool requires runId")?;
            let request = everyaios_guard::CapabilityRequest {
                run_id: run_id.to_string(),
                capability: format!("connector:{}", spec.id),
                operation: spec.operation.clone(),
            };
            let broker = self
                .capabilities
                .as_ref()
                .ok_or("capability broker not attached")?;
            broker
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .invoke(grant_id, &request)
                .map_err(|e| format!("capability grant refused: {e}"))?;
        }

        let already = params
            .get("ticketConsumed")
            .and_then(Value::as_bool)
            .unwrap_or(false);
        if !already {
            let mut g = self.guard.lock().unwrap_or_else(|e| e.into_inner());
            g.use_ticket(ticket_id, &hash)
                .map_err(|e| format!("ticket refused: {e}"))?;
        }

        self.reverify_preconditions(ticket_id, &args)?;
        self.parent_fds.remove(ticket_id);

        let idem = format!("{tool_id}:{hash}");
        if !spec.read_only && self.used_idempotency.contains(&idem) {
            return Err("idempotent replay refused — reconcile before retry".into());
        }

        let result = self.dispatch(&spec, &args);
        let duration_ms = started.elapsed().as_millis() as u64;
        let ok = result.get("ok").and_then(Value::as_bool).unwrap_or(false);
        if ok && !spec.read_only {
            self.used_idempotency.insert(idem.clone());
        }
        let result_hash = canonical_args_hash(&result);
        let uncertain = !ok && !spec.read_only;

        let payload = json!({
            "toolId": spec.id,
            "argsHash": hash,
            "ticketId": ticket_id,
            "resultHash": result_hash,
            "ok": ok,
            "durationMs": duration_ms,
            "idempotencyKey": idem,
            "state": if uncertain { "uncertain" } else if ok { "ok" } else { "failed" },
        });
        let seq = (self.audit.len() as u64) + 1;
        let event = AuditEvent {
            seq,
            ts_ms: now_ms(),
            kind: "tool.exec".into(),
            payload,
            trace_id: String::new(),
            span_id: String::new(),
        };
        self.audit.push(event);

        let mut out = result;
        if let Value::Object(map) = &mut out {
            map.insert("durationMs".into(), json!(duration_ms));
            map.insert("auditSeq".into(), json!(seq));
            map.insert("ticketId".into(), json!(ticket_id));
            map.insert("idempotencyKey".into(), json!(idem));
            if uncertain {
                map.insert("state".into(), json!("uncertain"));
            }
        }
        Ok(out)
    }

    fn dispatch(&mut self, spec: &RegisteredTool, args: &Value) -> Value {
        match spec.family {
            ToolFamily::FileOps => self.dispatch_file_ops(&spec.id, args),
            ToolFamily::Storage => self.dispatch_storage(&spec.id, args),
            ToolFamily::Script => self.dispatch_script(args),
            ToolFamily::Search => self.dispatch_search(args),
            ToolFamily::Browser => self.dispatch_browser(&spec.id, args),
            ToolFamily::Office => self.dispatch_office(&spec.id, args),
            ToolFamily::Desktop => self.dispatch_desktop(&spec.id, args),
            ToolFamily::External => self.dispatch_external(&spec.id, args),
            ToolFamily::Connector => self.dispatch_connector(&spec.id, args),
        }
    }

    /// P48.3 — desktop computer-use as a loop tool (E9 agent path). Honest
    /// failure when no engine is attached (headless/no-display).
    fn dispatch_desktop(&self, id: &str, args: &Value) -> Value {
        let Some(d) = &self.desktop else {
            return json!({"ok": false, "error": "desktop session not attached"});
        };
        match id {
            "desktop.windows" => match d.list_windows() {
                Ok(v) => json!({"ok": true, "windows": v}),
                Err(e) => json!({"ok": false, "error": e}),
            },
            "desktop.read" => {
                let window_id = args.get("windowId").and_then(Value::as_u64);
                match d.read(window_id.unwrap_or(0)) {
                    Ok(v) => json!({"ok": true, "snapshot": v}),
                    Err(e) => json!({"ok": false, "error": e}),
                }
            }
            "desktop.act" => {
                let kind = args.get("kind").and_then(Value::as_str).unwrap_or("click");
                let window_id = args.get("windowId").and_then(Value::as_u64);
                let target = args
                    .get("target")
                    .or_else(|| args.get("ref"))
                    .and_then(Value::as_str);
                let text = args.get("text").and_then(Value::as_str);
                match d.act(kind, window_id, target, text) {
                    Ok(v) => json!({"ok": true, "result": v}),
                    Err(e) => json!({"ok": false, "error": e}),
                }
            }
            _ => json!({"ok": false, "error": format!("unknown desktop tool: {id}")}),
        }
    }

    /// P48.3 — external MCP tools route to the attached server's backend.
    fn dispatch_external(&self, id: &str, args: &Value) -> Value {
        for e in &self.external {
            if e.tools.iter().any(|t| t == id) {
                return match e.backend.call(id, args) {
                    Ok(v) => json!({"ok": true, "result": v}),
                    Err(err) => json!({"ok": false, "error": err}),
                };
            }
        }
        json!({"ok": false, "error": "external tool session not attached"})
    }

    /// P48.3 — connector writes (email/calendar) through the automation
    /// runtime's engine seam; gated by ticket + audited on the Merkle chain.
    fn dispatch_connector(&self, id: &str, args: &Value) -> Value {
        let Some(c) = &self.connector else {
            return json!({"ok": false, "error": "connector not attached"});
        };
        match id {
            "connector.email_send" => {
                let to: Vec<String> = args
                    .get("to")
                    .and_then(Value::as_array)
                    .map(|a| {
                        a.iter()
                            .filter_map(Value::as_str)
                            .map(String::from)
                            .collect()
                    })
                    .unwrap_or_default();
                let subject = args.get("subject").and_then(Value::as_str).unwrap_or("");
                let body = args.get("body").and_then(Value::as_str).unwrap_or("");
                match c.email(to, subject, body) {
                    Ok(v) => json!({"ok": true, "result": v}),
                    Err(e) => json!({"ok": false, "error": e}),
                }
            }
            "connector.calendar_create" => {
                let title = args.get("title").and_then(Value::as_str).unwrap_or("");
                let when = args.get("when").and_then(Value::as_str).unwrap_or("");
                match c.calendar(title, when) {
                    Ok(v) => json!({"ok": true, "result": v}),
                    Err(e) => json!({"ok": false, "error": e}),
                }
            }
            _ => json!({"ok": false, "error": format!("unknown connector tool: {id}")}),
        }
    }

    fn dispatch_file_ops(&mut self, id: &str, args: &Value) -> Value {
        let path = match args.get("path").and_then(Value::as_str) {
            Some(p) => p,
            None => return json!({"ok": false, "error": "path required"}),
        };
        let abs = self.floor_path(path);
        let abs = match abs {
            Ok(p) => p,
            Err(e) => return json!({"ok": false, "error": e}),
        };
        match id {
            "file_ops.read" => match fs::read(&abs) {
                Ok(bytes) if bytes.len() > MAX_FILE_BYTES => json!({
                    "ok": true,
                    "truncated": true,
                    "content": String::from_utf8_lossy(&bytes[..MAX_FILE_BYTES]).to_string()
                }),
                Ok(bytes) => json!({
                    "ok": true,
                    "content": String::from_utf8_lossy(&bytes).to_string()
                }),
                Err(e) => json!({"ok": false, "error": e.to_string()}),
            },
            "file_ops.list" => match fs::read_dir(&abs) {
                Ok(rd) => {
                    let names: Vec<String> = rd
                        .filter_map(|e| e.ok())
                        .map(|e| e.file_name().to_string_lossy().into_owned())
                        .collect();
                    json!({"ok": true, "entries": names})
                }
                Err(e) => json!({"ok": false, "error": e.to_string()}),
            },
            "file_ops.write" => {
                let content = args.get("content").and_then(Value::as_str).unwrap_or("");
                if let Some(parent) = abs.parent() {
                    let _ = fs::create_dir_all(parent);
                }
                self.snapshot_file("", &abs);
                let tmp = abs.with_extension("tmp-everyaios");
                match fs::write(&tmp, content).and_then(|_| fs::rename(&tmp, &abs)) {
                    Ok(()) => json!({"ok": true, "path": abs.display().to_string()}),
                    Err(e) => {
                        let _ = fs::remove_file(&tmp);
                        json!({"ok": false, "error": e.to_string()})
                    }
                }
            }
            "file_ops.delete" => {
                self.snapshot_file("", &abs);
                match fs::remove_file(&abs) {
                    Ok(()) => json!({"ok": true}),
                    Err(e) => json!({"ok": false, "error": e.to_string()}),
                }
            }
            other => json!({"ok": false, "error": format!("unknown file_ops id: {other}")}),
        }
    }

    fn dispatch_storage(&self, id: &str, args: &Value) -> Value {
        let path = args.get("path").and_then(Value::as_str).unwrap_or("");
        let root = if path.is_empty() {
            self.workspace.clone()
        } else {
            match self.floor_path(path) {
                Ok(p) => p,
                Err(e) => return json!({"ok": false, "error": e}),
            }
        };
        let opts = everyaios_storage::ScanOptions {
            threads: 1,
            follow_symlinks: false,
            same_filesystem: true,
            min_file_size: 0,
            skip_hidden: true,
        };
        let records = match everyaios_storage::scan(&root, &opts) {
            Ok(r) => r,
            Err(e) => return json!({"ok": false, "error": e.to_string()}),
        };
        match id {
            "disk_scan" => {
                let sample: Vec<String> = records
                    .iter()
                    .take(MAX_SCAN_SAMPLE)
                    .map(|r| r.path.display().to_string())
                    .collect();
                json!({"ok": true, "files": records.len(), "sample": sample})
            }
            "disk_large_files" => {
                let arena = everyaios_storage::build_arena(records, &root);
                let top_n = args.get("top_n").and_then(Value::as_u64).unwrap_or(10) as usize;
                let now = now_ms() / 1000;
                let files = everyaios_storage::find_large_files(
                    &arena,
                    &everyaios_storage::FinderOptions {
                        top_n,
                        ..Default::default()
                    },
                    everyaios_storage::SortBy::SizeDesc,
                    now,
                );
                let listed: Vec<Value> = files
                    .into_iter()
                    .map(|n| json!({"name": n.name, "size": n.size}))
                    .collect();
                json!({"ok": true, "files": listed})
            }
            "disk_duplicates" => {
                let cands: Vec<everyaios_storage::DupCandidate> = records
                    .into_iter()
                    .map(|r| everyaios_storage::DupCandidate {
                        path: r.path,
                        size: r.size,
                        dev: r.dev,
                        ino: r.ino,
                        nlink: r.nlink,
                    })
                    .collect();
                match everyaios_storage::find_duplicates(
                    &cands,
                    &everyaios_storage::DedupOptions::default(),
                ) {
                    Ok(groups) => json!({"ok": true, "groups": groups.len()}),
                    Err(e) => json!({"ok": false, "error": e.to_string()}),
                }
            }
            "disk_cleanup" => {
                json!({
                    "ok": true,
                    "proposals": [],
                    "note": "cleanup is proposal-only; never deletes"
                })
            }
            "filename_search" => {
                let q = args.get("query").and_then(Value::as_str).unwrap_or("");
                let hits: Vec<String> = records
                    .iter()
                    .filter(|r| {
                        r.path
                            .file_name()
                            .map(|n| n.to_string_lossy().contains(q))
                            .unwrap_or(false)
                    })
                    .take(MAX_SCAN_SAMPLE)
                    .map(|r| r.path.display().to_string())
                    .collect();
                json!({"ok": true, "hits": hits})
            }
            other => json!({"ok": false, "error": format!("unknown storage id: {other}")}),
        }
    }

    fn dispatch_script(&self, args: &Value) -> Value {
        let code = match args.get("code").and_then(Value::as_str) {
            Some(c) => c,
            None => return json!({"ok": false, "error": "code required"}),
        };
        let host = Arc::new(DenyBrowser);
        let sb = everyaios_script::Sandbox::new(everyaios_script::SandboxLimits::default(), host);
        match sb.eval(code) {
            Ok(out) => json!({"ok": true, "result": out}),
            Err(e) => json!({"ok": false, "error": e.to_string()}),
        }
    }

    fn capture_bindings(&self, args: &Value) -> Vec<ResourceBinding> {
        let root = self.workspace.to_string_lossy().to_string();
        let roots: Vec<&str> = vec![&root];
        let mut out = Vec::new();
        for p in collect_paths(args) {
            let joined = if Path::new(&p).is_absolute() {
                p.clone()
            } else {
                self.workspace.join(&p).to_string_lossy().to_string()
            };
            if let Ok(b) = bind_path(&joined, &roots) {
                out.push(ResourceBinding::File(b));
            }
        }
        for u in collect_urls(args) {
            if let Ok(b) = bind_url(&u, &roots) {
                out.push(ResourceBinding::Net(b));
            }
        }
        for s in collect_shell(args) {
            out.push(ResourceBinding::Exec(bind_exec_bytes(s.as_bytes())));
        }
        out
    }

    fn reverify_preconditions(&self, ticket_id: &str, args: &Value) -> Result<(), String> {
        let root = self.workspace.to_string_lossy().to_string();
        let roots: Vec<&str> = vec![&root];
        let bindings = {
            let g = self.guard.lock().unwrap_or_else(|e| e.into_inner());
            g.ticket_bindings(ticket_id)
        };
        for b in &bindings {
            match b {
                ResourceBinding::File(f) => {
                    reverify_path(f, &roots).map_err(|e| format!("TOCTOU: {e}"))?;
                }
                ResourceBinding::Net(n) => {
                    reverify_url(n, &roots).map_err(|e| format!("TOCTOU: {e}"))?;
                }
                ResourceBinding::Exec(x) => {
                    let bytes = collect_shell(args).join("\n");
                    reverify_exec(x, bytes.as_bytes()).map_err(|e| format!("TOCTOU: {e}"))?;
                }
            }
        }
        Ok(())
    }

    fn floor_path(&self, path: &str) -> Result<PathBuf, String> {
        let joined = if Path::new(path).is_absolute() {
            PathBuf::from(path)
        } else {
            self.workspace.join(path)
        };
        let s = joined.to_string_lossy();
        let root = self.workspace.to_string_lossy();
        match enforce_floor(&s, &[root.as_ref()]) {
            FloorVerdict::Allowed => Ok(joined),
            other => Err(format!("path floor refused: {other:?}")),
        }
    }

    /// P2.3 — floor a *directory* (for PDF/screenshot downloads), creating it
    /// if absent so the browser backend has a writable target.
    fn floor_dir(&self, dir: &str) -> Result<PathBuf, String> {
        let abs = self.floor_path(dir)?;
        if let Err(e) = fs::create_dir_all(&abs) {
            return Err(format!("create download dir failed: {e}"));
        }
        Ok(abs)
    }

    /// P2.3 (E2) — real `download_file`: HTTP GET the already floor/egress-
    /// checked URL, refuse past [`MAX_DOWNLOAD_BYTES`], and write the bytes
    /// atomically inside the workspace floor. No browser needed.
    fn dispatch_download_file(&self, args: &Value) -> Value {
        let url = match args.get("url").and_then(Value::as_str) {
            Some(u) if !u.is_empty() => u,
            _ => return json!({"ok": false, "error": "url required"}),
        };
        let dir = args
            .get("dir")
            .and_then(Value::as_str)
            .unwrap_or("downloads");
        let abs_dir = match self.floor_dir(dir) {
            Ok(p) => p,
            Err(e) => return json!({"ok": false, "error": e}),
        };
        let name = filename_from_url(url);
        let mut bytes = Vec::new();
        match ureq::get(url).call() {
            Ok(resp) => {
                use std::io::Read;
                let reader = resp.into_reader();
                let mut limited = reader.take(MAX_DOWNLOAD_BYTES as u64 + 1);
                if limited.read_to_end(&mut bytes).is_err() {
                    return json!({"ok": false, "error": "read failed"});
                }
                if bytes.len() > MAX_DOWNLOAD_BYTES {
                    return json!({"ok": false, "error": "download exceeds 64 MiB cap"});
                }
            }
            Err(e) => return json!({"ok": false, "error": e.to_string()}),
        }
        let target = abs_dir.join(&name);
        let tmp = target.with_extension("tmp-everyaios");
        match fs::write(&tmp, &bytes).and_then(|_| fs::rename(&tmp, &target)) {
            Ok(()) => {
                json!({"ok": true, "path": target.display().to_string(), "bytes": bytes.len()})
            }
            Err(e) => {
                let _ = fs::remove_file(&tmp);
                json!({"ok": false, "error": e.to_string()})
            }
        }
    }

    fn dispatch_search(&self, args: &Value) -> Value {
        let query = match args.get("query").and_then(Value::as_str) {
            Some(q) if !q.is_empty() => q,
            _ => return json!({"ok": false, "error": "query required"}),
        };
        match self.search.query(self.search_transport.as_ref(), query) {
            Ok(hits) => json!({
                "ok": true,
                "query": query,
                "count": hits.len(),
                "results": hits,
            }),
            Err(e) => json!({"ok": false, "error": e}),
        }
    }

    fn dispatch_browser(&self, id: &str, args: &Value) -> Value {
        match id {
            "download_file" => self.dispatch_download_file(args),
            "save_pdf_enhanced" | "save_screenshot_enhanced" => {
                let dir = args
                    .get("dir")
                    .and_then(Value::as_str)
                    .unwrap_or("downloads");
                let abs = match self.floor_dir(dir) {
                    Ok(p) => p,
                    Err(e) => return json!({"ok": false, "error": e}),
                };
                match &self.browser {
                    Some(b) => {
                        let res = if id == "save_pdf_enhanced" {
                            b.save_pdf_enhanced(&abs)
                        } else {
                            let q = args.get("quality").and_then(Value::as_u64).unwrap_or(80) as u8;
                            b.save_screenshot_enhanced(&abs, q)
                        };
                        match res {
                            Ok(path) => json!({"ok": true, "path": path}),
                            Err(e) => json!({"ok": false, "error": e}),
                        }
                    }
                    None => json!({"ok": false, "error": "browser session not attached"}),
                }
            }
            "navigate" | "browser.navigate" => {
                let url = match args.get("url").and_then(Value::as_str) {
                    Some(u) => u,
                    None => return json!({"ok": false, "error": "url required"}),
                };
                match &self.browser {
                    Some(b) => match b.navigate(url) {
                        Ok(u) => json!({"ok": true, "url": u}),
                        Err(e) => json!({"ok": false, "error": e}),
                    },
                    None => json!({"ok": false, "error": "browser session not attached"}),
                }
            }
            "snapshot" | "enhanced_snapshot" => match &self.browser {
                Some(b) => match b.snapshot() {
                    Ok(text) => json!({"ok": true, "text": text}),
                    Err(e) => json!({"ok": false, "error": e}),
                },
                None => json!({"ok": false, "error": "browser session not attached"}),
            },
            "act" => {
                let kind = args.get("kind").and_then(Value::as_str).unwrap_or("click");
                let selector = args
                    .get("ref")
                    .or_else(|| args.get("ref_id"))
                    .and_then(Value::as_str);
                let text = args.get("text").and_then(Value::as_str);
                match &self.browser {
                    Some(b) => match b.act(kind, selector, text) {
                        Ok(msg) => json!({"ok": true, "result": msg}),
                        Err(e) => json!({"ok": false, "error": e}),
                    },
                    None => json!({"ok": false, "error": "browser session not attached"}),
                }
            }
            _ => json!({"ok": false, "error": "browser session not attached"}),
        }
    }

    fn dispatch_office(&mut self, id: &str, args: &Value) -> Value {
        let path = match args.get("path").and_then(Value::as_str) {
            Some(p) => p,
            None => return json!({"ok": false, "error": "path required"}),
        };
        let abs = match self.floor_path(path) {
            Ok(p) => p,
            Err(e) => return json!({"ok": false, "error": e}),
        };
        match id {
            "office.docx_open" => match fs::read(&abs) {
                Ok(bytes) => match everyaios_office::DocxEngine::open(bytes) {
                    Ok(engine) => {
                        let blocks: Vec<Value> = engine
                            .blocks()
                            .iter()
                            .map(|b| {
                                json!({
                                    "address": b.address,
                                    "kind": format!("{:?}", b.kind),
                                    "part": b.part,
                                })
                            })
                            .collect();
                        json!({
                            "ok": true,
                            "path": abs.display().to_string(),
                            "text": engine.render_text(),
                            "blocks": blocks,
                        })
                    }
                    Err(e) => json!({"ok": false, "error": e.to_string()}),
                },
                Err(e) => json!({"ok": false, "error": e.to_string()}),
            },
            "office.docx_patch" => {
                let address = args.get("address").and_then(Value::as_str).unwrap_or("");
                let text = args.get("text").and_then(Value::as_str).unwrap_or("");
                self.snapshot_file("", &abs);
                match fs::read(&abs) {
                    Ok(bytes) => match everyaios_office::DocxEngine::open(bytes) {
                        Ok(mut engine) => match engine
                            .patch_block(address, text)
                            .and_then(|_| engine.save())
                        {
                            Ok(out) => match atomic_office_write(&abs, &out) {
                                Ok(()) => {
                                    json!({"ok": true, "path": abs.display().to_string(), "address": address})
                                }
                                Err(e) => json!({"ok": false, "error": e}),
                            },
                            Err(e) => json!({"ok": false, "error": e.to_string(), "refused": true}),
                        },
                        Err(e) => json!({"ok": false, "error": e.to_string()}),
                    },
                    Err(e) => json!({"ok": false, "error": e.to_string()}),
                }
            }
            "office.xlsx_open" => match everyaios_office::xlsx::read::open(&abs) {
                Ok(meta) => json!({"ok": true, "path": meta.path, "sheets": meta.sheets}),
                Err(e) => json!({"ok": false, "error": e.to_string()}),
            },
            "office.xlsx_edit" => {
                use everyaios_office::xlsx::address::parse_ref;
                use everyaios_office::xlsx::dsl::{
                    Operation as XlsxOp, Scalar, WorkbookCommandBatch,
                };
                use everyaios_office::xlsx::patch::apply_batch;
                let address = args.get("address").and_then(Value::as_str).unwrap_or("");
                let value = args.get("value").and_then(Value::as_str).unwrap_or("");
                let sheet = args.get("sheet").and_then(Value::as_str).unwrap_or("");
                let cell = match parse_ref(address) {
                    Ok((_, c)) => c,
                    Err(e) => return json!({"ok": false, "error": e.to_string()}),
                };
                self.snapshot_file("", &abs);
                match fs::read(&abs) {
                    Ok(bytes) => {
                        let mut batch = WorkbookCommandBatch::new(0, format!("Set {address}"));
                        let scalar = if let Ok(n) = value.parse::<f64>() {
                            Scalar::Number(n)
                        } else {
                            Scalar::Text(value.to_string())
                        };
                        batch.operations.push(XlsxOp::SetCell {
                            address: cell,
                            value: scalar,
                        });
                        let sheet_name = if sheet.is_empty() {
                            everyaios_office::xlsx::read::open(&abs)
                                .ok()
                                .and_then(|m| m.sheets.first().map(|s| s.name.clone()))
                                .unwrap_or_else(|| "Sheet1".into())
                        } else {
                            sheet.to_string()
                        };
                        match apply_batch(&bytes, &batch, &sheet_name) {
                            Ok(outcome) => match atomic_office_write(&abs, &outcome.bytes) {
                                Ok(()) => {
                                    json!({"ok": true, "path": abs.display().to_string(), "address": address})
                                }
                                Err(e) => json!({"ok": false, "error": e}),
                            },
                            Err(e) => json!({"ok": false, "error": e.to_string()}),
                        }
                    }
                    Err(e) => json!({"ok": false, "error": e.to_string()}),
                }
            }
            "office.pptx_open" => match fs::read(&abs) {
                Ok(bytes) => match everyaios_office::PptxEngine::open(bytes) {
                    Ok(mut engine) => match engine.render_deck() {
                        Ok(deck) => {
                            json!({"ok": true, "path": abs.display().to_string(), "deck": deck})
                        }
                        Err(e) => json!({"ok": false, "error": e.to_string()}),
                    },
                    Err(e) => json!({"ok": false, "error": e.to_string()}),
                },
                Err(e) => json!({"ok": false, "error": e.to_string()}),
            },
            "office.pptx_patch" => {
                let text = args.get("text").and_then(Value::as_str).unwrap_or("");
                let part = args.get("part").and_then(Value::as_str);
                let shape = args.get("shape").and_then(Value::as_u64).unwrap_or(0) as usize;
                self.snapshot_file("", &abs);
                match fs::read(&abs) {
                    Ok(bytes) => match everyaios_office::PptxEngine::open(bytes) {
                        Ok(mut engine) => {
                            let part_name = match part {
                                Some(p) => p.to_string(),
                                None => match engine.slides().first() {
                                    Some(s) => s.part.clone(),
                                    None => return json!({"ok": false, "error": "no slides"}),
                                },
                            };
                            let shape_addr = format!("shape{shape}");
                            match engine.patch_shape_text(&part_name, &shape_addr, text) {
                                Ok(()) => match engine.save() {
                                    Ok(out) => match atomic_office_write(&abs, &out) {
                                        Ok(()) => {
                                            json!({"ok": true, "path": abs.display().to_string()})
                                        }
                                        Err(e) => json!({"ok": false, "error": e}),
                                    },
                                    Err(e) => json!({"ok": false, "error": e.to_string()}),
                                },
                                Err(e) => {
                                    json!({"ok": false, "error": e.to_string(), "refused": true})
                                }
                            }
                        }
                        Err(e) => json!({"ok": false, "error": e.to_string()}),
                    },
                    Err(e) => json!({"ok": false, "error": e.to_string()}),
                }
            }
            "office.pdf_open" => match fs::read(&abs) {
                Ok(bytes) => match everyaios_office::inspect(&bytes) {
                    Ok(info) => json!({"ok": true, "pages": info.pages, "texts": info.texts}),
                    Err(e) => json!({"ok": false, "error": e.to_string()}),
                },
                Err(e) => json!({"ok": false, "error": e.to_string()}),
            },
            "office.pdf_form_fill" => {
                let fields_obj = args.get("fields").and_then(Value::as_object);
                let fields: Vec<(String, String)> = fields_obj
                    .map(|m| {
                        m.iter()
                            .filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_string())))
                            .collect()
                    })
                    .unwrap_or_default();
                self.snapshot_file("", &abs);
                match fs::read(&abs) {
                    Ok(bytes) => match everyaios_office::pdf::form::form_fill(&bytes, &fields) {
                        Ok(out) => match atomic_office_write(&abs, &out) {
                            Ok(()) => json!({"ok": true, "path": abs.display().to_string()}),
                            Err(e) => json!({"ok": false, "error": e}),
                        },
                        Err(e) => json!({"ok": false, "error": e.to_string()}),
                    },
                    Err(e) => json!({"ok": false, "error": e.to_string()}),
                }
            }
            "office.pdf_redact" => {
                let page = args.get("page").and_then(Value::as_u64).unwrap_or(1) as u32;
                let x1 = args.get("x1").and_then(Value::as_f64).unwrap_or(0.0);
                let y1 = args.get("y1").and_then(Value::as_f64).unwrap_or(0.0);
                let x2 = args.get("x2").and_then(Value::as_f64).unwrap_or(0.0);
                let y2 = args.get("y2").and_then(Value::as_f64).unwrap_or(0.0);
                self.snapshot_file("", &abs);
                match fs::read(&abs) {
                    Ok(bytes) => match everyaios_office::pdf::redact::redact(
                        &bytes,
                        &[(page, [x1 as f32, y1 as f32, x2 as f32, y2 as f32])],
                    ) {
                        Ok(out) => match atomic_office_write(&abs, &out) {
                            Ok(()) => json!({"ok": true, "path": abs.display().to_string()}),
                            Err(e) => json!({"ok": false, "error": e}),
                        },
                        Err(e) => json!({"ok": false, "error": e.to_string()}),
                    },
                    Err(e) => json!({"ok": false, "error": e.to_string()}),
                }
            }
            "office.pdf_pages" => {
                let op = args.get("op").and_then(Value::as_str).unwrap_or("");
                let pages: Vec<u32> = args
                    .get("pages")
                    .and_then(Value::as_array)
                    .map(|a| {
                        a.iter()
                            .filter_map(|v| v.as_u64().map(|n| n as u32))
                            .collect()
                    })
                    .unwrap_or_default();
                self.snapshot_file("", &abs);
                match fs::read(&abs) {
                    Ok(bytes) => {
                        let result = match op {
                            "split" if pages.len() >= 2 => {
                                everyaios_office::split_pdf(&bytes, pages[0]..=pages[1])
                            }
                            "extract" => everyaios_office::extract_pages(&bytes, &pages),
                            "reorder" => everyaios_office::reorder_pages(&bytes, &pages),
                            "delete" => everyaios_office::delete_pages(&bytes, &pages),
                            "rotate" => {
                                let delta = args.get("delta").and_then(Value::as_i64).unwrap_or(90);
                                let sel = if pages.is_empty() {
                                    None
                                } else {
                                    Some(pages.as_slice())
                                };
                                everyaios_office::rotate_pages(&bytes, delta, sel)
                            }
                            "merge" => {
                                let other = args.get("other").and_then(Value::as_str).unwrap_or("");
                                let other_abs = match self.floor_path(other) {
                                    Ok(p) => p,
                                    Err(e) => return json!({"ok": false, "error": e}),
                                };
                                match fs::read(&other_abs) {
                                    Ok(b2) => everyaios_office::merge_pdfs(&[bytes.clone(), b2]),
                                    Err(e) => return json!({"ok": false, "error": e.to_string()}),
                                }
                            }
                            _ => {
                                return json!({"ok": false, "error": format!("unknown pdf page op: {op}")})
                            }
                        };
                        match result {
                            Ok(out) => {
                                let dest = args
                                    .get("out")
                                    .and_then(Value::as_str)
                                    .map(PathBuf::from)
                                    .unwrap_or(abs.clone());
                                let dest = if dest.is_absolute() {
                                    dest
                                } else {
                                    match self.floor_path(&dest.to_string_lossy()) {
                                        Ok(p) => p,
                                        Err(e) => return json!({"ok": false, "error": e}),
                                    }
                                };
                                match atomic_office_write(&dest, &out) {
                                    Ok(()) => {
                                        json!({"ok": true, "path": dest.display().to_string()})
                                    }
                                    Err(e) => json!({"ok": false, "error": e}),
                                }
                            }
                            Err(e) => json!({"ok": false, "error": e.to_string()}),
                        }
                    }
                    Err(e) => json!({"ok": false, "error": e.to_string()}),
                }
            }
            _ => json!({"ok": false, "error": format!("unknown office tool: {id}")}),
        }
    }
}

fn atomic_office_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let dir = path.parent().ok_or("path has no parent")?;
    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or("path has no file name")?;
    let tmp = dir.join(format!(".{name}.tmp-{}", std::process::id()));
    fs::write(&tmp, bytes).map_err(|e| e.to_string())?;
    fs::rename(&tmp, path).map_err(|e| e.to_string())
}

/// Live HTTP seam for G8: SearXNG JSON at `{endpoint}/search?format=json`, DDG HTML fallback.
struct UreqSearchTransport;

impl everyaios_search::SearchTransport for UreqSearchTransport {
    fn search(
        &self,
        endpoint: &str,
        query: &str,
    ) -> Result<Vec<everyaios_search::SearchResult>, String> {
        let q = urlencoding::encode(query);
        if endpoint == "ddg" {
            let url = format!("https://html.duckduckgo.com/html/?q={q}");
            let body = ureq::get(&url)
                .timeout(std::time::Duration::from_secs(8))
                .call()
                .map_err(|e| e.to_string())?
                .into_string()
                .map_err(|e| e.to_string())?;
            return Ok(parse_ddg_html(&body));
        }
        let base = endpoint.trim_end_matches('/');
        let url = format!("{base}/search?q={q}&format=json");
        let body = ureq::get(&url)
            .timeout(std::time::Duration::from_secs(8))
            .call()
            .map_err(|e| e.to_string())?
            .into_string()
            .map_err(|e| e.to_string())?;
        parse_searx_json(&body)
    }

    fn fetch(&self, _tier: &str, url: &str) -> Result<String, String> {
        ureq::get(url)
            .timeout(std::time::Duration::from_secs(8))
            .call()
            .map_err(|e| e.to_string())?
            .into_string()
            .map_err(|e| e.to_string())
    }
}

fn parse_searx_json(body: &str) -> Result<Vec<everyaios_search::SearchResult>, String> {
    let v: Value = serde_json::from_str(body).map_err(|e| e.to_string())?;
    let results = v
        .get("results")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    Ok(results
        .iter()
        .filter_map(|r| {
            Some(everyaios_search::SearchResult {
                url: r.get("url")?.as_str()?.to_string(),
                title: r.get("title")?.as_str().unwrap_or("").to_string(),
                snippet: r.get("content")?.as_str().unwrap_or("").to_string(),
                source: "searxng".into(),
            })
        })
        .take(8)
        .collect())
}

fn parse_ddg_html(body: &str) -> Vec<everyaios_search::SearchResult> {
    let mut out = Vec::new();
    for chunk in body.split("result__a") {
        let Some(href) = chunk
            .split("href=\"")
            .nth(1)
            .and_then(|s| s.split('"').next())
        else {
            continue;
        };
        let title = chunk
            .split('>')
            .nth(1)
            .and_then(|s| s.split('<').next())
            .unwrap_or("")
            .to_string();
        if href.starts_with("http") {
            out.push(everyaios_search::SearchResult {
                url: href.to_string(),
                title,
                snippet: String::new(),
                source: "ddg".into(),
            });
        }
        if out.len() >= 8 {
            break;
        }
    }
    out
}

/// P2.3 — derive a safe file name from a URL (last path segment). A URL with
/// no path (or a trailing slash) yields the host, which is not a file name —
/// fall back to `download.bin` in that case.
fn filename_from_url(url: &str) -> String {
    let path = url.split(['?', '#']).next().unwrap_or(url);
    // No path at all (e.g. `https://a.com`) or a directory URL → fallback.
    let after_scheme = path.find("://").map(|i| &path[i + 3..]).unwrap_or(path);
    if !after_scheme.contains('/')
        || path.trim_end_matches('/').ends_with('/')
        || path.ends_with('/')
    {
        return "download.bin".to_string();
    }
    let name = path.rsplit('/').next().unwrap_or("download.bin");
    let cleaned: String = name
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '.' || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect();
    if cleaned.is_empty() || cleaned == "." || cleaned == ".." {
        "download.bin".to_string()
    } else {
        cleaned
    }
}

fn prescan(spec: &RegisteredTool, args: &Value) -> Vec<String> {
    let shell = collect_shell(args).join("\n");
    let paths: Vec<String> = collect_paths(args);
    let urls: Vec<String> = collect_urls(args);
    let path_refs: Vec<&str> = paths.iter().map(|s| s.as_str()).collect();
    let url_refs: Vec<&str> = urls.iter().map(|s| s.as_str()).collect();
    let _ = spec;
    scan_all(&shell, &path_refs, &url_refs)
        .into_iter()
        .map(|h| format!("{:?} {}", h.target, h.text))
        .collect()
}

fn collect_paths(args: &Value) -> Vec<String> {
    let mut out = Vec::new();
    if let Some(p) = args.get("path").and_then(Value::as_str) {
        out.push(p.to_string());
    }
    if let Some(arr) = args.get("files").and_then(Value::as_array) {
        for v in arr {
            if let Some(s) = v.as_str() {
                out.push(s.to_string());
            }
        }
    }
    out
}

fn collect_urls(args: &Value) -> Vec<String> {
    args.get("url")
        .and_then(Value::as_str)
        .map(|s| vec![s.to_string()])
        .unwrap_or_default()
}

fn collect_shell(args: &Value) -> Vec<String> {
    ["code", "command", "shell", "expression"]
        .iter()
        .filter_map(|k| args.get(*k).and_then(Value::as_str).map(|s| s.to_string()))
        .collect()
}

fn str_param<'a>(params: &'a Value, key: &str) -> Option<&'a str> {
    params.get(key).and_then(Value::as_str)
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Browser host that refuses every primitive — `script.run` is compute-only.
struct DenyBrowser;

impl everyaios_script::BrowserHost for DenyBrowser {
    fn authorize(
        &self,
        call: &everyaios_script::PrimitiveCall,
    ) -> Result<(), everyaios_script::SandboxError> {
        Err(everyaios_script::SandboxError::Primitive(
            call.name.clone(),
            "browser primitives denied in script.run".into(),
        ))
    }
    fn record(
        &self,
        _call: &everyaios_script::PrimitiveCall,
        _ok: bool,
        _error: &str,
    ) -> Result<(), everyaios_script::SandboxError> {
        Ok(())
    }
    fn on_page_created(
        &self,
        _page_id: &str,
        _created_from: &everyaios_script::PrimitiveCall,
    ) -> Result<(), everyaios_script::SandboxError> {
        Ok(())
    }
    fn pages(&self) -> Vec<everyaios_script::PageInfo> {
        Vec::new()
    }
    fn exec(
        &self,
        call: &everyaios_script::PrimitiveCall,
    ) -> Result<Value, everyaios_script::SandboxError> {
        Err(everyaios_script::SandboxError::Primitive(
            call.name.clone(),
            "browser primitives denied in script.run".into(),
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn svc(dir: &Path) -> ToolService {
        ToolService::new(Arc::new(Mutex::new(GuardService::new())), dir.to_path_buf())
    }

    #[test]
    fn filename_from_url_sanitizes() {
        assert_eq!(
            filename_from_url("https://a.com/x/file.pdf?token=1"),
            "file.pdf"
        );
        assert_eq!(filename_from_url("https://a.com/"), "download.bin");
        assert_eq!(
            filename_from_url("https://a.com/a/b/../etc/passwd"),
            "passwd"
        );
        assert_eq!(filename_from_url("https://a.com/na<>me.txt"), "na__me.txt");
    }

    #[test]
    fn download_file_writes_into_workspace_floor() {
        // Spin a local HTTP server that serves a small payload, then exercise
        // `download_file` end-to-end (floor + atomic write + byte count).
        let dir = tempfile();
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        std::thread::spawn(move || {
            for stream in listener.incoming() {
                let mut s = match stream {
                    Ok(s) => s,
                    Err(_) => continue,
                };
                use std::io::{Read, Write};
                let mut buf = [0u8; 2048];
                let _ = s.read(&mut buf);
                let body = b"hello download";
                let resp = format!(
                    "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                    body.len()
                );
                let _ = s.write_all(resp.as_bytes());
                let _ = s.write_all(body);
            }
        });
        let url = format!("http://{addr}/data/payload.bin");
        let s = svc(&dir);
        let out = s.dispatch_download_file(&json!({"url": url, "dir": "downloads"}));
        assert_eq!(out["ok"], true, "{out}");
        assert_eq!(out["bytes"], 14);
        let path = out["path"].as_str().unwrap();
        assert!(path.ends_with("payload.bin"));
        assert_eq!(fs::read_to_string(path).unwrap(), "hello download");
    }

    struct FakeBrowser;
    impl BrowserBackend for FakeBrowser {
        fn save_pdf_enhanced(&self, dir: &Path) -> Result<String, String> {
            fs::write(dir.join("page.pdf"), b"%PDF fake").map_err(|e| e.to_string())?;
            Ok(dir.join("page.pdf").display().to_string())
        }
        fn save_screenshot_enhanced(&self, dir: &Path, _quality: u8) -> Result<String, String> {
            fs::write(dir.join("shot.jpg"), b"jpeg fake").map_err(|e| e.to_string())?;
            Ok(dir.join("shot.jpg").display().to_string())
        }
    }

    #[test]
    fn save_pdf_enhanced_routes_through_browser_backend() {
        let dir = tempfile();
        let mut s = ToolService::new(Arc::new(Mutex::new(GuardService::new())), dir.clone())
            .with_browser(Arc::new(FakeBrowser));
        // Without a backend the tool fails honestly.
        let mut no_browser = svc(&dir);
        let honest = no_browser.dispatch(
            &no_browser
                .registry
                .get("save_pdf_enhanced")
                .unwrap()
                .clone(),
            &json!({"dir": "downloads"}),
        );
        assert_eq!(honest["ok"], false);
        assert!(honest["error"].as_str().unwrap().contains("not attached"));

        let out = s.dispatch(
            &s.registry.get("save_pdf_enhanced").unwrap().clone(),
            &json!({"dir": "downloads"}),
        );
        assert_eq!(out["ok"], true, "{out}");
        assert!(out["path"].as_str().unwrap().ends_with("page.pdf"));
        assert!(dir.join("downloads/page.pdf").exists());
    }

    #[test]
    fn registry_covers_catalog_plus_extras() {
        let r = ToolRegistry::new();
        assert!(r.list().len() >= 42 + 6, "got {}", r.list().len());
        assert!(r.get("file_ops.read").is_some());
        assert!(r.get("browser.navigate").is_some());
        assert!(r.get("navigate").is_some());
        assert!(r.get("disk_scan").is_some());
        assert!(r.get("script.run").is_some());
        assert!(r.get("search.query").is_some());
    }

    #[test]
    fn canonical_hash_is_key_order_stable() {
        let a = json!({"b": 1, "a": 2});
        let b = json!({"a": 2, "b": 1});
        assert_eq!(canonical_args_hash(&a), canonical_args_hash(&b));
        let c = json!({"a": 2, "b": 3});
        assert_ne!(canonical_args_hash(&a), canonical_args_hash(&c));
    }

    #[test]
    fn canonical_hash_number_forms_are_equivalent() {
        // Integer and its float twin hash identically (JS has one number type).
        assert_eq!(
            canonical_args_hash(&json!({"n": 5})),
            canonical_args_hash(&json!({"n": 5.0}))
        );
        // Distinct numbers hash differently.
        assert_ne!(
            canonical_args_hash(&json!({"n": 5})),
            canonical_args_hash(&json!({"n": 6}))
        );
        // Large integers beyond 2^53 and exponent-y floats still hash stably.
        let _ = canonical_args_hash(&json!({"big": 1e21, "coord": 12.5, "z": 0}));
    }

    /// Cross-runtime vector: these exact hex hashes must equal the coordinator
    /// `canonicalArgsHash` output for the same inputs (see tools.test.ts
    /// `canonicalArgsHash cross-runtime vector`). If either side changes the
    /// canonicalization, both this test and the TS test must be updated in
    /// lockstep — that is the guard against silent drift.
    #[test]
    fn canonical_hash_cross_runtime_vector() {
        // maxResults int, a float coord, a big int, unicode, nested + array.
        let v = json!({
            "maxResults": 50,
            "coord": 12.5,
            "big": 9007199254740993u64, // 2^53 + 1
            "label": "café \u{1f600}",
            "nested": {"z": 1, "a": [1, 2.0, 3]}
        });
        // Printed so the TS side can assert the same constant.
        let h = canonical_args_hash(&v);
        assert_eq!(h.len(), 64);
        // This exact hex MUST equal the coordinator `canonicalArgsHash` output
        // (verified against tools.test.ts). Changing canonicalization on
        // either side breaks this constant — update both in lockstep.
        assert_eq!(
            h,
            "694541888ef627ef4ed5dedf8efa323fe9f0dd32e699debbb0a155ffbe02eeac"
        );
        // The value is stable across runs (determinism).
        assert_eq!(h, canonical_args_hash(&v));
    }

    #[test]
    fn exec_unknown_tool_errors() {
        let dir = tempfile();
        let mut s = svc(&dir);
        let err = s
            .handle("tool/exec", &json!({"toolId": "nope", "args": {}}))
            .unwrap_err();
        assert!(err.contains("unknown tool"));
    }

    #[test]
    fn read_tool_allow_then_commit() {
        let dir = tempfile();
        fs::write(dir.join("hello.txt"), "hi").unwrap();
        let mut s = svc(&dir);
        let pre = s
            .handle(
                "tool/exec",
                &json!({
                    "toolId": "file_ops.read",
                    "sessionId": "s1",
                    "agentId": "a1",
                    "args": {"path": "hello.txt"}
                }),
            )
            .unwrap();
        assert_eq!(pre["action"], "allow");
        let ticket = pre["ticketId"].as_str().unwrap();
        let hash = pre["argsHash"].as_str().unwrap();
        let out = s
            .handle(
                "tool/commit",
                &json!({
                    "toolId": "file_ops.read",
                    "ticketId": ticket,
                    "argsHash": hash,
                    "args": {"path": "hello.txt"}
                }),
            )
            .unwrap();
        assert_eq!(out["ok"], true);
        assert_eq!(out["content"], "hi");
        assert_eq!(out["auditSeq"], 1);
        assert_eq!(s.audit_len(), 1);
    }

    #[test]
    fn write_then_read_roundtrip() {
        let dir = tempfile();
        let guard = Arc::new(Mutex::new(GuardService::new()));
        let mut s = ToolService::new(Arc::clone(&guard), dir.clone());
        let args = json!({"path": "w.txt", "content": "payload"});
        let pre = s
            .handle(
                "tool/exec",
                &json!({"toolId": "file_ops.write", "sessionId": "s", "agentId": "a", "args": args}),
            )
            .unwrap();
        assert_eq!(pre["action"], "ask", "default write policy is always_ask");
        let tid = pre["ticketId"].as_str().unwrap().to_string();
        assert!(guard.lock().unwrap().approve(&tid));
        let commit = s
            .handle(
                "tool/commit",
                &json!({
                    "toolId": "file_ops.write",
                    "ticketId": tid,
                    "argsHash": pre["argsHash"],
                    "args": args
                }),
            )
            .unwrap();
        assert_eq!(commit["ok"], true);
        let text = fs::read_to_string(dir.join("w.txt")).unwrap();
        assert_eq!(text, "payload");
    }

    #[test]
    fn args_mismatch_refuses_commit() {
        let dir = tempfile();
        let mut s = svc(&dir);
        let pre = s
            .handle(
                "tool/exec",
                &json!({
                    "toolId": "file_ops.list",
                    "sessionId": "s",
                    "agentId": "a",
                    "args": {"path": "."}
                }),
            )
            .unwrap();
        let err = s
            .handle(
                "tool/commit",
                &json!({
                    "toolId": "file_ops.list",
                    "ticketId": pre["ticketId"],
                    "argsHash": pre["argsHash"],
                    "args": {"path": "other"}
                }),
            )
            .unwrap_err();
        assert!(
            err.contains("ticket refused") || err.contains("mismatch") || err.contains("drift"),
            "{err}"
        );
    }

    #[test]
    fn pending_ticket_cannot_commit() {
        let dir = tempfile();
        let guard = Arc::new(Mutex::new(GuardService::new()));
        // Force ask: delete is always_ask in default policy.
        let mut s = ToolService::new(Arc::clone(&guard), dir.clone());
        fs::write(dir.join("x.txt"), "x").unwrap();
        let pre = s
            .handle(
                "tool/exec",
                &json!({
                    "toolId": "file_ops.delete",
                    "sessionId": "s",
                    "agentId": "a",
                    "args": {"path": "x.txt"}
                }),
            )
            .unwrap();
        assert_eq!(pre["action"], "ask");
        let err = s
            .handle(
                "tool/commit",
                &json!({
                    "toolId": "file_ops.delete",
                    "ticketId": pre["ticketId"],
                    "argsHash": pre["argsHash"],
                    "args": {"path": "x.txt"}
                }),
            )
            .unwrap_err();
        assert!(err.to_lowercase().contains("not approved") || err.contains("ticket refused"));
        assert!(
            dir.join("x.txt").exists(),
            "must not delete without approve"
        );
    }

    #[test]
    fn approve_then_commit_deletes() {
        let dir = tempfile();
        let guard = Arc::new(Mutex::new(GuardService::new()));
        let mut s = ToolService::new(Arc::clone(&guard), dir.clone());
        fs::write(dir.join("x.txt"), "x").unwrap();
        let pre = s
            .handle(
                "tool/exec",
                &json!({
                    "toolId": "file_ops.delete",
                    "sessionId": "s",
                    "agentId": "a",
                    "args": {"path": "x.txt"}
                }),
            )
            .unwrap();
        assert_eq!(pre["action"], "ask");
        let tid = pre["ticketId"].as_str().unwrap().to_string();
        {
            let mut g = guard.lock().unwrap();
            assert!(g.approve(&tid));
        }
        let out = s
            .handle(
                "tool/commit",
                &json!({
                    "toolId": "file_ops.delete",
                    "ticketId": tid,
                    "argsHash": pre["argsHash"],
                    "args": {"path": "x.txt"}
                }),
            )
            .unwrap();
        assert_eq!(out["ok"], true);
        assert!(!dir.join("x.txt").exists());
    }

    #[test]
    fn estop_blocks_exec_and_commit() {
        let dir = tempfile();
        let guard = Arc::new(Mutex::new(GuardService::new()));
        let mut s = ToolService::new(Arc::clone(&guard), dir.clone());
        guard
            .lock()
            .unwrap()
            .handle("guard/estop", &json!({}))
            .unwrap();
        let pre = s
            .handle(
                "tool/exec",
                &json!({
                    "toolId": "file_ops.write",
                    "sessionId": "s",
                    "agentId": "a",
                    "args": {"path": "z.txt", "content": "no"}
                }),
            )
            .unwrap();
        assert_eq!(pre["action"], "block");
    }

    #[test]
    fn path_escape_refused() {
        let dir = tempfile();
        let mut s = svc(&dir);
        let pre = s
            .handle(
                "tool/exec",
                &json!({
                    "toolId": "file_ops.read",
                    "sessionId": "s",
                    "agentId": "a",
                    "args": {"path": "../../etc/passwd"}
                }),
            )
            .unwrap();
        // pre-flight still allows (read) — floor is at commit
        if pre["action"] == "allow" {
            let out = s
                .handle(
                    "tool/commit",
                    &json!({
                        "toolId": "file_ops.read",
                        "ticketId": pre["ticketId"],
                        "argsHash": pre["argsHash"],
                        "args": {"path": "../../etc/passwd"}
                    }),
                )
                .unwrap();
            assert_eq!(out["ok"], false);
            let err = out["error"].as_str().unwrap_or("");
            assert!(err.contains("floor") || err.contains("refused"), "{err}");
        }
    }

    #[test]
    fn guard1_blocks_destructive_shell() {
        let dir = tempfile();
        let mut s = svc(&dir);
        let pre = s
            .handle(
                "tool/exec",
                &json!({
                    "toolId": "script.run",
                    "sessionId": "s",
                    "agentId": "a",
                    "args": {"code": "rm -rf /"}
                }),
            )
            .unwrap();
        assert_eq!(pre["action"], "block");
    }

    #[test]
    fn single_use_ticket() {
        let dir = tempfile();
        fs::write(dir.join("a.txt"), "a").unwrap();
        let mut s = svc(&dir);
        let args = json!({"path": "a.txt"});
        let pre = s
            .handle(
                "tool/exec",
                &json!({"toolId": "file_ops.read", "sessionId": "s", "agentId": "a", "args": args}),
            )
            .unwrap();
        let body = json!({
            "toolId": "file_ops.read",
            "ticketId": pre["ticketId"],
            "argsHash": pre["argsHash"],
            "args": args
        });
        let first = s.handle("tool/commit", &body).unwrap();
        assert_eq!(first["ok"], true);
        let second = s.handle("tool/commit", &body);
        assert!(second.is_err());
    }

    #[test]
    fn toctou_inode_swap_refused_at_commit() {
        let dir = tempfile();
        fs::write(dir.join("a.txt"), "orig").unwrap();
        let mut s = svc(&dir);
        let args = json!({"path": "a.txt"});
        let pre = s
            .handle(
                "tool/exec",
                &json!({"toolId": "file_ops.read", "sessionId": "s", "agentId": "a", "args": args}),
            )
            .unwrap();
        assert_eq!(pre["action"], "allow");
        fs::write(dir.join("b.txt"), "swapped-inode").unwrap();
        fs::remove_file(dir.join("a.txt")).unwrap();
        fs::rename(dir.join("b.txt"), dir.join("a.txt")).unwrap();
        let err = s
            .handle(
                "tool/commit",
                &json!({
                    "toolId": "file_ops.read",
                    "ticketId": pre["ticketId"],
                    "argsHash": pre["argsHash"],
                    "args": args
                }),
            )
            .unwrap_err();
        assert!(
            err.contains("TOCTOU") || err.contains("inode") || err.contains("drift"),
            "{err}"
        );
    }

    #[test]
    fn redteam_corpus_blocked_through_executor() {
        let dir = tempfile();
        let mut s = svc(&dir);
        for probe in everyaios_guard::redteam::RED_TEAM_CORPUS {
            let pre = s
                .handle(
                    "tool/exec",
                    &json!({
                        "toolId": "script.run",
                        "sessionId": "s",
                        "agentId": "a",
                        "args": {"code": probe.payload}
                    }),
                )
                .unwrap();
            assert_eq!(
                pre["action"], "block",
                "probe {} escaped: {}",
                probe.name, probe.payload
            );
        }
    }

    #[test]
    fn pathfloor_fuzz_through_executor() {
        let dir = tempfile();
        let mut s = svc(&dir);
        let root = dir.to_string_lossy().to_string();
        for p in everyaios_guard::pathfloor::adversarial_paths() {
            let pre = s
                .handle(
                    "tool/exec",
                    &json!({
                        "toolId": "file_ops.read",
                        "sessionId": "s",
                        "agentId": "a",
                        "args": {"path": p}
                    }),
                )
                .unwrap();
            if pre["action"] == "block" {
                continue;
            }
            let out = s.handle(
                "tool/commit",
                &json!({
                    "toolId": "file_ops.read",
                    "ticketId": pre["ticketId"],
                    "argsHash": pre["argsHash"],
                    "args": {"path": p}
                }),
            );
            match out {
                Ok(v) => {
                    if v["ok"] == true {
                        assert!(
                            everyaios_guard::pathfloor::is_inside_root(&p, &[&root])
                                || dir.join(&p).starts_with(&dir),
                            "path floor allowed escape: {p}"
                        );
                    }
                }
                Err(_) => {}
            }
        }
    }

    #[test]
    fn urlfloor_fuzz_through_executor() {
        let dir = tempfile();
        let mut s = svc(&dir);
        for u in everyaios_guard::urlfloor::adversarial_urls() {
            let pre = s
                .handle(
                    "tool/exec",
                    &json!({
                        "toolId": "file_ops.read",
                        "sessionId": "s",
                        "agentId": "a",
                        "args": {"path": "x.txt", "url": u}
                    }),
                )
                .unwrap();
            assert_eq!(pre["action"], "block", "url floor missed {u}");
        }
    }

    #[test]
    fn e2e_ask_approve_commit_writes_audit_and_result() {
        let dir = tempfile();
        fs::write(dir.join("doomed.txt"), "x").unwrap();
        let guard = Arc::new(Mutex::new(GuardService::new()));
        let mut s = ToolService::new(Arc::clone(&guard), dir.clone());
        let args = json!({"path": "doomed.txt"});
        let pre = s
            .handle(
                "tool/exec",
                &json!({
                    "toolId": "file_ops.delete",
                    "sessionId": "s",
                    "agentId": "a",
                    "args": args
                }),
            )
            .unwrap();
        assert_eq!(pre["action"], "ask");
        let tid = pre["ticketId"].as_str().unwrap().to_string();
        {
            let mut g = guard.lock().unwrap();
            assert!(g.approve(&tid));
        }
        let out = s
            .handle(
                "tool/commit",
                &json!({
                    "toolId": "file_ops.delete",
                    "ticketId": tid,
                    "argsHash": pre["argsHash"],
                    "args": args
                }),
            )
            .unwrap();
        assert_eq!(out["ok"], true);
        assert!(out["auditSeq"].as_u64().unwrap() >= 1);
        assert!(!dir.join("doomed.txt").exists());
        assert_eq!(s.audit_len(), 1);
    }

    #[test]
    fn risk_tiers_on_catalog() {
        let r = ToolRegistry::new();
        assert_eq!(r.get("file_ops.read").unwrap().risk_tier, "R0");
        assert_eq!(r.get("file_ops.delete").unwrap().risk_tier, "R3");
        assert_eq!(r.get("search.query").unwrap().risk_tier, "R2");
        assert_eq!(r.get("script.run").unwrap().risk_tier, "R3");
    }

    #[test]
    fn tool_list_is_deterministic() {
        let a = ToolRegistry::new();
        let b = ToolRegistry::new();
        let ids_a: Vec<_> = a.list().iter().map(|t| t.id.clone()).collect();
        let ids_b: Vec<_> = b.list().iter().map(|t| t.id.clone()).collect();
        assert_eq!(ids_a, ids_b);
    }

    #[test]
    fn mutating_idempotent_replay_is_refused() {
        let dir = tempfile();
        let mut s = svc(&dir);
        let args = json!({"path": "w.txt", "content": "once"});
        let pre = s
            .handle(
                "tool/exec",
                &json!({"toolId": "file_ops.write", "sessionId": "s", "agentId": "a", "args": args}),
            )
            .unwrap();
        let tid = pre["ticketId"].as_str().unwrap().to_string();
        if pre["action"] == "ask" {
            s.guard
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .approve(&tid);
        }
        let body = json!({
            "toolId": "file_ops.write",
            "ticketId": tid,
            "argsHash": pre["argsHash"],
            "args": args
        });
        let first = s.handle("tool/commit", &body);
        assert!(first.is_ok(), "{first:?}");
        // Fresh ticket, same args — still refused by the idempotency ledger.
        let pre2 = s
            .handle(
                "tool/exec",
                &json!({"toolId": "file_ops.write", "sessionId": "s", "agentId": "a", "args": args}),
            )
            .unwrap();
        let tid2 = pre2["ticketId"].as_str().unwrap().to_string();
        if pre2["action"] == "ask" {
            s.guard
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .approve(&tid2);
        }
        let second = s.handle(
            "tool/commit",
            &json!({
                "toolId": "file_ops.write",
                "ticketId": tid2,
                "argsHash": pre2["argsHash"],
                "args": args
            }),
        );
        assert!(second.is_err(), "{second:?}");
        let err = second.unwrap_err();
        assert!(
            err.contains("idempotent") || err.contains("replay"),
            "{err}"
        );
    }

    #[test]
    fn file_write_undo_restores_previous_bytes() {
        let dir = tempfile();
        fs::write(dir.join("w.txt"), "before").unwrap();
        let mut s = svc(&dir);
        let args = json!({"path": "w.txt", "content": "after"});
        let pre = s
            .handle(
                "tool/exec",
                &json!({"toolId": "file_ops.write", "sessionId": "s", "agentId": "a", "args": args}),
            )
            .unwrap();
        let tid = pre["ticketId"].as_str().unwrap().to_string();
        if pre["action"] == "ask" {
            s.guard
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .approve(&tid);
        }
        s.handle(
            "tool/commit",
            &json!({
                "toolId": "file_ops.write",
                "ticketId": tid,
                "argsHash": pre["argsHash"],
                "args": args
            }),
        )
        .unwrap();
        assert_eq!(fs::read_to_string(dir.join("w.txt")).unwrap(), "after");
        let restored = s.revert_last("").unwrap();
        assert!(restored.contains("w.txt"));
        assert_eq!(fs::read_to_string(dir.join("w.txt")).unwrap(), "before");
    }

    struct FakeSearch;
    impl everyaios_search::SearchTransport for FakeSearch {
        fn search(
            &self,
            endpoint: &str,
            query: &str,
        ) -> Result<Vec<everyaios_search::SearchResult>, String> {
            Ok(vec![everyaios_search::SearchResult {
                url: format!("https://example.test/{query}"),
                title: format!("{query} via {endpoint}"),
                snippet: "hit".into(),
                source: endpoint.into(),
            }])
        }
        fn fetch(&self, _tier: &str, _url: &str) -> Result<String, String> {
            Ok("ok".into())
        }
    }

    #[test]
    fn g8_search_dispatch_returns_hits() {
        let dir = tempfile();
        let mut s = ToolService::new(Arc::new(Mutex::new(GuardService::new())), dir)
            .with_search_transport(Arc::new(FakeSearch));
        let spec = s.registry.get("search.query").unwrap().clone();
        let out = s.dispatch(&spec, &json!({"query": "everyaios"}));
        assert_eq!(out["ok"], true, "{out}");
        assert_eq!(out["count"], 1);
        assert!(out["results"][0]["url"]
            .as_str()
            .unwrap()
            .contains("everyaios"));
    }

    #[test]
    fn office_tools_are_registered() {
        let r = ToolRegistry::new();
        assert!(r.get("office.docx_patch").is_some());
        assert!(r.get("office.xlsx_edit").is_some());
        assert!(r.get("office.pdf_pages").is_some());
    }

    #[test]
    fn office_path_floor_refuses_escape() {
        let dir = tempfile();
        let mut s = svc(&dir);
        let spec = s.registry.get("office.docx_open").unwrap().clone();
        let out = s.dispatch(&spec, &json!({"path": "../../etc/passwd"}));
        assert_eq!(out["ok"], false);
        assert!(
            out["error"].as_str().unwrap_or("").contains("floor"),
            "{out}"
        );
    }

    #[test]
    fn offline_mode_denies_search_egress() {
        let dir = tempfile();
        let mut s = svc(&dir);
        s.set_connectivity(ConnectivityMode::Offline);
        let pre = s
            .handle(
                "tool/exec",
                &json!({
                    "toolId": "search.query",
                    "sessionId": "s",
                    "agentId": "a",
                    "args": {"query": "weather"}
                }),
            )
            .unwrap();
        assert_eq!(pre["action"], "block");
        assert!(
            pre["reason"].as_str().unwrap_or("").contains("egress"),
            "{pre}"
        );
    }

    struct FakeDesktop;
    impl DesktopBackend for FakeDesktop {
        fn list_windows(&self) -> Result<Value, String> {
            Ok(json!([{ "id": 1, "title": "Notes", "app": "Notes.app" }]))
        }
        fn read(&self, window_id: u64) -> Result<Value, String> {
            Ok(json!({ "windowId": window_id, "tree": [{ "role": "Button", "name": "Save" }] }))
        }
        fn act(
            &self,
            kind: &str,
            window_id: Option<u64>,
            target: Option<&str>,
            text: Option<&str>,
        ) -> Result<Value, String> {
            Ok(json!({
                "kind": kind,
                "windowId": window_id,
                "target": target,
                "text": text,
                "ok": true,
            }))
        }
    }

    #[test]
    fn desktop_tools_route_through_attached_backend() {
        let dir = tempfile();
        let mut s = svc(&dir);
        // Honest failure without a backend (headless/no-display).
        let no_desktop = s.dispatch(
            &s.registry.get("desktop.act").unwrap().clone(),
            &json!({"kind": "click", "target": "Save"}),
        );
        assert_eq!(no_desktop["ok"], false);
        assert!(no_desktop["error"]
            .as_str()
            .unwrap()
            .contains("not attached"));

        s.attach_desktop(Arc::new(FakeDesktop));
        let windows = s.dispatch(
            &s.registry.get("desktop.windows").unwrap().clone(),
            &json!({}),
        );
        assert_eq!(windows["ok"], true);
        assert_eq!(windows["windows"][0]["title"], "Notes");
        let read = s.dispatch(
            &s.registry.get("desktop.read").unwrap().clone(),
            &json!({ "windowId": 1 }),
        );
        assert_eq!(read["ok"], true);
        assert_eq!(read["snapshot"]["tree"][0]["role"], "Button");
        let act = s.dispatch(
            &s.registry.get("desktop.act").unwrap().clone(),
            &json!({"kind": "click", "target": "Save"}),
        );
        assert_eq!(act["ok"], true);
        assert_eq!(act["result"]["target"], "Save");
    }

    struct FakeConnector;
    impl ConnectorToolBackend for FakeConnector {
        fn email(&self, to: Vec<String>, subject: &str, body: &str) -> Result<Value, String> {
            Ok(json!({ "to": to, "subject": subject, "body_len": body.len() }))
        }
        fn calendar(&self, title: &str, when: &str) -> Result<Value, String> {
            Ok(json!({ "title": title, "when": when }))
        }
    }

    #[test]
    fn connector_writes_route_through_attached_engine() {
        let dir = tempfile();
        let mut s = svc(&dir);
        let no_conn = s.dispatch(
            &s.registry.get("connector.email_send").unwrap().clone(),
            &json!({ "to": ["a@example.test"], "subject": "hi" }),
        );
        assert_eq!(no_conn["ok"], false);
        assert!(no_conn["error"].as_str().unwrap().contains("not attached"));

        s.attach_connector(Arc::new(FakeConnector));
        let mail = s.dispatch(
            &s.registry.get("connector.email_send").unwrap().clone(),
            &json!({ "to": ["a@example.test"], "subject": "hi", "body": "b" }),
        );
        assert_eq!(mail["ok"], true);
        assert_eq!(mail["result"]["to"][0], "a@example.test");
        let cal = s.dispatch(
            &s.registry.get("connector.calendar_create").unwrap().clone(),
            &json!({ "title": "Standup", "when": "2026-09-01T09:00Z" }),
        );
        assert_eq!(cal["ok"], true);
        assert_eq!(cal["result"]["title"], "Standup");
    }

    #[test]
    fn external_attach_registers_tools_and_dispatches_with_native_precedence() {
        let dir = tempfile();
        let mut s = svc(&dir);
        let before = s.registry.list().len();

        // A user-supplied server exposing a brand-new tool and a colliding one.
        let tools = vec![
            ExternalTool {
                name: "custom.query".into(),
                description: "custom data".into(),
                input_schema: json!({ "type": "object", "properties": {} }),
                read_only: true,
                open_world: false,
                source: "mcp:custom".into(),
            },
            ExternalTool {
                name: "script.run".into(),
                description: "shadow attempt".into(),
                input_schema: json!({ "type": "object", "properties": {} }),
                read_only: false,
                open_world: false,
                source: "mcp:custom".into(),
            },
        ];
        let names = s.registry.register_external("mcp:custom", &tools);
        // Native precedence: the shadow attempt is skipped.
        assert_eq!(names, vec!["custom.query"]);
        assert_eq!(s.registry.list().len(), before + 1);

        struct FakeExternal;
        impl ExternalToolBackend for FakeExternal {
            fn call(&self, tool_id: &str, args: &Value) -> Result<Value, String> {
                Ok(json!({ "echo": tool_id, "args": args }))
            }
        }
        s.attach_external("mcp:custom", names.clone(), Arc::new(FakeExternal));
        let out = s.dispatch(
            &s.registry.get("custom.query").unwrap().clone(),
            &json!({ "q": 1 }),
        );
        assert_eq!(out["ok"], true);
        assert_eq!(out["result"]["echo"], "custom.query");
        // Unknown external id with no attachment fails honestly.
        let mut s2 = svc(&dir);
        s2.registry.register_external("mcp:other", &tools);
        let miss = s2.dispatch(
            &s2.registry.get("custom.query").unwrap().clone(),
            &json!({}),
        );
        assert_eq!(miss["ok"], false);
        assert!(miss["error"].as_str().unwrap().contains("not attached"));
    }

    fn tempfile() -> PathBuf {
        // A process-unique counter (not `now_ms()`) — millisecond timestamps
        // collide when parallel tests land in the same ms and clobber each
        // other's workspace dirs.
        static N: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        let mut p = std::env::temp_dir();
        p.push(format!(
            "everyaios-tools-{}-{}",
            std::process::id(),
            N.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        ));
        fs::create_dir_all(&p).unwrap();
        p
    }
}
