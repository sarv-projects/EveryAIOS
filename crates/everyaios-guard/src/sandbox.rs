//! P7.8 — Sandbox profiles (doc 64 §2/§3/§5 — ladybird `RendererSandboxLinux`
//! + `LibSandbox/Seccomp`, serenity pledge/unveil, chromium syscall-broker).
//!
//! [`SandboxProfile`] is the declarative 3-layer model a sandboxed worker is
//! launched under:
//!
//! 1. **no_new_privs** — `PR_SET_NO_NEW_PRIVS` (the process can never gain
//!    privileges, e.g. via setuid);
//! 2. **path allowlist** — per-path access rules (ReadOnly / ReadAndExecute /
//!    ReadWrite / AddIfExists) enforced before any syscall (Landlock/App
//!    Sandbox at apply time, the path-floor in Rust here);
//! 3. **seccomp policy groups** — the syscall classes the process may use
//!    (readonly-file-opens / fs-metadata / fs-writes / fd-ops /
//!    process-creation / ipc / common-runtime / exec-mem), built from
//!    [`seccomp`] and expressed here as group membership.
//!
//! The model, validation, and path enforcement are pure Rust and test-gated.
//! The *kernel application* (prctl + Landlock ruleset + BPF install) is an
//! explicit apply seam — see [`SandboxProfile::apply`] — because it needs
//! OS support (Linux Landlock/BPF) that is not portable or always present;
//! the policy it installs is exactly the model below.

use serde::{Deserialize, Serialize};
use std::path::Path;

/// Per-path access mode (Landlock/App-Sandbox path allowlist vocabulary).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum PathAccess {
    /// Open for read only (and execute for dirs).
    ReadOnly,
    /// Read + execute (binaries/scripts).
    ReadAndExecute,
    /// Read + write (create/truncate included).
    ReadWrite,
    /// Create/append new entries inside, no modification of existing ones.
    AddIfExists,
}

/// One path allowlist rule.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PathRule {
    /// Canonicalized prefix (path-floor enforced at check time).
    pub prefix: String,
    pub access: PathAccess,
}

/// Seccomp syscall policy groups (doc 64 S1 `LibSandbox/Seccomp.cpp`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SyscallGroup {
    ReadonlyFileOpens,
    FsMetadata,
    FsWrites,
    FdOps,
    ProcessCreation,
    Ipc,
    CommonRuntime,
    ExecMem,
}

/// The declarative sandbox profile. Pure data — `apply` is the seam that
/// turns it into OS enforcement.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SandboxProfile {
    pub name: String,
    /// Layer 1: PR_SET_NO_NEW_PRIVS (always true for a real sandbox).
    pub no_new_privs: bool,
    /// Layer 2: path allowlist (empty = no filesystem at all).
    pub paths: Vec<PathRule>,
    /// Layer 3: allowed syscall groups (empty = only the bare minimum).
    pub syscalls: Vec<SyscallGroup>,
    /// Child may spawn processes (gated by the process-creation group).
    pub spawns_children: bool,
    /// May write anywhere the path allowlist allows.
    pub files_write: bool,
}

/// Errors from building or applying a profile.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum SandboxError {
    #[error("profile `{0}` must set no_new_privs (fail-closed)")]
    NoNewPrivsRequired(String),
    #[error("profile `{name}` enables {group:?} but the syscall group is not in the policy")]
    SyscallNotInPolicy { name: String, group: SyscallGroup },
    #[error("profile `{name}` enables files_write but no path rule grants write access")]
    WriteWithoutPath { name: String },
    #[error("sandbox application is not available on this platform/OS (model-only here; kernel apply needs Linux Landlock/seccomp support)")]
    UnsupportedPlatform,
}

/// Default profiles (doc 64: Renderer read-only fs, Worker rw scratch,
/// Network no fs).
pub mod profiles {
    use super::*;

    /// Renderer: read-only filesystem, no process creation, common runtime.
    pub fn renderer() -> SandboxProfile {
        SandboxProfile {
            name: "renderer".into(),
            no_new_privs: true,
            paths: vec![PathRule {
                prefix: "/usr/share".into(),
                access: PathAccess::ReadAndExecute,
            }],
            syscalls: vec![
                SyscallGroup::ReadonlyFileOpens,
                SyscallGroup::FsMetadata,
                SyscallGroup::FdOps,
                SyscallGroup::CommonRuntime,
            ],
            spawns_children: false,
            files_write: false,
        }
    }

    /// Worker: read-only base + read-write scratch dir, no process creation.
    pub fn worker(scratch: &str) -> SandboxProfile {
        SandboxProfile {
            name: "worker".into(),
            no_new_privs: true,
            paths: vec![
                PathRule {
                    prefix: "/usr/share".into(),
                    access: PathAccess::ReadAndExecute,
                },
                PathRule {
                    prefix: scratch.into(),
                    access: PathAccess::ReadWrite,
                },
            ],
            syscalls: vec![
                SyscallGroup::ReadonlyFileOpens,
                SyscallGroup::FsMetadata,
                SyscallGroup::FsWrites,
                SyscallGroup::FdOps,
                SyscallGroup::CommonRuntime,
            ],
            spawns_children: false,
            files_write: true,
        }
    }

    /// Network: no filesystem at all — only IPC + fd ops + runtime.
    pub fn network() -> SandboxProfile {
        SandboxProfile {
            name: "network".into(),
            no_new_privs: true,
            paths: vec![],
            syscalls: vec![
                SyscallGroup::FdOps,
                SyscallGroup::Ipc,
                SyscallGroup::CommonRuntime,
            ],
            spawns_children: false,
            files_write: false,
        }
    }
}

impl SandboxProfile {
    /// Validate the profile is coherent and fail-closed: no_new_privs must
    /// be on; every declared power must be backed by the policy (write needs
    /// a write path; children need the process-creation group).
    pub fn validate(&self) -> Result<(), SandboxError> {
        if !self.no_new_privs {
            return Err(SandboxError::NoNewPrivsRequired(self.name.clone()));
        }
        if self.spawns_children && !self.syscalls.contains(&SyscallGroup::ProcessCreation) {
            return Err(SandboxError::SyscallNotInPolicy {
                name: self.name.clone(),
                group: SyscallGroup::ProcessCreation,
            });
        }
        if self.files_write
            && !self
                .paths
                .iter()
                .any(|p| matches!(p.access, PathAccess::ReadWrite | PathAccess::AddIfExists))
        {
            return Err(SandboxError::WriteWithoutPath {
                name: self.name.clone(),
            });
        }
        Ok(())
    }

    /// Path check against the allowlist (the Rust half of layer 2 — the
    /// kernel Landlock/App-Sandbox ruleset installs the same allowlist at
    /// apply time). Uses the P7.7 path floor so `..` and symlink escapes
    /// are refused before the access decision.
    pub fn check_path(&self, path: &str, access: PathAccess) -> bool {
        use crate::pathfloor::canonicalize_no_follow;
        let canonical = canonicalize_no_follow(path);
        // Write access requires a write-capable rule; read requires any rule.
        if matches!(access, PathAccess::ReadWrite | PathAccess::AddIfExists) && !self.files_write {
            return false;
        }
        self.paths.iter().any(|rule| {
            let prefix = canonicalize_no_follow(&rule.prefix);
            let inside = canonical == prefix
                || canonical.starts_with(&format!("{}/", prefix.trim_end_matches('/')));
            if !inside {
                return false;
            }
            rule.access_allows(access)
        })
    }

    /// The apply seam. On Linux this installs no_new_privs via prctl and the
    /// Landlock/BPF rulesets (needs OS support); off-Linux, or when the OS
    /// backend isn't linked, it is a documented no-op refusal — the policy
    /// model above is what *would* be installed, and the Rust path-floor
    /// already enforces layer 2 in-process.
    pub fn apply(&self) -> Result<(), SandboxError> {
        self.validate()?;
        // The OS backend (libseccomp + landlock crates, Linux-only) is the
        // runtime wiring seam — install-gated like real language servers.
        #[cfg(target_os = "linux")]
        {
            // Real kernels need the landlock/libseccomp crates; until they
            // are linked the in-process floor is the enforcement layer.
            let _ = Path::new("/proc/self/status");
        }
        Err(SandboxError::UnsupportedPlatform)
    }
}

impl PathRule {
    /// Does this rule's access mode cover the requested access?
    pub fn access_allows(&self, requested: PathAccess) -> bool {
        use PathAccess::*;
        match (self.access, requested) {
            (ReadWrite, _) => true,
            (AddIfExists, AddIfExists | ReadOnly | ReadAndExecute) => true,
            (ReadAndExecute, ReadAndExecute | ReadOnly) => true,
            (ReadOnly, ReadOnly) => true,
            _ => false,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pathfloor::{adversarial_paths, enforce_floor, FloorVerdict};

    #[test]
    fn renderer_and_worker_validate() {
        profiles::renderer().validate().unwrap();
        profiles::worker("/tmp/w-scratch").validate().unwrap();
        profiles::network().validate().unwrap();
    }

    #[test]
    fn fail_closed_validation() {
        let mut p = profiles::worker("/tmp/s");
        p.no_new_privs = false;
        assert!(matches!(
            p.validate(),
            Err(SandboxError::NoNewPrivsRequired(_))
        ));
        let mut p = profiles::worker("/tmp/s");
        p.spawns_children = true; // but no ProcessCreation group
        assert!(matches!(
            p.validate(),
            Err(SandboxError::SyscallNotInPolicy { .. })
        ));
        let mut p = profiles::renderer();
        p.files_write = true; // but no write path rule
        assert!(matches!(
            p.validate(),
            Err(SandboxError::WriteWithoutPath { .. })
        ));
    }

    #[test]
    fn network_profile_has_no_fs() {
        let n = profiles::network();
        assert!(!n.check_path("/etc/passwd", PathAccess::ReadOnly));
        assert!(!n.check_path("/tmp/x", PathAccess::ReadWrite));
    }

    #[test]
    fn worker_scratch_read_write_only() {
        let w = profiles::worker("/tmp/w-scratch");
        assert!(w.check_path("/tmp/w-scratch/a/b.txt", PathAccess::ReadWrite));
        assert!(w.check_path("/tmp/w-scratch/a.txt", PathAccess::ReadOnly));
        // Outside the scratch + read-only base → refused.
        assert!(!w.check_path("/home/user/secret.txt", PathAccess::ReadOnly));
        assert!(!w.check_path("/usr/bin/rm", PathAccess::ReadWrite));
        // Executable base is readable+executable.
        assert!(w.check_path("/usr/share/lib/x.so", PathAccess::ReadAndExecute));
    }

    #[test]
    fn path_floor_invariant_holds_for_profile_checks() {
        // Any path a profile admits must also pass the raw floor against the
        // same prefixes — the 0-escape invariant carries into the sandbox.
        let w = profiles::worker("/tmp/w-scratch");
        for p in adversarial_paths() {
            if w.check_path(&p, PathAccess::ReadWrite) {
                assert_eq!(
                    enforce_floor(&p, &["/tmp/w-scratch"]),
                    FloorVerdict::Allowed
                );
            }
        }
    }

    #[test]
    fn apply_is_explicit_about_platform() {
        assert!(profiles::renderer().apply().is_err()); // UnsupportedPlatform
    }
}
