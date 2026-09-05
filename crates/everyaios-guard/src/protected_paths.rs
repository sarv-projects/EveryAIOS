//! P51.30 — protected own-settings paths and recursive-rm criticality.
//!
//! The agent's own settings must never be removed by a recursive delete:
//! [`is_protected`] recognizes them and [`rm_critical`] treats an `rm`-like
//! recursive command aimed at `/`, `~`, `.`, a workspace-root marker,
//! `.git/`, or a protected path as critical (fail-closed).

/// Own-settings file/dir names. Any canonical path containing one of these
/// is protected.
pub static PROTECTED_PREFIXES: &[&str] = &[
    "config.toml",
    "risk_overrides.json",
    "workspace_trust.json",
    "permissions.toml",
    ".everyaios/",
];

/// Is this canonical path one of our own settings files/dirs?
/// Substring match (fail-closed): absolute project paths like
/// `/home/u/.everyaios/permissions.toml` still trip.
pub fn is_protected(canonical_path: &str) -> bool {
    let normalized = canonical_path.replace('\\', "/");
    PROTECTED_PREFIXES
        .iter()
        .any(|p| normalized.contains(p))
}

/// Workspace-root markers: any of these as an `rm` target is critical.
fn is_workspace_root_marker(target: &str) -> bool {
    matches!(
        target.to_lowercase().as_str(),
        "$workspace"
            | "${workspace}"
            | "$workspace_root"
            | "${workspace_root}"
            | "<workspace-root>"
            | "<workspace_root>"
            | "<workspace>"
            | "/workspace"
            | "workspace"
    )
}

fn is_rm_like_recursive(command: &str) -> bool {
    let lower = command.to_lowercase();
    let tokens: Vec<&str> = lower.split_whitespace().collect();
    let has_rm = tokens.iter().any(|t| {
        let bare = t.trim_matches(|c| c == '\'' || c == '"' || c == ';' || c == ',');
        bare == "rm"
            || bare == "rmdir"
            || bare.ends_with("/rm")
            || bare.ends_with("/rmdir")
    });
    if !has_rm {
        return false;
    }
    tokens.iter().any(|t| {
        if *t == "--recursive" || t.starts_with("--recursive=") {
            return true;
        }
        if t.starts_with('-') && !t.starts_with("--") && t.len() > 1 {
            return t[1..].chars().any(|c| c == 'r' || c == 'R');
        }
        false
    })
}

fn is_critical_target(target: &str) -> bool {
    let trimmed = target
        .trim()
        .trim_matches(|c| c == '\'' || c == '"')
        .trim();
    if trimmed.is_empty() {
        return false;
    }
    let normalized = trimmed.replace('\\', "/");
    // `/`, `~`, `.` families.
    if normalized == "/" || normalized == "/*" {
        return true;
    }
    if matches!(
        normalized.as_str(),
        "~" | "~/" | "$HOME" | "${HOME}"
    ) {
        return true;
    }
    if normalized == "." || normalized == "./" {
        return true;
    }
    if is_workspace_root_marker(&normalized) {
        return true;
    }
    // `.git/` destruction.
    if normalized.contains(".git") {
        return true;
    }
    // Own settings.
    if is_protected(&normalized) {
        return true;
    }
    false
}

/// True when `command` is an `rm`-like recursive invocation AND any entry
/// of `targets` is `/`, `~`, `.`, a workspace-root marker, `.git/`, or a
/// protected settings path.
pub fn rm_critical(command: &str, targets: &[&str]) -> bool {
    if !is_rm_like_recursive(command) {
        return false;
    }
    targets.iter().any(|t| is_critical_target(t))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rm_rf_root_is_critical() {
        assert!(rm_critical("rm -rf", &["/"]));
        assert!(rm_critical("sudo rm -rf /", &["/"]));
        assert!(!rm_critical("rm /tmp/foo", &["/tmp/foo"]));
    }

    #[test]
    fn rm_protected_settings_is_critical() {
        assert!(rm_critical(
            "rm -rf",
            &["/home/user/.everyaios/permissions.toml"]
        ));
        assert!(rm_critical("rm -rf /tmp/x", &[".github/workflows/../.."]));
        // Direct protected target (config file) is critical under rm -rf.
        assert!(rm_critical("rm -rf", &["config.toml"]));
    }

    #[test]
    fn plain_ls_not_critical() {
        assert!(!rm_critical("ls -la", &["/tmp"]));
        // Even `ls /` is not an rm-critical action.
        assert!(!rm_critical("ls", &["/"]));
    }

    #[test]
    fn is_protected_matches_settings_files() {
        assert!(is_protected("/home/user/.everyaios/config.toml"));
        assert!(is_protected("permissions.toml"));
        assert!(is_protected("/proj/.everyaios/risk_overrides.json"));
        assert!(is_protected("workspace_trust.json"));
        assert!(!is_protected("/tmp/foo.txt"));
        assert!(!is_protected("/workspace/src/main.rs"));
    }
}
