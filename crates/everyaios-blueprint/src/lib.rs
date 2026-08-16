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
//! - `md` — the whole [`Blueprint`] ↔ `.md` (with optional agent frontmatter).
//! - `checkpoint` — resume-after-reboot snapshots + [`BlueprintRegistry`].
//! - `plan_cache` — signature-keyed plan reuse with version invalidation.

pub mod automation;
pub mod blueprint;
pub mod checkpoint;
pub mod frontmatter;
pub mod md;
pub mod plan_cache;
pub mod spec;
pub mod subagent;
pub mod topology;

pub use automation::{Automation, AutomationStep, Trigger};
pub use blueprint::{
    Blueprint, BlueprintError, BlueprintTask, TaskStatus, VerifyBlock,
};
pub use checkpoint::{
    BlueprintRegistry, Checkpoint, CheckpointError, RegistryError,
};
pub use frontmatter::{
    parse_frontmatter, AgentConfig, ApprovalMode, FrontmatterError, PermissionMode,
};
pub use md::{BlueprintDoc, MdError};
pub use plan_cache::{signature, PlanCache, PlanCacheError, PlanEntry, DEFAULT_SIMILARITY};
pub use spec::{TaskSpec, SpecError};
pub use subagent::{
    AgentMessage, AgentMessageKind, SubAgentError, SubAgentLimits, SubAgentResult,
    SubAgentRuntime, SubAgentSpec, DELEGATE_BLOCKED_TOOLS, ROOT_AGENT,
};
pub use topology::{AgentRole, MultiAgentPlan, Topology};
