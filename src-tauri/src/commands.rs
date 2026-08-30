//! Tauri command surface (Fix 1d).
//!
//! The single list of every `#[tauri::command]` registered on the shell's IPC
//! handler. `lib.rs` now only calls `commands::handler()` here instead of
//! owning a 180-line inline list. Each family module (`*_cmds.rs`) contributes
//! `X_cmds::…` paths; the remaining lib.rs-level commands (`chat_stream`,
//! `session_*`, …) are referenced as `crate::…`.
//!
//! NOTE on why this is ONE generate_handler (not many): `Builder::invoke_handler`
//! REPLACES the handler (`self.invoke_handler = Box::new(...)`); calling it more
//! than once would silently keep only the last list. So we compose a single
//! `generate_handler!` here. `tests/registration_sync.rs` guarantees this list
//! stays complete as commands are added.

use crate::acp_cmds;
use crate::agent_cmds;
use crate::browser_cmds;
use crate::catalog_cmds;
use crate::cockpit_cmds;
use crate::codeintel_cmds;
use crate::desktop_cmds;
use crate::feedback_cmds;
use crate::fs_cmds;
use crate::git_cmds;
use crate::guard_cmds;
use crate::local_cmds;
use crate::lsp_cmds;
use crate::maintenance_cmds;
use crate::mcp_cmds;
use crate::memory_cmds;
use crate::oauth_cmds;
use crate::office_cmds;
use crate::replay_cmds;
use crate::scheduler_cmds;
use crate::shell_cmds;
use crate::skills_cmds;
use crate::storage_cmds;
use crate::sync_cmds;
use crate::tasks_cmds;
use crate::trajectory_cmds;
use crate::updater_cmds;
use crate::vault_cmds;

use crate::xlsx_cmds;

/// Build the full IPC handler for the shell. The `generate_handler!` macro
/// expands to a `move |invoke| { match … }` closure implementing
/// `Fn(Invoke) -> bool`, which is exactly what `Builder::invoke_handler` wants.
pub fn handler() -> impl Fn(tauri::ipc::Invoke<tauri::Wry>) -> bool + Send + Sync + 'static {
    tauri::generate_handler![
        crate::version,
        catalog_cmds::catalog_sync_plan,
        catalog_cmds::catalog_sync_refresh,
        crate::core_boot_report,
        crate::scan_text,
        crate::probe_vault,
        crate::vault_key_status,
        crate::vault_setup,
        crate::vault_unlock,
        crate::session_list,
        crate::session_put,
        crate::session_delete,
        oauth_cmds::oauth_status,
        oauth_cmds::oauth_accounts,
        oauth_cmds::oauth_start_pkce,
        oauth_cmds::oauth_start_device,
        oauth_cmds::oauth_poll_device,
        oauth_cmds::oauth_revoke,
        local_cmds::local_models,
        local_cmds::local_ensure,
        local_cmds::local_hardware,
        crate::chat_stream,
        crate::agui_send,
        crate::agui_listen,
        crate::chat_cancel,
        crate::chat_tool_retry,
        crate::plan_execute,
        crate::plan_respond,
        crate::usage_snapshot,
        crate::session_totals,
        replay_cmds::replay_sessions,
        replay_cmds::replay_timeline,
        replay_cmds::replay_screenshot,
        replay_cmds::watch_events,
        replay_cmds::agent_stop,
        trajectory_cmds::trajectory_sessions,
        trajectory_cmds::trajectory_snapshot,
        guard_cmds::guard_tickets,
        feedback_cmds::feedback_submit,
        guard_cmds::guard_respond,
        guard_cmds::guard_open_window,
        guard_cmds::guard_receipts,
        guard_cmds::guard_policy,
        guard_cmds::guard_autonomy,
        guard_cmds::guard_set_autonomy,
        guard_cmds::guard_estop,
        guard_cmds::guard_activity,
        guard_cmds::guard_permissions_matrix,
        cockpit_cmds::cockpit_snapshot,
        cockpit_cmds::cockpit_activity,
        cockpit_cmds::cockpit_tokens,
        cockpit_cmds::cockpit_quiet,
        cockpit_cmds::agent_undo,
        cockpit_cmds::interrupt_respond,
        cockpit_cmds::cockpit_upsert_agent,
        xlsx_cmds::xlsx_open,
        xlsx_cmds::xlsx_recalc,
        xlsx_cmds::xlsx_edit_request,
        xlsx_cmds::xlsx_edit_commit,
        xlsx_cmds::xlsx_batch_request,
        xlsx_cmds::xlsx_batch_commit,
        xlsx_cmds::xlsx_pivot,
        mcp_cmds::mcp_catalog,
        mcp_cmds::mcp_servers,
        mcp_cmds::mcp_attach,
        mcp_cmds::store_catalog,
        mcp_cmds::mcp_connect_start,
        mcp_cmds::mcp_remote_status,
        mcp_cmds::mcp_remote_call,
        mcp_cmds::mcp_remote_tools,
        skills_cmds::skills_catalog,
        skills_cmds::skills_install,
        skills_cmds::skills_uninstall,
        office_cmds::docx_open,
        office_cmds::docx_patch,
        office_cmds::docx_tracks,
        office_cmds::pptx_open,
        office_cmds::pptx_notes,
        office_cmds::pdf_open,
        office_cmds::pdf_bytes,
        office_cmds::pdf_page_op,
        office_cmds::office_open_external,
        vault_cmds::vault_keys_list,
        vault_cmds::vault_key_add,
        vault_cmds::vault_key_remove,
        acp_cmds::chief_default_get,
        acp_cmds::chief_default_set,
        agent_cmds::agent_registry_list,
        agent_cmds::agent_registry_save,
        agent_cmds::agent_registry_get,
        agent_cmds::agent_registry_remove,
        agent_cmds::agent_registry_duplicate,
        agent_cmds::agent_registry_set_disabled,
        acp_cmds::acp_agents,
        acp_cmds::acp_launch,
        acp_cmds::acp_prompt,
        acp_cmds::acp_cancel,
        acp_cmds::acp_shutdown,
        acp_cmds::acp_sessions,
        acp_cmds::acp_registry_refresh,
        acp_cmds::acp_registry_status,
        acp_cmds::acp_registry_install_plan,
        acp_cmds::acp_install_status,
        acp_cmds::acp_install_request,
        acp_cmds::acp_install_commit,
        acp_cmds::acp_install,
        acp_cmds::acp_authenticate,
        // Maintenance: audit retention sweep (ledger-growth fault line).
        maintenance_cmds::audit_compact,
        // P6.4 (B7): scheduled tasks.
        scheduler_cmds::scheduler_list,
        scheduler_cmds::scheduler_create,
        scheduler_cmds::scheduler_delete,
        scheduler_cmds::scheduler_enable,
        scheduler_cmds::scheduler_pause,
        scheduler_cmds::scheduler_pause_session,
        scheduler_cmds::scheduler_resume,
        scheduler_cmds::scheduler_run_now,
        scheduler_cmds::scheduler_battery,
        scheduler_cmds::scheduler_fire_event,
        scheduler_cmds::scheduler_fire_webhook,
        scheduler_cmds::scheduler_nudges,
        scheduler_cmds::scheduler_nudge,
        tasks_cmds::tasks_list,
        tasks_cmds::tasks_show,
        tasks_cmds::tasks_cancel,
        tasks_cmds::tasks_retry,
        tasks_cmds::tasks_enqueue,
        tasks_cmds::tasks_start,
        tasks_cmds::tasks_complete,
        tasks_cmds::tasks_sweep,
        storage_cmds::storage_health,
        storage_cmds::storage_scan,
        storage_cmds::storage_large_files,
        storage_cmds::storage_duplicates,
        storage_cmds::storage_cleanup_proposals,
        storage_cmds::storage_battery,
        // P8.9 sync: encrypted bundle export/import + live TCP transport
        // (direct ip:port — LAN + Tailscale; explicit trigger, default 47615).
        sync_cmds::sync_export_bundle,
        sync_cmds::sync_import_bundle,
        sync_cmds::sync_keypair_generate,
        sync_cmds::sync_public_key,
        sync_cmds::sync_serve_start,
        sync_cmds::sync_serve_stop,
        sync_cmds::sync_serve_status,
        sync_cmds::sync_peer_sync,
        sync_cmds::node_attach,
        sync_cmds::sync_fingerprint,
        // P8.8: auto-updater check + install/relaunch.
        updater_cmds::updater_check,
        updater_cmds::updater_install,
        // P11.5.3: real FS / shell / CDP-browser / memory views.
        fs_cmds::fs_home,
        fs_cmds::fs_list_dir,
        fs_cmds::fs_read_file,
        fs_cmds::fs_write_file,
        fs_cmds::fs_write_ticket,
        fs_cmds::fs_write_commit,
        fs_cmds::fs_undo_list,
        shell_cmds::shell_spawn,
        shell_cmds::shell_write,
        shell_cmds::shell_kill,
        shell_cmds::shell_status,
        browser_cmds::browser_start,
        browser_cmds::browser_navigate,
        browser_cmds::browser_snapshot,
        browser_cmds::browser_read,
        browser_cmds::browser_click,
        browser_cmds::browser_type,
        browser_cmds::browser_stop,
        browser_cmds::browser_status,
        memory_cmds::memory_request,
        memory_cmds::memory_read,
        // P11.5.3 IDE: git SCM + LSP diagnostics.
        git_cmds::git_status,
        git_cmds::git_log,
        git_cmds::git_diff,
        git_cmds::git_stage_all,
        git_cmds::git_commit,
        git_cmds::git_root,
        git_cmds::git_worktree_add,
        git_cmds::git_worktree_list,
        git_cmds::git_worktree_merge,
        git_cmds::git_worktree_revert,
        lsp_cmds::lsp_diagnostics,
        // P11.5.9: repo-map / file-outline / MODEL_ALIASES / ai! markers.
        codeintel_cmds::repomap_build,
        codeintel_cmds::file_outline,
        codeintel_cmds::model_aliases_resolve,
        codeintel_cmds::ai_markers_scan,
        // P48.3 (E9): desktop computer-use through the effect funnel.
        desktop_cmds::desktop_status,
        desktop_cmds::desktop_windows,
        desktop_cmds::desktop_read,
        desktop_cmds::desktop_see,
        desktop_cmds::desktop_act,
        desktop_cmds::desktop_stop,
    ]
}
