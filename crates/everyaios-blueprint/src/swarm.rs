//! P19-2 — ruflo swarm + federation deltas (doc 71 §1 — 🟡 ADAPT/REF).
//!
//! Swarm orchestration = **N agents on one prompt** (ruflo discussion #851),
//! folded into the existing P17 Kanban-of-agents task: a [`SwarmSpec`]
//! assigns the same task to N fleet members, and the run driver
//! ([`SwarmSession`]) merges their outputs per [`SwarmMode`] —
//! Race (first healthy answer wins) / Consensus (majority agree) /
//! Ensemble (structured merge of all answers).
//!
//! Federation (cross-machine sync) is recorded as *data only* — a
//! [`FederationSpec`] describing the remote peer + channels; the live
//! transport is the H18 remote/mobile seam, never claimed here.

use serde::{Deserialize, Serialize};

/// How the swarm merges N answers to one prompt.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum SwarmMode {
    /// First healthy completion wins (latency-optimized).
    Race,
    /// Majority agreement required; ties fall back to the best-scored.
    Consensus,
    /// Every completion is kept and merged into a structured digest.
    Ensemble,
}

/// The swarm contract: one prompt, N agents, a mode.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SwarmSpec {
    pub name: String,
    /// The shared prompt every member runs.
    pub prompt: String,
    /// The member agent ids (fleet members must already exist — the swarm
    /// never fabricates an agent).
    pub agents: Vec<String>,
    pub mode: SwarmMode,
    /// Optional maximum rounds for reconcile (ensemble synthesis).
    #[serde(default = "default_rounds")]
    pub max_rounds: u32,
}

fn default_rounds() -> u32 {
    2
}

impl SwarmSpec {
    pub fn new(
        name: impl Into<String>,
        prompt: impl Into<String>,
        agents: Vec<String>,
        mode: SwarmMode,
    ) -> Self {
        Self {
            name: name.into(),
            prompt: prompt.into(),
            agents,
            mode,
            max_rounds: default_rounds(),
        }
    }

    /// Reject empty prompts / empty or duplicate members.
    pub fn validate(&self) -> Result<(), SwarmError> {
        if self.prompt.trim().is_empty() {
            return Err(SwarmError::EmptyPrompt);
        }
        if self.agents.is_empty() {
            return Err(SwarmError::NoMembers);
        }
        let mut seen = std::collections::HashSet::new();
        for a in &self.agents {
            if !seen.insert(a.as_str()) {
                return Err(SwarmError::DuplicateMember(a.clone()));
            }
        }
        Ok(())
    }
}

/// One member's run result as the caller reports it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MemberOutcome {
    pub agent_id: String,
    /// Short answer/outcome text (what the member returned).
    pub answer: String,
    /// 0.0..=1.0 score if the harness reports one (else 0.5).
    pub score: f64,
    /// true = completed cleanly (a failure is never counted toward
    /// consensus or the race).
    pub ok: bool,
}

/// Cross-machine federation record (H18 data shape; the transport is a
/// documented seam).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FederationSpec {
    /// Peer seed (host:port or Tailscale name — stored, never dialed here).
    pub peer: String,
    /// The sync channel the peer exposes (`sync.room/<room>`).
    pub channel: String,
    /// True when this swarm may fan out to the peer.
    pub allow_fanout: bool,
}

/// The swarm driver: the coordinator feeds member outcomes in any order and
/// the session computes the verdict when every member has reported (or the
/// caller aborts).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SwarmSession {
    pub spec: SwarmSpec,
    pub member_results: Vec<MemberOutcome>,
    pub verdict_reached: bool,
    pub winner: Option<String>,
    /// Consensus digest for Ensemble mode (agent_id + snippet per member).
    pub digest: Vec<String>,
}

impl SwarmSession {
    pub fn new(spec: SwarmSpec) -> Result<Self, SwarmError> {
        spec.validate()?;
        Ok(Self {
            spec,
            member_results: Vec::new(),
            verdict_reached: false,
            winner: None,
            digest: Vec::new(),
        })
    }

    /// Report one member's outcome. Idempotent per member.
    pub fn report(&mut self, outcome: MemberOutcome) -> Result<(), SwarmError> {
        if !self.spec.agents.contains(&outcome.agent_id) {
            return Err(SwarmError::UnknownMember(outcome.agent_id.clone()));
        }
        if self
            .member_results
            .iter()
            .any(|m| m.agent_id == outcome.agent_id)
        {
            return Ok(()); // first report wins — no double counting
        }
        self.member_results.push(outcome);
        self.try_verdict();
        Ok(())
    }

    /// Abort: mark the session done without a winner (circuit-break).
    pub fn abort(&mut self) {
        self.verdict_reached = true;
        self.winner = None;
    }

    pub fn is_done(&self) -> bool {
        self.verdict_reached
    }

    /// The members that have not yet reported.
    pub fn pending_members(&self) -> Vec<String> {
        self.spec
            .agents
            .iter()
            .filter(|a| !self.member_results.iter().any(|m| &m.agent_id == *a))
            .cloned()
            .collect()
    }

    fn try_verdict(&mut self) {
        if self.verdict_reached {
            return;
        }
        let reported: Vec<String> = self
            .member_results
            .iter()
            .map(|m| m.agent_id.clone())
            .collect();
        let all_done = self.spec.agents.iter().all(|a| reported.contains(a));
        if !all_done {
            return;
        }
        let healthy: Vec<&MemberOutcome> = self.member_results.iter().filter(|m| m.ok).collect();
        let winner = match self.spec.mode {
            SwarmMode::Race => {
                // first reported healthy answer
                healthy.iter().map(|m| m.agent_id.clone()).next()
            }
            SwarmMode::Consensus => {
                // majority answer (exact text); tie → highest score
                let mut counts: std::collections::HashMap<&str, (usize, f64)> = Default::default();
                for m in &healthy {
                    let e = counts.entry(m.answer.as_str()).or_insert((0, 0.0));
                    e.0 += 1;
                    e.1 = e.1.max(m.score);
                }
                counts
                    .into_iter()
                    .max_by(|a, b| {
                        a.1 .0.cmp(&b.1 .0).then_with(|| {
                            a.1 .1
                                .partial_cmp(&b.1 .1)
                                .unwrap_or(std::cmp::Ordering::Equal)
                        })
                    })
                    .map(|(answer, _)| {
                        healthy
                            .iter()
                            .find(|m| m.answer == answer)
                            .map(|m| m.agent_id.clone())
                            .unwrap_or_default()
                    })
            }
            SwarmMode::Ensemble => healthy.iter().map(|m| m.agent_id.clone()).next(),
        };
        if self.spec.mode == SwarmMode::Ensemble {
            self.digest = healthy
                .iter()
                .map(|m| format!("{}: {}", m.agent_id, m.answer))
                .collect();
        }
        self.winner = winner;
        self.verdict_reached = true;
    }
}

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum SwarmError {
    #[error("swarm prompt is empty")]
    EmptyPrompt,
    #[error("swarm has no members")]
    NoMembers,
    #[error("duplicate swarm member `{0}`")]
    DuplicateMember(String),
    #[error("unknown swarm member `{0}`")]
    UnknownMember(String),
}

#[cfg(test)]
mod tests {
    use super::*;

    fn outcome(agent: &str, answer: &str, score: f64, ok: bool) -> MemberOutcome {
        MemberOutcome {
            agent_id: agent.into(),
            answer: answer.into(),
            score,
            ok,
        }
    }

    fn spec(mode: SwarmMode) -> SwarmSpec {
        SwarmSpec::new(
            "swarm-1",
            "Summarize the Q3 variance.",
            vec!["alice".into(), "bob".into(), "carol".into()],
            mode,
        )
    }

    #[test]
    fn spec_validation() {
        assert!(SwarmSpec::new("x", "", vec![], SwarmMode::Race)
            .validate()
            .is_err());
        assert!(SwarmSpec::new("x", "p", vec![], SwarmMode::Race)
            .validate()
            .is_err());
        assert!(
            SwarmSpec::new("x", "p", vec!["a".into(), "a".into()], SwarmMode::Race)
                .validate()
                .is_err()
        );
        assert!(SwarmSpec::new("x", "p", vec!["a".into()], SwarmMode::Race)
            .validate()
            .is_ok());
    }

    #[test]
    fn race_picks_first_healthy() {
        let mut s = SwarmSession::new(spec(SwarmMode::Race)).unwrap();
        s.report(outcome("carol", "c", 0.8, true)).unwrap();
        s.report(outcome("alice", "a", 0.6, true)).unwrap();
        assert!(!s.is_done());
        s.report(outcome("bob", "b", 0.9, true)).unwrap();
        assert!(s.is_done());
        assert_eq!(s.winner.as_deref(), Some("carol")); // first healthy
    }

    #[test]
    fn race_ignores_failed_members() {
        let mut s = SwarmSession::new(spec(SwarmMode::Race)).unwrap();
        s.report(outcome("alice", "fail", 0.0, false)).unwrap();
        s.report(outcome("bob", "b", 0.7, true)).unwrap();
        assert!(!s.is_done()); // carol still pending
        s.report(outcome("carol", "c", 0.5, false)).unwrap();
        assert!(s.is_done());
        assert_eq!(s.winner.as_deref(), Some("bob"));
    }

    #[test]
    fn consensus_takes_majority() {
        let mut s = SwarmSession::new(spec(SwarmMode::Consensus)).unwrap();
        s.report(outcome("alice", "42", 0.5, true)).unwrap();
        s.report(outcome("bob", "42", 0.7, true)).unwrap();
        s.report(outcome("carol", "43", 0.9, true)).unwrap();
        assert!(s.is_done());
        assert_eq!(s.winner.as_deref(), Some("alice"));
    }

    #[test]
    fn consensus_tie_goes_to_score() {
        let mut s = SwarmSession::new(spec(SwarmMode::Consensus)).unwrap();
        s.report(outcome("alice", "42", 0.5, true)).unwrap();
        s.report(outcome("bob", "43", 0.9, true)).unwrap();
        s.report(outcome("carol", "44", 0.3, true)).unwrap();
        assert_eq!(s.winner.as_deref(), Some("bob"));
    }

    #[test]
    fn ensemble_builds_digest() {
        let mut s = SwarmSession::new(spec(SwarmMode::Ensemble)).unwrap();
        s.report(outcome("alice", "a1", 0.5, true)).unwrap();
        s.report(outcome("bob", "b2", 0.5, true)).unwrap();
        s.report(outcome("carol", "x", 0.0, false)).unwrap();
        assert!(s.is_done());
        assert_eq!(s.digest.len(), 2);
    }

    #[test]
    fn unknown_member_rejected_and_abort() {
        let mut s = SwarmSession::new(spec(SwarmMode::Race)).unwrap();
        assert!(s.report(outcome("mallory", "x", 0.5, true)).is_err());
        s.abort();
        assert!(s.is_done());
        assert_eq!(s.winner, None);
    }

    #[test]
    fn duplicate_report_idempotent() {
        let mut s = SwarmSession::new(spec(SwarmMode::Race)).unwrap();
        s.report(outcome("alice", "first", 0.5, true)).unwrap();
        // Duplicate reports are idempotent — the first stays (no double
        // counting can skew the verdict).
        s.report(outcome("alice", "second", 0.9, true)).unwrap();
        s.report(outcome("bob", "b", 0.5, true)).unwrap();
        s.report(outcome("carol", "c", 0.5, true)).unwrap();
        assert_eq!(s.winner.as_deref(), Some("alice"));
        assert_eq!(s.member_results.len(), 3);
    }
}
