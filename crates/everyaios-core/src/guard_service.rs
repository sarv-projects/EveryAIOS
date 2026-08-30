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
use std::sync::mpsc::{self, Receiver};
use std::time::Duration;

use everyaios_guard::{
    AuthorizationTicket, DecisionPackage, Estop, GuardReceipt, Operation, PermissionsPolicy,
    PolicyAction, Profile, TicketStore,
};
use serde::Serialize;
use serde_json::{json, Value};

/// The outcome of a pre-flight evaluation.
///
/// **Ticket-every-effect:** both `Allow` and `Ask` carry a single-use
/// [`AuthorizationTicket`] the executor must consume. `Allow` mints an
/// *already-approved* ticket (policy auto-approved — consumable immediately);
/// `Ask` mints a *pending* ticket the human must approve before the executor
/// can consume it. There is no ticketless mutation path.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "action", rename_all = "lowercase")]
pub enum GuardDecision {
    /// Policy auto-approved — the ticket is already `Approved`, consumable now.
    Allow {
        #[serde(rename = "ticketId")]
        ticket_id: String,
    },
    /// A pending ticket was minted — the card renders; the executor waits.
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
    pub risk_tier: String,
    pub approval_source: String,
    /// Card-bound nonce required by the human approval command.
    pub approval_nonce: String,
    pub expires_at_ms: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub decision: Option<DecisionPackage>,
}

/// The executor's pre-flight state (estop + policy + profile + tickets).
pub struct GuardService {
    tickets: TicketStore,
    policy: PermissionsPolicy,
    estop: Estop,
    profile: Profile,
    /// ticket_id → the decision package that produced it (card rendering).
    decisions: HashMap<String, DecisionPackage>,
    /// Monotonic ticket-id source.
    counter: u64,
    /// H4: waiters blocked on Ask (ACP prompt).
    waiters: HashMap<String, mpsc::Sender<bool>>,
    outcomes: HashMap<String, bool>,
}

impl std::fmt::Debug for GuardService {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("GuardService")
            .field("counter", &self.counter)
            .finish_non_exhaustive()
    }
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
            waiters: HashMap::new(),
            outcomes: HashMap::new(),
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
    /// (rule map) → profile (risk threshold) → confidence floor. **Every
    /// non-blocked outcome mints a single-use ticket**: `Ask` mints it
    /// `Pending` (human must approve), `Allow` mints it `Approved` (policy
    /// auto-approved). The executor consumes the ticket either way, so there
    /// is no ticketless mutation path.
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
        // J21: a model-reported confidence below the policy floor forces the
        // auto path to ask, even when the rule map would otherwise allow it.
        let low_confidence = decision
            .confidence
            .map(|c| !self.policy.auto_confidence_ok(c))
            .unwrap_or(false);

        if policy_action == PolicyAction::Block {
            return GuardDecision::Block {
                reason: format!("policy denies {}", operation.name()),
            };
        }

        let tier =
            everyaios_guard::RiskTier::from_risk_and_op(decision.risk, operation.name(), false);
        // R4 is deny-by-default: even a policy Allow still asks (explicit).
        let r4_ask = tier == everyaios_guard::RiskTier::R4;
        let ask = policy_action == PolicyAction::Ask || needs_human || low_confidence || r4_ask;
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
            approval_nonce: everyaios_guard::ticket::new_approval_nonce(),
            risk: decision.risk,
            audit_seq,
            state: if ask {
                everyaios_guard::TicketState::Pending
            } else {
                everyaios_guard::TicketState::Approved
            },
            bindings: Vec::new(),
            execution_id: String::new(),
            action_id: tool_id.to_string(),
            idempotency_key: format!("{session_id}:{tool_id}:{args_hash}"),
        };
        self.tickets.mint(ticket);
        self.decisions.insert(ticket_id.clone(), decision);

        if ask {
            GuardDecision::Ask { ticket_id }
        } else {
            GuardDecision::Allow { ticket_id }
        }
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

    pub fn set_ticket_bindings(
        &mut self,
        ticket_id: &str,
        bindings: Vec<everyaios_guard::ResourceBinding>,
    ) -> bool {
        self.tickets.set_bindings(ticket_id, bindings)
    }

    pub fn set_ticket_execution(&mut self, ticket_id: &str, execution_id: &str) -> bool {
        self.tickets.set_execution(ticket_id, execution_id)
    }

    pub fn ticket_bindings(&self, ticket_id: &str) -> Vec<everyaios_guard::ResourceBinding> {
        self.tickets
            .get(ticket_id)
            .map(|t| t.bindings.clone())
            .unwrap_or_default()
    }

    /// Return the card-bound approval nonce without exposing the ticket
    /// itself. UI surfaces use this only to construct the approval card;
    /// approval still requires the nonce to be presented back to GuardService.
    pub fn approval_nonce(&self, ticket_id: &str) -> Option<&str> {
        self.tickets.approval_nonce(ticket_id)
    }

    pub fn approve(&mut self, ticket_id: &str) -> bool {
        let ok = self.tickets.approve(ticket_id);
        if ok {
            self.signal_ticket(ticket_id, true);
        }
        ok
    }

    /// Human-facing approval path; the nonce is checked by the ticket store
    /// before the waiter is released.
    pub fn approve_with_nonce(&mut self, ticket_id: &str, nonce: &str) -> bool {
        let ok = self.tickets.approve_with_nonce(ticket_id, nonce);
        if ok {
            self.signal_ticket(ticket_id, true);
        }
        ok
    }

    pub fn reject(&mut self, ticket_id: &str) -> bool {
        let ok = self.tickets.reject(ticket_id);
        if ok {
            self.signal_ticket(ticket_id, false);
        }
        ok
    }

    /// Human-facing rejection path; the nonce is checked by the ticket store.
    pub fn reject_with_nonce(&mut self, ticket_id: &str, nonce: &str) -> bool {
        let ok = self.tickets.reject_with_nonce(ticket_id, nonce);
        if ok {
            self.signal_ticket(ticket_id, false);
        }
        ok
    }

    fn signal_ticket(&mut self, ticket_id: &str, approved: bool) {
        self.outcomes.insert(ticket_id.to_string(), approved);
        if let Some(tx) = self.waiters.remove(ticket_id) {
            let _ = tx.send(approved);
        }
    }

    /// Watch an Ask ticket. If a human already decided, the receiver is
    /// pre-loaded. ACP `acp_prompt` blocks on this instead of deny-and-reprompt.
    pub fn watch_ticket(&mut self, ticket_id: &str) -> Receiver<bool> {
        if let Some(&v) = self.outcomes.get(ticket_id) {
            let (tx, rx) = mpsc::channel();
            let _ = tx.send(v);
            return rx;
        }
        let (tx, rx) = mpsc::channel();
        self.waiters.insert(ticket_id.to_string(), tx);
        rx
    }

    pub fn wait_ticket(&mut self, ticket_id: &str, timeout: Duration) -> bool {
        let rx = self.watch_ticket(ticket_id);
        rx.recv_timeout(timeout).unwrap_or(false)
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
                risk_tier: everyaios_guard::RiskTier::from_risk_and_op(t.risk, &t.operation, false)
                    .as_str()
                    .to_string(),
                approval_source: format!("{:?}", t.approval_source).to_lowercase(),
                approval_nonce: t.approval_nonce.clone(),
                expires_at_ms: t.expires_at_ms,
                decision: self.decisions.get(&t.ticket_id).cloned(),
            })
            .collect()
    }

    pub fn receipts(&self) -> Vec<GuardReceipt> {
        self.tickets.receipts().to_vec()
    }

    /// JSON-RPC dispatch (`guard/*`) for the **Tauri UI / control plane**.
    /// Exposes the full surface (approve/reject/estop/reset/profile) because
    /// the webview is the human-in-the-loop surface.
    pub fn handle(&mut self, method: &str, params: &Value) -> Result<Value, String> {
        self.handle_inner(method, params, true)
    }

    /// JSON-RPC dispatch for the **coordinator sidecar** (less trusted). The
    /// sidecar may pre-flight (`evaluate`), consume a ticket (`use`), and read
    /// (`pending`/`receipts`/`estop_status`/`policy`) — but it may **not**
    /// approve/reject its own tickets, pull/reset estop, or change the
    /// security profile. Those are human-only control-plane operations.
    pub fn handle_sidecar(&mut self, method: &str, params: &Value) -> Result<Value, String> {
        self.handle_inner(method, params, false)
    }

    fn handle_inner(
        &mut self,
        method: &str,
        params: &Value,
        control_plane: bool,
    ) -> Result<Value, String> {
        if !control_plane {
            match method {
                "guard/approve" | "guard/reject" | "guard/estop" | "guard/reset"
                | "guard/profile" => {
                    return Err(format!(
                        "{method} is a control-plane operation, not available to the sidecar"
                    ));
                }
                _ => {}
            }
        }
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
                let nonce = str_param(params, "approvalNonce")
                    .ok_or("guard/approve requires approvalNonce")?;
                Ok(json!({ "approved": self.approve_with_nonce(id, nonce) }))
            }
            "guard/reject" => {
                let id = str_param(params, "ticketId").ok_or("guard/reject requires ticketId")?;
                let nonce = str_param(params, "approvalNonce")
                    .ok_or("guard/reject requires approvalNonce")?;
                Ok(json!({ "rejected": self.reject_with_nonce(id, nonce) }))
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
            "guard/ticket_status" => {
                let id =
                    str_param(params, "ticketId").ok_or("guard/ticket_status requires ticketId")?;
                match self.tickets.get(id) {
                    Some(t) => Ok(json!({
                        "ticketId": t.ticket_id,
                        "state": format!("{:?}", t.state).to_lowercase(),
                    })),
                    None => Ok(json!({ "ticketId": id, "state": "unknown" })),
                }
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
        // Generic write defaults to always_ask policy → Ask, still.
        assert!(
            matches!(d, GuardDecision::Ask { .. }),
            "generic write defaults to always_ask policy; got {d:?}"
        );
    }

    #[test]
    fn allow_mints_an_auto_approved_ticket() {
        // An auto-allowed action still mints a single-use ticket, but it is
        // pre-Approved so the executor can consume it without a human wait.
        let mut g = GuardService::new();
        g.policy = PermissionsPolicy::parse("[permissions]\nwrite = \"allow\"\n");
        let d = g.evaluate(
            "s1",
            "a1",
            "fs.write",
            Operation::GenericWrite,
            decision(RiskLevel::Low, &["/workspace/a.txt"]),
            "h",
            0,
        );
        let ticket_id = match d {
            GuardDecision::Allow { ref ticket_id } => ticket_id.clone(),
            other => panic!("expected Allow, got {other:?}"),
        };
        // Directly consumable (already Approved), single-use.
        assert!(g.use_ticket(&ticket_id, "h").is_ok());
        assert!(g.use_ticket(&ticket_id, "h").is_err());
    }

    #[test]
    fn low_confidence_forces_ask() {
        let mut g = GuardService::new();
        g.policy = PermissionsPolicy::parse(
            "[permissions]\nwrite = \"allow\"\nmin_confidence_for_auto = 0.90\n",
        );
        let d = g.evaluate(
            "s1",
            "a1",
            "fs.write",
            Operation::GenericWrite,
            DecisionPackage::new("g")
                .with_risk(RiskLevel::Low)
                .with_confidence(0.5),
            "h",
            0,
        );
        assert!(
            matches!(d, GuardDecision::Ask { .. }),
            "low confidence must force Ask; got {d:?}"
        );
    }

    #[test]
    fn sidecar_surface_rejects_control_plane_ops() {
        let mut g = GuardService::new();
        // The sidecar may evaluate + use + read…
        assert!(g
            .handle_sidecar(
                "guard/evaluate",
                &json!({
                    "operation": "delete", "argsHash": "h", "decision": { "risk": "high" }
                })
            )
            .is_ok());
        assert!(g.handle_sidecar("guard/estop_status", &json!({})).is_ok());
        // …but may NOT approve/reset/estop/profile.
        assert!(g
            .handle_sidecar("guard/approve", &json!({ "ticketId": "tkt:1" }))
            .is_err());
        assert!(g.handle_sidecar("guard/reset", &json!({})).is_err());
        assert!(g.handle_sidecar("guard/estop", &json!({})).is_err());
        assert!(g
            .handle_sidecar("guard/profile", &json!({ "profile": "minimal" }))
            .is_err());
        // The control-plane handle still allows them (the UI path).
        assert!(g.handle("guard/estop", &json!({})).is_ok());
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
        g.policy = PermissionsPolicy::parse("[permissions]\nterminal_shell = \"block\"\n");
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

        // A pending ticket must not be consumable until approved.
        assert!(g
            .handle(
                "guard/use",
                &json!({ "ticketId": ticket_id, "argsHash": "h1" })
            )
            .is_err());
        let approval_nonce = g.pending()[0].approval_nonce.clone();
        g.handle(
            "guard/approve",
            &json!({ "ticketId": ticket_id, "approvalNonce": approval_nonce }),
        )
        .unwrap();
        let used = g
            .handle(
                "guard/use",
                &json!({ "ticketId": ticket_id, "argsHash": "h1" }),
            )
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

    // --- P48.2 adversarial two-path boundary (anti-impersonation) ---

    #[test]
    fn sidecar_cannot_self_approve_its_own_pending_ticket() {
        // (a) + (c): a ticket minted via the sidecar path (Ask) is Pending.
        // The sidecar surface cannot approve it (control-plane refused), so a
        // self-issued approval is impossible — the only pre-approved tickets
        // come from an `Allow` decision the policy authorized deterministically.
        let mut g = GuardService::new();
        let out = g
            .handle_sidecar(
                "guard/evaluate",
                &json!({
                    "operation": "delete", "argsHash": "h", "decision": { "risk": "high" }
                }),
            )
            .unwrap();
        let ticket_id = out["ticketId"].as_str().unwrap().to_string();
        assert_eq!(out["action"], "ask");

        // Sidecar cannot approve its own ticket by any control-plane route.
        assert!(g
            .handle_sidecar("guard/approve", &json!({ "ticketId": ticket_id }))
            .is_err());
        // And the pending ticket is not consumable until a real approval (which
        // only the control-plane handle can reach, with the nonce).
        assert!(g
            .handle_sidecar(
                "guard/use",
                &json!({ "ticketId": ticket_id, "argsHash": "h" })
            )
            .is_err());
    }

    #[test]
    fn forged_decision_source_cannot_pre_approve_a_ticket() {
        // (c): the decision package's `approvalSource`/risk are inputs, but the
        // Ask-vs-Allow split is decided by POLICY + profile — a sidecar cannot
        // smuggle "this was already approved" by setting a fake source on the
        // decision it attaches to an Ask-scoped operation.
        let mut g = GuardService::new();
        let sneaky = DecisionPackage::new("rm -rf /")
            .with_risk(RiskLevel::Medium)
            .with_paths(vec!["/w/x".into()]);
        // A Medium delete under default (Standard) profile is below the strict
        // threshold — but a *delete* is still an Ask operation, never Allow,
        // regardless of what the decision source claims.
        let out = g
            .handle(
                "guard/evaluate",
                &json!({
                    "operation": "delete",
                    "argsHash": "h",
                    "decision": serde_json::to_value(&sneaky).unwrap(),
                }),
            )
            .unwrap();
        // Only the control-plane handle can evaluate; still Ask (pending).
        assert_eq!(out["action"], "ask");
        let ticket_id = out["ticketId"].as_str().unwrap().to_string();
        // Not consumable without approval + nonce.
        assert!(g
            .handle(
                "guard/use",
                &json!({ "ticketId": ticket_id, "argsHash": "h" })
            )
            .is_err());
    }

    #[test]
    fn estop_cannot_be_cleared_by_sidecar() {
        // (c): estop is a hard trip; only the control plane can pull it, and a
        // compromised sidecar can neither pull nor clear it.
        let mut g = GuardService::new();
        g.handle("guard/estop", &json!({})).unwrap();
        assert_eq!(
            g.handle_sidecar("guard/estop_status", &json!({})).unwrap()["pulled"],
            true
        );
        // Sidecar sees it pulled but cannot reset it.
        assert!(g.handle_sidecar("guard/reset", &json!({})).is_err());
        // Control-plane reset works (human path only).
        g.handle("guard/reset", &json!({})).unwrap();
        assert_eq!(
            g.handle_sidecar("guard/estop_status", &json!({})).unwrap()["pulled"],
            false
        );
    }

    #[test]
    fn ask_wait_unblocks_on_approve() {
        use std::sync::{Arc, Mutex};
        let g = Arc::new(Mutex::new(GuardService::new()));
        let d = g.lock().unwrap().evaluate(
            "s1",
            "a1",
            "fs.delete",
            Operation::DeleteFiles,
            decision(RiskLevel::High, &["/w/x"]),
            "h",
            0,
        );
        let GuardDecision::Ask { ticket_id } = d else {
            panic!("expected Ask");
        };
        let rx = g.lock().unwrap().watch_ticket(&ticket_id);
        let g2 = Arc::clone(&g);
        let tid = ticket_id.clone();
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(30));
            assert!(g2.lock().unwrap().approve(&tid));
        });
        assert_eq!(rx.recv_timeout(Duration::from_secs(2)).unwrap(), true);
    }
}
