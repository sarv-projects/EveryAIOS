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

pub mod adapter;
pub mod automation_runtime;
pub mod blueprint;
pub mod capability_manifest;
pub mod challenge;
pub mod chat;
pub mod config;
pub mod connector_hub;
pub mod email;
pub mod eval_service;
pub mod execution;
pub mod export;
pub mod forge;
pub mod guard_service;
pub mod hwfit;
pub mod local;
pub mod memory_service;
pub mod messaging;
pub mod orphan;
pub mod plan_service;
pub mod provider_ref;
pub mod providers;
pub mod reader;
pub mod scheduler_service;
pub mod self_audit;
pub mod sidecar_link;
pub mod supervisor;
pub mod telemetry;
pub mod tools;
pub mod tracing;
pub mod vault_key;
pub mod version;
pub mod widgets;
pub mod worker_pool;
pub mod wsl;

pub use adapter::{exact_command_consent, is_install_script, Stage0Adapter};
pub use automation_runtime::{
    AutomationError, AutomationRunResult, AutomationRuntime, AutomationStepResult, ConnectorEngine,
    SearchEngine,
};
pub use blueprint::{load_all as load_blueprints, load_blueprint, AgentBlueprint, BlueprintError};
pub use capability_manifest::{generate_manifest, CapabilityManifest};
pub use challenge::{
    create_task, parse_grounding_choice, poll_task, solve_captcha, ByoProvider, ByoSolverError,
    ChallengeHandler, ChallengeKind, ChallengeResolution, GroundingChoice, GroundingOption,
    HumanChallenge, SolverHttp, UreqHttp, VisualGroundingRequest,
};
pub use chat::{ChatRelay, ChatRelayError, ChatStreamParams, ChatWireEvent, UserDocument};
pub use config::{Config, ConfigError};
pub use eval_service::EvalService;
pub use execution::{Execution, ExecutionKernel, ExecutionPhase, ExecutionTrigger};
pub use export::{
    render_json_export, render_markdown_export, wipe_facts, wipe_messages, ExportMessage,
    MemoryMirror, ObsidianNote, WipeScope,
};
pub use guard_service::{GuardDecision, GuardService, PendingGuardCard};
pub use hwfit::{
    detect as detect_hardware, recommend, score_model, GpuClass, HardwareProfile,
    LocalModelCandidate, ModelFit,
};
pub use local::{LocalConfig, LocalError, LocalManager, LocalModelInfo};
pub use memory_service::{FactStatus, MemoryService, StoredFact};
pub use messaging::{MessageReminder, ReminderQueue};
pub use plan_service::PlanService;
pub use provider_ref::{
    classify_category, ingest_provider_reference, parse_provider_reference, AuthClass,
    IngestReport, ProviderEntry,
};
pub use providers::{KeyPool, ProviderConfig, ProviderKey, ProvidersError, ProvidersFile};
pub use reader::{
    extract_text, ReaderChunk, ReaderDocument, ReaderError, ReaderFormat, ReaderHit, ReaderIndex,
};
pub use scheduler_service::SchedulerService;
pub use sidecar_link::{Inbound, LinkError, SidecarLink, WriterHandle};
pub use supervisor::{ProcessSupervisor, SupervisorError, SupervisorState};
pub use telemetry::{Telemetry, TelemetryEventKind, TelemetryMode, TelemetrySample};
pub use tools::{canonical_args_hash, ToolRegistry, ToolService};
pub use vault_key::{
    gate_mode, keyfile_path, needs_passphrase_gate, resolve_vault_key, setup_vault_passphrase,
    unlock_vault_passphrase, ResolvedVaultKey, VaultKeyError, VaultKeyOrigin,
};
pub use widgets::{
    LookupWidget, MathWidget, StockQuote, StockWidget, WeatherSnapshot, WeatherWidget, WidgetCard,
    WidgetError,
};
pub use wsl::{
    detect_environment, detect_environment_from_env, translate_linux_to_windows,
    translate_windows_drive_to_linux, translate_windows_to_linux, ExecEnvironment, WslFrame,
    WslPath, WslRunner, WSL_LEGACY_PREFIX, WSL_UNC_PREFIX,
};

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

    let resolved = resolve_vault_key(&cfg.data_dir)?;
    let vault = everyaios_vault::Vault::open(&vault_path, &resolved.key)?;
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

/// Like [`start_supervisor`], but also returns the link-handoff receiver the
/// shell drains to build a `SidecarLink` on every (re)spawn.
pub fn start_supervisor_with_link(
    binary_path: PathBuf,
) -> (
    ProcessSupervisor,
    std::sync::mpsc::Receiver<(std::process::ChildStdin, std::process::ChildStdout)>,
) {
    let (tx, rx) = std::sync::mpsc::channel();
    (ProcessSupervisor::new_with_link(binary_path, Some(tx)), rx)
}

/// Resolve the SQLCipher key (env → keyfile → first-boot generated).
/// Never returns the old hardcoded placeholder.
pub fn default_vault_key() -> String {
    resolve_vault_key(&default_data_dir())
        .map(|r| r.key)
        .unwrap_or_else(|_| {
            // Last resort for in-memory test vaults that have no data dir.
            // Still not the well-known placeholder.
            use rand::RngCore;
            let mut b = [0u8; 32];
            rand::thread_rng().fill_bytes(&mut b);
            b.iter().map(|x| format!("{x:02x}")).collect()
        })
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
