//! P67 Worktree Fleet Manager — Isolated workspace branches for multi-agent subtasks
//!
//! Subagents (e.g. OpenCode, Cline, Claude Code, internal specialists) run in
//! isolated Git worktree branches under `.everyaios/worktrees/task-<id>`.
//!
//! Each worktree provides:
//! 1. Branch isolation: `task/<id>` branched from current HEAD.
//! 2. Disk capacity check: verified against `WorktreeCap`.
//! 3. Mutex-serialized execution: routed via `GitOperationQueue`.
//! 4. 3-File Blackboard: `task_plan.md`, `findings.md`, and `receipts/` state persistence.

use std::fs;
use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};

use crate::git_queue::{GitOperationQueue, GitQueueError};
use crate::worktree_cap::{CapVerdict, WorktreeCap};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorktreeLease {
    pub task_id: String,
    pub branch_name: String,
    pub path: PathBuf,
    pub reserved_gib: u64,
}

#[derive(Debug, thiserror::Error)]
pub enum WorktreeError {
    #[error("Worktree capacity exceeded (max {max_gib} GiB, used {used_gib} GiB)")]
    CapacityExceeded { max_gib: u64, used_gib: u64 },
    #[error("Git operation failed: {0}")]
    Git(#[from] GitQueueError),
    #[error("Filesystem I/O error: {0}")]
    Io(#[from] std::io::Error),
}

pub struct WorktreeManager {
    repo_root: PathBuf,
    worktrees_dir: PathBuf,
    cap: WorktreeCap,
    git_queue: GitOperationQueue,
}

impl WorktreeManager {
    pub fn new(repo_root: impl Into<PathBuf>, cap: WorktreeCap) -> Self {
        let root = repo_root.into();
        let worktrees_dir = root.join(".everyaios").join("worktrees");
        let git_queue = GitOperationQueue::new(&root);

        Self {
            repo_root: root,
            worktrees_dir,
            cap,
            git_queue,
        }
    }

    pub fn repo_root(&self) -> &Path {
        &self.repo_root
    }

    /// Provision a new isolated worktree for a subagent task.
    pub fn provision_worktree(
        &mut self,
        task_id: &str,
        branch_name: Option<&str>,
        estimated_repo_gib: u64,
    ) -> Result<WorktreeLease, WorktreeError> {
        // 1. Check disk capacity
        if self.cap.reserve(estimated_repo_gib) == CapVerdict::Refused {
            return Err(WorktreeError::CapacityExceeded {
                max_gib: self.cap.max_gib,
                used_gib: self.cap.used_gib,
            });
        }

        // 2. Prepare paths
        fs::create_dir_all(&self.worktrees_dir)?;
        let worktree_path = self.worktrees_dir.join(format!("task-{}", task_id));
        let branch = branch_name
            .map(|b| b.to_string())
            .unwrap_or_else(|| format!("subtask/{}", task_id));

        // 3. Create git worktree via serialized write queue
        let path_str = worktree_path.to_string_lossy().to_string();
        self.git_queue.run_write(
            &["worktree", "add", "-b", &branch, &path_str],
            None,
        )?;

        // 4. Initialize 3-file blackboard inside worktree
        self.initialize_blackboard(&worktree_path, task_id)?;

        Ok(WorktreeLease {
            task_id: task_id.to_string(),
            branch_name: branch,
            path: worktree_path,
            reserved_gib: estimated_repo_gib.max(self.cap.min_reserve_gib),
        })
    }

    /// Initialize the 3-file blackboard state sync inside the worktree.
    fn initialize_blackboard(&self, worktree_path: &Path, task_id: &str) -> Result<(), std::io::Error> {
        let blackboard_dir = worktree_path.join(".everyaios");
        fs::create_dir_all(&blackboard_dir)?;
        fs::create_dir_all(blackboard_dir.join("receipts"))?;

        let initial_plan = format!(
            "# Task Plan: {task_id}\n\n## Phase: Initialization\n- [ ] Task execution started\n"
        );
        fs::write(blackboard_dir.join("task_plan.md"), initial_plan)?;

        let initial_findings = format!(
            "# Findings & Discovered Context: {task_id}\n\n"
        );
        fs::write(blackboard_dir.join("findings.md"), initial_findings)?;

        Ok(())
    }

    /// Clean up and remove a worktree lease.
    pub fn release_worktree(&mut self, lease: &WorktreeLease) -> Result<(), WorktreeError> {
        let path_str = lease.path.to_string_lossy().to_string();

        // 1. Remove git worktree
        let _ = self.git_queue.run_write(&["worktree", "remove", "--force", &path_str], None);

        // 2. Remove directory if anything remains
        if lease.path.exists() {
            let _ = fs::remove_dir_all(&lease.path);
        }

        // 3. Release disk reservation
        self.cap.release(lease.reserved_gib);

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_worktree_manager_initialization() {
        let unique = format!("worktree_test_{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos());
        let test_dir = std::env::temp_dir().join(unique);
        let cap = WorktreeCap::default();
        let mgr = WorktreeManager::new(&test_dir, cap);

        assert_eq!(mgr.cap.max_gib, 8);
        assert_eq!(mgr.worktrees_dir, test_dir.join(".everyaios").join("worktrees"));
    }
}
