//! Checkpointing + registry (P6.1 — resume-after-reboot + checkpoint freeze
//! on circuit-break). A [`Checkpoint`] snapshots the whole plan as JSON so a
//! rebooted session resumes from a turn boundary instead of re-planning; the
//! optional `frozen_reason` is set when a circuit-break (B6 MCQ) halts the
//! run, so the resume path can ask "resume or retry?" rather than silently
//! continuing. [`BlueprintRegistry`] indexes blueprint `.md` files from a
//! directory (blueprint → optional `AgentConfig` frontmatter).

use crate::blueprint::Blueprint;
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
            blueprint,
            frozen_reason: None,
            version: 0,
        }
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
}
