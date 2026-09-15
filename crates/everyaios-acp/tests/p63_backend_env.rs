//! P63 — **live proof** that the per-agent provider binding actually reaches a
//! child process.
//!
//! The unit tests in `agent_backend` prove the *decision* (which variables, for
//! which agent). This proves the other half: the pairs that decision produces
//! are inherited by a real child spawned through
//! [`everyaios_acp::ProcessTransport::spawn`] — the same primitive
//! `acp_launch` uses to start an agent CLI.
//!
//! No credentials and no network: the "agent" is `sh`, and the assertion is on
//! the environment it actually received.

use everyaios_acp::{backend_spec, plan_env, ProcessTransport, ProviderBinding};

/// Dump the child's environment, then read it back. `ProcessTransport` pipes
/// stdin/stdout for ACP framing, so the probe writes its environment to a file
/// instead of stdout.
fn child_env_after_spawn(env: &[(&str, &str)]) -> String {
    // The name must be shell-safe: `ThreadId(2)`'s parentheses would break the
    // `>` redirect, so tests get a plain counter instead.
    static SEQ: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
    let n = SEQ.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    let dir = std::env::temp_dir().join(format!("p63-env-{}-{n}", std::process::id()));
    std::fs::create_dir_all(&dir).expect("temp dir");
    let out = dir.join("child-env.txt");
    let script = format!("env > {}", out.display());

    // Held for the whole test: the transport owns the child.
    let _transport = ProcessTransport::spawn("sh", &["-c", script.as_str()], env)
        .expect("spawn the probe child");

    let mut content = String::new();
    for _ in 0..200 {
        if let Ok(s) = std::fs::read_to_string(&out) {
            if !s.is_empty() {
                content = s;
                break;
            }
        }
        std::thread::sleep(std::time::Duration::from_millis(20));
    }
    let _ = std::fs::remove_dir_all(&dir);
    content
}

#[test]
fn injected_provider_env_reaches_a_real_child_process() {
    // A real matrix row (Claude Code's fixed ANTHROPIC_* triple) with the
    // binding shape the Tauri layer builds from the catalog + the vault.
    let spec = backend_spec("claude");
    let binding = ProviderBinding {
        provider: "anthropic",
        model: "claude-sonnet-4",
        key_env: "ANTHROPIC_API_KEY",
        base_url: Some("http://127.0.0.1:9/v1"),
        base_url_env: None,
        secret: Some("sk-live-proof-sentinel"),
    };
    let pairs = plan_env(&spec, &binding).expect("claude accepts a fixed-env binding");
    let env: Vec<(&str, &str)> = pairs
        .iter()
        .map(|(k, v)| (k.as_str(), v.as_str()))
        .collect();

    let dump = child_env_after_spawn(&env);

    assert!(
        dump.contains("ANTHROPIC_API_KEY=sk-live-proof-sentinel"),
        "the child did not inherit the key: {dump}"
    );
    assert!(
        dump.contains("ANTHROPIC_BASE_URL=http://127.0.0.1:9/v1"),
        "the child did not inherit the base URL: {dump}"
    );
    assert!(
        dump.contains("ANTHROPIC_MODEL=claude-sonnet-4"),
        "the child did not inherit the model: {dump}"
    );
}

#[test]
fn a_provider_env_agent_receives_the_providers_own_names() {
    // OpenCode's channel: the provider's own variable names, read from the
    // vendored models.dev directory by the caller.
    let spec = backend_spec("opencode");
    let binding = ProviderBinding {
        provider: "deepseek",
        model: "",
        key_env: "DEEPSEEK_API_KEY",
        base_url: None,
        base_url_env: None,
        secret: Some("sk-deepseek-sentinel"),
    };
    let pairs = plan_env(&spec, &binding).expect("opencode accepts a provider-env binding");
    let env: Vec<(&str, &str)> = pairs
        .iter()
        .map(|(k, v)| (k.as_str(), v.as_str()))
        .collect();

    let dump = child_env_after_spawn(&env);
    assert!(
        dump.contains("DEEPSEEK_API_KEY=sk-deepseek-sentinel"),
        "the child did not inherit the provider key: {dump}"
    );
    // And we did not invent an Anthropic variable for a provider-env agent.
    assert!(!dump.contains("ANTHROPIC_API_KEY="));
}

#[test]
fn a_config_file_agent_injects_nothing_and_is_refused_with_its_path() {
    // Codex routes providers through ~/.codex/config.toml. Nothing may be
    // injected, and the refusal must name the file so the card can say why.
    let spec = backend_spec("codex");
    let binding = ProviderBinding {
        provider: "openai",
        model: "gpt-5",
        key_env: "OPENAI_API_KEY",
        base_url: Some("https://api.openai.com/v1"),
        base_url_env: None,
        secret: Some("sk-should-not-be-injected"),
    };
    match plan_env(&spec, &binding) {
        Err(everyaios_acp::BackendError::ConfigFileOnly { file, .. }) => {
            assert!(file.contains("config.toml"), "got {file}");
        }
        other => panic!("a config-file agent must refuse, got {other:?}"),
    }
}
