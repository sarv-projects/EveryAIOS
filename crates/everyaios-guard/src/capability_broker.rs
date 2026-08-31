//! P49.7 — local CapabilityBroker.
//!
//! The broker is intentionally independent of secrets: it issues opaque
//! handles and authorizes requests by run, capability scope, and expiry.
//! Secret material remains in the vault/connector host and is never returned
//! by this module.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CapabilityRequest {
    pub run_id: String,
    pub capability: String,
    pub operation: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct EphemeralCredential {
    pub handle: String,
    pub scope: String,
    pub issued_for: String,
    pub expires_at_ms: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CapabilityGrant {
    pub grant_id: String,
    pub run_id: String,
    pub capability: String,
    pub handle: EphemeralCredential,
    pub issued_at_ms: u64,
    pub revoked: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum CapabilityBrokerError {
    #[error("capability request is missing a run id")]
    MissingRun,
    #[error("capability request is missing a scope")]
    MissingCapability,
    #[error("capability is not authorized for this run")]
    NotAuthorized,
    #[error("capability grant is expired")]
    Expired,
    #[error("capability grant is revoked")]
    Revoked,
    #[error("unknown capability grant")]
    UnknownGrant,
    #[error("capability request does not match the grant")]
    ScopeMismatch,
}

pub trait CapabilityBroker {
    fn list_capabilities(&self, run_id: &str) -> Vec<String>;
    fn authorize(
        &mut self,
        request: CapabilityRequest,
        ttl_ms: u64,
    ) -> Result<CapabilityGrant, CapabilityBrokerError>;
    fn invoke(
        &self,
        grant_id: &str,
        request: &CapabilityRequest,
    ) -> Result<EphemeralCredential, CapabilityBrokerError>;
    fn revoke(&mut self, grant_id: &str) -> bool;
}

#[derive(Debug, Default)]
pub struct LocalCapabilityBroker {
    grants: HashMap<String, CapabilityGrant>,
    allowed: HashMap<String, Vec<String>>,
    next_id: u64,
}

impl LocalCapabilityBroker {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn allow_for_run(&mut self, run_id: impl Into<String>, capabilities: Vec<String>) {
        self.allowed.insert(run_id.into(), capabilities);
    }

    fn matches(pattern: &str, value: &str) -> bool {
        pattern == value
            || (pattern.ends_with("**") && value.starts_with(pattern.trim_end_matches("**")))
    }
}

impl CapabilityBroker for LocalCapabilityBroker {
    fn list_capabilities(&self, run_id: &str) -> Vec<String> {
        self.allowed.get(run_id).cloned().unwrap_or_default()
    }

    fn authorize(
        &mut self,
        request: CapabilityRequest,
        ttl_ms: u64,
    ) -> Result<CapabilityGrant, CapabilityBrokerError> {
        if request.run_id.is_empty() {
            return Err(CapabilityBrokerError::MissingRun);
        }
        if request.capability.is_empty() {
            return Err(CapabilityBrokerError::MissingCapability);
        }
        if !self
            .list_capabilities(&request.run_id)
            .iter()
            .any(|p| Self::matches(p, &request.capability))
        {
            return Err(CapabilityBrokerError::NotAuthorized);
        }
        self.next_id += 1;
        let at = now_ms();
        let grant_id = format!("grant:{}", self.next_id);
        let handle = EphemeralCredential {
            handle: format!("cred:{}", self.next_id),
            scope: request.capability.clone(),
            issued_for: request.run_id.clone(),
            expires_at_ms: if ttl_ms == 0 {
                0
            } else {
                at.saturating_add(ttl_ms)
            },
        };
        let grant = CapabilityGrant {
            grant_id: grant_id.clone(),
            run_id: request.run_id,
            capability: request.capability,
            handle,
            issued_at_ms: at,
            revoked: false,
        };
        self.grants.insert(grant_id, grant.clone());
        Ok(grant)
    }

    fn invoke(
        &self,
        grant_id: &str,
        request: &CapabilityRequest,
    ) -> Result<EphemeralCredential, CapabilityBrokerError> {
        let grant = self
            .grants
            .get(grant_id)
            .ok_or(CapabilityBrokerError::UnknownGrant)?;
        if grant.revoked {
            return Err(CapabilityBrokerError::Revoked);
        }
        if grant.handle.expires_at_ms != 0 && now_ms() > grant.handle.expires_at_ms {
            return Err(CapabilityBrokerError::Expired);
        }
        if grant.run_id != request.run_id
            || grant.capability != request.capability
            || !Self::matches(&grant.capability, &request.capability)
        {
            return Err(CapabilityBrokerError::ScopeMismatch);
        }
        Ok(grant.handle.clone())
    }

    fn revoke(&mut self, grant_id: &str) -> bool {
        self.grants
            .get_mut(grant_id)
            .map(|g| {
                g.revoked = true;
                true
            })
            .unwrap_or(false)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request() -> CapabilityRequest {
        CapabilityRequest {
            run_id: "run-1".into(),
            capability: "connector:gmail.read".into(),
            operation: "list".into(),
        }
    }

    #[test]
    fn grants_are_opaque_and_run_scoped() {
        let mut broker = LocalCapabilityBroker::new();
        broker.allow_for_run("run-1", vec!["connector:gmail.**".into()]);
        let grant = broker.authorize(request(), 60_000).unwrap();
        assert!(!grant.handle.handle.contains("gmail"));
        assert!(broker.invoke(&grant.grant_id, &request()).is_ok());
        let mut other = request();
        other.run_id = "run-2".into();
        assert!(matches!(
            broker.invoke(&grant.grant_id, &other),
            Err(CapabilityBrokerError::ScopeMismatch)
        ));
    }

    #[test]
    fn revoke_is_fail_closed() {
        let mut broker = LocalCapabilityBroker::new();
        broker.allow_for_run("run-1", vec!["fs.read:**".into()]);
        let grant = broker
            .authorize(
                CapabilityRequest {
                    run_id: "run-1".into(),
                    capability: "fs.read:/tmp/x".into(),
                    operation: "read".into(),
                },
                60_000,
            )
            .unwrap();
        assert!(broker.revoke(&grant.grant_id));
        assert!(matches!(
            broker.invoke(
                &grant.grant_id,
                &CapabilityRequest {
                    run_id: "run-1".into(),
                    capability: "fs.read:/tmp/x".into(),
                    operation: "read".into()
                }
            ),
            Err(CapabilityBrokerError::Revoked)
        ));
    }

    #[test]
    fn unlisted_capability_is_denied() {
        let mut broker = LocalCapabilityBroker::new();
        broker.allow_for_run("run-1", vec!["connector:gmail.read".into()]);
        assert!(matches!(
            broker.authorize(
                CapabilityRequest {
                    run_id: "run-1".into(),
                    capability: "connector:gmail.send".into(),
                    operation: "send".into()
                },
                1
            ),
            Err(CapabilityBrokerError::NotAuthorized)
        ));
    }
}
