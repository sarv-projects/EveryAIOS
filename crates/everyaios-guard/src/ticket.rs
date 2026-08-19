//! P7.4 — the authorization ticket contract (doc 53 §3). Before any
//! privileged action executes, the coordinator mints a ticket; the executor
//! only runs an action whose ticket is valid, unexpired, unused and
//! matches the operation. Deterministic single-use enforcement keeps a dead
//! or replayed coordinator from double-executing external mutations.

use crate::prescan::ScanTarget;
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

/// Who approved the action (doc 53 §3 `approval-source`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ApprovalSource {
    /// Auto-approved under a standing rule (delete=always_ask overrides).
    Policy,
    /// Human clicked approve on a Guard-2 card.
    Human,
    /// User pre-approved via `~/.everyaios/permissions.toml`.
    PermissionsToml,
    /// Coordinator granted under least-privilege topology rules.
    Coordinator,
}

/// Risk tier of the operation (drives who must approve).
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RiskLevel {
    #[default]
    Low,
    Medium,
    High,
    Critical,
}

/// Current ticket lifecycle state.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
pub enum TicketState {
    /// Minted, awaiting a human decision (or auto-approved under policy).
    #[default]
    Pending,
    /// Human-approved (or policy auto-approved) — consumable by an executor.
    Approved,
    /// Consumed by an executor (single-use).
    Used,
    /// Rejected by the executor (arg-hash mismatch / path outside grant).
    Rejected,
    /// Expired (TTL passed).
    Expired,
    /// Revoked (estop / session abort).
    Revoked,
}

/// The authorization ticket (doc 53 §3 fields).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthorizationTicket {
    /// Unique ticket id (uuid-ish; caller-generated or via `TicketStore::mint`).
    pub ticket_id: String,
    pub agent_id: String,
    pub session_id: String,
    /// The tool the action targets (e.g. `shell.exec`, `fs.write`).
    pub tool_id: String,
    /// Canonical operation name (`write`, `delete`, `network`, `exec`).
    pub operation: String,
    /// SHA-256 of the serialized arguments the executor must match.
    pub args_hash: String,
    /// Paths the action may touch (empty = none / not path-scoped).
    pub paths: Vec<String>,
    /// UNIX ms expiry; 0 = no expiry.
    pub expires_at_ms: u64,
    /// Single-use: `true` (default) — consumed on first valid use.
    pub single_use: bool,
    pub approval_source: ApprovalSource,
    pub risk: RiskLevel,
    /// Audit sequence of the approval event this ticket refers to.
    pub audit_seq: u64,
    /// Set by the executor on consume/reject/expire.
    #[serde(default)]
    pub state: TicketState,
}

impl AuthorizationTicket {
    /// Is this ticket consumable right now? A ticket is consumable only once
    /// it has been *approved* (human `approve()` or policy auto-approval) —
    /// a `Pending` ticket is not valid for execution.
    pub fn is_valid(&self) -> bool {
        if self.state != TicketState::Approved {
            return false;
        }
        if self.expires_at_ms != 0 && now_ms() > self.expires_at_ms {
            return false;
        }
        true
    }

    /// Does the caller's args hash match the ticket's?
    pub fn matches_args(&self, args_hash: &str) -> bool {
        self.args_hash == args_hash
    }

    /// Consume the ticket (single-use). Returns false if already used/invalid.
    pub fn consume(&mut self, args_hash: &str) -> bool {
        if !self.is_valid() || !self.matches_args(args_hash) {
            return false;
        }
        if self.single_use {
            self.state = TicketState::Used;
        }
        true
    }
}

/// In-memory ticket store with single-use + expiry enforcement.
#[derive(Debug, Default)]
pub struct TicketStore {
    tickets: std::collections::HashMap<String, AuthorizationTicket>,
    /// Append-only approve/reject receipts (P7.5 audit trail).
    receipts: Vec<GuardReceipt>,
}

impl TicketStore {
    pub fn new() -> Self {
        Self::default()
    }

    /// The append-only approval/denial audit receipts.
    pub fn receipts(&self) -> &[GuardReceipt] {
        &self.receipts
    }

    fn record(&mut self, id: &str, action: ReceiptAction) -> bool {
        let Some(t) = self.tickets.get(id) else {
            return false;
        };
        let seq = self.receipts.len();
        let receipt = GuardReceipt::new(format!("rcpt:{seq}"), t, action, now_ms());
        self.receipts.push(receipt);
        true
    }

    pub fn mint(&mut self, ticket: AuthorizationTicket) -> String {
        let id = ticket.ticket_id.clone();
        self.tickets.insert(id.clone(), ticket);
        id
    }

    /// Look up + consume. Enforces **approval first**, then validity, arg
    /// match and single-use. A `Pending` ticket (minted but not yet approved)
    /// is refused with [`TicketError::NotApproved`] — approval is a hard
    /// prerequisite for consumption, never a side-channel.
    pub fn use_ticket(&mut self, id: &str, args_hash: &str) -> Result<(), TicketError> {
        let Some(t) = self.tickets.get_mut(id) else {
            return Err(TicketError::Unknown);
        };
        if t.expires_at_ms != 0 && now_ms() > t.expires_at_ms {
            t.state = TicketState::Expired;
            return Err(TicketError::Expired);
        }
        if t.state == TicketState::Used {
            return Err(TicketError::AlreadyUsed);
        }
        if t.state == TicketState::Revoked {
            return Err(TicketError::Revoked);
        }
        if t.state == TicketState::Pending {
            return Err(TicketError::NotApproved);
        }
        if !t.matches_args(args_hash) {
            t.state = TicketState::Rejected;
            return Err(TicketError::ArgsMismatch);
        }
        if t.single_use {
            t.state = TicketState::Used;
        }
        Ok(())
    }

    pub fn revoke(&mut self, id: &str) {
        if let Some(t) = self.tickets.get_mut(id) {
            t.state = TicketState::Revoked;
        }
    }

    /// P7.5 (Guard-2) — the open tickets the approval card renders: every
    /// `Pending` ticket that has not yet been consumed/rejected/revoked.
    pub fn pending(&self) -> Vec<&AuthorizationTicket> {
        self.tickets
            .values()
            .filter(|t| t.state == TicketState::Pending)
            .collect()
    }

    /// P7.5 (Guard-2) — record a human approve on a pending ticket. This is
    /// the **only** transition into [`TicketState::Approved`] (consumable):
    /// it flips `Pending → Approved`, sets `approval_source = Human`, and
    /// appends an audit receipt. Returns false when the ticket is missing or
    /// no longer pending. Consumption still happens later via `use_ticket`,
    /// which now *requires* this Approved state (args hash + single-use).
    pub fn approve(&mut self, id: &str) -> bool {
        let ok = match self.tickets.get_mut(id) {
            Some(t) if t.state == TicketState::Pending => {
                t.state = TicketState::Approved;
                t.approval_source = ApprovalSource::Human;
                true
            }
            _ => false,
        };
        if ok {
            self.record(id, ReceiptAction::Approve);
        }
        ok
    }

    /// P7.5 (Guard-2) — record a human reject on a pending ticket (revokes it
    /// + appends an audit receipt). Returns false when missing/non-pending.
    pub fn reject(&mut self, id: &str) -> bool {
        let ok = match self.tickets.get_mut(id) {
            Some(t) if t.state == TicketState::Pending => {
                t.state = TicketState::Revoked;
                true
            }
            _ => false,
        };
        if ok {
            self.record(id, ReceiptAction::Reject);
        }
        ok
    }

    pub fn get(&self, id: &str) -> Option<&AuthorizationTicket> {
        self.tickets.get(id)
    }
}

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum TicketError {
    #[error("unknown ticket")]
    Unknown,
    #[error("ticket expired")]
    Expired,
    #[error("ticket already used")]
    AlreadyUsed,
    #[error("ticket revoked")]
    Revoked,
    #[error("ticket not approved (pending human decision)")]
    NotApproved,
    #[error("args hash mismatch")]
    ArgsMismatch,
}

/// Current unix time in ms (injectable in tests via `set_now_ms`).
fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// A human approve/reject decision, recorded as an append-only audit receipt
/// (P7.5 — "approval/denial audit logging with receipt"). The hash covers
/// every field, so a receipt is tamper-evident.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GuardReceipt {
    pub receipt_id: String,
    pub ticket_id: String,
    pub session_id: String,
    pub tool_id: String,
    pub operation: String,
    pub action: ReceiptAction,
    pub ts_ms: u64,
    /// SHA-256 over the serialized receipt fields (self-hash, keyed on the
    /// fields above in order).
    pub hash: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ReceiptAction {
    Approve,
    Reject,
}

impl GuardReceipt {
    /// Build + self-hash a receipt.
    pub fn new(
        receipt_id: String,
        ticket: &AuthorizationTicket,
        action: ReceiptAction,
        ts_ms: u64,
    ) -> Self {
        let hash = hash_args(&[
            &receipt_id,
            &ticket.ticket_id,
            &ticket.session_id,
            &ticket.tool_id,
            &ticket.operation,
            match action {
                ReceiptAction::Approve => "approve",
                ReceiptAction::Reject => "reject",
            },
            &ts_ms.to_string(),
        ]);
        Self {
            receipt_id,
            ticket_id: ticket.ticket_id.clone(),
            session_id: ticket.session_id.clone(),
            tool_id: ticket.tool_id.clone(),
            operation: ticket.operation.clone(),
            action,
            ts_ms,
            hash,
        }
    }
}

/// Stable helper: hash the args for a ticket (deterministic, keyed by
/// serialization order — caller must serialize canonically).
pub fn hash_args(parts: &[&str]) -> String {
    use sha2::{Digest, Sha256};
    let mut h = Sha256::new();
    for p in parts {
        h.update(p.as_bytes());
        h.update([0u8]);
    }
    let out = h.finalize();
    out.iter().map(|b| format!("{b:02x}")).collect()
}

/// Convenience: build a ticket for a path-scoped operation.
///
/// The argument count mirrors the doc 53 §3 ticket contract — kept explicit
/// on purpose (a builder would hide required fields).
#[allow(clippy::too_many_arguments)]
pub fn path_ticket(
    ticket_id: &str,
    agent_id: &str,
    session_id: &str,
    tool_id: &str,
    operation: &str,
    paths: &[&str],
    args_hash: &str,
    risk: RiskLevel,
    audit_seq: u64,
) -> AuthorizationTicket {
    AuthorizationTicket {
        ticket_id: ticket_id.to_string(),
        agent_id: agent_id.to_string(),
        session_id: session_id.to_string(),
        tool_id: tool_id.to_string(),
        operation: operation.to_string(),
        args_hash: args_hash.to_string(),
        paths: paths.iter().map(|p| p.to_string()).collect(),
        expires_at_ms: now_ms() + 60_000,
        single_use: true,
        approval_source: ApprovalSource::Policy,
        risk,
        audit_seq,
        state: TicketState::Pending,
    }
}

/// Prove ScanTarget is importable here (used by the card renderer in P7.5).
#[allow(dead_code)]
fn _scan_target_roundtrip(t: ScanTarget) -> &'static str {
    t.as_str()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ticket(id: &str) -> AuthorizationTicket {
        path_ticket(id, "agent-1", "sess-1", "fs.delete", "delete", &["/workspace/x"], "h1", RiskLevel::High, 1)
    }

    /// A ticket that has already been human-approved (consumable).
    fn approved(id: &str) -> AuthorizationTicket {
        let mut t = ticket(id);
        t.state = TicketState::Approved;
        t
    }

    #[test]
    fn single_use_enforced() {
        let mut store = TicketStore::new();
        let id = store.mint(approved("t1"));
        assert!(store.use_ticket(&id, "h1").is_ok());
        assert_eq!(store.use_ticket(&id, "h1"), Err(TicketError::AlreadyUsed));
    }

    #[test]
    fn pending_ticket_requires_approval() {
        let mut store = TicketStore::new();
        // A freshly-minted (Pending) ticket must NOT be consumable — approval
        // is the prerequisite, not an optional side-channel.
        let id = store.mint(ticket("tp"));
        assert_eq!(store.use_ticket(&id, "h1"), Err(TicketError::NotApproved));
        assert!(store.approve(&id));
        assert!(store.use_ticket(&id, "h1").is_ok());
    }

    #[test]
    fn args_mismatch_rejects() {
        let mut store = TicketStore::new();
        let id = store.mint(approved("t2"));
        assert_eq!(store.use_ticket(&id, "wrong"), Err(TicketError::ArgsMismatch));
        assert_eq!(store.get(&id).unwrap().state, TicketState::Rejected);
    }

    #[test]
    fn revoke_blocks() {
        let mut store = TicketStore::new();
        let id = store.mint(approved("t3"));
        store.revoke(&id);
        assert_eq!(store.use_ticket(&id, "h1"), Err(TicketError::Revoked));
    }

    #[test]
    fn unknown_rejected() {
        let mut store = TicketStore::new();
        assert_eq!(store.use_ticket("nope", "h"), Err(TicketError::Unknown));
    }

    #[test]
    fn hash_is_deterministic_and_order_sensitive() {
        assert_eq!(hash_args(&["a", "b"]), hash_args(&["a", "b"]));
        assert_ne!(hash_args(&["a", "b"]), hash_args(&["b", "a"]));
    }

    #[test]
    fn pending_lists_open_tickets_and_approve_records_human() {
        let mut store = TicketStore::new();
        let a = store.mint(ticket("ta"));
        let b = store.mint(ticket("tb"));
        store.revoke(&b);
        // Only the still-pending ticket is listed.
        assert_eq!(store.pending().len(), 1);
        assert_eq!(store.pending()[0].ticket_id, "ta");
        // Human approve records the source; consumption still enforces args.
        assert!(store.approve(&a));
        assert_eq!(store.get(&a).unwrap().approval_source, ApprovalSource::Human);
        assert!(store.use_ticket(&a, "h1").is_ok());
        // Approve on a non-pending/unknown ticket is a no-op.
        assert!(!store.approve(&a));
        assert!(!store.approve("ghost"));
    }

    #[test]
    fn approve_and_reject_record_audit_receipts() {
        let mut store = TicketStore::new();
        let a = store.mint(ticket("ta"));
        let b = store.mint(ticket("tb"));

        assert!(store.approve(&a));
        assert!(store.reject(&b));

        let receipts = store.receipts();
        assert_eq!(receipts.len(), 2);
        assert_eq!(receipts[0].action, ReceiptAction::Approve);
        assert_eq!(receipts[0].ticket_id, "ta");
        assert_eq!(receipts[1].action, ReceiptAction::Reject);
        assert_eq!(receipts[1].ticket_id, "tb");
        // Reject revoked the ticket.
        assert_eq!(store.get(&b).unwrap().state, TicketState::Revoked);
        // The receipt hash is deterministic over its fields.
        assert_eq!(receipts[0].hash.len(), 64);
        assert_ne!(receipts[0].hash, receipts[1].hash);
        // Reject on a non-pending ticket records nothing.
        assert!(!store.reject(&b));
        assert_eq!(store.receipts().len(), 2);
    }
}
