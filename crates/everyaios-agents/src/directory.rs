//! The canonical agent directory (P69.D1).
//!
//! Before this module the same question — "which agents exist and what are
//! they?" — had four answers: the ACP launch registry
//! (`everyaios-acp::registry`), the bundled registry index
//! (`everyaios-acp::registry_index`), the local `agent.toml` bundle store
//! ([`crate::registry::AgentRegistry`]) and the TypeScript/UI agent maps.
//!
//! `AgentDirectory` is the single composition point. It does not *own* those
//! sources — the shell feeds it rows as they are discovered — but it owns the
//! canonical record ([`everyaios_types::AgentDefinition`]), the provenance of
//! each row, and the derived view the UI renders. Every other surface (ACP
//! registry rows, bundle store, picker) is therefore a projection, not a
//! parallel truth.

use std::collections::BTreeMap;

use everyaios_types::AgentDefinition;

use crate::bundle::AgentBundle;

/// Where a directory entry came from. Provenance is a first-class field: an
/// entry discovered from the ACP registry is not equivalent to one the user
/// authored locally, and the UI must be able to say which is which.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum AgentSource {
    /// Our inbuilt engine — always present, never installed.
    Inbuilt,
    /// A curated ACP registry row (`registry.json`).
    AcpRegistry,
    /// A runtime discovered on this machine (installed CLI/server).
    Discovered,
    /// A user-authored `agent.toml` bundle.
    LocalBundle,
    /// An external MCP server's agent surface.
    Mcp,
}

impl AgentSource {
    /// Stable wire spelling (the UI reads this verbatim).
    pub fn as_str(self) -> &'static str {
        match self {
            AgentSource::Inbuilt => "inbuilt",
            AgentSource::AcpRegistry => "acp_registry",
            AgentSource::Discovered => "discovered",
            AgentSource::LocalBundle => "local_bundle",
            AgentSource::Mcp => "mcp",
        }
    }

    /// Whether an entry from this source can go away again (the inbuilt
    /// engine and curated rows cannot be uninstalled).
    pub fn is_removable(self) -> bool {
        matches!(self, AgentSource::Discovered | AgentSource::LocalBundle)
    }
}

/// One directory entry: the canonical definition plus its provenance and the
/// facts the picker needs but the definition itself should not carry.
#[derive(Debug, Clone, PartialEq)]
pub struct AgentDirectoryEntry {
    pub definition: AgentDefinition,
    pub source: AgentSource,
    /// Whether the runtime is usable right now. `false` is rendered as
    /// "installable"/"unavailable" — never as a silently missing row.
    pub installed: bool,
    /// Install/launch hint (registry id, executable, or bundle path). Opaque
    /// to the kernel; shown to the user when they ask "why can't I run this?".
    pub locator: Option<String>,
}

impl AgentDirectoryEntry {
    pub fn new(definition: AgentDefinition, source: AgentSource) -> Self {
        Self {
            definition,
            source,
            installed: matches!(source, AgentSource::Inbuilt | AgentSource::LocalBundle),
            locator: None,
        }
    }

    pub fn with_installed(mut self, installed: bool) -> Self {
        self.installed = installed;
        self
    }

    pub fn with_locator(mut self, locator: impl Into<String>) -> Self {
        self.locator = Some(locator.into());
        self
    }
}

/// The one agent directory.
///
/// Ordered by insertion-independent id so two builds of the same inputs
/// produce byte-identical output (the picker must not reshuffle).
#[derive(Debug, Default, Clone)]
pub struct AgentDirectory {
    entries: BTreeMap<String, AgentDirectoryEntry>,
}

impl AgentDirectory {
    pub fn new() -> Self {
        Self::default()
    }

    /// Insert or replace an entry, keyed by the canonical agent id.
    pub fn upsert(&mut self, entry: AgentDirectoryEntry) -> Option<AgentDirectoryEntry> {
        let key = entry.definition.id.as_str().to_string();
        self.entries.insert(key, entry)
    }

    /// Insert a definition with default facts for its source.
    pub fn insert(&mut self, definition: AgentDefinition, source: AgentSource) -> Option<AgentDirectoryEntry> {
        self.upsert(AgentDirectoryEntry::new(definition, source))
    }

    pub fn get(&self, id: &str) -> Option<&AgentDirectoryEntry> {
        self.entries.get(id)
    }

    pub fn remove(&mut self, id: &str) -> Option<AgentDirectoryEntry> {
        self.entries.remove(id)
    }

    /// All entries, id-ordered.
    pub fn list(&self) -> Vec<&AgentDirectoryEntry> {
        self.entries.values().collect()
    }

    /// Entries from one source, id-ordered.
    pub fn by_source(&self, source: AgentSource) -> Vec<&AgentDirectoryEntry> {
        self.entries
            .values()
            .filter(|e| e.source == source)
            .collect()
    }

    pub fn len(&self) -> usize {
        self.entries.len()
    }

    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    /// Add a user bundle's definition under `LocalBundle` provenance.
    pub fn upsert_bundle(&mut self, bundle: &AgentBundle) -> Option<AgentDirectoryEntry> {
        self.insert(bundle.definition(), AgentSource::LocalBundle)
    }

    /// Add every bundle in a registry, returning how many entries exist after
    /// the merge (the bundle store is a source, never a second directory).
    pub fn upsert_bundles(&mut self, bundles: &[AgentBundle]) -> usize {
        for bundle in bundles {
            self.upsert_bundle(bundle);
        }
        self.entries.len()
    }

    /// The picker's default: the inbuilt engine if present, else the first
    /// installed entry, else nothing — never an arbitrary row.
    pub fn default_entry(&self) -> Option<&AgentDirectoryEntry> {
        self.entries
            .values()
            .find(|e| e.definition.is_default)
            .or_else(|| {
                self.entries
                    .values()
                    .find(|e| e.source == AgentSource::Inbuilt && e.installed)
            })
            .or_else(|| self.entries.values().find(|e| e.installed))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use everyaios_types::{AgentId, AgentProtocol, AuthMode};

    fn def(id: &str, is_default: bool) -> AgentDefinition {
        AgentDefinition {
            id: AgentId::new(id),
            name: id.to_string(),
            description: String::new(),
            protocol: AgentProtocol::Acp,
            auth_mode: AuthMode::Subscription,
            is_default,
            capabilities: Vec::new(),
            extension_mechanisms: Vec::new(),
        }
    }

    #[test]
    fn list_is_id_ordered_and_default_prefers_the_flagged_row() {
        let mut dir = AgentDirectory::new();
        dir.insert(def("zeta", false), AgentSource::AcpRegistry);
        dir.insert(def("alpha", false), AgentSource::Discovered);
        dir.insert(def("inbuilt", true), AgentSource::Inbuilt);

        let ids: Vec<&str> = dir.list().iter().map(|e| e.definition.id.as_str()).collect();
        assert_eq!(ids, vec!["alpha", "inbuilt", "zeta"]);
        assert_eq!(dir.default_entry().unwrap().definition.id.as_str(), "inbuilt");
    }

    #[test]
    fn discovery_never_claims_installed_and_removal_is_source_scoped() {
        let mut dir = AgentDirectory::new();
        dir.insert(def("cursor", false), AgentSource::AcpRegistry);
        assert!(!dir.get("cursor").unwrap().installed);
        assert!(!AgentSource::AcpRegistry.is_removable());

        dir.upsert(
            AgentDirectoryEntry::new(def("local", false), AgentSource::LocalBundle)
                .with_installed(true)
                .with_locator("/tmp/agent.toml"),
        );
        assert!(dir.get("local").unwrap().installed);
        assert!(AgentSource::LocalBundle.is_removable());
    }
}
