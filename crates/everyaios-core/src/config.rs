//! Config loading for `everyaios.toml` (P0.6 defines the full schema; P0.1 is the
//! minimal skeleton that boots: data dir, vault path, retention, browser).
//!
//! Precedence: `EVERYAIOS_HOME/everyaios.toml` (or `~/.everyaios/everyaios.toml`) — created with
//! defaults on first boot if missing.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

use crate::default_data_dir;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Config {
    /// Root data dir for all EveryAIOS state (default `~/.everyaios`).
    pub data_dir: PathBuf,
    /// SQLCipher vault database path (default `<data_dir>/vault.db`).
    pub vault_path: PathBuf,
    /// Default replay/audit retention in days (spec E5: 7-day default).
    pub retention_days: u32,
    /// Optional explicit browser binary; `None` = auto-detect (P2.1).
    pub browser_binary: Option<PathBuf>,
}

impl Default for Config {
    fn default() -> Self {
        let data_dir = default_data_dir();
        Self {
            vault_path: data_dir.join("vault.db"),
            retention_days: 7,
            data_dir,
            browser_binary: None,
        }
    }
}

impl Config {
    /// Load config from the default location, creating it with defaults if
    /// missing. Any single missing field falls back to the default.
    pub fn load() -> Result<Self, ConfigError> {
        let path = Self::config_path()?;
        Self::load_from(&path)
    }

    /// The `everyaios.toml` path inside the data dir.
    pub fn config_path() -> Result<PathBuf, ConfigError> {
        let data_dir = default_data_dir();
        if !data_dir.exists() {
            std::fs::create_dir_all(&data_dir).map_err(ConfigError::Io)?;
        }
        Ok(data_dir.join("everyaios.toml"))
    }

    /// Load from an explicit path; if the file is absent, write defaults.
    pub fn load_from(path: &Path) -> Result<Self, ConfigError> {
        if !path.exists() {
            let cfg = Config::default();
            cfg.save(path)?;
            return Ok(cfg);
        }
        let raw = std::fs::read_to_string(path).map_err(ConfigError::Io)?;
        let mut cfg: Config = toml::from_str(&raw).map_err(ConfigError::Parse)?;
        // Normalize relative vault_path against the file's directory.
        let base = path.parent().unwrap_or_else(|| Path::new("."));
        cfg.data_dir = normalize(base, &cfg.data_dir);
        cfg.vault_path = normalize(base, &cfg.vault_path);
        Ok(cfg)
    }

    /// Persist to `path`, creating the parent dir if needed.
    pub fn save(&self, path: &Path) -> Result<(), ConfigError> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(ConfigError::Io)?;
        }
        let toml = toml::to_string_pretty(self).map_err(ConfigError::Serialize)?;
        std::fs::write(path, toml).map_err(ConfigError::Io)
    }
}

/// Resolve a possibly-relative path against `base`, keeping absolute paths.
fn normalize(base: &Path, p: &Path) -> PathBuf {
    if p.is_absolute() {
        p.to_path_buf()
    } else {
        base.join(p)
    }
}

#[derive(Debug, thiserror::Error)]
pub enum ConfigError {
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("toml parse error: {0}")]
    Parse(#[from] toml::de::Error),
    #[error("toml serialize error: {0}")]
    Serialize(#[from] toml::ser::Error),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_config_points_into_everyaios_dir() {
        let cfg = Config::default();
        assert!(cfg.data_dir.ends_with(".everyaios"));
        assert!(cfg.vault_path.ends_with("vault.db"));
        assert_eq!(cfg.retention_days, 7);
    }

    #[test]
    fn missing_file_gets_created_with_defaults() {
        let dir =
            std::env::temp_dir().join(format!("everyaios-config-test-{}", std::process::id()));
        let path = dir.join("everyaios.toml");
        let _ = std::fs::remove_dir_all(&dir);

        let cfg = Config::load_from(&path).expect("load should create defaults");
        assert_eq!(cfg.retention_days, 7);
        assert!(path.exists(), "defaults should be written to disk");

        // Round-trip: reload must parse what we wrote.
        let again = Config::load_from(&path).expect("reload should succeed");
        assert_eq!(again.retention_days, 7);
        assert_eq!(again.vault_path, cfg.vault_path);

        let _ = std::fs::remove_dir_all(&dir);
    }
}
