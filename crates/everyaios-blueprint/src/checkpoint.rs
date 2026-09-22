//! Checkpointing + registry (P6.1 — resume-after-reboot + checkpoint freeze
//! on circuit-break). A [`Checkpoint`] snapshots the whole plan as JSON so a
//! rebooted session resumes from a turn boundary instead of re-planning; the
//! optional `frozen_reason` is set when a circuit-break (B6 MCQ) halts the
//! run, so the resume path can ask "resume or retry?" rather than silently
//! continuing. [`BlueprintRegistry`] indexes blueprint `.md` files from a
//! directory (blueprint → optional `AgentConfig` frontmatter).

use crate::blueprint::Blueprint;
use everyaios_types::CheckpointId;
use crate::frontmatter::AgentConfig;
#[cfg(test)]
use crate::frontmatter::Isolation;
use crate::md::{BlueprintDoc, MdError};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use thiserror::Error;

/// A durable snapshot of a plan at a turn boundary.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Checkpoint {
    /// P71.3g — the canonical checkpoint id (`ARCH/RECOVERY.md` §7). Snapshot
    /// files written before ids existed deserialize as unassigned, so a resume
    /// can still read them without inventing an identity for them.
    #[serde(default)]
    pub checkpoint_id: CheckpointId,
    pub blueprint: Blueprint,
    /// Non-empty when frozen on circuit-break (B6 MCQ pattern).
    #[serde(default)]
    pub frozen_reason: Option<String>,
    /// Plan version (bumped on rewrite; used by the plan cache).
    #[serde(default)]
    pub version: u32,
}

impl Checkpoint {
    pub fn new(blueprint: Blueprint) -> Self {
        Self {
            checkpoint_id: CheckpointId::unassigned(),
            blueprint,
            frozen_reason: None,
            version: 0,
        }
    }

    /// Attach the canonical id (a step checkpoint knows its `(work, step)`).
    pub fn with_id(mut self, checkpoint_id: CheckpointId) -> Self {
        self.checkpoint_id = checkpoint_id;
        self
    }

    pub fn is_frozen(&self) -> bool {
        self.frozen_reason.is_some()
    }
}

#[derive(Debug, Error)]
pub enum CheckpointError {
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("json error: {0}")]
    Json(#[from] serde_json::Error),
}

impl Blueprint {
    /// Freeze the plan to `path` atomically (temp-file + rename) so a crash
    /// never leaves a half-written checkpoint.
    pub fn checkpoint_to(
        &self,
        path: &Path,
        frozen_reason: Option<&str>,
        version: u32,
    ) -> Result<(), CheckpointError> {
        let cp = Checkpoint {
            // A file-targeted snapshot has no `(work, step)` to derive from;
            // the per-step path (`checkpoint_step_to`) assigns the id.
            checkpoint_id: CheckpointId::unassigned(),
            blueprint: self.clone(),
            frozen_reason: frozen_reason.map(str::to_string),
            version,
        };
        atomic_write_json(path, &cp)
    }

    /// Resume a frozen/checkpointed plan from `path`.
    pub fn resume_from(path: &Path) -> Result<Checkpoint, CheckpointError> {
        let bytes = std::fs::read(path)?;
        Ok(serde_json::from_slice(&bytes)?)
    }
}

/// Write JSON atomically: serialize → temp file → rename over the target.
fn atomic_write_json<T: Serialize>(path: &Path, value: &T) -> Result<(), CheckpointError> {
    let bytes = serde_json::to_vec_pretty(value)?;
    let tmp = temp_sibling(path);
    std::fs::write(&tmp, bytes)?;
    std::fs::rename(&tmp, path)?;
    Ok(())
}

// ---------------------------------------------------------------------------
// P64.7 — per-step checkpoint & rollback index (SPEC I16, ARCH/17 §17.10)
// ---------------------------------------------------------------------------
//
// Every mutating tool call checkpoints: git for code workspaces (the SHA is
// recorded by the caller via `everyaios-core::execution::commit_workspace_
// snapshot`, which reuses `git_commit::commit_verified_edit`) + the JSON
// snapshot below (reuses [`Blueprint::checkpoint_to`]). The UI restore picker
// lists [`StepCheckpoint`] rows; restore itself is fence-checked in
// `everyaios-core::execution` (`check_restore_fence` + the never-replay
// predicate), never here — this module owns the index, not authority.

/// P64.7 — one restorable step: the blueprint snapshot + the fencing token
/// that owned the run when the step landed.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct StepCheckpoint {
    /// P71.3g — the canonical checkpoint id (`ckpt:<work>/<step>`). Rows written
    /// before ids existed deserialize as unassigned and are re-derived on read
    /// (deterministic, so no row is given a new identity).
    #[serde(default)]
    pub checkpoint_id: CheckpointId,
    /// Owning work id (`execution/begin*` id, e.g. `ex:3`).
    pub work_id: String,
    /// Monotonic step within the work (1-based).
    pub step: u32,
    /// Short git SHA when the workspace is a git checkout (`None` for
    /// non-git resource snapshots — honest, never faked).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub git_sha: Option<String>,
    /// File name of the blueprint snapshot inside the checkpoint dir.
    pub snapshot_file: String,
    /// Opaque `RunAuthority` fencing token at checkpoint time.
    #[serde(default)]
    pub fencing_token: u64,
    /// Wall-clock ms when the checkpoint landed.
    #[serde(default)]
    pub created_at_ms: u64,
}

fn step_snapshot_name(work_id: &str, step: u32) -> String {
    let safe: String = work_id
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect();
    format!("bp-{safe}-step-{step}.json")
}

fn step_index_name(work_id: &str, step: u32) -> String {
    let snap = step_snapshot_name(work_id, step);
    format!("{}.step.json", snap.trim_end_matches(".json"))
}

impl Blueprint {
    /// P64.7 — checkpoint one mutating step: reuse [`Blueprint::checkpoint_to`]
    /// for the snapshot payload, then write the [`StepCheckpoint`] index row
    /// atomically beside it. Returns the index row.
    pub fn checkpoint_step_to(
        &self,
        dir: &Path,
        work_id: &str,
        step: u32,
        git_sha: Option<String>,
        fencing_token: u64,
    ) -> Result<StepCheckpoint, CheckpointError> {
        if work_id.is_empty() {
            return Err(CheckpointError::Io(std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                "checkpoint_step_to requires work_id",
            )));
        }
        if step == 0 {
            return Err(CheckpointError::Io(std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                "checkpoint_step_to requires step >= 1",
            )));
        }
        std::fs::create_dir_all(dir)?;
        let snapshot_file = step_snapshot_name(work_id, step);
        let checkpoint_id = CheckpointId::for_step(work_id, step);
        // The snapshot carries the same identity as its index row.
        self.checkpoint_to(&dir.join(&snapshot_file), None, step)?;
        let row = StepCheckpoint {
            checkpoint_id,
            work_id: work_id.to_string(),
            step,
            git_sha,
            snapshot_file: snapshot_file.clone(),
            fencing_token,
            created_at_ms: now_ms(),
        };
        atomic_write_json(&dir.join(step_index_name(work_id, step)), &row)?;
        Ok(row)
    }

    /// P64.7 — list all step rows for a work, sorted by step (the restore
    /// picker's input). Missing dir ⇒ empty (no steps yet, not an error).
    pub fn list_step_checkpoints(
        dir: &Path,
        work_id: &str,
    ) -> Result<Vec<StepCheckpoint>, CheckpointError> {
        let mut out = Vec::new();
        let entries = match std::fs::read_dir(dir) {
            Ok(e) => e,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(out),
            Err(e) => return Err(e.into()),
        };
        for entry in entries {
            let entry = entry?;
            let name = entry.file_name().to_string_lossy().into_owned();
            if !name.ends_with(".step.json") {
                continue;
            }
            let bytes = std::fs::read(entry.path())?;
            let mut row: StepCheckpoint = serde_json::from_slice(&bytes)?;
            if row.checkpoint_id.is_assigned() {
                // already identified
            } else {
                // Legacy row (written before ids existed): re-derive, never mint.
                row.checkpoint_id = CheckpointId::for_step(&row.work_id, row.step);
            }
            if row.work_id == work_id {
                out.push(row);
            }
        }
        out.sort_by_key(|r| r.step);
        Ok(out)
    }
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn temp_sibling(path: &Path) -> PathBuf {
    let mut name = path
        .file_name()
        .map(|s| s.to_os_string())
        .unwrap_or_else(|| "checkpoint".into());
    name.push(".tmp");
    path.with_file_name(name)
}

/// An in-memory index of blueprints loaded from `.md` files.
#[derive(Debug, Default)]
pub struct BlueprintRegistry {
    docs: Vec<BlueprintDoc>,
}

#[derive(Debug, Error)]
pub enum RegistryError {
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("blueprint parse error: {0}")]
    Md(#[from] MdError),
    #[error("duplicate blueprint id {0:?}")]
    DuplicateId(String),
}

impl BlueprintRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn insert(&mut self, doc: BlueprintDoc) -> Result<(), RegistryError> {
        let id = doc.blueprint.id.clone();
        if self.get(&id).is_some() {
            return Err(RegistryError::DuplicateId(id));
        }
        self.docs.push(doc);
        Ok(())
    }

    pub fn get(&self, id: &str) -> Option<&Blueprint> {
        self.docs.iter().map(|d| &d.blueprint).find(|b| b.id == id)
    }

    pub fn doc(&self, id: &str) -> Option<&BlueprintDoc> {
        self.docs.iter().find(|d| d.blueprint.id == id)
    }

    pub fn len(&self) -> usize {
        self.docs.len()
    }

    pub fn is_empty(&self) -> bool {
        self.docs.is_empty()
    }

    /// Load every `*.md` file in `dir` that parses as a blueprint. Files that
    /// are not blueprints (missing the `# Blueprint:` header) are skipped.
    /// Returns the number of blueprints loaded.
    pub fn load_dir(&mut self, dir: &Path) -> Result<usize, RegistryError> {
        let mut loaded = 0;
        for entry in std::fs::read_dir(dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("md") {
                continue;
            }
            let text = std::fs::read_to_string(&path)?;
            match BlueprintDoc::from_markdown(&text) {
                Ok(doc) => {
                    self.insert(doc)?;
                    loaded += 1;
                }
                Err(MdError::MissingId) => { /* not a blueprint — skip */ }
                Err(e) => return Err(e.into()),
            }
        }
        Ok(loaded)
    }

    /// The agent configs carried by registered blueprints (name → config), so
    /// a blueprint directory doubles as an `AgentConfig` registry.
    pub fn agent_configs(&self) -> Vec<(&str, &AgentConfig)> {
        self.docs
            .iter()
            .filter_map(|d| {
                d.agent_config
                    .as_ref()
                    .map(|c| (d.blueprint.id.as_str(), c))
            })
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::blueprint::{BlueprintTask, VerifyBlock};
    use crate::spec::TaskSpec;

    fn bp(id: &str) -> Blueprint {
        let mut b = Blueprint::new(id, "goal");
        b.push(BlueprintTask::new(
            TaskSpec::new("a", "do a"),
            VerifyBlock::new(vec![]),
        ));
        b
    }

    #[test]
    fn checkpoint_roundtrips_atomically() {
        let dir = std::env::temp_dir().join("bp-ckpt");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("bp.json");

        bp("bp-1")
            .checkpoint_to(&path, Some("circuit-break: budget"), 3)
            .unwrap();
        let cp = Blueprint::resume_from(&path).unwrap();
        assert_eq!(cp.blueprint.id, "bp-1");
        assert!(cp.is_frozen());
        assert_eq!(cp.frozen_reason.as_deref(), Some("circuit-break: budget"));
        assert_eq!(cp.version, 3);

        // No leftover temp file.
        assert!(!dir.join("bp.json.tmp").exists());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn unfrozen_checkpoint_is_not_frozen() {
        let cp = Checkpoint::new(bp("bp-1"));
        assert!(!cp.is_frozen());
    }

    #[test]
    fn registry_loads_dir_and_skips_non_blueprints() {
        let dir = std::env::temp_dir().join("bp-reg");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("a.md"), bp("a").to_markdown()).unwrap();
        std::fs::write(dir.join("b.md"), bp("b").to_markdown()).unwrap();
        std::fs::write(dir.join("notes.md"), "# not a blueprint\njust prose").unwrap();

        let mut reg = BlueprintRegistry::new();
        let n = reg.load_dir(&dir).unwrap();
        assert_eq!(n, 2);
        assert!(reg.get("a").is_some());
        assert!(reg.get("b").is_some());
        assert!(reg.get("notes").is_none());
        assert_eq!(reg.len(), 2);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn registry_rejects_duplicate_ids() {
        let mut reg = BlueprintRegistry::new();
        reg.insert(BlueprintDoc {
            agent_config: None,
            blueprint: bp("a"),
        })
        .unwrap();
        assert!(matches!(
            reg.insert(BlueprintDoc {
                agent_config: None,
                blueprint: bp("a"),
            }),
            Err(RegistryError::DuplicateId(_))
        ));
    }

    #[test]
    fn registry_exposes_agent_configs() {
        use crate::frontmatter::{AgentConfig, PermissionMode};
        let mut reg = BlueprintRegistry::new();
        reg.insert(BlueprintDoc {
            agent_config: Some(AgentConfig {
                permission_mode: PermissionMode::Plan,
                color: None,
                hooks: vec![],
                mcp_servers: vec![],
                max_turns: None,
                effort: None,
                background: None,
                isolation: Isolation::None,
            }),
            blueprint: bp("a"),
        })
        .unwrap();
        let cfgs = reg.agent_configs();
        assert_eq!(cfgs.len(), 1);
        assert_eq!(cfgs[0].0, "a");
        assert_eq!(cfgs[0].1.permission_mode, PermissionMode::Plan);
    }

    // --- P64.7 per-step checkpoint ------------------------------------------------

    #[test]
    fn p64_step_checkpoint_reuses_snapshot_format() {
        let dir = std::env::temp_dir().join(format!("bp-p64-step-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let b = bp("bp-step");
        let row = b
            .checkpoint_step_to(&dir, "ex:3", 1, Some("abc123".into()), 9)
            .unwrap();
        assert_eq!(row.work_id, "ex:3");
        assert_eq!(row.step, 1);
        assert_eq!(row.git_sha.as_deref(), Some("abc123"));
        assert_eq!(row.fencing_token, 9);
        // Snapshot payload is the same `Checkpoint` shape as `checkpoint_to`.
        let cp = Blueprint::resume_from(&dir.join(&row.snapshot_file)).unwrap();
        assert_eq!(cp.blueprint.id, "bp-step");
        assert_eq!(cp.version, 1);
        // Non-git step records honest None.
        let row2 = b.checkpoint_step_to(&dir, "ex:3", 2, None, 9).unwrap();
        assert_eq!(row2.git_sha, None);
        // Restore picker lists in step order.
        let rows = Blueprint::list_step_checkpoints(&dir, "ex:3").unwrap();
        assert_eq!(rows.len(), 2);
        assert_eq!((rows[0].step, rows[1].step), (1, 2));
        // Other works are filtered out; missing dir is empty, not an error.
        assert!(Blueprint::list_step_checkpoints(&dir, "ex:9")
            .unwrap()
            .is_empty());
        assert!(Blueprint::list_step_checkpoints(&dir.join("nope"), "ex:3")
            .unwrap()
            .is_empty());
        // No leftover temp files.
        assert!(!dir.join("bp.json.tmp").exists());
        // Fail closed on bad inputs.
        assert!(b.checkpoint_step_to(&dir, "", 1, None, 0).is_err());
        assert!(b.checkpoint_step_to(&dir, "ex:3", 0, None, 0).is_err());
        std::fs::remove_dir_all(&dir).ok();
    }
}
