//! P1.8 (A5) — LocalManager tests.
//!
//! All HTTP-dependent tests share ONE mock ollama server (`mock_host`), so
//! parallel test execution can't race per-test mock-thread startups.

use super::*;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;

/// Serialize tests that touch the process-global `OLLAMA_HOST` env var.
static ENV_LOCK: Mutex<()> = Mutex::new(());

/// One shared mock ollama: `/api/tags` + `/api/show` (+ `/health` fallback).
static MOCK_HOST: OnceLock<String> = OnceLock::new();

fn mock_host() -> &'static str {
    MOCK_HOST.get_or_init(|| {
        let listener = Arc::new(TcpListener::bind("127.0.0.1:0").unwrap());
        let addr = listener.local_addr().unwrap();
        let host = format!("http://{addr}");
        let l2 = Arc::clone(&listener);
        thread::spawn(move || {
            for stream in l2.incoming() {
                let Ok(mut s) = stream else { continue };
                let mut buf = [0u8; 4096];
                let _ = s.read(&mut buf);
                let req = String::from_utf8_lossy(&buf[..]).to_string();
                let body = if req.contains("/api/tags") {
                    r#"{"models":[
                        {"name":"qwen3:4b","size":2497293931,"modified_at":"2026-07-07"},
                        {"name":"llama3.2:1b","size":1337000000,"modified_at":"2026-07-01"}
                    ]}"#
                } else if req.contains("/api/show") {
                    r#"{"model_info":{"general.context_length":32768,"llama.context_length":32768}}"#
                } else {
                    r#"{"status":"ok"}"#
                };
                let resp = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    body.len(),
                    body
                );
                let _ = s.write_all(resp.as_bytes());
            }
        });
        // Leak the Arc so the listener stays bound for the process lifetime.
        let _ = Arc::into_raw(listener);
        host
    })
}

fn cfg(host: &str) -> LocalConfig {
    LocalConfig {
        ollama_host: host.to_string(),
        ..Default::default()
    }
}

#[test]
fn ollama_running_detects_server() {
    let mgr = LocalManager::new(cfg(mock_host()));
    assert!(mgr.ollama_running(), "mock ollama should answer /api/tags");
}

#[test]
fn ollama_not_running_on_closed_port() {
    let _guard = ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    // Bind a port, grab the addr, drop the listener → nothing answers.
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let host = format!("http://{}", listener.local_addr().unwrap());
    drop(listener);
    let mgr = LocalManager::new(cfg(&host));
    assert!(!mgr.ollama_running());
}

#[test]
fn list_ollama_models_parses_tags_and_context() {
    let mgr = LocalManager::new(cfg(mock_host()));
    let models = mgr.list_ollama_models();
    assert_eq!(models.len(), 2);
    let qwen = models.iter().find(|m| m.name == "qwen3:4b").unwrap();
    assert_eq!(qwen.size_bytes, 2_497_293_931);
    // Effective context = min(model max 32768, forced num_ctx 16384).
    assert_eq!(qwen.context_window, 16_384);
    let llama = models.iter().find(|m| m.name == "llama3.2:1b").unwrap();
    assert_eq!(llama.context_window, 16_384);
}

#[test]
fn context_window_respects_configured_floor() {
    // num_ctx below the 15K warning floor — the UI must warn.
    let c = LocalConfig {
        ollama_host: mock_host().to_string(),
        num_ctx: 8_192,
        ..Default::default()
    };
    let mgr = LocalManager::new(c);
    let models = mgr.list_ollama_models();
    assert_eq!(models.len(), 2);
    assert_eq!(models[0].context_window, 8_192);
    assert!(models[0].context_window < 15_000);
}

#[test]
fn endpoint_for_maps_ollama_and_llamafile() {
    let mgr = LocalManager::new(cfg(mock_host()));
    let ollama = mgr.endpoint_for("ollama").expect("ollama endpoint");
    assert_eq!(ollama.base_url, mock_host());
    assert_eq!(ollama.runtime, everyaios_vault::LocalRuntime::Ollama);
    assert_eq!(ollama.num_ctx, 16_384);

    let lf = mgr.endpoint_for("llamafile").expect("llamafile endpoint");
    assert_eq!(lf.runtime, everyaios_vault::LocalRuntime::Llamafile);
    assert_eq!(
        lf.base_url,
        format!("http://127.0.0.1:{}", cfg("x").llamafile_port)
    );

    assert!(mgr.endpoint_for("openai").is_none());
}

#[test]
fn find_llamafile_scans_data_dir_bin() {
    let dir = std::env::temp_dir().join(format!("everyaios-llamafile-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    let bin_dir = dir.join("bin");
    std::fs::create_dir_all(&bin_dir).unwrap();
    let a = bin_dir.join("a.llamafile");
    let b = bin_dir.join("b.llamafile");
    std::fs::write(&a, b"#!/bin/sh").unwrap();
    std::fs::write(&b, b"#!/bin/sh").unwrap();

    let mgr = LocalManager::new(LocalConfig::default());
    let found = mgr.find_llamafile(&dir).expect("found a llamafile");
    // Sorted: `a.llamafile` first.
    assert_eq!(found, a);

    // Explicit config wins.
    let c = LocalConfig {
        llamafile_bin: Some(b.clone()),
        ..Default::default()
    };
    let mgr2 = LocalManager::new(c);
    assert_eq!(mgr2.find_llamafile(&dir).unwrap(), b);

    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn ollama_host_env_overrides_config() {
    let _guard = ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    std::env::set_var("OLLAMA_HOST", mock_host());
    let mgr = LocalManager::new(LocalConfig::default());
    assert_eq!(mgr.ollama_host(), mock_host());
    assert!(mgr.ollama_running());
    std::env::remove_var("OLLAMA_HOST");
}

#[test]
fn parse_host_port_defaults_and_explicit() {
    assert_eq!(
        parse_host_port("http://127.0.0.1:11434").unwrap(),
        ("127.0.0.1".into(), 11434)
    );
    assert_eq!(
        parse_host_port("http://127.0.0.1").unwrap(),
        ("127.0.0.1".into(), 11434)
    );
    assert!(parse_host_port("https://127.0.0.1").is_err());
}

#[test]
fn llamafile_healthy_probes_health_endpoint() {
    // A raw llama.cpp-style /health responder.
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    thread::spawn(move || {
        for stream in listener.incoming() {
            let Ok(mut s) = stream else { continue };
            let mut buf = [0u8; 1024];
            let _ = s.read(&mut buf);
            let body = "{\"status\":\"ok\"}";
            let resp = format!(
                "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.len(),
                body
            );
            let _ = s.write_all(resp.as_bytes());
        }
    });
    let mgr = LocalManager::new(LocalConfig::default());
    assert!(mgr.llamafile_healthy(port));
    assert!(!mgr.llamafile_healthy(1)); // closed port
}
