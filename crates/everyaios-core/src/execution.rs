//! H3 — unified Work records inside the ExecutionKernel (P47.4: the durable
//! per-turn unit is named `Work`; the kernel that holds them stays
//! `ExecutionKernel`). Chat turns, plans, scheduler runs, ACP prompts and
//! subagents all enter the same record + state machine so resume / fork /
//! replay / handoff / audit / receipt share one unit.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;

/// v3.39 — immutable runtime manifest binding model / provider / permissions /
/// tools / environment to an execution. Computed once at `bind_runtime` time
/// and stored as a SHA-256 `config_hash` so any drift is detectable.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RuntimeManifest {
    pub model: String,
    pub provider: String,
    pub permissions: Vec<String>,
    pub tools: Vec<String>,
    pub env_summary: Value,
}

impl RuntimeManifest {
    pub fn compute_hash(&self) -> String {
        let canon = serde_json::to_vec(self).unwrap_or_default();
        let mut h = Sha256::new();
        h.update(&canon);
        h.finalize().iter().map(|b| format!("{b:02x}")).collect()
    }
}

/// v3.39 — resumable HITL approval waiting inside a checkpoint. When an
/// execution pauses at `WaitingApproval` the approval request is captured
/// here so a crash between mint and resolve is recoverable.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PendingApproval {
    pub ticket_id: String,
    pub tool_id: String,
    pub args_hash: String,
    pub requested_at_ms: u64,
    pub risk_tier: String,
}

/// v3.39 — classification of an incomplete tool for repair.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RepairClassification {
    /// No dispatch evidence found; safe to retry.
    NeverStarted,
    /// Dispatch evidence exists but no completion; must confirm before retry.
    StartedUnknown,
}

/// v3.39 — one item in a repair plan for incomplete tools.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepairPlanItem {
    pub seq: u64,
    pub tool: String,
    pub args_hash: String,
    pub classification: RepairClassification,
    /// True when the tool is a mutating op and started-unknown.
    pub needs_confirmation: bool,
}

/// v3.39 — projected message derived from the append-only event log. The
/// message history is a *view*, not the source of truth.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectedMessage {
    pub turn: u64,
    pub role: String,
    pub content: String,
    pub ts_ms: u64,
    pub tool_call_count: u32,
}

/// v3.39 — lineage record for a forked session. A fork happens at a
/// completed-turn boundary; the fork inherits the event log up to that
/// point and diverges with a new session id.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ForkLineage {
    pub source_session: String,
    pub fork_at_turn: u64,
    pub fork_at_event_seq: u64,
    pub new_session_id: String,
    pub created_at_ms: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ExecutionTrigger {
    Chat,
    Plan,
    Scheduler,
    Acp,
    Subagent,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ExecutionPhase {
    Created,
    Planning,
    Ready,
    Running,
    WaitingTool,
    WaitingApproval,
    WaitingUser,
    Checkpointed,
    Verifying,
    Completed,
    Failed,
    Cancelled,
    Paused,
    Recoverable,
}

impl ExecutionPhase {
    pub fn can_transition(self, next: Self) -> bool {
        use ExecutionPhase::*;
        matches!(
            (self, next),
            (Created, Planning | Ready | Cancelled)
                | (Planning, Ready | Failed | Cancelled)
                | (Ready, Running | Cancelled)
                | (
                    Running,
                    WaitingTool
                        | WaitingApproval
                        | WaitingUser
                        | Checkpointed
                        | Verifying
                        | Completed
                        | Failed
                        | Cancelled
                        | Paused
                        | Recoverable
                )
                | (
                    WaitingTool | WaitingApproval | WaitingUser,
                    Running | Failed | Cancelled | Paused
                )
                | (Checkpointed, Running | Failed | Cancelled)
                | (Verifying, Completed | Failed | Recoverable)
                | (Paused, Running | Cancelled)
                | (Recoverable, Running | Failed | Cancelled)
        )
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Work {
    pub id: String,
    pub parent_id: Option<String>,
    pub workspace: String,
    pub session_id: String,
    pub trigger: ExecutionTrigger,
    pub objective: String,
    pub state: ExecutionPhase,
    pub plan: Option<String>,
    pub policy_snapshot: String,
    pub capability_scope: Vec<String>,
    pub context_snapshot: String,
    pub checkpoint: u32,
    pub budget_usd: f64,
    pub event_stream: Vec<String>,
    pub artifact_refs: Vec<String>,
    pub approval_refs: Vec<String>,
    pub verification: Option<Value>,
    pub receipt: Option<Value>,
    pub idempotency_key: String,
    pub created_at_ms: u64,
    /// v3.39 — immutable SHA-256 of the RuntimeManifest, bound once via
    /// `execution/bind_runtime`. Empty string means not yet bound.
    #[serde(default)]
    pub config_hash: String,
    /// v3.39 — the full manifest stored alongside the hash for inspection.
    /// None until `bind_runtime` is called.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub runtime_manifest: Option<RuntimeManifest>,
    /// v3.39 — resumable HITL approval waiting inside the checkpoint.
    /// Present only when the execution is in `WaitingApproval` and a crash
    /// would otherwise lose the pending request.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pending_approval: Option<PendingApproval>,
}

impl Work {
    pub fn new(
        id: String,
        trigger: ExecutionTrigger,
        session_id: String,
        objective: String,
    ) -> Self {
        Self {
            id: id.clone(),
            parent_id: None,
            workspace: String::new(),
            session_id,
            trigger,
            objective,
            state: ExecutionPhase::Created,
            plan: None,
            policy_snapshot: String::new(),
            capability_scope: Vec::new(),
            context_snapshot: String::new(),
            checkpoint: 0,
            budget_usd: 0.0,
            event_stream: Vec::new(),
            artifact_refs: Vec::new(),
            approval_refs: Vec::new(),
            verification: None,
            receipt: None,
            idempotency_key: format!("exec:{id}"),
            created_at_ms: now_ms(),
            config_hash: String::new(),
            runtime_manifest: None,
            pending_approval: None,
        }
    }

    /// v3.39 — bind the runtime manifest, compute and store the immutable
    /// config_hash. Once set, any drift in model/provider/tools/permissions
    /// is detectable by comparing the stored hash against a re-computation.
    pub fn bind_runtime(&mut self, manifest: RuntimeManifest) -> String {
        let hash = manifest.compute_hash();
        self.config_hash = hash.clone();
        self.runtime_manifest = Some(manifest);
        hash
    }

    /// v3.39 — record a pending Guard-2 approval inside the checkpoint so
    /// a crash between mint and resolve is recoverable. Returns Err if the
    /// execution is not in WaitingApproval phase.
    pub fn record_pending_approval(&mut self, approval: PendingApproval) -> Result<(), String> {
        if self.state != ExecutionPhase::WaitingApproval {
            return Err(format!(
                "cannot record pending approval in state {:?} (must be WaitingApproval)",
                self.state
            ));
        }
        self.approval_refs.push(approval.ticket_id.clone());
        self.pending_approval = Some(approval);
        Ok(())
    }

    /// v3.39 — resolve (approve or reject) a pending approval. Clears the
    /// pending field and transitions back to Running on approval, or Failed
    /// on rejection. Returns the approval for the caller to forward.
    pub fn resolve_pending_approval(&mut self, approved: bool) -> Result<PendingApproval, String> {
        let approval = self
            .pending_approval
            .take()
            .ok_or("no pending approval to resolve")?;
        let next = if approved {
            ExecutionPhase::Running
        } else {
            ExecutionPhase::Failed
        };
        if !self.state.can_transition(next) {
            return Err(format!("illegal transition {:?} → {next:?}", self.state));
        }
        self.state = next;
        self.event_stream.push(format!("{next:?}"));
        Ok(approval)
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
/// H3 — the in-memory ExecutionKernel (holds `Work` records), made durable
/// for P48.4. The whole kernel serializes (plain `BTreeMap<String, Work>` +
/// counter + aliases)
/// so a [`ExecutionKernel::snapshot`] is the crash-checkpoint and
/// [`ExecutionKernel::recover`] is the resume-from-disk half. Recovery resumes
/// from the last checkpoint and never replays a completed effect, because an
/// execution's `checkpoint`/`state`/`idempotency_key` are persisted with it.
#[serde(rename_all = "camelCase")]
pub struct ExecutionKernel {
    executions: BTreeMap<String, Work>,
    aliases: BTreeMap<String, String>,
    counter: u64,
}

impl ExecutionKernel {
    pub fn new() -> Self {
        Self::default()
    }

    #[allow(clippy::too_many_arguments)]
    pub fn begin(
        &mut self,
        trigger: ExecutionTrigger,
        session_id: &str,
        objective: &str,
        parent_id: Option<String>,
        policy_snapshot: String,
        context_snapshot: String,
        capability_scope: Vec<String>,
    ) -> Work {
        self.counter += 1;
        let id = format!("ex:{}", self.counter);
        self.begin_named(
            id,
            trigger,
            session_id,
            objective,
            parent_id,
            policy_snapshot,
            context_snapshot,
            capability_scope,
        )
    }

    #[allow(clippy::too_many_arguments)]
    pub fn begin_named(
        &mut self,
        id: String,
        trigger: ExecutionTrigger,
        session_id: &str,
        objective: &str,
        parent_id: Option<String>,
        policy_snapshot: String,
        context_snapshot: String,
        capability_scope: Vec<String>,
    ) -> Work {
        if let Some(existing) = self.executions.get(&id) {
            return existing.clone();
        }
        let mut ex = Work::new(
            id.clone(),
            trigger,
            session_id.to_string(),
            objective.to_string(),
        );
        ex.parent_id = parent_id;
        ex.policy_snapshot = policy_snapshot;
        ex.context_snapshot = context_snapshot;
        ex.capability_scope = capability_scope;
        ex.state = ExecutionPhase::Ready;
        self.executions.insert(id, ex.clone());
        ex
    }

    pub fn alias(&mut self, key: &str, execution_id: &str) {
        self.aliases
            .insert(key.to_string(), execution_id.to_string());
    }

    pub fn by_alias(&self, key: &str) -> Option<&Work> {
        let id = self.aliases.get(key)?;
        self.executions.get(id)
    }

    pub fn transition(&mut self, id: &str, next: ExecutionPhase) -> Result<ExecutionPhase, String> {
        let ex = self
            .executions
            .get_mut(id)
            .ok_or_else(|| format!("unknown execution {id}"))?;
        if !ex.state.can_transition(next) {
            return Err(format!("illegal transition {:?} → {next:?}", ex.state));
        }
        ex.state = next;
        ex.event_stream.push(format!("{next:?}"));
        Ok(ex.state)
    }

    pub fn get(&self, id: &str) -> Option<&Work> {
        self.executions.get(id)
    }

    pub fn attach_verification(&mut self, id: &str, report: Value) -> Result<(), String> {
        let ex = self
            .executions
            .get_mut(id)
            .ok_or_else(|| format!("unknown execution {id}"))?;
        ex.verification = Some(report);
        Ok(())
    }

    pub fn attach_receipt(&mut self, id: &str, receipt: Value) -> Result<(), String> {
        let ex = self
            .executions
            .get_mut(id)
            .ok_or_else(|| format!("unknown execution {id}"))?;
        ex.receipt = Some(receipt);
        Ok(())
    }

    /// P48.4 — serialize the whole kernel to a JSON string. This is the
    /// crash-checkpoint payload: every execution, its phase/checkpoint,
    /// pending approval, and the monotonic counter, all in one blob.
    pub fn snapshot_to_string(&self) -> Result<String, String> {
        serde_json::to_string_pretty(self).map_err(|e| format!("kernel snapshot: {e}"))
    }

    /// P48.4 — atomically persist the kernel to `path` via temp-file + rename
    /// so a crash mid-write can never leave a torn checkpoint on disk.
    pub fn persist_to(&self, path: &std::path::Path) -> Result<(), String> {
        let data = self.snapshot_to_string()?;
        let tmp = path.with_extension(format!("tmp{}x", std::process::id()));
        std::fs::write(&tmp, data).map_err(|e| format!("write checkpoint: {e}"))?;
        std::fs::rename(&tmp, path).map_err(|e| format!("swap checkpoint: {e}"))?;
        Ok(())
    }

    /// P48.4 — restore a kernel from a persisted snapshot. Missing file is a
    /// fresh kernel (no crash recovery needed); a corrupt snapshot is an error
    /// (fail-closed: refuse to resume on ambiguous state).
    pub fn recover_from(path: &std::path::Path) -> Result<Self, String> {
        let data = match std::fs::read_to_string(path) {
            Ok(d) => d,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                return Ok(Self::default());
            }
            Err(e) => return Err(format!("read checkpoint: {e}")),
        };
        serde_json::from_str(&data).map_err(|e| format!("parse checkpoint: {e}"))
    }

    /// Number of live work records (drives the fork/replay surface + tests).
    pub fn len(&self) -> usize {
        self.executions.len()
    }

    pub fn is_empty(&self) -> bool {
        self.executions.is_empty()
    }

    /// Expose the monotonic counter so a recovered kernel continues numbering
    /// (never reuses an id after a restart).
    pub fn counter(&self) -> u64 {
        self.counter
    }

    pub fn handle(&mut self, method: &str, params: &Value) -> Result<Value, String> {
        match method {
            "execution/begin" => {
                let trigger = match params
                    .get("trigger")
                    .and_then(Value::as_str)
                    .unwrap_or("chat")
                {
                    "plan" => ExecutionTrigger::Plan,
                    "scheduler" => ExecutionTrigger::Scheduler,
                    "acp" => ExecutionTrigger::Acp,
                    "subagent" => ExecutionTrigger::Subagent,
                    _ => ExecutionTrigger::Chat,
                };
                let session = params
                    .get("sessionId")
                    .and_then(Value::as_str)
                    .unwrap_or("default");
                let objective = params
                    .get("objective")
                    .and_then(Value::as_str)
                    .unwrap_or("");
                let parent = params
                    .get("parentId")
                    .and_then(Value::as_str)
                    .map(str::to_string);
                let policy = params
                    .get("policySnapshot")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_string();
                let ctx = params
                    .get("contextSnapshot")
                    .cloned()
                    .map(|v| v.to_string())
                    .unwrap_or_default();
                let scope = params
                    .get("capabilityScope")
                    .and_then(Value::as_array)
                    .map(|a| {
                        a.iter()
                            .filter_map(Value::as_str)
                            .map(str::to_string)
                            .collect()
                    })
                    .unwrap_or_default();
                // `workId` groups executions in the Work Gateway; it is not
                // the execution identity. Every attempt receives its own
                // monotonic `ex:<n>` id so concurrent turns in one Work can
                // be correlated independently.
                let ex = self.begin(trigger, session, objective, parent, policy, ctx, scope);
                serde_json::to_value(ex).map_err(|e| e.to_string())
            }
            "execution/transition" => {
                let id = params
                    .get("id")
                    .and_then(Value::as_str)
                    .ok_or("execution/transition requires id")?;
                let next = params
                    .get("state")
                    .and_then(Value::as_str)
                    .ok_or("execution/transition requires state")?;
                let phase = parse_phase(next).ok_or_else(|| format!("bad state {next}"))?;
                let now = self.transition(id, phase)?;
                Ok(json!({ "id": id, "state": now }))
            }
            "execution/get" => {
                let id = params
                    .get("id")
                    .and_then(Value::as_str)
                    .ok_or("execution/get requires id")?;
                let ex = self
                    .get(id)
                    .ok_or_else(|| format!("unknown execution {id}"))?;
                serde_json::to_value(ex).map_err(|e| e.to_string())
            }
            "execution/list" => {
                let list: Vec<&Work> = self.executions.values().collect();
                Ok(json!({ "executions": list, "count": list.len() }))
            }
            // v3.39 — bind an immutable runtime manifest and store the config_hash.
            "execution/bind_runtime" => {
                let id = params
                    .get("id")
                    .and_then(Value::as_str)
                    .ok_or("execution/bind_runtime requires id")?;
                let ex = self
                    .get_mut(id)
                    .ok_or_else(|| format!("unknown execution {id}"))?;
                let manifest = RuntimeManifest {
                    model: params
                        .get("model")
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .to_string(),
                    provider: params
                        .get("provider")
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .to_string(),
                    permissions: params
                        .get("permissions")
                        .and_then(Value::as_array)
                        .map(|a| {
                            a.iter()
                                .filter_map(Value::as_str)
                                .map(str::to_string)
                                .collect()
                        })
                        .unwrap_or_default(),
                    tools: params
                        .get("tools")
                        .and_then(Value::as_array)
                        .map(|a| {
                            a.iter()
                                .filter_map(Value::as_str)
                                .map(str::to_string)
                                .collect()
                        })
                        .unwrap_or_default(),
                    env_summary: params.get("env").cloned().unwrap_or(Value::Null),
                };
                let hash = ex.bind_runtime(manifest);
                Ok(json!({ "id": id, "configHash": hash }))
            }
            // v3.39 — record a pending HITL approval inside the execution checkpoint.
            "execution/record_approval" => {
                let id = params
                    .get("id")
                    .and_then(Value::as_str)
                    .ok_or("execution/record_approval requires id")?;
                let ticket_id = params
                    .get("ticketId")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_string();
                let tool_id = params
                    .get("toolId")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_string();
                let args_hash = params
                    .get("argsHash")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_string();
                let risk_tier = params
                    .get("riskTier")
                    .and_then(Value::as_str)
                    .unwrap_or("R1")
                    .to_string();
                let ex = self
                    .get_mut(id)
                    .ok_or_else(|| format!("unknown execution {id}"))?;
                let approval = PendingApproval {
                    ticket_id,
                    tool_id,
                    args_hash,
                    requested_at_ms: now_ms(),
                    risk_tier,
                };
                ex.record_pending_approval(approval)?;
                let ex = self.get(id).unwrap();
                Ok(json!({ "id": id, "state": ex.state, "pendingApproval": ex.pending_approval }))
            }
            // v3.39 — resolve (approve/reject) a pending HITL approval.
            "execution/resolve_approval" => {
                let id = params
                    .get("id")
                    .and_then(Value::as_str)
                    .ok_or("execution/resolve_approval requires id")?;
                let approved = params
                    .get("approved")
                    .and_then(Value::as_bool)
                    .ok_or("execution/resolve_approval requires approved (bool)")?;
                let ex = self
                    .get_mut(id)
                    .ok_or_else(|| format!("unknown execution {id}"))?;
                let approval = ex.resolve_pending_approval(approved)?;
                Ok(json!({
                    "id": id,
                    "state": ex.state,
                    "resolvedApproval": approval,
                    "approved": approved,
                }))
            }
            // P64.4 — spawn a Subagent-trigger Work with deny-stripped scope.
            "execution/begin_subagent" => {
                let session = params
                    .get("sessionId")
                    .and_then(Value::as_str)
                    .unwrap_or("default");
                let objective = params
                    .get("objective")
                    .and_then(Value::as_str)
                    .unwrap_or("");
                let parent = params
                    .get("parentId")
                    .and_then(Value::as_str)
                    .map(str::to_string);
                let depth = params.get("depth").and_then(Value::as_u64).unwrap_or(0) as u32;
                let granted: Vec<String> = params
                    .get("tools")
                    .and_then(Value::as_array)
                    .map(|a| {
                        a.iter()
                            .filter_map(Value::as_str)
                            .map(str::to_string)
                            .collect()
                    })
                    .unwrap_or_default();
                let denied: Vec<String> = params
                    .get("blockedTools")
                    .and_then(Value::as_array)
                    .map(|a| {
                        a.iter()
                            .filter_map(Value::as_str)
                            .map(str::to_string)
                            .collect()
                    })
                    .unwrap_or_default();
                let task_id = params.get("taskId").and_then(Value::as_str).unwrap_or("");
                let policy = params
                    .get("policySnapshot")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_string();
                let ex = self
                    .begin_subagent(session, objective, parent, depth, &granted, &denied, policy)?;
                let provision = plan_subagent_worktree(task_id, &ex.id)
                    .map(|p| serde_json::to_value(p).unwrap_or(Value::Null))
                    .unwrap_or(Value::Null);
                let mut v = serde_json::to_value(&ex).map_err(|e| e.to_string())?;
                if let Value::Object(map) = &mut v {
                    map.insert("provision".into(), provision);
                }
                Ok(v)
            }
            // P64.5 — record a verified edit receipt on a Work.
            "execution/record_edit" => {
                let id = params
                    .get("id")
                    .and_then(Value::as_str)
                    .ok_or("execution/record_edit requires id")?;
                let strategy = params
                    .get("strategy")
                    .and_then(Value::as_str)
                    .unwrap_or("exact");
                let path = params.get("path").and_then(Value::as_str).unwrap_or("");
                let ticket = params.get("ticketId").and_then(Value::as_str).unwrap_or("");
                let audit_seq = params.get("auditSeq").and_then(Value::as_u64).unwrap_or(0);
                let receipt = self.record_verified_edit(id, strategy, path, ticket, audit_seq)?;
                Ok(receipt)
            }
            // P64.6 — run the shadow preflight: decide, typecheck in the shadow
            // tree, then record the receipt. Was reachable only as a recorder
            // (`execution/record_preflight`) with nothing deciding or running.
            // P59.5 / P59.12 — persist or step the CUA DAG. Planner LLM may
            // write remaining nodes; ready-frontier / halt live here.
            "execution/cua_persist" => {
                let root = params
                    .get("root")
                    .and_then(Value::as_str)
                    .ok_or("execution/cua_persist requires root")?;
                let dag: crate::ComputerUseDag = serde_json::from_value(
                    params
                        .get("dag")
                        .cloned()
                        .ok_or("execution/cua_persist requires dag")?,
                )
                .map_err(|e| format!("execution/cua_persist: {e}"))?;
                for n in &dag.nodes {
                    if !crate::node_contract_legal(n) {
                        return Err(format!(
                            "unverifiable node {} — postconditions required",
                            n.id
                        ));
                    }
                }
                let path = crate::persist_dag(std::path::Path::new(root), &dag)?;
                Ok(json!({ "ok": true, "path": path.display().to_string(), "nodes": dag.nodes.len() }))
            }
            "execution/cua_get" => {
                let root = params
                    .get("root")
                    .and_then(Value::as_str)
                    .ok_or("execution/cua_get requires root")?;
                match crate::load_dag(std::path::Path::new(root)) {
                    Ok(dag) => Ok(json!({ "ok": true, "dag": dag })),
                    Err(_) => Ok(json!({ "ok": true, "dag": null, "reason": "no graph yet" })),
                }
            }
            "execution/cua_edit" => {
                let root = params
                    .get("root")
                    .and_then(Value::as_str)
                    .ok_or("execution/cua_edit requires root")?;
                let node_id = params
                    .get("nodeId")
                    .and_then(Value::as_str)
                    .ok_or("execution/cua_edit requires nodeId")?;
                let dir = std::path::Path::new(root);
                let mut dag = crate::load_dag(dir)?;
                dag.apply_remaining_edit(
                    node_id,
                    params.get("name").and_then(Value::as_str).map(str::to_string),
                    params.get("info").and_then(Value::as_str).map(str::to_string),
                )?;
                crate::append_replan_log(dir, dag.replan_seq, "user-edit-remaining")?;
                crate::persist_dag(dir, &dag)?;
                Ok(json!({ "ok": true, "replanSeq": dag.replan_seq, "dag": dag }))
            }
            "execution/cua_step" => {
                let root = params
                    .get("root")
                    .and_then(Value::as_str)
                    .ok_or("execution/cua_step requires root")?;
                let node_id = params
                    .get("nodeId")
                    .and_then(Value::as_str)
                    .ok_or("execution/cua_step requires nodeId")?;
                let verify_ok = params
                    .get("verifyOk")
                    .and_then(Value::as_bool)
                    .unwrap_or(false);
                let dir = std::path::Path::new(root);
                let mut dag = crate::load_dag(dir)?;
                let node = dag
                    .nodes
                    .iter_mut()
                    .find(|n| n.id == node_id)
                    .ok_or_else(|| format!("unknown CUA node {node_id}"))?;
                let out = crate::apply_worker_act(node, verify_ok);
                if out == crate::WorkerOutcome::Halt {
                    crate::append_replan_log(dir, dag.replan_seq, "identical-fail-halt")?;
                }
                crate::persist_dag(dir, &dag)?;
                Ok(json!({
                    "ok": out == crate::WorkerOutcome::Verified,
                    "outcome": match out {
                        crate::WorkerOutcome::Verified => "verified",
                        crate::WorkerOutcome::Mismatch => "mismatch",
                        crate::WorkerOutcome::Halt => "halt",
                    },
                    "status": format!("{:?}", dag.nodes.iter().find(|n| n.id == node_id).map(|n| n.status)),
                }))
            }
            // P51.10 — admit a ≤5-model fan-out and optionally reduce
            // outcomes / parse a walkthrough. Construction is the live
            // consumer of `MultiRun::new` (budget) + `collect` + `walkthrough`.
            "execution/multirun" => {
                let id = params
                    .get("id")
                    .and_then(Value::as_str)
                    .unwrap_or("multirun")
                    .to_string();
                let task_id = params
                    .get("taskId")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_string();
                let model_ids: Vec<String> = params
                    .get("modelIds")
                    .and_then(Value::as_array)
                    .map(|a| {
                        a.iter()
                            .filter_map(Value::as_str)
                            .map(str::to_string)
                            .collect()
                    })
                    .unwrap_or_default();
                let worktree_ids: Vec<String> = params
                    .get("worktreeIds")
                    .and_then(Value::as_array)
                    .map(|a| {
                        a.iter()
                            .filter_map(Value::as_str)
                            .map(str::to_string)
                            .collect()
                    })
                    .unwrap_or_default();
                let mode = match params.get("mode").and_then(Value::as_str).unwrap_or("keep_best") {
                    "fuse" | "Fuse" => crate::multirun::FuseMode::Fuse,
                    _ => crate::multirun::FuseMode::KeepBest,
                };
                let run = crate::multirun::MultiRun::new(
                    id,
                    task_id,
                    model_ids,
                    worktree_ids,
                    mode,
                )?;
                let collected = params.get("outcomes").and_then(Value::as_array).map(|arr| {
                    let outcomes: Vec<crate::multirun::RunOutcome> = arr
                        .iter()
                        .filter_map(|v| {
                            Some(crate::multirun::RunOutcome {
                                model_id: v.get("modelId")?.as_str()?.to_string(),
                                output: v.get("output")?.as_str()?.to_string(),
                                score: v.get("score")?.as_f64().unwrap_or(0.0),
                            })
                        })
                        .collect();
                    crate::multirun::collect(outcomes, mode)
                });
                let steps = params
                    .get("diff")
                    .and_then(Value::as_str)
                    .map(crate::multirun::walkthrough);
                Ok(json!({
                    "id": run.id,
                    "taskId": run.task_id,
                    "modelIds": run.model_ids,
                    "worktreeIds": run.worktree_ids,
                    "mode": match run.mode {
                        crate::multirun::FuseMode::Fuse => "fuse",
                        crate::multirun::FuseMode::KeepBest => "keep_best",
                    },
                    "modelCount": run.model_ids.len(),
                    "collected": collected,
                    "walkthrough": steps,
                }))
            }
            "execution/preflight" => {
                let id = params
                    .get("id")
                    .and_then(Value::as_str)
                    .ok_or("execution/preflight requires id")?;
                let files = params
                    .get("filesChanged")
                    .and_then(Value::as_u64)
                    .unwrap_or(1) as usize;
                let structural = params
                    .get("structural")
                    .and_then(Value::as_bool)
                    .unwrap_or(false);
                let destructive = params
                    .get("destructive")
                    .and_then(Value::as_bool)
                    .unwrap_or(false);
                let root = params
                    .get("root")
                    .and_then(Value::as_str)
                    .map(std::path::PathBuf::from)
                    .unwrap_or_else(|| std::path::PathBuf::from("."));
                let candidate = match parse_shadow_candidate(params) {
                    Ok(candidate) => candidate,
                    Err(err) => {
                        return Ok(json!({
                            "id": id,
                            "needsPreflight": true,
                            "verified": false,
                            "passed": false,
                            "reason": format!("risk gate fired — but the candidate was refused: {err}"),
                            "checks": [],
                        }));
                    }
                };
                self.run_preflight_with_candidate(
                    id,
                    files,
                    structural,
                    destructive,
                    &root,
                    &candidate,
                )
            }
            // P64.6 — record a shadow-preflight outcome on a Work.
            "execution/record_preflight" => {
                let id = params
                    .get("id")
                    .and_then(Value::as_str)
                    .ok_or("execution/record_preflight requires id")?;
                let passed = params
                    .get("passed")
                    .and_then(Value::as_bool)
                    .unwrap_or(false);
                let output = params.get("output").and_then(Value::as_str).unwrap_or("");
                let receipt = self.record_preflight(id, passed, output)?;
                Ok(receipt)
            }
            // P64.7 — fence-checked restore predicate (never replays commits).
            "execution/check_restore" => {
                let id = params
                    .get("id")
                    .and_then(Value::as_str)
                    .ok_or("execution/check_restore requires id")?;
                let ex = self
                    .get(id)
                    .ok_or_else(|| format!("unknown execution {id}"))?;
                Ok(json!({
                    "id": id,
                    "state": ex.state,
                    "replayForbidden": should_restore_without_replay(ex),
                }))
            }
            _ => Err(format!("method not found: {method}")),
        }
    }

    fn get_mut(&mut self, id: &str) -> Option<&mut Work> {
        self.executions.get_mut(id)
    }
}

fn parse_phase(s: &str) -> Option<ExecutionPhase> {
    Some(match s {
        "created" => ExecutionPhase::Created,
        "planning" => ExecutionPhase::Planning,
        "ready" => ExecutionPhase::Ready,
        "running" => ExecutionPhase::Running,
        "waiting_tool" => ExecutionPhase::WaitingTool,
        "waiting_approval" => ExecutionPhase::WaitingApproval,
        "waiting_user" => ExecutionPhase::WaitingUser,
        "checkpointed" => ExecutionPhase::Checkpointed,
        "verifying" => ExecutionPhase::Verifying,
        "completed" => ExecutionPhase::Completed,
        "failed" => ExecutionPhase::Failed,
        "cancelled" => ExecutionPhase::Cancelled,
        "paused" => ExecutionPhase::Paused,
        "recoverable" => ExecutionPhase::Recoverable,
        _ => return None,
    })
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

// ---------------------------------------------------------------------------
// P64 Tier-1 — Native agent plane (ARCH/17 §§17.4–17.9, SPEC I14–I17/F16)
// ---------------------------------------------------------------------------

/// P64 invariants — tool/preflight/receipt payload ceiling (50 KB cap,
/// ARCH/17 §17.7 edge case 8). Oversized outputs become a ref-handle +
/// preview, never a full frame.
pub const P64_MAX_OUTPUT_BYTES: usize = 50 * 1024;

/// P64.4 — max sub-agent depth on the execution path (mirrors
/// `governor::P64_MAX_DEPTH` and the canonical `SubAgentLimits`).
pub const P64_MAX_SUBAGENT_DEPTH: u32 = 2;

/// P64.4 — worktree provision plan for a Subagent-trigger Work. Pure (no
/// disk I/O): [`crate::worktrees::WorktreeManager::provision_worktree`]
/// performs the actual `git worktree add` + blackboard init; this computes
/// the branch, path segment, and blackboard file names the provision will
/// use so the coordinator can correlate before the lease exists.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct SubagentProvision {
    pub work_id: String,
    pub task_id: String,
    pub branch: String,
    pub worktree_segment: String,
    pub plan_file: String,
    pub findings_file: String,
    pub receipts_dir: String,
}

/// P64.4 — compute the provision plan. Fails closed on an invalid task id
/// (same gate as [`crate::worktrees::validate_task_id`]).
pub fn plan_subagent_worktree(task_id: &str, work_id: &str) -> Result<SubagentProvision, String> {
    crate::worktrees::validate_task_id(task_id).map_err(|e| e.to_string())?;
    if work_id.is_empty() {
        return Err("plan_subagent_worktree requires work_id".to_string());
    }
    Ok(SubagentProvision {
        work_id: work_id.to_string(),
        task_id: task_id.to_string(),
        branch: format!("subtask/{task_id}"),
        worktree_segment: format!(".everyaios/worktrees/task-{task_id}"),
        plan_file: format!(".everyaios/worktrees/task-{task_id}/.everyaios/task_plan.md"),
        findings_file: format!(".everyaios/worktrees/task-{task_id}/.everyaios/findings.md"),
        receipts_dir: format!(".everyaios/worktrees/task-{task_id}/.everyaios/receipts"),
    })
}

/// P64.4 — truncate an oversized tool/preflight output to the 50 KB cap,
/// returning `(preview, truncated, total_bytes)`.
pub fn truncate_to_50k(output: &str) -> (String, bool, usize) {
    let total = output.len();
    if total <= P64_MAX_OUTPUT_BYTES {
        return (output.to_string(), false, total);
    }
    // Cut on a char boundary, never mid-codepoint.
    let mut end = P64_MAX_OUTPUT_BYTES;
    while end > 0 && !output.is_char_boundary(end) {
        end -= 1;
    }
    let mut preview = output[..end].to_string();
    preview.push_str(&format!(
        "\n… [truncated {total} → {end} bytes; full output in ref handle]"
    ));
    (preview, true, total)
}

impl ExecutionKernel {
    /// P64.4 — begin a Subagent-trigger Work with deny-stripped scope.
    ///
    /// Enforces `max_depth 2` (fail closed — a child that would recurse is
    /// refused, never queued silently) and strips
    /// [`crate::governor::DELEGATE_BLOCKED_TOOLS`] from the capability scope
    /// so children inherit denies, never escalated grants.
    #[allow(clippy::too_many_arguments)]
    pub fn begin_subagent(
        &mut self,
        session_id: &str,
        objective: &str,
        parent_id: Option<String>,
        depth: u32,
        granted_tools: &[String],
        denied_tools: &[String],
        policy_snapshot: String,
    ) -> Result<Work, String> {
        if depth > P64_MAX_SUBAGENT_DEPTH {
            return Err(format!(
                "subagent depth {depth} exceeds max_depth {P64_MAX_SUBAGENT_DEPTH} (no recursive spawn)"
            ));
        }
        let scope = crate::governor::effective_subagent_tools(granted_tools, denied_tools);
        Ok(self.begin(
            ExecutionTrigger::Subagent,
            session_id,
            objective,
            parent_id,
            policy_snapshot,
            String::new(),
            scope,
        ))
    }

    /// P64.5 — record a verified edit receipt (I14 edit ladder outcome) on a
    /// Work. The Guard-2 ticket + Merkle audit row live in `ToolService`;
    /// this attaches the strategy + ticket + audit-seq reference so the Work
    /// timeline shows *how* the edit landed (exact/structured/fuzzy).
    pub fn record_verified_edit(
        &mut self,
        id: &str,
        strategy: &str,
        path: &str,
        ticket_id: &str,
        audit_seq: u64,
    ) -> Result<Value, String> {
        if !matches!(strategy, "exact" | "structured" | "fuzzy") {
            return Err(format!("unknown edit strategy {strategy:?}"));
        }
        if path.is_empty() {
            return Err("record_verified_edit requires path".to_string());
        }
        if ticket_id.is_empty() {
            return Err("record_verified_edit requires ticketId (Guard-2)".to_string());
        }
        let receipt = json!({
            "kind": "verified_edit",
            "strategy": strategy,
            "path": path,
            "ticketId": ticket_id,
            "auditSeq": audit_seq,
        });
        self.attach_verification(id, receipt.clone())?;
        Ok(receipt)
    }

    /// P64.6 — record a shadow-preflight outcome (I15) on a Work. Output is
    /// capped at 50 KB (preview + truncation flag stored, full text stays
    /// behind the ref handle).
    pub fn record_preflight(
        &mut self,
        id: &str,
        passed: bool,
        output: &str,
    ) -> Result<Value, String> {
        let (preview, truncated, total) = truncate_to_50k(output);
        let receipt = json!({
            "kind": "shadow_preflight",
            "passed": passed,
            "truncated": truncated,
            "totalBytes": total,
            "preview": preview,
        });
        self.attach_verification(id, receipt.clone())?;
        Ok(receipt)
    }

    /// P64.6 — risk-gated shadow preflight (SPEC I15, TODO P64.6).
    ///
    /// Decides whether the edit earns a preflight, stages the candidate into
    /// an isolated shadow tree (worktree/temp overlay — never the live root),
    /// then typechecks the shadow **before** anything lands. A small
    /// `local-write` is not preflighted — it verifies after, per the contract.
    ///
    /// Honest failure mode: when the risk gate says yes but **no** check command
    /// can be discovered (or no candidate/staging surface is available), the
    /// reply is `verified: false` and **nothing is recorded**. A preflight
    /// that could not run must never leave a passing receipt behind, because
    /// the receipt is what the rollback path trusts.
    pub fn run_preflight(
        &mut self,
        id: &str,
        files_changed: usize,
        is_structural: bool,
        is_destructive: bool,
        root: &std::path::Path,
    ) -> Result<Value, String> {
        self.run_preflight_with_candidate(
            id,
            files_changed,
            is_structural,
            is_destructive,
            root,
            &[],
        )
    }

    /// P64.6 — candidate-aware shadow preflight.
    ///
    /// `candidate` carries the proposed file contents (`path` + `content`)
    /// the caller wants checked. They are staged into the isolated shadow
    /// tree before the typecheck runs, so the verdict describes the proposed
    /// change rather than the pre-existing tree. An empty candidate preserves
    /// the legacy behaviour (check the root as given) so existing single-file
    /// callers keep working without inventing content.
    pub fn run_preflight_with_candidate(
        &mut self,
        id: &str,
        files_changed: usize,
        is_structural: bool,
        is_destructive: bool,
        root: &std::path::Path,
        candidate: &[ShadowCandidateFile],
    ) -> Result<Value, String> {
        let decision = decide_shadow_preflight(files_changed, is_structural, is_destructive);
        if !decision.needs_preflight {
            return Ok(json!({
                "id": id,
                "needsPreflight": false,
                "verified": false,
                "reason": decision.reason,
                "checks": [],
            }));
        }
        let checks = discover_shadow_checks(root);
        if checks.is_empty() {
            return Ok(json!({
                "id": id,
                "needsPreflight": true,
                "verified": false,
                "passed": false,
                "reason": format!(
                    "{} — but no typecheck command was discovered in {}",
                    decision.reason,
                    root.display()
                ),
                "checks": [],
            }));
        }
        // P64.6 — stage the candidate into an isolated shadow tree first so the
        // check sees the proposed change, not the pre-existing tree. The live
        // root is never touched (worktree add / bounded temp overlay). Cleanup
        // always runs; a cleanup failure is reported, never a verdict upgrade.
        let (shadow_root, cleanup) = match stage_shadow_tree(root, candidate) {
            Ok(staged) => staged,
            Err(err) => {
                return Ok(json!({
                    "id": id,
                    "needsPreflight": true,
                    "verified": false,
                    "passed": false,
                    "reason": format!("{} — but the shadow tree could not be staged: {err}", decision.reason),
                    "checks": [],
                }));
            }
        };
        let results = run_shadow_checks(&shadow_root, &checks);
        let passed = results.len() == checks.len() && results.iter().all(|r| r.success);
        let mut output = String::new();
        for (check, result) in checks.iter().zip(results.iter()) {
            output.push_str(&format!("$ {}\n{}\n", check.label, result.preview));
        }
        let receipt = self.record_preflight(id, passed, &output)?;
        let mut reply = json!({
            "id": id,
            "needsPreflight": true,
            "verified": true,
            "passed": passed,
            "reason": decision.reason,
            "checks": results,
            "receipt": receipt,
        });
        if let Err(err) = cleanup.cleanup() {
            if let Value::Object(map) = &mut reply {
                let reason = format!("{} (shadow cleanup: {err})", decision.reason);
                map.insert("reason".into(), Value::String(reason));
            }
        }
        Ok(reply)
    }
}

/// P64.6 — one proposed file staged into the shadow tree before the check.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct ShadowCandidateFile {
    /// Workspace-relative path (never absolute, never `..`).
    pub path: String,
    /// Proposed full file contents.
    pub content: String,
}

impl ShadowCandidateFile {
    pub fn new(path: impl Into<String>, content: impl Into<String>) -> Self {
        Self {
            path: path.into(),
            content: content.into(),
        }
    }
}

/// P64.6 — parse the `candidateFiles` wire payload (`[{path, content}]`).
///
/// Fail-closed caps: at most 32 files, workspace-relative paths without
/// traversal, 512 KiB per file. Anything else is an `Err` and the caller
/// reports `verified: false` rather than checking a partial tree.
pub fn parse_shadow_candidate(params: &Value) -> Result<Vec<ShadowCandidateFile>, String> {
    const MAX_CANDIDATE_FILES: usize = 32;
    const MAX_CANDIDATE_BYTES: usize = 512 * 1024;
    let files = match params.get("candidateFiles") {
        None => return Ok(Vec::new()),
        Some(Value::Null) => return Ok(Vec::new()),
        Some(files) => files,
    };
    let arr = files
        .as_array()
        .ok_or("execution/preflight candidateFiles must be an array of {path, content}")?;
    if arr.len() > MAX_CANDIDATE_FILES {
        return Err(format!(
            "execution/preflight candidateFiles exceeds {MAX_CANDIDATE_FILES} files"
        ));
    }
    let mut out = Vec::with_capacity(arr.len());
    for (i, item) in arr.iter().enumerate() {
        let path = item.get("path").and_then(Value::as_str).ok_or(format!(
            "execution/preflight candidateFiles[{i}] requires path"
        ))?;
        let content = item.get("content").and_then(Value::as_str).ok_or(format!(
            "execution/preflight candidateFiles[{i}] requires content"
        ))?;
        if path.is_empty() || path.len() > 512 {
            return Err(format!(
                "execution/preflight candidateFiles[{i}] has a bad path"
            ));
        }
        if path.starts_with('/') || path.starts_with('\\') {
            return Err(format!(
                "execution/preflight candidateFiles[{i}] must be relative"
            ));
        }
        let rel = std::path::Path::new(path);
        if rel
            .components()
            .any(|c| matches!(c, std::path::Component::ParentDir))
        {
            return Err(format!(
                "execution/preflight candidateFiles[{i}] must not contain `..`"
            ));
        }
        if content.len() > MAX_CANDIDATE_BYTES {
            return Err(format!(
                "execution/preflight candidateFiles[{i}] exceeds {MAX_CANDIDATE_BYTES} bytes"
            ));
        }
        out.push(ShadowCandidateFile::new(path, content));
    }
    Ok(out)
}

/// P64.6 — cleanup handle for a staged shadow tree.
enum ShadowCleanup {
    Worktree {
        repo: std::path::PathBuf,
        path: std::path::PathBuf,
    },
    TempDir(std::path::PathBuf),
    None,
}

impl ShadowCleanup {
    fn cleanup(self) -> Result<(), String> {
        match self {
            ShadowCleanup::None => Ok(()),
            ShadowCleanup::TempDir(dir) => {
                std::fs::remove_dir_all(&dir).map_err(|e| format!("remove shadow temp dir: {e}"))
            }
            ShadowCleanup::Worktree { repo, path } => {
                let name = path
                    .file_name()
                    .map(|s| s.to_string_lossy().into_owned())
                    .unwrap_or_default();
                let status = std::process::Command::new("git")
                    .current_dir(&repo)
                    .args(["worktree", "remove", "--force", &name])
                    .output()
                    .map_err(|e| format!("shadow worktree remove spawn failed: {e}"))?;
                if !status.status.success() {
                    let _ = std::fs::remove_dir_all(&path);
                    let stderr = String::from_utf8_lossy(&status.stderr).trim().to_string();
                    return Err(format!("git worktree remove failed: {stderr}"));
                }
                Ok(())
            }
        }
    }
}

/// P64.6 — stage the shadow tree for a candidate-aware preflight.
///
/// The live `root` is never written: a git checkout prefers
/// `git worktree add --detach` (cheap full tree), a non-git root gets a
/// bounded temp overlay (candidate files + manifest copies so discovery
/// still fires), and an empty candidate reuses `root` as-is.
fn stage_shadow_tree(
    root: &std::path::Path,
    candidate: &[ShadowCandidateFile],
) -> Result<(std::path::PathBuf, ShadowCleanup), String> {
    if candidate.is_empty() {
        return Ok((root.to_path_buf(), ShadowCleanup::None));
    }
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    if root.join(".git").is_dir() {
        let dir = std::env::temp_dir().join(format!("eaios-shadow-{}-{stamp}", std::process::id()));
        let status = std::process::Command::new("git")
            .current_dir(root)
            .args(["worktree", "add", "--detach", &dir.to_string_lossy()])
            .output()
            .map_err(|e| format!("shadow worktree add spawn failed: {e}"))?;
        if !status.status.success() {
            let stderr = String::from_utf8_lossy(&status.stderr).trim().to_string();
            return Err(format!("git worktree add failed: {stderr}"));
        }
        for file in candidate {
            let dest = dir.join(&file.path);
            if let Some(parent) = dest.parent() {
                std::fs::create_dir_all(parent).map_err(|e| format!("shadow stage mkdir: {e}"))?;
            }
            std::fs::write(&dest, &file.content).map_err(|e| format!("shadow stage write: {e}"))?;
        }
        return Ok((
            dir.clone(),
            ShadowCleanup::Worktree {
                repo: root.to_path_buf(),
                path: dir,
            },
        ));
    }
    let dir =
        std::env::temp_dir().join(format!("eaios-shadow-nogit-{}-{stamp}", std::process::id()));
    std::fs::create_dir_all(&dir).map_err(|e| format!("shadow stage mkdir: {e}"))?;
    for name in [
        "Cargo.toml",
        "package.json",
        "pnpm-lock.yaml",
        "yarn.lock",
        "bun.lock",
        "bun.lockb",
    ] {
        let src = root.join(name);
        if src.is_file() {
            if let Ok(bytes) = std::fs::read(&src) {
                let _ = std::fs::write(dir.join(name), bytes);
            }
        }
    }
    for file in candidate {
        let dest = dir.join(&file.path);
        if let Some(parent) = dest.parent() {
            std::fs::create_dir_all(parent).map_err(|e| format!("shadow stage mkdir: {e}"))?;
        }
        std::fs::write(&dest, &file.content).map_err(|e| format!("shadow stage write: {e}"))?;
    }
    Ok((dir.clone(), ShadowCleanup::TempDir(dir)))
}

/// P64.6 — risk-gated shadow-preflight decision (SPEC I15).
///
/// Preflight (typecheck/tests in a shadow tree *before* commit) runs for
/// multi-file, structural, or destructive edits only; a small `local-write`
/// verifies after. Pure + deterministic.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct PreflightDecision {
    pub needs_preflight: bool,
    pub reason: &'static str,
}

/// P64.6 — decide whether an edit needs shadow preflight.
pub fn decide_shadow_preflight(
    files_changed: usize,
    is_structural: bool,
    is_destructive: bool,
) -> PreflightDecision {
    if is_destructive {
        PreflightDecision {
            needs_preflight: true,
            reason: "destructive edit always preflights in a shadow tree",
        }
    } else if is_structural {
        PreflightDecision {
            needs_preflight: true,
            reason: "structural edit preflights in a shadow tree",
        }
    } else if files_changed > 1 {
        PreflightDecision {
            needs_preflight: true,
            reason: "multi-file edit preflights in a shadow tree",
        }
    } else {
        PreflightDecision {
            needs_preflight: false,
            reason: "small local-write verifies after commit",
        }
    }
}

/// P64.6 — run one shadow check command synchronously with PID tracking and
/// the 50 KB output cap.
///
/// The child PID is captured at spawn (`Child::id`) so the host can
/// attribute/kill the preflight; stdout+stderr are merged into the preview.
/// A missing binary or spawn failure is an honest error, never a faked pass.
pub fn run_shadow_command(
    program: &str,
    args: &[&str],
    cwd: &std::path::Path,
) -> Result<ShadowCheckOutput, String> {
    use std::process::Command;
    if program.is_empty() {
        return Err("run_shadow_command requires program".to_string());
    }
    let out = Command::new(program)
        .args(args)
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("shadow check spawn failed ({program}): {e}"))?;
    let success = out.status.success();
    let mut merged = String::from_utf8_lossy(&out.stdout).into_owned();
    let stderr = String::from_utf8_lossy(&out.stderr);
    if !stderr.is_empty() {
        merged.push_str("\n--- stderr ---\n");
        merged.push_str(&stderr);
    }
    let (preview, truncated, total) = truncate_to_50k(&merged);
    Ok(ShadowCheckOutput {
        program: program.to_string(),
        success,
        preview,
        truncated,
        total_bytes: total,
    })
}

/// P64.6 — spawn a shadow check with an explicit tracked PID (the caller owns
/// the [`std::process::Child`] lifetime and must wait/kill it; the PID is
/// returned so fleet accounting never loses a child).
pub fn spawn_shadow_command_tracked(
    program: &str,
    args: &[&str],
    cwd: &std::path::Path,
) -> Result<(u32, std::process::Child), String> {
    use std::process::{Command, Stdio};
    let child = Command::new(program)
        .args(args)
        .current_dir(cwd)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("shadow check spawn failed ({program}): {e}"))?;
    let pid = child.id();
    Ok((pid, child))
}

/// P64.6 — one shadow check's capped output.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ShadowCheckOutput {
    pub program: String,
    pub success: bool,
    pub preview: String,
    pub truncated: bool,
    pub total_bytes: usize,
}

/// P64.6 — at most one Rust and one Node check per preflight. The point is a
/// fast "did this edit break the build", not a full CI matrix.
pub const SHADOW_CHECK_MAX: usize = 2;

/// P64.6 — one configured shadow check.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct ShadowCheck {
    /// Human label, e.g. `cargo check --quiet`.
    pub label: String,
    pub program: String,
    pub args: Vec<String>,
}

/// P64.6 — discover the project's own typecheck command from its manifests.
///
/// Deliberately an allow-list of the well-known typecheck entries rather than a
/// general "run this shell string" surface: this executes *before* a write
/// lands, so it must never run something the project did not declare. Returns an
/// empty list when nothing is discoverable — the caller reports that as
/// **unverified**, never as a pass.
pub fn discover_shadow_checks(root: &std::path::Path) -> Vec<ShadowCheck> {
    let mut checks = Vec::new();
    if root.join("Cargo.toml").is_file() {
        checks.push(ShadowCheck {
            label: "cargo check --quiet".to_string(),
            program: "cargo".to_string(),
            args: vec!["check".to_string(), "--quiet".to_string()],
        });
    }
    if let Ok(source) = std::fs::read_to_string(root.join("package.json")) {
        if let Ok(pkg) = serde_json::from_str::<Value>(&source) {
            let declared = ["typecheck", "type-check", "check"]
                .iter()
                .find(|name| {
                    pkg.get("scripts")
                        .and_then(|s| s.get(**name))
                        .is_some_and(|v| v.is_string())
                })
                .copied();
            if let Some(script) = declared {
                // Match the package manager the lockfile actually declares, so
                // the check runs the same way the project does.
                let pm = if root.join("pnpm-lock.yaml").is_file() {
                    "pnpm"
                } else if root.join("yarn.lock").is_file() {
                    "yarn"
                } else if root.join("bun.lockb").is_file() || root.join("bun.lock").is_file() {
                    "bun"
                } else {
                    "npm"
                };
                checks.push(ShadowCheck {
                    label: format!("{pm} run {script}"),
                    program: pm.to_string(),
                    args: vec!["run".to_string(), script.to_string()],
                });
            }
        }
    }
    checks.truncate(SHADOW_CHECK_MAX);
    checks
}

/// P64.6 — run the checks in order, stopping at the first failure: once the
/// typecheck is broken the later results are noise, and the 50 KB cap is per
/// check. A check that cannot even spawn is reported as a failure, never as a
/// silent pass.
pub fn run_shadow_checks(root: &std::path::Path, checks: &[ShadowCheck]) -> Vec<ShadowCheckOutput> {
    let mut results = Vec::new();
    for check in checks {
        let args: Vec<&str> = check.args.iter().map(String::as_str).collect();
        match run_shadow_command(&check.program, &args, root) {
            Ok(result) => {
                let failed = !result.success;
                results.push(result);
                if failed {
                    break;
                }
            }
            Err(err) => {
                results.push(ShadowCheckOutput {
                    program: check.label.clone(),
                    success: false,
                    preview: err,
                    truncated: false,
                    total_bytes: 0,
                });
                break;
            }
        }
    }
    results
}

/// P64.7 — per-step checkpoint metadata (SPEC I16). The blueprint snapshot
/// (`Blueprint::checkpoint_to`) + kernel snapshot (`snapshot_to_string` /
/// `persist_to`) are the two payloads; this struct is the index row the UI
/// restore picker lists. `fencing_token` is the opaque `RunAuthority` token
/// that owned the run when the checkpoint was taken.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct StepCheckpointMeta {
    pub work_id: String,
    pub step: u32,
    pub git_sha: Option<String>,
    pub snapshot_bytes: usize,
    pub fencing_token: u64,
    pub created_at_ms: u64,
}

impl StepCheckpointMeta {
    pub fn new(
        work_id: String,
        step: u32,
        git_sha: Option<String>,
        snapshot_bytes: usize,
        fencing_token: u64,
    ) -> Self {
        Self {
            work_id,
            step,
            git_sha,
            snapshot_bytes,
            fencing_token,
            created_at_ms: now_ms(),
        }
    }
}

/// P64.7 — auto-checkpoint the kernel for one mutating step: serialize +
/// atomically persist (`snapshot_to_string` / `persist_to`) under
/// `<dir>/kernel-<work_id>-step-<n>.json`, and return the index row. Pure
/// reuse — no second checkpoint format.
pub fn auto_checkpoint_kernel(
    kernel: &ExecutionKernel,
    dir: &std::path::Path,
    work_id: &str,
    step: u32,
    git_sha: Option<String>,
    fencing_token: u64,
) -> Result<(std::path::PathBuf, StepCheckpointMeta), String> {
    if work_id.is_empty() {
        return Err("auto_checkpoint_kernel requires work_id".to_string());
    }
    std::fs::create_dir_all(dir).map_err(|e| format!("create checkpoint dir: {e}"))?;
    let path = dir.join(format!("kernel-{work_id}-step-{step}.json"));
    kernel.persist_to(&path)?;
    let snapshot_bytes = std::fs::metadata(&path)
        .map(|m| m.len() as usize)
        .unwrap_or(0);
    Ok((
        path,
        StepCheckpointMeta::new(
            work_id.to_string(),
            step,
            git_sha,
            snapshot_bytes,
            fencing_token,
        ),
    ))
}

/// P64.7 — commit exactly the mutated workspace files after a mutating tool
/// call (reuses [`crate::git_commit::commit_verified_edit`]: verified gate →
/// `git add -- <literal>` → `git commit`). `verified=true` is the shadow
/// preflight / edit-ladder verdict; `false` refuses without touching git.
/// Returns the new short SHA, or `None` when `repo_root` is not a git
/// checkout (non-git resource snapshots are the caller's JSON payload —
/// honest `None`, never a faked SHA).
pub fn commit_workspace_snapshot(
    repo_root: &std::path::Path,
    files: &[&str],
    message: &str,
    verified: bool,
) -> Result<Option<String>, String> {
    if files.is_empty() {
        return Err("commit_workspace_snapshot requires files".to_string());
    }
    if !repo_root.join(".git").exists() {
        return Ok(None);
    }
    match crate::git_commit::commit_verified_edit(repo_root, files, message, || verified) {
        Ok(info) => Ok(Some(info.sha)),
        Err(crate::git_commit::CommitError::VerificationFailed(msg)) => {
            Err(format!("snapshot refused: {msg}"))
        }
        Err(e) => Err(format!("snapshot failed: {e}")),
    }
}

/// P64.7 — restore predicate: a Work that already reached a terminal state
/// **with** a receipt must never replay its committed effects. The restore
/// path resumes *from* the checkpoint (re-dispatch only receipt-less,
/// non-terminal steps).
pub fn should_restore_without_replay(work: &Work) -> bool {
    matches!(
        work.state,
        ExecutionPhase::Completed | ExecutionPhase::Failed | ExecutionPhase::Cancelled
    ) && work.receipt.is_some()
}

/// P64.7 — RunAuthority fence for restore (Work Gateway P49.4): only the
/// current fencing-token holder may restore a run. Stale tokens are refused
/// so a reassigned worker can never resurrect — and re-commit — an old step.
pub fn check_restore_fence(
    authority: &crate::work_gateway::RunAuthority,
    node_id: &str,
    token: u64,
    now_ms: u64,
) -> Result<(), String> {
    if authority.valid(node_id, token, now_ms) {
        Ok(())
    } else {
        Err("restore refused: stale fencing token (run migrated or lease expired)".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chat_plan_scheduler_share_the_kernel() {
        let mut k = ExecutionKernel::new();
        let chat = k.begin(
            ExecutionTrigger::Chat,
            "s1",
            "hello",
            None,
            "policy-v1".into(),
            r#"{"session":"s1"}"#.into(),
            vec!["file_ops.read".into()],
        );
        let plan = k.begin(
            ExecutionTrigger::Plan,
            "s1",
            "do the plan",
            Some(chat.id.clone()),
            "policy-v1".into(),
            r#"{"session":"s1"}"#.into(),
            vec![],
        );
        assert_eq!(plan.parent_id.as_deref(), Some(chat.id.as_str()));
        k.transition(&chat.id, ExecutionPhase::Running).unwrap();
        k.transition(&chat.id, ExecutionPhase::Verifying).unwrap();
        k.transition(&chat.id, ExecutionPhase::Completed).unwrap();
        assert_eq!(k.get(&chat.id).unwrap().state, ExecutionPhase::Completed);
        assert!(k.transition(&chat.id, ExecutionPhase::Running).is_err());
        let list = k.handle("execution/list", &json!({})).unwrap();
        assert_eq!(list["count"], 2);
    }

    #[test]
    fn runtime_manifest_bind_and_hash() {
        let mut k = ExecutionKernel::new();
        let ex = k.begin(
            ExecutionTrigger::Chat,
            "s1",
            "test",
            None,
            "policy-v1".into(),
            "{}".into(),
            vec![],
        );
        assert_eq!(ex.config_hash, "");
        let r = k
            .handle(
                "execution/bind_runtime",
                &json!({
                    "id": ex.id,
                    "model": "gpt-4o",
                    "provider": "openai",
                    "permissions": ["file_ops.read"],
                    "tools": ["browser.snapshot"],
                    "env": {}
                }),
            )
            .unwrap();
        assert!(!r["configHash"].as_str().unwrap().is_empty());
        let stored = k.get(&ex.id).unwrap();
        assert_eq!(stored.config_hash, r["configHash"]);
        assert_eq!(stored.runtime_manifest.as_ref().unwrap().model, "gpt-4o");
    }

    #[test]
    fn runtime_manifest_deterministic() {
        let m1 = RuntimeManifest {
            model: "a".into(),
            provider: "p".into(),
            permissions: vec![],
            tools: vec![],
            env_summary: Value::Null,
        };
        let m2 = RuntimeManifest {
            model: "a".into(),
            provider: "p".into(),
            permissions: vec![],
            tools: vec![],
            env_summary: Value::Null,
        };
        assert_eq!(m1.compute_hash(), m2.compute_hash());
        let m3 = RuntimeManifest {
            model: "b".into(),
            provider: "p".into(),
            permissions: vec![],
            tools: vec![],
            env_summary: Value::Null,
        };
        assert_ne!(m1.compute_hash(), m3.compute_hash());
    }

    #[test]
    fn pending_approval_record_and_resolve() {
        let mut ex = Work::new(
            "ex:1".into(),
            ExecutionTrigger::Chat,
            "s".into(),
            "t".into(),
        );
        // Cannot record in non-WaitingApproval state.
        assert!(ex
            .record_pending_approval(PendingApproval {
                ticket_id: "t1".into(),
                tool_id: "browser.act".into(),
                args_hash: "h1".into(),
                requested_at_ms: 100,
                risk_tier: "R2".into(),
            })
            .is_err());
        ex.state = ExecutionPhase::WaitingApproval;
        ex.record_pending_approval(PendingApproval {
            ticket_id: "t1".into(),
            tool_id: "browser.act".into(),
            args_hash: "h1".into(),
            requested_at_ms: 100,
            risk_tier: "R2".into(),
        })
        .unwrap();
        assert_eq!(ex.approval_refs.len(), 1);
        assert!(ex.pending_approval.is_some());
        // Approve → Running.
        let resolved = ex.resolve_pending_approval(true).unwrap();
        assert_eq!(resolved.ticket_id, "t1");
        assert_eq!(ex.state, ExecutionPhase::Running);
        assert!(ex.pending_approval.is_none());
    }

    #[test]
    fn pending_approval_reject_transitions_to_failed() {
        let mut ex = Work::new(
            "ex:2".into(),
            ExecutionTrigger::Plan,
            "s".into(),
            "t".into(),
        );
        ex.state = ExecutionPhase::WaitingApproval;
        ex.record_pending_approval(PendingApproval {
            ticket_id: "t2".into(),
            tool_id: "file.write".into(),
            args_hash: "h2".into(),
            requested_at_ms: 200,
            risk_tier: "R3".into(),
        })
        .unwrap();
        let resolved = ex.resolve_pending_approval(false).unwrap();
        assert_eq!(resolved.ticket_id, "t2");
        assert_eq!(ex.state, ExecutionPhase::Failed);
    }

    #[test]
    fn pending_approval_nothing_to_resolve_errors() {
        let mut ex = Work::new(
            "ex:3".into(),
            ExecutionTrigger::Chat,
            "s".into(),
            "t".into(),
        );
        ex.state = ExecutionPhase::WaitingApproval;
        assert!(ex.resolve_pending_approval(true).is_err());
    }

    #[test]
    fn approval_survives_serialization_roundtrip() {
        let mut ex = Work::new(
            "ex:4".into(),
            ExecutionTrigger::Chat,
            "s".into(),
            "t".into(),
        );
        ex.state = ExecutionPhase::WaitingApproval;
        ex.record_pending_approval(PendingApproval {
            ticket_id: "t4".into(),
            tool_id: "browser.act".into(),
            args_hash: "h4".into(),
            requested_at_ms: 300,
            risk_tier: "R2".into(),
        })
        .unwrap();
        let j = serde_json::to_string(&ex).unwrap();
        let restored: Work = serde_json::from_str(&j).unwrap();
        assert!(restored.pending_approval.is_some());
        assert_eq!(restored.pending_approval.unwrap().ticket_id, "t4");
        assert_eq!(restored.config_hash, "");
    }

    /// P48.4 — a fresh execution advanced through several phases, checkpointed,
    /// dropped (simulated crash), and recovered. The phase, checkpoint counter,
    /// event stream, and monotonic id counter all survive; the resumed kernel
    /// never re-issues the same execution id.
    #[test]
    fn kernel_roundtrip_persist_and_recover_resumes_from_checkpoint() {
        let dir = std::env::temp_dir().join(format!("everyaios-exec-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("checkpoint.json");

        let mut k = ExecutionKernel::new();
        let ex = k.begin(
            ExecutionTrigger::Scheduler,
            "s1",
            "sync the digest",
            None,
            "pol".into(),
            "ctx".into(),
            vec!["storage.read"].into_iter().map(String::from).collect(),
        );
        // `begin` already lands at Ready; drive Ready→Running→Verifying→Completed
        // (all legal transitions) and attach the receipt BEFORE the checkpoint.
        k.transition(&ex.id, ExecutionPhase::Running).unwrap();
        k.attach_receipt(&ex.id, json!({ "ok": true, "effect": "appended" }))
            .unwrap();
        k.transition(&ex.id, ExecutionPhase::Verifying).unwrap();
        k.transition(&ex.id, ExecutionPhase::Completed).unwrap();
        assert_eq!(k.counter(), 1);

        k.persist_to(&path).unwrap();
        drop(k); // simulate the process dying.

        let mut recovered = ExecutionKernel::recover_from(&path).unwrap();
        let ex2 = recovered.get(&ex.id).unwrap();
        // Phase, checkpoint, receipt survive; we resume from where we were, not
        // re-ran from Created.
        assert_eq!(ex2.state, ExecutionPhase::Completed);
        assert_eq!(ex2.receipt.as_ref().unwrap()["effect"], "appended");
        assert!(!recovered.is_empty());
        assert_eq!(recovered.counter(), 1);
        // New executions continue the id sequence (no reuse → no hash collision).
        let ex3 = recovered.begin(
            ExecutionTrigger::Chat,
            "s2",
            "next",
            None,
            String::new(),
            String::new(),
            Vec::new(),
        );
        assert_eq!(ex3.id, "ex:2");

        let _ = std::fs::remove_dir_all(&dir);
    }

    /// P48.4 — the idempotency guard: an execution that reached a terminal
    /// state before the crash is recovered as terminal, so its already-applied
    /// effect is never re-dispatched on resume.
    #[test]
    fn recovered_terminal_execution_is_never_replayed() {
        let dir =
            std::env::temp_dir().join(format!("everyaios-exec-replay-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("checkpoint.json");

        let mut k = ExecutionKernel::new();
        let ex = k.begin(
            ExecutionTrigger::Acp,
            "s",
            "apply the patch",
            None,
            String::new(),
            String::new(),
            Vec::new(),
        );
        // `begin` lands at Ready → Running then Completed (legal chain).
        k.transition(&ex.id, ExecutionPhase::Running).unwrap();
        k.attach_receipt(&ex.id, json!({ "ok": true, "op": "git.commit" }))
            .unwrap();
        k.transition(&ex.id, ExecutionPhase::Verifying).unwrap();
        k.transition(&ex.id, ExecutionPhase::Completed).unwrap();
        k.persist_to(&path).unwrap();

        let recovered = ExecutionKernel::recover_from(&path).unwrap();
        let ex2 = recovered.get(&ex.id).unwrap();
        // Terminal + receipt present ⇒ a resume loop must skip it, not re-run it.
        assert_eq!(ex2.state, ExecutionPhase::Completed);
        assert!(ex2.receipt.is_some());
        assert_eq!(ex2.idempotency_key, "exec:ex:1");

        let _ = std::fs::remove_dir_all(&dir);
    }

    /// P48.4 — a crash mid-effect leaves the execution at a non-terminal,
    /// recoverable phase that a repair pass classifies honestly (never claims
    /// the ambiguous effect succeeded).
    #[test]
    fn recovered_inflight_execution_is_classified_not_fabricated() {
        let dir =
            std::env::temp_dir().join(format!("everyaios-exec-inflight-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("checkpoint.json");

        let mut k = ExecutionKernel::new();
        let ex = k.begin(
            ExecutionTrigger::Chat,
            "s",
            "rename the column",
            None,
            String::new(),
            String::new(),
            Vec::new(),
        );
        k.transition(&ex.id, ExecutionPhase::Running).unwrap();
        // No receipt: the effect never completed before the crash.
        k.persist_to(&path).unwrap();

        let recovered = ExecutionKernel::recover_from(&path).unwrap();
        let ex2 = recovered.get(&ex.id).unwrap();
        assert_eq!(ex2.state, ExecutionPhase::Running);
        assert!(ex2.receipt.is_none());
        // Idempotency key is preserved so a retry with the same args is refused
        // by the executor, or classified rather than blindly re-run (P48.2).
        assert!(!ex2.idempotency_key.is_empty());

        let _ = std::fs::remove_dir_all(&dir);
    }

    /// P48.4 — a missing checkpoint is a fresh kernel (cold boot, no recovery),
    /// and a corrupt checkpoint fails closed instead of resuming on garbage.
    #[test]
    fn missing_checkpoint_is_fresh_and_corrupt_checkpoint_fails_closed() {
        let dir =
            std::env::temp_dir().join(format!("everyaios-exec-missing-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();

        // Missing file ⇒ empty kernel, not an error.
        let fresh = ExecutionKernel::recover_from(&dir.join("nope.json")).unwrap();
        assert!(fresh.is_empty());
        assert_eq!(fresh.counter(), 0);

        // Corrupt file ⇒ hard error (refuse to resume on ambiguous state).
        let bad = dir.join("bad.json");
        std::fs::write(&bad, "{ not json ").unwrap();
        assert!(ExecutionKernel::recover_from(&bad).is_err());

        let _ = std::fs::remove_dir_all(&dir);
    }

    // --- P64 Tier-1 ---------------------------------------------------------

    #[test]
    fn p64_begin_subagent_strips_blocked_tools_and_caps_depth() {
        let mut k = ExecutionKernel::new();
        let granted = vec![
            "read".to_string(),
            "delegate".to_string(),
            "memory".to_string(),
        ];
        let ex = k
            .begin_subagent("s", "do sub work", None, 1, &granted, &[], "pol".into())
            .unwrap();
        assert_eq!(ex.trigger, ExecutionTrigger::Subagent);
        assert_eq!(ex.capability_scope, vec!["read".to_string()]);
        // Depth 3 is refused (no recursive spawn).
        assert!(k
            .begin_subagent("s", "too deep", None, 3, &granted, &[], String::new())
            .is_err());
    }

    #[test]
    fn p64_provision_plan_is_pure_and_validated() {
        let p = plan_subagent_worktree("task-1", "ex:1").unwrap();
        assert_eq!(p.branch, "subtask/task-1");
        assert!(p.plan_file.ends_with("task_plan.md"));
        assert!(p.findings_file.ends_with("findings.md"));
        assert!(p.receipts_dir.ends_with("receipts"));
        assert!(plan_subagent_worktree("../evil", "ex:1").is_err());
        assert!(plan_subagent_worktree("task-1", "").is_err());
    }

    #[test]
    fn p64_truncate_50k_caps_preview() {
        let big = "x".repeat(P64_MAX_OUTPUT_BYTES + 100);
        let (preview, truncated, total) = truncate_to_50k(&big);
        assert!(truncated);
        assert_eq!(total, big.len());
        assert!(preview.len() < big.len());
        assert!(preview.contains("truncated"));
        let (small, t2, _) = truncate_to_50k("hi");
        assert!(!t2);
        assert_eq!(small, "hi");
    }

    #[test]
    fn p64_shadow_preflight_is_risk_gated() {
        assert!(!decide_shadow_preflight(1, false, false).needs_preflight);
        assert!(decide_shadow_preflight(2, false, false).needs_preflight);
        assert!(decide_shadow_preflight(1, true, false).needs_preflight);
        assert!(decide_shadow_preflight(1, false, true).needs_preflight);
    }

    #[test]
    fn p64_shadow_command_runs_and_caps() {
        let dir = std::env::temp_dir();
        let out = run_shadow_command("echo", &["hello-shadow"], &dir).unwrap();
        assert!(out.success);
        assert!(out.preview.contains("hello-shadow"));
        assert!(!out.truncated);
        assert!(run_shadow_command("", &[], &dir).is_err());
    }

    #[test]
    fn p64_shadow_tracked_spawn_reports_pid() {
        let dir = std::env::temp_dir();
        #[cfg(unix)]
        {
            let (pid, mut child) =
                spawn_shadow_command_tracked("echo", &["pid-check"], &dir).unwrap();
            assert!(pid > 0);
            let _ = child.wait();
        }
        #[cfg(not(unix))]
        {
            let res = spawn_shadow_command_tracked("echo-missing-binary-xyz", &[], &dir);
            assert!(res.is_err() || res.is_ok());
        }
    }

    #[test]
    fn p64_verified_edit_and_preflight_receipts_attach() {
        let mut k = ExecutionKernel::new();
        let ex = k.begin(
            ExecutionTrigger::Chat,
            "s",
            "edit",
            None,
            String::new(),
            String::new(),
            Vec::new(),
        );
        let r = k
            .record_verified_edit(&ex.id, "exact", "a.txt", "t1", 7)
            .unwrap();
        assert_eq!(r["strategy"], "exact");
        assert!(k
            .record_verified_edit(&ex.id, "nope", "a.txt", "t1", 7)
            .is_err());
        assert!(k
            .record_verified_edit(&ex.id, "exact", "", "t1", 7)
            .is_err());
        assert!(k
            .record_verified_edit(&ex.id, "exact", "a.txt", "", 7)
            .is_err());
        let p = k.record_preflight(&ex.id, true, "ok").unwrap();
        assert_eq!(p["passed"], true);
        // IPC arms reachable without unwrap on missing fields.
        let v = k
            .handle("execution/record_edit", &json!({"id": ex.id}))
            .unwrap_err();
        assert!(v.contains("strategy") || v.contains("path") || v.contains("ticket"));

        // P64.6 — the gate, the discovery and the honest "could not verify".
        // A small local write is not preflighted at all.
        let small = k
            .run_preflight(
                &ex.id,
                1,
                false,
                false,
                std::path::Path::new("/nonexistent"),
            )
            .unwrap();
        assert_eq!(small["needsPreflight"], false);
        // A structural edit earns one, but an empty project has no check to run:
        // that is `verified: false`, never a pass.
        let empty = k
            .run_preflight(&ex.id, 1, true, false, std::path::Path::new("/nonexistent"))
            .unwrap();
        assert_eq!(empty["needsPreflight"], true);
        assert_eq!(empty["verified"], false);
        assert_eq!(empty["passed"], false);
        // Discovered from the manifest, and shaped as a real command.
        let dir = std::env::temp_dir().join(format!("eaios-preflight-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("Cargo.toml"), "[package]\nname = \"x\"\n").unwrap();
        let discovered = discover_shadow_checks(&dir);
        assert_eq!(discovered.len(), 1);
        assert_eq!(discovered[0].program, "cargo");
        assert_eq!(discovered[0].args, vec!["check", "--quiet"]);
        // P64.6 — candidate parsing is fail-closed: traversal, absolute paths,
        // non-objects and oversized payloads never reach the tree.
        let ok_params = json!({"candidateFiles": [{"path": "src/a.rs", "content": "ok"}]});
        assert_eq!(parse_shadow_candidate(&ok_params).unwrap().len(), 1);
        assert!(parse_shadow_candidate(&json!({})).unwrap().is_empty());
        assert!(parse_shadow_candidate(
            &json!({"candidateFiles": [{"path": "../evil", "content": "x"}]})
        )
        .is_err());
        assert!(parse_shadow_candidate(
            &json!({"candidateFiles": [{"path": "/abs", "content": "x"}]})
        )
        .is_err());
        assert!(parse_shadow_candidate(&json!({"candidateFiles": "nope"})).is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// P64.6 — the candidate is checked, not the pre-existing tree.
    ///
    /// The declared check reads the staged candidate file, so a `broken`
    /// candidate fails the gate and a `fixed` one passes; the live root is
    /// never written (no `probe.txt` lands there). Both shadows are removed by
    /// the call.
    #[test]
    fn p64_shadow_preflight_checks_the_candidate_not_the_tree() {
        let mut k = ExecutionKernel::new();
        let ex = k.begin(
            ExecutionTrigger::Chat,
            "s",
            "candidate",
            None,
            String::new(),
            String::new(),
            Vec::new(),
        );
        let root = std::env::temp_dir().join(format!("eaios-candidate-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).unwrap();
        // The declared check reads the staged candidate file: a `broken`
        // candidate fails the gate, a `fixed` one passes, and the live root is
        // never touched (no `probe.txt` lands there). Both shadows are removed
        // by the call. The script is self-contained (no repo-local file) so the
        // verdict can only come from the staged candidate.
        std::fs::write(
            root.join("package.json"),
            "{\"scripts\": {\"check\": \"grep -q '^fixed$' probe.txt\"}}",
        )
        .unwrap();
        let candidate = |content: &str| vec![ShadowCandidateFile::new("probe.txt", content)];
        let broken = k
            .run_preflight_with_candidate(&ex.id, 2, false, false, &root, &candidate("broken"))
            .expect("broken candidate preflights");
        assert_eq!(broken["verified"], true);
        assert_eq!(
            broken["passed"], false,
            "the staged broken candidate must fail"
        );
        let fixed = k
            .run_preflight_with_candidate(&ex.id, 2, false, false, &root, &candidate("fixed"))
            .expect("fixed candidate preflights");
        assert_eq!(fixed["verified"], true);
        assert_eq!(
            fixed["passed"], true,
            "the staged fixed candidate must pass"
        );
        assert!(
            !root.join("probe.txt").exists(),
            "the live root is never written — only the shadow"
        );
        let _ = std::fs::remove_dir_all(&root);
    }

    /// P64.6 — a preflight really runs the discovered command, and a failing one
    /// really fails. Uses `true`/`false` as the check so the assertion is about
    /// the runner and the verdict, not about how long cargo takes.
    #[cfg(unix)]
    #[test]
    fn p64_shadow_preflight_runs_and_fails_closed() {
        let mut k = ExecutionKernel::new();
        let ex = k.begin(
            ExecutionTrigger::Chat,
            "s",
            "risky edit",
            None,
            String::new(),
            String::new(),
            Vec::new(),
        );
        let dir = std::env::temp_dir().join(format!("eaios-preflight-run-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let check = |program: &str| ShadowCheck {
            label: program.to_string(),
            program: program.to_string(),
            args: Vec::new(),
        };

        let ok = run_shadow_checks(&dir, &[check("true")]);
        assert_eq!(ok.len(), 1);
        assert!(ok[0].success);

        let bad = run_shadow_checks(&dir, &[check("false"), check("true")]);
        assert_eq!(
            bad.len(),
            1,
            "a failure stops the run, later checks are noise"
        );
        assert!(!bad[0].success);

        // A missing binary is an honest failure, not a silent pass.
        let missing = run_shadow_checks(&dir, &[check("definitely-not-a-binary-xyz")]);
        assert_eq!(missing.len(), 1);
        assert!(!missing[0].success);
        assert!(missing[0].preview.contains("spawn failed"));

        // The acceptance gate itself: a crate with a manifest but no source
        // cannot typecheck, so the multi-file gate must catch it *before* the
        // edit lands and leave a failing receipt behind. (If cargo is absent the
        // spawn fails, which is also a failure — never a silent pass.)
        std::fs::write(dir.join("Cargo.toml"), "[package]\nname = \"broken\"\n").unwrap();
        let recorded = k
            .run_preflight(&ex.id, 3, false, false, &dir)
            .expect("preflight runs");
        assert_eq!(recorded["needsPreflight"], true);
        assert_eq!(recorded["verified"], true);
        assert_eq!(
            recorded["passed"], false,
            "a tree that cannot typecheck fails"
        );
        assert_eq!(recorded["receipt"]["kind"], "shadow_preflight");
        assert_eq!(recorded["receipt"]["passed"], false);
        assert_eq!(recorded["checks"].as_array().unwrap().len(), 1);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn p64_auto_checkpoint_persists_and_fence_holds() {
        let dir = std::env::temp_dir().join(format!("exec-p64-ckpt-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let mut k = ExecutionKernel::new();
        let ex = k.begin(
            ExecutionTrigger::Chat,
            "s",
            "mutate",
            None,
            String::new(),
            String::new(),
            Vec::new(),
        );
        let (path, meta) =
            auto_checkpoint_kernel(&k, &dir, &ex.id, 1, Some("abc123".into()), 9).unwrap();
        assert!(path.exists());
        assert_eq!(meta.step, 1);
        assert_eq!(meta.fencing_token, 9);
        assert!(meta.snapshot_bytes > 0);
        // Non-git dir → honest None, never a faked SHA.
        let none = commit_workspace_snapshot(&dir, &["a.txt"], "msg", true).unwrap();
        assert_eq!(none, None);
        assert!(commit_workspace_snapshot(&dir, &[], "msg", true).is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn p64_terminal_work_is_never_replayed_and_fence_refuses_stale() {
        let mut k = ExecutionKernel::new();
        let ex = k.begin(
            ExecutionTrigger::Chat,
            "s",
            "done work",
            None,
            String::new(),
            String::new(),
            Vec::new(),
        );
        // Non-terminal without receipt → replayable (repair path decides).
        assert!(!should_restore_without_replay(k.get(&ex.id).unwrap()));
        k.transition(&ex.id, ExecutionPhase::Running).unwrap();
        k.attach_receipt(&ex.id, json!({"ok": true})).unwrap();
        k.transition(&ex.id, ExecutionPhase::Verifying).unwrap();
        k.transition(&ex.id, ExecutionPhase::Completed).unwrap();
        assert!(should_restore_without_replay(k.get(&ex.id).unwrap()));

        let auth = crate::work_gateway::RunAuthority {
            run_id: "r1".into(),
            node_id: "n1".into(),
            lease_id: "l1".into(),
            fencing_token: 4,
            granted_at_ms: 0,
            expires_at_ms: 0,
        };
        assert!(check_restore_fence(&auth, "n1", 4, 1).is_ok());
        assert!(check_restore_fence(&auth, "n1", 3, 1).is_err());
        assert!(check_restore_fence(&auth, "n2", 4, 1).is_err());
    }

    #[test]
    fn p64_begin_subagent_ipc_arm_wires_provision() {
        let mut k = ExecutionKernel::new();
        let v = k
            .handle(
                "execution/begin_subagent",
                &json!({
                    "sessionId": "s",
                    "objective": "sub work",
                    "taskId": "task-9",
                    "depth": 1,
                    "tools": ["read", "delegate"],
                    "policySnapshot": "pol"
                }),
            )
            .unwrap();
        assert_eq!(v["trigger"], "subagent");
        assert_eq!(v["provision"]["branch"], "subtask/task-9");
        // Depth-exceeded fails closed through the IPC arm (no unwrap).
        assert!(k
            .handle(
                "execution/begin_subagent",
                &json!({"sessionId": "s", "objective": "x", "taskId": "t", "depth": 9})
            )
            .is_err());
    }

    #[test]
    fn p51_multirun_ipc_admits_budget_and_reduces() {
        let mut k = ExecutionKernel::new();
        let six = k.handle(
            "execution/multirun",
            &json!({
                "id": "mr-bad",
                "taskId": "t",
                "modelIds": ["a","b","c","d","e","f"],
            }),
        );
        assert!(six.is_err(), "six models must fail closed");
        let v = k
            .handle(
                "execution/multirun",
                &json!({
                    "id": "mr-1",
                    "taskId": "t",
                    "modelIds": ["a", "b"],
                    "worktreeIds": ["wt-a", "wt-b"],
                    "mode": "keep_best",
                    "outcomes": [
                        {"modelId": "a", "output": "meh", "score": 0.1},
                        {"modelId": "b", "output": "best", "score": 0.9}
                    ],
                    "diff": "diff --git a/x.rs b/x.rs\n@@ -1 +1 @@\n-old\n+new\n"
                }),
            )
            .unwrap();
        assert_eq!(v["modelCount"], 2);
        assert_eq!(v["collected"]["output"], "best");
        assert_eq!(v["collected"]["best_model_id"], "b");
        assert!(v["walkthrough"].as_array().unwrap().len() >= 1);
    }

    #[test]
    fn p59_cua_persist_refuses_unverifiable_nodes_and_steps() {
        let dir = std::env::temp_dir().join(format!("exec-cua-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let mut k = ExecutionKernel::new();
        let illegal = k.handle(
            "execution/cua_persist",
            &json!({
                "root": dir.to_string_lossy(),
                "dag": {
                    "run_id": "r",
                    "work_id": "w",
                    "replan_seq": 0,
                    "nodes": [{
                        "id": "n1",
                        "name": "click",
                        "info": "",
                        "depends_on": [],
                        "status": "pending"
                    }]
                }
            }),
        );
        assert!(illegal.is_err(), "empty postconditions must refuse");
        k.handle(
            "execution/cua_persist",
            &json!({
                "root": dir.to_string_lossy(),
                "dag": {
                    "run_id": "r",
                    "work_id": "w",
                    "replan_seq": 0,
                    "nodes": [{
                        "id": "n1",
                        "name": "click",
                        "info": "",
                        "depends_on": [],
                        "status": "pending",
                        "postconditions": ["saved"]
                    }]
                }
            }),
        )
        .unwrap();
        let step = k
            .handle(
                "execution/cua_step",
                &json!({
                    "root": dir.to_string_lossy(),
                    "nodeId": "n1",
                    "verifyOk": false
                }),
            )
            .unwrap();
        assert_eq!(step["outcome"], "mismatch");
        let halt = k
            .handle(
                "execution/cua_step",
                &json!({
                    "root": dir.to_string_lossy(),
                    "nodeId": "n1",
                    "verifyOk": false
                }),
            )
            .unwrap();
        assert_eq!(halt["outcome"], "halt");
        assert_eq!(halt["ok"], false);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
