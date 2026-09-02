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
                let work_id = params.get("workId").and_then(Value::as_str);
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
                let ex = if let Some(work_id) = work_id {
                    self.begin_named(
                        work_id.to_string(),
                        trigger,
                        session,
                        objective,
                        parent,
                        policy,
                        ctx,
                        scope,
                    )
                } else {
                    self.begin(trigger, session, objective, parent, policy, ctx, scope)
                };
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
}
