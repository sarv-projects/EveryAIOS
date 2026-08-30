//! Sub-agent orchestration (P6.2 — doc 16 Hermes `delegate_task` + doc 41
//! opencode `task.ts` + DeerFlow `subagent_limit_middleware`).
//!
//! The pure primitives for spawning isolated workers under a parent:
//!
//! - **Fresh context** — a sub-agent starts from its `TaskSpec` (own
//!   conversation, own workspace), never from the parent's transcript.
//! - **`DELEGATE_BLOCKED_TOOLS`** — the canonical toolset a parent withholds
//!   from children (`delegate`/`clarify`/`memory`/`send_message`/`cronjob`);
//!   sub-agents inherit *denies*, never escalated grants. `delegate` being
//!   blocked is also the no-recursive-spawn guard's first line.
//! - **Summary-only return** — the parent receives a [`SubAgentResult`]
//!   (summary + status + artifacts); the child's context is not replayed.
//! - **Limits** — max depth (no recursive spawn), max concurrent (batch
//!   parallel), max total per run — enforced by [`SubAgentRuntime::spawn`].
//! - **Inter-agent messaging** — peer-review / cross-check / request-sub-
//!   routine / handoff, endpoint-validated.

use crate::blueprint::TaskStatus;
use crate::spec::TaskSpec;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use thiserror::Error;

/// The root/parent pseudo-agent id (depth 0, owns delegation).
pub const ROOT_AGENT: &str = "root";

/// The tools a parent always withholds from sub-agents (Hermes
/// `DELEGATE_BLOCKED_TOOLS`). `delegate` first → a sub-agent cannot recurse;
/// `memory`/`send_message`/`cronjob` are parent-level privileges; `clarify`
/// is answered by the parent, not by the child asking the user.
pub const DELEGATE_BLOCKED_TOOLS: [&str; 5] =
    ["delegate", "clarify", "memory", "send_message", "cronjob"];

/// A sub-agent spawn request. Carries a scoped [`TaskSpec`] (the starting
/// context), a per-agent model, and an own workspace — not the parent's
/// conversation.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SubAgentSpec {
    pub spec: TaskSpec,
    /// Per-agent model selection (opencode `task.ts`).
    pub model: String,
    /// Own workspace (isolated from the parent).
    pub workspace: String,
    /// Parent agent id (None ⇒ root-spawned, depth 0).
    pub parent_id: Option<String>,
    /// The toolset the parent grants (names).
    pub tools: Vec<String>,
    /// Extra denies beyond `DELEGATE_BLOCKED_TOOLS`.
    pub blocked_tools: Vec<String>,
    /// Assigned by the runtime on spawn (parent depth + 1; root = 0).
    #[serde(default)]
    pub depth: u32,
}

impl SubAgentSpec {
    pub fn new(spec: TaskSpec, model: impl Into<String>, workspace: impl Into<String>) -> Self {
        Self {
            spec,
            model: model.into(),
            workspace: workspace.into(),
            parent_id: None,
            tools: Vec::new(),
            blocked_tools: Vec::new(),
            depth: 0,
        }
    }

    pub fn with_parent(mut self, parent_id: impl Into<String>) -> Self {
        self.parent_id = Some(parent_id.into());
        self
    }

    pub fn with_tools(mut self, tools: Vec<String>) -> Self {
        self.tools = tools;
        self
    }

    pub fn with_blocked_tools(mut self, blocked: Vec<String>) -> Self {
        self.blocked_tools = blocked;
        self
    }

    /// The child's starting prompt: its spec only. This is the whole point of
    /// fresh-context spawn — the parent's history is never handed down.
    pub fn starting_prompt(&self) -> String {
        self.spec.to_markdown()
    }

    /// The effective toolset: parent grants minus explicit denies minus
    /// `DELEGATE_BLOCKED_TOOLS` (sub-agents inherit denies, not grants).
    pub fn effective_tools(&self) -> Vec<String> {
        self.tools
            .iter()
            .filter(|t| !self.blocked_tools.contains(t))
            .filter(|t| !DELEGATE_BLOCKED_TOOLS.contains(&t.as_str()))
            .cloned()
            .collect()
    }
}

/// P36 (B3) — derived child permissions (Kilo default-deny pattern).
///
/// A child never blindly inherits the parent's tool universe: its toolset is
/// `parent grants ∩ (not parent denies) ∩ explicit grants`, and task/todo
/// bookkeeping tools are **default-deny** unless the parent explicitly grants
/// them. `explicit_grants` is the only way a default-denied tool appears.
pub fn derive_child_permissions(
    parent_grants: &[String],
    parent_denies: &[String],
    explicit_grants: &[String],
) -> Vec<String> {
    let mut out: Vec<String> = parent_grants
        .iter()
        .filter(|t| !parent_denies.contains(t))
        .filter(|t| !DELEGATE_BLOCKED_TOOLS.contains(&t.as_str()))
        .filter(|t| !DEFAULT_DENY_TASK_TOOLS.contains(&t.as_str()) || explicit_grants.contains(t))
        .cloned()
        .collect();
    out.sort();
    out.dedup();
    out
}

/// Kilo-style default-deny task bookkeeping: a child may not mutate the plan
/// ledger unless the parent hands it the tool explicitly.
pub const DEFAULT_DENY_TASK_TOOLS: [&str; 2] = ["task", "todo"];

/// P36 (B3) — why an inbuilt sub-agent stopped. Surface these as
/// termination events on the audit timeline (Gemini `LocalAgentExecutor`
/// pattern). External agents already have ACP `session/update` events.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum TerminationReason {
    /// The goal/spec was met (normal completion).
    GoalMet,
    /// The per-agent timeout fired.
    Timeout,
    /// The max-turns iteration budget was exhausted.
    MaxTurns,
    /// Aborted by the parent/user.
    Aborted,
    /// The run failed (tool error, engine error).
    Error,
}

/// P36 (B3) — one termination event; every exit lands one of these.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TerminationEvent {
    pub task_id: String,
    pub reason: TerminationReason,
    pub detail: Option<String>,
    pub at_step: u32,
}

/// P36 (B3) — the Scout child: a read-only sub-agent that clones its input
/// into a **managed cache** and never writes the user workspace. `read_only`
/// is enforced structurally — the struct has no write surface at all.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ScoutSpec {
    pub spec: TaskSpec,
    /// Where the clone lands (managed cache dir, never the user workspace).
    pub cache_root: String,
    pub model: String,
    #[serde(default)]
    pub depth: u32,
}

impl ScoutSpec {
    pub fn new(spec: TaskSpec, cache_root: impl Into<String>, model: impl Into<String>) -> Self {
        Self {
            spec,
            cache_root: cache_root.into(),
            model: model.into(),
            depth: 0,
        }
    }

    /// Scouts are structurally read-only: the returned read set is the only
    /// surface. There is no write method on this type.
    pub const fn read_only(&self) -> bool {
        true
    }
}

/// What the parent receives when a sub-agent finishes — summary + status +
/// artifacts. Structurally summary-only: there is no transcript field.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SubAgentResult {
    pub task_id: String,
    pub summary: String,
    pub status: TaskStatus,
    pub artifacts: Vec<String>,
}

/// Resource/depth limits (DeerFlow `subagent_limit_middleware` + Reasonix
/// asymmetric tiering). Defaults match P6.3's budget numbers.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct SubAgentLimits {
    /// Maximum sub-agent depth (root parent = 0). Children are 1; a child
    /// spawning below this is recursion and is rejected.
    pub max_depth: u32,
    /// Maximum simultaneously-running sub-agents (batch parallel cap).
    pub max_concurrent: u32,
    /// Maximum total spawns per run.
    pub max_total: u32,
}

impl Default for SubAgentLimits {
    fn default() -> Self {
        Self {
            max_depth: 2,
            max_concurrent: 3,
            max_total: 6,
        }
    }
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum SubAgentError {
    #[error("task {task_id} already spawned")]
    DuplicateTask { task_id: String },
    #[error("parent {parent_id:?} unknown for task {task_id}")]
    UnknownParent { task_id: String, parent_id: String },
    #[error("task {task_id} depth {depth} exceeds max_depth {max_depth} (no recursive spawn)")]
    DepthExceeded {
        task_id: String,
        depth: u32,
        max_depth: u32,
    },
    #[error("task {task_id} exceeds concurrent limit ({active} active of {max_concurrent})")]
    ConcurrentLimitExceeded {
        task_id: String,
        active: u32,
        max_concurrent: u32,
    },
    #[error("task {task_id} exceeds total-per-run limit ({total} of {max_total})")]
    TotalLimitExceeded {
        task_id: String,
        total: u32,
        max_total: u32,
    },
    #[error("task {task_id} not found")]
    UnknownTask { task_id: String },
    #[error("message references unknown agent {agent_id:?}")]
    UnknownAgent { agent_id: String },
}

/// Inter-agent message kinds (P6.2 — peer-review, cross-check, request
/// sub-routines).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentMessageKind {
    PeerReview,
    CrossCheck,
    RequestSubRoutine,
    Handoff,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AgentMessage {
    pub from: String,
    pub to: String,
    pub kind: AgentMessageKind,
    pub body: String,
}

/// The runtime that owns spawn accounting: depth, concurrency, total, and
/// summary-only completion. The actual LLM execution lives in the coordinator;
/// this crate is the deterministic policy seam.
#[derive(Debug, Default)]
pub struct SubAgentRuntime {
    limits: SubAgentLimits,
    active: HashMap<String, SubAgentSpec>,
    completed: Vec<SubAgentResult>,
    total_spawned: u32,
}

impl SubAgentRuntime {
    pub fn new(limits: SubAgentLimits) -> Self {
        Self {
            limits,
            active: HashMap::new(),
            completed: Vec::new(),
            total_spawned: 0,
        }
    }

    pub fn limits(&self) -> SubAgentLimits {
        self.limits
    }

    pub fn active_count(&self) -> usize {
        self.active.len()
    }

    pub fn total_spawned(&self) -> u32 {
        self.total_spawned
    }

    pub fn completed(&self) -> &[SubAgentResult] {
        &self.completed
    }

    /// The depth a spawn at this point would land on (None ⇒ unknown parent).
    pub fn next_depth(&self, parent_id: Option<&str>) -> Option<u32> {
        match parent_id {
            None => Some(0),
            Some(p) if p == ROOT_AGENT => Some(0),
            Some(p) => self.active.get(p).map(|s| s.depth + 1),
        }
    }

    /// Spawn a sub-agent, enforcing duplicate / parent-existence / depth
    /// (no-recursive-spawn) / concurrent / total limits.
    pub fn spawn(&mut self, mut spec: SubAgentSpec) -> Result<(), SubAgentError> {
        let task_id = spec.spec.id.clone();
        if self.active.contains_key(&task_id) || self.completed.iter().any(|c| c.task_id == task_id)
        {
            return Err(SubAgentError::DuplicateTask { task_id });
        }
        let depth = match spec.parent_id.as_deref() {
            None | Some(ROOT_AGENT) => 0,
            Some(p) => {
                let parent = self
                    .active
                    .get(p)
                    .ok_or_else(|| SubAgentError::UnknownParent {
                        task_id: task_id.clone(),
                        parent_id: p.to_string(),
                    })?;
                parent.depth + 1
            }
        };
        if depth > self.limits.max_depth {
            return Err(SubAgentError::DepthExceeded {
                task_id,
                depth,
                max_depth: self.limits.max_depth,
            });
        }
        if self.active.len() as u32 >= self.limits.max_concurrent {
            return Err(SubAgentError::ConcurrentLimitExceeded {
                task_id,
                active: self.active.len() as u32,
                max_concurrent: self.limits.max_concurrent,
            });
        }
        if self.total_spawned >= self.limits.max_total {
            return Err(SubAgentError::TotalLimitExceeded {
                task_id,
                total: self.total_spawned,
                max_total: self.limits.max_total,
            });
        }
        spec.depth = depth;
        self.active.insert(task_id, spec);
        self.total_spawned += 1;
        Ok(())
    }

    /// Spawn a batch (fan-out). Spawns as many as the limits allow, in order;
    /// returns the ids spawned and the first error that blocked the rest.
    pub fn spawn_batch(
        &mut self,
        specs: Vec<SubAgentSpec>,
    ) -> (Vec<String>, Option<SubAgentError>) {
        let mut spawned = Vec::new();
        for spec in specs {
            let id = spec.spec.id.clone();
            match self.spawn(spec) {
                Ok(()) => spawned.push(id),
                Err(e) => return (spawned, Some(e)),
            }
        }
        (spawned, None)
    }

    /// Complete a sub-agent → the summary-only [`SubAgentResult`] the parent
    /// sees. The child's context/history is dropped here.
    pub fn complete(
        &mut self,
        task_id: impl Into<String>,
        summary: impl Into<String>,
        status: TaskStatus,
        artifacts: Vec<String>,
    ) -> Result<SubAgentResult, SubAgentError> {
        let task_id = task_id.into();
        if self.active.remove(&task_id).is_none() {
            return Err(SubAgentError::UnknownTask { task_id });
        }
        let result = SubAgentResult {
            task_id,
            summary: summary.into(),
            status,
            artifacts,
        };
        self.completed.push(result.clone());
        Ok(result)
    }

    /// The summary the parent sees for a finished task (None if still active
    /// or unknown — the parent never gets the raw child context).
    pub fn parent_sees_summary(&self, task_id: &str) -> Option<&SubAgentResult> {
        self.completed.iter().find(|c| c.task_id == task_id)
    }

    /// Depth of an active agent (root = 0).
    pub fn depth_of(&self, task_id: &str) -> Option<u32> {
        self.active.get(task_id).map(|s| s.depth)
    }

    /// Whether `agent_id` is a known participant (active, completed, or root).
    pub fn is_known(&self, agent_id: &str) -> bool {
        agent_id == ROOT_AGENT
            || self.active.contains_key(agent_id)
            || self.completed.iter().any(|c| c.task_id == agent_id)
    }

    /// Validate an inter-agent message: both endpoints must be known. Routing
    /// (delivery) is the coordinator's job; this is the policy check.
    pub fn route_message(&self, msg: &AgentMessage) -> Result<(), SubAgentError> {
        if !self.is_known(&msg.from) {
            return Err(SubAgentError::UnknownAgent {
                agent_id: msg.from.clone(),
            });
        }
        if !self.is_known(&msg.to) {
            return Err(SubAgentError::UnknownAgent {
                agent_id: msg.to.clone(),
            });
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn spec(id: &str, model: &str) -> SubAgentSpec {
        SubAgentSpec::new(
            TaskSpec::new(id, format!("goal {id}")),
            model,
            format!("/ws/{id}"),
        )
    }

    #[test]
    fn delegate_blocked_tools_are_denied_by_default() {
        let s = spec("a", "m").with_tools(vec![
            "read".into(),
            "write".into(),
            "delegate".into(),
            "memory".into(),
            "cronjob".into(),
        ]);
        let effective = s.effective_tools();
        assert_eq!(effective, vec!["read".to_string(), "write".to_string()]);
    }

    #[test]
    fn explicit_blocked_tools_also_denied() {
        let s = spec("a", "m")
            .with_tools(vec!["read".into(), "write".into()])
            .with_blocked_tools(vec!["write".into()]);
        assert_eq!(s.effective_tools(), vec!["read".to_string()]);
    }

    #[test]
    fn fresh_context_is_spec_only() {
        let s = spec("a", "m").with_tools(vec![]);
        let prompt = s.starting_prompt();
        assert!(prompt.contains("# Task: a"));
        assert!(prompt.contains("goal a"));
        // Never the parent history.
        assert!(!prompt.contains("parent history"));
    }

    #[test]
    fn spawn_assigns_depth_from_parent() {
        let mut rt = SubAgentRuntime::new(SubAgentLimits::default());
        rt.spawn(spec("root-task", "claude")).unwrap();
        rt.spawn(spec("child", "gpt").with_parent("root-task"))
            .unwrap();
        assert_eq!(rt.depth_of("root-task"), Some(0));
        assert_eq!(rt.depth_of("child"), Some(1));
    }

    #[test]
    fn no_recursive_spawn_beyond_max_depth() {
        let mut rt = SubAgentRuntime::new(SubAgentLimits {
            max_depth: 2,
            max_concurrent: 4,
            max_total: 10,
        });
        rt.spawn(spec("a", "m")).unwrap(); // depth 0
        rt.spawn(spec("b", "m").with_parent("a")).unwrap(); // depth 1
        rt.spawn(spec("c", "m").with_parent("b")).unwrap(); // depth 2 (== max)
        let err = rt.spawn(spec("d", "m").with_parent("c")).unwrap_err();
        assert!(matches!(
            err,
            SubAgentError::DepthExceeded {
                depth: 3,
                max_depth: 2,
                ..
            }
        ));
    }

    #[test]
    fn concurrent_and_total_limits_enforced() {
        let mut rt = SubAgentRuntime::new(SubAgentLimits {
            max_depth: 2,
            max_concurrent: 2,
            max_total: 3,
        });
        rt.spawn(spec("a", "m")).unwrap();
        rt.spawn(spec("b", "m")).unwrap();
        // Concurrent cap hit (2 active).
        assert!(matches!(
            rt.spawn(spec("c", "m")),
            Err(SubAgentError::ConcurrentLimitExceeded { .. })
        ));
        // Complete one → can spawn again (total = 3).
        rt.complete("a", "done", TaskStatus::Done, vec![]).unwrap();
        rt.spawn(spec("c", "m")).unwrap();
        // Free up concurrency so the *total* cap (3) is what binds next.
        rt.complete("b", "done", TaskStatus::Done, vec![]).unwrap();
        assert!(matches!(
            rt.spawn(spec("d", "m")),
            Err(SubAgentError::TotalLimitExceeded { .. })
        ));
    }

    #[test]
    fn duplicate_and_unknown_parent_rejected() {
        let mut rt = SubAgentRuntime::new(SubAgentLimits::default());
        rt.spawn(spec("a", "m")).unwrap();
        assert!(matches!(
            rt.spawn(spec("a", "m")),
            Err(SubAgentError::DuplicateTask { .. })
        ));
        assert!(matches!(
            rt.spawn(spec("b", "m").with_parent("ghost")),
            Err(SubAgentError::UnknownParent { .. })
        ));
    }

    #[test]
    fn parent_sees_summary_only() {
        let mut rt = SubAgentRuntime::new(SubAgentLimits::default());
        rt.spawn(spec("a", "m")).unwrap();
        // Active → no summary yet.
        assert!(rt.parent_sees_summary("a").is_none());
        let r = rt
            .complete(
                "a",
                "wrote the summary",
                TaskStatus::Done,
                vec!["out.md".into()],
            )
            .unwrap();
        assert_eq!(r.summary, "wrote the summary");
        assert_eq!(r.artifacts, vec!["out.md".to_string()]);
        // Summary-only: the result has no transcript field by construction.
        assert_eq!(
            rt.parent_sees_summary("a").unwrap().summary,
            "wrote the summary"
        );
    }

    #[test]
    fn inter_agent_messaging_validates_endpoints() {
        let mut rt = SubAgentRuntime::new(SubAgentLimits::default());
        rt.spawn(spec("a", "m")).unwrap();
        rt.spawn(spec("b", "m").with_parent("a")).unwrap();

        let ok = AgentMessage {
            from: "a".into(),
            to: "b".into(),
            kind: AgentMessageKind::PeerReview,
            body: "review this".into(),
        };
        assert!(rt.route_message(&ok).is_ok());

        let bad = AgentMessage {
            from: "a".into(),
            to: "ghost".into(),
            kind: AgentMessageKind::CrossCheck,
            body: "?".into(),
        };
        assert!(matches!(
            rt.route_message(&bad),
            Err(SubAgentError::UnknownAgent { .. })
        ));
    }

    #[test]
    fn spawn_batch_fans_out_within_limits() {
        let mut rt = SubAgentRuntime::new(SubAgentLimits {
            max_depth: 2,
            max_concurrent: 2,
            max_total: 10,
        });
        let (spawned, err) = rt.spawn_batch(vec![spec("a", "m"), spec("b", "m"), spec("c", "m")]);
        // max_concurrent=2 → only a,b spawn; c hits the concurrent cap.
        assert_eq!(spawned, vec!["a".to_string(), "b".to_string()]);
        assert!(matches!(
            err,
            Some(SubAgentError::ConcurrentLimitExceeded { .. })
        ));
    }

    #[test]
    fn two_spec_driven_agents_different_models_run_a_plan() {
        // P6.2 exit-criterion simulation: a planner (model X) spawns a coder
        // (model Y) on a verify-gated plan; parent sees only the summary; the
        // child cannot recurse.
        let mut rt = SubAgentRuntime::new(SubAgentLimits::default());

        let planner = spec("planner", "claude-sonnet").with_tools(vec![
            "delegate".into(),
            "read".into(),
            "write".into(),
        ]);
        rt.spawn(planner).unwrap();

        let coder = spec("coder", "gpt-5-codex")
            .with_parent("planner")
            .with_tools(vec!["read".into(), "write".into(), "delegate".into()]);
        rt.spawn(coder).unwrap();

        // Different models, correct depths.
        assert_eq!(rt.depth_of("planner"), Some(0));
        assert_eq!(rt.depth_of("coder"), Some(1));
        // The coder's effective tools strip `delegate` → cannot recurse.
        let coder_spec = rt.active.get("coder").unwrap();
        assert_eq!(coder_spec.model, "gpt-5-codex");
        assert!(!coder_spec
            .effective_tools()
            .contains(&"delegate".to_string()));

        // Coder finishes → planner receives a summary, not the transcript.
        rt.complete(
            "coder",
            "implemented /health",
            TaskStatus::Done,
            vec!["src".into()],
        )
        .unwrap();
        assert_eq!(
            rt.parent_sees_summary("coder").unwrap().summary,
            "implemented /health"
        );
        assert_eq!(
            rt.parent_sees_summary("coder").unwrap().status,
            TaskStatus::Done
        );
    }
}
