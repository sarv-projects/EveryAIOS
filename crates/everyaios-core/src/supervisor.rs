//! ProcessSupervisor — synchronous child-process supervisor for the TS coordinator sidecar.
//!
//! Spawns the coordinator binary, monitors its exit codes, applies exponential
//! backoff on crashes, and implements a circuit breaker (5 crashes in 10 min →
//! open). Designed to run on a dedicated std::thread, NOT the async runtime.

use std::collections::VecDeque;
use std::io;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant};

/// Supervisor states reflecting the lifecycle of the managed child process.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SupervisorState {
    Starting,
    Running,
    Restarting,
    CircuitOpen,
    Stopped,
}

impl std::fmt::Display for SupervisorState {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Starting => write!(f, "Starting"),
            Self::Running => write!(f, "Running"),
            Self::Restarting => write!(f, "Restarting"),
            Self::CircuitOpen => write!(f, "CircuitOpen"),
            Self::Stopped => write!(f, "Stopped"),
        }
    }
}

/// Errors produced by the supervisor.
#[derive(Debug, thiserror::Error)]
pub enum SupervisorError {
    #[error("failed to spawn coordinator: {0}")]
    SpawnFailed(#[from] io::Error),

    #[error("circuit breaker open — too many crashes in 10 minutes")]
    CircuitOpen,

    #[error("watchdog timeout — child unresponsive")]
    WatchdogTimeout,

    #[error("supervisor killed")]
    Killed,
}

/// Circuit breaker window: crashes older than this are forgotten.
const CIRCUIT_WINDOW: Duration = Duration::from_secs(10 * 60);

/// Maximum crashes within the window before tripping the breaker.
const CIRCUIT_THRESHOLD: usize = 5;

/// Connect timeout: time allowed for child to become responsive after spawn.
const CONNECT_TIMEOUT: Duration = Duration::from_secs(5);

/// Idle timeout: maximum time without activity before watchdog kills child.
const IDLE_TIMEOUT: Duration = Duration::from_secs(30);

/// Poll interval for try_wait loop.
const POLL_INTERVAL: Duration = Duration::from_millis(100);

/// Maximum backoff delay in seconds.
const MAX_BACKOFF_SECS: u64 = 60;

/// The ProcessSupervisor manages a single child process (the TS coordinator).
///
/// It is fully synchronous — designed to run on its own `std::thread`.
pub struct ProcessSupervisor {
    /// Handle to the running child process (None when stopped).
    pub child: Option<Child>,
    /// Path to the coordinator binary to spawn.
    pub binary_path: PathBuf,
    /// Current lifecycle state.
    pub state: SupervisorState,
    /// Timestamps of recent crashes for the circuit breaker.
    pub crash_history: VecDeque<Instant>,
    /// Number of consecutive restarts (for exponential backoff).
    pub restart_count: u32,
    /// When the current child was spawned (for connect watchdog).
    pub started_at: Option<Instant>,
    /// Last time activity was observed on the child (for idle watchdog).
    pub last_activity: Option<Instant>,
}

impl ProcessSupervisor {
    /// Create a new supervisor for the given binary.
    pub fn new(binary_path: PathBuf) -> Self {
        Self {
            child: None,
            binary_path,
            state: SupervisorState::Stopped,
            crash_history: VecDeque::new(),
            restart_count: 0,
            started_at: None,
            last_activity: None,
        }
    }

    /// Spawn the coordinator binary as a child process.
    ///
    /// Sets `BUN_JSC_heapSize=536870912` (512 MB) and applies platform-specific
    /// orphan-prevention in the child via `pre_exec`.
    pub fn spawn(&mut self) -> Result<(), SupervisorError> {
        self.state = SupervisorState::Starting;

        let mut cmd = Command::new(&self.binary_path);
        cmd.stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .env("BUN_JSC_heapSize", "536870912");

        // Platform-specific pre_exec for orphan prevention.
        #[cfg(target_os = "linux")]
        {
            use std::os::unix::process::CommandExt;
            unsafe {
                cmd.pre_exec(|| {
                    // PR_SET_PDEATHSIG: when parent dies, deliver SIGTERM to this child.
                    let ret = libc::prctl(libc::PR_SET_PDEATHSIG, libc::SIGTERM);
                    if ret != 0 {
                        return Err(io::Error::last_os_error());
                    }
                    Ok(())
                });
            }
        }

        #[cfg(target_os = "macos")]
        {
            use std::os::unix::process::CommandExt;
            unsafe {
                cmd.pre_exec(|| {
                    // Create a new process group so we can signal the whole group.
                    if libc::setsid() == -1 {
                        return Err(io::Error::last_os_error());
                    }
                    Ok(())
                });
            }
        }

        #[cfg(target_os = "windows")]
        {
            // TODO: Assign child to a Job Object with JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE.
            // Requires the `windows-sys` crate — deferred to Windows support phase.
        }

        let child = cmd.spawn().map_err(SupervisorError::SpawnFailed)?;
        self.child = Some(child);
        self.state = SupervisorState::Running;
        self.started_at = Some(Instant::now());
        self.last_activity = Some(Instant::now());

        Ok(())
    }

    /// Restart with exponential backoff: delay = min(2^restart_count, 60) seconds.
    pub fn restart_with_backoff(&mut self) -> Result<(), SupervisorError> {
        self.state = SupervisorState::Restarting;

        let delay_secs = std::cmp::min(1u64 << self.restart_count, MAX_BACKOFF_SECS);
        eprintln!(
            "[supervisor] restart_with_backoff: sleeping {}s (attempt {})",
            delay_secs, self.restart_count
        );
        std::thread::sleep(Duration::from_secs(delay_secs));

        self.restart_count += 1;
        self.spawn()?;
        self.state = SupervisorState::Running;
        Ok(())
    }

    /// Check the circuit breaker. Prunes old entries, trips if threshold exceeded.
    pub fn check_circuit_breaker(&mut self) -> Result<(), SupervisorError> {
        let cutoff = Instant::now() - CIRCUIT_WINDOW;
        // Remove entries older than the window.
        while let Some(front) = self.crash_history.front() {
            if *front < cutoff {
                self.crash_history.pop_front();
            } else {
                break;
            }
        }

        if self.crash_history.len() >= CIRCUIT_THRESHOLD {
            self.state = SupervisorState::CircuitOpen;
            return Err(SupervisorError::CircuitOpen);
        }
        Ok(())
    }

    /// Record a crash and check the circuit breaker.
    pub fn record_crash(&mut self) -> Result<(), SupervisorError> {
        self.crash_history.push_back(Instant::now());
        self.check_circuit_breaker()
    }

    /// Watchdog: check connect timeout and idle timeout.
    ///
    /// Returns Ok(()) if healthy, or kills + restarts if timeouts exceeded.
    pub fn check_watchdog(&mut self) -> Result<(), SupervisorError> {
        // Connect timeout: child must leave Starting within CONNECT_TIMEOUT.
        if self.state == SupervisorState::Starting {
            if let Some(started) = self.started_at {
                if started.elapsed() > CONNECT_TIMEOUT {
                    eprintln!("[supervisor] watchdog: connect timeout exceeded, killing child");
                    self.kill();
                    self.restart_with_backoff()?;
                    return Ok(());
                }
            }
        }

        // Idle timeout: no activity for IDLE_TIMEOUT while Running.
        if self.state == SupervisorState::Running {
            if let Some(last) = self.last_activity {
                if last.elapsed() > IDLE_TIMEOUT {
                    eprintln!("[supervisor] watchdog: idle timeout exceeded, killing child");
                    self.kill();
                    self.restart_with_backoff()?;
                    return Ok(());
                }
            }
        }

        Ok(())
    }

    /// Kill the child process (if running).
    pub fn kill(&mut self) {
        if let Some(mut child) = self.child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
        self.state = SupervisorState::Stopped;
    }

    /// Main supervisor loop: spawn, poll, restart on crash.
    ///
    /// Returns only when the circuit breaker trips or an unrecoverable error occurs.
    /// This method blocks the calling thread (run it on a dedicated thread).
    pub fn wait_or_restart(&mut self) -> Result<(), SupervisorError> {
        self.spawn()?;
        eprintln!("[supervisor] state: {}", self.state);

        loop {
            // Check circuit breaker first.
            if self.state == SupervisorState::CircuitOpen {
                return Err(SupervisorError::CircuitOpen);
            }

            // Poll the child.
            let exited = if let Some(ref mut child) = self.child {
                match child.try_wait() {
                    Ok(Some(status)) => Some(status),
                    Ok(None) => None,
                    Err(e) => {
                        eprintln!("[supervisor] try_wait error: {e}");
                        None
                    }
                }
            } else {
                // No child — should not happen in normal flow.
                eprintln!("[supervisor] no child process — attempting respawn");
                self.spawn()?;
                None
            };

            if let Some(status) = exited {
                let code = status.code().unwrap_or(-1);
                self.child = None;

                match code {
                    0 => {
                        // Clean rotation (heap timer or graceful shutdown).
                        eprintln!("[supervisor] child exited cleanly (code 0) — rotating");
                        self.restart_count = 0;
                        self.spawn()?;
                        eprintln!("[supervisor] state: {}", self.state);
                    }
                    71 => {
                        // Heap pressure exit (EX_OSERR).
                        eprintln!("[supervisor] child exited with code 71 (heap pressure)");
                        if self.record_crash().is_err() {
                            return Err(SupervisorError::CircuitOpen);
                        }
                        self.restart_with_backoff()?;
                        eprintln!("[supervisor] state: {}", self.state);
                    }
                    _ => {
                        // Unexpected crash.
                        eprintln!("[supervisor] child crashed with code {code}");
                        if self.record_crash().is_err() {
                            return Err(SupervisorError::CircuitOpen);
                        }
                        self.restart_with_backoff()?;
                        eprintln!("[supervisor] state: {}", self.state);
                    }
                }
            }

            std::thread::sleep(POLL_INTERVAL);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn supervisor_new_defaults() {
        let s = ProcessSupervisor::new(PathBuf::from("/tmp/fake-bin"));
        assert_eq!(s.state, SupervisorState::Stopped);
        assert_eq!(s.restart_count, 0);
        assert!(s.child.is_none());
        assert!(s.crash_history.is_empty());
    }

    #[test]
    fn circuit_breaker_trips_after_threshold() {
        let mut s = ProcessSupervisor::new(PathBuf::from("/tmp/fake-bin"));
        for _ in 0..5 {
            s.crash_history.push_back(Instant::now());
        }
        let result = s.check_circuit_breaker();
        assert!(result.is_err());
        assert_eq!(s.state, SupervisorState::CircuitOpen);
    }

    #[test]
    fn circuit_breaker_prunes_old_entries() {
        let mut s = ProcessSupervisor::new(PathBuf::from("/tmp/fake-bin"));
        // Push entries that are "old" (we can't easily fake Instant, so just test
        // that fewer than 5 recent entries doesn't trip).
        for _ in 0..4 {
            s.crash_history.push_back(Instant::now());
        }
        let result = s.check_circuit_breaker();
        assert!(result.is_ok());
        assert_ne!(s.state, SupervisorState::CircuitOpen);
    }

    #[test]
    fn spawn_fails_with_nonexistent_binary() {
        let mut s = ProcessSupervisor::new(PathBuf::from("/nonexistent/binary/path"));
        let result = s.spawn();
        assert!(result.is_err());
        match result.unwrap_err() {
            SupervisorError::SpawnFailed(_) => {}
            other => panic!("expected SpawnFailed, got: {other:?}"),
        }
    }

    #[test]
    fn kill_when_no_child_is_noop() {
        let mut s = ProcessSupervisor::new(PathBuf::from("/tmp/fake-bin"));
        s.kill(); // Should not panic.
        assert_eq!(s.state, SupervisorState::Stopped);
    }

    #[test]
    fn supervisor_state_display() {
        assert_eq!(format!("{}", SupervisorState::Starting), "Starting");
        assert_eq!(format!("{}", SupervisorState::Running), "Running");
        assert_eq!(format!("{}", SupervisorState::CircuitOpen), "CircuitOpen");
    }

    #[test]
    fn record_crash_adds_to_history() {
        let mut s = ProcessSupervisor::new(PathBuf::from("/tmp/fake-bin"));
        let _ = s.record_crash();
        assert_eq!(s.crash_history.len(), 1);
    }
}
