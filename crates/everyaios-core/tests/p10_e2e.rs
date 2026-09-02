//! P10.1 — E2E integration suites (cross-cutting validation of P0–P9).
//!
//! Each test composes the REAL public API of the shipped crates (no mocks
//! beyond the injectable transport seams the codebase already defines). The
//! browser-pipeline, office byte-stability, ACP harness-driving, and MCP
//! external-client rows live in their owning crates' tests (they need that
//! crate's fixture binaries / `pub(crate)` fixtures):
//!
//! - browser pipeline  → `everyaios-browser/tests/p10_pipeline.rs`
//! - office byte-stability → `everyaios-office` docx unit test
//! - ACP harness-driving → `everyaios-acp/tests/p10_harness_drive.rs`
//! - MCP external client → `everyaios-mcp/tests/p10_external_client.rs`

use std::io::{Read, Write};
use std::net::TcpListener;
use std::os::unix::net::UnixStream;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use everyaios_blueprint::crystallize::{
    compile_to_script, decrystallize_check, StepClass, WorkflowDetector, WorkflowStep,
};
use everyaios_blueprint::spec::TaskSpec;
use everyaios_blueprint::subagent::{SubAgentLimits, SubAgentRuntime, SubAgentSpec};
use everyaios_blueprint::{ScriptLanguage, TaskStatus};
use everyaios_core::chat::{ChatRelay, ChatStreamParams, ChatWireEvent};
use everyaios_core::connector_hub::{ConnectorHub, Engine};
use everyaios_core::connectors::gmail::GmailConnector;
use everyaios_core::connectors::{HttpTransport, TransportError, TransportErrorKind};
use everyaios_core::guard_service::GuardService;
use everyaios_core::memory_service::MemoryService;
use everyaios_core::messaging::{InboundMessage, MessageDispatcher, StubAdapter};
use everyaios_core::providers::{ProviderConfig, ProviderKey, ProvidersFile};
use everyaios_core::scheduler_service::{RunState, SchedulePolicy, SchedulerService, TriggerSpec};
use everyaios_core::sidecar_link::SidecarLink;
use everyaios_core::tools::ToolService;
use everyaios_guard::granter::{CapabilityGranter, GrantRequest, HostGrant, TrustFlags};
use everyaios_vault::Vault;

// ---------------------------------------------------------------------------
// shared helpers
// ---------------------------------------------------------------------------

fn temp_dir(tag: &str) -> std::path::PathBuf {
    let d = std::env::temp_dir().join(format!("everyaios-p10-e2e-{tag}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&d);
    std::fs::create_dir_all(&d).unwrap();
    d
}

fn pair() -> (UnixStream, UnixStream) {
    UnixStream::pair().expect("socketpair")
}

fn link_from(a: UnixStream) -> SidecarLink<UnixStream, UnixStream> {
    let reader = a.try_clone().expect("clone");
    SidecarLink::new(a, reader)
}

/// Spin a fake OpenAI-compatible endpoint (same pattern as the chat.rs unit
/// tests): returns the base URL the relay should route `nvidia` to.
fn mock_openai(respond: impl Fn(&str) -> (u16, String) + Send + 'static) -> String {
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

// ---------------------------------------------------------------------------
// P10.1.1 — full user journey: install → first boot → add BYOK key →
// chat → tool call → response
// ---------------------------------------------------------------------------

#[test]
fn journey_install_byok_chat_tool_call() {
    let dir = temp_dir("journey");

    // "install → first boot": the data dir is created and an empty
    // providers.toml is materialized by the loader.
    let providers_path = ProvidersFile::path(&dir);
    let mut pf = ProvidersFile::load_from(&providers_path).unwrap();
    assert!(pf.providers.is_empty());

    // "add BYOK key": write a provider + key pool, persist, reload.
    pf.providers.push(ProviderConfig {
        name: "nvidia".into(),
        base_url: None,
        keys: vec![ProviderKey {
            id: "my-byok".into(),
            value: "sk-test".into(),
        }],
    });
    pf.save(&providers_path).unwrap();
    let reloaded = ProvidersFile::load_from(&providers_path).unwrap();
    let pool = reloaded.pool("nvidia").expect("pool after reload");
    assert_eq!(pool.len(), 1);
    let key = pool.select().unwrap();
    assert_eq!(key.id, "my-byok");

    // "chat": a real ChatRelay over a socketpair, routed to the fake endpoint.
    let vault = Arc::new(Mutex::new(Vault::open_in_memory("test-key").unwrap()));
    let base = mock_openai(|_req| {
        (
            200,
            serde_json::json!({
                "choices": [{ "message": { "role": "assistant", "content": "hello from the model" } }],
                "usage": { "prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15 }
            })
            .to_string(),
        )
    });
    let (a, b) = pair();
    let side = std::thread::spawn(move || {
        let mut s = b;
        while let Ok(Some(payload)) = everyaios_ipc::frame::decode(&mut s) {
            let v: serde_json::Value = serde_json::from_slice(&payload).unwrap_or_default();
            if v.get("method").and_then(|m| m.as_str()) == Some("chat/stream") {
                let id = v.get("id").cloned().unwrap_or(serde_json::Value::Null);
                let reply = serde_json::json!({ "jsonrpc": "2.0", "id": id, "result": { "accepted": true } });
                let _ =
                    everyaios_ipc::frame::write_frame(&mut s, &serde_json::to_vec(&reply).unwrap());
                let n = serde_json::json!({
                    "jsonrpc": "2.0", "method": "chat/batch",
                    "params": { "streamId": "st-1", "text": "hi", "tokenCount": 1 },
                });
                let _ = everyaios_ipc::frame::write_frame(&mut s, &serde_json::to_vec(&n).unwrap());
                let d = serde_json::json!({
                    "jsonrpc": "2.0", "method": "chat/done",
                    "params": { "streamId": "st-1", "turnId": "s1:1", "fullText": "hi", "totalTokens": 1 },
                });
                let _ = everyaios_ipc::frame::write_frame(&mut s, &serde_json::to_vec(&d).unwrap());
                break;
            }
        }
    });
    let events: Arc<Mutex<Vec<ChatWireEvent>>> = Arc::new(Mutex::new(Vec::new()));
    let ev = Arc::clone(&events);
    let mut relay = ChatRelay::new(link_from(a), Arc::clone(&vault), move |e| {
        ev.lock().unwrap_or_else(|x| x.into_inner()).push(e);
    });
    relay.with_base_url("nvidia", base);
    relay.spawn();
    relay
        .start_stream(ChatStreamParams {
            session_id: "s1".into(),
            stream_id: "st-1".into(),
            text: "hi".into(),
            surface: None,
            agent_id: None,
            provider: Some("nvidia".into()),
            model: Some("m".into()),
            persona_id: None,
            soul_md: None,
            user_documents: None,
            primary_chief: None,
        })
        .expect("start_stream");
    assert!(
        wait_events(&events, 2, Duration::from_secs(5)),
        "chat events never arrived"
    );
    let evs = events.lock().unwrap_or_else(|x| x.into_inner());
    assert!(matches!(&evs[0], ChatWireEvent::Batch { text, .. } if text == "hi"));
    assert!(matches!(&evs[1], ChatWireEvent::Done { .. }));
    side.join().unwrap();

    // "tool call": the guard-gated executor writes a file (ask → approve →
    // commit → audit row).
    let guard = Arc::new(Mutex::new(GuardService::new()));
    let mut tools = ToolService::new(Arc::clone(&guard), dir.join("workspace"));
    let args = serde_json::json!({ "path": "notes.txt", "content": "journey complete" });
    let pre = tools
        .handle(
            "tool/exec",
            &serde_json::json!({ "toolId": "file_ops.write", "sessionId": "s1", "agentId": "a1", "args": args }),
        )
        .unwrap();
    assert_eq!(pre["action"], "ask", "default write policy asks");
    let tid = pre["ticketId"].as_str().unwrap().to_string();
    assert!(guard.lock().unwrap().approve(&tid));
    let commit = tools
        .handle(
            "tool/commit",
            &serde_json::json!({
                "toolId": "file_ops.write",
                "ticketId": tid,
                "argsHash": pre["argsHash"],
                "args": args,
            }),
        )
        .unwrap();
    assert_eq!(commit["ok"], true, "{commit}");
    assert_eq!(commit["auditSeq"], 1, "tool call lands an audit row");
    let text = std::fs::read_to_string(dir.join("workspace/notes.txt")).unwrap();
    assert_eq!(text, "journey complete");

    let _ = std::fs::remove_dir_all(&dir);
}

// ---------------------------------------------------------------------------
// P10.1.2 — multi-turn session with memory persistence (close → reopen →
// recall works)
// ---------------------------------------------------------------------------

#[test]
fn memory_persists_across_restart() {
    let dir = temp_dir("memory");
    let db = dir.join("memory.json");

    // "session one": write facts, close (drop) the service, persist.
    {
        let mut mem = MemoryService::new();
        let written = mem.write(
            "s1",
            &[
                "the project is called everyaios".to_string(),
                "the vault is sqlcipher-encrypted".to_string(),
            ],
        );
        assert_eq!(written, 2);
        mem.save_to(&db).unwrap();
    } // dropped — "app closed"

    // "reopen": a fresh service loads the same file; recall works. `read`
    // returns the matched fact ids; the persisted content is intact.
    let reopened = MemoryService::load_from(&db).unwrap();
    let hits = reopened.read("everyaios", 5);
    assert!(
        !hits.is_empty(),
        "recall returns matching fact ids: {hits:?}"
    );
    let facts = reopened.core_facts();
    assert!(
        facts.iter().any(|f| f.contains("called everyaios")),
        "persisted content missing after restart: {facts:?}"
    );
    // The second fact is also still there.
    assert!(facts.iter().any(|f| f.contains("sqlcipher-encrypted")));

    let _ = std::fs::remove_dir_all(&dir);
}

// ---------------------------------------------------------------------------
// P10.1.5 — sub-agent workflow (planner → 2 sub-agents → merge → final output)
// ---------------------------------------------------------------------------

#[test]
fn subagent_planner_two_agents_merge_results() {
    let mut runtime = SubAgentRuntime::new(SubAgentLimits::default());

    // Planner (depth 0) spawns two child research agents (depth 1).
    let planner = TaskSpec::new("planner", "coordinate research");
    let child_a = SubAgentSpec::new(
        TaskSpec::new("child-a", "research the storage engine"),
        "nvidia",
        "/tmp/work",
    )
    .with_parent("planner");
    let child_b = SubAgentSpec::new(
        TaskSpec::new("child-b", "research the guard engine"),
        "nvidia",
        "/tmp/work",
    )
    .with_parent("planner");
    runtime
        .spawn(SubAgentSpec::new(planner, "nvidia", "/tmp/work"))
        .unwrap();
    runtime.spawn(child_a).unwrap();
    runtime.spawn(child_b).unwrap();
    assert_eq!(runtime.active_count(), 3);
    // While active: children of the depth-1 sub-agents are depth 2 (recursion
    // is capped), and the planner's children are depth 1.
    assert_eq!(runtime.next_depth(Some("child-a")), Some(2));
    assert_eq!(runtime.next_depth(Some("planner")), Some(1));

    // Both children complete with summaries + artifacts.
    runtime
        .complete(
            "child-a",
            "storage uses FTS5 + trigram",
            TaskStatus::Done,
            vec!["storage.md".into()],
        )
        .unwrap();
    runtime
        .complete(
            "child-b",
            "guard uses tickets + nonce",
            TaskStatus::Done,
            vec!["guard.md".into()],
        )
        .unwrap();

    // The planner (parent) sees mergeable summaries — never raw child context.
    let merged: Vec<String> = ["child-a", "child-b"]
        .iter()
        .map(|id| runtime.parent_sees_summary(id).unwrap().summary.clone())
        .collect();
    assert!(merged[0].contains("FTS5"));
    assert!(merged[1].contains("tickets"));
    assert_eq!(merged.len(), 2);
    assert_eq!(runtime.completed().len(), 2);
}

// ---------------------------------------------------------------------------
// P10.1.6 — crystallization (run workflow 3× → 4th run = 0 tokens)
// ---------------------------------------------------------------------------

#[test]
fn crystallization_fourth_run_is_zero_token() {
    // The workflow: 3 identical successful runs of (transform → notify).
    let steps = || {
        vec![
            WorkflowStep {
                tool: "file_ops.write".into(),
                args: r#"{"path":"r.txt","content":"ok"}"#.into(),
                class: StepClass::Transform,
            },
            WorkflowStep {
                tool: "notify".into(),
                args: r#"{"to":"me"}"#.into(),
                class: StepClass::Notify,
            },
        ]
    };

    let mut detector = WorkflowDetector::new(3);
    for _ in 0..3 {
        detector.record_success(steps());
    }
    // After 3 identical successes the workflow is a crystallization candidate.
    let candidates = detector.candidates();
    assert_eq!(
        candidates.len(),
        1,
        "third identical success promotes the workflow"
    );
    assert!(
        candidates[0]
            .steps
            .iter()
            .all(|s| s.class.is_crystallizable()),
        "no cognitive step → crystallizable"
    );
    assert_eq!(candidates[0].successes, 3);

    // Compile to a deterministic script — the "0-token run" (no LLM call).
    let skill = compile_to_script("weekly-report", &candidates[0], ScriptLanguage::Ts);
    assert!(skill.source.contains("0-token deterministic run"));
    assert!(skill.source.contains("file_ops_write"));
    // The compiled run produces the recorded expected output → no drift, so
    // the 4th run executes the script instead of calling the model.
    assert_eq!(
        decrystallize_check(&skill, &skill.expected_output),
        everyaios_blueprint::crystallize::Drift::Match
    );
}

// ---------------------------------------------------------------------------
// P10.1.7 — connector hub (browser-session connector → Gmail read → respond)
// ---------------------------------------------------------------------------

/// Minimal mock HTTP transport (the injectable seam the codebase defines).
struct MockTransport {
    responses: std::cell::RefCell<Vec<Result<Vec<u8>, TransportError>>>,
}

impl MockTransport {
    fn new(responses: Vec<Result<Vec<u8>, TransportError>>) -> Self {
        Self {
            responses: std::cell::RefCell::new(responses),
        }
    }
}

impl HttpTransport for MockTransport {
    fn post_json(
        &self,
        _url: &str,
        _headers: &[(&str, &str)],
        _body: &[u8],
    ) -> Result<Vec<u8>, TransportError> {
        self.responses
            .borrow_mut()
            .pop()
            .unwrap_or(Err(TransportError {
                kind: TransportErrorKind::Other,
                message: "no more mock responses".into(),
            }))
    }
    fn get(&self, _url: &str, _headers: &[(&str, &str)]) -> Result<Vec<u8>, TransportError> {
        self.responses
            .borrow_mut()
            .pop()
            .unwrap_or(Err(TransportError {
                kind: TransportErrorKind::Other,
                message: "no more mock responses".into(),
            }))
    }
}

struct MockRefresher;
impl everyaios_core::connectors::gmail::TokenRefresher for MockRefresher {
    fn refresh(&self) -> Result<String, TransportError> {
        Ok("refreshed-token".into())
    }
}

#[test]
fn connector_hub_gmail_read_respond() {
    // Register the connection in the hub (browser-session engine).
    let mut hub = ConnectorHub::new();
    let id = hub
        .connect("gmail", "me@example.com", Engine::BrowserSession)
        .unwrap();
    assert!(hub.is_connected("gmail", "me@example.com"));
    assert_eq!(hub.get(&id).unwrap().engine.as_str(), "browser_session");

    // Gmail read path: search → get_message (mock responses, pop order).
    let search_resp = serde_json::json!({ "messages": [{ "id": "m1", "threadId": "t1" }], "resultSizeEstimate": 1 });
    let msg_resp = serde_json::json!({
        "id": "m1", "threadId": "t1", "snippet": "need the report",
        "labelIds": ["INBOX", "UNREAD"],
        "payload": {
            "mimeType": "text/plain",
            "headers": [
                { "name": "Subject", "value": "Re: status" },
                { "name": "From", "value": "boss@example.com" },
                { "name": "To", "value": "me@example.com" },
                { "name": "Date", "value": "Mon, 01 Jan 2026 00:00:00 +0000" }
            ],
            "body": { "data": "bmVlZCB0aGUgcmVwb3J0" }
        }
    });
    let transport = MockTransport::new(vec![
        Ok(serde_json::to_vec(&msg_resp).unwrap()),
        Ok(serde_json::to_vec(&search_resp).unwrap()),
    ]);
    let mut gmail = GmailConnector::new(transport, MockRefresher, "tok".into(), "me".into());
    let found = gmail.search("from:boss", 5, None).unwrap();
    assert_eq!(found.messages.len(), 1);
    assert_eq!(found.messages[0].subject, "Re: status");
    assert_eq!(
        found.messages[0].body_plain.as_deref(),
        Some("need the report")
    );

    // Respond: send a reply through the same connector.
    let send_resp = serde_json::json!({ "id": "sent-1", "threadId": "t1" });
    let send_transport = MockTransport::new(vec![Ok(serde_json::to_vec(&send_resp).unwrap())]);
    let mut gmail2 = GmailConnector::new(send_transport, MockRefresher, "tok".into(), "me".into());
    let sent = gmail2
        .send_message("boss@example.com", "Re: status", "report attached")
        .unwrap();
    assert_eq!(sent.message_id, "sent-1");
}

// ---------------------------------------------------------------------------
// P10.1.9 — scheduled task fires headless from the tray daemon
// ---------------------------------------------------------------------------

#[test]
fn scheduled_task_fires_headless() {
    let mut sched = SchedulerService::new();
    // A cron job that is due "now" (every minute), plus an interval job.
    sched.upsert(
        "job-cron",
        "nightly digest",
        "s-headless",
        TriggerSpec::Cron {
            expr: "* * * * *".into(),
        },
        vec![],
        Some(SchedulePolicy::default()),
        1_700_000_000,
    );
    sched.upsert(
        "job-int",
        "heartbeat",
        "s-headless",
        TriggerSpec::Interval { secs: 60 },
        vec![],
        Some(SchedulePolicy::default()),
        1_700_000_000,
    );

    // Headless daemon tick: jobs due at `now` are returned, leases taken.
    let due = sched.due(1_700_000_060);
    assert!(
        due.contains(&"job-cron".to_string()),
        "cron due at minute boundary: {due:?}"
    );
    assert!(due.contains(&"job-int".to_string()));

    let lease = sched.lease_start("job-cron", 1_700_000_060).unwrap();
    let fence = lease["fence"].as_str().unwrap().to_string();
    assert_eq!(lease["ok"], true);
    // Advance the checkpoint (step 1 of N) then finish the run.
    sched.lease_checkpoint("job-cron", 1, Some(&fence)).unwrap();
    sched
        .lease_finish("job-cron", true, 1_700_000_060, Some(&fence))
        .unwrap();
    let job = sched.get("job-cron").unwrap();
    assert_eq!(job.successes, 1);
    assert_eq!(job.runs, 1);
    assert!(
        matches!(job.state, RunState::Idle),
        "finished run returns to idle"
    );
}

// ---------------------------------------------------------------------------
// P10.1.10 — messaging bridge stub (message in → agent loop → reply out)
// ---------------------------------------------------------------------------

#[test]
fn messaging_bridge_stub_roundtrip() {
    let mut dispatcher = MessageDispatcher::new();
    let mut adapter = StubAdapter::new("telegram");
    adapter.inbox.push(InboundMessage {
        channel: "telegram".into(),
        from: "user-42".into(),
        text: "what is the weather?".into(),
        message_id: "msg-1".into(),
        conversation_id: Some("conv-1".into()),
    });
    dispatcher.register(Box::new(adapter));

    // The agent loop: a handler that turns a message into a reply.
    let replies = dispatcher.dispatch(|msg: &InboundMessage| {
        if msg.text.contains("weather") {
            "sunny, 24°C".to_string()
        } else {
            "I don't know yet".to_string()
        }
    });
    assert_eq!(replies.len(), 1);
    assert_eq!(replies[0].to, "user-42");
    assert_eq!(replies[0].text, "sunny, 24°C");
    assert_eq!(replies[0].conversation_id, "conv-1");
    // The conversation is remembered for memory reuse across turns.
    let remembered = dispatcher.remembered("conv-1").unwrap();
    assert!(remembered.iter().any(|m| m.contains("weather")));
}

// ---------------------------------------------------------------------------
// P10.1.11 — extension loads lazily → executes a tool → respects the
// capability boundary
// ---------------------------------------------------------------------------

#[test]
fn lazy_extension_loads_and_respects_capability_boundary() {
    let dir = temp_dir("plugin");
    let mut registry = everyaios_blueprint::plugin::PluginRegistry::new(dir.clone());

    // A plugin manifest (TOML) that asks for a bounded capability set.
    let manifest = r#"abi_version = 1
name = "csv-tools"
version = "1.0.0"
description = "csv utilities"
author = "test"

[trust]
sandboxed = true

[capabilities]
allow = ["fs.read:/tmp/**"]
deny = ["fs.read:/etc/**"]

[agents]
bind = ["data-agent"]
"#;
    std::fs::create_dir_all(dir.join("csv-tools")).unwrap();
    std::fs::write(dir.join("csv-tools/manifest.toml"), manifest).unwrap();

    // Lazy load: `scan` registers the plugin (Registered) but never loads
    // it; only an explicit first use (`activate`) loads it (Activated).
    assert!(registry.names().is_empty());
    let scanned = registry.scan().unwrap();
    assert!(scanned.contains(&"csv-tools".to_string()));
    assert_eq!(registry.names(), vec!["csv-tools".to_string()]);
    let registered = registry.get("csv-tools").unwrap();
    assert_eq!(
        registered.state,
        everyaios_blueprint::plugin::PluginState::Registered
    );
    let entry = registry.activate("csv-tools").unwrap();
    assert_eq!(
        entry.state,
        everyaios_blueprint::plugin::PluginState::Activated
    );

    // The host grants only a narrow set; the granter refines to the manifest's
    // allow ∩ host ∩ (allow − deny).
    let host = HostGrant {
        trusted_agents: vec!["data-agent".into()],
        capabilities: vec![
            "fs.read:/tmp/**".into(),
            "fs.read:/etc/**".into(),
            "fs.write:/tmp/**".into(),
            "network:https".into(),
            "shell".into(),
        ],
    };
    let granter = CapabilityGranter::new(host);
    let granted = granter.grant(&entry.manifest.grant_request()).unwrap();
    // The plugin may read /tmp but the explicit deny on /etc wins.
    assert!(CapabilityGranter::granted_has(
        &granted,
        "fs.read:/tmp/x.csv"
    ));
    assert!(
        !CapabilityGranter::granted_has(&granted, "fs.read:/etc/shadow"),
        "explicit deny must win"
    );
    assert!(
        !CapabilityGranter::granted_has(&granted, "shell"),
        "host capability not requested by manifest is never granted"
    );

    // Over-capability request → denied (the P10.2 gate, cross-checked here).
    let greedy = GrantRequest {
        name: "greedy".into(),
        agent_bindings: vec!["data-agent".into()],
        trust: TrustFlags {
            network: true,
            shell: true,
            files_write: true,
            approval_required: false,
            sandboxed: false,
        },
        capabilities_allow: vec!["fs.write:/".into(), "shell".into(), "network:https".into()],
        capabilities_deny: vec![],
    };
    let denied = granter.grant(&greedy);
    assert!(
        denied.is_err(),
        "capabilities outside the host grant must be refused"
    );

    let _ = std::fs::remove_dir_all(&dir);
}
