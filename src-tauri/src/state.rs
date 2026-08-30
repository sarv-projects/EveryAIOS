//! Shell managed state (Fix 1b).
//!
//! Extracted verbatim — field-for-field and type-for-type — from the old
//! `lib.rs` `AppState` so this is pure motion: every existing `use
//! crate::AppState` (26 files) still resolves through the re-export in
//! `lib.rs`. Keeping the fields in one struct is a deliberate, conservative
//! first step; grouping them into domain sub-structs is a follow-up and
//! should land behind the same safety test as Fix 1a.

use std::path::PathBuf;
use std::process::{ChildStdin, ChildStdout};
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};

use everyaios_core::GuardService;
use everyaios_guard::prescan::Guard;
use everyaios_vault::Vault;

use crate::acp_cmds::AcpHandle;
use crate::browser_cmds::LiveBrowser;
use crate::control::FileUndo;
use crate::desktop_cmds::DesktopSlot;
use crate::mcp_cmds::McpServerRow;
use crate::shell_cmds::ShellHandle;

/// Shared state handed to every Tauri command via `State<'_, AppState>`.
pub struct AppState {
    /// P0.2: the boot report line from `everyaios-core::boot`.
    pub boot_report: Mutex<String>,
    /// P0.2: an initialized Guard-1 scanner (stub blocklist until P7.4).
    pub guard: Guard,
    /// The encrypted vault (opened at boot; shared with the chat relay).
    pub vault: Arc<Mutex<Vault>>,
    /// P1.4: the chat relay over the coordinator link. `None` until the
    /// supervisor hands the sidecar's stdio pipes to a `SidecarLink` (the
    /// integration seam — the relay + protocol are fully built + tested).
    pub chat_relay: Mutex<Option<everyaios_core::ChatRelay<ChildStdin, ChildStdout>>>,
    /// P3.1: the replay store base dir (replays/ + screenshots/ + index).
    pub replay_dir: PathBuf,
    /// P3.2: the cockpit / ambient flight-deck live state (agent cards,
    /// interrupts, quiet flag) — fed by the coordinator via the feed seams,
    /// polled by the UI.
    pub cockpit: Arc<Mutex<everyaios_audit::cockpit::CockpitState>>,
    /// P7.5/J21 (Guard-2): the shared pre-flight service (tickets + policy +
    /// estop + profile) — minted by the coordinator over `guard/*`, rendered
    /// + approved/rejected by the cards here, consumed by the executor.
    pub guard_service: Arc<Mutex<GuardService>>,
    /// F12/J17 (ACP harness bridge): live ACP agent sessions keyed by handle
    /// id — spawned via `acp_launch`, driven via `acp_prompt`/`acp_cancel`.
    pub(crate) acp_sessions: Mutex<std::collections::HashMap<String, AcpHandle>>,
    /// H4: Merkle chain of mutations (Excel / ACP-install / undo).
    pub audit: Mutex<everyaios_audit::merkle::MerkleChain>,
    /// Durable NDJSON audit log (best-effort; None if the file couldn't open).
    pub audit_log: Mutex<Option<everyaios_audit::AuditWriter>>,
    /// File snapshots for agent undo (xlsx + other shell mutations).
    pub file_undos: Mutex<Vec<FileUndo>>,
    /// J16: whether the device is on battery (heavy storage scans defer).
    pub battery: Arc<AtomicBool>,
    /// P11.5.3: the live CDP browser session for the browse view (None until
    /// `browser_start`). Dropping it kills the Chrome child.
    pub browser: Mutex<Option<LiveBrowser>>,
    /// P11.5.3: live shell processes keyed by session id (shell view).
    pub shells: Mutex<std::collections::HashMap<String, ShellHandle>>,
    /// P11.5.8: attached user-supplied MCP servers (rows for the Connectors
    /// panel) + the live child handles (dropping the map kills the child).
    pub mcp_servers: Mutex<std::collections::HashMap<String, McpServerRow>>,
    pub mcp_live: Mutex<std::collections::HashMap<String, everyaios_mcp::attach::AttachedServer>>,
    /// Remote-MCP OAuth 2.1: in-flight PKCE flows (store id → flow) and
    /// connected tokens (store id → bearer). Live in the shell, not the
    /// renderer — the coordinator never sees them.
    pub mcp_remote_flows:
        Arc<Mutex<std::collections::HashMap<String, crate::mcp_cmds::RemoteFlowState>>>,
    pub mcp_remote_tokens: Arc<Mutex<std::collections::HashMap<String, String>>>,
    /// P48.3 (E9): the lazily-attached native desktop engine (None until first
    /// use; honest-fail on headless / no display). Engine + audit bridge live
    /// here — never in the renderer or the coordinator.
    pub desktop: Mutex<DesktopSlot>,
}
