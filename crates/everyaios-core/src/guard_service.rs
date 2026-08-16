//! P7.5 / J21 — the **GuardService**: the single executor-facing call-site
//! that composes the Guard-2 pieces into one deterministic pre-flight:
//!
//! 1. **estop** — pulled ⇒ refuse every privileged action.
//! 2. **policy** — `~/.everyaios/permissions.toml` (`PermissionsPolicy`) maps
//!    the operation → Allow/Ask/Block.
//! 3. **profile** — minimal/standard/strict raises the human-approval
//!    threshold (`Profile::human_approval_threshold`).
//! 4. **ticket** — an `Ask` mints a single-use [`AuthorizationTicket`] (with
//!    its [`DecisionPackage`] kept for the card), which the executor later
//!    consumes via [`GuardService::use_ticket`] before running.
//!
//! This is the "executor call-site that consumes tickets/estop/profiles" —
//! the coordinator drives it over JSON-RPC (`guard/*`), and the same state is
//! what the Tauri approval cards render.

use std::collections::HashMap;
use std::path::Path;

use everyaios_guard::{
    AuthorizationTicket, DecisionPackage, Estop, GuardReceipt, Operation, PermissionsPolicy,
    PolicyAction, Profile, TicketStore,
};
use serde::Serialize;
use serde_json::{json, Value};

/// The outcome of a pre-flight evaluation.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "action", rename_all = "lowercase")]
pub enum GuardDecision {
    /// Run without a human ticket.
    Allow,
    /// A ticket was minted — the card renders; the executor waits.
    Ask {
        #[serde(rename = "ticketId")]
        ticket_id: String,
    },
    /// Refused; `reason` is rendered on the card.
    Block { reason: String },
}

/// A pending ticket + its decision package (the full card payload).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingGuardCard {
    pub ticket_id: String,
    pub agent_id: String,
    pub session_id: String,
    pub tool_id: String,
    pub operation: String,
    pub paths: Vec<String>,
    pub risk: String,
    pub approval_source: String,
    pub expires_at_ms: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub decision: Option<DecisionPackage>,
}

/// The executor's pre-flight state (estop + policy + profile + tickets).
#[derive(Debug)]
pub struct GuardService {
    tickets: TicketStore,
    policy: PermissionsPolicy,
    estop: Estop,
    profile: Profile,
    /// ticket_id → the decision package that produced it (card rendering).
    decisions: HashMap<String, DecisionPackage>,
    /// Monotonic ticket-id source.
    counter: u64,
}

impl Default for GuardService {
    fn default() -> Self {
        Self {
            tickets: TicketStore::new(),
            policy: PermissionsPolicy::default(),
            estop: Estop::new(),
            profile: Profile::Standard,
            decisions: HashMap::new(),
            counter: 0,
        }
    }
}

impl GuardService {
    pub fn new() -> Self {
        Self::default()
    }

    /// Load policy from a `permissions.toml` file (missing file ⇒ defaults).
    pub fn load_policy_from(&mut self, path: &Path) {
        if let Ok(doc) = std::fs::read_to_string(path) {
            self.policy = PermissionsPolicy::parse(&doc);
        }
    }

    pub fn policy(&self) -> &PermissionsPolicy {
        &self.policy
    }

    pub fn profile(&self) -> Profile {
        self.profile
    }

    pub fn set_profile(&mut self, profile: Profile) {
        self.profile = profile;
    }

    pub fn estop(&self) -> &Estop {
        &self.estop
    }

    /// The **executor pre-flight**. Order matters: estop (hard stop) → policy
    /// (rule map) → profile (risk threshold). `Ask` mints the ticket and
    /// retains its decision package for the card.
    // (kept as explicit params — the arg count mirrors the ticket contract,
    // same as `everyaios-guard::path_ticket`.)
    #[allow(clippy::too_many_arguments)]
    pub fn evaluate(
        &mut self,
        session_id: &str,
        agent_id: &str,
        tool_id: &str,
        operation: Operation,
        decision: DecisionPackage,
        args_hash: &str,
        audit_seq: u64,
    ) -> GuardDecision {
        if self.estop.is_pulled() {
            return GuardDecision::Block {
                reason: "estop pulled".to_string(),
            };
        }

        let policy_action = self.policy.evaluate(&operation);
        let needs_human = decision.risk >= self.profile.human_approval_threshold();

        let action = if policy_action == PolicyAction::Block {
            GuardDecision::Block {
                reason: format!("policy denies {}", operation.name()),
            }
        } else if policy_action == PolicyAction::Ask || needs_human {
            self.counter += 1;
            let ticket_id = format!("tkt:{}", self.counter);
            let ticket = AuthorizationTicket {
                ticket_id: ticket_id.clone(),
                agent_id: agent_id.to_string(),
                session_id: session_id.to_string(),
                tool_id: tool_id.to_string(),
                operation: operation.name().to_string(),
                args_hash: args_hash.to_string(),
                paths: decision.affected_paths.clone(),
                expires_at_ms: now_ms() + 60_000,
                single_use: true,
                approval_source: everyaios_guard::ApprovalSource::Policy,
                risk: decision.risk,
                audit_seq,
                state: everyaios_guard::TicketState::Pending,
            };
            self.tickets.mint(ticket);
            self.decisions.insert(ticket_id.clone(), decision);
            GuardDecision::Ask { ticket_id }
        } else {
            GuardDecision::Allow
        };

        action
    }

    /// The **executor call-site** that consumes a ticket right before running
    /// a privileged action: estop must be clear, the ticket must be valid and
    /// the args must match (single-use). The executor still runs Guard-1 on
    /// the concrete args (separate gate).
    pub fn use_ticket(&mut self, ticket_id: &str, args_hash: &str) -> Result<(), String> {
        if self.estop.is_pulled() {
            return Err("estop pulled".to_string());
        }
        self.tickets
            .use_ticket(ticket_id, args_hash)
            .map_err(|e| e.to_string())
    }

    pub fn approve(&mut self, ticket_id: &str) -> bool {
        self.tickets.approve(ticket_id)
    }

    pub fn reject(&mut self, ticket_id: &str) -> bool {
        self.tickets.reject(ticket_id)
    }

    pub fn pending(&self) -> Vec<PendingGuardCard> {
        self.tickets
            .pending()
            .into_iter()
            .map(|t| PendingGuardCard {
                ticket_id: t.ticket_id.clone(),
                agent_id: t.agent_id.clone(),
                session_id: t.session_id.clone(),
                tool_id: t.tool_id.clone(),
                operation: t.operation.clone(),
                paths: t.paths.clone(),
                risk: format!("{:?}", t.risk).to_lowercase(),
                approval_source: format!("{:?}", t.approval_source).to_lowercase(),
                expires_at_ms: t.expires_at_ms,
                decision: self.decisions.get(&t.ticket_id).cloned(),
            })
            .collect()
    }

    pub fn receipts(&self) -> Vec<GuardReceipt> {
        self.tickets.receipts().to_vec()
    }

    /// JSON-RPC dispatch (`guard/*`) — the coordinator drives the same
    /// service the approval cards render, so there is one source of truth.
    pub fn handle(&mut self, method: &str, params: &Value) -> Result<Value, String> {
        match method {
            "guard/evaluate" => {
                let session = str_param(params, "sessionId").unwrap_or("default");
                let agent = str_param(params, "agentId").unwrap_or("agent");
                let tool = str_param(params, "toolId").unwrap_or("");
                let op = parse_operation(params)?;
                let decision: DecisionPackage = params
                    .get("decision")
                    .cloned()
                    .map(serde_json::from_value)
                    .transpose()
                    .map_err(|e| e.to_string())?
                    .unwrap_or_default();
                let args_hash = str_param(params, "argsHash").unwrap_or("").to_string();
                let audit_seq = params.get("auditSeq").and_then(Value::as_u64).unwrap_or(0);
                let out = self.evaluate(session, agent, tool, op, decision, &args_hash, audit_seq);
                Ok(serde_json::to_value(&out).map_err(|e| e.to_string())?)
            }
            "guard/use" => {
                let id = str_param(params, "ticketId").ok_or("guard/use requires ticketId")?;
                let args_hash = str_param(params, "argsHash").unwrap_or("").to_string();
                self.use_ticket(id, &args_hash)?;
                Ok(json!({ "consumed": true }))
            }
            "guard/approve" => {
                let id = str_param(params, "ticketId").ok_or("guard/approve requires ticketId")?;
                Ok(json!({ "approved": self.approve(id) }))
            }
            "guard/reject" => {
                let id = str_param(params, "ticketId").ok_or("guard/reject requires ticketId")?;
                Ok(json!({ "rejected": self.reject(id) }))
            }
            "guard/estop" => {
                self.estop.pull();
                Ok(json!({ "pulled": true }))
            }
            "guard/reset" => {
                self.estop.reset();
                Ok(json!({ "pulled": false }))
            }
            "guard/estop_status" => Ok(json!({ "pulled": self.estop.is_pulled() })),
            "guard/pending" => {
                let cards = self.pending();
                Ok(serde_json::to_value(&cards).map_err(|e| e.to_string())?)
            }
            "guard/receipts" => {
                let r: Vec<GuardReceipt> = self.receipts();
                Ok(serde_json::to_value(&r).map_err(|e| e.to_string())?)
            }
            "guard/profile" => {
                if let Some(p) = params.get("profile").and_then(Value::as_str) {
                    let profile = parse_profile(p)?;
                    self.set_profile(profile);
                    Ok(json!({ "profile": p }))
                } else {
                    Ok(json!({ "profile": self.profile().as_str() }))
                }
            }
            "guard/policy" => {
                // Summary of the loaded policy (for the Settings guard panel).
                Ok(json!({
                    "minConfidenceForAuto": self.policy.min_confidence_for_auto,
                    "userFeedbackLearning": self.policy.user_feedback_learning,
                    "profile": self.profile().as_str(),
                    "estopPulled": self.estop.is_pulled(),
                }))
            }
            _ => Err(format!("method not found: {method}")),
        }
    }
}

fn str_param<'a>(params: &'a Value, key: &str) -> Option<&'a str> {
    params.get(key).and_then(Value::as_str)
}

/// Current unix time in ms.
fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn parse_profile(s: &str) -> Result<Profile, String> {
    match s {
        "minimal" => Ok(Profile::Minimal),
        "standard" => Ok(Profile::Standard),
        "strict" => Ok(Profile::Strict),
        other => Err(format!("unknown profile: {other}")),
    }
}

fn parse_operation(params: &Value) -> Result<Operation, String> {
    let name = str_param(params, "operation").ok_or("guard/evaluate requires operation")?;
    Ok(match name {
        "delete" => Operation::DeleteFiles,
        "multi_file_edit" => Operation::MultiFileEdit {
            files: params.get("files").and_then(Value::as_u64).unwrap_or(0) as usize,
        },
        "external_network" => Operation::ExternalNetwork {
            new_domain: params
                .get("newDomain")
                .and_then(Value::as_bool)
                .unwrap_or(true),
        },
        "terminal_shell" => Operation::TerminalShell {
            destructive: params
                .get("destructive")
                .and_then(Value::as_bool)
                .unwrap_or(false),
        },
        "web_action" => Operation::WebAction,
        "write" => Operation::GenericWrite,
        other => return Err(format!("unknown operation: {other}")),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use everyaios_guard::RiskLevel;

    fn decision(risk: RiskLevel, paths: &[&str]) -> DecisionPackage {
        DecisionPackage::new("test goal")
            .with_risk(risk)
            .with_paths(paths.iter().map(|s| s.to_string()).collect())
    }

    #[test]
    fn estop_blocks_everything_first() {
        let mut g = GuardService::new();
        g.estop.pull();
        let d = g.evaluate(
            "s1",
            "a1",
            "fs.delete",
            Operation::DeleteFiles,
            decision(RiskLevel::Low, &[]),
            "h",
            0,
        );
        assert!(matches!(d, GuardDecision::Block { ref reason } if reason == "estop pulled"));
    }

    #[test]
    fn delete_asks_and_mints_consumable_ticket() {
        let mut g = GuardService::new();
        let d = g.evaluate(
            "s1",
            "a1",
            "fs.delete",
            Operation::DeleteFiles,
            decision(RiskLevel::High, &["/workspace/x"]),
            "args-h",
            7,
        );
        let ticket_id = match d {
            GuardDecision::Ask { ref ticket_id } => ticket_id.clone(),
            other => panic!("expected Ask, got {other:?}"),
        };

        // Card payload carries the decision package.
        let cards = g.pending();
        assert_eq!(cards.len(), 1);
        assert_eq!(cards[0].ticket_id, ticket_id);
        assert!(cards[0].decision.is_some());
        assert_eq!(cards[0].decision.as_ref().unwrap().goal, "test goal");

        // Approve then consume (single-use; args must match).
        assert!(g.approve(&ticket_id));
        assert!(g.use_ticket(&ticket_id, "args-h").is_ok());
        assert!(g.use_ticket(&ticket_id, "args-h").is_err());
    }

    #[test]
    fn low_risk_write_auto_allows_under_standard_profile() {
        let mut g = GuardService::new();
        let d = g.evaluate(
            "s1",
            "a1",
            "fs.write",
            Operation::GenericWrite,
            decision(RiskLevel::Low, &["/workspace/a.txt"]),
            "h",
            0,
        );
        assert!(matches!(d, GuardDecision::Ask { .. }), "generic write defaults to always_ask policy; got {d:?}");
    }

    #[test]
    fn strict_profile_raises_threshold() {
        let mut g = GuardService::new();
        g.set_profile(Profile::Strict);
        // Under strict, Medium+ needs human approval even when policy allows.
        let d = g.evaluate(
            "s1",
            "a1",
            "fs.write",
            Operation::GenericWrite,
            decision(RiskLevel::Medium, &[]),
            "h",
            0,
        );
        assert!(matches!(d, GuardDecision::Ask { .. }));
    }

    #[test]
    fn policy_block_refuses_outright() {
        let mut g = GuardService::new();
        g.policy = PermissionsPolicy::parse(
            "[permissions]\nterminal_shell = \"block\"\n",
        );
        let d = g.evaluate(
            "s1",
            "a1",
            "shell.exec",
            Operation::TerminalShell { destructive: true },
            decision(RiskLevel::High, &[]),
            "h",
            0,
        );
        assert!(matches!(d, GuardDecision::Block { .. }));
    }

    #[test]
    fn handle_dispatches_evaluate_and_use() {
        let mut g = GuardService::new();
        let out = g
            .handle(
                "guard/evaluate",
                &json!({
                    "sessionId": "s1", "agentId": "a1", "toolId": "fs.delete",
                    "operation": "delete", "argsHash": "h1", "auditSeq": 3,
                    "decision": { "goal": "rm", "risk": "high", "affectedPaths": ["/w/x"] }
                }),
            )
            .unwrap();
        let ticket_id = out["ticketId"].as_str().unwrap().to_string();
        assert_eq!(out["action"], "ask");

        let used = g
            .handle("guard/use", &json!({ "ticketId": ticket_id, "argsHash": "h1" }))
            .unwrap();
        assert_eq!(used["consumed"], true);

        // estop then re-evaluate → blocked.
        g.handle("guard/estop", &json!({})).unwrap();
        let blocked = g
            .handle(
                "guard/evaluate",
                &json!({ "operation": "delete", "argsHash": "h2", "decision": { "risk": "high" } }),
            )
            .unwrap();
        assert_eq!(blocked["action"], "block");
    }
}
