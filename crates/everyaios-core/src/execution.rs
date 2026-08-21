//! H3 — unified Execution kernel. Chat turns, plans, scheduler runs, ACP
//! prompts and subagents all enter the same record + state machine so
//! resume / fork / replay / handoff / audit / receipt share one unit.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::BTreeMap;

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
pub struct Execution {
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
}

impl Execution {
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
        }
    }
}

#[derive(Debug, Default)]
pub struct ExecutionKernel {
    executions: BTreeMap<String, Execution>,
    aliases: BTreeMap<String, String>,
    counter: u64,
}

impl ExecutionKernel {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn begin(
        &mut self,
        trigger: ExecutionTrigger,
        session_id: &str,
        objective: &str,
        parent_id: Option<String>,
        policy_snapshot: String,
        context_snapshot: String,
        capability_scope: Vec<String>,
    ) -> Execution {
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
    ) -> Execution {
        if let Some(existing) = self.executions.get(&id) {
            return existing.clone();
        }
        let mut ex = Execution::new(
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

    pub fn by_alias(&self, key: &str) -> Option<&Execution> {
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

    pub fn get(&self, id: &str) -> Option<&Execution> {
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
                let list: Vec<&Execution> = self.executions.values().collect();
                Ok(json!({ "executions": list, "count": list.len() }))
            }
            _ => Err(format!("method not found: {method}")),
        }
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
}
