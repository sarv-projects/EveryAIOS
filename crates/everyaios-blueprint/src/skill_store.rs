//! Skill registry (P7.2 — I2, doc 33 §8 skill-data, doc 41 agent0ai
//! `skills.py` STEAL, doc 58): the `~/.everyaios/skills/` surface.
//!
//! A skill is a directory containing a `SKILL.md` — YAML frontmatter
//! (`name` / `description` / `tools` / `triggers`) plus an ownership block
//! (`author` / `created` / `version`) and a markdown body of instructions.
//! [`SkillStore`] scans/saves/loads them (survives restarts — plain files on
//! disk); [`SkillIndex`] scores them against the current task and renders
//! the active tier for the planner, capped at [`MAX_ACTIVE_SKILLS`] (the
//! Agent Zero pattern).
//!
//! [`taste_skill`] is the first-party anti-slop design skill (doc 58 — the
//! VARIANCE/MOTION/DENSITY dials, distinct from C9 learned preferences);
//! [`grow_from_task`] implements the GenericAgent skill-tree discipline —
//! every solved task becomes a versioned skill with ownership markers.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use thiserror::Error;

/// The max number of skills injected into any single planner context
/// (Agent Zero / MAX_ACTIVE_SKILLS pattern).
pub const MAX_ACTIVE_SKILLS: usize = 20;

/// SKILL.md frontmatter + ownership + body.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SkillManifest {
    pub name: String,
    pub description: String,
    /// Tool names the skill uses (capability hints for selection).
    #[serde(default)]
    pub tools: Vec<String>,
    /// Natural-language triggers that should surface this skill.
    #[serde(default)]
    pub triggers: Vec<String>,
    // Ownership markers (doc 58): who created it, when, and the version.
    pub author: String,
    pub created: String,
    pub version: String,
}

/// A full skill: manifest + instruction body.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Skill {
    pub manifest: SkillManifest,
    pub body: String,
}

/// Errors from the skill registry.
#[derive(Debug, Error)]
pub enum SkillError {
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("malformed SKILL.md in {path}: {msg}")]
    Malformed { path: String, msg: String },
    #[error("skill `{0}` not found")]
    NotFound(String),
    #[error("skill `{0}` already exists (use save with overwrite)")]
    Exists(String),
    #[error("invalid skill name `{0}` (must be [a-z0-9-]+)")]
    InvalidName(String),
}

impl SkillManifest {
    fn valid_name(name: &str) -> bool {
        !name.is_empty()
            && name.len() <= 64
            && name
                .chars()
                .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
    }
}

impl Skill {
    /// The canonical `SKILL.md` text (frontmatter + body). Round-trips with
    /// [`Skill::from_skill_md`].
    pub fn to_skill_md(&self) -> String {
        let mut out = String::from("---\n");
        out.push_str(&format!("name: {}\n", self.manifest.name));
        out.push_str(&format!("description: {}\n", self.manifest.description));
        if !self.manifest.tools.is_empty() {
            out.push_str("tools:\n");
            for t in &self.manifest.tools {
                out.push_str(&format!("  - {t}\n"));
            }
        }
        if !self.manifest.triggers.is_empty() {
            out.push_str("triggers:\n");
            for t in &self.manifest.triggers {
                out.push_str(&format!("  - {t}\n"));
            }
        }
        out.push_str(&format!("author: {}\n", self.manifest.author));
        out.push_str(&format!("created: {}\n", self.manifest.created));
        out.push_str(&format!("version: {}\n", self.manifest.version));
        out.push_str("---\n");
        out.push_str(&self.body);
        if !self.body.ends_with('\n') {
            out.push('\n');
        }
        out
    }

    /// Parse a `SKILL.md` file into a [`Skill`].
    pub fn from_skill_md(source: &str, path: &str) -> Result<Skill, SkillError> {
        let (fm, body) = split_frontmatter(source).ok_or_else(|| SkillError::Malformed {
            path: path.into(),
            msg: "missing --- frontmatter delimiters".into(),
        })?;
        let manifest = parse_manifest(fm, path)?;
        if !SkillManifest::valid_name(&manifest.name) {
            return Err(SkillError::InvalidName(manifest.name));
        }
        Ok(Skill {
            manifest,
            body: body.trim().to_string(),
        })
    }
}

fn split_frontmatter(source: &str) -> Option<(&str, &str)> {
    let trimmed = source.strip_prefix('\u{feff}').unwrap_or(source);
    let rest = trimmed.strip_prefix("---\n")?;
    let end = rest.find("\n---")?;
    Some((&rest[..end], &rest[end + 4..]))
}

/// Parse the YAML-ish frontmatter keys the manifest needs (lists are `- item`
/// lines under a key). Unknown keys are ignored, so Claude-Skills / agent
/// files with extra metadata still parse.
fn parse_manifest(fm: &str, path: &str) -> Result<SkillManifest, SkillError> {
    let mut m = SkillManifest {
        name: String::new(),
        description: String::new(),
        tools: Vec::new(),
        triggers: Vec::new(),
        author: String::new(),
        created: String::new(),
        version: String::new(),
    };
    let mut list_key: Option<String> = None;
    for raw in fm.lines() {
        // Trim both ends: list items are conventionally indented
        // (`  - item`), and top-level keys may carry trailing spaces.
        let line = raw.trim();
        if line.is_empty() {
            continue;
        }
        if let Some(item) = line.strip_prefix("- ") {
            let item = item.trim();
            match list_key.as_deref() {
                Some("tools") => m.tools.push(item.into()),
                Some("triggers") => m.triggers.push(item.into()),
                _ => {}
            }
            continue;
        }
        list_key = None;
        let Some((key, value)) = line.split_once(':') else {
            continue;
        };
        let key = key.trim();
        let value = value.trim();
        match key {
            "name" => m.name = value.into(),
            "description" => m.description = value.into(),
            "author" => m.author = value.into(),
            "created" => m.created = value.into(),
            "version" => m.version = value.into(),
            "tools" | "triggers" => {
                list_key = Some(key.to_string());
            }
            _ => {}
        }
    }
    if m.name.is_empty() {
        return Err(SkillError::Malformed {
            path: path.into(),
            msg: "missing required `name` field".into(),
        });
    }
    Ok(m)
}

/// The on-disk registry: `<root>/<name>/SKILL.md` per skill (the ecosystem
/// convention), so a skill survives restarts and is callable in a later
/// session.
#[derive(Debug, Clone)]
pub struct SkillStore {
    root: PathBuf,
}

impl SkillStore {
    pub fn new(root: impl Into<PathBuf>) -> Self {
        Self { root: root.into() }
    }

    /// `~/.everyaios/skills` (the documented default location).
    pub fn default_home() -> PathBuf {
        dirs_home()
            .map(|h| h.join(".everyaios").join("skills"))
            .unwrap_or_else(|| PathBuf::from(".everyaios/skills"))
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    /// Scan `<root>/*/SKILL.md` and load every well-formed skill. Malformed
    /// files are skipped and reported (a bad skill must not hide the rest).
    pub fn scan(&self) -> Result<Vec<Skill>, SkillError> {
        let mut skills = Vec::new();
        if !self.root.exists() {
            return Ok(skills);
        }
        for entry in std::fs::read_dir(&self.root)? {
            let entry = entry?;
            if !entry.file_type()?.is_dir() {
                continue;
            }
            let skill_md = entry.path().join("SKILL.md");
            if !skill_md.exists() {
                continue;
            }
            let source = std::fs::read_to_string(&skill_md)?;
            match Skill::from_skill_md(&source, &skill_md.display().to_string()) {
                Ok(s) => skills.push(s),
                Err(_) => continue, // malformed — skip, keep the rest
            }
        }
        skills.sort_by(|a, b| a.manifest.name.cmp(&b.manifest.name));
        Ok(skills)
    }

    /// Write a skill to `<root>/<name>/SKILL.md`, creating directories.
    /// `overwrite: false` refuses an existing skill (no accidental clobber).
    pub fn save(&self, skill: &Skill, overwrite: bool) -> Result<PathBuf, SkillError> {
        let name = skill.manifest.name.clone();
        if !SkillManifest::valid_name(&name) {
            return Err(SkillError::InvalidName(name));
        }
        let dir = self.root.join(&name);
        let path = dir.join("SKILL.md");
        if path.exists() && !overwrite {
            return Err(SkillError::Exists(name));
        }
        std::fs::create_dir_all(&dir)?;
        std::fs::write(&path, skill.to_skill_md())?;
        Ok(path)
    }

    /// Load one skill by name.
    pub fn load(&self, name: &str) -> Result<Skill, SkillError> {
        let path = self.root.join(name).join("SKILL.md");
        let source =
            std::fs::read_to_string(&path).map_err(|_| SkillError::NotFound(name.into()))?;
        Skill::from_skill_md(&source, &path.display().to_string())
    }

    /// Remove a skill directory.
    pub fn delete(&self, name: &str) -> Result<(), SkillError> {
        let dir = self.root.join(name);
        if !dir.exists() {
            return Err(SkillError::NotFound(name.into()));
        }
        std::fs::remove_dir_all(dir)?;
        Ok(())
    }
}

/// A scored skill within the active tier.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ScoredSkill {
    pub name: String,
    pub description: String,
    pub score: f64,
}

/// The planner-facing index: scores every registered skill against the
/// current task and renders the active tier (≤ [`MAX_ACTIVE_SKILLS`]).
#[derive(Debug, Clone, Default)]
pub struct SkillIndex {
    skills: Vec<Skill>,
}

impl SkillIndex {
    pub fn new(skills: Vec<Skill>) -> Self {
        Self { skills }
    }

    pub fn all(&self) -> &[Skill] {
        &self.skills
    }

    /// Deterministic relevance score in `[0, 1]`: trigger hits count most,
    /// then tool-name hits, then name/description keyword overlap. A query
    /// term matching a trigger is worth more than a description word.
    pub fn score(&self, skill: &Skill, query: &str) -> f64 {
        let q = query.to_lowercase();
        let terms: Vec<&str> = q.split_whitespace().collect();
        if terms.is_empty() {
            return 0.0;
        }
        let mut hits: f64 = 0.0;
        let mut weight: f64 = 0.0;
        for term in terms {
            // Triggers: strong signal.
            if skill
                .manifest
                .triggers
                .iter()
                .any(|t| t.to_lowercase().contains(term) || term.contains(&t.to_lowercase()))
            {
                hits += 1.0;
                weight += 1.0;
                continue;
            }
            // Tool names: medium signal.
            if skill
                .manifest
                .tools
                .iter()
                .any(|t| t.to_lowercase().contains(term))
            {
                hits += 0.7;
                weight += 0.7;
                continue;
            }
            // Name/description: weak signal.
            let name = skill.manifest.name.to_lowercase();
            let desc = skill.manifest.description.to_lowercase();
            if name.contains(term) || term.contains(&name) {
                hits += 0.6;
                weight += 0.6;
            } else if desc.contains(term) {
                hits += 0.4;
                weight += 0.4;
            }
        }
        if weight == 0.0 {
            0.0
        } else {
            (hits / weight).clamp(0.0, 1.0)
        }
    }

    /// The active tier for the current task: scored, sorted desc, capped at
    /// [`MAX_ACTIVE_SKILLS`]. Zero-scoring skills are dropped unless nothing
    /// scored at all.
    pub fn select(&self, query: &str) -> Vec<ScoredSkill> {
        let mut scored: Vec<ScoredSkill> = self
            .skills
            .iter()
            .map(|s| ScoredSkill {
                name: s.manifest.name.clone(),
                description: s.manifest.description.clone(),
                score: self.score(s, query),
            })
            .filter(|s| s.score > 0.0)
            .collect();
        scored.sort_by(|a, b| {
            b.score
                .partial_cmp(&a.score)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        scored.truncate(MAX_ACTIVE_SKILLS);
        scored
    }

    /// Render the planner's skill-index tier (auto-injected into the system
    /// prompt). Always lists what was selected and why the rest was cut.
    pub fn render(&self, query: &str) -> String {
        let selected = self.select(query);
        if selected.is_empty() {
            return "# Skills\n\n(no matching skills)\n".to_string();
        }
        let mut out = format!("# Skills (active tier, ≤ {MAX_ACTIVE_SKILLS})\n\n");
        for s in &selected {
            out.push_str(&format!(
                "- **{}** ({:.0}%) — {}\n",
                s.name,
                s.score * 100.0,
                s.description
            ));
        }
        if self.skills.len() > selected.len() {
            out.push_str(&format!(
                "\n({} of {} skills matched; the rest were below the relevance floor)\n",
                selected.len(),
                self.skills.len()
            ));
        }
        out
    }
}

/// The first-party anti-slop design skill (doc 58): an optional design
/// SKILL.md with VARIANCE/MOTION/DENSITY dials. Distinct from C9 (learned
/// coding preferences, algorithm #31) — shipping this never marks C9 done.
pub fn taste_skill() -> Skill {
    Skill {
        manifest: SkillManifest {
            name: "taste".into(),
            description: "Anti-slop frontend design: layout, typography, motion, and spacing discipline with VARIANCE/MOTION/DENSITY dials".into(),
            tools: vec!["file_ops.write".into()],
            triggers: vec!["design".into(), "ui".into(), "frontend".into(), "layout".into(), "style".into()],
            author: "everyaios".into(),
            created: "2026-08-20".into(),
            version: "1.0.0".into(),
        },
        body: "Design discipline (apply before writing UI code):\n\n\
- VARIANCE dial (0–3): how far a screen may deviate from the established grid/pattern. Default 0; raise only with a reason.\n\
- MOTION dial (0–3): how much animation. Default 1 — entrance fades/rises only; never decorative loops.\n\
- DENSITY dial (0–3): information density. Default 1 — one primary action per view; no hidden affordances.\n\
- Typography: max 2 families, a real type scale, and 4-space rhythm on spacing.\n\
- No placeholder gradients, no centered-hero defaults, no slop shadows; every element earns its place.\n".into(),
    }
}

/// GenericAgent skill-tree growth (doc 58 §3): every solved task becomes a
/// versioned skill with ownership markers. Deterministic — the task name,
/// the solution summary, and the next version are inputs, and the skill is
/// written through the store (so it survives the restart).
pub fn grow_from_task(
    store: &SkillStore,
    task_name: &str,
    solution: &str,
    author: &str,
    version: &str,
) -> Result<Skill, SkillError> {
    let slug = slugify(task_name);
    let existing = store.load(&slug).ok();
    let final_version = if let Some(old) = existing {
        // Version bump: `1.0.0` → `1.0.1` (patch) — the ownership marker
        // records the growth, never a silent overwrite.
        bump_patch(&old.manifest.version)
    } else {
        version.to_string()
    };
    let skill = Skill {
        manifest: SkillManifest {
            name: slug,
            description: format!("Reusable workflow: {task_name}"),
            tools: Vec::new(),
            triggers: vec![task_name.to_lowercase()],
            author: author.into(),
            created: "2026-08-20".into(),
            version: final_version,
        },
        body: solution.to_string(),
    };
    // Overwrite=true: growing a skill tree intentionally updates the leaf
    // (version bump preserves the history trail).
    store.save(&skill, true)?;
    Ok(skill)
}

fn slugify(name: &str) -> String {
    let mut out = String::new();
    for c in name.to_lowercase().chars() {
        if c.is_ascii_alphanumeric() {
            out.push(c);
        } else {
            // Any separator (space, `+`, `.`, `_`, …) becomes `-`.
            out.push('-');
        }
    }
    while out.contains("--") {
        out = out.replace("--", "-");
    }
    let out = out.trim_matches('-').to_string();
    if out.is_empty() {
        "task".to_string()
    } else {
        out
    }
}

fn bump_patch(v: &str) -> String {
    let parts: Vec<&str> = v.split('.').collect();
    let patch: u32 = parts.get(2).and_then(|p| p.parse().ok()).unwrap_or(0);
    format!(
        "{}.{}.{}",
        parts.first().copied().unwrap_or("0"),
        parts.get(1).copied().unwrap_or("0"),
        patch + 1
    )
}

/// Home-dir lookup without an external dirs crate.
fn dirs_home() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("USERPROFILE").map(PathBuf::from))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};

    fn tmpdir() -> PathBuf {
        static N: AtomicU32 = AtomicU32::new(0);
        let n = N.fetch_add(1, Ordering::SeqCst);
        let d =
            std::env::temp_dir().join(format!("everyaios-skills-test-{}-{n}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    fn sample_skill() -> Skill {
        Skill {
            manifest: SkillManifest {
                name: "refactor-helper".into(),
                description: "Safe multi-file refactor discipline".into(),
                tools: vec!["file_ops.read".into(), "file_ops.write".into()],
                triggers: vec!["refactor".into(), "rename".into()],
                author: "tester".into(),
                created: "2026-08-20".into(),
                version: "1.0.0".into(),
            },
            body: "1. Read all callers before renaming.\n2. Prefer one atomic diff.".into(),
        }
    }

    #[test]
    fn skill_md_roundtrips() {
        let s = sample_skill();
        let md = s.to_skill_md();
        let back = Skill::from_skill_md(&md, "test").unwrap();
        assert_eq!(back, s);
    }

    #[test]
    fn parses_anthropic_style_frontmatter() {
        let src = "---\nname: x\ndescription: y\ntools:\n  - file_ops.read\ntriggers:\n  - refactor\nauthor: a\ncreated: 2026-08-20\nversion: 0.1.0\n---\nbody text";
        let s = Skill::from_skill_md(src, "x/SKILL.md").unwrap();
        assert_eq!(s.manifest.name, "x");
        assert_eq!(s.manifest.tools, vec!["file_ops.read"]);
        assert_eq!(s.manifest.triggers, vec!["refactor"]);
        assert_eq!(s.body, "body text");
    }

    #[test]
    fn rejects_invalid_names() {
        let src =
            "---\nname: Bad Name!\ndescription: x\nauthor: a\ncreated: c\nversion: 1\n---\nbody";
        assert!(matches!(
            Skill::from_skill_md(src, "bad"),
            Err(SkillError::InvalidName(_))
        ));
    }

    #[test]
    fn store_save_load_scan_delete_survive_restart() {
        let dir = tmpdir();
        let store = SkillStore::new(&dir);
        let s = sample_skill();
        store.save(&s, false).unwrap();

        // "Restart": a fresh store over the same dir sees the skill.
        let store2 = SkillStore::new(&dir);
        let loaded = store2.load("refactor-helper").unwrap();
        assert_eq!(loaded, s);

        let scanned = store2.scan().unwrap();
        assert_eq!(scanned.len(), 1);
        assert_eq!(scanned[0].manifest.name, "refactor-helper");

        // Duplicate save without overwrite refuses.
        assert!(matches!(store2.save(&s, false), Err(SkillError::Exists(_))));
        // Overwrite works.
        store2.save(&s, true).unwrap();

        store2.delete("refactor-helper").unwrap();
        assert!(matches!(
            store2.load("refactor-helper"),
            Err(SkillError::NotFound(_))
        ));
    }

    #[test]
    fn scan_skips_malformed_and_keeps_valid() {
        let dir = tmpdir();
        let store = SkillStore::new(&dir);
        store.save(&sample_skill(), false).unwrap();
        // A malformed sibling (no name) must not break the scan.
        let bad_dir = dir.join("bad-skill");
        std::fs::create_dir_all(&bad_dir).unwrap();
        std::fs::write(
            bad_dir.join("SKILL.md"),
            "---\ndescription: no name here\n---\nbody",
        )
        .unwrap();
        let scanned = store.scan().unwrap();
        assert_eq!(scanned.len(), 1);
    }

    #[test]
    fn index_scores_triggers_over_description() {
        let skills = vec![
            sample_skill(), // triggers: refactor
            Skill {
                manifest: SkillManifest {
                    name: "data-cleanup".into(),
                    description: "spreadsheet cleanup".into(),
                    tools: vec![],
                    triggers: vec!["cleanup".into()],
                    author: "a".into(),
                    created: "c".into(),
                    version: "1".into(),
                },
                body: String::new(),
            },
        ];
        let idx = SkillIndex::new(skills);
        let refactor = idx.score(&idx.all()[0], "refactor this file");
        let cleanup = idx.score(&idx.all()[1], "refactor this file");
        assert!(refactor > cleanup, "{refactor} > {cleanup}");
    }

    #[test]
    fn select_caps_at_max_active_skills() {
        let skills: Vec<Skill> = (0..30)
            .map(|i| Skill {
                manifest: SkillManifest {
                    name: format!("skill-{i}"),
                    description: "matches the query word".into(),
                    tools: vec![],
                    triggers: vec!["test".into()],
                    author: "a".into(),
                    created: "c".into(),
                    version: "1".into(),
                },
                body: String::new(),
            })
            .collect();
        let idx = SkillIndex::new(skills);
        let selected = idx.select("test");
        assert_eq!(selected.len(), MAX_ACTIVE_SKILLS);
    }

    #[test]
    fn render_injects_planner_tier() {
        let idx = SkillIndex::new(vec![sample_skill()]);
        let rendered = idx.render("refactor");
        assert!(rendered.contains("# Skills"));
        assert!(rendered.contains("refactor-helper"));
        assert!(rendered.contains("%"));
    }

    #[test]
    fn taste_skill_is_first_party_design() {
        let t = taste_skill();
        assert_eq!(t.manifest.author, "everyaios");
        assert!(t.manifest.triggers.iter().any(|x| x == "design"));
        assert!(t.body.contains("VARIANCE"));
    }

    #[test]
    fn grow_from_task_creates_versioned_skill_and_bumps() {
        let dir = tmpdir();
        let store = SkillStore::new(&dir);
        let first =
            grow_from_task(&store, "Fix N+1 query bug", "solution…", "agent-a", "1.0.0").unwrap();
        assert_eq!(first.manifest.name, "fix-n-1-query-bug");
        assert_eq!(first.manifest.version, "1.0.0");
        assert!(first
            .manifest
            .triggers
            .contains(&"fix n+1 query bug".to_string()));

        // Growing again bumps the patch version (ownership marker).
        let second = grow_from_task(
            &store,
            "Fix N+1 query bug",
            "better solution…",
            "agent-a",
            "1.0.0",
        )
        .unwrap();
        assert_eq!(second.manifest.version, "1.0.1");
        assert_ne!(second.body, first.body);
    }
}
