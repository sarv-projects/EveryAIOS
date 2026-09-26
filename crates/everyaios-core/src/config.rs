//! Config loading for `everyaios.toml` (P0.6 defines the full schema; P0.1 is the
//! minimal skeleton that boots: data dir, vault path, retention, browser).
//!
//! Precedence: `EVERYAIOS_HOME/everyaios.toml` (or `~/.everyaios/everyaios.toml`) — created with
//! defaults on first boot if missing.
//!
//! # Layering
//!
//! `ARCH/10-KERNEL.md` §4 fixes the layer order — defaults → user (global) →
//! workspace/project → agent profile → session → run override, later wins, each
//! layer's source recorded. [`ConfigLayer`] is that ladder in one place, so a
//! layer can be appended but never inserted mid-order.
//!
//! Only the **user** layer is a file this module reads ([`Config`]). The four
//! runtime layers describe facts only the host knows (which workspace, which
//! agent profile, which session, which run), so a caller supplies them; the
//! resolver folds the ladder in the fixed order and records which layer set
//! each field. Generalizing this to every entry is `TASK-KERNEL-003` (W1); the
//! order, the per-field source record and the refusal rules are declared here so
//! that row extends them instead of replacing them.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use crate::default_data_dir;
use crate::local::LocalConfig;

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
    /// Explicit UNIX socket path (J16); `None` = `<data_dir>/coordinator.sock`.
    #[serde(default)]
    pub socket_path: Option<PathBuf>,
    /// P1.8 (A5): local model runtimes (ollama / llamafile).
    #[serde(default)]
    pub local: LocalConfig,
    /// P11.5.9 — MODEL_ALIASES: short names → full `provider/model` paths
    /// (e.g. `claude = "anthropic/claude-sonnet-4"`). The coordinator resolves
    /// these before the router so users type short names everywhere.
    #[serde(default)]
    pub model_aliases: std::collections::HashMap<String, String>,
    /// P38 (v3.45) — the session's top brain: `inbuilt` | any installed
    /// registry agent id (P53.3 — occupancy is the installed set, never a
    /// hardcoded trio). Read at session start; resolution = explicit session
    /// value → this default → none (P71.5b: the retired \u201cChief\u201d name; there
    /// is no built-in fallback per ADR-0005). Unknown/uninstalled ids fail
    /// closed.
    #[serde(default = "default_primary_chief")]
    pub primary_chief: String,
    /// P53.6 — user-edited when-to-use notes per installed subagent CLI
    /// (agent id → note). Shown in Settings → Subagents next to the shipped
    /// default; exposed to the Chief at delegate time. Empty = use default.
    #[serde(default)]
    pub subagent_notes: std::collections::HashMap<String, String>,
    /// P53.6 — installed subagent CLIs enabled for delegation.
    /// Missing entries default to enabled for backwards-compatible config.
    #[serde(default)]
    pub subagent_enabled: std::collections::HashMap<String, bool>,
    /// P71.9d — per-agent delegation profile (P53.6 extended). Keyed by agent
    /// id; missing fields fall back to the spec defaults (B3: depth ≤2,
    /// concurrency ≤6). The gateway's `delegation_gauge` stays the authority
    /// for live admission; this is the user-editable policy surface.
    #[serde(default)]
    pub subagent_policy: std::collections::HashMap<String, SubagentPolicy>,
    /// H36 (P54) — integrated terminal profile registry (`terminal.*`):
    /// profiles / defaultProfile / automationProfile / useWslProfiles /
    /// unsafeConfirmed. One owner for detection + PTY backends.
    #[serde(default)]
    pub terminal: crate::terminal::TerminalConfig,
    /// `TASK-TRUST-011` — the `[controlPlaneRateLimit]` table, kept raw so a
    /// malformed or unknown key becomes a *typed* refusal with a migration note
    /// at [`Config::rate_limit`], rather than a serde message or, worse, a
    /// silently dropped key (`ARCH/10-KERNEL.md` §4, EDGE-110). Absent on a
    /// shipped config, which is not a parse error: the entry's own defaults
    /// apply and the source is recorded as `Defaults`.
    ///
    /// Declared last on purpose: a TOML table may only follow scalars, and
    /// `save` writes the fields in declaration order. The wire name is
    /// camelCase because the entry's field names are (`callerCommandBurst`),
    /// while `Config`'s own older keys stay snake_case.
    #[serde(default, rename = "controlPlaneRateLimit")]
    pub control_plane_rate_limit: Option<toml::Table>,
}

/// P71.9d — one agent's delegation profile (Settings → Subagents). Every
/// field is optional: an absent field means "spec default" (`B3`), never a
/// silent zero.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct SubagentPolicy {
    /// Model policy: the agent's own default, inherited from the primary
    /// agent, or an explicit model id.
    pub model_policy: String,
    /// Delegation role label the primary agent sees at delegate time.
    pub role: String,
    /// Whether this agent may itself spawn children (grandchildren).
    pub may_spawn: bool,
    /// Agent ids this agent may be given as children (empty = unrestricted).
    pub allowed_children: Vec<String>,
    /// Max live children (spec default 6).
    pub max_children: u32,
    /// Max chain depth this agent's children may reach (spec default 2).
    pub max_depth: u32,
    /// Max concurrent children (spec default 6).
    pub max_concurrency: u32,
    /// Workspace exposure: shared with the primary agent or isolated.
    pub workspace: String,
    /// Token budget for the agent's subtree (0 = unbounded at the chain cap).
    pub budget: u64,
    /// P63.12 — this agent may occupy the primary slot.
    #[serde(default = "default_true")]
    pub allow_as_primary: bool,
    /// P63.12 — this agent may be hired through `delegate.spawn`.
    #[serde(default = "default_true")]
    pub enable_as_subagent: bool,
    /// Domain tags used when the primary agent does not name a worker.
    #[serde(default)]
    pub domains: Vec<String>,
    /// Per-turn dollar ceiling in cents. 0 means the chain cap, not a free pass
    /// past Guard.
    #[serde(default)]
    pub max_cents_per_turn: u32,
    /// Per-turn token ceiling. 0 means unset.
    #[serde(default)]
    pub max_tokens_per_turn: u64,
}

fn default_true() -> bool {
    true
}

impl Default for SubagentPolicy {
    fn default() -> Self {
        Self {
            model_policy: "agent-default".to_string(),
            role: String::new(),
            may_spawn: false,
            allowed_children: Vec::new(),
            max_children: 6,
            max_depth: 2,
            max_concurrency: 6,
            workspace: "shared".to_string(),
            budget: 0,
            allow_as_primary: true,
            enable_as_subagent: true,
            domains: Vec::new(),
            max_cents_per_turn: 0,
            max_tokens_per_turn: 0,
        }
    }
}

fn default_primary_chief() -> String {
    "inbuilt".to_string()
}

impl Default for Config {
    fn default() -> Self {
        let data_dir = default_data_dir();
        Self {
            vault_path: data_dir.join("vault.db"),
            retention_days: 7,
            data_dir,
            browser_binary: None,
            socket_path: None,
            local: LocalConfig::default(),
            model_aliases: std::collections::HashMap::new(),
            primary_chief: default_primary_chief(),
            subagent_notes: std::collections::HashMap::new(),
            subagent_enabled: std::collections::HashMap::new(),
            subagent_policy: std::collections::HashMap::new(),
            terminal: crate::terminal::TerminalConfig::default(),
            control_plane_rate_limit: None,
        }
    }
}

impl Config {
    /// P11.5.9 — resolve a model reference that may be a short alias.
    /// Returns `(provider, model)`; an unknown alias resolves to
    /// `(default_provider, ref)` (bare model name). Mirrors the coordinator's
    /// `resolveModelAlias`.
    pub fn resolve_model_alias(&self, reference: &str, default_provider: &str) -> (String, String) {
        if let Some(full) = self.model_aliases.get(reference) {
            match full.split_once('/') {
                Some((p, m)) => return (p.to_string(), m.to_string()),
                None => return (full.clone(), full.clone()),
            }
        }
        if let Some((p, m)) = reference.split_once('/') {
            return (p.to_string(), m.to_string());
        }
        (default_provider.to_string(), reference.to_string())
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

    /// The resolved UNIX socket path (J16): explicit config, else the default
    /// `<data_dir>/coordinator.sock`.
    pub fn resolved_socket_path(&self) -> PathBuf {
        self.socket_path
            .clone()
            .unwrap_or_else(|| self.data_dir.join("coordinator.sock"))
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
    /// A config entry carried a value this build cannot accept. Typed, and it
    /// always carries a migration note: the layer that set it fails closed and
    /// the previous layer's value stands (`ARCH/10-KERNEL.md` §9, EDGE-110).
    #[error("config entry `{entry}` is invalid: {reason} (migration: {migration})")]
    InvalidEntry {
        /// The entry's registered name.
        entry: &'static str,
        /// What is wrong with the value, in the caller's own terms.
        reason: String,
        /// What to do about it.
        migration: &'static str,
    },
    /// A config entry carried a key this build does not define. Never silently
    /// accepted (`ARCH/10-KERNEL.md` §4: "unknown keys produce warnings +
    /// migration notes, never silent acceptance").
    #[error("config entry `{entry}` carries an unknown key `{key}` (migration: {migration})")]
    UnknownKey {
        /// The entry's registered name.
        entry: &'static str,
        /// The key as it was written.
        key: String,
        /// What to do about it.
        migration: &'static str,
    },
}

impl ConfigError {
    /// The migration note attached to a refusal, when this error carries one.
    /// A config refusal is never reported without a next step.
    pub fn migration(&self) -> Option<&'static str> {
        match self {
            Self::InvalidEntry { migration, .. } | Self::UnknownKey { migration, .. } => {
                Some(migration)
            }
            _ => None,
        }
    }
}

// ===========================================================================
// Configuration layering (`ARCH/10-KERNEL.md` §4)
// ===========================================================================

/// The configuration layers, in the fixed order the kernel fixes: later wins.
///
/// The order is data, not a convention — [`ConfigLayer::ORDER`] is the single
/// list a resolver walks, so a layer can be appended (a new, narrower override)
/// but never inserted mid-ladder, which is how a "narrower wins" rule silently
/// inverts.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConfigLayer {
    /// The shipped defaults of the entry itself.
    Defaults,
    /// The global/user config file (`everyaios.toml`).
    User,
    /// The active workspace or project.
    Workspace,
    /// The bound agent's profile.
    AgentProfile,
    /// The active session.
    Session,
    /// One run's explicit override.
    Run,
}

impl ConfigLayer {
    /// The ladder, strictest-precedence-last. Index 0 is the widest scope.
    pub const ORDER: [ConfigLayer; 6] = [
        ConfigLayer::Defaults,
        ConfigLayer::User,
        ConfigLayer::Workspace,
        ConfigLayer::AgentProfile,
        ConfigLayer::Session,
        ConfigLayer::Run,
    ];

    /// Stable token for a resolution record, a warning and an audit row.
    pub const fn as_str(self) -> &'static str {
        match self {
            ConfigLayer::Defaults => "defaults",
            ConfigLayer::User => "user",
            ConfigLayer::Workspace => "workspace",
            ConfigLayer::AgentProfile => "agent_profile",
            ConfigLayer::Session => "session",
            ConfigLayer::Run => "run",
        }
    }
}

impl std::fmt::Display for ConfigLayer {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

/// A problem with one layer of one entry, surfaced rather than swallowed.
///
/// `ARCH/10-KERNEL.md` §9: a bad layer fails closed *for that layer only* and
/// falls back to the previous one with a warning. The resolution carries these
/// so the caller can surface them and write the audit row; the kernel does not
/// have a channel to the audit trail from a pure config read.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ConfigWarning {
    /// Which layer was refused.
    pub layer: ConfigLayer,
    /// Which entry it was setting.
    pub entry: &'static str,
    /// What was wrong.
    pub reason: String,
    /// What to do about it. Never absent.
    pub migration: &'static str,
}

// ===========================================================================
// `controlPlaneRateLimit` — `TASK-TRUST-011` / `REQ-TRUST-009` / `REQ-KERNEL-004`
// ===========================================================================

/// The registered name of the one entry that owns the control-plane limiter's
/// numbers, as it appears in `everyaios.toml`.
pub const CONTROL_PLANE_RATE_LIMIT_ENTRY: &str = "controlPlaneRateLimit";

/// The note attached to every refusal of this entry. It states what did not
/// change (the shipped numbers) and what a refusal means, so a user who typed
/// something this build cannot read is not left guessing.
pub const RATE_LIMIT_MIGRATION: &str = "the control-plane rate limit is a product knob, not a spec constant: the shipped values are \
     120 burst / 20 per second per caller-and-command key and 600 / 100 global. A refused layer is \
     ignored (the previous layer's value stands) and never partially applied — correct the key \
     spelling or the value's type against the entry's documented fields, or remove the \
     [controlPlaneRateLimit] table to return to the shipped defaults.";

/// The entry's own field names, in the order they are validated. The single
/// list: the unknown-key check and the per-field source record both read it, so
/// a field cannot be added without being accepted and recorded.
pub const RATE_LIMIT_FIELDS: [&str; 6] = [
    "globalBurst",
    "globalPerSecond",
    "callerCommandBurst",
    "callerCommandPerSecond",
    "ttlMs",
    "maxEntries",
];

/// The resolved numbers of [`CONTROL_PLANE_RATE_LIMIT_ENTRY`].
///
/// **Numbers only.** There is no string, path or opaque field in this type, so
/// there is nowhere for a credential to be written: the entry is not a
/// credential path and can never become one (`ARCH/10-KERNEL.md` §4, INV-02 —
/// secrets appear only as vault references). A rate limit is not secret and
/// nothing here needs to be.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct RateLimitSettings {
    /// Process-wide burst allowance, in calls.
    pub global_burst: u32,
    /// Process-wide steady rate, in calls per second.
    pub global_per_second: f64,
    /// Per `(caller, command)` burst allowance, in calls.
    pub caller_command_burst: u32,
    /// Per `(caller, command)` steady rate, in calls per second.
    pub caller_command_per_second: f64,
    /// Idle-bucket TTL in milliseconds; `0` disables the age sweep.
    pub ttl_ms: u64,
    /// Hard cap on tracked buckets.
    pub max_entries: usize,
}

impl Default for RateLimitSettings {
    /// The shipped values, taken from the limiter's own default rather than
    /// retyped: [`everyaios_guard::RateLimitConfig::default`] already carries
    /// the sizing argument (120/20 per key, 600/100 global, 60 s TTL, 4096
    /// buckets), and a second literal set of the same numbers is exactly how two
    /// gates drift apart. The kernel's entry and the shell's gate therefore
    /// resolve the same shape by construction.
    fn default() -> Self {
        let shipped = everyaios_guard::RateLimitConfig::default();
        Self {
            global_burst: shipped.global.burst as u32,
            global_per_second: shipped.global.refill_per_sec,
            caller_command_burst: shipped.per_caller_command.burst as u32,
            caller_command_per_second: shipped.per_caller_command.refill_per_sec,
            ttl_ms: shipped.ttl_ms,
            max_entries: shipped.max_entries,
        }
    }
}

impl RateLimitSettings {
    /// The one shape both admission gates are given: the kernel tool gate and
    /// the shell's IPC gate take this value, so neither can be configured to a
    /// different limit from the other.
    pub fn rate_limit_config(&self) -> everyaios_guard::RateLimitConfig {
        everyaios_guard::RateLimitConfig {
            global: everyaios_guard::Limit::new(self.global_burst, self.global_per_second),
            per_caller_command: everyaios_guard::Limit::new(
                self.caller_command_burst,
                self.caller_command_per_second,
            ),
            ttl_ms: self.ttl_ms,
            max_entries: self.max_entries,
        }
    }

    /// One field of the entry, by its registered name.
    fn set_field(&mut self, name: &str, value: f64) {
        match name {
            "globalBurst" => self.global_burst = value as u32,
            "globalPerSecond" => self.global_per_second = value,
            "callerCommandBurst" => self.caller_command_burst = value as u32,
            "callerCommandPerSecond" => self.caller_command_per_second = value,
            "ttlMs" => self.ttl_ms = value as u64,
            "maxEntries" => self.max_entries = value as usize,
            _ => {}
        }
    }
}

/// What one layer states about the entry. Every field optional, so a layer
/// declares only what it changes and inherits the rest — an absent field is
/// "not my layer's business", never a silent zero.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default, deny_unknown_fields)]
pub struct RateLimitOverrides {
    /// Process-wide burst allowance, in calls.
    pub global_burst: Option<u32>,
    /// Process-wide steady rate, in calls per second.
    pub global_per_second: Option<f64>,
    /// Per `(caller, command)` burst allowance, in calls.
    pub caller_command_burst: Option<u32>,
    /// Per `(caller, command)` steady rate, in calls per second.
    pub caller_command_per_second: Option<f64>,
    /// Idle-bucket TTL in milliseconds.
    pub ttl_ms: Option<u64>,
    /// Hard cap on tracked buckets.
    pub max_entries: Option<usize>,
}

impl RateLimitOverrides {
    /// Is this layer saying nothing at all?
    pub fn is_empty(&self) -> bool {
        *self == Self::default()
    }

    /// The `(field, value)` pairs this layer states, in [`RATE_LIMIT_FIELDS`]
    /// order. Driven by that list, so the fields an override can set, the keys
    /// the parser accepts and the fields the source record names are one set.
    fn stated(&self) -> Vec<(&'static str, f64)> {
        RATE_LIMIT_FIELDS
            .iter()
            .filter_map(|name| self.value_of(name).map(|value| (*name, value)))
            .collect()
    }

    /// One field's value, as this layer states it (`None` = not this layer's
    /// business).
    fn value_of(&self, name: &str) -> Option<f64> {
        Some(match name {
            "globalBurst" => self.global_burst? as f64,
            "globalPerSecond" => self.global_per_second?,
            "callerCommandBurst" => self.caller_command_burst? as f64,
            "callerCommandPerSecond" => self.caller_command_per_second?,
            "ttlMs" => self.ttl_ms? as f64,
            "maxEntries" => self.max_entries? as f64,
            _ => return None,
        })
    }

    /// Parse one layer's table for the entry.
    ///
    /// Two refusals, both typed and both carrying [`RATE_LIMIT_MIGRATION`]:
    /// a key this build does not define, and a value it cannot accept. Neither
    /// is partially applied — the caller keeps the previous layer's value
    /// (`ARCH/10-KERNEL.md` §9).
    pub fn parse(table: &toml::Table) -> Result<Self, ConfigError> {
        for key in table.keys() {
            if !RATE_LIMIT_FIELDS.contains(&key.as_str()) {
                return Err(ConfigError::UnknownKey {
                    entry: CONTROL_PLANE_RATE_LIMIT_ENTRY,
                    key: key.clone(),
                    migration: RATE_LIMIT_MIGRATION,
                });
            }
        }
        let raw: BTreeMap<String, toml::Value> =
            table.iter().map(|(k, v)| (k.clone(), v.clone())).collect();
        let text = toml::to_string(&raw).map_err(|e| ConfigError::InvalidEntry {
            entry: CONTROL_PLANE_RATE_LIMIT_ENTRY,
            reason: format!("the table is not a set of scalar values: {e}"),
            migration: RATE_LIMIT_MIGRATION,
        })?;
        let parsed: Self = toml::from_str(&text).map_err(|e| ConfigError::InvalidEntry {
            entry: CONTROL_PLANE_RATE_LIMIT_ENTRY,
            reason: e.to_string(),
            migration: RATE_LIMIT_MIGRATION,
        })?;
        parsed.validate()?;
        Ok(parsed)
    }

    /// The inverse of [`Self::parse`]: this layer's stated fields as a config
    /// table, so a caller that owns a layer can persist it and read it back
    /// through the same path. A layer that states nothing is an empty table, and
    /// an invalid one is refused exactly as a parsed one is.
    pub fn to_table(&self) -> Result<toml::Table, ConfigError> {
        self.validate()?;
        let mut table = toml::Table::new();
        for (field, value) in self.stated() {
            // The two rate fields are floats; everything else is a count, and
            // writing a count as a float would make the file read back as a
            // different type than it was written.
            let value = match field {
                "globalPerSecond" | "callerCommandPerSecond" => toml::Value::Float(value),
                _ => toml::Value::Integer(value as i64),
            };
            table.insert((*field).to_string(), value);
        }
        Ok(table)
    }

    /// Reject a value that parses but is not a limit: a non-finite or negative
    /// rate, or a zero burst, which would refuse every call rather than shape
    /// one. `ttl_ms == 0` and `max_entries == 0` are *not* refused — the
    /// limiter defines both as "no sweep" / "evict on sight", and refusing them
    /// here would reject a behavior the limiter already implements.
    fn validate(&self) -> Result<(), ConfigError> {
        let rate = |name: &str, value: Option<f64>| -> Result<(), ConfigError> {
            let Some(value) = value else { return Ok(()) };
            if !value.is_finite() || value < 0.0 {
                return Err(ConfigError::InvalidEntry {
                    entry: CONTROL_PLANE_RATE_LIMIT_ENTRY,
                    reason: format!("`{name}` must be a finite, non-negative number (got {value})"),
                    migration: RATE_LIMIT_MIGRATION,
                });
            }
            Ok(())
        };
        let burst = |name: &str, value: Option<u32>| -> Result<(), ConfigError> {
            let Some(value) = value else { return Ok(()) };
            if value == 0 {
                return Err(ConfigError::InvalidEntry {
                    entry: CONTROL_PLANE_RATE_LIMIT_ENTRY,
                    reason: format!(
                        "`{name}` must be at least 1 — a zero burst refuses every call, which is a \
                         lockout rather than a limit"
                    ),
                    migration: RATE_LIMIT_MIGRATION,
                });
            }
            Ok(())
        };
        burst("globalBurst", self.global_burst)?;
        burst("callerCommandBurst", self.caller_command_burst)?;
        rate("globalPerSecond", self.global_per_second)?;
        rate("callerCommandPerSecond", self.caller_command_per_second)
    }
}

/// One entry resolved across the layer ladder, with the source of every field.
///
/// This is what both admission gates read, so a caller can see *why* a number is
/// what it is — the shipped default, the user's file, or the narrowest override
/// — instead of inferring it from a number.
#[derive(Debug, Clone, PartialEq)]
pub struct ResolvedRateLimit {
    /// The folded value.
    pub settings: RateLimitSettings,
    /// Which layer set each field, by registered field name.
    pub sources: BTreeMap<&'static str, ConfigLayer>,
    /// Layers that were refused, with their migration note. Non-empty means a
    /// layer did not apply; the value is still a complete, usable limit.
    pub warnings: Vec<ConfigWarning>,
}

impl ResolvedRateLimit {
    /// The one shape both admission gates are given — see
    /// [`RateLimitSettings::rate_limit_config`].
    pub fn rate_limit_config(&self) -> everyaios_guard::RateLimitConfig {
        self.settings.rate_limit_config()
    }

    /// Which layer set `field`? `None` for a name the entry does not define.
    pub fn source_of(&self, field: &str) -> Option<ConfigLayer> {
        self.sources.get(field).copied()
    }
}

impl Config {
    /// The entry's shipped defaults, with no file and no layers involved.
    pub fn control_plane_rate_limit_defaults() -> RateLimitSettings {
        RateLimitSettings::default()
    }

    /// The `[controlPlaneRateLimit]` table as the **user** layer.
    ///
    /// `Ok(None)` when the config carries no table: the entry's defaults stand
    /// and the source is recorded as `Defaults`, which is a normal state, not a
    /// warning. `Err` is a malformed table or an unknown key, always with a
    /// migration note.
    pub fn rate_limit_layer(&self) -> Result<Option<RateLimitOverrides>, ConfigError> {
        match self.control_plane_rate_limit.as_ref() {
            None => Ok(None),
            Some(table) => RateLimitOverrides::parse(table).map(Some),
        }
    }

    /// Resolve [`CONTROL_PLANE_RATE_LIMIT_ENTRY`] across the fixed ladder.
    ///
    /// `runtime` carries the four layers only a host knows — workspace/project,
    /// agent profile, session and run override. The **user** layer comes from
    /// this config file and the **defaults** layer from the entry itself, so a
    /// caller cannot smuggle either past [`Config::rate_limit_layer`].
    ///
    /// A refused layer fails closed *for that layer alone*: its value is skipped
    /// whole, the previous layer's value stands, and a [`ConfigWarning`] is
    /// recorded. A layer is never partially applied — a table with one bad key
    /// contributes nothing.
    pub fn resolve_rate_limit(
        &self,
        runtime: &BTreeMap<ConfigLayer, RateLimitOverrides>,
    ) -> ResolvedRateLimit {
        let mut settings = Self::control_plane_rate_limit_defaults();
        let mut sources: BTreeMap<&'static str, ConfigLayer> = RATE_LIMIT_FIELDS
            .iter()
            .map(|field| (*field, ConfigLayer::Defaults))
            .collect();
        let mut warnings = Vec::new();
        for layer in ConfigLayer::ORDER {
            if layer == ConfigLayer::Defaults {
                continue;
            }
            let stated = match layer {
                ConfigLayer::User => match self.rate_limit_layer() {
                    Ok(None) => continue,
                    Ok(Some(overrides)) => overrides,
                    Err(err) => {
                        warnings.push(warning(layer, &err));
                        continue;
                    }
                },
                _ => match runtime.get(&layer) {
                    None => continue,
                    Some(overrides) => overrides.clone(),
                },
            };
            if let Err(err) = stated.validate() {
                // The host supplied the layer, so the same typed refusal
                // applies: skip the layer, keep the previous value, say so.
                warnings.push(warning(layer, &err));
                continue;
            }
            for (field, value) in stated.stated() {
                settings.set_field(field, value);
                sources.insert(field, layer);
            }
        }
        ResolvedRateLimit {
            settings,
            sources,
            warnings,
        }
    }
}

/// The [`ConfigWarning`] a refused layer produces. The note is required: a
/// config refusal is never reported without a next step, and
/// [`ConfigError::migration`] is the note when the refusal came from one.
fn warning(layer: ConfigLayer, err: &ConfigError) -> ConfigWarning {
    ConfigWarning {
        layer,
        entry: CONTROL_PLANE_RATE_LIMIT_ENTRY,
        reason: err.to_string(),
        migration: err.migration().unwrap_or(RATE_LIMIT_MIGRATION),
    }
}

/// The shipped control-plane rate limit, as the one shape the admission gates
/// take. The kernel tool gate's default limiter is built from this, and it is
/// equal to `everyaios_guard::RateLimitConfig::default()` — which is what the
/// shell's IPC gate builds — by construction rather than by coincidence.
pub fn default_rate_limit_config() -> everyaios_guard::RateLimitConfig {
    RateLimitSettings::default().rate_limit_config()
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
        // J16: default unix socket lives inside the data dir (zero port
        // collisions — no TCP port is ever used for local IPC).
        assert_eq!(
            cfg.resolved_socket_path(),
            cfg.data_dir.join("coordinator.sock")
        );
        assert!(cfg.socket_path.is_none());
    }

    #[test]
    fn terminal_section_parses_from_full_config_document() {
        // P54.1 — the terminal profile registry is a real `[terminal.*]`
        // section of everyaios.toml, not a separate file.
        let toml_text = r#"
data_dir = "/tmp/everyaios"
vault_path = "/tmp/everyaios/vault.db"
retention_days = 7

[terminal.profiles.linux]
"bash (custom)" = { path = "/opt/bash", args = ["--login"] }

[terminal.defaultProfile]
linux = "bash (custom)"

[terminal.automationProfile]
linux = "sh"
"#;
        let cfg: Config = toml::from_str(toml_text).unwrap();
        let profiles = cfg
            .terminal
            .profiles_for(crate::terminal::Platform::Linux)
            .expect("linux profiles present");
        assert_eq!(profiles["bash (custom)"].path[0].path, "/opt/bash");
        assert_eq!(
            cfg.terminal
                .default_profile_name_for(crate::terminal::Platform::Linux),
            Some("bash (custom)")
        );
        assert_eq!(
            cfg.terminal
                .automation_profile_name_for(crate::terminal::Platform::Linux),
            Some("sh")
        );
        // WSL profiles default on (VS Code `useWslProfiles`).
        assert!(cfg.terminal.use_wsl_profiles);
        // Absent terminal section on old configs → defaults, not a parse error.
        let bare: Config = toml::from_str(
            r#"
data_dir = "/tmp/everyaios"
vault_path = "/tmp/everyaios/vault.db"
retention_days = 7
"#,
        )
        .unwrap();
        assert_eq!(bare.terminal, Config::default().terminal);
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
        // On reload, relative paths get normalized against the config file's
        // parent dir (which may differ from the original default_data_dir()).
        // Just verify the vault_path still ends with "vault.db".
        assert!(
            again.vault_path.ends_with("vault.db"),
            "expected vault.db suffix, got: {:?}",
            again.vault_path
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    // =========================================================================
    // `TASK-TRUST-011` — the `controlPlaneRateLimit` entry
    // =========================================================================

    /// A config document with the required scalars plus a rate-limit table.
    fn with_rate_limit_table(table: &str) -> Config {
        let text = format!(
            "data_dir = \"/tmp/everyaios\"\nvault_path = \"/tmp/everyaios/vault.db\"\nretention_days = 7\n\n{table}"
        );
        toml::from_str(&text).expect("the config document must parse")
    }

    fn overrides(pairs: &[(&str, f64)]) -> RateLimitOverrides {
        let mut out = RateLimitOverrides::default();
        for (field, value) in pairs {
            match *field {
                "globalBurst" => out.global_burst = Some(*value as u32),
                "globalPerSecond" => out.global_per_second = Some(*value),
                "callerCommandBurst" => out.caller_command_burst = Some(*value as u32),
                "callerCommandPerSecond" => out.caller_command_per_second = Some(*value),
                "ttlMs" => out.ttl_ms = Some(*value as u64),
                "maxEntries" => out.max_entries = Some(*value as usize),
                other => panic!("unknown field {other}"),
            }
        }
        out
    }

    /// The entry parses out of the real config document, and its values are the
    /// resolved ones.
    #[test]
    fn the_rate_limit_entry_parses_and_resolves() {
        let cfg = with_rate_limit_table(
            r#"
[controlPlaneRateLimit]
callerCommandBurst = 200
callerCommandPerSecond = 40.0
ttlMs = 30000
"#,
        );
        let layer = cfg
            .rate_limit_layer()
            .expect("a well-formed table parses")
            .expect("the table is present");
        assert_eq!(layer.caller_command_burst, Some(200));
        assert_eq!(layer.caller_command_per_second, Some(40.0));
        assert_eq!(layer.ttl_ms, Some(30_000));
        // A layer states only what it changes; the rest is inherited.
        assert_eq!(layer.global_burst, None);

        let resolved = cfg.resolve_rate_limit(&BTreeMap::new());
        assert_eq!(resolved.settings.caller_command_burst, 200);
        assert_eq!(resolved.settings.caller_command_per_second, 40.0);
        assert_eq!(resolved.settings.ttl_ms, 30_000);
        // …and the untouched fields keep the shipped numbers.
        assert_eq!(resolved.settings.global_burst, 600);
        assert_eq!(resolved.settings.global_per_second, 100.0);
        assert_eq!(resolved.warnings, Vec::new());
    }

    /// Absent the table, the shipped numbers stand and the source is recorded as
    /// `Defaults` — a normal state, not a warning.
    #[test]
    fn the_entry_defaults_to_the_shipped_numbers() {
        let cfg = Config::default();
        assert!(
            cfg.rate_limit_layer()
                .expect("no table is not an error")
                .is_none()
        );
        let resolved = cfg.resolve_rate_limit(&BTreeMap::new());
        assert_eq!(resolved.settings.caller_command_burst, 120);
        assert_eq!(resolved.settings.caller_command_per_second, 20.0);
        assert_eq!(resolved.settings.global_burst, 600);
        assert_eq!(resolved.settings.global_per_second, 100.0);
        assert_eq!(resolved.settings.ttl_ms, 60_000);
        assert_eq!(resolved.settings.max_entries, 4096);
        assert!(resolved.warnings.is_empty(), "{:?}", resolved.warnings);
        for field in RATE_LIMIT_FIELDS {
            assert_eq!(
                resolved.source_of(field),
                Some(ConfigLayer::Defaults),
                "{field}"
            );
        }
    }

    /// The ladder is the documented one, and later layers win per field with
    /// their source recorded — including a layer that overrides only *some*
    /// fields, which must not clear the others.
    #[test]
    fn layers_override_in_the_fixed_order_with_the_source_recorded() {
        assert_eq!(
            ConfigLayer::ORDER,
            [
                ConfigLayer::Defaults,
                ConfigLayer::User,
                ConfigLayer::Workspace,
                ConfigLayer::AgentProfile,
                ConfigLayer::Session,
                ConfigLayer::Run,
            ]
        );
        let cfg = with_rate_limit_table(
            r#"
[controlPlaneRateLimit]
globalBurst = 700
ttlMs = 45000
"#,
        );
        let runtime: BTreeMap<ConfigLayer, RateLimitOverrides> = [
            (
                ConfigLayer::Workspace,
                overrides(&[("callerCommandBurst", 150.0), ("globalBurst", 800.0)]),
            ),
            (
                ConfigLayer::AgentProfile,
                overrides(&[("callerCommandBurst", 160.0)]),
            ),
            (
                ConfigLayer::Session,
                overrides(&[("callerCommandBurst", 170.0), ("ttlMs", 20_000.0)]),
            ),
            (
                ConfigLayer::Run,
                overrides(&[("callerCommandBurst", 180.0)]),
            ),
        ]
        .into_iter()
        .collect();
        let resolved = cfg.resolve_rate_limit(&runtime);
        // The narrowest layer wins the field it names …
        assert_eq!(resolved.settings.caller_command_burst, 180);
        assert_eq!(
            resolved.source_of("callerCommandBurst"),
            Some(ConfigLayer::Run)
        );
        // … the session wins the field the run did not name …
        assert_eq!(resolved.settings.ttl_ms, 20_000);
        assert_eq!(resolved.source_of("ttlMs"), Some(ConfigLayer::Session));
        // … and a field nobody above the defaults touched is still the default.
        assert_eq!(resolved.settings.caller_command_per_second, 20.0);
        assert_eq!(
            resolved.source_of("callerCommandPerSecond"),
            Some(ConfigLayer::Defaults)
        );
        // The workspace is narrower than the user file, so it wins `globalBurst`.
        assert_eq!(resolved.settings.global_burst, 800);
        assert_eq!(
            resolved.source_of("globalBurst"),
            Some(ConfigLayer::Workspace)
        );
        assert!(resolved.warnings.is_empty(), "{:?}", resolved.warnings);
    }

    /// A malformed value is a typed refusal carrying a migration note — and the
    /// layer alone fails closed, so the rest of the config still loads and the
    /// previous layer's value stands.
    #[test]
    fn a_malformed_value_is_refused_with_a_typed_error_and_a_migration_note() {
        // Wrong type for the field.
        let cfg = with_rate_limit_table(
            r#"
[controlPlaneRateLimit]
callerCommandBurst = "lots"
"#,
        );
        let err = cfg
            .rate_limit_layer()
            .expect_err("a string where a number belongs is refused");
        assert!(
            matches!(err, ConfigError::InvalidEntry { entry, .. } if entry == CONTROL_PLANE_RATE_LIMIT_ENTRY),
            "{err:?}"
        );
        assert_eq!(err.migration(), Some(RATE_LIMIT_MIGRATION));
        assert!(err.to_string().contains("migration:"), "{err}");
        // The layer fell back to the previous one, with a surfaced warning; the
        // rest of the document is untouched, because only this layer failed.
        let resolved = cfg.resolve_rate_limit(&BTreeMap::new());
        assert_eq!(resolved.settings.caller_command_burst, 120);
        assert_eq!(resolved.warnings.len(), 1);
        assert_eq!(resolved.warnings[0].layer, ConfigLayer::User);
        assert_eq!(resolved.warnings[0].entry, CONTROL_PLANE_RATE_LIMIT_ENTRY);
        assert_eq!(resolved.warnings[0].migration, RATE_LIMIT_MIGRATION);
        assert_eq!(
            cfg.retention_days, 7,
            "the rest of the config still applies"
        );

        // A value that parses but is not a limit. `nan` / `inf` are valid TOML
        // floats, so they reach the entry rather than the document parser.
        for table in [
            "[controlPlaneRateLimit]\nglobalPerSecond = -1.0\n",
            "[controlPlaneRateLimit]\ncallerCommandPerSecond = nan\n",
            "[controlPlaneRateLimit]\nglobalPerSecond = inf\n",
            "[controlPlaneRateLimit]\nglobalBurst = 0\n",
            "[controlPlaneRateLimit]\ncallerCommandBurst = 0\n",
        ] {
            let cfg = with_rate_limit_table(table);
            let err = cfg
                .rate_limit_layer()
                .expect_err(&format!("{table} must be refused"));
            assert!(
                matches!(err, ConfigError::InvalidEntry { .. }),
                "{table} → {err:?}"
            );
            assert_eq!(err.migration(), Some(RATE_LIMIT_MIGRATION));
        }

        // `ttlMs = 0` and `maxEntries = 0` are *not* refused: the limiter
        // defines both, so rejecting them would refuse a supported behavior.
        let cfg = with_rate_limit_table("[controlPlaneRateLimit]\nttlMs = 0\nmaxEntries = 0\n");
        let layer = cfg.rate_limit_layer().expect("zero ttl/cap are supported");
        assert_eq!(layer.expect("table present").ttl_ms, Some(0));
    }

    /// An unknown key is refused with its own typed error and a migration note —
    /// never silently accepted (`ARCH/10-KERNEL.md` §4).
    #[test]
    fn an_unknown_key_is_refused_with_a_migration_note() {
        let cfg = with_rate_limit_table(
            r#"
[controlPlaneRateLimit]
callerCommandBurst = 150
globalBurstAllowance = 700
"#,
        );
        let err = cfg
            .rate_limit_layer()
            .expect_err("an unknown key is not silently dropped");
        match &err {
            ConfigError::UnknownKey { entry, key, .. } => {
                assert_eq!(*entry, CONTROL_PLANE_RATE_LIMIT_ENTRY);
                assert_eq!(key, "globalBurstAllowance");
            }
            other => panic!("expected an unknown-key refusal, got {other:?}"),
        }
        assert_eq!(err.migration(), Some(RATE_LIMIT_MIGRATION));
        // The layer is skipped whole — the good key beside the bad one does not
        // partially apply.
        let resolved = cfg.resolve_rate_limit(&BTreeMap::new());
        assert_eq!(resolved.settings.caller_command_burst, 120);
        assert_eq!(resolved.warnings.len(), 1);
    }

    /// The kernel entry and the shell's IPC gate are built from one shape: the
    /// entry's defaults *are* `RateLimitConfig::default()`, so a caller cannot
    /// read one number and enforce another.
    #[test]
    fn the_kernel_entry_and_the_shell_gate_default_are_one_shape() {
        assert_eq!(
            default_rate_limit_config(),
            everyaios_guard::RateLimitConfig::default()
        );
        // …and the shipped numbers are the ones the register names.
        let shipped = default_rate_limit_config();
        assert_eq!(shipped.per_caller_command.burst, 120.0);
        assert_eq!(shipped.per_caller_command.refill_per_sec, 20.0);
        assert_eq!(shipped.global.burst, 600.0);
        assert_eq!(shipped.global.refill_per_sec, 100.0);
        // The entry is numbers only: there is nowhere for a credential to be
        // written, so it is not a credential path (INV-02).
        assert!(
            RATE_LIMIT_FIELDS
                .iter()
                .all(|field| !matches!(*field, "apiKey" | "token" | "secret" | "password"))
        );
    }

    /// A resolution round-trips through a config file: save, reload, resolve.
    #[test]
    fn the_entry_survives_a_save_reload_round_trip() {
        let dir = std::env::temp_dir().join(format!(
            "everyaios-ratelint-config-{}-{}",
            std::process::id(),
            line!()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("everyaios.toml");

        let cfg = Config {
            control_plane_rate_limit: Some(
                RateLimitOverrides {
                    caller_command_burst: Some(90),
                    ..RateLimitOverrides::default()
                }
                .to_table()
                .expect("a typed override round-trips into a table"),
            ),
            ..Config::default()
        };
        cfg.save(&path).expect("save must write the entry");
        let reloaded = Config::load_from(&path).expect("the saved file must load");
        let resolved = reloaded.resolve_rate_limit(&BTreeMap::new());
        assert_eq!(resolved.settings.caller_command_burst, 90);
        assert_eq!(
            resolved.source_of("callerCommandBurst"),
            Some(ConfigLayer::User)
        );
        let _ = std::fs::remove_dir_all(&dir);
    }
}
