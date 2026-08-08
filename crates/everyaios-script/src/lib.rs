//! everyaios-script — the `run`/`evaluate` sandbox (ARCH/08, E4).
//!
//! P0.1 scope: the **limits contract** (the numbers the sandbox must
//! enforce) as a typed struct + a trait that P2.5 implements over rquickjs.
//! No JS engine dependency is pulled until P2.5 keeps the build lean.

use serde::{Deserialize, Serialize};

/// Hard limits the sandbox enforces (spec E4 / ARCH/08 §8.4):
/// 64MB heap, 512KB stack, 30s timeout, 1K log lines, 2MB return payload.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub struct SandboxLimits {
    pub max_heap_bytes: u64,
    pub max_stack_bytes: u64,
    pub timeout_secs: u64,
    pub max_log_lines: u64,
    pub max_return_bytes: u64,
}

impl Default for SandboxLimits {
    fn default() -> Self {
        Self {
            max_heap_bytes: 64 * 1024 * 1024,
            max_stack_bytes: 512 * 1024,
            timeout_secs: 30,
            max_log_lines: 1024,
            max_return_bytes: 2 * 1024 * 1024,
        }
    }
}

/// The sandbox surface. Implemented over rquickjs in P2.5; the trait fixes
/// the contract so callers (everyaios-mcp `run` tool) don't change later.
pub trait ScriptSandbox {
    /// Evaluate `code`, returning the serialized result or a sandbox error.
    /// Every `browser` SDK primitive call must pass through an
    /// InnerCallHook (authorize → record → page-claim) — P2.5.
    fn eval(&self, code: &str) -> Result<String, SandboxError>;

    /// The limits this sandbox instance enforces.
    fn limits(&self) -> SandboxLimits;
}

/// Failure modes the sandbox distinguishes (each maps to a clear model
/// signal — a truncated/errored script must never look like success).
#[derive(Debug, thiserror::Error)]
pub enum SandboxError {
    #[error("sandbox not yet wired (P2.5): {0}")]
    NotWired(String),
    #[error("script timeout after {0}s")]
    Timeout(u64),
    #[error("resource limit exceeded: {0}")]
    Limit(String),
    #[error("javascript error: {0}")]
    Js(String),
    #[error("return payload too large")]
    ReturnTooLarge,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_limits_match_spec() {
        let l = SandboxLimits::default();
        assert_eq!(l.max_heap_bytes, 64 * 1024 * 1024);
        assert_eq!(l.max_stack_bytes, 512 * 1024);
        assert_eq!(l.timeout_secs, 30);
        assert_eq!(l.max_log_lines, 1024);
        assert_eq!(l.max_return_bytes, 2 * 1024 * 1024);
    }

    #[test]
    fn error_messages_are_model_friendly() {
        let e = SandboxError::Timeout(30);
        assert!(e.to_string().contains("timeout"));
        let e2 = SandboxError::ReturnTooLarge;
        assert!(e2.to_string().contains("large"));
    }
}
