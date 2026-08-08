//! everyaios-guard — Guard-1: deterministic regex scanning of every generated
//! shell string, filesystem path and URL before execution (ARCH/06 §6.2).
//!
//! P0.1 scope: a compiled `RegexSet` over a starter blocklist, plus the
//! scan API. P7.4 expands the corpus from the cyber red-team docs (doc 26)
//! and wires pre-exec scanning into the execution pipeline. Guard-2
//! (diff-card approval, human-in-the-loop) is a separate gate (P7.5).

use regex::RegexSet;

/// Starter destructive-pattern blocklist. **P0.1 placeholder** — the full
/// corpus (rm -rf variants, mkfs, dd, fork bombs, key exfil, `.git`
/// destruction, home wipes, etc.) is compiled in P7.4 from doc 26.
pub const DEFAULT_BLOCKLIST: &[&str] = &[
    r"(?i)\brm\s+(-[a-z]*[rR][a-z]*\s*)+/?\s*(/|\*|~|\.)",
    r"(?i)\bmkfs(?:\s|\.)",
    r"(?i)\bdd\s+if=",
    r"(?i)(?:^|[^[:alnum:]_]):\(\)\s*\{\s*:\|:&\s*\};:",
    r"(?i)\bdrop\s+database\b",
    r"(?i)\bgit\s+clean\s+-[a-z]*[fF]",
    r"(?i)\bchmod\s+[0-7]{4}\b",
];

/// A compiled Guard-1 blocklist.
#[derive(Debug, Clone)]
pub struct Guard {
    set: RegexSet,
}

impl Guard {
    /// Compile the default blocklist.
    pub fn new() -> Result<Self, GuardError> {
        Self::from_patterns(DEFAULT_BLOCKLIST)
    }

    /// Compile an arbitrary pattern list (used for tests and the P7.4 corpus).
    pub fn from_patterns(patterns: &[&str]) -> Result<Self, GuardError> {
        let set = RegexSet::new(patterns).map_err(GuardError::Compile)?;
        Ok(Self { set })
    }

    /// Number of compiled patterns.
    pub fn pattern_count(&self) -> usize {
        self.set.len()
    }

    /// Return the indices of every blocklist pattern that matched `text`.
    /// Empty = clean. Callers must **block** execution on any match.
    pub fn scan(&self, text: &str) -> Vec<usize> {
        self.set.matches(text).iter().collect()
    }

    /// Convenience: is `text` blocked by any pattern?
    pub fn is_blocked(&self, text: &str) -> bool {
        !self.scan(text).is_empty()
    }
}

impl Default for Guard {
    fn default() -> Self {
        Guard::new().expect("default blocklist must compile")
    }
}

#[derive(Debug, thiserror::Error)]
pub enum GuardError {
    #[error("regex compile error: {0}")]
    Compile(#[from] regex::Error),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_blocklist_compiles() {
        let guard = Guard::new().expect("compiles");
        assert!(guard.pattern_count() > 0);
    }

    #[test]
    fn blocks_rm_rf_home() {
        let guard = Guard::new().unwrap();
        assert!(guard.is_blocked("rm -rf /"));
        assert!(guard.is_blocked("rm -rf ~"));
        assert!(guard.is_blocked("rm -rf *"));
    }

    #[test]
    fn allows_benign_commands() {
        let guard = Guard::new().unwrap();
        assert!(!guard.is_blocked("ls -la"));
        assert!(!guard.is_blocked("cat notes.md"));
    }

    #[test]
    fn blocks_dd_and_fork_bomb() {
        let guard = Guard::new().unwrap();
        assert!(guard.is_blocked("dd if=/dev/zero of=/dev/sda"));
        assert!(guard.is_blocked(":(){ :|:& };:"));
    }

    #[test]
    fn scan_reports_pattern_indices() {
        let guard = Guard::from_patterns(&["alpha", "beta"]).unwrap();
        assert_eq!(guard.scan("no match here"), Vec::<usize>::new());
        assert_eq!(guard.scan("alpha beta"), vec![0, 1]);
        assert_eq!(guard.scan("just beta"), vec![1]);
    }
}
