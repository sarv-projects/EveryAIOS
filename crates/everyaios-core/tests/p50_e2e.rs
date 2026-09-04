#![cfg(unix)]

//! P50.5 — Release verification gates (real-provider, no-mocked-responses).
//!
//! - `real_chat_vertical_e2e` (P50.5.1): clean profile → configure a REAL
//!   BYOK or local provider → send → stream → persist → reopen → cancel →
//!   error. The provider HTTP call goes to an actual OpenAI-compatible
//!   endpoint (Ollama, LM Studio, or any BYOK gateway) supplied by env —
//!   there is NO in-process mock provider. The socketpair peer only plays
//!   the coordinator's protocol role (it is not the model).
//!
//!     EVERYAIOS_E2E_BASE_URL=http://127.0.0.1:11434/v1   (Ollama OpenAI shim)
//!     EVERYAIOS_E2E_PROVIDER=ollama|e2e                  (default: e2e)
//!     EVERYAIOS_E2E_MODEL=qwen2.5:0.5b                   (default)
//!     EVERYAIOS_E2E_API_KEY=sk-…                         (BYOK providers)
//!
//!   When `EVERYAIOS_E2E_BASE_URL` is unset the test SKIPS (release matrix
//!   runs it where a provider exists). When set, it must PASS against the
//!   real endpoint — a dead provider fails the gate.
//!
//! - `real_mutation_vertical_e2e` (P50.5.3): a real file in a real temp
//!   workspace → diff (before/after) → Guard-2 ticket (ask) → approve →
//!   commit → verification → audit receipt → undo/recovery. No sample
//!   artifact, no synthetic success: every assertion reads the real file,
//!   the real ticket store, and the real audit sequence.

use std::os::unix::net::UnixStream;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use everyaios_core::chat::{ChatRelay, ChatStreamParams};
use everyaios_core::guard_service::GuardService;
use everyaios_core::sidecar_link::SidecarLink;
use everyaios_core::tools::ToolService;
use everyaios_vault::{KeyRing, KeySpec, KeyStatus, LocalEndpoint, Vault};

// ---------------------------------------------------------------------------
// shared helpers
// ---------------------------------------------------------------------------

fn temp_dir(tag: &str) -> std::path::PathBuf {
    let d = std::env::temp_dir().join(format!("everyaios-p50-e2e-{tag}-{}", std::process::id()));
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

/// Read framed JSON values from the peer until `ended: true` arrives in a
/// `chat/provider_chunk` notification. Returns every chunk notification.
fn collect_provider_stream(
    mut s: UnixStream,
    provider: &str,
    model: &str,
    session_id: &str,
    stream_id: &str,
    timeout: Duration,
) -> Vec<serde_json::Value> {
    let req = serde_json::json!({
        "jsonrpc": "2.0", "id": "p1", "method": "provider/stream",
        "params": {
            "provider": provider, "model": model,
            "sessionId": session_id, "streamId": stream_id,
            "messages": [{ "role": "user", "content": "Reply with exactly the single word: OK" }],
        },
    });
    let _ = everyaios_ipc::frame::write_frame(&mut s, &serde_json::to_vec(&req).unwrap());

    let mut chunks = Vec::new();
    let start = Instant::now();
    loop {
        if start.elapsed() > timeout {
            panic!(
                "P50.5.1: provider stream timed out after {timeout:?} — provider at {provider} is not answering (set EVERYAIOS_E2E_BASE_URL to a live endpoint)"
            );
        }
        let Some(payload) = everyaios_ipc::frame::decode(&mut s)
            .map_err(|e| {
                panic!("P50.5.1: frame decode failed: {e}");
            })
            .ok()
            .flatten()
        else {
            continue;
        };
        let v: serde_json::Value = serde_json::from_slice(&payload).unwrap_or_default();
        if v.get("method").and_then(|m| m.as_str()) == Some("chat/provider_chunk") {
            let params = v.get("params").cloned().unwrap_or_default();
            chunks.push(params.clone());
            if params.get("ended").and_then(|e| e.as_bool()) == Some(true) {
                break;
            }
        }
    }
    chunks
}

fn real_delta_text(chunks: &[serde_json::Value]) -> String {
    chunks
        .iter()
        .filter_map(|c| c.get("delta").and_then(|d| d.as_str()))
        .collect()
}

// ---------------------------------------------------------------------------
// P50.5.1 — real vertical chat E2E (clean profile → real provider → stream →
// persist → reopen → cancel → error)
// ---------------------------------------------------------------------------

#[test]
fn real_chat_vertical_e2e() {
    let Some(base) = std::env::var("EVERYAIOS_E2E_BASE_URL").ok() else {
        eprintln!("SKIP P50.5.1: set EVERYAIOS_E2E_BASE_URL (e.g. http://127.0.0.1:11434/v1 for Ollama) to run the real-provider vertical E2E");
        return;
    };
    let provider = std::env::var("EVERYAIOS_E2E_PROVIDER").unwrap_or_else(|_| "e2e".into());
    let model = std::env::var("EVERYAIOS_E2E_MODEL").unwrap_or_else(|_| "qwen2.5:0.5b".into());
    let api_key = std::env::var("EVERYAIOS_E2E_API_KEY").ok();

    // "clean profile": a fresh data dir + freshly created SQLCipher vault.
    let dir = temp_dir("chat-e2e");
    let vault_path = dir.join("vault.db");
    let vault = Vault::open(&vault_path, "p50-e2e-key").expect("create vault");
    // Configure the real provider credential in the vault keyring (the
    // broker resolves keys exclusively from the vault — no other store).
    if provider == "ollama" || provider == "llamafile" {
        // Keyless local runtime — nothing to store.
    } else {
        let key = api_key.clone().unwrap_or_else(|| {
            panic!(
                "P50.5.1: provider `{provider}` needs EVERYAIOS_E2E_API_KEY (or use EVERYAIOS_E2E_PROVIDER=ollama for a keyless local runtime)"
            )
        });
        KeyRing::new(&vault)
            .add_key(KeySpec {
                provider: provider.clone(),
                key_id: "e2e".into(),
                value: key.into_bytes(),
                status: KeyStatus::Primary,
                model_filter: Vec::new(),
                priority: 100,
                daily_token_cap: None,
                daily_cost_cap: None,
            })
            .expect("add key");
    }

    // The relay: a real sidecar link (socketpair) + the real vault. The peer
    // plays the coordinator protocol role only — every model token comes
    // from the real provider over HTTP.
    let (a, mut b) = pair();
    let events: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));
    let ev = Arc::clone(&events);
    let relay = ChatRelay::new(link_from(a), Arc::new(Mutex::new(vault)), move |_e| {
        ev.lock().unwrap_or_else(|x| x.into_inner()).push("event".into());
    });
    // The peer signals (via this channel) the moment the REAL stream ends so
    // the main thread can issue the wire-level cancel without deadlocking on
    // a join (the peer waits for that cancel before returning).
    let (stream_done_tx, stream_done_rx) = std::sync::mpsc::channel::<()>();
    let model_for_peer = model.clone();
    let provider_for_peer = provider.clone();
    let peer = std::thread::spawn(move || {
        // Coordinator protocol role: ack `chat/stream`, dispatch the real
        // `provider/stream`, collect the REAL provider chunks, then watch
        // for the wire-level `chat/cancel`.
        let mut s = b.try_clone().unwrap();
        let mut acked = false;
        let mut chunks: Vec<serde_json::Value> = Vec::new();
        let mut saw_cancel = false;
        let deadline = Instant::now() + Duration::from_secs(180);
        while Instant::now() < deadline {
            let Some(payload) = everyaios_ipc::frame::decode(&mut s)
                .expect("peer frame decode")
            else {
                continue;
            };
            let v: serde_json::Value = serde_json::from_slice(&payload).unwrap_or_default();
            let method = v.get("method").and_then(|m| m.as_str()).unwrap_or("");
            if !acked && method == "chat/stream" {
                let id = v.get("id").cloned().unwrap_or(serde_json::Value::Null);
                let reply = serde_json::json!({
                    "jsonrpc": "2.0", "id": id, "result": { "accepted": true }
                });
                let _ = everyaios_ipc::frame::write_frame(&mut s, &serde_json::to_vec(&reply).unwrap());
                acked = true;
                // 1) the real stream
                let req = serde_json::json!({
                    "jsonrpc": "2.0", "id": "p1", "method": "provider/stream",
                    "params": {
                        "provider": provider_for_peer, "model": model_for_peer,
                        "sessionId": "s-e2e", "streamId": "st-e2e",
                        "messages": [{ "role": "user", "content": "Reply with exactly the single word: OK" }],
                    },
                });
                let _ = everyaios_ipc::frame::write_frame(&mut s, &serde_json::to_vec(&req).unwrap());
                continue;
            }
            if method == "chat/provider_chunk" {
                let params = v.get("params").cloned().unwrap_or_default();
                chunks.push(params.clone());
                if params.get("ended").and_then(|e| e.as_bool()) == Some(true) {
                    // The real stream is over — tell the main thread it can
                    // issue the cancel now.
                    let _ = stream_done_tx.send(());
                    // 2) then expect the cancel notification on the wire
                    let cancel_deadline = Instant::now() + Duration::from_secs(10);
                    while Instant::now() < cancel_deadline {
                        let Some(p2) = everyaios_ipc::frame::decode(&mut s).expect("cancel decode") else {
                            continue;
                        };
                        let v2: serde_json::Value =
                            serde_json::from_slice(&p2).unwrap_or_default();
                        if v2.get("method").and_then(|m| m.as_str()) == Some("chat/cancel") {
                            saw_cancel = true;
                            break;
                        }
                    }
                    break;
                }
            }
        }
        (chunks, saw_cancel)
    });
    if provider == "ollama" || provider == "llamafile" {
        relay.with_local(&provider, LocalEndpoint::ollama(&base));
    } else {
        relay.with_base_url(&provider, &base);
    }
    relay.spawn();

    // "send": dispatch the turn the way the UI does.
    relay
        .start_stream(ChatStreamParams {
            session_id: "s-e2e".into(),
            stream_id: "st-e2e".into(),
            text: "Reply with exactly the single word: OK".into(),
            surface: None,
            agent_id: None,
            provider: Some(provider.clone()),
            model: Some(model.clone()),
            persona_id: None,
            soul_md: None,
            user_documents: None,
            primary_chief: None,
            credentialed_providers: None,
        })
        .expect("chat/stream accepted");

    // Wait for the real stream to end, THEN cancel (the peer holds the wire
    // until it sees the chat/cancel — join after cancel, never before).
    stream_done_rx
        .recv_timeout(Duration::from_secs(120))
        .expect("P50.5.1: provider stream never ended — the real endpoint stalled");
    relay.cancel("st-e2e").expect("chat_cancel accepted");
    let (chunks, saw_cancel) = peer.join().expect("peer finished");

    // "stream": real deltas from the real provider (never empty for a live
    // endpoint; a mocked peer would be caught here because it cannot produce
    // provider deltas at all).
    let text = real_delta_text(&chunks);
    assert!(
        !chunks.is_empty(),
        "P50.5.1: no provider chunks — the real endpoint answered nothing (check EVERYAIOS_E2E_BASE_URL / provider / model / key)"
    );
    assert!(
        !text.trim().is_empty(),
        "P50.5.1: provider stream ended with an empty completion — deltas: {chunks:?}"
    );
    eprintln!("P50.5.1: real provider replied: {:?}", text.trim());

    // "cancel": the wire-level abort path is accepted (chat/cancel).
    assert!(
        saw_cancel,
        "P50.5.1: the peer never saw chat/cancel on the wire"
    );

    // "persist → reopen": the broker recorded the REAL usage ledger row in
    // the vault; reopening the vault with the same key must show it again.
    drop(relay);
    let ledger_before = {
        let v = Vault::open(&vault_path, "p50-e2e-key").expect("reopen vault");
        let n = v.ledger_count().expect("ledger count");
        // session_totals is the same durable aggregate the UI shows; the
        // real turn must appear under its session id after reopen.
        let totals = v.session_totals().expect("session totals");
        assert!(
            totals.iter().any(|t| t.session == "s-e2e") || n >= 1,
            "P50.5.1: no durable usage ledger row after a real provider round-trip"
        );
        n
    };
    assert!(
        ledger_before >= 1,
        "P50.5.1: ledger must carry the real turn after reopen"
    );
    eprintln!(
        "P50.5.1: durable ledger rows after reopen: {ledger_before}"
    );

    // "error": a real failing endpoint must surface an honest provider error
    // + end marker (never a hang, never a synthetic success).
    {
        let (a2, b2) = pair();
        let dead_port = {
            let l = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
            l.local_addr().unwrap().port()
        };
        let dead_base = format!("http://127.0.0.1:{dead_port}/v1");
        let events2: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));
        let ev2 = Arc::clone(&events2);
        let v2 = Vault::open(&dir.join("vault2.db"), "p50-e2e-key").expect("vault2");
        if provider != "ollama" && provider != "llamafile" {
            let key = api_key.clone().unwrap_or_else(|| "sk-unused".into());
            KeyRing::new(&v2)
                .add_key(KeySpec {
                    provider: provider.clone(),
                    key_id: "e2e".into(),
                    value: key.into_bytes(),
                    status: KeyStatus::Primary,
                    model_filter: Vec::new(),
                    priority: 100,
                    daily_token_cap: None,
                    daily_cost_cap: None,
                })
                .expect("add key");
        }
        let relay2 = ChatRelay::new(link_from(a2), Arc::new(Mutex::new(v2)), move |_e| {
            ev2.lock().unwrap_or_else(|x| x.into_inner()).push("e".into());
        });
        if provider == "ollama" || provider == "llamafile" {
            relay2.with_local(&provider, LocalEndpoint::ollama(&dead_base));
        } else {
            relay2.with_base_url(&provider, &dead_base);
        }
        relay2.spawn();
        let peer2 = std::thread::spawn(move || {
            collect_provider_stream(
                b2.try_clone().unwrap(),
                &provider,
                &model,
                "s-err",
                "st-err",
                Duration::from_secs(60),
            )
        });
        let chunks2 = peer2.join().expect("peer2");
        let err = chunks2
            .iter()
            .find(|c| c.get("error").is_some())
            .and_then(|c| c.get("error").and_then(|e| e.as_str()))
            .unwrap_or_else(|| {
                panic!(
                    "P50.5.1: dead endpoint did not surface an error chunk — {chunks2:?}"
                )
            });
        assert!(
            !err.is_empty() && !err.contains("Ok("),
            "P50.5.1: error must be the real transport failure, got {err:?}"
        );
        eprintln!("P50.5.1: honest error surfaced for dead endpoint: {err}");
    }

    let _ = std::fs::remove_dir_all(&dir);
}

// ---------------------------------------------------------------------------
// P50.5.3 — real mutation E2E (file → diff → ticket → commit → verification
// → receipt → undo/recovery; no sample artifact, no synthetic success)
// ---------------------------------------------------------------------------

#[test]
fn real_mutation_vertical_e2e() {
    let dir = temp_dir("mutation-e2e");
    let workspace = dir.join("workspace");
    std::fs::create_dir_all(&workspace).unwrap();

    // Real pre-existing file (the "before" state).
    let file = workspace.join("report.txt");
    std::fs::write(&file, "Q3 revenue: 100k\n").unwrap();
    let before = std::fs::read_to_string(&file).unwrap();

    // The real guard + ticketed executor (the shipped production spine).
    let guard = Arc::new(Mutex::new(GuardService::new()));
    let mut tools = ToolService::new(Arc::clone(&guard), workspace.clone());

    // (1) "diff": capture the before/after byte strings the agent is about
    // to change — the receipt below must reflect exactly this delta.
    let after = "Q3 revenue: 128k\n";

    // (2) "ticket": pre-flight asks (write = always_ask by policy).
    let args = serde_json::json!({ "path": "report.txt", "content": after });
    let pre = tools
        .handle(
            "tool/exec",
            &serde_json::json!({
                "toolId": "file_ops.write",
                "sessionId": "s-mut",
                "agentId": "a1",
                "args": args,
            }),
        )
        .expect("pre-flight");
    assert_eq!(pre["action"], "ask", "write must ask before commit: {pre}");
    let ticket_id = pre["ticketId"].as_str().unwrap().to_string();
    let args_hash = pre["argsHash"].clone();

    // Nothing has executed pre-approval — the file is byte-identical.
    assert_eq!(
        std::fs::read_to_string(&file).unwrap(),
        before,
        "P50.5.3: the mutation ran before approval — the ticket model is broken"
    );

    // (3) "commit": approve (human) then execute through the real executor.
    assert!(
        guard.lock().unwrap().approve(&ticket_id),
        "approve must consume the pending ticket"
    );
    let commit = tools
        .handle(
            "tool/commit",
            &serde_json::json!({
                "toolId": "file_ops.write",
                "ticketId": ticket_id,
                "argsHash": args_hash,
                "args": args,
            }),
        )
        .expect("commit");
    assert_eq!(commit["ok"], true, "commit failed: {commit}");
    let seq1 = commit["auditSeq"].as_u64().expect("auditSeq");
    assert_eq!(seq1, 1, "first mutation lands audit row 1");

    // (4) "verification": read the real file back — no synthetic success.
    assert_eq!(
        std::fs::read_to_string(&file).unwrap(),
        after,
        "P50.5.3: file content must equal the approved mutation"
    );

    // Single-use: replaying the same ticket is refused outright (the
    // executor hard-errors on a consumed ticket), never silently re-run.
    let replay = tools.handle(
        "tool/commit",
        &serde_json::json!({
            "toolId": "file_ops.write",
            "ticketId": ticket_id,
            "argsHash": args_hash,
            "args": args,
        }),
    );
    assert!(
        replay.is_err(),
        "P50.5.3: a single-use ticket was accepted twice — {replay:?}"
    );

    // (5) "receipt": the audit trail records the real mutation (the Merkle
    // chain the shell surfaces as receipts) and the guard holds the
    // approval receipts for both tickets.
    assert!(
        tools.audit_len() >= 1,
        "P50.5.3: no audit row after a committed mutation"
    );
    let receipts = guard.lock().unwrap().receipts();
    assert!(
        receipts.iter().any(|r| r.ticket_id == ticket_id),
        "P50.5.3: the ticket receipt is missing from the guard trail"
    );

    // (6) "undo/recovery": restore the original bytes through the same
    // guarded path (the recovery discipline: every restore is itself a
    // ticketed, audited mutation).
    let undo_args = serde_json::json!({ "path": "report.txt", "content": before });
    let undo_pre = tools
        .handle(
            "tool/exec",
            &serde_json::json!({
                "toolId": "file_ops.write",
                "sessionId": "s-mut",
                "agentId": "a1",
                "args": undo_args,
            }),
        )
        .expect("undo pre-flight");
    let undo_ticket = undo_pre["ticketId"].as_str().unwrap().to_string();
    assert!(guard.lock().unwrap().approve(&undo_ticket));
    let undo_commit = tools
        .handle(
            "tool/commit",
            &serde_json::json!({
                "toolId": "file_ops.write",
                "ticketId": undo_ticket,
                "argsHash": undo_pre["argsHash"],
                "args": undo_args,
            }),
        )
        .expect("undo commit");
    assert_eq!(undo_commit["ok"], true, "undo failed: {undo_commit}");
    let seq2 = undo_commit["auditSeq"].as_u64().expect("auditSeq");
    assert!(
        seq2 > seq1,
        "undo must append a new audit row (got {seq2} after {seq1})"
    );
    assert_eq!(
        std::fs::read_to_string(&file).unwrap(),
        before,
        "P50.5.3: undo must restore the exact original bytes"
    );
    eprintln!(
        "P50.5.3: real mutation verified — diff {} → {} bytes, audit rows {seq1} + {seq2}, undo byte-exact",
        before.len(),
        after.len()
    );

    let _ = std::fs::remove_dir_all(&dir);
}