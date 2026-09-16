//! P67 Fleet Concurrency Governor — Adaptive subagent scheduling & queue management
//!
//! Controls the execution of multi-agent swarms (e.g. Primary Chief coordinating
//! 20-30 subagents). Ensures that subagent requests are admitted, queued, and
//! dispatched within system CPU, memory, provider rate-limit, and budget boundaries.

use std::collections::VecDeque;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FleetTaskKind {
    ReadOnly,
    Mutation,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FleetTaskStatus {
    Admitted,
    Queued,
    Running,
    Completed,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubagentTask {
    pub task_id: String,
    pub parent_run_id: String,
    pub role: String,
    pub runtime: String,
    pub kind: FleetTaskKind,
    pub status: FleetTaskStatus,
    pub priority: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GovernorConfig {
    pub max_concurrent_mutation: usize,
    pub max_concurrent_readonly: usize,
    pub max_queue_capacity: usize,
}

impl Default for GovernorConfig {
    fn default() -> Self {
        Self {
            max_concurrent_mutation: 4,
            max_concurrent_readonly: 8,
            max_queue_capacity: 50,
        }
    }
}

pub struct ConcurrencyGovernor {
    config: GovernorConfig,
    active_mutation: usize,
    active_readonly: usize,
    queue: VecDeque<SubagentTask>,
}

#[derive(Debug, thiserror::Error)]
pub enum GovernorError {
    #[error("Governor queue capacity exceeded ({0})")]
    QueueFull(usize),
}

impl ConcurrencyGovernor {
    pub fn new(config: GovernorConfig) -> Self {
        Self {
            config,
            active_mutation: 0,
            active_readonly: 0,
            queue: VecDeque::new(),
        }
    }

    /// Calculate dynamic concurrency bounds based on host resources.
    pub fn calculate_dynamic_limits(cpu_count: usize, memory_gib: usize) -> GovernorConfig {
        let max_mut = (cpu_count / 2).clamp(2, 6);
        let max_ro = (cpu_count).clamp(4, 12).min(memory_gib / 2);
        GovernorConfig {
            max_concurrent_mutation: max_mut,
            max_concurrent_readonly: max_ro,
            max_queue_capacity: 50,
        }
    }

    /// Admit a subagent task into the fleet. If slots are available, immediately returns `Running`.
    /// Otherwise queues the task as `Queued`.
    pub fn admit_task(&mut self, mut task: SubagentTask) -> Result<FleetTaskStatus, GovernorError> {
        match task.kind {
            FleetTaskKind::Mutation => {
                if self.active_mutation < self.config.max_concurrent_mutation {
                    self.active_mutation += 1;
                    task.status = FleetTaskStatus::Running;
                    Ok(FleetTaskStatus::Running)
                } else {
                    if self.queue.len() >= self.config.max_queue_capacity {
                        return Err(GovernorError::QueueFull(self.config.max_queue_capacity));
                    }
                    task.status = FleetTaskStatus::Queued;
                    self.queue.push_back(task);
                    Ok(FleetTaskStatus::Queued)
                }
            }
            FleetTaskKind::ReadOnly => {
                if self.active_readonly < self.config.max_concurrent_readonly {
                    self.active_readonly += 1;
                    task.status = FleetTaskStatus::Running;
                    Ok(FleetTaskStatus::Running)
                } else {
                    if self.queue.len() >= self.config.max_queue_capacity {
                        return Err(GovernorError::QueueFull(self.config.max_queue_capacity));
                    }
                    task.status = FleetTaskStatus::Queued;
                    self.queue.push_back(task);
                    Ok(FleetTaskStatus::Queued)
                }
            }
        }
    }

    /// Complete a running task and pop the next runnable task from the queue.
    pub fn complete_task(&mut self, kind: FleetTaskKind) -> Option<SubagentTask> {
        match kind {
            FleetTaskKind::Mutation => {
                self.active_mutation = self.active_mutation.saturating_sub(1);
            }
            FleetTaskKind::ReadOnly => {
                self.active_readonly = self.active_readonly.saturating_sub(1);
            }
        }

        // Try to pop next eligible task
        if let Some(pos) = self.queue.iter().position(|t| match t.kind {
            FleetTaskKind::Mutation => self.active_mutation < self.config.max_concurrent_mutation,
            FleetTaskKind::ReadOnly => self.active_readonly < self.config.max_concurrent_readonly,
        }) {
            let mut next = self.queue.remove(pos).unwrap();
            match next.kind {
                FleetTaskKind::Mutation => self.active_mutation += 1,
                FleetTaskKind::ReadOnly => self.active_readonly += 1,
            }
            next.status = FleetTaskStatus::Running;
            Some(next)
        } else {
            None
        }
    }

    pub fn active_counts(&self) -> (usize, usize, usize) {
        (self.active_mutation, self.active_readonly, self.queue.len())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_concurrency_governor_queueing() {
        let config = GovernorConfig {
            max_concurrent_mutation: 2,
            max_concurrent_readonly: 2,
            max_queue_capacity: 10,
        };
        let mut gov = ConcurrencyGovernor::new(config);

        let t1 = SubagentTask {
            task_id: "1".into(),
            parent_run_id: "p1".into(),
            role: "coder".into(),
            runtime: "opencode".into(),
            kind: FleetTaskKind::Mutation,
            status: FleetTaskStatus::Admitted,
            priority: 1,
        };
        let t2 = t1.clone();
        let t3 = t1.clone();

        assert_eq!(gov.admit_task(t1).unwrap(), FleetTaskStatus::Running);
        assert_eq!(gov.admit_task(t2).unwrap(), FleetTaskStatus::Running);
        assert_eq!(gov.admit_task(t3).unwrap(), FleetTaskStatus::Queued);

        assert_eq!(gov.active_counts(), (2, 0, 1));

        let next = gov.complete_task(FleetTaskKind::Mutation).unwrap();
        assert_eq!(next.status, FleetTaskStatus::Running);
        assert_eq!(gov.active_counts(), (2, 0, 0));
    }
}
