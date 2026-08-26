//! P14 — Model catalog (doc 66, models.dev steal).
//!
//! A vendorable model-capability index: one `ModelEntry` per provider/model
//! (compiled shape), the two-tier lab/provider schema, a cache-aware cost
//! engine, and the routing filter matrix. Parsed once at startup; the router
//! and cost display read from it — nothing here mutates.

pub mod catalog;
pub mod gateway;
pub mod model;
pub mod pricing;
pub mod probe;
pub mod provider;
pub mod routing;
pub mod sync;
pub mod tier;

pub use catalog::ModelCatalog;
pub use model::ModelEntry;
pub use probe::{trusted_capabilities, AdvertisedHardCaps, Capability, CapabilityVerdict, ProbeResult, Verdict, VerificationReport};
pub use provider::{
    base_registry, normalize, AggregatorKind, Auth, DiscoverySource, ProviderRecord,
    ProviderRegistry, Transport, ALIASES, OPENAI_COMPATIBLE_PROFILES,
};
pub use pricing::{cost_for, split_input, CostBreakdown};
pub use routing::{rejection_reasons, RouteFilters};
pub use gateway::{GatewayError, GatewayRouter, RouteResult, TaskHint};
pub use sync::{gate_passes, merge_refresh, refresh_plan, validate_vendored, GateFinding, RefreshReport, Severity, SyncSpec, SYNC_MODULES};
pub use tier::{validate_tiers, ProviderOverride, ResolvedModel};
