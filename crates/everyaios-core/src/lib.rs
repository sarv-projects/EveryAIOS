//! everyaios-core — the EveryAIOS orchestrator binary.
//!
//! Boots headless (no Tauri) or as the Tauri backend (task P0.2), loads
//! config, initializes the vault and guard, and supervises the TS coordinator
//! sidecar via [`ProcessSupervisor`].
//!
//! Phase P0.1–P0.2 scope: binary boots, `--version` prints, config loads,
//! vault opens/creates, and the same [`boot`] path is exposed to the Tauri
//! command layer.
//!
//! Phase P0.4: ProcessSupervisor spawns the coordinator, monitors exit codes,
//! applies exponential backoff, and trips a circuit breaker on repeated crashes.

use std::path::PathBuf;

pub mod blueprint;
pub mod config;
pub mod orphan;
pub mod providers;
pub mod supervisor;
pub mod version;

pub use blueprint::{load_all as load_blueprints, load_blueprint, AgentBlueprint, BlueprintError};
pub use config::{Config, ConfigError};
pub use providers::{KeyPool, ProviderConfig, ProviderKey, ProvidersError, ProvidersFile};
pub use supervisor::{ProcessSupervisor, SupervisorError, SupervisorState};

/// Default data directory: `~/.everyaios` (overridable via `EVERYAIOS_HOME`).
pub fn default_data_dir() -> PathBuf {
    if let Ok(home) = std::env::var("EVERYAIOS_HOME") {
        return PathBuf::from(home);
    }
    let base = std::env::var("HOME").unwrap_or_else(|_| ".".into());
    PathBuf::from(base).join(".everyaios")
}

/// Headless boot: load config, open/create the vault, report readiness.
///
/// Shared by the binary (`main.rs`) and the Tauri backend (task P0.2) so the
/// two entry points cannot drift.
///
/// Accepts optional `--coordinator-bin <path>` which is consumed by main.rs to
/// start the ProcessSupervisor after boot completes.
pub fn boot(args: &[String]) -> Result<String, Box<dyn std::error::Error>> {
    let cfg = Config::load()?;

    // `--vault <path>` lets tests point the vault elsewhere.
    let vault_path = args
        .windows(2)
        .find(|w| w[0] == "--vault")
        .map(|w| std::path::PathBuf::from(&w[1]))
        .unwrap_or(cfg.vault_path.clone());

    let key = default_vault_key();
    let vault = everyaios_vault::Vault::open(&vault_path, &key)?;
    let status = vault.status();

    Ok(format!(
        "everyaios-core {} ready — data_dir={} vault={} ({}), retention_days={}",
        version::VERSION,
        cfg.data_dir.display(),
        vault_path.display(),
        status,
        cfg.retention_days,
    ))
}

/// Extract the `--coordinator-bin <path>` argument from args, if present.
pub fn coordinator_bin_from_args(args: &[String]) -> Option<PathBuf> {
    args.windows(2)
        .find(|w| w[0] == "--coordinator-bin")
        .map(|w| PathBuf::from(&w[1]))
}

/// Convenience: create and return a ProcessSupervisor ready to run.
///
/// Does NOT start the supervisor loop — caller should invoke
/// [`ProcessSupervisor::wait_or_restart`] on a dedicated thread.
pub fn start_supervisor(binary_path: PathBuf) -> Result<ProcessSupervisor, SupervisorError> {
    Ok(ProcessSupervisor::new(binary_path))
}

/// P0.1 placeholder key derivation. **Not for production** — replaced by the
/// P1.1 key-management design (user passphrase + keyfile + KDF).
pub fn default_vault_key() -> String {
    std::env::var("EVERYAIOS_VAULT_KEY")
        .unwrap_or_else(|_| "everyaios-core-dev-key-do-not-use".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn boot_reports_ready() {
        let dir = std::env::temp_dir().join(format!("everyaios-core-boot-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::env::set_var("EVERYAIOS_HOME", &dir);
        std::env::set_var("EVERYAIOS_VAULT_KEY", "test-key");

        let vault = dir.join("vault.db");
        let out = boot(&["--vault".into(), vault.to_string_lossy().into()]).expect("boot ok");
        assert!(out.contains("ready"), "expected ready line, got: {out}");
        assert!(out.contains("retention_days=7"));

        let _ = std::fs::remove_dir_all(&dir);
        std::env::remove_var("EVERYAIOS_HOME");
        std::env::remove_var("EVERYAIOS_VAULT_KEY");
    }
}
