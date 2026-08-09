//! everyaios-core binary entrypoint.
//!
//! P0.1 scope: `everyaios-core --version` prints the banner; a plain boot
//! loads config, opens/creates the vault, and reports readiness.
//!
//! P0.4 scope: `--coordinator-bin <path>` starts the ProcessSupervisor which
//! spawns and monitors the TS coordinator sidecar. The supervisor loop runs
//! synchronously on the main thread (or a dedicated thread in Tauri).

use std::process::ExitCode;

use everyaios_core::{boot, coordinator_bin_from_args, start_supervisor, version};

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();

    if args.iter().any(|a| a == "--version" || a == "-V") {
        println!("{}", version::banner());
        return ExitCode::SUCCESS;
    }

    match boot(&args) {
        Ok(msg) => {
            eprintln!("{msg}");
        }
        Err(e) => {
            eprintln!("everyaios-core: boot failed: {e}");
            return ExitCode::FAILURE;
        }
    }

    // If --coordinator-bin <path> is provided, start the supervisor.
    if let Some(bin_path) = coordinator_bin_from_args(&args) {
        eprintln!("[main] starting supervisor for: {}", bin_path.display());

        let mut supervisor = match start_supervisor(bin_path) {
            Ok(s) => s,
            Err(e) => {
                eprintln!("[main] failed to create supervisor: {e}");
                return ExitCode::FAILURE;
            }
        };

        eprintln!("[main] supervisor state: {}", supervisor.state);

        match supervisor.wait_or_restart() {
            Ok(()) => {
                eprintln!("[main] supervisor exited cleanly");
                ExitCode::SUCCESS
            }
            Err(e) => {
                eprintln!("[main] supervisor error: {e}");
                eprintln!("[main] final state: {}", supervisor.state);
                ExitCode::FAILURE
            }
        }
    } else {
        // No coordinator binary specified — just boot and exit (headless mode).
        ExitCode::SUCCESS
    }
}
