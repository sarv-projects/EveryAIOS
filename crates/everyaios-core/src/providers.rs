//! `providers.toml` — BYOK key pools per provider (ARCH/03 §3.2).
//!
//! Schema (written to `<data_dir>/providers.toml`, created empty on first boot
//! — the user fills keys via the P1.1 key-management UI, never the log):
//!
//! ```toml
//! [[providers]]
//! name = "openai"
//! base_url = "https://api.openai.com/v1"
//!
//! [[providers.keys]]
//! id = "prod-1"
//! value = "sk-..."
//!
//! [[providers.keys]]
//! id = "prod-2"
//! value = "sk-..."
//! ```
//!
//! A [`KeyPool`] selects keys round-robin so usage spreads across the pool;
//! rotation/exhaustion logic lands with P1.1 — the pool is the data model it
//! rotates over.

use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

/// A single API key in a provider's pool.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ProviderKey {
    /// Human label, e.g. `prod-1` (rotation target in P1.1).
    pub id: String,
    /// The secret itself. Never logged; vault-encrypted at rest from P1.1.
    pub value: String,
}

/// One provider's configuration: endpoint + a pool of keys.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ProviderConfig {
    pub name: String,
    #[serde(default)]
    pub base_url: Option<String>,
    #[serde(default)]
    pub keys: Vec<ProviderKey>,
}

/// The whole `providers.toml` file.
#[derive(Debug, Default, Serialize, Deserialize, PartialEq)]
pub struct ProvidersFile {
    #[serde(default)]
    pub providers: Vec<ProviderConfig>,
}

impl ProvidersFile {
    /// `providers.toml` path inside the data dir.
    pub fn path(data_dir: &Path) -> PathBuf {
        data_dir.join("providers.toml")
    }

    /// Load from `path`, creating an (empty) file if missing.
    pub fn load_from(path: &Path) -> Result<Self, ProvidersError> {
        if !path.exists() {
            let file = ProvidersFile::default();
            file.save(path)?;
            return Ok(file);
        }
        let raw = std::fs::read_to_string(path).map_err(ProvidersError::Io)?;
        toml::from_str(&raw).map_err(ProvidersError::Parse)
    }

    /// Persist to `path`, creating the parent dir if needed.
    pub fn save(&self, path: &Path) -> Result<(), ProvidersError> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(ProvidersError::Io)?;
        }
        let toml = toml::to_string_pretty(self).map_err(ProvidersError::Serialize)?;
        std::fs::write(path, toml).map_err(ProvidersError::Io)
    }

    /// Build a live round-robin [`KeyPool`] for the named provider.
    pub fn pool(&self, name: &str) -> Option<KeyPool> {
        self.providers
            .iter()
            .find(|p| p.name == name)
            .map(|p| KeyPool::new(p.clone()))
    }
}

/// Round-robin key selector for one provider. `&self`-safe (internal mutex).
pub struct KeyPool {
    name: String,
    base_url: Option<String>,
    inner: Mutex<VecDeque<ProviderKey>>,
}

impl KeyPool {
    pub fn new(cfg: ProviderConfig) -> Self {
        Self {
            name: cfg.name,
            base_url: cfg.base_url,
            inner: Mutex::new(cfg.keys.into()),
        }
    }

    pub fn name(&self) -> &str {
        &self.name
    }

    pub fn base_url(&self) -> Option<&str> {
        self.base_url.as_deref()
    }

    pub fn len(&self) -> usize {
        self.inner.lock().expect("pool poisoned").len()
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    /// Select the next key, rotating the queue (round-robin across the pool).
    pub fn select(&self) -> Result<ProviderKey, ProvidersError> {
        let mut queue = self.inner.lock().expect("pool poisoned");
        let key = queue
            .pop_front()
            .ok_or_else(|| ProvidersError::NoKeys(self.name.clone()))?;
        queue.push_back(key.clone());
        Ok(key)
    }
}

#[derive(Debug, thiserror::Error)]
pub enum ProvidersError {
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("toml parse error: {0}")]
    Parse(#[from] toml::de::Error),
    #[error("toml serialize error: {0}")]
    Serialize(#[from] toml::ser::Error),
    #[error("provider '{0}' has no keys in its pool")]
    NoKeys(String),
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = r#"
[[providers]]
name = "openai"
base_url = "https://api.openai.com/v1"

[[providers.keys]]
id = "prod-1"
value = "sk-one"

[[providers.keys]]
id = "prod-2"
value = "sk-two"

[[providers]]
name = "anthropic"

[[providers.keys]]
id = "claude-prod"
value = "sk-ant-three"
"#;

    #[test]
    fn parses_key_pools_per_provider() {
        let file: ProvidersFile = toml::from_str(SAMPLE).expect("parse");
        assert_eq!(file.providers.len(), 2);
        assert_eq!(file.providers[0].name, "openai");
        assert_eq!(file.providers[0].keys.len(), 2);
        assert_eq!(file.providers[1].name, "anthropic");
        assert_eq!(file.providers[1].base_url, None); // optional field
        assert_eq!(file.providers[1].keys[0].value, "sk-ant-three");
    }

    #[test]
    fn missing_file_is_created_empty() {
        let dir = std::env::temp_dir().join(format!("everyaios-providers-{}", std::process::id()));
        let path = dir.join("providers.toml");
        let _ = std::fs::remove_dir_all(&dir);
        let file = ProvidersFile::load_from(&path).expect("create defaults");
        assert!(file.providers.is_empty());
        assert!(path.exists());
        // Reload round-trips.
        let again = ProvidersFile::load_from(&path).expect("reload");
        assert_eq!(again, file);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn pool_selects_round_robin() {
        let file: ProvidersFile = toml::from_str(SAMPLE).expect("parse");
        let pool = file.pool("openai").expect("pool exists");
        assert_eq!(pool.len(), 2);
        assert_eq!(pool.select().unwrap().id, "prod-1");
        assert_eq!(pool.select().unwrap().id, "prod-2");
        assert_eq!(pool.select().unwrap().id, "prod-1"); // wraps around
        assert_eq!(pool.len(), 2); // rotation never drains the pool
    }

    #[test]
    fn pool_with_single_key_always_selects() {
        // Round-robin with one key never drains the pool — it always returns
        // that key (rotation just keeps it in place).
        let file: ProvidersFile = toml::from_str(SAMPLE).expect("parse");
        let pool = file.pool("anthropic").expect("pool exists");
        for _ in 0..3 {
            assert_eq!(pool.select().unwrap().id, "claude-prod");
        }
        assert_eq!(pool.len(), 1);
    }

    #[test]
    fn empty_pool_select_errors() {
        let pool = KeyPool::new(ProviderConfig {
            name: "empty-provider".into(),
            base_url: None,
            keys: vec![],
        });
        match pool.select() {
            Err(ProvidersError::NoKeys(name)) => assert_eq!(name, "empty-provider"),
            other => panic!("expected NoKeys, got {other:?}"),
        }
    }

    #[test]
    fn unknown_provider_has_no_pool() {
        let file: ProvidersFile = toml::from_str(SAMPLE).expect("parse");
        assert!(file.pool("groq").is_none());
    }

    #[test]
    fn roundtrip_through_toml() {
        let file: ProvidersFile = toml::from_str(SAMPLE).expect("parse");
        let text = toml::to_string_pretty(&file).expect("serialize");
        let back: ProvidersFile = toml::from_str(&text).expect("reparse");
        assert_eq!(back, file);
    }
}
