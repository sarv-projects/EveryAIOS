//! P1.4 — chat streaming relay: "sidecar proposes (engine), Rust disposes
//! (broker + budget)".
//!
//! One relay owns the [`SidecarLink`] for the app's lifetime:
//!
//! 1. [`ChatRelay::start_stream`] — J11 **budget pre-flight** (refuses a
//!    session at/over its $ limit with the "stopped: $X limit" surface BEFORE
//!    any sidecar dispatch), then forwards `chat/stream` to the coordinator,
//!    where the reused ConversationEngine runs.
//! 2. The consumer loop (spawned once) handles the coordinator's
//!    `provider/stream` requests — the **broker runs HERE** (keys never leave
//!    Rust): `everyaios-vault::Broker::chat_completion_stream`, chunks pushed
//!    back as `chat/provider_chunk` notifications the engine consumes.
//! 3. `chat/*` notifications from the coordinator are relayed to the UI
//!    (`on_event` → Tauri `chat-event` emit).
//! 4. When a turn's `chat/done` lands, the relay re-checks the ledger: a
//!    session that just crossed its $ limit gets a `BudgetExceeded` event
//!    ("stopped: $X limit") — the J11 kill surfaced at the turn boundary.

use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};

use everyaios_guard::CapabilityBroker;
use everyaios_vault::{
    assemble_tool_calls, extract_json_tool_calls, Broker, LocalEndpoint, Vault,
    DEFAULT_SESSION_BUDGET_USD,
};
use serde_json::Value;

use crate::eval_service::EvalService;
use crate::execution::ExecutionKernel;
use crate::guard_service::GuardService;
use crate::memory_service::MemoryService;
use crate::plan_service::PlanService;
use crate::scheduler_service::SchedulerService;
use crate::sidecar_link::{Inbound, SidecarLink, WriterHandle};
use crate::tools::ToolService;

/// P1.8: registered keyless local endpoints (provider → endpoint).
type LocalEndpointMap = HashMap<String, LocalEndpoint>;

fn load_persistent_memory() -> MemoryService {
    let path = crate::default_data_dir().join("memory.json");
    match MemoryService::load_from(&path) {
        Ok(memory) => memory,
        Err(_) => MemoryService::new(),
    }
}

fn persist_memory(memory: &MemoryService) {
    let path = crate::default_data_dir().join("memory.json");
    let _ = std::fs::create_dir_all(crate::default_data_dir());
    let _ = memory.save_to(&path);
}

/// UI event sink (pre-existing; alias keeps clippy's type_complexity quiet).
type EventSink = Box<dyn Fn(ChatWireEvent) + Send>;

/// Identity carried by the coordinator's normalized event envelope. The
/// stream/session pair is kept as the stable routing key; these additional
/// fields preserve durable Work/execution correlation through the Rust/Tauri
/// hop instead of silently dropping it at the enum conversion boundary.
#[derive(Debug, Clone, Default, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatEventMetadata {
    #[serde(skip_serializing_if = "Option::is_none")]
    work_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    execution_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    run_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    event_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    sequence: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    schema_version: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    timestamp: Option<u64>,
}

fn event_metadata(params: &serde_json::Value) -> ChatEventMetadata {
    ChatEventMetadata {
        work_id: params
            .get("workId")
            .and_then(|v| v.as_str())
            .map(str::to_string),
        execution_id: params
            .get("executionId")
            .and_then(|v| v.as_str())
            .map(str::to_string),
        run_id: params
            .get("runId")
            .and_then(|v| v.as_str())
            .map(str::to_string),
        event_id: params
            .get("eventId")
            .and_then(|v| v.as_str())
            .map(str::to_string),
        sequence: params.get("sequence").and_then(|v| v.as_u64()),
        schema_version: params.get("schemaVersion").and_then(|v| v.as_u64()),
        timestamp: params.get("timestamp").and_then(|v| v.as_u64()),
    }
}

/// Wire events forwarded to the UI (Tauri emits a single `chat-event`).
#[derive(Debug, Clone, serde::Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ChatWireEvent {
    Ttft {
        stream_id: String,
        session_id: String,
        latency_ms: u64,
        #[serde(flatten)]
        metadata: ChatEventMetadata,
    },
    Batch {
        stream_id: String,
        session_id: String,
        text: String,
        token_count: u64,
        #[serde(flatten)]
        metadata: ChatEventMetadata,
    },
    Reasoning {
        stream_id: String,
        session_id: String,
        text: String,
        #[serde(flatten)]
        metadata: ChatEventMetadata,
    },
    Stage {
        stream_id: String,
        session_id: String,
        stage: String,
        #[serde(flatten)]
        metadata: ChatEventMetadata,
    },
    ToolCall {
        #[serde(rename = "streamId")]
        stream_id: String,
        #[serde(rename = "sessionId")]
        session_id: String,
        #[serde(rename = "toolId")]
        tool_id: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        args: Option<serde_json::Value>,
        #[serde(skip_serializing_if = "Option::is_none")]
        risk: Option<String>,
        #[serde(flatten)]
        metadata: ChatEventMetadata,
    },
    ToolResult {
        #[serde(rename = "streamId")]
        stream_id: String,
        #[serde(rename = "sessionId")]
        session_id: String,
        #[serde(rename = "toolId")]
        tool_id: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        result: Option<serde_json::Value>,
        #[serde(skip_serializing_if = "Option::is_none")]
        error: Option<String>,
        #[serde(flatten)]
        metadata: ChatEventMetadata,
    },
    /// P41.4 — K1 verification receipt for the editor's Diff rail
    /// (model-reported pass/fail per plan-task check; `passed: null` =
    /// ambiguous — never claimed as executed).
    Verification {
        #[serde(rename = "streamId")]
        stream_id: String,
        #[serde(rename = "sessionId")]
        session_id: String,
        #[serde(rename = "taskId")]
        task_id: String,
        #[serde(rename = "checks")]
        checks: Vec<String>,
        #[serde(rename = "report")]
        report: String,
        #[serde(rename = "passed")]
        passed: Option<bool>,
        #[serde(flatten)]
        metadata: ChatEventMetadata,
    },
    Done {
        stream_id: String,
        session_id: String,
        turn_id: String,
        full_text: String,
        total_tokens: u64,
        #[serde(flatten)]
        metadata: ChatEventMetadata,
    },
    Error {
        stream_id: String,
        session_id: String,
        code: String,
        message: String,
        #[serde(skip_serializing_if = "Option::is_none", rename = "toolId")]
        tool_id: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        retryable: Option<bool>,
        #[serde(skip_serializing_if = "Option::is_none")]
        args: Option<serde_json::Value>,
        #[serde(flatten)]
        metadata: ChatEventMetadata,
    },
    Cancelled {
        stream_id: String,
        session_id: String,
        #[serde(flatten)]
        metadata: ChatEventMetadata,
    },
    /// J11 kill surface: "stopped: $X limit".
    BudgetExceeded {
        stream_id: String,
        session_id: String,
        limit: f64,
        spent: f64,
        #[serde(flatten)]
        metadata: ChatEventMetadata,
    },
    /// Stage-0 plan executor: a circuit-break MCQ card for the H2 cockpit
    /// (the coordinator emitted `chat/interrupt` when `CircuitBreaker::step`
    /// tripped). `options` are the McqOption values; the UI maps them to
    /// actionable labels and returns the choice via `plan/respond`.
    Interrupt {
        stream_id: String,
        session_id: String,
        plan_id: String,
        break_id: String,
        title: String,
        description: String,
        options: Vec<String>,
        #[serde(flatten)]
        metadata: ChatEventMetadata,
    },
    /// Stage-0 plan executor: the plan finished (or halted). `error` is
    /// present when it halted on an interrupt/escalation.
    PlanDone {
        stream_id: String,
        session_id: String,
        plan_id: String,
        tasks_done: u32,
        error: Option<String>,
        #[serde(flatten)]
        metadata: ChatEventMetadata,
    },
    /// P6.4 / H2 — monitoring verdict for the UI badge (notify vs silent).
    Monitor {
        #[serde(rename = "streamId")]
        stream_id: String,
        #[serde(rename = "sessionId")]
        session_id: String,
        #[serde(rename = "jobId")]
        job_id: String,
        changed: bool,
        notified: bool,
        stopped: bool,
        current: String,
        notifications: u32,
        #[serde(flatten)]
        metadata: ChatEventMetadata,
    },
    /// Plan lifecycle events use the same normalized chat-event channel as
    /// ordinary turns. Keeping them here prevents plan_start/plan_step from
    /// disappearing at the Rust relay boundary.
    PlanStart {
        #[serde(rename = "streamId")]
        stream_id: String,
        #[serde(rename = "sessionId")]
        session_id: String,
        #[serde(rename = "planId")]
        plan_id: String,
        tasks: u32,
        #[serde(flatten)]
        metadata: ChatEventMetadata,
    },
    PlanStep {
        #[serde(rename = "streamId")]
        stream_id: String,
        #[serde(rename = "sessionId")]
        session_id: String,
        #[serde(rename = "planId")]
        plan_id: String,
        #[serde(rename = "taskId")]
        task_id: String,
        status: String,
        #[serde(flatten)]
        metadata: ChatEventMetadata,
    },
    MemoryExtracted {
        #[serde(rename = "streamId")]
        stream_id: String,
        #[serde(rename = "sessionId")]
        session_id: String,
        facts: Vec<String>,
        #[serde(flatten)]
        metadata: ChatEventMetadata,
    },
    /// P52.20 — numbered citations produced from live `search.query` hits.
    Citations {
        #[serde(rename = "streamId")]
        stream_id: String,
        #[serde(rename = "sessionId")]
        session_id: String,
        citations: Vec<serde_json::Value>,
        #[serde(flatten)]
        metadata: ChatEventMetadata,
    },
    /// P51.10 — ordered Changes Walkthrough stops from `execution/multirun`.
    Walkthrough {
        #[serde(rename = "streamId")]
        stream_id: String,
        #[serde(rename = "sessionId")]
        session_id: String,
        stops: Vec<serde_json::Value>,
        #[serde(flatten)]
        metadata: ChatEventMetadata,
    },
}

/// Parameters for one chat turn (mirrors the coordinator's `chat/stream`).
#[derive(Debug, Clone)]
pub struct ChatStreamParams {
    pub session_id: String,
    /// Durable Work grouping key. Defaults to the session at the Tauri boundary.
    pub work_id: Option<String>,
    pub stream_id: String,
    pub text: String,
    pub surface: Option<String>,
    pub agent_id: Option<String>,
    /// P1.9 (A6/A7): `None` lets the coordinator's task→model router pick;
    /// `Some` is the explicit user/model lock (wins over routing).
    pub provider: Option<String>,
    pub model: Option<String>,
    pub persona_id: Option<String>,
    pub soul_md: Option<String>,
    /// P4.7 — documents to inject below the cache boundary (J6
    /// `<user_document>` wrapping); the chat-overlay scopes a turn to an
    /// open document by passing its extracted text here.
    pub user_documents: Option<Vec<UserDocument>>,
    /// P5/P6 project scope carried into the coordinator prompt/policy context.
    pub project_id: Option<String>,
    /// P38 — the session's effective Chief (pin → user default → inbuilt),
    /// forwarded to the coordinator's single dispatch guard. The UI resolves
    /// it; external Chiefs are refused by the coordinator (see
    /// `dispatchByChief` in `packages/coordinator/src/chat.ts`).
    pub primary_chief: Option<String>,
    /// P50.3.6 — the shell's live vault key set (provider ids with keys),
    /// forwarded so the coordinator gates the *taken* route on the same set
    /// the display feed used. `None` ⇒ ungated (legacy/test callers); an
    /// empty vec gates every keyed provider out (fail-closed).
    pub credentialed_providers: Option<Vec<String>>,
}

/// P4.7 — a user-attached document for `<user_document>` wrapping (J6).
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserDocument {
    pub title: String,
    pub content: String,
}

#[derive(Debug, thiserror::Error)]
pub enum ChatRelayError {
    #[error("link error: {0}")]
    Link(#[from] crate::sidecar_link::LinkError),
    #[error("vault error: {0}")]
    Vault(#[from] everyaios_vault::VaultError),
    /// J11 pre-flight refusal — the message carries the UI surface string.
    #[error("session '{session}' stopped: ${limit:.2} limit (spent ${spent:.2})")]
    BudgetExceeded {
        session: String,
        limit: f64,
        spent: f64,
    },
    #[error("sidecar rejected chat/stream: {0}")]
    SidecarRejected(String),
}

/// The relay: owns the link + vault + UI callback + stream→session map.
pub struct ChatRelay<W, R> {
    link: SidecarLink<W, R>,
    vault: Arc<Mutex<Vault>>,
    /// stream_id → session_id (for post-turn budget checks).
    sessions: Arc<Mutex<HashMap<String, String>>>,
    /// Provider base-url overrides (from config; also used by tests).
    base_urls: Arc<Mutex<HashMap<String, String>>>,
    /// P55.5 — resolved per-provider endpoints (base URL + wire dialect +
    /// headers, incl. the OpenCode per-conversation session headers) built by
    /// the shell from the live models.dev catalog + user-config profiles.
    /// This is what makes "every models.dev provider" work on a chat turn
    /// instead of only the handful of hardcoded defaults.
    endpoints: Arc<Mutex<HashMap<String, everyaios_vault::ProviderEndpoint>>>,
    /// P55.6 — the durable user-config profile store (`providers.json`), the
    /// non-secret half of a custom provider (the key stays in the vault).
    profiles: Arc<Mutex<Option<everyaios_catalog::ProfileStore>>>,
    /// P1.8 (A5): keyless local endpoints (ollama / llamafile). When the
    /// sidecar requests one of these providers the broker routes to the
    /// local runtime — no key ring, GBNF grammar passthrough (B5).
    local_endpoints: Arc<Mutex<LocalEndpointMap>>,
    /// P5.1/P5.3/P5.4/P5.9: the in-process memory dispatch (facts, planner,
    /// ghost index, usage ledger) the sidecar calls via `memory/*` methods.
    memory: Arc<Mutex<MemoryService>>,
    /// P7.5/J21: the Guard-2 pre-flight (tickets/policy/estop/profile) the
    /// coordinator drives via `guard/*` methods; shared with the Tauri cards.
    guard: Arc<Mutex<GuardService>>,
    /// P6.3 Stage-0: per-plan circuit-breaker state the coordinator steps via
    /// `plan/*` methods; trips become `chat/interrupt` → `ChatWireEvent::Interrupt`.
    plan: Arc<Mutex<PlanService>>,
    /// P6.4 (B7): the durable scheduled-task core (cron/interval/event/webhook
    /// triggers, leases, retry, battery policy, nudge sentinels). The
    /// coordinator drives it via `scheduler/*` methods.
    scheduler: Arc<Mutex<SchedulerService>>,
    /// Stage 0: guard-gated tool executor (`tool/list`/`tool/exec`/`tool/commit`).
    tools: Arc<Mutex<ToolService>>,
    /// S0.7 EV1 runtime: `eval/verify` at task completion.
    evals: Arc<Mutex<EvalService>>,
    /// H3 unified execution kernel.
    executions: Arc<Mutex<ExecutionKernel>>,
    /// P64.4/P71.3a — sub-agent spawn policy (depth/concurrency/total). The
    /// LLM execution stays in the coordinator and the durable state is the
    /// child Work in `work_gateway` (I8), so this is the judgement alone: an
    /// immutable value, not shared accounting state.
    delegation: everyaios_blueprint::DelegationPolicy,
    /// P64.8 — the distilled-skill store `skill/*` serves. A field rather than
    /// a store built per call so tests can re-seat it (the default home is the
    /// developer's real `~/.everyaios/skills/`), matching `scheduler`.
    skill_store: Arc<Mutex<everyaios_blueprint::SkillStore>>,
    /// P54.5 — read-only view of the one PTY plane, behind `terminal/*`. The
    /// host attaches the same `PtyHost` the Shell view uses, so the agent's
    /// picture of its own shell is the user's picture of it. Absent on a host
    /// with no PTY host, where the arm answers honestly instead of inventing
    /// sessions. Carries no run capability by construction — see
    /// [`crate::terminal::TerminalPlaneObserver`].
    terminal_plane: Arc<Mutex<Option<Arc<dyn crate::terminal::TerminalPlaneObserver>>>>,
    /// P49 V1-local Work Gateway projection and event journal.
    work_gateway: Arc<Mutex<crate::work_gateway::WorkGateway>>,
    /// P49.7 capability grants; secrets remain exclusively in the vault.
    capabilities: Arc<Mutex<everyaios_guard::LocalCapabilityBroker>>,
    /// H3 data egress engine.
    egress: Arc<Mutex<everyaios_guard::EgressEngine>>,
    /// P43 (B7 v3.53): the detached-work task ledger (BackgroundTaskRecord
    /// lifecycle, push completion, lost-state grace, 7-day retention). Rust
    /// owns the state machine; the coordinator + Tauri shell drive it via
    /// `tasks/*` methods.
    tasks: Arc<Mutex<crate::task_ledger::TaskLedger>>,
    on_event: Arc<Mutex<EventSink>>,
    /// P11.5.11 — AG-UI live transport: forwards `agui/event` lines to the UI.
    agui: crate::agui::AguiRelay,
}

/// The skills root every part of the app shares — the same `SkillStore`
/// default the UI's skills commands use, so a distilled skill is immediately
/// visible to both surfaces.
fn skills_root() -> std::path::PathBuf {
    everyaios_blueprint::SkillStore::default_home()
}

/// The `skill/*` methods the coordinator drives.
///
/// P64.8 — validated distillation. The coordinator calls this only after its
/// own verify gate passed, but that claim is **not** trusted here:
/// `grow_from_task` runs the real gate (tests verdict, 500-line budget,
/// manifest validation) before anything reaches disk.
fn skill_rpc(
    method: &str,
    params: &serde_json::Value,
    store: &everyaios_blueprint::SkillStore,
) -> Result<serde_json::Value, String> {
    match method {
        "skill/grow" => {
            let task_name = params
                .get("taskName")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            if task_name.trim().is_empty() {
                return Err("skill/grow requires taskName".to_string());
            }
            let solution = params
                .get("solution")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let author = params.get("author").and_then(|v| v.as_str()).unwrap_or("");
            let version = params
                .get("version")
                .and_then(|v| v.as_str())
                .unwrap_or("0.1.0");
            let skill =
                everyaios_blueprint::grow_from_task(store, task_name, solution, author, version)
                    .map_err(|e| e.to_string())?;
            Ok(serde_json::json!({
                "ok": true,
                "name": skill.manifest.name,
                "version": skill.manifest.version,
            }))
        }
        // P51.28 — model catalog omits disable-model-invocation (Zed
        // select_catalog_skills / Crush user-only skills). Slash names stay.
        "skill/warm_set" => {
            let skills = store.scan().map_err(|e| e.to_string())?;
            let rows: Vec<serde_json::Value> = skills
                .iter()
                .map(|s| {
                    serde_json::json!({
                        "name": s.manifest.name,
                        "description": s.manifest.description,
                        "userInvocable": everyaios_blueprint::may_user_slash_invoke(&s.manifest),
                        "disableModelInvocation": s.manifest.disable_model_invocation,
                    })
                })
                .collect();
            Ok(serde_json::json!({
                "skills": everyaios_blueprint::model_warm_set(&skills),
                "slash": everyaios_blueprint::user_slash_catalog(&skills),
                "rows": rows,
            }))
        }
        "skill/compose" => {
            let stack: Vec<String> = params
                .get("stack")
                .and_then(|v| v.as_array())
                .map(|a| {
                    a.iter()
                        .filter_map(|v| v.as_str().map(str::to_string))
                        .collect()
                })
                .unwrap_or_default();
            let query = params.get("query").and_then(|v| v.as_str()).unwrap_or("");
            let invoke = if params
                .get("userExplicit")
                .and_then(|v| v.as_bool())
                .unwrap_or(false)
            {
                everyaios_blueprint::InvokeKind::UserExplicit
            } else {
                everyaios_blueprint::InvokeKind::ModelAuto
            };
            let skills = store.scan().map_err(|e| e.to_string())?;
            let index = everyaios_blueprint::SkillsIndexFile::from_skills(&skills);
            let out = everyaios_blueprint::compose_stack_for(&index, &stack, &[], query, invoke);
            serde_json::to_value(out).map_err(|e| e.to_string())
        }
        other => Err(format!("method not found: {other}")),
    }
}

/// The `subagent/*` methods the coordinator drives.
///
/// P64.4/P71.3a — the spawn **admission** seam, with the executor deleted. I8
/// makes subagents child Work/Runs: the durable record of a delegation is the
/// child Work the gateway mints, and the admission numbers are read back out of
/// that same graph, so there is no runtime here to hold them and nothing to
/// lose on restart. The judgement itself is
/// [`everyaios_blueprint::DelegationPolicy`] — pure over a gauge it did not
/// build.
///
/// The LLM execution stays coordinator-side, so the reply is the *admitted*
/// spec reported as running — deliberately not a fabricated `done` with an
/// invented summary. Refusals arrive as errors, never as a silent acceptance.
///
/// P69.D14 — a delegated task is registered as a **child Work** in the one Work
/// Gateway (parent link + Run + ephemeral AgentSession) from the `workId` the
/// caller names; `subagent/complete`/`subagent/fail` close that child with the
/// terminal Run event on the child's own timeline, which is also how they
/// refuse a task that was never delegated.
fn subagent_rpc(
    method: &str,
    params: &serde_json::Value,
    policy: &everyaios_blueprint::DelegationPolicy,
    gateway: &Arc<Mutex<crate::work_gateway::WorkGateway>>,
) -> Result<serde_json::Value, String> {
    match method {
        "subagent/spawn" => {
            let raw = params
                .get("spec")
                .cloned()
                .ok_or("subagent/spawn requires spec")?;
            let task: everyaios_blueprint::TaskSpec = serde_json::from_value(raw)
                .map_err(|e| format!("subagent/spawn requires a valid spec: {e}"))?;
            let goal = task.goal.clone();
            let str_list = |key: &str| -> Vec<String> {
                params
                    .get(key)
                    .and_then(|v| v.as_array())
                    .map(|a| {
                        a.iter()
                            .filter_map(|v| v.as_str().map(str::to_string))
                            .collect()
                    })
                    .unwrap_or_default()
            };
            let mut spec = everyaios_blueprint::SubAgentSpec::new(
                task,
                params.get("model").and_then(|v| v.as_str()).unwrap_or(""),
                params
                    .get("workspace")
                    .and_then(|v| v.as_str())
                    .unwrap_or(""),
            );
            spec.parent_id = params
                .get("parentId")
                .and_then(|v| v.as_str())
                .map(str::to_string);
            spec.tools = str_list("tools");
            spec.blocked_tools = str_list("blockedTools");
            // P60.3 — Scout/Verifier never inherit writes even if the parent
            // listed them. Worker keeps the derived grant set.
            let role = params
                .get("role")
                .and_then(|v| v.as_str())
                .and_then(crate::cua::AgentRole::parse);
            if let Some(role) = role {
                spec.tools = crate::cua::filter_tools_for_role(role, &spec.tools);
            }
            // P60.1 — harness and model are independent; a CLI-named
            // "*-subagent" identity is refused.
            let harness = params
                .get("harness")
                .and_then(|v| v.as_str())
                .unwrap_or("inbuilt");
            let model = params.get("model").and_then(|v| v.as_str()).unwrap_or("");
            let binding = if !model.is_empty() {
                Some(crate::bind_runtime(
                    harness,
                    model,
                    role,
                    params
                        .get("chief")
                        .and_then(|v| v.as_str())
                        .map(str::to_string),
                )?)
            } else {
                crate::refuse_cli_named_subagent(harness)?;
                None
            };
            let task_id = spec.spec.id.clone();
            // P71.3a — the graph is the only place a delegated child, its depth
            // and the live counts exist. A caller that names no parent Work gets
            // policy-only admission (depth from its own spec, zero active /
            // total) and the reply says so, rather than passing a partial check
            // off as a full one.
            let parent_work_id = params
                .get("workId")
                .and_then(|v| v.as_str())
                .filter(|v| !v.is_empty())
                .map(str::to_string);
            let (gauge, accounted_from) = match parent_work_id.as_deref() {
                Some(parent) => {
                    let child_work_id =
                        crate::work_gateway::WorkGateway::child_work_id(parent, &task_id);
                    let gw = gateway.lock().unwrap_or_else(|e| e.into_inner());
                    if gw.get_work(&child_work_id).is_some() {
                        // Deterministic child ids make "already spawned" a
                        // lookup, not a remembered set — which is why the Work
                        // graph can hold what the deleted registry used to.
                        return Err(everyaios_blueprint::SubAgentError::DuplicateTask {
                            task_id: task_id.clone(),
                        }
                        .to_string());
                    }
                    (gw.delegation_gauge(parent)?, "work_graph")
                }
                None => (
                    everyaios_blueprint::DelegationGauge {
                        child_depth: params.get("depth").and_then(|v| v.as_u64()).unwrap_or(0)
                            as u32,
                        active: 0,
                        total: 0,
                    },
                    "policy_only",
                ),
            };
            policy.admit(&task_id, gauge).map_err(|e| e.to_string())?;
            // P64.4 — the child's grant set: denies inherited, `delegate` never
            // re-granted, `todo`/`task` default-deny unless this spec lists
            // them. The parent-grant side is the AgentBridge credential's to
            // prove (P69.B4); until then the spec is both the grant list and
            // the request, exactly as the coordinator sends it.
            spec.tools = everyaios_blueprint::derive_child_permissions(
                &spec.tools,
                &spec.blocked_tools,
                &spec.tools,
            );
            spec.depth = gauge.child_depth;
            // P69.D14 — the child Work itself. The caller (the turn loop) names
            // the parent Work it is already inside, so the delegation lands in
            // the one Work graph with a parent link, its own Run and an
            // ephemeral AgentSession.
            let child = match parent_work_id.as_deref() {
                Some(parent_work_id) => {
                    let agent_id = params
                        .get("agentId")
                        .and_then(|v| v.as_str())
                        .unwrap_or(harness);
                    let mut gw = gateway.lock().unwrap_or_else(|e| e.into_inner());
                    Some(gw.delegate_child_work(
                        parent_work_id,
                        &task_id,
                        &goal,
                        agent_id,
                        params
                            .get("worktreeId")
                            .and_then(|v| v.as_str())
                            .map(str::to_string),
                    )?)
                }
                None => None,
            };
            Ok(serde_json::json!({
                "task_id": task_id,
                "summary": "",
                "status": "running",
                "artifacts": [],
                "role": params.get("role").cloned().unwrap_or(serde_json::Value::Null),
                "harness": harness,
                "binding": binding,
                "planes": crate::RUNTIME_PLANES.len(),
                "tools": spec.tools,
                "depth": spec.depth,
                "accountedFrom": accounted_from,
                "workId": child.as_ref().map(|c| c.work_id.clone()),
                "runId": child.as_ref().map(|c| c.run_id.clone()),
                "agentSessionId": child.as_ref().map(|c| c.agent_session_id.clone()),
            }))
        }
        "subagent/complete" | "subagent/fail" => {
            let task_id = params
                .get("taskId")
                .and_then(|v| v.as_str())
                .filter(|v| !v.is_empty())
                .ok_or("subagent/complete requires taskId")?
                .to_string();
            let summary = params
                .get("summary")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let artifacts: Vec<String> = params
                .get("artifacts")
                .and_then(|v| v.as_array())
                .map(|a| {
                    a.iter()
                        .filter_map(|v| v.as_str().map(str::to_string))
                        .collect()
                })
                .unwrap_or_default();
            let failed = method == "subagent/fail";
            // The child Work *is* the record of the delegation (I8), so closing
            // one without naming its parent is refused: there would be nothing
            // to verify the task against and nothing to append the terminal
            // event to. A task the graph does not know is an error, not a
            // fabricated summary.
            let parent_work_id = params
                .get("workId")
                .and_then(|v| v.as_str())
                .filter(|v| !v.is_empty())
                .ok_or(
                    "subagent/complete requires workId — the child Work is the durable record of \
                     a delegated task (I8)",
                )?
                .to_string();
            let child_work_id =
                crate::work_gateway::WorkGateway::child_work_id(&parent_work_id, &task_id);
            {
                let mut gw = gateway.lock().unwrap_or_else(|e| e.into_inner());
                if gw.get_work(&child_work_id).is_none() {
                    return Err(everyaios_blueprint::SubAgentError::UnknownTask {
                        task_id: task_id.clone(),
                    }
                    .to_string());
                }
                // Terminal Run event on the child's own timeline + the
                // ephemeral session's termination.
                gw.finish_child_work(
                    &parent_work_id,
                    &task_id,
                    if failed { "failed" } else { "completed" },
                    params.get("reason").and_then(|v| v.as_str()),
                )?;
            }
            let result = everyaios_blueprint::SubAgentResult {
                task_id,
                summary,
                status: if failed {
                    everyaios_blueprint::TaskStatus::Failed
                } else {
                    everyaios_blueprint::TaskStatus::Done
                },
                artifacts,
            };
            // Summary-only by construction (WORK §8): one projection, no
            // transcript, plus the child Work id the caller closes.
            let mut view = everyaios_blueprint::parent_view(&result);
            view["workId"] = serde_json::json!(child_work_id);
            Ok(view)
        }
        other => Err(format!("method not found: {other}")),
    }
}

/// P71.1 — the delegation bridge behind the `delegate.*` shared-plane façades.
///
/// It holds the same two pieces the coordinator's `subagent/*` seam holds —
/// the spawn policy and the one Work Gateway — so a delegated task from an
/// external agent and one from the turn loop are the *same* code path:
/// admission limits, child Work, Run and ephemeral AgentSession. There is no
/// second delegation registry, and an unmounted bridge fails honestly rather
/// than fabricating a spawn.
struct DelegationBridge {
    policy: everyaios_blueprint::DelegationPolicy,
    gateway: Arc<Mutex<crate::work_gateway::WorkGateway>>,
}

impl crate::tools::DelegationToolBackend for DelegationBridge {
    fn spawn(&self, params: &serde_json::Value) -> Result<serde_json::Value, String> {
        let work_id = params
            .get("workId")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        if work_id.is_empty() {
            // The delegating Work is required: delegation without a parent Work
            // would mint an unlinked run outside the Work graph (I4). Identity
            // derivation from the bridge credential lands with the AgentBridge
            // (P69.B4); until then the caller must name it. Never inferred from
            // polite arguments.
            return Err(
                "delegate.spawn requires workId — the delegating Work (bridge-credential identity \
                 derivation is not mounted yet)"
                    .to_string(),
            );
        }
        subagent_rpc("subagent/spawn", params, &self.policy, &self.gateway)
    }

    fn status(&self, params: &serde_json::Value) -> Result<serde_json::Value, String> {
        let gateway = self.gateway.lock().unwrap_or_else(|e| e.into_inner());
        let child_work_id = match params
            .get("childWorkId")
            .and_then(|v| v.as_str())
            .filter(|v| !v.is_empty())
        {
            Some(id) => id.to_string(),
            None => {
                let parent = params
                    .get("workId")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                let task = params
                    .get("taskId")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                if parent.is_empty() || task.is_empty() {
                    return Err("delegate.status requires childWorkId, or workId + taskId".into());
                }
                crate::work_gateway::WorkGateway::child_work_id(parent, task)
            }
        };
        let Some(work) = gateway.get_work(&child_work_id) else {
            return Err(format!("no delegated child Work `{child_work_id}`"));
        };
        let presence = gateway.presence(&child_work_id);
        Ok(serde_json::json!({
            "childWorkId": work.work_id.as_str(),
            "parentWorkId": work.parent_work_id,
            "runId": work.current_run_id,
            "version": work.version,
            "presence": presence,
            "children": gateway.children_of(&child_work_id).len(),
        }))
    }

    fn cancel(&self, params: &serde_json::Value) -> Result<serde_json::Value, String> {
        let parent = params
            .get("workId")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let task = params
            .get("taskId")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        if parent.is_empty() || task.is_empty() {
            return Err("delegate.cancel requires workId + taskId".into());
        }
        let reason = params
            .get("reason")
            .and_then(|v| v.as_str())
            .unwrap_or("cancelled by caller");
        // Closing the child Work **is** the release (P71.3a): the terminal
        // `RunCancelled` event on the child's own timeline lands in the same
        // step that stops the graph counting it as active, so there is no
        // separate accounting left to hand back. Cancelling an already-closed
        // child is idempotent.
        let child = {
            let mut gw = self.gateway.lock().unwrap_or_else(|e| e.into_inner());
            gw.finish_child_work(&parent, &task, "cancelled", Some(reason))?
        };
        let released = {
            let gw = self.gateway.lock().unwrap_or_else(|e| e.into_inner());
            gw.presence_is_terminal(&child.work_id)
        };
        Ok(serde_json::json!({
            "childWorkId": child.work_id,
            "runId": child.run_id,
            "status": "cancelled",
            "released": released,
        }))
    }
}

/// The `terminal/*` methods the coordinator drives.
///
/// **Read-only on purpose.** The agent's *privileged* shell path is the
/// ticketed `script.run` tool (`tool/exec` → `tool/commit` → Guard-2 →
/// `TerminalExecutor::run`). Adding a run method here would be a second,
/// unticketed execution path for a privileged effect, which is what the
/// no-bypass invariant forbids — so this arm only ever *observes*.
///
/// What the coordinator cannot otherwise see is the plane's state: whether a
/// shell exists on this host, which sessions are live with what provenance and
/// cwd, and what the shell itself reported about the commands it ran. That is
/// exactly the agent's own situational awareness, and it is served from the
/// same [`crate::terminal::TerminalPlaneObserver`] row builders the Shell view
/// reads, so the two cannot drift.
///
/// No plane attached is not an error: `terminal/status` answers
/// `attached: false` rather than an empty list that reads as "a shell with
/// nothing running". The per-session reads do refuse, because a session id on
/// a host with no PTY host is a caller bug, not an empty result.
fn terminal_rpc(
    method: &str,
    params: &serde_json::Value,
    plane: Option<&dyn crate::terminal::TerminalPlaneObserver>,
) -> Result<serde_json::Value, String> {
    let param_usize = |key: &str, default: usize| -> usize {
        params
            .get(key)
            .and_then(|v| v.as_u64())
            .map(|v| v as usize)
            .unwrap_or(default)
    };
    let pty_id = || -> Result<&str, String> {
        params
            .get("ptyId")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .ok_or_else(|| format!("{method} requires ptyId"))
    };
    match method {
        "terminal/status" => {
            let status = match plane {
                Some(p) => p.plane_status(),
                None => crate::terminal::detached_plane_status(),
            };
            serde_json::to_value(status).map_err(|e| e.to_string())
        }
        "terminal/commands" => {
            let id = pty_id()?;
            let plane = plane.ok_or(NO_TERMINAL_PLANE)?;
            let rows = plane.commands(id, param_usize("limit", 50))?;
            let cwd = plane.session(id).map(|s| s.cwd).unwrap_or_default();
            serde_json::to_value(serde_json::json!({
                "ptyId": id,
                "cwd": cwd,
                "count": rows.len(),
                "commands": rows,
            }))
            .map_err(|e| e.to_string())
        }
        "terminal/last_command" => {
            let id = pty_id()?;
            let plane = plane.ok_or(NO_TERMINAL_PLANE)?;
            let block = plane.last_command(id, param_usize("maxChars", 6000))?;
            Ok(serde_json::json!({ "ptyId": id, "block": block }))
        }
        "terminal/history" => {
            let id = pty_id()?;
            let plane = plane.ok_or(NO_TERMINAL_PLANE)?;
            let block =
                plane.history(id, param_usize("limit", 10), param_usize("maxChars", 4000))?;
            Ok(serde_json::json!({ "ptyId": id, "block": block }))
        }
        other => Err(format!("method not found: {other}")),
    }
}

/// The refusal a per-session `terminal/*` read gets on a host with no PTY host.
/// Worded so the coordinator can surface it as a fact about the host rather
/// than retrying it as a transient failure.
const NO_TERMINAL_PLANE: &str = "terminal plane not attached — this host has no shell";

/// P64.3 — repo-map façade defaults. The coordinator applies its own token
/// budget on top of the returned rows, so this bound is only about how much of
/// the tree is walked.
const REPOMAP_MAX_FILES: usize = 200;
const REPOMAP_MAX_FILES_CAP: usize = 2000;

/// The `codeintel/*` methods the coordinator drives.
///
/// Served from `everyaios-codeintel` — the same implementation behind the UI's
/// `repomap_build` command — so the agent-facing and UI-facing façades cannot
/// drift apart. `workspace` is the tool layer's floored root, so the map covers
/// the tree the edit tools actually operate on rather than a root of its own.
/// P64.6 — bind a shadow-preflight request's `root` to the workspace floor.
///
/// An **absolute** root is honoured as given (a caller may legitimately point
/// the check at a monorepo package); an **absent or relative** root resolves
/// against `workspace`, which is how every `file_ops` path is floored. The
/// coordinator's default is `.` because it does not know the workspace, so
/// without this resolution a fired preflight would stage a shadow tree of the
/// *sidecar's* own cwd — checking a project the user never edited, and paying a
/// `git worktree add` on the wrong repository to do it.
///
/// Resolution lives in the router rather than the kernel on purpose: the kernel
/// deliberately knows no workspace (it takes a root and uses it), and this arm
/// is the only layer holding both the kernel and the tool service that owns the
/// floored path.
fn with_preflight_root(params: &Value, workspace: &std::path::Path) -> Value {
    let raw = params
        .get("root")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();
    let requested = std::path::Path::new(raw);
    // `.` (and an empty root) is how a caller that knows no workspace says "the
    // workspace itself". Joining it would leave a stray `.` component in the
    // path the receipt quotes, so it is answered directly.
    let resolved = if raw.is_empty() || raw == "." {
        workspace.to_path_buf()
    } else if requested.is_relative() {
        workspace.join(requested)
    } else {
        requested.to_path_buf()
    };
    let mut out = params.clone();
    if let Some(obj) = out.as_object_mut() {
        obj.insert(
            "root".to_string(),
            Value::String(resolved.to_string_lossy().into_owned()),
        );
    }
    out
}

fn codeintel_rpc(
    method: &str,
    params: &serde_json::Value,
    workspace: &std::path::Path,
) -> Result<serde_json::Value, String> {
    match method {
        "codeintel/repomap" => {
            let max_files = params
                .get("maxFiles")
                .and_then(|v| v.as_u64())
                .map(|v| v as usize)
                .unwrap_or(REPOMAP_MAX_FILES)
                .min(REPOMAP_MAX_FILES_CAP);
            let tags = everyaios_codeintel::repomap::ranked_tags(workspace, max_files);
            Ok(serde_json::json!({ "tags": tags }))
        }
        other => Err(format!("method not found: {other}")),
    }
}

impl<W: Write + Send + 'static, R: Read + Send + 'static> ChatRelay<W, R> {
    pub fn new(
        link: SidecarLink<W, R>,
        vault: Arc<Mutex<Vault>>,
        on_event: impl Fn(ChatWireEvent) + Send + 'static,
    ) -> Self {
        Self::new_with_guard(
            link,
            vault,
            Arc::new(Mutex::new(GuardService::new())),
            on_event,
        )
    }

    /// Construct with a **shared** [`GuardService`] (the Tauri shell owns it,
    /// so approval cards and the coordinator's `guard/*` dispatch read/write
    /// one ticket store — single source of truth).
    pub fn new_with_guard(
        link: SidecarLink<W, R>,
        vault: Arc<Mutex<Vault>>,
        guard: Arc<Mutex<GuardService>>,
        on_event: impl Fn(ChatWireEvent) + Send + 'static,
    ) -> Self {
        let egress = Arc::new(Mutex::new(everyaios_guard::EgressEngine::new(
            everyaios_guard::ConnectivityMode::ThirdParty,
        )));
        let capabilities = Arc::new(Mutex::new(everyaios_guard::LocalCapabilityBroker::new()));
        let mut tool_service = ToolService::new_with_egress(
            Arc::clone(&guard),
            crate::default_data_dir().join("workspace"),
            Arc::clone(&egress),
        );
        tool_service.attach_capability_broker(Arc::clone(&capabilities));
        // P71.1 — the `delegate.*` façade seam: the same spawn policy and Work
        // Gateway the `subagent/*` arm uses, so delegation from an external
        // agent cannot diverge from coordinator delegation.
        let delegation = everyaios_blueprint::DelegationPolicy::new(
            everyaios_blueprint::SubAgentLimits::default(),
        );
        let work_gateway = Arc::new(Mutex::new(
            crate::work_gateway::WorkGateway::open_default()
                .unwrap_or_else(|_| crate::work_gateway::WorkGateway::new()),
        ));
        tool_service.attach_delegation(Arc::new(DelegationBridge {
            policy: delegation,
            gateway: Arc::clone(&work_gateway),
        }));
        let tools = Arc::new(Mutex::new(tool_service));
        Self {
            link,
            vault,
            sessions: Arc::new(Mutex::new(HashMap::new())),
            base_urls: Arc::new(Mutex::new(HashMap::new())),
            endpoints: Arc::new(Mutex::new(HashMap::new())),
            profiles: Arc::new(Mutex::new(None)),
            local_endpoints: Arc::new(Mutex::new(HashMap::new())),
            memory: Arc::new(Mutex::new(load_persistent_memory())),
            guard,
            plan: Arc::new(Mutex::new(PlanService::new())),
            scheduler: Arc::new(Mutex::new(SchedulerService::load_or_new(
                crate::default_data_dir().join("scheduler.json"),
            ))),
            tools,
            evals: Arc::new(Mutex::new(EvalService::new())),
            executions: Arc::new(Mutex::new(ExecutionKernel::new())),
            delegation,
            skill_store: Arc::new(Mutex::new(everyaios_blueprint::SkillStore::new(
                skills_root(),
            ))),
            terminal_plane: Arc::new(Mutex::new(None)),
            work_gateway,
            capabilities,
            egress,
            tasks: Arc::new(Mutex::new(crate::task_ledger::TaskLedger::new(Box::new(
                crate::task_ledger::FileStore::new(crate::default_data_dir().join("tasks.json")),
            )))),
            on_event: Arc::new(Mutex::new(Box::new(on_event))),
            agui: crate::agui::AguiRelay::new(),
        }
    }

    /// Unified execution kernel (chat / plan / scheduler / ACP).
    pub fn executions(&self) -> Arc<Mutex<crate::execution::ExecutionKernel>> {
        Arc::clone(&self.executions)
    }

    /// P49 local Work Gateway handle.
    pub fn work_gateway(&self) -> Arc<Mutex<crate::work_gateway::WorkGateway>> {
        Arc::clone(&self.work_gateway)
    }

    /// Authorize and durably record the beginning of a capability-backed
    /// effect. Only the opaque grant id is projected into Work events; no
    /// credential material crosses this boundary.
    pub fn record_capability_effect(
        &self,
        work_id: &str,
        effect_id: &str,
        request: everyaios_guard::CapabilityRequest,
        grant_id: &str,
    ) -> Result<(), String> {
        self.capabilities
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .invoke(grant_id, &request)
            .map_err(|e| e.to_string())?;
        self.work_gateway
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .record_effect_with_grant(work_id, effect_id, "attempted", "", Some(grant_id))
    }

    /// The memory service handle (tests + the Tauri `usage_snapshot` command
    /// read from it; the sidecar writes through `memory/*` requests).
    pub fn memory(&self) -> Arc<Mutex<MemoryService>> {
        Arc::clone(&self.memory)
    }

    /// The Guard-2 service handle (the Tauri approval cards read from it; the
    /// coordinator drives `guard/*` requests against it).
    pub fn guard(&self) -> Arc<Mutex<GuardService>> {
        Arc::clone(&self.guard)
    }

    pub fn tools(&self) -> Arc<Mutex<ToolService>> {
        Arc::clone(&self.tools)
    }

    /// Attach a live CDP backend to the tool executor (after `browser_start`).
    pub fn attach_browser(&self, browser: Arc<dyn crate::tools::BrowserBackend>) {
        if let Ok(mut tools) = self.tools.lock() {
            tools.attach_browser(browser);
        }
    }

    /// P68.9 — attach the **one PTY plane** as the `script.run` executor.
    ///
    /// The host calls this at boot with the same `PtyHost` the Shell view uses,
    /// so an agent command runs on the automation profile with `Agent`
    /// provenance: audited as `terminal.agent_run` and rendered as a labelled
    /// read-only tab. Until it is attached, `script.run` fails honestly rather
    /// than quietly substituting a private pipe nobody can watch.
    pub fn attach_terminal(&self, terminal: Arc<dyn crate::tools::TerminalExecutor>) {
        if let Ok(mut tools) = self.tools.lock() {
            tools.attach_terminal(terminal);
        }
    }

    /// P54.5 — attach the **read-only** view of that same plane for `terminal/*`.
    ///
    /// This is the observation half of the seam, not a second execution path:
    /// the observer cannot run anything, so the only way to *cause* a shell
    /// effect from the sidecar stays the ticketed `script.run` tool. The host
    /// passes the same `PtyHost` object it gave `attach_terminal`, so a session
    /// the agent spawned is the session the coordinator can see.
    pub fn attach_terminal_plane(&self, plane: Arc<dyn crate::terminal::TerminalPlaneObserver>) {
        if let Ok(mut slot) = self.terminal_plane.lock() {
            *slot = Some(plane);
        }
    }

    /// P48.3 — attach the live desktop engine as the `desktop.*` executor.
    ///
    /// The host calls this at boot when a platform backend attaches, and again
    /// after a user-triggered `desktop_attach`. Until it is attached, every
    /// desktop tool fails closed with `desktop session not attached` — the
    /// honest headless / no-display posture, never a silent substitute.
    ///
    /// The backend is expected to declare **agent** provenance for its acts, so
    /// an agent-initiated desktop action is audited as an agent action rather
    /// than as the user's own gesture.
    pub fn attach_desktop(&self, desktop: Arc<dyn crate::tools::DesktopBackend>) {
        if let Ok(mut tools) = self.tools.lock() {
            tools.attach_desktop(desktop);
        }
    }

    /// The Stage-0 plan service handle (the coordinator steps per-plan
    /// circuit breakers via `plan/*`; trips surface as chat interrupts).
    pub fn plan(&self) -> Arc<Mutex<PlanService>> {
        Arc::clone(&self.plan)
    }

    /// The P6.4 scheduled-task service handle (the coordinator + Tauri shell
    /// drive it via `scheduler/*` methods).
    pub fn scheduler(&self) -> Arc<Mutex<SchedulerService>> {
        Arc::clone(&self.scheduler)
    }

    /// The P43 detached-work task ledger handle (the coordinator + Tauri
    /// shell drive it via `tasks/*` methods).
    pub fn tasks(&self) -> Arc<Mutex<crate::task_ledger::TaskLedger>> {
        Arc::clone(&self.tasks)
    }

    /// Load the J21 policy file into the Guard-2 service (builder pattern —
    /// the shell calls this at boot with `~/.everyaios/permissions.toml`).
    pub fn with_policy(&self, path: &std::path::Path) -> &Self {
        self.guard
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .load_policy_from(path);
        self
    }

    /// Register a keyless local endpoint (P1.8/A5). The src-tauri shell uses
    /// [`crate::LocalManager`] for discovery (ollama always, llamafile only
    /// when a binary exists) before calling this.
    pub fn with_local(&self, provider: &str, endpoint: LocalEndpoint) -> &Self {
        self.grant_egress_url(&endpoint.base_url);
        self.local_endpoints
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .insert(provider.to_string(), endpoint);
        self
    }

    /// Override a provider base URL (config / tests).
    pub fn with_base_url(&self, provider: &str, url: impl Into<String>) -> &Self {
        let url = url.into();
        self.grant_egress_url(&url);
        self.base_urls
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .insert(provider.to_string(), url);
        self
    }

    /// **P62.4** — a user-chosen endpoint is an authorized destination, so
    /// grant its host through the network floor.
    ///
    /// The destination floor (P62.1) exists to refuse destinations an *agent*
    /// chose — cloud metadata, link-local, and (policy-gated) private ranges —
    /// and `urlfloor` still refuses all of those on the agent tool path. But a
    /// provider `base_url` reaching this relay only exists because the user (or
    /// the shipped catalog) configured it: a self-hosted gateway, a NAS, a
    /// loopback runtime. Without this grant the floor's private-range refusal
    /// would silently break exactly those endpoints, which is the failure mode
    /// the floor was never meant to cause. The unconditional classes
    /// (metadata/link-local/multicast) are **not** bypassed by a grant.
    fn grant_egress_url(&self, url: &str) {
        if let Ok(mut e) = self.egress.lock() {
            e.grant_url(url);
        }
    }

    /// **P55.5** — register a resolved provider endpoint (base URL + wire
    /// dialect + headers). The shell builds these from the live models.dev
    /// catalog and the user-config profiles at boot; every chat turn then
    /// routes to the provider's real endpoint instead of a hardcoded subset.
    pub fn with_endpoint(
        &self,
        provider: &str,
        endpoint: everyaios_vault::ProviderEndpoint,
    ) -> &Self {
        self.grant_egress_url(&endpoint.base_url);
        self.endpoints
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .insert(provider.to_string(), endpoint);
        self
    }

    /// **P63** — retire a provider endpoint when it stops being connected (its
    /// last vault key was removed, or its profile was deleted). Without this
    /// the resolved-endpoint map is append-only for the life of the process,
    /// so the next turn could still dial a provider the user just disconnected.
    ///
    /// The egress grant for the old `base_url` is intentionally **not** revoked:
    /// grants are an additive, user-authorized destination set, and the agent
    /// tool path is unaffected because it floors destinations on its own
    /// (`urlfloor`), never through this relay map.
    pub fn remove_endpoint(&self, provider: &str) -> bool {
        self.endpoints
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .remove(provider)
            .is_some()
    }

    /// **P55.6** — attach the durable provider-profile store. The relay reads
    /// it when resolving endpoints, so a base URL entered in Settings is
    /// actually used by the next turn (it used to be discarded).
    pub fn with_profiles(&self, store: everyaios_catalog::ProfileStore) -> &Self {
        *self.profiles.lock().unwrap_or_else(|e| e.into_inner()) = Some(store);
        self
    }

    /// The attached profile store, if any.
    pub fn profiles(&self) -> Option<everyaios_catalog::ProfileStore> {
        self.profiles
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
    }

    /// The sidecar link (cancel path + tests).
    pub fn link(&self) -> &SidecarLink<W, R> {
        &self.link
    }

    /// Attach the AG-UI UI sink (P11.5.11). The shell calls this at boot so
    /// `agui/event` notifications from the coordinator are forwarded as
    /// `agui-event` emits. Returns the relay (the shell's `agui_send` command
    /// uses it to push UI→coordinator events into the sidecar link).
    ///
    /// The emit is **unconsumed today**: no UI code listens for `agui-event`
    /// (and `agui_send`/`agui_listen` are never invoked from the UI), because
    /// the generative-UI surface that would consume them is the deferred half
    /// of P11.5.11. Attaching the sink does not make AG-UI live.
    pub fn with_agui(&self, sink: impl Fn(String) + Send + 'static) -> crate::agui::AguiRelay {
        self.agui.attach(sink);
        self.agui.clone()
    }

    /// The AG-UI relay handle (Tauri `agui_send`/`agui_stream` commands).
    pub fn agui(&self) -> crate::agui::AguiRelay {
        self.agui.clone()
    }

    /// Push a UI→coordinator AG-UI event into the sidecar link as an
    /// `agui/event` notification (e.g. `interrupt_resolved`).
    pub fn send_agui(&self, line: &str) -> Result<(), crate::sidecar_link::LinkError> {
        self.link
            .writer()
            .notify("agui/event", serde_json::json!({ "line": line }))
    }

    /// Start the long-lived consumer loop (call ONCE per link). Handles
    /// `provider/stream` requests (broker in Rust) and forwards `chat/*`
    /// notifications to `on_event`, including the post-turn budget kill.
    pub fn spawn(&self) {
        let vault = Arc::clone(&self.vault);
        let receiver = self.link.receiver();
        let writer = self.link.writer();
        let sessions = Arc::clone(&self.sessions);
        let on_event = Arc::clone(&self.on_event);
        let base_urls = Arc::clone(&self.base_urls);
        let endpoints = Arc::clone(&self.endpoints);
        let local_endpoints = Arc::clone(&self.local_endpoints);
        let memory = Arc::clone(&self.memory);
        let guard = Arc::clone(&self.guard);
        let plan = Arc::clone(&self.plan);
        let scheduler = Arc::clone(&self.scheduler);
        let tools = Arc::clone(&self.tools);
        let evals = Arc::clone(&self.evals);
        let executions = Arc::clone(&self.executions);
        let delegation = self.delegation;
        let skill_store = Arc::clone(&self.skill_store);
        let terminal_plane = Arc::clone(&self.terminal_plane);
        let work_gateway = Arc::clone(&self.work_gateway);
        let capabilities = Arc::clone(&self.capabilities);
        let egress = Arc::clone(&self.egress);
        let tasks = Arc::clone(&self.tasks);
        let agui = self.agui.clone();

        std::thread::spawn(move || loop {
            let inbound = receiver.lock().unwrap_or_else(|e| e.into_inner()).recv();
            let Ok(inbound) = inbound else {
                break; // reader thread gone — sidecar is dead
            };
            match inbound {
                Inbound::Request { id, method, params } => match method.as_str() {
                    "provider/stream" => {
                        // Ack immediately, then run the broker on its own
                        // thread (never block the reader/consumer loop).
                        let _ = writer.reply(id, serde_json::json!({ "accepted": true }));
                        let w2 = writer.clone();
                        let vault2 = Arc::clone(&vault);
                        let base2 = Arc::clone(&base_urls);
                        let ep2 = Arc::clone(&endpoints);
                        let local2 = Arc::clone(&local_endpoints);
                        let capabilities2 = Arc::clone(&capabilities);
                        std::thread::spawn(move || {
                            let _ = stream_provider(
                                vault2,
                                base2,
                                ep2,
                                local2,
                                capabilities2,
                                params,
                                w2,
                            );
                        });
                    }
                    // ARCH/05 durable-observation seam: the coordinator
                    // hydrates its RouteDecision ring at boot from the vault's
                    // `token_usage` ledger (provider/model/cost per completed
                    // call) so routing survives restarts. Wrapped: vault read
                    // is a small indexed query on the consumer loop.
                    "usage/recent" => {
                        let v = vault.lock().unwrap_or_else(|e| e.into_inner());
                        let limit = params.get("limit").and_then(|x| x.as_u64()).unwrap_or(100);
                        match v.recent_usage(limit) {
                            Ok(rows) => {
                                let _ = writer.reply(
                                    id,
                                    serde_json::to_value(rows)
                                        .unwrap_or_else(|_| serde_json::json!([])),
                                );
                            }
                            Err(e) => {
                                let _ = writer.reply_error(id, &e.to_string());
                            }
                        }
                    }
                    // P5.1/P5.3/P5.4/P5.9: memory + usage dispatch. Runs on
                    // the consumer loop (fast, deterministic, no I/O) so the
                    // reply is synchronous and the sidecar can await it.
                    method if method.starts_with("memory/") || method == "usage/snapshot" => {
                        let mut svc = memory.lock().unwrap_or_else(|e| e.into_inner());
                        let is_mutation = matches!(
                            method,
                            "memory/write"
                                | "memory/forget"
                                | "memory/ghost"
                                | "memory/ghost_batch"
                                | "memory/consolidate"
                                | "memory/tick"
                                | "memory/scope"
                                | "memory/assess"
                                | "memory/load"
                        );
                        match svc.handle(method, &params) {
                            Ok(mut out) => {
                                if is_mutation {
                                    persist_memory(&svc);
                                }
                                // P51.28 — learnedSkills on memory/plan is the
                                // model warm set (disable-model-invocation omitted).
                                if method == "memory/plan" {
                                    let store =
                                        skill_store.lock().unwrap_or_else(|e| e.into_inner());
                                    if let Ok(skills) = store.scan() {
                                        if let Some(obj) = out.as_object_mut() {
                                            obj.insert(
                                                "learnedSkills".into(),
                                                serde_json::json!(
                                                    everyaios_blueprint::model_warm_set(&skills)
                                                ),
                                            );
                                        }
                                    }
                                }
                                let _ = writer.reply(id, out);
                            }
                            Err(e) => {
                                let _ = writer.reply_error(id, &e);
                            }
                        }
                    }
                    // P43 (B7 v3.53): detached-work task ledger dispatch. The
                    // coordinator + Tauri shell drive the same Rust-owned
                    // state machine (tasks/list, start, complete, cancel,
                    // retry, reap, prune) — completion wakes watchers
                    // (push-driven, never polled).
                    method if method.starts_with("tasks/") => {
                        let mut svc = tasks.lock().unwrap_or_else(|e| e.into_inner());
                        match svc.handle(method, &params) {
                            Ok(out) => {
                                let _ = writer.reply(id, out);
                            }
                            Err(e) => {
                                let _ = writer.reply_error(id, &e);
                            }
                        }
                    }
                    // P7.5/J21: Guard-2 pre-flight + executor call-sites. The
                    // sidecar drives the *restricted* surface (`handle_sidecar`):
                    // it can evaluate + use tickets + read, but never
                    // approve/reject/reset/estop/profile (human-only).
                    method if method.starts_with("guard/") => {
                        let mut svc = guard.lock().unwrap_or_else(|e| e.into_inner());
                        match svc.handle_sidecar(method, &params) {
                            Ok(out) => {
                                let _ = writer.reply(id, out);
                            }
                            Err(e) => {
                                let _ = writer.reply_error(id, &e);
                            }
                        }
                    }
                    // P6.3 Stage-0: per-plan circuit-breaker stepping. The
                    // coordinator proposes each step; Rust disposes (the
                    // breaker state lives here). Trips come back as
                    // `{ok:false, interrupt}` and become chat/interrupt.
                    method if method.starts_with("plan/") => {
                        let mut svc = plan.lock().unwrap_or_else(|e| e.into_inner());
                        match svc.handle(method, &params) {
                            Ok(out) => {
                                if method == "plan/begin" {
                                    if let Some(pid) = params.get("planId").and_then(|v| v.as_str())
                                    {
                                        let mut k =
                                            executions.lock().unwrap_or_else(|e| e.into_inner());
                                        let ex = k.begin(
                                            crate::execution::ExecutionTrigger::Plan,
                                            pid,
                                            pid,
                                            None,
                                            String::new(),
                                            format!(r#"{{"planId":"{pid}"}}"#),
                                            vec![],
                                        );
                                        k.alias(&format!("plan:{pid}"), &ex.id);
                                        let _ = k.transition(
                                            &ex.id,
                                            crate::execution::ExecutionPhase::Running,
                                        );
                                    }
                                }
                                if method == "plan/end" {
                                    if let Some(pid) = params.get("planId").and_then(|v| v.as_str())
                                    {
                                        let mut k =
                                            executions.lock().unwrap_or_else(|e| e.into_inner());
                                        if let Some(id) =
                                            k.by_alias(&format!("plan:{pid}")).map(|e| e.id.clone())
                                        {
                                            let _ = k.transition(
                                                &id,
                                                crate::execution::ExecutionPhase::Verifying,
                                            );
                                            let _ = k.transition(
                                                &id,
                                                crate::execution::ExecutionPhase::Completed,
                                            );
                                        }
                                    }
                                }
                                let _ = writer.reply(id, out);
                            }
                            Err(e) => {
                                let _ = writer.reply_error(id, &e);
                            }
                        }
                    }
                    // P6.4 (B7): scheduled-task dispatch. The coordinator
                    // ticks `scheduler/due`, starts/finishes leases, fires
                    // events + webhooks; Rust owns the job state.
                    method if method.starts_with("scheduler/") => {
                        let mut svc = scheduler.lock().unwrap_or_else(|e| e.into_inner());
                        match svc.handle(method, &params) {
                            Ok(out) => {
                                if method == "scheduler/lease_start" {
                                    if let Some(jid) = params.get("id").and_then(|v| v.as_str()) {
                                        let run_id = out
                                            .get("runId")
                                            .and_then(|v| v.as_str())
                                            .unwrap_or(jid)
                                            .to_string();
                                        let mut k =
                                            executions.lock().unwrap_or_else(|e| e.into_inner());
                                        let ex = k.begin_named(
                                            run_id,
                                            crate::execution::ExecutionTrigger::Scheduler,
                                            jid,
                                            jid,
                                            None,
                                            String::new(),
                                            format!(r#"{{"jobId":"{jid}"}}"#),
                                            vec![],
                                        );
                                        k.alias(&format!("job:{jid}"), &ex.id);
                                        let _ = k.transition(
                                            &ex.id,
                                            crate::execution::ExecutionPhase::Running,
                                        );
                                    }
                                }
                                if method == "scheduler/lease_finish" {
                                    if let Some(jid) = params.get("id").and_then(|v| v.as_str()) {
                                        let ok = params
                                            .get("ok")
                                            .and_then(|v| v.as_bool())
                                            .unwrap_or(false);
                                        let mut k =
                                            executions.lock().unwrap_or_else(|e| e.into_inner());
                                        if let Some(eid) =
                                            k.by_alias(&format!("job:{jid}")).map(|e| e.id.clone())
                                        {
                                            let next = if ok {
                                                crate::execution::ExecutionPhase::Completed
                                            } else {
                                                crate::execution::ExecutionPhase::Failed
                                            };
                                            let _ = k.transition(
                                                &eid,
                                                crate::execution::ExecutionPhase::Verifying,
                                            );
                                            let _ = k.transition(&eid, next);
                                        }
                                    }
                                }
                                let _ = writer.reply(id, out);
                            }
                            Err(e) => {
                                let _ = writer.reply_error(id, &e);
                            }
                        }
                    }
                    method if method.starts_with("tool/") => {
                        let mut svc = tools.lock().unwrap_or_else(|e| e.into_inner());
                        let effect_id = params
                            .get("effectId")
                            .and_then(|v| v.as_str())
                            .or_else(|| params.get("ticketId").and_then(|v| v.as_str()))
                            .unwrap_or("")
                            .to_string();
                        let work_id = params.get("workId").and_then(|v| v.as_str());
                        let grant_id = params.get("capabilityGrantId").and_then(|v| v.as_str());
                        if method == "tool/commit" && !effect_id.is_empty() {
                            if let Some(work_id) = work_id {
                                let _ = work_gateway
                                    .lock()
                                    .unwrap_or_else(|e| e.into_inner())
                                    .record_effect_with_grant(
                                        work_id,
                                        &effect_id,
                                        "attempted",
                                        "",
                                        grant_id,
                                    );
                            }
                        }
                        let result = svc.handle(method, &params);
                        if method == "tool/commit" && !effect_id.is_empty() {
                            if let Some(work_id) = work_id {
                                let mut gateway =
                                    work_gateway.lock().unwrap_or_else(|e| e.into_inner());
                                match &result {
                                    Ok(out) => {
                                        let ok = out
                                            .get("ok")
                                            .and_then(|v| v.as_bool())
                                            .unwrap_or(false);
                                        let outcome = out
                                            .get("state")
                                            .and_then(|v| v.as_str())
                                            .unwrap_or(if ok { "ok" } else { "failed" });
                                        let _ = gateway.record_effect(
                                            work_id, &effect_id, "observed", outcome,
                                        );
                                        let _ = gateway.record_effect(
                                            work_id,
                                            &effect_id,
                                            "verified",
                                            if ok { "true" } else { "false" },
                                        );
                                    }
                                    Err(error) => {
                                        let _ = gateway
                                            .record_effect(work_id, &effect_id, "observed", error);
                                        let _ = gateway.record_effect(
                                            work_id, &effect_id, "verified", "false",
                                        );
                                    }
                                }
                            }
                        }
                        match result {
                            Ok(out) => {
                                let _ = writer.reply(id, out);
                            }
                            Err(e) => {
                                let _ = writer.reply_error(id, &e);
                            }
                        }
                    }
                    method if method.starts_with("eval/") => {
                        let mut svc = evals.lock().unwrap_or_else(|e| e.into_inner());
                        match svc.handle(method, &params) {
                            Ok(out) => {
                                let _ = writer.reply(id, out);
                            }
                            Err(e) => {
                                let _ = writer.reply_error(id, &e);
                            }
                        }
                    }
                    method if method.starts_with("work/") => {
                        let mut gateway = work_gateway.lock().unwrap_or_else(|e| e.into_inner());
                        match handle_work_gateway(&mut gateway, method, &params) {
                            Ok(out) => {
                                let _ = writer.reply(id, out);
                            }
                            Err(e) => {
                                let _ = writer.reply_error(id, &e);
                            }
                        }
                    }
                    method if method.starts_with("execution/") => {
                        // P64.6 — resolve the shadow-preflight root before the
                        // kernel sees the request. The coordinator sends `.`
                        // (it has no workspace), and the kernel has none either,
                        // so this arm — holding both the kernel and the tool
                        // service — is where `.` becomes the floored workspace.
                        let rooted: Option<Value> = if method == "execution/preflight" {
                            let workspace = {
                                let svc = tools.lock().unwrap_or_else(|e| e.into_inner());
                                svc.workspace().to_path_buf()
                            };
                            Some(with_preflight_root(&params, &workspace))
                        } else {
                            None
                        };
                        let mut svc = executions.lock().unwrap_or_else(|e| e.into_inner());
                        let result = svc.handle(method, rooted.as_ref().unwrap_or(&params));
                        if let Ok(out) = &result {
                            if method == "execution/record_approval" {
                                if let (Some(work_id), Some(ticket_id), Some(approved)) = (
                                    params.get("workId").and_then(|v| v.as_str()),
                                    params.get("ticketId").and_then(|v| v.as_str()),
                                    params.get("approved").and_then(|v| v.as_bool()),
                                ) {
                                    let _ = work_gateway
                                        .lock()
                                        .unwrap_or_else(|e| e.into_inner())
                                        .record_approval(work_id, ticket_id, approved);
                                }
                            }
                            if method == "execution/attach_receipt" {
                                if let (Some(work_id), Some(receipt_id)) = (
                                    params.get("workId").and_then(|v| v.as_str()),
                                    params.get("receiptId").and_then(|v| v.as_str()),
                                ) {
                                    let _ = work_gateway
                                        .lock()
                                        .unwrap_or_else(|e| e.into_inner())
                                        .record_artifact(work_id, receipt_id, true);
                                }
                            }
                            if method == "execution/begin" {
                                if let (Some(work_id), Some(execution_id)) = (
                                    params.get("workId").and_then(|v| v.as_str()),
                                    out.get("id").and_then(|v| v.as_str()),
                                ) {
                                    let _ = work_gateway
                                        .lock()
                                        .unwrap_or_else(|e| e.into_inner())
                                        .bind_execution(work_id, execution_id);
                                }
                            }
                            if method == "execution/transition" {
                                if let (Some(work_id), Some(execution_id), Some(state)) = (
                                    params.get("workId").and_then(|v| v.as_str()),
                                    params.get("id").and_then(|v| v.as_str()),
                                    params.get("state").and_then(|v| v.as_str()),
                                ) {
                                    let _ = work_gateway
                                        .lock()
                                        .unwrap_or_else(|e| e.into_inner())
                                        .record_execution_transition(work_id, execution_id, state);
                                }
                            }
                        }
                        match result {
                            Ok(out) => {
                                let _ = writer.reply(id, out);
                            }
                            Err(e) => {
                                let _ = writer.reply_error(id, &e);
                            }
                        }
                    }
                    "capability/allow" => {
                        let run_id = params.get("runId").and_then(|v| v.as_str()).unwrap_or("");
                        let scopes = params
                            .get("capabilities")
                            .and_then(|v| v.as_array())
                            .map(|items| {
                                items
                                    .iter()
                                    .filter_map(|v| v.as_str().map(str::to_string))
                                    .collect::<Vec<_>>()
                            })
                            .unwrap_or_default();
                        if run_id.is_empty() || scopes.is_empty() {
                            let _ = writer.reply_error(id, "runId and capabilities are required");
                        } else {
                            capabilities
                                .lock()
                                .unwrap_or_else(|e| e.into_inner())
                                .allow_for_run(run_id, scopes);
                            let _ = writer.reply(id, serde_json::json!({ "ok": true }));
                        }
                    }
                    "capability/authorize" => {
                        let request: Result<everyaios_guard::CapabilityRequest, _> =
                            serde_json::from_value(params.clone());
                        let ttl = params
                            .get("ttlMs")
                            .and_then(|v| v.as_u64())
                            .unwrap_or(60_000);
                        match request {
                            Ok(request) => match capabilities
                                .lock()
                                .unwrap_or_else(|e| e.into_inner())
                                .authorize(request, ttl)
                            {
                                Ok(grant) => {
                                    let _ = writer.reply(
                                        id,
                                        serde_json::to_value(grant)
                                            .unwrap_or_else(|_| serde_json::json!({})),
                                    );
                                }
                                Err(e) => {
                                    let _ = writer.reply_error(id, &e.to_string());
                                }
                            },
                            Err(e) => {
                                let _ = writer
                                    .reply_error(id, &format!("invalid capability request: {e}"));
                            }
                        }
                    }
                    "capability/revoke" => {
                        let grant_id = params.get("grantId").and_then(|v| v.as_str()).unwrap_or("");
                        let revoked = capabilities
                            .lock()
                            .unwrap_or_else(|e| e.into_inner())
                            .revoke(grant_id);
                        let _ = writer.reply(id, serde_json::json!({ "revoked": revoked }));
                    }
                    "capability/manifest" => {
                        let commit = params.get("commit").and_then(|c| c.as_str()).unwrap_or("");
                        let man = crate::capability_manifest::generate_manifest(commit);
                        match serde_json::to_value(&man) {
                            Ok(v) => {
                                let _ = writer.reply(id, v);
                            }
                            Err(e) => {
                                let _ = writer.reply_error(id, &e.to_string());
                            }
                        }
                    }
                    method if method.starts_with("egress/") => {
                        let mut eng = egress.lock().unwrap_or_else(|e| e.into_inner());
                        match method {
                            "egress/mode" => {
                                if let Some(m) = params.get("mode").and_then(|v| v.as_str()) {
                                    let mode = match m {
                                        "offline" => everyaios_guard::ConnectivityMode::Offline,
                                        "local" => everyaios_guard::ConnectivityMode::Local,
                                        "byok" => everyaios_guard::ConnectivityMode::Byok,
                                        _ => everyaios_guard::ConnectivityMode::ThirdParty,
                                    };
                                    eng.set_mode(mode);
                                }
                                let _ = writer.reply(id, serde_json::json!({ "ok": true }));
                            }
                            "egress/check" => {
                                let dest = params
                                    .get("destination")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("");
                                let kind = params
                                    .get("kind")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("network");
                                let plan = eng.plan(dest, kind, None, "check", &[]);
                                let _ = writer.reply(
                                    id,
                                    serde_json::to_value(plan).unwrap_or(serde_json::json!({})),
                                );
                            }
                            "egress/inventory" => {
                                let _ = writer
                                    .reply(id, serde_json::json!({ "inventory": eng.inventory() }));
                            }
                            _ => {
                                let _ = writer.reply_error(id, "method not found");
                            }
                        }
                    }
                    // P49.10–12: session-runtime lifecycle. The agent loop
                    // drives PtySession / WorktreeBinding / AgentSession as
                    // first-class tools; the gateway owns the durable state +
                    // WorkEvent fan-out (survives client disconnect).
                    method if method.starts_with("work/") => {
                        let mut gw = work_gateway.lock().unwrap_or_else(|e| e.into_inner());
                        match gw.handle_rpc(method, &params) {
                            Ok(out) => {
                                let _ = writer.reply(id, out);
                            }
                            Err(e) => {
                                let _ = writer.reply_error(id, &e);
                            }
                        }
                    }
                    // P64.8 — skill distillation. Was `method not found`, so the
                    // coordinator's "best-effort" catch swallowed it and nothing
                    // was ever distilled.
                    method if method.starts_with("skill/") => {
                        let store = skill_store.lock().unwrap_or_else(|e| e.into_inner());
                        match skill_rpc(method, &params, &store) {
                            Ok(out) => {
                                let _ = writer.reply(id, out);
                            }
                            Err(e) => {
                                let _ = writer.reply_error(id, &e);
                            }
                        }
                    }
                    // P64.4 — sub-agent spawn admission. Was `method not found`,
                    // which made `dispatchSubAgent` throw "native runtime not
                    // wired" on every delegation.
                    method if method.starts_with("subagent/") => {
                        match subagent_rpc(method, &params, &delegation, &work_gateway) {
                            Ok(out) => {
                                let _ = writer.reply(id, out);
                            }
                            Err(e) => {
                                let _ = writer.reply_error(id, &e);
                            }
                        }
                    }
                    // P64.3 — the repo-map façade the coordinator drives with
                    // `codeintel/repomap`. While this arm was missing the
                    // request fell through to `method not found`, and because
                    // the coordinator treats the map as best-effort the failure
                    // was silent: the repo map was never injected in production.
                    method if method.starts_with("codeintel/") => {
                        let workspace = {
                            let svc = tools.lock().unwrap_or_else(|e| e.into_inner());
                            svc.workspace().to_path_buf()
                        };
                        match codeintel_rpc(method, &params, &workspace) {
                            Ok(out) => {
                                let _ = writer.reply(id, out);
                            }
                            Err(e) => {
                                let _ = writer.reply_error(id, &e);
                            }
                        }
                    }
                    // P54.5 — the read-only view of the one PTY plane. The
                    // privileged shell path is `script.run` on `tool/exec` →
                    // `tool/commit` (Guard-2 ticketed); this arm deliberately
                    // has no run method, so it cannot become a second path to a
                    // privileged effect.
                    method if method.starts_with("terminal/") => {
                        let slot = terminal_plane.lock().unwrap_or_else(|e| e.into_inner());
                        let plane: Option<&dyn crate::terminal::TerminalPlaneObserver> =
                            slot.as_deref();
                        match terminal_rpc(method, &params, plane) {
                            Ok(out) => {
                                let _ = writer.reply(id, out);
                            }
                            Err(e) => {
                                let _ = writer.reply_error(id, &e);
                            }
                        }
                    }
                    _ => {
                        let _ = writer.reply_error(id, &format!("method not found: {method}"));
                    }
                },
                Inbound::Notification { method, params } => {
                    let stream_id = params
                        .get("streamId")
                        .and_then(|s| s.as_str())
                        .unwrap_or("")
                        .to_string();
                    // The coordinator carries the originating session on the
                    // event. The stream registry is the compatibility path
                    // for older sidecars and for events emitted immediately
                    // after the Rust request is acknowledged. Never infer a
                    // session from the UI's active tab.
                    let event_session_id = params
                        .get("sessionId")
                        .and_then(|s| s.as_str())
                        .map(str::to_string)
                        .or_else(|| {
                            sessions
                                .lock()
                                .unwrap_or_else(|e| e.into_inner())
                                .get(&stream_id)
                                .cloned()
                        })
                        .unwrap_or_default();
                    match method.as_str() {
                        "chat/ttft" => emit(
                            &on_event,
                            ChatWireEvent::Ttft {
                                session_id: event_session_id.clone(),
                                latency_ms: params
                                    .get("latencyMs")
                                    .and_then(|v| v.as_u64())
                                    .unwrap_or(0),
                                stream_id,
                                metadata: event_metadata(&params),
                            },
                        ),
                        "chat/batch" => emit(
                            &on_event,
                            ChatWireEvent::Batch {
                                session_id: event_session_id.clone(),
                                text: params
                                    .get("text")
                                    .and_then(|t| t.as_str())
                                    .unwrap_or("")
                                    .to_string(),
                                token_count: params
                                    .get("tokenCount")
                                    .and_then(|t| t.as_u64())
                                    .unwrap_or(0),
                                stream_id,
                                metadata: event_metadata(&params),
                            },
                        ),
                        "chat/reasoning" => emit(
                            &on_event,
                            ChatWireEvent::Reasoning {
                                session_id: event_session_id.clone(),
                                text: params
                                    .get("text")
                                    .and_then(|t| t.as_str())
                                    .unwrap_or("")
                                    .to_string(),
                                stream_id,
                                metadata: event_metadata(&params),
                            },
                        ),
                        "chat/stage" => emit(
                            &on_event,
                            ChatWireEvent::Stage {
                                session_id: event_session_id.clone(),
                                stage: params
                                    .get("stage")
                                    .and_then(|s| s.as_str())
                                    .unwrap_or("")
                                    .to_string(),
                                stream_id,
                                metadata: event_metadata(&params),
                            },
                        ),
                        "chat/tool_call" => emit(
                            &on_event,
                            ChatWireEvent::ToolCall {
                                session_id: event_session_id.clone(),
                                tool_id: params
                                    .get("toolId")
                                    .and_then(|t| t.as_str())
                                    .unwrap_or("")
                                    .to_string(),
                                args: params.get("args").cloned(),
                                risk: params
                                    .get("risk")
                                    .and_then(|r| r.as_str())
                                    .map(str::to_string),
                                stream_id,
                                metadata: event_metadata(&params),
                            },
                        ),
                        // P11.5.11 — AG-UI live transport: forward the raw
                        // encoded envelope line to the UI (`agui-event` emit).
                        "agui/event" => {
                            if let Some(line) = params.get("line").and_then(|l| l.as_str()) {
                                agui.forward(line);
                            } else if let Some(raw) = params.get("envelope") {
                                agui.forward(&serde_json::to_string(raw).unwrap_or_default());
                            }
                        }
                        "chat/verification" => emit(
                            &on_event,
                            ChatWireEvent::Verification {
                                stream_id,
                                session_id: event_session_id.clone(),
                                task_id: params
                                    .get("taskId")
                                    .and_then(|t| t.as_str())
                                    .unwrap_or("")
                                    .to_string(),
                                checks: params
                                    .get("checks")
                                    .and_then(|c| c.as_array())
                                    .map(|arr| {
                                        arr.iter()
                                            .filter_map(|v| v.as_str().map(str::to_string))
                                            .collect()
                                    })
                                    .unwrap_or_default(),
                                report: params
                                    .get("report")
                                    .and_then(|r| r.as_str())
                                    .unwrap_or("")
                                    .to_string(),
                                passed: params.get("passed").and_then(|p| p.as_bool()),
                                metadata: event_metadata(&params),
                            },
                        ),
                        "chat/tool_result" => emit(
                            &on_event,
                            ChatWireEvent::ToolResult {
                                session_id: event_session_id.clone(),
                                tool_id: params
                                    .get("toolId")
                                    .and_then(|t| t.as_str())
                                    .unwrap_or("")
                                    .to_string(),
                                result: params.get("result").cloned(),
                                error: params
                                    .get("error")
                                    .and_then(|e| e.as_str())
                                    .map(str::to_string)
                                    .or_else(|| {
                                        params.get("result").and_then(|r| {
                                            r.get("error")
                                                .and_then(|e| e.as_str())
                                                .map(str::to_string)
                                        })
                                    }),
                                stream_id,
                                metadata: event_metadata(&params),
                            },
                        ),
                        "chat/done" => {
                            // Check the post-turn ledger before publishing a
                            // successful terminal event. Budget enforcement is
                            // terminal: the UI must never briefly mark a run
                            // completed and then replace it with a kill card.
                            let spent = if event_session_id.is_empty() {
                                0.0
                            } else {
                                vault
                                    .lock()
                                    .unwrap_or_else(|e| e.into_inner())
                                    .session_spend(&event_session_id)
                                    .unwrap_or(0.0)
                            };
                            if !event_session_id.is_empty() && spent >= DEFAULT_SESSION_BUDGET_USD {
                                emit(
                                    &on_event,
                                    ChatWireEvent::BudgetExceeded {
                                        stream_id: stream_id.clone(),
                                        session_id: event_session_id.clone(),
                                        limit: DEFAULT_SESSION_BUDGET_USD,
                                        spent,
                                        metadata: event_metadata(&params),
                                    },
                                );
                            } else {
                                emit(
                                    &on_event,
                                    ChatWireEvent::Done {
                                        session_id: event_session_id.clone(),
                                        turn_id: params
                                            .get("turnId")
                                            .and_then(|t| t.as_str())
                                            .unwrap_or("")
                                            .to_string(),
                                        full_text: params
                                            .get("fullText")
                                            .and_then(|t| t.as_str())
                                            .unwrap_or("")
                                            .to_string(),
                                        total_tokens: params
                                            .get("totalTokens")
                                            .and_then(|t| t.as_u64())
                                            .unwrap_or(0),
                                        stream_id: stream_id.clone(),
                                        metadata: event_metadata(&params),
                                    },
                                );
                            }
                        }
                        "chat/error" => emit(
                            &on_event,
                            ChatWireEvent::Error {
                                session_id: event_session_id.clone(),
                                code: params
                                    .get("code")
                                    .and_then(|c| c.as_str())
                                    .unwrap_or("engine")
                                    .to_string(),
                                message: params
                                    .get("message")
                                    .and_then(|m| m.as_str())
                                    .unwrap_or("")
                                    .to_string(),
                                tool_id: params
                                    .get("toolId")
                                    .and_then(|t| t.as_str())
                                    .map(str::to_string),
                                retryable: params.get("retryable").and_then(|r| r.as_bool()),
                                args: params.get("args").cloned(),
                                stream_id,
                                metadata: event_metadata(&params),
                            },
                        ),
                        "chat/cancelled" => emit(
                            &on_event,
                            ChatWireEvent::Cancelled {
                                stream_id,
                                session_id: event_session_id,
                                metadata: event_metadata(&params),
                            },
                        ),
                        // Stage-0 (P6.3): a plan executor circuit-break trip.
                        // The coordinator emits the full MCQ card payload;
                        // Rust relays it to the UI verbatim.
                        "chat/interrupt" => {
                            let plan_id = params
                                .get("planId")
                                .and_then(|s| s.as_str())
                                .unwrap_or("")
                                .to_string();
                            let break_id = params
                                .get("breakId")
                                .and_then(|s| s.as_str())
                                .unwrap_or("")
                                .to_string();
                            let title = params
                                .get("title")
                                .and_then(|s| s.as_str())
                                .unwrap_or("Agent needs a decision")
                                .to_string();
                            let description = params
                                .get("description")
                                .and_then(|s| s.as_str())
                                .unwrap_or("")
                                .to_string();
                            let options = params
                                .get("options")
                                .and_then(|v| v.as_array())
                                .map(|a| {
                                    a.iter()
                                        .filter_map(|o| o.as_str().map(str::to_string))
                                        .collect()
                                })
                                .unwrap_or_default();
                            emit(
                                &on_event,
                                ChatWireEvent::Interrupt {
                                    stream_id: stream_id.clone(),
                                    session_id: event_session_id.clone(),
                                    plan_id,
                                    break_id,
                                    title,
                                    description,
                                    options,
                                    metadata: event_metadata(&params),
                                },
                            );
                        }
                        "chat/plan_done" => {
                            emit(
                                &on_event,
                                ChatWireEvent::PlanDone {
                                    session_id: event_session_id.clone(),
                                    plan_id: params
                                        .get("planId")
                                        .and_then(|s| s.as_str())
                                        .unwrap_or("")
                                        .to_string(),
                                    tasks_done: params
                                        .get("tasksDone")
                                        .and_then(|v| v.as_u64())
                                        .unwrap_or(0)
                                        as u32,
                                    error: params
                                        .get("error")
                                        .and_then(|s| s.as_str())
                                        .map(str::to_string),
                                    stream_id,
                                    metadata: event_metadata(&params),
                                },
                            );
                        }
                        "chat/plan_start" => emit(
                            &on_event,
                            ChatWireEvent::PlanStart {
                                session_id: event_session_id.clone(),
                                plan_id: params
                                    .get("planId")
                                    .and_then(|s| s.as_str())
                                    .unwrap_or("")
                                    .to_string(),
                                tasks: params.get("tasks").and_then(|v| v.as_u64()).unwrap_or(0)
                                    as u32,
                                stream_id,
                                metadata: event_metadata(&params),
                            },
                        ),
                        "chat/plan_step" => emit(
                            &on_event,
                            ChatWireEvent::PlanStep {
                                session_id: event_session_id.clone(),
                                plan_id: params
                                    .get("planId")
                                    .and_then(|s| s.as_str())
                                    .unwrap_or("")
                                    .to_string(),
                                task_id: params
                                    .get("taskId")
                                    .and_then(|s| s.as_str())
                                    .unwrap_or("")
                                    .to_string(),
                                status: params
                                    .get("status")
                                    .and_then(|s| s.as_str())
                                    .unwrap_or("")
                                    .to_string(),
                                stream_id,
                                metadata: event_metadata(&params),
                            },
                        ),
                        "chat/memory_extracted" => emit(
                            &on_event,
                            ChatWireEvent::MemoryExtracted {
                                session_id: event_session_id.clone(),
                                facts: params
                                    .get("facts")
                                    .and_then(|v| v.as_array())
                                    .map(|a| {
                                        a.iter()
                                            .filter_map(|v| v.as_str().map(str::to_string))
                                            .collect()
                                    })
                                    .unwrap_or_default(),
                                stream_id,
                                metadata: event_metadata(&params),
                            },
                        ),
                        "chat/citations" => emit(
                            &on_event,
                            ChatWireEvent::Citations {
                                session_id: event_session_id.clone(),
                                citations: params
                                    .get("citations")
                                    .and_then(|c| c.as_array())
                                    .cloned()
                                    .unwrap_or_default(),
                                stream_id,
                                metadata: event_metadata(&params),
                            },
                        ),
                        "chat/walkthrough" => emit(
                            &on_event,
                            ChatWireEvent::Walkthrough {
                                session_id: event_session_id.clone(),
                                stops: params
                                    .get("stops")
                                    .and_then(|c| c.as_array())
                                    .cloned()
                                    .unwrap_or_default(),
                                stream_id,
                                metadata: event_metadata(&params),
                            },
                        ),
                        "chat/monitor" => emit(
                            &on_event,
                            ChatWireEvent::Monitor {
                                session_id: event_session_id.clone(),
                                job_id: params
                                    .get("jobId")
                                    .and_then(|s| s.as_str())
                                    .unwrap_or("")
                                    .to_string(),
                                changed: params
                                    .get("changed")
                                    .and_then(|v| v.as_bool())
                                    .unwrap_or(false),
                                notified: params
                                    .get("notified")
                                    .and_then(|v| v.as_bool())
                                    .unwrap_or(false),
                                stopped: params
                                    .get("stopped")
                                    .and_then(|v| v.as_bool())
                                    .unwrap_or(false),
                                current: params
                                    .get("current")
                                    .and_then(|s| s.as_str())
                                    .unwrap_or("")
                                    .to_string(),
                                notifications: params
                                    .get("notifications")
                                    .and_then(|v| v.as_u64())
                                    .unwrap_or(0)
                                    as u32,
                                stream_id,
                                metadata: event_metadata(&params),
                            },
                        ),
                        _ => {}
                    }
                }
            }
        });
    }

    /// Start one chat turn: J11 budget pre-flight, then dispatch `chat/stream`
    /// to the coordinator (which runs the ConversationEngine). Returns once the
    /// sidecar acknowledges; the stream itself arrives via `on_event`.
    pub fn start_stream(&self, params: ChatStreamParams) -> Result<(), ChatRelayError> {
        // J11 pre-flight: refuse before ANY dispatch when the session is at or
        // over its hard $ budget (the ledger is the durable spend record).
        // Do this before registering the stream so a refused request cannot
        // leave a stale stream→session entry behind.
        let spent = self
            .vault
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .session_spend(&params.session_id)?;
        if spent >= DEFAULT_SESSION_BUDGET_USD {
            return Err(ChatRelayError::BudgetExceeded {
                session: params.session_id.clone(),
                limit: DEFAULT_SESSION_BUDGET_USD,
                spent,
            });
        }

        // Register immediately before dispatch. The sidecar may acknowledge
        // and emit the first notification in the same frame burst, so this
        // must happen before `request()`.
        self.sessions
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .insert(params.stream_id.clone(), params.session_id.clone());

        let ack = self.link.request(
            "chat/stream",
            serde_json::json!({
                "sessionId": params.session_id,
                "workId": params.work_id.unwrap_or_else(|| params.session_id.clone()),
                "streamId": params.stream_id,
                "text": params.text,
                "surface": params.surface,
                "agentId": params.agent_id,
                "provider": params.provider,
                "model": params.model,
                "personaId": params.persona_id,
                "soulMd": params.soul_md,
                "userDocuments": params.user_documents,
                "projectId": params.project_id,
                "primaryChief": params.primary_chief,
                "credentialedProviders": params.credentialed_providers,
            }),
        );
        let ack = match ack {
            Ok(value) => value,
            Err(error) => {
                self.sessions
                    .lock()
                    .unwrap_or_else(|e| e.into_inner())
                    .remove(&params.stream_id);
                return Err(error.into());
            }
        };
        if !ack
            .get("accepted")
            .and_then(|a| a.as_bool())
            .unwrap_or(false)
        {
            self.sessions
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .remove(&params.stream_id);
            return Err(ChatRelayError::SidecarRejected(ack.to_string()));
        }

        Ok(())
    }

    /// S0.5: re-run a failed tool through the same guarded exec→commit path.
    ///
    /// P49: `work_id` is the real Work the retry belongs to. The coordinator
    /// registers stream identity from `workId` (`registerStreamIdentity`), so
    /// passing the session id here would file the retry under a fabricated
    /// Work. Falls back to `session_id` only when the caller has no Work —
    /// the same convention as `chat/stream` (see `params.work_id
    /// .unwrap_or_else(|| params.session_id.clone())`).
    pub fn retry_tool(
        &self,
        session_id: &str,
        stream_id: &str,
        tool_id: &str,
        args: serde_json::Value,
        agent_id: Option<&str>,
        work_id: Option<&str>,
    ) -> Result<(), ChatRelayError> {
        let mut body = serde_json::json!({
            "sessionId": session_id,
            "streamId": stream_id,
            "toolId": tool_id,
            "args": args,
            "workId": work_id.unwrap_or(session_id),
        });
        if let Some(a) = agent_id {
            body["agentId"] = serde_json::Value::String(a.to_string());
        }
        let ack = self.link.request("chat/tool_retry", body)?;
        if !ack
            .get("accepted")
            .and_then(|a| a.as_bool())
            .unwrap_or(false)
        {
            return Err(ChatRelayError::SidecarRejected(ack.to_string()));
        }
        Ok(())
    }

    /// Cancel a running stream (abort UI → Rust → sidecar → provider).
    pub fn cancel(&self, stream_id: &str) -> Result<(), ChatRelayError> {
        self.link
            .writer()
            .notify("chat/cancel", serde_json::json!({ "streamId": stream_id }))?;
        Ok(())
    }

    /// Cancel every in-flight stream bound to `session_id` (unix `agent/stop`).
    pub fn cancel_session(&self, session_id: &str) -> Result<Vec<String>, ChatRelayError> {
        let ids: Vec<String> = self
            .sessions
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .iter()
            .filter(|(_, s)| s.as_str() == session_id)
            .map(|(id, _)| id.clone())
            .collect();
        for id in &ids {
            self.cancel(id)?;
        }
        Ok(ids)
    }

    /// Stage-0 (P6.3): dispatch a blueprint plan to the coordinator's plan
    /// executor. The coordinator begins the plan breaker via `plan/begin`,
    /// steps it per LLM turn/tool call, and emits `chat/interrupt` on a trip
    /// and `chat/plan_done` at the end. Returns once the coordinator acks.
    /// `work_id` is the canonical Work this plan belongs to. The coordinator
    /// registers plan stream identity from `workId` (its `PlanExecutionParams`
    /// has carried the field since P49), so omitting it here would file the
    /// plan's lifecycle events under a fabricated Work. Falls back to
    /// `session_id` — the same convention as `chat/stream`.
    // Eight parameters is the honest shape of this directive (identity, plan
    // identity, stream identity, the task tree, optional provider/model, and
    // the Work it belongs to); bundling them into a struct would only move the
    // arity, not remove it.
    #[allow(clippy::too_many_arguments)]
    pub fn start_plan(
        &self,
        session_id: &str,
        plan_id: &str,
        stream_id: &str,
        tasks: serde_json::Value,
        provider: Option<&str>,
        model: Option<&str>,
        work_id: Option<&str>,
    ) -> Result<(), ChatRelayError> {
        let mut body = serde_json::json!({
            "sessionId": session_id,
            "planId": plan_id,
            "streamId": stream_id,
            "tasks": tasks,
            "workId": work_id.unwrap_or(session_id),
        });
        if let Some(p) = provider {
            body["provider"] = serde_json::Value::String(p.to_string());
        }
        if let Some(m) = model {
            body["model"] = serde_json::Value::String(m.to_string());
        }
        let ack = self.link.request("plan/execute", body)?;
        if !ack
            .get("accepted")
            .and_then(|a| a.as_bool())
            .unwrap_or(false)
        {
            return Err(ChatRelayError::SidecarRejected(ack.to_string()));
        }
        Ok(())
    }

    /// P6.4 (B7): trigger one due-check + execution pass in the coordinator's
    /// scheduler executor (the tray's "Run automations now" + the UI's
    /// Run-now path). Returns the executed job ids.
    pub fn tick_scheduler(&self) -> Result<Vec<String>, ChatRelayError> {
        let ack = self
            .link
            .request("scheduler/execute", serde_json::json!({}))?;
        Ok(ack
            .get("executed")
            .and_then(|a| a.as_array())
            .map(|a| {
                a.iter()
                    .filter_map(|v| v.as_str().map(str::to_string))
                    .collect()
            })
            .unwrap_or_default())
    }

    /// Stage-0 (P6.3): forward the user's MCQ card choice back to the
    /// coordinator's plan executor (which is waiting on that interrupt).
    pub fn respond_plan(&self, break_id: &str, choice: &str) -> Result<(), ChatRelayError> {
        let ack = self.link.request(
            "plan/respond",
            serde_json::json!({ "breakId": break_id, "choice": choice }),
        )?;
        if !ack
            .get("resolved")
            .and_then(|a| a.as_bool())
            .unwrap_or(false)
        {
            return Err(ChatRelayError::SidecarRejected(ack.to_string()));
        }
        Ok(())
    }
}

fn handle_work_gateway(
    gateway: &mut crate::work_gateway::WorkGateway,
    method: &str,
    params: &serde_json::Value,
) -> Result<serde_json::Value, String> {
    use crate::work_gateway::{ClientSession, ExecutionNode, ReviewItem, SteeringInstruction};
    match method {
        "work/create" => {
            let id = params
                .get("workId")
                .and_then(|v| v.as_str())
                .ok_or("work/create requires workId")?;
            let address = gateway.create_work(
                id,
                params
                    .get("projectId")
                    .and_then(|v| v.as_str())
                    .map(str::to_owned),
                params
                    .get("sessionId")
                    .and_then(|v| v.as_str())
                    .map(str::to_owned),
                params
                    .get("objective")
                    .and_then(|v| v.as_str())
                    .unwrap_or(""),
            );
            serde_json::to_value(address).map_err(|e| e.to_string())
        }
        "work/get" => {
            let id = params
                .get("workId")
                .and_then(|v| v.as_str())
                .ok_or("work/get requires workId")?;
            serde_json::to_value(gateway.get_work(id)).map_err(|e| e.to_string())
        }
        "work/list" => serde_json::to_value(gateway.list_work()).map_err(|e| e.to_string()),
        "work/snapshot" => {
            let id = params
                .get("workId")
                .and_then(|v| v.as_str())
                .ok_or("work/snapshot requires workId")?;
            serde_json::to_value(gateway.snapshot(id)).map_err(|e| e.to_string())
        }
        "work/events" => {
            let id = params
                .get("workId")
                .and_then(|v| v.as_str())
                .ok_or("work/events requires workId")?;
            let from = params
                .get("fromSequence")
                .and_then(|v| v.as_u64())
                .unwrap_or(0);
            serde_json::to_value(gateway.replay_from(id, from)).map_err(|e| e.to_string())
        }
        "work/client_attach" => {
            let client: ClientSession = serde_json::from_value(
                params
                    .get("client")
                    .cloned()
                    .ok_or("work/client_attach requires client")?,
            )
            .map_err(|e| e.to_string())?;
            gateway.attach_client(client)?;
            Ok(serde_json::json!({"attached":true}))
        }
        "work/client_detach" => {
            let id = params
                .get("clientId")
                .and_then(|v| v.as_str())
                .ok_or("work/client_detach requires clientId")?;
            Ok(serde_json::json!({"detached":gateway.detach_client(id)}))
        }
        "work/node_register" => {
            let node: ExecutionNode = serde_json::from_value(
                params
                    .get("node")
                    .cloned()
                    .ok_or("work/node_register requires node")?,
            )
            .map_err(|e| e.to_string())?;
            gateway.register_node(node)?;
            Ok(serde_json::json!({"registered":true}))
        }
        "work/node_heartbeat" => {
            let id = params
                .get("nodeId")
                .and_then(|v| v.as_str())
                .ok_or("work/node_heartbeat requires nodeId")?;
            let at = params
                .get("atMs")
                .and_then(|v| v.as_u64())
                .unwrap_or_else(now_ms);
            Ok(serde_json::json!({"healthy":gateway.heartbeat_node(id,at)}))
        }
        "work/lease_acquire" => {
            let run = params
                .get("runId")
                .and_then(|v| v.as_str())
                .ok_or("work/lease_acquire requires runId")?;
            let node = params
                .get("nodeId")
                .and_then(|v| v.as_str())
                .ok_or("work/lease_acquire requires nodeId")?;
            let ttl = params
                .get("ttlMs")
                .and_then(|v| v.as_u64())
                .unwrap_or(30_000);
            serde_json::to_value(gateway.acquire_run_authority(run, node, ttl)?)
                .map_err(|e| e.to_string())
        }
        "work/lease_validate" => {
            let run = params
                .get("runId")
                .and_then(|v| v.as_str())
                .ok_or("work/lease_validate requires runId")?;
            let node = params
                .get("nodeId")
                .and_then(|v| v.as_str())
                .ok_or("work/lease_validate requires nodeId")?;
            let token = params
                .get("fencingToken")
                .and_then(|v| v.as_u64())
                .ok_or("work/lease_validate requires fencingToken")?;
            Ok(serde_json::json!({"valid":gateway.validate_fencing_token(run,node,token)}))
        }
        "work/lease_release" => {
            let run = params
                .get("runId")
                .and_then(|v| v.as_str())
                .ok_or("work/lease_release requires runId")?;
            let node = params
                .get("nodeId")
                .and_then(|v| v.as_str())
                .ok_or("work/lease_release requires nodeId")?;
            let token = params
                .get("fencingToken")
                .and_then(|v| v.as_u64())
                .ok_or("work/lease_release requires fencingToken")?;
            Ok(serde_json::json!({"released":gateway.release_authority(run,node,token)}))
        }
        "work/review_add" => {
            let item: ReviewItem = serde_json::from_value(
                params
                    .get("review")
                    .cloned()
                    .ok_or("work/review_add requires review")?,
            )
            .map_err(|e| e.to_string())?;
            gateway.request_review(item)?;
            Ok(serde_json::json!({"queued":true}))
        }
        "work/review_resolve" => {
            let id = params
                .get("reviewId")
                .and_then(|v| v.as_str())
                .ok_or("work/review_resolve requires reviewId")?;
            Ok(serde_json::json!({"resolved":gateway.resolve_review(id)}))
        }
        "work/steer" => {
            let instruction: SteeringInstruction = serde_json::from_value(
                params
                    .get("instruction")
                    .cloned()
                    .ok_or("work/steer requires instruction")?,
            )
            .map_err(|e| e.to_string())?;
            gateway.steer(instruction)?;
            Ok(serde_json::json!({"queued":true}))
        }
        "work/presence" => {
            let id = params
                .get("workId")
                .and_then(|v| v.as_str())
                .ok_or("work/presence requires workId")?;
            serde_json::to_value(gateway.presence(id)).map_err(|e| e.to_string())
        }
        // P51.14 — live agent-thought summary from the coordinator's engine
        // loop (the headline shown on the agent card while a run is in
        // flight). Best-effort surface: an unknown work id is a hard error so
        // callers notice, but the coordinator never blocks the stream on it.
        "work/thought" => {
            let id = params
                .get("workId")
                .and_then(|v| v.as_str())
                .ok_or("work/thought requires workId")?;
            let text = params
                .get("text")
                .and_then(|v| v.as_str())
                .ok_or("work/thought requires text")?;
            gateway.record_thought(id, text)?;
            Ok(serde_json::json!({"recorded": true}))
        }
        _ => Err(format!("method not found: {method}")),
    }
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn emit(on_event: &Arc<Mutex<EventSink>>, ev: ChatWireEvent) {
    on_event.lock().unwrap_or_else(|e| e.into_inner())(ev);
}

/// Run the broker for a coordinator `provider/stream` request and push the
/// deltas back as `chat/provider_chunk` notifications. Runs on its own thread;
/// keys never leave this process (the sidecar only sees chunk deltas).
fn stream_provider(
    vault: Arc<Mutex<Vault>>,
    base_urls: Arc<Mutex<HashMap<String, String>>>,
    endpoints: Arc<Mutex<HashMap<String, everyaios_vault::ProviderEndpoint>>>,
    local_endpoints: Arc<Mutex<LocalEndpointMap>>,
    capabilities: Arc<Mutex<everyaios_guard::LocalCapabilityBroker>>,
    params: serde_json::Value,
    writer: WriterHandle<impl Write>,
) -> Result<(), crate::sidecar_link::LinkError> {
    let provider = params
        .get("provider")
        .and_then(|p| p.as_str())
        .unwrap_or("")
        .to_string();
    let model = params
        .get("model")
        .and_then(|m| m.as_str())
        .unwrap_or("")
        .to_string();
    let session_id = params
        .get("sessionId")
        .and_then(|s| s.as_str())
        .unwrap_or("")
        .to_string();
    let stream_id = params
        .get("streamId")
        .and_then(|s| s.as_str())
        .unwrap_or("")
        .to_string();
    let messages = params
        .get("messages")
        .cloned()
        .unwrap_or(serde_json::Value::Null);
    let tools = params.get("tools").cloned();
    let tool_choice = params
        .get("tool_choice")
        .cloned()
        .or_else(|| params.get("toolChoice").cloned());

    // Optional P49 capability metadata is validated before the vault broker is
    // constructed. It contains only an opaque grant reference; secret values
    // remain exclusively inside everyaios-vault.
    if let Some(raw) = params.get("capabilityInvocation") {
        let invocation: everyaios_guard::CapabilityInvocation = serde_json::from_value(raw.clone())
            .map_err(|e| {
                crate::sidecar_link::LinkError::Remote(format!(
                    "invalid capability invocation: {e}"
                ))
            })?;
        invocation.validate().map_err(|e| {
            crate::sidecar_link::LinkError::Remote(format!("invalid capability invocation: {e}"))
        })?;
        if invocation.run_id != session_id {
            return Err(crate::sidecar_link::LinkError::Remote(
                "capability invocation run/session mismatch".into(),
            ));
        }
        let request = everyaios_guard::CapabilityRequest {
            run_id: invocation.run_id.clone(),
            capability: invocation.capability.clone(),
            operation: invocation.operation.clone(),
        };
        capabilities
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .invoke(&invocation.grant_id, &request)
            .map_err(|e| {
                crate::sidecar_link::LinkError::Remote(format!("capability denied: {e}"))
            })?;
    }

    // The vault guard must outlive the broker (Broker<'a> borrows the vault).
    let v = vault.lock().unwrap_or_else(|e| e.into_inner());
    let mut broker = Broker::new(&v);
    for (p, url) in base_urls.lock().unwrap_or_else(|e| e.into_inner()).iter() {
        broker = broker.with_base_url(p, url.clone());
    }
    // P55.5: resolved endpoints win over the plain base-url map — they carry
    // the wire dialect (Anthropic `/messages`) and per-provider headers.
    for (p, ep) in endpoints.lock().unwrap_or_else(|e| e.into_inner()).iter() {
        broker = broker.with_endpoint(p, ep.clone());
    }
    // P1.8 (A5): keyless local endpoints route inside the broker.
    for (p, ep) in local_endpoints
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .iter()
    {
        broker = broker.with_local(p, ep.clone());
    }

    // P3.3 (J14): propagate distributed trace context across the broker
    // boundary so provider HTTP requests carry the traceparent header.
    let trace_ctx = crate::tracing::TraceContext::new_root(true);
    let mut trace_headers = std::collections::HashMap::new();
    trace_ctx.inject_headers(&mut trace_headers);
    broker = broker.with_extra_headers(trace_headers);

    // S0.3: forward tools + tool_choice so hosted providers get native
    // function defs and local ollama/llamafile derive JSON-mode grammar
    // (grammar_from_body) from the same body.
    let mut body = serde_json::json!({ "model": model, "messages": messages });
    let has_tools = tools
        .as_ref()
        .and_then(|t| t.as_array())
        .is_some_and(|a| !a.is_empty());
    if let Some(t) = tools {
        body["tools"] = t;
    }
    if let Some(tc) = tool_choice {
        body["tool_choice"] = tc;
    }
    match broker.chat_completion_stream(&provider, &model, &session_id, body) {
        Ok(events) => {
            let finished_by_length = events.iter().any(|e| e.finish.as_deref() == Some("length"));
            let native_calls = assemble_tool_calls(&events, finished_by_length);
            let text: String = events.iter().filter_map(|e| e.delta.clone()).collect();
            let json_calls = if native_calls.is_empty() && has_tools {
                let mut calls = extract_json_tool_calls(&text);
                if calls.is_empty() {
                    let fixed = everyaios_memory::repair_tool_json(&text);
                    if fixed.repaired {
                        calls = extract_json_tool_calls(&fixed.json);
                    }
                }
                calls
            } else {
                Vec::new()
            };
            let hide_json_text = !json_calls.is_empty();
            for ev in &events {
                if !hide_json_text {
                    if let Some(delta) = &ev.delta {
                        writer.notify(
                            "chat/provider_chunk",
                            serde_json::json!({ "streamId": stream_id, "delta": delta }),
                        )?;
                    }
                }
                if let Some(finish) = &ev.finish {
                    writer.notify(
                        "chat/provider_chunk",
                        serde_json::json!({ "streamId": stream_id, "finish": finish }),
                    )?;
                }
                if let Some(u) = ev.usage {
                    writer.notify(
                        "chat/provider_chunk",
                        serde_json::json!({
                            "streamId": stream_id,
                            "usage": {
                                "promptTokens": u.prompt,
                                "completionTokens": u.output,
                            },
                        }),
                    )?;
                }
            }
            for (name, args) in native_calls.into_iter().chain(json_calls) {
                writer.notify(
                    "chat/provider_chunk",
                    serde_json::json!({
                        "streamId": stream_id,
                        "toolCall": { "id": name, "args": args },
                    }),
                )?;
            }
        }
        Err(e) => {
            // Surface the failure to the sidecar so the engine ends cleanly.
            // (Full broker-error surfacing to the UI is a later pass — the
            // pre-flight + ledger checks already fail closed on budget/keys.)
            writer.notify(
                "chat/provider_chunk",
                serde_json::json!({ "streamId": stream_id, "error": e.to_string() }),
            )?;
        }
    }
    // Stream end marker — the engine's provider generator closes.
    writer.notify(
        "chat/provider_chunk",
        serde_json::json!({ "streamId": stream_id, "ended": true }),
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    /// P64.6 — a preflight `root` that the coordinator left at `.` (it has no
    /// workspace) must resolve to the floored workspace, while an absolute root
    /// is honoured so a caller can still point the check at a package.
    #[test]
    fn preflight_root_resolves_against_the_workspace_floor() {
        let ws = std::path::Path::new("/srv/ws");
        let resolve = |params: serde_json::Value| {
            super::with_preflight_root(&params, ws)
                .get("root")
                .and_then(|v| v.as_str())
                .unwrap_or("<missing>")
                .to_string()
        };
        // The coordinator's default — and the case that staged the wrong tree.
        assert_eq!(resolve(serde_json::json!({ "root": "." })), "/srv/ws");
        // An omitted root is the same statement as `.`.
        assert_eq!(resolve(serde_json::json!({})), "/srv/ws");
        assert_eq!(resolve(serde_json::json!({ "root": "" })), "/srv/ws");
        // A relative sub-path floors under the workspace, like every file path.
        assert_eq!(
            resolve(serde_json::json!({ "root": "packages/coordinator" })),
            "/srv/ws/packages/coordinator"
        );
        // An absolute root is the caller's business, not ours.
        assert_eq!(
            resolve(serde_json::json!({ "root": "/other/repo" })),
            "/other/repo"
        );
        // Every other field survives the rewrite.
        let out = super::with_preflight_root(
            &serde_json::json!({ "id": "ex:1", "root": ".", "filesChanged": 2 }),
            ws,
        );
        assert_eq!(out.get("id").and_then(|v| v.as_str()), Some("ex:1"));
        assert_eq!(out.get("filesChanged").and_then(|v| v.as_u64()), Some(2));
    }

    /// P64.3 — the coordinator reads `symbol/kind/file/line/rank` out of
    /// `tags`; this pins that wire shape and the refusal of unknown methods.
    /// Fully qualified because the `use super::*` glob below is unix-gated.
    #[test]
    fn codeintel_rpc_serves_ranked_repo_map_tags() {
        let dir = std::env::temp_dir().join(format!("eaios-codeintel-rpc-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("m.rs"), "fn alpha() {}\n").unwrap();

        let out = super::codeintel_rpc("codeintel/repomap", &serde_json::json!({}), &dir)
            .expect("codeintel/repomap is served");
        let tags = out
            .get("tags")
            .and_then(|t| t.as_array())
            .expect("tags array");
        let first = tags.first().expect("at least one tag");
        for key in ["symbol", "kind", "file", "line", "rank"] {
            assert!(first.get(key).is_some(), "missing {key} in the wire row");
        }
        assert!(tags
            .iter()
            .any(|t| t.get("symbol").and_then(|s| s.as_str()) == Some("alpha")));

        // The old failure mode was a silent `method not found`; an unknown
        // method must still be an error rather than an empty tag list.
        assert!(super::codeintel_rpc("codeintel/nope", &serde_json::json!({}), &dir).is_err());

        let _ = std::fs::remove_dir_all(&dir);
    }

    /// The previous failure mode was a silent `method not found`; an empty or
    /// unknown request must be a refusal, never a no-op that reads as success.
    #[test]
    fn skill_rpc_refuses_a_grow_without_a_task_name() {
        let (dir, _vault) = temp_vault("skill-rpc");
        let store = everyaios_blueprint::SkillStore::new(dir.join("skills"));
        assert!(super::skill_rpc("skill/grow", &serde_json::json!({}), &store).is_err());
        assert!(super::skill_rpc(
            "skill/grow",
            &serde_json::json!({ "taskName": "   " }),
            &store
        )
        .is_err());
        assert!(super::skill_rpc("skill/nope", &serde_json::json!({}), &store).is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// P51.28 — skill/warm_set hides disable-model-invocation from the model
    /// catalog and keeps it on the user slash list (Zed/Crush).
    #[test]
    fn skill_rpc_warm_set_omits_disabled_model_invocation() {
        let (dir, _vault) = temp_vault("skill-warm");
        let store = everyaios_blueprint::SkillStore::new(dir.join("skills"));
        let notes = everyaios_blueprint::Skill {
            manifest: everyaios_blueprint::SkillManifest {
                name: "notes".into(),
                description: "Take notes".into(),
                author: "t".into(),
                created: "2026-09-18".into(),
                version: "1".into(),
                ..Default::default()
            },
            body: "Take notes.".into(),
        };
        let deploy = everyaios_blueprint::Skill {
            manifest: everyaios_blueprint::SkillManifest {
                name: "deploy".into(),
                description: "Deploy the branch".into(),
                author: "t".into(),
                created: "2026-09-18".into(),
                version: "1".into(),
                user_invocable: true,
                disable_model_invocation: true,
                ..Default::default()
            },
            body: "Deploy.".into(),
        };
        store.save(&notes, true).expect("save notes");
        store.save(&deploy, true).expect("save deploy");
        let warm = super::skill_rpc("skill/warm_set", &serde_json::json!({}), &store).unwrap();
        let skills = warm["skills"].as_array().expect("skills");
        let joined: Vec<&str> = skills.iter().filter_map(|v| v.as_str()).collect();
        assert!(joined.iter().any(|s| s.starts_with("notes:")));
        assert!(!joined.iter().any(|s| s.starts_with("deploy:")));
        let slash = warm["slash"].as_array().expect("slash");
        assert!(slash.iter().any(|v| v.as_str() == Some("deploy")));
        let auto = super::skill_rpc(
            "skill/compose",
            &serde_json::json!({ "stack": ["deploy"], "query": "deploy" }),
            &store,
        )
        .unwrap();
        assert!(!auto["rejected"].as_array().unwrap().is_empty());
        let user = super::skill_rpc(
            "skill/compose",
            &serde_json::json!({
                "stack": ["deploy"],
                "query": "deploy",
                "userExplicit": true
            }),
            &store,
        )
        .unwrap();
        assert!(user["rejected"].as_array().unwrap().is_empty());
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// P64.4/P71.3a — the spawn seam must enforce the shared limits against the
    /// Work graph, and must report an admission rather than a fabricated
    /// completion. There is no runtime left to hold the counts: the child Work
    /// *is* the record.
    #[test]
    fn subagent_rpc_admits_a_spawn_and_enforces_the_limits() {
        let policy = everyaios_blueprint::DelegationPolicy::new(
            everyaios_blueprint::SubAgentLimits::default(),
        );
        let gw = Arc::new(Mutex::new(crate::work_gateway::WorkGateway::new()));
        gw.lock()
            .unwrap()
            .create_work("w-parent", None, Some("s-1".into()), "parent objective");
        let out = super::subagent_rpc(
            "subagent/spawn",
            &serde_json::json!({
                "spec": { "id": "t1", "goal": "do the thing", "context": [], "acceptance": [] },
                "model": "m",
                "workspace": ".everyaios/worktrees/task-t1",
                "parentId": null,
                "tools": ["todo"],
                "blockedTools": [],
                "workId": "w-parent",
            }),
            &policy,
            &gw,
        )
        .expect("an in-limits spawn is admitted");
        assert_eq!(out["task_id"], "t1");
        // The LLM execution is coordinator-side, so this is an admission.
        assert_eq!(out["status"], "running");
        assert_eq!(out["accountedFrom"], "work_graph");
        // P64.4 — the derived grant set is reported, not just stored.
        assert_eq!(out["tools"][0], "todo");
        assert_eq!(out["depth"], 1);
        // The accounting is the graph, not a counter: one delegated child.
        assert_eq!(
            gw.lock().unwrap().delegation_gauge("w-parent").unwrap().total,
            1
        );
        // P69.D14 — the spawn is a child Work with a parent link (plus its own
        // Run and ephemeral session), not a parallel runtime.
        let child = out["workId"].as_str().unwrap().to_string();
        assert_eq!(child, "w-parent/subagent/t1");
        {
            let gw = gw.lock().unwrap();
            let kids = gw.children_of("w-parent");
            assert_eq!(kids.len(), 1);
            assert_eq!(kids[0].parent_work_id.as_deref(), Some("w-parent"));
            assert_eq!(gw.agent_sessions_for(&child).len(), 1);
            // The child is running, so it is an active delegation.
            let gauge = gw.delegation_gauge("w-parent").unwrap();
            assert_eq!((gauge.active, gauge.total, gauge.child_depth), (1, 1, 1));
        }

        // A duplicate task id is refused from the graph (deterministic child
        // Work id), not silently accepted.
        assert!(super::subagent_rpc(
            "subagent/spawn",
            &serde_json::json!({
                "spec": { "id": "t1", "goal": "again", "context": [], "acceptance": [] },
                "workId": "w-parent",
            }),
            &policy,
            &gw,
        )
        .is_err());
        // Completion closes the child's own timeline (terminal Run event +
        // ephemeral session termination) and reports a summary-only result.
        let done = super::subagent_rpc(
            "subagent/complete",
            &serde_json::json!({
                "taskId": "t1",
                "summary": "did the thing",
                "artifacts": ["src/a.rs"],
                "workId": "w-parent",
            }),
            &policy,
            &gw,
        )
        .expect("completion of a delegated task is accepted");
        assert_eq!(done["summary"], "did the thing");
        assert_eq!(done["artifacts"][0], "src/a.rs");
        assert_eq!(done["workId"], "w-parent/subagent/t1");
        {
            let gw = gw.lock().unwrap();
            let sessions = gw.agent_sessions_for(&child);
            assert_eq!(sessions[0].runtime_state, "terminated");
            // Terminal children free concurrency but stay counted in total.
            let gauge = gw.delegation_gauge("w-parent").unwrap();
            assert_eq!((gauge.active, gauge.total), (0, 1));
        }
        // Closing a task the graph never saw is an error, not a summary.
        assert!(super::subagent_rpc(
            "subagent/complete",
            &serde_json::json!({ "taskId": "ghost", "workId": "w-parent" }),
            &policy,
            &gw,
        )
        .is_err());
        // A spawn that names no parent Work is admitted policy-only, and says so.
        let loose = super::subagent_rpc(
            "subagent/spawn",
            &serde_json::json!({
                "spec": { "id": "t2", "goal": "loose", "context": [], "acceptance": [] },
                "depth": 1,
            }),
            &policy,
            &gw,
        )
        .expect("a parentless spawn is admitted policy-only");
        assert_eq!(loose["accountedFrom"], "policy_only");
        assert!(loose["workId"].is_null());
        // A spec-less call is a refusal, and unknown methods stay errors.
        assert!(super::subagent_rpc("subagent/spawn", &serde_json::json!({}), &policy, &gw).is_err());
        assert!(super::subagent_rpc("subagent/nope", &serde_json::json!({}), &policy, &gw).is_err());
    }

    #[test]
    fn subagent_rpc_scout_strips_writes() {
        let policy = everyaios_blueprint::DelegationPolicy::new(
            everyaios_blueprint::SubAgentLimits::default(),
        );
        let gw = Arc::new(Mutex::new(crate::work_gateway::WorkGateway::new()));
        let out = super::subagent_rpc(
            "subagent/spawn",
            &serde_json::json!({
                "spec": { "id": "scout-1", "goal": "map", "context": [], "acceptance": [] },
                "model": "m",
                "workspace": ".everyaios/worktrees/task-scout-1",
                "parentId": "root",
                "tools": ["file_ops.read", "file_ops.write", "search.query", "desktop.act"],
                "blockedTools": [],
                "role": "scout",
            }),
            &policy,
            &gw,
        )
        .expect("scout spawn is admitted");
        assert_eq!(out["role"], "scout");
        let granted: Vec<&str> = out["tools"]
            .as_array()
            .unwrap()
            .iter()
            .filter_map(|v| v.as_str())
            .collect();
        assert!(granted.contains(&"file_ops.read"));
        assert!(granted.contains(&"search.query"));
        assert!(!granted.iter().any(|t| *t == "file_ops.write" || *t == "desktop.act"));
        assert_eq!(out["planes"], 5);
        assert_eq!(out["harness"], "inbuilt");
        assert_eq!(out["binding"]["model"], "m");
    }

    #[test]
    fn subagent_rpc_refuses_cli_named_subagent_harness() {
        let policy = everyaios_blueprint::DelegationPolicy::new(
            everyaios_blueprint::SubAgentLimits::default(),
        );
        let gw = Arc::new(Mutex::new(crate::work_gateway::WorkGateway::new()));
        let err = super::subagent_rpc(
            "subagent/spawn",
            &serde_json::json!({
                "spec": { "id": "x", "goal": "g", "context": [], "acceptance": [] },
                "model": "opus",
                "workspace": ".",
                "parentId": "root",
                "harness": "claude-subagent",
                "tools": [],
                "blockedTools": [],
            }),
            &policy,
            &gw,
        );
        assert!(err.is_err());
        assert!(err.unwrap_err().contains("CLI-named"));
    }

    #[cfg(unix)]
    use super::*;
    #[cfg(unix)]
    use std::io::{Read, Write};
    #[cfg(unix)]
    use std::net::TcpListener;
    #[cfg(unix)]
    use std::os::unix::net::UnixStream;
    #[cfg(unix)]
    use std::time::{Duration, Instant};

    #[cfg(unix)]
    use everyaios_ipc::frame;
    #[cfg(unix)]
    use everyaios_vault::{KeySpec, KeyStatus, Usage, UsageRow};

    #[cfg(unix)]
    fn temp_dir(tag: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!("everyaios-core-chat-{tag}-{}", std::process::id()))
    }

    #[cfg(unix)]
    fn temp_vault(tag: &str) -> (std::path::PathBuf, Vault) {
        let dir = temp_dir(tag);
        let _ = std::fs::remove_dir_all(&dir);
        let path = dir.join("vault.db");
        let vault = Vault::open(&path, "test-key").expect("open vault");
        (dir, vault)
    }

    #[cfg(unix)]
    fn pair() -> (UnixStream, UnixStream) {
        UnixStream::pair().expect("socketpair")
    }

    #[cfg(unix)]
    fn link_from(a: UnixStream) -> SidecarLink<UnixStream, UnixStream> {
        let reader = a.try_clone().expect("clone");
        SidecarLink::new(a, reader)
    }

    #[cfg(unix)]
    fn spec(provider: &str, key_id: &str) -> KeySpec {
        KeySpec {
            provider: provider.into(),
            key_id: key_id.into(),
            value: b"sk-test".to_vec(),
            status: KeyStatus::Primary,
            model_filter: vec![],
            priority: 100,
            daily_token_cap: None,
            daily_cost_cap: None,
        }
    }

    /// Spin a fake OpenAI-compatible endpoint (same pattern as the vault
    /// broker tests).
    #[cfg(unix)]
    fn mock_server(respond: impl Fn(&str) -> (u16, String) + Send + 'static) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        std::thread::spawn(move || {
            for stream in listener.incoming() {
                let mut s = match stream {
                    Ok(s) => s,
                    Err(_) => continue,
                };
                let mut buf = [0u8; 16_384];
                let n = match s.read(&mut buf) {
                    Ok(n) => n,
                    Err(_) => continue,
                };
                let req = String::from_utf8_lossy(&buf[..n]).to_string();
                let (code, body) = respond(&req);
                let resp = format!(
                    "HTTP/1.1 {code} OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    body.len(),
                    body
                );
                let _ = s.write_all(resp.as_bytes());
            }
        });
        format!("http://{addr}")
    }

    #[cfg(unix)]
    fn wait_events(events: &Arc<Mutex<Vec<ChatWireEvent>>>, min: usize, timeout: Duration) -> bool {
        let start = Instant::now();
        loop {
            if events.lock().unwrap_or_else(|e| e.into_inner()).len() >= min {
                return true;
            }
            if start.elapsed() > timeout {
                return false;
            }
            std::thread::sleep(Duration::from_millis(10));
        }
    }

    #[cfg(unix)]
    #[test]
    fn start_stream_preflights_budget() {
        // A session already at/over its $ limit is refused BEFORE dispatch,
        // with the J11 "stopped: $X limit" surface.
        let (dir, vault) = temp_vault("preflight");
        vault
            .record_usage(&UsageRow {
                session: "s-over".into(),
                provider: "nvidia".into(),
                model: "m".into(),
                key_id: "k".into(),
                usage: Usage::default(),
                cost: 2.50,
                tool: None,
                task_id: String::new(),
                run_id: String::new(),
                work_id: String::new(),
            })
            .unwrap();
        let vault = Arc::new(Mutex::new(vault));
        let (a, _b) = pair();
        let relay = ChatRelay::new(link_from(a), vault, |_| {});

        let err = relay
            .start_stream(ChatStreamParams {
                session_id: "s-over".into(),
                work_id: None,
                stream_id: "st-1".into(),
                text: "hi".into(),
                surface: None,
                agent_id: None,
                provider: Some("nvidia".into()),
                model: Some("m".into()),
                persona_id: None,
                soul_md: None,
                user_documents: None,
                project_id: None,
                primary_chief: None,
                credentialed_providers: None,
            })
            .unwrap_err();
        let msg = err.to_string();
        match err {
            ChatRelayError::BudgetExceeded {
                session,
                limit,
                spent,
            } => {
                assert_eq!(session, "s-over");
                assert_eq!(limit, DEFAULT_SESSION_BUDGET_USD);
                assert!(spent >= limit);
                assert!(msg.contains("stopped:"), "msg: {msg}");
            }
            other => panic!("expected BudgetExceeded, got {other:?}"),
        }
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[cfg(unix)]
    #[test]
    fn relay_forwards_chat_events() {
        // Fake sidecar acks chat/stream, then streams batch + done back
        // IMMEDIATELY (not gated on another frame — Rust sends nothing more).
        let (a, b) = pair();
        let side = std::thread::spawn(move || {
            let mut s = b;
            while let Ok(Some(payload)) = frame::decode(&mut s) {
                let v: serde_json::Value = serde_json::from_slice(&payload).unwrap_or_default();
                if v.get("method").and_then(|m| m.as_str()) == Some("chat/stream") {
                    let id = v.get("id").cloned().unwrap_or(serde_json::Value::Null);
                    let reply = serde_json::json!({ "jsonrpc": "2.0", "id": id, "result": { "accepted": true } });
                    let _ = frame::write_frame(&mut s, &serde_json::to_vec(&reply).unwrap());
                    let n = serde_json::json!({
                        "jsonrpc": "2.0", "method": "chat/batch",
                        "params": { "streamId": "st-1", "text": "hi", "tokenCount": 1 },
                    });
                    let _ = frame::write_frame(&mut s, &serde_json::to_vec(&n).unwrap());
                    let d = serde_json::json!({
                        "jsonrpc": "2.0", "method": "chat/done",
                        "params": { "streamId": "st-1", "turnId": "s1:1", "fullText": "hi", "totalTokens": 1 },
                    });
                    let _ = frame::write_frame(&mut s, &serde_json::to_vec(&d).unwrap());
                    break;
                }
            }
        });

        let (_dir, vault) = temp_vault("forward");
        let vault = Arc::new(Mutex::new(vault));
        let events: Arc<Mutex<Vec<ChatWireEvent>>> = Arc::new(Mutex::new(Vec::new()));
        let ev = Arc::clone(&events);
        let relay = ChatRelay::new(link_from(a), vault, move |e| {
            ev.lock().unwrap_or_else(|x| x.into_inner()).push(e);
        });
        relay.spawn();
        relay
            .start_stream(ChatStreamParams {
                session_id: "s1".into(),
                work_id: None,
                stream_id: "st-1".into(),
                text: "hi".into(),
                surface: None,
                agent_id: None,
                provider: Some("nvidia".into()),
                model: Some("m".into()),
                persona_id: None,
                soul_md: None,
                user_documents: None,
                project_id: None,
                primary_chief: None,
                credentialed_providers: None,
            })
            .expect("start_stream");

        assert!(
            wait_events(&events, 2, Duration::from_secs(5)),
            "expected Batch+Done events, got {:?}",
            events.lock().unwrap_or_else(|x| x.into_inner())
        );
        let evs = events.lock().unwrap_or_else(|x| x.into_inner());
        assert!(matches!(evs[0], ChatWireEvent::Batch { ref text, .. } if text == "hi"));
        assert!(matches!(evs[1], ChatWireEvent::Done { ref turn_id, .. } if turn_id == "s1:1"));
        // Spend is 0 → no budget kill.
        assert!(!evs
            .iter()
            .any(|e| matches!(e, ChatWireEvent::BudgetExceeded { .. })));
        side.join().unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn start_stream_forwards_credentialed_providers() {
        // P50.3.6 — the shell's live key set must reach the coordinator's
        // `chat/stream` params verbatim so the taken route is gated on the
        // same set the display feed used. The fake sidecar captures the
        // params instead of acking events.
        let (a, b) = pair();
        let seen: Arc<Mutex<Option<serde_json::Value>>> = Arc::new(Mutex::new(None));
        let seen_side = Arc::clone(&seen);
        let side = std::thread::spawn(move || {
            let mut s = b;
            while let Ok(Some(payload)) = frame::decode(&mut s) {
                let v: serde_json::Value = serde_json::from_slice(&payload).unwrap_or_default();
                if v.get("method").and_then(|m| m.as_str()) == Some("chat/stream") {
                    *seen_side.lock().unwrap_or_else(|x| x.into_inner()) = v.get("params").cloned();
                    let id = v.get("id").cloned().unwrap_or(serde_json::Value::Null);
                    let reply = serde_json::json!({ "jsonrpc": "2.0", "id": id, "result": { "accepted": true } });
                    let _ = frame::write_frame(&mut s, &serde_json::to_vec(&reply).unwrap());
                    break;
                }
            }
        });

        let (_dir, vault) = temp_vault("cred-fwd");
        let vault = Arc::new(Mutex::new(vault));
        let relay = ChatRelay::new(link_from(a), vault, |_| {});
        relay
            .start_stream(ChatStreamParams {
                session_id: "s1".into(),
                work_id: None,
                stream_id: "st-cred".into(),
                text: "hi".into(),
                surface: None,
                agent_id: None,
                provider: None,
                model: None,
                persona_id: None,
                soul_md: None,
                user_documents: None,
                project_id: None,
                primary_chief: None,
                credentialed_providers: Some(vec!["openai".into(), "ollama".into()]),
            })
            .expect("start_stream");
        side.join().unwrap();
        let guard = seen.lock().unwrap_or_else(|x| x.into_inner());
        let params = guard.as_ref().expect("fake sidecar saw chat/stream");
        assert_eq!(
            params.get("credentialedProviders"),
            Some(&serde_json::json!(["openai", "ollama"])),
            "live key set must ride chat/stream: {params}"
        );
    }

    #[cfg(unix)]
    #[test]
    fn retry_tool_forwards_the_real_work_id() {
        // P49: the coordinator registers stream identity from `workId`
        // (`registerStreamIdentity({streamId, sessionId, workId})`), so the
        // retry path must carry the *real* Work. It previously hard-coded
        // `"workId": session_id`, which filed every retry under a fabricated
        // Work and dropped the UI-supplied id at the Rust/Tauri hop.
        let (a, b) = pair();
        let seen: Arc<Mutex<Vec<serde_json::Value>>> = Arc::new(Mutex::new(Vec::new()));
        let seen_side = Arc::clone(&seen);
        let side = std::thread::spawn(move || {
            let mut s = b;
            while let Ok(Some(payload)) = frame::decode(&mut s) {
                let v: serde_json::Value = serde_json::from_slice(&payload).unwrap_or_default();
                if v.get("method").and_then(|m| m.as_str()) == Some("chat/tool_retry") {
                    let done = {
                        let mut g = seen_side.lock().unwrap_or_else(|x| x.into_inner());
                        g.push(v.get("params").cloned().unwrap_or(serde_json::Value::Null));
                        g.len()
                    };
                    let id = v.get("id").cloned().unwrap_or(serde_json::Value::Null);
                    let reply = serde_json::json!({ "jsonrpc": "2.0", "id": id, "result": { "accepted": true } });
                    let _ = frame::write_frame(&mut s, &serde_json::to_vec(&reply).unwrap());
                    if done >= 2 {
                        break;
                    }
                }
            }
        });

        let (_dir, vault) = temp_vault("retry-work-id");
        let vault = Arc::new(Mutex::new(vault));
        let relay = ChatRelay::new(link_from(a), vault, |_| {});
        let args = serde_json::json!({ "path": "/tmp/x" });
        relay
            .retry_tool("s1", "st-1", "t1", args.clone(), None, Some("w-real"))
            .expect("retry_tool with a Work");
        relay
            .retry_tool("s1", "st-2", "t2", args, None, None)
            .expect("retry_tool without a Work");
        side.join().unwrap();

        let g = seen.lock().unwrap_or_else(|x| x.into_inner());
        assert_eq!(g.len(), 2, "fake sidecar saw {g:?}");
        assert_eq!(
            g[0].get("workId"),
            Some(&serde_json::json!("w-real")),
            "retry must carry the real Work, not the session id: {}",
            g[0]
        );
        assert_eq!(g[0].get("sessionId"), Some(&serde_json::json!("s1")));
        assert_eq!(
            g[1].get("workId"),
            Some(&serde_json::json!("s1")),
            "with no Work, workId falls back to the session id (chat/stream convention): {}",
            g[1]
        );
    }

    #[cfg(unix)]
    #[test]
    fn relay_forwards_plan_interrupt_notifications() {
        // Stage-0 (P6.3): a `chat/interrupt` notification from the coordinator
        // arrives as a ChatWireEvent::Interrupt — the H2 MCQ card payload.
        //
        // P49: this also pins the plan's Work forwarding — the coordinator's
        // `PlanExecutionParams` has carried `workId` since P49 and
        // `registerStreamIdentity` keys plan streams on it, so the relay must
        // send the real Work rather than letting it fall back to the session.
        let (a, b) = pair();
        let plan_params: Arc<Mutex<Option<serde_json::Value>>> = Arc::new(Mutex::new(None));
        let plan_params_side = Arc::clone(&plan_params);
        let side = std::thread::spawn(move || {
            let mut s = b;
            while let Ok(Some(payload)) = frame::decode(&mut s) {
                let v: serde_json::Value = serde_json::from_slice(&payload).unwrap_or_default();
                if v.get("method").and_then(|m| m.as_str()) == Some("plan/execute") {
                    *plan_params_side.lock().unwrap_or_else(|x| x.into_inner()) =
                        v.get("params").cloned();
                    let id = v.get("id").cloned().unwrap_or(serde_json::Value::Null);
                    let reply = serde_json::json!({ "jsonrpc": "2.0", "id": id, "result": { "accepted": true } });
                    let _ = frame::write_frame(&mut s, &serde_json::to_vec(&reply).unwrap());
                    let n = serde_json::json!({
                        "jsonrpc": "2.0", "method": "chat/interrupt",
                        "params": {
                            "streamId": "st-1", "planId": "p1", "breakId": "b1",
                            "title": "Loop detected (3× repeat)",
                            "description": "The agent repeated the same tool call 3 times.",
                            "options": ["skip", "retry", "escalate", "takeover"],
                        },
                    });
                    let _ = frame::write_frame(&mut s, &serde_json::to_vec(&n).unwrap());
                    let d = serde_json::json!({
                        "jsonrpc": "2.0", "method": "chat/plan_done",
                        "params": { "streamId": "st-1", "planId": "p1", "tasksDone": 2 },
                    });
                    let _ = frame::write_frame(&mut s, &serde_json::to_vec(&d).unwrap());
                    break;
                }
            }
        });

        let (_dir, vault) = temp_vault("interrupt");
        let vault = Arc::new(Mutex::new(vault));
        let events: Arc<Mutex<Vec<ChatWireEvent>>> = Arc::new(Mutex::new(Vec::new()));
        let ev = Arc::clone(&events);
        let relay = ChatRelay::new(link_from(a), vault, move |e| {
            ev.lock().unwrap_or_else(|x| x.into_inner()).push(e);
        });
        relay.spawn();
        relay
            .start_plan(
                "s1",
                "p1",
                "st-1",
                serde_json::json!([{ "id": "t1", "goal": "g" }]),
                None,
                None,
                Some("w-plan"),
            )
            .expect("start_plan");

        assert!(
            wait_events(&events, 2, Duration::from_secs(5)),
            "expected Interrupt+PlanDone, got {:?}",
            events.lock().unwrap_or_else(|x| x.into_inner())
        );
        let evs = events.lock().unwrap_or_else(|x| x.into_inner());
        match &evs[0] {
            ChatWireEvent::Interrupt {
                plan_id,
                break_id,
                options,
                title,
                ..
            } => {
                assert_eq!(plan_id, "p1");
                assert_eq!(break_id, "b1");
                assert!(title.contains("Loop detected"));
                assert_eq!(options, &vec!["skip", "retry", "escalate", "takeover"]);
            }
            other => panic!("expected Interrupt, got {other:?}"),
        }
        assert!(
            matches!(evs[1], ChatWireEvent::PlanDone { ref plan_id, tasks_done: 2, error: None, .. } if plan_id == "p1")
        );
        side.join().unwrap();
        let pp = plan_params.lock().unwrap_or_else(|x| x.into_inner());
        let pp = pp.as_ref().expect("fake sidecar saw plan/execute");
        assert_eq!(
            pp.get("workId"),
            Some(&serde_json::json!("w-plan")),
            "plan/execute must carry the real Work: {pp}"
        );
        assert_eq!(pp.get("sessionId"), Some(&serde_json::json!("s1")));
    }

    #[test]
    fn capability_invocation_metadata_is_secret_free_and_validated() {
        let invocation = everyaios_guard::CapabilityInvocation {
            grant_id: "grant:1".into(),
            run_id: "run-1".into(),
            capability: "connector:gmail.read".into(),
            operation: "list".into(),
        };
        assert!(invocation.validate().is_ok());
        let encoded = serde_json::to_string(&invocation).unwrap();
        assert!(!encoded.contains("secret"));
        assert!(!encoded.contains("Bearer"));
    }

    #[cfg(unix)]
    #[test]
    fn provider_stream_runs_broker_and_pushes_chunks() {
        // The provider call happens in Rust: the coordinator's provider/stream
        // request drives the broker against a mock endpoint; deltas come back
        // as provider_chunk notifications. Keys never leave the process.
        let sse = concat!(
            "data: {\"choices\":[{\"delta\":{\"content\":\"Hel\"},\"finish_reason\":null}]}\n",
            "data: {\"choices\":[{\"delta\":{\"content\":\"lo\"},\"finish_reason\":null}]}\n",
            "data: {\"choices\":[],\"usage\":{\"prompt_tokens\":10,\"completion_tokens\":2,\"total_tokens\":12}}\n",
            "data: [DONE]\n",
        );
        let base = mock_server(move |_| (200, sse.into()));

        let (dir, vault) = temp_vault("provider");
        {
            let broker = Broker::new(&vault);
            broker.ring().add_key(spec("nvidia", "nim")).unwrap();
        }
        let vault = Arc::new(Mutex::new(vault));

        let (a, b) = pair();
        let relay = ChatRelay::new(link_from(a), vault, |_| {});
        relay.with_base_url("nvidia", base);
        relay.spawn();

        // Fake sidecar (coordinator role): send provider/stream, collect the
        // reply + chunk notifications until `ended`.
        let chunks = std::thread::spawn(move || {
            let mut s = b;
            let req = serde_json::json!({
                "jsonrpc": "2.0", "id": "p1", "method": "provider/stream",
                "params": {
                    "provider": "nvidia", "model": "m", "sessionId": "s1",
                    "streamId": "st-1",
                    "messages": [{ "role": "user", "content": "hi" }],
                },
            });
            let _ = frame::write_frame(&mut s, &serde_json::to_vec(&req).unwrap());
            let mut deltas: Vec<String> = Vec::new();
            let mut usage: Option<(u64, u64)> = None;
            let mut ended = false;
            let mut saw_ack = false;
            while let Ok(Some(payload)) = frame::decode(&mut s) {
                let v: serde_json::Value = serde_json::from_slice(&payload).unwrap_or_default();
                if let Some(result) = v.get("result") {
                    if result.get("accepted").and_then(|x| x.as_bool()) == Some(true) {
                        saw_ack = true;
                    }
                    continue;
                }
                let p = v.get("params").cloned().unwrap_or_default();
                if let Some(d) = p.get("delta").and_then(|d| d.as_str()) {
                    deltas.push(d.to_string());
                }
                if let Some(u) = p.get("usage") {
                    usage = Some((
                        u.get("promptTokens").and_then(|x| x.as_u64()).unwrap_or(0),
                        u.get("completionTokens")
                            .and_then(|x| x.as_u64())
                            .unwrap_or(0),
                    ));
                }
                if p.get("ended").and_then(|x| x.as_bool()) == Some(true) {
                    ended = true;
                    break;
                }
            }
            (saw_ack, deltas, usage, ended)
        });

        let (saw_ack, deltas, usage, ended) = chunks.join().unwrap();
        assert!(saw_ack, "provider/stream was not acked");
        assert_eq!(deltas.join(""), "Hello");
        assert_eq!(usage, Some((10, 2)));
        assert!(ended);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[cfg(unix)]
    #[test]
    fn post_turn_budget_kill_surfaces_stopped() {
        // J11 end-to-end: a session pre-loaded to $1.99 spends $0.02 on a turn;
        // the relay's post-turn check emits BudgetExceeded ("stopped").
        let sse = concat!(
            "data: {\"choices\":[{\"delta\":{\"content\":\"x\"},\"finish_reason\":null}]}\n",
            "data: {\"choices\":[],\"usage\":{\"prompt_tokens\":40000,\"completion_tokens\":0,\"total_tokens\":40000}}\n",
            "data: [DONE]\n",
        );
        let base = mock_server(move |_| (200, sse.into()));

        let (dir, vault) = temp_vault("kill");
        vault
            .record_usage(&UsageRow {
                session: "s-kill".into(),
                provider: "nvidia".into(),
                model: "m".into(),
                key_id: "k".into(),
                usage: Usage::default(),
                cost: 1.99,
                tool: None,
                task_id: String::new(),
                run_id: String::new(),
                work_id: String::new(),
            })
            .unwrap();
        {
            let broker = Broker::new(&vault);
            broker.ring().add_key(spec("nvidia", "nim")).unwrap();
        }
        let vault = Arc::new(Mutex::new(vault));

        let (a, b) = pair();
        let events: Arc<Mutex<Vec<ChatWireEvent>>> = Arc::new(Mutex::new(Vec::new()));
        let ev = Arc::clone(&events);
        let relay = ChatRelay::new(link_from(a), vault, move |e| {
            ev.lock().unwrap_or_else(|x| x.into_inner()).push(e);
        });
        relay.with_base_url("nvidia", base);
        relay.spawn();

        // Fake sidecar: ack chat/stream, drive provider/stream (so the ledger
        // records the $0.02 turn), then send chat/done — all immediately.
        let side = std::thread::spawn(move || {
            let mut s = b;
            while let Ok(Some(payload)) = frame::decode(&mut s) {
                let v: serde_json::Value = serde_json::from_slice(&payload).unwrap_or_default();
                if v.get("method").and_then(|m| m.as_str()) == Some("chat/stream") {
                    let id = v.get("id").cloned().unwrap_or(serde_json::Value::Null);
                    let reply = serde_json::json!({ "jsonrpc": "2.0", "id": id, "result": { "accepted": true } });
                    let _ = frame::write_frame(&mut s, &serde_json::to_vec(&reply).unwrap());
                    // As the coordinator would: ask Rust to run the provider call.
                    let req = serde_json::json!({
                        "jsonrpc": "2.0", "id": "p2", "method": "provider/stream",
                        "params": {
                            "provider": "nvidia", "model": "m", "sessionId": "s-kill",
                            "streamId": "st-1",
                            "messages": [{ "role": "user", "content": "x" }],
                        },
                    });
                    let _ = frame::write_frame(&mut s, &serde_json::to_vec(&req).unwrap());
                    // Drain chunks until ended.
                    while let Ok(Some(payload)) = frame::decode(&mut s) {
                        let v: serde_json::Value =
                            serde_json::from_slice(&payload).unwrap_or_default();
                        if v.get("params")
                            .and_then(|p| p.get("ended"))
                            .and_then(|x| x.as_bool())
                            == Some(true)
                        {
                            break;
                        }
                    }
                    // Now the turn is done.
                    let d = serde_json::json!({
                        "jsonrpc": "2.0", "method": "chat/done",
                        "params": { "streamId": "st-1", "turnId": "s-kill:1", "fullText": "x", "totalTokens": 1 },
                    });
                    let _ = frame::write_frame(&mut s, &serde_json::to_vec(&d).unwrap());
                    break;
                }
            }
        });

        relay
            .start_stream(ChatStreamParams {
                session_id: "s-kill".into(),
                work_id: None,
                stream_id: "st-1".into(),
                text: "x".into(),
                surface: None,
                agent_id: None,
                provider: Some("nvidia".into()),
                model: Some("m".into()),
                persona_id: None,
                soul_md: None,
                user_documents: None,
                project_id: None,
                primary_chief: None,
                credentialed_providers: None,
            })
            .expect("start_stream (1.99 < 2.00 pre-flight passes)");

        assert!(
            wait_events(&events, 1, Duration::from_secs(5)),
            "expected BudgetExceeded, got {:?}",
            events.lock().unwrap_or_else(|x| x.into_inner())
        );
        let evs = events.lock().unwrap_or_else(|x| x.into_inner());
        // Budget enforcement is terminal and is emitted before `done`, so a
        // queued follow-up cannot observe a transient completed state.
        assert!(matches!(
            evs[0],
            ChatWireEvent::BudgetExceeded { ref session_id, spent, .. }
                if session_id == "s-kill" && spent >= 2.01
        ));
        // The next turn is refused at pre-flight.
        let err = relay
            .start_stream(ChatStreamParams {
                session_id: "s-kill".into(),
                work_id: None,
                stream_id: "st-2".into(),
                text: "again".into(),
                surface: None,
                agent_id: None,
                provider: Some("nvidia".into()),
                model: Some("m".into()),
                persona_id: None,
                soul_md: None,
                user_documents: None,
                project_id: None,
                primary_chief: None,
                credentialed_providers: None,
            })
            .unwrap_err();
        assert!(matches!(err, ChatRelayError::BudgetExceeded { .. }));
        side.join().unwrap();
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[cfg(unix)]
    #[test]
    fn relay_dispatches_scheduler_requests() {
        // P6.4: `scheduler/*` requests from the coordinator hit the shared
        // SchedulerService; the same job state is visible via the relay handle.
        let (a, b) = pair();
        let side = std::thread::spawn(move || {
            // Coordinator role: issue upsert + due to Rust, drain the acks.
            let mut s = b;
            let up = serde_json::json!({
                "jsonrpc": "2.0", "id": "u1", "method": "scheduler/upsert",
                "params": {
                    "id": "j1", "name": "probe", "sessionId": "s1",
                    "trigger": { "type": "interval", "secs": 60 },
                    "steps": [],
                    "now": 1_750_000_000,
                },
            });
            let _ = frame::write_frame(&mut s, &serde_json::to_vec(&up).unwrap());
            let due = serde_json::json!({
                "jsonrpc": "2.0", "id": "d1", "method": "scheduler/due",
                "params": { "now": 1_750_000_061 },
            });
            let _ = frame::write_frame(&mut s, &serde_json::to_vec(&due).unwrap());
            let mut acks = Vec::new();
            while let Ok(Some(payload)) = frame::decode(&mut s) {
                if let Ok(v) = serde_json::from_slice::<serde_json::Value>(&payload) {
                    if v.get("id").is_some() {
                        acks.push(v);
                    }
                    if acks.len() == 2 {
                        break;
                    }
                }
            }
            acks
        });
        let (dir, vault) = temp_vault("scheduler");
        let vault = Arc::new(Mutex::new(vault));
        let mut relay = ChatRelay::new(link_from(a), vault, |_| {});
        // Test isolation: `ChatRelay::new` loads the *developer's* real
        // `<data_dir>/scheduler.json`, so a job left there by an earlier run
        // (or by the app itself) decided the `due` result and made this test
        // depend on machine state. Re-seat the service on an empty temp file so
        // the assertion is about the dispatched job, not the disk.
        relay.scheduler = Arc::new(Mutex::new(SchedulerService::load_or_new(
            dir.join("scheduler.json"),
        )));
        relay.spawn();

        // The sidecar thread drives the protocol — the relay just needs to
        // be alive; the ack content is asserted on the coordinator side.
        let acks = side.join().unwrap();
        assert_eq!(acks.len(), 2);
        let up_ack = &acks[0];
        assert_eq!(up_ack["result"]["ok"], serde_json::json!(true));
        let due_ack = &acks[1];
        assert_eq!(due_ack["result"]["due"], serde_json::json!(["j1"]));
    }

    /// P64.3/P64.4/P64.5/P64.8 — the *native plane* seams driven end to end.
    ///
    /// The lane's earlier tests called the RPC helpers directly, which cannot
    /// distinguish "the arm is mounted" from "the helper works" — exactly how
    /// `codeintel/repomap`, `subagent/spawn` and `skill/grow` sat unhandled
    /// behind a catch-all while every helper-level test stayed green. This test
    /// pushes real JSON-RPC frames through `ChatRelay::spawn()` and asserts on
    /// the replies the coordinator actually receives, so a missing arm fails
    /// here rather than silently in production.
    #[cfg(unix)]
    #[test]
    fn relay_dispatches_native_plane_requests() {
        let (a, b) = pair();
        // The client half is interactive: `execution/record_edit` and
        // `execution/record_preflight` can only target an execution that
        // really exists, so the id is read back from the `begin` ack first.
        let side = std::thread::spawn(move || {
            let mut s = b;
            let mut call = |id: &str, method: &str, params: serde_json::Value| {
                let v = serde_json::json!({
                    "jsonrpc": "2.0", "id": id, "method": method, "params": params,
                });
                let _ = frame::write_frame(&mut s, &serde_json::to_vec(&v).unwrap());
                loop {
                    match frame::decode(&mut s) {
                        Ok(Some(payload)) => {
                            if let Ok(v) = serde_json::from_slice::<serde_json::Value>(&payload) {
                                if v.get("id").and_then(|i| i.as_str()) == Some(id) {
                                    return v;
                                }
                            }
                        }
                        _ => panic!("relay closed the link before acking {method}"),
                    }
                }
            };

            let repomap = call(
                "r1",
                "codeintel/repomap",
                serde_json::json!({ "maxFiles": 50 }),
            );
            let grown = call(
                "g1",
                "skill/grow",
                serde_json::json!({
                    "taskName": "Frame Dispatch Probe",
                    "solution": "1. Do the thing.\n2. Verify it.",
                    "author": "test",
                    "version": "0.1.0",
                }),
            );
            let spawned = call(
                "s1",
                "subagent/spawn",
                serde_json::json!({
                    "spec": { "id": "t-frame", "goal": "probe", "context": [], "acceptance": [] },
                    "model": "m",
                    "workspace": ".everyaios/worktrees/task-t-frame",
                    "parentId": null,
                    "tools": ["todo"],
                    "blockedTools": [],
                    "depth": 1,
                }),
            );
            let began = call(
                "b1",
                "execution/begin",
                serde_json::json!({ "trigger": "chat", "sessionId": "s-frame", "objective": "probe" }),
            );
            let ex_id = began["result"]["id"]
                .as_str()
                .expect("begin returns the execution id")
                .to_string();

            // Guard-2 gate: a receipt without a ticket is refused, and a
            // receipt for an unknown execution is refused too.
            let no_ticket = call(
                "e0",
                "execution/record_edit",
                serde_json::json!({ "id": ex_id, "strategy": "exact", "path": "src/a.rs", "ticketId": "", "auditSeq": 1 }),
            );
            let unknown = call(
                "e1",
                "execution/record_edit",
                serde_json::json!({ "id": "nosuch", "strategy": "exact", "path": "src/a.rs", "ticketId": "guard-ticket-1", "auditSeq": 2 }),
            );
            let edit = call(
                "e2",
                "execution/record_edit",
                serde_json::json!({ "id": ex_id, "strategy": "exact", "path": "src/a.rs", "ticketId": "guard-ticket-1", "auditSeq": 7 }),
            );
            let pre = call(
                "p1",
                "execution/record_preflight",
                serde_json::json!({ "id": ex_id, "passed": true, "output": "tsc clean" }),
            );
            (
                repomap, grown, spawned, began, no_ticket, unknown, edit, pre,
            )
        });

        let (dir, vault) = temp_vault("native-plane");
        let vault = Arc::new(Mutex::new(vault));
        let mut relay = ChatRelay::new(link_from(a), vault, |_| {});
        // Isolation: the defaults are the developer's real data dir and
        // `~/.everyaios/skills`. Point both at the temp tree so the assertions
        // are about the dispatch, and no frame can write to the real home.
        relay.skill_store = Arc::new(Mutex::new(everyaios_blueprint::SkillStore::new(
            dir.join("skills"),
        )));
        let workspace = dir.join("workspace");
        std::fs::create_dir_all(&workspace).unwrap();
        std::fs::write(workspace.join("m.rs"), "fn alpha() {}\n").unwrap();
        {
            let mut svc = ToolService::new_with_egress(
                Arc::clone(&relay.guard),
                workspace,
                Arc::clone(&relay.egress),
            );
            svc.attach_capability_broker(Arc::clone(&relay.capabilities));
            relay.tools = Arc::new(Mutex::new(svc));
        }
        relay.spawn();

        let (repomap, grown, spawned, began, no_ticket, unknown, edit, pre) = side.join().unwrap();

        // P64.3 — a real map over the temp workspace, in the wire shape the
        // coordinator reads. `method not found` used to arrive as this.
        assert!(repomap.get("error").is_none(), "repomap: {repomap}");
        let tags = repomap["result"]["tags"].as_array().expect("tags array");
        assert!(
            tags.iter()
                .any(|t| t["symbol"] == serde_json::json!("alpha")),
            "repo map did not surface the workspace symbol: {repomap}"
        );

        // P64.8 — distillation really reached the (temp) store.
        assert!(grown.get("error").is_none(), "skill/grow: {grown}");
        assert_eq!(grown["result"]["ok"], serde_json::json!(true));
        assert!(dir
            .join("skills")
            .join("frame-dispatch-probe")
            .join("SKILL.md")
            .exists());

        // P64.4 — an admission reported as running, never a fabricated done.
        assert!(spawned.get("error").is_none(), "subagent/spawn: {spawned}");
        assert_eq!(spawned["result"]["task_id"], serde_json::json!("t-frame"));
        assert_eq!(spawned["result"]["status"], serde_json::json!("running"));

        // P64.5 — receipts attach only behind a real Guard-2 ticket.
        assert!(began["result"]["id"].is_string(), "begin: {began}");
        assert!(
            no_ticket.get("error").is_some(),
            "ticketless edit must fail"
        );
        assert!(
            unknown.get("error").is_some(),
            "unknown execution must fail"
        );
        assert!(edit.get("error").is_none(), "verified edit: {edit}");
        assert_eq!(edit["result"]["strategy"], serde_json::json!("exact"));
        assert_eq!(
            edit["result"]["ticketId"],
            serde_json::json!("guard-ticket-1")
        );

        // P64.6 — the preflight receipt records its verdict.
        assert!(pre.get("error").is_none(), "preflight: {pre}");
        assert_eq!(pre["result"]["passed"], serde_json::json!(true));

        let _ = std::fs::remove_dir_all(&dir);
    }

    /// A stand-in plane for the *arm* tests.
    ///
    /// The arm's job is to carry the observer's rows onto the wire and to be
    /// honest about a host with no plane, so a deterministic observer is the
    /// right instrument — the real `PtyHost` read models are covered against a
    /// real spawned shell in `terminal::tests`.
    struct FakePlane;

    impl crate::terminal::TerminalPlaneObserver for FakePlane {
        fn plane_status(&self) -> crate::terminal::TerminalPlaneStatus {
            crate::terminal::TerminalPlaneStatus {
                attached: true,
                count: 1,
                ptys: vec![crate::terminal::TerminalSessionView {
                    pty_id: "pty-1".into(),
                    profile_id: "bash".into(),
                    backend: crate::terminal::TerminalBackend::Local,
                    origin: crate::terminal::TerminalOrigin::Agent,
                    label: Some("script.run".into()),
                    integration: Some("Rich"),
                    cwd: "/w".into(),
                    pid: Some(42),
                    running: true,
                    exit_code: None,
                }],
            }
        }

        fn session(&self, pty_id: &str) -> Option<crate::terminal::TerminalSessionView> {
            self.plane_status()
                .ptys
                .into_iter()
                .find(|s| s.pty_id == pty_id)
        }

        fn commands(
            &self,
            pty_id: &str,
            _limit: usize,
        ) -> Result<Vec<crate::terminal::TerminalCommandView>, String> {
            if pty_id != "pty-1" {
                return Err(format!("no such pty: {pty_id}"));
            }
            Ok(vec![crate::terminal::TerminalCommandView {
                command: "cargo test -p everyaios-core".into(),
                cwd: "/w".into(),
                exit_code: Some(0),
                output: "2593 passed".into(),
                trusted: true,
                failed: false,
            }])
        }

        fn last_command(&self, pty_id: &str, _max_chars: usize) -> Result<Option<String>, String> {
            if pty_id != "pty-1" {
                return Err(format!("no such pty: {pty_id}"));
            }
            Ok(Some("$ cargo test -p everyaios-core\nexit 0".into()))
        }

        fn history(
            &self,
            _pty_id: &str,
            _limit: usize,
            _max_chars: usize,
        ) -> Result<Option<String>, String> {
            Ok(None)
        }
    }

    /// P54.5 — the `terminal/*` arm driven end to end over real JSON-RPC frames.
    ///
    /// Asserted on the replies the coordinator actually receives, not on the
    /// helper: an unmounted arm answers `method not found`, which the
    /// coordinator's best-effort catches would swallow into "the agent has no
    /// shell state", which is how this seam would ship silently broken.
    #[cfg(unix)]
    #[test]
    fn relay_dispatches_terminal_plane_requests() {
        let (a, b) = pair();
        let side = std::thread::spawn(move || {
            let mut s = b;
            let mut call = |id: &str, method: &str, params: serde_json::Value| {
                let v = serde_json::json!({
                    "jsonrpc": "2.0", "id": id, "method": method, "params": params,
                });
                let _ = frame::write_frame(&mut s, &serde_json::to_vec(&v).unwrap());
                loop {
                    match frame::decode(&mut s) {
                        Ok(Some(payload)) => {
                            if let Ok(v) = serde_json::from_slice::<serde_json::Value>(&payload) {
                                if v.get("id").and_then(|i| i.as_str()) == Some(id) {
                                    return v;
                                }
                            }
                        }
                        _ => panic!("relay closed the link before acking {method}"),
                    }
                }
            };
            let status = call("t1", "terminal/status", serde_json::json!({}));
            let commands = call(
                "t2",
                "terminal/commands",
                serde_json::json!({ "ptyId": "pty-1", "limit": 50 }),
            );
            let last = call(
                "t3",
                "terminal/last_command",
                serde_json::json!({ "ptyId": "pty-1", "maxChars": 6000 }),
            );
            // A session that is not on the plane is a caller bug and must be
            // refused rather than answered with an empty record list.
            let unknown = call(
                "t4",
                "terminal/commands",
                serde_json::json!({ "ptyId": "pty-nope" }),
            );
            // A ptyId-less read cannot be guessed at either.
            let missing = call("t5", "terminal/last_command", serde_json::json!({}));
            (status, commands, last, unknown, missing)
        });

        let (dir, vault) = temp_vault("terminal-plane");
        let vault = Arc::new(Mutex::new(vault));
        let relay = ChatRelay::new(link_from(a), vault, |_| {});
        relay.attach_terminal_plane(Arc::new(FakePlane));
        relay.spawn();

        let (status, commands, last, unknown, missing) = side.join().unwrap();

        assert!(status.get("error").is_none(), "terminal/status: {status}");
        assert_eq!(status["result"]["attached"], serde_json::json!(true));
        assert_eq!(status["result"]["count"], serde_json::json!(1));
        let row = &status["result"]["ptys"][0];
        assert_eq!(row["ptyId"], serde_json::json!("pty-1"));
        // Provenance and cwd travel with the row: this is what lets the
        // coordinator tell an agent session from the user's own shell.
        assert_eq!(row["origin"], serde_json::json!("agent"));
        assert_eq!(row["backend"], serde_json::json!("local"));
        assert_eq!(row["integration"], serde_json::json!("Rich"));
        assert_eq!(row["cwd"], serde_json::json!("/w"));

        assert!(
            commands.get("error").is_none(),
            "terminal/commands: {commands}"
        );
        assert_eq!(commands["result"]["count"], serde_json::json!(1));
        assert_eq!(commands["result"]["cwd"], serde_json::json!("/w"));
        let rec = &commands["result"]["commands"][0];
        assert_eq!(rec["exitCode"], serde_json::json!(0));
        assert_eq!(rec["trusted"], serde_json::json!(true));
        assert_eq!(rec["failed"], serde_json::json!(false));

        assert!(last.get("error").is_none(), "terminal/last_command: {last}");
        assert_eq!(
            last["result"]["block"],
            serde_json::json!("$ cargo test -p everyaios-core\nexit 0")
        );

        assert!(
            unknown.get("error").is_some(),
            "unknown pty must be refused"
        );
        assert!(missing.get("error").is_some(), "ptyId is required");

        let _ = std::fs::remove_dir_all(&dir);
    }

    /// A host with no PTY host must say so, and must not hand back an empty
    /// session list that reads as "a shell with nothing running" — nor pretend
    /// a named session exists.
    #[cfg(unix)]
    #[test]
    fn relay_reports_a_detached_terminal_plane_honestly() {
        let (a, b) = pair();
        let side = std::thread::spawn(move || {
            let mut s = b;
            let mut call = |id: &str, method: &str, params: serde_json::Value| {
                let v = serde_json::json!({
                    "jsonrpc": "2.0", "id": id, "method": method, "params": params,
                });
                let _ = frame::write_frame(&mut s, &serde_json::to_vec(&v).unwrap());
                loop {
                    match frame::decode(&mut s) {
                        Ok(Some(payload)) => {
                            if let Ok(v) = serde_json::from_slice::<serde_json::Value>(&payload) {
                                if v.get("id").and_then(|i| i.as_str()) == Some(id) {
                                    return v;
                                }
                            }
                        }
                        _ => panic!("relay closed the link before acking {method}"),
                    }
                }
            };
            let status = call("d1", "terminal/status", serde_json::json!({}));
            let commands = call(
                "d2",
                "terminal/commands",
                serde_json::json!({ "ptyId": "pty-1" }),
            );
            (status, commands)
        });

        let (dir, vault) = temp_vault("terminal-detached");
        let vault = Arc::new(Mutex::new(vault));
        // No `attach_terminal_plane` — the headless posture.
        let relay = ChatRelay::new(link_from(a), vault, |_| {});
        relay.spawn();

        let (status, commands) = side.join().unwrap();
        assert!(status.get("error").is_none(), "terminal/status: {status}");
        assert_eq!(status["result"]["attached"], serde_json::json!(false));
        assert_eq!(status["result"]["count"], serde_json::json!(0));
        assert_eq!(status["result"]["ptys"], serde_json::json!([]));
        assert!(
            commands.get("error").is_some(),
            "a session read on a host with no shell must be refused"
        );

        let _ = std::fs::remove_dir_all(&dir);
    }
}
