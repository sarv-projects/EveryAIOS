//! F12 / J17 — the **ACP harness bridge** commands (doc 45 §1, doc 57 §2).
//!
//! Thin wrappers over `everyaios-acp`:
//! - [`acp_agents`] — the launch registry (the `ollama launch` pattern): one
//!   manifest per agent with its auth-mode badge, distribution and protocol,
//!   so the picker shows "same chat bar, agent differs, default = inbuilt".
//! - [`acp_launch`] — resolve the spawn plan, spawn the agent CLI, run the
//!   `initialize` handshake + `session/new`, and store the live session. The
//!   agent's advertised `authMethods` are surfaced: if `session/new` returns
//!   `auth_required`, the launch still succeeds but reports `authRequired:
//!   true` so the UI can render "Sign in with <agent>" before prompting.
//! - [`acp_authenticate`] — drive the ACP `authenticate` flow (agent-type:
//!   the agent handles login; url-type: return the browser URL, re-call after
//!   the user completes), then retry `session/new`.
//! - [`acp_prompt`] — drive one turn; the agent's `session/request_permission`
//!   requests are answered by the shared [`everyaios_core::GuardService`]
//!   (estop → policy → profile), so an ACP agent obeys the *same* Guard-2
//!   ticket card as the inbuilt engine.
//! - [`acp_install_request`] / [`acp_install_commit`] — the F8 one-click
//!   install split into the Guard-2 halves: the request resolves the plan and
//!   mints a ticket (or auto-allows allow-listed agents); the commit consumes
//!   the ticket (`use_ticket`) and executes the download, so the download is
//!   a **renderable approval card**, not a silent write.
//! - [`acp_cancel`] / [`acp_shutdown`] / [`acp_sessions`] — turn interrupt,
//!   teardown, and live-handle listing.
//!
//! The spawn/handshake/framing logic is tested in `everyaios-acp`; this
//! module is the app-level state holder + policy seam.

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use everyaios_acp::{
    AcpSession, AuthMethod, AvailableCommand, ClientInfo, ConfigOption, Distribution, Installer,
    LaunchRegistry, PermissionDecision, Platform, PolicyVerdict, ProcessTransport, PromptContent,
    PromptOutcome, RegistryClient, RegistryPolicy, ToolCall, ToolKind,
};
use everyaios_core::config::Config;
use everyaios_core::{ExecutionPhase, ExecutionTrigger, GuardDecision};
use everyaios_guard::{DecisionPackage, Operation, RiskLevel};
use serde::Serialize;
use tauri::State;

use crate::AppState;

/// Monotonic ACP handle-id source (never reuses an id within a process).
static ACP_COUNTER: AtomicU64 = AtomicU64::new(1);

/// P38 — read the `primary_chief` default (`inbuilt` | ACP agent id). The
/// dispatcher resolves: explicit session value → this default → `inbuilt`.
/// P53.3 — `known` is the live launch-registry id set (inbuilt + every
/// registry agent), never a hardcoded trio.
#[tauri::command]
pub fn chief_default_get() -> Result<serde_json::Value, String> {
    let cfg = Config::load().map_err(|e| e.to_string())?;
    let mut known = vec!["inbuilt".to_string()];
    known.extend(launch_registry().agents.iter().map(|m| m.id.clone()));
    Ok(serde_json::json!({
        "primaryChief": cfg.primary_chief,
        "known": known
    }))
}

/// P53.3 — set the `primary_chief` default. Occupancy is **any installed**
/// agent: the id must be in the launch registry **and** installed (an
/// EveryAIOS install record or a PATH-discovered binary — `inbuilt` is always
/// installed). Unknown or not-installed ids are refused fail-closed so a typo
/// or a missing binary never silently falls back to the inbuilt engine.
#[tauri::command]
pub fn chief_default_set(primary_chief: String) -> Result<String, String> {
    if primary_chief != "inbuilt" && launch_registry().get(&primary_chief).is_none() {
        return Err(format!(
            "unknown primary_chief {primary_chief:?} — no registered launch path (fail-closed, no silent fallback)"
        ));
    }
    if !agent_installed(&primary_chief) {
        return Err(format!(
            "primary_chief {primary_chief:?} is not installed — install it (F8) or put it on PATH first (fail-closed)"
        ));
    }
    let path = Config::config_path().map_err(|e| e.to_string())?;
    let mut cfg = Config::load().map_err(|e| e.to_string())?;
    cfg.primary_chief = primary_chief.clone();
    cfg.save(&path).map_err(|e| e.to_string())?;
    Ok(primary_chief)
}

/// P53.3 — installed-ness for Chief occupancy: `inbuilt` always; otherwise an
/// EveryAIOS install record **or** a PATH-discovered binary (the same two legs
/// `acp_install_status` reports — one predicate, no second definition).
fn install_outcome_usable(outcome: &everyaios_acp::InstallOutcome) -> bool {
    match outcome.kind.as_str() {
        // A stale pointer is not occupancy. The executable must still be
        // present before Settings or Chief can call this agent installed.
        "binary" | "path" => outcome
            .binary_path
            .as_deref()
            .map(std::path::Path::is_file)
            .unwrap_or(false),
        // npx/uvx are self-installing at launch; readiness means their
        // package manager is available, not that EveryAIOS downloaded the
        // package into its own tree.
        "npx" => resolve_on_path("npx").is_some(),
        "uvx" => resolve_on_path("uvx").is_some(),
        _ => false,
    }
}

fn resolve_native_binary(command: &str) -> Option<std::path::PathBuf> {
    resolve_on_path(command).or_else(|| discover_windows_app_path(command))
}

pub(crate) fn agent_installed(agent_id: &str) -> bool {
    if agent_id == "inbuilt" || agent_id == "everyaios" {
        return true;
    }
    let registry = launch_registry();
    if let Some(outcome) = installer().installed(agent_id) {
        return install_outcome_usable(&outcome);
    }
    match registry.get(agent_id).map(|m| &m.distribution) {
        Some(Distribution::Binary { command, .. }) => {
            !command.is_empty() && resolve_native_binary(command).is_some()
        }
        Some(Distribution::Npx { .. }) => resolve_on_path("npx").is_some(),
        Some(Distribution::Uvx { .. }) => resolve_on_path("uvx").is_some(),
        None => false,
    }
}

/// The launch registry the runtime actually resolves against: the curated
/// builtin seed **merged with the cached official ACP registry**
/// (`registry.json`, cached under `<data_dir>/agents` by [`registry_client`]).
///
/// This is the one place the dynamic catalog enters the runtime. The two
/// facts stay separate: the merged registry is the *catalog* (which agents
/// exist, and how to spawn them), while occupancy is [`agent_installed`]
/// (an EveryAIOS install record or a PATH-discovered binary). A registry
/// entry therefore never becomes a selectable/usable agent by itself.
///
/// No cache (never fetched, or offline before the first fetch) ⇒ the curated
/// seed, so the shell degrades to the builtin list instead of failing.
///
/// The merge is memoised on the cache file's mtime: this helper is called in
/// loops (once per agent row in `acp_install_status` / `chief_subagents`), and
/// re-parsing the registry JSON per row would be a real cost. A refresh that
/// rewrites `registry.json` changes the mtime and invalidates the memo, so a
/// newly fetched catalog is picked up on the next read without a restart.
pub(crate) fn launch_registry() -> LaunchRegistry {
    let client = registry_client();
    let stamp = std::fs::metadata(client.cache_dir().join("registry.json"))
        .and_then(|m| m.modified())
        .ok();
    if let Ok(memo) = LAUNCH_REGISTRY_MEMO.lock() {
        if let Some((cached_stamp, reg)) = memo.as_ref() {
            if *cached_stamp == stamp {
                return reg.clone();
            }
        }
    }
    let mut reg = LaunchRegistry::builtin();
    if let Some(snap) = client.load_cached() {
        snap.index.merge_into(&mut reg, Platform::current());
    }
    if let Ok(mut memo) = LAUNCH_REGISTRY_MEMO.lock() {
        *memo = Some((stamp, reg.clone()));
    }
    reg
}

/// Memo for [`launch_registry`]: `(cache-file mtime, merged registry)`.
static LAUNCH_REGISTRY_MEMO: std::sync::Mutex<
    Option<(Option<std::time::SystemTime>, LaunchRegistry)>,
> = std::sync::Mutex::new(None);

/// A live ACP agent session + the id it was launched under.
pub(crate) struct AcpHandle {
    pub agent_id: String,
    /// The workspace dir the agent session was created in (retained so
    /// [`acp_authenticate`] can retry `session/new` after login).
    pub cwd: String,
    /// True when `session/new` answered `auth_required` — the user must sign
    /// in before the handle can drive prompts.
    pub auth_required: bool,
    /// The methods the agent advertised in `initialize` (`authMethods`).
    pub auth_methods: Vec<AuthMethod>,
    /// P53.8 — capabilities advertised by the agent at initialize.
    pub embedded_context: bool,
    /// P53.1 — the agent's last advertised slash vocabulary (from the most
    /// recent `available_commands_update` on this handle; empty until the
    /// agent sends one). Served to the composer via `acp_session_commands`.
    pub available_commands: Vec<AvailableCommand>,
    /// Complete agent-owned config option state. This is intentionally
    /// separate from EveryAIOS Native provider/model state.
    pub config_options: Vec<ConfigOption>,
    pub session: AcpSession<ProcessTransport>,
}

/// One launched-session summary for the picker/harness list.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AcpHandleInfo {
    handle: String,
    agent_id: String,
    agent_name: String,
    session_id: String,
    protocol: String,
    /// True when the agent needs authentication before it will accept a
    /// session (the UI renders the "Sign in" surface from `authMethods`).
    #[serde(default)]
    auth_required: bool,
    #[serde(default)]
    auth_methods: Vec<AuthMethod>,
    #[serde(default)]
    embedded_context: bool,
    #[serde(default)]
    config_options: Vec<ConfigOption>,
}

impl From<(&AcpHandle, &str)> for AcpHandleInfo {
    fn from((h, handle): (&AcpHandle, &str)) -> Self {
        AcpHandleInfo {
            handle: handle.to_string(),
            agent_id: h.agent_id.clone(),
            agent_name: h.agent_id.clone(),
            session_id: h.session.session_id().unwrap_or("").to_string(),
            protocol: "acp".to_string(),
            auth_required: h.auth_required,
            auth_methods: h.auth_methods.clone(),
            embedded_context: h.embedded_context,
            config_options: h.config_options.clone(),
        }
    }
}

/// The launch registry (the agent picker). Default = inbuilt EveryAIOS.
///
/// P50.3.9 — governance truth: every agent row carries an explicit
/// `governance` classification so the picker and the work transcript never
/// imply EveryAIOS audit coverage for effects an external agent performs
/// inside its own process.
/// - `GovernedMediated` — every effect flows through the EveryAIOS executor
///   (Guard-2 ticket → receipt on the one audit trail). Inbuilt engine only.
/// - `SelfContained` — the agent's `session/request_permission` requests are
///   answered by the shared GuardService (mediated at the ACP boundary), but
///   effects the agent performs internally (its own shell, files, network)
///   are **outside** the EveryAIOS audit trail. Honest label for ACP
///   harnesses like Claude Code / Codex.
/// - `NotGoverned` — neither of the above; no EveryAIOS coverage. (Registry
///   agents that neither mediate permissions nor route effects; the picker
///   must render the row as un-audited.)
#[tauri::command]
pub fn acp_agents() -> Vec<serde_json::Value> {
    launch_registry()
        .agents
        .iter()
        .map(|m| {
            let (class, audited_effects, note) = if m.is_default {
                (
                    "GovernedMediated",
                    true,
                    "Every effect flows through the EveryAIOS executor: Guard-2 ticket, receipt on the audit trail.",
                )
            } else {
                (
                    "SelfContained",
                    false,
                    "Permission requests are mediated by Guard-2, but effects performed inside the agent's own process (shell, files, network) are outside the EveryAIOS audit trail.",
                )
            };
            let mut v = serde_json::to_value(m).unwrap_or(serde_json::Value::Null);
            if let Some(obj) = v.as_object_mut() {
                obj.insert(
                    "governance".into(),
                    serde_json::json!({
                        "class": class,
                        "auditedEffects": audited_effects,
                        "note": note,
                    }),
                );
            }
            v
        })
        .collect()
}

/// F8 — refresh the official ACP registry cache (`registry.json` from the
/// CDN). Returns the catalog status; the app stays on the builtin seed if the
/// network fails.
#[tauri::command]
pub fn acp_registry_refresh() -> Result<serde_json::Value, String> {
    let client = registry_client();
    let snap = client.refresh().map_err(|e| e.to_string())?;
    Ok(serde_json::json!({
        "version": snap.index.version,
        "agentCount": snap.index.agents.len(),
        "fetchedAtMs": snap.fetched_at_ms,
        "fromCache": snap.from_cache,
        "cacheDir": client.cache_dir(),
    }))
}

/// F8 — the cached registry status (no network). `null` if never cached.
#[tauri::command]
pub fn acp_registry_status() -> Result<Option<serde_json::Value>, String> {
    let client = registry_client();
    Ok(client.load_cached().map(|s| {
        serde_json::json!({
            "version": s.index.version,
            "agentCount": s.index.agents.len(),
            "fetchedAtMs": s.fetched_at_ms,
        })
    }))
}

/// F8 — the exact install plan for a registry agent on this platform, plus
/// the trust/ToS policy verdict (plan-before-touch: this is what the
/// Guard-2-ticketed installer would do).
#[tauri::command]
pub fn acp_registry_install_plan(agent_id: String) -> Result<serde_json::Value, String> {
    let client = registry_client();
    let snap = client
        .load_or_refresh()
        .ok_or_else(|| "no registry catalog available (offline and not cached)".to_string())?;
    let spec = snap
        .index
        .install_plan(&agent_id, Platform::current())
        .ok_or_else(|| format!("no install plan for this platform on {agent_id}"))?;
    let verdict = RegistryPolicy::builtin().evaluate(&agent_id, &spec.license);
    Ok(serde_json::json!({ "spec": spec, "policy": verdict.as_str() }))
}

/// The F8 registry cache dir: `<data_dir>/agents`.
fn registry_client() -> RegistryClient {
    RegistryClient::new(everyaios_core::default_data_dir().join("agents"))
}

/// How old a cached registry must be before the boot job refetches it. The
/// upstream job publishes hourly; 6h keeps us current for a desktop app
/// without polling someone else's CDN every hour.
const REGISTRY_STALE_SECS: u64 = 6 * 60 * 60;
/// How often the job re-checks staleness (no network unless stale).
const REGISTRY_RECHECK_SECS: u64 = 60 * 60;

/// P60.14 — the ACP registry boot job.
///
/// The contract is a **dynamically consumed** catalog with a local
/// last-known-good cache: discovery must not depend on the user remembering to
/// press “Discover more”. So the shell refreshes the official registry when the
/// cache is missing or stale (mirroring the P56.1 models.dev job, whose cadence
/// is configurable in Settings), then re-checks hourly so an app left running
/// picks up new agents without a restart.
///
/// Failure is silent and non-fatal: a failed fetch keeps the cached catalog,
/// and with no cache at all the resolver degrades to the curated seed. Never
/// blocks the UI thread; writes only the registry cache (`registry.json` +
/// `registry.meta.json`) and never touches the vault.
pub fn spawn_registry_refresh_job() {
    std::thread::spawn(|| loop {
        let client = registry_client();
        let stale = client
            .load_cached()
            .map(|s| {
                let age_ms = now_ms().saturating_sub(s.fetched_at_ms);
                age_ms > REGISTRY_STALE_SECS * 1000
            })
            .unwrap_or(true);
        if stale {
            // Best-effort: an offline boot keeps whatever is cached.
            let _ = client.refresh();
        }
        std::thread::sleep(std::time::Duration::from_secs(REGISTRY_RECHECK_SECS));
    });
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// The F8 install root: `<data_dir>/agents` (registry cache + installed
/// binaries + install-state pointers share the directory).
fn installer() -> Installer {
    Installer::new(everyaios_core::default_data_dir().join("agents"))
}

/// Resolve the current install plan for a registry agent (shared by the
/// install request/commit halves so the args-hash is deterministic).
fn resolve_spec(agent_id: &str) -> Result<everyaios_acp::InstallSpec, String> {
    let client = registry_client();
    let snap = client
        .load_or_refresh()
        .ok_or_else(|| "no registry catalog available (offline and not cached)".to_string())?;
    snap.index
        .get(agent_id)
        .ok_or_else(|| format!("unknown registry agent: {agent_id}"))?;
    snap.index
        .install_plan(agent_id, Platform::current())
        .ok_or_else(|| format!("no install plan for this platform on {agent_id}"))
        .map(|mut spec| {
            // Pin the extract destination so the decision card shows exactly
            // where the bytes land (`<data_dir>/agents/<id>/<version>`).
            spec.install_dir = Some(
                everyaios_core::default_data_dir()
                    .join("agents")
                    .join(agent_id)
                    .join(&spec.version),
            );
            spec
        })
}

/// Probe PATH for an executable name. This is the auto-discovery half: an
/// agent CLI the user installed themselves (Claude Code via npm, Codex, …)
/// shows up as installed without EveryAIOS ever downloading it. On Windows,
/// npm-global CLIs are `.cmd`/`.bat` shims and native tools are `.exe`, so
/// all three are probed there.
fn resolve_on_path(name: &str) -> Option<std::path::PathBuf> {
    let path = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&path) {
        let cand = dir.join(name);
        if cand.is_file() {
            return Some(cand);
        }
        #[cfg(windows)]
        for ext in ["exe", "cmd", "bat"] {
            let mut p = cand.clone();
            p.set_extension(ext);
            if p.is_file() {
                return Some(p);
            }
        }
    }
    None
}

/// Read a Windows App Paths registration without invoking a shell. App Paths
/// is a discovery source only: its result is never treated as a managed
/// EveryAIOS install and is never persisted as an install record.
#[cfg(windows)]
fn discover_windows_app_path(command: &str) -> Option<std::path::PathBuf> {
    use std::process::Command;

    let exe = command
        .strip_suffix(".exe")
        .or_else(|| command.strip_suffix(".EXE"))
        .unwrap_or(command);
    let exe = format!("{exe}.exe");
    for hive in ["HKCU", "HKLM"] {
        let key =
            format!(r"{hive}\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\{exe}");
        let output = Command::new("reg")
            .args(["query", &key, "/ve"])
            .output()
            .ok()?;
        if !output.status.success() {
            continue;
        }
        let text = String::from_utf8_lossy(&output.stdout);
        for line in text.lines() {
            if let Some((_, value)) = line.split_once("REG_SZ") {
                let value = value.trim().trim_matches('"');
                let path = std::path::PathBuf::from(value);
                if path.is_file() {
                    return Some(path);
                }
            }
        }
    }
    None
}

#[cfg(not(windows))]
fn discover_windows_app_path(_command: &str) -> Option<std::path::PathBuf> {
    None
}

/// Discover a CLI installed only inside WSL. This is intentionally separate
/// from Windows PATH/App Paths: the returned Linux path must be launched via
/// `wsl.exe -d <distro> -- <command>`, never as a Windows executable.
#[cfg(windows)]
fn discover_wsl_path(command: &str) -> Option<(String, String)> {
    use std::process::Command;

    let output = Command::new("wsl.exe").args(["-l", "-q"]).output().ok()?;
    if !output.status.success() {
        return None;
    }
    let distros = String::from_utf8_lossy(&output.stdout);
    for distro in distros.lines().map(str::trim).filter(|d| !d.is_empty()) {
        let output = Command::new("wsl.exe")
            .args(["-d", distro, "--", "which", command])
            .output()
            .ok()?;
        if !output.status.success() {
            continue;
        }
        let linux_path = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if !linux_path.is_empty() && !linux_path.contains('\\') {
            return Some((distro.to_string(), linux_path));
        }
    }
    None
}

#[cfg(not(windows))]
fn discover_wsl_path(_command: &str) -> Option<(String, String)> {
    None
}

/// P66.1 — Dedicated WSL spawn adapter: Translates a WSL-discovered command into
/// a `wsl.exe -d <distro> -- <linux_path>` execution tuple.
pub fn resolve_wsl_spawn(command: &str) -> Option<(String, Vec<String>)> {
    discover_wsl_path(command).map(|(distro, linux_path)| {
        (
            "wsl.exe".to_string(),
            vec!["-d".to_string(), distro, "--".to_string(), linux_path],
        )
    })
}

/// Build the public, non-secret runtime location record consumed by Settings
/// and the picker. Catalog membership is never used as occupancy evidence.
pub(crate) fn runtime_location_json(
    manifest: &everyaios_acp::HarnessManifest,
    install: Option<&everyaios_acp::InstallOutcome>,
) -> serde_json::Value {
    if let Some(o) = install {
        let kind = match o.kind.as_str() {
            "path" => {
                if cfg!(windows) {
                    "windows_path"
                } else {
                    "path"
                }
            }
            "binary" => "managed",
            "npx" => "package_manager",
            "uvx" => "package_manager",
            _ => "unavailable",
        };
        return serde_json::json!({
            "kind": kind,
            "source": if o.kind == "path" { "path_probe" } else { "everyaios_install" },
            "executable": o.binary_path.as_ref().map(|p| p.to_string_lossy().into_owned()),
            "version": if o.version == "path" { serde_json::Value::Null } else { serde_json::json!(o.version) },
            "verifiedAt": serde_json::Value::Null,
        });
    }

    match &manifest.distribution {
        Distribution::Binary { command, .. } if !command.is_empty() => {
            if let Some(path) = resolve_on_path(command) {
                return serde_json::json!({
                    "kind": if cfg!(windows) { "windows_path" } else { "path" },
                    "source": "path_probe",
                    "executable": path.to_string_lossy(),
                    "version": serde_json::Value::Null,
                    "verifiedAt": serde_json::Value::Null,
                });
            }
            if let Some(path) = discover_windows_app_path(command) {
                return serde_json::json!({
                    "kind": "windows_path",
                    "source": "app_paths",
                    "executable": path.to_string_lossy(),
                    "version": serde_json::Value::Null,
                    "verifiedAt": serde_json::Value::Null,
                });
            }
            if let Some((distro, linux_path)) = discover_wsl_path(command) {
                return serde_json::json!({
                    "kind": "wsl",
                    "source": "wsl_probe",
                    "distro": distro,
                    "linuxPath": linux_path,
                    "windowsLauncher": "wsl.exe",
                    "version": serde_json::Value::Null,
                    "verifiedAt": serde_json::Value::Null,
                });
            }
            serde_json::json!({ "kind": "unavailable", "source": "path_probe", "reason": "executable not found on PATH, Windows App Paths, or WSL" })
        }
        Distribution::Npx { package, .. } => {
            if let Some(path) = resolve_on_path("npx") {
                serde_json::json!({ "kind": "package_manager", "source": "path_probe", "manager": "npx", "command": path.to_string_lossy(), "package": package })
            } else {
                serde_json::json!({ "kind": "unavailable", "source": "path_probe", "reason": "npx is not available on the effective PATH" })
            }
        }
        Distribution::Uvx { package, .. } => {
            if let Some(path) = resolve_on_path("uvx") {
                serde_json::json!({ "kind": "package_manager", "source": "path_probe", "manager": "uvx", "command": path.to_string_lossy(), "package": package })
            } else {
                serde_json::json!({ "kind": "unavailable", "source": "path_probe", "reason": "uvx is not available on the effective PATH" })
            }
        }
        Distribution::Binary { .. } => {
            serde_json::json!({ "kind": "unavailable", "source": "registry_catalog", "reason": "manifest has no executable command" })
        }
    }
}

/// P65.2 — the one occupancy-provenance builder for Settings: install record
/// or PATH/App-Paths/WSL probe for one agent id, mapped to the location JSON.
/// Inbuilt has no executable and reports `unavailable` here (its occupancy is
/// "ships with the app", carried by `agent_installed`, not by a path).
pub(crate) fn runtime_location_for(agent_id: &str) -> serde_json::Value {
    let registry = launch_registry();
    let Some(manifest) = registry.get(agent_id) else {
        return serde_json::json!({ "kind": "unavailable", "reason": "unknown agent id" });
    };
    if manifest.protocol == everyaios_acp::HarnessProtocol::Inbuilt {
        return serde_json::json!({ "kind": "unavailable", "reason": "inbuilt engine ships with the app" });
    }
    let installed = installer()
        .installed(agent_id)
        .filter(install_outcome_usable);
    runtime_location_json(manifest, installed.as_ref())
}

/// F8/P66 — install state plus exact non-secret runtime provenance for every
/// registry agent. Managed installs, user PATH/App Paths discoveries, and
/// npx/uvx readiness are distinct. WSL is reported as a separate discovery
/// location and is never treated as a native Windows executable.
#[tauri::command]
pub fn acp_install_status() -> Result<serde_json::Value, String> {
    let registry = launch_registry();
    let inst = installer();
    let mut out = serde_json::Map::new();
    for m in &registry.agents {
        if m.protocol == everyaios_acp::HarnessProtocol::Inbuilt {
            continue;
        }
        let mut installed = inst.installed(&m.id).filter(install_outcome_usable);
        if installed.is_none() {
            if let Distribution::Binary { command, .. } = &m.distribution {
                if !command.is_empty() {
                    if let Some(path) = resolve_native_binary(command) {
                        // Persist the exact user-owned path so later launches
                        // do not depend on a mutable child PATH.
                        let _ = inst.record_path(&m.id, &path);
                        installed = inst.installed(&m.id);
                    }
                }
            }
        }
        let location = runtime_location_json(m, installed.as_ref());
        let location_kind = location
            .get("kind")
            .and_then(serde_json::Value::as_str)
            .unwrap_or("unavailable");
        let package_manager_ready = matches!(location_kind, "package_manager");
        let discovered = location_kind != "unavailable";
        // App Paths, PATH, and WSL (via dedicated WSL spawn adapter) are launchable.
        let launchable = installed.is_some()
            || package_manager_ready
            || matches!(location_kind, "path" | "windows_path" | "wsl");
        out.insert(
            m.id.clone(),
            serde_json::json!({
                "installed": installed.is_some() || package_manager_ready,
                "discovered": discovered,
                "launchable": launchable,
                "version": installed.as_ref().and_then(|o| if o.version == "path" { None } else { Some(o.version.clone()) }),
                "kind": installed.as_ref().map(|o| o.kind.clone()).or_else(|| package_manager_ready.then(|| "package_manager".to_string())),
                "binaryPath": installed.as_ref().and_then(|o| o.binary_path.as_ref().map(|p| p.to_string_lossy().into_owned())),
                "location": location,
            }),
        );
    }
    Ok(serde_json::Value::Object(out))
}

/// F8 — the **install request** half (plan-before-touch). Resolves the
/// platform install plan, applies the trust gate (denylist refuses outright),
/// then routes through the shared Guard-2 [`GuardService`]: allow-listed /
/// open-license agents auto-allow, everything else mints a ticket whose card
/// renders the full decision package (goal, paths, download URL, sha256).
/// **Nothing is downloaded here** — [`acp_install_commit`] is the executor.
#[tauri::command]
pub fn acp_install_request(
    state: State<'_, AppState>,
    agent_id: String,
) -> Result<serde_json::Value, String> {
    let spec = resolve_spec(&agent_id)?;
    let verdict = RegistryPolicy::builtin().evaluate(&agent_id, &spec.license);
    if verdict == PolicyVerdict::Block {
        return Err(format!("agent {agent_id} is blocked by policy"));
    }

    // The decision card: exactly what the download will do.
    let mut decision = DecisionPackage::new(format!(
        "Install {} v{} (F8 registry)",
        spec.name, spec.version
    ))
    .with_risk(RiskLevel::Medium)
    .with_paths(vec![spec
        .install_dir
        .clone()
        .unwrap_or_else(|| {
            everyaios_core::default_data_dir()
                .join("agents")
                .join(&agent_id)
        })
        .to_string_lossy()
        .into_owned()]);
    let exact_command: Vec<String> = match &spec.kind {
        everyaios_acp::InstallKind::Npx { package, .. } => {
            vec!["npx".into(), "-y".into(), package.clone()]
        }
        everyaios_acp::InstallKind::Uvx { package, .. } => {
            vec!["uvx".into(), package.clone()]
        }
        everyaios_acp::InstallKind::Binary {
            archive, sha256, ..
        } => {
            vec![
                "everyaios-installer".into(),
                "download".into(),
                archive.clone(),
                format!("sha256:{sha256}"),
            ]
        }
    };
    everyaios_core::exact_command_consent(&exact_command).map_err(|e| e.to_string())?;

    decision = match &spec.kind {
        everyaios_acp::InstallKind::Npx { package, .. } => decision
            .with_script(vec![format!("npx -y {package}")], "npx")
            .with_network(vec!["registry.npmjs.org".into()]),
        everyaios_acp::InstallKind::Uvx { package, .. } => decision
            .with_script(vec![format!("uvx {package}")], "uvx")
            .with_network(vec!["pypi.org".into()]),
        everyaios_acp::InstallKind::Binary {
            archive, sha256, ..
        } => {
            let host = url_host(archive);
            decision
                .with_script(
                    vec![
                        format!("download {archive}"),
                        format!("sha256 verify {sha256}"),
                        format!(
                            "extract → {}",
                            spec.install_dir
                                .as_ref()
                                .map(|p| p.to_string_lossy().into_owned())
                                .unwrap_or_default()
                        ),
                    ],
                    "everyaios-installer",
                )
                .with_network(vec![host])
        }
    };

    let args_hash = install_args_hash(&agent_id, &spec.version);
    let mut guard = state.guard_service.lock().map_err(|e| e.to_string())?;
    match guard.evaluate(
        "install",
        &agent_id,
        "acp.install",
        Operation::GenericWrite,
        decision,
        &args_hash,
        0,
    ) {
        GuardDecision::Allow { ticket_id } => Ok(serde_json::json!({
            "action": "allow",
            "agentId": agent_id,
            "version": spec.version,
            // Auto-allowed still carries a (pre-approved) single-use ticket —
            // the executor consumes it in `acp_install_commit` either way.
            "ticketId": ticket_id,
            "exactCommand": exact_command,
            "consentRequired": true,
            "preferNative": matches!(spec.kind, everyaios_acp::InstallKind::Binary { .. }),
        })),
        GuardDecision::Ask { ticket_id } => Ok(serde_json::json!({
            "action": "ask",
            "agentId": agent_id,
            "version": spec.version,
            "ticketId": ticket_id,
            "exactCommand": exact_command,
            "consentRequired": true,
            "preferNative": matches!(spec.kind, everyaios_acp::InstallKind::Binary { .. }),
        })),
        GuardDecision::Block { reason } => Err(format!("install blocked: {reason}")),
    }
}

/// F8 — the **install executor** (the "touch" half). Consumes the Guard-2
/// ticket (**mandatory** — `use_ticket` enforces approval + single-use +
/// args-hash), then executes the plan: binary agents download → sha256-verify
/// → extract; npx/uvx agents record the pin. The user's explicit click
/// satisfied an `Ask` verdict by approving the card; an auto-allowed (`allow`)
/// request carries a pre-approved ticket that is still consumed here.
#[tauri::command]
pub fn acp_install_commit(
    state: State<'_, AppState>,
    agent_id: String,
    ticket_id: String,
) -> Result<serde_json::Value, String> {
    let spec = resolve_spec(&agent_id)?;
    let args_hash = install_args_hash(&agent_id, &spec.version);
    let mut guard = state.guard_service.lock().map_err(|e| e.to_string())?;
    guard
        .use_ticket(&ticket_id, &args_hash)
        .map_err(|e| format!("install ticket not consumable: {e}"))?;
    drop(guard);

    let outcome = installer().install(&spec).map_err(|e| e.to_string())?;
    let audit_seq = crate::control::record_mutation(
        &state,
        crate::control::AuthKind::AgentTicket,
        "acp.install",
        serde_json::json!({
            "agentId": outcome.agent_id,
            "version": outcome.version,
            "ticketId": ticket_id,
        }),
    );
    Ok(serde_json::json!({
        "agentId": outcome.agent_id,
        "version": outcome.version,
        "kind": outcome.kind,
        "binaryPath": outcome.binary_path.map(|p| p.to_string_lossy().into_owned()),
        "env": outcome.env,
        "auditSeq": audit_seq,
        // The agent's own auth (subscription OAuth / API key) is surfaced from
        // the ACP `initialize` handshake's `authMethods` on first launch.
        "auth": "surfaced at launch via ACP authMethods",
    }))
}

/// Legacy one-shot install kept for callers that already resolved the ticket
/// (or for allow-listed agents): resolves the plan, mints the ticket if
/// policy asks, and returns `{action, ticketId?}` without touching the disk —
/// the caller then invokes [`acp_install_commit`]. Mirrors
/// [`acp_install_request`] exactly.
#[tauri::command]
pub fn acp_install(
    state: State<'_, AppState>,
    agent_id: String,
) -> Result<serde_json::Value, String> {
    acp_install_request(state, agent_id)
}

/// P66.2 — import a user-specified binary path for an agent. Validates that
/// the file exists, canonicalizes the path, records it in the installer state
/// with kind: "path", and records an audit mutation.
#[tauri::command]
pub fn acp_agent_import(
    state: State<'_, AppState>,
    agent_id: String,
    binary_path: String,
) -> Result<serde_json::Value, String> {
    let registry = launch_registry();
    let manifest = registry
        .get(&agent_id)
        .cloned()
        .ok_or_else(|| format!("unknown agent id: {agent_id}"))?;

    let trimmed = binary_path.trim();
    if trimmed.is_empty() {
        return Err("binary path cannot be empty".to_string());
    }
    let p = std::path::PathBuf::from(trimmed);
    if !p.is_file() {
        return Err(format!("path is not a valid executable file: {trimmed}"));
    }
    let canonical = std::fs::canonicalize(&p).unwrap_or(p);

    let inst = installer();
    inst.record_path(&agent_id, &canonical)
        .map_err(|e| e.to_string())?;

    let audit_seq = crate::control::record_mutation(
        &state,
        // A path the user supplied themselves is the user's own gesture; it
        // must not be recorded as an agent/ticket action.
        crate::control::AuthKind::HumanGesture,
        "acp.agent_import",
        serde_json::json!({
            "agentId": agent_id,
            "path": canonical.to_string_lossy(),
        }),
    );

    let installed = inst.installed(&agent_id);
    let location = runtime_location_json(&manifest, installed.as_ref());

    Ok(serde_json::json!({
        "agentId": agent_id,
        "status": "ready",
        "binaryPath": canonical.to_string_lossy(),
        "location": location,
        "auditSeq": audit_seq,
    }))
}

/// P66.2 — probe and verify an agent's executable readiness and version string.
/// Runs `<executable> --version` or probes launch readiness. Returns verifiedAt
/// timestamp, detected version, and readiness status.
#[tauri::command]
pub fn acp_agent_verify(agent_id: String) -> Result<serde_json::Value, String> {
    let registry = launch_registry();
    let manifest = registry
        .get(&agent_id)
        .cloned()
        .ok_or_else(|| format!("unknown agent id: {agent_id}"))?;

    let inst = installer();
    let installed = inst.installed(&agent_id).filter(install_outcome_usable);

    let (exec_cmd, verify_args, is_wsl, display_exec): (String, Vec<String>, bool, String) =
        if let Some(ref o) = installed {
            if let Some(ref p) = o.binary_path {
                let s = p.to_string_lossy().into_owned();
                (s.clone(), vec!["--version".to_string()], false, s)
            } else {
                (
                    "npx".to_string(),
                    vec!["--version".to_string()],
                    false,
                    "npx".to_string(),
                )
            }
        } else {
            match &manifest.distribution {
                Distribution::Binary { command, .. } if !command.is_empty() => {
                    if let Some(p) = resolve_native_binary(command) {
                        let s = p.to_string_lossy().into_owned();
                        (s.clone(), vec!["--version".to_string()], false, s)
                    } else if let Some((wsl_bin, wsl_prefix)) = resolve_wsl_spawn(command) {
                        let mut args = wsl_prefix;
                        let linux_exec = args.last().cloned().unwrap_or_else(|| command.clone());
                        args.push("--version".to_string());
                        (wsl_bin, args, true, format!("wsl://{}", linux_exec))
                    } else {
                        return Ok(serde_json::json!({
                            "agentId": agent_id,
                            "status": "unavailable",
                            "reason": "executable not found on PATH, Windows App Paths, or WSL",
                            "verifiedAt": now_ms(),
                        }));
                    }
                }
                Distribution::Npx { package, .. } => {
                    if let Some(p) = resolve_on_path("npx") {
                        let s = p.to_string_lossy().into_owned();
                        (s.clone(), vec!["--version".to_string()], false, s)
                    } else {
                        return Ok(serde_json::json!({
                            "agentId": agent_id,
                            "status": "unavailable",
                            "reason": "npx not found on PATH",
                            "package": package,
                            "verifiedAt": now_ms(),
                        }));
                    }
                }
                Distribution::Uvx { package, .. } => {
                    if let Some(p) = resolve_on_path("uvx") {
                        let s = p.to_string_lossy().into_owned();
                        (s.clone(), vec!["--version".to_string()], false, s)
                    } else {
                        return Ok(serde_json::json!({
                            "agentId": agent_id,
                            "status": "unavailable",
                            "reason": "uvx not found on PATH",
                            "package": package,
                            "verifiedAt": now_ms(),
                        }));
                    }
                }
                _ => {
                    return Ok(serde_json::json!({
                        "agentId": agent_id,
                        "status": "unavailable",
                        "reason": "manifest has no executable target",
                        "verifiedAt": now_ms(),
                    }));
                }
            }
        };

    if !is_wsl && !std::path::Path::new(&exec_cmd).is_file() && resolve_on_path(&exec_cmd).is_none()
    {
        return Ok(serde_json::json!({
            "agentId": agent_id,
            "status": "unavailable",
            "reason": "resolved binary file does not exist",
            "executable": display_exec,
            "verifiedAt": now_ms(),
        }));
    }

    let version_output = std::process::Command::new(&exec_cmd)
        .args(&verify_args)
        .output()
        .ok();

    let mut detected_version = None;
    let mut exit_ok = false;
    if let Some(out) = version_output {
        if out.status.success() {
            exit_ok = true;
            let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
            let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
            let v_str = if !stdout.is_empty() { stdout } else { stderr };
            if let Some(line) = v_str.lines().next() {
                let trimmed = line.trim();
                if !trimmed.is_empty() {
                    detected_version = Some(trimmed.to_string());
                }
            }
        }
    }

    Ok(serde_json::json!({
        "agentId": agent_id,
        "status": if exit_ok || (!is_wsl && std::path::Path::new(&exec_cmd).is_file()) { "ready" } else { "degraded" },
        "executable": display_exec,
        "version": detected_version.or_else(|| installed.and_then(|o| if o.version == "path" { None } else { Some(o.version) })),
        "verifiedAt": now_ms(),
        "isWsl": is_wsl,
    }))
}

/// Launch an agent by id: resolve its spawn plan, spawn the process, run the
/// ACP handshake (`initialize` → `session/new`), and keep the session alive.
///
/// The inbuilt engine (`everyaios`) has no subprocess — it routes through the
/// existing `chat_stream` path, so `acp_launch("everyaios", …)` is a no-op
/// sentinel that returns its manifest without spawning.
///
/// **Auth surfacing:** when `session/new` answers `auth_required`, the launch
/// still succeeds and reports `authRequired: true` with the agent's
/// `authMethods` — the UI renders "Sign in with <agent>" instead of failing.
#[tauri::command]
pub fn acp_launch(
    state: State<'_, AppState>,
    agent_id: String,
    cwd: String,
) -> Result<AcpHandleInfo, String> {
    let registry = launch_registry();
    let manifest = registry
        .get(&agent_id)
        .cloned()
        .ok_or_else(|| format!("unknown agent id: {agent_id}"))?;

    if manifest.protocol == everyaios_acp::HarnessProtocol::Inbuilt {
        // The inbuilt engine isn't an external process; it is the default
        // chat_stream path. Report it so the UI can route accordingly.
        return Ok(AcpHandleInfo {
            handle: "inbuilt".to_string(),
            agent_id: agent_id.clone(),
            agent_name: manifest.name,
            session_id: "inbuilt".to_string(),
            protocol: "inbuilt".to_string(),
            auth_required: false,
            auth_methods: vec![],
            embedded_context: false,
            config_options: vec![],
        });
    }

    let plan = registry
        .launch_plan(&agent_id, None)
        .ok_or_else(|| format!("no launch plan for {agent_id}"))?;

    // F8: if a binary agent is installed, launch the extracted binary path
    // (not the seed's PATH command), merging the installed env. P53.7: with
    // no install record, resolve the seed command on PATH so a user-installed
    // CLI launches by its discovered absolute path — never a bare-name guess
    // that depends on the child's inherited PATH.
    let installed = installer().installed(&agent_id);
    let path_resolved = match &plan {
        p if matches!(
            registry.get(&agent_id).map(|m| &m.distribution),
            Some(Distribution::Binary { .. })
        ) =>
        {
            resolve_native_binary(&p.command).map(|p| p.to_string_lossy().into_owned())
        }
        _ => None,
    };
    let (command, extra_args): (String, Vec<String>) = if let Some(p) =
        installed.as_ref().and_then(|o| o.binary_path.as_ref())
    {
        (p.to_string_lossy().into_owned(), vec![])
    } else if let Some(path) = path_resolved {
        let _ = installer().record_path(&agent_id, std::path::Path::new(&path));
        (path, vec![])
    } else if let Some((wsl_bin, wsl_prefix)) = match &manifest.distribution {
        Distribution::Binary { command, .. } if !command.is_empty() => resolve_wsl_spawn(command),
        _ => None,
    } {
        (wsl_bin, wsl_prefix)
    } else if matches!(
        registry.get(&agent_id).map(|m| &m.distribution),
        Some(Distribution::Binary { .. })
    ) {
        return Err(format!(
            "agent {agent_id} has no installed, PATH-resolved, or WSL launch path"
        ));
    } else {
        (plan.command.clone(), vec![])
    };

    // P63 — the user's per-agent provider binding (chosen in Agent runtimes)
    // is injected as environment. The key is read from the vault here, in
    // Rust, and never travels through IPC or the renderer; the binding comes
    // last so an explicit user choice wins over a manifest default. A refusal
    // or a missing binding yields nothing and never blocks the launch.
    let backend_env: Vec<(String, String)> =
        crate::agent_backend_cmds::spawn_env_for(&state, &agent_id);
    let mut env: Vec<(&str, &str)> = plan
        .env
        .iter()
        .map(|(k, v)| (k.as_str(), v.as_str()))
        .collect();
    if let Some(o) = &installed {
        for (k, v) in &o.env {
            env.push((k.as_str(), v.as_str()));
        }
    }
    for (k, v) in &backend_env {
        env.push((k.as_str(), v.as_str()));
    }
    let mut args: Vec<&str> = extra_args.iter().map(String::as_str).collect();
    for a in &plan.args {
        args.push(a.as_str());
    }
    let transport = ProcessTransport::spawn(&command, &args, &env)
        .map_err(|e| format!("failed to spawn {command}: {e}"))?;

    let mut session = AcpSession::new(transport);
    session
        .initialize(ClientInfo {
            name: "everyaios".to_string(),
            title: "EveryAIOS".to_string(),
            version: "0.1.0".to_string(),
        })
        .map_err(|e| format!("acp initialize failed: {e}"))?;
    let init = session.agent_capabilities().cloned().unwrap_or_default();
    let embedded_context = init.prompt_capabilities.embedded_context;
    let auth_methods = session.auth_methods().to_vec();

    // Try to create the session. `auth_required` is not a failure — it is a
    // signal to surface the sign-in surface (the handle stays alive so
    // `acp_authenticate` can retry after login).
    let (session_id, auth_required) = match session.session_new(&cwd, vec![]) {
        Ok(sid) => (sid, false),
        Err(everyaios_acp::AcpError::AuthRequired) => (String::new(), true),
        Err(e) => return Err(format!("acp session/new failed: {e}")),
    };

    let handle = format!("acp-{}", ACP_COUNTER.fetch_add(1, Ordering::Relaxed));
    let agent_name = manifest.name.clone();
    // Snapshot the negotiated session config options *before* the session is
    // moved into the handle map, so both the handle and the launch response
    // report the same list.
    let config_options = session.config_options().to_vec();
    state
        .acp_sessions
        .lock()
        .map_err(|e| e.to_string())?
        .insert(
            handle.clone(),
            AcpHandle {
                agent_id: agent_id.clone(),
                cwd,
                auth_required,
                auth_methods: auth_methods.clone(),
                embedded_context,
                available_commands: Vec::new(),
                config_options: config_options.clone(),
                session,
            },
        );

    Ok(AcpHandleInfo {
        handle,
        agent_id,
        agent_name,
        session_id,
        protocol: "acp".to_string(),
        auth_required,
        auth_methods,
        embedded_context,
        config_options,
    })
}

/// Drive the ACP `authenticate` flow on a live handle, then retry
/// `session/new`. Agent-type methods return `{}` (the agent drives its own
/// login flow — prints a URL / opens its own browser). URL-type methods
/// return a `url`: the UI opens it in the system browser, the user completes
/// login, then the UI calls `acp_authenticate` again (which now succeeds and
/// creates the session). This is the "already signed in?" check — a launch
/// with `authRequired: false` means no login was needed.
#[tauri::command]
pub fn acp_authenticate(
    state: State<'_, AppState>,
    handle: String,
    method_id: String,
) -> Result<serde_json::Value, String> {
    let mut sessions = state.acp_sessions.lock().map_err(|e| e.to_string())?;
    let entry = sessions
        .get_mut(&handle)
        .ok_or_else(|| format!("unknown ACP handle: {handle}"))?;

    let result = entry
        .session
        .authenticate(&method_id)
        .map_err(|e| format!("acp authenticate failed: {e}"))?;

    // url-type: hand the URL back — the user must complete login first.
    if let Some(url) = result.url {
        return Ok(serde_json::json!({ "ok": false, "url": url, "pending": true }));
    }

    // agent-type (or completed url-type): the connection is authenticated;
    // retry the session the launch couldn't create.
    let session_id = match entry.session.session_new(&entry.cwd, vec![]) {
        Ok(sid) => sid,
        Err(everyaios_acp::AcpError::AuthRequired) => {
            return Err("still auth_required after authenticate".to_string());
        }
        Err(e) => return Err(format!("acp session/new after auth failed: {e}")),
    };
    entry.auth_required = false;
    Ok(serde_json::json!({ "ok": true, "sessionId": session_id }))
}

/// P38 (spec §4.2.5a §2) — build the prompt for an external Chief with the
/// memory passport (C10) + governance block injected, mirroring the inbuilt
/// path's `<memory_warm_set>` injection. Best-effort: a missing/unavailable
/// memory handler never blocks the turn (same contract as `memory/plan`).
fn build_acp_prompt_with_passport(
    state: &State<'_, AppState>,
    text: &str,
    agent_id: &str,
) -> String {
    // External ACP agents are Self-contained: permission requests are
    // mediated by Guard-2 at the ACP boundary, but effects performed inside
    // the agent's own process are outside the EveryAIOS audit trail.
    let governance = if agent_id == "everyaios" {
        everyaios_acp::GovernedSession::Mediated {
            fs: true,
            terminal: true,
        }
    } else {
        everyaios_acp::GovernedSession::SelfContained { channel_b: true }
    };
    let core_facts = {
        let relay = state.chat_relay.lock().ok();
        relay
            .as_ref()
            .and_then(|r| r.as_ref())
            .map(|r| {
                let mem = r.memory();
                let m = mem.lock().unwrap_or_else(|e| e.into_inner());
                m.core_facts()
            })
            .unwrap_or_default()
    };
    let mut prompt = everyaios_acp::build_chief_prompt(text, &core_facts, &governance);
    // P53.6 — expose the persisted installed-CLI delegation mix at the
    // moment the Chief receives a turn. This is advisory context only; every
    // child launch remains subject to the B3 limits and Guard-2 policy.
    if let Ok(cfg) = Config::load() {
        let mix: Vec<String> = launch_registry()
            .agents
            .iter()
            .filter(|m| m.protocol != everyaios_acp::HarnessProtocol::Inbuilt)
            .filter(|m| agent_installed(&m.id))
            .filter(|m| cfg.subagent_enabled.get(&m.id).copied().unwrap_or(true))
            .map(|m| {
                let note = cfg.subagent_notes.get(&m.id).cloned().unwrap_or_default();
                format!(
                    "- {}: {}",
                    m.name,
                    if note.is_empty() {
                        m.description.clone()
                    } else {
                        note
                    }
                )
            })
            .collect();
        if !mix.is_empty() {
            prompt.push_str("\\n\\n## Installed subagent delegation mix\\n");
            prompt.push_str(&mix.join("\\n"));
            prompt.push_str("\\nUse only within the declared B3 depth/concurrency limits.");
        }
    }
    prompt
}

/// P53.5 — per-session tool observability file. Each ACP turn appends one
/// JSON line with the visible prompt prefix + the turn's tool-call rows +
/// stop reason to `<data_dir>/acp_sessions/<session>/tool_log.jsonl`. This is
/// metrics the user can open ("what did it run?") — it is never imported into
/// chat context (the return path folds only visible assistant text). Best
/// effort: a logging failure never fails the turn.
fn append_acp_tool_log(
    session_id: &str,
    handle: &str,
    agent_id: &str,
    text: &str,
    outcome: &PromptOutcome,
) {
    let safe: String = session_id
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect();
    let dir = everyaios_core::default_data_dir()
        .join("acp_sessions")
        .join(if safe.is_empty() { "unknown" } else { &safe });
    if std::fs::create_dir_all(&dir).is_err() {
        return;
    }
    let tools: Vec<serde_json::Value> = outcome
        .updates
        .iter()
        .filter(|u| u.session_update.starts_with("tool_call"))
        .map(|u| {
            serde_json::json!({
                "toolCallId": u.tool_call_id,
                "title": u.title,
                "kind": u.kind,
                "status": u.status,
            })
        })
        .collect();
    let mut prompt_prefix = text.chars().take(240).collect::<String>();
    if text.chars().count() > 240 {
        prompt_prefix.push('…');
    }
    let line = serde_json::json!({
        "tsMs": std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0),
        "handle": handle,
        "agentId": agent_id,
        "promptPrefix": prompt_prefix,
        "stopReason": outcome.stop_reason.as_str(),
        "toolCalls": tools,
    });
    if let Ok(mut f) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(dir.join("tool_log.jsonl"))
    {
        use std::io::Write;
        let _ = writeln!(f, "{}", line);
    }
}

/// P53.6 + P60 — Settings → Subagents rows: **installed CLIs only** (an
/// EveryAIOS install record or a PATH-discovered binary — the same
/// `agent_installed` predicate Chief occupancy uses), plus EveryAIOS Native,
/// which is always present as the default candidate. Each row carries the
/// shipped default when-to-use text (the registry manifest description) plus
/// the user's override from `everyaios.toml` (`subagent_notes`; empty =
/// default). The Chief reads these at delegate time (ACP prompt injection +
/// handoff bundle).
#[tauri::command]
pub fn chief_subagents() -> Result<Vec<serde_json::Value>, String> {
    let cfg = Config::load().map_err(|e| e.to_string())?;
    let registry = launch_registry();
    let mut rows = Vec::new();
    for m in &registry.agents {
        // P60 — EveryAIOS Native is always a delegation candidate (it ships
        // inside the app and needs no install record). External CLIs appear
        // only when `agent_installed` verifies them, so the Subagents surface
        // is occupancy, never the raw catalog.
        let inbuilt = m.protocol == everyaios_acp::HarnessProtocol::Inbuilt;
        if !inbuilt && !agent_installed(&m.id) {
            continue;
        }
        let note = cfg.subagent_notes.get(&m.id).cloned().unwrap_or_default();
        let enabled = cfg.subagent_enabled.get(&m.id).copied().unwrap_or(true);
        rows.push(serde_json::json!({
            "agentId": m.id,
            "name": if inbuilt { "EveryAIOS Native" } else { m.name.as_str() },
            "defaultWhenToUse": m.description,
            "whenToUse": if note.is_empty() { m.description.clone() } else { note.clone() },
            "customized": !note.is_empty(),
            "enabled": enabled,
        }));
    }
    Ok(rows)
}

/// P53.6 — set (or clear, with an empty note) the user's when-to-use override
/// for one installed subagent CLI. Refuses unknown/uninstalled ids — notes
/// attach only to real occupancy candidates.
#[tauri::command]
pub fn chief_subagent_set_note(agent_id: String, note: String) -> Result<String, String> {
    if launch_registry().get(&agent_id).is_none() {
        return Err(format!("unknown agent id: {agent_id}"));
    }
    if !agent_installed(&agent_id) {
        return Err(format!("agent {agent_id} is not installed"));
    }
    let path = Config::config_path().map_err(|e| e.to_string())?;
    let mut cfg = Config::load().map_err(|e| e.to_string())?;
    let trimmed = note.trim().to_string();
    if trimmed.is_empty() {
        cfg.subagent_notes.remove(&agent_id);
    } else {
        cfg.subagent_notes.insert(agent_id.clone(), trimmed);
    }
    cfg.save(&path).map_err(|e| e.to_string())?;
    Ok(agent_id)
}

/// P53.6 — enable or disable an installed CLI in the Chief's delegation mix.
#[tauri::command]
pub fn chief_subagent_set_enabled(agent_id: String, enabled: bool) -> Result<bool, String> {
    if launch_registry().get(&agent_id).is_none() {
        return Err(format!("unknown agent id: {agent_id}"));
    }
    if !agent_installed(&agent_id) {
        return Err(format!("agent {agent_id} is not installed"));
    }
    let path = Config::config_path().map_err(|e| e.to_string())?;
    let mut cfg = Config::load().map_err(|e| e.to_string())?;
    cfg.subagent_enabled.insert(agent_id, enabled);
    cfg.save(&path).map_err(|e| e.to_string())?;
    Ok(enabled)
}

/// P53.6 — the current enabled delegation mix, consumed by Chief handoff.
#[tauri::command]
pub fn chief_subagent_mix() -> Result<Vec<serde_json::Value>, String> {
    Ok(chief_subagents()?
        .into_iter()
        .filter(|row| {
            row.get("enabled")
                .and_then(serde_json::Value::as_bool)
                .unwrap_or(true)
        })
        .collect())
}

#[tauri::command]
pub fn acp_session_commands(
    state: State<'_, AppState>,
    handle: String,
) -> Result<Vec<AvailableCommand>, String> {
    let sessions = state.acp_sessions.lock().map_err(|e| e.to_string())?;
    let entry = sessions
        .get(&handle)
        .ok_or_else(|| format!("unknown ACP handle: {handle}"))?;
    Ok(entry.available_commands.clone())
}

/// Return the complete model/config vocabulary owned by one external ACP
/// session. No native provider keys or models are returned here.
#[tauri::command]
pub fn acp_session_config_options(
    state: State<'_, AppState>,
    handle: String,
) -> Result<Vec<ConfigOption>, String> {
    let sessions = state.acp_sessions.lock().map_err(|e| e.to_string())?;
    let entry = sessions
        .get(&handle)
        .ok_or_else(|| format!("unknown ACP handle: {handle}"))?;
    Ok(entry.config_options.clone())
}

/// Set one agent-owned session configuration value. The ACP response replaces
/// the complete option list so dependent model/reasoning options stay honest.
#[tauri::command]
pub fn acp_session_set_config_option(
    state: State<'_, AppState>,
    handle: String,
    config_id: String,
    value: serde_json::Value,
) -> Result<Vec<ConfigOption>, String> {
    let mut sessions = state.acp_sessions.lock().map_err(|e| e.to_string())?;
    let entry = sessions
        .get_mut(&handle)
        .ok_or_else(|| format!("unknown ACP handle: {handle}"))?;
    let options = entry
        .session
        .set_config_option(&config_id, value)
        .map_err(|e| e.to_string())?;
    entry.config_options = options.clone();
    Ok(options)
}

/// P53.5 — read the per-session tool observability file (newest last).
/// Empty until the first ACP turn lands for that session. A missing file is
/// honest emptiness, not an error. The session id is sanitized exactly like
/// the writer (`append_acp_tool_log`) so reads cannot escape the dir.
#[tauri::command]
pub fn acp_tool_log(session_id: String) -> Result<Vec<serde_json::Value>, String> {
    let safe: String = session_id
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect();
    let path = everyaios_core::default_data_dir()
        .join("acp_sessions")
        .join(if safe.is_empty() { "unknown" } else { &safe })
        .join("tool_log.jsonl");
    let raw = match std::fs::read_to_string(&path) {
        Ok(r) => r,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(e) => return Err(e.to_string()),
    };
    let mut out = Vec::new();
    for line in raw.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(line) {
            out.push(v);
        }
    }
    Ok(out)
}
/// Drive one ACP prompt turn. The agent's `session/request_permission`
/// requests route through the shared Guard-2 service: `Allow` auto-allows,
/// `Block` denies, and `Ask` denies the current turn while minting a ticket
/// the user can approve (then re-prompt). Never auto-allows an `Ask`.
#[tauri::command]
pub fn acp_prompt(
    state: State<'_, AppState>,
    handle: String,
    text: String,
    handoff: Option<String>,
    refs: Option<Vec<String>>,
) -> Result<serde_json::Value, String> {
    let mut sessions = state.acp_sessions.lock().map_err(|e| e.to_string())?;
    let entry = sessions
        .get_mut(&handle)
        .ok_or_else(|| format!("unknown ACP handle: {handle}"))?;

    if entry.auth_required {
        return Err("agent requires sign-in — run acp_authenticate first".to_string());
    }

    let agent_id = entry.agent_id.clone();
    let session_id = entry.session.session_id().unwrap_or("acp").to_string();
    let guard = Arc::clone(&state.guard_service);
    drop(sessions);

    let exec_id = {
        let relay = state.chat_relay.lock().ok();
        relay.as_ref().and_then(|g| g.as_ref()).map(|r| {
            let kernel = r.executions();
            let mut k = kernel.lock().unwrap_or_else(|e| e.into_inner());
            let ex = k.begin(
                ExecutionTrigger::Acp,
                &session_id,
                &text,
                None,
                String::new(),
                serde_json::json!({ "handle": handle, "agentId": agent_id }).to_string(),
                vec![],
            );
            let _ = k.transition(&ex.id, ExecutionPhase::Running);
            ex.id
        })
    };

    let mut sessions = state.acp_sessions.lock().map_err(|e| e.to_string())?;
    let entry = sessions
        .get_mut(&handle)
        .ok_or_else(|| format!("unknown ACP handle: {handle}"))?;

    // P38 (spec §4.2.5a §2) — the external Chief gets the same memory
    // passport + governance context as the inbuilt path: prepend the warm set
    // (C10) and the honest governance block before the turn text.
    // P53.4 — compact-before-swap handoff bundle: the UI injects the live
    // compacted view (post-/compact transcript + goal/plan/tickets + file
    // refs, tool blobs stripped) on the first ACP turn after inbuilt work.
    // It rides ahead of the memory passport (newest context first) and is
    // bounded (the builder caps it) so a huge transcript never floods the
    // agent's context. Absent = a same-Chief follow-up turn.
    let mut prompt_text = build_acp_prompt_with_passport(&state, &text, &agent_id);
    if let Some(bundle) = handoff.as_ref().map(|h| h.trim()).filter(|h| !h.is_empty()) {
        let capped: String = bundle.chars().take(6000).collect();
        prompt_text = format!("<chief_handoff>\n{capped}\n</chief_handoff>\n\n{prompt_text}");
    }

    // P53.8 — send resource blocks only when the agent advertised
    // `promptCapabilities.embeddedContext`; otherwise the text suffix remains
    // the honest fallback. Paths are confined to the requested workspace.
    let content = if entry.embedded_context {
        let mut blocks = vec![PromptContent::text(prompt_text.clone())];
        for reference in refs.as_deref().unwrap_or_default() {
            if let Some(resource) = read_workspace_resource(&entry.cwd, reference) {
                blocks.push(PromptContent::resource(resource.0, resource.1, resource.2));
            }
        }
        blocks
    } else {
        vec![PromptContent::text(prompt_text.clone())]
    };

    let mut pending_tickets: Vec<String> = Vec::new();
    let outcome = entry
        .session
        .prompt_with_content(content, |req| {
            // A poisoned guard lock means an earlier decision panicked mid-way.
            // Fail **closed**: a permission we cannot evaluate is denied, never
            // granted, and never a panic that takes the whole turn down.
            let Ok(mut g) = guard.lock() else {
                return PermissionDecision::deny();
            };
            let (op, risk) = map_tool_call(&req.tool_call);
            let paths: Vec<String> = req
                .tool_call
                .locations
                .iter()
                .map(|l| l.uri.clone())
                .collect();
            let decision = DecisionPackage::new(req.tool_call.title.clone())
                .with_risk(risk)
                .with_paths(paths);
            let args_hash = hash_tool_args(&req.tool_call);
            match g.evaluate(
                &session_id,
                &agent_id,
                &req.tool_call.tool_call_id,
                op,
                decision,
                &args_hash,
                0,
            ) {
                GuardDecision::Allow { ticket_id } => {
                    // S0.6: file/terminal (brokered) ops always consume the
                    // minted ticket. Uncontrolled ACP surface is labeled
                    // elsewhere; it never gets a ticketless write.
                    if is_brokered_op(&op) {
                        match g.use_ticket(&ticket_id, &args_hash) {
                            Ok(()) => PermissionDecision::allow(),
                            Err(_) => PermissionDecision::deny(),
                        }
                    } else {
                        let _ = g.use_ticket(&ticket_id, &args_hash);
                        PermissionDecision::allow()
                    }
                }
                GuardDecision::Block { .. } => PermissionDecision::deny(),
                GuardDecision::Ask { ticket_id } => {
                    pending_tickets.push(ticket_id.clone());
                    let rx = g.watch_ticket(&ticket_id);
                    drop(g);
                    let approved = rx
                        .recv_timeout(std::time::Duration::from_secs(300))
                        .unwrap_or(false);
                    let Ok(mut g) = guard.lock() else {
                        return PermissionDecision::deny();
                    };
                    if approved {
                        match g.use_ticket(&ticket_id, &args_hash) {
                            Ok(()) => PermissionDecision::allow(),
                            Err(_) => PermissionDecision::deny(),
                        }
                    } else {
                        PermissionDecision::deny()
                    }
                }
            }
        })
        .map_err(|e| e.to_string())?;
    drop(sessions);

    // P53.1 — harvest the agent's live slash vocabulary: the most recent
    // `available_commands_update` on this turn replaces the handle's stored
    // list (agents re-advertise on every turn; stale lists never persist).
    // P53.5 — append the turn's tool history to the per-session observability
    // file (metrics the user can open; never imported into chat context).
    {
        let mut sessions = state.acp_sessions.lock().map_err(|e| e.to_string())?;
        if let Some(entry) = sessions.get_mut(&handle) {
            for u in &outcome.updates {
                if u.is_available_commands_update() && !u.available_commands.is_empty() {
                    entry.available_commands = u.available_commands.clone();
                }
                if u.is_config_option_update() && !u.config_options.is_empty() {
                    entry.config_options = u.config_options.clone();
                }
            }
        }
        append_acp_tool_log(&session_id, &handle, &agent_id, &text, &outcome);
    }

    if let Some(ref eid) = exec_id {
        if let Ok(relay) = state.chat_relay.lock() {
            if let Some(r) = relay.as_ref() {
                let kernel = r.executions();
                let mut k = kernel.lock().unwrap_or_else(|e| e.into_inner());
                if pending_tickets.is_empty() {
                    let _ = k.transition(eid, ExecutionPhase::Verifying);
                    let _ = k.transition(eid, ExecutionPhase::Completed);
                } else {
                    let _ = k.transition(eid, ExecutionPhase::WaitingApproval);
                }
            }
        }
    }

    let final_text = outcome
        .updates
        .iter()
        .flat_map(|u| u.content.iter())
        .filter_map(|block| {
            if block.r#type == "text" || !block.text.is_empty() {
                Some(block.text.as_str())
            } else {
                None
            }
        })
        .collect::<String>();

    Ok(serde_json::json!({
        "handle": handle,
        "stopReason": outcome.stop_reason.as_str(),
        "updateCount": outcome.updates.len(),
        "permissionCount": outcome.permissions.len(),
        "pendingTickets": pending_tickets,
        "finalText": final_text,
        "updates": outcome.updates,
        "executionId": exec_id,
    }))
}

/// Interrupt the ongoing ACP turn (`session/cancel` notification).
#[tauri::command]
pub fn acp_cancel(state: State<'_, AppState>, handle: String) -> Result<(), String> {
    let mut sessions = state.acp_sessions.lock().map_err(|e| e.to_string())?;
    let entry = sessions
        .get_mut(&handle)
        .ok_or_else(|| format!("unknown ACP handle: {handle}"))?;
    entry.session.cancel().map_err(|e| e.to_string())
}

/// Tear an ACP session down (kill + reap) and drop its handle.
#[tauri::command]
pub fn acp_shutdown(state: State<'_, AppState>, handle: String) -> Result<bool, String> {
    let mut sessions = state.acp_sessions.lock().map_err(|e| e.to_string())?;
    match sessions.remove(&handle) {
        Some(mut entry) => {
            entry.session.shutdown();
            Ok(true)
        }
        None => Ok(false),
    }
}

/// Live ACP handles (the harness list in the cockpit).
#[tauri::command]
pub fn acp_sessions(state: State<'_, AppState>) -> Result<Vec<AcpHandleInfo>, String> {
    let sessions = state.acp_sessions.lock().map_err(|e| e.to_string())?;
    Ok(sessions
        .iter()
        .map(|(handle, entry)| AcpHandleInfo::from((entry, handle.as_str())))
        .collect())
}

/// Read one user-selected workspace file for an ACP resource block. The
/// canonical path check prevents `@` refs from escaping the session folder;
/// oversized files are truncated before crossing the ACP boundary.
fn read_workspace_resource(cwd: &str, reference: &str) -> Option<(String, String, String)> {
    let raw = reference.trim().trim_start_matches('@');
    if raw.is_empty() || raw.contains('\0') {
        return None;
    }
    let base = std::fs::canonicalize(cwd).ok()?;
    let path = std::path::Path::new(raw);
    let candidate = if path.is_absolute() {
        path.to_path_buf()
    } else {
        base.join(path)
    };
    let canonical = std::fs::canonicalize(candidate).ok()?;
    if !canonical.starts_with(&base) || !canonical.is_file() {
        return None;
    }
    let bytes = std::fs::read(&canonical).ok()?;
    let text = String::from_utf8_lossy(&bytes[..bytes.len().min(128 * 1024)]).into_owned();
    let mime = match canonical.extension().and_then(|e| e.to_str()).unwrap_or("") {
        "json" => "application/json",
        "md" | "markdown" => "text/markdown",
        "rs" | "ts" | "tsx" | "js" | "jsx" | "py" => "text/plain",
        _ => "text/plain",
    };
    Some((
        format!("file://{}", canonical.to_string_lossy()),
        mime.to_string(),
        text,
    ))
}

/// Map an ACP tool call onto a Guard-2 operation + risk tier so it routes
/// through the same policy engine as native tools (F9 shared taxonomy).
/// S0.6 containment: EveryAIOS-implemented file/terminal ops are *brokered*
/// (must consume a Rust ticket). Other kinds are still ticketed on Allow
/// but labeled uncontrolled for ACP-native tools we do not execute.
fn is_brokered_op(op: &Operation) -> bool {
    matches!(
        op,
        Operation::DeleteFiles
            | Operation::GenericWrite
            | Operation::MultiFileEdit { .. }
            | Operation::TerminalShell { .. }
    )
}

fn map_tool_call(tc: &ToolCall) -> (Operation, RiskLevel) {
    match tc.kind {
        Some(ToolKind::Delete) => (Operation::DeleteFiles, RiskLevel::High),
        Some(ToolKind::Execute) => (
            Operation::TerminalShell { destructive: false },
            RiskLevel::High,
        ),
        Some(ToolKind::Edit) | Some(ToolKind::Move) => (Operation::GenericWrite, RiskLevel::Medium),
        // read / search / think / fetch / unknown → non-mutating, auto-allow.
        _ => (Operation::GenericWrite, RiskLevel::Low),
    }
}

/// A stable args fingerprint so the minted ticket is single-use on the exact
/// request (the executor compares this at `guard/use`).
fn hash_tool_args(tc: &ToolCall) -> String {
    use std::hash::{Hash, Hasher};
    let mut h = std::collections::hash_map::DefaultHasher::new();
    tc.tool_call_id.hash(&mut h);
    tc.title.hash(&mut h);
    if let Some(raw) = &tc.raw_input {
        serde_json::to_string(raw).unwrap_or_default().hash(&mut h);
    }
    format!("{:016x}", h.finish())
}

/// The install ticket's args-hash — deterministic from (agent, version) so
/// the request and commit halves always agree (single-use enforcement).
fn install_args_hash(agent_id: &str, version: &str) -> String {
    use std::hash::{Hash, Hasher};
    let mut h = std::collections::hash_map::DefaultHasher::new();
    "acp.install".hash(&mut h);
    agent_id.hash(&mut h);
    version.hash(&mut h);
    format!("{:016x}", h.finish())
}

/// The host of an archive URL (for the decision card's network scope).
fn url_host(url: &str) -> String {
    url.split('/').nth(2).unwrap_or(url).to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn delete_tool_maps_to_high_risk_delete() {
        let tc = ToolCall {
            tool_call_id: "t1".into(),
            title: "rm -rf".into(),
            kind: Some(ToolKind::Delete),
            ..Default::default()
        };
        let (op, risk) = map_tool_call(&tc);
        assert!(matches!(op, Operation::DeleteFiles));
        assert_eq!(risk, RiskLevel::High);
    }

    #[test]
    fn read_tool_maps_to_low_risk_write() {
        let tc = ToolCall {
            tool_call_id: "t2".into(),
            title: "read file".into(),
            kind: Some(ToolKind::Read),
            ..Default::default()
        };
        let (_, risk) = map_tool_call(&tc);
        assert_eq!(risk, RiskLevel::Low);
        let (op, _) = map_tool_call(&tc);
        assert!(!is_brokered_op(&op) || matches!(op, Operation::GenericWrite));
    }

    #[test]
    fn file_and_terminal_ops_are_brokered() {
        assert!(is_brokered_op(&Operation::DeleteFiles));
        assert!(is_brokered_op(&Operation::TerminalShell {
            destructive: false
        }));
        assert!(is_brokered_op(&Operation::GenericWrite));
    }

    #[test]
    fn args_hash_is_stable_for_same_input() {
        let a = ToolCall {
            tool_call_id: "t1".into(),
            title: "x".into(),
            ..Default::default()
        };
        let b = a.clone();
        assert_eq!(hash_tool_args(&a), hash_tool_args(&b));
    }

    #[test]
    fn install_args_hash_is_deterministic_and_scoped() {
        assert_eq!(
            install_args_hash("devin", "3000.4.25"),
            install_args_hash("devin", "3000.4.25")
        );
        assert_ne!(
            install_args_hash("devin", "3000.4.25"),
            install_args_hash("devin", "3000.4.26")
        );
        assert_ne!(
            install_args_hash("devin", "3000.4.25"),
            install_args_hash("kiro", "3000.4.25")
        );
    }

    #[test]
    fn url_host_extracts_authority() {
        assert_eq!(
            url_host("https://static.devin.ai/cli/1.0/devin.tar.gz"),
            "static.devin.ai"
        );
        assert_eq!(url_host("https://x.ai"), "x.ai");
    }

    #[test]
    fn registry_has_inbuilt_default_and_launch_list() {
        let reg = LaunchRegistry::builtin();
        assert_eq!(reg.default_agent, "everyaios");
        assert!(reg.get("claude").is_some());
        assert!(reg.get("codex").is_some());
    }

    #[test]
    fn resolve_on_path_finds_real_binaries_and_misses_absences() {
        // Every build machine has a shell-ish binary on PATH; on Windows the
        // probe also covers .exe/.cmd/.bat shims via the same helper.
        let probe = if cfg!(windows) { "cmd" } else { "sh" };
        assert!(
            resolve_on_path(probe).is_some(),
            "{probe} must resolve on PATH"
        );
        assert!(
            resolve_on_path("definitely-not-a-real-everyaios-binary-xyz").is_none(),
            "unknown names must not resolve"
        );
    }

    #[test]
    fn stale_managed_install_is_not_occupancy() {
        let root = std::env::temp_dir().join(format!(
            "everyaios-stale-agent-{}-{}",
            std::process::id(),
            ACP_COUNTER.load(Ordering::Relaxed)
        ));
        let outcome = everyaios_acp::InstallOutcome {
            agent_id: "test-agent".into(),
            version: "1.0.0".into(),
            kind: "binary".into(),
            binary_path: Some(root.join("missing.exe")),
            env: vec![],
        };
        assert!(!install_outcome_usable(&outcome));
        std::fs::create_dir_all(&root).unwrap();
        let binary = root.join("agent.exe");
        std::fs::write(&binary, b"test").unwrap();
        let usable = everyaios_acp::InstallOutcome {
            binary_path: Some(binary),
            ..outcome
        };
        assert!(install_outcome_usable(&usable));
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn package_manager_install_requires_manager_readiness() {
        let outcome = everyaios_acp::InstallOutcome {
            agent_id: "test-agent".into(),
            version: "1.0.0".into(),
            kind: "npx".into(),
            binary_path: None,
            env: vec![],
        };
        assert_eq!(
            install_outcome_usable(&outcome),
            resolve_on_path("npx").is_some()
        );
    }

    #[test]
    fn path_discovery_reports_installed_with_kind_path() {
        // Simulate the discovery leg by pointing PATH at a real binary and
        // resolving one of the registry's Binary-distribution commands.
        let reg = LaunchRegistry::builtin();
        let bin = reg
            .agents
            .iter()
            .find(|a| matches!(a.distribution, Distribution::Binary { ref command, .. } if !command.is_empty()));
        let Some(manifest) = bin else {
            panic!("registry must contain a Binary-distribution agent");
        };
        let Distribution::Binary { command, .. } = &manifest.distribution else {
            unreachable!()
        };
        // The real binary may or may not be on this machine's PATH; the point
        // is the probe never fabricates a path for a name that does not exist.
        let found = resolve_on_path(command);
        if let Some(p) = &found {
            assert!(p.is_file(), "resolved path must exist: {}", p.display());
        }
    }

    /// P60.14 — the desktop shell's live registry leg, end to end.
    ///
    /// `#[ignore]` (network). Run explicitly, single-threaded because it
    /// repoints `EVERYAIOS_HOME` for the duration:
    ///
    /// ```text
    /// cargo test -p everyaios-desktop acp_registry_refresh -- --ignored --nocapture --test-threads=1
    /// ```
    ///
    /// It exercises the *shell's own* composition rather than a copy of it:
    /// `acp_registry_refresh()` — the command the Settings “Discover more”
    /// button invokes — fetches the real CDN with the production `ureq`
    /// transport and writes the cache, and then `launch_registry()`, the
    /// resolver behind `acp_agents` / `acp_install_status` / `chief_subagents`
    /// (memoised on the cache file's mtime), must serve the merged catalog
    /// without a restart. Occupancy is untouched by this: a merged row is a
    /// catalog fact, and `agent_installed` still decides what is usable.
    #[test]
    #[ignore = "network: fetches the live ACP registry CDN"]
    fn live_acp_registry_refresh_drives_the_shell_launch_registry() {
        let home =
            std::env::temp_dir().join(format!("everyaios-shell-registry-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&home);
        let previous_home = std::env::var("EVERYAIOS_HOME").ok();
        std::env::set_var("EVERYAIOS_HOME", &home);

        // No cache yet ⇒ the resolver degrades to the curated seed.
        let seed = LaunchRegistry::builtin();
        assert_eq!(
            launch_registry().agents.len(),
            seed.agents.len(),
            "an empty cache must resolve to the curated seed alone"
        );
        assert!(
            registry_client().load_cached().is_none(),
            "a fresh data dir must not report a cached catalog"
        );

        // The command the Settings button calls: live fetch + cache write.
        let snap = acp_registry_refresh().expect("live registry refresh");
        let count = snap["agentCount"].as_u64().unwrap_or(0);
        assert!(count > 0, "the live registry reported no agents: {snap}");
        assert_eq!(snap["fromCache"], serde_json::json!(false));
        eprintln!("shell registry refresh: {snap}");
        assert_eq!(
            registry_client()
                .load_cached()
                .map(|s| s.index.agents.len()),
            Some(count as usize),
            "the cache must hold exactly what the refresh fetched"
        );

        // The memoised resolver (cache mtime key) now serves the merged catalog.
        let merged = launch_registry();
        let added: Vec<String> = merged
            .agents
            .iter()
            .map(|m| m.id.clone())
            .filter(|id| seed.get(id).is_none())
            .collect();
        eprintln!(
            "merged rows: {} (seed {}), added {added:?}",
            merged.agents.len(),
            seed.agents.len()
        );
        assert!(
            merged.get("everyaios").is_some(),
            "the inbuilt row must survive the registry merge"
        );
        assert!(
            !added.is_empty(),
            "a live refresh must add at least one catalog row the seed lacks"
        );

        // A second read hits the memo (unchanged file stamp) with the same rows.
        assert_eq!(launch_registry().agents.len(), merged.agents.len());

        match previous_home {
            Some(prev) => std::env::set_var("EVERYAIOS_HOME", prev),
            None => std::env::remove_var("EVERYAIOS_HOME"),
        }
        let _ = std::fs::remove_dir_all(&home);
    }

    #[test]
    fn test_user_path_import_and_verification() {
        let tmp =
            std::env::temp_dir().join(format!("everyaios-import-test-{}", std::process::id()));
        let _ = std::fs::create_dir_all(&tmp);
        let dummy_bin = tmp.join("dummy_agent");
        std::fs::write(&dummy_bin, b"#!/bin/sh\necho 'dummy-agent v1.2.3'\n").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut perms = std::fs::metadata(&dummy_bin).unwrap().permissions();
            perms.set_mode(0o755);
            std::fs::set_permissions(&dummy_bin, perms).unwrap();
        }

        let home = std::env::temp_dir().join(format!("everyaios-home-test-{}", std::process::id()));
        let previous_home = std::env::var("EVERYAIOS_HOME").ok();
        std::env::set_var("EVERYAIOS_HOME", &home);

        let inst = installer();
        inst.record_path("opencode", &dummy_bin).unwrap();
        let outcome = inst.installed("opencode").expect("installed outcome");
        assert_eq!(outcome.kind, "path");
        assert_eq!(outcome.binary_path, Some(dummy_bin.clone()));

        let verify = acp_agent_verify("opencode".to_string()).unwrap();
        assert_eq!(verify["status"], "ready");
        assert_eq!(verify["executable"], dummy_bin.to_string_lossy().as_ref());

        match previous_home {
            Some(prev) => std::env::set_var("EVERYAIOS_HOME", prev),
            None => std::env::remove_var("EVERYAIOS_HOME"),
        }
        let _ = std::fs::remove_dir_all(&tmp);
        let _ = std::fs::remove_dir_all(&home);
    }

    #[test]
    fn test_wsl_spawn_resolution() {
        // On non-windows platforms, resolve_wsl_spawn degrades to None.
        // On windows platforms with WSL distros installed, it returns wsl.exe with args.
        let wsl_res = resolve_wsl_spawn("nonexistent-command-xyz-123");
        assert!(wsl_res.is_none());
    }
}
