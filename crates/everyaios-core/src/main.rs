//! everyaios-core binary entrypoint.
//!
//! P0.1 scope: `everyaios-core --version` prints the banner; a plain boot loads
//! config, opens/creates the vault, and reports readiness. Later phases wire
//! the ProcessSupervisor (sidecar spawn) and Tauri command glue here.

use std::process::ExitCode;

use everyaios_core::config::Config;
use everyaios_core::version;

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();

    if args.iter().any(|a| a == "--version" || a == "-V") {
        println!("{}", version::banner());
        return ExitCode::SUCCESS;
    }

    match boot(&args) {
        Ok(msg) => {
            println!("{msg}");
            ExitCode::SUCCESS
        }
        Err(e) => {
            eprintln!("everyaios-core: {e}");
            ExitCode::FAILURE
        }
    }
}

/// Headless boot: load config, open/create vault, report readiness.
/// (Sidecar supervision, guard warm-up and CDP discovery arrive in later
/// phases — P0.4/P2.1.)
fn boot(args: &[String]) -> Result<String, Box<dyn std::error::Error>> {
    let cfg = Config::load()?;

    // `--vault <path>` lets tests point the vault elsewhere.
    let vault_path = args
        .windows(2)
        .find(|w| w[0] == "--vault")
        .map(|w| std::path::PathBuf::from(&w[1]))
        .unwrap_or(cfg.vault_path.clone());

    // Derive an encryption key from the machine/user scope for P0.1; the
    // real key management lands in P1.1 (key-ring vault, SQLCipher).
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

/// P0.1 placeholder key derivation. **Not for production** — replaced by the
/// P1.1 key-management design (user passphrase + keyfile + KDF).
fn default_vault_key() -> String {
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
