//! P1.8 (A5/B5) — local runtime tests (mock ollama / llamafile endpoints).

use super::*;
use crate::broker::Broker;
use crate::ledger::Usage;
use crate::Vault;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::thread;

fn vault() -> &'static Vault {
    Box::leak(Box::new(Vault::open_in_memory("test-key").unwrap()))
}

/// Robust mock HTTP server: reads headers + Content-Length body, calls
/// `respond` with the raw request, writes `(status, body)` back.
fn mock_server(respond: impl Fn(&str) -> (u16, String) + Send + 'static) -> String {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let addr = listener.local_addr().unwrap();
    thread::spawn(move || {
        for stream in listener.incoming() {
            let Ok(mut s) = stream else { continue };
            // Read until Content-Length is satisfied — a request can split
            // across TCP segments (the oauth mock-server lesson).
            let mut req = String::new();
            let mut buf = [0u8; 4096];
            let mut header_end = None;
            loop {
                let n = match s.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => n,
                    Err(_) => break,
                };
                req.push_str(&String::from_utf8_lossy(&buf[..n]));
                if let Some(pos) = req.find("\r\n\r\n") {
                    header_end = Some(pos);
                    break;
                }
            }
            let Some(pos) = header_end else { continue };
            let content_length = req[..pos].lines().find_map(|l| {
                let lower = l.to_ascii_lowercase();
                lower
                    .strip_prefix("content-length:")
                    .and_then(|v| v.trim().parse::<usize>().ok())
            });
            while let Some(cl) = content_length {
                if req.len().saturating_sub(pos + 4) >= cl {
                    break;
                }
                let n = match s.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => n,
                    Err(_) => break,
                };
                req.push_str(&String::from_utf8_lossy(&buf[..n]));
            }
            let (code, body) = respond(&req);
            let reason = if code == 429 {
                "Too Many Requests"
            } else {
                "OK"
            };
            let resp = format!(
                "HTTP/1.1 {code} {reason}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.len(),
                body
            );
            let _ = s.write_all(resp.as_bytes());
        }
    });
    format!("http://{addr}")
}

/// Parse the JSON body out of a raw HTTP request (headers are before the
/// first blank line). GBNF strings contain quotes — structural parsing beats
/// raw substring matching.
fn body_of(req: &str) -> serde_json::Value {
    let body = req.split("\r\n\r\n").nth(1).unwrap_or("");
    serde_json::from_str(body).expect("request body must be JSON")
}

const GBNF: &str = "root ::= (\"{\" ws \"tool\" ws \":\" ws string ws \"}\") ws ::= ([ \\t\\n]*) string ::= \"\\\"\" ([^\"\\\\] | \\\\.)* \"\\\"\"";

// ---- grammar_from_body unit tests ----------------------------------------

#[test]
fn grammar_from_body_plain_string_is_gbnf() {
    let body = serde_json::json!({ "grammar": GBNF });
    assert_eq!(grammar_from_body(&body), Grammar::Gbnf(GBNF.to_string()));
}

#[test]
fn grammar_from_body_object_forms() {
    assert_eq!(
        grammar_from_body(&serde_json::json!({ "grammar": { "type": "json" } })),
        Grammar::Json
    );
    assert_eq!(
        grammar_from_body(&serde_json::json!({ "grammar": { "type": "gbnf", "value": "x ::= \"a\"" } })),
        Grammar::Gbnf("x ::= \"a\"".to_string())
    );
    let schema = serde_json::json!({ "type": "object" });
    assert_eq!(
        grammar_from_body(&serde_json::json!({ "grammar": { "type": "json_schema", "value": schema } })),
        Grammar::JsonSchema(schema)
    );
}

#[test]
fn grammar_from_body_tools_defaults_to_json() {
    // B5: a local tool call without an explicit grammar gets JSON-mode
    // grammar so invalid tool-call JSON is structurally impossible.
    assert_eq!(
        grammar_from_body(&serde_json::json!({ "tools": [{ "name": "weather" }] })),
        Grammar::Json
    );
    // Explicit grammar wins over the tools default.
    assert_eq!(
        grammar_from_body(&serde_json::json!({
            "tools": [{ "name": "weather" }],
            "grammar": GBNF,
        })),
        Grammar::Gbnf(GBNF.to_string())
    );
    // Plain chat: no constraint.
    assert_eq!(grammar_from_body(&serde_json::json!({})), Grammar::None);
}

// ---- ollama /api/chat -----------------------------------------------------

#[test]
fn ollama_stream_gbnf_falls_back_to_json_format_and_records_usage_keyless() {
    // B5 on ollama (verified live on 0.21.1): raw GBNF in `format` 500s, so a
    // GBNF request falls back to `format: "json"` (still a logit-layer
    // grammar — output is guaranteed valid JSON). The num_ctx floor (16,384)
    // rides along, and the call works with NO key in the ring.
    let base = mock_server(|req| {
        assert!(req.contains("/api/chat"), "path: {req}");
        assert!(!req.contains("Authorization"), "local must be keyless: {req}");
        let b = body_of(req);
        assert_eq!(b["format"].as_str(), Some("json"), "gbnf must fall back to json: {b}");
        assert_eq!(b["options"]["num_ctx"].as_u64(), Some(16_384), "no num_ctx: {b}");
        assert_eq!(b["stream"].as_bool(), Some(true), "{b}");
        assert!(b.get("stream_options").is_none(), "{b}");
        (
            200,
            concat!(
                "{\"message\":{\"content\":\"{\\\"tool\\\":\\\"weather\\\"\"},\"done\":false}\n",
                "{\"message\":{\"content\":\"}\"},\"done\":false}\n",
                "{\"done\":true,\"prompt_eval_count\":14,\"eval_count\":7}\n",
            )
            .into(),
        )
    });
    let vault = vault();
    let broker = Broker::new(vault)
        .with_local("ollama", LocalEndpoint::ollama(base))
        .with_policy(crate::keyring::RoutingPolicy::Priority);

    let events = broker
        .chat_completion_stream(
            "ollama",
            "qwen3:4b",
            "s1",
            serde_json::json!({
                "messages": [{ "role": "user", "content": "weather Paris" }],
                "grammar": GBNF,
            }),
        )
        .unwrap();

    let text: String = events.iter().filter_map(|e| e.delta.clone()).collect();
    assert_eq!(text, "{\"tool\":\"weather\"}");
    let usage = events.iter().find_map(|e| e.usage).unwrap();
    assert_eq!(usage.prompt, 14);
    assert_eq!(usage.output, 7);
    // Ledger row + zero $ cost (tokens count, local is free).
    assert_eq!(vault.ledger_count().unwrap(), 1);
    assert_eq!(vault.session_spend("s1").unwrap(), 0.0);
}

#[test]
fn ollama_json_schema_passthrough() {
    // Ollama's native grammar API IS JSON schema — `format` takes the schema
    // object directly (no 500 like raw GBNF).
    let schema = serde_json::json!({
        "type": "object",
        "properties": { "tool": { "type": "string" } },
        "required": ["tool"],
    });
    let schema_for_assert = schema.clone();
    let base = mock_server(move |req| {
        let b = body_of(req);
        assert_eq!(b["format"], schema_for_assert, "json schema passthrough: {b}");
        (200, "{\"done\":true}".into())
    });
    let vault = vault();
    let broker = Broker::new(vault).with_local("ollama", LocalEndpoint::ollama(base));
    broker
        .chat_completion_stream(
            "ollama",
            "qwen3:4b",
            "s1",
            serde_json::json!({
                "messages": [{ "role": "user", "content": "x" }],
                "grammar": { "type": "json_schema", "value": schema },
            }),
        )
        .unwrap();
}

#[test]
fn ollama_tool_call_without_grammar_gets_json_format() {
    let base = mock_server(|req| {
        let b = body_of(req);
        assert_eq!(b["format"].as_str(), Some("json"), "expected json format: {b}");
        (200, "{\"done\":true}".into())
    });
    let vault = vault();
    let broker = Broker::new(vault).with_local("ollama", LocalEndpoint::ollama(base));
    broker
        .chat_completion_stream(
            "ollama",
            "qwen3:4b",
            "s1",
            serde_json::json!({
                "messages": [{ "role": "user", "content": "x" }],
                "tools": [{ "name": "weather" }],
            }),
        )
        .unwrap();
}

#[test]
fn ollama_non_stream_returns_content_and_usage() {
    let base = mock_server(|req| {
        let b = body_of(req);
        assert_eq!(b["stream"].as_bool(), Some(false), "non-stream must be stream:false: {b}");
        (
            200,
            r#"{"message":{"role":"assistant","content":"hello"},"done":true,"prompt_eval_count":5,"eval_count":2}"#
                .into(),
        )
    });
    let vault = vault();
    let broker = Broker::new(vault).with_local("ollama", LocalEndpoint::ollama(base));
    let resp = broker
        .chat_completion(
            "ollama",
            "qwen3:4b",
            "s1",
            serde_json::json!({ "messages": [{ "role": "user", "content": "hi" }] }),
        )
        .unwrap();
    assert_eq!(resp["message"]["content"].as_str(), Some("hello"));
    assert_eq!(vault.ledger_count().unwrap(), 1);
    assert_eq!(vault.session_spend("s1").unwrap(), 0.0);
}

// ---- llamafile / llama.cpp server -----------------------------------------

#[test]
fn llamafile_stream_uses_native_grammar_field() {
    // llama.cpp's /v1/chat/completions takes raw GBNF in `grammar` — the
    // native (non-passthrough) GBNF path. Streaming is OpenAI SSE.
    let sse = concat!(
        "data: {\"choices\":[{\"delta\":{\"content\":\"{\\\"tool\\\":\\\"w\"},\"finish_reason\":null}]}\n",
        "data: {\"choices\":[{\"delta\":{\"content\":\"eather\\\"}\"},\"finish_reason\":null}]}\n",
        "data: {\"choices\":[],\"usage\":{\"prompt_tokens\":10,\"completion_tokens\":5,\"total_tokens\":15}}\n",
        "data: [DONE]\n",
    );
    let base = mock_server(move |req| {
        assert!(req.contains("/v1/chat/completions"), "path: {req}");
        let b = body_of(req);
        assert_eq!(b["grammar"].as_str(), Some(GBNF), "no grammar field: {b}");
        assert_eq!(b["stream"].as_bool(), Some(true), "{b}");
        (200, sse.into())
    });
    let vault = vault();
    let broker = Broker::new(vault).with_local("llamafile", LocalEndpoint::llamafile(base));
    let events = broker
        .chat_completion_stream(
            "llamafile",
            "qwen2.5-0.5b.llamafile",
            "s1",
            serde_json::json!({
                "messages": [{ "role": "user", "content": "weather" }],
                "grammar": GBNF,
            }),
        )
        .unwrap();
    let text: String = events.iter().filter_map(|e| e.delta.clone()).collect();
    assert_eq!(text, "{\"tool\":\"weather\"}");
    // Usage parsed from the OpenAI SSE shape.
    let usage: Usage = events.iter().find_map(|e| e.usage).unwrap();
    assert_eq!(usage.prompt, 10);
    assert_eq!(usage.output, 5);
    assert_eq!(vault.ledger_count().unwrap(), 1);
}

#[test]
fn llamafile_json_schema_uses_response_format() {
    let base = mock_server(|req| {
        let b = body_of(req);
        assert_eq!(
            b["response_format"]["type"].as_str(),
            Some("json_schema"),
            "expected json_schema response_format: {b}"
        );
        (200, "{\"usage\":{\"total_tokens\":3}}".into())
    });
    let vault = vault();
    let broker = Broker::new(vault).with_local("llamafile", LocalEndpoint::llamafile(base));
    broker
        .chat_completion(
            "llamafile",
            "m.llamafile",
            "s1",
            serde_json::json!({
                "messages": [],
                "grammar": { "type": "json_schema", "value": { "type": "object" } },
            }),
        )
        .unwrap();
}

// ---- LIVE test (B5): real ollama, GBNF grammar → valid JSON always --------
// Run with `EVERYAIOS_LIVE_TEST=1 cargo test -p everyaios-vault --lib \
// local::tests::live_ollama_gbnf_tool_call_yields_valid_json -- --ignored`
// (requires a running ollama + a pulled model, default qwen3:4b).
#[test]
#[ignore = "live: needs ollama + a pulled model (EVERYAIOS_LIVE_TEST=1)"]
fn live_ollama_gbnf_tool_call_yields_valid_json() {
    if std::env::var("EVERYAIOS_LIVE_TEST").as_deref() != Ok("1") {
        eprintln!("skipped: set EVERYAIOS_LIVE_TEST=1 to run the live ollama test");
        return;
    }
    let model =
        std::env::var("EVERYAIOS_LIVE_MODEL").unwrap_or_else(|_| "qwen3:4b".to_string());
    let host = std::env::var("OLLAMA_HOST")
        .unwrap_or_else(|_| "http://127.0.0.1:11434".to_string());

    // Strict JSON-object grammar: {"tool":"…","args":{"city":"…"}}. At the
    // logit-sampling layer the model CANNOT emit anything else (B5).
    let gbnf = concat!(
        "root ::= \"{\" ws \"\\\"tool\\\"\" ws \":\" ws string ws \",\" ws ",
        "\"\\\"args\\\"\" ws \":\" ws \"{\" ws \"\\\"city\\\"\" ws \":\" ws ",
        "string ws \"}\" ws \"}\"\n",
        "ws ::= ([ \\t\\n] | \\r)*\n",
        "string ::= \"\\\"\" ([^\"\\\\] | \\\\ .)* \"\\\"\"\n",
    );

    let vault = vault();
    let broker = Broker::new(vault).with_local(
        "ollama",
        LocalEndpoint::ollama(&host).with_num_ctx(16_384),
    );
    let events = broker
        .chat_completion_stream(
            "ollama",
            &model,
            "live-s1",
            serde_json::json!({
                "messages": [{
                    "role": "user",
                    "content": "Call the weather tool for Paris. Reply with ONLY the tool call JSON.",
                }],
                "tools": [{ "name": "weather", "description": "weather by city" }],
                "grammar": gbnf,
            }),
        )
        .expect("live ollama round-trip");

    let text: String = events.iter().filter_map(|e| e.delta.clone()).collect();
    // B5's promise: the output is ALWAYS valid JSON (logit-layer grammar).
    // On ollama the GBNF request becomes `format: "json"`, so the shape is
    // guaranteed JSON even if the exact fields vary by model.
    let parsed: serde_json::Value =
        serde_json::from_str(text.trim()).expect("grammar-enforced output must be valid JSON");
    assert!(parsed.is_object(), "output: {text}");
    eprintln!("LIVE PASS: ollama tool call → valid JSON: {text}");
}

// ---- fail-closed / budget -------------------------------------------------

#[test]
fn unregistered_local_provider_fails_closed() {
    let vault = vault();
    let broker = Broker::new(vault); // no local endpoints registered
    let err = broker
        .chat_completion_stream("ollama", "m", "s1", serde_json::json!({}))
        .unwrap_err();
    assert!(matches!(err, BrokerError::UnknownProvider(_)));
}

#[test]
fn local_stream_surfaces_http_error() {
    let base = mock_server(|_| (500, "boom".into()));
    let vault = vault();
    let broker = Broker::new(vault).with_local("ollama", LocalEndpoint::ollama(base));
    let err = broker
        .chat_completion_stream("ollama", "m", "s1", serde_json::json!({}))
        .unwrap_err();
    assert!(matches!(err, BrokerError::Http(500, _)));
}
