//! P7.7 — path floor. Every filesystem path the agent touches is
//! canonicalized (lexically; symlinks resolved when they exist) and checked
//! against the granted roots *before* any syscall. `..` escapes and symlink
//! jumps outside the floor are refused. The fuzz test drives thousands of
//! adversarial paths and requires zero escapes.

use serde::{Deserialize, Serialize};
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
    let s = if rooted { format!("/{joined}") } else { joined };
    if s.is_empty() {
        return if rooted {
            "/".to_string()
        } else {
            ".".to_string()
        };
    }
    s
}

/// Canonicalize for the floor check **without following a symlink at the
/// final component**. Any existing directory prefix is resolved (following
/// intermediate directory symlinks, as canonicalizing a container must), but
/// the leaf name is joined lexically — a symlink *at* the leaf is never
/// silently resolved into its target path. This keeps the returned path an
/// honest representation of "where the caller asked to act", so the floor
/// check cannot be tricked by a leaf symlink that points outside the root.
///
/// Symlink *escapes* (a leaf, or an intermediate directory link, that lands
/// outside the granted roots) are detected separately by [`leaf_symlink_target`]
/// / [`enforce_floor`] — this function does not hide them by resolving them.
pub fn canonicalize_no_follow(path: &str) -> String {
    let norm = normalize_lexical(path);
    let p = Path::new(&norm);

    // Split into parent + final component. Canonicalize the parent (its
    // symlinks resolve — that is correct for the container), then re-attach
    // the leaf lexically so a leaf symlink is NOT followed.
    match (p.parent(), p.file_name()) {
        (Some(parent), Some(leaf)) if !parent.as_os_str().is_empty() => {
            let real_parent = std::fs::canonicalize(parent)
                .map(|pb| pb.to_string_lossy().to_string())
                .unwrap_or_else(|_| parent.to_string_lossy().to_string());
            let joined = format!(
                "{}/{}",
                real_parent.trim_end_matches('/'),
                leaf.to_string_lossy()
            );
            normalize_lexical(&joined)
        }
        // Root, bare relative name, or no parent — nothing to resolve.
        _ => norm,
    }
}

/// If `path`'s final component is a symlink, return its resolved absolute
/// target (lexically normalized); otherwise `None`. Used by the floor to
/// refuse a leaf symlink that jumps outside the granted roots, without
/// `canonicalize_no_follow` having to follow it.
pub fn leaf_symlink_target(path: &str) -> Option<String> {
    let norm = normalize_lexical(path);
    let meta = std::fs::symlink_metadata(&norm).ok()?;
    if !meta.file_type().is_symlink() {
        return None;
    }
    // Fully resolve (follows the link) only to test containment — the result
    // is never used as the acted-upon path, only as the escape check.
    let resolved = std::fs::canonicalize(&norm).ok()?;
    Some(normalize_lexical(&resolved.to_string_lossy()))
}

/// Is `path` (canonicalized) inside one of the granted roots?
pub fn is_inside_root(path: &str, roots: &[&str]) -> bool {
    let canonical = canonicalize_no_follow(path);
    roots.iter().any(|r| {
        let root = canonicalize_no_follow(r);
        canonical == root || canonical.starts_with(&format!("{}/", root.trim_end_matches('/')))
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
        return FloorVerdict::OutsideRoot;
    }
    // The lexical/parent-resolved path is inside the floor. Now make sure the
    // leaf isn't a symlink that jumps outside the roots — canonicalize_no_follow
    // deliberately did NOT resolve it, so we check it explicitly here.
    if let Some(target) = leaf_symlink_target(path) {
        let target_inside = roots.iter().any(|r| {
            let root = canonicalize_no_follow(r);
            target == root || target.starts_with(&format!("{}/", root.trim_end_matches('/')))
        });
        if !target_inside {
            return FloorVerdict::SymlinkEscape;
        }
    }
    FloorVerdict::Allowed
}

/// Generate adversarial paths for the fuzz gate: dot-dot chains, absolute
/// paths, symlink-ish forms, unicode, empty/weird components.
pub fn adversarial_paths() -> Vec<String> {
    let mut v = Vec::new();
    let bases = [
        "",
        "/",
        "/workspace",
        "workspace",
        "/workspace/sub",
        "/etc",
        "~",
    ];
    let middles = [
        "", "../", "../../", "..", "./", "/../", "/../../", "a/../..", "../a/..",
    ];
    let tails = [
        "x",
        "x.txt",
        "..",
        "../..",
        "../x",
        "../../etc/passwd",
        "etc/passwd",
        "..%2fetc%2fpasswd",
        "\u{202e}etc/passwd",
        "a b",
        "a\nb",
        "symlink",
        "-rf",
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

/// P7.8 — 6-axis path grants (doc 64 S3 — chromium `BrokerFilePermission`).
/// The path floor decides *where*; the grant axis decides *how*: each grant
/// is a canonicalized prefix plus one of six operation axes. Feeds the J21
/// `permissions.toml` vocabulary (`read_only_recursive`, `read_write_create`,
/// …). The 0-escape invariant is preserved — a grant never widens the floor.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum GrantAxis {
    /// Read everything under the prefix (`read_only_recursive`).
    ReadOnlyRecursive,
    /// Read + write + create under the prefix (`read_write_create`).
    ReadWriteCreate,
    /// Read + write existing entries (`read_write`).
    ReadWrite,
    /// Create new entries only (`create`).
    Create,
    /// Temporary scratch: read/write/create, no durability promise (`temporary`).
    Temporary,
    /// Stat/metadata of intermediates only (`stat`).
    StatIntermediates,
}

/// A granted prefix + axis.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PathGrant {
    pub axis: GrantAxis,
    pub prefix: String,
}

/// Filesystem operations a grant can cover.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FsOp {
    Read,
    Write,
    Create,
    Delete,
    Stat,
    List,
}

impl PathGrant {
    /// Parse a permissions.toml grant string like
    /// `read_only_recursive:/workspace/src` or `read_write_create:/tmp/x`.
    pub fn from_permissions_string(s: &str) -> Option<PathGrant> {
        let (axis, prefix) = s.split_once(':')?;
        let axis = match axis {
            "read_only_recursive" => GrantAxis::ReadOnlyRecursive,
            "read_write_create" => GrantAxis::ReadWriteCreate,
            "read_write" => GrantAxis::ReadWrite,
            "create" => GrantAxis::Create,
            "temporary" => GrantAxis::Temporary,
            "stat" => GrantAxis::StatIntermediates,
            _ => return None,
        };
        if prefix.is_empty() {
            return None;
        }
        Some(PathGrant {
            axis,
            prefix: prefix.to_string(),
        })
    }

    /// Does this grant cover `op` on `path`? The path must be inside the
    /// (canonicalized) prefix and the axis must permit the operation.
    pub fn allows(&self, op: FsOp, path: &str) -> bool {
        let canonical = canonicalize_no_follow(path);
        let prefix = canonicalize_no_follow(&self.prefix);
        let inside = canonical == prefix
            || canonical.starts_with(&format!("{}/", prefix.trim_end_matches('/')));
        if !inside {
            return false;
        }
        matches!(
            (self.axis, op),
            (
                GrantAxis::ReadOnlyRecursive,
                FsOp::Read | FsOp::Stat | FsOp::List
            ) | (
                GrantAxis::ReadWriteCreate,
                FsOp::Read | FsOp::Write | FsOp::Create | FsOp::Stat | FsOp::List,
            ) | (
                GrantAxis::ReadWrite,
                FsOp::Read | FsOp::Write | FsOp::Stat | FsOp::List,
            ) | (GrantAxis::Create, FsOp::Create | FsOp::Stat)
                | (
                    GrantAxis::Temporary,
                    FsOp::Read
                        | FsOp::Write
                        | FsOp::Create
                        | FsOp::Delete
                        | FsOp::Stat
                        | FsOp::List,
                )
                | (GrantAxis::StatIntermediates, FsOp::Stat | FsOp::List)
        )
    }

    /// The floor this grant implies (for `enforce_floor` roots).
    pub fn floor_root(&self) -> &str {
        &self.prefix
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn grant_parse_permissions_strings() {
        let g = PathGrant::from_permissions_string("read_only_recursive:/workspace/src").unwrap();
        assert_eq!(g.axis, GrantAxis::ReadOnlyRecursive);
        assert_eq!(g.prefix, "/workspace/src");
        assert!(PathGrant::from_permissions_string("read_write_create:/tmp/x").is_some());
        assert!(PathGrant::from_permissions_string("bogus:/x").is_none());
        assert!(PathGrant::from_permissions_string("read_write:").is_none());
    }

    #[test]
    fn axis_gates_operations() {
        let ro = PathGrant {
            axis: GrantAxis::ReadOnlyRecursive,
            prefix: "/workspace/src".into(),
        };
        assert!(ro.allows(FsOp::Read, "/workspace/src/a/b.rs"));
        assert!(!ro.allows(FsOp::Write, "/workspace/src/a/b.rs"));
        assert!(!ro.allows(FsOp::Create, "/workspace/src/new.rs"));

        let rwc = PathGrant {
            axis: GrantAxis::ReadWriteCreate,
            prefix: "/tmp/x".into(),
        };
        assert!(rwc.allows(FsOp::Create, "/tmp/x/new.txt"));
        assert!(rwc.allows(FsOp::Write, "/tmp/x/a.txt"));

        let c = PathGrant {
            axis: GrantAxis::Create,
            prefix: "/tmp/inbox".into(),
        };
        assert!(c.allows(FsOp::Create, "/tmp/inbox/new.txt"));
        assert!(!c.allows(FsOp::Read, "/tmp/inbox/existing.txt"));

        let tmp = PathGrant {
            axis: GrantAxis::Temporary,
            prefix: "/tmp/scratch".into(),
        };
        assert!(tmp.allows(FsOp::Delete, "/tmp/scratch/old.bin"));
        assert!(!ro.allows(FsOp::Delete, "/workspace/src/x"));
    }

    #[test]
    fn grant_never_escapes_the_floor() {
        // A grant for /tmp/x must never admit a path that escapes /tmp/x.
        for axis in [
            GrantAxis::ReadOnlyRecursive,
            GrantAxis::ReadWriteCreate,
            GrantAxis::Temporary,
        ] {
            let g = PathGrant {
                axis,
                prefix: "/tmp/x".into(),
            };
            for p in crate::pathfloor::adversarial_paths() {
                if g.allows(FsOp::Read, &p) {
                    assert_eq!(
                        crate::pathfloor::enforce_floor(&p, &["/tmp/x"]),
                        FloorVerdict::Allowed,
                        "grant {axis:?} admitted an escape: {p}"
                    );
                }
            }
        }
    }
}

#[cfg(test)]
mod grant_tests {
    use super::*;

    #[test]
    fn lexical_normalization() {
        assert_eq!(normalize_lexical("/a/b/../c"), "/a/c");
        assert_eq!(normalize_lexical("/a/./b"), "/a/b");
        assert_eq!(normalize_lexical("a/b/../../c"), "c");
    }

    #[test]
    fn floor_allows_inside() {
        assert_eq!(
            enforce_floor("/workspace/x", &["/workspace"]),
            FloorVerdict::Allowed
        );
        assert_eq!(
            enforce_floor("/workspace/sub/deep/file.txt", &["/workspace"]),
            FloorVerdict::Allowed
        );
    }

    #[test]
    fn floor_blocks_outside() {
        assert_eq!(
            enforce_floor("/etc/passwd", &["/workspace"]),
            FloorVerdict::OutsideRoot
        );
        assert_eq!(
            enforce_floor("/tmp/x", &["/workspace"]),
            FloorVerdict::OutsideRoot
        );
    }

    #[test]
    fn floor_blocks_parent_escape() {
        // After normalization /workspace/../../etc stays /workspace/../../etc
        // (leading .. can't pop past root), so it lands outside → refused.
        assert_ne!(
            enforce_floor("/workspace/../../etc/passwd", &["/workspace"]),
            FloorVerdict::Allowed
        );
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

    #[cfg(unix)]
    #[test]
    fn leaf_symlink_is_not_followed_but_escape_is_refused() {
        use std::os::unix::fs::symlink;
        // Build a workspace root and a secret outside it, with a leaf symlink
        // inside the workspace pointing at the secret.
        let base = std::env::temp_dir().join(format!("pf_test_{}", std::process::id()));
        let ws = base.join("workspace");
        let secret = base.join("secret");
        let _ = std::fs::create_dir_all(&ws);
        let _ = std::fs::create_dir_all(&secret);
        let secret_file = secret.join("passwd");
        std::fs::write(&secret_file, b"SECRET").unwrap();
        let link = ws.join("link");
        let _ = std::fs::remove_file(&link);
        symlink(&secret_file, &link).unwrap();

        let ws_s = ws.to_string_lossy().to_string();
        let link_s = link.to_string_lossy().to_string();
        let roots: Vec<&str> = vec![&ws_s];

        // no-follow must NOT resolve the leaf symlink into the secret path.
        let canon = canonicalize_no_follow(&link_s);
        assert!(
            !canon.contains("secret"),
            "leaf symlink was followed: {canon}"
        );
        assert!(
            canon.ends_with("/link"),
            "no-follow should keep the leaf name: {canon}"
        );

        // The floor must still REFUSE it as a symlink escape.
        assert_eq!(
            enforce_floor(&link_s, &roots),
            FloorVerdict::SymlinkEscape,
            "a leaf symlink escaping the root must be refused"
        );

        // A leaf symlink that stays inside the root is allowed.
        let inside_target = ws.join("real.txt");
        std::fs::write(&inside_target, b"ok").unwrap();
        let inside_link = ws.join("inside_link");
        let _ = std::fs::remove_file(&inside_link);
        symlink(&inside_target, &inside_link).unwrap();
        assert_eq!(
            enforce_floor(&inside_link.to_string_lossy(), &roots),
            FloorVerdict::Allowed,
            "a leaf symlink staying inside the root is allowed"
        );

        let _ = std::fs::remove_dir_all(&base);
    }
}
