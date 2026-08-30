//! Permission gate — port of stages/permission-gate.ts + Algorithm #12's base
//! `evaluatePermissionGate` (core-tools/src/permission-gate.ts).
//!
//! This is the pure, deterministic, LLM-free slice the engine runs *around*
//! each tool call: given the agent's max risk, the surface, and the tool's
//! risk level, it decides grant / session-first confirm / always confirm.
//! Mirrors the TS reference so the port is diffable:
//!
//!   - allowlist check first (hard fail, never confirmed)
//!   - `effectiveRisk = higherRisk(agentMax, toolRisk)`
//!   - effective == destructive | external-write  → always confirm
//!   - effective == local-write → granted iff sessionApproved OR the
//!     per-session family map already holds `local-write`; else session-first
//!   - effective == read (and lower) → granted, no confirm
//!
//! The session-approval map is kept as a caller-owned `SessionApprovals` (the
//! caller picks storage + clock) so nothing here is global or time-dependent in
//! the unit tests. TTL/size pruning mirrors the TS `MAX_SESSION_KEYS` (200) and
//! `APPROVAL_TTL_MS` (30 min).

use std::collections::{HashMap, HashSet};
use std::time::{SystemTime, UNIX_EPOCH};

/// Risk levels ordered low → high (mirrors `RISK_ORDER`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub enum RiskLevel {
    Read,
    LocalWrite,
    ExternalWrite,
    Destructive,
}

impl TryFrom<&str> for RiskLevel {
    type Error = ();
    fn try_from(s: &str) -> Result<Self, ()> {
        match s {
            "read" => Ok(RiskLevel::Read),
            "local-write" => Ok(RiskLevel::LocalWrite),
            "external-write" => Ok(RiskLevel::ExternalWrite),
            "destructive" => Ok(RiskLevel::Destructive),
            _ => Err(()),
        }
    }
}

/// `higherRisk(a, b)` — agent max is not a cap; the more dangerous wins.
pub fn higher_risk(a: RiskLevel, b: RiskLevel) -> RiskLevel {
    a.max(b)
}

/// Kind of confirmation demanded, mirroring `GateResult.confirmationKind`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ConfirmationKind {
    SessionFirst,
    Always,
}

/// Output of `evaluatePermissionGate` — mirrors `GateResult`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GateResult {
    pub granted: bool,
    pub requires_confirmation: bool,
    pub confirmation_kind: Option<ConfirmationKind>,
    /// Fail-closed allowlist denial reason (mirrors the `reason` field).
    pub reason: Option<String>,
}

const MAX_SESSION_KEYS: usize = 200;
/// 30 minutes — mirrors `APPROVAL_TTL_MS`.
const APPROVAL_TTL_MS: u64 = 30 * 60 * 1_000;

#[derive(Debug)]
struct ApprovalEntry {
    risks: HashSet<RiskLevel>,
    last_access_ms: u64,
}

/// Per-session scoped approval map, keyed `${sessionId}:${family}`.
/// Caller-owned so no global state leaks across tests or sessions.
#[derive(Debug, Default)]
pub struct SessionApprovals {
    map: HashMap<String, ApprovalEntry>,
}

impl SessionApprovals {
    pub fn new() -> Self {
        Self::default()
    }

    fn prune(&mut self, now_ms: u64) {
        // 1) TTL-evict expired entries.
        self.map
            .retain(|_, e| now_ms.saturating_sub(e.last_access_ms) <= APPROVAL_TTL_MS);
        // 2) If still over cap, drop oldest by insertion (HashMap is O(1) pop).
        while self.map.len() > MAX_SESSION_KEYS {
            if let Some(key) = self.map.keys().next().map(|k| k.clone()) {
                self.map.remove(&key);
            } else {
                break;
            }
        }
    }

    /// `evaluatePermissionGate(agentMaxRisk, surface, tool, sessionApproved)`.
    /// `surface_allowlist` reflects the tool contract's allowed surfaces; the
    /// engine's scaffold passes the single active surface.
    pub fn evaluate(
        &mut self,
        now_ms: u64,
        agent_max_risk: RiskLevel,
        surface: &str,
        surface_allowlist: &[&str],
        tool_family: &str,
        tool_risk: RiskLevel,
        session_id: &str,
        session_approved: bool,
    ) -> GateResult {
        self.prune(now_ms);

        if !surface_allowlist.contains(&surface) {
            return GateResult {
                granted: false,
                requires_confirmation: false,
                confirmation_kind: None,
                reason: Some(format!("Tool not allowed on {surface} surface")),
            };
        }

        match higher_risk(agent_max_risk, tool_risk) {
            RiskLevel::Destructive | RiskLevel::ExternalWrite => GateResult {
                granted: false,
                requires_confirmation: true,
                confirmation_kind: Some(ConfirmationKind::Always),
                reason: None,
            },
            RiskLevel::LocalWrite => {
                if session_approved || self.family_approved(session_id, tool_family) {
                    GateResult {
                        granted: true,
                        requires_confirmation: false,
                        confirmation_kind: None,
                        reason: None,
                    }
                } else {
                    GateResult {
                        granted: false,
                        requires_confirmation: true,
                        confirmation_kind: Some(ConfirmationKind::SessionFirst),
                        reason: None,
                    }
                }
            }
            RiskLevel::Read => GateResult {
                granted: true,
                requires_confirmation: false,
                confirmation_kind: None,
                reason: None,
            },
        }
    }

    fn family_approved(&self, session_id: &str, family: &str) -> bool {
        let key = format!("{session_id}:{family}");
        self.map
            .get(&key)
            .is_some_and(|e| e.risks.contains(&RiskLevel::LocalWrite))
    }

    /// `approveRiskForSession(sessionId, family, risk)` + prune.
    pub fn approve(&mut self, now_ms: u64, session_id: &str, family: &str, risk: RiskLevel) {
        let key = format!("{session_id}:{family}");
        let entry = self.map.entry(key).or_insert_with(|| ApprovalEntry {
            risks: HashSet::new(),
            last_access_ms: now_ms,
        });
        entry.risks.insert(risk);
        entry.last_access_ms = now_ms;
        self.prune(now_ms);
    }

    /// `clearSessionApprovals(sessionId?)`.
    pub fn clear(&mut self, session_id: Option<&str>) {
        match session_id {
            Some(sid) => {
                let prefix = format!("{sid}:");
                self.map.retain(|k, _| !k.starts_with(&prefix));
            }
            None => self.map.clear(),
        }
    }
}

/// Wall-clock ms convenience mirroring TS `Date.now()`.
pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn gate_eval(
        approvals: &mut SessionApprovals,
        agent_max: RiskLevel,
        risk: RiskLevel,
        session_approved: bool,
    ) -> GateResult {
        approvals.evaluate(
            now_ms(),
            agent_max,
            "chat",
            &["chat"],
            "knowledge",
            risk,
            "sess-1",
            session_approved,
        )
    }

    #[test]
    fn read_is_granted_unconditionally() {
        let mut a = SessionApprovals::new();
        let r = gate_eval(&mut a, RiskLevel::Read, RiskLevel::Read, false);
        assert!(r.granted);
        assert!(!r.requires_confirmation);
    }

    #[test]
    fn agent_max_not_a_cap_writes_require_confirm() {
        // local-write tool under a read-only agent max → effective local-write.
        let mut a = SessionApprovals::new();
        let r = gate_eval(&mut a, RiskLevel::Read, RiskLevel::LocalWrite, false);
        assert!(!r.granted);
        assert_eq!(r.confirmation_kind, Some(ConfirmationKind::SessionFirst));
    }

    #[test]
    fn session_approval_grants_local_write() {
        let mut a = SessionApprovals::new();
        let r = gate_eval(&mut a, RiskLevel::Read, RiskLevel::LocalWrite, true);
        assert!(r.granted);
    }

    #[test]
    fn approve_then_local_write_grants_without_session_flag() {
        let mut a = SessionApprovals::new();
        a.approve(now_ms(), "sess-1", "knowledge", RiskLevel::LocalWrite);
        let r = gate_eval(&mut a, RiskLevel::Read, RiskLevel::LocalWrite, false);
        assert!(r.granted);
    }

    #[test]
    fn destructive_always_confirms_even_if_session_approved() {
        let mut a = SessionApprovals::new();
        a.approve(now_ms(), "sess-1", "knowledge", RiskLevel::Destructive);
        let r = gate_eval(&mut a, RiskLevel::Read, RiskLevel::Destructive, true);
        assert!(!r.granted);
        assert_eq!(r.confirmation_kind, Some(ConfirmationKind::Always));
    }

    #[test]
    fn external_write_always_confirms() {
        let mut a = SessionApprovals::new();
        let r = gate_eval(&mut a, RiskLevel::Read, RiskLevel::ExternalWrite, true);
        assert!(!r.granted);
        assert_eq!(r.confirmation_kind, Some(ConfirmationKind::Always));
    }

    #[test]
    fn surface_allowlist_is_a_hard_fail() {
        let mut a = SessionApprovals::new();
        let r = a.evaluate(
            now_ms(),
            RiskLevel::Read,
            "reader",
            &["chat"],
            "knowledge",
            RiskLevel::Read,
            "sess-1",
            false,
        );
        assert!(!r.granted);
        assert!(!r.requires_confirmation);
        assert!(r.reason.is_some());
    }

    #[test]
    fn approval_is_family_scoped() {
        let mut a = SessionApprovals::new();
        a.approve(now_ms(), "sess-1", "creation", RiskLevel::LocalWrite);
        // Different family does not inherit the approval.
        let r = gate_eval(&mut a, RiskLevel::Read, RiskLevel::LocalWrite, false);
        assert!(!r.granted);
    }

    #[test]
    fn clear_all_resets_session_map() {
        let mut a = SessionApprovals::new();
        a.approve(now_ms(), "sess-1", "knowledge", RiskLevel::LocalWrite);
        a.clear(None);
        let r = gate_eval(&mut a, RiskLevel::Read, RiskLevel::LocalWrite, false);
        assert!(!r.granted);
    }

    #[test]
    fn ttl_evicts_stale_approvals() {
        let mut a = SessionApprovals::new();
        let start = 1_000_000u64;
        a.approve(start, "sess-1", "knowledge", RiskLevel::LocalWrite);
        // 31 minutes later: expired → not granted.
        let r = a.evaluate(
            start + APPROVAL_TTL_MS + 1,
            RiskLevel::Read,
            "chat",
            &["chat"],
            "knowledge",
            RiskLevel::LocalWrite,
            "sess-1",
            false,
        );
        assert!(!r.granted);
    }
}
