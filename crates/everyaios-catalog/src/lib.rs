//! P14 — Model catalog (doc 66, models.dev steal).
//!
//! A vendorable model-capability index: one `ModelEntry` per provider/model
//! (compiled shape), the two-tier lab/provider schema, a cache-aware cost
//! engine, and the routing filter matrix. Parsed once at startup; the router
//! and cost display read from it — nothing here mutates.

pub mod catalog;
pub mod discovery;
pub mod fetch;
pub mod gallery;
pub mod gateway;
pub mod live;
pub mod model;
pub mod policy;
pub mod pricing;
pub mod probe;
pub mod profiles;
pub mod provider;
pub mod provider_seed;
pub mod routing;
pub mod routing_feed;
pub mod store;
pub mod sync;
pub mod tier;

pub use catalog::ModelCatalog;
pub use discovery::{
    DiscoveryInventory, ManagedResource, ResourceCard, ResourceCounts, ResourceKind,
};
pub use fetch::{probe_models_endpoint, refresh_now, EndpointProbe, HttpFetch, RefreshOutcome};
pub use gateway::{GatewayError, GatewayRouter, RouteResult, TaskHint};
pub use live::{
    apply_refresh, free_model_ids, is_free_model_id, is_stale, logo_url, refresh_interval_secs,
    transport_from_npm, CatalogSnapshot, FetchOutcome, LiveModel, LiveProvider, Modalities,
    ModelCost, ModelLimit, ModelProviderOverride, RefreshDecision, DEFAULT_REFRESH_SECS,
    LOGO_URL_PREFIX, MAX_REFRESH_SECS, MIN_REFRESH_SECS, MODELS_DEV_API_URL,
};
pub use model::ModelEntry;
pub use pricing::{cost_for, split_input, CostBreakdown};
pub use probe::{
    trusted_capabilities, AdvertisedHardCaps, Capability, CapabilityVerdict, ProbeResult, Verdict,
    VerificationReport,
};
pub use profiles::{
    nvidia_nim_profile, opencode_overlay_profiles, ProfileFormat, ProfileModel, ProfileSource,
    ProfileStore, ProviderProfile, ProviderProfilesFile,
};
pub use provider::{
    base_registry, normalize, AggregatorKind, Auth, DiscoverySource, ProviderRecord,
    ProviderRegistry, Transport, ALIASES, OPENAI_COMPATIBLE_PROFILES,
};
pub use routing::{rejection_reasons, RouteFilters};
pub use routing_feed::{
    ExcludedProvider, Health, RankedProvider, RouteDecision, RouteRequirements, RoutingFeed,
};
pub use store::{
    CatalogMeta, CatalogSettings, CatalogStore, META_FILE, SETTINGS_FILE, SNAPSHOT_FILE,
};
pub use sync::{
    gate_passes, merge_refresh, refresh_plan, validate_vendored, GateFinding, RefreshReport,
    Severity, SyncSpec, SYNC_MODULES,
};
pub use tier::{validate_tiers, ProviderOverride, ResolvedModel};
