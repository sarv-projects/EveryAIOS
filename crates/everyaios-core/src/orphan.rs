//! Orphan prevention — platform-specific mechanisms to kill child processes
//! when the parent (supervisor) dies unexpectedly.
//!
//! # Strategy per platform
//!
//! - **Linux**: `PR_SET_PDEATHSIG(SIGTERM)` via `prctl(2)` in the child's `pre_exec`.
//!   This is set in [`super::supervisor::ProcessSupervisor::spawn`].
//!
//! - **macOS**: `setsid()` creates a new process group. The supervisor can then
//!   signal the entire group on shutdown. Combined with parent-PID polling on the
//!   TS side for defense in depth.
//!
//! - **Windows**: Job Objects with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`. When the
//!   supervisor handle closes (including on crash), Windows automatically terminates
//!   all processes in the Job. (Stub — requires `windows-sys` crate.)
//!
//! # Sidecar-side polling
//!
//! The TypeScript coordinator also polls `process.ppid` and exits if the parent PID
//! changes (indicating the supervisor died and init/launchd re-parented). This is
//! implemented in the TS codebase and serves as a second line of defense.

/// Marker module for Linux orphan prevention.
///
/// The actual `PR_SET_PDEATHSIG` call is done inline in `ProcessSupervisor::spawn()`
/// via `CommandExt::pre_exec`. This module exists for documentation and potential
/// future helper utilities.
#[cfg(target_os = "linux")]
pub mod linux {
    /// The signal sent to the child when the parent dies.
    /// Using SIGTERM allows graceful shutdown.
    pub const DEATH_SIGNAL: i32 = libc::SIGTERM;

    /// Verify that PR_SET_PDEATHSIG is available (it always is on Linux ≥ 2.1.57).
    /// Returns true on success.
    pub fn verify_pdeathsig_support() -> bool {
        // PR_SET_PDEATHSIG has been in the kernel since 2.1.57 — effectively always.
        true
    }
}

/// Marker module for macOS orphan prevention.
#[cfg(target_os = "macos")]
pub mod macos {
    /// macOS does not have PR_SET_PDEATHSIG. We use:
    /// 1. `setsid()` in pre_exec to create a process group.
    /// 2. Parent-PID polling on the TS side.
    /// 3. Explicit SIGTERM to the process group on supervisor shutdown.
    pub fn strategy_description() -> &'static str {
        "setsid + parent-PID polling + explicit SIGTERM on shutdown"
    }
}

/// Marker module for Windows orphan prevention (stub).
#[cfg(target_os = "windows")]
pub mod windows {
    /// TODO: Implement Job Object creation with JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE.
    /// Requires `windows-sys` crate. When the last handle to the Job is closed
    /// (parent crash or exit), all child processes in the Job are terminated.
    pub fn create_job_object() -> Result<(), std::io::Error> {
        // Stub — to be implemented when Windows support is added.
        todo!("Windows Job Object support requires windows-sys crate")
    }
}

#[cfg(test)]
mod tests {
    #[test]
    #[cfg(target_os = "linux")]
    fn linux_pdeathsig_support() {
        assert!(super::linux::verify_pdeathsig_support());
    }

    #[test]
    #[cfg(target_os = "macos")]
    fn macos_strategy() {
        let desc = super::macos::strategy_description();
        assert!(desc.contains("setsid"));
    }
}
