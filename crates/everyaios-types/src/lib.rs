//! P47.3 — **everyaios-types**: the shared contract crate (spec §4.0 item 20,
//! the "one structural change" the v3.59 architecture finalization chose).
//!
//! This crate exists to **kill contract drift between crates**. Every ID and
//! every status/risk/governance enum has exactly one canonical home here; the
//! other EveryAIOS crates name the same thing the same way instead of each
//! minting a slightly-different copy. Deliberately **pure**: newtypes + enums
//! only — no business logic, no DB, no networking, no IO.
//!
//! Rules for contributors:
//! - An ID that shows up on a wire boundary / across two crates lives here.
//! - A status/risk/category enum that two crates would otherwise re-declare
//!   lives here.
//! - Nothing with side effects. If you need behavior, add it as an `impl`
//!   on a type that already exists, or put it in the crate that owns the
//!   behavior (never here).

use serde::{Deserialize, Serialize};

// ────────────────────────────────────────────────────────────────────────
// ID newtypes — opaque, serializable, displayable, comparable.
// Use these on any cross-crate wire boundary so a `WorkId` can never be
// silently passed where a `TicketId` is expected (the pain point this crate
// exists to remove).
// ────────────────────────────────────────────────────────────────────────

macro_rules! id_newtype {
    ($(#[$doc:meta])* $name:ident) => {
        $(#[$doc])*
        #[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
        #[serde(transparent)]
        pub struct $name(pub String);

        impl $name {
            pub fn new(v: impl Into<String>) -> Self {
                Self(v.into())
            }
            pub fn as_str(&self) -> &str {
                &self.0
            }
        }

        impl std::fmt::Display for $name {
            fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                write!(f, "{}", self.0)
            }
        }

        impl From<String> for $name {
            fn from(v: String) -> Self {
                Self(v)
            }
        }

        impl From<&str> for $name {
            fn from(v: &str) -> Self {
                Self(v.to_string())
            }
        }
    };
}

id_newtype!(
    /// The durable unit of work (the product name for the `Execution` hub).
    WorkId
);
id_newtype!(
    /// A workspace / project root identity.
    ProjectId
);
id_newtype!(
    /// A chat / agent session.
    SessionId
);
id_newtype!(
    /// A single run of a work item.
    RunId
);
id_newtype!(
    /// A recorded execution step inside a work item.
    ExecutionId
);
id_newtype!(
    /// A Guard-2 authorization ticket.
    TicketId
);
id_newtype!(
    /// A (work- or effect-level) audit receipt.
    ReceiptId
);
id_newtype!(
    /// An artifact produced during work.
    ArtifactId
);
id_newtype!(
    /// A resource identity (file, sheet+cell, URL, window …) a ticket binds.
    ResourceId
);
id_newtype!(
    /// The acting agent.
    AgentId
);
id_newtype!(
    /// An extension capability id.
    CapabilityId
);
id_newtype!(
    /// A model/provider identity.
    ProviderId
);
id_newtype!(
    /// An installed/registered skill slug.
    SkillId
);
id_newtype!(
    /// A distributed-trace correlation id.
    TraceId
);

// ────────────────────────────────────────────────────────────────────────
// Hash newtypes
// ────────────────────────────────────────────────────────────────────────

id_newtype!(
    /// A content-addressable config/runtime-manifest hash.
    ConfigHash
);
id_newtype!(
    /// A canonical-args SHA-256 hash bound into a ticket.
    ArgsHash
);

// ────────────────────────────────────────────────────────────────────────
// Shared enum vocabulary
// ────────────────────────────────────────────────────────────────────────

/// The lifecycle of a durable unit of work.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WorkState {
    Pending,
    Running,
    Paused,
    Completed,
    Cancelled,
    Failed,
}

/// The phase of an execution step.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ExecutionState {
    Ready,
    Running,
    Completed,
    Failed,
    Rejected,
}

/// The guard risk band. Canonical so every crate grades an action on the
/// same scale (the `RiskLevel` re-declarations in `everyaios-guard` and
/// `everyaios-engine` are aliased to this).
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RiskLevel {
    #[default]
    Low,
    Medium,
    High,
    Critical,
}

/// The H34 autonomy level (canonical — the UI/native/Rust all agree).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AutonomyLevel {
    Sandbox,
    Ask,
    Auto,
    Maximum,
}

/// Who governs an effect: policy-auto, a human gesture, a ticket, an
/// automation task. The single source of truth for audit `authorization`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GovernanceMode {
    AgentTicket,
    AutomationTicket,
    HumanGesture,
    Policy,
    Coordinator,
}

/// The honesty status of evidence for a claim/effect.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EvidenceStatus {
    Verified,
    PartiallyComplete,
    Degraded,
    Unverifiable,
    NotVerified,
}

/// Ownership/lifecycle of a resource a ticket or audit binds.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ResourceState {
    Free,
    Owned,
    Locked,
    Released,
    Tombstone,
}

/// The retry class of an effect (doc 53 §4 — safe-retry / unsafe /
/// same-key / confirm-after-uncertain).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum IdempotencyClass {
    /// Read-only / deterministic — retry freely.
    SafeRetry,
    /// Mutates (write, send, execute) — never auto-retry.
    UnsafeRetry,
    /// Retry only with an identical idempotency key; broker dedupes.
    SameKey,
    /// Outcome unknown (network drop mid-mutation) — confirm before retry.
    ConfirmAfterUncertain,
}

impl IdempotencyClass {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::SafeRetry => "safe_retry",
            Self::UnsafeRetry => "unsafe_retry",
            Self::SameKey => "same_key",
            Self::ConfirmAfterUncertain => "confirm_after_uncertain",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn newtype_ids_are_opaque_and_round_trip() {
        let w = WorkId::new("w-1");
        assert_eq!(w.as_str(), "w-1");
        assert_eq!(w.to_string(), "w-1");
        let json = serde_json::to_string(&w).unwrap();
        assert_eq!(json, "\"w-1\""); // transparent: serializes as the string
        let back: WorkId = serde_json::from_str(&json).unwrap();
        assert_eq!(back, w);
        // A WorkId is not comparable to a TicketId (compile-time safety).
        // (No runtime assertion needed — this is a type-level guarantee.)
    }

    #[test]
    fn every_id_serializes_transparent() {
        for s in [
            serde_json::to_string(&WorkId::new("x")).unwrap(),
            serde_json::to_string(&TicketId::new("t")).unwrap(),
            serde_json::to_string(&ReceiptId::new("r")).unwrap(),
            serde_json::to_string(&ConfigHash::new("c")).unwrap(),
        ] {
            assert!(s.starts_with('"') && s.ends_with('"'));
        }
    }

    #[test]
    fn enums_round_trip_and_are_versioned_names() {
        let lvl: RiskLevel = serde_json::from_str("\"critical\"").unwrap();
        assert_eq!(lvl, RiskLevel::Critical);
        let act: AutonomyLevel = serde_json::from_str("\"maximum\"").unwrap();
        assert_eq!(act, AutonomyLevel::Maximum);
        assert_eq!(IdempotencyClass::UnsafeRetry.as_str(), "unsafe_retry");
    }
}
