//! everyaios-blueprint — orchestration core (P6).
//!
//! The durable orchestration primitives: spec-per-task files (the sub-agent's
//! starting context), verify-gated blueprint tasks (the verifier decides
//! "done", never the agent's own claim), agent-frontmatter parsing (drop in
//! Claude-Code/Qwen agent files), multi-agent topologies, and automation tool
//! shapes.
//!
//! - `spec` — `TaskSpec` (goal + context + acceptance) ↔ `spec.md`.
//! - `blueprint` — `Blueprint` / `BlueprintTask` / `VerifyBlock` with a
//!   dependency-aware ready set + cycle detection, and `verify_against()` that
//!   delegates to `everyaios-eval`.
//! - `frontmatter` — `AgentConfig` + `PermissionMode → ApprovalMode` bridge.
//! - `topology` — `MultiAgentPlan` (group-chat / handoff / sequential /
//!   concurrent) with least-privilege validation.
//! - `automation` — `Automation` steps (`run_code` / `online_search` / email /
//!   calendar) with privileged-step surfacing for the approval gate.

pub mod automation;
pub mod blueprint;
pub mod frontmatter;
pub mod spec;
pub mod topology;

pub use automation::{Automation, AutomationStep, Trigger};
pub use blueprint::{
    Blueprint, BlueprintError, BlueprintTask, TaskStatus, VerifyBlock,
};
pub use frontmatter::{
    parse_frontmatter, AgentConfig, ApprovalMode, FrontmatterError, PermissionMode,
};
pub use spec::{TaskSpec, SpecError};
pub use topology::{AgentRole, MultiAgentPlan, Topology};
