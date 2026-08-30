//! Automation runtime (P6.4): binds blueprint step shapes to host engines.
//!
//! The runtime owns sequencing and approval semantics. Provider-specific search,
//! email, and calendar implementations are injected adapters; an absent
//! adapter fails explicitly instead of silently turning a scheduled step into
//! a successful no-op. `run_code` is backed by the `everyaios-script`
//! `ScriptSandbox` contract, so script primitives retain the normal host audit
//! and capability checks.

use everyaios_blueprint::{Automation, AutomationStep};
use everyaios_script::ScriptSandbox;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use thiserror::Error;

/// P48.3 — audit seam for connector/effect steps. The host backs this with the
/// same Merkle chain (`control::record_mutation(AuthKind::AutomationTicket,…)`)
/// so an `email`/`calendar` write executed by the runtime is attributable and
/// auditable exactly like every other effect. `automation_id`/`run_id` give the
/// actor attribution on the automation path (spec §4.3 precise-invariant).
pub trait AutomationAudit: Send + Sync {
    fn record(&self, step_index: usize, kind: &str, payload: Value);
}

/// Search cascade seam (G8). The implementation may be local/cache/live, but
/// the runtime only receives normalized results.
pub trait SearchEngine {
    fn search(&self, query: &str) -> Result<Value, String>;
}

/// Connector seam for email/calendar steps. Implementations must enforce their
/// provider-side idempotency and use the shared vault/guard boundary.
pub trait ConnectorEngine {
    fn email(&self, to: &[String], subject: &str, body: &str) -> Result<Value, String>;
    fn calendar(&self, title: &str, when: &str) -> Result<Value, String>;
}

/// One normalized step result. Results are kept small and can be persisted in
/// the scheduler checkpoint rather than copying provider payloads wholesale.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AutomationStepResult {
    pub index: usize,
    pub kind: String,
    pub output: Value,
}

/// A complete automation result.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AutomationRunResult {
    pub automation_id: String,
    pub steps: Vec<AutomationStepResult>,
}

#[derive(Debug, Error, PartialEq)]
pub enum AutomationError {
    #[error("automation has no steps")]
    Empty,
    #[error("run_code language `{0}` is not supported by the script engine")]
    UnsupportedLanguage(String),
    #[error("step {index} ({kind}) has no configured engine")]
    MissingEngine { index: usize, kind: String },
    #[error("step {index} ({kind}) failed: {message}")]
    StepFailed {
        index: usize,
        kind: String,
        message: String,
    },
    #[error("step {index} ({kind}) requires approval")]
    ApprovalRequired { index: usize, kind: String },
}

/// A sequential automation runner. The lifetime-bound references make the
/// dependency seams explicit and keep credentials out of the runtime object.
pub struct AutomationRuntime<'a> {
    pub script: Option<&'a dyn ScriptSandbox>,
    pub search: Option<&'a dyn SearchEngine>,
    pub connectors: Option<&'a dyn ConnectorEngine>,
    /// P48.3 — optional Merkle-chain audit hook (None until the host installs
    /// it via [`AutomationRuntime::with_audit`]).
    pub audit: Option<&'a dyn AutomationAudit>,
}

impl<'a> AutomationRuntime<'a> {
    pub fn new(
        script: Option<&'a dyn ScriptSandbox>,
        search: Option<&'a dyn SearchEngine>,
        connectors: Option<&'a dyn ConnectorEngine>,
    ) -> Self {
        Self {
            script,
            search,
            connectors,
            audit: None,
        }
    }

    /// Attach a Merkle-chain audit hook so connector writes and other
    /// effectful steps are attributable + auditable (spec §4.3 invariant).
    pub fn with_audit(mut self, audit: &'a dyn AutomationAudit) -> Self {
        self.audit = Some(audit);
        self
    }

    fn record(&self, index: usize, kind: &str, payload: Value) {
        if let Some(a) = self.audit {
            a.record(index, kind, payload);
        }
    }

    /// Execute steps in order. `approved` is a decision over this exact
    /// automation/version, not a reusable global connector permission.
    pub fn run(
        &self,
        automation: &Automation,
        approved: bool,
    ) -> Result<AutomationRunResult, AutomationError> {
        if automation.steps.is_empty() {
            return Err(AutomationError::Empty);
        }
        let mut results = Vec::with_capacity(automation.steps.len());
        for (index, step) in automation.steps.iter().enumerate() {
            let result = self.run_step(index, step, approved)?;
            results.push(result);
        }
        Ok(AutomationRunResult {
            automation_id: automation.id.clone(),
            steps: results,
        })
    }

    fn run_step(
        &self,
        index: usize,
        step: &AutomationStep,
        approved: bool,
    ) -> Result<AutomationStepResult, AutomationError> {
        match step {
            AutomationStep::RunCode { language, code } => {
                let language = language.to_ascii_lowercase();
                if !matches!(language.as_str(), "js" | "javascript" | "ts" | "typescript") {
                    return Err(AutomationError::UnsupportedLanguage(language));
                }
                let script = self.script.ok_or_else(|| AutomationError::MissingEngine {
                    index,
                    kind: "run_code".into(),
                })?;
                let raw = script.eval(code).map_err(|e| AutomationError::StepFailed {
                    index,
                    kind: "run_code".into(),
                    message: e.to_string(),
                })?;
                let output = serde_json::from_str(&raw).unwrap_or(Value::String(raw));
                Ok(AutomationStepResult {
                    index,
                    kind: "run_code".into(),
                    output,
                })
            }
            AutomationStep::OnlineSearch { query } => {
                let search = self.search.ok_or_else(|| AutomationError::MissingEngine {
                    index,
                    kind: "online_search".into(),
                })?;
                let output =
                    search
                        .search(query)
                        .map_err(|message| AutomationError::StepFailed {
                            index,
                            kind: "online_search".into(),
                            message,
                        })?;
                Ok(AutomationStepResult {
                    index,
                    kind: "online_search".into(),
                    output,
                })
            }
            AutomationStep::Email { to, subject, body } => {
                self.require_approval(index, "email", approved)?;
                let connectors = self
                    .connectors
                    .ok_or_else(|| AutomationError::MissingEngine {
                        index,
                        kind: "email".into(),
                    })?;
                let output = connectors.email(to, subject, body).map_err(|message| {
                    AutomationError::StepFailed {
                        index,
                        kind: "email".into(),
                        message,
                    }
                })?;
                // P48.3 — connector writes ride the same Merkle chain via the
                // host audit hook (AutomationTicket provenance, §4.3).
                self.record(
                    index,
                    "automation.email_sent",
                    serde_json::json!({ "to": to, "subject": subject, "step": "email" }),
                );
                Ok(AutomationStepResult {
                    index,
                    kind: "email".into(),
                    output,
                })
            }
            AutomationStep::Calendar { title, when } => {
                self.require_approval(index, "calendar", approved)?;
                let connectors = self
                    .connectors
                    .ok_or_else(|| AutomationError::MissingEngine {
                        index,
                        kind: "calendar".into(),
                    })?;
                let output = connectors.calendar(title, when).map_err(|message| {
                    AutomationError::StepFailed {
                        index,
                        kind: "calendar".into(),
                        message,
                    }
                })?;
                // P48.3 — calendar writes are audited on the same Merkle chain.
                self.record(
                    index,
                    "automation.calendar_created",
                    serde_json::json!({ "title": title, "when": when, "step": "calendar" }),
                );
                Ok(AutomationStepResult {
                    index,
                    kind: "calendar".into(),
                    output,
                })
            }
        }
    }

    fn require_approval(
        &self,
        index: usize,
        kind: &str,
        approved: bool,
    ) -> Result<(), AutomationError> {
        if approved {
            Ok(())
        } else {
            Err(AutomationError::ApprovalRequired {
                index,
                kind: kind.into(),
            })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    struct FakeScript;
    impl ScriptSandbox for FakeScript {
        fn eval(&self, code: &str) -> Result<String, everyaios_script::SandboxError> {
            Ok(format!(r#"{{"result":"{code}"}}"#))
        }
        fn limits(&self) -> everyaios_script::SandboxLimits {
            everyaios_script::SandboxLimits::default()
        }
    }

    struct FakeSearch;
    impl SearchEngine for FakeSearch {
        fn search(&self, query: &str) -> Result<Value, String> {
            Ok(serde_json::json!({"query": query, "results": 1}))
        }
    }

    struct FakeConnectors;
    impl ConnectorEngine for FakeConnectors {
        fn email(&self, to: &[String], subject: &str, _body: &str) -> Result<Value, String> {
            Ok(serde_json::json!({"to": to, "subject": subject}))
        }
        fn calendar(&self, title: &str, when: &str) -> Result<Value, String> {
            Ok(serde_json::json!({"title": title, "when": when}))
        }
    }

    #[test]
    fn binds_code_and_search_engines_in_order() {
        let script = FakeScript;
        let search = FakeSearch;
        let runtime = AutomationRuntime::new(Some(&script), Some(&search), None);
        let automation = Automation::new("a", "research", everyaios_blueprint::Trigger::Manual)
            .step(AutomationStep::RunCode {
                language: "js".into(),
                code: "1 + 1".into(),
            })
            .step(AutomationStep::OnlineSearch {
                query: "rust".into(),
            });
        let result = runtime.run(&automation, false).unwrap();
        assert_eq!(result.steps.len(), 2);
        assert_eq!(result.steps[1].output["query"], "rust");
    }

    #[test]
    fn connector_mutations_require_exact_run_approval() {
        let connectors = FakeConnectors;
        let runtime = AutomationRuntime::new(None, None, Some(&connectors));
        let automation = Automation::new("a", "mail", everyaios_blueprint::Trigger::Manual).step(
            AutomationStep::Email {
                to: vec!["a@example.test".into()],
                subject: "hello".into(),
                body: "body".into(),
            },
        );
        assert_eq!(
            runtime.run(&automation, false),
            Err(AutomationError::ApprovalRequired {
                index: 0,
                kind: "email".into()
            })
        );
        assert!(runtime.run(&automation, true).is_ok());
    }

    #[test]
    fn connector_writes_emit_audit_when_hook_attached() {
        use std::sync::Mutex;
        use std::sync::Arc;

        #[derive(Default)]
        struct FakeAudit(Arc<Mutex<Vec<String>>>);
        impl AutomationAudit for FakeAudit {
            fn record(&self, _index: usize, kind: &str, _payload: Value) {
                self.0.lock().unwrap().push(kind.to_string());
            }
        }

        let connectors = FakeConnectors;
        let audit = FakeAudit::default();
        let events = Arc::clone(&audit.0);
        let runtime = AutomationRuntime::new(None, None, Some(&connectors)).with_audit(&audit);
        let automation = Automation::new("a", "mail", everyaios_blueprint::Trigger::Manual)
            .step(AutomationStep::Email {
                to: vec!["a@example.test".into()],
                subject: "hello".into(),
                body: "body".into(),
            })
            .step(AutomationStep::Calendar {
                title: "Standup".into(),
                when: "2026-09-01T09:00Z".into(),
            });
        assert!(runtime.run(&automation, true).is_ok());
        let ev = events.lock().unwrap();
        assert_eq!(ev.as_slice(), &["automation.email_sent", "automation.calendar_created"]);
    }

    #[test]
    fn missing_engine_and_unsupported_language_are_explicit() {
        let runtime = AutomationRuntime::new(None, None, None);
        let code = Automation::new("a", "py", everyaios_blueprint::Trigger::Manual).step(
            AutomationStep::RunCode {
                language: "py".into(),
                code: "print(1)".into(),
            },
        );
        assert_eq!(
            runtime.run(&code, false),
            Err(AutomationError::UnsupportedLanguage("py".into()))
        );
        let search = Automation::new("b", "search", everyaios_blueprint::Trigger::Manual)
            .step(AutomationStep::OnlineSearch { query: "x".into() });
        assert_eq!(
            runtime.run(&search, false),
            Err(AutomationError::MissingEngine {
                index: 0,
                kind: "online_search".into()
            })
        );
    }
}
