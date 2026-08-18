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

use everyaios_vault::{Broker, LocalEndpoint, Vault, DEFAULT_SESSION_BUDGET_USD};

use crate::guard_service::GuardService;
use crate::memory_service::MemoryService;
use crate::plan_service::PlanService;
use crate::scheduler_service::SchedulerService;
use crate::sidecar_link::{Inbound, SidecarLink, WriterHandle};

/// P1.8: registered keyless local endpoints (provider → endpoint).
type LocalEndpointMap = HashMap<String, LocalEndpoint>;

/// UI event sink (pre-existing; alias keeps clippy's type_complexity quiet).
type EventSink = Box<dyn Fn(ChatWireEvent) + Send>;

/// Wire events forwarded to the UI (Tauri emits a single `chat-event`).
#[derive(Debug, Clone, serde::Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ChatWireEvent {
    Ttft {
        stream_id: String,
        latency_ms: u64,
    },
    Batch {
        stream_id: String,
        text: String,
        token_count: u64,
    },
    Reasoning {
        stream_id: String,
        text: String,
    },
    Stage {
        stream_id: String,
        stage: String,
    },
    ToolCall {
        stream_id: String,
        tool_id: String,
    },
    ToolResult {
        stream_id: String,
        tool_id: String,
    },
    Done {
        stream_id: String,
        turn_id: String,
        full_text: String,
        total_tokens: u64,
    },
    Error {
        stream_id: String,
        code: String,
        message: String,
    },
    Cancelled {
        stream_id: String,
    },
    /// J11 kill surface: "stopped: $X limit".
    BudgetExceeded {
        session_id: String,
        limit: f64,
        spent: f64,
    },
    /// Stage-0 plan executor: a circuit-break MCQ card for the H2 cockpit
    /// (the coordinator emitted `chat/interrupt` when `CircuitBreaker::step`
    /// tripped). `options` are the McqOption values; the UI maps them to
    /// actionable labels and returns the choice via `plan/respond`.
    Interrupt {
        stream_id: String,
        plan_id: String,
        break_id: String,
        title: String,
        description: String,
        options: Vec<String>,
    },
    /// Stage-0 plan executor: the plan finished (or halted). `error` is
    /// present when it halted on an interrupt/escalation.
    PlanDone {
        stream_id: String,
        plan_id: String,
        tasks_done: u32,
        error: Option<String>,
    },
}

/// Parameters for one chat turn (mirrors the coordinator's `chat/stream`).
#[derive(Debug, Clone)]
pub struct ChatStreamParams {
    pub session_id: String,
    pub stream_id: String,
    pub text: String,
    pub surface: Option<String>,
    pub agent_id: Option<String>,
    pub provider: String,
    pub model: String,
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
    on_event: Arc<Mutex<EventSink>>,
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
        Self {
            link,
            vault,
            sessions: Arc::new(Mutex::new(HashMap::new())),
            base_urls: Arc::new(Mutex::new(HashMap::new())),
            local_endpoints: Arc::new(Mutex::new(HashMap::new())),
            memory: Arc::new(Mutex::new(MemoryService::new())),
            guard,
            plan: Arc::new(Mutex::new(PlanService::new())),
            scheduler: Arc::new(Mutex::new(SchedulerService::new())),
            on_event: Arc::new(Mutex::new(Box::new(on_event))),
        }
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
        self.local_endpoints
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .insert(provider.to_string(), endpoint);
        self
    }

    /// Override a provider base URL (config / tests).
    pub fn with_base_url(&self, provider: &str, url: impl Into<String>) -> &Self {
        self.base_urls
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .insert(provider.to_string(), url.into());
        self
    }

    /// The sidecar link (cancel path + tests).
    pub fn link(&self) -> &SidecarLink<W, R> {
        &self.link
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
        let local_endpoints = Arc::clone(&self.local_endpoints);
        let memory = Arc::clone(&self.memory);
        let guard = Arc::clone(&self.guard);
        let plan = Arc::clone(&self.plan);
        let scheduler = Arc::clone(&self.scheduler);

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
                        let local2 = Arc::clone(&local_endpoints);
                        std::thread::spawn(move || {
                            let _ = stream_provider(vault2, base2, local2, params, w2);
                        });
                    }
                    // P5.1/P5.3/P5.4/P5.9: memory + usage dispatch. Runs on
                    // the consumer loop (fast, deterministic, no I/O) so the
                    // reply is synchronous and the sidecar can await it.
                    method if method.starts_with("memory/") || method == "usage/snapshot" => {
                        let mut svc = memory.lock().unwrap_or_else(|e| e.into_inner());
                        match svc.handle(method, &params) {
                            Ok(out) => {
                                let _ = writer.reply(id, out);
                            }
                            Err(e) => {
                                let _ = writer.reply_error(id, &e);
                            }
                        }
                    }
                    // P7.5/J21: Guard-2 pre-flight + executor call-sites.
                    method if method.starts_with("guard/") => {
                        let mut svc = guard.lock().unwrap_or_else(|e| e.into_inner());
                        match svc.handle(method, &params) {
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
                    match method.as_str() {
                        "chat/ttft" => emit(
                            &on_event,
                            ChatWireEvent::Ttft {
                                latency_ms: params
                                    .get("latencyMs")
                                    .and_then(|v| v.as_u64())
                                    .unwrap_or(0),
                                stream_id,
                            },
                        ),
                        "chat/batch" => emit(
                            &on_event,
                            ChatWireEvent::Batch {
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
                            },
                        ),
                        "chat/reasoning" => emit(
                            &on_event,
                            ChatWireEvent::Reasoning {
                                text: params
                                    .get("text")
                                    .and_then(|t| t.as_str())
                                    .unwrap_or("")
                                    .to_string(),
                                stream_id,
                            },
                        ),
                        "chat/stage" => emit(
                            &on_event,
                            ChatWireEvent::Stage {
                                stage: params
                                    .get("stage")
                                    .and_then(|s| s.as_str())
                                    .unwrap_or("")
                                    .to_string(),
                                stream_id,
                            },
                        ),
                        "chat/tool_call" => emit(
                            &on_event,
                            ChatWireEvent::ToolCall {
                                tool_id: params
                                    .get("toolId")
                                    .and_then(|t| t.as_str())
                                    .unwrap_or("")
                                    .to_string(),
                                stream_id,
                            },
                        ),
                        "chat/tool_result" => emit(
                            &on_event,
                            ChatWireEvent::ToolResult {
                                tool_id: params
                                    .get("toolId")
                                    .and_then(|t| t.as_str())
                                    .unwrap_or("")
                                    .to_string(),
                                stream_id,
                            },
                        ),
                        "chat/done" => {
                            emit(
                                &on_event,
                                ChatWireEvent::Done {
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
                                },
                            );
                            // J11 post-turn kill: a session that just crossed
                            // its $ limit gets the "stopped: $X limit" surface.
                            let session_id = sessions
                                .lock()
                                .unwrap_or_else(|e| e.into_inner())
                                .get(&stream_id)
                                .cloned();
                            if let Some(session_id) = session_id {
                                let spent = vault
                                    .lock()
                                    .unwrap_or_else(|e| e.into_inner())
                                    .session_spend(&session_id)
                                    .unwrap_or(0.0);
                                if spent >= DEFAULT_SESSION_BUDGET_USD {
                                    emit(
                                        &on_event,
                                        ChatWireEvent::BudgetExceeded {
                                            session_id,
                                            limit: DEFAULT_SESSION_BUDGET_USD,
                                            spent,
                                        },
                                    );
                                }
                            }
                        }
                        "chat/error" => emit(
                            &on_event,
                            ChatWireEvent::Error {
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
                                stream_id,
                            },
                        ),
                        "chat/cancelled" => emit(&on_event, ChatWireEvent::Cancelled { stream_id }),
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
                                    plan_id,
                                    break_id,
                                    title,
                                    description,
                                    options,
                                },
                            );
                        }
                        "chat/plan_done" => {
                            emit(
                                &on_event,
                                ChatWireEvent::PlanDone {
                                    plan_id: params
                                        .get("planId")
                                        .and_then(|s| s.as_str())
                                        .unwrap_or("")
                                        .to_string(),
                                    tasks_done: params
                                        .get("tasksDone")
                                        .and_then(|v| v.as_u64())
                                        .unwrap_or(0) as u32,
                                    error: params
                                        .get("error")
                                        .and_then(|s| s.as_str())
                                        .map(str::to_string),
                                    stream_id,
                                },
                            );
                        }
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

        let ack = self.link.request(
            "chat/stream",
            serde_json::json!({
                "sessionId": params.session_id,
                "streamId": params.stream_id,
                "text": params.text,
                "surface": params.surface,
                "agentId": params.agent_id,
                "provider": params.provider,
                "model": params.model,
            }),
        )?;
        if !ack
            .get("accepted")
            .and_then(|a| a.as_bool())
            .unwrap_or(false)
        {
            return Err(ChatRelayError::SidecarRejected(ack.to_string()));
        }

        self.sessions
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .insert(params.stream_id.clone(), params.session_id.clone());
        Ok(())
    }

    /// Cancel a running stream (abort UI → Rust → sidecar → provider).
    pub fn cancel(&self, stream_id: &str) -> Result<(), ChatRelayError> {
        self.link
            .writer()
            .notify("chat/cancel", serde_json::json!({ "streamId": stream_id }))?;
        Ok(())
    }

    /// Stage-0 (P6.3): dispatch a blueprint plan to the coordinator's plan
    /// executor. The coordinator begins the plan breaker via `plan/begin`,
    /// steps it per LLM turn/tool call, and emits `chat/interrupt` on a trip
    /// + `chat/plan_done` at the end. Returns once the coordinator acks.
    pub fn start_plan(
        &self,
        session_id: &str,
        plan_id: &str,
        stream_id: &str,
        tasks: serde_json::Value,
        provider: Option<&str>,
        model: Option<&str>,
    ) -> Result<(), ChatRelayError> {
        let mut body = serde_json::json!({
            "sessionId": session_id,
            "planId": plan_id,
            "streamId": stream_id,
            "tasks": tasks,
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
        let ack = self.link.request("scheduler/execute", serde_json::json!({}))?;
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
    pub fn respond_plan(
        &self,
        break_id: &str,
        choice: &str,
    ) -> Result<(), ChatRelayError> {
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

fn emit(on_event: &Arc<Mutex<EventSink>>, ev: ChatWireEvent) {
    on_event.lock().unwrap_or_else(|e| e.into_inner())(ev);
}

/// Run the broker for a coordinator `provider/stream` request and push the
/// deltas back as `chat/provider_chunk` notifications. Runs on its own thread;
/// keys never leave this process (the sidecar only sees chunk deltas).
fn stream_provider(
    vault: Arc<Mutex<Vault>>,
    base_urls: Arc<Mutex<HashMap<String, String>>>,
    local_endpoints: Arc<Mutex<LocalEndpointMap>>,
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

    // The vault guard must outlive the broker (Broker<'a> borrows the vault).
    let v = vault.lock().unwrap_or_else(|e| e.into_inner());
    let mut broker = Broker::new(&v);
    for (p, url) in base_urls.lock().unwrap_or_else(|e| e.into_inner()).iter() {
        broker = broker.with_base_url(p, url.clone());
    }
    // P1.8 (A5): keyless local endpoints route inside the broker.
    for (p, ep) in local_endpoints
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .iter()
    {
        broker = broker.with_local(p, ep.clone());
    }

    let body = serde_json::json!({ "model": model, "messages": messages });
    match broker.chat_completion_stream(&provider, &model, &session_id, body) {
        Ok(events) => {
            for ev in events {
                if let Some(delta) = ev.delta {
                    writer.notify(
                        "chat/provider_chunk",
                        serde_json::json!({ "streamId": stream_id, "delta": delta }),
                    )?;
                }
                if let Some(finish) = ev.finish {
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
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::os::unix::net::UnixStream;
    use std::time::{Duration, Instant};

    use everyaios_ipc::frame;
    use everyaios_vault::{KeySpec, KeyStatus, Usage, UsageRow};

    fn temp_dir(tag: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!("everyaios-core-chat-{tag}-{}", std::process::id()))
    }

    fn temp_vault(tag: &str) -> (std::path::PathBuf, Vault) {
        let dir = temp_dir(tag);
        let _ = std::fs::remove_dir_all(&dir);
        let path = dir.join("vault.db");
        let vault = Vault::open(&path, "test-key").expect("open vault");
        (dir, vault)
    }

    fn pair() -> (UnixStream, UnixStream) {
        UnixStream::pair().expect("socketpair")
    }

    fn link_from(a: UnixStream) -> SidecarLink<UnixStream, UnixStream> {
        let reader = a.try_clone().expect("clone");
        SidecarLink::new(a, reader)
    }

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
            })
            .unwrap();
        let vault = Arc::new(Mutex::new(vault));
        let (a, _b) = pair();
        let relay = ChatRelay::new(link_from(a), vault, |_| {});

        let err = relay
            .start_stream(ChatStreamParams {
                session_id: "s-over".into(),
                stream_id: "st-1".into(),
                text: "hi".into(),
                surface: None,
                agent_id: None,
                provider: "nvidia".into(),
                model: "m".into(),
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
                stream_id: "st-1".into(),
                text: "hi".into(),
                surface: None,
                agent_id: None,
                provider: "nvidia".into(),
                model: "m".into(),
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

    #[test]
    fn relay_forwards_plan_interrupt_notifications() {
        // Stage-0 (P6.3): a `chat/interrupt` notification from the coordinator
        // arrives as a ChatWireEvent::Interrupt — the H2 MCQ card payload.
        let (a, b) = pair();
        let side = std::thread::spawn(move || {
            let mut s = b;
            while let Ok(Some(payload)) = frame::decode(&mut s) {
                let v: serde_json::Value = serde_json::from_slice(&payload).unwrap_or_default();
                if v.get("method").and_then(|m| m.as_str()) == Some("plan/execute") {
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
        assert!(matches!(evs[1], ChatWireEvent::PlanDone { ref plan_id, tasks_done: 2, error: None, .. } if plan_id == "p1"));
        side.join().unwrap();
    }

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
                stream_id: "st-1".into(),
                text: "x".into(),
                surface: None,
                agent_id: None,
                provider: "nvidia".into(),
                model: "m".into(),
            })
            .expect("start_stream (1.99 < 2.00 pre-flight passes)");

        assert!(
            wait_events(&events, 2, Duration::from_secs(5)),
            "expected Done+BudgetExceeded, got {:?}",
            events.lock().unwrap_or_else(|x| x.into_inner())
        );
        let evs = events.lock().unwrap_or_else(|x| x.into_inner());
        assert!(matches!(evs[0], ChatWireEvent::Done { .. }));
        assert!(matches!(
            evs[1],
            ChatWireEvent::BudgetExceeded { ref session_id, spent, .. }
                if session_id == "s-kill" && spent >= 2.01
        ));
        // The next turn is refused at pre-flight.
        let err = relay
            .start_stream(ChatStreamParams {
                session_id: "s-kill".into(),
                stream_id: "st-2".into(),
                text: "again".into(),
                surface: None,
                agent_id: None,
                provider: "nvidia".into(),
                model: "m".into(),
            })
            .unwrap_err();
        assert!(matches!(err, ChatRelayError::BudgetExceeded { .. }));
        side.join().unwrap();
        let _ = std::fs::remove_dir_all(&dir);
    }

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
        let (_dir, vault) = temp_vault("scheduler");
        let vault = Arc::new(Mutex::new(vault));
        let relay = ChatRelay::new(link_from(a), vault, |_| {});
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
}
