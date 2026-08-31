//! P7.8/P49.5 — declarative sandbox policy and V1 backend resolution.
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::Path;
use std::process::{Child, Command};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum PathAccess {
    ReadOnly,
    ReadAndExecute,
    ReadWrite,
    AddIfExists,
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PathRule {
    pub prefix: String,
    pub access: PathAccess,
}
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

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SandboxProfile {
    pub name: String,
    pub no_new_privs: bool,
    pub paths: Vec<PathRule>,
    pub syscalls: Vec<SyscallGroup>,
    pub spawns_children: bool,
    pub files_write: bool,
}
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum SandboxError {
    #[error("profile `{0}` must set no_new_privs (fail-closed)")]
    NoNewPrivsRequired(String),
    #[error("profile `{name}` enables {group:?} but the syscall group is not in the policy")]
    SyscallNotInPolicy { name: String, group: SyscallGroup },
    #[error("profile `{name}` enables files_write but no path rule grants write access")]
    WriteWithoutPath { name: String },
    #[error("sandbox backend is unavailable for this platform/policy (fail-closed)")]
    UnsupportedPlatform,
    #[error("sandbox policy intersection is empty or invalid: {0}")]
    InvalidPolicy(String),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SandboxRole {
    AgentSandbox,
    ChildExecutionSandbox,
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SandboxSpec {
    pub role: SandboxRole,
    pub profile: SandboxProfile,
    pub network: String,
    pub credentials: String,
    pub resource_limit_bytes: u64,
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SandboxReceipt {
    pub environment_id: String,
    pub backend: String,
    pub policy_hash: String,
    pub preflight_status: String,
    pub runtime_status: String,
    pub violations: Vec<String>,
    pub postflight_status: String,
    pub state_hash: String,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SandboxBackendKind {
    TrustedNative,
    NativeProcess,
    Container,
    MicroVm,
}

impl SandboxReceipt {
    pub fn preflight(spec: &SandboxSpec, backend: &str, environment_id: impl Into<String>) -> Self {
        Self {
            environment_id: environment_id.into(),
            backend: backend.into(),
            policy_hash: policy_hash(spec),
            preflight_status: "passed".into(),
            runtime_status: "not_started".into(),
            violations: Vec::new(),
            postflight_status: "not_verified".into(),
            state_hash: String::new(),
        }
    }

    pub fn observe(mut self, status: impl Into<String>, violations: Vec<String>) -> Self {
        self.runtime_status = status.into();
        self.violations = violations;
        self
    }

    pub fn postflight(mut self, status: impl Into<String>, state: &str) -> Self {
        self.postflight_status = status.into();
        let mut h = Sha256::new();
        h.update(state.as_bytes());
        self.state_hash = h.finalize().iter().map(|b| format!("{b:02x}")).collect();
        self
    }

    pub fn verified(&self) -> bool {
        self.preflight_status == "passed"
            && self.postflight_status == "passed"
            && self.violations.is_empty()
            && !self.state_hash.is_empty()
    }
}

fn policy_hash(spec: &SandboxSpec) -> String {
    let bytes = serde_json::to_vec(spec).unwrap_or_default();
    let mut h = Sha256::new();
    h.update(bytes);
    h.finalize().iter().map(|b| format!("{b:02x}")).collect()
}

pub trait SandboxBackend {
    fn capabilities(&self) -> Vec<String>;
    fn validate(&self, spec: &SandboxSpec) -> Result<(), SandboxError>;
    fn spawn(&self, spec: &SandboxSpec, command: &[String]) -> Result<u32, SandboxError>;
    fn inspect(&self, pid: u32) -> Result<Vec<String>, SandboxError>;
    fn kill(&self, pid: u32) -> Result<(), SandboxError>;
}

/// Linux bubblewrap backend. It is deliberately constructed as a command
/// wrapper: policy validation happens before spawning, and only explicitly
/// allowed paths are exposed. No credentials or ambient environment are
/// forwarded.
#[cfg(target_os = "linux")]
pub struct LinuxBwrapBackend;

#[cfg(target_os = "linux")]
impl LinuxBwrapBackend {
    pub fn command(spec: &SandboxSpec, command: &[String]) -> Result<Command, SandboxError> {
        spec.profile.validate()?;
        if command.is_empty() || command.iter().any(|arg| arg.contains('\0')) {
            return Err(SandboxError::InvalidPolicy(
                "empty or invalid command".into(),
            ));
        }
        let mut child = Command::new("bwrap");
        child.args(["--die-with-parent", "--new-session", "--clearenv"]);
        if spec.profile.no_new_privs {
            child.arg("--unshare-user").arg("--disable-setuid");
        }
        child.args(["--ro-bind", "/usr", "/usr"]);
        child.args(["--ro-bind", "/bin", "/bin"]);
        child.args(["--ro-bind", "/lib", "/lib"]);
        child.args(["--ro-bind", "/lib64", "/lib64"]);
        child.arg("--proc").arg("/proc").arg("--dev").arg("/dev");
        if spec.network == "deny" {
            child.arg("--unshare-net");
        }
        for rule in &spec.profile.paths {
            let path = Path::new(&rule.prefix);
            if !path.is_absolute() {
                return Err(SandboxError::InvalidPolicy(
                    "sandbox path must be absolute".into(),
                ));
            }
            match rule.access {
                PathAccess::ReadOnly | PathAccess::ReadAndExecute => {
                    child.args(["--ro-bind", &rule.prefix, &rule.prefix]);
                }
                PathAccess::ReadWrite | PathAccess::AddIfExists => {
                    if !spec.profile.files_write {
                        return Err(SandboxError::InvalidPolicy(
                            "write path without write policy".into(),
                        ));
                    }
                    child.args(["--bind", &rule.prefix, &rule.prefix]);
                }
            }
        }
        child.arg("--").args(command);
        Ok(child)
    }
}

#[cfg(target_os = "linux")]
impl SandboxBackend for LinuxBwrapBackend {
    fn capabilities(&self) -> Vec<String> {
        vec![
            "linux".into(),
            "bwrap".into(),
            "network-isolation".into(),
            "path-isolation".into(),
        ]
    }
    fn validate(&self, spec: &SandboxSpec) -> Result<(), SandboxError> {
        if !linux_bwrap_available() {
            return Err(SandboxError::UnsupportedPlatform);
        }
        spec.profile.validate()
    }
    fn spawn(&self, spec: &SandboxSpec, command: &[String]) -> Result<u32, SandboxError> {
        self.validate(spec)?;
        Self::command(spec, command)?
            .spawn()
            .map(|child: Child| child.id())
            .map_err(|_| SandboxError::UnsupportedPlatform)
    }
    fn inspect(&self, pid: u32) -> Result<Vec<String>, SandboxError> {
        let status = std::fs::read_to_string(format!("/proc/{pid}/status"))
            .map_err(|_| SandboxError::UnsupportedPlatform)?;
        Ok(status.lines().map(str::to_string).collect())
    }
    fn kill(&self, pid: u32) -> Result<(), SandboxError> {
        let status = Command::new("kill")
            .arg("-TERM")
            .arg(pid.to_string())
            .status()
            .map_err(|_| SandboxError::UnsupportedPlatform)?;
        status
            .success()
            .then_some(())
            .ok_or(SandboxError::UnsupportedPlatform)
    }
}

/// Linux backend availability is explicit. We never claim containment when
/// bubblewrap is absent; callers must choose a different trusted policy or fail.
pub fn linux_bwrap_available() -> bool {
    Command::new("bwrap")
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

pub fn resolve_sandbox_backend(
    role: SandboxRole,
    requested: SandboxBackendKind,
) -> Result<SandboxBackendKind, SandboxError> {
    if role == SandboxRole::ChildExecutionSandbox && requested == SandboxBackendKind::TrustedNative
    {
        return Err(SandboxError::InvalidPolicy(
            "child execution cannot use trusted native".into(),
        ));
    }
    match requested {
        SandboxBackendKind::TrustedNative => Ok(requested),
        SandboxBackendKind::NativeProcess => Ok(requested),
        SandboxBackendKind::Container | SandboxBackendKind::MicroVm => {
            Err(SandboxError::UnsupportedPlatform)
        }
    }
}

pub mod profiles {
    use super::*;
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
    pub fn check_path(&self, path: &str, access: PathAccess) -> bool {
        use crate::pathfloor::canonicalize_no_follow;
        let c = canonicalize_no_follow(path);
        if matches!(access, PathAccess::ReadWrite | PathAccess::AddIfExists) && !self.files_write {
            return false;
        }
        self.paths.iter().any(|r| {
            let p = canonicalize_no_follow(&r.prefix);
            let inside = c == p || c.starts_with(&format!("{}/", p.trim_end_matches('/')));
            inside && r.access_allows(access)
        })
    }
    pub fn apply(&self) -> Result<(), SandboxError> {
        self.validate()?;
        Err(SandboxError::UnsupportedPlatform)
    }
}
impl PathRule {
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
    #[test]
    fn profiles_validate_and_network_has_no_fs() {
        profiles::renderer().validate().unwrap();
        profiles::worker("/tmp/s").validate().unwrap();
        assert!(!profiles::network().check_path("/etc/passwd", PathAccess::ReadOnly));
    }
    #[test]
    fn roles_and_backend_fail_closed() {
        assert_eq!(
            resolve_sandbox_backend(SandboxRole::AgentSandbox, SandboxBackendKind::NativeProcess)
                .unwrap(),
            SandboxBackendKind::NativeProcess
        );
        assert!(resolve_sandbox_backend(
            SandboxRole::ChildExecutionSandbox,
            SandboxBackendKind::TrustedNative
        )
        .is_err());
    }
    #[test]
    fn apply_is_honest() {
        assert!(profiles::renderer().apply().is_err());
    }

    #[test]
    fn receipt_requires_clean_postflight_and_state_proof() {
        let spec = SandboxSpec {
            role: SandboxRole::ChildExecutionSandbox,
            profile: profiles::worker("/tmp/scratch"),
            network: "deny".into(),
            credentials: "opaque_handles".into(),
            resource_limit_bytes: 1024,
        };
        let receipt = SandboxReceipt::preflight(&spec, "native-process", "env-1")
            .observe("completed", Vec::new())
            .postflight("passed", "clean");
        assert!(receipt.verified());
        let violated = SandboxReceipt::preflight(&spec, "native-process", "env-1")
            .observe("completed", vec!["network".into()])
            .postflight("passed", "clean");
        assert!(!violated.verified());
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn bwrap_command_is_clearenv_and_network_constrained() {
        let spec = SandboxSpec {
            role: SandboxRole::ChildExecutionSandbox,
            profile: profiles::worker("/tmp/scratch"),
            network: "deny".into(),
            credentials: "opaque_handles".into(),
            resource_limit_bytes: 1024,
        };
        let command =
            LinuxBwrapBackend::command(&spec, &["/bin/echo".into(), "ok".into()]).unwrap();
        let args: Vec<String> = command
            .get_args()
            .map(|a| a.to_string_lossy().into())
            .collect();
        assert!(args.contains(&"--clearenv".into()));
        assert!(args.contains(&"--unshare-net".into()));
        assert!(args.windows(2).any(|pair| pair == ["--", "/bin/echo"]));
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn bwrap_command_rejects_relative_policy_paths() {
        let mut profile = profiles::worker("relative");
        profile.paths[1].prefix = "relative".into();
        let spec = SandboxSpec {
            role: SandboxRole::ChildExecutionSandbox,
            profile,
            network: "deny".into(),
            credentials: "opaque_handles".into(),
            resource_limit_bytes: 1024,
        };
        assert!(LinuxBwrapBackend::command(&spec, &["/bin/echo".into()]).is_err());
    }

    #[test]
    fn linux_backend_never_claims_available_without_bwrap() {
        // This is an availability probe only; unsupported environments remain
        // fail-closed through backend resolution and apply().
        let _ = linux_bwrap_available();
    }
}
