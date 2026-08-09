//! EveryAIOS desktop shell — Tauri v2 backend (tasks P0.2).
//!
//! The shell is deliberately thin: every capability lives in the
//! `everyaios-*` crates (core, vault, guard, audit, ipc). This crate wires
//! them to the UI as Tauri commands + events, and owns the system tray.

use std::sync::Mutex;

use everyaios_guard::Guard;
use tauri::{Manager, State};

pub struct AppState {
    /// P0.2: the boot report line from `everyaios-core::boot`.
    pub boot_report: Mutex<String>,
    /// P0.2: an initialized Guard-1 scanner (stub blocklist until P7.4).
    pub guard: Guard,
}

#[tauri::command]
fn version() -> String {
    everyaios_core::version::banner()
}

#[tauri::command]
fn core_boot_report(state: State<'_, AppState>) -> Result<String, String> {
    state
        .boot_report
        .lock()
        .map(|r| r.clone())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn scan_text(state: State<'_, AppState>, text: String) -> Result<bool, String> {
    // Guard-1: deterministic pre-exec scan. `true` = blocked.
    Ok(state.guard.is_blocked(&text))
}

#[tauri::command]
fn probe_vault() -> Result<String, String> {
    // Security (P0.2 stub): the path is NOT webview-controlled — it is pinned
    // to the data dir. Arbitrary path handling arrives with P1.1 key
    // management (vault path comes from config, never from the frontend).
    let path = everyaios_core::default_data_dir().join("vault.db");
    let key = everyaios_core::default_vault_key();
    let vault = everyaios_vault::Vault::open(&path, &key).map_err(|e| e.to_string())?;
    Ok(vault.status())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Build the initial state exactly like the headless binary would.
    let args: Vec<String> = std::env::args().skip(1).collect();
    let boot_report = everyaios_core::boot(&args).unwrap_or_else(|e| format!("boot failed: {e}"));
    let guard = Guard::default();

    tauri::Builder::default()
        .manage(AppState {
            boot_report: Mutex::new(boot_report),
            guard,
        })
        .invoke_handler(tauri::generate_handler![
            version,
            core_boot_report,
            scan_text,
            probe_vault
        ])
        .setup(|app| {
            // Tray must be non-fatal: on systems without appindicator/tray
            // support the app should still start (just without a tray icon).
            if let Err(e) = setup_tray(app.handle()) {
                eprintln!("everyaios-desktop: tray setup failed (continuing): {e}");
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running EveryAIOS");
}

/// System tray (P0.2 task 17): status icon + Show/Quit menu.
fn setup_tray(app: &tauri::AppHandle) -> tauri::Result<()> {
    use tauri::menu::{Menu, MenuItem};
    use tauri::tray::TrayIconBuilder;

    let show = MenuItem::with_id(app, "show", "Show EveryAIOS", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;

    let mut builder = TrayIconBuilder::with_id("main-tray");
    if let Some(icon) = app.default_window_icon().cloned() {
        builder = builder.icon(icon);
    }
    let _tray = builder
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => {
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.show();
                    let _ = win.unminimize();
                    let _ = win.set_focus();
                }
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;

    Ok(())
}
