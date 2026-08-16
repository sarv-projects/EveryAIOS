//! P7.5 / J21 — the `~/.everyaios/permissions.toml` escalation-rules policy
//! layer (doc 52 §2). Guard-1 blocks *known-bad* strings deterministically;
//! this layer answers the next question — *does this action need a human?* —
//! from user policy rather than the model's own judgment.
//!
//! The file is a small TOML mapping high-level operations to a rule:
//!
//! ```toml
//! [permissions]
//! delete_files      = "always_ask"            # always_ask | always_allow | block
//! multi_file_edit   = "ask_if_gt_5"           # ask when > N files
//! external_network  = "ask_if_new_domain"     # ask on unseen domains
//! terminal_shell    = "ask_if_destructive"    # ask when Guard-1 flags the cmd
//! web_action        = "always_ask"            # checkout/payment/sensitive submit
//! min_confidence_for_auto = 0.85              # below this → ask (auto path)
//! user_feedback_learning = true               # approvals feed taste profile
//! ```
//!
//! Everything is pure + deterministic: `load` parses (unknown keys ignored,
//! malformed → default), `evaluate` maps an operation + context to
//! [`PolicyAction`]::{Allow,Ask,Block}.

use serde::Deserialize;

/// What the policy decides for one action.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PolicyAction {
    /// Run without a human ticket (may still be subject to Guard-1).
    Allow,
    /// Mint a Guard-2 ticket and wait for approval.
    Ask,
    /// Refuse outright.
    Block,
}

/// The high-level operation classes the policy distinguishes. These are the
/// canonical names the executor tags an action with before calling
/// [`PermissionsPolicy::evaluate`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Operation {
    /// Delete file(s)/dir(s).
    DeleteFiles,
    /// Edit more than one file in a single step.
    MultiFileEdit { files: usize },
    /// Network request to a (possibly new) domain.
    ExternalNetwork { new_domain: bool },
    /// Shell command (Guard-1 flag carried in `destructive`).
    TerminalShell { destructive: bool },
    /// Sensitive web action (checkout/payment/account change).
    WebAction,
    /// Any other privileged mutation (write, exec, …).
    GenericWrite,
}

impl Operation {
    /// The canonical name (used by the TOML key + the ticket `operation`).
    pub fn name(&self) -> &'static str {
        match self {
            Operation::DeleteFiles => "delete",
            Operation::MultiFileEdit { .. } => "multi_file_edit",
            Operation::ExternalNetwork { .. } => "external_network",
            Operation::TerminalShell { .. } => "terminal_shell",
            Operation::WebAction => "web_action",
            Operation::GenericWrite => "write",
        }
    }
}

/// A parsed rule (the value of a `permissions` key).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Rule {
    AlwaysAsk,
    AlwaysAllow,
    Block,
    /// `ask_if_gt_N`: ask only when the count exceeds N.
    AskIfGt(u32),
    /// `ask_if_new_domain`: ask only when the domain is unseen.
    AskIfNewDomain,
    /// `ask_if_destructive`: ask only when the command is destructive.
    AskIfDestructive,
}

impl Rule {
    fn parse(s: &str) -> Option<Rule> {
        let t = s.trim();
        Some(match t {
            "always_ask" | "ask" => Rule::AlwaysAsk,
            "always_allow" | "allow" => Rule::AlwaysAllow,
            "block" | "deny" => Rule::Block,
            "ask_if_new_domain" => Rule::AskIfNewDomain,
            "ask_if_destructive" => Rule::AskIfDestructive,
            _ => {
                // ask_if_gt_N
                let n = t.strip_prefix("ask_if_gt_")?;
                return Some(Rule::AskIfGt(n.parse().ok()?));
            }
        })
    }

    fn evaluate(self, op: &Operation) -> PolicyAction {
        match (self, op) {
            (Rule::AlwaysAsk, _) => PolicyAction::Ask,
            (Rule::AlwaysAllow, _) => PolicyAction::Allow,
            (Rule::Block, _) => PolicyAction::Block,
            (Rule::AskIfGt(n), Operation::MultiFileEdit { files }) => {
                if *files > n as usize {
                    PolicyAction::Ask
                } else {
                    PolicyAction::Allow
                }
            }
            (Rule::AskIfGt(_), _) => PolicyAction::Allow,
            (Rule::AskIfNewDomain, Operation::ExternalNetwork { new_domain }) => {
                if *new_domain {
                    PolicyAction::Ask
                } else {
                    PolicyAction::Allow
                }
            }
            (Rule::AskIfNewDomain, _) => PolicyAction::Allow,
            (Rule::AskIfDestructive, Operation::TerminalShell { destructive }) => {
                if *destructive {
                    PolicyAction::Ask
                } else {
                    PolicyAction::Allow
                }
            }
            (Rule::AskIfDestructive, _) => PolicyAction::Allow,
        }
    }
}

/// Raw TOML shape (serde deserializes the `permissions` table).
#[derive(Debug, Clone, Default, Deserialize)]
struct RawPermissions {
    #[serde(default)]
    permissions: RawTable,
}

#[derive(Debug, Clone, Default, Deserialize)]
struct RawTable {
    delete_files: Option<String>,
    multi_file_edit: Option<String>,
    external_network: Option<String>,
    terminal_shell: Option<String>,
    web_action: Option<String>,
    write: Option<String>,
    min_confidence_for_auto: Option<f64>,
    #[serde(default)]
    user_feedback_learning: Option<bool>,
}

/// The evaluated, ready-to-consult policy.
#[derive(Debug, Clone)]
pub struct PermissionsPolicy {
    delete_files: Rule,
    multi_file_edit: Rule,
    external_network: Rule,
    terminal_shell: Rule,
    web_action: Rule,
    write: Rule,
    /// Below this confidence the auto path must ask.
    pub min_confidence_for_auto: f64,
    /// Approvals/denials feed the taste profile.
    pub user_feedback_learning: bool,
}

impl Default for PermissionsPolicy {
    fn default() -> Self {
        Self {
            delete_files: Rule::AlwaysAsk,
            multi_file_edit: Rule::AskIfGt(5),
            external_network: Rule::AskIfNewDomain,
            terminal_shell: Rule::AskIfDestructive,
            web_action: Rule::AlwaysAsk,
            write: Rule::AlwaysAsk,
            min_confidence_for_auto: 0.85,
            user_feedback_learning: true,
        }
    }
}

impl PermissionsPolicy {
    pub fn new() -> Self {
        Self::default()
    }

    /// Parse a `permissions.toml` document. Unknown keys and malformed rule
    /// strings fall back to the default (never panic, never over-grant).
    pub fn parse(doc: &str) -> Self {
        let Ok(raw) = toml::from_str::<RawPermissions>(doc) else {
            return Self::default();
        };
        let mut p = Self::default();
        let t = &raw.permissions;
        if let Some(s) = &t.delete_files {
            if let Some(r) = Rule::parse(s) {
                p.delete_files = r;
            }
        }
        if let Some(s) = &t.multi_file_edit {
            if let Some(r) = Rule::parse(s) {
                p.multi_file_edit = r;
            }
        }
        if let Some(s) = &t.external_network {
            if let Some(r) = Rule::parse(s) {
                p.external_network = r;
            }
        }
        if let Some(s) = &t.terminal_shell {
            if let Some(r) = Rule::parse(s) {
                p.terminal_shell = r;
            }
        }
        if let Some(s) = &t.web_action {
            if let Some(r) = Rule::parse(s) {
                p.web_action = r;
            }
        }
        if let Some(s) = &t.write {
            if let Some(r) = Rule::parse(s) {
                p.write = r;
            }
        }
        if let Some(m) = t.min_confidence_for_auto {
            p.min_confidence_for_auto = m.clamp(0.0, 1.0);
        }
        if let Some(u) = t.user_feedback_learning {
            p.user_feedback_learning = u;
        }
        p
    }

    /// Evaluate one operation under the policy. This is the executor's
    /// pre-flight: `Ask` means mint a ticket; `Block` means refuse; `Allow`
    /// means run (still subject to Guard-1).
    pub fn evaluate(&self, op: &Operation) -> PolicyAction {
        match op {
            Operation::DeleteFiles => self.delete_files.evaluate(op),
            Operation::MultiFileEdit { .. } => self.multi_file_edit.evaluate(op),
            Operation::ExternalNetwork { .. } => self.external_network.evaluate(op),
            Operation::TerminalShell { .. } => self.terminal_shell.evaluate(op),
            Operation::WebAction => self.web_action.evaluate(op),
            Operation::GenericWrite => self.write.evaluate(op),
        }
    }

    /// The auto path must ask when a model's reported confidence is below
    /// this threshold.
    pub fn auto_confidence_ok(&self, confidence: f64) -> bool {
        confidence >= self.min_confidence_for_auto
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_match_spec() {
        let p = PermissionsPolicy::default();
        assert_eq!(p.evaluate(&Operation::DeleteFiles), PolicyAction::Ask);
        assert_eq!(
            p.evaluate(&Operation::MultiFileEdit { files: 6 }),
            PolicyAction::Ask
        );
        assert_eq!(
            p.evaluate(&Operation::MultiFileEdit { files: 5 }),
            PolicyAction::Allow
        );
        assert_eq!(
            p.evaluate(&Operation::ExternalNetwork { new_domain: true }),
            PolicyAction::Ask
        );
        assert_eq!(
            p.evaluate(&Operation::ExternalNetwork { new_domain: false }),
            PolicyAction::Allow
        );
        assert_eq!(
            p.evaluate(&Operation::TerminalShell { destructive: true }),
            PolicyAction::Ask
        );
        assert_eq!(
            p.evaluate(&Operation::TerminalShell { destructive: false }),
            PolicyAction::Allow
        );
        assert_eq!(p.evaluate(&Operation::WebAction), PolicyAction::Ask);
        assert_eq!(p.min_confidence_for_auto, 0.85);
        assert!(p.user_feedback_learning);
    }

    #[test]
    fn parses_full_toml() {
        let doc = r#"
[permissions]
delete_files = "always_ask"
multi_file_edit = "ask_if_gt_3"
external_network = "allow"
terminal_shell = "block"
web_action = "always_ask"
min_confidence_for_auto = 0.90
user_feedback_learning = true
"#;
        let p = PermissionsPolicy::parse(doc);
        assert_eq!(p.evaluate(&Operation::DeleteFiles), PolicyAction::Ask);
        assert_eq!(
            p.evaluate(&Operation::MultiFileEdit { files: 4 }),
            PolicyAction::Ask
        );
        assert_eq!(
            p.evaluate(&Operation::MultiFileEdit { files: 3 }),
            PolicyAction::Allow
        );
        assert_eq!(
            p.evaluate(&Operation::ExternalNetwork { new_domain: true }),
            PolicyAction::Allow
        );
        assert_eq!(
            p.evaluate(&Operation::TerminalShell { destructive: true }),
            PolicyAction::Block
        );
        assert_eq!(p.min_confidence_for_auto, 0.90);
    }

    #[test]
    fn malformed_doc_falls_back_to_defaults() {
        let p = PermissionsPolicy::parse("not valid [ toml");
        assert_eq!(p.evaluate(&Operation::DeleteFiles), PolicyAction::Ask);
    }

    #[test]
    fn unknown_rule_string_falls_back_to_default() {
        let p = PermissionsPolicy::parse("[permissions]\ndelete_files = \"maybe_sometimes\"\n");
        // Unknown → keeps default always_ask.
        assert_eq!(p.evaluate(&Operation::DeleteFiles), PolicyAction::Ask);
    }

    #[test]
    fn confidence_threshold() {
        let p = PermissionsPolicy::default();
        assert!(p.auto_confidence_ok(0.86));
        assert!(!p.auto_confidence_ok(0.84));
    }
}
