//! Guard-2-ticketed cleanup proposals (D9 cleanup, ARCH/06).
//!
//! This crate **never deletes**. It only *proposes* `CleanupAction`s, each of
//! which must be converted to a Guard-2 decision package and approved before
//! the core executes the actual move (recycle-bin-aware). The invariant is
//! "sidecar proposes, Rust disposes": cleanup never bypasses the dual-guard.

use std::collections::HashSet;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::dedup::DupGroup;
use crate::finder::{find_large_files, FinderOptions, SortBy};
use crate::walk::Arena;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum CleanupKind {
    /// Move to the OS recycle bin (default, reversible).
    MoveToTrash,
    /// Replace a copy with a hardlink to the kept file (same inode).
    ReplaceWithHardlink,
    /// Replace a copy with a reflink (CoW clone on btrfs/xfs/apfs).
    ReplaceWithReflink,
    /// Permanent unlink — highest risk, never proposed automatically.
    DeletePermanently,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CleanupAction {
    pub path: PathBuf,
    pub kind: CleanupKind,
    pub freed_bytes: u64,
    pub rationale: String,
    /// Always true: cleanup never bypasses the dual-guard.
    pub requires_ticket: bool,
}

impl CleanupAction {
    /// The structured decision package rendered as a Guard-2 card.
    pub fn decision_package(&self) -> serde_json::Value {
        serde_json::json!({
            "tool_id": "disk_cleanup",
            "operation": match self.kind {
                CleanupKind::MoveToTrash => "move_to_trash",
                CleanupKind::ReplaceWithHardlink => "replace_with_hardlink",
                CleanupKind::ReplaceWithReflink => "replace_with_reflink",
                CleanupKind::DeletePermanently => "delete_permanently",
            },
            "path": self.path.to_string_lossy(),
            "freed_bytes": self.freed_bytes,
            "rationale": self.rationale,
            "requires_ticket": self.requires_ticket,
            "risk": "destructive",
        })
    }
}

/// For each duplicate group, keep one copy (lexicographically first path) and
/// propose moving the rest to trash. Redundant hardlink names (already sharing
/// an inode) free 0 bytes but are still proposed for tidiness.
pub fn propose_duplicate_cleanup(groups: &[DupGroup]) -> Vec<CleanupAction> {
    let mut out = Vec::new();
    for g in groups {
        let mut files: Vec<&crate::dedup::DupCandidate> = g.files.iter().collect();
        files.sort_by(|a, b| a.path.cmp(&b.path));

        let mut seen: HashSet<(u64, u64)> = HashSet::new();
        // First (kept) file claims its inode.
        if let Some(keep) = files.first() {
            seen.insert((keep.dev, keep.ino));
        }
        for f in &files[1..] {
            let is_new_inode = seen.insert((f.dev, f.ino));
            let freed = if is_new_inode { g.size } else { 0 };
            out.push(CleanupAction {
                path: f.path.clone(),
                kind: CleanupKind::MoveToTrash,
                freed_bytes: freed,
                rationale: format!("duplicate of {}", files[0].path.display()),
                requires_ticket: true,
            });
        }
    }
    out
}

/// Propose moving the top-N largest files to trash.
pub fn propose_large_files_cleanup(arena: &Arena, top_n: usize) -> Vec<CleanupAction> {
    let files = find_large_files(
        arena,
        &FinderOptions {
            top_n,
            ..Default::default()
        },
        SortBy::SizeDesc,
        u64::MAX,
    );
    files
        .into_iter()
        .map(|f| CleanupAction {
            path: PathBuf::from(&f.path),
            kind: CleanupKind::MoveToTrash,
            freed_bytes: f.size,
            rationale: format!("large file ({:.1} MiB)", f.size as f64 / (1024.0 * 1024.0)),
            requires_ticket: true,
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::dedup::DupCandidate;

    #[test]
    fn keeps_one_and_tickets_the_rest() {
        let group = DupGroup {
            size: 10,
            files: vec![
                DupCandidate {
                    path: "b".into(),
                    size: 10,
                    dev: 0,
                    ino: 2,
                    nlink: 1,
                },
                DupCandidate {
                    path: "a".into(),
                    size: 10,
                    dev: 0,
                    ino: 1,
                    nlink: 1,
                },
                DupCandidate {
                    path: "c".into(),
                    size: 10,
                    dev: 0,
                    ino: 3,
                    nlink: 1,
                },
            ],
            wasted_bytes: 20,
            hardlink_groups: 3,
            reflink_eligible: true,
        };

        let actions = propose_duplicate_cleanup(&[group]);
        assert_eq!(actions.len(), 2); // keep "a", trash "b" and "c"
        assert_eq!(actions[0].path.to_string_lossy(), "b");
        assert_eq!(actions[1].path.to_string_lossy(), "c");
        assert!(actions.iter().all(|a| a.requires_ticket));
        assert!(actions.iter().all(|a| a.kind == CleanupKind::MoveToTrash));
        assert!(actions.iter().all(|a| a.freed_bytes == 10));

        // Decision package shape.
        let pkg = actions[0].decision_package();
        assert_eq!(pkg["tool_id"], "disk_cleanup");
        assert_eq!(pkg["requires_ticket"], true);
    }

    #[test]
    fn redundant_hardlink_frees_zero() {
        let group = DupGroup {
            size: 10,
            files: vec![
                DupCandidate {
                    path: "a".into(),
                    size: 10,
                    dev: 0,
                    ino: 7,
                    nlink: 2,
                },
                DupCandidate {
                    path: "b".into(),
                    size: 10,
                    dev: 0,
                    ino: 7,
                    nlink: 2,
                },
            ],
            wasted_bytes: 0,
            hardlink_groups: 1,
            reflink_eligible: true,
        };
        let actions = propose_duplicate_cleanup(&[group]);
        assert_eq!(actions.len(), 1);
        assert_eq!(actions[0].freed_bytes, 0);
    }
}
