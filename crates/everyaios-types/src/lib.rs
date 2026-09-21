//! P47.3 — **everyaios-types**: the shared contract crate (spec §4.0 item 20,
//! the "one structural change" the v3.59 architecture finalization chose).
//!
//! This crate exists to **kill contract drift between crates**. Every ID and
//! every status/risk/governance enum has exactly one canonical home here; the
//! other EveryAIOS crates name the same thing the same way instead of each
//! minting a slightly-different copy. Deliberately **pure**: newtypes + enums
//! only — no business logic, no DB, no networking, no IO.
//!
//! Rules for contributors:
//! - An ID that shows up on a wire boundary / across two crates lives here.
//! - A status/risk/category enum that two crates would otherwise re-declare
//!   lives here.
//! - Nothing with side effects. If you need behavior, add it as an `impl`
//!   on a type that already exists, or put it in the crate that owns the
//!   behavior (never here).

use serde::{Deserialize, Serialize};

// ────────────────────────────────────────────────────────────────────────
// ID newtypes — opaque, serializable, displayable, comparable.
// Use these on any cross-crate wire boundary so a `WorkId` can never be
// silently passed where a `TicketId` is expected (the pain point this crate
// exists to remove).
// ────────────────────────────────────────────────────────────────────────

macro_rules! id_newtype {
    ($(#[$doc:meta])* $name:ident) => {
        $(#[$doc])*
        #[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
        #[serde(transparent)]
        pub struct $name(pub String);

        impl $name {
            pub fn new(v: impl Into<String>) -> Self {
                Self(v.into())
            }
            pub fn as_str(&self) -> &str {
                &self.0
            }
        }

        impl std::fmt::Display for $name {
            fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                write!(f, "{}", self.0)
            }
        }

        impl From<String> for $name {
            fn from(v: String) -> Self {
                Self(v)
            }
        }

        impl From<&str> for $name {
            fn from(v: &str) -> Self {
                Self(v.to_string())
            }
        }
    };
}

id_newtype!(
    /// The durable unit of work (the product name for the `Execution` hub).
    WorkId
);
id_newtype!(
    /// A workspace / project root identity.
    ProjectId
);
id_newtype!(
    /// A chat / agent session.
    SessionId
);
id_newtype!(
    /// A single run of a work item.
    RunId
);
id_newtype!(
    /// A recorded execution step inside a work item.
    ExecutionId
);
id_newtype!(
    /// A Guard-2 authorization ticket.
    TicketId
);
id_newtype!(
    /// A (work- or effect-level) audit receipt.
    ReceiptId
);
id_newtype!(
    /// An artifact produced during work.
    ArtifactId
);
id_newtype!(
    /// A resource identity (file, sheet+cell, URL, window …) a ticket binds.
    ResourceId
);
id_newtype!(
    /// The acting agent.
    AgentId
);
id_newtype!(
    /// An extension capability id.
    CapabilityId
);
id_newtype!(
    /// A model/provider identity.
    ProviderId
);
id_newtype!(
    /// An installed/registered skill slug.
    SkillId
);
id_newtype!(
    /// A distributed-trace correlation id.
    TraceId
);

// ────────────────────────────────────────────────────────────────────────
// Hash newtypes
// ────────────────────────────────────────────────────────────────────────

id_newtype!(
    /// A content-addressable config/runtime-manifest hash.
    ConfigHash
);
id_newtype!(
    /// A canonical-args SHA-256 hash bound into a ticket.
    ArgsHash
);

// ────────────────────────────────────────────────────────────────────────
// Shared enum vocabulary
// ────────────────────────────────────────────────────────────────────────

/// The lifecycle of a durable unit of work.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WorkState {
    Pending,
    Running,
    Paused,
    Completed,
    Cancelled,
    Failed,
}

/// The phase of an execution step.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ExecutionState {
    Ready,
    Running,
    Completed,
    Failed,
    Rejected,
}

/// The guard risk band. Canonical so every crate grades an action on the
/// same scale (the `RiskLevel` re-declarations in `everyaios-guard` and
/// `everyaios-engine` are aliased to this).
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RiskLevel {
    #[default]
    Low,
    Medium,
    High,
    Critical,
}

/// The H34 autonomy level (canonical — the UI/native/Rust all agree).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AutonomyLevel {
    Sandbox,
    Ask,
    Auto,
    Maximum,
}

/// Who governs an effect: policy-auto, a human gesture, a ticket, an
/// automation task. The single source of truth for audit `authorization`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GovernanceMode {
    AgentTicket,
    AutomationTicket,
    HumanGesture,
    Policy,
    Coordinator,
}

/// The honesty status of evidence for a claim/effect.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EvidenceStatus {
    Verified,
    PartiallyComplete,
    Degraded,
    Unverifiable,
    NotVerified,
}

/// Ownership/lifecycle of a resource a ticket or audit binds.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ResourceState {
    Free,
    Owned,
    Locked,
    Released,
    Tombstone,
}

/// The retry class of an effect (doc 53 §4 — safe-retry / unsafe /
/// same-key / confirm-after-uncertain).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum IdempotencyClass {
    /// Read-only / deterministic — retry freely.
    SafeRetry,
    /// Mutates (write, send, execute) — never auto-retry.
    UnsafeRetry,
    /// Retry only with an identical idempotency key; broker dedupes.
    SameKey,
    /// Outcome unknown (network drop mid-mutation) — confirm before retry.
    ConfirmAfterUncertain,
}

impl IdempotencyClass {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::SafeRetry => "safe_retry",
            Self::UnsafeRetry => "unsafe_retry",
            Self::SameKey => "same_key",
            Self::ConfirmAfterUncertain => "confirm_after_uncertain",
        }
    }
}

// ────────────────────────────────────────────────────────────────────────
// P69.D25 — canonical id additions (Space → Project → Workspace; the
// Work → Run → Step → Effect spine; the binding/passport/event identities).
// ────────────────────────────────────────────────────────────────────────

id_newtype!(
    /// The top-level ownership/memory scope (a Space holds Projects).
    SpaceId
);
id_newtype!(
    /// A workspace root inside a project (the filesystem identity).
    WorkspaceId
);
id_newtype!(
    /// A step inside a run — the `Work → Run → Step` execution spine.
    StepId
);
id_newtype!(
    /// A single requested/performed effect.
    EffectId
);
id_newtype!(
    /// A canonical `WorkEvent` envelope identity.
    EventId
);
id_newtype!(
    /// A durable agent binding (an agent attached to a Work).
    AgentBindingId
);
id_newtype!(
    /// A context snapshot identity.
    SnapshotId
);
id_newtype!(
    /// A context passport identity (semantic hand-off on switch/spawn).
    PassportId
);

// ────────────────────────────────────────────────────────────────────────
// P69.D25 — the canonical schema vocabulary (contracts named by
// ARCH/CORE.md, ARCH/AGENT.md, ARCH/SESSION.md). The owning runtime lives in
// its subsystem crate; the *shape* lives here so no two crates drift.
// ────────────────────────────────────────────────────────────────────────

/// Version stamped into every canonical schema (envelopes, receipts). Bump
/// only on breaking changes; additive fields keep the number.
pub const CANONICAL_SCHEMA_VERSION: u32 = 1;

/// The canonical auth mode for an agent/harness row (P69.C11 — one spelling
/// for the whole stack; the TS union is a projection of this enum).
///
/// Per `ARCH/03-BYOK-KEYRINGS.md` §3.0, [`AuthMode::Local`] means **local
/// inference on this machine** (Ollama / llamafile / on-device) — it is *not*
/// "open source" (a license property orthogonal to authentication) and not
/// code for "not a subscription vendor". Anything needing user credentials
/// is [`AuthMode::ApiKey`]; anything the source is silent about is
/// [`AuthMode::Unknown`] and must render as unknown.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AuthMode {
    /// The agent uses its own subscription login (e.g. Claude via the official
    /// ACP wrapper — Anthropic co-authored; allowed, never token-harvested).
    Subscription,
    /// The agent uses the user's API keys (BYOK).
    ApiKey,
    /// Local inference on this machine (Ollama / llamafile / on-device).
    Local,
    /// No credential is required on every path we know of (e.g. an open
    /// keyless local endpoint). Distinct from `Local`.
    Keyless,
    /// The authoritative source (the ACP handshake, a manifest, or the user)
    /// has not stated one. Must render as unknown, never guessed.
    Unknown,
}

impl AuthMode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Subscription => "subscription",
            Self::ApiKey => "api_key",
            Self::Local => "local",
            Self::Keyless => "keyless",
            Self::Unknown => "unknown",
        }
    }

    /// Parse the canonical wire spelling (short form, snake_case).
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "subscription" => Some(Self::Subscription),
            "api_key" | "apikey" | "api-key" => Some(Self::ApiKey),
            "local" => Some(Self::Local),
            "keyless" => Some(Self::Keyless),
            "unknown" => Some(Self::Unknown),
            _ => None,
        }
    }
}

/// How our app drives an agent (canonical home; `everyaios-acp`'s
/// `HarnessProtocol` folds into this in P69.D1).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentProtocol {
    /// Our native engine — not an external subprocess.
    Inbuilt,
    /// Driven via ACP stdio.
    Acp,
    /// Configured + spawned against our model backend (the `ollama launch`
    /// "point this CLI at my models" path).
    ModelBackend,
}

/// The audit/governance mode of an external agent connection (`ARCH/
/// EXTERNAL-AGENTS.md` §5): every capability surface states which of these it
/// is, and audit coverage is stated per mode — never implied.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentGovernanceMode {
    /// Every effect is mediated by EveryAIOS (Guard → ticket → executor).
    GovernedMediated,
    /// Permission callbacks are mediated, but effects performed inside the
    /// agent's own process are outside the EveryAIOS audit trail.
    SelfContained,
    /// No mediation and no audit coverage; must render as such.
    NotGoverned,
}

/// The lifecycle of a durable [`AgentBinding`] (`ARCH/AGENT.md` §5.1).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BindingLifecycle {
    Active,
    Parked,
    Resuming,
    Dead,
    Unavailable,
}

/// Token/cost accounting carried per binding.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct BindingUsage {
    #[serde(default)]
    pub input_tokens: u64,
    #[serde(default)]
    pub output_tokens: u64,
    /// Cost in micro-currency units (1e-6 of the ledger's unit) — integers,
    /// never floats on a wire boundary.
    #[serde(default)]
    pub cost_micros: u64,
}

/// The canonical definition of an agent (P69.D1: `everyaios-agents` owns the
/// registry; this is the record shape).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AgentDefinition {
    pub id: AgentId,
    pub name: String,
    #[serde(default)]
    pub description: String,
    pub protocol: AgentProtocol,
    pub auth_mode: AuthMode,
    /// The registry/picker default (our inbuilt engine).
    #[serde(default)]
    pub is_default: bool,
    #[serde(default)]
    pub capabilities: Vec<CapabilityId>,
    /// Extension mechanisms the adapter negotiated (hook names etc.) — data,
    /// never kernel branches (`ARCH/AGENT.md` §5.3).
    #[serde(default)]
    pub extension_mechanisms: Vec<String>,
}

/// A durable agent binding — an agent attached to a Work. The binding, not
/// the process, is the unit that survives a restart (`ARCH/AGENT.md` §5.1);
/// `provider_session_id` is deliberately distinct from the EveryAIOS
/// [`SessionId`].
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AgentBinding {
    pub binding_id: AgentBindingId,
    pub agent_id: AgentId,
    pub work_id: WorkId,
    pub session_id: SessionId,
    /// The agent's own session identity (resume handle). Never the EveryAIOS
    /// session id — conflating them is how resume breaks.
    #[serde(default)]
    pub provider_session_id: Option<String>,
    pub governance: AgentGovernanceMode,
    pub lifecycle: BindingLifecycle,
    #[serde(default)]
    pub capability_manifest: Vec<CapabilityId>,
    #[serde(default)]
    pub usage: BindingUsage,
    #[serde(default)]
    pub last_event_seq: u64,
    /// Handle into agent-private state owned by the adapter (opaque to us).
    #[serde(default)]
    pub private_state_ref: Option<String>,
}

/// The canonical effect request: every mutating operation reduces to this
/// shape before it reaches Guard and the executor (`ARCH/CORE.md` §7).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct EffectRequest {
    pub effect_id: EffectId,
    #[serde(default)]
    pub work_id: Option<WorkId>,
    #[serde(default)]
    pub run_id: Option<RunId>,
    #[serde(default)]
    pub step_id: Option<StepId>,
    #[serde(default)]
    pub binding_id: Option<AgentBindingId>,
    pub capability_id: CapabilityId,
    pub operation: String,
    pub args_hash: ArgsHash,
    #[serde(default)]
    pub resources: Vec<ResourceId>,
    pub idempotency: IdempotencyClass,
    /// Authorization provenance (agent ticket vs human gesture vs policy) —
    /// the corrected form, never "everything is ticketed".
    pub requested_by: GovernanceMode,
    pub risk: RiskLevel,
    pub created_at_ms: u64,
    #[serde(default)]
    pub audit_seq: Option<u64>,
}

/// A capability request (scoped, bounded) — the input to the capability
/// resolver/broker; a grant is materialized as an opaque handle, never a
/// secret (`ARCH/CAPABILITIES.md`).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CapabilityRequest {
    pub capability_id: CapabilityId,
    #[serde(default)]
    pub binding_id: Option<AgentBindingId>,
    #[serde(default)]
    pub work_id: Option<WorkId>,
    #[serde(default)]
    pub scopes: Vec<String>,
    #[serde(default)]
    pub reason: Option<String>,
    #[serde(default)]
    pub expires_at_ms: Option<u64>,
}

/// One node of a context snapshot (a source event the model can see, an
/// injected system block, a replacement, or a by-reference pointer).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ContextNode {
    pub node_id: String,
    /// Where the node came from (`user`, `assistant`, `tool`, `system`, …).
    pub source: String,
    /// Visible to the model vs retained-but-not-injected.
    #[serde(default)]
    pub visible: bool,
    #[serde(default)]
    pub tokens: u64,
    /// If this node replaces earlier content, the node it replaced.
    #[serde(default)]
    pub replacement: Option<String>,
    /// If the node is a by-reference pointer (pass-by-reference), its handle.
    #[serde(default)]
    pub reference: Option<String>,
}

/// The durable projection of what was in front of a binding at a point in
/// time (`ARCH/CONTEXT.md`): source events, visible/injected nodes,
/// replacements, references, token estimate, and the cache boundary.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ContextSnapshot {
    pub snapshot_id: SnapshotId,
    pub work_id: WorkId,
    #[serde(default)]
    pub binding_id: Option<AgentBindingId>,
    /// The WorkEvent sequence this snapshot reflects.
    pub event_seq: u64,
    #[serde(default)]
    pub nodes: Vec<ContextNode>,
    #[serde(default)]
    pub token_estimate: u64,
    /// Everything at/ below this sequence is cache-stable prefix.
    pub cache_boundary_seq: u64,
    #[serde(default)]
    pub compacted: bool,
}

/// A bounded semantic continuation state for a binding switch or child spawn
/// (`ARCH/AGENT.md` §5.2) — execution provenance plus continuation, **never a
/// transcript**.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ContextPassport {
    pub passport_id: PassportId,
    pub work_id: WorkId,
    #[serde(default)]
    pub from_binding: Option<AgentBindingId>,
    #[serde(default)]
    pub to_binding: Option<AgentBindingId>,
    /// Why the passport was generated (switch / child spawn / resume).
    pub reason: String,
    /// Bounded semantic continuation text.
    #[serde(default)]
    pub continuation: String,
    /// Size guard — passports are bounded, full stop.
    #[serde(default)]
    pub byte_len: u32,
    pub created_at_ms: u64,
}

/// The versioned canonical event envelope (`ARCH/WORK.md` §canonical event
/// vocabulary). `kind` is one of the 30 canonical event names; the envelope
/// carries identity, ordering, and schema version so every writer and every
/// projection agree.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct EventEnvelope {
    pub event_id: EventId,
    /// Monotonic per-Work sequence.
    pub seq: u64,
    pub work_id: WorkId,
    #[serde(default)]
    pub run_id: Option<RunId>,
    #[serde(default)]
    pub step_id: Option<StepId>,
    /// Canonical event name (e.g. `work.started`, `effect.committed`).
    pub kind: String,
    #[serde(default)]
    pub payload: serde_json::Value,
    pub at_ms: u64,
    #[serde(default = "default_schema_version")]
    pub schema_version: u32,
}

fn default_schema_version() -> u32 {
    CANONICAL_SCHEMA_VERSION
}

/// Uncertainty classification of an attempted effect (`ARCH/RECOVERY.md`):
/// approved-but-unattempted / outcome-unknown must never read as complete.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EffectUncertainty {
    /// The outcome is known.
    None,
    /// The attempt may or may not have landed (e.g. transport dropped).
    UnknownOutcome,
    /// The effect landed with a gap (partial write, skipped step).
    Partial,
}

/// The canonical receipt view for one effect (P47.5's `EffectReceipt` shape,
/// schema-home here so every receipt writer emits the same view).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct EffectReceiptView {
    pub receipt_id: ReceiptId,
    pub effect_id: EffectId,
    #[serde(default)]
    pub work_id: Option<WorkId>,
    /// Whether the effect was authorized (ticket or trusted gesture).
    pub authorized: bool,
    #[serde(default)]
    pub resource: Option<ResourceId>,
    #[serde(default)]
    pub before_ref: Option<String>,
    #[serde(default)]
    pub after_ref: Option<String>,
    #[serde(default)]
    pub diff_hash: Option<String>,
    #[serde(default)]
    pub rollback_ref: Option<String>,
    #[serde(default)]
    pub has_gap: bool,
    #[serde(default = "default_uncertainty")]
    pub uncertainty: EffectUncertainty,
}

fn default_uncertainty() -> EffectUncertainty {
    EffectUncertainty::None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn newtype_ids_are_opaque_and_round_trip() {
        let w = WorkId::new("w-1");
        assert_eq!(w.as_str(), "w-1");
        assert_eq!(w.to_string(), "w-1");
        let json = serde_json::to_string(&w).unwrap();
        assert_eq!(json, "\"w-1\""); // transparent: serializes as the string
        let back: WorkId = serde_json::from_str(&json).unwrap();
        assert_eq!(back, w);
        // A WorkId is not comparable to a TicketId (compile-time safety).
        // (No runtime assertion needed — this is a type-level guarantee.)
    }

    #[test]
    fn every_id_serializes_transparent() {
        for s in [
            serde_json::to_string(&WorkId::new("x")).unwrap(),
            serde_json::to_string(&TicketId::new("t")).unwrap(),
            serde_json::to_string(&ReceiptId::new("r")).unwrap(),
            serde_json::to_string(&ConfigHash::new("c")).unwrap(),
        ] {
            assert!(s.starts_with('"') && s.ends_with('"'));
        }
    }

    #[test]
    fn canonical_auth_mode_has_one_spelling() {
        for (mode, s) in [
            (AuthMode::Subscription, "subscription"),
            (AuthMode::ApiKey, "api_key"),
            (AuthMode::Local, "local"),
            (AuthMode::Keyless, "keyless"),
            (AuthMode::Unknown, "unknown"),
        ] {
            assert_eq!(mode.as_str(), s);
            assert_eq!(AuthMode::parse(s), Some(mode));
        }
        // The legacy TS `_cli` spelling is tolerated on read, never emitted.
        assert_eq!(AuthMode::parse("api_key_cli"), None);
    }

    #[test]
    fn spine_contracts_round_trip() {
        let req = EffectRequest {
            effect_id: EffectId::new("e-1"),
            work_id: Some(WorkId::new("w-1")),
            run_id: Some(RunId::new("r-1")),
            step_id: Some(StepId::new("s-1")),
            binding_id: None,
            capability_id: CapabilityId::new("office.docx_patch"),
            operation: "patch".into(),
            args_hash: ArgsHash::new("abc"),
            resources: vec![ResourceId::new("file/doc.docx")],
            idempotency: IdempotencyClass::UnsafeRetry,
            requested_by: GovernanceMode::AgentTicket,
            risk: RiskLevel::High,
            created_at_ms: 1,
            audit_seq: None,
        };
        let json = serde_json::to_string(&req).unwrap();
        assert!(json.contains("\"agent_ticket\""));
        let back: EffectRequest = serde_json::from_str(&json).unwrap();
        assert_eq!(back, req);

        let env = EventEnvelope {
            event_id: EventId::new("ev-1"),
            seq: 7,
            work_id: WorkId::new("w-1"),
            run_id: None,
            step_id: None,
            kind: "effect.committed".into(),
            payload: serde_json::json!({ "capability": "ok" }),
            at_ms: 42,
            schema_version: CANONICAL_SCHEMA_VERSION,
        };
        let back: EventEnvelope =
            serde_json::from_str(&serde_json::to_string(&env).unwrap()).unwrap();
        assert_eq!(back, env);

        let binding = AgentBinding {
            binding_id: AgentBindingId::new("b-1"),
            agent_id: AgentId::new("opencode"),
            work_id: WorkId::new("w-1"),
            session_id: SessionId::new("s-1"),
            provider_session_id: Some("agent-side-42".into()),
            governance: AgentGovernanceMode::SelfContained,
            lifecycle: BindingLifecycle::Parked,
            capability_manifest: vec![],
            usage: BindingUsage::default(),
            last_event_seq: 3,
            private_state_ref: None,
        };
        assert_ne!(binding.session_id.as_str(), binding.provider_session_id.clone().unwrap());
        let _ = serde_json::to_string(&binding).unwrap();
    }

    #[test]
    fn enums_round_trip_and_are_versioned_names() {
        let lvl: RiskLevel = serde_json::from_str("\"critical\"").unwrap();
        assert_eq!(lvl, RiskLevel::Critical);
        let act: AutonomyLevel = serde_json::from_str("\"maximum\"").unwrap();
        assert_eq!(act, AutonomyLevel::Maximum);
        assert_eq!(IdempotencyClass::UnsafeRetry.as_str(), "unsafe_retry");
    }
}
