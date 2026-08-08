//! everyaios-core — the EveryAIOS orchestrator binary.
//!
//! Boots headless (no Tauri), loads config, initializes the vault and guard,
//! and (in later phases) supervises the TS coordinator sidecar.
//!
//! Phase P0.1 scope: binary boots, `--version` prints, config loads,
//! vault opens/creates. Everything else is a stub for later phases.

use std::path::PathBuf;

pub mod config;
pub mod version;

pub use config::{Config, ConfigError};

/// Default data directory: `~/.everyaios` (overridable via `EVERYAIOS_HOME`).
pub fn default_data_dir() -> PathBuf {
    if let Ok(home) = std::env::var("EVERYAIOS_HOME") {
        return PathBuf::from(home);
    }
    let base = std::env::var("HOME").unwrap_or_else(|_| ".".into());
    PathBuf::from(base).join(".everyaios")
}
