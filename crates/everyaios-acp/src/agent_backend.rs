//! P63 — **per-agent model-backend configuration** (the "configure the
//! agent's own provider from the cockpit" matrix).
//!
//! Every external agent accepts its model configuration on one of a small
//! number of channels. This module names them and owns the *pure* decision of
//! which environment variables a spawn should carry — the filesystem, the
//! vault read, and the audit event belong to the caller (the Tauri layer).
//!
//! # Why env and not the agent's config file
//!
//! Injecting env at spawn is strictly safer than writing the agent's config:
//! nothing touches disk, the override lasts exactly one child process, and it
//! is reversible by simply not injecting. Two consequences follow:
//!
//! - Agents whose provider *routing* lives in a config file
//!   ([`BackendChannel::ConfigFileOnly`] — Codex's `[model_providers]`, Cline's
//!   `providers.json`) cannot be configured by env alone. Those are the
//!   protected-path write case (spec §6 #21 / TODO P47.7) and this module
//!   refuses rather than pretending.
//! - [`BackendChannel::FixedEnv`] agents (Claude Code's `ANTHROPIC_*`) take a
//!   *fixed* set of names no matter which provider is behind them — that is the
//!   cc-switch "point Claude Code at my endpoint" case, and it works without
//!   ever editing `~/.claude/settings.json`.
//!
//! # What is deliberately absent
//!
//! No secret ever appears in a type this module returns to a caller that could
//! serialize it: [`plan_env`] takes the secret as an input and returns the env
//! pairs the *spawn* consumes. The Tauri layer never sends the pairs, or the
//! secret, back over IPC — only a boolean "key present" and the list of var
//! *names* that will be injected (for the UI's honesty line).
//!
//! # Provenance of the provider-side names
//!
//! The provider half of the mapping is **not** invented here: it comes from
//! the vendored models.dev directory (`everyaios-catalog`), whose whole
//! premise is that agent CLIs read these env vars. Callers pass the resolved
//! names in via [`ProviderBinding`], so this crate keeps no catalog
//! dependency and stays unit-testable.

use serde::{Deserialize, Serialize};

/// How an external agent accepts its model configuration.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BackendChannel {
    /// Reads the **provider's own** env vars (`ANTHROPIC_API_KEY`,
    /// `OPENAI_API_KEY`, …) — the models.dev naming. Agents built on the AI
    /// SDK / LiteLLM convention land here.
    ProviderEnv,
    /// Reads a **fixed** set of env names regardless of which provider sits
    /// behind them (Claude Code's `ANTHROPIC_*` triple).
    FixedEnv,
    /// Configured **only** through its own config file; env injection is not
    /// honored. Writing it is the protected-path case (P47.7, post-v1).
    ConfigFileOnly,
    /// Brings its own subscription login. There is nothing for us to
    /// configure, and we must never touch its credentials
    /// (`ARCH/06` §6.x rule 4).
    Subscription,
    /// Not yet verified against the agent's own docs/behaviour. Reported as
    /// unknown rather than guessed — the UI must not offer a control we
    /// cannot honour.
    Unknown,
}

impl BackendChannel {
    pub fn as_str(&self) -> &'static str {
        match self {
            BackendChannel::ProviderEnv => "provider_env",
            BackendChannel::FixedEnv => "fixed_env",
            BackendChannel::ConfigFileOnly => "config_file",
            BackendChannel::Subscription => "subscription",
            BackendChannel::Unknown => "unknown",
        }
    }

    /// Can we point this agent at a provider by injecting env at spawn?
    pub fn is_env_injectable(&self) -> bool {
        matches!(self, BackendChannel::ProviderEnv | BackendChannel::FixedEnv)
    }
}

/// One agent's backend contract.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct AgentBackendSpec {
    /// Registry id (`claude`, `opencode`, …).
    pub agent_id: &'static str,
    pub channel: BackendChannel,
    /// `FixedEnv`: the env names to write, in order. First entry is the API-key
    /// var. Unused for other channels.
    pub api_key_env: &'static [&'static str],
    /// `FixedEnv`: the base-URL var. `None` when the agent has no override.
    pub base_url_env: Option<&'static str>,
    /// `FixedEnv`: the model var.
    pub model_env: Option<&'static str>,
    /// Informational: the file this agent reads (the Tier-3 target). Shown in
    /// the UI so the user knows where a persistent change *would* go.
    pub config_file: Option<&'static str>,
    /// One honest sentence for the UI.
    pub note: &'static str,
}

/// What the caller resolved for one `(agent, provider, model)` binding.
///
/// `secret` is the raw key, read from the vault **in Rust**. It is an input
/// only; nothing here returns it.
#[derive(Debug, Clone, Copy)]
pub struct ProviderBinding<'a> {
    /// Catalog provider id (`anthropic`, `openai`, `deepseek`, …).
    pub provider: &'a str,
    /// Model id, forwarded only when the agent has a model env var.
    pub model: &'a str,
    /// The provider's API-key env name from the catalog
    /// (`ProviderRecord::api_key_env[0]`).
    pub key_env: &'a str,
    /// The provider's base URL, if known.
    pub base_url: Option<&'a str>,
    /// The provider's own base-URL override env name
    /// (`ProviderRecord::base_url_env`), if it declares one.
    pub base_url_env: Option<&'a str>,
    /// The raw secret from the vault. `None` = "no key stored" (a keyless
    /// local runtime is a legitimate case).
    pub secret: Option<&'a str>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BackendError {
    /// The agent has no verified contract; we refuse to guess.
    UnknownAgent(String),
    /// A subscription agent — nothing to configure, and its credentials are
    /// out of bounds.
    Subscription(String),
    /// Configured only through its own file; env cannot express it.
    ConfigFileOnly { agent: String, file: String },
    /// An env name or value failed validation (never a silent bad spawn).
    InvalidEnv(String),
}

impl std::fmt::Display for BackendError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            BackendError::UnknownAgent(a) => write!(
                f,
                "{a} has no verified model-backend contract — refusing to guess"
            ),
            BackendError::Subscription(a) => write!(
                f,
                "{a} signs in with its own subscription; EveryAIOS does not configure its credentials"
            ),
            BackendError::ConfigFileOnly { agent, file } => write!(
                f,
                "{agent} routes providers through {file} — that write needs approval (not an env override)"
            ),
            BackendError::InvalidEnv(m) => write!(f, "invalid env override: {m}"),
        }
    }
}

impl std::error::Error for BackendError {}

/// An env-var name must be a POSIX-ish identifier. Values must be single-line
/// and NUL-free; a spawn env is not a place for smuggled newlines.
fn valid_env_name(name: &str) -> bool {
    !name.is_empty()
        && name
            .chars()
            .all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || c == '_')
}

fn valid_env_value(value: &str) -> bool {
    !value.is_empty() && !value.contains('\n') && !value.contains('\r') && !value.contains('\0')
}

/// Decide the env pairs a spawn should carry. Pure.
///
/// Returns `Err` (never a silent empty list) when the agent's channel cannot
/// express a provider binding, so the caller reports the honest reason.
pub fn plan_env(
    spec: &AgentBackendSpec,
    binding: &ProviderBinding<'_>,
) -> Result<Vec<(String, String)>, BackendError> {
    match spec.channel {
        BackendChannel::Unknown => {
            return Err(BackendError::UnknownAgent(spec.agent_id.to_string()))
        }
        BackendChannel::Subscription => {
            return Err(BackendError::Subscription(spec.agent_id.to_string()))
        }
        BackendChannel::ConfigFileOnly => {
            return Err(BackendError::ConfigFileOnly {
                agent: spec.agent_id.to_string(),
                file: spec.config_file.unwrap_or("<unknown>").to_string(),
            })
        }
        BackendChannel::ProviderEnv | BackendChannel::FixedEnv => {}
    }

    // Which names does this agent actually read?
    let (key_env, base_env, model_env): (Option<&str>, Option<&str>, Option<&str>) =
        match spec.channel {
            BackendChannel::FixedEnv => (
                spec.api_key_env.first().copied(),
                spec.base_url_env,
                spec.model_env,
            ),
            // ProviderEnv: the agent reads the provider's own names.
            _ => (
                Some(binding.key_env),
                binding.base_url_env,
                None, // provider-env agents pick their own model; we don't guess a var
            ),
        };

    let mut out: Vec<(String, String)> = Vec::new();

    if let Some(name) = key_env {
        if !valid_env_name(name) {
            return Err(BackendError::InvalidEnv(format!(
                "bad key var name {name:?}"
            )));
        }
        if let Some(secret) = binding.secret {
            if !valid_env_value(secret) {
                return Err(BackendError::InvalidEnv(format!(
                    "key for {} is not a single-line value",
                    binding.provider
                )));
            }
            out.push((name.to_string(), secret.to_string()));
        }
        // No secret: omit the var entirely rather than injecting an empty
        // string, which some CLIs treat as "configured but blank".
    }

    // Base URL: prefer the agent's fixed var; otherwise the provider's own
    // override var. Only when we actually have a URL to write.
    if let Some(url) = binding.base_url {
        if let Some(name) = base_env {
            if !valid_env_name(name) {
                return Err(BackendError::InvalidEnv(format!(
                    "bad base var name {name:?}"
                )));
            }
            if !valid_env_value(url) {
                return Err(BackendError::InvalidEnv("bad base URL value".into()));
            }
            out.push((name.to_string(), url.to_string()));
        }
    }

    if let Some(m) = model_env {
        if !binding.model.is_empty() {
            if !valid_env_name(m) {
                return Err(BackendError::InvalidEnv(format!(
                    "bad model var name {m:?}"
                )));
            }
            if !valid_env_value(binding.model) {
                return Err(BackendError::InvalidEnv("bad model value".into()));
            }
            out.push((m.to_string(), binding.model.to_string()));
        }
    }

    Ok(out)
}

/// The var names a binding would inject — safe to show in the UI (names only,
/// never values).
pub fn injected_names(spec: &AgentBackendSpec, binding: &ProviderBinding<'_>) -> Vec<String> {
    plan_env(spec, binding)
        .map(|pairs| pairs.into_iter().map(|(k, _)| k).collect())
        .unwrap_or_default()
}

/// Binding elements the agent has **no env var for**, so they cannot be
/// expressed by an override. Reported rather than silently dropped: a
/// `ProviderEnv` agent that declares no base-URL var still reaches its
/// provider (it knows the provider's default), but the user must not be left
/// believing a custom URL took effect.
pub fn unexpressed(spec: &AgentBackendSpec, binding: &ProviderBinding<'_>) -> Vec<&'static str> {
    let mut gaps = Vec::new();
    if !spec.channel.is_env_injectable() {
        return gaps;
    }
    let base_env = match spec.channel {
        BackendChannel::FixedEnv => spec.base_url_env,
        _ => binding.base_url_env,
    };
    if binding.base_url.is_some() && base_env.is_none() {
        gaps.push("base_url");
    }
    let model_env = match spec.channel {
        BackendChannel::FixedEnv => spec.model_env,
        _ => None,
    };
    if !binding.model.is_empty() && model_env.is_none() {
        gaps.push("model");
    }
    gaps
}

// ---------------------------------------------------------------------------
// The matrix.
// ---------------------------------------------------------------------------

const CLAUDE: AgentBackendSpec = AgentBackendSpec {
    agent_id: "claude",
    channel: BackendChannel::FixedEnv,
    api_key_env: &["ANTHROPIC_API_KEY"],
    base_url_env: Some("ANTHROPIC_BASE_URL"),
    model_env: Some("ANTHROPIC_MODEL"),
    config_file: Some("~/.claude/settings.json"),
    note: "Claude Code reads the ANTHROPIC_* env at launch — an API-key endpoint can be pointed at this spawn without editing settings.json. A subscription login is left untouched.",
};

const CODEX: AgentBackendSpec = AgentBackendSpec {
    agent_id: "codex",
    channel: BackendChannel::ConfigFileOnly,
    api_key_env: &[],
    base_url_env: None,
    model_env: None,
    config_file: Some("~/.codex/config.toml"),
    note: "Codex routes providers through ~/.codex/config.toml ([model_providers.<id>] + wire_api). Writing that file needs approval and is not an env override.",
};

const OPENCODE: AgentBackendSpec = AgentBackendSpec {
    agent_id: "opencode",
    channel: BackendChannel::ProviderEnv,
    api_key_env: &[],
    base_url_env: None,
    model_env: None,
    config_file: Some("~/.config/opencode/opencode.json"),
    note: "OpenCode reads the provider's own env vars; keys added with /connect live in ~/.local/share/opencode/auth.json.",
};

const CLINE: AgentBackendSpec = AgentBackendSpec {
    agent_id: "cline",
    channel: BackendChannel::ConfigFileOnly,
    api_key_env: &[],
    base_url_env: None,
    model_env: None,
    config_file: Some("~/.cline/data/settings/providers.json"),
    note: "Cline's CLI keeps provider config in ~/.cline/data/settings/providers.json. Writing it needs approval and is not an env override.",
};

const AIDER: AgentBackendSpec = AgentBackendSpec {
    agent_id: "aider",
    channel: BackendChannel::ProviderEnv,
    api_key_env: &[],
    base_url_env: None,
    model_env: None,
    config_file: Some("~/.aider.conf.yml"),
    note: "Aider routes through LiteLLM, which reads the provider's own env vars; a project .env is also honored.",
};

const GOOSE: AgentBackendSpec = AgentBackendSpec {
    agent_id: "goose",
    channel: BackendChannel::ProviderEnv,
    api_key_env: &[],
    base_url_env: None,
    model_env: None,
    config_file: Some("~/.config/goose/config.yaml"),
    note: "goose reads provider env vars; its own config.yaml selects the default provider.",
};

const HERMES: AgentBackendSpec = AgentBackendSpec {
    agent_id: "hermes",
    channel: BackendChannel::ProviderEnv,
    api_key_env: &[],
    base_url_env: None,
    model_env: None,
    config_file: None,
    note: "Hermes resolves standard provider env keys.",
};

const QWEN_CODE: AgentBackendSpec = AgentBackendSpec {
    agent_id: "qwen-code",
    channel: BackendChannel::ProviderEnv,
    api_key_env: &[],
    base_url_env: None,
    model_env: None,
    config_file: None,
    note: "Qwen Code follows the provider env convention.",
};

const KIMI: AgentBackendSpec = AgentBackendSpec {
    agent_id: "kimi",
    channel: BackendChannel::ProviderEnv,
    api_key_env: &[],
    base_url_env: None,
    model_env: None,
    config_file: None,
    note: "Kimi CLI follows the provider env convention.",
};

const KILO: AgentBackendSpec = AgentBackendSpec {
    agent_id: "kilo",
    channel: BackendChannel::ProviderEnv,
    api_key_env: &[],
    base_url_env: None,
    model_env: None,
    config_file: None,
    note: "Kilo Code follows the provider env convention.",
};

const OPENCLAW: AgentBackendSpec = AgentBackendSpec {
    agent_id: "openclaw",
    channel: BackendChannel::ProviderEnv,
    api_key_env: &[],
    base_url_env: None,
    model_env: None,
    config_file: None,
    note: "OpenClaw resolves provider env keys.",
};

const PI: AgentBackendSpec = AgentBackendSpec {
    agent_id: "pi",
    channel: BackendChannel::ConfigFileOnly,
    api_key_env: &[],
    base_url_env: None,
    model_env: None,
    config_file: Some("~/.pi/agent/settings.json"),
    note: "pi configures its own model providers/keys in ~/.pi/agent/settings.json; pi-acp signs in through Terminal Auth (`pi-acp --terminal-login`).",
};

const GROK: AgentBackendSpec = AgentBackendSpec {
    agent_id: "grok",
    channel: BackendChannel::Subscription,
    api_key_env: &[],
    base_url_env: None,
    model_env: None,
    config_file: None,
    note: "Grok Build signs in with the xAI account; EveryAIOS never touches those credentials.",
};

const GEMINI: AgentBackendSpec = AgentBackendSpec {
    agent_id: "gemini",
    channel: BackendChannel::Subscription,
    api_key_env: &[],
    base_url_env: None,
    model_env: None,
    config_file: None,
    note: "Gemini CLI signs in with the Google account.",
};

const COPILOT: AgentBackendSpec = AgentBackendSpec {
    agent_id: "copilot",
    channel: BackendChannel::Subscription,
    api_key_env: &[],
    base_url_env: None,
    model_env: None,
    config_file: None,
    note: "GitHub Copilot signs in with the GitHub account.",
};

/// The verified matrix. An agent absent from this list is [`Unknown`] by
/// construction — the absence is the honest answer, not an oversight.
///
/// [`Unknown`]: BackendChannel::Unknown
pub fn builtin_backend_specs() -> Vec<AgentBackendSpec> {
    vec![
        CLAUDE, CODEX, OPENCODE, CLINE, AIDER, GOOSE, HERMES, QWEN_CODE, KIMI, KILO, OPENCLAW, PI,
        GROK, GEMINI, COPILOT,
    ]
}

/// Look up an agent's contract. Returns a synthesized `Unknown` spec for an
/// agent we have no verified row for, so callers never have to unwrap.
pub fn backend_spec(agent_id: &str) -> AgentBackendSpec {
    builtin_backend_specs()
        .into_iter()
        .find(|s| s.agent_id == agent_id)
        .unwrap_or(AgentBackendSpec {
            agent_id: "",
            channel: BackendChannel::Unknown,
            api_key_env: &[],
            base_url_env: None,
            model_env: None,
            config_file: None,
            note: "No verified model-backend contract for this agent.",
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn binding<'a>(
        provider: &'a str,
        key_env: &'a str,
        base_url: Option<&'a str>,
        base_url_env: Option<&'a str>,
        secret: Option<&'a str>,
    ) -> ProviderBinding<'a> {
        ProviderBinding {
            provider,
            model: "some-model",
            key_env,
            base_url,
            base_url_env,
            secret,
        }
    }

    #[test]
    fn claude_fixed_env_injects_the_anthropic_triple() {
        let b = binding(
            "anthropic",
            "ANTHROPIC_API_KEY",
            Some("https://api.anthropic.com"),
            None,
            Some("sk-ant-1"),
        );
        let pairs = plan_env(&CLAUDE, &b).unwrap();
        assert_eq!(
            pairs,
            vec![
                ("ANTHROPIC_API_KEY".to_string(), "sk-ant-1".to_string()),
                (
                    "ANTHROPIC_BASE_URL".to_string(),
                    "https://api.anthropic.com".to_string()
                ),
                ("ANTHROPIC_MODEL".to_string(), "some-model".to_string()),
            ]
        );
    }

    #[test]
    fn claude_can_be_pointed_at_a_non_anthropic_endpoint() {
        // The cc-switch case: a proxy provider whose own env name is different.
        let b = binding(
            "my-proxy",
            "MYPROXY_API_KEY",
            Some("https://proxy.internal/v1"),
            Some("MYPROXY_BASE_URL"),
            Some("sk-proxy"),
        );
        let pairs = plan_env(&CLAUDE, &b).unwrap();
        // Fixed: the agent's own names win, never the provider's.
        assert!(pairs.iter().any(|(k, _)| k == "ANTHROPIC_API_KEY"));
        assert!(pairs.iter().any(|(k, _)| k == "ANTHROPIC_BASE_URL"));
        assert!(!pairs.iter().any(|(k, _)| k == "MYPROXY_API_KEY"));
    }

    #[test]
    fn provider_env_agents_use_the_providers_own_names() {
        let b = binding(
            "deepseek",
            "DEEPSEEK_API_KEY",
            Some("https://api.deepseek.com/v1"),
            Some("DEEPSEEK_BASE_URL"),
            Some("sk-ds"),
        );
        let pairs = plan_env(&OPENCODE, &b).unwrap();
        assert_eq!(
            pairs,
            vec![
                ("DEEPSEEK_API_KEY".to_string(), "sk-ds".to_string()),
                (
                    "DEEPSEEK_BASE_URL".to_string(),
                    "https://api.deepseek.com/v1".to_string()
                ),
            ]
        );
    }

    #[test]
    fn no_secret_omits_the_key_var_but_keeps_the_base_url() {
        // A keyless local runtime is legitimate — never inject an empty key.
        let b = binding(
            "ollama",
            "OLLAMA_API_KEY",
            Some("http://127.0.0.1:11434/v1"),
            Some("OLLAMA_BASE_URL"),
            None,
        );
        let pairs = plan_env(&OPENCODE, &b).unwrap();
        assert_eq!(
            pairs,
            vec![(
                "OLLAMA_BASE_URL".to_string(),
                "http://127.0.0.1:11434/v1".to_string()
            )]
        );
    }

    #[test]
    fn config_file_agents_refuse_with_the_path() {
        let b = binding("openai", "OPENAI_API_KEY", None, None, Some("sk-1"));
        let err = plan_env(&CODEX, &b).unwrap_err();
        match err {
            BackendError::ConfigFileOnly { file, .. } => {
                assert!(file.contains("config.toml"), "got {file}");
            }
            other => panic!("expected ConfigFileOnly, got {other:?}"),
        }
        assert!(plan_env(&CLINE, &b).is_err());
    }

    #[test]
    fn subscription_agents_are_refused() {
        let b = binding("xai", "XAI_API_KEY", None, None, Some("sk-1"));
        assert!(matches!(
            plan_env(&GROK, &b).unwrap_err(),
            BackendError::Subscription(_)
        ));
    }

    #[test]
    fn unknown_agents_are_refused_not_guessed() {
        let b = binding("anthropic", "ANTHROPIC_API_KEY", None, None, Some("sk-1"));
        // An agent with no row at all is Unknown, so no control is offered.
        let spec = backend_spec("who-is-this");
        assert_eq!(spec.channel, BackendChannel::Unknown);
        assert!(matches!(
            plan_env(&spec, &b).unwrap_err(),
            BackendError::UnknownAgent(_)
        ));
    }

    #[test]
    fn pi_is_config_file_only_with_its_real_settings_path() {
        // Evidence: pi-acp README — "Configure pi separately for your model
        // providers/API keys" and Terminal Auth via `pi-acp --terminal-login`.
        assert_eq!(PI.channel, BackendChannel::ConfigFileOnly);
        assert_eq!(PI.config_file, Some("~/.pi/agent/settings.json"));
        assert!(PI.note.contains("terminal-login"));
    }

    #[test]
    fn multiline_secrets_and_values_are_refused() {
        let b = binding(
            "openai",
            "OPENAI_API_KEY",
            Some("https://api.openai.com/v1"),
            None,
            Some("sk-bad\nINJECTED=1"),
        );
        assert!(matches!(
            plan_env(&OPENCODE, &b).unwrap_err(),
            BackendError::InvalidEnv(_)
        ));
        // A newline smuggled through a base URL this agent *does* read is
        // refused the same way (Claude Code reads ANTHROPIC_BASE_URL).
        let b2 = binding(
            "anthropic",
            "ANTHROPIC_API_KEY",
            Some("https://x/v1\nEVIL=1"),
            None,
            Some("sk-ok"),
        );
        assert!(matches!(
            plan_env(&CLAUDE, &b2).unwrap_err(),
            BackendError::InvalidEnv(_)
        ));
    }

    #[test]
    fn a_base_url_with_no_var_for_it_is_reported_not_silently_dropped() {
        // OpenCode declares no base-URL env var, so a URL cannot be expressed.
        let b = binding(
            "openai",
            "OPENAI_API_KEY",
            Some("https://proxy.internal/v1"),
            None,
            Some("sk-1"),
        );
        let pairs = plan_env(&OPENCODE, &b).unwrap();
        assert_eq!(
            pairs,
            vec![("OPENAI_API_KEY".to_string(), "sk-1".to_string())]
        );
        assert_eq!(unexpressed(&OPENCODE, &b), vec!["base_url", "model"]);
        // Claude Code can carry all three, so nothing is unexpressed.
        let b2 = binding(
            "anthropic",
            "ANTHROPIC_API_KEY",
            Some("https://api.anthropic.com"),
            None,
            Some("sk-ant"),
        );
        assert!(unexpressed(&CLAUDE, &b2).is_empty());
        // Non-injectable channels report nothing (the channel error speaks).
        assert!(unexpressed(&CODEX, &b2).is_empty());
    }

    #[test]
    fn empty_model_does_not_inject_a_model_var() {
        let b = ProviderBinding {
            provider: "anthropic",
            model: "",
            key_env: "ANTHROPIC_API_KEY",
            base_url: None,
            base_url_env: None,
            secret: Some("sk-ant"),
        };
        let pairs = plan_env(&CLAUDE, &b).unwrap();
        assert_eq!(
            pairs,
            vec![("ANTHROPIC_API_KEY".to_string(), "sk-ant".to_string())]
        );
    }

    #[test]
    fn names_only_surface_never_carries_a_value() {
        let b = binding(
            "anthropic",
            "ANTHROPIC_API_KEY",
            Some("https://api.anthropic.com"),
            None,
            Some("sk-secret-value"),
        );
        let names = injected_names(&CLAUDE, &b);
        assert!(names.iter().all(|n| !n.contains("sk-")));
        assert_eq!(names.len(), 3);
    }

    #[test]
    fn matrix_ids_are_unique_and_absent_agents_are_unknown() {
        let specs = builtin_backend_specs();
        let mut ids: Vec<&str> = specs.iter().map(|s| s.agent_id).collect();
        let n = ids.len();
        ids.sort();
        ids.dedup();
        assert_eq!(ids.len(), n, "duplicate agent id in the matrix");
        // The three channels that offer a control are all represented.
        assert!(specs
            .iter()
            .any(|s| s.channel == BackendChannel::ProviderEnv));
        assert!(specs.iter().any(|s| s.channel == BackendChannel::FixedEnv));
        assert!(specs
            .iter()
            .any(|s| s.channel == BackendChannel::ConfigFileOnly));
    }

    #[test]
    fn channels_declare_injectability() {
        assert!(BackendChannel::ProviderEnv.is_env_injectable());
        assert!(BackendChannel::FixedEnv.is_env_injectable());
        assert!(!BackendChannel::ConfigFileOnly.is_env_injectable());
        assert!(!BackendChannel::Subscription.is_env_injectable());
        assert!(!BackendChannel::Unknown.is_env_injectable());
    }
}
