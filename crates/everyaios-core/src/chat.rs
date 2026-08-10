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

use everyaios_vault::{Broker, DEFAULT_SESSION_BUDGET_USD, Vault};

use crate::sidecar_link::{Inbound, SidecarLink, WriterHandle};

/// Wire events forwarded to the UI (Tauri emits a single `chat-event`).
#[derive(Debug, Clone, serde::Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ChatWireEvent {
    Ttft { stream_id: String, latency_ms: u64 },
    Batch { stream_id: String, text: String, token_count: u64 },
    Reasoning { stream_id: String, text: String },
    Stage { stream_id: String, stage: String },
    ToolCall { stream_id: String, tool_id: String },
    ToolResult { stream_id: String, tool_id: String },
    Done {
        stream_id: String,
        turn_id: String,
        full_text: String,
        total_tokens: u64,
    },
    Error { stream_id: String, code: String, message: String },
    Cancelled { stream_id: String },
    /// J11 kill surface: "stopped: $X limit".
    BudgetExceeded { session_id: String, limit: f64, spent: f64 },
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
    on_event: Arc<Mutex<Box<dyn Fn(ChatWireEvent) + Send>>>,
}

impl<W: Write + Send + 'static, R: Read + Send + 'static> ChatRelay<W, R> {
    pub fn new(
        link: SidecarLink<W, R>,
        vault: Arc<Mutex<Vault>>,
        on_event: impl Fn(ChatWireEvent) + Send + 'static,
    ) -> Self {
        Self {
            link,
            vault,
            sessions: Arc::new(Mutex::new(HashMap::new())),
            base_urls: Arc::new(Mutex::new(HashMap::new())),
            on_event: Arc::new(Mutex::new(Box::new(on_event))),
        }
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
                        std::thread::spawn(move || {
                            let _ = stream_provider(vault2, base2, params, w2);
                        });
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
        if ack.get("accepted").and_then(|a| a.as_bool()).unwrap_or(false) != true {
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
        self.link.writer().notify(
            "chat/cancel",
            serde_json::json!({ "streamId": stream_id }),
        )?;
        Ok(())
    }
}

fn emit(on_event: &Arc<Mutex<Box<dyn Fn(ChatWireEvent) + Send>>>, ev: ChatWireEvent) {
    on_event.lock().unwrap_or_else(|e| e.into_inner())(ev);
}

/// Run the broker for a coordinator `provider/stream` request and push the
/// deltas back as `chat/provider_chunk` notifications. Runs on its own thread;
/// keys never leave this process (the sidecar only sees chunk deltas).
fn stream_provider(
    vault: Arc<Mutex<Vault>>,
    base_urls: Arc<Mutex<HashMap<String, String>>>,
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

    fn wait_events(
        events: &Arc<Mutex<Vec<ChatWireEvent>>>,
        min: usize,
        timeout: Duration,
    ) -> bool {
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
            ChatRelayError::BudgetExceeded { session, limit, spent } => {
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
                    let reply =
                        serde_json::json!({ "jsonrpc": "2.0", "id": id, "result": { "accepted": true } });
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
        assert!(!evs.iter().any(|e| matches!(e, ChatWireEvent::BudgetExceeded { .. })));
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
                        u.get("completionTokens").and_then(|x| x.as_u64()).unwrap_or(0),
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
                    let reply =
                        serde_json::json!({ "jsonrpc": "2.0", "id": id, "result": { "accepted": true } });
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
                    loop {
                        let Ok(Some(payload)) = frame::decode(&mut s) else { break };
                        let v: serde_json::Value = serde_json::from_slice(&payload).unwrap_or_default();
                        if v.get("params").and_then(|p| p.get("ended")).and_then(|x| x.as_bool()) == Some(true) {
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
}
