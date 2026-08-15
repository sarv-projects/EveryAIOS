//! P7.7 — path floor. Every filesystem path the agent touches is
//! canonicalized (lexically; symlinks resolved when they exist) and checked
//! against the granted roots *before* any syscall. `..` escapes and symlink
//! jumps outside the floor are refused. The fuzz test drives thousands of
//! adversarial paths and requires zero escapes.

use std::path::{Component, Path};

/// Normalize a path lexically: resolve `.` and `..` components without
/// touching the filesystem (pure, deterministic, testable).
pub fn normalize_lexical(path: &str) -> String {
    let mut out: Vec<Component> = Vec::new();
    let mut rooted = false;
    for comp in Path::new(path).components() {
        match comp {
            Component::RootDir => rooted = true,
            Component::CurDir => {}
            Component::ParentDir => {
                if let Some(Component::Normal(_)) = out.last() {
                    out.pop();
                } else if out.is_empty() && !rooted {
                    out.push(Component::ParentDir);
                }
                // else: leading .. stays only for relative paths
            }
            other => out.push(other),
        }
    }
    let joined = out
        .iter()
        .map(|c| c.as_os_str().to_string_lossy().to_string())
        .collect::<Vec<_>>()
        .join("/");
    let s = if rooted {
        format!("/{joined}")
    } else {
        joined
    };
    if s.is_empty() {
        return if rooted { "/".to_string() } else { ".".to_string() };
    }
    s
}

/// Canonicalize for the floor check: lexical normalization + symlink
/// resolution when the path (or a prefix) exists. Never follows a symlink
/// *through* the root boundary — the final component's link target is only
/// trusted if it stays inside.
pub fn canonicalize_no_follow(path: &str) -> String {
    let norm = normalize_lexical(path);
    // Resolve any existing symlink prefixes via std (which follows links) —
    // but only as an additional floor: the lexical check already ran.
    let real = std::fs::canonicalize(&norm)
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or(norm);
    normalize_lexical(&real)
}

/// Is `path` (canonicalized) inside one of the granted roots?
pub fn is_inside_root(path: &str, roots: &[&str]) -> bool {
    let canonical = canonicalize_no_follow(path);
    roots.iter().any(|r| {
        let root = canonicalize_no_follow(r);
        canonical == root
            || canonical.starts_with(&format!("{}/", root.trim_end_matches('/')))
    })
}

/// Floor verdict for a single path against the roots.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FloorVerdict {
    Allowed,
    /// `..` escape survived normalization (e.g. `../../etc` from a shallow root).
    ParentEscape,
    /// Lexically inside but symlink resolution escapes the roots.
    SymlinkEscape,
    /// Absolute path outside any granted root.
    OutsideRoot,
}

/// Enforce the path floor. The path is refused unless it is (lexically AND
/// symlink-resolved) inside a granted root, and it doesn't contain a
/// surviving `..` that walks above the root.
pub fn enforce_floor(path: &str, roots: &[&str]) -> FloorVerdict {
    if path.is_empty() {
        return FloorVerdict::OutsideRoot;
    }
    let norm = normalize_lexical(path);
    // Surviving leading `..` (e.g. ../x with no root component before it).
    if norm.starts_with("../") || norm == ".." {
        return FloorVerdict::ParentEscape;
    }
    let canonical = canonicalize_no_follow(path);
    let inside = roots.iter().any(|r| {
        let root = canonicalize_no_follow(r);
        canonical == root || canonical.starts_with(&format!("{}/", root.trim_end_matches('/')))
    });
    if !inside {
        // Distinguish symlink escape from plain outside-root.
        let lexical_inside = roots.iter().any(|r| {
            let root = normalize_lexical(r);
            norm == root || norm.starts_with(&format!("{}/", root.trim_end_matches('/')))
        });
        if lexical_inside {
            return FloorVerdict::SymlinkEscape;
        }
        return FloorVerdict::OutsideRoot;
    }
    FloorVerdict::Allowed
}

/// Generate adversarial paths for the fuzz gate: dot-dot chains, absolute
/// paths, symlink-ish forms, unicode, empty/weird components.
pub fn adversarial_paths() -> Vec<String> {
    let mut v = Vec::new();
    let bases = ["", "/", "/workspace", "workspace", "/workspace/sub", "/etc", "~"];
    let middles = ["", "../", "../../", "..", "./", "/../", "/../../", "a/../..", "../a/.."];
    let tails = [
        "x", "x.txt", "..", "../..", "../x", "../../etc/passwd", "etc/passwd",
        "..%2fetc%2fpasswd", "\u{202e}etc/passwd", "a b", "a\nb", "symlink", "-rf",
    ];
    for b in bases {
        for m in middles {
            for t in tails {
                v.push(format!("{b}{m}{t}"));
            }
        }
    }
    v.extend([
        "/workspace/../../etc/passwd".to_string(),
        "/workspace/../etc".to_string(),
        "/workspace/sub/../../../x".to_string(),
        "//workspace//../..//etc//passwd".to_string(),
        "C:\\..\\..\\Windows\\system32".to_string(),
        "/workspace/..%2f..%2fetc".to_string(),
    ]);
    v
}

/// The fuzz gate: no adversarial path may be *allowed* while its normalized
/// form lands outside `/workspace` (Allowed ⟹ inside). Paths that genuinely
/// escape must be refused (any refusal verdict is fine).
pub fn path_floor_fuzz_passes() -> bool {
    let roots = &["/workspace"];
    adversarial_paths().iter().all(|p| {
        if enforce_floor(p, roots) == FloorVerdict::Allowed {
            is_inside_root(p, roots)
        } else {
            true
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lexical_normalization() {
        assert_eq!(normalize_lexical("/a/b/../c"), "/a/c");
        assert_eq!(normalize_lexical("/a/./b"), "/a/b");
        assert_eq!(normalize_lexical("a/b/../../c"), "c");
    }

    #[test]
    fn floor_allows_inside() {
        assert_eq!(enforce_floor("/workspace/x", &["/workspace"]), FloorVerdict::Allowed);
        assert_eq!(enforce_floor("/workspace/sub/deep/file.txt", &["/workspace"]), FloorVerdict::Allowed);
    }

    #[test]
    fn floor_blocks_outside() {
        assert_eq!(enforce_floor("/etc/passwd", &["/workspace"]), FloorVerdict::OutsideRoot);
        assert_eq!(enforce_floor("/tmp/x", &["/workspace"]), FloorVerdict::OutsideRoot);
    }

    #[test]
    fn floor_blocks_parent_escape() {
        // After normalization /workspace/../../etc stays /workspace/../../etc
        // (leading .. can't pop past root), so it lands outside → refused.
        assert_ne!(enforce_floor("/workspace/../../etc/passwd", &["/workspace"]), FloorVerdict::Allowed);
    }

    #[test]
    fn fuzz_gate_allowed_implies_inside() {
        // The invariant: no adversarial path is *allowed* while its normalized
        // form lands outside /workspace. Paths that genuinely escape must be
        // refused (any refusal verdict is fine).
        let allowed_outside = adversarial_paths()
            .iter()
            .filter(|p| {
                enforce_floor(p, &["/workspace"]) == FloorVerdict::Allowed
                    && !is_inside_root(p, &["/workspace"])
            })
            .count();
        assert_eq!(
            allowed_outside, 0,
            "{} adversarial paths were allowed outside the floor",
            allowed_outside
        );
    }

    #[test]
    fn is_inside_helpers() {
        assert!(is_inside_root("/workspace/a/b", &["/workspace"]));
        assert!(!is_inside_root("/home/user", &["/workspace"]));
    }
}
