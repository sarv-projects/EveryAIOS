//! everyaios-guard — Guard-1: deterministic pre-exec scanning of every
//! generated shell string, filesystem path and URL before execution
//! (ARCH/06 §6.2; doc 06, doc 03 §8).
//!
//! P7 scope:
//! - [`blocklist`] — the full destructive-pattern corpus (rm -rf variants,
//!   mkfs, dd, drop database, format, fork bombs, key exfiltration, `.git`
//!   destruction, home wipes).
//! - [`prescan`] — pre-exec scan of shell strings, filesystem paths and URLs.
//! - [`urlfloor`] — URL floors: `file://` only inside granted roots, scheme
//!   guard.
//! - [`ticket`] — the authorization ticket contract (doc 53 §3).
//! - [`redteam`] — the cyber red-team corpus (doc 26) as an adversarial test
//!   suite; the 100%-blocked gate.
//! - [`injection`] — P7.6 prompt-injection defense: context scan,
//!   `<user_document>` wrapping, tool-result sanitization, estop.
//! - [`pathfloor`] — P7.7 canonicalization, symlink-safe boundaries, `..`
//!   prevention, and the path-floor fuzz gate.
//! - [`profiles`] — P7.7 profile-gated hooks (minimal/standard/strict),
//!   ECC pattern (doc 46).
//! - [`configscan`] — P7.7 AgentShield config scanning of everyaios.toml,
//!   blueprints and MCP configs.
//! - [`loopguard`] — P7.7 SHA256 circuit breaker against infinite loops.
//! - [`manifest`] — P7.7 Ed25519-signed extension manifests (OpenFang
//!   pattern).
//!
//! Guard-2 (diff-card approval, human-in-the-loop UX) is a separate gate
//! (P7.5).

pub mod blocklist;
pub mod configscan;
pub mod injection;
pub mod loopguard;
pub mod manifest;
pub mod pathfloor;
pub mod prescan;
pub mod profiles;
pub mod redteam;
pub mod ticket;
pub mod urlfloor;

pub use blocklist::{BLOCKLIST, BlocklistCategory, blocklist_for};
pub use prescan::{PreExecScan, ScanTarget, scan_path, scan_shell, scan_url};
pub use ticket::{ApprovalSource, AuthorizationTicket, RiskLevel, TicketState, TicketStore};

/// Scan everything pre-exec: shell string, filesystem paths, URLs.
/// Returns every blocklist pattern that matched any target.
pub fn scan_all(shell: &str, paths: &[&str], urls: &[&str]) -> Vec<PreExecScan> {
    let mut hits = Vec::new();
    let guard = prescan::guard();
    if guard.is_blocked(shell) {
        hits.push(PreExecScan::new(ScanTarget::Shell, shell.to_string(), guard.scan(shell)));
    }
    for p in paths {
        if guard.is_blocked(p) {
            hits.push(PreExecScan::new(ScanTarget::Path, (*p).to_string(), guard.scan(p)));
        }
    }
    for u in urls {
        if guard.is_blocked(u) {
            hits.push(PreExecScan::new(ScanTarget::Url, (*u).to_string(), guard.scan(u)));
        }
    }
    hits
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scan_all_catches_across_targets() {
        let hits = scan_all("ls -la", &["/tmp/x"], &["file:///etc/passwd"]);
        assert!(hits.is_empty());
        let hits = scan_all("rm -rf ~", &["/etc/passwd"], &["https://ok.test"]);
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].target, ScanTarget::Shell);
    }
}
