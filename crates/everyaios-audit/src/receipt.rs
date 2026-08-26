//! K1 Proof-Carrying Work Receipts (doc 81 §4): a portable receipt contract
//! over the Merkle chain + GuardReceipt + EV1 evidence. A [`WorkReceipt`]
//! answers the acceptance test — "5 questions in 1 min without chat
//! history": what was the goal, what did you do, what evidence proves it,
//! what did it cost, and can I reproduce it.
//!
//! Every field is required (no silent omission); the receipt self-hashes so
//! an exported receipt can be verified against the audit chain root.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

/// The eleven receipt fields (doc 81 §4 contract).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WorkReceipt {
    pub receipt_id: String,
    /// The goal (the task's own words).
    pub goal: String,
    /// Inputs (files, URLs, selections, refs) that fed the work.
    pub inputs: Vec<String>,
    /// The plan steps that were executed.
    pub plan: Vec<String>,
    /// Every action taken (tool calls with their ticket ids).
    pub actions: Vec<ReceiptActionRef>,
    /// EV1 evidence (hashes, validator reports, screenshots).
    pub evidence: Vec<EvidenceRef>,
    /// Verification result (what proved completion).
    pub verification: VerificationSummary,
    /// Provenance: agent, session, audit chain root hash.
    pub provenance: Provenance,
    /// The policy the work ran under (profile + gates).
    pub policy: String,
    /// Reproduction recipe (commands/inputs to re-run deterministically).
    pub reproduction: Vec<String>,
    /// Cost: tokens + estimated USD.
    pub cost: CostSummary,
    /// The resulting state (files changed, outputs, hashes).
    pub result_state: Vec<String>,
}

/// One action taken during the work, tied to its guard ticket.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ReceiptActionRef {
    pub tool_id: String,
    pub ticket_id: String,
    pub args_hash: String,
    /// Effect class (doc-53 idempotency) — set by the change-set layer.
    pub effect_class: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct EvidenceRef {
    pub kind: String,
    pub hash: String,
    pub description: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct VerificationSummary {
    /// e.g. `verified_complete`, `partially_complete`, `failed_safely`.
    pub status: String,
    pub checks: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Provenance {
    pub agent_id: String,
    pub session_id: String,
    /// The Merkle chain root hash this receipt anchors to ("" = unanchored).
    pub chain_root: String,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Serialize, Deserialize)]
pub struct CostSummary {
    pub tokens_in: u64,
    pub tokens_out: u64,
    pub est_cost_usd: f64,
}

impl WorkReceipt {
    /// Deterministic self-hash: SHA-256 over the canonical JSON. The
    /// receipt's own integrity check — any field change breaks it.
    pub fn hash(&self) -> String {
        let canon = serde_json::to_vec(self).unwrap_or_default();
        format!("{:x}", Sha256::digest(canon))
    }

    /// A receipt is sound when its stored `hash` matches a recompute (the
    /// caller stores the hash alongside — e.g. as the Merkle chain root).
    pub fn verify(stored_hash: &str, receipt: &WorkReceipt) -> bool {
        stored_hash == receipt.hash()
    }

    /// The markdown render — answers the 5 questions without chat history.
    pub fn render(&self) -> String {
        format!(
            "# Work receipt {id}\n\n\
             ## Goal\n{goal}\n\n\
             ## Inputs\n{inputs}\n\
             ## Plan\n{plan}\n\
             ## Actions ({n})\n{actions}\n\
             ## Evidence\n{evidence}\n\
             ## Verification\n{status} — {checks}\n\
             ## Provenance\nagent {agent} · session {session} · chain {chain}\n\
             ## Policy\n{policy}\n\
             ## Reproduction\n{reproduction}\n\
             ## Cost\n{in_tok} in / {out_tok} out · ${cost:.4}\n\
             ## Result state\n{result}\n",
            id = self.receipt_id,
            goal = self.goal,
            inputs = bullet(&self.inputs),
            plan = bullet(&self.plan),
            n = self.actions.len(),
            actions = bullet(&self
                .actions
                .iter()
                .map(|a| format!("{} (ticket {}) [{}]", a.tool_id, a.ticket_id, a.effect_class))
                .collect::<Vec<_>>()),
            evidence = bullet(&self
                .evidence
                .iter()
                .map(|e| format!("{}: {} ({})", e.kind, e.description, &e.hash[..e.hash.len().min(12)]))
                .collect::<Vec<_>>()),
            status = self.verification.status,
            checks = self.verification.checks.join("; "),
            agent = self.provenance.agent_id,
            session = self.provenance.session_id,
            chain = if self.provenance.chain_root.is_empty() { "unanchored".into() } else { self.provenance.chain_root.clone() },
            policy = self.policy,
            reproduction = bullet(&self.reproduction),
            in_tok = self.cost.tokens_in,
            out_tok = self.cost.tokens_out,
            cost = self.cost.est_cost_usd,
            result = bullet(&self.result_state),
        )
    }
}

fn bullet(items: &[String]) -> String {
    if items.is_empty() {
        "(none)".into()
    } else {
        items.iter().map(|i| format!("- {i}")).collect::<Vec<_>>().join("\n")
    }
}

/// A builder so the executor assembles the receipt in field order without
/// partial-state bugs (only `build` produces a [`WorkReceipt`]).
#[derive(Debug, Clone, Default)]
pub struct ReceiptBuilder {
    goal: String,
    inputs: Vec<String>,
    plan: Vec<String>,
    actions: Vec<ReceiptActionRef>,
    evidence: Vec<EvidenceRef>,
    verification: Option<VerificationSummary>,
    provenance: Option<Provenance>,
    policy: String,
    reproduction: Vec<String>,
    cost: CostSummary,
    result_state: Vec<String>,
}

impl ReceiptBuilder {
    pub fn new() -> Self {
        Self::default()
    }
    pub fn goal(mut self, goal: impl Into<String>) -> Self {
        self.goal = goal.into();
        self
    }
    pub fn input(mut self, input: impl Into<String>) -> Self {
        self.inputs.push(input.into());
        self
    }
    pub fn plan_step(mut self, step: impl Into<String>) -> Self {
        self.plan.push(step.into());
        self
    }
    pub fn action(mut self, a: ReceiptActionRef) -> Self {
        self.actions.push(a);
        self
    }
    pub fn evidence(mut self, e: EvidenceRef) -> Self {
        self.evidence.push(e);
        self
    }
    pub fn verification(mut self, v: VerificationSummary) -> Self {
        self.verification = Some(v);
        self
    }
    pub fn provenance(mut self, p: Provenance) -> Self {
        self.provenance = Some(p);
        self
    }
    pub fn policy(mut self, policy: impl Into<String>) -> Self {
        self.policy = policy.into();
        self
    }
    pub fn reproduction(mut self, r: impl Into<String>) -> Self {
        self.reproduction.push(r.into());
        self
    }
    pub fn cost(mut self, c: CostSummary) -> Self {
        self.cost = c;
        self
    }
    pub fn result(mut self, r: impl Into<String>) -> Self {
        self.result_state.push(r.into());
        self
    }
    /// `build` requires the verification + provenance halves (a receipt
    /// without them is not proof-carrying).
    pub fn build(self, receipt_id: impl Into<String>) -> Result<WorkReceipt, String> {
        let verification = self.verification.ok_or("missing verification")?;
        let provenance = self.provenance.ok_or("missing provenance")?;
        if self.goal.is_empty() {
            return Err("missing goal".into());
        }
        Ok(WorkReceipt {
            receipt_id: receipt_id.into(),
            goal: self.goal,
            inputs: self.inputs,
            plan: self.plan,
            actions: self.actions,
            evidence: self.evidence,
            verification,
            provenance,
            policy: self.policy,
            reproduction: self.reproduction,
            cost: self.cost,
            result_state: self.result_state,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> WorkReceipt {
        ReceiptBuilder::new()
            .goal("Fix N+1 query in the parser")
            .input("src/parser.rs")
            .plan_step("Reproduce with the fixture")
            .plan_step("Replace loop with a join")
            .action(ReceiptActionRef {
                tool_id: "fs.write".into(),
                ticket_id: "t-1".into(),
                args_hash: "abc123".into(),
                effect_class: "reversible".into(),
            })
            .evidence(EvidenceRef {
                kind: "file_hash".into(),
                hash: "deadbeef".into(),
                description: "src/parser.rs post-edit hash".into(),
            })
            .verification(VerificationSummary {
                status: "verified_complete".into(),
                checks: vec!["fixture passes".into(), "no N+1 in trace".into()],
            })
            .provenance(Provenance {
                agent_id: "claude".into(),
                session_id: "s-9".into(),
                chain_root: "merkle-root-1".into(),
            })
            .policy("profile=standard")
            .reproduction("cargo test --fixture n1")
            .cost(CostSummary { tokens_in: 1000, tokens_out: 200, est_cost_usd: 0.003 })
            .result("src/parser.rs changed (1 file)")
            .build("r-1")
            .unwrap()
    }

    #[test]
    fn hash_changes_with_any_field() {
        let r = sample();
        let h1 = r.hash();
        let mut r2 = r.clone();
        r2.result_state.push("extra".into());
        assert_ne!(h1, r2.hash());
        assert!(WorkReceipt::verify(&h1, &r));
        assert!(!WorkReceipt::verify(&h1, &r2));
    }

    #[test]
    fn build_requires_verification_and_provenance() {
        assert!(ReceiptBuilder::new().goal("x").build("r").is_err());
        assert!(ReceiptBuilder::new()
            .goal("x")
            .verification(VerificationSummary { status: "v".into(), checks: vec![] })
            .build("r")
            .is_err());
    }

    #[test]
    fn render_answers_the_five_questions() {
        let r = sample();
        let md = r.render();
        for needle in ["## Goal", "## Actions", "## Evidence", "## Verification", "## Reproduction", "## Cost"] {
            assert!(md.contains(needle), "missing {needle}");
        }
        assert!(md.contains("verified_complete"));
        assert!(md.contains("merkle-root-1"));
    }
}
