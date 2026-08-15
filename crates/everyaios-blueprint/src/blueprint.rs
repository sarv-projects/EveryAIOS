//! Blueprint + verify-gated tasks (P6.1 — doc 63 §2.3, openspec verify-gate).
//!
//! Each blueprint task carries a `verify` block — deterministic checks that
//! must pass before the task is marked done. **We never accept the agent's own
//! "finished" claim**; the verifier (`everyaios-eval`) proves the state.

use crate::spec::TaskSpec;
use everyaios_eval::{verify, OutcomeCheck, TaskManifest, VerificationReport};
use serde::{Deserialize, Serialize};
use std::path::Path;
use thiserror::Error;

/// The deterministic verify block attached to a task.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct VerifyBlock {
    /// Deterministic outcome checks (exists/hash/contains).
    pub checks: Vec<OutcomeCheck>,
    /// Approvals / forbidden-side-effect notes the harness enforces.
    pub policy: Vec<String>,
}

impl VerifyBlock {
    pub fn new(checks: Vec<OutcomeCheck>) -> Self {
        Self {
            checks,
            policy: Vec::new(),
        }
    }
}

/// Task lifecycle status (the verifier decides `done`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskStatus {
    Pending,
    InProgress,
    /// All verify checks pass.
    Done,
    /// Verify checks failed — the task is not done.
    Failed,
    /// Blocked on a missing capability/approval.
    Blocked,
}

/// One task in a blueprint: a spec + its verify gate + dependencies.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct BlueprintTask {
    pub spec: TaskSpec,
    pub verify: VerifyBlock,
    /// Task ids that must be `Done` before this one starts.
    pub depends_on: Vec<String>,
    pub status: TaskStatus,
}

impl BlueprintTask {
    pub fn new(spec: TaskSpec, verify: VerifyBlock) -> Self {
        Self {
            spec,
            verify,
            depends_on: Vec::new(),
            status: TaskStatus::Pending,
        }
    }

    /// Convert the verify block into an eval manifest for verification.
    pub fn to_manifest(&self) -> TaskManifest {
        TaskManifest {
            task_id: self.spec.id.clone(),
            goal: self.spec.goal.clone(),
            required_outcomes: self.verify.checks.clone(),
            constraints: vec![],
            budgets: Default::default(),
            evidence: vec![],
        }
    }

    /// Run the verifier against the workspace `base_dir`. Never trusts the
    /// agent's own claim — the checks decide.
    pub fn verify_against(&self, base_dir: &Path) -> VerificationReport {
        verify(&self.to_manifest(), base_dir)
    }
}

/// A blueprint: an ordered, dependency-aware set of tasks.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Blueprint {
    pub id: String,
    pub goal: String,
    pub tasks: Vec<BlueprintTask>,
}

#[derive(Debug, Error)]
pub enum BlueprintError {
    #[error("task {0} depends on unknown task {1}")]
    UnknownDependency(String, String),
    #[error("cycle detected involving task {0}")]
    Cycle(String),
}

impl Blueprint {
    pub fn new(id: impl Into<String>, goal: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            goal: goal.into(),
            tasks: Vec::new(),
        }
    }

    pub fn push(&mut self, task: BlueprintTask) {
        self.tasks.push(task);
    }

    pub fn find(&self, id: &str) -> Option<&BlueprintTask> {
        self.tasks.iter().find(|t| t.spec.id == id)
    }

    /// Tasks whose dependencies are all `Done` (the ready set).
    pub fn ready(&self) -> Vec<&BlueprintTask> {
        self.tasks
            .iter()
            .filter(|t| t.status != TaskStatus::Done && t.status != TaskStatus::Failed)
            .filter(|t| {
                t.depends_on
                    .iter()
                    .all(|d| self.find(d).map(|d| d.status == TaskStatus::Done).unwrap_or(false))
            })
            .collect()
    }

    /// Validate dependency references and detect cycles.
    pub fn validate(&self) -> Result<(), BlueprintError> {
        for t in &self.tasks {
            for d in &t.depends_on {
                if self.find(d).is_none() {
                    return Err(BlueprintError::UnknownDependency(
                        t.spec.id.clone(),
                        d.clone(),
                    ));
                }
            }
        }
        // DFS cycle detection.
        let mut visiting = std::collections::HashSet::new();
        let mut visited = std::collections::HashSet::new();
        for t in &self.tasks {
            if self.detect_cycle(&t.spec.id, &mut visiting, &mut visited)? {
                return Err(BlueprintError::Cycle(t.spec.id.clone()));
            }
        }
        Ok(())
    }

    fn detect_cycle(
        &self,
        id: &str,
        visiting: &mut std::collections::HashSet<String>,
        visited: &mut std::collections::HashSet<String>,
    ) -> Result<bool, BlueprintError> {
        if visiting.contains(id) {
            return Ok(true);
        }
        if visited.contains(id) {
            return Ok(false);
        }
        visiting.insert(id.to_string());
        if let Some(t) = self.find(id) {
            for d in &t.depends_on {
                if self.detect_cycle(d, visiting, visited)? {
                    return Ok(true);
                }
            }
        }
        visiting.remove(id);
        visited.insert(id.to_string());
        Ok(false)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use everyaios_eval::OutcomeCheck;

    fn spec(id: &str) -> TaskSpec {
        TaskSpec::new(id, format!("goal {id}"))
    }

    fn check(path: &str) -> OutcomeCheck {
        OutcomeCheck::FileExists { path: path.into() }
    }

    #[test]
    fn manifest_conversion_carries_checks() {
        let t = BlueprintTask::new(spec("a"), VerifyBlock::new(vec![check("out.txt")]));
        let m = t.to_manifest();
        assert_eq!(m.task_id, "a");
        assert_eq!(m.required_outcomes.len(), 1);
    }

    #[test]
    fn verify_against_runs_the_verifier() {
        let dir = std::env::temp_dir().join("bp-test");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("out.txt"), "x").unwrap();

        let t = BlueprintTask::new(spec("a"), VerifyBlock::new(vec![check("out.txt")]));
        let report = t.verify_against(&dir);
        assert!(report.status.is_complete());

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn ready_respects_dependencies() {
        let mut bp = Blueprint::new("bp", "g");
        let a = BlueprintTask::new(spec("a"), VerifyBlock::new(vec![]));
        let mut b = BlueprintTask::new(spec("b"), VerifyBlock::new(vec![]));
        b.depends_on.push("a".into());
        bp.push(a);
        bp.push(b);

        assert_eq!(bp.ready().len(), 1); // only "a" is ready (no deps)
        assert_eq!(bp.ready()[0].spec.id, "a");

        // Mark "a" done → "b" becomes ready.
        bp.tasks[0].status = TaskStatus::Done;
        assert_eq!(bp.ready().len(), 1);
        assert_eq!(bp.ready()[0].spec.id, "b");
    }

    #[test]
    fn validate_detects_unknown_dependency_and_cycle() {
        let mut bp = Blueprint::new("bp", "g");
        let mut a = BlueprintTask::new(spec("a"), VerifyBlock::new(vec![]));
        a.depends_on.push("ghost".into());
        bp.push(a);
        assert!(matches!(bp.validate(), Err(BlueprintError::UnknownDependency(..))));

        let mut bp2 = Blueprint::new("bp2", "g");
        let mut a = BlueprintTask::new(spec("a"), VerifyBlock::new(vec![]));
        a.depends_on.push("b".into());
        let mut b = BlueprintTask::new(spec("b"), VerifyBlock::new(vec![]));
        b.depends_on.push("a".into());
        bp2.push(a);
        bp2.push(b);
        assert!(matches!(bp2.validate(), Err(BlueprintError::Cycle(..))));
    }
}
