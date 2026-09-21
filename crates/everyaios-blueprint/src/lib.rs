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
//!   delegates to [`verify`] (the runtime contract; the harness lives in
//!   `everyaios-eval`, which depends on this crate, not the reverse).
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
// P69.D32 — the runtime verification contract (task manifest, completion
// status, verifier SDK, surface checks) lives here, upstream of the eval
// harness: runtime crates link this, never `everyaios-eval`.
pub mod verify;
pub mod change_set;
pub mod checkpoint;
pub mod crystallize;
pub mod frontmatter;
pub mod helpers;
pub mod inbuilt;
pub mod iteration;
// P69.D12 — `jobs`, `kanban`, `swarm`, `workflow` and `loop_pattern` are
// **declarative patterns over Work/Run/Step**, not runtimes: they carry state
// machines, merge/reduction policy and validation, but no scheduler, no
// threads, no IO and no event log of their own (verified: zero external
// consumers drive them as execution engines; execution itself delegates to
// the caller's executor — the kernel's ExecutionKernel/WorkGateway). The
// `marketplace` module is likewise a registry + layout contract; the actual
// install/download is the F8 installer's job. If one of these modules ever
// grows `spawn`/IO/scheduling, D12 is violated — say so in review.
pub mod jobs;
pub mod kanban;
pub mod learn;
pub mod loop_pattern;
pub mod marketplace;
pub mod md;
pub mod persona;
pub mod plan_cache;
pub mod plugin;
pub mod plugin_manifest;
pub mod skill_store;
pub mod skills_index;
pub mod spec;
pub mod subagent;
pub mod supply_chain;
pub mod surgical;
// P69.D12 — declarative pattern, see the module list note above.
pub mod swarm;
pub mod topology;
pub mod workflow;

pub use automation::{Automation, AutomationStep, Trigger};
pub use blueprint::{Blueprint, BlueprintError, BlueprintTask, TaskStatus, VerifyBlock};
pub use change_set::{
    Change, ChangeSet, ChangeState, CommittedChange, EffectClass, ImportEntry, ImportError,
    RecoveryReport, ReviewedImport,
};
pub use checkpoint::{
    BlueprintRegistry, Checkpoint, CheckpointError, RegistryError, StepCheckpoint,
};
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
pub use kanban::{Column, Dispatcher, KanbanBoard, KanbanTask};
pub use learn::{
    derive_name, evidence_sha256, learn_and_save, learn_from_evidence, LearnDraft, LearnGate,
    LearnRequest,
};
pub use loop_pattern::{Condition, LoopPattern, LoopPatternRegistry, LoopSnapshot};
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
    grow_from_task, grow_from_task_checked, taste_skill, validate_grown_skill, ScoredSkill, Skill,
    SkillError, SkillIndex, SkillManifest, SkillReference, SkillScript, SkillStore,
    MAX_ACTIVE_SKILLS, SKILL_MAX_LINES,
};
pub use skills_index::{
    compose_stack, compose_stack_for, may_model_auto_invoke, may_user_slash_invoke, model_warm_set,
    user_slash_catalog, ComposeOutcome, IndexEntry, InvokeKind, RejectionReason, SelectionEvidence,
    SkillsIndexFile,
};
pub use spec::{SpecError, TaskSpec};
pub use subagent::{
    derive_child_permissions, parent_view, validate_message_endpoints, AgentMessage,
    AgentMessageKind, DelegationGauge, DelegationPolicy, SubAgentError, SubAgentLimits,
    SubAgentResult, SubAgentSpec, DELEGATE_BLOCKED_TOOLS, ROOT_AGENT,
};
pub use supply_chain::{
    digest as manifest_digest, hmac_sha256, ManifestBody, QuarantineEntry, SignedManifest,
    SupplyChainPolicy, SupplyVerdict,
};
pub use topology::{AgentRole, MultiAgentPlan, Topology};
pub mod worktree;
