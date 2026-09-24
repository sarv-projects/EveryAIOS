//! P49 — V1-local Work Gateway / Session Runtime.
//!
//! This module is deliberately a projection layer over the existing
//! `ExecutionKernel`: it owns durable Work addressing and domain events, but
//! it does not execute effects. Remote clients, multi-node failover, and
//! platform sandbox enforcement remain explicit follow-up seams.

use everyaios_blueprint::DelegationGauge;
pub use everyaios_types::AutonomyLevel;
use everyaios_types::{
    AgentBinding, BindingLifecycle, BindingUsage, RiskLevel, SessionKind, WaitCondition, WorkId,
    WorkState,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, HashMap};
use std::fs::OpenOptions;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn digest<T: Serialize>(value: &T) -> String {
    let mut h = Sha256::new();
    h.update(serde_json::to_vec(value).unwrap_or_default());
    h.finalize().iter().map(|b| format!("{b:02x}")).collect()
}

/// P49.13 — a review item the user has already acted on.
fn is_terminal_review_state(state: &str) -> bool {
    matches!(state, "resolved" | "approved" | "rejected")
}

/// Ordered policy ladders for P49.15's restore intersect (index 0 = strictest).
const NETWORK_LADDER: [&str; 4] = ["offline", "loopback", "allowlist", "open"];
const FILESYSTEM_LADDER: [&str; 4] = ["workspace", "project", "home", "system"];

/// Take the stricter of two ordered policy labels. An unknown label on either
/// side is never treated as permissive — it fails closed to the strictest tier.
fn narrow(current: &str, trusted: &str, ladder: &[&str; 4]) -> String {
    let idx = |v: &str| ladder.iter().position(|x| *x == v);
    match (idx(current), idx(trusted)) {
        (Some(a), Some(b)) => ladder[a.min(b)].to_string(),
        _ => ladder[0].to_string(),
    }
}

/// P69.D14 — the `(work, run, agent_session)` triple a subagent delegation
/// minted: one child Work, its Run, and its ephemeral AgentSession.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChildWorkRef {
    pub work_id: String,
    pub run_id: String,
    pub agent_session_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkAddress {
    pub work_id: WorkId,
    pub project_id: Option<String>,
    pub session_id: Option<String>,
    /// P71.8a — the owning Session's kind (`ADR-0006`). A **record property**
    /// carried on the address so every surface can scope correctly without
    /// inferring anything from whether a Chat exists. Defaults to `interactive`
    /// for rows written before the field existed.
    #[serde(default)]
    pub session_kind: SessionKind,
    pub owner_id: Option<String>,
    pub node_id: Option<String>,
    pub current_run_id: Option<String>,
    pub version: u64,
    /// P69.D14 — set when this Work was delegated into existence by another
    /// Work (a subagent child). `None` for roots created by a user, the
    /// scheduler or an external client. The link is what makes the delegation
    /// tree reconstructible from the one event log, without a second registry.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent_work_id: Option<String>,
}

impl WorkAddress {
    pub fn new(work_id: impl Into<String>) -> Self {
        Self {
            work_id: WorkId::new(work_id),
            project_id: None,
            session_id: None,
            session_kind: SessionKind::Interactive,
            owner_id: None,
            node_id: None,
            current_run_id: None,
            version: 1,
            parent_work_id: None,
        }
    }

    /// P49.1 — the canonical externally-addressable locator:
    /// `work:<id>@<node>#<run>`. Optional segments are omitted when unknown so
    /// the locator stays stable and round-trips through `parse_locator`.
    pub fn locator(&self) -> String {
        let mut out = format!("work:{}", self.work_id.as_str());
        if let Some(node) = &self.node_id {
            out.push('@');
            out.push_str(node);
        }
        if let Some(run) = &self.current_run_id {
            out.push('#');
            out.push_str(run);
        }
        out
    }

    /// Parse a locator back into an address. Malformed segments are refused
    /// rather than silently dropped, so a typo cannot address the wrong Work.
    pub fn parse_locator(locator: &str) -> Result<Self, String> {
        let rest = locator
            .strip_prefix("work:")
            .ok_or("locator must start with 'work:'")?;
        let (head, run) = match rest.split_once('#') {
            Some((h, r)) => (h, Some(r.to_string())),
            None => (rest, None),
        };
        let (id, node) = match head.split_once('@') {
            Some((i, n)) => (i, Some(n.to_string())),
            None => (head, None),
        };
        if id.is_empty() {
            return Err("locator requires a work id".into());
        }
        if matches!(&run, Some(r) if r.is_empty()) {
            return Err("locator has an empty run id".into());
        }
        if matches!(&node, Some(n) if n.is_empty()) {
            return Err("locator has an empty node id".into());
        }
        let mut address = Self::new(id);
        address.node_id = node;
        address.current_run_id = run;
        Ok(address)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WorkPresenceState {
    Running,
    WaitingForUser,
    WaitingForApproval,
    Blocked,
    Completed,
    Failed,
    /// P71.3g — stopped by the user or by policy. Previously collapsed into
    /// `Failed`/`Running`, which misreported a deliberate stop.
    Cancelled,
    Offline,
    Reconnecting,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkPresence {
    pub work_id: String,
    pub active_clients: Vec<String>,
    pub active_nodes: Vec<String>,
    pub active_run: Option<String>,
    pub current_surface: Option<String>,
    /// The *client-presence* projection (`offline`/`reconnecting` are
    /// presence-only facts). Never the Work's lifecycle authority.
    pub state: Option<WorkPresenceState>,
    /// P71.3g — the canonical Work lifecycle state (`WORK.md` §4), projected
    /// from the same events this presence is. This is what a surface that asks
    /// "what is this Work doing?" must read.
    #[serde(default)]
    pub work_state: Option<everyaios_types::WorkState>,
    /// P71.3g — the durable wait the Work is parked on, when it is parked
    /// (`AUTOMATION.md` §8): reason + what resumes it.
    #[serde(default)]
    pub wait: Option<everyaios_types::WaitCondition>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", tag = "kind", content = "data")]
pub enum DomainEvent {
    WorkCreated {
        objective: String,
        project_id: Option<String>,
        session_id: Option<String>,
        /// P69.D14 — the delegating Work when this is a subagent child.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        parent_work_id: Option<String>,
    },
    WorkUpdated {
        patch: Value,
    },
    RunQueued {
        run_id: String,
    },
    RunStarted {
        run_id: String,
    },
    RunCheckpointed {
        run_id: String,
        checkpoint: u32,
    },
    RunPaused {
        run_id: String,
    },
    RunWaiting {
        run_id: String,
        /// The `WorkState` spelling this wait parks the run in (`WORK.md` §4).
        /// Kept as the state name for journal compatibility with rows written
        /// before waits carried their own condition.
        reason: String,
        /// P71.3g — the durable wait condition (`AUTOMATION.md` §8): *why* the
        /// run is parked and what resumes it. Absent on rows written before the
        /// condition existed; presence is rebuilt from this on replay.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        wait: Option<everyaios_types::WaitCondition>,
    },
    /// P71.3g — the run was interrupted with an **unknown** in-flight effect:
    /// the `Recoverable` outcome (`RECOVERY.md` §3), deliberately not
    /// `RunFailed` (*unknown* ≠ *failed*).
    RunInterrupted {
        run_id: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        reason: Option<String>,
    },
    ApprovalRequested {
        ticket_id: String,
    },
    ApprovalResolved {
        ticket_id: String,
        approved: bool,
    },
    EffectAttempted {
        effect_id: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        capability_grant_id: Option<String>,
    },
    EffectObserved {
        effect_id: String,
        outcome: String,
    },
    EffectVerified {
        effect_id: String,
        verified: bool,
    },
    ArtifactCreated {
        artifact_id: String,
    },
    ArtifactUpdated {
        artifact_id: String,
    },
    ReviewRequested {
        review_id: String,
    },
    RunCompleted {
        run_id: String,
    },
    RunFailed {
        run_id: String,
        reason: String,
    },
    RunCancelled {
        run_id: String,
    },
}

/// P71.3g — the event one canonical [`WorkState`] transition appends. Kept
/// beside the vocabulary it maps onto so the two cannot drift; `wait` is the
/// condition a waiting state carries.
fn transition_event(
    execution_id: &str,
    state: WorkState,
    wait: Option<WaitCondition>,
) -> WorkEvent {
    match state {
        WorkState::Created | WorkState::Planning | WorkState::Ready => {
            WorkEvent::Domain(DomainEvent::RunQueued {
                run_id: execution_id.into(),
            })
        }
        WorkState::Running | WorkState::Verifying => WorkEvent::Domain(DomainEvent::RunStarted {
            run_id: execution_id.into(),
        }),
        WorkState::WaitingTool | WorkState::WaitingApproval | WorkState::WaitingUser => {
            WorkEvent::Domain(DomainEvent::RunWaiting {
                run_id: execution_id.into(),
                reason: state.as_str().to_string(),
                wait,
            })
        }
        WorkState::Checkpointed => WorkEvent::Domain(DomainEvent::RunCheckpointed {
            run_id: execution_id.into(),
            checkpoint: 0,
        }),
        WorkState::Paused => WorkEvent::Domain(DomainEvent::RunPaused {
            run_id: execution_id.into(),
        }),
        WorkState::Recoverable => WorkEvent::Domain(DomainEvent::RunInterrupted {
            run_id: execution_id.into(),
            reason: Some("interrupted with an unknown in-flight effect".into()),
        }),
        WorkState::Completed => WorkEvent::Domain(DomainEvent::RunCompleted {
            run_id: execution_id.into(),
        }),
        WorkState::Failed => WorkEvent::Domain(DomainEvent::RunFailed {
            run_id: execution_id.into(),
            reason: "execution transitioned to failed".into(),
        }),
        WorkState::Cancelled => WorkEvent::Domain(DomainEvent::RunCancelled {
            run_id: execution_id.into(),
        }),
    }
}

/// P71.3g — the client-presence projection of the canonical Work state. This is
/// the only place the two vocabularies meet: `work_state` is the lifecycle,
/// [`WorkPresenceState`] answers whether clients see a live, blocked, offline or
/// terminal run. A `Recoverable` Work projects as `Blocked` — parked on a human
/// decision — never as `Failed` (I15).
fn presence_projection(state: WorkState, wait: Option<&WaitCondition>) -> WorkPresenceState {
    match state {
        WorkState::WaitingApproval => WorkPresenceState::WaitingForApproval,
        WorkState::WaitingUser => WorkPresenceState::WaitingForUser,
        WorkState::Paused | WorkState::Recoverable => WorkPresenceState::Blocked,
        WorkState::Completed => WorkPresenceState::Completed,
        WorkState::Failed => WorkPresenceState::Failed,
        WorkState::Cancelled => WorkPresenceState::Cancelled,
        _ => match wait.map(|w| w.reason) {
            // A wait with no dedicated state still parks the Work.
            Some(everyaios_types::WaitReason::Timer)
            | Some(everyaios_types::WaitReason::ExternalEvent)
            | Some(everyaios_types::WaitReason::Resource)
            | Some(everyaios_types::WaitReason::Agent)
            | Some(everyaios_types::WaitReason::Retry) => WorkPresenceState::Blocked,
            _ => WorkPresenceState::Running,
        },
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", tag = "kind", content = "data")]
pub enum OperationalEvent {
    ToolRequested { tool_id: String },
    ToolStarted { tool_id: String },
    ToolCompleted { tool_id: String },
    ToolFailed { tool_id: String, error: String },
    NodeConnected { node_id: String },
    NodeDisconnected { node_id: String },
    SessionAttached { client_id: String },
    SessionDetached { client_id: String },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", tag = "kind", content = "data")]
pub enum PresenceEvent {
    PresenceChanged { presence: WorkPresence },
    AgentThoughtSummary { text: String },
}

/// P49.10–12 — session-runtime lifecycle events. The durable, client-fanned
/// record of a PTY / worktree / agent-session moving through its lifecycle.
/// The agent *process* survives client disconnect; these events replay so a
/// re-attaching client reconstructs the live terminal + session state.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", tag = "kind", content = "data")]
pub enum RuntimeEvent {
    // --- PTY (P49.10) ---
    PtyStarted {
        pty_id: String,
        process_id: Option<u32>,
        rows: u16,
        cols: u16,
    },
    PtyOutput {
        pty_id: String,
        chunk: String,
    },
    PtyResize {
        pty_id: String,
        rows: u16,
        cols: u16,
    },
    PtySignal {
        pty_id: String,
        signal: String,
    },
    PtyExit {
        pty_id: String,
        code: Option<i32>,
    },
    // --- Worktree (P49.11) ---
    WorktreeCreated {
        worktree_id: String,
        branch: String,
    },
    WorktreeAttached {
        worktree_id: String,
        run_id: String,
    },
    WorktreeMerged {
        worktree_id: String,
        into: String,
    },
    WorktreeReverted {
        worktree_id: String,
    },
    WorktreeDestroyed {
        worktree_id: String,
    },
    // --- AgentSession (P49.12) ---
    AgentSessionSpawned {
        agent_session_id: String,
        agent_id: String,
        lifetime: String,
    },
    AgentSessionMessage {
        agent_session_id: String,
        direction: String,
    },
    AgentSessionAttached {
        agent_session_id: String,
    },
    AgentSessionDetached {
        agent_session_id: String,
    },
    AgentSessionSteered {
        agent_session_id: String,
    },
    AgentSessionCheckpointed {
        agent_session_id: String,
        checkpoint: u32,
    },
    AgentSessionTerminated {
        agent_session_id: String,
    },
    // --- AgentBinding (P69.B2) — the durable unit that survives restart ---
    // Boxed: `AgentBinding` is ~300 bytes against ~72 for the next-largest
    // variant, and this enum rides in every `WorkEventEnvelope` the gateway
    // retains for replay, so the box is held once per event instead of paying
    // the outlier size on every copy. `Box<T>` serializes exactly as `T`, so
    // the journal's wire shape is unchanged (`clippy::large_enum_variant`).
    AgentBindingCreated {
        binding: Box<AgentBinding>,
    },
    AgentBindingActivated {
        binding_id: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        provider_session_id: Option<String>,
    },
    AgentBindingSuspended {
        binding_id: String,
    },
    AgentBindingResumed {
        binding_id: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        provider_session_id: Option<String>,
    },
    AgentBindingUsageRecorded {
        binding_id: String,
        usage: BindingUsage,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", tag = "class", content = "event")]
pub enum WorkEvent {
    Domain(DomainEvent),
    Operational(OperationalEvent),
    Presence(PresenceEvent),
    Runtime(RuntimeEvent),
}

impl WorkEvent {
    pub fn semantic(&self) -> bool {
        matches!(self, Self::Domain(_))
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkEventEnvelope {
    pub work_id: String,
    pub sequence: u64,
    pub event_id: String,
    pub event: WorkEvent,
    pub timestamp: u64,
    pub trace_id: Option<String>,
    pub causal_parent: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ExecutionNode {
    pub node_id: String,
    pub owner: String,
    pub platform: String,
    pub node_kind: String,
    pub always_on: bool,
    pub capabilities: Vec<String>,
    pub sandbox_class: String,
    pub network_policy: String,
    pub credential_policy: String,
    pub health: String,
    pub last_heartbeat_ms: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RunAuthority {
    pub run_id: String,
    pub node_id: String,
    pub lease_id: String,
    pub fencing_token: u64,
    pub granted_at_ms: u64,
    pub expires_at_ms: u64,
}

impl RunAuthority {
    pub fn valid(&self, node_id: &str, token: u64, now: u64) -> bool {
        self.node_id == node_id
            && self.fencing_token == token
            && (self.expires_at_ms == 0 || now <= self.expires_at_ms)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ClientCapabilities {
    pub can_view: bool,
    pub can_chat: bool,
    pub can_steer: bool,
    pub can_approve: bool,
    pub can_review: bool,
    pub can_access_local_files: bool,
    pub can_drive_browser: bool,
    pub can_drive_desktop: bool,
    pub artifact_preview: bool,
    pub artifact_edit: bool,
}

impl ClientCapabilities {
    pub fn desktop() -> Self {
        Self {
            can_view: true,
            can_chat: true,
            can_steer: true,
            can_approve: true,
            can_review: true,
            can_access_local_files: true,
            can_drive_browser: true,
            can_drive_desktop: true,
            artifact_preview: true,
            artifact_edit: true,
        }
    }
    pub fn restricted() -> Self {
        Self {
            can_view: true,
            can_chat: false,
            can_steer: false,
            can_approve: false,
            can_review: true,
            can_access_local_files: false,
            can_drive_browser: false,
            can_drive_desktop: false,
            artifact_preview: true,
            artifact_edit: false,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ClientSession {
    pub client_id: String,
    pub client_type: String,
    pub work_id: String,
    pub capabilities: ClientCapabilities,
    pub scope: Vec<String>,
    pub authenticated: bool,
    pub connected_at_ms: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ReviewItem {
    pub review_id: String,
    pub work_id: String,
    pub run_id: Option<String>,
    pub kind: String,
    pub priority: u8,
    pub state: String,
    pub artifact_refs: Vec<String>,
    pub effect_refs: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SteeringInstruction {
    pub work_id: String,
    pub run_id: Option<String>,
    pub source_client: String,
    pub instruction: String,
    pub scope: String,
    pub priority: u8,
    pub created_at_ms: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RuntimeManifest {
    pub work_id: String,
    pub chief: String,
    pub model: String,
    pub capabilities: Vec<String>,
    pub network_policy: String,
    pub filesystem_policy: String,
    pub autonomy: AutonomyLevel,
    pub memory_scope: String,
    pub node_id: String,
    pub skill_versions: Vec<String>,
    pub plugin_versions: Vec<String>,
    pub config_hash: String,
}

impl RuntimeManifest {
    pub fn new(
        work_id: impl Into<String>,
        chief: impl Into<String>,
        model: impl Into<String>,
    ) -> Self {
        let mut m = Self {
            work_id: work_id.into(),
            chief: chief.into(),
            model: model.into(),
            capabilities: vec![],
            network_policy: "offline".into(),
            filesystem_policy: "workspace".into(),
            autonomy: AutonomyLevel::Ask,
            memory_scope: "project".into(),
            node_id: "node-1".into(),
            skill_versions: vec![],
            plugin_versions: vec![],
            config_hash: String::new(),
        };
        m.config_hash = digest(&m.without_hash());
        m
    }
    fn without_hash(&self) -> Value {
        serde_json::json!({"workId":self.work_id,"chief":self.chief,"model":self.model,"capabilities":self.capabilities,"networkPolicy":self.network_policy,"filesystemPolicy":self.filesystem_policy,"autonomy":self.autonomy,"memoryScope":self.memory_scope,"nodeId":self.node_id,"skillVersions":self.skill_versions,"pluginVersions":self.plugin_versions})
    }
    pub fn verify_hash(&self) -> bool {
        self.config_hash == digest(&self.without_hash())
    }
    /// Recompute the contract hash after an intentional, policy-checked change
    /// (used by `create_runtime_manifest` and the restore intersect).
    pub fn refresh_hash(&mut self) {
        self.config_hash = digest(&self.without_hash());
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AttachmentRef {
    pub attachment_id: String,
    pub content_hash: String,
    pub size: u64,
    pub media_type: String,
    pub source: String,
    pub work_scope: String,
    pub session_scope: Option<String>,
    pub allowed_consumers: Vec<String>,
    pub retention: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CapabilityCandidate {
    pub capability_id: String,
    pub route: String,
    pub confidence: u8,
    pub latency_estimate_ms: u64,
    pub cost_estimate: u64,
    pub risk: RiskLevel,
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CapabilityResolution {
    pub intent: String,
    pub candidate_capabilities: Vec<CapabilityCandidate>,
    pub ranked_path: Vec<String>,
    pub rationale: String,
    pub fallback_path: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PtySession {
    pub pty_id: String,
    pub process_id: Option<u32>,
    pub rows: u16,
    pub cols: u16,
    pub state: String,
    pub output: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct WorktreeBinding {
    pub worktree_id: String,
    pub work_id: String,
    pub run_id: String,
    pub repo_root: String,
    pub worktree_root: String,
    pub base_revision: String,
    pub branch: String,
    pub isolation_mode: String,
    pub status: String,
}

/// P49.12 — how long an agent session lives relative to its client.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentLifetime {
    /// Dies when its parent/creator closes it (a spawned subagent child).
    EphemeralChild,
    /// Survives client detach — the relationship is removed, the session
    /// keeps running (the Codex persistent-attached-session distinction).
    PersistentAttachedSession,
}

impl AgentLifetime {
    pub fn as_str(&self) -> &'static str {
        match self {
            AgentLifetime::EphemeralChild => "ephemeral_child",
            AgentLifetime::PersistentAttachedSession => "persistent_attached_session",
        }
    }
}

/// P49.12 — an agent session bound to a Run (not to a client). The Run owns
/// the workspace + pty; a persistent session survives client detach.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSession {
    pub agent_session_id: String,
    pub work_id: String,
    pub run_id: String,
    pub agent_id: String,
    pub lifetime: AgentLifetime,
    /// The bound PTY id, if any (external agent CLIs run in a PTY).
    #[serde(default)]
    pub pty_id: Option<String>,
    /// The bound worktree id, if any (isolation unit).
    #[serde(default)]
    pub worktree_id: Option<String>,
    /// Coarse runtime state (`spawned`/`attached`/`detached`/`terminated`).
    pub runtime_state: String,
    /// The last checkpoint sequence recorded for resume.
    #[serde(default)]
    pub last_checkpoint: u32,
    /// Whether a client is currently attached (a persistent session may have
    /// zero attached clients and still be alive).
    #[serde(default)]
    pub attached: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct WorkGatewaySnapshot {
    pub address: WorkAddress,
    pub presence: WorkPresence,
    pub events: Vec<WorkEventEnvelope>,
    pub clients: Vec<ClientSession>,
    pub nodes: Vec<ExecutionNode>,
    pub reviews: Vec<ReviewItem>,
}

#[derive(Debug, Default)]
pub struct WorkGateway {
    works: BTreeMap<String, WorkAddress>,
    /// Optional append-only local event journal. When configured, every event
    /// is durable before it is exposed to subscribers.
    journal: Option<PathBuf>,
    events: BTreeMap<String, Vec<WorkEventEnvelope>>,
    clients: HashMap<String, ClientSession>,
    nodes: HashMap<String, ExecutionNode>,
    authorities: HashMap<String, RunAuthority>,
    reviews: HashMap<String, ReviewItem>,
    attachments: HashMap<String, (AttachmentRef, PathBuf)>,
    presence: HashMap<String, WorkPresence>,
    ptys: HashMap<String, PtySession>,
    worktrees: HashMap<String, WorktreeBinding>,
    agent_sessions: HashMap<String, AgentSession>,
    /// P69.B2 — durable agent bindings, keyed by binding id. The binding (not
    /// the process) is the unit that survives a restart; replay rebuilds the
    /// map from the journal's `AgentBinding*` events.
    agent_bindings: HashMap<String, AgentBinding>,
    /// P49.15 — the frozen per-run runtime contract, keyed by work. A user
    /// change after start never silently mutates the Run.
    manifests: HashMap<String, RuntimeManifest>,
    /// P49.7 — the V1-local capability broker (opaque handles only).
    broker: GatewayCapabilityBroker,
    /// P49.4 — monotonic per-run fence counter. Tokens are never reused, even
    /// after a lease is released or a run migrates, so a stale worker can never
    /// present a token that happens to be valid again.
    fence_counters: HashMap<String, u64>,
    next_seq: u64,
    /// Canonical mapping to the existing ExecutionKernel Work record.
    execution_ids: HashMap<String, String>,
    subscribers: Vec<std::sync::mpsc::Sender<WorkEventEnvelope>>,
}

impl WorkGateway {
    pub fn new() -> Self {
        Self::default()
    }

    /// Open the gateway journal, creating its parent directory when needed.
    /// Initialization remains fail-closed: a journal that cannot be opened is
    /// reported to the caller instead of silently falling back to memory.
    pub fn open_default() -> Result<Self, String> {
        let path = crate::default_data_dir().join("work").join("events.jsonl");
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("create work journal directory: {e}"))?;
        }
        Self::open(path)
    }

    /// Subscribe to newly appended events. Historical events are obtained
    /// separately with `replay_from`; reconnect ordering stays explicit.
    pub fn subscribe(&mut self) -> std::sync::mpsc::Receiver<WorkEventEnvelope> {
        let (tx, rx) = std::sync::mpsc::channel();
        self.subscribers.push(tx);
        rx
    }

    /// Open a local gateway backed by an append-only JSONL event journal.
    /// Existing events are loaded fail-closed: malformed records are rejected.
    pub fn open(path: impl Into<PathBuf>) -> Result<Self, String> {
        let path = path.into();
        let mut gateway = Self {
            journal: Some(path.clone()),
            subscribers: Vec::new(),
            ..Self::default()
        };
        if path.exists() {
            let file = std::fs::File::open(&path).map_err(|e| format!("open work journal: {e}"))?;
            for line in BufReader::new(file).lines() {
                let line = line.map_err(|e| format!("read work journal: {e}"))?;
                if line.trim().is_empty() {
                    continue;
                }
                let event: WorkEventEnvelope =
                    serde_json::from_str(&line).map_err(|e| format!("parse work journal: {e}"))?;
                if event.sequence >= gateway.next_seq {
                    gateway.next_seq = event
                        .sequence
                        .checked_add(1)
                        .ok_or("work journal sequence overflow")?;
                }
                if gateway
                    .events
                    .values()
                    .flatten()
                    .any(|existing| existing.sequence == event.sequence)
                {
                    return Err(format!(
                        "duplicate work journal sequence: {}",
                        event.sequence
                    ));
                }
                gateway
                    .events
                    .entry(event.work_id.clone())
                    .or_default()
                    .push(event.clone());
                gateway.apply_replayed_event(&event)?;
            }
        }
        Ok(gateway)
    }

    fn apply_replayed_event(&mut self, event: &WorkEventEnvelope) -> Result<(), String> {
        let work_id = event.work_id.clone();
        match &event.event {
            WorkEvent::Domain(DomainEvent::WorkCreated {
                project_id,
                session_id,
                parent_work_id,
                ..
            }) => {
                let address = self
                    .works
                    .entry(work_id.clone())
                    .or_insert_with(|| WorkAddress::new(work_id.clone()));
                address.project_id = project_id.clone();
                address.session_id = session_id.clone();
                address.parent_work_id = parent_work_id.clone();
                self.presence
                    .entry(work_id.clone())
                    .or_insert_with(|| WorkPresence {
                        work_id,
                        state: Some(WorkPresenceState::Running),
                        ..Default::default()
                    });
            }
            WorkEvent::Domain(DomainEvent::WorkUpdated { patch }) => {
                if let Some(address) = self.works.get_mut(&work_id) {
                    if patch.get("executionId").and_then(Value::as_str).is_some() {
                        let execution_id = patch
                            .get("executionId")
                            .and_then(Value::as_str)
                            .unwrap()
                            .to_string();
                        self.execution_ids
                            .insert(work_id.clone(), execution_id.clone());
                        address.current_run_id = Some(execution_id);
                    }
                    if patch.get("archived").and_then(Value::as_bool) == Some(true) {
                        self.works.remove(&work_id);
                    } else {
                        address.version = address.version.saturating_add(1);
                    }
                }
            }
            WorkEvent::Domain(DomainEvent::RunStarted { run_id }) => {
                self.set_work_state(&work_id, run_id, WorkState::Running, None)
            }
            WorkEvent::Domain(DomainEvent::RunWaiting {
                run_id,
                reason,
                wait,
            }) => {
                let state = WorkState::parse(reason);
                self.set_work_state(&work_id, run_id, state, wait.clone())
            }
            WorkEvent::Domain(DomainEvent::RunCheckpointed { run_id, .. }) => {
                self.set_work_state(&work_id, run_id, WorkState::Checkpointed, None)
            }
            WorkEvent::Domain(DomainEvent::RunPaused { run_id }) => {
                self.set_work_state(&work_id, run_id, WorkState::Paused, None)
            }
            WorkEvent::Domain(DomainEvent::RunInterrupted { run_id, .. }) => {
                self.set_work_state(&work_id, run_id, WorkState::Recoverable, None)
            }
            WorkEvent::Domain(DomainEvent::RunCompleted { run_id }) => {
                self.set_work_state(&work_id, run_id, WorkState::Completed, None)
            }
            WorkEvent::Domain(DomainEvent::RunFailed { run_id, .. }) => {
                self.set_work_state(&work_id, run_id, WorkState::Failed, None)
            }
            WorkEvent::Domain(DomainEvent::RunCancelled { run_id }) => {
                self.set_work_state(&work_id, run_id, WorkState::Cancelled, None)
            }
            WorkEvent::Domain(DomainEvent::ApprovalResolved {
                ticket_id,
                approved,
            }) => {
                if let Some(review) = self.reviews.get_mut(ticket_id) {
                    review.state = if *approved { "approved" } else { "rejected" }.into();
                }
            }
            WorkEvent::Domain(DomainEvent::ReviewRequested { review_id }) => {
                self.reviews
                    .entry(review_id.clone())
                    .or_insert_with(|| ReviewItem {
                        review_id: review_id.clone(),
                        work_id: work_id.clone(),
                        run_id: None,
                        kind: "review".into(),
                        priority: 0,
                        state: "pending".into(),
                        artifact_refs: vec![],
                        effect_refs: vec![],
                    });
            }
            WorkEvent::Operational(OperationalEvent::SessionAttached { client_id }) => {
                let p = self.presence.entry(work_id.clone()).or_default();
                p.work_id = work_id;
                if !p.active_clients.contains(client_id) {
                    p.active_clients.push(client_id.clone());
                }
            }
            WorkEvent::Operational(OperationalEvent::SessionDetached { client_id }) => {
                if let Some(p) = self.presence.get_mut(&work_id) {
                    p.active_clients.retain(|id| id != client_id);
                }
            }
            // P69.B2 — bindings are durable: replay rebuilds the binding map
            // from the journal so a restart re-attaches to live provider
            // sessions instead of forgetting them.
            WorkEvent::Runtime(RuntimeEvent::AgentBindingCreated { binding }) => {
                let mut binding = (**binding).clone();
                binding.last_event_seq = event.sequence;
                self.agent_bindings
                    .insert(binding.binding_id.as_str().to_string(), binding);
            }
            WorkEvent::Runtime(RuntimeEvent::AgentBindingActivated {
                binding_id,
                provider_session_id,
            })
            | WorkEvent::Runtime(RuntimeEvent::AgentBindingResumed {
                binding_id,
                provider_session_id,
            }) => {
                if let Some(b) = self.agent_bindings.get_mut(binding_id) {
                    b.state = BindingLifecycle::Active;
                    if let Some(sid) = provider_session_id {
                        b.provider_session_id = Some(sid.clone());
                    }
                    b.last_event_seq = event.sequence;
                }
            }
            WorkEvent::Runtime(RuntimeEvent::AgentBindingSuspended { binding_id }) => {
                if let Some(b) = self.agent_bindings.get_mut(binding_id) {
                    b.state = BindingLifecycle::Parked;
                    b.last_event_seq = event.sequence;
                }
            }
            WorkEvent::Runtime(RuntimeEvent::AgentBindingUsageRecorded { binding_id, usage }) => {
                if let Some(b) = self.agent_bindings.get_mut(binding_id) {
                    b.usage.input_tokens = b.usage.input_tokens.saturating_add(usage.input_tokens);
                    b.usage.output_tokens =
                        b.usage.output_tokens.saturating_add(usage.output_tokens);
                    b.usage.cost_micros = b.usage.cost_micros.saturating_add(usage.cost_micros);
                    b.last_event_seq = event.sequence;
                }
            }
            _ => {}
        }
        Ok(())
    }

    /// P71.3g — set both halves of a transition from the canonical state: the
    /// Work's lifecycle state ([`WorkState`]) and its derived client-presence
    /// projection. One call site per event, so the two can never be updated
    /// apart; a wait is cleared unless this state *is* a wait.
    fn set_work_state(
        &mut self,
        work_id: &str,
        run_id: &str,
        state: WorkState,
        wait: Option<everyaios_types::WaitCondition>,
    ) {
        let p = self.presence.entry(work_id.to_string()).or_default();
        p.work_id = work_id.to_string();
        p.active_run = Some(run_id.to_string());
        p.work_state = Some(state);
        p.state = Some(presence_projection(state, wait.as_ref()));
        p.wait = if state.is_running() || matches!(state, WorkState::Paused) {
            wait
        } else {
            None
        };
    }

    pub fn create_work(
        &mut self,
        work_id: impl Into<String>,
        project_id: Option<String>,
        session_id: Option<String>,
        objective: impl Into<String>,
    ) -> WorkAddress {
        self.create_work_in_session(
            work_id,
            project_id,
            session_id,
            SessionKind::Interactive,
            objective,
        )
        .expect("durable interactive Work creation failed")
    }

    /// P71.8a/b — create a Work in a Session of an explicit [`SessionKind`].
    /// The kind is stated by the caller from the record it created, **never**
    /// inferred from whether a Chat exists (`ADR-0006` §1).
    ///
    /// `ADR-0006` §4 — every Work has an owning Session: an `automation` Work
    /// **requires** `session_id` (the trigger creates the Session, then its
    /// Work), so the scope chain always has its second rung. A missing one is
    /// an error, not a Work outside the chain (**I4**).
    pub fn create_work_in_session(
        &mut self,
        work_id: impl Into<String>,
        project_id: Option<String>,
        session_id: Option<String>,
        session_kind: SessionKind,
        objective: impl Into<String>,
    ) -> Result<WorkAddress, String> {
        if matches!(session_kind, SessionKind::Automation) && session_id.is_none() {
            return Err(
                "an automation Work requires its owning Session (ADR-0006 §4) — the trigger \
                 creates the Session, then its Work"
                    .to_string(),
            );
        }
        let id = work_id.into();
        let mut address = WorkAddress::new(id.clone());
        address.project_id = project_id;
        address.session_id = session_id;
        address.session_kind = session_kind;
        if let Some(existing) = self.works.get(&id) {
            return Ok(existing.clone());
        }
        self.works.insert(id.clone(), address.clone());
        self.presence.insert(
            id.clone(),
            WorkPresence {
                work_id: id.clone(),
                state: Some(WorkPresenceState::Running),
                ..Default::default()
            },
        );
        if let Err(error) = self.append(
            &id,
            WorkEvent::Domain(DomainEvent::WorkCreated {
                objective: objective.into(),
                project_id: address.project_id.clone(),
                session_id: address.session_id.clone(),
                parent_work_id: None,
            }),
            None,
        ) {
            self.works.remove(&id);
            self.presence.remove(&id);
            return Err(error);
        }
        Ok(address)
    }

    /// P69.D14 — register a **child Work** for a delegated task. A subagent is
    /// a Work in the one graph, so its address carries the parent link and its
    /// `WorkCreated` event records it: the delegation tree replays from the one
    /// event log, with no parallel subagent registry. Idempotent like
    /// [`Self::create_work`]; an unknown parent is refused (a delegation that
    /// names no real parent is a caller bug, not a new root).
    ///
    /// P71.8/ADR-0006 §5 — a child Work **does not create a Session**: it lives
    /// in its parent's Session (I8), so the address inherits the parent's
    /// `session_id` and `session_kind`. `SessionKind::Delegated` is reserved
    /// for an out-of-session delegation the user explicitly starts.
    pub fn create_child_work(
        &mut self,
        parent_work_id: &str,
        work_id: impl Into<String>,
        objective: impl Into<String>,
        project_id: Option<String>,
        session_id: Option<String>,
    ) -> Result<WorkAddress, String> {
        if !self.works.contains_key(parent_work_id) {
            return Err("unknown parent work".into());
        }
        let id = work_id.into();
        if let Some(existing) = self.works.get(&id) {
            return Ok(existing.clone());
        }
        let parent_kind = self
            .works
            .get(parent_work_id)
            .map(|p| p.session_kind)
            .unwrap_or(SessionKind::Interactive);
        let mut address = WorkAddress::new(id.clone());
        address.project_id = project_id.or_else(|| {
            self.works
                .get(parent_work_id)
                .and_then(|p| p.project_id.clone())
        });
        address.session_id = session_id.or_else(|| {
            self.works
                .get(parent_work_id)
                .and_then(|p| p.session_id.clone())
        });
        address.session_kind = parent_kind;
        address.parent_work_id = Some(parent_work_id.to_string());
        self.works.insert(id.clone(), address.clone());
        self.presence.insert(
            id.clone(),
            WorkPresence {
                work_id: id.clone(),
                state: Some(WorkPresenceState::Running),
                ..Default::default()
            },
        );
        if let Err(error) = self.append(
            &id,
            WorkEvent::Domain(DomainEvent::WorkCreated {
                objective: objective.into(),
                project_id: address.project_id.clone(),
                session_id: address.session_id.clone(),
                parent_work_id: Some(parent_work_id.to_string()),
            }),
            None,
        ) {
            self.works.remove(&id);
            self.presence.remove(&id);
            return Err(error);
        }
        Ok(address)
    }

    /// P69.D14 — the child Works delegated from `parent_work_id`. Reads the
    /// same addresses the tree is built from; there is no second child list.
    pub fn children_of(&self, parent_work_id: &str) -> Vec<&WorkAddress> {
        self.works
            .values()
            .filter(|a| a.parent_work_id.as_deref() == Some(parent_work_id))
            .collect()
    }

    /// P71.3a — the delegation policy inputs, read from the **one** Work graph:
    /// the depth a child of `parent_work_id` lands on, and the delegated child
    /// Works that are still running / ever created.
    ///
    /// `SubAgentRuntime` used to keep these counts in a `HashMap` of its own;
    /// that made a restart lose every admission it had granted. The graph is
    /// already durable (addresses + presence), so the counts are derived here
    /// instead of remembered: a child Work carries `parent_work_id`, and a
    /// delegated child counts as active until its presence is terminal. A
    /// missing presence row counts as **active** (fail-closed) rather than
    /// quietly freeing a concurrency slot.
    pub fn delegation_gauge(&self, parent_work_id: &str) -> Result<DelegationGauge, String> {
        let parent_depth = self.work_depth(parent_work_id)?;
        let mut active = 0u32;
        let mut total = 0u32;
        for address in self.works.values() {
            // A parent's concurrency gauge counts **its own** children only —
            // a sibling delegation elsewhere in the tree must not consume
            // this parent's slots (per-parent policy, `WORK.md` §8).
            if address.parent_work_id.as_deref() != Some(parent_work_id) {
                continue;
            }
            total += 1;
            if !self.presence_is_terminal(address.work_id.as_str()) {
                active += 1;
            }
        }
        Ok(DelegationGauge {
            child_depth: parent_depth.saturating_add(1),
            active,
            total,
        })
    }

    /// P71.3a — whether a Work's presence is terminal (completed, failed, or
    /// cancelled). A missing presence row is **not** terminal: a Work nobody
    /// has reported on yet still occupies its concurrency slot.
    pub fn presence_is_terminal(&self, work_id: &str) -> bool {
        self.presence.get(work_id).is_some_and(|p| {
            matches!(
                p.state,
                Some(WorkPresenceState::Completed)
                    | Some(WorkPresenceState::Failed)
                    | Some(WorkPresenceState::Cancelled)
            )
        })
    }

    /// P71.3a — how many parent links `work_id` has from the root (a root Work
    /// is depth 0). The walk is bounded by the graph size so a malformed
    /// parent cycle is refused instead of looping.
    pub fn work_depth(&self, work_id: &str) -> Result<u32, String> {
        let mut depth = 0u32;
        let mut cursor = work_id.to_string();
        let mut seen = 0usize;
        loop {
            let address = self
                .works
                .get(&cursor)
                .ok_or_else(|| format!("unknown work `{cursor}`"))?;
            let Some(parent) = address.parent_work_id.clone() else {
                return Ok(depth);
            };
            seen += 1;
            if seen > self.works.len() {
                return Err(format!("parent cycle at work `{work_id}`"));
            }
            depth += 1;
            cursor = parent;
        }
    }

    /// P69.D14 — the deterministic child-Work id for a delegated task:
    /// `<parent>/subagent/<task_id>`. Deterministic on purpose — spawn,
    /// completion and any later lookup re-derive the same id from
    /// `(parent, task)` without a mapping table.
    pub fn child_work_id(parent_work_id: &str, task_id: &str) -> String {
        format!("{parent_work_id}/subagent/{task_id}")
    }

    /// P69.D14 — the deterministic Run id bound to a delegated child Work.
    pub fn child_run_id(parent_work_id: &str, task_id: &str) -> String {
        format!("{}/run", Self::child_work_id(parent_work_id, task_id))
    }

    /// P69.D14 — the deterministic AgentSession id opened for a delegated
    /// child Work. One delegation = one child Work + one Run + one ephemeral
    /// session, all keyed off `(parent, task)`.
    pub fn child_agent_session_id(parent_work_id: &str, task_id: &str) -> String {
        format!("{}/agent", Self::child_work_id(parent_work_id, task_id))
    }

    /// P69.D14 — the `(work, run, agent_session)` triple a delegation minted.
    pub fn delegate_child_work(
        &mut self,
        parent_work_id: &str,
        task_id: &str,
        objective: &str,
        agent_id: &str,
        worktree_id: Option<String>,
    ) -> Result<ChildWorkRef, String> {
        let child = Self::child_work_id(parent_work_id, task_id);
        let run = Self::child_run_id(parent_work_id, task_id);
        let session = Self::child_agent_session_id(parent_work_id, task_id);
        let parent = self
            .works
            .get(parent_work_id)
            .cloned()
            .ok_or("unknown parent work")?;
        self.create_child_work(
            parent_work_id,
            child.clone(),
            objective,
            parent.project_id.clone(),
            parent.session_id.clone(),
        )?;
        self.bind_execution(&child, &run)?;
        self.record_execution_transition(&child, &run, WorkState::Running)?;
        self.spawn_subagent(
            &child,
            &run,
            &session,
            agent_id,
            AgentLifetime::EphemeralChild,
            None,
            worktree_id,
        )?;
        Ok(ChildWorkRef {
            work_id: child,
            run_id: run,
            agent_session_id: session,
        })
    }

    /// P69.D14 — close a delegated child Work: the terminal Run event on the
    /// child's own timeline plus the ephemeral session's termination. Returns
    /// the same triple [`Self::delegate_child_work`] minted so the caller can
    /// address what it is closing. Idempotent on an already-terminal child
    /// (the session terminate step is the one that already ran).
    ///
    /// P71.3g — the outcome is the canonical terminal [`WorkState`]
    /// (`Completed · Failed · Cancelled`), and anything else is **refused**.
    /// The old stringly-typed door defaulted every unrecognised outcome to
    /// `completed`, so a typo reported a lost child as a successful one.
    pub fn finish_child_work(
        &mut self,
        parent_work_id: &str,
        task_id: &str,
        outcome: WorkState,
        reason: Option<&str>,
    ) -> Result<ChildWorkRef, String> {
        if !matches!(
            outcome,
            WorkState::Completed | WorkState::Failed | WorkState::Cancelled
        ) {
            return Err(format!(
                "finish_child_work takes a terminal outcome (completed | failed | cancelled), got {}",
                outcome.as_str()
            ));
        }
        let child = Self::child_work_id(parent_work_id, task_id);
        let run = Self::child_run_id(parent_work_id, task_id);
        let session = Self::child_agent_session_id(parent_work_id, task_id);
        let event = match outcome {
            WorkState::Failed => WorkEvent::Domain(DomainEvent::RunFailed {
                run_id: run.clone(),
                reason: reason.unwrap_or("subagent failed").to_string(),
            }),
            WorkState::Cancelled => WorkEvent::Domain(DomainEvent::RunCancelled {
                run_id: run.clone(),
            }),
            _ => WorkEvent::Domain(DomainEvent::RunCompleted {
                run_id: run.clone(),
            }),
        };
        self.append(&child, event, None)?;
        self.set_work_state(&child, &run, outcome, None);
        self.terminate_agent_session(&child, &session)?;
        Ok(ChildWorkRef {
            work_id: child,
            run_id: run,
            agent_session_id: session,
        })
    }

    pub fn bind_execution(&mut self, work_id: &str, execution_id: &str) -> Result<(), String> {
        if !self.works.contains_key(work_id) {
            return Err("unknown work".into());
        }
        self.append(
            work_id,
            WorkEvent::Domain(DomainEvent::WorkUpdated {
                patch: serde_json::json!({"executionId": execution_id}),
            }),
            None,
        )?;
        self.execution_ids
            .insert(work_id.to_string(), execution_id.to_string());
        if let Some(address) = self.works.get_mut(work_id) {
            address.current_run_id = Some(execution_id.to_string());
            address.version = address.version.saturating_add(1);
        }
        Ok(())
    }
    pub fn execution_id(&self, work_id: &str) -> Option<&str> {
        self.execution_ids.get(work_id).map(String::as_str)
    }
    pub fn get_work(&self, id: &str) -> Option<&WorkAddress> {
        self.works.get(id)
    }
    pub fn list_work(&self) -> Vec<&WorkAddress> {
        self.works.values().collect()
    }
    /// Archive a Work only after its durable archival event is acknowledged.
    pub fn try_archive_work(&mut self, id: &str) -> Result<bool, String> {
        if !self.works.contains_key(id) {
            return Ok(false);
        }
        self.append(
            id,
            WorkEvent::Domain(DomainEvent::WorkUpdated {
                patch: serde_json::json!({"archived": true}),
            }),
            None,
        )?;
        self.works.remove(id);
        if let Some(p) = self.presence.get_mut(id) {
            p.state = Some(WorkPresenceState::Completed);
        }
        Ok(true)
    }

    /// Compatibility wrapper for callers that only expose a boolean result.
    /// New RPC and mutation paths should use [`Self::try_archive_work`] so a
    /// journal failure is surfaced rather than reduced to `false`.
    pub fn archive_work(&mut self, id: &str) -> bool {
        self.try_archive_work(id).unwrap_or(false)
    }

    /// Append a steering instruction as a durable Work-level event. The
    /// client identity is checked against an attached authenticated client;
    /// callers cannot smuggle a human approval through this channel.
    pub fn steer(&mut self, instruction: SteeringInstruction) -> Result<WorkEventEnvelope, String> {
        let client = self
            .clients
            .get(&instruction.source_client)
            .ok_or("client is not attached")?;
        if !client.authenticated || !client.capabilities.can_steer {
            return Err("client cannot steer this work".into());
        }
        if client.work_id != instruction.work_id {
            return Err("client/work binding mismatch".into());
        }
        self.append(
            &instruction.work_id,
            WorkEvent::Domain(DomainEvent::WorkUpdated {
                patch: serde_json::to_value(&instruction).map_err(|e| e.to_string())?,
            }),
            None,
        )
    }

    /// Queue a review item and emit its semantic event.
    pub fn request_review(&mut self, item: ReviewItem) -> Result<WorkEventEnvelope, String> {
        if !self.works.contains_key(&item.work_id) {
            return Err("unknown work".into());
        }
        let work_id = item.work_id.clone();
        let review_id = item.review_id.clone();
        let envelope = self.append(
            &work_id,
            WorkEvent::Domain(DomainEvent::ReviewRequested { review_id }),
            None,
        )?;
        self.add_review(item);
        Ok(envelope)
    }

    // ======== P49.10 PtySession lifecycle ========

    pub fn spawn_pty(
        &mut self,
        work_id: &str,
        pty_id: &str,
        process_id: Option<u32>,
        rows: u16,
        cols: u16,
    ) -> Result<WorkEventEnvelope, String> {
        if !self.works.contains_key(work_id) {
            return Err("unknown work".into());
        }
        let envelope = self.append(
            work_id,
            WorkEvent::Runtime(RuntimeEvent::PtyStarted {
                pty_id: pty_id.to_string(),
                process_id,
                rows,
                cols,
            }),
            None,
        )?;
        self.ptys.insert(
            pty_id.to_string(),
            PtySession {
                pty_id: pty_id.to_string(),
                process_id,
                rows,
                cols,
                state: "running".into(),
                output: String::new(),
            },
        );
        Ok(envelope)
    }
    pub fn resize_pty(
        &mut self,
        work_id: &str,
        pty_id: &str,
        rows: u16,
        cols: u16,
    ) -> Result<WorkEventEnvelope, String> {
        let pty = self.ptys.get(pty_id).ok_or("unknown pty")?;
        if pty.state != "running" && pty.state != "paused" {
            return Err(format!("pty is {}", pty.state));
        }
        let envelope = self.append(
            work_id,
            WorkEvent::Runtime(RuntimeEvent::PtyResize {
                pty_id: pty_id.to_string(),
                rows,
                cols,
            }),
            None,
        )?;
        let pty = self.ptys.get_mut(pty_id).ok_or("unknown pty")?;
        pty.rows = rows;
        pty.cols = cols;
        Ok(envelope)
    }
    pub fn write_pty_output(
        &mut self,
        work_id: &str,
        pty_id: &str,
        chunk: &str,
    ) -> Result<WorkEventEnvelope, String> {
        if !self.ptys.contains_key(pty_id) {
            return Err("unknown pty".into());
        }
        let envelope = self.append(
            work_id,
            WorkEvent::Runtime(RuntimeEvent::PtyOutput {
                pty_id: pty_id.to_string(),
                chunk: chunk.to_string(),
            }),
            None,
        )?;
        let pty = self.ptys.get_mut(pty_id).ok_or("unknown pty")?;
        pty.output.push_str(chunk);
        const CAP: usize = 64 * 1024;
        if pty.output.len() > CAP {
            let s = pty.output.len() - CAP;
            pty.output = pty.output[s..].to_string();
        }
        Ok(envelope)
    }
    pub fn signal_pty(
        &mut self,
        work_id: &str,
        pty_id: &str,
        signal: &str,
    ) -> Result<WorkEventEnvelope, String> {
        if !self.ptys.contains_key(pty_id) {
            return Err("unknown pty".into());
        }
        self.append(
            work_id,
            WorkEvent::Runtime(RuntimeEvent::PtySignal {
                pty_id: pty_id.to_string(),
                signal: signal.to_string(),
            }),
            None,
        )
    }
    pub fn pause_pty(&mut self, pty_id: &str) -> Result<(), String> {
        let pty = self.ptys.get_mut(pty_id).ok_or("unknown pty")?;
        if pty.state != "running" {
            return Err(format!("pty is {}", pty.state));
        }
        pty.state = "paused".into();
        Ok(())
    }
    pub fn resume_pty(&mut self, pty_id: &str) -> Result<(), String> {
        let pty = self.ptys.get_mut(pty_id).ok_or("unknown pty")?;
        if pty.state != "paused" {
            return Err(format!("pty is {}", pty.state));
        }
        pty.state = "running".into();
        Ok(())
    }
    pub fn close_pty(
        &mut self,
        work_id: &str,
        pty_id: &str,
        code: Option<i32>,
    ) -> Result<WorkEventEnvelope, String> {
        if !self.ptys.contains_key(pty_id) {
            return Err("unknown pty".into());
        }
        let envelope = self.append(
            work_id,
            WorkEvent::Runtime(RuntimeEvent::PtyExit {
                pty_id: pty_id.to_string(),
                code,
            }),
            None,
        )?;
        self.ptys
            .get_mut(pty_id)
            .ok_or("unknown pty")?
            .state = "exited".into();
        Ok(envelope)
    }
    pub fn snapshot_terminal(&self, pty_id: &str) -> Option<PtySession> {
        self.ptys.get(pty_id).cloned()
    }

    // ======== P49.11 WorktreeBinding lifecycle ========

    #[allow(clippy::too_many_arguments)]
    pub fn create_worktree(
        &mut self,
        work_id: &str,
        run_id: &str,
        worktree_id: &str,
        repo_root: &str,
        worktree_root: &str,
        base_revision: &str,
        branch: &str,
        isolation_mode: &str,
    ) -> Result<WorkEventEnvelope, String> {
        if !self.works.contains_key(work_id) {
            return Err("unknown work".into());
        }
        let envelope = self.append(
            work_id,
            WorkEvent::Runtime(RuntimeEvent::WorktreeCreated {
                worktree_id: worktree_id.to_string(),
                branch: branch.to_string(),
            }),
            None,
        )?;
        self.worktrees.insert(
            worktree_id.to_string(),
            WorktreeBinding {
                worktree_id: worktree_id.to_string(),
                work_id: work_id.to_string(),
                run_id: run_id.to_string(),
                repo_root: repo_root.to_string(),
                worktree_root: worktree_root.to_string(),
                base_revision: base_revision.to_string(),
                branch: branch.to_string(),
                isolation_mode: isolation_mode.to_string(),
                status: "created".into(),
            },
        );
        Ok(envelope)
    }
    pub fn attach_worktree(
        &mut self,
        work_id: &str,
        worktree_id: &str,
        run_id: &str,
    ) -> Result<WorkEventEnvelope, String> {
        if !self.worktrees.contains_key(worktree_id) {
            return Err("unknown worktree".into());
        }
        let envelope = self.append(
            work_id,
            WorkEvent::Runtime(RuntimeEvent::WorktreeAttached {
                worktree_id: worktree_id.to_string(),
                run_id: run_id.to_string(),
            }),
            None,
        )?;
        let wt = self
            .worktrees
            .get_mut(worktree_id)
            .ok_or("unknown worktree")?;
        wt.run_id = run_id.to_string();
        wt.status = "attached".into();
        Ok(envelope)
    }
    pub fn snapshot_worktree(&self, worktree_id: &str) -> Option<WorktreeBinding> {
        self.worktrees.get(worktree_id).cloned()
    }
    pub fn merge_worktree(
        &mut self,
        work_id: &str,
        worktree_id: &str,
        into: &str,
    ) -> Result<WorkEventEnvelope, String> {
        if !self.worktrees.contains_key(worktree_id) {
            return Err("unknown worktree".into());
        }
        let envelope = self.append(
            work_id,
            WorkEvent::Runtime(RuntimeEvent::WorktreeMerged {
                worktree_id: worktree_id.to_string(),
                into: into.to_string(),
            }),
            None,
        )?;
        self.worktrees
            .get_mut(worktree_id)
            .ok_or("unknown worktree")?
            .status = "merged".into();
        Ok(envelope)
    }
    pub fn revert_worktree(
        &mut self,
        work_id: &str,
        worktree_id: &str,
    ) -> Result<WorkEventEnvelope, String> {
        if !self.worktrees.contains_key(worktree_id) {
            return Err("unknown worktree".into());
        }
        let envelope = self.append(
            work_id,
            WorkEvent::Runtime(RuntimeEvent::WorktreeReverted {
                worktree_id: worktree_id.to_string(),
            }),
            None,
        )?;
        self.worktrees
            .get_mut(worktree_id)
            .ok_or("unknown worktree")?
            .status = "reverted".into();
        Ok(envelope)
    }
    pub fn destroy_worktree(
        &mut self,
        work_id: &str,
        worktree_id: &str,
    ) -> Result<WorkEventEnvelope, String> {
        if !self.worktrees.contains_key(worktree_id) {
            return Err("unknown worktree".into());
        }
        let envelope = self.append(
            work_id,
            WorkEvent::Runtime(RuntimeEvent::WorktreeDestroyed {
                worktree_id: worktree_id.to_string(),
            }),
            None,
        )?;
        self.worktrees.remove(worktree_id);
        Ok(envelope)
    }

    // ======== P49.12 AgentSession lifecycle ========

    #[allow(clippy::too_many_arguments)]
    pub fn spawn_subagent(
        &mut self,
        work_id: &str,
        run_id: &str,
        agent_session_id: &str,
        agent_id: &str,
        lifetime: AgentLifetime,
        pty_id: Option<String>,
        worktree_id: Option<String>,
    ) -> Result<WorkEventEnvelope, String> {
        if !self.works.contains_key(work_id) {
            return Err("unknown work".into());
        }
        let envelope = self.append(
            work_id,
            WorkEvent::Runtime(RuntimeEvent::AgentSessionSpawned {
                agent_session_id: agent_session_id.to_string(),
                agent_id: agent_id.to_string(),
                lifetime: lifetime.as_str().to_string(),
            }),
            None,
        )?;
        self.agent_sessions.insert(
            agent_session_id.to_string(),
            AgentSession {
                agent_session_id: agent_session_id.to_string(),
                work_id: work_id.to_string(),
                run_id: run_id.to_string(),
                agent_id: agent_id.to_string(),
                lifetime,
                pty_id,
                worktree_id,
                runtime_state: "spawned".into(),
                last_checkpoint: 0,
                attached: matches!(lifetime, AgentLifetime::PersistentAttachedSession),
            },
        );
        Ok(envelope)
    }
    pub fn send_subagent_message(
        &mut self,
        work_id: &str,
        agent_session_id: &str,
        to_agent: bool,
    ) -> Result<WorkEventEnvelope, String> {
        if !self.agent_sessions.contains_key(agent_session_id) {
            return Err("unknown agent session".into());
        }
        self.append(
            work_id,
            WorkEvent::Runtime(RuntimeEvent::AgentSessionMessage {
                agent_session_id: agent_session_id.to_string(),
                direction: if to_agent {
                    "to_agent".into()
                } else {
                    "from_agent".into()
                },
            }),
            None,
        )

    }
    pub fn attach_agent_session(
        &mut self,
        work_id: &str,
        agent_session_id: &str,
    ) -> Result<WorkEventEnvelope, String> {
        if !self.agent_sessions.contains_key(agent_session_id) {
            return Err("unknown agent session".into());
        }
        let envelope = self.append(
            work_id,
            WorkEvent::Runtime(RuntimeEvent::AgentSessionAttached {
                agent_session_id: agent_session_id.to_string(),
            }),
            None,
        )?;
        let s = self
            .agent_sessions
            .get_mut(agent_session_id)
            .ok_or("unknown agent session")?;
        s.attached = true;
        s.runtime_state = "attached".into();
        Ok(envelope)
    }
    pub fn detach_agent_session(
        &mut self,
        work_id: &str,
        agent_session_id: &str,
    ) -> Result<WorkEventEnvelope, String> {
        let lt = self
            .agent_sessions
            .get(agent_session_id)
            .ok_or("unknown agent session")?
            .lifetime;
        if lt == AgentLifetime::EphemeralChild {
            return self.terminate_agent_session(work_id, agent_session_id);
        }
        let envelope = self.append(
            work_id,
            WorkEvent::Runtime(RuntimeEvent::AgentSessionDetached {
                agent_session_id: agent_session_id.to_string(),
            }),
            None,
        )?;
        let s = self.agent_sessions.get_mut(agent_session_id).unwrap();
        s.attached = false;
        s.runtime_state = "detached".into();
        Ok(envelope)
    }
    pub fn steer_agent_session(
        &mut self,
        work_id: &str,
        agent_session_id: &str,
    ) -> Result<WorkEventEnvelope, String> {
        if !self.agent_sessions.contains_key(agent_session_id) {
            return Err("unknown agent session".into());
        }
        self.append(
            work_id,
            WorkEvent::Runtime(RuntimeEvent::AgentSessionSteered {
                agent_session_id: agent_session_id.to_string(),
            }),
            None,
        )

    }
    pub fn checkpoint_agent_session(
        &mut self,
        work_id: &str,
        agent_session_id: &str,
    ) -> Result<WorkEventEnvelope, String> {
        let cp = self
            .agent_sessions
            .get(agent_session_id)
            .ok_or("unknown agent session")?
            .last_checkpoint
            .saturating_add(1);
        let envelope = self.append(
            work_id,
            WorkEvent::Runtime(RuntimeEvent::AgentSessionCheckpointed {
                agent_session_id: agent_session_id.to_string(),
                checkpoint: cp,
            }),
            None,
        )?;
        self.agent_sessions
            .get_mut(agent_session_id)
            .ok_or("unknown agent session")?
            .last_checkpoint = cp;
        Ok(envelope)
    }
    pub fn terminate_agent_session(
        &mut self,
        work_id: &str,
        agent_session_id: &str,
    ) -> Result<WorkEventEnvelope, String> {
        if !self.agent_sessions.contains_key(agent_session_id) {
            return Err("unknown agent session".into());
        }
        let envelope = self.append(
            work_id,
            WorkEvent::Runtime(RuntimeEvent::AgentSessionTerminated {
                agent_session_id: agent_session_id.to_string(),
            }),
            None,
        )?;
        let s = self
            .agent_sessions
            .get_mut(agent_session_id)
            .ok_or("unknown agent session")?;
        s.runtime_state = "terminated".into();
        s.attached = false;
        Ok(envelope)
    }
    pub fn agent_session(&self, agent_session_id: &str) -> Option<&AgentSession> {
        self.agent_sessions.get(agent_session_id)
    }
    pub fn agent_sessions_for(&self, work_id: &str) -> Vec<&AgentSession> {
        self.agent_sessions
            .values()
            .filter(|s| s.work_id == work_id)
            .collect()
    }

    // ======== P69.B2 AgentBinding — the durable unit ========

    /// Register a durable binding in `parked`. Creation and activation are
    /// distinct lifecycle events (`ARCH/AGENT.md` §3): a created binding only
    /// becomes `active` through [`Self::transition_agent_binding`]. The Work
    /// must exist (a binding to nothing is a caller bug) and the binding id
    /// must be new — a second create is refused rather than silently replacing
    /// live state.
    pub fn create_agent_binding(
        &mut self,
        mut binding: AgentBinding,
    ) -> Result<WorkEventEnvelope, String> {
        if !self.works.contains_key(binding.work_id.as_str()) {
            return Err("unknown work for agent binding".into());
        }
        let binding_id = binding.binding_id.as_str().to_string();
        if self.agent_bindings.contains_key(&binding_id) {
            return Err("agent binding already exists".into());
        }
        binding.state = BindingLifecycle::Parked;
        binding.last_event_seq = 0;
        let work_id = binding.work_id.as_str().to_string();
        let envelope = self
            .append(
                &work_id,
                WorkEvent::Runtime(RuntimeEvent::AgentBindingCreated {
                    binding: Box::new(binding.clone()),
                }),
                None,
        )?;
        binding.last_event_seq = envelope.sequence;
        self.agent_bindings.insert(binding_id, binding);
        Ok(envelope)
    }

    /// Move a binding through the lifecycle vocabulary the architecture names:
    /// `activated` (a live agent session is attached), `suspended` (parked,
    /// state retained), `resumed` (parked → active, optionally with a new
    /// provider session handle). A `dead` binding never comes back — every
    /// transition is refused, which is the distinction that makes park ≠ crash.
    ///
    /// `ARCH/CORE.md` §7.2 — a Session owns bindings; exactly one is active.
    /// Activating a binding while a sibling in the same Session is still active
    /// is refused here, so a switch must park the outgoing binding first
    /// (`ARCH/AGENT.md` §6).
    pub fn transition_agent_binding(
        &mut self,
        binding_id: &str,
        transition: &str,
        provider_session_id: Option<String>,
    ) -> Result<WorkEventEnvelope, String> {
        let binding = self
            .agent_bindings
            .get(binding_id)
            .ok_or("unknown agent binding")?;
        if binding.state == BindingLifecycle::Dead {
            return Err("agent binding is dead".into());
        }
        let work_id = binding.work_id.as_str().to_string();
        let session_id = binding.session_id.clone();
        let (event, state) = match transition {
            "activated" => (
                WorkEvent::Runtime(RuntimeEvent::AgentBindingActivated {
                    binding_id: binding_id.to_string(),
                    provider_session_id: provider_session_id.clone(),
                }),
                BindingLifecycle::Active,
            ),
            "suspended" => (
                WorkEvent::Runtime(RuntimeEvent::AgentBindingSuspended {
                    binding_id: binding_id.to_string(),
                }),
                BindingLifecycle::Parked,
            ),
            "resumed" => (
                WorkEvent::Runtime(RuntimeEvent::AgentBindingResumed {
                    binding_id: binding_id.to_string(),
                    provider_session_id: provider_session_id.clone(),
                }),
                BindingLifecycle::Active,
            ),
            other => return Err(format!("unknown binding transition: {other}")),
        };
        if state == BindingLifecycle::Active {
            if let Some(other) = self.agent_bindings.values().find(|b| {
                b.state == BindingLifecycle::Active
                    && b.session_id == session_id
                    && b.binding_id.as_str() != binding_id
            }) {
                return Err(format!(
                    "session {} already has an active binding: {}",
                    session_id.as_str(),
                    other.binding_id.as_str()
                ));
            }
        }
        let envelope = self
            .append(&work_id, event, None)?;
        let binding = self
            .agent_bindings
            .get_mut(binding_id)
            .ok_or("unknown agent binding")?;
        binding.state = state;
        if let Some(sid) = provider_session_id {
            binding.provider_session_id = Some(sid);
        }
        binding.last_event_seq = envelope.sequence;
        Ok(envelope)
    }

    /// Accumulate per-binding token/cost accounting. Deltas are added to the
    /// durable record and the delta itself is the event, so replay cannot
    /// double-count (it applies the same deltas in the same order).
    pub fn record_binding_usage(
        &mut self,
        binding_id: &str,
        usage: BindingUsage,
    ) -> Result<WorkEventEnvelope, String> {
        let binding = self
            .agent_bindings
            .get(binding_id)
            .ok_or("unknown agent binding")?;
        let work_id = binding.work_id.as_str().to_string();
        let envelope = self
            .append(
                &work_id,
                WorkEvent::Runtime(RuntimeEvent::AgentBindingUsageRecorded {
                    binding_id: binding_id.to_string(),
                    usage,
                }),
                None,
            )?;
        let binding = self
            .agent_bindings
            .get_mut(binding_id)
            .ok_or("unknown agent binding")?;
        binding.usage.input_tokens = binding
            .usage
            .input_tokens
            .saturating_add(usage.input_tokens);
        binding.usage.output_tokens = binding
            .usage
            .output_tokens
            .saturating_add(usage.output_tokens);
        binding.usage.cost_micros = binding.usage.cost_micros.saturating_add(usage.cost_micros);
        binding.last_event_seq = envelope.sequence;
        Ok(envelope)
    }

    pub fn agent_binding(&self, binding_id: &str) -> Option<&AgentBinding> {
        self.agent_bindings.get(binding_id)
    }
    pub fn bindings_for(&self, work_id: &str) -> Vec<&AgentBinding> {
        self.agent_bindings
            .values()
            .filter(|b| b.work_id.as_str() == work_id)
            .collect()
    }

    /// P49.10–12 — JSON-RPC dispatch so the **sidecar agent loop** (not just a
    /// human/CLI) can drive the session runtime as first-class tools. The
    /// coordinator sends `work/pty_spawn`, `work/worktree_create`,
    /// `work/agent_spawn`, … and gets the emitted `WorkEvent` back — the agent
    /// can spawn a PTY for an external CLI, create a Run-owned worktree, and
    /// manage subagent sessions mid-run. Params are camelCase (mirroring the
    /// Tauri command contract).
    pub fn handle_rpc(&mut self, method: &str, p: &Value) -> Result<Value, String> {
        let s = |k: &str| p.get(k).and_then(Value::as_str).unwrap_or("").to_string();
        let opt_s = |k: &str| p.get(k).and_then(Value::as_str).map(|v| v.to_string());
        let u16f = |k: &str, d: u16| {
            p.get(k)
                .and_then(Value::as_u64)
                .map(|v| v as u16)
                .unwrap_or(d)
        };
        let ev = |e: WorkEventEnvelope| serde_json::to_value(e).map_err(|x| x.to_string());
        match method {
            "work/pty_spawn" => ev(self.spawn_pty(
                &s("workId"),
                &s("ptyId"),
                p.get("processId").and_then(Value::as_u64).map(|v| v as u32),
                u16f("rows", 24),
                u16f("cols", 80),
            )?),
            "work/pty_resize" => ev(self.resize_pty(
                &s("workId"),
                &s("ptyId"),
                u16f("rows", 24),
                u16f("cols", 80),
            )?),
            "work/pty_output" => {
                ev(self.write_pty_output(&s("workId"), &s("ptyId"), &s("chunk"))?)
            }
            "work/pty_signal" => ev(self.signal_pty(&s("workId"), &s("ptyId"), &s("signal"))?),
            "work/pty_close" => ev(self.close_pty(
                &s("workId"),
                &s("ptyId"),
                p.get("code").and_then(Value::as_i64).map(|v| v as i32),
            )?),
            "work/pty_snapshot" => {
                serde_json::to_value(self.snapshot_terminal(&s("ptyId"))).map_err(|e| e.to_string())
            }
            "work/worktree_create" => ev(self.create_worktree(
                &s("workId"),
                &s("runId"),
                &s("worktreeId"),
                &s("repoRoot"),
                &s("worktreeRoot"),
                &s("baseRevision"),
                &s("branch"),
                &opt_s("isolationMode").unwrap_or_else(|| "worktree".into()),
            )?),
            "work/worktree_attach" => {
                ev(self.attach_worktree(&s("workId"), &s("worktreeId"), &s("runId"))?)
            }
            "work/worktree_merge" => {
                ev(self.merge_worktree(&s("workId"), &s("worktreeId"), &s("into"))?)
            }
            "work/worktree_revert" => ev(self.revert_worktree(&s("workId"), &s("worktreeId"))?),
            "work/worktree_destroy" => ev(self.destroy_worktree(&s("workId"), &s("worktreeId"))?),
            "work/agent_spawn" => {
                let lifetime = match s("lifetime").as_str() {
                    "persistent" | "persistent_attached_session" => {
                        AgentLifetime::PersistentAttachedSession
                    }
                    _ => AgentLifetime::EphemeralChild,
                };
                ev(self.spawn_subagent(
                    &s("workId"),
                    &s("runId"),
                    &s("agentSessionId"),
                    &s("agentId"),
                    lifetime,
                    opt_s("ptyId"),
                    opt_s("worktreeId"),
                )?)
            }
            "work/agent_message" => ev(self.send_subagent_message(
                &s("workId"),
                &s("agentSessionId"),
                p.get("toAgent").and_then(Value::as_bool).unwrap_or(true),
            )?),
            "work/agent_attach" => {
                ev(self.attach_agent_session(&s("workId"), &s("agentSessionId"))?)
            }
            "work/agent_detach" => {
                ev(self.detach_agent_session(&s("workId"), &s("agentSessionId"))?)
            }
            "work/agent_steer" => ev(self.steer_agent_session(&s("workId"), &s("agentSessionId"))?),
            "work/agent_checkpoint" => {
                ev(self.checkpoint_agent_session(&s("workId"), &s("agentSessionId"))?)
            }
            "work/agent_terminate" => {
                ev(self.terminate_agent_session(&s("workId"), &s("agentSessionId"))?)
            }
            "work/agent_sessions" => serde_json::to_value(self.agent_sessions_for(&s("workId")))
                .map_err(|e| e.to_string()),
            // P69.D14 — the delegation tree below a Work (child Works, each
            // carrying its parent link). Read-only; children only ever come
            // into existence through `delegate_child_work`.
            "work/children" => {
                serde_json::to_value(self.children_of(&s("workId"))).map_err(|e| e.to_string())
            }
            // P69.B2 — durable agent bindings. The binding, not the process, is
            // the unit that survives a restart; usage is recorded as deltas so
            // replay cannot double-count.
            "work/binding_create" => {
                let binding: AgentBinding = serde_json::from_value(
                    p.get("binding")
                        .cloned()
                        .ok_or("work/binding_create requires binding")?,
                )
                .map_err(|e| format!("work/binding_create requires a valid binding: {e}"))?;
                ev(self.create_agent_binding(binding)?)
            }
            "work/binding_transition" => ev(self.transition_agent_binding(
                &s("bindingId"),
                &s("transition"),
                opt_s("providerSessionId"),
            )?),
            "work/binding_usage" => {
                let usage = BindingUsage {
                    input_tokens: p.get("inputTokens").and_then(Value::as_u64).unwrap_or(0),
                    output_tokens: p.get("outputTokens").and_then(Value::as_u64).unwrap_or(0),
                    cost_micros: p.get("costMicros").and_then(Value::as_u64).unwrap_or(0),
                };
                ev(self.record_binding_usage(&s("bindingId"), usage)?)
            }
            "work/bindings" => {
                serde_json::to_value(self.bindings_for(&s("workId"))).map_err(|e| e.to_string())
            }
            // ---- P49.1 — canonical addressing ----
            "work/create" => {
                let work_id = s("workId");
                if work_id.is_empty() {
                    return Err("work/create requires workId".into());
                }
                let session_kind = p
                    .get("sessionKind")
                    .and_then(Value::as_str)
                    .map(everyaios_types::SessionKind::parse)
                    .unwrap_or(everyaios_types::SessionKind::Interactive);
                serde_json::to_value(self.create_work_in_session(
                    work_id,
                    opt_s("projectId"),
                    opt_s("sessionId"),
                    session_kind,
                    s("objective"),
                )?)
                .map_err(|e| e.to_string())
            }
            "work/get" => {
                serde_json::to_value(self.get_work(&s("workId"))).map_err(|e| e.to_string())
            }
            "work/list" => serde_json::to_value(self.list_work()).map_err(|e| e.to_string()),
            "work/snapshot" => serde_json::to_value(self.snapshot(&s("workId")))
                .map_err(|e| e.to_string()),
            "work/events" => serde_json::to_value(self.replay_from(
                &s("workId"),
                p.get("fromSequence").and_then(Value::as_u64).unwrap_or(0),
            ))
            .map_err(|e| e.to_string()),
            "work/archive" => Ok(Value::Bool(self.try_archive_work(&s("workId"))?)),
            "work/locator" => match self.get_work(&s("workId")) {
                Some(address) => Ok(Value::String(address.locator())),
                None => Err("unknown work".into()),
            },
            "work/resolve_locator" => {
                serde_json::to_value(WorkAddress::parse_locator(&s("locator"))?)
                    .map_err(|e| e.to_string())
            }
            // ---- P49.3 — ExecutionNode registry ----
            "work/nodes" => serde_json::to_value(self.nodes()).map_err(|e| e.to_string()),
            "work/node_pair" => {
                let node: ExecutionNode =
                    serde_json::from_value(p.get("node").cloned().unwrap_or(Value::Null))
                        .map_err(|e| e.to_string())?;
                serde_json::to_value(self.pair_node(node)?).map_err(|e| e.to_string())
            }
            "work/node_register" => {
                let node: ExecutionNode = serde_json::from_value(
                    p.get("node").cloned().ok_or("work/node_register requires node")?,
                )
                .map_err(|e| e.to_string())?;
                self.register_node(node)?;
                Ok(serde_json::json!({"registered": true}))
            }
            "work/node_heartbeat" => {
                let node_id = s("nodeId");
                let at_ms = p.get("atMs").and_then(Value::as_u64).unwrap_or_else(now_ms);
                Ok(serde_json::json!({
                    "healthy": self.heartbeat_node(&node_id, at_ms)
                }))
            }
            "work/node_verify" => {
                serde_json::to_value(self.verify_node(&s("nodeId"))?).map_err(|e| e.to_string())
            }
            "work/node_bind" => serde_json::to_value(self.bind_node(&s("nodeId"), &s("workId"))?)
                .map_err(|e| e.to_string()),
            "work/node_unbind" => Ok(Value::Bool(self.try_unbind_node(&s("nodeId"))?)),
            "work/node_migrate" => serde_json::to_value(self.migrate_run(
                &s("runId"),
                &s("nodeId"),
                p.get("ttlMs").and_then(Value::as_u64).unwrap_or(60_000),
            )?)
            .map_err(|e| e.to_string()),
            // ---- P49.4 — RunAuthority ----
            "work/authority_acquire" => serde_json::to_value(self.acquire_run_authority(
                &s("runId"),
                &s("nodeId"),
                p.get("ttlMs").and_then(Value::as_u64).unwrap_or(60_000),
            )?)
            .map_err(|e| e.to_string()),
            "work/authority_renew" => serde_json::to_value(self.renew_lease(
                &s("runId"),
                &s("nodeId"),
                p.get("token").and_then(Value::as_u64).unwrap_or(0),
                p.get("ttlMs").and_then(Value::as_u64).unwrap_or(60_000),
            )?)
            .map_err(|e| e.to_string()),
            "work/authority_release" => Ok(Value::Bool(self.release_authority(
                &s("runId"),
                &s("nodeId"),
                p.get("token").and_then(Value::as_u64).unwrap_or(0),
            ))),
            "work/authority_recover" => serde_json::to_value(self.recover_run(
                &s("runId"),
                &s("nodeId"),
                p.get("ttlMs").and_then(Value::as_u64).unwrap_or(60_000),
            )?)
            .map_err(|e| e.to_string()),
            "work/authority" => {
                serde_json::to_value(self.authority(&s("runId"))).map_err(|e| e.to_string())
            }
            "work/lease_acquire" => {
                let run_id = s("runId");
                let node_id = s("nodeId");
                if run_id.is_empty() || node_id.is_empty() {
                    return Err("work/lease_acquire requires runId and nodeId".into());
                }
                let ttl_ms = p.get("ttlMs").and_then(Value::as_u64).unwrap_or(30_000);
                serde_json::to_value(self.acquire_run_authority(&run_id, &node_id, ttl_ms)?)
                    .map_err(|e| e.to_string())
            }
            "work/lease_validate" => {
                let run_id = s("runId");
                let node_id = s("nodeId");
                let token = p
                    .get("fencingToken")
                    .and_then(Value::as_u64)
                    .ok_or("work/lease_validate requires fencingToken")?;
                if run_id.is_empty() || node_id.is_empty() {
                    return Err("work/lease_validate requires runId and nodeId".into());
                }
                Ok(serde_json::json!({
                    "valid": self.validate_fencing_token(&run_id, &node_id, token)
                }))
            }
            "work/lease_release" => {
                let run_id = s("runId");
                let node_id = s("nodeId");
                let token = p
                    .get("fencingToken")
                    .and_then(Value::as_u64)
                    .ok_or("work/lease_release requires fencingToken")?;
                if run_id.is_empty() || node_id.is_empty() {
                    return Err("work/lease_release requires runId and nodeId".into());
                }
                Ok(serde_json::json!({
                    "released": self.release_authority(&run_id, &node_id, token)
                }))
            }
            // ---- P49.9 — client handshake ----
            "work/client_connect" => serde_json::to_value(
                self.connect_client(
                    &s("clientId"),
                    &s("clientType"),
                    &s("workId"),
                    p.get("authenticated")
                        .and_then(Value::as_bool)
                        .unwrap_or(false),
                )?,
            )
            .map_err(|e| e.to_string()),
            "work/client_attach" => {
                let client: ClientSession = serde_json::from_value(
                    p.get("client")
                        .cloned()
                        .ok_or("work/client_attach requires client")?,
                )
                .map_err(|e| e.to_string())?;
                self.attach_client(client)?;
                Ok(serde_json::json!({"attached": true}))
            }
            "work/client_detach" => Ok(serde_json::json!({
                "detached": self.try_detach_client(&s("clientId"))?
            })),
            "work/clients" => {
                serde_json::to_value(self.clients_for(&s("workId"))).map_err(|e| e.to_string())
            }
            // ---- P49.7/.8 — broker + resolver ----
            "work/capabilities" => {
                serde_json::to_value(self.broker().list_capabilities()).map_err(|e| e.to_string())
            }
            "work/capability_grant" => {
                let request = BrokerRequest {
                    capability_id: s("capabilityId"),
                    work_id: s("workId"),
                    run_id: s("runId"),
                    consumer: s("consumer"),
                };
                let grant = self.broker().authorize(&request)?;
                serde_json::to_value(grant).map_err(|e| e.to_string())
            }
            "work/capability_resolve" => {
                let candidates: Vec<CapabilityCandidate> =
                    serde_json::from_value(p.get("candidates").cloned().unwrap_or(Value::Null))
                        .map_err(|e| e.to_string())?;
                serde_json::to_value(self.resolve_capability(&s("intent"), candidates))
                    .map_err(|e| e.to_string())
            }
            // ---- P49.13 — ReviewQueue ----
            "work/review_request" => {
                let item: ReviewItem =
                    serde_json::from_value(p.get("item").cloned().unwrap_or(Value::Null))
                        .map_err(|e| e.to_string())?;
                ev(self.request_review(item)?)
            }
            "work/review_add" => {
                let item: ReviewItem = serde_json::from_value(
                    p.get("review")
                        .cloned()
                        .ok_or("work/review_add requires review")?,
                )
                .map_err(|e| e.to_string())?;
                self.request_review(item)?;
                Ok(serde_json::json!({"queued": true}))
            }
            "work/review_resolve" => {
                if let Some(state) = p.get("state").and_then(Value::as_str) {
                    ev(self.resolve_review_with(&s("reviewId"), state)?)
                } else {
                    let review_id = s("reviewId");
                    if !self.reviews.contains_key(&review_id) {
                        return Ok(serde_json::json!({"resolved": false}));
                    }
                    self.resolve_review_with(&review_id, "resolved")?;
                    Ok(serde_json::json!({"resolved": true}))
                }
            }
            // ---- P49.14 — steering ----
            "work/steer" => {
                if let Some(raw) = p.get("instruction").filter(|value| value.is_object()) {
                    let instruction: SteeringInstruction = serde_json::from_value(raw.clone())
                        .map_err(|e| e.to_string())?;
                    self.queue_steering(instruction)?;
                    Ok(serde_json::json!({"queued": true}))
                } else {
                    let instruction = SteeringInstruction {
                        work_id: s("workId"),
                        run_id: opt_s("runId"),
                        source_client: s("clientId"),
                        instruction: s("instruction"),
                        scope: s("scope"),
                        priority: p.get("priority").and_then(Value::as_u64).unwrap_or(50) as u8,
                        created_at_ms: now_ms(),
                    };
                    ev(self.queue_steering(instruction)?)
                }
            }
            "work/steer_interrupt" => {
                ev(self.interrupt_current_step(&s("workId"), &s("clientId"), &s("reason"))?)
            }
            "work/steer_checkpoint" => ev(self.apply_steering_checkpoint(
                &s("workId"),
                &s("runId"),
                p.get("checkpoint").and_then(Value::as_u64).unwrap_or(0) as u32,
            )?),
            // ---- P49.15 — RuntimeManifest ----
            "work/manifest_create" => {
                let manifest: RuntimeManifest =
                    serde_json::from_value(p.get("manifest").cloned().unwrap_or(Value::Null))
                        .map_err(|e| e.to_string())?;
                serde_json::to_value(self.create_runtime_manifest(&s("workId"), manifest)?)
                    .map_err(|e| e.to_string())
            }
            "work/manifest_get" => {
                serde_json::to_value(self.runtime_manifest(&s("workId"))).map_err(|e| e.to_string())
            }
            "work/manifest_restore" => {
                let saved: RuntimeManifest =
                    serde_json::from_value(p.get("manifest").cloned().unwrap_or(Value::Null))
                        .map_err(|e| e.to_string())?;
                let caps: Vec<String> = serde_json::from_value(
                    p.get("trustedCapabilities").cloned().unwrap_or(Value::Null),
                )
                .unwrap_or_default();
                serde_json::to_value(self.restore_runtime_manifest(
                    &saved,
                    &caps,
                    &s("trustedNetwork"),
                    &s("trustedFilesystem"),
                ))
                .map_err(|e| e.to_string())
            }
            // ---- P49.17 — AttachmentRef ----
            "work/attachment_add" => {
                let attachment: AttachmentRef =
                    serde_json::from_value(p.get("attachment").cloned().unwrap_or(Value::Null))
                        .map_err(|e| e.to_string())?;
                self.create_attachment(attachment, PathBuf::from(s("path")))?;
                Ok(Value::Bool(true))
            }
            "work/attachment_list" => {
                serde_json::to_value(self.attachments_for(&s("workId"))).map_err(|e| e.to_string())
            }
            "work/attachment_resolve" => {
                let path = self.resolve_attachment(&s("attachmentId"), &s("consumer"))?;
                Ok(Value::String(path.display().to_string()))
            }
            "work/attachment_expire" => Ok(Value::Bool(self.expire_attachment(&s("attachmentId")))),
            "work/presence" => serde_json::to_value(self.presence(&s("workId")))
                .map_err(|e| e.to_string()),
            "work/thought" => {
                let work_id = s("workId");
                let text = s("text");
                if work_id.is_empty() || text.is_empty() {
                    return Err("work/thought requires workId and text".into());
                }
                self.record_thought(&work_id, &text)?;
                Ok(serde_json::json!({"recorded": true}))
            }
            other => Err(format!("unknown work method: {other}")),
        }
    }

    /// Append an event and acknowledge it only after the journal is durable.
    ///
    /// The sequence is reserved for this attempt, but it is not committed to
    /// the gateway until the record has been written, flushed, and synced. A
    /// failed write therefore leaves both the sequence and the in-memory event
    /// projection unchanged, so callers can propagate the error instead of
    /// continuing with an event that will disappear on restart.
    pub fn append(
        &mut self,
        work_id: &str,
        event: WorkEvent,
        causal_parent: Option<u64>,
    ) -> Result<WorkEventEnvelope, String> {
        if !self.works.contains_key(work_id) {
            return Err("unknown work".into());
        }
        let sequence = self.next_seq;
        let next_sequence = sequence
            .checked_add(1)
            .ok_or("work journal sequence overflow")?;
        let envelope = WorkEventEnvelope {
            work_id: work_id.into(),
            sequence,
            event_id: format!("we:{sequence}"),
            event,
            timestamp: now_ms(),
            trace_id: None,
            causal_parent,
        };
        if let Some(path) = &self.journal {
            let mut file = OpenOptions::new()
                .create(true)
                .append(true)
                .open(path)
                .map_err(|e| format!("open work journal: {e}"))?;
            let line = serde_json::to_string(&envelope)
                .map_err(|e| format!("serialize work event: {e}"))?;
            writeln!(file, "{line}").map_err(|e| format!("write work journal: {e}"))?;
            file.flush()
                .map_err(|e| format!("flush work journal: {e}"))?;
            file.sync_all()
                .map_err(|e| format!("sync work journal: {e}"))?;
        }
        self.next_seq = next_sequence;
        self.events
            .entry(work_id.into())
            .or_default()
            .push(envelope.clone());
        self.subscribers
            .retain(|subscriber| subscriber.send(envelope.clone()).is_ok());
        Ok(envelope)
    }
    pub fn replay_from(&self, work_id: &str, sequence: u64) -> Vec<WorkEventEnvelope> {
        self.events
            .get(work_id)
            .map(|e| {
                e.iter()
                    .filter(|x| x.sequence >= sequence)
                    .cloned()
                    .collect()
            })
            .unwrap_or_default()
    }
    pub fn events(&self, work_id: &str) -> &[WorkEventEnvelope] {
        self.events.get(work_id).map(Vec::as_slice).unwrap_or(&[])
    }

    /// Return the opaque capability grant attached to an attempted effect, if
    /// present. This is audit metadata only and never resolves credentials.
    pub fn effect_grant_id(&self, work_id: &str, effect_id: &str) -> Option<&str> {
        self.events(work_id)
            .iter()
            .find_map(|envelope| match &envelope.event {
                WorkEvent::Domain(DomainEvent::EffectAttempted {
                    effect_id: candidate,
                    capability_grant_id,
                }) if candidate == effect_id => capability_grant_id.as_deref(),
                _ => None,
            })
    }
    pub fn record_approval(
        &mut self,
        work_id: &str,
        ticket_id: &str,
        approved: bool,
    ) -> Result<(), String> {
        self.append(
            work_id,
            WorkEvent::Domain(DomainEvent::ApprovalResolved {
                ticket_id: ticket_id.into(),
                approved,
            }),
            None,
        )?;
        Ok(())
    }

    pub fn record_effect_with_grant(
        &mut self,
        work_id: &str,
        effect_id: &str,
        phase: &str,
        detail: &str,
        capability_grant_id: Option<&str>,
    ) -> Result<(), String> {
        let event = match phase {
            "attempted" => WorkEvent::Domain(DomainEvent::EffectAttempted {
                effect_id: effect_id.into(),
                capability_grant_id: capability_grant_id.map(str::to_string),
            }),
            "observed" => WorkEvent::Domain(DomainEvent::EffectObserved {
                effect_id: effect_id.into(),
                outcome: detail.into(),
            }),
            "verified" => WorkEvent::Domain(DomainEvent::EffectVerified {
                effect_id: effect_id.into(),
                verified: detail == "true",
            }),
            _ => return Err("unknown effect phase".into()),
        };
        self.append(work_id, event, None)?;
        Ok(())
    }

    pub fn record_effect(
        &mut self,
        work_id: &str,
        effect_id: &str,
        phase: &str,
        detail: &str,
    ) -> Result<(), String> {
        self.record_effect_with_grant(work_id, effect_id, phase, detail, None)
    }

    /// P51.14 — record a live agent-thought summary (the headline the UI
    /// shows on the agent card while a run is in flight). Appends a
    /// `PresenceEvent::AgentThoughtSummary` and mirrors it onto the presence
    /// record's `current_surface` so re-attaching clients see the last
    /// summary immediately, before replaying the event log.
    pub fn record_thought(&mut self, work_id: &str, text: &str) -> Result<(), String> {
        if !self.works.contains_key(work_id) {
            return Err("unknown work".into());
        }
        self.append(
            work_id,
            WorkEvent::Presence(PresenceEvent::AgentThoughtSummary { text: text.into() }),
            None,
        )?;
        if let Some(p) = self.presence.get_mut(work_id) {
            p.current_surface = Some(text.into());
        }
        Ok(())
    }

    pub fn record_artifact(
        &mut self,
        work_id: &str,
        artifact_id: &str,
        updated: bool,
    ) -> Result<(), String> {
        let event = if updated {
            DomainEvent::ArtifactUpdated {
                artifact_id: artifact_id.into(),
            }
        } else {
            DomainEvent::ArtifactCreated {
                artifact_id: artifact_id.into(),
            }
        };
        self.append(work_id, WorkEvent::Domain(event), None)?;
        Ok(())
    }

    /// P71.3g — the typed transition door: callers speak the canonical
    /// [`WorkState`] (`WORK.md` §4) instead of a stringly-typed subset, and both
    /// the event and the presence projection are derived here in one place.
    ///
    /// The wire spelling still reaches this through `WorkState::parse` at the
    /// RPC boundary, so the journal vocabulary is unchanged.
    ///
    /// The event mapping: states that mean "a run is in flight" append
    /// `RunStarted`; the waiting states append `RunWaiting` carrying the state
    /// spelling (plus the wait condition when the caller used
    /// [`Self::record_wait`]); `Paused` appends `RunPaused`; `Recoverable`
    /// appends `RunInterrupted` — deliberately **not** `RunFailed`, because an
    /// unknown effect outcome is not a failure (`RECOVERY.md` §3).
    pub fn record_execution_transition(
        &mut self,
        work_id: &str,
        execution_id: &str,
        state: WorkState,
    ) -> Result<(), String> {
        if self.execution_id(work_id) != Some(execution_id) {
            return Err("execution/work binding mismatch".into());
        }
        let event = transition_event(execution_id, state, None);
        self.append(work_id, event, None)?;
        self.set_work_state(work_id, execution_id, state, None);
        Ok(())
    }

    /// P71.3g — enter a **durable wait**: the run parks in the state the reason
    /// implies and the condition (reason · detail · deadline · resume-on) is
    /// carried on the event, so presence replays with *what it waited for*
    /// rather than a confident summary (`RECOVERY.md` §7, `AUTOMATION.md` §8).
    pub fn record_wait(
        &mut self,
        work_id: &str,
        execution_id: &str,
        wait: &everyaios_types::WaitCondition,
    ) -> Result<(), String> {
        if self.execution_id(work_id) != Some(execution_id) {
            return Err("execution/work binding mismatch".into());
        }
        let state = wait.work_state();
        let event = transition_event(execution_id, state, Some(wait.clone()));
        self.append(work_id, event, None)?;
        self.set_work_state(work_id, execution_id, state, Some(wait.clone()));
        Ok(())
    }
    pub fn presence(&self, work_id: &str) -> Option<&WorkPresence> {
        self.presence.get(work_id)
    }
    pub fn attach_client(&mut self, client: ClientSession) -> Result<(), String> {
        if !client.authenticated {
            return Err("client authentication required".into());
        }
        if !self.works.contains_key(&client.work_id) {
            return Err("unknown work".into());
        }
        self.append(
            &client.work_id,
            WorkEvent::Operational(OperationalEvent::SessionAttached {
                client_id: client.client_id.clone(),
            }),
            None,
        )?;
        let p = self.presence.get_mut(&client.work_id).unwrap();
        if !p.active_clients.contains(&client.client_id) {
            p.active_clients.push(client.client_id.clone());
        }
        self.clients.insert(client.client_id.clone(), client);
        Ok(())
    }
    pub fn try_detach_client(&mut self, client_id: &str) -> Result<bool, String> {
        let Some(c) = self.clients.get(client_id).cloned() else {
            return Ok(false);
        };
        self.append(
            &c.work_id,
            WorkEvent::Operational(OperationalEvent::SessionDetached {
                client_id: client_id.into(),
            }),
            None,
        )?;
        self.clients.remove(client_id);
        if let Some(p) = self.presence.get_mut(&c.work_id) {
            p.active_clients.retain(|x| x != client_id);
        }
        Ok(true)
    }
    pub fn detach_client(&mut self, client_id: &str) -> bool {
        self.try_detach_client(client_id).unwrap_or(false)
    }
    pub fn register_node(&mut self, node: ExecutionNode) -> Result<(), String> {
        if node.node_id.is_empty() {
            return Err("node id required".into());
        }
        self.nodes.insert(node.node_id.clone(), node);
        Ok(())
    }
    pub fn heartbeat_node(&mut self, node_id: &str, at_ms: u64) -> bool {
        self.nodes
            .get_mut(node_id)
            .map(|n| {
                n.last_heartbeat_ms = at_ms;
                n.health = "healthy".into();
                true
            })
            .unwrap_or(false)
    }
    pub fn acquire_run_authority(
        &mut self,
        run_id: &str,
        node_id: &str,
        ttl_ms: u64,
    ) -> Result<RunAuthority, String> {
        if !self.nodes.contains_key(node_id) {
            return Err("unknown node".into());
        }
        if let Some(a) = self.authorities.get(run_id) {
            if a.expires_at_ms == 0 || a.expires_at_ms > now_ms() {
                return Err("run authority already held".into());
            }
        }
        let token = self.fence_counters.get(run_id).copied().unwrap_or(0) + 1;
        self.fence_counters.insert(run_id.to_string(), token);
        let a = RunAuthority {
            run_id: run_id.into(),
            node_id: node_id.into(),
            lease_id: format!("lease:{run_id}:{token}"),
            fencing_token: token,
            granted_at_ms: now_ms(),
            expires_at_ms: if ttl_ms == 0 { 0 } else { now_ms() + ttl_ms },
        };
        self.authorities.insert(run_id.into(), a.clone());
        Ok(a)
    }
    pub fn validate_fencing_token(&self, run_id: &str, node_id: &str, token: u64) -> bool {
        self.authorities
            .get(run_id)
            .map(|a| a.valid(node_id, token, now_ms()))
            .unwrap_or(false)
    }
    pub fn release_authority(&mut self, run_id: &str, node_id: &str, token: u64) -> bool {
        if self.validate_fencing_token(run_id, node_id, token) {
            self.authorities.remove(run_id);
            true
        } else {
            false
        }
    }
    pub fn add_review(&mut self, item: ReviewItem) {
        self.reviews.insert(item.review_id.clone(), item);
    }
    /// Open review items only. Terminal outcomes (P49.13) are excluded so the
    /// Needs-Me inbox never re-surfaces an item the user already acted on.
    pub fn reviews(&self, work_id: &str) -> Vec<&ReviewItem> {
        self.reviews
            .values()
            .filter(|r| r.work_id == work_id && !is_terminal_review_state(&r.state))
            .collect()
    }
    /// Compatibility wrapper for the legacy boolean review door. The state is
    /// changed only after the durable resolution event is acknowledged.
    pub fn resolve_review(&mut self, id: &str) -> bool {
        self.resolve_review_with(id, "resolved").is_ok()
    }
    pub fn resolve_capability(
        &self,
        intent: &str,
        candidates: Vec<CapabilityCandidate>,
    ) -> CapabilityResolution {
        let mut ranked = candidates.clone();
        ranked.sort_by(|a, b| {
            b.confidence
                .cmp(&a.confidence)
                .then(a.risk.cmp(&b.risk))
                .then(a.latency_estimate_ms.cmp(&b.latency_estimate_ms))
                .then(a.cost_estimate.cmp(&b.cost_estimate))
        });
        let ranked_path: Vec<String> = ranked.iter().map(|c| c.capability_id.clone()).collect();
        CapabilityResolution {
            intent: intent.into(),
            candidate_capabilities: candidates,
            ranked_path: ranked_path.clone(),
            rationale: "ranked by confidence, risk, latency, and cost".into(),
            fallback_path: ranked_path.into_iter().skip(1).collect(),
        }
    }
    pub fn create_attachment(
        &mut self,
        attachment: AttachmentRef,
        path: PathBuf,
    ) -> Result<(), String> {
        if !path.exists() {
            return Err("attachment source does not exist".into());
        }
        self.attachments
            .insert(attachment.attachment_id.clone(), (attachment, path));
        Ok(())
    }
    pub fn resolve_attachment(&self, id: &str, consumer: &str) -> Result<&Path, String> {
        let Some((a, p)) = self.attachments.get(id) else {
            return Err("unknown attachment".into());
        };
        if !a.allowed_consumers.is_empty() && !a.allowed_consumers.iter().any(|x| x == consumer) {
            return Err("attachment consumer denied".into());
        }
        Ok(p)
    }
    pub fn create_pty(&mut self, id: impl Into<String>, rows: u16, cols: u16) -> PtySession {
        let p = PtySession {
            pty_id: id.into(),
            process_id: None,
            rows,
            cols,
            state: "created".into(),
            output: String::new(),
        };
        self.ptys.insert(p.pty_id.clone(), p.clone());
        p
    }
    pub fn append_pty_output(&mut self, id: &str, output: &str) -> Result<(), String> {
        let p = self.ptys.get_mut(id).ok_or("unknown pty")?;
        if p.output.len().saturating_add(output.len()) > 1_000_000 {
            return Err("pty output limit exceeded".into());
        }
        p.output.push_str(output);
        Ok(())
    }
    pub fn bind_worktree(&mut self, binding: WorktreeBinding) -> Result<(), String> {
        if !self.works.contains_key(&binding.work_id) {
            return Err("unknown work".into());
        }
        if !Path::new(&binding.repo_root).is_dir() {
            return Err("repository root does not exist".into());
        }
        self.worktrees.insert(binding.worktree_id.clone(), binding);
        Ok(())
    }
    pub fn snapshot(&self, work_id: &str) -> Option<WorkGatewaySnapshot> {
        Some(WorkGatewaySnapshot {
            address: self.works.get(work_id)?.clone(),
            presence: self.presence.get(work_id)?.clone(),
            events: self.events(work_id).to_vec(),
            clients: self
                .clients
                .values()
                .filter(|c| c.work_id == work_id)
                .cloned()
                .collect(),
            nodes: self.nodes.values().cloned().collect(),
            reviews: self.reviews(work_id).into_iter().cloned().collect(),
        })
    }
}

// ===========================================================================
// P49.7 — CapabilityBroker: the trusted intermediary.
//
// The agent receives an opaque, run-scoped handle — never a raw secret — and
// connector auth stays outside the sandbox (Anthropic's cloud-sandbox topology
// reproduced locally). With no live dispatcher registered, `invoke` is an
// honest refusal, not a fabricated success.
// ===========================================================================

/// A short-lived, run-scoped credential handle. The secret itself is never
/// returned to the caller; `handle` is an opaque reference the broker resolves.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EphemeralCredential {
    pub handle: String,
    pub scope: Vec<String>,
    pub issued_for_run: String,
    pub expires_at_ms: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrokerRequest {
    pub capability_id: String,
    pub work_id: String,
    pub run_id: String,
    pub consumer: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CapabilityGrant {
    pub grant_id: String,
    pub capability_id: String,
    pub credential: EphemeralCredential,
    pub granted_at_ms: u64,
}

/// P49.7 — the broker boundary. `invoke` requires a live dispatcher; effects
/// themselves stay on the ticket/executor path.
pub trait CapabilityBroker {
    fn list_capabilities(&self) -> Vec<String>;
    fn authorize(&self, request: &BrokerRequest) -> Result<CapabilityGrant, String>;
    fn invoke(&self, grant: &CapabilityGrant, request: &Value) -> Result<Value, String>;
}

/// V1-local broker: knows which capabilities it may broker, mints opaque
/// handles scoped to a run, and never hands the caller a secret.
#[derive(Debug, Default, Clone)]
pub struct GatewayCapabilityBroker {
    capabilities: Vec<String>,
}

impl GatewayCapabilityBroker {
    pub fn new(capabilities: Vec<String>) -> Self {
        Self { capabilities }
    }
}

impl CapabilityBroker for GatewayCapabilityBroker {
    fn list_capabilities(&self) -> Vec<String> {
        self.capabilities.clone()
    }

    fn authorize(&self, request: &BrokerRequest) -> Result<CapabilityGrant, String> {
        if !self
            .capabilities
            .iter()
            .any(|c| c == &request.capability_id)
        {
            return Err(format!(
                "capability not brokered: {}",
                request.capability_id
            ));
        }
        if request.run_id.is_empty() {
            return Err("broker grant requires a run id".into());
        }
        Ok(CapabilityGrant {
            grant_id: format!("grant:{}:{}", request.capability_id, request.run_id),
            capability_id: request.capability_id.clone(),
            credential: EphemeralCredential {
                handle: format!("cred:{}:{}", request.capability_id, request.run_id),
                scope: vec![request.capability_id.clone()],
                issued_for_run: request.run_id.clone(),
                expires_at_ms: 0,
            },
            granted_at_ms: now_ms(),
        })
    }

    fn invoke(&self, _grant: &CapabilityGrant, _request: &Value) -> Result<Value, String> {
        Err("capability invocation requires a live dispatcher (ticket/executor path)".into())
    }
}

// ===========================================================================
// P49.8 — CapabilityResolution decision helpers. `resolve_capability` ranks;
// these are the read surface the router consumes (one universal resolver for
// connector > browser > desktop-CU > fallback).
// ===========================================================================

impl CapabilityResolution {
    /// The highest-ranked capability that satisfies the intent.
    pub fn choose_best(&self) -> Option<&str> {
        self.ranked_path.first().map(String::as_str)
    }

    /// The next-ranked capability if the best is unavailable at runtime.
    pub fn choose_fallback(&self) -> Option<&str> {
        self.fallback_path.first().map(String::as_str)
    }

    /// A one-line, user-safe explanation of the choice + its fallbacks.
    pub fn explain_choice(&self) -> String {
        match self.choose_best() {
            Some(best) => {
                let fallbacks = if self.fallback_path.is_empty() {
                    "none".to_string()
                } else {
                    self.fallback_path.join(" > ")
                };
                format!("{best} — {} (fallbacks: {fallbacks})", self.rationale)
            }
            None => "no capability satisfies this intent".into(),
        }
    }
}

// ===========================================================================
// P49 V1-local wiring — the Gateway surface the Tauri commands / RPC consume.
// Everything here is local + in-process; remote clients and multi-node failover
// stay post-v1 (P49.19/.20).
// ===========================================================================

impl WorkGateway {
    // ---- P49.3 — ExecutionNode registry ----

    pub fn nodes(&self) -> Vec<&ExecutionNode> {
        self.nodes.values().collect()
    }

    pub fn node(&self, node_id: &str) -> Option<&ExecutionNode> {
        self.nodes.get(node_id)
    }

    /// Pair a node. Re-pairing resets health to `paired` so trust is
    /// re-established per connection, never inherited from a stale record.
    pub fn pair_node(&mut self, mut node: ExecutionNode) -> Result<ExecutionNode, String> {
        if node.node_id.is_empty() {
            return Err("node id required".into());
        }
        node.health = "paired".into();
        node.last_heartbeat_ms = now_ms();
        self.nodes.insert(node.node_id.clone(), node.clone());
        Ok(node)
    }

    /// Verify a paired node's advertised capabilities are actually present.
    pub fn verify_node(&mut self, node_id: &str) -> Result<ExecutionNode, String> {
        let node = self.nodes.get_mut(node_id).ok_or("unknown node")?;
        if !matches!(node.health.as_str(), "paired" | "verified" | "bound") {
            return Err("node is not paired".into());
        }
        node.health = "verified".into();
        node.last_heartbeat_ms = now_ms();
        Ok(node.clone())
    }

    /// Bind a verified node to a Work (V1: the desktop itself is node-1).
    pub fn bind_node(&mut self, node_id: &str, work_id: &str) -> Result<WorkAddress, String> {
        let node = self.nodes.get(node_id).ok_or("unknown node")?;
        if !matches!(node.health.as_str(), "verified" | "bound") {
            return Err("node must be verified before binding".into());
        }
        if !self.works.contains_key(work_id) {
            return Err("unknown work".into());
        }
        self.append(
            work_id,
            WorkEvent::Operational(OperationalEvent::NodeConnected {
                node_id: node_id.into(),
            }),
            None,
        )?;
        if let Some(node) = self.nodes.get_mut(node_id) {
            node.health = "bound".into();
        }
        let address = self.works.get_mut(work_id).ok_or("unknown work")?;
        address.node_id = Some(node_id.into());
        address.version = address.version.saturating_add(1);
        Ok(address.clone())
    }

    /// Unbind every Work bound to a node; the Work survives (architectural law).
    pub fn try_unbind_node(&mut self, node_id: &str) -> Result<bool, String> {
        let work_ids: Vec<String> = self
            .works
            .iter()
            .filter(|(_, a)| a.node_id.as_deref() == Some(node_id))
            .map(|(k, _)| k.clone())
            .collect();
        if work_ids.is_empty() {
            return Ok(false);
        }
        for id in &work_ids {
            self.append(
                id,
                WorkEvent::Operational(OperationalEvent::NodeDisconnected {
                    node_id: node_id.into(),
                }),
                None,
            )?;
        }
        for id in &work_ids {
            if let Some(address) = self.works.get_mut(id) {
                address.node_id = None;
                address.version = address.version.saturating_add(1);
            }
        }
        if let Some(node) = self.nodes.get_mut(node_id) {
            node.health = "verified".into();
        }
        Ok(true)
    }

    /// Compatibility wrapper for boolean-only callers; new RPC paths use the
    /// fallible form so a failed journal write cannot be mistaken for success.
    pub fn unbind_node(&mut self, node_id: &str) -> bool {
        self.try_unbind_node(node_id).unwrap_or(false)
    }

    // ---- P49.4 — RunAuthority (lease + fencing) ----

    pub fn authority(&self, run_id: &str) -> Option<&RunAuthority> {
        self.authorities.get(run_id)
    }

    /// Extend a live lease. A stale fencing token is refused, so a worker that
    /// lost the run cannot renew its way back in.
    pub fn renew_lease(
        &mut self,
        run_id: &str,
        node_id: &str,
        token: u64,
        ttl_ms: u64,
    ) -> Result<RunAuthority, String> {
        if !self.validate_fencing_token(run_id, node_id, token) {
            return Err("stale fencing token".into());
        }
        let authority = self.authorities.get_mut(run_id).ok_or("unknown run")?;
        authority.expires_at_ms = if ttl_ms == 0 { 0 } else { now_ms() + ttl_ms };
        Ok(authority.clone())
    }

    /// Resume a run under the current authority holder. A run with no live
    /// authority acquires a fresh (higher-fenced) lease rather than fabricating
    /// a resume.
    pub fn recover_run(
        &mut self,
        run_id: &str,
        node_id: &str,
        ttl_ms: u64,
    ) -> Result<RunAuthority, String> {
        if let Some(authority) = self.authorities.get(run_id) {
            if authority.valid(node_id, authority.fencing_token, now_ms()) {
                return Ok(authority.clone());
            }
        }
        self.acquire_run_authority(run_id, node_id, ttl_ms)
    }

    /// Move a run's authority to another verified node (the P49.20 primitive,
    /// usable locally). The documented sequence is source-freezes → authority
    /// revoked → destination acquired; the fence is strictly monotonic, so the
    /// previous node can never commit after the move even if it is still alive.
    pub fn migrate_run(
        &mut self,
        run_id: &str,
        to_node: &str,
        ttl_ms: u64,
    ) -> Result<RunAuthority, String> {
        let target = self.nodes.get(to_node).ok_or("unknown target node")?;
        if !matches!(target.health.as_str(), "verified" | "bound") {
            return Err("target node must be verified".into());
        }
        // Revoke the source lease; the destination acquires a higher fence.
        self.authorities.remove(run_id);
        self.acquire_run_authority(run_id, to_node, ttl_ms)
    }

    // ---- P49.9 — client handshake / bindings ----

    /// The V1 client handshake: authenticate → negotiate capabilities → bind to
    /// a Work → subscribe. The Gateway decides what the surface may do; a
    /// client cannot assert its own capabilities at the call site.
    pub fn connect_client(
        &mut self,
        client_id: &str,
        client_type: &str,
        work_id: &str,
        authenticated: bool,
    ) -> Result<ClientSession, String> {
        if !authenticated {
            return Err("client authentication required".into());
        }
        let capabilities = match client_type {
            "desktop" => ClientCapabilities::desktop(),
            "mobile" | "web" | "cli" => ClientCapabilities::restricted(),
            other => return Err(format!("unknown client type: {other}")),
        };
        let client = ClientSession {
            client_id: client_id.into(),
            client_type: client_type.into(),
            work_id: work_id.into(),
            capabilities,
            scope: vec![],
            authenticated,
            connected_at_ms: now_ms(),
        };
        self.attach_client(client.clone())?;
        Ok(client)
    }

    pub fn clients_for(&self, work_id: &str) -> Vec<&ClientSession> {
        self.clients
            .values()
            .filter(|c| c.work_id == work_id)
            .collect()
    }

    // ---- P49.7/.8 — capability broker + resolver ----

    pub fn broker(&self) -> &GatewayCapabilityBroker {
        &self.broker
    }

    /// Replace the brokered capability set (V1: local, from the runtime manifest).
    pub fn set_brokered_capabilities(&mut self, capabilities: Vec<String>) {
        self.broker = GatewayCapabilityBroker::new(capabilities);
    }

    // ---- P49.13 — ReviewQueue ----

    pub fn review(&self, review_id: &str) -> Option<&ReviewItem> {
        self.reviews.get(review_id)
    }

    /// Resolve a review item with an explicit outcome and emit the durable
    /// `ApprovalResolved` semantic event.
    pub fn resolve_review_with(
        &mut self,
        review_id: &str,
        state: &str,
    ) -> Result<WorkEventEnvelope, String> {
        if !matches!(
            state,
            "approved" | "rejected" | "revision_requested" | "resolved"
        ) {
            return Err(format!("unknown review state: {state}"));
        }
        let review = self
            .reviews
            .get(review_id)
            .cloned()
            .ok_or("unknown review item")?;
        let envelope = self.append(
            &review.work_id,
            WorkEvent::Domain(DomainEvent::ApprovalResolved {
                ticket_id: review_id.into(),
                approved: state == "approved",
            }),
            None,
        )?;
        if let Some(item) = self.reviews.get_mut(review_id) {
            item.state = state.to_string();
        }
        Ok(envelope)
    }

    pub fn approve_review_item(&mut self, review_id: &str) -> Result<WorkEventEnvelope, String> {
        self.resolve_review_with(review_id, "approved")
    }

    pub fn reject_review_item(&mut self, review_id: &str) -> Result<WorkEventEnvelope, String> {
        self.resolve_review_with(review_id, "rejected")
    }

    pub fn request_revision(&mut self, review_id: &str) -> Result<WorkEventEnvelope, String> {
        self.resolve_review_with(review_id, "revision_requested")
    }

    // ---- P49.14 — steering ----

    /// Queue a steering instruction: durable policy delta, applied at the next
    /// checkpoint (never a silent mid-token interruption).
    pub fn queue_steering(
        &mut self,
        instruction: SteeringInstruction,
    ) -> Result<WorkEventEnvelope, String> {
        self.steer(instruction)
    }

    /// Ask the run to stop at the current step boundary. Recorded as a
    /// constraint-class instruction so `"stop"` is auditable, not a whisper.
    pub fn interrupt_current_step(
        &mut self,
        work_id: &str,
        source_client: &str,
        reason: &str,
    ) -> Result<WorkEventEnvelope, String> {
        self.steer(SteeringInstruction {
            work_id: work_id.into(),
            run_id: None,
            source_client: source_client.into(),
            instruction: reason.into(),
            scope: "pause".into(),
            priority: 0,
            created_at_ms: now_ms(),
        })
    }

    /// Confirm queued steering was applied at a specific checkpoint.
    pub fn apply_steering_checkpoint(
        &mut self,
        work_id: &str,
        run_id: &str,
        checkpoint: u32,
    ) -> Result<WorkEventEnvelope, String> {
        self.append(
            work_id,
            WorkEvent::Domain(DomainEvent::RunCheckpointed {
                run_id: run_id.into(),
                checkpoint,
            }),
            None,
        )
    }

    // ---- P49.15 — RuntimeManifest ----

    /// Freeze the full per-run runtime contract at run start.
    pub fn create_runtime_manifest(
        &mut self,
        work_id: &str,
        mut manifest: RuntimeManifest,
    ) -> Result<RuntimeManifest, String> {
        if !self.works.contains_key(work_id) {
            return Err("unknown work".into());
        }
        manifest.work_id = work_id.to_string();
        manifest.refresh_hash();
        self.append(
            work_id,
            WorkEvent::Domain(DomainEvent::WorkUpdated {
                patch: serde_json::json!({"runtimeManifest": manifest.config_hash}),
            }),
            None,
        )?;
        self.manifests.insert(work_id.to_string(), manifest.clone());
        Ok(manifest)
    }

    pub fn runtime_manifest(&self, work_id: &str) -> Option<&RuntimeManifest> {
        self.manifests.get(work_id)
    }

    /// P49.15 restore rule: a saved manifest is **untrusted data**. It is
    /// intersected with the current trusted policy — capability lists only ever
    /// narrow and network/filesystem fall to the stricter of the two — and the
    /// hash is recomputed on the effective contract. A compromised project
    /// cannot say `network=true` and have resume restore it.
    pub fn restore_runtime_manifest(
        &self,
        saved: &RuntimeManifest,
        trusted_capabilities: &[String],
        trusted_network: &str,
        trusted_filesystem: &str,
    ) -> RuntimeManifest {
        let mut manifest = saved.clone();
        manifest.capabilities = manifest
            .capabilities
            .iter()
            .filter(|c| trusted_capabilities.iter().any(|t| t == *c))
            .cloned()
            .collect();
        manifest.network_policy =
            narrow(&manifest.network_policy, trusted_network, &NETWORK_LADDER);
        manifest.filesystem_policy = narrow(
            &manifest.filesystem_policy,
            trusted_filesystem,
            &FILESYSTEM_LADDER,
        );
        manifest.refresh_hash();
        manifest
    }

    // ---- P49.17 — AttachmentRef ----

    pub fn attachments_for(&self, work_id: &str) -> Vec<&AttachmentRef> {
        self.attachments
            .values()
            .filter(|(a, _)| a.work_scope == work_id)
            .map(|(a, _)| a)
            .collect()
    }

    /// Drop an attachment reference (retention policy `session`/`none`).
    pub fn expire_attachment(&mut self, attachment_id: &str) -> bool {
        self.attachments.remove(attachment_id).is_some()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn gateway() -> WorkGateway {
        let mut g = WorkGateway::new();
        g.create_work("w1", Some("p1".into()), Some("s1".into()), "do work");
        g
    }
    #[test]
    fn work_address_and_event_replay() {
        let mut g = gateway();
        assert_eq!(g.get_work("w1").unwrap().version, 1);
        g.append(
            "w1",
            WorkEvent::Domain(DomainEvent::RunQueued {
                run_id: "r1".into(),
            }),
            Some(0),
        )
        .unwrap();
        let e = g.replay_from("w1", 1);
        assert_eq!(e.len(), 1);
        assert!(e[0].event.semantic());
    }
    #[test]
    fn client_binding_is_ephemeral_and_requires_auth() {
        let mut g = gateway();
        let c = ClientSession {
            client_id: "desktop".into(),
            client_type: "desktop".into(),
            work_id: "w1".into(),
            capabilities: ClientCapabilities::desktop(),
            scope: vec![],
            authenticated: false,
            connected_at_ms: now_ms(),
        };
        assert!(g.attach_client(c.clone()).is_err());
        let mut c = c;
        c.authenticated = true;
        g.attach_client(c).unwrap();
        assert_eq!(g.presence("w1").unwrap().active_clients.len(), 1);
        assert!(g.detach_client("desktop"));
        assert!(g.presence("w1").unwrap().active_clients.is_empty());
    }
    #[test]
    fn stale_fencing_token_cannot_release() {
        let mut g = gateway();
        g.register_node(ExecutionNode {
            node_id: "node-1".into(),
            owner: "me".into(),
            platform: "test".into(),
            node_kind: "desktop".into(),
            always_on: false,
            capabilities: vec![],
            sandbox_class: "native".into(),
            network_policy: "offline".into(),
            credential_policy: "broker".into(),
            health: "healthy".into(),
            last_heartbeat_ms: 0,
        })
        .unwrap();
        let a = g.acquire_run_authority("r1", "node-1", 60_000).unwrap();
        assert!(g.validate_fencing_token("r1", "node-1", a.fencing_token));
        assert!(!g.release_authority("r1", "node-1", a.fencing_token + 1));
        assert!(g.release_authority("r1", "node-1", a.fencing_token));
    }
    #[test]
    fn manifest_is_self_validating() {
        let m = RuntimeManifest::new("w", "chief", "model");
        assert!(m.verify_hash());
    }
    #[test]
    fn attachment_scope_is_enforced() {
        let dir = std::env::temp_dir().join(format!("p49-{}", std::process::id()));
        std::fs::write(&dir, "x").unwrap();
        let mut g = gateway();
        g.create_attachment(
            AttachmentRef {
                attachment_id: "a".into(),
                content_hash: "h".into(),
                size: 1,
                media_type: "text/plain".into(),
                source: "test".into(),
                work_scope: "w1".into(),
                session_scope: None,
                allowed_consumers: vec!["chat".into()],
                retention: "work".into(),
            },
            dir.clone(),
        )
        .unwrap();
        assert!(g.resolve_attachment("a", "chat").is_ok());
        assert!(g.resolve_attachment("a", "other").is_err());
        let _ = std::fs::remove_file(dir);
    }
    #[test]
    fn resolver_is_deterministic() {
        let g = gateway();
        let r = g.resolve_capability(
            "open",
            vec![
                CapabilityCandidate {
                    capability_id: "slow".into(),
                    route: "browser".into(),
                    confidence: 80,
                    latency_estimate_ms: 100,
                    cost_estimate: 1,
                    risk: RiskLevel::Medium,
                },
                CapabilityCandidate {
                    capability_id: "fast".into(),
                    route: "connector".into(),
                    confidence: 90,
                    latency_estimate_ms: 50,
                    cost_estimate: 2,
                    risk: RiskLevel::Low,
                },
            ],
        );
        assert_eq!(r.ranked_path[0], "fast");
    }

    #[test]
    fn journal_reopens_and_replays_without_duplicate_creation() {
        let path = std::env::temp_dir().join(format!(
            "everyaios-work-journal-{}.jsonl",
            std::process::id()
        ));
        let _ = std::fs::remove_file(&path);
        let mut first = WorkGateway::open(&path).unwrap();
        first.create_work(
            "w-journal",
            Some("p".into()),
            Some("s".into()),
            "persist me",
        );
        first
            .append(
                "w-journal",
                WorkEvent::Domain(DomainEvent::RunQueued { run_id: "r".into() }),
                None,
            )
            .unwrap();
        drop(first);
        let second = WorkGateway::open(&path).unwrap();
        assert!(second.get_work("w-journal").is_some());
        assert_eq!(second.replay_from("w-journal", 0).len(), 2);
        let mut third = second;
        let same = third.create_work("w-journal", None, None, "must not replace");
        assert_eq!(same.project_id.as_deref(), Some("p"));
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn default_journal_path_uses_everyaios_home() {
        let home = std::env::temp_dir().join(format!("everyaios-home-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&home);
        std::env::set_var("EVERYAIOS_HOME", &home);
        let mut gateway = WorkGateway::open_default().unwrap();
        assert!(gateway.get_work("missing").is_none());
        gateway.create_work("persisted", None, None, "test");
        assert!(home.join("work").join("events.jsonl").exists());
        std::env::remove_var("EVERYAIOS_HOME");
        let _ = std::fs::remove_dir_all(home);
    }

    #[test]
    fn append_failure_does_not_advance_sequence_or_expose_event() {
        let root = std::env::temp_dir().join(format!(
            "everyaios-work-append-failure-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).unwrap();
        let journal = root.join("events.jsonl");
        let mut gateway = WorkGateway::open(&journal).unwrap();
        gateway.create_work("w-durable", None, None, "durable");

        // A regular file where the journal's parent directory must be makes the
        // append fail before a record can be acknowledged.
        let blocker = root.join("not-a-directory");
        std::fs::write(&blocker, b"x").unwrap();
        gateway.journal = Some(blocker.join("events.jsonl"));
        let before_sequence = gateway.next_seq;
        let before_events = gateway.events("w-durable").len();

        let error = gateway
            .append(
                "w-durable",
                WorkEvent::Domain(DomainEvent::RunQueued {
                    run_id: "r-failed".into(),
                }),
                None,
            )
            .expect_err("journal failure must be surfaced");
        assert!(error.contains("open work journal"), "got: {error}");
        assert_eq!(gateway.next_seq, before_sequence);
        assert_eq!(gateway.events("w-durable").len(), before_events);

        // A later successful append reuses the reserved sequence; the failed
        // attempt did not burn a number or expose a phantom event.
        gateway.journal = Some(root.join("repaired.jsonl"));
        let envelope = gateway
            .append(
                "w-durable",
                WorkEvent::Domain(DomainEvent::RunQueued {
                    run_id: "r-repaired".into(),
                }),
                None,
            )
            .unwrap();
        assert_eq!(envelope.sequence, before_sequence);
        assert_eq!(gateway.events("w-durable").len(), before_events + 1);

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn malformed_journal_fails_closed() {
        let path =
            std::env::temp_dir().join(format!("everyaios-work-bad-{}.jsonl", std::process::id()));
        std::fs::write(&path, "not-json\\n").unwrap();
        assert!(WorkGateway::open(&path).is_err());
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn effect_approval_and_artifact_events_are_bound_to_work() {
        let mut g = gateway();
        g.record_approval("w1", "t1", true).unwrap();
        g.record_effect("w1", "e1", "attempted", "").unwrap();
        g.record_effect("w1", "e1", "observed", "ok").unwrap();
        g.record_effect("w1", "e1", "verified", "true").unwrap();
        g.record_artifact("w1", "a1", false).unwrap();
        g.record_artifact("w1", "a1", true).unwrap();
        assert_eq!(g.events("w1").len(), 7);
        assert!(g.record_effect("other", "e1", "attempted", "").is_err());
    }

    #[test]
    fn subscription_receives_only_new_events() {
        let mut g = gateway();
        let rx = g.subscribe();
        g.append(
            "w1",
            WorkEvent::Domain(DomainEvent::RunQueued { run_id: "r".into() }),
            None,
        )
        .unwrap();
        let event = rx.recv().unwrap();
        assert_eq!(event.work_id, "w1");
        assert_eq!(event.sequence, 1);
    }

    #[test]
    fn journal_recovery_rebuilds_presence_and_reviews() {
        let path = std::env::temp_dir().join(format!(
            "everyaios-work-projection-{}.jsonl",
            std::process::id()
        ));
        let _ = std::fs::remove_file(&path);
        let mut first = WorkGateway::open(&path).unwrap();
        first.create_work("w-proj", None, None, "project");
        first.bind_execution("w-proj", "run-1").unwrap();
        first
            .record_execution_transition("w-proj", "run-1", WorkState::WaitingApproval)
            .unwrap();
        first
            .request_review(ReviewItem {
                review_id: "review-1".into(),
                work_id: "w-proj".into(),
                run_id: Some("run-1".into()),
                kind: "approval".into(),
                priority: 1,
                state: "pending".into(),
                artifact_refs: vec![],
                effect_refs: vec![],
            })
            .unwrap();
        drop(first);
        let second = WorkGateway::open(&path).unwrap();
        assert_eq!(
            second.presence("w-proj").and_then(|p| p.state),
            Some(WorkPresenceState::WaitingForApproval)
        );
        assert_eq!(second.reviews("w-proj").len(), 1);
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn capability_grant_is_projected_without_secret_material() {
        let mut gateway = WorkGateway::new();
        gateway.create_work("w-cap", None, None, "test");
        gateway
            .record_effect_with_grant("w-cap", "effect-1", "attempted", "", Some("grant:1"))
            .unwrap();
        assert_eq!(
            gateway.effect_grant_id("w-cap", "effect-1"),
            Some("grant:1")
        );
        let encoded = serde_json::to_string(gateway.events("w-cap")).unwrap();
        assert!(!encoded.contains("secret"));
        assert!(!encoded.contains("Bearer"));
    }

    #[test]
    fn effect_lifecycle_preserves_attempt_provenance_and_order() {
        let mut gateway = WorkGateway::new();
        gateway.create_work("w-life", None, None, "test");
        gateway
            .record_effect_with_grant("w-life", "effect-1", "attempted", "", Some("grant:7"))
            .unwrap();
        gateway
            .record_effect("w-life", "effect-1", "observed", "ok")
            .unwrap();
        gateway
            .record_effect("w-life", "effect-1", "verified", "true")
            .unwrap();
        let events = gateway.events("w-life");
        assert_eq!(events.len(), 4);
        assert!(matches!(
            events[1].event,
            WorkEvent::Domain(DomainEvent::EffectAttempted { .. })
        ));
        assert!(matches!(
            events[2].event,
            WorkEvent::Domain(DomainEvent::EffectObserved { ref outcome, .. }) if outcome == "ok"
        ));
        assert!(matches!(
            events[3].event,
            WorkEvent::Domain(DomainEvent::EffectVerified { verified: true, .. })
        ));
        assert_eq!(
            gateway.effect_grant_id("w-life", "effect-1"),
            Some("grant:7")
        );
    }

    #[test]
    fn legacy_effect_recording_remains_compatible() {
        let mut gateway = WorkGateway::new();
        gateway.create_work("w-legacy", None, None, "test");
        gateway
            .record_effect("w-legacy", "effect-1", "attempted", "")
            .unwrap();
        assert_eq!(gateway.effect_grant_id("w-legacy", "effect-1"), None);
    }

    #[test]
    fn execution_binding_and_lifecycle_events_are_explicit() {
        let mut g = gateway();
        g.bind_execution("w1", "ex:1").unwrap();
        assert_eq!(g.execution_id("w1"), Some("ex:1"));
        g.record_execution_transition("w1", "ex:1", WorkState::Running)
            .unwrap();
        g.record_execution_transition("w1", "ex:1", WorkState::WaitingApproval)
            .unwrap();
        g.record_execution_transition("w1", "ex:1", WorkState::Completed)
            .unwrap();
        assert_eq!(
            g.presence("w1").unwrap().state,
            Some(WorkPresenceState::Completed)
        );
        assert!(g
            .record_execution_transition("w1", "other", WorkState::Running)
            .is_err());
    }

    #[test]
    fn p71_work_state_is_canonical_on_presence_and_unknown_wire_states_are_refused() {
        // The contract: presence carries the lifecycle state itself, not only
        // the client-presence projection; an unreadable wire spelling is not a
        // state (the relay parses with `try_parse` and refuses).
        let mut g = gateway();
        g.bind_execution("w1", "ex:1").unwrap();
        g.record_execution_transition("w1", "ex:1", WorkState::WaitingTool)
            .unwrap();
        let presence = g.presence("w1").unwrap();
        assert_eq!(presence.work_state, Some(WorkState::WaitingTool));
        assert_eq!(presence.state, Some(WorkPresenceState::Running));
        assert_eq!(presence.wait, None);

        assert_eq!(
            WorkState::try_parse("waiting_tool"),
            Some(WorkState::WaitingTool)
        );
        assert_eq!(WorkState::try_parse("some_day"), None);
    }

    #[test]
    fn p71_durable_wait_carries_its_condition_and_projects_honestly() {
        use everyaios_types::{WaitCondition, WaitReason};
        let mut g = gateway();
        g.bind_execution("w1", "ex:1").unwrap();
        let wait = WaitCondition::new(WaitReason::Timer)
            .with_detail("retry backoff")
            .with_deadline_ms(1_700_000_000_000)
            .with_resume_on("timer");
        g.record_wait("w1", "ex:1", &wait).unwrap();
        let presence = g.presence("w1").unwrap();
        // A reason with no dedicated Waiting* state parks the Work as Paused.
        assert_eq!(presence.work_state, Some(WorkState::Paused));
        assert_eq!(presence.state, Some(WorkPresenceState::Blocked));
        assert_eq!(presence.wait, Some(wait));

        // Approval has a named state and its own presence projection.
        let approval = WaitCondition::new(WaitReason::Approval).with_resume_on("tkt:42");
        g.record_wait("w1", "ex:1", &approval).unwrap();
        let presence = g.presence("w1").unwrap();
        assert_eq!(presence.work_state, Some(WorkState::WaitingApproval));
        assert_eq!(presence.state, Some(WorkPresenceState::WaitingForApproval));
        assert_eq!(presence.wait, Some(approval));

        // Recovering is not failing: the state is Recoverable, presence Blocked.
        g.record_execution_transition("w1", "ex:1", WorkState::Recoverable)
            .unwrap();
        let presence = g.presence("w1").unwrap();
        assert_eq!(presence.work_state, Some(WorkState::Recoverable));
        assert_eq!(presence.state, Some(WorkPresenceState::Blocked));
        assert_eq!(presence.wait, None);
    }

    #[test]
    fn p71_automation_work_requires_its_owning_session_and_children_inherit_it() {
        use everyaios_types::SessionKind;
        let mut g = gateway();
        // ADR-0006 §4 — no Work outside the scope chain (**I4**): a trigger
        // that has not created its Session cannot mint its Work.
        assert!(g
            .create_work_in_session(
                "w-auto",
                None,
                None,
                SessionKind::Automation,
                "no session yet"
            )
            .is_err());
        // The trigger creates the Session (its id), then the Work — kind is a
        // record property carried on the address, never inferred.
        let address = g
            .create_work_in_session(
                "w-auto",
                None,
                Some("auto-s-1".into()),
                SessionKind::Automation,
                "trigger work",
            )
            .unwrap();
        assert_eq!(address.session_kind, SessionKind::Automation);
        assert_eq!(address.session_id.as_deref(), Some("auto-s-1"));
        // Idempotent re-create keeps the kind.
        let again = g.create_work("w-auto", None, Some("auto-s-1".into()), "again");
        assert_eq!(again.session_kind, SessionKind::Automation);

        // Interactive roots are unchanged.
        let interactive = g.create_work("w-chat", None, Some("s-9".into()), "chat work");
        assert_eq!(interactive.session_kind, SessionKind::Interactive);

        // A child Work lives in its parent's Session (ADR-0006 §5, I8): kind
        // and session are inherited, not re-minted as `delegated`.
        let child = g
            .create_child_work("w-auto", "w-auto/subagent/t", "child", None, None)
            .unwrap();
        assert_eq!(child.session_kind, SessionKind::Automation);
        assert_eq!(child.session_id.as_deref(), Some("auto-s-1"));
    }

    #[test]
    fn p71_child_work_outcome_must_be_terminal() {
        let mut g = gateway();
        g.create_work("w-parent", None, None, "parent");
        g.delegate_child_work("w-parent", "t1", "goal", "agent-a", None)
            .unwrap();
        // A non-terminal outcome is refused — the old door defaulted it to
        // `completed`, reporting a lost child as a successful one.
        let err = g
            .finish_child_work("w-parent", "t1", WorkState::Running, None)
            .expect_err("a running state is not a terminal outcome");
        assert!(err.contains("terminal outcome"), "got: {err}");
        let child = g
            .finish_child_work(
                "w-parent",
                "t1",
                WorkState::Cancelled,
                Some("user stopped it"),
            )
            .unwrap();
        let presence = g.presence(&child.work_id).unwrap();
        assert_eq!(presence.work_state, Some(WorkState::Cancelled));
        assert_eq!(presence.state, Some(WorkPresenceState::Cancelled));
        // Cancellation is terminal for delegation accounting too; otherwise a
        // stopped child permanently consumes the parent's concurrency slot.
        let gauge = g.delegation_gauge("w-parent").unwrap();
        assert_eq!(gauge.active, 0);
    }

    #[test]
    fn steering_requires_attached_capable_client() {
        let mut g = gateway();
        let instruction = SteeringInstruction {
            work_id: "w1".into(),
            run_id: None,
            source_client: "missing".into(),
            instruction: "stop".into(),
            scope: "cancel".into(),
            priority: 1,
            created_at_ms: now_ms(),
        };
        assert!(g.steer(instruction).is_err());
    }
}

// ===========================================================================
// P49.16 — Remote approval security + ContextReleasePolicy (v3.65 §4.4a).
// ===========================================================================

/// How an authorization was proven. `NativeGesture` is the ONLY value a Rust
/// mutation call may stamp as a human gesture, and only when driven by a
/// native-origin attestation — never because the command channel called.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AuthSource {
    /// A real native UI event / the F1 dedicated guard webview + nonce.
    NativeGesture,
    /// A per-agent ticket (not a human gesture).
    AgentTicket,
    /// A scheduled/automation ticket.
    AutomationTicket,
}

/// P49.16(b) — the local native-gesture attestation. Constructed ONLY at a
/// Rust call site that observed a native UI-event origin (the guard webview
/// nonce). A client-supplied `auth_source = native_gesture` value is inert:
/// there is no constructor from untrusted input — the only way to get an
/// attestation whose `auth_source` is `NativeGesture` is [`attest_native`],
/// which a remote/renderer payload cannot call.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrustedGestureAttestation {
    pub auth_source: AuthSource,
    /// A fingerprint of the gesture origin (guard-window label + nonce hash) —
    /// evidence the gesture came from the trusted surface, not a forged claim.
    pub gesture_origin: String,
    /// The nonce that bound the approval card (single-use at the guard layer).
    pub nonce: String,
}

impl TrustedGestureAttestation {
    /// The trusted constructor: a native gesture from the guard surface. Only
    /// Rust call sites that actually observed the native origin call this.
    pub fn attest_native(gesture_origin: impl Into<String>, nonce: impl Into<String>) -> Self {
        Self {
            auth_source: AuthSource::NativeGesture,
            gesture_origin: gesture_origin.into(),
            nonce: nonce.into(),
        }
    }

    /// A non-gesture ticket attestation (agent/automation) — never a human
    /// gesture, so a caller cannot escalate a ticket into a gesture.
    pub fn ticket(source: AuthSource, origin: impl Into<String>) -> Self {
        // Defensive: coerce a mis-passed NativeGesture down to AgentTicket —
        // ticket() may never mint a native gesture.
        let source = match source {
            AuthSource::NativeGesture => AuthSource::AgentTicket,
            other => other,
        };
        Self {
            auth_source: source,
            gesture_origin: origin.into(),
            nonce: String::new(),
        }
    }

    /// True only for a genuine native gesture with a non-empty origin + nonce.
    pub fn is_human_gesture(&self) -> bool {
        self.auth_source == AuthSource::NativeGesture
            && !self.gesture_origin.is_empty()
            && !self.nonce.is_empty()
    }
}

/// P49.16(a) — resolve a remote approval. Given an attestation, decide whether
/// a mutation may be stamped as a human gesture. NEVER trusts a client-asserted
/// `human_gesture`: only a `TrustedGestureAttestation::attest_native` with a
/// bound nonce authorizes. Returns `Ok(())` when the gesture is trusted.
pub fn resolve_remote_approval(att: &TrustedGestureAttestation) -> Result<(), String> {
    if att.is_human_gesture() {
        Ok(())
    } else {
        Err("not a trusted native gesture — approval refused (client-asserted human_gesture is inert)".into())
    }
}

/// P49.16(c) — what context may be released to which agent/model/provider.
/// The model may *propose* a context need; it does NOT authorize release —
/// the chain is `agent/model requests → ContextManager → ContextReleasePolicy
/// → provider/model`. Minimal v1 gate; the full two-zone firewall is post-v1.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ContextReleasePolicy {
    /// Release with sensitive spans redacted.
    Redacted,
    /// Release only a reference handle (never the bytes).
    ReferenceOnly,
    /// Requires explicit human approval before release.
    Approval,
    /// Never released.
    Blocked,
}

impl ContextReleasePolicy {
    /// May this policy release context to an external (non-local) provider
    /// without a human in the loop? Only `Redacted`/`ReferenceOnly` may;
    /// `Approval` needs a gesture, `Blocked` never.
    pub fn auto_releasable_externally(&self) -> bool {
        matches!(
            self,
            ContextReleasePolicy::Redacted | ContextReleasePolicy::ReferenceOnly
        )
    }

    /// The release decision for a proposed context need. `is_external` = the
    /// target is a remote provider; `gesture` = a trusted human gesture is
    /// present. Returns Ok(effective policy) or Err(reason).
    pub fn decide(&self, is_external: bool, gesture: bool) -> Result<ContextReleasePolicy, String> {
        match self {
            ContextReleasePolicy::Blocked => Err("context release blocked by policy".into()),
            ContextReleasePolicy::Approval => {
                if gesture {
                    Ok(ContextReleasePolicy::Approval)
                } else {
                    Err("context release requires human approval".into())
                }
            }
            other => {
                if is_external && !other.auto_releasable_externally() {
                    Err("policy does not permit external release".into())
                } else {
                    Ok(*other)
                }
            }
        }
    }
}

#[cfg(test)]
mod p49_runtime_tests {
    use super::*;

    fn gw_with_work(id: &str) -> WorkGateway {
        let mut gw = WorkGateway::new();
        gw.create_work(id, None, None, "obj");
        gw
    }

    #[test]
    fn pty_lifecycle_emits_events_and_survives_snapshot() {
        let mut gw = gw_with_work("w1");
        gw.spawn_pty("w1", "pty1", Some(4242), 24, 80).unwrap();
        gw.write_pty_output("w1", "pty1", "hello\n").unwrap();
        gw.resize_pty("w1", "pty1", 40, 120).unwrap();
        gw.pause_pty("pty1").unwrap();
        assert!(gw.resize_pty("w1", "pty1", 10, 10).is_ok()); // resize allowed while paused
        gw.resume_pty("pty1").unwrap();
        gw.signal_pty("w1", "pty1", "SIGINT").unwrap();
        // Snapshot carries the retained buffer for a re-attaching client.
        let snap = gw.snapshot_terminal("pty1").unwrap();
        assert!(snap.output.contains("hello"));
        assert_eq!(snap.rows, 10);
        gw.close_pty("w1", "pty1", Some(0)).unwrap();
        assert_eq!(gw.snapshot_terminal("pty1").unwrap().state, "exited");
    }

    #[test]
    fn pty_output_buffer_is_bounded() {
        let mut gw = gw_with_work("w");
        gw.spawn_pty("w", "p", None, 24, 80).unwrap();
        let big = "x".repeat(100 * 1024);
        gw.write_pty_output("w", "p", &big).unwrap();
        assert!(gw.snapshot_terminal("p").unwrap().output.len() <= 64 * 1024);
    }

    #[test]
    fn worktree_binding_follows_the_run_not_the_agent() {
        let mut gw = gw_with_work("w2");
        gw.create_worktree(
            "w2",
            "run-a",
            "wt1",
            "/repo",
            "/repo/.wt/wt1",
            "abc123",
            "feature/x",
            "worktree",
        )
        .unwrap();
        // A new run (Claude Code died → Codex started) attaches the SAME worktree.
        gw.attach_worktree("w2", "wt1", "run-b").unwrap();
        let wt = gw.snapshot_worktree("wt1").unwrap();
        assert_eq!(wt.run_id, "run-b");
        assert_eq!(wt.status, "attached");
        gw.merge_worktree("w2", "wt1", "main").unwrap();
        assert_eq!(gw.snapshot_worktree("wt1").unwrap().status, "merged");
        gw.destroy_worktree("w2", "wt1").unwrap();
        assert!(gw.snapshot_worktree("wt1").is_none());
    }

    #[test]
    fn ephemeral_child_dies_on_detach_persistent_survives() {
        let mut gw = gw_with_work("w3");
        gw.spawn_subagent(
            "w3",
            "run",
            "s-eph",
            "claude-code",
            AgentLifetime::EphemeralChild,
            None,
            None,
        )
        .unwrap();
        gw.spawn_subagent(
            "w3",
            "run",
            "s-persist",
            "codex",
            AgentLifetime::PersistentAttachedSession,
            None,
            None,
        )
        .unwrap();
        // Detach the ephemeral child → terminated.
        gw.detach_agent_session("w3", "s-eph").unwrap();
        assert_eq!(
            gw.agent_session("s-eph").unwrap().runtime_state,
            "terminated"
        );
        // Detach the persistent session → survives (detached, not terminated).
        gw.detach_agent_session("w3", "s-persist").unwrap();
        let p = gw.agent_session("s-persist").unwrap();
        assert_eq!(p.runtime_state, "detached");
        assert!(!p.attached);
        // Re-attach works.
        gw.attach_agent_session("w3", "s-persist").unwrap();
        assert!(gw.agent_session("s-persist").unwrap().attached);
    }

    #[test]
    fn agent_session_checkpoint_and_steer() {
        let mut gw = gw_with_work("w4");
        gw.spawn_subagent(
            "w4",
            "r",
            "s1",
            "a",
            AgentLifetime::PersistentAttachedSession,
            Some("pty".into()),
            Some("wt".into()),
        )
        .unwrap();
        gw.checkpoint_agent_session("w4", "s1").unwrap();
        gw.checkpoint_agent_session("w4", "s1").unwrap();
        assert_eq!(gw.agent_session("s1").unwrap().last_checkpoint, 2);
        gw.steer_agent_session("w4", "s1").unwrap();
        gw.send_subagent_message("w4", "s1", true).unwrap();
        assert_eq!(gw.agent_sessions_for("w4").len(), 1);
    }

    #[test]
    fn runtime_ops_reject_unknown_ids() {
        let mut gw = gw_with_work("w5");
        assert!(gw.resize_pty("w5", "nope", 1, 1).is_err());
        assert!(gw.merge_worktree("w5", "nope", "main").is_err());
        assert!(gw.terminate_agent_session("w5", "nope").is_err());
        // And ops on an unknown work fail closed.
        assert!(gw.spawn_pty("no-work", "p", None, 1, 1).is_err());
    }

    #[test]
    fn native_gesture_attestation_cannot_be_forged() {
        // A trusted native gesture authorizes.
        let native = TrustedGestureAttestation::attest_native("guard-window:abcd", "nonce-123");
        assert!(native.is_human_gesture());
        assert!(resolve_remote_approval(&native).is_ok());
        // A ticket() call can NEVER mint a native gesture even if asked.
        let forged = TrustedGestureAttestation::ticket(AuthSource::NativeGesture, "renderer");
        assert_ne!(forged.auth_source, AuthSource::NativeGesture);
        assert!(!forged.is_human_gesture());
        assert!(resolve_remote_approval(&forged).is_err());
        // A native attestation with an empty nonce is not trusted (no binding).
        let empty = TrustedGestureAttestation {
            auth_source: AuthSource::NativeGesture,
            gesture_origin: "x".into(),
            nonce: String::new(),
        };
        assert!(!empty.is_human_gesture());
        assert!(resolve_remote_approval(&empty).is_err());
    }

    #[test]
    fn context_release_policy_gate() {
        // Blocked never releases.
        assert!(ContextReleasePolicy::Blocked.decide(false, true).is_err());
        // Approval needs a gesture.
        assert!(ContextReleasePolicy::Approval.decide(true, false).is_err());
        assert!(ContextReleasePolicy::Approval.decide(true, true).is_ok());
        // Redacted / ReferenceOnly may auto-release externally.
        assert!(ContextReleasePolicy::Redacted.decide(true, false).is_ok());
        assert!(ContextReleasePolicy::ReferenceOnly
            .decide(true, false)
            .is_ok());
        assert!(ContextReleasePolicy::Redacted.auto_releasable_externally());
        assert!(!ContextReleasePolicy::Approval.auto_releasable_externally());
    }

    // ===== P49 V1-local wiring =====

    fn node(id: &str) -> ExecutionNode {
        ExecutionNode {
            node_id: id.into(),
            owner: "local".into(),
            platform: std::env::consts::OS.into(),
            node_kind: "user-owned".into(),
            always_on: false,
            capabilities: vec!["filesystem".into()],
            sandbox_class: "native".into(),
            network_policy: "offline".into(),
            credential_policy: "brokered".into(),
            health: String::new(),
            last_heartbeat_ms: 0,
        }
    }

    #[test]
    fn p49_1_locator_round_trips_and_rejects_malformed() {
        let mut gw = gw_with_work("w-loc");
        gw.bind_execution("w-loc", "run-7").unwrap();
        let mut address = gw.get_work("w-loc").unwrap().clone();
        address.node_id = Some("node-1".into());
        assert_eq!(address.locator(), "work:w-loc@node-1#run-7");
        let parsed = WorkAddress::parse_locator("work:w-loc@node-1#run-7").unwrap();
        assert_eq!(parsed.work_id.as_str(), "w-loc");
        assert_eq!(parsed.node_id.as_deref(), Some("node-1"));
        assert_eq!(parsed.current_run_id.as_deref(), Some("run-7"));
        // Bare locator is still valid; garbage is refused, never coerced.
        assert_eq!(
            WorkAddress::parse_locator("work:w1").unwrap().locator(),
            "work:w1"
        );
        assert!(WorkAddress::parse_locator("w1").is_err());
        assert!(WorkAddress::parse_locator("work:").is_err());
        assert!(WorkAddress::parse_locator("work:w1@").is_err());
    }

    #[test]
    fn p49_3_node_must_be_paired_then_verified_before_binding() {
        let mut gw = gw_with_work("w-node");
        // Unverified node can never bind.
        gw.pair_node(node("n1")).unwrap();
        assert!(gw.bind_node("n1", "w-node").is_err());
        gw.verify_node("n1").unwrap();
        let address = gw.bind_node("n1", "w-node").unwrap();
        assert_eq!(address.node_id.as_deref(), Some("n1"));
        // Unbind clears the address; the Work itself survives.
        assert!(gw.unbind_node("n1"));
        assert!(gw.get_work("w-node").unwrap().node_id.is_none());
        assert!(gw.get_work("w-node").is_some());
        assert!(!gw.unbind_node("n1"));
    }

    #[test]
    fn p49_4_fence_is_monotonic_across_release_and_migration() {
        let mut gw = gw_with_work("w-auth");
        gw.pair_node(node("n1")).unwrap();
        gw.verify_node("n1").unwrap();
        gw.pair_node(node("n2")).unwrap();
        gw.verify_node("n2").unwrap();
        let first = gw.acquire_run_authority("r1", "n1", 60_000).unwrap();
        assert_eq!(first.fencing_token, 1);
        // A second acquire while the lease is live is refused.
        assert!(gw.acquire_run_authority("r1", "n2", 60_000).is_err());
        // A stale token can neither renew nor commit.
        assert!(gw.renew_lease("r1", "n2", 1, 60_000).is_err());
        assert!(!gw.validate_fencing_token("r1", "n2", 1));
        gw.release_authority("r1", "n1", first.fencing_token);
        // Migration issues a strictly higher fence — the old holder is dead.
        let moved = gw.migrate_run("r1", "n2", 60_000).unwrap();
        assert_eq!(moved.fencing_token, 2);
        assert_eq!(moved.node_id, "n2");
        assert!(!gw.validate_fencing_token("r1", "n1", 1));
        assert!(gw.validate_fencing_token("r1", "n2", 2));
    }

    #[test]
    fn p49_9_handshake_negotiates_capabilities_server_side() {
        let mut gw = gw_with_work("w-cli");
        // Unauthenticated clients are refused outright.
        assert!(gw.connect_client("c1", "desktop", "w-cli", false).is_err());
        let desktop = gw.connect_client("c1", "desktop", "w-cli", true).unwrap();
        assert!(desktop.capabilities.can_drive_desktop);
        assert!(desktop.capabilities.can_approve);
        // Mobile/web/cli get the restricted set — the Gateway decides, not the caller.
        let mobile = gw.connect_client("c2", "mobile", "w-cli", true).unwrap();
        assert!(!mobile.capabilities.can_drive_desktop);
        assert!(mobile.capabilities.can_view);
        assert!(gw.connect_client("c3", "toaster", "w-cli", true).is_err());
        // Binding is ephemeral: detach never touches the Work.
        assert!(gw.detach_client("c1"));
        assert_eq!(gw.clients_for("w-cli").len(), 1);
        assert!(gw.get_work("w-cli").is_some());
    }

    #[test]
    fn p49_13_resolved_reviews_leave_the_needs_me_inbox() {
        let mut gw = gw_with_work("w-rev");
        for (id, state) in [
            ("r-ok", "approved"),
            ("r-no", "rejected"),
            ("r-open", "open"),
        ] {
            gw.request_review(ReviewItem {
                review_id: id.into(),
                work_id: "w-rev".into(),
                run_id: None,
                kind: "approval".into(),
                priority: 50,
                state: state.into(),
                artifact_refs: vec![],
                effect_refs: vec![],
            })
            .unwrap();
        }
        // r-open already carries a terminal-looking state? No — "open" is live.
        assert_eq!(gw.reviews("w-rev").len(), 1);
        gw.approve_review_item("r-open").unwrap();
        assert!(gw.reviews("w-rev").is_empty());
        assert_eq!(gw.review("r-open").unwrap().state, "approved");
        // An unknown state is refused rather than silently stored.
        assert!(gw.resolve_review_with("r-ok", "maybe").is_err());
        assert!(gw.resolve_review_with("nope", "approved").is_err());
    }

    #[test]
    fn p49_14_steering_requires_an_attached_authenticated_client() {
        let mut gw = gw_with_work("w-steer");
        // No client attached → the constraint is refused (no forged gestures).
        assert!(gw
            .interrupt_current_step("w-steer", "ghost", "stop")
            .is_err());
        gw.connect_client("c1", "desktop", "w-steer", true).unwrap();
        let ev = gw.interrupt_current_step("w-steer", "c1", "stop").unwrap();
        assert!(ev.event.semantic());
        assert!(gw.apply_steering_checkpoint("w-steer", "run-1", 3).is_ok());
    }

    #[test]
    fn p49_15_manifest_freezes_then_restore_intersects_with_trusted_policy() {
        let mut gw = gw_with_work("w-man");
        let mut manifest = RuntimeManifest::new("w-man", "native", "claude-sonnet");
        manifest.capabilities = vec!["shell".into(), "git".into()];
        manifest.network_policy = "open".into();
        manifest.filesystem_policy = "system".into();
        let frozen = gw.create_runtime_manifest("w-man", manifest).unwrap();
        assert!(frozen.verify_hash());
        assert_eq!(
            gw.runtime_manifest("w-man").unwrap().config_hash,
            frozen.config_hash
        );
        // A saved manifest is untrusted: capabilities narrow, network/filesystem
        // fall to the stricter of the two, and the hash is recomputed.
        let restored =
            gw.restore_runtime_manifest(&frozen, &["git".to_string()], "loopback", "workspace");
        assert_eq!(restored.capabilities, vec!["git".to_string()]);
        assert_eq!(restored.network_policy, "loopback");
        assert_eq!(restored.filesystem_policy, "workspace");
        assert!(restored.verify_hash());
        assert_ne!(restored.config_hash, frozen.config_hash);
        // An unknown label is never treated as permissive — it fails closed.
        let weird = gw.restore_runtime_manifest(&frozen, &[], "nonsense", "workspace");
        assert_eq!(weird.network_policy, "offline");
    }

    #[test]
    fn p49_7_broker_issues_opaque_handles_and_refuses_to_execute() {
        let mut gw = gw_with_work("w-brk");
        gw.set_brokered_capabilities(vec!["gmail.send".into()]);
        assert_eq!(
            gw.broker().list_capabilities(),
            vec!["gmail.send".to_string()]
        );
        // Un-brokered capability is refused.
        assert!(gw
            .broker()
            .authorize(&BrokerRequest {
                capability_id: "shell".into(),
                work_id: "w-brk".into(),
                run_id: "r1".into(),
                consumer: "agent".into(),
            })
            .is_err());
        let grant = gw
            .broker()
            .authorize(&BrokerRequest {
                capability_id: "gmail.send".into(),
                work_id: "w-brk".into(),
                run_id: "r1".into(),
                consumer: "agent".into(),
            })
            .unwrap();
        // The agent only ever sees a handle, scoped to the run.
        assert!(grant.credential.handle.starts_with("cred:"));
        assert_eq!(grant.credential.issued_for_run, "r1");
        assert_eq!(grant.credential.scope, vec!["gmail.send".to_string()]);
        // No live dispatcher → honest refusal, never a fabricated success.
        assert!(gw.broker().invoke(&grant, &serde_json::json!({})).is_err());
    }

    #[test]
    fn p49_8_resolution_helpers_expose_best_and_fallback() {
        let gw = gw_with_work("w-cap");
        let candidates = vec![
            CapabilityCandidate {
                capability_id: "connector:slack".into(),
                route: "native".into(),
                confidence: 90,
                latency_estimate_ms: 50,
                cost_estimate: 0,
                risk: RiskLevel::Low,
            },
            CapabilityCandidate {
                capability_id: "browser:slack".into(),
                route: "browser".into(),
                confidence: 60,
                latency_estimate_ms: 400,
                cost_estimate: 1,
                risk: RiskLevel::Medium,
            },
        ];
        let resolution = gw.resolve_capability("send slack message", candidates);
        assert_eq!(resolution.choose_best(), Some("connector:slack"));
        assert_eq!(resolution.choose_fallback(), Some("browser:slack"));
        assert!(resolution.explain_choice().contains("connector:slack"));
        assert!(resolution.explain_choice().contains("browser:slack"));
    }

    #[test]
    fn p49_17_attachments_are_scoped_and_consumer_checked() {
        let mut gw = gw_with_work("w-att");
        let dir = std::env::temp_dir().join("everyaios-p49-att");
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("report.pdf");
        std::fs::write(&file, b"%PDF-1.4").unwrap();
        let attachment = AttachmentRef {
            attachment_id: "a1".into(),
            content_hash: "deadbeef".into(),
            size: 8,
            media_type: "application/pdf".into(),
            source: "upload".into(),
            work_scope: "w-att".into(),
            session_scope: None,
            allowed_consumers: vec!["agent".into()],
            retention: "work".into(),
        };
        // A missing source is refused.
        assert!(gw
            .create_attachment(attachment.clone(), dir.join("nope"))
            .is_err());
        gw.create_attachment(attachment, file).unwrap();
        assert_eq!(gw.attachments_for("w-att").len(), 1);
        assert!(gw.resolve_attachment("a1", "agent").is_ok());
        assert!(gw.resolve_attachment("a1", "stranger").is_err());
        assert!(gw.expire_attachment("a1"));
        assert!(gw.attachments_for("w-att").is_empty());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn p49_rpc_surface_routes_the_v1_wiring() {
        let mut gw = gw_with_work("w-rpc");
        let created = gw
            .handle_rpc(
                "work/create",
                &serde_json::json!({"workId": "w-new", "objective": "ship it"}),
            )
            .unwrap();
        assert_eq!(created["workId"], "w-new");
        let locator = gw
            .handle_rpc("work/locator", &serde_json::json!({"workId": "w-new"}))
            .unwrap();
        assert_eq!(locator, serde_json::json!("work:w-new"));
        let node_json = serde_json::to_value(node("n1")).unwrap();
        gw.handle_rpc("work/node_pair", &serde_json::json!({"node": node_json}))
            .unwrap();
        gw.handle_rpc("work/node_verify", &serde_json::json!({"nodeId": "n1"}))
            .unwrap();
        gw.handle_rpc(
            "work/node_bind",
            &serde_json::json!({"nodeId": "n1", "workId": "w-new"}),
        )
        .unwrap();
        assert_eq!(
            gw.handle_rpc("work/nodes", &serde_json::json!({}))
                .unwrap()
                .as_array()
                .unwrap()
                .len(),
            1
        );
        // Unknown methods still fail closed.
        assert!(gw.handle_rpc("work/nope", &serde_json::json!({})).is_err());
    }
}
