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
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub enum RiskLevel {
    Low,
    Medium,
    High,
    Critical,
}

/// Current ticket lifecycle state.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
pub enum TicketState {
    /// Minted, not yet used.
    #[default]
    Pending,
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
    /// Is this ticket still usable right now?
    pub fn is_valid(&self) -> bool {
        if self.state != TicketState::Pending {
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
}

impl TicketStore {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn mint(&mut self, ticket: AuthorizationTicket) -> String {
        let id = ticket.ticket_id.clone();
        self.tickets.insert(id.clone(), ticket);
        id
    }

    /// Look up + consume. Enforces validity, arg match and single-use.
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

    #[test]
    fn single_use_enforced() {
        let mut store = TicketStore::new();
        let id = store.mint(ticket("t1"));
        assert!(store.use_ticket(&id, "h1").is_ok());
        assert_eq!(store.use_ticket(&id, "h1"), Err(TicketError::AlreadyUsed));
    }

    #[test]
    fn args_mismatch_rejects() {
        let mut store = TicketStore::new();
        let id = store.mint(ticket("t2"));
        assert_eq!(store.use_ticket(&id, "wrong"), Err(TicketError::ArgsMismatch));
        assert_eq!(store.get(&id).unwrap().state, TicketState::Rejected);
    }

    #[test]
    fn revoke_blocks() {
        let mut store = TicketStore::new();
        let id = store.mint(ticket("t3"));
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
}
