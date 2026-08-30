//! Usage accounting (P8 — the per-key cost display, per-session breakdown,
//! and cache-hit-rate items). A [`UsageLedger`] records token usage per
//! provider key and per session, tracks prompt-cache hit/miss events, and
//! answers the display queries the UI needs — all deterministic and
//! serializable.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// One recorded usage event.
#[derive(Debug, Clone, Copy, PartialEq, Default, Serialize, Deserialize)]
pub struct UsageRecord {
    pub tokens_in: u64,
    pub tokens_out: u64,
    pub cached_tokens: u64,
    pub cache_hits: u64,
    pub cache_misses: u64,
}

impl UsageRecord {
    pub fn total_tokens(self) -> u64 {
        self.tokens_in + self.tokens_out
    }

    /// Cache-hit rate 0..=1 (1 = every request hit the prompt cache).
    pub fn cache_hit_rate(self) -> f64 {
        let calls = self.cache_hits + self.cache_misses;
        if calls == 0 {
            0.0
        } else {
            self.cache_hits as f64 / calls as f64
        }
    }

    /// Estimate cost in USD (a rough per-Mtok rate; the broker's real prices
    /// plug in via `set_price`). 0 when no prices are configured.
    pub fn est_cost_usd(self, input_per_mtok: f64, output_per_mtok: f64) -> f64 {
        let input_tokens = self.tokens_in.saturating_sub(self.cached_tokens) as f64;
        input_tokens / 1e6 * input_per_mtok + self.tokens_out as f64 / 1e6 * output_per_mtok
    }
}

impl std::ops::Add for UsageRecord {
    type Output = Self;
    fn add(self, rhs: Self) -> Self {
        Self {
            tokens_in: self.tokens_in + rhs.tokens_in,
            tokens_out: self.tokens_out + rhs.tokens_out,
            cached_tokens: self.cached_tokens + rhs.cached_tokens,
            cache_hits: self.cache_hits + rhs.cache_hits,
            cache_misses: self.cache_misses + rhs.cache_misses,
        }
    }
}

/// One agent's summary row (P17 per-agent session metrics).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AgentSessionMetrics {
    pub agent: String,
    /// Sessions started for this agent/harness.
    pub sessions: u64,
    pub usage: UsageRecord,
}

impl AgentSessionMetrics {
    /// Estimated USD for this harness — callers supply the provider price
    /// (the ledger's key pricing doesn't map 1:1 to agents).
    pub fn est_cost_usd(&self, input_per_mtok: f64, output_per_mtok: f64) -> f64 {
        self.usage.est_cost_usd(input_per_mtok, output_per_mtok)
    }
}

/// The usage ledger.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct UsageLedger {
    /// Provider key id → usage.
    by_key: BTreeMap<String, UsageRecord>,
    /// Session id → usage.
    by_session: BTreeMap<String, UsageRecord>,
    /// Agent/harness id → usage (P17 per-agent session metrics).
    by_agent: BTreeMap<String, UsageRecord>,
    /// Agent/harness id → session count (sessions-per-agent).
    sessions_by_agent: BTreeMap<String, u64>,
    /// Provider key → price per Mtok (input, output). Empty = no pricing.
    prices: BTreeMap<String, (f64, f64)>,
    /// Active session (what `record` attributes to when a session is set).
    active_session: Option<String>,
    /// The key the active session is billed to.
    active_key: Option<String>,
    /// The active agent/harness (what `record` attributes to, when set).
    active_agent: Option<String>,
}

impl UsageLedger {
    pub fn new() -> Self {
        Self::default()
    }

    /// Set the price (USD per Mtok) for a provider key. Input + output.
    pub fn set_price(&mut self, key: &str, input_per_mtok: f64, output_per_mtok: f64) {
        self.prices
            .insert(key.to_string(), (input_per_mtok, output_per_mtok));
    }

    /// Bind the active session (subsequent `record` calls attribute to it).
    pub fn set_active(&mut self, session_id: &str, key: &str) {
        self.active_session = Some(session_id.to_string());
        self.active_key = Some(key.to_string());
    }

    pub fn clear_active(&mut self) {
        self.active_session = None;
        self.active_key = None;
    }

    /// Begin a session for an agent/harness (P17): increments the agent's
    /// session count and makes subsequent `record` calls attribute to it.
    pub fn begin_session(&mut self, agent_id: &str) {
        *self
            .sessions_by_agent
            .entry(agent_id.to_string())
            .or_insert(0) += 1;
        self.active_agent = Some(agent_id.to_string());
    }

    pub fn clear_agent(&mut self) {
        self.active_agent = None;
    }

    /// Record one model call: tokens + a cache-hit/miss flag.
    pub fn record(&mut self, tokens_in: u64, tokens_out: u64, cache_hit: bool, cached_tokens: u64) {
        let rec = UsageRecord {
            tokens_in,
            tokens_out,
            cached_tokens,
            cache_hits: u64::from(cache_hit),
            cache_misses: u64::from(!cache_hit),
        };
        let key = self.active_key.clone();
        let session = self.active_session.clone();
        let agent = self.active_agent.clone();
        if let Some(key) = key {
            let entry = self.by_key.entry(key).or_default();
            *entry = *entry + rec;
        }
        if let Some(session) = session {
            let entry = self.by_session.entry(session).or_default();
            *entry = *entry + rec;
        }
        if let Some(agent) = agent {
            let entry = self.by_agent.entry(agent).or_default();
            *entry = *entry + rec;
        }
    }

    /// Usage for one provider key (the per-key cost display).
    pub fn key_usage(&self, key: &str) -> Option<UsageRecord> {
        self.by_key.get(key).copied()
    }

    /// Usage for one session (the per-session breakdown).
    pub fn session_usage(&self, session_id: &str) -> Option<UsageRecord> {
        self.by_session.get(session_id).copied()
    }

    /// Every key with usage (for the per-key table).
    pub fn keys(&self) -> Vec<(String, UsageRecord)> {
        self.by_key.iter().map(|(k, v)| (k.clone(), *v)).collect()
    }

    /// Every session with usage.
    pub fn sessions(&self) -> Vec<(String, UsageRecord)> {
        self.by_session
            .iter()
            .map(|(k, v)| (k.clone(), *v))
            .collect()
    }

    /// Per-agent/harness summary (P17): sessions + tokens + est. cost per
    /// harness, for the Spend/analytics surface. Cost uses the *active key's*
    /// price when the agent billed to a key, else 0.
    pub fn agent_metrics(&self) -> Vec<AgentSessionMetrics> {
        let mut out: Vec<AgentSessionMetrics> = self
            .by_agent
            .iter()
            .map(|(agent, usage)| AgentSessionMetrics {
                agent: agent.clone(),
                sessions: self.sessions_by_agent.get(agent).copied().unwrap_or(0),
                usage: *usage,
            })
            .collect();
        // Agents with sessions but no recorded usage still appear.
        for (agent, sessions) in &self.sessions_by_agent {
            if !out.iter().any(|m| &m.agent == agent) {
                out.push(AgentSessionMetrics {
                    agent: agent.clone(),
                    sessions: *sessions,
                    usage: UsageRecord::default(),
                });
            }
        }
        out.sort_by(|a, b| b.usage.total_tokens().cmp(&a.usage.total_tokens()));
        out
    }

    /// Totals across all keys.
    pub fn total(&self) -> UsageRecord {
        self.by_key
            .values()
            .copied()
            .fold(UsageRecord::default(), |a, r| a + r)
    }

    /// Per-key cost using the configured prices (0 when a key has no price).
    pub fn key_cost_usd(&self, key: &str) -> Option<f64> {
        let usage = self.by_key.get(key)?;
        let (in_p, out_p) = self.prices.get(key)?;
        Some(usage.est_cost_usd(*in_p, *out_p))
    }

    /// The cache-hit rate across all recorded calls (per-provider display).
    pub fn cache_hit_rate(&self) -> f64 {
        self.total().cache_hit_rate()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn records_and_breaks_down_by_key_and_session() {
        let mut l = UsageLedger::new();
        l.set_active("s1", "anthropic");
        l.record(1_000, 200, true, 800); // cache hit
        l.set_active("s2", "openai");
        l.record(500, 100, false, 0);
        l.clear_active();

        let anthropic = l.key_usage("anthropic").unwrap();
        assert_eq!(anthropic.tokens_in, 1_000);
        let s1 = l.session_usage("s1").unwrap();
        assert_eq!(s1.tokens_out, 200);
        assert_eq!(l.keys().len(), 2);
        assert_eq!(l.sessions().len(), 2);
        assert_eq!(l.total().total_tokens(), 1_800);
    }

    #[test]
    fn cache_hit_rate_tracks() {
        let mut l = UsageLedger::new();
        l.set_active("s1", "k");
        l.record(100, 10, true, 80);
        l.record(100, 10, true, 80);
        l.record(100, 10, false, 0);
        l.clear_active();
        let r = l.key_usage("k").unwrap();
        assert_eq!(r.cache_hits, 2);
        assert_eq!(r.cache_misses, 1);
        assert!((r.cache_hit_rate() - 2.0 / 3.0).abs() < 1e-9);
        assert!((l.cache_hit_rate() - 2.0 / 3.0).abs() < 1e-9);
    }

    #[test]
    fn cost_uses_configured_prices() {
        let mut l = UsageLedger::new();
        l.set_active("s1", "deepseek");
        l.record(1_000_000, 1_000_000, false, 0); // 1M in + 1M out
        l.clear_active();
        assert_eq!(l.key_cost_usd("deepseek"), None); // no price set
        l.set_price("deepseek", 0.27, 1.10);
        let cost = l.key_cost_usd("deepseek").unwrap();
        assert!((cost - (0.27 + 1.10)).abs() < 1e-9);
    }

    #[test]
    fn cached_tokens_are_not_billed_as_input() {
        let mut l = UsageLedger::new();
        l.set_price("k", 3.0, 15.0);
        l.set_active("s1", "k");
        l.record(1_000_000, 100_000, true, 800_000); // 800k cached
        l.clear_active();
        let cost = l.key_cost_usd("k").unwrap();
        // Only 200k uncached input tokens billed.
        assert!((cost - (0.2 * 3.0 + 0.1 * 15.0)).abs() < 1e-9);
    }

    #[test]
    fn per_agent_session_metrics() {
        let mut l = UsageLedger::new();
        l.begin_session("claude");
        l.set_active("s1", "anthropic");
        l.record(1_000, 200, true, 800);
        l.clear_agent();
        l.begin_session("claude");
        l.record(500, 100, false, 0);
        l.clear_agent();
        l.begin_session("opencode");
        l.set_active("s2", "openai");
        l.record(100, 50, false, 0);
        l.clear_agent();
        l.clear_active();

        let metrics = l.agent_metrics();
        assert_eq!(metrics.len(), 2);
        let claude = metrics.iter().find(|m| m.agent == "claude").unwrap();
        assert_eq!(claude.sessions, 2);
        assert_eq!(claude.usage.total_tokens(), 1_800);
        let opencode = metrics.iter().find(|m| m.agent == "opencode").unwrap();
        assert_eq!(opencode.sessions, 1);
        // Tokens-per-harness, sorted desc.
        assert_eq!(metrics[0].agent, "claude");
    }

    #[test]
    fn ledger_serializes() {
        let mut l = UsageLedger::new();
        l.set_active("s1", "k");
        l.record(100, 10, true, 50);
        l.clear_active();
        let json = serde_json::to_string(&l).unwrap();
        let back: UsageLedger = serde_json::from_str(&json).unwrap();
        assert_eq!(back.total().total_tokens(), 110);
    }
}
