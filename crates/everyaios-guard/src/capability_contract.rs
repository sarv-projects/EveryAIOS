//! Secret-free capability invocation metadata.
//!
//! This contract deliberately contains no credential material. It is safe to
//! carry across the coordinator/core boundary; the vault remains the only
//! component that resolves and injects secrets.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CapabilityInvocation {
    pub grant_id: String,
    pub run_id: String,
    pub capability: String,
    pub operation: String,
}

impl CapabilityInvocation {
    pub fn validate(&self) -> Result<(), &'static str> {
        if self.grant_id.is_empty() {
            return Err("capability grant id is required");
        }
        if self.run_id.is_empty() {
            return Err("capability run id is required");
        }
        if self.capability.is_empty() {
            return Err("capability scope is required");
        }
        if self.operation.is_empty() {
            return Err("capability operation is required");
        }
        Ok(())
    }
}
