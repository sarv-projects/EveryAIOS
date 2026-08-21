//! P7.4 — URL floors. `file://` URLs are only allowed inside the granted
//! roots; other schemes are gated per-policy (http/https allowed by default,
//! everything else requires an explicit allow). Deterministic: the same URL +
//! roots always yields the same verdict.

/// Schemes that are always allowed (network reads with no local side effect).
const ALWAYS_ALLOWED: &[&str] = &["http", "https"];

/// Schemes that are always refused (local side effects / opaque).
const NEVER_ALLOWED: &[&str] = &[
    "file",
    "javascript",
    "data",
    "about",
    "vbscript",
    "smb",
    "nfs",
];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum UrlVerdict {
    Allowed,
    /// Scheme not in the allow set.
    SchemeBlocked,
    /// `file://` outside the granted roots.
    OutsideRoots,
    /// Malformed URL / no scheme.
    Malformed,
}

impl UrlVerdict {
    pub fn is_allowed(self) -> bool {
        self == UrlVerdict::Allowed
    }
}

/// Decide whether `url` may be fetched given the granted `roots`
/// (absolute canonical paths). `file://` is only allowed when the decoded
/// path is inside one of the roots.
pub fn check_url(url: &str, roots: &[&str]) -> UrlVerdict {
    let Ok(parsed) = url::Url::parse(url) else {
        return UrlVerdict::Malformed;
    };
    let scheme = parsed.scheme();
    if NEVER_ALLOWED.contains(&scheme) {
        if scheme == "file" {
            let Ok(path) = parsed.to_file_path() else {
                return UrlVerdict::Malformed;
            };
            let path_str = path.to_string_lossy();
            let canonical = crate::pathfloor::canonicalize_no_follow(&path_str);
            let inside = roots.iter().any(|r| {
                let root = crate::pathfloor::canonicalize_no_follow(r);
                canonical == root
                    || canonical.starts_with(&format!("{}/", root.trim_end_matches('/')))
            });
            return if inside {
                UrlVerdict::Allowed
            } else {
                UrlVerdict::OutsideRoots
            };
        }
        return UrlVerdict::SchemeBlocked;
    }
    if ALWAYS_ALLOWED.contains(&scheme) {
        return UrlVerdict::Allowed;
    }
    UrlVerdict::SchemeBlocked
}

/// Is this URL fetchable under the given roots?
pub fn is_allowed(url: &str, roots: &[&str]) -> bool {
    check_url(url, roots).is_allowed()
}

/// Adversarial URL corpus for the S0.7 fuzz gate (scheme smuggling,
/// file-exfil, javascript, data, UNC).
pub fn adversarial_urls() -> Vec<&'static str> {
    vec![
        "javascript:alert(1)",
        "data:text/html,pwn",
        "file:///etc/passwd",
        "file:///etc/shadow",
        "file://../../etc/passwd",
        "about:blank",
        "vbscript:msgbox",
        "smb://evil/share",
        "nfs://evil/export",
        "file:///workspace/../../etc/passwd",
        "javascript://https://example.com/%0aalert(1)",
        "data:application/javascript,fetch('http://evil')",
        "file:///C:/Windows/System32/config/SAM",
        "file:////etc/passwd",
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn http_always_allowed() {
        assert_eq!(check_url("https://example.com/x", &[]), UrlVerdict::Allowed);
        assert_eq!(check_url("http://example.com", &[]), UrlVerdict::Allowed);
    }

    #[test]
    fn file_inside_roots_allowed() {
        assert_eq!(
            check_url("file:///workspace/a.txt", &["/workspace"]),
            UrlVerdict::Allowed
        );
        assert_eq!(
            check_url("file:///workspace/sub/b.txt", &["/workspace"]),
            UrlVerdict::Allowed
        );
    }

    #[test]
    fn file_outside_roots_blocked() {
        assert_eq!(
            check_url("file:///etc/passwd", &["/workspace"]),
            UrlVerdict::OutsideRoots
        );
        assert_eq!(
            check_url("file:///workspace2/x", &["/workspace"]),
            UrlVerdict::OutsideRoots
        );
    }

    #[test]
    fn dangerous_schemes_blocked() {
        assert_eq!(
            check_url("javascript:alert(1)", &[]),
            UrlVerdict::SchemeBlocked
        );
        assert_eq!(
            check_url("data:text/html,<script>", &[]),
            UrlVerdict::SchemeBlocked
        );
        assert_eq!(
            check_url("smb://host/share", &[]),
            UrlVerdict::SchemeBlocked
        );
    }

    #[test]
    fn malformed_blocked() {
        assert_eq!(check_url("not a url", &[]), UrlVerdict::Malformed);
        assert_eq!(check_url("", &[]), UrlVerdict::Malformed);
    }
}
