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
use crate::ledger::{default_pricing, Pricing, Usage, UsageRow};
use crate::local::{self, LocalEndpoint};
use crate::oauth::{is_oauth_provider, OAuthManager};
use crate::session_budget::SessionBudget;
use crate::Vault;

/// Default OpenAI-compatible base URLs per provider (override via
/// `ProvidersFile.base_url`).
pub const DEFAULT_BASE_URLS: &[(&str, &str)] = &[
    ("nvidia", "https://integrate.api.nvidia.com/v1"),
    ("openai", "https://api.openai.com/v1"),
    ("anthropic", "https://api.anthropic.com/v1"),
    ("deepseek", "https://api.deepseek.com/v1"),
    ("groq", "https://api.groq.com/openai"),
    // P1.7 (A4): subscription accounts route through the same broker. The
    // stored OAuth tokens are injected as `Authorization: Bearer` by
    // `authorization()` (never `x-api-key`).
    ("chatgpt-pro", "https://chatgpt.com/backend-api/codex/v1"),
    ("copilot", "https://api.githubcopilot.com"),
    ("qwen", "https://portal.qwen.ai/v1"),
];

/// One SSE event from a streaming chat completion.
#[derive(Debug, Clone, PartialEq)]
pub struct ChatStreamEvent {
    /// Text delta from `choices[0].delta.content` (None on non-content events).
    pub delta: Option<String>,
    /// `finish_reason` when the stream finishes an answer.
    pub finish: Option<String>,
    /// Cache-aware usage observed on this chunk (P1.3/A9). OpenAI-compatible
    /// providers echo the full usage object in the final chunk when
    /// `stream_options.include_usage` was requested; Anthropic splits it
    /// (input/cache-write in `message_start`, output in `message_delta`).
    pub usage: Option<Usage>,
}

/// The credential broker: key resolution + HTTP execution + scrubbing +
/// cache-aware cost accounting (A9) + per-session budget (J11).
pub struct Broker<'a> {
    ring: KeyRing<'a>,
    /// Vault handle for the append-only `token_usage` ledger.
    vault: &'a Vault,
    base_urls: HashMap<String, String>,
    policy: RoutingPolicy,
    /// Per-provider pricing (defaults from [`default_pricing`]; override via
    /// [`Broker::with_pricing`]).
    pricing: HashMap<String, Pricing>,
    /// Per-session hard $ budget (J11, default $2.00).
    budget: SessionBudget,
    /// P1.7 (A4): when attached, an HTTP 401 on an oauth provider triggers a
    /// token refresh + one retry before the error surfaces (doc 33 §7.4
    /// token lifecycle; failover semantics stay identical to BYOK keys).
    oauth: Option<OAuthManager<'a>>,
    /// P1.8 (A5): keyless local endpoints (ollama / llamafile). When a
    /// provider is registered here the broker routes straight to the local
    /// runtime — no KeyRing selection, no auth header; usage still lands in
    /// the ledger + session budget (tokens count, $ is 0).
    local_endpoints: HashMap<String, LocalEndpoint>,
}

impl<'a> Broker<'a> {
    pub fn new(vault: &'a Vault) -> Self {
        let mut base_urls = HashMap::new();
        for (provider, url) in DEFAULT_BASE_URLS {
            base_urls.insert((*provider).to_string(), (*url).to_string());
        }
        let mut pricing = HashMap::new();
        for (provider, _) in DEFAULT_BASE_URLS {
            if let Some(p) = default_pricing(provider) {
                pricing.insert((*provider).to_string(), p);
            }
        }
        Self {
            ring: KeyRing::new(vault),
            vault,
            base_urls,
            policy: RoutingPolicy::RoundRobin,
            pricing,
            budget: SessionBudget::default_budget(),
            oauth: None,
            local_endpoints: HashMap::new(),
        }
    }

    /// Register a keyless local endpoint (P1.8/A5). Local providers bypass
    /// the key ring entirely — the machine owns the weights.
    pub fn with_local(mut self, provider: &str, endpoint: LocalEndpoint) -> Self {
        self.local_endpoints.insert(provider.to_string(), endpoint);
        self
    }

    /// Is `provider` served by a configured local runtime?
    pub fn is_local(&self, provider: &str) -> bool {
        self.local_endpoints.contains_key(provider)
    }

    /// The configured local endpoint for `provider`, if any.
    pub fn local_endpoint(&self, provider: &str) -> Option<&LocalEndpoint> {
        self.local_endpoints.get(provider)
    }

    /// Attach the OAuth manager so subscription accounts get 401→refresh→
    /// retry semantics (P1.7).
    pub fn with_oauth(mut self, oauth: OAuthManager<'a>) -> Self {
        self.oauth = Some(oauth);
        self
    }

    /// Override the per-1M-token pricing for a provider (A9).
    pub fn with_pricing(mut self, provider: &str, pricing: Pricing) -> Self {
        self.pricing.insert(provider.to_string(), pricing);
        self
    }

    /// Override the per-session $ budget limit (J11; default $2.00).
    pub fn with_session_budget_limit(mut self, limit: f64) -> Self {
        self.budget = SessionBudget::new(limit);
        self
    }

    /// Current session budget limit ($).
    pub fn session_budget_limit(&self) -> f64 {
        self.budget.limit()
    }

    /// $ spent so far by a session (in-memory tracker + ledger both record).
    pub fn session_spent(&self, session: &str) -> f64 {
        self.budget.spent(session)
    }

    /// $ remaining in a session's budget before the next call is refused.
    pub fn session_budget_remaining(&self, session: &str) -> f64 {
        self.budget.remaining(session)
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
        // P1.8 (A5): keyless local runtime — no key ring, no auth header.
        if let Some(ep) = self.local_endpoints.get(provider) {
            return self.local_chat_completion(ep, provider, model, session_id, body);
        }
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
            // Cache-aware usage from the response's `usage` object (A9).
            |resp: &serde_json::Value| {
                resp.get("usage")
                    .and_then(Usage::from_any)
                    .unwrap_or_default()
            },
        )
    }

    /// Streaming chat completion: forces `stream: true` (+ include_usage so
    /// budgets stay accurate) and returns the parsed SSE event list (deltas +
    /// finish reasons). Usage is extracted from the final SSE chunk when the
    /// provider echoes it back (`stream_options.include_usage`).
    pub fn chat_completion_stream(
        &self,
        provider: &str,
        model: &str,
        session_id: &str,
        mut body: serde_json::Value,
    ) -> Result<Vec<ChatStreamEvent>, BrokerError> {
        // P1.8 (A5): keyless local runtime — no key ring, no auth header.
        if let Some(ep) = self.local_endpoints.get(provider) {
            return self.local_chat_completion_stream(ep, provider, model, session_id, body);
        }
        body["stream"] = serde_json::json!(true);
        body["stream_options"] = serde_json::json!({"include_usage": true});
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
            // Cache-aware usage merged from the stream's usage chunks (A9).
            |events: &Vec<ChatStreamEvent>| usage_from_stream(events.as_slice()),
        )
    }

    /// Shared failover loop: select a key → run → on success record
    /// health + cache-aware cost + ledger + session budget; on 429 put the
    /// key into cooldown and switch to the next (up to [`MAX_429_SWITCHES`]);
    /// on any other error surface immediately.
    ///
    /// J11 choke point: the session budget is checked at the TOP of every
    /// attempt — a session at/over its $ limit is refused before any key is
    /// selected or any HTTP attempt is made.
    fn run_with_failover<T>(
        &self,
        provider: &str,
        model: &str,
        session_id: &str,
        body: serde_json::Value,
        runner: impl Fn(&str, &SelectedKey, serde_json::Value) -> Result<T, BrokerError>,
        usage_of: impl Fn(&T) -> Usage,
    ) -> Result<T, BrokerError> {
        let base = self
            .base_urls
            .get(provider)
            .cloned()
            .ok_or_else(|| BrokerError::UnknownProvider(provider.to_string()))?;
        let url = format!("{base}/chat/completions");

        if !self.budget.can_issue(session_id) {
            return Err(BrokerError::SessionBudgetExceeded {
                session: session_id.to_string(),
                limit: self.budget.limit(),
                spent: self.budget.spent(session_id),
            });
        }

        let mut switches = 0u32;
        // P1.7: a 401 on an oauth provider refreshes the token exactly once
        // per call before failover/exhaustion logic takes over.
        let mut refreshed = false;
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
                    // Success: health + cache-aware cost + ledger + budget.
                    self.ring
                        .report_success(&key.opaque_handle)
                        .map_err(BrokerError::KeyRing)?;
                    let usage = usage_of(&result);
                    let cost = self.cost_of(provider, usage);
                    self.ring
                        .report_usage(&key.opaque_handle, usage.total(), cost)
                        .map_err(BrokerError::KeyRing)?;
                    // One append-only ledger row per call (ARCH/05 §5.6).
                    self.vault
                        .record_usage(&UsageRow {
                            session: session_id.to_string(),
                            provider: provider.to_string(),
                            model: model.to_string(),
                            key_id: key.key_id.clone(),
                            usage,
                            cost,
                            tool: None,
                        })
                        .map_err(BrokerError::Vault)?;
                    // J11: settle the session; the next call is refused once
                    // spent ≥ limit.
                    self.budget.settle(session_id, cost);
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
                    // P1.7: on 401 for an oauth-backed provider, refresh the
                    // account's token (ring value updated by the manager) and
                    // retry once — then fall through to the normal surface.
                    let refreshable = !refreshed
                        && is_oauth_provider(provider)
                        && self.oauth.as_ref().map(|o| o.enabled()).unwrap_or(false);
                    if refreshable && matches!(e, BrokerError::Http(401, _)) {
                        self.ring
                            .report_failure(&key.opaque_handle, false)
                            .map_err(BrokerError::KeyRing)?;
                        let ok = self
                            .oauth
                            .as_ref()
                            .unwrap()
                            .refresh(provider, &key.key_id)
                            .is_ok();
                        if ok {
                            refreshed = true;
                            continue;
                        }
                    }
                    // Non-429 (or refresh failed): record health, surface.
                    self.ring
                        .report_failure(&key.opaque_handle, false)
                        .map_err(BrokerError::KeyRing)?;
                    return Err(e);
                }
            }
        }
    }
}

impl<'a> Broker<'a> {
    /// P1.8 (A5/B5) — keyless local completion. Grammar rides the request
    /// (GBNF passthrough on ollama's `format` / llamafile's `grammar`); usage
    /// lands in the ledger + session budget at $0 cost.
    fn local_chat_completion(
        &self,
        ep: &LocalEndpoint,
        provider: &str,
        model: &str,
        session_id: &str,
        mut body: serde_json::Value,
    ) -> Result<serde_json::Value, BrokerError> {
        if !self.budget.can_issue(session_id) {
            return Err(BrokerError::SessionBudgetExceeded {
                session: session_id.to_string(),
                limit: self.budget.limit(),
                spent: self.budget.spent(session_id),
            });
        }
        body["stream"] = serde_json::json!(false);
        let (resp, usage) = match ep.runtime {
            crate::local::LocalRuntime::Ollama => {
                let req = local::ollama_body(ep, model, &body);
                local::ollama_chat(&ep.base_url, &req)?
            }
            crate::local::LocalRuntime::Llamafile => {
                let req = local::llamafile_body(ep, model, &body);
                local::llamafile_chat(&ep.base_url, &req)?
            }
        };
        self.record_local(session_id, provider, model, usage)?;
        Ok(resp)
    }

    /// P1.8 (A5/B5) — keyless local stream. Same contract as the cloud path:
    /// `Vec<ChatStreamEvent>` with deltas + finish + cache-aware usage.
    fn local_chat_completion_stream(
        &self,
        ep: &LocalEndpoint,
        provider: &str,
        model: &str,
        session_id: &str,
        body: serde_json::Value,
    ) -> Result<Vec<ChatStreamEvent>, BrokerError> {
        if !self.budget.can_issue(session_id) {
            return Err(BrokerError::SessionBudgetExceeded {
                session: session_id.to_string(),
                limit: self.budget.limit(),
                spent: self.budget.spent(session_id),
            });
        }
        let mut body = body;
        body["stream"] = serde_json::json!(true);
        let events = match ep.runtime {
            crate::local::LocalRuntime::Ollama => {
                let req = local::ollama_body(ep, model, &body);
                local::ollama_chat_stream(&ep.base_url, &req)?
            }
            crate::local::LocalRuntime::Llamafile => {
                let req = local::llamafile_body(ep, model, &body);
                local::llamafile_chat_stream(&ep.base_url, &req)?
            }
        };
        let usage = usage_from_stream(events.as_slice());
        self.record_local(session_id, provider, model, usage)?;
        Ok(events)
    }

    /// Shared local recording: one ledger row (key_id = model — there is no
    /// key) + J11 session settle at $0 cost. Tokens count; local $ is always
    /// 0. Same error contract as the cloud path: a failed ledger write
    /// propagates (cost accounting must never fail silently).
    fn record_local(
        &self,
        session_id: &str,
        provider: &str,
        model: &str,
        usage: Usage,
    ) -> Result<(), BrokerError> {
        let cost = 0.0;
        self.vault.record_usage(&UsageRow {
            session: session_id.to_string(),
            provider: provider.to_string(),
            model: model.to_string(),
            key_id: model.to_string(),
            usage,
            cost,
            tool: None,
        })?;
        self.budget.settle(session_id, cost);
        Ok(())
    }
}

/// Build the auth header for a provider. Returns `(name, value)`; the value
/// buffer is dropped right after the request and its bytes are never logged.
/// The header string is `Zeroizing`-wrapped so the secret bytes are scrubbed
/// when the header buffer is dropped.
fn authorization(provider: &str, secret: &[u8]) -> (&'static str, zeroize::Zeroizing<String>) {
    let secret_str = zeroize::Zeroizing::new(String::from_utf8_lossy(secret).into_owned());
    match provider {
        "anthropic" => ("x-api-key", secret_str),
        _ => (
            "Authorization",
            zeroize::Zeroizing::new(format!("Bearer {}", secret_str.as_str())),
        ),
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
/// Merge the cache-aware usage observed across a stream (A9). OpenAI-compatible
/// providers put the full `usage` object in the LAST SSE chunk when
/// `stream_options.include_usage` was requested; Anthropic splits input/
/// cache-write (`message_start`) from output (`message_delta`) — merge_max
/// keeps every field without double counting.
fn usage_from_stream(events: &[ChatStreamEvent]) -> Usage {
    let mut acc = Usage::default();
    for e in events {
        if let Some(u) = e.usage {
            acc.merge_max(u);
        }
    }
    acc
}

/// Per-provider cost for a call (A9): cached input is never double-billed.
fn cost_of_usage(pricing: &HashMap<String, Pricing>, provider: &str, usage: Usage) -> f64 {
    pricing
        .get(provider)
        .copied()
        .unwrap_or_default()
        .cost_of(usage)
}

/// Parse OpenAI-style SSE stream into events. Lines look like:
/// `data: {"choices":[{"delta":{"content":"hi"},"finish_reason":null}]}`
/// and the stream ends with `data: [DONE]`.
///
/// `pub(crate)` — the local llamafile path (P1.8) streams the same shape.
pub(crate) fn parse_sse<R: BufRead>(mut reader: R) -> Vec<ChatStreamEvent> {
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
            .map(str::to_string)
            // Anthropic-style SSE (`content_block_delta`): `delta.text`.
            .or_else(|| {
                value
                    .get("delta")
                    .and_then(|d| d.get("text"))
                    .and_then(|t| t.as_str())
                    .map(str::to_string)
            });
        let finish = choice
            .and_then(|c| c.get("finish_reason"))
            .and_then(|f| f.as_str())
            .map(str::to_string);
        let usage = value
            .get("usage")
            .or_else(|| value.get("message").and_then(|m| m.get("usage")))
            .and_then(Usage::from_any);
        events.push(ChatStreamEvent {
            delta,
            finish,
            usage,
        });
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
    #[error("all keys for provider '{0}' exhausted after 429 failover")]
    AllKeysExhausted(String),
    #[error("session '{session}' stopped: ${limit:.2} limit (spent ${spent:.2})")]
    SessionBudgetExceeded {
        session: String,
        limit: f64,
        spent: f64,
    },
    #[error("vault error: {0}")]
    Vault(#[from] crate::VaultError),
}

impl<'a> Broker<'a> {
    /// $ cost of a call under the provider's configured pricing (A9).
    fn cost_of(&self, provider: &str, usage: Usage) -> f64 {
        cost_of_usage(&self.pricing, provider, usage)
    }
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
    fn streaming_roundtrip_collects_deltas_and_usage() {
        // include_usage echo: final chunk carries `usage` (OpenAI-compatible
        // streaming) — the broker must record it against the key's budget.
        let sse = concat!(
            "data: {\"choices\":[{\"delta\":{\"content\":\"hi \"},\"finish_reason\":null}]}\n",
            "data: {\"choices\":[{\"delta\":{\"content\":\"there\"},\"finish_reason\":null}]}\n",
            "data: {\"choices\":[],\"usage\":{\"total_tokens\":37}}\n",
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
        // Usage from the final chunk hit the key's daily budget.
        let info = broker.ring().list("nvidia").unwrap();
        assert!(info[0].tokens_day >= 37);
    }

    // ---- P1.3: cache-aware costs (A9) + session budget (J11) -----------

    #[test]
    fn cache_aware_usage_lands_in_ledger_and_key_budget() {
        // OpenAI-compatible response with cached input: cost must be computed
        // on BILLABLE input (prompt − cached), and the ledger row + per-key
        // cost_day must reflect the real $.
        let base = mock_server(|_| {
            (
                200,
                r#"{"usage":{"prompt_tokens":100,"completion_tokens":50,"prompt_tokens_details":{"cached_tokens":80}}}"#
                    .into(),
            )
        });
        let vault = vault();
        let broker = Broker::new(vault).with_base_url("nvidia", base);
        broker.ring().add_key(spec("nvidia", "nim", "sk")).unwrap();
        broker
            .chat_completion("nvidia", "m", "s1", serde_json::json!({}))
            .unwrap();

        // Ledger row exists with cache_read recorded.
        assert_eq!(vault.ledger_count().unwrap(), 1);
        // nvidia pricing: in/out $0.50 per 1M. billable = 100−80 = 20 →
        // cost = 20×0.5e-6 + 50×0.5e-6 = 35e-6.
        let spent = vault.session_spend("s1").unwrap();
        let expected = 35e-6;
        assert!((spent - expected).abs() < 1e-12, "spent {spent} != {expected}");
        // Per-key budget carries the same cost.
        let info = broker.ring().list("nvidia").unwrap();
        assert!((info[0].cost_day - expected).abs() < 1e-12);
        assert!(info[0].tokens_day >= 150);
        // Broker-side tracker agrees.
        assert!((broker.session_spent("s1") - expected).abs() < 1e-12);
    }

    #[test]
    fn anthropic_cache_tokens_priced_at_cache_rates() {
        let base = mock_server(|_| {
            (
                200,
                r#"{"usage":{"input_tokens":200,"output_tokens":30,"cache_creation_input_tokens":150,"cache_read_input_tokens":40}}"#
                    .into(),
            )
        });
        let vault = vault();
        let broker = Broker::new(vault).with_base_url("anthropic", base);
        broker
            .ring()
            .add_key(spec("anthropic", "a1", "sk-ant"))
            .unwrap();
        broker
            .chat_completion("anthropic", "claude", "s1", serde_json::json!({}))
            .unwrap();
        // Cost = billable(160)×3e-6 + 30×15e-6 + 40×0.3e-6 + 150×3.75e-6.
        let expected = 160.0 * 3e-6 + 30.0 * 15e-6 + 40.0 * 0.3e-6 + 150.0 * 3.75e-6;
        let spent = vault.session_spend("s1").unwrap();
        assert!((spent - expected).abs() < 1e-9, "spent {spent} != {expected}");
    }

    #[test]
    fn session_budget_kills_session_and_surfaces_stopped_message() {
        // J11: a $0.000000001 budget — first call succeeds (spent 35e-6 >
        // limit), the NEXT call is refused at the pre-flight choke point.
        let base = mock_server(|_| {
            (
                200,
                r#"{"usage":{"prompt_tokens":100,"completion_tokens":50,"prompt_tokens_details":{"cached_tokens":80}}}"#
                    .into(),
            )
        });
        let vault = vault();
        let broker = Broker::new(vault)
            .with_base_url("nvidia", base)
            .with_session_budget_limit(1e-9);
        broker.ring().add_key(spec("nvidia", "nim", "sk")).unwrap();

        broker
            .chat_completion("nvidia", "m", "s1", serde_json::json!({}))
            .unwrap();
        let err = broker
            .chat_completion("nvidia", "m", "s1", serde_json::json!({}))
            .unwrap_err();
        let msg = err.to_string();
        match err {
            BrokerError::SessionBudgetExceeded { session, limit, spent } => {
                assert_eq!(session, "s1");
                assert!((limit - 1e-9).abs() < 1e-18);
                assert!(spent > limit);
                // The UI surface string: "stopped: $X limit ...".
                assert!(msg.contains("stopped:"), "msg: {msg}");
                assert!(msg.contains("limit"), "msg: {msg}");
            }
            other => panic!("expected SessionBudgetExceeded, got {other:?}"),
        }
        // The session is now dead — remaining is $0.
        assert_eq!(broker.session_budget_remaining("s1"), 0.0);
        // Other sessions are unaffected.
        assert!(broker.session_budget_remaining("s2") > 0.0);
    }

    #[test]
    fn streaming_usage_merges_anthropic_shapes() {
        // Anthropic streaming: input/cache-write in message_start, output in
        // message_delta. The broker must merge them into ONE Usage row.
        let sse = concat!(
            "data: {\"type\":\"message_start\",\"message\":{\"usage\":{\"input_tokens\":100,\"cache_creation_input_tokens\":60}}}\n",
            "data: {\"type\":\"content_block_delta\",\"delta\":{\"text\":\"hi\"}}\n",
            "data: {\"type\":\"message_delta\",\"usage\":{\"output_tokens\":25}}\n",
            "data: [DONE]\n",
        );
        let base = mock_server(move |_| (200, sse.into()));
        let vault = vault();
        let broker = Broker::new(vault).with_base_url("anthropic", base);
        broker
            .ring()
            .add_key(spec("anthropic", "a1", "sk-ant"))
            .unwrap();
        let events = broker
            .chat_completion_stream("anthropic", "claude", "s1", serde_json::json!({}))
            .unwrap();
        // Content delta came through.
        assert!(events.iter().any(|e| e.delta.as_deref() == Some("hi")));
        // Ledger merged input+cache_write+output.
        assert_eq!(vault.ledger_count().unwrap(), 1);
        let spend = vault.session_spend("s1").unwrap();
        let expected = 100.0 * 3e-6 + 25.0 * 15e-6 + 60.0 * 3.75e-6;
        assert!((spend - expected).abs() < 1e-9, "spend {spend} != {expected}");
    }

    #[test]
    fn custom_pricing_override_applies() {
        let base = mock_server(|_| {
            (
                200,
                r#"{"usage":{"prompt_tokens":1000,"completion_tokens":0}}"#.into(),
            )
        });
        let vault = vault();
        // Override: input is FREE — cost must be 0 despite 1000 tokens.
        let broker = Broker::new(vault)
            .with_base_url("nvidia", base)
            .with_pricing(
                "nvidia",
                crate::ledger::Pricing {
                    input_per_m: 0.0,
                    output_per_m: 0.0,
                    cache_read_per_m: 0.0,
                    cache_write_per_m: 0.0,
                },
            );
        broker.ring().add_key(spec("nvidia", "nim", "sk")).unwrap();
        broker
            .chat_completion("nvidia", "m", "s1", serde_json::json!({}))
            .unwrap();
        assert_eq!(vault.session_spend("s1").unwrap(), 0.0);
        // Tokens still land on the key budget.
        let info = broker.ring().list("nvidia").unwrap();
        assert!(info[0].tokens_day >= 1000);
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
