//! Plan cache (P6.1 — doc 62): don't re-infer a plan you already know. Each
//! stored plan is keyed by a normalized **task signature**; a new goal is
//! matched by cosine similarity over word unigram+bigram shingles (default
//! threshold `0.85`). Version-based invalidation: a rewrite bumps the plan's
//! version, and lookups below `min_version` are ignored. Persisted to
//! `~/.everyaios/plans.db` (JSON — no SQLite dependency).

use crate::blueprint::Blueprint;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use thiserror::Error;

/// One cached plan.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PlanEntry {
    /// Normalized goal text (the signature source).
    pub signature: String,
    pub blueprint: Blueprint,
    pub version: u32,
}

#[derive(Debug, Error)]
pub enum PlanCacheError {
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("json error: {0}")]
    Json(#[from] serde_json::Error),
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct Persisted {
    version: u32,
    entries: Vec<PlanEntry>,
}

/// An in-memory, file-backable plan cache.
#[derive(Debug, Default)]
pub struct PlanCache {
    entries: Vec<PlanEntry>,
    version: u32,
}

/// Default similarity threshold for a cache hit (doc 62: ~0.85).
pub const DEFAULT_SIMILARITY: f64 = 0.85;

impl PlanCache {
    pub fn new(version: u32) -> Self {
        Self {
            entries: Vec::new(),
            version,
        }
    }

    pub fn version(&self) -> u32 {
        self.version
    }

    pub fn len(&self) -> usize {
        self.entries.len()
    }

    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    /// Store (or replace) a plan under its signature.
    pub fn store(&mut self, blueprint: Blueprint, version: u32) {
        let signature = signature(&blueprint.goal);
        self.entries.retain(|e| e.signature != signature);
        self.entries.push(PlanEntry {
            signature,
            blueprint,
            version,
        });
    }

    /// Best-matching cached plan at/above `min_similarity` and `min_version`.
    pub fn lookup(
        &self,
        goal: &str,
        min_similarity: f64,
        min_version: u32,
    ) -> Option<&Blueprint> {
        let q = shingles(&normalize(goal));
        let mut best: Option<(f64, &PlanEntry)> = None;
        for e in &self.entries {
            if e.version < min_version {
                continue;
            }
            let s = shingles(&normalize(&e.signature));
            let sim = cosine(&q, &s);
            if best.map(|(b, _)| sim > b).unwrap_or(true) {
                best = Some((sim, e));
            }
        }
        match best {
            Some((sim, e)) if sim >= min_similarity => Some(&e.blueprint),
            _ => None,
        }
    }

    /// Drop a plan by its signature.
    pub fn invalidate(&mut self, signature: &str) {
        self.entries.retain(|e| e.signature != signature);
    }

    /// Drop every plan older than `min_version` (version-based invalidation).
    pub fn invalidate_below(&mut self, min_version: u32) {
        self.entries.retain(|e| e.version >= min_version);
    }

    /// Bump the cache's epoch version (invalidates lookups below it).
    pub fn bump_version(&mut self) -> u32 {
        self.version += 1;
        self.version
    }

    pub fn save(&self, path: &Path) -> Result<(), PlanCacheError> {
        let persisted = Persisted {
            version: self.version,
            entries: self.entries.clone(),
        };
        let bytes = serde_json::to_vec_pretty(&persisted)?;
        let tmp = path.with_extension("tmp");
        std::fs::write(&tmp, bytes)?;
        std::fs::rename(&tmp, path)?;
        Ok(())
    }

    pub fn load(path: &Path) -> Result<Self, PlanCacheError> {
        let bytes = std::fs::read(path)?;
        let persisted: Persisted = serde_json::from_slice(&bytes)?;
        Ok(Self {
            entries: persisted.entries,
            version: persisted.version,
        })
    }

    /// The default on-disk location (`~/.everyaios/plans.db`), honoring
    /// `EVERYAIOS_HOME` when set.
    pub fn default_path() -> PathBuf {
        if let Ok(home) = std::env::var("EVERYAIOS_HOME") {
            return PathBuf::from(home).join("plans.db");
        }
        let base = std::env::var("HOME")
            .or_else(|_| std::env::var("USERPROFILE"))
            .map(PathBuf::from)
            .unwrap_or_default();
        base.join(".everyaios").join("plans.db")
    }
}

/// Normalize a goal into tokens (lowercase, alphanumeric-only, stopwords
/// dropped so "and/the" noise doesn't sink the similarity).
fn normalize(s: &str) -> Vec<String> {
    const STOPWORDS: &[&str] = &[
        "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "in", "is", "it",
        "of", "on", "or", "that", "the", "this", "to", "was", "with",
    ];
    s.to_lowercase()
        .split(|c: char| !c.is_alphanumeric())
        .filter(|w| !w.is_empty() && !STOPWORDS.contains(w))
        .map(str::to_string)
        .collect()
}

/// The signature: normalized tokens joined (stable, order-preserving).
pub fn signature(goal: &str) -> String {
    normalize(goal).join(" ")
}

/// Word unigram + bigram shingle counts.
fn shingles(tokens: &[String]) -> HashMap<String, u32> {
    let mut m = HashMap::new();
    for t in tokens {
        *m.entry(t.clone()).or_insert(0) += 1;
    }
    for pair in tokens.windows(2) {
        let key = format!("{}|{}", pair[0], pair[1]);
        *m.entry(key).or_insert(0) += 1;
    }
    m
}

/// Cosine similarity over shingle count vectors (0..=1).
fn cosine(a: &HashMap<String, u32>, b: &HashMap<String, u32>) -> f64 {
    let mut keys: HashSet<&String> = a.keys().collect();
    keys.extend(b.keys());
    let (mut dot, mut na, mut nb) = (0.0f64, 0.0f64, 0.0f64);
    for k in keys {
        let va = *a.get(k).unwrap_or(&0) as f64;
        let vb = *b.get(k).unwrap_or(&0) as f64;
        dot += va * vb;
        na += va * va;
        nb += vb * vb;
    }
    let denom = (na * nb).sqrt();
    if denom == 0.0 {
        0.0
    } else {
        dot / denom
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::blueprint::{BlueprintTask, VerifyBlock};
    use crate::spec::TaskSpec;

    fn bp(goal: &str) -> Blueprint {
        let mut b = Blueprint::new("bp", goal);
        b.push(BlueprintTask::new(
            TaskSpec::new("a", "do it"),
            VerifyBlock::new(vec![]),
        ));
        b
    }

    #[test]
    fn near_identical_goal_hits_cache() {
        let mut cache = PlanCache::new(1);
        cache.store(bp("audit q3 expenses and update the budget sheet"), 1);
        let hit = cache.lookup(
            "audit Q3 expenses & update budget sheet!",
            DEFAULT_SIMILARITY,
            1,
        );
        assert!(hit.is_some());
    }

    #[test]
    fn unrelated_goal_misses_cache() {
        let mut cache = PlanCache::new(1);
        cache.store(bp("audit q3 expenses"), 1);
        assert!(
            cache
                .lookup("rename all photos by date", DEFAULT_SIMILARITY, 1)
                .is_none()
        );
    }

    #[test]
    fn version_invalidation_blocks_stale_plans() {
        let mut cache = PlanCache::new(1);
        cache.store(bp("audit q3 expenses"), 1);
        assert!(cache.lookup("audit q3 expenses", DEFAULT_SIMILARITY, 2).is_none());
        assert!(cache.lookup("audit q3 expenses", DEFAULT_SIMILARITY, 1).is_some());
    }

    #[test]
    fn invalidate_by_signature_and_version() {
        let mut cache = PlanCache::new(0);
        cache.store(bp("audit q3 expenses"), 2);
        cache.store(bp("rename photos"), 4);
        cache.invalidate(&signature("audit q3 expenses"));
        assert_eq!(cache.len(), 1);
        cache.invalidate_below(5);
        assert!(cache.is_empty());
    }

    #[test]
    fn save_and_load_roundtrips() {
        let dir = std::env::temp_dir().join("bp-plancache");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("plans.db");
        let mut cache = PlanCache::new(7);
        cache.store(bp("audit q3 expenses"), 3);
        cache.save(&path).unwrap();

        let back = PlanCache::load(&path).unwrap();
        assert_eq!(back.version(), 7);
        assert!(back.lookup("audit q3 expenses", DEFAULT_SIMILARITY, 1).is_some());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn default_path_honors_home_override() {
        std::env::set_var("EVERYAIOS_HOME", "/tmp/everyaios-test-home");
        assert_eq!(
            PlanCache::default_path(),
            PathBuf::from("/tmp/everyaios-test-home/plans.db")
        );
        std::env::remove_var("EVERYAIOS_HOME");
    }
}
