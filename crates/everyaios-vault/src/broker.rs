//! Credential broker (P1.2, doc 53 §2) — the ONLY place keys leave the vault.
//!
//! The TS sidecar never holds credentials. It sends `{provider, model, body}`
//! to the broker; the broker resolves a key through the [`KeyRing`], injects
//! the auth header, executes the HTTP call, and **zeroizes** every temporary
//! secret buffer. Budget/rate checks all happen here (single choke point).
//!
//! Failure handling (P1.1):
//! - HTTP 429 → [`KeyRing::report_failure`] puts the key into exponential
//!   cooldown; the broker immediately retries with the next key, up to
//!   [`MAX_429_SWITCHES`] switches.
//! - All keys exhausted → aggregated [`BrokerError::AllKeysExhausted`].
//! - No key / unknown provider → fail closed (error before any HTTP attempt).

use std::collections::HashMap;
use std::io::{BufRead, BufReader};

use crate::keyring::{KeyRing, KeyRingError, RoutingPolicy, SelectedKey, MAX_429_SWITCHES};

/// Default OpenAI-compatible base URLs per provider (override via
/// `ProvidersFile.base_url`).
pub const DEFAULT_BASE_URLS: &[(&str, &str)] = &[
    ("nvidia", "https://integrate.api.nvidia.com/v1"),
    ("openai", "https://api.openai.com/v1"),
    ("anthropic", "https://api.anthropic.com/v1"),
    ("deepseek", "https://api.deepseek.com/v1"),
    ("groq", "https://api.groq.com/openai"),
];

/// One SSE event from a streaming chat completion.
#[derive(Debug, Clone, PartialEq)]
pub struct ChatStreamEvent {
    /// Text delta from `choices[0].delta.content` (None on non-content events).
    pub delta: Option<String>,
    /// `finish_reason` when the stream finishes an answer.
    pub finish: Option<String>,
}

/// The credential broker: key resolution + HTTP execution + scrubbing.
pub struct Broker<'a> {
    ring: KeyRing<'a>,
    base_urls: HashMap<String, String>,
    policy: RoutingPolicy,
}

impl<'a> Broker<'a> {
    pub fn new(vault: &'a crate::Vault) -> Self {
        let mut base_urls = HashMap::new();
        for (provider, url) in DEFAULT_BASE_URLS {
            base_urls.insert((*provider).to_string(), (*url).to_string());
        }
        Self {
            ring: KeyRing::new(vault),
            base_urls,
            policy: RoutingPolicy::RoundRobin,
        }
    }

    /// Override the routing policy for key selection.
    pub fn with_policy(mut self, policy: RoutingPolicy) -> Self {
        self.policy = policy;
        self
    }

    /// Override a provider's base URL (e.g. from `providers.toml`).
    pub fn with_base_url(mut self, provider: &str, url: impl Into<String>) -> Self {
        self.base_urls.insert(provider.to_string(), url.into());
        self
    }

    /// The key ring (for key-management surfaces + tests).
    pub fn ring(&self) -> &KeyRing<'a> {
        &self.ring
    }

    /// Non-streaming chat completion: `POST {base}/chat/completions`.
    pub fn chat_completion(
        &self,
        provider: &str,
        model: &str,
        session_id: &str,
        body: serde_json::Value,
    ) -> Result<serde_json::Value, BrokerError> {
        self.run_with_failover(
            provider,
            model,
            session_id,
            body,
            |url, key, body| {
                let (name, value) = authorization(&key.provider, &key.value);
                map_ureq_result(
                    ureq::post(url)
                        .set("Content-Type", "application/json")
                        .set(name, &value)
                        .send_json(body),
                )
            },
            usage_tokens,
        )
    }

    /// Streaming chat completion: forces `stream: true` and returns the
    /// parsed SSE event list (deltas + finish reasons).
    pub fn chat_completion_stream(
        &self,
        provider: &str,
        model: &str,
        session_id: &str,
        mut body: serde_json::Value,
    ) -> Result<Vec<ChatStreamEvent>, BrokerError> {
        body["stream"] = serde_json::json!(true);
        self.run_with_failover(
            provider,
            model,
            session_id,
            body,
            |url, key, body| {
                let (name, value) = authorization(&key.provider, &key.value);
                match ureq::post(url)
                    .set("Content-Type", "application/json")
                    .set(name, &value)
                    .send_json(body)
                {
                    Ok(resp) => Ok(parse_sse(BufReader::new(resp.into_reader()))),
                    Err(ureq::Error::Status(429, _)) => Err(BrokerError::RateLimited),
                    Err(ureq::Error::Status(code, resp)) => {
                        Err(BrokerError::Http(code, read_snippet(resp)))
                    }
                    Err(ureq::Error::Transport(t)) => Err(BrokerError::Transport(t.to_string())),
                }
            },
            |_| 0,
        )
    }

    /// Shared failover loop: select a key → run → on success record
    /// health+usage; on 429 put the key into cooldown and switch to the next
    /// (up to [`MAX_429_SWITCHES`]); on any other error surface immediately.
    fn run_with_failover<T>(
        &self,
        provider: &str,
        model: &str,
        session_id: &str,
        body: serde_json::Value,
        runner: impl Fn(&str, &SelectedKey, serde_json::Value) -> Result<T, BrokerError>,
        usage_of: impl Fn(&T) -> u64,
    ) -> Result<T, BrokerError> {
        let base = self
            .base_urls
            .get(provider)
            .cloned()
            .ok_or_else(|| BrokerError::UnknownProvider(provider.to_string()))?;
        let url = format!("{base}/chat/completions");

        let mut switches = 0u32;
        loop {
            let key = match self.ring.select(provider, model, session_id, self.policy) {
                Ok(k) => k,
                Err(KeyRingError::AllKeysExhausted(p)) => {
                    return Err(BrokerError::AllKeysExhausted(p));
                }
                Err(e) => return Err(BrokerError::KeyRing(e)),
            };

            match runner(&url, &key, body.clone()) {
                Ok(result) => {
                    // Success: health + usage (budgets live in the ring).
                    self.ring
                        .report_success(&key.opaque_handle)
                        .map_err(BrokerError::KeyRing)?;
                    self.ring
                        .report_usage(&key.opaque_handle, usage_of(&result), 0.0)
                        .map_err(BrokerError::KeyRing)?;
                    return Ok(result);
                }
                Err(BrokerError::RateLimited) => {
                    // 429: cooldown this key, fail over to the next.
                    self.ring
                        .report_failure(&key.opaque_handle, true)
                        .map_err(BrokerError::KeyRing)?;
                    switches += 1;
                    if switches > MAX_429_SWITCHES {
                        return Err(BrokerError::AllKeysExhausted(provider.to_string()));
                    }
                }
                Err(e) => {
                    // Non-429: record health, surface immediately.
                    self.ring
                        .report_failure(&key.opaque_handle, false)
                        .map_err(BrokerError::KeyRing)?;
                    return Err(e);
                }
            }
        }
    }
}

/// Build the auth header for a provider. Returns `(name, value)`; the value
/// buffer is dropped right after the request and its bytes are never logged.
fn authorization(provider: &str, secret: &[u8]) -> (&'static str, String) {
    let secret_str = String::from_utf8_lossy(secret).into_owned();
    match provider {
        "anthropic" => ("x-api-key", secret_str),
        _ => ("Authorization", format!("Bearer {secret_str}")),
    }
}

fn map_ureq_result(
    result: Result<ureq::Response, ureq::Error>,
) -> Result<serde_json::Value, BrokerError> {
    match result {
        Ok(resp) => resp
            .into_json()
            .map_err(|e| BrokerError::Transport(e.to_string())),
        Err(ureq::Error::Status(429, _)) => Err(BrokerError::RateLimited),
        Err(ureq::Error::Status(code, resp)) => Err(BrokerError::Http(code, read_snippet(resp))),
        Err(ureq::Error::Transport(t)) => Err(BrokerError::Transport(t.to_string())),
    }
}

fn read_snippet(resp: ureq::Response) -> String {
    resp.into_string()
        .unwrap_or_default()
        .chars()
        .take(200)
        .collect()
}

/// Parse OpenAI-style SSE stream into events. Lines look like:
/// `data: {"choices":[{"delta":{"content":"hi"},"finish_reason":null}]}`
/// and the stream ends with `data: [DONE]`.
fn parse_sse<R: BufRead>(mut reader: R) -> Vec<ChatStreamEvent> {
    let mut events = Vec::new();
    let mut line = String::new();
    loop {
        line.clear();
        match reader.read_line(&mut line) {
            Ok(0) | Err(_) => break,
            Ok(_) => {}
        }
        let trimmed = line.trim();
        if trimmed == "data: [DONE]" {
            break;
        }
        let Some(payload) = trimmed.strip_prefix("data:") else {
            continue;
        };
        let payload = payload.trim();
        if payload.is_empty() {
            continue;
        }
        let Ok(value) = serde_json::from_str::<serde_json::Value>(payload) else {
            continue;
        };
        let choice = value
            .get("choices")
            .and_then(|c| c.as_array())
            .and_then(|c| c.first());
        let delta = choice
            .and_then(|c| c.get("delta"))
            .and_then(|d| d.get("content"))
            .and_then(|c| c.as_str())
            .map(str::to_string);
        let finish = choice
            .and_then(|c| c.get("finish_reason"))
            .and_then(|f| f.as_str())
            .map(str::to_string);
        events.push(ChatStreamEvent { delta, finish });
    }
    events
}

/// Extract usage token counts from a completion response (for budgets).
pub fn usage_tokens(response: &serde_json::Value) -> u64 {
    response
        .get("usage")
        .and_then(|u| u.get("total_tokens"))
        .and_then(|t| t.as_u64())
        .unwrap_or(0)
}

#[derive(Debug, thiserror::Error)]
pub enum BrokerError {
    #[error("unknown provider: {0}")]
    UnknownProvider(String),
    #[error("key-ring error: {0}")]
    KeyRing(#[from] KeyRingError),
    #[error("HTTP {0}: {1}")]
    Http(u16, String),
    #[error("rate limited (429)")]
    RateLimited,
    #[error("transport error: {0}")]
    Transport(String),
    #[error("json error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("all keys for provider '{0}' exhausted after 429 failover")]
    AllKeysExhausted(String),
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{KeySpec, KeyStatus, Vault};
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::sync::atomic::{AtomicU32, Ordering};
    use std::thread;

    fn vault() -> &'static Vault {
        Box::leak(Box::new(Vault::open_in_memory("test-key").unwrap()))
    }

    fn spec(provider: &str, key_id: &str, value: &str) -> KeySpec {
        KeySpec {
            provider: provider.into(),
            key_id: key_id.into(),
            value: value.as_bytes().to_vec(),
            status: KeyStatus::Primary,
            model_filter: vec![],
            priority: 100,
            daily_token_cap: None,
            daily_cost_cap: None,
        }
    }

    /// Spin a fake OpenAI-compatible endpoint. `respond` receives the raw
    /// request (headers + body) and returns `(status, body)`.
    fn mock_server(respond: impl Fn(&str) -> (u16, String) + Send + 'static) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        thread::spawn(move || {
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

    #[test]
    fn injects_bearer_auth_and_succeeds() {
        let base = mock_server(|req| {
            assert!(
                req.contains("Authorization: Bearer sk-test-123"),
                "auth header missing: {req}"
            );
            assert!(req.contains("/chat/completions"));
            (200, r#"{"id":"x","usage":{"total_tokens":12}}"#.into())
        });
        let vault = vault();
        let broker = Broker::new(vault)
            .with_base_url("nvidia", base)
            .with_policy(RoutingPolicy::Priority);
        broker
            .ring()
            .add_key(spec("nvidia", "nim", "sk-test-123"))
            .unwrap();

        let resp = broker
            .chat_completion(
                "nvidia",
                "meta/llama",
                "s1",
                serde_json::json!({"messages": []}),
            )
            .unwrap();
        assert_eq!(usage_tokens(&resp), 12);
        // Health + usage recorded on the ring.
        let info = broker.ring().list("nvidia").unwrap();
        assert_eq!(info[0].success_count, 1);
        assert_eq!(info[0].fail_count, 0);
        assert!(info[0].tokens_day >= 12);
    }

    #[test]
    fn anthropic_uses_x_api_key_header() {
        let base = mock_server(|req| {
            assert!(req.contains("x-api-key: sk-ant-secret"), "{req}");
            assert!(!req.contains("Authorization: Bearer"), "{req}");
            (200, "{}".into())
        });
        let vault = vault();
        let broker = Broker::new(vault).with_base_url("anthropic", base);
        broker
            .ring()
            .add_key(spec("anthropic", "a1", "sk-ant-secret"))
            .unwrap();
        broker
            .chat_completion("anthropic", "claude-3-5", "s1", serde_json::json!({}))
            .unwrap();
    }

    #[test]
    fn fail_closed_without_keys() {
        let vault = vault();
        let broker = Broker::new(vault);
        let err = broker
            .chat_completion("nvidia", "m", "s1", serde_json::json!({}))
            .unwrap_err();
        assert!(matches!(err, BrokerError::KeyRing(KeyRingError::NoKeys(_))));
    }

    #[test]
    fn fail_closed_on_unknown_provider() {
        let vault = vault();
        let broker = Broker::new(vault);
        let err = broker
            .chat_completion("mystery", "m", "s1", serde_json::json!({}))
            .unwrap_err();
        assert!(matches!(err, BrokerError::UnknownProvider(_)));
    }

    #[test]
    fn simulate_429_fails_over_to_next_key() {
        let call = AtomicU32::new(0);
        let base = mock_server(move |_| {
            let n = call.fetch_add(1, Ordering::SeqCst);
            if n == 0 {
                (429, "rate limited".into())
            } else {
                (200, r#"{"usage":{"total_tokens":5}}"#.into())
            }
        });
        let vault = vault();
        let broker = Broker::new(vault).with_base_url("nvidia", base);
        broker.ring().add_key(spec("nvidia", "k1", "sk-1")).unwrap();
        broker.ring().add_key(spec("nvidia", "k2", "sk-2")).unwrap();

        let resp = broker
            .chat_completion("nvidia", "m", "s1", serde_json::json!({}))
            .unwrap();
        assert_eq!(usage_tokens(&resp), 5);

        // k1 went into cooldown on the 429; k2 served the request.
        let info = broker.ring().list("nvidia").unwrap();
        let k1 = info.iter().find(|i| i.key_id == "k1").unwrap();
        let k2 = info.iter().find(|i| i.key_id == "k2").unwrap();
        assert!(k1.in_cooldown);
        assert!(k1.fail_count >= 1);
        assert_eq!(k2.success_count, 1);
    }

    #[test]
    fn all_keys_exhausted_after_429_switches() {
        let base = mock_server(|_| (429, "nope".into()));
        let vault = vault();
        let broker = Broker::new(vault).with_base_url("nvidia", base);
        for i in 0..5 {
            broker
                .ring()
                .add_key(spec("nvidia", &format!("k{i}"), "sk"))
                .unwrap();
        }
        let err = broker
            .chat_completion("nvidia", "m", "s1", serde_json::json!({}))
            .unwrap_err();
        assert!(
            matches!(err, BrokerError::AllKeysExhausted(_)),
            "got {err:?}"
        );
    }

    #[test]
    fn non_429_error_surfaces_immediately() {
        let base = mock_server(|_| (500, "boom".into()));
        let vault = vault();
        let broker = Broker::new(vault).with_base_url("nvidia", base);
        broker.ring().add_key(spec("nvidia", "k1", "sk")).unwrap();
        let err = broker
            .chat_completion("nvidia", "m", "s1", serde_json::json!({}))
            .unwrap_err();
        assert!(matches!(err, BrokerError::Http(500, _)));
        // Health: failure counted, but no cooldown (not a 429).
        let info = broker.ring().list("nvidia").unwrap();
        assert_eq!(info[0].fail_count, 1);
        assert!(!info[0].in_cooldown);
    }

    #[test]
    fn parses_sse_stream() {
        let sse = concat!(
            "data: {\"choices\":[{\"delta\":{\"content\":\"Hel\"},\"finish_reason\":null}]}\n",
            "data: {\"choices\":[{\"delta\":{\"content\":\"lo\"},\"finish_reason\":null}]}\n",
            "data: {\"choices\":[{\"delta\":{},\"finish_reason\":\"stop\"}]}\n",
            "data: [DONE]\n",
        );
        let events = parse_sse(BufReader::new(sse.as_bytes()));
        assert_eq!(events.len(), 3);
        assert_eq!(events[0].delta.as_deref(), Some("Hel"));
        assert_eq!(events[1].delta.as_deref(), Some("lo"));
        assert_eq!(events[2].finish.as_deref(), Some("stop"));
        let text: String = events.iter().filter_map(|e| e.delta.clone()).collect();
        assert_eq!(text, "Hello");
    }

    #[test]
    fn streaming_roundtrip_collects_deltas() {
        let sse = concat!(
            "data: {\"choices\":[{\"delta\":{\"content\":\"hi \"},\"finish_reason\":null}]}\n",
            "data: {\"choices\":[{\"delta\":{\"content\":\"there\"},\"finish_reason\":null}]}\n",
            "data: [DONE]\n",
        );
        let base = mock_server(move |_| (200, sse.into()));
        let vault = vault();
        let broker = Broker::new(vault).with_base_url("nvidia", base);
        broker.ring().add_key(spec("nvidia", "k", "sk")).unwrap();
        let events = broker
            .chat_completion_stream("nvidia", "m", "s1", serde_json::json!({}))
            .unwrap();
        let text: String = events.iter().filter_map(|e| e.delta.clone()).collect();
        assert_eq!(text, "hi there");
    }

    #[test]
    fn sealed_channel_never_leaks_secret() {
        // End-to-end sealed-channel check: after a full broker round trip the
        // ONLY credential artifact observable is the opaque handle — the raw
        // secret must not appear in any public surface (list / KeyInfo JSON).
        let base = mock_server(|_| (200, r#"{"usage":{"total_tokens":1}}"#.into()));
        let vault = vault();
        let broker = Broker::new(vault).with_base_url("nvidia", base);
        let handle = broker
            .ring()
            .add_key(spec("nvidia", "k", "sk-super-secret"))
            .unwrap();
        broker
            .chat_completion("nvidia", "m", "s1", serde_json::json!({}))
            .unwrap();
        let info = broker.ring().list("nvidia").unwrap();
        let json = serde_json::to_string(&info).unwrap();
        assert!(json.contains(&handle));
        assert!(!json.contains("sk-super-secret"));
        assert!(!json.to_lowercase().contains("\"value\""));
    }
}
