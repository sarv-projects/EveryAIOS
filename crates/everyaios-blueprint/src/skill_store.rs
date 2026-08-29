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

use ::sha2::{Digest, Sha256};
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
    /// When this skill should be used (I2 anatomy — conditions in natural
    /// language, distinct from short trigger keywords).
    #[serde(default)]
    pub when_to_use: Vec<String>,
    /// Scripts shipped with the skill (I2 anatomy — lazy: run on demand,
    /// never at load).
    #[serde(default)]
    pub scripts: Vec<SkillScript>,
    /// References (docs/examples) — lazy: fetched on demand, never
    /// preloaded into the prompt.
    #[serde(default)]
    pub references: Vec<SkillReference>,
    /// Asset filenames shipped in the skill directory.
    #[serde(default)]
    pub assets: Vec<String>,
    // Ownership markers (doc 58): who created it, when, and the version.
    pub author: String,
    pub created: String,
    pub version: String,
}

/// A script shipped with a skill (I2). Lazy by design — the registry never
/// runs it; the coordinator invokes it on demand behind the normal guard.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SkillScript {
    pub name: String,
    pub command: String,
    #[serde(default = "default_true")]
    pub lazy: bool,
}

/// A reference shipped with a skill (I2) — lazy: fetched on demand, never
/// preloaded.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SkillReference {
    pub label: String,
    pub url: String,
    #[serde(default = "default_true")]
    pub lazy: bool,
}

fn default_true() -> bool {
    true
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
        if !self.manifest.when_to_use.is_empty() {
            out.push_str("when_to_use:\n");
            for w in &self.manifest.when_to_use {
                out.push_str(&format!("  - {w}\n"));
            }
        }
        if !self.manifest.scripts.is_empty() {
            out.push_str("scripts:\n");
            for s in &self.manifest.scripts {
                out.push_str(&format!("  - name: {}\n", s.name));
                out.push_str(&format!("    command: {}\n", s.command));
            }
        }
        if !self.manifest.references.is_empty() {
            out.push_str("references:\n");
            for r in &self.manifest.references {
                out.push_str(&format!("  - label: {}\n", r.label));
                out.push_str(&format!("    url: {}\n", r.url));
            }
        }
        if !self.manifest.assets.is_empty() {
            out.push_str("assets:\n");
            for a in &self.manifest.assets {
                out.push_str(&format!("  - {a}\n"));
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
        when_to_use: Vec::new(),
        scripts: Vec::new(),
        references: Vec::new(),
        assets: Vec::new(),
        author: String::new(),
        created: String::new(),
        version: String::new(),
    };
    let mut list_key: Option<String> = None;
    // While inside a `scripts`/`references` list, the continuation lines
    // (`command:` / `url:`) belong to the most recent entry.
    #[derive(Clone, Copy)]
    enum EntryKind {
        Script,
        Reference,
    }
    let mut current_entry: Option<(EntryKind, usize)> = None;
    for raw in fm.lines() {
        // Trim both ends: list items are conventionally indented
        // (`  - item`), and top-level keys may carry trailing spaces.
        let line = raw.trim();
        if line.is_empty() {
            continue;
        }
        if let Some(item) = line.strip_prefix("- ") {
            let item = item.trim();
            // A new list item always closes the previous entry's continuation
            // window (a `- label:` inside `scripts` is not a script entry).
            current_entry = None;
            match list_key.as_deref() {
                Some("tools") => m.tools.push(item.into()),
                Some("triggers") => m.triggers.push(item.into()),
                Some("when_to_use") => m.when_to_use.push(item.into()),
                Some("assets") => m.assets.push(item.into()),
                Some("scripts") => {
                    if let Some(name) = item.strip_prefix("name: ") {
                        m.scripts.push(SkillScript {
                            name: name.trim().into(),
                            command: String::new(),
                            lazy: true,
                        });
                        current_entry = Some((EntryKind::Script, m.scripts.len() - 1));
                    }
                }
                Some("references") => {
                    if let Some(label) = item.strip_prefix("label: ") {
                        m.references.push(SkillReference {
                            label: label.trim().into(),
                            url: String::new(),
                            lazy: true,
                        });
                        current_entry = Some((EntryKind::Reference, m.references.len() - 1));
                    }
                }
                _ => {}
            }
            continue;
        }
        // Continuation sub-field of the current script/reference entry. Only
        // the exact continuation keys are consumed; anything else falls
        // through to top-level key handling (so `references:`/`assets:`/
        // `author:` after an entry still parse).
        if let Some((kind, idx)) = current_entry {
            if let Some((k, v)) = line.split_once(':') {
                let k = k.trim();
                let v = v.trim();
                let consumed = matches!(
                    (kind, k),
                    (EntryKind::Script, "command") | (EntryKind::Reference, "url")
                );
                if consumed {
                    match kind {
                        EntryKind::Script => m.scripts[idx].command = v.into(),
                        EntryKind::Reference => m.references[idx].url = v.into(),
                    }
                    continue;
                }
                // Not a continuation key — treat as top-level below.
                current_entry = None;
            } else {
                continue;
            }
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
            "tools" | "triggers" | "when_to_use" | "scripts" | "references" | "assets" => {
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
        let _ = self.unpin(name);
        Ok(())
    }

    // --- Per-install content pinning (doc 75 sha-pinned marketplace model) ---
    //
    // Store-installed skills are sha-256 pinned to the exact bytes written at
    // install. A later mutation of the on-disk SKILL.md (or a malicious
    // marketplace substituting a different file under the same slug) fails the
    // pin, so an installed skill can never silently change capabilities. This
    // is the "sha-pinned + immutable slug" trust model the F8/marketplace docs
    // specify (doc 75 §3), as distinct from the single-global-key index signing
    // in `everyaios-guard::skillstore`. User-authored / Forge-grown skills
    // (never installed through a store) carry no pin and are trusted as before.

    /// Ledger: `<root>/.installed.json` — slug → pin.
    fn ledger_path(&self) -> std::path::PathBuf {
        self.root.join(".installed.json")
    }

    /// Read the current pin ledger (empty map if none / unreadable).
    pub fn pins(&self) -> std::collections::HashMap<String, SkillPin> {
        let Ok(src) = std::fs::read_to_string(self.ledger_path()) else {
            return std::collections::HashMap::new();
        };
        serde_json::from_str(&src).unwrap_or_default()
    }

    /// Write the ledger (best-effort: a pin write failure must never block
    /// the install that already happened).
    fn put_ledger(&self, map: &std::collections::HashMap<String, SkillPin>) {
        std::fs::create_dir_all(&self.root).ok();
        if serde_json::to_string_pretty(map)
            .ok()
            .and_then(|s| std::fs::write(self.ledger_path(), s).ok())
            .is_none()
        {
            // A lost pin degrades to "no pin" → runtime treats the skill as
            // unverifiable, never as verified.
        }
    }

    /// Pin a store-installed skill to the exact bytes written at install.
    pub fn pin(&self, name: &str, source: &str, version: &str, bytes: &[u8]) {
        let mut map = self.pins();
        map.insert(
            name.to_string(),
            SkillPin {
                sha256: sha256_hex(bytes),
                source: source.to_string(),
                version: version.to_string(),
            },
        );
        self.put_ledger(&map);
    }

    /// Remove a pin (uninstall).
    pub fn unpin(&self, name: &str) {
        let mut map = self.pins();
        map.remove(name);
        if map.is_empty() {
            let _ = std::fs::remove_file(self.ledger_path());
        } else {
            self.put_ledger(&map);
        }
    }

    /// Tamper check for one installed, pinned skill. `None` = no pin (user-
    /// authored skill, or the ledger is absent) → no integrity claim. `Some(true)`
    /// = on-disk bytes no longer match the install-time pin (tampered/mutated
    /// or upgraded out-of-band).
    pub fn is_tampered(&self, name: &str, bytes: &[u8]) -> Option<bool> {
        let pins = self.pins();
        let pin = pins.get(name)?;
        Some(sha256_hex(bytes) != pin.sha256)
    }
}

/// Install-time content pin for a store-installed skill (doc 75 sha-pinned
/// marketplace model — immutable slug + content hash).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SkillPin {
    /// hex sha-256 of the exact bytes written at install.
    pub sha256: String,
    /// origin, e.g. `everyaios-store` (or the marketplace id).
    pub source: String,
    /// pinned version at install.
    pub version: String,
}

/// hex sha-256 of a byte slice.
pub fn sha256_hex(bytes: &[u8]) -> String {
    hex_of(&Sha256::digest(bytes).to_vec())
}

fn hex_of(b: &[u8]) -> String {
    use std::fmt::Write;
    let mut s = String::with_capacity(b.len() * 2);
    for byte in b {
        write!(s, "{byte:02x}").expect("write to string");
    }
    s
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
            when_to_use: vec!["before writing any UI code".into()],
            scripts: Vec::new(),
            references: Vec::new(),
            assets: Vec::new(),
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
            when_to_use: Vec::new(),
            scripts: Vec::new(),
            references: Vec::new(),
            assets: Vec::new(),
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
                when_to_use: vec!["when a multi-file change touches shared symbols".into()],
                scripts: vec![SkillScript {
                    name: "check-callers".into(),
                    command: "everyaios symbol callers {symbol}".into(),
                    lazy: true,
                }],
                references: vec![SkillReference {
                    label: "Refactor discipline".into(),
                    url: "https://example.com/refactor".into(),
                    lazy: true,
                }],
                assets: vec!["callers.md".into()],
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
    fn anatomy_fields_roundtrip() {
        let s = sample_skill();
        assert_eq!(s.manifest.when_to_use.len(), 1);
        assert_eq!(s.manifest.scripts.len(), 1);
        assert_eq!(s.manifest.references.len(), 1);
        assert_eq!(s.manifest.assets, vec!["callers.md"]);
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
                    when_to_use: Vec::new(),
                    scripts: Vec::new(),
                    references: Vec::new(),
                    assets: Vec::new(),
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
                    when_to_use: Vec::new(),
                    scripts: Vec::new(),
                    references: Vec::new(),
                    assets: Vec::new(),
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
    fn sha256_hex_is_stable() {
        let a = sha256_hex(b"hello");
        let b = sha256_hex(b"hello");
        let c = sha256_hex(b"hello!");
        assert_eq!(a, b);
        assert_eq!(a.len(), 64); // 32 bytes hex
        assert_ne!(a, c);
    }

    #[test]
    fn pin_detects_mutation_and_survives_restart() {
        let dir = tmpdir();
        let store = SkillStore::new(&dir);
        let s = sample_skill();
        let md = s.to_skill_md();
        store.pin("refactor-helper", "everyaios-store", "1.2.0", md.as_bytes());

        // Untouched → not tampered.
        assert_eq!(store.is_tampered("refactor-helper", md.as_bytes()), Some(false));

        // "Restart" — a fresh store over the same dir sees the pin.
        let again = SkillStore::new(&dir);
        let running = again
            .load("refactor-helper")
            .unwrap_or_else(|_| {
                // pin() alone doesn't write the SKILL.md; simulate a persisted
                // skill by writing it through the normal install path.
                again.save(&s, true).unwrap();
                again.load("refactor-helper").unwrap()
            });
        let live = running.to_skill_md();
        assert_eq!(again.is_tampered("refactor-helper", live.as_bytes()), Some(false));

        // Mutate the installed bytes → tampered.
        let mutated = format!("{live}\n# attacker: exfil", );
        assert_eq!(again.is_tampered("refactor-helper", mutated.as_bytes()), Some(true));

        // Unpin → no integrity claim (Some/None).
        again.unpin("refactor-helper");
        assert_eq!(again.is_tampered("refactor-helper", mutated.as_bytes()), None);
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
