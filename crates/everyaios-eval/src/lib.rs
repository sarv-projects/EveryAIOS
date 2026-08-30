//! everyaios-eval — Verified-Completion Eval Subsystem (P8.0, EV1 —
//! doc 63 §2.3; better-harness evidence-first + skyvern verification loop +
//! codex attestation + openspec verify-gate).
//!
//! The core principle: **the agent's own "finished" is an untrusted claim.**
//! Completion is only proven by an independent, deterministic verifier that
//! checks the *requested final state exists* — files, hashes, content,
//! test-pass — and that no forbidden side effect occurred.
//!
//! - `status` — the six-way completion-status taxonomy (score + status, never
//!   one blended number).
//! - `manifest` — the task manifest format: goal + required-outcome checks +
//!   forbidden-side-effect constraints + budgets + evidence requirements.
//! - `verifier` — the deterministic verifier SDK: run outcome checks,
//!   derive the status, and assemble an evidence bundle.
//! - `evidence` — the evidence bundle (artifact hashes, validator reports,
//!   screenshots, approval events) with explicit missing-evidence reporting.
//! - `report` — the evidence-first loop report (impact / expected-output /
//!   scoped-repair / acceptance-checks; missing evidence stays explicit).
//! - `suite` — the built-in 30-task adversarial desktop suite + fault
//!   injection kinds.
//! - `retrieval` — the retrieval-eval corpus scoring: 7 metrics (evidence
//!   recall/precision, grounding, span fidelity, multi-hop, permission
//!   compliance, injection resistance).
//! - `runner` — the sandbox runner: provision a fixture into a fresh
//!   workspace, inject a fault, run the agent, verify, assemble the result
//!   bundle, and reset.
//! - `corpus` — the built-in corpus data: retrieval corpus + questions +
//!   cases, and deterministic per-task fixtures.
//! - `store` — the evidence-bundle persistent store (JSON on disk, keyed by
//!   task id).
//! - `batch` — batch runs: the full adversarial suite through the sandbox
//!   runner, and retrieval cases through an answering function, both with
//!   per-case distributions + aggregates.

pub mod batch;
pub mod corpus;
pub mod evidence;
pub mod manifest;
pub mod report;
pub mod retrieval;
pub mod runner;
pub mod simulator;
pub mod status;
pub mod store;
pub mod suite;
pub mod surface;
pub mod usage;
pub mod verifier;

pub use batch::{run_retrieval_batch, run_suite, RetrievalBatchReport, SuiteReport};
pub use corpus::{
    builtin_fixtures, builtin_retrieval_cases, builtin_retrieval_corpus,
    builtin_retrieval_questions, RetrievalCase,
};
pub use evidence::{ApprovalEvent, ArtifactHash, EvidenceBundle};
pub use manifest::{
    Budgets, Constraint, EvidenceRequirement, HashAlgorithm, OutcomeCheck, TaskManifest,
};
pub use report::{Finding, LoopReport};
pub use retrieval::{
    score_retrieval, EvidenceSpan, ExpectedAnswer, RetrievalDocument, RetrievalQuestion,
    RetrievalResult, RetrievalScores,
};
pub use runner::{apply_filesystem_fault, Agent, Fixture, FixtureFile, RunOutcome, SandboxRunner};
pub use simulator::{
    compile as compile_demo, CompiledDemo, CompiledStep, SimulationFixture, SimulationReport,
    Simulator, StepVerdict,
};
pub use status::{CompletionStatus, Score};
pub use store::EvidenceStore;
pub use suite::{builtin_suite, AdversarialTask, FaultInjection, FaultKind, TaskCategory};
pub use surface::{verify_surface, Surface, SurfaceCheck, SurfaceContext, SurfaceVerdict};
pub use usage::{
    EfficiencyMetrics, GenericUsageParser, TurnClass, TurnKind, TurnStat, Usage, UsageParser,
    UsageParserRegistry,
};
pub use verifier::{
    run_outcome_check, verify, verify_with_policy, OutcomeCheckResult, VerificationReport,
    VerificationScore,
};
