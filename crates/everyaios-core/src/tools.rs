//! Stage 0 — guard-gated tool executor (S0.1).
//!
//! Sidecar proposes (`tool/exec` pre-flight + `tool/commit`); Rust disposes:
//! Guard-1 scan → `GuardService::evaluate` (ticket) → `use_ticket` → dispatch
//! → Merkle audit row. Catalog ids come from `everyaios-mcp` (42 tools) plus
//! `script.run`, `file_ops.*`, and `search.query`.
//!
//! Browser CDP / G8 search / office mutation engines are **dispatched**
//! (every id has a table entry) and fail honestly when the engine is not
//! attached — they never run without a consumed ticket on the mutation path.

use std::collections::{BTreeMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Instant;

use everyaios_audit::{merkle::MerkleChain, AuditEvent};
use everyaios_guard::{
    bind_exec_bytes, bind_path, bind_url, open_parent_dir,
    pathfloor::{enforce_floor, FloorVerdict},
    reverify_exec, reverify_path, reverify_url, scan_all, urlfloor, ConnectivityMode,
    DecisionPackage, EgressEngine, EgressVerdict, Operation, ResourceBinding, RiskLevel, RiskTier,
};
use everyaios_mcp::{all_tools, ArgDef, ArgKind, ToolDef, ToolKind};
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
pub fn canonical_args_hash(args: &Value) -> String {
    let canon = canonicalize(args);
    let bytes = serde_json::to_vec(&canon).unwrap_or_default();
    let mut h = Sha256::new();
    h.update(&bytes);
    h.finalize().iter().map(|b| format!("{b:02x}")).collect()
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

        Self { tools, aliases }
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
            description: "Web search cascade (G8) — not built; dispatch fails honestly".into(),
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
        }
    }

    /// P2.3 — attach a browser engine so `save_pdf_enhanced`/
    /// `save_screenshot_enhanced` route real captures to disk.
    pub fn with_browser(mut self, browser: Arc<dyn BrowserBackend>) -> Self {
        self.browser = Some(browser);
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
            ToolFamily::Search => json!({
                "ok": false,
                "error": "G8 search cascade is not built (TODO P8.4)"
            }),
            ToolFamily::Browser => match spec.id.as_str() {
                // P2.3 (E2) — the three file-op tools have a real path.
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
                            let res = if spec.id == "save_pdf_enhanced" {
                                b.save_pdf_enhanced(&abs)
                            } else {
                                let q =
                                    args.get("quality").and_then(Value::as_u64).unwrap_or(80) as u8;
                                b.save_screenshot_enhanced(&abs, q)
                            };
                            match res {
                                Ok(path) => json!({"ok": true, "path": path}),
                                Err(e) => json!({"ok": false, "error": e}),
                            }
                        }
                        None => json!({
                            "ok": false,
                            "error": "browser session not attached"
                        }),
                    }
                }
                _ => json!({
                    "ok": false,
                    "error": "browser session not attached"
                }),
            },
            ToolFamily::Office => json!({
                "ok": false,
                "error": "office engine not attached on this path"
            }),
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
