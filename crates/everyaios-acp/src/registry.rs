//! The **agent launch registry** (F12/J17 + doc 57 §2 — the Ollama
//! `ollama launch <agent>` pattern). Ollama ships a catalog of agent CLIs and
//! one command that configures + spawns them on its model backend. We adopt
//! the same shape: one [`HarnessManifest`] per agent (id, name, auth-mode
//! badge, distribution type, and *how* we drive it), plus a
//! [`LaunchRegistry`] whose default entry is our own inbuilt engine — the
//! "same chat bar, agent differs, default = EveryAIOS" model.
//!
//! Data only: the actual spawn happens in `everyaios-core` (which feeds the
//! manifest's command/args/env to a process transport and, for ACP agents,
//! drives it via [`crate::client::AcpSession`]).
//!
//! # Entrypoint provenance (verified 2026-08)
//!
//! The catalog is seeded from the **official ACP registry** —
//! `https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json`
//! (44 agents, Apache-2.0 registry, per-agent licenses), plus the `ollama
//! launch` catalog and the Zed `/acp` ecosystem. Spawn commands (npx/uvx
//! package + args, or binary cmd + args) are transcribed verbatim from the
//! registry's `distribution` blocks. This is the **curated seed**, not the
//! ceiling: the F8 installer + registry-fed discovery (still TODO) re-pin
//! versions + platform archives at install time.

use serde::{Deserialize, Serialize};

/// How the user authenticates the agent (the F12 auth-mode badge — doc 57 §3).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AuthMode {
    /// The agent uses its own subscription login (e.g. Claude via the official
    /// ACP wrapper — Anthropic co-authored; allowed, never token-harvested).
    Subscription,
    /// The agent uses the user's API keys.
    ApiKey,
    /// The agent runs against local models (Ollama / llamafile) or BYOK keys.
    Local,
}

impl AuthMode {
    pub fn as_str(&self) -> &'static str {
        match self {
            AuthMode::Subscription => "subscription",
            AuthMode::ApiKey => "api_key",
            AuthMode::Local => "local",
        }
    }
}

/// How the agent binary is distributed (doc 57 §2: `binary`/`npx`/`uvx`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Distribution {
    /// A platform binary (`command` + optional `args`). The binary path is
    /// pinned by the F8 installer / registry-fed discovery.
    Binary {
        command: String,
        #[serde(default)]
        args: Vec<String>,
    },
    /// An npm package run via `npx` (+ optional `args`).
    Npx {
        package: String,
        #[serde(default)]
        args: Vec<String>,
    },
    /// A Python package run via `uvx` (+ optional `args`).
    Uvx {
        package: String,
        #[serde(default)]
        args: Vec<String>,
    },
}

/// How our app drives the agent.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum HarnessProtocol {
    /// Our native engine — all inbuilt capabilities (office, browser, memory,
    /// guard, eval). Not an external subprocess; the default picker entry.
    Inbuilt,
    /// Drive via ACP stdio (the agent speaks ACP; spawn its ACP entrypoint).
    Acp,
    /// Configure the agent's model backend via env overrides, then spawn it
    /// (the `ollama launch` "point this CLI at my models" path).
    ModelBackend,
}

/// One agent in the launch registry (serializable → the agent picker).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HarnessManifest {
    pub id: String,
    pub name: String,
    pub description: String,
    pub auth_mode: AuthMode,
    pub distribution: Distribution,
    pub protocol: HarnessProtocol,
    /// Fixed env vars the agent needs (e.g. auto-update disables) — merged
    /// into the spawn env by [`LaunchRegistry::launch_plan`].
    #[serde(default)]
    pub env: Vec<(String, String)>,
    /// Env keys the agent reads for its model backend (ModelBackend agents),
    /// so `launch_plan` knows what to point at our broker/local endpoint.
    #[serde(default)]
    pub backend_env_keys: Vec<String>,
    /// Whether this agent is our own inbuilt engine.
    #[serde(default)]
    pub is_default: bool,
}

/// The concrete spawn spec `ollama launch <agent> --model X` would produce.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchPlan {
    pub agent_id: String,
    pub command: String,
    pub args: Vec<String>,
    pub env: Vec<(String, String)>,
    pub protocol: HarnessProtocol,
}

/// The catalog of launchable agents + the default (inbuilt) selection.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchRegistry {
    pub agents: Vec<HarnessManifest>,
    /// The id of the default (inbuilt) agent.
    pub default_agent: String,
}

impl LaunchRegistry {
    pub fn builtin() -> Self {
        // Compact constructors keep the 46-entry catalog readable.
        fn acp(id: &str, name: &str, desc: &str, auth: AuthMode, dist: Distribution) -> HarnessManifest {
            HarnessManifest {
                id: id.into(),
                name: name.into(),
                description: desc.into(),
                auth_mode: auth,
                distribution: dist,
                protocol: HarnessProtocol::Acp,
                env: vec![],
                backend_env_keys: vec![],
                is_default: false,
            }
        }
        fn npx(pkg: &str, args: &[&str]) -> Distribution {
            Distribution::Npx { package: pkg.into(), args: args.iter().map(|s| s.to_string()).collect() }
        }
        fn uvx(pkg: &str, args: &[&str]) -> Distribution {
            Distribution::Uvx { package: pkg.into(), args: args.iter().map(|s| s.to_string()).collect() }
        }
        fn bin(cmd: &str, args: &[&str]) -> Distribution {
            Distribution::Binary { command: cmd.into(), args: args.iter().map(|s| s.to_string()).collect() }
        }

        Self {
            default_agent: "everyaios".to_string(),
            agents: vec![
                HarnessManifest {
                    id: "everyaios".into(),
                    name: "EveryAIOS".into(),
                    description: "Inbuilt agent — office, browser, memory, guard, eval, all models.".into(),
                    auth_mode: AuthMode::Local,
                    distribution: Distribution::Binary { command: String::new(), args: vec![] },
                    protocol: HarnessProtocol::Inbuilt,
                    env: vec![],
                    backend_env_keys: vec![],
                    is_default: true,
                },
                // ---- Frontier labs (subscription-backed official wrappers) ----
                acp("claude", "Claude Code", "Anthropic's coding tool with subagents (official ACP wrapper).", AuthMode::Subscription, npx("@agentclientprotocol/claude-agent-acp", &[])),
                acp("codex", "Codex", "OpenAI's coding agent (stdio ACP adapter for the Codex app server).", AuthMode::Subscription, npx("@agentclientprotocol/codex-acp", &[])),
                acp("gemini", "Gemini CLI", "Google's CLI for Gemini.", AuthMode::Subscription, npx("@google/gemini-cli", &["--acp"])),
                acp("copilot", "GitHub Copilot", "GitHub's AI pair programmer (ACP public preview).", AuthMode::Subscription, npx("@github/copilot", &["--acp"])),
                acp("chatgpt", "ChatGPT", "Complete work with ChatGPT (Codex engine, ollama launch alias).", AuthMode::Subscription, bin("chatgpt", &[])),
                acp("grok", "Grok Build", "xAI's coding agent and CLI.", AuthMode::Subscription, npx("@xai-official/grok", &["agent", "stdio"])),
                acp("cursor", "Cursor", "Cursor's coding agent.", AuthMode::Subscription, bin("cursor-agent", &["acp"])),
                acp("devin", "Devin", "Devin CLI coding agent by Cognition.", AuthMode::Subscription, bin("devin", &["acp"])),
                acp("junie", "Junie", "AI coding agent by JetBrains.", AuthMode::Subscription, bin("junie", &["--acp=true"])),
                acp("kiro", "Kiro CLI", "AWS's Kiro coding agent (kiro-cli acp).", AuthMode::Subscription, bin("kiro-cli", &["acp"])),
                acp("auggie", "Auggie CLI", "Augment Code's software agent.", AuthMode::Subscription, npx("@augmentcode/auggie", &["--acp"])),
                acp("codebuddy-code", "Codebuddy Code", "Tencent Cloud's intelligent coding tool.", AuthMode::Subscription, npx("@tencent-ai/codebuddy-code", &["--acp"])),
                acp("qoder", "Qoder CLI", "AI coding assistant with agentic capabilities.", AuthMode::Subscription, npx("@qoder-ai/qodercli", &["--acp"])),
                acp("poolside", "Poolside", "Poolside's coding agent.", AuthMode::Subscription, bin("pool", &["acp"])),
                acp("cortex-code", "Cortex Code", "Snowflake's Cortex Code agent.", AuthMode::Subscription, bin("cortex", &["acp", "serve"])),
                acp("nova", "Nova", "Compass AI's software engineer agent.", AuthMode::Subscription, npx("@compass-ai/nova", &["acp"])),
                acp("dimcode", "DimCode", "A coding agent for leading models.", AuthMode::Subscription, npx("dimcode", &["acp"])),
                acp("factory-droid", "Factory Droid", "Factory AI's coding agent.", AuthMode::Subscription, npx("droid", &["exec", "--output-format", "acp-daemon"])),
                // ---- Open / BYOK (local models or API keys) ----
                acp("cline", "Cline", "Cline CLI — autonomous coding agent (cline --acp).", AuthMode::Local, npx("cline", &["--acp"])),
                acp("opencode", "OpenCode", "Anomaly's open-source coding agent (opencode acp).", AuthMode::Local, bin("opencode", &["acp"])),
                acp("hermes", "Hermes Agent", "Nous Research's self-improving agent (hermes acp).", AuthMode::Local, bin("hermes", &["acp"])),
                acp("openclaw", "OpenClaw", "Personal AI with 100+ skills (openclaw client acp).", AuthMode::Local, bin("openclaw", &["client", "acp"])),
                acp("qwen-code", "Qwen Code", "Alibaba's Qwen coding assistant.", AuthMode::Local, npx("@qwen-code/qwen-code", &["--acp", "--experimental-skills"])),
                acp("goose", "goose", "Block's local, extensible, open source agent.", AuthMode::Local, bin("goose", &["acp"])),
                acp("aider", "Aider", "AI pair programming in the terminal.", AuthMode::Local, uvx("aider-chat", &[])),
                acp("kimi", "Kimi CLI", "Moonshot AI's coding assistant.", AuthMode::Local, bin("kimi", &["acp"])),
                acp("kilo", "Kilo", "The open source coding agent (Kilo Code).", AuthMode::Local, npx("@kilocode/cli", &["acp"])),
                acp("glm-agent", "GLM Agent", "Zhipu AI's GLM Coding Plan agent.", AuthMode::Local, npx("glm-acp-agent", &[])),
                acp("deepagents", "DeepAgents", "LangChain's batteries-included agent.", AuthMode::Local, npx("deepagents-acp", &[])),
                acp("fast-agent", "fast-agent", "Multi-provider agent builder.", AuthMode::Local, uvx("fast-agent-acp", &["-x"])),
                acp("minion-code", "Minion Code", "AI code assistant on the Minion framework.", AuthMode::Local, uvx("minion-code", &["acp"])),
                acp("mistral-vibe", "Mistral Vibe", "Mistral's open-source coding assistant.", AuthMode::Local, bin("vibe-acp", &[])),
                acp("harn", "Harn", "Harn runs .harn agent pipelines as an ACP agent.", AuthMode::Local, bin("harn", &["serve", "acp"])),
                acp("dirac", "Dirac", "Cost-optimizing, fully open-source coding agent.", AuthMode::Local, npx("dirac-cli", &["--acp"])),
                acp("crow-cli", "crow-cli", "Minimal ACP-native coding agent.", AuthMode::Local, bin("crow-cli", &["acp"])),
                acp("stakpak", "Stakpak", "Open-source DevOps agent in Rust.", AuthMode::Local, bin("stakpak", &["acp"])),
                acp("vtcode", "VT Code", "Open-source agent with LLM-native understanding.", AuthMode::Local, bin("vtcode", &["acp"])),
                acp("sigit", "siGit Code", "Local-first agent with on-device inference.", AuthMode::Local, npx("@smbcloud/sigit", &[])),
                acp("corust-agent", "Corust Agent", "Co-building with a seasoned Rust partner.", AuthMode::Local, bin("corust-agent-acp", &[])),
                acp("autohand", "Autohand Code", "Autohand AI's coding agent.", AuthMode::Local, npx("@autohandai/autohand-acp", &[])),
                acp("amp", "Amp", "ACP wrapper for Amp, the frontier coding agent.", AuthMode::Local, bin("amp-acp", &[])),
                acp("agoragentic", "Agoragentic", "Agent marketplace with 174+ AI capabilities.", AuthMode::Local, npx("agoragentic-mcp", &["--acp"])),
                acp("commandcode", "Command Code", "Frontier coding agent that learns your taste (candidate — verify ACP flag via registry).", AuthMode::Local, bin("commandcode", &["acp"])),
                // ---- API-key harness (DeepSeek) ----
                acp("codewhale", "CodeWhale", "Rust TUI coding agent (Hmbown/CodeWhale, the DeepSeek-TUI project renamed — doc 58 §6).", AuthMode::ApiKey, bin("codewhale", &[])),
                acp("dsh", "DeepSeek Harness", "DeepSeek's open-source agent harness.", AuthMode::ApiKey, bin("dsh", &[])),
                acp("pi", "Pi", "Minimal AI agent toolkit (via the pi-acp adapter).", AuthMode::Local, npx("pi-acp", &[])),
            ],
        }
    }

    pub fn get(&self, id: &str) -> Option<&HarnessManifest> {
        self.agents.iter().find(|a| a.id == id)
    }

    pub fn default_manifest(&self) -> Option<&HarnessManifest> {
        self.get(&self.default_agent)
    }

    /// Insert or replace an agent by id (the registry-fed merge seam — a
    /// registry entry supersedes the seed's command/version for the same id).
    pub fn upsert(&mut self, manifest: HarnessManifest) {
        match self.agents.iter_mut().find(|a| a.id == manifest.id) {
            Some(slot) => *slot = manifest,
            None => self.agents.push(manifest),
        }
    }

    /// Resolve the spawn spec for an agent on a model backend (the
    /// `ollama launch <agent>` equivalent). `backend_url` is the OpenAI-
    /// compatible endpoint our broker/local runtime serves; when `None`, env
    /// overrides are omitted (the agent uses its own default backend). Fixed
    /// `env` from the manifest is always merged.
    pub fn launch_plan(&self, id: &str, backend_url: Option<&str>) -> Option<LaunchPlan> {
        let m = self.get(id)?;
        let (command, args) = match &m.distribution {
            Distribution::Binary { command, args } => (command.clone(), args.clone()),
            Distribution::Npx { package, args } => {
                let mut a = vec!["-y".to_string(), package.clone()];
                a.extend(args.iter().cloned());
                ("npx".into(), a)
            }
            Distribution::Uvx { package, args } => {
                let mut a = vec![package.clone()];
                a.extend(args.iter().cloned());
                ("uvx".into(), a)
            }
        };
        let mut env = m.env.clone();
        if m.protocol == HarnessProtocol::ModelBackend {
            if let Some(url) = backend_url {
                for key in &m.backend_env_keys {
                    env.push((key.clone(), url.to_string()));
                }
            }
        }
        Some(LaunchPlan {
            agent_id: m.id.clone(),
            command,
            args,
            env,
            protocol: m.protocol.clone(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_is_inbuilt_everyaios() {
        let reg = LaunchRegistry::builtin();
        assert_eq!(reg.default_agent, "everyaios");
        let d = reg.default_manifest().unwrap();
        assert!(d.is_default);
        assert_eq!(d.protocol, HarnessProtocol::Inbuilt);
        assert_eq!(d.auth_mode, AuthMode::Local);
    }

    #[test]
    fn catalog_has_the_full_ecosystem() {
        let reg = LaunchRegistry::builtin();
        for id in [
            "everyaios", "claude", "codex", "gemini", "copilot", "chatgpt", "grok", "cursor",
            "devin", "junie", "kiro", "auggie", "codebuddy-code", "qoder", "poolside",
            "cortex-code", "nova", "dimcode", "factory-droid", "cline", "opencode", "hermes",
            "openclaw", "qwen-code", "goose", "aider", "kimi", "kilo", "glm-agent", "deepagents",
            "fast-agent", "minion-code", "mistral-vibe", "harn", "dirac", "crow-cli", "stakpak",
            "vtcode", "sigit", "corust-agent", "autohand", "amp", "agoragentic", "commandcode",
            "dsh", "pi",
        ] {
            assert!(reg.get(id).is_some(), "missing {id}");
        }
        // Claude is subscription-backed via the official ACP wrapper.
        let claude = reg.get("claude").unwrap();
        assert_eq!(claude.auth_mode, AuthMode::Subscription);
        assert_eq!(claude.protocol, HarnessProtocol::Acp);
        assert!(matches!(
            claude.distribution,
            Distribution::Npx { ref package, .. } if package == "@agentclientprotocol/claude-agent-acp"
        ));
    }

    #[test]
    fn launch_plan_resolves_npx_binary_and_uvx_with_args() {
        let reg = LaunchRegistry::builtin();
        let claude = reg.launch_plan("claude", None).unwrap();
        assert_eq!(claude.command, "npx");
        assert_eq!(claude.args, vec!["-y", "@agentclientprotocol/claude-agent-acp"]);

        // Codex goes through the stdio ACP adapter.
        assert_eq!(reg.launch_plan("codex", None).unwrap().args, vec!["-y", "@agentclientprotocol/codex-acp"]);

        // Npx + args: `npx cline --acp`.
        assert_eq!(reg.launch_plan("cline", None).unwrap().args, vec!["-y", "cline", "--acp"]);

        // Binary + args: opencode/hermes/devin/kiro use subcommand/flag.
        assert_eq!(reg.launch_plan("opencode", None).unwrap().args, vec!["acp"]);
        assert_eq!(reg.launch_plan("hermes", None).unwrap().args, vec!["acp"]);
        assert_eq!(reg.launch_plan("devin", None).unwrap().args, vec!["acp"]);
        assert_eq!(reg.launch_plan("kiro", None).unwrap().args, vec!["acp"]);
        assert_eq!(reg.launch_plan("copilot", None).unwrap().args, vec!["-y", "@github/copilot", "--acp"]);
        assert_eq!(reg.launch_plan("grok", None).unwrap().args, vec!["-y", "@xai-official/grok", "agent", "stdio"]);

        // Uvx + args: `uvx minion-code acp`.
        assert_eq!(reg.launch_plan("minion-code", None).unwrap().args, vec!["minion-code", "acp"]);
        // Uvx plain: `uvx aider-chat`.
        assert_eq!(reg.launch_plan("aider", None).unwrap().args, vec!["aider-chat"]);

        assert!(reg.launch_plan("nope", None).is_none());
    }

    #[test]
    fn model_backend_agents_get_env_override() {
        let reg = LaunchRegistry {
            default_agent: "everyaios".into(),
            agents: vec![HarnessManifest {
                id: "local-claude".into(),
                name: "Local Claude".into(),
                description: "test".into(),
                auth_mode: AuthMode::Local,
                distribution: Distribution::Binary { command: "claude".into(), args: vec![] },
                protocol: HarnessProtocol::ModelBackend,
                env: vec![],
                backend_env_keys: vec!["ANTHROPIC_BASE_URL".into()],
                is_default: false,
            }],
        };
        let plan = reg
            .launch_plan("local-claude", Some("http://127.0.0.1:11434"))
            .unwrap();
        assert_eq!(
            plan.env,
            vec![("ANTHROPIC_BASE_URL".to_string(), "http://127.0.0.1:11434".to_string())]
        );
        // No backend → no override (agent uses its default).
        let plan = reg.launch_plan("local-claude", None).unwrap();
        assert!(plan.env.is_empty());
    }
}
