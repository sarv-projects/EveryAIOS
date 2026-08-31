//! P49 — V1-local Work Gateway / Session Runtime.
//!
//! This module is deliberately a projection layer over the existing
//! `ExecutionKernel`: it owns durable Work addressing and domain events, but
//! it does not execute effects. Remote clients, multi-node failover, and
//! platform sandbox enforcement remain explicit follow-up seams.

use everyaios_types::{AutonomyLevel, RiskLevel, WorkId};
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

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkAddress {
    pub work_id: WorkId,
    pub project_id: Option<String>,
    pub session_id: Option<String>,
    pub owner_id: Option<String>,
    pub node_id: Option<String>,
    pub current_run_id: Option<String>,
    pub version: u64,
}

impl WorkAddress {
    pub fn new(work_id: impl Into<String>) -> Self {
        Self {
            work_id: WorkId::new(work_id),
            project_id: None,
            session_id: None,
            owner_id: None,
            node_id: None,
            current_run_id: None,
            version: 1,
        }
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
    pub state: Option<WorkPresenceState>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", tag = "kind", content = "data")]
pub enum DomainEvent {
    WorkCreated {
        objective: String,
        project_id: Option<String>,
        session_id: Option<String>,
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
        reason: String,
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
    PtyStarted { pty_id: String, process_id: Option<u32>, rows: u16, cols: u16 },
    PtyOutput { pty_id: String, chunk: String },
    PtyResize { pty_id: String, rows: u16, cols: u16 },
    PtySignal { pty_id: String, signal: String },
    PtyExit { pty_id: String, code: Option<i32> },
    // --- Worktree (P49.11) ---
    WorktreeCreated { worktree_id: String, branch: String },
    WorktreeAttached { worktree_id: String, run_id: String },
    WorktreeMerged { worktree_id: String, into: String },
    WorktreeReverted { worktree_id: String },
    WorktreeDestroyed { worktree_id: String },
    // --- AgentSession (P49.12) ---
    AgentSessionSpawned { agent_session_id: String, agent_id: String, lifetime: String },
    AgentSessionMessage { agent_session_id: String, direction: String },
    AgentSessionAttached { agent_session_id: String },
    AgentSessionDetached { agent_session_id: String },
    AgentSessionSteered { agent_session_id: String },
    AgentSessionCheckpointed { agent_session_id: String, checkpoint: u32 },
    AgentSessionTerminated { agent_session_id: String },
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
                ..
            }) => {
                let address = self
                    .works
                    .entry(work_id.clone())
                    .or_insert_with(|| WorkAddress::new(work_id.clone()));
                address.project_id = project_id.clone();
                address.session_id = session_id.clone();
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
                self.set_presence(&work_id, run_id, WorkPresenceState::Running)
            }
            WorkEvent::Domain(DomainEvent::RunWaiting { run_id, reason }) => self.set_presence(
                &work_id,
                run_id,
                if reason == "waiting_approval" {
                    WorkPresenceState::WaitingForApproval
                } else {
                    WorkPresenceState::WaitingForUser
                },
            ),
            WorkEvent::Domain(DomainEvent::RunPaused { run_id }) => {
                self.set_presence(&work_id, run_id, WorkPresenceState::Offline)
            }
            WorkEvent::Domain(DomainEvent::RunCompleted { run_id }) => {
                self.set_presence(&work_id, run_id, WorkPresenceState::Completed)
            }
            WorkEvent::Domain(DomainEvent::RunFailed { run_id, .. }) => {
                self.set_presence(&work_id, run_id, WorkPresenceState::Failed)
            }
            WorkEvent::Domain(DomainEvent::RunCancelled { run_id }) => {
                self.set_presence(&work_id, run_id, WorkPresenceState::Failed)
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
            _ => {}
        }
        Ok(())
    }

    fn set_presence(&mut self, work_id: &str, run_id: &str, state: WorkPresenceState) {
        let p = self.presence.entry(work_id.to_string()).or_default();
        p.work_id = work_id.to_string();
        p.active_run = Some(run_id.to_string());
        p.state = Some(state);
    }

    pub fn create_work(
        &mut self,
        work_id: impl Into<String>,
        project_id: Option<String>,
        session_id: Option<String>,
        objective: impl Into<String>,
    ) -> WorkAddress {
        let id = work_id.into();
        let mut address = WorkAddress::new(id.clone());
        address.project_id = project_id;
        address.session_id = session_id;
        if let Some(existing) = self.works.get(&id) {
            return existing.clone();
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
        self.append(
            &id,
            WorkEvent::Domain(DomainEvent::WorkCreated {
                objective: objective.into(),
                project_id: address.project_id.clone(),
                session_id: address.session_id.clone(),
            }),
            None,
        );
        address
    }
    pub fn bind_execution(&mut self, work_id: &str, execution_id: &str) -> Result<(), String> {
        if !self.works.contains_key(work_id) {
            return Err("unknown work".into());
        }
        self.execution_ids
            .insert(work_id.to_string(), execution_id.to_string());
        if let Some(address) = self.works.get_mut(work_id) {
            address.current_run_id = Some(execution_id.to_string());
            address.version = address.version.saturating_add(1);
        }
        self.append(
            work_id,
            WorkEvent::Domain(DomainEvent::WorkUpdated {
                patch: serde_json::json!({"executionId": execution_id}),
            }),
            None,
        )
        .ok_or("failed to append binding")?;
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
    pub fn archive_work(&mut self, id: &str) -> bool {
        if self.works.contains_key(id) {
            let _ = self.append(
                id,
                WorkEvent::Domain(DomainEvent::WorkUpdated {
                    patch: serde_json::json!({"archived": true}),
                }),
                None,
            );
            self.works.remove(id);
            if let Some(p) = self.presence.get_mut(id) {
                p.state = Some(WorkPresenceState::Completed);
            }
            true
        } else {
            false
        }
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
        .ok_or("unknown work".into())
    }

    /// Queue a review item and emit its semantic event.
    pub fn request_review(&mut self, item: ReviewItem) -> Result<WorkEventEnvelope, String> {
        if !self.works.contains_key(&item.work_id) {
            return Err("unknown work".into());
        }
        let work_id = item.work_id.clone();
        let review_id = item.review_id.clone();
        self.add_review(item);
        self.append(
            &work_id,
            WorkEvent::Domain(DomainEvent::ReviewRequested { review_id }),
            None,
        )
        .ok_or("failed to append review".into())
    }

    // ======== P49.10 PtySession lifecycle ========

    pub fn spawn_pty(&mut self, work_id: &str, pty_id: &str, process_id: Option<u32>, rows: u16, cols: u16) -> Result<WorkEventEnvelope, String> {
        if !self.works.contains_key(work_id) { return Err("unknown work".into()); }
        self.ptys.insert(pty_id.to_string(), PtySession { pty_id: pty_id.to_string(), process_id, rows, cols, state: "running".into(), output: String::new() });
        self.append(work_id, WorkEvent::Runtime(RuntimeEvent::PtyStarted { pty_id: pty_id.to_string(), process_id, rows, cols }), None).ok_or("append PtyStarted".into())
    }
    pub fn resize_pty(&mut self, work_id: &str, pty_id: &str, rows: u16, cols: u16) -> Result<WorkEventEnvelope, String> {
        let pty = self.ptys.get_mut(pty_id).ok_or("unknown pty")?;
        if pty.state != "running" && pty.state != "paused" { return Err(format!("pty is {}", pty.state)); }
        pty.rows = rows; pty.cols = cols;
        self.append(work_id, WorkEvent::Runtime(RuntimeEvent::PtyResize { pty_id: pty_id.to_string(), rows, cols }), None).ok_or("append PtyResize".into())
    }
    pub fn write_pty_output(&mut self, work_id: &str, pty_id: &str, chunk: &str) -> Result<WorkEventEnvelope, String> {
        let pty = self.ptys.get_mut(pty_id).ok_or("unknown pty")?;
        pty.output.push_str(chunk);
        const CAP: usize = 64 * 1024;
        if pty.output.len() > CAP { let s = pty.output.len() - CAP; pty.output = pty.output[s..].to_string(); }
        self.append(work_id, WorkEvent::Runtime(RuntimeEvent::PtyOutput { pty_id: pty_id.to_string(), chunk: chunk.to_string() }), None).ok_or("append PtyOutput".into())
    }
    pub fn signal_pty(&mut self, work_id: &str, pty_id: &str, signal: &str) -> Result<WorkEventEnvelope, String> {
        if !self.ptys.contains_key(pty_id) { return Err("unknown pty".into()); }
        self.append(work_id, WorkEvent::Runtime(RuntimeEvent::PtySignal { pty_id: pty_id.to_string(), signal: signal.to_string() }), None).ok_or("append PtySignal".into())
    }
    pub fn pause_pty(&mut self, pty_id: &str) -> Result<(), String> {
        let pty = self.ptys.get_mut(pty_id).ok_or("unknown pty")?;
        if pty.state != "running" { return Err(format!("pty is {}", pty.state)); }
        pty.state = "paused".into(); Ok(())
    }
    pub fn resume_pty(&mut self, pty_id: &str) -> Result<(), String> {
        let pty = self.ptys.get_mut(pty_id).ok_or("unknown pty")?;
        if pty.state != "paused" { return Err(format!("pty is {}", pty.state)); }
        pty.state = "running".into(); Ok(())
    }
    pub fn close_pty(&mut self, work_id: &str, pty_id: &str, code: Option<i32>) -> Result<WorkEventEnvelope, String> {
        let pty = self.ptys.get_mut(pty_id).ok_or("unknown pty")?;
        pty.state = "exited".into();
        self.append(work_id, WorkEvent::Runtime(RuntimeEvent::PtyExit { pty_id: pty_id.to_string(), code }), None).ok_or("append PtyExit".into())
    }
    pub fn snapshot_terminal(&self, pty_id: &str) -> Option<PtySession> { self.ptys.get(pty_id).cloned() }

    // ======== P49.11 WorktreeBinding lifecycle ========

    #[allow(clippy::too_many_arguments)]
    pub fn create_worktree(&mut self, work_id: &str, run_id: &str, worktree_id: &str, repo_root: &str, worktree_root: &str, base_revision: &str, branch: &str, isolation_mode: &str) -> Result<WorkEventEnvelope, String> {
        if !self.works.contains_key(work_id) { return Err("unknown work".into()); }
        self.worktrees.insert(worktree_id.to_string(), WorktreeBinding { worktree_id: worktree_id.to_string(), work_id: work_id.to_string(), run_id: run_id.to_string(), repo_root: repo_root.to_string(), worktree_root: worktree_root.to_string(), base_revision: base_revision.to_string(), branch: branch.to_string(), isolation_mode: isolation_mode.to_string(), status: "created".into() });
        self.append(work_id, WorkEvent::Runtime(RuntimeEvent::WorktreeCreated { worktree_id: worktree_id.to_string(), branch: branch.to_string() }), None).ok_or("append WorktreeCreated".into())
    }
    pub fn attach_worktree(&mut self, work_id: &str, worktree_id: &str, run_id: &str) -> Result<WorkEventEnvelope, String> {
        let wt = self.worktrees.get_mut(worktree_id).ok_or("unknown worktree")?;
        wt.run_id = run_id.to_string(); wt.status = "attached".into();
        self.append(work_id, WorkEvent::Runtime(RuntimeEvent::WorktreeAttached { worktree_id: worktree_id.to_string(), run_id: run_id.to_string() }), None).ok_or("append WorktreeAttached".into())
    }
    pub fn snapshot_worktree(&self, worktree_id: &str) -> Option<WorktreeBinding> { self.worktrees.get(worktree_id).cloned() }
    pub fn merge_worktree(&mut self, work_id: &str, worktree_id: &str, into: &str) -> Result<WorkEventEnvelope, String> {
        let wt = self.worktrees.get_mut(worktree_id).ok_or("unknown worktree")?; wt.status = "merged".into();
        self.append(work_id, WorkEvent::Runtime(RuntimeEvent::WorktreeMerged { worktree_id: worktree_id.to_string(), into: into.to_string() }), None).ok_or("append WorktreeMerged".into())
    }
    pub fn revert_worktree(&mut self, work_id: &str, worktree_id: &str) -> Result<WorkEventEnvelope, String> {
        let wt = self.worktrees.get_mut(worktree_id).ok_or("unknown worktree")?; wt.status = "reverted".into();
        self.append(work_id, WorkEvent::Runtime(RuntimeEvent::WorktreeReverted { worktree_id: worktree_id.to_string() }), None).ok_or("append WorktreeReverted".into())
    }
    pub fn destroy_worktree(&mut self, work_id: &str, worktree_id: &str) -> Result<WorkEventEnvelope, String> {
        if self.worktrees.remove(worktree_id).is_none() { return Err("unknown worktree".into()); }
        self.append(work_id, WorkEvent::Runtime(RuntimeEvent::WorktreeDestroyed { worktree_id: worktree_id.to_string() }), None).ok_or("append WorktreeDestroyed".into())
    }

    // ======== P49.12 AgentSession lifecycle ========

    #[allow(clippy::too_many_arguments)]
    pub fn spawn_subagent(&mut self, work_id: &str, run_id: &str, agent_session_id: &str, agent_id: &str, lifetime: AgentLifetime, pty_id: Option<String>, worktree_id: Option<String>) -> Result<WorkEventEnvelope, String> {
        if !self.works.contains_key(work_id) { return Err("unknown work".into()); }
        self.agent_sessions.insert(agent_session_id.to_string(), AgentSession { agent_session_id: agent_session_id.to_string(), work_id: work_id.to_string(), run_id: run_id.to_string(), agent_id: agent_id.to_string(), lifetime, pty_id, worktree_id, runtime_state: "spawned".into(), last_checkpoint: 0, attached: matches!(lifetime, AgentLifetime::PersistentAttachedSession) });
        self.append(work_id, WorkEvent::Runtime(RuntimeEvent::AgentSessionSpawned { agent_session_id: agent_session_id.to_string(), agent_id: agent_id.to_string(), lifetime: lifetime.as_str().to_string() }), None).ok_or("append AgentSessionSpawned".into())
    }
    pub fn send_subagent_message(&mut self, work_id: &str, agent_session_id: &str, to_agent: bool) -> Result<WorkEventEnvelope, String> {
        if !self.agent_sessions.contains_key(agent_session_id) { return Err("unknown agent session".into()); }
        self.append(work_id, WorkEvent::Runtime(RuntimeEvent::AgentSessionMessage { agent_session_id: agent_session_id.to_string(), direction: if to_agent { "to_agent".into() } else { "from_agent".into() } }), None).ok_or("append AgentSessionMessage".into())
    }
    pub fn attach_agent_session(&mut self, work_id: &str, agent_session_id: &str) -> Result<WorkEventEnvelope, String> {
        let s = self.agent_sessions.get_mut(agent_session_id).ok_or("unknown agent session")?;
        s.attached = true; s.runtime_state = "attached".into();
        self.append(work_id, WorkEvent::Runtime(RuntimeEvent::AgentSessionAttached { agent_session_id: agent_session_id.to_string() }), None).ok_or("append AgentSessionAttached".into())
    }
    pub fn detach_agent_session(&mut self, work_id: &str, agent_session_id: &str) -> Result<WorkEventEnvelope, String> {
        let lt = self.agent_sessions.get(agent_session_id).ok_or("unknown agent session")?.lifetime;
        if lt == AgentLifetime::EphemeralChild { return self.terminate_agent_session(work_id, agent_session_id); }
        let s = self.agent_sessions.get_mut(agent_session_id).unwrap();
        s.attached = false; s.runtime_state = "detached".into();
        self.append(work_id, WorkEvent::Runtime(RuntimeEvent::AgentSessionDetached { agent_session_id: agent_session_id.to_string() }), None).ok_or("append AgentSessionDetached".into())
    }
    pub fn steer_agent_session(&mut self, work_id: &str, agent_session_id: &str) -> Result<WorkEventEnvelope, String> {
        if !self.agent_sessions.contains_key(agent_session_id) { return Err("unknown agent session".into()); }
        self.append(work_id, WorkEvent::Runtime(RuntimeEvent::AgentSessionSteered { agent_session_id: agent_session_id.to_string() }), None).ok_or("append AgentSessionSteered".into())
    }
    pub fn checkpoint_agent_session(&mut self, work_id: &str, agent_session_id: &str) -> Result<WorkEventEnvelope, String> {
        let s = self.agent_sessions.get_mut(agent_session_id).ok_or("unknown agent session")?;
        s.last_checkpoint = s.last_checkpoint.saturating_add(1);
        let cp = s.last_checkpoint;
        self.append(work_id, WorkEvent::Runtime(RuntimeEvent::AgentSessionCheckpointed { agent_session_id: agent_session_id.to_string(), checkpoint: cp }), None).ok_or("append AgentSessionCheckpointed".into())
    }
    pub fn terminate_agent_session(&mut self, work_id: &str, agent_session_id: &str) -> Result<WorkEventEnvelope, String> {
        let s = self.agent_sessions.get_mut(agent_session_id).ok_or("unknown agent session")?;
        s.runtime_state = "terminated".into(); s.attached = false;
        self.append(work_id, WorkEvent::Runtime(RuntimeEvent::AgentSessionTerminated { agent_session_id: agent_session_id.to_string() }), None).ok_or("append AgentSessionTerminated".into())
    }
    pub fn agent_session(&self, agent_session_id: &str) -> Option<&AgentSession> { self.agent_sessions.get(agent_session_id) }
    pub fn agent_sessions_for(&self, work_id: &str) -> Vec<&AgentSession> { self.agent_sessions.values().filter(|s| s.work_id == work_id).collect() }

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
        let u16f = |k: &str, d: u16| p.get(k).and_then(Value::as_u64).map(|v| v as u16).unwrap_or(d);
        let ev = |e: WorkEventEnvelope| serde_json::to_value(e).map_err(|x| x.to_string());
        match method {
            "work/pty_spawn" => ev(self.spawn_pty(&s("workId"), &s("ptyId"), p.get("processId").and_then(Value::as_u64).map(|v| v as u32), u16f("rows", 24), u16f("cols", 80))?),
            "work/pty_resize" => ev(self.resize_pty(&s("workId"), &s("ptyId"), u16f("rows", 24), u16f("cols", 80))?),
            "work/pty_output" => ev(self.write_pty_output(&s("workId"), &s("ptyId"), &s("chunk"))?),
            "work/pty_signal" => ev(self.signal_pty(&s("workId"), &s("ptyId"), &s("signal"))?),
            "work/pty_close" => ev(self.close_pty(&s("workId"), &s("ptyId"), p.get("code").and_then(Value::as_i64).map(|v| v as i32))?),
            "work/pty_snapshot" => serde_json::to_value(self.snapshot_terminal(&s("ptyId"))).map_err(|e| e.to_string()),
            "work/worktree_create" => ev(self.create_worktree(&s("workId"), &s("runId"), &s("worktreeId"), &s("repoRoot"), &s("worktreeRoot"), &s("baseRevision"), &s("branch"), &opt_s("isolationMode").unwrap_or_else(|| "worktree".into()))?),
            "work/worktree_attach" => ev(self.attach_worktree(&s("workId"), &s("worktreeId"), &s("runId"))?),
            "work/worktree_merge" => ev(self.merge_worktree(&s("workId"), &s("worktreeId"), &s("into"))?),
            "work/worktree_revert" => ev(self.revert_worktree(&s("workId"), &s("worktreeId"))?),
            "work/worktree_destroy" => ev(self.destroy_worktree(&s("workId"), &s("worktreeId"))?),
            "work/agent_spawn" => {
                let lifetime = match s("lifetime").as_str() {
                    "persistent" | "persistent_attached_session" => AgentLifetime::PersistentAttachedSession,
                    _ => AgentLifetime::EphemeralChild,
                };
                ev(self.spawn_subagent(&s("workId"), &s("runId"), &s("agentSessionId"), &s("agentId"), lifetime, opt_s("ptyId"), opt_s("worktreeId"))?)
            }
            "work/agent_message" => ev(self.send_subagent_message(&s("workId"), &s("agentSessionId"), p.get("toAgent").and_then(Value::as_bool).unwrap_or(true))?),
            "work/agent_attach" => ev(self.attach_agent_session(&s("workId"), &s("agentSessionId"))?),
            "work/agent_detach" => ev(self.detach_agent_session(&s("workId"), &s("agentSessionId"))?),
            "work/agent_steer" => ev(self.steer_agent_session(&s("workId"), &s("agentSessionId"))?),
            "work/agent_checkpoint" => ev(self.checkpoint_agent_session(&s("workId"), &s("agentSessionId"))?),
            "work/agent_terminate" => ev(self.terminate_agent_session(&s("workId"), &s("agentSessionId"))?),
            "work/agent_sessions" => serde_json::to_value(self.agent_sessions_for(&s("workId"))).map_err(|e| e.to_string()),
            other => Err(format!("unknown work method: {other}")),
        }
    }

    pub fn append(
        &mut self,
        work_id: &str,
        event: WorkEvent,
        causal_parent: Option<u64>,
    ) -> Option<WorkEventEnvelope> {
        if !self.works.contains_key(work_id) {
            return None;
        }
        let sequence = self.next_seq;
        self.next_seq += 1;
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
            let mut file = match OpenOptions::new().create(true).append(true).open(path) {
                Ok(file) => file,
                Err(_) => return None,
            };
            let line = match serde_json::to_string(&envelope) {
                Ok(line) => line,
                Err(_) => return None,
            };
            if writeln!(file, "{line}").is_err() || file.flush().is_err() {
                return None;
            }
        }
        self.events
            .entry(work_id.into())
            .or_default()
            .push(envelope.clone());
        self.subscribers
            .retain(|subscriber| subscriber.send(envelope.clone()).is_ok());
        Some(envelope)
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
        )
        .ok_or("failed to append approval")?;
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
        self.append(work_id, event, None)
            .ok_or("failed to append effect")?;
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
        self.append(work_id, WorkEvent::Domain(event), None)
            .ok_or("failed to append artifact")?;
        Ok(())
    }

    pub fn record_execution_transition(
        &mut self,
        work_id: &str,
        execution_id: &str,
        state: &str,
    ) -> Result<(), String> {
        if self.execution_id(work_id) != Some(execution_id) {
            return Err("execution/work binding mismatch".into());
        }
        let event = match state {
            "running" => WorkEvent::Domain(DomainEvent::RunStarted {
                run_id: execution_id.into(),
            }),
            "checkpointed" => WorkEvent::Domain(DomainEvent::RunCheckpointed {
                run_id: execution_id.into(),
                checkpoint: 0,
            }),
            "waiting_approval" | "waiting_user" | "waiting_tool" => {
                WorkEvent::Domain(DomainEvent::RunWaiting {
                    run_id: execution_id.into(),
                    reason: state.into(),
                })
            }
            "paused" => WorkEvent::Domain(DomainEvent::RunPaused {
                run_id: execution_id.into(),
            }),
            "completed" => WorkEvent::Domain(DomainEvent::RunCompleted {
                run_id: execution_id.into(),
            }),
            "failed" => WorkEvent::Domain(DomainEvent::RunFailed {
                run_id: execution_id.into(),
                reason: "execution transitioned to failed".into(),
            }),
            "cancelled" => WorkEvent::Domain(DomainEvent::RunCancelled {
                run_id: execution_id.into(),
            }),
            _ => WorkEvent::Operational(OperationalEvent::ToolCompleted {
                tool_id: format!("execution:{state}"),
            }),
        };
        self.append(work_id, event, None)
            .ok_or("failed to append execution transition")?;
        if let Some(p) = self.presence.get_mut(work_id) {
            p.active_run = Some(execution_id.into());
            p.state = match state {
                "completed" => Some(WorkPresenceState::Completed),
                "failed" => Some(WorkPresenceState::Failed),
                "paused" => Some(WorkPresenceState::Offline),
                "waiting_approval" => Some(WorkPresenceState::WaitingForApproval),
                "waiting_user" => Some(WorkPresenceState::WaitingForUser),
                _ => Some(WorkPresenceState::Running),
            };
        }
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
        let p = self.presence.get_mut(&client.work_id).unwrap();
        if !p.active_clients.contains(&client.client_id) {
            p.active_clients.push(client.client_id.clone());
        }
        self.append(
            &client.work_id,
            WorkEvent::Operational(OperationalEvent::SessionAttached {
                client_id: client.client_id.clone(),
            }),
            None,
        );
        self.clients.insert(client.client_id.clone(), client);
        Ok(())
    }
    pub fn detach_client(&mut self, client_id: &str) -> bool {
        let Some(c) = self.clients.remove(client_id) else {
            return false;
        };
        if let Some(p) = self.presence.get_mut(&c.work_id) {
            p.active_clients.retain(|x| x != client_id);
        }
        self.append(
            &c.work_id,
            WorkEvent::Operational(OperationalEvent::SessionDetached {
                client_id: client_id.into(),
            }),
            None,
        );
        true
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
        let token = self
            .authorities
            .get(run_id)
            .map(|a| a.fencing_token + 1)
            .unwrap_or(1);
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
    pub fn reviews(&self, work_id: &str) -> Vec<&ReviewItem> {
        self.reviews
            .values()
            .filter(|r| r.work_id == work_id && r.state != "resolved")
            .collect()
    }
    pub fn resolve_review(&mut self, id: &str) -> bool {
        let Some(review) = self.reviews.get_mut(id) else {
            return false;
        };
        review.state = "resolved".into();
        true
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
        );
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
        first.append(
            "w-journal",
            WorkEvent::Domain(DomainEvent::RunQueued { run_id: "r".into() }),
            None,
        );
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
        );
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
            .record_execution_transition("w-proj", "run-1", "waiting_approval")
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
        g.record_execution_transition("w1", "ex:1", "running")
            .unwrap();
        g.record_execution_transition("w1", "ex:1", "waiting_approval")
            .unwrap();
        g.record_execution_transition("w1", "ex:1", "completed")
            .unwrap();
        assert_eq!(
            g.presence("w1").unwrap().state,
            Some(WorkPresenceState::Completed)
        );
        assert!(g
            .record_execution_transition("w1", "other", "running")
            .is_err());
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
        matches!(self, ContextReleasePolicy::Redacted | ContextReleasePolicy::ReferenceOnly)
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
        gw.create_worktree("w2", "run-a", "wt1", "/repo", "/repo/.wt/wt1", "abc123", "feature/x", "worktree").unwrap();
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
        gw.spawn_subagent("w3", "run", "s-eph", "claude-code", AgentLifetime::EphemeralChild, None, None).unwrap();
        gw.spawn_subagent("w3", "run", "s-persist", "codex", AgentLifetime::PersistentAttachedSession, None, None).unwrap();
        // Detach the ephemeral child → terminated.
        gw.detach_agent_session("w3", "s-eph").unwrap();
        assert_eq!(gw.agent_session("s-eph").unwrap().runtime_state, "terminated");
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
        gw.spawn_subagent("w4", "r", "s1", "a", AgentLifetime::PersistentAttachedSession, Some("pty".into()), Some("wt".into())).unwrap();
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
        let empty = TrustedGestureAttestation { auth_source: AuthSource::NativeGesture, gesture_origin: "x".into(), nonce: String::new() };
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
        assert!(ContextReleasePolicy::ReferenceOnly.decide(true, false).is_ok());
        assert!(ContextReleasePolicy::Redacted.auto_releasable_externally());
        assert!(!ContextReleasePolicy::Approval.auto_releasable_externally());
    }
}
