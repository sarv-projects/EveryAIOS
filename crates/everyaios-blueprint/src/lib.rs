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
//! - `persona` — P8.3 personality system (SOUL.md personas, tone presets,
//!   inviolable core rules).

pub mod automation;
pub mod blueprint;
pub mod checkpoint;
pub mod crystallize;
pub mod frontmatter;
pub mod helpers;
pub mod iteration;
pub mod md;
pub mod persona;
pub mod plan_cache;
pub mod plugin;
pub mod skill_store;
pub mod spec;
pub mod subagent;
pub mod surgical;
pub mod topology;

pub use automation::{Automation, AutomationStep, Trigger};
pub use blueprint::{Blueprint, BlueprintError, BlueprintTask, TaskStatus, VerifyBlock};
pub use checkpoint::{BlueprintRegistry, Checkpoint, CheckpointError, RegistryError};
pub use crystallize::{
    compile_to_script, decrystallize_check, signature as workflow_signature, CompiledSkill, Drift,
    ScriptLanguage, SkillRegistry, StepClass, Workflow, WorkflowDetector, WorkflowStep,
};
pub use frontmatter::{
    parse_frontmatter, AgentConfig, ApprovalMode, FrontmatterError, PermissionMode,
};
pub use iteration::{
    BudgetError, CircuitBreak, CircuitBreaker, InterruptReason, IterationBudget, LoopDetector,
    LoopVerdict, McqOption, Scope, StepKind, TimeoutPolicy, PARENT_MAX_ITERATIONS,
    SUBAGENT_MAX_ITERATIONS, SUBAGENT_TIMEOUT_CUSTOM_SECS, SUBAGENT_TIMEOUT_GLOBAL_SECS,
};
pub use md::{BlueprintDoc, MdError};
pub use persona::{
    load_persona, render_persona, Persona, PersonaConfig, PersonaError, TonePreset, CORE_RULES,
};
pub use plan_cache::{signature, PlanCache, PlanCacheError, PlanEntry, DEFAULT_SIMILARITY};
pub use plugin::{
    dogfood_rule, first_party_catalog, ApprovalRequest, CapabilityList, Contributes, FileBackend,
    HostFacades, LlmBackend, PluginEntry, PluginError, PluginManifest, PluginRegistry, PluginState,
    Slot, TrustFlagsDecl, ABI_VERSION,
};
pub use skill_store::{
    grow_from_task, taste_skill, ScoredSkill, Skill, SkillError, SkillIndex, SkillManifest,
    SkillStore, MAX_ACTIVE_SKILLS,
};
pub use spec::{SpecError, TaskSpec};
pub use subagent::{
    AgentMessage, AgentMessageKind, SubAgentError, SubAgentLimits, SubAgentResult, SubAgentRuntime,
    SubAgentSpec, DELEGATE_BLOCKED_TOOLS, ROOT_AGENT,
};
pub use topology::{AgentRole, MultiAgentPlan, Topology};
